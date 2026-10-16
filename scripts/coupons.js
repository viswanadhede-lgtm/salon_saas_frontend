import { supabase } from '../lib/supabase.js';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STATE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentCoupons  = [];
let isEditing       = false;
let currentEditId   = null;
let couponToDelete  = null;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONTEXT HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};
const getBranchId = () =>
    localStorage.getItem('active_branch_id') ||
    document.getElementById('branchSelect')?.value || null;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// APPLICABLE-TO VISUAL FEEDBACK  (mirrors memberships pattern)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateApplicableToVisuals() {
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb    = document.getElementById(`cpnAppTo${type}`);
        const label = document.getElementById(`cpnAppTo${type}Label`);
        if (!cb || !label) return;
        if (cb.checked) {
            label.style.borderColor = '#6366f1';
            label.style.background  = '#eef2ff';
        } else {
            label.style.borderColor = '#e2e8f0';
            label.style.background  = '#f8fafc';
        }
    });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DOM READY
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', async () => {
    if (window.feather) feather.replace();

    await loadCoupons();

    // Branch change -> reload
    document.getElementById('branchSelect')?.addEventListener('change', loadCoupons);

    // -- Filter panel -----------------------------------------------------------
    const filterPanel = document.getElementById('cpnFilterPanel');
    const btnFilter   = document.getElementById('btnFilterCoupons');
    if (btnFilter && filterPanel) {
        btnFilter.addEventListener('click', e => {
            e.stopPropagation();
            filterPanel.style.display = filterPanel.style.display === 'block' ? 'none' : 'block';
        });
        document.getElementById('btnCloseCpnFilter')?.addEventListener('click', () => {
            filterPanel.style.display = 'none';
        });
        document.getElementById('btnCpnFilterApply')?.addEventListener('click', () => {
            filterPanel.style.display = 'none';
            renderCoupons();
        });
        document.getElementById('btnCpnFilterReset')?.addEventListener('click', () => {
            filterPanel.querySelectorAll('input').forEach(i => i.checked = false);
            renderCoupons();
        });
        document.querySelectorAll('input[name="filterDiscountType"]').forEach(cb => {
            cb.addEventListener('change', renderCoupons);
        });
        filterPanel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => { filterPanel.style.display = 'none'; });
    }

    // -- Create Coupon button ---------------------------------------------------
    const btnCreate = document.getElementById('btnCreateCoupon');
    if (btnCreate) {
        btnCreate.setAttribute('data-sub-feature', 'create_coupon');
        btnCreate.addEventListener('click', openCreateModal);
    }

    // -- Modal close ------------------------------------------------------------
    document.getElementById('closeCouponModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelCoupon')?.addEventListener('click', closeModal);
    document.getElementById('couponModalOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('couponModalOverlay')) closeModal();
    });

    // -- Delete confirm modal ---------------------------------------------------
    document.getElementById('btnCancelDeleteCoupon')?.addEventListener('click', () => {
        document.getElementById('deleteCouponConfirmOverlay')?.classList.remove('active');
        couponToDelete = null;
    });
    document.getElementById('btnConfirmDeleteCoupon')?.addEventListener('click', async () => {
        if (!couponToDelete) return;
        document.getElementById('deleteCouponConfirmOverlay')?.classList.remove('active');
        await executeDeleteCoupon(couponToDelete);
        couponToDelete = null;
    });

    // -- Discount type -> update placeholder ------------------------------------
    const discType = document.getElementById('cpnDiscountType');
    const discVal  = document.getElementById('cpnDiscountValue');
    if (discType && discVal) {
        discType.addEventListener('change', () => {
            discVal.placeholder = discType.value === 'percentage' ? 'e.g. 10' : 'e.g. 100';
        });
    }

    // -- Auto-uppercase coupon code --------------------------------------------
    const codeInput = document.getElementById('cpnCode');
    if (codeInput) {
        codeInput.addEventListener('input', () => {
            codeInput.value = codeInput.value.toUpperCase();
        });
    }

    // -- Applicable-to checkbox visuals ----------------------------------------
    ['Services', 'Products', 'Memberships'].forEach(type => {
        document.getElementById(`cpnAppTo${type}`)?.addEventListener('change', updateApplicableToVisuals);
    });

    // -- Search ----------------------------------------------------------------
    document.getElementById('couponsSearchInput')?.addEventListener('input', renderCoupons);

    // -- Save ------------------------------------------------------------------
    document.getElementById('btnSaveCoupon')?.addEventListener('click', handleSaveCoupon);
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// LOAD COUPONS  (1 row per coupon â€” no grouping needed)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="padding:24px 20px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                    <span style="font-size:0.9rem;">Loading coupons...</span>
                </div>
            </td>
        </tr>`;
    if (window.feather) feather.replace();

    try {
        const { data, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId())
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentCoupons = data || [];
        renderCoupons();
    } catch (err) {
        console.error('loadCoupons error:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#ef4444;">Failed to load coupons: ${err.message || ''}</td></tr>`;
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BUILD "APPLICABLE TO" DISPLAY  from boolean columns
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildApplicableToDisplay(coupon) {
    const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;margin:1px 2px 1px 0;white-space:nowrap;`;
    const chips = [];

    if (coupon.all_services)    chips.push(`<span style="${chipStyle}background:#e0f2fe;color:#0284c7;">Services</span>`);
    if (coupon.all_products)    chips.push(`<span style="${chipStyle}background:#dcfce7;color:#15803d;">Products</span>`);
    if (coupon.all_memberships) chips.push(`<span style="${chipStyle}background:#faf5ff;color:#7c3aed;">Memberships</span>`);

    if (chips.length === 0) {
        return `<span style="${chipStyle}background:#f1f5f9;color:#64748b;">None</span>`;
    }
    return chips.join('');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// RENDER TABLE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;

    const q = (document.getElementById('couponsSearchInput')?.value || '').toLowerCase().trim();
    const activeTypes = Array.from(
        document.querySelectorAll('input[name="filterDiscountType"]:checked')
    ).map(cb => cb.value);

    let list = currentCoupons;

    if (q) {
        list = list.filter(c => (c.coupon_code || '').toLowerCase().includes(q));
    }
    if (activeTypes.length > 0) {
        list = list.filter(c => activeTypes.includes(c.discount_type));
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">No coupons found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(coupon => {
        const couponId        = coupon.coupon_id || coupon.id;
        const isFlat          = coupon.discount_type === 'flat';
        const discountDisplay = isFlat
            ? `\u20B9${coupon.discount_value} OFF`
            : `${coupon.discount_value}% OFF`;
        const badgeColor = isFlat
            ? 'color:#15803d;background:#dcfce7;'
            : 'color:#0284c7;background:#e0f2fe;';

        let validityText = 'Always Active';
        if (coupon.valid_from || coupon.valid_to) {
            const startStr = coupon.valid_from ? new Date(coupon.valid_from).toLocaleDateString() : 'Now';
            const endStr   = coupon.valid_to   ? new Date(coupon.valid_to).toLocaleDateString()   : 'No Expiry';
            validityText   = `${startStr} \u2013 ${endStr}`;
        }

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:16px 20px;"><span class="cpn-code-badge">${coupon.coupon_code || 'N/A'}</span></td>
                <td style="padding:16px 20px;"><span style="font-weight:700;${badgeColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountDisplay}</span></td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;text-transform:capitalize;">${coupon.discount_type || '-'}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;">${buildApplicableToDisplay(coupon)}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#64748b;text-align:center;">${validityText}</td>
                <td style="padding:14px 16px; vertical-align:middle;">
                    <div class="action-buttons" style="display:flex;justify-content:center;gap:0.5rem;">
                        <button class="hover-lift edit-btn" data-sub-feature="update_coupon"
                            onclick="window.editCoupon('${couponId}')" title="Edit Coupon"
                            style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #e0e7ff;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Edit</span>
                        </button>
                        <button class="hover-lift delete-btn" data-sub-feature="delete_coupon"
                            onclick="window.deleteCoupon('${couponId}')" title="Delete Coupon"
                            style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #fee2e2;background:#fef2f2;cursor:pointer;color:#ef4444;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            <span style="font-size:10px;font-weight:600;">Delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MODAL: OPEN CREATE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openCreateModal() {
    isEditing     = false;
    currentEditId = null;

    document.getElementById('cpnCode').value          = '';
    document.getElementById('cpnDiscountType').value  = '';
    document.getElementById('cpnDiscountValue').value = '';
    document.getElementById('cpnMinBooking').value    = '';
    document.getElementById('cpnStartDate').value     = '';
    document.getElementById('cpnEndDate').value       = '';

    // Reset applicable-to checkboxes
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb = document.getElementById(`cpnAppTo${type}`);
        if (cb) cb.checked = false;
    });
    updateApplicableToVisuals();

    // Coupon code editable
    const cpnCodeInput            = document.getElementById('cpnCode');
    cpnCodeInput.readOnly         = false;
    cpnCodeInput.style.background = '';
    cpnCodeInput.style.color      = '';
    cpnCodeInput.style.cursor     = '';

    document.querySelector('#couponModalOverlay h2').textContent = 'Create Coupon';
    document.getElementById('btnSaveCoupon').textContent         = 'Create Coupon';
    document.getElementById('couponModalOverlay').classList.add('active');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MODAL: OPEN EDIT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.editCoupon = function(id) {
    const coupon = currentCoupons.find(c => (c.coupon_id || c.id) === id);
    if (!coupon) return;

    isEditing     = true;
    currentEditId = id;

    document.getElementById('cpnCode').value          = coupon.coupon_code    || '';
    document.getElementById('cpnDiscountType').value  = coupon.discount_type  || 'percentage';
    document.getElementById('cpnDiscountValue').value = coupon.discount_value != null ? coupon.discount_value : '';
    document.getElementById('cpnMinBooking').value    = coupon.min_bill_amount != null ? coupon.min_bill_amount : '';
    document.getElementById('cpnStartDate').value     = coupon.valid_from ? coupon.valid_from.split('T')[0] : '';
    document.getElementById('cpnEndDate').value       = coupon.valid_to   ? coupon.valid_to.split('T')[0]   : '';

    // Pre-check applicable-to booleans
    const cb_s = document.getElementById('cpnAppToServices');
    const cb_p = document.getElementById('cpnAppToProducts');
    const cb_m = document.getElementById('cpnAppToMemberships');
    if (cb_s) cb_s.checked = !!coupon.all_services;
    if (cb_p) cb_p.checked = !!coupon.all_products;
    if (cb_m) cb_m.checked = !!coupon.all_memberships;
    updateApplicableToVisuals();

    // Lock coupon code during edit
    const cpnCodeInput            = document.getElementById('cpnCode');
    cpnCodeInput.readOnly         = true;
    cpnCodeInput.style.background = '#f1f5f9';
    cpnCodeInput.style.color      = '#94a3b8';
    cpnCodeInput.style.cursor     = 'not-allowed';

    document.querySelector('#couponModalOverlay h2').textContent = 'Edit Coupon';
    document.getElementById('btnSaveCoupon').textContent         = 'Save Changes';
    document.getElementById('couponModalOverlay').classList.add('active');
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MODAL: CLOSE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function closeModal() {
    document.getElementById('couponModalOverlay').classList.remove('active');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DELETE: trigger confirm modal
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.deleteCoupon = function(id) {
    couponToDelete = id;
    document.getElementById('deleteCouponConfirmOverlay')?.classList.add('active');
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DELETE: execute soft-delete  (correct chain: .update().eq())
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function executeDeleteCoupon(id) {
    const deletingOverlay = document.getElementById('deletingCouponOverlay');
    if (deletingOverlay) deletingOverlay.classList.add('active');

    try {
        const { error } = await supabase
            .from('coupons')
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq('coupon_id', id);

        if (error) throw error;

        showToast('Coupon deleted successfully');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_coupon', {
                title:   'Coupon Deleted',
                message: 'A coupon was deleted.'
            });
        }
        await loadCoupons();
    } catch (err) {
        console.error('executeDeleteCoupon error:', err);
        showToast('Error deleting coupon: ' + (err.message || ''));
    } finally {
        if (deletingOverlay) deletingOverlay.classList.remove('active');
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SAVE (Create or Update)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleSaveCoupon() {
    // Declare btnSave & origText at the TOP so the finally block can always reach them
    const btnSave  = document.getElementById('btnSaveCoupon');
    const origText = btnSave?.textContent || 'Save';

    const coupon_code    = document.getElementById('cpnCode').value.trim();
    const discount_type  = document.getElementById('cpnDiscountType').value;
    const discount_value = document.getElementById('cpnDiscountValue').value;

    if (!coupon_code || !discount_type || !discount_value) {
        showToast('Please fill all required fields (Code, Type, Value).');
        return;
    }

    // Duplicate check on create
    if (!isEditing) {
        const isDuplicate = currentCoupons.some(
            c => (c.coupon_code || '').toUpperCase() === coupon_code.toUpperCase()
        );
        if (isDuplicate) {
            showToast('A coupon with this code already exists.');
            return;
        }
    }

    if (btnSave) { btnSave.textContent = 'Saving...'; btnSave.disabled = true; }

    // Read the three booleans
    const all_services    = !!(document.getElementById('cpnAppToServices')?.checked);
    const all_products    = !!(document.getElementById('cpnAppToProducts')?.checked);
    const all_memberships = !!(document.getElementById('cpnAppToMemberships')?.checked);

    const payload = {
        company_id:      getCompanyId(),
        branch_id:       getBranchId(),
        coupon_code,
        discount_type,
        discount_value:  parseFloat(discount_value),
        status:          'active',
        min_bill_amount: document.getElementById('cpnMinBooking').value
            ? parseFloat(document.getElementById('cpnMinBooking').value)
            : null,
        valid_from:      document.getElementById('cpnStartDate').value || null,
        valid_to:        document.getElementById('cpnEndDate').value   || null,
        all_services,
        all_products,
        all_memberships,
        updated_at:      new Date().toISOString()
    };

    try {
        if (isEditing) {
            // UPDATE existing row by coupon_id (correct chain: .update().eq())
            const { error } = await supabase
                .from('coupons')
                .update(payload)
                .eq('coupon_id', currentEditId);

            if (error) throw error;
        } else {
            // INSERT new row â€” DB generates coupon_id via DEFAULT gen_random_uuid()
            const { error } = await supabase
                .from('coupons')
                .insert({ ...payload, created_at: new Date().toISOString() });

            if (error) throw error;
        }

        showToast(isEditing ? 'Coupon updated successfully' : 'Coupon created successfully');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_coupon', {
                title:   isEditing ? 'Coupon Modified' : 'New Coupon Created',
                message: `Coupon "${coupon_code}" was ${isEditing ? 'updated' : 'created'}.`
            });
        }
        closeModal();
        await loadCoupons();
    } catch (err) {
        console.error('handleSaveCoupon error:', err);
        showToast('Error saving coupon: ' + (err.message || 'Unknown error'));
    } finally {
        if (btnSave) { btnSave.textContent = origText; btnSave.disabled = false; }
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TOAST
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

