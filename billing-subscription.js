// billing-subscription.js — Frontend State & Interaction Controller
// BharathBots Salon Management SaaS (Frontend-First, Plain & Neutral Design)

(function () {
    'use strict';

    // ── Helper Formatter Functions ─────────────────────────────────
    const fmtCurrency = (n) => {
        if (n == null || isNaN(n)) return '—';
        return '₹' + Number(n).toLocaleString('en-IN');
    };

    const showToast = (msg) => {
        const toast = document.getElementById('billingToast');
        const toastMsg = document.getElementById('billingToastMsg');
        if (!toast || !toastMsg) return;
        toastMsg.textContent = msg;
        toast.classList.add('is-visible');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3200);
    };

    // ── Catalog Data & Plan Definitions ───────────────────────────
    const CATALOG_ADDONS = [
        {
            id: 'whatsapp',
            name: 'WhatsApp Reminders',
            desc: 'Automated appointment reminders via WhatsApp',
            price: 499,
            icon: 'message-circle',
            theme: 'green'
        },
        {
            id: 'ai_receptionist',
            name: 'AI Receptionist',
            desc: 'AI-powered call handling & booking assistant',
            price: 999,
            icon: 'cpu',
            theme: 'purple'
        },
        {
            id: 'advanced_reports',
            name: 'Advanced Reports',
            desc: 'Deep-dive revenue, staff & service analytics',
            price: 299,
            icon: 'bar-chart-2',
            theme: 'blue'
        },
        {
            id: 'smart_notifications',
            name: 'Smart Notifications',
            desc: 'Push & SMS alerts for bookings and updates',
            price: 199,
            icon: 'bell',
            theme: 'amber'
        }
    ];

    const PLAN_SPECS = {
        'Growth': {
            name: 'Growth',
            monthlyPrice: 4999,
            included: [
                'Unlimited bookings',
                'Staff management (up to 20)',
                'Customer database CRM',
                'Sales reports & analytics',
                'Marketing tools',
                'Multi-branch support',
                'Priority email support'
            ],
            excluded: [
                'Dedicated account manager',
                'Custom API integrations'
            ]
        },
        'Basic': {
            name: 'Basic',
            monthlyPrice: 1999,
            included: [
                '1 Branch',
                'Up to 5 staff accounts',
                'Basic bookings management',
                'Customer database',
                'Payment tracking'
            ],
            excluded: [
                'Multi-branch support',
                'Marketing tools',
                'Priority support',
                'Dedicated account manager'
            ]
        }
    };

    // ── Application State ──────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const paramState = urlParams.get('state');
    const validModes = ['active', 'noplan', 'cancelled'];
    const initialMode = validModes.includes(paramState) ? paramState : 'active';

    const state = {
        currentMode: initialMode, // 'active' | 'noplan' | 'cancelled'
        plan: {
            name: 'Growth',
            cycle: 'monthly',
            price: 4999,
            startDate: '10 Sep 2026',
            validUntil: '09 Oct 2026',
            nextBillingDate: '10 Oct 2026',
            status: 'Active'
        },
        activeAddonIds: ['whatsapp', 'ai_receptionist'],
        paymentMethod: {
            type: 'card',
            cardMask: '•••• •••• •••• 4242',
            holder: 'Admin User',
            expiry: '09 / 2028',
            network: 'VISA / MASTERCARD',
            brand: 'MASTERCARD',
            upiId: 'salonadmin@okhdfcbank',
            upiApp: 'Google Pay',
            bankName: 'HDFC Bank'
        },
        billingInfo: {
            legalName: 'Salon ABC',
            gstin: '37ABCDE1234F1Z5',
            email: 'billing@salonabc.com',
            address: 'Main Road, Machilipatnam, Andhra Pradesh - 521001, India'
        },
        paymentHistory: [
            {
                id: 'INV-2026-00009',
                date: '10 Sep 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'UPI',
                paymentRef: 'UPI/3294829104',
                status: 'Paid',
                items: [
                    { name: 'Growth Plan — Monthly Subscription', amount: 4236 }
                ]
            },
            {
                id: 'INV-2026-00008',
                date: '10 Aug 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'Card',
                paymentRef: 'TXN-8492019482',
                status: 'Paid',
                items: [
                    { name: 'Growth Plan — Monthly Subscription', amount: 4236 }
                ]
            },
            {
                id: 'INV-2026-00007',
                date: '10 Jul 2026',
                description: 'Growth Plan + Add-on',
                amount: 6766,
                method: 'Card',
                paymentRef: 'TXN-7391048201',
                status: 'Paid',
                items: [
                    { name: 'Growth Plan — Monthly Subscription', amount: 4236 },
                    { name: 'WhatsApp Reminders Add-on', amount: 499 },
                    { name: 'AI Receptionist Add-on', amount: 999 }
                ]
            },
            {
                id: 'INV-2026-00006',
                date: '10 Jun 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'Card',
                paymentRef: 'TXN-6192849102',
                status: 'Refunded',
                items: [
                    { name: 'Growth Plan — Monthly Subscription', amount: 4236 }
                ]
            }
        ],
        pendingAddonId: null
    };

    // ── DOM References ─────────────────────────────────────────────
    // State preview pills
    const statePillsGroup = document.getElementById('statePillsGroup');

    // Row 1: Plan & Add-ons
    const currentPlanCard = document.getElementById('currentPlanCard');
    const planNameBadge = document.getElementById('planNameBadge');
    const planStatusPill = document.getElementById('planStatusPill');
    const planStatusText = document.getElementById('planStatusText');
    const planPriceBlock = document.getElementById('planPriceBlock');
    const planPriceAmount = document.getElementById('planPriceAmount');
    const planPricePeriod = document.getElementById('planPricePeriod');
    const planSubNotice = document.getElementById('planSubNotice');
    const planMetaGrid = document.getElementById('planMetaGrid');
    const metaStatus = document.getElementById('metaStatus');
    const metaStartDate = document.getElementById('metaStartDate');
    const metaValidUntil = document.getElementById('metaValidUntil');
    const metaNextBilling = document.getElementById('metaNextBilling');
    const planActionsContainer = document.getElementById('planActionsContainer');

    const activeAddonsList = document.getElementById('activeAddonsList');
    const activeAddonsCountBadge = document.getElementById('activeAddonsCountBadge');
    const activeAddonsTotalVal = document.getElementById('activeAddonsTotalVal');

    // Row 2: Features & Available
    const featuresCardSubtitle = document.getElementById('featuresCardSubtitle');
    const featuresIncludedCountBadge = document.getElementById('featuresIncludedCountBadge');
    const featuresIncludedList = document.getElementById('featuresIncludedList');
    const featuresExcludedList = document.getElementById('featuresExcludedList');
    const featuresExcludedCol = document.getElementById('featuresExcludedCol');
    const availableAddonsList = document.getElementById('availableAddonsList');
    const availableAddonsBadge = document.getElementById('availableAddonsBadge');

    // Row 3: Payment Method & Summary
    const cardMaskDisplay = document.getElementById('cardMaskDisplay');
    const cardHolderDisplay = document.getElementById('cardHolderDisplay');
    const cardExpiryDisplay = document.getElementById('cardExpiryDisplay');
    const cardNetworkLabel = document.getElementById('cardNetworkLabel');

    const summaryLineItems = document.getElementById('summaryLineItems');
    const summarySubtotal = document.getElementById('summarySubtotal');
    const summaryGst = document.getElementById('summaryGst');
    const summaryTotalAmount = document.getElementById('summaryTotalAmount');
    const summaryBillingDateNote = document.getElementById('summaryBillingDateNote');

    // Row 4: History
    const paymentHistoryBody = document.getElementById('paymentHistoryBody');

    // Row 5: Billing Info
    const infoBusinessName = document.getElementById('infoBusinessName');
    const infoGstin = document.getElementById('infoGstin');
    const infoBillingEmail = document.getElementById('infoBillingEmail');
    const infoBillingAddress = document.getElementById('infoBillingAddress');

    // Bottom
    const subscriptionManagementSection = document.getElementById('subscriptionManagementSection');

    // Modals
    const modalAddAddon = document.getElementById('modalAddAddon');
    const addAddonModalTitle = document.getElementById('addAddonModalTitle');
    const addAddonModalPrice = document.getElementById('addAddonModalPrice');
    const addAddonModalDesc = document.getElementById('addAddonModalDesc');
    const btnConfirmAddAddon = document.getElementById('btnConfirmAddAddon');

    const modalManageAddons = document.getElementById('modalManageAddons');
    const modalManageAddonsList = document.getElementById('modalManageAddonsList');
    const modalManageAddonsSummary = document.getElementById('modalManageAddonsSummary');
    const btnCancelManageAddons = document.getElementById('btnCancelManageAddons');
    const btnSaveManageAddons = document.getElementById('btnSaveManageAddons');
    const btnCloseManageAddons = document.getElementById('btnCloseManageAddons');

    const modalCancelSub = document.getElementById('modalCancelSub');
    const cancelModalPlanName = document.getElementById('cancelModalPlanName');
    const cancelModalNotice = document.getElementById('cancelModalNotice');
    const btnConfirmCancelSubscription = document.getElementById('btnConfirmCancelSubscription');

    const modalEditBilling = document.getElementById('modalEditBilling');
    const inputLegalName = document.getElementById('inputLegalName');
    const inputGstin = document.getElementById('inputGstin');
    const inputBillingEmail = document.getElementById('inputBillingEmail');
    const inputBillingAddress = document.getElementById('inputBillingAddress');
    const btnSaveBillingInfo = document.getElementById('btnSaveBillingInfo');

    const modalChangePayment = document.getElementById('modalChangePayment');
    const inputCardHolder = document.getElementById('inputCardHolder');
    const inputCardNumber = document.getElementById('inputCardNumber');
    const inputCardExpiry = document.getElementById('inputCardExpiry');
    const inputCardCvv = document.getElementById('inputCardCvv');
    const inputCardBrandBadge = document.getElementById('inputCardBrandBadge');
    const paymentMethodTabs = document.getElementById('paymentMethodTabs');
    const inputUpiId = document.getElementById('inputUpiId');
    const upiAppGrid = document.getElementById('upiAppGrid');
    const upiHandlesRow = document.getElementById('upiHandlesRow');
    const bankSelectorGrid = document.getElementById('bankSelectorGrid');
    const selectOtherBank = document.getElementById('selectOtherBank');
    const btnSavePaymentMethod = document.getElementById('btnSavePaymentMethod');

    const modalViewInvoice = document.getElementById('modalViewInvoice');
    const invoiceModalTitle = document.getElementById('invoiceModalTitle');
    const invoiceModalBody = document.getElementById('invoiceModalBody');
    const btnDownloadInvoicePdf = document.getElementById('btnDownloadInvoicePdf');

    // Header badge
    const headerPlanBadge = document.getElementById('headerPlanBadge');

    // ── Render Functions ───────────────────────────────────────────

    function renderCurrentPlan() {
        if (state.currentMode === 'noplan') {
            if (currentPlanCard) currentPlanCard.className = 'billing-plan-card billing-plan-card--noplan';
            planNameBadge.textContent = 'NO ACTIVE PLAN';
            if (headerPlanBadge) headerPlanBadge.textContent = 'No Plan';

            planStatusPill.className = 'status-pill is-unsubscribed';
            planStatusText.textContent = 'Not subscribed';

            planPriceBlock.innerHTML = `
                <span class="plan-price-amount">—</span>
                <span class="plan-price-frequency" style="color: var(--text-muted);">No subscription</span>
            `;

            planSubNotice.style.display = 'block';
            planSubNotice.textContent = 'Choose a plan to start managing your salon digital operations.';

            planMetaGrid.style.display = 'none';

            planActionsContainer.innerHTML = `
                <button type="button" class="btn-plain btn-plain-primary" onclick="window.location.href='plans.html'">
                    <i data-feather="check-circle"></i>
                    <span>Choose Plan</span>
                </button>
            `;
            return;
        }

        // Active or Cancelled
        planMetaGrid.style.display = 'grid';
        planNameBadge.textContent = `${state.plan.name} Plan`;
        if (headerPlanBadge) headerPlanBadge.textContent = state.plan.name;

        planPriceBlock.innerHTML = `
            <span class="plan-price-amount">${fmtCurrency(state.plan.price)}</span>
            <span class="plan-price-frequency">/ month</span>
        `;

        if (state.currentMode === 'cancelled') {
            if (currentPlanCard) currentPlanCard.className = 'billing-plan-card billing-plan-card--cancelled';
            planStatusPill.className = 'status-pill is-cancelling';
            planStatusText.textContent = `Cancels on ${state.plan.validUntil}`;

            planSubNotice.style.display = 'block';
            planSubNotice.textContent = `Your subscription remains active until ${state.plan.validUntil}.`;

            metaStatus.textContent = 'Cancels at end of cycle';
            metaStartDate.textContent = state.plan.startDate;
            metaValidUntil.textContent = state.plan.validUntil;
            metaNextBilling.textContent = 'None';

            planActionsContainer.innerHTML = `
                <button type="button" class="btn-plain btn-plain-primary" id="btnReactivateSub">
                    <i data-feather="refresh-cw"></i>
                    <span>Reactivate Subscription</span>
                </button>
            `;

            const btnReactivate = document.getElementById('btnReactivateSub');
            if (btnReactivate) {
                btnReactivate.onclick = () => {
                    state.currentMode = 'active';
                    renderAll();
                    showToast('Subscription reactivated successfully!');
                };
            }
        } else {
            // State: Active
            if (currentPlanCard) currentPlanCard.className = 'billing-plan-card billing-plan-card--active';
            planStatusPill.className = 'status-pill is-active';
            planStatusText.textContent = 'Active';

            planSubNotice.style.display = 'block';
            planSubNotice.textContent = 'Your current plan and subscription details';

            metaStatus.textContent = 'Active';
            metaStartDate.textContent = state.plan.startDate;
            metaValidUntil.textContent = state.plan.validUntil;
            metaNextBilling.textContent = state.plan.nextBillingDate;

            planActionsContainer.innerHTML = `
                <button type="button" class="btn-plain btn-plain-primary" id="btnChangePlan" onclick="window.location.href='plans.html?current=growth'">
                    <i data-feather="refresh-cw"></i>
                    <span>Change Plan</span>
                </button>
            `;
        }
    }

    function getActiveAddons() {
        if (state.currentMode === 'noplan') return [];
        return CATALOG_ADDONS.filter(a => state.activeAddonIds.includes(a.id));
    }

    function renderActiveAddons() {
        const activeItems = getActiveAddons();
        activeAddonsCountBadge.textContent = `${activeItems.length} Active`;

        if (activeItems.length === 0) {
            activeAddonsList.innerHTML = `
                <div class="empty-neutral-state">
                    ${state.currentMode === 'noplan' ? 'No active add-ons. Choose a plan to activate add-ons.' : 'No active add-ons currently.'}
                </div>
            `;
            activeAddonsTotalVal.textContent = '₹0 / month';
            return;
        }

        activeAddonsList.innerHTML = activeItems.map(item => `
            <div class="active-addon-row">
                <div class="addon-icon-tile addon-icon-tile--${item.theme || 'blue'}">
                    <i data-feather="${item.icon || 'package'}"></i>
                </div>
                <div class="active-addon-info">
                    <p class="active-addon-name">${item.name}</p>
                    <p class="active-addon-price">${fmtCurrency(item.price)} / month</p>
                </div>
                <span class="badge-status-active">ACTIVE</span>
            </div>
        `).join('');

        const totalAddonPrice = activeItems.reduce((acc, cur) => acc + cur.price, 0);
        activeAddonsTotalVal.textContent = `${fmtCurrency(totalAddonPrice)} / month`;
    }

    function renderPlanFeatures() {
        const spec = PLAN_SPECS[state.plan.name] || PLAN_SPECS['Growth'];
        const planNameLabel = state.currentMode === 'noplan' ? 'Starter' : spec.name;

        featuresCardSubtitle.textContent = 'Features included in your Current Plan';
        featuresIncludedCountBadge.textContent = `${spec.included.length} Included`;

        featuresIncludedList.innerHTML = spec.included.map(item => `
            <div class="feature-item">
                <span class="feature-check-icon"><i data-feather="check"></i></span>
                <span>${item}</span>
            </div>
        `).join('');

        if (spec.excluded && spec.excluded.length > 0) {
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'flex';
            featuresExcludedList.innerHTML = spec.excluded.map(item => `
                <div class="feature-item feature-item--excluded">
                    <span class="feature-check-icon"><i data-feather="x"></i></span>
                    <span>${item}</span>
                </div>
            `).join('');
        } else {
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'none';
            featuresExcludedList.innerHTML = '';
        }
    }

    function renderAvailableAddons() {
        availableAddonsBadge.textContent = `${CATALOG_ADDONS.length} Available`;

        availableAddonsList.innerHTML = CATALOG_ADDONS.map(addon => {
            const isActive = state.currentMode !== 'noplan' && state.activeAddonIds.includes(addon.id);
            const buttonHtml = isActive
                ? `<button type="button" class="btn-plain btn-plain-ghost btn-plain-sm" disabled style="opacity: 0.85;">
                       <i data-feather="check"></i> <span>Active</span>
                   </button>`
                : `<button type="button" class="btn-plain btn-plain-accent btn-plain-sm btn-add-addon" data-addon-id="${addon.id}">
                       <i data-feather="plus"></i> <span>Add</span>
                   </button>`;

            return `
                <div class="available-addon-card">
                    <div class="addon-icon-tile addon-icon-tile--${addon.theme || 'blue'}">
                        <i data-feather="${addon.icon || 'package'}"></i>
                    </div>
                    <div class="available-addon-main">
                        <div class="available-addon-title-row">
                            <h4 class="available-addon-title">${addon.name}</h4>
                        </div>
                        <p class="available-addon-desc">${addon.desc}</p>
                        <p class="available-addon-price">${fmtCurrency(addon.price)} / month</p>
                    </div>
                    <div>
                        ${buttonHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Bind Add-on click interactions
        document.querySelectorAll('.btn-add-addon').forEach(btn => {
            btn.addEventListener('click', function () {
                if (state.currentMode === 'noplan') {
                    showToast('Please select a base subscription plan first.');
                    return;
                }
                const addonId = this.getAttribute('data-addon-id');
                openAddAddonModal(addonId);
            });
        });
    }

    function renderBillingSummary() {
        const activeItems = getActiveAddons();
        const basePlanCost = state.currentMode === 'noplan' ? 0 : state.plan.price;

        let itemsHtml = `
            <div class="summary-row summary-row--highlight">
                <span class="summary-row-label">${state.currentMode === 'noplan' ? 'No Plan Active' : `${state.plan.name} Plan`}</span>
                <span class="summary-row-value">${fmtCurrency(basePlanCost)}</span>
            </div>
        `;

        activeItems.forEach(item => {
            itemsHtml += `
                <div class="summary-row">
                    <span class="summary-row-label">${item.name}</span>
                    <span class="summary-row-value">${fmtCurrency(item.price)}</span>
                </div>
            `;
        });

        summaryLineItems.innerHTML = itemsHtml;

        const subtotal = basePlanCost + activeItems.reduce((acc, cur) => acc + cur.price, 0);
        const gst = Math.round(subtotal * 0.18);
        const total = subtotal + gst;

        summarySubtotal.textContent = fmtCurrency(subtotal);
        summaryGst.textContent = fmtCurrency(gst);
        summaryTotalAmount.textContent = fmtCurrency(total);

        if (state.currentMode === 'noplan') {
            summaryBillingDateNote.textContent = 'No recurring subscription active.';
        } else if (state.currentMode === 'cancelled') {
            summaryBillingDateNote.textContent = `Subscription cancels on ${state.plan.validUntil}. No further renewal.`;
        } else {
            summaryBillingDateNote.textContent = `Auto-renews on ${state.plan.nextBillingDate}.`;
        }
    }

    function renderPaymentMethod() {
        const visual = document.getElementById('paymentCardVisual');
        const modalVisual = document.getElementById('modalCurrentPaymentCardVisual');
        const pm = state.paymentMethod;

        let visualClass = 'payment-card-visual';
        let visualHtml = '';

        if (pm.type === 'upi') {
            if (cardNetworkLabel) cardNetworkLabel.textContent = 'UPI AUTOPAY';
            visualClass = 'payment-card-visual payment-card-visual--upi';
            visualHtml = `
                <div class="payment-card-top">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.15rem; font-weight: 800; letter-spacing: 0.05em; color: #ffffff;">UPI</span>
                        <span style="font-size: 0.76rem; background: rgba(255,255,255,0.2); padding: 2px 7px; border-radius: 4px; font-weight: 600;">AUTOPAY</span>
                    </div>
                    <span class="card-network-label" style="background: rgba(255,255,255,0.15); color: #ffffff; padding: 2px 8px; border-radius: 4px;">${pm.upiApp || 'Google Pay'}</span>
                </div>
                <div class="payment-card-number" style="font-family: inherit; font-size: 1.15rem; letter-spacing: 0.03em; word-break: break-all;">
                    ${pm.upiId || 'salonadmin@okhdfcbank'}
                </div>
                <div class="payment-card-meta">
                    <div>
                        <span class="meta-field-label">Account Holder</span>
                        <span class="meta-field-value">${pm.holder || 'Admin User'}</span>
                    </div>
                    <div style="text-align: right;">
                        <span class="meta-field-label">Status</span>
                        <span class="meta-field-value" style="color: #4ade80; font-weight: 700;">Active Mandate</span>
                    </div>
                </div>
            `;
        } else if (pm.type === 'netbanking') {
            if (cardNetworkLabel) cardNetworkLabel.textContent = 'NET BANKING (e-NACH)';
            visualClass = 'payment-card-visual payment-card-visual--netbanking';
            visualHtml = `
                <div class="payment-card-top">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i data-feather="home" style="width: 18px; height: 18px; color: #ffffff;"></i>
                        <span style="font-size: 1.05rem; font-weight: 800; letter-spacing: 0.04em; color: #ffffff;">${pm.bankName || 'HDFC Bank'}</span>
                    </div>
                    <span class="card-network-label" style="background: rgba(255,255,255,0.15); color: #ffffff; padding: 2px 8px; border-radius: 4px;">e-Mandate</span>
                </div>
                <div class="payment-card-number" style="font-family: inherit; font-size: 1.05rem; letter-spacing: 0.05em;">
                    Mandate ID: •••• 8492
                </div>
                <div class="payment-card-meta">
                    <div>
                        <span class="meta-field-label">Account Holder</span>
                        <span class="meta-field-value">${pm.holder || 'Admin User'}</span>
                    </div>
                    <div style="text-align: right;">
                        <span class="meta-field-label">Auto-Debit</span>
                        <span class="meta-field-value" style="color: #4ade80; font-weight: 700;">e-NACH Verified</span>
                    </div>
                </div>
            `;
        } else {
            // Default Card
            if (cardNetworkLabel) cardNetworkLabel.textContent = (pm.brand || 'VISA') + ' / MASTERCARD';
            visualClass = 'payment-card-visual';
            visualHtml = `
                <div class="payment-card-top">
                    <div class="card-chip-plain"></div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <svg viewBox="0 0 38 24" height="20" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="14" cy="12" r="9" fill="#ef4444" opacity="0.9" />
                            <circle cx="24" cy="12" r="9" fill="#f59e0b" opacity="0.9" />
                        </svg>
                        <span class="card-network-label">${pm.brand || 'MASTERCARD'}</span>
                    </div>
                </div>
                <div class="payment-card-number">${pm.cardMask || '•••• •••• •••• 4242'}</div>
                <div class="payment-card-meta">
                    <div>
                        <span class="meta-field-label">Card Holder</span>
                        <span class="meta-field-value">${pm.holder || 'Admin User'}</span>
                    </div>
                    <div style="text-align: right;">
                        <span class="meta-field-label">Expires</span>
                        <span class="meta-field-value">${pm.expiry || '09 / 2028'}</span>
                    </div>
                </div>
            `;
        }

        if (visual) {
            visual.className = visualClass;
            visual.innerHTML = visualHtml;
        }

        if (modalVisual) {
            modalVisual.className = visualClass;
            modalVisual.innerHTML = visualHtml;
        }

        // Update modal left-column metadata
        const modalCurrentPlanName = document.getElementById('modalCurrentPlanName');
        const modalCurrentNextBilling = document.getElementById('modalCurrentNextBilling');
        const modalCurrentAmount = document.getElementById('modalCurrentAmount');

        if (modalCurrentPlanName) modalCurrentPlanName.textContent = `${state.plan.name} Plan`;
        if (modalCurrentNextBilling) modalCurrentNextBilling.textContent = state.plan.nextBillingDate || '09 Oct 2026';
        if (modalCurrentAmount) {
            const activeItems = getActiveAddons();
            const basePlanCost = state.currentMode === 'noplan' ? 0 : state.plan.price;
            const subtotal = basePlanCost + activeItems.reduce((acc, cur) => acc + cur.price, 0);
            const total = subtotal + Math.round(subtotal * 0.18);
            modalCurrentAmount.textContent = `${fmtCurrency(total)} / mo`;
        }

        if (window.feather) feather.replace();
    }


    function renderPaymentHistory() {
        paymentHistoryBody.innerHTML = state.paymentHistory.map(row => {
            let statusPillClass = 'status-paid';
            if (row.status === 'Pending') statusPillClass = 'status-pending';
            else if (row.status === 'Failed') statusPillClass = 'status-failed';
            else if (row.status === 'Refunded') statusPillClass = 'status-refunded';

            return `
                <tr>
                    <td style="font-weight: 500; color: var(--text-secondary);">${row.date}</td>
                    <td style="font-weight: 600; color: var(--text-primary);">${row.description}</td>
                    <td style="font-weight: 700; color: var(--text-primary);">${fmtCurrency(row.amount)}</td>
                    <td style="color: var(--text-secondary);">${row.method}</td>
                    <td>
                        <span class="table-status-pill ${statusPillClass}">
                            <span class="status-indicator-dot"></span>
                            ${row.status}
                        </span>
                    </td>
                    <td>
                        <button type="button" class="btn-plain btn-plain-ghost btn-plain-sm btn-view-invoice" data-invoice-id="${row.id}">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind invoice view buttons
        document.querySelectorAll('.btn-view-invoice').forEach(btn => {
            btn.addEventListener('click', function () {
                const invoiceId = this.getAttribute('data-invoice-id');
                openInvoiceModal(invoiceId);
            });
        });
    }

    function renderBillingInfo() {
        infoBusinessName.textContent = state.billingInfo.legalName;
        infoGstin.textContent = state.billingInfo.gstin;
        infoBillingEmail.textContent = state.billingInfo.email;
        infoBillingAddress.textContent = state.billingInfo.address;
    }

    function renderSubscriptionManagement() {
        if (state.currentMode === 'noplan') {
            subscriptionManagementSection.style.display = 'none';
        } else {
            subscriptionManagementSection.style.display = 'flex';
            const btnCancel = document.getElementById('btnTriggerCancelModal');
            if (btnCancel) {
                btnCancel.textContent = state.currentMode === 'cancelled'
                    ? 'Subscription Scheduled for Cancellation'
                    : 'Cancel Subscription';
                btnCancel.disabled = (state.currentMode === 'cancelled');
            }
        }
    }

    function renderAll() {
        renderCurrentPlan();
        renderActiveAddons();
        renderPlanFeatures();
        renderAvailableAddons();
        renderBillingSummary();
        renderPaymentMethod();
        renderPaymentHistory();
        renderBillingInfo();
        renderSubscriptionManagement();

        // Update preview switcher pills
        if (statePillsGroup) {
            statePillsGroup.querySelectorAll('.state-pill-btn').forEach(btn => {
                if (btn.getAttribute('data-state') === state.currentMode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Re-run feather icons
        if (window.feather) {
            feather.replace();
        }
    }

    // ── Modal Handlers ─────────────────────────────────────────────

    function closeModal(modalEl) {
        if (modalEl) modalEl.classList.remove('is-open');
    }

    function openModal(modalEl) {
        if (modalEl) {
            modalEl.classList.add('is-open');
            if (window.feather) feather.replace();
        }
    }

    // Modal 1: Add Add-on Confirmation
    function openAddAddonModal(addonId) {
        const addon = CATALOG_ADDONS.find(a => a.id === addonId);
        if (!addon) return;

        state.pendingAddonId = addonId;
        addAddonModalTitle.textContent = `Add ${addon.name}?`;
        addAddonModalPrice.textContent = `${fmtCurrency(addon.price)} / month`;
        addAddonModalDesc.textContent = addon.desc;

        openModal(modalAddAddon);
    }

    if (btnConfirmAddAddon) {
        btnConfirmAddAddon.addEventListener('click', function () {
            if (state.pendingAddonId && !state.activeAddonIds.includes(state.pendingAddonId)) {
                state.activeAddonIds.push(state.pendingAddonId);
                const addon = CATALOG_ADDONS.find(a => a.id === state.pendingAddonId);
                closeModal(modalAddAddon);
                renderAll();
                showToast(`✓ ${addon ? addon.name : 'Add-on'} activated!`);
            }
            state.pendingAddonId = null;
        });
    }

    // ── Modal 2: Manage Add-ons (Two-Column Layout with Real-Time Billing Preview) ───
    let localSelectedAddonIds = [];
    let initialActiveAddonIds = [];

    function calcAddonsTotal(addonIdList) {
        return addonIdList.reduce((acc, id) => {
            const addon = CATALOG_ADDONS.find(a => a.id === id);
            return acc + (addon ? addon.price : 0);
        }, 0);
    }

    function renderManageAddonsList() {
        if (!modalManageAddonsList) return;

        modalManageAddonsList.innerHTML = CATALOG_ADDONS.map(addon => {
            const isSelected = localSelectedAddonIds.includes(addon.id);

            return `
                <div class="manage-addon-card ${isSelected ? 'is-selected' : ''}" data-addon-id="${addon.id}">
                    <div class="manage-addon-card-check">
                        <input type="checkbox" class="manage-addon-checkbox" id="chk_addon_${addon.id}" ${isSelected ? 'checked' : ''} data-addon-id="${addon.id}">
                    </div>
                    <div class="manage-addon-card-info">
                        <label for="chk_addon_${addon.id}" class="manage-addon-card-title">${addon.name}</label>
                        <span class="manage-addon-card-price">${fmtCurrency(addon.price)} / month</span>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners to cards and checkboxes
        modalManageAddonsList.querySelectorAll('.manage-addon-card').forEach(cardEl => {
            const addonId = cardEl.getAttribute('data-addon-id');
            const checkbox = cardEl.querySelector('.manage-addon-checkbox');

            cardEl.addEventListener('click', function (e) {
                if (e.target !== checkbox && e.target.tagName !== 'LABEL') {
                    checkbox.checked = !checkbox.checked;
                    toggleAddonSelection(addonId, checkbox.checked);
                }
            });

            checkbox.addEventListener('change', function () {
                toggleAddonSelection(addonId, this.checked);
            });
        });

        renderManageAddonsSummary();
    }

    function toggleAddonSelection(addonId, isChecked) {
        if (isChecked) {
            if (!localSelectedAddonIds.includes(addonId)) {
                localSelectedAddonIds.push(addonId);
            }
        } else {
            localSelectedAddonIds = localSelectedAddonIds.filter(id => id !== addonId);
        }

        // Update card visual state immediately
        const card = modalManageAddonsList.querySelector(`.manage-addon-card[data-addon-id="${addonId}"]`);
        if (card) {
            const chk = card.querySelector('.manage-addon-checkbox');
            if (chk) chk.checked = isChecked;
            if (isChecked) {
                card.classList.add('is-selected');
            } else {
                card.classList.remove('is-selected');
            }
        }

        renderManageAddonsSummary();
    }

    function renderManageAddonsSummary() {
        if (!modalManageAddonsSummary) return;

        // Current Add-ons snapshot
        const currentAddons = initialActiveAddonIds.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);
        const currentTotal = calcAddonsTotal(initialActiveAddonIds);

        // New additions (currently selected, but not originally active)
        const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
        const addedAddons = addedIds.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);

        // Removals (originally active, but unselected)
        const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));
        const removedAddons = removedIds.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);

        // New total
        const newTotal = calcAddonsTotal(localSelectedAddonIds);

        let currentAddonsHtml = '';
        if (currentAddons.length > 0) {
            currentAddonsHtml = currentAddons.map(a => `
                <div class="billing-card-row">
                    <span class="item-name">${a.name}</span>
                    <span class="item-price">${fmtCurrency(a.price)}</span>
                </div>
            `).join('');
        } else {
            currentAddonsHtml = '<div class="billing-card-empty">— None</div>';
        }

        let additionsHtml = '';
        if (addedAddons.length > 0) {
            additionsHtml = addedAddons.map(a => `
                <div class="billing-card-row">
                    <span class="item-name">${a.name}</span>
                    <span class="item-price item-price--add">+${fmtCurrency(a.price)}</span>
                </div>
            `).join('');
        } else {
            additionsHtml = '<div class="billing-card-empty">— None</div>';
        }

        let removalsHtml = '';
        if (removedAddons.length > 0) {
            removalsHtml = removedAddons.map(a => `
                <div class="billing-card-row">
                    <span class="item-name">${a.name}</span>
                    <span class="item-price item-price--remove">-${fmtCurrency(a.price)}</span>
                </div>
            `).join('');
        } else {
            removalsHtml = '<div class="billing-card-empty">— None</div>';
        }

        modalManageAddonsSummary.innerHTML = `
            <!-- Card 1: Current Add-ons -->
            <div class="billing-card billing-card--current">
                <div class="billing-card-header">
                    <span class="billing-card-title">CURRENT ADD-ONS</span>
                </div>
                <div class="billing-card-body">
                    ${currentAddonsHtml}
                </div>
                <div class="billing-card-subtotal">
                    <span class="item-name">Current Total</span>
                    <span class="item-price">${fmtCurrency(currentTotal)}</span>
                </div>
            </div>

            <!-- Card 2: New Additions -->
            <div class="billing-card billing-card--additions ${addedAddons.length > 0 ? 'is-active' : ''}">
                <div class="billing-card-header">
                    <span class="billing-card-title">NEW ADDITIONS</span>
                    ${addedAddons.length > 0 ? `<span class="billing-card-badge billing-card-badge--green">+${addedAddons.length}</span>` : ''}
                </div>
                <div class="billing-card-body">
                    ${additionsHtml}
                </div>
            </div>

            <!-- Card 3: Removals -->
            <div class="billing-card billing-card--removals ${removedAddons.length > 0 ? 'is-active' : ''}">
                <div class="billing-card-header">
                    <span class="billing-card-title">REMOVALS</span>
                    ${removedAddons.length > 0 ? `<span class="billing-card-badge billing-card-badge--red">-${removedAddons.length}</span>` : ''}
                </div>
                <div class="billing-card-body">
                    ${removalsHtml}
                </div>
            </div>

            <!-- Card 4: New Total Card -->
            <div class="billing-card billing-card--total">
                <div class="billing-total-row">
                    <span class="billing-total-label">NEW ADD-ONS TOTAL</span>
                    <div class="billing-total-value-wrap">
                        <span class="billing-total-val">${fmtCurrency(newTotal)}</span>
                        <span class="billing-total-freq">/ month</span>
                    </div>
                </div>
            </div>
        `;
    }


    function openManageAddonsModal() {
        // Snapshot the current active add-ons
        initialActiveAddonIds = [...state.activeAddonIds];
        localSelectedAddonIds = [...state.activeAddonIds];

        renderManageAddonsList();
        openModal(modalManageAddons);
    }

    function closeManageAddonsModal() {
        localSelectedAddonIds = [...initialActiveAddonIds];
        closeModal(modalManageAddons);
    }

    // Cancel and Close buttons for Manage Add-ons
    if (btnCancelManageAddons) {
        btnCancelManageAddons.addEventListener('click', closeManageAddonsModal);
    }
    if (btnCloseManageAddons) {
        btnCloseManageAddons.addEventListener('click', closeManageAddonsModal);
    }

    // Save Changes: directly commit changes to state and refresh UI
    if (btnSaveManageAddons) {
        btnSaveManageAddons.addEventListener('click', function () {
            state.activeAddonIds = [...localSelectedAddonIds];
            closeModal(modalManageAddons);
            renderAll();
            showToast('Add-on changes saved successfully.');
        });
    }

    const btnManageAddonsBottom = document.getElementById('btnManageAddonsBottom');
    if (btnManageAddonsBottom) {
        btnManageAddonsBottom.onclick = openManageAddonsModal;
    }


    // Modal 3: Cancel Subscription
    const btnTriggerCancelModal = document.getElementById('btnTriggerCancelModal');
    if (btnTriggerCancelModal) {
        btnTriggerCancelModal.addEventListener('click', function () {
            cancelModalPlanName.textContent = `${state.plan.name} Plan`;
            cancelModalNotice.innerHTML = `Your subscription will remain active until <strong>${state.plan.validUntil}</strong>. You will continue to have full access until then.`;
            openModal(modalCancelSub);
        });
    }

    if (btnConfirmCancelSubscription) {
        btnConfirmCancelSubscription.addEventListener('click', function () {
            state.currentMode = 'cancelled';
            closeModal(modalCancelSub);
            renderAll();
            showToast('Subscription scheduled for cancellation.');
        });
    }

    // Modal 4: Edit Billing Info
    const btnOpenEditBilling = document.getElementById('btnOpenEditBilling');
    if (btnOpenEditBilling) {
        btnOpenEditBilling.addEventListener('click', function () {
            inputLegalName.value = state.billingInfo.legalName;
            inputGstin.value = state.billingInfo.gstin;
            inputBillingEmail.value = state.billingInfo.email;
            inputBillingAddress.value = state.billingInfo.address;
            openModal(modalEditBilling);
        });
    }

    if (btnSaveBillingInfo) {
        btnSaveBillingInfo.addEventListener('click', function () {
            state.billingInfo.legalName = inputLegalName.value.trim() || state.billingInfo.legalName;
            state.billingInfo.gstin = inputGstin.value.trim() || state.billingInfo.gstin;
            state.billingInfo.email = inputBillingEmail.value.trim() || state.billingInfo.email;
            state.billingInfo.address = inputBillingAddress.value.trim() || state.billingInfo.address;

            closeModal(modalEditBilling);
            renderBillingInfo();
            showToast('Billing information saved.');
        });
    }

    // Modal 5: Change Payment Method (Multiple Payment Types)
    let activePaymentTab = 'card';
    let selectedUpiApp = 'Google Pay';
    let selectedBank = 'HDFC Bank';

    function setPaymentTab(tabName) {
        activePaymentTab = tabName;
        if (paymentMethodTabs) {
            paymentMethodTabs.querySelectorAll('.payment-method-tab').forEach(btn => {
                btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tabName);
            });
        }
        const panels = {
            card: document.getElementById('panelPaymentCard'),
            upi: document.getElementById('panelPaymentUpi'),
            netbanking: document.getElementById('panelPaymentNetbanking')
        };
        Object.keys(panels).forEach(key => {
            if (panels[key]) {
                panels[key].classList.toggle('is-active', key === tabName);
            }
        });
        if (window.feather) feather.replace();
    }

    if (paymentMethodTabs) {
        paymentMethodTabs.querySelectorAll('.payment-method-tab').forEach(btn => {
            btn.addEventListener('click', function () {
                const tab = this.getAttribute('data-tab');
                setPaymentTab(tab);
            });
        });
    }

    // Card brand detection & auto-formatting
    function detectCardBrand(num) {
        const clean = (num || '').replace(/\D/g, '');
        if (/^4/.test(clean)) return 'VISA';
        if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(clean)) return 'MASTERCARD';
        if (/^(60|65|81|82|508)/.test(clean)) return 'RUPAY';
        if (/^3[47]/.test(clean)) return 'AMEX';
        return 'CARD';
    }

    if (inputCardNumber) {
        inputCardNumber.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 16);
            let formatted = val.match(/.{1,4}/g)?.join(' ') || val;
            this.value = formatted;

            const brand = detectCardBrand(val);
            if (inputCardBrandBadge) {
                inputCardBrandBadge.textContent = brand;
            }
        });
    }

    if (inputCardExpiry) {
        inputCardExpiry.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 4);
            if (val.length >= 3) {
                this.value = val.slice(0, 2) + '/' + val.slice(2);
            } else {
                this.value = val;
            }
        });
    }

    // UPI App Selector
    if (upiAppGrid) {
        upiAppGrid.querySelectorAll('.upi-app-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                upiAppGrid.querySelectorAll('.upi-app-pill').forEach(p => p.classList.remove('is-selected'));
                this.classList.add('is-selected');
                selectedUpiApp = this.getAttribute('data-app') || 'Google Pay';
            });
        });
    }

    // UPI Handle Chips
    if (upiHandlesRow && inputUpiId) {
        upiHandlesRow.querySelectorAll('.upi-handle-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                const handle = this.getAttribute('data-handle');
                let currentVal = inputUpiId.value.trim();
                if (!currentVal) {
                    inputUpiId.value = 'username' + handle;
                } else if (currentVal.includes('@')) {
                    inputUpiId.value = currentVal.split('@')[0] + handle;
                } else {
                    inputUpiId.value = currentVal + handle;
                }
                inputUpiId.focus();
            });
        });
    }

    // Bank Selector Grid
    if (bankSelectorGrid) {
        bankSelectorGrid.querySelectorAll('.bank-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                bankSelectorGrid.querySelectorAll('.bank-pill').forEach(p => p.classList.remove('is-selected'));
                this.classList.add('is-selected');
                selectedBank = this.getAttribute('data-bank') || 'HDFC Bank';
                if (selectOtherBank) selectOtherBank.value = '';
            });
        });
    }

    if (selectOtherBank) {
        selectOtherBank.addEventListener('change', function () {
            if (this.value) {
                if (bankSelectorGrid) {
                    bankSelectorGrid.querySelectorAll('.bank-pill').forEach(p => p.classList.remove('is-selected'));
                }
                selectedBank = this.value;
            }
        });
    }

    const btnChangePaymentMethod = document.getElementById('btnChangePaymentMethod');
    if (btnChangePaymentMethod) {
        btnChangePaymentMethod.addEventListener('click', function () {
            const pm = state.paymentMethod;
            setPaymentTab(pm.type || 'card');

            if (inputCardHolder) inputCardHolder.value = pm.holder || 'Admin User';
            if (inputCardNumber) inputCardNumber.value = '';
            if (inputCardExpiry) inputCardExpiry.value = (pm.expiry || '09/28').replace(/\s+/g, '');
            if (inputCardCvv) inputCardCvv.value = '';
            if (inputUpiId) inputUpiId.value = pm.upiId || 'salonadmin@okhdfcbank';

            renderPaymentMethod();
            openModal(modalChangePayment);
        });
    }

    if (btnSavePaymentMethod) {
        btnSavePaymentMethod.addEventListener('click', function () {
            if (activePaymentTab === 'upi') {
                const upiVal = inputUpiId ? inputUpiId.value.trim() : '';
                const finalUpi = upiVal && upiVal.includes('@') ? upiVal : (upiVal ? upiVal + '@okhdfcbank' : 'salonadmin@okhdfcbank');

                state.paymentMethod.type = 'upi';
                state.paymentMethod.upiId = finalUpi;
                state.paymentMethod.upiApp = selectedUpiApp || 'Google Pay';
                state.paymentMethod.holder = inputCardHolder ? inputCardHolder.value.trim() || 'Admin User' : 'Admin User';

                closeModal(modalChangePayment);
                renderPaymentMethod();
                showToast(`Payment method updated to UPI AutoPay (${selectedUpiApp}).`);
            } else if (activePaymentTab === 'netbanking') {
                const finalBank = selectedBank || 'HDFC Bank';

                state.paymentMethod.type = 'netbanking';
                state.paymentMethod.bankName = finalBank;
                state.paymentMethod.holder = inputCardHolder ? inputCardHolder.value.trim() || 'Admin User' : 'Admin User';

                closeModal(modalChangePayment);
                renderPaymentMethod();
                showToast(`Payment method updated to ${finalBank} e-Mandate.`);
            } else {
                // Card tab
                const rawCard = inputCardNumber ? inputCardNumber.value.trim().replace(/\s+/g, '') : '';
                const holder = (inputCardHolder && inputCardHolder.value.trim()) || 'Admin User';
                const expiry = (inputCardExpiry && inputCardExpiry.value.trim()) || '09 / 2028';
                const brand = detectCardBrand(rawCard);

                let mask = state.paymentMethod.cardMask || '•••• •••• •••• 4242';
                if (rawCard.length >= 4) {
                    mask = `•••• •••• •••• ${rawCard.slice(-4)}`;
                }

                state.paymentMethod.type = 'card';
                state.paymentMethod.holder = holder;
                state.paymentMethod.cardMask = mask;
                state.paymentMethod.expiry = expiry.includes('/') ? expiry : '09 / 2028';
                state.paymentMethod.brand = brand;
                state.paymentMethod.network = `${brand} / MASTERCARD`;

                closeModal(modalChangePayment);
                renderPaymentMethod();
                showToast(`Payment method updated to ${brand} Card.`);
            }
        });
    }

    // Modal 6: View Invoice Preview
    function openInvoiceModal(invoiceId) {
        const item = state.paymentHistory.find(h => h.id === invoiceId) || state.paymentHistory[0];
        invoiceModalTitle.textContent = `Invoice #${item.id}`;

        let statusBadgeClass = 'is-paid';
        if (item.status === 'Pending') statusBadgeClass = 'is-pending';
        else if (item.status === 'Failed') statusBadgeClass = 'is-failed';
        else if (item.status === 'Refunded') statusBadgeClass = 'is-refunded';

        const statusBadge = document.getElementById('invoiceModalStatusBadge');
        if (statusBadge) {
            statusBadge.className = `invoice-status-badge ${statusBadgeClass}`;
            statusBadge.textContent = item.status.toUpperCase();
        }

        // Calculate Subtotal & GST from itemized list or total amount
        let items = item.items;
        let subtotal = 0;
        if (items && items.length > 0) {
            subtotal = items.reduce((acc, cur) => acc + cur.amount, 0);
        } else {
            subtotal = Math.round(item.amount / 1.18);
            items = [{ name: `${item.description} — Monthly Subscription`, amount: subtotal }];
        }
        const gst = Math.round(subtotal * 0.18);
        const total = subtotal + gst;

        const itemsRowsHtml = items.map(line => `
            <tr>
                <td class="invoice-item-desc">${line.name}</td>
                <td class="invoice-item-amount">${fmtCurrency(line.amount)}</td>
            </tr>
        `).join('');

        invoiceModalBody.innerHTML = `
            <!-- Top Section: Issuer Details (Left) & Transaction Meta (Right) -->
            <div class="invoice-header-grid">
                <div class="invoice-issuer-block">
                    <p class="invoice-company-name">BharathBots Technologies</p>
                    <p class="invoice-meta-text">GSTIN: <span class="invoice-text-bold">37AAAAA0000A1Z5</span></p>
                    <p class="invoice-meta-text">Machilipatnam, Andhra Pradesh, India</p>
                    <p class="invoice-meta-text">support@bharathbots.com</p>
                </div>
                <div class="invoice-meta-block">
                    <div class="invoice-meta-row">
                        <span class="invoice-meta-label">Date:</span>
                        <span class="invoice-meta-value">${item.date}</span>
                    </div>
                    <div class="invoice-meta-row">
                        <span class="invoice-meta-label">Payment Method:</span>
                        <span class="invoice-meta-value">${item.method}</span>
                    </div>
                    <div class="invoice-meta-row">
                        <span class="invoice-meta-label">Payment Ref:</span>
                        <span class="invoice-meta-value invoice-meta-value--mono">${item.paymentRef || 'TXN-8492019482'}</span>
                    </div>
                    <div class="invoice-meta-row">
                        <span class="invoice-meta-label">Status:</span>
                        <span class="invoice-status-pill ${statusBadgeClass}">${item.status.toUpperCase()}</span>
                    </div>
                </div>
            </div>

            <div class="invoice-divider"></div>

            <!-- Middle Section: BILL TO Customer Block -->
            <div class="invoice-bill-to-card">
                <div class="invoice-bill-to-header">
                    <span class="invoice-bill-to-label">BILL TO</span>
                </div>
                <p class="invoice-customer-name">${state.billingInfo.legalName || 'Salon ABC'}</p>
                <p class="invoice-customer-detail">${state.billingInfo.address || 'Machilipatnam, Andhra Pradesh, India'}</p>
                <div class="invoice-customer-meta-row">
                    <span>GSTIN: <strong>${state.billingInfo.gstin || '37ABCDE1234F1Z5'}</strong></span>
                    ${state.billingInfo.email ? `<span style="margin-left: 14px;">Email: <strong>${state.billingInfo.email}</strong></span>` : ''}
                </div>
            </div>

            <div class="invoice-divider"></div>

            <!-- Items Table: Billable services only (No GST item) -->
            <div class="invoice-table-wrap">
                <table class="invoice-preview-table">
                    <thead>
                        <tr>
                            <th class="col-desc">DESCRIPTION</th>
                            <th class="col-amt">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Financial Summary Breakdown -->
            <div class="invoice-summary-section">
                <div class="invoice-summary-spacer"></div>
                <div class="invoice-summary-box">
                    <div class="invoice-summary-row">
                        <span class="summary-label">Subtotal</span>
                        <span class="summary-val">${fmtCurrency(subtotal)}</span>
                    </div>
                    <div class="invoice-summary-row">
                        <span class="summary-label">GST (18%)</span>
                        <span class="summary-val">${fmtCurrency(gst)}</span>
                    </div>
                    <div class="invoice-summary-divider"></div>
                    <div class="invoice-summary-row invoice-summary-row--total">
                        <span class="summary-label-total">TOTAL PAID</span>
                        <span class="summary-val-total">${fmtCurrency(item.amount)}</span>
                    </div>
                </div>
            </div>

            <!-- Footer Reference Note -->
            <div class="invoice-reference-footer">
                <i data-feather="check-circle" style="width: 14px; height: 14px; stroke: #10b981; flex-shrink: 0;"></i>
                <span>Payment received via <strong>${item.method}</strong> &bull; Ref: <code class="invoice-code">${item.paymentRef || 'TXN-8492019482'}</code></span>
            </div>
        `;

        if (window.feather) feather.replace();
        openModal(modalViewInvoice);
    }

    if (btnDownloadInvoicePdf) {
        btnDownloadInvoicePdf.addEventListener('click', function () {
            closeModal(modalViewInvoice);
            showToast('Downloading invoice PDF...');
        });
    }

    // Export All History Button
    const btnExportAllHistory = document.getElementById('btnExportAllHistory');
    if (btnExportAllHistory) {
        btnExportAllHistory.addEventListener('click', function () {
            const rows = [
                ['Invoice ID', 'Date', 'Description', 'Amount', 'Payment Method', 'Status'],
                ...state.paymentHistory.map(h => [h.id, h.date, h.description, h.amount, h.method, h.status])
            ];
            const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `bharathbots_billing_history.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Payment history exported.');
        });
    }

    // Global Modal Close Listeners (Backdrop + data-close-modal)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.billing-modal-overlay');
            closeModal(modal);
        });
    });

    document.querySelectorAll('.billing-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeModal(overlay);
            }
        });
    });

    // ── Developer Preview Helper (Accessible via console or URL query ?state=...) ─────
    window.setBillingState = function (mode) {
        if (validModes.includes(mode)) {
            state.currentMode = mode;
            renderAll();
            showToast(`Billing preview switched to: ${mode}`);
        } else {
            console.warn(`[Billing] Unknown mode: "${mode}". Valid modes: ${validModes.join(', ')}`);
        }
    };

    // ── Initial Render ─────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        renderAll();
    });

    // Also execute immediately in case DOM is already parsed
    renderAll();

})();
