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

// ----------------------------------------------------------------
// PREMIUM BOOKING MODAL LOGIC (Global)
// ----------------------------------------------------------------

let liveCustomersDB = [];

export function initGlobalBookingModal() {
    // Populate select dropdowns elements
    const serviceSelect = document.getElementById('bookingService');
    const staffSelect = document.getElementById('bookingStaff');
    const phoneSearch = document.getElementById('phoneSearch');
    
    // Check if the modal exists on page
    if (!serviceSelect || !staffSelect || !phoneSearch) return;

    // Elements
    const btnNewBooking = document.getElementById('btnNewBooking');
    const btnNewBookingPage = document.getElementById('btnNewBookingPage');
    const modalOverlay = document.getElementById('bookingModalOverlay');
    const btnCloseModal = document.getElementById('closeBookingModal');
    const btnCancelBooking = document.getElementById('btnCancelBooking');
    const btnConfirmBooking = document.getElementById('btnConfirmBooking');

    // Form Els
    const searchSuggestions = document.getElementById('searchSuggestions');
    const newCustomerBadgeContainer = document.getElementById('newCustomerBadgeContainer');
    const customerBadgeContainer = document.getElementById('customerBadgeContainer');
    const customerBadge = document.getElementById('customerBadge');
    
    const customerNameGroup = document.getElementById('customerNameGroup');
    const customerEmailGroup = document.getElementById('customerEmailGroup');
    const customerName = document.getElementById('customerName');
    const customerEmail = document.getElementById('customerEmail');
    const emailOptionalLabel = document.getElementById('emailOptionalLabel');
    
    const serviceMetaFields = document.getElementById('serviceMetaFields');
    const roDuration = document.getElementById('roDuration');
    const roPrice = document.getElementById('roPrice');
    
    const bookingDate = document.getElementById('bookingDate');
    const bookingTime = document.getElementById('bookingTime');
    const bookingNotes = document.getElementById('bookingNotes');

    // State
    let selectedCustomerId = null;
    let computedEndTime = null;

    if (!modalOverlay) return;

    // Helper: set fields to editable "new customer" state
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

    // Helper: set fields to read-only "existing customer" state
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

    async function populateBookingDropdowns() {
        if (serviceSelect) { serviceSelect.innerHTML = '<option value="">Loading services...</option>'; serviceSelect.disabled = true; }
        if (staffSelect)   { staffSelect.innerHTML = '<option value="">Loading staff...</option>'; staffSelect.disabled = true; }

        try {
            const company_id = getCompanyId();
            const branch_id = getBranchId();

            const [svcRes, staffRes, custRes] = await Promise.all([
                supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('customers').select('*').eq('company_id', company_id).eq('branch_id', branch_id)
            ]);

            // ── Services ──────────────────────────────────────────────────────────── //
            if (serviceSelect) {
                serviceSelect.innerHTML = '<option value="" disabled selected>Select a service</option>';
                const services = (svcRes.data || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
                services.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value          = s.service_id;
                    opt.textContent    = s.service_name;
                    opt.dataset.id     = s.service_id;
                    opt.dataset.duration = s.duration || '';
                    opt.dataset.price    = s.price    || '';
                    serviceSelect.appendChild(opt);
                });
                if (!services.length) serviceSelect.innerHTML = '<option value="">No active services found</option>';
                serviceSelect.disabled = false;
            }

            // ── Staff ─────────────────────────────────────────────────────────────── //
            if (staffSelect) {
                staffSelect.innerHTML = '<option value="" disabled selected>Select staff member</option>';
                const staffList = (staffRes.data || []).filter(s => s.status !== 'deleted');
                staffList.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value       = m.staff_id;
                    opt.textContent = m.staff_name || m.name;
                    opt.dataset.id  = m.staff_id;
                    staffSelect.appendChild(opt);
                });
                if (!staffList.length) staffSelect.innerHTML = '<option value="">No staff found</option>';
                staffSelect.disabled = false;
            }

            // ── Customers ─────────────────────────────────────────────────────────── //
            liveCustomersDB = custRes.data || [];

        } catch (err) {
            console.error('Error loading booking dropdowns:', err);
            if (serviceSelect) { serviceSelect.innerHTML = '<option value="">Error</option>'; serviceSelect.disabled = false; }
            if (staffSelect) { staffSelect.innerHTML = '<option value="">Error</option>'; staffSelect.disabled = false; }
        }
    }

    // Open/Close
    async function openModal() {
        // Reset form
        phoneSearch.value = '';
        setNewCustomerState();
        serviceSelect.value = '';
        staffSelect.value = '';
        bookingDate.value = '';
        bookingTime.value = '';
        bookingNotes.value = '';
        
        // Set min date to today
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        bookingDate.setAttribute('min', `${yyyy}-${mm}-${dd}`);
        bookingDate.value = `${yyyy}-${mm}-${dd}`; // default to today

        searchSuggestions.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        customerBadgeContainer.style.display = 'none';
        serviceMetaFields.style.display = 'none';
        
        selectedCustomerId = null;
        computedEndTime = null;
        validateForm();
        
        modalOverlay.classList.add('active');
        
        // Focus first input and populate
        setTimeout(() => phoneSearch.focus(), 100);
        await populateBookingDropdowns();
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // ── Override Confirmation Modal ───────────────────────────────────────────
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

    const overrideOverlay  = document.getElementById('staffOverrideConfirmOverlay');
    const overrideReasonEl = document.getElementById('staffOverrideReason');
    const btnCancelOverride  = document.getElementById('btnCancelOverride');
    const btnConfirmOverride = document.getElementById('btnConfirmOverride');

    // Cancel override → go back to new booking modal
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

    // Bind Modals Trigger
    if(btnNewBooking) btnNewBooking.addEventListener('click', openModal);
    if(btnNewBookingPage) btnNewBookingPage.addEventListener('click', openModal);
    if(btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if(btnCancelBooking) btnCancelBooking.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if(e.target === modalOverlay) closeModal();
    });

    // Phone Search Logic
    phoneSearch.addEventListener('input', (e) => {
        const val = e.target.value.trim();

        // Reset badge state whenever typing changes
        customerBadgeContainer.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        selectedCustomerId = null;

        if (val.length === 0) {
            searchSuggestions.style.display = 'none';
            setNewCustomerState();
            validateForm();
            return;
        }

        const matches = liveCustomersDB.filter(c => {
            const p = String(c.phone || c.customer_phone || '');
            return p.includes(val);
        });
        
        if (matches.length > 0) {
            searchSuggestions.innerHTML = '';
            matches.forEach(m => {
                const phoneStr = String(m.phone || m.customer_phone || '');
                const nameStr = m.name || m.customer_name || '';
                const emailStr = m.email || m.customer_email || '';

                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<span class="sugg-name">${nameStr}</span><span class="sugg-phone">${phoneStr}</span>`;
                div.addEventListener('click', () => {
                    phoneSearch.value = phoneStr;
                    selectedCustomerId = m.id || m.customer_id;
                    
                    setExistingCustomerState(nameStr, emailStr);

                    searchSuggestions.style.display = 'none';
                    if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
                    customerBadgeContainer.style.display = 'block';
                    if (customerBadge) customerBadge.textContent = 'Existing Customer';
                    validateForm();
                });
                searchSuggestions.appendChild(div);
            });
            searchSuggestions.style.display = 'block';
        } else {
            // No matches -> New Customer
            searchSuggestions.style.display = 'none';
            if (val.length >= 10) {
                if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'block';
                setNewCustomerState();
                selectedCustomerId = null;
            }
        }
        validateForm();
    });
    
    // Hide suggestions on click outside
    document.addEventListener('click', (e) => {
        if (phoneSearch && searchSuggestions && !phoneSearch.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });

    // Update state on inputs
    [customerName, serviceSelect, staffSelect, bookingDate, bookingTime].forEach(el => {
        if(el) {
            el.addEventListener('change', () => {
                updateServiceMeta();
                updateCalculatedTime();
                validateForm();
            });
            el.addEventListener('input', () => {
                validateForm();
            });
        }
    });

    function getSelectedServiceMeta() {
        if (!serviceSelect.value) return null;
        const opt = serviceSelect.options[serviceSelect.selectedIndex];
        return {
            name: opt.textContent,
            duration: parseInt(opt.dataset.duration || 0),
            price: parseFloat(opt.dataset.price || 0)
        };
    }

    function calculateEndTime(startTimeStr, durationMins) {
        if (!startTimeStr || !durationMins) return null;
        const [hh, mm] = startTimeStr.split(':').map(Number);
        let totalMins = hh * 60 + mm + durationMins;
        let endH = Math.floor(totalMins / 60);
        let endM = totalMins % 60;
        const ampm = endH >= 12 ? 'PM' : 'AM';
        const displayH = endH > 12 ? endH - 12 : (endH === 0 ? 12 : endH);
        return `${displayH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')} ${ampm}`;
    }

    function updateServiceMeta() {
        const meta = getSelectedServiceMeta();
        if (meta && (meta.duration || meta.price)) {
            serviceMetaFields.style.display = 'grid';
            if (roDuration) roDuration.value = meta.duration ? `${meta.duration} min` : '—';
            if (roPrice) roPrice.value = meta.price ? `₹${meta.price.toLocaleString('en-IN')}` : '—';
        } else {
            serviceMetaFields.style.display = 'none';
        }
    }

    function updateCalculatedTime() {
        if (bookingTime.value) {
            const meta = getSelectedServiceMeta();
            if(meta) {
                computedEndTime = calculateEndTime(bookingTime.value, meta.duration);
            }
        } else {
            computedEndTime = null;
        }
    }

    function validateForm() {
        const hasPhone = phoneSearch.value.trim().length >= 10;
        const hasName = selectedCustomerId ? true : (customerName && customerName.value.trim().length > 0);
        const validCustomer = hasPhone && (selectedCustomerId || hasName);
        
        const hasService = serviceSelect.value !== '';
        const hasStaff = staffSelect.value !== '';
        const hasDate = bookingDate.value !== '';
        const hasTime = bookingTime.value !== '';

        if (validCustomer && hasService && hasStaff && hasDate && hasTime) {
            btnConfirmBooking.disabled = false;
        } else {
            btnConfirmBooking.disabled = true;
        }

        // Time Validation (only show future times for today)
        if (bookingDate.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            
            if (bookingDate.value === todayStr) {
                const currentHour = today.getHours();
                const currentMin = today.getMinutes();
                const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
                
                bookingTime.setAttribute('min', currentTimeStr);
                
                if (bookingTime.value && bookingTime.value < currentTimeStr) {
                    bookingTime.value = '';
                    btnConfirmBooking.disabled = true;
                }
            } else {
                bookingTime.removeAttribute('min');
            }
        }
    }
    
    // Now Button Logic
    const btnTimeNow = document.getElementById('btnTimeNow');
    if (btnTimeNow) {
        btnTimeNow.addEventListener('click', () => {
            if (!bookingDate.value) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                bookingDate.value = `${yyyy}-${mm}-${dd}`;
            }
            
            const now = new Date();
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            bookingTime.value = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
            
            updateCalculatedTime();
            validateForm();
        });
    }

    function showMsg(msg, isError = false) {
        if (typeof window.toast === 'function') {
            window.toast(msg);
        } else {
            console[isError ? 'error' : 'log']('[Booking Modal]', msg);
            if (isError) alert(msg);
        }
    }

    async function createBooking(payload) {
        try {
            console.log('[createBooking] payload:', payload);
            const { data, error } = await supabase.from('bookings').insert(payload);
            console.log('[createBooking] result:', { data, error });
            if (!error) {
                showMsg('Booking created successfully!');
                overrideOverlay?.classList.remove('active');
                closeModal();
                if (window.fetchBookings) await window.fetchBookings();
            } else {
                showMsg('Error saving booking: ' + error.message, true);
            }
        } catch (err) {
            console.error('[createBooking] exception:', err);
            showMsg('Network error creating booking: ' + err.message, true);
        }
    }

    // Submit Action
    btnConfirmBooking.addEventListener('click', async () => {
        const meta = getSelectedServiceMeta();
        
        let targetName = customerName.value.trim();
        let targetId = selectedCustomerId;

        const originalText = btnConfirmBooking.textContent;
        btnConfirmBooking.textContent = 'Saving...';
        btnConfirmBooking.disabled = true;

        // If it's a completely new customer, create them in the DB first!
        if (!targetId && phoneSearch.value.trim().length >= 10) {
            try {
                console.log('[Booking] Creating new customer first...');
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    customer_name: targetName || 'Unknown Customer',
                    customer_phone: phoneSearch.value.trim(),
                    customer_email: customerEmail.value.trim(),
                    status: 'active'
                });
                console.log('[Booking] New customer result:', { newCust, custErr });
                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    targetId = newCust[0].customer_id;
                    liveCustomersDB.push(newCust[0]);
                }
            } catch (err) {
                console.error('[Booking] Error creating new customer:', err);
                showMsg('Failed to create customer record: ' + err.message, true);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled = false;
                return;
            }
        }

        const payload = {
            company_id:       getCompanyId(),
            branch_id:        getBranchId(),
            customer_id:      targetId || null,
            customer_phone:   phoneSearch.value.trim(),
            customer_name:    targetName,
            customer_email:   customerEmail.value.trim() || null,
            service_id:       serviceSelect.value,
            service_name:     meta ? meta.name : '',
            duration:         meta ? meta.duration : 0,
            price:            meta ? meta.price : 0,
            staff_id:         staffSelect.value,
            staff_name:       staffSelect.options[staffSelect.selectedIndex]?.text || '',
            booking_date:     bookingDate.value,
            start_time:       bookingTime.value,
            notes:            bookingNotes.value.trim(),
            status:           'booked',
            payment:          'pending',
            booking_type:     'walk-in'
        };
        
        try {
            // Local overlap check for Staff Availability
            const staffId = staffSelect.value;
            const bDate = bookingDate.value;
            
            const { data: existingBookings, error: bErr } = await supabase
                .from('bookings')
                .select('start_time, duration, status')
                .eq('staff_id', staffId)
                .eq('booking_date', bDate);
                
            let isAvailable = true;
            let overlapReason = "";
            
            if (!bErr && existingBookings && existingBookings.length > 0) {
                const newStartMins = timeToMins(bookingTime.value);
                const newEndMins = newStartMins + payload.duration;

                for (let eb of existingBookings) {
                    const ebStartMins = timeToMins(eb.start_time);
                    const ebEndMins = ebStartMins + (eb.duration || 0);

                    // Check if timescales cross each other
                    if (newStartMins < ebEndMins && newEndMins > ebStartMins) {
                        isAvailable = false;
                        overlapReason = `Staff is already booked from ${minsToTime(ebStartMins)} to ${minsToTime(ebEndMins)}.`;
                        break;
                    }
                }
            }
            
            function timeToMins(tStr) {
                if (!tStr) return 0;
                const [h,m] = tStr.split(':').map(Number);
                return (h * 60) + m;
            }
            
            function minsToTime(mins) {
                const ampm = Math.floor(mins / 60) >= 12 ? 'PM' : 'AM';
                let h = Math.floor(mins / 60) % 12;
                if (h === 0) h = 12;
                return `${String(h).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')} ${ampm}`;
            }

            if (isAvailable) {
                await createBooking(payload);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled = false;
                return;
            } else {
                // Warning Flow!
                modalOverlay.classList.remove('active');
                if (overrideReasonEl) {
                    overrideReasonEl.textContent = overlapReason + ' Do you want to override and double-book?';
                }
                overrideOverlay?.classList.add('active');
                if (window.feather) feather.replace();

                // Re-wire override confirm to clear memory leaks
                const oldBtn = document.getElementById('btnConfirmOverride');
                const freshConfirm = oldBtn?.cloneNode(true);
                oldBtn?.parentNode.replaceChild(freshConfirm, oldBtn);
                
                freshConfirm?.addEventListener('click', async () => {
                    overrideOverlay.classList.remove('active');
                    freshConfirm.textContent = 'Saving...';
                    freshConfirm.disabled = true;
                    await createBooking(payload);
                    freshConfirm.textContent = 'Yes, Confirm';
                    freshConfirm.disabled = false;
                    btnConfirmBooking.textContent = originalText;
                    btnConfirmBooking.disabled = false;
                });
                return; // exit standard flow
            }
        } catch (err) {
            console.error('[Booking] Submit error:', err);
            showMsg('Booking failed: ' + (err.message || 'Unknown error'), true);
            btnConfirmBooking.textContent = originalText;
            btnConfirmBooking.disabled = false;
        }
    });

}
