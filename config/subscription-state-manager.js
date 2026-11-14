/**
 * config/subscription-state-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SUBSCRIPTION STATE MANAGER (Zero-Trust Backend Thin Client)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURAL ROLE:
 *   - Gate 1: Evaluates read/write mode based on authoritative session context
 *     returned directly by the database RPC `get_session_context()`.
 *   - All subscription validation, date math, trial periods, and grace periods
 *     are evaluated strictly in PostgreSQL (`shared.is_subscription_active`).
 *   - Write mutations are stopped at the database layer (`shared.check_subscription`).
 *   - This file provides synchronous UI checks (`canWrite`, `getSubscriptionAccessSync`)
 *     and attaches the read-only alert banner for expired accounts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURES } from './feature-registry.js';
import { SUB_FEATURES } from './sub-feature-registry.js';
import { supabase } from '../lib/supabase.js';

// Cache configuration
const CACHE_STORAGE_KEY = 'salon_subscription_access_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — READ_ACCESS_FEATURES (View-only accessible even when expired)
// ─────────────────────────────────────────────────────────────────────────────
export const READ_ACCESS_FEATURES = {
    SIDEBAR_PAGES: [
        FEATURES.DASHBOARD_ACCESS,
        FEATURES.BOOKINGS_MANAGEMENT,
        FEATURES.CUSTOMERS_MANAGEMENT,
        FEATURES.STAFF_MANAGEMENT,
        FEATURES.STAFF_SCHEDULES,
        FEATURES.SERVICES_MANAGEMENT,
        FEATURES.POS_SYSTEM,
        FEATURES.PRODUCT_MANAGEMENT,
        FEATURES.SALES_HISTORY,
        FEATURES.PENDING_PAYMENTS,
        FEATURES.PAYMENTS_HISTORY,
        FEATURES.MARKETING_OFFERS,
        FEATURES.MARKETING_COUPONS,
        FEATURES.MARKETING_MEMBERSHIPS,
        FEATURES.INTEGRATIONS_WEBSITE_BOOKING,
        FEATURES.INTEGRATIONS_WHATSAPP,
        FEATURES.ANALYTICS_OVERVIEW,
        FEATURES.REPORTS_ACCESS,
        FEATURES.ANALYTICS_EXPENSES,
        FEATURES.COMPANY_SETTINGS,
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLES_PERMISSIONS,
        FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
    ],
    SUB_PAGES: [
        FEATURES.DASHBOARD_TODAYS_REVENUE,
        FEATURES.DASHBOARD_UPCOMING_APPOINTMENTS,
        FEATURES.DASHBOARD_COMPLETED_APPOINTMENTS,
        FEATURES.DASHBOARD_NO_SHOWS_CANCELLATIONS,
        FEATURES.REPORTS_CATEGORY,
        FEATURES.REPORTS_DETAIL,
        FEATURES.REPORT_FINANCIAL,
        FEATURES.REPORT_STAFF_PERFORMANCE,
        FEATURES.REPORT_BOOKINGS,
        FEATURES.REPORT_CUSTOMERS,
        FEATURES.REPORT_PRODUCT_SALES,
        FEATURES.REPORT_DISCOUNT_USAGES,
        FEATURES.REPORT_MEMBERSHIPS,
        FEATURES.BRANCH_MANAGEMENT,
        FEATURES.SETTINGS_BUSINESS,
        FEATURES.SETTINGS_CONTACT,
        FEATURES.SETTINGS_HOURS,
        FEATURES.SETTINGS_TAX,
        FEATURES.SETTINGS_PAYMENTS,
        FEATURES.SETTINGS_NOTIFICATIONS,
        FEATURES.SETTINGS_INVOICE,
        FEATURES.SETTINGS_INVOICE_COMMON,
        FEATURES.SETTINGS_INVOICE_BOOKING,
        FEATURES.SETTINGS_INVOICE_POS,
        FEATURES.SETTINGS_INVOICE_MEMBERSHIP,
        FEATURES.NOTIFICATIONS,
        FEATURES.SUPPORT,
        FEATURES.ISSUE_HISTORY,
        FEATURES.USER_GUIDE,
        FEATURES.MANAGE_ADDONS
    ],
    PERMITTED_ACTIONS: [
        SUB_FEATURES.BOOKING_FILTER,
        SUB_FEATURES.CUSTOMERS_SEARCH,
        SUB_FEATURES.STAFF_VIEW_DETAILS,
        SUB_FEATURES.SCHEDULE_SWITCH_VIEW,
        SUB_FEATURES.SERVICES_SEARCH,
        SUB_FEATURES.POS_SEARCH_ITEMS,
        SUB_FEATURES.PRODUCTS_SEARCH,
        SUB_FEATURES.SALES_HISTORY_FILTER,
        SUB_FEATURES.PAYMENTS_HISTORY_FILTER,
        SUB_FEATURES.REPORT_VIEW_BASIC,
        SUB_FEATURES.NOTIFICATIONS_MARK_READ,
        SUB_FEATURES.SUPPORT_SUBMIT_TICKET
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — WRITE_ACCESS_FEATURES (Locked when subscription is expired)
// ─────────────────────────────────────────────────────────────────────────────
export const WRITE_ACCESS_FEATURES = [
    SUB_FEATURES.DASHBOARD_CREATE_BOOKING,
    SUB_FEATURES.CREATE_BOOKING,
    SUB_FEATURES.UPDATE_BOOKING,
    SUB_FEATURES.CANCEL_BOOKING,
    SUB_FEATURES.DELETE_BOOKING,
    SUB_FEATURES.COLLECT_PAYMENT,
    SUB_FEATURES.BOOKING_REFUND,
    SUB_FEATURES.CREATE_CUSTOMER,
    SUB_FEATURES.UPDATE_CUSTOMER,
    SUB_FEATURES.DELETE_CUSTOMER,
    SUB_FEATURES.CREATE_STAFF,
    SUB_FEATURES.UPDATE_STAFF,
    SUB_FEATURES.DELETE_STAFF,
    SUB_FEATURES.CREATE_STAFF_SCHEDULE,
    SUB_FEATURES.UPDATE_STAFF_SCHEDULE,
    SUB_FEATURES.DELETE_STAFF_SCHEDULE,
    SUB_FEATURES.CREATE_SERVICE,
    SUB_FEATURES.UPDATE_SERVICE,
    SUB_FEATURES.DELETE_SERVICE,
    SUB_FEATURES.CREATE_CATEGORY,
    SUB_FEATURES.CREATE_PACKAGE,
    SUB_FEATURES.UPDATE_PACKAGE,
    SUB_FEATURES.DELETE_PACKAGE,
    SUB_FEATURES.POS_CHECKOUT,
    SUB_FEATURES.POS_DISCOUNT,
    SUB_FEATURES.POS_ISSUE_REFUND,
    SUB_FEATURES.CREATE_PRODUCT,
    SUB_FEATURES.UPDATE_PRODUCT,
    SUB_FEATURES.DELETE_PRODUCT,
    SUB_FEATURES.RECORD_MANUAL_PAYMENT,
    SUB_FEATURES.CREATE_OFFER,
    SUB_FEATURES.UPDATE_OFFER,
    SUB_FEATURES.DELETE_OFFER,
    SUB_FEATURES.CREATE_COUPON,
    SUB_FEATURES.UPDATE_COUPON,
    SUB_FEATURES.DELETE_COUPON,
    SUB_FEATURES.CREATE_MEMBERSHIP,
    SUB_FEATURES.UPDATE_MEMBERSHIP,
    SUB_FEATURES.DELETE_MEMBERSHIP,
    SUB_FEATURES.ASSIGN_MEMBERSHIP,
    SUB_FEATURES.CANCEL_MEMBERSHIP,
    SUB_FEATURES.REFUND_MEMBERSHIP,
    SUB_FEATURES.EXPENSES_CREATE,
    SUB_FEATURES.EXPENSES_UPDATE,
    SUB_FEATURES.EXPENSES_DELETE,
    SUB_FEATURES.USER_CREATE,
    SUB_FEATURES.USER_UPDATE,
    SUB_FEATURES.USER_DELETE,
    SUB_FEATURES.ROLE_CREATE,
    SUB_FEATURES.ROLE_UPDATE,
    SUB_FEATURES.ROLE_DELETE,
    SUB_FEATURES.BRANCH_CREATE,
    SUB_FEATURES.BRANCH_UPDATE,
    SUB_FEATURES.BRANCH_DELETE,
    SUB_FEATURES.SAVE_BUSINESS_SETTINGS,
    SUB_FEATURES.SAVE_HOURS_SETTINGS,
    SUB_FEATURES.SAVE_TAX_SETTINGS,
    SUB_FEATURES.SAVE_PAYMENTS_SETTINGS,
    SUB_FEATURES.SAVE_INVOICE_COMMON
];

const PERMITTED_READ_ACTIONS_SET = new Set(READ_ACCESS_FEATURES.PERMITTED_ACTIONS);

/**
 * Adapter preserving backward compatibility with legacy evaluators.
 */
export function evaluateSubscription(sub) {
    if (!sub) {
        return {
            accessLevel: 'read-only',
            status: 'none',
            planName: 'Free / Expired',
            isExpired: true,
            daysRemaining: 0,
            isExpiringSoon: false,
            canRenew: true
        };
    }
    const isFull = sub.access_level === 'full' || sub.status === 'active' || sub.status === 'trialing';
    return {
        accessLevel: isFull ? 'full' : 'read-only',
        status: (sub.status || 'unknown').toLowerCase(),
        planName: sub.plan_name || 'Standard Plan',
        isExpired: !isFull,
        daysRemaining: sub.days_remaining != null ? sub.days_remaining : 0,
        isExpiringSoon: sub.is_expiring_soon === true,
        canRenew: true
    };
}

/**
 * Master async subscription resolver.
 * Queries backend `get_session_context` RPC and caches evaluated profile.
 *
 * @param {boolean} forceRefresh
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
        } catch (_) {}
    }

    try {
        const { data: sessionCtx, error: ctxErr } = await supabase.rpc('get_session_context');
        if (!ctxErr && sessionCtx?.subscription) {
            const sub = sessionCtx.subscription;
            const isFull = sub.access_level === 'full';
            const profile = {
                accessLevel: isFull ? 'full' : 'read-only',
                status: (sub.status || 'none').toLowerCase(),
                planName: sub.plan_name || 'Standard Plan',
                planId: sessionCtx.company?.plan_id || null,
                localSubscriptionId: null,
                razorpaySubscriptionId: sub.razorpay_subscription_id || null,
                billingCycle: sub.billing_cycle || 'monthly',
                billingAmount: 0,
                autoRenew: sub.auto_renew !== false,
                isTrial: sub.is_trial === true,
                cancelAtCycleEnd: sub.cancel_at_cycle_end === true,
                startDate: null,
                endDate: sub.current_period_end_at || sub.trial_end_at || null,
                trialEndAt: sub.trial_end_at || null,
                cancelledAt: null,
                nextBillingAt: sub.next_billing_at || null,
                daysRemaining: sub.days_remaining != null ? sub.days_remaining : 0,
                isExpiringSoon: sub.is_expiring_soon === true,
                isExpired: !isFull,
                canRenew: true,
                reason: sub.status || 'authoritative_rpc'
            };

            try {
                sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    profile
                }));
            } catch (_) {}

            return profile;
        }
    } catch (err) {
        console.warn('[SubscriptionState] Error querying session context:', err);
    }

    // Fallback using localStorage if RPC fails
    return getSubscriptionAccessSync();
}

/**
 * Synchronous check using current cached profile.
 */
export function getSubscriptionAccessSync() {
    try {
        const rawCache = sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (rawCache) {
            return JSON.parse(rawCache).profile;
        }
        const stateStr = localStorage.getItem('subscriptionState');
        if (stateStr) {
            return JSON.parse(stateStr);
        }
    } catch (_) {}

    return {
        accessLevel: 'full',
        status: 'active',
        isExpired: false,
        daysRemaining: 30
    };
}

/**
 * Checks if a specific granular action is permitted under the subscription state.
 */
export function canWrite(subFeatureKey, optionalProfile = null) {
    const profile = optionalProfile || getSubscriptionAccessSync();
    if (profile.accessLevel === 'full') return true;

    // In read-only mode, only explicitly allowed view/filter actions pass
    return PERMITTED_READ_ACTIONS_SET.has(subFeatureKey);
}

export function canRead(featureKey) {
    return true; // All core navigation pages remain readable
}

export function isSubscriptionExpired() {
    const profile = getSubscriptionAccessSync();
    return profile.isExpired || profile.accessLevel === 'read-only';
}

export function clearSubscriptionCache() {
    try {
        sessionStorage.removeItem(CACHE_STORAGE_KEY);
    } catch (_) {}
}

/**
 * Attaches alert banner if subscription is expired or expiring soon.
 */
export function renderSubscriptionBanner(targetElement) {
    const profile = getSubscriptionAccessSync();
    if (!profile) return;

    const container = typeof targetElement === 'string'
        ? document.getElementById(targetElement)
        : targetElement;

    if (!container) return;

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
