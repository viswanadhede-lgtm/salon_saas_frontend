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
            max-width: 920px;
            width: 96%;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.3);
            transform: translateY(20px) scale(0.97);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            max-height: 94vh;
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
            padding: 0; background: #fff; flex: 1; overflow: hidden;
            display: grid; grid-template-columns: 1fr 1fr;
        }
        .gpm-left-col {
            display: flex; flex-direction: column;
            border-right: 1px solid #f1f5f9;
            overflow-y: auto;
        }
        .gpm-right-col {
            display: flex; flex-direction: column;
            overflow-y: auto;
        }

        .gpm-stats {
            background: linear-gradient(135deg, #1e3a8a 0%, #4f46e5 100%);
            padding: 28px 32px;
            display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;
        }
        .gpm-stat-box { text-align: center; }
        .gpm-stat-label { font-size: 0.65rem; color: rgba(255,255,255,0.7); margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em; }
        .gpm-stat-val { font-size: 1.5rem; font-weight: 800; margin: 0; color: #fff; }
        .gpm-stat-val.paid { color: #86efac; }
        .gpm-stat-val.due { color: #fca5a5; }

        .gpm-section { padding: 20px 28px; border-bottom: 1px solid #f1f5f9; }
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
        .gpm-btn-check-offers { width: 100%; height: 42px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; color: #475569; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.875rem; }
        .gpm-btn-check-offers:hover { background: #f1f5f9; border-color: #4f46e5; color: #4f46e5; }
        .gpm-offers-list { display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 16px; max-height: 220px; overflow-y: auto; }
        .gpm-offers-list.active { display: flex; flex-direction: column; gap: 8px; }
        .gpm-offer-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 8px; gap: 10px; }
        .gpm-offer-item.applied { border-color: #4f46e5; background: #eef2ff; }
        .gpm-offer-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .gpm-offer-name { font-weight: 600; color: #1e293b; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gpm-offer-badge { font-weight: 700; font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; display: inline-block; width: fit-content; }
        .gpm-offer-badge.pct { background: #dcfce7; color: #166534; }
        .gpm-offer-badge.flat { background: #dbeafe; color: #1e40af; }
        .gpm-offer-apply-btn { flex-shrink: 0; height: 32px; padding: 0 14px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; }
        .gpm-offer-apply-btn.apply { background: #4f46e5; color: #fff; }
        .gpm-offer-apply-btn.apply:hover { background: #4338ca; }
        .gpm-offer-apply-btn.remove { background: #fee2e2; color: #b91c1c; }
        .gpm-offer-apply-btn.remove:hover { background: #fecaca; }

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
        .gpm-method-btn { height: 64px; border: 2px solid #f1f5f9; background: #ffffff; color: #64748b; border-radius: 14px; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
        .gpm-method-btn:hover { border-color: #c7d2fe; background: #f8faff; }
        .gpm-method-btn.active { border-color: #4f46e5; background: #eef2ff; color: #4338ca; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        .gpm-method-btn i { width: 20px; height: 20px; }

        /* Footer */
        .gpm-footer { padding: 20px 32px; background: #fff; display: flex; gap: 16px; border-top: 1px solid #f1f5f9; }
        .gpm-btn-cancel { flex: 1; height: 52px; border-radius: 12px; font-weight: 700; font-size: 1rem; border: 2px solid #e2e8f0; background: #fff; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .gpm-btn-cancel:hover { background: #f8fafc; }
        .gpm-btn-proceed { flex: 2; height: 52px; border-radius: 12px; font-weight: 700; font-size: 1.05rem; background: linear-gradient(135deg, #1e3a8a 0%, #4f46e5 100%); color: #fff; border: none; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.3); cursor: pointer; transition: all 0.2s; }
        .gpm-btn-proceed:hover { box-shadow: 0 6px 16px rgba(30, 58, 138, 0.4); transform: translateY(-1px); }
        .gpm-btn-proceed:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; transform: none; }

        /* Membership Toggle */
        .gpm-membership-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #fefce8; border: 1px solid #fef08a; border-radius: 12px; margin-bottom: 0; }
        .gpm-membership-toggle-label { display: flex; flex-direction: column; gap: 2px; }
        .gpm-membership-toggle-label strong { font-size: 0.875rem; color: #854d0e; font-weight: 700; }
        .gpm-membership-toggle-label span { font-size: 0.75rem; color: #a16207; }
        .gpm-toggle-switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
        .gpm-toggle-switch input { opacity: 0; width: 0; height: 0; }
        .gpm-toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #cbd5e1; border-radius: 999px; transition: 0.3s; }
        .gpm-toggle-slider:before { position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
        .gpm-toggle-switch input:checked + .gpm-toggle-slider { background: #eab308; }
        .gpm-toggle-switch input:checked + .gpm-toggle-slider:before { transform: translateX(20px); }
        .gpm-membership-result { margin-top: 10px; font-size: 0.8rem; padding: 8px 12px; border-radius: 8px; display: none; }
        .gpm-membership-result.found { background: #dcfce7; color: #166534; font-weight: 600; display: block; }
        .gpm-membership-result.not-found { background: #fee2e2; color: #b91c1c; display: block; }
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

                <!-- LEFT COLUMN -->
                <div class="gpm-left-col">

                    <!-- Summary Stats -->
                    <div class="gpm-stats">
                        <div class="gpm-stat-box">
                            <p class="gpm-stat-label">Subtotal</p>
                            <h3 class="gpm-stat-val" id="gpmStatSubtotal">₹0</h3>
                        </div>
                        <div class="gpm-stat-box">
                            <p class="gpm-stat-label">Paid</p>
                            <h3 class="gpm-stat-val paid" id="gpmStatPaid">₹0</h3>
                        </div>
                        <div class="gpm-stat-box">
                            <p class="gpm-stat-label">Final Due</p>
                            <h3 class="gpm-stat-val due" id="gpmStatDue">₹0</h3>
                        </div>
                    </div>

                    <!-- Membership Toggle -->
                    <div class="gpm-section" id="gpmMembershipSection">
                        <div class="gpm-section-title">Membership Discount</div>
                        <div class="gpm-membership-toggle-row">
                            <div class="gpm-membership-toggle-label">
                                <strong>Apply Membership Discount</strong>
                                <span id="gpmMembershipSubtitle">Toggle to check customer's membership</span>
                            </div>
                            <label class="gpm-toggle-switch">
                                <input type="checkbox" id="gpmMembershipToggle">
                                <span class="gpm-toggle-slider"></span>
                            </label>
                        </div>
                        <div class="gpm-membership-result" id="gpmMembershipResult"></div>
                    </div>

                    <!-- Payment Method -->
                    <div class="gpm-section" style="flex:1;">
                        <div class="gpm-section-title">Payment Method <span style="color: #ef4444;">*</span></div>
                        <div class="gpm-methods" id="gpmMethods">
                            <button class="gpm-method-btn active" data-method="cash">
                                <i data-feather="dollar-sign"></i>
                                <span>Cash</span>
                            </button>
                            <button class="gpm-method-btn" data-method="card">
                                <i data-feather="credit-card"></i>
                                <span>Card</span>
                            </button>
                            <button class="gpm-method-btn" data-method="upi">
                                <i data-feather="smartphone"></i>
                                <span>UPI</span>
                            </button>
                        </div>
                    </div>

                </div>

                <!-- RIGHT COLUMN -->
                <div class="gpm-right-col">

                    <!-- Discounts & Offers -->
                    <div class="gpm-section" style="flex:1; border-bottom:none;">
                        <div class="gpm-section-title">Discounts &amp; Offers</div>

                        <!-- Offers -->
                        <button id="gpmBtnCheckOffers" class="gpm-btn-check-offers"><i data-feather="tag" style="width:16px;height:16px;"></i> Check Available Offers</button>
                        <div id="gpmOffersListContainer" class="gpm-offers-list">
                            <!-- Offers injected here -->
                        </div>

                        <!-- Manual Discount -->
                        <label style="font-size: 0.75rem; font-weight: 600; color: #94a3b8; display:block; margin-bottom: 6px;">Manual Discount</label>
                        <div class="gpm-discount-row">
                            <div class="gpm-discount-toggle">
                                <button id="gpmToggleFlat" class="active">₹</button>
                                <button id="gpmTogglePct">%</button>
                            </div>
                            <input type="number" id="gpmDiscountInput" class="gpm-input" placeholder="0" min="0">
                        </div>

                        <!-- Coupon Code -->
                        <label style="font-size: 0.75rem; font-weight: 600; color: #94a3b8; display:block; margin-bottom: 6px;">Coupon Code</label>
                        <div class="gpm-coupon-row">
                            <input type="text" id="gpmCouponInput" class="gpm-input" placeholder="Enter code" style="text-transform: uppercase;">
                            <button id="gpmBtnApplyCoupon" class="gpm-btn-apply">Apply</button>
                        </div>
                        <p id="gpmCouponMsg" style="font-size: 0.75rem; margin-top: 6px; display: none;"></p>

                        <!-- Breakdown -->
                        <div class="gpm-breakdown" id="gpmBreakdown" style="margin-top: 20px;">
                            <!-- Injected via JS -->
                        </div>
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

    // Membership Toggle
    document.getElementById('gpmMembershipToggle').addEventListener('change', async (e) => {
        if (e.target.checked) {
            // Fetch membership for current customer
            if (globalPaymentConfig?.customerId) {
                await fetchCustomerMembership(globalPaymentConfig.customerId);
            }
        } else {
            // Remove membership discount
            paymentState.appliedMembership = null;
            const resultEl = document.getElementById('gpmMembershipResult');
            resultEl.className = 'gpm-membership-result';
            resultEl.textContent = '';
            document.getElementById('gpmMembershipSubtitle').textContent = 'Toggle to check customer\'s membership';
            calculateFinalDue();
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

    // Show/hide membership toggle only when customerId is available and not a membership purchase
    const memSection = document.getElementById('gpmMembershipSection');
    const memToggle = document.getElementById('gpmMembershipToggle');
    if (config.customerId && !config.isMembershipPurchase) {
        memSection.style.display = 'block';
        memToggle.checked = false;
        document.getElementById('gpmMembershipResult').className = 'gpm-membership-result';
        document.getElementById('gpmMembershipResult').textContent = '';
        document.getElementById('gpmMembershipSubtitle').textContent = 'Toggle to check customer\'s membership';
    } else {
        memSection.style.display = 'none';
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
    const resultEl = document.getElementById('gpmMembershipResult');
    const subtitleEl = document.getElementById('gpmMembershipSubtitle');

    resultEl.className = 'gpm-membership-result';
    resultEl.textContent = 'Checking...';
    resultEl.style.display = 'block';

    try {
        const { supabase } = await import('../lib/supabase.js');

        const today = new Date().toISOString().split('T')[0];

        // Step 1: Find active membership purchase for this customer
        const { data: purchases, error: pErr } = await supabase
            .from('membership_purchases')
            .select('membership_id, plan_name, expiry_date')
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .gte('expiry_date', today)
            .limit(1);

        if (pErr || !purchases || purchases.length === 0) {
            paymentState.appliedMembership = null;
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = 'No active membership found for this customer.';
            subtitleEl.textContent = 'No active membership';
            calculateFinalDue();
            return;
        }

        const purchase = purchases[0];

        // Step 2: Fetch discount details from memberships table
        const { data: membership, error: mErr } = await supabase
            .from('memberships')
            .select('plan_name, discount_type, discount_value')
            .eq('membership_id', purchase.membership_id)
            .single();

        if (mErr || !membership || !membership.discount_value) {
            paymentState.appliedMembership = null;
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = 'Membership found but no discount configured.';
            calculateFinalDue();
            return;
        }

        // Apply membership discount
        paymentState.appliedMembership = {
            name: membership.plan_name || purchase.plan_name,
            type: membership.discount_type,   // 'percentage' or 'flat'
            value: membership.discount_value
        };

        const valStr = membership.discount_type === 'percentage'
            ? `${membership.discount_value}% OFF`
            : `₹${membership.discount_value} OFF`;

        resultEl.className = 'gpm-membership-result found';
        resultEl.textContent = `✓ ${paymentState.appliedMembership.name} — ${valStr} applied!`;
        subtitleEl.textContent = `${paymentState.appliedMembership.name} active`;

        calculateFinalDue();

    } catch (err) {
        console.error('Error fetching membership:', err);
        paymentState.appliedMembership = null;
        resultEl.className = 'gpm-membership-result not-found';
        resultEl.textContent = 'Error checking membership.';
        calculateFinalDue();
    }
}

async function fetchActiveOffers() {
    try {
        const { supabase } = await import('../lib/supabase.js');

        // Use exact same pattern as offers.js which successfully loads offers
        let companyId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch {
            companyId = localStorage.getItem('company_id') || null;
        }

        const branchId = localStorage.getItem('active_branch_id')
            || document.getElementById('branchSelect')?.value
            || null;

        console.log('[GPM Offers] companyId:', companyId, 'branchId:', branchId);

        if (!companyId || !branchId) {
            console.warn('[GPM Offers] Missing companyId or branchId');
            liveOffersDB = [];
            renderOffersList();
            return;
        }

        const { data, error } = await supabase
            .from('offers')
            .select('offer_id, offer_name, discount_type, discount_value')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('status', 'active');

        if (error) throw error;

        // Dedup — one row per service, so group by offer_id
        const seen = new Map();
        (data || []).forEach(o => {
            if (!seen.has(o.offer_id)) seen.set(o.offer_id, o);
        });
        liveOffersDB = Array.from(seen.values());
        console.log('[GPM Offers] Loaded:', liveOffersDB);

        renderOffersList();

    } catch (err) {
        console.error('Error fetching offers:', err);
        liveOffersDB = [];
        renderOffersList();
    }
}


function renderOffersList() {
    const listEl = document.getElementById('gpmOffersListContainer');
    if (liveOffersDB.length === 0) {
        listEl.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:0.85rem;padding:12px;">No active offers available</div>`;
        return;
    }

    listEl.innerHTML = liveOffersDB.map(o => {
        const isApplied = paymentState.appliedOffer && paymentState.appliedOffer.id === o.offer_id;
        const badgeClass = o.discount_type === 'percentage' ? 'pct' : 'flat';
        const badgeText  = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
        return `
            <div class="gpm-offer-item ${isApplied ? 'applied' : ''}" data-id="${o.offer_id}">
                <div class="gpm-offer-info">
                    <div class="gpm-offer-name">${o.offer_name}</div>
                    <span class="gpm-offer-badge ${badgeClass}">${badgeText}</span>
                </div>
                <button class="gpm-offer-apply-btn ${isApplied ? 'remove' : 'apply'}" data-id="${o.offer_id}">
                    ${isApplied ? 'Remove' : 'Apply'}
                </button>
            </div>
        `;
    }).join('');

    // Bind Apply/Remove button events
    listEl.querySelectorAll('.gpm-offer-apply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const offerId = btn.dataset.id;
            if (paymentState.appliedOffer && paymentState.appliedOffer.id === offerId) {
                // Remove
                paymentState.appliedOffer = null;
            } else {
                // Apply
                const o = liveOffersDB.find(x => x.offer_id === offerId);
                if (o) {
                    paymentState.appliedOffer = { id: o.offer_id, name: o.offer_name, type: o.discount_type, value: o.discount_value };
                }
            }
            renderOffersList();
            calculateFinalDue();
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

        const { supabase } = await import('../lib/supabase.js');

        let companyId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch {
            companyId = localStorage.getItem('company_id') || null;
        }

        const branchId = localStorage.getItem('active_branch_id')
            || document.getElementById('branchSelect')?.value
            || null;

        // Fetch all rows matching this coupon code (one row per service)
        const { data: rows, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('coupon_code', code)
            .eq('status', 'active');

        if (error || !rows || rows.length === 0) {
            throw new Error('Invalid or inactive coupon code.');
        }

        // Smart service matching:
        // - If the coupon has a service_id, it only applies if that service is in the cart/booking
        // - If service_id is null, it's a global coupon that applies to everything
        const serviceIds = globalPaymentConfig?.serviceIds || [];

        let data = null;

        if (serviceIds.length > 0) {
            // 1. Try to find a row matching one of the booked services
            data = rows.find(r => r.service_id && serviceIds.includes(r.service_id)) || null;
            // 2. Fallback to global coupon (service_id is null)
            if (!data) data = rows.find(r => !r.service_id) || null;
            // 3. If still nothing, the coupon is service-specific and doesn't match
            if (!data) throw new Error('This coupon is not applicable to the selected service(s).');
        } else {
            // No serviceIds provided — prefer global coupon, else take first row
            data = rows.find(r => !r.service_id) || rows[0];
        }

        // Validate dates
        const now = new Date();
        if (data.valid_from && new Date(data.valid_from) > now) throw new Error('Coupon not active yet.');
        if (data.valid_to && new Date(data.valid_to) < now) throw new Error('Coupon expired.');

        // Check usage limit
        if (data.total_usage_limit && data.current_usage_count >= data.total_usage_limit) {
            throw new Error('Coupon usage limit has been reached.');
        }

        paymentState.appliedCoupon = {
            id: data.coupon_id,
            code: data.coupon_code,
            type: data.discount_type,
            value: data.discount_value
        };


        // UI Update
        const valStr = data.discount_type === 'percentage' ? `${data.discount_value}% OFF` : `₹${data.discount_value} OFF`;
        msgEl.textContent = `✓ Coupon applied — ${valStr}!`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';

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
    if (paymentState.appliedMembership && paymentState.appliedMembership.value > 0) {
        if (paymentState.appliedMembership.type === 'percentage') {
            memDiscount = baseAmount * (paymentState.appliedMembership.value / 100);
        } else {
            memDiscount = paymentState.appliedMembership.value;
        }
        if (memDiscount > baseAmount) memDiscount = baseAmount;
        discountAmount += memDiscount;
        const valStr = paymentState.appliedMembership.type === 'percentage'
            ? `${paymentState.appliedMembership.value}%` : `\u20b9${paymentState.appliedMembership.value}`;
        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Membership (${paymentState.appliedMembership.name} \u2014 ${valStr})</span>
                <span>-\u20b9${memDiscount.toFixed(2)}</span>
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
