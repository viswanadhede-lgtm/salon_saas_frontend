// scripts/memberships/memberships-summary-modal.js
import { getCurrentPurchases, getCurrentPlans } from './memberships-state.js';

// ── View Membership Summary Modal ─────────────────────────────────────────
export function viewMembershipSummary(purchaseId) {
    const currentPurchases = getCurrentPurchases();
    const currentPlans = getCurrentPlans();
    const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) return;

    const formatDate = (d) => {
        if (!d) return '—';
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
    };

    const fullName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown Customer';
    const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    const phone = purchase.customer_phone || purchase.phone_number || '';

    // Status and Payment badges
    const todayStr = new Date().toISOString().split('T')[0];
    const isExpired = (purchase.status === 'active' && purchase.expiry_date && purchase.expiry_date < todayStr) || purchase.status === 'expired';

    let statusBadgeHtml = '';
    if (purchase.status === 'refunded') {
        statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#fffbeb;color:#d97706;border:1px solid #fef3c7;">Refunded</span>`;
    } else if (purchase.status === 'cancelled') {
        statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#fef2f2;color:#ef4444;border:1px solid #fecdd3;">Cancelled</span>`;
    } else if (isExpired) {
        statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">Expired</span>`;
    } else {
        statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#ecfdf5;color:#059669;border:1px solid #d1fae5;">Active</span>`;
    }

    const isRefundedPayment = (purchase.payment_status || '').toLowerCase() === 'refunded' || purchase.status === 'refunded';
    const paymentBadgeHtml = isRefundedPayment
        ? `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#fef2f2;color:#dc2626;border:1px solid #fecdd3;">Refunded</span>`
        : `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #dbeafe;">Paid</span>`;

    // Discount from matching plan
    const planRecord = currentPlans.find(p => (p.membership_id || p.id) === purchase.membership_id);
    let discountText = '—';
    if (planRecord) {
        const val = planRecord.discount_value || 0;
        discountText = planRecord.discount_type === 'flat' ? `₹${val} OFF` : `${val}% OFF`;
    }

    // Applicable To (Services, Products, Memberships)
    const chipBase = 'display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:500;';
    const pills = [];
    if (planRecord?.all_services) pills.push(`<span style="${chipBase}background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">Services</span>`);
    if (planRecord?.all_products) pills.push(`<span style="${chipBase}background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">Products</span>`);
    if (planRecord?.all_memberships) pills.push(`<span style="${chipBase}background:#faf5ff;color:#7c3aed;border:1px solid #e9d5ff;">Memberships</span>`);
    const servicesHtml = pills.length > 0 ? pills.join(' ') : `<span style="color:#94a3b8;font-size:0.85rem;">—</span>`;

    // Duration
    const dur = purchase.duration || planRecord?.duration_months || planRecord?.duration || 0;
    const durationText = dur ? `${dur} Month${dur > 1 ? 's' : ''}` : '—';

    // Populate DOM
    const initialsElem = document.getElementById('msmInitialsCircle');
    const custNameElem = document.getElementById('msmCustomerName');
    const custPhoneElem = document.getElementById('msmCustomerPhone');
    const statusBadgeElem = document.getElementById('msmStatusBadge');
    const planNameElem = document.getElementById('msmPlanName');
    const priceElem = document.getElementById('msmPrice');
    const durElem = document.getElementById('msmDuration');
    const discElem = document.getElementById('msmDiscount');
    const pDateElem = document.getElementById('msmPurchaseDate');
    const expDateElem = document.getElementById('msmExpiryDate');
    const svcElem = document.getElementById('msmServices');

    if (initialsElem) initialsElem.textContent = initials;
    if (custNameElem) custNameElem.textContent = fullName;
    if (custPhoneElem) custPhoneElem.textContent = phone ? `📞 ${phone}` : '';
    if (statusBadgeElem) {
        statusBadgeElem.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">${statusBadgeHtml} ${paymentBadgeHtml}</div>`;
    }
    if (planNameElem) planNameElem.textContent = purchase.plan_name || purchase.membership_name || purchase.name || '—';
    if (priceElem) priceElem.textContent = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
    if (durElem) durElem.textContent = durationText;
    if (discElem) discElem.textContent = discountText;
    if (pDateElem) pDateElem.textContent = formatDate(purchase.purchase_date);
    if (expDateElem) expDateElem.textContent = formatDate(purchase.expiry_date);
    if (svcElem) svcElem.innerHTML = servicesHtml;

    // Notes and Cancellation Reason Section
    const notesSection = document.getElementById('msmNotesSection');
    const notesTitleElem = document.getElementById('msmNotesTitle');
    const notesElem = document.getElementById('msmNotes');
    if (notesSection && notesElem) {
        if (purchase.status === 'cancelled') {
            notesSection.style.display = 'block';
            if (notesTitleElem) notesTitleElem.textContent = 'Cancellation Details & Notes';
            const cancelReason = purchase.notes || purchase.note || '';
            const cDateStr = purchase.cancelled_date ? formatDate(purchase.cancelled_date) : null;
            notesElem.innerHTML = `
                <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:10px 14px;margin-bottom:6px;">
                    <div style="font-size:0.72rem;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Reason for Cancellation</div>
                    <div style="font-size:0.875rem;color:#b91c1c;font-weight:500;white-space:pre-wrap;">${cancelReason ? cancelReason : '<span style="color:#94a3b8;font-style:italic;">No reason provided.</span>'}</div>
                </div>
                ${cDateStr ? `<div style="font-size:0.8rem;color:#64748b;margin-top:6px;">Cancelled on: <strong style="color:#334155;">${cDateStr}</strong></div>` : ''}
            `;
        } else if (purchase.status === 'refunded') {
            notesSection.style.display = 'block';
            if (notesTitleElem) notesTitleElem.textContent = 'Refund Details & Notes';
            const refundReason = purchase.notes || purchase.note || '';
            notesElem.innerHTML = `
                <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:10px 14px;">
                    <div style="font-size:0.72rem;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Refund Notes</div>
                    <div style="font-size:0.875rem;color:#92400e;font-weight:500;white-space:pre-wrap;">${refundReason ? refundReason : '<span style="color:#94a3b8;font-style:italic;">No refund notes recorded.</span>'}</div>
                </div>
            `;
        } else {
            const notes = purchase.notes || purchase.note || '';
            if (notes) {
                notesSection.style.display = 'block';
                if (notesTitleElem) notesTitleElem.textContent = 'Notes';
                notesElem.textContent = notes;
            } else {
                notesSection.style.display = 'none';
            }
        }
    }

    // Show overlay
    const overlay = document.getElementById('membershipSummaryOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Close on backdrop click
        overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
    }
}
