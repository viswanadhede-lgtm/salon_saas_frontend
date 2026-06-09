import { supabase } from '../lib/supabase.js';

let currentRefId = null;
let currentRefType = null;
let baseAmount = 0;
let finalAmount = 0;
let currentPaymentMethod = 'cash';
let activeDiscount = null; // { type, name, amount }
let recordData = null; // The DB record loaded

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup UI Listeners
    setupListeners();

    // 2. Parse URL Params
    const params = new URLSearchParams(window.location.search);
    currentRefId = params.get('refId');
    currentRefType = params.get('type'); // 'booking', 'membership'

    if (!currentRefId || !currentRefType) {
        showError('Invalid checkout link. Missing reference ID.');
        return;
    }

    document.getElementById('checkoutSubtitle').textContent = `Loading ${currentRefType} details...`;
    
    // 3. Fetch Data
    await loadCheckoutData();
});

function setupListeners() {
    // Payment Method Selection
    document.querySelectorAll('.pm-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.pm-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentPaymentMethod = e.currentTarget.dataset.method;
        });
    });

    // Discount: Apply Coupon/Offer
    const btnApplyCoupon = document.getElementById('btnApplyCoupon');
    if (btnApplyCoupon) {
        btnApplyCoupon.addEventListener('click', handleApplyCoupon);
    }

    // Discount: Apply Manual
    const btnApplyManual = document.getElementById('btnApplyManual');
    if (btnApplyManual) {
        btnApplyManual.addEventListener('click', handleApplyManual);
    }

    // Record Payment
    const btnRecordPayment = document.getElementById('btnRecordPayment');
    if (btnRecordPayment) {
        btnRecordPayment.addEventListener('click', finalizePayment);
    }
}

async function loadCheckoutData() {
    try {
        if (currentRefType === 'booking') {
            const { data, error } = await supabase
                .from('bookings_for_business_transaction')
                .select('*')
                .eq('booking_id', currentRefId)
                .single();
            if (error) throw error;
            recordData = data;
            
            // Extract items (which are comma separated)
            const servicesArray = (data.service_name || '').split(',').map(s => s.trim()).filter(Boolean);
            renderOrderSummary(data.customer_name, currentRefId, servicesArray, Number(data.total_price) || 0);

        } else if (currentRefType === 'membership') {
            const { data, error } = await supabase
                .from('membership_purchases')
                .select('*')
                .eq('purchase_id', currentRefId)
                .single();
            if (error) throw error;
            recordData = data;
            const price = Number(data.amount) || 0;
            renderOrderSummary(data.customer_name, currentRefId, [data.plan_name || 'Membership Plan'], price);
        } else {
            throw new Error('Unsupported checkout type: ' + currentRefType);
        }

    } catch (err) {
        console.error('Checkout Load error:', err);
        showError('Failed to load transaction details.');
    }
}

function renderOrderSummary(customerName, refId, itemsArray, total) {
    document.getElementById('coCustomerName').textContent = customerName || 'Guest';
    document.getElementById('coReferenceId').textContent = refId.substring(0, 8).toUpperCase();
    
    // Items
    const coItemsList = document.getElementById('coItemsList');
    coItemsList.innerHTML = '';
    
    if (itemsArray.length === 0) {
        coItemsList.innerHTML = '<li class="order-item-row" style="color:#64748b;">No items found</li>';
    } else {
        itemsArray.forEach(item => {
            const li = document.createElement('li');
            li.className = 'order-item-row';
            li.innerHTML = `
                <div class="item-info">
                    <span class="item-name">${item}</span>
                </div>
                <span class="item-price">-</span>
            `;
            coItemsList.appendChild(li);
        });
    }
    
    // Set Amounts
    baseAmount = total;
    recalculateTotals();
    document.getElementById('checkoutSubtitle').textContent = `Checkout for ${currentRefType}`;
}

async function handleApplyCoupon() {
    const code = document.getElementById('coCouponCode').value.trim();
    if (!code) return;
    
    // Validate coupon code logic (for now simulated logic or direct match)
    // Here we'd realistically query the `coupons` table.
    // For MVP flow mimicking global modal, if we assume flat validation:
    try {
        const { data: coupon, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', code)
            .single();
            
        if (error || !coupon) {
            alert('Invalid or expired coupon code.');
            return;
        }
        
        let discountVal = 0;
        if (coupon.discount_type === 'percentage') {
            discountVal = baseAmount * (Number(coupon.discount_value) / 100);
            if (coupon.max_discount_amount) {
                discountVal = Math.min(discountVal, Number(coupon.max_discount_amount));
            }
        } else {
            discountVal = Number(coupon.discount_value);
        }
        
        applyDiscount('coupon', coupon.code, discountVal);
        document.getElementById('coCouponCode').value = '';
    } catch(err) {
        console.error(err);
        alert('Error validating coupon');
    }
}

function handleApplyManual() {
    const type = document.getElementById('coManualType').value;
    const value = Number(document.getElementById('coManualAmount').value);
    if (!value || value <= 0) return;
    
    let discountVal = 0;
    let label = '';
    if (type === 'percent') {
        discountVal = baseAmount * (value / 100);
        label = `${value}% off`;
    } else {
        discountVal = value;
        label = `₹${value} off`;
    }
    
    applyDiscount('manual', label, discountVal);
    document.getElementById('coManualAmount').value = '';
}

function applyDiscount(type, name, amount) {
    if (amount > baseAmount) amount = baseAmount;
    
    activeDiscount = { type, name, amount };
    recalculateTotals();
    
    // UI updates
    const container = document.getElementById('coActiveDiscountContainer');
    container.style.display = 'block';
    container.innerHTML = `
        <div class="active-discount-badge">
            <span>✓ ${name} Applied (-₹${Math.round(amount)})</span>
            <button class="remove-discount" onclick="window.removeDiscount()"><i data-feather="x" style="width:14px; height:14px;"></i></button>
        </div>
    `;
    document.getElementById('coDiscountInputs').style.display = 'none';
    if(window.feather) feather.replace();
}

window.removeDiscount = function() {
    activeDiscount = null;
    recalculateTotals();
    document.getElementById('coActiveDiscountContainer').style.display = 'none';
    document.getElementById('coDiscountInputs').style.display = 'block';
};

function recalculateTotals() {
    const disAmount = activeDiscount ? activeDiscount.amount : 0;
    finalAmount = baseAmount - disAmount;
    if (finalAmount < 0) finalAmount = 0;
    
    document.getElementById('bdBase').textContent = `₹${Math.round(baseAmount)}`;
    
    const disRow = document.getElementById('bdDiscountRow');
    if (disAmount > 0) {
        disRow.style.display = 'flex';
        document.getElementById('bdDiscount').textContent = `-₹${Math.round(disAmount)}`;
    } else {
        disRow.style.display = 'none';
    }
    
    document.getElementById('bdTotal').textContent = `₹${Math.round(finalAmount)}`;
    
    const recordBtnBtn = document.getElementById('btnRecordPayment');
    recordBtnBtn.querySelector('span').textContent = `Record Payment (₹${Math.round(finalAmount)})`;
}

function showError(msg) {
    document.getElementById('checkoutSubtitle').textContent = 'Error';
    document.getElementById('checkoutSubtitle').style.color = '#dc2626';
    alert(msg);
}

// ── RECORD PAYMENT ──────────────────────────────────────────────
async function finalizePayment() {
    const btnRecord = document.getElementById('btnRecordPayment');
    btnRecord.disabled = true;
    btnRecord.querySelector('span').textContent = 'Processing...';
    
    try {
        let userId = null;
        let companyId = recordData.company_id || localStorage.getItem('company_id');
        let branchId = recordData.branch_id || localStorage.getItem('active_branch_id');
        
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            userId = ctx.user?.user_id || ctx.user?.id || null;
            if(!companyId) companyId = ctx.company?.id;
        } catch(e){}

        const paidAt = new Date().toISOString().replace('Z', '');
        
        // 1. Insert into business_transactions
        const txPayload = {
            company_id: companyId,
            branch_id: branchId,
            reference_id: currentRefId,
            reference_type: currentRefType,
            amount: finalAmount,
            currency: 'INR',
            payment_method: currentPaymentMethod,
            status: 'paid',
            notes: `Payment for ${currentRefType} ${currentRefId.substring(0,8)}`,
            created_by: userId,
            paid_at: paidAt,
            final_amount: finalAmount,
            discount_type: activeDiscount ? activeDiscount.type : null,
            discount_name: activeDiscount ? activeDiscount.name : null,
            discount_amount: activeDiscount ? activeDiscount.amount : null
        };
        
        const { error: txError } = await supabase.from('business_transactions').insert(txPayload);
        if (txError) throw txError;
        
        // 2. Update specific source table
        if (currentRefType === 'booking') {
            const { error: bkError } = await supabase
                .from('bookings_for_business_transaction')
                .update({
                    payment_status: 'paid',
                    final_amount: finalAmount,
                    discount_amount: activeDiscount ? activeDiscount.amount : null,
                    discount_type: activeDiscount ? activeDiscount.type : null,
                    discount_name: activeDiscount ? activeDiscount.name : null,
                    updated_at: paidAt
                })
                .eq('booking_id', currentRefId);
            if (bkError) throw bkError;
        } else if (currentRefType === 'membership') {
            const { error: memError } = await supabase
                .from('membership_purchases')
                .update({ payment_status: 'completed' })
                .eq('purchase_id', currentRefId);
            if(memError) throw memError;
        }

        // Show Success and Redirect
        btnRecord.querySelector('span').textContent = 'Success!';
        btnRecord.style.background = '#10b981';
        
        document.body.insertAdjacentHTML('beforeend', `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(255,255,255,0.9); display:flex; align-items:center; justify-content:center; z-index:9999; flex-direction:column; gap:16px;">
                <div style="width:64px;height:64px;background:#d1fae5;color:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h2 style="font-size:1.5rem;font-weight:700;color:#0f172a;margin:0;">Payment Recorded!</h2>
                <p style="color:#64748b;margin:0;">Redirecting to pending payments...</p>
            </div>
        `);
        
        setTimeout(() => {
            window.location.href = 'pending-payments.html';
        }, 1500);

    } catch (err) {
        console.error('Payment Error:', err);
        alert('Failed to process payment: ' + err.message);
        btnRecord.disabled = false;
        btnRecord.querySelector('span').textContent = `Record Payment (₹${Math.round(finalAmount)})`;
    }
}
