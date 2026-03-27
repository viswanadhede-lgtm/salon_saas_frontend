/**
 * SUB_FEATURES represents granular actions, buttons, and specific UI elements 
 * within a page that can be individually allowed or restricted based on a user's role.
 */
export const SUB_FEATURES = {
    // ---- DASHBOARD ----
    DASHBOARD_CREATE_BOOKING: 'dashboard_create_booking',
    
    // ---- BOOKINGS ----
    BOOKING_CREATE: 'booking_create',
    BOOKING_EDIT: 'booking_edit',
    BOOKING_CANCEL: 'booking_cancel',
    BOOKING_VIEW_ALL: 'booking_view_all',

    // ---- SERVICES ----
    SERVICE_CREATE: 'service_create',
    SERVICE_EDIT: 'service_edit',
    SERVICE_DELETE: 'service_delete',
    SERVICE_CATEGORY_MANAGE: 'service_category_manage',

    // ---- POS / SALES ----
    POS_CHECKOUT: 'pos_checkout',
    POS_APPLY_DISCOUNT: 'pos_apply_discount',
    POS_ISSUE_REFUND: 'pos_issue_refund',

    // ---- CUSTOMERS ----
    CUSTOMER_CREATE: 'customer_create',
    CUSTOMER_EDIT: 'customer_edit',
    CUSTOMER_EXPORT: 'customer_export',
    CUSTOMER_DELETE: 'customer_delete',

    // ---- STAFF ----
    STAFF_VIEW_ALL_SCHEDULES: 'staff_view_all_schedules',
    STAFF_EDIT_SCHEDULE: 'staff_edit_schedule',
    STAFF_MANAGE_PROFILES: 'staff_manage_profiles',

    // ---- ANALYTICS / REPORTS ----
    REPORT_VIEW_BASIC: 'report_view_basic',
    REPORT_VIEW_ADVANCED: 'report_view_advanced',
    REPORT_EXPORT: 'report_export',

    // ---- MARKETING ----
    MARKETING_CREATE_CAMPAIGN: 'marketing_create_campaign',
    MARKETING_MANAGE_COUPONS: 'marketing_manage_coupons',

    // ---- INVENTORY / PRODUCTS ----
    PRODUCT_EDIT_INVENTORY: 'product_edit_inventory',
    PRODUCT_EDIT_PRICING: 'product_edit_pricing',

    // ---- SETTINGS ----
    SETTINGS_MANAGE_COMPANY: 'settings_manage_company',
    SETTINGS_MANAGE_BILLING: 'settings_manage_billing',
    SETTINGS_MANAGE_ROLES: 'settings_manage_roles'
};

import { FEATURES } from './feature-registry.js';

// Parent-Child mapping used to generate the checkboxes dynamically in roles UI
export const SUB_FEATURES_MAP = {
    [FEATURES.DASHBOARD_ACCESS]: [
        { key: SUB_FEATURES.DASHBOARD_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.BOOKINGS_MANAGEMENT]: [
        { key: SUB_FEATURES.BOOKING_CREATE, label: 'Create Bookings' },
        { key: SUB_FEATURES.BOOKING_EDIT, label: 'Edit Bookings' },
        { key: SUB_FEATURES.BOOKING_CANCEL, label: 'Cancel Bookings' },
        { key: SUB_FEATURES.BOOKING_VIEW_ALL, label: 'View All Schedules' }
    ],
    [FEATURES.STAFF_MANAGEMENT]: [
        { key: SUB_FEATURES.STAFF_VIEW_ALL_SCHEDULES, label: 'View All Schedules' },
        { key: SUB_FEATURES.STAFF_EDIT_SCHEDULE, label: 'Edit Schedules' },
        { key: SUB_FEATURES.STAFF_MANAGE_PROFILES, label: 'Manage Profiles' }
    ],
    [FEATURES.SERVICES_MANAGEMENT]: [
        { key: SUB_FEATURES.SERVICE_CREATE, label: 'Create Services' },
        { key: SUB_FEATURES.SERVICE_EDIT, label: 'Edit Services' },
        { key: SUB_FEATURES.SERVICE_DELETE, label: 'Delete Services' },
        { key: SUB_FEATURES.SERVICE_CATEGORY_MANAGE, label: 'Manage Categories' }
    ],
    [FEATURES.POS_SYSTEM]: [
        { key: SUB_FEATURES.POS_CHECKOUT, label: 'Process Checkout' },
        { key: SUB_FEATURES.POS_APPLY_DISCOUNT, label: 'Apply Discounts' },
        { key: SUB_FEATURES.POS_ISSUE_REFUND, label: 'Issue Refunds' }
    ],
    [FEATURES.CUSTOMERS_MANAGEMENT]: [
        { key: SUB_FEATURES.CUSTOMER_CREATE, label: 'Create Customer' },
        { key: SUB_FEATURES.CUSTOMER_EDIT, label: 'Edit Customer' },
        { key: SUB_FEATURES.CUSTOMER_EXPORT, label: 'Export Data' },
        { key: SUB_FEATURES.CUSTOMER_DELETE, label: 'Delete Customer' }
    ],
    [FEATURES.REPORTS_ACCESS]: [
        { key: SUB_FEATURES.REPORT_VIEW_BASIC, label: 'View Basic Reports' },
        { key: SUB_FEATURES.REPORT_VIEW_ADVANCED, label: 'View Adv. Reports' },
        { key: SUB_FEATURES.REPORT_EXPORT, label: 'Export Reports' }
    ],
    [FEATURES.MARKETING_CAMPAIGNS]: [
        { key: SUB_FEATURES.MARKETING_CREATE_CAMPAIGN, label: 'Create Campaigns' }
    ],
    [FEATURES.MARKETING_COUPONS]: [
        { key: SUB_FEATURES.MARKETING_MANAGE_COUPONS, label: 'Manage Coupons' }
    ],
    [FEATURES.PRODUCT_MANAGEMENT]: [
        { key: SUB_FEATURES.PRODUCT_EDIT_INVENTORY, label: 'Edit Inventory' },
        { key: SUB_FEATURES.PRODUCT_EDIT_PRICING, label: 'Edit Pricing' }
    ],
    [FEATURES.COMPANY_SETTINGS]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_COMPANY, label: 'Manage Settings' }
    ],
    [FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_BILLING, label: 'Manage Billing' }
    ],
    [FEATURES.ROLES_PERMISSIONS]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_ROLES, label: 'Manage Roles' }
    ]
};
