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

    let query = supabase
        .from('services')
        .select('*')
        .order('service_name', { ascending: true });

    if (companyId) query = query.eq('company_id', companyId);
    if (branchId) query = query.eq('branch_id', branchId);

    return await query;
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
// WRITE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function insertService(payload) {
    return await supabase
        .from('services')
        .insert(payload);
}

export async function updateService(serviceId, payload) {
    let { error: updateError } = await supabase
        .from('services')
        .eq('id', serviceId)
        .update(payload);

    if (updateError) {
        ({ error: updateError } = await supabase
            .from('services')
            .eq('service_id', serviceId)
            .update(payload));
    }
    return { error: updateError };
}

export async function softDeleteService(serviceId) {
    let { error: deleteError } = await supabase
        .from('services')
        .eq('id', serviceId)
        .update({ status: 'deleted' });

    if (deleteError) {
        console.warn('id-based delete failed, trying service_id:', deleteError.message);
        ({ error: deleteError } = await supabase
            .from('services')
            .eq('service_id', serviceId)
            .update({ status: 'deleted' }));
    }
    return { error: deleteError };
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
    return await supabase
        .from('packages')
        .update(payload)
        .eq('package_id', pkgId);
}

export async function deletePackageServices(pkgId) {
    return await supabase
        .from('package_services')
        .delete()
        .eq('package_id', pkgId);
}

export async function deletePackage(pkgId) {
    return await supabase
        .from('packages')
        .delete()
        .eq('package_id', pkgId);
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH SERVICES & PACKAGES WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchServices() {
    try {
        const { data, error } = await fetchServicesFromDb();
        if (error) throw new Error(error.message);

        const liveServicesData = (data || [])
            .map(s => ({ ...s, status: (s.status || '').trim() }))
            .filter(s => s.status && s.status.toLowerCase() !== 'deleted');

        setLiveServicesData(liveServicesData);

        if (window.renderSvc) window.renderSvc(liveServicesData);
        if (window.populateServicesCategoryFilter) window.populateServicesCategoryFilter();

        const countEl = document.getElementById('countServices');
        if (countEl) {
            countEl.textContent = liveServicesData.length;
        }
    } catch (err) {
        console.error('Network Error fetching services:', err);
        if (window.renderSvc) window.renderSvc(servicesState.liveServicesData || []);
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
