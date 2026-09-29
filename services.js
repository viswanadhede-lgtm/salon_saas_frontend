// services.js
// Thin orchestrator for Services & Packages module.
// Preserves export contracts, window APIs, initialization sequence, and pre-existing behaviors.

// S1: Unused registry imports preserved
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

import {
    servicesState
} from './scripts/services/services-state.js';

import {
    fetchServices,
    fetchPackages,
    openPkgServicesModalInner
} from './scripts/services/services-api.js';

import {
    setupModals,
    populateCategoryDropdownExForEdit,
    openEditServiceModal,
    triggerDeleteService
} from './scripts/services/services-modals.js';

import {
    initPackageDropdowns,
    populatePackageServicesDropdown,
    updatePackageServicesChips,
    populateEditPackageServicesDropdown,
    updateEditPackageServicesChips,
    openEditPackageModal,
    triggerDeletePackage
} from './scripts/services/services-packages.js';

import {
    attachEventListeners
} from './scripts/services/services-crud.js';

// ─────────────────────────────────────────────────────────────────────────────
// EXPOSE ALL 11 WINDOW APIS (Required by inline HTML onclicks & services.html)
// ─────────────────────────────────────────────────────────────────────────────

window.openEditServiceModal = openEditServiceModal;
window.triggerDeleteService = triggerDeleteService;

window.populatePackageServicesDropdown = populatePackageServicesDropdown;
window.updatePackageServicesChips = updatePackageServicesChips;
window.populateEditPackageServicesDropdown = populateEditPackageServicesDropdown;
window.updateEditPackageServicesChips = updateEditPackageServicesChips;
window.openEditPackageModal = openEditPackageModal;
window.triggerDeletePackage = triggerDeletePackage;

window.populateCategoryDropdownExForEdit = populateCategoryDropdownExForEdit;
window.fetchPackages = fetchPackages;
window._openPkgServicesModalInner = openPkgServicesModalInner;

// Mirror state properties on window
window.liveServicesData = servicesState.liveServicesData;
window.livePackagesData = servicesState.livePackagesData;

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CONTRACT (Consumed by services.html: import { initServices, fetchServices })
// ─────────────────────────────────────────────────────────────────────────────

export { fetchServices };

export async function initServices() {
    setupModals();
    initPackageDropdowns();
    attachEventListeners();
    await fetchServices();
    // S4: bare fetchPackages() reference preserved
    if (window.fetchPackages) await fetchPackages();
}
