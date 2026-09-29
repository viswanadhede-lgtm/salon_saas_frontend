// billing-state.js — Shared mutable state for the Billing page
// Part of scripts/billing/ modularization of billing-subscription.js

'use strict';

// ── Catalog Data & Plan Definitions ───────────────────────────
// IMPORTANT: must remain `let` — syncCatalogWithActiveAddons() and
// loadAvailableAddonsCatalog() both mutate this array.
export let CATALOG_ADDONS = [
    {
        id: 'whatsapp',
        name: 'WhatsApp Reminders',
        desc: 'Automated appointment reminders via WhatsApp',
        price: 499,
        icon: 'message-circle',
        theme: 'green'
    },
    {
        id: 'ai_receptionist',
        name: 'AI Receptionist',
        desc: 'AI-powered call handling & booking assistant',
        price: 999,
        icon: 'cpu',
        theme: 'purple'
    },
    {
        id: 'advanced_reports',
        name: 'Advanced Reports',
        desc: 'Deep-dive revenue, staff & service analytics',
        price: 299,
        icon: 'bar-chart-2',
        theme: 'blue'
    },
    {
        id: 'smart_notifications',
        name: 'Smart Notifications',
        desc: 'Push & SMS alerts for bookings and updates',
        price: 199,
        icon: 'bell',
        theme: 'amber'
    }
];

// ── URL-based dev mode resolution ─────────────────────────────
const _urlParams = new URLSearchParams(window.location.search);
const _paramState = _urlParams.get('state');
export const validModes = ['active', 'noplan', 'cancelled'];
const _initialMode = validModes.includes(_paramState) ? _paramState : 'active';

// ── Application State ──────────────────────────────────────────
// Single shared mutable object — every module must import this same reference.
export const state = {
    currentMode: _initialMode,  // 'active' | 'noplan' | 'cancelled'
    subscriptionId: null,
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
        name: 'Growth',
        cycle: 'monthly',
        price: 4999,
        startDate: '10 Sep 2026',
        validUntil: '09 Oct 2026',
        nextBillingDate: '10 Oct 2026',
        status: 'Active',
        autoRenew: true
    },
    activeAddonIds: [],
    paymentMethod: {
        type: 'card',
        cardMask: '•••• •••• •••• 4242',
        holder: 'Admin User',
        expiry: '09 / 2028',
        network: 'VISA / MASTERCARD',
        brand: 'MASTERCARD',
        upiId: 'salonadmin@okhdfcbank',
        upiApp: 'Google Pay',
        bankName: 'HDFC Bank'
    },
    billingInfo: {
        id: null,
        legalName: 'Salon ABC',
        gstin: '37ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        email: 'billing@salonabc.com',
        phone: '+91 98765 43210',
        addressLine1: 'Main Road',
        addressLine2: '',
        city: 'Machilipatnam',
        district: 'Krishna',
        state: 'Andhra Pradesh',
        pincode: '521001',
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
