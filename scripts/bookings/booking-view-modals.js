// scripts/bookings/booking-view-modals.js
import { supabase } from '../../lib/supabase.js';
import { formatTime12, getLiveBookings } from './bookings-state.js';
import { statusBadge } from './bookings-table.js';

// ─── Refund Bridge Logic ─────────────────────────────────────────────────────
export async function openRefundModal(bookingId, optBookingObj) {
    try {
        await import('../rebook-refund-modal.js');
        if (window.openRefundModal) {
            return window.openRefundModal(bookingId, optBookingObj);
        }
    } catch (err) {
        console.error('[Refund] Failed to load rebook-refund-modal.js:', err);
    }
}

if (typeof window !== 'undefined' && !window.openRefundModal) {
    window.openRefundModal = openRefundModal;
}

export async function triggerRefund(bookingId) {
    if (typeof window.openRefundModal === 'function') {
        const liveData = window.liveBookingsData || getLiveBookings() || [];
        const b = liveData.find(x => String(x.booking_id || x.id) === String(bookingId));
        return window.openRefundModal(bookingId, b || null);
    }
    console.error('[Refund] openRefundModal not available — rebook-refund-modal.js may not be loaded.');
}

if (typeof window !== 'undefined') {
    window.triggerRefund = triggerRefund;
}

// ─── View Customer Profile ───────────────────────────────────────────────────
// viewCustomerProfile is handled globally by scripts/global-customer-profile-modal.js
// Thin export so bookings.js import doesn't break — delegates to window.viewCustomerProfile
export async function viewCustomerProfile(customerId, customerName) {
    if (window.viewCustomerProfile && window.viewCustomerProfile !== viewCustomerProfile) {
        return window.viewCustomerProfile(customerId, customerName);
    }
    if (!customerId) { alert('Walk-in customer — no profile record found.'); return; }
    console.warn('[booking-view-modals] global-customer-profile-modal.js not loaded yet.');
}

// ─── View Booking Invoice Modal ──────────────────────────────────────────────
export function openViewBookingModal(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) === bookingId);
    if (!b) {
        b = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
    }
    if (!b) return;

    // ID
    const vbiId = document.getElementById('vbiId');
    if (vbiId) vbiId.textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();

    // Customer
    const vbiCustomer = document.getElementById('vbiCustomer');
    if (vbiCustomer) vbiCustomer.textContent = b.customer_name || 'Walk-in Customer';
    const vbiPhone = document.getElementById('vbiPhone');
    if (vbiPhone) vbiPhone.textContent = b.customer_phone || '—';

    // Appointment Date & Time
    const vbiDate = document.getElementById('vbiDate');
    if (vbiDate) {
        try {
            const d = new Date(`${b.booking_date}T00:00`);
            vbiDate.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { vbiDate.textContent = b.booking_date || '—'; }
    }
    const vbiTime = document.getElementById('vbiTime');
    if (vbiTime) vbiTime.textContent = formatTime12((b.start_time || '').slice(0, 5));

    // Status badge
    const vbiStatusBadge = document.getElementById('vbiStatusBadge');
    if (vbiStatusBadge) vbiStatusBadge.innerHTML = statusBadge(b.status || 'completed');

    // Payment badge
    const vbiPaymentBadge = document.getElementById('vbiPaymentBadge');
    if (vbiPaymentBadge) {
        const pay = (b.payment_status || b.payment || '').toLowerCase();
        const payLabel = pay ? pay.charAt(0).toUpperCase() + pay.slice(1) : '—';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[pay] || { color: '#475569', bg: '#f1f5f9' };
        vbiPaymentBadge.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Services list
    const servicesListEl = document.getElementById('vbiServicesList');
    if (servicesListEl) {
        const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);
        const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);

        const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.total_price || b.price || 0];

        let html = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
                <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                    <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
                </tr>
            </thead>
            <tbody>`;

        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                const p = prices[i] !== undefined ? prices[i] : (prices[0] || 0);
                html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:10px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `
            <tr>
                <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${b.service_name || 'Salon Service'}</td>
                <td style="padding:10px 12px;color:#64748b;">${b.staff_name || '—'}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.total_price || b.price || 0).toLocaleString('en-IN')}</td>
            </tr>`;
        }

        html += `</tbody></table>`;
        servicesListEl.innerHTML = html;
    }

    // Total Amount
    const vbiTotal = document.getElementById('vbiTotalAmount');
    if (vbiTotal) {
        vbiTotal.textContent = '₹' + Number(b.total_price || b.price || 0).toLocaleString('en-IN');
    }

    // Show modal
    const modal = document.getElementById('viewBookingInvoiceModal');
    if (modal) modal.classList.add('active');
}

if (typeof window !== 'undefined') {
    window.openViewBookingModal = openViewBookingModal;
}

export function triggerInvoice(bookingId) {
    openViewBookingModal(bookingId);
}

if (typeof window !== 'undefined') {
    window.triggerInvoice = triggerInvoice;
}

// ─── Trigger Rebook ──────────────────────────────────────────────────────────
export async function triggerRebook(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) == bookingId);
    if (!b) return;

    // Try to fetch the email if missing from view payload
    let cEmail = b.customer_email || b.customer_mail || '';
    if (!cEmail && b.customer_id) {
        try {
            const { data } = await supabase.from('customers').select('customer_email').eq('customer_id', b.customer_id).limit(1).single();
            if (data && data.customer_email) cEmail = data.customer_email;
        } catch(e) { console.error('Failed to grab customer_email for prefill', e); }
    }

    let serviceIds = String(b.service_id || b.service_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    let staffIds   = String(b.staff_id   || b.staff_ids   || '').split(',').map(s => s.trim()).filter(Boolean);

    if (serviceIds.length === 0 && bookingId) {
        try {
            const { data: rows } = await supabase.from('bookings').select('service_id, package_id, staff_id').eq('booking_id', bookingId);
            if (rows && rows.length > 0) {
                serviceIds = rows.map(r => r.service_id || r.package_id).filter(Boolean);
                staffIds   = rows.map(r => r.staff_id).filter(Boolean);
            }
        } catch(e) { console.error('Failed to fetch booking items for rebook', e); }
    }

    if (window.openAndPrefillBooking) {
        // This awaits dropdown population BEFORE filling values — fixes race condition
        // Leaves date and time for the user to pick in the new booking modal
        await window.openAndPrefillBooking({
            customerId: b.customer_id,
            name:       b.customer_name,
            phone:      b.customer_phone,
            email:      cEmail,
            serviceIds,
            staffIds,
            notes:      b.notes || ''
        });
    } else {
        // Fallback: just open the modal normally
        const btnNewBooking = document.getElementById('btnNewBooking') || document.getElementById('btnNewBookingPage');
        if (btnNewBooking) btnNewBooking.click();
    }
}

if (typeof window !== 'undefined') {
    window.triggerRebook = triggerRebook;
}

// ─── Cancelled / No-show Booking Modal Handler ─────────────────────────────
export async function openCancelledBookingModal(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) === bookingId);
    if (!b) {
        b = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
    }
    if (!b) {
        try {
            const { data } = await supabase
                .from('bookings_for_business_transaction')
                .select('*')
                .eq('booking_id', bookingId)
                .maybeSingle();
            if (data) b = data;
        } catch (err) { console.error('Failed to fetch booking:', err); }
    }
    if (!b) return;

    const el = (id) => document.getElementById(id);

    // Dynamic Title & Status Badge based on status
    const rawStatus = (b.status || '').toLowerCase().trim();
    const isNoShow = ['no-show', 'noshow', 'no_show'].includes(rawStatus);

    if (el('cbmModalTitle')) {
        el('cbmModalTitle').textContent = isNoShow ? 'No-Show Booking' : 'Cancelled Booking';
    }
    if (el('cbmModalSubtitle')) {
        el('cbmModalSubtitle').textContent = isNoShow
            ? 'Review no-show appointment details and choose your next action.'
            : 'Review cancelled appointment details and choose your next action.';
    }

    if (el('cbmStatusBadge')) {
        if (isNoShow) {
            el('cbmStatusBadge').textContent = 'No-show';
            el('cbmStatusBadge').style.background = '#fee2e2';
            el('cbmStatusBadge').style.color = '#991b1b';
        } else {
            el('cbmStatusBadge').textContent = 'Cancelled';
            el('cbmStatusBadge').style.background = '#fef9c3';
            el('cbmStatusBadge').style.color = '#92400e';
        }
    }

    // Booking ID
    if (el('cbmId')) el('cbmId').textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();

    // Customer
    if (el('cbmCustomer')) el('cbmCustomer').textContent = b.customer_name || 'Walk-in Customer';
    if (el('cbmPhone'))    el('cbmPhone').textContent    = b.customer_phone || '—';

    // Date & Time
    if (el('cbmDate')) {
        try {
            const d = new Date(`${b.booking_date}T00:00`);
            el('cbmDate').textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { el('cbmDate').textContent = b.booking_date || '—'; }
    }
    if (el('cbmTime')) el('cbmTime').textContent = formatTime12((b.start_time || '').slice(0, 5));

    // Payment badge
    const payRaw = (b.payment_status || b.payment || '').toLowerCase();
    if (el('cbmPaymentBadge')) {
        const payLabel = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : '—';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[payRaw] || { color: '#475569', bg: '#f1f5f9' };
        el('cbmPaymentBadge').innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Show/hide refund section based on payment status
    let isPaid = ['paid', 'partial'].includes(payRaw);
    if (el('cbmRefundSection')) el('cbmRefundSection').style.display = isPaid ? 'block' : 'none';

    // Check transactions asynchronously to ensure accurate refund button visibility
    try {
        const { data: txs } = await supabase
            .from('business_transactions')
            .select('amount, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');
        if (txs && txs.some(t => (t.status || '').toLowerCase().trim() === 'paid')) {
            isPaid = true;
            if (el('cbmRefundSection')) el('cbmRefundSection').style.display = 'block';
        }
    } catch(e) { /* ignore */ }

    // Services list
    const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.total_price || b.price || 0];

    if (el('cbmServicesList')) {
        let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
            </tr></thead><tbody>`;
        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                const p = prices[i] !== undefined ? prices[i] : (prices[0] || 0);
                html += `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:10px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `<tr><td style="padding:10px 12px;font-weight:500;color:#1e293b;">${b.service_name || 'Salon Service'}</td>
                <td style="padding:10px 12px;color:#64748b;">${b.staff_name || '—'}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.total_price || b.price || 0).toLocaleString('en-IN')}</td></tr>`;
        }
        html += `</tbody></table>`;
        el('cbmServicesList').innerHTML = html;
    }

    // Total
    if (el('cbmTotal')) {
        const tot = b.final_amount != null ? b.final_amount : (b.total_price || b.price || 0);
        el('cbmTotal').textContent = '₹' + Number(tot).toLocaleString('en-IN');
    }

    // Wire Rebook button — close modal then trigger rebook prefill
    const btnRebook = el('btnCbmRebook');
    if (btnRebook) {
        const newBtn = btnRebook.cloneNode(true);
        btnRebook.parentNode.replaceChild(newBtn, btnRebook);
        newBtn.addEventListener('click', async () => {
            el('cancelledBookingModal')?.classList.remove('active');
            await triggerRebook(bookingId);
        });
    }

    // Wire Refund button — close this modal, open refund modal
    const btnRefund = el('btnCbmRefund');
    if (btnRefund) {
        const newBtn = btnRefund.cloneNode(true);
        btnRefund.parentNode.replaceChild(newBtn, btnRefund);
        newBtn.addEventListener('click', () => {
            el('cancelledBookingModal')?.classList.remove('active');
            if (window.openRefundModal) window.openRefundModal(bookingId);
        });
    }

    // Show modal
    el('cancelledBookingModal')?.classList.add('active');
}

if (typeof window !== 'undefined') {
    window.openCancelledBookingModal = openCancelledBookingModal;
}

export function attachViewModalsListeners() {
    // customerProfileBookingModal click-outside is wired by global-customer-profile-modal.js

    // ── View Booking Invoice Modal Handlers ─────────────────────────────────
    const viewInvModal = document.getElementById('viewBookingInvoiceModal');
    const closeViewInv = () => viewInvModal?.classList.remove('active');

    document.getElementById('btnCloseViewInvoiceModal')?.addEventListener('click', closeViewInv);
    document.getElementById('btnVbiGoBack')?.addEventListener('click', closeViewInv);
    viewInvModal?.addEventListener('click', (e) => {
        if (e.target === viewInvModal) closeViewInv();
    });

    // ── Cancelled Booking Modal Handlers ──────────────────────────────────────
    const cancelledModal = document.getElementById('cancelledBookingModal');
    const closeCancelledModal = () => cancelledModal?.classList.remove('active');
    document.getElementById('btnCloseCancelledBookingModal')?.addEventListener('click', closeCancelledModal);
    document.getElementById('btnCbmClose')?.addEventListener('click', closeCancelledModal);
    cancelledModal?.addEventListener('click', (e) => {
        if (e.target === cancelledModal) closeCancelledModal();
    });

    // Print invoice action
    document.getElementById('btnVbiPrint')?.addEventListener('click', () => {
        const printArea = document.getElementById('viewBookingInvoicePrintArea');
        if (!printArea) return;
        const printWindow = window.open('', '_blank', 'width=800,height=650');
        if (!printWindow) {
            window.print();
            return;
        }
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Booking Invoice - ${document.getElementById('vbiId')?.textContent || ''}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
                    * { box-sizing: border-box; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                    th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; }
                </style>
            </head>
            <body>
                ${printArea.innerHTML}
                <script>
                    window.onload = function() { window.print(); window.close(); };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    });
}
