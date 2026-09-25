import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- UI Element References ---
    const iconArea   = document.getElementById('iconArea');
    const resultIcon = document.getElementById('resultIcon');
    const heading    = document.getElementById('heading');
    const subtext    = document.getElementById('subtext');
    const step1      = document.getElementById('step1');
    const step2      = document.getElementById('step2');
    const step3      = document.getElementById('step3');
    const retryBtn   = document.getElementById('retryBtn');

    // --- Read Razorpay subscription callback params from URL ---
    // Razorpay sends back: razorpay_payment_id, razorpay_subscription_id, razorpay_signature
    const params                   = new URLSearchParams(window.location.search);
    const razorpay_payment_id      = params.get('razorpay_payment_id');
    const razorpay_subscription_id = params.get('razorpay_subscription_id');
    const razorpay_order_id        = params.get('razorpay_order_id');
    const flowType                 = params.get('flow_type') || 'trial'; // 'trial' or 'paid'
    const reference_id             = razorpay_subscription_id || razorpay_order_id; // Unifies both flows

    // Dynamically adjust text if paid
    if (flowType === 'paid') {
        heading.textContent = 'Activating your subscription';
        const step2Span = step2?.querySelector('span');
        if (step2Span) step2Span.textContent = 'Verifying your subscription';
    }

    console.log('[payment-result] URL params:', {
        razorpay_payment_id,
        reference_id,
        flowType
    });

    // --- Guard: reference_id is minimum required ---
    if (!reference_id) {
        showError(
            'Missing Payment Details',
            'We couldn\'t read your checkout details. Please try again or contact support.'
        );
        return;
    }

    // --- Read stored session data ---
    const companyId  = localStorage.getItem('company_id');
    const signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');

    if (!companyId) {
        showError(
            'Session Not Found',
            'We couldn\'t find your workspace session. Please sign in again and retry.'
        );
        return;
    }

    // Extract user details for non-payment profile sync (if needed)
    const userId    = signupData.user_id || null;
    const userPhone = signupData.phone   || null;

    // --- Begin Read-Only Polling ---
    await pollSubscriptionStatus();

    // ---------------------------------------------------------------
    // READ-ONLY SUBSCRIPTION VERIFICATION (POLLING)
    // ---------------------------------------------------------------
    async function pollSubscriptionStatus() {
        const MAX_POLL_ATTEMPTS = 10;
        const POLL_INTERVAL_MS = 2500;

        // STEP 1 — Payment callback parameters verified
        markDone(step1);
        markActive(step2);

        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            try {
                // 1. Query subscriptions table as single source of truth
                let { data: sub, error: subError } = await supabase
                    .from('subscriptions')
                    .select('*')
                    .eq('subscription_id', reference_id)
                    .maybeSingle();

                if (subError) {
                    console.warn(`[payment-result] Poll attempt ${attempt} error:`, subError);
                }

                // Fallback: check by company_id if reference_id lookup returns no row yet
                if (!sub && companyId) {
                    const { data: companySubs } = await supabase
                        .from('subscriptions')
                        .select('*')
                        .eq('company_id', companyId)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (companySubs && companySubs.length > 0) {
                        sub = companySubs[0];
                    }
                }

                if (sub) {
                    const status = (sub.status || '').toLowerCase().trim();
                    console.log(`[payment-result] Poll attempt ${attempt}: Subscription status is "${status}"`);

                    // Active state reached
                    if (['active', 'trial', 'trialing'].includes(status)) {
                        markDone(step2);
                        markActive(step3);

                        // Backfill phone into users and profiles if missing (Google OAuth onboarding)
                        if (userPhone && userId) {
                            try {
                                await Promise.all([
                                    supabase
                                        .from('users')
                                        .update({ phone: userPhone })
                                        .eq('user_id', userId)
                                        .eq('company_id', companyId),
                                    supabase
                                        .from('profiles')
                                        .update({ phone: userPhone })
                                        .eq('user_id', userId)
                                        .eq('company_id', companyId)
                                ]);
                            } catch (e) {
                                console.warn('[payment-result] Profile phone backfill warning:', e);
                            }
                        }

                        // Clear cached permissions so dashboard reloads fresh state from subscriptions
                        localStorage.removeItem('userFeatures');
                        localStorage.removeItem('userSubFeatures');
                        localStorage.removeItem('appContext');

                        showSuccess();

                        setTimeout(() => {
                            window.location.href = 'dashboard.html';
                        }, 2000);
                        return;
                    }

                    // Terminal failure states
                    if (['cancelled', 'halted', 'past_due', 'failed'].includes(status)) {
                        markFailed(step2);
                        showError(
                            'Subscription Issue',
                            `Your subscription status is ${status}. Please check your payment method or contact support.`
                        );
                        return;
                    }

                    // Transient / pending state (created, authenticated, pending)
                    subtext.textContent = `Awaiting confirmation from payment provider (attempt ${attempt} of ${MAX_POLL_ATTEMPTS})...`;
                } else {
                    console.log(`[payment-result] Poll attempt ${attempt}: Subscription record not found yet.`);
                    subtext.textContent = `Confirming your payment with the bank (attempt ${attempt} of ${MAX_POLL_ATTEMPTS})...`;
                }
            } catch (err) {
                console.warn(`[payment-result] Unexpected error during poll attempt ${attempt}:`, err);
            }

            // Wait before next poll attempt
            if (attempt < MAX_POLL_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        }

        // Webhook has not marked subscription active within the polling window
        showVerificationPending();
    }

    // ---------------------------------------------------------------
    // UI State Helpers
    // ---------------------------------------------------------------

    function markDone(el) {
        if (!el) return;
        el.classList.remove('active', 'failed');
        el.classList.add('done');
    }

    function markActive(el) {
        if (!el) return;
        el.classList.remove('done', 'failed');
        el.classList.add('active');
    }

    function markFailed(el) {
        if (!el) return;
        el.classList.remove('active', 'done');
        el.classList.add('failed');
    }

    function showSuccess() {
        iconArea.classList.remove('error');
        iconArea.classList.add('success');
        resultIcon.innerHTML = `
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`;
        if (flowType === 'paid') {
            heading.textContent = 'Subscription Activated!';
            subtext.textContent = 'Your paid subscription is now active. Redirecting you to your dashboard...';
        } else {
            heading.textContent = 'Trial Activated!';
            subtext.textContent = 'Your 7-day free trial is now active. Redirecting you to your dashboard...';
        }
        markDone(step3);
    }

    function showError(title, message) {
        iconArea.classList.remove('success');
        iconArea.classList.add('error');
        resultIcon.innerHTML = `
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
        heading.textContent = title;
        subtext.textContent = message;
        if (retryBtn) {
            retryBtn.textContent = 'Try Again';
            retryBtn.onclick = () => { window.location.href = 'payments.html'; };
            retryBtn.style.display = 'inline-block';
        }
    }

    function showVerificationPending() {
        markActive(step2);
        heading.textContent = 'Payment Received — Verification in Progress';
        subtext.textContent = 'Your payment details were received, but bank confirmation is taking a moment. Your subscription will activate automatically once processed.';
        if (retryBtn) {
            retryBtn.textContent = 'Go to Billing';
            retryBtn.onclick = () => { window.location.href = 'billing-subscription.html'; };
            retryBtn.style.display = 'inline-block';
        }
    }
});
