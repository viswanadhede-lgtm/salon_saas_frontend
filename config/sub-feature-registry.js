/**
 * config/sub-feature-registry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SUB-FEATURE REGISTRY — Granular action-level permissions definition.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Defines micro-permissions, action buttons, and sensitive operations
 *   within each application page that can be individually allowed or
 *   restricted based on a user's assigned role.
 *
 * ARCHITECTURAL RULE:
 *   - Feature (feature-registry.js) controls PAGE ACCESS (can the user visit the route?).
 *   - Sub-Feature (this file) controls IN-PAGE ACTIONS (can the user create, edit,
 *     delete, refund, export, or modify data on that page?).
 *
 * SECTIONS:
 *   1. SUB_FEATURES     — Flat dictionary of all granular action keys.
 *   2. SUB_FEATURES_MAP — Parent-to-children mapping connecting each feature
 *                         in FEATURES to its array of granular sub-features.
 *                         Used by Roles & Permissions UI and Auth Guard.
 *
 * HOW TO UPDATE:
 *   - New action button added   → Add key to SUB_FEATURES + entry in SUB_FEATURES_MAP
 *   - Action removed/deprecated → Delete key from SUB_FEATURES and SUB_FEATURES_MAP
 *   - Read-only / Hub pages     → Map to empty array [] (displays "No granular actions")
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — SUB_FEATURES
// Flat dictionary of all granular action keys across the app.
// ─────────────────────────────────────────────────────────────────────────────
export const SUB_FEATURES = {

    // =========================================================================
    // GROUP A — CORE SYSTEM FEATURES (Sidebar Pages 1 to 22)
    // =========================================================================

    // ── Page 1: Dashboard (dashboard.html) ───────────────────────────────────
    // (View-only KPI overview — "+ New Booking" action lives in the Global Header)
    DASHBOARD_CREATE_BOOKING:            'dashboard_create_booking',

    // ── Page 2: Bookings (bookings.html) ─────────────────────────────────────
    CREATE_BOOKING:                      'create_booking',
    UPDATE_BOOKING:                      'update_booking',
    CANCEL_BOOKING:                      'cancel_booking',
    COLLECT_PAYMENT:                     'collect_payment',
    BOOKING_REFUND:                      'booking_refund',

    // ── Page 3: Customers (customers.html) ───────────────────────────────────
    CUSTOMER_CREATE:                     'customer_create',
    CUSTOMER_EDIT:                       'customer_edit',
    CUSTOMER_DELETE:                     'customer_delete',
    CUSTOMER_EXPORT:                     'customer_export',

    // ── Page 4: Staff (staff.html) ───────────────────────────────────────────
    CREATE_STAFF:                        'create_staff',
    UPDATE_STAFF:                        'update_staff',
    DELETE_STAFF:                        'delete_staff',

    // ── Page 5: Staff Schedules (staff-schedule.html) ────────────────────────
    CREATE_STAFF_SCHEDULE:               'create_staff_schedule',
    EDIT_STAFF_SCHEDULE:                 'edit_staff_schedule',
    DELETE_STAFF_SCHEDULE:               'delete_staff_schedule',

    // ── Page 6: Services & Packages (services.html) ──────────────────────────
    CREATE_SERVICE:                      'create_service',
    UPDATE_SERVICE:                      'update_service',
    DELETE_SERVICE:                      'delete_service',
    CREATE_SERVICE_CATEGORY:             'create_service_category',
    UPDATE_SERVICE_CATEGORY:             'update_service_category',
    DELETE_SERVICE_CATEGORY:             'delete_service_category',
    CREATE_PACKAGE:                      'create_package',
    UPDATE_PACKAGE:                      'update_package',
    DELETE_PACKAGE:                      'delete_package',

    // ── Page 7: Point of Sale (pos.html) ─────────────────────────────────────
    POS_CHECKOUT:                        'pos_checkout',
    POS_CREATE_CUSTOMER:                 'pos_create_customer',

    // ── Page 8: Inventory & Products (products.html) ─────────────────────────
    CREATE_PRODUCT:                      'create_product',
    UPDATE_PRODUCT:                      'update_product',
    DELETE_PRODUCT:                      'delete_product',
    CREATE_PRODUCT_CATEGORY:             'create_product_category',
    UPDATE_PRODUCT_CATEGORY:             'update_product_category',
    DELETE_PRODUCT_CATEGORY:             'delete_product_category',

    // ── Page 9: Sales History (sales-history.html) ───────────────────────────
    POS_ISSUE_REFUND:                    'pos_issue_refund',
    POS_EXPORT_SALES:                    'pos_export_sales',

    // ── Page 10: Pending Payments (pending-payments.html) ────────────────────
    PENDING_PAYMENTS_COLLECT:            'pending_payments_collect',

    // ── Page 11: Payments History (payments-history.html) ────────────────────
    PAYMENTS_HISTORY_EXPORT:             'payments_history_export',

    // ── Page 12: Marketing: Offers (offers.html) ─────────────────────────────
    CREATE_OFFER:                        'create_offer',
    UPDATE_OFFER:                        'update_offer',
    DELETE_OFFER:                        'delete_offer',

    // ── Page 13: Marketing: Coupons (coupons.html) ───────────────────────────
    CREATE_COUPON:                       'create_coupon',
    UPDATE_COUPON:                       'update_coupon',
    DELETE_COUPON:                       'delete_coupon',

    // ── Page 14: Marketing: Memberships (memberships.html) ───────────────────
    CREATE_MEMBERSHIP:                   'create_membership',
    UPDATE_MEMBERSHIP:                   'update_membership',
    DELETE_MEMBERSHIP:                   'delete_membership',
    ASSIGN_MEMBERSHIP:                   'assign_membership',
    CANCEL_MEMBERSHIP:                   'cancel_membership',
    REFUND_MEMBERSHIP:                   'refund_membership',
    EXPORT_MEMBERSHIP_USAGE:             'export_membership_usage',

    // ── Page 15: Marketing: Ad Campaigns (ad-campaigns.html) ─────────────────
    // (Coming soon placeholder — no granular action keys)

    // ── Page 16: Analytics Overview (overview.html) ──────────────────────────
    // (View-only analytics dashboard — no granular action keys)

    // ── Page 17: Reports (reports.html) ──────────────────────────────────────
    REPORT_VIEW_BASIC:                   'report_view_basic',

    // ── Page 18: Expenses (expenses.html) ────────────────────────────────────
    EXPENSES_CREATE:                     'expenses_create',
    EXPENSES_UPDATE:                     'expenses_update',
    EXPENSES_DELETE:                     'expenses_delete',

    // ── Page 19: Company Settings (company.html) ─────────────────────────────
    // (Settings navigation hub — individual settings sub-pages are configured in Group B)

    // ── Page 20: Users & Access (users.html) ─────────────────────────────────
    USER_CREATE:                         'user_create',
    USER_UPDATE:                         'user_update',
    USER_DELETE:                         'user_delete',

    // ── Page 21: Roles & Permissions (roles-permissions.html) ───────────────
    ROLE_CREATE:                         'role_create',
    ROLE_UPDATE:                         'role_update',
    ROLE_DELETE:                         'role_delete',

    // ── Page 22: Billing & Subscription (billing-subscription.html) ──────────
    BILLING_CHANGE_PLAN:                 'billing_change_plan',
    BILLING_MANAGE_ADDONS:               'billing_manage_addons',
    BILLING_EDIT_INFO:                   'billing_edit_info',
    BILLING_EXPORT_HISTORY:              'billing_export_history',
    BILLING_CANCEL_SUBSCRIPTION:         'billing_cancel_subscription',
    BILLING_RENEW_SUBSCRIPTION:          'billing_renew_subscription',


    // =========================================================================
    // GROUP B — SUPPORTING FEATURES (Sub-pages 23 to 44)
    // =========================================================================

    // ── Page 23: Today's Revenue (todays-revenue.html) ───────────────────────
    // (View-only KPI drill-down — no granular action keys)

    // ── Page 24: Upcoming Appointments (upcoming-appointments.html) ──────────
    UPCOMING_COLLECT_PAYMENT:            'upcoming_collect_payment',

    // ── Page 25: Completed Appointments (completed-appointments.html) ────────
    // (View-only appointments log — no granular action keys)

    // ── Page 26: No-Shows & Cancellations (no-shows-cancellations.html) ───────
    // (View-only cancellation log — no granular action keys)

    // ── Page 27: Report Category (report-category.html) ──────────────────────
    // (View-only category navigation hub — no granular action keys)

    // ── Page 28: Report Detail (report-detail.html) ──────────────────────────
    REPORT_DETAIL_EXPORT:                'report_detail_export',

    // ── Page 29: Branches (branches.html) ────────────────────────────────────
    BRANCH_CREATE:                       'branch_create',
    BRANCH_UPDATE:                       'branch_update',
    BRANCH_DELETE:                       'branch_delete',
    BRANCH_SWITCH:                       'branch_switch',

    // ── Page 30: Business Settings (settings-business.html) ──────────────────
    SAVE_BUSINESS_SETTINGS:              'save_business_settings',

    // ── Page 31: Contact Settings (settings-contact.html) ────────────────────
    SAVE_CONTACT_SETTINGS:               'save_contact_settings',

    // ── Page 32: Business Hours (settings-hours.html) ────────────────────────
    SAVE_HOURS_SETTINGS:                 'save_hours_settings',

    // ── Page 33: Tax & Compliance (settings-tax.html) ────────────────────────
    SAVE_TAX_SETTINGS:                   'save_tax_settings',

    // ── Page 34: Payment Methods (settings-payments.html) ────────────────────
    SAVE_PAYMENTS_SETTINGS:              'save_payments_settings',

    // ── Page 35: Notifications Settings (settings-notifications.html) ────────
    SAVE_NOTIFICATIONS_SETTINGS:         'save_notifications_settings',

    // ── Page 36: Invoice Settings Hub (settings-invoice.html) ─────────────────
    // (Navigation hub — specific invoice templates configured in Pages 37 to 40)

    // ── Page 37: Common Invoice Settings (settings-invoice-common.html) ──────
    SAVE_INVOICE_COMMON:                 'save_invoice_common',

    // ── Page 38: Booking Invoice Settings (settings-invoice-booking.html) ────
    SAVE_INVOICE_BOOKING:                'save_invoice_booking',

    // ── Page 39: POS Invoice Settings (settings-invoice-pos.html) ────────────
    SAVE_INVOICE_POS:                    'save_invoice_pos',

    // ── Page 40: Membership Invoice Settings (settings-invoice-membership.html)
    SAVE_INVOICE_MEMBERSHIP:             'save_invoice_membership',

    // ── Page 41: Notifications (notifications.html) ──────────────────────────
    NOTIFICATIONS_MARK_READ:             'notifications_mark_read',
    NOTIFICATIONS_MANAGE_SETTINGS:       'notifications_manage_settings',

    // ── Page 42: Support (support.html) ──────────────────────────────────────
    SUPPORT_SUBMIT_TICKET:               'support_submit_ticket',
    SUPPORT_SUBMIT_SUGGESTION:           'support_submit_suggestion',
    SUPPORT_SUBMIT_REVIEW:               'support_submit_review',
    SUPPORT_START_CHAT:                  'support_start_chat',

    // ── Page 43: Issue History (issue-history.html) ──────────────────────────
    TICKET_SEND_REPLY:                   'ticket_send_reply',
    TICKET_CLOSE:                        'ticket_close',

    // ── Page 44: User Guide (user_guide.html) ────────────────────────────────
    // (View-only documentation manual — no granular action keys)

};


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — SUB_FEATURES_MAP
// Parent-to-children mapping connecting each page in FEATURES to its
// granular actions. Used to render checkboxes in the Roles & Permissions UI
// and for automatic permission expansion in the Global Auth Guard.
// ─────────────────────────────────────────────────────────────────────────────
export const SUB_FEATURES_MAP = {

    // =========================================================================
    // GROUP A — CORE SYSTEM FEATURES (Sidebar Pages 1 to 22)
    // =========================================================================

    // 1. Dashboard (dashboard.html)
    [FEATURES.DASHBOARD_ACCESS]: [],

    // 2. Bookings (bookings.html)
    [FEATURES.BOOKINGS_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_BOOKING,          label: 'Create Booking' },
        { key: SUB_FEATURES.UPDATE_BOOKING,          label: 'Update Booking' },
        { key: SUB_FEATURES.CANCEL_BOOKING,          label: 'Cancel Booking' },
        { key: SUB_FEATURES.COLLECT_PAYMENT,         label: 'Collect Payment' },
        { key: SUB_FEATURES.BOOKING_REFUND,          label: 'Process Refund' }
    ],

    // 3. Customers (customers.html)
    [FEATURES.CUSTOMERS_MANAGEMENT]: [
        { key: SUB_FEATURES.CUSTOMER_CREATE,         label: 'Create Customer' },
        { key: SUB_FEATURES.CUSTOMER_EDIT,           label: 'Edit Customer' },
        { key: SUB_FEATURES.CUSTOMER_DELETE,         label: 'Delete Customer' },
        { key: SUB_FEATURES.CUSTOMER_EXPORT,         label: 'Export Customers' }
    ],

    // 4. Staff (staff.html)
    [FEATURES.STAFF_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_STAFF,            label: 'Create Staff' },
        { key: SUB_FEATURES.UPDATE_STAFF,            label: 'Update Staff' },
        { key: SUB_FEATURES.DELETE_STAFF,            label: 'Delete Staff' }
    ],

    // 5. Staff Schedules (staff-schedule.html)
    [FEATURES.STAFF_SCHEDULES]: [
        { key: SUB_FEATURES.CREATE_STAFF_SCHEDULE,   label: 'Create Schedule' },
        { key: SUB_FEATURES.EDIT_STAFF_SCHEDULE,     label: 'Edit Schedule' },
        { key: SUB_FEATURES.DELETE_STAFF_SCHEDULE,   label: 'Delete Schedule' }
    ],

    // 6. Services & Packages (services.html)
    [FEATURES.SERVICES_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_SERVICE,          label: 'Create Service' },
        { key: SUB_FEATURES.UPDATE_SERVICE,          label: 'Update Service' },
        { key: SUB_FEATURES.DELETE_SERVICE,          label: 'Delete Service' },
        { key: SUB_FEATURES.CREATE_SERVICE_CATEGORY, label: 'Create Service Category' },
        { key: SUB_FEATURES.UPDATE_SERVICE_CATEGORY, label: 'Update Service Category' },
        { key: SUB_FEATURES.DELETE_SERVICE_CATEGORY, label: 'Delete Service Category' },
        { key: SUB_FEATURES.CREATE_PACKAGE,          label: 'Create Package' },
        { key: SUB_FEATURES.UPDATE_PACKAGE,          label: 'Update Package' },
        { key: SUB_FEATURES.DELETE_PACKAGE,          label: 'Delete Package' }
    ],

    // 7. Point of Sale (pos.html)
    [FEATURES.POS_SYSTEM]: [
        { key: SUB_FEATURES.POS_CHECKOUT,            label: 'Process Checkout' },
        { key: SUB_FEATURES.POS_CREATE_CUSTOMER,     label: 'Create Customer (POS)' }
    ],

    // 8. Inventory & Products (products.html)
    [FEATURES.PRODUCT_MANAGEMENT]: [
        { key: SUB_FEATURES.CREATE_PRODUCT,          label: 'Create Product' },
        { key: SUB_FEATURES.UPDATE_PRODUCT,          label: 'Update Product' },
        { key: SUB_FEATURES.DELETE_PRODUCT,          label: 'Delete Product' },
        { key: SUB_FEATURES.CREATE_PRODUCT_CATEGORY, label: 'Create Product Category' },
        { key: SUB_FEATURES.UPDATE_PRODUCT_CATEGORY, label: 'Update Product Category' },
        { key: SUB_FEATURES.DELETE_PRODUCT_CATEGORY, label: 'Delete Product Category' }
    ],

    // 9. Sales History (sales-history.html)
    [FEATURES.SALES_HISTORY]: [
        { key: SUB_FEATURES.POS_ISSUE_REFUND,        label: 'Issue Refunds / Returns' },
        { key: SUB_FEATURES.POS_EXPORT_SALES,        label: 'Export Sales History' }
    ],

    // 10. Pending Payments (pending-payments.html)
    [FEATURES.PENDING_PAYMENTS]: [
        { key: SUB_FEATURES.PENDING_PAYMENTS_COLLECT,label: 'Collect Pending Payment' }
    ],

    // 11. Payments History (payments-history.html)
    [FEATURES.PAYMENTS_HISTORY]: [
        { key: SUB_FEATURES.PAYMENTS_HISTORY_EXPORT, label: 'Export Payments History' }
    ],

    // 12. Marketing: Offers (offers.html)
    [FEATURES.MARKETING_OFFERS]: [
        { key: SUB_FEATURES.CREATE_OFFER,            label: 'Create Offer' },
        { key: SUB_FEATURES.UPDATE_OFFER,            label: 'Edit Offer' },
        { key: SUB_FEATURES.DELETE_OFFER,            label: 'Delete Offer' }
    ],

    // 13. Marketing: Coupons (coupons.html)
    [FEATURES.MARKETING_COUPONS]: [
        { key: SUB_FEATURES.CREATE_COUPON,           label: 'Create Coupon' },
        { key: SUB_FEATURES.UPDATE_COUPON,           label: 'Edit Coupon' },
        { key: SUB_FEATURES.DELETE_COUPON,           label: 'Delete Coupon' }
    ],

    // 14. Marketing: Memberships (memberships.html)
    [FEATURES.MARKETING_MEMBERSHIPS]: [
        { key: SUB_FEATURES.CREATE_MEMBERSHIP,       label: 'Create Membership Plan' },
        { key: SUB_FEATURES.UPDATE_MEMBERSHIP,       label: 'Edit Membership Plan' },
        { key: SUB_FEATURES.DELETE_MEMBERSHIP,       label: 'Delete Membership Plan' },
        { key: SUB_FEATURES.ASSIGN_MEMBERSHIP,       label: 'Assign Membership' },
        { key: SUB_FEATURES.CANCEL_MEMBERSHIP,       label: 'Cancel Customer Membership' },
        { key: SUB_FEATURES.REFUND_MEMBERSHIP,       label: 'Process Membership Refund' },
        { key: SUB_FEATURES.EXPORT_MEMBERSHIP_USAGE, label: 'Export Usage' }
    ],

    // 15. Marketing: Ad Campaigns (ad-campaigns.html)
    [FEATURES.MARKETING_CAMPAIGNS]: [],

    // 16. Analytics Overview (overview.html)
    [FEATURES.ANALYTICS_OVERVIEW]: [],

    // 17. Reports (reports.html)
    [FEATURES.REPORTS_ACCESS]: [
        { key: SUB_FEATURES.REPORT_VIEW_BASIC,       label: 'View Reports' }
    ],

    // 18. Expenses (expenses.html)
    [FEATURES.ANALYTICS_EXPENSES]: [
        { key: SUB_FEATURES.EXPENSES_CREATE,         label: 'Add Expense' },
        { key: SUB_FEATURES.EXPENSES_UPDATE,         label: 'Edit Expense' },
        { key: SUB_FEATURES.EXPENSES_DELETE,         label: 'Delete Expense' }
    ],

    // 19. Company Settings Hub (company.html)
    [FEATURES.COMPANY_SETTINGS]: [],

    // 20. Users & Access (users.html)
    [FEATURES.USER_MANAGEMENT]: [
        { key: SUB_FEATURES.USER_CREATE,             label: 'Add User' },
        { key: SUB_FEATURES.USER_UPDATE,             label: 'Edit User & Permissions' },
        { key: SUB_FEATURES.USER_DELETE,             label: 'Delete User' }
    ],

    // 21. Roles & Permissions (roles-permissions.html)
    [FEATURES.ROLES_PERMISSIONS]: [
        { key: SUB_FEATURES.ROLE_CREATE,             label: 'Add Role' },
        { key: SUB_FEATURES.ROLE_UPDATE,             label: 'Edit Role & Permissions' },
        { key: SUB_FEATURES.ROLE_DELETE,             label: 'Delete Role' }
    ],

    // 22. Billing & Subscription (billing-subscription.html)
    [FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT]: [
        { key: SUB_FEATURES.BILLING_CHANGE_PLAN,         label: 'Change / Upgrade Plan' },
        { key: SUB_FEATURES.BILLING_MANAGE_ADDONS,       label: 'Manage Add-ons' },
        { key: SUB_FEATURES.BILLING_EDIT_INFO,           label: 'Edit Billing Information' },
        { key: SUB_FEATURES.BILLING_EXPORT_HISTORY,      label: 'Export Payment History' },
        { key: SUB_FEATURES.BILLING_CANCEL_SUBSCRIPTION, label: 'Cancel Subscription' },
        { key: SUB_FEATURES.BILLING_RENEW_SUBSCRIPTION,  label: 'Renew Subscription' }
    ],


    // =========================================================================
    // GROUP B — SUPPORTING FEATURES (Sub-pages 23 to 44)
    // =========================================================================

    // ── DASHBOARD SUB-PAGES ──────────────────────────────────────────────────
    // 23. Today's Revenue (todays-revenue.html)
    [FEATURES.DASHBOARD_TODAYS_REVENUE]: [],

    // 24. Upcoming Appointments (upcoming-appointments.html)
    [FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS]: [
        { key: SUB_FEATURES.UPCOMING_COLLECT_PAYMENT,    label: 'Collect Payment' }
    ],

    // 25. Completed Appointments (completed-appointments.html)
    [FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS]: [],

    // 26. No-Shows & Cancellations (no-shows-cancellations.html)
    [FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS]: [],

    // ── REPORTS SUB-PAGES ────────────────────────────────────────────────────
    // 27. Report Category (report-category.html)
    [FEATURES.REPORTS_CATEGORY]: [],

    // 28. Report Detail (report-detail.html)
    [FEATURES.REPORTS_DETAIL]: [
        { key: SUB_FEATURES.REPORT_DETAIL_EXPORT,        label: 'Export Report Data' }
    ],

    // ── COMPANY SUB-PAGES ────────────────────────────────────────────────────
    // 29. Branches (branches.html)
    [FEATURES.BRANCH_MANAGEMENT]: [
        { key: SUB_FEATURES.BRANCH_CREATE,               label: 'Add Branch' },
        { key: SUB_FEATURES.BRANCH_UPDATE,               label: 'Edit Branch' },
        { key: SUB_FEATURES.BRANCH_DELETE,               label: 'Delete Branch' },
        { key: SUB_FEATURES.BRANCH_SWITCH,               label: 'Switch Branches (Multi-Branch Access)' }
    ],

    // 30. Business Profile (settings-business.html)
    [FEATURES.SETTINGS_BUSINESS]: [
        { key: SUB_FEATURES.SAVE_BUSINESS_SETTINGS,      label: 'Save Business Profile' }
    ],

    // 31. Contact Details (settings-contact.html)
    [FEATURES.SETTINGS_CONTACT]: [
        { key: SUB_FEATURES.SAVE_CONTACT_SETTINGS,       label: 'Save Contact Details' }
    ],

    // 32. Business Hours (settings-hours.html)
    [FEATURES.SETTINGS_HOURS]: [
        { key: SUB_FEATURES.SAVE_HOURS_SETTINGS,         label: 'Save Business Hours' }
    ],

    // 33. Tax & Compliance (settings-tax.html)
    [FEATURES.SETTINGS_TAX]: [
        { key: SUB_FEATURES.SAVE_TAX_SETTINGS,           label: 'Save Tax & Compliance' }
    ],

    // 34. Payment Methods (settings-payments.html)
    [FEATURES.SETTINGS_PAYMENTS]: [
        { key: SUB_FEATURES.SAVE_PAYMENTS_SETTINGS,      label: 'Save Payment Methods' }
    ],

    // 35. Notification Preferences (settings-notifications.html)
    [FEATURES.SETTINGS_NOTIFICATIONS]: [
        { key: SUB_FEATURES.SAVE_NOTIFICATIONS_SETTINGS, label: 'Save Notification Preferences' }
    ],

    // 36. Invoice Settings Hub (settings-invoice.html)
    [FEATURES.SETTINGS_INVOICE]: [],

    // 37. Common Invoice Settings (settings-invoice-common.html)
    [FEATURES.SETTINGS_INVOICE_COMMON]: [
        { key: SUB_FEATURES.SAVE_INVOICE_COMMON,         label: 'Save Common Invoice Settings' }
    ],

    // 38. Booking Invoice Settings (settings-invoice-booking.html)
    [FEATURES.SETTINGS_INVOICE_BOOKING]: [
        { key: SUB_FEATURES.SAVE_INVOICE_BOOKING,        label: 'Save Booking Invoice Settings' }
    ],

    // 39. POS Invoice Settings (settings-invoice-pos.html)
    [FEATURES.SETTINGS_INVOICE_POS]: [
        { key: SUB_FEATURES.SAVE_INVOICE_POS,            label: 'Save POS Invoice Settings' }
    ],

    // 40. Membership Invoice Settings (settings-invoice-membership.html)
    [FEATURES.SETTINGS_INVOICE_MEMBERSHIP]: [
        { key: SUB_FEATURES.SAVE_INVOICE_MEMBERSHIP,     label: 'Save Membership Invoice Settings' }
    ],

    // ── HEADER PAGES ─────────────────────────────────────────────────────────
    // 41. Notifications (notifications.html)
    [FEATURES.NOTIFICATIONS]: [
        { key: SUB_FEATURES.NOTIFICATIONS_MARK_READ,       label: 'Mark All as Read' },
        { key: SUB_FEATURES.NOTIFICATIONS_MANAGE_SETTINGS, label: 'Configure Notification Preferences' }
    ],

    // 42. Support (support.html)
    [FEATURES.SUPPORT]: [
        { key: SUB_FEATURES.SUPPORT_SUBMIT_TICKET,         label: 'Report Issue / Submit Ticket' },
        { key: SUB_FEATURES.SUPPORT_SUBMIT_SUGGESTION,     label: 'Submit Suggestion' },
        { key: SUB_FEATURES.SUPPORT_SUBMIT_REVIEW,         label: 'Submit Review' },
        { key: SUB_FEATURES.SUPPORT_START_CHAT,            label: 'Start Live Chat' }
    ],

    // 43. Issue History (issue-history.html)
    [FEATURES.ISSUE_HISTORY]: [
        { key: SUB_FEATURES.TICKET_SEND_REPLY,             label: 'Send Reply to Ticket' },
        { key: SUB_FEATURES.TICKET_CLOSE,                  label: 'Close Ticket' }
    ],

    // 44. User Guide (user_guide.html)
    [FEATURES.USER_GUIDE]: [],

};
