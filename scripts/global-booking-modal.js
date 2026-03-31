import { API, fetchWithAuth } from '../config/api.js';
import { FEATURES } from '../config/feature-registry.js';

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || null;
    } catch { return null; }
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
        // Show loading placeholders
        if (serviceSelect) { serviceSelect.innerHTML = '<option value="">Loading services...</option>'; serviceSelect.disabled = true; }
        if (staffSelect)   { staffSelect.innerHTML = '<option value="">Loading staff...</option>'; staffSelect.disabled = true; }

        try {
            const body = JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() });

            // Fetch Services, Staff, and Customers dynamically
            const [svcRes, staffRes, custRes] = await Promise.all([
                fetchWithAuth(API.READ_SERVICES, { method: 'POST', body }, FEATURES.BOOKINGS_MANAGEMENT, 'read'),
                fetchWithAuth(API.READ_STAFF,    { method: 'POST', body }, FEATURES.BOOKINGS_MANAGEMENT, 'read'),
                fetchWithAuth(API.READ_CUSTOMERS, { method: 'POST', body }, FEATURES.CUSTOMERS_MANAGEMENT, 'read')
            ]);

            // ── Services ────────────────────────────────────────────────────────────
            if (serviceSelect) {
                serviceSelect.innerHTML = '<option value="" disabled selected>Select a service</option>';
                if (svcRes.ok) {
                    const svcData = await svcRes.json();
                    let rawServices = [];
                    if (Array.isArray(svcData)) {
                        if (svcData.length > 0 && svcData[0].error) {
                            console.error(svcData[0].error);
                        } else if (svcData.length > 0 && svcData[0].services) {
                            rawServices = svcData[0].services;
                        } else {
                            rawServices = svcData;
                        }
                    } else if (svcData && svcData.services) {
                        rawServices = svcData.services;
                    }
                    const services = rawServices.filter(s => (s['status '] || s.status || '').trim().toLowerCase() === 'active');
                    services.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value          = s.service_id || s.id || s.service_name || s.name;
                        opt.textContent    = s.service_name || s.name;
                        opt.dataset.id     = s.service_id || s.id || '';
                        opt.dataset.duration = s.duration || '';
                        opt.dataset.price    = s.price    || '';
                        serviceSelect.appendChild(opt);
                    });
                    if (!services.length) serviceSelect.innerHTML = '<option value="">No active services found</option>';
                } else {
                    serviceSelect.innerHTML = '<option value="">Failed to load services</option>';
                }
                serviceSelect.disabled = false;
            }

            // ── Staff ───────────────────────────────────────────────────────────────
            if (staffSelect) {
                staffSelect.innerHTML = '<option value="" disabled selected>Select staff member</option>';
                if (staffRes.ok) {
                    const staffData = await staffRes.json();
                    const staffRoot = Array.isArray(staffData) ? staffData[0] : staffData;
                    const staffList = staffRoot.staff || staffRoot.staff_members || staffRoot.members || [];

                    staffList.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value       = m.staff_id || m.id || m.name;
                        opt.textContent = m.name || m.staff_name || m.full_name;
                        opt.dataset.id  = m.staff_id || m.id || '';
                        staffSelect.appendChild(opt);
                    });
                    if (!staffList.length) staffSelect.innerHTML = '<option value="">No staff found</option>';
                } else {
                    staffSelect.innerHTML = '<option value="">Failed to load staff</option>';
                }
                staffSelect.disabled = false;
            }

            // ── Customers ───────────────────────────────────────────────────────────
            if (custRes && custRes.ok) {
                const custData = await custRes.json();
                const custRoot = Array.isArray(custData) ? custData[0] : custData;
                liveCustomersDB = custRoot.customers || [];
            }

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

    // Submit API Integration
    btnConfirmBooking.addEventListener('click', async () => {
        const meta = getSelectedServiceMeta();
        
        let targetName = customerName.value.trim();
        if(!targetName && selectedCustomerId) {
            const foundCust = liveCustomersDB.find(c => c.id === selectedCustomerId || c.customer_id === selectedCustomerId);
            if(foundCust) targetName = foundCust.name || foundCust.customer_name || '';
        }

        const bookingDatetime = `${bookingDate.value}T${bookingTime.value}:00`;

        const payload = {
            company_id:       getCompanyId(),
            branch_id:        getBranchId(),
            customer_phone:   phoneSearch.value.trim(),
            customer_name:    targetName,
            customer_email:   customerEmail.value.trim(),
            service_id:       serviceSelect.value,
            service_name:     meta ? meta.name : '',
            staff_id:         staffSelect.value,
            staff_name:       staffSelect.options[staffSelect.selectedIndex]?.text || '',
            booking_datetime: bookingDatetime,
            notes:            bookingNotes.value.trim()
        };
        
        const originalText = btnConfirmBooking.textContent;
        btnConfirmBooking.textContent = 'Checking availability...';
        btnConfirmBooking.disabled = true;

        try {
            // 1. Check Staff Availability
            const availPayload = {
                company_id:       getCompanyId(),
                branch_id:        getBranchId(),
                staff_id:         staffSelect.value,
                booking_datetime: bookingDatetime,
                duration:         meta ? meta.duration : 0
            };

            const availRes = await fetchWithAuth(API.CHECK_STAFF_AVAILABILITY, {
                method: 'POST',
                body: JSON.stringify(availPayload)
            }, FEATURES.BOOKINGS_MANAGEMENT, 'read');

            const availData = await availRes.json();
            const availRoot = Array.isArray(availData) ? availData[0] : availData;

            // Stop execution if staff is not available
            if (!availRes.ok || availRoot?.error || availRoot?.is_available === false || availRoot?.available === false) {
                window.toast && window.toast(availRoot?.error || availRoot?.message || 'Staff member is not available at this time.');
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled = false;
                return;
            }

            // 2. Proceed to Create Booking
            btnConfirmBooking.textContent = 'Saving...';

            const res  = await fetchWithAuth(API.CREATE_BOOKING, {
                method: 'POST',
                body:   JSON.stringify(payload)
            }, FEATURES.BOOKINGS_MANAGEMENT, 'create');

            const data = await res.json();
            const root = Array.isArray(data) ? data[0] : data;
            
            if (res.ok && !root?.error) {
                window.toast && window.toast('Booking created successfully!');
                closeModal();
                
                // If we are currently on the Bookings page, intelligently refresh the table
                if (window.fetchBookings) {
                    await window.fetchBookings();
                }
            } else {
                window.toast && window.toast('Error: ' + (root?.error || root?.message || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            window.toast && window.toast('Network error creating booking.');
        } finally {
            btnConfirmBooking.textContent = originalText;
            btnConfirmBooking.disabled = false;
        }
    });

}
