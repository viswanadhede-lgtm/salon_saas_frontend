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
// SECTION 1 — PLAN TIERS & DEFAULT MATRICES
// Baseline feature assignments per commercial tier.
// ─────────────────────────────────────────────────────────────────────────────
export const PLAN_NAMES = {
    BASIC:      'Basic',
    ADVANCE:    'Advance',
    ENTERPRISE: 'Enterprise'
};

// Known default Plan UUIDs (used as fallbacks during cold start)
export const PLAN_IDS = {
    BASIC:      'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce',
    ADVANCE:    'b42bcd41-217a-4ddb-9451-20e040984277',
    ENTERPRISE: 'c51ade32-108a-4efb-8321-31f050893188'
};

/**
 * Universal catalog: all 44 application features.
 */
export const ALL_APP_FEATURES = Object.values(FEATURES);

/**
 * Baseline feature matrix per commercial tier.
 * Once a page is included in a plan, the salon has complete access to that page.
 */
export const DEFAULT_PLAN_MATRICES = {

    // ── BASIC / STARTER: Core salon management for single-location salons ─────
    [PLAN_NAMES.BASIC]: [
        // Sidebar Pages (Group A)
        FEATURES.DASHBOARD_ACCESS,                     // 1.  dashboard.html
        FEATURES.BOOKINGS_MANAGEMENT,                  // 2.  bookings.html
        FEATURES.CUSTOMERS_MANAGEMENT,                 // 3.  customers.html
        FEATURES.STAFF_MANAGEMENT,                     // 4.  staff.html
        FEATURES.STAFF_SCHEDULES,                      // 5.  staff-schedule.html
        FEATURES.SERVICES_MANAGEMENT,                  // 6.  services.html
        FEATURES.POS_SYSTEM,                           // 7.  pos.html
        FEATURES.PRODUCT_MANAGEMENT,                   // 8.  products.html
        FEATURES.SALES_HISTORY,                        // 9.  sales-history.html
        FEATURES.PENDING_PAYMENTS,                     // 10. pending-payments.html
        FEATURES.PAYMENTS_HISTORY,                     // 11. payments-history.html
        FEATURES.ANALYTICS_OVERVIEW,                   // 16. overview.html
        FEATURES.COMPANY_SETTINGS,                     // 19. company.html
        FEATURES.USER_MANAGEMENT,                      // 20. users.html
        FEATURES.ROLES_PERMISSIONS,                    // 21. roles-permissions.html
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT,      // 22. billing-subscription.html

        // Sub-Pages (Group B)
        FEATURES.DASHBOARD_TODAYS_REVENUE,             // 23. todays-revenue.html
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,      // 24. upcoming-appointments.html
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,     // 25. completed-appointments.html
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,     // 26. no-shows-cancellations.html
        FEATURES.BRANCH_MANAGEMENT,                    // 29. branches.html (single branch)
        FEATURES.SETTINGS_BUSINESS,                    // 30. settings-business.html
        FEATURES.SETTINGS_CONTACT,                     // 31. settings-contact.html
        FEATURES.SETTINGS_HOURS,                       // 32. settings-hours.html
        FEATURES.SETTINGS_TAX,                         // 33. settings-tax.html
        FEATURES.SETTINGS_PAYMENTS,                    // 34. settings-payments.html
        FEATURES.SETTINGS_NOTIFICATIONS,               // 35. settings-notifications.html
        FEATURES.SETTINGS_INVOICE,                     // 36. settings-invoice.html
        FEATURES.SETTINGS_INVOICE_COMMON,              // 37. settings-invoice-common.html
        FEATURES.SETTINGS_INVOICE_BOOKING,             // 38. settings-invoice-booking.html
        FEATURES.SETTINGS_INVOICE_POS,                 // 39. settings-invoice-pos.html
        FEATURES.SETTINGS_INVOICE_MEMBERSHIP,          // 40. settings-invoice-membership.html
        FEATURES.NOTIFICATIONS,                        // 41. notifications.html
        FEATURES.SUPPORT,                              // 42. support.html
        FEATURES.ISSUE_HISTORY,                        // 43. issue-history.html
        FEATURES.USER_GUIDE                            // 44. user_guide.html
    ],

    // ── ADVANCE / GROWTH: Marketing, expenses, advanced reporting & multi-branch ─
    [PLAN_NAMES.ADVANCE]: [
        // Includes everything in Basic, plus:
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.STAFF_MANAGEMENT,
        FEATURES.STAFF_SCHEDULES,
        FEATURES.SERVICES_MANAGEMENT,
        FEATURES.POS_SYSTEM,
        FEATURES.PRODUCT_MANAGEMENT,
        FEATURES.SALES_HISTORY,
        FEATURES.PENDING_PAYMENTS,
        FEATURES.PAYMENTS_HISTORY,
        FEATURES.MARKETING_OFFERS,                     // 12. offers.html (Unlocked)
        FEATURES.MARKETING_COUPONS,                    // 13. coupons.html (Unlocked)
        FEATURES.MARKETING_MEMBERSHIPS,                // 14. memberships.html (Unlocked)
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.REPORTS_ACCESS,                       // 17. reports.html (Unlocked)
        FEATURES.ANALYTICS_EXPENSES,                   // 18. expenses.html (Unlocked)
        FEATURES.COMPANY_SETTINGS,
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLES_PERMISSIONS,
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT,

        // Sub-Pages
        FEATURES.DASHBOARD_TODAYS_REVENUE,
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,
        FEATURES.REPORTS_CATEGORY,                     // 27. report-category.html (Unlocked)
        FEATURES.REPORTS_DETAIL,                       // 28. report-detail.html (Unlocked)
        FEATURES.BRANCH_MANAGEMENT,                    // 29. branches.html (Multi-branch)
        FEATURES.SETTINGS_BUSINESS,
        FEATURES.SETTINGS_CONTACT,
        FEATURES.SETTINGS_HOURS,
        FEATURES.SETTINGS_TAX,
        FEATURES.SETTINGS_PAYMENTS,
        FEATURES.SETTINGS_NOTIFICATIONS,
        FEATURES.SETTINGS_INVOICE,
        FEATURES.SETTINGS_INVOICE_COMMON,
        FEATURES.SETTINGS_INVOICE_BOOKING,
        FEATURES.SETTINGS_INVOICE_POS,
        FEATURES.SETTINGS_INVOICE_MEMBERSHIP,
        FEATURES.NOTIFICATIONS,
        FEATURES.SUPPORT,
        FEATURES.ISSUE_HISTORY,
        FEATURES.USER_GUIDE
    ],

    // ── ENTERPRISE: Unrestricted full access across all 44 modules ───────────
    [PLAN_NAMES.ENTERPRISE]: ALL_APP_FEATURES
};

// Map known UUIDs to matrices
DEFAULT_PLAN_MATRICES[PLAN_IDS.BASIC] = DEFAULT_PLAN_MATRICES[PLAN_NAMES.BASIC];
DEFAULT_PLAN_MATRICES[PLAN_IDS.ADVANCE] = DEFAULT_PLAN_MATRICES[PLAN_NAMES.ADVANCE];
DEFAULT_PLAN_MATRICES[PLAN_IDS.ENTERPRISE] = DEFAULT_PLAN_MATRICES[PLAN_NAMES.ENTERPRISE];


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
        FEATURES.MARKETING_MEMBERSHIPS,
        FEATURES.MARKETING_CAMPAIGNS
    ];
    const analyticsFeatures = [
        FEATURES.REPORTS_ACCESS,
        FEATURES.REPORTS_CATEGORY,
        FEATURES.REPORTS_DETAIL,
        FEATURES.ANALYTICS_EXPENSES
    ];

    let minimumPlan = PLAN_NAMES.ADVANCE;
    let category = 'Premium Module';

    if (marketingFeatures.includes(featureKey)) {
        minimumPlan = PLAN_NAMES.ADVANCE;
        category = 'Marketing & Growth Suite';
    } else if (analyticsFeatures.includes(featureKey)) {
        minimumPlan = PLAN_NAMES.ADVANCE;
        category = 'Advanced Analytics & Financial Reporting';
    }

    return {
        featureKey,
        category,
        minimumPlan,
        upgradeUrl: 'plans.html?flow=upgrade',
        promptTitle: `Upgrade to ${minimumPlan} Plan`,
        promptMessage: `This module is part of the ${minimumPlan} Plan. Upgrade today to unlock ${category} for your salon.`
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

    // 2. Fallback to default matrix by planId or planName
    if (features.length === 0) {
        if (planId && DEFAULT_PLAN_MATRICES[planId]) {
            features = DEFAULT_PLAN_MATRICES[planId];
        } else if (planName && DEFAULT_PLAN_MATRICES[planName]) {
            features = DEFAULT_PLAN_MATRICES[planName];
        } else {
            // Default safe fallback to Basic
            features = DEFAULT_PLAN_MATRICES[PLAN_NAMES.BASIC];
        }
    }

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

    // Fallback: check localStorage for plan_name or default to Basic
    const planName = localStorage.getItem('plan_name') || PLAN_NAMES.BASIC;
    const features = DEFAULT_PLAN_MATRICES[planName] || DEFAULT_PLAN_MATRICES[PLAN_NAMES.BASIC];

    return {
        planId: localStorage.getItem('plan_id') || null,
        planName,
        features,
        isEnterprise: planName.toLowerCase().includes('enterprise')
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
