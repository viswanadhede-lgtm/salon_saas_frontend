import { supabase } from './lib/supabase.js';
import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';

let liveStaffData = [];

window.fetchStaff = async function() {
    try {
        const company_id = getCompanyId();
        const branch_id = getBranchId();
        if (!company_id || !branch_id) return;

        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('company_id', company_id)
            .eq('branch_id', branch_id)
            .order('staff_name', { ascending: true });
        
        if (error) throw new Error(error.message);
        
        let staffArray = data || [];

        // Filter out soft-deleted staff
        staffArray = staffArray.filter(s => (s.status || '').toLowerCase() !== 'deleted');

        // Update Stat Cards dynamically
        const statTotal = document.getElementById('statTotalStaff');
        const statActive = document.getElementById('statActiveStaff');
        const statOnLeave = document.getElementById('statOnLeave');
        const statOnDuty = document.getElementById('statOnDuty');

        if (statTotal && statActive && statOnLeave && statOnDuty) {
            const statsObj = Array.isArray(data) ? data[0]?.stats : data?.stats;
            
            if (statsObj) {
                statTotal.innerText = statsObj.total_staff !== undefined ? statsObj.total_staff : staffArray.length;
                statActive.innerText = statsObj.active_staff !== undefined ? statsObj.active_staff : staffArray.filter(s => String(s.status).toLowerCase().includes('active')).length;
                statOnLeave.innerText = statsObj.on_leave_today !== undefined ? statsObj.on_leave_today : staffArray.filter(s => String(s.status).toLowerCase().includes('leave')).length;
                statOnDuty.innerText = statsObj.on_duty_today !== undefined ? statsObj.on_duty_today : staffArray.filter(s => String(s.status).toLowerCase().includes('active')).length;
            } else {
                statTotal.innerText = staffArray.length;
                statActive.innerText = staffArray.filter(s => String(s.status).toLowerCase().includes('active')).length;
                statOnLeave.innerText = staffArray.filter(s => String(s.status).toLowerCase().includes('leave')).length;
                statOnDuty.innerText = staffArray.filter(s => String(s.status).toLowerCase().includes('active')).length;
            }
        }

        const avatarColors = ['#6366f1', '#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

        liveStaffData = Array.isArray(staffArray) ? staffArray.map((staff, idx) => {
            const rawName = staff.staff_name || staff.name || 'Unknown Staff';
            const initialsMatches = rawName.match(/\b\w/g) || [];
            let initials = 'U';
            if (initialsMatches.length > 0) {
                initials = (initialsMatches.shift() + (initialsMatches.pop() || '')).substring(0,2).toUpperCase();
            }
            
            return {
                id: staff.staff_id || staff.id,
                name: rawName,
                role: staff.role_name || staff.role || 'Unassigned',
                services: staff.services_offered || staff.services || '-',
                phone: staff.phone || '-',
                email: staff.email || '',
                notes: staff.notes || '',
                status: staff.status || 'active',
                initials: initials,
                color: avatarColors[idx % avatarColors.length]
            };
        }) : [];
        
        renderStaffTable(liveStaffData);
    } catch (error) {
        console.error('Error fetching staff:', error);
        liveStaffData = [];
        const tbody = document.getElementById('staffTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding:40px; text-align:center; color:#ef4444;">Failed to load staff records.</td></tr>`;
    }
};

let staffActiveMenu = null;
let staffToDelete = null;

function getCompanyId() { return localStorage.getItem('company_id') || null; }

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

export async function initStaff() {
    setupModals();
    attachEventListeners();
    await window.fetchStaff();
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
                    <button class="hover-lift" onclick="window.deleteStaff('${s.id}')" title="Delete Staff" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
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
    
    const modal = document.getElementById('editStaffModal');
    if (modal) modal.classList.add('active');
};

window.deleteStaff = function(id) {
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
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Delete Staff?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to delete this staff member? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelDeleteStaff" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
                    <button id="btnConfirmDeleteStaff" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Delete</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay custom-logout-overlay" id="fullScreenDeleteStaffLoader" style="z-index: 10000; backdrop-filter: blur(8px);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;"></div>
                <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Deleting Staff...</h2>
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
            
            const phoneVal = document.getElementById('sfPhone').value.trim();
            // Duplicate Check
            const exists = liveStaffData.find(s => s.phone === phoneVal);
            if (exists) {
                const toast = document.getElementById('toastNotification');
                if (toast) { toast.textContent = 'A staff member with this phone number already exists.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
                return;
            }

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

                const payload = {
                    company_id,
                    branch_id,
                    staff_name: document.getElementById('sfName').value.trim(),
                    phone: phoneVal,
                    email: document.getElementById('sfEmail').value.trim(),
                    role_name: 'Staff',
                    services_offered: document.getElementById('sfServices').value.trim(),
                    notes: document.getElementById('sfNotes').value.trim(),
                    status: document.querySelector('input[name="sfStatus"]:checked')?.value || 'active'
                };

                const { error } = await supabase
                    .from('staff')
                    .insert({
                        company_id,
                        branch_id,
                        staff_name: payload.staff_name,
                        phone: payload.phone,
                        email: payload.email,
                        role_id: payload.role_id,
                        role_name: payload.role_name,
                        services_offered: payload.services_offered,
                        notes: payload.notes,
                        status: payload.status
                    });

                if (error) {
                    throw new Error(error.message || 'Failed to create staff member');
                }

                const toast = document.getElementById('toastNotification');
                if (toast) { 
                    toast.textContent = 'Staff member added successfully'; 
                    toast.classList.add('show'); 
                    setTimeout(() => toast.classList.remove('show'), 3000); 
                }
                
                addStaffModal.classList.remove('active');
                this.reset();
                
                await window.fetchStaff();
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

            const staffId = document.getElementById('editStaffId').value;
            const phoneVal = document.getElementById('editSfPhone').value.trim();
            
            // Duplicate Check
            const exists = liveStaffData.find(s => s.phone === phoneVal && String(s.id) !== String(staffId));
            if (exists) {
                const toast = document.getElementById('toastNotification');
                if (toast) { toast.textContent = 'Another staff member already uses this phone number.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
                return;
            }

            const submitBtn = document.querySelector('button[form="editStaffForm"]');
            const originalText = submitBtn ? submitBtn.innerText : 'Update Staff';
            if (submitBtn) {
                submitBtn.innerText = 'Updating...';
                submitBtn.disabled = true;
            }

            try {
                const company_id = getCompanyId();
                const branch_id = getBranchId();

                if (!company_id || !branch_id) {
                    throw new Error('Missing company or branch context. Please reload or log in again.');
                }

                const payload = {
                    staff_name: document.getElementById('editSfName').value.trim(),
                    phone: phoneVal,
                    email: document.getElementById('editSfEmail').value.trim(),
                    role_name: 'Staff',
                    services_offered: document.getElementById('editSfServices').value.trim(),
                    notes: document.getElementById('editSfNotes').value.trim(),
                    status: document.querySelector('input[name="editSfStatus"]:checked')?.value || 'active'
                };

                const { error } = await supabase
                    .from('staff')
                    .eq('staff_id', staffId)
                    .update(payload);

                if (error) {
                    throw new Error(error.message || 'Failed to update staff member');
                }

                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Staff member updated successfully';
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }

                editStaffModal.classList.remove('active');
                await window.fetchStaff();
            } catch (err) {
                console.error('Error updating staff:', err);
                alert(err.message || 'An error occurred while updating the staff member');
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = originalText;
                    submitBtn.disabled = false;
                }
            }
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

            try {
                const company_id = getCompanyId();
                const branch_id = getBranchId();

                if (!company_id || !branch_id) {
                    throw new Error('Missing company or branch context. Please reload or log in again.');
                }

                let deleteError;
                ({ error: deleteError } = await supabase
                    .from('staff')
                    .eq('id', staffToDelete.id)
                    .update({ status: 'deleted' }));

                if (deleteError) {
                    ({ error: deleteError } = await supabase
                        .from('staff')
                        .eq('staff_id', staffToDelete.id)
                        .update({ status: 'deleted' }));
                }

                if (deleteError) {
                    throw new Error(deleteError.message || 'Failed to delete staff member');
                }

                fullScreenLoader.classList.remove('active');
                staffToDelete = null;

                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Staff member deleted successfully';
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }

                await window.fetchStaff();
            } catch (err) {
                console.error('Error deleting staff:', err);
                fullScreenLoader.classList.remove('active');
                staffToDelete = null;
                alert(err.message || 'An error occurred while deleting the staff member');
            }
        });
    }
}

 

document.addEventListener('DOMContentLoaded', () => {
    initStaff();
});


