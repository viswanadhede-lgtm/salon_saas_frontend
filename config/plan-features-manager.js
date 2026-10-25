/**
 * config/plan-features-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAN FEATURES MANAGER — Commercial plan tier gating & feature flags.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Governs commercial page-level access based on the salon's purchased plan
 *   tier from `public.plans` and `public.plan_features` tables.
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 1: Subscription State Manager (Is the salon account active or expired?)
 *   - Gate 2: In-App RBAC Manager (What is this user's role, and what are they permitted to do?)
 *   - Gate 3: PLAN FEATURES MANAGER (Did the salon purchase the plan tier that includes this page?)
 *
 * STORAGE PATTERN:
 *   Reads and writes to the unified single-row `public.plan_features` schema
 *   where all allowed feature keys for a plan are stored as a JSON stringified
 *   array in the `feature_key` column (e.g. '["dashboard_access", "pos_system", ...]').
 *
 * SECTIONS:
 *   1. PLAN TIERS & DEFAULT MATRICES — Baseline feature sets per tier.
 *   2. DATABASE RESOLVER & CACHE     — Single-row loader & sessionStorage caching.
 *   3. PLAN EVALUATION LOGIC         — Feature inclusion & upgrade prompt metadata.
 *   4. INTEGRATION & EXPORT API      — Public helpers (isFeatureUnlocked, showPlanUpgradeModal).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const PLAN_CACHE_STORAGE_KEY = 'salon_plan_features_cache';
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — FEATURE CATALOG
// Complete master list of all application features, sourced from the feature
// registry. Permissions are resolved dynamically from `public.plan_features`
// at runtime — no hardcoded plan names or UUIDs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Universal catalog of every feature the app can expose.
 * Which features a salon can ACCESS is determined solely by the rows in
 * `public.plan_features` that match the salon's active plan_id.
 */
export const ALL_APP_FEATURES = Object.values(FEATURES);


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — DATABASE RESOLVER & FAST SESSION CACHE
// Reads and writes to the single JSON row in `public.plan_features`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parses single-row JSON string array from `public.plan_features`.
 */
export function parsePlanFeatureKeys(rows) {
    const list = [];
    (rows || []).forEach(r => {
        if (!r || !r.feature_key) return;
        const raw = String(r.feature_key).trim();
        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) list.push(...parsed);
            } catch { list.push(raw); }
        } else if (raw.includes(',')) {
            list.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
        } else {
            list.push(raw);
        }
    });
    return [...new Set(list)];
}

/**
 * Resolves current company's plan_id and plan_name from session/storage.
 */
function resolveCurrentPlanMeta() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const planId = ctx.company?.plan_id || localStorage.getItem('plan_id') || null;
        const planName = ctx.company?.plan_name || localStorage.getItem('plan_name') || null;
        const companyId = ctx.company?.id || localStorage.getItem('company_id') || null;

        return { planId, planName, companyId };
    } catch {
        return {
            planId: localStorage.getItem('plan_id') || null,
            planName: localStorage.getItem('plan_name') || null,
            companyId: localStorage.getItem('company_id') || null
        };
    }
}

/**
 * Queries Supabase `public.plan_features` for the plan's single feature row.
 */
async function fetchPlanFeaturesFromDb(planId) {
    if (!planId) return null;

    try {
        const { data, error } = await supabase
            .from('plan_features')
            .select('plan_id, feature_key')
            .eq('plan_id', planId);

        if (error) {
            console.warn('[PlanFeaturesManager] Error querying plan_features:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.warn('[PlanFeaturesManager] Exception querying plan_features:', err);
        return null;
    }
}

/**
 * Atomic Single-Row Writer: Saves all feature keys for a plan into a single row.
 * Call this when configuring or creating plans in the admin panel.
 *
 * @param {string} planId - UUID of the plan
 * @param {Array<string>} featureKeys - Array of feature keys from FEATURES
 */
export async function syncPlanFeaturesToDb(planId, featureKeys) {
    if (!planId) throw new Error('Missing planId');

    const jsonFeatures = JSON.stringify(featureKeys || []);

    // 1. Check if a single row already exists
    const { data: existingRows } = await supabase
        .from('plan_features')
        .select('id')
        .eq('plan_id', planId);

    if (existingRows && existingRows.length > 0) {
        // 2a. Update the primary single row
        const primaryId = existingRows[0].id;
        const { error: updateErr } = await supabase
            .from('plan_features')
            .eq('id', primaryId)
            .update({
                feature_key: jsonFeatures
            });

        if (updateErr) throw updateErr;

        // Clean up legacy multi-rows if any existed
        if (existingRows.length > 1) {
            const extraIds = existingRows.slice(1).map(r => r.id);
            await supabase.from('plan_features').in('id', extraIds).delete();
        }
    } else {
        // 2b. Insert single row
        const { error: insertErr } = await supabase
            .from('plan_features')
            .insert({
                plan_id: planId,
                feature_key: jsonFeatures
            });

        if (insertErr) throw insertErr;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PLAN EVALUATION LOGIC
// Checks if a feature is unlocked, and generates upgrade prompt metadata.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether a given feature key is included in the allowed features list.
 *
 * @param {string} featureKey - Key from FEATURES
 * @param {Array<string>} planFeatures - Array of allowed features for the plan
 * @returns {boolean} True if unlocked, false if locked
 */
export function evaluatePlanFeature(featureKey, planFeatures = []) {
    if (!featureKey) return true;
    if (!Array.isArray(planFeatures) || planFeatures.length === 0) return false;

    return planFeatures.includes(featureKey);
}

/**
 * Returns user-friendly metadata for triggering an Upgrade Modal when a feature is locked.
 *
 * @param {string} featureKey - Locked feature key
 * @returns {Object} { featureTitle, minimumPlan, upgradeUrl }
 */
export function getPlanUpgradeMetadata(featureKey) {
    const marketingFeatures = [
        FEATURES.MARKETING_OFFERS,
        FEATURES.MARKETING_COUPONS,
        FEATURES.MARKETING_MEMBERSHIPS
    ];
    const analyticsFeatures = [
        FEATURES.REPORTS_ACCESS,
        FEATURES.REPORTS_CATEGORY,
        FEATURES.REPORTS_DETAIL,
        FEATURES.ANALYTICS_EXPENSES
    ];

    let minimumPlan = 'Advance';
    let category = 'Premium Module';
    let upgradeUrl = 'plans.html?flow=upgrade';
    let promptTitle = `Upgrade to ${minimumPlan} Plan`;
    let promptMessage = `This module is part of the ${minimumPlan} Plan. Upgrade today to unlock ${category} for your salon.`;

    if (marketingFeatures.includes(featureKey)) {
        minimumPlan = 'Advance';
        category = 'Marketing & Growth Suite';
        promptTitle = `Upgrade to ${minimumPlan} Plan`;
        promptMessage = `This module is part of the ${minimumPlan} Plan. Upgrade today to unlock ${category} for your salon.`;
    } else if (analyticsFeatures.includes(featureKey)) {
        minimumPlan = 'Advance';
        category = 'Advanced Analytics & Financial Reporting';
        promptTitle = `Upgrade to ${minimumPlan} Plan`;
        promptMessage = `This module is part of the ${minimumPlan} Plan. Upgrade today to unlock ${category} for your salon.`;
    }

    return {
        featureKey,
        category,
        minimumPlan,
        upgradeUrl,
        promptTitle,
        promptMessage
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — INTEGRATION & EXPORT API
// Public methods used across UI templates, modals, and the Global Auth Guard.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master async resolver: returns the active salon's plan features profile.
 * Reads from sessionStorage cache when valid, hits Supabase when expired or forced.
 *
 * @param {boolean} forceRefresh - If true, bypasses sessionStorage cache
 * @returns {Promise<Object>} Evaluated plan features profile
 */
export async function getCurrentPlanFeatures(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const rawCache = sessionStorage.getItem(PLAN_CACHE_STORAGE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache);
                if (parsed.timestamp && (Date.now() - parsed.timestamp < PLAN_CACHE_TTL_MS)) {
                    return parsed.profile;
                }
            }
        } catch { /* Cache read error: fall through */ }
    }

    const { planId, planName, companyId } = resolveCurrentPlanMeta();
    let features = [];

    // 1. Try querying DB for custom single-row feature assignments
    if (planId) {
        const rows = await fetchPlanFeaturesFromDb(planId);
        if (rows && rows.length > 0) {
            features = parsePlanFeatureKeys(rows);
        }
    }

    // If DB returned no features, the plan has no permissions configured yet.
    // features stays [] — the auth guard will treat all modules as locked.

    const profile = {
        planId,
        planName: planName || 'Basic Plan',
        companyId,
        features,
        featuresSet: new Set(features),
        isEnterprise: (planName || '').toLowerCase().includes('enterprise')
    };

    // Cache in sessionStorage
    try {
        sessionStorage.setItem(PLAN_CACHE_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            profile: {
                planId: profile.planId,
                planName: profile.planName,
                companyId: profile.companyId,
                features: profile.features,
                isEnterprise: profile.isEnterprise
            }
        }));
    } catch { /* Non-blocking */ }

    return profile;
}

/**
 * Synchronous resolver using cached plan features.
 * Ideal for template rendering and click handlers.
 * @returns {Object} Cached plan profile
 */
export function getCurrentPlanFeaturesSync() {
    try {
        const rawCache = sessionStorage.getItem(PLAN_CACHE_STORAGE_KEY);
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            return parsed.profile;
        }
    } catch { /* fall through */ }

    // No valid cache — return empty profile (cold start, pending DB resolution via getCurrentPlanFeatures)
    return {
        planId: localStorage.getItem('plan_id') || null,
        planName: localStorage.getItem('plan_name') || null,
        features: [],
        isEnterprise: false
    };
}

/**
 * Checks if a specific feature is unlocked under the salon's current plan.
 *
 * @param {string} featureKey - Key from FEATURES
 * @param {Object} [optionalProfile] - Pre-loaded profile to avoid cache lookup
 * @returns {boolean} True if unlocked, false if locked behind paywall
 */
export function isFeatureUnlocked(featureKey, optionalProfile = null) {
    const profile = optionalProfile || getCurrentPlanFeaturesSync();
    if (profile.isEnterprise) return true;

    return evaluatePlanFeature(featureKey, profile.features);
}

/**
 * Checks if a specific application route or page is accessible under the plan.
 * @param {string} featureKey - Key from FEATURES
 * @returns {boolean} True if route is unlocked
 */
export function canAccessPageUnderPlan(featureKey) {
    return isFeatureUnlocked(featureKey);
}

/**
 * Renders an elegant Upgrade Modal when a user attempts to access a plan-locked module.
 *
 * @param {string} featureKey - The feature key that triggered the upgrade prompt
 */
export function showPlanUpgradeModal(featureKey) {
    const meta = getPlanUpgradeMetadata(featureKey);

    // Remove existing modal if present
    const existing = document.getElementById('plan-upgrade-gate-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'plan-upgrade-gate-modal';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;
    `;

    overlay.innerHTML = `
        <div style="background: #ffffff; border-radius: 12px; max-width: 440px; width: 90%; padding: 28px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 26px;">
                ⭐
            </div>
            <h3 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #111827;">${meta.promptTitle}</h3>
            <p style="margin: 0 0 24px; font-size: 14px; color: #4b5563; line-height: 1.5;">${meta.promptMessage}</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btnClosePlanGateModal" style="padding: 10px 18px; border-radius: 6px; border: 1px solid #d1d5db; background: #ffffff; color: #374151; font-size: 14px; font-weight: 500; cursor: pointer;">
                    Cancel
                </button>
                <a href="${meta.upgradeUrl}" style="padding: 10px 20px; border-radius: 6px; border: none; background: #6366f1; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;">
                    View Upgrade Plans
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('btnClosePlanGateModal').addEventListener('click', () => {
        overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * Clears the plan features session cache.
 * Call this immediately after an upgrade or subscription tier change.
 */
export function clearPlanFeaturesCache() {
    try {
        sessionStorage.removeItem(PLAN_CACHE_STORAGE_KEY);
    } catch { /* Non-blocking */ }
}

// Backward-compatible export alias for Global Auth Guard
export const resolvePlanFeatures = getCurrentPlanFeatures;
