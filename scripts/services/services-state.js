// scripts/services/services-state.js
// Shared state module for Services & Packages.
// Single source of truth. No internal dependencies.

export const servicesState = {
    liveServicesData: [],
    livePackagesData: [],
    serviceToDelete: null,
    packageToDelete: null,
    selectedPackageServices: new Set(),
    editSelectedPackageServices: new Set()
};

// Mirror on window to maintain external cross-file contract
window.liveServicesData = servicesState.liveServicesData;
window.livePackagesData = servicesState.livePackagesData;

export function setLiveServicesData(data) {
    servicesState.liveServicesData = data;
    window.liveServicesData = data;
}

export function setLivePackagesData(data) {
    servicesState.livePackagesData = data;
    window.livePackagesData = data;
}

// Helpers
export function getCompanyId() {
    return localStorage.getItem('company_id') || null;
}

export function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}
