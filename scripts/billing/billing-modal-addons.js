// billing-modal-addons.js — Modal 1 (Add Add-on) + Modal 2 (Manage Add-ons)
// Part of scripts/billing/ modularization of billing-subscription.js
// Features 2 & 4: Add-on Purchase Checkout (Razorpay) & Management (Deactivation)

'use strict';

import { state, CATALOG_ADDONS, getAddonById, syncCatalogWithActiveAddons } from './billing-state.js';
import { fmtCurrency, showToast, getCompanyId } from './billing-helpers.js';
import { openModal, closeModal } from './billing-renders.js';
import { loadActiveSubscriptionOnce } from './billing-api.js';

// DOM references — injected via initModalAddons()
let dom = {};

export function initModalAddons(domRefs) {
    dom = domRefs;
}

// ── Modal 2: Manage Add-ons — local ephemeral state ────────────
let localSelectedAddonIds = [];
let initialActiveAddonIds = [];
let currentSelectedCycle = 'monthly';

// ── Helper ─────────────────────────────────────────────────────

export function calcAddonsTotal(addonIdList) {
    return (addonIdList || []).reduce((acc, id) => {
        const addon = getAddonById(id);
        return acc + (addon ? (Number(addon.price) || 0) : 0);
    }, 0);
}

// ── Modal 1: Add Add-on Confirmation & Purchase ────────────────

export function openAddAddonModal(addonId) {
    const addon = getAddonById(addonId);
    if (!addon) return;

    state.pendingAddonId = addonId;
    currentSelectedCycle = 'monthly';

    if (dom.addAddonModalTitle) {
        dom.addAddonModalTitle.textContent = `Add ${addon.name}`;
    }

    const priceMonthly = Number(addon.priceMonthly) || Number(addon.price) || 0;
    const priceYearly = Number(addon.priceYearly) || Math.round(priceMonthly * 10);

    const monthlyPriceEl = document.getElementById('addonMonthlyPriceText');
    const yearlyPriceEl = document.getElementById('addonYearlyPriceText');
    const pillMonthly = document.getElementById('pillDurationMonthly');
    const pillYearly = document.getElementById('pillDurationYearly');

    if (monthlyPriceEl) monthlyPriceEl.textContent = `${fmtCurrency(priceMonthly)}/mo`;
    if (yearlyPriceEl) yearlyPriceEl.textContent = `${fmtCurrency(priceYearly)}/yr`;

    function updateCycleDisplay(cycle) {
        currentSelectedCycle = cycle;
        const currentAmount = cycle === 'yearly' ? priceYearly : priceMonthly;
        const currentFreq = cycle === 'yearly' ? 'year' : 'month';

        if (dom.addAddonModalPrice) {
            dom.addAddonModalPrice.textContent = `${fmtCurrency(currentAmount)} / ${currentFreq}`;
        }
        if (dom.addAddonModalDesc) {
            dom.addAddonModalDesc.textContent = addon.desc || 'Premium feature add-on for your salon management.';
        }

        if (pillMonthly && pillYearly) {
            if (cycle === 'yearly') {
                pillYearly.style.borderColor = 'var(--primary, #0ea5e9)';
                pillYearly.style.background = 'rgba(14, 165, 233, 0.06)';
                pillMonthly.style.borderColor = 'var(--border-color, #e2e8f0)';
                pillMonthly.style.background = 'var(--card-bg, #ffffff)';
            } else {
                pillMonthly.style.borderColor = 'var(--primary, #0ea5e9)';
                pillMonthly.style.background = 'rgba(14, 165, 233, 0.06)';
                pillYearly.style.borderColor = 'var(--border-color, #e2e8f0)';
                pillYearly.style.background = 'var(--card-bg, #ffffff)';
            }
        }
    }

    // Attach cycle selector listeners
    if (pillMonthly) {
        pillMonthly.onclick = () => {
            const radio = pillMonthly.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            updateCycleDisplay('monthly');
        };
    }
    if (pillYearly) {
        pillYearly.onclick = () => {
            const radio = pillYearly.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            updateCycleDisplay('yearly');
        };
    }

    updateCycleDisplay('monthly');

    if (dom.btnConfirmAddAddon) {
        dom.btnConfirmAddAddon.disabled = false;
        dom.btnConfirmAddAddon.textContent = 'Proceed to Payment';
    }

    const closeButtons = dom.modalAddAddon.querySelectorAll('[data-close-modal], .billing-modal-close');
    closeButtons.forEach(btn => btn.disabled = false);

    openModal(dom.modalAddAddon);
}

export function bindAddAddonConfirm() {
    if (!dom.btnConfirmAddAddon) return;
    dom.btnConfirmAddAddon.addEventListener('click', async function () {
        if (!state.pendingAddonId) return;

        const addon = getAddonById(state.pendingAddonId);
        if (!addon) {
            showToast('Selected add-on not found.');
            return;
        }

        const companyId = getCompanyId();
        if (!companyId) {
            showToast('Company ID not found. Please refresh and try again.');
            return;
        }

        // Retrieve auth token
        let accessToken = localStorage.getItem('token') || '';
        if (!accessToken) {
            try {
                const { supabase } = await import('../../lib/supabase.js');
                const { data: sessData } = await supabase.auth.getSession();
                accessToken = sessData?.session?.access_token || '';
            } catch (_) {}
        }

        if (!accessToken) {
            showToast('Your session has expired. Please sign in again.');
            return;
        }

        const originalBtnText = dom.btnConfirmAddAddon.textContent;
        dom.btnConfirmAddAddon.disabled = true;
        dom.btnConfirmAddAddon.textContent = 'Preparing checkout...';

        try {
            const SUPABASE_URL = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

            // 1. Call purchase-addon Edge Function to create Razorpay Order
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
                    billing_cycle: currentSelectedCycle
                })
            });

            const orderData = await orderRes.json().catch(() => ({}));

            if (!orderRes.ok || orderData.error) {
                throw new Error(orderData.error || 'Failed to initialize payment.');
            }

            if (!window.Razorpay) {
                throw new Error('Razorpay SDK failed to load. Please check your internet connection and refresh.');
            }

            // 2. Open Razorpay Standard Checkout Popup
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
                theme: {
                    color: '#0ea5e9'
                },
                modal: {
                    ondismiss: function () {
                        dom.btnConfirmAddAddon.disabled = false;
                        dom.btnConfirmAddAddon.textContent = originalBtnText;
                    }
                },
                handler: async function (response) {
                    dom.btnConfirmAddAddon.textContent = 'Verifying payment...';
                    showToast('Payment received! Activating add-on...', 'info');

                    try {
                        // 3. Verify signature and activate add-on in DB
                        const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/purchase-addon`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${accessToken}`
                            },
                            body: JSON.stringify({
                                action: 'verify_and_activate',
                                company_id: companyId,
                                addon_id: addon.id,
                                billing_cycle: currentSelectedCycle,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        const verifyData = await verifyRes.json().catch(() => ({}));

                        if (!verifyRes.ok || verifyData.error) {
                            throw new Error(verifyData.error || 'Payment verification failed.');
                        }

                        closeModal(dom.modalAddAddon);
                        state.pendingAddonId = null;
                        showToast(`${addon.name} activated successfully!`, 'success');

                        // Refresh active add-ons and billing summary from DB
                        await loadActiveSubscriptionOnce();

                    } catch (vErr) {
                        console.error('[Billing] Add-on activation error:', vErr);
                        showToast(vErr.message || 'Could not verify payment. Please contact support.', 'error');
                    } finally {
                        dom.btnConfirmAddAddon.disabled = false;
                        dom.btnConfirmAddAddon.textContent = originalBtnText;
                    }
                }
            };

            const rzp = new window.Razorpay(rzpOptions);
            rzp.on('payment.failed', function (resp) {
                console.error('[Billing] Razorpay payment failed:', resp.error);
                showToast(`Payment failed: ${resp.error?.description || 'Transaction declined'}`, 'error');
                dom.btnConfirmAddAddon.disabled = false;
                dom.btnConfirmAddAddon.textContent = originalBtnText;
            });

            rzp.open();

        } catch (err) {
            console.error('[Billing] Add-on checkout error:', err);
            showToast(err.message || 'Checkout failed. Please try again.', 'error');
            dom.btnConfirmAddAddon.disabled = false;
            dom.btnConfirmAddAddon.textContent = originalBtnText;
        }
    });
}

// ── Modal 2: Manage Add-ons ────────────────────────────────────

export function renderManageAddonsList() {
    if (!dom.modalManageAddonsList) return;

    syncCatalogWithActiveAddons();

    if (!CATALOG_ADDONS || CATALOG_ADDONS.length === 0) {
        dom.modalManageAddonsList.innerHTML = `
            <div style="padding: 2rem 1rem; text-align: center; color: #94a3b8;">
                No add-ons currently available.
            </div>
        `;
        renderManageAddonsSummary();
        return;
    }

    dom.modalManageAddonsList.innerHTML = CATALOG_ADDONS.map(addon => {
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
    dom.modalManageAddonsList.querySelectorAll('.manage-addon-card').forEach(cardEl => {
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

export function toggleAddonSelection(addonId, isChecked) {
    if (isChecked) {
        if (!localSelectedAddonIds.includes(addonId)) {
            localSelectedAddonIds.push(addonId);
        }
    } else {
        localSelectedAddonIds = localSelectedAddonIds.filter(id => id !== addonId);
    }

    // Update card visual state immediately
    const escapedId = window.CSS && CSS.escape ? CSS.escape(addonId) : addonId;
    const card = dom.modalManageAddonsList.querySelector(`.manage-addon-card[data-addon-id="${escapedId}"]`);
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

export function renderManageAddonsSummary() {
    const changesEl = dom.modalManageAddonsChanges || document.getElementById('modalManageAddonsChanges');
    const summaryEl = dom.modalManageAddonsSummary || document.getElementById('modalManageAddonsSummary');
    if (!summaryEl && !changesEl) return;

    // Current Add-ons snapshot
    const currentAddons = initialActiveAddonIds.map(id => getAddonById(id)).filter(Boolean);
    const currentTotal = calcAddonsTotal(initialActiveAddonIds);

    // New additions (currently selected, but not originally active)
    const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
    const addedAddons = addedIds.map(id => getAddonById(id)).filter(Boolean);

    // Removals (originally active, but unselected)
    const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));
    const removedAddons = removedIds.map(id => getAddonById(id)).filter(Boolean);

    // New total & net difference
    const newTotal = calcAddonsTotal(localSelectedAddonIds);
    const netDiff = newTotal - currentTotal;

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

    // Column 2: Changes (New Additions & Removals)
    if (changesEl) {
        changesEl.innerHTML = `
            <!-- Card 1: New Additions -->
            <div class="billing-card billing-card--additions ${addedAddons.length > 0 ? 'is-active' : ''}">
                <div class="billing-card-header">
                    <span class="billing-card-title">NEW ADDITIONS</span>
                    ${addedAddons.length > 0 ? `<span class="billing-card-badge billing-card-badge--green">+${addedAddons.length}</span>` : ''}
                </div>
                <div class="billing-card-body">
                    ${additionsHtml}
                </div>
            </div>

            <!-- Card 2: Removals -->
            <div class="billing-card billing-card--removals ${removedAddons.length > 0 ? 'is-active' : ''}">
                <div class="billing-card-header">
                    <span class="billing-card-title">REMOVALS</span>
                    ${removedAddons.length > 0 ? `<span class="billing-card-badge billing-card-badge--red">-${removedAddons.length}</span>` : ''}
                </div>
                <div class="billing-card-body">
                    ${removalsHtml}
                </div>
            </div>
        `;
    }

    // Column 3: Billing Summary
    if (summaryEl) {
        summaryEl.innerHTML = `
            <!-- Card 1: Current Add-ons -->
            <div class="billing-card billing-card--current">
                <div class="billing-card-header">
                    <span class="billing-card-title">CURRENT ADD-ONS</span>
                    ${currentAddons.length > 0 ? `<span class="billing-card-badge billing-card-badge--blue">${currentAddons.length} active</span>` : ''}
                </div>
                <div class="billing-card-body">
                    ${currentAddonsHtml}
                </div>
                <div class="billing-card-subtotal">
                    <span class="item-name">Current Total</span>
                    <span class="item-price">${fmtCurrency(currentTotal)}</span>
                </div>
            </div>

            <!-- Card 2: Net Adjustment (if changes exist) -->
            <div class="billing-card billing-card--diff">
                <div class="billing-card-header">
                    <span class="billing-card-title">NET CHANGE</span>
                </div>
                <div class="billing-card-row">
                    <span class="item-name">Monthly Adjustment</span>
                    <span class="item-price ${netDiff > 0 ? 'item-price--add' : (netDiff < 0 ? 'item-price--remove' : '')}">
                        ${netDiff > 0 ? '+' : ''}${fmtCurrency(netDiff)}
                    </span>
                </div>
            </div>

            <!-- Card 3: New Total Card -->
            <div class="billing-card billing-card--total">
                <div class="billing-total-row">
                    <span class="billing-total-label">NEW ADD-ONS TOTAL</span>
                    <div class="billing-total-value-wrap">
                        <span class="billing-total-val">${fmtCurrency(newTotal)}</span>
                        <span class="billing-total-freq">/ mo</span>
                    </div>
                </div>
            </div>
        `;
    }
}

export function openManageAddonsModal() {
    syncCatalogWithActiveAddons();
    // Snapshot active (non-cancelling) add-ons
    const nonCancellingIds = (state.activeAddons || [])
        .filter(a => (a.status || '').toLowerCase() !== 'cancelling')
        .map(a => a.id);

    initialActiveAddonIds = [...nonCancellingIds];
    localSelectedAddonIds = [...nonCancellingIds];

    renderManageAddonsList();
    openModal(dom.modalManageAddons);
}

export function closeManageAddonsModal() {
    localSelectedAddonIds = [...initialActiveAddonIds];
    closeModal(dom.modalManageAddons);
}

export function bindManageAddonsEvents() {
    if (dom.btnCancelManageAddons) {
        dom.btnCancelManageAddons.addEventListener('click', closeManageAddonsModal);
    }
    if (dom.btnCloseManageAddons) {
        dom.btnCloseManageAddons.addEventListener('click', closeManageAddonsModal);
    }

    // Save Changes: Direct Supabase update for add-on cancellation and reactivation
    if (dom.btnSaveManageAddons) {
        dom.btnSaveManageAddons.addEventListener('click', async function () {
            const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
            const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));

            // Check if any of the added IDs are reactivating an unexpired cancelling add-on
            const reactivatingIds = addedIds.filter(id => {
                const existing = (state.activeAddons || []).find(a => a.id === id);
                return existing && (existing.status || '').toLowerCase() === 'cancelling';
            });
            const brandNewAddedIds = addedIds.filter(id => !reactivatingIds.includes(id));

            if (brandNewAddedIds.length === 0 && reactivatingIds.length === 0 && removedIds.length === 0) {
                closeModal(dom.modalManageAddons);
                return;
            }

            // If user only selected brand-new add-ons, clarify that new add-ons require payment checkout
            if (brandNewAddedIds.length > 0 && reactivatingIds.length === 0 && removedIds.length === 0) {
                closeModal(dom.modalManageAddons);
                showToast('To activate new add-ons, please use "+ Add" on the specific add-on card to checkout.', 'info');
                return;
            }

            const originalBtnText = dom.btnSaveManageAddons.textContent;
            dom.btnSaveManageAddons.disabled = true;
            dom.btnSaveManageAddons.textContent = 'Updating add-ons...';

            try {
                const companyId = getCompanyId();
                if (!companyId) {
                    throw new Error('Salon company ID not found. Please refresh the page.');
                }

                const { supabase } = await import('../../lib/supabase.js');

                // 1. Direct Supabase update for unselected active add-ons: set status = 'cancelling'
                for (const addonId of removedIds) {
                    const { error: updErr } = await supabase
                        .from('subscription_add_ons')
                        .update({
                            status: 'cancelling',
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', companyId)
                        .eq('addon_id', addonId)
                        .eq('status', 'active');

                    if (updErr) {
                        console.error('[Billing] Direct Supabase add-on cancellation error:', updErr);
                        throw new Error(updErr.message || 'Failed to cancel add-on.');
                    }
                }

                // 2. Direct Supabase update for reactivated add-ons (cancelling -> active)
                for (const addonId of reactivatingIds) {
                    const { error: reactErr } = await supabase
                        .from('subscription_add_ons')
                        .update({
                            status: 'active',
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', companyId)
                        .eq('addon_id', addonId)
                        .eq('status', 'cancelling');

                    if (reactErr) {
                        console.error('[Billing] Direct Supabase add-on reactivation error:', reactErr);
                        throw new Error(reactErr.message || 'Failed to reactivate add-on.');
                    }
                }

                closeModal(dom.modalManageAddons);

                if (removedIds.length > 0 && reactivatingIds.length === 0) {
                    showToast('Add-on scheduled to cancel at end of billing cycle. Access remains active until then.', 'success');
                } else if (reactivatingIds.length > 0 && removedIds.length === 0) {
                    showToast('Add-on auto-renewal restored successfully.', 'success');
                } else {
                    showToast('Add-ons updated successfully.', 'success');
                }

                if (brandNewAddedIds.length > 0) {
                    setTimeout(() => {
                        showToast('Note: Brand new add-ons require payment checkout via "+ Add".', 'info');
                    }, 1800);
                }

                // Refresh active add-ons and billing summary from DB
                await loadActiveSubscriptionOnce();

            } catch (err) {
                console.error('[Billing] Error updating manage add-ons:', err);
                showToast(err.message || 'Failed to update add-ons.', 'error');
            } finally {
                dom.btnSaveManageAddons.disabled = false;
                dom.btnSaveManageAddons.textContent = originalBtnText;
            }
        });
    }

    const btnManageAddonsBottom = document.getElementById('btnManageAddonsBottom');
    if (btnManageAddonsBottom) {
        btnManageAddonsBottom.onclick = () => {
            window.location.href = 'manage-addons.html';
        };
    }
}
