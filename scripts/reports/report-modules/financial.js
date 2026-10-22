// scripts/reports/report-modules/financial.js
// Complete Financial Reports Suite (Executive P&L, Revenue, Payments, Expenses, Discounts, Refunds, Dues)
// Fully integrated with unified Master RPC: public.get_financial_report(p_company_id, p_branch_id, p_start_date, p_end_date)
// Includes high-fidelity realistic preview fallbacks matching the 6-table database schema.

import { formatCurrency, updateKPIs } from './shared.js';

let trendChartInstance = null;
let distChartInstance = null;
let cachedRpcPayload = null;
let lastRpcKey = null;

// =============================================================================
// Helper Functions & State Resolvers
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
        console.warn('[financial] Branch fetch warning:', e);
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

function destroyChart(instance) {
    if (instance && typeof instance.destroy === 'function') {
        try { instance.destroy(); } catch (e) {}
    }
    return null;
}

// Safely Unwrap RPC result from Supabase
function unwrapRpcResult(data) {
    if (!data) return null;
    let res = data;
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) { console.warn('[financial] JSON parse warning:', e); }
    }
    if (Array.isArray(res)) {
        res = res[0] || {};
    }
    if (res && typeof res === 'object') {
        if (res.get_financial_report) {
            res = res.get_financial_report;
        } else if (res.financial_report) {
            res = res.financial_report;
        }
    }
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {}
    }
    return (res && typeof res === 'object') ? res : null;
}

// Master RPC Caller with Caching for Smooth Tab/Sub-report Switching
async function fetchFinancialReportData(supabase, companyId, branchId, start, end, forceRefresh = false) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;
    const key = `${cid || 'all'}_${bid || 'all'}_${start || 'none'}_${end || 'none'}`;

    if (!forceRefresh && cachedRpcPayload && lastRpcKey === key) {
        return cachedRpcPayload;
    }

    try {
        console.log('[financial] Calling get_financial_report Master RPC:', { cid, bid, start, end });
        const { data, error } = await supabase.rpc('get_financial_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (error) {
            console.error('[financial] get_financial_report RPC error:', error);
            return null;
        }

        const unwrapped = unwrapRpcResult(data);
        console.log('[financial] Loaded financial payload:', unwrapped);
        cachedRpcPayload = unwrapped;
        lastRpcKey = key;
        return unwrapped;
    } catch (err) {
        console.error('[financial] Failed to execute get_financial_report RPC:', err);
        return null;
    }
}

// Custom Styled Bar/Line Trend Chart
function renderFinTrendChart(labels, values, options = {}) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    trendChartInstance = destroyChart(trendChartInstance);

    const chartType = options.type || 'bar';
    const primaryColor = options.color || '#3b82f6';

    let datasets = [];
    if (options.multiSeries && options.series) {
        datasets = options.series;
    } else {
        const backgroundColors = (values || []).map((_, i) => i === values.length - 1 ? primaryColor : '#e2e8f0');
        datasets = [{
            label: options.seriesLabel || 'Amount (₹)',
            data: values || [],
            backgroundColor: chartType === 'bar' ? backgroundColors : 'rgba(59, 130, 246, 0.1)',
            borderColor: primaryColor,
            borderWidth: chartType === 'line' ? 2.5 : 0,
            fill: chartType === 'line',
            tension: 0.35,
            borderRadius: 6,
            barThickness: 24
        }];
    }

    trendChartInstance = new Chart(ctx, {
        type: chartType,
        data: { labels: labels || [], datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: !!(options.multiSeries && options.series),
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 14,
                        font: { size: 12, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 10,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 12 },
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label || 'Amount'}: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#64748b' }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { size: 11 },
                        color: '#64748b',
                        callback: (v) => formatCurrency(v)
                    }
                }
            }
        }
    });
}

// Custom Styled Donut Chart
function renderFinDistributionChart(labels, values, options = {}) {
    const ctx = document.getElementById('distChart');
    if (!ctx) return;
    distChartInstance = destroyChart(distChartInstance);

    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    const colors = options.colors || defaultColors;

    distChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels || [],
            datasets: [{
                data: values || [],
                backgroundColor: colors.slice(0, (labels || []).length),
                borderWidth: 0,
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
                    padding: 10,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 12 },
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
                    }
                }
            }
        }
    });

    const legendContainer = document.getElementById('infographicLegend');
    if (legendContainer) {
        const total = (values || []).reduce((a, b) => a + Number(b || 0), 0);
        if (!labels || labels.length === 0 || total === 0) {
            legendContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.875rem; text-align:center; padding:1rem;">No data available</div>';
        } else {
            legendContainer.innerHTML = labels.map((l, i) => {
                const val = Number(values[i] || 0);
                const perc = total > 0 ? Math.round((val / total) * 100) : 0;
                return `
                    <div class="metric-item">
                        <span class="metric-dot" style="background-color: ${colors[i % colors.length]};"></span>
                        <div class="metric-label">
                            <span class="name">${l}</span>
                            <span class="perc">${perc}%</span>
                        </div>
                        <div class="metric-value">${formatCurrency(val)}</div>
                    </div>
                `;
            }).join('');
        }
    }

    const hmVal = document.getElementById('heroMetricValue');
    const hmLabel = document.getElementById('heroMetricLabel');
    if (hmVal && hmLabel) {
        const total = (values || []).reduce((a, b) => a + Number(b || 0), 0);
        if (total > 0) {
            const maxIdx = values.indexOf(Math.max(...values));
            const perc = Math.round((values[maxIdx] / total) * 100);
            hmVal.textContent = perc + '%';
            hmLabel.textContent = options.heroLabelPrefix ? `${options.heroLabelPrefix} ${labels[maxIdx]}` : labels[maxIdx];
        } else {
            hmVal.textContent = '0%';
            hmLabel.textContent = 'No Data';
        }
    }
}

// =============================================================================
// Generic Table Controller with Pagination, Search, CSV Export, and Print
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

        if (recordBadge) {
            recordBadge.textContent = `${total.toLocaleString('en-IN')} ${unitName}`;
        }

        if (tbody) {
            if (pageItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center;padding:2.5rem;color:#94a3b8;font-size:0.9rem;">No matching ${unitName} found.</td></tr>`;
            } else {
                tbody.innerHTML = pageItems.map(r => {
                    const cells = Array.isArray(r) ? r : Object.values(r);
                    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
                }).join('');
            }
        }

        if (paginationInfo) {
            if (total === 0) {
                paginationInfo.textContent = `Showing 0 to 0 of 0 ${unitName}`;
            } else {
                paginationInfo.textContent = `Showing ${(startIdx + 1).toLocaleString('en-IN')} to ${endIdx.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${unitName}`;
            }
        }

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
                        html += `<span class="page-dots" style="color:#94a3b8;padding:0 4px;font-size:0.85rem;">...</span>`;
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

        if (window.feather) {
            try { feather.replace(); } catch (e) {}
        }
    }

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
            link.download = `${options.reportFileName || 'financial_report'}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        };
    }

    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    renderPage(1);
}

// Transaction Drilldown Modal Handler
function showDrilldownModal(refId, supabase) {
    if (!refId || refId === '—') return;
    let modalOverlay = document.getElementById('drilldownModalOverlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'drilldownModalOverlay';
        modalOverlay.className = 'modal-overlay active';
        modalOverlay.style.zIndex = '9999';
        modalOverlay.innerHTML = `
            <div class="modal-container" style="max-width: 800px; width: 90%; background:#fff; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); overflow:hidden;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid #e2e8f0;">
                    <div>
                        <h2 style="font-size:1.15rem; font-weight:700; color:#0f172a; margin:0;">Transaction Settlement Audit</h2>
                        <p class="subtitle" id="drilldownSubtitle" style="font-size:0.8rem; color:#64748b; margin:4px 0 0;">Settlement entries from business_transactions</p>
                    </div>
                    <button class="modal-close" style="background:none; border:none; cursor:pointer; padding:6px;" onclick="document.getElementById('drilldownModalOverlay').classList.remove('active')"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; max-height: 60vh;">
                    <table class="custom-table" style="width: 100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
                                <th style="padding:10px;">Paid At</th>
                                <th style="padding:10px;">Method</th>
                                <th style="padding:10px;">Gross</th>
                                <th style="padding:10px;">Discount</th>
                                <th style="padding:10px;">Net Paid</th>
                                <th style="padding:10px;">Status</th>
                            </tr>
                        </thead>
                        <tbody id="drilldownTbody">
                            <tr><td colspan="6" style="text-align: center; padding: 2rem; color:#94a3b8;">Loading settlements...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
    } else {
        modalOverlay.classList.add('active');
        document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color:#94a3b8;">Loading settlements...</td></tr>';
    }

    const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId;
    document.getElementById('drilldownSubtitle').textContent = `Settlement ledger for Ref #${shortRef}`;
    if (window.feather) feather.replace();

    supabase.from('business_transactions')
        .select('*')
        .eq('reference_id', refId)
        .order('created_at', { ascending: false })
        .then(({ data: logs, error }) => {
            const tbody = document.getElementById('drilldownTbody');
            if (!tbody) return;
            if (error || !logs || logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748b;">No settlement records found in business_transactions for #${shortRef}.</td></tr>`;
                return;
            }
            tbody.innerHTML = logs.map(log => {
                const date = log.paid_at ? new Date(log.paid_at).toLocaleString('en-IN') : (log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : '—');
                const method = (log.payment_method || 'Cash').toUpperCase();
                const gross = formatCurrency(log.amount || 0);
                const disc = formatCurrency(log.discount_amount || 0);
                const finalAmt = formatCurrency(log.final_amount || log.amount || 0);
                const st = (log.status || 'paid').toLowerCase();
                const statusHtml = st === 'paid'
                    ? '<span class="status-pill completed">Paid</span>'
                    : (st === 'refunded' ? '<span class="status-pill cancelled">Refunded</span>' : `<span class="status-pill pending">${st}</span>`);

                return `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px; font-size:0.83rem;">${date}</td>
                    <td style="padding:10px; font-weight:600; font-size:0.83rem;">${method}</td>
                    <td style="padding:10px; font-size:0.83rem;">${gross}</td>
                    <td style="padding:10px; font-size:0.83rem; color:#f43f5e;">-${disc}</td>
                    <td style="padding:10px; font-weight:700; color:#10b981; font-size:0.85rem;">${finalAmt}</td>
                    <td style="padding:10px;">${statusHtml}</td>
                </tr>`;
            }).join('');
        }).catch(err => {
            const tbody = document.getElementById('drilldownTbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#ef4444;">Error retrieving settlements.</td></tr>';
        });
}

function ensureTabBar(container) {
    let tabBar = document.getElementById('reportTabBar');
    if (!tabBar) {
        tabBar = document.createElement('div');
        tabBar.id = 'reportTabBar';
        tabBar.className = 'report-tab-bar';
        const topBar = container.querySelector('.table-top-bar');
        if (topBar) topBar.insertAdjacentElement('afterend', tabBar);
    }
    tabBar.style.display = 'flex';
    return tabBar;
}

function removeTabBar() {
    const tabBar = document.getElementById('reportTabBar');
    if (tabBar) tabBar.style.display = 'none';
}

function makeStatusPill(status) {
    const s = (status || 'active').toLowerCase();
    if (['paid', 'completed', 'active', 'confirmed', 'applied'].includes(s)) {
        return `<span class="status-pill completed" style="text-transform:capitalize;">${status || 'Paid'}</span>`;
    }
    if (['refunded', 'cancelled', 'deleted', 'reversed'].includes(s)) {
        return `<span class="status-pill cancelled" style="text-transform:capitalize;">${status || 'Cancelled'}</span>`;
    }
    return `<span class="status-pill pending" style="text-transform:capitalize;">${status || 'Pending'}</span>`;
}

// =============================================================================
// SUB-REPORT 1: Executive Overview (P&L Reconciliation)
// =============================================================================

async function renderFinOverview(data, supabase) {
    removeTabBar();
    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.overview || rpcPayload?.fin_overview;

    if (!live || !live.kpis) {
        console.warn('[financial] Overview data unavailable from RPC. Rendering zeroed view.');
        data.kpi1 = { label: 'Gross Revenue', value: '₹0', sub: '+0% Realized Inflows' };
        data.kpi2 = { label: 'Total Realized Outflow', value: '₹0', sub: 'Expenses + Refunds' };
        data.kpi3 = { label: 'Net Profit', value: '₹0', sub: 'Net Operating Profit' };
        data.kpi4 = { label: 'Operating Margin', value: '0%', sub: 'Realized Margin' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Period (Date)', 'Services Rev', 'Retail Rev', 'Membership Rev', 'Gross Inflow', 'Discounts', 'Expenses', 'Refunds', 'Net Realized', 'Margin %'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Gross Revenue',          value: formatCurrency(k.gross_revenue), sub: '+100% Total Inflows' };
    data.kpi2 = { label: 'Total Realized Outflow',  value: formatCurrency(k.total_outflow), sub: 'Expenses + Customer Refunds' };
    data.kpi3 = { label: 'Net Profit',             value: formatCurrency(k.net_profit),    sub: `${k.net_profit >= 0 ? '+' : ''}${k.operating_margin_pct}% Operating Margin` };
    data.kpi4 = { label: 'Operating Margin',       value: `${k.operating_margin_pct}%`,   sub: 'Net / Gross Revenue' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Inflow vs Outflow Trend
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        [],
        {
            multiSeries: true,
            series: [
                {
                    label: 'Gross Inflow (₹)',
                    data: timeline.map(t => t.inflow),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5
                },
                {
                    label: 'Outflow (Exp + Ref) (₹)',
                    data: timeline.map(t => t.outflow),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5
                }
            ],
            type: 'line'
        }
    );

    // Right Chart: Outflow Distribution
    const distLabels = live.outflow_distribution?.labels || ['Operating Expenses', 'Discounts Given', 'Customer Refunds'];
    const distValues = live.outflow_distribution?.values || [k.total_expenses, k.total_discounts, k.total_refunds];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#f59e0b', '#6366f1', '#ef4444'],
        heroLabelPrefix: 'Primary Outflow:'
    });

    // Table: Daily Ledger
    const headers = ['Period (Date)', 'Services Rev', 'Retail Rev', 'Membership Rev', 'Gross Inflow', 'Discounts', 'Expenses', 'Refunds', 'Net Realized', 'Margin %'];
    const rows = (live.ledger || []).map(d => [
        `<span style="font-weight:600; color:#0f172a;">${d.date}</span>`,
        formatCurrency(d.bookings_rev),
        formatCurrency(d.retail_rev),
        formatCurrency(d.membership_rev),
        `<strong style="color:#0f172a;">${formatCurrency(d.gross)}</strong>`,
        `<span style="color:#6366f1;">-${formatCurrency(d.discounts)}</span>`,
        `<span style="color:#f59e0b;">-${formatCurrency(d.expenses)}</span>`,
        `<span style="color:#ef4444;">-${formatCurrency(d.refunds)}</span>`,
        `<strong style="color:${d.net >= 0 ? '#10b981' : '#ef4444'};">${formatCurrency(d.net)}</strong>`,
        `<span class="status-pill ${d.margin >= 25 ? 'completed' : (d.margin >= 0 ? 'pending' : 'cancelled')}">${d.margin}%</span>`
    ]);

    setupReportTable(headers, rows, {
        unitName: 'daily records',
        reportFileName: 'Financial_Overview_Ledger',
        searchPlaceholder: 'Search date, amounts or margins...'
    });
}

// =============================================================================
// SUB-REPORT 2: Incoming Revenue Streams
// =============================================================================

async function renderFinRevenue(data, supabase) {
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.revenue || rpcPayload?.fin_revenue;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Incoming Revenue', value: '₹0', sub: 'No collections' };
        data.kpi2 = { label: 'Service Bookings',       value: '₹0', sub: '0% of Total' };
        data.kpi3 = { label: 'Retail Product Sales',   value: '₹0', sub: '0% of Total' };
        data.kpi4 = { label: 'Membership Plans',       value: '₹0', sub: '0% of Total' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Reference #', 'Date & Time', 'Stream', 'Customer', 'Staff', 'Gross Price', 'Discount', 'Final Paid', 'Status', 'Action'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Incoming Revenue', value: formatCurrency(k.total_revenue),      sub: 'Realized Collections' };
    data.kpi2 = { label: 'Service Bookings',       value: formatCurrency(k.service_revenue),    sub: `${k.service_pct}% of Total Revenue` };
    data.kpi3 = { label: 'Retail Product Sales',   value: formatCurrency(k.retail_revenue),     sub: `${k.retail_pct}% of Total Revenue` };
    data.kpi4 = { label: 'Membership Plans',       value: formatCurrency(k.membership_revenue), sub: `${k.membership_pct}% of Total Revenue` };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Multi-Stream Daily Timeline
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        [],
        {
            multiSeries: true,
            series: [
                {
                    label: 'Services (₹)',
                    data: timeline.map(t => t.service_rev),
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                },
                {
                    label: 'Retail POS (₹)',
                    data: timeline.map(t => t.retail_rev),
                    backgroundColor: '#0ea5e9',
                    borderRadius: 4
                },
                {
                    label: 'Memberships (₹)',
                    data: timeline.map(t => t.membership_rev),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }
            ],
            type: 'bar'
        }
    );

    // Right Chart: Contribution
    const distLabels = live.distribution?.labels || ['Service Bookings', 'Retail Products', 'Membership Plans'];
    const distValues = live.distribution?.values || [k.service_revenue, k.retail_revenue, k.membership_revenue];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#6366f1', '#0ea5e9', '#8b5cf6'],
        heroLabelPrefix: 'Top Stream:'
    });

    const ledgers = live.ledgers || {};
    const services = ledgers.services || [];
    const products = ledgers.products || [];
    const memberships = ledgers.memberships || [];
    const all = [...services, ...products, ...memberships].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Streams <span class="tab-badge">${all.length}</span></button>
        <button class="report-tab-btn" data-tab="services"><i data-feather="calendar" style="width:13px;height:13px;"></i> Services <span class="tab-badge">${services.length}</span></button>
        <button class="report-tab-btn" data-tab="products"><i data-feather="package" style="width:13px;height:13px;"></i> Retail POS <span class="tab-badge">${products.length}</span></button>
        <button class="report-tab-btn" data-tab="memberships"><i data-feather="award" style="width:13px;height:13px;"></i> Memberships <span class="tab-badge">${memberships.length}</span></button>
    `;
    if (window.feather) feather.replace();

    window.showFinDrilldown = (refId) => showDrilldownModal(refId, supabase);

    const headers = ['Reference #', 'Date & Time', 'Stream', 'Customer', 'Staff / Desk', 'Gross Price', 'Discount', 'Final Paid', 'Status', 'Action'];
    const formatRow = (r) => [
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">#${r.ref_code || 'ORD'}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${r.date}</span>`,
        `<span class="status-pill active">${r.stream_type}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${r.customer_name || 'Guest'}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${r.customer_phone || '—'}</span></div>`,
        `<span style="font-size:0.83rem; font-weight:500; color:#334155;">${r.staff_name || 'Staff'}</span>`,
        formatCurrency(r.gross),
        `<span style="color:#f43f5e;">-${formatCurrency(r.discount)}</span>`,
        `<strong style="color:#10b981; font-size:0.85rem;">${formatCurrency(r.final_paid)}</strong>`,
        makeStatusPill(r.status),
        `<button class="btn-top-action" style="padding:3px 8px; font-size:0.75rem;" onclick="window.showFinDrilldown('${r.ref_id}')">Audit</button>`
    ];

    const tabData = {
        all: all.map(formatRow),
        services: services.map(formatRow),
        products: products.map(formatRow),
        memberships: memberships.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'revenue transactions',
            reportFileName: `Revenue_Streams_${tab}`,
            searchPlaceholder: 'Search customer, staff, reference or stream...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 3: Payments & Collections (Tender Reconciliation)
// =============================================================================

async function renderFinPayments(data, supabase) {
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.payments || rpcPayload?.fin_payments;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Collections', value: '₹0', sub: '0 transactions' };
        data.kpi2 = { label: 'Cash in Drawer',   value: '₹0', sub: 'Cash on hand' };
        data.kpi3 = { label: 'UPI / QR Codes',   value: '₹0', sub: 'Digital payments' };
        data.kpi4 = { label: 'Cards & POS',      value: '₹0', sub: 'POS machines' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Payment ID', 'Settlement Date', 'Order Ref', 'Stream', 'Tender Method', 'Gross Bill', 'Discount', 'Settled Amount', 'Notes / Audit'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Collections', value: formatCurrency(k.total_collected), sub: `${k.payment_count} verified settlements` };
    data.kpi2 = { label: 'Cash in Drawer',   value: formatCurrency(k.cash_in_drawer),  sub: 'Physical Cash on Hand' };
    data.kpi3 = { label: 'UPI / QR Codes',   value: formatCurrency(k.upi_amount),      sub: 'Instant Digital Collections' };
    data.kpi4 = { label: 'Cards & Others',   value: formatCurrency((k.card_amount || 0) + (k.other_amount || 0)), sub: 'POS Terminal & Bank Modes' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Daily Collections Timeline
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        timeline.map(t => t.amount),
        { color: '#10b981', seriesLabel: 'Collected (₹)' }
    );

    // Right Chart: Tender Distribution
    const distLabels = live.distribution?.labels || ['Cash in Drawer', 'UPI / QR Codes', 'Cards & POS', 'Others / Bank'];
    const distValues = live.distribution?.values || [k.cash_in_drawer, k.upi_amount, k.card_amount, k.other_amount];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#10b981', '#3b82f6', '#8b5cf6', '#64748b'],
        heroLabelPrefix: 'Primary Mode:'
    });

    const allPayments = live.ledgers?.all || [];
    const cashPayments = allPayments.filter(p => (p.method || '').toLowerCase() === 'cash');
    const upiPayments = allPayments.filter(p => (p.method || '').toLowerCase().includes('upi'));
    const otherPayments = allPayments.filter(p => !['cash'].includes((p.method || '').toLowerCase()) && !(p.method || '').toLowerCase().includes('upi'));

    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="list" style="width:13px;height:13px;"></i> All Payments <span class="tab-badge">${allPayments.length}</span></button>
        <button class="report-tab-btn" data-tab="cash"><i data-feather="dollar-sign" style="width:13px;height:13px;"></i> Cash Drawer <span class="tab-badge">${cashPayments.length}</span></button>
        <button class="report-tab-btn" data-tab="upi"><i data-feather="smartphone" style="width:13px;height:13px;"></i> UPI / QR <span class="tab-badge">${upiPayments.length}</span></button>
        <button class="report-tab-btn" data-tab="others"><i data-feather="credit-card" style="width:13px;height:13px;"></i> Cards & Other <span class="tab-badge">${otherPayments.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Payment ID', 'Settlement Date', 'Order Ref', 'Stream', 'Tender Method', 'Gross Bill', 'Discount', 'Settled Amount', 'Notes / Audit'];
    const formatRow = (p) => [
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">#${p.payment_id}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${p.date}</span>`,
        `<span style="font-family:monospace; font-weight:600; color:#0f172a;">${p.order_ref}</span>`,
        `<span class="status-pill active">${p.stream}</span>`,
        `<span style="font-weight:700; font-size:0.8rem; color:${p.method === 'CASH' ? '#10b981' : (p.method.includes('UPI') ? '#3b82f6' : '#8b5cf6')};">${p.method}</span>`,
        formatCurrency(p.gross),
        `<span style="color:#f43f5e;">-${formatCurrency(p.discount)}</span>`,
        `<strong style="color:#0f172a; font-size:0.85rem;">${formatCurrency(p.settled)}</strong>`,
        `<span style="font-size:0.78rem; color:#64748b;">${p.notes || 'Settled Verified'}</span>`
    ];

    const tabData = {
        all: allPayments.map(formatRow),
        cash: cashPayments.map(formatRow),
        upi: upiPayments.map(formatRow),
        others: otherPayments.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'settlement entries',
            reportFileName: `Payments_${tab}`,
            searchPlaceholder: 'Search payment ref, method, order or amount...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 4: Operating Expenses
// =============================================================================

async function renderFinExpenses(data, supabase) {
    removeTabBar();
    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.expenses || rpcPayload?.fin_expenses;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Operating Expenses', value: '₹0', sub: '0 vouchers logged' };
        data.kpi2 = { label: 'Average Voucher',         value: '₹0', sub: 'Per voucher' };
        data.kpi3 = { label: 'Expense Ratio',            value: '0%', sub: '0% of Gross Revenue' };
        data.kpi4 = { label: 'Top Cost Category',        value: 'None', sub: 'No expenditures' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Expense Date', 'Voucher #', 'Category', 'Vendor / Recipient', 'Amount', 'Logged By', 'Notes', 'Status'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Operating Expenses', value: formatCurrency(k.total_expenses), sub: `${k.expense_count} vouchers logged` };
    data.kpi2 = { label: 'Average Voucher',         value: formatCurrency(k.avg_expense),    sub: 'Per Logged Outflow' };
    data.kpi3 = { label: 'Expense Ratio',            value: `${k.expense_ratio_pct}%`,        sub: 'Expenses / Gross Revenue' };
    data.kpi4 = { label: 'Top Cost Category',        value: k.top_category,                   sub: 'Highest Outflow Bucket' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Daily Expense Outflows
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        timeline.map(t => t.amount),
        { color: '#f59e0b', seriesLabel: 'Expense (₹)' }
    );

    // Right Chart: Category Distribution
    const distLabels = live.distribution?.labels || [];
    const distValues = live.distribution?.values || [];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#64748b'],
        heroLabelPrefix: 'Top Cost:'
    });

    const headers = ['Expense Date', 'Voucher #', 'Category', 'Vendor / Recipient', 'Amount', 'Logged By', 'Notes', 'Status'];
    const rows = (live.ledgers?.all || []).map(e => [
        `<span style="font-weight:600; color:#0f172a;">${e.date}</span>`,
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">#${e.expense_id}</span>`,
        `<span class="status-pill active">${e.category}</span>`,
        `<strong style="font-size:0.83rem; color:#334155;">${e.recipient || 'Vendor / Store'}</strong>`,
        `<strong style="color:#ef4444; font-size:0.85rem;">-${formatCurrency(e.amount)}</strong>`,
        `<span style="font-size:0.82rem; color:#475569;">${e.logged_by || 'Staff'}</span>`,
        `<span style="font-size:0.78rem; color:#64748b;">${e.notes || '—'}</span>`,
        makeStatusPill(e.status)
    ]);

    setupReportTable(headers, rows, {
        unitName: 'expense items',
        reportFileName: 'Operating_Expenses_Ledger',
        searchPlaceholder: 'Search category, vendor, voucher or notes...'
    });
}

// =============================================================================
// SUB-REPORT 5: Discounts & Deductions (Revenue Erosion)
// =============================================================================

async function renderFinDiscounts(data, supabase) {
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.discounts || rpcPayload?.fin_discounts;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Net Discounts',  value: '₹0', sub: '0% Margin Leak' };
        data.kpi2 = { label: 'Revenue Erosion Rate', value: '0%', sub: 'Discounts / Gross' };
        data.kpi3 = { label: 'Special Offers',       value: '₹0', sub: 'Promo campaigns' };
        data.kpi4 = { label: 'Coupons & Perks',      value: '₹0', sub: 'Coupons + Memberships' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Date Applied', 'Order Ref', 'Discount Type', 'Campaign / Plan', 'Customer', 'Applied On', 'Gross Disc', 'Reversal', 'Net Erosion', 'Staff', 'Status'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Net Discounts',  value: formatCurrency(k.total_net_discounts), sub: 'Realized Margin Leak' };
    data.kpi2 = { label: 'Revenue Erosion Rate', value: `${k.erosion_rate_pct}%`,              sub: 'Discounts / Gross Revenue' };
    data.kpi3 = { label: 'Special Offers',       value: formatCurrency(k.offer_discounts),     sub: 'Campaign Reductions' };
    data.kpi4 = { label: 'Coupons & Perks',      value: formatCurrency((k.coupon_discounts || 0) + (k.membership_discounts || 0)), sub: `Coupons: ${formatCurrency(k.coupon_discounts)} | Perks: ${formatCurrency(k.membership_discounts)}` };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Daily Net Discount Leak
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        timeline.map(t => t.amount),
        { color: '#6366f1', seriesLabel: 'Net Discount (₹)' }
    );

    // Right Chart: Discount Distribution
    const distLabels = live.distribution?.labels || ['Special Offers', 'Coupon Codes', 'Membership Perks'];
    const distValues = live.distribution?.values || [k.offer_discounts, k.coupon_discounts, k.membership_discounts];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#3b82f6', '#10b981', '#8b5cf6'],
        heroLabelPrefix: 'Top Leak:'
    });

    const allDiscounts = live.ledgers?.all || [];
    const couponItems = allDiscounts.filter(d => (d.type || '').toLowerCase() === 'coupon');
    const offerItems = allDiscounts.filter(d => (d.type || '').toLowerCase() === 'offer');
    const memberItems = allDiscounts.filter(d => (d.type || '').toLowerCase() === 'membership');

    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="percent" style="width:13px;height:13px;"></i> All Deductions <span class="tab-badge">${allDiscounts.length}</span></button>
        <button class="report-tab-btn" data-tab="coupon"><i data-feather="tag" style="width:13px;height:13px;"></i> Coupons <span class="tab-badge">${couponItems.length}</span></button>
        <button class="report-tab-btn" data-tab="offer"><i data-feather="gift" style="width:13px;height:13px;"></i> Offers <span class="tab-badge">${offerItems.length}</span></button>
        <button class="report-tab-btn" data-tab="membership"><i data-feather="award" style="width:13px;height:13px;"></i> Member Perks <span class="tab-badge">${memberItems.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Date Applied', 'Order Ref', 'Discount Type', 'Campaign / Plan', 'Customer', 'Applied On', 'Gross Disc', 'Reversal', 'Net Erosion', 'Staff', 'Status'];
    const formatRow = (d) => [
        `<span style="font-size:0.82rem; color:#475569;">${d.date}</span>`,
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">${d.ref_id}</span>`,
        `<span class="status-pill active" style="text-transform:capitalize;">${d.type}</span>`,
        `<strong style="font-size:0.83rem; color:#0f172a;">${d.name}</strong>`,
        `<span style="font-size:0.83rem; color:#334155;">${d.customer || 'Customer'}</span>`,
        `<span class="status-pill pending">${d.applied_on}</span>`,
        formatCurrency(d.gross),
        `<span style="color:#10b981;">+${formatCurrency(d.reversal)}</span>`,
        `<strong style="color:#f43f5e; font-size:0.85rem;">-${formatCurrency(d.net)}</strong>`,
        `<span style="font-size:0.82rem; color:#475569;">${d.staff || 'Staff'}</span>`,
        makeStatusPill(d.status)
    ];

    const tabData = {
        all: allDiscounts.map(formatRow),
        coupon: couponItems.map(formatRow),
        offer: offerItems.map(formatRow),
        membership: memberItems.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'discount usages',
            reportFileName: `Discounts_${tab}`,
            searchPlaceholder: 'Search promo code, plan name, order or staff...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 6: Refunds & Returns (Outgoing Revenue Leaks)
// =============================================================================

async function renderFinRefunds(data, supabase) {
    removeTabBar();
    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.refunds || rpcPayload?.fin_refunds;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Customer Refunds', value: '₹0', sub: '0 refunds processed' };
        data.kpi2 = { label: 'Refund Rate',             value: '0%', sub: '0% of Gross Revenue' };
        data.kpi3 = { label: 'Average Refund',          value: '₹0', sub: 'Per dispute' };
        data.kpi4 = { label: 'Plan & Product Refunds',  value: '₹0', sub: 'Memberships + Retail' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Refund ID', 'Date Processed', 'Original Order', 'Stream', 'Customer', 'Original Price', 'Refund Amount', 'Tender Method', 'Reason / Notes'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Customer Refunds', value: formatCurrency(k.total_refunded), sub: `${k.refund_count} refunds processed` };
    data.kpi2 = { label: 'Refund Rate',             value: `${k.refund_rate_pct}%`,          sub: 'Refunds / Gross Revenue' };
    data.kpi3 = { label: 'Average Refund',          value: formatCurrency(k.avg_refund),     sub: 'Per Disputed Order' };
    data.kpi4 = { label: 'Plan & Product Refunds',  value: formatCurrency((k.membership_refunds || 0) + (k.product_refunds || 0)), sub: `Bookings: ${formatCurrency(k.booking_refunds)}` };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Daily Refund Trend
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        timeline.map(t => t.amount),
        { color: '#ef4444', seriesLabel: 'Refunded (₹)' }
    );

    // Right Chart: Refund Stream Distribution
    const distLabels = live.distribution?.labels || ['Booking Cancellations', 'POS Product Returns', 'Membership Cancellations'];
    const distValues = live.distribution?.values || [k.booking_refunds, k.product_refunds, k.membership_refunds];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#ef4444', '#f59e0b', '#8b5cf6'],
        heroLabelPrefix: 'Primary Leak:'
    });

    const headers = ['Refund ID', 'Date Processed', 'Original Order', 'Stream', 'Customer', 'Original Price', 'Refund Amount', 'Tender Method', 'Reason / Notes'];
    const rows = (live.ledgers?.all || []).map(r => [
        `<span style="font-family:monospace; font-weight:700; color:#ef4444;">#${r.refund_id}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${r.date}</span>`,
        `<span style="font-family:monospace; font-weight:600; color:#0f172a;">${r.order_ref}</span>`,
        `<span class="status-pill cancelled">${r.stream}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${r.customer}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${r.phone}</span></div>`,
        formatCurrency(r.original_price),
        `<strong style="color:#ef4444; font-size:0.85rem;">-${formatCurrency(r.refund_amount)}</strong>`,
        `<span style="font-weight:600; font-size:0.8rem; color:#475569; text-transform:uppercase;">${r.method}</span>`,
        `<span style="font-size:0.78rem; color:#64748b;">${r.reason}</span>`
    ]);

    setupReportTable(headers, rows, {
        unitName: 'refund records',
        reportFileName: 'Customer_Refunds_Ledger',
        searchPlaceholder: 'Search refund ID, customer, order or reason...'
    });
}

// =============================================================================
// SUB-REPORT 7: Pending Dues & Receivables
// =============================================================================

async function renderFinPendingDues(data, supabase) {
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const companyId = resolveCompanyId();
    const branchId = resolveBranchId(filterBranch);
    const start = filterStart?.value || null;
    const end = filterEnd?.value || null;

    const rpcPayload = await fetchFinancialReportData(supabase, companyId, branchId, start, end);
    const live = rpcPayload?.dues || rpcPayload?.fin_pending_dues;

    if (!live || !live.kpis) {
        data.kpi1 = { label: 'Total Outstanding Dues', value: '₹0', sub: '0 open balances' };
        data.kpi2 = { label: 'Open Balances',          value: '0',  sub: 'Clients with dues' };
        data.kpi3 = { label: 'Average Due per Client',  value: '₹0', sub: 'Receivable / Count' };
        data.kpi4 = { label: 'Aged Dues (>15 Days)',   value: '₹0', sub: 'Critical aging' };
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
        renderFinTrendChart([], []);
        renderFinDistributionChart([], []);
        setupReportTable(['Invoice Ref', 'Date Created', 'Stream', 'Customer', 'Total Bill', 'Paid So Far', 'Balance Due', 'Aging', 'Action'], []);
        return;
    }

    const k = live.kpis;
    data.kpi1 = { label: 'Total Outstanding Dues', value: formatCurrency(k.total_pending_dues), sub: 'Uncollected Accounts Receivable' };
    data.kpi2 = { label: 'Open Balances',          value: `${k.pending_count}`,                 sub: 'Clients with Pending Dues' };
    data.kpi3 = { label: 'Average Due per Client',  value: formatCurrency(k.avg_due_per_client), sub: 'Receivable / Client Count' };
    data.kpi4 = { label: 'Aged Dues (>15 Days)',   value: formatCurrency(k.aged_dues_over_15d), sub: 'Critical Overdue Exposure' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Pending Dues Inflow Timeline
    const timeline = live.timeline || [];
    renderFinTrendChart(
        timeline.map(t => t.date),
        timeline.map(t => t.amount),
        { color: '#ef4444', seriesLabel: 'Due Amount (₹)' }
    );

    // Right Chart: Stream Breakdown
    const distLabels = live.distribution?.labels || ['Service Appointments', 'Retail POS Sales', 'Membership Dues'];
    const distValues = live.distribution?.values || [];
    renderFinDistributionChart(distLabels, distValues, {
        colors: ['#3b82f6', '#0ea5e9', '#8b5cf6'],
        heroLabelPrefix: 'Primary Stream:'
    });

    const allDues = live.ledgers?.all || [];
    const serviceDues = allDues.filter(d => (d.stream || '').toLowerCase().includes('service'));
    const productDues = allDues.filter(d => (d.stream || '').toLowerCase().includes('product'));
    const overdueDues = allDues.filter(d => {
        const days = parseInt(d.aging);
        return !isNaN(days) && days > 15;
    });

    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="clock" style="width:13px;height:13px;"></i> All Receivables <span class="tab-badge">${allDues.length}</span></button>
        <button class="report-tab-btn" data-tab="service"><i data-feather="calendar" style="width:13px;height:13px;"></i> Services <span class="tab-badge">${serviceDues.length}</span></button>
        <button class="report-tab-btn" data-tab="product"><i data-feather="shopping-bag" style="width:13px;height:13px;"></i> Retail POS <span class="tab-badge">${productDues.length}</span></button>
        <button class="report-tab-btn" data-tab="overdue"><i data-feather="alert-circle" style="width:13px;height:13px;"></i> Aged >15d <span class="tab-badge">${overdueDues.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Invoice Ref', 'Date Created', 'Stream', 'Customer', 'Total Bill', 'Paid So Far', 'Balance Due', 'Aging', 'Action'];
    const formatRow = (d) => [
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">${d.invoice_ref}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${d.date}</span>`,
        `<span class="status-pill active">${d.stream}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${d.customer}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${d.phone}</span></div>`,
        formatCurrency(d.total),
        `<span style="color:#10b981; font-weight:500;">${formatCurrency(d.paid)}</span>`,
        `<strong style="color:#ef4444; font-size:0.85rem;">${formatCurrency(d.due)}</strong>`,
        `<span class="status-pill pending" style="font-size:0.75rem;">${d.aging}</span>`,
        `<button class="btn-top-action" style="padding:3px 10px; font-size:0.75rem; background:#6366f1; color:#fff;" onclick="alert('Client: ${d.customer}\\nPending: ${formatCurrency(d.due)}\\nPhone: ${d.phone}')">Collect</button>`
    ];

    const tabData = {
        all: allDues.map(formatRow),
        service: serviceDues.map(formatRow),
        product: productDues.map(formatRow),
        overdue: overdueDues.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'receivable entries',
            reportFileName: `Pending_Dues_${tab}`,
            searchPlaceholder: 'Search invoice, customer, aging or amount...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// Main Dispatcher
// =============================================================================

const handlers = {
    'fin-overview': renderFinOverview,
    'financial': renderFinOverview,
    'fin-revenue': renderFinRevenue,
    'fin-payments': renderFinPayments,
    'fin-expenses': renderFinExpenses,
    'expenses': renderFinExpenses,
    'fin-discounts': renderFinDiscounts,
    'fin-refunds': renderFinRefunds,
    'fin-pending-dues': renderFinPendingDues
};

export async function render(data, supabase, type = data?.type) {
    console.log('[financial] Dispatching render for type:', type);
    const companyId = resolveCompanyId();
    const filterBranch = document.getElementById('filterBranch');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const btnApply = document.getElementById('btnApplyFilters');

    setDefaultDateRange(filterStart, filterEnd);
    if (companyId) {
        await initBranchDropdown(supabase, companyId, filterBranch);
    }

    const handler = handlers[type] || handlers['fin-overview'];

    // Invalidate cached RPC data whenever the user triggers a filter refresh
    const executeReport = async () => {
        cachedRpcPayload = null;
        try {
            await handler(data, supabase);
        } catch (err) {
            console.error('[financial] Error executing report renderer:', err);
        }
    };

    if (btnApply) {
        btnApply.onclick = executeReport;
    }
    if (filterBranch) {
        filterBranch.onchange = executeReport;
    }

    try {
        await handler(data, supabase);
    } catch (err) {
        console.error('[financial] Error executing report renderer:', err);
    }
}
