/**
 * config/rbac-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * IN-APP RBAC MANAGER (Zero-Trust Backend Thin Client)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 2: Evaluates role-based permissions based on authoritative session
 *     context returned directly by the database RPC `get_session_context()`.
 *   - All role validation and permission assignments are stored and enforced
 *     in PostgreSQL (`public.role_permissions` and `shared.check_permission`).
 *   - Write mutations are checked at the database layer on every RPC.
 *   - This file provides client-side UI filtering (`hasRolePermission`, `filterNavigationForRole`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { SUB_FEATURES, SUB_FEATURES_MAP } from './sub-feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const RBAC_CACHE_STORAGE_KEY = 'salon_rbac_permissions_cache';
const RBAC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

export const ROLE_TYPES = {
    OWNER:        'Owner',
    MANAGER:      'Manager',
    RECEPTIONIST: 'Receptionist',
    STYLIST:      'Stylist'
};

export const UNIVERSAL_PERMISSION_KEY = 'ALL';

export const DEFAULT_ROLE_PERMISSIONS = {
    [ROLE_TYPES.OWNER]: [UNIVERSAL_PERMISSION_KEY]
};

/**
 * Safely parses raw database permission rows into a flat array of unique string keys.
 */
export function parsePermissionKeys(permRows) {
    const keys = [];
    (permRows || []).forEach(row => {
        if (!row) return;
        const raw = String(row.permission_key || row).trim();
        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) keys.push(...parsed);
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
 * Evaluates whether a specific permission key is allowed under the given permissions array.
 */
export function evaluatePermission(requiredKey, userPermissions = []) {
    if (!requiredKey) return true;
    if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;

    // 1. Wildcard check
    if (userPermissions.includes(UNIVERSAL_PERMISSION_KEY)) {
        return true;
    }

    // 2. Direct key match
    if (userPermissions.includes(requiredKey)) {
        return true;
    }

    // 3. Parent-child inheritance via SUB_FEATURES_MAP
    for (const [parentFeatureKey, children] of Object.entries(SUB_FEATURES_MAP)) {
        const hasChild = (children || []).some(child => (child?.key || child) === requiredKey);
        if (hasChild) {
            if (userPermissions.includes(parentFeatureKey)) {
                return true;
            }
            break;
        }
    }

    return false;
}

/**
 * Master async resolver: queries `get_session_context` and caches the RBAC profile.
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
        } catch (_) {}
    }

    try {
        const { data: sessionCtx, error: ctxErr } = await supabase.rpc('get_session_context');
        if (!ctxErr && sessionCtx?.permissions) {
            const permissionKeys = Array.isArray(sessionCtx.permissions) ? sessionCtx.permissions : [];
            const hasUniversalAccess = permissionKeys.includes(UNIVERSAL_PERMISSION_KEY);
            const roleName = sessionCtx.user?.role_name || '';
            const isOwner = roleName.toLowerCase() === 'owner' || hasUniversalAccess;

            const profile = {
                roleId: sessionCtx.user?.role_id || null,
                roleName: roleName,
                isOwner: isOwner,
                hasUniversalAccess: hasUniversalAccess,
                permissions: permissionKeys
            };

            try {
                sessionStorage.setItem(RBAC_CACHE_STORAGE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    profile
                }));
            } catch (_) {}

            return profile;
        }
    } catch (err) {
        console.warn('[RbacManager] Error querying session context:', err);
    }

    return getUserRoleAndPermissionsSync();
}

/**
 * Synchronous RBAC profile getter from session or local storage.
 */
export function getUserRoleAndPermissionsSync() {
    try {
        const rawCache = sessionStorage.getItem(RBAC_CACHE_STORAGE_KEY);
        if (rawCache) {
            return JSON.parse(rawCache).profile;
        }
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const userFeatures = JSON.parse(localStorage.getItem('userFeatures') || '[]');
        const userSubFeatures = JSON.parse(localStorage.getItem('userSubFeatures') || '[]');
        const combined = [...userFeatures, ...userSubFeatures];
        const roleName = ctx.user?.role_name || localStorage.getItem('role_name') || '';
        const isOwner = roleName.toLowerCase() === 'owner';

        return {
            roleId: ctx.user?.role_id || localStorage.getItem('role_id') || null,
            roleName: roleName,
            isOwner: isOwner,
            hasUniversalAccess: isOwner,
            permissions: isOwner ? [UNIVERSAL_PERMISSION_KEY] : combined
        };
    } catch (_) {}

    return {
        roleId: null,
        roleName: '',
        isOwner: false,
        hasUniversalAccess: false,
        permissions: []
    };
}

/**
 * Checks if the current user has permission for a specific feature or sub-feature.
 */
export function hasRolePermission(permissionKey, optionalProfile = null) {
    const profile = optionalProfile || getUserRoleAndPermissionsSync();
    if (profile.isOwner || profile.hasUniversalAccess) return true;
    return evaluatePermission(permissionKey, profile.permissions);
}

export function canAccessPage(featureKey) {
    return hasRolePermission(featureKey);
}

export function canPerformAction(subFeatureKey) {
    return hasRolePermission(subFeatureKey);
}

/**
 * Filters sidebar navigation items based on active role permissions.
 */
export function filterNavigationForRole(navItems = []) {
    const profile = getUserRoleAndPermissionsSync();
    if (profile.isOwner || profile.hasUniversalAccess) return navItems;

    return navItems.filter(item => {
        if (!item.featureKey) return true;
        return evaluatePermission(item.featureKey, profile.permissions);
    });
}

export function clearRbacCache() {
    try {
        sessionStorage.removeItem(RBAC_CACHE_STORAGE_KEY);
    } catch (_) {}
}
