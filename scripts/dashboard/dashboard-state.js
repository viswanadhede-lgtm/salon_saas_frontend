// scripts/dashboard/dashboard-state.js
// Shared dashboard context and helper utilities.
// Single source of truth for dashboard context resolution.

export function getCompanyId() {
    let companyId = localStorage.getItem('company_id');
    if (!companyId) {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.company_id || ctx.company?.id;
        } catch (_) {}
    }
    return companyId || null;
}

export function getBranchId() {
    return localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id') || null;
}

export function getSelectedPlan() {
    return localStorage.getItem('selected_plan') || 'Growth';
}

export function updateHeaderBadges(planName) {
    const badge = document.getElementById('headerPlanBadge');
    const plan = planName || getSelectedPlan();
    if (badge && plan) {
        badge.textContent = plan;
    }
}
