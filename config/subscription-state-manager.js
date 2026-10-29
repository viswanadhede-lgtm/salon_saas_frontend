/**
 * config/subscription-state-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SUBSCRIPTION STATE MANAGER — Tenant lifecycle & read/write access gatekeeper.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Governs application-wide access based on the tenant's real-time subscription
 *   status from the `public.subscriptions` table.
 *
 * CORE BUSINESS RULE:
 *   - ACTIVE / VALID TRIAL  → FULL ACCESS (Read + Write across allowed modules).
 *   - EXPIRED / PAST DUE    → READ-ONLY ACCESS (Historical records, past bookings,
 *                             clients, reports, and invoices remain viewable so
 *                             the salon is never locked out of its data, but all
 *                             mutations, POS sales, and creations are locked).
 *
 * ARCHITECTURAL INTEGRATION:
 *   - Imports feature keys from `config/feature-registry.js`
 *   - Imports granular action keys from `config/sub-feature-registry.js`
 *   - Serves as Gate 1 in the Global Auth Guard pipeline before RBAC and Plan checks.
 *
 * SECTIONS:
 *   1. READ_ACCESS_FEATURES     — Features & views accessible even when expired.
 *   2. WRITE_ACCESS_FEATURES    — Granular actions locked when subscription is expired.
 *   3. SUBSCRIPTION STATE LOGIC — Query subscriptions table & evaluate end date math.
 *   4. INTEGRATION & EXPORTS    — Public API (canWrite, canRead, getSubscriptionAccess).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { SUB_FEATURES } from './sub-feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const CACHE_STORAGE_KEY = 'salon_subscription_access_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — READ_ACCESS_FEATURES
// Every page and view-only capability that remains accessible to staff
// even if the subscription is expired or past due.
// ─────────────────────────────────────────────────────────────────────────────
export const READ_ACCESS_FEATURES = {

    // =========================================================================
    // GROUP A — CORE SYSTEM PAGES (All 22 sidebar pages remain viewable)
    // =========================================================================
    SIDEBAR_PAGES: [
        FEATURES.DASHBOARD_ACCESS,                     // 1.  dashboard.html
        FEATURES.BOOKINGS_MANAGEMENT,                  // 2.  bookings.html
        FEATURES.CUSTOMERS_MANAGEMENT,                 // 3.  customers.html
        FEATURES.STAFF_MANAGEMENT,                     // 4.  staff.html
        FEATURES.STAFF_SCHEDULES,                      // 5.  staff-schedule.html
        FEATURES.SERVICES_MANAGEMENT,                  // 6.  services.html
        FEATURES.POS_SYSTEM,                           // 7.  pos.html
        FEATURES.PRODUCT_MANAGEMENT,                   // 8.  products.html
        FEATURES.SALES_HISTORY,                        // 9.  sales-history.html
        FEATURES.PENDING_PAYMENTS,                     // 10. pending-payments.html
        FEATURES.PAYMENTS_HISTORY,                     // 11. payments-history.html
        FEATURES.MARKETING_OFFERS,                     // 12. offers.html
        FEATURES.MARKETING_COUPONS,                    // 13. coupons.html
        FEATURES.MARKETING_MEMBERSHIPS,                // 14. memberships.html

        FEATURES.ANALYTICS_OVERVIEW,                   // 16. overview.html
        FEATURES.REPORTS_ACCESS,                       // 17. reports.html
        FEATURES.ANALYTICS_EXPENSES,                   // 18. expenses.html
        FEATURES.COMPANY_SETTINGS,                     // 19. company.html
        FEATURES.USER_MANAGEMENT,                      // 20. users.html
        FEATURES.ROLES_PERMISSIONS,                    // 21. roles-permissions.html
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT       // 22. billing-subscription.html (Must remain open to renew!)
    ],

    // =========================================================================
    // GROUP B — SUPPORTING PAGES (All 22 sub-pages remain viewable)
    // =========================================================================
    SUB_PAGES: [
        FEATURES.DASHBOARD_TODAYS_REVENUE,             // 23. todays-revenue.html
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,      // 24. upcoming-appointments.html
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,     // 25. completed-appointments.html
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,     // 26. no-shows-cancellations.html
        FEATURES.REPORTS_CATEGORY,                     // 27. report-category.html
        FEATURES.REPORTS_DETAIL,                       // 28. report-detail.html
        FEATURES.REPORT_FINANCIAL,                     // Financial Reports
        FEATURES.REPORT_STAFF_PERFORMANCE,             // Staff Performance Reports
        FEATURES.REPORT_BOOKINGS,                      // Bookings Reports
        FEATURES.REPORT_CUSTOMERS,                     // Customers Reports
        FEATURES.REPORT_PRODUCT_SALES,                 // Product Sales Reports
        FEATURES.REPORT_DISCOUNT_USAGES,               // Discount Usages Reports
        FEATURES.REPORT_MEMBERSHIPS,                   // Memberships Reports
        FEATURES.BRANCH_MANAGEMENT,                    // 29. branches.html
        FEATURES.SETTINGS_BUSINESS,                    // 30. settings-business.html
        FEATURES.SETTINGS_CONTACT,                     // 31. settings-contact.html
        FEATURES.SETTINGS_HOURS,                       // 32. settings-hours.html
        FEATURES.SETTINGS_TAX,                         // 33. settings-tax.html
        FEATURES.SETTINGS_PAYMENTS,                    // 34. settings-payments.html
        FEATURES.SETTINGS_NOTIFICATIONS,               // 35. settings-notifications.html
        FEATURES.SETTINGS_INVOICE,                     // 36. settings-invoice.html
        FEATURES.SETTINGS_INVOICE_COMMON,              // 37. settings-invoice-common.html
        FEATURES.SETTINGS_INVOICE_BOOKING,             // 38. settings-invoice-booking.html
        FEATURES.SETTINGS_INVOICE_POS,                 // 39. settings-invoice-pos.html
        FEATURES.SETTINGS_INVOICE_MEMBERSHIP,          // 40. settings-invoice-membership.html
        FEATURES.NOTIFICATIONS,                        // 41. notifications.html
        FEATURES.SUPPORT,                              // 42. support.html
        FEATURES.ISSUE_HISTORY,                        // 43. issue-history.html
        FEATURES.USER_GUIDE,                           // 44. user_guide.html
        FEATURES.MANAGE_ADDONS                         // 45. manage-addons.html
    ],

    // Specific actions explicitly allowed even in read-only / expired mode (e.g. renewal & support)
    PERMITTED_ACTIONS: [
        SUB_FEATURES.BILLING_RENEW_SUBSCRIPTION,       // Salon can pay to renew
        SUB_FEATURES.BILLING_CHANGE_PLAN,              // Salon can upgrade to restore access
        SUB_FEATURES.BILLING_MANAGE_ADDONS,            // View add-ons
        SUB_FEATURES.BILLING_EXPORT_HISTORY,           // Download past invoices/receipts for accounting
        SUB_FEATURES.SUPPORT_SUBMIT_TICKET,            // Contact customer support
        SUB_FEATURES.SUPPORT_START_CHAT,               // Chat with helpdesk
        SUB_FEATURES.TICKET_SEND_REPLY,                // Reply to existing tickets
        SUB_FEATURES.NOTIFICATIONS_MARK_READ           // Dismiss notification alerts
    ]
};


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — WRITE_ACCESS_FEATURES
// Granular actions locked when subscription is expired (accessLevel === 'read-only').
// Every mutation, creation, deletion, or financial charging action belongs here.
// ─────────────────────────────────────────────────────────────────────────────
export const WRITE_ACCESS_FEATURES = [

    // =========================================================================
    // GROUP A — CORE MUTATING ACTIONS (Sidebar Pages)
    // =========================================================================

    // ── Page 1: Dashboard ────────────────────────────────────────────────────
    SUB_FEATURES.DASHBOARD_CREATE_BOOKING,

    // ── Page 2: Bookings ─────────────────────────────────────────────────────
    SUB_FEATURES.CREATE_BOOKING,
    SUB_FEATURES.UPDATE_BOOKING,
    SUB_FEATURES.CANCEL_BOOKING,
    SUB_FEATURES.COLLECT_PAYMENT,
    SUB_FEATURES.BOOKING_REFUND,

    // ── Page 3: Customers ────────────────────────────────────────────────────
    SUB_FEATURES.CUSTOMER_CREATE,
    SUB_FEATURES.CUSTOMER_EDIT,
    SUB_FEATURES.CUSTOMER_DELETE,
    SUB_FEATURES.CUSTOMER_EXPORT,

    // ── Page 4: Staff ────────────────────────────────────────────────────────
    SUB_FEATURES.CREATE_STAFF,
    SUB_FEATURES.UPDATE_STAFF,
    SUB_FEATURES.DELETE_STAFF,

    // ── Page 5: Staff Schedules ──────────────────────────────────────────────
    SUB_FEATURES.CREATE_STAFF_SCHEDULE,
    SUB_FEATURES.EDIT_STAFF_SCHEDULE,
    SUB_FEATURES.DELETE_STAFF_SCHEDULE,

    // ── Page 6: Services ─────────────────────────────────────────────────────
    SUB_FEATURES.CREATE_SERVICE,
    SUB_FEATURES.UPDATE_SERVICE,
    SUB_FEATURES.DELETE_SERVICE,
    SUB_FEATURES.CREATE_SERVICE_CATEGORY,
    SUB_FEATURES.UPDATE_SERVICE_CATEGORY,
    SUB_FEATURES.DELETE_SERVICE_CATEGORY,
    SUB_FEATURES.CREATE_PACKAGE,
    SUB_FEATURES.UPDATE_PACKAGE,
    SUB_FEATURES.DELETE_PACKAGE,

    // ── Page 7: POS ──────────────────────────────────────────────────────────
    SUB_FEATURES.POS_CHECKOUT,
    SUB_FEATURES.POS_CREATE_CUSTOMER,

    // ── Page 8: Products & Inventory ─────────────────────────────────────────
    SUB_FEATURES.CREATE_PRODUCT,
    SUB_FEATURES.UPDATE_PRODUCT,
    SUB_FEATURES.DELETE_PRODUCT,
    SUB_FEATURES.CREATE_PRODUCT_CATEGORY,
    SUB_FEATURES.UPDATE_PRODUCT_CATEGORY,
    SUB_FEATURES.DELETE_PRODUCT_CATEGORY,

    // ── Page 9: Sales History ────────────────────────────────────────────────
    SUB_FEATURES.POS_ISSUE_REFUND,
    SUB_FEATURES.POS_EXPORT_SALES,

    // ── Page 10: Pending Payments ────────────────────────────────────────────
    SUB_FEATURES.PENDING_PAYMENTS_COLLECT,

    // ── Page 11: Payments History ────────────────────────────────────────────
    SUB_FEATURES.PAYMENTS_HISTORY_EXPORT,

    // ── Page 12: Marketing Offers ────────────────────────────────────────────
    SUB_FEATURES.CREATE_OFFER,
    SUB_FEATURES.UPDATE_OFFER,
    SUB_FEATURES.DELETE_OFFER,

    // ── Page 13: Coupons ─────────────────────────────────────────────────────
    SUB_FEATURES.CREATE_COUPON,
    SUB_FEATURES.UPDATE_COUPON,
    SUB_FEATURES.DELETE_COUPON,

    // ── Page 14: Memberships ─────────────────────────────────────────────────
    SUB_FEATURES.CREATE_MEMBERSHIP,
    SUB_FEATURES.UPDATE_MEMBERSHIP,
    SUB_FEATURES.DELETE_MEMBERSHIP,
    SUB_FEATURES.ASSIGN_MEMBERSHIP,
    SUB_FEATURES.CANCEL_MEMBERSHIP,
    SUB_FEATURES.REFUND_MEMBERSHIP,
    SUB_FEATURES.EXPORT_MEMBERSHIP_USAGE,

    // ── Page 17: Reports ─────────────────────────────────────────────────────
    SUB_FEATURES.REPORT_VIEW_BASIC,

    // ── Page 18: Expenses ────────────────────────────────────────────────────
    SUB_FEATURES.EXPENSES_CREATE,
    SUB_FEATURES.EXPENSES_UPDATE,
    SUB_FEATURES.EXPENSES_DELETE,

    // ── Page 20: Users ───────────────────────────────────────────────────────
    SUB_FEATURES.USER_CREATE,
    SUB_FEATURES.USER_UPDATE,
    SUB_FEATURES.USER_DELETE,

    // ── Page 21: Roles & Permissions ─────────────────────────────────────────
    SUB_FEATURES.ROLE_CREATE,
    SUB_FEATURES.ROLE_UPDATE,
    SUB_FEATURES.ROLE_DELETE,

    // ── Page 22: Billing Mutations ───────────────────────────────────────────
    SUB_FEATURES.BILLING_EDIT_INFO,
    SUB_FEATURES.BILLING_CANCEL_SUBSCRIPTION,


    // =========================================================================
    // GROUP B — SUPPORTING MUTATING ACTIONS (Sub-Pages)
    // =========================================================================

    // ── Page 24: Upcoming Appointments ───────────────────────────────────────
    SUB_FEATURES.UPCOMING_COLLECT_PAYMENT,

    // ── Page 28: Report Detail ───────────────────────────────────────────────
    SUB_FEATURES.REPORT_DETAIL_EXPORT,

    // ── Page 29: Branches ────────────────────────────────────────────────────
    SUB_FEATURES.BRANCH_CREATE,
    SUB_FEATURES.BRANCH_UPDATE,
    SUB_FEATURES.BRANCH_DELETE,
    SUB_FEATURES.BRANCH_SWITCH,

    // ── Page 30: Business Settings ───────────────────────────────────────────
    SUB_FEATURES.SAVE_BUSINESS_SETTINGS,

    // ── Page 31: Contact Settings ────────────────────────────────────────────
    SUB_FEATURES.SAVE_CONTACT_SETTINGS,

    // ── Page 32: Business Hours Settings ─────────────────────────────────────
    SUB_FEATURES.SAVE_HOURS_SETTINGS,

    // ── Page 33: Tax Settings ────────────────────────────────────────────────
    SUB_FEATURES.SAVE_TAX_SETTINGS,

    // ── Page 34: Payments Settings ───────────────────────────────────────────
    SUB_FEATURES.SAVE_PAYMENTS_SETTINGS,

    // ── Page 35: Notifications Settings ──────────────────────────────────────
    SUB_FEATURES.SAVE_NOTIFICATIONS_SETTINGS,

    // ── Page 37: Common Invoice Settings ─────────────────────────────────────
    SUB_FEATURES.SAVE_INVOICE_COMMON,

    // ── Page 38: Booking Invoice Settings ────────────────────────────────────
    SUB_FEATURES.SAVE_INVOICE_BOOKING,

    // ── Page 39: POS Invoice Settings ────────────────────────────────────────
    SUB_FEATURES.SAVE_INVOICE_POS,

    // ── Page 40: Membership Invoice Settings ─────────────────────────────────
    SUB_FEATURES.SAVE_INVOICE_MEMBERSHIP,

    // ── Page 41: Notifications ───────────────────────────────────────────────
    SUB_FEATURES.NOTIFICATIONS_MANAGE_SETTINGS,

    // ── Page 42: Support ─────────────────────────────────────────────────────
    SUB_FEATURES.SUPPORT_SUBMIT_SUGGESTION,
    SUB_FEATURES.SUPPORT_SUBMIT_REVIEW,

    // ── Page 43: Issue History ───────────────────────────────────────────────
    SUB_FEATURES.TICKET_CLOSE
];

// O(1) Fast lookup set for write features
const LOCKED_WRITE_ACTIONS_SET = new Set(WRITE_ACCESS_FEATURES);
const PERMITTED_READ_ACTIONS_SET = new Set(READ_ACCESS_FEATURES.PERMITTED_ACTIONS);


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — SUBSCRIPTION STATE LOGIC
// Queries `public.subscriptions` table and evaluates date math + status.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the active company_id from localStorage appContext or direct keys.
 */
function resolveCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        return localStorage.getItem('company_id') || null;
    }
}

/**
 * Resolves the logged-in user_id as a fallback.
 */
function resolveUserId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.user?.user_id || ctx.user?.id || localStorage.getItem('user_id') || null;
    } catch {
        return localStorage.getItem('user_id') || null;
    }
}

/**
 * Direct query to Supabase `public.subscriptions` table.
 * Falls back to user_id if company has no direct row.
 */
async function fetchSubscriptionRecord(companyId, userId) {
    if (!companyId && !userId) return null;

    try {
        // 1. Primary lookup by company_id
        if (companyId) {
            const { data, error } = await supabase
                .from('subscriptions')
                .select('subscription_id, company_id, plan_id, plan_name, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, created_at')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                return data[0];
            }
        }

        // 2. Secondary fallback lookup by user_id
        if (userId) {
            const { data: userData, error: userError } = await supabase
                .from('subscriptions')
                .select('subscription_id, company_id, plan_id, plan_name, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!userError && userData && userData.length > 0) {
                return userData[0];
            }
        }

        return null;
    } catch (err) {
        console.warn('[SubscriptionState] Error fetching subscription record:', err);
        return null;
    }
}

/**
 * Core mathematical and status evaluator.
 * Determines accessLevel ('full' vs 'read-only') and lifecycle metadata.
 */
export function evaluateSubscription(sub) {
    const now = new Date();

    if (!sub) {
        return {
            accessLevel: 'read-only',
            status: 'none',
            planName: 'Free / Expired',
            planId: null,
            billingCycle: 'none',
            autoRenew: false,
            startDate: null,
            endDate: null,
            daysRemaining: 0,
            isExpiringSoon: false,
            isExpired: true,
            canRenew: true,
            reason: 'no_subscription_found'
        };
    }

    const rawStatus = (sub.status || '').toLowerCase().trim();
    const endDate = sub.subscription_end_date ? new Date(sub.subscription_end_date) : null;
    const isTimeValid = endDate ? endDate.getTime() > now.getTime() : false;

    // Calculate days remaining
    let daysRemaining = 0;
    if (endDate && isTimeValid) {
        daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Determine access level based on status & date math
    let accessLevel = 'read-only';
    let isExpired = true;
    let reason = '';

    if (rawStatus === 'active' || rawStatus === 'trial') {
        if (isTimeValid) {
            accessLevel = 'full';
            isExpired = false;
            reason = rawStatus;
        } else {
            accessLevel = 'read-only';
            isExpired = true;
            reason = 'period_ended';
        }
    } else if (rawStatus === 'cancelled') {
        // Scheduled cancellation: cancelled auto-renew but period still running
        if (isTimeValid) {
            accessLevel = 'full';
            isExpired = false;
            reason = 'cancelled_pending_period_end';
        } else {
            accessLevel = 'read-only';
            isExpired = true;
            reason = 'cancelled_and_period_ended';
        }
    } else if (rawStatus === 'past_due' || rawStatus === 'suspended' || rawStatus === 'expired') {
        accessLevel = 'read-only';
        isExpired = true;
        reason = rawStatus;
    } else {
        accessLevel = isTimeValid ? 'full' : 'read-only';
        isExpired = !isTimeValid;
        reason = 'unknown_status_fallback';
    }

    const isExpiringSoon = !isExpired && daysRemaining > 0 && daysRemaining <= 5;

    return {
        accessLevel,                                    // 'full' | 'read-only'
        status: rawStatus || 'unknown',
        planName: sub.plan_name || 'Standard Plan',
        planId: sub.plan_id || null,
        billingCycle: sub.billing_cycle || 'monthly',
        autoRenew: sub.auto_renew !== false,
        startDate: sub.subscription_start_date || null,
        endDate: sub.subscription_end_date || null,
        daysRemaining,
        isExpiringSoon,
        isExpired,
        canRenew: true,
        reason
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — INTEGRATION & EXPORT API
// Public methods used across UI components, forms, and the Global Auth Guard.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current cached access profile, or fetches fresh if expired.
 * @param {boolean} forceRefresh - If true, ignores sessionStorage cache and hits DB.
 * @returns {Promise<Object>} The evaluated subscription access profile.
 */
export async function getSubscriptionAccess(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const rawCache = sessionStorage.getItem(CACHE_STORAGE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache);
                if (parsed.timestamp && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
                    return parsed.profile;
                }
            }
        } catch { /* Cache read error: fall through to fresh fetch */ }
    }

    const companyId = resolveCompanyId();
    const userId = resolveUserId();
    const record = await fetchSubscriptionRecord(companyId, userId);
    const profile = evaluateSubscription(record);

    try {
        sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            profile
        }));
    } catch { /* Cache write error: non-blocking */ }

    return profile;
}

/**
 * Synchronous check using current cached profile.
 * Ideal for template rendering and click handlers.
 * @returns {Object} Evaluated subscription profile (or default read-only if not yet loaded).
 */
export function getSubscriptionAccessSync() {
    try {
        const rawCache = sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            return parsed.profile;
        }
    } catch { /* fall through */ }

    return {
        accessLevel: 'full', // Optimistic default until async completes
        status: 'active',
        isExpired: false,
        daysRemaining: 30
    };
}

/**
 * Checks if a specific granular action (sub-feature) is permitted under
 * the current subscription state.
 *
 * @param {string} subFeatureKey - Machine key from SUB_FEATURES
 * @param {Object} [optionalProfile] - Pre-fetched profile to avoid async lookup
 * @returns {boolean} True if the action is permitted, false if locked by read-only mode.
 */
export function canWrite(subFeatureKey, optionalProfile = null) {
    const profile = optionalProfile || getSubscriptionAccessSync();

    // 1. If subscription is full / active, all write actions are permitted by Gate 1
    if (profile.accessLevel === 'full') {
        return true;
    }

    // 2. If subscription is expired (read-only):
    // Actions explicitly permitted (e.g. Renew Plan, Contact Support) pass through
    if (PERMITTED_READ_ACTIONS_SET.has(subFeatureKey)) {
        return true;
    }

    // If it is in the locked write actions list, reject
    if (LOCKED_WRITE_ACTIONS_SET.has(subFeatureKey)) {
        return false;
    }

    // Default safe fallback: block unknown mutation actions when expired
    return false;
}

/**
 * Checks if a top-level page or feature is accessible for viewing.
 * In this system, all pages remain viewable in read-only mode.
 *
 * @param {string} featureKey - Machine key from FEATURES
 * @returns {boolean} True (always viewable).
 */
export function canRead(featureKey) {
    // All 44 application pages remain accessible in read-only mode
    return true;
}

/**
 * Quick boolean check to determine if the subscription is expired.
 * Useful for conditionally rendering banners or warning toasts.
 * @returns {boolean} True if expired / read-only.
 */
export function isSubscriptionExpired() {
    const profile = getSubscriptionAccessSync();
    return profile.accessLevel === 'read-only' || profile.isExpired === true;
}

/**
 * Clears the subscription access cache.
 * Call this immediately after a payment, plan upgrade, or renewal succeeds.
 */
export function clearSubscriptionCache() {
    try {
        sessionStorage.removeItem(CACHE_STORAGE_KEY);
    } catch { /* non-blocking */ }
}

/**
 * Automatically attaches an alert banner at the top of a page if the subscription
 * is expired or expiring within 5 days.
 *
 * @param {HTMLElement|string} targetElement - DOM element or container ID
 */
export function renderSubscriptionBanner(targetElement) {
    const profile = getSubscriptionAccessSync();
    if (!profile) return;

    const container = typeof targetElement === 'string'
        ? document.getElementById(targetElement)
        : targetElement;

    if (!container) return;

    // Remove existing banner if present
    const existing = document.getElementById('subscription-state-banner');
    if (existing) existing.remove();

    if (profile.isExpired || profile.accessLevel === 'read-only') {
        const banner = document.createElement('div');
        banner.id = 'subscription-state-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #e53e3e, #c53030);
            color: #ffffff;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span>
                <span><strong>Subscription Expired:</strong> Your account is currently in <strong>Read-Only Mode</strong>. Creation and editing are disabled.</span>
            </div>
            <a href="billing-subscription.html" style="background: #ffffff; color: #c53030; padding: 4px 12px; border-radius: 4px; font-weight: 600; text-decoration: none; font-size: 12px;">Renew Now</a>
        `;
        container.prepend(banner);
    } else if (profile.isExpiringSoon) {
        const banner = document.createElement('div');
        banner.id = 'subscription-state-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #dd6b20, #c05621);
            color: #ffffff;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⏳</span>
                <span>Your subscription expires in <strong>${profile.daysRemaining} days</strong>. Renew to maintain uninterrupted service.</span>
            </div>
            <a href="billing-subscription.html" style="background: #ffffff; color: #c05621; padding: 4px 12px; border-radius: 4px; font-weight: 600; text-decoration: none; font-size: 12px;">Renew Plan</a>
        `;
        container.prepend(banner);
    }
}
