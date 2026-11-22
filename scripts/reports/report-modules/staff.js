// scripts/reports/report-modules/staff.js
// 360-Degree Staff Performance & Intelligence Module
// Sub-Report 1: Staff Overview (Fleet-Wide Team Performance & HR Capacity)
// Sub-Report 2: Staff 360° Insights (Individual Staff Dossier, 3-Stream Revenue & Activity Ledgers)

import { formatCurrency, updateKPIs, updateTable } from './shared.js';

let trendChartInstance = null;
let distChartInstance = null;

// Helper: Safely destroy previous Chart.js instances
function destroyChart(instance) {
    if (instance && typeof instance.destroy === 'function') {
        try { instance.destroy(); } catch (e) { /* ignore */ }
    }
    return null;
}

// Helper: Resolve Company ID
function resolveCompanyId() {
    const c = localStorage.getItem('company_id');
    return (c && c !== 'null' && c !== 'undefined' && c !== 'all') ? c : null;
}

// Helper: Resolve Branch ID
function resolveBranchId(filterBranch) {
    if (filterBranch && filterBranch.value !== undefined) {
        if (filterBranch.value === 'all' || !filterBranch.value) return null;
        return filterBranch.value;
    }
    const stored = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    return (stored && stored !== 'all' && stored !== 'null' && stored !== 'undefined') ? stored : null;
}

// Helper: Safely Unwrap RPC result from Supabase
function unwrapRpcResult(data) {
    if (!data) return {};
    let res = data;
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) { console.warn('[staff] JSON parse warning:', e); }
    }
    if (Array.isArray(res)) {
        res = res[0] || {};
    }
    if (res && typeof res === 'object') {
        if (res.get_staff_report) {
            res = res.get_staff_report;
        } else if (res.staff_report) {
            res = res.staff_report;
        }
    }
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {}
    }
    return (res && typeof res === 'object') ? res : {};
}

// Helper: Call Staff 360° RPC (individual staff dossier — dedicated to Staff 360° Insights page)
async function callStaff360Rpc(supabase, companyId, branchId, start, end, staffId = null) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[staff] Calling get_staff_revenue_stats_across_three_modules with:', { cid, bid, start, end, staffId });
    try {
        const { data, error } = await supabase.rpc('get_staff_revenue_stats_across_three_modules', {
            p_company_id: cid,
            p_staff_id:   staffId || null,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (error) {
            console.warn('[staff] get_staff_revenue_stats_across_three_modules error:', error.message);
            return null;
        }
        return unwrapRpcResult(data);
    } catch (err) {
        console.warn('[staff] Error executing get_staff_revenue_stats_across_three_modules RPC:', err.message);
        return null;
    }
}

// Helper: Call Staff Overview RPC (fleet-wide — Staff Overview page only)
async function callStaffOverviewRpc(supabase, companyId, branchId, start, end) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[staff] Calling get_staff_reports with:', { cid, bid, start, end });
    try {
        const { data, error } = await supabase.rpc('get_staff_reports', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (error) {
            console.warn('[staff] get_staff_reports error:', error.message);
            return null;
        }
        return unwrapRpcResult(data);
    } catch (err) {
        console.warn('[staff] Error executing get_staff_reports RPC:', err.message);
        return null;
    }
}

// ============================================================================
// REUSABLE PAGINATION & TABLE CONTROLLER
// ============================================================================

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
                const cells = Array.isArray(r) ? r : Object.values(r);
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
                html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Previous</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                    } else if (p === currentPage - 2 || p === currentPage + 2) {
                        html += `<span class="page-dots" style="color:#94a3b8;padding:0 4px;font-size:0.85rem;">...</span>`;
                    }
                }
                html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>`;
                paginationControls.innerHTML = html;

                paginationControls.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
                    btn.onclick = () => {
                        const target = parseInt(btn.getAttribute('data-page'));
                        if (!isNaN(target)) renderPage(target);
                    };
                });
            }
        }

        if (window.feather) {
            try { feather.replace(); } catch (e) {}
        }
    }

    // Wire live search
    if (searchInput) {
        if (options.clearSearch !== false) {
            searchInput.value = '';
        }
        if (options.searchPlaceholder) {
            searchInput.placeholder = options.searchPlaceholder;
        }
        searchInput.oninput = (e) => {
            const q = (e.target.value || '').toLowerCase().trim();
            if (!q) {
                filteredRows = [...(rows || [])];
            } else {
                filteredRows = (rows || []).filter(r => {
                    const text = Array.isArray(r)
                        ? r.map(c => String(c).replace(/<[^>]*>?/gm, '')).join(' ').toLowerCase()
                        : JSON.stringify(r).toLowerCase();
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
                const rawCells = Array.isArray(r) ? r : Object.values(r);
                const line = rawCells.map(c => {
                    const plain = String(c).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                    return `"${plain.replace(/"/g, '""')}"`;
                });
                csvLines.push(line.join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${options.reportFileName || 'staff_report'}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        };
    }

    // Wire Print Table
    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    // Initial render
    renderPage(1);
}

// ============================================================================
// 1. SUB-REPORT 1: STAFF OVERVIEW (Macro Salon-Wide Team Capacity & Output)
// ============================================================================

async function renderStaffOverview(data, supabase) {
    console.log('[staff.js] Initializing Sub-Report 1: Staff Overview');

    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Remove any leftover Staff 360 Insights header if user switched sub-reports
    const oldInsightsTop = document.getElementById('staffInsightsTopWrap');
    if (oldInsightsTop) oldInsightsTop.remove();
    const oldHeaderSearch = document.getElementById('staffHeaderSearchWrap');
    if (oldHeaderSearch) oldHeaderSearch.remove();

    const applyStaffCardColors = () => {
        const card1 = document.getElementById('kpiLabel1')?.closest('.kpi-card');
        const card2 = document.getElementById('kpiLabel2')?.closest('.kpi-card');
        const card3 = document.getElementById('kpiLabel3')?.closest('.kpi-card');
        const card4 = document.getElementById('kpiLabel4')?.closest('.kpi-card');

        if (card1) {
            card1.style.borderTop = '3.5px solid #6366f1';
            card1.style.background = 'linear-gradient(180deg, #f5f3ff 0%, #ffffff 32%)';
            card1.style.transition = 'all 0.2s ease';
        }
        if (card2) {
            card2.style.borderTop = '3.5px solid #0284c7';
            card2.style.background = 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 32%)';
            card2.style.transition = 'all 0.2s ease';
        }
        if (card3) {
            card3.style.borderTop = '3.5px solid #10b981';
            card3.style.background = 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 32%)';
            card3.style.transition = 'all 0.2s ease';
        }
        if (card4) {
            card4.style.borderTop = '3.5px solid #f59e0b';
            card4.style.background = 'linear-gradient(180deg, #fffbeb 0%, #ffffff 32%)';
            card4.style.transition = 'all 0.2s ease';
        }

        const val1 = document.getElementById('kpiValue1');
        const val2 = document.getElementById('kpiValue2');
        const val3 = document.getElementById('kpiValue3');
        const val4 = document.getElementById('kpiValue4');
        if (val1) val1.style.color = '#312e81'; // Deep Indigo
        if (val2) val2.style.color = '#0369a1'; // Deep Sky Blue
        if (val3) val3.style.color = '#047857'; // Deep Emerald Green
        if (val4) val4.style.color = '#78350f'; // Warm Amber Brown

        const lbl1 = document.getElementById('kpiLabel1');
        const lbl2 = document.getElementById('kpiLabel2');
        const lbl3 = document.getElementById('kpiLabel3');
        const lbl4 = document.getElementById('kpiLabel4');
        if (lbl1) lbl1.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><i data-feather="users" style="width:13px; height:13px; color:#6366f1;"></i> Total Staff</span>`;
        if (lbl2) lbl2.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><i data-feather="calendar" style="width:13px; height:13px; color:#0284c7;"></i> Average Bookings for staff</span>`;
        if (lbl3) lbl3.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><i data-feather="dollar-sign" style="width:13px; height:13px; color:#10b981;"></i> Total revenue Generated</span>`;
        if (lbl4) lbl4.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><i data-feather="award" style="width:13px; height:13px; color:#f59e0b;"></i> Top Performer</span>`;

        if (window.feather) {
            try { feather.replace(); } catch (e) {}
        }
    };

    const loadStaffOverview = async () => {
        const start = filterStart ? filterStart.value : ((new Date(Date.now() - 30 * 86400000)).toISOString().split('T')[0]);
        const end   = filterEnd   ? filterEnd.value   : (new Date().toISOString().split('T')[0]);
        const bid   = resolveBranchId(filterBranch);

        // Loading state
        updateKPIs(
            { label: 'Total Staff',                value: 'Loading...' },
            { label: 'Average Bookings for staff',  value: 'Loading...' },
            { label: 'Total revenue Generated',    value: 'Loading...' },
            { label: 'Top Performer',              value: 'Loading...' }
        );
        applyStaffCardColors();

        // Call the dedicated Staff Overview RPC
        let report = await callStaffOverviewRpc(supabase, companyId, bid, start, end);

        // Fallback demo dataset aligned to get_staff_reports shape if RPC returns null
        if (!report || (!report.overview_kpis && !report.staff_leaderboard)) {
            report = {
                overview_kpis: {
                    total_staff: 7,
                    active_staff: 4,
                    inactive_staff: 3,
                    activity_window_days: 30,
                    total_completed_bookings: 143,
                    avg_bookings_per_staff: 20.4,
                    gross_total_revenue: 243000,
                    avg_revenue_per_staff: 34714,
                    top_performer_name: 'Priya Sharma',
                    top_performer_revenue: 68400,
                    top_performer_pct: 28
                },
                staff_leaderboard: [
                    { id: 's-001', name: 'Priya Sharma',   role: 'Master Stylist',    status: 'active',   completed_bookings: 42, service_revenue: 52400, retail_sales: 12000, membership_sales: 4000, total_revenue: 68400, net_revenue: 61560, total_refunds: 0, total_discounts: 6840, avg_ticket: 1248 },
                    { id: 's-002', name: 'Rahul Verma',    role: 'Senior Barber',     status: 'active',   completed_bookings: 38, service_revenue: 41800, retail_sales: 7500,  membership_sales: 2000, total_revenue: 51300, net_revenue: 46170, total_refunds: 0, total_discounts: 5130, avg_ticket: 1100 },
                    { id: 's-003', name: 'Ananya Sen',     role: 'Senior Colorist',   status: 'active',   completed_bookings: 29, service_revenue: 38900, retail_sales: 6200,  membership_sales: 0,    total_revenue: 45100, net_revenue: 40590, total_refunds: 0, total_discounts: 4510, avg_ticket: 1341 },
                    { id: 's-004', name: 'Kavita Nair',    role: 'Esthetician',       status: 'active',   completed_bookings: 24, service_revenue: 28400, retail_sales: 8900,  membership_sales: 3000, total_revenue: 40300, net_revenue: 36270, total_refunds: 0, total_discounts: 4030, avg_ticket: 1183 },
                    { id: 's-005', name: 'Vikram Joshi',   role: 'Hair Stylist',      status: 'active',   completed_bookings: 10, service_revenue: 19500, retail_sales: 2400,  membership_sales: 0,    total_revenue: 21900, net_revenue: 19710, total_refunds: 0, total_discounts: 2190, avg_ticket: 1083 },
                    { id: 's-006', name: 'Sneha Patel',    role: 'Nail Technician',   status: 'inactive', completed_bookings: 0,  service_revenue: 0,     retail_sales: 0,     membership_sales: 0,    total_revenue: 0,     net_revenue: 0,     total_refunds: 0, total_discounts: 0,    avg_ticket: 0    },
                    { id: 's-007', name: 'Amit Deshmukh',  role: 'Stylist Assistant', status: 'inactive', completed_bookings: 0,  service_revenue: 0,     retail_sales: 0,     membership_sales: 0,    total_revenue: 0,     net_revenue: 0,     total_refunds: 0, total_discounts: 0,    avg_ticket: 0    }
                ]
            };
        }

        // Extract the two top-level keys from get_staff_reports
        const kpis        = report.overview_kpis   || {};
        const leaderboard = report.staff_leaderboard || [];

        // ── STAT CARD 1: Total Staff — fixed 30-day activity window ──────────
        const totalStaff    = kpis.total_staff    !== undefined ? kpis.total_staff    : leaderboard.length;
        const activeStaff   = kpis.active_staff   !== undefined ? kpis.active_staff   : leaderboard.filter(s => (s.completed_bookings || 0) > 0).length;
        const inactiveStaff = kpis.inactive_staff !== undefined ? kpis.inactive_staff : Math.max(0, totalStaff - activeStaff);

        // ── STAT CARD 2: Average Bookings / Staff ────────────────────────────
        const totalCompletedBookings = kpis.total_completed_bookings !== undefined
            ? kpis.total_completed_bookings
            : leaderboard.reduce((sum, s) => sum + (s.completed_bookings || 0), 0);

        const avgBookingsPerStaff = kpis.avg_bookings_per_staff !== undefined
            ? parseFloat(kpis.avg_bookings_per_staff).toFixed(1)
            : (totalStaff > 0 ? (totalCompletedBookings / totalStaff).toFixed(1) : '0');

        // ── STAT CARD 3: Total Revenue Generated ─────────────────────────────
        const totalRevenue = kpis.gross_total_revenue !== undefined
            ? kpis.gross_total_revenue
            : leaderboard.reduce((sum, s) => sum + (s.total_revenue || 0), 0);

        const avgRevenuePerStaff = kpis.avg_revenue_per_staff !== undefined
            ? kpis.avg_revenue_per_staff
            : (totalStaff > 0 ? Math.round(totalRevenue / totalStaff) : 0);

        // ── STAT CARD 4: Top Performer ────────────────────────────────────────
        const topPerformerName    = kpis.top_performer_name    || (leaderboard[0] ? leaderboard[0].name           : '—');
        const topPerformerRevenue = kpis.top_performer_revenue !== undefined ? kpis.top_performer_revenue : (leaderboard[0] ? leaderboard[0].total_revenue || 0 : 0);
        const topPerformerPct     = kpis.top_performer_pct     !== undefined
            ? kpis.top_performer_pct
            : (totalRevenue > 0 ? ((topPerformerRevenue / totalRevenue) * 100).toFixed(1) : 0);

        // 1. Update 4 Stat Cards with vibrant, distinctive colors and pill badges
        updateKPIs(
            {
                label: 'Total Staff',
                value: String(totalStaff),
                subHtml: `
                    <span style="display:inline-flex; align-items:center; gap:5px; background:#ecfdf5; color:#065f46; font-weight:700; padding:2px 8px; border-radius:6px; font-size:0.75rem; border:1px solid #a7f3d0;">
                        <span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block;"></span>${activeStaff} Active
                    </span>
                    <span style="display:inline-flex; align-items:center; gap:5px; background:#f8fafc; color:#64748b; font-weight:600; padding:2px 8px; border-radius:6px; font-size:0.75rem; border:1px solid #e2e8f0;">
                        <span style="width:6px; height:6px; border-radius:50%; background:#94a3b8; display:inline-block;"></span>${inactiveStaff} Inactive
                    </span>
                    <span style="color:#94a3b8; font-size:0.72rem; margin-left:auto; font-weight:500;">Last 30d</span>
                `
            },
            {
                label: 'Average Bookings for staff',
                value: String(avgBookingsPerStaff),
                subHtml: `
                    <span style="display:inline-flex; align-items:center; gap:5px; background:#e0f2fe; color:#0369a1; font-weight:700; padding:2px 8px; border-radius:6px; font-size:0.75rem; border:1px solid #bae6fd;">
                        <i data-feather="check-circle" style="width:12px; height:12px;"></i>${totalCompletedBookings} Bookings
                    </span>
                    <span style="color:#64748b; font-size:0.74rem; font-weight:500;">across <strong style="color:#0f172a;">${totalStaff} staff</strong></span>
                `
            },
            {
                label: 'Total revenue Generated',
                value: formatCurrency(totalRevenue),
                subHtml: `
                    <span style="display:inline-flex; align-items:center; gap:4px; background:#ecfdf5; color:#047857; font-weight:700; padding:2px 8px; border-radius:6px; font-size:0.75rem; border:1px solid #a7f3d0;">
                        <i data-feather="trending-up" style="width:12px; height:12px;"></i>Avg / Staff:
                    </span>
                    <strong style="color:#047857; font-size:0.8rem; font-weight:700;">${formatCurrency(avgRevenuePerStaff)}</strong>
                `
            },
            {
                label: 'Top Performer',
                value: topPerformerName,
                subHtml: topPerformerRevenue > 0
                    ? `
                        <span style="display:inline-flex; align-items:center; gap:4px; background:#fef3c7; color:#92400e; font-weight:700; padding:2px 8px; border-radius:6px; font-size:0.75rem; border:1px solid #fde68a;">
                            <i data-feather="dollar-sign" style="width:12px; height:12px;"></i>${formatCurrency(topPerformerRevenue)}
                        </span>
                        <span style="display:inline-flex; align-items:center; background:#f3e8ff; color:#6b21a8; font-weight:700; padding:2px 8px; border-radius:6px; font-size:0.73rem; border:1px solid #e9d5ff;">
                            ${topPerformerPct}% of total sales
                        </span>
                      `
                    : `<span style="color:#94a3b8; font-size:0.75rem;">No sales recorded</span>`
            }
        );

        // Re-apply colorful borders, gradients, and icons
        applyStaffCardColors();

        // 2. Render Left Chart: Revenue Performance Stacked Bar — Top 10 Staff
        const leftCanvas = document.getElementById('trendChart');
        if (leftCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);

            const top10        = leaderboard.slice(0, 10);
            const barLabels    = top10.map(s => s.name);
            const serviceData  = top10.map(s => s.service_revenue   || 0);
            const retailData   = top10.map(s => s.retail_sales       || 0);
            const memberData   = top10.map(s => s.membership_sales   || 0);

            trendChartInstance = new Chart(leftCanvas, {
                type: 'bar',
                data: {
                    labels: barLabels,
                    datasets: [
                        {
                            label: 'Service Revenue',
                            data: serviceData,
                            backgroundColor: '#3b82f6',
                            borderRadius: 3,
                            stack: 'revenue'
                        },
                        {
                            label: 'Retail Sales',
                            data: retailData,
                            backgroundColor: '#f59e0b',
                            borderRadius: 3,
                            stack: 'revenue'
                        },
                        {
                            label: 'Membership Sales',
                            data: memberData,
                            backgroundColor: '#8b5cf6',
                            borderRadius: 3,
                            stack: 'revenue'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 11, weight: '600', family: 'Inter' },
                                boxWidth: 12,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
                            }
                        },
                        title: {
                            display: true,
                            text: 'Revenue Performance by Staff — Top 10',
                            font: { size: 13, weight: '600', family: 'Inter' },
                            color: '#334155',
                            padding: { bottom: 8 }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false },
                            ticks: {
                                color: '#64748b',
                                maxRotation: 30,
                                font: { size: 10 }
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: {
                                color: '#64748b',
                                callback: (v) => formatCurrency(v)
                            },
                            grid: { color: '#f1f5f9' }
                        }
                    }
                }
            });
        }

        // 3. Render Right Chart: Staff Status Distribution Donut — 2 slices: Active / Inactive
        const distCanvas = document.getElementById('distributionChart');
        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const totalDistStaff = kpis.total_staff || leaderboard.length || totalStaff;
            const activeCount    = leaderboard.filter(s => (s.completed_bookings || 0) > 0).length
                                   || (kpis.active_staff !== undefined ? kpis.active_staff : activeStaff);
            const inactiveCount  = Math.max(0, totalDistStaff - activeCount);

            const activePct   = totalDistStaff > 0 ? Math.round((activeCount   / totalDistStaff) * 100) : 0;
            const inactivePct = totalDistStaff > 0 ? Math.round((inactiveCount / totalDistStaff) * 100) : 0;

            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = String(totalDistStaff);
            if (centerLbl) centerLbl.textContent = 'Staff';

            const statusSlices = [
                { label: 'Active Staff',   count: activeCount,   pct: activePct,   color: '#10b981' }, // Green
                { label: 'Inactive Staff', count: inactiveCount, pct: inactivePct, color: '#94a3b8' }  // Grey
            ];

            distChartInstance = new Chart(distCanvas, {
                type: 'doughnut',
                data: {
                    labels: statusSlices.map(s => s.label),
                    datasets: [{
                        data: statusSlices.map(s => s.count),
                        backgroundColor: statusSlices.map(s => s.color),
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
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
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${statusSlices[ctx.dataIndex].pct}%)`
                            }
                        }
                    }
                }
            });

            // Render Donut Legend (2 items — Active & Inactive)
            const legendEl = document.getElementById('donutLegend');
            if (legendEl) {
                legendEl.innerHTML = statusSlices.map(d => `
                    <div class="donut-legend-item" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:6px 10px; background:#f8fafc; border-radius:8px; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="donut-legend-dot" style="background-color: ${d.color}; width:9px; height:9px; border-radius:50%; display:inline-block;"></span>
                            <span style="font-weight:600; color:#334155; font-size:0.82rem;">${d.label}</span>
                        </div>
                        <div style="font-weight:700; color:#0f172a; font-size:0.82rem;">
                            ${d.count} <span style="font-weight:500; color:#64748b; font-size:0.75rem;">(${d.pct}%)</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 4. Render Table with Cohort Tabs
        renderStaffOverviewTabs(leaderboard);
    };

    const renderStaffOverviewTabs = (staffList) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        let tabBar = document.getElementById('staffOverviewTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'staffOverviewTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        // Tab filter logic — no on_leave concept
        const topPerformers  = staffList.filter(s => (s.total_revenue || 0) > 0)
            .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
        const activeStaffTab = staffList.filter(s => (s.completed_bookings || 0) > 0);
        const inactiveTab    = staffList.filter(s => (s.completed_bookings || 0) === 0);

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="all">
                All Staff <span class="tab-badge">${staffList.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="top">
                Top Performers <span class="tab-badge">${topPerformers.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="active">
                Active Staff <span class="tab-badge">${activeStaffTab.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="inactive">
                Inactive <span class="tab-badge">${inactiveTab.length}</span>
            </button>
        `;

        const buildRow = (s) => {
            const initial     = (s.name || 'S').charAt(0).toUpperCase();
            const isActive    = (s.completed_bookings || 0) > 0;
            const statusClass = isActive ? 'completed' : 'cancelled';
            const statusLabel = isActive ? 'Active' : 'Inactive';

            return [
                // 1. Staff Member
                `<div style="display:flex; align-items:center; gap:9px;">
                    <span style="width:30px; height:30px; border-radius:50%; background:#e0e7ff; color:#3730a3; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${initial}</span>
                    <div>
                        <strong style="color:#0f172a; display:block;">${s.name}</strong>
                    </div>
                </div>`,
                // 2. Bookings
                `<strong style="color:#0f172a;">${s.completed_bookings || 0}</strong>`,
                // 3. Service Rev
                formatCurrency(s.service_revenue  || 0),
                // 4. Retail Sales
                formatCurrency(s.retail_sales      || 0),
                // 5. Membership Sales
                formatCurrency(s.membership_sales  || 0),
                // 6. Avg Ticket
                formatCurrency(s.avg_ticket        || 0),
                // 7. Total Revenue
                `<strong style="color:#059669;">${formatCurrency(s.total_revenue || 0)}</strong>`,
                // 8. Discount Given
                (s.total_discounts || 0) > 0
                    ? `<span style="color:#dc2626; font-weight:600;">${formatCurrency(s.total_discounts)}</span>`
                    : `<span style="color:#94a3b8;">—</span>`,
                // 9. Total Refunds
                (s.total_refunds || 0) > 0
                    ? `<span style="color:#dc2626; font-weight:600;">−${formatCurrency(s.total_refunds)}</span>`
                    : `<span style="color:#94a3b8;">—</span>`,
                // 10. Net Revenue
                `<strong style="color:#0369a1;">${formatCurrency(s.net_revenue || 0)}</strong>`,
                // 11. Status
                `<span class="status-pill ${statusClass}">${statusLabel}</span>`,
                // 12. Action
                `<a href="report-detail.html?type=staff-insights&staffId=${s.id}&cat=staff" class="btn-view-360">
                    View 360° <i data-feather="arrow-right"></i>
                </a>`
            ];
        };

        const headers = [
            'Staff Member', 'Bookings',
            'Service Rev', 'Retail Sales', 'Membership Sales',
            'Avg Ticket', 'Total Revenue',
            'Discount Given', 'Total Refunds', 'Net Revenue',
            'Status', 'Action'
        ];

        const tabDatasets = {
            all: {
                title: 'All Staff Members — Full Leaderboard',
                unitName: 'staff members',
                fileName: 'All_Staff_Report',
                rows: staffList.map(buildRow)
            },
            top: {
                title: 'Top Performing Staff Leaderboard',
                unitName: 'top performers',
                fileName: 'Top_Staff_Leaderboard',
                rows: topPerformers.map(buildRow)
            },
            active: {
                title: 'Active Staff (Had Bookings in Period)',
                unitName: 'active staff',
                fileName: 'Active_Staff_Report',
                rows: activeStaffTab.map(buildRow)
            },
            inactive: {
                title: 'Inactive Staff (No Bookings in Period)',
                unitName: 'inactive staff',
                fileName: 'Inactive_Staff_Report',
                rows: inactiveTab.map(buildRow)
            }
        };

        const activateTab = (tabKey) => {
            tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
            });

            const config = tabDatasets[tabKey] || tabDatasets.all;
            const titleEl = document.getElementById('tableTitleText');
            if (titleEl) titleEl.textContent = config.title;

            setupReportTable(headers, config.rows, {
                unitName: config.unitName,
                reportFileName: config.fileName,
                searchPlaceholder: 'Search staff by name, role, phone, email...',
                pageSize: 10
            });
        };

        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.getAttribute('data-tab');
                activateTab(tabKey);
            });
        });

        activateTab('all');
    };

    if (btnApply) {
        btnApply.onclick = loadStaffOverview;
    }

    await loadStaffOverview();
}

// ============================================================================
// 2. SUB-REPORT 2: STAFF 360° INSIGHTS (Individual Dossier & 3-Stream Ledgers)
// ============================================================================

async function renderStaffInsights(data, supabase) {
    console.log('[staff.js] Initializing Sub-Report 2: Staff 360° Insights');

    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Read target staffId from URL query string
    const urlParams = new URLSearchParams(window.location.search);
    let targetStaffId = urlParams.get('staffId') || null;

    // Remove any leftover Overview tab bar if user switched sub-reports
    const oldOverviewTabs = document.getElementById('staffOverviewTabsBar');
    if (oldOverviewTabs) oldOverviewTabs.remove();

    // ── Inject Top Search & Staff Dossier Container ─────────────────────────
    let topWrap = document.getElementById('staffInsightsTopWrap');
    if (!topWrap) {
        topWrap = document.createElement('div');
        topWrap.id = 'staffInsightsTopWrap';
        topWrap.className = 'cust-insights-top-wrap';

        const kpiRow = document.getElementById('kpiRow');
        if (kpiRow && kpiRow.parentElement) {
            kpiRow.parentElement.insertBefore(topWrap, kpiRow);
        }
    }

    // ── Inject Search Bar into header filter row (LHS of branch selector) ───
    let headerSearchWrap = document.getElementById('staffHeaderSearchWrap');
    if (!headerSearchWrap) {
        headerSearchWrap = document.createElement('div');
        headerSearchWrap.id = 'staffHeaderSearchWrap';
        headerSearchWrap.className = 'cust-search-bar-wrap';
        headerSearchWrap.style.cssText = 'position:relative; min-width:220px; max-width:300px;';
        headerSearchWrap.innerHTML = `
            <div class="cust-search-input-box" style="border:1px solid #e2e8f0; border-radius:8px; background:#fff; display:flex; align-items:center; gap:7px; padding:5px 10px; height:36px;">
                <i data-feather="search" style="width:14px;height:14px;color:#94a3b8;flex-shrink:0;"></i>
                <input type="text" id="staffProfileSearchInput"
                    placeholder="Search staff..."
                    autocomplete="off"
                    style="border:none; outline:none; font-size:0.82rem; color:#0f172a; background:transparent; width:100%;">
            </div>
            <div class="cust-search-dropdown" id="staffSearchDropdown" style="display:none;"></div>
        `;

        // Prepend before the branch filter pill
        const headerActions = document.getElementById('headerRightActions');
        const branchPill    = document.getElementById('branchFilterPill');
        if (headerActions && branchPill) {
            headerActions.insertBefore(headerSearchWrap, branchPill);
        } else if (headerActions) {
            headerActions.prepend(headerSearchWrap);
        }
        if (window.feather) feather.replace();
    }

    const loadStaffProfile = async (staffIdToLoad) => {
        const start = filterStart ? filterStart.value : ((new Date(Date.now() - 180 * 86400000)).toISOString().split('T')[0]);
        const end   = filterEnd   ? filterEnd.value   : (new Date().toISOString().split('T')[0]);
        const bid   = resolveBranchId(filterBranch);

        updateKPIs(
            { label: 'Total Revenue by Staff',  value: 'Loading...' },
            { label: 'Bookings Revenue',        value: 'Loading...' },
            { label: 'Product Sales Revenue',   value: 'Loading...' },
            { label: 'Membership Sales',        value: 'Loading...' }
        );

        let report = await callStaff360Rpc(supabase, companyId, bid, start, end, staffIdToLoad);

        // If no staffId was passed (or no profile in report), auto-select top staff from directory and load their 360 profile
        if ((!staffIdToLoad || !report || !report.profile) && report && Array.isArray(report.staff_directory) && report.staff_directory.length > 0) {
            const firstStaff = report.staff_directory[0];
            targetStaffId = firstStaff.id;
            try {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('staffId', targetStaffId);
                window.history.replaceState({}, '', newUrl);
            } catch (e) {}
            return await loadStaffProfile(targetStaffId);
        }

        // If a profile was returned, sync URL with the active staff ID
        if (report && report.profile && report.profile.id) {
            targetStaffId = report.profile.id;
            try {
                const newUrl = new URL(window.location.href);
                if (newUrl.searchParams.get('staffId') !== targetStaffId) {
                    newUrl.searchParams.set('staffId', targetStaffId);
                    window.history.replaceState({}, '', newUrl);
                }
            } catch (e) {}
        }

        // Fallback demo/initial data if RPC not yet deployed
        if (!report || !report.profile) {
            report = {
                profile: {
                    id: staffIdToLoad || 's-001',
                    name: 'Priya Sharma',
                    role: 'Master Stylist',
                    phone: '+91 98765 43210',
                    email: 'priya.s@salon.com',
                    joined: '12 Jan 2024',
                    status: 'active',
                    services_offered: 'Hair Cut, Hair Coloring, Keratin Treatment, Balayage',
                    notes: 'Top revenue generator across hair styling & retail cross-selling.'
                },
                spend_kpis: {
                    total_revenue: 68400,
                    total_revenue_share_pct: 28.5,
                    bookings_revenue: 52400,
                    bookings_staff_pct: 76.6,
                    products_revenue: 12000,
                    products_staff_pct: 17.5,
                    memberships_revenue: 4000,
                    memberships_staff_pct: 5.9
                },
                monthly_trend: {
                    months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                    bookings:    [7800, 8400, 9200, 8900, 9100, 9000],
                    products:    [1500, 2000, 2400, 1800, 2100, 2200],
                    memberships: [0,    1000, 0,    1000, 1000, 1000]
                },
                revenue_mix: {
                    total: 68400,
                    bookings_val: 52400,
                    bookings_pct: 76.6,
                    products_val: 12000,
                    products_pct: 17.5,
                    memberships_val: 4000,
                    memberships_pct: 5.9
                },
                ledger: {
                    bookings: [
                        {
                            col_datetime: '18 Oct 2026, 11:30 AM',
                            col_service: 'Balayage & Hair Spa',
                            col_customer: 'Ananya Roy',
                            col_gross: 4500,
                            col_discount: '-₹500 (Promo)',
                            col_final: 4000,
                            col_payment: 'UPI',
                            col_status: 'Completed'
                        },
                        {
                            col_datetime: '16 Oct 2026, 03:00 PM',
                            col_service: 'Keratin Smoothing',
                            col_customer: 'Kavita Iyer',
                            col_gross: 6500,
                            col_discount: '—',
                            col_final: 6500,
                            col_payment: 'Card',
                            col_status: 'Completed'
                        },
                        {
                            col_datetime: '14 Oct 2026, 10:00 AM',
                            col_service: 'Signature Haircut',
                            col_customer: 'Meera Nair',
                            col_gross: 1200,
                            col_discount: '—',
                            col_final: 1200,
                            col_payment: 'Cash',
                            col_status: 'Completed'
                        }
                    ],
                    products: [
                        {
                            col_date: '18 Oct 2026',
                            col_sale_ref: 'POS-2026-1042',
                            col_customer: 'Ananya Roy',
                            col_products: 'Moroccanoil Treatment 100ml, Sulfate-free Shampoo',
                            col_categories: 'Hair Care',
                            col_qty: 2,
                            col_gross: 3800,
                            col_discount: '-₹300 (VIP Disc)',
                            col_final: 3500,
                            col_payment: 'UPI'
                        },
                        {
                            col_date: '15 Oct 2026',
                            col_sale_ref: 'POS-2026-1031',
                            col_customer: 'Rhea Kapoor',
                            col_products: 'Argan Hair Mask 250ml',
                            col_categories: 'Hair Care',
                            col_qty: 1,
                            col_gross: 2200,
                            col_discount: '—',
                            col_final: 2200,
                            col_payment: 'Card'
                        }
                    ],
                    memberships: [
                        {
                            col_purchase_date: '05 Oct 2026',
                            col_plan: 'Gold Annual Care',
                            col_customer: 'Ananya Roy',
                            col_duration: '12 Months',
                            col_expiry_date: '04 Oct 2027',
                            col_plan_price: 5000,
                            col_discount: '-₹1000 (Festive)',
                            col_final: 4000,
                            col_payment: 'UPI',
                            col_status: 'Active'
                        }
                    ]
                },
                staff_directory: [
                    { id: 's-001', name: 'Priya Sharma', role: 'Master Stylist', phone: '+91 98765 43210', email: 'priya.s@salon.com' },
                    { id: 's-002', name: 'Rahul Verma', role: 'Senior Barber', phone: '+91 98450 12345', email: 'rahul.v@salon.com' },
                    { id: 's-003', name: 'Ananya Sen', role: 'Senior Colorist', phone: '+91 97112 34567', email: 'ananya.sen@salon.com' },
                    { id: 's-004', name: 'Kavita Nair', role: 'Esthetician', phone: '+91 96543 21098', email: 'kavita.n@salon.com' }
                ]
            };
        }

        const profile     = report.profile || {};
        const kpis        = report.spend_kpis || {};
        const trend       = report.monthly_trend || {};
        const mix         = report.revenue_mix || {};
        const ledger      = report.ledger || {};
        const staffDirect = report.staff_directory || [];

        // 1. Render Top Search & Staff Dossier Header Card
        renderTopSearchAndDossier(profile, staffDirect);

        // 2. Render 4 Stat Cards with Sub-Metrics
        const bksShare = kpis.bookings_staff_pct !== undefined ? kpis.bookings_staff_pct : (mix.bookings_pct || 0);
        const prodsShare = kpis.products_staff_pct !== undefined ? kpis.products_staff_pct : (mix.products_pct || 0);
        const memsShare = kpis.memberships_staff_pct !== undefined ? kpis.memberships_staff_pct : (mix.memberships_pct || 0);

        updateKPIs(
            {
                label: 'Total Revenue by Staff',
                value: formatCurrency(kpis.total_revenue || 0),
                subHtml: `<span style="color:#059669; font-weight:700;">${kpis.total_revenue_share_pct || 0}% of all salon revenue</span>`
            },
            {
                label: 'Bookings Revenue',
                value: formatCurrency(kpis.bookings_revenue || 0),
                subHtml: `<span style="color:#3b82f6; font-weight:700;">${bksShare}% of staff's total revenue</span>`
            },
            {
                label: 'Product Sales Revenue',
                value: formatCurrency(kpis.products_revenue || 0),
                subHtml: `<span style="color:#f59e0b; font-weight:700;">${prodsShare}% of staff's total revenue</span>`
            },
            {
                label: 'Membership Sales',
                value: formatCurrency(kpis.memberships_revenue || 0),
                subHtml: `<span style="color:#8b5cf6; font-weight:700;">${memsShare}% of staff's total revenue</span>`
            }
        );

        // 3. Render Revenue Breakdown Cards (between KPIs and charts)
        renderRevenueBreakdownCards();

        // 4. Render Left Chart: 3-Bar Monthly Spend Breakdown
        const leftCanvas = document.getElementById('trendChart');
        if (leftCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);
            const months = trend.months || ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
            const bkData   = trend.bookings || [];
            const prData   = trend.products || [];
            const memData  = trend.memberships || [];

            trendChartInstance = new Chart(leftCanvas, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [
                        {
                            label: 'Bookings Revenue',
                            data: bkData,
                            backgroundColor: '#3b82f6',
                            borderRadius: 5,
                            barPercentage: 0.8,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Product Sales',
                            data: prData,
                            backgroundColor: '#f59e0b',
                            borderRadius: 5,
                            barPercentage: 0.8,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Membership Sales',
                            data: memData,
                            backgroundColor: '#8b5cf6',
                            borderRadius: 5,
                            barPercentage: 0.8,
                            categoryPercentage: 0.8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 11, weight: '600', family: 'Inter' },
                                boxWidth: 12,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#64748b',
                                callback: (v) => formatCurrency(v)
                            },
                            grid: { color: '#f1f5f9' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b' }
                        }
                    }
                }
            });
        }

        // 4. Render Right Chart: Personal Revenue Mix Donut Chart
        const distCanvas = document.getElementById('distributionChart');
        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const totalDone = mix.total || kpis.total_revenue || 0;
            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = formatCurrency(totalDone);
            if (centerLbl) centerLbl.textContent = 'Total Sales';

            const personalSlices = [
                { label: 'Booking Sales',    val: mix.bookings_val || 0,    pct: mix.bookings_pct || 0,    color: '#3b82f6' },
                { label: 'Product Sales',    val: mix.products_val || 0,    pct: mix.products_pct || 0,    color: '#f59e0b' },
                { label: 'Membership Sales', val: mix.memberships_val || 0, pct: mix.memberships_pct || 0, color: '#8b5cf6' }
            ];

            distChartInstance = new Chart(distCanvas, {
                type: 'doughnut',
                data: {
                    labels: personalSlices.map(s => s.label),
                    datasets: [{
                        data: personalSlices.map(s => s.val),
                        backgroundColor: personalSlices.map(s => s.color),
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
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
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${personalSlices[ctx.dataIndex].pct}%)`
                            }
                        }
                    }
                }
            });

            // Donut legend
            const legendEl = document.getElementById('donutLegend');
            if (legendEl) {
                legendEl.innerHTML = personalSlices.map(d => `
                    <div class="donut-legend-item" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:6px 10px; background:#f8fafc; border-radius:8px; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="donut-legend-dot" style="background-color: ${d.color}; width:9px; height:9px; border-radius:50%; display:inline-block;"></span>
                            <span style="font-weight:600; color:#334155; font-size:0.82rem;">${d.label}</span>
                        </div>
                        <div style="font-weight:700; color:#0f172a; font-size:0.82rem;">
                            ${formatCurrency(d.val)} <span style="font-weight:500; color:#64748b; font-size:0.75rem;">(${d.pct}%)</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 5. Render 3 Activity Tabs (Booking Sales, Product Sales, Membership Sales)
        renderStaffActivityTabs(profile, ledger);
    };

    // ── Revenue Breakdown Cards (3 stream cards between KPIs and charts) ─────
    const renderRevenueBreakdownCards = () => {
        // Remove any existing breakdown row so it's always fresh on re-render
        const existing = document.getElementById('staffRevenueBreakdownRow');
        if (existing) existing.remove();

        // Static demo data — backend integration to follow later
        const bk = {
            completed_count:   42,  completed_rev:   52400,
            cancelled_count:   8,   cancelled_missed: 9600,
            noshow_count:      3,   noshow_missed:    3600,
            refunded_count:    2,   refunded_amount:  1798,
            discount_count:    5,   discount_amount:  100
        };
        bk.gross = bk.completed_rev + bk.refunded_amount + bk.discount_amount;
        bk.net   = bk.gross - bk.refunded_amount - bk.discount_amount;

        const ps = {
            sold_units:        24,  sold_rev:         8090,
            refunded_units:    2,   refunded_amount:  0,
            discount_sales:    3,   discount_amount:  0
        };
        ps.gross = ps.sold_rev + ps.refunded_amount + ps.discount_amount;
        ps.net   = ps.gross - ps.refunded_amount - ps.discount_amount;

        const ms = {
            sold_count:        0,   sold_rev:         0,
            refunded_count:    0,   refunded_amount:  0,
            discount_count:    0,   discount_amount:  0
        };
        ms.gross = ms.sold_rev + ms.refunded_amount + ms.discount_amount;
        ms.net   = ms.gross - ms.refunded_amount - ms.discount_amount;

        // Helper to build one breakdown card
        const buildCard = (title, accentColor, iconName, rows, gross, net) => {
            const rowsHtml = rows.map(r => `
                <div style="display:flex; justify-content:space-between; align-items:center;
                            padding:7px 0; border-bottom:1px solid #f1f5f9;">
                    <!-- LHS Column: Dot + Label on left, Count Badge on right (aligned column) -->
                    <div style="display:flex; align-items:center; justify-content:space-between;
                                flex:1.15; min-width:0; padding-right:10px;">
                        <div style="display:flex; align-items:center; gap:7px; min-width:0;">
                            <span style="width:7px; height:7px; border-radius:50%;
                                         background:${r.dot}; display:inline-block; flex-shrink:0;"></span>
                            <span style="font-size:0.78rem; color:#475569; font-weight:500;
                                         white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.label}</span>
                        </div>
                        ${r.count !== undefined
                            ? `<span style="font-size:0.73rem; background:#f1f5f9; color:#475569;
                                           font-weight:600; padding:1px 6px; border-radius:6px;
                                           min-width:24px; text-align:center; flex-shrink:0; margin-left:6px;">${r.count}</span>`
                            : ''}
                    </div>

                    <!-- RHS Column: Metric Description on left, Rupee Value on right (aligned column) -->
                    <div style="display:flex; align-items:center; justify-content:space-between;
                                flex:0.85; min-width:0; padding-left:10px; border-left:1px solid #f1f5f9;">
                        <span style="font-size:0.75rem; color:#64748b; font-weight:500;
                                     white-space:nowrap;">${r.metric}</span>
                        <span style="font-size:0.82rem; font-weight:700; color:${r.valueColor};
                                     flex-shrink:0; margin-left:6px; text-align:right;">${formatCurrency(r.value)}</span>
                    </div>
                </div>
            `).join('');

            return `
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px;
                            border-top:3.5px solid ${accentColor}; padding:18px 20px;
                            flex:1; min-width:280px; display:flex; flex-direction:column; gap:0;">
                    <!-- Card Header -->
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                        <div style="width:32px; height:32px; border-radius:8px;
                                    background:${accentColor}18; display:flex; align-items:center;
                                    justify-content:center; flex-shrink:0;">
                            <i data-feather="${iconName}" style="width:16px; height:16px; color:${accentColor};"></i>
                        </div>
                        <h4 style="font-size:0.88rem; font-weight:700; color:#0f172a; margin:0;">${title}</h4>
                    </div>
                    <!-- Row Items -->
                    <div style="flex:1;">${rowsHtml}</div>
                    <!-- Gross & Net Summary -->
                    <div style="margin-top:12px; padding-top:10px; border-top:2px solid #e2e8f0; display:flex; flex-direction:column; gap:5px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.8rem; font-weight:600; color:#334155;">Gross Revenue</span>
                            <span style="font-size:0.85rem; font-weight:700; color:#059669;">${formatCurrency(gross)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;
                                    background:#f0f9ff; padding:5px 10px; border-radius:8px;">
                            <span style="font-size:0.8rem; font-weight:700; color:#0369a1;">Net Revenue</span>
                            <span style="font-size:0.9rem; font-weight:800; color:#0369a1;">${formatCurrency(net)}</span>
                        </div>
                    </div>
                </div>
            `;
        };

        const bookingsCard = buildCard(
            'Bookings Revenue Breakdown', '#3b82f6', 'calendar',
            [
                { dot: '#10b981', label: 'Completed Bookings', count: bk.completed_count, metric: 'Revenue Gen.',    value: bk.completed_rev,    valueColor: '#059669' },
                { dot: '#f59e0b', label: 'Cancelled Bookings', count: bk.cancelled_count, metric: 'Revenue Missed',  value: bk.cancelled_missed,  valueColor: '#d97706' },
                { dot: '#f97316', label: 'No-show Bookings',   count: bk.noshow_count,    metric: 'Revenue Missed',  value: bk.noshow_missed,     valueColor: '#ea580c' },
                { dot: '#dc2626', label: 'Refunded Bookings',  count: bk.refunded_count,  metric: 'Refunded amt.',   value: bk.refunded_amount,   valueColor: '#dc2626' },
                { dot: '#8b5cf6', label: 'Discounts Given',    count: bk.discount_count,  metric: 'Discounted amt.', value: bk.discount_amount,   valueColor: '#7c3aed' }
            ],
            bk.gross, bk.net
        );

        const retailCard = buildCard(
            'Retail Sales Breakdown', '#f59e0b', 'shopping-bag',
            [
                { dot: '#10b981', label: 'Products Sold',      count: `${ps.sold_units} units`,     metric: 'Revenue Gen.',    value: ps.sold_rev,       valueColor: '#059669' },
                { dot: '#dc2626', label: 'Refunded Products',  count: `${ps.refunded_units} units`, metric: 'Refunded amt.',   value: ps.refunded_amount,valueColor: '#dc2626' },
                { dot: '#8b5cf6', label: 'Discounts Given',    count: `${ps.discount_sales} sales`, metric: 'Discounted amt.', value: ps.discount_amount,valueColor: '#7c3aed' }
            ],
            ps.gross, ps.net
        );

        const memberCard = buildCard(
            'Membership Sales Breakdown', '#8b5cf6', 'credit-card',
            [
                { dot: '#10b981', label: 'Memberships Sold',     count: ms.sold_count,     metric: 'Revenue Gen.',    value: ms.sold_rev,        valueColor: '#059669' },
                { dot: '#dc2626', label: 'Refunded Memberships', count: ms.refunded_count, metric: 'Refunded amt.',   value: ms.refunded_amount, valueColor: '#dc2626' },
                { dot: '#8b5cf6', label: 'Discounts Given',      count: ms.discount_count, metric: 'Discounted amt.', value: ms.discount_amount, valueColor: '#7c3aed' }
            ],
            ms.gross, ms.net
        );

        // Create the wrapper row and inject before .charts-grid
        const row = document.createElement('div');
        row.id = 'staffRevenueBreakdownRow';
        row.style.cssText = 'display:flex; gap:16px; flex-wrap:wrap; margin:16px 0;';
        row.innerHTML = bookingsCard + retailCard + memberCard;

        const chartsGrid = document.querySelector('.charts-grid');
        if (chartsGrid && chartsGrid.parentElement) {
            chartsGrid.parentElement.insertBefore(row, chartsGrid);
        }

        if (window.feather) feather.replace();
    };

    const renderTopSearchAndDossier = (profile, staffDirectory) => {
        const initial = (profile.name || 'S').charAt(0).toUpperCase();

        // Dossier card only — search bar is now in the header filter row
        topWrap.innerHTML = `
            <!-- Staff 360 Dossier Header Card -->
            <div class="cust-profile-dossier">
                <div class="cust-dossier-left">
                    <div class="cust-dossier-avatar" style="background: linear-gradient(135deg, #f59e0b, #d97706);">${initial}</div>
                    <div>
                        <h3 class="cust-dossier-name">${profile.name || 'Staff Member'}</h3>
                        <div class="cust-dossier-meta">
                            <span><i data-feather="briefcase" style="width:12px;height:12px;"></i> ${profile.role || 'Stylist'}</span>
                            <span><i data-feather="phone" style="width:12px;height:12px;"></i> ${profile.phone || '—'}</span>
                            <span><i data-feather="mail" style="width:12px;height:12px;"></i> ${profile.email || '—'}</span>
                            <span><i data-feather="calendar" style="width:12px;height:12px;"></i> Joined: ${profile.joined || '—'}</span>
                        </div>
                    </div>
                </div>
                <div class="cust-dossier-right">
                    <span class="status-pill completed" style="font-size:0.8rem; padding:4px 14px;">
                        ${(profile.status || 'Active').toUpperCase()}
                    </span>
                    <span class="badge-discounts-used" style="background:#eef2ff; border-color:#c7d2fe; color:#3730a3;">
                        <i data-feather="scissors"></i> ${profile.services_offered || 'All Services'}
                    </span>
                </div>
            </div>
        `;

        if (window.feather) feather.replace();

        // Wire progressive search auto-complete (input is now in the header bar)
        const searchInput = document.getElementById('staffProfileSearchInput');
        const dropdown    = document.getElementById('staffSearchDropdown');

        if (searchInput && dropdown) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) {
                    dropdown.style.display = 'none';
                    return;
                }

                const matches = staffDirectory.filter(s =>
                    (s.name || '').toLowerCase().includes(q) ||
                    (s.role || '').toLowerCase().includes(q) ||
                    (s.phone || '').toLowerCase().includes(q) ||
                    (s.email || '').toLowerCase().includes(q)
                );

                if (matches.length === 0) {
                    dropdown.innerHTML = `<div style="padding:12px 16px;color:#94a3b8;font-size:0.85rem;">No staff matches found for "${q}"</div>`;
                    dropdown.style.display = 'block';
                    return;
                }

                dropdown.innerHTML = matches.slice(0, 8).map(s => `
                    <div class="cust-search-item" data-id="${s.id}">
                        <div class="cust-search-left">
                            <div class="cust-avatar-circle" style="background:#fef3c7; color:#92400e;">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                            <div class="cust-info-text">
                                <strong>${s.name} <span style="display:inline-block;margin-left:4px;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;background:#e0e7ff;color:#3730a3;">${s.role || 'Staff'}</span></strong>
                                <span>${s.phone || '—'} • ${s.email || '—'}</span>
                            </div>
                        </div>
                    </div>
                `).join('');

                dropdown.style.display = 'block';

                dropdown.querySelectorAll('.cust-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const selId = item.getAttribute('data-id');
                        if (selId) {
                            const newUrl = new URL(window.location.href);
                            newUrl.searchParams.set('staffId', selId);
                            window.history.pushState({}, '', newUrl);

                            dropdown.style.display = 'none';
                            searchInput.value = '';
                            loadStaffProfile(selId);
                        }
                    });
                });
            });

            document.addEventListener('click', (ev) => {
                if (!headerSearchWrap || !headerSearchWrap.contains(ev.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }
    };

    const renderStaffActivityTabs = (profile, ledger) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        let tabBar = document.getElementById('staffInsightsTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'staffInsightsTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        const rawBookings    = ledger.bookings || [];
        const rawProducts    = ledger.products || [];
        const rawMemberships = ledger.memberships || [];

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="bookings">
                Booking Sales <span class="tab-badge">${rawBookings.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="products">
                Product Sales <span class="tab-badge">${rawProducts.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="memberships">
                Membership Sales <span class="tab-badge">${rawMemberships.length}</span>
            </button>
        `;

        const tabConfigs = {
            bookings: {
                title: `${profile.name || 'Staff Member'}'s Completed Booking Appointments`,
                headers: ['Date & Time', 'Service', 'Customer', 'Gross Amount', 'Discount', 'Final Paid', 'Payment Mode', 'Status'],
                unitName: 'bookings',
                reportFileName: `${(profile.name || 'Staff').replace(/\s+/g, '_')}_Bookings`,
                rows: rawBookings.map(b => [
                    b.col_datetime,
                    `<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">${b.col_service}</span>`,
                    b.col_customer,
                    formatCurrency(b.col_gross),
                    (b.col_discount && b.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${b.col_discount}</span>` : (b.col_discount || '—'),
                    `<strong>${formatCurrency(b.col_final)}</strong>`,
                    b.col_payment || 'Paid',
                    `<span class="status-pill ${(b.col_status || '').toLowerCase() === 'completed' ? 'completed' : 'active'}">${b.col_status || 'Completed'}</span>`
                ])
            },
            products: {
                title: `${profile.name || 'Staff Member'}'s Retail POS Product Sales`,
                headers: ['Sale Date', 'Sale Ref #', 'Customer', 'Product(s)', 'Category', 'Qty', 'Gross Total', 'Discount', 'Final Amount', 'Payment Mode'],
                unitName: 'product sales',
                reportFileName: `${(profile.name || 'Staff').replace(/\s+/g, '_')}_Retail_Sales`,
                rows: rawProducts.map(p => [
                    p.col_date,
                    p.col_sale_ref || '—',
                    p.col_customer,
                    p.col_products,
                    p.col_categories,
                    p.col_qty,
                    formatCurrency(p.col_gross),
                    (p.col_discount && p.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${p.col_discount}</span>` : (p.col_discount || '—'),
                    `<strong>${formatCurrency(p.col_final)}</strong>`,
                    p.col_payment || 'Cash'
                ])
            },
            memberships: {
                title: `${profile.name || 'Staff Member'}'s Membership Plan Sales`,
                headers: ['Purchase Date', 'Plan Name', 'Customer', 'Duration', 'Expiry Date', 'Plan Price', 'Discount', 'Final Paid', 'Payment Mode', 'Status'],
                unitName: 'membership sales',
                reportFileName: `${(profile.name || 'Staff').replace(/\s+/g, '_')}_Membership_Sales`,
                rows: rawMemberships.map(m => [
                    m.col_purchase_date,
                    m.col_plan,
                    m.col_customer,
                    m.col_duration,
                    m.col_expiry_date,
                    formatCurrency(m.col_plan_price),
                    (m.col_discount && m.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${m.col_discount}</span>` : (m.col_discount || '—'),
                    `<strong>${formatCurrency(m.col_final)}</strong>`,
                    m.col_payment || 'UPI',
                    `<span class="status-pill ${(m.col_status || '').toLowerCase() === 'active' ? 'completed' : 'cancelled'}">${m.col_status || 'Active'}</span>`
                ])
            }
        };

        const activateTab = (tabKey) => {
            tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
            });

            const config = tabConfigs[tabKey] || tabConfigs.bookings;
            const titleEl = document.getElementById('tableTitleText');
            if (titleEl) titleEl.textContent = config.title;

            setupReportTable(config.headers, config.rows, {
                unitName: config.unitName,
                reportFileName: config.reportFileName,
                searchPlaceholder: 'Search within selected ledger tab...',
                pageSize: 10
            });
        };

        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.getAttribute('data-tab');
                activateTab(tabKey);
            });
        });

        activateTab('bookings');
    };

    if (btnApply) {
        btnApply.onclick = () => loadStaffProfile(targetStaffId);
    }

    await loadStaffProfile(targetStaffId);
}

// ── Shared Module Dispatcher ────────────────────────────────────────────────
const handlers = {
    'staff-overview': renderStaffOverview,
    'staff-insights': renderStaffInsights,
    'staff':          renderStaffOverview
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
