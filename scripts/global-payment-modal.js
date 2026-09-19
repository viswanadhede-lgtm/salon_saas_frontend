// scripts/global-payment-modal.js (v2.2.0 - 3 sub-boxes layout)

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
    offerDiscount: 0,
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

function gpmFormatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    } catch {
        return dateStr;
    }
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
            padding: 2vh 2.5vw;
        }
        #gpmOverlay.active {
            display: flex;
            opacity: 1;
        }
        #gpmContent {
            background: #ffffff;
            width: 95vw;
            height: 98vh;
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
            padding: 16px 28px;
            background: #ffffff;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-header-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .gpm-header-icon-box {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: #eff6ff;
            border: 1px solid #dbeafe;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #2563eb;
        }
        .gpm-header h2 {
            font-size: 1.3rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            line-height: 1.2;
        }
        .gpm-subtitle {
            font-size: 0.82rem;
            color: #64748b;
            margin: 3px 0 0 0;
            font-weight: 500;
        }
        .gpm-close-btn {
            background: #ffffff;
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
            background: #f8fafc;
            flex: 1;
            overflow: hidden;
            display: grid;
            grid-template-columns: 1.18fr 0.82fr;
        }
        @media (max-width: 860px) {
            .gpm-body {
                grid-template-columns: 1fr;
                overflow-y: auto;
            }
        }

        .gpm-left-col {
            display: flex;
            flex-direction: column;
            border-right: 1px solid #e2e8f0;
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

        /* Card Container */
        .gpm-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px 18px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        /* Customer Section */
        .gpm-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: #dbeafe;
            color: #2563eb;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.05rem;
            flex-shrink: 0;
        }
        .gpm-btn-secondary-outline {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            background: #ffffff;
            color: #334155;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-btn-secondary-outline:hover {
            background: #f8fafc;
            border-color: #cbd5e1;
            color: #0f172a;
        }

        /* Booked Services Table */
        .gpm-services-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.84rem;
        }
        .gpm-services-table th {
            text-align: left;
            padding: 8px 8px;
            font-size: 0.72rem;
            font-weight: 700;
            color: #64748b;
            border-bottom: 1px solid #f1f5f9;
        }
        .gpm-services-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #f8fafc;
            color: #334155;
            vertical-align: middle;
        }
        .gpm-services-table td.svc-idx {
            font-weight: 700;
            color: #0f172a;
            width: 24px;
        }
        .gpm-services-table td.svc-name {
            font-weight: 700;
            color: #0f172a;
        }
        .gpm-services-table td.svc-staff {
            color: #475569;
        }
        .gpm-services-table td.svc-time {
            color: #475569;
        }
        .gpm-services-table td.svc-price {
            font-weight: 700;
            color: #0f172a;
            text-align: right;
        }
        .gpm-link-btn {
            background: none;
            border: none;
            color: #2563eb;
            font-size: 0.82rem;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 4px;
            border-radius: 4px;
            transition: opacity 0.15s;
        }
        .gpm-link-btn:hover {
            text-decoration: underline;
        }

        /* Discounts & Offers Styling */
        .gpm-offers-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .gpm-offer-box {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px 14px;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
        }
        .gpm-offer-box:hover {
            border-color: #cbd5e1;
            background: #ffffff;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
        }
        .gpm-offer-box.applied {
            background: #f0fdf4;
            border-color: #86efac;
        }
        .gpm-offer-box-header {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
        }
        .gpm-offer-item {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gpm-offer-badge {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .gpm-offer-badge.crown {
            background: #fef3c7;
            color: #d97706;
        }
        .gpm-offer-badge.tag {
            background: #dcfce7;
            color: #16a34a;
        }
        .gpm-offer-badge.gift,
        .gpm-offer-badge.percent {
            background: #ffe4e6;
            color: #e11d48;
            font-weight: 800;
            font-size: 0.95rem;
        }
        .gpm-offer-label {
            font-size: 0.88rem;
            font-weight: 700;
            color: #0f172a;
        }
        .gpm-offer-sub {
            font-size: 0.76rem;
            color: #64748b;
            margin-top: 1px;
        }
        .gpm-coupon-row {
            display: flex;
            gap: 8px;
            flex: 1;
        }
        .gpm-btn-apply-blue {
            height: 38px;
            padding: 0 18px;
            background: #eff6ff;
            color: #2563eb;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.15s;
            flex-shrink: 0;
        }
        .gpm-btn-apply-blue:hover {
            background: #2563eb;
            color: #ffffff;
        }

        .gpm-discount-toggle {
            display: flex;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            height: 38px;
            flex-shrink: 0;
        }
        .gpm-discount-toggle button {
            border: none;
            background: transparent;
            padding: 0 14px;
            font-weight: 700;
            font-size: 0.9rem;
            color: #64748b;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-discount-toggle button.active {
            background: #2563eb;
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
            border-color: #2563eb;
        }

        .gpm-toggle-switch {
            position: relative;
            width: 38px;
            height: 20px;
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
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background: white;
            border-radius: 50%;
            transition: 0.2s;
        }
        .gpm-toggle-switch input:checked + .gpm-toggle-slider {
            background: #2563eb;
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

        /* Bill Summary Card */
        .gpm-summary-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.85rem;
            color: #475569;
            margin-bottom: 8px;
        }
        .gpm-summary-row .val {
            font-weight: 600;
            color: #0f172a;
        }
        .gpm-summary-row.discount .val {
            color: #16a34a;
        }
        .gpm-summary-total-box {
            margin-top: 14px;
            padding: 14px 18px;
            background: #eff6ff;
            border: 1px solid #dbeafe;
            border-radius: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-summary-total-box .lbl {
            font-weight: 700;
            font-size: 0.95rem;
            color: #1e40af;
        }
        .gpm-summary-total-box .val {
            font-weight: 900;
            font-size: 1.4rem;
            color: #0f172a;
            letter-spacing: -0.02em;
        }

        /* Right Column Hero & Methods */
        .gpm-total-card {
            background: #eff6ff;
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 18px 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-total-card .label {
            font-size: 0.8rem;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 4px;
        }
        .gpm-total-card .val {
            font-size: 2.1rem;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: -0.02em;
            line-height: 1;
        }
        .gpm-total-card .meta-right {
            text-align: right;
        }
        .gpm-total-card .meta-right .items-count {
            font-size: 0.82rem;
            font-weight: 600;
            color: #334155;
        }
        .gpm-total-card .meta-right .tax-note {
            font-size: 0.72rem;
            color: #64748b;
            margin-top: 2px;
        }

        .gpm-methods-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        .gpm-method-card {
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            color: #475569;
            border-radius: 12px;
            padding: 16px 10px;
            font-weight: 700;
            font-size: 0.88rem;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .gpm-method-card:hover {
            border-color: #cbd5e1;
            background: #f8fafc;
        }
        .gpm-method-card.active {
            border-color: #2563eb;
            background: #f0f7ff;
            color: #2563eb;
            box-shadow: 0 0 0 1px #2563eb;
        }
        .gpm-method-card i {
            width: 22px;
            height: 22px;
        }

        /* Cash Calculator Box */
        .gpm-cash-box {
            background: transparent;
            border: none;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .gpm-cash-input-wrap {
            display: flex;
            align-items: center;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            background: #ffffff;
            padding: 0 14px;
            height: 44px;
            transition: border-color 0.2s;
        }
        .gpm-cash-input-wrap:focus-within {
            border-color: #2563eb;
        }
        .gpm-cash-prefix {
            font-size: 1.1rem;
            font-weight: 600;
            color: #64748b;
            margin-right: 8px;
        }
        .gpm-cash-input-wrap input {
            border: none;
            outline: none;
            width: 100%;
            font-size: 1.1rem;
            font-weight: 700;
            color: #0f172a;
            background: transparent;
        }

        .gpm-change-due-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 0.9rem;
        }
        .gpm-change-due-row.change {
            background: #f0fdf4;
            color: #16a34a;
            border: 1px solid #bbf7d0;
        }
        .gpm-change-due-row.due {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
        }

        .gpm-chips {
            display: flex;
            gap: 8px;
            margin-top: 4px;
        }
        .gpm-chip-btn {
            flex: 1;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 0.8rem;
            font-weight: 600;
            color: #334155;
            cursor: pointer;
            text-align: center;
            transition: all 0.15s;
        }
        .gpm-chip-btn:hover {
            background: #f1f5f9;
            border-color: #94a3b8;
            color: #0f172a;
        }

        /* Textarea / Note */
        .gpm-textarea-wrap {
            position: relative;
        }
        .gpm-textarea {
            width: 100%;
            min-height: 74px;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 12px 24px 12px;
            font-size: 0.85rem;
            color: #1e293b;
            font-family: inherit;
            outline: none;
            resize: vertical;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        .gpm-textarea:focus {
            border-color: #2563eb;
        }
        .gpm-textarea-counter {
            position: absolute;
            bottom: 8px;
            right: 12px;
            font-size: 0.72rem;
            color: #94a3b8;
            pointer-events: none;
        }

        /* Footer */
        .gpm-footer {
            padding: 16px 28px;
            background: #ffffff;
            display: flex;
            gap: 14px;
            border-top: 1px solid #f1f5f9;
            justify-content: space-between;
            align-items: center;
        }
        .gpm-btn-cancel {
            height: 46px;
            padding: 0 32px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.92rem;
            border: 1.5px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-btn-cancel:hover {
            background: #f8fafc;
            border-color: #94a3b8;
            color: #0f172a;
        }
        .gpm-btn-proceed {
            flex: 1;
            height: 46px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.95rem;
            background: #2563eb;
            color: #ffffff;
            border: none;
            box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .gpm-btn-proceed:hover {
            background: #1d4ed8;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
        }
        .gpm-btn-proceed:disabled {
            background: #94a3b8;
            cursor: not-allowed;
            box-shadow: none;
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
                    <div class="gpm-header-icon-box" id="gpmHeaderIcon">
                        <i data-feather="calendar" style="width:22px; height:22px;"></i>
                    </div>
                    <div>
                        <h2 id="gpmTitle">Booking Payment</h2>
                        <p id="gpmSubtitle" class="gpm-subtitle">#49D13DF4 • 18 Sep 2026, 10:00 AM • Main Branch</p>
                    </div>
                </div>
                <button class="gpm-close-btn" id="gpmBtnClose" title="Close"><i data-feather="x"></i></button>
            </div>

            <!-- Body -->
            <div class="gpm-body">
                <!-- LEFT COLUMN: Order & Breakdown -->
                <div class="gpm-left-col">
                    <!-- Customer Card -->
                    <div class="gpm-card">
                        <div style="font-size:0.78rem; font-weight:700; color:#475569; margin-bottom:10px;">Customer</div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div class="gpm-avatar" id="gpmCustAvatar">D</div>
                                <div>
                                    <h4 id="gpmCustName" style="margin:0 0 2px 0; font-size:0.95rem; font-weight:700; color:#0f172a;">Walk-in Customer</h4>
                                    <p id="gpmCustPhone" style="margin:0; font-size:0.82rem; color:#64748b;">+91 --</p>
                                </div>
                            </div>
                            <button type="button" id="gpmBtnViewProfile" class="gpm-btn-secondary-outline">
                                <i data-feather="user" style="width:14px; height:14px;"></i>
                                <span>View Profile</span>
                            </button>
                        </div>
                    </div>

                    <!-- Booked Services Table Card -->
                    <div class="gpm-card" id="gpmItemsCard">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-size:0.88rem; font-weight:700; color:#0f172a;" id="gpmItemsHeader">Booked Services (1)</span>
                            <button type="button" id="gpmBtnEditBooking" class="gpm-link-btn">
                                <i data-feather="edit-2" style="width:13px; height:13px;"></i>
                                <span>Edit</span>
                            </button>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="gpm-services-table" id="gpmServicesTable">
                                <thead>
                                    <tr>
                                        <th style="width:28px;">#</th>
                                        <th>Service</th>
                                        <th>Staff</th>
                                        <th>Time</th>
                                        <th style="text-align:right;">Price</th>
                                    </tr>
                                </thead>
                                <tbody id="gpmServicesTbody"></tbody>
                            </table>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.8rem;">
                            <div id="gpmServiceNote" style="color:#64748b; display:flex; align-items:center; gap:6px;">
                                <i data-feather="file-text" style="width:14px; height:14px; color:#64748b;"></i>
                                <span id="gpmServiceNoteText">Includes multiple services</span>
                            </div>
                            <div style="font-weight:700; color:#0f172a;">
                                <span style="color:#64748b; font-weight:600; margin-right:8px;">Subtotal</span>
                                <span id="gpmServicesSubtotal">₹0</span>
                            </div>
                        </div>
                    </div>

                    <!-- Discounts & Offers Card -->
                    <div class="gpm-card">
                        <div style="font-size:0.88rem; font-weight:700; color:#0f172a; margin-bottom:12px;">Discounts &amp; Offers</div>

                        <div class="gpm-offers-stack">
                            <!-- Box 1: Membership Discount -->
                            <div class="gpm-offer-box" id="gpmMembershipSection">
                                <div class="gpm-offer-box-header">
                                    <div class="gpm-offer-badge crown">
                                        <i data-feather="award" style="width:18px; height:18px;"></i>
                                    </div>
                                    <div style="flex:1; min-width:0;">
                                        <div class="gpm-offer-label">Membership Discount</div>
                                        <div class="gpm-offer-sub" id="gpmMembershipSubtitle">No active membership found.</div>
                                    </div>
                                    <label class="gpm-toggle-switch">
                                        <input type="checkbox" id="gpmMembershipToggle">
                                        <span class="gpm-toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="gpm-membership-result" id="gpmMembershipResult" style="display:none; margin-top:8px; margin-left:46px;"></div>
                            </div>

                            <!-- Box 2: Coupon Code -->
                            <div class="gpm-offer-box" id="gpmCouponSection">
                                <div class="gpm-offer-box-header">
                                    <div class="gpm-offer-badge tag">
                                        <i data-feather="tag" style="width:18px; height:18px;"></i>
                                    </div>
                                    <div class="gpm-offer-label" style="width:110px; flex-shrink:0;">Coupon Code</div>
                                    <div class="gpm-coupon-row">
                                        <input type="text" id="gpmCouponInput" class="gpm-input" placeholder="Enter coupon code" style="text-transform: uppercase;">
                                        <button type="button" id="gpmBtnApplyCoupon" class="gpm-btn-apply-blue">Apply</button>
                                    </div>
                                </div>
                                <p id="gpmCouponMsg" style="font-size:0.75rem; margin-top:8px; margin-bottom:0; margin-left:46px; display:none;"></p>
                            </div>

                            <!-- Box 3: Special Offers -->
                            <div class="gpm-offer-box" id="gpmOffersSection">
                                <div class="gpm-offer-box-header">
                                    <div class="gpm-offer-badge gift">
                                        <i data-feather="gift" style="width:18px; height:18px;"></i>
                                    </div>
                                    <div class="gpm-offer-label" style="width:110px; flex-shrink:0;">Offers</div>
                                    <div style="display:flex; gap:8px; flex:1; align-items:center;">
                                        <select id="gpmOfferSelect" class="gpm-input" style="cursor:pointer; appearance:auto;">
                                            <option value="">Select an offer...</option>
                                        </select>
                                        <button type="button" id="gpmBtnClearOffer" class="gpm-btn-apply-blue" style="display:none; color:#ef4444; border-color:#fca5a5; background:#fff1f2; padding:0 12px;">Clear</button>
                                    </div>
                                </div>
                                <p id="gpmOfferMsg" style="font-size:0.75rem; margin-top:8px; margin-bottom:0; margin-left:46px; display:none; font-weight:600;"></p>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- RIGHT COLUMN: Payment Methods & Collection -->
                <div class="gpm-right-col">
                    <!-- Bill Summary Card (Top Field) -->
                    <div class="gpm-card">
                        <div style="font-size:0.88rem; font-weight:700; color:#0f172a; margin-bottom:12px;">Bill Summary</div>
                        <div class="gpm-summary-row">
                            <span>Subtotal</span>
                            <span class="val" id="gpmBillSubtotal">₹0</span>
                        </div>
                        <div class="gpm-summary-row discount">
                            <span>Membership Discount</span>
                            <span class="val" id="gpmBillMembership">- ₹0</span>
                        </div>
                        <div class="gpm-summary-row discount">
                            <span>Coupon Discount</span>
                            <span class="val" id="gpmBillCoupon">- ₹0</span>
                        </div>
                        <div class="gpm-summary-row discount">
                            <span id="gpmBillOfferLabel">Offer Discount</span>
                            <span class="val" id="gpmBillOffer">- ₹0</span>
                        </div>

                        <div class="gpm-summary-total-box">
                            <div>
                                <span class="lbl">Total Payable</span>
                                <div style="font-size:0.75rem; color:#64748b; font-weight:500; margin-top:2px;" id="gpmStatItemsCount">1 item • Incl. all taxes</div>
                            </div>
                            <span class="val" id="gpmBillTotal">₹0</span>
                        </div>
                    </div>

                    <!-- Select Payment Method -->
                    <div>
                        <div style="font-size:0.88rem; font-weight:700; color:#0f172a; margin-bottom:10px;">Select Payment Method</div>
                        <div class="gpm-methods-grid">
                            <button type="button" class="gpm-method-card active" data-method="cash">
                                <i data-feather="dollar-sign"></i>
                                <span>Cash</span>
                            </button>
                            <button type="button" class="gpm-method-card" data-method="upi">
                                <i data-feather="grid"></i>
                                <span>UPI / QR</span>
                            </button>
                            <button type="button" class="gpm-method-card" data-method="card">
                                <i data-feather="credit-card"></i>
                                <span>Card</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="gpm-footer">
                <button type="button" class="gpm-btn-cancel" id="gpmBtnCancel">Cancel</button>
                <button type="button" class="gpm-btn-proceed" id="gpmBtnProceed">
                    <span>Collect Payment (₹0)</span>
                    <i data-feather="arrow-right" style="width:18px;height:18px;"></i>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function bindGlobalPaymentModalEvents() {
    document.getElementById('gpmBtnClose')?.addEventListener('click', closeGlobalPaymentModal);
    document.getElementById('gpmBtnCancel')?.addEventListener('click', closeGlobalPaymentModal);

    // Click outside to close
    document.getElementById('gpmOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'gpmOverlay') closeGlobalPaymentModal();
    });

    // Customer View Profile
    document.getElementById('gpmBtnViewProfile')?.addEventListener('click', () => {
        if (globalPaymentConfig?.customerId && window.viewCustomerProfile) {
            window.viewCustomerProfile(globalPaymentConfig.customerId, globalPaymentConfig.customerName);
        } else {
            alert('Customer profile not available for walk-in customer.');
        }
    });

    // Edit Booking
    document.getElementById('gpmBtnEditBooking')?.addEventListener('click', () => {
        if (globalPaymentConfig?.bookingId && window.openEditBookingModal) {
            window.closeGlobalPaymentModal();
            window.openEditBookingModal(globalPaymentConfig.bookingId);
        } else {
            alert('Edit booking is not available for this appointment.');
        }
    });

    // Payment Methods
    document.querySelectorAll('.gpm-method-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            paymentState.method = target.dataset.method;
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
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
            const resEl = document.getElementById('gpmMembershipResult');
            if (resEl) {
                resEl.className = 'gpm-membership-result';
                resEl.textContent = '';
                resEl.style.display = 'none';
            }
            const sub = document.getElementById('gpmMembershipSubtitle');
            if (sub) sub.textContent = 'No active membership found.';
            calculateFinalDue();
        }
    });



    // Offers Select & Clear
    document.getElementById('gpmOfferSelect')?.addEventListener('change', (e) => {
        applySelectedOffer(e.target.value);
    });
    document.getElementById('gpmBtnClearOffer')?.addEventListener('click', () => {
        const sel = document.getElementById('gpmOfferSelect');
        if (sel) sel.value = '';
        applySelectedOffer('');
    });

    // Coupon Apply / Remove
    document.getElementById('gpmBtnApplyCoupon')?.addEventListener('click', applyCouponCode);

    // Proceed
    document.getElementById('gpmBtnProceed')?.addEventListener('click', finalizePayment);
}

function updateCashChange() {
    const cashInput = document.getElementById('gpmCashReceived');
    const row = document.getElementById('gpmChangeDueRow');
    const lbl = document.getElementById('gpmChangeLabel');
    const amtEl = document.getElementById('gpmChangeAmount');
    if (!cashInput || !row || !amtEl) return;

    const tendered = parseFloat(cashInput.value) || 0;
    const due = paymentState.finalDue || 0;

    if (tendered <= 0) {
        row.style.display = 'none';
        paymentState.cashReceived = 0;
        paymentState.changeReturned = 0;
        return;
    }

    row.style.display = 'flex';
    paymentState.cashReceived = tendered;

    if (tendered >= due) {
        const change = tendered - due;
        paymentState.changeReturned = change;
        row.className = 'gpm-change-due-row change';
        if (lbl) lbl.textContent = 'Change Due';
        amtEl.textContent = gpmFormatCurrency(change);
    } else {
        const remaining = due - tendered;
        paymentState.changeReturned = 0;
        row.className = 'gpm-change-due-row due';
        if (lbl) lbl.textContent = 'Remaining Due';
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
        offerDiscount: 0,
        finalDue: Number(config.totalAmount || 0),
        cashReceived: 0,
        changeReturned: 0
    };

    // Reset UI Inputs & Box States
    document.getElementById('gpmMembershipSection')?.classList.remove('applied');
    document.getElementById('gpmCouponSection')?.classList.remove('applied');
    document.getElementById('gpmOffersSection')?.classList.remove('applied');

    const oSelect = document.getElementById('gpmOfferSelect');
    if (oSelect) oSelect.value = '';
    const oBtnClear = document.getElementById('gpmBtnClearOffer');
    if (oBtnClear) oBtnClear.style.display = 'none';
    const oMsg = document.getElementById('gpmOfferMsg');
    if (oMsg) oMsg.style.display = 'none';

    if (document.getElementById('gpmCouponInput')) {
        const cIn = document.getElementById('gpmCouponInput');
        cIn.value = '';
        cIn.disabled = false;
    }
    if (document.getElementById('gpmBtnApplyCoupon')) {
        const btn = document.getElementById('gpmBtnApplyCoupon');
        btn.disabled = false;
        btn.textContent = 'Apply';
    }
    if (document.getElementById('gpmCouponMsg')) document.getElementById('gpmCouponMsg').style.display = 'none';

    // Payment methods
    document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
    document.querySelector('.gpm-method-card[data-method="cash"]')?.classList.add('active');

    // Context & Header
    const type = (config.type || 'pos').toLowerCase();
    const titleEl = document.getElementById('gpmTitle');
    if (titleEl) {
        titleEl.textContent = config.title || (type === 'booking' ? 'Booking Payment' : (type === 'membership' ? 'Membership Purchase' : 'POS Checkout'));
    }

    const custName = (config.customerName || 'Walk-in Customer').trim();
    const custPhone = config.customerPhone || 'N/A';
    if (document.getElementById('gpmCustName')) document.getElementById('gpmCustName').textContent = custName;
    if (document.getElementById('gpmCustPhone')) document.getElementById('gpmCustPhone').textContent = custPhone;
    if (document.getElementById('gpmCustAvatar')) document.getElementById('gpmCustAvatar').textContent = (custName[0] || 'C').toUpperCase();

    const subtitleEl = document.getElementById('gpmSubtitle');
    if (subtitleEl) {
        const saleIdStr = config.saleId ? `#${config.saleId}` : (config.bookingId ? `#${String(config.bookingId).slice(0, 8).toUpperCase()}` : '');
        const dateStr = gpmFormatDate(config.bookingDate);
        const timeStr = config.bookingTime ? `, ${config.bookingTime}` : '';
        const dateTimeStr = (dateStr || timeStr) ? `${dateStr}${timeStr}` : '';
        const branchStr = config.branchName || 'Main Branch';
        const parts = [saleIdStr, dateTimeStr, branchStr].filter(Boolean);
        subtitleEl.textContent = parts.length > 0 ? parts.join(' • ') : custName;
    }

    // Render Services Table
    const itemsHeader = document.getElementById('gpmItemsHeader');
    const tbody = document.getElementById('gpmServicesTbody');
    const subtotalEl = document.getElementById('gpmServicesSubtotal');
    const noteEl = document.getElementById('gpmServiceNote');
    const statItemsCount = document.getElementById('gpmStatItemsCount');

    const items = config.items || [];
    const itemsCount = items.length || 1;

    if (itemsHeader) {
        itemsHeader.textContent = type === 'booking' ? `Booked Services (${itemsCount})` : `Order Items (${itemsCount})`;
    }
    if (statItemsCount) {
        statItemsCount.textContent = `${itemsCount} item${itemsCount !== 1 ? 's' : ''}`;
    }
    if (subtotalEl) {
        subtotalEl.textContent = gpmFormatCurrency(config.totalAmount || 0);
    }
    if (noteEl) {
        noteEl.style.display = (config.hasMultipleServices || itemsCount > 1) ? 'flex' : 'none';
    }

    if (tbody) {
        if (items.length > 0) {
            tbody.innerHTML = items.map((it, idx) => `
                <tr>
                    <td class="svc-idx">${it.index || (idx + 1)}</td>
                    <td class="svc-name">${it.name || 'Service'}</td>
                    <td class="svc-staff">${it.staff || it.staff_name || 'Assigned'}</td>
                    <td class="svc-time">${it.time || it.start_time || config.bookingTime || ''}</td>
                    <td class="svc-price">${gpmFormatCurrency(it.price || 0)}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `
                <tr>
                    <td class="svc-idx">1</td>
                    <td class="svc-name">${config.title || 'Service Appointment'}</td>
                    <td class="svc-staff">Assigned</td>
                    <td class="svc-time">${config.bookingTime || ''}</td>
                    <td class="svc-price">${gpmFormatCurrency(config.totalAmount || 0)}</td>
                </tr>
            `;
        }
    }

    // Show/hide membership perk toggle
    const memSection = document.getElementById('gpmMembershipSection');
    const memToggle = document.getElementById('gpmMembershipToggle');
    const memSub = document.getElementById('gpmMembershipSubtitle');
    if (config.customerId && !config.isMembershipPurchase) {
        if (memSection) memSection.style.display = 'flex';
        if (memToggle) memToggle.checked = false;
        if (memSub) memSub.textContent = 'Checking membership...';
        const resEl = document.getElementById('gpmMembershipResult');
        if (resEl) {
            resEl.className = 'gpm-membership-result';
            resEl.textContent = '';
            resEl.style.display = 'none';
        }
        // Auto-check customer membership
        fetchCustomerMembership(config.customerId).then(found => {
            if (found && memToggle) memToggle.checked = true;
        });
    } else {
        if (memSection) memSection.style.display = 'flex';
        if (memToggle) memToggle.checked = false;
        if (memSub) memSub.textContent = 'No active membership found.';
    }

    // Fetch active offers for branch
    loadAvailableOffers();

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

    let memDiscount = 0;
    let coupDiscount = 0;
    let manDiscount = 0;

    // 1. Membership Discount
    if (paymentState.appliedMembership && paymentState.appliedMembership.value > 0) {
        if (paymentState.appliedMembership.type === 'percentage') {
            memDiscount = runningAmount * (paymentState.appliedMembership.value / 100);
        } else {
            memDiscount = Number(paymentState.appliedMembership.value);
        }
        if (memDiscount > runningAmount) memDiscount = runningAmount;
        totalDiscount += memDiscount;
        runningAmount -= memDiscount;
    }

    // 2. Coupon Discount
    if (paymentState.appliedCoupon && paymentState.appliedCoupon.value > 0) {
        if (paymentState.appliedCoupon.type === 'percentage') {
            coupDiscount = runningAmount * (paymentState.appliedCoupon.value / 100);
        } else {
            coupDiscount = Number(paymentState.appliedCoupon.value);
        }
        if (coupDiscount > runningAmount) coupDiscount = runningAmount;
        totalDiscount += coupDiscount;
        runningAmount -= coupDiscount;
    }



    // 3. Offer Discount
    let offerDiscount = 0;
    if (paymentState.appliedOffer && paymentState.appliedOffer.value > 0) {
        if (paymentState.appliedOffer.type === 'percentage') {
            offerDiscount = runningAmount * (paymentState.appliedOffer.value / 100);
        } else {
            offerDiscount = Number(paymentState.appliedOffer.value);
        }
        if (offerDiscount > runningAmount) offerDiscount = runningAmount;
        totalDiscount += offerDiscount;
        runningAmount -= offerDiscount;
    }
    paymentState.offerDiscount = offerDiscount;

    const finalDue = Math.max(0, Math.round(baseAmount - totalDiscount));
    paymentState.finalDue = finalDue;

    // Update Bill Summary Card
    const billSub = document.getElementById('gpmBillSubtotal');
    if (billSub) billSub.textContent = gpmFormatCurrency(baseAmount);

    const billMem = document.getElementById('gpmBillMembership');
    if (billMem) billMem.textContent = memDiscount > 0 ? `- ${gpmFormatCurrency(memDiscount)}` : '- ₹0';

    const billCoup = document.getElementById('gpmBillCoupon');
    if (billCoup) billCoup.textContent = coupDiscount > 0 ? `- ${gpmFormatCurrency(coupDiscount)}` : '- ₹0';

    const billOffer = document.getElementById('gpmBillOffer');
    if (billOffer) billOffer.textContent = offerDiscount > 0 ? `- ${gpmFormatCurrency(offerDiscount)}` : '- ₹0';

    const billOfferLabel = document.getElementById('gpmBillOfferLabel');
    if (billOfferLabel) {
        billOfferLabel.textContent = paymentState.appliedOffer ? `Offer (${paymentState.appliedOffer.name})` : 'Offer Discount';
    }

    const billTot = document.getElementById('gpmBillTotal');
    if (billTot) billTot.textContent = gpmFormatCurrency(finalDue);

    // Update Right Column Hero & Proceed Button
    const statDue = document.getElementById('gpmStatDue');
    if (statDue) statDue.textContent = gpmFormatCurrency(finalDue);

    const btnProceed = document.getElementById('gpmBtnProceed');
    if (btnProceed) {
        btnProceed.innerHTML = `<span>Collect Payment (${gpmFormatCurrency(finalDue)})</span> <i data-feather="arrow-right" style="width:18px;height:18px;"></i>`;
        if (window.feather) feather.replace();
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
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
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
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
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
        document.getElementById('gpmMembershipSection')?.classList.add('applied');

        calculateFinalDue();
        return true;
    } catch (err) {
        console.error('Error checking customer membership:', err);
        paymentState.appliedMembership = null;
        document.getElementById('gpmMembershipSection')?.classList.remove('applied');
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
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
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
        document.getElementById('gpmCouponSection')?.classList.add('applied');

        calculateFinalDue();
    } catch (err) {
        console.error('Coupon validation error:', err);
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
        msgEl.textContent = err.message || 'Failed to apply coupon.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        btnApply.disabled = false;
        btnApply.textContent = 'Apply';
    }
}

// ── Offers Management ────────────────────────────────────────────────────────
async function loadAvailableOffers() {
    const offerSelect = document.getElementById('gpmOfferSelect');
    const offerMsg = document.getElementById('gpmOfferMsg');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    if (!offerSelect) return;

    offerSelect.innerHTML = '<option value="">Loading offers...</option>';
    offerSelect.disabled = true;
    if (offerMsg) offerMsg.style.display = 'none';
    if (btnClear) btnClear.style.display = 'none';

    try {
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

        const { supabase } = await import('../lib/supabase.js');

        let query = supabase
            .from('offers')
            .select('offer_id, offer_name, discount_type, discount_value, min_bill_amount, valid_from, valid_to, service_id, service_name, total_usage_limit, current_usage_count')
            .eq('status', 'active');

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;
        if (error) throw error;

        const seen = new Map();
        const todayStr = new Date().toISOString().split('T')[0];

        (data || []).forEach(o => {
            // Check validity period
            if (o.valid_from && o.valid_from > todayStr) return;
            if (o.valid_to && o.valid_to < todayStr) return;

            // Check overall usage limit
            if (o.total_usage_limit && Number(o.current_usage_count || 0) >= Number(o.total_usage_limit)) return;

            if (!seen.has(o.offer_id)) {
                seen.set(o.offer_id, {
                    offer_id: o.offer_id,
                    offer_name: o.offer_name,
                    discount_type: (o.discount_type || 'percentage').toLowerCase(),
                    discount_value: Number(o.discount_value || 0),
                    min_bill_amount: Number(o.min_bill_amount || 0),
                    applicable_services: []
                });
            }

            if (o.service_id) {
                seen.get(o.offer_id).applicable_services.push({
                    service_id: o.service_id,
                    service_name: o.service_name || ''
                });
            }
        });

        // Filter offers based on service applicability if current checkout has services
        const currentServiceIds = [
            ...(globalPaymentConfig?.serviceIds || []),
            ...(globalPaymentConfig?.items || []).map(it => it.service_id || it.serviceId || it.id).filter(Boolean)
        ];

        const validOffers = Array.from(seen.values()).filter(o => {
            if (!o.applicable_services || o.applicable_services.length === 0) return true;
            if (currentServiceIds.length > 0) {
                return o.applicable_services.some(s => currentServiceIds.includes(s.service_id));
            }
            return true;
        });

        liveOffersDB = validOffers;

        if (liveOffersDB.length === 0) {
            offerSelect.innerHTML = '<option value="">No active offers available</option>';
            offerSelect.disabled = true;
        } else {
            offerSelect.disabled = false;
            let optionsHtml = '<option value="">Select an offer...</option>';
            liveOffersDB.forEach(o => {
                const badge = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
                const minStr = o.min_bill_amount > 0 ? ` (Min ₹${o.min_bill_amount})` : '';
                optionsHtml += `<option value="${o.offer_id}">${o.offer_name} — ${badge}${minStr}</option>`;
            });
            offerSelect.innerHTML = optionsHtml;
        }
    } catch (err) {
        console.warn('Failed to fetch offers in payment modal:', err);
        offerSelect.innerHTML = '<option value="">No offers available</option>';
        offerSelect.disabled = true;
    }
}

function applySelectedOffer(offerId) {
    const offerSelect = document.getElementById('gpmOfferSelect');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    const msgEl = document.getElementById('gpmOfferMsg');

    if (!offerId) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (msgEl) msgEl.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        calculateFinalDue();
        return;
    }

    const found = liveOffersDB.find(x => x.offer_id === offerId);
    if (!found) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (msgEl) msgEl.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        calculateFinalDue();
        return;
    }

    const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
    if (found.min_bill_amount && baseAmount < found.min_bill_amount) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (offerSelect) offerSelect.value = '';
        if (btnClear) btnClear.style.display = 'none';
        if (msgEl) {
            msgEl.textContent = `Offer requires a minimum bill of ₹${found.min_bill_amount}.`;
            msgEl.style.color = '#ef4444';
            msgEl.style.display = 'block';
        }
        calculateFinalDue();
        return;
    }

    paymentState.appliedOffer = {
        id: found.offer_id,
        name: found.offer_name,
        type: found.discount_type,
        value: found.discount_value
    };

    if (btnClear) btnClear.style.display = 'inline-flex';
    if (msgEl) {
        const valStr = found.discount_type === 'percentage' ? `${found.discount_value}% OFF` : `₹${found.discount_value} OFF`;
        msgEl.textContent = `✓ Offer applied: ${found.offer_name} (${valStr})`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';
    }
    document.getElementById('gpmOffersSection')?.classList.add('applied');

    calculateFinalDue();
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
            manualType: null,
            manualValue: 0,
            couponId: paymentState.appliedCoupon ? paymentState.appliedCoupon.id : null,
            couponCode: paymentState.appliedCoupon ? paymentState.appliedCoupon.code : null,
            offerId: paymentState.appliedOffer ? paymentState.appliedOffer.id : null,
            offerName: paymentState.appliedOffer ? paymentState.appliedOffer.name : null,
            offerDiscount: paymentState.offerDiscount || 0,
            membershipName: paymentState.appliedMembership ? paymentState.appliedMembership.name : null,
            membershipDiscountPct: paymentState.appliedMembership ? paymentState.appliedMembership.value : 0
        }
    };

    try {
        await globalPaymentConfig.onComplete(resultPayload);

        // Increment current_usage_count for the redeemed offer
        if (paymentState.appliedOffer?.id) {
            try {
                const { supabase } = await import('../lib/supabase.js');
                const { data: offerRows } = await supabase
                    .from('offers')
                    .select('id, current_usage_count')
                    .eq('offer_id', paymentState.appliedOffer.id);
                if (offerRows && offerRows.length > 0) {
                    for (const r of offerRows) {
                        await supabase
                            .from('offers')
                            .update({ current_usage_count: (Number(r.current_usage_count) || 0) + 1 })
                            .eq('id', r.id);
                    }
                }
            } catch (uErr) {
                console.warn('[PaymentModal] Error updating offer usage count:', uErr);
            }
        }

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
