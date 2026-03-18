/**
 * roles-permissions.js
 * Handles the Roles & Permissions page interactions:
 *  - Rendering roles list
 *  - Switching active role & populating the permissions matrix
 *  - Add / Edit role modal
 *  - Delete confirmation dialog
 */

'use strict';

// ─── Module definitions ───────────────────────────────────────────────────────
const MODULES = [
    { key: 'dashboard',  label: 'Dashboard',  icon: 'home',        actions: ['view'] },
    { key: 'bookings',   label: 'Bookings',   icon: 'calendar',    actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'customers',  label: 'Customers',  icon: 'users',       actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'staff',      label: 'Staff',      icon: 'user-check',  actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'services',   label: 'Services',   icon: 'scissors',    actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'sales',      label: 'Sales',      icon: 'dollar-sign', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'payments',   label: 'Payments',   icon: 'credit-card', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'marketing',  label: 'Marketing',  icon: 'gift',        actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'analytics',  label: 'Analytics',  icon: 'bar-chart-2', actions: ['view'] },
    { key: 'settings',   label: 'Settings',   icon: 'settings',    actions: ['view', 'create', 'edit', 'delete'] },
];

// ─── Default role definitions ─────────────────────────────────────────────────
const ALL = { view: true, create: true, edit: true, delete: true };
const VIEW_ONLY = { view: true, create: false, edit: false, delete: false };
const VIEW_CREATE = { view: true, create: true, edit: false, delete: false };
const VIEW_CREATE_EDIT = { view: true, create: true, edit: true, delete: false };
const NONE = { view: false, create: false, edit: false, delete: false };

let rolesData = [
    {
        id: 'owner',
        name: 'Owner',
        description: 'Full system access. Cannot be modified or deleted.',
        protected: true,
        userCount: 1,
        permissions: {
            dashboard: ALL,
            bookings: ALL,
            customers: ALL,
            staff: ALL,
            services: ALL,
            sales: ALL,
            payments: ALL,
            marketing: ALL,
            analytics: ALL,
            settings: ALL,
        }
    },
    {
        id: 'admin',
        name: 'Admin',
        description: 'Almost full access. Cannot delete critical records.',
        protected: false,
        userCount: 2,
        permissions: {
            dashboard: ALL,
            bookings: ALL,
            customers: ALL,
            staff: ALL,
            services: ALL,
            sales: ALL,
            payments: ALL,
            marketing: ALL,
            analytics: VIEW_ONLY,
            settings: VIEW_CREATE_EDIT,
        }
    },
    {
        id: 'manager',
        name: 'Manager',
        description: 'Branch-level management. No system settings.',
        protected: false,
        userCount: 3,
        permissions: {
            dashboard: VIEW_ONLY,
            bookings: ALL,
            customers: ALL,
            staff: VIEW_ONLY,
            services: VIEW_CREATE_EDIT,
            sales: ALL,
            payments: VIEW_ONLY,
            marketing: VIEW_ONLY,
            analytics: VIEW_ONLY,
            settings: NONE,
        }
    },
    {
        id: 'receptionist',
        name: 'Receptionist',
        description: 'Front desk - can manage bookings and customers.',
        protected: false,
        userCount: 5,
        permissions: {
            dashboard: VIEW_ONLY,
            bookings: VIEW_CREATE_EDIT,
            customers: VIEW_CREATE,
            staff: VIEW_ONLY,
            services: VIEW_ONLY,
            sales: VIEW_ONLY,
            payments: VIEW_ONLY,
            marketing: NONE,
            analytics: NONE,
            settings: NONE,
        }
    },
    {
        id: 'staff',
        name: 'Staff',
        description: 'Salon staff. View their own bookings and services only.',
        protected: false,
        userCount: 8,
        permissions: {
            dashboard: VIEW_ONLY,
            bookings: VIEW_ONLY,
            customers: VIEW_ONLY,
            staff: NONE,
            services: VIEW_ONLY,
            sales: NONE,
            payments: NONE,
            marketing: NONE,
            analytics: NONE,
            settings: NONE,
        }
    },
];

// ─── State ────────────────────────────────────────────────────────────────────
let activeRoleId = 'owner';
let editingRoleId = null; // null = adding new role

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
            // Prevent selecting when an action button was clicked
            if (e.target.closest('[data-action]')) return;
            selectRole(role.id);
        });

        rolesList.appendChild(li);
    });

    feather.replace();
}

function selectRole(roleId) {
    activeRoleId = roleId;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;

    // Highlight sidebar item
    document.querySelectorAll('.role-list-item').forEach(el => {
        el.classList.toggle('active', el.dataset.roleId === roleId);
    });

    // Update header
    selectedRoleTitle.textContent = role.name;
    selectedRoleDesc.textContent = role.description;

    // Every time we switch role, we hide the save button (automatic discard)
    btnSavePerms.style.display = 'none';

    // Show/hide owner badge vs action buttons
    if (role.protected) {
        ownerBadgeWrapper.style.display = 'block';
        roleActionsWrapper.style.display = 'none';
    } else {
        ownerBadgeWrapper.style.display = 'none';
        roleActionsWrapper.style.display = 'flex';
    }

    renderPermissionsMatrix(role);
}

function renderPermissionsMatrix(role, isEditable = false) {
    permMatrixBody.innerHTML = '';
    const isOwner = role.protected;

    MODULES.forEach(mod => {
        const perms = role.permissions[mod.key] || NONE;
        const tr = document.createElement('tr');

        // Check if all supported actions are currently enabled
        const allChecked = mod.actions.every(action => perms[action]);

        let cells = `
            <td>
                <span class="module-icon">
                    <i data-feather="${mod.icon}" style="width:15px;height:15px;"></i>
                    ${escHtml(mod.label)}
                </span>
            </td>
        `;
        
        // Add "All" toggle cell
        cells += `<td class="perm-cell">
            <input type="checkbox" class="perm-check perm-all-toggle perm-all-glow"
                data-module="${mod.key}"
                ${allChecked ? 'checked' : ''}
                ${isOwner ? 'disabled' : ''}>
        </td>`;

        ['view', 'create', 'edit', 'delete'].forEach(action => {
            const supported = mod.actions.includes(action);
            const checked = supported && perms[action];
            const disabled = isOwner || !supported;

            cells += `<td class="perm-cell">
                <input type="checkbox" class="perm-check perm-action-check"
                    data-module="${mod.key}" data-action="${action}"
                    ${checked ? 'checked' : ''}
                    ${disabled ? 'disabled' : ''}
                    title="${supported ? '' : 'Not applicable for this module'}">
            </td>`;
        });

        tr.innerHTML = cells;
        permMatrixBody.appendChild(tr);

        // Logic for main matrix interactions (only non-owner)
        if (!isOwner) {
            const allToggle = tr.querySelector('.perm-all-toggle');
            const actionChecks = tr.querySelectorAll('.perm-action-check:not([disabled])');

            allToggle.addEventListener('change', () => {
                const checked = allToggle.checked;
                actionChecks.forEach(cb => cb.checked = checked);
                btnSavePerms.style.display = 'flex';
            });

            actionChecks.forEach(cb => {
                cb.addEventListener('change', () => {
                    const anyUnchecked = Array.from(actionChecks).some(check => !check.checked);
                    allToggle.checked = !anyUnchecked;
                    btnSavePerms.style.display = 'flex';
                });
            });
        }
    });

    feather.replace();
}

function renderModalPermissions(permissions = null) {
    modalPermBody.innerHTML = '';

    MODULES.forEach(mod => {
        const perms = permissions ? (permissions[mod.key] || NONE) : NONE;
        const tr = document.createElement('tr');

        // Check if all supported actions are currently enabled
        const allChecked = mod.actions.every(action => perms[action]);

        let cells = `<td>${escHtml(mod.label)}</td>`;
        
        // Add "All" toggle cell
        cells += `<td class="perm-cell">
            <input type="checkbox" class="perm-check perm-all-toggle perm-all-glow" data-module="${mod.key}" ${allChecked ? 'checked' : ''}>
        </td>`;

        ['view', 'create', 'edit', 'delete'].forEach(action => {
            const supported = mod.actions.includes(action);
            const checked = supported && perms[action];
            cells += `<td class="perm-cell">
                <input type="checkbox" class="perm-check"
                    data-module="${mod.key}" data-action="${action}"
                    ${checked ? 'checked' : ''}
                    ${!supported ? 'disabled' : ''}>
            </td>`;
        });

        tr.innerHTML = cells;
        modalPermBody.appendChild(tr);

        // Bind logic for "All" toggle
        const allToggle = tr.querySelector('.perm-all-toggle');
        const actionChecks = tr.querySelectorAll('.perm-check:not([disabled])');

        allToggle.addEventListener('change', () => {
            const checked = allToggle.checked;
            actionChecks.forEach(cb => cb.checked = checked);
        });

        // Bind logic for action checks to update "All" toggle
        actionChecks.forEach(cb => {
            cb.addEventListener('change', () => {
                const anyUnchecked = Array.from(actionChecks).some(check => !check.checked);
                allToggle.checked = !anyUnchecked;
            });
        });
    });
}

// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
    // Roles list: delegated edit / delete via sidebar item action buttons
    rolesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const roleId = btn.dataset.role;
        if (btn.dataset.action === 'edit') openEditRoleModal(roleId);
        if (btn.dataset.action === 'delete') openDeleteConfirm(roleId);
    });

    // Header Edit / Delete buttons
    btnEditRole.addEventListener('click', () => openEditRoleModal(activeRoleId));
    btnDeleteRole.addEventListener('click', () => openDeleteConfirm(activeRoleId));

    // Add Role button
    btnAddRole.addEventListener('click', openAddRoleModal);

    // Role Modal close
    btnCloseRoleModal.addEventListener('click', closeRoleModal);
    btnCancelRoleModal.addEventListener('click', closeRoleModal);
    roleModalOverlay.addEventListener('click', (e) => { if (e.target === roleModalOverlay) closeRoleModal(); });

    // Save Role
    btnSaveRole.addEventListener('click', saveRole);

    // Delete Confirm
    btnCloseConfirmDelete.addEventListener('click', closeDeleteConfirm);
    btnCancelDelete.addEventListener('click', closeDeleteConfirm);
    confirmDeleteOverlay.addEventListener('click', (e) => { if (e.target === confirmDeleteOverlay) closeDeleteConfirm(); });
    btnConfirmDelete.addEventListener('click', confirmDelete);

    // Save permissions inline
    btnSavePerms.addEventListener('click', saveInlinePerms);
}

// ─── Add Role Modal ───────────────────────────────────────────────────────────
function openAddRoleModal() {
    editingRoleId = null;
    roleModalTitle.textContent = 'Add Role';
    roleNameInput.value = '';
    roleDescInput.value = '';
    renderModalPermissions(null);
    roleModalOverlay.classList.add('active');
    feather.replace();
}

function openEditRoleModal(roleId) {
    const role = rolesData.find(r => r.id === roleId);
    if (!role || role.protected) return;

    editingRoleId = roleId;
    roleModalTitle.textContent = 'Edit Role';
    roleNameInput.value = role.name;
    roleDescInput.value = role.description;
    renderModalPermissions(role.permissions);
    roleModalOverlay.classList.add('active');
    feather.replace();
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
    const permissions = collectModalPermissions();

    if (editingRoleId) {
        // Update existing role
        const role = rolesData.find(r => r.id === editingRoleId);
        if (role) {
            role.name = name;
            role.description = desc;
            role.permissions = permissions;
        }
    } else {
        // Create new role
        const newId = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        rolesData.push({
            id: newId,
            name,
            description: desc,
            protected: false,
            userCount: 0,
            permissions,
        });
        activeRoleId = newId;
    }

    closeRoleModal();
    renderRolesList();
    selectRole(activeRoleId);
    showToast(`Role "${name}" saved successfully!`);
}

function collectModalPermissions() {
    const permissions = {};
    MODULES.forEach(mod => {
        permissions[mod.key] = {};
        ['view', 'create', 'edit', 'delete'].forEach(action => {
            const cb = modalPermBody.querySelector(`[data-module="${mod.key}"][data-action="${action}"]`);
            permissions[mod.key][action] = cb ? cb.checked : false;
        });
    });
    return permissions;
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
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

    // If the deleted role was the active one, default to Owner
    if (activeRoleId === roleId) activeRoleId = 'owner';

    renderRolesList();
    selectRole(activeRoleId);
    showToast('Role deleted successfully.');
}

// ─── Inline Permissions Save ──────────────────────────────────────────────────
function saveInlinePerms() {
    const role = rolesData.find(r => r.id === activeRoleId);
    if (!role) return;

    MODULES.forEach(mod => {
        ['view', 'create', 'edit', 'delete'].forEach(action => {
            const cb = permMatrixBody.querySelector(`[data-module="${mod.key}"][data-action="${action}"]`);
            if (cb) role.permissions[mod.key][action] = cb.checked;
        });
    });

    btnSavePerms.style.display = 'none';
    showToast(`Permissions for "${role.name}" saved!`);
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
