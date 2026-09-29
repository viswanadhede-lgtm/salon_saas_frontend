// scripts/rebook-refund/refund-modal.js
// Implements window.openRefundModal — populates and activates the refund modal.
// Sets shared session state (activeRefundBookingId, activeRefundableAmount) used by refund-workflow.js.

import { supabase } from '../../lib/supabase.js';
import { ensureModalsInjected } from './rebook-refund-modals-inject.js';
import { setActiveRefundBookingId, setActiveRefundableAmount } from './rebook-refund-state.js';

export async function openRefundModal(bookingId, optBookingObj) {
    ensureModalsInjected();

    setActiveRefundBookingId(bookingId);
    let b = optBookingObj;
    if (!b) {
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
    }

    const modal = document.getElementById('refundBookingModal');
    modal?.classList.add('active');

    // UI Reset / Skeletons
    const shortId = String(bookingId || '').slice(0, 8).toUpperCase();
    const badgeEl = document.getElementById('rfBookingBadge');
    if (badgeEl) badgeEl.textContent = `Booking #${shortId}`;

    const custNameEl  = document.getElementById('rfCustomerName');
    const custPhoneEl = document.getElementById('rfCustomerPhone');
    const custEmailEl = document.getElementById('rfCustomerEmail');
    const custAvatarEl = document.getElementById('rfCustomerAvatar');
    const viewProfBtn = document.getElementById('rfCustomerViewProfileBtn');

    if (custNameEl)  custNameEl.textContent  = 'Loading customer...';
    if (custPhoneEl) custPhoneEl.textContent = '—';
    if (custEmailEl) custEmailEl.textContent = '—';
    if (custAvatarEl) custAvatarEl.textContent = '--';

    const bDateEl = document.getElementById('rfBookingDate');
    const bTimeEl = document.getElementById('rfBookingTime');
    const bTypeEl = document.getElementById('rfBookingType');
    if (bDateEl) bDateEl.textContent = '—';
    if (bTimeEl) bTimeEl.textContent = '—';
    if (bTypeEl) bTypeEl.textContent = 'Walk-In';

    const servicesTbody   = document.getElementById('rfServicesTableBody');
    const servicesTotalEl = document.getElementById('rfServicesTotal');
    if (servicesTbody) servicesTbody.innerHTML = '<tr><td colspan="3" style="padding:14px;text-align:center;color:#94a3b8;">Loading services...</td></tr>';
    if (servicesTotalEl) servicesTotalEl.textContent = '₹0';

    const origMethodEl = document.getElementById('rfOrigMethod');
    const origDateEl   = document.getElementById('rfOrigDate');
    const origTxnEl    = document.getElementById('rfOrigTxnId');
    if (origMethodEl) origMethodEl.textContent = '—';
    if (origDateEl)   origDateEl.textContent   = '—';
    if (origTxnEl)    origTxnEl.textContent    = '—';

    const amountDisp  = document.getElementById('refundAmountDisplay');
    const maxRefundEl = document.getElementById('rfMaxRefundText');
    const methodSelect = document.getElementById('refundMethodSelect');
    const reasonSelect = document.getElementById('refundReasonSelect');
    const noteField   = document.getElementById('refundNote');
    const confirmBtn  = document.getElementById('btnConfirmRefund');

    if (amountDisp)  amountDisp.textContent  = 'Calculating...';
    if (maxRefundEl) maxRefundEl.textContent = '...';
    if (reasonSelect) reasonSelect.value = '';
    if (noteField)   noteField.value   = '';

    try {
        // Query DB for complete booking, service items, and payment transactions
        const [bftRes, bkRes, txRes] = await Promise.all([
            supabase.from('bookings_for_business_transaction').select('*').eq('booking_id', bookingId).maybeSingle(),
            supabase.from('bookings').select('*').eq('booking_id', bookingId),
            supabase.from('business_transactions').select('*').eq('reference_id', bookingId).eq('reference_type', 'booking').order('paid_at', { ascending: true })
        ]);

        const bft = bftRes?.data || {};
        const individualBookings = bkRes?.data || [];
        const transactions = txRes?.data || [];

        // 1. POPULATE CARD 1: Customer Details
        const custId = bft.customer_id || (b && b.customer_id) || '';
        let custName  = bft.customer_name  || (b && (b.customer_name || b.customer)) || 'Customer';
        let custPhone = bft.customer_phone || (b && (b.customer_phone || b.phone))   || '—';
        let custEmail = bft.customer_mail  || (b && (b.customer_mail || b.customer_email || b.email)) || '—';

        // Attempt fresh lookup from customers table if details missing
        if (custId) {
            try {
                const { data: custRecord } = await supabase.from('customers').select('*').eq('customer_id', custId).maybeSingle();
                if (custRecord) {
                    if (!custName  || custName  === 'Customer') custName  = custRecord.customer_name  || custName;
                    if (!custPhone || custPhone === '—')        custPhone = custRecord.customer_phone || custRecord.phone || '—';
                    if (!custEmail || custEmail === '—')        custEmail = custRecord.customer_email || custRecord.email || '—';
                }
            } catch (cErr) {
                console.warn('[Refund] Customer lookup warning:', cErr);
            }
        }

        if (custNameEl)  custNameEl.textContent  = custName;
        if (custPhoneEl) custPhoneEl.textContent = custPhone;
        if (custEmailEl) custEmailEl.textContent = custEmail;

        const initials = custName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
        if (custAvatarEl) custAvatarEl.textContent = initials;

        if (viewProfBtn) {
            if (custId) {
                viewProfBtn.style.display = 'inline-flex';
                viewProfBtn.onclick = async (e) => {
                    e.preventDefault();
                    if (!window.viewCustomerProfile) {
                        try {
                            await import('../global-customer-profile-modal.js');
                        } catch {}
                    }
                    if (window.viewCustomerProfile) {
                        window.viewCustomerProfile(custId, custName);
                    }
                };
            } else {
                viewProfBtn.style.display = 'none';
            }
        }

        // 2. POPULATE CARD 2: Booking Details
        const rawDate = bft.booking_date || (b && (b.booking_date || b.raw_date)) || '';
        let formattedDate = '—';
        if (rawDate) {
            const dObj = new Date(rawDate + 'T00:00:00');
            formattedDate = dObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (bDateEl) bDateEl.textContent = formattedDate;

        const rawTime = bft.start_time || (b && (b.start_time || b.time)) || '';
        let formattedTime = '—';
        if (rawTime) {
            if (rawTime.includes('AM') || rawTime.includes('PM')) {
                formattedTime = rawTime;
            } else {
                const [hh, mm] = rawTime.split(':').map(Number);
                const ampm = hh >= 12 ? 'PM' : 'AM';
                const h12 = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
                formattedTime = `${String(h12).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')} ${ampm}`;
            }
        }
        if (bTimeEl) bTimeEl.textContent = formattedTime;

        const bookingType = bft.booking_type || (b && (b.booking_type || b.type)) || (individualBookings[0] && individualBookings[0].booking_type) || 'Walk-In';
        const prettyType = bookingType.charAt(0).toUpperCase() + bookingType.slice(1).toLowerCase();
        if (bTypeEl) bTypeEl.textContent = prettyType;

        // 3. POPULATE CARD 3: Services in this Booking
        let serviceItems = [];
        if (individualBookings.length > 0) {
            serviceItems = individualBookings.map(item => ({
                service: item.service_name || 'Service',
                staff:   item.staff_name   || 'Assigned',
                price:   Number(item.price || 0)
            }));
        } else {
            const svcNames   = (bft.service_name || (b && (b.service_name || b.service)) || 'Service').split(',').map(s => s.trim()).filter(Boolean);
            const staffNames = (bft.staff_name   || (b && (b.staff_name   || b.staff))   || 'Assigned').split(',').map(s => s.trim()).filter(Boolean);
            const rawTotalPrice = Number(bft.total_price || (b && (b.total_price || b.amount)) || 0);

            if (svcNames.length <= 1) {
                serviceItems = [{
                    service: svcNames[0]  || 'Service',
                    staff:   staffNames[0] || 'Assigned',
                    price:   rawTotalPrice
                }];
            } else {
                const perItemPrice = Math.round(rawTotalPrice / svcNames.length);
                serviceItems = svcNames.map((svc, idx) => ({
                    service: svc,
                    staff:   staffNames[idx] || staffNames[0] || 'Assigned',
                    price:   idx === svcNames.length - 1 ? (rawTotalPrice - (perItemPrice * (svcNames.length - 1))) : perItemPrice
                }));
            }
        }

        const totalBookingPrice = serviceItems.reduce((acc, curr) => acc + curr.price, 0);

        if (servicesTbody) {
            servicesTbody.innerHTML = serviceItems.map(item => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:600;color:#0f172a;">${item.service}</td>
                    <td style="padding:10px 12px;color:#475569;">${item.staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${item.price.toLocaleString('en-IN')}</td>
                </tr>
            `).join('');
        }
        if (servicesTotalEl) servicesTotalEl.textContent = `₹${totalBookingPrice.toLocaleString('en-IN')}`;

        // 4. POPULATE CARD 4: Original Payment Details
        const paidTxs = transactions.filter(t => (t.status || '').toLowerCase().trim() === 'paid');
        const latestPaidTx = paidTxs[paidTxs.length - 1] || transactions[0] || null;

        let origMethod = latestPaidTx?.payment_method || (b && (b.payment_method || b.payment)) || 'Cash';
        origMethod = origMethod.charAt(0).toUpperCase() + origMethod.slice(1).toLowerCase();
        if (origMethodEl) origMethodEl.textContent = origMethod;

        let origDateDisplay = '—';
        if (latestPaidTx && latestPaidTx.paid_at) {
            const pDateObj = new Date(latestPaidTx.paid_at);
            const pDatePart = pDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const pHour = pDateObj.getHours();
            const pMin  = String(pDateObj.getMinutes()).padStart(2, '0');
            const pAmpm = pHour >= 12 ? 'PM' : 'AM';
            const pH12  = pHour > 12 ? pHour - 12 : (pHour === 0 ? 12 : pHour);
            origDateDisplay = `${pDatePart}, ${String(pH12).padStart(2, '0')}:${pMin} ${pAmpm}`;
        } else if (formattedDate !== '—') {
            origDateDisplay = `${formattedDate}, ${formattedTime}`;
        }
        if (origDateEl) origDateEl.textContent = origDateDisplay;

        const origTxnId = latestPaidTx?.id ? String(latestPaidTx.id).slice(0, 8).toUpperCase() : '—';
        if (origTxnEl) origTxnEl.textContent = origTxnId !== '—' ? `#${origTxnId}` : '—';

        // 5. COMPUTE REFUNDABLE AMOUNT & RIGHT COLUMN
        let activeRefundableAmount = transactions.reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            if (status === 'paid')     return sum + val;
            if (status === 'refunded') return sum - val;
            return sum;
        }, 0);

        // Fallback to booking price if payments not logged in business_transactions
        if (activeRefundableAmount <= 0) {
            const rawTot = bft.final_amount ?? bft.total_price ?? (b && (b.final_amount ?? b.total_price ?? b.price)) ?? totalBookingPrice;
            if (Number(rawTot) > 0 && ['paid', 'partial'].includes((bft.payment_status || (b && (b.payment_status || b.payment)) || '').toLowerCase())) {
                activeRefundableAmount = Number(rawTot);
            }
        }

        if (activeRefundableAmount < 0) activeRefundableAmount = 0;

        // Persist computed amount into shared state for processRefund
        setActiveRefundableAmount(activeRefundableAmount);

        const refundFormatted = `₹${activeRefundableAmount.toLocaleString('en-IN')}`;
        if (amountDisp)  amountDisp.textContent  = refundFormatted;
        if (maxRefundEl) maxRefundEl.textContent = refundFormatted;

        // Pre-select payment method dropdown
        if (methodSelect) {
            const lowerMethod = origMethod.toLowerCase();
            if (['cash', 'card', 'upi', 'bank_transfer'].includes(lowerMethod)) {
                methodSelect.value = lowerMethod;
            } else {
                methodSelect.value = 'cash';
            }
        }

        if (confirmBtn) {
            if (activeRefundableAmount <= 0) {
                if (amountDisp) amountDisp.style.color = '#94a3b8';
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Nothing to Refund';
            } else {
                if (amountDisp) amountDisp.style.color = '#e11d48';
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span>Issue Refund</span>
                `;
            }
        }

    } catch (err) {
        console.error('[Refund] Error populating refund modal:', err);
        if (amountDisp) {
            amountDisp.textContent = 'Error';
            amountDisp.style.color = '#ef4444';
        }
    }
}
