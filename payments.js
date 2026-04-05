import { API, RAZORPAY, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    
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

    renderPlanSummary(planId, planName);

    // 2. Fetch and Render Addons
    fetchAddons();

    // 3. Setup Billing Configuration Handlers
    const btnMonthly = document.getElementById('toggleMonthly');
    const btnAnnual = document.getElementById('toggleAnnual');

    btnMonthly.addEventListener('click', () => {
        billingCycle = 'monthly';
        btnMonthly.classList.add('active');
        btnAnnual.classList.remove('active');
        updatePricingDisplay();
    });

    btnAnnual.addEventListener('click', () => {
        billingCycle = 'annual';
        btnAnnual.classList.add('active');
        btnMonthly.classList.remove('active');
        updatePricingDisplay();
    });

    // Initialize first display based on saved preference
    billingCycle = savedBillingCycle;
    if (billingCycle === 'annual') {
        btnAnnual.classList.add('active');
        btnMonthly.classList.remove('active');
    } else {
        btnMonthly.classList.add('active');
        btnAnnual.classList.remove('active');
    }
    updatePricingDisplay();

    // 4. Action Buttons
    const btnPayNow = document.getElementById('btnPayNow');
    if (btnPayNow) {
        btnPayNow.addEventListener('click', () => {
            const addons = getSelectedAddons();
            triggerOrderCreation(btnPayNow, planId, companyId, addons, billingCycle);
        });
    }

    const btnTrial = document.getElementById('btnStartTrial');
    if (btnTrial) {
        btnTrial.addEventListener('click', () => {
            triggerFreeTrial(btnTrial, companyId, planId, billingCycle);
        });
    }

    // --- Logic Functions ---

    function fetchAddons() {
        fetchWithAuth(API.READ_ADDONS, {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId })
        }, FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT, 'read')
        .then(res => res.json())
        .then(addonsArray => {
            const container = document.getElementById('addonsListContainer');
            
            // Expected format: array of { addon_id, name, price, description, status }
            const activeAddons = (addonsArray || []).filter(a => a.status === 'active');
            
            if (activeAddons.length === 0) {
                container.innerHTML = '<h3 class="subsection-title">Supercharge your plan</h3><p style="color: var(--text-muted); font-size: 0.9rem;">No add-ons currently available.</p>';
                return;
            }

            let addonsHtml = '<h3 class="subsection-title">Supercharge your plan</h3>';

            activeAddons.forEach(addon => {
                const monPrice = parseFloat(addon.price) || 0;
                const annPrice = monPrice * 10; // Nominal annual discount assumption

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
            const newCheckboxes = document.querySelectorAll('.addon-checkbox');
            newCheckboxes.forEach(chk => {
                chk.addEventListener('change', updatePricingDisplay);
            });

            // Re-render display to apply active billing cycle prices
            updatePricingDisplay();
        })
        .catch(err => {
            console.error('Error fetching addons:', err);
            const container = document.getElementById('addonsListContainer');
            container.innerHTML = '<h3 class="subsection-title">Supercharge your plan</h3><p style="color: var(--text-muted); font-size: 0.9rem;">Failed to load add-ons.</p>';
        });
    }

    function renderPlanSummary(id, fallbackName) {
        const PLANS = {
            'plan_01': { name: 'Basic', monthly: 1999, annual: 19999, benefits: ['1 Branch', 'Up to 5 staff accounts', 'Bookings & Customers CRM', 'Basic dashboard analytics', 'Payment tracking'] },
            'plan_02': { name: 'Advance', monthly: 4999, annual: 49999, benefits: ['Up to 3 branches', 'Up to 12 staff accounts', 'POS & Product sales', 'Offers & coupons', 'Advanced reports'] },
            'plan_03': { name: 'Pro', monthly: 9999, annual: 99999, benefits: ['Up to 10 branches', 'Unlimited staff accounts', 'Membership programs', 'Online booking page', 'Deep analytics dashboard'] },
            'plan_04': { name: 'Enterprise', monthly: 19999, annual: 199999, benefits: ['Unlimited branches', 'AI receptionist included', 'WhatsApp booking automation', 'Custom integrations', 'Dedicated support & SLA'] },
            'plan_trial': { name: 'Free Trial', monthly: 0, annual: 0, benefits: ['7 days unrestricted access'] }
        };

        const plan = PLANS[id] || { name: fallbackName || 'Unknown Plan', monthly: 0, annual: 0, benefits: ['Standard features'] };
        
        // Save base pricing constraints for summary calculations
        basePlanMonthly = plan.monthly;
        basePlanAnnual = plan.annual;

        const container = document.getElementById('planSummaryCard');
        let benefitsHtml = plan.benefits.map(b => `<li><svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${b}</li>`).join('');

        container.innerHTML = `
            <div class="summary-header">
                <h3>${plan.name} Plan</h3>
            </div>
            <div class="summary-body">
                <ul class="summary-benefits vertical-benefits">
                    ${benefitsHtml}
                </ul>
            </div>
        `;
        
        document.getElementById('receiptPlanName').textContent = `${plan.name} Plan`;
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

    function triggerPaymentLinkCreation(btnElement, planId, companyId, addons, cycle) {
        const originalText = btnElement.innerHTML;
        setLoadingState(btnElement, 'Processing...');

        const payload = {
            company_id: companyId,
            plan_id: planId,
            addons: addons,
            billing_cycle: cycle
        };

        fetchWithAuth(API.CREATE_PAYMENT_LINK, {
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT, 'create')
        .then(res => res.json())
        .then(data => {
            if (data && data.payment_link) {
                showMessage('Redirecting to secure gateway...', 'success');
                window.location.href = data.payment_link;
            } else {
                throw new Error("Invalid response from payment service.");
            }
        })
        .catch(err => {
            console.error('Payment Error:', err);
            resetLoadingState(btnElement, originalText);
            showMessage('Failed to create payment link. Please try again.', 'error');
        });
    }

    function triggerOrderCreation(btnElement, planId, companyId, addons, cycle) {
        const originalText = btnElement.innerHTML;
        setLoadingState(btnElement, 'Initiating Payment...');

        const payload = {
            company_id: companyId,
            plan_id: planId,
            addons: addons,
            billing_cycle: cycle
        };

        fetchWithAuth(API.CREATE_ORDER, {
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT, 'create')
        .then(res => res.json())
        .then(responseData => {
            const data = Array.isArray(responseData) ? responseData[0] : responseData;
            if (data && data.order_id) {
                const options = {
                    "key": data.key_id,
                    "amount": data.amount || 0, 
                    "currency": data.currency || "INR",
                    "name": "BharathBots",
                    "description": "Subscription Activation",
                    "order_id": data.order_id,
                    "handler": async function (response) {
                        // Update company subscription to paid/active
                        const now = new Date();
                        const endDate = new Date(
                            cycle === 'annual'
                                ? now.getTime() + 365 * 24 * 60 * 60 * 1000
                                : now.getTime() + 30  * 24 * 60 * 60 * 1000
                        );
                        await supabase
                            .from('companies')
                            .eq('company_id', companyId)
                            .update({
                                subscription_type: 'paid',
                                subscription_status: 'active',
                                subscription_start_date: now.toISOString(),
                                subscription_end_date: endDate.toISOString()
                            });

                        // Redirect to result page with payment proofs
                        const params = new URLSearchParams({
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id:   response.razorpay_order_id,
                            razorpay_signature:  response.razorpay_signature,
                            t: localStorage.getItem('token') || ''
                        });
                        window.location.href = `${RAZORPAY.CALLBACK_URL}?${params.toString()}`;
                    },
                    "modal": {
                        "ondismiss": function() {
                            resetLoadingState(btnElement, originalText);
                            showMessage('Payment was cancelled.', 'error');
                        }
                    },
                    "theme": {
                        "color": "#6366f1"
                    }
                };

                const rzp = new window.Razorpay(options);
                
                rzp.on('payment.failed', function (response) {
                    resetLoadingState(btnElement, originalText);
                    showMessage(`Payment failed: ${response.error.description}`, 'error');
                });
                
                rzp.open();
            } else {
                throw new Error("Invalid response: missing order_id");
            }
        })
        .catch(err => {
            console.error('Order Creation Error:', err);
            resetLoadingState(btnElement, originalText);
            showMessage('Failed to initialize payment gateway. Please try again.', 'error');
        });
    }


    async function triggerFreeTrial(btnElement, companyId, planId, cycle) {
        const originalText = btnElement.textContent;
        setLoadingState(btnElement, 'Activating Trial...');

        try {
            const now = new Date();
            const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            const { error } = await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update({
                    subscription_type: 'trial',
                    subscription_status: 'active',
                    subscription_start_date: now.toISOString(),
                    subscription_end_date: trialEnd.toISOString()
                });

            if (error) {
                console.error('[triggerFreeTrial] Failed to update company:', error);
                showMessage('Failed to activate trial. Please try again.', 'error');
                resetLoadingState(btnElement, originalText);
                return;
            }

            console.log('[triggerFreeTrial] Subscription updated to trial/active for company:', companyId);

            // Clear any stale caches
            localStorage.removeItem('userFeatures');
            localStorage.removeItem('userSubFeatures');
            localStorage.removeItem('appContext');

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);

        } catch (err) {
            console.error('[triggerFreeTrial] Unexpected error:', err);
            showMessage('An unexpected error occurred. Please try again.', 'error');
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
