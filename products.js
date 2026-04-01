import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveProductsData = [];
let liveProductCategoriesData = [];

// --- Helpers ---
function getCompanyId() {
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        return appContext.company?.id || null;
    } catch (e) { return null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', function () {
    // Nuke the mock init logic
    initTabs();
    setupInjectedModals();
    attachGlobalEventListeners();

    // Load data
    fetchProductCategories().then(() => {
        fetchProducts();
    });
});

// --- API Integrations ---

async function fetchProductCategories() {
    try {
        const response = await fetchWithAuth(API.READ_PRODUCT_CATEGORIES, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        }, FEATURES.PRODUCT_MANAGEMENT, 'read');
        
        if (!response.ok) throw new Error('Failed to fetch categories');
        
        const data = await response.json();
        let rawData = Array.isArray(data) ? data : (data.categories || []);
        liveProductCategoriesData = rawData.filter(c => (c.status || '').toLowerCase() !== 'deleted');
        
        // Update Add Product Dropdown
        populateCategoryDropdown('productCategory');
        // Update Edit Product Dropdown 
        populateCategoryDropdown('editProductCategory');
        // Update Filter Dropdown
        renderFilterOptions();
        
        // Render table
        renderCategoriesTable();
        // Update Badge
        const tabEl = document.getElementById('categoriesCountBadge');
        if (tabEl) tabEl.textContent = liveProductCategoriesData.length;
    } catch (err) {
        console.error('Error fetching product categories:', err);
    }
}

async function fetchProducts() {
    try {
        const response = await fetchWithAuth(API.READ_PRODUCTS, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        }, FEATURES.PRODUCT_MANAGEMENT, 'read');
        
        if (!response.ok) throw new Error('Failed to fetch products');
        
        const data = await response.json();
        let rawData = Array.isArray(data) ? data : (data.products || []);
        liveProductsData = rawData.filter(p => (p.status || '').toLowerCase() !== 'deleted');
        
        renderProductsTable();
        const tabEl = document.getElementById('productsCountBadge');
        if (tabEl) tabEl.textContent = liveProductsData.length;
    } catch (err) {
        console.error('Error fetching products:', err);
    }
}

function populateCategoryDropdown(dropdownId) {
    const sel = document.getElementById(dropdownId);
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    liveProductCategoriesData.filter(c => (c.status || '').toLowerCase() === 'active').forEach(c => {
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
                primaryActionBtn.onclick = window.openAddProductModal;
                fetchProductCategories();
                renderProductsTable();
            } else {
                document.getElementById('tabCategories').style.display = 'block';
                searchInput.placeholder  = 'Search categories...';
                filterBtn.style.display  = 'none';
                primaryActionText.textContent = 'Add Category';
                primaryActionBtn.onclick = window.openAddCategoryModal;
                renderCategoriesTable();
            }
        });
    });

    if (primaryActionBtn) { primaryActionBtn.onclick = window.openAddProductModal; }
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
             const activeTab = document.querySelector('.tab-btn.active');
             if(!activeTab) return;
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
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(searchStr) || (p.category_name || '').toLowerCase().includes(searchStr));
    }
    
    const selectedCategory = document.querySelector('input[name="filterCategory"]:checked');
    if (selectedCategory && selectedCategory.value !== 'all') {
        filtered = filtered.filter(p => p.category_name === selectedCategory.value);
    }

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.innerHTML = `
            <td style="padding:16px 16px 16px 32px;"><p style="font-weight:600;color:#1e293b;margin:0;font-size:0.9rem;">${p.name || '-'}</p></td>
            <td style="padding:16px;"><span style="background:#f1f5f9;padding:3px 8px;border-radius:6px;font-size:0.8rem;color:#475569;">${p.category_name || 'Uncategorized'}</span></td>
            <td style="padding:16px;color:#334155;font-weight:600;font-size:0.9rem;">&#8377;${p.price || 0}</td>
            <td style="padding:16px;">${stockBadge(p.stock_quantity || 0)}</td>
            <td style="padding:16px;">${statusBadge(p.status)}</td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="window.openEditProductModal('${p.id || p.product_id}')" title="Edit Product" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="window.triggerDeleteProduct('${p.id || p.product_id}', '${(p.name || '').replace(/'/g, "\\'")}')" title="Delete Product" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.feather) feather.replace();
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
            <td style="padding:16px 16px 16px 32px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:36px;height:36px;border-radius:8px;background:#e0e7ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">${char}</div>
                    <div><p style="font-weight:600;color:#1e293b;margin:0;font-size:0.9rem;">${c.category_name || '-'}</p></div>
                </div>
            </td>
            <td style="padding:16px;"><span style="font-size:0.9rem;font-weight:700;color:#334155;">${pCount}</span><span style="font-size:0.8rem;color:#94a3b8;margin-left:5px;">items</span></td>
            <td style="padding:16px;">${statusBadge(c.status)}</td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="window.openEditCategoryModal('${c.id || c.category_id}')" title="Edit Category" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="flex-shrink-0 hover-lift" ${pCount > 0 ? 'disabled' : ''} onclick="${pCount > 0 ? '' : `window.triggerDeleteCategory('${c.id || c.category_id}', '${(c.category_name || '').replace(/'/g, "\\'")}')`}" title="${pCount > 0 ? 'Cannot delete the category because there are active products under this category' : 'Delete Category'}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:${pCount > 0 ? 'not-allowed' : 'pointer'}; color:#ef4444; transition:all 0.2s; min-width: 52px; opacity: ${pCount > 0 ? '0.45' : '1'};">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.feather) feather.replace();
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
        const deleteOverlayHtml = `
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
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteOverlayHtml);
    }

    // Edit Product Modal
    if (!document.getElementById('editProductModalOverlay')) {
        const editProductHtml = `
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
                            <div class="product-photo-wrap" style="width: 140px; height: 140px; margin-bottom: 20px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8;">
                                <i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                            </div>
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
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label class="form-label">Status</label>
                                <div style="display:flex; gap:8px; margin-top:4px;">
                                    <label style="flex:1; cursor:pointer;">
                                        <input type="radio" name="editProductStatus" value="Active" style="display:none;" id="editPStatusActive">
                                        <div id="editPStatusActiveBtn" onclick="selectEditStatus('Active')" style="border:2px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:8px; padding:9px 0; text-align:center; font-size:0.88rem; font-weight:600; transition:all 0.2s;">Active</div>
                                    </label>
                                    <label style="flex:1; cursor:pointer;">
                                        <input type="radio" name="editProductStatus" value="Inactive" style="display:none;" id="editPStatusInactive">
                                        <div id="editPStatusInactiveBtn" onclick="selectEditStatus('Inactive')" style="border:2px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:8px; padding:9px 0; text-align:center; font-size:0.88rem; font-weight:600; transition:all 0.2s;">Inactive</div>
                                    </label>
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
        </div>`;
        document.body.insertAdjacentHTML('beforeend', editProductHtml);
    }

    // Edit Category Modal
    if (!document.getElementById('editCategoryModalOverlay')) {
        const editCatHtml = `
        <div class="modal-overlay" id="editCategoryModalOverlay">
            <div class="modal-container" id="editCategoryModal" style="width: 420px; max-width: 95%;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Category</h2>
                        <p class="subtitle">Update category details</p>
                    </div>
                    <button class="modal-close" id="closeEditCategoryModal"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; overflow-y: auto;">
                    <input type="hidden" id="editCategoryId">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label class="form-label" for="editCategoryName">Category Name <span class="text-rose">*</span></label>
                        <input type="text" id="editCategoryName" class="form-input" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label class="form-label">Status</label>
                        <div style="display:flex; gap:8px; margin-top:4px;">
                            <label style="flex:1; cursor:pointer;">
                                <input type="radio" name="editCategoryStatus" value="Active" style="display:none;" id="editCStatusActive">
                                <div id="editCStatusActiveBtn" onclick="selectEditCatStatus('Active')" style="border:2px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:8px; padding:9px 0; text-align:center; font-size:0.88rem; font-weight:600; transition:all 0.2s;">Active</div>
                            </label>
                            <label style="flex:1; cursor:pointer;">
                                <input type="radio" name="editCategoryStatus" value="Inactive" style="display:none;" id="editCStatusInactive">
                                <div id="editCStatusInactiveBtn" onclick="selectEditCatStatus('Inactive')" style="border:2px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:8px; padding:9px 0; text-align:center; font-size:0.88rem; font-weight:600; transition:all 0.2s;">Inactive</div>
                            </label>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" for="editCategoryDescription">Description</label>
                        <textarea id="editCategoryDescription" class="form-input form-textarea" style="min-height:80px;"></textarea>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 16px 1.5rem; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #f1f5f9;">
                    <button type="button" class="btn btn-secondary" id="cancelEditCategory" style="padding: 8px 16px;">Cancel</button>
                    <button type="button" class="btn btn-primary" id="updateCategoryBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;padding: 8px 16px;width: auto; flex: 0 0 auto; max-width: max-content;">Update Category</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', editCatHtml);
    }
}

// --- Status Style Toggles ---
window.selectStatus = function (val) {
    const act = document.getElementById('statusActiveBtn');
    const inact = document.getElementById('statusInactiveBtn');
    if(act && inact){
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('statusActive');
            if(el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('statusInactive');
            if(el) el.checked = true;
        }
    }
};

window.selectCatStatus = function (val) {
    const act = document.getElementById('catStatusActiveBtn');
    const inact = document.getElementById('catStatusInactiveBtn');
    const activeRadio = document.querySelector('input[name="categoryStatus"][value="Active"]');
    const inactiveRadio = document.querySelector('input[name="categoryStatus"][value="Inactive"]');
    if(act && inact){
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            if(activeRadio) activeRadio.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            if(inactiveRadio) inactiveRadio.checked = true;
        }
    }
};

window.selectEditStatus = function (val) {
    const act = document.getElementById('editPStatusActiveBtn');
    const inact = document.getElementById('editPStatusInactiveBtn');
    if(act && inact){
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('editPStatusActive');
            if(el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('editPStatusInactive');
            if(el) el.checked = true;
        }
    }
};

window.selectEditCatStatus = function (val) {
    const act = document.getElementById('editCStatusActiveBtn');
    const inact = document.getElementById('editCStatusInactiveBtn');
    if(act && inact){
        if (val === 'Active') {
            act.style.borderColor = '#1e3a8a'; act.style.background = '#eff6ff'; act.style.color = '#1e3a8a';
            inact.style.borderColor = '#e2e8f0'; inact.style.background = '#f8fafc'; inact.style.color = '#64748b';
            const el = document.getElementById('editCStatusActive');
            if(el) el.checked = true;
        } else {
            inact.style.borderColor = '#1e3a8a'; inact.style.background = '#eff6ff'; inact.style.color = '#1e3a8a';
            act.style.borderColor = '#e2e8f0'; act.style.background = '#f8fafc'; act.style.color = '#64748b';
            const el = document.getElementById('editCStatusInactive');
            if(el) el.checked = true;
        }
    }
};


// --- Event Listeners & Modals ---
function attachGlobalEventListeners() {
    // Add Product Modals close triggers
    ['addProductModalOverlay', 'addCategoryModalOverlay', 'editProductModalOverlay', 'editCategoryModalOverlay'].forEach(oid => {
        const overlay = document.getElementById(oid);
        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAllModals(); });
    });

    ['closeAddProductModal','cancelAddProduct','closeAddCategoryModal','cancelAddCategory',
     'closeEditProductModal','cancelEditProduct','closeEditCategoryModal','cancelEditCategory'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', closeAllModals);
    });

    // --- Create Category ---
    const saveCatBtn = document.getElementById('saveCategoryBtn');
    if (saveCatBtn) {
        saveCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('categoryName').value.trim();
            if (!name) return showToast('Please enter category name', true);
            
            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                category_name: name,
                description: document.getElementById('categoryDescription').value.trim(),
                status: document.querySelector('input[name="categoryStatus"]:checked')?.value || 'Active'
            };
            
            saveCatBtn.disabled = true;
            saveCatBtn.textContent = 'Saving...';
            try {
                const res = await fetchWithAuth(API.CREATE_PRODUCT_CATEGORY, {
                    method: 'POST', body: JSON.stringify(payload)
                }, FEATURES.PRODUCT_MANAGEMENT, 'create');
                const data = await res.json();
                const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;

                if (res.ok && !hasError) {
                    showToast('Category created successfully');
                    closeAllModals();
                    document.getElementById('categoryName').value = '';
                    document.getElementById('categoryDescription').value = '';
                    fetchProductCategories();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Failed to create category';
                    showToast(errorMsg, true);
                }
            } catch (err) {
                showToast('Network error', true);
            } finally {
                saveCatBtn.disabled = false;
                saveCatBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Category';
                if(window.feather) feather.replace();
            }
        });
    }

    // --- Update Category ---
    const updateCatBtn = document.getElementById('updateCategoryBtn');
    if (updateCatBtn) {
        updateCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('editCategoryName').value.trim();
            if(!name) return showToast('Please enter category name', true);
            
            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                category_id: document.getElementById('editCategoryId').value,
                category_name: name,
                description: document.getElementById('editCategoryDescription').value.trim(),
                status: document.querySelector('input[name="editCategoryStatus"]:checked')?.value || 'Active'
            };

            updateCatBtn.disabled = true;
            updateCatBtn.textContent = 'Updating...';
            try {
                const res = await fetchWithAuth(API.UPDATE_PRODUCT_CATEGORY, {
                    method: 'POST', body: JSON.stringify(payload)
                }, FEATURES.PRODUCT_MANAGEMENT, 'update');
                const data = await res.json();
                const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;

                if (res.ok && !hasError) {
                    showToast('Category updated');
                    closeAllModals();
                    fetchProductCategories();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Failed to update';
                    showToast(errorMsg, true);
                }
            } catch (err) {
                showToast('Network error', true);
            } finally {
                updateCatBtn.disabled = false;
                updateCatBtn.textContent = 'Update Category';
            }
        });
    }

    // --- Create Product ---
    const saveProdBtn = document.getElementById('saveProductBtn');
    if (saveProdBtn) {
        saveProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('productName').value.trim();
            const cat = document.getElementById('productCategory').value;
            const price = document.getElementById('productPrice').value;
            const stock = document.getElementById('productStock').value;
            
            if(!name || !cat || price==='' || stock==='') return showToast('Please fill all required fields', true);

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                name: name,
                category_name: cat,
                price: Number(price),
                stock_quantity: Number(stock),
                status: document.querySelector('input[name="productStatus"]:checked')?.value || 'Active',
                description: document.getElementById('productDescription').value.trim()
            };

            saveProdBtn.disabled = true;
            saveProdBtn.textContent = 'Saving...';
            try {
                const res = await fetchWithAuth(API.CREATE_PRODUCT, {
                    method: 'POST', body: JSON.stringify(payload)
                }, FEATURES.PRODUCT_MANAGEMENT, 'create');
                const data = await res.json();
                const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;

                if (res.ok && !hasError) {
                    showToast('Product created');
                    document.getElementById('productName').value = '';
                    document.getElementById('productPrice').value = '';
                    document.getElementById('productStock').value = '';
                    document.getElementById('productCategory').value = '';
                    document.getElementById('productDescription').value = '';
                    closeAllModals();
                    fetchProducts();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Failed to create product';
                    showToast(errorMsg, true);
                }
            } catch (err) {
                showToast('Network error', true);
            } finally {
                saveProdBtn.disabled = false;
                saveProdBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Product';
                if(window.feather) feather.replace();
            }
        });
    }

    // --- Update Product ---
    const updateProdBtn = document.getElementById('updateProductBtn');
    if (updateProdBtn) {
        updateProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('editProductName').value.trim();
            const cat = document.getElementById('editProductCategory').value;
            const price = document.getElementById('editProductPrice').value;
            const stock = document.getElementById('editProductStock').value;
            
            if(!name || !cat || price==='' || stock==='') return showToast('Please fill all required fields', true);

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                product_id: document.getElementById('editProductId').value,
                name: name,
                category_name: cat,
                price: Number(price),
                stock_quantity: Number(stock),
                status: document.querySelector('input[name="editProductStatus"]:checked')?.value || 'Active',
                description: document.getElementById('editProductDescription').value.trim()
            };

            updateProdBtn.disabled = true;
            updateProdBtn.textContent = 'Updating...';
            try {
                const res = await fetchWithAuth(API.UPDATE_PRODUCT, {
                    method: 'POST', body: JSON.stringify(payload)
                }, FEATURES.PRODUCT_MANAGEMENT, 'update');
                const data = await res.json();
                const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;

                if (res.ok && !hasError) {
                    showToast('Product updated');
                    closeAllModals();
                    fetchProducts();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Failed to update';
                    showToast(errorMsg, true);
                }
            } catch (err) {
                showToast('Network error', true);
            } finally {
                updateProdBtn.disabled = false;
                updateProdBtn.textContent = 'Update Product';
            }
        });
    }

    // --- Deletion Flow ---
    let deleteTarget = null; // { type: 'product'|'category', id: '', name: '' }
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
            const apiEndpoint = isProd ? API.DELETE_PRODUCT : API.DELETE_PRODUCT_CATEGORY;
            const payload = { company_id: getCompanyId(), branch_id: getBranchId() };
            if (isProd) payload.product_id = deleteTarget.id;
            else payload.category_id = deleteTarget.id;

            const res = await fetchWithAuth(apiEndpoint, {
                method: 'POST', body: JSON.stringify(payload)
            }, FEATURES.PRODUCT_MANAGEMENT, 'delete');
            const data = await res.json();
            const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;
            
            if (res.ok && !hasError) {
                showToast(`${isProd ? 'Product' : 'Category'} deleted successfully`);
                if (isProd) fetchProducts();
                else fetchProductCategories();
                document.getElementById('deleteConfirmOverlay').classList.remove('active');
            } else {
                let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Failed to delete';
                showToast(errorMsg, true);
            }
        } catch (err) {
            showToast('Network error deleting', true);
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
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete ${name}?`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
    };

    window.triggerDeleteCategory = function(id, name) {
        deleteTarget = { type: 'category', id, name };
        document.getElementById('deleteConfirmTitle').textContent = 'Delete Category?';
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete ${name}? This may impact products using it.`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
    };
}

window.openAddProductModal = function () {
    window.selectStatus('Active');
    document.getElementById('addProductModalOverlay').classList.add('active');
    if(window.feather) feather.replace();
};

window.openAddCategoryModal = function () {
    window.selectCatStatus('Active');
    document.getElementById('addCategoryModalOverlay').classList.add('active');
    if(window.feather) feather.replace();
};

window.openEditProductModal = function (id) {
    const p = liveProductsData.find(x => (x.id || x.product_id) == id);
    if(p) {
        document.getElementById('editProductId').value = p.id || p.product_id;
        document.getElementById('editProductName').value = p.name || '';
        document.getElementById('editProductCategory').value = p.category_name || '';
        document.getElementById('editProductPrice').value = p.price || 0;
        document.getElementById('editProductStock').value = p.stock_quantity || 0;
        document.getElementById('editProductDescription').value = p.description || '';
        window.selectEditStatus((p.status || 'Active').charAt(0).toUpperCase() + (p.status || 'Active').slice(1).toLowerCase());
        
        document.getElementById('editProductModalOverlay').classList.add('active');
        if(window.feather) feather.replace();
    }
};

window.openEditCategoryModal = function (id) {
    const c = liveProductCategoriesData.find(x => (x.id || x.category_id) == id);
    if(c) {
        document.getElementById('editCategoryId').value = c.id || c.category_id;
        document.getElementById('editCategoryName').value = c.category_name || '';
        document.getElementById('editCategoryDescription').value = c.description || '';
        window.selectEditCatStatus((c.status || 'Active').charAt(0).toUpperCase() + (c.status || 'Active').slice(1).toLowerCase());
        
        document.getElementById('editCategoryModalOverlay').classList.add('active');
        if(window.feather) feather.replace();
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
