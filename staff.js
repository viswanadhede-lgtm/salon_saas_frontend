import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveStaffData = [
    { id:'S1', name:'Sarah Johnson',  initials:'SJ', color:'#6366f1', role:'Senior Stylist', services:'Haircut, Color, Styling', phone:'+91 98765 12345', status:'active' },
    { id:'S2', name:'Michael Lee',    initials:'ML', color:'#0ea5e9', role:'Barber',         services:"Men's Haircut, Beard",      phone:'+91 98765 54321', status:'active' },
    { id:'S3', name:'Anjali Sharma',  initials:'AS', color:'#f43f5e', role:'Therapist',      services:'Facial, Spa, Massage',     phone:'+91 98765 77777', status:'on-leave' },
    { id:'S4', name:'Ravi Kumar',     initials:'RK', color:'#10b981', role:'Stylist',        services:'Haircut, Keratin',         phone:'+91 98765 11111', status:'active' },
    { id:'S5', name:'Deepa Nair',     initials:'DN', color:'#f59e0b', role:'Therapist',      services:'Wax, Facials, Threading',  phone:'+91 98765 22222', status:'active' },
    { id:'S6', name:'Kiran Mehta',    initials:'KM', color:'#8b5cf6', role:'Stylist',        services:'Bridal, Styling, Color',   phone:'+91 98765 33333', status:'active' },
    { id:'S7', name:'Priya Reddy',    initials:'PR', color:'#ec4899', role:'Manager',        services:'Scheduling, Operations',   phone:'+91 98765 44444', status:'active' },
    { id:'S8', name:'Suresh Pillai',  initials:'SP', color:'#64748b', role:'Barber',         services:"Men's Haircut, Beard",     phone:'+91 98765 55555', status:'inactive' },
];

let staffActiveMenu = null;
let staffToDelete = null;

function getCompanyId() {
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        return appContext.company?.id || null;
    } catch (e) { return null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

export async function initStaff() {
    setupModals();
    attachEventListeners();
    await fetchRolesForDropdown();
    renderStaffTable(liveStaffData);
}

function getStaffStatusBadge(status) {
    if (status === 'active')   return '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:600; background:#d1fae5; color:#065f46;">Active</span>';
    if (status === 'on-leave') return '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:600; background:#fef9c3; color:#92400e;">On Leave</span>';
    if (status === 'inactive') return '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:600; background:#f1f5f9; color:#64748b;">Inactive</span>';
    return '';
}

function renderStaffTable(data) {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:40px; text-align:center; color:#94a3b8;">No staff members found.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(s => `
        <tr class="tb-row">
            <td style="padding:14px 16px 14px 24px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:38px; height:38px; border-radius:50%; background:${s.color || '#6366f1'}; color:#fff; font-size:0.8rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${s.initials}</div>
                    <span class="customer-link" onclick="window.viewStaffProfile('${s.id}')">${s.name}</span>
                </div>
            </td>
            <td style="padding:14px 16px; color:#374151; font-weight:500;">${s.role}</td>
            <td style="padding:14px 16px; color:#64748b;">${s.services}</td>
            <td style="padding:14px 16px; color:#374151;">${s.phone}</td>
            <td style="padding:14px 16px;">${getStaffStatusBadge(s.status)}</td>
            <td style="padding:14px 16px;">
                <button class="tb-action-btn" onclick="window.toggleStaffMenu(event, '${s.id}')">
                    Actions <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
    if (window.feather) feather.replace();
}

window.toggleStaffMenu = function(e, id) {
    e.stopPropagation();
    if (staffActiveMenu) { staffActiveMenu.remove(); staffActiveMenu = null; }
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'tb-actions-menu';
    menu.innerHTML = `
        <button class="tb-menu-item" onclick="window.viewStaffProfile('${id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View Profile</button>
        <button class="tb-menu-item" onclick="window.editStaff('${id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Staff</button>
        <button class="tb-menu-item danger" onclick="window.deactivateStaff('${id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Deactivate Staff</button>
    `;
    document.body.appendChild(menu);
    staffActiveMenu = menu;

    let top = rect.bottom + 6;
    if (top + 140 > window.innerHeight - 8) top = window.innerHeight - 148;
    let left = rect.right - 192;
    if (left < 8) left = rect.left;
    menu.style.cssText = `position:fixed; top:${top}px; left:${left}px; z-index:9999;`;
};

document.addEventListener('click', () => {
    if (staffActiveMenu) { staffActiveMenu.remove(); staffActiveMenu = null; }
});

window.viewStaffProfile = function(id) {
    if (staffActiveMenu) { staffActiveMenu.remove(); staffActiveMenu = null; }
    alert('Staff profile for: ' + id + '\n(Coming soon — tabs: Overview, Services, Schedule, Bookings, Revenue)');
};

window.editStaff = function(id) {
    if (staffActiveMenu) { staffActiveMenu.remove(); staffActiveMenu = null; }
    const staff = liveStaffData.find(s => s.id === id);
    if (!staff) return;

    document.getElementById('editStaffId').value = staff.id;
    document.getElementById('editSfName').value = staff.name || '';
    document.getElementById('editSfPhone').value = staff.phone || '';
    document.getElementById('editSfEmail').value = staff.email || '';
    document.getElementById('editSfServices').value = staff.services || '';
    document.getElementById('editSfNotes').value = staff.notes || '';
    
    // Ensure dropdown options match live available data (we copy it from add staff dropdown)
    const addRoleSelect = document.getElementById('sfRole');
    const editRoleSelect = document.getElementById('editSfRole');
    if (addRoleSelect && editRoleSelect) {
        editRoleSelect.innerHTML = addRoleSelect.innerHTML;
        editRoleSelect.value = staff.role || '';
    }

    const modal = document.getElementById('editStaffModal');
    if (modal) modal.classList.add('active');
};

window.deactivateStaff = function(id) {
    if (staffActiveMenu) { staffActiveMenu.remove(); staffActiveMenu = null; }
    const staff = liveStaffData.find(s => s.id === id);
    if (!staff) return;

    staffToDelete = staff;
    const overlay = document.getElementById('deleteStaffConfirmOverlay');
    if (overlay) overlay.classList.add('active');
};

function setupModals() {
    // Edit Staff Modal (matches Add Staff fields without working hours)
    if (!document.getElementById('editStaffModal')) {
        const editModalHtml = `
        <div class="modal-overlay" id="editStaffModal">
            <div class="modal-container" style="width: 600px; max-width: 95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Staff Member</h2>
                        <p class="subtitle">Update the team member details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditStaffModal"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; overflow-y: auto;">
                    <form id="editStaffForm" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px;">
                        <input type="hidden" id="editStaffId">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfName">Full Name <span class="text-rose">*</span></label>
                            <input type="text" id="editSfName" class="form-input" required>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfPhone">Phone <span class="text-rose">*</span></label>
                            <input type="tel" id="editSfPhone" class="form-input" required>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfEmail">Email</label>
                            <input type="email" id="editSfEmail" class="form-input">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfRole">Role <span class="text-rose">*</span></label>
                            <select id="editSfRole" class="form-select" required>
                                <option value="" disabled selected>Loading roles...</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0; grid-column: 1 / -1;">
                            <label class="form-label" for="editSfServices">Services Offered</label>
                            <input type="text" id="editSfServices" class="form-input">
                        </div>
                        <div class="form-group" style="margin:0; grid-column: 1 / -1;">
                            <label class="form-label" for="editSfNotes">Notes <span style="font-weight:400; color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editSfNotes" class="form-input form-textarea" style="min-height:80px;"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelEditStaff">Cancel</button>
                    <button type="submit" class="btn btn-primary" form="editStaffForm">Update Staff</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', editModalHtml);
    }

    // Delete confirmation overlay matching services module
    if (!document.getElementById('deleteStaffConfirmOverlay')) {
        const deleteOverlayHtml = `
        <div class="modal-overlay custom-logout-overlay" id="deleteStaffConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="trash-2" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete Staff Membership?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to deactivate this staff member? This will disconnect their access and schedules.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDeleteStaff" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDeleteStaff" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Deactivate</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay custom-logout-overlay" id="fullScreenDeleteStaffLoader" style="z-index: 10000; backdrop-filter: blur(8px);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;"></div>
                <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Deleting Profile...</h2>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteOverlayHtml);
    }
}

function attachEventListeners() {
    // Search
    const searchInput = document.getElementById('staffSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const q = this.value.toLowerCase();
            const filtered = liveStaffData.filter(s => s.name.toLowerCase().includes(q) || s.phone.includes(q));
            renderStaffTable(filtered);
        });
    }

    // Filter Dropdown
    const staffFilterBtn = document.getElementById('btnStaffFilter');
    const staffFilterMenu = document.getElementById('staffFilterMenu');
    if (staffFilterBtn && staffFilterMenu) {
        staffFilterBtn.addEventListener('click', e => { e.stopPropagation(); staffFilterMenu.classList.toggle('show'); });
        staffFilterMenu.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => staffFilterMenu.classList.remove('show'));
        
        const btnApply = document.getElementById('btnStaffFilterApply');
        if (btnApply) btnApply.addEventListener('click', () => staffFilterMenu.classList.remove('show'));
        
        const btnReset = document.getElementById('btnStaffFilterReset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                staffFilterMenu.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
            });
        }
    }

    // ADD Staff Modal logic
    const addStaffModal = document.getElementById('addStaffModal');
    if (addStaffModal) {
        document.getElementById('btnAddStaff')?.addEventListener('click', () => addStaffModal.classList.add('active'));
        document.getElementById('btnCancelAddStaff')?.addEventListener('click', () => addStaffModal.classList.remove('active'));
        document.getElementById('btnCloseAddStaffModal')?.addEventListener('click', () => addStaffModal.classList.remove('active'));
        addStaffModal.addEventListener('click', e => { if (e.target === addStaffModal) addStaffModal.classList.remove('active'); });
        
        document.getElementById('addStaffForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            // TODO: integrate CREATE_STAFF API here
            const toast = document.getElementById('toastNotification');
            if (toast) { toast.textContent = 'Staff member added successfully (demo)'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
            addStaffModal.classList.remove('active');
            this.reset();
        });
    }

    // EDIT Staff logic
    const editStaffModal = document.getElementById('editStaffModal');
    if (editStaffModal) {
        document.getElementById('btnCancelEditStaff')?.addEventListener('click', () => editStaffModal.classList.remove('active'));
        document.getElementById('btnCloseEditStaffModal')?.addEventListener('click', () => editStaffModal.classList.remove('active'));
        editStaffModal.addEventListener('click', e => { if (e.target === editStaffModal) editStaffModal.classList.remove('active'); });

        document.getElementById('editStaffForm')?.addEventListener('submit', async function(e) {
            e.preventDefault();
            // TODO: integrate UPDATE_STAFF API here
            const toast = document.getElementById('toastNotification');
            if (toast) { toast.textContent = 'Staff member updated successfully (demo)'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
            editStaffModal.classList.remove('active');
        });
    }

    // DELETE Staff Logic
    const deleteOverlay = document.getElementById('deleteStaffConfirmOverlay');
    const fullScreenLoader = document.getElementById('fullScreenDeleteStaffLoader');
    if (deleteOverlay) {
        document.getElementById('btnCancelDeleteStaff')?.addEventListener('click', () => {
            deleteOverlay.classList.remove('active');
            staffToDelete = null;
        });

        deleteOverlay.addEventListener('click', (e) => {
            if (e.target === deleteOverlay) {
                deleteOverlay.classList.remove('active');
                staffToDelete = null;
            }
        });

        document.getElementById('btnConfirmDeleteStaff')?.addEventListener('click', async () => {
            if (!staffToDelete) return;
            deleteOverlay.classList.remove('active');
            fullScreenLoader.classList.add('active');

            // TODO: wire up DELETE_STAFF API
            setTimeout(() => {
                fullScreenLoader.classList.remove('active');
                staffToDelete = null;
                const toast = document.getElementById('toastNotification');
                if (toast) { toast.textContent = 'Staff profile deactivated (demo)'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
            }, 800); 
        });
    }
}

async function fetchRolesForDropdown() {
    try {
        let companyId = null;
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = appContext.company?.id || null;
        } catch (e) {}
        const branchId = localStorage.getItem('active_branch_id') || null;

        const response = await fetchWithAuth(API.READ_ROLES, { 
            method: 'POST',
            body: JSON.stringify({ company_id: companyId, branch_id: branchId })
        }, FEATURES.ROLES_PERMISSIONS, 'read');
        if (!response.ok) throw new Error('Failed to fetch roles');
        const data = await response.json();
        
        const roleSelect = document.getElementById('sfRole');
        const editRoleSelect = document.getElementById('editSfRole'); // optional sync
        
        if (roleSelect) roleSelect.innerHTML = '<option value="" disabled selected>Select a role</option>';
        if (editRoleSelect) editRoleSelect.innerHTML = '<option value="" disabled selected>Select a role</option>';
        
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].roles)) {
            data[0].roles.forEach(role => {
                if (roleSelect) {
                    const opt = document.createElement('option');
                    opt.value = role.role_name;
                    opt.textContent = role.role_name;
                    roleSelect.appendChild(opt);
                }
                if (editRoleSelect) {
                    const optUrl = document.createElement('option');
                    optUrl.value = role.role_name;
                    optUrl.textContent = role.role_name;
                    editRoleSelect.appendChild(optUrl);
                }
            });
        } else {
            console.warn('Unexpected roles data structure:', data);
            if(roleSelect) roleSelect.innerHTML = '<option value="" disabled>No roles available</option>';
        }
    } catch (error) {
        console.error('Error fetching roles:', error);
        const roleSelect = document.getElementById('sfRole');
        if (roleSelect) roleSelect.innerHTML = '<option value="" disabled>Error loading roles</option>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initStaff();
});
