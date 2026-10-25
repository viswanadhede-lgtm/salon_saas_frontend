/**
 * config/rbac-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * IN-APP RBAC MANAGER — Role-based access control & permission gatekeeper.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Governs in-app permissions for staff members based on their assigned role
 *   from `public.roles` and `public.role_permissions` tables.
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 1: Subscription State Manager (Is the salon account active or expired?)
 *   - Gate 2: IN-APP RBAC MANAGER (What is this user's role, and what are they permitted to do?)
 *   - Gate 3: Plan Features Manager (Does the salon's commercial plan include this module?)
 *
 * STORAGE PATTERN:
 *   Reads from the unified single-row `public.role_permissions` schema where
 *   permissions are stored as a JSON stringified array in the `permission_key` column.
 *
 * SECTIONS:
 *   1. DEFAULT_ROLES & BASE MATRICES — Pre-configured baseline role profiles.
 *   2. DATABASE RESOLVER & CACHE     — Supabase loader & sessionStorage caching.
 *   3. PERMISSION EVALUATION LOGIC   — Core permission checking algorithms.
 *   4. INTEGRATION & EXPORT API      — Public helpers (hasRolePermission, filterNavigation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { SUB_FEATURES, SUB_FEATURES_MAP } from './sub-feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const RBAC_CACHE_STORAGE_KEY = 'salon_rbac_permissions_cache';
const RBAC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — DEFAULT ROLES & BASE MATRICES
// Standard baseline role definitions for out-of-the-box system setups.
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_TYPES = {
    OWNER:        'Owner',
    MANAGER:      'Manager',
    RECEPTIONIST: 'Receptionist',
    STYLIST:      'Stylist'
};

/**
 * Universal wildcard key that grants unrestricted access to everything.
 * Used for Salon Owners and Super Admins.
 */
export const UNIVERSAL_PERMISSION_KEY = 'ALL';

/**
 * Baseline default permissions matrix for standard roles.
 * Used when a custom role has not yet saved explicit permissions in the DB.
 */
export const DEFAULT_ROLE_PERMISSIONS = {

    // ── OWNER: Unrestricted master access ─────────────────────────────────────
    [ROLE_TYPES.OWNER]: [UNIVERSAL_PERMISSION_KEY],

    // ── MANAGER: Comprehensive operations & staff management ──────────────────
    [ROLE_TYPES.MANAGER]: [
        // Sidebar Pages (Group A)
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
        FEATURES.MARKETING_MEMBERSHIPS,
        FEATURES.MARKETING_CAMPAIGNS,
        FEATURES.INTEGRATIONS_WEBSITE_BOOKING,
        FEATURES.INTEGRATIONS_WHATSAPP,
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.REPORTS_ACCESS,
        FEATURES.ANALYTICS_EXPENSES,
        FEATURES.COMPANY_SETTINGS,
        FEATURES.USER_MANAGEMENT,
        FEATURES.BRANCH_MANAGEMENT,

        // Sub-Pages (Group B)
        FEATURES.DASHBOARD_TODAYS_REVENUE,
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,
        FEATURES.REPORTS_CATEGORY,
        FEATURES.REPORTS_DETAIL,
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
        FEATURES.USER_GUIDE,

        // Core Operational Sub-Features
        SUB_FEATURES.DASHBOARD_CREATE_BOOKING,
        SUB_FEATURES.CREATE_BOOKING,
        SUB_FEATURES.UPDATE_BOOKING,
        SUB_FEATURES.CANCEL_BOOKING,
        SUB_FEATURES.COLLECT_PAYMENT,
        SUB_FEATURES.BOOKING_REFUND,
        SUB_FEATURES.CUSTOMER_CREATE,
        SUB_FEATURES.CUSTOMER_EDIT,
        SUB_FEATURES.CUSTOMER_EXPORT,
        SUB_FEATURES.CREATE_STAFF,
        SUB_FEATURES.UPDATE_STAFF,
        SUB_FEATURES.CREATE_STAFF_SCHEDULE,
        SUB_FEATURES.EDIT_STAFF_SCHEDULE,
        SUB_FEATURES.CREATE_SERVICE,
        SUB_FEATURES.UPDATE_SERVICE,
        SUB_FEATURES.POS_CHECKOUT,
        SUB_FEATURES.POS_CREATE_CUSTOMER,
        SUB_FEATURES.CREATE_PRODUCT,
        SUB_FEATURES.UPDATE_PRODUCT,
        SUB_FEATURES.POS_ISSUE_REFUND,
        SUB_FEATURES.POS_EXPORT_SALES,
        SUB_FEATURES.PENDING_PAYMENTS_COLLECT,
        SUB_FEATURES.PAYMENTS_HISTORY_EXPORT,
        SUB_FEATURES.CREATE_OFFER,
        SUB_FEATURES.UPDATE_OFFER,
        SUB_FEATURES.CREATE_COUPON,
        SUB_FEATURES.UPDATE_COUPON,
        SUB_FEATURES.CREATE_MEMBERSHIP,
        SUB_FEATURES.ASSIGN_MEMBERSHIP,
        SUB_FEATURES.EXPENSES_CREATE,
        SUB_FEATURES.EXPENSES_UPDATE,
        SUB_FEATURES.REPORT_DETAIL_EXPORT,
        SUB_FEATURES.BRANCH_SWITCH,
        SUB_FEATURES.NOTIFICATIONS_MARK_READ,
        SUB_FEATURES.SUPPORT_SUBMIT_TICKET
    ],

    // ── RECEPTIONIST: Front-desk bookings, billing & customer service ────────
    [ROLE_TYPES.RECEPTIONIST]: [
        // Sidebar Pages (Group A)
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.STAFF_SCHEDULES,
        FEATURES.POS_SYSTEM,
        FEATURES.PENDING_PAYMENTS,
        FEATURES.PAYMENTS_HISTORY,

        // Sub-Pages (Group B)
        FEATURES.DASHBOARD_TODAYS_REVENUE,
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,
        FEATURES.NOTIFICATIONS,
        FEATURES.SUPPORT,
        FEATURES.USER_GUIDE,

        // Front-Desk Actions
        SUB_FEATURES.DASHBOARD_CREATE_BOOKING,
        SUB_FEATURES.CREATE_BOOKING,
        SUB_FEATURES.UPDATE_BOOKING,
        SUB_FEATURES.CANCEL_BOOKING,
        SUB_FEATURES.COLLECT_PAYMENT,
        SUB_FEATURES.UPCOMING_COLLECT_PAYMENT,
        SUB_FEATURES.CUSTOMER_CREATE,
        SUB_FEATURES.CUSTOMER_EDIT,
        SUB_FEATURES.POS_CHECKOUT,
        SUB_FEATURES.POS_CREATE_CUSTOMER,
        SUB_FEATURES.PENDING_PAYMENTS_COLLECT,
        SUB_FEATURES.NOTIFICATIONS_MARK_READ,
        SUB_FEATURES.SUPPORT_SUBMIT_TICKET
    ],

    // ── STYLIST: Service provider self-service ────────────────────────────────
    [ROLE_TYPES.STYLIST]: [
        // Pages
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.STAFF_SCHEDULES,
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,
        FEATURES.NOTIFICATIONS,
        FEATURES.SUPPORT,
        FEATURES.USER_GUIDE,

        // Actions
        SUB_FEATURES.UPDATE_BOOKING,
        SUB_FEATURES.NOTIFICATIONS_MARK_READ,
        SUB_FEATURES.SUPPORT_SUBMIT_TICKET
    ]
};


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — DATABASE RESOLVER & FAST SESSION CACHE
// Loads the single JSON-encoded row from `public.role_permissions`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parses raw database permission rows into a flat array of unique string keys.
 * Handles single-row JSON string arrays, comma-separated strings, and legacy rows.
 */
export function parsePermissionKeys(permRows) {
    const keys = [];
    (permRows || []).forEach(row => {
        if (!row || !row.permission_key) return;
        const raw = String(row.permission_key).trim();

        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    keys.push(...parsed);
                }
            } catch {
                keys.push(raw);
            }
        } else if (raw.includes(',')) {
            keys.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
        } else {
            keys.push(raw);
        }
    });

    return [...new Set(keys)];
}

/**
 * Resolves active user session context from localStorage.
 */
function resolveUserContext() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        const roleId = ctx.user?.role_id || localStorage.getItem('role_id') || null;
        const roleName = ctx.user?.role_name || ctx.user?.role || localStorage.getItem('role_name') || null;
        const userId = ctx.user?.id || ctx.user?.user_id || localStorage.getItem('user_id') || null;

        return { companyId, roleId, roleName, userId };
    } catch {
        return {
            companyId: localStorage.getItem('company_id') || null,
            roleId: localStorage.getItem('role_id') || null,
            roleName: localStorage.getItem('role_name') || null,
            userId: localStorage.getItem('user_id') || null
        };
    }
}

/**
 * Queries Supabase `public.role_permissions` for the role's single permissions row.
 */
async function fetchRolePermissionsFromDb(roleId, companyId) {
    if (!roleId || !companyId) return null;

    try {
        const { data, error } = await supabase
            .from('role_permissions')
            .select('role_id, role_name, permission_key, status')
            .eq('role_id', roleId)
            .eq('company_id', companyId)
            .eq('status', 'active');

        if (error) {
            console.warn('[RbacManager] Error querying role_permissions:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.warn('[RbacManager] Exception fetching role_permissions:', err);
        return null;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PERMISSION EVALUATION LOGIC
// Evaluates keys against role permissions, handling 'ALL' wildcard and inheritance.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core evaluation engine: checks if a specific permission key is allowed.
 *
 * @param {string} requiredKey - The feature or sub-feature key being checked
 * @param {Array<string>} userPermissions - The active user's permissions array
 * @returns {boolean} True if permitted, false otherwise
 */
export function evaluatePermission(requiredKey, userPermissions = []) {
    if (!requiredKey) return true;
    if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;

    // 1. Wildcard check: 'ALL' grants unrestricted access
    if (userPermissions.includes(UNIVERSAL_PERMISSION_KEY)) {
        return true;
    }

    // 2. Direct key match: exact match on feature or sub-feature key
    if (userPermissions.includes(requiredKey)) {
        return true;
    }

    // 3. Parent-child inheritance check:
    // If checking a sub-feature, find its parent page in SUB_FEATURES_MAP.
    // If the role has parent page access, check if granular restrictions apply.
    for (const [parentFeatureKey, children] of Object.entries(SUB_FEATURES_MAP)) {
        const hasChild = (children || []).some(child => (child?.key || child) === requiredKey);
        if (hasChild) {
            // Found parent page! If user has parent page permission, grant action
            if (userPermissions.includes(parentFeatureKey)) {
                return true;
            }
            break;
        }
    }

    return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — INTEGRATION & EXPORT API
// Public methods used across UI templates, action buttons, and Global Auth Guard.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master async resolver: returns the complete RBAC profile for the active user.
 * Reads from sessionStorage cache when valid, hits Supabase when expired or forced.
 *
 * @param {boolean} forceRefresh - If true, bypasses sessionStorage cache
 * @returns {Promise<Object>} Evaluated RBAC profile
 */
export async function getUserRoleAndPermissions(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const rawCache = sessionStorage.getItem(RBAC_CACHE_STORAGE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache);
                if (parsed.timestamp && (Date.now() - parsed.timestamp < RBAC_CACHE_TTL_MS)) {
                    return parsed.profile;
                }
            }
        } catch { /* Cache read error: fall through */ }
    }

    const { companyId, roleId, roleName } = resolveUserContext();
    const isOwner = (roleName || '').toLowerCase() === 'owner';

    let permissions = [];

    if (isOwner) {
        // Owners always get universal wildcard
        permissions = [UNIVERSAL_PERMISSION_KEY];
    } else if (roleId && companyId) {
        const permRows = await fetchRolePermissionsFromDb(roleId, companyId);
        if (permRows && permRows.length > 0) {
            permissions = parsePermissionKeys(permRows);
        } else if (roleName && DEFAULT_ROLE_PERMISSIONS[roleName]) {
            // Fallback to standard role defaults if DB has no custom row yet
            permissions = DEFAULT_ROLE_PERMISSIONS[roleName];
        }
    } else if (roleName && DEFAULT_ROLE_PERMISSIONS[roleName]) {
        permissions = DEFAULT_ROLE_PERMISSIONS[roleName];
    }

    const profile = {
        roleId,
        roleName: roleName || 'Staff',
        isOwner,
        permissions,
        hasUniversalAccess: permissions.includes(UNIVERSAL_PERMISSION_KEY)
    };

    // Cache profile in sessionStorage
    try {
        sessionStorage.setItem(RBAC_CACHE_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            profile
        }));
    } catch { /* Non-blocking */ }

    return profile;
}

/**
 * Synchronously retrieves cached permissions for instant template rendering.
 * @returns {Object} Cached RBAC profile
 */
export function getUserRoleAndPermissionsSync() {
    try {
        const rawCache = sessionStorage.getItem(RBAC_CACHE_STORAGE_KEY);
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            return parsed.profile;
        }
    } catch { /* fall through */ }

    // Fallback: check localStorage role_name for quick optimistic render
    const roleName = localStorage.getItem('role_name') || '';
    const isOwner = roleName.toLowerCase() === 'owner';

    return {
        roleId: localStorage.getItem('role_id') || null,
        roleName: roleName || 'Staff',
        isOwner,
        permissions: isOwner ? [UNIVERSAL_PERMISSION_KEY] : (DEFAULT_ROLE_PERMISSIONS[roleName] || []),
        hasUniversalAccess: isOwner
    };
}

/**
 * Universal RBAC permission checker for any feature or sub-feature key.
 * Used to conditionally show/hide action buttons or disable sensitive inputs.
 *
 * @param {string} permissionKey - Key from FEATURES or SUB_FEATURES
 * @param {Object} [optionalProfile] - Optional pre-loaded profile to avoid cache lookup
 * @returns {boolean} True if permitted by role, false otherwise
 */
export function hasRolePermission(permissionKey, optionalProfile = null) {
    const profile = optionalProfile || getUserRoleAndPermissionsSync();
    if (profile.isOwner || profile.hasUniversalAccess) return true;
    return evaluatePermission(permissionKey, profile.permissions);
}

/**
 * Specific check for page-level access (FEATURES).
 * @param {string} featureKey - Key from FEATURES
 * @returns {boolean} True if the role can visit this page
 */
export function canAccessPage(featureKey) {
    return hasRolePermission(featureKey);
}

/**
 * Specific check for action-level permissions (SUB_FEATURES).
 * @param {string} subFeatureKey - Key from SUB_FEATURES
 * @returns {boolean} True if the role can execute this action
 */
export function canPerformAction(subFeatureKey) {
    return hasRolePermission(subFeatureKey);
}

/**
 * Filters a list of navigation menu items based on the user's role permissions.
 * Useful for sidebar and header navigation rendering.
 *
 * @param {Array<Object>} navItems - Array of { label, route, featureKey }
 * @returns {Array<Object>} Filtered array containing only permitted items
 */
export function filterNavigationForRole(navItems = []) {
    const profile = getUserRoleAndPermissionsSync();
    if (profile.isOwner || profile.hasUniversalAccess) return navItems;

    return navItems.filter(item => {
        if (!item.featureKey) return true; // Items without key (like divider) remain
        return evaluatePermission(item.featureKey, profile.permissions);
    });
}

/**
 * Clears the RBAC session cache.
 * Call this immediately whenever role permissions are modified in `roles-permissions.html`.
 */
export function clearRbacCache() {
    try {
        sessionStorage.removeItem(RBAC_CACHE_STORAGE_KEY);
    } catch { /* Non-blocking */ }
}
