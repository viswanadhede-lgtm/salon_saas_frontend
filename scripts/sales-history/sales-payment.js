// scripts/sales-history/sales-payment.js

import { getCompanyId, getBranchId } from './sales-state.js';
import { insertProductPayment } from './sales-api.js';
import { showToast } from './sales-utils.js';

/**
 * Payment collection integration with window.openGlobalPaymentModal.
 */

export async function openCollectPaymentModal(sale, onPaymentSuccess) {
    if (!sale) return;

    const total = sale.totalAmountNum || 0;
    const paid = sale.amount_paid || 0;
    const balance = Math.max(0, total - paid);

    if (window.openGlobalPaymentModal) {
        window.openGlobalPaymentModal({
            saleId: sale.id,
            customerId: sale.customer_id,
            customerName: sale.customer || 'Walk-in',
            totalAmount: balance, // In sales history we collect the remaining balance
            amountDue: balance,
            isMembershipPurchase: false, // Sales history typically shows products/services
            onComplete: async (payload) => {
                await processProductPayment(payload, sale, onPaymentSuccess);
            }
        });
    } else {
        showToast('Global payment modal not loaded', '#ef4444');
    }
}

export async function processProductPayment(payload, sale, onPaymentSuccess) {
    const amount = payload.amountCollected;
    const method = payload.paymentMethod;
    
    try {
        const { error } = await insertProductPayment({
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            reference_id: sale.id,
            reference_type: 'product',
            amount: amount,
            status: 'paid',
            payment_method: method.toLowerCase(),
            notes: `Partial payment for sale ${sale.id}`,
            paid_at: new Date().toISOString()
        });

        if (error) throw error;

        showToast('Payment recorded successfully!', '#10b981');
        if (typeof onPaymentSuccess === 'function') {
            await onPaymentSuccess();
        }
    } catch (err) {
        console.error('Error recording payment:', err);
        showToast('Failed to record payment.', '#ef4444');
        throw err; // Re-throw so modal handles it
    }
}
