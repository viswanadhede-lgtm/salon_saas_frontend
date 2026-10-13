import { supabase } from '../lib/supabase.js';

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ----------------------------------------------------------------
// PREMIUM BOOKING MODAL LOGIC (Global) — Multi-Service Support
// ----------------------------------------------------------------

let liveCustomersDB = [];
let liveServicesDB  = [];
let liveStaffDB     = [];
let livePackagesDB  = [];
let livePackageServicesDB = [];
let rowCounter      = 0;
let isGlobalBookingModalInitialized = false;

export function ensureBookingModalHtml() {
    if (document.getElementById('bookingModalOverlay')) return;
    if (!document.body) return;

    const modalHtml = `
    <!-- Premium New Booking Modal (Global Component) -->
    <div class="modal-overlay" id="bookingModalOverlay">
        <div class="modal-container" id="bookingModal">
            <!-- Header -->
            <div class="modal-header">
                <div class="header-titles">
                    <h2>New Booking</h2>
                    <p class="subtitle">Create a new appointment for a customer.</p>
                </div>
                <button class="modal-close" id="closeBookingModal"><i data-feather="x"></i></button>
            </div>

            <div class="modal-body" style="padding: 1.5rem; overflow-y: auto;">
                <div class="modal-form-side" style="width: 100%; max-width: none; flex: 1; padding: 0; border: none;">
                    <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">

                        <!-- LEFT COLUMN -->
                        <div style="display: flex; flex-direction: column;">
                            <!-- Customer Ident -->
                            <div class="form-group relative">
                                <label class="form-label" for="phoneSearch">Phone Number <span
                                        class="text-rose">*</span></label>
                                <input type="tel" id="phoneSearch" class="form-input" placeholder="Enter phone number"
                                    autocomplete="off">
                                <div class="search-suggestions" id="searchSuggestions"></div>
                            </div>

                            <div class="customer-badge-container" id="customerBadgeContainer"
                                style="display:none; margin-bottom: 8px;">
                                <span class="badge-pill existing-badge" id="customerBadge">Existing Customer</span>
                            </div>

                            <div class="form-group span-full" id="newCustomerBadgeContainer"
                                style="display:none; margin-bottom: 8px;">
                                <span class="badge-pill new-badge" id="newCustomerBadge">New Customer</span>
                            </div>

                            <div class="form-group" id="customerNameGroup">
                                <label class="form-label" for="customerName">Customer Name <span
                                        class="text-rose">*</span></label>
                                <input type="text" id="customerName" class="form-input"
                                    placeholder="Enter customer name">
                            </div>

                            <div class="form-group" id="customerEmailGroup">
                                <label class="form-label" for="customerEmail">Email <span id="emailOptionalLabel"
                                        class="text-muted"></span></label>
                                <input type="email" id="customerEmail" class="form-input"
                                    placeholder="Enter email address">
                            </div>

                            <!-- Booking Notes -->
                            <div class="form-group section-gap flex-grow" style="margin-bottom: 1.5rem;">
                                <label class="form-label" for="bookingNotes">Booking Notes <span
                                        class="text-muted">(Optional)</span></label>
                                <textarea id="bookingNotes" class="form-input form-textarea"
                                    placeholder="Add optional notes for this booking..."
                                    style="min-height: 120px;"></textarea>
                            </div>
                        </div>

                        <!-- RIGHT COLUMN -->
                        <div style="display: flex; flex-direction: column; gap: 0;">
                            <!-- Dynamic Service + Staff rows (injected by JS) -->
                            <div id="serviceRowsContainer" style="display:flex; flex-direction:column; gap:0; margin-bottom:14px;"></div>

                            <!-- Date & Time -->
                            <div class="form-grid section-gap">
                                <div class="form-group">
                                    <label class="form-label" for="bookingDate">Date <span
                                            class="text-rose">*</span></label>
                                    <input type="date" id="bookingDate" class="form-input">
                                </div>
                                <div class="form-group">
                                    <label class="form-label" for="bookingTime">Time <span
                                            class="text-rose">*</span></label>
                                    <div class="relative" style="display: flex; gap: 8px;">
                                        <input type="time" id="bookingTime" class="form-input" style="flex: 1;">
                                        <button type="button" class="btn btn-secondary" id="btnTimeNow"
                                            style="padding: 0 12px; height: 40px; font-size: 13px;">Now</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div> <!-- /inner form container -->
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="btnCancelBooking">Cancel</button>
                <button type="button" class="btn btn-primary" id="btnConfirmBooking" disabled>Confirm Booking</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.feather && feather.replace) {
        feather.replace();
    }
}

export function initGlobalBookingModal() {
    if (isGlobalBookingModalInitialized && document.getElementById('bookingModalOverlay')) return;

    ensureBookingModalHtml();

    const serviceRowsContainer = document.getElementById('serviceRowsContainer');
    const phoneSearch          = document.getElementById('phoneSearch');

    // Guard: if modal not present on this page, bail silently
    if (!serviceRowsContainer || !phoneSearch) return;

    isGlobalBookingModalInitialized = true;

    // ── Core elements ─────────────────────────────────────────────────────
    const btnNewBooking          = document.getElementById('btnNewBooking');
    const btnNewBookingPage      = document.getElementById('btnNewBookingPage');
    const modalOverlay           = document.getElementById('bookingModalOverlay');
    const btnCloseModal          = document.getElementById('closeBookingModal');
    const btnCancelBooking       = document.getElementById('btnCancelBooking');
    const btnConfirmBooking      = document.getElementById('btnConfirmBooking');
    // btnAddService is built dynamically inside the first service row

    const searchSuggestions         = document.getElementById('searchSuggestions');
    const newCustomerBadgeContainer = document.getElementById('newCustomerBadgeContainer');
    const customerBadgeContainer    = document.getElementById('customerBadgeContainer');
    const customerBadge             = document.getElementById('customerBadge');
    const customerName              = document.getElementById('customerName');
    const customerEmail             = document.getElementById('customerEmail');
    const emailOptionalLabel        = document.getElementById('emailOptionalLabel');
    const bookingDate               = document.getElementById('bookingDate');
    const bookingTime               = document.getElementById('bookingTime');
    const bookingNotes              = document.getElementById('bookingNotes');

    if (!modalOverlay) return;

    // State
    let selectedCustomerId = null;

    // ── Customer helpers ──────────────────────────────────────────────────
    function setNewCustomerState() {
        customerName.value = '';
        customerEmail.value = '';
        customerName.readOnly = false;
        customerEmail.readOnly = false;
        customerName.classList.remove('read-only-input');
        customerEmail.classList.remove('read-only-input');
        customerName.placeholder = 'Enter customer name';
        customerEmail.placeholder = 'Enter email address';
        if (emailOptionalLabel) emailOptionalLabel.textContent = '(Optional)';
    }

    function setExistingCustomerState(name, email) {
        customerName.value = name;
        customerEmail.value = email || '';
        customerName.readOnly = false;
        customerEmail.readOnly = false;
        customerName.classList.remove('read-only-input');
        customerEmail.classList.remove('read-only-input');
        customerName.placeholder = 'Existing customer name';
        customerEmail.placeholder = 'Existing customer email';
        if (emailOptionalLabel) emailOptionalLabel.textContent = '';
    }

    // ── Build a single Service + Staff row ────────────────────────────────
    function buildServiceRow(rowId, isFirst) {
        const svcOptions = liveServicesDB.map(s =>
            `<option value="${s.service_id}" data-type="service" style="color: #0f172a; font-weight: normal;" data-duration="${s.duration || 0}" data-price="${s.price || 0}">${s.service_name}</option>`
        ).join('');

        const pkgOptions = livePackagesDB.map(p =>
            `<option value="${p.package_id}" data-type="package" style="color: #0f172a; font-weight: normal;" data-duration="0" data-price="${p.final_price || 0}">${p.package_name}</option>`
        ).join('');
        
        const combinedOptions = `
            <optgroup label="Services" style="color: #1d4ed8; font-weight: 600;">
                ${svcOptions}
            </optgroup>
            ${pkgOptions ? `
            <optgroup label="Packages" style="color: #1d4ed8; font-weight: 600;">
                ${pkgOptions}
            </optgroup>` : ''}
        `;

        const staffOptions = liveStaffDB.map(m =>
            `<option value="${m.staff_id}">${m.staff_name || m.name}</option>`
        ).join('');

        const div = document.createElement('div');
        div.className = 'service-booking-row';
        div.dataset.rowId = rowId;

        // Separator for additional rows
        const separatorHtml = !isFirst
            ? `<hr style="border:none; border-top:1px dashed #e2e8f0; margin: 0 0 12px 0;">`
            : '';

        div.innerHTML = `
            ${separatorHtml}
            <div class="form-group" style="margin-top:0; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label class="form-label" style="margin-bottom:0;">Service or Package <span class="text-rose">*</span></label>
                    ${isFirst
                        ? `<button type="button" id="btnAddBookingItem"
                            style="font-size:0.78rem; padding:3px 10px; border-radius:6px;
                            border:1.5px solid var(--accent, #d946ef);
                            background:var(--accent, #d946ef); color:#fff; font-weight:600; cursor:pointer;
                            display:flex; align-items:center; gap:3px; transition:all 0.2s;">+ Add Item</button>`
                        : `<button type="button" class="btn-remove-row"
                            style="font-size:0.75rem; padding:2px 8px; border-radius:5px; border:1px solid #fca5a5;
                            background:#fff5f5; color:#ef4444; font-weight:600; cursor:pointer; line-height:1.5;">✕ Remove</button>`
                    }
                </div>
                <select class="form-select svc-select">
                    <option value="" disabled selected>Select a service or package</option>
                    ${combinedOptions}
                </select>
                
                <!-- Service Meta: Duration and Price -->
                <div class="svc-meta form-grid" style="display:none; margin-top:8px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label">Duration</label>
                        <input type="text" class="form-input read-only-input svc-duration" readonly placeholder="—">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label">Price</label>
                        <input type="text" class="form-input read-only-input svc-price" readonly placeholder="—">
                    </div>
                </div>
                
                <!-- Package Meta: Included Services and Final Price -->
                <div class="pkg-meta" style="display:none; margin-top:8px; padding:12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <label class="form-label" style="margin-bottom:0; color:#334155;">Included Services</label>
                        <div style="text-align:right;">
                            <div style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Package Price</div>
                            <div class="pkg-price-display" style="font-size:1.1rem; color:#15803d; font-weight:700;">—</div>
                        </div>
                    </div>
                    <div class="pkg-services-list" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
                </div>
            </div>
            <div class="form-group section-gap" style="margin-bottom:0;">
                <label class="form-label" for="bookingStaff">Staff <span class="text-rose">*</span></label>
                <select class="form-select staff-select">
                    <option value="" disabled selected>Select staff member</option>
                    ${staffOptions}
                </select>
            </div>
        `;

        const svcSel      = div.querySelector('.svc-select');
        const staffSel    = div.querySelector('.staff-select');
        const svcMeta     = div.querySelector('.svc-meta');
        const svcDuration = div.querySelector('.svc-duration');
        const svcPrice    = div.querySelector('.svc-price');
        
        const pkgMeta         = div.querySelector('.pkg-meta');
        const pkgPriceDisplay = div.querySelector('.pkg-price-display');
        const pkgServicesList = div.querySelector('.pkg-services-list');

        // Service/Package selected
        svcSel.addEventListener('change', () => {
            const opt = svcSel.options[svcSel.selectedIndex];
            if (opt && opt.value) {
                const type  = opt.dataset.type;
                const price = parseFloat(opt.dataset.price || 0);

                if (type === 'service') {
                    const dur = opt.dataset.duration;
                    svcDuration.value  = dur && dur !== '0' ? `${dur} min` : '—';
                    svcPrice.value     = price ? `₹${price.toLocaleString('en-IN')}` : '—';
                    svcMeta.style.display = 'grid';
                    pkgMeta.style.display = 'none';
                } else if (type === 'package') {
                    pkgPriceDisplay.textContent = price ? `₹${price.toLocaleString('en-IN')}` : '—';
                    
                    const includedServices = livePackageServicesDB.filter(ps => ps.package_id === opt.value);
                    if (includedServices.length > 0) {
                        pkgServicesList.innerHTML = includedServices.map(ps => 
                            `<span style="display:inline-flex; align-items:center; background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">${ps.service_name || 'Service'}</span>`
                        ).join('');
                    } else {
                        pkgServicesList.innerHTML = `<span style="font-size:0.8rem; color:#94a3b8;">No specific services defined</span>`;
                    }
                    
                    svcMeta.style.display = 'none';
                    pkgMeta.style.display = 'block';
                }
            } else {
                svcMeta.style.display = 'none';
                pkgMeta.style.display = 'none';
            }
            validateForm();
        });

        // Staff selected → auto-sync all other staff selects in the container
        staffSel.addEventListener('change', () => {
            const syncVal = staffSel.value;
            serviceRowsContainer.querySelectorAll('.staff-select').forEach(sel => {
                if (sel !== staffSel) sel.value = syncVal;
            });
            validateForm();
        });

        // Remove row (non-first only)
        if (!isFirst) {
            div.querySelector('.btn-remove-row').addEventListener('click', () => {
                div.remove();
                // Re-label remaining rows
                relabelRows();
                validateForm();
            });
        }

        return div;
    }

    // Re-index "Service N" labels after a row is removed
    function relabelRows() {
        serviceRowsContainer.querySelectorAll('.service-booking-row').forEach((row, i) => {
            const label = row.querySelector('span[style*="text-transform"]');
            if (label) label.textContent = `Service ${i + 1}`;
        });
    }

    // ── Populate all selects with live DB data ────────────────────────────
    async function populateBookingDropdowns() {
        try {
            const company_id = getCompanyId();
            const branch_id  = getBranchId();

            const [svcRes, staffRes, custRes, pkgRes, pkgSvcRes] = await Promise.all([
                supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('customers').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('packages').select('*').eq('company_id', company_id).eq('branch_id', branch_id).eq('is_active', true).neq('status', 'deleted'),
                supabase.from('package_services').select('*')
            ]);

            liveServicesDB  = (svcRes.data  || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
            liveStaffDB     = (staffRes.data || []).filter(s => s.status !== 'deleted');
            liveCustomersDB = custRes.data || [];
            livePackagesDB  = pkgRes.data || [];
            livePackageServicesDB = pkgSvcRes.data || [];

            // Repopulate options in all existing rows
            serviceRowsContainer.querySelectorAll('.service-booking-row').forEach(row => {
                const svcSel   = row.querySelector('.svc-select');
                const staffSel = row.querySelector('.staff-select');
                const prevSvc  = svcSel.value;
                const prevStf  = staffSel.value;
                
                const combinedOptions = `
                    <optgroup label="Services" style="color: #1d4ed8; font-weight: 600;">
                        ${liveServicesDB.map(s => `<option value="${s.service_id}" data-type="service" style="color: #0f172a; font-weight: normal;" data-duration="${s.duration || 0}" data-price="${s.price || 0}" ${prevSvc === s.service_id ? 'selected' : ''}>${s.service_name}</option>`).join('')}
                    </optgroup>
                    ${livePackagesDB.length > 0 ? `
                    <optgroup label="Packages" style="color: #1d4ed8; font-weight: 600;">
                        ${livePackagesDB.map(p => `<option value="${p.package_id}" data-type="package" style="color: #0f172a; font-weight: normal;" data-duration="0" data-price="${p.final_price || 0}" ${prevSvc === p.package_id ? 'selected' : ''}>${p.package_name}</option>`).join('')}
                    </optgroup>` : ''}
                `;

                svcSel.innerHTML = `<option value="" disabled ${!prevSvc ? 'selected' : ''}>Select a service or package</option>` + combinedOptions;

                staffSel.innerHTML = `<option value="" disabled ${!prevStf ? 'selected' : ''}>Select staff member</option>` +
                    liveStaffDB.map(m =>
                        `<option value="${m.staff_id}" ${prevStf === m.staff_id ? 'selected' : ''}>${m.staff_name || m.name}</option>`
                    ).join('');
            });

        } catch (err) {
            console.error('Error loading booking dropdowns:', err);
        }
    }

    // ── Reset all service rows to a single empty row ──────────────────────
    function resetServiceRows() {
        serviceRowsContainer.innerHTML = '';
        rowCounter = 0;
        
        const firstRow = buildServiceRow(rowCounter++, true);
        serviceRowsContainer.appendChild(firstRow);

        // Wire the + Add Item button (it lives inside the first row)
        const btnAddBookingItem = firstRow.querySelector('#btnAddBookingItem');
        if (btnAddBookingItem) {
            btnAddBookingItem.addEventListener('click', () => {
                serviceRowsContainer.appendChild(buildServiceRow(rowCounter++, false));
                // Auto-sync staff from first row into new row
                const firstStaff = serviceRowsContainer.querySelector('.staff-select');
                if (firstStaff && firstStaff.value) {
                    serviceRowsContainer.querySelectorAll('.staff-select').forEach(sel => {
                        sel.value = firstStaff.value;
                    });
                }
                validateForm();
            });
        }
    }

    // ── Open / Close ──────────────────────────────────────────────────────
    async function openModal() {
        phoneSearch.value = '';
        setNewCustomerState();
        if (bookingDate) bookingDate.value = '';
        if (bookingTime) bookingTime.value = '';
        if (bookingNotes) bookingNotes.value = '';

        // Default date to today
        const today = new Date();
        const yyyy  = today.getFullYear();
        const mm    = String(today.getMonth() + 1).padStart(2, '0');
        const dd    = String(today.getDate()).padStart(2, '0');
        if (bookingDate) {
            bookingDate.setAttribute('min', `${yyyy}-${mm}-${dd}`);
            bookingDate.value = `${yyyy}-${mm}-${dd}`;
        }

        searchSuggestions.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        if (customerBadgeContainer)    customerBadgeContainer.style.display    = 'none';

        selectedCustomerId = null;
        resetServiceRows();
        validateForm();

        modalOverlay.classList.add('active');
        setTimeout(() => phoneSearch.focus(), 100);
        await populateBookingDropdowns();
    }

    // ── External hook: open modal and pre-fill customer + services (for rebook) ──
    window.openAndPrefillBooking = async function({ customerId, name, phone, email, serviceIds = [], staffIds = [] }) {
        // Step 1: open the modal and await full dropdown population
        await openModal();

        // Step 2: lock-in the existing customer
        if (customerId) {
            window.setGlobalBookingCustomer(customerId, name, phone, email);
        }

        // Step 3: now that dropdowns are populated, fill services/packages
        if (serviceIds.length > 0) {
            const container = document.getElementById('serviceRowsContainer');
            if (container) {
                const btnAdd = container.querySelector('#btnAddBookingItem');
                // Add extra rows as needed
                while (container.querySelectorAll('.service-booking-row').length < serviceIds.length && btnAdd) {
                    btnAdd.click();
                }

                const rows = container.querySelectorAll('.service-booking-row');
                rows.forEach((row, i) => {
                    if (i < serviceIds.length) {
                        const svcSel   = row.querySelector('.svc-select');
                        const staffSel = row.querySelector('.staff-select');

                        if (svcSel && serviceIds[i]) {
                            svcSel.value = serviceIds[i];
                            svcSel.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        const stfId = staffIds[i] || staffIds[0];
                        if (staffSel && stfId) {
                            staffSel.value = stfId;
                            staffSel.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
            }
        }

        validateForm();
    };

    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // btnAddService listener is attached in resetServiceRows() after first row is built

    // ── Override Confirmation Modal ───────────────────────────────────────
    if (!document.getElementById('staffOverrideConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="staffOverrideConfirmOverlay" style="z-index:9999;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:420px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);">
                <div style="width:64px;height:64px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                    <i data-feather="alert-triangle" style="color:#f59e0b;width:32px;height:32px;"></i>
                </div>
                <h2 style="font-size:1.35rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Override Booking?</h2>
                <p id="staffOverrideReason" style="color:#64748b;font-size:0.95rem;margin-bottom:24px;line-height:1.6;"></p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="btnCancelOverride" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-weight:600;cursor:pointer;font-size:0.95rem;">Go Back</button>
                    <button id="btnConfirmOverride" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-weight:600;cursor:pointer;font-size:0.95rem;">Yes, Confirm</button>
                </div>
            </div>
        </div>`);
    }

    const overrideOverlay   = document.getElementById('staffOverrideConfirmOverlay');
    const overrideReasonEl  = document.getElementById('staffOverrideReason');
    const btnCancelOverride = document.getElementById('btnCancelOverride');

    btnCancelOverride?.addEventListener('click', () => {
        overrideOverlay.classList.remove('active');
        modalOverlay.classList.add('active');
    });
    overrideOverlay?.addEventListener('click', (e) => {
        if (e.target === overrideOverlay) {
            overrideOverlay.classList.remove('active');
            modalOverlay.classList.add('active');
        }
    });

    if (window.feather) feather.replace();

    // ── Open/Close triggers ───────────────────────────────────────────────
    window.openGlobalBookingModal = openModal;

    btnNewBooking?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    btnNewBookingPage?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    btnCloseModal?.addEventListener('click', closeModal);
    btnCancelBooking?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    // Ensure header button is bound when shell finishes mounting
    document.addEventListener('app-shell:ready', () => {
        const headerBtn = document.getElementById('btnNewBooking');
        if (headerBtn && !headerBtn.dataset.bookingModalBound) {
            headerBtn.dataset.bookingModalBound = '1';
            headerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal();
            });
        }
    });

    // Handle auto-open if navigated with ?action=new
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'new') {
            openModal();
            const url = new URL(window.location.href);
            url.searchParams.delete('action');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
        }
    } catch { /* ignore */ }

    // ── Phone search ──────────────────────────────────────────────────────
    phoneSearch.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (customerBadgeContainer)    customerBadgeContainer.style.display    = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        selectedCustomerId = null;

        if (val.length === 0) {
            searchSuggestions.style.display = 'none';
            setNewCustomerState();
            validateForm();
            return;
        }

        const matches = liveCustomersDB.filter(c =>
            String(c.phone || c.customer_phone || '').includes(val)
        );

        if (matches.length > 0) {
            searchSuggestions.innerHTML = '';
            matches.forEach(m => {
                const phoneStr = String(m.phone || m.customer_phone || '');
                const nameStr  = m.name || m.customer_name || '';
                const emailStr = m.email || m.customer_email || '';
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<span class="sugg-name">${nameStr}</span><span class="sugg-phone">${phoneStr}</span>`;
                div.addEventListener('click', () => {
                    phoneSearch.value  = phoneStr;
                    selectedCustomerId = m.id || m.customer_id;
                    setExistingCustomerState(nameStr, emailStr);
                    searchSuggestions.style.display = 'none';
                    if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
                    if (customerBadgeContainer) customerBadgeContainer.style.display = 'block';
                    if (customerBadge) customerBadge.textContent = 'Existing Customer';
                    validateForm();
                });
                searchSuggestions.appendChild(div);
            });
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.style.display = 'none';
            if (val.length >= 10) {
                if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'block';
                setNewCustomerState();
                selectedCustomerId = null;
            }
        }
        validateForm();
    });

    document.addEventListener('click', (e) => {
        if (phoneSearch && searchSuggestions &&
            !phoneSearch.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });

    // Date/time listeners
    [customerName, bookingDate, bookingTime].forEach(el => {
        if (el) {
            el.addEventListener('change', validateForm);
            el.addEventListener('input',  validateForm);
        }
    });

    // ── External API for pre-filling ──────────────────────────────────────
    window.setGlobalBookingCustomer = function(customerId, name, phone, email) {
        if (!customerId) return;
        selectedCustomerId = customerId;
        phoneSearch.value = phone || '';
        setExistingCustomerState(name || '', email || '');
        
        searchSuggestions.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        if (customerBadgeContainer) {
            customerBadgeContainer.style.display = 'block';
            if (customerBadge) customerBadge.textContent = 'Existing Customer';
        }
        validateForm();
    };

    // ── Form Validation ───────────────────────────────────────────────────
    function validateForm() {
        const hasPhone     = phoneSearch.value.trim().length >= 10;
        const hasName      = selectedCustomerId || (customerName && customerName.value.trim().length > 0);
        const validCustomer = hasPhone && hasName;

        const rows = serviceRowsContainer.querySelectorAll('.service-booking-row');
        let allRowsValid = rows.length > 0;
        rows.forEach(row => {
            const svc   = row.querySelector('.svc-select');
            const staff = row.querySelector('.staff-select');
            if (!svc?.value || !staff?.value) allRowsValid = false;
        });

        const hasDate = bookingDate?.value !== '';
        const hasTime = bookingTime?.value !== '';

        if (validCustomer && allRowsValid && hasDate && hasTime) {
            btnConfirmBooking.disabled = false;
        } else {
            btnConfirmBooking.disabled = true;
        }

        // Block past times for today
        if (bookingDate?.value) {
            const t = new Date();
            const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
            if (bookingDate.value === todayStr) {
                const currentTime = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
                bookingTime.setAttribute('min', currentTime);
                if (bookingTime.value && bookingTime.value < currentTime) {
                    bookingTime.value = '';
                    btnConfirmBooking.disabled = true;
                }
            } else {
                bookingTime.removeAttribute('min');
            }
        }
    }

    // ── Now Button ────────────────────────────────────────────────────────
    document.getElementById('btnTimeNow')?.addEventListener('click', () => {
        if (!bookingDate.value) {
            const t = new Date();
            bookingDate.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        }
        const now = new Date();
        bookingTime.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        validateForm();
    });

    // ── Helpers ───────────────────────────────────────────────────────────
    function showMsg(msg, isError = false) {
        if (typeof window.toast === 'function') {
            window.toast(msg);
        } else {
            console[isError ? 'error' : 'log']('[Booking Modal]', msg);
            if (isError) alert(msg);
        }
    }

    function calculateEndTime(startTimeStr, durationMins) {
        if (!startTimeStr || !durationMins) return null;
        const [hh, mm] = startTimeStr.split(':').map(Number);
        let totalMins = hh * 60 + mm + parseInt(durationMins);
        let endH = Math.floor(totalMins / 60);
        let endM = totalMins % 60;
        // Return 24-hour format (HH:MM) — required by PostgreSQL TIME column
        return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
    }

    function timeToMins(tStr) {
        if (!tStr) return 0;
        const [h, m] = tStr.split(':').map(Number);
        return (h * 60) + m;
    }

    function minsToTime(mins) {
        const ampm = Math.floor(mins / 60) >= 12 ? 'PM' : 'AM';
        let h = Math.floor(mins / 60) % 12;
        if (h === 0) h = 12;
        return `${String(h).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
    }

    // ── Build payload array (one per service row) ─────────────────────────
    function buildPayloads(targetId, targetName, groupBookingId) {
        const rows = serviceRowsContainer.querySelectorAll('.service-booking-row');
        return Array.from(rows).map(row => {
            const svcSel   = row.querySelector('.svc-select');
            const staffSel = row.querySelector('.staff-select');
            const opt      = svcSel.options[svcSel.selectedIndex];
            const duration = parseInt(opt?.dataset?.duration || 0);
            const price    = parseFloat(opt?.dataset?.price || 0);
            const type     = opt?.dataset?.type || 'service';
            
            const nameSuffix = type === 'package' ? ' (Package)' : '';

            return {
                company_id:      getCompanyId(),
                branch_id:       getBranchId(),
                booking_id:      groupBookingId,
                customer_id:     targetId || null,
                customer_name:   targetName,
                customer_mail:   customerEmail?.value.trim() || null,
                customer_phone:  phoneSearch.value.trim(),
                service_id:      svcSel.value,
                service_name:    (opt?.textContent?.trim() || '') + nameSuffix,
                staff_id:        staffSel.value,
                staff_name:      staffSel.options[staffSel.selectedIndex]?.text || '',
                booking_date:    bookingDate.value,
                start_time:      bookingTime.value,
                end_time:        calculateEndTime(bookingTime.value, duration) || null,
                notes:           bookingNotes?.value.trim() || '',
                price:           price,
                status:          'booked',
                booking_type:    'walk-in'
            };
        });
    }

    // ── Create bookings (atomic RPC) ────────────────────────────────────
    async function createBookings(payloads) {
        try {
            console.log('[createBookings] payloads:', payloads);
            const totalPrice = payloads.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

            // Build services array for the RPC
            const services = payloads.map(p => ({
                service_id:   p.service_id,
                staff_id:     p.staff_id,
                service_name: p.service_name,
                staff_name:   p.staff_name,
                start_time:   p.start_time,
                end_time:     p.end_time || null,
                price:        Number(p.price) || 0,
                status:       p.status || 'booked'
            }));

            // Single atomic RPC call — creates customer (if new), bookings rows,
            // summary row, and triggers initial business_transactions entry
            const { data, error } = await supabase.rpc('create_booking_atomic', {
                p_booking_id:      payloads[0].booking_id,
                p_company_id:      payloads[0].company_id,
                p_branch_id:       payloads[0].branch_id,
                p_customer_id:     payloads[0].customer_id || null,
                p_customer_name:   payloads[0].customer_name || 'Walk-in Customer',
                p_customer_email:  payloads[0].customer_mail || null,
                p_customer_phone:  payloads[0].customer_phone || '',
                p_is_new_customer: false, // Customer already created/checked in the submit handler
                p_services:        services,
                p_booking_date:    payloads[0].booking_date,
                p_notes:           payloads[0].notes || null,
                p_booking_type:    payloads[0].booking_type || 'walk-in'
            });

            console.log('[createBookings] RPC result:', { data, error });

            if (!error) {
                const label = payloads.length > 1 ? `${payloads.length} bookings` : 'Booking';
                showMsg(`${label} created successfully!`);
                if (window.notifyEvent) {
                    try {
                        window.notifyEvent('bookings', 'evt_booking_created', {
                            title: 'New Booking Created',
                            message: `${payloads[0]?.customer_name || 'Customer'} booked ${payloads.map(p => p.service_name).filter(Boolean).join(', ') || 'service'}.`
                        });
                        const staffNames = [...new Set(payloads.map(p => p.staff_name).filter(Boolean))].join(', ');
                        if (staffNames) {
                            window.notifyEvent('staff', 'evt_staff_booking_assigned', {
                                title: 'Booking Assigned to Staff',
                                message: `Assigned to ${staffNames}.`
                            });
                        }
                        window.notifyEvent('payments', 'evt_payment_pending', {
                            title: 'Payment Pending',
                            message: `Pending payment of ₹${totalPrice} for ${payloads[0]?.customer_name || 'Customer'}.`
                        });
                    } catch (eventErr) {
                        console.error('[createBookings] notifyEvent error:', eventErr);
                    }
                }
                if (window.notifyCustomer) {
                    try {
                        window.notifyCustomer('booking', 'booking_confirm', {
                            name: payloads[0]?.customer_name || customerName?.value?.trim() || '',
                            phone: payloads[0]?.customer_phone || phoneSearch?.value?.trim() || '',
                            email: payloads[0]?.customer_mail || customerEmail?.value?.trim() || ''
                        }, {
                            bookingId: payloads[0]?.booking_id,
                            date: payloads[0]?.booking_date,
                            time: payloads[0]?.booking_time,
                            services: payloads.map(p => p.service_name).filter(Boolean),
                            totalPrice
                        });
                    } catch (custNotifyErr) {
                        console.error('[createBookings] notifyCustomer error:', custNotifyErr);
                    }
                }
                overrideOverlay?.classList.remove('active');
                closeModal();
                if (window.fetchBookings) await window.fetchBookings();
                
                // Refresh dashboard data if the functions are available globally
                if (typeof window.refreshAllData === 'function') {
                    window.refreshAllData(getBranchId());
                } else {
                    if (typeof window.fetchAndRenderDashboardKPIs === 'function') {
                        window.fetchAndRenderDashboardKPIs(getBranchId());
                    }
                    if (typeof window.fetchAndRenderAppointments === 'function') {
                        window.fetchAndRenderAppointments(getBranchId());
                    }
                }
            } else {
                showMsg('Error saving booking: ' + error.message, true);
            }
        } catch (err) {
            console.error('[createBookings] exception:', err);
            showMsg('Network error creating booking: ' + err.message, true);
        }
    }

    // ── Submit ────────────────────────────────────────────────────────────
    btnConfirmBooking.addEventListener('click', async () => {
        let targetName     = customerName?.value.trim();
        let targetId       = selectedCustomerId;
        const groupBookingId = generateUUID();

        const originalText = btnConfirmBooking.textContent;
        btnConfirmBooking.textContent = 'Saving...';
        btnConfirmBooking.disabled    = true;

        // Create new customer if needed
        if (!targetId && phoneSearch.value.trim().length >= 10) {
            const typedPhone = phoneSearch.value.trim();
            const digitsOnly = typedPhone.replace(/\D/g, '');
            
            // Check if phone already exists
            const existingCust = window.liveCustomersDB?.find(c => {
                const cPhone = String(c.customer_phone || '').replace(/\D/g, '');
                return cPhone === digitsOnly || cPhone === typedPhone;
            });
            
            if (existingCust) {
                showMsg('Customer with this phone number already exists! Please select them from the dropdown list.', true);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }

            try {
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id:     getCompanyId(),
                    branch_id:      getBranchId(),
                    customer_name:  targetName || 'Unknown Customer',
                    customer_phone: typedPhone,
                    customer_email: customerEmail?.value.trim() || '',
                    status:         'active'
                });
                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    targetId = newCust[0].customer_id;
                    if (window.liveCustomersDB) window.liveCustomersDB.push(newCust[0]);
                    if (window.notifyEvent) {
                        window.notifyEvent('customers', 'evt_customer_added', {
                            title: 'New Customer Added',
                            message: `${targetName || typedPhone} was added.`
                        });
                    }
                }
            } catch (err) {
                console.error('[Booking] Error creating customer:', err);
                showMsg('Failed to create customer record: ' + err.message, true);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }
        }

        const payloads = buildPayloads(targetId, targetName, groupBookingId);

        try {
            // Staff overlap check against first service row only
            const first = payloads[0];
            const { data: existing, error: bErr } = await supabase
                .from('bookings')
                .select('start_time, duration, status')
                .eq('staff_id', first.staff_id)
                .eq('booking_date', first.booking_date);

            let isAvailable  = true;
            let overlapReason = '';

            if (!bErr && existing && existing.length > 0) {
                const newStart = timeToMins(first.start_time);
                const newEnd   = newStart + (parseInt(first.duration) || 0);
                for (const eb of existing) {
                    const ebStart = timeToMins(eb.start_time);
                    const ebEnd   = ebStart + (eb.duration || 0);
                    if (newStart < ebEnd && newEnd > ebStart) {
                        isAvailable   = false;
                        overlapReason = `Staff is already booked from ${minsToTime(ebStart)} to ${minsToTime(ebEnd)}.`;
                        break;
                    }
                }
            }

            if (isAvailable) {
                await createBookings(payloads);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }

            // Show override modal
            modalOverlay.classList.remove('active');
            if (overrideReasonEl) {
                overrideReasonEl.textContent = overlapReason + ' Do you want to override and double-book?';
            }
            overrideOverlay?.classList.add('active');
            if (window.feather) feather.replace();

            const oldBtn      = document.getElementById('btnConfirmOverride');
            const freshConfirm = oldBtn?.cloneNode(true);
            oldBtn?.parentNode.replaceChild(freshConfirm, oldBtn);

            freshConfirm?.addEventListener('click', async () => {
                overrideOverlay.classList.remove('active');
                freshConfirm.textContent = 'Saving...';
                freshConfirm.disabled    = true;
                await createBookings(payloads);
                freshConfirm.textContent   = 'Yes, Confirm';
                freshConfirm.disabled      = false;
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
            });

        } catch (err) {
            console.error('[Booking] Submit error:', err);
            showMsg('Booking failed: ' + (err.message || 'Unknown error'), true);
            btnConfirmBooking.textContent = originalText;
            btnConfirmBooking.disabled    = false;
        }
    });
}
