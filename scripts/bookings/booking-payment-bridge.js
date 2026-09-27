// scripts/bookings/booking-payment-bridge.js
import { supabase } from '../../lib/supabase.js';
import { getCompanyId, getBranchId, getLiveBookings } from './bookings-state.js';
import { fetchBookings } from './bookings-data.js';

// ─── Collect Payment Handler ────────────────────────────────────────────────
export async function openBookingPayment(bookingId) {
    const liveData = getLiveBookings() || [];
    let row = liveData.find(x => (x.booking_id || x.id) === bookingId);
    if (!row) {
        row = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
    }
    const targetId = row ? (row.booking_id || row.id) : bookingId;
    if (!targetId) {
        console.error('[BookingPayment] Booking not found for ID:', bookingId);
        return;
    }

    const rawVal = row ? (row.final_amount ?? row.total_price ?? row.price ?? 0) : 0;
    const totalOriginal = typeof rawVal === 'string' ? (parseInt(rawVal.replace(/[^0-9]/g, ''), 10) || 0) : Number(rawVal);
    const customerName = (row && (row.customer_name || row.customer)) || 'Walk-in Customer';
    const customerPhone = (row && (row.customer_phone || row.phone)) || '';

    // Extract services list from booking
    let items = [];
    if (row && (row.service_name || row.services)) {
        const svcNames = (row.service_name || row.services || '').split(',');
        items = svcNames.map(s => ({
            name: s.trim(),
            subtitle: `${(row && (row.appointment_date || row.date)) || 'Today'} at ${(row && (row.appointment_time || row.time)) || ''}`,
            quantity: 1,
            price: Math.round(totalOriginal / Math.max(1, svcNames.length))
        }));
    } else {
        items = [{
            name: 'Salon Service Appointment',
            subtitle: `${(row && (row.appointment_date || row.date)) || 'Today'} · Staff: ${(row && row.staff_name) || 'Assigned'}`,
            quantity: 1,
            price: totalOriginal
        }];
    }

    if (!window.openGlobalPaymentModal) {
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'scripts/global-payment-modal.js?v=2.2.0';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    if (window.openGlobalPaymentModal) {
        window.openGlobalPaymentModal({
            type: 'booking',
            title: 'Booking Payment',
            saleId: String(targetId).slice(0, 8).toUpperCase(),
            customerId: (row && row.customer_id) || null,
            customerName: customerName,
            customerPhone: customerPhone,
            totalAmount: totalOriginal,
            amountDue: totalOriginal,
            items: items,
            onComplete: async (payload) => {
                await processBookingPaymentCallback(payload, row || { booking_id: targetId, final_amount: totalOriginal });
            }
        });
    } else {
        alert('Payment modal not loaded. Please refresh the page.');
    }
}

if (typeof window !== 'undefined') {
    window.openBookingPayment = openBookingPayment;
}

export async function processBookingPaymentCallback(payload, row) {
    const amount = payload.amountCollected;
    const payMethod = payload.paymentMethod;

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();
        const paidAt    = new Date().toISOString().replace('Z', '');
        const bookingId = row.booking_id || row.id;

        const rawVal = row.final_amount ?? row.total_price ?? row.price ?? 0;
        const totalOriginal = typeof rawVal === 'string' ? (parseInt(rawVal.replace(/[^0-9]/g, ''), 10) || 0) : Number(rawVal);
        const totalDiscount = totalOriginal - amount;
        const d = payload.discounts || {};
        let discountType = null;
        let discountName = null;
        if (d.couponCode) { discountType = 'coupon'; discountName = d.couponCode; }
        else if (d.offerName) { discountType = 'offer'; discountName = d.offerName; }
        else if (d.membershipName) { discountType = 'membership'; discountName = d.membershipName; }
        else if (d.manualValue > 0) { discountType = 'manual'; discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`; }

        // 1. Insert into business_transactions
        const { error: txError } = await supabase
            .from('business_transactions')
            .insert({
                company_id:     companyId,
                branch_id:      branchId,
                reference_id:   bookingId,
                reference_type: 'booking',
                amount:         amount,
                currency:       'INR',
                payment_method: (payMethod || 'cash').toLowerCase(),
                status:         'paid',
                notes:          `Payment for booking ${String(bookingId).substring(0, 8)}`,
                paid_at:        paidAt,
                final_amount:   amount,
                discount_type:  discountType,
                discount_name:  discountName,
                discount_amount: totalDiscount > 0 ? totalDiscount : null
            });
        if (txError) console.error('[BookingPayment] tx error:', txError);

        // 2. Update bookings_for_business_transaction
        const { error: bftError } = await supabase
            .from('bookings_for_business_transaction')
            .update({
                payment_status:  'paid',
                final_amount:    amount,
                discount_amount: totalDiscount > 0 ? totalDiscount : null,
                discount_type:   discountType,
                discount_name:   discountName,
                updated_at:      new Date().toISOString()
            })
            .eq('booking_id', bookingId);
        if (bftError) console.error('[BookingPayment] bft error:', bftError);

        // 3. Update bookings table
        const { error: bkError } = await supabase
            .from('bookings')
            .update({
                payment:    'paid',
                updated_at: new Date().toISOString()
            })
            .eq('booking_id', bookingId);
        if (bkError) {
            await supabase
                .from('bookings')
                .update({
                    payment:    'paid',
                    updated_at: new Date().toISOString()
                })
                .eq('id', bookingId);
        }

        // Open post-payment confirmation modal (booking flow only)
        const bookingRef = '#' + String(bookingId).slice(0, 8).toUpperCase();
        window.openBookingConfirmModal?.({
            amountCollected: amount,
            customerName: row.customer_name || window.globalPaymentConfig?.customerName || 'Customer',
            bookingRef: bookingRef,
            onMarkComplete: async () => {
                // Update booking status → completed in both tables
                const updatedAt = new Date().toISOString();

                const { error: statusErr } = await supabase
                    .from('bookings')
                    .update({ status: 'completed', updated_at: updatedAt })
                    .eq('booking_id', bookingId);

                if (statusErr) {
                    // Fallback: try with generic 'id' column
                    await supabase
                        .from('bookings')
                        .update({ status: 'completed', updated_at: updatedAt })
                        .eq('id', bookingId);
                }

                await supabase
                    .from('bookings_for_business_transaction')
                    .update({ status: 'completed', updated_at: updatedAt })
                    .eq('booking_id', bookingId);

                // Show completion toast
                const msg = `Booking ${bookingRef} marked as completed`;
                const toastEl = document.getElementById('toastNotification');
                if (toastEl) {
                    toastEl.textContent = msg;
                    toastEl.style.background = '#10b981';
                    toastEl.classList.add('show');
                    setTimeout(() => toastEl.classList.remove('show'), 3500);
                } else if (window.toast) {
                    window.toast(msg);
                }

                await fetchBookings();
            },
            onExit: async () => {
                // Payment is already saved — just refresh and show payment toast
                const toastEl = document.getElementById('toastNotification');
                if (toastEl) {
                    toastEl.textContent = 'Payment recorded successfully!';
                    toastEl.style.background = '#10b981';
                    toastEl.classList.add('show');
                    setTimeout(() => toastEl.classList.remove('show'), 3000);
                } else if (window.toast) {
                    window.toast('Payment recorded successfully!');
                }
                await fetchBookings();
            }
        });

    } catch (err) {
        console.error('[BookingPayment] Callback error:', err);
        const errEl = document.getElementById('toastNotification');
        if (errEl) {
            errEl.textContent = 'Failed to record payment: ' + (err.message || 'Unknown error');
            errEl.style.background = '#ef4444';
            errEl.classList.add('show');
            setTimeout(() => errEl.classList.remove('show'), 3000);
        } else {
            alert('Failed to record payment: ' + (err.message || 'Unknown error'));
        }
        throw err;
    }
}
