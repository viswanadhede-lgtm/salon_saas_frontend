// scripts/bookings/booking-invoice-engine.js
// Unified booking invoice engine — single source of truth for all 5 invoice touchpoints.
// Zero backend changes. Surgical frontend only.

import { supabase } from '../../lib/supabase.js';
import { getInvoiceConfig } from '../invoice-state.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtINR(n) {
    const num = Number(n);
    if (isNaN(num)) return '₹0';
    return '₹' + num.toLocaleString('en-IN');
}

function fmtDate(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return isoStr; }
}

function fmtDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return isoStr; }
}

function fmtTime12(timeStr) {
    if (!timeStr) return '—';
    try {
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch { return timeStr; }
}

function getAppContext() {
    try {
        return JSON.parse(localStorage.getItem('appContext') || '{}');
    } catch { return {}; }
}

// ─── Core Data Fetcher ──────────────────────────────────────────────────────

/**
 * Fetches all data needed to render a full professional booking invoice.
 * @param {string} bookingId - Full UUID of the booking
 * @returns {{ summary, lineItems, payment, companyConfig, invoiceConfig }}
 */
export async function fetchBookingInvoiceData(bookingId) {
    if (!bookingId) throw new Error('bookingId is required');

    // Run all 3 queries in parallel
    const [summaryResult, lineItemsResult, paymentResult] = await Promise.all([
        supabase.schema('app')
            .from('bookings_for_business_transaction')
            .select('*')
            .eq('booking_id', bookingId)
            .maybeSingle(),

        supabase.schema('app')
            .from('bookings')
            .select('service_name, staff_name, price, duration, start_time, end_time, package_id')
            .eq('booking_id', bookingId),

        supabase.schema('app')
            .from('business_transactions')
            .select('*')
            .eq('reference_id', bookingId)
            .in('status', ['paid', 'refunded'])
            .order('created_at', { ascending: false })
            .limit(1)
    ]);

    const summary = summaryResult.data || {};
    const lineItems = (lineItemsResult.data || []);
    const payment = (paymentResult.data && paymentResult.data.length > 0) ? paymentResult.data[0] : null;

    // Company config from localStorage (set by app-shell / auth-loader)
    const ctx = getAppContext();
    const company = ctx.company || {};
    const branches = ctx.branches || [];
    const activeBranchId = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id') || summary.branch_id;
    const activeBranch = branches.find(b => (b.branch_id || b.id) === activeBranchId) || branches[0] || {};

    const companyConfig = {
        name:        company.display_name || company.name || company.company_name || 'Salon',
        legalName:   company.legal_name || company.company_name || '',
        logo:        company.logo_url || company.logo || '',
        address:     activeBranch.address || company.address || '',
        phone:       activeBranch.phone || company.phone || '',
        email:       activeBranch.email || company.email || '',
        gstin:       company.gstin || activeBranch.gstin || '',
        branchName:  activeBranch.branch_name || activeBranch.name || '',
    };

    const invoiceConfig = getInvoiceConfig();

    return { summary, lineItems, payment, companyConfig, invoiceConfig };
}

// ─── Invoice HTML Renderer ──────────────────────────────────────────────────

/**
 * Renders a full professional booking invoice as an HTML string.
 * @param {{ summary, lineItems, payment, companyConfig, invoiceConfig }} data
 * @returns {string} Full HTML string ready for a print window
 */
export function renderBookingInvoiceHTML(data) {
    const { summary, lineItems, payment, companyConfig, invoiceConfig } = data;
    const cfg = invoiceConfig || {};
    const header = cfg.header || {};
    const customer = cfg.customer || {};
    const totals = cfg.totals || {};
    const footer = cfg.footer || {};
    const booking = cfg.booking || {};

    const bookingId = summary.booking_id || '';
    const shortId = bookingId.slice(0, 8).toUpperCase();

    // Customer info
    const customerName = summary.customer_name || 'Walk-in Customer';
    const customerPhone = summary.customer_phone || '';

    // Booking date & time
    const bookingDate = fmtDate(summary.booking_date ? `${summary.booking_date}T00:00` : '');
    const bookingTime = fmtTime12((summary.start_time || '').slice(0, 5));

    // Financial figures
    const originalAmount = Number(summary.total_price || summary.price || 0);
    const discountAmount = payment ? Number(payment.discount_amount || 0) : 0;
    const discountName   = payment ? (payment.discount_name || '') : '';
    const finalAmount    = payment ? Number(payment.final_amount || 0) : (originalAmount - discountAmount);
    const paymentMethod  = payment ? (payment.payment_method || 'Cash') : '—';
    const paidAt         = payment ? fmtDateTime(payment.paid_at || payment.created_at) : '—';
    const paymentStatus  = payment ? (payment.status || 'paid') : 'unpaid';

    // Build services table rows
    let serviceRowsHTML = '';
    if (lineItems.length > 0) {
        lineItems.forEach(item => {
            const svcName  = item.service_name || item.package_id || 'Service';
            const staffName = item.staff_name || '—';
            const price    = Number(item.price || 0);
            const duration = item.duration ? `${item.duration} min` : '—';
            serviceRowsHTML += `
                <tr>
                    <td style="padding:10px 12px; color:#1e293b; font-weight:500;">${svcName}</td>
                    <td style="padding:10px 12px; color:#64748b;">${staffName}</td>
                    <td style="padding:10px 12px; color:#64748b; text-align:center;">${duration}</td>
                    <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">${fmtINR(price)}</td>
                </tr>`;
        });
    } else {
        // Fallback: render from summary comma-separated names
        const svcNames  = String(summary.service_name || '').split(',').map(s => s.trim()).filter(Boolean);
        const staffNames = String(summary.staff_name || '').split(',').map(s => s.trim()).filter(Boolean);
        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                serviceRowsHTML += `
                    <tr>
                        <td style="padding:10px 12px; color:#1e293b; font-weight:500;">${svc}</td>
                        <td style="padding:10px 12px; color:#64748b;">${staff}</td>
                        <td style="padding:10px 12px; color:#64748b; text-align:center;">—</td>
                        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">${fmtINR(originalAmount)}</td>
                    </tr>`;
            });
        } else {
            serviceRowsHTML = `
                <tr>
                    <td style="padding:10px 12px; color:#1e293b; font-weight:500;">Salon Service</td>
                    <td style="padding:10px 12px; color:#64748b;">—</td>
                    <td style="padding:10px 12px; color:#64748b; text-align:center;">—</td>
                    <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">${fmtINR(originalAmount)}</td>
                </tr>`;
        }
    }

    // Header block
    let headerHTML = '';
    if (header.showLogo && companyConfig.logo) {
        headerHTML += `<img src="${companyConfig.logo}" alt="Logo" style="max-height:64px; max-width:160px; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">`;
    }
    const displayName = header.showDisplayName ? companyConfig.name : (header.showLegalName ? companyConfig.legalName : companyConfig.name);
    headerHTML += `<h1 style="font-size:1.5rem; font-weight:800; color:#1e293b; margin:0 0 2px; text-align:center;">${displayName}</h1>`;
    if (header.showBranchName && companyConfig.branchName) {
        headerHTML += `<p style="font-size:0.82rem; color:#64748b; margin:0 0 2px; text-align:center;">${companyConfig.branchName}</p>`;
    }
    if (header.showAddress && companyConfig.address) {
        headerHTML += `<p style="font-size:0.8rem; color:#64748b; margin:0 0 2px; text-align:center;">${companyConfig.address}</p>`;
    }
    if (header.showPhone && companyConfig.phone) {
        headerHTML += `<p style="font-size:0.8rem; color:#64748b; margin:0 0 2px; text-align:center;">📞 ${companyConfig.phone}</p>`;
    }
    if (header.showGstin && companyConfig.gstin) {
        headerHTML += `<p style="font-size:0.78rem; color:#94a3b8; margin:0; text-align:center;">GSTIN: ${companyConfig.gstin}</p>`;
    }

    // Customer & Invoice meta block
    let metaHTML = '';
    if (customer.showName) {
        metaHTML += `<div><span style="font-size:0.7rem; font-weight:600; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:2px;">Bill To</span>
            <span style="font-size:0.95rem; font-weight:700; color:#1e293b;">${customerName}</span>`;
        if (customer.showPhone && customerPhone) {
            metaHTML += `<span style="font-size:0.82rem; color:#64748b; display:block;">${customerPhone}</span>`;
        }
        metaHTML += `</div>`;
    }

    // Financial summary
    let financialHTML = `
        <tr>
            <td style="padding:8px 0; color:#475569;">Subtotal</td>
            <td style="padding:8px 0; text-align:right; color:#1e293b; font-weight:600;">${fmtINR(originalAmount)}</td>
        </tr>`;
    if (totals.showDiscount && discountAmount > 0) {
        const discLabel = discountName ? `Discount (${discountName})` : 'Discount';
        financialHTML += `
        <tr>
            <td style="padding:8px 0; color:#dc2626;">${discLabel}</td>
            <td style="padding:8px 0; text-align:right; color:#dc2626; font-weight:600;">- ${fmtINR(discountAmount)}</td>
        </tr>`;
    }
    financialHTML += `
        <tr style="border-top:2px solid #1e293b;">
            <td style="padding:12px 0 4px; font-weight:800; font-size:1.05rem; color:#1e293b;">Total Paid</td>
            <td style="padding:12px 0 4px; text-align:right; font-weight:800; font-size:1.1rem; color:#059669;">${fmtINR(finalAmount)}</td>
        </tr>`;

    // Payment method row
    const methodCapitalized = paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1).toLowerCase();
    let paymentInfoHTML = '';
    if (totals.showPaymentMethod) {
        paymentInfoHTML += `
        <div style="margin-top:16px; padding:10px 14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.82rem; font-weight:600; color:#166534;">Payment Method</span>
            <span style="font-size:0.9rem; font-weight:700; color:#065f46;">${methodCapitalized}</span>
        </div>`;
    }
    if (paidAt !== '—') {
        paymentInfoHTML += `
        <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.78rem; color:#94a3b8;">Paid on</span>
            <span style="font-size:0.78rem; color:#64748b;">${paidAt}</span>
        </div>`;
    }

    // Footer
    let footerHTML = '';
    if (footer.showThankYou && footer.thankYouMessage) {
        footerHTML += `<p style="text-align:center; color:#64748b; font-size:0.82rem; margin:0 0 6px;">${footer.thankYouMessage}</p>`;
    }
    if (footer.showTerms && footer.termsText) {
        footerHTML += `<p style="text-align:center; color:#94a3b8; font-size:0.72rem; margin:0;">${footer.termsText}</p>`;
    }
    if (!footer.showThankYou && !footer.showTerms) {
        footerHTML = `<p style="text-align:center; color:#94a3b8; font-size:0.78rem; margin:0;">This is a computer-generated invoice.</p>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice — #${shortId}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background:#fff; color:#1e293b; padding:36px 32px; font-size:14px; max-width:680px; margin:0 auto; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:0.72rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; padding:8px 12px; text-align:left; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
  th:last-child, td:last-child { text-align:right; }
  td { border-bottom:1px solid #f1f5f9; font-size:0.88rem; }
  tr:last-child td { border-bottom:none; }
  @media print {
    @page { margin:18mm 14mm; }
    body { padding:0; }
    .no-print { display:none !important; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div style="margin-bottom:24px;">
  ${headerHTML}
</div>

<hr style="border:none; border-top:2px solid #1e293b; margin-bottom:20px;">

<!-- INVOICE META -->
<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; gap:16px; flex-wrap:wrap;">
  <div>
    ${metaHTML}
  </div>
  <div style="text-align:right;">
    <div style="font-size:0.7rem; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">Invoice</div>
    <div style="font-size:1.05rem; font-weight:800; color:#1e293b; font-family:monospace;">#${shortId}</div>
    ${booking.showAppointmentDate && bookingDate ? `<div style="font-size:0.8rem; color:#64748b; margin-top:4px;">${bookingDate}</div>` : ''}
    ${booking.showAppointmentTime && bookingTime ? `<div style="font-size:0.78rem; color:#94a3b8;">${bookingTime}</div>` : ''}
  </div>
</div>

<!-- SERVICES TABLE -->
<div style="margin-bottom:20px;">
  <table>
    <thead>
      <tr>
        <th>Service</th>
        <th>Staff</th>
        <th style="text-align:center;">Duration</th>
        <th>Price</th>
      </tr>
    </thead>
    <tbody>
      ${serviceRowsHTML}
    </tbody>
  </table>
</div>

<!-- FINANCIAL SUMMARY -->
<div style="margin-left:auto; max-width:260px;">
  <table>
    <tbody>
      ${financialHTML}
    </tbody>
  </table>
</div>

<!-- PAYMENT INFO -->
${paymentInfoHTML}

<hr style="border:none; border-top:1px dashed #cbd5e1; margin:24px 0 16px;">

<!-- FOOTER -->
<div>
  ${footerHTML}
</div>

<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;
}

// ─── Open Invoice Modal ──────────────────────────────────────────────────────

/**
 * Fetches live invoice data and populates the existing #viewBookingInvoiceModal DOM,
 * then opens the modal. Falls back to live-fetched data for all 5 fields.
 * @param {string} bookingId
 */
export async function openBookingInvoiceModal(bookingId) {
    // Show modal immediately with loading state
    const modal = document.getElementById('viewBookingInvoiceModal');
    if (modal) modal.classList.add('active');

    // Store current bookingId for the print button
    if (modal) modal.dataset.currentBookingId = bookingId;

    const shortId = '#' + String(bookingId || '').slice(0, 8).toUpperCase();

    // Set placeholder values immediately
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('vbiId', shortId);
    setEl('vbiCustomer', '…');
    setEl('vbiPhone', '…');
    setEl('vbiDate', '…');
    setEl('vbiTime', '…');
    setEl('vbiTotalAmount', '…');

    const servicesListEl = document.getElementById('vbiServicesList');
    if (servicesListEl) servicesListEl.innerHTML = '<p style="color:#94a3b8;padding:12px;">Loading…</p>';

    try {
        const data = await fetchBookingInvoiceData(bookingId);
        const { summary, lineItems, payment } = data;

        // Customer
        setEl('vbiCustomer', summary.customer_name || 'Walk-in Customer');
        setEl('vbiPhone', summary.customer_phone || '—');

        // Date & Time
        const vbiDate = document.getElementById('vbiDate');
        if (vbiDate) {
            try {
                const d = new Date(`${summary.booking_date}T00:00`);
                vbiDate.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            } catch { vbiDate.textContent = summary.booking_date || '—'; }
        }
        setEl('vbiTime', fmtTime12((summary.start_time || '').slice(0, 5)));

        // Status badge (keep existing helper if available)
        const vbiStatusBadge = document.getElementById('vbiStatusBadge');
        if (vbiStatusBadge) {
            const st = (summary.booking_status || 'completed').toLowerCase();
            const statusColors = {
                completed: { bg:'#d1fae5', color:'#065f46' },
                pending:   { bg:'#fef3c7', color:'#92400e' },
                cancelled: { bg:'#fee2e2', color:'#991b1b' },
                'no-show': { bg:'#fce7f3', color:'#9d174d' },
            };
            const sc = statusColors[st] || { bg:'#f1f5f9', color:'#475569' };
            vbiStatusBadge.innerHTML = `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;background:${sc.bg};color:${sc.color};">${st.charAt(0).toUpperCase() + st.slice(1)}</span>`;
        }

        // Payment badge
        const vbiPaymentBadge = document.getElementById('vbiPaymentBadge');
        if (vbiPaymentBadge) {
            const pay = (summary.payment_status || (payment ? 'paid' : 'pending')).toLowerCase();
            const payLabel = pay.charAt(0).toUpperCase() + pay.slice(1);
            const payColors = { paid:{color:'#059669',bg:'#d1fae5'}, pending:{color:'#b45309',bg:'#fef3c7'}, unpaid:{color:'#dc2626',bg:'#fee2e2'}, partial:{color:'#7c3aed',bg:'#ede9fe'} };
            const pc = payColors[pay] || { color:'#475569', bg:'#f1f5f9' };
            vbiPaymentBadge.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
        }

        // Services list (individual line items from app.bookings)
        if (servicesListEl) {
            let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                    <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
                </tr></thead><tbody>`;

            if (lineItems.length > 0) {
                lineItems.forEach(item => {
                    html += `<tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${item.service_name || item.package_id || 'Service'}</td>
                        <td style="padding:10px 12px;color:#64748b;">${item.staff_name || '—'}</td>
                        <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">${fmtINR(item.price || 0)}</td>
                    </tr>`;
                });
            } else {
                // Fallback to comma-separated names from summary
                const svcNames = String(summary.service_name || '').split(',').map(s => s.trim()).filter(Boolean);
                const stfNames = String(summary.staff_name || '').split(',').map(s => s.trim()).filter(Boolean);
                if (svcNames.length > 0) {
                    svcNames.forEach((svc, i) => {
                        html += `<tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                            <td style="padding:10px 12px;color:#64748b;">${stfNames[i] || stfNames[0] || '—'}</td>
                            <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">${fmtINR(summary.total_price || 0)}</td>
                        </tr>`;
                    });
                } else {
                    html += `<tr><td style="padding:10px 12px;font-weight:500;color:#1e293b;">Salon Service</td>
                        <td style="padding:10px 12px;color:#64748b;">—</td>
                        <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">${fmtINR(summary.total_price || 0)}</td></tr>`;
                }
            }
            html += '</tbody></table>';

            // Discount row (if any)
            const discountAmt = payment ? Number(payment.discount_amount || 0) : 0;
            const discountName = payment ? (payment.discount_name || '') : '';
            const finalAmount  = payment ? Number(payment.final_amount || 0) : Number(summary.total_price || 0);
            const originalAmount = Number(summary.total_price || summary.price || 0);

            if (discountAmt > 0 || (payment && finalAmount !== originalAmount)) {
                html += `<div style="margin-top:12px; padding:10px 12px; background:#fefce8; border:1px solid #fef08a; border-radius:6px; font-size:0.84rem;">`;
                if (discountAmt > 0) {
                    const discLabel = discountName ? `Discount: ${discountName}` : 'Discount Applied';
                    html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#92400e;">${discLabel}</span><span style="color:#dc2626;font-weight:700;">- ${fmtINR(discountAmt)}</span></div>`;
                }
                html += `<div style="display:flex;justify-content:space-between;border-top:1px solid #fde68a;padding-top:6px;margin-top:4px;"><span style="font-weight:700;color:#1e293b;">Total Paid</span><span style="font-weight:800;color:#059669;font-size:0.95rem;">${fmtINR(finalAmount)}</span></div>`;
                html += `</div>`;
            }

            // Payment method badge
            if (payment) {
                const method = (payment.payment_method || 'Cash').charAt(0).toUpperCase() + (payment.payment_method || 'cash').slice(1).toLowerCase();
                const paidAt = fmtDateTime(payment.paid_at || payment.created_at);
                html += `<div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
                    <span style="color:#166534;font-weight:600;">💳 ${method}</span>
                    <span style="color:#64748b;">${paidAt}</span>
                </div>`;
            }

            servicesListEl.innerHTML = html;
        }

        // Total (use final_amount if payment exists)
        const finalAmt = payment ? Number(payment.final_amount || 0) : Number(summary.total_price || summary.price || 0);
        setEl('vbiTotalAmount', fmtINR(finalAmt));

    } catch (err) {
        console.error('[InvoiceEngine] openBookingInvoiceModal error:', err);
        if (servicesListEl) {
            servicesListEl.innerHTML = '<p style="color:#ef4444;padding:12px;">Failed to load invoice data.</p>';
        }
    }
}

if (typeof window !== 'undefined') {
    window.openBookingInvoiceModal = openBookingInvoiceModal;
}

// ─── Print Invoice ───────────────────────────────────────────────────────────

/**
 * Fetches live invoice data, renders professional HTML, opens print window.
 * @param {string} bookingId
 */
export async function printBookingInvoice(bookingId) {
    if (!bookingId) {
        console.error('[InvoiceEngine] printBookingInvoice: bookingId is required');
        return;
    }
    try {
        const data = await fetchBookingInvoiceData(bookingId);
        const html = renderBookingInvoiceHTML(data);
        const win = window.open('', '_blank', 'width=760,height=720');
        if (!win) {
            alert('Please allow popups to print the invoice.');
            return;
        }
        win.document.write(html);
        win.document.close();
    } catch (err) {
        console.error('[InvoiceEngine] printBookingInvoice error:', err);
        alert('Failed to generate invoice: ' + (err.message || 'Unknown error'));
    }
}

if (typeof window !== 'undefined') {
    window.printBookingInvoice = printBookingInvoice;
}

