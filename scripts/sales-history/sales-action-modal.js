// scripts/sales-history/sales-action-modal.js

/**
 * Sale Action Picker Modal
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the two icon buttons (Invoice + Refund) in the Actions column with
 * a single ℹ Info button. When clicked, a small centered popup opens with:
 *
 *  State: 'paid'      → 2 cards: [Invoice]  [Refund]
 *  State: 'partial'   → 3 cards: [Invoice]  [Refunded ₹X (read-only)]  [Refund]
 *  State: 'refunded'  → 2 cards: [Invoice]  [Refunded ₹X (read-only)]
 *
 * Data sources:
 *  - Summary header  : in-memory sale object (from salesState)
 *  - Refunded card   : sales table, fetched lazily (status = 'refunded' rows)
 */

import { fetchSaleLineItems } from './sales-api.js';

let _onInvoice = null;
let _onRefund  = null;

/** Register what to do when the Invoice or Refund card is clicked */
export function registerActionPickerHandlers({ onInvoice, onRefund }) {
    _onInvoice = onInvoice;
    _onRefund  = onRefund;
}

// ─── Open ────────────────────────────────────────────────────────────────────

export async function openSaleActionPicker(sale) {
    if (!sale) return;

    const overlay  = document.getElementById('saleActionPickerOverlay');
    const grid     = document.getElementById('sapCardsGrid');
    const amountEl = document.getElementById('sapHeaderAmount');
    const custEl   = document.getElementById('sapHeaderCustomer');

    if (!overlay || !grid) return;

    // Populate summary header
    if (amountEl) amountEl.textContent = `${sale.total} received`;
    if (custEl)   custEl.textContent   = `from ${sale.customer || 'Walk-in'}`;

    // Show overlay
    overlay.style.display = 'flex';

    // Render cards based on payment status
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;font-size:0.82rem;padding:8px 0;">Loading...</div>';

    const status = (sale.payment_status || 'paid').toLowerCase();

    // In append-only architecture, fetch lines to check for refund records
    let refundedItems = [];
    let isFullyRefunded = status === 'refunded';
    try {
        const { data } = await fetchSaleLineItems(sale.id);
        const lines = data || [];
        const originalLines = lines.filter(i => !i.refund_reference_id && i.status !== 'refunded');
        refundedItems = lines.filter(i => Boolean(i.refund_reference_id) || i.status === 'refunded');

        const totalSoldQty = originalLines.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
        const totalRefundedQty = refundedItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

        if (totalSoldQty > 0 && totalRefundedQty >= totalSoldQty) {
            isFullyRefunded = true;
        }
    } catch (_) {}

    // Build cards
    grid.innerHTML = '';

    // ── Card 1: Invoice (always shown) ──────────────────────────────
    grid.appendChild(_buildCard({
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        iconBg: '#ede9fe',
        title: 'Invoice',
        subtitle: 'View receipt',
        active: true,
        onClick: () => {
            closeSaleActionPicker();
            if (_onInvoice) _onInvoice(sale);
        }
    }));

    // ── Card 2: Refunded read-only (partial or refunded states) ─────
    if (refundedItems.length > 0 || status === 'refunded' || status === 'partial') {
        const refundTotal = refundedItems.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
        const refundDisplayTotal = refundTotal > 0 ? refundTotal : Number(sale.amount_paid || sale.subtotal_price || 0);
        const refundTotalFmt = `₹${refundDisplayTotal.toLocaleString('en-IN')}`;

        // Build item summary lines
        const itemLines = refundedItems.map(i =>
            `<div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#64748b;margin-top:4px;">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:68%;">${i.product_name || 'Product'}</span>
                <span style="font-weight:600;color:#dc2626;flex-shrink:0;">×${i.quantity || 1}</span>
             </div>`
        ).join('');

        const refundedCard = _buildCard({
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
            iconBg: '#dcfce7',
            title: `Refunded ${refundTotalFmt}`,
            subtitle: 'Payment returned',
            active: false,
            extraHtml: itemLines
        });
        grid.appendChild(refundedCard);
    }

    // ── Card 3: Refund action (only if not fully refunded and not a refund row) ───
    if (!isFullyRefunded && status !== 'refunded' && !sale.refund_reference_id) {
        grid.appendChild(_buildCard({
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
            iconBg: '#fee2e2',
            title: 'Refund',
            subtitle: 'Return items',
            active: true,
            onClick: () => {
                closeSaleActionPicker();
                if (_onRefund) _onRefund(sale);
            }
        }));
    }

    // If 3 cards, switch to 3-column grid
    const cardCount = grid.children.length;
    grid.style.gridTemplateColumns = cardCount >= 3 ? '1fr 1fr 1fr' : '1fr 1fr';
}

// ─── Close ───────────────────────────────────────────────────────────────────

export function closeSaleActionPicker() {
    const overlay = document.getElementById('saleActionPickerOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── Setup event listeners (called once at page init) ─────────────────────

export function setupActionPickerListeners() {
    const overlay  = document.getElementById('saleActionPickerOverlay');
    const closeBtn = document.getElementById('saleActionPickerClose');
    const exitBtn  = document.getElementById('saleActionPickerExit');

    if (closeBtn) closeBtn.addEventListener('click', closeSaleActionPicker);
    if (exitBtn)  exitBtn.addEventListener('click', closeSaleActionPicker);
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSaleActionPicker();
        });
    }
}

// ─── Card builder ─────────────────────────────────────────────────────────

function _buildCard({ icon, iconBg, title, subtitle, active, onClick, extraHtml = '' }) {
    const card = document.createElement('div');

    const baseStyle = `
        border-radius:12px;
        padding:14px 12px;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:8px;
        text-align:center;
        transition:all 0.15s;
        border:1px solid;
        box-sizing:border-box;
    `;

    if (active) {
        card.style.cssText = baseStyle + `
            background:#fff;
            border-color:#e2e8f0;
            cursor:pointer;
        `;
        card.onmouseover = () => { card.style.background = '#f8fafc'; card.style.borderColor = '#cbd5e1'; card.style.transform = 'translateY(-1px)'; };
        card.onmouseout  = () => { card.style.background = '#fff';    card.style.borderColor = '#e2e8f0'; card.style.transform = 'none'; };
        if (onClick) card.addEventListener('click', onClick);
    } else {
        // Read-only card
        card.style.cssText = baseStyle + `
            background:#f8fafc;
            border-color:#e2e8f0;
            cursor:default;
        `;
    }

    card.innerHTML = `
        <div style="width:44px;height:44px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${icon}
        </div>
        <div>
            <div style="font-size:0.82rem;font-weight:700;color:#1e293b;line-height:1.2;">${title}</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-top:2px;">${subtitle}</div>
            ${extraHtml}
        </div>
    `;

    return card;
}
