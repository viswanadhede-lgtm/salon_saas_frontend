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

    return await supabase.schema('app')
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

    let query = supabase.schema('app')
        .from('packages')
        .select('*, package_services(service_id, service_name)')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);
    if (branchId) query = query.eq('branch_id', branchId);

    return await query;
}

export async function fetchPackageServicesForEdit(packageId) {
    return await supabase.schema('app')
        .from('package_services')
        .select('service_id')
        .eq('package_id', packageId);
}

export async function fetchPackageServicesForBreakdown(packageId) {
    return await supabase.schema('app')
        .from('package_services')
        .select('service_id, service_name')
        .eq('package_id', packageId);
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE OPERATIONS (AUTHORITATIVE BACKEND-FIRST STORED PROCEDURES)
// ─────────────────────────────────────────────────────────────────────────────

export async function insertService(payload) {
    const companyId = payload?.company_id || getCompanyId();
    const branchId = payload?.branch_id || getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase.rpc('create_service_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_service_name: payload.service_name,
        p_category_id: payload.category_id,
        p_price: Number(payload.price),
        p_duration: Number(payload.duration),
        p_description: payload.description || null,
        p_status: payload.status || 'active'
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
    }

    return { data, error: null };
}

export async function updateService(serviceId, payload) {
    const companyId = payload?.company_id || getCompanyId();
    const branchId = payload?.branch_id || getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase.rpc('update_service_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_service_id: serviceId,
        p_service_name: payload.service_name !== undefined ? payload.service_name : null,
        p_category_id: payload.category_id !== undefined ? payload.category_id : null,
        p_price: payload.price !== undefined ? Number(payload.price) : null,
        p_duration: payload.duration !== undefined ? Number(payload.duration) : null,
        p_description: payload.description !== undefined ? payload.description : null,
        p_status: payload.status !== undefined ? payload.status : null
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
    }

    return { data, error: null };
}

export async function checkServiceDependencies(serviceId) {
    // Authoritative check is enforced transactionally inside app.delete_service_atomic
    return { hasDependency: false, reason: null };
}

export async function softDeleteService(serviceId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase.rpc('delete_service_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_service_id: serviceId
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
    }

    return { data, error: null };
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
        p_original_price: Number(original_price) || 0,
        p_final_price: Number(final_price) || 0,
        p_is_active: is_active !== false,
        p_service_ids: service_ids || []
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
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
        p_company_id: companyId,
        p_branch_id: branchId,
        p_package_id: pkgId,
        p_package_name: package_name !== undefined ? package_name : null,
        p_description: description !== undefined ? description : null,
        p_original_price: original_price !== undefined ? Number(original_price) : null,
        p_final_price: final_price !== undefined ? Number(final_price) : null,
        p_is_active: is_active !== undefined ? (is_active !== false) : null,
        p_service_ids: service_ids !== undefined ? service_ids : null
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
    }

    return { data, error: null };
}

// Deprecated legacy stubs redirected to atomic RPCs or disabled to prevent direct mutations
export async function insertPackage(payload) {
    return await createPackageAtomic(payload);
}

export async function insertPackageServices(psPayloads) {
    console.warn('insertPackageServices is deprecated: service mapping is handled atomically inside create_package_atomic.');
    return { data: [], error: null };
}

export async function updatePackage(pkgId, payload) {
    return await updatePackageAtomic(pkgId, payload);
}

export async function deletePackageServices(pkgId) {
    console.warn('deletePackageServices is deprecated: service mapping is handled atomically inside update_package_atomic.');
    return { data: [], error: null };
}

export async function checkPackageDependencies(packageId) {
    // Authoritative check is enforced transactionally inside app.delete_package_atomic
    return { hasDependency: false, reason: null, error: null };
}

export async function deletePackage(pkgId) {
    const companyId = getCompanyId();
    const branchId = getBranchId();

    if (!companyId || !branchId) {
        return { data: null, error: { message: 'Missing company or branch context' } };
    }

    const { data, error } = await supabase.rpc('delete_package_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_package_id: pkgId
    });

    if (error) {
        return { data: null, error };
    }

    if (data && data.success === false) {
        return { data: null, error: { message: data.error } };
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
    if (!title || !body) return;

    const liveServices = window.liveServicesData || servicesState.liveServicesData || [];

    const renderRows = (servicesList) => {
        return servicesList.map(r => {
            const svc = liveServices.find(s => 
                (r.service_id && String(s.service_id) === String(r.service_id)) ||
                ((s.service_name || s.name || '').trim().toLowerCase() === (r.service_name || '').trim().toLowerCase())
            );
            const sName = r.service_name || svc?.service_name || '—';
            const catName = svc?.category_name || svc?.category || '—';
            const price = svc?.price != null ? `₹${parseFloat(svc.price).toLocaleString('en-IN')}` : '—';

            return `
            <tr class="tb-row">
                <td style="padding:12px 16px 12px 20px;font-weight:600;color:#1e293b;font-size:0.87rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${sName}">${sName}</td>
                <td style="padding:12px 16px;"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#eff6ff;color:#1d4ed8;">${catName}</span></td>
                <td style="padding:12px 16px;font-weight:600;color:#059669;font-size:0.87rem;">${price}</td>
            </tr>`;
        }).join('');
    };

    // 1. Check in-memory cache first for instant (0ms) render
    const cachedPkg = (servicesState.livePackagesData || []).find(p => String(p.package_id) === String(pkgId));
    if (cachedPkg && Array.isArray(cachedPkg.package_services) && cachedPkg.package_services.length > 0) {
        const services = cachedPkg.package_services.filter(r => r.service_name);
        title.innerHTML = `${pkgName} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">${services.length}</span>`;

        body.innerHTML = renderRows(services);
        return;
    }

    // 2. Fallback to network query if not cached
    try {
        const { data: rows, error } = await fetchPackageServicesForBreakdown(pkgId);
        if (error) throw error;

        const services = (rows || []).filter(r => r.service_name);
        title.innerHTML = `${pkgName} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">${services.length}</span>`;

        if (!services.length) {
            body.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;color:#64748b;font-weight:500;">No services included in this package.</td></tr>';
        } else {
            body.innerHTML = renderRows(services);
        }
    } catch (err) {
        console.error('Error fetching package services:', err);
        title.innerHTML = pkgName;
        body.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;color:#ef4444;">Failed to load services.</td></tr>';
    }
}
