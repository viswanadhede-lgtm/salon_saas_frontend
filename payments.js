import { API, RAZORPAY, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    
    // Core State
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('company_id');
    const flow = params.get('flow');
    const msgDiv = document.getElementById('paymentMessage');
    
    // Hide Free Trial for existing user flows
    if (flow === 'upgrade' || flow === 'renew') {
        const trialBlock = document.querySelector('.trial-block');
        if (trialBlock) trialBlock.style.display = 'none';
        
        const layout = document.querySelector('.three-col-layout');
        if (layout) {
            layout.classList.add('two-col-flow');
        }
    }

    let billingCycle = 'monthly'; 
    let basePlanMonthly = 0;
    let basePlanAnnual = 0;
    let isPlanLoaded = false;
    
    let dynamicAddonsPricing = {};

    // Session token — sent with every API call
    const token = localStorage.getItem('token') || '';
    console.log('[payments] Token present:', !!token);

    if (!companyId) {
        showMessage('Error: No company ID found. Return to signup to start over.', 'error');
        disableAllActions();
        return;
    }

    // 1. Load Selected Plan
    const signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');
    const planId = signupData.plan_id;
    const planName = signupData.plan_name;
    const savedBillingCycle = signupData.billing_cycle || 'monthly';

    if (!planId) {
        showMessage('Error: No plan selected. Please go back to select a plan.', 'error');
        disableAllActions();
        return;
    }

    // 3. Setup Billing Configuration Handlers
    const btnMonthly = document.getElementById('toggleMonthly');
    const btnAnnual = document.getElementById('toggleAnnual');

    if (btnMonthly) {
        btnMonthly.addEventListener('click', () => {
            billingCycle = 'monthly';
            btnMonthly.classList.add('active');
            if (btnAnnual) btnAnnual.classList.remove('active');
            updatePricingDisplay();
        });
    }

    if (btnAnnual) {
        btnAnnual.addEventListener('click', () => {
            billingCycle = 'annual';
            btnAnnual.classList.add('active');
            if (btnMonthly) btnMonthly.classList.remove('active');
            updatePricingDisplay();
        });
    }

    // Initialize billing cycle based on saved preference
    billingCycle = savedBillingCycle;
    if (billingCycle === 'annual') {
        if (btnAnnual) btnAnnual.classList.add('active');
        if (btnMonthly) btnMonthly.classList.remove('active');
    } else {
        if (btnMonthly) btnMonthly.classList.add('active');
        if (btnAnnual) btnAnnual.classList.remove('active');
    }

    // 2. Fetch and render plan from Supabase plans table
    const planSuccess = await fetchPlanAndRender(planId, planName);
    if (!planSuccess) {
        return;
    }

    // Fetch and Render Addons
    fetchAddons();

    // 4. Action Buttons
    const btnPayNow = document.getElementById('btnPayNow');
    if (btnPayNow) {
        btnPayNow.addEventListener('click', () => {
            if (!isPlanLoaded) {
                showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
                return;
            }
            // Pass planId so triggerOrderCreation can fetch the Razorpay Plan ID
            // from the plans table and send it to the edge function for a recurring subscription.
            triggerOrderCreation(btnPayNow, planId, companyId, billingCycle);
        });
    }

    const btnTrial = document.getElementById('btnStartTrial');
    if (btnTrial) {
        btnTrial.addEventListener('click', () => {
            if (!isPlanLoaded) {
                showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
                return;
            }
            // isTrial = true uses Subscriptions API (Future delayed charge)
            triggerSubscriptionCheckout(btnTrial, companyId, planId, billingCycle, true);
        });
    }

    // --- Logic Functions ---

    async function fetchAddons() {
        const container = document.getElementById('addonsListContainer');
        try {
            const { data: addonsArray, error } = await supabase
                .from('add_ons')
                .select('*')
                .eq('status', 'active');

            if (error) throw error;

            const activeAddons = addonsArray || [];

            if (activeAddons.length === 0) {
                container.innerHTML = '<h3 class="subsection-title">Supercharge your plan</h3><p style="color: var(--text-muted); font-size: 0.9rem;">No add-ons currently available.</p>';
                return;
            }

            let addonsHtml = '<h3 class="subsection-title">Supercharge your plan</h3>';

            activeAddons.forEach(addon => {
                const monPrice = parseFloat(addon.price) || 0;
                const annPrice = monPrice * 10; // Annual = 10x monthly (nominal discount)

                dynamicAddonsPricing[addon.addon_id] = {
                    name: addon.name,
                    monthly: monPrice,
                    annual: annPrice
                };

                addonsHtml += `
                    <label class="addon-item">
                        <div class="addon-info">
                            <h4>${addon.name}</h4>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 4px 0 6px 0;">${addon.description || ''}</p>
                            <span class="addon-price" id="price_${addon.addon_id}">+₹${monPrice.toLocaleString('en-IN')}/mo</span>
                        </div>
                        <div class="addon-toggle">
                            <input type="checkbox" value="${addon.addon_id}" class="addon-checkbox">
                            <span class="custom-toggle"></span>
                        </div>
                    </label>
                `;
            });

            container.innerHTML = addonsHtml;

            // Bind events for dynamically injected checkboxes
            container.querySelectorAll('.addon-checkbox').forEach(chk => {
                chk.addEventListener('change', updatePricingDisplay);
            });

            // Re-render to apply active billing cycle prices
            updatePricingDisplay();

        } catch (err) {
            console.error('[fetchAddons] Error fetching from add_ons table:', err);
            container.innerHTML = '<h3 class="subsection-title">Supercharge your plan</h3><p style="color: var(--text-muted); font-size: 0.9rem;">Failed to load add-ons.</p>';
        }
    }

    async function fetchPlanAndRender(id, fallbackName) {
        const container = document.getElementById('planSummaryCard');
        if (container) {
            container.innerHTML = `
                <div class="skeleton-loader" style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                    Loading plan details...
                </div>
            `;
        }

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
                if (container) {
                    container.innerHTML = '<div class="summary-header"><h3>Plan Unavailable</h3></div><div class="summary-body"><p style="color: var(--text-muted); font-size: 0.9rem;">Could not load plan details.</p></div>';
                }
                const receiptPlanPriceEl = document.getElementById('receiptPlanPrice');
                const receiptTotalPriceEl = document.getElementById('receiptTotalPrice');
                if (receiptPlanPriceEl) receiptPlanPriceEl.textContent = '—';
                if (receiptTotalPriceEl) receiptTotalPriceEl.textContent = '—';
                isPlanLoaded = false;
                return false;
            }

            // Authoritative pricing from Supabase plans table
            basePlanMonthly = parseFloat(dbPlan.price_monthly) || 0;
            basePlanAnnual  = parseFloat(dbPlan.price_yearly) || 0;
            isPlanLoaded = true;

            const displayName = dbPlan.plan_name
                ? (dbPlan.plan_name.charAt(0).toUpperCase() + dbPlan.plan_name.slice(1))
                : (fallbackName || 'Selected');

            const PLAN_BENEFITS = {
                'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce': ['1 Branch', 'Up to 5 staff accounts', 'Bookings & Customers CRM', 'Basic dashboard analytics', 'Payment tracking'],
                'b42bcd41-217a-4ddb-9451-20e040984277': ['Up to 3 branches', 'Up to 12 staff accounts', 'POS & Product sales', 'Offers & coupons', 'Advanced reports'],
                'b32fe38d-a715-4166-acf1-b970bd845c21': ['Up to 10 branches', 'Unlimited staff accounts', 'Membership programs', 'Online booking page', 'Deep analytics dashboard'],
                '2e86d143-72aa-4ae4-a925-ded2b8475dc8': ['Unlimited branches', 'AI receptionist included', 'WhatsApp booking automation', 'Custom integrations', 'Dedicated support & SLA'],
                '7e0af07f-b57b-40e7-a23a-6e8104c8033c': ['7 days unrestricted access']
            };

            const benefits = PLAN_BENEFITS[id] || ['Standard features'];
            const benefitsHtml = benefits.map(b => `<li><svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${b}</li>`).join('');

            if (container) {
                container.innerHTML = `
                    <div class="summary-header">
                        <h3>${displayName} Plan</h3>
                    </div>
                    <div class="summary-body">
                        <ul class="summary-benefits vertical-benefits">
                            ${benefitsHtml}
                        </ul>
                    </div>
                `;
            }

            const receiptPlanNameEl = document.getElementById('receiptPlanName');
            if (receiptPlanNameEl) {
                receiptPlanNameEl.textContent = `${displayName} Plan`;
            }

            updatePricingDisplay();
            return true;
        } catch (err) {
            console.error('[fetchPlanAndRender] Failed to fetch plan from plans table:', err);
            showMessage('Unable to load plan pricing from server. Please refresh or contact support.', 'error');
            disableAllActions();
            if (container) {
                container.innerHTML = '<div class="summary-header"><h3>Plan Unavailable</h3></div><div class="summary-body"><p style="color: var(--text-muted); font-size: 0.9rem;">Could not load plan details.</p></div>';
            }
            const receiptPlanPriceEl = document.getElementById('receiptPlanPrice');
            const receiptTotalPriceEl = document.getElementById('receiptTotalPrice');
            if (receiptPlanPriceEl) receiptPlanPriceEl.textContent = '—';
            if (receiptTotalPriceEl) receiptTotalPriceEl.textContent = '—';
            isPlanLoaded = false;
            return false;
        }
    }

    function updatePricingDisplay() {
        const isAnnual = billingCycle === 'annual';
        
        // 1. Update Addon Prices on toggles (looping dynamically loaded addons)
        Object.keys(dynamicAddonsPricing).forEach(addonId => {
            const priceEl = document.getElementById('price_' + addonId);
            if (priceEl) {
                const addonData = dynamicAddonsPricing[addonId];
                priceEl.textContent = isAnnual ? `+₹${addonData.annual.toLocaleString('en-IN')}/yr` : `+₹${addonData.monthly.toLocaleString('en-IN')}/mo`;
            }
        });

        // 2. Update Receipt Summary
        const planCost = isAnnual ? basePlanAnnual : basePlanMonthly;
        document.getElementById('receiptPlanPrice').textContent = `₹${planCost.toLocaleString('en-IN')}`;
        
        let addonsTotal = 0;
        let addonsHtml = '';
        
        const checkboxes = document.querySelectorAll('.addon-checkbox:checked');
        checkboxes.forEach(chk => {
            const addonKey = chk.value;
            const addonData = dynamicAddonsPricing[addonKey];
            if (addonData) {
                const cost = isAnnual ? addonData.annual : addonData.monthly;
                addonsTotal += cost;
                
                addonsHtml += `
                    <div class="receipt-row addon-row">
                        <span>+ ${addonData.name}</span>
                        <span>₹${cost.toLocaleString('en-IN')}</span>
                    </div>
                `;
            }
        });
        
        const dynContainer = document.getElementById('dynamicAddonsContainer');
        if (dynContainer) dynContainer.innerHTML = addonsHtml;
        
        // Calculate Total
        const total = planCost + addonsTotal;
        document.getElementById('receiptTotalPrice').textContent = `₹${total.toLocaleString('en-IN')}`;
        
        // Update Note
        document.getElementById('billingNote').textContent = isAnnual ? 'Billed annually' : 'Billed monthly';
    }

    function getSelectedAddons() {
        const checkboxes = document.querySelectorAll('.addon-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    async function triggerOrderCreation(btnElement, planId, companyId, cycle) {
        if (!isPlanLoaded) {
            showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
            return;
        }
        const originalText = btnElement.innerHTML;
        setLoadingState(btnElement, 'Initiating Payment...');

        try {
            // Always re-read signup_data fresh
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

            // The hardened Edge Function requires an authenticated Bearer token.
            // The token is set during sign-in/OTP verification and stored in localStorage.
            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetLoadingState(btnElement, originalText);
                return;
            }

            // Normalize billing cycle: UI uses 'annual', backend requires 'yearly'
            const billingCycleNormalized = cycle === 'annual' ? 'yearly' : 'monthly';

            const SUPABASE_URL      = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

            // Call create-razorpay-subscription.
            // The backend is authoritative for plan validation, Razorpay Plan ID, and amount.
            // We send only the identifiers — the backend derives everything else.
            const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    company_id:     storedCompanyId,
                    db_plan_id:     planId,                  // Supabase plan UUID — backend validates
                    billing_cycle:  billingCycleNormalized,  // 'monthly' | 'yearly'
                    is_trial:       false,                   // Paid flow, no 7-day delay
                    customer_email: customerEmail,
                    customer_name:  customerName,
                    customer_phone: customerPhone
                    // razorpay_plan_id removed — backend derives from plans table
                    // amount removed — backend derives from plans.price_monthly/price_yearly
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
                // Map specific status codes to user-friendly messages
                if (res.status === 401) errMsg = 'Your session has expired. Please sign in again.';
                if (res.status === 403) errMsg = 'You do not have access to this company account.';
                if (res.status === 409) errMsg = 'This account already has an active or in-progress subscription. Please contact support if you believe this is an error.';
                throw new Error(errMsg);
            }

            const data = await res.json();
            console.log('[triggerOrderCreation] Edge function response:', data);

            // Backend returns the Razorpay subscription_id
            const subscriptionId = data.subscription_id || data.id;

            if (!subscriptionId) {
                console.error('[triggerOrderCreation] No subscription ID in response:', data);
                throw new Error('Invalid response from payment service. Please contact support.');
            }

            // Open Razorpay Checkout with the subscription_id returned by the backend.
            // Do NOT construct the subscription client-side.
            // The Razorpay public key MUST come from the backend — never hardcoded here.
            if (!data.key_id) {
                throw new Error('Razorpay key ID was not returned by the server. Please contact support.');
            }
            const cycleLabel = cycle === 'annual' ? 'Annual' : 'Monthly';
            const options = {
                key:             data.key_id,
                subscription_id: subscriptionId,
                name:            'BharathBots',
                description:     `${planName || 'Plan'} - ${cycleLabel} Subscription`,
                image:           'https://www.bharathbots.com/favicon.ico',
                prefill: {
                    name:    customerName,
                    email:   customerEmail,
                    contact: customerPhone
                },
                handler: async function (response) {
                    setLoadingState(btnElement, 'Verifying payment...');
                    showMessage('Payment authorized! Redirecting...', 'success');
                    const params = new URLSearchParams({
                        razorpay_payment_id:      response.razorpay_payment_id      || '',
                        razorpay_subscription_id: response.razorpay_subscription_id || subscriptionId,
                        razorpay_signature:       response.razorpay_signature       || '',
                        flow_type:                'paid'
                    });
                    window.location.href = `payment-result.html?${params.toString()}`;
                },
                modal: {
                    ondismiss: function() {
                        resetLoadingState(btnElement, originalText);
                        showMessage('Payment was cancelled.', 'error');
                    }
                },
                theme: { color: '#6366f1' }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                resetLoadingState(btnElement, originalText);
                showMessage(`Payment failed: ${response.error.description}`, 'error');
            });
            rzp.open();

        } catch (err) {
            console.error('[triggerOrderCreation] Error:', err);
            resetLoadingState(btnElement, originalText);
            showMessage(err.message || 'Failed to initialize payment. Please try again.', 'error');
        }
    }

    async function triggerSubscriptionCheckout(btnElement, companyId, planId, cycle, isTrial) {
        if (!isPlanLoaded) {
            showMessage('Plan pricing could not be verified. Please refresh the page.', 'error');
            return;
        }
        const originalText = btnElement.textContent;
        setLoadingState(btnElement, isTrial ? 'Setting up trial...' : 'Initiating payment...');

        try {
            // Always re-read signup_data fresh
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
                resetLoadingState(btnElement, originalText);
                return;
            }

            // The hardened Edge Function requires an authenticated Bearer token.
            // The token is set during sign-in/OTP verification and stored in localStorage.
            const accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                showMessage('Your session has expired. Please sign in again.', 'error');
                resetLoadingState(btnElement, originalText);
                return;
            }

            // Normalize billing cycle: UI uses 'annual', backend requires 'yearly'
            const billingCycleNormalized = cycle === 'annual' ? 'yearly' : 'monthly';

            const SUPABASE_URL      = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

            // Call create-razorpay-subscription.
            // The backend is authoritative for plan validation, Razorpay Plan ID, and amount.
            // We send only the identifiers — the backend derives everything else.
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
                        db_plan_id:     planId,                  // Supabase plan UUID — backend validates
                        billing_cycle:  billingCycleNormalized,  // 'monthly' | 'yearly'
                        is_trial:       isTrial,                 // triggers 7-day start_at delay in Edge Function
                        customer_email: customerEmail,
                        customer_name:  customerName,
                        customer_phone: customerPhone
                        // razorpay_plan_id removed — backend derives from plans table
                        // amount removed — backend derives from plans.price_monthly/price_yearly
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
                // Map specific status codes to user-friendly messages
                if (response.status === 401) errMsg = 'Your session has expired. Please sign in again.';
                if (response.status === 403) errMsg = 'You do not have access to this company account.';
                if (response.status === 409) errMsg = 'This account already has an active or in-progress subscription. Please contact support if you believe this is an error.';
                throw new Error(errMsg);
            }

            const data = await response.json();
            console.log('[triggerSubscriptionCheckout] Edge function response:', data);
            const subscriptionId = data?.subscription_id || data?.id;

            if (!subscriptionId) {
                console.error('[triggerSubscriptionCheckout] No subscription ID in response:', data);
                throw new Error('Invalid response from payment service. Please contact support.');
            }

            resetLoadingState(btnElement, originalText);

            // Open Razorpay Checkout with the subscription_id returned by the backend.
            // Do NOT construct the subscription client-side.
            // The Razorpay public key MUST come from the backend — never hardcoded here.
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
                theme: { color: '#6366f1' },

                handler: async function(razorpayResponse) {
                    setLoadingState(btnElement, 'Verifying payment...');
                    showMessage('Payment authorized! Redirecting...', 'success');
                    
                    const params = new URLSearchParams({
                        razorpay_payment_id:      razorpayResponse.razorpay_payment_id || '',
                        razorpay_subscription_id: subscriptionId,
                        razorpay_signature:       razorpayResponse.razorpay_signature || '',
                        flow_type:                isTrial ? 'trial' : 'paid'
                    });
                    
                    window.location.href = `payment-result.html?${params.toString()}`;
                },

                modal: {
                    ondismiss: function() {
                        showMessage('Payment was cancelled. Try again when ready.', 'error');
                        resetLoadingState(btnElement, originalText);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function(response) {
                showMessage(`Payment failed: ${response.error.description}`, 'error');
                resetLoadingState(btnElement, originalText);
            });
            rzp.open();

        } catch (err) {
            console.error('[triggerSubscriptionCheckout] Error:', err);
            showMessage(err.message || 'An unexpected error occurred. Please try again.', 'error');
            resetLoadingState(btnElement, originalText);
        }
    }

    // --- UI Helpers ---

    function showMessage(text, type) {
        msgDiv.textContent = text;
        msgDiv.className = 'payment-message ' + type;
        msgDiv.style.display = 'block';
    }

    function setLoadingState(btn, text) {
        btn.innerHTML = `<span class="spinner"></span> ${text}`;
        btn.disabled = true;
        btn.style.opacity = '0.7';
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
