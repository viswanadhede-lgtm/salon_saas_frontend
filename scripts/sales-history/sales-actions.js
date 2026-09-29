// scripts/sales-history/sales-actions.js

import { salesState } from './sales-state.js';
import { showToast } from './sales-utils.js';

/**
 * Sale action routing, action menu dropdown, and invoice share actions.
 */

let registeredActionHandlers = {
    openSaleDetails: null,
    openCollectPaymentModal: null,
    openRefundModal: null
};

export function registerActionHandlers(handlers) {
    registeredActionHandlers = { ...registeredActionHandlers, ...handlers };
}

export function closeOpenActionMenu() {
    if (salesState.activeMenuEl) {
        salesState.activeMenuEl.remove();
        salesState.activeMenuEl = null;
    }
}

export function handleSaleAction(action, idx) {
    try {
        closeOpenActionMenu();
        const sale = salesState.currentSalesData[idx];
        if (!sale) return;
        salesState.currentActionData = { action, idx, sale };

        if (action === 'view') {
            if (registeredActionHandlers.openSaleDetails) {
                registeredActionHandlers.openSaleDetails(sale);
            }
        } else if (action === 'collect') {
            if (registeredActionHandlers.openCollectPaymentModal) {
                registeredActionHandlers.openCollectPaymentModal(sale);
            }
        } else if (action === 'refund') {
            if (registeredActionHandlers.openRefundModal) {
                registeredActionHandlers.openRefundModal(sale);
            }
        } else if (action === 'print') {
            showToast('Preparing receipt printer...', '#10b981');
            window.print();
        }
    } catch (err) {
        console.error('[Action Error]', err);
        showToast('Unable to process action. See console for details.', '#ef4444');
    }
}

export function toggleSaleMenu(e, idx) {
    e.stopPropagation();
    closeOpenActionMenu();

    const sale = salesState.currentSalesData[idx];
    if (!sale) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'tb-actions-menu';
    menu.id = 'tbActiveMenu';

    const isRefunded = sale.status === 'refunded';

    if (isRefunded) {
        menu.innerHTML = `
            <button class="tb-menu-item" onclick="handleSaleAction('view', ${idx})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                View Details
            </button>
        `;
    } else {
        menu.innerHTML = `
            <button class="tb-menu-item" onclick="handleSaleAction('view', ${idx})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                View Details
            </button>
            <button class="tb-menu-item" onclick="handleSaleAction('print', ${idx})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print Receipt
            </button>
            <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
            <button class="tb-menu-item danger" data-sub-feature="pos_issue_refund" onclick="handleSaleAction('refund', ${idx})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                Return Items
            </button>
        `;
    }

    document.body.appendChild(menu);
    salesState.activeMenuEl = menu;

    const menuH = isRefunded ? 46 : 130; 
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = window.innerHeight - menuH - 8;
    let left = rect.right - 192;
    if (left < 8) left = rect.left;

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

export function runSaleView(idx) {
    handleSaleAction('view', idx);
}

export function runSalePrint(idx) {
    handleSaleAction('print', idx);
}

export function runSaleRefund(idx) {
    handleSaleAction('refund', idx);
}

export function triggerShare(method) {
    const currentActionData = salesState.currentActionData;
    if (!currentActionData || !currentActionData.sale) return;
    const s = currentActionData.sale;
    const title = `Invoice - ${String(s.id).substring(0,8).toUpperCase()}`;
    const text = `Here is your Invoice: ${String(s.id).substring(0,8).toUpperCase()}\nDate: ${s.date}\nCustomer: ${s.customer || 'Walk-in'}\nTotal: ₹${Number(s.totalAmountNum || 0).toLocaleString('en-IN')}\n\nThank you for choosing us!`;
    const encodedText = encodeURIComponent(text);

    if (method === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
    } else if (method === 'mail') {
        window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}`, '_self');
    } else if (method === 'copy') {
        const temp = document.createElement("textarea");
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        try {
            document.execCommand("copy");
            if (window.hsShowToast) window.hsShowToast("Invoice copied!", "#10b981");
            else alert("Invoice copied!");
        } catch(e) {
            alert("Could not copy text.");
        }
        document.body.removeChild(temp);
    }
}
