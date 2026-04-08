import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- State ---
    let allPayments = [];
    let filteredPayments = [];
    let currentFilter = { status: [], staff: [], dateRange: 'All' };
    let activeBookingId = null; 

    // --- Helpers ---
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            const id = ctx.company?.id || localStorage.getItem('company_id');
            console.log('[PP] Detected Company ID:', id);
            return id;
        } catch (e) { 
            const id = localStorage.getItem('company_id');
            console.log('[PP] Detected Company ID (fallback):', id);
            return id; 
        }
    }

    function getBranchId() {
        const id = localStorage.getItem('active_branch_id');
        console.log('[PP] Detected Branch ID:', id);
        return id;
    }

    function showLoading(isLoading) {
        const tbody = document.getElementById('ppTableBody');
        if (!tbody) return;
        if (isLoading) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:60px;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                            <i data-feather="loader" style="width:32px; height:32px; color:#6366f1; animation: spin 1s linear infinite;"></i>
                            <p style="color:#64748b; font-weight:500;">Fetching pending payments...</p>
                        </div>
                    </td>
                </tr>`;
            if (window.feather) feather.replace();
        }
    }

    // ─── FETCH DATA ────────────────────────────────────────────────────────
    async function fetchPayments() {
        showLoading(true);
        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId) {
                console.error('No company ID found');
                return;
            }

            let query = supabase
                .from('pending_payments_view')
                .select('*')
                .eq('company_id', companyId);

            if (branchId) {
                query = query.eq('branch_id', branchId);
            }

            const { data, error } = await query;
            if (error) {
                console.error('[PP] Supabase Error:', error);
                throw error;
            }

            console.log('[PP] Data fetched successfully. Row count:', data ? data.length : 0);
            console.log('[PP] Raw Data Sample:', data ? data[0] : 'None');

            allPayments = data || [];
            applyAllFilters();

        } catch (err) {
            console.error('[PP] Critical Fetch Error:', err);
            ppShowToast('Failed to load payments', true);
        }
    }

    // ─── RENDER TABLE ──────────────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('ppTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (filteredPayments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:52px 24px; color:#94a3b8;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                            <i data-feather="check-circle" style="width:36px; height:36px; color:#c7d2fe;"></i>
                            <p style="font-weight:600; color:#64748b; margin:0;">No pending payments</p>
                            <p style="font-size:0.82rem; margin:0;">Everything is up to date!</p>
                        </div>
                    </td>
                </tr>`;
            if (window.feather) feather.replace();
            return;
        }

        filteredPayments.forEach((row) => {
            const total = Number(row.total) || 0;
            const paid = Number(row.paid) || 0;
            const due = Number(row.due) || (total - paid);
            const status = (row.status || 'unpaid').toLowerCase();

            let statusBadge = '';
            if (status === 'partial') {
                statusBadge = `<span style="display:inline-flex; align-items:center; gap:4px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Partial</span>`;
            } else {
                statusBadge = `<span style="display:inline-flex; align-items:center; gap:4px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Unpaid</span>`;
            }

            const tr = document.createElement('tr');
            tr.className = 'tb-row';
            tr.style.cssText = 'border-bottom:1px solid #f1f5f9; transition:background 0.12s;';
            tr.onmouseover = () => tr.style.background = '#f8fafc';
            tr.onmouseout  = () => tr.style.background = '';

            const dateStr = row.booking_date ? new Date(row.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
            const timeStr = row.start_time || '';

            tr.innerHTML = `
                <td style="padding:14px 16px 14px 24px; color:#1e293b; font-weight:500; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.customer_name || 'Guest'}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.service_name || '-'}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.83rem;">${dateStr} <span style="opacity:0.6; margin-left:4px;">${timeStr}</span></td>
                <td style="padding:14px 16px; color:#1e293b; font-weight:600;">₹${total.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#10b981; font-weight:500;">₹${paid.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#dc2626; font-weight:600;">₹${due.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px;">${statusBadge}</td>
                <td style="padding:14px 16px;">
                    <button onclick="ppOpenCollect('${row.booking_id}')" style="height:32px; padding:0 14px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:7px; font-size:0.8rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
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
        console.log('[PP] Applying filters. Search Term:', term, 'Active Status Filter:', currentFilter.status);
        
        filteredPayments = allPayments.filter(r => {
            // Search
            const matchesSearch = !term || 
                (r.booking_id || '').toLowerCase().includes(term) ||
                (r.customer_name || '').toLowerCase().includes(term);
            
            // Status
            const matchesStatus = currentFilter.status.length === 0 || 
                                 currentFilter.status.some(fs => (r.status || '').toLowerCase() === fs.toLowerCase());
            
            // Date Range
            let matchesDate = true;
            if (currentFilter.dateRange !== 'All' && r.booking_date) {
                const today = new Date();
                const rowDate = new Date(r.booking_date);
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
            
            return matchesSearch && matchesStatus && matchesDate;
        });
        
        console.log('[PP] Filtering complete. Showing', filteredPayments.length, 'of', allPayments.length, 'records.');
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
    window.ppOpenCollect = function(bookingId) {
        activeBookingId = bookingId;
        const row = allPayments.find(p => p.booking_id === bookingId);
        if (!row) return;

        const total = Number(row.total) || 0;
        const paid = Number(row.paid) || 0;
        const due = Number(row.due) || (total - paid);

        document.getElementById('ppModalSubtitle').textContent  = `${row.booking_id.substring(0,8)} · ${row.customer_name} · ${row.service_name}`;
        document.getElementById('ppSummaryTotal').textContent   = '₹' + total.toLocaleString('en-IN');
        document.getElementById('ppSummaryPaid').textContent    = '₹' + paid.toLocaleString('en-IN');
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
    window.ppRecordPayment = async function() {
        if (!activeBookingId) return;

        const amountInput  = document.getElementById('ppAmountInput');
        const methodRadio  = document.querySelector('input[name="ppPayMethod"]:checked');
        const recordBtn    = document.getElementById('ppRecordBtn');
        const amount       = parseFloat(amountInput.value);
        
        const row = allPayments.find(p => p.booking_id === activeBookingId);
        if (!row) return;

        const total = Number(row.total) || 0;
        const paid = Number(row.paid) || 0;
        const due = total - paid;

        if (!amount || amount <= 0) {
            amountInput.style.borderColor = '#dc2626';
            amountInput.focus();
            return;
        }
        if (amount > due) {
            amountInput.style.borderColor = '#dc2626';
            amountInput.focus();
            ppShowToast('Amount exceeds due balance', true);
            return;
        }
        if (!methodRadio) {
            ppShowToast('Please select a payment method', true);
            return;
        }

        // --- Start Loading ---
        const originalBtnText = recordBtn.textContent;
        recordBtn.disabled = true;
        recordBtn.textContent = 'Recording...';

        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();
            const payMethod = methodRadio.value;
            const userId    = localStorage.getItem('user_id'); // Try to get the user ID for created_by

            // Insert into business_transactions matching your exact schema
            const { error: txError } = await supabase
                .from('business_transactions')
                .insert({
                    company_id:     companyId,
                    branch_id:      branchId,
                    reference_id:   activeBookingId,
                    reference_type: 'booking',
                    amount:         amount,
                    currency:       'INR',
                    payment_method: payMethod,
                    status:         'paid', 
                    notes:          `Payment for booking ${activeBookingId.substring(0,8)}`,
                    created_by:     userId,
                    paid_at:        new Date().toISOString()
                });

            if (txError) throw txError;

            // Close modal & Refresh
            document.getElementById('ppCollectOverlay').style.display = 'none';
            activeBookingId = null;
            ppShowToast('Payment recorded successfully!');
            
            // Re-fetch data to update the view
            await fetchPayments();
            
            // Dispatch custom event for other modules
            document.dispatchEvent(new CustomEvent('payment-recorded', {
                detail: { bookingId: activeBookingId, amount: amount }
            }));

            // Force refetch on Bookings if it exists in the current session
            if (typeof window.fetchBookings === 'function') {
                console.log('[PP] Triggering global fetchBookings...');
                await window.fetchBookings();
            }

        } catch (err) {
            console.error('[PP] Error recording payment:', err);
            ppShowToast('Failed to record payment', true);
        } finally {
            recordBtn.disabled = false;
            recordBtn.textContent = originalBtnText;
        }
    };

    // ─── TOAST ─────────────────────────────────────────────────────────────
    function ppShowToast(msg, isError = false) {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = isError ? '#ef4444' : '#10b981';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ─── INIT ──────────────────────────────────────────────────────────────
    fetchPayments();
});
