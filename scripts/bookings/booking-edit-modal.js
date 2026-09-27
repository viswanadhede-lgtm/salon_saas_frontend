// scripts/bookings/booking-edit-modal.js
import { supabase } from '../../lib/supabase.js';
import { getCompanyId, getBranchId, todayISO, formatTime12, getLiveBookings, editState } from './bookings-state.js';
import { statusBadge } from './bookings-table.js';
import { loadEditDropdownData, fetchBookings } from './bookings-data.js';

// ─── Edit Modal: Build a single service + staff + price row ───────────────────
export function buildEditServiceRow(rowId, isFirst, prefillSvcId = '', prefillStaffId = '', prefillPrice = '', dbId = null) {
    const svcOptions = editState.liveServices.map(s =>
        `<option value="${s.service_id}" data-type="service" data-price="${s.price || 0}" ${
            prefillSvcId === s.service_id ? 'selected' : ''}>${s.service_name}</option>`
    ).join('');

    const pkgOptions = editState.livePackages.map(p =>
        `<option value="${p.package_id}" data-type="package" data-price="${p.final_price || 0}" ${
            prefillSvcId === p.package_id ? 'selected' : ''}>${p.package_name}</option>`
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

    const staffOptions = editState.liveStaff.map(m =>
        `<option value="${m.staff_id}" ${
            prefillStaffId === m.staff_id ? 'selected' : ''}>${m.staff_name || m.name}</option>`
    ).join('');

    const div = document.createElement('div');
    div.className    = 'edit-service-row';
    div.dataset.rowId = rowId;
    if (dbId) div.dataset.dbId = dbId; // Supabase row PK — used for targeted UPDATE/DELETE

    const colors = ['#f8fafc', '#fdf4ff', '#f0fdf4', '#fffbeb', '#fef2f2', '#f0f9ff'];
    const cardBg = colors[rowId % colors.length];

    div.innerHTML = `
        <div style="padding:16px;background:${cardBg};border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.05);position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span class="edit-row-badge" style="font-size:0.7rem;font-weight:700;color:#4f46e5;background:#e0e7ff;border:1px solid #c7d2fe;border-radius:6px;padding:2px 9px;letter-spacing:0.03em;">#${rowId + 1}</span>
                ${!isFirst
                    ? `<button type="button" class="btn-edit-remove-row" style="font-size:0.75rem;padding:4px 8px;border-radius:6px;border:1px solid #fca5a5;background:#fff5f5;color:#ef4444;font-weight:600;cursor:pointer;">✕ Remove</button>`
                    : '<span></span>'
                }
            </div>
            <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:16px;margin-bottom:0;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Service <span class="text-rose">*</span></label>
                    <select class="form-select edit-svc-select" required>
                        <option value="" disabled ${!prefillSvcId ? 'selected' : ''}>Select a service or package</option>
                        ${combinedOptions}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Staff <span class="text-rose">*</span></label>
                    <select class="form-select edit-staff-select" required>
                        <option value="" disabled ${!prefillStaffId ? 'selected' : ''}>Select staff</option>
                        ${staffOptions}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Price <span style="font-weight:400;color:#94a3b8;">(₹)</span></label>
                    <input type="number" class="form-input edit-svc-price" placeholder="e.g. 500" min="0" step="0.01" value="${prefillPrice !== '' && prefillPrice != null ? prefillPrice : ''}" required>
                </div>
            </div>
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
        syncEditServiceDropdowns();
    });

    // Remove button (non-first rows only) — re-labels all badges after removal
    if (!isFirst) {
        div.querySelector('.btn-edit-remove-row').addEventListener('click', () => {
            div.remove();
            document.querySelectorAll('#editServiceRowsContainer .edit-service-row').forEach((row, i) => {
                row.dataset.rowId = i;
                const badge = row.querySelector('.edit-row-badge');
                if (badge) badge.textContent = `#${i + 1}`;
            });
            syncEditServiceDropdowns();
        });
    }

    return div;
}

// ─── Edit Modal: Prevent duplicate service selection across cards ───────────────
export function syncEditServiceDropdowns() {
    const container = document.getElementById('editServiceRowsContainer');
    if (!container) return;
    const allSelects = Array.from(container.querySelectorAll('.edit-svc-select'));
    const selectedValues = allSelects.map(sel => sel.value).filter(Boolean);
    allSelects.forEach(sel => {
        const myValue = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return; // skip placeholder
            if (opt.value === myValue) {
                opt.disabled = false;
                opt.hidden   = false;
            } else if (selectedValues.includes(opt.value)) {
                opt.disabled = true;
                opt.hidden   = true;
            } else {
                opt.disabled = false;
                opt.hidden   = false;
            }
        });
    });
}

// ─── Payment Not Completed Warning Modal Handlers ─────────────────────────────
export function showPaymentNotCompletedModal() {
    const container = document.getElementById('editServiceRowsContainer');
    const svcRowEls = container?.querySelectorAll('.edit-service-row');
    let totalAmount = 0;
    if (svcRowEls && svcRowEls.length > 0) {
        svcRowEls.forEach(r => {
            totalAmount += Number(r.querySelector('.edit-svc-price')?.value || 0);
        });
    }
    if (!totalAmount) {
        totalAmount = Number(editState.activeBooking?.total_price || editState.activeBooking?.price || 0);
    }

    const amountEl = document.getElementById('pncModalAmount');
    if (amountEl) {
        amountEl.textContent = '₹' + totalAmount.toLocaleString('en-IN');
    }

    const modal = document.getElementById('paymentNotCompletedModal');
    if (modal) {
        modal.classList.add('active');
    }
}

export function revertStatusAndClosePnc() {
    const pncModal = document.getElementById('paymentNotCompletedModal');
    pncModal?.classList.remove('active');
    const statusSelect = document.getElementById('editBkStatus');
    if (statusSelect) {
        statusSelect.value = editState.previousEditBkStatus || (editState.activeBooking?.status || 'booked').toLowerCase();
    }
}

// ─── Open Edit Booking Modal ──────────────────────────────────────────────────
export async function openEditBookingModal(bookingId) {
    const b = (getLiveBookings() || []).find(x => (x.booking_id || x.id) === bookingId);
    if (!b) return;

    editState.activeBooking     = b;
    editState.originalServiceRowIds = new Set();

    // ── Populate LEFT PANEL (read-only booking details) ──────────────────
    const idBadge = document.getElementById('viewBkIdBadge');
    if (idBadge) idBadge.textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();

    const viewCustomer = document.getElementById('viewBkCustomer');
    if (viewCustomer) viewCustomer.textContent = b.customer_name || 'Walk-in Customer';

    const viewPhone = document.getElementById('viewBkPhone');
    if (viewPhone) viewPhone.textContent = b.customer_phone || '—';

    const viewDate = document.getElementById('viewBkDate');
    if (viewDate) {
        try {
            const d = new Date(`${b.booking_date}T00:00`);
            viewDate.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { viewDate.textContent = b.booking_date || '—'; }
    }

    const viewTime = document.getElementById('viewBkTime');
    if (viewTime) viewTime.textContent = formatTime12((b.start_time || '').slice(0, 5));

    const viewService = document.getElementById('viewBkService');
    if (viewService) viewService.textContent = b.service_name || '—';

    const viewStaff = document.getElementById('viewBkStaff');
    if (viewStaff) viewStaff.textContent = b.staff_name || '—';

    const viewType = document.getElementById('viewBkType');
    if (viewType) viewType.textContent = b.booking_type || 'walk-in';

    const viewAmount = document.getElementById('viewBkAmount');
    if (viewAmount) viewAmount.textContent = '₹' + (Number(b.total_price || b.price || 0)).toLocaleString('en-IN');

    // Status badge
    const viewStatusBadge = document.getElementById('viewBkStatusBadge');
    if (viewStatusBadge) viewStatusBadge.innerHTML = statusBadge(b.status || 'booked');

    // Payment badge
    const viewPaymentBadge = document.getElementById('viewBkPaymentBadge');
    if (viewPaymentBadge) {
        const pay = (b.payment_status || b.payment || '').toLowerCase();
        const payLabel = pay ? pay.charAt(0).toUpperCase() + pay.slice(1) : '—';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[pay] || { color: '#475569', bg: '#f1f5f9' };
        viewPaymentBadge.innerHTML = `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // ── Quick Actions (contextual) ───────────────────────────────────────
    const quickActions = document.getElementById('viewBkQuickActions');
    if (quickActions) {
        let html = '';
        const status = (b.status || '').toLowerCase();
        const payment = (b.payment_status || b.payment || '').toLowerCase();
        if (payment !== 'paid' && !['cancelled', 'no-show', 'no_show'].includes(status)) {
            html += `<button type="button" onclick="window.openBookingPayment('${bookingId}')" data-sub-feature="collect_payment" style="width:100%;padding:7px 12px;border-radius:6px;border:1px solid #c7d2fe;background:#eef2ff;color:#4338ca;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                Collect Payment
            </button>`;
        }

        if (status === 'completed') {
            html += `<button onclick="window.triggerInvoice('${bookingId}')" style="width:100%;padding:7px 12px;border-radius:6px;border:1px solid #e0e7ff;background:#eef2ff;color:#4f46e5;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                Generate Invoice
            </button>`;
        }

        if (['cancelled', 'no-show', 'no_show'].includes(status)) {
            html += `<button onclick="window.triggerRebook('${bookingId}')" data-sub-feature="create_booking" style="width:100%;padding:7px 12px;border-radius:6px;border:1px solid #ffedd5;background:#fff7ed;color:#ea580c;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background='#ffedd5'" onmouseout="this.style.background='#fff7ed'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                Re-Book This Customer
            </button>`;
        }

        if (['cancelled', 'no-show', 'no_show'].includes(status) && ['paid', 'partial'].includes(payment)) {
            html += `<button onclick="window.triggerRefund('${bookingId}')" data-sub-feature="update_booking" style="width:100%;padding:7px 12px;border-radius:6px;border:1px solid #fecdd3;background:#fff1f2;color:#dc2626;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff1f2'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Process Refund
            </button>`;
        }

        // Hide container if no quick actions
        quickActions.innerHTML = html;
        quickActions.style.display = html ? 'flex' : 'none';
    }

    // ── Populate RIGHT PANEL (editable fields) ───────────────────────────
    document.getElementById('editBookingId').value = bookingId;
    const dateInput = document.getElementById('editBkDate');
    const timeInput = document.getElementById('editBkTime');

    dateInput.value = b.booking_date || '';
    timeInput.value = (b.start_time || '').slice(0, 5);
    document.getElementById('editBkNotes').value = b.notes || '';

    // Set the status dropdown
    editState.allowCompleteWithoutPayment = false;
    editState.previousEditBkStatus = (b.status || 'booked').toLowerCase();
    const statusSelect = document.getElementById('editBkStatus');
    if (statusSelect) statusSelect.value = editState.previousEditBkStatus;

    // Restrict Date & Time to Future
    const todayStr = todayISO();
    dateInput.min = todayStr;
    
    const restrictTime = () => {
        if (dateInput.value === todayStr) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            timeInput.min = `${hh}:${mm}`;
        } else {
            timeInput.removeAttribute('min');
        }
    };
    dateInput.addEventListener('change', restrictTime);
    restrictTime();

    // ── Cancel Booking footer button ─────────────────────────────────────
    const cancelBtn = document.getElementById('btnCancelThisBooking');
    if (cancelBtn) {
        const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes((b.status || '').toLowerCase());
        cancelBtn.style.display = isCancellable ? 'inline-flex' : 'none';
        cancelBtn.onclick = () => {
            if (!confirm('Are you sure you want to cancel this booking?')) return;
            if (statusSelect) statusSelect.value = 'cancelled';
            // Auto-submit the form with cancelled status
            document.getElementById('editBookingForm')?.requestSubmit();
        };
    }

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
        editState.rowCounter = 0;
        const rows = (allRows && allRows.length > 0) ? allRows : [b];

        // Update details panel with all services & staff if available
        if (allRows && allRows.length > 0) {
            const svcNames = allRows.map(r => r.service_name).filter(Boolean);
            if (svcNames.length > 0 && viewService) viewService.textContent = svcNames.join(', ');
            const staffNames = [...new Set(allRows.map(r => r.staff_name).filter(Boolean))];
            if (staffNames.length > 0 && viewStaff) viewStaff.textContent = staffNames.join(', ');
        }

        rows.forEach((row, i) => {
            // Track original DB row ids so we can DELETE removed ones on save
            if (row.id) editState.originalServiceRowIds.add(row.id);
            container.appendChild(buildEditServiceRow(
                editState.rowCounter++, i === 0,
                row.service_id || '', row.staff_id || '', row.price ?? '',
                row.id || null
            ));
        });
        syncEditServiceDropdowns();

        // Wire the "+ Add" button safely using onclick to prevent duplicate listeners
        const addBtn = document.getElementById('btnEditAddService');
        if (addBtn) {
            addBtn.onclick = () => {
                const firstStaff = container.querySelector('.edit-staff-select')?.value || '';
                const nextId = container.querySelectorAll('.edit-service-row').length;
                container.appendChild(buildEditServiceRow(nextId, false, '', firstStaff, '', null));
                syncEditServiceDropdowns();
            };
        }

    } catch (err) {
        console.error('[EditModal] Error loading booking rows:', err);
        if (container) container.innerHTML =
            `<div style="color:#ef4444;padding:12px;text-align:center;">Error loading booking details.</div>`;
    }
}

if (typeof window !== 'undefined') {
    window.openEditBookingModal = openEditBookingModal;
}

export function attachEditModalListeners() {
    const editModal = document.getElementById('editBookingModal');
    const editForm  = document.getElementById('editBookingForm');

    document.getElementById('btnCloseEditBookingModal')?.addEventListener('click', () => editModal?.classList.remove('active'));
    document.getElementById('btnCancelEditBooking')?.addEventListener('click',     () => editModal?.classList.remove('active'));
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    // Payment Not Completed Modal Handlers
    const pncModal = document.getElementById('paymentNotCompletedModal');

    document.getElementById('btnPncCollectPayment')?.addEventListener('click', () => {
        pncModal?.classList.remove('active');
        editModal?.classList.remove('active');
        const bookingId = document.getElementById('editBookingId')?.value || editState.activeBooking?.booking_id || editState.activeBooking?.id;
        if (bookingId && window.openBookingPayment) {
            window.openBookingPayment(bookingId);
        }
    });

    document.getElementById('btnPncCompleteWithoutPayment')?.addEventListener('click', () => {
        pncModal?.classList.remove('active');
        editState.allowCompleteWithoutPayment = true;
        const statusSelect = document.getElementById('editBkStatus');
        if (statusSelect) statusSelect.value = 'completed';
        if (editForm) {
            if (typeof editForm.requestSubmit === 'function') {
                editForm.requestSubmit();
            } else {
                editForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }
    });

    document.getElementById('btnPncGoBack')?.addEventListener('click', revertStatusAndClosePnc);
    pncModal?.addEventListener('click', (e) => {
        if (e.target === pncModal) revertStatusAndClosePnc();
    });

    const editBkStatusSelect = document.getElementById('editBkStatus');
    editBkStatusSelect?.addEventListener('change', (e) => {
        const newStatus = e.target.value.toLowerCase();
        if (newStatus === 'completed' && editState.previousEditBkStatus !== 'completed') {
            const payment = (editState.activeBooking?.payment_status || editState.activeBooking?.payment || '').toLowerCase();
            if (payment !== 'paid' && !editState.allowCompleteWithoutPayment) {
                showPaymentNotCompletedModal();
                return;
            }
        }
        editState.previousEditBkStatus = newStatus;
    });

    // ── Update Booking → Supabase PATCH ──────────────────────────────────────
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookingId = document.getElementById('editBookingId').value;
        const date      = document.getElementById('editBkDate').value;
        const time      = document.getElementById('editBkTime').value;
        const status    = document.getElementById('editBkStatus')?.value || editState.activeBooking?.status || 'booked';
        const notes     = document.getElementById('editBkNotes').value.trim();

        // Check if completing an unpaid booking
        const payment   = (editState.activeBooking?.payment_status || editState.activeBooking?.payment || '').toLowerCase();
        if (status.toLowerCase() === 'completed' && editState.previousEditBkStatus !== 'completed' && payment !== 'paid' && !editState.allowCompleteWithoutPayment) {
            showPaymentNotCompletedModal();
            return;
        }

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
            const b = editState.activeBooking;
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
            const toDelete = [...editState.originalServiceRowIds].filter(id => !currentDbIds.has(id));

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
            if (window.notifyEvent) window.notifyEvent('bookings', 'evt_booking_modified', { title: 'Booking Modified', message: `Booking #${bookingId} was updated.` });
            if (window.notifyCustomer) {
                const liveData = getLiveBookings() || [];
                const bRecord = liveData.find(x => (x.booking_id || x.id) == bookingId);
                window.notifyCustomer('booking', 'booking_modify', {
                    name: bRecord?.customer_name,
                    phone: bRecord?.customer_phone || bRecord?.phone,
                    email: bRecord?.customer_email || bRecord?.email
                }, {
                    bookingId,
                    date: date,
                    time: time
                });
            }
            editModal.classList.remove('active');
            await fetchBookings();

        } catch (err) {
            console.error('[EditBooking] Update error:', err);
            window.toast && window.toast('Error updating booking: ' + (err.message || 'Unknown error'));
        } finally {
            editState.allowCompleteWithoutPayment = false;
            if (btn) { btn.textContent = orig; btn.disabled = false; }
        }
    });
}
