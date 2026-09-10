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
            cardMask: '•••• •••• •••• 4242',
            holder: 'Admin User',
            expiry: '09 / 2028',
            network: 'VISA / MASTERCARD'
        },
        billingInfo: {
            legalName: 'BharathBots Technologies',
            gstin: '37AAAAA0000A1Z5',
            email: 'billing@example.com',
            address: 'Machilipatnam, Andhra Pradesh, India'
        },
        paymentHistory: [
            {
                id: 'INV-2026-09',
                date: '10 Sep 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'UPI',
                status: 'Paid'
            },
            {
                id: 'INV-2026-08',
                date: '10 Aug 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'Card',
                status: 'Paid'
            },
            {
                id: 'INV-2026-07',
                date: '10 Jul 2026',
                description: 'Growth Plan + Add-on',
                amount: 5498,
                method: 'Card',
                status: 'Paid'
            },
            {
                id: 'INV-2026-06',
                date: '10 Jun 2026',
                description: 'Growth Plan',
                amount: 4999,
                method: 'Card',
                status: 'Refunded'
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
        cardMaskDisplay.textContent = state.paymentMethod.cardMask;
        cardHolderDisplay.textContent = state.paymentMethod.holder;
        cardExpiryDisplay.textContent = state.paymentMethod.expiry;
        cardNetworkLabel.textContent = state.paymentMethod.network;
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

    // Modal 5: Change Payment Method
    const btnChangePaymentMethod = document.getElementById('btnChangePaymentMethod');
    if (btnChangePaymentMethod) {
        btnChangePaymentMethod.addEventListener('click', function () {
            inputCardHolder.value = state.paymentMethod.holder;
            inputCardNumber.value = '';
            inputCardExpiry.value = state.paymentMethod.expiry.replace(/\s+/g, '');
            openModal(modalChangePayment);
        });
    }

    if (btnSavePaymentMethod) {
        btnSavePaymentMethod.addEventListener('click', function () {
            const rawCard = inputCardNumber.value.trim();
            const holder = inputCardHolder.value.trim() || 'Admin User';
            const expiry = inputCardExpiry.value.trim() || '09 / 2028';

            let mask = state.paymentMethod.cardMask;
            if (rawCard.length >= 4) {
                mask = `•••• •••• •••• ${rawCard.slice(-4)}`;
            }

            state.paymentMethod.holder = holder;
            state.paymentMethod.cardMask = mask;
            state.paymentMethod.expiry = expiry;

            closeModal(modalChangePayment);
            renderPaymentMethod();
            showToast('Payment method updated.');
        });
    }

    // Modal 6: View Invoice Preview
    function openInvoiceModal(invoiceId) {
        const item = state.paymentHistory.find(h => h.id === invoiceId) || state.paymentHistory[0];
        invoiceModalTitle.textContent = `Invoice #${item.id}`;

        const baseAmount = item.amount;
        const subtotal = Math.round(baseAmount / 1.18);
        const gst = baseAmount - subtotal;

        invoiceModalBody.innerHTML = `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
                <div>
                    <p style="margin: 0; font-weight: 700; color: var(--text-primary);">${state.billingInfo.legalName}</p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">GSTIN: ${state.billingInfo.gstin}</p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">${state.billingInfo.address}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">Date: <strong>${item.date}</strong></p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">Payment: <strong>${item.method}</strong></p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">Status: <strong>${item.status}</strong></p>
                </div>
            </div>

            <table class="plain-table" style="margin-top: 0.5rem;">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style="text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${item.description}</td>
                        <td style="text-align: right; font-weight: 600;">${fmtCurrency(subtotal)}</td>
                    </tr>
                    <tr>
                        <td>Integrated GST (18%)</td>
                        <td style="text-align: right; font-weight: 600;">${fmtCurrency(gst)}</td>
                    </tr>
                    <tr style="border-top: 2px solid var(--border-strong);">
                        <td style="font-weight: 700;">Total Paid</td>
                        <td style="text-align: right; font-weight: 800; font-size: 1rem;">${fmtCurrency(item.amount)}</td>
                    </tr>
                </tbody>
            </table>
        `;

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
