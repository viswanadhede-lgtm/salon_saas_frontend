// billing-subscription.js — Thin Orchestrator (IIFE with dynamic imports)
// BharathBots Salon Management SaaS
//
// Modularized from monolith (2,513 lines) into:
//   scripts/billing/billing-state.js
//   scripts/billing/billing-helpers.js
//   scripts/billing/billing-renders.js
//   scripts/billing/billing-modal-addons.js
//   scripts/billing/billing-modal-cancel.js
//   scripts/billing/billing-modal-billing.js
//   scripts/billing/billing-modal-payment.js
//   scripts/billing/billing-modal-invoice.js
//   scripts/billing/billing-api.js
//
// NOTE: Loaded as plain <script> by billing-subscription.html (no type="module").
// All module imports are dynamic so they work in a non-module context.

(async function () {
    'use strict';

    // ── Load All Modules ───────────────────────────────────────────
    const [
        stateModule,
        helpersModule,
        rendersModule,
        modalAddonsModule,
        modalCancelModule,
        modalBillingModule,
        modalPaymentModule,
        modalInvoiceModule,
        apiModule
    ] = await Promise.all([
        import('./scripts/billing/billing-state.js'),
        import('./scripts/billing/billing-helpers.js'),
        import('./scripts/billing/billing-renders.js'),
        import('./scripts/billing/billing-modal-addons.js'),
        import('./scripts/billing/billing-modal-cancel.js'),
        import('./scripts/billing/billing-modal-billing.js'),
        import('./scripts/billing/billing-modal-payment.js'),
        import('./scripts/billing/billing-modal-invoice.js'),
        import('./scripts/billing/billing-api.js')
    ]);

    const { state, validModes } = stateModule;
    const { showToast } = helpersModule;
    const { initRenders, renderAll, closeModal } = rendersModule;
    const { initModalAddons, openAddAddonModal, bindAddAddonConfirm, bindManageAddonsEvents } = modalAddonsModule;
    const { initModalCancel, openCancelSubscriptionModal, handleRenewSubscription, bindCancelModalEvents } = modalCancelModule;
    const { initModalBilling, bindBillingInfoEvents } = modalBillingModule;
    const { initModalPayment, bindPaymentModalEvents } = modalPaymentModule;
    const { initModalInvoice, openInvoiceModal, bindInvoiceModalEvents } = modalInvoiceModule;
    const { initApi, loadActiveSubscriptionOnce, resolveCompanyId } = apiModule;

    // ── Render Callback Bundle ─────────────────────────────────────
    const renderCallbacks = {
        openAddAddonModal,
        openInvoiceModal,
        openCancelSubscriptionModal,
        handleRenewSubscription
    };

    // ── Build Shared DOM Reference Object ──────────────────────────
    function buildDomRefs() {
        return {
            // State preview pills
            statePillsGroup: document.getElementById('statePillsGroup'),

            // Row 1: Plan & Add-ons
            currentPlanCard: document.getElementById('currentPlanCard'),
            planNameBadge: document.getElementById('planNameBadge'),
            planStatusPill: document.getElementById('planStatusPill'),
            planStatusText: document.getElementById('planStatusText'),
            planPriceBlock: document.getElementById('planPriceBlock'),
            planPriceAmount: document.getElementById('planPriceAmount'),
            planPricePeriod: document.getElementById('planPricePeriod'),
            planSubNotice: document.getElementById('planSubNotice'),
            planMetaGrid: document.getElementById('planMetaGrid'),
            metaStatus: document.getElementById('metaStatus'),
            metaStartDate: document.getElementById('metaStartDate'),
            metaValidUntil: document.getElementById('metaValidUntil'),
            metaNextBilling: document.getElementById('metaNextBilling'),
            planActionsContainer: document.getElementById('planActionsContainer'),

            activeAddonsList: document.getElementById('activeAddonsList'),
            activeAddonsCountBadge: document.getElementById('activeAddonsCountBadge'),
            activeAddonsTotalVal: document.getElementById('activeAddonsTotalVal'),

            // Row 2: Features & Available
            featuresCardSubtitle: document.getElementById('featuresCardSubtitle'),
            featuresIncludedCountBadge: document.getElementById('featuresIncludedCountBadge'),
            featuresIncludedList: document.getElementById('featuresIncludedList'),
            featuresExcludedList: document.getElementById('featuresExcludedList'),
            featuresExcludedCol: document.getElementById('featuresExcludedCol'),
            availableAddonsList: document.getElementById('availableAddonsList'),
            availableAddonsBadge: document.getElementById('availableAddonsBadge'),

            // Row 3: Payment Method & Summary
            cardMaskDisplay: document.getElementById('cardMaskDisplay'),
            cardHolderDisplay: document.getElementById('cardHolderDisplay'),
            cardExpiryDisplay: document.getElementById('cardExpiryDisplay'),
            cardNetworkLabel: document.getElementById('cardNetworkLabel'),

            summaryLineItems: document.getElementById('summaryLineItems'),
            summarySubtotal: document.getElementById('summarySubtotal'),
            summaryGst: document.getElementById('summaryGst'),
            summaryTotalAmount: document.getElementById('summaryTotalAmount'),
            summaryBillingDateNote: document.getElementById('summaryBillingDateNote'),

            // Row 4: History
            paymentHistoryBody: document.getElementById('paymentHistoryBody'),

            // Row 5: Billing Info
            infoBusinessName: document.getElementById('infoBusinessName'),
            infoGstin: document.getElementById('infoGstin'),
            infoPan: document.getElementById('infoPan'),
            infoBillingEmail: document.getElementById('infoBillingEmail'),
            infoBillingPhone: document.getElementById('infoBillingPhone'),
            infoBillingAddress: document.getElementById('infoBillingAddress'),

            // Bottom
            subscriptionManagementSection: document.getElementById('subscriptionManagementSection'),

            // Header badge
            headerPlanBadge: document.getElementById('headerPlanBadge'),

            // Modal: Add Add-on
            modalAddAddon: document.getElementById('modalAddAddon'),
            addAddonModalTitle: document.getElementById('addAddonModalTitle'),
            addAddonModalPrice: document.getElementById('addAddonModalPrice'),
            addAddonModalDesc: document.getElementById('addAddonModalDesc'),
            btnConfirmAddAddon: document.getElementById('btnConfirmAddAddon'),

            // Modal: Manage Add-ons
            modalManageAddons: document.getElementById('modalManageAddons'),
            modalManageAddonsList: document.getElementById('modalManageAddonsList'),
            modalManageAddonsSummary: document.getElementById('modalManageAddonsSummary'),
            btnCancelManageAddons: document.getElementById('btnCancelManageAddons'),
            btnSaveManageAddons: document.getElementById('btnSaveManageAddons'),
            btnCloseManageAddons: document.getElementById('btnCloseManageAddons'),

            // Modal: Cancel Subscription
            modalCancelSub: document.getElementById('modalCancelSub'),
            cancelModalSubtitle: document.getElementById('cancelModalSubtitle'),
            cancelInfoActiveDate: document.getElementById('cancelInfoActiveDate'),
            btnConfirmCancelSubscription: document.getElementById('btnConfirmCancelSubscription'),
            cancelReasonGroup: document.getElementById('cancelReasonGroup'),
            cancelOtherFeedback: document.getElementById('cancelOtherFeedback'),
            cancelOtherTextarea: document.getElementById('cancelOtherTextarea'),

            // Modal: Edit Billing Info
            modalEditBilling: document.getElementById('modalEditBilling'),
            inputLegalName: document.getElementById('inputLegalName'),
            inputGstin: document.getElementById('inputGstin'),
            inputPan: document.getElementById('inputPan'),
            inputBillingEmail: document.getElementById('inputBillingEmail'),
            inputBillingPhone: document.getElementById('inputBillingPhone'),
            inputAddressLine1: document.getElementById('inputAddressLine1'),
            inputAddressLine2: document.getElementById('inputAddressLine2'),
            inputCity: document.getElementById('inputCity'),
            inputDistrict: document.getElementById('inputDistrict'),
            inputState: document.getElementById('inputState'),
            inputPincode: document.getElementById('inputPincode'),
            inputCountry: document.getElementById('inputCountry'),
            btnSaveBillingInfo: document.getElementById('btnSaveBillingInfo'),

            // Modal: Change Payment Method
            modalChangePayment: document.getElementById('modalChangePayment'),
            inputCardHolder: document.getElementById('inputCardHolder'),
            inputCardNumber: document.getElementById('inputCardNumber'),
            inputCardExpiry: document.getElementById('inputCardExpiry'),
            inputCardCvv: document.getElementById('inputCardCvv'),
            inputCardBrandBadge: document.getElementById('inputCardBrandBadge'),
            paymentMethodTabs: document.getElementById('paymentMethodTabs'),
            inputUpiId: document.getElementById('inputUpiId'),
            upiAppGrid: document.getElementById('upiAppGrid'),
            upiHandlesRow: document.getElementById('upiHandlesRow'),
            bankSelectorGrid: document.getElementById('bankSelectorGrid'),
            selectOtherBank: document.getElementById('selectOtherBank'),
            btnSavePaymentMethod: document.getElementById('btnSavePaymentMethod'),

            // Modal: View Invoice
            modalViewInvoice: document.getElementById('modalViewInvoice'),
            invoiceModalTitle: document.getElementById('invoiceModalTitle'),
            invoiceModalBody: document.getElementById('invoiceModalBody'),
            btnDownloadInvoicePdf: document.getElementById('btnDownloadInvoicePdf')
        };
    }

    // ── Main Init Function ─────────────────────────────────────────
    let _initialized = false;

    function init() {
        // Guard against double-invocation from both DOMContentLoaded and immediate call
        if (_initialized) return;
        _initialized = true;

        const dom = buildDomRefs();

        // Inject DOM refs into each module
        initRenders(dom);
        initModalAddons(dom);
        initModalCancel(dom);
        initModalBilling(dom, resolveCompanyId);
        initModalPayment(dom);
        initModalInvoice(dom);
        initApi(renderCallbacks);

        // Bind all static event listeners
        bindAddAddonConfirm();
        bindManageAddonsEvents();
        bindCancelModalEvents();
        bindBillingInfoEvents();
        bindPaymentModalEvents();
        bindInvoiceModalEvents();

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

        // State preview pill switcher
        const statePillsGroup = document.getElementById('statePillsGroup');
        if (statePillsGroup) {
            statePillsGroup.querySelectorAll('.state-pill-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const mode = this.getAttribute('data-state');
                    if (validModes.includes(mode)) {
                        state.currentMode = mode;
                        renderAll(renderCallbacks);
                        showToast(`Billing preview switched to: ${mode}`);
                    }
                });
            });
        }

        // Initial render + subscription load
        renderAll(renderCallbacks);
        loadActiveSubscriptionOnce();
    }

    // ── Developer Preview Helper ───────────────────────────────────

    window.setBillingState = function (mode) {
        if (validModes.includes(mode)) {
            state.currentMode = mode;
            renderAll(renderCallbacks);
            showToast(`Billing preview switched to: ${mode}`);
        } else {
            console.warn(`[Billing] Unknown mode: "${mode}". Valid modes: ${validModes.join(', ')}`);
        }
    };

    window.reloadActiveSubscription = loadActiveSubscriptionOnce;

    // ── populateGlobalHeader Monkey Patch ──────────────────────────
    // Chains original function and triggers subscription reload if needed.
    // This must be set up immediately (before DOMContentLoaded) so the
    // auth-guard call is intercepted whenever it fires.

    const prevPopulateHeader = window.populateGlobalHeader;
    window.populateGlobalHeader = function () {
        if (typeof prevPopulateHeader === 'function') {
            try { prevPopulateHeader.apply(this, arguments); } catch (_) {}
        }
        if (!state.subscriptionId || state.currentMode === 'noplan') {
            loadActiveSubscriptionOnce();
        }
    };

    // ── Double-init Safety Pattern ─────────────────────────────────
    // Preserved from original: runs on DOMContentLoaded AND immediately.
    // The _initialized guard ensures init() logic runs exactly once.

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

