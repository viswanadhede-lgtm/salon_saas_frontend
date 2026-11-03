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

    // ── Fetch individual service rows from `bookings` table ──────────────────
    // Each row has: service_name, staff_name, price, start_time, package_id
    // package_id = null  → individual service
    // package_id = UUID  → belongs to a package (group by package_id)
    let svcRows = [];
    try {
        const { data, error: svcErr } = await supabase
            .from('bookings')
            .select('service_name, staff_name, price, booking_date, start_time, package_id')
            .eq('booking_id', targetId)
            .order('package_id', { ascending: true, nullsFirst: true })
            .order('created_at',  { ascending: true });

        if (!svcErr && data && data.length > 0) svcRows = data;
    } catch (_) { /* fall through */ }

    // ── Split into individual services and package groups ─────────────────────
    const individualSvcs = svcRows.filter(s => !s.package_id);
    const pkgRowsRaw     = svcRows.filter(s =>  s.package_id);

    // Group package rows by package_id
    const pkgMap = new Map();
    pkgRowsRaw.forEach(s => {
        if (!pkgMap.has(s.package_id)) pkgMap.set(s.package_id, []);
        pkgMap.get(s.package_id).push(s);
    });

    // Resolve package names & prices from `packages` table (if we have package_ids)
    let packagesInfo = {};  // { [package_id]: { name, price } }
    if (pkgMap.size > 0) {
        try {
            const pkgIds = [...pkgMap.keys()];
            const { data: pkgData } = await supabase
                .from('packages')
                .select('package_id, package_name, final_price')
                .in('package_id', pkgIds);
            (pkgData || []).forEach(p => {
                packagesInfo[p.package_id] = { name: p.package_name, price: Number(p.final_price) || 0 };
            });
        } catch (_) { /* use fallback below */ }
    }

    // ── Build flat `items` array for the GPM (used for total calculation) ─────
    // Individual services contribute their own price.
    // Each PACKAGE contributes ONE item at the package price.
    let items = [];

    if (individualSvcs.length > 0 || pkgMap.size > 0) {
        individualSvcs.forEach(s => {
            items.push({
                name:       (s.service_name || '').trim() || 'Service',
                staff:      (s.staff_name   || '').trim() || 'Assigned',
                time:       s.start_time || '',
                price:      Number(s.price) || 0,
                _type:      'service'
            });
        });
        pkgMap.forEach((pkgSvcs, pkgId) => {
            const info  = packagesInfo[pkgId] || {};
            // Package price: use resolved price, fallback to sum of individual prices
            const pkgPrice = info.price || pkgSvcs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
            items.push({
                name:       info.name || 'Package',
                price:      pkgPrice,
                _type:      'package',
                _services:  pkgSvcs  // sub-services array for detailed display
            });
        });
    }

    // Fallback: if DB returned nothing, estimate from summary row
    if (items.length === 0) {
        if (row && (row.service_name || row.services)) {
            const svcNames = (row.service_name || row.services || '').split(',');
            const apptDate = (row && (row.appointment_date || row.booking_date || row.date)) || 'Today';
            const apptTime = (row && (row.appointment_time || row.start_time || row.time)) || '';
            items = svcNames.map(s => ({
                name:  s.trim(),
                time:  apptTime,
                staff: 'Assigned',
                price: Math.round(totalOriginal / Math.max(1, svcNames.length)),
                _type: 'service'
            }));
        } else {
            items = [{
                name:  'Salon Service Appointment',
                staff: (row && (row.staff_name || row.staff)) || 'Assigned',
                time:  (row && (row.appointment_time || row.start_time || row.time)) || '',
                price: totalOriginal,
                _type: 'service'
            }];
        }
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
            amountDue:   totalOriginal,
            items: items,
            onComplete: async (payload) => {
                await processBookingPaymentCallback(payload, row || { booking_id: targetId, final_amount: totalOriginal }, options);
            }
        });

        // ── After GPM renders, replace the flat table with the two-section layout
        requestAnimationFrame(() => _renderBookingServicesSections(items, totalOriginal));
    } else {
        alert('Payment modal not loaded. Please refresh the page.');
    }
}

// ── Two-section renderer: Individual Services + Packages + Grand Total ─────────
function _renderBookingServicesSections(items, grandTotal) {
    const tableWrap  = document.getElementById('gpmTableWrap');
    const headerEl   = document.getElementById('gpmItemsHeader');
    const subtotalEl = document.getElementById('gpmServicesSubtotal');
    const noteEl     = document.getElementById('gpmServiceNote');
    if (!tableWrap) return;

    const svcs = items.filter(i => i._type === 'service');
    const pkgs = items.filter(i => i._type === 'package');

    const svcsTotal = svcs.reduce((s, i) => s + (i.price || 0), 0);
    const pkgsTotal = pkgs.reduce((s, i) => s + (i.price || 0), 0);
    const svcCount  = svcs.length;
    const pkgCount  = pkgs.length;
    const lineCount = svcCount + pkgCount;

    // Update header
    if (headerEl) headerEl.textContent = `Booked Services (${lineCount} line${lineCount !== 1 ? 's' : ''})`;
    if (subtotalEl) subtotalEl.textContent = '';   // Grand total shown inside the section
    if (noteEl) noteEl.style.display = 'none';

    const fmt = v => '₹' + Math.round(v).toLocaleString('en-IN');

    const rowStyle   = 'padding:9px 8px; border-bottom:1px solid #f8fafc; color:#334155; font-size:0.84rem; vertical-align:middle;';
    const thStyle    = 'padding:7px 8px; font-size:0.72rem; font-weight:700; color:#64748b; border-bottom:1px solid #f1f5f9; text-align:left;';
    const secHeader  = (label, count, subtotalAmt, color) => `
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:8px 4px 6px 2px; margin-top:4px; border-bottom:2px solid ${color}20;">
            <span style="font-size:0.8rem; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:0.04em;">
                ${label} <span style="background:${color}18; border-radius:10px; padding:1px 7px; font-size:0.72rem;">${count}</span>
            </span>
            <span style="font-size:0.82rem; font-weight:700; color:#0f172a;">${fmt(subtotalAmt)}</span>
        </div>`;

    // ── Individual Services Section ──────────────────────────────────────────
    let svcHtml = '';
    if (svcs.length > 0) {
        svcHtml = secHeader('Individual Services', svcs.length, svcsTotal, '#4f46e5');
        svcHtml += `<table style="width:100%; border-collapse:collapse; margin-bottom:4px;">
            <thead><tr>
                <th style="${thStyle} width:24px;">#</th>
                <th style="${thStyle}">Service</th>
                <th style="${thStyle}">Staff</th>
                <th style="${thStyle}">Time</th>
                <th style="${thStyle} text-align:right;">Price</th>
            </tr></thead>
            <tbody>
                ${svcs.map((s, i) => `<tr>
                    <td style="${rowStyle} font-weight:700; color:#0f172a;">${i + 1}</td>
                    <td style="${rowStyle} font-weight:600; color:#0f172a;">${s.name}</td>
                    <td style="${rowStyle}">${s.staff || 'Assigned'}</td>
                    <td style="${rowStyle}">${s.time || '—'}</td>
                    <td style="${rowStyle} font-weight:700; text-align:right;">${fmt(s.price)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
    }

    // ── Packages Section ─────────────────────────────────────────────────────
    let pkgHtml = '';
    if (pkgs.length > 0) {
        pkgHtml = secHeader('Packages', pkgs.length, pkgsTotal, '#0891b2');
        pkgs.forEach((pkg, pi) => {
            const subSvcs = pkg._services || [];
            pkgHtml += `
            <div style="margin:8px 0; border:1px solid #e0f2fe; border-radius:10px; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center;
                            padding:10px 14px; background:#f0f9ff; border-bottom:1px solid #e0f2fe;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1rem;">🎁</span>
                        <span style="font-weight:700; font-size:0.88rem; color:#0c4a6e;">${pkg.name}</span>
                        <span style="font-size:0.72rem; color:#0369a1; background:#e0f2fe;
                                     border-radius:10px; padding:1px 7px; font-weight:600;">
                            ${subSvcs.length} service${subSvcs.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <span style="font-weight:800; font-size:0.95rem; color:#0c4a6e;">${fmt(pkg.price)}</span>
                </div>
                ${subSvcs.length > 0 ? `
                <table style="width:100%; border-collapse:collapse;">
                    <thead><tr>
                        <th style="${thStyle} padding-left:20px; background:#fafeff;">Service</th>
                        <th style="${thStyle} background:#fafeff;">Staff</th>
                        <th style="${thStyle} background:#fafeff;">Time</th>
                    </tr></thead>
                    <tbody>
                        ${subSvcs.map(s => `<tr style="background:#fafeff;">
                            <td style="${rowStyle} padding-left:20px; font-size:0.8rem;">
                                <span style="color:#94a3b8; margin-right:6px;">└</span>${s.service_name || '—'}
                            </td>
                            <td style="${rowStyle} font-size:0.8rem; color:#475569;">${s.staff_name || 'Assigned'}</td>
                            <td style="${rowStyle} font-size:0.8rem; color:#475569;">${s.start_time || '—'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : ''}
            </div>`;
        });
    }

    // ── Grand Total Summary ───────────────────────────────────────────────────
    const summaryHtml = `
        <div style="margin-top:12px; border-top:2px solid #e2e8f0; padding-top:10px;">
            ${svcs.length > 0 && pkgs.length > 0 ? `
            <div style="display:flex; justify-content:space-between; padding:4px 2px;
                        font-size:0.82rem; color:#64748b;">
                <span>Services Subtotal</span><span style="font-weight:600;">${fmt(svcsTotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 2px;
                        font-size:0.82rem; color:#64748b;">
                <span>Packages Subtotal</span><span style="font-weight:600;">${fmt(pkgsTotal)}</span>
            </div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center;
                        margin-top:6px; padding:10px 14px; background:#eff6ff;
                        border:1px solid #dbeafe; border-radius:10px;">
                <span style="font-weight:700; font-size:0.92rem; color:#1e40af;">Grand Total</span>
                <span style="font-weight:900; font-size:1.25rem; color:#0f172a;">${fmt(grandTotal)}</span>
            </div>
        </div>`;

    tableWrap.innerHTML = svcHtml + pkgHtml + summaryHtml;
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
