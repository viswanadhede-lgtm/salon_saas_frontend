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

    const servicesContainer = document.getElementById('rfServicesContainer');
    const servicesTbody     = document.getElementById('rfServicesTableBody');
    const servicesTotalEl   = document.getElementById('rfServicesTotal');
    if (servicesContainer) {
        servicesContainer.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:0.82rem;">Loading services...</div>';
    } else if (servicesTbody) {
        servicesTbody.innerHTML = '<tr><td colspan="3" style="padding:14px;text-align:center;color:#94a3b8;">Loading services...</td></tr>';
    }
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
            supabase.schema('app').from('bookings_for_business_transaction').select('*').eq('booking_id', bookingId).maybeSingle(),
            supabase.schema('app').from('bookings').select('*').eq('booking_id', bookingId),
            supabase.schema('app').from('business_transactions').select('*').eq('reference_id', bookingId).eq('reference_type', 'booking').order('paid_at', { ascending: true })
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
                const { data: custRecord } = await supabase.schema('app').from('customers').select('*').eq('customer_id', custId).maybeSingle();
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

        // 3. POPULATE CARD 3: Services in this Booking (Services vs Packages)
        const container = document.getElementById('rfServicesContainer');

        const individualSvcs = individualBookings.filter(s => !s.package_id);
        const pkgRowsRaw     = individualBookings.filter(s => s.package_id);

        // Group package rows by package_id
        const pkgMap = new Map();
        pkgRowsRaw.forEach(s => {
            if (!pkgMap.has(s.package_id)) pkgMap.set(s.package_id, []);
            pkgMap.get(s.package_id).push(s);
        });

        // Resolve package info (name, final_price) from packages table
        let packagesInfo = {};
        if (pkgMap.size > 0) {
            try {
                const pkgIds = [...pkgMap.keys()];
                const { data: pkgData, error: pkgErr } = await supabase
                    .from('packages')
                    .select('package_id, package_name, final_price')
                    .in('package_id', pkgIds);
                if (!pkgErr && pkgData) {
                    pkgData.forEach(p => {
                        packagesInfo[p.package_id] = {
                            name: p.package_name,
                            price: Number(p.final_price) || 0
                        };
                    });
                }
            } catch (pkgEx) {
                console.warn('[Refund] Package lookup warning:', pkgEx);
            }
        }

        // Build package items list
        const packageItems = [];
        pkgMap.forEach((subSvcs, pkgId) => {
            const info = packagesInfo[pkgId] || {};
            const pkgPrice = info.price !== undefined
                ? info.price
                : subSvcs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
            packageItems.push({
                id: pkgId,
                name: info.name || 'Package',
                price: pkgPrice,
                services: subSvcs
            });
        });

        const svcsSubtotal = individualSvcs.reduce((acc, curr) => acc + Number(curr.price || 0), 0);
        const pkgsSubtotal = packageItems.reduce((acc, curr) => acc + Number(curr.price || 0), 0);

        const totalBookingPrice = (individualSvcs.length > 0 || packageItems.length > 0)
            ? (svcsSubtotal + pkgsSubtotal)
            : Number(bft.total_price || (b && (b.total_price || b.amount)) || 0);

        if (container) {
            let card3Html = '';

            // Section 1: Standalone Services
            if (individualSvcs.length > 0) {
                card3Html += `
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <div style="display:flex;align-items:center;gap:8px;padding:4px 0 6px 0;border-bottom:1.5px solid #e0e7ff;">
                            <span style="font-size:0.78rem;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.04em;">Selected Services</span>
                            <span style="background:#e0e7ff;color:#4f46e5;border-radius:12px;padding:1px 8px;font-size:0.7rem;font-weight:700;">${individualSvcs.length}</span>
                        </div>
                        <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;table-layout:fixed;">
                                <thead>
                                    <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                                        <th style="padding:7px 10px;text-align:left;font-size:0.7rem;font-weight:700;color:#64748b;width:45%;">Service</th>
                                        <th style="padding:7px 10px;text-align:left;font-size:0.7rem;font-weight:700;color:#64748b;width:30%;">Staff</th>
                                        <th style="padding:7px 10px;text-align:right;font-size:0.7rem;font-weight:700;color:#64748b;width:25%;">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${individualSvcs.map(s => `
                                        <tr style="border-bottom:1px solid #f1f5f9;">
                                            <td style="padding:8px 10px;font-weight:600;color:#0f172a;">${s.service_name || 'Service'}</td>
                                            <td style="padding:8px 10px;color:#475569;">
                                                <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;">
                                                    ${s.staff_name || 'Assigned'}
                                                </span>
                                            </td>
                                            <td style="padding:8px 10px;text-align:right;font-weight:700;color:#0f172a;">₹${Number(s.price || 0).toLocaleString('en-IN')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:4px 2px;">
                            <span style="font-size:0.78rem;font-weight:600;color:#64748b;">Services Subtotal:</span>
                            <span style="font-size:0.88rem;font-weight:800;color:#0f172a;">₹${svcsSubtotal.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                `;
            }

            // Section 2: Selected Packages
            if (packageItems.length > 0) {
                card3Html += `
                    <div style="display:flex;flex-direction:column;gap:8px;${individualSvcs.length > 0 ? 'margin-top:6px;' : ''}">
                        <div style="display:flex;align-items:center;gap:8px;padding:4px 0 6px 0;border-bottom:1.5px solid #e0e7ff;">
                            <span style="font-size:0.78rem;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.04em;">Selected Packages</span>
                            <span style="background:#e0e7ff;color:#4f46e5;border-radius:12px;padding:1px 8px;font-size:0.7rem;font-weight:700;">${packageItems.length}</span>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${packageItems.map((pkg, pIdx) => {
                                const cardId = `rfPkgBody_${pIdx}`;
                                const arrowId = `rfPkgArrow_${pIdx}`;
                                return `
                                    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                                        <div onclick="var b=document.getElementById('${cardId}'); var a=document.getElementById('${arrowId}'); var open=b.style.display!=='none'; b.style.display=open?'none':'block'; a.style.transform=open?'rotate(0deg)':'rotate(180deg)';"
                                             style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;user-select:none;background:#ffffff;">
                                            <div style="display:flex;align-items:center;gap:10px;">
                                                <div style="width:32px;height:32px;border-radius:8px;background:#eef2ff;border:1px solid #c7d2fe;display:flex;align-items:center;justify-content:center;color:#4f46e5;flex-shrink:0;">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div style="display:flex;align-items:center;gap:6px;">
                                                        <span style="font-weight:700;font-size:0.86rem;color:#0f172a;">${pkg.name}</span>
                                                        <span style="background:#e0e7ff;color:#4f46e5;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:10px;">PACKAGE</span>
                                                    </div>
                                                    <div style="font-size:0.72rem;color:#64748b;margin-top:1px;">
                                                        ${pkg.services.length} included services
                                                    </div>
                                                </div>
                                            </div>
                                            <div style="display:flex;align-items:center;gap:10px;">
                                                <span style="font-weight:800;font-size:0.95rem;color:#0f172a;">₹${pkg.price.toLocaleString('en-IN')}</span>
                                                <div style="width:24px;height:24px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
                                                    <svg id="${arrowId}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.25s;">
                                                        <polyline points="6 9 12 15 18 9"></polyline>
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div id="${cardId}" style="display:none;border-top:1px solid #f1f5f9;background:#fafbfc;padding:6px 12px 10px 12px;">
                                            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                                                <thead>
                                                    <tr style="border-bottom:1px solid #e2e8f0;color:#64748b;">
                                                        <th style="padding:4px 6px;text-align:left;width:24px;font-size:0.68rem;font-weight:700;">#</th>
                                                        <th style="padding:4px 6px;text-align:left;font-size:0.68rem;font-weight:700;">Service</th>
                                                        <th style="padding:4px 6px;text-align:left;font-size:0.68rem;font-weight:700;">Staff</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${pkg.services.map((s, idx) => `
                                                        <tr style="border-bottom:1px solid #f1f5f9;">
                                                            <td style="padding:5px 6px;color:#94a3b8;font-weight:600;">${idx + 1}</td>
                                                            <td style="padding:5px 6px;font-weight:600;color:#334155;">${s.service_name || 'Service'}</td>
                                                            <td style="padding:5px 6px;color:#475569;">
                                                                <span style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;padding:1px 6px;border-radius:8px;font-size:0.7rem;font-weight:600;">
                                                                    ${s.staff_name || 'Assigned'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:4px 2px;">
                            <span style="font-size:0.78rem;font-weight:600;color:#64748b;">Packages Subtotal:</span>
                            <span style="font-size:0.88rem;font-weight:800;color:#0f172a;">₹${pkgsSubtotal.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                `;
            }

            // Fallback if no services rows returned
            if (individualSvcs.length === 0 && packageItems.length === 0) {
                const svcNames = (bft.service_name || (b && (b.service_name || b.service)) || 'Service').split(',').map(s => s.trim()).filter(Boolean);
                card3Html += `
                    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                            <tbody>
                                ${svcNames.map(name => `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:8px 10px;font-weight:600;color:#0f172a;">${name}</td>
                                        <td style="padding:8px 10px;text-align:right;font-weight:700;color:#0f172a;">—</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            // Summary Section
            card3Html += `
                <div style="margin-top:6px;border-top:1.5px dashed #e2e8f0;padding-top:8px;">
                    ${(individualSvcs.length > 0 && packageItems.length > 0) ? `
                        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#64748b;margin-bottom:3px;">
                            <span>Services Subtotal</span>
                            <span style="font-weight:700;color:#0f172a;">₹${svcsSubtotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#64748b;margin-bottom:6px;">
                            <span>Packages Subtotal</span>
                            <span style="font-weight:700;color:#0f172a;">₹${pkgsSubtotal.toLocaleString('en-IN')}</span>
                        </div>
                    ` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:8px 12px;">
                        <span style="font-size:0.84rem;font-weight:700;color:#6b21a8;">Total Booking Value</span>
                        <span style="font-size:1rem;font-weight:800;color:#6b21a8;">₹${totalBookingPrice.toLocaleString('en-IN')}</span>
                    </div>
                </div>
            `;

            container.innerHTML = card3Html;
        } else if (servicesTbody) {
            // Legacy fallback if table exists
            servicesTbody.innerHTML = individualBookings.map(item => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:600;color:#0f172a;">${item.service_name || 'Service'}</td>
                    <td style="padding:10px 12px;color:#475569;">${item.staff_name || 'Assigned'}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(item.price || 0).toLocaleString('en-IN')}</td>
                </tr>
            `).join('');
            if (servicesTotalEl) servicesTotalEl.textContent = `₹${totalBookingPrice.toLocaleString('en-IN')}`;
        }

        // 4. POPULATE CARD 4: Original Payment Details
        const paidTxs = transactions.filter(t => (t.status || '').toLowerCase().trim() === 'paid');
        const latestPaidTx = paidTxs[paidTxs.length - 1] || transactions[0] || null;

        let origMethod = latestPaidTx?.payment_method || (b && b.payment_method) || 'Cash';
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

        // 5. COMPUTE REFUNDABLE AMOUNT — business_transactions is the ONLY source of truth
        // Formula: SUM(paid rows) - SUM(refunded rows) for this booking_id
        // No fallback to other tables. If net = 0, the booking is already fully refunded.
        const totalPaid     = transactions.filter(tx => (tx.status || '').toLowerCase().trim() === 'paid')
                                          .reduce((sum, tx) => sum + Number(tx.final_amount ?? tx.amount ?? 0), 0);
        const totalRefunded = transactions.filter(tx => (tx.status || '').toLowerCase().trim() === 'refunded')
                                          .reduce((sum, tx) => sum + Number(tx.final_amount ?? tx.amount ?? 0), 0);

        const activeRefundableAmount = Math.max(0, totalPaid - totalRefunded);

        // Determine display state: no payment recorded vs already fully refunded vs refundable
        const noPaidTransactions = totalPaid === 0;
        const alreadyRefunded    = totalPaid > 0 && activeRefundableAmount === 0;

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
            if (alreadyRefunded) {
                // Fully refunded already — show in amber, disable button
                if (amountDisp) {
                    amountDisp.textContent = '₹0';
                    amountDisp.style.color = '#d97706';
                }
                if (maxRefundEl) maxRefundEl.textContent = '₹0 (already refunded)';
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Already Refunded';
                confirmBtn.style.background = '#d97706';
            } else if (noPaidTransactions) {
                // No payment logged at all — nothing to refund
                if (amountDisp) {
                    amountDisp.textContent = '₹0';
                    amountDisp.style.color = '#94a3b8';
                }
                if (maxRefundEl) maxRefundEl.textContent = 'No payment recorded';
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'No Payment to Refund';
                confirmBtn.style.background = '#94a3b8';
            } else {
                // Refund available
                if (amountDisp) amountDisp.style.color = '#e11d48';
                confirmBtn.disabled = false;
                confirmBtn.style.background = '#e11d48';
                confirmBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span>Issue Refund — ${refundFormatted}</span>
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
