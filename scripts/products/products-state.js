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
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

export function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}
