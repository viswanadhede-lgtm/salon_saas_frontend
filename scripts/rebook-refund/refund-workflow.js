// scripts/rebook-refund/refund-workflow.js
// Implements window.processRefund — the financial write sequence.
// HIGH RISK: Contains 3 sequential Supabase writes. Do not reorder or modify.
//
// Write sequence (MUST remain in this exact order):
//   1. INSERT business_transactions  (refund ledger entry)
//   2. UPDATE bookings_for_business_transaction  (payment_status + status)
//   3. UPDATE bookings  (status + payment)

import { supabase } from '../../lib/supabase.js';
import { getActiveRefundBookingId, getActiveRefundableAmount } from './rebook-refund-state.js';
import { getCompanyId, getBranchId } from './rebook-refund-utils.js';

export async function processRefund() {
    const activeRefundBookingId = getActiveRefundBookingId();
    const activeRefundableAmount = getActiveRefundableAmount();

    if (!activeRefundBookingId || activeRefundableAmount <= 0) return;

    const reasonSelect = document.getElementById('refundReasonSelect');
    const reason = reasonSelect ? reasonSelect.value.trim() : '';
    if (!reason) {
        if (window.toast) {
            window.toast('Please select a refund reason', '#ef4444');
        } else {
            alert('Please select a refund reason before issuing the refund.');
        }
        reasonSelect?.focus();
        return;
    }

    const btn = document.getElementById('btnConfirmRefund');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Processing Refund...';

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();
        const note   = document.getElementById('refundNote')?.value.trim() || '';
        const method = (document.getElementById('refundMethodSelect')?.value || 'cash').toLowerCase();

        const fullNotes = reason ? `[${reason}] ${note || 'Refund processed'}` : (note || 'Refund processed for booking');

        // 1. Insert refund record into business_transactions
        const { error: txErr } = await supabase
            .from('business_transactions')
            .insert({
                company_id:      companyId,
                branch_id:       branchId,
                reference_id:    activeRefundBookingId,
                reference_type:  'booking',
                amount:          Math.abs(activeRefundableAmount),
                final_amount:    Math.abs(activeRefundableAmount),
                currency:        'INR',
                payment_method:  method,
                status:          'refunded',
                notes:           fullNotes,
                paid_at:         new Date().toISOString()
            });

        if (txErr) console.warn('[Refund] business_transactions insert note:', txErr);

        // 2. Update summary table bookings_for_business_transaction
        const { error: bftErr } = await supabase
            .from('bookings_for_business_transaction')
            .update({
                payment_status: 'refunded',
                status:         'cancelled',
                updated_at:     new Date().toISOString()
            })
            .eq('booking_id', activeRefundBookingId);

        if (bftErr) console.warn('[Refund] bft update note:', bftErr);

        // 3. Update main bookings table
        const { error: bkErr } = await supabase
            .from('bookings')
            .update({
                status:     'cancelled',
                payment:    'refunded',
                updated_at: new Date().toISOString()
            })
            .eq('booking_id', activeRefundBookingId);

        if (bkErr) console.warn('[Refund] bookings table update note:', bkErr);

        document.getElementById('refundBookingModal')?.classList.remove('active');

        if (window.toast) {
            window.toast('✓ Refund processed successfully', '#10b981');
        } else {
            alert('Refund processed successfully!');
        }

        // Dispatch payment / refund event for reactive updates
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId: activeRefundBookingId, amount: -activeRefundableAmount }
        }));

        // Refresh whichever table is currently visible
        if (typeof window.fetchBookings === 'function') window.fetchBookings();
        if (typeof window.initPage === 'function') window.initPage();
        if (typeof window.fetchAndRenderAppointments === 'function') {
            const currentBranch = localStorage.getItem('branch_id');
            if (currentBranch) window.fetchAndRenderAppointments(currentBranch);
        }

    } catch (err) {
        console.error('[Refund] Failed to process refund:', err);
        alert('Failed to process refund: ' + (err.message || 'Unknown error'));
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Issue Refund</span>
        `;
    }
}
