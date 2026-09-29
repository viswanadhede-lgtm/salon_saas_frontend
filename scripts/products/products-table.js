// scripts/products/products-table.js
// Rendering: stockBadge, statusBadge, renderProductsTable,
// renderCategoriesTable, renderFilterOptions, populateCategoryDropdown.
// Preserved exactly from original products.js.

import { productsState } from './products-state.js';

// ─────────────────────────────────────────────────────────────────────────────
// BADGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function stockBadge(stock) {
    const s = Number(stock) || 0;
    if (s === 0)   return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#fee2e2;color:#ef4444;">Out of Stock</span>`;
    if (s <= 5)    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#ffedd5;color:#f97316;">Low (${s})</span>`;
    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#d1fae5;color:#10b981;">In Stock (${s})</span>`;
}

export function statusBadge(statusStr) {
    const active = (statusStr || '').toLowerCase() === 'active';
    const bg = active ? '#f0fdf4' : '#f1f5f9';
    const color = active ? '#16a34a' : '#64748b';
    const border = active ? '#bbf7d0' : '#e2e8f0';
    const displayStatus = active ? 'Active' : 'Inactive';
    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:500;background:${bg};color:${color};border:1px solid ${border};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle;"></span>
            ${displayStatus}</span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: Products Table
// ─────────────────────────────────────────────────────────────────────────────

export function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = productsState.products;

    const searchInput = document.getElementById('searchInput');
    const searchStr = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (searchStr) {
        filtered = filtered.filter(p => (p.product_name || '').toLowerCase().includes(searchStr) || (p.category_name || '').toLowerCase().includes(searchStr));
    }

    const selectedCategory = document.querySelector('input[name="filterCategory"]:checked');
    if (selectedCategory && selectedCategory.value !== 'all') {
        filtered = filtered.filter(p => p.category_name === selectedCategory.value);
    }

    // Stock filter
    const selectedStock = document.querySelector('input[name="filterStock"]:checked');
    if (selectedStock && selectedStock.value !== 'all') {
        filtered = filtered.filter(p => {
            const qty = Number(p.stock_quantity) || 0;
            if (selectedStock.value === 'in_stock')     return qty > 5;
            if (selectedStock.value === 'low_stock')    return qty >= 1 && qty <= 5;
            if (selectedStock.value === 'out_of_stock') return qty === 0;
            return true;
        });
    }

    // Apply Sorting
    if (productsState.sortField) {
        filtered.sort((a, b) => {
            let valA = 0, valB = 0;
            if (productsState.sortField === 'price') {
                valA = Number(a.price) || 0;
                valB = Number(b.price) || 0;
            } else if (productsState.sortField === 'stock') {
                valA = Number(a.stock_quantity) || 0;
                valB = Number(b.stock_quantity) || 0;
            }
            if (valA < valB) return productsState.sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return productsState.sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Update Sorting UI Arrows
    ['Price', 'Stock'].forEach(field => {
        const up = document.getElementById(`sort${field}Up`);
        const down = document.getElementById(`sort${field}Down`);
        if (up && down) {
            up.style.color = (productsState.sortField === field.toLowerCase() && productsState.sortDir === 'asc') ? '#3b82f6' : '#cbd5e1';
            down.style.color = (productsState.sortField === field.toLowerCase() && productsState.sortDir === 'desc') ? '#3b82f6' : '#cbd5e1';
        }
    });

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.innerHTML = `
            <td style="padding:14px 16px 14px 24px;"><p style="font-weight:500;color:#1e293b;margin:0;font-size:0.9rem;">${p.product_name || '-'}</p></td>
            <td style="padding:14px 16px;"><span style="background:#f1f5f9;padding:3px 8px;border-radius:6px;font-size:0.8rem;color:#475569;">${p.category_name || 'Uncategorized'}</span></td>
            <td style="padding:14px 16px;color:#374151;font-weight:500;font-size:0.9rem;">&#8377;${p.price || 0}</td>
            <td style="padding:14px 16px;">${stockBadge(p.stock_quantity || 0)}</td>
            <td style="padding:14px 4px 14px 16px; text-align:center;">
                ${p.product_image_url || p.image_url || p.photo_url
                    ? `<img src="${p.product_image_url || p.image_url || p.photo_url}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1; padding:2px; background:#ffffff; cursor:pointer; margin: 0 auto; display: block;" alt="${p.product_name}" onclick="window.openImageViewer('${p.product_image_url || p.image_url || p.photo_url}')">`
                    : `<div style="width:40px; height:40px; border-radius:8px; background:#f8fafc; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; color:#94a3b8; margin: 0 auto;"><i data-feather="image" style="width:18px; height:18px;"></i></div>`}
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:center; gap:0.5rem;">
                    <button class="hover-lift" data-sub-feature="update_product" onclick="window.openEditProductModal('${p.product_id || p.id}')" title="Edit Product" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" data-sub-feature="delete_product" onclick="window.triggerDeleteProduct('${p.product_id || p.id}', '${(p.product_name || '').replace(/'/g, "\\'")}')" title="Delete Product" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: Filter Options
// ─────────────────────────────────────────────────────────────────────────────

export function renderFilterOptions() {
    const filterContainer = document.getElementById('categoryFilterOptions');
    if (!filterContainer) return;

    let html = `<label class="filter-option">
               <input type="radio" name="filterCategory" value="all" checked>
               <span>All Categories</span>
               </label>`;

    productsState.categories.forEach(cat => {
        html += `<label class="filter-option">
                <input type="radio" name="filterCategory" value="${cat.category_name}">
                <span>${cat.category_name}</span>
                </label>`;
    });

    filterContainer.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: Categories Table
// ─────────────────────────────────────────────────────────────────────────────

export function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = productsState.categories;
    const searchInput = document.getElementById('searchInput');
    const searchStr = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (searchStr) {
        filtered = filtered.filter(c => (c.category_name || '').toLowerCase().includes(searchStr));
    }

    filtered.forEach(c => {
        const tr = document.createElement('tr');
        const pCount = productsState.products.filter(p => p.category_name === c.category_name).length;
        const char = (c.category_name || '?').charAt(0).toUpperCase();
        tr.className = 'tb-row';
        tr.innerHTML = `
            <td style="padding:14px 16px 14px 24px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:36px;height:36px;border-radius:8px;background:#e0e7ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">${char}</div>
                    <div><p style="font-weight:600;color:#1e293b;margin:0;font-size:0.9rem;">${c.category_name || '-'}</p></div>
                </div>
            </td>
            <td style="padding:14px 16px; text-align:left;">
                <span class="customer-link" onclick="window.openCatProductsModal('${(c.category_name || '').replace(/'/g, "\\'")}')" style="cursor:pointer;">
                    ${pCount} ${pCount === 1 ? 'product' : 'products'}
                </span>
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" data-sub-feature="update_product_category" onclick="window.openEditCategoryModal('${c.category_id || c.id}')" title="Edit Category" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="flex-shrink-0 hover-lift" data-sub-feature="delete_product_category" ${pCount > 0 ? 'disabled' : ''} onclick="${pCount > 0 ? '' : `window.triggerDeleteCategory('${c.category_id || c.id}', '${(c.category_name || '').replace(/'/g, "\\'")}')`}" title="${pCount > 0 ? 'Cannot delete: products exist under this category' : 'Delete Category'}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:${pCount > 0 ? 'not-allowed' : 'pointer'}; color:#ef4444; transition:all 0.2s; min-width: 52px; opacity: ${pCount > 0 ? '0.45' : '1'};">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

// ─────────────────────────────────────────────────────────────────────────────
// POPULATE: Category Dropdown
// ─────────────────────────────────────────────────────────────────────────────

export function populateCategoryDropdown(dropdownId) {
    const sel = document.getElementById(dropdownId);
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    productsState.categories
        .forEach(c => {
            const o = document.createElement('option');
            o.value = c.category_name;
            o.textContent = c.category_name;
            sel.appendChild(o);
        });
}
