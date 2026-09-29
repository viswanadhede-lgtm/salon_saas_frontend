// billing-api.js — Backend data loaders and subscription orchestrator
// Part of scripts/billing/ modularization of billing-subscription.js
// READ-ONLY with respect to subscriptions, subscription_add_ons, and payments.

'use strict';

import { state, CATALOG_ADDONS, setCatalogAddons, syncCatalogWithActiveAddons, validModes } from './billing-state.js';
import { getCompanyId, formatDateDisplay, getAddonVisualMeta } from './billing-helpers.js';
import {
    renderCurrentPlan,
    renderActiveAddons,
    renderPlanFeatures,
    renderAvailableAddons,
    renderBillingSummary,
    renderBillingInfo,
    renderPaymentHistory
} from './billing-renders.js';

// ── Loading Mutex ──────────────────────────────────────────────
// Preserved exactly as in original — prevents concurrent subscription loads.
let isSubLoading = false;

// Render callbacks set by the orchestrator so api can trigger re-renders
let _renderCallbacks = {};

export function initApi(renderCallbacks) {
    _renderCallbacks = renderCallbacks || {};
}

// ── Company ID Resolution ──────────────────────────────────────

export async function resolveCompanyId() {
    // 1. Direct check in appContext or standard storage keys
    let compId = getCompanyId();
    if (compId) return compId;

    // 2. Auth guard might be completing cold start; poll briefly
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 150));
        compId = getCompanyId();
        if (compId) return compId;
    }

    // 3. Fallback: Lookup company_id via logged in user token
    try {
        const token = localStorage.getItem('token');
        if (token) {
            const { supabase } = await import('../../lib/supabase.js');
            const SUPABASE_URL = supabase._url || 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON = supabase._key || 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';
            const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
            });
            if (userRes.ok) {
                const authUser = await userRes.json().catch(() => null);
                if (authUser?.id) {
                    const { data: uRows } = await supabase
                        .from('users')
                        .select('company_id')
                        .eq('user_id', authUser.id)
                        .limit(1);
                    if (uRows && uRows[0]?.company_id) {
                        compId = uRows[0].company_id;
                        try { localStorage.setItem('company_id', compId); } catch (_) {}
                        return compId;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Billing] Fallback company resolution error:', e);
    }

    return null;
}

// ── Active Add-ons Loader ──────────────────────────────────────

export async function loadActiveAddons(supabase, subscriptionId) {
    if (!subscriptionId) {
        state.activeAddons = [];
        state.activeAddonIds = [];
        state.addonsLoaded = true;
        renderActiveAddons();
        return;
    }

    try {
        // Query subscription_add_ons for current subscription where status = 'active'
        const { data: addOnsData, error: addOnsErr } = await supabase
            .from('subscription_add_ons')
            .select('id, subscription_id, company_id, addon_id, addon_name, price, status, started_at, ended_at')
            .eq('subscription_id', subscriptionId)
            .eq('status', 'active');

        if (addOnsErr) {
            console.error('[Billing] Error fetching active add-ons:', addOnsErr);
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            renderActiveAddons();
            return;
        }

        // Also query add_ons table to resolve master metadata
        const addonIds = [...new Set((addOnsData || []).map(r => r.addon_id).filter(Boolean))];
        let masterMap = {};
        if (addonIds.length > 0) {
            try {
                const { data: masterRows } = await supabase
                    .from('add_ons')
                    .select('addon_id, name, description')
                    .in('addon_id', addonIds);
                (masterRows || []).forEach(m => {
                    masterMap[m.addon_id] = m;
                });
            } catch (_) {}
        }

        const items = (addOnsData || []).map(row => {
            const master = masterMap[row.addon_id] || {};
            const rawName = row.addon_name || master.name || 'Add-on';
            // Capitalize add-on names nicely (e.g. "add-on 1" -> "Add-on 1")
            const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            const visual = getAddonVisualMeta(rawName + ' ' + (master.description || ''));
            return {
                id: row.addon_id,
                subAddonId: row.id,
                name: displayName,
                price: Number(row.price) != null ? Number(row.price) : (Number(master.price) || 0),
                status: row.status || 'active',
                startedAt: row.started_at,
                endedAt: row.ended_at,
                icon: visual.icon,
                theme: visual.theme
            };
        });

        state.activeAddons = items;
        state.activeAddonIds = items.map(item => item.id);
        state.addonsLoaded = true;

        syncCatalogWithActiveAddons();
        renderActiveAddons();
        renderAvailableAddons(_renderCallbacks.openAddAddonModal);
        renderBillingSummary();
    } catch (err) {
        console.error('[Billing] Failed to load active add-ons:', err);
        state.activeAddons = [];
        state.activeAddonIds = [];
        state.addonsLoaded = true;
        syncCatalogWithActiveAddons();
        renderActiveAddons();
        renderBillingSummary();
    }
}

// ── Available Add-ons Catalog Loader ──────────────────────────

export async function loadAvailableAddonsCatalog(supabase) {
    if (!supabase) return;
    try {
        let { data, error } = await supabase
            .from('add_ons')
            .select('*')
            .eq('status', 'active');

        if (error || !data || data.length === 0) {
            const fallbackRes = await supabase
                .from('add_ons')
                .select('*');
            if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
                data = fallbackRes.data;
            }
        }

        if (data && data.length > 0) {
            const dynamicList = data.map(item => {
                const rawName = item.name || 'Add-on';
                const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                const visual = getAddonVisualMeta(rawName + ' ' + (item.description || ''));
                return {
                    id: item.addon_id || item.id,
                    name: displayName,
                    desc: item.description || '',
                    price: Number(item.price) != null ? Number(item.price) : 0,
                    icon: visual.icon,
                    theme: visual.theme
                };
            });

            setCatalogAddons(dynamicList);
        }
        // Always ensure active add-ons remain in the catalog
        syncCatalogWithActiveAddons();
        renderAvailableAddons(_renderCallbacks.openAddAddonModal);
    } catch (err) {
        console.error('[Billing] Failed to load available add-ons catalog:', err);
        syncCatalogWithActiveAddons();
    }
}

// ── Billing Settings Loader ────────────────────────────────────

export async function loadBillingSettings(supabase, companyId) {
    if (!supabase || !companyId) return;
    try {
        const { data, error } = await supabase
            .from('billing_settings')
            .select('tax_name, tax_rate, is_active')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.warn('[Billing] Notice fetching billing_settings:', error.message || error);
            return;
        }

        if (data && data.length > 0) {
            const setting = data[0];
            const rateNum = setting.tax_rate != null ? Number(setting.tax_rate) : 0;
            state.taxSettings = {
                taxName: (setting.tax_name || 'GST').trim(),
                taxRate: (!isNaN(rateNum) && rateNum > 0) ? rateNum : 0,
                isActive: setting.is_active !== false,
                loaded: true
            };
        } else {
            state.taxSettings = {
                taxName: 'GST',
                taxRate: 0,
                isActive: false,
                loaded: true
            };
        }
    } catch (err) {
        console.warn('[Billing] Non-blocking warning in loadBillingSettings:', err);
    }
}

// ── Billing Information Loader ─────────────────────────────────

export async function loadBillingInformation(supabase, companyId) {
    if (!supabase || !companyId) return;
    try {
        const { data, error } = await supabase
            .from('company_billing_information')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.warn('[Billing] Notice fetching company_billing_information:', error.message || error);
            return;
        }

        if (data && data.length > 0) {
            const row = data[0];
            state.billingInfo = {
                id: row.id,
                legalName: row.legal_business_name || '',
                gstin: row.gstin || '',
                pan: row.pan || '',
                email: row.billing_email || '',
                phone: row.billing_phone || '',
                addressLine1: row.address_line_1 || '',
                addressLine2: row.address_line_2 || '',
                city: row.city || '',
                district: row.district || '',
                state: row.state || '',
                pincode: row.pin_code || '',
                country: row.country || 'India',
                loaded: true
            };
            renderBillingInfo();
        }
    } catch (err) {
        console.warn('[Billing] Non-blocking warning in loadBillingInformation:', err);
    }
}

// ── Payment History Loader ─────────────────────────────────────

export async function loadPaymentHistory(supabase, companyId) {
    if (!supabase || !companyId) {
        state.paymentHistory = [];
        renderPaymentHistory(_renderCallbacks.openInvoiceModal);
        return;
    }

    try {
        const { data, error } = await supabase
            .from('payments')
            .select('id, payment_id, invoice_id, order_id, subscription_id, amount, status, payment_method, created_at, plan_id')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[Billing] Error loading payment history from payments table:', error.message || error);
            state.paymentHistory = [];
            renderPaymentHistory(_renderCallbacks.openInvoiceModal);
            return;
        }

        state.paymentHistory = (data || []).map(row => {
            const planTitle = (state.plan && state.plan.name) ? `${state.plan.name} Plan` : 'Subscription';
            const formattedDate = formatDateDisplay(row.created_at);
            const amt = Number(row.amount) || 0;
            const rawMethod = (row.payment_method || 'Razorpay').trim();
            const displayMethod = rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1);
            const rawStatus = (row.status || 'paid').trim();
            const displayStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
            const displayId = row.invoice_id || row.payment_id || row.order_id || `PAY-${row.id}`;

            return {
                id: displayId,
                date: formattedDate,
                rawDate: row.created_at,
                description: planTitle,
                amount: amt,
                method: displayMethod,
                paymentRef: row.payment_id || row.order_id || '—',
                status: displayStatus,
                addons: [],
                items: [
                    {
                        name: `${planTitle} — Subscription Payment`,
                        subtitle: 'Core salon management & features',
                        amount: amt,
                        isPlan: true
                    }
                ]
            };
        });

        renderPaymentHistory(_renderCallbacks.openInvoiceModal);
    } catch (err) {
        console.warn('[Billing] Non-blocking warning in loadPaymentHistory:', err);
        state.paymentHistory = [];
        renderPaymentHistory(_renderCallbacks.openInvoiceModal);
    }
}

// ── Plan Features Loader ───────────────────────────────────────

export async function loadPlanFeatures(supabase, planId) {
    if (!planId) {
        state.features = { included: [], excluded: [], loaded: true };
        renderPlanFeatures();
        return;
    }

    try {
        // Import MODULES_META for existing ordering and human-readable feature labels
        // Dynamic import preserved — must remain lazy
        let modulesMeta = [];
        try {
            const mod = await import('../../config/feature-registry.js');
            if (mod && mod.MODULES_META) modulesMeta = mod.MODULES_META;
        } catch (metaErr) {
            console.warn('[Billing] Could not import feature-registry.js:', metaErr);
        }

        const metaMap = new Map((modulesMeta || []).map((m, idx) => [m.key, { label: m.label, order: idx }]));

        function getFeatureInfo(key) {
            if (metaMap.has(key)) {
                return metaMap.get(key);
            }
            const label = key
                .split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            return { label, order: 999 };
        }

        // 1. Fetch all distinct feature keys across plan_features (master catalog)
        // 2. Fetch feature keys for the current plan_id
        const [allRes, planRes] = await Promise.all([
            supabase.from('plan_features').select('feature_key'),
            supabase.from('plan_features').select('feature_key').eq('plan_id', planId)
        ]);

        if (allRes.error) {
            console.error('[Billing] Error fetching plan_features catalog:', allRes.error);
        }
        if (planRes.error) {
            console.error('[Billing] Error fetching plan-specific features:', planRes.error);
        }

        const allFeatureKeys = [...new Set((allRes.data || []).map(r => r.feature_key).filter(Boolean))];
        const includedKeySet = new Set((planRes.data || []).map(r => r.feature_key).filter(Boolean));

        const includedKeys = allFeatureKeys.filter(k => includedKeySet.has(k));
        const notIncludedKeys = allFeatureKeys.filter(k => !includedKeySet.has(k));

        const sortFeatures = (keys) => {
            return [...keys].sort((a, b) => {
                const orderA = getFeatureInfo(a).order;
                const orderB = getFeatureInfo(b).order;
                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
            });
        };

        state.features = {
            included: sortFeatures(includedKeys).map(k => getFeatureInfo(k).label),
            excluded: sortFeatures(notIncludedKeys).map(k => getFeatureInfo(k).label),
            loaded: true
        };

        renderPlanFeatures();
    } catch (err) {
        console.error('[Billing] Failed to load plan features:', err);
        state.features.loaded = true;
        renderPlanFeatures();
    }
}

// ── Main Subscription Orchestrator ────────────────────────────

export async function loadActiveSubscription() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramState = urlParams.get('state');
    if (paramState && validModes.includes(paramState)) {
        console.log('[Billing] Dev mode override active:', paramState);
        if (paramState === 'noplan') {
            state.features = { included: [], excluded: [], loaded: true };
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            renderPlanFeatures();
            renderActiveAddons();
        }
        return;
    }

    const companyId = await resolveCompanyId();
    if (!companyId) {
        console.warn('[Billing] No active company detected. Showing empty plan state.');
        state.currentMode = 'noplan';
        state.subscriptionId = null;
        state.planId = null;
        state.features = { included: [], excluded: [], loaded: true };
        state.activeAddons = [];
        state.activeAddonIds = [];
        state.addonsLoaded = true;
        try {
            const { supabase } = await import('../../lib/supabase.js');
            await loadAvailableAddonsCatalog(supabase);
        } catch (_) {}
        renderCurrentPlan(_renderCallbacks.handleRenewSubscription);
        renderPlanFeatures();
        renderActiveAddons();
        return;
    }

    try {
        const { supabase } = await import('../../lib/supabase.js');

        // 1. Fetch subscription for current company (prefer active/trial/past_due/cancelled status)
        let { data: subRows, error: subErr } = await supabase
            .from('subscriptions')
            .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
            .eq('company_id', companyId)
            .in('status', ['active', 'trial', 'past_due', 'cancelled'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (subErr) {
            console.error('[Billing] Subscription fetch error:', subErr);
        }

        // Fallback to most recent subscription row for company
        if (!subRows || subRows.length === 0) {
            const { data: recentRows, error: recentErr } = await supabase
                .from('subscriptions')
                .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!recentErr && recentRows && recentRows.length > 0) {
                subRows = recentRows;
            }
        }

        // Secondary Fallback: Lookup by current user_id if company has no subscription
        if (!subRows || subRows.length === 0) {
            try {
                const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                const userId = ctx.user?.user_id || ctx.user?.id;
                if (userId) {
                    const { data: userSubRows } = await supabase
                        .from('subscriptions')
                        .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
                        .eq('user_id', userId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (userSubRows && userSubRows.length > 0) {
                        subRows = userSubRows;
                    }
                }
            } catch (_) {}
        }

        if (!subRows || subRows.length === 0) {
            console.log('[Billing] No subscription record found for company:', companyId);
            state.currentMode = 'noplan';
            state.subscriptionId = null;
            state.planId = null;
            state.features = { included: [], excluded: [], loaded: true };
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            await Promise.all([
                loadAvailableAddonsCatalog(supabase),
                loadBillingSettings(supabase, companyId),
                loadBillingInformation(supabase, companyId),
                loadPaymentHistory(supabase, companyId)
            ]);
            renderCurrentPlan(_renderCallbacks.handleRenewSubscription);
            renderPlanFeatures();
            renderActiveAddons();
            renderBillingSummary();
            renderBillingInfo();
            return;
        }

        const sub = subRows[0];
        state.subscriptionId = sub.subscription_id || null;
        state.planId = sub.plan_id || null;
        let planName = sub.plan_name;

        // 2. Fetch plan_name from plans table if plan_id exists
        if (sub.plan_id) {
            const { data: planData, error: planErr } = await supabase
                .from('plans')
                .select('plan_name')
                .eq('plan_id', sub.plan_id)
                .maybeSingle();

            if (!planErr && planData?.plan_name) {
                planName = planData.plan_name;
            }
        }

        const rawStatus = (sub.status || 'Active').trim().toLowerCase();
        const isAutoRenew = sub.auto_renew !== false;
        const isExpired = rawStatus === 'expired';
        const isScheduledCancellation = (rawStatus === 'active' || rawStatus === 'trial' || rawStatus === 'past_due' || rawStatus === 'cancelled') && !isAutoRenew;

        if (isExpired) {
            state.currentMode = 'noplan';
        } else if (isScheduledCancellation || rawStatus === 'cancelled') {
            state.currentMode = 'cancelled';
        } else {
            state.currentMode = 'active';
        }

        const rawCycle = (sub.billing_cycle || 'monthly').toLowerCase().trim();
        const cycleKey = (rawCycle === 'annual' || rawCycle === 'annually' || rawCycle === 'yearly') ? 'annual' : 'monthly';

        // Clean plan display name (e.g., "advance" -> "Advance")
        const formattedPlanName = planName
            ? planName.charAt(0).toUpperCase() + planName.slice(1)
            : 'Growth';

        state.plan = {
            name: formattedPlanName,
            cycle: cycleKey,
            price: sub.billing_amount != null ? Number(sub.billing_amount) : 0,
            startDate: formatDateDisplay(sub.subscription_start_date),
            validUntil: formatDateDisplay(sub.subscription_end_date),
            nextBillingDate: (!isAutoRenew || isScheduledCancellation || rawStatus === 'cancelled')
                ? 'None'
                : (sub.next_billing_at ? formatDateDisplay(sub.next_billing_at) : 'None'),
            status: isScheduledCancellation ? 'Active' : (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)),
            autoRenew: isAutoRenew
        };

        renderCurrentPlan(_renderCallbacks.handleRenewSubscription);

        // Load features, active add-ons, available add-ons catalog, billing settings,
        // billing information, and payment history in parallel
        await Promise.all([
            loadPlanFeatures(supabase, sub.plan_id),
            loadActiveAddons(supabase, sub.subscription_id),
            loadAvailableAddonsCatalog(supabase),
            loadBillingSettings(supabase, companyId),
            loadBillingInformation(supabase, companyId),
            loadPaymentHistory(supabase, companyId)
        ]);

        renderBillingSummary();
        renderBillingInfo();

        if (window.feather) feather.replace();
    } catch (err) {
        console.error('[Billing] Error loading subscription:', err);
    }
}

// ── Mutex Wrapper ──────────────────────────────────────────────
// Coupled with isSubLoading exactly as in the original.

export async function loadActiveSubscriptionOnce() {
    if (isSubLoading) return;
    isSubLoading = true;
    try {
        await loadActiveSubscription();
    } catch (err) {
        console.error('[Billing] Error in subscription load runner:', err);
    } finally {
        isSubLoading = false;
    }
}
