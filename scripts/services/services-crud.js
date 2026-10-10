// scripts/services/services-crud.js
// CRUD event listeners and submit/delete workflows for Services and Packages.

import {
    servicesState,
    getCompanyId,
    getBranchId
} from './services-state.js';
import {
    insertService,
    updateService,
    softDeleteService,
    checkServiceDependencies,
    insertPackage,
    insertPackageServices,
    updatePackage,
    deletePackageServices,
    createPackageAtomic,
    updatePackageAtomic,
    checkPackageDependencies,
    deletePackage,
    fetchServices,
    fetchPackages
} from './services-api.js';
import { updatePackageServicesChips } from './services-packages.js';

let isSubmittingService = false;
let isUpdatingService = false;
let isDeletingService = false;

export function attachEventListeners() {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. ADD SERVICE FORM
    // ─────────────────────────────────────────────────────────────────────────
    const addSvcForm = document.getElementById('addServiceForm');
    if (addSvcForm) {
        addSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isSubmittingService) return;

            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId || !branchId) {
                window.toast && window.toast('Missing company or branch context. Please reload or select a branch.');
                return;
            }

            const serviceNameInput = document.getElementById('sfSvcName');
            const serviceName = (serviceNameInput?.value || '').trim();
            if (!serviceName) {
                window.toast && window.toast('Please enter a service name.');
                serviceNameInput?.focus();
                return;
            }

            const categorySelect = document.getElementById('sfCategory');
            const categoryId = categorySelect?.value || '';
            const categoryName = categorySelect?.selectedOptions[0]?.dataset.name || categorySelect?.selectedOptions[0]?.textContent || '';

            if (!categoryId || categoryId === 'Select a category') {
                window.toast && window.toast('Please select a valid category.');
                categorySelect?.focus();
                return;
            }

            const durationInput = document.getElementById('sfDuration');
            const duration = parseInt(durationInput?.value, 10);
            if (isNaN(duration) || duration < 5 || duration % 5 !== 0) {
                window.toast && window.toast('Duration must be at least 5 minutes and in increments of 5.');
                durationInput?.focus();
                return;
            }

            const priceInput = document.getElementById('sfPrice');
            const price = parseFloat(priceInput?.value);
            if (isNaN(price) || price < 0) {
                window.toast && window.toast('Price must be a valid non-negative number.');
                priceInput?.focus();
                return;
            }

            // Usability Duplicate Check (case-insensitive name within intended category)
            const nameLower = serviceName.toLowerCase();
            const exists = (servicesState.liveServicesData || []).find(s => 
                (s.service_name || s.name || '').trim().toLowerCase() === nameLower &&
                (s.category_id === categoryId || (s.category_name || s.category || '').trim().toLowerCase() === categoryName.trim().toLowerCase())
            );
            if (exists) {
                window.toast && window.toast('A service with this name already exists in this category.');
                return;
            }

            const payload = {
                company_id: companyId,
                branch_id: branchId,
                service_name: serviceName,
                category_id: categoryId,
                category_name: categoryName,
                duration: duration,
                price: price,
                status: document.querySelector('input[name="sfStatus"]:checked')?.value || 'active',
                description: (document.getElementById('sfDescription')?.value || '').trim()
            };
            
            const btn = document.querySelector('button[form="addServiceForm"]');
            const originalText = btn ? btn.textContent : 'Save Service';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            isSubmittingService = true;
            
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
                    if (window.notifyCustomer) {
                        window.notifyCustomer('new_service_added', {
                            title: 'New Service Available!',
                            message: `We just added a new service: ${payload.service_name}`,
                            serviceName: payload.service_name
                        });
                    }
                    document.getElementById('addServiceModal')?.classList.remove('active');
                    addSvcForm.reset();
                    await fetchServices();
                } else {
                    window.toast && window.toast('Error adding service: ' + error.message);
                }
            } catch (err) {
                console.error('Error adding service:', err);
                window.toast && window.toast('Network error saving service');
            } finally {
                isSubmittingService = false;
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
    if (closeBtn) closeBtn.addEventListener('click', () => editSvcModal?.classList.remove('active'));
    
    const cancelBtn = document.getElementById('btnCancelEditService');
    if (cancelBtn) cancelBtn.addEventListener('click', () => editSvcModal?.classList.remove('active'));
    
    if (editSvcModal) {
        editSvcModal.addEventListener('click', (e) => {
            if (e.target === editSvcModal) editSvcModal.classList.remove('active');
        });
    }
    
    if (editSvcForm) {
        editSvcForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isUpdatingService) return;

            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId || !branchId) {
                window.toast && window.toast('Missing company or branch context. Please reload or select a branch.');
                return;
            }

            const serviceId = document.getElementById('editServiceId')?.value;
            if (!serviceId) {
                window.toast && window.toast('Missing service identifier.');
                return;
            }

            const nameInput = document.getElementById('editSfSvcName');
            const newServiceName = (nameInput?.value || '').trim();
            if (!newServiceName) {
                window.toast && window.toast('Please enter a service name.');
                nameInput?.focus();
                return;
            }

            const categorySelect = document.getElementById('editSfCategory');
            const categoryId = categorySelect?.value || '';
            const categoryName = categorySelect?.selectedOptions[0]?.dataset.name || categorySelect?.selectedOptions[0]?.textContent || '';

            if (!categoryId || categoryId === 'Select a category') {
                window.toast && window.toast('Please select a valid category.');
                categorySelect?.focus();
                return;
            }

            const durationInput = document.getElementById('editSfDuration');
            const duration = parseInt(durationInput?.value, 10);
            if (isNaN(duration) || duration < 5 || duration % 5 !== 0) {
                window.toast && window.toast('Duration must be at least 5 minutes and in increments of 5.');
                durationInput?.focus();
                return;
            }

            const priceInput = document.getElementById('editSfPrice');
            const price = parseFloat(priceInput?.value);
            if (isNaN(price) || price < 0) {
                window.toast && window.toast('Price must be a valid non-negative number.');
                priceInput?.focus();
                return;
            }

            // Usability Duplicate Check (excluding current service)
            const nameLower = newServiceName.toLowerCase();
            const exists = (servicesState.liveServicesData || []).find(s => 
                (s.service_name || s.name || '').trim().toLowerCase() === nameLower && 
                (s.category_id === categoryId || (s.category_name || s.category || '').trim().toLowerCase() === categoryName.trim().toLowerCase()) &&
                String(s.service_id) !== String(serviceId)
            );
            if (exists) {
                window.toast && window.toast('A service with this name already exists in this category.');
                return;
            }

            const payload = {
                service_name: newServiceName,
                category_id: categoryId,
                category_name: categoryName,
                duration: duration,
                price: price,
                status: document.querySelector('input[name="editSfStatus"]:checked')?.value || 'active',
                description: (document.getElementById('editSfDescription')?.value || '').trim(),
                updated_at: new Date().toISOString()
            };
            
            const btn = document.querySelector('button[form="editServiceForm"]');
            const originalText = btn ? btn.textContent : 'Update Service';
            if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }
            isUpdatingService = true;
            
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
                    editSvcModal?.classList.remove('active');
                    await fetchServices();
                } else {
                    window.toast && window.toast('Error updating service: ' + updateError.message);
                }
            } catch (err) {
                console.error('Error updating service:', err);
                window.toast && window.toast('Error: ' + (err.message || 'Unknown error updating service'));
            } finally {
                isUpdatingService = false;
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
            if (!servicesState.serviceToDelete || isDeletingService) return;
            
            const serviceId = servicesState.serviceToDelete.id;
            const serviceName = servicesState.serviceToDelete.name || 'Service';

            isDeletingService = true;
            if (confirmDeleteSvcBtn) confirmDeleteSvcBtn.disabled = true;

            try {
                // Dependency check before deletion (packages & bookings)
                const depCheck = await checkServiceDependencies(serviceId);
                if (depCheck.hasDependency) {
                    if (deleteOverlay) deleteOverlay.classList.remove('active');
                    window.toast && window.toast(depCheck.reason);
                    alert(depCheck.reason);
                    return;
                }

                if (deleteOverlay) deleteOverlay.classList.remove('active');
                if (fullScreenLoader) fullScreenLoader.classList.add('active');

                const { error: deleteError } = await softDeleteService(serviceId);

                if (!deleteError) {
                    window.toast && window.toast('Service deleted successfully!');
                    if (window.notifyEvent) {
                        window.notifyEvent('services', 'evt_service_deleted', {
                            title: 'Service Deleted',
                            message: `${serviceName} was deleted.`
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
                isDeletingService = false;
                if (confirmDeleteSvcBtn) confirmDeleteSvcBtn.disabled = false;
                if (fullScreenLoader) fullScreenLoader.classList.remove('active');
                servicesState.serviceToDelete = null;
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. ADD PACKAGE FORM (ATOMIC)
    // ─────────────────────────────────────────────────────────────────────────
    const addPkgForm = document.getElementById('addPackageForm');
    if (addPkgForm) {
        addPkgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (servicesState.selectedPackageServices.size === 0) {
                window.toast && window.toast('Please select at least one service.');
                return;
            }

            // ── Package Name Validation ──
            const pkgNameInput = document.getElementById('pkgName');
            const packageName = (pkgNameInput?.value || '').trim();
            if (!packageName) {
                window.toast && window.toast('Please enter a package name.');
                pkgNameInput?.focus();
                return;
            }

            // ── Price Validation ──
            const originalPriceInput = document.getElementById('pkgOriginalPrice');
            const finalPriceInput = document.getElementById('pkgFinalPrice');
            const originalPrice = parseFloat(originalPriceInput?.value);
            const finalPrice = parseFloat(finalPriceInput?.value);

            if (!Number.isFinite(originalPrice) || originalPrice < 0) {
                window.toast && window.toast('Original price must be a valid non-negative number.');
                originalPriceInput?.focus();
                return;
            }
            if (!Number.isFinite(finalPrice) || finalPrice < 0) {
                window.toast && window.toast('Final price must be a valid non-negative number.');
                finalPriceInput?.focus();
                return;
            }
            if (finalPrice > originalPrice) {
                window.toast && window.toast('Final price cannot exceed the original price.');
                finalPriceInput?.focus();
                return;
            }

            // ── Duplicate Package Name Check (usability; database is authoritative) ──
            const pkgNameLower = packageName.toLowerCase();
            const duplicatePkg = (servicesState.livePackagesData || []).find(p =>
                (p.package_name || '').trim().toLowerCase() === pkgNameLower &&
                (p.status || '').toLowerCase() !== 'deleted'
            );
            if (duplicatePkg) {
                window.toast && window.toast('A package with this name already exists.');
                pkgNameInput?.focus();
                return;
            }

            const payload = {
                package_name: packageName,
                description: document.getElementById('pkgDescription').value.trim(),
                original_price: originalPrice,
                final_price: finalPrice,
                is_active: document.querySelector('input[name="pkgStatus"]:checked').value === 'true',
                service_ids: Array.from(servicesState.selectedPackageServices)
            };

            const btn = document.querySelector('button[form="addPackageForm"]');
            const originalText = btn ? btn.textContent : 'Save Package';
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

            try {
                const { data: pkgData, error: pkgError } = await createPackageAtomic(payload);

                if (pkgError) throw pkgError;

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
            } catch (err) {
                console.error(err);
                window.toast && window.toast('Error adding package: ' + (err.message || 'Operation failed'));
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. EDIT PACKAGE FORM (ATOMIC)
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

            // ── Package Name Validation ──
            const editPkgNameInput = document.getElementById('editPkgName');
            const editPackageName = (editPkgNameInput?.value || '').trim();
            if (!editPackageName) {
                window.toast && window.toast('Please enter a package name.');
                editPkgNameInput?.focus();
                return;
            }

            // ── Price Validation ──
            const editOriginalPriceInput = document.getElementById('editPkgOriginalPrice');
            const editFinalPriceInput = document.getElementById('editPkgFinalPrice');
            const editOriginalPrice = parseFloat(editOriginalPriceInput?.value);
            const editFinalPrice = parseFloat(editFinalPriceInput?.value);

            if (!Number.isFinite(editOriginalPrice) || editOriginalPrice < 0) {
                window.toast && window.toast('Original price must be a valid non-negative number.');
                editOriginalPriceInput?.focus();
                return;
            }
            if (!Number.isFinite(editFinalPrice) || editFinalPrice < 0) {
                window.toast && window.toast('Final price must be a valid non-negative number.');
                editFinalPriceInput?.focus();
                return;
            }
            if (editFinalPrice > editOriginalPrice) {
                window.toast && window.toast('Final price cannot exceed the original price.');
                editFinalPriceInput?.focus();
                return;
            }

            // ── Duplicate Package Name Check (exclude current package; usability only) ──
            const editPkgNameLower = editPackageName.toLowerCase();
            const editDuplicatePkg = (servicesState.livePackagesData || []).find(p =>
                (p.package_name || '').trim().toLowerCase() === editPkgNameLower &&
                (p.status || '').toLowerCase() !== 'deleted' &&
                String(p.package_id) !== String(pkgId)
            );
            if (editDuplicatePkg) {
                window.toast && window.toast('A package with this name already exists.');
                editPkgNameInput?.focus();
                return;
            }

            const payload = {
                package_name: editPackageName,
                description: document.getElementById('editPkgDescription').value.trim(),
                original_price: editOriginalPrice,
                final_price: editFinalPrice,
                is_active: document.querySelector('input[name="editPkgStatus"]:checked').value === 'true',
                service_ids: Array.from(servicesState.editSelectedPackageServices)
            };

            const btn = document.querySelector('button[form="editPackageForm"]');
            const originalText = btn ? btn.textContent : 'Update Package';
            if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

            try {
                const { error: pkgError } = await updatePackageAtomic(pkgId, payload);
                if (pkgError) throw pkgError;

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
                window.toast && window.toast('Error updating package: ' + (err.message || 'Operation failed'));
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
                
                const pkgId = servicesState.packageToDelete.id;
                const pkgName = servicesState.packageToDelete.name || 'Package';

                deletePkgOverlay.classList.remove('active');
                // S5: Reuse fullScreenDeleteServiceLoader preserved
                const loader = document.getElementById('fullScreenDeleteServiceLoader');
                if (loader) loader.classList.add('active');
                
                try {
                    // Check future booking dependencies before soft deletion
                    const depCheck = await checkPackageDependencies(pkgId);
                    if (depCheck.error) {
                        if (loader) loader.classList.remove('active');
                        const errMsg = 'Error verifying booking dependencies: ' + (depCheck.error.message || 'Database error') + '. Deletion cancelled for safety.';
                        window.toast && window.toast(errMsg);
                        alert(errMsg);
                        return;
                    }
                    if (depCheck.hasDependency) {
                        if (loader) loader.classList.remove('active');
                        window.toast && window.toast(depCheck.reason);
                        alert(depCheck.reason);
                        return;
                    }

                    const { error: deleteError } = await deletePackage(pkgId);

                    if (!deleteError) {
                        window.toast && window.toast('Package deleted successfully!');
                        if (window.notifyEvent) {
                            window.notifyEvent('services', 'evt_package_deleted', {
                                title: 'Package Deleted',
                                message: `${pkgName} was deleted.`
                            });
                        }
                        if (window.fetchPackages) await window.fetchPackages();
                    } else {
                        window.toast && window.toast(deleteError.message || 'Error deleting package');
                        alert(deleteError.message);
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
