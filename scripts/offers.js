import { API_CONFIG } from '../config/api.js';

document.addEventListener('DOMContentLoaded', () => {
    let offers = [];
    let services = [];
    let isEditMode = false;
    let editingOfferId = null;
    let offerToDeleteId = null;

    // Retrieve company and branch details from localStorage
    const companyId = localStorage.getItem('company_id');
    const branchId = localStorage.getItem('branch_id');

    // DOM Elements - Table & Overlays
    const tbody = document.getElementById('offersTableBody');
    const deleteOverlay = document.getElementById('deleteOfferConfirmOverlay');
    const deletingLoader = document.getElementById('deletingOfferOverlay');
    const btnCancelDelete = document.getElementById('btnCancelDeleteOffer');
    const btnConfirmDelete = document.getElementById('btnConfirmDeleteOffer');
    const btnFilterOffers = document.getElementById('btnFilterOffers');

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

    // DOM Elements - Multi-select Dropdown (Custom implementation from offers.html)
    const offerServicesText = document.getElementById('offerServicesText');
    const offerServicesMenu = document.getElementById('offerServicesMenu');
    // We will render checkboxes into this menu dynamically.

    // 1. Initial Data Fetch
    async function initOffers() {
        if (!companyId || !branchId) {
            console.error('Company ID or Branch ID missing from localStorage');
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">Configuration missing. Please re-login.</td></tr>`;
            return;
        }

        try {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;"><div style="display:flex; justify-content:center; align-items:center; gap:8px;"><div class="spinner" style="width: 20px; height: 20px; border: 3px solid rgba(79, 70, 229, 0.2); border-top-color: #4f46e5; border-radius: 50%; animation: louSpin 1s linear infinite;"></div> Loading Offers...</div></td></tr>`;
            
            // Render basic CSS for loader
            if (!document.getElementById('louSpinKeyframes')) {
                const style = document.createElement('style');
                style.id = 'louSpinKeyframes';
                style.innerHTML = `@keyframes louSpin { to { transform: rotate(360deg); } }`;
                document.head.appendChild(style);
            }

            // Fetch Services to populate the UI
            try {
                const srvResp = await fetch(API_CONFIG.endpoints.services.READ_SERVICES(companyId, branchId));
                if (srvResp.ok) {
                    services = await srvResp.json();
                } else {
                    console.error('Failed to fetch services');
                }
            } catch (err) {
                console.error('Error fetching services:', err);
            }

            populateServiceDropdown();
            await loadOffers();

        } catch (error) {
            console.error('Initialization error:', error);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Failed to load offers.</td></tr>`;
        }
    }

    function populateServiceDropdown() {
        // Find where the checkboxes live
        const checkboxContainer = offerServicesMenu.querySelector('div[style*="max-height: 220px"]');
        if (!checkboxContainer) return;

        // Clear existing, keep Apply/Reset container
        const actionButtonsHtml = offerServicesMenu.querySelector('div[style*="border-top"]').outerHTML;
        
        let servicesHtml = `
            <label class="service-lbl" style="margin-bottom: 12px;">
                <input type="checkbox" class="custom-chk-circle serviceCheckboxes" value="All Categories" data-id="all">
                <span style="font-size: 0.95rem; color: #1e293b; font-weight: 500;">All Categories</span>
            </label>
            <div style="height: 1px; background: #e2e8f0; margin: 8px 0;"></div>
        `;

        services.forEach(srv => {
            servicesHtml += `
                <label class="service-lbl" style="margin-bottom: 8px;">
                    <input type="checkbox" class="custom-chk-circle serviceCheckboxes" value="${srv.service_name}" data-id="${srv.service_id}">
                    <span style="font-size: 0.9rem; color: #475569;">${srv.service_name}</span>
                </label>
            `;
        });

        checkboxContainer.innerHTML = servicesHtml;
        offerServicesMenu.innerHTML = checkboxContainer.outerHTML + actionButtonsHtml;
        
        // Re-attach multi-select listeners for the new elements inside offerServicesMenu
        const newApplyBtn = document.getElementById('applyServicesBtn');
        const newResetBtn = document.getElementById('resetServicesBtn');
        const newCheckboxes = document.querySelectorAll('.serviceCheckboxes');

        if (newApplyBtn) {
            newApplyBtn.addEventListener('click', () => {
                const selected = Array.from(newCheckboxes)
                    .filter(chk => chk.checked)
                    .map(chk => chk.value);

                if (selected.length === 0) {
                    offerServicesText.textContent = "Select services...";
                    offerServicesText.style.color = "#94a3b8";
                } else if (selected.includes("All Categories")) {
                    offerServicesText.textContent = "All Categories";
                    offerServicesText.style.color = "#1e293b";
                } else if (selected.length === 1) {
                    offerServicesText.textContent = selected[0];
                    offerServicesText.style.color = "#1e293b";
                } else {
                    offerServicesText.textContent = `${selected[0]} +${selected.length - 1} more`;
                    offerServicesText.style.color = "#1e293b";
                }
                offerServicesMenu.style.display = 'none';
            });
        }

        if (newResetBtn) {
            newResetBtn.addEventListener('click', () => {
                newCheckboxes.forEach(chk => chk.checked = false);
                offerServicesText.textContent = "Select services...";
                offerServicesText.style.color = "#94a3b8";
            });
        }
    };

    // 2. Load and Render Offers
    async function loadOffers() {
        try {
            const response = await fetch(API_CONFIG.endpoints.offers.READ_OFFERS(companyId, branchId));
            if (!response.ok) throw new Error('API fetch failed');
            
            const rawData = await response.json();
            offers = formatOffersData(rawData);
            renderOffersTable();
        } catch (error) {
            console.error('Error loading offers:', error);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Error fetching data. Check console.</td></tr>`;
        }
    }

    function formatOffersData(rawData) {
        if (!rawData || !Array.isArray(rawData)) return [];
        // Group flat row data into logical offers based on offer_id
        const map = new Map();
        
        rawData.forEach(row => {
            if (!map.has(row.offer_id)) {
                map.set(row.offer_id, {
                    offer_id: row.offer_id,
                    offer_name: row.offer_name,
                    discount_type: row.discount_type,
                    discount_value: row.discount_value,
                    min_bill_amount: row.min_bill_amount,
                    valid_from: row.valid_from,
                    valid_to: row.valid_to,
                    status: row.status,
                    total_usage_limit: row.total_usage_limit,
                    usage_per_customer: row.usage_per_customer,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    applicable_services: []
                });
            }
            if (row.service_id) {
                map.get(row.offer_id).applicable_services.push({
                    service_id: row.service_id,
                    service_name: row.service_name,
                    current_usage_count: row.current_usage_count || 0
                });
            }
        });
        return Array.from(map.values());
    }

    function renderOffersTable() {
        if (offers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #64748b;">No offers found. Create one.</td></tr>`;
            return;
        }

        tbody.innerHTML = offers.map(offer => {
            const hasAllServicesMap = offer.applicable_services.some(s => s.service_id === 'all');
            const tooltipServices = hasAllServicesMap ? 'All Services' : offer.applicable_services.map(s => s.service_name).join('&#10;');
            let topServiceText = hasAllServicesMap ? 'All Services' : (offer.applicable_services[0]?.service_name || 'None');
            let additionalCount = hasAllServicesMap ? 0 : Math.max(0, offer.applicable_services.length - 1);

            let serviceHtml = `<span style="font-size: 0.9rem; color: #334155;">${topServiceText}</span>`;
            if (additionalCount > 0) {
                serviceHtml = `<div class="service-tooltip-wrapper" style="position: relative; display: inline-block; cursor: help;" title="${tooltipServices}">
                                  <span style="font-size: 0.9rem; color: #334155;">${topServiceText} <span style="color: #64748b; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">+${additionalCount}</span></span>
                               </div>`;
            } else if (!hasAllServicesMap) {
                serviceHtml = `<div class="service-tooltip-wrapper" style="position: relative; display: inline-block; cursor: help;" title="${tooltipServices}">${serviceHtml}</div>`;
            }

            // Default valid date logic
            let fromText = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('en-GB') : '-';
            let toText = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('en-GB') : 'No Expiry';
            let validDatesHtml = `<div style="font-size: 0.9rem; color: #334155;">${fromText} – ${toText}</div>`;
            if (!offer.valid_from && !offer.valid_to) {
                validDatesHtml = `<div style="font-size: 0.9rem; color: #64748b; font-style: italic;">Always Active</div>`;
            }

            // Determine aggregate tracking
            let totalMaxLimitStr = offer.total_usage_limit || '∞';
            let maxCurrentCount = 0;
            if (offer.applicable_services.length > 0) {
                 maxCurrentCount = Math.max(...offer.applicable_services.map(s => s.current_usage_count || 0));
            }
            let counterDisplay = `${maxCurrentCount} / ${totalMaxLimitStr}`;

            let statusBadge = offer.status === 'active' 
                ? `<span class="badge-pill" style="background: #dcfce7; color: #166534; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #22c55e;"></span>Active</span>`
                : `<span class="badge-pill" style="background: #fee2e2; color: #b91c1c; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>Inactive</span>`;

            let valueBadge = offer.discount_type === 'percentage' 
                ? `<span style="font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem;">${offer.discount_value}% OFF</span>`
                : `<span style="font-weight: 700; color: #15803d; background: #dcfce7; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem;">₹${offer.discount_value} OFF</span>`;

            return `
                <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
                    <td style="padding: 16px 20px;">
                        <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem;">${offer.offer_name || 'N/A'}</div>
                    </td>
                    <td style="padding: 16px 20px;">
                        ${valueBadge}
                    </td>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 0.9rem; color: #334155; text-transform: capitalize;">${offer.discount_type || 'N/A'}</div>
                    </td>
                    <td style="padding: 16px 20px;">
                        ${serviceHtml}
                    </td>
                    <td style="padding: 16px 20px;">
                        ${validDatesHtml}
                    </td>
                    <td style="padding: 16px 20px;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 0.9rem; color: #334155;"><span style="font-weight: 600;">${counterDisplay}</span></div>
                    </td>
                    <td style="padding: 16px 20px; text-align: center;">
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button class="icon-btn edit-btn" data-id="${offer.offer_id}" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #3b82f6;" title="Edit">
                                <i data-feather="edit-2" style="width: 16px; height: 16px;"></i>
                            </button>
                            <button class="icon-btn delete-btn" data-id="${offer.offer_id}" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #ef4444;" title="Delete">
                                <i data-feather="trash-2" style="width: 16px; height: 16px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.feather) window.feather.replace();
    }

    // 3. Modal Actions
    function openModalForCreate() {
        isEditMode = false;
        editingOfferId = null;
        document.querySelector('.modal-header h2').textContent = 'Create Offer';
        document.getElementById('btnSaveOffer').textContent = 'Create Offer';
        
        // Reset inputs
        offerNameEl.value = '';
        offerDiscountTypeEl.value = 'percentage';
        offerDiscountValueEl.value = '';
        offerStartDateEl.value = '';
        offerEndDateEl.value = '';
        offerMinBillAmountEl.value = '';
        offerUsageLimitEl.value = '';
        offerUsagePerCustomerEl.value = '';
        offerCurrentUsageCountEl.value = '0';
        offerStatusEl.value = 'active';

        // Reset multiselect
        const offerCheckboxes = document.querySelectorAll('.serviceCheckboxes');
        offerCheckboxes.forEach(chk => chk.checked = false);
        offerServicesText.textContent = "Select services...";
        offerServicesText.style.color = "#94a3b8";

        modalOverlay.classList.add('active');
    }

    function openModalForEdit(id) {
        isEditMode = true;
        editingOfferId = id;
        const o = offers.find(c => c.offer_id === id);
        if (!o) return;

        document.querySelector('.modal-header h2').textContent = 'Edit Offer';
        document.getElementById('btnSaveOffer').textContent = 'Save Changes';

        offerNameEl.value = o.offer_name || '';
        offerDiscountTypeEl.value = o.discount_type || 'percentage';
        offerDiscountValueEl.value = o.discount_value || '';
        offerStartDateEl.value = o.valid_from || '';
        offerEndDateEl.value = o.valid_to || '';
        offerMinBillAmountEl.value = o.min_bill_amount || '';
        offerUsageLimitEl.value = o.total_usage_limit || '';
        offerUsagePerCustomerEl.value = o.usage_per_customer || '';
        
        let maxCurrentCount = 0;
        if (o.applicable_services.length > 0) {
             maxCurrentCount = Math.max(...o.applicable_services.map(s => s.current_usage_count || 0));
        }
        offerCurrentUsageCountEl.value = maxCurrentCount;
        
        offerStatusEl.value = o.status || 'active';

        // Populate multi-select
        const offerCheckboxes = document.querySelectorAll('.serviceCheckboxes');
        offerCheckboxes.forEach(chk => chk.checked = false);
        let selectedCount = 0;
        let pName = "";
        
        const isAll = o.applicable_services.some(s => s.service_id === 'all');
        if (isAll) {
            const allChk = document.querySelector('.serviceCheckboxes[data-id="all"]');
            if (allChk) { allChk.checked = true; selectedCount = 1; pName = "All Categories"; }
        } else {
            o.applicable_services.forEach(srv => {
                const sChk = document.querySelector(`.serviceCheckboxes[data-id="${srv.service_id}"]`);
                if (sChk) { sChk.checked = true; selectedCount++; if(!pName) pName = srv.service_name; }
            });
        }

        if (selectedCount === 0) {
            offerServicesText.textContent = "Select services...";
            offerServicesText.style.color = "#94a3b8";
        } else if (pName === 'All Categories') {
             offerServicesText.textContent = "All Categories";
             offerServicesText.style.color = "#1e293b";
        } else if (selectedCount === 1) {
            offerServicesText.textContent = pName;
            offerServicesText.style.color = "#1e293b";
        } else {
            offerServicesText.textContent = `${pName} +${selectedCount - 1} more`;
            offerServicesText.style.color = "#1e293b";
        }

        modalOverlay.classList.add('active');
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // 4. Save Logic
    async function handleSaveOffer() {
        try {
            if (!offerNameEl.value || !offerDiscountValueEl.value || !offerStartDateEl.value) {
                alert('Please fill all required fields (*)');
                return;
            }

            const offerCheckboxes = Array.from(document.querySelectorAll('.serviceCheckboxes')).filter(c => c.checked);
            if (offerCheckboxes.length === 0) {
                alert('Please select at least one applicable service.');
                return;
            }

            let applyServices = [];
            const isAll = offerCheckboxes.some(chk => chk.dataset.id === 'all');
            
            // Map usage count correctly depending on edit mode. Since we don't track service-level edits individually on frontend easily, we reuse the general usage logic or existing mapping if present.
            let currentO = editingOfferId ? offers.find(o => o.offer_id === editingOfferId) : null;

            if (isAll) {
                applyServices.push({ service_id: 'all', service_name: "All Categories", current_usage_count: (currentO?.applicable_services.find(s=>s.service_id==='all')?.current_usage_count || 0) });
            } else {
                offerCheckboxes.forEach(chk => {
                    if (chk.dataset.id !== 'all') {
                        let scnt = 0;
                        if(currentO) {
                            let currSrv = currentO.applicable_services.find(s=>s.service_id === chk.dataset.id);
                            if(currSrv) scnt = currSrv.current_usage_count;
                        }
                        applyServices.push({
                            service_id: chk.dataset.id,
                            service_name: chk.value,
                            current_usage_count: scnt
                        });
                    }
                });
            }

            const payload = {
                company_id: companyId,
                branch_id: branchId,
                offer_name: offerNameEl.value,
                discount_type: offerDiscountTypeEl.value,
                discount_value: parseFloat(offerDiscountValueEl.value) || 0,
                status: offerStatusEl.value,
                valid_from: offerStartDateEl.value || null,
                valid_to: offerEndDateEl.value || null,
                min_bill_amount: offerMinBillAmountEl.value ? parseFloat(offerMinBillAmountEl.value) : null,
                total_usage_limit: offerUsageLimitEl.value ? parseInt(offerUsageLimitEl.value, 10) : null,
                usage_per_customer: offerUsagePerCustomerEl.value ? parseInt(offerUsagePerCustomerEl.value, 10) : null,
                applicable_services: applyServices
            };

            const endpoint = isEditMode 
                ? API_CONFIG.endpoints.offers.UPDATE_OFFER(editingOfferId)
                : API_CONFIG.endpoints.offers.CREATE_OFFER();

            const method = isEditMode ? 'PUT' : 'POST';

            btnSaveOffer.textContent = isEditMode ? 'Saving...' : 'Creating...';
            btnSaveOffer.disabled = true;

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`Failed to ${isEditMode ? 'update' : 'create'} offer`);

            closeModal();
            await loadOffers();
        } catch (error) {
            console.error('Save Offer Error:', error);
            alert('Failed to save offer. Please try again.');
        } finally {
            btnSaveOffer.textContent = isEditMode ? 'Save Changes' : 'Create Offer';
            btnSaveOffer.disabled = false;
        }
    }

    // 5. Delete Logic
    async function confirmDelete() {
        if (!offerToDeleteId) return;
        deleteOverlay.classList.remove('active');
        deletingLoader.classList.add('active');

        try {
            const res = await fetch(API_CONFIG.endpoints.offers.DELETE_OFFER(offerToDeleteId), { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            await loadOffers();
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete offer.');
        } finally {
            deletingLoader.classList.remove('active');
            offerToDeleteId = null;
        }
    }

    // Event Delegation for Table Actions
    tbody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const id = editBtn.dataset.id;
            openModalForEdit(id);
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            offerToDeleteId = deleteBtn.dataset.id;
            deleteOverlay.classList.add('active');
        }
    });

    // Listeners
    if (btnCreateOffer) btnCreateOffer.addEventListener('click', openModalForCreate);
    if (btnCancelOffer) btnCancelOffer.addEventListener('click', closeModal);
    if (closeOfferModalBtn) closeOfferModalBtn.addEventListener('click', closeModal);
    if (btnSaveOffer) btnSaveOffer.addEventListener('click', handleSaveOffer);
    
    if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => {
        deleteOverlay.classList.remove('active');
        offerToDeleteId = null;
    });
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', confirmDelete);

    // Click outside modal
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    initOffers();
});
