/**
 * config/plan-features-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAN FEATURES MANAGER (Zero-Trust Backend Thin Client)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 3: Evaluates commercial plan features based on authoritative session
 *     context returned directly by the database RPC `get_session_context()`.
 *   - All plan feature mappings are stored in PostgreSQL (`public.plan_features`)
 *     and checked by database procedures (`shared.check_plan_feature`).
 *   - Write mutations are checked at the database layer on every RPC.
 *   - This file provides client-side UI paywall checks (`isFeatureUnlocked`)
 *     and renders the upgrade modal when a user clicks a locked feature.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const PLAN_CACHE_STORAGE_KEY = 'salon_plan_features_cache';
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

export const ALL_APP_FEATURES = Object.values(FEATURES);

/**
 * Safely parses single-row JSON string array from `public.plan_features`.
 */
export function parsePlanFeatureKeys(rows) {
    const list = [];
    (rows || []).forEach(r => {
        if (!r) return;
        const raw = String(r.feature_key || r).trim();
        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) list.push(...parsed);
            } catch (_) { list.push(raw); }
        } else if (raw.includes(',')) {
            list.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
        } else {
            list.push(raw);
        }
    });
    return [...new Set(list)];
}

/**
 * Atomic Single-Row Writer: Saves all feature keys for a plan into a single row.
 */
export async function syncPlanFeaturesToDb(planId, featureKeys) {
    if (!planId) throw new Error('Missing planId');

    const { data: rpcRes, error } = await supabase.rpc('sync_plan_features_atomic', {
        p_plan_id:      planId,
        p_feature_keys: featureKeys || []
    });

    if (error) throw error;
    if (rpcRes && rpcRes.success === false) throw new Error(rpcRes.message || 'Failed to sync plan features');
}

/**
 * Evaluates whether a given feature key is included in the plan features list.
 */
export function evaluatePlanFeature(featureKey, planFeatures = []) {
    if (!featureKey) return true;
    if (!Array.isArray(planFeatures) || planFeatures.length === 0) return false;
    return planFeatures.includes(featureKey);
}

/**
 * Returns upgrade prompt metadata for a feature.
 */
export function getPlanUpgradeMetadata(featureKey) {
    const marketingFeatures = [
        FEATURES.MARKETING_OFFERS,
        FEATURES.MARKETING_COUPONS,
        FEATURES.MARKETING_MEMBERSHIPS,
        FEATURES.SETTINGS_INVOICE_MEMBERSHIP
    ];
    const advancedReportFeatures = [
        FEATURES.REPORT_BOOKINGS,
        FEATURES.REPORT_CUSTOMERS,
        FEATURES.REPORT_PRODUCT_SALES,
        FEATURES.REPORT_DISCOUNT_USAGES,
        FEATURES.REPORT_MEMBERSHIPS
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

    if (advancedReportFeatures.includes(featureKey)) {
        minimumPlan = 'Advance';
        category = 'Advanced Reports Library';
        promptTitle = `Upgrade to ${minimumPlan} Plan`;
        promptMessage = `This report is part of the ${minimumPlan} Plan. Upgrade today to unlock advanced report analytics for your salon.`;
    } else if (marketingFeatures.includes(featureKey)) {
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

/**
 * Master async resolver: queries `get_session_context` and caches active plan features.
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
        } catch (_) {}
    }

    try {
        const { data: sessionCtx, error: ctxErr } = await supabase.rpc('get_session_context');
        if (!ctxErr && sessionCtx) {
            const features = Array.isArray(sessionCtx.plan_features) ? sessionCtx.plan_features : [];
            const profile = {
                planId: sessionCtx.company?.plan_id || null,
                planName: sessionCtx.company?.plan_name || 'Standard Plan',
                companyId: sessionCtx.company?.company_id || null,
                features: features
            };

            try {
                sessionStorage.setItem(PLAN_CACHE_STORAGE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    profile
                }));
            } catch (_) {}

            return profile;
        }
    } catch (err) {
        console.warn('[PlanFeaturesManager] Error querying session context:', err);
    }

    return getCurrentPlanFeaturesSync();
}

/**
 * Synchronous plan features getter from session or local storage.
 */
export function getCurrentPlanFeaturesSync() {
    try {
        const rawCache = sessionStorage.getItem(PLAN_CACHE_STORAGE_KEY);
        if (rawCache) {
            return JSON.parse(rawCache).profile;
        }
        const stateStr = localStorage.getItem('planFeatures');
        if (stateStr) {
            return JSON.parse(stateStr);
        }
    } catch (_) {}

    return {
        planId: null,
        planName: 'Growth',
        companyId: null,
        features: ALL_APP_FEATURES
    };
}

/**
 * Checks if a specific feature is unlocked under the salon's current plan.
 */
export function isFeatureUnlocked(featureKey, optionalProfile = null) {
    const profile = optionalProfile || getCurrentPlanFeaturesSync();
    return evaluatePlanFeature(featureKey, profile.features);
}

export function canAccessPageUnderPlan(featureKey) {
    return isFeatureUnlocked(featureKey);
}

/**
 * Renders modal prompting user to upgrade when clicking a paywalled feature.
 */
export function showPlanUpgradeModal(featureKey) {
    const meta = getPlanUpgradeMetadata(featureKey);

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

export function clearPlanFeaturesCache() {
    try {
        sessionStorage.removeItem(PLAN_CACHE_STORAGE_KEY);
    } catch (_) {}
}

export const resolvePlanFeatures = getCurrentPlanFeatures;
