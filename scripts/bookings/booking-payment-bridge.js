// scripts/bookings/booking-payment-bridge.js
import { supabase } from '../../lib/supabase.js';
import { getLiveBookings } from './bookings-state.js';
import { fetchBookings } from './bookings-data.js';

// ─── Collect Payment Handler ────────────────────────────────────────────────
export async function openBookingPayment(bookingIdOrRow, options = {}) {
    let row = null;
    let targetId = null;

    if (bookingIdOrRow && typeof bookingIdOrRow === 'object') {
        row = bookingIdOrRow;
        targetId = row.booking_id || row.id;
    } else {
        const liveData = (typeof getLiveBookings === 'function' ? getLiveBookings() : []) || [];
        row = liveData.find(x => (x.booking_id || x.id) === bookingIdOrRow);
        if (!row) {
            row = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingIdOrRow || '').toLowerCase());
        }
        targetId = row ? (row.booking_id || row.id) : bookingIdOrRow;
    }

    if (!targetId) {
        console.error('[BookingPayment] Booking not found for ID:', bookingIdOrRow);
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
        const apptDate = (row && (row.appointment_date || row.booking_date || row.date)) || 'Today';
        const apptTime = (row && (row.appointment_time || row.start_time || row.time)) || '';
        items = svcNames.map(s => ({
            name: s.trim(),
            subtitle: `${apptDate}${apptTime ? ' at ' + apptTime : ''}`,
            quantity: 1,
            price: Math.round(totalOriginal / Math.max(1, svcNames.length))
        }));
    } else {
        const apptDate = (row && (row.appointment_date || row.booking_date || row.date)) || 'Today';
        const staffName = (row && (row.staff_name || row.staff)) || 'Assigned';
        items = [{
            name: 'Salon Service Appointment',
            subtitle: `${apptDate} · Staff: ${staffName}`,
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
            customerId: (row && (row.customer_id || row.customerId)) || null,
            customerName: customerName,
            customerPhone: customerPhone,
            totalAmount: totalOriginal,
            amountDue: totalOriginal,
            items: items,
            onComplete: async (payload) => {
                await processBookingPaymentCallback(payload, row || { booking_id: targetId, final_amount: totalOriginal }, options);
            }
        });
    } else {
        alert('Payment modal not loaded. Please refresh the page.');
    }
}

if (typeof window !== 'undefined') {
    window.openBookingPayment = openBookingPayment;
}

export async function processBookingPaymentCallback(payload, row, options = {}) {
    const amount = payload.amountCollected;
    const payMethod = payload.paymentMethod;

    try {
        const bookingId = row.booking_id || row.id;

        const rawVal = row.final_amount ?? row.total_price ?? row.price ?? 0;
        const totalOriginal = typeof rawVal === 'string' ? (parseInt(rawVal.replace(/[^0-9]/g, ''), 10) || 0) : Number(rawVal);
        const totalDiscount = totalOriginal - amount;
        const d = payload.discounts || {};
        let discountType = null;
        let discountName = null;
        let discountId = null;
        if (d.couponCode) { 
            discountType = 'coupon'; 
            discountName = d.couponCode; 
            discountId = d.couponId || null;
        } else if (d.offerName) { 
            discountType = 'offer'; 
            discountName = d.offerName; 
            discountId = d.offerId || null;
        } else if (d.membershipName) { 
            discountType = 'membership'; 
            discountName = d.membershipName; 
            discountId = d.membershipId || null;
        } else if (d.manualValue > 0) { 
            discountType = 'manual'; 
            discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`; 
        }

        // Single atomic RPC call — updates business_transactions, bookings_for_business_transaction, and bookings
        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_booking_payment_atomic', {
            p_booking_id:      bookingId,
            p_payment_method:  (payMethod || 'cash').toLowerCase(),
            p_discount_type:   discountType,
            p_discount_name:   discountName,
            p_discount_id:     discountId,
            p_discount_amount: totalDiscount > 0 ? totalDiscount : 0,
            p_final_amount:    amount,
            p_notes:           `Payment for booking ${String(bookingId).substring(0, 8)}`
        });

        if (rpcError) {
            console.error('[BookingPayment] RPC error:', rpcError);
            throw new Error(rpcError.message);
        }
        console.log('[BookingPayment] RPC result:', rpcResult);

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

                if (typeof options.onSuccess === 'function') {
                    await options.onSuccess({ bookingId, status: 'completed' });
                } else if (typeof fetchBookings === 'function') {
                    await fetchBookings();
                }

                // Dispatch cross-tab / cross-component event
                document.dispatchEvent(new CustomEvent('payment-recorded', {
                    detail: { bookingId, amount, status: 'completed' }
                }));
                try {
                    localStorage.setItem('app_payment_sync', JSON.stringify({ bookingId, time: Date.now() }));
                } catch (e) {}
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

                if (typeof options.onSuccess === 'function') {
                    await options.onSuccess({ bookingId, status: 'paid' });
                } else if (typeof fetchBookings === 'function') {
                    await fetchBookings();
                }

                // Dispatch cross-tab / cross-component event
                document.dispatchEvent(new CustomEvent('payment-recorded', {
                    detail: { bookingId, amount, status: 'paid' }
                }));
                try {
                    localStorage.setItem('app_payment_sync', JSON.stringify({ bookingId, time: Date.now() }));
                } catch (e) {}
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
