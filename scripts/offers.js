import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentOffers = [];
let isEditing     = false;
let currentEditId = null;
let offerToDelete = null;

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};
const getBranchId = () =>
    localStorage.getItem('active_branch_id') ||
    document.getElementById('branchSelect')?.value || null;

// ─────────────────────────────────────────────────────────────────────────────
// APPLICABLE-TO VISUAL FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
function updateApplicableToVisuals() {
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb    = document.getElementById(`offerAppTo${type}`);
        const label = document.getElementById(`offerAppTo${type}Label`);
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

// ─────────────────────────────────────────────────────────────────────────────
// DOM READY
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (window.feather) feather.replace();

    await loadOffers();

    // Branch change -> reload
    document.getElementById('branchSelect')?.addEventListener('change', loadOffers);

    // -- Filter panel -----------------------------------------------------------
    const filterPanel = document.getElementById('offersFilterPanel');
    const btnFilter   = document.getElementById('btnFilterOffers');
    if (btnFilter && filterPanel) {
        btnFilter.addEventListener('click', e => {
            e.stopPropagation();
            filterPanel.style.display = filterPanel.style.display === 'block' ? 'none' : 'block';
        });
        document.getElementById('btnCloseOffersFilter')?.addEventListener('click', () => {
            filterPanel.style.display = 'none';
        });
        document.getElementById('btnOffersFilterApply')?.addEventListener('click', () => {
            filterPanel.style.display = 'none';
            renderOffers();
        });
        document.getElementById('btnOffersFilterReset')?.addEventListener('click', () => {
            filterPanel.querySelectorAll('input').forEach(i => i.checked = false);
            renderOffers();
        });
        document.querySelectorAll('input[name="filterDiscountType"]').forEach(cb => {
            cb.addEventListener('change', renderOffers);
        });
        filterPanel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => { filterPanel.style.display = 'none'; });
    }

    // -- Create Offer button ---------------------------------------------------
    const btnCreate = document.getElementById('btnCreateOffer');
    if (btnCreate) {
        btnCreate.setAttribute('data-sub-feature', 'create_offer');
        btnCreate.addEventListener('click', openCreateModal);
    }

    // -- Modal close ------------------------------------------------------------
    document.getElementById('closeOfferModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelOffer')?.addEventListener('click', closeModal);
    document.getElementById('offerModalOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('offerModalOverlay')) closeModal();
    });

    // -- Delete confirm modal ---------------------------------------------------
    document.getElementById('btnCancelDeleteOffer')?.addEventListener('click', () => {
        document.getElementById('deleteOfferConfirmOverlay')?.classList.remove('active');
        offerToDelete = null;
    });
    document.getElementById('btnConfirmDeleteOffer')?.addEventListener('click', async () => {
        if (!offerToDelete) return;
        document.getElementById('deleteOfferConfirmOverlay')?.classList.remove('active');
        await executeDeleteOffer(offerToDelete);
        offerToDelete = null;
    });

    // -- Discount type -> update placeholder ------------------------------------
    const discType = document.getElementById('offerDiscountType');
    const discVal  = document.getElementById('offerDiscountValue');
    if (discType && discVal) {
        discType.addEventListener('change', () => {
            discVal.placeholder = discType.value === 'percentage' ? 'e.g., 20' : 'e.g., 200';
        });
    }

    // -- Applicable-to checkbox visuals ----------------------------------------
    ['Services', 'Products', 'Memberships'].forEach(type => {
        document.getElementById(`offerAppTo${type}`)?.addEventListener('change', updateApplicableToVisuals);
    });

    // -- Search ----------------------------------------------------------------
    document.getElementById('offersSearchInput')?.addEventListener('input', renderOffers);

    // -- Save ------------------------------------------------------------------
    document.getElementById('btnSaveOffer')?.addEventListener('click', handleSaveOffer);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOAD OFFERS
// ─────────────────────────────────────────────────────────────────────────────
async function loadOffers() {
    const tbody = document.getElementById('offersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="padding:24px 20px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <div style="width:24px;height:24px;border:3px solid #e0e7ff;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                    <span style="font-size:0.9rem;">Loading offers...</span>
                </div>
            </td>
        </tr>`;
    if (window.feather) feather.replace();

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        if (!companyId || !branchId) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">No company or branch selected.</td></tr>`;
            return;
        }

        const { data, error } = await supabase
            .from('offers')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentOffers = data || [];
        renderOffers();
    } catch (err) {
        console.error('loadOffers error:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#ef4444;">Failed to load offers: ${err.message || ''}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD "APPLICABLE TO" DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function buildApplicableToDisplay(offer) {
    const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;margin:1px 2px 1px 0;white-space:nowrap;`;
    const chips = [];

    if (offer.all_services)    chips.push(`<span style="${chipStyle}background:#e0f2fe;color:#0284c7;">Services</span>`);
    if (offer.all_products)    chips.push(`<span style="${chipStyle}background:#dcfce7;color:#15803d;">Products</span>`);
    if (offer.all_memberships) chips.push(`<span style="${chipStyle}background:#faf5ff;color:#7c3aed;">Memberships</span>`);

    if (chips.length === 0) {
        return `<span style="${chipStyle}background:#f1f5f9;color:#64748b;">None</span>`;
    }
    return chips.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER TABLE
// ─────────────────────────────────────────────────────────────────────────────
function renderOffers() {
    const tbody = document.getElementById('offersTableBody');
    if (!tbody) return;

    const q = (document.getElementById('offersSearchInput')?.value || '').toLowerCase().trim();
    const activeTypes = Array.from(
        document.querySelectorAll('input[name="filterDiscountType"]:checked')
    ).map(cb => cb.value);

    let list = currentOffers;

    if (q) {
        list = list.filter(o => (o.offer_name || '').toLowerCase().includes(q));
    }
    if (activeTypes.length > 0) {
        list = list.filter(o => activeTypes.includes(o.discount_type));
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">No offers found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(offer => {
        const offerId         = offer.id || offer.offer_id;
        const isFlat          = offer.discount_type === 'flat';
        const discountDisplay = isFlat
            ? `\u20B9${offer.discount_value} OFF`
            : `${offer.discount_value}% OFF`;
        const badgeColor = isFlat
            ? 'color:#15803d;background:#dcfce7;'
            : 'color:#0284c7;background:#e0f2fe;';

        let validityText = 'Always Active';
        if (offer.valid_from || offer.valid_to) {
            const startStr = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString() : 'Now';
            const endStr   = offer.valid_to   ? new Date(offer.valid_to).toLocaleDateString()   : 'No Expiry';
            validityText   = `${startStr} \u2013 ${endStr}`;
        }

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:16px 20px;"><span style="font-weight:600;color:#1e293b;">${offer.offer_name || 'N/A'}</span></td>
                <td style="padding:16px 20px;"><span style="font-weight:700;${badgeColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountDisplay}</span></td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;text-transform:capitalize;">${offer.discount_type || '-'}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;">${buildApplicableToDisplay(offer)}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#64748b;text-align:center;">${validityText}</td>
                <td style="padding:14px 16px; vertical-align:middle;">
                    <div class="action-buttons" style="display:flex;justify-content:center;gap:0.5rem;">
                        <button class="hover-lift edit-btn" data-sub-feature="update_offer"
                            onclick="window.editOffer('${offerId}')" title="Edit Offer"
                            style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #e0e7ff;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Edit</span>
                        </button>
                        <button class="hover-lift delete-btn" data-sub-feature="delete_offer"
                            onclick="window.deleteOffer('${offerId}')" title="Delete Offer"
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

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: OPEN CREATE
// ─────────────────────────────────────────────────────────────────────────────
function openCreateModal() {
    isEditing     = false;
    currentEditId = null;

    document.getElementById('offerName').value          = '';
    document.getElementById('offerDiscountType').value  = 'percentage';
    document.getElementById('offerDiscountValue').value = '';
    document.getElementById('offerDiscountValue').placeholder = 'e.g., 20';
    document.getElementById('offerMinBillAmount').value = '';
    document.getElementById('offerStartDate').value     = '';
    document.getElementById('offerEndDate').value       = '';

    // Reset applicable-to checkboxes
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb = document.getElementById(`offerAppTo${type}`);
        if (cb) cb.checked = false;
    });
    updateApplicableToVisuals();

    const titleEl = document.querySelector('#offerModalOverlay .header-titles h2') || document.querySelector('#offerModalOverlay h2');
    if (titleEl) titleEl.textContent = 'Create Offer';
    const btnSave = document.getElementById('btnSaveOffer');
    if (btnSave) btnSave.textContent = 'Create Offer';

    document.getElementById('offerModalOverlay')?.classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: OPEN EDIT
// ─────────────────────────────────────────────────────────────────────────────
window.editOffer = function(id) {
    const offer = currentOffers.find(o => (o.id === id || o.offer_id === id));
    if (!offer) return;

    isEditing     = true;
    currentEditId = offer.id || offer.offer_id;

    document.getElementById('offerName').value          = offer.offer_name || '';
    document.getElementById('offerDiscountType').value  = offer.discount_type || 'percentage';
    document.getElementById('offerDiscountValue').value = offer.discount_value != null ? offer.discount_value : '';
    document.getElementById('offerDiscountValue').placeholder = (offer.discount_type === 'flat') ? 'e.g., 200' : 'e.g., 20';
    document.getElementById('offerMinBillAmount').value = offer.min_bill_amount != null ? offer.min_bill_amount : '';
    document.getElementById('offerStartDate').value     = offer.valid_from ? offer.valid_from.split('T')[0] : '';
    document.getElementById('offerEndDate').value       = offer.valid_to   ? offer.valid_to.split('T')[0]   : '';

    // Pre-check applicable-to booleans
    const cb_s = document.getElementById('offerAppToServices');
    const cb_p = document.getElementById('offerAppToProducts');
    const cb_m = document.getElementById('offerAppToMemberships');
    if (cb_s) cb_s.checked = !!offer.all_services;
    if (cb_p) cb_p.checked = !!offer.all_products;
    if (cb_m) cb_m.checked = !!offer.all_memberships;
    updateApplicableToVisuals();

    const titleEl = document.querySelector('#offerModalOverlay .header-titles h2') || document.querySelector('#offerModalOverlay h2');
    if (titleEl) titleEl.textContent = 'Edit Offer';
    const btnSave = document.getElementById('btnSaveOffer');
    if (btnSave) btnSave.textContent = 'Save Changes';

    document.getElementById('offerModalOverlay')?.classList.add('active');
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CLOSE
// ─────────────────────────────────────────────────────────────────────────────
function closeModal() {
    document.getElementById('offerModalOverlay')?.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: TRIGGER CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────
window.deleteOffer = function(id) {
    offerToDelete = id;
    document.getElementById('deleteOfferConfirmOverlay')?.classList.add('active');
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: EXECUTE SOFT-DELETE (.update().eq())
// ─────────────────────────────────────────────────────────────────────────────
async function executeDeleteOffer(id) {
    const deletingOverlay = document.getElementById('deletingOfferOverlay');
    if (deletingOverlay) deletingOverlay.classList.add('active');

    try {
        const offer = currentOffers.find(o => (o.id === id || o.offer_id === id));
        const targetCol = offer?.id ? 'id' : 'offer_id';
        const targetVal = offer?.id || offer?.offer_id || id;

        const { error } = await supabase
            .from('offers')
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq(targetCol, targetVal);

        if (error) throw error;

        showToast('Offer deleted successfully');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_offer', {
                title:   'Offer Deleted',
                message: 'An offer was deleted.'
            });
        }
        await loadOffers();
    } catch (err) {
        console.error('executeDeleteOffer error:', err);
        showToast('Error deleting offer: ' + (err.message || ''));
    } finally {
        if (deletingOverlay) deletingOverlay.classList.remove('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE (CREATE OR UPDATE)
// ─────────────────────────────────────────────────────────────────────────────
async function handleSaveOffer() {
    const btnSave  = document.getElementById('btnSaveOffer');
    const origText = btnSave?.textContent || 'Save';

    const offer_name     = document.getElementById('offerName').value.trim();
    const discount_type  = document.getElementById('offerDiscountType').value;
    const discount_value = document.getElementById('offerDiscountValue').value;

    if (!offer_name || !discount_type || !discount_value) {
        showToast('Please fill all required fields (Name, Type, Value).');
        return;
    }

    // Duplicate check on create
    if (!isEditing) {
        const isDuplicate = currentOffers.some(
            o => (o.offer_name || '').toLowerCase() === offer_name.toLowerCase()
        );
        if (isDuplicate) {
            showToast('An offer with this name already exists.');
            return;
        }
    }

    if (btnSave) { btnSave.textContent = 'Saving...'; btnSave.disabled = true; }

    const all_services    = !!(document.getElementById('offerAppToServices')?.checked);
    const all_products    = !!(document.getElementById('offerAppToProducts')?.checked);
    const all_memberships = !!(document.getElementById('offerAppToMemberships')?.checked);

    const payload = {
        company_id:      getCompanyId(),
        branch_id:       getBranchId(),
        offer_name,
        discount_type,
        discount_value:  parseFloat(discount_value),
        status:          'active',
        min_bill_amount: document.getElementById('offerMinBillAmount').value
            ? parseFloat(document.getElementById('offerMinBillAmount').value)
            : null,
        valid_from:      document.getElementById('offerStartDate').value || null,
        valid_to:        document.getElementById('offerEndDate').value   || null,
        all_services,
        all_products,
        all_memberships,
        updated_at:      new Date().toISOString()
    };

    try {
        if (isEditing) {
            const offer = currentOffers.find(o => (o.id === currentEditId || o.offer_id === currentEditId));
            const targetCol = offer?.id ? 'id' : 'offer_id';
            const targetVal = offer?.id || offer?.offer_id || currentEditId;

            const { error } = await supabase
                .from('offers')
                .update(payload)
                .eq(targetCol, targetVal);

            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('offers')
                .insert([{ ...payload, created_at: new Date().toISOString() }]);

            if (error) throw error;
        }

        showToast(isEditing ? 'Offer updated successfully' : 'Offer created successfully');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_offer', {
                title:   isEditing ? 'Offer Modified' : 'New Offer Created',
                message: `Offer "${offer_name}" was ${isEditing ? 'updated' : 'created'}.`
            });
        }
        if (!isEditing && window.notifyCustomer) {
            window.notifyCustomer('new_offer', {
                title:     'New Offer Available!',
                message:   `Check out our new offer: ${offer_name}`,
                offerName: offer_name
            });
            window.notifyCustomer('new_discount', {
                title:     'New Discount Available!',
                message:   `Save more with our latest discount: ${offer_name}`,
                offerName: offer_name
            });
        }
        closeModal();
        await loadOffers();
    } catch (err) {
        console.error('handleSaveOffer error:', err);
        showToast('Error saving offer: ' + (err.message || 'Unknown error'));
    } finally {
        if (btnSave) { btnSave.textContent = origText; btnSave.disabled = false; }
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
