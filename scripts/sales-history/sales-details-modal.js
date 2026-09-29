// scripts/sales-history/sales-details-modal.js

import { salesState } from './sales-state.js';
import { fetchSaleLineItemsOrdered } from './sales-api.js';

/**
 * Sale Details modal drawer, item list rendering, and calculations.
 */

let onRefundTriggered = null;

export function setDetailsRefundHandler(handler) {
    onRefundTriggered = handler;
}

export function closeSaleModal() {
    const saleDetailsModalOverlay = document.getElementById('saleDetailsModalOverlay');
    if (saleDetailsModalOverlay) saleDetailsModalOverlay.classList.remove('active');
    salesState.currentActionData = null;
}

export async function openSaleDetails(sale) {
    try {
        if (!sale) return;
        salesState.currentActionData = { action: 'view', idx: salesState.currentSalesData.indexOf(sale), sale };

        const sdSubtitle = document.getElementById('sdSubtitle');
        const sdCustomer = document.getElementById('sdCustomer');
        const sdStaff = document.getElementById('sdStaff');
        const sdDate = document.getElementById('sdDate');
        const sdPayment = document.getElementById('sdPayment');
        const sdItemCountEl = document.getElementById('sdItemCount');
        const sdItemsList = document.getElementById('sdItemsList');
        const sdSubtotal = document.getElementById('sdSubtotal');
        const sdTax = document.getElementById('sdTax');
        const sdDiscount = document.getElementById('sdDiscount');
        const sdTotal = document.getElementById('sdTotal');
        const sdRefundBtn = document.getElementById('sdRefundBtn');
        const saleDetailsModalOverlay = document.getElementById('saleDetailsModalOverlay');

        if (sdSubtitle && sale.id) sdSubtitle.textContent = `Transaction ID: ${String(sale.id).substring(0,8).toUpperCase()}`;
        if (sdCustomer) sdCustomer.textContent = sale.customer || '-';
        if (sdStaff) sdStaff.textContent = sale.staff || '-';
        if (sdDate) sdDate.textContent = sale.date || '-';
        if (sdPayment && sale.payment_status) {
            const st = String(sale.payment_status).toUpperCase();
            let badgeColor = '#92400e'; let bg = '#fef3c7'; // default pending
            if (st === 'PAID') { badgeColor = '#065f46'; bg = '#d1fae5'; }
            else if (st === 'UNPAID') { badgeColor = '#991b1b'; bg = '#fee2e2'; }
            
            sdPayment.innerHTML = `<span style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; letter-spacing:0.3px; color:${badgeColor}; background:${bg};">${st}</span>`;
        } else if (sdPayment) {
            sdPayment.textContent = '-';
        }

        if (sdItemCountEl) sdItemCountEl.textContent = sale.item_count || 1;

        if (sdItemsList) {
            sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">Loading items...</td></tr>`;
        }
        
        if (saleDetailsModalOverlay) saleDetailsModalOverlay.classList.add('active');
        if (typeof feather !== 'undefined') feather.replace();

        // Fetch actual line items from 'sales' table for this sale_id
        const { data: items, error } = await fetchSaleLineItemsOrdered(sale.id);

        if (error) throw error;

        if (sdItemsList) {
            sdItemsList.innerHTML = '';
            let subtotal = 0;
            let rowsHTML = '';

            (items || []).forEach((item, index) => {
                const lineTotal = Number(item.total_amount || 0);
                const qty = Number(item.quantity || 1);
                const isRefunded = (item.status === 'refunded');
                subtotal += isRefunded ? 0 : lineTotal; 

                let calculatedPrice = 0;
                if (qty > 0) calculatedPrice = lineTotal / qty;

                const rowBg = isRefunded ? 'background: #f8fafc; opacity: 0.7;' : '';
                const strike = isRefunded ? 'text-decoration: line-through;' : '';
                const badge = isRefunded ? '<span style="color:#dc2626; font-size:0.7rem; font-weight:600; margin-left:8px; text-transform:uppercase;">Returned</span>' : '';
                
                const isLast = (index === items.length - 1);
                const tdBorder = isLast ? '' : 'border-bottom: 1px solid #e2e8f0;';

                rowsHTML += `
                    <tr style="${rowBg}">
                        <td style="padding:12px 16px; font-size:0.875rem; color:#334155; ${tdBorder} ${strike}">
                            ${item.product_name || 'Product'} ${badge}
                        </td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:center; ${tdBorder}">${qty}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:right; ${tdBorder}">₹${calculatedPrice.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#1e293b; font-weight:600; text-align:right; ${tdBorder} ${strike}">₹${lineTotal.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
                    </tr>
                `;
            });
            
            sdItemsList.innerHTML = rowsHTML;

            if (sdSubtotal) sdSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
            if (sdTax)      sdTax.textContent      = `₹${0}`;

            // --- Discount row ---
            const saleDiscount = sale.discount_amount || 0;
            if (sdDiscount) {
                if (saleDiscount > 0) {
                    let discountLabel = 'Discount';
                    if (sale.discount_name) {
                        const typeIcon = sale.discount_type === 'coupon' ? '🏷️' : sale.discount_type === 'membership' ? '💳' : '';
                        discountLabel = `${typeIcon} ${sale.discount_name}`.trim();
                    }
                    const discountLabelEl = document.getElementById('sdDiscountLabel');
                    if (discountLabelEl) discountLabelEl.textContent = discountLabel;
                    sdDiscount.textContent = `-₹${saleDiscount.toLocaleString('en-IN')}`;
                    sdDiscount.style.color = '#16a34a'; // green
                } else {
                    const discountLabelEl = document.getElementById('sdDiscountLabel');
                    if (discountLabelEl) discountLabelEl.textContent = 'Discount';
                    sdDiscount.textContent = `₹0`;
                    sdDiscount.style.color = '#16a34a';
                }
            }

            // Final total = final_amount stored on consolidated row
            const finalTotal = sale.totalAmountNum || subtotal;
            if (sdTotal) sdTotal.textContent = `₹${finalTotal.toLocaleString('en-IN')}`;
        }

        if (sdRefundBtn) {
            const allRefunded = items && items.length > 0 && items.every(i => i.status === 'refunded');
            sdRefundBtn.style.display = allRefunded ? 'none' : 'inline-flex';
        }

    } catch (err) {
        console.error('Error fetching sale details:', err);
        const sdItemsList = document.getElementById('sdItemsList');
        if (sdItemsList) sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Failed to load items.</td></tr>`;
    }
}

export function setupSaleDetailsEventListeners() {
    const saleDetailsModalOverlay = document.getElementById('saleDetailsModalOverlay');
    const closeSaleDetailsModal = document.getElementById('closeSaleDetailsModal');
    const closeSaleDetailsBtn = document.getElementById('closeSaleDetailsBtn');
    const sdPrintBtn = document.getElementById('sdPrintBtn');
    const sdRefundBtn = document.getElementById('sdRefundBtn');

    if (closeSaleDetailsModal) closeSaleDetailsModal.addEventListener('click', closeSaleModal);
    if (closeSaleDetailsBtn) closeSaleDetailsBtn.addEventListener('click', closeSaleModal);
    if (saleDetailsModalOverlay) {
        saleDetailsModalOverlay.addEventListener('click', (e) => {
            if (e.target === saleDetailsModalOverlay) closeSaleModal();
        });
    }

    if (sdPrintBtn) {
        sdPrintBtn.addEventListener('click', () => {
            window.print();
        });
    }

    if (sdRefundBtn) {
        const refundSummaryOverlay = document.getElementById('refundSummaryOverlay');
        sdRefundBtn.addEventListener('click', () => {
            if (salesState.currentActionData && salesState.currentActionData.sale) {
                if (typeof onRefundTriggered === 'function') {
                    onRefundTriggered(salesState.currentActionData.sale);
                }
            } else if (refundSummaryOverlay) {
                refundSummaryOverlay.classList.add('active');
            }
        });
    }
}
