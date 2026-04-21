import { supabase } from '../lib/supabase.js';
import { FEATURES } from '../config/feature-registry.js';
import { SUB_FEATURES_MAP } from '../config/sub-feature-registry.js';
import { initSubFeatures } from './sub-features/sub-feature-manager.js';
import { applySubFeatureGates } from './sub-features/sub-feature-gate.js';
import { initGlobalBookingModal } from './global-booking-modal.js';

// ─── Route → Feature mapping ──────────────────────────────────────────────────
const ROUTE_MAP = {
    '/dashboard.html':             FEATURES.DASHBOARD_ACCESS,
    '/bookings.html':              FEATURES.BOOKINGS_MANAGEMENT,
    '/customers.html':             FEATURES.CUSTOMERS_MANAGEMENT,
    '/staff.html':                 FEATURES.STAFF_MANAGEMENT,
    '/staff-schedule.html':        FEATURES.STAFF_SCHEDULES,
    '/services.html':              FEATURES.SERVICES_MANAGEMENT,
    '/pos.html':                   FEATURES.POS_SYSTEM,
    '/products.html':              FEATURES.PRODUCT_MANAGEMENT,
    '/sales-history.html':         FEATURES.SALES_HISTORY,
    '/pending-payments.html':      FEATURES.PENDING_PAYMENTS,
    '/payments-history.html':      FEATURES.PAYMENTS_HISTORY,
    '/offers.html':                FEATURES.MARKETING_OFFERS,
    '/coupons.html':               FEATURES.MARKETING_COUPONS,
    '/memberships.html':           FEATURES.MARKETING_MEMBERSHIPS,
    '/ad-campaigns.html':          FEATURES.MARKETING_CAMPAIGNS,
    '/overview.html':              FEATURES.ANALYTICS_OVERVIEW,
    '/reports.html':               FEATURES.REPORTS_ACCESS,
    '/report-detail.html':         FEATURES.REPORTS_ACCESS,
    '/expenses.html':              FEATURES.ANALYTICS_EXPENSES,
    '/company.html':               FEATURES.COMPANY_SETTINGS,
    '/branches.html':              FEATURES.BRANCH_MANAGEMENT,
    '/users.html':                 FEATURES.USER_MANAGEMENT,
    '/roles-permissions.html':     FEATURES.ROLES_PERMISSIONS,
    '/custom-fields.html':         FEATURES.CUSTOM_FIELDS,
    '/billing-subscription.html':  FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
};

// ─── Plan → Feature access map ────────────────────────────────────────────────
// ALL_FEATURES: the complete list of every feature key
const ALL_FEATURES = Object.values(FEATURES);

// Plan UUID → feature list mapping
// Owners with permission_key = 'ALL' always get everything.
// This map is used only for non-Owner roles.
const PLAN_FEATURES = {
    // plan_01 — Basic
    'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce': [
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.STAFF_MANAGEMENT,
        FEATURES.STAFF_SCHEDULES,
        FEATURES.SERVICES_MANAGEMENT,
        FEATURES.PENDING_PAYMENTS,
        FEATURES.PAYMENTS_HISTORY,
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.COMPANY_SETTINGS,
        FEATURES.BRANCH_MANAGEMENT,
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLES_PERMISSIONS,
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
    ],
    // plan_02 — Advance
    'b42bcd41-217a-4ddb-9451-20e040984277': [
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
        FEATURES.MARKETING_OFFERS,
        FEATURES.MARKETING_COUPONS,
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.REPORTS_ACCESS,
        FEATURES.ANALYTICS_EXPENSES,
        FEATURES.COMPANY_SETTINGS,
        FEATURES.BRANCH_MANAGEMENT,
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLES_PERMISSIONS,
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
    ],
    // plan_03 — Pro
    'b32fe38d-a715-4166-acf1-b970bd845c21': ALL_FEATURES,
    // plan_04 / Enterprise or trial — full access
    '7e0af07f-b57b-40e7-a23a-6e8104c8033c': ALL_FEATURES
};
// Default: any unrecognized plan_id gets all features (fail-open for trials)
const DEFAULT_FEATURES = ALL_FEATURES;

// ─── Token Refresh ────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
const SUPABASE_ANON = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';
let refreshInterval   = null;
let heartbeatInterval = null;

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

function setupTokenRefresh() {
    if (refreshInterval) return;
    refreshInterval = setInterval(() => {
        console.log('[Auth Guard] Running scheduled token refresh...');
        silentTokenRefresh();
    }, 50 * 60 * 1000); // every 50 minutes
}

// ─── Hourly Heartbeat ─────────────────────────────────────────────────────────
// Re-validates subscription, features and role_permissions silently every hour.
function setupHourlyHeartbeat() {
    if (heartbeatInterval) return;

    heartbeatInterval = setInterval(async () => {
        console.log('[Auth Guard] Hourly heartbeat running...');
        try {
            const company_id = localStorage.getItem('company_id');
            const user_id_raw = localStorage.getItem('token');
            if (!company_id) return;

            // 1. Re-check subscription
            const { data: compRows } = await supabase.from('companies')
                .select('plan_id, plan_name, subscription_status, subscription_type, subscription_end_date')
                .eq('company_id', company_id);

            const company = compRows?.[0];
            if (!company) return;

            const today = new Date();
            const endDate = company.subscription_end_date ? new Date(company.subscription_end_date) : null;
            const isExpired = !endDate || endDate <= today;

            if (isExpired) {
                clearInterval(heartbeatInterval);
                console.warn('[Auth Guard] Heartbeat: subscription expired.');
                showAuthBlockModal('SUBSCRIPTION_INACTIVE',
                    'Your subscription has expired. Please renew to continue.',
                    'Renew', 'plans.html?flow=renew');
                return;
            }

            // 2. Re-derive features from plan
            const planFeatures = PLAN_FEATURES[company.plan_id] || DEFAULT_FEATURES;

            // 3. Re-check role permissions
            const cachedContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            const role_id = localStorage.getItem('role_id');

            let userFeatures = [];
            let userSubFeatures = [];

            if (role_id) {
                const { data: permRows } = await supabase.from('role_permissions')
                    .select('permission_key')
                    .eq('role_id', role_id)
                    .eq('company_id', company_id);

                const keys = permRows?.map(p => p.permission_key) || [];
                const hasAllPerms = keys.includes('ALL');
                const allMainFeatures = Object.values(FEATURES);

                if (hasAllPerms) {
                    const planFeatures = PLAN_FEATURES[company.plan_id] || DEFAULT_FEATURES;
                    userFeatures = planFeatures;
                    userFeatures.forEach(feat => {
                        const children = SUB_FEATURES_MAP[feat] || [];
                        children.forEach(sf => userSubFeatures.push(sf.key));
                    });
                } else {
                    userFeatures = keys.filter(k => allMainFeatures.includes(k));
                    userSubFeatures = keys.filter(k => !allMainFeatures.includes(k));
                }
            } else {
                userFeatures = PLAN_FEATURES[company.plan_id] || DEFAULT_FEATURES;
                userFeatures.forEach(feat => {
                    const children = SUB_FEATURES_MAP[feat] || [];
                    children.forEach(sf => userSubFeatures.push(sf.key));
                });
            }

            // 5. Update cache
            localStorage.setItem('userFeatures',    JSON.stringify(userFeatures));
            localStorage.setItem('userSubFeatures', JSON.stringify(userSubFeatures));

            // 6. Check current page is still allowed
            const path = window.location.pathname;
            const filename = path.substring(path.lastIndexOf('/')) || '/';
            const currentFeatureKey = ROUTE_MAP[filename] || null;

            if (currentFeatureKey && !userFeatures.includes(currentFeatureKey)) {
                clearInterval(heartbeatInterval);
                console.warn('[Auth Guard] Heartbeat: current page no longer allowed.');
                showAuthBlockModal('FEATURE_NOT_ALLOWED',
                    "You no longer have access to this feature.",
                    'Go to Dashboard', 'dashboard.html');
                return;
            }

            // 7. Re-apply sub-feature gates with refreshed permissions
            initSubFeatures();
            applySubFeatureGates();

            console.log('[Auth Guard] Heartbeat complete ✓ Subscription active, features refreshed.');

        } catch (err) {
            console.warn('[Auth Guard] Heartbeat error (will retry next hour):', err.message);
        }
    }, 60 * 60 * 1000); // every 60 minutes
}

// ─── Main Guard ───────────────────────────────────────────────────────────────
export async function runGlobalAuthGuard() {
    const path     = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';
    const featureKey = ROUTE_MAP[filename] || null;

    // Public routes — skip auth
    if (!featureKey) {
        console.log(`[Auth Guard] Public route: ${filename}. Bypassing.`);
        removeAuthSpinner();
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('[Auth Guard] No token found → signin');
        window.location.href = 'signin.html';
        return;
    }

    // ── Optimistic cache hit ───────────────────────────────────────────────────
    const cachedFeaturesStr = localStorage.getItem('userFeatures');
    if (cachedFeaturesStr) {
        try {
            const cachedFeatures = JSON.parse(cachedFeaturesStr);
            if (Array.isArray(cachedFeatures)) {
                console.log('[Auth Guard] Cache hit — instant unlock.');
                setupTokenRefresh();
                setupHourlyHeartbeat();

                if (!cachedFeatures.includes(featureKey)) {
                    showAuthBlockModal('FEATURE_NOT_ALLOWED',
                        "You currently don't have access to this feature. Please upgrade your plan.",
                        'Upgrade', 'plans.html?flow=upgrade');
                    return;
                }

                populateGlobalHeader();
                initGlobalBookingModal();
                initSubFeatures();
                applySubFeatureGates();
                removeAuthSpinner();
                return;
            }
        } catch (e) { /* fall through to cold start */ }
    }

    // ── Cold start: validate token + load context from Supabase ───────────────
    try {
        console.log('[Auth Guard] Cold start — validating session via Supabase...');

        // 1. Validate token
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
        });

        if (userRes.status === 401) {
            // Try silent refresh
            const refreshed = await silentTokenRefresh();
            if (!refreshed) {
                showAuthBlockModal('INVALID_SESSION', 'Your session has expired. Please sign in again.', 'Sign In', 'signin.html');
                return;
            }
        } else if (!userRes.ok) {
            showAuthBlockModal('ERROR', 'Unable to verify session. Please try again.', 'Refresh', window.location.href);
            return;
        }

        const authUser = await userRes.json().catch(() => null);
        const user_id  = authUser?.id;
        if (!user_id) {
            showAuthBlockModal('INVALID_SESSION', 'Your session has expired. Please sign in again.', 'Sign In', 'signin.html');
            return;
        }

        // 2. Load user row
        const company_id  = localStorage.getItem('company_id');
        const branch_id   = localStorage.getItem('active_branch_id');

        const { data: userRows } = await supabase.from('users')
            .select('company_id, branch_id, role_id, role_name, name, email, phone, status')
            .eq('user_id', user_id);

        const userRow = userRows?.[0];
        if (!userRow) {
            showAuthBlockModal('ERROR', 'User profile not found. Please contact support.', 'Sign In', 'signin.html');
            return;
        }

        if (userRow.status === 'deleted' || userRow.status === 'inactive') {
            showAuthBlockModal('ERROR', 'Your account has been deactivated. Please contact your administrator.', 'Sign In', 'signin.html');
            localStorage.removeItem('token');
            return;
        }

        const resolvedCompanyId = company_id || userRow.company_id;
        const resolvedBranchId  = branch_id  || userRow.branch_id;

        // 3. Load company (subscription check)
        const { data: compRows } = await supabase.from('companies')
            .select('plan_id, plan_name, subscription_status, subscription_type, subscription_end_date')
            .eq('company_id', resolvedCompanyId);

        const company = compRows?.[0];
        if (!company) {
            showAuthBlockModal('ERROR', 'Company data not found. Please contact support.', 'Sign In', 'signin.html');
            return;
        }

        // 4. Subscription status check
        const today = new Date();
        const endDate = company.subscription_end_date ? new Date(company.subscription_end_date) : null;
        const isExpired = !endDate || endDate <= today;

        if (isExpired) {
            showAuthBlockModal('SUBSCRIPTION_INACTIVE',
                'Your subscription has expired. Please subscribe to access the dashboard.',
                'Renew', 'plans.html?flow=renew');
            return;
        }

        // 5. Role permissions — Read directly from the database table
        const { data: permRows } = await supabase.from('role_permissions')
            .select('permission_key')
            .eq('role_id', userRow.role_id)
            .eq('company_id', resolvedCompanyId);

        const keys = permRows?.map(p => p.permission_key) || [];
        const hasAllPerms = keys.includes('ALL');
        const allMainFeatures = Object.values(FEATURES);

        let userFeatures = [];
        let userSubFeatures = [];

        if (hasAllPerms) {
            // For roles with 'ALL' (e.g., Owners), fall back to checking the subscription plan
            const planFeatures = PLAN_FEATURES[company.plan_id] || DEFAULT_FEATURES;
            userFeatures = planFeatures;
            
            userFeatures.forEach(feat => {
                const children = SUB_FEATURES_MAP[feat] || [];
                children.forEach(sf => userSubFeatures.push(sf.key));
            });
        } else {
            // Split raw database permission keys into main vs sub-features
            userFeatures = keys.filter(k => allMainFeatures.includes(k));
            userSubFeatures = keys.filter(k => !allMainFeatures.includes(k));
        }

        // 8. Check if current page's feature is allowed
        if (!userFeatures.includes(featureKey)) {
            showAuthBlockModal('FEATURE_NOT_ALLOWED',
                "You currently don't have access to this feature. Please upgrade your plan.",
                'Upgrade', 'plans.html?flow=upgrade');
            return;
        }

        // 9. Load profile for header hydration
        const { data: profileRows } = await supabase.from('profiles')
            .select('first_name, last_name, phone, email, joined_on, emergency_contact_name, emergency_contact_number')
            .eq('user_id', user_id);
        const profile = profileRows?.[0];

        // 10. Load branches for branch switcher
        const { data: branches } = await supabase.from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', resolvedCompanyId)
            .eq('status', 'active');

        // 11. Build and cache app context
        const appContext = {
            user: {
                user_id,
                name:       userRow.name,
                email:      userRow.email,
                phone:      userRow.phone,
                role_name:  userRow.role_name,
                first_name: profile?.first_name || '',
                last_name:  profile?.last_name  || '',
                joined_on:  profile?.joined_on  || '',
                emergency_name:  profile?.emergency_contact_name || '',
                emergency_phone: profile?.emergency_contact_number || ''
            },
            company: {
                company_id:          resolvedCompanyId,
                plan:                company.plan_name || 'Free Trial',
                subscription_status: company.subscription_status,
                subscription_type:   company.subscription_type
            },
            branches: (branches || []).map(b => ({ id: b.branch_id, branch_id: b.branch_id, branch_name: b.branch_name })),
            current_branch_id: resolvedBranchId
        };

        // 12. Persist to cache
        localStorage.setItem('userFeatures',    JSON.stringify(userFeatures));
        localStorage.setItem('userSubFeatures', JSON.stringify(userSubFeatures));
        localStorage.setItem('appContext',      JSON.stringify(appContext));
        if (!localStorage.getItem('company_id')) localStorage.setItem('company_id', resolvedCompanyId);
        if (!localStorage.getItem('active_branch_id')) localStorage.setItem('active_branch_id', resolvedBranchId);

        // 13. Start background token refresh + hourly heartbeat
        setupTokenRefresh();
        setupHourlyHeartbeat();

        // 14. Hydrate UI and reveal page
        populateGlobalHeader();
        initGlobalBookingModal();
        initSubFeatures();
        applySubFeatureGates();
        removeAuthSpinner();

        console.log('[Auth Guard] Cold start complete. Page unlocked ✓');

    } catch (err) {
        console.error('[Auth Guard] Unexpected error:', err);
        showAuthBlockModal('ERROR', 'A network error occurred while verifying access.', 'Refresh Page', window.location.href);
    }
}

document.addEventListener('DOMContentLoaded', runGlobalAuthGuard);
window.populateGlobalHeader = populateGlobalHeader;

// ─── Global Header Hydration ──────────────────────────────────────────────────
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

        // Profile dropdown
        if (profileMenu && context.user) {
            const nameEl = profileMenu.querySelector('.dropdown-name');
            const roleEl = profileMenu.querySelector('.dropdown-role');
            if (nameEl && context.user.name)      nameEl.textContent = context.user.name;
            if (roleEl && context.user.role_name) roleEl.textContent = context.user.role_name;
        }

        // Avatar
        let avatarUrl = '';
        if (context.user?.name) {
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

            if (profileAvatarImg && avatarUrl)                          profileAvatarImg.src  = avatarUrl;
            if (profileNameDisplay && context.user.name)                profileNameDisplay.textContent = context.user.name;
            if (profileRoleDisplay && context.user.role_name)           profileRoleDisplay.textContent = context.user.role_name;
            if (profileFirstName   && context.user.first_name)          profileFirstName.value  = context.user.first_name;
            if (profileLastName    && context.user.last_name)           profileLastName.value   = context.user.last_name;
            if (profilePhone       && context.user.phone)               profilePhone.value      = context.user.phone;
            if (profileEmail       && context.user.email)               profileEmail.value      = context.user.email;
            if (profileRoleInput   && context.user.role_name)           profileRoleInput.value  = context.user.role_name;
            if (profileJoined      && context.user.joined_on)           profileJoined.value     = context.user.joined_on;

            const profileEmergencyName = document.getElementById('profileEmergencyName');
            const profileEmergencyPhone = document.getElementById('profileEmergencyPhone');
            if (profileEmergencyName && context.user.emergency_name)    profileEmergencyName.value = context.user.emergency_name;
            if (profileEmergencyPhone && context.user.emergency_phone)  profileEmergencyPhone.value = context.user.emergency_phone;
        }

        // Branch dropdown
        if (branchSelect && Array.isArray(context.branches) && context.branches.length > 0) {
            branchSelect.innerHTML = '';
            context.branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value       = b.branch_id || b.id;
                opt.textContent = b.branch_name || b.name;
                branchSelect.appendChild(opt);
            });

            const saved = localStorage.getItem('active_branch_id');
            branchSelect.value = saved || context.current_branch_id || context.branches[0].branch_id;

            branchSelect.addEventListener('change', e => {
                localStorage.setItem('active_branch_id', e.target.value);
            });
        }

    } catch (e) {
        console.error('[Auth Guard] Failed to hydrate header:', e);
    }
}

// ─── Auth Spinner ─────────────────────────────────────────────────────────────
function removeAuthSpinner() {
    document.documentElement.style.display = '';
    const loader      = document.getElementById('bbAuthLoader');
    const loaderStyle = document.getElementById('bbLoaderStyle');
    if (loader)      loader.remove();
    if (loaderStyle) loaderStyle.remove();
}

// ─── Auth Block Modal (full-screen, un-closable) ──────────────────────────────
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
