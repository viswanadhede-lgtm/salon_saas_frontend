// scripts/reports/bookings-report.js
// Single-page Bookings Report — frontend only (mock data until RPC is wired).
// All filter logic, KPI computation, charts, table, pagination and CSV export
// happen entirely in the browser from whatever row-data the RPC returns.

import { supabase } from '../../lib/supabase.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

const STATUS_STYLES = {
    completed: { bg: '#dcfce7', color: '#166534' },
    confirmed: { bg: '#dbeafe', color: '#1e40af' },
    pending:   { bg: '#fef9c3', color: '#854d0e' },
    cancelled: { bg: '#fee2e2', color: '#991b1b' },
    'no-show': { bg: '#fef3c7', color: '#92400e' },
    noshow:    { bg: '#fef3c7', color: '#92400e' },
    no_show:   { bg: '#fef3c7', color: '#92400e' },
    refunded:  { bg: '#f3e8ff', color: '#6b21a8' },
};

const PAY_STYLES = {
    paid:     { bg: '#dcfce7', color: '#166534' },
    unpaid:   { bg: '#fee2e2', color: '#991b1b' },
    pending:  { bg: '#fef9c3', color: '#854d0e' },
    partial:  { bg: '#ede9fe', color: '#6d28d9' },
    refunded: { bg: '#fef3c7', color: '#b45309' },
};

const DONUT_COLORS = {
    completed: '#10b981',
    cancelled: '#ef4444',
    'no-show': '#f59e0b',
    refunded:  '#a855f7',
    other:     '#6366f1',
};

// ─── State ────────────────────────────────────────────────────────────────────
let allRows = [];          // Raw rows from RPC (or mock)
let filteredRows = [];     // After status/payment/search filters
let currentPage = 1;
let trendChartInstance = null;
let donutChartInstance = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAppCtx() {
    try { return JSON.parse(localStorage.getItem('appContext') || '{}'); } catch { return {}; }
}

function resolveCompanyId() {
    const c = localStorage.getItem('company_id');
    return (c && c !== 'null' && c !== 'undefined' && c !== 'all') ? c : null;
}

function resolveBranchId(filterBranch) {
    if (filterBranch && filterBranch.value && filterBranch.value !== 'all') return filterBranch.value;
    const s = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    return (s && s !== 'all' && s !== 'null' && s !== 'undefined') ? s : null;
}

function toIso(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function setDefaultDates() {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const s = document.getElementById('filterStartDate');
    const e = document.getElementById('filterEndDate');
    if (s && !s.value) s.value = toIso(firstDay);
    if (e && !e.value) e.value = toIso(lastDay);
}

function fmtINR(n) {
    const num = Number(n);
    if (isNaN(num)) return '₹0';
    return '₹' + Math.round(num).toLocaleString('en-IN');
}

function pct(num, den) {
    if (!den || den <= 0) return '0%';
    return ((num / den) * 100).toFixed(1) + '%';
}

function normalizeStatus(raw) {
    return (raw || '').toLowerCase().replace(/[\s_]/g, '-');
}

function statusPill(raw) {
    const key   = normalizeStatus(raw);
    const cfg   = STATUS_STYLES[key] || { bg: '#f1f5f9', color: '#475569' };
    const label = key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
    return `<span class="status-pill" style="background:${cfg.bg};color:${cfg.color};">${label}</span>`;
}

function payPill(raw) {
    const key = (raw || '').toLowerCase().trim();
    const cfg = PAY_STYLES[key] || { bg: '#f1f5f9', color: '#475569' };
    const lbl = key.charAt(0).toUpperCase() + key.slice(1) || '—';
    return `<span class="pay-pill" style="background:${cfg.bg};color:${cfg.color};">${lbl}</span>`;
}

function chipCell(str) {
    if (!str || str === '-') return '<span style="color:#94a3b8;">—</span>';
    const names = str.split(',').map(s => s.trim()).filter(Boolean);
    if (!names.length) return '<span style="color:#94a3b8;">—</span>';
    const first = `<span class="chip">${names[0]}</span>`;
    if (names.length === 1) return first;
    const rest  = names.slice(1).map(n => `<span class="chip">${n}</span>`).join('');
    const count = names.length - 1;
    return `<div class="chip-wrap">
        ${first}
        <span onclick="(function(b){var el=b.nextElementSibling;var h=el.style.display!=='flex';el.style.display=h?'flex':'none';b.textContent=h?'▲':'+${count}';})(this)"
            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;">+${count}</span>
        <div style="display:none;flex-wrap:wrap;gap:3px;width:100%;margin-top:3px;">${rest}</div>
    </div>`;
}

// ─── Branch Dropdown ──────────────────────────────────────────────────────────
async function populateBranchDropdown(companyId) {
    const sel = document.getElementById('filterBranch');
    if (!sel) return;
    try {
        const { data } = await supabase.schema('shared')
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId);
        if (data && data.length > 0) {
            const existing = sel.value;
            sel.innerHTML = '<option value="all">All Branches</option>' +
                data.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
            sel.value = existing || 'all';
        }
    } catch (e) { console.warn('[bookings-report] branch dropdown:', e); }
}

// ─── Staff Dropdown (built from row data) ─────────────────────────────────────
function populateStaffDropdown(rows) {
    const sel = document.getElementById('filterStaff');
    if (!sel) return;
    const names = new Set();
    rows.forEach(r => {
        (r.staff || '').split(',').forEach(n => { const t = n.trim(); if (t && t !== '-') names.add(t); });
    });
    const existing = sel.value;
    sel.innerHTML = '<option value="all">All Staff</option>' +
        [...names].sort().map(n => `<option value="${n}">${n}</option>`).join('');
    sel.value = (existing && existing !== 'all' && names.has(existing)) ? existing : 'all';
}

// ─── Fetch Data ───────────────────────────────────────────────────────────────
// TODO: wire to real RPC get_bookings_report when backend is ready.
// For now returns MOCK data so the frontend is fully usable.
async function fetchData(companyId, branchId, startDate, endDate) {
    // ── MOCK DATA ─────────────────────────────────────────────────────────────
    // Replace this entire block with the real RPC call in the next phase:
    //
    //   const { data, error } = await supabase.rpc('get_bookings_report', {
    //       p_company_id: companyId,
    //       p_branch_id:  branchId,
    //       p_start_date: startDate,
    //       p_end_date:   endDate,
    //   });
    //   if (error) throw error;
    //   return data?.bk_total?.rows || [];
    //
    // ─────────────────────────────────────────────────────────────────────────

    const statuses = ['completed', 'completed', 'completed', 'cancelled', 'no-show', 'refunded', 'confirmed'];
    const payments = ['paid', 'paid', 'unpaid', 'pending', 'paid', 'refunded'];
    const services = ['Hair Cut', 'Head Massage', 'Facial, Cleanup', 'Manicure, Pedicure', 'Hair Colour, Hair Cut', 'Waxing'];
    const staffs   = ['Priya S', 'Ravi K', 'Meena D', 'Ravi K, Priya S', 'Meena D'];
    const customers= ['Ananya R', 'Karthik M', 'Divya P', 'Suresh N', 'Lakshmi V', 'Arun B', 'Sindhu J'];

    const rows = [];
    const start = new Date(startDate || '2026-11-01');
    const end   = new Date(endDate   || '2026-11-28');
    let d = new Date(start);
    let id = 1;

    while (d <= end) {
        const count = Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
            const st  = statuses[Math.floor(Math.random() * statuses.length)];
            const pay = st === 'completed' ? 'paid'
                      : st === 'refunded'  ? 'refunded'
                      : st === 'cancelled' ? (Math.random() > 0.5 ? 'unpaid' : 'pending')
                      : payments[Math.floor(Math.random() * payments.length)];
            const amt = st === 'completed' ? (200 + Math.floor(Math.random() * 2300))
                      : (100 + Math.floor(Math.random() * 1500));
            const h   = 9 + Math.floor(Math.random() * 10);
            const m   = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
            rows.push({
                booking_id:     'bk-' + String(id++).padStart(4, '0'),
                date:           d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                time:           `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
                customer:       customers[Math.floor(Math.random() * customers.length)],
                customer_id:    'cust-' + Math.floor(Math.random() * 100),
                service:        services[Math.floor(Math.random() * services.length)],
                staff:          staffs[Math.floor(Math.random() * staffs.length)],
                amount:         amt,
                status:         st,
                payment_status: pay,
                raw_date:       new Date(d),
            });
        }
        d.setDate(d.getDate() + 1);
    }
    return rows;
}

// ─── KPI Computation ──────────────────────────────────────────────────────────
function computeKPIs(rows) {
    const total     = rows.length;
    const completed = rows.filter(r => normalizeStatus(r.status) === 'completed').length;
    const cancelled = rows.filter(r => normalizeStatus(r.status) === 'cancelled').length;
    const noshow    = rows.filter(r => ['no-show','noshow','no_show'].includes(normalizeStatus(r.status))).length;
    const revenue   = rows
        .filter(r => normalizeStatus(r.status) === 'completed' && (r.payment_status || '').toLowerCase() === 'paid')
        .reduce((s, r) => s + Number(r.amount || 0), 0);
    return { total, completed, cancelled, noshow, revenue };
}

function updateKPIs(rows) {
    const k = computeKPIs(rows);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpiTotal',     k.total.toLocaleString('en-IN'));
    set('kpiCompleted', k.completed.toLocaleString('en-IN'));
    set('kpiCancelled', k.cancelled.toLocaleString('en-IN'));
    set('kpiNoShow',    k.noshow.toLocaleString('en-IN'));
    set('kpiRevenue',   fmtINR(k.revenue));

    set('kpiTotalSub',     `in selected period`);
    set('kpiCompletedSub', pct(k.completed, k.total) + ' completion rate');
    set('kpiCancelledSub', pct(k.cancelled, k.total) + ' cancellation rate');
    set('kpiNoShowSub',    pct(k.noshow, k.total) + ' no-show rate');
    set('kpiRevenueSub',   `from ${k.completed.toLocaleString('en-IN')} completed bookings`);
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────
function renderTrendChart(rows) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

    // Group by date × status
    const dateMap = {};
    rows.forEach(r => {
        const d = r.date || 'Unknown';
        if (!dateMap[d]) dateMap[d] = { completed: 0, cancelled: 0, noshow: 0, other: 0, raw: r.raw_date || new Date(d) };
        const st = normalizeStatus(r.status);
        if (st === 'completed')                              dateMap[d].completed++;
        else if (st === 'cancelled')                         dateMap[d].cancelled++;
        else if (['no-show','noshow','no_show'].includes(st)) dateMap[d].noshow++;
        else                                                 dateMap[d].other++;
    });

    const sorted = Object.keys(dateMap).sort((a, b) => {
        const da = dateMap[a].raw.getTime();
        const db = dateMap[b].raw.getTime();
        return (!isNaN(da) && !isNaN(db)) ? da - db : a.localeCompare(b);
    });

    const labels = sorted.map(d => {
        const dt = dateMap[d].raw;
        return !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : d;
    });

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Completed',
                    data: sorted.map(d => dateMap[d].completed),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 4,
                    maxBarThickness: 24,
                },
                {
                    label: 'Cancelled',
                    data: sorted.map(d => dateMap[d].cancelled),
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderRadius: 4,
                    maxBarThickness: 24,
                },
                {
                    label: 'No-Show',
                    data: sorted.map(d => dateMap[d].noshow),
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    borderRadius: 4,
                    maxBarThickness: 24,
                },
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
                        boxWidth: 10, boxHeight: 10,
                        usePointStyle: true,
                        font: { size: 11, weight: '500' },
                        color: '#64748b',
                        padding: 14,
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 11 },
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45 }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function renderDonutChart(rows) {
    const ctx = document.getElementById('donutChart');
    if (!ctx) return;
    if (donutChartInstance) { donutChartInstance.destroy(); donutChartInstance = null; }

    const counts = { completed: 0, cancelled: 0, 'no-show': 0, refunded: 0, other: 0 };
    rows.forEach(r => {
        const st = normalizeStatus(r.status);
        if (st === 'completed')                               counts.completed++;
        else if (st === 'cancelled')                          counts.cancelled++;
        else if (['no-show','noshow','no_show'].includes(st)) counts['no-show']++;
        else if (st === 'refunded')                           counts.refunded++;
        else                                                  counts.other++;
    });

    const total = rows.length;
    const entries = Object.entries(counts).filter(([, v]) => v > 0);
    const labels  = entries.map(([k]) => k.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-'));
    const data    = entries.map(([, v]) => v);
    const colors  = entries.map(([k]) => DONUT_COLORS[k] || DONUT_COLORS.other);

    donutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} (${pct(ctx.parsed, total)})`
                    }
                }
            }
        }
    });

    const centerVal = document.getElementById('donutCenterVal');
    const centerLbl = document.getElementById('donutCenterLbl');
    if (centerVal) centerVal.textContent = total.toLocaleString('en-IN');
    if (centerLbl) centerLbl.textContent = 'Bookings';

    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        legendEl.innerHTML = entries.map(([k, v]) => {
            const color = DONUT_COLORS[k] || DONUT_COLORS.other;
            const label = k.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
            return `<div class="donut-legend-row">
                <div class="donut-legend-left">
                    <span class="donut-dot" style="background:${color};"></span>
                    <span>${label}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="donut-legend-count">${v.toLocaleString('en-IN')}</span>
                    <span class="donut-legend-pct">${pct(v, total)}</span>
                </div>
            </div>`;
        }).join('');
    }
}

// ─── Table ────────────────────────────────────────────────────────────────────
function renderTable(rows, page) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const total      = rows.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    currentPage      = Math.max(1, Math.min(page, totalPages));
    const start      = (currentPage - 1) * PAGE_SIZE;
    const end        = Math.min(start + PAGE_SIZE, total);
    const pageRows   = rows.slice(start, end);

    // Badge
    const badge = document.getElementById('tableCountBadge');
    if (badge) badge.textContent = `${total.toLocaleString('en-IN')} booking${total !== 1 ? 's' : ''}`;

    // Rows
    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">
            <i data-feather="inbox"></i>
            No bookings match your filter criteria.
        </td></tr>`;
        if (typeof feather !== 'undefined') feather.replace();
        renderPagination(0, 1, 1);
        return;
    }

    tbody.innerHTML = pageRows.map(r => {
        const custId   = (r.customer_id || '').replace(/'/g, "\\'");
        const custName = (r.customer || '—').replace(/'/g, "\\'");
        const custCell = r.customer
            ? `<span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${custName}')">${r.customer}</span>`
            : '<span style="color:#94a3b8;">—</span>';

        const amtColor = {
            'completed': '#059669',
            'cancelled': '#dc2626',
            'no-show':   '#d97706',
        }[normalizeStatus(r.status)] || '#0f172a';

        return `<tr>
            <td><strong style="color:#0f172a;font-size:0.85rem;">${r.date || '—'}</strong></td>
            <td style="color:#64748b;font-size:0.84rem;">${r.time || '—'}</td>
            <td>${custCell}</td>
            <td style="max-width:200px;">${chipCell(r.service)}</td>
            <td style="max-width:170px;">${chipCell(r.staff)}</td>
            <td style="font-weight:700;color:${amtColor};">${fmtINR(r.amount)}</td>
            <td>${payPill(r.payment_status)}</td>
            <td style="text-align:center;">${statusPill(r.status)}</td>
        </tr>`;
    }).join('');

    if (typeof feather !== 'undefined') feather.replace();

    // Pagination info
    const info = document.getElementById('paginationInfo');
    if (info) info.textContent = `Showing ${start + 1}–${end} of ${total.toLocaleString('en-IN')} bookings`;

    renderPagination(total, currentPage, totalPages);
}

function renderPagination(total, page, totalPages) {
    const ctrl = document.getElementById('paginationControls');
    if (!ctrl) return;

    if (totalPages <= 1) { ctrl.innerHTML = ''; return; }

    let html = `<button class="page-btn" id="pagePrev" ${page === 1 ? 'disabled' : ''}>&larr;</button>`;
    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
            html += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
        } else if (p === page - 3 || p === page + 3) {
            html += `<span style="padding:0 4px;color:#94a3b8;">…</span>`;
        }
    }
    html += `<button class="page-btn" id="pageNext" ${page === totalPages ? 'disabled' : ''}>&rarr;</button>`;
    ctrl.innerHTML = html;

    ctrl.querySelectorAll('[data-page]').forEach(btn => {
        btn.onclick = () => renderTable(filteredRows, Number(btn.dataset.page));
    });
    const prev = document.getElementById('pagePrev');
    const next = document.getElementById('pageNext');
    if (prev) prev.onclick = () => renderTable(filteredRows, currentPage - 1);
    if (next) next.onclick = () => renderTable(filteredRows, currentPage + 1);
}

// ─── Client-side filter (status, payment, staff, search) ─────────────────────
function applyClientFilters() {
    const statusSel  = document.getElementById('filterStatus');
    const paymentSel = document.getElementById('filterPayment');
    const staffSel   = document.getElementById('filterStaff');
    const search     = (document.getElementById('tableSearch')?.value || '').toLowerCase().trim();

    const statusVal  = statusSel?.value  || 'all';
    const paymentVal = paymentSel?.value || 'all';
    const staffVal   = staffSel?.value   || 'all';

    filteredRows = allRows.filter(r => {
        const st  = normalizeStatus(r.status);
        const pay = (r.payment_status || '').toLowerCase().trim();

        // Status filter
        if (statusVal !== 'all') {
            const sv = statusVal.toLowerCase().replace(/[\s_]/g, '-');
            if (st !== sv) return false;
        }

        // Payment filter
        if (paymentVal !== 'all' && pay !== paymentVal) return false;

        // Staff filter
        if (staffVal !== 'all') {
            const staffNames = (r.staff || '').split(',').map(s => s.trim());
            if (!staffNames.includes(staffVal)) return false;
        }

        // Search
        if (search) {
            const haystack = [r.customer, r.service, r.staff, r.date, r.status, r.payment_status]
                .map(x => (x || '').toLowerCase()).join(' ');
            if (!haystack.includes(search)) return false;
        }

        return true;
    });

    updateKPIs(filteredRows);
    renderTrendChart(filteredRows);
    renderDonutChart(filteredRows);
    renderTable(filteredRows, 1);
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV() {
    if (!filteredRows.length) { alert('No bookings to export.'); return; }
    const headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Payment Status', 'Booking Status'];
    const lines   = [headers.join(',')];
    filteredRows.forEach(r => {
        lines.push([
            `"${r.date || ''}"`,
            `"${r.time || ''}"`,
            `"${(r.customer || '').replace(/"/g,'""')}"`,
            `"${(r.service || '').replace(/"/g,'""')}"`,
            `"${(r.staff || '').replace(/"/g,'""')}"`,
            `"${r.amount || 0}"`,
            `"${r.payment_status || ''}"`,
            `"${r.status || ''}"`,
        ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const s = document.getElementById('filterStartDate')?.value || 'all';
    const e = document.getElementById('filterEndDate')?.value   || 'all';
    a.download = `Bookings_Report_${s}_to_${e}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Load Data (fetch + render) ───────────────────────────────────────────────
async function loadData() {
    const companyId  = resolveCompanyId();
    const startDate  = document.getElementById('filterStartDate')?.value || '2000-01-01';
    const endDate    = document.getElementById('filterEndDate')?.value   || '2099-12-31';
    const branchId   = resolveBranchId(document.getElementById('filterBranch'));

    // Show loading state
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:#6366f1;">
        Loading bookings…
    </td></tr>`;

    ['kpiTotal','kpiCompleted','kpiCancelled','kpiNoShow','kpiRevenue'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '…';
    });

    try {
        allRows = await fetchData(companyId, branchId, startDate, endDate);
        populateStaffDropdown(allRows);
        applyClientFilters();
    } catch (err) {
        console.error('[bookings-report] loadData error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:#ef4444;">
            Failed to load data. Please try again.
        </td></tr>`;
    }
}

// ─── Reset Filters ────────────────────────────────────────────────────────────
function resetFilters() {
    setDefaultDates();
    ['filterBranch','filterStatus','filterPayment','filterStaff'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = el.options[0]?.value || 'all';
    });
    const search = document.getElementById('tableSearch');
    if (search) search.value = '';
    loadData();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDates();

    const companyId = resolveCompanyId();
    if (companyId) await populateBranchDropdown(companyId);

    // Wire Apply / Reset
    const btnApply = document.getElementById('btnApplyFilters');
    const btnReset = document.getElementById('btnResetFilters');
    if (btnApply) btnApply.onclick = loadData;
    if (btnReset) btnReset.onclick = resetFilters;

    // Wire search (live filter on client rows)
    const searchInput = document.getElementById('tableSearch');
    if (searchInput) searchInput.oninput = applyClientFilters;

    // Wire status/payment/staff dropdowns (client-side re-filter, no refetch)
    ['filterStatus','filterPayment','filterStaff'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = applyClientFilters;
    });

    // Wire export & print (both header buttons + toolbar buttons)
    ['btnExportCSV','btnExportCSV2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = exportCSV;
    });

    ['btnPrint','btnPrint2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => window.print();
    });

    // Initial load
    await loadData();
});
