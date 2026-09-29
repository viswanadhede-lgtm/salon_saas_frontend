// billing-renders.js — All render functions for the Billing page
// Part of scripts/billing/ modularization of billing-subscription.js

'use strict';

import { state, CATALOG_ADDONS } from './billing-state.js';
import { fmtCurrency, formatBillingAddress, showToast } from './billing-helpers.js';

// DOM reference object — populated by initRenders() called from the orchestrator
let dom = {};

export function initRenders(domRefs) {
    dom = domRefs;
}

// ── Modal Primitives ───────────────────────────────────────────

export function closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove('is-open');
}

export function openModal(modalEl) {
    if (modalEl) {
        modalEl.classList.add('is-open');
        if (window.feather) feather.replace();
    }
}

// ── Plan Card ─────────────────────────────────────────────────

export function renderCurrentPlan(handleRenewSubscription) {
    if (state.currentMode === 'noplan') {
        if (dom.currentPlanCard) dom.currentPlanCard.className = 'billing-plan-card billing-plan-card--noplan';
        dom.planNameBadge.textContent = 'NO ACTIVE PLAN';
        if (dom.headerPlanBadge) dom.headerPlanBadge.textContent = 'No Plan';

        dom.planStatusPill.className = 'status-pill is-unsubscribed';
        dom.planStatusText.textContent = 'Not subscribed';

        dom.planPriceBlock.innerHTML = `
            <span class="plan-price-amount">—</span>
            <span class="plan-price-frequency" style="color: var(--text-muted);">No subscription</span>
        `;

        dom.planSubNotice.style.display = 'block';
        dom.planSubNotice.textContent = 'Choose a plan to start managing your salon digital operations.';

        dom.planMetaGrid.style.display = 'none';

        dom.planActionsContainer.innerHTML = `
            <button type="button" class="btn-plain btn-plain-primary" onclick="window.location.href='plans.html'">
                <i data-feather="check-circle"></i>
                <span>Choose Plan</span>
            </button>
        `;
        if (window.feather) feather.replace();
        return;
    }

    // Active or Cancelled
    dom.planMetaGrid.style.display = 'grid';
    const planDisplayName = state.plan.name || 'Growth';
    dom.planNameBadge.textContent = planDisplayName.toLowerCase().includes('plan') ? planDisplayName : `${planDisplayName} Plan`;
    if (dom.headerPlanBadge) dom.headerPlanBadge.textContent = planDisplayName;

    const cycleLabel = (state.plan.cycle === 'annual' || state.plan.cycle === 'annually' || state.plan.cycle === 'yearly') ? '/ year' : '/ month';
    dom.planPriceBlock.innerHTML = `
        <span class="plan-price-amount">${fmtCurrency(state.plan.price)}</span>
        <span class="plan-price-frequency">${cycleLabel}</span>
    `;

    if (state.currentMode === 'cancelled' || state.plan.status?.toLowerCase() === 'cancelled') {
        if (dom.currentPlanCard) dom.currentPlanCard.className = 'billing-plan-card billing-plan-card--cancelled';
        dom.planStatusPill.className = 'status-pill is-cancelling';
        dom.planStatusText.textContent = `Cancels on ${state.plan.validUntil}`;

        dom.planSubNotice.style.display = 'block';
        dom.planSubNotice.textContent = `Your subscription remains active until ${state.plan.validUntil}.`;

        dom.metaStatus.textContent = 'Cancels at end of cycle';
        dom.metaStartDate.textContent = state.plan.startDate;
        dom.metaValidUntil.textContent = state.plan.validUntil;
        dom.metaNextBilling.textContent = 'None';

        dom.planActionsContainer.innerHTML = `
            <button type="button" class="btn-plain btn-plain-primary" id="btnReactivateSub">
                <i data-feather="refresh-cw"></i>
                <span>Reactivate Subscription</span>
            </button>
        `;

        const btnReactivate = document.getElementById('btnReactivateSub');
        if (btnReactivate) {
            btnReactivate.onclick = handleRenewSubscription;
        }
    } else {
        // State: Active
        if (dom.currentPlanCard) dom.currentPlanCard.className = 'billing-plan-card billing-plan-card--active';
        dom.planStatusPill.className = 'status-pill is-active';
        dom.planStatusText.textContent = state.plan.status || 'Active';

        dom.planSubNotice.style.display = 'block';
        dom.planSubNotice.textContent = state.plan.autoRenew === false
            ? 'Your current plan and subscription details (Auto-renew disabled)'
            : 'Your current plan and subscription details';

        dom.metaStatus.textContent = state.plan.status || 'Active';
        dom.metaStartDate.textContent = state.plan.startDate;
        dom.metaValidUntil.textContent = state.plan.validUntil;
        dom.metaNextBilling.textContent = state.plan.autoRenew === false
            ? (state.plan.nextBillingDate && state.plan.nextBillingDate !== 'None' ? `${state.plan.nextBillingDate} (No renewal)` : 'None')
            : (state.plan.nextBillingDate || '—');

        const currentPlanParam = encodeURIComponent((state.plan.name || 'growth').toLowerCase().replace(/\s+plan$/, ''));
        dom.planActionsContainer.innerHTML = `
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

// ── Active Add-ons ─────────────────────────────────────────────

export function renderActiveAddons() {
    if (state.currentMode === 'noplan' || (!state.subscriptionId && state.addonsLoaded)) {
        dom.activeAddonsCountBadge.textContent = '0 Active';
        dom.activeAddonsList.innerHTML = `
            <div class="empty-neutral-state">
                ${state.currentMode === 'noplan' ? 'No active add-ons. Choose a plan to activate add-ons.' : 'No active add-ons currently.'}
            </div>
        `;
        dom.activeAddonsTotalVal.textContent = '₹0 / month';
        if (window.feather) feather.replace();
        return;
    }

    if (!state.addonsLoaded) {
        dom.activeAddonsCountBadge.textContent = 'Loading...';
        dom.activeAddonsList.innerHTML = `
            <div style="padding: 1rem 0; color: #94a3b8; font-size: 0.9rem;">
                Loading active add-ons...
            </div>
        `;
        dom.activeAddonsTotalVal.textContent = '—';
        return;
    }

    const activeItems = state.activeAddons || [];
    dom.activeAddonsCountBadge.textContent = `${activeItems.length} Active`;

    if (activeItems.length === 0) {
        dom.activeAddonsList.innerHTML = `
            <div class="empty-neutral-state">
                No active add-ons currently.
            </div>
        `;
        dom.activeAddonsTotalVal.textContent = '₹0 / month';
        if (window.feather) feather.replace();
        return;
    }

    dom.activeAddonsList.innerHTML = activeItems.map(item => {
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
    dom.activeAddonsTotalVal.textContent = `${fmtCurrency(totalAddonPrice)} / month`;

    if (window.feather) feather.replace();
}

// ── Plan Features ──────────────────────────────────────────────

export function renderPlanFeatures() {
    dom.featuresCardSubtitle.textContent = 'Features included in your Current Plan';

    if (state.currentMode === 'noplan' || (!state.planId && state.features.loaded)) {
        dom.featuresIncludedCountBadge.textContent = '0 Included';
        dom.featuresIncludedList.innerHTML = `
            <div class="empty-neutral-state" style="padding: 1rem 0; color: #94a3b8;">
                No active plan. Choose a plan to view included features.
            </div>
        `;
        if (dom.featuresExcludedCol) dom.featuresExcludedCol.style.display = 'none';
        dom.featuresExcludedList.innerHTML = '';
        if (window.feather) feather.replace();
        return;
    }

    if (!state.features.loaded) {
        dom.featuresIncludedCountBadge.textContent = 'Loading...';
        dom.featuresIncludedList.innerHTML = `
            <div style="padding: 1rem 0; color: #94a3b8; font-size: 0.9rem;">
                Loading plan features...
            </div>
        `;
        if (dom.featuresExcludedCol) dom.featuresExcludedCol.style.display = 'none';
        dom.featuresExcludedList.innerHTML = '';
        return;
    }

    dom.featuresIncludedCountBadge.textContent = `${state.features.included.length} Included`;

    if (state.features.included.length === 0) {
        dom.featuresIncludedList.innerHTML = `
            <div class="empty-neutral-state" style="padding: 1rem 0; color: #94a3b8;">
                No features assigned to this plan.
            </div>
        `;
    } else {
        dom.featuresIncludedList.innerHTML = state.features.included.map(item => `
            <div class="feature-item">
                <span class="feature-check-icon"><i data-feather="check"></i></span>
                <span>${item}</span>
            </div>
        `).join('');
    }

    if (state.features.excluded && state.features.excluded.length > 0) {
        if (dom.featuresExcludedCol) dom.featuresExcludedCol.style.display = 'flex';
        dom.featuresExcludedList.innerHTML = state.features.excluded.map(item => `
            <div class="feature-item feature-item--excluded">
                <span class="feature-check-icon"><i data-feather="x"></i></span>
                <span>${item}</span>
            </div>
        `).join('');
    } else {
        if (dom.featuresExcludedCol) dom.featuresExcludedCol.style.display = 'none';
        dom.featuresExcludedList.innerHTML = '';
    }

    if (window.feather) feather.replace();
}

// ── Available Add-ons ──────────────────────────────────────────
// NOTE: innerHTML + event binding kept together intentionally (risk noted in analysis)

export function renderAvailableAddons(openAddAddonModal) {
    dom.availableAddonsBadge.textContent = `${CATALOG_ADDONS.length} Available`;

    dom.availableAddonsList.innerHTML = CATALOG_ADDONS.map(addon => {
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

    // Bind Add-on click interactions — must remain with innerHTML
    document.querySelectorAll('.btn-add-addon').forEach(btn => {
        btn.addEventListener('click', function () {
            if (state.currentMode === 'noplan') {
                showToast('Please select a base subscription plan first.');
                return;
            }
            const addonId = this.getAttribute('data-addon-id');
            if (typeof openAddAddonModal === 'function') openAddAddonModal(addonId);
        });
    });
}

// ── Billing Summary ────────────────────────────────────────────

export function renderBillingSummary() {
    const activeItems = state.currentMode === 'noplan' ? [] : (state.activeAddons || []);
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

    if (dom.summaryLineItems) {
        dom.summaryLineItems.innerHTML = itemsHtml;
    }

    const summaryCycleBadge = document.getElementById('summaryCycleBadge');
    if (summaryCycleBadge) {
        summaryCycleBadge.textContent = state.plan.cycle === 'annual' ? 'Annual' : 'Monthly';
    }

    const summarySubtotalLabel = document.getElementById('summarySubtotalLabel');
    if (summarySubtotalLabel) {
        summarySubtotalLabel.textContent = state.plan.cycle === 'annual' ? 'Annual Subtotal' : 'Monthly Subtotal';
    }

    const subtotal = basePlanCost + activeItems.reduce((acc, cur) => acc + (Number(cur.price) || 0), 0);

    // Live tax from billing_settings
    const taxSettings = state.taxSettings || {};
    const taxRate = (taxSettings.isActive && Number(taxSettings.taxRate) > 0) ? Number(taxSettings.taxRate) : 0;
    const taxName = taxSettings.taxName || 'GST';

    const summaryTaxRow = document.getElementById('summaryTaxRow');
    const summaryTaxLabel = document.getElementById('summaryTaxLabel');

    let taxAmount = 0;
    if (taxRate > 0) {
        taxAmount = Math.round(subtotal * (taxRate / 100));
        if (summaryTaxRow) summaryTaxRow.style.display = 'flex';
        if (summaryTaxLabel) summaryTaxLabel.textContent = `${taxName} (${taxRate}%)`;
        if (dom.summaryGst) dom.summaryGst.textContent = fmtCurrency(taxAmount);
    } else {
        if (summaryTaxRow) summaryTaxRow.style.display = 'none';
    }

    const total = subtotal + taxAmount;

    if (dom.summarySubtotal) dom.summarySubtotal.textContent = fmtCurrency(subtotal);
    if (dom.summaryTotalAmount) dom.summaryTotalAmount.textContent = fmtCurrency(total);

    if (dom.summaryBillingDateNote) {
        if (state.currentMode === 'noplan') {
            dom.summaryBillingDateNote.textContent = 'No recurring subscription active.';
        } else if (state.currentMode === 'cancelled') {
            dom.summaryBillingDateNote.textContent = `Subscription cancels on ${state.plan.validUntil}. No further renewal.`;
        } else {
            dom.summaryBillingDateNote.textContent = `Auto-renews on ${state.plan.nextBillingDate}.`;
        }
    }
}

// ── Payment Method ─────────────────────────────────────────────

export function renderPaymentMethod() {
    const visual = document.getElementById('paymentCardVisual');
    const modalVisual = document.getElementById('modalCurrentPaymentCardVisual');
    const pm = state.paymentMethod;

    let visualClass = 'payment-card-visual';
    let visualHtml = '';

    if (pm.type === 'upi') {
        if (dom.cardNetworkLabel) dom.cardNetworkLabel.textContent = 'UPI AUTOPAY';
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
        if (dom.cardNetworkLabel) dom.cardNetworkLabel.textContent = 'NET BANKING (e-NACH)';
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
        if (dom.cardNetworkLabel) dom.cardNetworkLabel.textContent = (pm.brand || 'VISA') + ' / MASTERCARD';
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
        const activeItems = state.currentMode === 'noplan' ? [] : (state.activeAddons || []);
        const basePlanCost = state.currentMode === 'noplan' ? 0 : state.plan.price;
        const subtotal = basePlanCost + activeItems.reduce((acc, cur) => acc + cur.price, 0);
        const total = subtotal + Math.round(subtotal * 0.18);
        modalCurrentAmount.textContent = `${fmtCurrency(total)} / mo`;
    }

    if (window.feather) feather.replace();
}

// ── Payment History ────────────────────────────────────────────
// NOTE: innerHTML + event binding kept together intentionally

export function renderPaymentHistory(openInvoiceModal) {
    if (!state.paymentHistory || state.paymentHistory.length === 0) {
        dom.paymentHistoryBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 32px 16px;">
                    No payment records found.
                </td>
            </tr>
        `;
        return;
    }

    dom.paymentHistoryBody.innerHTML = state.paymentHistory.map(row => {
        let statusPillClass = 'status-paid';
        const normStatus = (row.status || '').toLowerCase();
        if (normStatus === 'pending') statusPillClass = 'status-pending';
        else if (normStatus === 'failed') statusPillClass = 'status-failed';
        else if (normStatus === 'refunded') statusPillClass = 'status-refunded';
        else if (normStatus === 'expired') statusPillClass = 'status-failed';

        let planTitle = row.description || `${state.plan.name || 'Plan'} Subscription`;
        let addonSubtitle = '';
        let amount = row.amount;

        if (row.addons && row.addons.length > 0) {
            const addonsList = row.addons.map(id => CATALOG_ADDONS.find(a => a.id === id)).filter(Boolean);
            if (addonsList.length > 0) {
                addonSubtitle = `+ ${addonsList.map(a => a.name).join(', ')}`;
            }
        }

        const displayStatus = (row.status || 'Paid').charAt(0).toUpperCase() + (row.status || 'Paid').slice(1);

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
                        ${displayStatus}
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

    // Bind invoice view buttons — must remain with innerHTML
    document.querySelectorAll('.btn-view-invoice').forEach(btn => {
        btn.addEventListener('click', function () {
            const invoiceId = this.getAttribute('data-invoice-id');
            if (typeof openInvoiceModal === 'function') openInvoiceModal(invoiceId);
        });
    });
}

// ── Billing Info ───────────────────────────────────────────────

export function renderBillingInfo() {
    if (dom.infoBusinessName) dom.infoBusinessName.textContent = state.billingInfo.legalName;
    if (dom.infoGstin) dom.infoGstin.textContent = state.billingInfo.gstin;
    if (dom.infoPan) dom.infoPan.textContent = state.billingInfo.pan || '—';
    if (dom.infoBillingEmail) dom.infoBillingEmail.textContent = state.billingInfo.email;
    if (dom.infoBillingPhone) dom.infoBillingPhone.textContent = state.billingInfo.phone || '—';
    if (dom.infoBillingAddress) dom.infoBillingAddress.textContent = formatBillingAddress(state.billingInfo);
}

// ── Subscription Management Section ───────────────────────────
// NOTE: innerHTML + event binding kept together intentionally

export function renderSubscriptionManagement(openCancelSubscriptionModal, handleRenewSubscription) {
    if (state.currentMode === 'noplan') {
        if (dom.subscriptionManagementSection) dom.subscriptionManagementSection.style.display = 'none';
        return;
    }

    if (dom.subscriptionManagementSection) dom.subscriptionManagementSection.style.display = 'flex';
    const subManageTitle = document.getElementById('subManageTitle');
    const subManageDesc = document.getElementById('subManageDesc');
    const subManageActions = document.getElementById('subManageActions');

    const isScheduledCancellation = state.plan.autoRenew === false ||
                                    state.currentMode === 'cancelled' ||
                                    (state.plan.status && state.plan.status.toLowerCase() === 'cancelled');

    const planDisplayName = state.plan.name || 'Plan';
    const validUntil = state.plan.validUntil && state.plan.validUntil !== '—' ? state.plan.validUntil : 'the end of your billing cycle';

    if (isScheduledCancellation) {
        if (subManageTitle) subManageTitle.textContent = 'Subscription Management';
        if (subManageDesc) {
            subManageDesc.innerHTML = `Your subscription is scheduled for cancellation. Your <strong>${planDisplayName}</strong> remains active until <strong>${validUntil}</strong> and will not renew after that date.`;
        }
        if (subManageActions) {
            subManageActions.innerHTML = `
                <span class="status-badge-scheduled">Scheduled for Cancellation</span>
                <button type="button" class="btn-renew-sub" id="btnRenewSubscription">
                    <i data-feather="refresh-cw"></i>
                    <span>Renew Subscription</span>
                </button>
            `;
            const btnRenew = document.getElementById('btnRenewSubscription');
            if (btnRenew) {
                btnRenew.onclick = handleRenewSubscription;
            }
        }
    } else {
        if (subManageTitle) subManageTitle.textContent = 'Subscription Management';
        if (subManageDesc) {
            subManageDesc.textContent = 'Manage your subscription or cancel your plan.';
        }
        if (subManageActions) {
            subManageActions.innerHTML = `
                <button type="button" class="btn-cancel-plain" id="btnTriggerCancelModal">
                    Cancel Subscription
                </button>
            `;
            const btnCancel = document.getElementById('btnTriggerCancelModal');
            if (btnCancel) {
                btnCancel.onclick = openCancelSubscriptionModal;
            }
        }
    }

    if (window.feather) feather.replace();
}

// ── Render All ─────────────────────────────────────────────────

export function renderAll(callbacks) {
    const cb = callbacks || {};
    renderCurrentPlan(cb.handleRenewSubscription);
    renderActiveAddons();
    renderPlanFeatures();
    renderAvailableAddons(cb.openAddAddonModal);
    renderBillingSummary();
    renderPaymentMethod();
    renderPaymentHistory(cb.openInvoiceModal);
    renderBillingInfo();
    renderSubscriptionManagement(cb.openCancelSubscriptionModal, cb.handleRenewSubscription);

    // Update preview switcher pills
    const statePillsGroup = document.getElementById('statePillsGroup');
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

