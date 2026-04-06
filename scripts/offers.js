import { supabase } from '../lib/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    let offers = [];
    let services = [];
    let isEditMode = false;
    let editingOfferId = null;
    let offerToDeleteId = null;

    // Global context getters
    const getCompanyId = () => {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    };
    const getBranchId = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

    // DOM Elements - Table & Overlays
    const tbody = document.getElementById('offersTableBody');
    const deleteOverlay = document.getElementById('deleteOfferConfirmOverlay');
    const deletingLoader = document.getElementById('deletingOfferOverlay');
    const btnCancelDelete = document.getElementById('btnCancelDeleteOffer');
    const btnConfirmDelete = document.getElementById('btnConfirmDeleteOffer');

    // DOM Elements - Modal & Form
    const modalOverlay = document.getElementById('offerModalOverlay');
    const btnCreateOffer = document.getElementById('btnCreateOffer');
    const btnCancelOffer = document.getElementById('btnCancelOffer');
    const closeOfferModalBtn = document.getElementById('closeOfferModal');
    const btnSaveOffer = document.getElementById('btnSaveOffer');

    const offerNameEl = document.getElementById('offerName');
    const offerDiscountTypeEl = document.getElementById('offerDiscountType');
    const offerDiscountValueEl = document.getElementById('offerDiscountValue');
    const offerStartDateEl = document.getElementById('offerStartDate');
    const offerEndDateEl = document.getElementById('offerEndDate');
    const offerMinBillAmountEl = document.getElementById('offerMinBillAmount');
    const offerUsageLimitEl = document.getElementById('offerUsageLimit');
    const offerUsagePerCustomerEl = document.getElementById('offerUsagePerCustomer');
    const offerCurrentUsageCountEl = document.getElementById('offerCurrentUsageCount');
    const offerStatusEl = document.getElementById('offerStatus');

    // Multi-select dropdown elements
    const offerServicesText = document.getElementById('offerServicesText');
    const offerServicesMenu = document.getElementById('offerServicesMenu');
    const offerServicesBtn = document.getElementById('offerServicesBtn');

    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE: Initialise — fetch services then offers
    // ─────────────────────────────────────────────────────────────────────────
    async function initOffers() {
        if (!getCompanyId() || !getBranchId()) {
            console.error('Company ID or Branch ID missing from localStorage');
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">Configuration missing. Please re-login.</td></tr>`;
            return;
        }

        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align: center; padding: 2rem;">
                <div style="display:flex; justify-content:center; align-items:center; gap:8px;">
                    <div class="spinner" style="width:20px;height:20px;border:3px solid rgba(79,70,229,0.2);border-top-color:#4f46e5;border-radius:50%;animation:louSpin 1s linear infinite;"></div>
                    Loading Offers...
                </div>
            </td></tr>`;

        if (!document.getElementById('louSpinKeyframes')) {
            const style = document.createElement('style');
            style.id = 'louSpinKeyframes';
            style.innerHTML = `@keyframes louSpin { to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }

        try {
            // Fetch services from Supabase
            const { data: svcData, error: svcErr } = await supabase
                .from('services')
                .select('service_id, service_name, status')
                .eq('company_id', getCompanyId())
                .eq('branch_id', getBranchId());

            if (svcErr) console.warn('Could not load services:', svcErr.message);
            services = (svcData || []).filter(s => (s.status || '').toLowerCase() === 'active');

            populateServiceDropdown();
            await loadOffers();
        } catch (error) {
            console.error('Initialization error:', error);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Failed to load offers.</td></tr>`;
        }
    }

    function populateServiceDropdown() {
        const checkboxContainer = document.getElementById('servicesCheckboxList');
        if (!checkboxContainer) return;

        let html = `
            <label class="service-lbl" style="margin-bottom: 12px;">
                <input type="checkbox" class="custom-chk-circle serviceCheckboxes" value="All Categories" data-id="all">
                <span style="font-size: 0.95rem; color: #1e293b; font-weight: 500;">All Categories</span>
            </label>
            <div style="height: 1px; background: #e2e8f0; margin: 8px 0;"></div>
        `;

        services.forEach(srv => {
            html += `
                <label class="service-lbl" style="margin-bottom: 8px;">
                    <input type="checkbox" class="custom-chk-circle serviceCheckboxes" value="${srv.service_name}" data-id="${srv.service_id}">
                    <span style="font-size: 0.9rem; color: #475569;">${srv.service_name}</span>
                </label>
            `;
        });

        checkboxContainer.innerHTML = html;

        const newApplyBtn = document.getElementById('applyServicesBtn');
        const newResetBtn = document.getElementById('resetServicesBtn');
        const newCheckboxes = document.querySelectorAll('.serviceCheckboxes');
        const allCheckbox = document.querySelector('.serviceCheckboxes[data-id="all"]');
        const otherCheckboxes = document.querySelectorAll('.serviceCheckboxes:not([data-id="all"])');

        if (allCheckbox) {
            allCheckbox.addEventListener('change', (e) => {
                otherCheckboxes.forEach(cb => { cb.checked = e.target.checked; });
            });
            otherCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    allCheckbox.checked = Array.from(otherCheckboxes).every(c => c.checked);
                });
            });
        }

        if (newApplyBtn) {
            newApplyBtn.addEventListener('click', () => {
                const selected = Array.from(newCheckboxes).filter(c => c.checked).map(c => c.value);
                if (selected.length === 0) {
                    offerServicesText.textContent = 'Select services...';
                    offerServicesText.style.color = '#94a3b8';
                } else if (selected.includes('All Categories')) {
                    offerServicesText.textContent = 'All Categories';
                    offerServicesText.style.color = '#1e293b';
                } else if (selected.length === 1) {
                    offerServicesText.textContent = selected[0];
                    offerServicesText.style.color = '#1e293b';
                } else {
                    offerServicesText.textContent = `${selected[0]} +${selected.length - 1} more`;
                    offerServicesText.style.color = '#1e293b';
                }
                offerServicesMenu.style.display = 'none';
            });
        }

        if (newResetBtn) {
            newResetBtn.addEventListener('click', () => {
                newCheckboxes.forEach(chk => chk.checked = false);
                offerServicesText.textContent = 'Select services...';
                offerServicesText.style.color = '#94a3b8';
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE: Load Offers (+ offer_services join)
    // ─────────────────────────────────────────────────────────────────────────
    async function loadOffers() {
        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            // Fetch offers
            const { data: offersData, error: offersErr } = await supabase
                .from('offers')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false });

            if (offersErr) throw offersErr;

            // Fetch offer_services (junction table linking offers to services)
            const { data: offerServicesData, error: osErr } = await supabase
                .from('offer_services')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId);

            if (osErr) console.warn('offer_services fetch warning:', osErr.message);

            // Group offer_services by offer_id
            const servicesByOfferId = {};
            (offerServicesData || []).forEach(row => {
                if (!servicesByOfferId[row.offer_id]) servicesByOfferId[row.offer_id] = [];
                servicesByOfferId[row.offer_id].push({
                    service_id: row.service_id,
                    service_name: row.service_name || '',
                    current_usage_count: row.current_usage_count || 0
                });
            });

            // Merge
            offers = (offersData || []).map(o => ({
                ...o,
                applicable_services: servicesByOfferId[o.offer_id || o.id] || []
            }));

            renderOffersTable();
        } catch (error) {
            console.error('Error loading offers:', error);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Error fetching data: ${error.message}</td></tr>`;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER TABLE
    // ─────────────────────────────────────────────────────────────────────────
    function renderOffersTable() {
        if (offers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #64748b;">No offers found. Create one.</td></tr>`;
            return;
        }

        tbody.innerHTML = offers.map(offer => {
            const offerId = offer.offer_id || offer.id;
            const hasAllServices = offer.applicable_services.some(s => s.service_id === 'all');
            const tooltipServices = hasAllServices ? 'All Services' : offer.applicable_services.map(s => s.service_name).join('&#10;');
            const topServiceText = hasAllServices ? 'All Services' : (offer.applicable_services[0]?.service_name || 'None');
            const additionalCount = hasAllServices ? 0 : Math.max(0, offer.applicable_services.length - 1);

            let serviceHtml = `<span style="font-size: 0.9rem; color: #334155;">${topServiceText}</span>`;
            if (additionalCount > 0) {
                serviceHtml = `<div class="service-tooltip-wrapper" style="position: relative; display: inline-block; cursor: help;" title="${tooltipServices}">
                    <span style="font-size: 0.9rem; color: #334155;">${topServiceText} <span style="color: #64748b; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">+${additionalCount}</span></span>
                </div>`;
            } else if (!hasAllServices) {
                serviceHtml = `<div class="service-tooltip-wrapper" style="position: relative; display: inline-block; cursor: help;" title="${tooltipServices}">${serviceHtml}</div>`;
            }

            const fromText = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('en-GB') : '-';
            const toText = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('en-GB') : 'No Expiry';
            let validDatesHtml = `<div style="font-size: 0.9rem; color: #334155;">${fromText} – ${toText}</div>`;
            if (!offer.valid_from && !offer.valid_to) {
                validDatesHtml = `<div style="font-size: 0.9rem; color: #64748b; font-style: italic;">Always Active</div>`;
            }

            const totalMaxLimitStr = offer.total_usage_limit || '∞';
            const maxCurrentCount = offer.applicable_services.length > 0
                ? Math.max(...offer.applicable_services.map(s => s.current_usage_count || 0))
                : (offer.current_usage_count || 0);
            const counterDisplay = `${maxCurrentCount} / ${totalMaxLimitStr}`;

            const statusBadge = offer.status === 'active'
                ? `<span class="badge-pill" style="background:#dcfce7;color:#166534;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>Active</span>`
                : `<span class="badge-pill" style="background:#fee2e2;color:#b91c1c;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span>Inactive</span>`;

            const valueBadge = offer.discount_type === 'percentage'
                ? `<span style="font-weight:700;color:#0284c7;background:#e0f2fe;padding:4px 8px;border-radius:6px;font-size:0.85rem;">${offer.discount_value}% OFF</span>`
                : `<span style="font-weight:700;color:#15803d;background:#dcfce7;padding:4px 8px;border-radius:6px;font-size:0.85rem;">₹${offer.discount_value} OFF</span>`;

            return `
                <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
                    <td style="padding: 16px 20px;">
                        <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem;">${offer.offer_name || 'N/A'}</div>
                    </td>
                    <td style="padding: 16px 20px;">${valueBadge}</td>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 0.9rem; color: #334155; text-transform: capitalize;">${offer.discount_type || 'N/A'}</div>
                    </td>
                    <td style="padding: 16px 20px;">${serviceHtml}</td>
                    <td style="padding: 16px 20px;">${validDatesHtml}</td>
                    <td style="padding: 16px 20px;">${statusBadge}</td>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 0.9rem; color: #334155;"><span style="font-weight: 600;">${counterDisplay}</span></div>
                    </td>
                    <td style="padding: 16px 20px; text-align: center;">
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button class="icon-btn edit-btn" data-id="${offerId}" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #3b82f6;" title="Edit">
                                <i data-feather="edit-2" style="width: 16px; height: 16px;"></i>
                            </button>
                            <button class="icon-btn delete-btn" data-id="${offerId}" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #ef4444;" title="Delete">
                                <i data-feather="trash-2" style="width: 16px; height: 16px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.feather) window.feather.replace();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODAL: Open for Create / Edit
    // ─────────────────────────────────────────────────────────────────────────
    function openModalForCreate() {
        isEditMode = false;
        editingOfferId = null;
        document.querySelector('.modal-header h2').textContent = 'Create Offer';
        document.getElementById('btnSaveOffer').textContent = 'Create Offer';

        offerNameEl.value = '';
        offerDiscountTypeEl.value = 'percentage';
        offerDiscountValueEl.value = '';
        offerStartDateEl.value = '';
        offerEndDateEl.value = '';
        offerMinBillAmountEl.value = '';
        offerUsageLimitEl.value = '';
        offerUsagePerCustomerEl.value = '';
        if (offerCurrentUsageCountEl) offerCurrentUsageCountEl.value = '0';
        offerStatusEl.value = 'active';

        document.querySelectorAll('.serviceCheckboxes').forEach(chk => chk.checked = false);
        offerServicesText.textContent = 'Select services...';
        offerServicesText.style.color = '#94a3b8';

        offerNameEl.removeAttribute('readonly');
        offerNameEl.style.background = '';
        offerNameEl.style.cursor = '';

        modalOverlay.classList.add('active');
    }

    function openModalForEdit(id) {
        isEditMode = true;
        editingOfferId = id;
        const o = offers.find(c => (c.offer_id || c.id) === id);
        if (!o) return;

        document.querySelector('.modal-header h2').textContent = 'Edit Offer';
        document.getElementById('btnSaveOffer').textContent = 'Save Changes';

        offerNameEl.value = o.offer_name || '';
        offerDiscountTypeEl.value = o.discount_type || 'percentage';
        offerDiscountValueEl.value = o.discount_value || '';
        offerStartDateEl.value = o.valid_from ? o.valid_from.split('T')[0] : '';
        offerEndDateEl.value = o.valid_to ? o.valid_to.split('T')[0] : '';
        offerMinBillAmountEl.value = o.min_bill_amount || '';
        offerUsageLimitEl.value = o.total_usage_limit || '';
        offerUsagePerCustomerEl.value = o.usage_per_customer || '';

        const maxCurrentCount = o.applicable_services.length > 0
            ? Math.max(...o.applicable_services.map(s => s.current_usage_count || 0))
            : (o.current_usage_count || 0);
        if (offerCurrentUsageCountEl) offerCurrentUsageCountEl.value = maxCurrentCount;
        offerStatusEl.value = o.status || 'active';

        // Populate multi-select
        document.querySelectorAll('.serviceCheckboxes').forEach(chk => chk.checked = false);
        let selectedCount = 0;
        let firstName = '';

        const isAll = o.applicable_services.some(s => s.service_id === 'all');
        if (isAll) {
            const allChk = document.querySelector('.serviceCheckboxes[data-id="all"]');
            if (allChk) { allChk.checked = true; selectedCount = 1; firstName = 'All Categories'; }
        } else {
            o.applicable_services.forEach(srv => {
                const sChk = document.querySelector(`.serviceCheckboxes[data-id="${srv.service_id}"]`);
                if (sChk) { sChk.checked = true; selectedCount++; if (!firstName) firstName = srv.service_name; }
            });
        }

        if (selectedCount === 0) {
            offerServicesText.textContent = 'Select services...';
            offerServicesText.style.color = '#94a3b8';
        } else if (firstName === 'All Categories') {
            offerServicesText.textContent = 'All Categories';
            offerServicesText.style.color = '#1e293b';
        } else if (selectedCount === 1) {
            offerServicesText.textContent = firstName;
            offerServicesText.style.color = '#1e293b';
        } else {
            offerServicesText.textContent = `${firstName} +${selectedCount - 1} more`;
            offerServicesText.style.color = '#1e293b';
        }

        offerNameEl.setAttribute('readonly', true);
        offerNameEl.style.background = '#f8fafc';
        offerNameEl.style.cursor = 'not-allowed';

        modalOverlay.classList.add('active');
    }

    function closeModal() { modalOverlay.classList.remove('active'); }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE: Save (Create or Update) Offer
    // ─────────────────────────────────────────────────────────────────────────
    async function handleSaveOffer() {
        if (!offerNameEl.value || !offerDiscountValueEl.value || !offerStartDateEl.value) {
            alert('Please fill all required fields (*)');
            return;
        }

        const checkedBoxes = Array.from(document.querySelectorAll('.serviceCheckboxes')).filter(c => c.checked);
        if (checkedBoxes.length === 0) {
            alert('Please select at least one applicable service.');
            return;
        }

        const hasAllSelected = checkedBoxes.some(c => c.dataset.id === 'all');

        // Build the services list for offer_services table
        let applyServices = [];
        const currentO = editingOfferId ? offers.find(o => (o.offer_id || o.id) === editingOfferId) : null;

        if (hasAllSelected) {
            // All services — map every service
            applyServices = services.map(svc => {
                const existing = currentO?.applicable_services.find(s => s.service_id === svc.service_id);
                return {
                    service_id: svc.service_id,
                    service_name: svc.service_name,
                    current_usage_count: existing?.current_usage_count || 0
                };
            });
        } else {
            checkedBoxes.forEach(chk => {
                if (chk.dataset.id !== 'all') {
                    const existing = currentO?.applicable_services.find(s => s.service_id === chk.dataset.id);
                    applyServices.push({
                        service_id: chk.dataset.id,
                        service_name: chk.value,
                        current_usage_count: existing?.current_usage_count || 0
                    });
                }
            });
        }

        const offerPayload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            offer_name: offerNameEl.value.trim(),
            discount_type: offerDiscountTypeEl.value,
            discount_value: parseFloat(offerDiscountValueEl.value) || 0,
            status: offerStatusEl.value,
            valid_from: offerStartDateEl.value || null,
            valid_to: offerEndDateEl.value || null,
            min_bill_amount: offerMinBillAmountEl.value ? parseFloat(offerMinBillAmountEl.value) : null,
            total_usage_limit: offerUsageLimitEl.value ? parseInt(offerUsageLimitEl.value, 10) : null,
            usage_per_customer: offerUsagePerCustomerEl.value ? parseInt(offerUsagePerCustomerEl.value, 10) : null
        };

        btnSaveOffer.textContent = isEditMode ? 'Saving...' : 'Creating...';
        btnSaveOffer.disabled = true;

        try {
            let offerId = editingOfferId;

            if (isEditMode) {
                // UPDATE the offer row
                const { error } = await supabase
                    .from('offers')
                    .eq('offer_id', offerId)
                    .update(offerPayload);
                if (error) throw error;

                // DELETE old service links then re-insert
                const { error: delErr } = await supabase
                    .from('offer_services')
                    .delete()
                    .eq('offer_id', offerId);
                if (delErr) console.warn('offer_services delete warning:', delErr.message);

            } else {
                // Pre-generate UUID to avoid .select() chaining
                offerId = crypto.randomUUID();
                offerPayload.offer_id = offerId;

                // INSERT new offer row
                const { error } = await supabase
                    .from('offers')
                    .insert(offerPayload);
                if (error) throw error;
            }

            // INSERT offer_services rows
            if (offerId && applyServices.length > 0) {
                const serviceRows = applyServices.map(srv => ({
                    offer_id: offerId,
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    service_id: srv.service_id,
                    service_name: srv.service_name,
                    current_usage_count: srv.current_usage_count
                }));

                const { error: insErr } = await supabase
                    .from('offer_services')
                    .insert(serviceRows);
                if (insErr) console.warn('offer_services insert warning:', insErr.message);
            }

            closeModal();
            await loadOffers();
        } catch (error) {
            console.error('Save Offer Error:', error);
            alert('Failed to save offer: ' + (error.message || 'Unknown error'));
        } finally {
            btnSaveOffer.textContent = isEditMode ? 'Save Changes' : 'Create Offer';
            btnSaveOffer.disabled = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE: Delete Offer (soft delete via status = 'deleted')
    // ─────────────────────────────────────────────────────────────────────────
    async function confirmDelete() {
        if (!offerToDeleteId) return;
        deleteOverlay.classList.remove('active');
        if (deletingLoader) deletingLoader.classList.add('active');

        try {
            const { error } = await supabase
                .from('offers')
                .eq('offer_id', offerToDeleteId)
                .update({ status: 'deleted' });

            if (error) throw error;
            await loadOffers();
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete offer: ' + (err.message || 'Unknown error'));
        } finally {
            if (deletingLoader) deletingLoader.classList.remove('active');
            offerToDeleteId = null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS
    // ─────────────────────────────────────────────────────────────────────────
    tbody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) { openModalForEdit(editBtn.dataset.id); return; }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            offerToDeleteId = deleteBtn.dataset.id;
            deleteOverlay.classList.add('active');
        }
    });

    if (btnCreateOffer) btnCreateOffer.addEventListener('click', openModalForCreate);
    if (btnCancelOffer) btnCancelOffer.addEventListener('click', closeModal);
    if (closeOfferModalBtn) closeOfferModalBtn.addEventListener('click', closeModal);
    if (btnSaveOffer) btnSaveOffer.addEventListener('click', handleSaveOffer);

    if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => {
        deleteOverlay.classList.remove('active');
        offerToDeleteId = null;
    });
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', confirmDelete);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    if (offerServicesBtn) {
        offerServicesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            offerServicesMenu.style.display = offerServicesMenu.style.display === 'block' ? 'none' : 'block';
        });
    }

    document.addEventListener('click', (e) => {
        if (offerServicesMenu && offerServicesBtn &&
            !offerServicesBtn.contains(e.target) &&
            !offerServicesMenu.contains(e.target)) {
            offerServicesMenu.style.display = 'none';
        }
    });

    initOffers();
});
