// scripts/reports/report-modules/bookings.js
// All 5 bookings sub-reports + the generic bookings overview.
// Uses a single master RPC: get_bookings_report(p_branch_id, p_company_id, p_start_date, p_end_date)

import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function initBranchDropdown(supabase, companyId, filterBranch) {
    try {
        const { data: bList } = await supabase
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId);
        if (bList && filterBranch) {
            const existing = filterBranch.value;
            filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                bList.map(b => '<option value="' + b.branch_id + '">' + b.branch_name + '</option>').join('');
            filterBranch.value = existing || 'all';
        }
    } catch (e) { console.warn('[bookings] Branch fetch failed', e); }
}

function resolveBranchId(filterBranch) {
    if (filterBranch && filterBranch.value !== undefined) {
        if (filterBranch.value === 'all' || !filterBranch.value) return null;
        return filterBranch.value;
    }
    const stored = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    return (stored && stored !== 'all' && stored !== 'null' && stored !== 'undefined') ? stored : null;
}

function resolveCompanyId() {
    const c = localStorage.getItem('company_id');
    return (c && c !== 'null' && c !== 'undefined' && c !== 'all') ? c : null;
}

function setDefaultDateRange(filterStart, filterEnd) {
    if (!filterStart || !filterEnd) return;
    const now   = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!filterStart.value) filterStart.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (!filterEnd.value)   filterEnd.value   = today.toISOString().split('T')[0];
}

function fmtDate(val) {
    if (!val) return '\u2014';
    return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(dateVal, timeVal) {
    const d = fmtDate(dateVal);
    const t = timeVal ? timeVal.slice(0, 5) : '';
    return t ? d + ', ' + t : d;
}

function setLoading(data, colSpan) {
    colSpan = colSpan || 7;
    data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
    data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    const tbody = document.getElementById('tableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="' + colSpan + '" style="text-align:center;padding:2rem;color:#94a3b8;">Loading data...</td></tr>';
    }
}

function setError(data) {
    data.kpi1.value = 'Error'; data.kpi2.value = 'Error';
    data.kpi3.value = 'Error'; data.kpi4.value = 'Error';
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    if (typeof renderTrendChart        === 'function') renderTrendChart([], []);
    if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
    updateTable(data.headers, []);
}

// Status pill HTML helper
const STATUS_STYLES = {
    'completed': 'background:#dcfce7;color:#166534;',
    'confirmed': 'background:#dbeafe;color:#1e40af;',
    'booked':    'background:#e0e7ff;color:#3730a3;',
    'pending':   'background:#fef9c3;color:#854d0e;',
    'cancelled': 'background:#fee2e2;color:#991b1b;',
    'no-show':   'background:#fef3c7;color:#92400e;',
    'noshow':    'background:#fef3c7;color:#92400e;',
    'no_show':   'background:#fef3c7;color:#92400e;',
    'refunded':  'background:#f3e8ff;color:#6b21a8;',
    'paid':      'background:#dcfce7;color:#166534;',
    'unpaid':    'background:#fee2e2;color:#991b1b;',
};
function statusPill(rawStatus) {
    const key   = (rawStatus || 'unknown').toLowerCase().replace('_', '-');
    const style = STATUS_STYLES[key.replace('-', '_')] || STATUS_STYLES[key] || 'background:#f1f5f9;color:#64748b;';
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    return '<span class="status-pill" style="' + style + '">' + label + '</span>';
}

function unwrapRpcResult(data) {
    if (!data) return {};
    let res = data;
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {
            console.warn('[bookings] JSON parse warning:', e);
        }
    }
    if (Array.isArray(res)) {
        res = res[0] || {};
    }
    if (res && typeof res === 'object') {
        if (res.bookings_report) {
            res = res.bookings_report;
        } else if (res.get_bookings_report) {
            res = res.get_bookings_report;
        }
    }
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {}
    }
    return (res && typeof res === 'object') ? res : {};
}

// ─── Master RPC caller ───────────────────────────────────────────────────────
async function callMasterRpc(supabase, companyId, branchId, start, end) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[bookings] Calling get_bookings_report with:', { cid, bid, start, end });
    const { data, error } = await supabase.rpc('get_bookings_report', {
        p_company_id: cid,
        p_branch_id:  bid,
        p_start_date: start,
        p_end_date:   end
    });
    if (error) {
        console.error('[bookings] get_bookings_report RPC error:', error);
        throw error;
    }
    console.log('[bookings] Raw RPC response:', data);
    const unwrapped = unwrapRpcResult(data);
    console.log('[bookings] Unwrapped RPC response:', unwrapped);
    return unwrapped;
}

// ─── Build "daily labels" array for trend chart from rows ────────────────────
function buildTrendFromRows(rows, dateKey, valueKey) {
    if (!rows || rows.length === 0) return { labels: [], values: [] };
    const map = {};
    rows.forEach(r => {
        let d = r[dateKey] || '';
        if (d.includes(',')) d = d.split(',')[0].trim();
        map[d] = (map[d] || 0) + (Number(r[valueKey]) || 1);
    });
    const sorted = Object.keys(map).sort((a, b) => {
        const da = new Date(a).getTime();
        const db = new Date(b).getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
    });
    return {
        labels: sorted.map(d => {
            const parsed = new Date(d);
            return !isNaN(parsed.getTime())
                ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : d;
        }),
        values: sorted.map(d => map[d])
    };
}

// ─── Distribution from rows by a category field ──────────────────────────────
function buildDistFromRows(rows, categoryKey) {
    if (!rows || rows.length === 0) return { labels: [], values: [] };
    const map = {};
    rows.forEach(r => {
        const cat = r[categoryKey] || 'Other';
        map[cat] = (map[cat] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { labels: entries.map(e => e[0]), values: entries.map(e => e[1]) };
}

// =============================================================================
// renderBookings — Generic overview (called when type === 'bookings')
// =============================================================================
async function renderBookings(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result = await callMasterRpc(supabase, companyId, bid, start, end);
            const sc  = result.stat_cards || {};
            const tot = result.bk_total   || {};
            const k   = tot.kpis          || {};
            const rows = tot.rows         || [];

            data.kpi1.value = Number(k.total_bookings || 0).toLocaleString('en-IN');
            data.kpi2.value = Number(k.completed      || 0).toLocaleString('en-IN');
            data.kpi3.value = Number(k.cancelled      || 0).toLocaleString('en-IN');
            data.kpi4.value = Number(k.no_shows       || 0).toLocaleString('en-IN');
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'date', 'amount');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'status');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Status'];
            updateTable(data.headers, rows.map(r => [
                r.date, r.time, r.customer, r.service, r.staff,
                formatCurrency(r.amount), statusPill(r.status)
            ]));
        } catch (err) {
            console.error('[bookings] renderBookings error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkTotal — All appointments with status breakdown
// =============================================================================
async function renderBkTotal(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_total || {};
            const k       = section.kpis    || {};
            const rows    = section.rows    || [];

            data.kpi1.value = Number(k.total_bookings || 0).toLocaleString('en-IN');
            data.kpi2.value = Number(k.completed      || 0).toLocaleString('en-IN');
            data.kpi3.value = Number(k.cancelled      || 0).toLocaleString('en-IN');
            data.kpi4.value = Number(k.no_shows       || 0).toLocaleString('en-IN');
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'date', 'amount');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'status');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Status'];
            updateTable(data.headers, rows.map(r => [
                r.date, r.time, r.customer, r.service, r.staff,
                formatCurrency(r.amount), statusPill(r.status)
            ]));
        } catch (err) {
            console.error('[bookings] renderBkTotal error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkCompleted — Completed Bookings & Revenue
// =============================================================================
async function renderBkCompleted(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_completed || {};
            const k       = section.kpis        || {};
            const rows    = section.rows        || [];

            data.kpi1.value = Number(k.completed_bookings || 0).toLocaleString('en-IN');
            data.kpi2.value = Number(k.completion_rate    || 0).toFixed(1) + '%';
            data.kpi3.value = formatCurrency(k.completed_revenue       || 0);
            data.kpi4.value = formatCurrency(k.avg_revenue_per_booking || 0);
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'datetime', 'amount');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'service');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            data.headers = ['Booking ID', 'Date & Time', 'Customer Name', 'Services Delivered', 'Staff Assigned', 'Bill Amount', 'Payment Status'];
            updateTable(data.headers, rows.map(r => [
                r.booking_id,
                r.datetime,
                r.customer,
                r.service,
                r.staff,
                '<strong style="color:#10b981;">' + formatCurrency(r.amount) + '</strong>',
                statusPill(r.payment_status)
            ]));
        } catch (err) {
            console.error('[bookings] renderBkCompleted error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkCancelled — Cancelled Bookings
// =============================================================================
async function renderBkCancelled(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_cancelled || {};
            const k       = section.kpis        || {};
            const rows    = section.rows        || [];

            data.kpi1.value = Number(k.cancelled_bookings       || 0).toLocaleString('en-IN');
            data.kpi2.value = Number(k.cancellation_rate        || 0).toFixed(1) + '%';
            data.kpi3.value = formatCurrency(k.estimated_value_affected || 0);
            data.kpi4.value = Number(k.same_day_cancellations   || 0).toLocaleString('en-IN');
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'datetime', 'est_value');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'reason');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            data.headers = ['Booking ID', 'Scheduled Date & Time', 'Customer Name', 'Services Cancelled', 'Staff', 'Estimated Value', 'Cancellation Reason'];
            updateTable(data.headers, rows.map(r => [
                r.booking_id,
                r.datetime,
                r.customer,
                r.service,
                r.staff,
                '<strong style="color:#ef4444;">' + formatCurrency(r.est_value) + '</strong>',
                r.reason || '<span style="color:#94a3b8;font-style:italic;">Not specified</span>'
            ]));
        } catch (err) {
            console.error('[bookings] renderBkCancelled error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkNoShows — No-Show Bookings
// =============================================================================
async function renderBkNoShows(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_no_shows || {};
            const k       = section.kpis       || {};
            const rows    = section.rows       || [];

            data.kpi1.value = Number(k.no_show_bookings         || 0).toLocaleString('en-IN');
            data.kpi2.value = formatCurrency(k.estimated_value_missed || 0);
            data.kpi3.value = Number(k.no_show_rate             || 0).toFixed(1) + '%';
            data.kpi4.value = Number(k.repeat_no_show_customers || 0).toLocaleString('en-IN');
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'datetime', 'missed_value');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'service');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            data.headers = ['Booking ID', 'Appointment Date & Time', 'Customer Name', 'Phone', 'Services Missed', 'Staff Assigned', 'Missed Value'];
            updateTable(data.headers, rows.map(r => [
                r.booking_id,
                r.datetime,
                r.customer,
                r.phone || '<span style="color:#94a3b8;">\u2014</span>',
                r.service,
                r.staff,
                '<strong style="color:#f59e0b;">' + formatCurrency(r.missed_value) + '</strong>'
            ]));
        } catch (err) {
            console.error('[bookings] renderBkNoShows error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkRefunds — Refunded Bookings
// =============================================================================
async function renderBkRefunds(data, supabase) {
    const companyId    = resolveCompanyId();
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
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_refunds || {};
            const k       = section.kpis      || {};
            const rows    = section.rows      || [];

            data.kpi1.value = Number(k.refunded_bookings || 0).toLocaleString('en-IN');
            data.kpi2.value = formatCurrency(k.total_refunded || 0);
            data.kpi3.value = formatCurrency(k.avg_refund     || 0);
            data.kpi4.value = Number(k.refund_rate || 0).toFixed(1) + '%';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

            const trend = buildTrendFromRows(rows, 'refund_date', 'amount');
            if (typeof renderTrendChart === 'function') renderTrendChart(trend.labels, trend.values);

            const dist = buildDistFromRows(rows, 'method');
            if (typeof renderDistributionChart === 'function') renderDistributionChart(dist.labels, dist.values);

            const methodStyle = m => {
                const map = { 'cash': 'background:#f0fdf4;color:#166534;', 'upi': 'background:#eff6ff;color:#1e40af;', 'card': 'background:#f5f3ff;color:#5b21b6;' };
                return map[(m || '').toLowerCase()] || 'background:#f1f5f9;color:#64748b;';
            };
            data.headers = ['Refund Ref', 'Refund Date', 'Original Booking ID', 'Customer Name', 'Refund Method', 'Refund Amount', 'Reason / Notes'];
            updateTable(data.headers, rows.map(r => [
                r.refund_ref,
                r.refund_date,
                r.booking_id,
                r.customer,
                '<span class="status-pill" style="' + methodStyle(r.method) + '">' + (r.method || '\u2014') + '</span>',
                '<strong style="color:#ef4444;">' + formatCurrency(r.amount) + '</strong>',
                r.notes || '<span style="color:#94a3b8;font-style:italic;">Not specified</span>'
            ]));
        } catch (err) {
            console.error('[bookings] renderBkRefunds error:', err);
            setError(data);
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// Export: render dispatcher
// =============================================================================
const handlers = {
    'bookings':     renderBookings,
    'bk-total':     renderBkTotal,
    'bk-completed': renderBkCompleted,
    'bk-cancelled': renderBkCancelled,
    'bk-no-shows':  renderBkNoShows,
    'bk-refunds':   renderBkRefunds,
};

export async function render(data, supabase, type) {
    const t       = type || data?.type || 'bookings';
    const handler = handlers[t];
    if (handler) return await handler(data, supabase);
    updateTable(data.headers, data.rows || []);
}
