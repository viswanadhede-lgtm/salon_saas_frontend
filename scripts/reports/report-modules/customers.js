// scripts/reports/report-modules/customers.js
// 360-Degree Customer Intelligence Module (Live Supabase Master RPC Integration)
// Master RPC: public.get_customers_report(p_company_id, p_branch_id, p_start_date, p_end_date, p_customer_id)
// Sub-Report 1: Customer Overview (Macro Salon-Wide Fleet View)
// Sub-Report 2: Customer 360° Insights (Single-Customer Dossier & Spend History)

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
        try { res = JSON.parse(res); } catch (e) { console.warn('[customers] JSON parse warning:', e); }
    }
    if (Array.isArray(res)) {
        res = res[0] || {};
    }
    if (res && typeof res === 'object') {
        if (res.get_customers_report) {
            res = res.get_customers_report;
        } else if (res.customers_report) {
            res = res.customers_report;
        }
    }
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {}
    }
    return (res && typeof res === 'object') ? res : {};
}

// Helper: Call the Master RPC
async function callCustomersRpc(supabase, companyId, branchId, start, end, customerId = null) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[customers] Calling get_customers_report with:', { cid, bid, start, end, customerId });
    const { data, error } = await supabase.rpc('get_customers_report', {
        p_company_id:  cid,
        p_branch_id:   bid,
        p_start_date:  start,
        p_end_date:    end,
        p_customer_id: customerId || null
    });

    if (error) {
        console.error('[customers] get_customers_report RPC error:', error);
        throw error;
    }
    return unwrapRpcResult(data);
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
                    if (options.searchPredicate) {
                        return options.searchPredicate(r, q);
                    }
                    if (r && r._raw) {
                        const raw = r._raw;
                        const match = (raw.name || '').toLowerCase().includes(q) ||
                                      (raw.phone || '').toLowerCase().includes(q) ||
                                      (raw.email || '').toLowerCase().includes(q) ||
                                      (raw.tag || '').toLowerCase().includes(q);
                        if (match) return true;
                    }
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
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${options.reportFileName || 'Customer_Report'}_${new Date().toISOString().split('T')[0]}.csv`;
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

// ============================================================================
// 1. SUB-REPORT 1: CUSTOMER OVERVIEW (Macro Salon-Wide View)
// ============================================================================

async function renderCustMetrics(data, supabase) {
    console.log('[customers.js] Initializing Sub-Report 1: Customer Overview');

    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Remove any leftover Customer Insights container or tabs if user switched sub-reports
    const oldInsightsWrap = document.getElementById('custInsightsTopWrap');
    if (oldInsightsWrap) oldInsightsWrap.remove();
    const oldInsightsTabs = document.getElementById('custInsightsTabsBar');
    if (oldInsightsTabs) oldInsightsTabs.remove();

    const loadCustomerOverview = async () => {
        const start = filterStart ? filterStart.value : ((new Date(Date.now() - 30 * 86400000)).toISOString().split('T')[0]);
        const end   = filterEnd   ? filterEnd.value   : (new Date().toISOString().split('T')[0]);
        const bid   = resolveBranchId(filterBranch);

        // Set Loading state
        updateKPIs(
            { label: 'Total Customers',            value: 'Loading...' },
            { label: 'Membership Clients',         value: 'Loading...' },
            { label: 'VIP Clients',                value: 'Loading...' },
            { label: 'Loyal Customers (2+ Visits)', value: 'Loading...' }
        );

        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2.5rem;color:#94a3b8;">Loading customer analytics from database...</td></tr>';
        }

        try {
            const report = await callCustomersRpc(supabase, companyId, bid, start, end, null);
            const kpis   = report.kpis || {};
            const trend  = report.trend_chart || {};
            const dist   = report.tier_distribution || {};
            const rawRows = report.registry_table || [];

            // 1. Render 4 Stat Cards with Rich High-Value Sub-Metrics
            const totalCust     = Number(kpis.total_customers || 0);
            const newCust       = Number(kpis.new_customers || 0);
            const returningCust = Number(kpis.returning_customers || 0);

            const memberClients = Number(kpis.membership_clients || 0);
            const memberPen     = Number(kpis.membership_pen_pct || 0);
            const memberExpSoon = Number(kpis.membership_expiring_soon || 0);

            const vipClients    = Number(kpis.vip_clients || 0);
            const regularClients = Number(kpis.regular_clients || 0);
            const vipPct        = Number(kpis.vip_pct || 0);
            const regularPct    = Number(kpis.regular_pct || 0);

            const loyalClients  = Number(kpis.loyal_clients || 0);
            const repeatRate    = Number(kpis.repeat_rate_pct || 0);
            const loyalAvgVisits = Number(kpis.loyal_avg_visits || 0);

            updateKPIs(
                { 
                    label: 'Total Customers',            
                    value: totalCust.toLocaleString('en-IN'), 
                    subHtml: `<strong style="color:#059669;">+${newCust} New Joined</strong> • <span>${returningCust.toLocaleString('en-IN')} Returning</span>` 
                },
                { 
                    label: 'Membership Clients',         
                    value: memberClients.toLocaleString('en-IN'), 
                    subHtml: `<strong style="color:#d97706;">${memberPen}%</strong> Penetration Rate • <span>${memberExpSoon} Expiring Soon</span>` 
                },
                { 
                    label: 'VIP Clients',                
                    value: vipClients.toLocaleString('en-IN'), 
                    subHtml: `<strong style="color:#7c3aed;">${vipPct}%</strong> of Base • <span>Regular: ${regularClients.toLocaleString('en-IN')} (${regularPct}%)</span>` 
                },
                { 
                    label: 'Loyal Customers (2+ Visits)', 
                    value: loyalClients.toLocaleString('en-IN'), 
                    subHtml: `<strong style="color:#059669;">${repeatRate}%</strong> Repeat Rate • <span>Avg ${loyalAvgVisits} visits / client</span>` 
                }
            );

            // Update Left Chart Header Title
            const leftChartTitleEl = document.getElementById('leftChartTitle');
            if (leftChartTitleEl) leftChartTitleEl.textContent = 'Total Customers vs. Total Revenue';

            // 2. Render Left Chart: Dual-Bar with Dual Y-Axis (Total Customers vs. Total Revenue)
            const trendCanvas = document.getElementById('trendChart');
            if (trendCanvas) {
                trendChartInstance = destroyChart(trendChartInstance);
                trendChartInstance = new Chart(trendCanvas, {
                    type: 'bar',
                    data: {
                        labels: trend.months || ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                        datasets: [
                            {
                                label: 'Total Customers',
                                data: trend.customers || [],
                                backgroundColor: '#6366f1',
                                borderRadius: 6,
                                barPercentage: 0.65,
                                categoryPercentage: 0.75,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Total Revenue',
                                data: trend.revenue || [],
                                backgroundColor: '#10b981',
                                borderRadius: 6,
                                barPercentage: 0.65,
                                categoryPercentage: 0.75,
                                yAxisID: 'y1'
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
                                labels: {
                                    font: { size: 12, weight: '600', family: 'Inter' },
                                    boxWidth: 12,
                                    boxHeight: 12,
                                    usePointStyle: true
                                }
                            },
                            tooltip: {
                                backgroundColor: '#0f172a',
                                padding: 12,
                                cornerRadius: 8,
                                callbacks: {
                                    label: (ctx) => {
                                        if (ctx.dataset.yAxisID === 'y1') {
                                            return ` Total Revenue: ${formatCurrency(ctx.raw)}`;
                                        }
                                        return ` Total Customers: ${Number(ctx.raw || 0).toLocaleString('en-IN')}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                beginAtZero: true,
                                grid: { color: '#f1f5f9' },
                                title: {
                                    display: true,
                                    text: 'Customers (Count)',
                                    color: '#6366f1',
                                    font: { size: 11, weight: '600' }
                                },
                                ticks: { color: '#6366f1', font: { size: 11 } }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                beginAtZero: true,
                                grid: { drawOnChartArea: false },
                                title: {
                                    display: true,
                                    text: 'Revenue (₹)',
                                    color: '#10b981',
                                    font: { size: 11, weight: '600' }
                                },
                                ticks: { 
                                    color: '#10b981', 
                                    font: { size: 11 },
                                    callback: (v) => formatCurrency(v)
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
                            }
                        }
                    }
                });
            }

            // 3. Render Right Chart: Tier Composition Donut
            const distCanvas = document.getElementById('distributionChart');
            if (distCanvas) {
                distChartInstance = destroyChart(distChartInstance);

                const centerVal = document.getElementById('donutCenterValue');
                const centerLbl = document.getElementById('donutCenterLabel');
                if (centerVal) centerVal.textContent = totalCust.toLocaleString('en-IN');
                if (centerLbl) centerLbl.textContent = 'Total Clients';

                const tierData = [
                    { label: 'Regular Clients', count: regularClients, perc: regularPct, color: '#6366f1' },
                    { label: 'VIP Clients',     count: vipClients,     perc: vipPct,     color: '#8b5cf6' },
                    { label: 'Membership Plans', count: memberClients,  perc: memberPen,  color: '#f59e0b' }
                ];

                distChartInstance = new Chart(distCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: tierData.map(d => d.label),
                        datasets: [{
                            data: tierData.map(d => d.count),
                            backgroundColor: tierData.map(d => d.color),
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
                                    label: (ctx) => ` ${ctx.label}: ${ctx.raw} clients (${tierData[ctx.dataIndex].perc}%)`
                                }
                            }
                        }
                    }
                });

                // Render Donut Legend below
                const legendEl = document.getElementById('donutLegend');
                if (legendEl) {
                    legendEl.innerHTML = tierData.map(d => `
                        <div class="donut-legend-item">
                            <span class="donut-legend-dot" style="background-color: ${d.color};"></span>
                            <div class="donut-legend-text">
                                <strong>${d.label}:</strong> ${d.count} clients
                                <span style="color:#64748b; font-size:0.75rem; margin-left:4px;">(${d.perc}%)</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // 4. Render Table with 4 Tabs (All, Loyal, VIP, Members)
            renderOverviewTableWithTabs(rawRows);

        } catch (err) {
            console.error('[customers.js] Error loading overview data:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2.5rem;color:#ef4444;">Failed to load customer analytics. Please try again or check console.</td></tr>';
            }
        }
    };

    // Helper: Build Table with 4 Cohort Tabs and Interactive Pagination
    const renderOverviewTableWithTabs = (clients) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        const titleEl = document.getElementById('tableTitleText');
        if (titleEl) titleEl.textContent = 'Customer Registry';

        let tabBar = document.getElementById('custOverviewTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'custOverviewTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        const counts = {
            all: clients.length,
            loyal: clients.filter(c => c.is_loyal).length,
            vip: clients.filter(c => c.is_vip).length,
            member: clients.filter(c => c.is_member).length
        };

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="all">
                All Customers <span class="tab-badge">${counts.all}</span>
            </button>
            <button class="report-tab-btn" data-tab="loyal">
                Loyal (2+ Visits) <span class="tab-badge">${counts.loyal}</span>
            </button>
            <button class="report-tab-btn" data-tab="vip">
                VIP Clients <span class="tab-badge">${counts.vip}</span>
            </button>
            <button class="report-tab-btn" data-tab="member">
                Membership Clients <span class="tab-badge">${counts.member}</span>
            </button>
        `;

        const headers = [
            'Customer', 'Joined Date', 'Total Visits', 'Total Spent',
            'Bookings', 'Products', 'Membership', 'Discounts Saved',
            'Last Visit', 'Tag', 'Action'
        ];

        const formatCustomerRows = (list) => {
            return list.map(c => {
                const row = [
                    `<div style="display:flex;align-items:center;gap:10px;">
                        <div class="cust-avatar-pill">${(c.name || 'C').charAt(0).toUpperCase()}</div>
                        <div>
                            <strong style="color:#0f172a;display:block;">${c.name}</strong>
                            <span style="color:#64748b;font-size:0.75rem;">${c.phone}</span>
                        </div>
                    </div>`,
                    c.joined,
                    `<strong>${c.visits}</strong>`,
                    `<strong>${formatCurrency(c.spent)}</strong>`,
                    `<span style="color:#2563eb;font-weight:500;">${formatCurrency(c.spent_bookings)}</span>`,
                    `<span style="color:#d97706;font-weight:500;">${formatCurrency(c.spent_products)}</span>`,
                    `<span style="color:#ca8a04;font-weight:500;">${formatCurrency(c.spent_memberships)}</span>`,
                    `<span style="color:#e11d48;font-weight:600;">${c.discounts > 0 ? '-' + formatCurrency(c.discounts) : '₹0'}</span>`,
                    c.last_visit,
                    `<span class="status-pill ${c.tag.toLowerCase()}">${c.tag}</span>`,
                    `<a href="report-detail.html?type=cust-insights&customerId=${c.id}&cat=customers" class="btn-view-360">
                        <i data-feather="user-check" style="width:13px;height:13px;"></i> View 360°
                    </a>`
                ];
                row._raw = c;
                return row;
            });
        };

        const tabDatasets = {
            all:    { name: 'All Customers', rows: formatCustomerRows(clients) },
            loyal:  { name: 'Loyal Clients', rows: formatCustomerRows(clients.filter(c => c.is_loyal)) },
            vip:    { name: 'VIP Clients', rows: formatCustomerRows(clients.filter(c => c.is_vip)) },
            member: { name: 'Membership Clients', rows: formatCustomerRows(clients.filter(c => c.is_member)) }
        };

        const activateTab = (tabKey) => {
            tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
            });

            const ds = tabDatasets[tabKey] || tabDatasets.all;
            setupReportTable(headers, ds.rows, {
                unitName: 'customers',
                reportFileName: `Customer_Registry_${tabKey}`,
                searchPlaceholder: 'Search customer by name, phone, or email...',
                pageSize: 10
            });
        };

        // Wire Tab click
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.getAttribute('data-tab');
                activateTab(tabKey);
            });
        });

        // Initialize with 'all' tab
        activateTab('all');
    };

    if (btnApply) {
        btnApply.onclick = loadCustomerOverview;
    }

    await loadCustomerOverview();
}

// ============================================================================
// 2. SUB-REPORT 2: CUSTOMER 360° INSIGHTS (Live Individual Profile)
// ============================================================================

async function renderCustInsights(data, supabase) {
    console.log('[customers.js] Initializing Sub-Report 2: Customer 360° Insights');

    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Read target customerId from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    let targetCustomerId = urlParams.get('customerId') || null;

    // Remove any leftover Customer Overview tab bar if user switched sub-reports
    const oldOverviewTabs = document.getElementById('custOverviewTabsBar');
    if (oldOverviewTabs) oldOverviewTabs.remove();

    // ── Inject Top Search & Profile Dossier Container ───────────────────────
    let topWrap = document.getElementById('custInsightsTopWrap');
    if (!topWrap) {
        topWrap = document.createElement('div');
        topWrap.id = 'custInsightsTopWrap';
        topWrap.className = 'cust-insights-top-wrap';

        const kpiRow = document.getElementById('kpiRow');
        if (kpiRow && kpiRow.parentElement) {
            kpiRow.parentElement.insertBefore(topWrap, kpiRow);
        }
    }

    const loadCustomerProfile = async (customerIdToLoad) => {
        const start = filterStart ? filterStart.value : ((new Date(Date.now() - 180 * 86400000)).toISOString().split('T')[0]);
        const end   = filterEnd   ? filterEnd.value   : (new Date().toISOString().split('T')[0]);
        const bid   = resolveBranchId(filterBranch);

        // Set Loading state on Stat Cards
        updateKPIs(
            { label: 'Total Spent',           value: 'Loading...' },
            { label: 'Spent on Bookings',     value: 'Loading...' },
            { label: 'Spent on Products',     value: 'Loading...' },
            { label: 'Spent on Memberships',  value: 'Loading...' }
        );

        try {
            const report = await callCustomersRpc(supabase, companyId, bid, start, end, customerIdToLoad);
            const crmDirectory = report.crm_directory || [];

            // If no customerId was provided or customer not found, default to first in CRM directory
            if ((!customerIdToLoad || report.error) && crmDirectory.length > 0) {
                targetCustomerId = crmDirectory[0].id;
                return await loadCustomerProfile(targetCustomerId);
            }

            const profile     = report.profile || {};
            const spendKpis   = report.spend_kpis || {};
            const monthly     = report.monthly_trend || {};
            const walletShare = report.wallet_share || {};
            const ledger      = report.ledger || {};

            // 1. Render Top Search & Profile Dossier Card
            renderTopSearchAndDossier(profile, crmDirectory);

            // 2. Render 4 Spending KPI Cards with Sub-Metrics
            const totalSpent  = Number(spendKpis.spent_total || 0);
            const visitsTotal = Number(spendKpis.visits_total || 0);
            const avgPerVisit = Number(spendKpis.avg_per_visit || (visitsTotal > 0 ? Math.round(totalSpent / visitsTotal) : totalSpent));

            const spentBookings    = Number(spendKpis.spent_bookings || 0);
            const bookingsPct      = Number(spendKpis.bookings_pct || 0);
            const spentProducts    = Number(spendKpis.spent_products || 0);
            const productsPct      = Number(spendKpis.products_pct || 0);
            const spentMemberships = Number(spendKpis.spent_memberships || 0);
            const membershipsPct   = Number(spendKpis.memberships_pct || 0);

            updateKPIs(
                { 
                    label: 'Total Spent',           
                    value: formatCurrency(totalSpent),       
                    subHtml: `From <strong>${visitsTotal} total visits</strong> • <span>Avg ${formatCurrency(avgPerVisit)} / visit</span>` 
                },
                { 
                    label: 'Spent on Bookings',     
                    value: formatCurrency(spentBookings),    
                    subHtml: `<strong style="color:#2563eb;">${bookingsPct}%</strong> of total spend` 
                },
                { 
                    label: 'Spent on Products',     
                    value: formatCurrency(spentProducts),    
                    subHtml: `<strong style="color:#d97706;">${productsPct}%</strong> of total spend` 
                },
                { 
                    label: 'Spent on Memberships',  
                    value: formatCurrency(spentMemberships), 
                    subHtml: `<strong style="color:#ca8a04;">${membershipsPct}%</strong> of total spend` 
                }
            );

            // 3. Render Left Chart: Clustered 3-Bar Spend over Time
            const trendCanvas = document.getElementById('trendChart');
            if (trendCanvas) {
                trendChartInstance = destroyChart(trendChartInstance);
                trendChartInstance = new Chart(trendCanvas, {
                    type: 'bar',
                    data: {
                        labels: monthly.months || ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                        datasets: [
                            {
                                label: 'Bookings',
                                data: monthly.bookings || [],
                                backgroundColor: '#3b82f6',
                                borderRadius: 6,
                                barPercentage: 0.7,
                                categoryPercentage: 0.8
                            },
                            {
                                label: 'Product Sales',
                                data: monthly.products || [],
                                backgroundColor: '#f59e0b',
                                borderRadius: 6,
                                barPercentage: 0.7,
                                categoryPercentage: 0.8
                            },
                            {
                                label: 'Memberships',
                                data: monthly.memberships || [],
                                backgroundColor: '#eab308',
                                borderRadius: 6,
                                barPercentage: 0.7,
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
                                    font: { size: 12, weight: '600', family: 'Inter' },
                                    boxWidth: 12,
                                    boxHeight: 12,
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
                                grid: { color: '#f1f5f9' },
                                ticks: {
                                    color: '#64748b',
                                    callback: (v) => formatCurrency(v)
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
                            }
                        }
                    }
                });
            }

            // 4. Render Right Chart: Wallet-Share Donut
            const distCanvas = document.getElementById('distributionChart');
            if (distCanvas) {
                distChartInstance = destroyChart(distChartInstance);

                const centerVal = document.getElementById('donutCenterValue');
                const centerLbl = document.getElementById('donutCenterLabel');
                if (centerVal) centerVal.textContent = formatCurrency(totalSpent);
                if (centerLbl) centerLbl.textContent = 'Total Spent';

                const walletData = [
                    { label: 'Bookings',    val: spentBookings,    pct: bookingsPct,    color: '#3b82f6' },
                    { label: 'Products',    val: spentProducts,    pct: productsPct,    color: '#f59e0b' },
                    { label: 'Memberships', val: spentMemberships, pct: membershipsPct, color: '#eab308' }
                ];

                distChartInstance = new Chart(distCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: walletData.map(d => d.label),
                        datasets: [{
                            data: walletData.map(d => d.val),
                            backgroundColor: walletData.map(d => d.color),
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
                                    label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${walletData[ctx.dataIndex].pct}%)`
                                }
                            }
                        }
                    }
                });

                // Render Donut Legend (3 Rows in same card)
                const legendEl = document.getElementById('donutLegend');
                if (legendEl) {
                    legendEl.innerHTML = walletData.map(d => `
                        <div class="donut-legend-item">
                            <span class="donut-legend-dot" style="background-color: ${d.color};"></span>
                            <div class="donut-legend-text">
                                <strong>${d.label}:</strong> ${formatCurrency(d.val)}
                                <span style="color:#64748b; font-size:0.75rem; margin-left:4px;">(${d.pct}%)</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // 5. Render Table with 3 Activity Tabs (Bookings, Retail POS, Memberships)
            renderInsightsActivityTabs(profile, ledger);

        } catch (err) {
            console.error('[customers.js] Error loading customer profile:', err);
        }
    };

    const renderTopSearchAndDossier = (profile, crmDirectory) => {
        const initial = (profile.name || 'C').charAt(0).toUpperCase();

        topWrap.innerHTML = `
            <!-- Progressive CRM Search Bar -->
            <div class="cust-search-bar-wrap">
                <div class="cust-search-input-box">
                    <i data-feather="search"></i>
                    <input type="text" id="custProfileSearchInput" placeholder="Search customer CRM by name, phone (+91), or email to load 360° profile..." autocomplete="off">
                </div>
                <div class="cust-search-dropdown" id="custSearchDropdown"></div>
            </div>

            <!-- Customer 360 Dossier Header Card -->
            <div class="cust-profile-dossier">
                <div class="cust-dossier-left">
                    <div class="cust-dossier-avatar">${initial}</div>
                    <div>
                        <h3 class="cust-dossier-name">${profile.name || 'Customer'}</h3>
                        <div class="cust-dossier-meta">
                            <span><i data-feather="phone" style="width:12px;height:12px;"></i> ${profile.phone || '—'}</span>
                            <span><i data-feather="mail" style="width:12px;height:12px;"></i> ${profile.email || '—'}</span>
                            <span><i data-feather="calendar" style="width:12px;height:12px;"></i> DOB: ${profile.dob || 'Not Specified'}</span>
                            <span><i data-feather="clock" style="width:12px;height:12px;"></i> Member Since: ${profile.joined || '—'}</span>
                        </div>
                    </div>
                </div>
                <div class="cust-dossier-right">
                    <span class="status-pill" style="${profile.tag === 'VIP' ? 'background:#f3e8ff;color:#6b21a8;' : (profile.tag === 'Member' ? 'background:#fef3c7;color:#92400e;' : 'background:#f1f5f9;color:#64748b;')} font-size:0.8rem; padding:4px 14px;">
                        ${profile.tag || 'Regular'} Client
                    </span>
                    <span class="badge-discounts-used">
                        <i data-feather="tag"></i> ${profile.discounts_used_count || 0} Discounts Claimed • Saved ${formatCurrency(profile.discounts_total_saved || 0)}
                    </span>
                </div>
            </div>
        `;

        if (window.feather) feather.replace();

        // Wire progressive search auto-complete
        const searchInput = document.getElementById('custProfileSearchInput');
        const dropdown    = document.getElementById('custSearchDropdown');

        if (searchInput && dropdown) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) {
                    dropdown.style.display = 'none';
                    return;
                }

                const matches = crmDirectory.filter(c =>
                    (c.name || '').toLowerCase().includes(q) ||
                    (c.phone || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q)
                );

                if (matches.length === 0) {
                    dropdown.innerHTML = `<div style="padding:12px 16px;color:#94a3b8;font-size:0.85rem;">No customer matches found for "${q}"</div>`;
                    dropdown.style.display = 'block';
                    return;
                }

                dropdown.innerHTML = matches.slice(0, 8).map(c => `
                    <div class="cust-search-item" data-id="${c.id}">
                        <div class="cust-search-left">
                            <div class="cust-avatar-circle">${(c.name || 'C').charAt(0).toUpperCase()}</div>
                            <div class="cust-info-text">
                                <strong>${c.name} <span style="display:inline-block;margin-left:4px;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;background:#e0e7ff;color:#3730a3;">${c.tag || 'Regular'}</span></strong>
                                <span>${c.phone || '—'} • ${c.email || '—'}</span>
                            </div>
                        </div>
                    </div>
                `).join('');

                dropdown.style.display = 'block';

                dropdown.querySelectorAll('.cust-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const selId = item.getAttribute('data-id');
                        if (selId) {
                            // Update URL query string without reloading
                            const newUrl = new URL(window.location.href);
                            newUrl.searchParams.set('customerId', selId);
                            window.history.pushState({}, '', newUrl);

                            dropdown.style.display = 'none';
                            searchInput.value = '';
                            loadCustomerProfile(selId);
                        }
                    });
                });
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (ev) => {
                if (!topWrap.contains(ev.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }
    };

    const renderInsightsActivityTabs = (profile, ledger) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        let tabBar = document.getElementById('custInsightsTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'custInsightsTabsBar';
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
                Bookings <span class="tab-badge">${rawBookings.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="products">
                Retail POS <span class="tab-badge">${rawProducts.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="memberships">
                Memberships <span class="tab-badge">${rawMemberships.length}</span>
            </button>
        `;

        const tabConfigs = {
            bookings: {
                title: `${profile.name || 'Customer'}'s Booking History`,
                headers: ['Date & Time', 'Service(s)', 'Staff', 'Gross Total', 'Discount', 'Final Paid', 'Payment', 'Status'],
                unitName: 'bookings',
                reportFileName: `${(profile.name || 'Customer').replace(/\s+/g, '_')}_Bookings`,
                rows: rawBookings.map(b => [
                    b.col_datetime,
                    `<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">${b.col_service}</span>`,
                    b.col_staff,
                    formatCurrency(b.col_gross),
                    (b.col_discount && b.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${b.col_discount}</span>` : (b.col_discount || '—'),
                    `<strong>${formatCurrency(b.col_final)}</strong>`,
                    `<span class="status-pill completed">${b.col_payment}</span>`,
                    `<span class="status-pill ${(b.col_status || '').toLowerCase()}">${b.col_status}</span>`
                ])
            },
            products: {
                title: `${profile.name || 'Customer'}'s Retail POS Purchases`,
                headers: ['Sale Date', 'Products', 'Categories', 'Qty', 'Gross Total', 'Discount', 'Final Amount', 'Payment Mode', 'Billed By'],
                unitName: 'product purchases',
                reportFileName: `${(profile.name || 'Customer').replace(/\s+/g, '_')}_Retail_POS`,
                rows: rawProducts.map(p => [
                    p.col_date,
                    p.col_products,
                    p.col_categories,
                    p.col_qty,
                    formatCurrency(p.col_gross),
                    (p.col_discount && p.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${p.col_discount}</span>` : (p.col_discount || '—'),
                    `<strong>${formatCurrency(p.col_final)}</strong>`,
                    p.col_payment,
                    p.col_billed_by
                ])
            },
            memberships: {
                title: `${profile.name || 'Customer'}'s Membership Plans`,
                headers: ['Plan Name', 'Purchase Date', 'Duration', 'Expiry Date', 'Plan Price', 'Discount', 'Final Paid', 'Payment Mode', 'Status'],
                unitName: 'membership plans',
                reportFileName: `${(profile.name || 'Customer').replace(/\s+/g, '_')}_Memberships`,
                rows: rawMemberships.map(m => [
                    m.col_plan,
                    m.col_purchase_date,
                    m.col_duration,
                    m.col_expiry_date,
                    formatCurrency(m.col_plan_price),
                    (m.col_discount && m.col_discount.startsWith('-')) ? `<span style="color:#e11d48;font-weight:600;">${m.col_discount}</span>` : (m.col_discount || '—'),
                    `<strong>${formatCurrency(m.col_final)}</strong>`,
                    m.col_payment,
                    `<span class="status-pill ${(m.col_status || '').toLowerCase() === 'active' ? 'active' : 'cancelled'}">${m.col_status}</span>`
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

        // Wire Tab click
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.getAttribute('data-tab');
                activateTab(tabKey);
            });
        });

        // Initialize with 'bookings' tab
        activateTab('bookings');
    };

    if (btnApply) {
        btnApply.onclick = () => loadCustomerProfile(targetCustomerId);
    }

    await loadCustomerProfile(targetCustomerId);
}

// ── Shared Module Dispatcher ────────────────────────────────────────────────
const handlers = {
    'cust-metrics': renderCustMetrics,
    'cust-insights': renderCustInsights,
    'customers': renderCustMetrics
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
