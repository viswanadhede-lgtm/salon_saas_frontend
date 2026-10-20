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
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toIso    = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    if (!filterStart.value) filterStart.value = toIso(firstDay);
    if (!filterEnd.value)   filterEnd.value   = toIso(lastDay);
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
    colSpan = colSpan || 8;
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

// Date parser & 7-Day Trend Mini Sparklines for Snapshot Cards
function parseRowDate(row) {
    if (!row) return null;
    const raw = row.date || row.datetime || row.refund_date || '';
    if (!raw) return null;
    const cleanDateStr = String(raw).split(',')[0].trim();
    const parsed = new Date(cleanDateStr);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
}

function build7DayTrend(rows, unitLabel = 'bookings') {
    const days = [];
    const now = new Date();
    // 7 days ending today
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const y = d.getFullYear();
        const m = d.getMonth();
        const dt = d.getDate();
        const shortLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        days.push({ y, m, dt, shortLabel, count: 0 });
    }

    if (Array.isArray(rows)) {
        rows.forEach(r => {
            const rd = parseRowDate(r);
            if (!rd) return;
            const y = rd.getFullYear();
            const m = rd.getMonth();
            const dt = rd.getDate();
            const match = days.find(d => d.y === y && d.m === m && d.dt === dt);
            if (match) {
                match.count += 1;
            }
        });
    }

    const max = Math.max(...days.map(d => d.count), 1);

    return days.map((d, idx) => {
        const isToday = (idx === 6);
        const h = d.count > 0 ? Math.min(28, Math.round(6 + (d.count / max) * 22)) : 3;
        const opacity = d.count > 0 ? (isToday ? '1' : '0.82') : '0.22';
        const tooltip = `${d.shortLabel}: ${d.count} ${unitLabel}`;
        return `<span style="height: ${h}px; opacity: ${opacity};" title="${tooltip}"></span>`;
    }).join('');
}

// Module-level chart instances for Total Bookings
let bkTotalTrendChart = null;
let bkTotalDonutChart = null;

// Dual-axis Performance Trend: Bookings vs Revenue
function renderBkTotalPerformanceTrend(rows) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (bkTotalTrendChart) {
        bkTotalTrendChart.destroy();
        bkTotalTrendChart = null;
    }

    if (!rows || rows.length === 0) {
        bkTotalTrendChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['No Data'], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const dateMap = {};
    rows.forEach(r => {
        let d = r.date || 'Unknown';
        if (d.includes(',')) d = d.split(',')[0].trim();
        if (!dateMap[d]) {
            dateMap[d] = {
                count: 0,
                revenue: 0,
                rawDate: new Date(d)
            };
        }
        dateMap[d].count += 1;
        dateMap[d].revenue += Number(r.amount || 0);
    });

    const sortedDates = Object.keys(dateMap).sort((a, b) => {
        const da = dateMap[a].rawDate.getTime();
        const db = dateMap[b].rawDate.getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
    });

    const labels = sortedDates.map(d => {
        const dt = dateMap[d].rawDate;
        return !isNaN(dt.getTime())
            ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : d;
    });

    const bookingCounts = sortedDates.map(d => dateMap[d].count);
    const revenueAmounts = sortedDates.map(d => dateMap[d].revenue);

    bkTotalTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Bookings',
                    data: bookingCounts,
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    hoverBackgroundColor: '#6366f1',
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    order: 2,
                    maxBarThickness: 32
                },
                {
                    type: 'line',
                    label: 'Revenue (₹)',
                    data: revenueAmounts,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.10)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        font: { size: 12, weight: '500' },
                        color: '#475569'
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.yAxisID === 'y1') {
                                return ' Revenue: ₹' + Number(context.parsed.y || 0).toLocaleString('en-IN');
                            }
                            return ' Bookings: ' + Number(context.parsed.y || 0).toLocaleString('en-IN');
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Bookings',
                        color: '#6366f1',
                        font: { size: 11, weight: '600' }
                    },
                    grid: { color: '#f1f5f9', drawBorder: false },
                    ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Revenue (₹)',
                        color: '#10b981',
                        font: { size: 11, weight: '600' }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: (v) => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
                    }
                }
            }
        }
    });
}

// Clean Donut Chart for Booking Status Breakdown
function renderBkTotalStatusDonut(k, rows, revs = {}) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (bkTotalDonutChart) {
        bkTotalDonutChart.destroy();
        bkTotalDonutChart = null;
    }

    const completed = Number(k.completed || 0);
    const cancelled = Number(k.cancelled || 0);
    const noShows   = Number(k.no_shows || 0);
    const total     = Number(k.total_bookings || (completed + cancelled + noShows) || 0);
    const other     = Math.max(0, total - (completed + cancelled + noShows));

    const labels   = ['Completed Bookings', 'Cancelled Bookings', 'No-Shows'];
    const dataVals = [completed, cancelled, noShows];
    const colors   = ['#10b981', '#ef4444', '#f59e0b'];

    if (other > 0) {
        labels.push('Confirmed / Other');
        dataVals.push(other);
        colors.push('#6366f1');
    }

    bkTotalDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed || 0;
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Update Center Stat
    const centerVal = document.getElementById('donutCenterValue');
    const centerLbl = document.getElementById('donutCenterLabel');
    if (centerVal) centerVal.textContent = total.toLocaleString('en-IN');
    if (centerLbl) centerLbl.textContent = 'Total Bookings';

    // Calculate revenue amounts
    let fallbackCompletedRev = 0;
    let fallbackCancelRev = 0;
    let fallbackNoShowRev = 0;
    (rows || []).forEach(r => {
        const s = (r.status || '').toLowerCase().replace(/[\s_]/g, '-');
        const amt = Number(r.amount || 0);
        if (s === 'completed') fallbackCompletedRev += amt;
        else if (s === 'cancelled') fallbackCancelRev += amt;
        else if (s === 'no-show' || s === 'noshow') fallbackNoShowRev += amt;
    });

    const finalCompletedRev = (revs.realizedRev !== undefined && revs.realizedRev !== 0) ? revs.realizedRev : fallbackCompletedRev;
    const finalCancelRev    = (revs.cancelVal !== undefined && revs.cancelVal !== 0)     ? revs.cancelVal   : fallbackCancelRev;
    const finalNoShowRev    = (revs.noShowVal !== undefined && revs.noShowVal !== 0)     ? revs.noShowVal   : fallbackNoShowRev;

    const cur = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
    const getPct = (count) => {
        if (!total || total <= 0) return '0%';
        const val = (count / total) * 100;
        return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + '%';
    };

    const legendItems = [
        {
            name: 'Completed Bookings',
            count: completed,
            color: '#10b981',
            pct: getPct(completed),
            revLabel: 'Revenue Generated',
            revVal: cur(finalCompletedRev),
            revColor: '#10b981'
        },
        {
            name: 'Cancelled Bookings',
            count: cancelled,
            color: '#ef4444',
            pct: getPct(cancelled),
            revLabel: 'Estimated Revenue',
            revVal: cur(finalCancelRev),
            revColor: '#ef4444'
        },
        {
            name: 'No-Shows',
            count: noShows,
            color: '#f59e0b',
            pct: getPct(noShows),
            revLabel: 'Missed Revenue',
            revVal: cur(finalNoShowRev),
            revColor: '#d97706'
        }
    ];

    if (other > 0) {
        let otherAmt = 0;
        (rows || []).forEach(r => {
            const s = (r.status || '').toLowerCase().replace(/[\s_]/g, '-');
            if (s !== 'completed' && s !== 'cancelled' && s !== 'no-show' && s !== 'noshow') {
                otherAmt += Number(r.amount || 0);
            }
        });
        legendItems.push({
            name: 'Confirmed / Other',
            count: other,
            color: '#6366f1',
            pct: getPct(other),
            revLabel: 'Estimated Value',
            revVal: cur(otherAmt),
            revColor: '#6366f1'
        });
    }

    // Update Legend (3 single-line rows)
    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        legendEl.innerHTML = legendItems.map(item => `
            <div class="donut-legend-item">
                <span class="donut-legend-dot" style="background-color: ${item.color};"></span>
                <span class="donut-legend-text">
                    ${item.name} - <strong>${item.count}</strong> (${item.pct}), ${item.revLabel} - <strong style="color: ${item.revColor};">${item.revVal}</strong>
                </span>
            </div>
        `).join('');
    }
}

// ─── Payment badge HTML helper (for the report table) ────────────────────────
function paymentBadge(rawStatus) {
    const s = (rawStatus || '').toLowerCase().trim();
    const map = {
        'paid':     { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        'unpaid':   { color: '#991b1b', bg: '#fee2e2', label: 'Unpaid' },
        'pending':  { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        'partial':  { color: '#86198f', bg: '#f5d0fe', label: 'Partial' },
        'refunded': { color: '#b45309', bg: '#fef3c7', label: 'Refunded' },
    };
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: rawStatus || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Amount colour based on booking status ────────────────────────────────────
function amountColor(status) {
    const s = (status || '').toLowerCase().replace(/[\s_]/g, '-');
    if (s === 'completed')                         return '#059669'; // green
    if (s === 'cancelled')                         return '#dc2626'; // red
    if (s === 'no-show' || s === 'noshow')         return '#d97706'; // amber
    return '#0f172a';                                                 // default dark
}

// ─── Expandable service chips (first + "+N" toggle) ───────────────────────────
function buildServiceCell(serviceStr) {
    if (!serviceStr || serviceStr === '-') return '<span style="color:#94a3b8;">—</span>';
    const chipStyle = 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;';
    const names = serviceStr.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return '<span style="color:#94a3b8;">—</span>';
    const firstChip = `<span style="${chipStyle}">${names[0]}</span>`;
    if (names.length === 1) return firstChip;
    const extraCount = names.length - 1;
    const extraChips = names.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
    return `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
        ${firstChip}
        <span onclick="(function(btn){var el=btn.nextElementSibling;var hidden=el.style.display==='none'||el.style.display==='';el.style.display=hidden?'flex':'none';btn.textContent=hidden?'▲ less':'+${extraCount}';})(this)"
            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
        <div style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">${extraChips}</div>
    </div>`;
}

// ─── Expandable staff chips (first + "+N" toggle) ─────────────────────────────
function buildStaffCell(staffStr) {
    if (!staffStr || staffStr === '-') return '<span style="color:#94a3b8;">—</span>';
    const chipStyle = 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f8fafc;color:#475569;border:1px solid #e2e8f0;margin:1px 2px 1px 0;white-space:nowrap;';
    const names = staffStr.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return '<span style="color:#94a3b8;">—</span>';
    const firstChip = `<span style="${chipStyle}">${names[0]}</span>`;
    if (names.length === 1) return firstChip;
    const extraCount = names.length - 1;
    const extraChips = names.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
    return `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
        ${firstChip}
        <span onclick="(function(btn){var el=btn.nextElementSibling;var hidden=el.style.display==='none'||el.style.display==='';el.style.display=hidden?'flex':'none';btn.textContent=hidden?'▲ less':'+${extraCount}';})(this)"
            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#f3e8ff;color:#7e22ce;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
        <div style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">${extraChips}</div>
    </div>`;
}

// Table Setup with Search, 25-item Pagination, Export CSV, and Print
function setupBkTotalTable(rows, filterStart, filterEnd) {
    let currentPage = 1;
    const pageSize = 25;
    let currentFilteredRows = [...(rows || [])];

    const thead = document.getElementById('tableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
            </tr>`;
    }

    function renderPage(page) {
        currentPage = page;
        const total = currentFilteredRows.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = Math.min(startIdx + pageSize, total);
        const pageRows = currentFilteredRows.slice(startIdx, endIdx);

        // Update table body
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8;">No bookings match your filter criteria.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(r => {
                    // ── 1. Customer: clickable indigo link opening global profile modal
                    const custId   = (r.customer_id || '').replace(/'/g, "\\'");
                    const custName = (r.customer || '—').replace(/'/g, "\\'");
                    const customerCell = r.customer
                        ? `<span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${custName}')">${r.customer}</span>`
                        : '<span style="color:#94a3b8;">—</span>';

                    // ── 2. Service: first chip + expandable +N
                    const serviceCell = buildServiceCell(r.service);

                    // ── 2b. Staff: first chip + expandable +N
                    const staffCell = buildStaffCell(r.staff);

                    // ── 3. Amount: color by booking status
                    const amtStyle = `color:${amountColor(r.status)};font-weight:700;`;

                    // ── 4. Payment badge
                    const payCell = paymentBadge(r.payment_status);

                    return `
                    <tr style="border-bottom:1px solid #f8fafc;transition:background 0.15s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                        <td style="padding:14px 8px 14px 16px;"><strong style="font-size:0.85rem;color:#0f172a;">${r.date || '—'}</strong></td>
                        <td style="padding:14px 8px;font-size:0.85rem;color:#64748b;">${r.time || '—'}</td>
                        <td style="padding:14px 8px;">${customerCell}</td>
                        <td style="padding:14px 8px;max-width:200px;">${serviceCell}</td>
                        <td style="padding:14px 8px;max-width:180px;">${staffCell}</td>
                        <td style="padding:14px 8px;font-size:0.875rem;${amtStyle}">${formatCurrency(r.amount)}</td>
                        <td style="padding:14px 8px;">${payCell}</td>
                        <td style="padding:14px 8px;">${statusPill(r.status)}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Update record count badge
        const badge = document.getElementById('tableRecordCountBadge');
        if (badge) badge.textContent = `${total} bookings`;

        // Update pagination info text
        const info = document.getElementById('paginationInfo');
        if (info) {
            if (total === 0) {
                info.textContent = 'Showing 0 to 0 of 0 bookings';
            } else {
                info.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} bookings`;
            }
        }

        // Render pagination controls
        const controls = document.getElementById('paginationControls');
        if (controls) {
            if (totalPages <= 1) {
                controls.innerHTML = '';
                return;
            }

            let html = '';
            html += `<button class="page-btn" id="btnPagePrev" ${currentPage === 1 ? 'disabled' : ''}>&larr; Prev</button>`;

            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                } else if (p === currentPage - 3 || p === currentPage + 3) {
                    html += `<span style="padding:0 4px;color:#94a3b8;">...</span>`;
                }
            }

            html += `<button class="page-btn" id="btnPageNext" ${currentPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>`;
            controls.innerHTML = html;

            controls.querySelectorAll('[data-page]').forEach(btn => {
                btn.onclick = () => renderPage(Number(btn.getAttribute('data-page')));
            });
            const prevBtn = document.getElementById('btnPagePrev');
            if (prevBtn) prevBtn.onclick = () => renderPage(currentPage - 1);
            const nextBtn = document.getElementById('btnPageNext');
            if (nextBtn) nextBtn.onclick = () => renderPage(currentPage + 1);
        }
    }

    // Wire Search Filter (also searches payment_status)
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const query = (e.target.value || '').toLowerCase().trim();
            if (!query) {
                currentFilteredRows = [...(rows || [])];
            } else {
                currentFilteredRows = (rows || []).filter(r => {
                    const cust = (r.customer || '').toLowerCase();
                    const srv  = (r.service || '').toLowerCase();
                    const stf  = (r.staff || '').toLowerCase();
                    const st   = (r.status || '').toLowerCase();
                    const dt   = (r.date || '').toLowerCase();
                    const pay  = (r.payment_status || '').toLowerCase();
                    return cust.includes(query) || srv.includes(query) || stf.includes(query) || st.includes(query) || dt.includes(query) || pay.includes(query);
                });
            }
            renderPage(1);
        };
    }

    // Wire Export CSV
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!currentFilteredRows || currentFilteredRows.length === 0) {
                alert('No bookings data to export.');
                return;
            }
            const csvHeaders = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Payment', 'Status'];
            const csvLines = [csvHeaders.join(',')];
            currentFilteredRows.forEach(r => {
                const line = [
                    `"${r.date || ''}"`,
                    `"${r.time || ''}"`,
                    `"${(r.customer || '').replace(/"/g, '""')}"`,
                    `"${(r.service || '').replace(/"/g, '""')}"`,
                    `"${(r.staff || '').replace(/"/g, '""')}"`,
                    `"${r.amount || 0}"`,
                    `"${r.payment_status || ''}"`,
                    `"${r.status || ''}"`
                ];
                csvLines.push(line.join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const sDate = filterStart ? filterStart.value : 'all';
            const eDate = filterEnd ? filterEnd.value : 'all';
            a.download = `Total_Bookings_${sDate}_to_${eDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    // Wire Print Table
    const printBtn = document.getElementById('btnPrintTable');
    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    // Initial render
    renderPage(1);
}

// =============================================================================
// renderBkTotal — All bookings with status breakdown
// =============================================================================
async function renderBkTotal(data, supabase) {
    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Ensure 4-card snapshot panel is displayed and other panels are hidden
    const snapPanel  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');
    if (snapPanel)  snapPanel.style.display  = 'block';
    if (snapComp)   snapComp.style.display   = 'none';
    if (snapCanc)   snapCanc.style.display   = 'none';
    if (snapNoShow) snapNoShow.style.display = 'none';
    if (kpiRow)     kpiRow.style.display     = 'none';

    setDefaultDateRange(filterStart, filterEnd);

    const setSnapLoading = () => {
        const elTotal     = document.getElementById('bkSnapTotal');
        const elCompleted = document.getElementById('bkSnapCompleted');
        const elCancelled = document.getElementById('bkSnapCancelled');
        const elNoShows   = document.getElementById('bkSnapNoShows');
        if (elTotal)     elTotal.textContent     = 'Loading...';
        if (elCompleted) elCompleted.textContent = 'Loading...';
        if (elCancelled) elCancelled.textContent = 'Loading...';
        if (elNoShows)   elNoShows.textContent   = 'Loading...';
    };

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 7);
        setSnapLoading();
        try {
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const sc      = result.stat_cards || {};
            const section = result.bk_total   || {};
            const k       = section.kpis      || {};
            const rows    = section.rows      || [];

            // 1. Populate the 4 Snapshot Cards
            const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
            const cur = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

            const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

            const totalCount     = (sc.total_bookings !== undefined)     ? sc.total_bookings     : (k.total_bookings || 0);
            const completedCount = (sc.completed_bookings !== undefined) ? sc.completed_bookings : (k.completed || 0);
            const cancelledCount = (sc.cancelled_bookings !== undefined) ? sc.cancelled_bookings : (k.cancelled || 0);
            const noShowCount    = (sc.no_show_bookings !== undefined)    ? sc.no_show_bookings    : (k.no_shows || 0);

            const realizedRev = (sc.realized_revenue !== undefined)         ? sc.realized_revenue         : 0;
            const cancelVal   = (sc.estimated_value_affected !== undefined) ? sc.estimated_value_affected : 0;
            const noShowVal   = (sc.estimated_value_missed !== undefined)   ? sc.estimated_value_missed   : 0;

            setEl('bkSnapTotal',       fmt(totalCount));
            setEl('bkSnapCompleted',   fmt(completedCount));
            setHtml('bkSnapRevenue',   'Realised revenue: ' + cur(realizedRev));
            setEl('bkSnapCancelled',   fmt(cancelledCount));
            setHtml('bkSnapCancelVal', 'Estimated value: ' + cur(cancelVal));
            setEl('bkSnapNoShows',     fmt(noShowCount));
            setHtml('bkSnapNoShowVal', 'Estimated missed: ' + cur(noShowVal));

            // Populate mini sparkline bars for the 4 cards
            const completedRows = (result.bk_completed && result.bk_completed.rows) ? result.bk_completed.rows : [];
            const cancelledRows = (result.bk_cancelled && result.bk_cancelled.rows) ? result.bk_cancelled.rows : [];
            const noShowRows    = (result.bk_no_shows  && result.bk_no_shows.rows)  ? result.bk_no_shows.rows  : [];

            const elTotalBars = document.getElementById('bkBarsTotal');
            if (elTotalBars) elTotalBars.innerHTML = build7DayTrend(rows, 'bookings');

            const elCompBars = document.getElementById('bkBarsCompleted');
            if (elCompBars) elCompBars.innerHTML = build7DayTrend(completedRows, 'completed');

            const elCancBars = document.getElementById('bkBarsCancelled');
            if (elCancBars) elCancBars.innerHTML = build7DayTrend(cancelledRows, 'cancelled');

            const elNoShowBars = document.getElementById('bkBarsNoShows');
            if (elNoShowBars) elNoShowBars.innerHTML = build7DayTrend(noShowRows, 'no-shows');

            // 2. Performance Trend: Booking Volume & Revenue
            renderBkTotalPerformanceTrend(rows);

            // 3. Status Distribution: Completed, Cancelled, No-Shows
            renderBkTotalStatusDonut(k, rows, { realizedRev, cancelVal, noShowVal });

            // 4. All Bookings Table: Search, 25-item Pagination, Export CSV, and Print
            setupBkTotalTable(rows, filterStart, filterEnd);

            if (window.feather) window.feather.replace();
        } catch (err) {
            console.error('[bookings] renderBkTotal error:', err);
            setError(data);
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('bkSnapTotal', '—');
            setEl('bkSnapCompleted', '—');
            setEl('bkSnapCancelled', '—');
            setEl('bkSnapNoShows', '—');
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (filterBranch) filterBranch.onchange = loadData;
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// Dual-axis Trend for Completed Bookings (Bookings vs Revenue)
// =============================================================================
let bkCompletedTrendChart = null;
function renderBkCompletedPerformanceTrend(rows) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (bkCompletedTrendChart) { bkCompletedTrendChart.destroy(); bkCompletedTrendChart = null; }
    if (bkTotalTrendChart)     { bkTotalTrendChart.destroy();     bkTotalTrendChart = null; }
    const existing = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existing) existing.destroy();

    const titleEl = document.getElementById('leftChartTitle');
    if (titleEl) titleEl.textContent = 'Performance Trend (Bookings vs Revenue)';

    if (!rows || rows.length === 0) {
        bkCompletedTrendChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['No Data'], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const dateMap = {};
    rows.forEach(r => {
        let d = r.date || r.datetime || 'Unknown';
        if (d.includes(',')) d = d.split(',')[0].trim();
        if (!dateMap[d]) {
            dateMap[d] = {
                count: 0,
                revenue: 0,
                rawDate: new Date(d)
            };
        }
        dateMap[d].count += 1;
        dateMap[d].revenue += Number(r.amount || 0);
    });

    const sortedDates = Object.keys(dateMap).sort((a, b) => {
        const da = dateMap[a].rawDate.getTime();
        const db = dateMap[b].rawDate.getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
    });

    const labels = sortedDates.map(d => {
        const dt = dateMap[d].rawDate;
        return !isNaN(dt.getTime())
            ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : d;
    });

    const bookingCounts  = sortedDates.map(d => dateMap[d].count);
    const revenueAmounts = sortedDates.map(d => dateMap[d].revenue);

    bkCompletedTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Completed Bookings',
                    data: bookingCounts,
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    hoverBackgroundColor: '#6366f1',
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    order: 2,
                    maxBarThickness: 32
                },
                {
                    type: 'line',
                    label: 'Realized Revenue (₹)',
                    data: revenueAmounts,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.10)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        font: { size: 12, weight: '500' },
                        color: '#64748b',
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.yAxisID === 'y1') {
                                return ` Revenue: ₹${Number(context.parsed.y || 0).toLocaleString('en-IN')}`;
                            }
                            return ` Completed: ${context.parsed.y} booking${context.parsed.y === 1 ? '' : 's'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Bookings',
                        color: '#6366f1',
                        font: { size: 11, weight: '600' }
                    },
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        precision: 0,
                        color: '#94a3b8',
                        font: { size: 11 }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Revenue (₹)',
                        color: '#10b981',
                        font: { size: 11, weight: '600' }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: (v) => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
                    }
                }
            }
        }
    });
}

// =============================================================================
// Service Revenue Breakdown Donut Chart for Completed Bookings
// =============================================================================
let bkCompletedDonutChart = null;
function renderBkCompletedServiceDonut(rows, k) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;

    if (bkCompletedDonutChart) { bkCompletedDonutChart.destroy(); bkCompletedDonutChart = null; }
    if (bkTotalDonutChart)     { bkTotalDonutChart.destroy();     bkTotalDonutChart = null; }
    const existing = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existing) existing.destroy();

    const titleEl = document.getElementById('rightChartTitle');
    if (titleEl) titleEl.textContent = 'Completed Revenue by Service';

    const serviceMap = {};
    let totalComputedRevenue = 0;

    (rows || []).forEach(r => {
        const rawService = r.service || 'Other';
        const amt = Number(r.amount || 0);
        const names = rawService.split(',').map(s => s.trim()).filter(Boolean);
        const svcCount = names.length || 1;
        const perSvcAmt = amt / svcCount;

        if (names.length === 0) {
            names.push('Unspecified');
        }

        names.forEach(name => {
            if (!serviceMap[name]) {
                serviceMap[name] = { count: 0, revenue: 0 };
            }
            serviceMap[name].count   += 1;
            serviceMap[name].revenue += perSvcAmt;
            totalComputedRevenue    += perSvcAmt;
        });
    });

    const entries = Object.entries(serviceMap).sort((a, b) => b[1].revenue - a[1].revenue);
    const palette = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

    let labels   = [];
    let dataVals = [];
    let counts   = [];
    let colors   = [];

    if (entries.length <= 5) {
        entries.forEach((e, idx) => {
            labels.push(e[0]);
            dataVals.push(Math.round(e[1].revenue));
            counts.push(e[1].count);
            colors.push(palette[idx % palette.length]);
        });
    } else {
        const top5 = entries.slice(0, 5);
        const rest = entries.slice(5);

        top5.forEach((e, idx) => {
            labels.push(e[0]);
            dataVals.push(Math.round(e[1].revenue));
            counts.push(e[1].count);
            colors.push(palette[idx % palette.length]);
        });

        const otherRev   = rest.reduce((sum, e) => sum + e[1].revenue, 0);
        const otherCount = rest.reduce((sum, e) => sum + e[1].count, 0);
        labels.push('Other Services');
        dataVals.push(Math.round(otherRev));
        counts.push(otherCount);
        colors.push('#64748b');
    }

    const grandRevenue = Number(k?.completed_revenue) || totalComputedRevenue;

    bkCompletedDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const rev = context.parsed || 0;
                            const pct = grandRevenue > 0 ? ((rev / grandRevenue) * 100).toFixed(1) : 0;
                            const idx = context.dataIndex;
                            const c = counts[idx] || 0;
                            return ` ${context.label}: ₹${rev.toLocaleString('en-IN')} (${pct}%) • ${c} service${c === 1 ? '' : 's'}`;
                        }
                    }
                }
            }
        }
    });

    // Update Center Stat
    const centerVal = document.getElementById('donutCenterValue');
    const centerLbl = document.getElementById('donutCenterLabel');
    if (centerVal) centerVal.textContent = '₹' + Math.round(grandRevenue).toLocaleString('en-IN');
    if (centerLbl) centerLbl.textContent = 'Total Revenue';

    // Update Legend (Single-line items: Service - Count (%), Revenue - ₹X)
    const cur = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
    const getPct = (rev) => {
        if (!grandRevenue || grandRevenue <= 0) return '0%';
        const val = (rev / grandRevenue) * 100;
        return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + '%';
    };

    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        if (labels.length === 0) {
            legendEl.innerHTML = '<div style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:8px;">No completed services found.</div>';
        } else {
            legendEl.innerHTML = labels.map((name, i) => `
                <div class="donut-legend-item">
                    <span class="donut-legend-dot" style="background-color: ${colors[i]};"></span>
                    <span class="donut-legend-text">
                        ${name} - <strong>${counts[i]}</strong> (${getPct(dataVals[i])}), Revenue - <strong style="color: ${colors[i]};">${cur(dataVals[i])}</strong>
                    </span>
                </div>
            `).join('');
        }
    }
}

// =============================================================================
// Table Setup for Completed Bookings with 25-item Pagination, Search, CSV & Print
// =============================================================================
function setupBkCompletedTable(rows, filterStart, filterEnd) {
    let currentPage = 1;
    const pageSize = 25;
    let currentFilteredRows = [...(rows || [])];

    const titleText = document.getElementById('tableTitleText');
    if (titleText) titleText.textContent = 'Completed Booking Records';

    const thead = document.getElementById('tableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
            </tr>`;
    }

    function renderPage(page) {
        currentPage = page;
        const total = currentFilteredRows.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = Math.min(startIdx + pageSize, total);
        const pageRows = currentFilteredRows.slice(startIdx, endIdx);

        // Update table body
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8;">No completed bookings match your filter criteria.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(r => {
                    const custId   = (r.customer_id || '').replace(/'/g, "\\'");
                    const custName = (r.customer || '—').replace(/'/g, "\\'");
                    const customerCell = r.customer
                        ? `<span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${custName}')">${r.customer}</span>`
                        : '<span style="color:#94a3b8;">—</span>';

                    const serviceCell = buildServiceCell(r.service);
                    const staffCell   = buildStaffCell(r.staff);
                    const payCell     = paymentBadge(r.payment_status);

                    let dt = r.datetime || '';
                    let dateStr = r.date || '';
                    let timeStr = r.time || '';
                    if (!dateStr && dt) {
                        const parts = dt.split(',');
                        dateStr = parts[0] ? parts[0].trim() : '—';
                        timeStr = parts[1] ? parts[1].trim() : '—';
                    }

                    return `
                    <tr style="border-bottom:1px solid #f8fafc;transition:background 0.15s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                        <td style="padding:14px 8px 14px 16px;"><strong style="font-size:0.85rem;color:#0f172a;">${dateStr || '—'}</strong></td>
                        <td style="padding:14px 8px;font-size:0.85rem;color:#64748b;">${timeStr || '—'}</td>
                        <td style="padding:14px 8px;">${customerCell}</td>
                        <td style="padding:14px 8px;max-width:200px;">${serviceCell}</td>
                        <td style="padding:14px 8px;max-width:180px;">${staffCell}</td>
                        <td style="padding:14px 8px;font-size:0.875rem;color:#059669;font-weight:700;">${formatCurrency(r.amount)}</td>
                        <td style="padding:14px 8px;">${payCell}</td>
                        <td style="padding:14px 8px;">${statusPill('completed')}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Update record count badge
        const badge = document.getElementById('tableRecordCountBadge');
        if (badge) badge.textContent = `${total} bookings`;

        // Update pagination info text
        const info = document.getElementById('paginationInfo');
        if (info) {
            if (total === 0) {
                info.textContent = 'Showing 0 to 0 of 0 bookings';
            } else {
                info.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} bookings`;
            }
        }

        // Render pagination controls
        const controls = document.getElementById('paginationControls');
        if (controls) {
            if (totalPages <= 1) {
                controls.innerHTML = '';
                return;
            }

            let html = '';
            html += `<button class="page-btn" id="btnPagePrevComp" ${currentPage === 1 ? 'disabled' : ''}>&larr; Prev</button>`;

            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                } else if (p === currentPage - 3 || p === currentPage + 3) {
                    html += `<span style="padding:0 4px;color:#94a3b8;">...</span>`;
                }
            }

            html += `<button class="page-btn" id="btnPageNextComp" ${currentPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>`;
            controls.innerHTML = html;

            controls.querySelectorAll('[data-page]').forEach(btn => {
                btn.onclick = () => renderPage(Number(btn.getAttribute('data-page')));
            });
            const prevBtn = document.getElementById('btnPagePrevComp');
            if (prevBtn) prevBtn.onclick = () => renderPage(currentPage - 1);
            const nextBtn = document.getElementById('btnPageNextComp');
            if (nextBtn) nextBtn.onclick = () => renderPage(currentPage + 1);
        }
    }

    // Wire Search Filter
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const query = (e.target.value || '').toLowerCase().trim();
            if (!query) {
                currentFilteredRows = [...(rows || [])];
            } else {
                currentFilteredRows = (rows || []).filter(r => {
                    const cust = (r.customer || '').toLowerCase();
                    const srv  = (r.service || '').toLowerCase();
                    const stf  = (r.staff || '').toLowerCase();
                    const dt   = (r.datetime || r.date || '').toLowerCase();
                    const pay  = (r.payment_status || '').toLowerCase();
                    return cust.includes(query) || srv.includes(query) || stf.includes(query) || dt.includes(query) || pay.includes(query);
                });
            }
            renderPage(1);
        };
    }

    // Wire Export CSV
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!currentFilteredRows || currentFilteredRows.length === 0) {
                alert('No completed bookings data to export.');
                return;
            }
            const csvHeaders = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Payment', 'Status'];
            const csvLines = [csvHeaders.join(',')];
            currentFilteredRows.forEach(r => {
                let dt = r.datetime || '';
                let d = r.date || (dt.includes(',') ? dt.split(',')[0].trim() : dt);
                let t = r.time || (dt.includes(',') ? dt.split(',')[1].trim() : '');
                const line = [
                    `"${d || ''}"`,
                    `"${t || ''}"`,
                    `"${(r.customer || '').replace(/"/g, '""')}"`,
                    `"${(r.service || '').replace(/"/g, '""')}"`,
                    `"${(r.staff || '').replace(/"/g, '""')}"`,
                    `"${r.amount || 0}"`,
                    `"${r.payment_status || ''}"`,
                    `"Completed"`
                ];
                csvLines.push(line.join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const sDate = filterStart ? filterStart.value : 'all';
            const eDate = filterEnd ? filterEnd.value : 'all';
            a.download = `Completed_Bookings_${sDate}_to_${eDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    // Wire Print Table
    const printBtn = document.getElementById('btnPrintTable');
    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    // Initial render
    renderPage(1);
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

    // Display the enhanced Completed Bookings snapshot panel
    const snapPanel  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');
    if (snapPanel)  snapPanel.style.display  = 'none';
    if (snapComp)   snapComp.style.display   = 'block';
    if (snapCanc)   snapCanc.style.display   = 'none';
    if (snapNoShow) snapNoShow.style.display = 'none';
    if (kpiRow)     kpiRow.style.display     = 'none';

    setDefaultDateRange(filterStart, filterEnd);

    const setCompSnapLoading = () => {
        const elCount   = document.getElementById('bkCompSnapCount');
        const elRate    = document.getElementById('bkCompSnapRate');
        const elRevenue = document.getElementById('bkCompSnapRevenue');
        const elAvg     = document.getElementById('bkCompSnapAvg');
        if (elCount)   elCount.textContent   = 'Loading...';
        if (elRate)    elRate.textContent    = 'Loading...';
        if (elRevenue) elRevenue.textContent = 'Loading...';
        if (elAvg)     elAvg.textContent     = 'Loading...';
    };

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        setLoading(data, 8);
        setCompSnapLoading();
        try {
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const sc      = result.stat_cards || {};
            const section = result.bk_completed || {};
            const k       = section.kpis        || {};
            const rows    = section.rows        || [];

            const totalBookings     = sc.total_bookings || k.completed_bookings || rows.length || 0;
            const completedBookings = k.completed_bookings !== undefined ? k.completed_bookings : rows.length;
            const completionRate    = Number(k.completion_rate || (totalBookings > 0 ? (completedBookings / totalBookings * 100) : 0)).toFixed(1);
            const completedRevenue  = Number(k.completed_revenue || 0);
            const avgRev            = Number(k.avg_revenue_per_booking || (completedBookings > 0 ? completedRevenue / completedBookings : 0));

            const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
            const cur = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

            const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

            // 1. Populate the 4 Enhanced Stat Cards
            setEl('bkCompSnapCount',        fmt(completedBookings));
            setHtml('bkCompSnapCountSub',   `${completionRate}% of ${fmt(totalBookings)} total appointments`);

            setEl('bkCompSnapRate',         completionRate + '%');
            setHtml('bkCompSnapRateSub',    `${fmt(completedBookings)} completed out of ${fmt(totalBookings)} bookings`);

            setEl('bkCompSnapRevenue',      cur(completedRevenue));
            setHtml('bkCompSnapRevenueSub', 'Realized revenue collected');

            setEl('bkCompSnapAvg',          cur(avgRev));
            setHtml('bkCompSnapAvgSub',     'Avg spend per completed visit');

            // Populate mini sparkline bars for the 4 cards
            const elCountBars = document.getElementById('bkCompBarsCount');
            if (elCountBars) elCountBars.innerHTML = build7DayTrend(rows, 'completed');

            const elRateBars = document.getElementById('bkCompBarsRate');
            if (elRateBars) elRateBars.innerHTML = build7DayTrend(rows, 'completed');

            const elRevBars = document.getElementById('bkCompBarsRevenue');
            if (elRevBars) elRevBars.innerHTML = build7DayTrend(rows, 'completed');

            const elAvgBars = document.getElementById('bkCompBarsAvg');
            if (elAvgBars) elAvgBars.innerHTML = build7DayTrend(rows, 'completed');

            // 2. Dual-axis Performance Trend: Bookings vs Revenue
            renderBkCompletedPerformanceTrend(rows);

            // 3. Service Performance Donut Chart
            renderBkCompletedServiceDonut(rows, k);

            // 4. Completed Bookings Table with 25-item Pagination & Search
            setupBkCompletedTable(rows, filterStart, filterEnd);

            if (window.feather) window.feather.replace();
        } catch (err) {
            console.error('[bookings] renderBkCompleted error:', err);
            setError(data);
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('bkCompSnapCount',   '—');
            setEl('bkCompSnapRate',    '—');
            setEl('bkCompSnapRevenue', '—');
            setEl('bkCompSnapAvg',     '—');
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (filterBranch) filterBranch.onchange = loadData;
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkCancelled — Cancelled Bookings (Enhanced)
// =============================================================================

// Module-level chart instances for Cancelled Bookings
let bkCancelledTrendChart = null;
let bkCancelledDonutChart  = null;

// ── Dual-Axis Cancellation Trend: Volume (bars) vs Lost Value (line) ──────────
function renderBkCancelledPerformanceTrend(rows) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (bkCancelledTrendChart) { bkCancelledTrendChart.destroy(); bkCancelledTrendChart = null; }
    if (bkTotalTrendChart)     { bkTotalTrendChart.destroy();     bkTotalTrendChart = null; }
    if (bkCompletedTrendChart) { bkCompletedTrendChart.destroy(); bkCompletedTrendChart = null; }
    const existingChart = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existingChart) existingChart.destroy();

    const titleEl = document.getElementById('leftChartTitle');
    if (titleEl) titleEl.textContent = 'Cancellation Trend (Volume vs Lost Value)';

    if (!rows || rows.length === 0) {
        bkCancelledTrendChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['No Data'], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const dateMap = {};
    rows.forEach(r => {
        let d = r.datetime || r.date || 'Unknown';
        if (d.includes(',')) d = d.split(',')[0].trim();
        if (!dateMap[d]) dateMap[d] = { count: 0, lostValue: 0, rawDate: new Date(d) };
        dateMap[d].count += 1;
        dateMap[d].lostValue += Number(r.est_value || 0);
    });

    const sortedDates = Object.keys(dateMap).sort((a, b) => {
        const da = dateMap[a].rawDate.getTime();
        const db = dateMap[b].rawDate.getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
    });

    const labels      = sortedDates.map(d => {
        const dt = dateMap[d].rawDate;
        return !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : d;
    });
    const counts      = sortedDates.map(d => dateMap[d].count);
    const lostValues  = sortedDates.map(d => Math.round(dateMap[d].lostValue));

    bkCancelledTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Cancellations',
                    data: counts,
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    hoverBackgroundColor: '#ef4444',
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    order: 2,
                    maxBarThickness: 32
                },
                {
                    type: 'line',
                    label: 'Lost Value (₹)',
                    data: lostValues,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        font: { size: 12, weight: '500' },
                        color: '#475569'
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.yAxisID === 'y1') {
                                return ' Lost Value: ₹' + Number(context.parsed.y || 0).toLocaleString('en-IN');
                            }
                            return ' Cancelled: ' + Number(context.parsed.y || 0) + ' booking' + (context.parsed.y === 1 ? '' : 's');
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'Cancellations', color: '#ef4444', font: { size: 11, weight: '600' } },
                    grid: { color: '#f1f5f9', drawBorder: false },
                    ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Lost Value (₹)', color: '#f59e0b', font: { size: 11, weight: '600' } },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: (v) => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
                    }
                }
            }
        }
    });
}

// ── Cancellation by Reason Donut Chart ───────────────────────────────────────
function renderBkCancelledReasonDonut(rows, k) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;

    if (bkCancelledDonutChart) { bkCancelledDonutChart.destroy(); bkCancelledDonutChart = null; }
    if (bkTotalDonutChart)     { bkTotalDonutChart.destroy();     bkTotalDonutChart = null; }
    if (bkCompletedDonutChart) { bkCompletedDonutChart.destroy(); bkCompletedDonutChart = null; }
    const existingChart = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existingChart) existingChart.destroy();

    const titleEl = document.getElementById('rightChartTitle');
    if (titleEl) titleEl.textContent = 'Cancellations by Reason';

    const reasonMap = {};
    (rows || []).forEach(r => {
        const reason = (r.reason || 'Not specified').trim();
        if (!reasonMap[reason]) reasonMap[reason] = { count: 0, lostValue: 0 };
        reasonMap[reason].count++;
        reasonMap[reason].lostValue += Number(r.est_value || 0);
    });

    const entries  = Object.entries(reasonMap).sort((a, b) => b[1].count - a[1].count);
    const palette  = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#10b981', '#64748b'];

    const labels   = entries.map(e => e[0]);
    const dataVals = entries.map(e => e[1].count);
    const lostVals = entries.map(e => e[1].lostValue);
    const colors   = entries.map((_, i) => palette[i % palette.length]);

    const totalCancelled = Number(k.cancelled_bookings || rows.length || 0);

    bkCancelledDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed || 0;
                            const pct = totalCancelled > 0 ? ((val / totalCancelled) * 100).toFixed(1) : 0;
                            const lv  = lostVals[context.dataIndex] || 0;
                            return [
                                ` ${context.label}: ${val} (${pct}%)`,
                                ` Lost Value: ₹${Math.round(lv).toLocaleString('en-IN')}`
                            ];
                        }
                    }
                }
            }
        }
    });

    // Center stat
    const centerVal = document.getElementById('donutCenterValue');
    const centerLbl = document.getElementById('donutCenterLabel');
    if (centerVal) centerVal.textContent = totalCancelled.toLocaleString('en-IN');
    if (centerLbl) centerLbl.textContent = 'Total Cancelled';

    // Legend
    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        if (labels.length === 0) {
            legendEl.innerHTML = '<div style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:8px;">No cancellation data found.</div>';
        } else {
            const getPct = (count) => {
                if (!totalCancelled || totalCancelled <= 0) return '0%';
                const v = (count / totalCancelled) * 100;
                return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + '%';
            };
            legendEl.innerHTML = labels.map((name, i) => `
                <div class="donut-legend-item">
                    <span class="donut-legend-dot" style="background-color: ${colors[i]};"></span>
                    <span class="donut-legend-text">
                        ${name} - <strong>${dataVals[i]}</strong> (${getPct(dataVals[i])}), Lost Value - <strong style="color: ${colors[i]};">₹${Math.round(lostVals[i]).toLocaleString('en-IN')}</strong>
                    </span>
                </div>
            `).join('');
        }
    }
}

// ── Cancelled Bookings Table with 25-item Pagination, Search, Export & Print ──
function setupBkCancelledTable(rows, filterStart, filterEnd) {
    let currentPage = 1;
    const pageSize  = 25;
    let currentFilteredRows = [...(rows || [])];

    const titleText = document.getElementById('tableTitleText');
    if (titleText) titleText.textContent = 'Cancelled Booking Records';

    const thead = document.getElementById('tableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Est. Value</th>
                <th>Reason</th>
            </tr>`;
    }

    function renderPage(page) {
        currentPage = page;
        const total      = currentFilteredRows.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1)          currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx   = Math.min(startIdx + pageSize, total);
        const pageRows = currentFilteredRows.slice(startIdx, endIdx);

        const tbody = document.getElementById('tableBody');
        if (tbody) {
            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:#94a3b8;">No cancelled bookings match your filter criteria.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(r => {
                    const custId   = (r.customer_id || '').replace(/'/g, "\\'");
                    const custName = (r.customer || '—').replace(/'/g, "\\'");
                    const customerCell = r.customer
                        ? `<span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${custName}')">${r.customer}</span>`
                        : '<span style="color:#94a3b8;">—</span>';

                    const serviceCell = buildServiceCell(r.service);
                    const staffCell   = buildStaffCell(r.staff);

                    const reasonStyle = 'display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:500;background:#fee2e2;color:#991b1b;';
                    const reasonCell  = r.reason
                        ? `<span style="${reasonStyle}">${r.reason}</span>`
                        : '<span style="color:#94a3b8;font-style:italic;">Not specified</span>';

                    let dateStr = '', timeStr = '';
                    const dt = r.datetime || '';
                    if (dt.includes(',')) {
                        dateStr = dt.split(',')[0].trim();
                        timeStr = dt.split(',')[1].trim();
                    } else {
                        dateStr = dt || '—';
                    }

                    return `
                    <tr style="border-bottom:1px solid #f8fafc;transition:background 0.15s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                        <td style="padding:14px 8px 14px 16px;"><strong style="font-size:0.85rem;color:#0f172a;">${dateStr || '—'}</strong></td>
                        <td style="padding:14px 8px;font-size:0.85rem;color:#64748b;">${timeStr || '—'}</td>
                        <td style="padding:14px 8px;">${customerCell}</td>
                        <td style="padding:14px 8px;max-width:200px;">${serviceCell}</td>
                        <td style="padding:14px 8px;max-width:180px;">${staffCell}</td>
                        <td style="padding:14px 8px;"><strong style="color:#ef4444;">${formatCurrency(r.est_value)}</strong></td>
                        <td style="padding:14px 8px;">${reasonCell}</td>
                    </tr>`;
                }).join('');
            }
        }

        const badge = document.getElementById('tableRecordCountBadge');
        if (badge) badge.textContent = `${total} cancelled`;

        const info = document.getElementById('paginationInfo');
        if (info) {
            info.textContent = total === 0
                ? 'Showing 0 to 0 of 0 cancellations'
                : `Showing ${startIdx + 1} to ${endIdx} of ${total} cancellations`;
        }

        const controls = document.getElementById('paginationControls');
        if (controls) {
            if (totalPages <= 1) { controls.innerHTML = ''; return; }

            let html = `<button class="page-btn" id="btnPagePrevCanc" ${currentPage === 1 ? 'disabled' : ''}>&larr; Prev</button>`;
            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                } else if (p === currentPage - 3 || p === currentPage + 3) {
                    html += `<span style="padding:0 4px;color:#94a3b8;">...</span>`;
                }
            }
            html += `<button class="page-btn" id="btnPageNextCanc" ${currentPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>`;
            controls.innerHTML = html;

            controls.querySelectorAll('[data-page]').forEach(btn => {
                btn.onclick = () => renderPage(Number(btn.getAttribute('data-page')));
            });
            const prevBtn = document.getElementById('btnPagePrevCanc');
            if (prevBtn) prevBtn.onclick = () => renderPage(currentPage - 1);
            const nextBtn = document.getElementById('btnPageNextCanc');
            if (nextBtn) nextBtn.onclick = () => renderPage(currentPage + 1);
        }
    }

    // Search
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const query = (e.target.value || '').toLowerCase().trim();
            if (!query) {
                currentFilteredRows = [...(rows || [])];
            } else {
                currentFilteredRows = (rows || []).filter(r => {
                    const cust   = (r.customer || '').toLowerCase();
                    const srv    = (r.service  || '').toLowerCase();
                    const stf    = (r.staff    || '').toLowerCase();
                    const dt     = (r.datetime || '').toLowerCase();
                    const reason = (r.reason   || '').toLowerCase();
                    return cust.includes(query) || srv.includes(query) || stf.includes(query) || dt.includes(query) || reason.includes(query);
                });
            }
            renderPage(1);
        };
    }

    // Export CSV
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!currentFilteredRows || currentFilteredRows.length === 0) {
                alert('No cancelled bookings data to export.');
                return;
            }
            const csvHeaders = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Est. Value', 'Reason'];
            const csvLines   = [csvHeaders.join(',')];
            currentFilteredRows.forEach(r => {
                const dt = r.datetime || '';
                const d  = dt.includes(',') ? dt.split(',')[0].trim() : dt;
                const t  = dt.includes(',') ? dt.split(',')[1].trim() : '';
                csvLines.push([
                    `"${d}"`,
                    `"${t}"`,
                    `"${(r.customer || '').replace(/"/g, '""')}"`,
                    `"${(r.service  || '').replace(/"/g, '""')}"`,
                    `"${(r.staff    || '').replace(/"/g, '""')}"`,
                    `"${r.est_value || 0}"`,
                    `"${(r.reason   || '').replace(/"/g, '""')}"`
                ].join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            const sDate = filterStart ? filterStart.value : 'all';
            const eDate = filterEnd   ? filterEnd.value   : 'all';
            a.download = `Cancelled_Bookings_${sDate}_to_${eDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    // Print
    const printBtn = document.getElementById('btnPrintTable');
    if (printBtn) printBtn.onclick = () => window.print();

    renderPage(1);
}

// ── Main renderer ─────────────────────────────────────────────────────────────
async function renderBkCancelled(data, supabase) {
    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Panel visibility
    const snapPanel  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');
    if (snapPanel)  snapPanel.style.display  = 'none';
    if (snapComp)   snapComp.style.display   = 'none';
    if (snapCanc)   snapCanc.style.display   = 'block';
    if (snapNoShow) snapNoShow.style.display = 'none';
    if (kpiRow)     kpiRow.style.display     = 'none';

    setDefaultDateRange(filterStart, filterEnd);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        try {
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_cancelled || {};
            const k       = section.kpis        || {};
            const rows    = section.rows        || [];

            // If rows are missing customer_id, resolve them so customer links open their profile
            const needsCustId = rows.some(r => (!r.customer_id || r.customer_id === '') && r.customer && r.customer !== 'Unknown');
            if (needsCustId) {
                const names = [...new Set(rows.map(r => r.customer).filter(n => n && n !== 'Unknown' && n !== '—'))];
                try {
                    let q = supabase.from('customers').select('customer_id, customer_name');
                    if (companyId && companyId !== 'all') q = q.eq('company_id', companyId);
                    const { data: custList } = await q.in('customer_name', names);
                    if (custList && custList.length > 0) {
                        const nameToId = {};
                        custList.forEach(c => { nameToId[c.customer_name] = c.customer_id; });
                        rows.forEach(r => {
                            if (!r.customer_id && nameToId[r.customer]) {
                                r.customer_id = nameToId[r.customer];
                            }
                        });
                    }
                } catch (e) {
                    console.warn('[bookings] Error fetching missing customer_ids for cancelled bookings:', e);
                }
            }

            const cancelledCount = Number(k.cancelled_bookings  || 0);
            const totalBookings  = Number(k.total_bookings      || 0) || cancelledCount;
            const cancelRate     = Number(k.cancellation_rate   || 0);
            const lostValue      = Number(k.estimated_value_affected || 0);
            const sameDayCount   = Number(k.same_day_cancellations || 0);

            // ── Stat Card 1: Cancelled Bookings
            setEl('bkCancSnapCount',    cancelledCount.toLocaleString('en-IN'));
            setEl('bkCancSnapCountSub', `${cancelRate.toFixed(1)}% of ${totalBookings.toLocaleString('en-IN')} total appointments`);
            const barsCount = document.getElementById('bkCancBarsCount');
            if (barsCount) barsCount.innerHTML = build7DayTrend(rows, 'cancelled');

            // ── Stat Card 2: Cancellation Rate
            setEl('bkCancSnapRate',    cancelRate.toFixed(1) + '%');
            setEl('bkCancSnapRateSub', `${cancelledCount} cancelled out of ${totalBookings.toLocaleString('en-IN')} bookings`);
            const barsRate = document.getElementById('bkCancBarsRate');
            if (barsRate) barsRate.innerHTML = build7DayTrend(rows, 'cancelled');

            // ── Stat Card 3: Estimated Value Affected
            setEl('bkCancSnapValue',    formatCurrency(lostValue));
            setEl('bkCancSnapValueSub', 'Potential revenue lost to cancellations');
            const barsValue = document.getElementById('bkCancBarsValue');
            if (barsValue) barsValue.innerHTML = build7DayTrend(rows, 'cancelled');

            // ── Stat Card 4: Same-Day Cancellations
            setEl('bkCancSnapSameDay',    sameDayCount.toLocaleString('en-IN'));
            setEl('bkCancSnapSameDaySub', `${sameDayCount} of ${cancelledCount} cancelled on the day`);
            const barsSameDay = document.getElementById('bkCancBarsSameDay');
            if (barsSameDay) barsSameDay.innerHTML = build7DayTrend(rows, 'cancelled');

            // ── Charts
            renderBkCancelledPerformanceTrend(rows);
            renderBkCancelledReasonDonut(rows, k);

            // ── Table
            setupBkCancelledTable(rows, filterStart, filterEnd);

            if (typeof feather !== 'undefined') feather.replace();

        } catch (err) {
            console.error('[bookings] renderBkCancelled error:', err);
            setEl('bkCancSnapCount',   'Error');
            setEl('bkCancSnapRate',    'Error');
            setEl('bkCancSnapValue',   'Error');
            setEl('bkCancSnapSameDay', 'Error');
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (filterBranch) filterBranch.onchange = loadData;
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// renderBkNoShows — No-Show Bookings (Enhanced)
// =============================================================================

// Module-level chart instances for No-Show Bookings
let bkNoShowTrendChart = null;
let bkNoShowDonutChart = null;

// ── Dual-Axis No-Show Trend: Missed Slots (bars) vs Revenue Lost (line) ───────
function renderBkNoShowPerformanceTrend(rows) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (bkNoShowTrendChart)    { bkNoShowTrendChart.destroy();    bkNoShowTrendChart = null; }
    if (bkCancelledTrendChart) { bkCancelledTrendChart.destroy(); bkCancelledTrendChart = null; }
    if (bkTotalTrendChart)     { bkTotalTrendChart.destroy();     bkTotalTrendChart = null; }
    if (bkCompletedTrendChart) { bkCompletedTrendChart.destroy(); bkCompletedTrendChart = null; }
    const existingChart = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existingChart) existingChart.destroy();

    const titleEl = document.getElementById('leftChartTitle');
    if (titleEl) titleEl.textContent = 'No-Show Trend (Missed Slots vs Revenue Lost)';

    if (!rows || rows.length === 0) {
        bkNoShowTrendChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['No Data'], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const dateMap = {};
    rows.forEach(r => {
        let d = r.datetime || r.date || 'Unknown';
        if (d.includes(',')) d = d.split(',')[0].trim();
        if (!dateMap[d]) dateMap[d] = { count: 0, missedValue: 0, rawDate: new Date(d) };
        dateMap[d].count += 1;
        dateMap[d].missedValue += Number(r.missed_value || 0);
    });

    const sortedDates = Object.keys(dateMap).sort((a, b) => {
        const da = dateMap[a].rawDate.getTime();
        const db = dateMap[b].rawDate.getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
    });

    const labels       = sortedDates.map(d => {
        const dt = dateMap[d].rawDate;
        return !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : d;
    });
    const counts       = sortedDates.map(d => dateMap[d].count);
    const missedValues = sortedDates.map(d => Math.round(dateMap[d].missedValue));

    bkNoShowTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'No-Shows',
                    data: counts,
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    hoverBackgroundColor: '#f59e0b',
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    order: 2,
                    maxBarThickness: 32
                },
                {
                    type: 'line',
                    label: 'Missed Value (₹)',
                    data: missedValues,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 12, weight: '500' }, color: '#475569' }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.type === 'line') {
                                return ` Missed Value: ₹${Number(context.parsed.y || 0).toLocaleString('en-IN')}`;
                            }
                            return ` No-Shows: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#64748b' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0, font: { size: 11 }, color: '#64748b' },
                    grid: { color: '#f1f5f9' },
                    title: { display: true, text: 'No-Shows', color: '#64748b', font: { size: 11 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#ef4444',
                        callback: val => '₹' + Number(val).toLocaleString('en-IN')
                    },
                    title: { display: true, text: 'Missed Value (₹)', color: '#ef4444', font: { size: 11 } }
                }
            }
        }
    });
}

// ── Clean Donut Chart for Services Affected by No-Shows ───────────────────────
function renderBkNoShowServiceDonut(rows, k) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;

    if (bkNoShowDonutChart)    { bkNoShowDonutChart.destroy();    bkNoShowDonutChart = null; }
    if (bkCancelledDonutChart) { bkCancelledDonutChart.destroy(); bkCancelledDonutChart = null; }
    if (bkTotalDonutChart)     { bkTotalDonutChart.destroy();     bkTotalDonutChart = null; }
    if (bkCompletedDonutChart) { bkCompletedDonutChart.destroy(); bkCompletedDonutChart = null; }
    const existing = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(ctx) : null;
    if (existing) existing.destroy();

    const titleEl = document.getElementById('rightChartTitle');
    if (titleEl) titleEl.textContent = 'Services Affected by No-Shows';

    // Aggregate by service
    const serviceMap = {};
    (rows || []).forEach(r => {
        const srvRaw = r.service || 'Unknown';
        const parts = srvRaw.split(',').map(s => s.trim()).filter(Boolean);
        const count = parts.length || 1;
        const valPerService = (Number(r.missed_value || 0)) / count;

        if (parts.length === 0) {
            const s = 'Unknown';
            if (!serviceMap[s]) serviceMap[s] = { count: 0, lostVal: 0 };
            serviceMap[s].count   += 1;
            serviceMap[s].lostVal += Number(r.missed_value || 0);
        } else {
            parts.forEach(srv => {
                if (!serviceMap[srv]) serviceMap[srv] = { count: 0, lostVal: 0 };
                serviceMap[srv].count   += 1;
                serviceMap[srv].lostVal += valPerService;
            });
        }
    });

    const sortedServices = Object.keys(serviceMap).sort((a, b) => serviceMap[b].count - serviceMap[a].count);
    const totalSlots = sortedServices.reduce((sum, s) => sum + serviceMap[s].count, 0) || 0;

    const palette = ['#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#3b82f6', '#64748b'];
    const colors = sortedServices.map((_, i) => palette[i % palette.length]);

    const labels   = sortedServices;
    const dataVals = sortedServices.map(s => serviceMap[s].count);
    const lostVals = sortedServices.map(s => serviceMap[s].lostVal);

    bkNoShowDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                data: dataVals.length ? dataVals : [1],
                backgroundColor: colors.length ? colors : ['#e2e8f0'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            if (!labels.length) return ' No data';
                            const idx = context.dataIndex;
                            const count = dataVals[idx] || 0;
                            const pct = totalSlots > 0 ? ((count / totalSlots) * 100).toFixed(1) : 0;
                            const lVal = Math.round(lostVals[idx] || 0).toLocaleString('en-IN');
                            return ` ${labels[idx]}: ${count} (${pct}%) — Lost: ₹${lVal}`;
                        }
                    }
                }
            }
        }
    });

    // Center Stat
    const centerVal = document.getElementById('donutCenterValue');
    const centerLbl = document.getElementById('donutCenterLabel');
    const noShowCount = Number(k.no_show_bookings || rows.length || 0);
    if (centerVal) centerVal.textContent = noShowCount.toLocaleString('en-IN');
    if (centerLbl) centerLbl.textContent = 'TOTAL MISSED';

    // Interactive Legend
    const getPct = (count) => {
        if (!totalSlots || totalSlots <= 0) return '0%';
        const v = (count / totalSlots) * 100;
        return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + '%';
    };

    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        if (labels.length === 0) {
            legendEl.innerHTML = '<div style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:8px;">No no-show records found.</div>';
        } else {
            legendEl.innerHTML = labels.map((name, i) => `
                <div class="donut-legend-item">
                    <span class="donut-legend-dot" style="background-color: ${colors[i]};"></span>
                    <span class="donut-legend-text">
                        ${name} - <strong>${dataVals[i]}</strong> (${getPct(dataVals[i])}), Missed Value - <strong style="color: ${colors[i]};">₹${Math.round(lostVals[i]).toLocaleString('en-IN')}</strong>
                    </span>
                </div>
            `).join('');
        }
    }
}

// ── No-Show Bookings Table with 25-item Pagination, Search, Export & Print ───
function setupBkNoShowTable(rows, filterStart, filterEnd) {
    let currentPage = 1;
    const pageSize  = 25;
    let currentFilteredRows = [...(rows || [])];

    const titleText = document.getElementById('tableTitleText');
    if (titleText) titleText.textContent = 'No-Show Booking Records';

    const thead = document.getElementById('tableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Services Missed</th>
                <th>Staff Assigned</th>
                <th>Missed Value</th>
            </tr>`;
    }

    function renderPage(page) {
        currentPage = page;
        const total      = currentFilteredRows.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1)          currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx   = Math.min(startIdx + pageSize, total);
        const pageRows = currentFilteredRows.slice(startIdx, endIdx);

        const tbody = document.getElementById('tableBody');
        if (tbody) {
            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:#94a3b8;">No no-show bookings match your filter criteria.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(r => {
                    const custId   = (r.customer_id || '').replace(/'/g, "\\'");
                    const custName = (r.customer || '—').replace(/'/g, "\\'");
                    const customerCell = r.customer
                        ? `<span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${custName}')">${r.customer}</span>`
                        : '<span style="color:#94a3b8;">—</span>';

                    const serviceCell = buildServiceCell(r.service);
                    const staffCell   = buildStaffCell(r.staff);

                    let dateStr = '', timeStr = '';
                    const dt = r.datetime || '';
                    if (dt.includes(',')) {
                        dateStr = dt.split(',')[0].trim();
                        timeStr = dt.split(',')[1].trim();
                    } else {
                        dateStr = dt || '—';
                    }

                    const phoneVal = r.phone && r.phone !== '-' ? r.phone : '<span style="color:#94a3b8;">—</span>';

                    return `
                    <tr style="border-bottom:1px solid #f8fafc;transition:background 0.15s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                        <td style="padding:14px 8px 14px 16px;"><strong style="font-size:0.85rem;color:#0f172a;">${dateStr || '—'}</strong></td>
                        <td style="padding:14px 8px;font-size:0.85rem;color:#64748b;">${timeStr || '—'}</td>
                        <td style="padding:14px 8px;">${customerCell}</td>
                        <td style="padding:14px 8px;font-size:0.85rem;color:#475569;">${phoneVal}</td>
                        <td style="padding:14px 8px;max-width:200px;">${serviceCell}</td>
                        <td style="padding:14px 8px;max-width:180px;">${staffCell}</td>
                        <td style="padding:14px 8px;"><strong style="color:#ef4444;">${formatCurrency(r.missed_value)}</strong></td>
                    </tr>`;
                }).join('');
            }
        }

        const badge = document.getElementById('tableRecordCountBadge');
        if (badge) badge.textContent = `${total} no-shows`;

        const info = document.getElementById('paginationInfo');
        if (info) {
            info.textContent = total === 0
                ? 'Showing 0 to 0 of 0 no-shows'
                : `Showing ${startIdx + 1} to ${endIdx} of ${total} no-shows`;
        }

        const controls = document.getElementById('paginationControls');
        if (controls) {
            if (totalPages <= 1) { controls.innerHTML = ''; return; }

            let html = `<button class="page-btn" id="btnPagePrevNoShow" ${currentPage === 1 ? 'disabled' : ''}>&larr; Prev</button>`;
            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                } else if (p === currentPage - 3 || p === currentPage + 3) {
                    html += `<span style="padding:0 4px;color:#94a3b8;">...</span>`;
                }
            }
            html += `<button class="page-btn" id="btnPageNextNoShow" ${currentPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>`;
            controls.innerHTML = html;

            controls.querySelectorAll('[data-page]').forEach(btn => {
                btn.onclick = () => renderPage(Number(btn.getAttribute('data-page')));
            });
            const prevBtn = document.getElementById('btnPagePrevNoShow');
            if (prevBtn) prevBtn.onclick = () => renderPage(currentPage - 1);
            const nextBtn = document.getElementById('btnPageNextNoShow');
            if (nextBtn) nextBtn.onclick = () => renderPage(currentPage + 1);
        }
    }

    // Search
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const query = (e.target.value || '').toLowerCase().trim();
            if (!query) {
                currentFilteredRows = [...(rows || [])];
            } else {
                currentFilteredRows = (rows || []).filter(r => {
                    const cust  = (r.customer || '').toLowerCase();
                    const phone = (r.phone    || '').toLowerCase();
                    const srv   = (r.service  || '').toLowerCase();
                    const stf   = (r.staff    || '').toLowerCase();
                    const dt    = (r.datetime || '').toLowerCase();
                    return cust.includes(query) || phone.includes(query) || srv.includes(query) || stf.includes(query) || dt.includes(query);
                });
            }
            renderPage(1);
        };
    }

    // Export CSV
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!currentFilteredRows || currentFilteredRows.length === 0) {
                alert('No no-show bookings data to export.');
                return;
            }
            const csvHeaders = ['Date', 'Time', 'Customer', 'Phone', 'Services Missed', 'Staff Assigned', 'Missed Value'];
            const csvLines   = [csvHeaders.join(',')];
            currentFilteredRows.forEach(r => {
                const dt = r.datetime || '';
                const d  = dt.includes(',') ? dt.split(',')[0].trim() : dt;
                const t  = dt.includes(',') ? dt.split(',')[1].trim() : '';
                csvLines.push([
                    `"${d}"`,
                    `"${t}"`,
                    `"${(r.customer || '').replace(/"/g, '""')}"`,
                    `"${(r.phone    || '').replace(/"/g, '""')}"`,
                    `"${(r.service  || '').replace(/"/g, '""')}"`,
                    `"${(r.staff    || '').replace(/"/g, '""')}"`,
                    `"${r.missed_value || 0}"`
                ].join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            const sDate = filterStart ? filterStart.value : 'all';
            const eDate = filterEnd   ? filterEnd.value   : 'all';
            a.download = `No_Show_Bookings_${sDate}_to_${eDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    // Print
    const printBtn = document.getElementById('btnPrintTable');
    if (printBtn) printBtn.onclick = () => window.print();

    renderPage(1);
}

// ── Main renderer for No-Show Bookings ───────────────────────────────────────
async function renderBkNoShows(data, supabase) {
    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Panel visibility
    const snapPanel  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');
    if (snapPanel)  snapPanel.style.display  = 'none';
    if (snapComp)   snapComp.style.display   = 'none';
    if (snapCanc)   snapCanc.style.display   = 'none';
    if (snapNoShow) snapNoShow.style.display = 'block';
    if (kpiRow)     kpiRow.style.display     = 'none';

    setDefaultDateRange(filterStart, filterEnd);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
        const bid   = resolveBranchId(filterBranch);

        try {
            const result  = await callMasterRpc(supabase, companyId, bid, start, end);
            const section = result.bk_no_shows || {};
            const k       = section.kpis       || {};
            const rows    = section.rows       || [];

            // If rows are missing customer_id, resolve them so customer links work immediately
            const needsCustId = rows.some(r => (!r.customer_id || r.customer_id === '') && r.customer && r.customer !== 'Unknown');
            if (needsCustId) {
                const names = [...new Set(rows.map(r => r.customer).filter(n => n && n !== 'Unknown' && n !== '—'))];
                try {
                    let q = supabase.from('customers').select('customer_id, customer_name');
                    if (companyId && companyId !== 'all') q = q.eq('company_id', companyId);
                    const { data: custList } = await q.in('customer_name', names);
                    if (custList && custList.length > 0) {
                        const nameToId = {};
                        custList.forEach(c => { nameToId[c.customer_name] = c.customer_id; });
                        rows.forEach(r => {
                            if (!r.customer_id && nameToId[r.customer]) {
                                r.customer_id = nameToId[r.customer];
                            }
                        });
                    }
                } catch (e) {
                    console.warn('[bookings] Error fetching missing customer_ids for no-shows:', e);
                }
            }

            const noShowCount   = Number(k.no_show_bookings         || 0);
            const missedValue   = Number(k.estimated_value_missed   || 0);
            const noShowRate    = Number(k.no_show_rate             || 0);
            const repeatCount   = Number(k.repeat_no_show_customers || 0);
            const sc            = result.stat_cards || {};
            const totalBookings = Number(sc.total_bookings || (result.bk_total && result.bk_total.kpis && result.bk_total.kpis.total_bookings) || 0) || noShowCount;

            // ── Stat Card 1: No-Show Bookings
            setEl('bkNoShowSnapCount',    noShowCount.toLocaleString('en-IN'));
            setEl('bkNoShowSnapCountSub', `${noShowRate.toFixed(1)}% of ${totalBookings.toLocaleString('en-IN')} total appointments`);
            const barsCount = document.getElementById('bkNoShowBarsCount');
            if (barsCount) barsCount.innerHTML = build7DayTrend(rows, 'no-shows');

            // ── Stat Card 2: Estimated Value Missed
            setEl('bkNoShowSnapValue',    formatCurrency(missedValue));
            setEl('bkNoShowSnapValueSub', 'Revenue lost to unfulfilled slots');
            const barsValue = document.getElementById('bkNoShowBarsValue');
            if (barsValue) barsValue.innerHTML = build7DayTrend(rows, 'no-shows');

            // ── Stat Card 3: No-Show Rate
            setEl('bkNoShowSnapRate',    noShowRate.toFixed(1) + '%');
            setEl('bkNoShowSnapRateSub', `${noShowCount} missed out of ${totalBookings.toLocaleString('en-IN')} bookings`);
            const barsRate = document.getElementById('bkNoShowBarsRate');
            if (barsRate) barsRate.innerHTML = build7DayTrend(rows, 'no-shows');

            // ── Stat Card 4: Repeat No-Shows
            setEl('bkNoShowSnapRepeat',    repeatCount.toLocaleString('en-IN'));
            setEl('bkNoShowSnapRepeatSub', `${repeatCount} customer${repeatCount === 1 ? '' : 's'} with 2+ missed visits`);
            const barsRepeat = document.getElementById('bkNoShowBarsRepeat');
            if (barsRepeat) barsRepeat.innerHTML = build7DayTrend(rows, 'no-shows');

            // ── Charts
            renderBkNoShowPerformanceTrend(rows);
            renderBkNoShowServiceDonut(rows, k);

            // ── Table
            setupBkNoShowTable(rows, filterStart, filterEnd);

            if (typeof feather !== 'undefined') feather.replace();

        } catch (err) {
            console.error('[bookings] renderBkNoShows error:', err);
            setEl('bkNoShowSnapCount',  'Error');
            setEl('bkNoShowSnapValue',  'Error');
            setEl('bkNoShowSnapRate',   'Error');
            setEl('bkNoShowSnapRepeat', 'Error');
        }
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (filterBranch) filterBranch.onchange = loadData;
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
    const t = type || data?.type || 'bookings';

    // Hide all snapshot panels first; each renderer shows only what it needs
    const snapTotal  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');
    if (snapTotal)  snapTotal.style.display  = 'none';
    if (snapComp)   snapComp.style.display   = 'none';
    if (snapCanc)   snapCanc.style.display   = 'none';
    if (snapNoShow) snapNoShow.style.display = 'none';

    // Show the correct panel per type; hide kpiRow for snapshot sub-reports
    if (t === 'bk-total') {
        if (snapTotal) snapTotal.style.display = 'block';
        if (kpiRow)    kpiRow.style.display    = 'none';
    } else if (t === 'bk-completed') {
        if (snapComp)  snapComp.style.display  = 'block';
        if (kpiRow)    kpiRow.style.display    = 'none';
    } else if (t === 'bk-cancelled') {
        if (snapCanc)  snapCanc.style.display  = 'block';
        if (kpiRow)    kpiRow.style.display    = 'none';
    } else if (t === 'bk-no-shows') {
        if (snapNoShow) snapNoShow.style.display = 'block';
        if (kpiRow)     kpiRow.style.display     = 'none';
    } else {
        // bk-refunds, bookings overview — use standard kpiRow
        if (kpiRow)    kpiRow.style.display    = 'grid';
    }

    const handler = handlers[t];
    if (handler) return await handler(data, supabase);
    updateTable(data.headers, data.rows || []);
}

