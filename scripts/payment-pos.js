// scripts/payment-pos.js

import { supabase } from '../lib/supabase.js';
import {
    getCompanyAndBranchIds,
    createPaymentState,
    calculateFinalDue,
    fetchCustomerMembership,
    fetchActiveOffers,
    validateCouponCode,
    buildResultPayload,
    formatCurrency
} from './payment-core.js';

let posData = null;
let paymentConfig = null;
let paymentState = createPaymentState();
let availableOffers = [];
let serviceIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    loadPosCheckoutData();
});

function getCompanyId() {
    return getCompanyAndBranchIds().companyId;
}

function getBranchId() {
    return getCompanyAndBranchIds().branchId;
}

function loadPosCheckoutData() {
    const raw = sessionStorage.getItem('pos_checkout_data');
    if (!raw) {
        alert('No active checkout session found. Returning to POS...');
        window.location.href = 'pos.html';
        return;
    }

    try {
        posData = JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse pos_checkout_data:', e);
        window.location.href = 'pos.html';
        return;
    }

    const { cart = [], selectedCustomer = {}, saleGroupId, shortDisplayId } = posData;

    if (!cart || cart.length === 0) {
        alert('Cart is empty. Returning to POS...');
        window.location.href = 'pos.html';
        return;
    }

    // Set Sale ID Badge
    document.getElementById('badgeSaleId').textContent = `SALE #${shortDisplayId || 'TXN'}`;

    // Set Customer Info
    const custName = (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() || 'Walk-in Customer';
    const custPhone = (selectedCustomer.customer_phone || selectedCustomer.phone || 'N/A').toString();
    const custId = selectedCustomer.customer_id || selectedCustomer.id || null;

    document.getElementById('custNameDisplay').textContent = custName;
    document.getElementById('custPhoneDisplay').textContent = custPhone;
    document.getElementById('custAvatar').textContent = (custName[0] || 'C').toUpperCase();

    // Render Cart Table
    const tbody = document.getElementById('cartTableBody');
    tbody.innerHTML = '';
    let subtotal = 0;
    serviceIds = [];

    cart.forEach(item => {
        const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
        subtotal += itemTotal;

        const isService = item.type === 'service' || !!item.service_id;
        if (isService && (item.service_id || item.id)) {
            serviceIds.push(item.service_id || item.id);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600;color:#0f172a;">${item.name || 'Item'}</div>
                ${item.category_name ? `<div style="font-size:0.75rem;color:#64748b;">${item.category_name}</div>` : ''}
            </td>
            <td>
                <span class="item-type-badge ${isService ? 'service' : 'product'}">${isService ? 'Service' : 'Product'}</span>
            </td>
            <td style="text-align:center;font-weight:600;">${item.quantity || 1}</td>
            <td style="text-align:right;color:#64748b;">${formatCurrency(item.price || 0)}</td>
            <td style="text-align:right;font-weight:700;color:#0f172a;">${formatCurrency(itemTotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('cartCount').textContent = cart.length;

    // Build Payment Config
    paymentConfig = {
        saleId: shortDisplayId || saleGroupId,
        saleGroupId: saleGroupId,
        customerId: custId,
        customerName: custName,
        customerPhone: custPhone,
        totalAmount: subtotal,
        amountPaid: 0,
        serviceIds: serviceIds
    };

    // Load Offers
    loadOffers();

    // Check if membership exists for customer
    if (custId) {
        fetchCustomerMembership(custId, supabase).then(mem => {
            if (mem) {
                const memToggle = document.getElementById('membershipToggle');
                memToggle.checked = true;
                paymentState.appliedMembership = mem;
                const resultBadge = document.getElementById('membershipResultBadge');
                resultBadge.className = 'mem-result-badge found';
                resultBadge.textContent = `✓ Active Perk: ${mem.name} (${mem.type === 'percentage' ? mem.value + '%' : '₹' + mem.value} OFF)`;
                document.getElementById('memSubtitle').textContent = `${mem.name} active`;
                updateCalculations();
            }
        });
    }

    updateCalculations();
}

function initEvents() {
    // Payment Method Selection
    document.querySelectorAll('.method-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.method-card').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            paymentState.method = target.dataset.method;
        });
    });

    // Membership Perk Toggle
    const memToggle = document.getElementById('membershipToggle');
    memToggle.addEventListener('change', async (e) => {
        const resultBadge = document.getElementById('membershipResultBadge');
        const subtitle = document.getElementById('memSubtitle');

        if (e.target.checked) {
            if (!paymentConfig?.customerId) {
                resultBadge.className = 'mem-result-badge not-found';
                resultBadge.textContent = 'Walk-in customer has no saved profile.';
                subtitle.textContent = 'No profile';
                paymentState.appliedMembership = null;
                updateCalculations();
                return;
            }

            resultBadge.className = 'mem-result-badge';
            resultBadge.textContent = 'Checking active memberships...';
            resultBadge.style.display = 'block';

            const mem = await fetchCustomerMembership(paymentConfig.customerId, supabase);
            if (mem) {
                paymentState.appliedMembership = mem;
                resultBadge.className = 'mem-result-badge found';
                resultBadge.textContent = `✓ ${mem.name} — ${mem.type === 'percentage' ? mem.value + '% OFF' : '₹' + mem.value + ' OFF'}`;
                subtitle.textContent = `${mem.name} active`;
            } else {
                paymentState.appliedMembership = null;
                resultBadge.className = 'mem-result-badge not-found';
                resultBadge.textContent = 'No active membership found for this customer.';
                subtitle.textContent = 'No active membership';
            }
        } else {
            paymentState.appliedMembership = null;
            resultBadge.className = 'mem-result-badge';
            resultBadge.textContent = '';
            subtitle.textContent = 'Check customer\'s active membership';
        }
        updateCalculations();
    });

    // Offers Toggle
    document.getElementById('btnToggleOffers').addEventListener('click', () => {
        document.getElementById('offersListBox').classList.toggle('active');
    });

    // Coupon Apply
    document.getElementById('btnApplyCoupon').addEventListener('click', handleCouponApply);

    // Manual Discount
    document.getElementById('btnTypeFlat').addEventListener('click', () => {
        document.getElementById('btnTypeFlat').classList.add('active');
        document.getElementById('btnTypePct').classList.remove('active');
        paymentState.discountType = 'flat';
        updateCalculations();
    });

    document.getElementById('btnTypePct').addEventListener('click', () => {
        document.getElementById('btnTypePct').classList.add('active');
        document.getElementById('btnTypeFlat').classList.remove('active');
        paymentState.discountType = 'percent';
        updateCalculations();
    });

    document.getElementById('manualDiscountInput').addEventListener('input', (e) => {
        paymentState.discountValue = parseFloat(e.target.value) || 0;
        updateCalculations();
    });

    // Complete Sale
    document.getElementById('btnFinalizePayment').addEventListener('click', finalizePosSale);

    // Print Receipt
    document.getElementById('btnPrintReceipt')?.addEventListener('click', () => {
        window.print();
    });

    // Back to POS button: resets checkout session
    document.getElementById('btnBackToPos')?.addEventListener('click', () => {
        sessionStorage.removeItem('pos_checkout_data');
        localStorage.setItem('pos_cart_reset_flag', 'true');
    });
}

async function loadOffers() {
    const cId = getCompanyId();
    const bId = getBranchId();
    availableOffers = await fetchActiveOffers(cId, bId, supabase);
    renderOffers();
}

function renderOffers() {
    const box = document.getElementById('offersListBox');
    if (!availableOffers || availableOffers.length === 0) {
        box.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:0.8rem;padding:8px;">No active branch offers available</div>`;
        return;
    }

    box.innerHTML = availableOffers.map(o => {
        const isApplied = paymentState.appliedOffer && paymentState.appliedOffer.id === o.offer_id;
        const badgeStr = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
        return `
            <div class="offer-item-row ${isApplied ? 'applied' : ''}">
                <div>
                    <div style="font-weight:600;font-size:0.85rem;color:#1e293b;">${o.offer_name}</div>
                    <span class="offer-badge">${badgeStr}</span>
                </div>
                <button class="btn-input-action" style="height:32px;padding:0 12px;font-size:0.75rem;background:${isApplied ? '#ef4444' : '#4f46e5'};" data-offer-id="${o.offer_id}">
                    ${isApplied ? 'Remove' : 'Apply'}
                </button>
            </div>
        `;
    }).join('');

    box.querySelectorAll('button[data-offer-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const offerId = e.currentTarget.dataset.offerId;
            if (paymentState.appliedOffer && paymentState.appliedOffer.id === offerId) {
                paymentState.appliedOffer = null;
            } else {
                const found = availableOffers.find(x => x.offer_id === offerId);
                if (found) {
                    paymentState.appliedOffer = {
                        id: found.offer_id,
                        name: found.offer_name,
                        type: found.discount_type,
                        value: found.discount_value
                    };
                }
            }
            renderOffers();
            updateCalculations();
        });
    });
}

async function handleCouponApply() {
    const input = document.getElementById('couponCodeInput');
    const msg = document.getElementById('couponFeedbackMsg');
    const btn = document.getElementById('btnApplyCoupon');
    const code = input.value.trim();

    if (paymentState.appliedCoupon) {
        paymentState.appliedCoupon = null;
        input.value = '';
        input.disabled = false;
        btn.textContent = 'Apply';
        btn.style.background = '#1e293b';
        msg.style.display = 'none';
        updateCalculations();
        return;
    }

    if (!code) {
        msg.textContent = 'Please enter a coupon code.';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '...';
        const coupon = await validateCouponCode(code, getCompanyId(), getBranchId(), serviceIds, supabase);
        paymentState.appliedCoupon = coupon;

        const valStr = coupon.type === 'percentage' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`;
        msg.textContent = `✓ Coupon "${coupon.code}" applied (${valStr})!`;
        msg.style.color = '#10b981';
        msg.style.display = 'block';

        input.disabled = true;
        btn.disabled = false;
        btn.textContent = 'Remove';
        btn.style.background = '#ef4444';

        updateCalculations();
    } catch (err) {
        msg.textContent = err.message || 'Invalid coupon code.';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Apply';
    }
}

function updateCalculations() {
    if (!paymentConfig) return;

    const res = calculateFinalDue(paymentConfig, paymentState);
    const summaryContainer = document.getElementById('summaryBreakdown');

    let html = '';
    res.breakdown.forEach(item => {
        if (item.type === 'total') {
            html += `
                <div class="summary-row total">
                    <span>${item.label}</span>
                    <span class="due-val">${item.formatted}</span>
                </div>
            `;
        } else {
            const isDiscount = item.type === 'discount';
            html += `
                <div class="summary-row ${isDiscount ? 'discount' : ''}">
                    <span>${item.label}</span>
                    <span>${item.formatted}</span>
                </div>
            `;
        }
    });

    summaryContainer.innerHTML = html;
    document.getElementById('btnFinalizeText').textContent = `Complete Sale (${formatCurrency(res.finalDue)})`;
}

async function finalizePosSale() {
    if (!posData || !paymentConfig) return;

    const btn = document.getElementById('btnFinalizePayment');
    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader"></i> Processing Sale...`;
    if (window.feather) feather.replace();

    try {
        const { cart = [], saleGroupId } = posData;
        const payload = buildResultPayload(paymentConfig, paymentState);
        const amountCollected = payload.amountCollected;
        const paymentMethod = payload.paymentMethod;
        const customerName = paymentConfig.customerName;
        const customerPhone = paymentConfig.customerPhone;
        const customerId = paymentConfig.customerId;
        const companyId = getCompanyId();
        const branchId = getBranchId();

        // Get staff details
        let staffName = 'System';
        let staffId = null;
        try {
            const contextStr = localStorage.getItem('appContext');
            if (contextStr) {
                const ctx = JSON.parse(contextStr);
                if (ctx?.user?.id) staffId = ctx.user.id;
                if (ctx?.user?.first_name) {
                    staffName = ctx.user.first_name;
                } else if (ctx?.user?.name) {
                    staffName = ctx.user.name.split(' ')[0];
                }
            }
        } catch (e) {
            console.warn('Could not parse appContext for staff details:', e);
        }

        // 1. Insert batch into sales table
        const salesBatch = cart.map(item => ({
            sale_id: saleGroupId,
            company_id: companyId,
            branch_id: branchId,
            customer_id: customerId,
            customer_name: customerName,
            customer_phone: customerPhone,
            payment_method: paymentMethod,
            status: 'completed',
            staff_name: staffName,
            product_id: item.id,
            product_name: item.name,
            category_id: item.category_id || null,
            quantity: item.quantity,
            price: item.price,
            total_amount: item.price * item.quantity
        }));

        const { error: saleError } = await supabase
            .from('sales')
            .insert(salesBatch);

        if (saleError) throw saleError;

        // 2. Insert summary row into sales_for_business_transactions
        const totalOriginal = Number(paymentConfig.totalAmount || 0);
        const totalDiscount = Math.max(0, totalOriginal - amountCollected);
        const d = payload.discounts || {};

        let discountType = null;
        let discountName = null;
        if (d.couponCode) { discountType = 'coupon'; discountName = d.couponCode; }
        else if (d.offerName) { discountType = 'offer'; discountName = d.offerName; }
        else if (d.membershipName) { discountType = 'membership'; discountName = d.membershipName; }
        else if (d.manualValue > 0) { discountType = 'manual'; discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`; }

        const productIds = cart.map(item => item.id).filter(Boolean);
        const productNames = cart.map(item => item.name).filter(Boolean);
        const categoryIds = cart.map(item => item.category_id).filter(Boolean);
        const categoryNames = cart.map(item => item.category_name).filter(Boolean);
        const totalQty = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

        const summaryRow = {
            company_id: companyId,
            branch_id: branchId,
            sale_id: saleGroupId,
            product_ids: productIds.length ? productIds : null,
            product_names: productNames.length ? productNames : null,
            category_ids: categoryIds.length ? categoryIds : null,
            category_names: categoryNames.length ? categoryNames : null,
            customer_id: customerId,
            customer_name: customerName,
            customer_phone: customerPhone,
            total_quantity: totalQty,
            total_price: totalOriginal,
            payment_method: paymentMethod.toLowerCase(),
            payment_status: 'paid',
            staff_id: staffId,
            staff_name: staffName,
            discount_type: discountType,
            discount_name: discountName,
            discount_amount: totalDiscount > 0 ? totalDiscount : null,
            final_amount: amountCollected
        };

        const { error: summaryError } = await supabase
            .from('sales_for_business_transactions')
            .insert(summaryRow);

        if (summaryError) console.error('POS: Summary insert error:', summaryError);

        // 3. Insert into business_transactions
        const refNote = document.getElementById('paymentRefInput').value.trim();
        const paidAt = new Date().toISOString().replace('Z', '');
        await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: saleGroupId,
                reference_type: 'pos',
                amount: amountCollected,
                currency: 'INR',
                payment_method: (paymentMethod || 'cash').toLowerCase(),
                status: 'paid',
                notes: refNote ? `POS Sale. Ref: ${refNote}` : `POS Sale #${(saleGroupId || '').slice(0, 8)}`,
                paid_at: paidAt,
                final_amount: amountCollected,
                discount_type: discountType,
                discount_name: discountName,
                discount_amount: totalDiscount > 0 ? totalDiscount : null
            });

        // 4. Decrement Stock in Products Table
        for (const item of cart) {
            const productId = item.id;
            const soldQty = Number(item.quantity) || 1;
            if (!productId || item.type === 'service') continue;

            const { data: prodRows } = await supabase
                .from('products')
                .select('stock_quantity, min_stock_alert, product_name')
                .eq('product_id', productId);

            if (prodRows && prodRows.length > 0) {
                const currentStock = Number(prodRows[0].stock_quantity) || 0;
                const minStock = Number(prodRows[0].min_stock_alert) || 5;
                const newStock = Math.max(0, currentStock - soldQty);

                await supabase
                    .from('products')
                    .eq('product_id', productId)
                    .update({ stock_quantity: newStock });

                if (newStock <= minStock && window.notifyEvent) {
                    window.notifyEvent('pos', 'evt_pos_low_stock', {
                        title: 'Low Stock Alert',
                        message: `${item.name} stock dropped to ${newStock} (threshold: ${minStock}).`
                    });
                }
            }
        }

        // Notify events
        if (window.notifyEvent) {
            window.notifyEvent('pos', 'evt_pos_sale_completed', {
                title: 'Sale Completed',
                message: `Sale of ₹${amountCollected} completed for ${customerName}.`
            });
        }

        // Set cart reset flag so POS clears cart when user returns
        localStorage.setItem('pos_cart_reset_flag', 'true');
        sessionStorage.removeItem('pos_checkout_data');

        // Show Success Overlay
        document.getElementById('successSummaryText').textContent = `${formatCurrency(amountCollected)} collected via ${paymentMethod.toUpperCase()} from ${customerName}.`;
        document.getElementById('successOverlay').classList.add('active');

    } catch (err) {
        console.error('POS Sale finalization error:', err);
        alert(err.message || 'An error occurred while completing the sale.');
        btn.disabled = false;
        updateCalculations();
    }
}
