// scripts/global-payment-modal/gpm-ui.js
import { gpmState } from './gpm-state.js';

export function gpmFormatCurrency(amt) {
    const n = Number(amt || 0);
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function gpmFormatDate(dateStr) {
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

export function injectGlobalPaymentModalStyles() {
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
        .gpm-card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 10px;
            margin-bottom: 14px;
            border-bottom: 1px solid #e2e8f0;
        }
        .gpm-card-title {
            font-size: 0.88rem;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
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
            background: #ffffff;
            border: 1.5px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px 14px;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
        }
        .gpm-offer-box:hover {
            border-color: #cbd5e1;
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

        /* ── Booking Confirmation Modal ─────────────────────────────────── */
        #gpmConfirmOverlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            z-index: 10001;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.22s ease;
        }
        #gpmConfirmOverlay.active {
            display: flex;
            opacity: 1;
        }
        #gpmConfirmBox {
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.3);
            width: 560px;
            max-width: 95vw;
            padding: 32px;
            transform: translateY(14px) scale(0.97);
            transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            border: 1px solid #e2e8f0;
        }
        #gpmConfirmOverlay.active #gpmConfirmBox {
            transform: translateY(0) scale(1);
        }
        .gpm-confirm-banner {
            background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 20px 22px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .gpm-confirm-banner-icon {
            width: 52px;
            height: 52px;
            background: #dcfce7;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #16a34a;
            flex-shrink: 0;
        }
        .gpm-confirm-banner-text .gpm-confirm-amount {
            font-size: 1.4rem;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.2;
            letter-spacing: -0.02em;
        }
        .gpm-confirm-banner-text .gpm-confirm-from {
            font-size: 0.84rem;
            color: #475569;
            font-weight: 500;
            margin-top: 4px;
        }
        .gpm-confirm-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 24px;
        }
        .gpm-confirm-card {
            border: 1.5px solid #e2e8f0;
            border-radius: 14px;
            padding: 26px 16px;
            cursor: pointer;
            text-align: center;
            transition: all 0.18s ease;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            width: 100%;
        }
        .gpm-confirm-card:not(:disabled):hover {
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
            transform: translateY(-2px);
        }
        .gpm-confirm-card:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .gpm-confirm-card.print {
            color: #64748b;
        }
        .gpm-confirm-card.print:not(:disabled):hover {
            border-color: #94a3b8;
            background: #f8fafc;
        }
        .gpm-confirm-card.complete {
            border-color: #86efac;
            background: #f0fdf4;
            color: #15803d;
        }
        .gpm-confirm-card.complete:not(:disabled):hover {
            border-color: #4ade80;
            background: #dcfce7;
            box-shadow: 0 4px 16px rgba(22, 163, 74, 0.14);
        }
        .gpm-confirm-card-icon {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .gpm-confirm-card.print .gpm-confirm-card-icon {
            background: #f1f5f9;
            color: #64748b;
        }
        .gpm-confirm-card.complete .gpm-confirm-card-icon {
            background: #dcfce7;
            color: #16a34a;
        }
        .gpm-confirm-card-label {
            font-size: 0.92rem;
            font-weight: 700;
            line-height: 1.35;
        }
        .gpm-confirm-card-sub {
            font-size: 0.76rem;
            font-weight: 500;
            opacity: 0.65;
        }
        .gpm-confirm-footer {
            display: flex;
            justify-content: flex-end;
        }
        .gpm-confirm-exit-btn {
            height: 42px;
            padding: 0 30px;
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            color: #475569;
            border-radius: 10px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .gpm-confirm-exit-btn:hover {
            background: #f8fafc;
            border-color: #94a3b8;
            color: #0f172a;
        }
    `;
    document.head.appendChild(style);
}

export function injectGlobalPaymentModalHTML() {
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
                        <div class="gpm-card-header">
                            <span class="gpm-card-title">Customer</span>
                        </div>
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
                        <div class="gpm-card-header">
                            <span class="gpm-card-title" id="gpmItemsHeader">Booked Services (1)</span>
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
                        <div class="gpm-card-header">
                            <span class="gpm-card-title">Discounts &amp; Offers</span>
                        </div>

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
                        <div class="gpm-card-header">
                            <span class="gpm-card-title">Bill Summary</span>
                        </div>
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
                        <div class="gpm-card-header">
                            <span class="gpm-card-title">Select Payment Method</span>
                        </div>
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

export function closeGlobalPaymentModal() {
    document.getElementById('gpmOverlay')?.classList.remove('active');
}

export function updateCashChange() {
    const { paymentState } = gpmState;
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

export function calculateFinalDue() {
    const { globalPaymentConfig, paymentState } = gpmState;
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
