/**
 * roles-permissions.js
 * Dynamically generates the UI from Feature & Sub-Feature Registries.
 * All role CRUD operations use direct Supabase queries.
 */

import { supabase } from './lib/supabase.js';
import { FEATURES, MODULES_META } from './config/feature-registry.js';
import { SUB_FEATURES, SUB_FEATURES_MAP } from './config/sub-feature-registry.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

/**
 * Returns the list of features the salon's subscription allows.
 * Reads from appContext if available, otherwise falls back to all features.
 */
function getSubscriptionFeatures() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const subFeatures = ctx.subscription?.features || ctx.allowed_features || null;
        if (Array.isArray(subFeatures) && subFeatures.length > 0) return subFeatures;
    } catch { /* fall through */ }
    // Fallback: allow all features
    return Object.values(FEATURES);
}

// ─── Live State ───────────────────────────────────────────────────────────────
let rolesData    = [];
let activeRoleId = null;
let editingRoleId = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
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

const confirmDeleteOverlay  = document.getElementById('confirmDeleteOverlay');
const deleteRoleNameDisplay = document.getElementById('deleteRoleNameDisplay');
const btnCloseConfirmDelete = document.getElementById('btnCloseConfirmDelete');
const btnCancelDelete       = document.getElementById('btnCancelDelete');
const btnConfirmDelete      = document.getElementById('btnConfirmDelete');

const btnSavePerms = document.getElementById('btnSavePermsHeader');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    bindEvents();
    await fetchRoles();
}

// ─── Fetch Roles & Staff (READ via Supabase) ──────────────────────────────────
async function fetchRoles() {
    setPageLoading(true);

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        // Fetch roles, their permissions, and staff in parallel
        const [rolesRes, permsRes, staffRes, usersRes] = await Promise.all([
            supabase
                .from('roles')
                .select('*')
                .eq('company_id', companyId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: true }),
            supabase
                .from('role_permissions')
                .select('role_id, permission_key')
                .eq('company_id', companyId)
                .eq('status', 'active'),
            supabase
                .from('staff')
                .select('id, role_id')
                .eq('company_id', companyId),
            supabase
                .from('users')
                .select('user_id, role_id')
                .eq('company_id', companyId)
        ]);

        if (rolesRes.error) throw rolesRes.error;

        // Build permission_key map: { role_id -> [permission_key, ...] }
        const permMap = {};
        (permsRes.data || []).forEach(row => {
            if (!permMap[row.role_id]) permMap[row.role_id] = [];
            if (row.permission_key) permMap[row.role_id].push(row.permission_key);
        });

        // Build staff count map: { role_id -> count }
        const staffCountMap = {};
        const combinedUsers = [...(staffRes.data || []), ...(usersRes.data || [])];
        combinedUsers.forEach(s => {
            if (!s.role_id) return;
            staffCountMap[s.role_id] = (staffCountMap[s.role_id] || 0) + 1;
        });

        // Map to the internal rolesData shape
        rolesData = (rolesRes.data || []).map(r => ({
            id:           r.role_id,
            role_id:      r.role_id,
            name:         r.role_name,
            role_name:    r.role_name,
            description:  r.description || '',
            protected:    r.is_default === true,
            userCount:    staffCountMap[r.role_id] || 0,
            permission_key: permMap[r.role_id] || []
        }));

    } catch (err) {
        console.error('Error fetching roles (Supabase):', err);
        showToast('Failed to load roles from server: ' + (err.message || ''));
        rolesData = [];
    } finally {
        if (rolesData.length > 0 && !activeRoleId) {
            const defaultRole = rolesData.find(r => r.protected) || rolesData[0];
            activeRoleId = defaultRole.role_id;
        }
        renderRolesList();
        if (activeRoleId) selectRole(activeRoleId);
        setPageLoading(false);
    }
}

function setPageLoading(loading) {
    if (rolesList) rolesList.style.opacity = loading ? '0.5' : '1';
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderRolesList() {
    rolesList.innerHTML = '';
    roleCountBadge.textContent = rolesData.length;

    rolesData.forEach(role => {
        const roleId = role.role_id;
        const li = document.createElement('li');
        li.className = 'role-list-item' + (roleId === activeRoleId ? ' active' : '');
        li.dataset.roleId = roleId;

        li.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div class="role-name">${escHtml(role.name)}</div>
                <div class="role-meta">${role.userCount} user${role.userCount !== 1 ? 's' : ''}</div>
            </div>
            ${!role.protected ? `
            <div class="role-item-actions">
                <button class="role-item-action-btn" title="Edit role" data-action="edit" data-role="${roleId}">
                    <i data-feather="edit-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="role-item-action-btn danger" title="Delete role" data-action="delete" data-role="${roleId}">
                    <i data-feather="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>` : ''}
        `;

        li.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return;
            selectRole(roleId);
        });

        rolesList.appendChild(li);
    });

    if (window.feather) feather.replace();
}

function selectRole(roleId) {
    activeRoleId = roleId;
    const role = rolesData.find(r => r.role_id === roleId);
    if (!role) return;

    document.querySelectorAll('.role-list-item').forEach(el => {
        el.classList.toggle('active', el.dataset.roleId === roleId);
    });

    selectedRoleTitle.textContent = role.name;
    selectedRoleDesc.textContent  = role.description || '';
    btnSavePerms.style.display    = 'none';

    if (role.protected) {
        ownerBadgeWrapper.style.display  = 'block';
        roleActionsWrapper.style.display = 'none';
    } else {
        ownerBadgeWrapper.style.display  = 'none';
        roleActionsWrapper.style.display = 'flex';
    }

    renderPermissionsMatrix(role, permMatrixBody, false);
}

/**
 * Dynamically draws the permissions table rows from MODULES_META → SUB_FEATURES_MAP.
 * Used for both the main page matrix and the Add/Edit Role modal.
 */
function renderPermissionsMatrix(role, containerEl, isModal) {
    containerEl.innerHTML = '';
    const subscriptionFeatures = getSubscriptionFeatures();
    const isOwner  = role && role.protected;
    const roleKeys = role ? (role.permission_key || []) : [];

    MODULES_META.forEach(mod => {
        const featureKey   = mod.key;
        const salonOwns    = subscriptionFeatures.includes(featureKey);
        
        // Treat the 'ALL' key as having universal access (fallback scenario)
        const hasUniversal = roleKeys.includes('ALL');
        const hasFeature   = salonOwns && (hasUniversal || roleKeys.includes(featureKey));
        const disabledAttr = (isOwner || !salonOwns) ? 'disabled' : '';
        const childSubFeats = SUB_FEATURES_MAP[featureKey] || [];

        const tr = document.createElement('tr');

        // Column 1 — Module label
        let cells = `
            <td>
                <span class="module-icon ${!salonOwns ? 'text-muted' : ''}" style="${!salonOwns ? 'opacity:0.6;' : ''}">
                    <i data-feather="${mod.icon}" style="width:15px;height:15px;"></i>
                    ${escHtml(mod.label)}
                    ${!salonOwns ? '<span style="font-size:0.65rem;background:#fee2e2;color:#ef4444;padding:2px 6px;border-radius:10px;margin-left:8px;">Plan Locked</span>' : ''}
                </span>
            </td>
        `;

        // Column 2 — Feature access checkbox
        cells += `
            <td class="perm-cell" style="vertical-align:top;padding-top:14px;">
                <input type="checkbox" class="perm-check feature-check"
                    data-feature="${featureKey}"
                    ${hasFeature ? 'checked' : ''}
                    ${disabledAttr}>
            </td>
        `;

        // Column 3 — Sub-feature checkboxes
        let subHtml = '';
        if (childSubFeats.length === 0) {
            subHtml = `<span style="font-size:0.8rem;color:#94a3b8;font-style:italic;">No granular actions</span>`;
        } else {
            childSubFeats.forEach(subf => {
                const hasSub = salonOwns && (hasUniversal || roleKeys.includes(subf.key));
                subHtml += `
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:#475569;cursor:${disabledAttr ? 'not-allowed' : 'pointer'};opacity:${!salonOwns ? '0.5' : '1'};">
                        <input type="checkbox" class="perm-check sub-feature-check"
                            data-sub-feature="${subf.key}"
                            data-parent="${featureKey}"
                            ${hasSub ? 'checked' : ''}
                            ${disabledAttr}
                            style="width:16px;height:16px;">
                        ${subf.label}
                    </label>
                `;
            });
        }

        cells += `
            <td style="vertical-align:top;padding:14px 16px;">
                <div style="display:flex;flex-wrap:wrap;gap:16px;">${subHtml}</div>
            </td>
        `;

        tr.innerHTML = cells;
        containerEl.appendChild(tr);

        // Cascade logic: feature ↔ sub-feature toggling
        if (!isOwner && salonOwns) {
            const masterCheck = tr.querySelector('.feature-check');
            const subChecks   = tr.querySelectorAll('.sub-feature-check');

            masterCheck.addEventListener('change', () => {
                if (!isModal) btnSavePerms.style.display = 'flex';
                subChecks.forEach(cb => { cb.checked = masterCheck.checked; });
            });

            subChecks.forEach(cb => {
                cb.addEventListener('change', () => {
                    if (!isModal) btnSavePerms.style.display = 'flex';
                    if (cb.checked) masterCheck.checked = true;
                });
            });
        }
    });

    if (window.feather) feather.replace();
}

// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
    rolesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const roleId = btn.dataset.role;
        if (btn.dataset.action === 'edit')   openEditRoleModal(roleId);
        if (btn.dataset.action === 'delete') openDeleteConfirm(roleId);
    });

    btnEditRole.addEventListener('click',   () => openEditRoleModal(activeRoleId));
    btnDeleteRole.addEventListener('click', () => openDeleteConfirm(activeRoleId));
    btnAddRole.addEventListener('click',    openAddRoleModal);

    btnCloseRoleModal.addEventListener('click',  closeRoleModal);
    btnCancelRoleModal.addEventListener('click', closeRoleModal);
    roleModalOverlay.addEventListener('click',   (e) => { if (e.target === roleModalOverlay) closeRoleModal(); });

    btnSaveRole.addEventListener('click', saveRole);

    btnCloseConfirmDelete.addEventListener('click', closeDeleteConfirm);
    btnCancelDelete.addEventListener('click',       closeDeleteConfirm);
    confirmDeleteOverlay.addEventListener('click',  (e) => { if (e.target === confirmDeleteOverlay) closeDeleteConfirm(); });
    btnConfirmDelete.addEventListener('click',      confirmDelete);

    btnSavePerms.addEventListener('click', saveInlinePerms);
}

// ─── Add / Edit Role Modal ─────────────────────────────────────────────────────
function openAddRoleModal() {
    editingRoleId = null;
    roleModalTitle.textContent = 'Add Role';
    roleNameInput.value = '';
    roleDescInput.value = '';
    renderPermissionsMatrix(null, modalPermBody, true);
    roleModalOverlay.classList.add('active');
}

function openEditRoleModal(roleId) {
    const role = rolesData.find(r => r.role_id === roleId);
    if (!role || role.protected) return;

    editingRoleId = roleId;
    roleModalTitle.textContent = 'Edit Role';
    roleNameInput.value = role.name;
    roleDescInput.value = role.description || '';
    renderPermissionsMatrix(role, modalPermBody, true);
    roleModalOverlay.classList.add('active');
}

function closeRoleModal() {
    roleModalOverlay.classList.remove('active');
}

// ─── Save Role (CREATE / UPDATE) via Supabase ─────────────────────────────────
async function saveRole() {
    const name = roleNameInput.value.trim();
    if (!name) {
        roleNameInput.style.borderColor = '#ef4444';
        roleNameInput.focus();
        return;
    }
    roleNameInput.style.borderColor = '';

    const desc           = roleDescInput.value.trim() || `${name} role`;
    const permission_key = collectPermissionsFromContainer(modalPermBody);
    const isEdit         = !!editingRoleId;
    const companyId      = getCompanyId();
    const branchId       = getBranchId();
    const now            = new Date().toISOString();

    const originalText = btnSaveRole.textContent;
    btnSaveRole.textContent = 'Saving...';
    btnSaveRole.disabled    = true;

    try {
        let roleId = editingRoleId;

        if (isEdit) {
            // ── UPDATE the role row ──
            const { error: roleErr } = await supabase
                .from('roles')
                .update({
                    role_name:   name,
                    description: desc,
                    updated_at:  now,
                    status:      'active'
                })
                .eq('role_id', roleId)
                .eq('company_id', companyId);

            if (roleErr) throw roleErr;
        } else {
            // ── INSERT new role row ──
            const { data: newRole, error: roleErr } = await supabase
                .from('roles')
                .select()
                .insert({
                    company_id:  companyId,
                    branch_id:   branchId,
                    role_name:   name,
                    description: desc,
                    is_default:  false,
                    status:      'active',
                    created_at:  now,
                    updated_at:  now
                });

            if (roleErr) throw roleErr;
            roleId = newRole[0]?.role_id;
        }

        // ── Sync role_permissions: delete + reinsert ──
        await syncRolePermissions(roleId, companyId, branchId, name, permission_key, now);

        showToast(`Role "${name}" ${isEdit ? 'updated' : 'created'} successfully!`);
        closeRoleModal();
        if (!isEdit && roleId) activeRoleId = roleId;
        await fetchRoles();
        if (activeRoleId) selectRole(activeRoleId);

    } catch (err) {
        console.error('saveRole error:', err);
        showToast('Error saving role: ' + (err.message || 'Unknown error'));
    } finally {
        btnSaveRole.textContent = originalText;
        btnSaveRole.disabled    = false;
    }
}

// ─── Inline Permissions Save (UPDATE) via Supabase ───────────────────────────
async function saveInlinePerms() {
    const role = rolesData.find(r => r.role_id === activeRoleId);
    if (!role) return;

    const permission_key = collectPermissionsFromContainer(permMatrixBody);
    const companyId      = getCompanyId();
    const branchId       = getBranchId();
    const now            = new Date().toISOString();

    const originalText = btnSavePerms.textContent;
    btnSavePerms.textContent = 'Saving...';
    btnSavePerms.disabled    = true;

    try {
        // Also bump the role's updated_at timestamp
        await supabase
            .from('roles')
            .update({ updated_at: now })
            .eq('role_id', activeRoleId)
            .eq('company_id', companyId);

        // ── Sync role_permissions: delete + reinsert ──
        await syncRolePermissions(activeRoleId, companyId, branchId, role.role_name, permission_key, now);

        btnSavePerms.style.display = 'none';
        showToast(`Permissions for "${role.name}" saved!`);
        await fetchRoles();
        selectRole(activeRoleId);

    } catch (err) {
        console.error('saveInlinePerms error:', err);
        showToast('Error saving permissions: ' + (err.message || ''));
    } finally {
        btnSavePerms.textContent = originalText;
        btnSavePerms.disabled    = false;
    }
}

/**
 * Core helper: wipe all existing permission rows for a role_id, then reinsert.
 * Mirrors the original n8n "delete-all, reinsert" update strategy.
 */
async function syncRolePermissions(roleId, companyId, branchId, roleName, permissionKeys, now) {
    // Step 1: Delete all existing perm rows for this role
    const { error: delErr } = await supabase
        .from('role_permissions')
        .eq('role_id', roleId)
        .eq('company_id', companyId)
        .delete();

    if (delErr) console.warn('syncRolePermissions: delete warning:', delErr);

    // Step 2: Reinsert — one row per permission key
    if (permissionKeys.length > 0) {
        const rows = permissionKeys.map(key => ({
            company_id:     companyId,
            branch_id:      branchId,
            role_id:        roleId,
            role_name:      roleName,
            permission_key: key,
            status:         'active',
            created_at:     now,
            updated_at:     now
        }));

        const { error: insErr } = await supabase.from('role_permissions').insert(rows);
        if (insErr) throw insErr;
    }
}

// ─── Delete Role via Supabase ──────────────────────────────────────────────────
function openDeleteConfirm(roleId) {
    const role = rolesData.find(r => r.role_id === roleId);
    if (!role || role.protected) return;
    deleteRoleNameDisplay.textContent = role.name;
    btnConfirmDelete.dataset.roleId   = roleId;
    confirmDeleteOverlay.classList.add('active');
}

function closeDeleteConfirm() {
    confirmDeleteOverlay.classList.remove('active');
}

async function confirmDelete() {
    const roleId = btnConfirmDelete.dataset.roleId;
    const role   = rolesData.find(r => r.role_id === roleId);
    if (!role) return;

    const originalText = btnConfirmDelete.textContent;
    btnConfirmDelete.textContent = 'Deleting...';
    btnConfirmDelete.disabled    = true;

    try {
        const companyId = getCompanyId();
        const now       = new Date().toISOString();

        // Soft-delete the role row
        const { error: delRoleErr } = await supabase
            .from('roles')
            .update({ status: 'deleted', updated_at: now })
            .eq('role_id', roleId)
            .eq('company_id', companyId);

        if (delRoleErr) throw delRoleErr;

        // Also remove all its permission rows
        await supabase
            .from('role_permissions')
            .delete()
            .eq('role_id', roleId)
            .eq('company_id', companyId);

        closeDeleteConfirm();
        showToast('Role deleted successfully.');

        // Fallback to first protected role
        const fallback = rolesData.find(r => r.protected && r.role_id !== roleId);
        if (fallback) activeRoleId = fallback.role_id;
        await fetchRoles();
        if (activeRoleId) selectRole(activeRoleId);

    } catch (err) {
        console.error('confirmDelete error:', err);
        showToast('Error deleting role: ' + (err.message || ''));
    } finally {
        btnConfirmDelete.textContent = originalText;
        btnConfirmDelete.disabled    = false;
    }
}

// ─── Collect Permissions from DOM ─────────────────────────────────────────────
function collectPermissionsFromContainer(containerEl) {
    const permission_key = [];
    containerEl.querySelectorAll('.feature-check:checked').forEach(cb => permission_key.push(cb.dataset.feature));
    containerEl.querySelectorAll('.sub-feature-check:checked').forEach(cb => permission_key.push(cb.dataset.subFeature));
    return permission_key;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
