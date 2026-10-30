import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // ── URL Params & State ──────────────────────────────────────────
    const params      = new URLSearchParams(window.location.search);
    const companyId   = params.get('company_id') || localStorage.getItem('company_id');
    const flow        = params.get('flow'); // 'upgrade' | 'renew' | undefined
    const msgDiv      = document.getElementById('paymentMessage');

    // Read localStorage
    const signupData      = JSON.parse(localStorage.getItem('signup_data') || '{}');
    const planId          = params.get('plan_id')       || signupData.plan_id;
    const planNameRaw     = params.get('plan_name')     || signupData.plan_name || localStorage.getItem('selected_plan') || 'Growth';
    const savedCycle      = params.get('billing_cycle') || signupData.billing_cycle || 'monthly';
    
    let currentCycle      = (savedCycle === 'annual' || savedCycle === 'yearly') ? 'annual' : 'monthly';

    // Buttons & interactive elements
    const btnPayNow       = document.getElementById('btnPayNow');
    const btnTrial        = document.getElementById('btnTrial');
    const cycleCardMonthly = document.getElementById('cycleCardMonthly');
    const cycleCardAnnual  = document.getElementById('cycleCardAnnual');

    // ── Guard: must have company & plan ────────────────────────────
    if (!companyId) {
        showMessage('No company ID found. Please return to the signup page.', 'error');
        return;
    }
    if (!planId) {
        showMessage('No plan selected. Please return to the plans page.', 'error');
        return;
    }

    // ── Hide trial banner for upgrade / renew flows ─────────────────
    if (flow === 'upgrade' || flow === 'renew') {
        if (btnTrial) btnTrial.style.display = 'none';
        const trialInfo = document.getElementById('trialInfoBanner');
        if (trialInfo) trialInfo.style.display = 'none';
        const choiceDiv = document.getElementById('choiceDivider');
        if (choiceDiv) choiceDiv.style.display = 'none';
    }

    // ── Fetch plan details from Supabase ────────────────────────────
    let monthlyPrice    = 799;
    let yearlyPrice     = 7990;
    let planDisplayName = planNameRaw.toUpperCase();
    let isPlanLoaded    = false;
    let dbPlan          = null;

    try {
        const { data, error } = await supabase
            .from('plans')
            .select('plan_id, id, plan_name, price_monthly, price_yearly, status')
            .or(`plan_id.eq.${planId},id.eq.${planId}`)
            .eq('status', 'active')
            .maybeSingle();

        if (error) throw error;

        if (data) {
            dbPlan = data;
            monthlyPrice    = parseFloat(data.price_monthly) || 799;
            yearlyPrice     = parseFloat(data.price_yearly)  || (monthlyPrice * 10);
            planDisplayName = (data.plan_name || planNameRaw).toUpperCase();
        } else {
            // Fallback: If not found by UUID, try lookup by plan name
            const { data: planByName } = await supabase
                .from('plans')
                .select('plan_id, id, plan_name, price_monthly, price_yearly, status')
                .ilike('plan_name', planNameRaw)
                .eq('status', 'active')
                .maybeSingle();

            if (planByName) {
                dbPlan = planByName;
                monthlyPrice    = parseFloat(planByName.price_monthly) || 799;
                yearlyPrice     = parseFloat(planByName.price_yearly)  || (monthlyPrice * 10);
                planDisplayName = planByName.plan_name.toUpperCase();
            }
        }

        isPlanLoaded = true;

    } catch (err) {
        console.error('[payments] Failed to fetch plan from database:', err);
        isPlanLoaded = true; // Fall back gracefully to defaults so user is not blocked
    }

    // ── Update Plan Details in DOM ──────────────────────────────────
    setText('dispPlanName', planDisplayName);
    setText('sumPlanName',  planDisplayName);

    // Plan-specific subtitles and badges
    const isGrowth  = planDisplayName.includes('GROWTH');
    const isAdvance = planDisplayName.includes('ADVANCE');
    const isPro     = planDisplayName.includes('PRO');

    let subtitleText = 'All core features to manage your business';
    let badgeText    = 'Starter plan';
    let b1Title = 'All core features',             b1Desc = 'Everything you need to run your business';
    let b2Title = 'Multiple staff & Multi Logins', b2Desc = 'Manage team access with ease';
    let b3Title = 'Basic Reporting',               b3Desc = 'Essential financial & sales tracking';
    let b4Title = 'Email Support',                 b4Desc = 'Help when you need it via email';

    if (isAdvance) {
        subtitleText = 'Advanced Features to grow your Business';
        badgeText    = 'Most Popular';
        b1Title = 'All Advanced Features';      b1Desc = 'Marketing suite, coupons & memberships';
        b2Title = 'Multiple staff & Branches';  b2Desc = 'Multi-branch operations with ease';
        b3Title = 'Advanced Reporting';         b3Desc = 'Deep analytics & full reports';
        b4Title = 'Email & Live Chat';          b4Desc = 'Fast help via email & live chat';
    } else if (isPro) {
        subtitleText = 'Advanced Features to grow your Business';
        badgeText    = 'Multi Branch Salon Chains';
        b1Title = 'All Advanced Features';      b1Desc = 'Unrestricted platform access & top limits';
        b2Title = 'Multiple staff & Branches';  b2Desc = 'Enterprise branch & team capacity';
        b3Title = 'Advanced Reporting';         b3Desc = 'Deep insights, analytics & exports';
        b4Title = '24/7 Priority Support';      b4Desc = 'Dedicated VIP support anytime';
    }

    setText('dispPlanSubtitle', subtitleText);
    setText('sumPlanSub',       subtitleText);
    setText('dispPlanBadge',    badgeText);
    setText('sumPlanBadge',     badgeText);

    // Update 4 Plan Benefits in Left Card
    setText('benefitTitle1', b1Title);
    setText('benefitDesc1',  b1Desc);
    setText('benefitTitle2', b2Title);
    setText('benefitDesc2',  b2Desc);
    setText('benefitTitle3', b3Title);
    setText('benefitDesc3',  b3Desc);
    setText('benefitTitle4', b4Title);
    setText('benefitDesc4',  b4Desc);

    // Update Free Trial Banner Subtitle
    setText('trialBannerDesc', 'Set up the mandate & Enjoy 7 days Free Trial. You can cancel anytime.');

    // Calculate annual discount percentage
    const annualMonthlyEquiv = Math.round(yearlyPrice / 12);
    const regularAnnualCost  = monthlyPrice * 12;
    const discountPercent    = regularAnnualCost > 0 
        ? Math.round(((regularAnnualCost - yearlyPrice) / regularAnnualCost) * 100) 
        : 17;

    setText('dispMonthlyCost',  `₹ ${fmt(monthlyPrice)} per month`);
    setText('dispAnnualCost',   `₹ ${fmt(yearlyPrice)} per year`);
    setText('dispAnnualEquiv',  `That's only ₹ ${fmt(annualMonthlyEquiv)} per month`);

    const saveBadge = document.querySelector('.save-badge-pill');
    if (saveBadge && discountPercent > 0) {
        saveBadge.textContent = `Save ${discountPercent}%`;
    }

    // ── Function to Synchronize Dynamic Pricing ─────────────────────
    function renderPricing() {
        const isAnnual = currentCycle === 'annual';
        const currentAmount = isAnnual ? yearlyPrice : monthlyPrice;

        // Toggle card visual states
        if (isAnnual) {
            cycleCardAnnual?.classList.add('active');
            cycleCardMonthly?.classList.remove('active');
        } else {
            cycleCardMonthly?.classList.add('active');
            cycleCardAnnual?.classList.remove('active');
        }

        // Left plan rate display
        setText('dispPlanRate',   `₹ ${fmt(currentAmount)}`);
        setText('dispPlanPeriod', isAnnual ? '/ year' : '/ month');
        setText('dispBilledCycleLink', isAnnual ? 'Billed annually ⌵' : 'Billed monthly ⌵');

        // Right Order Summary breakdown
        setText('sumPlanPrice',    `₹ ${fmt(currentAmount)}`);
        setText('sumSubtotal',     `₹ ${fmt(currentAmount)}`);
        setText('sumGrandTotal',   `₹ ${fmt(currentAmount)}`);

        // Update Mini Plan Box Cycle Badge
        const cycleBadge = document.getElementById('sumCycleBadge');
        if (cycleBadge) {
            cycleBadge.textContent = isAnnual ? 'Annual' : 'Monthly';
            cycleBadge.className = isAnnual ? 'sp-cycle-badge annual' : 'sp-cycle-badge';
        }
    }

    // Initial render
    renderPricing();

    // ── Cycle Card Selection Listeners ──────────────────────────────
    if (cycleCardMonthly) {
        cycleCardMonthly.addEventListener('click', () => {
            currentCycle = 'monthly';
            renderPricing();
        });
    }

    if (cycleCardAnnual) {
        cycleCardAnnual.addEventListener('click', () => {
            currentCycle = 'annual';
            renderPricing();
        });
    }

    // ── Button Handlers ─────────────────────────────────────────────
    if (btnPayNow) {
        btnPayNow.addEventListener('click', () => {
            triggerOrderCreation(btnPayNow, planId, companyId, currentCycle, false);
        });
    }

    if (btnTrial) {
        btnTrial.addEventListener('click', () => {
            triggerSubscriptionCheckout(btnTrial, companyId, planId, currentCycle, true);
        });
    }

    // ═════════════════════════════════════════════════════════════════
    // PAYMENT TRIGGER: Pay Now (Immediate Subscription)
    // ═════════════════════════════════════════════════════════════════

    async function triggerOrderCreation(btn, planId, companyId, cycle, isTrial) {
        const originalHtml = btn.innerHTML;
        setLoading(btn, 'Initiating payment…');

        try {
            const { email, full_name, phone } = getCustomerInfo();
            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetBtn(btn, originalHtml);
                return;
            }

            const billingCycleNorm = cycle === 'annual' ? 'yearly' : 'monthly';
            const data = await callEdgeFunction({
                company_id:     companyId,
                db_plan_id:     planId,
                billing_cycle:  billingCycleNorm,
                is_trial:       false,
                customer_email: email,
                customer_name:  full_name,
                customer_phone: phone
            }, accessToken);

            openRazorpay(btn, originalHtml, data, {
                description: `${planDisplayName} Plan — ${cycle === 'annual' ? 'Annual' : 'Monthly'} Subscription`,
                flowType:    'paid'
            });

        } catch (err) {
            console.error('[triggerOrderCreation]', err);
            showMessage(err.message || 'Failed to initialize payment. Please try again.', 'error');
            resetBtn(btn, originalHtml);
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // PAYMENT TRIGGER: Start Free Trial (Authorization Mandate)
    // ═════════════════════════════════════════════════════════════════

    async function triggerSubscriptionCheckout(btn, companyId, planId, cycle, isTrial) {
        const originalHtml = btn.innerHTML;
        setLoading(btn, 'Setting up trial…');

        try {
            const { email, full_name, phone } = getCustomerInfo();
            if (!email) {
                showMessage('Could not find your email. Please sign up again.', 'error');
                resetBtn(btn, originalHtml);
                return;
            }

            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetBtn(btn, originalHtml);
                return;
            }

            const billingCycleNorm = cycle === 'annual' ? 'yearly' : 'monthly';
            const data = await callEdgeFunction({
                company_id:     companyId,
                db_plan_id:     planId,
                billing_cycle:  billingCycleNorm,
                is_trial:       true,
                customer_email: email,
                customer_name:  full_name,
                customer_phone: phone
            }, accessToken);

            openRazorpay(btn, originalHtml, data, {
                description: '7-Day Free Trial — No charge today',
                flowType:    'trial'
            });

        } catch (err) {
            console.error('[triggerSubscriptionCheckout]', err);
            showMessage(err.message || 'An unexpected error occurred. Please try again.', 'error');
            resetBtn(btn, originalHtml);
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Shared Payment Helpers
    // ═════════════════════════════════════════════════════════════════

    async function callEdgeFunction(body, accessToken) {
        const SUPABASE_URL      = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

        const res = await fetch(
            `${SUPABASE_URL}/functions/v1/create-razorpay-subscription`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(body)
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            let errMsg = 'Failed to create subscription. Please try again.';
            try {
                const parsed = JSON.parse(errText);
                const raw = typeof parsed.error === 'string'
                    ? parsed.error
                    : (parsed.error?.description || parsed.description || null);
                if (raw) errMsg = raw;
            } catch (_) {}
            if (res.status === 401) errMsg = 'Your session has expired. Please sign in again.';
            if (res.status === 403) errMsg = 'You do not have access to this company account.';
            if (res.status === 409) errMsg = 'This account already has an active subscription.';
            throw new Error(errMsg);
        }

        const data = await res.json();
        if (!data?.subscription_id && !data?.id) {
            throw new Error('Invalid response from payment service. Please contact support.');
        }
        if (!data.key_id) {
            throw new Error('Razorpay key ID missing in server response. Please contact support.');
        }
        return data;
    }

    function openRazorpay(btn, originalHtml, data, { description, flowType }) {
        const subscriptionId = data.subscription_id || data.id;
        const { email, full_name, phone } = getCustomerInfo();

        const options = {
            key:             data.key_id,
            subscription_id: subscriptionId,
            name:            'BharathBots',
            description,
            image:           'https://www.bharathbots.com/favicon.ico',
            prefill: {
                name:    full_name,
                email,
                contact: phone
            },
            theme: { color: '#2563eb' },
            handler: function(response) {
                setLoading(btn, 'Verifying payment…');
                showMessage('Payment authorized! Redirecting…', 'success');
                const returnParams = new URLSearchParams({
                    razorpay_payment_id:      response.razorpay_payment_id      || '',
                    razorpay_subscription_id: response.razorpay_subscription_id || subscriptionId,
                    razorpay_signature:       response.razorpay_signature       || '',
                    flow_type:                flowType
                });
                window.location.href = `payment-result.html?${returnParams.toString()}`;
            },
            modal: {
                ondismiss: function() {
                    showMessage('Payment was cancelled.', 'error');
                    resetBtn(btn, originalHtml);
                }
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function(response) {
            showMessage(`Payment failed: ${response.error.description}`, 'error');
            resetBtn(btn, originalHtml);
        });
        rzp.open();
    }

    function getCustomerInfo() {
        const sd    = JSON.parse(localStorage.getItem('signup_data') || '{}');
        const email = sd.email || '';
        const full_name = sd.full_name || '';
        let phone = (sd.phone || '').replace(/\D/g, '');
        if (phone.length === 12 && phone.startsWith('91')) phone = phone.substring(2);
        if (!phone || phone.length !== 10) phone = '9876543210';
        return { email, full_name, phone };
    }

    // ── UI utility functions ────────────────────────────────────────

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showMessage(text, type) {
        if (!msgDiv) return;
        msgDiv.textContent = text;
        msgDiv.className   = `payment-message ${type}`;
        msgDiv.style.display = 'block';
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function setLoading(btn, text) {
        btn.innerHTML = `<span class="spinner-inline"></span> ${text}`;
        btn.disabled  = true;
    }

    function resetBtn(btn, originalHtml) {
        btn.innerHTML = originalHtml;
        btn.disabled  = false;
    }

    function fmt(num) {
        return parseFloat(num || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }
});
