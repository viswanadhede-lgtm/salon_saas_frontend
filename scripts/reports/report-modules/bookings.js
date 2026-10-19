// scripts/reports/report-modules/bookings.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

// ─── Shared helper: branch dropdown init ────────────────────────────────────
async function initBranchDropdown(supabase, companyId, filterBranch) {
    try {
        const { data: bList } = await supabase
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId);
        if (bList && filterBranch) {
            const existing = filterBranch.value;
            filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
            filterBranch.value = existing || 'all';
        }
    } catch (e) { console.warn('Branch fetch failed', e); }
}

// ─── Shared helper: resolve branch_id from filter ───────────────────────────
function resolveBranchId(filterBranch) {
    return (filterBranch && filterBranch.value !== 'all')
        ? filterBranch.value
        : localStorage.getItem('active_branch_id');
}

// ─── Shared helper: set default date range (current month) ──────────────────
function setDefaultDateRange(filterStart, filterEnd) {
    if (!filterStart || !filterEnd) return;
    const now    = new Date();
    const today  = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const first  = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
    if (!filterStart.value) filterStart.value = first.toISOString().split('T')[0];
    if (!filterEnd.value)   filterEnd.value   = today.toISOString().split('T')[0];
}

// ─── Shared helper: format date for display ─────────────────────────────────
function fmtDate(val) {
    if (!val) return '—';
    return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Shared helper: format datetime for display ─────────────────────────────
function fmtDateTime(dateVal, timeVal) {
    const d = fmtDate(dateVal);
    const t = timeVal ? timeVal.slice(0, 5) : '';
    return t ? `${d}, ${t}` : d;
}

// ─── Shared helper: set loading state ───────────────────────────────────────
function setLoading(data, colSpan = 7) {
    data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
    data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;padding:2rem;color:#94a3b8;">Loading data...</td></tr>`;
}

// ─── Shared helper: handle error state ──────────────────────────────────────
function setError(data) {
    if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
    if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
    updateTable(data.headers, []);
}

// ============================================================
// renderBookings — Overview (all statuses, last 7 days)
// ============================================================
async function renderBookings(data, supabase) {
    const companyId = localStorage.getItem('company_id');
    const branchId  = localStorage.getItem('active_branch_id');

    if (!companyId || !branchId) {
        updateTable(data.headers, []);
        return;
    }

    try {
        const { data: dbBookings, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .order('booking_date', { ascending: false });

        if (error) throw error;

        const bookingsList = dbBookings || [];
        const totalBookings = bookingsList.length;
        const completed     = bookingsList.filter(b => b.status === 'completed').length;
        const cancelled     = bookingsList.filter(b => b.status === 'cancelled').length;
        const noShows       = bookingsList.filter(b => ['no-show', 'no_show'].includes(b.status)).length;

        const statusStyles = {
            'completed': 'background:#dcfce7;color:#166534;',
            'confirmed': 'background:#dbeafe;color:#1e40af;',
            'booked':    'background:#e0e7ff;color:#3730a3;',
            'cancelled': 'background:#fee2e2;color:#991b1b;',
            'no-show':   'background:#fef3c7;color:#92400e;',
            'no_show':   'background:#fef3c7;color:#92400e;'
        };

        const formattedRows = bookingsList.map(b => {
            const stKey     = (b.status || 'booked').toLowerCase();
            const stStyle   = statusStyles[stKey] || '';
            const statusHtml = `<span class="status-pill" style="${stStyle}">${stKey.charAt(0).toUpperCase() + stKey.slice(1)}</span>`;
            const amount    = b.total_price != null ? formatCurrency(b.total_price)
                            : b.price      != null ? formatCurrency(b.price) : '—';

            return [
                fmtDate(b.booking_date),
                b.start_time ? b.start_time.slice(0, 5) : '—',
                b.customer_name || '—',
                b.service_name  || '—',
                b.staff_name    || '—',
                amount,
                statusHtml
            ];
        });

        // Trend: last 7 days
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7.push(d.toISOString().split('T')[0]);
        }
        renderTrendChart(
            last7.map(ds => new Date(ds).toLocaleDateString('en-US', { weekday: 'short' })),
            last7.map(ds => bookingsList.filter(b => b.booking_date === ds).length)
        );

        data.kpi1.value = totalBookings.toString();
        data.kpi2.value = completed.toString();
        data.kpi3.value = cancelled.toString();
        data.kpi4.value = noShows.toString();
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        updateTable(data.headers, formattedRows);

    } catch (err) {
        console.error('Error loading bookings report data:', err);
        updateTable(data.headers, []);
    }
}

// ============================================================
// renderBkTotal — Total Appointments (all statuses, date-filtered)
// ============================================================
async function renderBkTotal(data, supabase) {
    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);

        try {
            const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

            const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                supabase.rpc('get_bookings_total_summary', args),
                supabase.rpc('get_bookings_total_trend',   args),
                supabase.rpc('get_bookings_status_dist',   args),
                supabase.rpc('get_bookings_total_table',   args)
            ]);

            // KPI: Total | Completed | Cancelled | No-Shows
            const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
            if (sumRow) {
                data.kpi1.value = Number(sumRow.total_bookings || 0).toLocaleString('en-IN');
                data.kpi2.value = Number(sumRow.completed      || 0).toLocaleString('en-IN');
                data.kpi3.value = Number(sumRow.cancelled      || 0).toLocaleString('en-IN');
                data.kpi4.value = Number(sumRow.no_shows       || 0).toLocaleString('en-IN');
            } else {
                data.kpi1.value = '0'; data.kpi2.value = '0';
                data.kpi3.value = '0'; data.kpi4.value = '0';
            }
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            // Trend chart
            if (typeof renderTrendChart === 'function') {
                if (trendRes.data && trendRes.data.length > 0) {
                    renderTrendChart(
                        trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                        trendRes.data.map(t => Number(t.count || 0))
                    );
                } else renderTrendChart([], []);
            }

            // Donut chart — by status
            if (typeof renderDistributionChart === 'function') {
                if (distRes.data && distRes.data.length > 0) {
                    renderDistributionChart(
                        distRes.data.map(s => (s.label || s.status || 'Unknown').charAt(0).toUpperCase() + (s.label || s.status || '').slice(1)),
                        distRes.data.map(s => Number(s.count || 0))
                    );
                } else renderDistributionChart([], []);
            }

            // Table: Date | Time | Customer | Service | Staff | Amount | Status
            data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Status'];
            if (tRes.data && tRes.data.length > 0) {
                const statusStyles = {
                    'completed': 'background:#dcfce7;color:#166534;',
                    'confirmed': 'background:#dbeafe;color:#1e40af;',
                    'booked':    'background:#e0e7ff;color:#3730a3;',
                    'cancelled': 'background:#fee2e2;color:#991b1b;',
                    'no-show':   'background:#fef3c7;color:#92400e;',
                    'no_show':   'background:#fef3c7;color:#92400e;'
                };
                const rows = tRes.data.map(r => {
                    const stKey = (r.status || 'booked').toLowerCase().replace('_', '-');
                    const stStyle = statusStyles[stKey] || '';
                    return [
                        fmtDate(r.booking_date),
                        r.start_time ? r.start_time.slice(0, 5) : '—',
                        r.customer_name || '—',
                        r.service_name  || '—',
                        r.staff_name    || '—',
                        r.total_price != null ? formatCurrency(r.total_price) : '—',
                        `<span class="status-pill" style="${stStyle}">${stKey.charAt(0).toUpperCase() + stKey.slice(1)}</span>`
                    ];
                });
                updateTable(data.headers, rows);
            } else {
                updateTable(data.headers, []);
            }

        } catch (err) {
            console.error('renderBkTotal error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadData);
    loadData();
}

// ============================================================
// renderBkCompleted — Completed Bookings & Revenue
// KPI: Completed Count | Completion Rate | Revenue | Avg Rev/Booking
// Chart: Trend (count + revenue) | Donut: by Service Category
// Table: Booking ID | Date & Time | Customer Name | Services Delivered | Staff Assigned | Bill Amount | Payment Status
// ============================================================
async function renderBkCompleted(data, supabase) {
    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);

        try {
            const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

            const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                supabase.rpc('get_completed_bookings_summary', args),
                supabase.rpc('get_completed_bookings_trend',   args),
                supabase.rpc('get_completed_distribution',     args),
                supabase.rpc('get_completed_bookings_table',   args)
            ]);

            // KPI: Completed | Completion Rate | Revenue | Avg Rev/Booking
            const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
            if (sumRow) {
                data.kpi1.value = Number(sumRow.completed         || 0).toLocaleString('en-IN');
                data.kpi2.value = (Number(sumRow.completion_rate  || 0).toFixed(1)) + '%';
                data.kpi3.value = sumRow.total_revenue != null
                    ? formatCurrency(sumRow.total_revenue) : '₹0';
                data.kpi4.value = sumRow.avg_revenue_per_booking != null
                    ? formatCurrency(sumRow.avg_revenue_per_booking) : '₹0';
            } else {
                data.kpi1.value = '0'; data.kpi2.value = '0%';
                data.kpi3.value = '₹0'; data.kpi4.value = '₹0';
            }
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            // Trend chart — completed count over time
            if (typeof renderTrendChart === 'function') {
                if (trendRes.data && trendRes.data.length > 0) {
                    renderTrendChart(
                        trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                        trendRes.data.map(t => Number(t.completed || t.count || 0))
                    );
                } else renderTrendChart([], []);
            }

            // Donut chart — revenue by service category (Hair / Skin / Spa / Other)
            if (typeof renderDistributionChart === 'function') {
                if (distRes.data && distRes.data.length > 0) {
                    renderDistributionChart(
                        distRes.data.map(s => (s.label || s.category || s.status || 'Other').toString().charAt(0).toUpperCase() + (s.label || s.category || s.status || '').toString().slice(1)),
                        distRes.data.map(s => Number(s.count || s.revenue || 0))
                    );
                } else renderDistributionChart([], []);
            }

            // Table: Booking ID | Date & Time | Customer Name | Services Delivered | Staff Assigned | Bill Amount | Payment Status
            data.headers = ['Booking ID', 'Date & Time', 'Customer Name', 'Services Delivered', 'Staff Assigned', 'Bill Amount', 'Payment Status'];
            if (tRes.data && tRes.data.length > 0) {
                const rows = tRes.data.map(r => {
                    const payStyle = r.payment_status === 'paid'
                        ? 'background:#dcfce7;color:#166534;'
                        : r.payment_status === 'pending'
                        ? 'background:#fef3c7;color:#92400e;'
                        : 'background:#f1f5f9;color:#64748b;';
                    const payLabel = r.payment_status
                        ? r.payment_status.charAt(0).toUpperCase() + r.payment_status.slice(1)
                        : '—';
                    return [
                        r.booking_id || r.id || '—',
                        fmtDateTime(r.booking_date, r.start_time),
                        r.customer_name || '—',
                        r.service_name  || r.services_delivered || '—',
                        r.staff_name    || '—',
                        `<strong style="color:#10b981;">${r.total_price != null ? formatCurrency(r.total_price) : '—'}</strong>`,
                        `<span class="status-pill" style="${payStyle}">${payLabel}</span>`
                    ];
                });
                updateTable(data.headers, rows);
            } else {
                updateTable(data.headers, []);
            }

        } catch (err) {
            console.error('renderBkCompleted error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadData);
    loadData();
}

// ============================================================
// renderBkCancelled — Cancelled Bookings
// KPI: Cancelled Count | Cancellation Rate | Estimated Value Affected | Same-Day Cancellations
// Chart: Trend (count + lost revenue) | Donut: by Cancellation Reason
// Table: Booking ID | Scheduled Date & Time | Customer Name | Services Cancelled | Staff | Estimated Value | Cancellation Reason
// ============================================================
async function renderBkCancelled(data, supabase) {
    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);

        try {
            const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

            const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                supabase.rpc('get_cancelled_bookings_summary', args),
                supabase.rpc('get_cancelled_bookings_trend',   args),
                supabase.rpc('get_cancelled_distribution',     args),
                supabase.rpc('get_cancelled_bookings_table',   args)
            ]);

            // KPI: Cancelled | Cancellation Rate | Estimated Value Affected | Same-Day Cancellations
            const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
            if (sumRow) {
                data.kpi1.value = Number(sumRow.cancelled           || 0).toLocaleString('en-IN');
                data.kpi2.value = (Number(sumRow.cancellation_rate  || 0).toFixed(1)) + '%';
                data.kpi3.value = sumRow.estimated_value_affected != null
                    ? formatCurrency(sumRow.estimated_value_affected) : '₹0';
                data.kpi4.value = Number(sumRow.same_day_cancellations || 0).toLocaleString('en-IN');
            } else {
                data.kpi1.value = '0'; data.kpi2.value = '0%';
                data.kpi3.value = '₹0'; data.kpi4.value = '0';
            }
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            // Trend chart — cancelled count over time
            if (typeof renderTrendChart === 'function') {
                if (trendRes.data && trendRes.data.length > 0) {
                    renderTrendChart(
                        trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                        trendRes.data.map(t => Number(t.cancelled || t.count || 0))
                    );
                } else renderTrendChart([], []);
            }

            // Donut chart — by cancellation reason
            if (typeof renderDistributionChart === 'function') {
                if (distRes.data && distRes.data.length > 0) {
                    renderDistributionChart(
                        distRes.data.map(s => s.label || s.reason || s.status || 'Other'),
                        distRes.data.map(s => Number(s.count || 0))
                    );
                } else renderDistributionChart([], []);
            }

            // Table: Booking ID | Scheduled Date & Time | Customer Name | Services Cancelled | Staff | Estimated Value | Cancellation Reason
            data.headers = ['Booking ID', 'Scheduled Date & Time', 'Customer Name', 'Services Cancelled', 'Staff', 'Estimated Value', 'Cancellation Reason'];
            if (tRes.data && tRes.data.length > 0) {
                const rows = tRes.data.map(r => [
                    r.booking_id || r.id || '—',
                    fmtDateTime(r.booking_date, r.start_time),
                    r.customer_name || '—',
                    r.service_name  || '—',
                    r.staff_name    || '—',
                    `<strong style="color:#ef4444;">${r.total_price != null ? formatCurrency(r.total_price) : '—'}</strong>`,
                    r.cancellation_reason || r.reason || `<span style="color:#94a3b8;font-style:italic;">Not specified</span>`
                ]);
                updateTable(data.headers, rows);
            } else {
                updateTable(data.headers, []);
            }

        } catch (err) {
            console.error('renderBkCancelled error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadData);
    loadData();
}

// ============================================================
// renderBkNoShows — No-Show Bookings
// KPI: No-Show Count | Estimated Value Missed | No-Show Rate | Repeat No-Show Customers
// Chart: Trend (count by day of week / time slot) | Donut: by Service Category
// Table: Booking ID | Appointment Date & Time | Customer Name | Phone | Services Missed | Staff Assigned | Missed Value
// ============================================================
async function renderBkNoShows(data, supabase) {
    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);

        try {
            const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

            const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                supabase.rpc('get_no_show_summary',      args),
                supabase.rpc('get_no_show_trend',        args),
                supabase.rpc('get_no_show_distribution', args),
                supabase.rpc('get_no_show_table',        args)
            ]);

            // KPI: No-Show Count | Estimated Value Missed | No-Show Rate | Repeat No-Show Customers
            const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
            if (sumRow) {
                data.kpi1.value = Number(sumRow.no_shows              || 0).toLocaleString('en-IN');
                data.kpi2.value = sumRow.estimated_value_missed != null
                    ? formatCurrency(sumRow.estimated_value_missed) : '₹0';
                data.kpi3.value = (Number(sumRow.no_show_rate         || 0).toFixed(1)) + '%';
                data.kpi4.value = Number(sumRow.repeat_no_show_customers || 0).toLocaleString('en-IN');
            } else {
                data.kpi1.value = '0'; data.kpi2.value = '₹0';
                data.kpi3.value = '0%'; data.kpi4.value = '0';
            }
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            // Trend chart — no-shows by day of week / time
            if (typeof renderTrendChart === 'function') {
                if (trendRes.data && trendRes.data.length > 0) {
                    renderTrendChart(
                        trendRes.data.map(t => t.label || new Date(t.booking_date || t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                        trendRes.data.map(t => Number(t.no_shows || t.count || 0))
                    );
                } else renderTrendChart([], []);
            }

            // Donut chart — no-shows by service category
            if (typeof renderDistributionChart === 'function') {
                if (distRes.data && distRes.data.length > 0) {
                    renderDistributionChart(
                        distRes.data.map(s => s.label || s.category || s.status || 'Other'),
                        distRes.data.map(s => Number(s.count || 0))
                    );
                } else renderDistributionChart([], []);
            }

            // Table: Booking ID | Appointment Date & Time | Customer Name | Phone | Services Missed | Staff Assigned | Missed Value
            data.headers = ['Booking ID', 'Appointment Date & Time', 'Customer Name', 'Phone', 'Services Missed', 'Staff Assigned', 'Missed Value'];
            if (tRes.data && tRes.data.length > 0) {
                const rows = tRes.data.map(r => [
                    r.booking_id || r.id || '—',
                    fmtDateTime(r.booking_date, r.start_time),
                    r.customer_name || '—',
                    r.customer_phone || r.phone || `<span style="color:#94a3b8;">—</span>`,
                    r.service_name   || '—',
                    r.staff_name     || '—',
                    `<strong style="color:#f59e0b;">${r.total_price != null ? formatCurrency(r.total_price) : '—'}</strong>`
                ]);
                updateTable(data.headers, rows);
            } else {
                updateTable(data.headers, []);
            }

        } catch (err) {
            console.error('renderBkNoShows error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadData);
    loadData();
}

// ============================================================
// renderBkRefunds — Refunded Bookings
// KPI: Refunded Count | Total Refunded | Average Refund | Refund Rate
// Chart: Trend (refund volume & amount) | Donut: by Refund Reason
// Table: Refund Ref | Refund Date | Original Booking ID | Customer Name | Refund Method | Refund Amount | Reason / Notes
// ============================================================
async function renderBkRefunds(data, supabase) {
    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);

        try {
            const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

            const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                supabase.rpc('get_refunded_bookings_summary', args),
                supabase.rpc('get_refunded_bookings_trend',   args),
                supabase.rpc('get_refund_reason_distribution',args),
                supabase.rpc('get_refunded_bookings_table',   args)
            ]);

            // KPI: Refunded Count | Total Refunded | Average Refund | Refund Rate
            const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
            if (sumRow) {
                data.kpi1.value = Number(sumRow.refunded_count  || 0).toLocaleString('en-IN');
                data.kpi2.value = sumRow.total_refunded != null
                    ? formatCurrency(sumRow.total_refunded) : '₹0';
                data.kpi3.value = sumRow.avg_refund != null
                    ? formatCurrency(sumRow.avg_refund) : '₹0';
                data.kpi4.value = (Number(sumRow.refund_rate    || 0).toFixed(1)) + '%';
            } else {
                data.kpi1.value = '0'; data.kpi2.value = '₹0';
                data.kpi3.value = '₹0'; data.kpi4.value = '0%';
            }
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            // Trend chart — refund count & amount over time
            if (typeof renderTrendChart === 'function') {
                if (trendRes.data && trendRes.data.length > 0) {
                    renderTrendChart(
                        trendRes.data.map(t => new Date(t.refund_date || t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                        trendRes.data.map(t => Number(t.refunded_count || t.count || 0))
                    );
                } else renderTrendChart([], []);
            }

            // Donut chart — by refund reason
            if (typeof renderDistributionChart === 'function') {
                if (distRes.data && distRes.data.length > 0) {
                    renderDistributionChart(
                        distRes.data.map(s => s.label || s.reason || 'Other'),
                        distRes.data.map(s => Number(s.count || 0))
                    );
                } else renderDistributionChart([], []);
            }

            // Table: Refund Ref | Refund Date | Original Booking ID | Customer Name | Refund Method | Refund Amount | Reason / Notes
            data.headers = ['Refund Ref', 'Refund Date', 'Original Booking ID', 'Customer Name', 'Refund Method', 'Refund Amount', 'Reason / Notes'];
            if (tRes.data && tRes.data.length > 0) {
                const methodStyle = (m) => {
                    const map = {
                        'cash':  'background:#f0fdf4;color:#166534;',
                        'upi':   'background:#eff6ff;color:#1e40af;',
                        'card':  'background:#f5f3ff;color:#5b21b6;',
                    };
                    return map[(m || '').toLowerCase()] || 'background:#f1f5f9;color:#64748b;';
                };
                const rows = tRes.data.map(r => {
                    const method = r.refund_method || r.payment_method || '—';
                    return [
                        r.refund_ref || r.refund_id || '—',
                        fmtDate(r.refund_date),
                        r.booking_id  || r.original_booking_id || '—',
                        r.customer_name || '—',
                        `<span class="status-pill" style="${methodStyle(method)}">${method.charAt(0).toUpperCase() + method.slice(1)}</span>`,
                        `<strong style="color:#ef4444;">${r.refund_amount != null ? formatCurrency(r.refund_amount) : '—'}</strong>`,
                        r.reason || r.notes || `<span style="color:#94a3b8;font-style:italic;">—</span>`
                    ];
                });
                updateTable(data.headers, rows);
            } else {
                updateTable(data.headers, []);
            }

        } catch (err) {
            console.error('renderBkRefunds error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadData);
    loadData();
}

// ============================================================
// Handler dispatch
// ============================================================
const handlers = {
    'bookings':     renderBookings,
    'bk-total':     renderBkTotal,
    'bk-completed': renderBkCompleted,
    'bk-cancelled': renderBkCancelled,
    'bk-no-shows':  renderBkNoShows,
    'bk-refunds':   renderBkRefunds,
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
