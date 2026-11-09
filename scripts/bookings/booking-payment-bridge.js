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
    // Each row has: service_name, staff_name, price, start_time, end_time, package_id
    // package_id = null  → individual service
    // package_id = UUID  → belongs to a package (group by package_id)
    let svcRows = [];
    try {
        const { data, error: svcErr } = await supabase
            .from('bookings')
            .select('service_name, staff_name, price, booking_date, start_time, end_time, package_id, service_id')
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
                end_time:   s.end_time || '',
                duration:   calcDurationMinutes(s.start_time, s.end_time),
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
                name:     s.trim(),
                time:     apptTime,
                duration: '—',
                staff:    'Assigned',
                price:    Math.round(totalOriginal / Math.max(1, svcNames.length)),
                _type:    'service'
            }));
        } else {
            items = [{
                name:     'Salon Service Appointment',
                staff:    (row && (row.staff_name || row.staff)) || 'Assigned',
                time:     (row && (row.appointment_time || row.start_time || row.time)) || '',
                duration: '—',
                price:    totalOriginal,
                _type:    'service'
            }];
        }
    }

    // ── Compute correct grand total:
    //    individual service prices (package_id = NULL) + each package's final_price (ONE per package)
    //    This avoids double-counting by ignoring the per-service prices stored inside packages.
    //    Falls back to row.total_price only when items could not be built.
    const computedTotal = items.length > 0
        ? items.reduce((sum, i) => sum + (i.price || 0), 0)
        : totalOriginal;

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
            totalAmount: computedTotal,
            amountDue:   computedTotal,
            items: items,
            onComplete: async (payload) => {
                await processBookingPaymentCallback(payload, row || { booking_id: targetId, final_amount: computedTotal }, options);
            }
        });

        // ── After GPM renders, replace the flat table with the two-section layout
        requestAnimationFrame(() => _renderBookingServicesSections(items, computedTotal));
        setTimeout(() => _renderBookingServicesSections(items, computedTotal), 50);
        setTimeout(() => _renderBookingServicesSections(items, computedTotal), 150);
    } else {
        alert('Payment modal not loaded. Please refresh the page.');
    }
}

// Helper to calculate duration in minutes between start_time and end_time (HH:MM:SS)
function calcDurationMinutes(startTime, endTime) {
    if (!startTime || !endTime) return '—';
    try {
        const [sh, sm] = String(startTime).split(':').map(Number);
        const [eh, em] = String(endTime).split(':').map(Number);
        const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        return diff > 0 ? `${diff} min` : '—';
    } catch {
        return '—';
    }
}

// ── Two-section renderer: Included Services + Included Packages + Grand Total ──
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

    // Consistent theme blue color across all titles
    const BLUE_COLOR    = '#4f46e5';
    const BLUE_BADGE_BG = '#e0e7ff';
    const fmt = v => '₹' + Math.round(v).toLocaleString('en-IN');

    // ── 1. Card heading: BOOKED SERVICES & PACKAGES (same blue color) ────────
    if (headerEl) {
        headerEl.textContent = 'BOOKED SERVICES & PACKAGES';
        headerEl.style.color = BLUE_COLOR;
        headerEl.style.fontWeight = '700';
        headerEl.style.letterSpacing = '0.03em';
    }

    // ── Hide default orphan subtotal bar in gpmItemsCard ──────────────────────
    const subtotalLabelEl = document.getElementById('gpmServicesSubtotalLabel');
    const defaultSubtotalBar = subtotalEl?.closest('div[style*="justify-content:space-between"]')
        || subtotalLabelEl?.parentElement?.parentElement
        || (subtotalLabelEl ? subtotalLabelEl.closest('div') : null);
    if (defaultSubtotalBar) {
        defaultSubtotalBar.style.display = 'none';
    }
    if (subtotalLabelEl) subtotalLabelEl.textContent = '';
    if (subtotalEl) subtotalEl.textContent = '';
    if (noteEl) noteEl.style.display = 'none';

    const rowStyle = 'padding:10px 8px; border-bottom:1px solid #f8fafc; color:#334155; font-size:0.84rem; vertical-align:middle;';
    const thStyle  = 'padding:8px 8px; font-size:0.72rem; font-weight:700; color:#64748b; border-bottom:1px solid #f1f5f9; text-align:left;';

    // ── Shared section header builder: Title and badge only (subtotal placed at bottom)
    const secHeader = (label, count) => `
        <div style="display:flex; align-items:center; gap:8px; padding:10px 4px 8px 2px; border-bottom:1.5px solid #e0e7ff;">
            <span style="font-size:0.82rem; font-weight:700; color:${BLUE_COLOR}; text-transform:uppercase; letter-spacing:0.04em;">
                ${label}
            </span>
            <span style="background:${BLUE_BADGE_BG}; color:${BLUE_COLOR}; border-radius:12px; padding:2px 10px;
                         font-size:0.75rem; font-weight:700; letter-spacing:0.02em;">${count}</span>
        </div>`;

    // ── 2. Included services Section (with subtotal at the bottom) ───────────
    let svcHtml = '';
    if (svcs.length > 0) {
        svcHtml = secHeader('Included services', svcs.length);
        svcHtml += `<table style="width:100%; border-collapse:collapse; margin-bottom:4px; margin-top:6px;">
            <thead><tr>
                <th style="${thStyle} width:28px;">#</th>
                <th style="${thStyle}">Service</th>
                <th style="${thStyle}">Staff</th>
                <th style="${thStyle}">Duration</th>
                <th style="${thStyle} text-align:right;">Price</th>
            </tr></thead>
            <tbody>
                ${svcs.map((s, i) => `<tr>
                    <td style="${rowStyle} width:28px; font-weight:700; color:#64748b; font-size:0.8rem;">${i + 1}</td>
                    <td style="${rowStyle} font-weight:600; color:#0f172a;">${s.name}</td>
                    <td style="${rowStyle}">
                        <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600;">
                            ${s.staff || 'Assigned'}
                        </span>
                    </td>
                    <td style="${rowStyle} color:#64748b;">${s.duration || '—'}</td>
                    <td style="${rowStyle} font-weight:700; text-align:right; color:#0f172a;">${fmt(s.price)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <!-- Subtotal placed at bottom of Included services section -->
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; padding:10px 8px 4px 8px; border-top:1px solid #f1f5f9;">
            <span style="font-size:0.82rem; font-weight:600; color:#64748b;">Subtotal:</span>
            <span style="font-size:0.95rem; font-weight:800; color:#059669;">${fmt(svcsTotal)}</span>
        </div>`;
    }

    // ── 3 & 4. Included packages (with subtotal at bottom of section) ─────────
    let pkgHtml = '';
    if (pkgs.length > 0) {
        const pkgHeaderHtml = secHeader('Included packages', pkgs.length);
        let cardsHtml = '<div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">';

        pkgs.forEach((pkg, pi) => {
            const subSvcs  = pkg._services || [];
            const cardId   = `gpmPkgCard_${pi}`;
            const bodyId   = `gpmPkgBody_${pi}`;
            const arrowId  = `gpmPkgArrow_${pi}`;

            cardsHtml += `
            <div id="${cardId}" style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;
                                       background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.03); transition:all 0.2s;"
                 onmouseover="this.style.borderColor='#c7d2fe'; this.style.boxShadow='0 3px 12px rgba(79,70,229,0.08)';"
                 onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.03)';">

                <!-- Clickable package header card -->
                <div onclick="
                        var b=document.getElementById('${bodyId}');
                        var a=document.getElementById('${arrowId}');
                        var open=b.style.display!=='none';
                        b.style.display=open?'none':'block';
                        a.style.transform=open?'rotate(0deg)':'rotate(180deg)';
                    "
                    style="display:flex; justify-content:space-between; align-items:center;
                           padding:12px 16px; cursor:pointer; user-select:none; background:#ffffff;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:36px; height:36px; border-radius:10px; background:#eef2ff; border:1px solid #c7d2fe;
                                    display:flex; align-items:center; justify-content:center; color:${BLUE_COLOR}; font-size:1.05rem; flex-shrink:0;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                <line x1="12" y1="22.08" x2="12" y2="12"></line>
                            </svg>
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight:700; font-size:0.92rem; color:#0f172a;">${pkg.name}</span>
                                <span style="background:${BLUE_BADGE_BG}; color:${BLUE_COLOR}; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:12px; letter-spacing:0.02em;">PACKAGE</span>
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                                ${subSvcs.length} included services
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-weight:800; font-size:1.05rem; color:#059669;">${fmt(pkg.price)}</span>
                        <div style="width:28px; height:28px; border-radius:6px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; transition:background 0.15s;">
                            <svg id="${arrowId}" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                 stroke="${BLUE_COLOR}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                                 style="transition:transform 0.25s; flex-shrink:0;">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>

                <!-- Collapsible nested services table with serial numbers & duration -->
                <div id="${bodyId}" style="display:none; border-top:1px solid #f1f5f9; background:#fafbfc; padding:2px 0 6px 0;">
                    ${subSvcs.length > 0 ? `
                    <table style="width:100%; border-collapse:collapse;">
                        <thead><tr>
                            <th style="${thStyle} width:28px; padding-left:18px;">#</th>
                            <th style="${thStyle}">Service</th>
                            <th style="${thStyle}">Staff</th>
                            <th style="${thStyle}">Duration</th>
                        </tr></thead>
                        <tbody>
                            ${subSvcs.map((s, idx) => {
                                const cleanName = (s.service_name || '—').replace(/\s*\([^)]*\)\s*$/, '').trim() || s.service_name;
                                const dur = calcDurationMinutes(s.start_time, s.end_time);
                                return `<tr>
                                    <td style="${rowStyle} width:28px; padding-left:18px; font-weight:700; color:#64748b; font-size:0.8rem;">
                                        ${idx + 1}
                                    </td>
                                    <td style="${rowStyle} font-size:0.82rem; font-weight:600; color:#1e293b;">
                                        ${cleanName}
                                    </td>
                                    <td style="${rowStyle} font-size:0.82rem;">
                                        <span style="background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600;">
                                            ${s.staff_name || 'Assigned'}
                                        </span>
                                    </td>
                                    <td style="${rowStyle} font-size:0.82rem; color:#64748b;">${dur}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>` : `<div style="padding:12px 18px; font-size:0.82rem; color:#64748b;">No services recorded for this package.</div>`}
                </div>
            </div>`;
        });

        cardsHtml += '</div>';

        // Subtotal placed at bottom of Included packages section
        const pkgSubtotalRow = `
            <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; padding:10px 8px 4px 8px; border-top:1px solid #f1f5f9; margin-top:10px;">
                <span style="font-size:0.82rem; font-weight:600; color:#64748b;">Subtotal:</span>
                <span style="font-size:0.95rem; font-weight:800; color:#059669;">${fmt(pkgsTotal)}</span>
            </div>`;

        // 5. Breathing space between sections (margin-top: 26px)
        pkgHtml = `<div style="margin-top:26px;">${pkgHeaderHtml}${cardsHtml}${pkgSubtotalRow}</div>`;
    }

    // ── Grand Total Summary ───────────────────────────────────────────────────
    const summaryHtml = `
        <div style="margin-top:20px; border-top:2px solid #e2e8f0; padding-top:12px;">
            ${svcs.length > 0 && pkgs.length > 0 ? `
            <div style="display:flex; justify-content:space-between; padding:4px 2px; font-size:0.82rem; color:#64748b;">
                <span>Services Subtotal</span>
                <span style="font-weight:700; color:#059669;">${fmt(svcsTotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 2px; font-size:0.82rem; color:#64748b;">
                <span>Packages Subtotal</span>
                <span style="font-weight:700; color:#059669;">${fmt(pkgsTotal)}</span>
            </div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center;
                        margin-top:8px; padding:12px 16px; background:#f0fdf4;
                        border:1.5px solid #86efac; border-radius:10px;">
                <span style="font-weight:700; font-size:0.92rem; color:#166534;">Grand Total</span>
                <span style="font-weight:900; font-size:1.3rem; color:#059669;">${fmt(grandTotal)}</span>
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
                // Update booking status → completed via authoritative stored procedure
                const companyId = row.company_id || localStorage.getItem('company_id');
                const branchId = row.branch_id || localStorage.getItem('branch_id');

                const { data: resData, error: statusErr } = await supabase.rpc('update_booking_status_atomic', {
                    p_booking_id: bookingId,
                    p_company_id: companyId,
                    p_branch_id: branchId || null,
                    p_new_status: 'completed'
                });

                if (statusErr || resData?.success === false) {
                    console.warn('[BookingPaymentBridge] Status update warning:', statusErr?.message || resData?.error);
                }

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
