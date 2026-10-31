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
                                    state.currentMode === 'trialCancelled' ||
                                    (state.plan.status && state.plan.status.toLowerCase() === 'cancelled');
    if (isScheduledCancellation) {
        showToast('Subscription is already scheduled for cancellation.');
        return;
    }

    const isTrial = state.plan.isTrial === true;
    const rawPlanName = state.plan.name || 'Current';
    const planDisplay = rawPlanName.toLowerCase().includes('plan') ? rawPlanName : `${rawPlanName} Plan`;
    const trialEndDate = state.plan.trialEndAt ? formatDateDisplay(state.plan.trialEndAt) : state.plan.validUntil;
    const validUntil = (!isTrial && state.plan.validUntil && state.plan.validUntil !== '—')
        ? state.plan.validUntil
        : '';

    // ── Update modal title ────────────────────────────────────────────────────
    const modalTitleEl = document.getElementById('cancelModalTitle');
    if (modalTitleEl) {
        modalTitleEl.textContent = isTrial ? 'Cancel Free Trial?' : 'Cancel Subscription?';
    }

    // ── Update modal subtitle ─────────────────────────────────────────────────
    if (dom.cancelModalSubtitle) {
        if (isTrial) {
            dom.cancelModalSubtitle.textContent =
                'Are you sure you want to cancel your free trial? Your trial access will end immediately. Your payment mandate will be revoked and you will not be charged.';
        } else {
            dom.cancelModalSubtitle.textContent = validUntil
                ? `Your ${planDisplay} will remain active until ${validUntil}. Your subscription will not renew after this date.`
                : `Your ${planDisplay} will remain active until the end of your billing cycle. Your subscription will not renew after this date.`;
        }
    }

    // ── Update "What happens after cancellation?" info list ───────────────────
    const cancelInfoList = document.getElementById('cancelInfoList');
    if (cancelInfoList) {
        if (isTrial) {
            cancelInfoList.innerHTML = `
                <li>Your trial access ends <strong>immediately</strong> upon confirmation.</li>
                <li>Your payment mandate (auto-debit authorisation) will be revoked.</li>
                <li>You will not be charged — no subscription payments will be made.</li>
                <li>You can subscribe to a paid plan at any time to restore full access.</li>
            `;
        } else {
            const activeDateHtml = validUntil
                ? `<strong id="cancelInfoActiveDate">${validUntil}</strong>`
                : `<strong id="cancelInfoActiveDate">the end of your billing cycle</strong>`;
            cancelInfoList.innerHTML = `
                <li>Your subscription remains active until ${activeDateHtml}.</li>
                <li>It will not renew after that date.</li>
                <li>No further subscription payment will be charged after cancellation.</li>
                <li>Your active add-ons will also end when your subscription ends.</li>
            `;
        }
    } else if (dom.cancelInfoActiveDate && !isTrial) {
        dom.cancelInfoActiveDate.textContent = validUntil || 'the end of your billing cycle';
    }

    // ── Update confirm button label ───────────────────────────────────────────
    if (dom.btnConfirmCancelSubscription) {
        dom.btnConfirmCancelSubscription.textContent = isTrial ? 'Cancel Free Trial' : 'Confirm Cancellation';
        dom.btnConfirmCancelSubscription.disabled = true; // Reset; user must still select a reason
    }

    // ── Update keep/dismiss button label ─────────────────────────────────────
    const keepBtn = document.querySelector('#modalCancelSub .btn-plain-primary[data-close-modal]');
    if (keepBtn) {
        keepBtn.textContent = isTrial ? 'Keep Free Trial' : 'Keep Subscription';
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
                customText = '';
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

            const isTrial = state.plan.isTrial === true;
            const originalBtnText = dom.btnConfirmCancelSubscription.textContent;
            dom.btnConfirmCancelSubscription.disabled = true;
            dom.btnConfirmCancelSubscription.textContent = isTrial ? 'Cancelling trial...' : 'Cancelling...';

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
                        feedback: reasonKey === 'other' ? customText : '',
                        // Trials are cancelled immediately (cancel_at_cycle_end: false).
                        // Paid subscriptions are cancelled at the end of the billing cycle (cancel_at_cycle_end: true).
                        cancel_at_cycle_end: isTrial ? false : true
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok || result.error) {
                    throw new Error(result.error || 'Failed to cancel subscription.');
                }

                closeModal(dom.modalCancelSub);
                resetCancelModalForm();

                // Show context-appropriate success message
                if (isTrial) {
                    showToast('Your free trial has been cancelled. Access has ended.', 'success');
                } else {
                    showToast('Your subscription has been scheduled for cancellation.', 'success');
                }

                // Reload active subscription data from DB so plan card & state update immediately.
                // The Realtime listener will also trigger this, but calling it directly ensures
                // immediate feedback without waiting for the Realtime event.
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

