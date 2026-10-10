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
        .neq('status', 'deleted')
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
        .eq('branch_id', branchId)
        .select();

    if (error) {
        return { data: null, error };
    }

    if (!data || data.length === 0) {
        return { data: null, error: { message: 'No matching service found to update for this company and branch.' } };
    }

    return { data, error: null };
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
                    .eq('is_active', true)
                    .neq('status', 'deleted');
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

export async function createPackageAtomic(payload) {
    const companyId = payload?.company_id || getCompanyId();
    const branchId = payload?.branch_id || getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const {
        package_name,
        description,
        original_price,
        final_price,
        is_active,
        service_ids
    } = payload;

    const { data, error } = await supabase.rpc('create_package_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_package_name: package_name,
        p_description: description || null,
        p_original_price: original_price,
        p_final_price: final_price,
        p_is_active: is_active !== false,
        p_service_ids: service_ids || []
    });

    if (error) {
        return { data: null, error };
    }

    return { data, error: null };
}

export async function updatePackageAtomic(pkgId, payload) {
    const companyId = payload?.company_id || getCompanyId();
    const branchId = payload?.branch_id || getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const {
        package_name,
        description,
        original_price,
        final_price,
        is_active,
        service_ids
    } = payload;

    const { data, error } = await supabase.rpc('update_package_atomic', {
        p_package_id: pkgId,
        p_company_id: companyId,
        p_branch_id: branchId,
        p_package_name: package_name,
        p_description: description || null,
        p_original_price: original_price,
        p_final_price: final_price,
        p_is_active: is_active !== false,
        p_service_ids: service_ids || []
    });

    if (error) {
        return { data: null, error };
    }

    return { data, error: null };
}

export async function insertPackage(payload) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const status = payload.is_active === false ? 'inactive' : 'active';

    return await supabase
        .from('packages')
        .insert({
            ...payload,
            company_id: companyId,
            branch_id: branchId,
            status: status
        })
        .select();
}

export async function insertPackageServices(psPayloads) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    if (!psPayloads || psPayloads.length === 0) {
        return { data: [], error: null };
    }

    // Verify parent package ownership in the active company and branch and ensure not deleted
    const pkgIds = [...new Set(psPayloads.map(p => p.package_id).filter(Boolean))];
    if (pkgIds.length === 0) {
        return { data: null, error: { message: 'No valid package_id provided in payloads.' } };
    }

    const { data: validPkgs, error: checkError } = await supabase
        .from('packages')
        .select('package_id')
        .in('package_id', pkgIds)
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .neq('status', 'deleted');

    if (checkError) {
        return { data: null, error: checkError };
    }

    const validPkgIdSet = new Set((validPkgs || []).map(p => p.package_id));
    const allValid = pkgIds.every(id => validPkgIdSet.has(id));
    if (!allValid) {
        return { data: null, error: { message: 'Cannot insert package services: package does not belong to active company and branch, or is deleted.' } };
    }

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

    const updatePayload = { ...payload };
    if ('is_active' in payload && !('status' in payload)) {
        updatePayload.status = payload.is_active ? 'active' : 'inactive';
    }
    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('packages')
        .update(updatePayload)
        .eq('package_id', pkgId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .neq('status', 'deleted')
        .select();

    if (error) {
        return { data: null, error };
    }

    if (!data || data.length === 0) {
        return { data: null, error: { message: 'No matching package found to update for this company and branch, or package is already deleted.' } };
    }

    return { data, error: null };
}

export async function deletePackageServices(pkgId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    // Verify parent package ownership in the active company and branch and ensure not deleted
    const { data: pkg, error: checkError } = await supabase
        .from('packages')
        .select('package_id')
        .eq('package_id', pkgId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .neq('status', 'deleted')
        .maybeSingle();

    if (checkError) {
        return { data: null, error: checkError };
    }
    if (!pkg) {
        return { data: null, error: { message: 'Cannot delete package services: package does not belong to active company and branch, or is deleted.' } };
    }

    return await supabase
        .from('package_services')
        .delete()
        .eq('package_id', pkgId);
}

export async function checkPackageDependencies(packageId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    try {
        const now = new Date();
        const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // 1. Check line-item bookings referencing this package
        let bookingQuery = supabase
            .from('bookings')
            .select('booking_id, booking_date, status')
            .eq('service_id', packageId)
            .in('status', ['booked', 'confirmed'])
            .gte('booking_date', todayStr);

        if (companyId) bookingQuery = bookingQuery.eq('company_id', companyId);
        if (branchId) bookingQuery = bookingQuery.eq('branch_id', branchId);

        const { data: futureBookings, error: bError } = await bookingQuery;
        if (bError) {
            console.error('Error querying bookings for package dependencies:', bError);
            return {
                hasDependency: false,
                reason: null,
                error: { message: `Failed to check bookings: ${bError.message || 'Database query error'}` }
            };
        }

        if (futureBookings && futureBookings.length > 0) {
            return {
                hasDependency: true,
                reason: `Cannot delete this package because there are ${futureBookings.length} upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first.`,
                error: null
            };
        }

        // 2. Check summary transactions referencing this package
        let bbtQuery = supabase
            .from('bookings_for_business_transaction')
            .select('booking_id, booking_date, status')
            .ilike('service_id', `%${packageId}%`)
            .in('status', ['booked', 'confirmed'])
            .gte('booking_date', todayStr);

        if (companyId) bbtQuery = bbtQuery.eq('company_id', companyId);
        if (branchId) bbtQuery = bbtQuery.eq('branch_id', branchId);

        const { data: futureBbt, error: bbtError } = await bbtQuery;
        if (bbtError) {
            console.error('Error querying booking transactions for package dependencies:', bbtError);
            return {
                hasDependency: false,
                reason: null,
                error: { message: `Failed to check booking transactions: ${bbtError.message || 'Database query error'}` }
            };
        }

        if (futureBbt && futureBbt.length > 0) {
            return {
                hasDependency: true,
                reason: `Cannot delete this package because there are ${futureBbt.length} upcoming active booking transaction(s) scheduled for it. Please reschedule or cancel the booking(s) first.`,
                error: null
            };
        }

        return { hasDependency: false, reason: null, error: null };
    } catch (e) {
        console.error('Unexpected error checking package booking dependencies:', e);
        return {
            hasDependency: false,
            reason: null,
            error: { message: `Unexpected error checking package dependencies: ${e.message || 'Unknown error'}` }
        };
    }
}

export async function deletePackage(pkgId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const payload = {
        status: 'deleted',
        is_active: false,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('packages')
        .update(payload)
        .eq('package_id', pkgId)
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .neq('status', 'deleted')
        .select();

    if (error) {
        return { data: null, error };
    }

    if (!data || data.length === 0) {
        return { data: null, error: { message: 'No matching package found to delete for this company and branch, or it is already deleted.' } };
    }

    return { data, error: null };
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
