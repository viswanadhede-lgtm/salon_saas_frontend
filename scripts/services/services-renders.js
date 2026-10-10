// scripts/services/services-renders.js
// Services, Categories, and Packages UI rendering, tabs, search/filter, and page glue.
// Modularized from inline script in services.html.

'use strict';

export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── 1. STATUS BADGE HELPER ──────────────────────────────────────────

export function statusBadge(s) {
    const isAct = (s === true || s === 'active');
    return isAct
        ? '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#d1fae5;color:#065f46;">Active</span>'
        : '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#f1f5f9;color:#64748b;">Inactive</span>';
}

// ── 2. TAB SWITCHING ────────────────────────────────────────────────

export function switchTab(tab) {
    const isSvc = tab === 'services';
    const isCat = tab === 'categories';
    const isPkg = tab === 'packages';

    document.getElementById('tabBtnServices')?.classList.toggle('active', isSvc);
    document.getElementById('tabBtnCategories')?.classList.toggle('active', isCat);
    document.getElementById('tabBtnPackages')?.classList.toggle('active', isPkg);

    const panelServices = document.getElementById('panelServices');
    const panelCategories = document.getElementById('panelCategories');
    const panelPackages = document.getElementById('panelPackages');

    if (panelServices) panelServices.style.display = isSvc ? '' : 'none';
    if (panelCategories) panelCategories.style.display = isCat ? '' : 'none';
    if (panelPackages) panelPackages.style.display = isPkg ? '' : 'none';

    const servicesSearchWrap = document.getElementById('servicesSearchWrap');
    const categoriesSearchWrap = document.getElementById('categoriesSearchWrap');
    const packagesSearchWrap = document.getElementById('packagesSearchWrap');

    if (servicesSearchWrap) servicesSearchWrap.style.display = isSvc ? '' : 'none';
    if (categoriesSearchWrap) categoriesSearchWrap.style.display = isCat ? '' : 'none';
    if (packagesSearchWrap) packagesSearchWrap.style.display = isPkg ? '' : 'none';

    const btnAddService = document.getElementById('btnAddService');
    const btnAddCategory = document.getElementById('btnAddCategory');
    const btnAddPackage = document.getElementById('btnAddPackage');

    if (btnAddService) btnAddService.style.display = isSvc ? '' : 'none';
    if (btnAddCategory) btnAddCategory.style.display = isCat ? '' : 'none';
    if (btnAddPackage) btnAddPackage.style.display = isPkg ? '' : 'none';

    const servicesSearchInput = document.getElementById('servicesSearchInput');
    const categoriesSearchInput = document.getElementById('categoriesSearchInput');
    const packagesSearchInput = document.getElementById('packagesSearchInput');

    if (servicesSearchInput) servicesSearchInput.value = '';
    if (categoriesSearchInput) categoriesSearchInput.value = '';
    if (packagesSearchInput) packagesSearchInput.value = '';

    const servicesCategoryFilter = document.getElementById('servicesCategoryFilter');
    if (servicesCategoryFilter) servicesCategoryFilter.style.display = isSvc ? '' : 'none';

    if (isSvc && window.fetchServices) window.fetchServices();
    else if (isSvc && window.liveServicesData) window.renderSvc(window.liveServicesData);

    if (isCat && window.fetchCategories) window.fetchCategories();
    else if (isCat && window.liveCategoriesData) window.renderCat(window.liveCategoriesData);

    if (isPkg && window.fetchPackages) window.fetchPackages();
    else if (isPkg && window.livePackagesData) window.renderPackages(window.livePackagesData);
}

// ── 3. SERVICES TABLE RENDERER ──────────────────────────────────────

export function renderSvc(data) {
    const tb = document.getElementById('servicesTableBody');
    if (!tb) return;
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#94a3b8;">No services found.</td></tr>';
        return;
    }
    tb.innerHTML = data.map(s => {
        const sName = s.service_name || s.name || '';
        const sCat = s.category_name || s.category || '';
        const sId = s.service_id || '';
        return `<tr class="tb-row">
            <td style="padding:14px 16px 14px 24px;font-weight:500;color:#1e293b;">${sName}</td>
            <td style="padding:14px 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#eff6ff;color:#1d4ed8;">${sCat}</span></td>
            <td style="padding:14px 16px;color:#374151;">${s.duration} min</td>
            <td style="padding:14px 16px;color:#374151;font-weight:500;">&#8377;${parseFloat(s.price || 0).toLocaleString()}</td>
            <td style="padding:14px 16px;">${statusBadge(s.status)}</td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="window.openEditServiceModal('${sId}')" title="Edit Service" data-sub-feature="update_service" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="window.triggerDeleteService('${sId}', '${sName.replace(/'/g, "\\'")}')" title="Delete Service" data-sub-feature="delete_service" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    if (typeof window.applySubFeatureGates === 'function') window.applySubFeatureGates();
}

// ── 4. CATEGORIES TABLE RENDERER ────────────────────────────────────

export function renderCat(data) {
    const tb = document.getElementById('categoriesTableBody');
    if (!tb) return;
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="4" style="padding:40px;text-align:center;color:#94a3b8;">No categories found.</td></tr>';
        return;
    }
    tb.innerHTML = data.map(c => {
        const catId = c.category_id || c.id || '';
        const catName = c.category_name || c.name || '';
        const catDesc = c.description || '';
        const catStatus = c.status || 'active';
        const cnt = (window.liveServicesData || []).filter(s => {
            if ((s.status || '').toLowerCase() === 'deleted') return false;
            return Boolean(catId && s.category_id && String(s.category_id) === String(catId));
        }).length;

        return `<tr class="tb-row">
            <td style="padding:14px 16px 14px 24px;"><div style="font-weight:600;color:#1e293b;font-size:0.9rem;">${escapeHtml(catName)}</div>${catDesc ? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">${escapeHtml(catDesc)}</div>` : ''}</td>
            <td style="padding:14px 16px;">
                <span class="customer-link cat-service-count-link" role="button" tabindex="0" data-cat-id="${catId}" data-cat-name="${escapeHtml(catName)}" style="cursor:pointer;">
                    ${cnt} ${cnt === 1 ? 'service' : 'services'}
                </span>
            </td>
            <td style="padding:14px 16px;">${statusBadge(catStatus)}</td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="btn-edit-cat hover-lift" onclick="window.openEditCategoryModal('${catId}', '${catName}')" title="Edit Category" data-sub-feature="update_service_category" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="btn-delete-cat flex-shrink-0 hover-lift" ${cnt > 0 ? 'disabled' : ''} onclick="${cnt > 0 ? '' : `window.triggerDeleteCategory('${catId}', '${catName}')`}" title="${cnt > 0 ? 'Cannot delete the service category because there are active services under this category' : 'Delete Category'}" data-sub-feature="delete_service_category" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:${cnt > 0 ? 'not-allowed' : 'pointer'}; color:#ef4444; transition:all 0.2s; min-width: 52px; opacity: ${cnt > 0 ? '0.45' : '1'};">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Attach safe event listeners to service count links
    tb.querySelectorAll('.cat-service-count-link').forEach(link => {
        const handleOpen = () => {
            const catId = link.getAttribute('data-cat-id') || '';
            const catName = link.getAttribute('data-cat-name') || '';
            window.openCatServicesModal(catId, catName);
        };
        link.addEventListener('click', handleOpen);
        link.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpen();
            }
        });
    });

    if (typeof window.applySubFeatureGates === 'function') window.applySubFeatureGates();
}

// ── 5. PACKAGES TABLE RENDERER ──────────────────────────────────────

export function renderPackages(data) {
    const tb = document.getElementById('packagesTableBody');
    if (!tb) return;
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#94a3b8;">No packages found.</td></tr>';
        return;
    }
    tb.innerHTML = data.map(p => {
        const pName = p.package_name || '';
        const cnt = p.services_count || 0;
        return `<tr class="tb-row">
            <td style="padding:14px 16px 14px 24px;"><div style="font-weight:600;color:#1e293b;font-size:0.9rem;">${pName}</div>${p.description ? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">${p.description}</div>` : ''}</td>
            <td style="padding:14px 16px; text-align:center;">
                <span class="customer-link" onclick="window.openPkgServicesModal('${p.package_id}', '${pName.replace(/'/g, "\\'")}')">
                    ${cnt} ${cnt === 1 ? 'service' : 'services'}
                </span>
            </td>
            <td style="padding:14px 16px;color:#374151;">&#8377;${parseFloat(p.original_price || 0).toLocaleString()}</td>
            <td style="padding:14px 16px;color:#15803d;font-weight:600;">&#8377;${parseFloat(p.final_price || 0).toLocaleString()}</td>
            <td style="padding:14px 16px;">${statusBadge(p.is_active)}</td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="window.openEditPackageModal('${p.package_id}')" title="Edit Package" data-sub-feature="update_package" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="window.triggerDeletePackage('${p.package_id}', '${pName.replace(/'/g, "\\'")}')" title="Delete Package" data-sub-feature="delete_package" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    if (typeof window.applySubFeatureGates === 'function') window.applySubFeatureGates();
}

// ── 6. BREAKDOWN POPUP MODALS ───────────────────────────────────────

export async function openPkgServicesModal(pkgId, pkgName) {
    const modal = document.getElementById('pkgServicesModal');
    const title = document.getElementById('pkgServicesModalTitle');
    const body = document.getElementById('pkgServicesModalBody');
    if (!modal) return;
    if (title) {
        title.innerHTML = `${pkgName} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">...</span>`;
    }
    if (body) {
        body.innerHTML = '<tr><td style="padding:40px;text-align:center;"><div style="color:#64748b;font-weight:500;">Loading services...</div></td></tr>';
    }
    modal.classList.add('active');
    if (window._openPkgServicesModalInner) window._openPkgServicesModalInner(pkgId, pkgName);
}

export async function openCatServicesModal(catIdOrName, catNameArg) {
    let catId = '';
    let catName = '';

    if (catNameArg !== undefined) {
        catId = catIdOrName || '';
        catName = catNameArg || '';
    } else {
        const isUuid = typeof catIdOrName === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(catIdOrName);
        if (isUuid) {
            catId = catIdOrName;
            const foundCat = (window.liveCategoriesData || []).find(c => String(c.category_id || c.id) === String(catId));
            catName = foundCat ? (foundCat.category_name || foundCat.name || '') : '';
        } else {
            catName = catIdOrName || '';
            const foundCat = (window.liveCategoriesData || []).find(c => (c.category_name || c.name || '').toLowerCase() === (catName || '').toLowerCase());
            catId = foundCat ? (foundCat.category_id || foundCat.id || '') : '';
        }
    }

    const modal = document.getElementById('catServicesModal');
    const title = document.getElementById('catServicesModalTitle');
    const body = document.getElementById('catServicesModalBody');
    if (!modal) return;

    if (title) {
        title.innerHTML = `${escapeHtml(catName || 'Category')} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">...</span>`;
    }
    if (body) {
        body.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;"><div style="color:#64748b;font-weight:500;">Loading services...</div></td></tr>';
    }
    modal.classList.add('active');

    let fetchFailed = false;
    let fetchErrorMessage = '';

    // If liveServicesData is not yet loaded, attempt to fetch it
    if (!window.liveServicesData || window.liveServicesData.length === 0) {
        try {
            if (window.fetchServices) {
                const res = await window.fetchServices();
                if (res && res.error) {
                    fetchFailed = true;
                    fetchErrorMessage = res.error.message || 'Error loading services';
                }
            }
        } catch (err) {
            fetchFailed = true;
            fetchErrorMessage = err.message || 'Network error loading services';
        }
    }

    if (fetchFailed) {
        if (title) {
            title.innerHTML = `${escapeHtml(catName || 'Category')} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #fee2e2; color: #ef4444; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">!</span>`;
        }
        if (body) {
            body.innerHTML = `<tr><td colspan="3" style="padding:40px;text-align:center;"><div style="font-size:2rem;margin-bottom:10px;">⚠️</div><div style="color:#ef4444;font-weight:500;font-size:0.92rem;">Failed to load services (${escapeHtml(fetchErrorMessage)}). Please check your connection and try again.</div></td></tr>`;
        }
        return;
    }

    // Match strictly by category_id and exclude deleted services
    const services = (window.liveServicesData || []).filter(s => {
        if ((s.status || '').toLowerCase() === 'deleted') return false;
        return Boolean(catId && s.category_id && String(s.category_id) === String(catId));
    });

    if (title) {
        title.innerHTML = `${escapeHtml(catName || 'Category')} <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; background-color: #eff6ff; color: #1e3a8a; font-size: 0.9rem; font-weight: 600; margin-left: 8px; vertical-align: middle; padding: 0 6px;">${services.length}</span>`;
    }

    if (body) {
        if (!services.length) {
            body.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;"><div style="font-size:2rem;margin-bottom:10px;">✂️</div><div style="color:#64748b;font-weight:500;font-size:0.92rem;">No services listed in this category yet.</div></td></tr>';
        } else {
            body.innerHTML = services.map(s => {
                const name = s.service_name || s.name || '';
                const duration = s.duration ? s.duration + ' min' : '-';
                const price = s.price != null ? '&#8377;' + parseFloat(s.price).toLocaleString() : '-';
                return `<tr class="tb-row">
                    <td style="padding:12px 16px 12px 20px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-weight:500;color:#1e293b;">${escapeHtml(name)}</span>
                            ${statusBadge(s.status)}
                        </div>
                    </td>
                    <td style="padding:12px 16px;color:#374151;">${escapeHtml(duration)}</td>
                    <td style="padding:12px 16px;color:#374151;font-weight:500;">${price}</td>
                </tr>`;
            }).join('');
        }
    }
}

// ── 7. TOAST NOTIFICATION ───────────────────────────────────────────

export function toast(msg) {
    const t = document.getElementById('toastNotification');
    if (t) {
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
}

// ── 8. SEARCH & FILTER HELPERS ──────────────────────────────────────

export function applyServiceFilters() {
    const searchInput = document.getElementById('servicesSearchInput');
    const catFilter = document.getElementById('servicesCategoryFilter');
    const q = (searchInput?.value || '').trim().toLowerCase();
    const selectedCatId = catFilter?.value || '';

    let filtered = window.liveServicesData || [];
    if (selectedCatId) {
        filtered = filtered.filter(s => s.category_id === selectedCatId);
    }
    if (q) {
        filtered = filtered.filter(s => 
            (s.service_name || s.name || '').toLowerCase().includes(q)
        );
    }
    window.renderSvc(filtered);
}

export function populateServicesCategoryFilter() {
    const sel = document.getElementById('servicesCategoryFilter');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>';
    const categories = (window.liveCategoriesData || []).filter(c => (c.status || '').toLowerCase() === 'active');
    categories.forEach(c => {
        const catId = c.category_id || c.id;
        const catName = c.category_name || c.name || '';
        if (catId) {
            const o = document.createElement('option');
            o.value = catId;
            o.textContent = catName;
            sel.appendChild(o);
        }
    });
    if (currentVal && Array.from(sel.options).some(opt => opt.value === currentVal)) {
        sel.value = currentVal;
    }
}

export function applyCategoryFilters() {
    const categoriesSearchInput = document.getElementById('categoriesSearchInput');
    const q = (categoriesSearchInput?.value || '').trim().toLowerCase();
    const categories = window.liveCategoriesData || [];

    if (!q) {
        window.renderCat(categories);
        return;
    }

    const filtered = categories.filter(c => {
        const name = (c.category_name || c.name || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
    });

    window.renderCat(filtered);
}

// ── 9. DOM INITIALIZATION / PAGE GLUE ───────────────────────────────

export function initServicesPageUI() {
    const servicesSearchInput = document.getElementById('servicesSearchInput');
    const servicesCategoryFilter = document.getElementById('servicesCategoryFilter');
    const categoriesSearchInput = document.getElementById('categoriesSearchInput');
    const packagesSearchInput = document.getElementById('packagesSearchInput');

    if (servicesSearchInput) {
        servicesSearchInput.addEventListener('input', applyServiceFilters);
    }
    if (servicesCategoryFilter) {
        servicesCategoryFilter.addEventListener('change', applyServiceFilters);
    }
    if (categoriesSearchInput) {
        categoriesSearchInput.addEventListener('input', applyCategoryFilters);
    }
    if (packagesSearchInput) {
        packagesSearchInput.addEventListener('input', function () {
            const q = this.value.toLowerCase();
            const filtered = (window.livePackagesData || []).filter(p => (p.package_name || '').toLowerCase().includes(q));
            if (window.renderPackages) window.renderPackages(filtered);
        });
    }

    // Add Service Modal
    const addSvcModal = document.getElementById('addServiceModal');
    const btnAddService = document.getElementById('btnAddService');
    const btnCloseAddServiceModal = document.getElementById('btnCloseAddServiceModal');
    const btnCancelAddService = document.getElementById('btnCancelAddService');

    if (btnAddService && addSvcModal) {
        btnAddService.addEventListener('click', () => {
            addSvcModal.classList.add('active');

            const sel = document.getElementById('sfCategory');
            if (sel) {
                sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
                (window.liveCategoriesData || []).filter(c => (c.status || '').toLowerCase() === 'active').forEach(c => {
                    const catId = c.category_id || c.id;
                    const catName = c.category_name || c.name || '';
                    if (catId) {
                        const o = document.createElement('option');
                        o.value = catId;
                        o.textContent = catName;
                        o.dataset.name = catName;
                        o.dataset.id = catId;
                        sel.appendChild(o);
                    }
                });
            }

            if (window.fetchCategories) {
                window.fetchCategories().then(() => {
                    if (sel) {
                        const currentSelection = sel.value;
                        sel.innerHTML = '<option value="" disabled selected>Select a category</option>';
                        (window.liveCategoriesData || []).filter(c => (c.status || '').toLowerCase() === 'active').forEach(c => {
                            const catId = c.category_id || c.id;
                            const catName = c.category_name || c.name || '';
                            if (catId) {
                                const o = document.createElement('option');
                                o.value = catId;
                                o.textContent = catName;
                                o.dataset.name = catName;
                                o.dataset.id = catId;
                                sel.appendChild(o);
                            }
                        });
                        if (currentSelection) sel.value = currentSelection;
                    }
                });
            }
        });
    }
    if (btnCloseAddServiceModal && addSvcModal) {
        btnCloseAddServiceModal.addEventListener('click', () => addSvcModal.classList.remove('active'));
    }
    if (btnCancelAddService && addSvcModal) {
        btnCancelAddService.addEventListener('click', () => addSvcModal.classList.remove('active'));
    }
    if (addSvcModal) {
        addSvcModal.addEventListener('click', e => { if (e.target === addSvcModal) addSvcModal.classList.remove('active'); });
    }

    // Add Category Modal
    const addCatModal = document.getElementById('addCategoryModal');
    const btnAddCategory = document.getElementById('btnAddCategory');
    const btnCloseAddCategoryModal = document.getElementById('btnCloseAddCategoryModal');
    const btnCancelAddCategory = document.getElementById('btnCancelAddCategory');

    if (btnAddCategory && addCatModal) {
        btnAddCategory.addEventListener('click', () => addCatModal.classList.add('active'));
    }
    if (btnCloseAddCategoryModal && addCatModal) {
        btnCloseAddCategoryModal.addEventListener('click', () => addCatModal.classList.remove('active'));
    }
    if (btnCancelAddCategory && addCatModal) {
        btnCancelAddCategory.addEventListener('click', () => addCatModal.classList.remove('active'));
    }
    if (addCatModal) {
        addCatModal.addEventListener('click', e => { if (e.target === addCatModal) addCatModal.classList.remove('active'); });
    }

    // Add Package Modal
    const addPackageModal = document.getElementById('addPackageModal');
    const btnAddPackage = document.getElementById('btnAddPackage');
    const btnCloseAddPackageModal = document.getElementById('btnCloseAddPackageModal');
    const btnCancelAddPackage = document.getElementById('btnCancelAddPackage');

    if (btnAddPackage && addPackageModal) {
        btnAddPackage.addEventListener('click', () => {
            addPackageModal.classList.add('active');
            if (window.populatePackageServicesDropdown) window.populatePackageServicesDropdown();
        });
    }
    if (btnCloseAddPackageModal && addPackageModal) {
        btnCloseAddPackageModal.addEventListener('click', () => addPackageModal.classList.remove('active'));
    }
    if (btnCancelAddPackage && addPackageModal) {
        btnCancelAddPackage.addEventListener('click', () => addPackageModal.classList.remove('active'));
    }
    if (addPackageModal) {
        addPackageModal.addEventListener('click', e => { if (e.target === addPackageModal) addPackageModal.classList.remove('active'); });
    }

    // Edit Package Modal
    const editPackageModal = document.getElementById('editPackageModal');
    const btnCloseEditPackageModal = document.getElementById('btnCloseEditPackageModal');
    const btnCancelEditPackage = document.getElementById('btnCancelEditPackage');

    if (btnCloseEditPackageModal && editPackageModal) {
        btnCloseEditPackageModal.addEventListener('click', () => editPackageModal.classList.remove('active'));
    }
    if (btnCancelEditPackage && editPackageModal) {
        btnCancelEditPackage.addEventListener('click', () => editPackageModal.classList.remove('active'));
    }
    if (editPackageModal) {
        editPackageModal.addEventListener('click', e => { if (e.target === editPackageModal) editPackageModal.classList.remove('active'); });
    }

    if (window.feather) {
        window.feather.replace();
    }
}

// ── 10. REGISTER GLOBAL WINDOW APIS IMMEDIATELY ─────────────────────

window.statusBadge = statusBadge;
window.switchTab = switchTab;
window.renderSvc = renderSvc;
window.renderCat = renderCat;
window.renderPackages = renderPackages;
window.openPkgServicesModal = openPkgServicesModal;
window.openCatServicesModal = openCatServicesModal;
window.toast = toast;
window.applyServiceFilters = applyServiceFilters;
window.applyCategoryFilters = applyCategoryFilters;
window.populateServicesCategoryFilter = populateServicesCategoryFilter;

// ── 11. AUTO-INITIALIZE UI ON DOM READY ─────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicesPageUI);
} else {
    initServicesPageUI();
}
