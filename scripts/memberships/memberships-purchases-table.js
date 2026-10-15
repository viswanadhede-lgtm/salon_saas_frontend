// scripts/memberships/memberships-purchases-table.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPurchases,
    setCurrentPurchases
} from './memberships-state.js';
import { fetchPurchasesApi, markMembershipsExpiredApi } from './memberships-api.js';

// ── Purchases Workflow ─────────────────────────────────────────────────────

export async function loadPurchases(isBackground = false) {
    const tbody = document.querySelector('#purchasesTableContent tbody');
    if (!tbody) return;

    if (!isBackground) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding:32px; text-align:center; color:#64748b;">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                        <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                        <span style="font-size:0.9rem;">Loading membership purchases...</span>
                    </div>
                </td>
            </tr>`;
        if (window.feather) feather.replace();
    }

    try {
        const { data, error } = await fetchPurchasesApi(getCompanyId(), getBranchId());

        if (error) throw error;
        const purchases = data || [];

        // Check for expired memberships (expiry_date < today)
        const todayStr = new Date().toISOString().split('T')[0];
        const expiredPurchases = purchases.filter(p => p.expiry_date && p.expiry_date < todayStr && p.status === 'active');

        if (expiredPurchases.length > 0) {
            // 1. Update in-memory objects immediately so render shows State 2 (Expired)
            expiredPurchases.forEach(p => { p.status = 'expired'; });

            // 2. Persist status = 'expired' directly to the Supabase database table
            const expiredIds = expiredPurchases.map(p => p.purchase_id || p.id).filter(Boolean);
            markMembershipsExpiredApi(expiredIds).catch(err => {
                console.warn('Failed to sync expired memberships to DB:', err);
            });

            // 3. Notify marketing / event system
            if (window.notifyEvent) {
                window.notifyEvent('marketing', 'evt_marketing_membership_expired_renewed', {
                    title: 'Membership Expired',
                    message: `${expiredPurchases.length} membership(s) have expired.`
                });
            }
        }

        setCurrentPurchases(purchases);
        renderPurchases();
    } catch (err) {
        console.error('loadPurchases:', err);
        if (!isBackground) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership purchases: ${err.message || ''}</td></tr>`;
        }
    }
}

export function renderPurchases() {
    const tbody = document.querySelector('#purchasesTableContent tbody');
    if (!tbody) return;

    const currentPurchases = getCurrentPurchases();

    if (currentPurchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:#64748b;">No memberships assigned yet.</td></tr>`;
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tbody.innerHTML = currentPurchases.map(purchase => {
        const purchaseId = purchase.purchase_id || purchase.id;
        const isExpired = (purchase.status === 'active' && purchase.expiry_date && purchase.expiry_date < todayStr) || purchase.status === 'expired';

        // State Mapping:
        // State 1: Active + Paid     -> View + Cancel
        // State 2: Expired + Paid    -> View + Renew
        // State 3: Cancelled + Paid  -> View + Refund
        // State 4: Refunded + Refunded -> View + Info
        let state = 1;
        if (purchase.status === 'refunded') {
            state = 4;
        } else if (purchase.status === 'cancelled') {
            state = 3;
        } else if (isExpired) {
            state = 2;
        } else {
            state = 1;
        }

        let statusBadge = '';
        let paymentBadge = '';
        let secondActionButton = '';

        if (state === 1) {
            // State 1: Active + Paid
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#ecfdf5;color:#059669;border:1px solid #d1fae5;">Active</span>`;
            paymentBadge = `<span style="color:#059669;font-weight:700;font-size:0.85rem;">Paid</span>`;
            secondActionButton = `
                <button onclick="window.cancelMembershipPurchase('${purchaseId}')" title="Cancel" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #fecdd3;background:#fff1f2;cursor:pointer;color:#e11d48;transition:all 0.2s;" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    <span style="font-size:10px;font-weight:600;">Cancel</span>
                </button>
            `;
        } else if (state === 2) {
            // State 2: Expired + Paid
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">Expired</span>`;
            paymentBadge = `<span style="color:#059669;font-weight:700;font-size:0.85rem;">Paid</span>`;
            secondActionButton = `
                <button onclick="window.renewMembershipPurchase('${purchaseId}')" title="Renew" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #bbf7d0;background:#f0fdf4;cursor:pointer;color:#166534;transition:all 0.2s;" onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    <span style="font-size:10px;font-weight:600;">Renew</span>
                </button>
            `;
        } else if (state === 3) {
            // State 3: Cancelled + Paid
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#ef4444;border:1px solid #fecdd3;">Cancelled</span>`;
            paymentBadge = `<span style="color:#059669;font-weight:700;font-size:0.85rem;">Paid</span>`;
            secondActionButton = `
                <button onclick="window.refundMembershipPurchase('${purchaseId}')" title="Refund" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #fef08a;background:#fefce8;cursor:pointer;color:#b45309;transition:all 0.2s;" onmouseover="this.style.background='#fef9c3'" onmouseout="this.style.background='#fefce8'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.91"></path></svg>
                    <span style="font-size:10px;font-weight:600;">Refund</span>
                </button>
            `;
        } else {
            // State 4: Refunded + Refunded
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fffbeb;color:#d97706;border:1px solid #fef3c7;">Refunded</span>`;
            paymentBadge = `<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:9999px;font-size:0.75rem;font-weight:700;background:#fef3c7;color:#b45309;">Refunded</span>`;
            secondActionButton = `
                <button onclick="window.viewRefundInfo('${purchaseId}')" title="Info" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#64748b;transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    <span style="font-size:10px;font-weight:600;">Info</span>
                </button>
            `;
        }

        const fullName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown Customer';
        const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
        
        const formatDate = (d) => {
            if (!d) return '-';
            const dt = new Date(d);
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const year = dt.getFullYear();
            return `${day}-${month}-${year}`;
        };
        const purchaseDateStr = formatDate(purchase.purchase_date);
        const validUntilStr = formatDate(purchase.expiry_date);
        
        let basePrice = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
        let priceDisplay = '';
        if (purchase.discount_amount > 0 && purchase.final_amount != null) {
            priceDisplay = `<div style="display:flex; flex-direction:column; align-items:flex-start;">
                <span style="font-weight: 600; color: #059669;">₹${Number(purchase.final_amount).toLocaleString('en-IN')}</span>
                <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.75rem; margin-top: 1px;">${basePrice}</span>
            </div>`;
        } else {
            priceDisplay = `<span style="font-weight: 600; color: #059669;">${basePrice}</span>`;
        }

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #1e3a8a; font-weight: 700; font-size: 0.75rem; border: 1px solid #e2e8f0;">${initials}</div>
                        <div>
                            <span style="font-weight: 600; color: #1e3a8a; display: block;">${fullName}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-weight: 600; color: #475569;">${purchase.plan_name || purchase.membership_name || purchase.name || '-'}</span>
                </td>
                <td style="color: #64748b; font-size: 0.9rem;">${purchase.duration ? purchase.duration + ' Months' : '-'}</td>
                <td style="color: #64748b;">${purchaseDateStr}</td>
                <td style="color: #64748b;">${validUntilStr}</td>
                <td>
                    ${priceDisplay}
                </td>
                <td>${paymentBadge}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: stretch;">
                        <button class="action-btn" title="View" onclick="window.viewMembershipSummary('${purchaseId}')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span style="font-size:10px;font-weight:600;">View</span>
                        </button>
                        ${secondActionButton}
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}
