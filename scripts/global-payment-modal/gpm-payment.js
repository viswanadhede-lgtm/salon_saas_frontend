// scripts/global-payment-modal/gpm-payment.js
import { gpmState } from './gpm-state.js';
import { closeGlobalPaymentModal } from './gpm-ui.js';

export async function finalizePayment() {
    const { globalPaymentConfig, paymentState } = gpmState;
    if (!globalPaymentConfig || typeof globalPaymentConfig.onComplete !== 'function') return;

    const btn = document.getElementById('gpmBtnProceed');
    const origHtml = btn ? btn.innerHTML : 'Collect Payment';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="spin" style="width:18px;height:18px;"></i> Recording Payment...';
        if (window.feather) feather.replace();
    }

    const note = document.getElementById('gpmPaymentNote')?.value?.trim() || null;
    const cashRec = parseFloat(document.getElementById('gpmCashReceived')?.value) || paymentState.finalDue;

    const resultPayload = {
        paymentMethod: paymentState.method,
        amountCollected: Math.round(paymentState.finalDue),
        cashReceived: paymentState.method === 'cash' ? cashRec : null,
        changeReturned: paymentState.method === 'cash' ? (paymentState.changeReturned || 0) : 0,
        note: note,
        discounts: {
            manualType: null,
            manualValue: 0,
            couponId: paymentState.appliedCoupon ? paymentState.appliedCoupon.id : null,
            couponCode: paymentState.appliedCoupon ? paymentState.appliedCoupon.code : null,
            offerId: paymentState.appliedOffer ? paymentState.appliedOffer.id : null,
            offerName: paymentState.appliedOffer ? paymentState.appliedOffer.name : null,
            offerDiscount: paymentState.offerDiscount || 0,
            membershipName: paymentState.appliedMembership ? paymentState.appliedMembership.name : null,
            membershipDiscountPct: paymentState.appliedMembership ? paymentState.appliedMembership.value : 0
        }
    };

    try {
        await globalPaymentConfig.onComplete(resultPayload);

        // Increment current_usage_count for the redeemed offer
        if (paymentState.appliedOffer?.id) {
            try {
                const { supabase } = await import('../../lib/supabase.js');
                const { data: offerRows } = await supabase
                    .from('offers')
                    .select('id, current_usage_count')
                    .eq('offer_id', paymentState.appliedOffer.id);
                if (offerRows && offerRows.length > 0) {
                    for (const r of offerRows) {
                        await supabase
                            .from('offers')
                            .update({ current_usage_count: (Number(r.current_usage_count) || 0) + 1 })
                            .eq('id', r.id);
                    }
                }
            } catch (uErr) {
                console.warn('[PaymentModal] Error updating offer usage count:', uErr);
            }
        }

        closeGlobalPaymentModal();
    } catch (err) {
        console.error('Payment processing failed in onComplete:', err);
        alert('Payment failed: ' + (err.message || 'Unknown error'));
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.feather) feather.replace();
        }
    }
}
