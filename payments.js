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
    const planNameRaw     = params.get('plan_name')     || signupData.plan_name || 'Selected';
    const savedCycle      = params.get('billing_cycle') || signupData.billing_cycle || 'monthly';
    const billingCycle    = (savedCycle === 'annual' || savedCycle === 'yearly') ? 'annual' : 'monthly';
    const selectedAddons  = JSON.parse(localStorage.getItem('selected_addons') || '[]');

    // Buttons & interactive elements
    const btnPayNow   = document.getElementById('btnPayNow');
    const btnTrial    = document.getElementById('btnTrial');
    const cardTrial   = document.getElementById('cardTrial');

    // ── Guard: must have company & plan ────────────────────────────
    if (!companyId) {
        showMessage('No company ID found. Please return to the signup page.', 'error');
        return;
    }
    if (!planId) {
        showMessage('No plan selected. Please return to the plans page.', 'error');
        return;
    }

    // ── Hide trial card for upgrade / renew flows ───────────────────
    if (flow === 'upgrade' || flow === 'renew') {
        if (cardTrial) cardTrial.style.display = 'none';
    }

    // ── Fetch plan from Supabase ────────────────────────────────────
    let basePlanPrice   = 0;
    let planDisplayName = planNameRaw.charAt(0).toUpperCase() + planNameRaw.slice(1);
    let isPlanLoaded    = false;

    try {
        const { data: dbPlan, error } = await supabase
            .from('plans')
            .select('plan_id, plan_name, price_monthly, price_yearly, status')
            .eq('plan_id', planId)
            .eq('status', 'active')
            .maybeSingle();

        if (error) throw error;

        if (!dbPlan) {
            showMessage('Selected plan is no longer active. Please choose another plan.', 'error');
            return;
        }

        basePlanPrice   = billingCycle === 'annual'
            ? parseFloat(dbPlan.price_yearly)  || 0
            : parseFloat(dbPlan.price_monthly) || 0;
        planDisplayName = dbPlan.plan_name
            ? (dbPlan.plan_name.charAt(0).toUpperCase() + dbPlan.plan_name.slice(1))
            : planDisplayName;
        isPlanLoaded = true;

    } catch (err) {
        console.error('[payments] Failed to fetch plan:', err);
        showMessage('Could not load plan pricing. Please refresh the page.', 'error');
        return;
    }

    // ── Calculate totals ────────────────────────────────────────────
    const addonsTotal  = selectedAddons.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
    const payNowTotal  = basePlanPrice + addonsTotal;   // Pay Now: plan + all add-ons
    const trialDueAmt  = addonsTotal;                   // Trial: ₹0 plan + add-ons charged now

    // ── Populate "Your order" section ───────────────────────────────
    const cycleLabel = billingCycle === 'annual' ? 'Annual' : 'Monthly';
    const periodStr  = billingCycle === 'annual' ? '/year'  : '/month';

    // Plan row
    setText('orderPlanName',   `${planDisplayName} Plan`);
    setText('orderPlanMeta',   `BharathBots app · ${cycleLabel}`);
    setText('orderPlanPrice',  `₹${fmt(basePlanPrice)}`);
    setText('orderPlanPeriod', periodStr);

    // Show trial tag only for new signups (not upgrade/renew)
    const trialTag = document.getElementById('orderTrialTag');
    if (trialTag && flow !== 'upgrade' && flow !== 'renew') {
        trialTag.style.display = 'block';
    }

    // Add-on rows
    const addonRowsEl = document.getElementById('orderAddonRows');
    if (addonRowsEl) {
        if (selectedAddons.length === 0) {
            addonRowsEl.innerHTML = '';
        } else {
            addonRowsEl.innerHTML = selectedAddons.map(a => {
                const ac = a.billing_cycle === 'monthly' ? 'Monthly' : 'Annual';
                const ap = a.billing_cycle === 'monthly' ? '/month' : '/year';
                return `
                <div class="order-item">
                    <div class="order-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"></path>
                        </svg>
                    </div>
                    <div class="order-item-info">
                        <div class="order-item-name">${escHtml(a.name)}</div>
                        <div class="order-item-meta">Add-on · ${ac}</div>
                    </div>
                    <div class="order-item-price-col">
                        <span class="order-item-price">₹${fmt(a.price)}</span>
                        <span class="order-item-period">${ap}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // ── Populate "Pay Now" card ─────────────────────────────────────
    setText('payNowTotal',     `₹${fmt(payNowTotal)}`);
    setText('btnPayNowAmount', `₹${fmt(payNowTotal)}`);

    // ── Populate "Trial" card ───────────────────────────────────────
    setText('trialDueToday', `₹${fmt(trialDueAmt)}`);

    // Show add-on row inside trial card only if there are add-ons
    const trialAddonRow = document.getElementById('trialAddonRow');
    if (trialAddonRow) {
        if (selectedAddons.length > 0) {
            trialAddonRow.style.display = 'flex';
            setText('trialAddonTotal', `₹${fmt(addonsTotal)}`);
        } else {
            trialAddonRow.style.display = 'none';
        }
    }

    // Fine print
    const fpPlanRenew  = document.getElementById('fpPlanRenew');
    const fpAddonRenew = document.getElementById('fpAddonRenew');
    if (fpPlanRenew) {
        fpPlanRenew.textContent = `₹${fmt(basePlanPrice)}${periodStr}`;
    }
    if (fpAddonRenew && addonsTotal > 0) {
        if (selectedAddons.length === 1) {
            const a  = selectedAddons[0];
            const ap = a.billing_cycle === 'monthly' ? '/month' : '/year';
            fpAddonRenew.textContent = `The add-on renews separately at ₹${fmt(a.price)}${ap}.`;
        } else {
            const parts = selectedAddons.map(a => {
                const ap = a.billing_cycle === 'monthly' ? '/month' : '/year';
                return `${escHtml(a.name)} at ₹${fmt(a.price)}${ap}`;
            });
            fpAddonRenew.textContent = `Add-ons renew separately: ${parts.join(', ')}.`;
        }
    }

    // ── Enable buttons ──────────────────────────────────────────────
    if (btnPayNow) btnPayNow.disabled = false;
    if (btnTrial)  btnTrial.disabled  = false;

    // ── Button handlers ─────────────────────────────────────────────
    if (btnPayNow) {
        btnPayNow.addEventListener('click', () => {
            if (!isPlanLoaded) { showMessage('Plan pricing unavailable. Please refresh.', 'error'); return; }
            triggerOrderCreation(btnPayNow, planId, companyId, billingCycle, false);
        });
    }

    if (btnTrial) {
        btnTrial.addEventListener('click', () => {
            if (!isPlanLoaded) { showMessage('Plan pricing unavailable. Please refresh.', 'error'); return; }
            triggerSubscriptionCheckout(btnTrial, companyId, planId, billingCycle, true);
        });
    }

    // ── Edit plan link: preserve company_id ────────────────────────
    const editLink = document.querySelector('.order-edit-link');
    if (editLink && companyId) {
        editLink.href = `addons.html?company_id=${encodeURIComponent(companyId)}`;
    }

    // ══════════════════════════════════════════════════════════════
    // PAYMENT TRIGGER: Pay Now (immediate subscription)
    // ══════════════════════════════════════════════════════════════

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
                description: `${planDisplayName} Plan — ${cycleLabel} Subscription`,
                flowType:    'paid'
            });

        } catch (err) {
            console.error('[triggerOrderCreation]', err);
            showMessage(err.message || 'Failed to initialize payment. Please try again.', 'error');
            resetBtn(btn, originalHtml);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // PAYMENT TRIGGER: Start Free Trial
    // ══════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════
    // Shared helpers
    // ══════════════════════════════════════════════════════════════

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
            theme: { color: '#4f46e5' },
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
        btn.innerHTML = `<span class="spinner-inline"></span>${text}`;
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

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
});
