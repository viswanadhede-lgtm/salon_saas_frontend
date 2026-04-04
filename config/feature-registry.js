export const FEATURES = {
    // Core system
    DASHBOARD_ACCESS: 'dashboard_access',
    BOOKINGS_MANAGEMENT: 'bookings_management',
    CUSTOMERS_MANAGEMENT: 'customers_management',
    // Staff
    STAFF_MANAGEMENT: 'staff_management',
    STAFF_SCHEDULES: 'staff_schedules',
    SERVICES_MANAGEMENT: 'services_management',

    // Sales / POS
    POS_SYSTEM: 'pos_system',
    PRODUCT_MANAGEMENT: 'product_management',
    SALES_HISTORY: 'sales_history',

    // Payments
    PENDING_PAYMENTS: 'pending_payments',
    PAYMENTS_HISTORY: 'payments_history',

    // Marketing
    MARKETING_OFFERS: 'marketing_offers',
    MARKETING_COUPONS: 'marketing_coupons',
    MARKETING_MEMBERSHIPS: 'marketing_memberships',
    MARKETING_CAMPAIGNS: 'marketing_campaigns',

    // Analytics
    ANALYTICS_OVERVIEW: 'analytics_overview',
    REPORTS_ACCESS: 'reports_access',
    ANALYTICS_EXPENSES: 'analytics_expenses',

    // Settings
    COMPANY_SETTINGS: 'company_settings',
    BRANCH_MANAGEMENT: 'branch_management',
    USER_MANAGEMENT: 'user_management',
    ROLES_PERMISSIONS: 'roles_permissions',
    CUSTOM_FIELDS: 'custom_fields',
    BILLING_SUBSCRIPTION_MANAGEMENT: 'billing_subscription_management'
};

// UI Metadata used for dynamically rendering the Roles & Permissions tables
export const MODULES_META = [
    { key: FEATURES.DASHBOARD_ACCESS, label: 'Dashboard', icon: 'home' },
    { key: FEATURES.BOOKINGS_MANAGEMENT, label: 'Bookings', icon: 'calendar' },
    { key: FEATURES.CUSTOMERS_MANAGEMENT, label: 'Customers', icon: 'users' },
    { key: FEATURES.STAFF_MANAGEMENT, label: 'Staff Providers', icon: 'user-check' },
    { key: FEATURES.STAFF_SCHEDULES, label: 'Staff Schedules', icon: 'clock' },
    { key: FEATURES.SERVICES_MANAGEMENT, label: 'Services', icon: 'scissors' },
    { key: FEATURES.POS_SYSTEM, label: 'Point of Sale', icon: 'dollar-sign' },
    { key: FEATURES.PRODUCT_MANAGEMENT, label: 'Products', icon: 'box' },
    { key: FEATURES.SALES_HISTORY, label: 'Sales History', icon: 'clipboard' },
    { key: FEATURES.PENDING_PAYMENTS, label: 'Pending Payments', icon: 'clock' },
    { key: FEATURES.PAYMENTS_HISTORY, label: 'Payments History', icon: 'credit-card' },
    { key: FEATURES.MARKETING_OFFERS, label: 'Offers', icon: 'tag' },
    { key: FEATURES.MARKETING_COUPONS, label: 'Coupons', icon: 'percent' },
    { key: FEATURES.MARKETING_MEMBERSHIPS, label: 'Memberships', icon: 'award' },
    { key: FEATURES.MARKETING_CAMPAIGNS, label: 'Ad Campaigns', icon: 'speaker' },
    { key: FEATURES.ANALYTICS_OVERVIEW, label: 'Overview', icon: 'pie-chart' },
    { key: FEATURES.REPORTS_ACCESS, label: 'Reports', icon: 'bar-chart-2' },
    { key: FEATURES.ANALYTICS_EXPENSES, label: 'Expenses', icon: 'dollar-sign' },
    { key: FEATURES.COMPANY_SETTINGS, label: 'Company Settings', icon: 'settings' },
    { key: FEATURES.BRANCH_MANAGEMENT, label: 'Branches', icon: 'map-pin' },
    { key: FEATURES.USER_MANAGEMENT, label: 'Users', icon: 'users' },
    { key: FEATURES.ROLES_PERMISSIONS, label: 'Roles & Permissions', icon: 'shield' },
    { key: FEATURES.CUSTOM_FIELDS, label: 'Custom Fields', icon: 'edit-3' },
    { key: FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT, label: 'Billing & Subscriptions', icon: 'credit-card' }
];
