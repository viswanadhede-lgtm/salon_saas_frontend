// scripts/services/services-crud.js
// CRUD event listeners and submit/delete workflows for Services and Packages.
// Preserves exact duplicate checks, payloads, dual-key updates, and notification triggers.

import {
    servicesState,
    getCompanyId,
    getBranchId
} from './services-state.js';
import {
    insertService,
    updateService,
    softDeleteService,
    insertPackage,
    insertPackageServices,
    updatePackage,
    deletePackageServices,
    deletePackage,
    fetchServices,
    fetchPackages
} from './services-api.js';
import { updatePackageServicesChips } from './services-packages.js';

export function attachEventListeners() {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. ADD SERVICE FORM
    // ─────────────────────────────────────────────────────────────────────────
    const addSvcForm = document.getElementById('addServiceForm');
    if (addSvcForm) {
        addSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serviceName = document.getElementById('sfSvcName').value.trim();
            const nameLower = serviceName.toLowerCase();

            // Duplicate Check
            const categoryName = document.getElementById('sfCategory').value.toLowerCase();
            const exists = servicesState.liveServicesData.find(s => 
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
                const { error } = await insertService(payload);
                
                if (!error) {
                    window.toast && window.toast('Service added successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_service_created', {
                            title: 'New Service Created',
                            message: `${payload.service_name} was created.`
                        });
                    }
                    // Marketing Notifications: notify customers
                    if (window.notifyCustomer) {
                        window.notifyCustomer('new_service_added', {
                            title: 'New Service Available!',
                            message: `We just added a new service: ${payload.service_name}`,
                            serviceName: payload.service_name
                        });
                    }
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

    // ─────────────────────────────────────────────────────────────────────────
    // 2. EDIT SERVICE FORM & MODAL
    // ─────────────────────────────────────────────────────────────────────────
    const editSvcModal = document.getElementById('editServiceModal');
    const editSvcForm = document.getElementById('editServiceForm');
    
    const closeBtn = document.getElementById('btnCloseEditServiceModal');
    if (closeBtn) closeBtn.addEventListener('click', () => editSvcModal.classList.remove('active'));
    
    const cancelBtn = document.getElementById('btnCancelEditService');
    if (cancelBtn) cancelBtn.addEventListener('click', () => editSvcModal.classList.remove('active'));
    
    if (editSvcModal) {
        editSvcModal.addEventListener('click', (e) => {
            if (e.target === editSvcModal) editSvcModal.classList.remove('active');
        });
    }
    
    if (editSvcForm) {
        editSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serviceId = document.getElementById('editServiceId').value;
            const newServiceName = document.getElementById('editSfSvcName').value.trim();
            const nameLower = newServiceName.toLowerCase();

            // Duplicate Check
            const categoryName = document.getElementById('editSfCategory').value.toLowerCase();
            const exists = servicesState.liveServicesData.find(s => 
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
                const { error: updateError } = await updateService(serviceId, payload);

                if (!updateError) {
                    window.toast && window.toast('Service updated successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_service_updated', {
                            title: 'Service Updated',
                            message: `${payload.service_name} details were updated.`
                        });
                    }
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
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DELETE SERVICE CONFIRMATION
    // ─────────────────────────────────────────────────────────────────────────
    const deleteOverlay = document.getElementById('deleteServiceConfirmOverlay');
    const fullScreenLoader = document.getElementById('fullScreenDeleteServiceLoader');

    const cancelDeleteSvcBtn = document.getElementById('btnCancelDeleteService');
    if (cancelDeleteSvcBtn) {
        cancelDeleteSvcBtn.addEventListener('click', () => {
            if (deleteOverlay) deleteOverlay.classList.remove('active');
            servicesState.serviceToDelete = null;
        });
    }

    if (deleteOverlay) {
        deleteOverlay.addEventListener('click', (e) => {
            if (e.target === deleteOverlay) {
                deleteOverlay.classList.remove('active');
                servicesState.serviceToDelete = null;
            }
        });
    }

    const confirmDeleteSvcBtn = document.getElementById('btnConfirmDeleteService');
    if (confirmDeleteSvcBtn) {
        confirmDeleteSvcBtn.addEventListener('click', async () => {
            if (!servicesState.serviceToDelete) return;
            
            if (deleteOverlay) deleteOverlay.classList.remove('active');
            if (fullScreenLoader) fullScreenLoader.classList.add('active');
            
            try {
                const { error: deleteError } = await softDeleteService(servicesState.serviceToDelete.id);

                if (!deleteError) {
                    window.toast && window.toast('Service deleted successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_service_deleted', {
                            title: 'Service Deleted',
                            message: `${servicesState.serviceToDelete?.name || 'Service'} was deleted.`
                        });
                    }
                    await fetchServices();
                } else {
                    console.error('Delete failed:', deleteError);
                    window.toast && window.toast('Error deleting service: ' + deleteError.message);
                }
            } catch (err) {
                console.error('Error deleting service:', err);
                window.toast && window.toast('Error: ' + (err.message || 'Unknown error deleting service'));
            } finally {
                if (fullScreenLoader) fullScreenLoader.classList.remove('active');
                servicesState.serviceToDelete = null;
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. ADD PACKAGE FORM
    // ─────────────────────────────────────────────────────────────────────────
    const addPkgForm = document.getElementById('addPackageForm');
    if (addPkgForm) {
        addPkgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (servicesState.selectedPackageServices.size === 0) {
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
                services_count: servicesState.selectedPackageServices.size,
                is_active: document.querySelector('input[name="pkgStatus"]:checked').value === 'true'
            };

            const btn = document.querySelector('button[form="addPackageForm"]');
            const originalText = btn ? btn.textContent : 'Save Package';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

            try {
                const { data: pkgData, error: pkgError } = await insertPackage(payload);

                if (pkgError) throw pkgError;

                if (pkgData && pkgData.length > 0) {
                    const newPkgId = pkgData[0].package_id;
                    const psPayloads = Array.from(servicesState.selectedPackageServices).map(svcId => {
                        const svc = (window.liveServicesData || servicesState.liveServicesData || []).find(s => (s.service_id || s.id) === svcId);
                        return {
                            package_id: newPkgId,
                            service_id: svcId,
                            service_name: svc ? (svc.service_name || svc.name) : 'Unknown Service'
                        };
                    });

                    const { error: psError } = await insertPackageServices(psPayloads);

                    if (psError) throw psError;

                    window.toast && window.toast('Package added successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_package_created', {
                            title: 'New Package Created',
                            message: `${payload.package_name} was created.`
                        });
                    }
                    document.getElementById('addPackageModal').classList.remove('active');
                    addPkgForm.reset();
                    servicesState.selectedPackageServices.clear();
                    updatePackageServicesChips();
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

    // ─────────────────────────────────────────────────────────────────────────
    // 5. EDIT PACKAGE FORM
    // ─────────────────────────────────────────────────────────────────────────
    const editPkgForm = document.getElementById('editPackageForm');
    if (editPkgForm) {
        editPkgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (servicesState.editSelectedPackageServices.size === 0) {
                window.toast && window.toast('Please select at least one service.');
                return;
            }

            const pkgId = document.getElementById('editPkgId').value;
            const payload = {
                package_name: document.getElementById('editPkgName').value.trim(),
                description: document.getElementById('editPkgDescription').value.trim(),
                original_price: parseFloat(document.getElementById('editPkgOriginalPrice').value),
                final_price: parseFloat(document.getElementById('editPkgFinalPrice').value),
                services_count: servicesState.editSelectedPackageServices.size,
                is_active: document.querySelector('input[name="editPkgStatus"]:checked').value === 'true'
            };

            const btn = document.querySelector('button[form="editPackageForm"]');
            const originalText = btn ? btn.textContent : 'Update Package';
            if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

            try {
                // 1. Update Package
                const { error: pkgError } = await updatePackage(pkgId, payload);
                if (pkgError) throw pkgError;

                // 2. Delete old package services
                const { error: delError } = await deletePackageServices(pkgId);
                if (delError) throw delError;

                // 3. Insert new package services
                const psPayloads = Array.from(servicesState.editSelectedPackageServices).map(svcId => {
                    const svc = (window.liveServicesData || servicesState.liveServicesData || []).find(s => (s.service_id || s.id) === svcId);
                    return {
                        package_id: pkgId,
                        service_id: svcId,
                        service_name: svc ? (svc.service_name || svc.name) : 'Unknown Service'
                    };
                });

                const { error: psError } = await insertPackageServices(psPayloads);
                if (psError) throw psError;

                window.toast && window.toast('Package updated successfully!');
                if (window.notifyEvent) {
                    window.notifyEvent('services', 'evt_package_updated', {
                        title: 'Package Updated',
                        message: `${payload.package_name} was updated.`
                    });
                }
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

    // ─────────────────────────────────────────────────────────────────────────
    // 6. DELETE PACKAGE CONFIRMATION
    // ─────────────────────────────────────────────────────────────────────────
    const deletePkgOverlay = document.getElementById('deletePackageConfirmOverlay');

    if (deletePkgOverlay) {
        const cancelDeletePkgBtn = document.getElementById('btnCancelDeletePackage');
        if (cancelDeletePkgBtn) {
            cancelDeletePkgBtn.addEventListener('click', () => {
                deletePkgOverlay.classList.remove('active');
                servicesState.packageToDelete = null;
            });
        }

        deletePkgOverlay.addEventListener('click', (e) => {
            if (e.target === deletePkgOverlay) {
                deletePkgOverlay.classList.remove('active');
                servicesState.packageToDelete = null;
            }
        });

        const confirmDeletePkgBtn = document.getElementById('btnConfirmDeletePackage');
        if (confirmDeletePkgBtn) {
            confirmDeletePkgBtn.addEventListener('click', async () => {
                if (!servicesState.packageToDelete) return;
                
                deletePkgOverlay.classList.remove('active');
                // S5: Reuse fullScreenDeleteServiceLoader preserved
                const loader = document.getElementById('fullScreenDeleteServiceLoader');
                if (loader) loader.classList.add('active');
                
                try {
                    // Cascading delete handles package_services
                    const { error: deleteError } = await deletePackage(servicesState.packageToDelete.id);

                    if (!deleteError) {
                        window.toast && window.toast('Package deleted successfully!');
                        if (window.notifyEvent) {
                            window.notifyEvent('services', 'evt_package_deleted', {
                                title: 'Package Deleted',
                                message: `${servicesState.packageToDelete?.name || 'Package'} was deleted.`
                            });
                        }
                        if (window.fetchPackages) await window.fetchPackages();
                    } else {
                        window.toast && window.toast('Error deleting package: ' + deleteError.message);
                    }
                } catch (err) {
                    console.error('Error deleting package:', err);
                    window.toast && window.toast('Error: ' + (err.message || 'Unknown error deleting package'));
                } finally {
                    if (loader) loader.classList.remove('active');
                    servicesState.packageToDelete = null;
                }
            });
        }
    }
}
