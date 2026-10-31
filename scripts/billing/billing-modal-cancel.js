// billing-modal-cancel.js — Modal 3: Cancel Subscription + Renewal handler
// Part of scripts/billing/ modularization of billing-subscription.js
// IMPORTANT: No subscription mutations — contact-support flow only.

'use strict';

import { state } from './billing-state.js';
import { showToast, getCompanyId, formatDateDisplay } from './billing-helpers.js';
import { openModal, closeModal } from './billing-renders.js';
import { loadActiveSubscriptionOnce } from './billing-api.js';

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
    const isScheduledCancellation = state.plan.cancelAtCycleEnd === true ||
                                    state.plan.autoRenew === false ||
                                    state.currentMode === 'cancelled' ||
                                    (state.plan.status && state.plan.status.toLowerCase() === 'cancelled');
    if (isScheduledCancellation) {
        showToast('Subscription is already scheduled for cancellation.');
        return;
    }

    const isTrial = state.plan.isTrial === true;
    const rawPlanName = state.plan.name || 'Current';
    const planDisplay = rawPlanName.toLowerCase().includes('plan') ? rawPlanName : `${rawPlanName} Plan`;
    const trialEndDate = state.plan.trialEndAt ? formatDateDisplay(state.plan.trialEndAt) : state.plan.validUntil;
    const validUntil = (isTrial && trialEndDate && trialEndDate !== '—')
        ? trialEndDate
        : (state.plan.validUntil && state.plan.validUntil !== '—' ? state.plan.validUntil : '');

    if (dom.cancelModalSubtitle) {
        if (isTrial) {
            dom.cancelModalSubtitle.textContent = validUntil
                ? `Your ${planDisplay} trial will remain active until ${validUntil}. You will not be charged when the trial ends.`
                : `Your ${planDisplay} trial will be cancelled and you will not be charged.`;
        } else {
            dom.cancelModalSubtitle.textContent = validUntil
                ? `Your ${planDisplay} will remain active until ${validUntil}. Your subscription will not renew after this date.`
                : `Your ${planDisplay} will remain active until the end of your billing cycle. Your subscription will not renew after this date.`;
        }
    }
    if (dom.cancelInfoActiveDate) {
        dom.cancelInfoActiveDate.textContent = validUntil || (isTrial ? 'the end of your trial' : 'the end of your billing cycle');
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

            const reasonKey = selectedRadio.value;
            let customText = '';
            if (reasonKey === 'other') {
                customText = dom.cancelOtherTextarea ? dom.cancelOtherTextarea.value.trim() : '';
                if (!customText) {
                    showToast('Please enter your cancellation reason.');
                    if (dom.cancelOtherTextarea) dom.cancelOtherTextarea.focus();
                    return;
                }
            } else {
                customText = CANCELLATION_REASONS[reasonKey] || reasonKey;
            }

            const companyId = getCompanyId();
            if (!companyId) {
                showToast('Company ID not found. Please reload and try again.');
                return;
            }

            // Retrieve authenticated JWT
            let accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                try {
                    const { supabase } = await import('../../lib/supabase.js');
                    const { data: sessData } = await supabase.auth.getSession();
                    accessToken = sessData?.session?.access_token || '';
                } catch (_) {}
            }

            if (!accessToken) {
                showToast('Your session has expired. Please sign in again.');
                return;
            }

            const originalBtnText = dom.btnConfirmCancelSubscription.textContent;
            dom.btnConfirmCancelSubscription.disabled = true;
            dom.btnConfirmCancelSubscription.textContent = 'Cancelling...';

            try {
                const SUPABASE_URL = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
                const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

                const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-subscription`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        company_id: companyId,
                        // cancel-subscription v2 prefers the local subscriptions.id UUID
                        subscription_id: state.localSubscriptionId || state.razorpaySubscriptionId || state.subscriptionId || null,
                        reason: reasonKey,
                        feedback: customText,
                        cancel_at_cycle_end: true
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok || result.error) {
                    throw new Error(result.error || 'Failed to cancel subscription.');
                }

                closeModal(dom.modalCancelSub);
                resetCancelModalForm();

                showToast(result.message || 'Subscription scheduled for cancellation at billing cycle end.', 'success');

                // Reload active subscription data from DB so plan card & state update immediately
                await loadActiveSubscriptionOnce();

            } catch (err) {
                console.error('[Billing] Cancellation failed:', err);
                showToast(err.message || 'Could not cancel subscription. Please try again.', 'error');
            } finally {
                dom.btnConfirmCancelSubscription.disabled = false;
                dom.btnConfirmCancelSubscription.textContent = originalBtnText;
            }
        });
    }
}

