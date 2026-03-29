/**
 * roles-permissions.js
 * Dynamically generates the UI from Feature & Sub-Feature Registries.
 * All role CRUD operations are wired to live API endpoints.
 */

import { API, fetchWithAuth } from './config/api.js';
import { FEATURES, MODULES_META } from './config/feature-registry.js';
import { SUB_FEATURES, SUB_FEATURES_MAP } from './config/sub-feature-registry.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || null;
    } catch { return null; }
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

// ─── Fetch Roles & Staff (READ) ───────────────────────────────────────────────
async function fetchRoles() {
    setPageLoading(true);

    try {
        // Fetch roles and staff in parallel to calculate users per role dynamically
        const [rolesRes, staffRes] = await Promise.all([
            fetchWithAuth(API.READ_ROLES, {
                method: 'POST',
                body: JSON.stringify({
                    company_id: getCompanyId(),
                    branch_id:  getBranchId()
                })
            }, FEATURES.ROLES_PERMISSIONS, 'read'),
            fetchWithAuth(API.READ_STAFF, {
                method: 'POST',
                body: JSON.stringify({
                    company_id: getCompanyId(),
                    branch_id:  getBranchId()
                })
            }, FEATURES.STAFF_MANAGEMENT, 'read').catch(() => ({ ok: false })) // fail gracefully if no staff permission
        ]);

        if (rolesRes.ok) {
            const data = await rolesRes.json();
            
            let fetchedRoles = [];
            if (Array.isArray(data)) {
                if (data.length > 0 && data[0].error) throw new Error(data[0].error);
                if (data.length > 0 && data[0].roles) fetchedRoles = data[0].roles;
                else fetchedRoles = data;
            } else if (data && data.error) {
                throw new Error(data.error);
            } else if (data && data.roles) {
                fetchedRoles = data.roles;
            }

            // Attempt to read staff data for dynamic user counts
            let staffList = [];
            if (staffRes.ok) {
                try {
                    const sData = await staffRes.json();
                    if (Array.isArray(sData)) {
                        if (sData.length > 0 && sData[0].staff) staffList = sData[0].staff;
                        else if (sData.length > 0 && !sData[0].error) staffList = sData;
                    } else if (sData && sData.staff) {
                        staffList = sData.staff;
                    }
                } catch (e) { console.error('Error parsing staff data', e); }
            }

            // Group by role_id in case the API returns a flat list with individual permission keys
            const roleMap = new Map();
            fetchedRoles.forEach(r => {
                const rId = r.role_id || r.id;
                if (!rId) return;

                if (!roleMap.has(rId)) {
                    roleMap.set(rId, {
                        ...r,
                        permissions: Array.isArray(r.permissions) ? [...r.permissions] : [],
                        permission_key: Array.isArray(r.permission_key) ? [...r.permission_key] : []
                    });
                }
                const existing = roleMap.get(rId);

                // Add single string permissions from a flat structure
                if (typeof r.permission_key === 'string' && r.permission_key) {
                    if (!existing.permission_key.includes(r.permission_key)) {
                        existing.permission_key.push(r.permission_key);
                    }
                }
                if (typeof r.permissions === 'string' && r.permissions) {
                    if (!existing.permissions.includes(r.permissions)) {
                        existing.permissions.push(r.permissions);
                    }
                }
            });

            const uniqueRoles = Array.from(roleMap.values());

            rolesData = uniqueRoles.map(r => {
                // Count how many staff members are assigned this specific role_id
                const userCount = staffList.filter(s => s.role_id === r.role_id).length;
                
                // Allow fallback if it came as an array
                const permissionArray = r.permissions?.length > 0 ? r.permissions : r.permission_key;

                return {
                    id: r.role_id,
                    role_id: r.role_id,
                    name: r.role_name,
                    role_name: r.role_name,
                    description: r.description,
                    protected: r.is_default === true, // Lock the role UI if the backend flags it as default!
                    userCount: userCount,
                    permission_key: permissionArray || []
                };
            });
        } else {
            console.error('API Error: Backend returned non-200 status for roles.');
            rolesData = [];
        }

    } catch (err) {
        console.error('Error fetching roles:', err);
        showToast('Failed to load roles from server.');
        rolesData = [];
    } finally {
        if (rolesData.length > 0 && !activeRoleId) {
            // Default: select the first protected (owner) role
            const defaultRole = rolesData.find(r => r.protected) || rolesData[0];
            activeRoleId = defaultRole.id || defaultRole.role_id;
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
        const roleId = role.id || role.role_id;
        const li = document.createElement('li');
        li.className = 'role-list-item' + (roleId === activeRoleId ? ' active' : '');
        li.dataset.roleId = roleId;

        li.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div class="role-name">${escHtml(role.name)}</div>
                <div class="role-meta">${role.userCount ?? role.user_count ?? 0} user${(role.userCount ?? role.user_count ?? 0) !== 1 ? 's' : ''}</div>
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
    const role = rolesData.find(r => (r.id || r.role_id) === roleId);
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
    const isOwner       = role && role.protected;
    
    // Support either the new permission_key array or legacy fallback
    const roleKeys = role ? (role.permission_key || [...(role.features||[]), ...(role.sub_features||[])]) : [];

    MODULES_META.forEach(mod => {
        const featureKey      = mod.key;
        const salonOwns       = subscriptionFeatures.includes(featureKey);
        const hasFeature      = salonOwns && roleKeys.includes(featureKey);
        const disabledAttr    = (isOwner || !salonOwns) ? 'disabled' : '';
        const childSubFeats   = SUB_FEATURES_MAP[featureKey] || [];

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
                const hasSub = salonOwns && roleKeys.includes(subf.key);
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
    const role = rolesData.find(r => (r.id || r.role_id) === roleId);
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

// ─── Save Role (CREATE / UPDATE) ──────────────────────────────────────────────
async function saveRole() {
    const name = roleNameInput.value.trim();
    if (!name) {
        roleNameInput.style.borderColor = '#ef4444';
        roleNameInput.focus();
        return;
    }
    roleNameInput.style.borderColor = '';

    const desc = roleDescInput.value.trim() || `${name} role`;
    const permission_key = collectPermissionsFromContainer(modalPermBody);

    const isEdit = !!editingRoleId;
    const payload = {
        company_id:     getCompanyId(),
        branch_id:      getBranchId(),
        role_name:      name,
        description:    desc,
        permission_key,
        ...(isEdit ? { role_id: editingRoleId } : {})
    };

    const originalText = btnSaveRole.textContent;
    btnSaveRole.textContent = 'Saving...';
    btnSaveRole.disabled    = true;

    try {
        const endpoint = isEdit ? API.UPDATE_ROLE : API.CREATE_ROLE;
        const res = await fetchWithAuth(endpoint, {
            method: 'POST',
            body:   JSON.stringify(payload)
        }, FEATURES.ROLES_PERMISSIONS, isEdit ? 'update' : 'create');

        const data = await res.json();
        const root = Array.isArray(data) ? data[0] : data;

        if (res.ok && !root?.error) {
            showToast(`Role "${name}" ${isEdit ? 'updated' : 'created'} successfully!`);
            closeRoleModal();
            await fetchRoles();
            // Select the newly created or edited role
            if (!isEdit && root.role_id) activeRoleId = root.role_id;
            if (activeRoleId) selectRole(activeRoleId);
        } else {
            showToast('Error: ' + (root?.error || root?.message || 'Unknown error'));
        }
    } catch (err) {
        console.error(err);
        showToast('Network error saving role.');
    } finally {
        btnSaveRole.textContent = originalText;
        btnSaveRole.disabled    = false;
    }
}

// ─── Inline Permissions Save (UPDATE) ────────────────────────────────────────
async function saveInlinePerms() {
    const role = rolesData.find(r => (r.id || r.role_id) === activeRoleId);
    if (!role) return;

    const permission_key = collectPermissionsFromContainer(permMatrixBody);

    const payload = {
        company_id:     getCompanyId(),
        branch_id:      getBranchId(),
        role_id:        activeRoleId,
        role_name:      role.name || role.role_name,
        description:    role.description || '',
        permission_key
    };

    const originalText = btnSavePerms.textContent;
    btnSavePerms.textContent = 'Saving...';
    btnSavePerms.disabled    = true;

    try {
        const res = await fetchWithAuth(API.UPDATE_ROLE, {
            method: 'POST',
            body:   JSON.stringify(payload)
        }, FEATURES.ROLES_PERMISSIONS, 'update');

        const data = await res.json();
        const root = Array.isArray(data) ? data[0] : data;

        if (res.ok && !root?.error) {
            btnSavePerms.style.display = 'none';
            showToast(`Permissions for "${role.name}" saved!`);
            await fetchRoles();
            selectRole(activeRoleId);
        } else {
            showToast('Error: ' + (root?.error || root?.message || 'Unknown error'));
        }
    } catch (err) {
        console.error(err);
        showToast('Network error saving permissions.');
    } finally {
        btnSavePerms.textContent = originalText;
        btnSavePerms.disabled    = false;
    }
}

// ─── Delete Role ──────────────────────────────────────────────────────────────
function openDeleteConfirm(roleId) {
    const role = rolesData.find(r => (r.id || r.role_id) === roleId);
    if (!role || role.protected) return;
    deleteRoleNameDisplay.textContent  = role.name;
    btnConfirmDelete.dataset.roleId    = roleId;
    confirmDeleteOverlay.classList.add('active');
}

function closeDeleteConfirm() {
    confirmDeleteOverlay.classList.remove('active');
}

async function confirmDelete() {
    const roleId = btnConfirmDelete.dataset.roleId;
    const role   = rolesData.find(r => (r.id || r.role_id) === roleId);
    if (!role) return;

    const originalText = btnConfirmDelete.textContent;
    btnConfirmDelete.textContent = 'Deleting...';
    btnConfirmDelete.disabled    = true;

    try {
        const res = await fetchWithAuth(API.DELETE_ROLE, {
            method: 'POST',
            body:   JSON.stringify({
                company_id: getCompanyId(),
                branch_id:  getBranchId(),
                role_id:    roleId
            })
        }, FEATURES.ROLES_PERMISSIONS, 'delete');

        const data = await res.json();
        const root = Array.isArray(data) ? data[0] : data;

        if (res.ok && !root?.error) {
            closeDeleteConfirm();
            showToast('Role deleted successfully.');
            // Fall back to first protected role after deletion
            const fallback = rolesData.find(r => r.protected && (r.id || r.role_id) !== roleId);
            if (fallback) activeRoleId = fallback.id || fallback.role_id;
            await fetchRoles();
            if (activeRoleId) selectRole(activeRoleId);
        } else {
            showToast('Error: ' + (root?.error || root?.message || 'Unknown error'));
        }
    } catch (err) {
        console.error(err);
        showToast('Network error deleting role.');
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
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
