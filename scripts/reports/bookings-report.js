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


// ─── State ────────────────────────────────────────────────────────────────────
let allRows = [];          // Raw rows from RPC (or mock)
let filteredRows = [];     // After status/payment/search filters
let currentPage = 1;

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
// ─── Adaptive KPI Cards ───────────────────────────────────────────────────────
// Cards change their label, value, sub-text and accent colour based on the
// active status filter — so they're always meaningful, never show 0 / N/A.

const ACCENT = {
    indigo: '#6366f1',
    green:  '#10b981',
    red:    '#ef4444',
    amber:  '#f59e0b',
    sky:    '#0ea5e9',
    purple: '#a855f7',
};

function setCard(n, { label, value, sub, color }) {
    const lbl  = document.getElementById('kpiLabel' + n);
    const val  = document.getElementById('kpiVal'   + n);
    const sub_ = document.getElementById('kpiSub'   + n);
    if (lbl)  lbl.textContent  = label;
    if (val)  { val.textContent = value; val.style.color = color || '#0f172a'; }
    if (sub_) sub_.textContent = sub;

    const card = val?.closest('.kpi-card');
    if (card) card.style.borderLeft = `3px solid ${color || ACCENT.indigo}`;
}

function updateKPIs(rows) {
    const statusFilter = (document.getElementById('filterStatus')?.value || 'all').toLowerCase();

    // Always compute from full allRows for rates; from filteredRows for counts/amounts
    const totalAll   = allRows.length;
    const totalFiltered = rows.length;

    const sum = arr => arr.reduce((s, r) => s + Number(r.amount || 0), 0);
    const avg = (total, count) => count > 0 ? total / count : 0;
    const ratePct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '0%';
    const fmtN = n => Number(n || 0).toLocaleString('en-IN');
    const fmtR = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

    if (statusFilter === 'all') {
        // ── All statuses ────────────────────────────────────────────────────
        const completed = rows.filter(r => normalizeStatus(r.status) === 'completed');
        const cancelled = rows.filter(r => normalizeStatus(r.status) === 'cancelled');
        const noshow    = rows.filter(r => ['no-show','noshow','no_show'].includes(normalizeStatus(r.status)));
        const revenue   = sum(completed.filter(r => (r.payment_status || '').toLowerCase() === 'paid'));

        setCard(1, { label: 'Total Bookings',    value: fmtN(totalFiltered),  sub: 'in selected period',                   color: ACCENT.indigo });
        setCard(2, { label: 'Completed',         value: fmtN(completed.length), sub: ratePct(completed.length, totalFiltered) + ' completion rate', color: ACCENT.green  });
        setCard(3, { label: 'Cancelled',         value: fmtN(cancelled.length), sub: ratePct(cancelled.length, totalFiltered) + ' cancellation rate', color: ACCENT.red  });
        setCard(4, { label: 'No-Shows',          value: fmtN(noshow.length),   sub: ratePct(noshow.length, totalFiltered) + ' no-show rate',      color: ACCENT.amber  });
        setCard(5, { label: 'Revenue Collected', value: fmtR(revenue),         sub: 'from ' + fmtN(completed.length) + ' completed bookings',     color: ACCENT.sky    });

    } else if (statusFilter === 'completed') {
        // ── Completed ───────────────────────────────────────────────────────
        const paidRows  = rows.filter(r => (r.payment_status || '').toLowerCase() === 'paid');
        const unpaid    = rows.filter(r => ['unpaid','pending'].includes((r.payment_status || '').toLowerCase()));
        const revenue   = sum(paidRows);
        const avgVal    = avg(revenue, paidRows.length);
        const compRate  = ratePct(totalFiltered, totalAll);

        setCard(1, { label: 'Completed Bookings', value: fmtN(totalFiltered),  sub: 'in selected period',                     color: ACCENT.green  });
        setCard(2, { label: 'Revenue Collected',  value: fmtR(revenue),        sub: 'from ' + fmtN(paidRows.length) + ' paid bookings',         color: ACCENT.sky    });
        setCard(3, { label: 'Avg per Booking',    value: fmtR(avgVal),         sub: 'average booking value',                   color: ACCENT.indigo });
        setCard(4, { label: 'Completion Rate',    value: compRate,             sub: 'vs all bookings in period',               color: ACCENT.green  });
        setCard(5, { label: 'Pending Payments',   value: fmtN(unpaid.length),  sub: fmtR(sum(unpaid)) + ' yet to collect',    color: ACCENT.amber  });

    } else if (statusFilter === 'cancelled') {
        // ── Cancelled ───────────────────────────────────────────────────────
        const lostAmt  = sum(rows);
        const avgLost  = avg(lostAmt, totalFiltered);
        const cancelRate = ratePct(totalFiltered, totalAll);

        setCard(1, { label: 'Cancelled Bookings', value: fmtN(totalFiltered), sub: 'in selected period',              color: ACCENT.red    });
        setCard(2, { label: 'Est. Value Lost',     value: fmtR(lostAmt),      sub: 'potential revenue missed',        color: ACCENT.red    });
        setCard(3, { label: 'Avg Lost per Booking',value: fmtR(avgLost),      sub: 'average booking value',           color: ACCENT.amber  });
        setCard(4, { label: 'Cancellation Rate',   value: cancelRate,         sub: 'vs all bookings in period',       color: ACCENT.red    });
        setCard(5, { label: 'Recoverable',         value: fmtN(totalFiltered),sub: 'consider follow-up / rescheduling', color: ACCENT.indigo });

    } else if (statusFilter === 'no-show') {
        // ── No-Show ─────────────────────────────────────────────────────────
        const missedAmt  = sum(rows);
        const avgMissed  = avg(missedAmt, totalFiltered);
        const noShowRate = ratePct(totalFiltered, totalAll);

        setCard(1, { label: 'No-Show Bookings',   value: fmtN(totalFiltered), sub: 'in selected period',              color: ACCENT.amber  });
        setCard(2, { label: 'Est. Missed Revenue', value: fmtR(missedAmt),    sub: 'potential revenue not realised',  color: ACCENT.amber  });
        setCard(3, { label: 'Avg Missed Value',    value: fmtR(avgMissed),    sub: 'per no-show appointment',         color: ACCENT.amber  });
        setCard(4, { label: 'No-Show Rate',        value: noShowRate,         sub: 'vs all bookings in period',       color: ACCENT.red    });
        setCard(5, { label: 'Follow-up Needed',    value: fmtN(totalFiltered),sub: 'consider reminder policy',        color: ACCENT.indigo });

    } else if (statusFilter === 'refunded') {
        // ── Refunded ────────────────────────────────────────────────────────
        const refundAmt  = sum(rows);
        const avgRefund  = avg(refundAmt, totalFiltered);
        const refundRate = ratePct(totalFiltered, totalAll);

        setCard(1, { label: 'Refunded Bookings', value: fmtN(totalFiltered), sub: 'in selected period',              color: ACCENT.purple });
        setCard(2, { label: 'Amount Refunded',   value: fmtR(refundAmt),     sub: 'total refunded to customers',     color: ACCENT.purple });
        setCard(3, { label: 'Avg Refund',        value: fmtR(avgRefund),     sub: 'per refunded booking',            color: ACCENT.purple });
        setCard(4, { label: 'Refund Rate',       value: refundRate,          sub: 'vs all bookings in period',       color: ACCENT.red    });
        setCard(5, { label: 'Revenue Impact',    value: '−' + fmtR(refundAmt), sub: 'deducted from collected revenue', color: ACCENT.red  });

    } else {
        // ── Confirmed / Pending / Other ─────────────────────────────────────
        const totalAmt = sum(rows);
        const avgAmt   = avg(totalAmt, totalFiltered);

        setCard(1, { label: 'Total Bookings',   value: fmtN(totalFiltered), sub: 'in selected period',          color: ACCENT.indigo });
        setCard(2, { label: 'Est. Total Value', value: fmtR(totalAmt),      sub: 'expected booking revenue',    color: ACCENT.sky    });
        setCard(3, { label: 'Avg Booking Value',value: fmtR(avgAmt),        sub: 'average per booking',         color: ACCENT.indigo });
        setCard(4, { label: 'Action Needed',    value: fmtN(totalFiltered), sub: 'confirm or update status',    color: ACCENT.amber  });
        setCard(5, { label: 'Conversion Target',value: fmtN(totalFiltered), sub: 'aim to complete all',         color: ACCENT.green  });
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
        const info = document.getElementById('paginationInfo');
        if (info) info.textContent = 'Showing 0 bookings';
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

    ['kpiVal1','kpiVal2','kpiVal3','kpiVal4','kpiVal5'].forEach(id => {
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

    // Wire toolbar export & print
    const btnExport = document.getElementById('btnExportCSV2');
    if (btnExport) btnExport.onclick = exportCSV;

    const btnPrint = document.getElementById('btnPrint2');
    if (btnPrint) btnPrint.onclick = () => window.print();

    // Initial load
    await loadData();
});
