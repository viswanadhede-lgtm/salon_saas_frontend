import { supabase } from './lib/supabase.js';
import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

// ─── In-Memory Store ─────────────────────────────────────────────────────────
let liveBookingsData = [];

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
    const serviceName  = b.service_name || '—';
    const staffName    = b.staff_name || '—';
    const bookingType  = b.booking_type || '—';
    const dateOnly     = b.booking_date || '';
    const timeOnly     = b.start_time   || '';
    const amount       = b.price != null ? `₹${Number(b.price).toLocaleString('en-IN')}` : '—';
    const status       = b.status || '';
    const payment      = b.payment_status || '';

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
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${serviceName}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${staffName}</td>
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
                            <select id="editBkService" class="form-select">
                                <option value="">Loading services...</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkStaff">Staff</label>
                            <select id="editBkStaff" class="form-select">
                                <option value="">Loading staff...</option>
                            </select>
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
                                style="background:#f8fafc; cursor:not-allowed; color:#64748b; font-weight:600; text-transform:capitalize;">
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkPrice">Price <span style="font-weight:400;color:#94a3b8;">(₹)</span></label>
                            <input type="number" id="editBkPrice" class="form-input" placeholder="e.g. 500" min="0" step="0.01">
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

// ─── Populate Edit Dropdowns (Supabase) ───────────────────────────────────────
async function populateEditDropdowns(currentServiceName, currentStaffName, currentPrice) {
    const serviceSelect = document.getElementById('editBkService');
    const staffSelect   = document.getElementById('editBkStaff');
    if (!serviceSelect || !staffSelect) return;

    serviceSelect.innerHTML = '<option value="">Loading services...</option>';
    staffSelect.innerHTML   = '<option value="">Loading staff...</option>';
    serviceSelect.disabled  = true;
    staffSelect.disabled    = true;

    try {
        const company_id = getCompanyId();
        const branch_id = getBranchId();

        const [svcRes, staffRes] = await Promise.all([
            supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
            supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id)
        ]);

        // Services
        serviceSelect.innerHTML = '<option value="">Select a service</option>';
        const services = (svcRes.data || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
        services.forEach(s => {
            const opt = document.createElement('option');
            opt.value       = s.service_id;
            opt.textContent = s.service_name;
            opt.dataset.price = (s.price || '').toString();
            serviceSelect.appendChild(opt);
        });
        
        if (currentServiceName) {
            const match = Array.from(serviceSelect.options).find(
                o => o.textContent.trim().toLowerCase() === currentServiceName.trim().toLowerCase()
            );
            if (match) serviceSelect.value = match.value;
        }
        serviceSelect.disabled = false;

        // Staff
        staffSelect.innerHTML = '<option value="">Select staff member</option>';
        const staffList = (staffRes.data || []).filter(s => s.status !== 'deleted');
        staffList.forEach(m => {
            const opt = document.createElement('option');
            opt.value       = m.staff_id;
            opt.textContent = m.staff_name || m.name;
            staffSelect.appendChild(opt);
        });
        
        if (currentStaffName) {
            const match = Array.from(staffSelect.options).find(
                o => o.textContent.trim().toLowerCase() === currentStaffName.trim().toLowerCase()
            );
            if (match) staffSelect.value = match.value;
        }
        staffSelect.disabled = false;

        const priceInput = document.getElementById('editBkPrice');
        if (priceInput && currentPrice != null) priceInput.value = currentPrice;

    } catch (err) {
        console.error('Error populating edit dropdowns:', err);
        serviceSelect.innerHTML = '<option value="">Error loading</option>';
        staffSelect.innerHTML   = '<option value="">Error loading</option>';
        serviceSelect.disabled  = false;
        staffSelect.disabled    = false;
    }
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
        // Fetch total paid amount from transactions
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking')
            .in('status', ['paid', 'refunded']);

        if (error) throw error;

        // Sum up all transactions (payments - previous refunds)
        // Since refunds are now stored as positive values, we must subtract records with status 'refunded'
        refundableAmount = (data || []).reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            return status === 'refunded' ? sum - val : sum + val;
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
                payment_method: document.getElementById('refundMethodDisplay').value || 'Refund',
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

        const svcSel   = document.getElementById('editBkService');
        const staffSel = document.getElementById('editBkStaff');

        const updatePayload = {
            booking_date:   date,
            start_time:     time,
            service_id:     svcSel?.value || '',
            service_name:   svcSel?.options[svcSel.selectedIndex]?.text || '',
            staff_id:       staffSel?.value || '',
            staff_name:     staffSel?.options[staffSel.selectedIndex]?.text || '',
            price:          Number(document.getElementById('editBkPrice')?.value || 0),
            status:         document.getElementById('editBkStatus').value,
            notes:          document.getElementById('editBkNotes').value.trim()
        };

        const btn = document.querySelector('button[form="editBookingForm"]');
        const orig = btn?.textContent;
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

        try {
            const { data, error } = await supabase
                .from('bookings')
                .eq('booking_id', bookingId)
                .update(updatePayload);

            if (error) {
                console.error('Supabase update error:', error);
                window.toast && window.toast('Error: ' + (error.message || 'Unknown error'));
            } else {
                window.toast && window.toast('Booking updated successfully!');
                editModal.classList.remove('active');
                await fetchBookings();
            }
        } catch (err) {
            console.error(err);
            window.toast && window.toast('Network error updating booking.');
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
    window.openEditBookingModal = (bookingId) => {
        const b = liveBookingsData.find(x => (x.booking_id || x.id) === bookingId);
        if (!b) return;

        document.getElementById('editBookingId').value = bookingId;
        document.getElementById('editBkDate').value    = b.booking_date || '';
        document.getElementById('editBkTime').value    = (b.start_time || '').slice(0, 5);
        document.getElementById('editBkNotes').value   = b.notes || '';

        let statusVal = (b.status || '').toLowerCase().trim();
        if (!statusVal || statusVal === 'null') statusVal = 'confirmed';
        if (statusVal === 'no_show') statusVal = 'no-show';

        let paymentVal = (b.payment_status || '').toLowerCase().trim();
        if (!paymentVal || paymentVal === 'null') paymentVal = 'pending';

        const statusEl = document.getElementById('editBkStatus');
        if (statusEl) {
            let matchIndex = Array.from(statusEl.options).findIndex(o => o.value === statusVal);
            statusEl.selectedIndex = matchIndex >= 0 ? matchIndex : 1;
        }

        const paymentEl = document.getElementById('editBkPayment');
        if (paymentEl) {
            paymentEl.value = paymentVal;
        }

        document.getElementById('editBookingModal')?.classList.add('active');
        if (window.feather) feather.replace();

        populateEditDropdowns(b.service_name || '', b.staff_name || '', b.price);
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
