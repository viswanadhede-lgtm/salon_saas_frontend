// scripts/products/products-state.js
// Shared state -- single source of truth for products page.
// Do NOT import any other products module here (no circular deps).

export const productsState = {
    products: [],       // liveProductsData
    categories: [],     // liveProductCategoriesData

    // Sorting
    sortField: null,    // currentSortField  -- 'price' | 'stock' | null
    sortDir: 'asc',     // currentSortDirection -- 'asc' | 'desc'

    // Image upload state
    addImageUrl: null,  // currentAddProductImageUrl
    editImageUrl: null  // currentEditProductImageUrl
};

// --- Helpers ---
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

export function getBranchId() {
    const raw = localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;
    if (!raw || raw === 'all' || raw === 'undefined' || raw === 'null') return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(raw) ? raw : null;
}

export function getUserId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.user?.id || ctx.user?.user_id || localStorage.getItem('user_id') || null;
    } catch {
        return localStorage.getItem('user_id') || null;
    }
}

export function getUserName() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.user?.name || (ctx.user?.first_name ? `${ctx.user.first_name} ${ctx.user.last_name || ''}`.trim() : null) || localStorage.getItem('user_name') || null;
    } catch {
        return localStorage.getItem('user_name') || null;
    }
}
