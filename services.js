import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveServicesData = [];

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

export async function initServices() {
    setupModals();
    attachEventListeners();
    await fetchServices();
}

function setupModals() {
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
                        <input type="hidden" id="editSvcId">
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
                    <button id="btnCancelDeleteSvc" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDeleteSvc" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Delete</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay custom-logout-overlay" id="fullScreenDeleteSvcLoader" style="z-index: 10000; backdrop-filter: blur(8px);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;"></div>
                <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Deleting service...</h2>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteOverlayHtml);
    }
    
    if (window.feather) feather.replace();
}

function attachEventListeners() {
    // Add Service Form
    const addSvcForm = document.getElementById('addServiceForm');
    if (addSvcForm) {
        // Remove the hardcoded dummy submission set in services.html
        const newAddSvcForm = addSvcForm.cloneNode(true);
        addSvcForm.parentNode.replaceChild(newAddSvcForm, addSvcForm);

        newAddSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                service_name: document.getElementById('sfSvcName').value.trim(),
                category_name: document.getElementById('sfCategory').value,
                duration: parseInt(document.getElementById('sfDuration').value) || 0,
                price: parseFloat(document.getElementById('sfPrice').value) || 0,
                status: document.querySelector('input[name="sfStatus"]:checked').value,
                description: document.getElementById('sfDescription').value.trim()
            };
            
            const btn = document.querySelector('button[form="addServiceForm"]');
            const originalText = btn ? btn.textContent : 'Save Service';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            
            try {
                const res = await fetchWithAuth(API.CREATE_SERVICE, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }, FEATURES.SERVICES_MANAGEMENT, 'create');
                
                const data = await res.json();
                const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;
                if (res.ok && !hasError) {
                    // Assuming window.toast exists in services.html
                    window.toast('Service added successfully!');
                    document.getElementById('addServiceModal').classList.remove('active');
                    newAddSvcForm.reset();
                    await fetchServices();
                } else {
                    let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                    window.toast('Error adding service: ' + errorMsg);
                }
            } catch (err) {
                console.error(err);
                window.toast('Network error saving service');
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    // Edit Service Form
    const editSvcModal = document.getElementById('editServiceModal');
    const editSvcForm = document.getElementById('editServiceForm');
    
    document.getElementById('btnCloseEditServiceModal').addEventListener('click', () => editSvcModal.classList.remove('active'));
    document.getElementById('btnCancelEditService').addEventListener('click', () => editSvcModal.classList.remove('active'));
    editSvcModal.addEventListener('click', (e) => { if (e.target === editSvcModal) editSvcModal.classList.remove('active') });
    
    editSvcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceId = document.getElementById('editSvcId').value;
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            service_id: serviceId,
            service_name: document.getElementById('editSfSvcName').value.trim(),
            category_name: document.getElementById('editSfCategory').value,
            duration: parseInt(document.getElementById('editSfDuration').value) || 0,
            price: parseFloat(document.getElementById('editSfPrice').value) || 0,
            status: document.querySelector('input[name="editSfStatus"]:checked').value,
            description: document.getElementById('editSfDescription').value.trim()
        };
        
        const btn = document.querySelector('button[form="editServiceForm"]');
        const originalText = btn ? btn.textContent : 'Update Service';
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }
        
        try {
            const res = await fetchWithAuth(API.UPDATE_SERVICE, {
                method: 'POST',
                body: JSON.stringify(payload)
            }, FEATURES.SERVICES_MANAGEMENT, 'update');
            
            const data = await res.json();
            const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;
            if (res.ok && !hasError) {
                window.toast('Service updated successfully!');
                editSvcModal.classList.remove('active');
                await fetchServices();
            } else {
                let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                window.toast('Error updating service: ' + errorMsg);
            }
        } catch (err) {
            console.error(err);
            window.toast('Network error updating service');
        } finally {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        }
    });

    // Delete Service Confirmations
    const deleteSvcOverlay = document.getElementById('deleteServiceConfirmOverlay');
    const fullScreenSvcLoader = document.getElementById('fullScreenDeleteSvcLoader');
    let serviceToDelete = null;

    document.getElementById('btnCancelDeleteSvc').addEventListener('click', () => {
        deleteSvcOverlay.classList.remove('active');
        serviceToDelete = null;
    });

    deleteSvcOverlay.addEventListener('click', (e) => {
        if (e.target === deleteSvcOverlay) {
            deleteSvcOverlay.classList.remove('active');
            serviceToDelete = null;
        }
    });

    document.getElementById('btnConfirmDeleteSvc').addEventListener('click', async () => {
        if (!serviceToDelete) return;
        
        deleteSvcOverlay.classList.remove('active');
        fullScreenSvcLoader.classList.add('active');
        
        try {
            const res = await fetchWithAuth(API.DELETE_SERVICE, {
                method: 'POST',
                body: JSON.stringify({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    service_id: serviceToDelete.id
                })
            }, FEATURES.SERVICES_MANAGEMENT, 'delete');
            
            const data = await res.json();
            const hasError = Array.isArray(data) ? !!data[0]?.error : !!data.error;
            if (res.ok && !hasError) {
                window.toast('Service deleted successfully!');
                await fetchServices();
            } else {
                let errorMsg = Array.isArray(data) ? data[0]?.error || 'Unknown error' : data.message || data.error || 'Unknown error';
                window.toast('Error deleting service: ' + errorMsg);
            }
        } catch (err) {
            console.error(err);
            window.toast('Network error deleting service');
        } finally {
            fullScreenSvcLoader.classList.remove('active');
            serviceToDelete = null;
        }
    });

    // Global expose so dynamically rendered buttons can call these
    window.openEditServiceModal = (svcId) => {
        const svc = liveServicesData.find(s => (s.id || s.service_id) === svcId);
        if (svc) {
            document.getElementById('editSvcId').value = svc.id || svc.service_id || '';
            document.getElementById('editSfSvcName').value = svc.service_name || svc.name || '';
            
            // Populate category dropdown
            const editCatSelect = document.getElementById('editSfCategory');
            editCatSelect.innerHTML = '<option value="" disabled selected>Select a category</option>';
            if (window.liveCategoriesData) {
                window.liveCategoriesData.filter(c => c.status === 'active').forEach(c => {
                    const o = document.createElement('option');
                    const catName = c.category_name || c.name;
                    o.value = catName;
                    o.textContent = catName;
                    if (catName === (svc.category_name || svc.category)) {
                        o.selected = true;
                    }
                    editCatSelect.appendChild(o);
                });
            }

            document.getElementById('editSfDuration').value = svc.duration || '';
            document.getElementById('editSfPrice').value = svc.price || '';
            document.getElementById('editSfDescription').value = svc.description || '';
            
            const statusRadios = document.querySelectorAll('input[name="editSfStatus"]');
            statusRadios.forEach(r => r.checked = (r.value === (svc.status || 'active')));
            document.getElementById('editServiceModal').classList.add('active');
            
            // Close the actions menu if open
            if(window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
        }
    };
    
    window.triggerDeleteService = (svcId) => {
        serviceToDelete = { id: svcId };
        document.getElementById('deleteServiceConfirmOverlay').classList.add('active');
        if(window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
    };
}

export async function fetchServices() {
    try {
        const response = await fetchWithAuth(API.READ_SERVICES, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id: getBranchId()
            })
        }, FEATURES.SERVICES_MANAGEMENT, 'read');
        if (!response.ok) throw new Error('Failed to fetch from backend');
        
        const data = await response.json();
        const root = Array.isArray(data) ? data[0] : data;
        
        const rawServices = root.services || [];
        liveServicesData = rawServices.filter(s => (s.status || '').toLowerCase() !== 'deleted');
        
        window.liveServicesData = liveServicesData;
        
        if (typeof window.renderSvc === 'function') {
            window.renderSvc(liveServicesData);
        }
        
        const countEl = document.getElementById('countServices');
        if (countEl) {
            countEl.textContent = liveServicesData.length;
        }
    } catch (err) {
        console.error('Network Error:', err);
        if (typeof window.renderSvc === 'function') {
            window.renderSvc(liveServicesData);
        }
    }
}
