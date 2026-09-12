// billing-subscription.js — Frontend State & Interaction Controller
// BharathBots Salon Management SaaS (Frontend-First, Plain & Neutral Design)

(function () {
    'use strict';

    // ── Helper Formatter Functions ─────────────────────────────────
    const fmtCurrency = (n) => {
        if (n == null || isNaN(n)) return '—';
        return '₹' + Number(n).toLocaleString('en-IN');
    };

    const formatDateDisplay = (val) => {
        if (!val) return '—';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return val;
            return d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return val;
        }
    };

    const getCompanyId = () => {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch (_) {}
        return localStorage.getItem('company_id') ||
               localStorage.getItem('current_company_id') ||
               localStorage.getItem('tenant_id') ||
               null;
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
    let CATALOG_ADDONS = [
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

    function getAddonById(id) {
        if (!id) return null;
        const fromActive = (state.activeAddons || []).find(a => a.id === id);
        if (fromActive) return fromActive;
        return CATALOG_ADDONS.find(a => a.id === id) || null;
    }

    function syncCatalogWithActiveAddons() {
        if (!state.activeAddons || state.activeAddons.length === 0) return;
        state.activeAddons.forEach(activeItem => {
            if (!activeItem || !activeItem.id) return;
            const existing = CATALOG_ADDONS.find(a => a.id === activeItem.id);
            if (existing) {
                if (activeItem.name) existing.name = activeItem.name;
                if (activeItem.price != null) existing.price = activeItem.price;
                if (activeItem.icon) existing.icon = activeItem.icon;
                if (activeItem.theme) existing.theme = activeItem.theme;
            } else {
                CATALOG_ADDONS.unshift({
                    id: activeItem.id,
                    name: activeItem.name,
                    desc: activeItem.description || '',
                    price: Number(activeItem.price) || 0,
                    icon: activeItem.icon || 'package',
                    theme: activeItem.theme || 'blue'
                });
            }
        });
    }

    // ── Application State ──────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const paramState = urlParams.get('state');
    const validModes = ['active', 'noplan', 'cancelled'];
    const initialMode = validModes.includes(paramState) ? paramState : 'active';

    const state = {
        currentMode: initialMode, // 'active' | 'noplan' | 'cancelled'
        subscriptionId: null,
        activeAddons: [],
        addonsLoaded: false,
        planId: null,
        features: {
            included: [],
            excluded: [],
            loaded: false
        },
        plan: {
            name: 'Growth',
            cycle: 'monthly',
            price: 4999,
            startDate: '10 Sep 2026',
            validUntil: '09 Oct 2026',
            nextBillingDate: '10 Oct 2026',
            status: 'Active',
            autoRenew: true
        },
        activeAddonIds: [],
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
            pan: 'ABCDE1234F',
            email: 'billing@salonabc.com',
            phone: '+91 98765 43210',
            addressLine1: 'Main Road',
            addressLine2: '',
            city: 'Machilipatnam',
            district: 'Krishna',
            state: 'Andhra Pradesh',
            pincode: '521001',
            country: 'India'
        },
        paymentHistory: [
            {
                id: 'INV-2026-00009',
                date: '10 Sep 2026',
                description: 'Growth Plan',
                amount: 6766,
                method: 'UPI',
                paymentRef: 'UPI/3294829104',
                status: 'Paid',
                addons: ['whatsapp', 'ai_receptionist'],
                items: [
                    { name: 'Growth Plan — Monthly Subscription', subtitle: 'Core salon management, bookings & multi-staff CRM', amount: 4236, isPlan: true },
                    { name: 'WhatsApp Reminders', subtitle: 'Automated 24h & 2h appointment reminders via WhatsApp', amount: 499, isAddon: true },
                    { name: 'AI Receptionist', subtitle: '24/7 intelligent voice & chat booking assistant', amount: 999, isAddon: true }
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
                addons: [],
                items: [
                    { name: 'Growth Plan — Monthly Subscription', subtitle: 'Core salon management, bookings & multi-staff CRM', amount: 4236, isPlan: true }
                ]
            },
            {
                id: 'INV-2026-00007',
                date: '10 Jul 2026',
                description: 'Growth Plan',
                amount: 5587,
                method: 'Card',
                paymentRef: 'TXN-7391048201',
                status: 'Paid',
                addons: ['whatsapp'],
                items: [
                    { name: 'Growth Plan — Monthly Subscription', subtitle: 'Core salon management, bookings & multi-staff CRM', amount: 4236, isPlan: true },
                    { name: 'WhatsApp Reminders', subtitle: 'Automated 24h & 2h appointment reminders via WhatsApp', amount: 499, isAddon: true }
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
                addons: [],
                items: [
                    { name: 'Growth Plan — Monthly Subscription', subtitle: 'Core salon management, bookings & multi-staff CRM', amount: 4236, isPlan: true }
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
    const infoPan = document.getElementById('infoPan');
    const infoBillingEmail = document.getElementById('infoBillingEmail');
    const infoBillingPhone = document.getElementById('infoBillingPhone');
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
    const cancelModalSubtitle = document.getElementById('cancelModalSubtitle');
    const cancelInfoActiveDate = document.getElementById('cancelInfoActiveDate');
    const btnConfirmCancelSubscription = document.getElementById('btnConfirmCancelSubscription');
    const cancelReasonGroup = document.getElementById('cancelReasonGroup');
    const cancelOtherFeedback = document.getElementById('cancelOtherFeedback');
    const cancelOtherTextarea = document.getElementById('cancelOtherTextarea');

    const modalEditBilling = document.getElementById('modalEditBilling');
    const inputLegalName = document.getElementById('inputLegalName');
    const inputGstin = document.getElementById('inputGstin');
    const inputPan = document.getElementById('inputPan');
    const inputBillingEmail = document.getElementById('inputBillingEmail');
    const inputBillingPhone = document.getElementById('inputBillingPhone');
    const inputAddressLine1 = document.getElementById('inputAddressLine1');
    const inputAddressLine2 = document.getElementById('inputAddressLine2');
    const inputCity = document.getElementById('inputCity');
    const inputDistrict = document.getElementById('inputDistrict');
    const inputState = document.getElementById('inputState');
    const inputPincode = document.getElementById('inputPincode');
    const inputCountry = document.getElementById('inputCountry');
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
            if (window.feather) feather.replace();
            return;
        }

        // Active or Cancelled
        planMetaGrid.style.display = 'grid';
        const planDisplayName = state.plan.name || 'Growth';
        planNameBadge.textContent = planDisplayName.toLowerCase().includes('plan') ? planDisplayName : `${planDisplayName} Plan`;
        if (headerPlanBadge) headerPlanBadge.textContent = planDisplayName;

        const cycleLabel = (state.plan.cycle === 'annual' || state.plan.cycle === 'annually' || state.plan.cycle === 'yearly') ? '/ year' : '/ month';
        planPriceBlock.innerHTML = `
            <span class="plan-price-amount">${fmtCurrency(state.plan.price)}</span>
            <span class="plan-price-frequency">${cycleLabel}</span>
        `;

        if (state.currentMode === 'cancelled' || state.plan.status?.toLowerCase() === 'cancelled') {
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
            // State: Active (or other status)
            if (currentPlanCard) currentPlanCard.className = 'billing-plan-card billing-plan-card--active';
            planStatusPill.className = 'status-pill is-active';
            planStatusText.textContent = state.plan.status || 'Active';

            planSubNotice.style.display = 'block';
            planSubNotice.textContent = state.plan.autoRenew === false
                ? 'Your current plan and subscription details (Auto-renew disabled)'
                : 'Your current plan and subscription details';

            metaStatus.textContent = state.plan.status || 'Active';
            metaStartDate.textContent = state.plan.startDate;
            metaValidUntil.textContent = state.plan.validUntil;
            metaNextBilling.textContent = state.plan.autoRenew === false
                ? (state.plan.nextBillingDate && state.plan.nextBillingDate !== 'None' ? `${state.plan.nextBillingDate} (No renewal)` : 'None')
                : (state.plan.nextBillingDate || '—');

            const currentPlanParam = encodeURIComponent((state.plan.name || 'growth').toLowerCase().replace(/\s+plan$/, ''));
            planActionsContainer.innerHTML = `
                <button type="button" class="btn-plain btn-plain-primary" id="btnChangePlan" onclick="window.location.href='plans.html?current=${currentPlanParam}'">
                    <i data-feather="refresh-cw"></i>
                    <span>Change Plan</span>
                </button>
            `;
        }

        const metaAutoRenew = document.getElementById('metaAutoRenew');
        if (metaAutoRenew) {
            metaAutoRenew.textContent = state.plan.autoRenew ? 'Auto-renew enabled' : 'Auto-renew disabled';
        }

        if (window.feather) feather.replace();
    }

    function getAddonVisualMeta(name) {
        const lower = (name || '').toLowerCase();
        if (lower.includes('whatsapp') || lower.includes('chat')) {
            return { icon: 'message-circle', theme: 'green' };
        }
        if (lower.includes('ai') || lower.includes('receptionist') || lower.includes('call') || lower.includes('voice')) {
            return { icon: 'cpu', theme: 'purple' };
        }
        if (lower.includes('report') || lower.includes('analytic')) {
            return { icon: 'bar-chart-2', theme: 'blue' };
        }
        if (lower.includes('notification') || lower.includes('reminder') || lower.includes('alert') || lower.includes('sms')) {
            return { icon: 'bell', theme: 'amber' };
        }
        return { icon: 'package', theme: 'blue' };
    }

    function getActiveAddons() {
        if (state.currentMode === 'noplan') return [];
        return state.activeAddons || [];
    }

    function renderActiveAddons() {
        if (state.currentMode === 'noplan' || (!state.subscriptionId && state.addonsLoaded)) {
            activeAddonsCountBadge.textContent = '0 Active';
            activeAddonsList.innerHTML = `
                <div class="empty-neutral-state">
                    ${state.currentMode === 'noplan' ? 'No active add-ons. Choose a plan to activate add-ons.' : 'No active add-ons currently.'}
                </div>
            `;
            activeAddonsTotalVal.textContent = '₹0 / month';
            if (window.feather) feather.replace();
            return;
        }

        if (!state.addonsLoaded) {
            activeAddonsCountBadge.textContent = 'Loading...';
            activeAddonsList.innerHTML = `
                <div style="padding: 1rem 0; color: #94a3b8; font-size: 0.9rem;">
                    Loading active add-ons...
                </div>
            `;
            activeAddonsTotalVal.textContent = '—';
            return;
        }

        const activeItems = state.activeAddons || [];
        activeAddonsCountBadge.textContent = `${activeItems.length} Active`;

        if (activeItems.length === 0) {
            activeAddonsList.innerHTML = `
                <div class="empty-neutral-state">
                    No active add-ons currently.
                </div>
            `;
            activeAddonsTotalVal.textContent = '₹0 / month';
            if (window.feather) feather.replace();
            return;
        }

        activeAddonsList.innerHTML = activeItems.map(item => {
            const rawStatus = (item.status || 'Active').toUpperCase();
            return `
            <div class="active-addon-row">
                <div class="addon-icon-tile addon-icon-tile--${item.theme || 'blue'}">
                    <i data-feather="${item.icon || 'package'}"></i>
                </div>
                <div class="active-addon-info">
                    <p class="active-addon-name">${item.name}</p>
                    <p class="active-addon-price">${fmtCurrency(item.price)} / month</p>
                </div>
                <span class="badge-status-active">${rawStatus}</span>
            </div>
            `;
        }).join('');

        const totalAddonPrice = activeItems.reduce((acc, cur) => acc + (Number(cur.price) || 0), 0);
        activeAddonsTotalVal.textContent = `${fmtCurrency(totalAddonPrice)} / month`;

        if (window.feather) feather.replace();
    }

    function renderPlanFeatures() {
        featuresCardSubtitle.textContent = 'Features included in your Current Plan';

        if (state.currentMode === 'noplan' || (!state.planId && state.features.loaded)) {
            featuresIncludedCountBadge.textContent = '0 Included';
            featuresIncludedList.innerHTML = `
                <div class="empty-neutral-state" style="padding: 1rem 0; color: #94a3b8;">
                    No active plan. Choose a plan to view included features.
                </div>
            `;
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'none';
            featuresExcludedList.innerHTML = '';
            if (window.feather) feather.replace();
            return;
        }

        if (!state.features.loaded) {
            featuresIncludedCountBadge.textContent = 'Loading...';
            featuresIncludedList.innerHTML = `
                <div style="padding: 1rem 0; color: #94a3b8; font-size: 0.9rem;">
                    Loading plan features...
                </div>
            `;
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'none';
            featuresExcludedList.innerHTML = '';
            return;
        }

        featuresIncludedCountBadge.textContent = `${state.features.included.length} Included`;

        if (state.features.included.length === 0) {
            featuresIncludedList.innerHTML = `
                <div class="empty-neutral-state" style="padding: 1rem 0; color: #94a3b8;">
                    No features assigned to this plan.
                </div>
            `;
        } else {
            featuresIncludedList.innerHTML = state.features.included.map(item => `
                <div class="feature-item">
                    <span class="feature-check-icon"><i data-feather="check"></i></span>
                    <span>${item}</span>
                </div>
            `).join('');
        }

        if (state.features.excluded && state.features.excluded.length > 0) {
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'flex';
            featuresExcludedList.innerHTML = state.features.excluded.map(item => `
                <div class="feature-item feature-item--excluded">
                    <span class="feature-check-icon"><i data-feather="x"></i></span>
                    <span>${item}</span>
                </div>
            `).join('');
        } else {
            if (featuresExcludedCol) featuresExcludedCol.style.display = 'none';
            featuresExcludedList.innerHTML = '';
        }

        if (window.feather) feather.replace();
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

        const summaryCycleBadge = document.getElementById('summaryCycleBadge');
        if (summaryCycleBadge) {
            summaryCycleBadge.textContent = state.plan.cycle === 'annual' ? 'Annual' : 'Monthly';
        }

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

            let planTitle = `${state.plan.name} Plan`;
            let addonSubtitle = '';
            let amount = row.amount;

            if (row.id === 'INV-2026-00009') {
                const activeAddons = state.activeAddonIds.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);
                if (activeAddons.length > 0) {
                    addonSubtitle = `+ ${activeAddons.map(a => a.name).join(', ')}`;
                    const subtotal = 4236 + activeAddons.reduce((acc, cur) => acc + cur.price, 0);
                    amount = subtotal + Math.round(subtotal * 0.18);
                } else {
                    amount = 4999;
                }
            } else if (row.addons && row.addons.length > 0) {
                const addonsList = row.addons.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);
                if (addonsList.length > 0) {
                    addonSubtitle = `+ ${addonsList.map(a => a.name).join(', ')}`;
                }
            }

            return `
                <tr>
                    <td style="font-weight: 500; color: var(--text-secondary);">${row.date}</td>
                    <td class="table-desc-cell">
                        <div style="font-weight: 600; color: var(--text-primary);">${planTitle}</div>
                        ${addonSubtitle ? `<div style="font-size: 0.78rem; color: #2563eb; font-weight: 600; margin-top: 2px;">${addonSubtitle}</div>` : ''}
                    </td>
                    <td style="font-weight: 700; color: var(--text-primary);">${fmtCurrency(amount)}</td>
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

    function formatBillingAddress(info) {
        const parts = [];
        if (info.addressLine1) parts.push(info.addressLine1);
        if (info.addressLine2) parts.push(info.addressLine2);
        if (info.city) parts.push(info.city);
        if (info.district) parts.push(info.district);
        let statePin = '';
        if (info.state) statePin = info.state;
        if (info.pincode) statePin += ` - ${info.pincode}`;
        if (statePin) parts.push(statePin);
        if (info.country) parts.push(info.country);
        return parts.join(', ');
    }

    function renderBillingInfo() {
        if (infoBusinessName) infoBusinessName.textContent = state.billingInfo.legalName;
        if (infoGstin) infoGstin.textContent = state.billingInfo.gstin;
        if (infoPan) infoPan.textContent = state.billingInfo.pan || '—';
        if (infoBillingEmail) infoBillingEmail.textContent = state.billingInfo.email;
        if (infoBillingPhone) infoBillingPhone.textContent = state.billingInfo.phone || '—';
        if (infoBillingAddress) infoBillingAddress.textContent = formatBillingAddress(state.billingInfo);
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
        const addon = getAddonById(addonId);
        if (!addon) return;

        state.pendingAddonId = addonId;
        addAddonModalTitle.textContent = `Add ${addon.name}?`;
        addAddonModalPrice.textContent = `${fmtCurrency(addon.price)} / month`;
        addAddonModalDesc.textContent = addon.desc || '';

        if (btnConfirmAddAddon) {
            btnConfirmAddAddon.disabled = false;
            btnConfirmAddAddon.innerHTML = 'Add Add-on';
        }

        const closeButtons = modalAddAddon.querySelectorAll('[data-close-modal], .billing-modal-close');
        closeButtons.forEach(btn => btn.disabled = false);

        openModal(modalAddAddon);
    }

    if (btnConfirmAddAddon) {
        btnConfirmAddAddon.addEventListener('click', async function () {
            if (!state.pendingAddonId) return;

            const addId = state.pendingAddonId;
            const addon = getAddonById(addId);

            // Disable button and show buffer circle
            const prevHtml = btnConfirmAddAddon.innerHTML;
            btnConfirmAddAddon.disabled = true;
            btnConfirmAddAddon.innerHTML = '<span class="btn-spinner"></span> <span>Adding...</span>';

            const closeButtons = modalAddAddon.querySelectorAll('[data-close-modal], .billing-modal-close');
            closeButtons.forEach(btn => btn.disabled = true);

            try {
                if (state.subscriptionId && addon) {
                    try {
                        const { supabase } = await import('./lib/supabase.js');
                        await supabase
                            .from('subscription_add_ons')
                            .insert({
                                subscription_id: state.subscriptionId,
                                company_id: getCompanyId(),
                                addon_id: addon.id,
                                addon_name: addon.name,
                                price: addon.price,
                                status: 'active',
                                started_at: new Date().toISOString()
                            });
                    } catch (err) {
                        console.error('[Billing] Error activating add-on in DB:', err);
                    }
                }

                if (!state.activeAddonIds.includes(addId)) {
                    state.activeAddonIds.push(addId);
                }

                if (addon && !state.activeAddons.some(a => a.id === addon.id)) {
                    state.activeAddons.push({
                        id: addon.id,
                        name: addon.name,
                        price: addon.price,
                        status: 'active',
                        icon: addon.icon || 'package',
                        theme: addon.theme || 'blue'
                    });
                }

                syncCatalogWithActiveAddons();
                closeModal(modalAddAddon);
                renderAll();
                showToast(`✓ ${addon ? addon.name : 'Add-on'} activated!`);
            } finally {
                btnConfirmAddAddon.disabled = false;
                btnConfirmAddAddon.innerHTML = prevHtml;
                closeButtons.forEach(btn => btn.disabled = false);
                state.pendingAddonId = null;
            }
        });
    }

    // ── Modal 2: Manage Add-ons (Two-Column Layout with Real-Time Billing Preview) ───
    let localSelectedAddonIds = [];
    let initialActiveAddonIds = [];

    function calcAddonsTotal(addonIdList) {
        return (addonIdList || []).reduce((acc, id) => {
            const addon = getAddonById(id);
            return acc + (addon ? (Number(addon.price) || 0) : 0);
        }, 0);
    }

    function renderManageAddonsList() {
        if (!modalManageAddonsList) return;

        syncCatalogWithActiveAddons();

        if (!CATALOG_ADDONS || CATALOG_ADDONS.length === 0) {
            modalManageAddonsList.innerHTML = `
                <div style="padding: 2rem 1rem; text-align: center; color: #94a3b8;">
                    No add-ons currently available.
                </div>
            `;
            renderManageAddonsSummary();
            return;
        }

        modalManageAddonsList.innerHTML = CATALOG_ADDONS.map(addon => {
            const isSelected = localSelectedAddonIds.includes(addon.id);
            const safeInputId = 'chk_addon_' + String(addon.id).replace(/[^a-zA-Z0-9_-]/g, '_');

            return `
                <div class="manage-addon-card ${isSelected ? 'is-selected' : ''}" data-addon-id="${addon.id}">
                    <div class="manage-addon-card-check">
                        <input type="checkbox" class="manage-addon-checkbox" id="${safeInputId}" ${isSelected ? 'checked' : ''} data-addon-id="${addon.id}">
                    </div>
                    <div class="manage-addon-card-info">
                        <label for="${safeInputId}" class="manage-addon-card-title">${addon.name}</label>
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
        const escapedId = window.CSS && CSS.escape ? CSS.escape(addonId) : addonId;
        const card = modalManageAddonsList.querySelector(`.manage-addon-card[data-addon-id="${escapedId}"]`);
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
        const currentAddons = initialActiveAddonIds.map(id => getAddonById(id)).filter(Boolean);
        const currentTotal = calcAddonsTotal(initialActiveAddonIds);

        // New additions (currently selected, but not originally active)
        const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
        const addedAddons = addedIds.map(id => getAddonById(id)).filter(Boolean);

        // Removals (originally active, but unselected)
        const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));
        const removedAddons = removedIds.map(id => getAddonById(id)).filter(Boolean);

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
        syncCatalogWithActiveAddons();
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

    // Save Changes: commit changes to state and database
    if (btnSaveManageAddons) {
        btnSaveManageAddons.addEventListener('click', async function () {
            const prevHtml = btnSaveManageAddons.innerHTML;
            btnSaveManageAddons.disabled = true;
            btnSaveManageAddons.innerHTML = '<span class="btn-spinner"></span> <span>Saving...</span>';

            try {
                // Determine additions and removals
                const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
                const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));

                // Save to database if subscription exists
                if (state.subscriptionId) {
                    try {
                        const { supabase } = await import('./lib/supabase.js');
                        const companyId = getCompanyId();

                        // Cancel removed add-ons in Supabase
                        for (const remId of removedIds) {
                            await supabase
                                .from('subscription_add_ons')
                                .update({ status: 'cancelled', ended_at: new Date().toISOString() })
                                .eq('subscription_id', state.subscriptionId)
                                .eq('addon_id', remId)
                                .eq('status', 'active');
                        }

                        // Insert new additions in Supabase
                        for (const addId of addedIds) {
                            const addonMeta = getAddonById(addId);
                            if (addonMeta) {
                                await supabase
                                    .from('subscription_add_ons')
                                    .insert({
                                        subscription_id: state.subscriptionId,
                                        company_id: companyId,
                                        addon_id: addonMeta.id,
                                        addon_name: addonMeta.name,
                                        price: addonMeta.price,
                                        status: 'active',
                                        started_at: new Date().toISOString()
                                    });
                            }
                        }
                    } catch (dbErr) {
                        console.error('[Billing] Error updating subscription_add_ons in DB:', dbErr);
                    }
                }

                // Update local state active add-ons
                state.activeAddons = localSelectedAddonIds.map(id => {
                    const existing = (state.activeAddons || []).find(a => a.id === id);
                    if (existing) return existing;
                    const cat = getAddonById(id);
                    if (cat) {
                        return {
                            id: cat.id,
                            name: cat.name,
                            price: cat.price,
                            status: 'active',
                            icon: cat.icon || 'package',
                            theme: cat.theme || 'blue'
                        };
                    }
                    return { id, name: 'Add-on', price: 0, status: 'active', icon: 'package', theme: 'blue' };
                });
                state.activeAddonIds = [...localSelectedAddonIds];
                syncCatalogWithActiveAddons();

                closeModal(modalManageAddons);
                renderAll();
                showToast('Add-on changes saved successfully.');
            } finally {
                btnSaveManageAddons.disabled = false;
                btnSaveManageAddons.innerHTML = prevHtml;
            }
        });
    }

    const btnManageAddonsBottom = document.getElementById('btnManageAddonsBottom');
    if (btnManageAddonsBottom) {
        btnManageAddonsBottom.onclick = openManageAddonsModal;
    }


    // Modal 3: Cancel Subscription
    const btnTriggerCancelModal = document.getElementById('btnTriggerCancelModal');

    function resetCancelModalForm() {
        if (cancelReasonGroup) {
            const radios = cancelReasonGroup.querySelectorAll('input[name="cancelReason"]');
            radios.forEach(radio => radio.checked = false);
        }
        if (cancelOtherFeedback) {
            cancelOtherFeedback.style.display = 'none';
        }
        if (cancelOtherTextarea) {
            cancelOtherTextarea.value = '';
        }
        if (btnConfirmCancelSubscription) {
            btnConfirmCancelSubscription.disabled = true;
        }
    }

    if (btnTriggerCancelModal) {
        btnTriggerCancelModal.addEventListener('click', function () {
            const planName = state.plan.name || 'Growth';
            const validUntil = state.plan.validUntil || '09 Oct 2026';
            if (cancelModalSubtitle) {
                cancelModalSubtitle.textContent = `Your ${planName} Plan will remain active until ${validUntil}. Your subscription will not renew after this date.`;
            }
            if (cancelInfoActiveDate) {
                cancelInfoActiveDate.textContent = validUntil;
            }
            resetCancelModalForm();
            openModal(modalCancelSub);
        });
    }

    // Handle cancellation reason selection and conditional 'Other' feedback textarea
    if (cancelReasonGroup) {
        cancelReasonGroup.addEventListener('change', function (e) {
            if (e.target && e.target.name === 'cancelReason') {
                const selectedValue = e.target.value;
                if (btnConfirmCancelSubscription) {
                    btnConfirmCancelSubscription.disabled = false;
                }
                if (selectedValue === 'other') {
                    if (cancelOtherFeedback) cancelOtherFeedback.style.display = 'flex';
                    if (cancelOtherTextarea) cancelOtherTextarea.focus();
                } else {
                    if (cancelOtherFeedback) cancelOtherFeedback.style.display = 'none';
                }
            }
        });
    }

    if (btnConfirmCancelSubscription) {
        btnConfirmCancelSubscription.addEventListener('click', function () {
            if (btnConfirmCancelSubscription.disabled) return;

            const selectedRadio = document.querySelector('input[name="cancelReason"]:checked');
            if (!selectedRadio) return;

            const validUntil = state.plan.validUntil || '09 Oct 2026';

            // Dummy frontend simulation state
            state.currentMode = 'cancelled';
            closeModal(modalCancelSub);
            resetCancelModalForm();
            renderAll();
            showToast(`Cancellation scheduled. Your subscription will remain active until ${validUntil}.`);
        });
    }

    // Modal 4: Edit Billing Info
    const btnOpenEditBilling = document.getElementById('btnOpenEditBilling');
    if (btnOpenEditBilling) {
        btnOpenEditBilling.addEventListener('click', function () {
            if (inputLegalName) inputLegalName.value = state.billingInfo.legalName || '';
            if (inputGstin) inputGstin.value = state.billingInfo.gstin || '';
            if (inputPan) inputPan.value = state.billingInfo.pan || '';
            if (inputBillingEmail) inputBillingEmail.value = state.billingInfo.email || '';
            if (inputBillingPhone) inputBillingPhone.value = state.billingInfo.phone || '';
            if (inputAddressLine1) inputAddressLine1.value = state.billingInfo.addressLine1 || '';
            if (inputAddressLine2) inputAddressLine2.value = state.billingInfo.addressLine2 || '';
            if (inputCity) inputCity.value = state.billingInfo.city || '';
            if (inputDistrict) inputDistrict.value = state.billingInfo.district || '';
            if (inputState) inputState.value = state.billingInfo.state || '';
            if (inputPincode) inputPincode.value = state.billingInfo.pincode || '';
            if (inputCountry) inputCountry.value = state.billingInfo.country || 'India';
            openModal(modalEditBilling);
        });
    }

    if (btnSaveBillingInfo) {
        btnSaveBillingInfo.addEventListener('click', function () {
            state.billingInfo.legalName = (inputLegalName && inputLegalName.value.trim()) || state.billingInfo.legalName;
            state.billingInfo.gstin = (inputGstin && inputGstin.value.trim()) || state.billingInfo.gstin;
            state.billingInfo.pan = inputPan ? inputPan.value.trim().toUpperCase() : state.billingInfo.pan;
            state.billingInfo.email = (inputBillingEmail && inputBillingEmail.value.trim()) || state.billingInfo.email;
            state.billingInfo.phone = inputBillingPhone ? inputBillingPhone.value.trim() : state.billingInfo.phone;
            state.billingInfo.addressLine1 = (inputAddressLine1 && inputAddressLine1.value.trim()) || state.billingInfo.addressLine1;
            state.billingInfo.addressLine2 = inputAddressLine2 ? inputAddressLine2.value.trim() : '';
            state.billingInfo.city = (inputCity && inputCity.value.trim()) || state.billingInfo.city;
            state.billingInfo.district = inputDistrict ? inputDistrict.value.trim() : '';
            state.billingInfo.state = (inputState && inputState.value.trim()) || state.billingInfo.state;
            state.billingInfo.pincode = (inputPincode && inputPincode.value.trim()) || state.billingInfo.pincode;
            state.billingInfo.country = (inputCountry && inputCountry.value.trim()) || 'India';

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

        // Calculate Subtotal & GST from itemized list or active state
        let items = item.items;
        if (item.id === 'INV-2026-00009') {
            const activeAddons = state.activeAddonIds.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);
            items = [
                {
                    name: `${state.plan.name} Plan — Monthly Subscription`,
                    subtitle: 'Core salon management, bookings & multi-staff CRM',
                    amount: 4236,
                    isPlan: true
                },
                ...activeAddons.map(a => ({
                    name: `${a.name} Add-on`,
                    subtitle: a.desc || `${a.name} active feature bundle`,
                    amount: a.price,
                    isAddon: true
                }))
            ];
        }

        let subtotal = 0;
        if (items && items.length > 0) {
            subtotal = items.reduce((acc, cur) => acc + cur.amount, 0);
        } else {
            subtotal = Math.round(item.amount / 1.18);
            items = [{
                name: `${item.description} — Monthly Subscription`,
                subtitle: 'Core salon management & features',
                amount: subtotal
            }];
        }
        const gst = Math.round(subtotal * 0.18);
        const total = subtotal + gst;

        const itemsRowsHtml = items.map(line => `
            <tr>
                <td class="invoice-item-desc">
                    <div class="invoice-item-header-row">
                        <span class="invoice-item-name">${line.name}</span>
                        ${line.isAddon ? '<span class="invoice-addon-tag">Add-on</span>' : ''}
                    </div>
                    ${line.subtitle ? `<div class="invoice-item-sub">${line.subtitle}</div>` : ''}
                </td>
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
                <p class="invoice-customer-detail">${formatBillingAddress(state.billingInfo)}</p>
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
                        <span class="summary-val-total">${fmtCurrency(total)}</span>
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

    // ── Backend Integration: Active Plan, Features & Add-ons Loader ─
    let isSubLoading = false;

    async function resolveCompanyId() {
        // 1. Direct check in appContext or standard storage keys
        let compId = getCompanyId();
        if (compId) return compId;

        // 2. Auth guard might be completing cold start; poll briefly
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 150));
            compId = getCompanyId();
            if (compId) return compId;
        }

        // 3. Fallback: Lookup company_id via logged in user token
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const { supabase } = await import('./lib/supabase.js');
                const SUPABASE_URL = supabase._url || 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
                const SUPABASE_ANON = supabase._key || 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';
                const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
                });
                if (userRes.ok) {
                    const authUser = await userRes.json().catch(() => null);
                    if (authUser?.id) {
                        const { data: uRows } = await supabase
                            .from('users')
                            .select('company_id')
                            .eq('user_id', authUser.id)
                            .limit(1);
                        if (uRows && uRows[0]?.company_id) {
                            compId = uRows[0].company_id;
                            try { localStorage.setItem('company_id', compId); } catch (_) {}
                            return compId;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[Billing] Fallback company resolution error:', e);
        }

        return null;
    }

    async function loadActiveAddons(supabase, subscriptionId) {
        if (!subscriptionId) {
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            renderActiveAddons();
            return;
        }

        try {
            // Query subscription_add_ons for current subscription where status = 'active'
            const { data: addOnsData, error: addOnsErr } = await supabase
                .from('subscription_add_ons')
                .select('id, subscription_id, company_id, addon_id, addon_name, price, status, started_at, ended_at')
                .eq('subscription_id', subscriptionId)
                .eq('status', 'active');

            if (addOnsErr) {
                console.error('[Billing] Error fetching active add-ons:', addOnsErr);
                state.activeAddons = [];
                state.activeAddonIds = [];
                state.addonsLoaded = true;
                renderActiveAddons();
                return;
            }

            // Also query add_ons table to resolve master metadata
            const addonIds = [...new Set((addOnsData || []).map(r => r.addon_id).filter(Boolean))];
            let masterMap = {};
            if (addonIds.length > 0) {
                try {
                    const { data: masterRows } = await supabase
                        .from('add_ons')
                        .select('addon_id, name, description')
                        .in('addon_id', addonIds);
                    (masterRows || []).forEach(m => {
                        masterMap[m.addon_id] = m;
                    });
                } catch (_) {}
            }

            const items = (addOnsData || []).map(row => {
                const master = masterMap[row.addon_id] || {};
                const rawName = row.addon_name || master.name || 'Add-on';
                // Capitalize add-on names nicely (e.g. "add-on 1" -> "Add-on 1")
                const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                const visual = getAddonVisualMeta(rawName + ' ' + (master.description || ''));
                return {
                    id: row.addon_id,
                    subAddonId: row.id,
                    name: displayName,
                    price: Number(row.price) != null ? Number(row.price) : (Number(master.price) || 0),
                    status: row.status || 'active',
                    startedAt: row.started_at,
                    endedAt: row.ended_at,
                    icon: visual.icon,
                    theme: visual.theme
                };
            });

            state.activeAddons = items;
            state.activeAddonIds = items.map(item => item.id);
            state.addonsLoaded = true;

            syncCatalogWithActiveAddons();
            renderActiveAddons();
            renderAvailableAddons();
            renderBillingSummary();
        } catch (err) {
            console.error('[Billing] Failed to load active add-ons:', err);
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            syncCatalogWithActiveAddons();
            renderActiveAddons();
            renderBillingSummary();
        }
    }

    async function loadAvailableAddonsCatalog(supabase) {
        if (!supabase) return;
        try {
            let { data, error } = await supabase
                .from('add_ons')
                .select('*')
                .eq('status', 'active');

            if (error || !data || data.length === 0) {
                const fallbackRes = await supabase
                    .from('add_ons')
                    .select('*');
                if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
                    data = fallbackRes.data;
                }
            }

            if (data && data.length > 0) {
                const dynamicList = data.map(item => {
                    const rawName = item.name || 'Add-on';
                    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                    const visual = getAddonVisualMeta(rawName + ' ' + (item.description || ''));
                    return {
                        id: item.addon_id || item.id,
                        name: displayName,
                        desc: item.description || '',
                        price: Number(item.price) != null ? Number(item.price) : 0,
                        icon: visual.icon,
                        theme: visual.theme
                    };
                });

                CATALOG_ADDONS = dynamicList;
            }
            // Always ensure active add-ons remain in the catalog
            syncCatalogWithActiveAddons();
            renderAvailableAddons();
        } catch (err) {
            console.error('[Billing] Failed to load available add-ons catalog:', err);
            syncCatalogWithActiveAddons();
        }
    }

    async function loadPlanFeatures(supabase, planId) {
        if (!planId) {
            state.features = { included: [], excluded: [], loaded: true };
            renderPlanFeatures();
            return;
        }

        try {
            // Import MODULES_META for existing ordering and human-readable feature labels
            let modulesMeta = [];
            try {
                const mod = await import('./config/feature-registry.js');
                if (mod && mod.MODULES_META) modulesMeta = mod.MODULES_META;
            } catch (metaErr) {
                console.warn('[Billing] Could not import feature-registry.js:', metaErr);
            }

            const metaMap = new Map((modulesMeta || []).map((m, idx) => [m.key, { label: m.label, order: idx }]));

            function getFeatureInfo(key) {
                if (metaMap.has(key)) {
                    return metaMap.get(key);
                }
                const label = key
                    .split('_')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
                return { label, order: 999 };
            }

            // 1. Fetch all distinct feature keys across plan_features (master catalog)
            // 2. Fetch feature keys for the current plan_id
            const [allRes, planRes] = await Promise.all([
                supabase.from('plan_features').select('feature_key'),
                supabase.from('plan_features').select('feature_key').eq('plan_id', planId)
            ]);

            if (allRes.error) {
                console.error('[Billing] Error fetching plan_features catalog:', allRes.error);
            }
            if (planRes.error) {
                console.error('[Billing] Error fetching plan-specific features:', planRes.error);
            }

            const allFeatureKeys = [...new Set((allRes.data || []).map(r => r.feature_key).filter(Boolean))];
            const includedKeySet = new Set((planRes.data || []).map(r => r.feature_key).filter(Boolean));

            const includedKeys = allFeatureKeys.filter(k => includedKeySet.has(k));
            const notIncludedKeys = allFeatureKeys.filter(k => !includedKeySet.has(k));

            const sortFeatures = (keys) => {
                return [...keys].sort((a, b) => {
                    const orderA = getFeatureInfo(a).order;
                    const orderB = getFeatureInfo(b).order;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.localeCompare(b);
                });
            };

            state.features = {
                included: sortFeatures(includedKeys).map(k => getFeatureInfo(k).label),
                excluded: sortFeatures(notIncludedKeys).map(k => getFeatureInfo(k).label),
                loaded: true
            };

            renderPlanFeatures();
        } catch (err) {
            console.error('[Billing] Failed to load plan features:', err);
            state.features.loaded = true;
            renderPlanFeatures();
        }
    }

    async function loadActiveSubscription() {
        const urlParams = new URLSearchParams(window.location.search);
        const paramState = urlParams.get('state');
        if (paramState && validModes.includes(paramState)) {
            console.log('[Billing] Dev mode override active:', paramState);
            if (paramState === 'noplan') {
                state.features = { included: [], excluded: [], loaded: true };
                state.activeAddons = [];
                state.activeAddonIds = [];
                state.addonsLoaded = true;
                renderPlanFeatures();
                renderActiveAddons();
            }
            return;
        }

        const companyId = await resolveCompanyId();
        if (!companyId) {
            console.warn('[Billing] No active company detected. Showing empty plan state.');
            state.currentMode = 'noplan';
            state.subscriptionId = null;
            state.planId = null;
            state.features = { included: [], excluded: [], loaded: true };
            state.activeAddons = [];
            state.activeAddonIds = [];
            state.addonsLoaded = true;
            try {
                const { supabase } = await import('./lib/supabase.js');
                await loadAvailableAddonsCatalog(supabase);
            } catch (_) {}
            renderCurrentPlan();
            renderPlanFeatures();
            renderActiveAddons();
            return;
        }

        try {
            const { supabase } = await import('./lib/supabase.js');

            // 1. Fetch subscription for current company (prefer active/trial/past_due status)
            let { data: subRows, error: subErr } = await supabase
                .from('subscriptions')
                .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
                .eq('company_id', companyId)
                .in('status', ['active', 'trial', 'past_due'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (subErr) {
                console.error('[Billing] Subscription fetch error:', subErr);
            }

            // Fallback to most recent subscription row for company
            if (!subRows || subRows.length === 0) {
                const { data: recentRows, error: recentErr } = await supabase
                    .from('subscriptions')
                    .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!recentErr && recentRows && recentRows.length > 0) {
                    subRows = recentRows;
                }
            }

            // Secondary Fallback: Lookup by current user_id if company has no subscription
            if (!subRows || subRows.length === 0) {
                try {
                    const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                    const userId = ctx.user?.user_id || ctx.user?.id;
                    if (userId) {
                        const { data: userSubRows } = await supabase
                            .from('subscriptions')
                            .select('subscription_id, company_id, plan_id, billing_cycle, billing_amount, status, subscription_start_date, subscription_end_date, next_billing_at, auto_renew, plan_name, created_at')
                            .eq('user_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(1);
                        if (userSubRows && userSubRows.length > 0) {
                            subRows = userSubRows;
                        }
                    }
                } catch (_) {}
            }

            if (!subRows || subRows.length === 0) {
                console.log('[Billing] No subscription record found for company:', companyId);
                state.currentMode = 'noplan';
                state.subscriptionId = null;
                state.planId = null;
                state.features = { included: [], excluded: [], loaded: true };
                state.activeAddons = [];
                state.activeAddonIds = [];
                state.addonsLoaded = true;
                await loadAvailableAddonsCatalog(supabase);
                renderCurrentPlan();
                renderPlanFeatures();
                renderActiveAddons();
                return;
            }

            const sub = subRows[0];
            state.subscriptionId = sub.subscription_id || null;
            state.planId = sub.plan_id || null;
            let planName = sub.plan_name;

            // 2. Fetch plan_name from plans table if plan_id exists
            if (sub.plan_id) {
                const { data: planData, error: planErr } = await supabase
                    .from('plans')
                    .select('plan_name')
                    .eq('plan_id', sub.plan_id)
                    .maybeSingle();

                if (!planErr && planData?.plan_name) {
                    planName = planData.plan_name;
                }
            }

            const rawStatus = (sub.status || 'Active').trim();
            const isCancelled = rawStatus.toLowerCase() === 'cancelled';
            state.currentMode = isCancelled ? 'cancelled' : 'active';

            const rawCycle = (sub.billing_cycle || 'monthly').toLowerCase().trim();
            const cycleKey = (rawCycle === 'annual' || rawCycle === 'annually' || rawCycle === 'yearly') ? 'annual' : 'monthly';

            // Clean plan display name (e.g., "advance" -> "Advance")
            const formattedPlanName = planName
                ? planName.charAt(0).toUpperCase() + planName.slice(1)
                : 'Growth';

            state.plan = {
                name: formattedPlanName,
                cycle: cycleKey,
                price: sub.billing_amount != null ? Number(sub.billing_amount) : 0,
                startDate: formatDateDisplay(sub.subscription_start_date),
                validUntil: formatDateDisplay(sub.subscription_end_date),
                nextBillingDate: (sub.auto_renew === false || isCancelled)
                    ? 'None'
                    : (sub.next_billing_at ? formatDateDisplay(sub.next_billing_at) : 'None'),
                status: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase(),
                autoRenew: sub.auto_renew !== false
            };

            renderCurrentPlan();

            // Load features, active add-ons, and available add-ons catalog in parallel
            await Promise.all([
                loadPlanFeatures(supabase, sub.plan_id),
                loadActiveAddons(supabase, sub.subscription_id),
                loadAvailableAddonsCatalog(supabase)
            ]);

            renderBillingSummary();

            if (window.feather) feather.replace();
        } catch (err) {
            console.error('[Billing] Error loading subscription:', err);
        }
    }

    async function loadActiveSubscriptionOnce() {
        if (isSubLoading) return;
        isSubLoading = true;
        try {
            await loadActiveSubscription();
        } catch (err) {
            console.error('[Billing] Error in subscription load runner:', err);
        } finally {
            isSubLoading = false;
        }
    }

    // Intercept header population from global-auth-guard to trigger reload if needed
    const prevPopulateHeader = window.populateGlobalHeader;
    window.populateGlobalHeader = function () {
        if (typeof prevPopulateHeader === 'function') {
            try { prevPopulateHeader.apply(this, arguments); } catch (_) {}
        }
        if (!state.subscriptionId || state.currentMode === 'noplan') {
            loadActiveSubscriptionOnce();
        }
    };

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

    window.reloadActiveSubscription = loadActiveSubscriptionOnce;

    // ── Initial Render ─────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        renderAll();
        loadActiveSubscriptionOnce();
    });

    // Also execute immediately in case DOM is already parsed
    renderAll();
    loadActiveSubscriptionOnce();

})();
