// scripts/dashboard/dashboard-state.js
// Shared dashboard context and helper utilities.
// Single source of truth for dashboard context resolution.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCompanyId() {
    let companyId = localStorage.getItem('company_id');
    if (!companyId) {
        try {
            const actCtx = JSON.parse(localStorage.getItem('active_company_context') || '{}');
            companyId = actCtx.company?.id || actCtx.company?.company_id || actCtx.id;
        } catch (_) {}
    }
    if (!companyId) {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.company_id || ctx.company?.id;
        } catch (_) {}
    }
    return (companyId && UUID_REGEX.test(companyId)) ? companyId : null;
}

export function getBranchId() {
    const raw = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
    if (!raw || raw === 'all' || raw === 'undefined' || raw === 'null') return null;
    return UUID_REGEX.test(raw) ? raw : null;
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
