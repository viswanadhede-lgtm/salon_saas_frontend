/**
 * config/feature-registry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE REGISTRY — Single source of truth for all app features / pages.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Aligns frontend code and developer understanding by giving every page
 *   and sub-page a stable machine key and a human-readable label.
 *   This file contains NO access rules — only naming definitions.
 *   All three config files (subscription-state-manager, rbac-manager,
 *   plan-features-manager) and the frontend UI import keys from here.
 *
 * SECTIONS:
 *   1. FEATURES      — All feature keys (Group A: sidebar, Group B: sub-pages)
 *   2. MODULES_META  — Human labels + icons for every key in FEATURES
 *
 * HOW TO UPDATE:
 *   - New sidebar page added   → add key to GROUP A  + entry to MODULES_META
 *   - New sub-page added       → add key to correct GROUP B parent block
 *                                + entry to MODULES_META
 *   - Page renamed             → update label in MODULES_META only
 *                                (keep key value unchanged to avoid breaking imports)
 *   - Page removed             → delete key from FEATURES + its MODULES_META entry
 *
 * TOTAL: 22 Group A (sidebar) + 22 Group B (sub-pages) = 44 app pages
 * ─────────────────────────────────────────────────────────────────────────────
 */


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — FEATURES
// ─────────────────────────────────────────────────────────────────────────────
export const FEATURES = {

    // =========================================================================
    // GROUP A — CORE SYSTEM FEATURES  (22 Sidebar Pages)
    // =========================================================================

    // Core System
    DASHBOARD_ACCESS:                    'dashboard_access',                // 1.  dashboard.html
    BOOKINGS_MANAGEMENT:                 'bookings_management',             // 2.  bookings.html
    CUSTOMERS_MANAGEMENT:                'customers_management',            // 3.  customers.html

    // Staff
    STAFF_MANAGEMENT:                    'staff_management',                // 4.  staff.html
    STAFF_SCHEDULES:                     'staff_schedules',                 // 5.  staff-schedule.html
    SERVICES_MANAGEMENT:                 'services_management',             // 6.  services.html

    // Sales / POS
    POS_SYSTEM:                          'pos_system',                      // 7.  pos.html
    PRODUCT_MANAGEMENT:                  'product_management',              // 8.  products.html
    SALES_HISTORY:                       'sales_history',                   // 9.  sales-history.html

    // Payments
    PENDING_PAYMENTS:                    'pending_payments',                // 10. pending-payments.html
    PAYMENTS_HISTORY:                    'payments_history',                // 11. payments-history.html

    // Marketing
    MARKETING_OFFERS:                    'marketing_offers',                // 12. offers.html
    MARKETING_COUPONS:                   'marketing_coupons',               // 13. coupons.html
    MARKETING_MEMBERSHIPS:               'marketing_memberships',           // 14. memberships.html
    MARKETING_CAMPAIGNS:                 'marketing_campaigns',             // 15. ad-campaigns.html

    // Analytics
    ANALYTICS_OVERVIEW:                  'analytics_overview',              // 16. overview.html
    REPORTS_ACCESS:                      'reports_access',                  // 17. reports.html
    ANALYTICS_EXPENSES:                  'analytics_expenses',              // 18. expenses.html

    // Settings & Management
    COMPANY_SETTINGS:                    'company_settings',                // 19. company.html
    USER_MANAGEMENT:                     'user_management',                 // 20. users.html
    ROLES_PERMISSIONS:                   'roles_permissions',               // 21. roles-permissions.html
    BILLING_SUBSCRIPTION_MANAGEMENT:     'billing_subscription_management', // 22. billing-subscription.html


    // =========================================================================
    // GROUP B — SUPPORTING FEATURES  (22 Sub-pages, organized by parent)
    // =========================================================================

    // ── DASHBOARD ─────────────────────────────────────────────────────────────
    DASHBOARD_TODAYS_REVENUE:            'dashboard_todays_revenue',        // 23. todays-revenue.html
    DASHBOARD_UPCOMING_APPOINTMENTS:     'dashboard_upcoming_appointments', // 24. upcoming-appointments.html
    DASHBOARD_COMPLETED_APPOINTMENTS:    'dashboard_completed_appointments',// 25. completed-appointments.html
    DASHBOARD_NO_SHOWS_CANCELLATIONS:    'dashboard_no_shows_cancellations',// 26. no-shows-cancellations.html

    // ── REPORTS ───────────────────────────────────────────────────────────────
    REPORTS_CATEGORY:                    'reports_category',                // 27. report-category.html
    REPORTS_DETAIL:                      'reports_detail',                  // 28. report-detail.html

    // ── COMPANY ───────────────────────────────────────────────────────────────
    BRANCH_MANAGEMENT:                   'branch_management',               // 29. branches.html
    SETTINGS_BUSINESS:                   'settings_business',               // 30. settings-business.html
    SETTINGS_CONTACT:                    'settings_contact',                // 31. settings-contact.html
    SETTINGS_HOURS:                      'settings_hours',                  // 32. settings-hours.html
    SETTINGS_TAX:                        'settings_tax',                    // 33. settings-tax.html
    SETTINGS_PAYMENTS:                   'settings_payments',               // 34. settings-payments.html
    SETTINGS_NOTIFICATIONS:              'settings_notifications',          // 35. settings-notifications.html
    SETTINGS_INVOICE:                    'settings_invoice',                // 36. settings-invoice.html
    SETTINGS_INVOICE_COMMON:             'settings_invoice_common',         // 37. settings-invoice-common.html
    SETTINGS_INVOICE_BOOKING:            'settings_invoice_booking',        // 38. settings-invoice-booking.html
    SETTINGS_INVOICE_POS:                'settings_invoice_pos',            // 39. settings-invoice-pos.html
    SETTINGS_INVOICE_MEMBERSHIP:         'settings_invoice_membership',     // 40. settings-invoice-membership.html

    // ── HEADER ────────────────────────────────────────────────────────────────
    NOTIFICATIONS:                       'notifications',                   // 41. notifications.html
    SUPPORT:                             'support',                         // 42. support.html
    ISSUE_HISTORY:                       'issue_history',                   // 43. issue-history.html
    USER_GUIDE:                          'user_guide',                      // 44. user_guide.html
};


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — MODULES_META
// Human-readable labels and icons for every key in FEATURES.
// Used for Roles & Permissions table rendering and developer reference.
// ─────────────────────────────────────────────────────────────────────────────
export const MODULES_META = [

    // GROUP A — Core System Features
    { key: FEATURES.DASHBOARD_ACCESS,                label: 'Dashboard',                       icon: 'home'          },
    { key: FEATURES.BOOKINGS_MANAGEMENT,             label: 'Bookings',                        icon: 'calendar'      },
    { key: FEATURES.CUSTOMERS_MANAGEMENT,            label: 'Customers',                       icon: 'users'         },
    { key: FEATURES.STAFF_MANAGEMENT,                label: 'Staff Providers',                 icon: 'user-check'    },
    { key: FEATURES.STAFF_SCHEDULES,                 label: 'Staff Schedules',                 icon: 'clock'         },
    { key: FEATURES.SERVICES_MANAGEMENT,             label: 'Services',                        icon: 'scissors'      },
    { key: FEATURES.POS_SYSTEM,                      label: 'Point of Sale',                   icon: 'shopping-cart' },
    { key: FEATURES.PRODUCT_MANAGEMENT,              label: 'Products',                        icon: 'box'           },
    { key: FEATURES.SALES_HISTORY,                   label: 'Sales History',                   icon: 'clipboard'     },
    { key: FEATURES.PENDING_PAYMENTS,                label: 'Pending Payments',                icon: 'clock'         },
    { key: FEATURES.PAYMENTS_HISTORY,                label: 'Payments History',                icon: 'credit-card'   },
    { key: FEATURES.MARKETING_OFFERS,                label: 'Offers',                          icon: 'tag'           },
    { key: FEATURES.MARKETING_COUPONS,               label: 'Coupons',                         icon: 'percent'       },
    { key: FEATURES.MARKETING_MEMBERSHIPS,           label: 'Memberships',                     icon: 'award'         },
    { key: FEATURES.MARKETING_CAMPAIGNS,             label: 'Ad Campaigns',                    icon: 'speaker'       },
    { key: FEATURES.ANALYTICS_OVERVIEW,              label: 'Overview',                        icon: 'pie-chart'     },
    { key: FEATURES.REPORTS_ACCESS,                  label: 'Reports',                         icon: 'bar-chart-2'   },
    { key: FEATURES.ANALYTICS_EXPENSES,              label: 'Expenses',                        icon: 'dollar-sign'   },
    { key: FEATURES.COMPANY_SETTINGS,                label: 'Company Settings',                icon: 'settings'      },
    { key: FEATURES.USER_MANAGEMENT,                 label: 'Users',                           icon: 'users'         },
    { key: FEATURES.ROLES_PERMISSIONS,               label: 'Roles & Permissions',             icon: 'shield'        },
    { key: FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT, label: 'Billing & Subscriptions',         icon: 'credit-card'   },

    // GROUP B — Supporting Features

    // Dashboard
    { key: FEATURES.DASHBOARD_TODAYS_REVENUE,        label: 'Dashboard: Todays Revenue',           icon: 'dollar-sign'  },
    { key: FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS, label: 'Dashboard: Upcoming Appointments',    icon: 'calendar'     },
    { key: FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,label: 'Dashboard: Completed Appointments',   icon: 'check-circle' },
    { key: FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,label: 'Dashboard: No Shows & Cancellations', icon: 'x-circle'     },

    // Reports
    { key: FEATURES.REPORTS_CATEGORY,               label: 'Reports: Category View',              icon: 'bar-chart-2'  },
    { key: FEATURES.REPORTS_DETAIL,                  label: 'Reports: Detail View',                icon: 'bar-chart-2'  },

    // Company
    { key: FEATURES.BRANCH_MANAGEMENT,              label: 'Branches',                            icon: 'map-pin'      },
    { key: FEATURES.SETTINGS_BUSINESS,              label: 'Settings: Business',                  icon: 'briefcase'    },
    { key: FEATURES.SETTINGS_CONTACT,               label: 'Settings: Contact',                   icon: 'phone'        },
    { key: FEATURES.SETTINGS_HOURS,                 label: 'Settings: Hours',                     icon: 'clock'        },
    { key: FEATURES.SETTINGS_TAX,                   label: 'Settings: Tax',                       icon: 'file-text'    },
    { key: FEATURES.SETTINGS_PAYMENTS,              label: 'Settings: Payments',                  icon: 'credit-card'  },
    { key: FEATURES.SETTINGS_NOTIFICATIONS,         label: 'Settings: Notifications',             icon: 'bell'         },
    { key: FEATURES.SETTINGS_INVOICE,               label: 'Settings: Invoice',                   icon: 'file-text'    },
    { key: FEATURES.SETTINGS_INVOICE_COMMON,        label: 'Settings: Invoice Common',            icon: 'file-text'    },
    { key: FEATURES.SETTINGS_INVOICE_BOOKING,       label: 'Settings: Invoice Booking',           icon: 'file-text'    },
    { key: FEATURES.SETTINGS_INVOICE_POS,           label: 'Settings: Invoice POS',               icon: 'file-text'    },
    { key: FEATURES.SETTINGS_INVOICE_MEMBERSHIP,    label: 'Settings: Invoice Membership',        icon: 'file-text'    },

    // Header
    { key: FEATURES.NOTIFICATIONS,                  label: 'Notifications',                       icon: 'bell'         },
    { key: FEATURES.SUPPORT,                        label: 'Support',                             icon: 'help-circle'  },
    { key: FEATURES.ISSUE_HISTORY,                  label: 'Issue History',                       icon: 'alert-circle' },
    { key: FEATURES.USER_GUIDE,                     label: 'User Guide',                          icon: 'book-open'    },
];
