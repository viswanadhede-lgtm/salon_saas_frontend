// users.js — Users page logic

(function () {
    // ── Role Configs ──────────────────────────────────────────────
    const ROLES = {
        Owner:        { bg: '#fef2f2', color: '#991b1b', dot: '#ef4444' },
        Admin:        { bg: '#eff6ff', color: '#1e40af', dot: '#3b82f6' },
        Manager:      { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
        Receptionist: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
        Staff:        { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    };

    // ── Mock Data ─────────────────────────────────────────────────
    let users = [
        { id: 1, name: 'Admin User',     email: 'admin@shubhasalon.com',  role: 'Owner',        branch: 'All Branches', status: 'Active',   lastLogin: 'Today',      isCurrentUser: true,  isOwner: true },
        { id: 2, name: 'Rahul Sharma',   email: 'rahul@shubhasalon.com',  role: 'Admin',        branch: 'Downtown',    status: 'Active',   lastLogin: 'Yesterday',  isCurrentUser: false, isOwner: false },
        { id: 3, name: 'Priya Singh',    email: 'priya@shubhasalon.com',  role: 'Manager',      branch: 'Whitefield',  status: 'Active',   lastLogin: '2 days ago', isCurrentUser: false, isOwner: false },
        { id: 4, name: 'Anil Kumar',     email: 'anil@shubhasalon.com',   role: 'Receptionist', branch: 'Downtown',    status: 'Active',   lastLogin: '3 days ago', isCurrentUser: false, isOwner: false },
        { id: 5, name: 'Sneha Patel',    email: 'sneha@shubhasalon.com',  role: 'Staff',        branch: 'Airport Road',status: 'Inactive', lastLogin: '2 weeks ago',isCurrentUser: false, isOwner: false },
    ];

    let activeUserId = null;

    // ── Helpers ───────────────────────────────────────────────────
    function initials(name) {
        return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }

    function avatarColors(name) {
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

    // ── Render Table ──────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        users.forEach((u, i) => {
            const roleStyle = ROLES[u.role] || ROLES['Staff'];
            const isActive  = u.status === 'Active';
            const rowBg     = i % 2 === 0 ? '#fff' : '#fafafa';
            const av        = avatarColors(u.name);

            const tr = document.createElement('tr');
            tr.style.cssText = `background:${rowBg};border-bottom:1px solid #f1f5f9;transition:background .15s;`;
            tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
            tr.addEventListener('mouseleave', () => tr.style.background = rowBg);

            tr.innerHTML = `
                <td style="padding:13px 16px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:${av.bg};color:${av.color};display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">${initials(u.name)}</div>
                        <div>
                            <div style="font-weight:600;color:#1e293b;font-size:0.875rem;">${u.name} ${u.isCurrentUser ? '<span style="font-size:0.7rem;font-weight:600;color:#7c3aed;background:#ede9fe;padding:1px 7px;border-radius:10px;margin-left:4px;">You</span>' : ''}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:13px 16px;color:#475569;font-size:0.875rem;">${u.email}</td>
                <td style="padding:13px 16px;">
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:${roleStyle.bg};color:${roleStyle.color};">
                        <span style="width:6px;height:6px;border-radius:50%;background:${roleStyle.dot};display:inline-block;"></span>
                        ${u.role}
                    </span>
                </td>
                <td style="padding:13px 16px;color:#475569;font-size:0.875rem;">${u.branch}</td>
                <td style="padding:13px 16px;">
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;background:${isActive ? '#dcfce7' : '#f1f5f9'};color:${isActive ? '#166534' : '#475569'};">
                        <span style="width:6px;height:6px;border-radius:50%;background:${isActive ? '#22c55e' : '#94a3b8'};display:inline-block;"></span>
                        ${u.status}
                    </span>
                </td>
                <td style="padding:13px 16px;color:#94a3b8;font-size:0.875rem;">${u.lastLogin}</td>
                <td style="padding:13px 24px 13px 16px;text-align:right;">
                    <button data-uid="${u.id}" class="ua-trigger" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.1rem;font-weight:700;letter-spacing:0.02em;transition:all .2s;"
                        onmouseover="this.style.background='#f8fafc';this.style.color='#1e293b';"
                        onmouseout="this.style.background='none';this.style.color='#64748b';">···</button>
                </td>`;
            tbody.appendChild(tr);
        });

        // Bind trigger buttons
        document.querySelectorAll('.ua-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const uid = parseInt(btn.dataset.uid);
                openActionsDropdown(uid, btn);
            });
        });

        if (window.feather) feather.replace();
    }

    // ── Actions Dropdown ──────────────────────────────────────────
    const dropdown = document.getElementById('userActionsDropdown');

    function openActionsDropdown(uid, btn) {
        activeUserId = uid;
        const user = users.find(u => u.id === uid);
        const rect = btn.getBoundingClientRect();

        // Build items
        const isActive = user.status === 'Active';
        dropdown.innerHTML = `
            <style>
                .ua-dd-item { display:flex;align-items:center;gap:9px;width:100%;padding:9px 12px;border:none;background:none;cursor:pointer;font-size:0.875rem;color:#1e293b;border-radius:6px;text-align:left;transition:background .15s; }
                .ua-dd-item:hover { background:#f1f5f9; }
                .ua-dd-item.danger { color:#ef4444; }
                .ua-dd-item.danger:hover { background:#fef2f2; }
                .ua-dd-item svg { width:15px;height:15px;stroke-width:2; }
            </style>
            <button class="ua-dd-item" onclick="window.userAction('edit')"><i data-feather="edit-2"></i> Edit User</button>
            <button class="ua-dd-item" onclick="window.userAction('reset')"><i data-feather="key"></i> Reset Password</button>
            <button class="ua-dd-item" onclick="window.userAction('toggle')"><i data-feather="power"></i> ${isActive ? 'Deactivate' : 'Activate'}</button>
            ${!user.isOwner ? '<div style="height:1px;background:#f1f5f9;margin:4px 0;"></div><button class="ua-dd-item danger" onclick="window.userAction(\'delete\')"><i data-feather="trash-2"></i> Delete</button>' : ''}
        `;

        dropdown.style.display = 'block';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = (rect.left - 130) + 'px';
        if (window.feather) feather.replace();
    }

    function closeDropdown() {
        dropdown.style.display = 'none';
        activeUserId = null;
    }

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) closeDropdown();
    });

    // ── User Actions ──────────────────────────────────────────────
    window.userAction = function (action) {
        closeDropdown();
        const user = users.find(u => u.id === activeUserId || u.id === (activeUserId));
        if (!user) return; // guard

        if (action === 'edit') {
            openModal('edit', user);
        } else if (action === 'reset') {
            showToast(`Password reset link sent to ${user.email}`);
        } else if (action === 'toggle') {
            user.status = user.status === 'Active' ? 'Inactive' : 'Active';
            renderTable();
            showToast(`${user.name} is now ${user.status}.`);
        } else if (action === 'delete') {
            const idx = users.findIndex(u => u.id === (activeUserId));
            if (idx > -1) {
                const name = users[idx].name;
                users.splice(idx, 1);
                renderTable();
                showToast(`User "${name}" has been deleted.`);
            }
        }
    };

    // ── Modal ─────────────────────────────────────────────────────
    const overlay  = document.getElementById('userModalOverlay');
    const modalTitle = document.getElementById('userModalTitle');
    const modalSub   = document.getElementById('userModalSubtitle');
    const saveBtn    = document.getElementById('btnSaveUser');
    let editingId = null;

    function openModal(mode, user = null) {
        editingId = null;
        document.getElementById('uFullName').value = '';
        document.getElementById('uEmail').value    = '';
        document.getElementById('uPhone').value    = '';
        document.getElementById('uRole').value     = '';
        document.getElementById('uBranch').value   = '';
        document.getElementById('uStatus').checked = true;

        if (mode === 'edit' && user) {
            editingId = user.id;
            modalTitle.textContent = 'Edit User';
            modalSub.textContent   = `Update account details for ${user.name}`;
            saveBtn.textContent    = 'Save Changes';
            document.getElementById('uFullName').value = user.name;
            document.getElementById('uEmail').value    = user.email;
            document.getElementById('uRole').value     = user.role;
            document.getElementById('uBranch').value   = user.branch;
            document.getElementById('uStatus').checked = user.status === 'Active';
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

    saveBtn.addEventListener('click', () => {
        const name   = document.getElementById('uFullName').value.trim();
        const email  = document.getElementById('uEmail').value.trim();
        const role   = document.getElementById('uRole').value;
        const branch = document.getElementById('uBranch').value;
        const active = document.getElementById('uStatus').checked;

        if (!name || !email || !role || !branch) {
            showToast('Please fill in all required fields.', true);
            return;
        }

        if (editingId !== null) {
            const u = users.find(u => u.id === editingId);
            if (u) { u.name = name; u.email = email; u.role = role; u.branch = branch; u.status = active ? 'Active' : 'Inactive'; }
            showToast('User updated successfully!');
        } else {
            users.push({ id: Date.now(), name, email, role, branch, status: active ? 'Active' : 'Inactive', lastLogin: 'Never', isCurrentUser: false, isOwner: false });
            showToast('User created successfully!');
        }

        closeModal();
        renderTable();
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

    // ── Init ──────────────────────────────────────────────────────
    renderTable();
})();
