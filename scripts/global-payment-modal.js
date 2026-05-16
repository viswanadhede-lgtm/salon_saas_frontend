// scripts/global-payment-modal.js

/**
 * Global Payment Modal
 * Unifies the "Collect Payment" experience across POS, Pending Payments, Sales History, and Memberships.
 * Supports:
 * - Dynamic Due Amount Calculation
 * - Manual Discounts (Flat / Percentage)
 * - Coupon Codes (Verifies against DB)
 * - Membership Perks (Auto-detects active customer memberships)
 */

let globalPaymentConfig = null;
/*
    Expected config structure:
    {
        saleId: "SAL-1234",
        customerId: "uuid-of-customer", // required for membership lookup
        customerName: "John Doe",
        subtotal: 1000,
        taxAmount: 100, // Optional
        totalAmount: 1100,
        amountPaid: 0, // Optional, for pending payments where some was paid
        amountDue: 1100,
        isMembershipPurchase: false, // If true, disable membership discounts
        onComplete: async (paymentDetails) => { ... } // Callback
    }
*/

let paymentState = {
    method: 'cash',
    discountType: 'flat', // 'flat' or 'percent'
    discountValue: 0,
    appliedCoupon: null, // { code, type, value }
    appliedMembership: null, // { name, discount_percentage }
    appliedOffer: null, // { id, name, type, value }
    finalDue: 0
};

let liveOffersDB = [];

// ── Inject CSS & HTML on load ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    injectGlobalPaymentModalStyles();
    injectGlobalPaymentModalHTML();
    bindGlobalPaymentModalEvents();
});

function injectGlobalPaymentModalStyles() {
    if (document.getElementById('global-payment-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'global-payment-modal-styles';
    style.textContent = `
        /* Premium Global Payment Modal Styling */
        #gpmOverlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(8px);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        #gpmOverlay.active {
            display: flex;
            opacity: 1;
        }
        #gpmContent {
            background: #fff;
            max-width: 540px;
            width: 95%;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transform: translateY(20px) scale(0.95);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            max-height: 90vh;
            display: flex;
            flex-direction: column;
        }
        #gpmOverlay.active #gpmContent {
            transform: translateY(0) scale(1);
        }

        .gpm-header {
            padding: 24px 32px;
            background: #fff;
            border-bottom: 1px solid #f8fafc;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .gpm-header h2 { font-size: 1.5rem; font-weight: 800; color: #1e293b; margin: 0 0 4px 0; }
        .gpm-subtitle { font-size: 0.875rem; color: #64748b; margin: 0; font-weight: 500; }
        .gpm-close-btn {
            background: #f8fafc; border: 1px solid #f1f5f9; color: #64748b; cursor: pointer;
            width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center;
            justify-content: center; transition: all 0.2s;
        }
        .gpm-close-btn:hover { background: #f1f5f9; color: #1e293b; }

        .gpm-body {
            padding: 0; background: #fff; flex: 1; overflow-y: auto;
        }

        .gpm-stats {
            background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 24px 32px;
            display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;
        }
        .gpm-stat-box { text-align: center; }
        .gpm-stat-label { font-size: 0.7rem; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
        .gpm-stat-val { font-size: 1.25rem; font-weight: 800; margin: 0; }

        .gpm-section { padding: 20px 32px; border-bottom: 1px solid #f1f5f9; }
        .gpm-section-title { font-size: 0.875rem; font-weight: 700; color: #475569; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }

        /* Discount & Coupon Layout */
        .gpm-discount-row { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
        .gpm-discount-toggle { display: flex; background: #f1f5f9; border-radius: 8px; overflow: hidden; height: 42px; }
        .gpm-discount-toggle button { flex: 1; border: none; background: transparent; padding: 0 16px; font-weight: 600; font-size: 0.85rem; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .gpm-discount-toggle button.active { background: #4f46e5; color: #fff; }
        .gpm-input { height: 42px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 0.95rem; font-weight: 600; color: #1e293b; outline: none; transition: border-color 0.2s; flex: 1; }
        .gpm-input:focus { border-color: #4f46e5; }
        
        .gpm-coupon-row { display: flex; gap: 8px; }
        .gpm-btn-apply { height: 42px; padding: 0 16px; background: #1e293b; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .gpm-btn-apply:hover { background: #0f172a; }

        /* Offers List */
        .gpm-btn-check-offers { width: 100%; height: 42px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; color: #475569; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .gpm-btn-check-offers:hover { background: #f1f5f9; border-color: #94a3b8; color: #1e293b; }
        .gpm-offers-list { display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; max-height: 180px; overflow-y: auto; }
        .gpm-offers-list.active { display: flex; flex-direction: column; gap: 8px; }
        .gpm-offer-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
        .gpm-offer-item:hover { border-color: #4f46e5; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.05); }
        .gpm-offer-item.selected { border-color: #4f46e5; background: #eef2ff; }
        .gpm-offer-name { font-weight: 600; color: #1e293b; font-size: 0.85rem; }
        .gpm-offer-val { font-weight: 700; color: #10b981; font-size: 0.85rem; }

        /* Membership Badge */
        .gpm-membership-alert {
            display: none; background: #fefce8; border: 1px solid #fef08a; padding: 12px 16px; border-radius: 12px; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .gpm-membership-alert.active { display: flex; }
        .gpm-membership-icon { color: #eab308; display: flex; align-items: center; justify-content: center; }
        .gpm-membership-text { flex: 1; font-size: 0.85rem; color: #854d0e; font-weight: 600; }
        .gpm-membership-val { font-size: 1rem; font-weight: 800; color: #eab308; }

        /* Payment Methods */
        .gpm-methods { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .gpm-method-btn { height: 52px; border: 2px solid #f1f5f9; background: #ffffff; color: #64748b; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .gpm-method-btn.active { border-color: #e0e7ff; background: #eef2ff; color: #4338ca; }

        /* Footer */
        .gpm-footer { padding: 24px 32px; background: #fff; display: flex; gap: 16px; border-top: 1px solid #f8fafc; }
        .gpm-btn-cancel { flex: 1; height: 56px; border-radius: 14px; font-weight: 700; font-size: 1rem; border: 2px solid #e2e8f0; background: #fff; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .gpm-btn-cancel:hover { background: #f8fafc; }
        .gpm-btn-proceed { flex: 2; height: 56px; border-radius: 14px; font-weight: 700; font-size: 1.1rem; background: #1e3a8a; color: #fff; border: none; box-shadow: 0 4px 6px -1px rgba(30, 58, 138, 0.2); cursor: pointer; transition: all 0.2s; }
        .gpm-btn-proceed:hover { background: #1e40af; box-shadow: 0 6px 10px -1px rgba(30, 58, 138, 0.3); }
        .gpm-btn-proceed:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }

        /* Line Items for Discounts */
        .gpm-breakdown { font-size: 0.85rem; color: #64748b; margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
        .gpm-breakdown-row { display: flex; justify-content: space-between; }
        .gpm-breakdown-row.discount { color: #10b981; font-weight: 500; }
        .gpm-breakdown-row.total { border-top: 1px dashed #e2e8f0; padding-top: 6px; font-weight: 700; color: #1e293b; font-size: 0.95rem; }
    `;
    document.head.appendChild(style);
}

function injectGlobalPaymentModalHTML() {
    if (document.getElementById('gpmOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gpmOverlay';
    overlay.innerHTML = `
        <div id="gpmContent">
            <div class="gpm-header">
                <div>
                    <h2 id="gpmTitle">Collect Payment</h2>
                    <p id="gpmSubtitle" class="gpm-subtitle">Sale ID · Customer · Items</p>
                </div>
                <button class="gpm-close-btn" id="gpmBtnClose"><i data-feather="x"></i></button>
            </div>

            <div class="gpm-body">
                <!-- Summary Stats -->
                <div class="gpm-stats">
                    <div class="gpm-stat-box">
                        <p class="gpm-stat-label">Subtotal</p>
                        <h3 class="gpm-stat-val" style="color: #1e293b;" id="gpmStatSubtotal">₹0</h3>
                    </div>
                    <div class="gpm-stat-box">
                        <p class="gpm-stat-label">Paid</p>
                        <h3 class="gpm-stat-val" style="color: #10b981;" id="gpmStatPaid">₹0</h3>
                    </div>
                    <div class="gpm-stat-box">
                        <p class="gpm-stat-label">Final Due</p>
                        <h3 class="gpm-stat-val" style="color: #ef4444;" id="gpmStatDue">₹0</h3>
                    </div>
                </div>

                <!-- Membership Alert -->
                <div class="gpm-section" id="gpmMembershipSection" style="display:none; padding-bottom:0; border-bottom:none;">
                    <div class="gpm-membership-alert" id="gpmMembershipAlert">
                        <div class="gpm-membership-icon"><i data-feather="star"></i></div>
                        <div class="gpm-membership-text" id="gpmMembershipText">Gold Member Applied</div>
                        <div class="gpm-membership-val" id="gpmMembershipVal">-10%</div>
                    </div>
                </div>

                <!-- Discounts & Coupons -->
                <div class="gpm-section" id="gpmDiscountSection">
                    <div class="gpm-section-title">Discounts & Offers</div>
                    
                    <button id="gpmBtnCheckOffers" class="gpm-btn-check-offers"><i data-feather="tag" style="width:16px;height:16px;"></i> Check Available Offers</button>
                    <div id="gpmOffersListContainer" class="gpm-offers-list">
                        <!-- Offers injected here -->
                    </div>
                    
                    <label style="font-size: 0.75rem; font-weight: 600; color: #94a3b8; display:block; margin-bottom: 6px;">Manual Discount</label>
                    <div class="gpm-discount-row">
                        <div class="gpm-discount-toggle">
                            <button id="gpmToggleFlat" class="active">₹</button>
                            <button id="gpmTogglePct">%</button>
                        </div>
                        <input type="number" id="gpmDiscountInput" class="gpm-input" placeholder="0" min="0">
                    </div>

                    <label style="font-size: 0.75rem; font-weight: 600; color: #94a3b8; display:block; margin-bottom: 6px;">Coupon Code</label>
                    <div class="gpm-coupon-row">
                        <input type="text" id="gpmCouponInput" class="gpm-input" placeholder="Enter code" style="text-transform: uppercase;">
                        <button id="gpmBtnApplyCoupon" class="gpm-btn-apply">Apply</button>
                    </div>
                    <p id="gpmCouponMsg" style="font-size: 0.75rem; margin-top: 6px; display: none;"></p>

                    <!-- Breakdown -->
                    <div class="gpm-breakdown" id="gpmBreakdown">
                        <!-- Injected via JS -->
                    </div>
                </div>

                <!-- Payment Method -->
                <div class="gpm-section" style="border-bottom: none;">
                    <div class="gpm-section-title">Payment Method <span style="color: #ef4444;">*</span></div>
                    <div class="gpm-methods" id="gpmMethods">
                        <button class="gpm-method-btn active" data-method="cash">
                            <i data-feather="dollar-sign"></i> Cash
                        </button>
                        <button class="gpm-method-btn" data-method="card">
                            <i data-feather="credit-card"></i> Card
                        </button>
                        <button class="gpm-method-btn" data-method="upi">
                            <i data-feather="smartphone"></i> UPI
                        </button>
                    </div>
                </div>
            </div>

            <div class="gpm-footer">
                <button class="gpm-btn-cancel" id="gpmBtnCancel">Cancel</button>
                <button class="gpm-btn-proceed" id="gpmBtnProceed">Record Payment (₹0)</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    if (window.feather) feather.replace();
}

// ── Bind Events ────────────────────────────────────────────────────────────
function bindGlobalPaymentModalEvents() {
    // Close
    document.getElementById('gpmBtnClose').addEventListener('click', closeGlobalPaymentModal);
    document.getElementById('gpmBtnCancel').addEventListener('click', closeGlobalPaymentModal);

    // Offers List Toggle
    document.getElementById('gpmBtnCheckOffers').addEventListener('click', () => {
        const listEl = document.getElementById('gpmOffersListContainer');
        if (listEl.classList.contains('active')) {
            listEl.classList.remove('active');
        } else {
            listEl.classList.add('active');
        }
    });

    // Payment Methods
    document.querySelectorAll('.gpm-method-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.gpm-method-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            paymentState.method = e.currentTarget.dataset.method;
        });
    });

    // Discount Toggle
    document.getElementById('gpmToggleFlat').addEventListener('click', () => {
        document.getElementById('gpmToggleFlat').classList.add('active');
        document.getElementById('gpmTogglePct').classList.remove('active');
        paymentState.discountType = 'flat';
        calculateFinalDue();
    });
    document.getElementById('gpmTogglePct').addEventListener('click', () => {
        document.getElementById('gpmTogglePct').classList.add('active');
        document.getElementById('gpmToggleFlat').classList.remove('active');
        paymentState.discountType = 'percent';
        calculateFinalDue();
    });

    // Discount Input
    document.getElementById('gpmDiscountInput').addEventListener('input', (e) => {
        paymentState.discountValue = parseFloat(e.target.value) || 0;
        calculateFinalDue();
    });

    // Coupon Apply
    document.getElementById('gpmBtnApplyCoupon').addEventListener('click', applyCouponCode);

    // Proceed
    document.getElementById('gpmBtnProceed').addEventListener('click', finalizePayment);
}

// ── Open Modal API ─────────────────────────────────────────────────────────
/**
 * Opens the global payment modal
 * @param {Object} config - The configuration object (see structure above)
 */
window.openGlobalPaymentModal = async function(config) {
    if (!config || !config.totalAmount) {
        console.error("Invalid config provided to openGlobalPaymentModal");
        return;
    }

    globalPaymentConfig = config;
    
    // Reset State
    paymentState = {
        method: 'cash',
        discountType: 'flat',
        discountValue: 0,
        appliedCoupon: null,
        appliedMembership: null,
        appliedOffer: null,
        finalDue: 0
    };

    // Reset UI
    document.getElementById('gpmToggleFlat').classList.add('active');
    document.getElementById('gpmTogglePct').classList.remove('active');
    document.getElementById('gpmDiscountInput').value = '';
    document.getElementById('gpmCouponInput').value = '';
    document.getElementById('gpmCouponInput').disabled = false;
    document.getElementById('gpmBtnApplyCoupon').disabled = false;
    document.getElementById('gpmBtnApplyCoupon').textContent = 'Apply';
    document.getElementById('gpmCouponMsg').style.display = 'none';
    
    document.querySelectorAll('.gpm-method-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.gpm-method-btn[data-method="cash"]').classList.add('active');

    // Set Header
    document.getElementById('gpmSubtitle').textContent = `${config.saleId || 'New Sale'} · ${config.customerName || 'Walk-in'}`;
    document.getElementById('gpmStatSubtotal').textContent = `₹${config.totalAmount}`;
    document.getElementById('gpmStatPaid').textContent = `₹${config.amountPaid || 0}`;

    // Fetch Membership if applicable
    document.getElementById('gpmMembershipSection').style.display = 'none';
    document.getElementById('gpmMembershipAlert').classList.remove('active');
    
    if (config.customerId && !config.isMembershipPurchase) {
        await fetchCustomerMembership(config.customerId);
    }

    // Fetch Offers
    await fetchActiveOffers();

    calculateFinalDue();

    // Show
    document.getElementById('gpmOverlay').classList.add('active');
};

function closeGlobalPaymentModal() {
    document.getElementById('gpmOverlay').classList.remove('active');
}

// ── Logic ──────────────────────────────────────────────────────────────────

async function fetchCustomerMembership(customerId) {
    try {
        const { supabase } = await import('./lib/supabase.js');
        
        // Find active customer membership
        const { data: cmData, error: cmError } = await supabase
            .from('customer_memberships')
            .select('membership_id')
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .gte('end_date', new Date().toISOString().split('T')[0])
            .limit(1);

        if (cmError || !cmData || cmData.length === 0) return;

        // Fetch membership details
        const { data: mData, error: mError } = await supabase
            .from('memberships')
            .select('name, service_discount_percentage')
            .eq('membership_id', cmData[0].membership_id)
            .single();

        if (mError || !mData) return;

        paymentState.appliedMembership = {
            name: mData.name,
            discount_percentage: mData.service_discount_percentage || 0
        };

        if (paymentState.appliedMembership.discount_percentage > 0) {
            document.getElementById('gpmMembershipSection').style.display = 'block';
            document.getElementById('gpmMembershipAlert').classList.add('active');
            document.getElementById('gpmMembershipText').textContent = `${mData.name} Member Applied`;
            document.getElementById('gpmMembershipVal').textContent = `-${mData.service_discount_percentage}%`;
        }

    } catch (err) {
        console.error("Error fetching membership for checkout:", err);
    }
}

async function fetchActiveOffers() {
    try {
        const { supabase } = await import('./lib/supabase.js');
        const companyId = localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value;

        // Fetch active offers
        const { data, error } = await supabase
            .from('offers')
            .select('offer_id, offer_name, discount_type, discount_value')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('status', 'active');

        if (error) throw error;

        // Dedup offers (in case of multiple services)
        const uniqueOffersMap = new Map();
        if (data) {
            data.forEach(o => {
                if (!uniqueOffersMap.has(o.offer_id)) {
                    uniqueOffersMap.set(o.offer_id, o);
                }
            });
        }
        liveOffersDB = Array.from(uniqueOffersMap.values());
        
        renderOffersList();

    } catch (err) {
        console.error("Error fetching offers for payment modal:", err);
        liveOffersDB = [];
        renderOffersList();
    }
}

function renderOffersList() {
    const listEl = document.getElementById('gpmOffersListContainer');
    if (liveOffersDB.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 8px;">No active offers available</div>`;
        return;
    }

    listEl.innerHTML = liveOffersDB.map(o => {
        const valStr = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
        const isSelected = paymentState.appliedOffer && paymentState.appliedOffer.id === o.offer_id;
        return `
            <div class="gpm-offer-item ${isSelected ? 'selected' : ''}" data-id="${o.offer_id}">
                <div class="gpm-offer-name">${o.offer_name}</div>
                <div class="gpm-offer-val">${valStr}</div>
            </div>
        `;
    }).join('');

    // Bind click events
    listEl.querySelectorAll('.gpm-offer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const offerId = e.currentTarget.dataset.id;
            
            if (paymentState.appliedOffer && paymentState.appliedOffer.id === offerId) {
                // Deselect
                paymentState.appliedOffer = null;
            } else {
                // Select
                const o = liveOffersDB.find(x => x.offer_id === offerId);
                if (o) {
                    paymentState.appliedOffer = {
                        id: o.offer_id,
                        name: o.offer_name,
                        type: o.discount_type,
                        value: o.discount_value
                    };
                }
            }
            
            renderOffersList(); // re-render to update selected styling
            calculateFinalDue();
            
            // Optionally close the list
            listEl.classList.remove('active');
        });
    });
}

async function applyCouponCode() {
    const codeInput = document.getElementById('gpmCouponInput');
    const msgEl = document.getElementById('gpmCouponMsg');
    const btnApply = document.getElementById('gpmBtnApplyCoupon');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        if (paymentState.appliedCoupon) {
            // Remove coupon logic
            paymentState.appliedCoupon = null;
            btnApply.textContent = 'Apply';
            btnApply.style.background = '#1e293b';
            msgEl.style.display = 'none';
            calculateFinalDue();
        }
        return;
    }

    if (paymentState.appliedCoupon) {
        // If one is already applied, this button acts as "Remove"
        paymentState.appliedCoupon = null;
        codeInput.value = '';
        codeInput.disabled = false;
        btnApply.textContent = 'Apply';
        btnApply.style.background = '#1e293b';
        msgEl.style.display = 'none';
        calculateFinalDue();
        return;
    }

    try {
        btnApply.textContent = '...';
        btnApply.disabled = true;

        const { supabase } = await import('./lib/supabase.js');
        const companyId = localStorage.getItem('company_id');

        const { data, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('company_id', companyId)
            .eq('code', code)
            .eq('status', 'active')
            .single();

        if (error || !data) {
            throw new Error("Invalid or inactive coupon code.");
        }

        // Validate dates
        const now = new Date();
        if (data.start_date && new Date(data.start_date) > now) throw new Error("Coupon not active yet.");
        if (data.end_date && new Date(data.end_date) < now) throw new Error("Coupon expired.");

        // Check usage limits if we wanted to (omitted for brevity, assume valid if active)

        paymentState.appliedCoupon = {
            id: data.coupon_id,
            code: data.code,
            type: data.discount_type, // 'percentage' or 'flat'
            value: data.discount_value
        };

        // UI Update
        msgEl.textContent = "Coupon applied successfully!";
        msgEl.style.color = "#10b981";
        msgEl.style.display = "block";
        
        codeInput.disabled = true;
        btnApply.textContent = 'Remove';
        btnApply.style.background = '#ef4444';
        btnApply.disabled = false;

        calculateFinalDue();

    } catch (err) {
        console.error(err);
        msgEl.textContent = err.message || "Error validating coupon.";
        msgEl.style.color = "#ef4444";
        msgEl.style.display = "block";
        btnApply.textContent = 'Apply';
        btnApply.disabled = false;
    }
}

function calculateFinalDue() {
    if (!globalPaymentConfig) return;

    const baseAmount = globalPaymentConfig.totalAmount || 0;
    let discountAmount = 0;
    const breakdownHtml = [];

    breakdownHtml.push(`
        <div class="gpm-breakdown-row">
            <span>Subtotal</span>
            <span>₹${baseAmount}</span>
        </div>
    `);

    // 1. Membership Discount
    let memDiscount = 0;
    if (paymentState.appliedMembership && paymentState.appliedMembership.discount_percentage > 0) {
        memDiscount = baseAmount * (paymentState.appliedMembership.discount_percentage / 100);
        discountAmount += memDiscount;
        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Membership (${paymentState.appliedMembership.discount_percentage}%)</span>
                <span>-₹${memDiscount.toFixed(2)}</span>
            </div>
        `);
    }

    // Amount after membership
    let amountAfterMem = baseAmount - memDiscount;

    // 2. Coupon Discount
    let coupDiscount = 0;
    if (paymentState.appliedCoupon) {
        if (paymentState.appliedCoupon.type === 'percentage') {
            coupDiscount = amountAfterMem * (paymentState.appliedCoupon.value / 100);
        } else {
            coupDiscount = paymentState.appliedCoupon.value;
        }
        
        // Prevent negative
        if (coupDiscount > amountAfterMem) coupDiscount = amountAfterMem;
        discountAmount += coupDiscount;
        amountAfterMem -= coupDiscount;

        const valStr = paymentState.appliedCoupon.type === 'percentage' ? `${paymentState.appliedCoupon.value}%` : `₹${paymentState.appliedCoupon.value}`;
        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Coupon (${paymentState.appliedCoupon.code})</span>
                <span>-₹${coupDiscount.toFixed(2)}</span>
            </div>
        `);
    }

    // 3. Offer Discount
    let offerDiscount = 0;
    if (paymentState.appliedOffer) {
        if (paymentState.appliedOffer.type === 'percentage') {
            offerDiscount = amountAfterMem * (paymentState.appliedOffer.value / 100);
        } else {
            offerDiscount = paymentState.appliedOffer.value;
        }

        if (offerDiscount > amountAfterMem) offerDiscount = amountAfterMem;
        discountAmount += offerDiscount;
        amountAfterMem -= offerDiscount;

        const valStr = paymentState.appliedOffer.type === 'percentage' ? `${paymentState.appliedOffer.value}%` : `₹${paymentState.appliedOffer.value}`;
        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Offer (${paymentState.appliedOffer.name})</span>
                <span>-₹${offerDiscount.toFixed(2)}</span>
            </div>
        `);
    }

    // 4. Manual Discount
    let manDiscount = 0;
    if (paymentState.discountValue > 0) {
        if (paymentState.discountType === 'percent') {
            manDiscount = amountAfterMem * (paymentState.discountValue / 100);
        } else {
            manDiscount = paymentState.discountValue;
        }

        if (manDiscount > amountAfterMem) manDiscount = amountAfterMem;
        discountAmount += manDiscount;

        const valStr = paymentState.discountType === 'percent' ? `${paymentState.discountValue}%` : `₹${paymentState.discountValue}`;
        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Manual Discount (${valStr})</span>
                <span>-₹${manDiscount.toFixed(2)}</span>
            </div>
        `);
    }

    // Calculate Final Due
    let finalPayable = baseAmount - discountAmount;
    if (finalPayable < 0) finalPayable = 0;

    // Deduct already paid amount (for pending payments)
    const alreadyPaid = globalPaymentConfig.amountPaid || 0;
    paymentState.finalDue = finalPayable - alreadyPaid;
    if (paymentState.finalDue < 0) paymentState.finalDue = 0;

    breakdownHtml.push(`
        <div class="gpm-breakdown-row total">
            <span>New Total</span>
            <span>₹${Math.round(finalPayable)}</span>
        </div>
    `);

    document.getElementById('gpmBreakdown').innerHTML = breakdownHtml.join('');
    document.getElementById('gpmStatDue').textContent = `₹${Math.round(paymentState.finalDue)}`;
    
    const btnProceed = document.getElementById('gpmBtnProceed');
    btnProceed.textContent = `Record Payment (₹${Math.round(paymentState.finalDue)})`;
}

async function finalizePayment() {
    if (!globalPaymentConfig || typeof globalPaymentConfig.onComplete !== 'function') return;

    const btn = document.getElementById('gpmBtnProceed');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    // Build the result object to pass back to the caller
    const resultPayload = {
        paymentMethod: paymentState.method,
        amountCollected: Math.round(paymentState.finalDue),
        discounts: {
            manualType: paymentState.discountValue > 0 ? paymentState.discountType : null,
            manualValue: paymentState.discountValue > 0 ? paymentState.discountValue : 0,
            couponId: paymentState.appliedCoupon ? paymentState.appliedCoupon.id : null,
            couponCode: paymentState.appliedCoupon ? paymentState.appliedCoupon.code : null,
            offerId: paymentState.appliedOffer ? paymentState.appliedOffer.id : null,
            offerName: paymentState.appliedOffer ? paymentState.appliedOffer.name : null,
            membershipName: paymentState.appliedMembership ? paymentState.appliedMembership.name : null,
            membershipDiscountPct: paymentState.appliedMembership ? paymentState.appliedMembership.discount_percentage : 0
        }
    };

    try {
        await globalPaymentConfig.onComplete(resultPayload);
        closeGlobalPaymentModal();
    } catch (err) {
        console.error("Payment failed:", err);
        alert(err.message || "An error occurred while processing the payment.");
    } finally {
        btn.disabled = false;
        btn.textContent = `Record Payment (₹${Math.round(paymentState.finalDue)})`;
    }
}
