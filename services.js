import { supabase } from './lib/supabase.js';
import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveServicesData = [];
let livePackagesData = [];

// --- Helpers ---
function getCompanyId() { return localStorage.getItem('company_id') || null; }
function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

export async function initServices() {
    setupModals();
    attachEventListeners();
    await fetchServices();
    if (window.fetchPackages) await fetchPackages();
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

function attachEventListeners() {
    const addSvcForm = document.getElementById('addServiceForm');
    if (addSvcForm) {
        addSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serviceName = document.getElementById('sfSvcName').value.trim();
            const nameLower = serviceName.toLowerCase();

            // Duplicate Check
            const categoryName = document.getElementById('sfCategory').value.toLowerCase();
            const exists = liveServicesData.find(s => 
                (s.service_name || s.name || '').toLowerCase() === nameLower &&
                (s.category_name || s.category || '').toLowerCase() === categoryName
            );
            if (exists) {
                window.toast && window.toast('A service with this name already exists in this category.');
                return;
            }

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                service_name: serviceName,
                category_id: document.getElementById('sfCategory').selectedOptions[0]?.dataset.id || '',
                category_name: document.getElementById('sfCategory').value,
                duration: parseInt(document.getElementById('sfDuration').value, 10),
                price: parseFloat(document.getElementById('sfPrice').value),
                status: document.querySelector('input[name="sfStatus"]:checked').value,
                description: document.getElementById('sfDescription').value.trim()
            };
            
            const btn = document.querySelector('button[form="addServiceForm"]');
            const originalText = btn ? btn.textContent : 'Save Service';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            
            try {
                const { error } = await supabase
                    .from('services')
                    .insert(payload);
                
                if (!error) {
                    window.toast && window.toast('Service added successfully!');
                    document.getElementById('addServiceModal').classList.remove('active');
                    addSvcForm.reset();
                    await fetchServices();
                } else {
                    window.toast && window.toast('Error adding service: ' + error.message);
                }
            } catch (err) {
                console.error(err);
                window.toast && window.toast('Network error saving service');
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    // Edit Service
    const editSvcModal = document.getElementById('editServiceModal');
    const editSvcForm = document.getElementById('editServiceForm');
    
    document.getElementById('btnCloseEditServiceModal').addEventListener('click', () => editSvcModal.classList.remove('active'));
    document.getElementById('btnCancelEditService').addEventListener('click', () => editSvcModal.classList.remove('active'));
    editSvcModal.addEventListener('click', (e) => { if (e.target === editSvcModal) editSvcModal.classList.remove('active') });
    
    editSvcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceId = document.getElementById('editServiceId').value;
        const newServiceName = document.getElementById('editSfSvcName').value.trim();
        const nameLower = newServiceName.toLowerCase();

        // Duplicate Check
        const categoryName = document.getElementById('editSfCategory').value.toLowerCase();
        const exists = liveServicesData.find(s => 
            (s.service_name || s.name || '').toLowerCase() === nameLower && 
            (s.category_name || s.category || '').toLowerCase() === categoryName &&
            String(s.service_id || s.id) !== String(serviceId)
        );
        if (exists) {
            window.toast && window.toast('A service with this name already exists in this category.');
            return;
        }

        const payload = {
            service_name: newServiceName,
            category_id: document.getElementById('editSfCategory').selectedOptions[0]?.dataset.id || '',
            category_name: document.getElementById('editSfCategory').value,
            duration: parseInt(document.getElementById('editSfDuration').value, 10),
            price: parseFloat(document.getElementById('editSfPrice').value),
            status: document.querySelector('input[name="editSfStatus"]:checked').value,
            description: document.getElementById('editSfDescription').value.trim()
        };
        
        const btn = document.querySelector('button[form="editServiceForm"]');
        const originalText = btn ? btn.textContent : 'Update Service';
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }
        
        try {
            let updateError;
            ({ error: updateError } = await supabase
                .from('services')
                .eq('id', serviceId)
                .update(payload));

            if (updateError) {
                ({ error: updateError } = await supabase
                    .from('services')
                    .eq('service_id', serviceId)
                    .update(payload));
            }

            if (!updateError) {
                window.toast && window.toast('Service updated successfully!');
                editSvcModal.classList.remove('active');
                await fetchServices();
            } else {
                window.toast && window.toast('Error updating service: ' + updateError.message);
            }
        } catch (err) {
            console.error('Error updating service:', err);
            window.toast && window.toast('Error: ' + (err.message || 'Unknown error updating service'));
        } finally {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
        }
    });

    // Delete Service Confirmations
    const deleteOverlay = document.getElementById('deleteServiceConfirmOverlay');
    const fullScreenLoader = document.getElementById('fullScreenDeleteServiceLoader');
    let serviceToDelete = null;

    document.getElementById('btnCancelDeleteService').addEventListener('click', () => {
        deleteOverlay.classList.remove('active');
        serviceToDelete = null;
    });

    deleteOverlay.addEventListener('click', (e) => {
        if (e.target === deleteOverlay) {
            deleteOverlay.classList.remove('active');
            serviceToDelete = null;
        }
    });

    document.getElementById('btnConfirmDeleteService').addEventListener('click', async () => {
        if (!serviceToDelete) return;
        
        deleteOverlay.classList.remove('active');
        fullScreenLoader.classList.add('active');
        
        try {
            // Try Supabase auto-PK 'id' first, then fallback to 'service_id'
            let deleteError;
            ({ error: deleteError } = await supabase
                .from('services')
                .eq('id', serviceToDelete.id)
                .update({ status: 'deleted' }));

            if (deleteError) {
                console.warn('id-based delete failed, trying service_id:', deleteError.message);
                ({ error: deleteError } = await supabase
                    .from('services')
                    .eq('service_id', serviceToDelete.id)
                    .update({ status: 'deleted' }));
            }

            if (!deleteError) {
                window.toast && window.toast('Service deleted successfully!');
                await fetchServices();
            } else {
                console.error('Delete failed:', deleteError);
                window.toast && window.toast('Error deleting service: ' + deleteError.message);
            }
        } catch (err) {
            console.error('Error deleting service:', err);
            window.toast && window.toast('Error: ' + (err.message || 'Unknown error deleting service'));
        } finally {
            fullScreenLoader.classList.remove('active');
            serviceToDelete = null;
        }
    });

    // Global expose
    window.openEditServiceModal = (svcId) => {
        const svc = liveServicesData.find(s => (s.service_id) === svcId);
        if (svc) {
            document.getElementById('editServiceId').value = svc.service_id || '';
            document.getElementById('editSfSvcName').value = svc.service_name || svc.name || '';
            
            window.populateCategoryDropdownExForEdit();
            
            document.getElementById('editSfCategory').value = svc.category_name || '';
            document.getElementById('editSfDuration').value = svc.duration || '';
            document.getElementById('editSfPrice').value = svc.price || '';
            document.getElementById('editSfDescription').value = svc.description || '';
            const statusRadios = document.querySelectorAll('input[name="editSfStatus"]');
            statusRadios.forEach(r => r.checked = (r.value === svc.status));
            document.getElementById('editServiceModal').classList.add('active');
        }
        if (window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
    };
    
    window.triggerDeleteService = (svcId, svcName) => {
        serviceToDelete = { id: svcId, name: svcName };
        document.getElementById('deleteServiceConfirmOverlay').classList.add('active');
        if (window.svcMenu) { window.svcMenu.remove(); window.svcMenu = null; }
    };
    
    // --------------------------------------------------------
    // Packages Logic
    // --------------------------------------------------------
    const pkgServicesDropdownToggle = document.getElementById('pkgServicesDropdownToggle');
    const pkgServicesDropdownMenu = document.getElementById('pkgServicesDropdownMenu');
    let selectedPackageServices = new Set();

    if (pkgServicesDropdownToggle) {
        pkgServicesDropdownToggle.addEventListener('click', () => {
            pkgServicesDropdownMenu.style.display = pkgServicesDropdownMenu.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (!pkgServicesDropdownToggle.contains(e.target) && !pkgServicesDropdownMenu.contains(e.target)) {
                pkgServicesDropdownMenu.style.display = 'none';
            }
        });
    }

    window.populatePackageServicesDropdown = () => {
        if (!pkgServicesDropdownMenu) return;
        pkgServicesDropdownMenu.innerHTML = '';
        selectedPackageServices.clear();
        window.updatePackageServicesChips();

        (window.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
            const itemDiv = document.createElement('div');
            itemDiv.style.display = 'flex';
            itemDiv.style.flexDirection = 'row';
            itemDiv.style.alignItems = 'center';
            itemDiv.style.justifyContent = 'flex-start';
            itemDiv.style.padding = '10px 16px';
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.width = '100%';
            itemDiv.style.boxSizing = 'border-box';
            itemDiv.style.margin = '0';
            itemDiv.style.borderBottom = '1px solid #f1f5f9';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = s.service_id || s.id;
            checkbox.dataset.name = s.service_name || s.name;
            checkbox.style.display = 'inline-block';
            checkbox.style.width = '16px';
            checkbox.style.height = '16px';
            checkbox.style.margin = '0 12px 0 0';
            checkbox.style.padding = '0';
            checkbox.style.accentColor = '#1e3a8a';
            checkbox.style.flexShrink = '0';
            checkbox.style.cursor = 'pointer';

            const textSpan = document.createElement('span');
            textSpan.textContent = s.service_name || s.name;
            textSpan.style.display = 'inline-block';
            textSpan.style.whiteSpace = 'nowrap';
            textSpan.style.overflow = 'hidden';
            textSpan.style.textOverflow = 'ellipsis';
            textSpan.style.fontSize = '0.9rem';
            textSpan.style.color = '#374151';
            textSpan.style.flexGrow = '1';
            textSpan.style.textAlign = 'left';
            
            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(textSpan);
            
            itemDiv.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                if (checkbox.checked) selectedPackageServices.add(s.service_id || s.id);
                else selectedPackageServices.delete(s.service_id || s.id);
                window.updatePackageServicesChips();
            });

            itemDiv.addEventListener('mouseenter', () => itemDiv.style.background = '#f8fafc');
            itemDiv.addEventListener('mouseleave', () => itemDiv.style.background = 'transparent');
            
            pkgServicesDropdownMenu.appendChild(itemDiv);
        });
    };

    window.updatePackageServicesChips = () => {
        const chipsContainer = document.getElementById('pkgServicesSelectedChips');
        const placeholder = document.getElementById('pkgServicesPlaceholder');
        if (!chipsContainer || !placeholder) return;
        
        chipsContainer.innerHTML = '';
        if (selectedPackageServices.size === 0) {
            placeholder.style.display = 'inline';
        } else {
            placeholder.style.display = 'none';
            selectedPackageServices.forEach(id => {
                const svc = (window.liveServicesData || []).find(s => (s.service_id || s.id) === id);
                if (svc) {
                    const chip = document.createElement('span');
                    chip.style.background = '#e0e7ff';
                    chip.style.color = '#3730a3';
                    chip.style.padding = '2px 8px';
                    chip.style.borderRadius = '12px';
                    chip.style.fontSize = '0.75rem';
                    chip.style.fontWeight = '600';
                    chip.style.display = 'inline-flex';
                    chip.style.alignItems = 'center';
                    chip.style.gap = '4px';
                    
                    const xBtn = document.createElement('i');
                    xBtn.dataset.feather = 'x';
                    xBtn.style.width = '12px';
                    xBtn.style.height = '12px';
                    xBtn.style.cursor = 'pointer';
                    xBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectedPackageServices.delete(id);
                        const cb = pkgServicesDropdownMenu.querySelector(`input[value="${id}"]`);
                        if (cb) cb.checked = false;
                        window.updatePackageServicesChips();
                    });
                    
                    chip.appendChild(document.createTextNode(svc.service_name || svc.name));
                    chip.appendChild(xBtn);
                    chipsContainer.appendChild(chip);
                }
            });
            if (window.feather) feather.replace();
        }
    };

    const addPkgForm = document.getElementById('addPackageForm');
    if (addPkgForm) {
        addPkgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (selectedPackageServices.size === 0) {
                window.toast && window.toast('Please select at least one service.');
                return;
            }

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                package_name: document.getElementById('pkgName').value.trim(),
                description: document.getElementById('pkgDescription').value.trim(),
                original_price: parseFloat(document.getElementById('pkgOriginalPrice').value),
                final_price: parseFloat(document.getElementById('pkgFinalPrice').value),
                services_count: selectedPackageServices.size,
                is_active: document.querySelector('input[name="pkgStatus"]:checked').value === 'true'
            };

            const btn = document.querySelector('button[form="addPackageForm"]');
            const originalText = btn ? btn.textContent : 'Save Package';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

            try {
                const { data: pkgData, error: pkgError } = await supabase
                    .from('packages')
                    .insert(payload)
                    .select();

                if (pkgError) throw pkgError;

                if (pkgData && pkgData.length > 0) {
                    const newPkgId = pkgData[0].package_id;
                    const psPayloads = Array.from(selectedPackageServices).map(svcId => {
                        const svc = (window.liveServicesData || []).find(s => (s.service_id || s.id) === svcId);
                        return {
                            package_id: newPkgId,
                            service_id: svcId,
                            service_name: svc ? (svc.service_name || svc.name) : 'Unknown Service'
                        };
                    });

                    const { error: psError } = await supabase
                        .from('package_services')
                        .insert(psPayloads);

                    if (psError) throw psError;

                    window.toast && window.toast('Package added successfully!');
                    document.getElementById('addPackageModal').classList.remove('active');
                    addPkgForm.reset();
                    selectedPackageServices.clear();
                    window.updatePackageServicesChips();
                    if (window.fetchPackages) await window.fetchPackages();
                }
            } catch (err) {
                console.error(err);
                window.toast && window.toast('Error adding package: ' + err.message);
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    // --------------------------------------------------------
    // Edit Packages Logic
    // --------------------------------------------------------
    const editPkgServicesDropdownToggle = document.getElementById('editPkgServicesDropdownToggle');
    const editPkgServicesDropdownMenu = document.getElementById('editPkgServicesDropdownMenu');
    let editSelectedPackageServices = new Set();

    if (editPkgServicesDropdownToggle) {
        editPkgServicesDropdownToggle.addEventListener('click', () => {
            editPkgServicesDropdownMenu.style.display = editPkgServicesDropdownMenu.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (editPkgServicesDropdownToggle && editPkgServicesDropdownMenu && !editPkgServicesDropdownToggle.contains(e.target) && !editPkgServicesDropdownMenu.contains(e.target)) {
                editPkgServicesDropdownMenu.style.display = 'none';
            }
        });
    }

    window.populateEditPackageServicesDropdown = () => {
        if (!editPkgServicesDropdownMenu) return;
        editPkgServicesDropdownMenu.innerHTML = '';
        window.updateEditPackageServicesChips();

        (window.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
            const itemDiv = document.createElement('div');
            itemDiv.style.display = 'flex';
            itemDiv.style.flexDirection = 'row';
            itemDiv.style.alignItems = 'center';
            itemDiv.style.justifyContent = 'flex-start';
            itemDiv.style.padding = '10px 16px';
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.width = '100%';
            itemDiv.style.boxSizing = 'border-box';
            itemDiv.style.margin = '0';
            itemDiv.style.borderBottom = '1px solid #f1f5f9';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = s.service_id || s.id;
            checkbox.dataset.name = s.service_name || s.name;
            checkbox.style.display = 'inline-block';
            checkbox.style.width = '16px';
            checkbox.style.height = '16px';
            checkbox.style.margin = '0 12px 0 0';
            checkbox.style.padding = '0';
            checkbox.style.accentColor = '#1e3a8a';
            checkbox.style.flexShrink = '0';
            checkbox.style.cursor = 'pointer';
            
            if (editSelectedPackageServices.has(checkbox.value)) {
                checkbox.checked = true;
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = s.service_name || s.name;
            textSpan.style.display = 'inline-block';
            textSpan.style.whiteSpace = 'nowrap';
            textSpan.style.overflow = 'hidden';
            textSpan.style.textOverflow = 'ellipsis';
            textSpan.style.fontSize = '0.9rem';
            textSpan.style.color = '#374151';
            textSpan.style.flexGrow = '1';
            textSpan.style.textAlign = 'left';
            
            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(textSpan);
            
            itemDiv.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                if (checkbox.checked) editSelectedPackageServices.add(s.service_id || s.id);
                else editSelectedPackageServices.delete(s.service_id || s.id);
                window.updateEditPackageServicesChips();
            });

            itemDiv.addEventListener('mouseenter', () => itemDiv.style.background = '#f8fafc');
            itemDiv.addEventListener('mouseleave', () => itemDiv.style.background = 'transparent');
            
            editPkgServicesDropdownMenu.appendChild(itemDiv);
        });
    };

    window.updateEditPackageServicesChips = () => {
        const chipsContainer = document.getElementById('editPkgServicesSelectedChips');
        const placeholder = document.getElementById('editPkgServicesPlaceholder');
        if (!chipsContainer || !placeholder) return;
        
        chipsContainer.innerHTML = '';
        if (editSelectedPackageServices.size === 0) {
            placeholder.style.display = 'inline';
        } else {
            placeholder.style.display = 'none';
            editSelectedPackageServices.forEach(id => {
                const svc = (window.liveServicesData || []).find(s => (s.service_id || s.id) === id);
                if (svc) {
                    const chip = document.createElement('span');
                    chip.style.background = '#e0e7ff';
                    chip.style.color = '#3730a3';
                    chip.style.padding = '2px 8px';
                    chip.style.borderRadius = '12px';
                    chip.style.fontSize = '0.75rem';
                    chip.style.fontWeight = '600';
                    chip.style.display = 'inline-flex';
                    chip.style.alignItems = 'center';
                    chip.style.gap = '4px';
                    
                    const xBtn = document.createElement('i');
                    xBtn.dataset.feather = 'x';
                    xBtn.style.width = '12px';
                    xBtn.style.height = '12px';
                    xBtn.style.cursor = 'pointer';
                    xBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        editSelectedPackageServices.delete(id);
                        const cb = editPkgServicesDropdownMenu.querySelector(`input[value="${id}"]`);
                        if (cb) cb.checked = false;
                        window.updateEditPackageServicesChips();
                    });
                    
                    chip.appendChild(document.createTextNode(svc.service_name || svc.name));
                    chip.appendChild(xBtn);
                    chipsContainer.appendChild(chip);
                }
            });
            if (window.feather) feather.replace();
        }
    };

    window.openEditPackageModal = async (pkgId) => {
        const pkg = window.livePackagesData.find(p => p.package_id === pkgId);
        if (!pkg) return;

        document.getElementById('editPkgId').value = pkg.package_id;
        document.getElementById('editPkgName').value = pkg.package_name;
        document.getElementById('editPkgOriginalPrice').value = pkg.original_price;
        document.getElementById('editPkgFinalPrice').value = pkg.final_price;
        document.getElementById('editPkgDescription').value = pkg.description || '';
        
        const statusRadios = document.querySelectorAll('input[name="editPkgStatus"]');
        statusRadios.forEach(r => r.checked = (r.value === String(pkg.is_active)));

        // Fetch selected services
        try {
            const { data, error } = await supabase
                .from('package_services')
                .select('service_id')
                .eq('package_id', pkg.package_id);
            
            if (error) throw error;
            
            editSelectedPackageServices.clear();
            if (data) {
                data.forEach(d => editSelectedPackageServices.add(d.service_id));
            }
        } catch(err) {
            console.error('Error fetching package services:', err);
        }

        window.populateEditPackageServicesDropdown();
        window.updateEditPackageServicesChips();
        
        document.getElementById('editPackageModal').classList.add('active');
    };

    const editPkgForm = document.getElementById('editPackageForm');
    if (editPkgForm) {
        editPkgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (editSelectedPackageServices.size === 0) {
                window.toast && window.toast('Please select at least one service.');
                return;
            }

            const pkgId = document.getElementById('editPkgId').value;
            const payload = {
                package_name: document.getElementById('editPkgName').value.trim(),
                description: document.getElementById('editPkgDescription').value.trim(),
                original_price: parseFloat(document.getElementById('editPkgOriginalPrice').value),
                final_price: parseFloat(document.getElementById('editPkgFinalPrice').value),
                services_count: editSelectedPackageServices.size,
                is_active: document.querySelector('input[name="editPkgStatus"]:checked').value === 'true'
            };

            const btn = document.querySelector('button[form="editPackageForm"]');
            const originalText = btn ? btn.textContent : 'Update Package';
            if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

            try {
                // Update Package
                const { error: pkgError } = await supabase
                    .from('packages')
                    .update(payload)
                    .eq('package_id', pkgId);

                if (pkgError) throw pkgError;

                // Delete old package services
                const { error: delError } = await supabase
                    .from('package_services')
                    .delete()
                    .eq('package_id', pkgId);
                
                if (delError) throw delError;

                // Insert new package services
                const psPayloads = Array.from(editSelectedPackageServices).map(svcId => {
                    const svc = (window.liveServicesData || []).find(s => (s.service_id || s.id) === svcId);
                    return {
                        package_id: pkgId,
                        service_id: svcId,
                        service_name: svc ? (svc.service_name || svc.name) : 'Unknown Service'
                    };
                });

                const { error: psError } = await supabase
                    .from('package_services')
                    .insert(psPayloads);

                if (psError) throw psError;

                window.toast && window.toast('Package updated successfully!');
                document.getElementById('editPackageModal').classList.remove('active');
                if (window.fetchPackages) await window.fetchPackages();
            } catch (err) {
                console.error(err);
                window.toast && window.toast('Error updating package: ' + err.message);
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    const deletePkgOverlay = document.getElementById('deletePackageConfirmOverlay');
    let packageToDelete = null;

    if (deletePkgOverlay) {
        document.getElementById('btnCancelDeletePackage').addEventListener('click', () => {
            deletePkgOverlay.classList.remove('active');
            packageToDelete = null;
        });

        deletePkgOverlay.addEventListener('click', (e) => {
            if (e.target === deletePkgOverlay) {
                deletePkgOverlay.classList.remove('active');
                packageToDelete = null;
            }
        });

        document.getElementById('btnConfirmDeletePackage').addEventListener('click', async () => {
            if (!packageToDelete) return;
            
            deletePkgOverlay.classList.remove('active');
            const loader = document.getElementById('fullScreenDeleteServiceLoader');
            if (loader) loader.classList.add('active');
            
            try {
                // Cascading delete handles package_services
                const { error: deleteError } = await supabase
                    .from('packages')
                    .delete()
                    .eq('package_id', packageToDelete.id);

                if (!deleteError) {
                    window.toast && window.toast('Package deleted successfully!');
                    if (window.fetchPackages) await window.fetchPackages();
                } else {
                    window.toast && window.toast('Error deleting package: ' + deleteError.message);
                }
            } catch (err) {
                console.error('Error deleting package:', err);
                window.toast && window.toast('Error: ' + (err.message || 'Unknown error deleting package'));
            } finally {
                if (loader) loader.classList.remove('active');
                packageToDelete = null;
            }
        });
    }

    window.triggerDeletePackage = (pkgId, pkgName) => {
        packageToDelete = { id: pkgId, name: pkgName };
        const overlay = document.getElementById('deletePackageConfirmOverlay');
        if (overlay) overlay.classList.add('active');
    };
}

// Function to populate edit category dropdown from categories data
window.populateCategoryDropdownExForEdit = () => {
    const sel = document.getElementById('editSfCategory');
    if (!sel || !window.liveCategoriesData) return;
    
    const currentVal = sel.value;
    
    sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
    window.liveCategoriesData.filter(c => c.status === 'active').forEach(c => {
        const o = document.createElement('option');
        o.value = c.category_name || c.name;
        o.textContent = c.category_name || c.name;
        o.dataset.id = c.id || c.category_id || '';
        sel.appendChild(o);
    });
    
    if (currentVal && Array.from(sel.options).some(opt => opt.value === currentVal)) {
        sel.value = currentVal;
    }
}

export async function fetchServices() {
    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        let query = supabase
            .from('services')
            .select('*')
            .order('service_name', { ascending: true });
        
        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        
        liveServicesData = (data || [])
            .map(s => ({ ...s, status: (s.status || '').trim() }))
            .filter(s => s.status && s.status.toLowerCase() !== 'deleted');
        
        window.liveServicesData = liveServicesData;
        if (window.renderSvc) window.renderSvc(liveServicesData);
        if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();
        
        const countEl = document.getElementById('countServices');
        if (countEl) {
            countEl.textContent = liveServicesData.length;
        }
    } catch (err) {
        console.error('Network Error fetching services:', err);
        if (window.renderSvc) window.renderSvc(liveServicesData || []);
    }
}

window.fetchPackages = async function() {
    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        let query = supabase
            .from('packages')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        
        livePackagesData = data || [];
        window.livePackagesData = livePackagesData;
        
        if (window.renderPackages) window.renderPackages(livePackagesData);
        
        const countEl = document.getElementById('countPackages');
        if (countEl) {
            countEl.textContent = livePackagesData.length;
        }
    } catch (err) {
        console.error('Network Error fetching packages:', err);
        if (window.renderPackages) window.renderPackages(livePackagesData || []);
    }
};


