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

    // Open payment method modal
    const btnChangePaymentMethod = document.getElementById('btnChangePaymentMethod');
    if (btnChangePaymentMethod) {
        btnChangePaymentMethod.addEventListener('click', function () {
            const pm = state.paymentMethod;
            setPaymentTab(pm.type || 'card');

            if (dom.inputCardHolder) dom.inputCardHolder.value = pm.holder || 'Admin User';
            if (dom.inputCardNumber) dom.inputCardNumber.value = '';
            if (dom.inputCardExpiry) dom.inputCardExpiry.value = (pm.expiry || '09/28').replace(/\s+/g, '');
            if (dom.inputCardCvv) dom.inputCardCvv.value = '';
            if (dom.inputUpiId) dom.inputUpiId.value = pm.upiId || 'salonadmin@okhdfcbank';

            renderPaymentMethod();
            openModal(dom.modalChangePayment);
        });
    }

    // Save payment method — UI-only, updates state.paymentMethod, no DB write
    if (dom.btnSavePaymentMethod) {
        dom.btnSavePaymentMethod.addEventListener('click', function () {
            if (activePaymentTab === 'upi') {
                const upiVal = dom.inputUpiId ? dom.inputUpiId.value.trim() : '';
                const finalUpi = upiVal && upiVal.includes('@') ? upiVal : (upiVal ? upiVal + '@okhdfcbank' : 'salonadmin@okhdfcbank');

                state.paymentMethod.type = 'upi';
                state.paymentMethod.upiId = finalUpi;
                state.paymentMethod.upiApp = selectedUpiApp || 'Google Pay';
                state.paymentMethod.holder = dom.inputCardHolder ? dom.inputCardHolder.value.trim() || 'Admin User' : 'Admin User';

                const { closeModal: close } = { closeModal: (el) => el && el.classList.remove('is-open') };
                if (dom.modalChangePayment) dom.modalChangePayment.classList.remove('is-open');
                renderPaymentMethod();
                showToast(`Payment method updated to UPI AutoPay (${selectedUpiApp}).`);
            } else if (activePaymentTab === 'netbanking') {
                const finalBank = selectedBank || 'HDFC Bank';

                state.paymentMethod.type = 'netbanking';
                state.paymentMethod.bankName = finalBank;
                state.paymentMethod.holder = dom.inputCardHolder ? dom.inputCardHolder.value.trim() || 'Admin User' : 'Admin User';

                if (dom.modalChangePayment) dom.modalChangePayment.classList.remove('is-open');
                renderPaymentMethod();
                showToast(`Payment method updated to ${finalBank} e-Mandate.`);
            } else {
                // Card tab
                const rawCard = dom.inputCardNumber ? dom.inputCardNumber.value.trim().replace(/\s+/g, '') : '';
                const holder = (dom.inputCardHolder && dom.inputCardHolder.value.trim()) || 'Admin User';
                const expiry = (dom.inputCardExpiry && dom.inputCardExpiry.value.trim()) || '09 / 2028';
                const brand = detectCardBrand(rawCard);

                let mask = state.paymentMethod.cardMask || '•••• •••• •••• 4242';
                if (rawCard.length >= 4) {
                    mask = `•••• •••• •••• ${rawCard.slice(-4)}`;
                }

                state.paymentMethod.type = 'card';
                state.paymentMethod.holder = holder;
                state.paymentMethod.cardMask = mask;
                state.paymentMethod.expiry = expiry.includes('/') ? expiry : '09 / 2028';
                state.paymentMethod.brand = brand;
                state.paymentMethod.network = `${brand} / MASTERCARD`;

                if (dom.modalChangePayment) dom.modalChangePayment.classList.remove('is-open');
                renderPaymentMethod();
                showToast(`Payment method updated to ${brand} Card.`);
            }
        });
    }
}
