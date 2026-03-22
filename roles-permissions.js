/**
 * roles-permissions.js
 * Automatically generating the UI based on Feature & Sub-Feature Registries!
 */

import { FEATURES, MODULES_META } from './config/feature-registry.js';
import { SUB_FEATURES, SUB_FEATURES_MAP } from './config/sub-feature-registry.js';

// MOCK: The Owner's current Subscription limits (We intentionally omit Ad Campaigns to test the lock UI)
const MOCK_SUBSCRIPTION_FEATURES = Object.values(FEATURES).filter(f => f !== FEATURES.MARKETING_CAMPAIGNS);

// Mock role database structure matching actual backend payload pattern
let rolesData = [
    {
        id: 'owner',
        name: 'Owner',
        description: 'Full system access. Cannot be modified or deleted.',
        protected: true,
        userCount: 1,
        features: MOCK_SUBSCRIPTION_FEATURES, 
        sub_features: Object.values(SUB_FEATURES)
    },
    {
        id: 'receptionist',
        name: 'Receptionist',
        description: 'Front desk - can manage bookings and customers.',
        protected: false,
        userCount: 5,
        features: [
            FEATURES.DASHBOARD_ACCESS, 
            FEATURES.BOOKINGS_MANAGEMENT, 
            FEATURES.CUSTOMERS_MANAGEMENT, 
            FEATURES.POS_SYSTEM
        ],
        sub_features: [
            SUB_FEATURES.BOOKING_CREATE,
            SUB_FEATURES.BOOKING_EDIT,
            SUB_FEATURES.BOOKING_CANCEL,
            SUB_FEATURES.BOOKING_VIEW_ALL,
            SUB_FEATURES.POS_CHECKOUT,
            SUB_FEATURES.CUSTOMER_CREATE,
            SUB_FEATURES.CUSTOMER_EDIT
        ]
    }
];

// ─── State ────────────────────────────────────────────────────────────────────
let activeRoleId = 'owner';
let editingRoleId = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const rolesList           = document.getElementById('rolesList');
const roleCountBadge      = document.getElementById('roleCountBadge');
const selectedRoleTitle   = document.getElementById('selectedRoleTitle');
const selectedRoleDesc    = document.getElementById('selectedRoleDesc');
const ownerBadgeWrapper   = document.getElementById('ownerBadgeWrapper');
const roleActionsWrapper  = document.getElementById('roleActionsWrapper');
const permMatrixBody      = document.getElementById('permissionsMatrixBody');

const btnAddRole          = document.getElementById('btnAddRole');
const btnEditRole         = document.getElementById('btnEditRole');
const btnDeleteRole       = document.getElementById('btnDeleteRole');

const roleModalOverlay    = document.getElementById('roleModalOverlay');
const roleModalTitle      = document.getElementById('roleModalTitle');
const roleNameInput       = document.getElementById('roleNameInput');
const roleDescInput       = document.getElementById('roleDescInput');
const modalPermBody       = document.getElementById('modalPermissionsBody');
const btnCloseRoleModal   = document.getElementById('btnCloseRoleModal');
const btnCancelRoleModal  = document.getElementById('btnCancelRoleModal');
const btnSaveRole         = document.getElementById('btnSaveRole');

const confirmDeleteOverlay    = document.getElementById('confirmDeleteOverlay');
const deleteRoleNameDisplay   = document.getElementById('deleteRoleNameDisplay');
const btnCloseConfirmDelete   = document.getElementById('btnCloseConfirmDelete');
const btnCancelDelete         = document.getElementById('btnCancelDelete');
const btnConfirmDelete        = document.getElementById('btnConfirmDelete');

const btnSavePerms    = document.getElementById('btnSavePermsHeader');

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    renderRolesList();
    selectRole(activeRoleId);
    bindEvents();
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderRolesList() {
    rolesList.innerHTML = '';
    roleCountBadge.textContent = rolesData.length;

    rolesData.forEach(role => {
        const li = document.createElement('li');
        li.className = 'role-list-item' + (role.id === activeRoleId ? ' active' : '');
        li.dataset.roleId = role.id;

        li.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div class="role-name">${escHtml(role.name)}</div>
                <div class="role-meta">${role.userCount} user${role.userCount !== 1 ? 's' : ''}</div>
            </div>
            ${!role.protected ? `
            <div class="role-item-actions">
                <button class="role-item-action-btn" title="Edit role" data-action="edit" data-role="${role.id}">
                    <i data-feather="edit-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="role-item-action-btn danger" title="Delete role" data-action="delete" data-role="${role.id}">
                    <i data-feather="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>` : ''}
        `;

        li.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return;
            selectRole(role.id);
        });

        rolesList.appendChild(li);
    });

    if(window.feather) feather.replace();
}

function selectRole(roleId) {
    activeRoleId = roleId;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;

    document.querySelectorAll('.role-list-item').forEach(el => {
        el.classList.toggle('active', el.dataset.roleId === roleId);
    });

    selectedRoleTitle.textContent = role.name;
    selectedRoleDesc.textContent = role.description;
    btnSavePerms.style.display = 'none';

    if (role.protected) {
        ownerBadgeWrapper.style.display = 'block';
        roleActionsWrapper.style.display = 'none';
    } else {
        ownerBadgeWrapper.style.display = 'none';
        roleActionsWrapper.style.display = 'flex';
    }

    renderPermissionsMatrix(role, permMatrixBody, false);
}

/**
 * Dynamically draws the table rows by mapping `MODULES_META` -> `SUB_FEATURES_MAP`.
 * Used for both the main page matrix and the Add/Edit Role modal.
 */
function renderPermissionsMatrix(role, containerEl, isModal) {
    containerEl.innerHTML = '';
    const isOwner = role && role.protected;
    
    // Arrays containing strings exactly as passed from the backend
    const roleFeatures = role ? role.features || [] : [];
    const roleSubFeats = role ? role.sub_features || [] : [];

    MODULES_META.forEach(mod => {
        const featureKey = mod.key;
        
        // SECURITY CHECK: Does the business owner actually own this feature?
        const salonOwnsFeature = MOCK_SUBSCRIPTION_FEATURES.includes(featureKey);
        
        // This role has access if checked AND the business owns it
        const hasFeature = salonOwnsFeature && roleFeatures.includes(featureKey); 
        const disabledAttr = (isOwner || !salonOwnsFeature) ? 'disabled' : '';

        // Get children sub-features for this module
        const childSubFeats = SUB_FEATURES_MAP[featureKey] || [];
        
        const tr = document.createElement('tr');
        
        // Column 1: Module Label
        let cells = `
            <td>
                <span class="module-icon ${!salonOwnsFeature ? 'text-muted' : ''}" style="${!salonOwnsFeature ? 'opacity:0.6;' : ''}">
                    <i data-feather="${mod.icon}" style="width:15px;height:15px;"></i>
                    ${escHtml(mod.label)}
                    ${!salonOwnsFeature ? '<span style="font-size:0.65rem; background:#fee2e2; color:#ef4444; padding:2px 6px; border-radius:10px; margin-left:8px;">Plan Locked</span>' : ''}
                </span>
            </td>
        `;
        
        // Column 2: Access Feature/Page Checkbox
        cells += `
            <td class="perm-cell" style="vertical-align: top; padding-top: 14px;">
                <input type="checkbox" class="perm-check feature-check" 
                    data-feature="${featureKey}" 
                    ${hasFeature ? 'checked' : ''} 
                    ${disabledAttr}>
            </td>
        `;

        // Column 3: Granular Sub-Features Tags
        let subFeaturesHtml = '';
        if(childSubFeats.length === 0) {
            subFeaturesHtml = `<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">No granular actions</span>`;
        } else {
            childSubFeats.forEach(subf => {
                const hasSub = salonOwnsFeature && roleSubFeats.includes(subf.key);
                subFeaturesHtml += `
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:#475569; cursor:${disabledAttr ? 'not-allowed':'pointer'}; opacity:${(!salonOwnsFeature) ? '0.5':'1'};">
                        <input type="checkbox" class="perm-check sub-feature-check" 
                            data-sub-feature="${subf.key}" 
                            data-parent="${featureKey}"
                            ${hasSub ? 'checked' : ''} 
                            ${disabledAttr} 
                            style="width:16px; height:16px;">
                        ${subf.label}
                    </label>
                `;
            });
        }

        cells += `
            <td style="vertical-align: top; padding: 14px 16px;">
                <div style="display:flex; flex-wrap:wrap; gap:16px;">
                    ${subFeaturesHtml}
                </div>
            </td>
        `;

        tr.innerHTML = cells;
        containerEl.appendChild(tr);

        // UI Logic Setup for non-owners: Toggling Feature automatically cascades to Sub-Features
        if (!isOwner && salonOwnsFeature) {
            const masterCheck = tr.querySelector('.feature-check');
            const subChecks = tr.querySelectorAll('.sub-feature-check');

            masterCheck.addEventListener('change', () => {
                if(!isModal) btnSavePerms.style.display = 'flex';
                // Only allow sub-checks to be active if master is active
                subChecks.forEach(cb => {
                    cb.checked = masterCheck.checked;
                });
            });

            subChecks.forEach(cb => {
                cb.addEventListener('change', () => {
                    if(!isModal) btnSavePerms.style.display = 'flex';
                    // If checking a sub-feature, auto-check the parent page so they can actually reach it
                    if(cb.checked) masterCheck.checked = true;
                });
            });
        }
    });

    if(window.feather) feather.replace();
}


// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
    rolesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const roleId = btn.dataset.role;
        if (btn.dataset.action === 'edit') openEditRoleModal(roleId);
        if (btn.dataset.action === 'delete') openDeleteConfirm(roleId);
    });

    btnEditRole.addEventListener('click', () => openEditRoleModal(activeRoleId));
    btnDeleteRole.addEventListener('click', () => openDeleteConfirm(activeRoleId));
    btnAddRole.addEventListener('click', openAddRoleModal);

    btnCloseRoleModal.addEventListener('click', closeRoleModal);
    btnCancelRoleModal.addEventListener('click', closeRoleModal);
    roleModalOverlay.addEventListener('click', (e) => { if (e.target === roleModalOverlay) closeRoleModal(); });

    btnSaveRole.addEventListener('click', saveRole);

    btnCloseConfirmDelete.addEventListener('click', closeDeleteConfirm);
    btnCancelDelete.addEventListener('click', closeDeleteConfirm);
    confirmDeleteOverlay.addEventListener('click', (e) => { if (e.target === confirmDeleteOverlay) closeDeleteConfirm(); });
    btnConfirmDelete.addEventListener('click', confirmDelete);

    btnSavePerms.addEventListener('click', saveInlinePerms);
}

// ─── Add/Edit Role Modal ───────────────────────────────────────────────────────────
function openAddRoleModal() {
    editingRoleId = null;
    roleModalTitle.textContent = 'Add Role';
    roleNameInput.value = '';
    roleDescInput.value = '';
    renderPermissionsMatrix(null, modalPermBody, true);
    roleModalOverlay.classList.add('active');
}

function openEditRoleModal(roleId) {
    const role = rolesData.find(r => r.id === roleId);
    if (!role || role.protected) return;

    editingRoleId = roleId;
    roleModalTitle.textContent = 'Edit Role';
    roleNameInput.value = role.name;
    roleDescInput.value = role.description;
    renderPermissionsMatrix(role, modalPermBody, true);
    roleModalOverlay.classList.add('active');
}

function closeRoleModal() {
    roleModalOverlay.classList.remove('active');
}

function saveRole() {
    const name = roleNameInput.value.trim();
    if (!name) {
        roleNameInput.style.borderColor = '#ef4444';
        roleNameInput.focus();
        return;
    }
    roleNameInput.style.borderColor = '';
    const desc = roleDescInput.value.trim() || `${name} role`;
    
    // Harvest the actual permissions
    const { features, sub_features } = collectPermissionsFromContainer(modalPermBody);

    if (editingRoleId) {
        const role = rolesData.find(r => r.id === editingRoleId);
        if (role) {
            role.name = name;
            role.description = desc;
            role.features = features;
            role.sub_features = sub_features;
        }
    } else {
        const newId = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        rolesData.push({
            id: newId,
            name,
            description: desc,
            protected: false,
            userCount: 0,
            features,
            sub_features
        });
        activeRoleId = newId;
    }

    closeRoleModal();
    renderRolesList();
    selectRole(activeRoleId);
    showToast(`Role "${name}" saved successfully!`);
}

// ─── Scanning Data Logic ────────────────────────────────────────────────────────
function collectPermissionsFromContainer(containerEl) {
    const features = [];
    const sub_features = [];

    // Harvest Checked Main Features
    const featureChecks = containerEl.querySelectorAll('.feature-check:checked');
    featureChecks.forEach(cb => features.push(cb.dataset.feature));

    // Harvest Checked Sub-Features
    const subFeatureChecks = containerEl.querySelectorAll('.sub-feature-check:checked');
    subFeatureChecks.forEach(cb => sub_features.push(cb.dataset.subFeature));

    return { features, sub_features };
}

// ─── Inline Save ───────────────────────────────────────────────────────────────
function saveInlinePerms() {
    const role = rolesData.find(r => r.id === activeRoleId);
    if (!role) return;

    const { features, sub_features } = collectPermissionsFromContainer(permMatrixBody);
    
    role.features = features;
    role.sub_features = sub_features;

    // Simulate sending API payload
    console.log(`[API REQUEST] Saving Role Permissions for ${role.name}:`, { features, sub_features });

    btnSavePerms.style.display = 'none';
    showToast(`Permissions for "${role.name}" saved!`);
}

// ─── Delete Actions ───────────────────────────────────────────────────────────
function openDeleteConfirm(roleId) {
    const role = rolesData.find(r => r.id === roleId);
    if (!role || role.protected) return;
    deleteRoleNameDisplay.textContent = role.name;
    btnConfirmDelete.dataset.roleId = roleId;
    confirmDeleteOverlay.classList.add('active');
}

function closeDeleteConfirm() {
    confirmDeleteOverlay.classList.remove('active');
}

function confirmDelete() {
    const roleId = btnConfirmDelete.dataset.roleId;
    rolesData = rolesData.filter(r => r.id !== roleId);
    closeDeleteConfirm();
    if (activeRoleId === roleId) activeRoleId = 'owner';
    renderRolesList();
    selectRole(activeRoleId);
    showToast('Role deleted successfully.');
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', init);
