import { ROLE_PERMISSIONS } from '../../config/role-registry.js';

let currentRole = null;
let ready = false;

/**
 * Initializes the role manager with the given role.
 * 
 * @param {string} role - The role string (e.g., 'owner', 'manager').
 */
export function initializeRole(role) {
    if (!role) {
        console.warn('initializeRole called without a valid role.');
        return;
    }
    currentRole = role;
    ready = true;
}

/**
 * Returns the currently active role.
 * 
 * @returns {string|null} The current role string, or null if not set.
 */
export function getRole() {
    return currentRole;
}

/**
 * Checks if the role system has been initialized.
 * 
 * @returns {boolean} True if a role has been set.
 */
export function isRoleReady() {
    return ready;
}

/**
 * Checks if the current role has permission to access the specified feature.
 * 
 * @param {string} featureKey - The identifier of the feature from the feature registry.
 * @returns {boolean} True if the current role has access to the feature.
 */
export function hasPermission(featureKey) {
    if (!ready || !currentRole || !featureKey) {
        return false;
    }

    const permissions = ROLE_PERMISSIONS[currentRole];

    if (!permissions) {
        console.warn(`Unknown role encountered in RBAC: ${currentRole}`);
        return false;
    }
    
    if (!Array.isArray(permissions)) {
        return false;
    }

    if (permissions.includes('*')) {
        return true; // Full access wildcard
    }

    return permissions.includes(featureKey);
}
