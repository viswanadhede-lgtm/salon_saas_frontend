import { supabase } from './lib/supabase.js';

let liveProductsData = [];
let liveProductCategoriesData = [];

// --- Image Upload State & Helper ---
let currentAddProductImageUrl = null;
let currentEditProductImageUrl = null;

window.uploadProductImage = async function(file) {
    if (!file) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const randomString = Math.random().toString(36).substring(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '').toLowerCase();
    const filename = `${timestamp}-${randomString}-${safeName}`;
    
    try {
        const url = `${supabase._url}/storage/v1/object/product-images/${filename}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': supabase._key,
                'Authorization': `Bearer ${supabase._key}`,
                'Content-Type': file.type || 'application/octet-stream'
            },
            body: file
        });
        
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
        
        return `${supabase._url}/storage/v1/object/public/product-images/${filename}`;
    } catch (err) {
        console.error('Image upload failed:', err);
        window.showToast('Failed to upload image', true);
        return null;
    }
};

document.addEventListener('change', async function(e) {
    if (e.target.id === 'productPhotoInput') {
        const file = e.target.files[0];
        if (file) {
            e.target.disabled = true;
            const lbl = document.querySelector('label[for="productPhotoInput"]');
            if (lbl) lbl.innerHTML = 'Uploading...';
            const url = await window.uploadProductImage(file);
            e.target.disabled = false;
            if (lbl) {
                lbl.innerHTML = '<i data-feather="upload" style="width: 14px; height: 14px;"></i> Upload Photo';
                if (window.feather) feather.replace();
            }
            if (url) {
                currentAddProductImageUrl = url;
                const wrap = document.querySelector('#addProductModal .product-photo-wrap');
                if (wrap) wrap.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
                const removeBtn = document.getElementById('removeAddProductPhotoBtn');
                if (removeBtn) { removeBtn.style.display = 'flex'; if (window.feather) feather.replace(); }
            }
        }
    } else if (e.target.id === 'editProductPhotoInput') {
        const file = e.target.files[0];
        if (file) {
            e.target.disabled = true;
            const lbl = document.querySelector('label[for="editProductPhotoInput"]');
            if (lbl) lbl.innerHTML = 'Uploading...';
            const url = await window.uploadProductImage(file);
            e.target.disabled = false;
            if (lbl) {
                lbl.innerHTML = '<i data-feather="upload" style="width: 14px; height: 14px;"></i> Upload Photo';
                if (window.feather) feather.replace();
            }
            if (url) {
                currentEditProductImageUrl = url;
                const wrap = document.querySelector('#editProductModal .product-photo-wrap');
                if (wrap) wrap.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
                const removeBtn = document.getElementById('removeEditProductPhotoBtn');
                if (removeBtn) { removeBtn.style.display = 'flex'; if (window.feather) feather.replace(); }
            }
        }
    }
});


// --- Helpers ---
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    setupInjectedModals();
    attachGlobalEventListeners();

    // Load data
    fetchProductCategories().then(() => {
        fetchProducts();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Fetch Product Categories
// ─────────────────────────────────────────────────────────────────────────────
async function fetchProductCategories() {
    try {
        const { data, error } = await supabase
            .from('product_categories')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;

        liveProductCategoriesData = (data || []).filter(c =>
            (c.status || '').toLowerCase() !== 'deleted'
        );

        populateCategoryDropdown('productCategory');
        populateCategoryDropdown('editProductCategory');
        renderFilterOptions();
        renderCategoriesTable();

        const tabEl = document.getElementById('categoriesCountBadge');
        if (tabEl) tabEl.textContent = liveProductCategoriesData.length;
    } catch (err) {
        console.error('Error fetching product categories:', err);
        showToast('Could not load categories: ' + (err.message || ''), true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Fetch Products
// ─────────────────────────────────────────────────────────────────────────────
async function fetchProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;

        liveProductsData = (data || []).filter(p =>
            (p.status || '').toLowerCase() !== 'deleted'
        );

        renderProductsTable();
        const tabEl = document.getElementById('productsCountBadge');
        if (tabEl) tabEl.textContent = liveProductsData.length;
    } catch (err) {
        console.error('Error fetching products:', err);
        showToast('Could not load products: ' + (err.message || ''), true);
    }
}

function populateCategoryDropdown(dropdownId) {
    const sel = document.getElementById(dropdownId);
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    liveProductCategoriesData
        .filter(c => (c.status || '').toLowerCase() === 'active')
        .forEach(c => {
            const o = document.createElement('option');
            o.value = c.category_name;
            o.textContent = c.category_name;
            sel.appendChild(o);
        });
}

// --- Tabs & Layout ---
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
                if(window.applySubFeatureGates) window.applySubFeatureGates();
                fetchProductCategories().then(() => fetchProducts());
            } else {
                document.getElementById('tabCategories').style.display = 'block';
                searchInput.placeholder  = 'Search category...';
                filterBtn.style.display  = 'none';
                primaryActionText.textContent = 'Add Category';
                primaryActionBtn.setAttribute('data-sub-feature', 'create_product_category');
                primaryActionBtn.onclick = window.openAddCategoryModal;
                if(window.applySubFeatureGates) window.applySubFeatureGates();
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

    const applyFilters = document.getElementById('applyFilters');
    if (applyFilters) {
        applyFilters.addEventListener('click', () => {
            renderProductsTable();
            document.getElementById('filterMenu').classList.remove('show');
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
            document.getElementById('filterMenu').classList.remove('show');
        });
    }
}

// --- Render Logic ---
function stockBadge(stock) {
    const s = Number(stock) || 0;
    if (s === 0)   return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#fee2e2;color:#ef4444;">Out of Stock</span>`;
    if (s <= 5)    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#ffedd5;color:#f97316;">Low (${s})</span>`;
    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#d1fae5;color:#10b981;">In Stock (${s})</span>`;
}

function statusBadge(statusStr) {
    const active = (statusStr || '').toLowerCase() === 'active';
    const bg = active ? '#f0fdf4' : '#f1f5f9';
    const color = active ? '#16a34a' : '#64748b';
    const border = active ? '#bbf7d0' : '#e2e8f0';
    const displayStatus = active ? 'Active' : 'Inactive';
    return `<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:500;background:${bg};color:${color};border:1px solid ${border};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle;"></span>
            ${displayStatus}</span>`;
}

function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = liveProductsData;
    
    const searchInput = document.getElementById('searchInput');
    const searchStr = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (searchStr) {
        filtered = filtered.filter(p => (p.product_name || '').toLowerCase().includes(searchStr) || (p.category_name || '').toLowerCase().includes(searchStr));
    }
    
    const selectedCategory = document.querySelector('input[name="filterCategory"]:checked');
    if (selectedCategory && selectedCategory.value !== 'all') {
        filtered = filtered.filter(p => p.category_name === selectedCategory.value);
    }

    const selectedStock = document.querySelector('input[name="filterStock"]:checked');
    if (selectedStock && selectedStock.value !== 'all') {
        filtered = filtered.filter(p => {
            const qty = Number(p.stock_quantity) || 0;
            if (selectedStock.value === 'in_stock')    return qty > 5;
            if (selectedStock.value === 'low_stock')   return qty >= 1 && qty <= 5;
            if (selectedStock.value === 'out_of_stock') return qty === 0;
            return true;
        });
    }

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
                    ? `<img src="${p.product_image_url || p.image_url || p.photo_url}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1; padding:2px; background:#ffffff; cursor:pointer;" alt="${p.product_name}" onclick="window.openImageViewer('${p.product_image_url || p.image_url || p.photo_url}')">` 
                    : `<div style="width:40px; height:40px; border-radius:8px; background:#f8fafc; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-feather="image" style="width:18px; height:18px;"></i></div>`}
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

function renderFilterOptions() {
    const filterContainer = document.getElementById('categoryFilterOptions');
    if (!filterContainer) return;

    let html = `<label class="filter-option">
               <input type="radio" name="filterCategory" value="all" checked>
               <span>All Categories</span>
               </label>`;

    liveProductCategoriesData.forEach(cat => {
        html += `<label class="filter-option">
                <input type="radio" name="filterCategory" value="${cat.category_name}">
                <span>${cat.category_name}</span>
                </label>`;
    });

    filterContainer.innerHTML = html;
}

function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = liveProductCategoriesData;
    const searchInput = document.getElementById('searchInput');
    const searchStr = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (searchStr) {
        filtered = filtered.filter(c => (c.category_name || '').toLowerCase().includes(searchStr));
    }

    filtered.forEach(c => {
        const tr = document.createElement('tr');
        const pCount = liveProductsData.filter(p => p.category_name === c.category_name).length;
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
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

window.toggleDropdown = function (btn) {
    const dropdown = btn.nextElementSibling;
    const isVisible = dropdown.style.display === 'block';
    document.querySelectorAll('.action-dropdown').forEach(d => d.style.display = 'none');
    if (!isVisible) dropdown.style.display = 'block';
};

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

// --- Modal Injections ---
function setupInjectedModals() {
    // Delete Overlay
    if (!document.getElementById('deleteConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="deleteConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="trash-2" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 id="deleteConfirmTitle" style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete?</h2>
                <p id="deleteConfirmText" style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to delete this?</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDelete" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer;">Cancel</button>
                    <button id="btnConfirmDelete" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer;">Yes, Delete</button>
                </div>
            </div>
        </div>`);
    }

    // Edit Product Modal
    if (!document.getElementById('editProductModalOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="editProductModalOverlay">
            <div class="modal-container" id="editProductModal" style="width: 760px; max-width: 95%;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Product</h2>
                        <p class="subtitle">Update product details</p>
                    </div>
                    <button class="modal-close" id="closeEditProductModal"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 0; overflow-y: auto; max-height: 65vh;">
                    <div style="display: grid; grid-template-columns: 35% 65%; width: 100%;">
                        <div style="display: flex; flex-direction: column; align-items: center; padding: 2rem; border-right: 1px solid #f1f5f9; background: #fafafa;">
                            <div class="product-photo-wrap" style="width: 140px; height: 140px; margin-bottom: 20px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8; overflow: hidden;">
                                <i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                            </div>
                            <div style="display:flex; gap:8px; margin-bottom: 12px; justify-content:center; flex-direction:column; width:100%;">
                                <label for="editProductPhotoInput" class="change-photo-btn" style="padding: 8px 16px; font-size: 0.85rem; border-radius: 8px; cursor: pointer; color: #4f46e5; background: #e0e7ff; display: flex; align-items: center; gap: 8px; font-weight: 500; justify-content:center; width:100%;">
                                    <i data-feather="upload" style="width: 14px; height: 14px;"></i> Upload Photo
                                </label>
                                <button type="button" id="removeEditProductPhotoBtn" style="padding: 8px 16px; font-size: 0.85rem; border-radius: 8px; border:1px solid #fee2e2; background:#fef2f2; color:#ef4444; font-weight:500; display:none; align-items:center; justify-content:center; gap:6px; cursor:pointer; width:100%;">
                                    <i data-feather="trash-2" style="width: 14px; height: 14px;"></i> Remove Photo
                                </button>
                            </div>
                            <input type="file" id="editProductPhotoInput" accept="image/*" style="display:none;">
                            <p style="font-size: 0.75rem; color: #64748b; text-align: center; line-height: 1.4;">Recommended: Square image,<br>at least 500x500px, PNG or JPG</p>
                        </div>
                        <div style="padding: 2rem;">
                            <input type="hidden" id="editProductId">
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label class="form-label" for="editProductName">Product Name <span class="text-rose">*</span></label>
                                <input type="text" id="editProductName" class="form-input" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label class="form-label" for="editProductCategory">Category <span class="text-rose">*</span></label>
                                <select id="editProductCategory" class="form-select" required>
                                    <option value="" disabled selected>Select a category</option>
                                </select>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom: 20px;">
                                <div class="form-group">
                                    <label class="form-label" for="editProductPrice">Price (&#8377;) <span class="text-rose">*</span></label>
                                    <input type="number" id="editProductPrice" class="form-input" required>
                                </div>
                                <div class="form-group">
                                    <label class="form-label" for="editProductStock">Stock Quantity <span class="text-rose">*</span></label>
                                    <input type="number" id="editProductStock" class="form-input" required>
                                </div>
                            </div>

                            <div class="form-group" style="margin-bottom:0;">
                                <label class="form-label" for="editProductDescription">Description</label>
                                <textarea id="editProductDescription" class="form-input form-textarea" style="min-height:80px;"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="border-top: 1px solid #f1f5f9; padding: 16px 2rem; display: flex; justify-content: flex-end; gap: 12px;">
                    <button type="button" class="btn btn-secondary" id="cancelEditProduct" style="padding: 8px 16px;">Cancel</button>
                    <button type="button" class="btn btn-primary" id="updateProductBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;padding: 8px 16px;width: auto; flex: 0 0 auto; max-width: max-content;">Update Product</button>
                </div>
            </div>
        </div>`);
    }

    // Edit Category Modal
    if (!document.getElementById('editCategoryModalOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="editCategoryModalOverlay">
            <div class="modal-container" id="editCategoryModal" style="width: 420px; max-width: 95%;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Product Category</h2>
                        <p class="subtitle">Update product category</p>
                    </div>
                    <button class="modal-close" id="closeEditCategoryModal"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; max-height: 65vh; flex-direction: column;">
                    <input type="hidden" id="editCategoryId">
                    <div class="form-group">
                        <label class="form-label" for="editCategoryName">Category Name <span class="text-rose">*</span></label>
                        <input type="text" id="editCategoryName" class="form-input" placeholder="e.g. Hair Care">
                    </div>
                </div>
                <div class="modal-footer" style="border-top: 1px solid #f1f5f9; padding: 16px 2rem; display: flex; justify-content: flex-end; gap: 12px;">
                    <button type="button" class="btn btn-secondary" id="cancelEditCategory" style="padding: 8px 16px;">Cancel</button>
                    <button type="button" class="btn btn-primary" id="updateCategoryBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;padding: 8px 16px;width: auto; flex: 0 0 auto; max-width: max-content;">
                        <i data-feather="save" style="width:15px;height:15px;"></i> Update Category
                    </button>
                </div>
            </div>
        </div>`);
    }
}

// --- Status Style Toggles ---
window.selectStatus = function (val) {
    const act = document.getElementById('statusActiveBtn');
    const inact = document.getElementById('statusInactiveBtn');
    if (act && inact) {
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('statusActive'); if (el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('statusInactive'); if (el) el.checked = true;
        }
    }
};

window.selectCatStatus = function (val) {
    const act = document.getElementById('catStatusActiveBtn');
    const inact = document.getElementById('catStatusInactiveBtn');
    const activeRadio = document.querySelector('input[name="categoryStatus"][value="Active"]');
    const inactiveRadio = document.querySelector('input[name="categoryStatus"][value="Inactive"]');
    if (act && inact) {
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            if (activeRadio) activeRadio.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            if (inactiveRadio) inactiveRadio.checked = true;
        }
    }
};

window.selectEditStatus = function (val) {
    const act = document.getElementById('editPStatusActiveBtn');
    const inact = document.getElementById('editPStatusInactiveBtn');
    if (act && inact) {
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('editPStatusActive'); if (el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('editPStatusInactive'); if (el) el.checked = true;
        }
    }
};

window.selectEditCatStatus = function (val) {
    const act = document.getElementById('editCStatusActiveBtn');
    const inact = document.getElementById('editCStatusInactiveBtn');
    if (act && inact) {
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('editCStatusActive'); if (el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('editCStatusInactive'); if (el) el.checked = true;
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: All CRUD Event Listeners
// ─────────────────────────────────────────────────────────────────────────────
function attachGlobalEventListeners() {
    ['addProductModalOverlay', 'addCategoryModalOverlay', 'editProductModalOverlay', 'editCategoryModalOverlay'].forEach(oid => {
        const overlay = document.getElementById(oid);
        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAllModals(); });
    });

    ['closeAddProductModal','cancelAddProduct','closeAddCategoryModal','cancelAddCategory',
     'closeEditProductModal','cancelEditProduct','closeEditCategoryModal','cancelEditCategory'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', closeAllModals);
    });

    // ── CREATE CATEGORY ───────────────────────────────────────────────────────
    const saveCatBtn = document.getElementById('saveCategoryBtn');
    if (saveCatBtn) {
        saveCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('categoryName').value.trim();
            if (!name) return showToast('Please enter category name', true);

            // Duplicate check (case-insensitive)
            const isDuplicate = liveProductCategoriesData.some(
                c => c.category_name.trim().toLowerCase() === name.toLowerCase()
            );
            if (isDuplicate) return showToast(`A category named "${name}" already exists.`, true);

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                category_name: name,
                status: 'Active'
            };
            
            saveCatBtn.disabled = true;
            saveCatBtn.textContent = 'Saving...';
            try {
                const { error } = await supabase.from('product_categories').insert(payload);
                if (error) throw error;

                showToast('Category created successfully');
                closeAllModals();
                document.getElementById('categoryName').value = '';
                document.getElementById('categoryDescription').value = '';
                fetchProductCategories();
            } catch (err) {
                showToast(err.message || 'Failed to create category', true);
            } finally {
                saveCatBtn.disabled = false;
                saveCatBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Category';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── UPDATE CATEGORY ───────────────────────────────────────────────────────
    const updateCatBtn = document.getElementById('updateCategoryBtn');
    if (updateCatBtn) {
        updateCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('editCategoryName').value.trim();
            if (!name) return showToast('Please enter category name', true);

            const catId = document.getElementById('editCategoryId').value;

            // Duplicate check (case-insensitive, exclude self)
            const isDuplicate = liveProductCategoriesData.some(
                c => c.category_name.trim().toLowerCase() === name.toLowerCase() &&
                     String(c.category_id || c.id) !== String(catId)
            );
            if (isDuplicate) return showToast(`A category named "${name}" already exists.`, true);

            updateCatBtn.disabled = true;
            updateCatBtn.textContent = 'Updating...';
            try {
                const { error } = await supabase
                    .from('product_categories')
                    .eq('category_id', catId)
                    .update({ category_name: name });

                if (error) throw error;

                showToast('Category updated');
                closeAllModals();
                fetchProductCategories();
            } catch (err) {
                showToast(err.message || 'Failed to update category', true);
            } finally {
                updateCatBtn.disabled = false;
                updateCatBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Update Category';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── CREATE PRODUCT ────────────────────────────────────────────────────────
    const saveProdBtn = document.getElementById('saveProductBtn');
    if (saveProdBtn) {
        saveProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('productName').value.trim();
            const cat = document.getElementById('productCategory').value;
            const price = document.getElementById('productPrice').value;
            const stock = document.getElementById('productStock').value;
            
            if (!name || !cat || price === '' || stock === '') return showToast('Please fill all required fields', true);

            const categoryObj = liveProductCategoriesData.find(c => c.category_name === cat);
            const catId = categoryObj ? (categoryObj.category_id || categoryObj.id) : null;

            // Duplicate check (case-insensitive, under the same category)
            const isDuplicate = liveProductsData.some(
                p => (p.product_name || '').trim().toLowerCase() === name.toLowerCase() &&
                     (p.category_name || '').trim().toLowerCase() === cat.toLowerCase()
            );
            if (isDuplicate) return showToast(`A product named "${name}" already exists in this category.`, true);

            saveProdBtn.disabled = true;
            saveProdBtn.textContent = 'Saving...';
            try {
                const { error } = await supabase.from('products').insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    product_name: name,
                    category_name: cat,
                    category_id: catId,
                    price: Number(price),
                    stock_quantity: Number(stock),
                    status: document.querySelector('input[name="productStatus"]:checked')?.value || 'Active',
                    description: document.getElementById('productDescription').value.trim() || null,
                    product_image_url: currentAddProductImageUrl,
                    product_image_url: currentAddProductImageUrl
                });

                if (error) throw error;

                showToast('Product created');
                ['productName','productPrice','productStock','productDescription'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });
                document.getElementById('productCategory').value = '';
                closeAllModals();
                fetchProducts();
            } catch (err) {
                showToast(err.message || 'Failed to create product', true);
            } finally {
                saveProdBtn.disabled = false;
                saveProdBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Product';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── UPDATE PRODUCT ────────────────────────────────────────────────────────
    const updateProdBtn = document.getElementById('updateProductBtn');
    if (updateProdBtn) {
        updateProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('editProductName').value.trim();
            const cat = document.getElementById('editProductCategory').value;
            const price = document.getElementById('editProductPrice').value;
            const stock = document.getElementById('editProductStock').value;
            
            if (!name || !cat || price === '' || stock === '') return showToast('Please fill all required fields', true);

            const productId = document.getElementById('editProductId').value;
            const categoryObj = liveProductCategoriesData.find(c => c.category_name === cat);
            const catId = categoryObj ? (categoryObj.category_id || categoryObj.id) : null;

            // Duplicate check (case-insensitive, under the same category, excluding self)
            const isDuplicate = liveProductsData.some(
                p => (p.product_name || '').trim().toLowerCase() === name.toLowerCase() &&
                     (p.category_name || '').trim().toLowerCase() === cat.toLowerCase() &&
                     String(p.product_id || p.id) !== String(productId)
            );
            if (isDuplicate) return showToast(`A product named "${name}" already exists in this category.`, true);

            updateProdBtn.disabled = true;
            updateProdBtn.textContent = 'Updating...';
            try {
                const { error } = await supabase
                    .from('products')
                    .eq('product_id', productId)
                    .update({
                        product_name: name,
                        category_name: cat,
                        category_id: catId,
                        price: Number(price),
                        stock_quantity: Number(stock),
                        status: document.querySelector('input[name="editProductStatus"]:checked')?.value || 'Active',
                        description: document.getElementById('editProductDescription').value.trim() || null,
                        product_image_url: currentEditProductImageUrl
                    });

                if (error) throw error;

                showToast('Product updated');
                closeAllModals();
                fetchProducts();
            } catch (err) {
                showToast(err.message || 'Failed to update product', true);
            } finally {
                updateProdBtn.disabled = false;
                updateProdBtn.textContent = 'Update Product';
            }
        });
    }

    // ── DELETE (Product or Category) ──────────────────────────────────────────
    let deleteTarget = null;

    document.getElementById('btnCancelDelete')?.addEventListener('click', () => {
        document.getElementById('deleteConfirmOverlay').classList.remove('active');
        deleteTarget = null;
    });
    
    document.getElementById('btnConfirmDelete')?.addEventListener('click', async () => {
        if (!deleteTarget) return;
        const btn = document.getElementById('btnConfirmDelete');
        const origTxt = btn.textContent;
        btn.textContent = 'Deleting...';
        btn.disabled = true;
        document.getElementById('btnCancelDelete').disabled = true;

        try {
            const isProd = deleteTarget.type === 'product';
            let error;

            if (isProd) {
                // Soft delete — set status to 'deleted'
                ({ error } = await supabase
                    .from('products')
                    .eq('product_id', deleteTarget.id)
                    .update({ status: 'deleted' }));
            } else {
                ({ error } = await supabase
                    .from('product_categories')
                    .eq('category_id', deleteTarget.id)
                    .update({ status: 'deleted' }));
            }

            if (error) throw error;

            showToast(`${isProd ? 'Product' : 'Category'} deleted successfully`);
            document.getElementById('deleteConfirmOverlay').classList.remove('active');
            if (isProd) fetchProducts();
            else fetchProductCategories();
        } catch (err) {
            showToast(err.message || 'Failed to delete', true);
        } finally {
            btn.textContent = origTxt;
            btn.disabled = false;
            document.getElementById('btnCancelDelete').disabled = false;
            deleteTarget = null;
        }
    });

    window.triggerDeleteProduct = function(id, name) {
        deleteTarget = { type: 'product', id, name };
        document.getElementById('deleteConfirmTitle').textContent = 'Delete Product?';
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete "${name}"? This cannot be undone.`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
        if (window.feather) feather.replace();
    };

    window.triggerDeleteCategory = function(id, name) {
        deleteTarget = { type: 'category', id, name };
        document.getElementById('deleteConfirmTitle').textContent = 'Delete Category?';
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete "${name}"? This may impact products using it.`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
        if (window.feather) feather.replace();
    };
}

// --- Open Modals ---
window.openAddProductModal = function () {
    window.selectStatus('Active');
    currentAddProductImageUrl = null;
    const wrap = document.querySelector('#addProductModal .product-photo-wrap');
    if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
    const removeBtn = document.getElementById('removeAddProductPhotoBtn');
    if (removeBtn) removeBtn.style.display = 'none';

    document.getElementById('addProductModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
};

window.openAddCategoryModal = function () {
    window.selectCatStatus('Active');
    document.getElementById('addCategoryModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
};

window.openCatProductsModal = function (catName) {
    const products = liveProductsData.filter(p => p.category_name === catName);
    const modal = document.getElementById('catProductsModal');
    if(!modal) return;
    
    const title = document.getElementById('catProductsModalTitle');
    const body = document.getElementById('catProductsModalBody');
    
    title.style.display = 'flex';
    title.style.flexDirection = 'column';
    title.style.alignItems = 'flex-start';
    title.style.lineHeight = '1.2';
    title.innerHTML = `
        <div style="display:flex; align-items:center;">
            <span style="color:#2563eb;">${catName}</span>
            <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">${products.length}</span>
        </div>
        <div style="font-size: 0.85rem; color: #64748b; font-weight: 500; margin-top: 6px;">Products under this category</div>
    `;
    
    if (!products.length) {
        body.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;"><div style="font-size:2rem;margin-bottom:10px;">📦</div><div style="color:#64748b;font-weight:500;font-size:0.92rem;">No products listed in this category yet.</div></td></tr>';
    } else {
        body.innerHTML = products.map(p => {
            const name = p.product_name || p.name || '';
            const stock = p.stock_quantity || 0;
            const price = p.price != null ? '&#8377;' + parseFloat(p.price).toLocaleString('en-IN') : '—';
            return `<tr class="tb-row">
                <td style="padding:12px 16px 12px 24px;font-weight:500;color:#1e293b;">${name}</td>
                <td style="padding:12px 16px;color:#475569;font-weight:500;">
                    ${stock <= 5 && stock > 0 ? `<span style="color:#f59e0b;">Low: ${stock}</span>` : stock == 0 ? `<span style="color:#ef4444;">Out</span>` : stock}
                </td>
                <td style="padding:12px 16px;color:#15803d;font-weight:600;">${price}</td>
            </tr>`;
        }).join('');
    }
    modal.classList.add('active');
};

window.openEditProductModal = function (id) {
    const p = liveProductsData.find(x => (x.product_id || x.id) == id);
    if (p) {
        document.getElementById('editProductId').value = p.product_id || p.id;
        document.getElementById('editProductName').value = p.product_name || '';
        document.getElementById('editProductCategory').value = p.category_name || '';
        document.getElementById('editProductPrice').value = p.price || 0;
        document.getElementById('editProductStock').value = p.stock_quantity || 0;
        document.getElementById('editProductDescription').value = p.description || '';
        
        currentEditProductImageUrl = p.product_image_url || p.photo_url || p.image_url || null;
        const wrap = document.querySelector('#editProductModal .product-photo-wrap');
        if (wrap) {
            if (currentEditProductImageUrl) {
                wrap.innerHTML = `<img src="${currentEditProductImageUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
            } else {
                wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
            }
        }
        const removeBtn = document.getElementById('removeEditProductPhotoBtn');
        if (removeBtn) {
            removeBtn.style.display = currentEditProductImageUrl ? 'flex' : 'none';
        }


        window.selectEditStatus((p.status || 'Active').charAt(0).toUpperCase() + (p.status || 'Active').slice(1).toLowerCase());
        
        document.getElementById('editProductModalOverlay').classList.add('active');
        if (window.feather) feather.replace();
    }
};

window.openEditCategoryModal = function (id) {
    const c = liveProductCategoriesData.find(x => (x.category_id || x.id) == id);
    if (c) {
        document.getElementById('editCategoryId').value = c.category_id || c.id;
        document.getElementById('editCategoryName').value = c.category_name || '';
        
        document.getElementById('editCategoryModalOverlay').classList.add('active');
        if (window.feather) feather.replace();
    }
};

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
}

// --- Toast ---
window.showToast = function(msg, isError) {
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
}

// --- Image Viewer Modal ---
window.openImageViewer = function(url) {
    if (!document.getElementById('imageViewerModalOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="imageViewerModalOverlay" style="z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div class="modal-container" id="imageViewerModal" style="width: auto; max-width: 90vw; background: transparent; box-shadow: none; padding: 0;">
                <div style="position: relative; display: inline-block;">
                    <button id="closeImageViewerBtn" style="position: absolute; top: -16px; right: -16px; width: 36px; height: 36px; border-radius: 50%; background: #ffffff; border: none; color: #1e293b; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <img id="imageViewerImg" src="" style="max-height: 85vh; max-width: 100vw; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2); display: block;" alt="Preview">
                </div>
            </div>
        </div>`);
        
        document.getElementById('closeImageViewerBtn').addEventListener('click', () => {
            document.getElementById('imageViewerModalOverlay').classList.remove('active');
        });
        
        document.getElementById('imageViewerModalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'imageViewerModalOverlay') {
                e.target.classList.remove('active');
            }
        });
    }
    
    document.getElementById('imageViewerImg').src = url;
    document.getElementById('imageViewerModalOverlay').classList.add('active');
};
;


document.addEventListener('click', (e) => {
    if (e.target.closest('#removeAddProductPhotoBtn')) {
        currentAddProductImageUrl = null;
        document.getElementById('productPhotoInput').value = '';
        const wrap = document.querySelector('#addProductModal .product-photo-wrap');
        if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
        document.getElementById('removeAddProductPhotoBtn').style.display = 'none';
        if (window.feather) feather.replace();
    } else if (e.target.closest('#removeEditProductPhotoBtn')) {
        currentEditProductImageUrl = null;
        document.getElementById('editProductPhotoInput').value = '';
        const wrap = document.querySelector('#editProductModal .product-photo-wrap');
        if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
        document.getElementById('removeEditProductPhotoBtn').style.display = 'none';
        if (window.feather) feather.replace();
    }
});

function showToast(msg, isError) { window.showToast(msg, isError); }
