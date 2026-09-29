// products.js
// Thin orchestrator for Products module.
// Coordinates state, API, table rendering, modals, and CRUD events.

import { productsState } from './scripts/products/products-state.js';
import {
    fetchProductCategories,
    fetchProducts,
    uploadProductImageToStorage,
    deleteProductImageFromStorage
} from './scripts/products/products-api.js';
import {
    renderProductsTable,
    renderCategoriesTable,
    renderFilterOptions,
    populateCategoryDropdown
} from './scripts/products/products-table.js';
import {
    setupInjectedModals,
    closeAllModals,
    selectStatus,
    selectEditStatus,
    openAddProductModal,
    openAddCategoryModal,
    openCatProductsModal,
    openEditProductModal,
    openEditCategoryModal,
    openImageViewer
} from './scripts/products/products-modals.js';
import { attachGlobalEventListeners } from './scripts/products/products-crud.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
window.showToast = function (msg, isError) {
    const existing = document.getElementById('productsToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'productsToast';
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:28px;right:28px;padding:12px 20px;border-radius:10px;font-size:0.9rem;font-weight:500;z-index:9999;color:#fff;background:${isError ? '#ef4444' : '#10b981'};box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;opacity:1;`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 3000);
};

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-MODULE BRIDGE FOR PRODUCTS-API
// ─────────────────────────────────────────────────────────────────────────────
window._productsRenderProductsTable = renderProductsTable;
window._productsRenderCategoriesTable = renderCategoriesTable;
window._productsRenderFilterOptions = renderFilterOptions;
window._productsPopulateCategoryDropdown = populateCategoryDropdown;

// ─────────────────────────────────────────────────────────────────────────────
// EXPOSE WINDOW APIS (Required by inline HTML onclick & sub-feature gates)
// ─────────────────────────────────────────────────────────────────────────────
window.uploadProductImage = uploadProductImageToStorage;
window.deleteProductImage = deleteProductImageFromStorage;

window.toggleDropdown = function (btn) {
    const dropdown = btn.nextElementSibling;
    const isVisible = dropdown.style.display === 'block';
    document.querySelectorAll('.action-dropdown').forEach(d => d.style.display = 'none');
    if (!isVisible) dropdown.style.display = 'block';
};

window.selectStatus = selectStatus;
window.selectEditStatus = selectEditStatus;
window.openAddProductModal = openAddProductModal;
window.openAddCategoryModal = openAddCategoryModal;
window.openCatProductsModal = openCatProductsModal;
window.openEditProductModal = openEditProductModal;
window.openEditCategoryModal = openEditCategoryModal;
window.openImageViewer = openImageViewer;

// Close dropdowns and filter menu on outside click
document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-menu-btn') && !e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.action-dropdown').forEach(d => d.style.display = 'none');
    }
    const filterMenu = document.getElementById('filterMenu');
    const filterBtn = document.getElementById('filterBtn');
    if (filterMenu && filterBtn) {
        if (filterBtn.contains(e.target)) filterMenu.classList.toggle('show');
        else if (!filterMenu.contains(e.target)) filterMenu.classList.remove('show');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// TABS & FILTER / SORTING CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const primaryActionBtn  = document.getElementById('primaryActionBtn');
    const primaryActionText = document.getElementById('primaryActionText');
    const filterBtn    = document.getElementById('filterBtn');
    const searchInput  = document.getElementById('searchInput');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            tabBtns.forEach(b => {
                b.style.color = '#64748b';
                b.style.borderBottomColor = 'transparent';
                b.style.fontWeight = '500';
                const badge = b.querySelector('span');
                if (badge) { badge.style.background = '#f1f5f9'; badge.style.color = '#64748b'; }
                b.classList.remove('active');
            });
            document.getElementById('tabProducts').style.display   = 'none';
            document.getElementById('tabCategories').style.display = 'none';

            btn.style.color = '#4338ca';
            btn.style.borderBottomColor = '#4338ca';
            btn.style.fontWeight = '600';
            const activeBadge = btn.querySelector('span');
            if (activeBadge) { activeBadge.style.background = '#e0e7ff'; activeBadge.style.color = '#4338ca'; }
            btn.classList.add('active');

            const target = btn.getAttribute('data-target');
            if (target === 'products') {
                document.getElementById('tabProducts').style.display = 'block';
                searchInput.placeholder  = 'Search products...';
                filterBtn.style.display  = 'flex';
                primaryActionText.textContent = 'Add Product';
                primaryActionBtn.setAttribute('data-sub-feature', 'create_product');
                primaryActionBtn.onclick = window.openAddProductModal;
                if (window.applySubFeatureGates) window.applySubFeatureGates();
                fetchProductCategories().then(() => fetchProducts());
            } else {
                document.getElementById('tabCategories').style.display = 'block';
                searchInput.placeholder  = 'Search category...';
                filterBtn.style.display  = 'none';
                primaryActionText.textContent = 'Add Category';
                primaryActionBtn.setAttribute('data-sub-feature', 'create_product_category');
                primaryActionBtn.onclick = window.openAddCategoryModal;
                if (window.applySubFeatureGates) window.applySubFeatureGates();
                fetchProductCategories();
            }
        });
    });

    if (primaryActionBtn) {
        primaryActionBtn.onclick = window.openAddProductModal;
        primaryActionBtn.setAttribute('data-sub-feature', 'create_product');
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const activeTab = document.querySelector('.tab-btn.active');
            if (!activeTab) return;
            const target = activeTab.getAttribute('data-target');
            if (target === 'products') renderProductsTable();
            else renderCategoriesTable();
        });
    }

    // Filter button toggle
    const filterMenu = document.getElementById('filterMenu');
    if (filterBtn && filterMenu) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!filterMenu.contains(e.target) && !filterBtn.contains(e.target)) {
                filterMenu.classList.remove('active');
            }
        });
    }

    const applyFilters = document.getElementById('applyFilters');
    if (applyFilters) {
        applyFilters.addEventListener('click', () => {
            renderProductsTable();
            document.getElementById('filterMenu').classList.remove('active');
        });
    }

    const resetFilters = document.getElementById('resetFilters');
    if (resetFilters) {
        resetFilters.addEventListener('click', () => {
            const allCatRadio = document.querySelector('input[name="filterCategory"][value="all"]');
            if (allCatRadio) allCatRadio.checked = true;
            const allStockRadio = document.querySelector('input[name="filterStock"][value="all"]');
            if (allStockRadio) allStockRadio.checked = true;
            renderProductsTable();
            document.getElementById('filterMenu').classList.remove('active');
        });
    }

    // Sorting handlers
    ['Price', 'Stock'].forEach(field => {
        const th = document.getElementById(`sort${field}`);
        if (th) {
            th.addEventListener('click', () => {
                const f = field.toLowerCase();
                if (productsState.sortField === f) {
                    productsState.sortDir = productsState.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    productsState.sortField = f;
                    productsState.sortDir = 'asc';
                }
                renderProductsTable();
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    setupInjectedModals();
    attachGlobalEventListeners();

    // Initial load
    fetchProductCategories().then(() => {
        fetchProducts();
    });
});
