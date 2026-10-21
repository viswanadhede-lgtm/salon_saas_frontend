// scripts/reports/report-modules/memberships.js
// Dedicated report module for all 5 Memberships Sub-Reports:
// 1. mem-overview      - Memberships Overview
// 2. mem-sales         - Membership Sales & Revenue
// 3. mem-members       - Active Members & Renewal Pipeline
// 4. mem-usage         - Member Benefits & Usage Analysis
// 5. mem-cancellations - Cancellations, Churn & Refunds
//
// Designed to consume a single Master RPC: get_memberships_report(p_company_id, p_branch_id, p_start_date, p_end_date)
// with realistic, fully interactive preview data during frontend development.

import { formatCurrency, updateKPIs } from './shared.js';

let trendChartInstance = null;
let distChartInstance = null;

// =============================================================================
// Helper Functions
// =============================================================================

function resolveCompanyId() {
    const c = localStorage.getItem('company_id');
    return (c && c !== 'null' && c !== 'undefined' && c !== 'all') ? c : null;
}

function resolveBranchId(filterBranch) {
    if (filterBranch && filterBranch.value !== undefined) {
        if (filterBranch.value === 'all' || !filterBranch.value) return null;
        return filterBranch.value;
    }
    const stored = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    return (stored && stored !== 'all' && stored !== 'null' && stored !== 'undefined') ? stored : null;
}

async function initBranchDropdown(supabase, companyId, filterBranch) {
    try {
        if (!filterBranch) return;
        const { data: bList } = await supabase
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId);
        if (bList && bList.length > 0) {
            const existing = filterBranch.value;
            filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
            filterBranch.value = existing || 'all';
        }
    } catch (e) {
        console.warn('[memberships] Branch fetch warning:', e);
    }
}

function setDefaultDateRange(filterStart, filterEnd) {
    if (!filterStart || !filterEnd) return;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    if (!filterStart.value) filterStart.value = toIso(firstDay);
    if (!filterEnd.value) filterEnd.value = toIso(lastDay);
}

function fmtDate(val) {
    if (!val) return '—';
    const parsed = new Date(val);
    if (isNaN(parsed.getTime())) return val;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtINR(num) {
    const n = Math.round(Number(num) || 0);
    return '₹' + n.toLocaleString('en-IN');
}

function statusBadge(status, customColor = null, customBg = null) {
    const s = (status || '').toLowerCase().trim();
    const map = {
        'active':        { color: '#065f46', bg: '#d1fae5', label: 'Active' },
        'paid':          { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        'applied':       { color: '#065f46', bg: '#d1fae5', label: 'Applied' },
        'completed':     { color: '#065f46', bg: '#d1fae5', label: 'Completed' },
        'expiring soon': { color: '#b45309', bg: '#fef3c7', label: 'Expiring Soon' },
        'pending':       { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        'reversed':      { color: '#86198f', bg: '#f5d0fe', label: 'Reversed' },
        'expired':       { color: '#475569', bg: '#f1f5f9', label: 'Expired' },
        'cancelled':     { color: '#991b1b', bg: '#fee2e2', label: 'Cancelled' },
        'refunded':      { color: '#b45309', bg: '#fef3c7', label: 'Refunded' },
        'member':        { color: '#6d28d9', bg: '#ede9fe', label: 'Membership' },
    };
    const cfg = map[s] || { color: customColor || '#475569', bg: customBg || '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// =============================================================================
// Generic Table Controller: Search, Pagination, CSV Export & Print
// =============================================================================

function setupReportTable(headers, rows, options = {}) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const recordBadge = document.getElementById('tableRecordCountBadge');
    const searchInput = document.getElementById('tableSearchInput');
    const exportBtn = document.getElementById('btnExportCSV');
    const printBtn = document.getElementById('btnPrintTable');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationControls = document.getElementById('paginationControls');

    const pageSize = options.pageSize || 10;
    const unitName = options.unitName || 'records';
    let currentPage = 1;
    let filteredRows = [...(rows || [])];

    // Set table headers
    if (thead) {
        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    }

    function renderPage(page) {
        currentPage = page;
        const total = filteredRows.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = Math.min(startIdx + pageSize, total);
        const pageItems = filteredRows.slice(startIdx, endIdx);

        // Update record count badge
        if (recordBadge) {
            recordBadge.textContent = `${total.toLocaleString('en-IN')} ${unitName}`;
        }

        // Render rows
        if (!tbody) return;
        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center;padding:2.5rem;color:#94a3b8;">No matching ${unitName} found.</td></tr>`;
        } else {
            tbody.innerHTML = pageItems.map(r => {
                const cells = options.rowFormatter ? options.rowFormatter(r) : (Array.isArray(r) ? r : Object.values(r));
                return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
            }).join('');
        }

        // Update pagination text
        if (paginationInfo) {
            if (total === 0) {
                paginationInfo.textContent = `Showing 0 to 0 of 0 ${unitName}`;
            } else {
                paginationInfo.textContent = `Showing ${(startIdx + 1).toLocaleString('en-IN')} to ${endIdx.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${unitName}`;
            }
        }

        // Update pagination controls
        if (paginationControls) {
            if (totalPages <= 1) {
                paginationControls.innerHTML = '';
            } else {
                let html = '';
                html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="${currentPage - 1}">Previous</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                    } else if (p === currentPage - 2 || p === currentPage + 2) {
                        html += `<span class="page-dots">...</span>`;
                    }
                }
                html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}">Next</button>`;
                paginationControls.innerHTML = html;

                paginationControls.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
                    btn.onclick = () => {
                        const target = parseInt(btn.getAttribute('data-page'));
                        if (!isNaN(target)) renderPage(target);
                    };
                });
            }
        }
    }

    // Wire live search
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const q = (e.target.value || '').toLowerCase().trim();
            if (!q) {
                filteredRows = [...(rows || [])];
            } else {
                filteredRows = (rows || []).filter(r => {
                    const text = JSON.stringify(r).toLowerCase();
                    return text.includes(q);
                });
            }
            renderPage(1);
        };
    }

    // Wire Export CSV
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!filteredRows || filteredRows.length === 0) {
                alert(`No ${unitName} to export.`);
                return;
            }
            const cleanHeaders = headers.map(h => `"${h.replace(/"/g, '""')}"`);
            const csvLines = [cleanHeaders.join(',')];
            filteredRows.forEach(r => {
                const rawCells = options.csvFormatter ? options.csvFormatter(r) : (options.rowFormatter ? options.rowFormatter(r) : Object.values(r));
                const line = rawCells.map(c => {
                    const plain = String(c).replace(/<[^>]*>?/gm, '').trim();
                    return `"${plain.replace(/"/g, '""')}"`;
                });
                csvLines.push(line.join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${options.reportFileName || 'Memberships_Report'}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    // Wire Print
    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    renderPage(1);
}

// =============================================================================
// Chart Renderers (Trend Graph & Donut Distribution)
// =============================================================================

function renderTrendChart(labels, values, options = {}) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (trendChartInstance) trendChartInstance.destroy();

    const chartType = options.type || 'bar';
    const isCurrency = options.isCurrency !== false;
    const barColor = options.color || '#7c3aed';
    const bgColors = values.map((_, i) => i === values.length - 1 ? '#a855f7' : barColor);

    trendChartInstance = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: options.datasetLabel || 'Revenue',
                data: values,
                backgroundColor: chartType === 'line' ? 'rgba(124, 58, 237, 0.12)' : bgColors,
                borderColor: '#7c3aed',
                borderWidth: chartType === 'line' ? 2.5 : 0,
                fill: chartType === 'line',
                tension: 0.35,
                borderRadius: chartType === 'bar' ? 6 : 0,
                barThickness: 28,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y ?? ctx.parsed;
                            return ` ${options.datasetLabel || 'Value'}: ${isCurrency ? fmtINR(val) : Number(val).toLocaleString('en-IN')}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: options.yAxisTitle || (isCurrency ? 'Revenue (₹) →' : 'Count →'),
                        color: '#64748b',
                        font: { size: 12, weight: '600', family: 'Inter, system-ui, -apple-system, sans-serif' },
                        padding: { bottom: 8 }
                    },
                    grid: { color: '#f1f5f9', drawBorder: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: (v) => isCurrency ? (v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`) : v
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: options.xAxisTitle || 'Timeline →',
                        color: '#64748b',
                        font: { size: 12, weight: '600', family: 'Inter, system-ui, -apple-system, sans-serif' },
                        padding: { top: 8 }
                    },
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

function renderDonutChart(labels, values, options = {}) {
    const ctx = document.getElementById('distributionChart');
    const centerValEl = document.getElementById('donutCenterValue');
    const centerLblEl = document.getElementById('donutCenterLabel');
    const legendEl = document.getElementById('donutLegend');

    if (!ctx) return;
    if (distChartInstance) distChartInstance.destroy();

    const colors = options.colors || ['#7c3aed', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#f43f5e'];
    const isCurrency = options.isCurrency !== false;
    const total = values.reduce((a, b) => a + (Number(b) || 0), 0);

    // Update Center Stat
    if (centerValEl) {
        centerValEl.textContent = options.centerValue || (isCurrency ? fmtINR(total) : total.toLocaleString('en-IN'));
    }
    if (centerLblEl) {
        centerLblEl.textContent = options.centerLabel || 'Total';
    }

    distChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
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
                        label: (ctx) => {
                            const val = ctx.parsed;
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                            const formatted = isCurrency ? fmtINR(val) : Number(val).toLocaleString('en-IN');
                            return ` ${ctx.label}: ${formatted} (${pct})`;
                        }
                    }
                }
            }
        }
    });

    // Populate Right Donut Legend
    if (legendEl) {
        if (!labels || labels.length === 0 || values.every(v => v === 0)) {
            legendEl.innerHTML = '<div style="color:#94a3b8;font-size:0.85rem;padding:0.5rem 0;">No distribution data available</div>';
        } else {
            legendEl.innerHTML = labels.map((lbl, i) => {
                const val = values[i] || 0;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                const color = colors[i % colors.length];
                const displayVal = isCurrency ? fmtINR(val) : Number(val).toLocaleString('en-IN');
                const subLabel = options.legendSubLabel ? options.legendSubLabel(lbl, val, i) : displayVal;

                return `
                    <div class="donut-legend-item">
                        <span class="donut-legend-dot" style="background-color: ${color};"></span>
                        <span class="donut-legend-text">
                            ${lbl} - <strong>${subLabel}</strong> <span style="color:#64748b;font-weight:500;">(${pct})</span>
                        </span>
                    </div>
                `;
            }).join('');
        }
    }
}

// =============================================================================
// Master RPC Bridge & Realistic Fallback Datasets
// =============================================================================

async function callMasterMembershipsRpc(supabase, companyId, branchId, start, end) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    if (!cid) {
        console.warn('[memberships] No company_id found in session — cannot call RPC. Using preview data.');
        return getPreviewData();
    }

    try {
        const { data, error } = await supabase.rpc('get_memberships_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (error) {
            console.error('[memberships] RPC error from Supabase:', error.message || error);
            return getPreviewData();
        }

        if (data) {
            let res = data;
            if (typeof res === 'string') {
                try { res = JSON.parse(res); } catch (e) { }
            }
            if (Array.isArray(res)) res = res[0] || {};
            if (res.memberships_report) res = res.memberships_report;
            if (res.get_memberships_report) res = res.get_memberships_report;
            if (typeof res === 'string') {
                try { res = JSON.parse(res); } catch (e) { }
            }
            if (res && typeof res === 'object' && Object.keys(res).length > 0) {
                console.log('[memberships] RPC loaded successfully:', Object.keys(res));
                return res;
            }
        }

        console.warn('[memberships] RPC returned empty data.');
    } catch (e) {
        console.error('[memberships] RPC JS exception:', e.message || e);
    }

    return getPreviewData();
}

function getPreviewData() {
    return {
        // 1. Overview
        'mem_overview': {
            kpis: {
                total_revenue: 185000,
                total_discounts: 15000,
                total_refunds: 9000,
                active_members: 68,
                total_clients_pct: '24.2%',
                benefits_redeemed: 32400,
                benefits_visits_count: 142,
                program_multiplier: '4.8x'
            },
            trend: {
                labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                values: [24000, 31000, 28000, 36000, 32000, 34000]
            },
            plan_tiers: {
                labels: ['Gold Annual', 'Silver 6-Months', 'Platinum VIP', 'Hair Spa Club'],
                values: [32, 22, 10, 4]
            },
            rows: [
                { datetime: '2024-10-20, 04:30 PM', ref: 'MEM-1082', customer: 'Priya Sharma', phone: '98765 43210', plan: 'Gold Annual Pass', duration: 365, expiry: 'Active · in 364 days', final_amount: 9000, method: 'UPI', staff: 'Aakash Verma', status: 'Active' },
                { datetime: '2024-10-19, 02:15 PM', ref: 'MEM-1081', customer: 'Rahul Mehta', phone: '98123 45678', plan: 'Silver 6-Months', duration: 180, expiry: 'Active · in 179 days', final_amount: 5400, method: 'Card', staff: 'Sneha Rao', status: 'Active' },
                { datetime: '2024-10-18, 06:10 PM', ref: 'MEM-1080', customer: 'Ananya Roy', phone: '98234 56789', plan: 'Platinum VIP Elite', duration: 365, expiry: 'Active · in 362 days', final_amount: 14400, method: 'UPI', staff: 'Aakash Verma', status: 'Active' },
                { datetime: '2024-10-17, 11:45 AM', ref: 'MEM-1079', customer: 'Vikram Joshi', phone: '98345 67890', plan: 'Gold Annual Pass', duration: 365, expiry: 'Active · in 361 days', final_amount: 9000, method: 'Cash', staff: 'Sneha Rao', status: 'Active' },
                { datetime: '2024-10-15, 05:20 PM', ref: 'MEM-1078', customer: 'Deepika Sen', phone: '98456 78901', plan: 'Hair Spa Club Pass', duration: 90, expiry: 'Expiring Soon · in 14 days', final_amount: 3200, method: 'UPI', staff: 'Kavita Iyer', status: 'Expiring Soon' },
                { datetime: '2024-10-12, 01:30 PM', ref: 'MEM-1077', customer: 'Rohan Nambiar', phone: '98567 89012', plan: 'Silver 6-Months', duration: 180, expiry: 'Active · in 171 days', final_amount: 5400, method: 'Card', staff: 'Aakash Verma', status: 'Active' },
                { datetime: '2024-10-10, 03:40 PM', ref: 'MEM-1076', customer: 'Sunita Menon', phone: '98678 90123', plan: 'Gold Annual Pass', duration: 365, expiry: 'Cancelled · refunded', final_amount: 9000, method: 'UPI', staff: 'Sneha Rao', status: 'Cancelled' },
                { datetime: '2024-10-08, 12:15 PM', ref: 'MEM-1075', customer: 'Arjun Das', phone: '98789 01234', plan: 'Silver 6-Months', duration: 180, expiry: 'Expired · 5 days ago', final_amount: 5400, method: 'Cash', staff: 'Kavita Iyer', status: 'Expired' }
            ]
        },

        // 2. Sales
        'mem_sales': {
            kpis: {
                gross_billed: 209000,
                discounts_given: 15000,
                net_revenue: 185000,
                plans_sold: 26,
                aov: 7115,
                avg_duration_days: 284,
                upi_share: '58.4%',
                card_share: '32.1%',
                cash_share: '9.5%'
            },
            trend: {
                labels: ['01 Oct', '05 Oct', '09 Oct', '13 Oct', '17 Oct', '20 Oct'],
                values: [18000, 27000, 36000, 45000, 29000, 30000]
            },
            tenders: {
                labels: ['UPI', 'Credit/Debit Card', 'Cash'],
                values: [108000, 59400, 17600]
            },
            rows: [
                { date: '2024-10-20', ref: 'MEM-1082', customer: 'Priya Sharma', phone: '98765 43210', plan: 'Gold Annual Pass', duration: 365, gross: 10000, disc: 1000, disc_name: 'FESTIVE10', net: 9000, method: 'UPI', staff: 'Aakash Verma' },
                { date: '2024-10-19', ref: 'MEM-1081', customer: 'Rahul Mehta', phone: '98123 45678', plan: 'Silver 6-Months', duration: 180, gross: 6000, disc: 600, disc_name: 'WELCOME10', net: 5400, method: 'Card', staff: 'Sneha Rao' },
                { date: '2024-10-18', ref: 'MEM-1080', customer: 'Ananya Roy', phone: '98234 56789', plan: 'Platinum VIP Elite', duration: 365, gross: 16000, disc: 1600, disc_name: 'VIPPRIVILEGE', net: 14400, method: 'UPI', staff: 'Aakash Verma' },
                { date: '2024-10-17', ref: 'MEM-1079', customer: 'Vikram Joshi', phone: '98345 67890', plan: 'Gold Annual Pass', duration: 365, gross: 10000, disc: 1000, disc_name: 'PROMO10', net: 9000, method: 'Cash', staff: 'Sneha Rao' },
                { date: '2024-10-15', ref: 'MEM-1078', customer: 'Deepika Sen', phone: '98456 78901', plan: 'Hair Spa Club Pass', duration: 90, gross: 3500, disc: 300, disc_name: 'OCTFLASH', net: 3200, method: 'UPI', staff: 'Kavita Iyer' },
                { date: '2024-10-12', ref: 'MEM-1077', customer: 'Rohan Nambiar', phone: '98567 89012', plan: 'Silver 6-Months', duration: 180, gross: 6000, disc: 600, disc_name: 'AUTUMN10', net: 5400, method: 'Card', staff: 'Aakash Verma' },
                { date: '2024-10-10', ref: 'MEM-1076', customer: 'Sunita Menon', phone: '98678 90123', plan: 'Gold Annual Pass', duration: 365, gross: 10000, disc: 1000, disc_name: 'FESTIVE10', net: 9000, method: 'UPI', staff: 'Sneha Rao' },
                { date: '2024-10-08', ref: 'MEM-1075', customer: 'Arjun Das', phone: '98789 01234', plan: 'Silver 6-Months', duration: 180, gross: 6000, disc: 600, disc_name: 'WELCOME10', net: 5400, method: 'Cash', staff: 'Kavita Iyer' }
            ]
        },

        // 3. Members Directory & Renewals
        'mem_members': {
            kpis: {
                active_members: 68,
                expiring_30d: 14,
                expired_count: 8,
                retention_rate: '82.4%',
                healthy_target: '> 75% target'
            },
            horizon: {
                labels: ['Next 7 Days', 'Next 15 Days', 'Next 30 Days', 'Next 60 Days', '90+ Days'],
                values: [3, 4, 7, 18, 36]
            },
            status_split: {
                labels: ['Active (>30d)', 'Expiring (<=30d)', 'Expired', 'Cancelled'],
                values: [54, 14, 8, 2]
            },
            rows: [
                { customer: 'Deepika Sen', phone: '98456 78901', plan: 'Hair Spa Club Pass', join_date: '2024-07-20', expiry_date: '2024-10-25', days_rem: 5, visits: 6, spend: 12400, branch: 'Main Branch', status: 'Expiring Soon' },
                { customer: 'Kiran Bedi', phone: '98901 23456', plan: 'Silver 6-Months', join_date: '2024-04-30', expiry_date: '2024-10-28', days_rem: 8, visits: 11, spend: 18900, branch: 'Main Branch', status: 'Expiring Soon' },
                { customer: 'Suresh Raina', phone: '98012 34567', plan: 'Gold Annual Pass', join_date: '2023-11-05', expiry_date: '2024-11-05', days_rem: 16, visits: 24, spend: 48200, branch: 'Downtown Branch', status: 'Expiring Soon' },
                { customer: 'Priya Sharma', phone: '98765 43210', plan: 'Gold Annual Pass', join_date: '2024-10-20', expiry_date: '2025-10-20', days_rem: 365, visits: 1, spend: 9000, branch: 'Main Branch', status: 'Active' },
                { customer: 'Rahul Mehta', phone: '98123 45678', plan: 'Silver 6-Months', join_date: '2024-10-19', expiry_date: '2025-04-19', days_rem: 180, visits: 2, spend: 6800, branch: 'Downtown Branch', status: 'Active' },
                { customer: 'Ananya Roy', phone: '98234 56789', plan: 'Platinum VIP Elite', join_date: '2024-10-18', expiry_date: '2025-10-18', days_rem: 363, visits: 3, spend: 22100, branch: 'Main Branch', status: 'Active' },
                { customer: 'Arjun Das', phone: '98789 01234', plan: 'Silver 6-Months', join_date: '2024-04-01', expiry_date: '2024-10-01', days_rem: -19, visits: 9, spend: 16400, branch: 'Main Branch', status: 'Expired' },
                { customer: 'Sunita Menon', phone: '98678 90123', plan: 'Gold Annual Pass', join_date: '2024-08-10', expiry_date: '2024-10-10', days_rem: 0, visits: 4, spend: 11200, branch: 'Downtown Branch', status: 'Cancelled' }
            ]
        },

        // 4. Benefits & Usage
        'mem_usage': {
            kpis: {
                discounts_claimed: 32400,
                member_visits: 142,
                total_service_spend: 155500,
                spend_multiplier: '4.8x',
                avg_visit_spend: 1095
            },
            monthly_comparison: {
                labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                values: [19400, 24500, 22100, 31200, 28900, 29400]
            },
            categories: {
                labels: ['Hair Services', 'Skin & Facials', 'Spa & Body', 'Retail Products', 'Nails'],
                values: [14200, 8400, 5200, 3100, 1500]
            },
            rows: [
                { datetime: '2024-10-20, 03:15 PM', ref: 'BK-5091', customer: 'Priya Sharma', plan: 'Gold Annual Pass', service: 'Keratin Hair Spa + Blowdry', staff: 'Megha Rao', bill: 2500, discount: 500, paid: 2000, status: 'Applied' },
                { datetime: '2024-10-20, 01:45 PM', ref: 'BK-5089', customer: 'Rahul Mehta', plan: 'Silver 6-Months', service: "Beard Styling & Men's Facial", staff: 'Aakash Verma', bill: 1400, discount: 210, paid: 1190, status: 'Applied' },
                { datetime: '2024-10-19, 06:10 PM', ref: 'BK-5082', customer: 'Ananya Roy', plan: 'Platinum VIP Elite', service: 'Hydra Deep Cleanse Facial', staff: 'Sneha Rao', bill: 3800, discount: 760, paid: 3040, status: 'Applied' },
                { datetime: '2024-10-19, 04:30 PM', ref: 'POS-1080', customer: 'Priya Sharma', plan: 'Gold Annual Pass', service: "L'Oreal Serie Expert Shampoo 300ml", staff: 'Front Desk', bill: 1200, discount: 180, paid: 1020, status: 'Applied' },
                { datetime: '2024-10-18, 02:00 PM', ref: 'BK-5074', customer: 'Vikram Joshi', plan: 'Gold Annual Pass', service: 'Classic Haircut & Beard Trim', staff: 'Vikram Joshi', bill: 800, discount: 160, paid: 640, status: 'Applied' },
                { datetime: '2024-10-17, 05:45 PM', ref: 'BK-5069', customer: 'Deepika Sen', plan: 'Hair Spa Club Pass', service: 'Intense Moisture Hair Spa', staff: 'Megha Rao', bill: 2200, discount: 440, paid: 1760, status: 'Applied' },
                { datetime: '2024-10-16, 11:30 AM', ref: 'BK-5061', customer: 'Kiran Bedi', plan: 'Silver 6-Months', service: 'Gel Polish & Nail Art', staff: 'Pooja Nair', bill: 1500, discount: 225, paid: 1275, status: 'Applied' },
                { datetime: '2024-10-15, 03:20 PM', ref: 'BK-5058', customer: 'Suresh Raina', plan: 'Gold Annual Pass', service: 'Ayurvedic Scalp Massage', staff: 'Aakash Verma', bill: 1800, discount: 360, paid: 1440, status: 'Applied' }
            ]
        },

        // 5. Cancellations & Churn
        'mem_cancellations': {
            kpis: {
                total_cancelled: 2,
                total_refunded: 9000,
                churn_rate: '2.8%',
                avg_lifespan_days: 61,
                healthy_benchmark: '< 5% churn'
            },
            monthly_trend: {
                labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                values: [0, 5400, 0, 0, 0, 9000]
            },
            plans_breakdown: {
                labels: ['Gold Annual Pass', 'Silver 6-Months'],
                values: [1, 1]
            },
            rows: [
                { cancel_date: '2024-10-10', purchase_date: '2024-08-10', ref: 'MEM-1076', customer: 'Sunita Menon', phone: '98678 90123', plan: 'Gold Annual Pass', paid: 9000, refund: 9000, mode: 'UPI', days_active: 61, reason: 'Relocated to different city' },
                { cancel_date: '2024-06-15', purchase_date: '2024-04-15', ref: 'MEM-1024', customer: 'Vikas Malhotra', phone: '98112 23344', plan: 'Silver 6-Months', paid: 5400, refund: 5400, mode: 'Card', days_active: 61, reason: 'Customer requested cancellation' }
            ]
        }
    };
}

// =============================================================================
// Report Sub-Renderers
// =============================================================================

// 1. Memberships Overview
async function renderMemOverview(data, supabase) {
    const companyId = resolveCompanyId();
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end = filterEnd ? filterEnd.value : '2099-12-31';
        const bid = resolveBranchId(filterBranch);

        const result = await callMasterMembershipsRpc(supabase, companyId, bid, start, end);
        const report = result.mem_overview || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const plans = report.plan_tiers || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards
        // Card 1: Total Membership Revenue
        data.kpi1.value = fmtINR(k.total_revenue ?? 0);
        data.kpi1.subHtml = `
            <span style="display:inline-flex;align-items:center;gap:3px;color:#b45309;font-weight:600;background:#fef3c7;padding:1px 6px;border-radius:4px;font-size:0.72rem;">
                -${fmtINR(k.total_discounts ?? 0)} Disc
            </span>
            <span style="display:inline-flex;align-items:center;gap:3px;color:#dc2626;font-weight:600;background:#fee2e2;padding:1px 6px;border-radius:4px;font-size:0.72rem;">
                -${fmtINR(k.total_refunds ?? 0)} Ref
            </span>
        `;

        // Card 2: Active Member Base
        data.kpi2.value = `${k.active_members ?? 0} Members`;
        data.kpi2.subHtml = `<span style="color:#059669;font-weight:600;font-size:0.75rem;">${k.total_clients_pct ?? '0%'} of client base</span>`;

        // Card 3: Total Benefits Redeemed
        data.kpi3.value = fmtINR(k.benefits_redeemed ?? 0);
        data.kpi3.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Across ${k.benefits_visits_count ?? 0} visits</span>`;

        // Card 4: Program Value ROI
        data.kpi4.value = `${k.program_multiplier ?? '0x'} Return`;
        data.kpi4.subHtml = `<span style="display:inline-flex;align-items:center;gap:3px;color:#059669;font-weight:600;background:#d1fae5;padding:1px 6px;border-radius:4px;font-size:0.72rem;">Profitable Retention</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart
        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Monthly Revenue',
            color: '#7c3aed'
        });

        // 3. Donut Chart
        renderDonutChart(plans.labels, plans.values, {
            centerLabel: 'Active Base',
            centerValue: `${k.active_members ?? 0}`,
            isCurrency: false,
            colors: ['#7c3aed', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b']
        });

        // 4. Data Table — headers: Date & Time | Sale Ref # | Member Name | Plan Name | Validity | Expiry Date | Final Amount | Payment Mode | Sold By Staff | Status
        setupReportTable(data.headers, rows, {
            unitName: 'subscriptions',
            reportFileName: 'Memberships_Overview_Report',
            rowFormatter: (r) => {
                const payMethod = (r.method || 'other').toUpperCase();
                const payBadgeStyle = payMethod === 'UPI' 
                    ? 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;'
                    : payMethod === 'CARD'
                    ? 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
                    : payMethod === 'CASH'
                    ? 'background:#fefce8;color:#a16207;border:1px solid #fef08a;'
                    : 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;';

                return [
                    `<span style="white-space:nowrap;font-size:0.8rem;color:#475569;">${r.datetime}</span>`,
                    `<strong style="color:#7c3aed;font-size:0.82rem;letter-spacing:0.3px;">#${r.ref}</strong>`,
                    `<div><strong>${r.customer}</strong>${r.phone ? `<br><small style="color:#64748b;font-size:0.75rem;">${r.phone}</small>` : ''}</div>`,
                    `<strong>${r.plan}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#f1f5f9;color:#475569;font-weight:600;font-size:0.75rem;">${r.duration} Days</span>`,
                    `<span style="font-size:0.825rem;color:#334155;">${r.expiry}</span>`,
                    `<strong style="color:#059669;font-size:0.9rem;">${fmtINR(r.final_amount)}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;letter-spacing:0.5px;${payBadgeStyle}">${payMethod}</span>`,
                    `<span style="color:#334155;font-weight:500;">${r.staff}</span>`,
                    statusBadge(r.status)
                ];
            }
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 2. Membership Sales & Revenue
async function renderMemSales(data, supabase) {
    const companyId = resolveCompanyId();
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end = filterEnd ? filterEnd.value : '2099-12-31';
        const bid = resolveBranchId(filterBranch);

        const result = await callMasterMembershipsRpc(supabase, companyId, bid, start, end);
        const report = result.mem_sales || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const tenders = report.tenders || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards
        // Card 1: Gross Billed Value
        data.kpi1.value = fmtINR(k.gross_billed ?? 0);
        data.kpi1.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Across ${k.plans_sold ?? 0} plans sold</span>`;

        // Card 2: Plan Discounts Given
        data.kpi2.value = fmtINR(k.discounts_given ?? 0);
        data.kpi2.subHtml = `<span style="color:#b45309;font-weight:600;font-size:0.75rem;">Promo & Welcome Perks</span>`;

        // Card 3: Net Realized Revenue
        data.kpi3.value = fmtINR(k.net_revenue ?? 0);
        data.kpi3.subHtml = `
            <span style="color:#4f46e5;font-weight:600;font-size:0.75rem;">${k.upi_share ?? '0%'} UPI</span>
            <span style="color:#cbd5e1;">•</span>
            <span style="color:#64748b;font-size:0.75rem;">${k.card_share ?? '0%'} Card</span>
        `;

        // Card 4: Average Plan Ticket Size (AOV)
        data.kpi4.value = `${fmtINR(k.aov ?? 0)} / plan`;
        data.kpi4.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Avg duration ${k.avg_duration_days ?? 0} days</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart
        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Collections',
            color: '#3b82f6',
            yAxisTitle: 'Collections (₹) →',
            xAxisTitle: 'Timeline →'
        });

        // 3. Donut Chart
        renderDonutChart(tenders.labels, tenders.values, {
            centerLabel: 'Collected',
            centerValue: fmtINR(k.net_revenue || 185000),
            colors: ['#10b981', '#3b82f6', '#f59e0b']
        });

        // 4. Data Table — headers: Purchase Date | Invoice # | Customer Name | Phone | Plan Name | Validity | Gross Price | Discount | Net Paid | Payment Mode | Sold By (Staff)
        setupReportTable(data.headers, rows, {
            unitName: 'transactions',
            reportFileName: 'Membership_Sales_Report',
            rowFormatter: (r) => {
                const payMethod = (r.method || 'other').toUpperCase();
                const payBadgeStyle = payMethod === 'UPI' 
                    ? 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;'
                    : payMethod === 'CARD'
                    ? 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
                    : payMethod === 'CASH'
                    ? 'background:#fefce8;color:#a16207;border:1px solid #fef08a;'
                    : 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;';

                const discDisplay = (r.disc && Number(r.disc) > 0)
                    ? `<span style="color:#b45309;font-weight:600;">-${fmtINR(r.disc)}</span>${r.disc_name ? `<br><small style="color:#92400e;font-size:0.7rem;">(${r.disc_name})</small>` : ''}`
                    : `<span style="color:#94a3b8;">—</span>`;

                return [
                    fmtDate(r.date),
                    `<strong style="color:#3b82f6;font-size:0.82rem;letter-spacing:0.3px;">#${r.ref}</strong>`,
                    `<strong>${r.customer}</strong>`,
                    `<span style="color:#475569;font-size:0.8rem;">${r.phone || '—'}</span>`,
                    `<strong>${r.plan}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#f1f5f9;color:#475569;font-weight:600;font-size:0.75rem;">${r.duration} Days</span>`,
                    fmtINR(r.gross),
                    discDisplay,
                    `<strong style="color:#059669;font-size:0.9rem;">${fmtINR(r.net)}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;letter-spacing:0.5px;${payBadgeStyle}">${payMethod}</span>`,
                    `<span style="color:#334155;font-weight:500;">${r.staff}</span>`
                ];
            }
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 3. Active Members & Renewal Pipeline
async function renderMemMembers(data, supabase) {
    const companyId = resolveCompanyId();
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end = filterEnd ? filterEnd.value : '2099-12-31';
        const bid = resolveBranchId(filterBranch);

        const result = await callMasterMembershipsRpc(supabase, companyId, bid, start, end);
        const report = result.mem_members || {};
        const k = report.kpis || {};
        const horizon = report.horizon || { labels: [], values: [] };
        const statusSplit = report.status_split || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards
        // Card 1: Total Active Members
        data.kpi1.value = `${k.active_members ?? 0} Members`;
        data.kpi1.subHtml = `<span style="color:#059669;font-weight:600;font-size:0.75rem;">Currently eligible for benefits</span>`;

        // Card 2: Expiring in 30 Days (Urgent Call Target!)
        data.kpi2.value = `${k.expiring_30d ?? 0} Members`;
        data.kpi2.subHtml = `<span style="display:inline-flex;align-items:center;gap:3px;color:#b45309;font-weight:600;background:#fef3c7;padding:1px 6px;border-radius:4px;font-size:0.72rem;">Renewal Call Target</span>`;

        // Card 3: Expired Members
        data.kpi3.value = `${k.expired_count ?? 0} Lapsed`;
        data.kpi3.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Win-back opportunity</span>`;

        // Card 4: Program Retention Rate
        data.kpi4.value = k.retention_rate ?? '0%';
        data.kpi4.subHtml = `<span style="color:#059669;font-weight:600;font-size:0.75rem;">${k.healthy_target ?? '> 75% target'}</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart (Expiry Horizon)
        renderTrendChart(horizon.labels, horizon.values, {
            type: 'bar',
            datasetLabel: 'Members Expiring',
            isCurrency: false,
            color: '#10b981',
            yAxisTitle: 'Members Expiring →',
            xAxisTitle: 'Expiry Window →'
        });

        // 3. Donut Chart (Status Breakdown)
        renderDonutChart(statusSplit.labels, statusSplit.values, {
            centerLabel: 'Member Pool',
            centerValue: `${(k.active_members ?? 0) + (k.expired_count ?? 0)}`,
            isCurrency: false,
            colors: ['#10b981', '#f59e0b', '#64748b', '#ef4444']
        });

        // 4. Data Table — headers: Customer Name | Phone Number | Active Plan | Join Date | Expiry Date | Days Remaining | Salon Visits Made | Total Salon Spend | Branch | Renewal Status
        setupReportTable(data.headers, rows, {
            unitName: 'members',
            reportFileName: 'Members_Directory_Renewals_Report',
            rowFormatter: (r) => {
                const days = Number(r.days_rem || 0);
                let daysBadge = '';
                if (days < 0) {
                    daysBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#f1f5f9;color:#64748b;font-weight:600;font-size:0.75rem;">Expired ${Math.abs(days)}d ago</span>`;
                } else if (days <= 7) {
                    daysBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fee2e2;color:#dc2626;font-weight:700;font-size:0.75rem;">Expires in ${days}d</span>`;
                } else if (days <= 30) {
                    daysBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fef3c7;color:#b45309;font-weight:600;font-size:0.75rem;">Expires in ${days}d</span>`;
                } else {
                    daysBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#d1fae5;color:#065f46;font-weight:600;font-size:0.75rem;">${days} days left</span>`;
                }

                return [
                    `<strong>${r.customer}</strong>`,
                    `<strong style="color:#0f172a;font-family:monospace;letter-spacing:0.3px;">${r.phone || '—'}</strong>`,
                    `<strong>${r.plan}</strong>`,
                    fmtDate(r.join_date),
                    fmtDate(r.expiry_date),
                    daysBadge,
                    `<strong>${r.visits || 0} visits</strong>`,
                    `<strong style="color:#059669;">${fmtINR(r.spend || 0)}</strong>`,
                    `<span style="color:#475569;">${r.branch || 'Main Branch'}</span>`,
                    statusBadge(r.status)
                ];
            }
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 4. Member Benefits & Usage Analysis
async function renderMemUsage(data, supabase) {
    const companyId = resolveCompanyId();
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end = filterEnd ? filterEnd.value : '2099-12-31';
        const bid = resolveBranchId(filterBranch);

        const result = await callMasterMembershipsRpc(supabase, companyId, bid, start, end);
        const report = result.mem_usage || {};
        const k = report.kpis || {};
        const comparison = report.monthly_comparison || { labels: [], values: [] };
        const categories = report.categories || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards
        // Card 1: Discounts Given to Members
        data.kpi1.value = fmtINR(k.discounts_claimed ?? 0);
        data.kpi1.subHtml = `<span style="color:#7c3aed;font-weight:600;font-size:0.75rem;">Total member perks claimed</span>`;

        // Card 2: Member Salon Visits
        data.kpi2.value = `${k.member_visits ?? 0} Visits`;
        data.kpi2.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Avg ${k.avg_visit_spend ? fmtINR(k.avg_visit_spend) : '₹0'} / visit spend</span>`;

        // Card 3: Total Service Spend by Members
        data.kpi3.value = fmtINR(k.total_service_spend ?? 0);
        data.kpi3.subHtml = `<span style="color:#059669;font-weight:600;font-size:0.75rem;">Service & retail billing generated</span>`;

        // Card 4: Member Spend Multiplier
        data.kpi4.value = `${k.spend_multiplier ?? '0x'} Multiplier`;
        data.kpi4.subHtml = `<span style="display:inline-flex;align-items:center;gap:3px;color:#059669;font-weight:600;background:#d1fae5;padding:1px 6px;border-radius:4px;font-size:0.72rem;">Revenue per ₹1 discount</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart (Monthly Service Spend)
        renderTrendChart(comparison.labels, comparison.values, {
            type: 'bar',
            datasetLabel: 'Member Service Spend',
            color: '#8b5cf6',
            yAxisTitle: 'Spend (₹) →',
            xAxisTitle: 'Timeline →'
        });

        // 3. Donut Chart (Benefits by Department)
        renderDonutChart(categories.labels, categories.values, {
            centerLabel: 'Discounts',
            centerValue: fmtINR(k.discounts_claimed ?? 0),
            colors: ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b']
        });

        // 4. Data Table — headers: Date & Time | Booking / Bill Ref | Member Name | Membership Tier | Service / Product | Stylist / Staff | Standard Bill | Member Discount | Amount Paid | Benefit Status
        setupReportTable(data.headers, rows, {
            unitName: 'redemptions',
            reportFileName: 'Member_Benefits_Usage_Report',
            rowFormatter: (r) => [
                `<span style="white-space:nowrap;font-size:0.8rem;color:#475569;">${r.datetime}</span>`,
                `<strong style="color:#7c3aed;font-size:0.82rem;letter-spacing:0.3px;">#${r.ref}</strong>`,
                `<strong>${r.customer}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#ede9fe;color:#6d28d9;font-weight:600;font-size:0.75rem;">${r.plan}</span>`,
                `<strong>${r.service}</strong>`,
                `<span style="color:#334155;font-weight:500;">${r.staff}</span>`,
                fmtINR(r.bill),
                `<strong style="color:#7c3aed;">-${fmtINR(r.discount)}</strong>`,
                `<strong style="color:#059669;font-size:0.9rem;">${fmtINR(r.paid)}</strong>`,
                statusBadge(r.status)
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 5. Cancellations, Churn & Refunds
async function renderMemCancellations(data, supabase) {
    const companyId = resolveCompanyId();
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);

    const loadData = async () => {
        const start = filterStart ? filterStart.value : '2000-01-01';
        const end = filterEnd ? filterEnd.value : '2099-12-31';
        const bid = resolveBranchId(filterBranch);

        const result = await callMasterMembershipsRpc(supabase, companyId, bid, start, end);
        const report = result.mem_cancellations || {};
        const k = report.kpis || {};
        const trend = report.monthly_trend || { labels: [], values: [] };
        const plans = report.plans_breakdown || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards
        // Card 1: Total Cancelled Plans
        data.kpi1.value = `${k.total_cancelled ?? 0} Plans`;
        data.kpi1.subHtml = `<span style="color:#dc2626;font-weight:600;font-size:0.75rem;">Refunded & Cancelled</span>`;

        // Card 2: Total Refund Value
        data.kpi2.value = fmtINR(k.total_refunded ?? 0);
        data.kpi2.subHtml = `<span style="color:#92400e;font-weight:600;background:#fef3c7;padding:1px 6px;border-radius:4px;font-size:0.72rem;">Refund payouts issued</span>`;

        // Card 3: Program Churn Rate
        data.kpi3.value = k.churn_rate ?? '0%';
        data.kpi3.subHtml = `<span style="display:inline-flex;align-items:center;gap:3px;color:#059669;font-weight:600;background:#d1fae5;padding:1px 6px;border-radius:4px;font-size:0.72rem;">Healthy &lt; 5%</span>`;

        // Card 4: Avg Lifespan to Cancel
        data.kpi4.value = `${k.avg_lifespan_days ?? 0} Days`;
        data.kpi4.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Average tenure before cancel</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart
        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Refund Value',
            color: '#f43f5e',
            yAxisTitle: 'Refunds (₹) →',
            xAxisTitle: 'Timeline →'
        });

        // 3. Donut Chart
        renderDonutChart(plans.labels, plans.values, {
            centerLabel: 'Cancelled',
            centerValue: `${k.total_cancelled || 2}`,
            isCurrency: false,
            colors: ['#f43f5e', '#f59e0b', '#64748b']
        });

        // 4. Data Table — headers: Cancellation Date | Original Purchase Date | Purchase Ref # | Customer Name | Phone | Plan Name | Original Paid | Refund Amount | Refund Mode | Days Active | Reason / Notes
        setupReportTable(data.headers, rows, {
            unitName: 'cancellations',
            reportFileName: 'Membership_Cancellations_Report',
            rowFormatter: (r) => [
                fmtDate(r.cancel_date),
                fmtDate(r.purchase_date),
                `<strong style="color:#f43f5e;font-size:0.82rem;letter-spacing:0.3px;">#${r.ref}</strong>`,
                `<strong>${r.customer}</strong>`,
                `<span style="color:#475569;font-size:0.8rem;">${r.phone || '—'}</span>`,
                `<strong>${r.plan}</strong>`,
                fmtINR(r.paid),
                `<strong style="color:#dc2626;">-${fmtINR(r.refund)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fef3c7;color:#92400e;font-weight:600;font-size:0.75rem;">${r.mode}</span>`,
                `<span style="color:#475569;">${r.days_active} days</span>`,
                `<span style="color:#475569;font-size:0.825rem;">${r.reason || '—'}</span>`
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// =============================================================================
// Main Entrypoint
// =============================================================================

export async function render(data, supabase, type) {
    console.log('[memberships] Dispatching render for type:', type);

    switch (type) {
        case 'mem-overview':
        case 'memberships':
        case 'membership':
            await renderMemOverview(data, supabase);
            break;
        case 'mem-sales':
            await renderMemSales(data, supabase);
            break;
        case 'mem-members':
            await renderMemMembers(data, supabase);
            break;
        case 'mem-usage':
            await renderMemUsage(data, supabase);
            break;
        case 'mem-cancellations':
            await renderMemCancellations(data, supabase);
            break;
        default:
            console.warn('[memberships] Unknown report sub-type:', type);
            await renderMemOverview(data, supabase);
            break;
    }
}
