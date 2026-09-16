// scripts/payment-booking.js

import { supabase } from '../lib/supabase.js';
import {
    getCompanyAndBranchIds,
    createPaymentState,
    calculateFinalDue,
    fetchCustomerMembership,
    fetchActiveOffers,
    validateCouponCode,
    buildResultPayload,
    formatCurrency
} from './payment-core.js';

let bookingData = null;
let paymentConfig = null;
let paymentState = createPaymentState();
let availableOffers = [];
let serviceIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    await loadBookingDetails();
});

function getCompanyId() {
    return getCompanyAndBranchIds().companyId;
}

function getBranchId() {
    return getCompanyAndBranchIds().branchId;
}

async function loadBookingDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId') || sessionStorage.getItem('pay_booking_id');

    if (!bookingId) {
        alert('No booking ID specified. Redirecting to bookings...');
        window.location.href = 'bookings.html';
        return;
    }

    try {
        document.getElementById('badgeBookingId').textContent = `BOOKING #${String(bookingId).slice(0, 8).toUpperCase()}`;

        // Fetch booking from DB
        let { data: booking, error } = await supabase
            .from('bookings')
            .select('*')
            .or(`booking_id.eq.${bookingId},id.eq.${bookingId}`)
            .single();

        if (error || !booking) {
            // Check bookings_for_business_transaction
            const { data: bft } = await supabase
                .from('bookings_for_business_transaction')
                .select('*')
                .eq('booking_id', bookingId)
                .single();

            if (bft) {
                booking = bft;
            } else {
                throw new Error('Booking not found in database.');
            }
        }

        bookingData = booking;

        // Populate Customer
        const customerName = booking.customer_name || booking.customer || 'Walk-in Customer';
        const customerPhone = booking.customer_phone || booking.phone || 'N/A';
        const customerId = booking.customer_id || null;

        document.getElementById('custNameDisplay').textContent = customerName;
        document.getElementById('custPhoneDisplay').textContent = customerPhone;
        document.getElementById('custAvatar').textContent = (customerName[0] || 'C').toUpperCase();

        // Status & Meta
        const status = booking.status || 'Confirmed';
        const statusBadge = document.getElementById('bookingStatusBadge');
        statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        document.getElementById('pillDate').textContent = booking.appointment_date || booking.booking_date || booking.date || 'Today';
        document.getElementById('pillTime').textContent = booking.appointment_time || booking.booking_time || booking.time || '--:--';
        document.getElementById('pillStaff').textContent = booking.staff_name || booking.assigned_staff || 'Staff';

        // Parse total price & services
        let totalVal = booking.final_amount ?? booking.total_price ?? booking.price ?? 0;
        if (typeof totalVal === 'string') {
            totalVal = parseInt(totalVal.replace(/[^0-9]/g, ''), 10) || 0;
        }
        totalVal = Number(totalVal) || 0;

        // Parse services list
        renderServicesList(booking, totalVal);

        // Payment Config
        paymentConfig = {
            saleId: booking.booking_id || booking.id,
            customerId: customerId,
            customerName: customerName,
            totalAmount: totalVal,
            amountPaid: 0,
            serviceIds: serviceIds
        };

        // Load Offers
        await loadOffers();

        // Calculate and render
        updateCalculations();

        // Auto-check if membership is already active
        if (customerId) {
            const membership = await fetchCustomerMembership(customerId, supabase);
            if (membership) {
                const memToggle = document.getElementById('membershipToggle');
                memToggle.checked = true;
                paymentState.appliedMembership = membership;
                const resultBadge = document.getElementById('membershipResultBadge');
                resultBadge.className = 'mem-result-badge found';
                resultBadge.textContent = `✓ Active Perk: ${membership.name} (${membership.type === 'percentage' ? membership.value + '%' : '₹' + membership.value} OFF)`;
                document.getElementById('memSubtitle').textContent = `${membership.name} applied`;
                updateCalculations();
            }
        }

    } catch (err) {
        console.error('Error loading booking:', err);
        alert(err.message || 'Failed to load booking details.');
    }
}

function renderServicesList(booking, totalVal) {
    const listEl = document.getElementById('servicesList');
    listEl.innerHTML = '';
    serviceIds = [];

    let items = [];
    if (Array.isArray(booking.services) && booking.services.length > 0) {
        items = booking.services;
    } else if (typeof booking.services === 'string' && booking.services.trim()) {
        try {
            const parsed = JSON.parse(booking.services);
            if (Array.isArray(parsed)) items = parsed;
        } catch {
            items = booking.services.split(',').map(s => ({ name: s.trim(), price: totalVal }));
        }
    } else if (booking.service_name || booking.service) {
        items = [{
            name: booking.service_name || booking.service,
            price: totalVal,
            duration: booking.duration || '45 mins'
        }];
    }

    if (items.length === 0) {
        items = [{ name: 'Salon Service', price: totalVal, duration: 'Standard' }];
    }

    items.forEach(svc => {
        const sName = svc.name || svc.service_name || 'Service';
        const sPrice = Number(svc.price || svc.rate || totalVal / items.length) || 0;
        const sDuration = svc.duration || svc.duration_minutes ? `${svc.duration_minutes || svc.duration} mins` : '';
        if (svc.id || svc.service_id) {
            serviceIds.push(svc.id || svc.service_id);
        }

        const itemDiv = document.createElement('div');
        itemDiv.className = 'service-item';
        itemDiv.innerHTML = `
            <div>
                <div class="service-name">${sName}</div>
                ${sDuration ? `<div class="service-meta">${sDuration}</div>` : ''}
            </div>
            <div class="service-price">${formatCurrency(sPrice)}</div>
        `;
        listEl.appendChild(itemDiv);
    });
}

function initEvents() {
    // Payment Method Selection
    document.querySelectorAll('.method-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.method-card').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            paymentState.method = target.dataset.method;
        });
    });

    // Membership Perk Toggle
    const memToggle = document.getElementById('membershipToggle');
    memToggle.addEventListener('change', async (e) => {
        const resultBadge = document.getElementById('membershipResultBadge');
        const subtitle = document.getElementById('memSubtitle');

        if (e.target.checked) {
            if (!paymentConfig?.customerId) {
                resultBadge.className = 'mem-result-badge not-found';
                resultBadge.textContent = 'Walk-in customer has no saved profile.';
                subtitle.textContent = 'No profile';
                paymentState.appliedMembership = null;
                updateCalculations();
                return;
            }

            resultBadge.className = 'mem-result-badge';
            resultBadge.textContent = 'Checking active memberships...';
            resultBadge.style.display = 'block';

            const mem = await fetchCustomerMembership(paymentConfig.customerId, supabase);
            if (mem) {
                paymentState.appliedMembership = mem;
                resultBadge.className = 'mem-result-badge found';
                resultBadge.textContent = `✓ ${mem.name} — ${mem.type === 'percentage' ? mem.value + '% OFF' : '₹' + mem.value + ' OFF'}`;
                subtitle.textContent = `${mem.name} active`;
            } else {
                paymentState.appliedMembership = null;
                resultBadge.className = 'mem-result-badge not-found';
                resultBadge.textContent = 'No active membership found for this customer.';
                subtitle.textContent = 'No active membership';
            }
        } else {
            paymentState.appliedMembership = null;
            resultBadge.className = 'mem-result-badge';
            resultBadge.textContent = '';
            subtitle.textContent = 'Check customer\'s active membership';
        }
        updateCalculations();
    });

    // Toggle Offers List Box
    document.getElementById('btnToggleOffers').addEventListener('click', () => {
        const box = document.getElementById('offersListBox');
        box.classList.toggle('active');
    });

    // Coupon Code Apply/Remove
    document.getElementById('btnApplyCoupon').addEventListener('click', handleCouponApply);

    // Manual Discount Type & Value
    document.getElementById('btnTypeFlat').addEventListener('click', () => {
        document.getElementById('btnTypeFlat').classList.add('active');
        document.getElementById('btnTypePct').classList.remove('active');
        paymentState.discountType = 'flat';
        updateCalculations();
    });

    document.getElementById('btnTypePct').addEventListener('click', () => {
        document.getElementById('btnTypePct').classList.add('active');
        document.getElementById('btnTypeFlat').classList.remove('active');
        paymentState.discountType = 'percent';
        updateCalculations();
    });

    document.getElementById('manualDiscountInput').addEventListener('input', (e) => {
        paymentState.discountValue = parseFloat(e.target.value) || 0;
        updateCalculations();
    });

    // Finalize Payment Click
    document.getElementById('btnFinalizePayment').addEventListener('click', finalizeBookingPayment);

    // Print Receipt
    document.getElementById('btnPrintReceipt')?.addEventListener('click', () => {
        window.print();
    });
}

async function loadOffers() {
    const cId = getCompanyId();
    const bId = getBranchId();
    availableOffers = await fetchActiveOffers(cId, bId, supabase);
    renderOffers();
}

function renderOffers() {
    const box = document.getElementById('offersListBox');
    if (!availableOffers || availableOffers.length === 0) {
        box.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:0.8rem;padding:8px;">No active branch offers available</div>`;
        return;
    }

    box.innerHTML = availableOffers.map(o => {
        const isApplied = paymentState.appliedOffer && paymentState.appliedOffer.id === o.offer_id;
        const badgeStr = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
        return `
            <div class="offer-item-row ${isApplied ? 'applied' : ''}">
                <div>
                    <div style="font-weight:600;font-size:0.85rem;color:#1e293b;">${o.offer_name}</div>
                    <span class="offer-badge">${badgeStr}</span>
                </div>
                <button class="btn-input-action" style="height:32px;padding:0 12px;font-size:0.75rem;background:${isApplied ? '#ef4444' : '#4f46e5'};" data-offer-id="${o.offer_id}">
                    ${isApplied ? 'Remove' : 'Apply'}
                </button>
            </div>
        `;
    }).join('');

    box.querySelectorAll('button[data-offer-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const offerId = e.currentTarget.dataset.offerId;
            if (paymentState.appliedOffer && paymentState.appliedOffer.id === offerId) {
                paymentState.appliedOffer = null;
            } else {
                const found = availableOffers.find(x => x.offer_id === offerId);
                if (found) {
                    paymentState.appliedOffer = {
                        id: found.offer_id,
                        name: found.offer_name,
                        type: found.discount_type,
                        value: found.discount_value
                    };
                }
            }
            renderOffers();
            updateCalculations();
        });
    });
}

async function handleCouponApply() {
    const input = document.getElementById('couponCodeInput');
    const msg = document.getElementById('couponFeedbackMsg');
    const btn = document.getElementById('btnApplyCoupon');
    const code = input.value.trim();

    if (paymentState.appliedCoupon) {
        // Remove coupon
        paymentState.appliedCoupon = null;
        input.value = '';
        input.disabled = false;
        btn.textContent = 'Apply';
        btn.style.background = '#1e293b';
        msg.style.display = 'none';
        updateCalculations();
        return;
    }

    if (!code) {
        msg.textContent = 'Please enter a coupon code.';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '...';
        const coupon = await validateCouponCode(code, getCompanyId(), getBranchId(), serviceIds, supabase);
        paymentState.appliedCoupon = coupon;

        const valStr = coupon.type === 'percentage' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`;
        msg.textContent = `✓ Coupon "${coupon.code}" applied (${valStr})!`;
        msg.style.color = '#10b981';
        msg.style.display = 'block';

        input.disabled = true;
        btn.disabled = false;
        btn.textContent = 'Remove';
        btn.style.background = '#ef4444';

        updateCalculations();
    } catch (err) {
        msg.textContent = err.message || 'Invalid coupon code.';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Apply';
    }
}

function updateCalculations() {
    if (!paymentConfig) return;

    const res = calculateFinalDue(paymentConfig, paymentState);
    const summaryContainer = document.getElementById('summaryBreakdown');

    let html = '';
    res.breakdown.forEach(item => {
        if (item.type === 'total') {
            html += `
                <div class="summary-row total">
                    <span>${item.label}</span>
                    <span class="due-val">${item.formatted}</span>
                </div>
            `;
        } else {
            const isDiscount = item.type === 'discount';
            html += `
                <div class="summary-row ${isDiscount ? 'discount' : ''}">
                    <span>${item.label}</span>
                    <span>${item.formatted}</span>
                </div>
            `;
        }
    });

    summaryContainer.innerHTML = html;
    document.getElementById('btnFinalizeText').textContent = `Record Payment (${formatCurrency(res.finalDue)})`;
}

async function finalizeBookingPayment() {
    if (!bookingData || !paymentConfig) return;

    const btn = document.getElementById('btnFinalizePayment');
    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader"></i> Processing Payment...`;
    if (window.feather) feather.replace();

    try {
        const payload = buildResultPayload(paymentConfig, paymentState);
        const amount = payload.amountCollected;
        const payMethod = payload.paymentMethod;
        const refNote = document.getElementById('paymentRefInput').value.trim();

        const companyId = getCompanyId();
        const branchId  = getBranchId();
        const paidAt    = new Date().toISOString().replace('Z', '');
        const bookingId = bookingData.booking_id || bookingData.id;

        const originalTotal = Number(paymentConfig.totalAmount || 0);
        const totalDiscount = Math.max(0, originalTotal - amount);
        const d = payload.discounts || {};

        let discountType = null;
        let discountName = null;
        if (d.couponCode) { discountType = 'coupon'; discountName = d.couponCode; }
        else if (d.offerName) { discountType = 'offer'; discountName = d.offerName; }
        else if (d.membershipName) { discountType = 'membership'; discountName = d.membershipName; }
        else if (d.manualValue > 0) { discountType = 'manual'; discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`; }

        const notes = refNote ? `Booking payment. Ref: ${refNote}` : `Payment for booking ${String(bookingId).substring(0, 8)}`;

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
                notes:          notes,
                paid_at:        paidAt,
                final_amount:   amount,
                discount_type:  discountType,
                discount_name:  discountName,
                discount_amount: totalDiscount > 0 ? totalDiscount : null
            });

        if (txError) console.error('[PaymentBooking] business_transactions error:', txError);

        // 2. Update bookings_for_business_transaction
        await supabase
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

        // Show Success Overlay
        document.getElementById('successSummaryText').textContent = `${formatCurrency(amount)} collected via ${payMethod.toUpperCase()} from ${paymentConfig.customerName}.`;
        document.getElementById('successOverlay').classList.add('active');

    } catch (err) {
        console.error('Payment processing failed:', err);
        alert(err.message || 'An error occurred while finalizing payment.');
        btn.disabled = false;
        updateCalculations();
    }
}
