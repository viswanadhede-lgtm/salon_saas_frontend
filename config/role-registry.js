import { FEATURES } from './feature-registry.js';

/**
 * Defines the core roles supported by the platform.
 */
export const ROLES = {
    OWNER: 'owner',
    MANAGER: 'manager',
    RECEPTIONIST: 'receptionist',
    STAFF: 'staff'
};

/**
 * Maps each role to an array of feature keys that they are allowed to access.
 * The owner role uses '*' to indicate unrestricted, full access.
 * 
 * IMPORTANT:
 * Permissions must reference keys from FEATURES in feature-registry.js.
 * Do not use raw strings to avoid mismatches.
 */
export const ROLE_PERMISSIONS = {
    [ROLES.OWNER]: ['*'],
    
    [ROLES.MANAGER]: [
        FEATURES.STAFF_MANAGEMENT,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.SERVICES_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.POS_SYSTEM,
        FEATURES.SALES_HISTORY,
        FEATURES.MARKETING_OFFERS,
        FEATURES.MARKETING_COUPONS,
        FEATURES.VIEW_SCHEDULE
    ],
    
    [ROLES.RECEPTIONIST]: [
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.POS_SYSTEM,
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.VIEW_SCHEDULE
    ],
    
    [ROLES.STAFF]: [
        FEATURES.VIEW_SCHEDULE
    ]
};
