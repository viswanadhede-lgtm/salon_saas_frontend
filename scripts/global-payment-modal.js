// scripts/global-payment-modal.js

/**
 * Global Payment Modal (Adaptive Broad Modal - 1050px)
 * Shared payment engine and UI for POS, Bookings, and Memberships.
 */

let globalPaymentConfig = null;
let paymentState = {
    method: 'cash',
    discountType: 'flat', // 'flat' or 'percent'
    discountValue: 0,
    appliedCoupon: null,     // { id, code, type, value }
    appliedMembership: null, // { name, type, value }
    appliedOffer: null,      // { id, name, type, value }
    finalDue: 0,
    cashReceived: 0,
    changeReturned: 0
};

let liveOffersDB = [];

// ── Helpers ──────────────────────────────────────────────────────────────────
function gpmFormatCurrency(amt) {
    const n = Number(amt || 0);
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

// ── Inject Styles & HTML on DOMContentLoaded ─────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalPaymentModal);
} else {
    initGlobalPaymentModal();
}

function initGlobalPaymentModal() {
    injectGlobalPaymentModalStyles();
    injectGlobalPaymentModalHTML();
    bindGlobalPaymentModalEvents();
}

function injectGlobalPaymentModalStyles() {
    if (document.getElementById('global-payment-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'global-payment-modal-styles';
    style.textContent = `
        /* Premium Broad Payment Modal Styling (95% viewport) */
        #gpmOverlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.25s ease;
            padding: 2.5vh 2.5vw;
        }
        #gpmOverlay.active {
            display: flex;
            opacity: 1;
        }
        #gpmContent {
            background: #ffffff;
            width: 95vw;
            height: 95vh;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.35);
            transform: translateY(16px) scale(0.98);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            border: 1px solid #e2e8f0;
        }
        #gpmOverlay.active #gpmContent {
            transform: translateY(0) scale(1);
        }

        .gpm-header {
            padding: 20px 28px;
            background: #ffffff;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gpm-type-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            background: #e0e7ff;
            color: #4338ca;
        }
        .gpm-header h2 {
            font-size: 1.35rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
        }
        .gpm-subtitle {
            font-size: 0.82rem;
            color: #64748b;
            margin: 2px 0 0 0;
            font-weight: 500;
        }
        .gpm-close-btn {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            color: #64748b;
            cursor: pointer;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
        }
        .gpm-close-btn:hover {
            background: #fee2e2;
            border-color: #fca5a5;
            color: #dc2626;
        }

        .gpm-body {
            padding: 0;
            background: #ffffff;
            flex: 1;
            overflow: hidden;
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
        }
        @media (max-width: 840px) {
            .gpm-body {
                grid-template-columns: 1fr;
                overflow-y: auto;
            }
        }

        .gpm-left-col {
            display: flex;
            flex-direction: column;
            border-right: 1px solid #f1f5f9;
            overflow-y: auto;
            padding: 20px 24px;
            gap: 16px;
            background: #fafbfc;
        }
        .gpm-right-col {
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 20px 24px;
            gap: 18px;
            background: #ffffff;
        }

        /* Customer Box */
        .gpm-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px 16px;
        }
        .gpm-customer-bar {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gpm-avatar {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: #4f46e5;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.1rem;
            flex-shrink: 0;
        }
        .gpm-cust-details h4 {
            margin: 0 0 2px 0;
            font-size: 0.95rem;
            font-weight: 700;
            color: #1e293b;
        }
        .gpm-cust-details p {
            margin: 0;
            font-size: 0.8rem;
            color: #64748b;
        }

        /* Itemized Items */
        .gpm-items-list {
            max-height: 180px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 8px;
        }
        .gpm-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 10px;
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            border-radius: 8px;
            font-size: 0.85rem;
        }
        .gpm-item-name {
            font-weight: 600;
            color: #334155;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .gpm-item-sub {
            font-size: 0.75rem;
            color: #94a3b8;
        }
        .gpm-item-price {
            font-weight: 700;
            color: #0f172a;
        }
        .gpm-item-qty {
            font-size: 0.75rem;
            color: #64748b;
        }

        /* Discounts & Perks */
        .gpm-section-label {
            font-size: 0.76rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .gpm-discount-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .gpm-discount-toggle {
            display: flex;
            background: #f1f5f9;
            border-radius: 8px;
            overflow: hidden;
            height: 38px;
            flex-shrink: 0;
        }
        .gpm-discount-toggle button {
            border: none;
            background: transparent;
            padding: 0 12px;
            font-weight: 700;
            font-size: 0.85rem;
            color: #64748b;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-discount-toggle button.active {
            background: #4f46e5;
            color: #ffffff;
        }
        .gpm-input {
            height: 38px;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            padding: 0 12px;
            font-size: 0.9rem;
            font-weight: 600;
            color: #1e293b;
            outline: none;
            transition: border-color 0.2s;
            width: 100%;
            background: #ffffff;
        }
        .gpm-input:focus {
            border-color: #4f46e5;
        }

        .gpm-coupon-row {
            display: flex;
            gap: 8px;
        }
        .gpm-btn-apply {
            height: 38px;
            padding: 0 16px;
            background: #1e293b;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.15s;
            flex-shrink: 0;
        }
        .gpm-btn-apply:hover {
            background: #0f172a;
        }

        .gpm-membership-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: #fefce8;
            border: 1px solid #fef08a;
            border-radius: 10px;
        }
        .gpm-toggle-switch {
            position: relative;
            width: 40px;
            height: 22px;
            flex-shrink: 0;
        }
        .gpm-toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .gpm-toggle-slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background: #cbd5e1;
            border-radius: 999px;
            transition: 0.2s;
        }
        .gpm-toggle-slider:before {
            position: absolute;
            content: '';
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background: white;
            border-radius: 50%;
            transition: 0.2s;
        }
        .gpm-toggle-switch input:checked + .gpm-toggle-slider {
            background: #eab308;
        }
        .gpm-toggle-switch input:checked + .gpm-toggle-slider:before {
            transform: translateX(18px);
        }
        .gpm-membership-result {
            margin-top: 6px;
            font-size: 0.78rem;
            padding: 6px 10px;
            border-radius: 6px;
            display: none;
        }
        .gpm-membership-result.found {
            background: #dcfce7;
            color: #166534;
            font-weight: 600;
            display: block;
        }
        .gpm-membership-result.not-found {
            background: #fee2e2;
            color: #b91c1c;
            display: block;
        }

        .gpm-breakdown {
            font-size: 0.85rem;
            color: #64748b;
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px dashed #e2e8f0;
        }
        .gpm-breakdown-row {
            display: flex;
            justify-content: space-between;
        }
        .gpm-breakdown-row.discount {
            color: #10b981;
            font-weight: 600;
        }
        .gpm-breakdown-row.total {
            border-top: 1px solid #e2e8f0;
            padding-top: 6px;
            font-weight: 800;
            color: #0f172a;
            font-size: 1rem;
        }

        /* Right Column Payment Methods & Tendered Amount */
        .gpm-total-card {
            background: linear-gradient(135deg, #1e3a8a 0%, #4338ca 100%);
            border-radius: 14px;
            padding: 18px 22px;
            color: #ffffff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-total-card .label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(255, 255, 255, 0.75);
            font-weight: 700;
        }
        .gpm-total-card .val {
            font-size: 1.75rem;
            font-weight: 900;
            color: #ffffff;
        }

        .gpm-methods-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }
        .gpm-method-card {
            border: 2px solid #f1f5f9;
            background: #ffffff;
            color: #64748b;
            border-radius: 12px;
            padding: 12px 8px;
            font-weight: 700;
            font-size: 0.88rem;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .gpm-method-card:hover {
            border-color: #c7d2fe;
            background: #f8faff;
        }
        .gpm-method-card.active {
            border-color: #4f46e5;
            background: #eef2ff;
            color: #4338ca;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
        }
        .gpm-method-card i {
            width: 20px;
            height: 20px;
        }

        /* Cash Calculator */
        .gpm-cash-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .gpm-chips {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .gpm-chip-btn {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 0.78rem;
            font-weight: 600;
            color: #334155;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-chip-btn:hover {
            background: #eef2ff;
            border-color: #818cf8;
            color: #4338ca;
        }
        .gpm-change-pill {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 700;
        }
        .gpm-change-pill.change {
            background: #dcfce7;
            color: #15803d;
        }
        .gpm-change-pill.due {
            background: #fee2e2;
            color: #b91c1c;
        }

        /* Footer */
        .gpm-footer {
            padding: 16px 28px;
            background: #ffffff;
            display: flex;
            gap: 12px;
            border-top: 1px solid #f1f5f9;
        }
        .gpm-btn-cancel {
            flex: 1;
            height: 48px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.95rem;
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            color: #64748b;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-btn-cancel:hover {
            background: #f8fafc;
            color: #0f172a;
        }
        .gpm-btn-proceed {
            flex: 2;
            height: 48px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 1rem;
            background: linear-gradient(135deg, #1e3a8a 0%, #4f46e5 100%);
            color: #ffffff;
            border: none;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .gpm-btn-proceed:hover {
            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
            transform: translateY(-1px);
        }
        .gpm-btn-proceed:disabled {
            background: #94a3b8;
            cursor: not-allowed;
            box-shadow: none;
            transform: none;
        }
    `;
    document.head.appendChild(style);
}

function injectGlobalPaymentModalHTML() {
    if (document.getElementById('gpmOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gpmOverlay';
    overlay.innerHTML = `
        <div id="gpmContent">
            <!-- Header -->
            <div class="gpm-header">
                <div class="gpm-header-left">
                    <span id="gpmTypeBadge" class="gpm-type-badge">CHECKOUT</span>
                    <div>
                        <h2 id="gpmTitle">Collect Payment</h2>
                        <p id="gpmSubtitle" class="gpm-subtitle">Select payment method and confirm</p>
                    </div>
                </div>
                <button class="gpm-close-btn" id="gpmBtnClose" title="Close"><i data-feather="x"></i></button>
            </div>

            <!-- Body -->
            <div class="gpm-body">
                <!-- LEFT COLUMN: Order & Breakdown -->
                <div class="gpm-left-col">
                    <!-- Customer Bar -->
                    <div class="gpm-card">
                        <div class="gpm-customer-bar">
                            <div class="gpm-avatar" id="gpmCustAvatar">C</div>
                            <div class="gpm-cust-details">
                                <h4 id="gpmCustName">Walk-in Customer</h4>
                                <p id="gpmCustPhone">+91 --</p>
                            </div>
                        </div>
                    </div>

                    <!-- Itemized Items Card -->
                    <div class="gpm-card" id="gpmItemsCard" style="display:none;">
                        <div class="gpm-section-label">
                            <span id="gpmItemsTitle">Order Items</span>
                            <span id="gpmItemsCount" style="color:#64748b; font-size:0.75rem;">0 items</span>
                        </div>
                        <div class="gpm-items-list" id="gpmItemsList"></div>
                    </div>

                    <!-- Discounts & Offers Card -->
                    <div class="gpm-card">
                        <div class="gpm-section-label">Discounts &amp; Loyalty</div>

                        <!-- Membership Discount Toggle -->
                        <div id="gpmMembershipSection" style="margin-bottom:12px;">
                            <div class="gpm-membership-toggle-row">
                                <div>
                                    <strong style="font-size:0.85rem; color:#854d0e; display:block;">Membership Perk</strong>
                                    <span id="gpmMembershipSubtitle" style="font-size:0.75rem; color:#a16207;">Auto-check customer discount</span>
                                </div>
                                <label class="gpm-toggle-switch">
                                    <input type="checkbox" id="gpmMembershipToggle">
                                    <span class="gpm-toggle-slider"></span>
                                </label>
                            </div>
                            <div class="gpm-membership-result" id="gpmMembershipResult"></div>
                        </div>

                        <!-- Coupon Code -->
                        <div style="margin-bottom:12px;">
                            <div class="gpm-coupon-row">
                                <input type="text" id="gpmCouponInput" class="gpm-input" placeholder="COUPON CODE" style="text-transform: uppercase;">
                                <button type="button" id="gpmBtnApplyCoupon" class="gpm-btn-apply">Apply</button>
                            </div>
                            <p id="gpmCouponMsg" style="font-size:0.75rem; margin:4px 0 0 0; display:none;"></p>
                        </div>

                        <!-- Manual Discount -->
                        <div>
                            <div class="gpm-discount-row">
                                <div class="gpm-discount-toggle">
                                    <button type="button" id="gpmToggleFlat" class="active">₹ Flat</button>
                                    <button type="button" id="gpmTogglePct">% Pct</button>
                                </div>
                                <input type="number" id="gpmDiscountInput" class="gpm-input" placeholder="Manual discount value" min="0">
                            </div>
                        </div>

                        <!-- Breakdown -->
                        <div class="gpm-breakdown" id="gpmBreakdown"></div>
                    </div>
                </div>

                <!-- RIGHT COLUMN: Payment Methods & Collection -->
                <div class="gpm-right-col">
                    <!-- Prominent Due Card -->
                    <div class="gpm-total-card">
                        <div>
                            <div class="label">Total Payable</div>
                            <div class="val" id="gpmStatDue">₹0</div>
                        </div>
                        <div style="text-align:right;">
                            <span id="gpmStatSubtotalLabel" style="font-size:0.78rem; opacity:0.8;">Subtotal: ₹0</span>
                        </div>
                    </div>

                    <!-- Payment Method Selector -->
                    <div>
                        <div class="gpm-section-label">Select Payment Method</div>
                        <div class="gpm-methods-grid">
                            <button type="button" class="gpm-method-card active" data-method="cash">
                                <i data-feather="dollar-sign"></i>
                                <span>Cash</span>
                            </button>
                            <button type="button" class="gpm-method-card" data-method="upi">
                                <i data-feather="smartphone"></i>
                                <span>UPI / QR</span>
                            </button>
                            <button type="button" class="gpm-method-card" data-method="card">
                                <i data-feather="credit-card"></i>
                                <span>Card</span>
                            </button>
                        </div>
                    </div>

                    <!-- Cash Calculation Box -->
                    <div class="gpm-cash-box" id="gpmCashBox">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="font-size:0.8rem; font-weight:700; color:#334155;">Cash Tendered</label>
                            <span style="font-size:0.75rem; color:#64748b;">Quick Select</span>
                        </div>
                        <div class="gpm-chips">
                            <button type="button" class="gpm-chip-btn" id="gpmChipExact">Exact</button>
                            <button type="button" class="gpm-chip-btn" data-add="500">₹500</button>
                            <button type="button" class="gpm-chip-btn" data-add="1000">₹1,000</button>
                            <button type="button" class="gpm-chip-btn" data-add="2000">₹2,000</button>
                        </div>
                        <input type="number" id="gpmCashReceived" class="gpm-input" placeholder="Amount received from customer" min="0">
                        <div class="gpm-change-pill change" id="gpmChangePill" style="display:none;">
                            <span>Change to Return</span>
                            <span id="gpmChangeAmount">₹0</span>
                        </div>
                    </div>

                    <!-- Notes / Reference -->
                    <div>
                        <div class="gpm-section-label">Reference / Note (Optional)</div>
                        <input type="text" id="gpmPaymentNote" class="gpm-input" placeholder="e.g., UPI Transaction ID, Card Slip #">
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="gpm-footer">
                <button type="button" class="gpm-btn-cancel" id="gpmBtnCancel">Cancel</button>
                <button type="button" class="gpm-btn-proceed" id="gpmBtnProceed">
                    <span>Collect Payment (₹0)</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.feather) feather.replace();
}

function bindGlobalPaymentModalEvents() {
    document.getElementById('gpmBtnClose')?.addEventListener('click', closeGlobalPaymentModal);
    document.getElementById('gpmBtnCancel')?.addEventListener('click', closeGlobalPaymentModal);

    // Click outside to close
    document.getElementById('gpmOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'gpmOverlay') closeGlobalPaymentModal();
    });

    // Payment Methods
    document.querySelectorAll('.gpm-method-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            paymentState.method = target.dataset.method;

            const cashBox = document.getElementById('gpmCashBox');
            if (cashBox) {
                cashBox.style.display = paymentState.method === 'cash' ? 'flex' : 'none';
            }
        });
    });

    // Membership Toggle
    document.getElementById('gpmMembershipToggle')?.addEventListener('change', async (e) => {
        if (e.target.checked) {
            if (globalPaymentConfig?.customerId) {
                await fetchCustomerMembership(globalPaymentConfig.customerId);
            }
        } else {
            paymentState.appliedMembership = null;
            const resEl = document.getElementById('gpmMembershipResult');
            if (resEl) {
                resEl.className = 'gpm-membership-result';
                resEl.textContent = '';
            }
            calculateFinalDue();
        }
    });

    // Manual Discount toggle & input
    document.getElementById('gpmToggleFlat')?.addEventListener('click', () => {
        document.getElementById('gpmToggleFlat').classList.add('active');
        document.getElementById('gpmTogglePct').classList.remove('active');
        paymentState.discountType = 'flat';
        calculateFinalDue();
    });
    document.getElementById('gpmTogglePct')?.addEventListener('click', () => {
        document.getElementById('gpmTogglePct').classList.add('active');
        document.getElementById('gpmToggleFlat').classList.remove('active');
        paymentState.discountType = 'percent';
        calculateFinalDue();
    });
    document.getElementById('gpmDiscountInput')?.addEventListener('input', (e) => {
        paymentState.discountValue = parseFloat(e.target.value) || 0;
        calculateFinalDue();
    });

    // Coupon Apply / Remove
    document.getElementById('gpmBtnApplyCoupon')?.addEventListener('click', applyCouponCode);

    // Cash Calculator Chips & Input
    document.getElementById('gpmChipExact')?.addEventListener('click', () => {
        const cashIn = document.getElementById('gpmCashReceived');
        if (cashIn) {
            cashIn.value = paymentState.finalDue;
            updateCashChange();
        }
    });
    document.querySelectorAll('.gpm-chip-btn[data-add]').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const val = Number(e.currentTarget.dataset.add) || 0;
            const cashIn = document.getElementById('gpmCashReceived');
            if (cashIn) {
                cashIn.value = val;
                updateCashChange();
            }
        });
    });
    document.getElementById('gpmCashReceived')?.addEventListener('input', updateCashChange);

    // Proceed
    document.getElementById('gpmBtnProceed')?.addEventListener('click', finalizePayment);
}

function updateCashChange() {
    const cashInput = document.getElementById('gpmCashReceived');
    const pill = document.getElementById('gpmChangePill');
    const amtEl = document.getElementById('gpmChangeAmount');
    if (!cashInput || !pill || !amtEl) return;

    const tendered = parseFloat(cashInput.value) || 0;
    const due = paymentState.finalDue || 0;

    if (tendered <= 0) {
        pill.style.display = 'none';
        paymentState.cashReceived = 0;
        paymentState.changeReturned = 0;
        return;
    }

    pill.style.display = 'flex';
    paymentState.cashReceived = tendered;

    if (tendered >= due) {
        const change = tendered - due;
        paymentState.changeReturned = change;
        pill.className = 'gpm-change-pill change';
        pill.firstElementChild.textContent = 'Change to Return';
        amtEl.textContent = gpmFormatCurrency(change);
    } else {
        const remaining = due - tendered;
        paymentState.changeReturned = 0;
        pill.className = 'gpm-change-pill due';
        pill.firstElementChild.textContent = 'Remaining Due';
        amtEl.textContent = gpmFormatCurrency(remaining);
    }
}

// ── Open Modal API ───────────────────────────────────────────────────────────
window.openGlobalPaymentModal = async function(config) {
    if (!config || config.totalAmount === undefined) {
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
        finalDue: Number(config.totalAmount || 0),
        cashReceived: 0,
        changeReturned: 0
    };

    // Reset UI Inputs
    document.getElementById('gpmToggleFlat')?.classList.add('active');
    document.getElementById('gpmTogglePct')?.classList.remove('active');
    if (document.getElementById('gpmDiscountInput')) document.getElementById('gpmDiscountInput').value = '';
    if (document.getElementById('gpmCouponInput')) {
        const cIn = document.getElementById('gpmCouponInput');
        cIn.value = '';
        cIn.disabled = false;
    }
    if (document.getElementById('gpmBtnApplyCoupon')) {
        const btn = document.getElementById('gpmBtnApplyCoupon');
        btn.disabled = false;
        btn.textContent = 'Apply';
        btn.style.background = '#1e293b';
    }
    if (document.getElementById('gpmCouponMsg')) document.getElementById('gpmCouponMsg').style.display = 'none';

    // Payment methods
    document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
    document.querySelector('.gpm-method-card[data-method="cash"]')?.classList.add('active');
    const cashBox = document.getElementById('gpmCashBox');
    if (cashBox) cashBox.style.display = 'flex';
    if (document.getElementById('gpmCashReceived')) document.getElementById('gpmCashReceived').value = '';
    if (document.getElementById('gpmChangePill')) document.getElementById('gpmChangePill').style.display = 'none';
    if (document.getElementById('gpmPaymentNote')) document.getElementById('gpmPaymentNote').value = '';

    // Context & Header
    const type = (config.type || 'pos').toLowerCase();
    const typeBadge = document.getElementById('gpmTypeBadge');
    if (typeBadge) {
        if (type === 'booking') {
            typeBadge.textContent = 'APPOINTMENT BOOKING';
            typeBadge.style.background = '#dbeafe';
            typeBadge.style.color = '#1e40af';
        } else if (type === 'membership') {
            typeBadge.textContent = 'MEMBERSHIP PLAN';
            typeBadge.style.background = '#fef3c7';
            typeBadge.style.color = '#92400e';
        } else {
            typeBadge.textContent = 'POS CHECKOUT';
            typeBadge.style.background = '#e0e7ff';
            typeBadge.style.color = '#4338ca';
        }
    }

    const titleEl = document.getElementById('gpmTitle');
    if (titleEl) titleEl.textContent = config.title || 'Collect Payment';

    const custName = (config.customerName || 'Walk-in Customer').trim();
    const custPhone = config.customerPhone || 'N/A';
    if (document.getElementById('gpmCustName')) document.getElementById('gpmCustName').textContent = custName;
    if (document.getElementById('gpmCustPhone')) document.getElementById('gpmCustPhone').textContent = custPhone;
    if (document.getElementById('gpmCustAvatar')) document.getElementById('gpmCustAvatar').textContent = (custName[0] || 'C').toUpperCase();

    const subtitleEl = document.getElementById('gpmSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = `${config.saleId ? `#${config.saleId} · ` : ''}${custName}`;
    }

    // Render Itemized Items if provided
    const itemsCard = document.getElementById('gpmItemsCard');
    const itemsList = document.getElementById('gpmItemsList');
    const itemsTitle = document.getElementById('gpmItemsTitle');
    const itemsCount = document.getElementById('gpmItemsCount');

    if (config.items && config.items.length > 0 && itemsCard && itemsList) {
        itemsCard.style.display = 'block';
        if (itemsTitle) {
            itemsTitle.textContent = type === 'booking' ? 'Booked Services' : (type === 'membership' ? 'Membership Details' : 'Cart Products');
        }
        if (itemsCount) {
            itemsCount.textContent = `${config.items.length} item${config.items.length !== 1 ? 's' : ''}`;
        }
        itemsList.innerHTML = config.items.map(it => `
            <div class="gpm-item-row">
                <div style="flex:1; min-width:0;">
                    <div class="gpm-item-name">${it.name || 'Item'}</div>
                    ${it.category || it.subtitle ? `<div class="gpm-item-sub">${it.category || it.subtitle}</div>` : ''}
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div class="gpm-item-price">${gpmFormatCurrency((Number(it.price) || 0) * (Number(it.quantity) || 1))}</div>
                    <div class="gpm-item-qty">${it.quantity ? `${it.quantity} × ${gpmFormatCurrency(it.price || 0)}` : ''}</div>
                </div>
            </div>
        `).join('');
    } else if (itemsCard) {
        itemsCard.style.display = 'none';
    }

    // Show/hide membership perk toggle
    const memSection = document.getElementById('gpmMembershipSection');
    const memToggle = document.getElementById('gpmMembershipToggle');
    if (config.customerId && !config.isMembershipPurchase) {
        if (memSection) memSection.style.display = 'block';
        if (memToggle) memToggle.checked = false;
        const resEl = document.getElementById('gpmMembershipResult');
        if (resEl) {
            resEl.className = 'gpm-membership-result';
            resEl.textContent = '';
        }
        // Auto-check customer membership
        fetchCustomerMembership(config.customerId).then(found => {
            if (found && memToggle) memToggle.checked = true;
        });
    } else {
        if (memSection) memSection.style.display = 'none';
    }

    calculateFinalDue();

    // Reveal Modal
    document.getElementById('gpmOverlay')?.classList.add('active');
    if (window.feather) feather.replace();
};

window.closeGlobalPaymentModal = function() {
    document.getElementById('gpmOverlay')?.classList.remove('active');
};

// ── Calculations & Discount Waterfall ────────────────────────────────────────
function calculateFinalDue() {
    if (!globalPaymentConfig) return;

    const baseAmount = Number(globalPaymentConfig.totalAmount || 0);
    let runningAmount = baseAmount;
    let totalDiscount = 0;
    const breakdownHtml = [];

    breakdownHtml.push(`
        <div class="gpm-breakdown-row">
            <span>Subtotal</span>
            <span style="font-weight:600;color:#0f172a;">${gpmFormatCurrency(baseAmount)}</span>
        </div>
    `);

    // 1. Membership Discount
    if (paymentState.appliedMembership && paymentState.appliedMembership.value > 0) {
        let memDiscount = 0;
        if (paymentState.appliedMembership.type === 'percentage') {
            memDiscount = runningAmount * (paymentState.appliedMembership.value / 100);
        } else {
            memDiscount = Number(paymentState.appliedMembership.value);
        }
        if (memDiscount > runningAmount) memDiscount = runningAmount;
        totalDiscount += memDiscount;
        runningAmount -= memDiscount;

        const valLabel = paymentState.appliedMembership.type === 'percentage'
            ? `${paymentState.appliedMembership.value}%`
            : gpmFormatCurrency(paymentState.appliedMembership.value);

        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Membership Perk (${paymentState.appliedMembership.name})</span>
                <span>-${gpmFormatCurrency(memDiscount)}</span>
            </div>
        `);
    }

    // 2. Coupon Discount
    if (paymentState.appliedCoupon && paymentState.appliedCoupon.value > 0) {
        let coupDiscount = 0;
        if (paymentState.appliedCoupon.type === 'percentage') {
            coupDiscount = runningAmount * (paymentState.appliedCoupon.value / 100);
        } else {
            coupDiscount = Number(paymentState.appliedCoupon.value);
        }
        if (coupDiscount > runningAmount) coupDiscount = runningAmount;
        totalDiscount += coupDiscount;
        runningAmount -= coupDiscount;

        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Coupon (${paymentState.appliedCoupon.code})</span>
                <span>-${gpmFormatCurrency(coupDiscount)}</span>
            </div>
        `);
    }

    // 3. Manual Discount
    if (paymentState.discountValue > 0) {
        let manDiscount = 0;
        if (paymentState.discountType === 'percent') {
            manDiscount = runningAmount * (paymentState.discountValue / 100);
        } else {
            manDiscount = Number(paymentState.discountValue);
        }
        if (manDiscount > runningAmount) manDiscount = runningAmount;
        totalDiscount += manDiscount;
        runningAmount -= manDiscount;

        const valLabel = paymentState.discountType === 'percent'
            ? `${paymentState.discountValue}%`
            : gpmFormatCurrency(paymentState.discountValue);

        breakdownHtml.push(`
            <div class="gpm-breakdown-row discount">
                <span>Manual Discount (${valLabel})</span>
                <span>-${gpmFormatCurrency(manDiscount)}</span>
            </div>
        `);
    }

    const finalDue = Math.max(0, Math.round(baseAmount - totalDiscount));
    paymentState.finalDue = finalDue;

    breakdownHtml.push(`
        <div class="gpm-breakdown-row total">
            <span>Final Amount</span>
            <span style="color:#4f46e5;">${gpmFormatCurrency(finalDue)}</span>
        </div>
    `);

    const breakdownEl = document.getElementById('gpmBreakdown');
    if (breakdownEl) breakdownEl.innerHTML = breakdownHtml.join('');

    const statDue = document.getElementById('gpmStatDue');
    if (statDue) statDue.textContent = gpmFormatCurrency(finalDue);

    const subLabel = document.getElementById('gpmStatSubtotalLabel');
    if (subLabel) subLabel.textContent = `Subtotal: ${gpmFormatCurrency(baseAmount)}`;

    const btnProceed = document.getElementById('gpmBtnProceed');
    if (btnProceed) {
        btnProceed.innerHTML = `<span>Collect Payment (${gpmFormatCurrency(finalDue)})</span>`;
    }

    updateCashChange();
}

// ── Membership Lookup ────────────────────────────────────────────────────────
async function fetchCustomerMembership(customerId) {
    const resultEl = document.getElementById('gpmMembershipResult');
    const subtitleEl = document.getElementById('gpmMembershipSubtitle');
    if (!resultEl) return false;

    resultEl.className = 'gpm-membership-result';
    resultEl.textContent = 'Checking active membership...';
    resultEl.style.display = 'block';

    try {
        const { supabase } = await import('../lib/supabase.js');
        const today = new Date().toISOString().split('T')[0];

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
            resultEl.textContent = 'No active membership found.';
            if (subtitleEl) subtitleEl.textContent = 'No active membership';
            calculateFinalDue();
            return false;
        }

        const purchase = purchases[0];

        const { data: membership, error: mErr } = await supabase
            .from('memberships')
            .select('plan_name, discount_type, discount_value')
            .eq('membership_id', purchase.membership_id)
            .single();

        if (mErr || !membership || !membership.discount_value) {
            paymentState.appliedMembership = null;
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = 'Active membership has no discount.';
            calculateFinalDue();
            return false;
        }

        paymentState.appliedMembership = {
            name: membership.plan_name || purchase.plan_name,
            type: membership.discount_type,
            value: Number(membership.discount_value)
        };

        const valStr = membership.discount_type === 'percentage'
            ? `${membership.discount_value}% OFF`
            : gpmFormatCurrency(membership.discount_value) + ' OFF';

        resultEl.className = 'gpm-membership-result found';
        resultEl.textContent = `✓ ${paymentState.appliedMembership.name} (${valStr}) applied!`;
        if (subtitleEl) subtitleEl.textContent = `${paymentState.appliedMembership.name} active`;

        calculateFinalDue();
        return true;
    } catch (err) {
        console.error('Error checking customer membership:', err);
        paymentState.appliedMembership = null;
        resultEl.className = 'gpm-membership-result not-found';
        resultEl.textContent = 'Error checking membership.';
        calculateFinalDue();
        return false;
    }
}

// ── Coupon Validation ────────────────────────────────────────────────────────
async function applyCouponCode() {
    const codeInput = document.getElementById('gpmCouponInput');
    const msgEl = document.getElementById('gpmCouponMsg');
    const btnApply = document.getElementById('gpmBtnApplyCoupon');
    if (!codeInput || !btnApply || !msgEl) return;

    const code = codeInput.value.trim().toUpperCase();

    if (paymentState.appliedCoupon) {
        // Toggle to Remove
        paymentState.appliedCoupon = null;
        codeInput.value = '';
        codeInput.disabled = false;
        btnApply.textContent = 'Apply';
        btnApply.style.background = '#1e293b';
        msgEl.style.display = 'none';
        calculateFinalDue();
        return;
    }

    if (!code) return;

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

        let query = supabase
            .from('coupons')
            .select('*')
            .eq('coupon_code', code)
            .eq('status', 'active');

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data: rows, error } = await query;

        if (error || !rows || rows.length === 0) {
            throw new Error('Invalid or inactive coupon code.');
        }

        const serviceIds = globalPaymentConfig?.serviceIds || [];
        let couponData = null;

        if (serviceIds.length > 0) {
            couponData = rows.find(r => r.service_id && serviceIds.includes(r.service_id)) || null;
            if (!couponData) couponData = rows.find(r => !r.service_id) || null;
            if (!couponData) throw new Error('Coupon is not applicable to the selected service(s).');
        } else {
            couponData = rows.find(r => !r.service_id) || rows[0];
        }

        const now = new Date();
        if (couponData.valid_from && new Date(couponData.valid_from) > now) throw new Error('Coupon not active yet.');
        if (couponData.valid_to && new Date(couponData.valid_to) < now) throw new Error('Coupon expired.');

        paymentState.appliedCoupon = {
            id: couponData.coupon_id,
            code: couponData.coupon_code,
            type: couponData.discount_type,
            value: Number(couponData.discount_value)
        };

        const valStr = couponData.discount_type === 'percentage'
            ? `${couponData.discount_value}% OFF`
            : gpmFormatCurrency(couponData.discount_value) + ' OFF';

        msgEl.textContent = `✓ ${valStr} applied!`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';

        codeInput.disabled = true;
        btnApply.textContent = 'Remove';
        btnApply.style.background = '#ef4444';
        btnApply.disabled = false;

        calculateFinalDue();
    } catch (err) {
        console.error('Coupon validation error:', err);
        msgEl.textContent = err.message || 'Failed to apply coupon.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        btnApply.disabled = false;
        btnApply.textContent = 'Apply';
    }
}

// ── Finalize Payment ─────────────────────────────────────────────────────────
async function finalizePayment() {
    if (!globalPaymentConfig || typeof globalPaymentConfig.onComplete !== 'function') return;

    const btn = document.getElementById('gpmBtnProceed');
    const origHtml = btn ? btn.innerHTML : 'Collect Payment';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="spin" style="width:18px;height:18px;"></i> Recording Payment...';
        if (window.feather) feather.replace();
    }

    const note = document.getElementById('gpmPaymentNote')?.value?.trim() || null;
    const cashRec = parseFloat(document.getElementById('gpmCashReceived')?.value) || paymentState.finalDue;

    const resultPayload = {
        paymentMethod: paymentState.method,
        amountCollected: Math.round(paymentState.finalDue),
        cashReceived: paymentState.method === 'cash' ? cashRec : null,
        changeReturned: paymentState.method === 'cash' ? (paymentState.changeReturned || 0) : 0,
        note: note,
        discounts: {
            manualType: paymentState.discountValue > 0 ? paymentState.discountType : null,
            manualValue: paymentState.discountValue > 0 ? paymentState.discountValue : 0,
            couponId: paymentState.appliedCoupon ? paymentState.appliedCoupon.id : null,
            couponCode: paymentState.appliedCoupon ? paymentState.appliedCoupon.code : null,
            membershipName: paymentState.appliedMembership ? paymentState.appliedMembership.name : null,
            membershipDiscountPct: paymentState.appliedMembership ? paymentState.appliedMembership.value : 0
        }
    };

    try {
        await globalPaymentConfig.onComplete(resultPayload);
        closeGlobalPaymentModal();
    } catch (err) {
        console.error('Payment processing failed in onComplete:', err);
        alert('Payment failed: ' + (err.message || 'Unknown error'));
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.feather) feather.replace();
        }
    }
}
