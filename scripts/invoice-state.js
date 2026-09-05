/**
 * ── invoice-state.js ────────────────────────────────────────────────────────
 * Unified Frontend State Manager and Live Preview Renderer for BharathBots Invoices.
 * (V1 Frontend Architecture - Cascades Common settings to Booking, POS, and Membership)
 * ────────────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'bharathbots_invoice_config';

export const DEFAULT_INVOICE_CONFIG = {
    // 4A. Invoice Numbering (Shared sequence for Bookings, POS, Memberships)
    prefix: 'INV-',
    startingNumber: '1001',

    // 4B. Common Header Content
    header: {
        showLogo: true,
        showLegalName: false,
        showDisplayName: true,
        showBranchName: true,
        showAddress: true,
        showPhone: true,
        showEmail: false,
        showWebsite: false,
        showGstin: true,
        showPan: false,
    },

    // 4C. Customer Information
    customer: {
        showName: true,
        showPhone: true,
        showEmail: false,
        showAddress: false,
    },

    // 4D. Common Transaction Information
    transaction: {
        showInvoiceNumber: true,
        showInvoiceDate: true,
        showPaymentDate: false,
        showBranchName: true,
        showStaffName: true,
        showPaymentMethod: true,
    },

    // 4E. Items / Services Table
    items: {
        showItemName: true,
        showQuantity: true,
        showStaff: false,
        showUnitPrice: true,
        showDiscount: true,
        showTax: true,
        showTaxRate: false,
        showLineTotal: true,
    },

    // 4F. Totals & Payment
    totals: {
        showSubtotal: true,
        showDiscount: true,
        showTax: true,
        showRoundoff: false,
        showTotal: true,
        showAmountPaid: true,
        showBalanceDue: true,
        showPaymentMethod: true,
        showTransactionRef: false,
    },

    // 4G. Common Footer
    footer: {
        showThankYou: true,
        thankYouMessage: 'Thank you for visiting us. We look forward to seeing you again!',
        showTerms: false,
        termsText: 'Payment is due upon receipt. Goods/Services once sold are non-refundable.',
        showCancellationPolicy: false,
        cancellationPolicyText: 'Cancellations within 24 hours of appointment may incur a fee.',
        showPaymentInstructions: false,
        paymentInstructionsText: 'UPI ID: glowsalon@upi | Bank: HDFC Bank A/C 50200012345678',
        showContactInfo: true,
        showSocialMedia: false,
        socialHandle: '@glowsalon_official',
        customFooterMessage: '',
    },

    // 5. Booking-Specific Settings
    booking: {
        showAppointmentNumber: true,
        showAppointmentDate: true,
        showAppointmentTime: true,
        showServiceName: true,
        showServiceDuration: true,
        showStylistName: true,
        showBranchName: true,
        showBookingNotes: false,
        bookingNotesText: 'Please arrive 10 minutes prior to appointment time.',
    },

    // 6. POS-Specific Settings
    pos: {
        showProductName: true,
        showSku: true,
        showQuantity: true,
        showUnitPrice: true,
        showDiscount: true,
        showTax: true,
        showCashierStaff: true,
        showPosTransactionNo: true,
        showPaymentRef: false,
    },

    // 7. Membership-Specific Settings
    membership: {
        showMembershipName: true,
        showPlan: true,
        showStartDate: true,
        showExpiryDate: true,
        showDuration: true,
        showPrice: true,
        showDiscount: true,
        showBenefits: true,
        showMembershipRef: true,
    }
};

// ── Load & Save Helpers ──────────────────────────────────────────────────────
export function getInvoiceConfig() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG));
        const parsed = JSON.parse(stored);
        return deepMerge(JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG)), parsed);
    } catch (e) {
        console.warn('[invoice-state] Error reading invoice config:', e);
        return JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG));
    }
}

export function saveInvoiceConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return true;
    } catch (e) {
        console.error('[invoice-state] Error saving invoice config:', e);
        return false;
    }
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

// ── Realistic Sample Data ───────────────────────────────────────────────────
export const SAMPLE_COMPANY = {
    brandName: 'GLOW SALON',
    legalName: 'Glow Salon & Wellness Pvt Ltd',
    branchName: 'Downtown Flagship Branch',
    address: '#42, 100ft Road, Indiranagar, Bengaluru, KA 560038',
    phone: '+91 98765 43210',
    email: 'billing@glowsalon.com',
    website: 'www.glowsalon.com',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
};

export const SAMPLE_CUSTOMER = {
    name: 'Priya Sharma',
    phone: '9876543210',
    email: 'priya.sharma@example.com',
    address: 'Flat 4B, Palm Grove Apts, Bengaluru',
};

// ── Live HTML Preview Generator ─────────────────────────────────────────────
export function generateInvoiceHTML(type = 'common', config = null) {
    const cfg = config || getInvoiceConfig();
    const prefix = cfg.prefix || 'INV-';
    const startNum = parseInt(cfg.startingNumber, 10) || 1001;

    let invoiceNum = `${prefix}00${startNum}`;
    let invoiceDate = '05-09-2026';
    let paymentMethod = 'UPI';

    if (type === 'booking') invoiceNum = `${prefix}00${startNum}`;
    if (type === 'pos') {
        invoiceNum = `${prefix}00${startNum + 1}`;
        paymentMethod = 'Cash';
    }
    if (type === 'membership') {
        invoiceNum = `${prefix}00${startNum + 2}`;
        paymentMethod = 'UPI';
    }

    // 1. Header Section
    let headerHTML = `
        <div class="inv-header">
            <div class="inv-brand-row">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${cfg.header.showLogo ? `<div class="inv-logo-box">GS</div>` : ''}
                    <div>
                        ${cfg.header.showDisplayName ? `<h3 class="inv-brand-name">${SAMPLE_COMPANY.brandName}</h3>` : ''}
                        ${cfg.header.showLegalName ? `<div class="inv-legal-name">${SAMPLE_COMPANY.legalName}</div>` : ''}
                        ${cfg.header.showBranchName ? `<div style="font-size:0.75rem;color:#64748b;">${SAMPLE_COMPANY.branchName}</div>` : ''}
                    </div>
                </div>
                <div class="inv-meta-right">
                    <div class="inv-title">Tax Invoice</div>
                    ${cfg.transaction.showInvoiceNumber ? `<div class="inv-number">${invoiceNum}</div>` : ''}
                    ${cfg.transaction.showInvoiceDate ? `<div class="inv-date">${invoiceDate}</div>` : ''}
                    ${cfg.transaction.showPaymentDate ? `<div style="font-size:0.7rem;color:#94a3b8;">Paid: ${invoiceDate}</div>` : ''}
                </div>
            </div>

            <div class="inv-business-info">
                ${cfg.header.showAddress ? `<div>${SAMPLE_COMPANY.address}</div>` : ''}
                <div>
                    ${cfg.header.showPhone ? `<span>Ph: ${SAMPLE_COMPANY.phone}</span>` : ''}
                    ${cfg.header.showPhone && cfg.header.showEmail ? ` &bull; ` : ''}
                    ${cfg.header.showEmail ? `<span>Email: ${SAMPLE_COMPANY.email}</span>` : ''}
                    ${cfg.header.showWebsite ? ` &bull; <span>${SAMPLE_COMPANY.website}</span>` : ''}
                </div>
                <div class="inv-tax-ids">
                    ${cfg.header.showGstin ? `<span><strong>GSTIN:</strong> ${SAMPLE_COMPANY.gstin}</span>` : ''}
                    ${cfg.header.showPan ? `<span><strong>PAN:</strong> ${SAMPLE_COMPANY.pan}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    // 2. Customer Section
    let hasCustomerInfo = cfg.customer.showName || cfg.customer.showPhone || cfg.customer.showEmail || cfg.customer.showAddress;
    let customerHTML = '';
    if (hasCustomerInfo) {
        customerHTML = `
            <div class="inv-section-box">
                <div class="inv-section-title">Billed To:</div>
                ${cfg.customer.showName ? `<div class="inv-customer-name">${SAMPLE_CUSTOMER.name}</div>` : ''}
                ${cfg.customer.showPhone ? `<div class="inv-customer-detail">Phone: ${SAMPLE_CUSTOMER.phone}</div>` : ''}
                ${cfg.customer.showEmail ? `<div class="inv-customer-detail">Email: ${SAMPLE_CUSTOMER.email}</div>` : ''}
                ${cfg.customer.showAddress ? `<div class="inv-customer-detail">${SAMPLE_CUSTOMER.address}</div>` : ''}
            </div>
        `;
    }

    // 3. Source-Specific Header Add-ons
    let sourceMetaHTML = '';
    if (type === 'booking') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#eff6ff;border-color:#dbeafe;">
                <div class="inv-section-title" style="color:#1e40af;">Appointment Details</div>
                <div class="inv-booking-badge-grid">
                    ${cfg.booking.showAppointmentDate ? `<div><span class="inv-spec-label">Date: </span><span class="inv-spec-value">05 Sep 2026</span></div>` : ''}
                    ${cfg.booking.showAppointmentTime ? `<div><span class="inv-spec-label">Time: </span><span class="inv-spec-value">3:00 PM</span></div>` : ''}
                    ${cfg.booking.showStylistName ? `<div><span class="inv-spec-label">Stylist: </span><span class="inv-spec-value">Anita</span></div>` : ''}
                    ${cfg.booking.showAppointmentNumber ? `<div><span class="inv-spec-label">Booking ID: </span><span class="inv-spec-value">#BK-9021</span></div>` : ''}
                </div>
                ${cfg.booking.showBookingNotes ? `<div style="font-size:0.72rem;color:#64748b;margin-top:4px;"><strong>Note:</strong> ${cfg.booking.bookingNotesText || 'Arrive 10m prior.'}</div>` : ''}
            </div>
        `;
    } else if (type === 'pos') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#f0fdf4;border-color:#dcfce7;">
                <div class="inv-section-title" style="color:#166534;">POS Transaction Info</div>
                <div class="inv-booking-badge-grid">
                    ${cfg.pos.showCashierStaff ? `<div><span class="inv-spec-label">Cashier: </span><span class="inv-spec-value">Vikram (POS-01)</span></div>` : ''}
                    ${cfg.pos.showPosTransactionNo ? `<div><span class="inv-spec-label">Txn No: </span><span class="inv-spec-value">TXN-88219</span></div>` : ''}
                    ${cfg.pos.showPaymentRef ? `<div><span class="inv-spec-label">Ref ID: </span><span class="inv-spec-value">POS-REF-994</span></div>` : ''}
                </div>
            </div>
        `;
    } else if (type === 'membership') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#fdf4ff;border-color:#fae8ff;">
                <div class="inv-section-title" style="color:#86198f;">Membership Subscription</div>
                <div style="font-weight:700;color:#0f172a;font-size:0.85rem;">${cfg.membership.showMembershipName ? 'Gold Annual VIP Membership' : 'Membership'}</div>
                ${cfg.membership.showPlan ? `<div style="font-size:0.74rem;color:#701a75;">Tier: Gold Plan (15% Off all services & 1 free facial/month)</div>` : ''}
                <div class="inv-booking-badge-grid" style="margin-top:6px;">
                    ${cfg.membership.showDuration ? `<div><span class="inv-spec-label">Validity: </span><span class="inv-spec-value">1 Year</span></div>` : ''}
                    ${cfg.membership.showStartDate ? `<div><span class="inv-spec-label">Start Date: </span><span class="inv-spec-value">05-09-2026</span></div>` : ''}
                    ${cfg.membership.showExpiryDate ? `<div><span class="inv-spec-label">Expiry Date: </span><span class="inv-spec-value">04-09-2027</span></div>` : ''}
                    ${cfg.membership.showMembershipRef ? `<div><span class="inv-spec-label">Member ID: </span><span class="inv-spec-value">MBR-GOLD-2026</span></div>` : ''}
                </div>
            </div>
        `;
    }

    // 4. Items Table
    let tableHTML = '';
    if (type === 'booking') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Services</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Haircut (Wash & Blowdry)</div>
                            ${cfg.booking.showServiceDuration ? `<div class="inv-item-sub">Duration: 45 mins</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;500</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;90</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;500</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Hydra Glow Facial</div>
                            ${cfg.booking.showServiceDuration ? `<div class="inv-item-sub">Duration: 60 mins</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;1,000</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;180</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else if (type === 'pos') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Products</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Keratin Smooth Shampoo (250ml)</div>
                            ${cfg.pos.showSku ? `<div class="inv-item-sub">SKU: SHMP-KRT-01</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;800</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;144</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;800</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Argan Hair Serum (100ml)</div>
                            ${cfg.pos.showSku ? `<div class="inv-item-sub">SKU: SRM-ARG-02</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">2</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;500</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;180</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else if (type === 'membership') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Membership Plan</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Gold Annual VIP Membership</div>
                            <div class="inv-item-sub">1 Year All-Access &bull; Free Monthly Facial</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;5,000</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;900</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;5,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else {
        // Common sample table
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Item / Service</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Signature Hair Treatment</div>
                            <div class="inv-item-sub">Service ID: #SVC-102</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;1,200</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;216</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,200</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Argan Hair Oil (100ml)</div>
                            <div class="inv-item-sub">Product SKU: OIL-ARG-01</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;600</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;108</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;600</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    }

    // 5. Totals Calculations based on type
    let subtotal = 1800;
    let taxAmt = 324;
    let grandTotal = 2124;

    if (type === 'booking') {
        subtotal = 1500;
        taxAmt = 270;
        grandTotal = 1770;
    } else if (type === 'pos') {
        subtotal = 1800;
        taxAmt = 324;
        grandTotal = 2124;
    } else if (type === 'membership') {
        subtotal = 5000;
        taxAmt = 900;
        grandTotal = 5900;
    }

    let totalsHTML = `
        <div class="inv-totals-box">
            ${cfg.totals.showSubtotal ? `<div class="inv-total-row"><span>Subtotal:</span><span>&#8377;${subtotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showTax ? `<div class="inv-total-row"><span>GST (18%):</span><span>&#8377;${taxAmt.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showRoundoff ? `<div class="inv-total-row"><span>Round-off:</span><span>&#8377;0.00</span></div>` : ''}
            ${cfg.totals.showTotal ? `<div class="inv-total-row grand-total"><span>Total:</span><span>&#8377;${grandTotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showAmountPaid ? `<div class="inv-total-row" style="color:#16a34a;font-weight:600;"><span>Amount Paid:</span><span>&#8377;${grandTotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showBalanceDue ? `<div class="inv-total-row" style="color:#64748b;"><span>Balance Due:</span><span>&#8377;0</span></div>` : ''}
        </div>

        ${cfg.totals.showPaymentMethod ? `
            <div class="inv-payment-badge">
                <span>Payment Method: <strong>${paymentMethod}</strong></span>
                <span>Status: <strong>PAID</strong></span>
            </div>
        ` : ''}
    `;

    // 6. Footer Section
    let footerHTML = '';
    const hasFooter = cfg.footer.showThankYou || cfg.footer.showTerms || cfg.footer.showCancellationPolicy || cfg.footer.showPaymentInstructions || cfg.footer.customFooterMessage;
    if (hasFooter) {
        footerHTML = `
            <div class="inv-footer-area">
                ${cfg.footer.showThankYou ? `<div class="inv-thank-you">${cfg.footer.thankYouMessage || 'Thank you for visiting us!'}</div>` : ''}
                ${cfg.footer.customFooterMessage ? `<div style="font-weight:500;color:#475569;margin-bottom:4px;">${cfg.footer.customFooterMessage}</div>` : ''}
                ${cfg.footer.showPaymentInstructions ? `<div style="font-size:0.72rem;color:#64748b;margin-bottom:4px;">${cfg.footer.paymentInstructionsText}</div>` : ''}
                ${cfg.footer.showTerms ? `<div class="inv-footer-terms">${cfg.footer.termsText}</div>` : ''}
                ${cfg.footer.showCancellationPolicy ? `<div class="inv-footer-terms">${cfg.footer.cancellationPolicyText}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="invoice-paper">
            ${headerHTML}
            ${customerHTML}
            ${sourceMetaHTML}
            ${tableHTML}
            ${totalsHTML}
            ${footerHTML}
        </div>
    `;
}

// ── Render Function for Pages ───────────────────────────────────────────────
export function renderLiveInvoicePreview(type, containerId = 'invoicePreviewContainer', customConfig = null) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = generateInvoiceHTML(type, customConfig);
}
