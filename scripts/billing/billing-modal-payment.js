// billing-modal-payment.js — Modal 5: Change Payment Method
// Part of scripts/billing/ modularization of billing-subscription.js
// UI-only — updates state.paymentMethod in memory, no DB write.

'use strict';

import { state } from './billing-state.js';
import { showToast, detectCardBrand } from './billing-helpers.js';
import { openModal, renderPaymentMethod } from './billing-renders.js';

// DOM references — injected via initModalPayment()
let dom = {};

export function initModalPayment(domRefs) {
    dom = domRefs;
}

// ── Tab / Panel State ──────────────────────────────────────────
let activePaymentTab = 'card';
let selectedUpiApp = 'Google Pay';
let selectedBank = 'HDFC Bank';

// ── Tab Switching ──────────────────────────────────────────────

export function setPaymentTab(tabName) {
    activePaymentTab = tabName;
    if (dom.paymentMethodTabs) {
        dom.paymentMethodTabs.querySelectorAll('.payment-method-tab').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tabName);
        });
    }
    const panels = {
        card: document.getElementById('panelPaymentCard'),
        upi: document.getElementById('panelPaymentUpi'),
        netbanking: document.getElementById('panelPaymentNetbanking')
    };
    Object.keys(panels).forEach(key => {
        if (panels[key]) {
            panels[key].classList.toggle('is-active', key === tabName);
        }
    });
    if (window.feather) feather.replace();
}

// ── Event Binding ──────────────────────────────────────────────

export function bindPaymentModalEvents() {
    // Tab switching
    if (dom.paymentMethodTabs) {
        dom.paymentMethodTabs.querySelectorAll('.payment-method-tab').forEach(btn => {
            btn.addEventListener('click', function () {
                const tab = this.getAttribute('data-tab');
                setPaymentTab(tab);
            });
        });
    }

    // Card number: auto-format + brand detection
    if (dom.inputCardNumber) {
        dom.inputCardNumber.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 16);
            let formatted = val.match(/.{1,4}/g)?.join(' ') || val;
            this.value = formatted;

            const brand = detectCardBrand(val);
            if (dom.inputCardBrandBadge) {
                dom.inputCardBrandBadge.textContent = brand;
            }
        });
    }

    // Card expiry: auto-format MM/YY
    if (dom.inputCardExpiry) {
        dom.inputCardExpiry.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 4);
            if (val.length >= 3) {
                this.value = val.slice(0, 2) + '/' + val.slice(2);
            } else {
                this.value = val;
            }
        });
    }

    // UPI App Selector
    if (dom.upiAppGrid) {
        dom.upiAppGrid.querySelectorAll('.upi-app-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                dom.upiAppGrid.querySelectorAll('.upi-app-pill').forEach(p => p.classList.remove('is-selected'));
                this.classList.add('is-selected');
                selectedUpiApp = this.getAttribute('data-app') || 'Google Pay';
            });
        });
    }

    // UPI Handle Chips
    if (dom.upiHandlesRow && dom.inputUpiId) {
        dom.upiHandlesRow.querySelectorAll('.upi-handle-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                const handle = this.getAttribute('data-handle');
                let currentVal = dom.inputUpiId.value.trim();
                if (!currentVal) {
                    dom.inputUpiId.value = 'username' + handle;
                } else if (currentVal.includes('@')) {
                    dom.inputUpiId.value = currentVal.split('@')[0] + handle;
                } else {
                    dom.inputUpiId.value = currentVal + handle;
                }
                dom.inputUpiId.focus();
            });
        });
    }

    // Bank Selector Grid
    if (dom.bankSelectorGrid) {
        dom.bankSelectorGrid.querySelectorAll('.bank-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                dom.bankSelectorGrid.querySelectorAll('.bank-pill').forEach(p => p.classList.remove('is-selected'));
                this.classList.add('is-selected');
                selectedBank = this.getAttribute('data-bank') || 'HDFC Bank';
                if (dom.selectOtherBank) dom.selectOtherBank.value = '';
            });
        });
    }

    if (dom.selectOtherBank) {
        dom.selectOtherBank.addEventListener('change', function () {
            if (this.value) {
                if (dom.bankSelectorGrid) {
                    dom.bankSelectorGrid.querySelectorAll('.bank-pill').forEach(p => p.classList.remove('is-selected'));
                }
                selectedBank = this.value;
            }
        });
    }

    // Payment method action (V1: inert)
    const btnChangePaymentMethod = document.getElementById('btnChangePaymentMethod');
    if (btnChangePaymentMethod) {
        btnChangePaymentMethod.addEventListener('click', function (e) {
            e.preventDefault();
            // Inert in V1: does nothing when clicked
        });
    }

    // V1: Save payment method button is intentionally disabled.
    // Payment method data is read-only from the payments ledger.
    // V2 will implement tokenized card/UPI mandate update flows here.
    if (dom.btnSavePaymentMethod) {
        dom.btnSavePaymentMethod.disabled = true;
        dom.btnSavePaymentMethod.addEventListener('click', function (e) {
            e.preventDefault();
            // Inert in V1 — no DB write, no state mutation
        });
    }
}
