import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // ── Read context from localStorage ─────────────────────────────────────
    const signupData    = JSON.parse(localStorage.getItem('signup_data') || '{}');
    const planName      = signupData.plan_name  || 'Selected Plan';
    const planId        = signupData.plan_id    || null;
    const billingCycle  = signupData.billing_cycle || 'monthly'; // 'monthly' | 'annual'
    const companyId     = localStorage.getItem('company_id') || new URLSearchParams(window.location.search).get('company_id');

    // State: map of addonId → { addon, selectedCycle }
    const selectionMap = {};

    // ── Populate Plan Context Bar ───────────────────────────────────────────
    const contextPlanName  = document.getElementById('contextPlanName');
    const contextPlanPrice = document.getElementById('contextPlanPrice');
    const contextPlanCycle = document.getElementById('contextPlanCycle');
    const summaryPlanName  = document.getElementById('summaryPlanName');
    const summaryPlanCycle = document.getElementById('summaryPlanCycle');
    const summaryPlanPrice = document.getElementById('summaryPlanPrice');

    const cycleLabel = (billingCycle === 'annual' || billingCycle === 'yearly') ? 'Annual' : 'Monthly';

    if (contextPlanName)  contextPlanName.textContent  = capitalize(planName) + ' Plan';
    if (contextPlanCycle) contextPlanCycle.textContent  = cycleLabel;
    if (summaryPlanName)  summaryPlanName.textContent   = capitalize(planName) + ' Plan';
    if (summaryPlanCycle) {
        summaryPlanCycle.textContent = cycleLabel;
        summaryPlanCycle.className   = 'summary-item-cycle ' + (cycleLabel === 'Annual' ? 'yearly-badge' : 'monthly-badge');
    }

    // Fetch base plan price to show in context bar + summary
    let basePlanPrice = 0;
    if (planId) {
        try {
            const { data: planData } = await supabase
                .from('plans')
                .select('price_monthly, price_yearly')
                .eq('plan_id', planId)
                .maybeSingle();

            if (planData) {
                basePlanPrice = (cycleLabel === 'Annual')
                    ? parseFloat(planData.price_yearly)  || 0
                    : parseFloat(planData.price_monthly) || 0;

                const priceStr = `₹${basePlanPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                if (contextPlanPrice) contextPlanPrice.textContent = priceStr + (cycleLabel === 'Annual' ? ' / yr' : ' / mo');
                if (summaryPlanPrice) summaryPlanPrice.textContent = priceStr;
            }
        } catch (e) {
            console.warn('[addons] Could not fetch plan price:', e);
        }
    }

    updateSummary();

    // ── Fetch & Render Add-ons ──────────────────────────────────────────────
    await fetchAndRenderAddons();

    // ── Navigation Buttons ──────────────────────────────────────────────────
    document.getElementById('btnContinueToPayments')?.addEventListener('click', () => {
        proceedToPayments(false);
    });

    document.getElementById('btnSkipAddons')?.addEventListener('click', () => {
        proceedToPayments(true);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // FETCH & RENDER ADD-ONS
    // ═══════════════════════════════════════════════════════════════════════

    async function fetchAndRenderAddons() {
        const grid      = document.getElementById('addonsGrid');
        const emptyState = document.getElementById('addonsEmptyState');

        try {
            const { data: addons, error } = await supabase
                .from('add_ons')
                .select('*')
                .eq('status', 'active');

            if (error) throw error;

            if (!addons || addons.length === 0) {
                // No add-ons available: clear skeleton, show empty state, auto-redirect
                if (grid) grid.innerHTML = '';
                if (emptyState) emptyState.style.display = 'flex';

                // Auto-skip to payments after brief delay
                setTimeout(() => proceedToPayments(true), 2000);
                return;
            }

            // Render cards
            if (grid) grid.innerHTML = '';

            addons.forEach(addon => {
                const card = buildAddonCard(addon);
                if (grid) grid.appendChild(card);
            });

        } catch (err) {
            console.error('[addons] Failed to fetch add-ons:', err);
            if (grid) grid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: rgba(255,255,255,0.6); font-size: 0.9rem;">
                    Could not load add-ons. You can skip and add them later from your dashboard.
                </div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD INDIVIDUAL ADDON CARD
    // ═══════════════════════════════════════════════════════════════════════

    function buildAddonCard(addon) {
        const monPrice = parseFloat(addon.price_monthly) || 0;
        const annPrice = parseFloat(addon.price_yearly)  || 0;

        const hasMonthly = monPrice > 0;
        const hasYearly  = annPrice > 0;

        // Default selected cycle for this card: match the plan cycle if available
        const defaultCycle = (cycleLabel === 'Annual' && hasYearly) ? 'yearly'
                           : (hasMonthly ? 'monthly' : 'yearly');

        const card = document.createElement('div');
        card.className = 'addon-card';
        card.dataset.addonId = addon.addon_id;

        card.innerHTML = `
            <!-- Top: Name + Checkbox -->
            <div class="addon-card-top">
                <div class="addon-card-name-block">
                    <h4 class="addon-card-name">${escHtml(addon.name)}</h4>
                    ${addon.description ? `<p class="addon-card-desc">${escHtml(addon.description)}</p>` : ''}
                </div>
                <div class="addon-select-check" aria-label="Select ${escHtml(addon.name)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>

            <!-- Cycle Picker: visible only when selected -->
            <div class="addon-cycle-picker">
                <span class="cycle-picker-label">Billing Cycle</span>
                <div class="cycle-options">
                    ${hasMonthly ? `
                    <div class="cycle-option ${defaultCycle === 'monthly' ? 'active' : ''}" data-cycle="monthly">
                        <span class="cycle-option-label">Monthly</span>
                        <span class="cycle-option-price">₹${monPrice.toLocaleString('en-IN')}</span>
                        <span class="cycle-option-sub">/ month</span>
                    </div>` : ''}
                    ${hasYearly ? `
                    <div class="cycle-option ${defaultCycle === 'yearly' ? 'active' : ''}" data-cycle="yearly">
                        <span class="cycle-option-label">Annual</span>
                        <span class="cycle-option-price">₹${annPrice.toLocaleString('en-IN')}</span>
                        <span class="cycle-option-sub">/ year</span>
                    </div>` : ''}
                </div>
            </div>

            <!-- Bottom: Preview pricing when NOT selected -->
            <div class="addon-price-row">
                <span class="addon-price-from">From</span>
                <span class="addon-price-value">
                    ${hasMonthly ? `₹${monPrice.toLocaleString('en-IN')}/mo` : `₹${annPrice.toLocaleString('en-IN')}/yr`}
                </span>
            </div>
        `;

        // ── Card click → toggle selection ──
        card.addEventListener('click', (e) => {
            // If click is on a cycle option, don't toggle the card — let cycle handler do it
            if (e.target.closest('.cycle-option')) return;

            const isSelected = card.classList.contains('selected');

            if (isSelected) {
                // Deselect
                card.classList.remove('selected');
                delete selectionMap[addon.addon_id];
            } else {
                // Select with default cycle
                card.classList.add('selected');
                const activeOption = card.querySelector('.cycle-option.active');
                const activeCycle  = activeOption?.dataset.cycle || defaultCycle;
                const price        = activeCycle === 'monthly' ? monPrice : annPrice;

                selectionMap[addon.addon_id] = {
                    addon_id:          addon.addon_id,
                    name:              addon.name,
                    billing_cycle:     activeCycle,
                    price:             price,
                    price_monthly:     monPrice,
                    price_yearly:      annPrice,
                    razorpay_plan_id:  activeCycle === 'monthly'
                                         ? (addon.razorpay_plan_id_monthly || null)
                                         : (addon.razorpay_plan_id_yearly  || null)
                };
            }

            updateSummary();
        });

        // ── Cycle option click handler ──
        card.querySelectorAll('.cycle-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card toggle

                // Update active class on cycle buttons
                card.querySelectorAll('.cycle-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');

                const chosenCycle = opt.dataset.cycle;
                const chosenPrice = chosenCycle === 'monthly' ? monPrice : annPrice;

                // If card is selected, update the selection map
                if (card.classList.contains('selected')) {
                    selectionMap[addon.addon_id] = {
                        addon_id:         addon.addon_id,
                        name:             addon.name,
                        billing_cycle:    chosenCycle,
                        price:            chosenPrice,
                        price_monthly:    monPrice,
                        price_yearly:     annPrice,
                        razorpay_plan_id: chosenCycle === 'monthly'
                                            ? (addon.razorpay_plan_id_monthly || null)
                                            : (addon.razorpay_plan_id_yearly  || null)
                    };
                    updateSummary();
                }
            });
        });

        return card;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UPDATE LIVE SUMMARY PANEL
    // ═══════════════════════════════════════════════════════════════════════

    function updateSummary() {
        const selectedAddons = Object.values(selectionMap);
        const count          = selectedAddons.length;

        // Selected count badge
        const countBadge = document.getElementById('selectedCountBadge');
        if (countBadge) {
            if (count > 0) {
                countBadge.style.display = 'inline-block';
                countBadge.textContent   = count + ' selected';
            } else {
                countBadge.style.display = 'none';
            }
        }

        // Summary addon list
        const list      = document.getElementById('addonsSummaryList');
        const emptyNote = document.getElementById('summaryEmptyNote');

        if (list) {
            if (count === 0) {
                list.innerHTML = '<p class="summary-empty-note" id="summaryEmptyNote">No add-ons selected yet.</p>';
            } else {
                let addonRowsHtml = '';
                selectedAddons.forEach(item => {
                    const cycleText  = item.billing_cycle === 'monthly' ? 'Monthly' : 'Annual';
                    const cycleCls   = item.billing_cycle === 'monthly' ? 'monthly-badge' : 'yearly-badge';
                    const priceFmt   = `₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                    addonRowsHtml += `
                        <div class="summary-row summary-addon-row active-addon">
                            <div class="summary-item-info">
                                <span class="summary-item-name" style="font-weight:500;">${escHtml(item.name)}</span>
                                <span class="summary-item-cycle ${cycleCls}">${cycleText}</span>
                            </div>
                            <span class="summary-item-price">${priceFmt}</span>
                        </div>
                    `;
                });
                list.innerHTML = addonRowsHtml;
            }
        }

        // Calculate total
        let addonsTotal = selectedAddons.reduce((sum, item) => sum + item.price, 0);
        let grandTotal  = basePlanPrice + addonsTotal;

        const totalEl = document.getElementById('summaryTotalPrice');
        if (totalEl) {
            totalEl.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        }

        const totalNote = document.getElementById('summaryTotalNote');
        if (totalNote) {
            totalNote.textContent = count > 0
                ? `Plan + ${count} add-on${count > 1 ? 's' : ''}`
                : 'Plan only (no add-ons selected)';
        }

        // Enable/disable Continue button
        const btnContinue = document.getElementById('btnContinueToPayments');
        if (btnContinue) {
            // Enable always — even 0 add-ons is valid (they can use Skip too)
            btnContinue.disabled = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROCEED TO PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════

    function proceedToPayments(isSkip) {
        const selectedAddons = isSkip ? [] : Object.values(selectionMap);

        // Save selected add-ons to localStorage
        localStorage.setItem('selected_addons', JSON.stringify(selectedAddons));

        // Build redirect URL
        const qp = new URLSearchParams();
        if (companyId) qp.set('company_id', companyId);

        window.location.href = `payments.html?${qp.toString()}`;
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
});

