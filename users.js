// users.js — Users page logic
import { supabase } from './lib/supabase.js';

(async function () {
    const getCompanyId = () => {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    };

    // ── Role Configs ──────────────────────────────────────────────
    const ROLES = {
        Owner:        { bg: '#fef2f2', color: '#991b1b', dot: '#ef4444' },
        Admin:        { bg: '#eff6ff', color: '#1e40af', dot: '#3b82f6' },
        Manager:      { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
        Receptionist: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
        Staff:        { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    };

    // ── Global State ────────────────────────────────────────────────
    let users = [];
    let availableBranches = [];
    let availableRoles = [];
    let editingId = null;
    let currentUserId = localStorage.getItem('user_id') || null; // optional, to identify self

    // ── Helpers ───────────────────────────────────────────────────
    function initials(name) {
        if (!name) return 'U';
        return name.split(' ').slice(0, 2).map(w => w?.[0]).join('').toUpperCase();
    }

    function avatarColors(name) {
        if (!name) return { bg: '#f1f5f9', color: '#475569' };
        const palettes = [
            { bg: '#dbeafe', color: '#1e40af' },
            { bg: '#d1fae5', color: '#065f46' },
            { bg: '#fdf2f8', color: '#831843' },
            { bg: '#fef3c7', color: '#92400e' },
            { bg: '#ede9fe', color: '#4c1d95' },
        ];
        let hash = 0;
        for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
        return palettes[hash % palettes.length];
    }

    // ── Loaders ───────────────────────────────────────────────────
    async function loadDropdowns() {
        const cid = getCompanyId();
        if (!cid) return;

        try {
            // Load Branches
            const { data: bData } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', cid).eq('status', 'active');
            const uBranch = document.getElementById('uBranch');
            if (uBranch && bData) {
                availableBranches = bData;
                uBranch.innerHTML = '<option value="" disabled selected>Select a branch</option><option value="all">All Branches / Remote</option>';
                bData.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.branch_id;
                    opt.textContent = b.branch_name;
                    uBranch.appendChild(opt);
                });
            }

            // Load Roles
            const { data: rData } = await supabase.from('roles').select('role_id, role_name').eq('company_id', cid);
            const uRole = document.getElementById('uRole');
            if (uRole && rData) {
                availableRoles = rData;
                uRole.innerHTML = '<option value="" disabled selected>Select a role</option>';
                rData.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.role_id;
                    opt.textContent = r.role_name;
                    uRole.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('Error loading dropdowns:', err);
        }
    }

    async function loadUsers() {
        const cid = getCompanyId();
        const tbody = document.getElementById('usersTableBody');
        
        if (!cid) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">Company Authentication missing. Please log out and back in.</td></tr>';
            return;
        }
        
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Loading users...</td></tr>';
        
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('company_id', cid)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            users = data || [];
            renderTable();
        } catch (err) {
            console.error('Error loading users:', err);
            showToast('Failed to load users from database', true);
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">Database logic error: ${err.message || 'Check console'}</td></tr>`;
        }
    }

    // ── Render Table ──────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">No users found. Create one to get started!</td></tr>';
            return;
        }

        users.forEach((u, i) => {
            // Mapping from supabase columns:
            const isCurrentUser = String(u.user_id || u.id) === currentUserId;
            
            // Find role name
            const roleObj = availableRoles.find(r => String(r.role_id) === String(u.role_id));
            const roleDisplay = roleObj ? roleObj.role_name : (u.role_name || 'Staff');
            const roleStyle = ROLES[roleDisplay] || ROLES['Staff'];

            // Find branch name
            let branchDisplay = 'Unknown Branch';
            if (!u.branch_id || String(u.branch_id) === 'all') {
                branchDisplay = 'All Branches';
            } else {
                const branchObj = availableBranches.find(b => String(b.branch_id) === String(u.branch_id));
                if (branchObj) branchDisplay = branchObj.branch_name;
            }

            const isActive  = u.status === 'active';
            const statusDisplay = isActive ? 'Active' : 'Inactive';
            const rowBg     = i % 2 === 0 ? '#fff' : '#fafafa';
            const av        = avatarColors(u.name);
            const isOwner   = roleDisplay.toLowerCase() === 'owner';
            
            // Safe fallback for UI missing timestamps
            const lastLoginText = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never';

            const tr = document.createElement('tr');
            tr.style.cssText = `background:${rowBg};border-bottom:1px solid #f1f5f9;transition:background .15s;`;
            tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
            tr.addEventListener('mouseleave', () => tr.style.background = rowBg);

            tr.innerHTML = `
                <td style="padding:13px 16px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:${av.bg};color:${av.color};display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">${initials(u.name)}</div>
                        <div>
                            <div style="font-weight:600;color:#1e293b;font-size:0.875rem;">${u.name} ${isCurrentUser ? '<span style="font-size:0.7rem;font-weight:600;color:#7c3aed;background:#ede9fe;padding:1px 7px;border-radius:10px;margin-left:4px;">You</span>' : ''}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:13px 16px;color:#475569;font-size:0.875rem;">${u.email}</td>
                <td style="padding:13px 16px;">
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:${roleStyle.bg};color:${roleStyle.color};">
                        <span style="width:6px;height:6px;border-radius:50%;background:${roleStyle.dot};display:inline-block;"></span>
                        ${roleDisplay}
                    </span>
                </td>
                <td style="padding:13px 16px;color:#475569;font-size:0.875rem;">${branchDisplay}</td>
                <td style="padding:13px 16px;">
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:${isActive ? '#dcfce7' : '#f1f5f9'};color:${isActive ? '#166534' : '#475569'};">
                        <span style="width:6px;height:6px;border-radius:50%;background:${isActive ? '#22c55e' : '#94a3b8'};display:inline-block;"></span>
                        ${statusDisplay}
                    </span>
                </td>
                <td style="padding:13px 16px;color:#94a3b8;font-size:0.875rem;">${lastLoginText}</td>
                <td style="padding:13px 24px 13px 16px;text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:6px;">
                        <button class="icon-btn" onclick="window.userAction('edit', '${u.user_id || u.id}')" title="Edit User" style="width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b;transition:all .2s;" onmouseover="this.style.background='#f1f5f9';this.style.color='#1e293b';" onmouseout="this.style.background='#f8fafc';this.style.color='#64748b';"><i data-feather="edit-2" style="width:14px;height:14px;"></i></button>
                        
                        <button class="icon-btn" onclick="window.userAction('reset', '${u.user_id || u.id}')" title="Reset Password" style="width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b;transition:all .2s;" onmouseover="this.style.background='#f1f5f9';this.style.color='#1e293b';" onmouseout="this.style.background='#f8fafc';this.style.color='#64748b';"><i data-feather="key" style="width:14px;height:14px;"></i></button>
                        
                        <button class="icon-btn" onclick="window.userAction('toggle', '${u.user_id || u.id}')" title="${isActive ? 'Deactivate' : 'Activate'}" style="width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:${isActive ? '#22c55e' : '#94a3b8'};transition:all .2s;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='#f8fafc';"><i data-feather="power" style="width:14px;height:14px;"></i></button>
                        
                        ${!isOwner ? `<button class="icon-btn" onclick="window.userAction('delete', '${u.user_id || u.id}')" title="Delete User" style="width:32px;height:32px;border-radius:8px;border:1px solid #fee2e2;background:#fef2f2;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#ef4444;transition:all .2s;" onmouseover="this.style.background='#fee2e2';" onmouseout="this.style.background='#fef2f2';"><i data-feather="trash-2" style="width:14px;height:14px;"></i></button>` : ''}
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });

        if (window.feather) feather.replace();
    }

    // ── User Actions ──────────────────────────────────────────────
    window.userAction = async function (action, id) {
        const user = users.find(u => String(u.user_id || u.id) === String(id));
        if (!user) return; 

        if (action === 'edit') {
            openModal('edit', user);
        } else if (action === 'reset') {
            showToast(\`Password reset link feature pending implementation for \${user.email}\`);
        } else if (action === 'toggle') {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
            try {
                const { error } = await supabase.from('users').update({ status: newStatus }).eq(user.user_id ? 'user_id' : 'id', id);
                if (error) throw error;
                await loadUsers();
                showToast(\`\${user.name} is now \${newStatus}.\`);
            } catch (err) {
                console.error("Error toggling status:", err);
                showToast("Failed to update status", true);
            }
        } else if (action === 'delete') {
            if (!confirm(\`Are you sure you want to delete \${user.name}? This will mark their account as deleted but keep history.\`)) return;
            try {
                const { error } = await supabase.from('users').update({ status: 'deleted' }).eq(user.user_id ? 'user_id' : 'id', id);
                if (error) throw error;
                await loadUsers();
                showToast(\`User "\${user.name}" has been deleted.\`);
            } catch (err) {
                console.error("Error deleting user:", err);
                showToast("Failed to delete user", true);
            }
        }
    };

    // ── Modal ─────────────────────────────────────────────────────
    const overlay  = document.getElementById('userModalOverlay');
    const modalTitle = document.getElementById('userModalTitle');
    const modalSub   = document.getElementById('userModalSubtitle');
    const saveBtn    = document.getElementById('btnSaveUser');

    function openModal(mode, user = null) {
        editingId = null;
        document.getElementById('uFullName').value = '';
        document.getElementById('uEmail').value    = '';
        document.getElementById('uPhone').value    = '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uRole').value     = '';
        document.getElementById('uBranch').value   = '';
        document.getElementById('uStatus').checked = true;

        if (mode === 'edit' && user) {
            editingId = user.user_id || user.id;
            modalTitle.textContent = 'Edit User';
            modalSub.textContent   = \`Update account details for \${user.name}\`;
            saveBtn.textContent    = 'Save Changes';
            
            document.getElementById('uFullName').value = user.name || '';
            document.getElementById('uEmail').value    = user.email || '';
            document.getElementById('uPhone').value    = user.phone || '';
            
            if (user.role_id) document.getElementById('uRole').value = user.role_id;
            if (user.branch_id === null || user.branch_id === 'all') {
                document.getElementById('uBranch').value = 'all';
            } else if (user.branch_id) {
                document.getElementById('uBranch').value = user.branch_id;
            }
            
            document.getElementById('uStatus').checked = user.status === 'active';
        } else {
            modalTitle.textContent = 'Add User';
            modalSub.textContent   = 'Create a new system account.';
            saveBtn.textContent    = 'Create User';
        }

        overlay.classList.add('active');
        if (window.feather) feather.replace();
    }

    function closeModal() {
        overlay.classList.remove('active');
    }

    document.getElementById('btnAddUser').addEventListener('click', () => openModal('add'));
    document.getElementById('closeUserModal').addEventListener('click', closeModal);
    document.getElementById('btnCancelUser').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    saveBtn.addEventListener('click', async () => {
        const name     = document.getElementById('uFullName').value.trim();
        const email    = document.getElementById('uEmail').value.trim();
        const phone    = document.getElementById('uPhone').value.trim();
        const password = document.getElementById('uPassword').value;
        const role_id  = document.getElementById('uRole').value;
        const branch_v = document.getElementById('uBranch').value;
        const active   = document.getElementById('uStatus').checked;
        const cid = getCompanyId();

        if (!name || !email || !role_id || !branch_v) {
            showToast('Please fill in all required fields.', true);
            return;
        }

        if (editingId === null && !password) {
            showToast('Password is required for new users.', true);
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            // Find role name to cache on the user row for convenience
            const rObj = availableRoles.find(r => String(r.role_id) === String(role_id));
            const role_name = rObj ? rObj.role_name : null;
            
            const branch_id = branch_v === 'all' ? null : parseInt(branch_v, 10);
            const status = active ? 'active' : 'inactive';

            const payload = {
                company_id: cid,
                name: name,
                email: email,
                phone: phone,
                role_id: role_id,
                role_name: role_name,
                branch_id: branch_id,
                status: status
            };

            if (password) {
                // we treat this as a simple string since mock hash, but in prod we'd call an auth endpoint
                payload.password_hash = password; 
            }

            if (editingId !== null) {
                const { error } = await supabase.from('users').update(payload).eq(String(editingId).length > 10 ? 'user_id' : 'id', editingId);
                if (error) throw error;
                showToast('User updated successfully!');
            } else {
                // Generate a UUID for user_id manually
                payload.user_id = crypto.randomUUID();
                const { error } = await supabase.from('users').insert([payload]);
                if (error) throw error;
                showToast('User created successfully!');
            }

            closeModal();
            await loadUsers();
        } catch (err) {
            console.error("Error saving user:", err);
            showToast(err.message || 'Failed to save user', true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = editingId !== null ? 'Save Changes' : 'Create User';
        }
    });

    // ── Toast ─────────────────────────────────────────────────────
    function showToast(msg, isError = false) {
        const t = document.getElementById('toastNotification');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast-notification show';
        t.style.background = isError ? '#ef4444' : '';
        setTimeout(() => { t.className = 'toast-notification'; t.style.background = ''; }, 3000);
    }

    // Initialize
    await loadDropdowns();
    await loadUsers();
})();
