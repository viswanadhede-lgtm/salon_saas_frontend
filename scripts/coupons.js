import { supabase } from '../lib/supabase.js';

let currentCoupons = [];
let availableServices = [];
let isEditing = false;
let currentEditId = null;
let couponToDelete = null;

// Global context getters
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};
const getBranchId = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

document.addEventListener('DOMContentLoaded', async () => {
    if (window.feather) feather.replace();

    await fetchServices();
    await loadCoupons();

    document.getElementById('branchSelect')?.addEventListener('change', loadCoupons);

    // Filter panel
    const filterPanel = document.getElementById('cpnFilterPanel');
    const btnFilter = document.getElementById('btnFilterCoupons');
    if (btnFilter && filterPanel) {
        btnFilter.addEventListener('click', e => {
            e.stopPropagation();
            filterPanel.style.display = filterPanel.style.display === 'block' ? 'none' : 'block';
        });
        document.getElementById('btnCloseCpnFilter')?.addEventListener('click', () => { filterPanel.style.display = 'none'; });
        document.getElementById('btnCpnFilterApply')?.addEventListener('click', () => { filterPanel.style.display = 'none'; });
        document.getElementById('btnCpnFilterReset')?.addEventListener('click', () => {
            filterPanel.querySelectorAll('input').forEach(i => i.checked = false);
        });
        filterPanel.addEventListener('click', e => e.stopPropagation());
    }

    // Modal events
    const overlay = document.getElementById('couponModalOverlay');
    document.getElementById('btnCreateCoupon')?.addEventListener('click', openCreateModal);
    document.getElementById('closeCouponModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelCoupon')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Delete modal events
    const deleteConfirmOverlay = document.getElementById('deleteCouponConfirmOverlay');
    document.getElementById('btnCancelDeleteCoupon')?.addEventListener('click', () => {
        deleteConfirmOverlay?.classList.remove('active');
        couponToDelete = null;
    });
    document.getElementById('btnConfirmDeleteCoupon')?.addEventListener('click', async () => {
        if (!couponToDelete) return;
        deleteConfirmOverlay?.classList.remove('active');
        await executeDeleteCoupon(couponToDelete);
        couponToDelete = null;
    });

    // Discount type placeholder
    const discType = document.getElementById('cpnDiscountType');
    const discVal = document.getElementById('cpnDiscountValue');
    if (discType && discVal) {
        discType.addEventListener('change', () => {
            discVal.placeholder = discType.value === 'percentage' ? 'e.g. 10' : 'e.g. 100';
        });
    }

    // Status toggle label
    const toggle = document.getElementById('cpnStatusToggle');
    const statusLabel = document.getElementById('cpnStatusLabel');
    if (toggle && statusLabel) {
        toggle.addEventListener('change', () => { statusLabel.textContent = toggle.checked ? 'Active' : 'Inactive'; });
    }

    // Auto-uppercase coupon code
    const codeInput = document.getElementById('cpnCode');
    if (codeInput) {
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); });
    }

    // Services dropdown toggle
    const svcBtn = document.getElementById('cpnServicesBtn');
    const svcMenu = document.getElementById('cpnServicesMenu');
    if (svcBtn && svcMenu) {
        svcBtn.addEventListener('click', e => {
            e.stopPropagation();
            svcMenu.style.display = svcMenu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', e => {
            if (!svcBtn.contains(e.target) && !svcMenu.contains(e.target)) svcMenu.style.display = 'none';
        });
    }

    document.getElementById('cpnSvcApply')?.addEventListener('click', () => {
        applyServiceSelection();
        if (svcMenu) svcMenu.style.display = 'none';
    });
    document.getElementById('cpnSvcReset')?.addEventListener('click', () => {
        document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
        applyServiceSelection();
    });

    document.getElementById('btnSaveCoupon')?.addEventListener('click', handleSaveCoupon);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: service selection display text
// ─────────────────────────────────────────────────────────────────────────────
function applyServiceSelection() {
    const list = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    const svcText = document.getElementById('cpnServicesText');
    if (!svcText) return;

    const selTitles = Array.from(list).filter(c => c.checked).map(c => c.nextSibling?.textContent?.trim() || c.value);
    const selValues = Array.from(list).filter(c => c.checked).map(c => c.value);

    if (selValues.length === 0) { svcText.textContent = 'Select services...'; svcText.style.color = '#94a3b8'; }
    else if (selValues.includes('all')) { svcText.textContent = 'All Services'; svcText.style.color = '#1e293b'; }
    else if (selTitles.length === 1) { svcText.textContent = selTitles[0]; svcText.style.color = '#1e293b'; }
    else { svcText.textContent = `${selTitles[0]} +${selTitles.length - 1} more`; svcText.style.color = '#1e293b'; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Fetch services for the dropdowns
// ─────────────────────────────────────────────────────────────────────────────
async function fetchServices() {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('service_id, service_name, status')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;
        availableServices = (data || []).filter(s => (s.status || '').toLowerCase() === 'active');
        populateServicesCheckboxes();
    } catch (err) {
        console.error('Failed to load services', err);
    }
}

function populateServicesCheckboxes() {
    const modalContainer = document.getElementById('cpnServicesCheckboxList');
    const filterContainer = document.getElementById('filterServicesContainer');

    let dynamicHtml = '';
    availableServices.forEach(svc => {
        dynamicHtml += `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:0.88rem;color:#334155;"><input type="checkbox" value="${svc.service_id}" style="accent-color:#6366f1;"> ${svc.service_name}</label>`;
    });

    const allRow = `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:0.88rem;color:#334155;"><input type="checkbox" value="all" style="accent-color:#6366f1;"> All Services</label>`;

    if (modalContainer) {
        modalContainer.innerHTML = allRow + dynamicHtml;
        bindAllServicesToggle(modalContainer);
    }

    if (filterContainer) {
        filterContainer.innerHTML = `<label class="cpn-filter-chk"><input type="checkbox" value="all"> All Services</label>` +
            availableServices.map(svc => `<label class="cpn-filter-chk"><input type="checkbox" value="${svc.service_id}"> ${svc.service_name}</label>`).join('');
        bindAllServicesToggle(filterContainer);
    }
}

function bindAllServicesToggle(container) {
    const allCheckbox = container.querySelector('input[value="all"]');
    const otherCheckboxes = container.querySelectorAll('input:not([value="all"])');

    if (allCheckbox) {
        allCheckbox.addEventListener('change', (e) => {
            otherCheckboxes.forEach(cb => { cb.checked = e.target.checked; });
            if (container.id === 'cpnServicesCheckboxList') applyServiceSelection();
        });
        otherCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                allCheckbox.checked = Array.from(otherCheckboxes).every(c => c.checked);
                if (container.id === 'cpnServicesCheckboxList') applyServiceSelection();
            });
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Load Coupons + coupon_services join
// ─────────────────────────────────────────────────────────────────────────────
async function loadCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="padding:24px 20px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                    <span style="font-size:0.9rem;">Loading coupons...</span>
                </div>
            </td>
        </tr>`;
    if (window.feather) feather.replace();

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        const [couponsRes, svcLinksRes] = await Promise.all([
            supabase
                .from('coupons')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false }),
            supabase
                .from('coupon_services')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
        ]);

        if (couponsRes.error) throw couponsRes.error;

        // Group service links by coupon_id
        const svcByCouponId = {};
        (svcLinksRes.data || []).forEach(row => {
            if (!svcByCouponId[row.coupon_id]) svcByCouponId[row.coupon_id] = [];
            svcByCouponId[row.coupon_id].push({
                service_id: row.service_id,
                service_name: row.service_name || '',
                current_usage_count: row.current_usage_count || 0
            });
        });

        currentCoupons = (couponsRes.data || []).map(c => ({
            ...c,
            applicable_services: svcByCouponId[c.coupon_id || c.id] || []
        }));

        renderCoupons();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#ef4444;">Failed to load coupons: ${err.message || ''}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER TABLE
// ─────────────────────────────────────────────────────────────────────────────
function renderCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;

    if (currentCoupons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No coupons found. Create a new coupon to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentCoupons.map(coupon => {
        const couponId = coupon.coupon_id || coupon.id;
        const isFlat = coupon.discount_type === 'flat';
        const discountDisplay = isFlat ? `₹${coupon.discount_value} OFF` : `${coupon.discount_value}% OFF`;
        const badgeColor = isFlat ? 'color:#15803d;background:#dcfce7;' : 'color:#0284c7;background:#e0f2fe;';

        const svcDisplay = coupon.applicable_services?.length > 0
            ? `${coupon.applicable_services.length} service(s)`
            : 'All Services';

        let validityText = 'Always Active';
        if (coupon.valid_from || coupon.valid_to) {
            const startStr = coupon.valid_from ? new Date(coupon.valid_from).toLocaleDateString() : 'Now';
            const endStr = coupon.valid_to ? new Date(coupon.valid_to).toLocaleDateString() : 'No Expiry';
            validityText = `${startStr} – ${endStr}`;
        }

        const isActive = coupon.status === 'active';
        const statusBadge = isActive
            ? `<span style="background:#dcfce7;color:#166534;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>Active</span>`
            : `<span style="background:#f1f5f9;color:#475569;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;"></span>Inactive</span>`;

        const usageLimit = coupon.total_usage_limit || '∞';
        const usedCount = coupon.applicable_services?.length > 0
            ? coupon.applicable_services.reduce((sum, svc) => sum + (Number(svc.current_usage_count) || 0), 0)
            : Number(coupon.current_usage_count) || 0;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:16px 20px;"><span class="cpn-code-badge">${coupon.coupon_code || 'N/A'}</span></td>
                <td style="padding:16px 20px;"><span style="font-weight:700;${badgeColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountDisplay}</span></td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;text-transform:capitalize;">${coupon.discount_type || '-'}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;">${svcDisplay}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#64748b;font-style:italic;">${validityText}</td>
                <td style="padding:16px 20px;"><span style="font-weight:600;color:#334155;">${usedCount}</span><span style="color:#64748b;font-size:0.9rem;"> / ${usageLimit}</span></td>
                <td style="padding:16px 20px;">${statusBadge}</td>
                <td style="padding:14px 16px; vertical-align:middle;">
                    <div class="action-buttons" style="display:flex; justify-content:center; gap:0.5rem;">
                        <button class="hover-lift" onclick="window.editCoupon('${couponId}')" title="Edit Coupon" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px; font-weight:600;">Edit</span>
                        </button>
                        <button class="hover-lift" onclick="window.deleteCoupon('${couponId}')" title="Delete Coupon" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            <span style="font-size:10px; font-weight:600;">Delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.feather) feather.replace();
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: Open Create / Edit
// ─────────────────────────────────────────────────────────────────────────────
function openCreateModal() {
    isEditing = false;
    currentEditId = null;

    document.getElementById('cpnCode').value = '';
    document.getElementById('cpnDiscountType').value = '';
    document.getElementById('cpnDiscountValue').value = '';
    document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
    applyServiceSelection();
    document.getElementById('cpnMinBooking').value = '';
    document.getElementById('cpnUsageLimit').value = '';
    document.getElementById('cpnUsagePerCustomer').value = '';
    const tog = document.getElementById('cpnStatusToggle');
    tog.checked = true;
    document.getElementById('cpnStatusLabel').textContent = 'Active';
    document.getElementById('cpnStartDate').value = '';
    document.getElementById('cpnEndDate').value = '';

    document.querySelector('#couponModalOverlay h2').textContent = 'Create Coupon';
    document.getElementById('btnSaveCoupon').textContent = 'Create Coupon';

    const cpnCodeInput = document.getElementById('cpnCode');
    cpnCodeInput.readOnly = false;
    cpnCodeInput.style.background = '';
    cpnCodeInput.style.color = '';
    cpnCodeInput.style.cursor = '';

    document.getElementById('couponModalOverlay').classList.add('active');
}

window.editCoupon = function(id) {
    const coupon = currentCoupons.find(c => (c.coupon_id || c.id) === id);
    if (!coupon) return;

    isEditing = true;
    currentEditId = id;

    document.getElementById('cpnCode').value = coupon.coupon_code || '';
    document.getElementById('cpnDiscountType').value = coupon.discount_type || 'percentage';
    document.getElementById('cpnDiscountValue').value = coupon.discount_value || '';

    // Pre-check services
    const svcCheckboxes = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    const isAll = coupon.applicable_services?.length >= availableServices.length;
    svcCheckboxes.forEach(c => {
        if (c.value === 'all') {
            c.checked = isAll;
        } else if (coupon.applicable_services) {
            c.checked = coupon.applicable_services.some(svc =>
                (typeof svc === 'object' ? svc.service_id : svc) === c.value
            );
        } else {
            c.checked = false;
        }
    });
    applyServiceSelection();

    document.getElementById('cpnMinBooking').value = coupon.min_bill_amount || '';
    document.getElementById('cpnUsageLimit').value = coupon.total_usage_limit || '';
    document.getElementById('cpnUsagePerCustomer').value = coupon.usage_per_customer || '';

    const tog = document.getElementById('cpnStatusToggle');
    tog.checked = coupon.status === 'active';
    document.getElementById('cpnStatusLabel').textContent = tog.checked ? 'Active' : 'Inactive';

    document.getElementById('cpnStartDate').value = coupon.valid_from ? coupon.valid_from.split('T')[0] : '';
    document.getElementById('cpnEndDate').value = coupon.valid_to ? coupon.valid_to.split('T')[0] : '';

    document.querySelector('#couponModalOverlay h2').textContent = 'Edit Coupon';
    document.getElementById('btnSaveCoupon').textContent = 'Save Changes';

    const cpnCodeInput = document.getElementById('cpnCode');
    cpnCodeInput.readOnly = true;
    cpnCodeInput.style.background = '#f1f5f9';
    cpnCodeInput.style.color = '#94a3b8';
    cpnCodeInput.style.cursor = 'not-allowed';

    document.getElementById('couponModalOverlay').classList.add('active');
};

window.deleteCoupon = function(id) {
    couponToDelete = id;
    document.getElementById('deleteCouponConfirmOverlay')?.classList.add('active');
};

function closeModal() {
    document.getElementById('couponModalOverlay').classList.remove('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Delete (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
async function executeDeleteCoupon(id) {
    const deletingOverlay = document.getElementById('deletingCouponOverlay');
    if (deletingOverlay) deletingOverlay.classList.add('active');

    try {
        const { error } = await supabase
            .from('coupons')
            .eq('coupon_id', id)
            .update({ status: 'deleted' });

        if (error) throw error;

        showToast('Coupon deleted successfully');
        await loadCoupons();
    } catch (err) {
        console.error(err);
        showToast('Error deleting coupon: ' + (err.message || ''));
    } finally {
        if (deletingOverlay) deletingOverlay.classList.remove('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE: Save (Create or Update) Coupon
// ─────────────────────────────────────────────────────────────────────────────
async function handleSaveCoupon() {
    const coupon_code = document.getElementById('cpnCode').value.trim();
    const discount_type = document.getElementById('cpnDiscountType').value;
    const discount_value = document.getElementById('cpnDiscountValue').value;

    if (!coupon_code || !discount_type || !discount_value) {
        showToast('Please fill all required fields (Code, Type, Value).');
        return;
    }

    // Build service list
    const existingCoupon = isEditing && currentEditId
        ? currentCoupons.find(c => (c.coupon_id || c.id) === currentEditId)
        : null;

    const checkboxes = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    const hasAllSelected = Array.from(checkboxes).some(c => c.value === 'all' && c.checked);

    let applicableServices = [];
    if (hasAllSelected) {
        applicableServices = availableServices.map(svc => {
            const existing = existingCoupon?.applicable_services?.find(s => s.service_id === svc.service_id);
            return { service_id: svc.service_id, service_name: svc.service_name, current_usage_count: existing?.current_usage_count || 0 };
        });
    } else {
        Array.from(checkboxes)
            .filter(c => c.checked && c.value !== 'all')
            .forEach(c => {
                const existing = existingCoupon?.applicable_services?.find(s => s.service_id === c.value);
                applicableServices.push({
                    service_id: c.value,
                    service_name: c.nextSibling?.textContent?.trim() || c.value,
                    current_usage_count: existing?.current_usage_count || 0
                });
            });
    }

    if (applicableServices.length === 0) {
        // Fallback: apply to all services
        applicableServices = availableServices.map(svc => ({
            service_id: svc.service_id,
            service_name: svc.service_name,
            current_usage_count: existingCoupon?.applicable_services?.find(s => s.service_id === svc.service_id)?.current_usage_count || 0
        }));
    }

    const couponPayload = {
        company_id: getCompanyId(),
        branch_id: getBranchId(),
        coupon_code,
        discount_type,
        discount_value: parseFloat(discount_value),
        status: document.getElementById('cpnStatusToggle').checked ? 'active' : 'inactive',
        min_bill_amount: document.getElementById('cpnMinBooking').value ? parseFloat(document.getElementById('cpnMinBooking').value) : null,
        total_usage_limit: document.getElementById('cpnUsageLimit').value ? parseInt(document.getElementById('cpnUsageLimit').value, 10) : null,
        usage_per_customer: document.getElementById('cpnUsagePerCustomer').value ? parseInt(document.getElementById('cpnUsagePerCustomer').value, 10) : null,
        valid_from: document.getElementById('cpnStartDate').value || null,
        valid_to: document.getElementById('cpnEndDate').value || null
    };

    const btnSave = document.getElementById('btnSaveCoupon');
    const origText = btnSave.textContent;
    btnSave.textContent = 'Saving...';
    btnSave.disabled = true;

    try {
        let couponId = currentEditId;

        if (isEditing) {
            // UPDATE coupon row
            const { error } = await supabase
                .from('coupons')
                .eq('coupon_id', couponId)
                .update(couponPayload);
            if (error) throw error;

            // DELETE old service links then re-insert
            const { error: delErr } = await supabase
                .from('coupon_services')
                .delete()
                .eq('coupon_id', couponId);
            if (delErr) console.warn('coupon_services delete warning:', delErr.message);

        } else {
            // INSERT new coupon
            couponId = crypto.randomUUID();
            couponPayload.coupon_id = couponId;

            const { error } = await supabase
                .from('coupons')
                .insert(couponPayload);
            if (error) throw error;
        }

        // INSERT coupon_services links
        if (couponId && applicableServices.length > 0) {
            const svcRows = applicableServices.map(svc => ({
                coupon_id: couponId,
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                service_id: svc.service_id,
                service_name: svc.service_name,
                current_usage_count: svc.current_usage_count
            }));

            const { error: insErr } = await supabase
                .from('coupon_services')
                .insert(svcRows);
            if (insErr) console.warn('coupon_services insert warning:', insErr.message);
        }

        showToast(isEditing ? 'Coupon updated successfully' : 'Coupon created successfully');
        closeModal();
        await loadCoupons();
    } catch (err) {
        console.error(err);
        showToast('Error saving coupon: ' + (err.message || 'Unknown error'));
    } finally {
        btnSave.textContent = origText;
        btnSave.disabled = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else {
        alert(message);
    }
}
