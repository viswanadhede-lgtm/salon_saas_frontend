// scripts/products/products-modals.js
// Modal injection, status toggles, open/close functions.
// Preserved exactly from original products.js.

import { productsState } from './products-state.js';

// ─────────────────────────────────────────────────────────────────────────────
// INJECT MODALS
// ─────────────────────────────────────────────────────────────────────────────

export function setupInjectedModals() {
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

// ─────────────────────────────────────────────────────────────────────────────
// CLOSE ALL MODALS
// ─────────────────────────────────────────────────────────────────────────────

export function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TOGGLES
// ─────────────────────────────────────────────────────────────────────────────

export function selectStatus(val) {
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
}

export function selectEditStatus(val) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// OPEN MODALS
// ─────────────────────────────────────────────────────────────────────────────

export function openAddProductModal() {
    selectStatus('Active');
    productsState.addImageUrl = null;
    const wrap = document.querySelector('#addProductModal .product-photo-wrap');
    if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
    const removeBtn = document.getElementById('removeAddProductPhotoBtn');
    if (removeBtn) removeBtn.style.display = 'none';

    document.getElementById('addProductModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

export function openAddCategoryModal() {
    document.getElementById('addCategoryModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

export function openCatProductsModal(catName) {
    const products = productsState.products.filter(p => p.category_name === catName);
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
}

export function openEditProductModal(id) {
    const p = productsState.products.find(x => (x.product_id || x.id) == id);
    if (p) {
        document.getElementById('editProductId').value = p.product_id || p.id;
        document.getElementById('editProductName').value = p.product_name || '';
        document.getElementById('editProductCategory').value = p.category_name || '';
        document.getElementById('editProductPrice').value = p.price || 0;
        document.getElementById('editProductStock').value = p.stock_quantity || 0;
        document.getElementById('editProductDescription').value = p.description || '';

        productsState.editImageUrl = p.product_image_url || p.photo_url || p.image_url || null;
        const wrap = document.querySelector('#editProductModal .product-photo-wrap');
        if (wrap) {
            if (productsState.editImageUrl) {
                wrap.innerHTML = `<img src="${productsState.editImageUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
            } else {
                wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
            }
        }
        const removeBtn = document.getElementById('removeEditProductPhotoBtn');
        if (removeBtn) {
            removeBtn.style.display = productsState.editImageUrl ? 'flex' : 'none';
        }

        selectEditStatus((p.status || 'Active').charAt(0).toUpperCase() + (p.status || 'Active').slice(1).toLowerCase());

        document.getElementById('editProductModalOverlay').classList.add('active');
        if (window.feather) feather.replace();
    }
}

export function openEditCategoryModal(id) {
    const c = productsState.categories.find(x => (x.category_id || x.id) == id);
    if (c) {
        document.getElementById('editCategoryId').value = c.category_id || c.id;
        document.getElementById('editCategoryName').value = c.category_name || '';

        document.getElementById('editCategoryModalOverlay').classList.add('active');
        if (window.feather) feather.replace();
    }
}

export function openImageViewer(url) {
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
}
