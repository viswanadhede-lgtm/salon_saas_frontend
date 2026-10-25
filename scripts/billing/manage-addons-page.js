// manage-addons-page.js — Controller for Dedicated 3-Column Manage Add-ons Page
// Features: Catalog browsing, live change tracking, dynamic payment vs. DB update handling

'use strict';

import { supabase } from '../../lib/supabase.js';
import { fmtCurrency, showToast, getCompanyId, getAddonVisualMeta } from './billing-helpers.js';

// ── State ──────────────────────────────────────────────────────
const pageState = {
    companyId: null,
    plan: {
        id: null,
        name: 'Pro Plan',
        price: 0,
        cycle: 'monthly'
    },
    catalogAddons: [],
    activeAddons: [],              // [{ id, subAddonId, name, price, status, startedAt, endedAt }]
    initialActiveAddonIds: [],     // non-cancelling active IDs at load time
    initialCancellingAddonIds: [], // cancelling IDs at load time
    localSelectedAddonIds: [],     // currently checked addon IDs
    pendingAddonForCheckout: null,
    currentSelectedCycle: 'monthly',
    isSaving: false
};

// ── DOM References ─────────────────────────────────────────────
const dom = {};

function cacheDom() {
    dom.availableAddonsList = document.getElementById('pageManageAddonsList');
    dom.availableCountBadge = document.getElementById('pageAvailableCountBadge');
    dom.changesContainer = document.getElementById('pageManageAddonsChanges');
    dom.summaryContainer = document.getElementById('pageManageAddonsSummary');
    dom.btnPageAction = document.getElementById('btnPageAction');
    dom.pageActionBtnText = document.getElementById('pageActionBtnText');

    // Add Add-on Modal (for duration selection & Razorpay checkout)
    dom.modalAddAddon = document.getElementById('modalAddAddon');
    dom.addAddonModalTitle = document.getElementById('addAddonModalTitle');
    dom.addAddonModalPrice = document.getElementById('addAddonModalPrice');
    dom.addAddonModalDesc = document.getElementById('addAddonModalDesc');
    dom.btnConfirmAddAddon = document.getElementById('btnConfirmAddAddon');
    dom.pillMonthly = document.getElementById('pillDurationMonthly');
    dom.pillYearly = document.getElementById('pillDurationYearly');
    dom.monthlyPriceText = document.getElementById('addonMonthlyPriceText');
    dom.yearlyPriceText = document.getElementById('addonYearlyPriceText');
}

// ── Helper ─────────────────────────────────────────────────────
function calcTotal(ids) {
    return (ids || []).reduce((acc, id) => {
        const item = pageState.catalogAddons.find(a => a.id === id) ||
                     pageState.activeAddons.find(a => a.id === id);
        return acc + (item ? (Number(item.price) || 0) : 0);
    }, 0);
}

// ── Data Loaders ───────────────────────────────────────────────
async function loadPageData() {
    pageState.companyId = getCompanyId();
    if (!pageState.companyId) {
        showToast('Company ID not found. Please log in again.', 'error');
        return;
    }

    try {
        // 1. Fetch Subscription Info
        const { data: subData } = await supabase
            .from('subscriptions')
            .select('id, plan_id, status, billing_cycle, current_period_end')
            .eq('company_id', pageState.companyId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (subData && subData.length > 0) {
            const sub = subData[0];
            pageState.plan.id = sub.plan_id;
            pageState.plan.cycle = sub.billing_cycle || 'monthly';

            if (sub.plan_id) {
                const { data: pData } = await supabase
                    .from('plans')
                    .select('name, price_monthly, price_yearly')
                    .eq('id', sub.plan_id)
                    .limit(1);

                if (pData && pData[0]) {
                    pageState.plan.name = pData[0].name || 'Current Plan';
                    pageState.plan.price = sub.billing_cycle === 'yearly'
                        ? (pData[0].price_yearly || 0)
                        : (pData[0].price_monthly || 0);
                }
            }
        }

        // 2. Fetch Active Add-ons
        const { data: addOnsData, error: addOnsErr } = await supabase
            .from('subscription_add_ons')
            .select('id, addon_id, addon_name, price, status, started_at, ended_at')
            .eq('company_id', pageState.companyId)
            .in('status', ['active', 'cancelling']);

        const now = Date.now();
        const validRows = (addOnsData || []).filter(row => {
            const st = (row.status || '').toLowerCase();
            if (st === 'cancelled' || st === 'superseded') return false;
            if (row.ended_at && new Date(row.ended_at).getTime() < now) return false;
            return true;
        });

        pageState.activeAddons = validRows.map(row => {
            const displayName = row.addon_name ? (row.addon_name.charAt(0).toUpperCase() + row.addon_name.slice(1)) : 'Add-on';
            const visual = getAddonVisualMeta(displayName);
            const isCancelling = (row.status || '').toLowerCase() === 'cancelling';
            return {
                id: row.addon_id,
                subAddonId: row.id,
                name: displayName,
                price: Number(row.price) || 0,
                status: isCancelling ? 'cancelling' : 'active',
                startedAt: row.started_at,
                endedAt: row.ended_at,
                icon: visual.icon,
                theme: visual.theme
            };
        });

        // 3. Fetch Catalog Add-ons
        let { data: catData } = await supabase
            .from('add_ons')
            .select('*')
            .eq('status', 'active');

        if (!catData || catData.length === 0) {
            const fallbackRes = await supabase.from('add_ons').select('*');
            if (fallbackRes.data && fallbackRes.data.length > 0) catData = fallbackRes.data;
        }

        let dynamicList = (catData || []).map(item => {
            const rawName = item.name || 'Add-on';
            const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            const visual = getAddonVisualMeta(rawName + ' ' + (item.description || ''));
            return {
                id: item.addon_id || item.id,
                name: displayName,
                desc: item.description || 'Premium software add-on feature.',
                price: Number(item.price_monthly) || Number(item.price) || 0,
                priceMonthly: Number(item.price_monthly) || Number(item.price) || 0,
                priceYearly: Number(item.price_yearly) || (Number(item.price_monthly || item.price || 0) * 10),
                icon: visual.icon,
                theme: visual.theme
            };
        });

        // Merge active add-ons into catalog so none are missing
        pageState.activeAddons.forEach(activeItem => {
            const exists = dynamicList.find(a => a.id === activeItem.id);
            if (exists) {
                if (activeItem.price != null) exists.price = activeItem.price;
            } else {
                dynamicList.unshift({
                    id: activeItem.id,
                    name: activeItem.name,
                    desc: 'Active feature add-on in your subscription.',
                    price: activeItem.price,
                    priceMonthly: activeItem.price,
                    priceYearly: activeItem.price * 10,
                    icon: activeItem.icon,
                    theme: activeItem.theme
                });
            }
        });

        pageState.catalogAddons = dynamicList;

        // Snapshot states
        pageState.initialActiveAddonIds = pageState.activeAddons
            .filter(a => a.status === 'active')
            .map(a => a.id);

        pageState.initialCancellingAddonIds = pageState.activeAddons
            .filter(a => a.status === 'cancelling')
            .map(a => a.id);

        // Initially select active ones
        pageState.localSelectedAddonIds = [...pageState.initialActiveAddonIds];

        // Render UI
        renderAvailableCatalog();
        updateChangesAndSummary();

        if (window.feather) window.feather.replace();

    } catch (err) {
        console.error('[ManageAddons] Error loading page data:', err);
        showToast('Error loading add-ons data. Please refresh.', 'error');
    }
}

// ── Column 1: Render Catalog List ──────────────────────────────
function renderAvailableCatalog() {
    if (!dom.availableAddonsList) return;

    if (dom.availableCountBadge) {
        dom.availableCountBadge.textContent = `${pageState.catalogAddons.length} available`;
    }

    if (!pageState.catalogAddons || pageState.catalogAddons.length === 0) {
        dom.availableAddonsList.innerHTML = `
            <div style="padding: 3rem 1rem; text-align: center; color: #94a3b8;">
                No add-ons currently available in the catalog.
            </div>
        `;
        return;
    }

    dom.availableAddonsList.innerHTML = pageState.catalogAddons.map(addon => {
        const isSelected = pageState.localSelectedAddonIds.includes(addon.id);
        const isOriginallyActive = pageState.initialActiveAddonIds.includes(addon.id);
        const isOriginallyCancelling = pageState.initialCancellingAddonIds.includes(addon.id);

        let statusBadge = '';
        if (isOriginallyActive) {
            statusBadge = '<span class="page-addon-status-badge status-badge--active">Active</span>';
        } else if (isOriginallyCancelling) {
            statusBadge = '<span class="page-addon-status-badge status-badge--cancelling">Cancelling</span>';
        } else {
            statusBadge = '<span class="page-addon-status-badge status-badge--new">Available</span>';
        }

        const safeId = 'chk_paddon_' + String(addon.id).replace(/[^a-zA-Z0-9_-]/g, '_');

        return `
            <div class="page-addon-card ${isSelected ? 'is-selected' : ''}" data-addon-id="${addon.id}">
                <div class="page-addon-card-check">
                    <input type="checkbox" class="page-addon-checkbox" id="${safeId}" ${isSelected ? 'checked' : ''} data-addon-id="${addon.id}">
                </div>
                <div class="page-addon-card-content">
                    <div class="page-addon-card-top">
                        <label for="${safeId}" class="page-addon-card-title">${addon.name}</label>
                        ${statusBadge}
                    </div>
                    <p class="page-addon-card-desc">${addon.desc || ''}</p>
                    <div class="page-addon-card-pricing">
                        <span class="page-addon-price-val">${fmtCurrency(addon.price)}</span>
                        <span class="page-addon-price-cycle">/ month</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Attach card click handlers
    dom.availableAddonsList.querySelectorAll('.page-addon-card').forEach(cardEl => {
        const addonId = cardEl.getAttribute('data-addon-id');
        const checkbox = cardEl.querySelector('.page-addon-checkbox');

        cardEl.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target.tagName !== 'LABEL') {
                checkbox.checked = !checkbox.checked;
                toggleAddon(addonId, checkbox.checked);
            }
        });

        checkbox.addEventListener('change', () => {
            toggleAddon(addonId, checkbox.checked);
        });
    });
}

function toggleAddon(addonId, isChecked) {
    if (isChecked) {
        if (!pageState.localSelectedAddonIds.includes(addonId)) {
            pageState.localSelectedAddonIds.push(addonId);
        }
    } else {
        pageState.localSelectedAddonIds = pageState.localSelectedAddonIds.filter(id => id !== addonId);
    }

    // Update card styling
    const card = dom.availableAddonsList.querySelector(`.page-addon-card[data-addon-id="${addonId}"]`);
    if (card) {
        const chk = card.querySelector('.page-addon-checkbox');
        if (chk) chk.checked = isChecked;
        if (isChecked) {
            card.classList.add('is-selected');
        } else {
            card.classList.remove('is-selected');
        }
    }

    updateChangesAndSummary();
}

// ── Column 2 & 3: Live Calculations & Rendering ────────────────
function updateChangesAndSummary() {
    // Classify changes
    const addedIds = pageState.localSelectedAddonIds.filter(id => !pageState.initialActiveAddonIds.includes(id));
    const reactivatingIds = addedIds.filter(id => pageState.initialCancellingAddonIds.includes(id));
    const brandNewAddedIds = addedIds.filter(id => !reactivatingIds.includes(id));
    const removedIds = pageState.initialActiveAddonIds.filter(id => !pageState.localSelectedAddonIds.includes(id));

    // Resolve objects
    const brandNewAddons = brandNewAddedIds.map(id => pageState.catalogAddons.find(a => a.id === id)).filter(Boolean);
    const reactivatingAddons = reactivatingIds.map(id => pageState.catalogAddons.find(a => a.id === id)).filter(Boolean);
    const removedAddons = removedIds.map(id => pageState.catalogAddons.find(a => a.id === id) || pageState.activeAddons.find(a => a.id === id)).filter(Boolean);

    // Totals
    const currentAddonsTotal = calcTotal(pageState.initialActiveAddonIds);
    const newAddonsTotal = calcTotal(pageState.localSelectedAddonIds);
    const netRecurringDiff = newAddonsTotal - currentAddonsTotal;

    // Upfront payment due today: sum of brand-new add-ons
    const dueToday = brandNewAddons.reduce((acc, a) => acc + (Number(a.price) || 0), 0);

    // ── Render Column 2 (Changes) ──────────────────────────────
    if (dom.changesContainer) {
        let additionsHtml = '';
        if (brandNewAddons.length > 0 || reactivatingAddons.length > 0) {
            additionsHtml = [
                ...brandNewAddons.map(a => `
                    <div class="changes-item-row">
                        <span class="name">${a.name}</span>
                        <span class="price--add">+${fmtCurrency(a.price)}/mo</span>
                    </div>
                `),
                ...reactivatingAddons.map(a => `
                    <div class="changes-item-row">
                        <span class="name">${a.name} (Restore)</span>
                        <span class="price--add">+${fmtCurrency(a.price)}/mo</span>
                    </div>
                `)
            ].join('');

            if (brandNewAddons.length > 0) {
                additionsHtml += `
                    <div class="changes-note">
                        <i data-feather="info" style="width: 13px; height: 13px; color: #0284c7;"></i>
                        <span>Payment required for new add-ons. Activates immediately.</span>
                    </div>
                `;
            }
            if (reactivatingAddons.length > 0 && brandNewAddons.length === 0) {
                additionsHtml += `
                    <div class="changes-note">
                        <i data-feather="check-circle" style="width: 13px; height: 13px; color: #16a34a;"></i>
                        <span>Restores auto-renewal without upfront charge.</span>
                    </div>
                `;
            }
        } else {
            additionsHtml = '<div class="changes-empty-notice">— No new add-ons selected</div>';
        }

        let removalsHtml = '';
        if (removedAddons.length > 0) {
            removalsHtml = removedAddons.map(a => `
                <div class="changes-item-row">
                    <span class="name">${a.name}</span>
                    <span class="price--remove">-${fmtCurrency(a.price)}/mo</span>
                </div>
            `).join('');

            removalsHtml += `
                <div class="changes-note">
                    <i data-feather="clock" style="width: 13px; height: 13px; color: #b45309;"></i>
                    <span>Access stays active until current billing cycle ends.</span>
                </div>
            `;
        } else {
            removalsHtml = '<div class="changes-empty-notice">— No add-ons scheduled for cancellation</div>';
        }

        dom.changesContainer.innerHTML = `
            <!-- Card 1: Additions -->
            <div class="changes-card changes-card--additions ${(brandNewAddons.length > 0 || reactivatingAddons.length > 0) ? 'is-active' : ''}">
                <div class="changes-card-header">
                    <span class="changes-card-title">NEW ADDITIONS</span>
                    ${(brandNewAddons.length + reactivatingAddons.length) > 0 ? `<span class="changes-card-badge status-badge--active">+${brandNewAddons.length + reactivatingAddons.length}</span>` : ''}
                </div>
                ${additionsHtml}
            </div>

            <!-- Card 2: Removals -->
            <div class="changes-card changes-card--removals ${removedAddons.length > 0 ? 'is-active' : ''}">
                <div class="changes-card-header">
                    <span class="changes-card-title">SCHEDULED REMOVALS</span>
                    ${removedAddons.length > 0 ? `<span class="changes-card-badge status-badge--cancelling">-${removedAddons.length}</span>` : ''}
                </div>
                ${removalsHtml}
            </div>
        `;
    }

    // ── Render Column 3 (Billing Summary & Actions) ────────────
    if (dom.summaryContainer) {
        dom.summaryContainer.innerHTML = `
            <!-- Current Subscription -->
            <div class="summary-block">
                <div class="summary-block-header">
                    <span class="summary-block-title">CURRENT SUBSCRIPTION</span>
                    <span class="col-badge" style="background:#f1f5f9; color:#475569;">${pageState.initialActiveAddonIds.length} Active Add-ons</span>
                </div>
                <div class="summary-line-row">
                    <span>Base Plan (${pageState.plan.name})</span>
                    <span>${fmtCurrency(pageState.plan.price)}</span>
                </div>
                <div class="summary-line-row">
                    <span>Active Add-ons</span>
                    <span>${fmtCurrency(currentAddonsTotal)}</span>
                </div>
                <div class="summary-line-row is-total">
                    <span>Current Monthly Total</span>
                    <span>${fmtCurrency(pageState.plan.price + currentAddonsTotal)} / mo</span>
                </div>
            </div>

            <!-- Revised Recurring Total -->
            <div class="summary-block">
                <div class="summary-block-header">
                    <span class="summary-block-title">REVISED RECURRING TOTAL</span>
                    <span class="summary-net-pill ${netRecurringDiff > 0 ? 'summary-net-pill--add' : (netRecurringDiff < 0 ? 'summary-net-pill--remove' : '')}">
                        ${netRecurringDiff > 0 ? `+${fmtCurrency(netRecurringDiff)}/mo` : (netRecurringDiff < 0 ? `-${fmtCurrency(Math.abs(netRecurringDiff))}/mo` : 'No change')}
                    </span>
                </div>
                <div class="summary-line-row">
                    <span>Selected Add-ons Total</span>
                    <span>${fmtCurrency(newAddonsTotal)} / mo</span>
                </div>
                <div class="summary-line-row is-total">
                    <span>New Monthly Recurring</span>
                    <span style="color: var(--primary, #0ea5e9); font-size: 1.05rem;">${fmtCurrency(pageState.plan.price + newAddonsTotal)} / mo</span>
                </div>
            </div>

            <!-- Amount Due Today Highlight Box -->
            <div class="summary-due-box ${dueToday > 0 ? 'is-payable' : ''}">
                <span class="summary-due-label">AMOUNT DUE TODAY</span>
                <div class="summary-due-amount-wrap">
                    <span class="summary-due-amount">${fmtCurrency(dueToday)}</span>
                </div>
                <span class="summary-due-subtext">
                    ${dueToday > 0 ? 'Billed now via Razorpay secure checkout.' : 'No upfront payment required today.'}
                </span>
            </div>

            <!-- Action CTA Button -->
            <button type="button" id="btnPageAction" class="btn-page-action">
                <span id="pageActionBtnText">Action</span>
            </button>

            <div class="trust-badge-row">
                <i data-feather="shield"></i>
                <span>Secure SSL checkout • Instant activation</span>
            </div>
        `;

        // Cache action button
        dom.btnPageAction = document.getElementById('btnPageAction');
        dom.pageActionBtnText = document.getElementById('pageActionBtnText');

        // Configure Action Button state & behavior
        if (brandNewAddons.length > 0) {
            // Priority 1: User added new add-on(s) -> Payment required!
            dom.btnPageAction.className = 'btn-page-action btn-page-action--payment';
            dom.btnPageAction.disabled = false;
            dom.pageActionBtnText.innerHTML = `<i data-feather="credit-card" style="width:16px;height:16px;"></i> Proceed to Payment (${fmtCurrency(dueToday)})`;

            dom.btnPageAction.onclick = () => {
                // If single new add-on, trigger duration modal for it
                const targetAddon = brandNewAddons[0];
                openAddAddonDurationModal(targetAddon);
            };

        } else if (removedAddons.length > 0 || reactivatingAddons.length > 0) {
            // Priority 2: Only cancellations or reactivations -> Direct Supabase DB update (No charge)
            dom.btnPageAction.className = 'btn-page-action btn-page-action--save';
            dom.btnPageAction.disabled = false;
            dom.pageActionBtnText.innerHTML = `<i data-feather="check" style="width:16px;height:16px;"></i> Save Changes`;

            dom.btnPageAction.onclick = () => {
                saveDatabaseChanges(removedAddons, reactivatingAddons);
            };

        } else {
            // Priority 3: No changes
            dom.btnPageAction.className = 'btn-page-action';
            dom.btnPageAction.disabled = true;
            dom.pageActionBtnText.textContent = 'No Changes to Save';
            dom.btnPageAction.onclick = null;
        }
    }

    if (window.feather) window.feather.replace();
}

// ── Action 1: Save DB Changes (Cancellations & Reactivations) ───
async function saveDatabaseChanges(removedAddons, reactivatingAddons) {
    if (pageState.isSaving) return;
    pageState.isSaving = true;

    const originalHtml = dom.pageActionBtnText.innerHTML;
    dom.btnPageAction.disabled = true;
    dom.pageActionBtnText.textContent = 'Saving changes...';

    try {
        const companyId = pageState.companyId;

        // 1. Mark unselected active add-ons as 'cancelling'
        for (const addon of removedAddons) {
            const { error: updErr } = await supabase
                .from('subscription_add_ons')
                .update({
                    status: 'cancelling',
                    updated_at: new Date().toISOString()
                })
                .eq('company_id', companyId)
                .eq('addon_id', addon.id)
                .eq('status', 'active');

            if (updErr) throw new Error(updErr.message || 'Failed to cancel add-on.');
        }

        // 2. Reactivate unexpired cancelling add-ons
        for (const addon of reactivatingAddons) {
            const { error: reactErr } = await supabase
                .from('subscription_add_ons')
                .update({
                    status: 'active',
                    updated_at: new Date().toISOString()
                })
                .eq('company_id', companyId)
                .eq('addon_id', addon.id)
                .eq('status', 'cancelling');

            if (reactErr) throw new Error(reactErr.message || 'Failed to reactivate add-on.');
        }

        if (removedAddons.length > 0 && reactivatingAddons.length === 0) {
            showToast('Add-on scheduled to cancel at end of billing cycle. Access remains active until then.', 'success');
        } else if (reactivatingAddons.length > 0 && removedAddons.length === 0) {
            showToast('Add-on auto-renewal restored successfully.', 'success');
        } else {
            showToast('Subscription add-on changes saved successfully.', 'success');
        }

        // Reload data from DB
        await loadPageData();

    } catch (err) {
        console.error('[ManageAddons] Error saving changes:', err);
        showToast(err.message || 'Failed to save changes.', 'error');
    } finally {
        pageState.isSaving = false;
        if (dom.btnPageAction) {
            dom.btnPageAction.disabled = false;
            dom.pageActionBtnText.innerHTML = originalHtml;
        }
    }
}

// ── Action 2: Add-on Purchase Flow (Modal & Razorpay) ───────────
function openAddAddonDurationModal(addon) {
    if (!addon) return;
    pageState.pendingAddonForCheckout = addon;
    pageState.currentSelectedCycle = 'monthly';

    if (dom.addAddonModalTitle) {
        dom.addAddonModalTitle.textContent = `Add ${addon.name}`;
    }

    const priceMonthly = Number(addon.priceMonthly) || Number(addon.price) || 0;
    const priceYearly = Number(addon.priceYearly) || Math.round(priceMonthly * 10);

    if (dom.monthlyPriceText) dom.monthlyPriceText.textContent = `${fmtCurrency(priceMonthly)}/mo`;
    if (dom.yearlyPriceText) dom.yearlyPriceText.textContent = `${fmtCurrency(priceYearly)}/yr`;

    function updateCycleDisplay(cycle) {
        pageState.currentSelectedCycle = cycle;
        const currentAmount = cycle === 'yearly' ? priceYearly : priceMonthly;
        const currentFreq = cycle === 'yearly' ? 'year' : 'month';

        if (dom.addAddonModalPrice) {
            dom.addAddonModalPrice.textContent = `${fmtCurrency(currentAmount)} / ${currentFreq}`;
        }
        if (dom.addAddonModalDesc) {
            dom.addAddonModalDesc.textContent = addon.desc || 'Premium feature add-on for your salon management.';
        }

        if (dom.pillMonthly && dom.pillYearly) {
            if (cycle === 'yearly') {
                dom.pillYearly.style.borderColor = 'var(--primary, #0ea5e9)';
                dom.pillYearly.style.background = 'rgba(14, 165, 233, 0.06)';
                dom.pillMonthly.style.borderColor = 'var(--border-color, #e2e8f0)';
                dom.pillMonthly.style.background = '#ffffff';
            } else {
                dom.pillMonthly.style.borderColor = 'var(--primary, #0ea5e9)';
                dom.pillMonthly.style.background = 'rgba(14, 165, 233, 0.06)';
                dom.pillYearly.style.borderColor = 'var(--border-color, #e2e8f0)';
                dom.pillYearly.style.background = '#ffffff';
            }
        }
    }

    if (dom.pillMonthly) {
        dom.pillMonthly.onclick = () => {
            const radio = dom.pillMonthly.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            updateCycleDisplay('monthly');
        };
    }
    if (dom.pillYearly) {
        dom.pillYearly.onclick = () => {
            const radio = dom.pillYearly.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            updateCycleDisplay('yearly');
        };
    }

    updateCycleDisplay('monthly');

    if (dom.btnConfirmAddAddon) {
        dom.btnConfirmAddAddon.disabled = false;
        dom.btnConfirmAddAddon.textContent = 'Proceed to Payment';
    }

    // Open duration modal
    if (dom.modalAddAddon) {
        dom.modalAddAddon.classList.add('is-open');
        dom.modalAddAddon.style.display = 'flex';
    }
}

function closeDurationModal() {
    if (dom.modalAddAddon) {
        dom.modalAddAddon.classList.remove('is-open');
        dom.modalAddAddon.style.display = 'none';
    }
}

function bindCheckoutModalEvents() {
    // Close modal handlers
    if (dom.modalAddAddon) {
        dom.modalAddAddon.querySelectorAll('[data-close-modal], .billing-modal-close').forEach(btn => {
            btn.addEventListener('click', closeDurationModal);
        });
    }

    // Confirm Payment -> Call Edge Function & open Razorpay
    if (dom.btnConfirmAddAddon) {
        dom.btnConfirmAddAddon.addEventListener('click', async function () {
            const addon = pageState.pendingAddonForCheckout;
            if (!addon) return;

            const companyId = pageState.companyId;
            if (!companyId) {
                showToast('Company ID not found. Please refresh and try again.', 'error');
                return;
            }

            let accessToken = localStorage.getItem('token') || '';
            if (!accessToken) {
                try {
                    const { data: sessData } = await supabase.auth.getSession();
                    accessToken = sessData?.session?.access_token || '';
                } catch (_) {}
            }

            if (!accessToken) {
                showToast('Your session has expired. Please sign in again.', 'error');
                return;
            }

            const originalBtnText = dom.btnConfirmAddAddon.textContent;
            dom.btnConfirmAddAddon.disabled = true;
            dom.btnConfirmAddAddon.textContent = 'Preparing checkout...';

            try {
                const SUPABASE_URL = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
                const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

                // 1. Call purchase-addon Edge Function
                const orderRes = await fetch(`${SUPABASE_URL}/functions/v1/purchase-addon`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'create_order',
                        company_id: companyId,
                        addon_id: addon.id,
                        billing_cycle: pageState.currentSelectedCycle
                    })
                });

                const orderData = await orderRes.json().catch(() => ({}));
                if (!orderRes.ok || orderData.error) {
                    throw new Error(orderData.error || 'Failed to initialize payment.');
                }

                if (!window.Razorpay) {
                    throw new Error('Razorpay SDK failed to load. Please refresh the page.');
                }

                // 2. Open Razorpay Checkout Popup
                const rzpOptions = {
                    key: orderData.key_id,
                    amount: Math.round(orderData.amount * 100),
                    currency: orderData.currency || 'INR',
                    name: 'BharathBots',
                    description: `${orderData.addon_name} (${orderData.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'})`,
                    order_id: orderData.order_id,
                    prefill: {
                        name: orderData.customer_name || '',
                        email: orderData.customer_email || '',
                        contact: orderData.customer_phone || ''
                    },
                    theme: { color: '#0ea5e9' },
                    modal: {
                        ondismiss: function () {
                            dom.btnConfirmAddAddon.disabled = false;
                            dom.btnConfirmAddAddon.textContent = originalBtnText;
                        }
                    },
                    handler: async function (paymentResp) {
                        try {
                            dom.btnConfirmAddAddon.textContent = 'Activating add-on...';

                            // 3. Verify Payment
                            const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/purchase-addon`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Authorization': `Bearer ${accessToken}`
                                },
                                body: JSON.stringify({
                                    action: 'verify_payment',
                                    company_id: companyId,
                                    order_id: paymentResp.razorpay_order_id,
                                    payment_id: paymentResp.razorpay_payment_id,
                                    signature: paymentResp.razorpay_signature
                                })
                            });

                            const verifyData = await verifyRes.json().catch(() => ({}));
                            if (!verifyRes.ok || verifyData.error) {
                                throw new Error(verifyData.error || 'Payment verification failed.');
                            }

                            closeDurationModal();
                            showToast(`Successfully added ${addon.name}!`, 'success');

                            // Reload fresh page data
                            await loadPageData();

                        } catch (vErr) {
                            console.error('[ManageAddons] Verification error:', vErr);
                            showToast(vErr.message || 'Could not verify payment. Please contact support.', 'error');
                        } finally {
                            dom.btnConfirmAddAddon.disabled = false;
                            dom.btnConfirmAddAddon.textContent = originalBtnText;
                        }
                    }
                };

                const rzp = new window.Razorpay(rzpOptions);
                rzp.on('payment.failed', function (resp) {
                    console.error('[ManageAddons] Payment failed:', resp.error);
                    showToast(`Payment failed: ${resp.error?.description || 'Transaction declined'}`, 'error');
                    dom.btnConfirmAddAddon.disabled = false;
                    dom.btnConfirmAddAddon.textContent = originalBtnText;
                });

                rzp.open();

            } catch (err) {
                console.error('[ManageAddons] Checkout error:', err);
                showToast(err.message || 'Checkout failed. Please try again.', 'error');
                dom.btnConfirmAddAddon.disabled = false;
                dom.btnConfirmAddAddon.textContent = originalBtnText;
            }
        });
    }
}

// ── Main Page Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    bindCheckoutModalEvents();
    loadPageData();
});
