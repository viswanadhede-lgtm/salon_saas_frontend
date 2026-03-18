document.addEventListener('DOMContentLoaded', () => {

    // Mock Data
    const branches = [
        { id: 1, name: 'Downtown Branch', city: 'Bangalore', manager: 'Rahul Sharma', phone: '+91 9876543210', status: 'Active' },
        { id: 2, name: 'Whitefield Mall', city: 'Bangalore', manager: 'Priya Singh', phone: '+91 9123456780', status: 'Active' },
        { id: 3, name: 'Andheri West', city: 'Mumbai', manager: 'Anil Kumar', phone: '+91 9988776655', status: 'Inactive' }
    ];

    const tbody = document.getElementById('branchesTableBody');

    // Populate Table
    function renderTable() {
        tbody.innerHTML = '';
        branches.forEach((branch, i) => {
            const isActive = branch.status === 'Active';
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
                <td style="padding:14px 16px; font-weight:600; color:#1e293b;">${branch.name}</td>
                <td style="padding:14px 16px; color:#475569;">${branch.city}</td>
                <td style="padding:14px 16px; color:#475569;">${branch.manager}</td>
                <td style="padding:14px 16px; color:#475569;">${branch.phone}</td>
                <td style="padding:14px 16px;">
                    <span style="${statusStyle}">
                        <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
                        ${branch.status}
                    </span>
                </td>
                <td style="padding:14px 24px 14px 16px; text-align:right;">
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button onclick="openPanel('edit', ${branch.id})" title="Edit" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#f8fafc';this.style.color='#1e293b'" onmouseout="this.style.background='none';this.style.color='#64748b'">
                            <i data-feather="edit-2" style="width:14px;height:14px;pointer-events:none;"></i>
                        </button>
                        <button onclick="toggleStatus(${branch.id})" title="${isActive ? 'Deactivate' : 'Activate'}" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#f8fafc';this.style.color='#1e293b'" onmouseout="this.style.background='none';this.style.color='#64748b'">
                            <i data-feather="power" style="width:14px;height:14px;pointer-events:none;"></i>
                        </button>
                        <button onclick="deleteBranch(${branch.id})" title="Delete" style="background:none;border:1px solid #e2e8f0;color:#64748b;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='#fef2f2';this.style.borderColor='#fecaca';this.style.color='#ef4444'" onmouseout="this.style.background='none';this.style.borderColor='#e2e8f0';this.style.color='#64748b'">
                            <i data-feather="trash-2" style="width:14px;height:14px;pointer-events:none;"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (window.feather) feather.replace();
    }

    renderTable();

    // Populate Operating Hours
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hoursContainer = document.getElementById('hoursContainer');

    days.forEach(day => {
        const isClosed = day === 'Sunday';
        const row = document.createElement('div');
        row.className = 'hours-row';
        row.innerHTML = `
            <div class="day-label">${day}</div>
            <label class="switch">
                <input type="checkbox" class="day-toggle" ${isClosed ? '' : 'checked'}>
                <span class="slider round"></span>
            </label>
            <div class="hours-times ${isClosed ? 'disabled' : ''}">
                <select class="time-input" ${isClosed ? 'style="display:none;"' : ''}>
                    <option value="09:00">09:00 AM</option>
                    <option value="10:00" selected>10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                </select>
                <span style="color: #94a3b8; font-size: 0.8rem; ${isClosed ? 'display:none;' : ''}">to</span>
                <select class="time-input" ${isClosed ? 'style="display:none;"' : ''}>
                    <option value="18:00">06:00 PM</option>
                    <option value="19:00">07:00 PM</option>
                    <option value="20:00" selected>08:00 PM</option>
                    <option value="21:00">09:00 PM</option>
                </select>
                <span class="closed-text" style="${isClosed ? 'display:inline-block;' : 'display:none;'} margin-left:8px;">Closed</span>
            </div>
        `;
        hoursContainer.appendChild(row);

        const toggle = row.querySelector('.day-toggle');
        const timesDiv = row.querySelector('.hours-times');
        const timeInputs = row.querySelectorAll('.time-input');
        const toSpan = timesDiv.querySelectorAll('span')[0];
        const closedText = row.querySelector('.closed-text');

        toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                timesDiv.classList.remove('disabled');
                timeInputs.forEach(i => i.style.display = 'inline-block');
                if (toSpan) toSpan.style.display = 'inline';
                closedText.style.display = 'none';
            } else {
                timesDiv.classList.add('disabled');
                timeInputs.forEach(i => i.style.display = 'none');
                if (toSpan) toSpan.style.display = 'none';
                closedText.style.display = 'inline-block';
            }
        });
    });

    // Panel Logic
    const panel = document.getElementById('branchPanel');
    const overlay = document.getElementById('branchPanelOverlay');
    const btnAdd = document.getElementById('btnAddBranch');
    const btnClose = document.getElementById('btnClosePanel');
    const btnCancel = document.getElementById('btnCancelBranch');
    const btnSave = document.getElementById('btnSaveBranch');

    window.openPanel = function (mode, branchId = null) {
        const title = document.getElementById('panelTitle');
        const subtitle = document.getElementById('panelSubtitle');

        if (mode === 'edit' && branchId !== null) {
            const branch = branches.find(b => b.id === branchId);
            title.textContent = 'Edit Branch';
            subtitle.textContent = `Update details for ${branch.name}`;
            document.getElementById('branchName').value = branch.name;
        } else {
            title.textContent = 'Add Branch';
            subtitle.textContent = 'Create a new physical location.';
            document.getElementById('branchName').value = '';
        }

        overlay.classList.add('active');
        if (window.feather) feather.replace();
    };

    window.toggleStatus = function (id) {
        const branch = branches.find(b => b.id === id);
        if (branch) {
            branch.status = branch.status === 'Active' ? 'Inactive' : 'Active';
            renderTable();
            showToast(`Branch "${branch.name}" is now ${branch.status}.`);
        }
    };

    window.deleteBranch = function (id) {
        const idx = branches.findIndex(b => b.id === id);
        if (idx > -1) {
            const name = branches[idx].name;
            branches.splice(idx, 1);
            renderTable();
            showToast(`Branch "${name}" has been deleted.`);
        }
    };

    function closePanel() {
        overlay.classList.remove('active');
    }

    btnAdd.addEventListener('click', () => openPanel('add'));
    btnClose.addEventListener('click', closePanel);
    btnCancel.addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePanel();
        }
    });

    btnSave.addEventListener('click', () => {
        showToast('Branch saved successfully!');
        closePanel();
    });

    function showToast(msg) {
        const toast = document.getElementById('toastNotification');
        if (toast) {
            toast.textContent = msg;
            toast.className = 'toast-notification show';
            setTimeout(() => { toast.className = 'toast-notification'; }, 3000);
        }
    }
});
