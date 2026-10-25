/**
 * config/plan-features-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAN FEATURES MANAGER — Commercial plan tier gating & feature flags.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Governs commercial page-level access based on the salon's purchased plan
 *   tier. ALL plan names, plan IDs, and feature keys are resolved exclusively
 *   from the Supabase backend:
 *     - public.plans         → plan_id, plan_name
 *     - public.plan_features → plan_id, feature_key (one row per feature)
 *
 *   No plan names, plan IDs, or feature lists are hardcoded here.
 *   The DB is the single source of truth.
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 1: Subscription State Manager (Is the salon account active or expired?)
 *   - Gate 2: In-App RBAC Manager (What is this user's role, and what are they permitted to do?)
 *   - Gate 3: PLAN FEATURES MANAGER (Did the salon purchase the plan tier that includes this page?)
 *
 * HOW PLAN RESOLUTION WORKS:
 *   1. plan_id is read from appContext.company.plan_id (set by auth guard from companies table)
 *   2. Features are fetched from public.plan_features WHERE plan_id = resolved_plan_id
 *   3. plan_name is fetched from public.plans if not already in context
 *   4. Results are cached in sessionStorage for 5 minutes
 *
 * SECTIONS:
 *   1. CACHE CONFIG
 *   2. CONTEXT RESOLVER  — Reads plan_id / plan_name from appContext
 *   3. DATABASE FETCHERS — Queries plans + plan_features tables
 *   4. MAIN ASYNC RESOLVER — getCurrentPlanFeatures (with sessionStorage cache)
 *   5. SYNC RESOLVER     — getCurrentPlanFeaturesSync (reads cache only)
 *   6. EVALUATION HELPERS
 *   7. UPGRADE MODAL     — Dynamic messaging, no hardcoded tier names
 *   8. CACHE UTILS + DB WRITER + EXPORTS
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CACHE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_CACHE_STORAGE_KEY = 'salon_plan_features_cache';
const PLAN_CACHE_TTL_MS      = 5 * 60 * 1000; // 5-minute sessionStorage TTL


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — CONTEXT RESOLVER
// Reads plan_id, plan_name, and company_id from localStorage appContext.
// The appContext is written by global-auth-guard.js during cold start.
// Priority for plan_id:   appContext.company.plan_id  > localStorage 'plan_id'
// Priority for plan_name: appContext.company.plan_name > appContext.company.plan > localStorage 'plan_name'
// ─────────────────────────────────────────────────────────────────────────────


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

function resolveCurrentPlanMeta() {
    try {
        const ctx     = JSON.parse(localStorage.getItem('appContext') || '{}');
        const company = ctx.company || {};

        // plan_id: DB value from auth guard takes priority
        const planId    = company.plan_id    || localStorage.getItem('plan_id')    || null;
        // plan_name: DB value takes priority; 'plan' is the legacy key written by the old auth guard
        const planName  = company.plan_name  || company.plan || localStorage.getItem('plan_name') || null;
        // company_id: check both keys the auth guard may write
        const companyId = company.company_id || company.id   || localStorage.getItem('company_id') || null;

        return { planId, planName, companyId };
    } catch {
        return {
            planId:    localStorage.getItem('plan_id')    || null,
            planName:  localStorage.getItem('plan_name')  || null,
            companyId: localStorage.getItem('company_id') || null
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — DATABASE FETCHERS
// All plan data comes exclusively from Supabase — nothing is hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches plan_name from public.plans for a given plan_id.
 * Used to hydrate the plan name when it is missing from appContext.
 *
 * @param {string} planId
 * @returns {Promise<string|null>}
 */
async function fetchPlanNameFromDb(planId) {
    if (!planId) return null;
    try {
        const { data, error } = await supabase
            .from('plans')
            .select('plan_name')
            .eq('plan_id', planId)
            .maybeSingle();
        if (error) {
            console.warn('[PlanFeaturesManager] Error fetching plan name:', error);
            return null;
        }
        return data?.plan_name || null;
    } catch (err) {
        console.warn('[PlanFeaturesManager] Exception fetching plan name:', err);
        return null;
    }
}

/**
 * Queries Supabase public.plan_features for the plan's feature rows.
 * The table stores one row per feature (feature_key string).
 * Returns deduplicated feature key array — or [] if DB query fails.
 *
 * @param {string} planId
 * @returns {Promise<string[]>}
 */
async function fetchPlanFeaturesFromDb(planId) {
    if (!planId) return [];
    try {
        const { data, error } = await supabase
            .from('plan_features')
            .select('feature_key')
            .eq('plan_id', planId);

        if (error) {
            console.warn('[PlanFeaturesManager] Error querying plan_features:', error);
            return [];
        }
        return parsePlanFeatureKeys(data || []);
    } catch (err) {
        console.warn('[PlanFeaturesManager] Exception querying plan_features:', err);
        return [];
    }
}

/**
 * Full sync writer: replaces all feature rows for a plan.
 * Deletes existing rows then inserts one row per feature key.
 * This matches the one-row-per-feature schema of public.plan_features.
 *
 * @param {string} planId - UUID of the plan
 * @param {string[]} featureKeys - Array of feature key strings
 */
export async function syncPlanFeaturesToDb(planId, featureKeys) {
    if (!planId) throw new Error('Missing planId');

    // 1. Delete all existing rows for this plan
    const { error: deleteErr } = await supabase
        .from('plan_features')
        .delete()
        .eq('plan_id', planId);
    if (deleteErr) throw deleteErr;

    // 2. Insert one row per feature key
    if (featureKeys && featureKeys.length > 0) {
        const rows = featureKeys.map(key => ({ plan_id: planId, feature_key: key }));
        const { error: insertErr } = await supabase
            .from('plan_features')
            .insert(rows);
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
 * Fully dynamic — no hardcoded tier names, all messaging based on feature key.
 *
 * @param {string} featureKey - Locked feature key
 * @returns {Object} { featureKey, category, upgradeUrl, promptTitle, promptMessage }
 */
export function getPlanUpgradeMetadata(featureKey) {
    const friendlyName = featureKey
        ? featureKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : 'This Module';

    return {
        featureKey,
        category:      friendlyName,
        upgradeUrl:    'plans.html?flow=upgrade',
        promptTitle:   'Upgrade Your Plan',
        promptMessage: `${friendlyName} is not included in your current plan. Upgrade to a higher tier to unlock this feature for your salon.`
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
    // 1. Return cached profile if still valid
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

    // 2. Resolve plan meta from appContext / localStorage
    let { planId, planName, companyId } = resolveCurrentPlanMeta();

    // 3. Fetch features from DB — this is the ONLY source of truth; no hardcoded fallback
    const features = planId ? await fetchPlanFeaturesFromDb(planId) : [];

    // 4. Fetch plan_name from public.plans if still unknown
    if (!planName && planId) {
        planName = await fetchPlanNameFromDb(planId);
    }

    const resolvedName = planName || 'Unknown Plan';
    const isEnterprise = resolvedName.toLowerCase().includes('enterprise');

    const profile = {
        planId,
        planName:    resolvedName,
        companyId,
        features,
        featuresSet: new Set(features),
        isEnterprise,
        dbLoaded:    true
    };

    // 5. Persist to sessionStorage (Set is not JSON-serializable)
    try {
        sessionStorage.setItem(PLAN_CACHE_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            profile: {
                planId:       profile.planId,
                planName:     profile.planName,
                companyId:    profile.companyId,
                features:     profile.features,
                isEnterprise: profile.isEnterprise,
                dbLoaded:     profile.dbLoaded
            }
        }));
    } catch { /* Non-blocking */ }

    return profile;
}

/**
 * Synchronous resolver using cached plan features.
 * Returns cached profile from sessionStorage — never hits the DB.
 * If cache is absent, returns a safe empty-feature profile.
 * Does NOT use any hardcoded plan matrices.
 *
 * @returns {Object} Cached plan profile
 */
export function getCurrentPlanFeaturesSync() {
    try {
        const rawCache = sessionStorage.getItem(PLAN_CACHE_STORAGE_KEY);
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            if (parsed?.profile) {
                // Rebuild Set (not JSON-serializable)
                parsed.profile.featuresSet = new Set(parsed.profile.features || []);
                return parsed.profile;
            }
        }
    } catch { /* fall through */ }

    // Cache miss — return safe empty profile
    // The auth guard always calls the async getCurrentPlanFeatures() on cold start,
    // so this sync path only triggers on subsequent in-page calls.
    const { planId, planName, companyId } = resolveCurrentPlanMeta();
    return {
        planId:      planId    || null,
        planName:    planName  || 'Unknown',
        companyId:   companyId || null,
        features:    [],
        featuresSet: new Set(),
        isEnterprise: false,
        dbLoaded:    false
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
