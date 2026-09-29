// billing-modal-addons.js — Modal 1 (Add Add-on) + Modal 2 (Manage Add-ons)
// Part of scripts/billing/ modularization of billing-subscription.js
// IMPORTANT: Current behavior is UI-only (contact support) — no DB writes.

'use strict';

import { state, CATALOG_ADDONS, getAddonById, syncCatalogWithActiveAddons } from './billing-state.js';
import { fmtCurrency, showToast } from './billing-helpers.js';
import { openModal, closeModal } from './billing-renders.js';

// DOM references — injected via initModalAddons()
let dom = {};

export function initModalAddons(domRefs) {
    dom = domRefs;
}

// ── Modal 2: Manage Add-ons — local ephemeral state ────────────
let localSelectedAddonIds = [];
let initialActiveAddonIds = [];

// ── Helper ─────────────────────────────────────────────────────

export function calcAddonsTotal(addonIdList) {
    return (addonIdList || []).reduce((acc, id) => {
        const addon = getAddonById(id);
        return acc + (addon ? (Number(addon.price) || 0) : 0);
    }, 0);
}

// ── Modal 1: Add Add-on Confirmation ──────────────────────────

export function openAddAddonModal(addonId) {
    const addon = getAddonById(addonId);
    if (!addon) return;

    state.pendingAddonId = addonId;
    dom.addAddonModalTitle.textContent = `Add ${addon.name}?`;
    dom.addAddonModalPrice.textContent = `${fmtCurrency(addon.price)} / month`;
    dom.addAddonModalDesc.textContent = addon.desc || '';

    if (dom.btnConfirmAddAddon) {
        dom.btnConfirmAddAddon.disabled = false;
        dom.btnConfirmAddAddon.innerHTML = 'Add Add-on';
    }

    const closeButtons = dom.modalAddAddon.querySelectorAll('[data-close-modal], .billing-modal-close');
    closeButtons.forEach(btn => btn.disabled = false);

    openModal(dom.modalAddAddon);
}

export function bindAddAddonConfirm() {
    if (!dom.btnConfirmAddAddon) return;
    dom.btnConfirmAddAddon.addEventListener('click', async function () {
        if (!state.pendingAddonId) return;
        closeModal(dom.modalAddAddon);
        state.pendingAddonId = null;
        showToast('Add-on activation is managed via billing support. Please contact support or purchase via checkout.');
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
    if (!dom.modalManageAddonsSummary) return;

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

    dom.modalManageAddonsSummary.innerHTML = `
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

export function openManageAddonsModal() {
    syncCatalogWithActiveAddons();
    // Snapshot the current active add-ons
    initialActiveAddonIds = [...state.activeAddonIds];
    localSelectedAddonIds = [...state.activeAddonIds];

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

    // Save Changes: UI-only, no DB write
    if (dom.btnSaveManageAddons) {
        dom.btnSaveManageAddons.addEventListener('click', async function () {
            const addedIds = localSelectedAddonIds.filter(id => !initialActiveAddonIds.includes(id));
            const removedIds = initialActiveAddonIds.filter(id => !localSelectedAddonIds.includes(id));

            if (addedIds.length === 0 && removedIds.length === 0) {
                closeModal(dom.modalManageAddons);
                return;
            }

            closeModal(dom.modalManageAddons);
            showToast('Add-on modifications are managed via billing support. Please contact support or update via checkout.');
        });
    }

    const btnManageAddonsBottom = document.getElementById('btnManageAddonsBottom');
    if (btnManageAddonsBottom) {
        btnManageAddonsBottom.onclick = openManageAddonsModal;
    }
}
