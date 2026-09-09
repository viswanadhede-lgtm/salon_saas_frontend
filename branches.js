import { supabase } from './lib/supabase.js';
import { populateGlobalHeader } from './scripts/global-auth-guard.js';

document.addEventListener('DOMContentLoaded', async () => {

    const tbody = document.getElementById('branchesTableBody');
    let branchesData = [];
    let companyUsers = [];

    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch (e) {}
        return localStorage.getItem('company_id') || null;
    }

    let companyId = getCompanyId();
    if (!companyId) {
        // Wait slightly if auth guard is initializing
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('No company_id found in localStorage');
        showToast('Please sign in to view branches', 'error');
        return;
    }

    // ── Fetch Company Users for Manager selection ───────────────────────────
    async function loadCompanyUsers() {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('user_id, id, name, role_name, email')
                .eq('company_id', companyId)
                .neq('status', 'deleted');

            if (!error && data) {
                companyUsers = data;
                populateManagerDropdown();
            }
        } catch (err) {
            console.warn('Error loading company users for managers:', err);
        }
    }

    function populateManagerDropdown(selectedManagerId = '') {
        const select = document.getElementById('branchManager');
        if (!select) return;
        select.innerHTML = '<option value="">Unassigned / None</option>';
        companyUsers.forEach(u => {
            const uid = u.user_id || u.id;
            const opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = `${u.name || 'User'} (${u.role_name || 'Staff'})`;
            if (selectedManagerId && String(selectedManagerId) === String(uid)) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }

    // ── Fetch Branches from Supabase ───────────────────────────────────────
    async function loadBranches() {
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .eq('company_id', companyId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: true });

            if (error) throw error;
            branchesData = data || [];
            renderTable();
            updateGlobalContext();
        } catch (err) {
            console.error('Error fetching branches:', err);
            showToast('Failed to load branches.', 'error');
        }
    }

    // ── Sync Global Context ───────────────────────────────────────────────
    function updateGlobalContext() {
        try {
            const contextStr = localStorage.getItem('appContext');
            if (!contextStr) return;
            const context = JSON.parse(contextStr);

            // Keep only active branches for the global switcher
            const activeBranches = branchesData.filter(b => b.status === 'active');
            
            context.branches = activeBranches.map(b => ({
                id: b.branch_id,
                branch_id: b.branch_id,
                branch_name: b.branch_name
            }));

            localStorage.setItem('appContext', JSON.stringify(context));
            if (typeof populateGlobalHeader === 'function') {
                populateGlobalHeader(); // Instantly update header dropdown
            }
        } catch (e) {
            console.error('Failed to sync global context:', e);
        }
    }

    // ── Populate Table ──────────────────────────────────────────────────────
    function renderTable() {
        tbody.innerHTML = '';
        if (branchesData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #64748b;">No branches found. Click 'Add Branch' to create one.</td></tr>`;
            return;
        }

        branchesData.forEach((branch, i) => {
            const isActive = branch.status === 'active';
            const statusStyle = isActive
                ? 'display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#dcfce7;color:#166534;'
                : 'display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#f1f5f9;color:#475569;';
            const dotColor = isActive ? '#22c55e' : '#94a3b8';
            const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';

            // Find assigned manager name
            let managerDisplay = 'Unassigned';
            if (branch.manager_user_id) {
                const mgr = companyUsers.find(u => String(u.user_id || u.id) === String(branch.manager_user_id));
                if (mgr) {
                    managerDisplay = mgr.name || 'Assigned';
                }
            }

            // Formatted address display
            const displayAddress = branch.branch_address || 
                [branch.address_line_1, branch.city, branch.state].filter(Boolean).join(', ') || 
                'N/A';

            const tr = document.createElement('tr');
            tr.style.cssText = `background:${rowBg}; border-bottom:1px solid #f1f5f9; transition:background 0.15s;`;
            tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
            tr.addEventListener('mouseleave', () => tr.style.background = rowBg);

            tr.innerHTML = `
                <td style="padding:14px 16px; font-weight:600; color:#1e293b;">
                    <div>${escapeHtml(branch.branch_name || 'Unnamed Branch')}</div>
                    ${branch.branch_code ? `<div style="font-size:0.75rem; color:#94a3b8; font-weight:400;">Code: ${escapeHtml(branch.branch_code)}</div>` : ''}
                </td>
                <td style="padding:14px 16px; text-align:center; color:#475569; max-width:240px; word-break:break-word;">
                    ${escapeHtml(displayAddress)}
                    ${branch.google_maps_url ? `<div><a href="${escapeHtml(branch.google_maps_url)}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:#3b82f6; text-decoration:none;">View Map &rarr;</a></div>` : ''}
                </td>
                <td style="padding:14px 16px; color:#475569;">${escapeHtml(managerDisplay)}</td>
                <td style="padding:14px 16px; color:#475569;">
                    <div>${escapeHtml(branch.branch_phone || 'N/A')}</div>
                    ${branch.branch_email ? `<div style="font-size:0.75rem; color:#94a3b8;">${escapeHtml(branch.branch_email)}</div>` : ''}
                </td>
                <td style="padding:14px 16px;">
                    <span style="${statusStyle}">
                        <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td style="padding:14px 16px; text-align:center;">
                    <div style="display:flex; gap:8px; justify-content:center;">
                        <button class="hover-lift" onclick="openPanel('edit', '${branch.branch_id}')" data-sub-feature="branch_update" title="Edit Branch" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; min-width:54px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px; font-weight:600;">Edit</span>
                        </button>
                        ${isActive ? `
                        <button class="hover-lift" onclick="toggleStatus('${branch.branch_id}')" data-sub-feature="branch_update" title="Deactivate Branch" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 8px; border-radius:8px; border:1px solid #fef3c7; background:#fffbeb; cursor:pointer; color:#b45309; min-width:64px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                            <span style="font-size:10px; font-weight:600;">Deactivate</span>
                        </button>
                        ` : `
                        <button class="hover-lift" onclick="toggleStatus('${branch.branch_id}')" data-sub-feature="branch_update" title="Activate Branch" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 8px; border-radius:8px; border:1px solid #bbf7d0; background:#f0fdf4; cursor:pointer; color:#16a34a; min-width:64px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            <span style="font-size:10px; font-weight:600;">Activate</span>
                        </button>
                        `}
                        <button class="hover-lift" onclick="deleteBranch('${branch.branch_id}')" data-sub-feature="branch_delete" title="Delete Branch" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; min-width:54px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            <span style="font-size:10px; font-weight:600;">Delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (window.feather) feather.replace();

        if (window.applySubFeatureGates) {
            window.applySubFeatureGates();
        }
    }

    // Initial sequence
    await loadCompanyUsers();
    await loadBranches();

    // ── Panel Logic ─────────────────────────────────────────────────────────
    const overlay = document.getElementById('branchPanelOverlay');
    const btnAdd = document.getElementById('btnAddBranch');
    const btnClose = document.getElementById('btnClosePanel');
    const btnCancel = document.getElementById('btnCancelBranch');
    const btnSave = document.getElementById('btnSaveBranch');

    let currentEditId = null;

    window.openPanel = function (mode, branchId = null) {
        const title = document.getElementById('panelTitle');
        const subtitle = document.getElementById('panelSubtitle');
        currentEditId = branchId;

        // Reset form
        setVal('branchName', '');
        setVal('branchCode', '');
        setVal('branchPhone', '');
        setVal('branchEmail', '');
        setVal('branchAddress', '');
        setVal('branchCity', '');
        setVal('branchState', '');
        setVal('branchZip', '');
        setVal('branchCountry', 'India');
        setVal('branchMapsUrl', '');

        if (mode === 'edit' && branchId !== null) {
            const branch = branchesData.find(b => b.branch_id === branchId);
            if (!branch) return;

            title.textContent = 'Edit Branch';
            subtitle.textContent = `Update details for ${branch.branch_name}`;
            btnSave.textContent = 'Update Branch';

            setVal('branchName', branch.branch_name || '');
            setVal('branchCode', branch.branch_code || '');
            setVal('branchPhone', branch.branch_phone || '');
            setVal('branchEmail', branch.branch_email || '');
            setVal('branchAddress', branch.address_line_1 || branch.branch_address || '');
            setVal('branchCity', branch.city || '');
            setVal('branchState', branch.state || '');
            setVal('branchZip', branch.pin_code || '');
            setVal('branchCountry', branch.country || 'India');
            setVal('branchMapsUrl', branch.google_maps_url || '');

            populateManagerDropdown(branch.manager_user_id || '');
            document.getElementById('branchStatusToggle').checked = (branch.status === 'active');

        } else {
            title.textContent = 'Add Branch';
            subtitle.textContent = 'Create a new physical location.';
            populateManagerDropdown('');
            document.getElementById('branchStatusToggle').checked = true;
            btnSave.textContent = 'Save Branch';
        }

        overlay.classList.add('active');
        if (window.feather) feather.replace();
    };

    window.toggleStatus = async function (id) {
        const branch = branchesData.find(b => b.branch_id === id);
        if (branch) {
            const newStatus = branch.status === 'active' ? 'inactive' : 'active';
            const now = new Date().toISOString();

            try {
                const { error } = await supabase
                    .from('branches')
                    .eq('branch_id', id)
                    .update({ 
                        status: newStatus,
                        updated_at: now
                    });

                if (error) throw error;

                branch.status = newStatus;
                branch.updated_at = now;
                renderTable();
                updateGlobalContext();
                showToast(`Branch "${branch.branch_name}" is now ${newStatus}.`, 'success');
            } catch (err) {
                console.error("Error toggling branch status:", err);
                showToast("Failed to update status", 'error');
            }
        }
    };

    // ── Confirm Delete Modal Logic ──────────────────────────────────────────
    let branchToDeleteId = null;

    function injectDeleteModal() {
        const style = document.createElement('style');
        style.textContent = `
            #deleteBranchBackdrop { display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); z-index: 99999; align-items: center; justify-content: center; }
            #deleteBranchBackdrop.active { display: flex; }
            #deleteBranchBox { background: #fff; border-radius: 16px; padding: 2rem 2rem 1.5rem; width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); text-align: center; animation: logoutFadeIn 0.2s ease; }
            #deleteBranchBox .delete-icon { width: 52px; height: 52px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; }
            #deleteBranchBox .delete-icon svg { color: #ef4444; width: 24px; height: 24px; }
            #deleteBranchBox h3 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 0 0 0.4rem; }
            #deleteBranchBox p { font-size: 0.875rem; color: #64748b; margin: 0 0 1.5rem; line-height: 1.4; }
            #deleteBranchBox .delete-actions { display: flex; gap: 0.75rem; }
            #deleteBranchBox .btn-cancel-delete { flex: 1; padding: 0.65rem 1rem; border-radius: 8px; border: 1.5px solid #e2e8f0; background: #fff; font-size: 0.875rem; font-weight: 600; color: #475569; cursor: pointer; transition: background 0.15s; }
            #deleteBranchBox .btn-cancel-delete:hover { background: #f8fafc; }
            #deleteBranchBox .btn-confirm-delete { flex: 1; padding: 0.65rem 1rem; border-radius: 8px; border: none; background: #ef4444; font-size: 0.875rem; font-weight: 600; color: #fff; cursor: pointer; transition: background 0.15s; }
            #deleteBranchBox .btn-confirm-delete:hover { background: #dc2626; }
        `;
        document.head.appendChild(style);

        const backdrop = document.createElement('div');
        backdrop.id = 'deleteBranchBackdrop';
        backdrop.innerHTML = `
            <div id="deleteBranchBox">
                <div class="delete-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </div>
                <h3>Delete Branch</h3>
                <p>Are you sure you want to delete this branch?<br>This action cannot be undone.</p>
                <div class="delete-actions">
                    <button class="btn-cancel-delete" id="delBranchCancelBtn">Cancel</button>
                    <button class="btn-confirm-delete" id="delBranchConfirmBtn">Yes, Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        document.getElementById('delBranchCancelBtn').addEventListener('click', closeDeleteModal);
        document.getElementById('delBranchConfirmBtn').addEventListener('click', performDeleteBranch);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDeleteModal(); });
    }

    function closeDeleteModal() {
        document.getElementById('deleteBranchBackdrop')?.classList.remove('active');
        branchToDeleteId = null;
    }

    window.deleteBranch = function (id) {
        if (!document.getElementById('deleteBranchBackdrop')) injectDeleteModal();
        branchToDeleteId = id;
        document.getElementById('deleteBranchBackdrop').classList.add('active');
    };

    async function performDeleteBranch() {
        const id = branchToDeleteId;
        if (!id) return;
        closeDeleteModal();
        
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('branches')
                .eq('branch_id', id)
                .update({ 
                    status: 'deleted',
                    updated_at: now
                });
                
            if (error) throw error;
            
            branchesData = branchesData.filter(b => b.branch_id !== id);
            renderTable();
            updateGlobalContext();
            showToast('Branch has been deleted.', 'success');
        } catch (err) {
            console.error("Error deleting branch:", err);
            showToast("Failed to delete branch", 'error');
        }
    }

    function closePanel() {
        overlay.classList.remove('active');
        currentEditId = null;
    }

    if (btnAdd) btnAdd.addEventListener('click', () => openPanel('add'));
    if (btnClose) btnClose.addEventListener('click', closePanel);
    if (btnCancel) btnCancel.addEventListener('click', closePanel);
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePanel();
            }
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const name = getVal('branchName');
            const phone = getVal('branchPhone');
            const address = getVal('branchAddress');
            const city = getVal('branchCity');
            const state = getVal('branchState');
            const zip = getVal('branchZip');
            const country = getVal('branchCountry') || 'India';
            const email = getVal('branchEmail');
            const code = getVal('branchCode');
            const managerId = getVal('branchManager');
            const mapsUrl = getVal('branchMapsUrl');
            const isActive = document.getElementById('branchStatusToggle')?.checked ?? true;

            if (!name) {
                showToast('Branch name is required', 'error');
                document.getElementById('branchName')?.focus();
                return;
            }
            if (!phone) {
                showToast('Phone number is required', 'error');
                document.getElementById('branchPhone')?.focus();
                return;
            }
            if (!address) {
                showToast('Address line is required', 'error');
                document.getElementById('branchAddress')?.focus();
                return;
            }

            const oText = btnSave.textContent;
            btnSave.textContent = 'Saving...';
            btnSave.disabled = true;

            try {
                const now = new Date().toISOString();
                const compositeAddress = [address, city, state, zip, country !== 'India' ? country : ''].filter(Boolean).join(', ');

                const commonPayload = {
                    branch_name:     name,
                    branch_code:     code || null,
                    manager_user_id: managerId || null,
                    branch_phone:    phone,
                    branch_email:    email || null,
                    address_line_1:  address,
                    branch_address:  compositeAddress || address,
                    city:            city || null,
                    state:           state || null,
                    pin_code:        zip || null,
                    country:         country || 'India',
                    google_maps_url: mapsUrl || null,
                    status:          isActive ? 'active' : 'inactive',
                    updated_at:      now
                };

                if (currentEditId) {
                    // Update existing branch (preserve created_at)
                    const { error } = await supabase
                        .from('branches')
                        .eq('branch_id', currentEditId)
                        .update(commonPayload);

                    if (error) throw error;
                    showToast('Branch updated successfully!', 'success');
                } else {
                    // Insert new branch (write created_at & updated_at)
                    const insertPayload = {
                        company_id: companyId,
                        ...commonPayload,
                        created_at: now
                    };

                    const { error } = await supabase
                        .from('branches')
                        .insert(insertPayload);

                    if (error) throw error;
                    showToast('Branch added successfully!', 'success');
                }

                closePanel();
                await loadBranches(); // reload table & global context

            } catch (err) {
                console.error('Save error:', err);
                showToast(err.message || 'Failed to save branch.', 'error');
            } finally {
                btnSave.textContent = oText;
                btnSave.disabled = false;
            }
        });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(msg, type = 'success') {
        let toast = document.getElementById('toastNotification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toastNotification';
            toast.className = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.className = `toast-notification show ${type === 'error' ? 'toast-error' : ''}`;
        setTimeout(() => { toast.className = 'toast-notification'; }, 3200);
    }
});
