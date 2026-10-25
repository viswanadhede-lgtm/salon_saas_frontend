/**
 * scripts/global-auth-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOBAL AUTH GUARD — Master Orchestrator for Application Authorization
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURAL DESIGN:
 *   Orchestrates authorization using a 3-Gate Model backed by modular configuration files:
 *     - GATE 1: Subscription State Manager (Tenant lifecycle & read/write mode)
 *     - GATE 2: In-App RBAC Manager (User role permissions & action policies)
 *     - GATE 3: Plan Features Manager (Commercial tier gating & paywalls)
 *
 * PERFORMANCE & SECURITY STRATEGY:
 *   1. COLD START (First Login / Stale Cache):
 *      - Authoritatively verifies session via Supabase Auth (/auth/v1/user)
 *      - Evaluates Gate 1 (Tenant subscription active vs expired read-only)
 *      - Evaluates Gate 3 (Commercial plan tier features from single-row plan_features)
 *      - Evaluates Gate 2 (Role permissions from single-row role_permissions)
 *      - Caches full validated context into localStorage with timestamp
 *
 *   2. HOT NAVIGATION (Optimistic Cache Hit < 2ms):
 *      - Validates page access instantly from localStorage cache without network latency
 *      - Hydrates header, user profile, branch selector, and action gates immediately
 *      - Enforces Read-Only banner if subscription is expired
 *
 *   3. 30-MINUTE SILENT HEARTBEAT:
 *      - Runs in background every 30 minutes
 *      - Silently re-queries authoritative tables via the 3 Managers
 *      - Detects plan upgrades, subscription expiry, or role changes without disrupting user
 *      - Updates cache seamlessly; triggers polite upgrade/renew alerts if current page lost
 *
 * CONTRACTS PRESERVED:
 *   - window.populateGlobalHeader
 *   - window.getActiveBranchId
 *   - window.uploadProfilePhoto
 *   - export populateGlobalHeader
 *   - export populateDateChip
 *   - export initProfilePhotoLightbox
 *   - export runGlobalAuthGuard
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase.js';
import { FEATURES } from '../config/feature-registry.js';
import { SUB_FEATURES_MAP } from '../config/sub-feature-registry.js';

// Gate 1: Subscription Lifecycle Gatekeeper
import {
    getSubscriptionAccess,
    canWrite,
    canRead,
    renderSubscriptionBanner,
    clearSubscriptionCache
} from '../config/subscription-state-manager.js';

// Gate 2: In-App Role-Based Access Control Gatekeeper
import {
    getUserRoleAndPermissions,
    hasRolePermission,
    clearRbacCache
} from '../config/rbac-manager.js';

// Gate 3: Commercial Plan Tier Gatekeeper
import {
    resolvePlanFeatures,
    isFeatureUnlocked,
    showPlanUpgradeModal,
    clearPlanFeaturesCache
} from '../config/plan-features-manager.js';

// Sub-feature Action Management & DOM Gating
import { initSubFeatures } from './sub-features/sub-feature-manager.js';
import { applySubFeatureGates } from './sub-features/sub-feature-gate.js';
import { initGlobalBookingModal } from './global-booking-modal.js';

// ─── Global Notification Manager Loader ──────────────────────────────────────
(function loadNotificationManager() {
    if (window.__notifManagerLoaded) return;
    window.__notifManagerLoaded = true;
    const s = document.createElement('script');
    s.src = 'scripts/notification-manager.js';
    document.head.appendChild(s);
})();


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ROUTE TO FEATURE DICTIONARY (All 44 Application Pages)
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE_MAP = {
    // ── Group A: Core System Features (22 Sidebar Pages) ─────────────────────
    '/dashboard.html':                  FEATURES.DASHBOARD_ACCESS,                 // 1.  dashboard.html
    '/bookings.html':                   FEATURES.BOOKINGS_MANAGEMENT,              // 2.  bookings.html
    '/customers.html':                  FEATURES.CUSTOMERS_MANAGEMENT,             // 3.  customers.html
    '/staff.html':                      FEATURES.STAFF_MANAGEMENT,                 // 4.  staff.html
    '/staff-schedule.html':             FEATURES.STAFF_SCHEDULES,                  // 5.  staff-schedule.html
    '/services.html':                   FEATURES.SERVICES_MANAGEMENT,              // 6.  services.html
    '/pos.html':                        FEATURES.POS_SYSTEM,                       // 7.  pos.html
    '/products.html':                   FEATURES.PRODUCT_MANAGEMENT,               // 8.  products.html
    '/sales-history.html':              FEATURES.SALES_HISTORY,                    // 9.  sales-history.html
    '/pending-payments.html':           FEATURES.PENDING_PAYMENTS,                 // 10. pending-payments.html
    '/payments-history.html':           FEATURES.PAYMENTS_HISTORY,                 // 11. payments-history.html
    '/offers.html':                     FEATURES.MARKETING_OFFERS,                 // 12. offers.html
    '/coupons.html':                    FEATURES.MARKETING_COUPONS,                // 13. coupons.html
    '/memberships.html':                FEATURES.MARKETING_MEMBERSHIPS,            // 14. memberships.html
    '/ad-campaigns.html':               FEATURES.MARKETING_CAMPAIGNS,              // 15. ad-campaigns.html
    '/overview.html':                   FEATURES.ANALYTICS_OVERVIEW,               // 16. overview.html
    '/reports.html':                    FEATURES.REPORTS_ACCESS,                   // 17. reports.html
    '/expenses.html':                   FEATURES.ANALYTICS_EXPENSES,               // 18. expenses.html
    '/company.html':                    FEATURES.COMPANY_SETTINGS,                 // 19. company.html
    '/users.html':                      FEATURES.USER_MANAGEMENT,                  // 20. users.html
    '/roles-permissions.html':          FEATURES.ROLES_PERMISSIONS,                // 21. roles-permissions.html
    '/billing-subscription.html':       FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT,  // 22. billing-subscription.html

    // ── Group B: Supporting Features (22 Sub-Pages) ──────────────────────────
    // Dashboard widgets
    '/todays-revenue.html':             FEATURES.DASHBOARD_TODAYS_REVENUE,         // 23. todays-revenue.html
    '/upcoming-appointments.html':      FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,  // 24. upcoming-appointments.html
    '/completed-appointments.html':     FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS, // 25. completed-appointments.html
    '/no-shows-cancellations.html':     FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS, // 26. no-shows-cancellations.html

    // Reports sub-pages
    '/report-category.html':            FEATURES.REPORTS_CATEGORY,                 // 27. report-category.html
    '/report-detail.html':              FEATURES.REPORTS_DETAIL,                   // 28. report-detail.html

    // Company & Settings sub-pages
    '/branches.html':                   FEATURES.BRANCH_MANAGEMENT,                // 29. branches.html
    '/settings-business.html':          FEATURES.SETTINGS_BUSINESS,                // 30. settings-business.html
    '/settings-contact.html':           FEATURES.SETTINGS_CONTACT,                 // 31. settings-contact.html
    '/settings-hours.html':             FEATURES.SETTINGS_HOURS,                   // 32. settings-hours.html
    '/settings-tax.html':               FEATURES.SETTINGS_TAX,                     // 33. settings-tax.html
    '/settings-payments.html':          FEATURES.SETTINGS_PAYMENTS,                // 34. settings-payments.html
    '/settings-notifications.html':     FEATURES.SETTINGS_NOTIFICATIONS,           // 35. settings-notifications.html
    '/settings-invoice.html':           FEATURES.SETTINGS_INVOICE,                 // 36. settings-invoice.html
    '/settings-invoice-common.html':    FEATURES.SETTINGS_INVOICE_COMMON,          // 37. settings-invoice-common.html
    '/settings-invoice-booking.html':   FEATURES.SETTINGS_INVOICE_BOOKING,         // 38. settings-invoice-booking.html
    '/settings-invoice-pos.html':       FEATURES.SETTINGS_INVOICE_POS,             // 39. settings-invoice-pos.html
    '/settings-invoice-membership.html': FEATURES.SETTINGS_INVOICE_MEMBERSHIP,      // 40. settings-invoice-membership.html

    // Header & Utility sub-pages
    '/notifications.html':              FEATURES.NOTIFICATIONS,                    // 41. notifications.html
    '/support.html':                    FEATURES.SUPPORT,                          // 42. support.html
    '/issue-history.html':              FEATURES.ISSUE_HISTORY,                    // 43. issue-history.html
    '/user_guide.html':                 FEATURES.USER_GUIDE,                       // 44. user_guide.html
    '/user-guide.html':                 FEATURES.USER_GUIDE                        // 44 (alias)
};

// Granular sub-route action map for nested settings
const SUB_ROUTE_MAP = {
    '/settings-business.html':           'settings_business',
    '/settings-contact.html':            'settings_contact',
    '/settings-hours.html':              'settings_hours',
    '/settings-tax.html':                'settings_tax',
    '/settings-payments.html':           'settings_payments',
    '/settings-notifications.html':      'settings_notifications',
    '/settings-invoice.html':            'settings_billing',
    '/settings-invoice-common.html':     'settings_billing',
    '/settings-invoice-booking.html':    'settings_billing',
    '/settings-invoice-pos.html':        'settings_billing',
    '/settings-invoice-membership.html': 'settings_billing'
};


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — SESSION & TOKEN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
const SUPABASE_ANON = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

const CACHE_TTL_MS       = 30 * 60 * 1000; // 30 minutes cache TTL
const HEARTBEAT_FREQ_MS  = 30 * 60 * 1000; // 30 minutes background heartbeat
const TOKEN_REFRESH_FREQ = 25 * 60 * 1000; // 25 minutes proactive token refresh

let tokenRefreshTimer = null;
let heartbeatTimer    = null;

/**
 * Silently refreshes Supabase auth token using the stored refresh_token.
 */
async function silentTokenRefresh() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.access_token) {
            console.warn('[Auth Guard] Silent token refresh failed.');
            return false;
        }

        localStorage.setItem('token', data.access_token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        console.log('[Auth Guard] Token silently refreshed ✓');
        return true;
    } catch (e) {
        console.warn('[Auth Guard] Network error during token refresh:', e.message);
        return false;
    }
}

/**
 * Sets up background proactive token refresh timer.
 */
function setupTokenRefresh() {
    if (tokenRefreshTimer) return;
    tokenRefreshTimer = setInterval(() => {
        console.log('[Auth Guard] Running scheduled proactive token refresh...');
        silentTokenRefresh();
    }, TOKEN_REFRESH_FREQ);
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — 30-MINUTE SILENT HEARTBEAT
// Periodically synchronizes Gate 1, Gate 2, Gate 3 state in the background.
// ─────────────────────────────────────────────────────────────────────────────
function setupHeartbeat() {
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(async () => {
        console.log('[Auth Guard] 30-minute silent heartbeat running...');
        try {
            const token = localStorage.getItem('token');
            const companyId = localStorage.getItem('company_id');
            if (!token || !companyId) return;

            // 1. Refresh Gate 1 (Subscription Lifecycle)
            const subProfile = await getSubscriptionAccess(true);

            // 2. Refresh Gate 3 (Commercial Plan Features)
            const planProfile = await resolvePlanFeatures(true);

            // 3. Refresh Gate 2 (In-App RBAC Permissions)
            const rbacProfile = await getUserRoleAndPermissions(true);

            // Re-derive userFeatures & userSubFeatures
            let userFeatures = [];
            let userSubFeatures = [];

            if (rbacProfile.isOwner || rbacProfile.hasUniversalAccess) {
                userFeatures = planProfile.features || [];
                userFeatures.forEach(feat => {
                    const children = SUB_FEATURES_MAP[feat] || [];
                    children.forEach(sf => userSubFeatures.push(sf?.key || sf));
                });
            } else {
                const allMainFeatures = Object.values(FEATURES);
                userFeatures = (rbacProfile.permissions || []).filter(k => allMainFeatures.includes(k));
                userSubFeatures = (rbacProfile.permissions || []).filter(k => !allMainFeatures.includes(k));
            }

            // Update local storage cache
            localStorage.setItem('userFeatures',        JSON.stringify(userFeatures));
            localStorage.setItem('userSubFeatures',     JSON.stringify(userSubFeatures));
            localStorage.setItem('subscriptionState',   JSON.stringify(subProfile));
            localStorage.setItem('planFeatures',        JSON.stringify(planProfile));
            localStorage.setItem('authCacheTimestamp',  Date.now().toString());

            // Check if current active page is still valid under new state
            const path = window.location.pathname;
            const filename = path.substring(path.lastIndexOf('/')) || '/';
            const currentFeatureKey = ROUTE_MAP[filename] || null;

            if (currentFeatureKey) {
                // Gate 3 re-check: Was feature removed from plan?
                if (!isFeatureUnlocked(currentFeatureKey, planProfile)) {
                    console.warn('[Auth Guard] Heartbeat: Current page locked by plan tier.');
                    showPlanUpgradeModal(currentFeatureKey);
                    return;
                }

                // Gate 2 re-check: Was role permission revoked?
                if (!hasRolePermission(currentFeatureKey, rbacProfile)) {
                    console.warn('[Auth Guard] Heartbeat: Current page permission revoked.');
                    showAuthBlockModal('FEATURE_NOT_ALLOWED',
                        'Your role permissions have been updated. You no longer have access to this page.',
                        'Go to Dashboard', 'dashboard.html');
                    return;
                }
            }

            // Gate 1: If subscription expired, render read-only banner
            if (subProfile.isExpired || subProfile.accessLevel === 'read-only') {
                renderSubscriptionBanner('mainWrapper');
            }

            // Re-apply sub-feature gates with refreshed permissions
            initSubFeatures();
            applySubFeatureGates();

            console.log('[Auth Guard] 30-minute silent heartbeat complete ✓ All 3 gates in sync.');
        } catch (err) {
            console.warn('[Auth Guard] Heartbeat sync error (will retry next interval):', err.message);
        }
    }, HEARTBEAT_FREQ_MS);
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — MAIN AUTH GUARD ORCHESTRATOR
// Handles cold starts, hot cache navigation (< 2ms), and page gate enforcement.
// ─────────────────────────────────────────────────────────────────────────────
export async function runGlobalAuthGuard() {
    const path     = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';
    const featureKey = ROUTE_MAP[filename] || null;

    // Public routes (signin, signup, onboarding, plans) bypass authentication
    if (!featureKey) {
        console.log(`[Auth Guard] Public route: ${filename}. Bypassing.`);
        removeAuthSpinner();
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('[Auth Guard] No session token found → redirecting to signin');
        window.location.href = 'signin.html';
        return;
    }

    // ── HOT NAVIGATION: Instant cache evaluation (< 2ms) ─────────────────────
    const cachedFeatures    = localStorage.getItem('userFeatures');
    const cachedContext     = localStorage.getItem('appContext');
    const cachedSubState    = localStorage.getItem('subscriptionState');
    const cachedPlan        = localStorage.getItem('planFeatures');
    const cacheTimestamp    = parseInt(localStorage.getItem('authCacheTimestamp') || '0', 10);

    const isCacheValid = cachedFeatures && cachedContext &&
                         (Date.now() - cacheTimestamp) < CACHE_TTL_MS;

    if (isCacheValid) {
        try {
            const userFeatures    = JSON.parse(cachedFeatures);
            const userSubFeatures = JSON.parse(localStorage.getItem('userSubFeatures') || '[]');
            const parsedCtx       = JSON.parse(cachedContext || '{}');
            const subProfile      = cachedSubState ? JSON.parse(cachedSubState) : null;
            const planProfile     = cachedPlan ? JSON.parse(cachedPlan) : null;

            // Enforce branch assignment constraints
            if (parsedCtx.user?.can_switch_branch === false && parsedCtx.user?.assigned_branch_id) {
                localStorage.setItem('active_branch_id', parsedCtx.user.assigned_branch_id);
                localStorage.setItem('branch_id', parsedCtx.user.assigned_branch_id);
            } else if (!localStorage.getItem('branch_id') && localStorage.getItem('active_branch_id')) {
                localStorage.setItem('branch_id', localStorage.getItem('active_branch_id'));
            }

            if (!localStorage.getItem('user_id') && parsedCtx.user?.user_id) {
                localStorage.setItem('user_id', parsedCtx.user.user_id);
            }
            if (!localStorage.getItem('role_id') && parsedCtx.user?.role_id) {
                localStorage.setItem('role_id', parsedCtx.user.role_id);
            }

            // GATE 3 CHECK: Commercial Plan Tier
            if (planProfile && !isFeatureUnlocked(featureKey, planProfile)) {
                showPlanUpgradeModal(featureKey);
                return;
            }

            // GATE 2 CHECK: Role-Based Access Control
            const isOwner = (parsedCtx.user?.role_name || '').toLowerCase() === 'owner';
            if (!isOwner && !userFeatures.includes(featureKey)) {
                showAuthBlockModal('FEATURE_NOT_ALLOWED',
                    "You do not have permission to access this page. Please contact your salon administrator.",
                    'Go to Dashboard', 'dashboard.html');
                return;
            }

            // Granular sub-route check
            const requiredSubFeature = SUB_ROUTE_MAP[filename];
            if (!isOwner && requiredSubFeature && !userSubFeatures.includes(requiredSubFeature)) {
                showAuthBlockModal('FEATURE_NOT_ALLOWED',
                    "Your role does not have permission to access this settings section.",
                    'Back to Settings', 'company.html');
                return;
            }

            // GATE 1 CHECK: Subscription Lifecycle (Read-Only Mode)
            if (subProfile && (subProfile.isExpired || subProfile.accessLevel === 'read-only')) {
                renderSubscriptionBanner('mainWrapper');
            }

            // Instant UI Hydration from Cache
            populateGlobalHeader();
            initGlobalBookingModal();
            initSubFeatures();
            applySubFeatureGates();
            removeAuthSpinner();

            // Ensure background services are running
            setupTokenRefresh();
            setupHeartbeat();

            console.log(`[Auth Guard] Hot navigation cache hit ✓ Page '${filename}' unlocked instantly.`);
            return; // Skip cold start completely
        } catch (cacheErr) {
            console.warn('[Auth Guard] Cache evaluation error, falling back to cold start:', cacheErr.message);
        }
    }

    // ── COLD START: Authoritative Supabase Validation ────────────────────────
    try {
        console.log('[Auth Guard] Cache miss or stale — executing authoritative cold start...');

        // 1. Proactive Token Refresh check (if token expires within 5 minutes)
        try {
            const rawToken = token;
            const payloadB64 = rawToken.split('.')[1];
            if (payloadB64) {
                const payload = JSON.parse(atob(payloadB64));
                const expiresAt = (payload.exp || 0) * 1000;
                if (expiresAt - Date.now() < 5 * 60 * 1000) {
                    console.log('[Auth Guard] Token near expiry — refreshing before DB queries...');
                    const refreshed = await silentTokenRefresh();
                    if (!refreshed) {
                        showAuthBlockModal('INVALID_SESSION', 'Your session has expired. Please sign in again.', 'Sign In', 'signin.html');
                        return;
                    }
                }
            }
        } catch (_) { /* malformed token handled below */ }

        // 2. Validate session against Supabase Auth endpoint
        const currentToken = localStorage.getItem('token');
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${currentToken}` }
        });

        if (userRes.status === 401) {
            const refreshed = await silentTokenRefresh();
            if (!refreshed) {
                showAuthBlockModal('INVALID_SESSION', 'Your session has expired. Please sign in again.', 'Sign In', 'signin.html');
                return;
            }
        } else if (!userRes.ok) {
            showAuthBlockModal('ERROR', 'Unable to verify session with server. Please try again.', 'Refresh', window.location.href);
            return;
        }

        const authUser = await userRes.json().catch(() => null);
        const user_id  = authUser?.id;
        if (!user_id) {
            showAuthBlockModal('INVALID_SESSION', 'Your session has expired. Please sign in again.', 'Sign In', 'signin.html');
            return;
        }

        // 3. Load user record from public.users
        const cachedCompanyId = localStorage.getItem('company_id');
        const { data: userRows, error: userErr } = await supabase.from('users')
            .select('company_id, branch_id, role_id, role_name, name, email, phone, status, last_login_at, created_at')
            .eq('user_id', user_id);

        const userRow = userRows?.[0];
        if (userErr || !userRow) {
            showAuthBlockModal('ERROR', 'User profile not found. Please contact support.', 'Sign In', 'signin.html');
            return;
        }

        if (userRow.status === 'deleted' || userRow.status === 'inactive') {
            showAuthBlockModal('ERROR', 'Your account has been deactivated. Please contact your salon administrator.', 'Sign In', 'signin.html');
            localStorage.removeItem('token');
            return;
        }

        const resolvedCompanyId = userRow.company_id || cachedCompanyId;

        // 4. Load company record
        const { data: compRows } = await supabase.from('companies')
            .select('company_id, company_name, display_name, logo_url, plan_id, plan_name')
            .eq('company_id', resolvedCompanyId);

        const company = compRows?.[0] || {};

        // Store plan_id immediately so resolvePlanFeatures can resolve it via localStorage
        if (company.plan_id) localStorage.setItem('plan_id', company.plan_id);
        if (company.plan_name) localStorage.setItem('plan_name', company.plan_name);

        // 5. EVALUATE GATE 1: Subscription Lifecycle via SubscriptionStateManager
        const subProfile = await getSubscriptionAccess(true);

        // 6. EVALUATE GATE 3: Commercial Plan Features via PlanFeaturesManager
        const planProfile = await resolvePlanFeatures(true);

        if (!isFeatureUnlocked(featureKey, planProfile)) {
            removeAuthSpinner();
            showPlanUpgradeModal(featureKey);
            return;
        }

        // 7. EVALUATE GATE 2: In-App RBAC Permissions via RbacManager
        const rbacProfile = await getUserRoleAndPermissions(true);

        if (!hasRolePermission(featureKey, rbacProfile)) {
            removeAuthSpinner();
            showAuthBlockModal('FEATURE_NOT_ALLOWED',
                "You do not have permission to access this page. Please contact your salon administrator.",
                'Go to Dashboard', 'dashboard.html');
            return;
        }

        // Sub-route check (nested settings pages)
        const requiredSubFeature = SUB_ROUTE_MAP[filename];
        if (requiredSubFeature && !hasRolePermission(requiredSubFeature, rbacProfile)) {
            removeAuthSpinner();
            showAuthBlockModal('FEATURE_NOT_ALLOWED',
                "Your role does not have permission to access this settings section.",
                'Back to Settings', 'company.html');
            return;
        }

        // 8. Derive unified userFeatures & userSubFeatures sets
        let userFeatures = [];
        let userSubFeatures = [];

        if (rbacProfile.isOwner || rbacProfile.hasUniversalAccess) {
            userFeatures = planProfile.features || [];
            userFeatures.forEach(feat => {
                const children = SUB_FEATURES_MAP[feat] || [];
                children.forEach(sf => userSubFeatures.push(sf?.key || sf));
            });
        } else {
            const allMainFeatures = Object.values(FEATURES);
            userFeatures = (rbacProfile.permissions || []).filter(k => allMainFeatures.includes(k));
            userSubFeatures = (rbacProfile.permissions || []).filter(k => !allMainFeatures.includes(k));
        }

        // 9. Load user profile, preferences, and branch switcher options
        const { data: profileRows } = await supabase.from('profiles')
            .select('first_name, last_name, phone, email, joined_on, emergency_contact_name, emergency_contact_number, profile_photo')
            .eq('user_id', user_id);
        const profile = profileRows?.[0];

        let userPref = null;
        try {
            const { data: prefRows } = await supabase.from('user_preferences')
                .select('branch_id, notifications')
                .eq('user_id', user_id);
            userPref = prefRows?.[0] || null;
        } catch (_) {}

        const { data: branches } = await supabase.from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', resolvedCompanyId)
            .eq('status', 'active');

        const activeBranches = (branches || []).map(b => ({
            id: b.branch_id,
            branch_id: b.branch_id,
            branch_name: b.branch_name
        }));

        const isOwner = (userRow.role_name || '').toLowerCase() === 'owner';
        const canSwitchBranch = isOwner ||
                                rbacProfile.hasUniversalAccess ||
                                userSubFeatures.includes('branch_switch') ||
                                userFeatures.includes('branch_management');

        // Resolve active branch
        let resolvedBranchId = null;
        if (canSwitchBranch) {
            const savedBranch = localStorage.getItem('active_branch_id');
            const isSavedValid = activeBranches.some(b => b.branch_id === savedBranch);
            const isPrefValid = activeBranches.some(b => b.branch_id === userPref?.branch_id);
            const isAssignedValid = activeBranches.some(b => b.branch_id === userRow.branch_id);

            if (isSavedValid) resolvedBranchId = savedBranch;
            else if (isPrefValid) resolvedBranchId = userPref.branch_id;
            else if (isAssignedValid) resolvedBranchId = userRow.branch_id;
            else resolvedBranchId = activeBranches[0]?.branch_id || null;
        } else {
            resolvedBranchId = userRow.branch_id || activeBranches[0]?.branch_id || null;
        }

        // 10. Construct unified App Context
        try {
            await supabase.from('users')
                .update({ last_login_at: new Date().toISOString() })
                .eq('user_id', user_id);
        } catch (_) {}

        const appContext = {
            user: {
                user_id,
                name:               userRow.name,
                email:              userRow.email,
                phone:              userRow.phone || profile?.phone || '',
                role_id:            userRow.role_id,
                role_name:          userRow.role_name,
                assigned_branch_id: userRow.branch_id || null,
                can_switch_branch:  canSwitchBranch,
                first_name:         profile?.first_name || '',
                last_name:          profile?.last_name  || '',
                joined_on:          profile?.joined_on  || userRow.created_at || '',
                last_login_at:      userRow.last_login_at || null,
                profile_photo:      profile?.profile_photo || '',
                emergency_name:     profile?.emergency_contact_name || '',
                emergency_phone:    profile?.emergency_contact_number || ''
            },
            company: {
                company_id:          resolvedCompanyId,
                company_name:        company.company_name || '',
                display_name:        company.display_name || company.company_name || '',
                logo_url:            company.logo_url || null,
                plan_id:             company.plan_id || null,
                plan_name:           planProfile.planName || company.plan_name || null,
                plan:                planProfile.planName || company.plan_name || 'Basic',
                subscription_status: subProfile.status || 'active',
                subscription_type:   subProfile.billingCycle || 'monthly'
            },
            branches: activeBranches,
            current_branch_id: resolvedBranchId
        };

        // 11. Persist authenticated context to localStorage
        localStorage.setItem('userFeatures',        JSON.stringify(userFeatures));
        localStorage.setItem('userSubFeatures',     JSON.stringify(userSubFeatures));
        localStorage.setItem('subscriptionState',   JSON.stringify(subProfile));
        localStorage.setItem('planFeatures',        JSON.stringify(planProfile));
        localStorage.setItem('appContext',          JSON.stringify(appContext));
        localStorage.setItem('authCacheTimestamp',  Date.now().toString());

        localStorage.setItem('company_id',          resolvedCompanyId);
        localStorage.setItem('active_branch_id',    resolvedBranchId);
        localStorage.setItem('branch_id',           resolvedBranchId);
        if (userRow.role_id) localStorage.setItem('role_id', userRow.role_id);
        if (userRow.role_name) localStorage.setItem('role_name', userRow.role_name);
        if (user_id) localStorage.setItem('user_id', user_id);

        // 12. Gate 1 UI feedback (attach read-only alert if expired)
        if (subProfile.isExpired || subProfile.accessLevel === 'read-only') {
            renderSubscriptionBanner('mainWrapper');
        }

        // 13. Hydrate UI and reveal page
        populateGlobalHeader();
        initGlobalBookingModal();
        initSubFeatures();
        applySubFeatureGates();
        removeAuthSpinner();

        // 14. Start background token refresh and 30-minute silent heartbeat
        setupTokenRefresh();
        setupHeartbeat();

        console.log('[Auth Guard] Authoritative cold start complete. Page unlocked ✓');

    } catch (err) {
        console.error('[Auth Guard] Unexpected authorization error:', err);
        showAuthBlockModal('ERROR', 'A network error occurred while verifying access.', 'Refresh Page', window.location.href);
    }
}

// Attach listener on DOMContentLoaded
document.addEventListener('DOMContentLoaded', runGlobalAuthGuard);


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — GLOBAL HEADER & ACTIVE BRANCH RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authoritative branch ID getter. Used across all modules for querying tenant data.
 */
window.getActiveBranchId = function() {
    const fromDom = document.getElementById('branchSelect')?.value;
    const fromStorage = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    const val = (fromDom && fromDom !== 'branch_1' && fromDom !== 'branch_2' && fromDom !== 'all') ? fromDom : fromStorage;
    return (val && val !== 'branch_1' && val !== 'branch_2' && val !== 'all') ? val : null;
};

function formatProfileDate(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
}

function formatLastLogin(isoStr) {
    if (!isoStr) return 'Never';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return 'Never';
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs  = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 2)  return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHrs < 2)   return '1 hour ago';
        if (diffHrs < 24)  return `${diffHrs} hours ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7)  return `${diffDays} days ago`;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return 'Unknown'; }
}

/**
 * Populates global header elements, profile modal, and branch switcher.
 */
export function populateGlobalHeader() {
    const contextStr = localStorage.getItem('appContext');
    if (!contextStr) return;

    try {
        const context = JSON.parse(contextStr);

        const branchSelect = document.getElementById('branchSelect');
        const planBadge    = document.getElementById('headerPlanBadge');
        const profileMenu  = document.getElementById('profileMenu');
        const avatarImg    = document.querySelector('#avatarBtn img');

        // Plan badge
        if (planBadge && context.company?.plan) {
            const p = context.company.plan;
            planBadge.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        }

        // Profile dropdown name + role
        if (profileMenu && context.user) {
            const nameEl = profileMenu.querySelector('.dropdown-name');
            const roleEl = profileMenu.querySelector('.dropdown-role');
            if (nameEl && context.user.name)      nameEl.textContent = context.user.name;
            if (roleEl && context.user.role_name) roleEl.textContent = context.user.role_name;
        }

        // Avatar
        let avatarUrl = context.user?.profile_photo || '';
        if (!avatarUrl && context.user?.name) {
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(context.user.name)}&background=1E3A8A&color=fff`;
        }
        if (avatarImg && avatarUrl) avatarImg.src = avatarUrl;

        // Profile modal fields
        if (context.user) {
            const profileAvatarImg    = document.getElementById('profileAvatarImg');
            const profileNameDisplay  = document.querySelector('.profile-name-display');
            const profileRoleDisplay  = document.querySelector('.profile-role-display');
            const profileFirstName    = document.getElementById('profileFirstName');
            const profileLastName     = document.getElementById('profileLastName');
            const profilePhone        = document.getElementById('profilePhone');
            const profileEmail        = document.getElementById('profileEmail');
            const profileRoleInput    = document.getElementById('profileRole');
            const profileJoined       = document.getElementById('profileJoined');
            const profileBranch       = document.getElementById('profileBranch');
            const profileLastLogin    = document.getElementById('profileLastLogin');

            if (profileAvatarImg && avatarUrl) profileAvatarImg.src = avatarUrl;
            if (profileNameDisplay && context.user.name)      profileNameDisplay.textContent = context.user.name;
            if (profileRoleDisplay && context.user.role_name) profileRoleDisplay.textContent = context.user.role_name;
            if (profileFirstName   && context.user.first_name) profileFirstName.value = context.user.first_name;
            if (profileLastName    && context.user.last_name)  profileLastName.value  = context.user.last_name;
            if (profilePhone       && context.user.phone)      profilePhone.value     = context.user.phone;
            if (profileEmail       && context.user.email)      profileEmail.value     = context.user.email;
            if (profileRoleInput   && context.user.role_name)  profileRoleInput.value = context.user.role_name;

            if (profileJoined) {
                profileJoined.value = formatProfileDate(context.user.joined_on) || 'N/A';
            }

            if (profileBranch) {
                const currentBranch = (context.branches || []).find(b => (b.branch_id || b.id) === (context.current_branch_id || localStorage.getItem('active_branch_id')));
                profileBranch.value = currentBranch?.branch_name || currentBranch?.name || 'Main Branch';
            }

            if (profileLastLogin) {
                profileLastLogin.value = formatLastLogin(context.user.last_login_at);
            }

            const profileEmergencyName  = document.getElementById('profileEmergencyName');
            const profileEmergencyPhone = document.getElementById('profileEmergencyPhone');
            if (profileEmergencyName  && context.user.emergency_name)  profileEmergencyName.value  = context.user.emergency_name;
            if (profileEmergencyPhone && context.user.emergency_phone) profileEmergencyPhone.value = context.user.emergency_phone;

            // Schedule modal identity panel
            const scheduleUserAvatarImg   = document.getElementById('scheduleUserAvatarImg');
            const scheduleUserName        = document.getElementById('scheduleUserName');
            const scheduleUserRole        = document.getElementById('scheduleUserRole');
            const scheduleUserEmail       = document.getElementById('scheduleUserEmail');
            const scheduleUserPhone       = document.getElementById('scheduleUserPhone');
            const scheduleUserBranch      = document.getElementById('scheduleUserBranch');
            const scheduleUserDesignation = document.getElementById('scheduleUserDesignation');

            if (scheduleUserAvatarImg && avatarUrl) scheduleUserAvatarImg.src = avatarUrl;
            if (scheduleUserName  && context.user.name)      scheduleUserName.textContent  = context.user.name;
            if (scheduleUserRole  && context.user.role_name) scheduleUserRole.textContent  = context.user.role_name;
            if (scheduleUserEmail && context.user.email)     scheduleUserEmail.textContent = context.user.email;
            if (scheduleUserPhone)  scheduleUserPhone.textContent = context.user.phone || '-';
            if (scheduleUserBranch) {
                const currentBranch = (context.branches || []).find(b => (b.branch_id || b.id) === (context.current_branch_id || localStorage.getItem('active_branch_id')));
                scheduleUserBranch.textContent = currentBranch?.branch_name || currentBranch?.name || 'Main Branch';
            }
            if (scheduleUserDesignation) {
                scheduleUserDesignation.textContent = context.user.designation || (context.user.role_name === 'Owner' ? 'Owner / Manager' : context.user.role_name || 'Staff');
            }
        }

        // Branch switcher dropdown
        if (branchSelect) {
            const branchSwitcher = document.getElementById('headerBranchSwitcher') || branchSelect.closest('.branch-switcher');
            const canSwitch = context.user?.can_switch_branch !== false;
            const branchList = Array.isArray(context.branches) ? context.branches : [];

            if (!canSwitch) {
                const assignedId = context.user?.assigned_branch_id || context.current_branch_id || localStorage.getItem('active_branch_id');
                const assignedBranch = branchList.find(b => (b.branch_id || b.id) === assignedId) || {
                    branch_id: assignedId,
                    branch_name: 'Assigned Branch'
                };

                branchSelect.innerHTML = `<option value="${assignedBranch.branch_id || assignedBranch.id}" selected>${assignedBranch.branch_name || assignedBranch.name || 'Assigned Branch'}</option>`;
                branchSelect.disabled = true;
                if (branchSwitcher) {
                    branchSwitcher.classList.add('branch-locked');
                    branchSwitcher.setAttribute('title', 'Branch assigned to your account (Read-only for your role)');
                }
            } else if (branchList.length > 0) {
                branchSelect.disabled = false;
                if (branchSwitcher) {
                    branchSwitcher.classList.remove('branch-locked');
                    branchSwitcher.removeAttribute('title');
                }

                branchSelect.innerHTML = '';
                branchList.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value       = b.branch_id || b.id;
                    opt.textContent = b.branch_name || b.name;
                    branchSelect.appendChild(opt);
                });

                const currentActive = localStorage.getItem('active_branch_id') || context.current_branch_id || branchList[0].branch_id;
                branchSelect.value = currentActive;

                if (!branchSelect.dataset.branchListenerBound) {
                    branchSelect.dataset.branchListenerBound = '1';
                    branchSelect.addEventListener('change', async (e) => {
                        const newBranchId = e.target.value;
                        if (!newBranchId || newBranchId === 'branch_1' || newBranchId === 'branch_2') return;

                        localStorage.setItem('active_branch_id', newBranchId);
                        localStorage.setItem('branch_id', newBranchId);

                        try {
                            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                            ctx.current_branch_id = newBranchId;
                            localStorage.setItem('appContext', JSON.stringify(ctx));
                        } catch (_) {}

                        const userId = localStorage.getItem('user_id');
                        const compId = localStorage.getItem('company_id');
                        if (userId && supabase) {
                            supabase.from('user_preferences')
                                .upsert({
                                    user_id: userId,
                                    company_id: compId || null,
                                    branch_id: newBranchId,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id' })
                                .then(({ error }) => {
                                    if (error) console.warn('[Auth Guard] Failed to persist branch preference:', error);
                                });
                        }

                        const selectedBranchName = branchSelect.selectedOptions[0]?.textContent || '';
                        console.log('[Branch Switcher] Switched to branch:', selectedBranchName, newBranchId);

                        const evtPayload = { detail: { branchId: newBranchId, branchName: selectedBranchName } };
                        window.dispatchEvent(new CustomEvent('branch:changed', evtPayload));
                        document.dispatchEvent(new CustomEvent('branch:changed', evtPayload));
                    });
                }
            }
        }

        populateDateChip();

    } catch (e) {
        console.error('[Auth Guard] Failed to hydrate header:', e);
    }
}

window.populateGlobalHeader = populateGlobalHeader;


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — PROFILE PHOTO UPLOAD & LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads user profile photo to Supabase Storage bucket.
 */
window.uploadProfilePhoto = async function(file, userId) {
    if (!file || !userId) return null;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

    if (!ALLOWED_TYPES.includes(file.type)) {
        alert('Only JPEG, PNG, or WebP images are allowed.');
        return null;
    }
    if (file.size > MAX_SIZE_BYTES) {
        alert('Photo must be 2 MB or smaller.');
        return null;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Session expired. Please refresh and try again.');
        return null;
    }

    const timestamp    = Math.floor(Date.now() / 1000);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const safeName     = file.name.replace(/[^a-zA-Z0-9.\-]/g, '').toLowerCase() || 'photo.jpg';
    const filename     = `${timestamp}-${randomSuffix}-${safeName}`;
    const storagePath  = `${userId}/${filename}`;

    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos/${storagePath}`, {
            method: 'POST',
            headers: {
                'apikey':        SUPABASE_ANON,
                'Authorization': `Bearer ${token}`,
                'Content-Type':  file.type || 'application/octet-stream'
            },
            body: file
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

        return `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${storagePath}`;
    } catch (err) {
        console.error('[Profile Photo] Upload failed:', err);
        alert('Failed to upload profile photo. Please try again.');
        return null;
    }
};

/**
 * Populates header date chip (e.g., "Saturday, 24 Oct 2026").
 */
export function populateDateChip() {
    const chip = document.getElementById('headerDateChip');
    if (!chip) return;
    const textEl = chip.querySelector('.date-chip-text');
    if (!textEl) return;

    const now = new Date();
    const formatted = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day:     'numeric',
        month:   'short',
        year:    'numeric'
    });
    textEl.textContent = formatted;
}

/**
 * Initializes double-click preview lightbox for profile photos.
 */
export function initProfilePhotoLightbox() {
    if (window._profilePhotoLightboxInitialized) return;
    window._profilePhotoLightboxInitialized = true;

    if (!document.getElementById('profilePhotoLightboxStyles')) {
        const style = document.createElement('style');
        style.id = 'profilePhotoLightboxStyles';
        style.textContent = `
            .profile-photo-lightbox {
                position: fixed; inset: 0; z-index: 100000;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                opacity: 0; pointer-events: none; transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                cursor: default; padding: 24px; box-sizing: border-box;
            }
            .profile-photo-lightbox.active { opacity: 1; pointer-events: auto; }
            .profile-photo-lightbox-close {
                position: absolute; top: 24px; right: 28px; width: 44px; height: 44px;
                border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.2);
                background: rgba(255, 255, 255, 0.12); color: #ffffff; font-size: 28px;
                line-height: 1; display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s ease; backdrop-filter: blur(8px); z-index: 100001;
            }
            .profile-photo-lightbox-close:hover { background: rgba(255, 255, 255, 0.25); transform: scale(1.08); }
            .profile-photo-lightbox-body {
                position: relative; max-width: 90vw; max-height: 82vh;
                display: flex; align-items: center; justify-content: center; cursor: default;
            }
            .profile-photo-lightbox-img {
                max-width: min(85vw, 680px); max-height: min(80vh, 680px); width: auto; height: auto;
                object-fit: contain; border-radius: 16px;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.15);
                transform: scale(0.92); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); user-select: none;
            }
            .profile-photo-lightbox.active .profile-photo-lightbox-img { transform: scale(1); }
            .profile-photo-lightbox-caption {
                margin-top: 14px; font-size: 0.85rem; color: rgba(255, 255, 255, 0.7);
                font-family: Inter, system-ui, -apple-system, sans-serif; letter-spacing: 0.2px; user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    function createLightbox() {
        let el = document.getElementById('profilePhotoLightbox');
        if (!el) {
            el = document.createElement('div');
            el.id = 'profilePhotoLightbox';
            el.className = 'profile-photo-lightbox';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.setAttribute('aria-label', 'Enlarged Profile Photo');
            el.innerHTML = `
                <button type="button" class="profile-photo-lightbox-close" title="Close (Esc)">&times;</button>
                <div class="profile-photo-lightbox-body">
                    <img id="profilePhotoLightboxImg" class="profile-photo-lightbox-img" src="" alt="Enlarged Profile Photo">
                </div>
                <div class="profile-photo-lightbox-caption">Click outside or press Esc to close</div>
            `;
            document.body.appendChild(el);

            el.addEventListener('click', (e) => {
                if (!e.target.closest('.profile-photo-lightbox-img')) closeLightbox();
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeLightbox();
            });
        }
        return el;
    }

    function openLightbox(src) {
        if (!src) return;
        const el = createLightbox();
        const img = el.querySelector('#profilePhotoLightboxImg');
        if (img) img.src = src;
        el.classList.add('active');
    }

    function closeLightbox() {
        const el = document.getElementById('profilePhotoLightbox');
        if (el && el.classList.contains('active')) {
            el.classList.remove('active');
        }
    }

    window.openProfilePhotoLightbox = openLightbox;
    window.closeProfilePhotoLightbox = closeLightbox;

    document.addEventListener('dblclick', (e) => {
        const avatarWrap = e.target.closest('#profileAvatarImg, .profile-avatar-wrap, #scheduleUserAvatarImg, .schedule-avatar-wrap');
        if (!avatarWrap) return;

        const img = avatarWrap.tagName === 'IMG'
            ? avatarWrap
            : (avatarWrap.querySelector('#profileAvatarImg') || avatarWrap.querySelector('img'));

        if (!img || !img.src || img.src.includes('ui-avatars.com')) return;
        openLightbox(img.src);
    });
}

// Early initialization of lightweight UI helpers
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        populateDateChip();
        initProfilePhotoLightbox();
    });
} else {
    populateDateChip();
    initProfilePhotoLightbox();
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — AUTH SPINNER & BLOCK MODAL
// ─────────────────────────────────────────────────────────────────────────────
function removeAuthSpinner() {
    document.documentElement.style.display = '';
    const loader      = document.getElementById('bbAuthLoader');
    const loaderStyle = document.getElementById('bbLoaderStyle');
    if (loader)      loader.remove();
    if (loaderStyle) loaderStyle.remove();
}

function showAuthBlockModal(errorType, messageText, buttonText, buttonLink) {
    if (document.getElementById('authGuardBlockOverlay')) return;

    document.documentElement.style.display = '';

    const wrapper = document.getElementById('mainWrapper');
    const sidebar = document.getElementById('sidebar');
    const blurStyle = 'blur(10px) grayscale(50%)';

    if (wrapper) { wrapper.style.filter = blurStyle; wrapper.style.pointerEvents = 'none'; }
    if (sidebar) { sidebar.style.filter = blurStyle; sidebar.style.pointerEvents = 'none'; }
    if (!wrapper && !sidebar) {
        Array.from(document.body.children).forEach(c => {
            if (c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') {
                c.style.filter = 'blur(10px)';
                c.style.pointerEvents = 'none';
            }
        });
    }

    const isWarning   = errorType === 'SUBSCRIPTION_INACTIVE';
    const iconColor   = isWarning ? '#f59e0b' : '#ef4444';
    const iconBg      = isWarning ? '#fef3c7' : '#fee2e2';
    const iconPath    = isWarning
        ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
        : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';

    const overlayClick = errorType === 'FEATURE_NOT_ALLOWED' ? "window.location.href='dashboard.html'" : '';

    document.body.insertAdjacentHTML('beforeend', `
        <div id="authGuardBlockOverlay"
             onclick="${overlayClick}"
             style="display:flex!important;z-index:2147483647!important;background:rgba(15,23,42,0.75)!important;
                    backdrop-filter:blur(12px)!important;position:fixed!important;inset:0!important;
                    width:100vw!important;height:100vh!important;align-items:center!important;
                    justify-content:center!important;cursor:${errorType === 'FEATURE_NOT_ALLOWED' ? 'pointer' : 'default'}!important;">
            <div onclick="event.stopPropagation()"
                 style="max-width:440px!important;width:90%!important;text-align:center!important;
                        padding:2.5rem!important;border-radius:16px!important;background:#fff!important;
                        box-shadow:0 25px 50px -12px rgba(0,0,0,0.25)!important;position:relative!important;
                        z-index:2147483647!important;cursor:default!important;
                        animation:fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1)!important;">
                <div style="display:flex;flex-direction:column;align-items:center;padding-bottom:1.5rem;">
                    <div style="background:${iconBg};color:${iconColor};width:64px;height:64px;border-radius:50%;
                                display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
                    </div>
                    <h2 style="font-size:1.5rem;font-weight:700;color:#0f172a;margin:0;font-family:Inter,sans-serif;">
                        Access Restricted
                    </h2>
                </div>
                <p style="font-size:1.05rem;color:#475569;line-height:1.6;margin:0 0 2rem;font-family:Inter,sans-serif;">
                    ${messageText}
                </p>
                <button onclick="window.location.href='${buttonLink}'"
                        style="width:100%!important;padding:1rem!important;font-size:1rem!important;font-weight:600!important;
                               font-family:Inter,sans-serif!important;cursor:pointer!important;border-radius:8px!important;
                               border:none!important;background:#0f172a!important;color:#fff!important;"
                        onmouseover="this.style.background='#1e293b'"
                        onmouseout="this.style.background='#0f172a'">
                    ${buttonText}
                </button>
            </div>
        </div>
        <style>
            @keyframes fadeInUp {
                from { opacity:0; transform:translateY(24px) scale(0.98); }
                to   { opacity:1; transform:translateY(0) scale(1); }
            }
        </style>
    `);
}
