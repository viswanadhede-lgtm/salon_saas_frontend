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
        const step2Span = step2.querySelector('span');
        if (step2Span) step2Span.textContent = 'Activating your subscription';
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

    // Extract user details from signup_data
    const planId       = signupData.plan_id       || null;
    const userId       = signupData.user_id        || null;
    const userName     = signupData.full_name      || null;
    const userEmail    = signupData.email          || null;
    const userPhone    = signupData.phone          || null;
    const billingCycle = signupData.billing_cycle  || 'monthly'; // 'monthly' or 'yearly'

    // --- Begin activation ---
    await activateTrial();

    // ---------------------------------------------------------------
    // STEP 1: Verify (subscription_id present)
    // STEP 2: Insert into payments + subscriptions + update companies
    // STEP 3: Clear caches & redirect to dashboard
    // ---------------------------------------------------------------
    async function activateTrial() {
        try {
            // STEP 1 — subscription_id verified ✅
            markDone(step1);
            markActive(step2);

            const now = new Date();
            let periodEnd;

            if (flowType === 'paid') {
                periodEnd = new Date(
                    billingCycle === 'annual'
                        ? now.getTime() + 365 * 24 * 60 * 60 * 1000
                        : now.getTime() + 30 * 24 * 60 * 60 * 1000
                );
            } else {
                periodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
            }

            const nextCharge = periodEnd; 

            // ── 1. Insert into payments table ────────────────────────────
            // ── 1. Update the existing payments row (Created by Edge Function or Webhook) ──
            const { error: payError } = await supabase
                .from('payments')
                .eq('order_id', reference_id)
                .update({
                    name:           userName,
                    phone:          userPhone,
                    payment_id:     razorpay_payment_id || null,
                    status:         flowType === 'paid' ? 'active' : 'authenticated'
                    // 'authenticated' = mandate set up, billing starts after 7 days
                    // Webhook will update this to 'charged' when first charge fires
                });

            if (payError) {
                console.warn('[payment-result] payments insert warning (non-critical):', payError);
            } else {
                console.log('[payment-result] payments row inserted.');
            }

            // Lookup billing amount (amount charged after trial / on renewal)
            const PLAN_PRICING = {
                'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce': { monthly: 1999,  annual: 19999  },
                'b42bcd41-217a-4ddb-9451-20e040984277': { monthly: 4999,  annual: 49999  },
                'b32fe38d-a715-4166-acf1-b970bd845c21': { monthly: 9999,  annual: 99999  },
                '2e86d143-72aa-4ae4-a925-ded2b8475dc8': { monthly: 19999, annual: 199999 }
            };
            const planPricing  = PLAN_PRICING[planId] || { monthly: 0, annual: 0 };
            const billingAmount = billingCycle === 'annual' ? planPricing.annual : planPricing.monthly;

            // ── 2. Insert into subscriptions table ───────────────────────
            const { error: subError } = await supabase
                .from('subscriptions')
                .insert({
                    subscription_id:      reference_id,
                    company_id:           companyId,
                    plan_id:              planId,
                    user_id:              userId,
                    name:                 userName,
                    email:                userEmail,
                    phone:                userPhone,
                    billing_cycle:        billingCycle,
                    billing_amount:       billingAmount, // Amount charged at next renewal
                    status:               'active',
                    current_period_start: now.toISOString(),
                    current_period_end:   periodEnd.toISOString(),
                    next_charge_at:       nextCharge.toISOString()
                });

            if (subError) {
                console.error('[payment-result] subscriptions insert error:', subError);
                throw new Error('Failed to create subscription record. Please contact support.');
            }
            console.log('[payment-result] subscriptions row inserted.');

            // ── 3. Update companies table with trial/paid status ─────────
            const { error: compError } = await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update({
                    subscription_type:       flowType, // 'trial' or 'paid'
                    subscription_status:     'active',
                    subscription_start_date: now.toISOString(),
                    subscription_end_date:   periodEnd.toISOString()
                });

            if (compError) {
                console.warn('[payment-result] companies update warning (non-critical):', compError);
            } else {
                console.log('[payment-result] companies subscription status updated.');
            }

            markDone(step2);
            markActive(step3);

            // STEP 3 — Clear stale caches & redirect
            localStorage.removeItem('userFeatures');
            localStorage.removeItem('userSubFeatures');
            localStorage.removeItem('appContext');

            showSuccess();

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2500);

        } catch (err) {
            console.error('[payment-result] activateTrial error:', err);
            showError(
                'Activation Failed',
                err.message || 'Something went wrong while activating your trial. Your payment was received — please contact support.'
            );
        }
    }

    // ---------------------------------------------------------------
    // UI State Helpers
    // ---------------------------------------------------------------

    function markDone(el) {
        el.classList.remove('active');
        el.classList.add('done');
    }

    function markActive(el) {
        el.classList.add('active');
    }

    function showSuccess() {
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
        iconArea.classList.add('error');
        resultIcon.innerHTML = `
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
        heading.textContent = title;
        subtext.textContent = message;
        retryBtn.style.display = 'inline-block';
    }
});
