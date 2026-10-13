// scripts/rebook-refund/cancelled-booking-modal.js
// Implements window.openCancelledBookingModal — opens the cancelled/no-show detail modal.

import { supabase } from '../../lib/supabase.js';
import { ensureModalsInjected } from './rebook-refund-modals-inject.js';
import { formatTime12, formatDate } from './rebook-refund-utils.js';

export async function openCancelledBookingModal(bookingIdOrObj) {
    ensureModalsInjected();

    let b = null;
    let bookingId = '';

    if (typeof bookingIdOrObj === 'object' && bookingIdOrObj !== null) {
        b = bookingIdOrObj;
        bookingId = b.booking_id || b.raw_id || b.id || '';
    } else {
        bookingId = String(bookingIdOrObj || '');
        // Check window.liveBookingsData or todaysBookingsData
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === bookingId.toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === bookingId.toLowerCase());
        }
        // If not found in memory, fetch from Supabase
        if (!b) {
            try {
                const { data } = await supabase
                    .from('bookings_for_business_transaction')
                    .select('*')
                    .eq('booking_id', bookingId)
                    .maybeSingle();
                if (data) b = data;
            } catch (err) {
                console.error('[RebookRefundModal] Failed to fetch booking:', err);
            }
        }
    }

    if (!b) {
        console.warn('[RebookRefundModal] Booking not found for ID:', bookingId);
        return;
    }

    const el = (id) => document.getElementById(id);

    // Dynamic Title & Status Badge based on status (No-show vs Cancelled)
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
    if (el('cbmId')) {
        el('cbmId').textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();
    }

    // Customer
    const custName = b.customer_name || b.customer || 'Walk-in Customer';
    const custPhone = b.customer_phone || b.phone || '—';
    if (el('cbmCustomer')) el('cbmCustomer').textContent = custName;
    if (el('cbmPhone'))    el('cbmPhone').textContent    = custPhone;

    // Date & Time
    const dateVal = b.booking_date || '';
    const timeVal = b.start_time || b.time || '';
    if (el('cbmDate')) el('cbmDate').textContent = formatDate(dateVal);
    if (el('cbmTime')) el('cbmTime').textContent = formatTime12(timeVal.slice(0, 5));

    let payRaw = (b.payment_status || b.payment || '').toLowerCase();
    if (el('cbmPaymentBadge')) {
        const payLabel = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : 'Pending';
        const payColors = {
            paid:     { color: '#059669', bg: '#d1fae5' },
            pending:  { color: '#b45309', bg: '#fef3c7' },
            unpaid:   { color: '#dc2626', bg: '#fee2e2' },
            partial:  { color: '#7c3aed', bg: '#ede9fe' },
            refunded: { color: '#b45309', bg: '#fef3c7' },
        };
        const pc = payColors[payRaw] || { color: '#475569', bg: '#f1f5f9' };
        el('cbmPaymentBadge').innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Services list
    const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name || b.service])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name || b.staff])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.final_amount ?? b.total_price ?? b.price ?? 0];

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
                    <td style="padding:9px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:9px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:9px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `<tr><td style="padding:9px 12px;font-weight:500;color:#1e293b;">${b.service_name || b.service || 'Salon Service'}</td>
                <td style="padding:9px 12px;color:#64748b;">${b.staff_name || b.staff || '—'}</td>
                <td style="padding:9px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.final_amount ?? b.total_price ?? b.price ?? 0).toLocaleString('en-IN')}</td></tr>`;
        }
        html += `</tbody></table>`;
        el('cbmServicesList').innerHTML = html;
    }

    // Total Amount
    if (el('cbmTotal')) {
        const rawTot = b.final_amount ?? b.total_price ?? b.price ?? (typeof b.amount === 'string' ? b.amount.replace(/[^0-9]/g, '') : b.amount) ?? 0;
        el('cbmTotal').textContent = '₹' + Number(rawTot).toLocaleString('en-IN');
    }

    // Check payment status from both booking object and transactions
    const isAlreadyRefunded = payRaw === 'refunded';
    let isPaid = ['paid', 'partial'].includes(payRaw) || isAlreadyRefunded;
    if (el('cbmRefundSection')) el('cbmRefundSection').style.display = isPaid ? 'block' : 'none';

    // Check transactions table asynchronously to guarantee accuracy
    let refundedAmount = 0;
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
        // Sum up any refunded transactions to show the amount
        if (isAlreadyRefunded && txs) {
            refundedAmount = txs
                .filter(t => (t.status || '').toLowerCase().trim() === 'refunded')
                .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
        }
    } catch(e) { /* ignore */ }

    // Update the Refund section: if already refunded, show disabled state with amount
    const refundSection = el('cbmRefundSection');
    if (refundSection) {
        if (isAlreadyRefunded) {
            const displayAmount = refundedAmount > 0
                ? `₹${refundedAmount.toLocaleString('en-IN')}`
                : (b.final_amount ?? b.total_price ?? b.price ? `₹${Number(b.final_amount ?? b.total_price ?? b.price).toLocaleString('en-IN')}` : '');
            refundSection.innerHTML = `
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;color:#b45309;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div>
                        <div style="font-weight:700;color:#b45309;font-size:0.88rem;">Refunded ${displayAmount}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;margin-top:2px;">Payment has been returned to customer</div>
                    </div>
                    <button disabled
                        style="width:100%;padding:9px 14px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:not-allowed;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>
                        Refunded
                    </button>
                </div>`;
        }
    }

    // Wire Rebook button
    const btnRebook = el('btnCbmRebook');
    if (btnRebook) {
        const newBtn = btnRebook.cloneNode(true);
        btnRebook.parentNode.replaceChild(newBtn, btnRebook);
        newBtn.addEventListener('click', async () => {
            el('cancelledBookingModal')?.classList.remove('active');
            await window.triggerRebook(bookingId, b);
        });
    }

    // Wire Refund button
    const btnRefund = el('btnCbmRefund');
    if (btnRefund) {
        const newBtn = btnRefund.cloneNode(true);
        btnRefund.parentNode.replaceChild(newBtn, btnRefund);
        newBtn.addEventListener('click', () => {
            el('cancelledBookingModal')?.classList.remove('active');
            window.openRefundModal(bookingId, b);
        });
    }

    // Show modal
    el('cancelledBookingModal')?.classList.add('active');
}
