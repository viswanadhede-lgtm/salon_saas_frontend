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
        return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
    };

    const fullName = purchase.customer_name || `${purchase.first_name||''} ${purchase.last_name||''}`.trim() || 'Unknown Customer';
    const initials = fullName.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase();
    const phone = purchase.customer_phone || purchase.phone_number || '';

    // Status badge
    const statusMap = {
        active:    { label:'Active',    bg:'#ecfdf5', color:'#059669' },
        cancelled: { label:'Cancelled', bg:'#fef2f2', color:'#ef4444' },
        refunded:  { label:'Refunded',  bg:'#fffbeb', color:'#d97706' },
    };
    const st = statusMap[purchase.status] || { label:'Expired', bg:'#f1f5f9', color:'#64748b' };
    const statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${st.bg};color:${st.color};">${st.label}</span>`;

    // Discount from matching plan
    const planRecord = currentPlans.find(p => (p.membership_id || p.id) === purchase.membership_id);
    let discountText = '—';
    if (planRecord) {
        const val = planRecord.discount_value || 0;
        discountText = planRecord.discount_type === 'flat' ? `₹${val} OFF` : `${val}% OFF`;
    }

    // Applicable services
    const services = planRecord?.applicable_services || [];
    const chipStyle = 'display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:500;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;';
    const servicesHtml = services.length === 0
        ? `<span style="color:#94a3b8;font-size:0.85rem;">All services included</span>`
        : services.map(s => `<span style="${chipStyle}">${s.service_name}</span>`).join('');

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
    if (statusBadgeElem) statusBadgeElem.innerHTML = statusBadgeHtml;
    if (planNameElem) planNameElem.textContent = purchase.plan_name || purchase.membership_name || purchase.name || '—';
    if (priceElem) priceElem.textContent = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
    if (durElem) durElem.textContent = durationText;
    if (discElem) discElem.textContent = discountText;
    if (pDateElem) pDateElem.textContent = formatDate(purchase.purchase_date);
    if (expDateElem) expDateElem.textContent = formatDate(purchase.expiry_date);
    if (svcElem) svcElem.innerHTML = servicesHtml;

    // Notes
    const notes = purchase.notes || purchase.note || '';
    const notesSection = document.getElementById('msmNotesSection');
    const notesElem = document.getElementById('msmNotes');
    if (notesSection && notesElem) {
        if (notes) {
            notesElem.textContent = notes;
            notesSection.style.display = 'block';
        } else {
            notesSection.style.display = 'none';
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
