// scripts/sales-history/sales-refund.js

import { salesState, getCompanyId, getBranchId } from './sales-state.js';
import { 
    fetchCustomerById, 
    fetchOriginalTransaction, 
    fetchSaleLineItems, 
    fetchProductStock,
    buildSaleItemUpdatePromise,
    buildProductStockUpdatePromise,
    insertRefundLedger
} from './sales-api.js';
import { showToast } from './sales-utils.js';

/**
 * Refund and Item Return workflow.
 * Manages item selection, quantity adjustments, stock restock, and refund ledger updates.
 */

let onRefundCompletedCallback = null;

export function registerRefundCompleteCallback(fn) {
    onRefundCompletedCallback = fn;
}

export function closeRefundModal() {
    const refundSummaryOverlay = document.getElementById('refundSummaryOverlay');
    if (refundSummaryOverlay) refundSummaryOverlay.classList.remove('active');
}

export async function openRefundModal(sale) {
    if (!sale) return;
    const modal = document.getElementById('refundSummaryOverlay');
    if (!modal) return;
    
    salesState.currentActionData = { action: 'refund', sale };
    modal.classList.add('active');

    // 1. Customer Details Card
    const custNameEl = document.getElementById('rfCustomerName');
    const custPhoneEl = document.getElementById('rfCustomerPhone');
    const custEmailEl = document.getElementById('rfCustomerEmail');
    const custAvatarEl = document.getElementById('rfCustomerAvatar');
    const viewProfBtn = document.getElementById('rfCustomerViewProfileBtn');

    let custName = sale.customer || 'Walk-in';
    let custPhone = sale.customer_phone || '—';
    let custEmail = sale.customer_email || '—';

    if (custNameEl) custNameEl.textContent = custName;
    if (custPhoneEl) custPhoneEl.textContent = custPhone;
    if (custEmailEl) custEmailEl.textContent = custEmail;

    const initials = (custName || 'CU').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
    if (custAvatarEl) custAvatarEl.textContent = initials;

    if (viewProfBtn) {
        if (sale.customer_id) {
            viewProfBtn.style.display = 'inline-flex';
            viewProfBtn.onclick = async (e) => {
                e.preventDefault();
                if (!window.viewCustomerProfile) {
                    try { await import('../global-customer-profile-modal.js'); } catch(e) {}
                }
                if (window.viewCustomerProfile) {
                    window.viewCustomerProfile(sale.customer_id, custName);
                }
            };
        } else {
            viewProfBtn.style.display = 'none';
        }
    }

    // 2. Sale Details Card
    const saleBadge = document.getElementById('rfSaleBadge');
    const saleDateEl = document.getElementById('rfSaleDate');
    const cashierEl = document.getElementById('rfCashier');

    const shortId = sale.id ? String(sale.id).slice(0, 8).toUpperCase() : '—';
    if (saleBadge) saleBadge.textContent = `#${shortId}`;
    if (saleDateEl) saleDateEl.textContent = sale.date || '—';
    if (cashierEl) cashierEl.textContent = sale.staff || 'System';

    // 3. Products in this Sale Card
    const itemsCountBadge = document.getElementById('rfItemsCountBadge');
    const productList = document.getElementById('rfProductList');
    if (itemsCountBadge) itemsCountBadge.textContent = 'Loading...';
    if (productList) productList.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">Loading items...</div>`;

    // 4. Original Payment Card
    const origMethodEl = document.getElementById('rfOrigMethod');
    const origTxnEl = document.getElementById('rfOrigTxnRef');
    if (origMethodEl) {
        const m = (sale.payment || 'cash').toLowerCase();
        origMethodEl.textContent = m.charAt(0).toUpperCase() + m.slice(1);
    }
    if (origTxnEl) origTxnEl.textContent = `#${shortId}`;

    // Right Column: Form Controls
    const amountDisplay = document.getElementById('rfAmountDisplay');
    const maxRefundEl = document.getElementById('rfMaxRefundText');
    const typeBadge = document.getElementById('rfRefundTypeBadge');
    const methodSelect = document.getElementById('rfMethodSelect');
    const reasonSelect = document.getElementById('rfReasonSelect');
    const noteField = document.getElementById('rfNote');
    const confirmBtn = document.getElementById('confirmRefundBtn');

    if (amountDisplay) amountDisplay.textContent = '₹0.00';
    if (maxRefundEl) maxRefundEl.textContent = '₹0';
    if (typeBadge) {
        typeBadge.textContent = 'Full Amount';
        typeBadge.style.background = '#ffe4e6';
        typeBadge.style.color = '#e11d48';
    }
    if (methodSelect) {
        let m = (sale.payment || 'cash').toLowerCase();
        if (!['cash', 'card', 'upi', 'bank_transfer'].includes(m)) m = 'cash';
        methodSelect.value = m;
    }
    if (reasonSelect) {
        reasonSelect.value = '';
        reasonSelect.style.borderColor = '#cbd5e1';
    }
    if (noteField) noteField.value = '';
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            <span>Issue Refund</span>
        `;
    }

    try {
        // Asynchronously fetch fresh customer record if customer_id is available
        if (sale.customer_id) {
            fetchCustomerById(sale.customer_id)
                .then(({ data: c }) => {
                    if (c) {
                        if (c.customer_name && custNameEl) custNameEl.textContent = c.customer_name;
                        if ((c.customer_phone || c.phone) && custPhoneEl) custPhoneEl.textContent = c.customer_phone || c.phone;
                        if ((c.customer_email || c.email) && custEmailEl) custEmailEl.textContent = c.customer_email || c.email;
                        const newInitials = ((c.customer_name || custName) || 'CU').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
                        if (custAvatarEl) custAvatarEl.textContent = newInitials;
                    }
                }).catch(() => {});
        }

        // Asynchronously fetch transaction ref if available
        fetchOriginalTransaction(sale.id)
            .then(({ data: txs }) => {
                if (txs && txs.length > 0 && txs[0].id && origTxnEl) {
                    origTxnEl.textContent = `#TXN-${String(txs[0].id).slice(0, 8).toUpperCase()}`;
                }
            }).catch(() => {});

        // Fetch individual items comprising this sale group
        const { data: items, error } = await fetchSaleLineItems(sale.id);

        if (error) throw error;
        salesState.currentRefundItems = items || [];
        if (itemsCountBadge) itemsCountBadge.textContent = `${salesState.currentRefundItems.length} item${salesState.currentRefundItems.length === 1 ? '' : 's'}`;

        // Render right away
        renderRefundItems();

    } catch (err) {
        console.error('[Return Load Error]', err);
        if (productList) productList.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626; font-size: 0.85rem;">Failed to load items.</div>`;
    }
    
    if (typeof feather !== 'undefined') feather.replace();
}

export function renderRefundItems() {
    const list = document.getElementById('rfProductList');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (salesState.currentRefundItems.length === 0) {
        list.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">No items found.</div>`;
        return;
    }

    salesState.currentRefundItems.forEach(item => {
        const isRefunded = (item.status === 'refunded');
        const initialQty = item.quantity || 1;
        
        const card = document.createElement('div');
        card.className = 'rf-product-card';
        card.dataset.id = item.id;
        card.style.cssText = `border:1px solid ${isRefunded ? '#f1f5f9' : '#e2e8f0'}; border-radius:10px; background:${isRefunded ? '#f8fafc' : '#fff'}; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; transition:all 0.15s; ${isRefunded ? 'opacity:0.6;' : ''}`;
        
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                <input type="checkbox" class="rf-item-cb" data-id="${item.id}" 
                    style="width:19px; height:19px; flex-shrink:0; accent-color:#dc2626; cursor:${isRefunded ? 'not-allowed' : 'pointer'}; border-radius:4px;" 
                    ${isRefunded ? 'disabled' : 'checked'}>
                <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                    <div style="font-size:0.92rem; font-weight:600; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${isRefunded ? 'text-decoration:line-through; color:#94a3b8;' : ''}">
                        ${item.product_name || 'Product'}
                    </div>
                    ${isRefunded 
                        ? `<div style="font-size:0.75rem; color:#dc2626; font-weight:600;">Returned (Qty: ${initialQty})</div>`
                        : `<div style="display:flex; align-items:center; gap:8px; font-size:0.78rem; color:#64748b;">
                             <span>Return quantity:</span>
                             <div style="display:inline-flex; align-items:center; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; height:24px; background:#fff;">
                                 <button type="button" class="rf-qty-btn minus" data-id="${item.id}" style="width:24px; height:100%; display:flex; align-items:center; justify-content:center; background:#f8fafc; border:none; border-right:1px solid #cbd5e1; color:#475569; font-weight:700; cursor:pointer; font-size:0.85rem;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">−</button>
                                 <input type="text" class="rf-qty-input" data-id="${item.id}" value="${initialQty}" data-max="${initialQty}" readonly style="width:32px; height:100%; border:none; text-align:center; font-size:0.78rem; font-weight:600; color:#0f172a; background:#fff; pointer-events:none; padding:0;">
                                 <button type="button" class="rf-qty-btn plus" data-id="${item.id}" style="width:24px; height:100%; display:flex; align-items:center; justify-content:center; background:#f8fafc; border:none; border-left:1px solid #cbd5e1; color:#475569; font-weight:700; cursor:pointer; font-size:0.85rem;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">+</button>
                             </div>
                             <span style="font-size:0.75rem; color:#94a3b8;">of ${initialQty}</span>
                           </div>`
                    }
                </div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
                <div class="rf-row-price" data-id="${item.id}" style="font-size:0.95rem; font-weight:700; color:#0f172a;">
                    ₹0
                </div>
            </div>
        `;
        list.appendChild(card);
    });

    // Attach recalculation
    document.querySelectorAll('.rf-item-cb:not(:disabled)').forEach(cb => {
        cb.addEventListener('change', calculateRefundTotal);
    });
    
    document.querySelectorAll('.rf-qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const input = document.querySelector(`.rf-qty-input[data-id="${id}"]`);
            if (!input) return;
            
            let val = parseInt(input.value) || 1;
            const max = parseInt(input.dataset.max) || 1;
            
            if (e.currentTarget.classList.contains('plus')) {
                if (val < max) val++;
            } else if (e.currentTarget.classList.contains('minus')) {
                if (val > 1) val--;
            }
            
            input.value = val;
            
            // If they interact with quantity, auto-check the row
            const cb = document.querySelector(`.rf-item-cb[data-id="${id}"]`);
            if (cb && !cb.checked) {
                cb.checked = true;
            }
            
            calculateRefundTotal();
        });
    });
    
    calculateRefundTotal();
}

export function calculateRefundTotal() {
    let total = 0;
    let selectedCount = 0;
    let unrefundedTotal = 0;
    let unrefundedCount = 0;
    
    salesState.currentRefundItems.forEach(item => {
        const isRefunded = (item.status === 'refunded');
        const price = Number(item.price || 0);
        
        if (isRefunded) {
            const priceDisplay = document.querySelector(`.rf-row-price[data-id="${item.id}"]`);
            if (priceDisplay) {
                priceDisplay.textContent = `₹${Number(item.total_amount || 0).toLocaleString('en-IN')}`;
                priceDisplay.style.color = '#94a3b8';
            }
        } else {
            unrefundedCount++;
            const maxQty = item.quantity || 1;
            unrefundedTotal += price * maxQty;

            const cb = document.querySelector(`.rf-item-cb[data-id="${item.id}"]`);
            const qtyInput = document.querySelector(`.rf-qty-input[data-id="${item.id}"]`);
            const card = document.querySelector(`.rf-product-card[data-id="${item.id}"]`);
            
            let qty = qtyInput ? parseInt(qtyInput.value) || 1 : maxQty;
            if (qty > maxQty) qty = maxQty;
            if (qty < 1) qty = 1;
            if (qtyInput && parseInt(qtyInput.value) !== qty) qtyInput.value = qty;
            
            const displayVal = price * qty;
            const priceDisplay = document.querySelector(`.rf-row-price[data-id="${item.id}"]`);
            if (priceDisplay) {
                priceDisplay.textContent = `₹${displayVal.toLocaleString('en-IN')}`;
                priceDisplay.style.color = (cb && cb.checked) ? '#0f172a' : '#94a3b8';
            }

            if (card) {
                card.style.borderColor = (cb && cb.checked) ? '#fca5a5' : '#e2e8f0';
                card.style.background = (cb && cb.checked) ? '#fff' : '#fafafa';
            }
            
            if (cb && cb.checked) {
                total += displayVal;
                selectedCount++;
            }
        }
    });
    
    const amountDisplay = document.getElementById('rfAmountDisplay');
    if (amountDisplay) {
        amountDisplay.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const maxRefundText = document.getElementById('rfMaxRefundText');
    if (maxRefundText) {
        maxRefundText.textContent = `₹${unrefundedTotal.toLocaleString('en-IN')}`;
    }

    const typeBadge = document.getElementById('rfRefundTypeBadge');
    if (typeBadge) {
        if (selectedCount === 0) {
            typeBadge.textContent = 'No Items';
            typeBadge.style.background = '#f1f5f9';
            typeBadge.style.color = '#64748b';
        } else if (total === unrefundedTotal && selectedCount === unrefundedCount) {
            typeBadge.textContent = 'Full Amount';
            typeBadge.style.background = '#ffe4e6';
            typeBadge.style.color = '#e11d48';
        } else {
            typeBadge.textContent = 'Partial Refund';
            typeBadge.style.background = '#fef3c7';
            typeBadge.style.color = '#d97706';
        }
    }
    
    const btn = document.getElementById('confirmRefundBtn');
    if (btn) {
        btn.disabled = (selectedCount === 0 || total <= 0);
        btn.style.opacity = (selectedCount === 0 || total <= 0) ? '0.5' : '1';
        btn.style.cursor = (selectedCount === 0 || total <= 0) ? 'not-allowed' : 'pointer';
    }
}

export async function processRefund() {
    if (!salesState.currentActionData || !salesState.currentActionData.sale) return;

    const reasonSelect = document.getElementById('rfReasonSelect');
    const reason = reasonSelect ? reasonSelect.value.trim() : '';
    if (!reason) {
        showToast('Please select a refund reason.', '#dc2626');
        if (reasonSelect) {
            reasonSelect.focus();
            reasonSelect.style.borderColor = '#ef4444';
            setTimeout(() => { if (reasonSelect) reasonSelect.style.borderColor = '#cbd5e1'; }, 2500);
        }
        return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll('.rf-item-cb:not(:disabled):checked'));
    if (checkedBoxes.length === 0) {
        showToast('Please select at least one item to return.', '#dc2626');
        return;
    }

    const confirmBtn = document.getElementById('confirmRefundBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span>Processing...</span>`;
    }

    try {
        const saleId = salesState.currentActionData.sale.id; // The Parent Group ID
        const note = document.getElementById('rfNote')?.value.trim();
        const methodSelect = document.getElementById('rfMethodSelect');
        let method = methodSelect ? methodSelect.value.toLowerCase() : 'cash';
        
        // ENSURE CHECK CONSTRAINT COMPLIANCE
        if (!['cash', 'card', 'upi', 'bank_transfer'].includes(method)) method = 'cash';

        const fullNotes = reason + (note ? ` - ${note}` : '');
        const ledgerRows = [];
        const saleUpdatePromises = [];
        
        for (const cb of checkedBoxes) {
            const itemId = cb.dataset.id;
            const itemObj = salesState.currentRefundItems.find(i => String(i.id) === itemId);
            if (!itemObj) continue;

            const qtyInput = document.querySelector(`.rf-qty-input[data-id="${itemId}"]`);
            const refundQty = qtyInput ? parseInt(qtyInput.value) || 1 : (itemObj.quantity || 1);
            
            const itemPrice = Number(itemObj.price || 0);
            const refundAmount = refundQty * itemPrice;
            
            let resultingLineId = itemId;

            const remainingQty = (itemObj.quantity || 1) - refundQty;
            const remainingAmount = remainingQty * itemPrice;
            
            const updatePayload = {
                quantity: remainingQty,
                total_amount: remainingAmount
            };
            
            if (remainingQty <= 0) {
                updatePayload.status = 'refunded';
            }
            
            saleUpdatePromises.push(
                buildSaleItemUpdatePromise(itemId, updatePayload)
            );

            // INVENTORY RESTOCK LOGIC
            if (itemObj.product_id) {
                try {
                    const { data: prodData } = await fetchProductStock(itemObj.product_id);
                        
                    if (prodData) {
                        const newStock = Number(prodData.stock_quantity || 0) + refundQty;
                        saleUpdatePromises.push(
                            buildProductStockUpdatePromise(itemObj.product_id, newStock)
                        );
                    }
                } catch (restockErr) {
                    console.error('Failed to restock product:', itemObj.product_id, restockErr);
                }
            }

            // Add Ledger Entry linked to the original row ID
            ledgerRows.push({
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                reference_id: saleId,               // Parent cart ID
                reference_line_id: resultingLineId, // Direct specific row ID
                reference_type: 'product',
                amount: Math.abs(refundAmount),
                status: 'refunded',
                payment_method: method,
                notes: fullNotes ? `${fullNotes} (Returned: ${itemObj.product_name || 'Item'} x${refundQty})` : `Returned: ${itemObj.product_name || 'Item'} (Qty: ${refundQty})`,
                paid_at: new Date().toISOString()
            });
        }

        // Execute batched DB operations
        if (saleUpdatePromises.length > 0) {
            await Promise.all(saleUpdatePromises);
        }
        if (ledgerRows.length > 0) {
            const { error: txError } = await insertRefundLedger(ledgerRows);
            if (txError) throw txError;
        }

        // Success!
        showToast(`Successfully returned ${checkedBoxes.length} partial/full item(s).`, '#dc2626');
        if (window.notifyEvent) {
            window.notifyEvent('payments', 'evt_payment_refunded', {
                title: 'Payment Refunded',
                message: `Refund processed for ${checkedBoxes.length} item(s).`
            });
        }
        if (window.notifyCustomer && salesState.currentActionData?.sale) {
            const s = salesState.currentActionData.sale;
            window.notifyCustomer('purchase', 'refund_confirm', {
                name: s.customer,
                phone: s.customer_phone || s.phone || '',
                email: s.customer_email || s.email || ''
            }, {
                saleId: s.id,
                itemsReturned: checkedBoxes.length
            });
        }
        closeRefundModal();
        
        // Re-fetch to sync table badges and metrics
        if (typeof onRefundCompletedCallback === 'function') {
            await onRefundCompletedCallback();
        }
        
        // Close detail modal if open
        const sdRefundBtn = document.getElementById('sdRefundBtn');
        if (sdRefundBtn) sdRefundBtn.style.display = 'none';

    } catch (err) {
        console.error('Return error:', err);
        showToast('Failed to process return: ' + (err.message || 'Unknown error'), '#dc2626');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                <span>Issue Refund</span>
            `;
        }
    }
}

export function setupRefundEventListeners() {
    const cancelRefundBtn = document.getElementById('cancelRefundBtn');
    const closeRefundBtnFooter = document.getElementById('closeRefundBtn');
    const refundSummaryOverlay = document.getElementById('refundSummaryOverlay');
    const confirmRefundBtn = document.getElementById('confirmRefundBtn');

    if (cancelRefundBtn) cancelRefundBtn.addEventListener('click', closeRefundModal);
    if (closeRefundBtnFooter) closeRefundBtnFooter.addEventListener('click', closeRefundModal);
    if (refundSummaryOverlay) {
        refundSummaryOverlay.addEventListener('click', (e) => {
            if (e.target === refundSummaryOverlay) closeRefundModal();
        });
    }

    if (confirmRefundBtn) {
        confirmRefundBtn.addEventListener('click', processRefund);
    }

    // --- Refund Modal Listeners (preserve pre-existing duplicate binding) ---
    const closeRefundBtn = document.getElementById('closeRefundBtn');
    if (closeRefundBtn) closeRefundBtn.addEventListener('click', closeRefundModal);
}
