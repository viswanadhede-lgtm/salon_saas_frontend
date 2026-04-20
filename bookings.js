import { supabase } from './lib/supabase.js';
import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

// ─── In-Memory Store ─────────────────────────────────────────────────────────
let liveBookingsData = [];

// ─── Edit Modal State ─────────────────────────────────────────────────────────
let editLiveServices      = [];
let editLiveStaff         = [];
let editRowCounter        = 0;
let editActiveBooking     = null;   // the grouped booking record from liveBookingsData
let originalServiceRowIds = new Set(); // tracks DB row ids fetched when modal opened

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// ─── Status Badge HTML ────────────────────────────────────────────────────────
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

// ─── Payment Badge HTML ───────────────────────────────────────────────────────
function paymentBadge(status) {
    const map = {
        paid:    { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        unpaid:  { color: '#991b1b', bg: '#fee2e2', label: 'Unpaid' },
        pending: { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        partial: { color: '#86198f', bg: '#f5d0fe', label: 'Partial' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Row Renderer ─────────────────────────────────────────────────────────────
function buildRow(b, includeDate = false) {
    const bookingId    = b.booking_id || b.id || '';
    const customerName = b.customer_name || '—';
    const phone        = String(b.customer_phone || '');
    const bookingType  = b.booking_type || '—';
    const dateOnly     = b.booking_date || '';
    const timeOnly     = b.start_time   || '';
    const amount       = b.price != null ? `₹${Number(b.price).toLocaleString('en-IN')}` : '—';
    const status       = b.status || '';
    const payment      = b.payment_status || '';

    // Multi-service support: prefer aggregated arrays, fall back to single values
    const serviceNames = (b.service_names || (b.service_name ? [b.service_name] : [])).filter(Boolean);
    const staffNames   = (b.staff_names   || (b.staff_name   ? [b.staff_name]   : [])).filter(Boolean);

    const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes(status.toLowerCase());
    const isEditable    = !['cancelled', 'completed'].includes(status.toLowerCase());

    let dateDisplay = '—';
    let timeDisplay = '—';
    if (dateOnly) {
        try {
            const d = new Date(`${dateOnly}T00:00`);
            dateDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { dateDisplay = dateOnly; }
    }
    if (timeOnly) {
        try {
            const [hh, mm] = timeOnly.split(':').map(Number);
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
            timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
        } catch { timeDisplay = timeOnly; }
    }

    // Render service names as small chips (one per service)
    const serviceCell = serviceNames.length
        ? serviceNames.map(s =>
            `<span style="display:inline-block; padding:2px 8px; border-radius:20px; font-size:0.72rem;
             font-weight:500; background:#f1f5f9; color:#334155; margin:1px 2px 1px 0; white-space:nowrap;">${s}</span>`
          ).join('')
        : '—';

    // Render staff names as plain text (joined)
    const staffCell = staffNames.length ? staffNames.join(', ') : '—';

    const cellStyle = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    return `
    <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;"
        onmouseover="this.style.background='#f8fafc'"
        onmouseout="this.style.background=''">
        <td style="padding:10px 8px;${cellStyle}">
            <div style="font-weight:600;font-size:0.87rem;color:#0f172a;${cellStyle}">${customerName}</div>
            ${phone ? `<div style="font-size:0.75rem;color:#94a3b8;${cellStyle}">${phone}</div>` : ''}
        </td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${dateDisplay}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${timeDisplay}</td>
        <td style="padding:10px 8px; max-width:200px;">${serviceCell}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${staffCell}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${bookingType}</td>
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
                ${status.toLowerCase() === 'cancelled' && (payment.toLowerCase() === 'paid' || payment.toLowerCase() === 'partial') ? `
                <button onclick="window.openRefundModal('${bookingId}')"
                    style="padding:4px 10px;border-radius:6px;border:1px solid #fecdd3;background:#fff1f2;color:#e11d48;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
                    onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
                    Refund
                </button>` : ''}
            </div>
        </td>
    </tr>`;
}

function emptyRow(colspan, msg) {
    return `<tr><td colspan="10" style="padding:48px 24px;text-align:center;color:#94a3b8;font-size:0.9rem;">${msg}</td></tr>`;
}

// ─── Render Tables ────────────────────────────────────────────────────────────
function renderBookings(data) {
    const today    = data.filter(b => (b.booking_date || '').slice(0, 10) === todayISO());
    const allBooks = data;

    const bodyToday = document.getElementById('tbTableBodyToday');
    const bodyAll   = document.getElementById('tbTableBodyAll');

    if (bodyToday) {
        bodyToday.innerHTML = today.length
            ? today.map(b => buildRow(b, false)).join('')
            : emptyRow(8, 'No bookings for today.');
    }
    if (bodyAll) {
        bodyAll.innerHTML = allBooks.length
            ? allBooks.map(b => buildRow(b, true)).join('')
            : emptyRow(8, 'No bookings found.');
    }
}

// ─── Inject Modals ───────────────────────────────────────────────────────────
function setupModals() {
    document.querySelectorAll('#editBookingModal').forEach(m => m.remove());

    if (!document.getElementById('editBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="editBookingModal">
            <div class="modal-container" style="width:640px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Booking</h2>
                        <p class="subtitle">Update booking details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditBookingModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;overflow-y:auto;max-height:70vh;">
                    <form id="editBookingForm">
                        <input type="hidden" id="editBookingId">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin-bottom:16px;">
                            <div class="form-group" style="margin:0;">
                                <label class="form-label" for="editBkDate">Date <span class="text-rose">*</span></label>
                                <input type="date" id="editBkDate" class="form-input" required>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label" for="editBkTime">Time <span class="text-rose">*</span></label>
                                <input type="time" id="editBkTime" class="form-input" required>
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
                                <input type="text" id="editBkPayment" class="form-input" readonly
                                    style="background:#f8fafc;cursor:not-allowed;color:#64748b;font-weight:600;text-transform:capitalize;">
                            </div>
                        </div>

                        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:16px;background:#fafafa;">
                            <div id="editServiceRowsContainer"></div>
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkNotes">Notes <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editBkNotes" class="form-input form-textarea" style="min-height:70px;"></textarea>
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

    if (!document.getElementById('cancelBookingConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="cancelBookingConfirmOverlay" style="z-index:9999;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:400px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);">
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

    if (!document.getElementById('refundBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundBookingModal" style="z-index:9999;">
            <div class="modal-container" style="width:400px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2 style="color:#e11d48;">Process Refund</h2>
                        <p class="subtitle" id="refundModalSubtitle">Loading booking details...</p>
                    </div>
                    <button class="modal-close" id="btnCloseRefundModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:12px; padding:16px; margin-bottom:20px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; color:#9f1239; font-weight:600; text-transform:uppercase; letter-spacing:0.02em;">Refundable Amount</span>
                            <span style="font-size:1.25rem; color:#e11d48; font-weight:700;" id="refundAmountDisplay">₹0</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Payment Method Used</label>
                        <input type="text" id="refundMethodDisplay" class="form-input" readonly style="background:#f8fafc; cursor:not-allowed;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Refund Note</label>
                        <textarea id="refundNote" class="form-input" placeholder="Optional notes about the refund..." style="min-height:80px;"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelRefund">Cancel</button>
                    <button type="button" class="btn btn-primary" id="btnConfirmRefund" style="background:#e11d48; border-color:#e11d48;">Issue Refund</button>
                </div>
            </div>
        </div>`);
    }

    if (window.feather) feather.replace();
}

// ─── Edit Modal: Load Services + Staff into module-level arrays ───────────────
async function loadEditDropdownData() {
    const company_id = getCompanyId();
    const branch_id  = getBranchId();
    const [svcRes, staffRes] = await Promise.all([
        supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
        supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id)
    ]);
    editLiveServices = (svcRes.data || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
    editLiveStaff    = (staffRes.data || []).filter(s => s.status !== 'deleted');
}

// ─── Edit Modal: Build a single service + staff + price row ───────────────────
function buildEditServiceRow(rowId, isFirst, prefillSvcId = '', prefillStaffId = '', prefillPrice = '', dbId = null) {
    const svcOptions = editLiveServices.map(s =>
        `<option value="${s.service_id}" data-price="${s.price || 0}" ${
            prefillSvcId === s.service_id ? 'selected' : ''}>${s.service_name}</option>`
    ).join('');

    const staffOptions = editLiveStaff.map(m =>
        `<option value="${m.staff_id}" ${
            prefillStaffId === m.staff_id ? 'selected' : ''}>${m.staff_name || m.name}</option>`
    ).join('');

    const div = document.createElement('div');
    div.className    = 'edit-service-row';
    div.dataset.rowId = rowId;
    if (dbId) div.dataset.dbId = dbId; // Supabase row PK — used for targeted UPDATE/DELETE

    const separatorHtml = !isFirst
        ? `<hr style="border:none;border-top:1px dashed #e2e8f0;margin:8px 0;">`
        : '';

    div.innerHTML = `
        ${separatorHtml}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
            <div class="form-group" style="margin:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <label class="form-label" style="margin-bottom:0;">Service <span class="text-rose">*</span></label>
                    ${isFirst
                        ? `<button type="button" id="btnEditAddService"
                                style="font-size:0.78rem;padding:3px 10px;border-radius:6px;
                                border:1.5px solid var(--accent,#d946ef);
                                background:var(--accent,#d946ef);color:#fff;font-weight:600;cursor:pointer;">+ Add</button>`
                        : `<button type="button" class="btn-edit-remove-row"
                                style="font-size:0.75rem;padding:2px 8px;border-radius:5px;border:1px solid #fca5a5;
                                background:#fff5f5;color:#ef4444;font-weight:600;cursor:pointer;">✕ Remove</button>`
                    }
                </div>
                <select class="form-select edit-svc-select">
                    <option value="" disabled ${!prefillSvcId ? 'selected' : ''}>Select a service</option>
                    ${svcOptions}
                </select>
            </div>
            <div class="form-group" style="margin:0;">
                <label class="form-label">Staff <span class="text-rose">*</span></label>
                <select class="form-select edit-staff-select">
                    <option value="" disabled ${!prefillStaffId ? 'selected' : ''}>Select staff</option>
                    ${staffOptions}
                </select>
            </div>
        </div>
        <div class="form-group" style="margin:0;">
            <label class="form-label">Price <span style="font-weight:400;color:#94a3b8;">(₹)</span></label>
            <input type="number" class="form-input edit-svc-price" placeholder="e.g. 500" min="0" step="0.01"
                value="${prefillPrice !== '' && prefillPrice != null ? prefillPrice : ''}">
        </div>
    `;

    // Auto-fill price when service changes
    const svcSel     = div.querySelector('.edit-svc-select');
    const priceInput = div.querySelector('.edit-svc-price');
    svcSel.addEventListener('change', () => {
        const opt = svcSel.options[svcSel.selectedIndex];
        if (opt?.value) {
            const p = parseFloat(opt.dataset.price || 0);
            if (p && !priceInput.value) priceInput.value = p;
        }
    });

    // Staff sync across all rows in the container
    const staffSel = div.querySelector('.edit-staff-select');
    staffSel.addEventListener('change', () => {
        document.getElementById('editServiceRowsContainer')
            ?.querySelectorAll('.edit-staff-select')
            .forEach(sel => { if (sel !== staffSel) sel.value = staffSel.value; });
    });

    // Remove button (non-first rows only)
    if (!isFirst) {
        div.querySelector('.btn-edit-remove-row').addEventListener('click', () => div.remove());
    }

    return div;
}

// ─── Refund Logic ────────────────────────────────────────────────────────────
let activeRefundBookingId = null;
let refundableAmount = 0;

window.openRefundModal = async function(bookingId) {
    activeRefundBookingId = bookingId;
    const b = (window.liveBookingsData || []).find(x => (x.booking_id || x.id) == bookingId);
    if (!b) return;

    const modal = document.getElementById('refundBookingModal');
    const subtitle = document.getElementById('refundModalSubtitle');
    const amountDisp = document.getElementById('refundAmountDisplay');
    const methodDisp = document.getElementById('refundMethodDisplay');
    const noteField = document.getElementById('refundNote');

    subtitle.textContent = `${b.customer_name || 'Customer'} • ${b.service_name || 'Service'}`;
    amountDisp.textContent = 'Calculating...';
    methodDisp.value = 'Loading...';
    noteField.value = '';

    modal.classList.add('active');

    try {
        // Fetch transactions for this booking
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');

        if (error) throw error;

        // Sum up only actual payments and subtract refunds
        refundableAmount = (data || []).reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            
            if (status === 'paid') return sum + val;
            if (status === 'refunded') return sum - val;
            return sum; // Ignore 'pending' or other statuses
        }, 0);
        
        if (refundableAmount < 0) refundableAmount = 0; // Safeguard

        amountDisp.textContent = `₹${refundableAmount.toLocaleString('en-IN')}`;
        
        // Use the last payment method as a hint
        const lastMethod = data && data.length > 0 ? data[data.length - 1].payment_method : 'Multiple';
        methodDisp.value = lastMethod || 'N/A';

        const confirmBtn = document.getElementById('btnConfirmRefund');
        if (refundableAmount <= 0) {
            amountDisp.style.color = '#94a3b8';
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Nothing to Refund';
            }
        } else {
            amountDisp.style.color = '#e11d48';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Issue Refund';
            }
        }
    } catch (err) {
        console.error('[Refund] Error fetching transaction total:', err);
        amountDisp.textContent = 'Error';
        amountDisp.style.color = '#ef4444';
    }
};

window.processRefund = async function() {
    if (!activeRefundBookingId || refundableAmount <= 0) return;

    const btn = document.getElementById('btnConfirmRefund');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();
        const note = document.getElementById('refundNote').value.trim();

        // Record a negative transaction
        const { error } = await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: activeRefundBookingId,
                reference_type: 'booking',
                amount: Math.abs(refundableAmount), // Positive amount for refund as requested by user
                currency: 'INR',
                payment_method: (document.getElementById('refundMethodDisplay')?.value || 'cash').toLowerCase(),
                status: 'refunded',
                notes: note || 'Refund processed for cancelled booking',
                paid_at: new Date().toISOString()
            });

        if (error) throw error;

        // Success!
        document.getElementById('refundBookingModal').classList.remove('active');
        if (window.toast) {
            window.toast('✓ Refund processed successfully');
        } else {
            alert('Refund processed successfully');
        }

        // Trigger refresh
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId: activeRefundBookingId, amount: -refundableAmount }
        }));

    } catch (err) {
        console.error('[Refund] Failed to process refund:', err);
        alert('Failed to process refund: ' + (err.message || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

// ─── Attach Event Listeners ───────────────────────────────────────────────────
function attachEventListeners() {

    // Refund Modal Listeners
    const refundModal = document.getElementById('refundBookingModal');
    const btnCancelRefund = document.getElementById('btnCancelRefund');
    const btnCloseRefund = document.getElementById('btnCloseRefundModal');
    const btnConfirmRefund = document.getElementById('btnConfirmRefund');

    const closeRefund = () => refundModal?.classList.remove('active');
    
    btnCancelRefund?.addEventListener('click', closeRefund);
    btnCloseRefund?.addEventListener('click', closeRefund);
    btnConfirmRefund?.addEventListener('click', window.processRefund);
    refundModal?.addEventListener('click', (e) => {
        if (e.target === refundModal) closeRefund();
    });

    const editModal = document.getElementById('editBookingModal');
    const editForm  = document.getElementById('editBookingForm');

    document.getElementById('btnCloseEditBookingModal')?.addEventListener('click', () => editModal?.classList.remove('active'));
    document.getElementById('btnCancelEditBooking')?.addEventListener('click',     () => editModal?.classList.remove('active'));
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    // ── Update Booking → Supabase PATCH ──────────────────────────────────────
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookingId = document.getElementById('editBookingId').value;
        const date      = document.getElementById('editBkDate').value;
        const time      = document.getElementById('editBkTime').value;
        const status    = document.getElementById('editBkStatus').value;
        const notes     = document.getElementById('editBkNotes').value.trim();

        const container = document.getElementById('editServiceRowsContainer');
        const svcRowEls = container?.querySelectorAll('.edit-service-row');

        if (!svcRowEls || svcRowEls.length === 0) {
            window.toast && window.toast('Please add at least one service.');
            return;
        }

        // Validate all rows
        let valid = true;
        svcRowEls.forEach(row => {
            if (!row.querySelector('.edit-svc-select')?.value ||
                !row.querySelector('.edit-staff-select')?.value) valid = false;
        });
        if (!valid) {
            window.toast && window.toast('Please select a service and staff for every row.');
            return;
        }

        const btn  = document.querySelector('button[form="editBookingForm"]');
        const orig = btn?.textContent;
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

        try {
            const b = editActiveBooking;
            const currentDbIds = new Set();
            const updates = [];
            const inserts = [];

            Array.from(svcRowEls).forEach(row => {
                const svcSel     = row.querySelector('.edit-svc-select');
                const staffSel   = row.querySelector('.edit-staff-select');
                const priceInput = row.querySelector('.edit-svc-price');
                const opt        = svcSel?.options[svcSel.selectedIndex];
                const dbId       = row.dataset.dbId || null;

                const payload = {
                    company_id:     getCompanyId(),
                    branch_id:      getBranchId(),
                    booking_id:     bookingId,
                    customer_id:    b?.customer_id    || null,
                    customer_name:  b?.customer_name  || '',
                    customer_mail:  b?.customer_mail  || b?.customer_email || null,
                    customer_phone: b?.customer_phone || '',
                    service_id:     svcSel?.value     || '',
                    service_name:   opt?.textContent?.trim() || '',
                    staff_id:       staffSel?.value   || '',
                    staff_name:     staffSel?.options[staffSel.selectedIndex]?.text || '',
                    booking_date:   date,
                    start_time:     time,
                    end_time:       null,
                    notes:          notes,
                    price:          Number(priceInput?.value || 0),
                    status:         status,
                    payment:        b?.payment        || 'pending',
                    booking_type:   b?.booking_type   || 'walk-in'
                };

                if (dbId) {
                    currentDbIds.add(dbId);
                    updates.push({ id: dbId, payload });
                } else {
                    inserts.push(payload);
                }
            });

            // Rows removed from UI that existed in DB → DELETE
            const toDelete = [...originalServiceRowIds].filter(id => !currentDbIds.has(id));

            const ops = [];
            for (const { id, payload } of updates) {
                ops.push(supabase.from('bookings').update(payload).eq('id', id));
            }
            if (inserts.length > 0) {
                ops.push(supabase.from('bookings').insert(inserts));
            }
            for (const id of toDelete) {
                ops.push(supabase.from('bookings').delete().eq('id', id));
            }

            const results = await Promise.all(ops);
            const failedOp = results.find(r => r.error);
            if (failedOp) throw failedOp.error;

            // ── Update summary row in bookings_for_business_transaction ──
            const allCurrentRows = Array.from(svcRowEls);
            const summaryUpdate = {
                service_id:   allCurrentRows.map(row => row.querySelector('.edit-svc-select')?.value || '').filter(Boolean).join(', '),
                staff_id:     [...new Set(allCurrentRows.map(row => row.querySelector('.edit-staff-select')?.value || '').filter(Boolean))].join(', '),
                service_name: allCurrentRows.map(row => {
                    const sel = row.querySelector('.edit-svc-select');
                    return sel?.options[sel.selectedIndex]?.textContent?.trim() || '';
                }).filter(Boolean).join(', '),
                staff_name: [...new Set(allCurrentRows.map(row => {
                    const sel = row.querySelector('.edit-staff-select');
                    return sel?.options[sel.selectedIndex]?.text?.trim() || '';
                }).filter(Boolean))].join(', '),
                total_price:  allCurrentRows.reduce((sum, row) => {
                    return sum + (Number(row.querySelector('.edit-svc-price')?.value) || 0);
                }, 0),
                booking_date: date,
                start_time:   time,
                notes:        notes,
                status:       status,
                updated_at:   new Date().toISOString()
            };
            const { error: summaryErr } = await supabase
                .from('bookings_for_business_transaction')
                .update(summaryUpdate)
                .eq('booking_id', bookingId);
            if (summaryErr) console.error('[EditBooking] summary update error:', summaryErr);

            window.toast && window.toast('Booking updated successfully!');
            editModal.classList.remove('active');
            await fetchBookings();

        } catch (err) {
            console.error('[EditBooking] Update error:', err);
            window.toast && window.toast('Error updating booking: ' + (err.message || 'Unknown error'));
        } finally {
            if (btn) { btn.textContent = orig; btn.disabled = false; }
        }
    });

    // ── Cancel Booking → Supabase PATCH status='cancelled' ───────────────────
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
            const { error } = await supabase
                .from('bookings')
                .eq('booking_id', bookingToCancel)
                .update({ status: 'cancelled' });

            if (error) {
                console.error('Supabase cancel error:', error);
                window.toast && window.toast('Error: ' + error.message);
            } else {
                // Also cancel the summary row
                const { error: summaryErr } = await supabase
                    .from('bookings_for_business_transaction')
                    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                    .eq('booking_id', bookingToCancel);
                if (summaryErr) console.error('[Cancel] summary update error:', summaryErr);

                // Insert cancellation marker in the financial ledger
                const { error: ledgerErr } = await supabase
                    .from('business_transactions')
                    .insert([{
                        company_id: getCompanyId() || null,
                        branch_id: getBranchId() || null,
                        reference_id: bookingToCancel,
                        reference_type: 'booking',
                        status: 'cancelled',
                        amount: 0,
                        created_at: new Date().toISOString()
                    }]);
                if (ledgerErr) console.error('[Cancel] ledger insert error:', ledgerErr);

                window.toast && window.toast('Booking cancelled successfully!');
                await fetchBookings();
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
    window.openEditBookingModal = async (bookingId) => {
        const b = liveBookingsData.find(x => (x.booking_id || x.id) === bookingId);
        if (!b) return;

        editActiveBooking     = b;
        originalServiceRowIds = new Set();

        // Prefill shared fields
        document.getElementById('editBookingId').value = bookingId;
        document.getElementById('editBkDate').value    = b.booking_date || '';
        document.getElementById('editBkTime').value    = (b.start_time || '').slice(0, 5);
        document.getElementById('editBkNotes').value   = b.notes || '';

        let statusVal = (b.status || '').toLowerCase().trim();
        if (!statusVal || statusVal === 'null') statusVal = 'confirmed';
        if (statusVal === 'no_show') statusVal = 'no-show';

        const statusEl = document.getElementById('editBkStatus');
        if (statusEl) {
            const idx = Array.from(statusEl.options).findIndex(o => o.value === statusVal);
            statusEl.selectedIndex = idx >= 0 ? idx : 1;
        }

        const paymentEl = document.getElementById('editBkPayment');
        if (paymentEl) paymentEl.value = (b.payment_status || b.payment || 'pending').toLowerCase();

        // Open modal & show loading state
        const editModal = document.getElementById('editBookingModal');
        editModal?.classList.add('active');
        if (window.feather) feather.replace();

        const container = document.getElementById('editServiceRowsContainer');
        if (container) container.innerHTML = `
            <div style="text-align:center;padding:24px;color:#94a3b8;font-size:0.9rem;">
                ⏳ Loading services...
            </div>`;

        try {
            // Parallel: load dropdown data + fetch all service rows for this booking group
            const [, { data: allRows, error }] = await Promise.all([
                loadEditDropdownData(),
                supabase.from('bookings').select('*').eq('booking_id', bookingId)
            ]);

            if (error) throw error;

            container.innerHTML = '';
            editRowCounter = 0;
            const rows = (allRows && allRows.length > 0) ? allRows : [b];

            rows.forEach((row, i) => {
                // Track original DB row ids so we can DELETE removed ones on save
                if (row.id) originalServiceRowIds.add(row.id);
                container.appendChild(buildEditServiceRow(
                    editRowCounter++, i === 0,
                    row.service_id || '', row.staff_id || '', row.price ?? '',
                    row.id || null
                ));
            });

            // Wire the "+ Add" button (lives inside first row)
            document.getElementById('btnEditAddService')?.addEventListener('click', () => {
                const firstStaff = container.querySelector('.edit-staff-select')?.value || '';
                container.appendChild(buildEditServiceRow(editRowCounter++, false, '', firstStaff, '', null));
            });

        } catch (err) {
            console.error('[EditModal] Error loading booking rows:', err);
            if (container) container.innerHTML =
                `<div style="color:#ef4444;padding:12px;text-align:center;">Error loading booking details.</div>`;
        }
    };

    window.triggerCancelBooking = (bookingId) => {
        bookingToCancel = bookingId;
        document.getElementById('cancelBookingConfirmOverlay')?.classList.add('active');
        if (window.feather) feather.replace();
    };
}

// ─── Fetch Bookings from Supabase ─────────────────────────────────────────────
export async function fetchBookings() {
    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        let query = supabase
            .from('bookings_with_payment_status')
            .select('*')
            .order('booking_date', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId)  query = query.eq('branch_id', branchId);

        const { data, error } = await query;

        if (error) {
            console.error('[Bookings] Supabase fetch error:', error);
            renderBookings(liveBookingsData || []);
            return;
        }

        liveBookingsData = data || [];
        window.liveBookingsData = liveBookingsData;
        renderBookings(liveBookingsData);

    } catch (err) {
        console.error('[Bookings] Unexpected error:', err);
        renderBookings(liveBookingsData || []);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initBookings() {
    window.fetchBookings = fetchBookings;
    setupModals();
    attachEventListeners();
    
    // Listen for global payment recording event
    document.addEventListener('payment-recorded', async () => {
        console.log('[Bookings] Payment recorded event detected, refreshing...');
        await fetchBookings();
    });

    await fetchBookings();
}
