/**
 * SUB_FEATURES represents granular actions, buttons, and specific UI elements 
 * within a page that can be individually allowed or restricted based on a user's role.
 */
export const SUB_FEATURES = {
    // ---- DASHBOARD ----
    DASHBOARD_CREATE_BOOKING: 'dashboard_create_booking',
    
    // ---- BOOKINGS ----
    CREATE_BOOKING: 'create_booking',
    UPDATE_BOOKING: 'update_booking',
    READ_BOOKINGS: 'read_bookings',
    CANCEL_BOOKING: 'cancel_booking',

    // ---- SERVICES ----
    CREATE_SERVICE_CATEGORY: 'create_service_category',
    READ_SERVICE_CATEGORY: 'read_service_category',
    UPDATE_SERVICE_CATEGORY: 'update_service_category',
    DELETE_SERVICE_CATEGORY: 'delete_service_category',

    CREATE_SERVICE: 'create_service',
    READ_SERVICES: 'read_services',
    UPDATE_SERVICE: 'update_service',
    DELETE_SERVICE: 'delete_service',

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
    CREATE_STAFF: 'create_staff',
    READ_STAFF: 'read_staff',
    UPDATE_STAFF: 'update_staff',
    DELETE_STAFF: 'delete_staff',

    // ---- STAFF SCHEDULES ----
    CREATE_STAFF_SCHEDULE: 'create_staff_schedule',
    READ_STAFF_SCHEDULE: 'read_staff_schedule',
    EDIT_STAFF_SCHEDULE: 'edit_staff_schedule',
    DELETE_STAFF_SCHEDULE: 'delete_staff_schedule',

    // ---- ANALYTICS / REPORTS ----
    REPORT_VIEW_BASIC: 'report_view_basic',
    REPORT_VIEW_ADVANCED: 'report_view_advanced',
    REPORT_EXPORT: 'report_export',

    // ---- MARKETING ----
    MARKETING_CREATE_CAMPAIGN: 'marketing_create_campaign',
    MARKETING_MANAGE_COUPONS: 'marketing_manage_coupons',

    // ---- INVENTORY / PRODUCTS ----
    CREATE_PRODUCT_CATEGORY: 'create_product_category',
    READ_PRODUCT_CATEGORIES: 'read_product_categories',
    UPDATE_PRODUCT_CATEGORY: 'update_product_category',
    DELETE_PRODUCT_CATEGORY: 'delete_product_category',

    CREATE_PRODUCT: 'create_product',
    READ_PRODUCTS: 'read_products',
    UPDATE_PRODUCT: 'update_product',
    DELETE_PRODUCT: 'delete_product',

    // ---- SETTINGS ----
    SETTINGS_MANAGE_COMPANY: 'settings_manage_company',
    SETTINGS_MANAGE_BILLING: 'settings_manage_billing',

    // ---- ROLES ----
    CREATE_ROLE: 'create_role',
    UPDATE_ROLE: 'update_role',
    DELETE_ROLE: 'delete_role',
    READ_ROLES:  'read_roles'
};

import { FEATURES } from './feature-registry.js';

// Parent-Child mapping used to generate the checkboxes dynamically in roles UI
export const SUB_FEATURES_MAP = {
    [FEATURES.DASHBOARD_ACCESS]: [
        { key: SUB_FEATURES.DASHBOARD_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.BOOKINGS_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_BOOKING, label: 'Create Booking' },
        { key: SUB_FEATURES.UPDATE_BOOKING, label: 'Update Booking' },
        { key: SUB_FEATURES.READ_BOOKINGS, label: 'Read Bookings' },
        { key: SUB_FEATURES.CANCEL_BOOKING, label: 'Cancel Booking' }
    ],
    [FEATURES.STAFF_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_STAFF, label: 'Create Staff' },
        { key: SUB_FEATURES.READ_STAFF, label: 'Read Staff' },
        { key: SUB_FEATURES.UPDATE_STAFF, label: 'Update Staff' },
        { key: SUB_FEATURES.DELETE_STAFF, label: 'Delete Staff' }
    ],
    [FEATURES.STAFF_SCHEDULES]: [
        { key: SUB_FEATURES.CREATE_STAFF_SCHEDULE, label: 'Create Schedule' },
        { key: SUB_FEATURES.READ_STAFF_SCHEDULE, label: 'Read Schedules' },
        { key: SUB_FEATURES.EDIT_STAFF_SCHEDULE, label: 'Edit Schedule' },
        { key: SUB_FEATURES.DELETE_STAFF_SCHEDULE, label: 'Delete Schedule' }
    ],
    [FEATURES.SERVICES_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_SERVICE_CATEGORY, label: 'Create Service Category' },
        { key: SUB_FEATURES.READ_SERVICE_CATEGORY, label: 'Read Service Categories' },
        { key: SUB_FEATURES.UPDATE_SERVICE_CATEGORY, label: 'Update Service Category' },
        { key: SUB_FEATURES.DELETE_SERVICE_CATEGORY, label: 'Delete Service Category' },

        { key: SUB_FEATURES.CREATE_SERVICE, label: 'Create Service' },
        { key: SUB_FEATURES.READ_SERVICES, label: 'Read Services' },
        { key: SUB_FEATURES.UPDATE_SERVICE, label: 'Update Service' },
        { key: SUB_FEATURES.DELETE_SERVICE, label: 'Delete Service' }
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
        { key: SUB_FEATURES.CREATE_PRODUCT_CATEGORY, label: 'Create Product Category' },
        { key: SUB_FEATURES.READ_PRODUCT_CATEGORIES, label: 'Read Product Categories' },
        { key: SUB_FEATURES.UPDATE_PRODUCT_CATEGORY, label: 'Update Product Category' },
        { key: SUB_FEATURES.DELETE_PRODUCT_CATEGORY, label: 'Delete Product Category' },

        { key: SUB_FEATURES.CREATE_PRODUCT, label: 'Create Product' },
        { key: SUB_FEATURES.READ_PRODUCTS, label: 'Read Products' },
        { key: SUB_FEATURES.UPDATE_PRODUCT, label: 'Update Product' },
        { key: SUB_FEATURES.DELETE_PRODUCT, label: 'Delete Product' }
    ],
    [FEATURES.COMPANY_SETTINGS]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_COMPANY, label: 'Manage Settings' }
    ],
    [FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_BILLING, label: 'Manage Billing' }
    ],
    [FEATURES.ROLES_PERMISSIONS]: [
        { key: SUB_FEATURES.CREATE_ROLE, label: 'Create Role' },
        { key: SUB_FEATURES.UPDATE_ROLE, label: 'Update Role' },
        { key: SUB_FEATURES.DELETE_ROLE, label: 'Delete Role' },
        { key: SUB_FEATURES.READ_ROLES,  label: 'Read Roles' }
    ]
};
