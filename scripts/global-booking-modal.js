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
let rowCounter      = 0;

export function initGlobalBookingModal() {
    const serviceRowsContainer = document.getElementById('serviceRowsContainer');
    const phoneSearch          = document.getElementById('phoneSearch');

    // Guard: if modal not present on this page, bail silently
    if (!serviceRowsContainer || !phoneSearch) return;

    // ── Core elements ─────────────────────────────────────────────────────
    const btnNewBooking          = document.getElementById('btnNewBooking');
    const btnNewBookingPage      = document.getElementById('btnNewBookingPage');
    const modalOverlay           = document.getElementById('bookingModalOverlay');
    const btnCloseModal          = document.getElementById('closeBookingModal');
    const btnCancelBooking       = document.getElementById('btnCancelBooking');
    const btnConfirmBooking      = document.getElementById('btnConfirmBooking');
    const btnAddService          = document.getElementById('btnAddService');

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
            `<option value="${s.service_id}" data-duration="${s.duration || 0}" data-price="${s.price || 0}">${s.service_name}</option>`
        ).join('');

        const staffOptions = liveStaffDB.map(m =>
            `<option value="${m.staff_id}">${m.staff_name || m.name}</option>`
        ).join('');

        const div = document.createElement('div');
        div.className = 'service-booking-row';
        div.dataset.rowId = rowId;
        div.style.cssText = 'padding:12px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fafafa; position:relative;';

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.78rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">
                    ${isFirst ? 'Service 1' : `Service ${rowId + 1}`}
                </span>
                ${!isFirst ? `<button type="button" class="btn-remove-row"
                    style="font-size:0.75rem; padding:2px 8px; border-radius:5px; border:1px solid #fca5a5;
                    background:#fff5f5; color:#ef4444; font-weight:600; cursor:pointer; line-height:1.5;">✕ Remove</button>` : ''}
            </div>

            <label class="form-label" style="font-size:0.82rem; margin-bottom:4px;">Service <span class="text-rose">*</span></label>
            <select class="form-select svc-select" style="margin-bottom:6px; font-size:0.875rem;">
                <option value="" disabled selected>Select a service</option>
                ${svcOptions}
            </select>
            <div class="svc-meta" style="display:none; font-size:0.8rem; color:#475569; margin-bottom:8px;
                padding:5px 10px; background:#f0fdf4; border-radius:5px; border-left:3px solid #10b981;">
                <span class="svc-meta-text"></span>
            </div>

            <label class="form-label" style="font-size:0.82rem; margin-bottom:4px; margin-top:4px;">Staff <span class="text-rose">*</span></label>
            <select class="form-select staff-select" style="font-size:0.875rem;">
                <option value="" disabled selected>Select staff member</option>
                ${staffOptions}
            </select>
        `;

        const svcSel     = div.querySelector('.svc-select');
        const staffSel   = div.querySelector('.staff-select');
        const svcMeta    = div.querySelector('.svc-meta');
        const svcMetaTxt = div.querySelector('.svc-meta-text');

        // Service selected → show meta badge
        svcSel.addEventListener('change', () => {
            const opt = svcSel.options[svcSel.selectedIndex];
            if (opt && opt.value) {
                const dur   = opt.dataset.duration;
                const price = parseFloat(opt.dataset.price || 0);
                const parts = [];
                if (dur && dur !== '0')   parts.push(`${dur} min`);
                if (price)                parts.push(`₹${price.toLocaleString('en-IN')}`);
                svcMetaTxt.textContent = parts.join(' · ') || 'No details available';
                svcMeta.style.display  = 'block';
            } else {
                svcMeta.style.display  = 'none';
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

            const [svcRes, staffRes, custRes] = await Promise.all([
                supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('customers').select('*').eq('company_id', company_id).eq('branch_id', branch_id)
            ]);

            liveServicesDB  = (svcRes.data  || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
            liveStaffDB     = (staffRes.data || []).filter(s => s.status !== 'deleted');
            liveCustomersDB = custRes.data || [];

            // Repopulate options in all existing rows
            serviceRowsContainer.querySelectorAll('.service-booking-row').forEach(row => {
                const svcSel   = row.querySelector('.svc-select');
                const staffSel = row.querySelector('.staff-select');
                const prevSvc  = svcSel.value;
                const prevStf  = staffSel.value;

                svcSel.innerHTML = `<option value="" disabled ${!prevSvc ? 'selected' : ''}>Select a service</option>` +
                    liveServicesDB.map(s =>
                        `<option value="${s.service_id}" data-duration="${s.duration || 0}" data-price="${s.price || 0}"
                            ${prevSvc === s.service_id ? 'selected' : ''}>${s.service_name}</option>`
                    ).join('');

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
        serviceRowsContainer.appendChild(buildServiceRow(rowCounter++, true));
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

    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // ── Add Service row button ────────────────────────────────────────────
    btnAddService?.addEventListener('click', () => {
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
    btnNewBooking?.addEventListener('click', openModal);
    btnNewBookingPage?.addEventListener('click', openModal);
    btnCloseModal?.addEventListener('click', closeModal);
    btnCancelBooking?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

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
        const ampm    = endH >= 12 ? 'PM' : 'AM';
        const displayH = endH > 12 ? endH - 12 : (endH === 0 ? 12 : endH);
        return `${displayH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')} ${ampm}`;
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

            return {
                company_id:      getCompanyId(),
                branch_id:       getBranchId(),
                booking_id:      groupBookingId,
                customer_id:     targetId || null,
                customer_name:   targetName,
                customer_mail:   customerEmail?.value.trim() || null,
                customer_phone:  phoneSearch.value.trim(),
                service_id:      svcSel.value,
                service_name:    opt?.textContent?.trim() || '',
                staff_id:        staffSel.value,
                staff_name:      staffSel.options[staffSel.selectedIndex]?.text || '',
                booking_date:    bookingDate.value,
                start_time:      bookingTime.value,
                end_time:        calculateEndTime(bookingTime.value, duration) || null,
                notes:           bookingNotes?.value.trim() || '',
                price:           price,
                status:          'booked',
                payment:         'pending',
                booking_type:    'walk-in'
            };
        });
    }

    // ── Create bookings (bulk insert) ─────────────────────────────────────
    async function createBookings(payloads) {
        try {
            console.log('[createBookings] payloads:', payloads);
            const { data, error } = await supabase.from('bookings').insert(payloads);
            console.log('[createBookings] result:', { data, error });
            if (!error) {
                const label = payloads.length > 1 ? `${payloads.length} bookings` : 'Booking';
                showMsg(`${label} created successfully!`);
                overrideOverlay?.classList.remove('active');
                closeModal();
                if (window.fetchBookings) await window.fetchBookings();
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
            try {
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id:     getCompanyId(),
                    branch_id:      getBranchId(),
                    customer_name:  targetName || 'Unknown Customer',
                    customer_phone: phoneSearch.value.trim(),
                    customer_email: customerEmail?.value.trim() || '',
                    status:         'active'
                });
                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    targetId = newCust[0].customer_id;
                    liveCustomersDB.push(newCust[0]);
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
