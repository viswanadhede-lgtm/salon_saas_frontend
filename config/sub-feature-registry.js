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
    CANCEL_BOOKING: 'cancel_booking',

    // ---- CUSTOMERS ----
    CUSTOMER_CREATE: 'customer_create',
    CUSTOMER_EDIT: 'customer_edit',
    CUSTOMER_DELETE: 'customer_delete',
    CUSTOMERS_CREATE_BOOKING: 'customers_create_booking',

    // ---- STAFF ----
    CREATE_STAFF: 'create_staff',
    UPDATE_STAFF: 'update_staff',
    DELETE_STAFF: 'delete_staff',
    STAFF_CREATE_BOOKING: 'staff_create_booking',

    // ---- STAFF SCHEDULES ----
    CREATE_STAFF_SCHEDULE: 'create_staff_schedule',
    EDIT_STAFF_SCHEDULE: 'edit_staff_schedule',
    DELETE_STAFF_SCHEDULE: 'delete_staff_schedule',
    STAFF_SCHEDULE_CREATE_BOOKING: 'staff_schedule_create_booking',

    // ---- SERVICES ----
    CREATE_SERVICE_CATEGORY: 'create_service_category',
    UPDATE_SERVICE_CATEGORY: 'update_service_category',
    DELETE_SERVICE_CATEGORY: 'delete_service_category',

    CREATE_SERVICE: 'create_service',
    UPDATE_SERVICE: 'update_service',
    DELETE_SERVICE: 'delete_service',

    CREATE_PACKAGE: 'create_package',
    UPDATE_PACKAGE: 'update_package',
    DELETE_PACKAGE: 'delete_package',
    SERVICES_CREATE_BOOKING: 'services_create_booking',

    // ---- POS ----
    POS_CHECKOUT: 'pos_checkout',
    POS_CREATE_CUSTOMER: 'pos_create_customer',
    POS_CREATE_BOOKING: 'pos_create_booking',

    // ---- INVENTORY / PRODUCTS ----
    CREATE_PRODUCT_CATEGORY: 'create_product_category',
    UPDATE_PRODUCT_CATEGORY: 'update_product_category',
    DELETE_PRODUCT_CATEGORY: 'delete_product_category',

    CREATE_PRODUCT: 'create_product',
    UPDATE_PRODUCT: 'update_product',
    DELETE_PRODUCT: 'delete_product',
    PRODUCTS_CREATE_BOOKING: 'products_create_booking',

    // ---- SALES HISTORY ----
    POS_ISSUE_REFUND: 'pos_issue_refund',
    POS_EXPORT_SALES: 'pos_export_sales',
    SALES_HISTORY_CREATE_BOOKING: 'sales_history_create_booking',

    // ---- PENDING PAYMENTS ----
    PENDING_PAYMENTS_COLLECT: 'pending_payments_collect',
    PENDING_PAYMENTS_CREATE_BOOKING: 'pending_payments_create_booking',

    // ---- PAYMENTS HISTORY ----
    PAYMENTS_HISTORY_EXPORT: 'payments_history_export',
    PAYMENTS_HISTORY_CREATE_BOOKING: 'payments_history_create_booking',

    // ---- MARKETING: OFFERS ----
    CREATE_OFFER: 'create_offer',
    UPDATE_OFFER: 'update_offer',
    DELETE_OFFER: 'delete_offer',
    OFFERS_CREATE_BOOKING: 'offers_create_booking',

    // ---- MARKETING: COUPONS ----
    CREATE_COUPON: 'create_coupon',
    UPDATE_COUPON: 'update_coupon',
    DELETE_COUPON: 'delete_coupon',
    DISCOUNT_OVERRIDE: 'discount_override',
    COUPONS_CREATE_BOOKING: 'coupons_create_booking',

    // ---- MARKETING: MEMBERSHIPS ----
    CREATE_MEMBERSHIP: 'create_membership',
    UPDATE_MEMBERSHIP: 'update_membership',
    DELETE_MEMBERSHIP: 'delete_membership',
    ASSIGN_MEMBERSHIP: 'assign_membership',
    EXPORT_MEMBERSHIP_USAGE: 'export_membership_usage',
    MEMBERSHIPS_CREATE_BOOKING: 'memberships_create_booking',

    // ---- MARKETING: CAMPAIGNS ----
    CAMPAIGN_CREATE_BOOKING: 'campaign_create_booking',

    // ---- ANALYTICS / OVERVIEW ----
    OVERVIEW_CREATE_BOOKING: 'overview_create_booking',

    // ---- ANALYTICS / REPORTS ----
    REPORT_VIEW_BASIC: 'report_view_basic',
    REPORT_VIEW_ADVANCED: 'report_view_advanced',
    REPORT_EXPORT: 'report_export',
    REPORTS_CREATE_BOOKING: 'reports_create_booking',

    // ---- ANALYTICS / EXPENSES ----
    EXPENSES_CREATE: 'expenses_create',
    EXPENSES_UPDATE: 'expenses_update',
    EXPENSES_DELETE: 'expenses_delete',
    EXPENSES_CREATE_BOOKING: 'expenses_create_booking',

    // ---- SETTINGS / COMPANY ----
    SETTINGS_MANAGE_COMPANY: 'settings_manage_company',
    COMPANY_UPDATE: 'company_update',
    COMPANY_CREATE_BOOKING: 'company_create_booking',

    // ---- SETTINGS / BRANCHES ----
    BRANCH_CREATE: 'branch_create',
    BRANCH_UPDATE: 'branch_update',
    BRANCH_DELETE: 'branch_delete',
    BRANCH_CREATE_BOOKING: 'branch_create_booking',

    // ---- SETTINGS / USERS ----
    USER_CREATE: 'user_create',
    USER_UPDATE: 'user_update',
    USER_DELETE: 'user_delete',
    USER_CREATE_BOOKING: 'user_create_booking',

    // ---- SETTINGS / ROLES & PERMISSIONS ----
    ROLE_CREATE: 'role_create',
    ROLE_UPDATE: 'role_update',
    ROLE_DELETE: 'role_delete',
    ROLE_CREATE_BOOKING: 'role_create_booking',

    // ---- BILLING & SUBSCRIPTION ----
    BILLING_UPGRADE_PLAN: 'billing_upgrade_plan',
    BILLING_CHANGE_PLAN: 'billing_change_plan',
    BILLING_ADD_ADDON: 'billing_add_addon',
    BILLING_EXPORT: 'billing_export',
    BILLING_UPDATE_PAYMENT: 'billing_update_payment',
    BILLING_CREATE_BOOKING: 'billing_create_booking',

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
        { key: SUB_FEATURES.CANCEL_BOOKING, label: 'Cancel Booking' }
    ],
    [FEATURES.CUSTOMERS_MANAGEMENT]: [
        { key: SUB_FEATURES.CUSTOMER_CREATE, label: 'Create Customer' },
        { key: SUB_FEATURES.CUSTOMER_EDIT, label: 'Edit Customer' },
        { key: SUB_FEATURES.CUSTOMER_DELETE, label: 'Delete Customer' },
        { key: SUB_FEATURES.CUSTOMERS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.STAFF_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_STAFF, label: 'Create Staff' },
        { key: SUB_FEATURES.UPDATE_STAFF, label: 'Update Staff' },
        { key: SUB_FEATURES.DELETE_STAFF, label: 'Delete Staff' },
        { key: SUB_FEATURES.STAFF_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.STAFF_SCHEDULES]: [
        { key: SUB_FEATURES.CREATE_STAFF_SCHEDULE, label: 'Create Schedule' },
        { key: SUB_FEATURES.EDIT_STAFF_SCHEDULE, label: 'Edit Schedule' },
        { key: SUB_FEATURES.DELETE_STAFF_SCHEDULE, label: 'Delete Schedule' },
        { key: SUB_FEATURES.STAFF_SCHEDULE_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.SERVICES_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_SERVICE_CATEGORY, label: 'Create Service Category' },
        { key: SUB_FEATURES.UPDATE_SERVICE_CATEGORY, label: 'Update Service Category' },
        { key: SUB_FEATURES.DELETE_SERVICE_CATEGORY, label: 'Delete Service Category' },

        { key: SUB_FEATURES.CREATE_SERVICE, label: 'Create Service' },
        { key: SUB_FEATURES.UPDATE_SERVICE, label: 'Update Service' },
        { key: SUB_FEATURES.DELETE_SERVICE, label: 'Delete Service' },

        { key: SUB_FEATURES.CREATE_PACKAGE, label: 'Create Package' },
        { key: SUB_FEATURES.UPDATE_PACKAGE, label: 'Update Package' },
        { key: SUB_FEATURES.DELETE_PACKAGE, label: 'Delete Package' },
        
        { key: SUB_FEATURES.SERVICES_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.POS_SYSTEM]: [
        { key: SUB_FEATURES.POS_CHECKOUT, label: 'Process Checkout' },
        { key: SUB_FEATURES.POS_CREATE_CUSTOMER, label: 'Create Customer (POS)' },
        { key: SUB_FEATURES.POS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.PRODUCT_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_PRODUCT_CATEGORY, label: 'Create Product Category' },
        { key: SUB_FEATURES.UPDATE_PRODUCT_CATEGORY, label: 'Update Product Category' },
        { key: SUB_FEATURES.DELETE_PRODUCT_CATEGORY, label: 'Delete Product Category' },

        { key: SUB_FEATURES.CREATE_PRODUCT, label: 'Create Product' },
        { key: SUB_FEATURES.UPDATE_PRODUCT, label: 'Update Product' },
        { key: SUB_FEATURES.DELETE_PRODUCT, label: 'Delete Product' },

        { key: SUB_FEATURES.PRODUCTS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.SALES_HISTORY]: [
        { key: SUB_FEATURES.POS_ISSUE_REFUND, label: 'Issue Refunds / Returns' },
        { key: SUB_FEATURES.POS_EXPORT_SALES, label: 'Export Sales History' },
        { key: SUB_FEATURES.SALES_HISTORY_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.PENDING_PAYMENTS]: [
        { key: SUB_FEATURES.PENDING_PAYMENTS_COLLECT, label: 'Collect Payment' },
        { key: SUB_FEATURES.PENDING_PAYMENTS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.PAYMENTS_HISTORY]: [
        { key: SUB_FEATURES.PAYMENTS_HISTORY_EXPORT, label: 'Export Payments History' },
        { key: SUB_FEATURES.PAYMENTS_HISTORY_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.MARKETING_OFFERS]: [
        { key: SUB_FEATURES.CREATE_OFFER, label: 'Create Offer' },
        { key: SUB_FEATURES.UPDATE_OFFER, label: 'Edit Offer' },
        { key: SUB_FEATURES.DELETE_OFFER, label: 'Delete Offer' },
        { key: SUB_FEATURES.OFFERS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.MARKETING_COUPONS]: [
        { key: SUB_FEATURES.CREATE_COUPON, label: 'Create Coupon' },
        { key: SUB_FEATURES.UPDATE_COUPON, label: 'Edit Coupon' },
        { key: SUB_FEATURES.DELETE_COUPON, label: 'Delete Coupon' },
        { key: SUB_FEATURES.DISCOUNT_OVERRIDE, label: 'Override Discounts' },
        { key: SUB_FEATURES.COUPONS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.MARKETING_MEMBERSHIPS]: [
        { key: SUB_FEATURES.CREATE_MEMBERSHIP, label: 'Create Plan' },
        { key: SUB_FEATURES.UPDATE_MEMBERSHIP, label: 'Edit Plan' },
        { key: SUB_FEATURES.DELETE_MEMBERSHIP, label: 'Delete Plan' },
        { key: SUB_FEATURES.ASSIGN_MEMBERSHIP, label: 'Assign Membership' },
        { key: SUB_FEATURES.EXPORT_MEMBERSHIP_USAGE, label: 'Export Usage' },
        { key: SUB_FEATURES.MEMBERSHIPS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.MARKETING_CAMPAIGNS]: [
        { key: SUB_FEATURES.CAMPAIGN_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.ANALYTICS_OVERVIEW]: [
        { key: SUB_FEATURES.OVERVIEW_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.REPORTS_ACCESS]: [
        { key: SUB_FEATURES.REPORT_VIEW_BASIC, label: 'View Basic Reports' },
        { key: SUB_FEATURES.REPORT_VIEW_ADVANCED, label: 'View Adv. Reports' },
        { key: SUB_FEATURES.REPORT_EXPORT, label: 'Export Reports' },
        { key: SUB_FEATURES.REPORTS_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.ANALYTICS_EXPENSES]: [
        { key: SUB_FEATURES.EXPENSES_CREATE, label: 'Add Expense' },
        { key: SUB_FEATURES.EXPENSES_UPDATE, label: 'Edit Expense' },
        { key: SUB_FEATURES.EXPENSES_DELETE, label: 'Delete Expense' },
        { key: SUB_FEATURES.EXPENSES_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.COMPANY_SETTINGS]: [
        { key: SUB_FEATURES.SETTINGS_MANAGE_COMPANY, label: 'Manage Settings' },
        { key: SUB_FEATURES.COMPANY_UPDATE, label: 'Update Settings' },
        { key: SUB_FEATURES.COMPANY_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.BRANCH_MANAGEMENT]: [
        { key: SUB_FEATURES.BRANCH_CREATE, label: 'Add Branch' },
        { key: SUB_FEATURES.BRANCH_UPDATE, label: 'Edit Branch' },
        { key: SUB_FEATURES.BRANCH_DELETE, label: 'Delete Branch' },
        { key: SUB_FEATURES.BRANCH_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.USER_MANAGEMENT]: [
        { key: SUB_FEATURES.USER_CREATE, label: 'Add User' },
        { key: SUB_FEATURES.USER_UPDATE, label: 'Edit User & Permissions' },
        { key: SUB_FEATURES.USER_DELETE, label: 'Delete User' },
        { key: SUB_FEATURES.USER_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.ROLES_PERMISSIONS]: [
        { key: SUB_FEATURES.ROLE_CREATE, label: 'Add Role' },
        { key: SUB_FEATURES.ROLE_UPDATE, label: 'Edit Role & Permissions' },
        { key: SUB_FEATURES.ROLE_DELETE, label: 'Delete Role' },
        { key: SUB_FEATURES.ROLE_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
    [FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT]: [
        { key: SUB_FEATURES.BILLING_UPGRADE_PLAN, label: 'Upgrade Plan' },
        { key: SUB_FEATURES.BILLING_CHANGE_PLAN, label: 'Change Plan' },
        { key: SUB_FEATURES.BILLING_ADD_ADDON, label: 'Add Add-on' },
        { key: SUB_FEATURES.BILLING_EXPORT, label: 'Export Payment History' },
        { key: SUB_FEATURES.BILLING_UPDATE_PAYMENT, label: 'Update Payment Method' },
        { key: SUB_FEATURES.BILLING_CREATE_BOOKING, label: 'Create Booking (Quick Action)' }
    ],
};
