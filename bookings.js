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
    const bookingId    = b.booking_id   || b.id  || '';
    const customerName = b.customer_name || b.customer || '—';
    const phone        = String(b.customer_phone || b.phone || '');
    const serviceName  = b.service_name || b.service || '—';
    const staffName    = b.staff_name   || b.staff_id || '—';
    // Support both combined booking_datetime AND split booking_date + start_time
    const dateOnly     = b.booking_date || (b.booking_datetime || '').slice(0, 10) || '';
    const timeOnly     = b.start_time   || (b.booking_datetime || '').slice(11, 16) || '';
    const amount       = b.price != null ? `₹${Number(b.price).toLocaleString('en-IN')}` 
                       : b.amount != null ? `₹${Number(b.amount).toLocaleString('en-IN')}` : '—';
    const status       = b.status || '';
    const payment      = b.payment_status || b.payment || '';

    const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes(status.toLowerCase());
    const isEditable    = !['cancelled', 'completed'].includes(status.toLowerCase());

    // Build human-readable date/time display
    let timeDisplay = '—';
    if (includeDate && dateOnly) {
        try {
            const d = new Date(`${dateOnly}T${timeOnly || '00:00'}`);
            timeDisplay = d.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        } catch { timeDisplay = `${dateOnly} ${timeOnly}`; }
    } else if (timeOnly) {
        try {
            const [hh, mm] = timeOnly.split(':').map(Number);
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
            timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
        } catch { timeDisplay = timeOnly; }
    }

    const cellStyle = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    return `
    <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" 
        onmouseover="this.style.background='#f8fafc'" 
        onmouseout="this.style.background=''">
        <td style="padding:10px 8px 10px 14px;font-size:0.78rem;color:#64748b;font-family:monospace;${cellStyle}">${bookingId.slice(-8) || '—'}</td>
        <td style="padding:10px 8px;${cellStyle}">
            <div style="font-weight:600;font-size:0.87rem;color:#0f172a;${cellStyle}">${customerName}</div>
            ${phone ? `<div style="font-size:0.75rem;color:#94a3b8;${cellStyle}">${phone}</div>` : ''}
        </td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${timeDisplay}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${serviceName}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${staffName}</td>
        <td style="padding:10px 8px;">${statusBadge(status)}</td>
        <td style="padding:10px 8px;font-size:0.85rem;font-weight:600;color:#0f172a;${cellStyle}">${amount}</td>
        <td style="padding:10px 8px;">${paymentBadge(payment)}</td>
        <td style="padding:10px 8px;">
            <div style="display:flex;gap:6px;flex-wrap:nowrap;">
                ${isEditable ? `<button onclick="window.openEditBookingModal('${bookingId}')" 
                    style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
                    onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
                    Edit
                </button>` : ''}
                ${isCancellable ? `<button onclick="window.triggerCancelBooking('${bookingId}')" 
                    style="padding:4px 10px;border-radius:6px;border:1px solid #fecdd3;background:#fff5f5;color:#e11d48;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
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
    // Support both booking_date (split) and booking_datetime (combined)
    const today = data.filter(b => {
        const d = b.booking_date || (b.booking_datetime || '').slice(0, 10) || '';
        return d === todayISO();
    });
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

    // ── Create booking logic moved to global-booking-modal.js ────────────────

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

// ─── Form logic removed (handled globally) ────────────────────────────────────

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

        // Handle both flat array response and wrapped { bookings: [...] } format
        let bookingsList = [];
        if (Array.isArray(data)) {
            // Check if it's a flat array of booking objects or a wrapped array
            if (data.length > 0 && data[0].bookings) {
                bookingsList = data[0].bookings;
            } else {
                bookingsList = data; // flat array — use directly
            }
        } else if (data && data.bookings) {
            bookingsList = data.bookings;
        }

        liveBookingsData = bookingsList;
        window.liveBookingsData = liveBookingsData;

        renderBookings(liveBookingsData);

    } catch (err) {
        console.error('Error fetching bookings:', err);
        renderBookings(liveBookingsData || []);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initBookings() {
    window.fetchBookings = fetchBookings; // allow global modal to refresh the table
    setupModals();
    attachEventListeners();
    await fetchBookings();
}
