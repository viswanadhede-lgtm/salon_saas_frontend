import { FEATURES } from './config/feature-registry.js';
import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    
    // Core State & URL Params
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('company_id') || localStorage.getItem('company_id');
    const flow = params.get('flow');
    const msgDiv = document.getElementById('paymentMessage');

    let billingCycle = 'monthly'; // 'monthly' | 'annual'
    let activationMode = 'trial';  // 'trial' | 'immediate'
    let basePlanMonthly = 0;
    let basePlanAnnual = 0;
    let isPlanLoaded = false;
    let planDisplayName = 'Selected Plan';

    // Pre-selected add-ons from addons.html (each has: addon_id, name, billing_cycle, price, razorpay_plan_id)
    const selectedAddons = JSON.parse(localStorage.getItem('selected_addons') || '[]');

    // Session token — sent with every API call
    const token = localStorage.getItem('token') || '';
    console.log('[payments] Token present:', !!token);

    if (!companyId) {
        showMessage('Error: No company ID found. Return to signup to start over.', 'error');
        disableAllActions();
        return;
    }

    // 1. Read Selected Plan from signup_data or URL params
    const signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');
    const planId = params.get('plan_id') || signupData.plan_id;
    const planName = params.get('plan_name') || signupData.plan_name;
    const savedBillingCycle = params.get('billing_cycle') || signupData.billing_cycle || 'monthly';

    if (!planId) {
        showMessage('Error: No plan selected. Please return to the plans page.', 'error');
        disableAllActions();
        return;
    }

    // 2. Hide Free Trial for existing user flows (upgrade / renew)
    if (flow === 'upgrade' || flow === 'renew') {
        const optionTrial = document.getElementById('optionTrialLabel');
        if (optionTrial) optionTrial.style.display = 'none';

        const modeImmediate = document.getElementById('modeImmediate');
        if (modeImmediate) modeImmediate.checked = true;

        const optionImmediate = document.getElementById('optionImmediateLabel');
        if (optionImmediate) optionImmediate.classList.add('active');

        activationMode = 'immediate';
    }

    // Initialize billing cycle from signup_data (set on plans.html, not editable here)
    billingCycle = (savedBillingCycle === 'annual' || savedBillingCycle === 'yearly') ? 'annual' : 'monthly';

    // Update the read-only billing cycle display
    const billingCycleLabel = document.getElementById('billingCycleLabel');
    if (billingCycleLabel) {
        billingCycleLabel.textContent = billingCycle === 'annual' ? 'Annual (Save 17%)' : 'Monthly';
    }

    // 4. Activation Mode Radio Handlers
    const radioTrial = document.getElementById('modeTrial');
    const radioImmediate = document.getElementById('modeImmediate');
    const labelTrial = document.getElementById('optionTrialLabel');
    const labelImmediate = document.getElementById('optionImmediateLabel');

    if (radioTrial) {
        radioTrial.addEventListener('change', () => {
            if (radioTrial.checked) {
                activationMode = 'trial';
                if (labelTrial) labelTrial.classList.add('active');
                if (labelImmediate) labelImmediate.classList.remove('active');
                updatePricingDisplay();
            }
        });
    }

    if (radioImmediate) {
        radioImmediate.addEventListener('change', () => {
            if (radioImmediate.checked) {
                activationMode = 'immediate';
                if (labelImmediate) labelImmediate.classList.add('active');
                if (labelTrial) labelTrial.classList.remove('active');
                updatePricingDisplay();
            }
        });
    }

    // Clicking the labels toggles the radios smoothly
    if (labelTrial) {
        labelTrial.addEventListener('click', () => {
            if (radioTrial && !radioTrial.checked) {
                radioTrial.checked = true;
                radioTrial.dispatchEvent(new Event('change'));
            }
        });
    }

    if (labelImmediate) {
        labelImmediate.addEventListener('click', () => {
            if (radioImmediate && !radioImmediate.checked) {
                radioImmediate.checked = true;
                radioImmediate.dispatchEvent(new Event('change'));
            }
        });
    }

    // 5. Fetch Plan & render pre-selected add-ons from localStorage
    const planSuccess = await fetchPlanAndRender(planId, planName);
    if (!planSuccess) return;

    loadPreSelectedAddons();

    // 6. Unified Primary CTA Button
    const btnSubmit = document.getElementById('btnSubmitPayment');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', () => {
            if (!isPlanLoaded) {
                showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
                return;
            }

            if (activationMode === 'trial') {
                // Trial subscription mandate: ₹0 today, starts in 7 days
                triggerSubscriptionCheckout(btnSubmit, companyId, planId, billingCycle, true);
            } else {
                // Immediate paid activation
                triggerOrderCreation(btnSubmit, planId, companyId, billingCycle);
            }
        });
    }

    // ==========================================
    // Fetch Functions
    // ==========================================

    async function fetchPlanAndRender(id, fallbackName) {
        try {
            const { data: dbPlan, error } = await supabase
                .from('plans')
                .select('plan_id, plan_name, price_monthly, price_yearly, status')
                .eq('plan_id', id)
                .eq('status', 'active')
                .maybeSingle();

            if (error) {
                console.error('[fetchPlanAndRender] Supabase query error:', error);
                throw error;
            }

            if (!dbPlan) {
                console.error(`[fetchPlanAndRender] Plan not found or inactive for ID: ${id}`);
                showMessage('Selected plan is invalid or no longer active. Please choose another plan.', 'error');
                disableAllActions();
                isPlanLoaded = false;
                return false;
            }

            basePlanMonthly = parseFloat(dbPlan.price_monthly) || 0;
            basePlanAnnual  = parseFloat(dbPlan.price_yearly) || 0;
            isPlanLoaded = true;

            planDisplayName = dbPlan.plan_name
                ? (dbPlan.plan_name.charAt(0).toUpperCase() + dbPlan.plan_name.slice(1))
                : (fallbackName || 'Selected');

            const receiptPlanNameEl = document.getElementById('receiptPlanName');
            if (receiptPlanNameEl) {
                receiptPlanNameEl.textContent = `${planDisplayName} Plan`;
            }

            updatePricingDisplay();
            return true;
        } catch (err) {
            console.error('[fetchPlanAndRender] Failed to fetch plan:', err);
            showMessage('Unable to load plan pricing from server. Please refresh or contact support.', 'error');
            disableAllActions();
            isPlanLoaded = false;
            return false;
        }
    }

    // ==========================================
    // Load Pre-Selected Add-ons from localStorage
    // (Selection was done on addons.html — payments page is read-only invoice)
    // ==========================================

    function loadPreSelectedAddons() {
        const container = document.getElementById('addonsListContainer');
        const block = document.getElementById('selectedAddonsBlock');

        if (!container) {
            updatePricingDisplay();
            return;
        }

        if (selectedAddons.length === 0) {
            container.innerHTML = `
                <div class="no-addons-note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    No add-ons selected. <a href="addons.html">Add some →</a>
                </div>`;
        } else {
            let html = '';
            selectedAddons.forEach(item => {
                const cycleLabel = item.billing_cycle === 'monthly' ? 'Monthly' : 'Annual';
                const cycleCls   = item.billing_cycle === 'monthly' ? 'monthly' : 'yearly';
                const priceFmt   = `₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                html += `
                    <div class="selected-addon-item">
                        <div class="selected-addon-info">
                            <span class="selected-addon-check">✓</span>
                            <span class="selected-addon-name">${item.name}</span>
                            <span class="selected-addon-cycle ${cycleCls}">${cycleLabel}</span>
                        </div>
                        <span class="selected-addon-price">${priceFmt}</span>
                    </div>
                `;
            });
            container.innerHTML = html;
        }

        updatePricingDisplay();
    }

    // ==========================================
    // Dynamic Pricing & Invoice Recalculation
    // ==========================================

    function updatePricingDisplay() {
        const isAnnual = billingCycle === 'annual';
        const cycleSuffix = isAnnual ? '/ yr' : '/ mo';
        const fullCycle = isAnnual ? 'Annual' : 'Monthly';

        // 1. Update cycle badge on invoice
        const receiptCyclePill = document.getElementById('receiptCyclePill');
        if (receiptCyclePill) receiptCyclePill.textContent = fullCycle;

        // 2. Plan base cost (uses plan billing cycle from signup_data)
        const planCost = isAnnual ? basePlanAnnual : basePlanMonthly;
        const receiptPlanPriceEl = document.getElementById('receiptPlanPrice');
        if (receiptPlanPriceEl) {
            receiptPlanPriceEl.textContent = `₹${planCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // 3. Render pre-selected add-ons as static invoice lines
        //    Each add-on has its OWN billing cycle (monthly or yearly) chosen on addons.html
        let addonsTotal = 0;
        let addonsInvoiceHtml = '';

        if (selectedAddons.length > 0) {
            selectedAddons.forEach(item => {
                addonsTotal += item.price;
                const itemCycleLabel = item.billing_cycle === 'monthly' ? 'mo' : 'yr';
                const itemCycleFullLabel = item.billing_cycle === 'monthly' ? 'Monthly' : 'Annual';
                const priceFmt = `₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                addonsInvoiceHtml += `
                    <div class="dynamic-addon-row">
                        <div class="addon-name-cycle">
                            <span class="addon-name">+ ${item.name}</span>
                            <span class="addon-cycle-tag ${item.billing_cycle}">${itemCycleFullLabel}</span>
                        </div>
                        <span class="addon-cost">${priceFmt}</span>
                    </div>
                `;
            });
        }

        const dynContainer = document.getElementById('dynamicAddonsContainer');
        if (dynContainer) dynContainer.innerHTML = addonsInvoiceHtml;

        // 4. Subtotal = plan cost + all add-on costs
        const subtotal = planCost + addonsTotal;
        const subtotalEl = document.getElementById('receiptSubtotalPrice');
        if (subtotalEl) {
            subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // 5. Date calculations
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 7);
        const formattedTrialDate = trialEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const renewDate = new Date();
        if (isAnnual) {
            renewDate.setFullYear(renewDate.getFullYear() + 1);
        } else {
            renewDate.setMonth(renewDate.getMonth() + 1);
        }
        const formattedRenewDate = renewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const trialRenewDateEl = document.getElementById('trialRenewDate');
        if (trialRenewDateEl) trialRenewDateEl.textContent = formattedTrialDate;

        // 6. Adjust invoice based on Activation Mode
        const discountRow     = document.getElementById('receiptDiscountRow');
        const trialDiscountEl = document.getElementById('receiptTrialDiscount');
        const totalPriceEl    = document.getElementById('receiptTotalPrice');
        const totalDueSubtext = document.getElementById('totalDueSubtext');
        const btnSubmitText   = document.getElementById('btnSubmitText');
        const summaryStatusPill = document.getElementById('summaryStatusPill');
        const recurringNoteText = document.getElementById('recurringNoteText');

        const formattedSubtotal = `₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (activationMode === 'trial') {
            if (discountRow) discountRow.style.display = 'flex';
            if (trialDiscountEl) trialDiscountEl.textContent = `-${formattedSubtotal}`;
            if (totalPriceEl) {
                totalPriceEl.textContent = '₹0.00';
                totalPriceEl.className = 'total-amount highlight-green';
            }
            if (totalDueSubtext) totalDueSubtext.textContent = 'No charge during 7-day trial';
            if (btnSubmitText) btnSubmitText.textContent = `Start 7-Day Free Trial → (₹0 Due Today)`;
            if (summaryStatusPill) {
                summaryStatusPill.textContent = '7-Day Free Trial';
                summaryStatusPill.style.display = 'inline-block';
            }
            if (recurringNoteText) {
                recurringNoteText.innerHTML = `First recurring charge: <strong>${formattedTrialDate} &bull; ${formattedSubtotal} ${cycleSuffix}</strong>`;
            }
        } else {
            if (discountRow) discountRow.style.display = 'none';
            if (totalPriceEl) {
                totalPriceEl.textContent = formattedSubtotal;
                totalPriceEl.className = 'total-amount highlight-due';
            }
            if (totalDueSubtext) totalDueSubtext.textContent = 'Billed immediately on activation';
            if (btnSubmitText) btnSubmitText.textContent = `Pay ${formattedSubtotal} & Activate Now →`;
            if (summaryStatusPill) {
                summaryStatusPill.textContent = 'Direct Activation';
                summaryStatusPill.style.display = 'inline-block';
            }
            if (recurringNoteText) {
                recurringNoteText.innerHTML = `Next recurring charge: <strong>${formattedRenewDate} &bull; ${formattedSubtotal} ${cycleSuffix}</strong>`;
            }
        }
    }

    // ==========================================
    // Payment Triggers
    // ==========================================

    async function triggerOrderCreation(btnElement, planId, companyId, cycle) {
        if (!isPlanLoaded) {
            showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
            return;
        }

        const originalHtml = btnElement.innerHTML;
        setLoadingState(btnElement, 'Initiating Payment...');

        try {
            const signupData      = JSON.parse(localStorage.getItem('signup_data') || '{}');
            const customerEmail   = signupData.email       || '';
            const customerName    = signupData.full_name   || '';
            let rawPhone          = signupData.phone       || '';
            let customerPhone     = rawPhone.replace(/\D/g, '');
            if (customerPhone.length === 12 && customerPhone.startsWith('91')) {
                customerPhone = customerPhone.substring(2);
            }
            if (!customerPhone || customerPhone.length !== 10) {
                customerPhone = '9876543210';
            }
            const storedCompanyId = localStorage.getItem('company_id') || companyId;

            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetLoadingState(btnElement, originalHtml);
                return;
            }

            const billingCycleNormalized = cycle === 'annual' ? 'yearly' : 'monthly';
            const SUPABASE_URL      = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

            const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    company_id:     storedCompanyId,
                    db_plan_id:     planId,
                    billing_cycle:  billingCycleNormalized,
                    is_trial:       false,
                    customer_email: customerEmail,
                    customer_name:  customerName,
                    customer_phone: customerPhone
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('[triggerOrderCreation] Edge function error:', errText);
                let errMsg = 'Failed to create subscription. Please try again.';
                try {
                    const parsed = JSON.parse(errText);
                    const raw = typeof parsed.error === 'string' ? parsed.error
                        : (parsed.error?.description || parsed.description || null);
                    if (raw) errMsg = raw;
                } catch (_) {}
                if (res.status === 401) errMsg = 'Your session has expired. Please sign in again.';
                if (res.status === 403) errMsg = 'You do not have access to this company account.';
                if (res.status === 409) errMsg = 'This account already has an active subscription.';
                throw new Error(errMsg);
            }

            const data = await res.json();
            console.log('[triggerOrderCreation] Response:', data);

            const subscriptionId = data.subscription_id || data.id;
            if (!subscriptionId) {
                throw new Error('Invalid response from payment service. Please contact support.');
            }

            if (!data.key_id) {
                throw new Error('Razorpay key ID was not returned by the server. Please contact support.');
            }

            const cycleLabel = cycle === 'annual' ? 'Annual' : 'Monthly';
            const options = {
                key:             data.key_id,
                subscription_id: subscriptionId,
                name:            'BharathBots',
                description:     `${planDisplayName} - ${cycleLabel} Subscription`,
                image:           'https://www.bharathbots.com/favicon.ico',
                prefill: {
                    name:    customerName,
                    email:   customerEmail,
                    contact: customerPhone
                },
                handler: async function (response) {
                    setLoadingState(btnElement, 'Verifying payment...');
                    showMessage('Payment authorized! Redirecting...', 'success');
                    const returnParams = new URLSearchParams({
                        razorpay_payment_id:      response.razorpay_payment_id      || '',
                        razorpay_subscription_id: response.razorpay_subscription_id || subscriptionId,
                        razorpay_signature:       response.razorpay_signature       || '',
                        flow_type:                'paid'
                    });
                    window.location.href = `payment-result.html?${returnParams.toString()}`;
                },
                modal: {
                    ondismiss: function() {
                        resetLoadingState(btnElement, originalHtml);
                        showMessage('Payment was cancelled.', 'error');
                    }
                },
                theme: { color: '#d946ef' }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                resetLoadingState(btnElement, originalHtml);
                showMessage(`Payment failed: ${response.error.description}`, 'error');
            });
            rzp.open();

        } catch (err) {
            console.error('[triggerOrderCreation] Error:', err);
            resetLoadingState(btnElement, originalHtml);
            showMessage(err.message || 'Failed to initialize payment. Please try again.', 'error');
        }
    }

    async function triggerSubscriptionCheckout(btnElement, companyId, planId, cycle, isTrial) {
        if (!isPlanLoaded) {
            showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
            return;
        }

        const originalHtml = btnElement.innerHTML;
        setLoadingState(btnElement, isTrial ? 'Setting up trial...' : 'Initiating payment...');

        try {
            const signupData      = JSON.parse(localStorage.getItem('signup_data') || '{}');
            const customerEmail   = signupData.email;
            const customerName    = signupData.full_name || '';
            let rawPhone          = signupData.phone     || '';
            let customerPhone     = rawPhone.replace(/\D/g, '');
            if (customerPhone.length === 12 && customerPhone.startsWith('91')) {
                customerPhone = customerPhone.substring(2);
            }
            if (!customerPhone || customerPhone.length !== 10) {
                customerPhone = '9876543210';
            }
            const storedCompanyId = localStorage.getItem('company_id') || companyId;

            if (!customerEmail) {
                showMessage('Could not find your email. Please sign up again.', 'error');
                resetLoadingState(btnElement, originalHtml);
                return;
            }

            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetLoadingState(btnElement, originalHtml);
                return;
            }

            const billingCycleNormalized = cycle === 'annual' ? 'yearly' : 'monthly';
            const SUPABASE_URL      = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/create-razorpay-subscription`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'apikey':        SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        company_id:     storedCompanyId,
                        db_plan_id:     planId,
                        billing_cycle:  billingCycleNormalized,
                        is_trial:       isTrial,
                        customer_email: customerEmail,
                        customer_name:  customerName,
                        customer_phone: customerPhone
                    })
                }
            );

            if (!response.ok) {
                const errText = await response.text();
                console.error('[triggerSubscriptionCheckout] Edge function error:', errText);
                let errMsg = 'Failed to initialize subscription. Please try again.';
                try {
                    const parsed = JSON.parse(errText);
                    const raw = typeof parsed.error === 'string' ? parsed.error
                        : (parsed.error?.description || parsed.description || null);
                    if (raw) errMsg = raw;
                } catch (_) {}
                if (response.status === 401) errMsg = 'Your session has expired. Please sign in again.';
                if (response.status === 403) errMsg = 'You do not have access to this company account.';
                if (response.status === 409) errMsg = 'This account already has an active subscription.';
                throw new Error(errMsg);
            }

            const data = await response.json();
            console.log('[triggerSubscriptionCheckout] Response:', data);

            const subscriptionId = data?.subscription_id || data?.id;
            if (!subscriptionId) {
                throw new Error('Invalid response from payment service. Please contact support.');
            }

            if (!data.key_id) {
                throw new Error('Razorpay key ID was not returned by the server. Please contact support.');
            }

            const options = {
                key:             data.key_id,
                subscription_id: subscriptionId,
                name:            'BharathBots',
                description:     isTrial ? '7-Day Free Trial — No charge today' : 'Plan Activation',
                image:           'https://www.bharathbots.com/favicon.ico',
                prefill: {
                    email:   customerEmail,
                    name:    customerName,
                    contact: customerPhone
                },
                theme: { color: '#d946ef' },

                handler: async function(razorpayResponse) {
                    setLoadingState(btnElement, 'Verifying payment...');
                    showMessage('Payment authorized! Redirecting...', 'success');
                    
                    const returnParams = new URLSearchParams({
                        razorpay_payment_id:      razorpayResponse.razorpay_payment_id || '',
                        razorpay_subscription_id: subscriptionId,
                        razorpay_signature:       razorpayResponse.razorpay_signature || '',
                        flow_type:                isTrial ? 'trial' : 'paid'
                    });
                    
                    window.location.href = `payment-result.html?${returnParams.toString()}`;
                },

                modal: {
                    ondismiss: function() {
                        showMessage('Payment setup was cancelled. Try again when ready.', 'error');
                        resetLoadingState(btnElement, originalHtml);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function(response) {
                showMessage(`Payment failed: ${response.error.description}`, 'error');
                resetLoadingState(btnElement, originalHtml);
            });
            rzp.open();

        } catch (err) {
            console.error('[triggerSubscriptionCheckout] Error:', err);
            showMessage(err.message || 'An unexpected error occurred. Please try again.', 'error');
            resetLoadingState(btnElement, originalHtml);
        }
    }

    // ==========================================
    // UI Helpers
    // ==========================================

    function showMessage(text, type) {
        if (!msgDiv) return;
        msgDiv.textContent = text;
        msgDiv.className = 'payment-message ' + type;
        msgDiv.style.display = 'block';
    }

    function setLoadingState(btn, text) {
        btn.innerHTML = `<span class="spinner"></span> ${text}`;
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'wait';
    }

    function resetLoadingState(btn, originalHTML) {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }

    function disableAllActions() {
        document.querySelectorAll('button').forEach(b => b.disabled = true);
        document.querySelectorAll('input').forEach(i => i.disabled = true);
    }
});
