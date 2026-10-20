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
            revLabel: 'Estimated Missed',
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

    // Update Legend (3 rows)
    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        legendEl.innerHTML = legendItems.map(item => `
            <div class="donut-legend-item">
                <span class="donut-legend-dot" style="background-color: ${item.color};"></span>
                <span class="donut-legend-text">
                    <span>${item.name} - <strong>${item.count}</strong></span>,
                    <span>${item.pct} of total bookings</span>,
                    <span>${item.revLabel}: <strong style="color: ${item.revColor};">${item.revVal}</strong></span>
                </span>
            </div>
        `).join('');
    }
}

// Table Setup with Search, 25-item Pagination, Export CSV, and Print
function setupBkTotalTable(rows, filterStart, filterEnd) {
    let currentPage = 1;
    const pageSize = 25;
    let currentFilteredRows = [...(rows || [])];

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
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:#94a3b8;">No bookings match your filter criteria.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(r => `
                    <tr>
                        <td><strong>${r.date || '—'}</strong></td>
                        <td style="color:#64748b;">${r.time || '—'}</td>
                        <td><strong>${r.customer || '—'}</strong></td>
                        <td>${r.service || '—'}</td>
                        <td style="color:#64748b;">${r.staff || '—'}</td>
                        <td><strong style="color:#0f172a;">${formatCurrency(r.amount)}</strong></td>
                        <td>${statusPill(r.status)}</td>
                    </tr>
                `).join('');
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
                    const st   = (r.status || '').toLowerCase();
                    const dt   = (r.date || '').toLowerCase();
                    return cust.includes(query) || srv.includes(query) || stf.includes(query) || st.includes(query) || dt.includes(query);
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
            const csvHeaders = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Status'];
            const csvLines = [csvHeaders.join(',')];
            currentFilteredRows.forEach(r => {
                const line = [
                    `"${r.date || ''}"`,
                    `"${r.time || ''}"`,
                    `"${(r.customer || '').replace(/"/g, '""')}"`,
                    `"${(r.service || '').replace(/"/g, '""')}"`,
                    `"${(r.staff || '').replace(/"/g, '""')}"`,
                    `"${r.amount || 0}"`,
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

    // Ensure 4-card snapshot panel is displayed and plain KPI row is hidden
    const snapPanel = document.getElementById('bkSnapshotPanel');
    const kpiRow    = document.getElementById('kpiRow');
    if (snapPanel) snapPanel.style.display = 'block';
    if (kpiRow)    kpiRow.style.display    = 'none';

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
    const t         = type || data?.type || 'bookings';
    const snapPanel = document.getElementById('bkSnapshotPanel');
    const kpiRow    = document.getElementById('kpiRow');
    if (t === 'bk-total') {
        if (snapPanel) snapPanel.style.display = 'block';
        if (kpiRow)    kpiRow.style.display    = 'none';
    } else {
        if (snapPanel) snapPanel.style.display = 'none';
        if (kpiRow)    kpiRow.style.display    = 'grid';
    }
    const handler = handlers[t];
    if (handler) return await handler(data, supabase);
    updateTable(data.headers, data.rows || []);
}
