import { supabase } from './lib/supabase.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveCategoriesData = [];
let isSubmittingCategory = false;
let isUpdatingCategory = false;
let isDeletingCategory = false;

// --- Helpers ---
function getCompanyId() { return localStorage.getItem('company_id') || null; }
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
                            <input type="text" id="editCfName" class="form-input" maxlength="100" required>
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
    const addCatForm = document.getElementById('addCategoryForm');
    if (addCatForm) {
        addCatForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // ── Re-entrancy guard ──
            if (isSubmittingCategory) return;

            // ── 1. Validate category name ──
            const categoryName = document.getElementById('cfName').value.trim();
            if (!categoryName) {
                window.toast && window.toast('Category name is required.');
                return;
            }
            if (categoryName.length > 100) {
                window.toast && window.toast('Category name must be 100 characters or fewer.');
                return;
            }

            // ── 2. Validate company/branch context ──
            const companyId = getCompanyId();
            const branchId = getBranchId();
            if (!companyId || !branchId) {
                window.toast && window.toast('Missing company or branch context. Please reload or select a branch.');
                console.warn('Add Category blocked: missing company_id or branch_id');
                return;
            }

            // ── 3. Validate status selection ──
            const statusRadio = document.querySelector('input[name="cfStatus"]:checked');
            if (!statusRadio || !['active', 'inactive'].includes(statusRadio.value)) {
                window.toast && window.toast('Please select a valid status (Active or Inactive).');
                return;
            }
            const status = statusRadio.value;

            // ── 4. Duplicate check: in-memory first ──
            const nameLower = categoryName.toLowerCase();
            const memDuplicate = liveCategoriesData.find(c =>
                (c.category_name || '').trim().toLowerCase() === nameLower
            );
            if (memDuplicate) {
                window.toast && window.toast('A category with this name already exists.');
                return;
            }

            // ── 5. Duplicate check: server-side safety net ──
            // Guards against stale in-memory data or concurrent creation
            try {
                const { data: dupRows, error: dupError } = await supabase
                    .from('service_categories')
                    .select('category_id, category_name')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted');

                if (dupError) {
                    console.error('Duplicate check query failed:', dupError);
                    window.toast && window.toast('Could not verify category name. Please try again.');
                    return;
                }

                const serverDuplicate = (dupRows || []).find(c =>
                    (c.category_name || '').trim().toLowerCase() === nameLower
                );
                if (serverDuplicate) {
                    window.toast && window.toast('A category with this name already exists.');
                    return;
                }
            } catch (dupErr) {
                console.error('Network error during duplicate check:', dupErr);
                window.toast && window.toast('Network error verifying category name. Please try again.');
                return;
            }

            // ── 6. Lock submission ──
            isSubmittingCategory = true;
            const btn = document.querySelector('button[form="addCategoryForm"]');
            const originalText = btn ? btn.textContent : 'Save Category';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

            const payload = {
                company_id: companyId,
                branch_id: branchId,
                category_name: categoryName,
                description: document.getElementById('cfDescription').value.trim(),
                status: status
            };
            
            try {
                const { error } = await supabase
                    .from('service_categories')
                    .insert(payload);
                
                if (!error) {
                    window.toast && window.toast('Category added successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_service_category_created', {
                            title: 'Service Category Created',
                            message: `${payload.category_name} was created.`
                        });
                    }
                    document.getElementById('addCategoryModal').classList.remove('active');
                    addCatForm.reset();
                    try {
                        await fetchCategories();
                    } catch (refreshErr) {
                        console.warn('Category created but list refresh failed:', refreshErr);
                        window.toast && window.toast('Category created, but the list failed to refresh. Please reload.');
                    }
                } else {
                    console.error('Supabase insert error:', error);
                    window.toast && window.toast('Error adding category: ' + (error.message || 'Unknown error'));
                }
            } catch (err) {
                console.error('Network error inserting category:', err);
                window.toast && window.toast('Network error saving category. Please try again.');
            } finally {
                isSubmittingCategory = false;
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
        if (isUpdatingCategory) return;

        // ── 1. Company and branch scope enforcement ──
        const companyId = getCompanyId();
        const branchId = getBranchId();
        if (!companyId || !branchId) {
            console.error('Missing company or branch context');
            window.toast && window.toast('Session error: missing company or branch. Please re-login or reload.');
            return;
        }

        // ── 2. Primary-key & input extraction/validation ──
        const categoryId = (document.getElementById('editCategoryId').value || '').trim();
        if (!categoryId) {
            window.toast && window.toast('Invalid category identifier. Please close and re-open the modal.');
            return;
        }

        const newCategoryName = (document.getElementById('editCfName').value || '').trim();
        if (!newCategoryName) {
            window.toast && window.toast('Category name is required.');
            return;
        }
        if (newCategoryName.length > 100) {
            window.toast && window.toast('Category name cannot exceed 100 characters.');
            return;
        }

        const description = (document.getElementById('editCfDescription').value || '').trim();

        const statusRadio = document.querySelector('input[name="editCfStatus"]:checked');
        if (!statusRadio || !['active', 'inactive'].includes(statusRadio.value)) {
            window.toast && window.toast('Please select a valid status (Active or Inactive).');
            return;
        }
        const status = statusRadio.value;

        // ── 3. Duplicate check: in-memory first (case-insensitive, excluding current category) ──
        const nameLower = newCategoryName.toLowerCase();
        const memDuplicate = (liveCategoriesData || []).find(c =>
            String(c.category_id || c.id) !== String(categoryId) &&
            (c.category_name || '').trim().toLowerCase() === nameLower
        );
        if (memDuplicate) {
            window.toast && window.toast('A category with this name already exists.');
            return;
        }

        // ── 4. Re-entrancy guard & lock UI ──
        isUpdatingCategory = true;
        const btn = document.querySelector('button[form="editCategoryForm"]');
        const originalText = btn ? btn.textContent : 'Update Category';
        if (btn) {
            btn.textContent = 'Updating...';
            btn.disabled = true;
        }

        try {
            // ── 5. Duplicate check: server-side safety net (direct scoped SELECT) ──
            const { data: existingRows, error: dupError } = await supabase
                .from('service_categories')
                .select('category_id, category_name')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted');

            if (dupError) {
                console.error('Duplicate check query failed:', dupError);
                window.toast && window.toast('Could not verify category name. Please try again.');
                return;
            }

            const serverDuplicate = (existingRows || []).find(c =>
                String(c.category_id) !== String(categoryId) &&
                (c.category_name || '').trim().toLowerCase() === nameLower
            );
            if (serverDuplicate) {
                window.toast && window.toast('A category with this name already exists.');
                return;
            }

            // Determine if category name actually changed
            const currentCatInDb = (existingRows || []).find(c => String(c.category_id) === String(categoryId));
            const origCategory = currentCatInDb || (liveCategoriesData || []).find(c => String(c.category_id || c.id) === String(categoryId));
            const isNameChanged = origCategory ? (origCategory.category_name !== newCategoryName) : true;

            // ── 6. Execute scoped category update using category_id, company_id, branch_id ──
            const updatePayload = {
                category_name: newCategoryName,
                description: description,
                status: status,
                updated_at: new Date().toISOString()
            };

            const { data: updatedCatData, error: catUpdateError } = await supabase
                .from('service_categories')
                .update(updatePayload)
                .eq('category_id', categoryId)
                .eq('company_id', companyId)
                .eq('branch_id', branchId);

            if (catUpdateError) {
                console.error('Supabase update error on service_categories:', catUpdateError);
                window.toast && window.toast('Error updating category: ' + (catUpdateError.message || 'Unknown error'));
                return;
            }

            if (!updatedCatData || updatedCatData.length === 0) {
                console.error('No matching category found to update for this company and branch.');
                window.toast && window.toast('Category not found or access denied for this branch.');
                return;
            }

            // ── 7. Propagate renamed category to linked services (if name changed) ──
            let linkedServicesFailed = false;
            let linkedServicesErrorMessage = '';

            if (isNameChanged) {
                const serviceUpdatePayload = {
                    category_name: newCategoryName,
                    updated_at: new Date().toISOString()
                };

                const { error: serviceUpdateError } = await supabase
                    .from('services')
                    .update(serviceUpdatePayload)
                    .eq('category_id', categoryId)
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId);

                if (serviceUpdateError) {
                    console.error('Failed to update linked services:', serviceUpdateError);
                    linkedServicesFailed = true;
                    linkedServicesErrorMessage = serviceUpdateError.message || 'Unknown error';
                }
            }

            // ── 8. Notification & Partial-Failure Handling ──
            if (linkedServicesFailed) {
                console.warn(`Category '${newCategoryName}' updated, but linked services propagation failed: ${linkedServicesErrorMessage}`);
                window.toast && window.toast(`Category updated, but updating linked service names failed (${linkedServicesErrorMessage}). Linked services may need reconciliation.`);
            } else {
                window.toast && window.toast('Category updated successfully!');
            }

            if (window.notifyEvent) {
                window.notifyEvent('services', 'evt_service_category_updated', {
                    title: 'Service Category Updated',
                    message: `${newCategoryName} was updated.`
                });
            }

            editCatModal.classList.remove('active');

            // ── 9. Refresh UI state (Services first, then Categories) ──
            try {
                if (window.fetchServices) {
                    await window.fetchServices();
                }
                await fetchCategories();
            } catch (refreshErr) {
                console.warn('Category updated but UI refresh failed:', refreshErr);
                window.toast && window.toast('Category updated, but the list failed to refresh. Please reload.');
            }
        } catch (err) {
            console.error('Network error updating category:', err);
            window.toast && window.toast('Network error updating category. Please try again.');
        } finally {
            isUpdatingCategory = false;
            if (btn) {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }
    });

    // Delete Category Confirmations
    const deleteOverlay = document.getElementById('deleteConfirmOverlay');
    const fullScreenLoader = document.getElementById('fullScreenDeleteLoader');
    let categoryToDelete = null;

    document.getElementById('btnCancelDelete').addEventListener('click', () => {
        if (isDeletingCategory) return;
        deleteOverlay.classList.remove('active');
        categoryToDelete = null;
    });

    deleteOverlay.addEventListener('click', (e) => {
        if (isDeletingCategory) return;
        if (e.target === deleteOverlay) {
            deleteOverlay.classList.remove('active');
            categoryToDelete = null;
        }
    });

    document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
        if (isDeletingCategory) return;
        if (!categoryToDelete) return;

        // ── 1. Company and branch scope enforcement ──
        const companyId = getCompanyId();
        const branchId = getBranchId();
        if (!companyId || !branchId) {
            console.error('Missing company or branch context');
            window.toast && window.toast('Session error: missing company or branch. Please re-login or reload.');
            deleteOverlay.classList.remove('active');
            categoryToDelete = null;
            return;
        }

        const catId = categoryToDelete.category_id || categoryToDelete.id;
        const catName = categoryToDelete.name || 'Category';
        if (!catId) {
            window.toast && window.toast('Invalid category identifier. Deletion cancelled.');
            deleteOverlay.classList.remove('active');
            categoryToDelete = null;
            return;
        }

        // ── 2. Re-entrancy guard & lock UI ──
        isDeletingCategory = true;
        const btnConfirm = document.getElementById('btnConfirmDelete');
        const btnCancel = document.getElementById('btnCancelDelete');
        const originalConfirmText = btnConfirm ? btnConfirm.textContent : 'Yes, Delete';
        if (btnConfirm) {
            btnConfirm.textContent = 'Deleting...';
            btnConfirm.disabled = true;
        }
        if (btnCancel) {
            btnCancel.disabled = true;
        }

        deleteOverlay.classList.remove('active');
        fullScreenLoader.classList.add('active');

        try {
            // ── 3. Direct Dependency Check on `services` table ──
            // Exclude soft-deleted services; block deletion if active services still reference this category
            const { data: linkedServices, error: depError } = await supabase
                .from('services')
                .select('service_id, service_name, status')
                .eq('category_id', catId)
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted');

            if (depError) {
                console.error('Dependency check query failed:', depError);
                window.toast && window.toast('Could not verify linked services. Deletion aborted for safety.');
                return;
            }

            if (linkedServices && linkedServices.length > 0) {
                const count = linkedServices.length;
                const msg = `Cannot delete category: ${count} active ${count === 1 ? 'service is' : 'services are'} still assigned to it. Please reassign or delete the services first.`;
                console.warn(msg);
                window.toast && window.toast(msg);
                return;
            }

            // ── 4. Scoped Soft-Delete on `service_categories` ──
            const deletePayload = {
                status: 'deleted',
                updated_at: new Date().toISOString()
            };

            const { data: deletedRows, error: deleteError } = await supabase
                .from('service_categories')
                .update(deletePayload)
                .eq('category_id', catId)
                .eq('company_id', companyId)
                .eq('branch_id', branchId);

            if (deleteError) {
                console.error('Delete failed:', deleteError);
                window.toast && window.toast('Error deleting category: ' + (deleteError.message || 'Unknown error'));
                return;
            }

            // ── 5. Detect zero-row updates ──
            if (!deletedRows || deletedRows.length === 0) {
                console.error('Zero rows updated: category not found or access denied for this branch.');
                window.toast && window.toast('Category not found or access denied for this branch.');
                return;
            }

            // ── 6. Success notification & event ──
            window.toast && window.toast('Category deleted successfully!');
            if (window.notifyEvent) {
                window.notifyEvent('services', 'evt_service_category_deleted', {
                    title: 'Service Category Deleted',
                    message: `${catName} was deleted.`
                });
            }

            // ── 7. UI state refresh (Services first, then Categories) ──
            try {
                if (window.fetchServices) {
                    await window.fetchServices();
                }
                await fetchCategories();
            } catch (refreshErr) {
                console.warn('Category deleted but UI refresh failed:', refreshErr);
                window.toast && window.toast('Category deleted, but the list failed to refresh. Please reload.');
            }
        } catch (err) {
            console.error('Network error deleting category:', err);
            window.toast && window.toast('Error: ' + (err.message || 'Unknown network error deleting category'));
        } finally {
            isDeletingCategory = false;
            fullScreenLoader.classList.remove('active');
            deleteOverlay.classList.remove('active');
            if (btnConfirm) {
                btnConfirm.textContent = originalConfirmText;
                btnConfirm.disabled = false;
            }
            if (btnCancel) {
                btnCancel.disabled = false;
            }
            categoryToDelete = null;
        }
    });

    // Global expose so dynamically rendered buttons can call these
    window.openEditCategoryModal = (catId, catName) => {
        const cat = (liveCategoriesData || []).find(c => String(c.category_id || c.id) === String(catId));
        if (cat) {
            document.getElementById('editCategoryId').value = cat.category_id || cat.id || '';
            document.getElementById('editCfName').value = cat.category_name || cat.name || '';
            document.getElementById('editCfDescription').value = cat.description || '';
            const catStatus = (cat.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
            const statusRadios = document.querySelectorAll('input[name="editCfStatus"]');
            statusRadios.forEach(r => r.checked = (r.value === catStatus));
            document.getElementById('editCategoryModal').classList.add('active');
            const nameInput = document.getElementById('editCfName');
            if (nameInput) setTimeout(() => nameInput.focus(), 50);
        } else {
            console.warn('openEditCategoryModal: Category not found for id:', catId);
            window.toast && window.toast('Category details not found. Please refresh the page.');
        }
    };
    
    window.triggerDeleteCategory = (catId, catName) => {
        if (isDeletingCategory) return;
        const cat = (liveCategoriesData || []).find(c => String(c.category_id || c.id) === String(catId));
        const resolvedId = (cat ? cat.category_id : null) || catId;
        const resolvedName = (cat ? cat.category_name : null) || catName;
        categoryToDelete = { category_id: resolvedId, id: resolvedId, name: resolvedName };
        const overlay = document.getElementById('deleteConfirmOverlay');
        if (overlay) overlay.classList.add('active');
    };
}

export async function fetchCategories() {
    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        if (!companyId || !branchId) {
            console.warn('Cannot fetch service categories: missing company_id or branch_id context');
            if (window.toast) window.toast('Missing company or branch context. Please reload or select a branch.');
            liveCategoriesData = [];
            window.liveCategoriesData = [];
            if (window.renderCat) window.renderCat([]);
            const countEl = document.getElementById('countCategories');
            if (countEl) countEl.textContent = '0';
            populateCategoryDropdownEx();
            if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();
            return;
        }

        const { data, error } = await supabase
            .from('service_categories')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted')
            .order('category_name', { ascending: true });

        if (error) {
            console.error('Error fetching service categories:', error.message || error);
            if (window.toast) window.toast('Error loading categories: ' + (error.message || 'Check connection'));
            liveCategoriesData = [];
            window.liveCategoriesData = [];
            if (window.renderCat) window.renderCat([]);
            const countEl = document.getElementById('countCategories');
            if (countEl) countEl.textContent = '0';
            populateCategoryDropdownEx();
            if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();
            return;
        }

        const rawCategories = data || [];
        liveCategoriesData = rawCategories
            .map(c => ({ ...c, status: (c.status || '').trim() }))
            .filter(c => c.status && c.status.toLowerCase() !== 'deleted');

        window.liveCategoriesData = liveCategoriesData;

        // If search input has an active query, filter; else render all
        const searchInput = document.getElementById('categoriesSearchInput');
        if (searchInput && searchInput.value && window.applyCategoryFilters) {
            window.applyCategoryFilters();
        } else if (window.renderCat) {
            window.renderCat(liveCategoriesData);
        }

        const countEl = document.getElementById('countCategories');
        if (countEl) {
            countEl.textContent = liveCategoriesData.length;
        }
        populateCategoryDropdownEx();
        if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();
    } catch (err) {
        console.error('Network Error fetching service categories:', err);
        if (window.toast) window.toast('Network error loading categories');
        liveCategoriesData = [];
        window.liveCategoriesData = [];
        if (window.renderCat) window.renderCat([]);
        const countEl = document.getElementById('countCategories');
        if (countEl) countEl.textContent = '0';
    }
}

function populateCategoryDropdownEx() {
    const sel = document.getElementById('sfCategory');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    liveCategoriesData.filter(c => (c.status || '').toLowerCase() === 'active').forEach(c => {
        const catId = c.category_id || c.id;
        const catName = c.category_name || c.name || '';
        if (catId) {
            const o = document.createElement('option');
            o.value = catId;
            o.textContent = catName;
            o.dataset.name = catName;
            o.dataset.id = catId;
            sel.appendChild(o);
        }
    });
    if (currentVal && Array.from(sel.options).some(opt => opt.value === currentVal)) {
        sel.value = currentVal;
    }
}

window.fetchCategories = fetchCategories;



