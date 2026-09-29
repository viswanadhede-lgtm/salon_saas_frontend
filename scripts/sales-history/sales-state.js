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

export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        return localStorage.getItem('company_id') || null;
    }
}

export function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}
