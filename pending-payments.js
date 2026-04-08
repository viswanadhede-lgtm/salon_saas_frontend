// pending-payments.js — All logic for the Pending Payments page

document.addEventListener('DOMContentLoaded', () => {

    // ─── MOCK DATA ─────────────────────────────────────────────────────────
    const initialData = [
        { id: 'BK-2041', customer: 'Emma Watson',   phone: '9876543210', service: 'Hair Color & Styling', datetime: 'Mar 13, 10:30 AM', date: new Date(2026, 2, 13), total: 3200, paid: 1500, staff: 'Sarah',   status: 'Partial' },
        { id: 'BK-2042', customer: 'Rahul Sharma',  phone: '8897001122', service: "Men's Haircut",        datetime: 'Mar 13, 11:45 AM', date: new Date(2026, 2, 13), total: 500,  paid: 0,    staff: 'Michael', status: 'Unpaid'  },
        { id: 'BK-2043', customer: 'Priya Kapoor',  phone: '8897111999', service: 'Hair Spa Treatment',   datetime: 'Mar 13, 02:00 PM', date: new Date(2026, 2, 13), total: 1200, paid: 500,  staff: 'Anjali',  status: 'Partial' },
        { id: 'BK-2044', customer: 'Amit Singh',    phone: '9001234567', service: 'Bridal Makeup',        datetime: 'Mar 12, 09:00 AM', date: new Date(2026, 2, 12), total: 5000, paid: 0,    staff: 'Sarah',   status: 'Unpaid'  },
        { id: 'BK-2045', customer: 'Meera Reddy',   phone: '9012345678', service: 'Keratin Treatment',    datetime: 'Mar 12, 03:30 PM', date: new Date(2026, 2, 12), total: 2800, paid: 1000, staff: 'Anjali',  status: 'Partial' },
        { id: 'BK-2046', customer: 'David Fernandes', phone: '8765432100', service: 'Beard Trim & Style', datetime: 'Mar 11, 12:00 PM', date: new Date(2026, 2, 11), total: 350,  paid: 0,    staff: 'Michael', status: 'Unpaid'  },
        { id: 'BK-2047', customer: 'Sonia Gupta',   phone: '9888877777', service: 'Facial & Cleanup',     datetime: 'Mar 05, 11:00 AM', date: new Date(2026, 2, 5),  total: 1500, paid: 200, staff: 'Anjali',  status: 'Partial' },
    ];

    let currentData = [...initialData];
    let activeBookingIdx = null; // index in currentData of the booking being collected
    let currentFilter = { status: [], staff: [], dateRange: 'All' };

    // ─── RENDER TABLE ──────────────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('ppTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (currentData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:52px 24px; color:#94a3b8;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                            <i data-feather="check-circle" style="width:36px; height:36px; color:#c7d2fe;"></i>
                            <p style="font-weight:600; color:#64748b; margin:0;">No pending payments</p>
                            <p style="font-size:0.82rem; margin:0;">No records match your current filters.</p>
                        </div>
                    </td>
                </tr>`;
            if (window.feather) feather.replace();
            return;
        }

        currentData.forEach((row, idx) => {
            const due = row.total - row.paid;
            const isPartial = row.status === 'Partial';
            const statusBadge = isPartial
                ? `<span style="display:inline-flex; align-items:center; gap:4px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Partial</span>`
                : `<span style="display:inline-flex; align-items:center; gap:4px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Unpaid</span>`;

            const tr = document.createElement('tr');
            tr.className = 'tb-row';
            tr.style.cssText = 'border-bottom:1px solid #f1f5f9; transition:background 0.12s;';
            tr.onmouseover = () => tr.style.background = '#f8fafc';
            tr.onmouseout  = () => tr.style.background = '';

            tr.innerHTML = `
                <td style="padding:14px 16px 14px 24px; color:#1e293b; font-weight:500; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.customer}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.service}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.83rem;">${row.datetime}</td>
                <td style="padding:14px 16px; color:#1e293b; font-weight:600;">&#8377;${row.total.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#10b981; font-weight:500;">&#8377;${row.paid.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#dc2626; font-weight:600;">&#8377;${due.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px;">${statusBadge}</td>
                <td style="padding:14px 16px;">
                    <button onclick="ppOpenCollect(${idx})" style="height:32px; padding:0 14px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:7px; font-size:0.8rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                        <i data-feather="credit-card" style="width:13px; height:13px;"></i> Collect
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });

        if (window.feather) feather.replace();
    }

    // ─── APPLY ALL FILTERS ──────────────────────────────────────────────────
    function applyAllFilters() {
        const term = (searchInput?.value || '').trim().toLowerCase();
        
        currentData = initialData.filter(r => {
            // Search
            const matchesSearch = !term || 
                r.id.toLowerCase().includes(term) ||
                r.customer.toLowerCase().includes(term) ||
                r.phone.includes(term);
            
            // Status
            const matchesStatus = currentFilter.status.length === 0 || currentFilter.status.includes(r.status);
            
            // Staff
            const matchesStaff = currentFilter.staff.length === 0 || currentFilter.staff.includes(r.staff);
            
            // Date Range
            let matchesDate = true;
            if (currentFilter.dateRange !== 'All') {
                const today = new Date(2026, 2, 13); // System context date
                const rowDate = r.date;
                const diffTime = Math.abs(today - rowDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (currentFilter.dateRange === 'Today') {
                    matchesDate = rowDate.toDateString() === today.toDateString();
                } else if (currentFilter.dateRange === 'Last 7 days') {
                    matchesDate = diffDays <= 7;
                } else if (currentFilter.dateRange === 'Last 30 days') {
                    matchesDate = diffDays <= 30;
                } else if (currentFilter.dateRange === 'This Month') {
                    matchesDate = rowDate.getMonth() === today.getMonth() && rowDate.getFullYear() === today.getFullYear();
                }
            }
            
            return matchesSearch && matchesStatus && matchesStaff && matchesDate;
        });
        
        renderTable();
    }

    // ─── SEARCH ────────────────────────────────────────────────────────────
    const searchInput = document.getElementById('ppSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyAllFilters);
    }

    // ─── FILTER ────────────────────────────────────────────────────────────
    window.ppApplyFilter = function() {
        document.getElementById('ppFilterMenu').style.display = 'none';
        currentFilter.status = [...document.querySelectorAll('.pp-filter-status:checked')].map(cb => cb.value);
        currentFilter.staff  = [...document.querySelectorAll('.pp-filter-staff:checked')].map(cb => cb.value);
        applyAllFilters();
    };

    window.ppClearFilter = function() {
        document.querySelectorAll('.pp-filter-status, .pp-filter-staff').forEach(cb => cb.checked = false);
        currentFilter.status = [];
        currentFilter.staff = [];
        applyAllFilters();
        document.getElementById('ppFilterMenu').style.display = 'none';
    };

    // ─── DATE RANGE ────────────────────────────────────────────────────────
    window.ppSetDateRange = function(range) {
        currentFilter.dateRange = range;
        document.getElementById('ppDateLabel').textContent = range;
        document.getElementById('ppDateMenu').style.display = 'none';
        applyAllFilters();
    };

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const fm = document.getElementById('ppFilterMenu');
        const dm = document.getElementById('ppDateMenu');
        if (fm && !e.target.closest('#ppFilterMenu') && !e.target.closest('button[onclick*="ppFilterMenu"]')) fm.style.display = 'none';
        if (dm && !e.target.closest('#ppDateMenu') && !e.target.closest('button[onclick*="ppDateMenu"]')) dm.style.display = 'none';
    });

    // ─── COLLECT PAYMENT MODAL ─────────────────────────────────────────────
    window.ppOpenCollect = function(idx) {
        activeBookingIdx = idx;
        const row = currentData[idx];
        const due = row.total - row.paid;

        document.getElementById('ppModalSubtitle').textContent  = `${row.id} · ${row.customer} · ${row.service}`;
        document.getElementById('ppSummaryTotal').textContent   = '₹' + row.total.toLocaleString('en-IN');
        document.getElementById('ppSummaryPaid').textContent    = '₹' + row.paid.toLocaleString('en-IN');
        document.getElementById('ppSummaryDue').textContent     = '₹' + due.toLocaleString('en-IN');
        document.getElementById('ppAmountInput').value          = due;
        document.getElementById('ppAmountInput').max            = due;

        // Reset payment method selection
        document.querySelectorAll('input[name="ppPayMethod"]').forEach(r => r.checked = false);
        document.querySelectorAll('.pp-method-btn').forEach(b => {
            b.style.borderColor = '#e2e8f0';
            b.style.background  = '#fff';
            b.style.color       = '#475569';
        });

        const overlay = document.getElementById('ppCollectOverlay');
        overlay.style.display = 'flex';
        if (window.feather) feather.replace();
    };

    // Payment method visual selection
    window.ppSelectMethod = function(radio) {
        document.querySelectorAll('.pp-method-btn').forEach(b => {
            b.style.borderColor = '#e2e8f0';
            b.style.background  = '#fff';
            b.style.color       = '#475569';
        });
        const selectedBtn = radio.nextElementSibling;
        selectedBtn.style.borderColor = '#1e3a8a';
        selectedBtn.style.background  = '#eff6ff';
        selectedBtn.style.color       = '#1e3a8a';
    };

    // Record Payment
    window.ppRecordPayment = function() {
        if (activeBookingIdx === null) return;

        const amountInput  = document.getElementById('ppAmountInput');
        const methodRadio  = document.querySelector('input[name="ppPayMethod"]:checked');
        const amount       = parseFloat(amountInput.value);
        const row          = currentData[activeBookingIdx];
        const due          = row.total - row.paid;

        if (!amount || amount <= 0) {
            amountInput.style.borderColor = '#dc2626';
            amountInput.focus();
            return;
        }
        if (amount > due) {
            amountInput.style.borderColor = '#dc2626';
            amountInput.focus();
            return;
        }
        if (!methodRadio) {
            document.querySelectorAll('.pp-method-btn').forEach(b => b.style.borderColor = '#dc2626');
            return;
        }

        // Apply payment to the original data record
        const origIdx = initialData.findIndex(d => d.id === row.id);
        if (origIdx !== -1) {
            initialData[origIdx].paid += amount;
            // If fully paid → remove from pending list
            if (initialData[origIdx].paid >= initialData[origIdx].total) {
                initialData.splice(origIdx, 1);
            } else {
                initialData[origIdx].status = 'Partial';
            }
        }

        document.getElementById('ppCollectOverlay').style.display = 'none';
        activeBookingIdx = null;

        // Refresh using same search term if any
        const term = (document.getElementById('ppSearchInput')?.value || '').trim().toLowerCase();
        if (term) {
            currentData = initialData.filter(r =>
                r.id.toLowerCase().includes(term) ||
                r.customer.toLowerCase().includes(term) ||
                r.phone.includes(term)
            );
        } else {
            currentData = [...initialData];
        }
        renderTable();
        ppShowToast('Payment recorded successfully!');
    };

    // ─── TOAST ─────────────────────────────────────────────────────────────
    function ppShowToast(msg) {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ─── INIT ──────────────────────────────────────────────────────────────
    renderTable();
});
