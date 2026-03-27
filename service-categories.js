import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveCategoriesData = [];

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

// Initialize Categories logic
export async function initCategories() {
    setupModals();
    attachEventListeners();
    await fetchCategories();
}

function setupModals() {
    // Inject Edit Modal if not exists
    if (!document.getElementById('editCategoryModal')) {
        const editModalHtml = `
        <div class="modal-overlay" id="editCategoryModal">
            <div class="modal-container" style="width:480px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Category</h2>
                        <p class="subtitle">Update service category details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditCategoryModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;overflow-y:auto;">
                    <form id="editCategoryForm" style="display:flex;flex-direction:column;gap:16px;">
                        <input type="hidden" id="editCategoryId">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editCfName">Category Name <span class="text-rose">*</span></label>
                            <input type="text" id="editCfName" class="form-input" required>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editCfDescription">Description <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editCfDescription" class="form-input form-textarea" style="min-height:80px;"></textarea>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">Status</label>
                            <div style="display:flex;gap:20px;padding-top:8px;">
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editCfStatus" value="active" style="accent-color:#1e3a8a;"> Active
                                </label>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editCfStatus" value="inactive" style="accent-color:#1e3a8a;"> Inactive
                                </label>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelEditCategory">Cancel</button>
                    <button type="submit" class="btn btn-primary" form="editCategoryForm">Update Category</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', editModalHtml);
    }

    // Inject Delete Confirm Overlay if not exists
    if (!document.getElementById('deleteConfirmOverlay')) {
        const deleteOverlayHtml = `
        <div class="modal-overlay custom-logout-overlay" id="deleteConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="trash-2" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete Category?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to delete this service category? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDelete" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDelete" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Delete</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay custom-logout-overlay" id="fullScreenDeleteLoader" style="z-index: 10000; backdrop-filter: blur(8px);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;"></div>
                <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Deleting category...</h2>
            </div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteOverlayHtml);
    }
    
    if (window.feather) feather.replace();
}

function attachEventListeners() {
    // Add Category
    const addCatForm = document.getElementById('addCategoryForm');
    if (addCatForm) {
        addCatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                category_name: document.getElementById('cfName').value.trim(),
                description: document.getElementById('cfDescription').value.trim(),
                status: document.querySelector('input[name="cfStatus"]:checked').value
            };
            
            const btn = document.querySelector('button[form="addCategoryForm"]');
            const originalText = btn ? btn.textContent : 'Save Category';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            
            try {
                const res = await fetchWithAuth(API.CREATE_SERVICE_CATEGORY, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }, FEATURES.SERVICES_MANAGEMENT, 'create');
                
                const data = await res.json();
                if (res.ok && data.status === 'success') {
                    toast('Category added successfully!');
                    document.getElementById('addCategoryModal').classList.remove('active');
                    addCatForm.reset();
                    await fetchCategories();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                    toast('Error adding category: ' + errorMsg);
                }
            } catch (err) {
                console.error(err);
                toast('Network error saving category');
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    // Edit Category
    const editCatModal = document.getElementById('editCategoryModal');
    const editCatForm = document.getElementById('editCategoryForm');
    
    document.getElementById('btnCloseEditCategoryModal').addEventListener('click', () => editCatModal.classList.remove('active'));
    document.getElementById('btnCancelEditCategory').addEventListener('click', () => editCatModal.classList.remove('active'));
    editCatModal.addEventListener('click', (e) => { if (e.target === editCatModal) editCatModal.classList.remove('active') });
    
    editCatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoryId = document.getElementById('editCategoryId').value;
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            category_id: categoryId,
            category_name: document.getElementById('editCfName').value.trim(),
            description: document.getElementById('editCfDescription').value.trim(),
            status: document.querySelector('input[name="editCfStatus"]:checked').value
        };
        
        const btn = document.querySelector('button[form="editCategoryForm"]');
            const originalText = btn ? btn.textContent : 'Update Category';
            if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }
        
        try {
            const res = await fetchWithAuth(API.UPDATE_SERVICE_CATEGORY, {
                method: 'POST',
                body: JSON.stringify(payload)
            }, FEATURES.SERVICES_MANAGEMENT, 'update');
            
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                toast('Category updated successfully!');
                editCatModal.classList.remove('active');
                await fetchCategories();
            } else {
                let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                toast('Error updating category: ' + errorMsg);
            }
        } catch (err) {
            console.error(err);
            toast('Network error updating category');
        } finally {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        }
    });

    // Delete Category Confirmations
    const deleteOverlay = document.getElementById('deleteConfirmOverlay');
    const fullScreenLoader = document.getElementById('fullScreenDeleteLoader');
    let categoryToDelete = null;

    document.getElementById('btnCancelDelete').addEventListener('click', () => {
        deleteOverlay.classList.remove('active');
        categoryToDelete = null;
    });

    deleteOverlay.addEventListener('click', (e) => {
        if (e.target === deleteOverlay) {
            deleteOverlay.classList.remove('active');
            categoryToDelete = null;
        }
    });

    document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
        if (!categoryToDelete) return;
        
        deleteOverlay.classList.remove('active');
        fullScreenLoader.classList.add('active');
        
        try {
            const res = await fetchWithAuth(API.DELETE_SERVICE_CATEGORY, {
                method: 'POST',
                body: JSON.stringify({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    category_id: categoryToDelete.id,
                    category_name: categoryToDelete.name
                })
            }, FEATURES.SERVICES_MANAGEMENT, 'delete');
            
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                toast('Category deleted successfully!');
                await fetchCategories();
            } else {
                let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                toast('Error deleting category: ' + errorMsg);
            }
        } catch (err) {
            console.error(err);
            toast('Network error deleting category');
        } finally {
            fullScreenLoader.classList.remove('active');
            categoryToDelete = null;
        }
    });

    // Global expose so dynamically rendered buttons can call these
    window.openEditCategoryModal = (catId, catName) => {
        const cat = liveCategoriesData.find(c => (c.id || c.category_id) === catId);
        if (cat) {
            document.getElementById('editCategoryId').value = cat.id || cat.category_id || '';
            document.getElementById('editCfName').value = cat.category_name || cat.name || '';
            document.getElementById('editCfDescription').value = cat.description || '';
            const statusRadios = document.querySelectorAll('input[name="editCfStatus"]');
            statusRadios.forEach(r => r.checked = (r.value === cat.status));
            document.getElementById('editCategoryModal').classList.add('active');
        }
    };
    
    window.triggerDeleteCategory = (catId, catName) => {
        categoryToDelete = { id: catId, name: catName };
        document.getElementById('deleteConfirmOverlay').classList.add('active');
    };
}

export async function fetchCategories() {
    try {
        const response = await fetchWithAuth(API.READ_SERVICE_CATEGORY, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id: getBranchId()
            })
        }, FEATURES.SERVICES_MANAGEMENT, 'read');
        if (!response.ok) throw new Error('Failed to fetch from backend');
        
        const data = await response.json();
        liveCategoriesData = data.categories || data.data || [];
        
        window.liveCategoriesData = liveCategoriesData;
        window.renderCat(liveCategoriesData);
        const countEl = document.getElementById('countCategories');
        if (countEl) countEl.textContent = liveCategoriesData.length;
        populateCategoryDropdownEx();
    } catch (err) {
        console.error('Network Error:', err);
        window.renderCat(liveCategoriesData);
    }
}

function populateCategoryDropdownEx() {
    const sel = document.getElementById('sfCategory');
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    liveCategoriesData.filter(c => c.status === 'active').forEach(c => {
        const o = document.createElement('option');
        o.value = c.category_name; // the name usually
        o.textContent = c.category_name;
        sel.appendChild(o);
    });
}
