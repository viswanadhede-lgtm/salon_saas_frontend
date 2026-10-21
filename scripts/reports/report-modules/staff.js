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

// Helper: Call the Master RPC
async function callStaffRpc(supabase, companyId, branchId, start, end, staffId = null) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[staff] Calling get_staff_report with:', { cid, bid, start, end, staffId });
    try {
        const { data, error } = await supabase.rpc('get_staff_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end,
            p_staff_id:   staffId || null
        });

        if (error) {
            console.warn('[staff] get_staff_report RPC returned error or not yet installed:', error.message);
            return null;
        }
        return unwrapRpcResult(data);
    } catch (err) {
        console.warn('[staff] Error executing get_staff_report RPC:', err.message);
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

    const loadStaffOverview = async () => {
        const start = filterStart ? filterStart.value : ((new Date(Date.now() - 30 * 86400000)).toISOString().split('T')[0]);
        const end   = filterEnd   ? filterEnd.value   : (new Date().toISOString().split('T')[0]);
        const bid   = resolveBranchId(filterBranch);

        // Loading state
        updateKPIs(
            { label: 'Total Staff',            value: 'Loading...' },
            { label: 'Top Performer',          value: 'Loading...' },
            { label: 'Avg Bookings per Staff', value: 'Loading...' },
            { label: 'Inactive Staff',         value: 'Loading...' }
        );

        let report = await callStaffRpc(supabase, companyId, bid, start, end, null);

        // Fallback demo/initial dataset if RPC not yet deployed in DB
        if (!report || !report.kpis) {
            report = {
                kpis: {
                    total_staff: 20,
                    active_staff: 12,
                    on_leave_staff: 4,
                    inactive_staff: 4,
                    top_performer_name: 'Priya Sharma',
                    top_performer_revenue: 68400,
                    top_performer_bookings: 42,
                    avg_bookings_per_staff: 14.5
                },
                capacity_trend: {
                    months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                    active_staff: [10, 11, 11, 12, 12, 12],
                    on_leave: [2, 3, 1, 4, 3, 4],
                    new_joined: [1, 2, 0, 1, 1, 0]
                },
                status_distribution: {
                    total: 20,
                    active: 12,
                    active_pct: 60,
                    on_leave: 4,
                    on_leave_pct: 20,
                    inactive: 4,
                    inactive_pct: 20
                },
                staff_directory: [
                    {
                        id: 's-001',
                        name: 'Priya Sharma',
                        role: 'Master Stylist',
                        phone: '+91 98765 43210',
                        email: 'priya.s@salon.com',
                        completed_bookings: 42,
                        service_revenue: 52400,
                        retail_sales: 12000,
                        membership_sales: 4000,
                        total_revenue: 68400,
                        avg_ticket: 1248,
                        status: 'active'
                    },
                    {
                        id: 's-002',
                        name: 'Rahul Verma',
                        role: 'Senior Barber',
                        phone: '+91 98450 12345',
                        email: 'rahul.v@salon.com',
                        completed_bookings: 38,
                        service_revenue: 41800,
                        retail_sales: 7500,
                        membership_sales: 2000,
                        total_revenue: 51300,
                        avg_ticket: 1100,
                        status: 'active'
                    },
                    {
                        id: 's-003',
                        name: 'Ananya Sen',
                        role: 'Senior Colorist',
                        phone: '+91 97112 34567',
                        email: 'ananya.sen@salon.com',
                        completed_bookings: 29,
                        service_revenue: 38900,
                        retail_sales: 6200,
                        membership_sales: 0,
                        total_revenue: 45100,
                        avg_ticket: 1341,
                        status: 'active'
                    },
                    {
                        id: 's-004',
                        name: 'Kavita Nair',
                        role: 'Esthetician',
                        phone: '+91 96543 21098',
                        email: 'kavita.n@salon.com',
                        completed_bookings: 24,
                        service_revenue: 28400,
                        retail_sales: 8900,
                        membership_sales: 3000,
                        total_revenue: 40300,
                        avg_ticket: 1183,
                        status: 'active'
                    },
                    {
                        id: 's-005',
                        name: 'Vikram Joshi',
                        role: 'Hair Stylist',
                        phone: '+91 98101 23456',
                        email: 'vikram.j@salon.com',
                        completed_bookings: 18,
                        service_revenue: 19500,
                        retail_sales: 2400,
                        membership_sales: 0,
                        total_revenue: 21900,
                        avg_ticket: 1083,
                        status: 'on-leave'
                    },
                    {
                        id: 's-006',
                        name: 'Sneha Patel',
                        role: 'Nail Technician',
                        phone: '+91 99234 56789',
                        email: 'sneha.p@salon.com',
                        completed_bookings: 12,
                        service_revenue: 14200,
                        retail_sales: 1800,
                        membership_sales: 0,
                        total_revenue: 16000,
                        avg_ticket: 1183,
                        status: 'on-leave'
                    },
                    {
                        id: 's-007',
                        name: 'Amit Deshmukh',
                        role: 'Stylist Assistant',
                        phone: '+91 91234 56780',
                        email: 'amit.d@salon.com',
                        completed_bookings: 0,
                        service_revenue: 0,
                        retail_sales: 0,
                        membership_sales: 0,
                        total_revenue: 0,
                        avg_ticket: 0,
                        status: 'inactive'
                    }
                ]
            };
        }

        const kpis        = report.kpis || {};
        const trend       = report.capacity_trend || {};
        const dist        = report.status_distribution || {};
        const staffDirect = report.staff_directory || [];

        // 1. Update 4 Stat Cards
        updateKPIs(
            {
                label: 'Total Staff',
                value: String(kpis.total_staff || staffDirect.length),
                sub: `${kpis.active_staff || 0} Active • ${kpis.on_leave_staff || 0} On Leave`
            },
            {
                label: 'Top Performer',
                value: kpis.top_performer_name || '—',
                sub: `${formatCurrency(kpis.top_performer_revenue || 0)} (${kpis.top_performer_bookings || 0} Bookings)`
            },
            {
                label: 'Avg Bookings per Staff',
                value: String(kpis.avg_bookings_per_staff || 0),
                sub: 'Completed appointments / staff'
            },
            {
                label: 'Inactive Staff',
                value: String(kpis.inactive_staff || 0),
                sub: `${kpis.on_leave_staff || 0} currently on leave`
            }
        );

        // 2. Render Left Chart: Staff Capacity & Headcount Trend (3 Lines)
        const leftCanvas = document.getElementById('trendChart');
        if (leftCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);
            const months = trend.months || ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
            const activeLine = trend.active_staff || [10, 11, 11, 12, 12, 12];
            const leaveLine  = trend.on_leave || [2, 3, 1, 4, 3, 4];
            const newJoinLine = trend.new_joined || [1, 2, 0, 1, 1, 0];

            trendChartInstance = new Chart(leftCanvas, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [
                        {
                            label: 'Total Active Staff',
                            data: activeLine,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.35,
                            pointRadius: 4,
                            pointBackgroundColor: '#10b981'
                        },
                        {
                            label: 'Staff on Leave',
                            data: leaveLine,
                            borderColor: '#f59e0b',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [4, 4],
                            tension: 0.35,
                            pointRadius: 3.5,
                            pointBackgroundColor: '#f59e0b'
                        },
                        {
                            label: 'New Staff Joined',
                            data: newJoinLine,
                            borderColor: '#6366f1',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            tension: 0.35,
                            pointRadius: 3.5,
                            pointBackgroundColor: '#6366f1'
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
                            backgroundColor: '#0f172a'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 2, color: '#64748b' },
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

        // 3. Render Right Chart: Staff Status Distribution Donut Chart (Exact match to User Screenshot)
        const distCanvas = document.getElementById('distributionChart');
        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const totalStaff = dist.total || kpis.total_staff || 20;
            const activeCount = dist.active !== undefined ? dist.active : (kpis.active_staff || 12);
            const leaveCount  = dist.on_leave !== undefined ? dist.on_leave : (kpis.on_leave_staff || 4);
            const inactiveCount = dist.inactive !== undefined ? dist.inactive : (kpis.inactive_staff || 4);

            const activePct   = totalStaff > 0 ? Math.round((activeCount / totalStaff) * 100) : 60;
            const leavePct    = totalStaff > 0 ? Math.round((leaveCount / totalStaff) * 100) : 20;
            const inactivePct = totalStaff > 0 ? Math.round((inactiveCount / totalStaff) * 100) : 20;

            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = String(totalStaff);
            if (centerLbl) centerLbl.textContent = 'Staff';

            const statusSlices = [
                { label: 'Active Staff',   count: activeCount,   pct: activePct,   color: '#10b981' }, // Green
                { label: 'Staff on Leave', count: leaveCount,    pct: leavePct,    color: '#f59e0b' }, // Amber
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

            // Render Donut Legend (Matching layout from User Screenshot)
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

        // 4. Render Table with 4 Cohort Tabs
        renderStaffOverviewTabs(staffDirect);
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

        const topStylists = staffList.filter(s => (s.completed_bookings || 0) > 0 || (s.total_revenue || 0) > 0)
            .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
        const activeStaff = staffList.filter(s => (s.status || '').toLowerCase() === 'active');
        const leaveOrInactive = staffList.filter(s => (s.status || '').toLowerCase() !== 'active');

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="all">
                All Staff <span class="tab-badge">${staffList.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="top">
                Top Performers <span class="tab-badge">${topStylists.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="active">
                Active Staff <span class="tab-badge">${activeStaff.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="inactive">
                On Leave / Inactive <span class="tab-badge">${leaveOrInactive.length}</span>
            </button>
        `;

        const buildRow = (s) => {
            const initial = (s.name || 'S').charAt(0).toUpperCase();
            const statusClass = (s.status || '').toLowerCase() === 'active' ? 'completed' : ((s.status || '').toLowerCase().includes('leave') ? 'pending' : 'cancelled');
            const statusLabel = (s.status || 'Active').charAt(0).toUpperCase() + (s.status || 'Active').slice(1);

            return [
                `<div style="display:flex; align-items:center; gap:9px;">
                    <span style="width:30px; height:30px; border-radius:50%; background:#e0e7ff; color:#3730a3; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${initial}</span>
                    <div>
                        <strong style="color:#0f172a; display:block;">${s.name}</strong>
                    </div>
                </div>`,
                `<span class="status-pill active" style="background:#f1f5f9; color:#475569; font-weight:600;">${s.role || 'Staff'}</span>`,
                `<div style="font-size:0.8rem; color:#64748b;">${s.phone || '—'}<br>${s.email || '—'}</div>`,
                `<strong style="color:#0f172a;">${s.completed_bookings || 0}</strong>`,
                formatCurrency(s.service_revenue || 0),
                formatCurrency(s.retail_sales || 0),
                formatCurrency(s.membership_sales || 0),
                `<strong style="color:#059669;">${formatCurrency(s.total_revenue || 0)}</strong>`,
                formatCurrency(s.avg_ticket || 0),
                `<span class="status-pill ${statusClass}">${statusLabel}</span>`,
                `<a href="report-detail.html?type=staff-insights&staffId=${s.id}&cat=staff" class="btn-view-360">
                    View 360° <i data-feather="arrow-right"></i>
                </a>`
            ];
        };

        const headers = ['Staff Member', 'Role', 'Contact', 'Bookings', 'Service Rev', 'Retail Sales', 'Membership Sales', 'Total Revenue', 'Avg Ticket', 'Status', 'Action'];

        const tabDatasets = {
            all: {
                title: 'All Staff Members Directory',
                unitName: 'staff members',
                fileName: 'All_Staff_Report',
                rows: staffList.map(buildRow)
            },
            top: {
                title: 'Top Performing Staff Leaderboard',
                unitName: 'top performers',
                fileName: 'Top_Staff_Leaderboard',
                rows: topStylists.map(buildRow)
            },
            active: {
                title: 'Currently Active Staff',
                unitName: 'active staff',
                fileName: 'Active_Staff_Report',
                rows: activeStaff.map(buildRow)
            },
            inactive: {
                title: 'Staff On Leave & Inactive',
                unitName: 'on-leave / inactive staff',
                fileName: 'Inactive_Staff_Report',
                rows: leaveOrInactive.map(buildRow)
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

        let report = await callStaffRpc(supabase, companyId, bid, start, end, staffIdToLoad);

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

        // 3. Render Left Chart: 3-Bar Monthly Spend Breakdown
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

    const renderTopSearchAndDossier = (profile, staffDirectory) => {
        const initial = (profile.name || 'S').charAt(0).toUpperCase();

        topWrap.innerHTML = `
            <!-- Progressive Staff Search Bar -->
            <div class="cust-search-bar-wrap">
                <div class="cust-search-input-box">
                    <i data-feather="search"></i>
                    <input type="text" id="staffProfileSearchInput" placeholder="Search staff team by name, role, phone, or email to load 360° profile..." autocomplete="off">
                </div>
                <div class="cust-search-dropdown" id="staffSearchDropdown"></div>
            </div>

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

        // Wire progressive search auto-complete
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
                if (!topWrap.contains(ev.target)) {
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
