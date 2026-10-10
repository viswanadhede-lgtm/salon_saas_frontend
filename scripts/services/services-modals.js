// scripts/services/services-modals.js
// Modal injection and modal opening/populating for Service editing and deletion.
// Preserves exact injected HTML, DOM IDs, styles, and lookup semantics (including S2).

import { servicesState } from './services-state.js';

export function setupModals() {
    // Inject Edit Modal if not exists
    if (!document.getElementById('editServiceModal')) {
        const editModalHtml = `
        <div class="modal-overlay" id="editServiceModal">
            <div class="modal-container" style="width:560px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Service</h2>
                        <p class="subtitle">Update service details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditServiceModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;overflow-y:auto;">
                    <form id="editServiceForm" style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;">
                        <input type="hidden" id="editServiceId">
                        
                        <div class="form-group" style="margin:0;grid-column:1/-1;">
                            <label class="form-label" for="editSfSvcName">Service Name <span class="text-rose">*</span></label>
                            <input type="text" id="editSfSvcName" class="form-input" required>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfCategory">Category <span class="text-rose">*</span></label>
                            <select id="editSfCategory" class="form-select" required>
                                <option value="" disabled selected>Select a category</option>
                            </select>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfDuration">Duration <span class="text-rose">*</span> <span style="font-weight:400;color:#94a3b8;">(minutes)</span></label>
                            <input type="number" id="editSfDuration" class="form-input" min="5" step="5" required>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfPrice">Price <span class="text-rose">*</span> <span style="font-weight:400;color:#94a3b8;">(&#8377;)</span></label>
                            <input type="number" id="editSfPrice" class="form-input" min="0" required>
                        </div>
                        
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">Status</label>
                            <div style="display:flex;gap:20px;padding-top:8px;">
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editSfStatus" value="active" style="accent-color:#1e3a8a;"> Active
                                </label>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editSfStatus" value="inactive" style="accent-color:#1e3a8a;"> Inactive
                                </label>
                            </div>
                        </div>
                        
                        <div class="form-group" style="margin:0;grid-column:1/-1;">
                            <label class="form-label" for="editSfDescription">Description <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editSfDescription" class="form-input form-textarea" style="min-height:80px;"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelEditService">Cancel</button>
                    <button type="submit" class="btn btn-primary" form="editServiceForm">Update Service</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', editModalHtml);
    }

    // Inject Delete Confirm Overlay if not exists
    if (!document.getElementById('deleteServiceConfirmOverlay')) {
        const deleteOverlayHtml = `
        <div class="modal-overlay custom-logout-overlay" id="deleteServiceConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="trash-2" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete Service?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to delete this service? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDeleteService" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDeleteService" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Delete</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay custom-logout-overlay" id="fullScreenDeleteServiceLoader" style="z-index: 10000; backdrop-filter: blur(8px);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;"></div>
                <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Deleting service...</h2>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteOverlayHtml);
    }
    
    // Inject Delete Package Confirm Overlay
    if (!document.getElementById('deletePackageConfirmOverlay')) {
        const deletePkgHtml = `
        <div class="modal-overlay custom-logout-overlay" id="deletePackageConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="trash-2" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete Package?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to delete this package? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDeletePackage" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDeletePackage" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Delete</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', deletePkgHtml);
    }
    
    if (window.feather) feather.replace();
}

// Function to populate edit category dropdown from categories data
export function populateCategoryDropdownExForEdit() {
    const sel = document.getElementById('editSfCategory');
    if (!sel || !window.liveCategoriesData) return;
    
    const currentVal = sel.value;
    
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    (window.liveCategoriesData || []).filter(c => (c.status || '').toLowerCase() === 'active').forEach(c => {
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

export function openEditServiceModal(svcId) {
    const svc = (servicesState.liveServicesData || []).find(s => s.service_id === svcId);
    if (svc) {
        document.getElementById('editServiceId').value = svc.service_id || '';
        document.getElementById('editSfSvcName').value = svc.service_name || svc.name || '';
        
        populateCategoryDropdownExForEdit();
        
        const sel = document.getElementById('editSfCategory');
        if (sel) {
            // First try matching by category_id
            if (svc.category_id && Array.from(sel.options).some(o => o.value === svc.category_id)) {
                sel.value = svc.category_id;
            } else {
                // Fallback by category_name if category_id was missing
                const matchOpt = Array.from(sel.options).find(o => (o.textContent || '').trim().toLowerCase() === (svc.category_name || '').trim().toLowerCase());
                if (matchOpt) sel.value = matchOpt.value;
            }
        }
        document.getElementById('editSfDuration').value = svc.duration || '';
        document.getElementById('editSfPrice').value = svc.price || '';
        document.getElementById('editSfDescription').value = svc.description || '';
        const statusRadios = document.querySelectorAll('input[name="editSfStatus"]');
        statusRadios.forEach(r => r.checked = (r.value === (svc.status || 'active')));
        document.getElementById('editServiceModal').classList.add('active');
    } else {
        console.warn('Could not find service with service_id:', svcId);
        if (window.toast) window.toast('Could not find service details');
    }
    if (window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
}

export function triggerDeleteService(svcId, svcName) {
    servicesState.serviceToDelete = { id: svcId, name: svcName };
    document.getElementById('deleteServiceConfirmOverlay').classList.add('active');
    if (window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
}
