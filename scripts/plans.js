// scripts/plans.js - Plan selection, billing toggle & upgrade routing

        let currentBilling = 'monthly';

        function setBilling(mode) {
            currentBilling = mode;

            // Update toggle button styles
            const monthlyBtn = document.getElementById('toggleMonthly');
            const annualBtn  = document.getElementById('toggleAnnual');
            const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6366f1';

            if (mode === 'annual') {
                annualBtn.style.background  = primary;
                annualBtn.style.color       = 'white';
                monthlyBtn.style.background = 'transparent';
                monthlyBtn.style.color      = '#64748b';
            } else {
                monthlyBtn.style.background = primary;
                monthlyBtn.style.color      = 'white';
                annualBtn.style.background  = 'transparent';
                annualBtn.style.color       = '#64748b';
            }

            // Update standard plan prices via data-attributes
            document.querySelectorAll('.amount[data-monthly]').forEach(el => {
                el.textContent = el.getAttribute('data-' + mode);
            });
            document.querySelectorAll('.period[data-monthly]').forEach(el => {
                el.textContent = el.getAttribute('data-' + mode);
            });

            // Update Enterprise card separately
            const entCurrency = document.getElementById('enterpriseCurrency');
            const entAmount   = document.getElementById('enterpriseAmount');
            const entPeriod   = document.getElementById('enterprisePeriod');
            if (mode === 'annual') {
                entCurrency.style.display = 'none';
                entAmount.textContent     = 'Contact Sales';
                entPeriod.textContent     = 'for annual pricing';
                entAmount.style.fontSize  = '1.8rem';
            } else {
                entCurrency.style.display = '';
                entAmount.textContent     = '19,999+';
                entPeriod.textContent     = '/ month';
                entAmount.style.fontSize  = '';
            }
        }


// Expose to window for inline onclick handlers in plans.html
window.setBilling = setBilling;

export function initPlans() {
            const params = new URLSearchParams(window.location.search);
            const flow = params.get('flow');
            
            // Check if user is in UPGRADE flow
            if (flow === 'upgrade') {
                // Change Header text to remove onboarding feel
                const headerTitle = document.querySelector('.plans-header h1');
                const headerSubtitle = document.querySelector('.plans-header p');
                if (headerTitle) headerTitle.textContent = 'Upgrade Your Plan';
                if (headerSubtitle) headerSubtitle.textContent = 'Unlock advanced features to grow your salon business.';

                // Add a current plan banner at the top of the grid
                const grid = document.querySelector('.plans-grid');
                if (grid) {
                    const banner = document.createElement('div');
                    banner.id = 'upgradeCurrentPlanBanner';
                    banner.style.cssText = 'grid-column: 1 / -1; background: #e0f2fe; color: #0369a1; padding: 12px 16px; border-radius: 8px; text-align: center; font-weight: 600; margin-bottom: 8px; display: none;';
                    // We will fill the text once we extract their plan
                    grid.parentNode.insertBefore(banner, grid);
                }

                // Determine User's current plan level
                const appContextStr = localStorage.getItem('appContext');
                let userPlan = 'basic'; // Default fallback
                if (appContextStr) {
                    try {
                        const context = JSON.parse(appContextStr);
                        if (context.company && context.company.plan) {
                            userPlan = context.company.plan.toLowerCase();
                        }
                    } catch (e) {
                        console.error('Failed to parse appContext for plan', e);
                    }
                }

                // Define plan hierarchy
                const planHierarchy = { 'basic': 1, 'advance': 2, 'pro': 3, 'enterprise': 4 };
                const userPlanLevel = planHierarchy[userPlan] || 1;

                // Update the Banner
                const bannerEl = document.getElementById('upgradeCurrentPlanBanner');
                if (bannerEl) {
                    const niceName = userPlan.charAt(0).toUpperCase() + userPlan.slice(1);
                    bannerEl.innerHTML = `🎯 Your current plan is <strong>${niceName}</strong>`;
                    bannerEl.style.display = 'block';
                }

                // Loop over all plan cards to format them for Upgrade
                document.querySelectorAll('.plan-card').forEach(card => {
                    const btn = card.querySelector('.btn-plan');
                    if (!btn) return;
                    
                    const cardPlanStr = btn.getAttribute('data-plan') || '';
                    const cardPlanLevel = planHierarchy[cardPlanStr] || 99; // Unknowns to top

                    if (cardPlanLevel === userPlanLevel) {
                        // Current Plan
                        card.classList.add('is-current-plan');
                        
                        // Insert badge
                        if (!card.querySelector('.current-plan-badge')) {
                            const badge = document.createElement('div');
                            badge.className = 'current-plan-badge';
                            badge.textContent = '✓ Current Plan';
                            card.insertBefore(badge, card.firstChild);
                        }

                        // Update Button
                        btn.textContent = 'Current Plan';
                        btn.classList.add('btn-current-plan');
                        btn.disabled = true;
                    } 
                    else if (cardPlanLevel < userPlanLevel) {
                        // Lower Tier (Downgrade) - Disable it
                        card.style.opacity = '0.7';
                        btn.textContent = 'Included in your plan';
                        btn.style.background = '#f1f5f9';
                        btn.style.color = '#94a3b8';
                        btn.style.border = '1px solid #cbd5e1';
                        btn.style.cursor = 'not-allowed';
                        btn.disabled = true;
                    } 
                    else {
                        // Higher Tier (Upgrade)
                        if (cardPlanStr !== 'enterprise') {
                            const prettyName = cardPlanStr.charAt(0).toUpperCase() + cardPlanStr.slice(1);
                            btn.innerHTML = `UPGRADE <span style="display:block; font-size:0.75rem; font-weight:normal; opacity:0.9;">to ${prettyName}</span>`;
                        } else {
                            btn.innerHTML = `UPGRADE <span style="display:block; font-size:0.75rem; font-weight:normal; opacity:0.9;">Contact Sales</span>`;
                        }
                    }
                });
            }

            // Existing logic to highlight current plan if passed in via `?current=` (billing page legacy) 
            // We keep this to not break other parts of the app
            const currentPlanParam = params.get('current');
            if (currentPlanParam && flow !== 'upgrade') {
                const currentCard = document.querySelector(`.plan-card [data-plan="${currentPlanParam}"]`)?.closest('.plan-card');
                if (currentCard) {
                    currentCard.classList.add('is-current-plan');
                    const badge = document.createElement('div');
                    badge.className = 'current-plan-badge';
                    badge.textContent = '✓ Current Plan';
                    currentCard.insertBefore(badge, currentCard.firstChild);
                    
                    const btn = currentCard.querySelector('.btn-plan');
                    if (btn) {
                        btn.textContent = 'Current Plan';
                        btn.classList.add('btn-current-plan');
                        btn.disabled = true;
                    }
                }
            }

            // Check auth state (safeguard)
            const token = localStorage.getItem('token');
            if (token) {
                console.log("Authenticated User Token available.");
            } else {
                console.warn("No auth token found, user might not be logged in properly.");
            }

            // Plan Selection Logic
            const planButtons = document.querySelectorAll('.btn-plan');
            
            planButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Ignored disabled buttons just in case
                    if (btn.disabled) return;

                    const selectedPlan = btn.getAttribute('data-plan');
                    const originalHtml = btn.innerHTML;
                    
                    // Small visual feedback loop
                    btn.textContent = 'Selecting...';
                    btn.style.opacity = '0.8';
                    
                    setTimeout(() => {
                        const planMapping = {
                            'basic': { id: 'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce', name: 'Basic' },
                            'advance': { id: 'b42bcd41-217a-4ddb-9451-20e040984277', name: 'Advance' },
                            'pro': { id: 'b32fe38d-a715-4166-acf1-b970bd845c21', name: 'Pro' },
                            'enterprise': { id: '2e86d143-72aa-4ae4-a925-ded2b8475dc8', name: 'Enterprise' }
                        };
                        const mappedPlan = planMapping[selectedPlan] || { id: selectedPlan, name: selectedPlan };
                        
                        // Store in local storage
                        localStorage.setItem('selected_plan', selectedPlan);
                        let signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');
                        signupData.plan_id = mappedPlan.id;
                        signupData.plan_name = mappedPlan.name;
                        signupData.billing_cycle = currentBilling;
                        localStorage.setItem('signup_data', JSON.stringify(signupData));

                        btn.textContent = 'Selected!';
                        btn.style.backgroundColor = '#10b981'; // Success green
                        btn.style.color = 'white';
                        
                        setTimeout(() => {
                            const params = new URLSearchParams(window.location.search);
                            // Both `renew` AND `upgrade` flows skip onboarding and go straight to payments
                            if (params.get('flow') === 'renew' || params.get('flow') === 'upgrade') {
                                // Existing user flow - skip onboarding
                                // Safely retrieve company_id stored during login
                                const companyId = localStorage.getItem('company_id') || '';
                                const flowVal = params.get('flow');
                                window.location.href = `payments.html?company_id=${companyId}&flow=${flowVal}`;
                            } else {
                                // New user flow - route to onboarding (to create salon and branch)
                                window.location.href = 'onboarding.html';
                            }
                        }, 800);
                        
                    }, 600);
                });
            });
}

// Safe initialization guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlans);
} else {
    initPlans();
}