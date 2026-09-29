// billing-modal-cancel.js — Modal 3: Cancel Subscription + Renewal handler
// Part of scripts/billing/ modularization of billing-subscription.js
// IMPORTANT: No subscription mutations — contact-support flow only.

'use strict';

import { state } from './billing-state.js';
import { showToast } from './billing-helpers.js';
import { openModal, closeModal } from './billing-renders.js';

// DOM references — injected via initModalCancel()
let dom = {};

export function initModalCancel(domRefs) {
    dom = domRefs;
}

const CANCELLATION_REASONS = {
    'too_expensive': 'Too expensive',
    'not_using_enough': 'Not using BharatBots enough',
    'missing_features': 'Missing features I need',
    'technical_issues': 'Technical issues',
    'moving_to_another_solution': 'Moving to another solution',
    'business_temporarily_closed': 'Business temporarily closed',
    'other': 'Other'
};

// ── Form Validation Helpers ────────────────────────────────────

export function updateCancelButtonState() {
    if (!dom.btnConfirmCancelSubscription) return;
    const selectedRadio = dom.cancelReasonGroup ? dom.cancelReasonGroup.querySelector('input[name="cancelReason"]:checked') : null;
    if (!selectedRadio) {
        dom.btnConfirmCancelSubscription.disabled = true;
        return;
    }
    if (selectedRadio.value === 'other') {
        const hasText = dom.cancelOtherTextarea && dom.cancelOtherTextarea.value.trim().length > 0;
        dom.btnConfirmCancelSubscription.disabled = !hasText;
    } else {
        dom.btnConfirmCancelSubscription.disabled = false;
    }
}

export function resetCancelModalForm() {
    if (dom.cancelReasonGroup) {
        const radios = dom.cancelReasonGroup.querySelectorAll('input[name="cancelReason"]');
        radios.forEach(radio => radio.checked = false);
    }
    if (dom.cancelOtherFeedback) {
        dom.cancelOtherFeedback.style.display = 'none';
    }
    if (dom.cancelOtherTextarea) {
        dom.cancelOtherTextarea.value = '';
    }
    if (dom.btnConfirmCancelSubscription) {
        dom.btnConfirmCancelSubscription.disabled = true;
    }
}

// ── Modal Open/Close ───────────────────────────────────────────

export function openCancelSubscriptionModal() {
    const isScheduledCancellation = state.plan.autoRenew === false ||
                                    state.currentMode === 'cancelled' ||
                                    (state.plan.status && state.plan.status.toLowerCase() === 'cancelled');
    if (isScheduledCancellation) {
        showToast('Subscription is already scheduled for cancellation.');
        return;
    }

    const rawPlanName = state.plan.name || 'Growth';
    const planDisplay = rawPlanName.toLowerCase().includes('plan') ? rawPlanName : `${rawPlanName} Plan`;
    const validUntil = state.plan.validUntil && state.plan.validUntil !== '—' ? state.plan.validUntil : '';

    if (dom.cancelModalSubtitle) {
        dom.cancelModalSubtitle.textContent = validUntil
            ? `Your ${planDisplay} will remain active until ${validUntil}. Your subscription will not renew after this date.`
            : `Your ${planDisplay} will remain active until the end of your billing cycle. Your subscription will not renew after this date.`;
    }
    if (dom.cancelInfoActiveDate) {
        dom.cancelInfoActiveDate.textContent = validUntil || 'the end of your billing cycle';
    }
    resetCancelModalForm();
    openModal(dom.modalCancelSub);
}

// ── Renewal Handler ────────────────────────────────────────────

export async function handleRenewSubscription() {
    if (!state.subscriptionId) {
        showToast('No active subscription found to renew.');
        return;
    }
    showToast('Online renewal is currently unavailable. Please contact support or renew via checkout.');
}

// ── Event Binding ──────────────────────────────────────────────

export function bindCancelModalEvents() {
    const btnTriggerCancelModal = document.getElementById('btnTriggerCancelModal');
    if (btnTriggerCancelModal) {
        btnTriggerCancelModal.addEventListener('click', openCancelSubscriptionModal);
    }

    // Handle cancellation reason selection and conditional 'Other' feedback textarea
    if (dom.cancelReasonGroup) {
        dom.cancelReasonGroup.addEventListener('change', function (e) {
            if (e.target && e.target.name === 'cancelReason') {
                const selectedValue = e.target.value;
                if (selectedValue === 'other') {
                    if (dom.cancelOtherFeedback) dom.cancelOtherFeedback.style.display = 'flex';
                    if (dom.cancelOtherTextarea) dom.cancelOtherTextarea.focus();
                } else {
                    if (dom.cancelOtherFeedback) dom.cancelOtherFeedback.style.display = 'none';
                }
                updateCancelButtonState();
            }
        });
    }

    if (dom.cancelOtherTextarea) {
        dom.cancelOtherTextarea.addEventListener('input', updateCancelButtonState);
    }

    if (dom.btnConfirmCancelSubscription) {
        dom.btnConfirmCancelSubscription.addEventListener('click', async function () {
            if (dom.btnConfirmCancelSubscription.disabled) return;

            const selectedRadio = dom.cancelReasonGroup ? dom.cancelReasonGroup.querySelector('input[name="cancelReason"]:checked') : null;
            if (!selectedRadio) {
                showToast('Please select a cancellation reason.');
                return;
            }

            if (selectedRadio.value === 'other') {
                const customText = dom.cancelOtherTextarea ? dom.cancelOtherTextarea.value.trim() : '';
                if (!customText) {
                    showToast('Please enter your cancellation reason.');
                    if (dom.cancelOtherTextarea) dom.cancelOtherTextarea.focus();
                    return;
                }
            }

            if (!state.subscriptionId) {
                console.warn('[Billing] No active subscription_id in state to cancel.');
                showToast('No active subscription found to cancel.');
                return;
            }

            // Close modal and reset form without client-side DB mutation
            closeModal(dom.modalCancelSub);
            resetCancelModalForm();

            showToast('Subscription cancellation is managed via billing support. Please contact support to cancel your plan.');
        });
    }
}
