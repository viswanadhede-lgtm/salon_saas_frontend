// billing-helpers.js — Pure & DOM utility helpers for the Billing page
// Part of scripts/billing/ modularization of billing-subscription.js

'use strict';

// ── Formatters ─────────────────────────────────────────────────

export const fmtCurrency = (n) => {
    if (n == null || isNaN(n)) return '—';
    return '₹' + Number(n).toLocaleString('en-IN');
};

export const formatDateDisplay = (val) => {
    if (!val) return '—';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return val;
    }
};

// ── Identity / Auth Helpers ────────────────────────────────────

export const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (_) {}
    return localStorage.getItem('company_id') ||
           localStorage.getItem('current_company_id') ||
           localStorage.getItem('tenant_id') ||
           null;
};

// ── Toast Notification ─────────────────────────────────────────

export const showToast = (msg) => {
    const toast = document.getElementById('billingToast');
    const toastMsg = document.getElementById('billingToastMsg');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 3200);
};

// ── Add-on Visual Meta ─────────────────────────────────────────

export function getAddonVisualMeta(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('whatsapp') || lower.includes('chat')) {
        return { icon: 'message-circle', theme: 'green' };
    }
    if (lower.includes('ai') || lower.includes('receptionist') || lower.includes('call') || lower.includes('voice')) {
        return { icon: 'cpu', theme: 'purple' };
    }
    if (lower.includes('report') || lower.includes('analytic')) {
        return { icon: 'bar-chart-2', theme: 'blue' };
    }
    if (lower.includes('notification') || lower.includes('reminder') || lower.includes('alert') || lower.includes('sms')) {
        return { icon: 'bell', theme: 'amber' };
    }
    return { icon: 'package', theme: 'blue' };
}

// ── Billing Address Formatter ──────────────────────────────────

export function formatBillingAddress(info) {
    const parts = [];
    if (info.addressLine1) parts.push(info.addressLine1);
    if (info.addressLine2) parts.push(info.addressLine2);
    if (info.city) parts.push(info.city);
    if (info.district) parts.push(info.district);
    let statePin = '';
    if (info.state) statePin = info.state;
    if (info.pincode) statePin += ` - ${info.pincode}`;
    if (statePin) parts.push(statePin);
    if (info.country) parts.push(info.country);
    return parts.join(', ');
}

// ── Card Brand Detection ───────────────────────────────────────

export function detectCardBrand(num) {
    const clean = (num || '').replace(/\D/g, '');
    if (/^4/.test(clean)) return 'VISA';
    if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(clean)) return 'MASTERCARD';
    if (/^(60|65|81|82|508)/.test(clean)) return 'RUPAY';
    if (/^3[47]/.test(clean)) return 'AMEX';
    return 'CARD';
}
