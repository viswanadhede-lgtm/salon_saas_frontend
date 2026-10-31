// billing-state.js — Shared mutable state for the Billing page
// Part of scripts/billing/ modularization of billing-subscription.js

'use strict';

// ── Catalog Data & Plan Definitions ───────────────────────────
// IMPORTANT: must remain `let` — syncCatalogWithActiveAddons() and
// loadAvailableAddonsCatalog() both mutate this array.
export let CATALOG_ADDONS = [];

// ── URL-based dev mode resolution ─────────────────────────────
const _urlParams = new URLSearchParams(window.location.search);
const _paramState = _urlParams.get('state');
export const validModes = ['active', 'noplan', 'cancelled'];
const _initialMode = validModes.includes(_paramState) ? _paramState : 'active';

// ── Application State ──────────────────────────────────────────
// Single shared mutable object — every module must import this same reference.
export const state = {
    currentMode: _initialMode,  // 'active' | 'noplan' | 'cancelled'

    // ── Subscription identifiers ───────────────────────────────
    // Keep these TWO distinct fields — they are different things:
    //   localSubscriptionId  = subscriptions.id (UUID primary key in Supabase)
    //   razorpaySubscriptionId = subscriptions.razorpay_subscription_id (text, "sub_...")
    // The cancel-subscription edge function accepts either but we send the UUID.
    // The legacy `subscriptionId` alias is retained so existing render code still works.
    localSubscriptionId: null,      // subscriptions.id UUID
    razorpaySubscriptionId: null,   // subscriptions.razorpay_subscription_id text
    subscriptionId: null,           // alias → kept for backward compat with render modules
    activeAddons: [],
    addonsLoaded: false,
    planId: null,
    taxSettings: {
        taxName: 'GST',
        taxRate: 0,
        isActive: false,
        loaded: false
    },
    features: {
        included: [],
        excluded: [],
        loaded: false
    },
    plan: {
        name: '',
        cycle: 'monthly',
        price: 0,
        startDate: '—',
        validUntil: '—',
        nextBillingDate: '—',
        status: '',
        autoRenew: true,
        // ── New fields from updated subscriptions schema ──────
        isTrial: false,                  // subscriptions.is_trial
        trialEndAt: null,                // subscriptions.trial_end_at (ISO string)
        cancelAtCycleEnd: false,         // subscriptions.cancel_at_cycle_end
        cancellationRequestedAt: null    // subscriptions.cancellation_requested_at
    },
    activeAddonIds: [],
    paymentMethod: {
        type: '',
        cardMask: '',
        holder: '',
        expiry: '',
        network: '',
        brand: '',
        upiId: '',
        upiApp: '',
        bankName: '',
        paymentRef: '',
        lastPaidDate: '',
        methodName: ''
    },
    billingInfo: {
        id: null,
        legalName: '',
        gstin: '',
        pan: '',
        email: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        district: '',
        state: '',
        pincode: '',
        country: 'India',
        loaded: false
    },
    paymentHistory: [],
    pendingAddonId: null
};

// ── Catalog Helpers ────────────────────────────────────────────

export function getAddonById(id) {
    if (!id) return null;
    const fromActive = (state.activeAddons || []).find(a => a.id === id);
    if (fromActive) return fromActive;
    return CATALOG_ADDONS.find(a => a.id === id) || null;
}

export function syncCatalogWithActiveAddons() {
    if (!state.activeAddons || state.activeAddons.length === 0) return;
    state.activeAddons.forEach(activeItem => {
        if (!activeItem || !activeItem.id) return;
        const existing = CATALOG_ADDONS.find(a => a.id === activeItem.id);
        if (existing) {
            if (activeItem.name) existing.name = activeItem.name;
            if (activeItem.price != null) existing.price = activeItem.price;
            if (activeItem.icon) existing.icon = activeItem.icon;
            if (activeItem.theme) existing.theme = activeItem.theme;
        } else {
            CATALOG_ADDONS.unshift({
                id: activeItem.id,
                name: activeItem.name,
                desc: activeItem.description || '',
                price: Number(activeItem.price) || 0,
                icon: activeItem.icon || 'package',
                theme: activeItem.theme || 'blue'
            });
        }
    });
}

// Allow external reassignment of CATALOG_ADDONS contents (loadAvailableAddonsCatalog)
// Mutates the existing array in-place so all imported references stay valid.
export function setCatalogAddons(newList) {
    CATALOG_ADDONS.length = 0;
    newList.forEach(item => CATALOG_ADDONS.push(item));
}
