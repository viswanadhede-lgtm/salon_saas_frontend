import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    const tbody = document.getElementById('branchesTableBody');
    let branchesData = [];

    const companyId = localStorage.getItem('company_id');
    if (!companyId) {
        console.warn('No company_id found in localStorage');
        showToast('Please sign in to view branches', 'error');
        return;
    }

    // ── Fetch from Supabase ────────────────────────────────────────────────
    async function loadBranches() {
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('branch_id, branch_name, branch_address, branch_phone, status')
                .eq('company_id', companyId);

            if (error) throw error;
            branchesData = data || [];
            renderTable();
        } catch (err) {
            console.error('Error fetching branches:', err);
            showToast('Failed to load branches.', 'error');
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

            const tr = document.createElement('tr');
            tr.style.cssText = `background:${rowBg}; border-bottom:1px solid #f1f5f9; transition:background 0.15s;`;
            tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
            tr.addEventListener('mouseleave', () => tr.style.background = rowBg);

            tr.innerHTML = `
                <td style="padding:14px 16px; font-weight:600; color:#1e293b;">${branch.branch_name || 'N/A'}</td>
                <td style="padding:14px 16px; color:#475569;">${branch.branch_address || 'N/A'}</td>
                <td style="padding:14px 16px; color:#475569;">Assigned Manager</td>
                <td style="padding:14px 16px; color:#475569;">${branch.branch_phone || 'N/A'}</td>
                <td style="padding:14px 16px;">
                    <span style="${statusStyle}">
                        <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td style="padding:14px 24px 14px 16px; text-align:right;">
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button onclick="openPanel('edit', '${branch.branch_id}')" title="Edit" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#f8fafc';this.style.color='#1e293b'" onmouseout="this.style.background='none';this.style.color='#64748b'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="toggleStatus('${branch.branch_id}')" title="${isActive ? 'Deactivate' : 'Activate'}" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#f8fafc';this.style.color='#1e293b'" onmouseout="this.style.background='none';this.style.color='#64748b'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                        </button>
                        <button onclick="deleteBranch('${branch.branch_id}')" title="Delete" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#fef2f2';this.style.borderColor='#fecaca';this.style.color='#ef4444'" onmouseout="this.style.background='none';this.style.borderColor='#e2e8f0';this.style.color='#64748b'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (window.feather) feather.replace();
    }

    loadBranches(); // Initial load

    // ── Panel Logic ─────────────────────────────────────────────────────────
    const panel = document.getElementById('branchPanel');
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
        document.getElementById('branchName').value = '';
        document.getElementById('branchAddress').value = '';
        document.getElementById('branchPhone').value = '';
        document.getElementById('branchEmail').value = '';
        document.getElementById('branchCity').value = '';

        if (mode === 'edit' && branchId !== null) {
            const branch = branchesData.find(b => b.branch_id === branchId);
            title.textContent = 'Edit Branch';
            subtitle.textContent = `Update details for ${branch.branch_name}`;
            
            document.getElementById('branchName').value = branch.branch_name || '';
            document.getElementById('branchAddress').value = branch.branch_address || '';
            document.getElementById('branchPhone').value = branch.branch_phone || '';
            document.getElementById('branchStatusToggle').checked = (branch.status === 'active');
            // Assuming branchCity might be parsed from address later, leaving as mapped to address
            document.getElementById('branchCity').value = branch.branch_address ? branch.branch_address.split(',')[0] : '';
            
        } else {
            title.textContent = 'Add Branch';
            subtitle.textContent = 'Create a new physical location.';
            document.getElementById('branchStatusToggle').checked = true;
        }

        overlay.classList.add('active');
        if (window.feather) feather.replace();
    };

    window.toggleStatus = async function (id) {
        const branch = branchesData.find(b => b.branch_id === id);
        if (branch) {
            const newStatus = branch.status === 'active' ? 'inactive' : 'active';
            
            try {
                const { error } = await supabase
                    .from('branches')
                    .eq('branch_id', id)
                    .update({ status: newStatus });
                    
                if (error) throw error;
                
                branch.status = newStatus;
                renderTable();
                showToast(`Branch "${branch.branch_name}" is now ${newStatus}.`, 'success');
            } catch (err) {
                console.error("Error toggling branch status:", err);
                showToast("Failed to update status", 'error');
            }
        }
    };

    window.deleteBranch = async function (id) {
        if (!confirm('Are you sure you want to delete this branch?')) return;
        
        try {
            const { error } = await supabase
                .from('branches')
                .eq('branch_id', id)
                .delete();
                
            if (error) throw error;
            
            branchesData = branchesData.filter(b => b.branch_id !== id);
            renderTable();
            showToast(`Branch has been deleted.`, 'success');
        } catch (err) {
            console.error("Error deleting branch:", err);
            showToast("Failed to delete branch", 'error');
        }
    };

    function closePanel() {
        overlay.classList.remove('active');
        currentEditId = null;
    }

    btnAdd.addEventListener('click', () => openPanel('add'));
    btnClose.addEventListener('click', closePanel);
    btnCancel.addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePanel();
        }
    });

    btnSave.addEventListener('click', async () => {
        const btn = document.getElementById('btnSaveBranch');
        const oText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;
        
        try {
            const name = document.getElementById('branchName').value.trim();
            const address = document.getElementById('branchAddress').value.trim();
            const phone = document.getElementById('branchPhone').value.trim();
            const email = document.getElementById('branchEmail').value.trim();
            const isActive = document.getElementById('branchStatusToggle').checked;
            
            if (!name) {
                showToast('Branch name is required', 'error');
                return;
            }

            const payload = {
                branch_name: name,
                branch_address: address,
                branch_phone: phone,
                branch_email: email,
                status: isActive ? 'active' : 'inactive'
            };

            if (currentEditId) {
                // Update
                const { error } = await supabase
                    .from('branches')
                    .eq('branch_id', currentEditId)
                    .update({ ...payload, updated_at: new Date().toISOString() });
                if (error) throw error;
                showToast('Branch updated successfully!', 'success');
            } else {
                // Insert
                payload.company_id = companyId;
                const { error } = await supabase
                    .from('branches')
                    .insert(payload);
                if (error) throw error;
                showToast('Branch added successfully!', 'success');
            }
            
            closePanel();
            await loadBranches(); // reload table
            
        } catch (err) {
            console.error('Save error:', err);
            showToast('Failed to save branch.', 'error');
        } finally {
            btn.textContent = oText;
            btn.disabled = false;
        }
    });

    function showToast(msg, type='success') {
        const toast = document.getElementById('toastNotification');
        if (toast) {
            toast.textContent = msg;
            toast.className = `toast-notification show ${type === 'error' ? 'toast-error' : ''}`;
            setTimeout(() => { toast.className = 'toast-notification'; }, 3000);
        }
    }
});
