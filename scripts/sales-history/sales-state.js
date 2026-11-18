// scripts/sales-history/sales-state.js

/**
 * Centralized mutable state for Sales History.
 * Shared across all feature modules.
 */

export const salesState = {
    initialSalesData: [],
    currentSalesData: [],
    activeMenuEl: null,
    currentActionData: null, // { action, idx, sale }
    currentRefundItems: []
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const raw = ctx.company?.id || localStorage.getItem('company_id') || null;
        return (raw && UUID_REGEX.test(raw)) ? raw : null;
    } catch {
        const raw = localStorage.getItem('company_id') || null;
        return (raw && UUID_REGEX.test(raw)) ? raw : null;
    }
}

export function getBranchId() {
    const raw = localStorage.getItem('active_branch_id');
    if (!raw || raw === 'all' || raw === 'undefined' || raw === 'null') return null;
    return UUID_REGEX.test(raw) ? raw : null;
}
