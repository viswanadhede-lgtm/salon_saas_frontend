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
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="window.editStaff('${s.id}')" title="Edit Staff" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="window.deactivateStaff('${s.id}')" title="Delete Staff" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    if (window.feather) feather.replace();
}

// The dropdown menu logic has been removed as we now use inline action buttons.

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
    
    // Status radios
    const statusRadios = document.querySelectorAll('input[name="editSfStatus"]');
    statusRadios.forEach(r => r.checked = (r.value === staff.status));
    
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
                            <input type="tel" id="editSfPhone" class="form-input" placeholder="9876543210" pattern="[0-9]{10}" maxlength="10" title="Please enter exactly 10 digits" required>
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
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editSfNotes">Notes <span style="font-weight:400; color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editSfNotes" class="form-input form-textarea" style="min-height:50px;"></textarea>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">Status</label>
                            <div style="display:flex; gap:12px; flex-wrap:wrap; padding-top:8px;">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editSfStatus" value="active" style="accent-color:#1e3a8a;"> Active
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editSfStatus" value="on-leave" style="accent-color:#1e3a8a;"> On Leave
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                                    <input type="radio" name="editSfStatus" value="inactive" style="accent-color:#1e3a8a;"> Inactive
                                </label>
                            </div>
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
        
        document.getElementById('addStaffForm')?.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = document.querySelector('button[form="addStaffForm"]');
            const originalText = submitBtn ? submitBtn.innerText : 'Save Staff';
            if (submitBtn) {
                submitBtn.innerText = 'Saving...';
                submitBtn.disabled = true;
            }

            try {
                const company_id = getCompanyId();
                const branch_id = getBranchId();

                if (!company_id || !branch_id) {
                    throw new Error("Missing company or branch context. Please reload or log in again.");
                }

                const roleSelect = document.getElementById('sfRole');
                const selectedRoleOption = roleSelect.options[roleSelect.selectedIndex];

                const payload = {
                    company_id,
                    branch_id,
                    staff_name: document.getElementById('sfName').value.trim(),
                    phone: document.getElementById('sfPhone').value.trim(),
                    email: document.getElementById('sfEmail').value.trim(),
                    role_id: selectedRoleOption?.dataset?.id || '',
                    role_name: roleSelect.value,
                    services_offered: document.getElementById('sfServices').value.trim(),
                    notes: document.getElementById('sfNotes').value.trim(),
                    status: document.querySelector('input[name="sfStatus"]:checked')?.value || 'active'
                };

                const response = await fetchWithAuth(API.CREATE_STAFF, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }, FEATURES.STAFF_MANAGEMENT, 'create');

                if (!response.ok) {
                    const errorData = await response.json().catch(()=>({}));
                    throw new Error(errorData.message || 'Failed to create staff member');
                }

                const toast = document.getElementById('toastNotification');
                if (toast) { 
                    toast.textContent = 'Staff member added successfully'; 
                    toast.classList.add('show'); 
                    setTimeout(() => toast.classList.remove('show'), 3000); 
                }
                
                addStaffModal.classList.remove('active');
                this.reset();
                
                // TODO: Re-fetch the staff list when READ_STAFF API is implemented
            } catch (err) {
                console.error("Error creating staff:", err);
                alert(err.message || 'An error occurred while creating the staff member');
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = originalText;
                    submitBtn.disabled = false;
                }
            }
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
                    opt.dataset.id = role.role_id || '';
                    opt.textContent = role.role_name;
                    roleSelect.appendChild(opt);
                }
                if (editRoleSelect) {
                    const optUrl = document.createElement('option');
                    optUrl.value = role.role_name;
                    optUrl.dataset.id = role.role_id || '';
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
