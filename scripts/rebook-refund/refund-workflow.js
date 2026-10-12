// scripts/rebook-refund/refund-workflow.js
// Implements window.processRefund — calls the atomic refund RPC.
// The RPC handles all 3 table updates + customer stats reversal in a single transaction.

import { supabase } from '../../lib/supabase.js';
import { getActiveRefundBookingId, getActiveRefundableAmount } from './rebook-refund-state.js';

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
        const note   = document.getElementById('refundNote')?.value.trim() || '';
        const method = (document.getElementById('refundMethodSelect')?.value || 'cash').toLowerCase();

        // Single atomic RPC call — handles all 3 table updates + customer stats reversal
        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_booking_refund_atomic', {
            p_booking_id:    activeRefundBookingId,
            p_refund_reason: reason,
            p_refund_notes:  reason ? `[${reason}] ${note || 'Refund processed'}` : (note || 'Refund processed for booking'),
            p_refund_method: method
        });

        if (rpcError) {
            console.error('[Refund] RPC error:', rpcError);
            throw new Error(rpcError.message);
        }
        console.log('[Refund] RPC result:', rpcResult);

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
