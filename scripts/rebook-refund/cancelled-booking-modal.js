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

    // Payment Status Badge
    let payRaw = (b.payment_status || b.payment || '').toLowerCase();
    if (el('cbmPaymentBadge')) {
        const payLabel = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : 'Pending';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
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
    let isPaid = ['paid', 'partial'].includes(payRaw);
    if (el('cbmRefundSection')) el('cbmRefundSection').style.display = isPaid ? 'block' : 'none';

    // Check transactions table asynchronously to guarantee accuracy
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
