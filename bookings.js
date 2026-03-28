import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

// ─── Dropdown Cache ───────────────────────────────────────────────────────────
let cachedServices = [];
let cachedStaff    = [];

// ─── In-Memory Store ─────────────────────────────────────────────────────────
let liveBookingsData = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || null;
    } catch { return null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function isToday(dateStr) {
    if (!dateStr) return false;
    return dateStr.slice(0, 10) === todayISO();
}

// Format "2024-10-15T09:30:00" → "09:30 AM"
function formatTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return isoStr; }
}

// Format "2024-10-15T09:30:00" → "15 Oct 2024, 09:30 AM"
function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        return d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    } catch { return isoStr; }
}

// Status badge HTML
function statusBadge(status) {
    const map = {
        booked:    { color: '#1e40af', bg: '#dbeafe', label: 'Booked' },
        confirmed: { color: '#1e40af', bg: '#dbeafe', label: 'Confirmed' },
        completed: { color: '#065f46', bg: '#d1fae5', label: 'Completed' },
        cancelled: { color: '#991b1b', bg: '#fee2e2', label: 'Cancelled' },
        'no-show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
        'no_show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// Payment badge HTML
function paymentBadge(status) {
    const map = {
        paid:    { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        unpaid:  { color: '#991b1b', bg: '#fee2e2', label: 'Unpaid' },
        pending: { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Row Renderer ─────────────────────────────────────────────────────────────
function buildRow(b, includeDate = false) {
    const bookingId   = b.booking_id   || b.id  || '';
    const customerName = b.customer_name || b.customer || '—';
    const phone       = b.phone        || b.customer_phone || '';
    const serviceName = b.service_name || b.service || '—';
    const staffName   = b.staff_name   || b.staff  || '—';
    const amount      = b.amount != null ? `₹${Number(b.amount).toLocaleString('en-IN')}` : '—';
    const status      = b.status || '';
    const payment     = b.payment_status || b.payment || '';
    const dateTime    = b.booking_datetime || b.appointment_time || b.date || '';

    const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes(status.toLowerCase());
    const isEditable    = !['cancelled', 'completed'].includes(status.toLowerCase());

    const timeDisplay = includeDate ? formatDateTime(dateTime) : formatTime(dateTime);

    return `
    <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" 
        onmouseover="this.style.background='#f8fafc'" 
        onmouseout="this.style.background=''">
        <td style="padding:10px 8px 10px 14px;font-size:0.78rem;color:#64748b;font-family:monospace;">${bookingId.slice(-8) || '—'}</td>
        <td style="padding:10px 8px;">
            <div style="font-weight:600;font-size:0.87rem;color:#0f172a;">${customerName}</div>
            ${phone ? `<div style="font-size:0.75rem;color:#94a3b8;">${phone}</div>` : ''}
        </td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;">${timeDisplay}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${serviceName}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;">${staffName}</td>
        <td style="padding:10px 8px;">${statusBadge(status)}</td>
        <td style="padding:10px 8px;font-size:0.85rem;font-weight:600;color:#0f172a;">${amount}</td>
        <td style="padding:10px 8px;">${paymentBadge(payment)}</td>
        <td style="padding:10px 8px;">
            <div style="display:flex;gap:6px;">
                ${isEditable ? `<button onclick="window.openEditBookingModal('${bookingId}')" 
                    style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:0.75rem;font-weight:600;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
                    Edit
                </button>` : ''}
                ${isCancellable ? `<button onclick="window.triggerCancelBooking('${bookingId}')" 
                    style="padding:4px 10px;border-radius:6px;border:1px solid #fecdd3;background:#fff5f5;color:#e11d48;font-size:0.75rem;font-weight:600;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">
                    Cancel
                </button>` : ''}
            </div>
        </td>
    </tr>`;
}

function emptyRow(colspan, msg) {
    return `<tr><td colspan="${colspan}" style="padding:48px 24px;text-align:center;color:#94a3b8;font-size:0.9rem;">${msg}</td></tr>`;
}

// ─── Render Tables ────────────────────────────────────────────────────────────
function renderBookings(data) {
    const today    = data.filter(b => isToday(b.booking_datetime || b.appointment_time || b.date || ''));
    const allBooks = data;

    const bodyToday = document.getElementById('tbTableBodyToday');
    const bodyAll   = document.getElementById('tbTableBodyAll');

    if (bodyToday) {
        bodyToday.innerHTML = today.length
            ? today.map(b => buildRow(b, false)).join('')
            : emptyRow(9, 'No bookings for today.');
    }

    if (bodyAll) {
        bodyAll.innerHTML = allBooks.length
            ? allBooks.map(b => buildRow(b, true)).join('')
            : emptyRow(9, 'No bookings found.');
    }
}

// ─── Inject Modals ───────────────────────────────────────────────────────────
function setupModals() {
    // Edit Booking Modal
    if (!document.getElementById('editBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="editBookingModal">
            <div class="modal-container" style="width:600px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Booking</h2>
                        <p class="subtitle">Update booking details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditBookingModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;overflow-y:auto;">
                    <form id="editBookingForm" style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;">
                        <input type="hidden" id="editBookingId">

                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkDate">Date <span class="text-rose">*</span></label>
                            <input type="date" id="editBkDate" class="form-input" required>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkTime">Time <span class="text-rose">*</span></label>
                            <input type="time" id="editBkTime" class="form-input" required>
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkService">Service</label>
                            <input type="text" id="editBkService" class="form-input" placeholder="Service name">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkStaff">Staff</label>
                            <input type="text" id="editBkStaff" class="form-input" placeholder="Staff name">
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label class="form-label">Status</label>
                            <select id="editBkStatus" class="form-select">
                                <option value="booked">Booked</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="completed">Completed</option>
                                <option value="no-show">No-Show</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">Payment</label>
                            <select id="editBkPayment" class="form-select">
                                <option value="unpaid">Unpaid</option>
                                <option value="paid">Paid</option>
                                <option value="pending">Pending</option>
                            </select>
                        </div>

                        <div class="form-group" style="margin:0;grid-column:1/-1;">
                            <label class="form-label" for="editBkNotes">Notes <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editBkNotes" class="form-input form-textarea" style="min-height:80px;"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelEditBooking">Cancel</button>
                    <button type="submit" class="btn btn-primary" form="editBookingForm">Update Booking</button>
                </div>
            </div>
        </div>`);
    }

    // Cancel Confirm Overlay
    if (!document.getElementById('cancelBookingConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="cancelBookingConfirmOverlay" style="z-index:9999;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:400px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);">
                <div style="width:64px;height:64px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                    <i data-feather="x-circle" style="color:#ef4444;width:32px;height:32px;"></i>
                </div>
                <h2 style="font-size:1.5rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Cancel Booking?</h2>
                <p style="color:#64748b;font-size:0.95rem;margin-bottom:24px;line-height:1.5;">Are you sure you want to cancel this booking? The customer will need to rebook.</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="btnKeepBooking" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-weight:600;cursor:pointer;">Keep</button>
                    <button id="btnConfirmCancelBooking" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-weight:600;cursor:pointer;">Yes, Cancel</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay custom-logout-overlay" id="fullScreenCancelBookingLoader" style="z-index:10000;backdrop-filter:blur(8px);">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
                <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin 1s ease-in-out infinite;margin-bottom:16px;"></div>
                <h2 style="color:#fff;font-size:1.5rem;font-weight:600;">Cancelling booking...</h2>
            </div>
        </div>`);
    }

    if (window.feather) feather.replace();
}

// ─── Attach Event Listeners ───────────────────────────────────────────────────
function attachEventListeners() {

    // ── Create Booking (existing modal in HTML: #bookingModalOverlay) ──────────
    const btnConfirm = document.getElementById('btnConfirmBooking');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const phone       = (document.getElementById('phoneSearch')?.value || '').trim();
            const name        = (document.getElementById('customerName')?.value || '').trim();
            const email       = (document.getElementById('customerEmail')?.value || '').trim();
            const serviceEl   = document.getElementById('bookingService');
            const serviceName = serviceEl?.options[serviceEl.selectedIndex]?.text || '';
            const serviceId   = serviceEl?.value || '';
            const staffEl     = document.getElementById('bookingStaff');
            const staffName   = staffEl?.options[staffEl.selectedIndex]?.text || '';
            const staffId     = staffEl?.value || '';
            const date        = document.getElementById('bookingDate')?.value || '';
            const time        = document.getElementById('bookingTime')?.value || '';
            const notes       = (document.getElementById('bookingNotes')?.value || '').trim();

            if (!phone || !name || !serviceId || !staffId || !date || !time) {
                window.toast && window.toast('Please fill all required fields.');
                return;
            }

            const bookingDatetime = `${date}T${time}:00`;

            const payload = {
                company_id:       getCompanyId(),
                branch_id:        getBranchId(),
                customer_phone:   phone,
                customer_name:    name,
                customer_email:   email,
                service_id:       serviceId,
                service_name:     serviceName,
                staff_id:         staffId,
                staff_name:       staffName,
                booking_datetime: bookingDatetime,
                notes:            notes
            };

            const originalText = btnConfirm.textContent;
            btnConfirm.textContent = 'Saving...';
            btnConfirm.disabled = true;

            try {
                const res  = await fetchWithAuth(API.CREATE_BOOKING, {
                    method: 'POST',
                    body:   JSON.stringify(payload)
                }, FEATURES.BOOKINGS_MANAGEMENT, 'create');

                const data = await res.json();
                const root = Array.isArray(data) ? data[0] : data;
                const hasError = root?.error;

                if (res.ok && !hasError) {
                    window.toast && window.toast('Booking created successfully!');
                    document.getElementById('bookingModalOverlay')?.classList.remove('active');
                    resetCreateForm();
                    await fetchBookings();
                } else {
                    window.toast && window.toast('Error: ' + (root?.error || root?.message || 'Unknown error'));
                }
            } catch (err) {
                console.error(err);
                window.toast && window.toast('Network error creating booking.');
            } finally {
                btnConfirm.textContent = originalText;
                btnConfirm.disabled = false;
            }
        });
    }

    // Open modal via header buttons
    ['btnNewBooking', 'btnNewBookingPage'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', async () => {
            resetCreateForm();
            document.getElementById('bookingDate').value = todayISO();
            document.getElementById('bookingModalOverlay')?.classList.add('active');
            await populateBookingDropdowns();
        });
    });

    // Close create modal
    document.getElementById('closeBookingModal')?.addEventListener('click', () => {
        document.getElementById('bookingModalOverlay')?.classList.remove('active');
    });
    document.getElementById('btnCancelBooking')?.addEventListener('click', () => {
        document.getElementById('bookingModalOverlay')?.classList.remove('active');
    });
    document.getElementById('bookingModalOverlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('bookingModalOverlay'))
            document.getElementById('bookingModalOverlay').classList.remove('active');
    });

    // "Now" button for time
    document.getElementById('btnTimeNow')?.addEventListener('click', () => {
        const now = new Date();
        const hh  = String(now.getHours()).padStart(2, '0');
        const mm  = String(now.getMinutes()).padStart(2, '0');
        const timeInput = document.getElementById('bookingTime');
        if (timeInput) timeInput.value = `${hh}:${mm}`;
    });

    // Enable confirm button only when required fields are filled
    ['phoneSearch','customerName','bookingService','bookingStaff','bookingDate','bookingTime'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateConfirmBtn);
        document.getElementById(id)?.addEventListener('input', updateConfirmBtn);
    });

    // Auto-fill duration & price when service is selected
    document.getElementById('bookingService')?.addEventListener('change', () => {
        const sel = document.getElementById('bookingService');
        const opt = sel?.options[sel.selectedIndex];
        const duration = opt?.dataset.duration;
        const price    = opt?.dataset.price;
        const metaEl   = document.getElementById('serviceMetaFields');
        const roD      = document.getElementById('roDuration');
        const roP      = document.getElementById('roPrice');
        if (duration !== undefined && price !== undefined) {
            if (roD) roD.value = duration ? `${duration} min` : '—';
            if (roP) roP.value = price    ? `₹${Number(price).toLocaleString('en-IN')}` : '—';
            if (metaEl) metaEl.style.display = 'grid';
        } else {
            if (metaEl) metaEl.style.display = 'none';
        }
        updateConfirmBtn();
    });

    // ── Edit Booking ──────────────────────────────────────────────────────────
    const editModal = document.getElementById('editBookingModal');
    const editForm  = document.getElementById('editBookingForm');

    document.getElementById('btnCloseEditBookingModal')?.addEventListener('click', () => editModal?.classList.remove('active'));
    document.getElementById('btnCancelEditBooking')?.addEventListener('click',     () => editModal?.classList.remove('active'));
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookingId = document.getElementById('editBookingId').value;
        const date      = document.getElementById('editBkDate').value;
        const time      = document.getElementById('editBkTime').value;

        const payload = {
            company_id:       getCompanyId(),
            branch_id:        getBranchId(),
            booking_id:       bookingId,
            service_name:     document.getElementById('editBkService').value.trim(),
            staff_name:       document.getElementById('editBkStaff').value.trim(),
            booking_datetime: `${date}T${time}:00`,
            status:           document.getElementById('editBkStatus').value,
            payment_status:   document.getElementById('editBkPayment').value,
            notes:            document.getElementById('editBkNotes').value.trim()
        };

        const btn = document.querySelector('button[form="editBookingForm"]');
        const orig = btn?.textContent;
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

        try {
            const res  = await fetchWithAuth(API.UPDATE_BOOKING, {
                method: 'POST',
                body:   JSON.stringify(payload)
            }, FEATURES.BOOKINGS_MANAGEMENT, 'update');

            const data = await res.json();
            const root = Array.isArray(data) ? data[0] : data;

            if (res.ok && !root?.error) {
                window.toast && window.toast('Booking updated successfully!');
                editModal.classList.remove('active');
                await fetchBookings();
            } else {
                window.toast && window.toast('Error: ' + (root?.error || root?.message || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            window.toast && window.toast('Network error updating booking.');
        } finally {
            if (btn) { btn.textContent = orig; btn.disabled = false; }
        }
    });

    // ── Cancel Booking ────────────────────────────────────────────────────────
    const cancelOverlay = document.getElementById('cancelBookingConfirmOverlay');
    const fullLoader    = document.getElementById('fullScreenCancelBookingLoader');
    let bookingToCancel = null;

    document.getElementById('btnKeepBooking')?.addEventListener('click', () => {
        cancelOverlay?.classList.remove('active');
        bookingToCancel = null;
    });
    cancelOverlay?.addEventListener('click', (e) => {
        if (e.target === cancelOverlay) { cancelOverlay.classList.remove('active'); bookingToCancel = null; }
    });

    document.getElementById('btnConfirmCancelBooking')?.addEventListener('click', async () => {
        if (!bookingToCancel) return;

        cancelOverlay?.classList.remove('active');
        fullLoader?.classList.add('active');

        try {
            const res  = await fetchWithAuth(API.CANCEL_BOOKING, {
                method: 'POST',
                body:   JSON.stringify({
                    company_id: getCompanyId(),
                    branch_id:  getBranchId(),
                    booking_id: bookingToCancel
                })
            }, FEATURES.BOOKINGS_MANAGEMENT, 'update');

            const data = await res.json();
            const root = Array.isArray(data) ? data[0] : data;

            if (res.ok && !root?.error) {
                window.toast && window.toast('Booking cancelled successfully!');
                await fetchBookings();
            } else {
                window.toast && window.toast('Error: ' + (root?.error || root?.message || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            window.toast && window.toast('Network error cancelling booking.');
        } finally {
            fullLoader?.classList.remove('active');
            bookingToCancel = null;
        }
    });

    // ── Global window helpers (called from row buttons) ────────────────────────
    window.openEditBookingModal = (bookingId) => {
        const b = liveBookingsData.find(x => (x.booking_id || x.id) === bookingId);
        if (!b) return;

        const dt = b.booking_datetime || b.appointment_time || '';
        const [datePart, timePart] = dt.split('T');

        document.getElementById('editBookingId').value  = bookingId;
        document.getElementById('editBkDate').value     = datePart || '';
        document.getElementById('editBkTime').value     = (timePart || '').slice(0, 5);
        document.getElementById('editBkService').value  = b.service_name || b.service || '';
        document.getElementById('editBkStaff').value    = b.staff_name   || b.staff   || '';
        document.getElementById('editBkNotes').value    = b.notes        || '';
        document.getElementById('editBkStatus').value   = (b.status || 'booked').toLowerCase();
        document.getElementById('editBkPayment').value  = (b.payment_status || b.payment || 'unpaid').toLowerCase();

        document.getElementById('editBookingModal')?.classList.add('active');
        if (window.feather) feather.replace();
    };

    window.triggerCancelBooking = (bookingId) => {
        bookingToCancel = bookingId;
        document.getElementById('cancelBookingConfirmOverlay')?.classList.add('active');
        if (window.feather) feather.replace();
    };
}

// ─── Populate New Booking Dropdowns ──────────────────────────────────────────
async function populateBookingDropdowns() {
    const svcSel   = document.getElementById('bookingService');
    const staffSel = document.getElementById('bookingStaff');

    // Show loading placeholders
    if (svcSel)   { svcSel.innerHTML   = '<option value="">Loading services...</option>'; svcSel.disabled   = true; }
    if (staffSel) { staffSel.innerHTML = '<option value="">Loading staff...</option>';    staffSel.disabled = true; }

    try {
        const body = JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() });

        const [svcRes, staffRes] = await Promise.all([
            fetchWithAuth(API.READ_SERVICES, { method: 'POST', body }, FEATURES.BOOKINGS_MANAGEMENT, 'read'),
            fetchWithAuth(API.READ_STAFF,    { method: 'POST', body }, FEATURES.BOOKINGS_MANAGEMENT, 'read')
        ]);

        // ── Services ────────────────────────────────────────────────────────────
        if (svcSel) {
            svcSel.innerHTML = '<option value="" disabled selected>Select a service</option>';
            if (svcRes.ok) {
                const svcData = await svcRes.json();
                const svcRoot = Array.isArray(svcData) ? svcData[0] : svcData;
                const services = (svcRoot.services || [])
                    .filter(s => (s['status '] || s.status || '').trim().toLowerCase() === 'active');

                cachedServices = services;
                services.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value          = s.service_id || s.id || s.service_name || s.name;
                    opt.textContent    = s.service_name || s.name;
                    opt.dataset.id     = s.service_id || s.id || '';
                    opt.dataset.duration = s.duration || '';
                    opt.dataset.price    = s.price    || '';
                    svcSel.appendChild(opt);
                });

                if (!services.length) svcSel.innerHTML = '<option value="">No services found</option>';
            } else {
                svcSel.innerHTML = '<option value="">Failed to load services</option>';
            }
            svcSel.disabled = false;
        }

        // ── Staff ───────────────────────────────────────────────────────────────
        if (staffSel) {
            staffSel.innerHTML = '<option value="" disabled selected>Select staff member</option>';
            if (staffRes.ok) {
                const staffData = await staffRes.json();
                const staffRoot = Array.isArray(staffData) ? staffData[0] : staffData;
                const staffList = staffRoot.staff || staffRoot.staff_members || staffRoot.members || [];

                cachedStaff = staffList;
                staffList.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value       = m.staff_id || m.id || m.name;
                    opt.textContent = m.name || m.staff_name || m.full_name;
                    opt.dataset.id  = m.staff_id || m.id || '';
                    staffSel.appendChild(opt);
                });

                if (!staffList.length) staffSel.innerHTML = '<option value="">No staff found</option>';
            } else {
                staffSel.innerHTML = '<option value="">Failed to load staff</option>';
            }
            staffSel.disabled = false;
        }

    } catch (err) {
        console.error('Error loading booking dropdowns:', err);
        if (svcSel)   { svcSel.innerHTML   = '<option value="">Error loading services</option>'; svcSel.disabled   = false; }
        if (staffSel) { staffSel.innerHTML = '<option value="">Error loading staff</option>';    staffSel.disabled = false; }
    }
}

// ─── Form Helpers ─────────────────────────────────────────────────────────────
function resetCreateForm() {
    document.getElementById('phoneSearch')    && (document.getElementById('phoneSearch').value     = '');
    document.getElementById('customerName')   && (document.getElementById('customerName').value    = '');
    document.getElementById('customerEmail')  && (document.getElementById('customerEmail').value   = '');
    document.getElementById('bookingService') && (document.getElementById('bookingService').value  = '');
    document.getElementById('bookingStaff')   && (document.getElementById('bookingStaff').value    = '');
    document.getElementById('bookingDate')    && (document.getElementById('bookingDate').value     = '');
    document.getElementById('bookingTime')    && (document.getElementById('bookingTime').value     = '');
    document.getElementById('bookingNotes')   && (document.getElementById('bookingNotes').value    = '');
    document.getElementById('searchSuggestions')?.replaceChildren();
    document.getElementById('customerBadgeContainer')?.style?.setProperty('display', 'none');
    document.getElementById('newCustomerBadgeContainer')?.style?.setProperty('display', 'none');
    document.getElementById('serviceMetaFields')?.style?.setProperty('display', 'none');
    updateConfirmBtn();
}

function updateConfirmBtn() {
    const phone   = document.getElementById('phoneSearch')?.value.trim();
    const name    = document.getElementById('customerName')?.value.trim();
    const service = document.getElementById('bookingService')?.value;
    const staff   = document.getElementById('bookingStaff')?.value;
    const date    = document.getElementById('bookingDate')?.value;
    const time    = document.getElementById('bookingTime')?.value;
    const btn     = document.getElementById('btnConfirmBooking');
    if (btn) btn.disabled = !(phone && name && service && staff && date && time);
}

// ─── Fetch Bookings (READ) ────────────────────────────────────────────────────
export async function fetchBookings() {
    try {
        const res = await fetchWithAuth(API.READ_BOOKINGS, {
            method: 'POST',
            body:   JSON.stringify({
                company_id: getCompanyId(),
                branch_id:  getBranchId()
            })
        }, FEATURES.BOOKINGS_MANAGEMENT, 'read');

        if (!res.ok) throw new Error('Failed to fetch bookings');

        const data = await res.json();
        const root = Array.isArray(data) ? data[0] : data;

        liveBookingsData = root.bookings || [];
        window.liveBookingsData = liveBookingsData;

        renderBookings(liveBookingsData);

    } catch (err) {
        console.error('Error fetching bookings:', err);
        renderBookings(liveBookingsData || []);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initBookings() {
    setupModals();
    attachEventListeners();
    await fetchBookings();
}
