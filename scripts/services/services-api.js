// scripts/services/services-api.js
// Supabase data-access layer for Services, Packages, and Package Services.
// Preserves exact queries, scoping, and dual-key fallbacks.

import { supabase } from '../../lib/supabase.js';
import {
    servicesState,
    setLiveServicesData,
    setLivePackagesData,
    getCompanyId,
    getBranchId
} from './services-state.js';

// ─────────────────────────────────────────────────────────────────────────────
// READ OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchServicesFromDb() {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        console.warn('Cannot fetch services: missing company_id or branch_id context');
        return { data: [], error: { message: 'Missing company or branch context' } };
    }

    return await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .neq('status', 'deleted')
        .order('service_name', { ascending: true });
}

export async function fetchPackagesFromDb() {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    let query = supabase
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);
    if (branchId) query = query.eq('branch_id', branchId);

    return await query;
}

export async function fetchPackageServicesForEdit(packageId) {
    return await supabase
        .from('package_services')
        .select('service_id')
        .eq('package_id', packageId);
}

export async function fetchPackageServicesForBreakdown(packageId) {
    return await supabase
        .from('package_services')
        .select('service_name')
        .eq('package_id', packageId);
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE OPERATIONS & DEPENDENCY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

export async function insertService(payload) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    return await supabase
        .from('services')
        .insert(payload);
}

export async function updateService(serviceId, payload) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase
        .from('services')
        .update(payload)
        .eq('service_id', serviceId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId);

    if (!error && (!data || data.length === 0)) {
        return { data: null, error: { message: 'No matching service found to update for this company and branch.' } };
    }

    return { data, error };
}

export async function checkServiceDependencies(serviceId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    // 1. Check if referenced in packages
    try {
        const { data: pkgServices, error: psError } = await supabase
            .from('package_services')
            .select('package_id, service_name')
            .eq('service_id', serviceId);

        if (!psError && pkgServices && pkgServices.length > 0) {
            const pkgIds = pkgServices.map(ps => ps.package_id).filter(Boolean);
            if (pkgIds.length > 0) {
                let pkgQuery = supabase
                    .from('packages')
                    .select('package_id, package_name, is_active')
                    .in('package_id', pkgIds)
                    .eq('is_active', true);
                if (companyId) pkgQuery = pkgQuery.eq('company_id', companyId);
                if (branchId) pkgQuery = pkgQuery.eq('branch_id', branchId);

                const { data: activePkgs, error: pError } = await pkgQuery;
                if (!pError && activePkgs && activePkgs.length > 0) {
                    const pkgNames = activePkgs.map(p => p.package_name).join(', ');
                    return {
                        hasDependency: true,
                        reason: `Cannot delete this service because it is currently included in active package(s): ${pkgNames}. Please remove it from the package(s) or deactivate them first.`
                    };
                }
            }
        }
    } catch (e) {
        console.warn('Error checking package dependencies:', e);
    }

    // 2. Check if referenced in future active bookings
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let bookingQuery = supabase
            .from('bookings')
            .select('booking_id, booking_date, status')
            .eq('service_id', serviceId)
            .eq('status', 'booked')
            .gte('booking_date', todayStr);

        if (companyId) bookingQuery = bookingQuery.eq('company_id', companyId);
        if (branchId) bookingQuery = bookingQuery.eq('branch_id', branchId);

        const { data: futureBookings, error: bError } = await bookingQuery;
        if (!bError && futureBookings && futureBookings.length > 0) {
            return {
                hasDependency: true,
                reason: `Cannot delete this service because there are ${futureBookings.length} upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first.`
            };
        }
    } catch (e) {
        console.warn('Error checking booking dependencies:', e);
    }

    return { hasDependency: false, reason: null };
}

export async function softDeleteService(serviceId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const payload = {
        status: 'deleted',
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('services')
        .update(payload)
        .eq('service_id', serviceId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId);

    if (!error && (!data || data.length === 0)) {
        return { data: null, error: { message: 'No matching service found to delete for this company and branch.' } };
    }

    return { data, error };
}

export async function insertPackage(payload) {
    return await supabase
        .from('packages')
        .insert(payload)
        .select();
}

export async function insertPackageServices(psPayloads) {
    return await supabase
        .from('package_services')
        .insert(psPayloads);
}

export async function updatePackage(pkgId, payload) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase
        .from('packages')
        .update(payload)
        .eq('package_id', pkgId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId);

    if (!error && (!data || data.length === 0)) {
        return { data: null, error: { message: 'No matching package found to update for this company and branch.' } };
    }

    return { data, error };
}

export async function deletePackageServices(pkgId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    return await supabase
        .from('package_services')
        .delete()
        .eq('package_id', pkgId);
}

export async function deletePackage(pkgId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase
        .from('packages')
        .delete()
        .eq('package_id', pkgId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId);

    if (!error && (!data || data.length === 0)) {
        return { data: null, error: { message: 'No matching package found to delete for this company and branch.' } };
    }

    return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH SERVICES & PACKAGES WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchServices() {
    try {
        const { data, error } = await fetchServicesFromDb();
        if (error) {
            console.error('Error fetching services:', error.message || error);
            if (window.toast) window.toast('Error loading services: ' + (error.message || 'Check connection'));
            const cached = servicesState.liveServicesData;
            if (!cached || cached.length === 0) {
                setLiveServicesData([]);
                if (window.renderSvc) window.renderSvc([]);
                const countEl = document.getElementById('countServices');
                if (countEl) countEl.textContent = '0';
            } else {
                if (window.applyServiceFilters) {
                    window.applyServiceFilters();
                } else if (window.renderSvc) {
                    window.renderSvc(cached);
                }
                const countEl = document.getElementById('countServices');
                if (countEl) countEl.textContent = cached.length;
            }
            return { data: null, error };
        }

        const liveServicesData = (data || [])
            .map(s => ({ ...s, status: (s.status || '').trim() }))
            .filter(s => s.status && s.status.toLowerCase() !== 'deleted');

        setLiveServicesData(liveServicesData);

        if (window.applyServiceFilters) {
            window.applyServiceFilters();
        } else if (window.renderSvc) {
            window.renderSvc(liveServicesData);
        }
        if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();
        if (window.liveCategoriesData && window.liveCategoriesData.length && window.renderCat) {
            window.renderCat(window.liveCategoriesData);
        }

        const countEl = document.getElementById('countServices');
        if (countEl) {
            countEl.textContent = liveServicesData.length;
        }
        return { data: liveServicesData, error: null };
    } catch (err) {
        console.error('Network Error fetching services:', err);
        if (window.toast) window.toast('Network error loading services');
        const cached = servicesState.liveServicesData;
        if (!cached || cached.length === 0) {
            setLiveServicesData([]);
            if (window.renderSvc) window.renderSvc([]);
            const countEl = document.getElementById('countServices');
            if (countEl) countEl.textContent = '0';
        } else {
            if (window.applyServiceFilters) {
                window.applyServiceFilters();
            } else if (window.renderSvc) {
                window.renderSvc(cached);
            }
            const countEl = document.getElementById('countServices');
            if (countEl) countEl.textContent = cached.length;
        }
        return { data: null, error: err };
    }
}

export async function fetchPackages() {
    try {
        const { data, error } = await fetchPackagesFromDb();
        if (error) throw new Error(error.message);

        const livePackagesData = data || [];
        setLivePackagesData(livePackagesData);

        if (window.renderPackages) window.renderPackages(livePackagesData);

        const countEl = document.getElementById('countPackages');
        if (countEl) {
            countEl.textContent = livePackagesData.length;
        }
    } catch (err) {
        console.error('Network Error fetching packages:', err);
        if (window.renderPackages) window.renderPackages(servicesState.livePackagesData || []);
    }
}

export async function openPkgServicesModalInner(pkgId, pkgName) {
    const title = document.getElementById('pkgServicesModalTitle');
    const body = document.getElementById('pkgServicesModalBody');
    try {
        const { data: rows, error } = await fetchPackageServicesForBreakdown(pkgId);
        if (error) throw error;

        const services = (rows || []).filter(r => r.service_name);
        title.innerHTML = `${pkgName} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">${services.length}</span>`;

        if (!services.length) {
            body.innerHTML = '<tr><td style="padding:40px;text-align:center;color:#64748b;font-weight:500;">No services included in this package.</td></tr>';
        } else {
            body.innerHTML = services.map(r => `
                <tr class="tb-row">
                    <td style="padding:14px 16px 14px 20px;font-weight:600;color:#1e293b;font-size:0.87rem;">${r.service_name}</td>
                </tr>`
            ).join('');
        }
    } catch (err) {
        console.error('Error fetching package services:', err);
        title.innerHTML = pkgName;
        body.innerHTML = '<tr><td style="padding:40px;text-align:center;color:#ef4444;">Failed to load services.</td></tr>';
    }
}
