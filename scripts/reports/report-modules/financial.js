// scripts/reports/report-modules/financial.js
// Complete Financial Reports Suite (Executive P&L, Revenue, Payments, Expenses, Discounts, Refunds, Dues)
// Designed for unified Master RPC: public.get_financial_report(p_company_id, p_branch_id, p_start_date, p_end_date)
// Includes high-fidelity realistic preview fallbacks matching the 6-table database schema.

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

// Custom Styled Bar/Line Trend Chart
function renderFinTrendChart(labels, values, options = {}) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    trendChartInstance = destroyChart(trendChartInstance);

    const chartType = options.type || 'bar';
    const primaryColor = options.color || '#3b82f6';
    const secondaryColor = options.secondaryColor || '#818cf8';

    let datasets = [];
    if (options.multiSeries && options.series) {
        datasets = options.series;
    } else {
        const backgroundColors = values.map((_, i) => i === values.length - 1 ? primaryColor : '#e2e8f0');
        datasets = [{
            label: options.seriesLabel || 'Amount (₹)',
            data: values,
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
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: !!(options.multiSeries && options.series),
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 11, family: 'Inter' } }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 10,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 12 },
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` ${(ctx.dataset.label || 'Amount')}: ${formatCurrency(ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9', drawBorder: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: (v) => formatCurrency(v)
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// Custom Styled Donut Distribution Chart
function renderFinDistributionChart(labels, values, options = {}) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    distChartInstance = destroyChart(distChartInstance);

    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e'];
    const colors = options.colors || defaultColors.slice(0, labels.length);

    distChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
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
        const total = values.reduce((a, b) => a + b, 0);
        if (labels.length === 0 || total === 0) {
            legendContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.875rem; text-align:center;">No data available</div>';
        } else {
            legendContainer.innerHTML = labels.map((l, i) => {
                const val = values[i] || 0;
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
        const total = values.reduce((a, b) => a + b, 0);
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

// Ensure clean tab bar between report switches
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

// Status Pill helper
function makeStatusPill(status) {
    const s = (status || 'active').toLowerCase();
    if (['paid', 'completed', 'active', 'confirmed'].includes(s)) {
        return `<span class="status-pill completed" style="text-transform:capitalize;">${status || 'Paid'}</span>`;
    }
    if (['refunded', 'cancelled', 'deleted'].includes(s)) {
        return `<span class="status-pill cancelled" style="text-transform:capitalize;">${status || 'Cancelled'}</span>`;
    }
    return `<span class="status-pill pending" style="text-transform:capitalize;">${status || 'Pending'}</span>`;
}

// =============================================================================
// Realistic Mock Fallback Generator (Step 1 Frontend Design)
// Matches schemas: business_transactions, bookings, sales, memberships, expenses, discount_usages
// =============================================================================

function generateMockFinancialData() {
    const customers = [
        { name: 'Ananya Sharma', phone: '+91 98765 43210' },
        { name: 'Rajesh Patel', phone: '+91 98234 56789' },
        { name: 'Sneha Reddy', phone: '+91 99887 76655' },
        { name: 'Vikram Mehta', phone: '+91 97654 32109' },
        { name: 'Kavita Nair', phone: '+91 98450 12345' },
        { name: 'Deepak Joshi', phone: '+91 91234 56780' },
        { name: 'Pooja Iyer', phone: '+91 99112 23344' },
        { name: 'Arjun Das', phone: '+91 98334 55667' }
    ];

    const staffMembers = ['Sarah Jenkins', 'Michael Chang', 'Priya Rao', 'David Miller', 'Anita Desai'];

    // 1. Overview Daily Reconciliation
    const overviewDays = [];
    const dateLabels = [];
    const inflowTrend = [];
    const outflowTrend = [];
    let grossTotal = 0, expensesTotal = 0, refundsTotal = 0, discountsTotal = 0;

    for (let i = 14; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        dateLabels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));

        const bRev = 6000 + Math.floor(Math.random() * 8000);
        const pRev = 2500 + Math.floor(Math.random() * 4500);
        const mRev = (i % 3 === 0) ? 3500 + Math.floor(Math.random() * 4000) : 0;
        const dayGross = bRev + pRev + mRev;
        const dayDisc = Math.floor(dayGross * (0.08 + Math.random() * 0.07));
        const dayExp = 1800 + Math.floor(Math.random() * 2500);
        const dayRef = (i % 4 === 0) ? 800 + Math.floor(Math.random() * 1200) : 0;
        const netRealized = dayGross - dayDisc - dayExp - dayRef;
        const marginPerc = Math.round((netRealized / dayGross) * 100);

        grossTotal += dayGross;
        expensesTotal += dayExp;
        refundsTotal += dayRef;
        discountsTotal += dayDisc;

        inflowTrend.push(dayGross);
        outflowTrend.push(dayExp + dayRef);

        overviewDays.push({
            date: dStr,
            bookingsRev: bRev,
            retailRev: pRev,
            membershipRev: mRev,
            gross: dayGross,
            discounts: dayDisc,
            expenses: dayExp,
            refunds: dayRef,
            net: netRealized,
            margin: marginPerc
        });
    }

    // 2. Revenue Ledger (Bookings, Sales, Memberships)
    const revenueItems = [];
    for (let i = 0; i < 24; i++) {
        const c = customers[i % customers.length];
        const staff = staffMembers[i % staffMembers.length];
        const streamType = i % 3 === 0 ? 'Service' : (i % 3 === 1 ? 'Product' : 'Membership');
        const refCode = `${streamType.slice(0, 2).toUpperCase()}-${1000 + i}`;
        const refId = `00000000-0000-0000-0000-${String(1000 + i).padStart(12, '0')}`;
        const d = new Date();
        d.setHours(d.getHours() - (i * 3));
        const dStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        const gross = streamType === 'Service' ? 1200 + (i * 150) : (streamType === 'Product' ? 850 + (i * 110) : 4500);
        const disc = Math.round(gross * 0.1);
        const finalAmt = gross - disc;

        revenueItems.push({
            refCode,
            refId,
            date: dStr,
            streamType,
            customerName: c.name,
            customerPhone: c.phone,
            staff,
            gross,
            discount: disc,
            finalPaid: finalAmt,
            status: 'paid'
        });
    }

    // 3. Payments Ledger
    const paymentItems = [];
    const methods = ['cash', 'upi', 'card', 'upi', 'cash'];
    for (let i = 0; i < 20; i++) {
        const c = customers[i % customers.length];
        const method = methods[i % methods.length];
        const refType = i % 2 === 0 ? 'booking' : 'product';
        const d = new Date();
        d.setHours(d.getHours() - (i * 4));
        const dStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const gross = 1500 + (i * 120);
        const disc = i % 2 === 0 ? 150 : 0;
        const settled = gross - disc;

        paymentItems.push({
            paymentId: `PAY-${5000 + i}`,
            date: dStr,
            orderRef: `#${refType.slice(0, 2).toUpperCase()}-${2000 + i}`,
            stream: refType === 'booking' ? 'Service' : 'Product',
            customer: c.name,
            method,
            gross,
            discount: disc,
            settled,
            notes: `${method.toUpperCase()} Settlement Verified`
        });
    }

    // 4. Expenses Ledger
    const expenseCategories = ['Salaries', 'Salon Supplies', 'Rent', 'Electricity & Utilities', 'Marketing', 'Maintenance'];
    const expenseItems = [];
    for (let i = 0; i < 18; i++) {
        const cat = expenseCategories[i % expenseCategories.length];
        const d = new Date();
        d.setDate(d.getDate() - (i * 2));
        const dStr = d.toISOString().split('T')[0];
        const amt = cat === 'Rent' ? 45000 : (cat === 'Salaries' ? 22000 : (1200 + Math.floor(Math.random() * 4500)));

        expenseItems.push({
            date: dStr,
            expenseId: `EXP-${7000 + i}`,
            category: cat,
            recipient: cat === 'Salaries' ? 'Staff Payroll' : (cat === 'Rent' ? 'Property Owner' : 'Salon Store Vendor'),
            amount: amt,
            loggedBy: staffMembers[i % staffMembers.length],
            notes: `Monthly operational voucher #${i + 1}`,
            status: 'completed'
        });
    }

    // 5. Discounts Ledger
    const discountTypes = ['offer', 'coupon', 'membership'];
    const discountItems = [];
    for (let i = 0; i < 20; i++) {
        const c = customers[i % customers.length];
        const dt = discountTypes[i % discountTypes.length];
        const d = new Date();
        d.setHours(d.getHours() - (i * 5));
        const dStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const gross = 1800 + (i * 140);
        const disc = dt === 'membership' ? Math.round(gross * 0.2) : (dt === 'coupon' ? 300 : 250);
        const reversal = (i === 4 || i === 11) ? disc : 0;
        const net = disc - reversal;

        discountItems.push({
            date: dStr,
            refId: `#ORD-${3000 + i}`,
            type: dt,
            name: dt === 'membership' ? 'Gold Tier 20% Off' : (dt === 'coupon' ? 'WELCOME15' : 'Summer Combo Deal'),
            customer: c.name,
            appliedOn: i % 2 === 0 ? 'Service' : 'Product',
            gross,
            discount: disc,
            reversal,
            net,
            staff: staffMembers[i % staffMembers.length],
            status: reversal > 0 ? 'reversed' : 'applied'
        });
    }

    // 6. Refunds Ledger
    const refundItems = [];
    for (let i = 0; i < 12; i++) {
        const c = customers[i % customers.length];
        const stream = i % 3 === 0 ? 'Booking' : (i % 3 === 1 ? 'Product Return' : 'Membership Cancel');
        const d = new Date();
        d.setDate(d.getDate() - (i * 3));
        const dStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const orig = stream === 'Membership Cancel' ? 4999 : (stream === 'Booking' ? 1800 : 950);
        const refundAmt = stream === 'Membership Cancel' ? 3500 : orig;

        refundItems.push({
            date: dStr,
            refundId: `REF-${8000 + i}`,
            orderRef: `#ORD-${1000 + i}`,
            stream,
            customer: c.name,
            phone: c.phone,
            originalPrice: orig,
            refundAmount: refundAmt,
            method: i % 2 === 0 ? 'Original Payment Source' : 'Cash Drawer',
            reason: stream === 'Booking' ? 'Client Schedule Conflict' : (stream === 'Product Return' ? 'Unopened Return' : 'Customer Relocated')
        });
    }

    // 7. Pending Dues Ledger
    const duesItems = [];
    for (let i = 0; i < 14; i++) {
        const c = customers[i % customers.length];
        const stream = i % 2 === 0 ? 'Service' : 'Product';
        const d = new Date();
        d.setDate(d.getDate() - (i * 4 + 2));
        const dStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const total = 2400 + (i * 300);
        const paid = Math.round(total * 0.4);
        const due = total - paid;
        const agingDays = i * 4 + 2;

        duesItems.push({
            invoiceRef: `#INV-${9000 + i}`,
            date: dStr,
            stream,
            customer: c.name,
            phone: c.phone,
            total,
            paid,
            due,
            aging: `${agingDays} Days`,
            status: 'pending'
        });
    }

    return {
        overviewDays,
        dateLabels,
        inflowTrend,
        outflowTrend,
        grossTotal,
        expensesTotal,
        refundsTotal,
        discountsTotal,
        revenueItems,
        paymentItems,
        expenseItems,
        discountItems,
        refundItems,
        duesItems
    };
}

// =============================================================================
// SUB-REPORT 1: Financial Overview (Executive P&L)
// =============================================================================

async function renderFinOverview(data, supabase) {
    const mock = generateMockFinancialData();
    removeTabBar();

    const gross = mock.grossTotal;
    const outflow = mock.expensesTotal + mock.refundsTotal;
    const netProfit = gross - outflow;
    const margin = Math.round((netProfit / gross) * 100);

    data.kpi1 = { label: 'Gross Revenue (Inflow)', value: formatCurrency(gross), sub: 'Bookings + Retail + Plans' };
    data.kpi2 = { label: 'Total Outflow (Costs)',   value: formatCurrency(outflow), sub: 'Expenses + Refunds Paid' };
    data.kpi3 = { label: 'Net Profit / Cashflow',  value: formatCurrency(netProfit), sub: 'Gross Inflow - Outflows' };
    data.kpi4 = { label: 'Operating Profit Margin',value: `${margin}%`, sub: 'Net Operating Ratio' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Dual Series (Inflow vs Outflow)
    renderFinTrendChart(mock.dateLabels, mock.inflowTrend, {
        multiSeries: true,
        series: [
            { label: 'Inflow (Revenue)', data: mock.inflowTrend, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.35, borderWidth: 2 },
            { label: 'Outflow (Expenses & Refunds)', data: mock.outflowTrend, borderColor: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.08)', fill: true, tension: 0.35, borderWidth: 2 }
        ],
        type: 'line'
    });

    // Right Chart: Outflow Cost Allocation
    renderFinDistributionChart(
        ['Operating Expenses', 'Discounts Given', 'Customer Refunds'],
        [mock.expensesTotal, mock.discountsTotal, mock.refundsTotal],
        { heroLabelPrefix: 'Primary Outflow:' }
    );

    // Table: Reconciliation Ledger
    const headers = ['Period (Date)', 'Services Rev', 'Retail Rev', 'Membership Rev', 'Gross Inflow', 'Discounts', 'Expenses', 'Refunds', 'Net Realized', 'Margin %'];
    const rows = mock.overviewDays.map(d => [
        `<span style="font-weight:600; color:#0f172a;">${d.date}</span>`,
        formatCurrency(d.bookingsRev),
        formatCurrency(d.retailRev),
        formatCurrency(d.membershipRev),
        `<strong style="color:#0f172a;">${formatCurrency(d.gross)}</strong>`,
        `<span style="color:#6366f1;">-${formatCurrency(d.discounts)}</span>`,
        `<span style="color:#f59e0b;">-${formatCurrency(d.expenses)}</span>`,
        `<span style="color:#ef4444;">-${formatCurrency(d.refunds)}</span>`,
        `<strong style="color:#10b981;">${formatCurrency(d.net)}</strong>`,
        `<span class="status-pill ${d.margin >= 30 ? 'completed' : 'pending'}">${d.margin}%</span>`
    ]);

    setupReportTable(headers, rows, {
        unitName: 'daily entries',
        reportFileName: 'Financial_Overview_Ledger',
        searchPlaceholder: 'Search by date, amounts or margins...'
    });
}

// =============================================================================
// SUB-REPORT 2: Incoming Revenue Streams
// =============================================================================

async function renderFinRevenue(data, supabase) {
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const serviceItems = mock.revenueItems.filter(r => r.streamType === 'Service');
    const productItems = mock.revenueItems.filter(r => r.streamType === 'Product');
    const memItems     = mock.revenueItems.filter(r => r.streamType === 'Membership');

    const totalRev = mock.revenueItems.reduce((acc, r) => acc + r.finalPaid, 0);
    const servRev  = serviceItems.reduce((acc, r) => acc + r.finalPaid, 0);
    const prodRev  = productItems.reduce((acc, r) => acc + r.finalPaid, 0);
    const memRev   = memItems.reduce((acc, r) => acc + r.finalPaid, 0);

    data.kpi1 = { label: 'Total Incoming Revenue', value: formatCurrency(totalRev), sub: 'Realized Collections' };
    data.kpi2 = { label: 'Service Bookings',       value: formatCurrency(servRev), sub: `${Math.round((servRev / totalRev) * 100)}% of Total Revenue` };
    data.kpi3 = { label: 'Retail Product Sales',   value: formatCurrency(prodRev), sub: `${Math.round((prodRev / totalRev) * 100)}% of Total Revenue` };
    data.kpi4 = { label: 'Membership Plans',       value: formatCurrency(memRev), sub: `${Math.round((memRev / totalRev) * 100)}% of Total Revenue` };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Multi-Stream Revenue Timeline
    renderFinTrendChart(mock.dateLabels, mock.inflowTrend, {
        color: '#3b82f6',
        seriesLabel: 'Gross Revenue (₹)'
    });

    // Right Chart: Revenue Stream Contribution
    renderFinDistributionChart(
        ['Service Bookings', 'Retail Products', 'Membership Plans'],
        [servRev, prodRev, memRev],
        { colors: ['#6366f1', '#0ea5e9', '#8b5cf6'], heroLabelPrefix: 'Top Stream:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Streams <span class="tab-badge">${mock.revenueItems.length}</span></button>
        <button class="report-tab-btn" data-tab="service"><i data-feather="calendar" style="width:13px;height:13px;"></i> Services <span class="tab-badge">${serviceItems.length}</span></button>
        <button class="report-tab-btn" data-tab="product"><i data-feather="package" style="width:13px;height:13px;"></i> Retail POS <span class="tab-badge">${productItems.length}</span></button>
        <button class="report-tab-btn" data-tab="membership"><i data-feather="award" style="width:13px;height:13px;"></i> Memberships <span class="tab-badge">${memItems.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Reference #', 'Date & Time', 'Stream', 'Customer', 'Staff / Attribution', 'Gross Price', 'Discount', 'Final Paid', 'Status', 'Action'];
    const formatRow = (r) => [
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">#${r.refCode}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${r.date}</span>`,
        `<span class="status-pill active">${r.streamType}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${r.customerName}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${r.customerPhone}</span></div>`,
        `<span style="font-size:0.83rem; font-weight:500; color:#334155;">${r.staff}</span>`,
        formatCurrency(r.gross),
        `<span style="color:#f43f5e;">-${formatCurrency(r.discount)}</span>`,
        `<strong style="color:#10b981; font-size:0.85rem;">${formatCurrency(r.finalPaid)}</strong>`,
        makeStatusPill(r.status),
        `<button class="btn-top-action" style="padding:3px 8px; font-size:0.75rem;" onclick="window.showFinDrilldown('${r.refId}')">Audit</button>`
    ];

    window.showFinDrilldown = (refId) => showDrilldownModal(refId, supabase);

    const tabData = {
        all: mock.revenueItems.map(formatRow),
        service: serviceItems.map(formatRow),
        product: productItems.map(formatRow),
        membership: memItems.map(formatRow)
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
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const cashItems = mock.paymentItems.filter(p => p.method === 'cash');
    const upiItems  = mock.paymentItems.filter(p => p.method === 'upi');
    const cardItems = mock.paymentItems.filter(p => p.method === 'card');

    const totalCollected = mock.paymentItems.reduce((acc, p) => acc + p.settled, 0);
    const cashTotal      = cashItems.reduce((acc, p) => acc + p.settled, 0);
    const upiTotal       = upiItems.reduce((acc, p) => acc + p.settled, 0);
    const cardTotal      = cardItems.reduce((acc, p) => acc + p.settled, 0);

    data.kpi1 = { label: 'Total Collected',   value: formatCurrency(totalCollected), sub: `${mock.paymentItems.length} Settled Transactions` };
    data.kpi2 = { label: 'Cash in Drawer',    value: formatCurrency(cashTotal), sub: 'Physical Cash Drawer' };
    data.kpi3 = { label: 'UPI & QR Codes',    value: formatCurrency(upiTotal), sub: 'Instant Bank Deposits' };
    data.kpi4 = { label: 'Cards & Terminal',  value: formatCurrency(cardTotal), sub: 'POS Terminal Swipes' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Payment Settlements Timeline
    renderFinTrendChart(mock.dateLabels, mock.inflowTrend.map(v => Math.round(v * 0.95)), {
        color: '#6366f1',
        seriesLabel: 'Settled Payments (₹)'
    });

    // Right Chart: Tender Mode Split
    renderFinDistributionChart(
        ['Cash in Drawer', 'UPI / QR Codes', 'Cards & POS'],
        [cashTotal, upiTotal, cardTotal],
        { colors: ['#10b981', '#6366f1', '#0ea5e9'], heroLabelPrefix: 'Primary Tender:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Settlements <span class="tab-badge">${mock.paymentItems.length}</span></button>
        <button class="report-tab-btn" data-tab="cash"><i data-feather="dollar-sign" style="width:13px;height:13px;"></i> Cash Drawer <span class="tab-badge">${cashItems.length}</span></button>
        <button class="report-tab-btn" data-tab="upi"><i data-feather="smartphone" style="width:13px;height:13px;"></i> UPI / QR <span class="tab-badge">${upiItems.length}</span></button>
        <button class="report-tab-btn" data-tab="card"><i data-feather="credit-card" style="width:13px;height:13px;"></i> Cards <span class="tab-badge">${cardItems.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Payment Ref', 'Date & Time', 'Order Ref', 'Stream', 'Payment Mode', 'Gross', 'Discount', 'Settled Amount', 'Notes'];
    const formatRow = (p) => [
        `<span style="font-family:monospace; font-weight:700; color:#6366f1;">#${p.paymentId}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${p.date}</span>`,
        `<span style="font-family:monospace; font-size:0.8rem; color:#334155;">${p.orderRef}</span>`,
        `<span class="status-pill active">${p.stream}</span>`,
        `<strong style="text-transform:uppercase; font-size:0.8rem; color:#0f172a;">${p.method}</strong>`,
        formatCurrency(p.gross),
        `<span style="color:#f43f5e;">-${formatCurrency(p.discount)}</span>`,
        `<strong style="color:#10b981; font-size:0.85rem;">${formatCurrency(p.settled)}</strong>`,
        `<span style="font-size:0.78rem; color:#64748b;">${p.notes}</span>`
    ];

    const tabData = {
        all: mock.paymentItems.map(formatRow),
        cash: cashItems.map(formatRow),
        upi: upiItems.map(formatRow),
        card: cardItems.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'payment settlements',
            reportFileName: `Payments_${tab}`,
            searchPlaceholder: 'Search payment ref, method, order or customer...'
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
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const operationalItems = mock.expenseItems.filter(e => ['Rent', 'Electricity & Utilities', 'Maintenance'].includes(e.category));
    const supplyItems      = mock.expenseItems.filter(e => e.category === 'Salon Supplies');
    const salaryItems      = mock.expenseItems.filter(e => e.category === 'Salaries');

    const totalExp = mock.expenseItems.reduce((acc, e) => acc + e.amount, 0);
    const avgExp   = Math.round(totalExp / mock.expenseItems.length);
    const topCat   = 'Staff Salaries';
    const expRatio = Math.round((totalExp / mock.grossTotal) * 100);

    data.kpi1 = { label: 'Total Operating Expenses', value: formatCurrency(totalExp), sub: `${mock.expenseItems.length} Logged Vouchers` };
    data.kpi2 = { label: 'Top Cost Center',          value: topCat, sub: 'Highest Expenditure Category' };
    data.kpi3 = { label: 'Average Voucher Cost',     value: formatCurrency(avgExp), sub: 'Mean Cost per Entry' };
    data.kpi4 = { label: 'Expense-to-Revenue Ratio',  value: `${expRatio}%`, sub: 'Operational Cost Overhead' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Expense Trajectory
    renderFinTrendChart(mock.dateLabels, mock.outflowTrend.map(v => Math.round(v * 0.75)), {
        color: '#f59e0b',
        seriesLabel: 'Daily Expenses (₹)'
    });

    // Right Chart: Category Breakdown
    renderFinDistributionChart(
        ['Salaries & Payroll', 'Salon Supplies', 'Rent', 'Utilities & Bills', 'Marketing'],
        [48000, 24000, 45000, 14000, 8500],
        { colors: ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6'], heroLabelPrefix: 'Major Cost:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Expenses <span class="tab-badge">${mock.expenseItems.length}</span></button>
        <button class="report-tab-btn" data-tab="op"><i data-feather="home" style="width:13px;height:13px;"></i> Operational <span class="tab-badge">${operationalItems.length}</span></button>
        <button class="report-tab-btn" data-tab="supplies"><i data-feather="box" style="width:13px;height:13px;"></i> Supplies <span class="tab-badge">${supplyItems.length}</span></button>
        <button class="report-tab-btn" data-tab="salaries"><i data-feather="users" style="width:13px;height:13px;"></i> Salaries <span class="tab-badge">${salaryItems.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Date', 'Expense Ref #', 'Category', 'Vendor / Recipient', 'Amount', 'Logged By', 'Notes / Bill Ref', 'Status'];
    const formatRow = (e) => [
        `<span style="font-weight:600; color:#0f172a;">${e.date}</span>`,
        `<span style="font-family:monospace; font-weight:700; color:#f59e0b;">#${e.expenseId}</span>`,
        `<span class="status-pill active">${e.category}</span>`,
        `<span style="font-size:0.83rem; color:#334155; font-weight:500;">${e.recipient}</span>`,
        `<strong style="color:#ef4444; font-size:0.85rem;">${formatCurrency(e.amount)}</strong>`,
        `<span style="font-size:0.82rem; color:#64748b;">${e.loggedBy}</span>`,
        `<span style="font-size:0.78rem; color:#64748b;">${e.notes}</span>`,
        makeStatusPill(e.status)
    ];

    const tabData = {
        all: mock.expenseItems.map(formatRow),
        op: operationalItems.map(formatRow),
        supplies: supplyItems.map(formatRow),
        salaries: salaryItems.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'expense records',
            reportFileName: `Expenses_${tab}`,
            searchPlaceholder: 'Search category, vendor, recipient or notes...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 5: Discounts & Deductions (Revenue Leaks)
// =============================================================================

async function renderFinDiscounts(data, supabase) {
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const offerItems  = mock.discountItems.filter(d => d.type === 'offer');
    const couponItems = mock.discountItems.filter(d => d.type === 'coupon');
    const memItems    = mock.discountItems.filter(d => d.type === 'membership');

    const totalNetDisc = mock.discountItems.reduce((acc, d) => acc + d.net, 0);
    const offerNet     = offerItems.reduce((acc, d) => acc + d.net, 0);
    const couponNet    = couponItems.reduce((acc, d) => acc + d.net, 0);
    const memNet       = memItems.reduce((acc, d) => acc + d.net, 0);
    const erosionRate  = Math.round((totalNetDisc / mock.grossTotal) * 100);

    data.kpi1 = { label: 'Total Net Discounts',    value: formatCurrency(totalNetDisc), sub: 'Gross Discount - Reversals' };
    data.kpi2 = { label: 'Discount Erosion %',     value: `${erosionRate}%`, sub: 'Margin Deducted from Gross' };
    data.kpi3 = { label: 'Promotional Offers',     value: formatCurrency(offerNet), sub: 'Combo & Deal Redemptions' };
    data.kpi4 = { label: 'Coupons & Member Perks', value: formatCurrency(couponNet + memNet), sub: 'Vouchers & Plan Discounts' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Discounts Given Timeline
    renderFinTrendChart(mock.dateLabels, mock.dateLabels.map((_, i) => Math.round(1800 + Math.sin(i) * 600)), {
        color: '#8b5cf6',
        seriesLabel: 'Net Discount Value (₹)'
    });

    // Right Chart: Discounts Share by Type
    renderFinDistributionChart(
        ['Special Offers', 'Coupon Codes', 'Membership Perks'],
        [offerNet, couponNet, memNet],
        { colors: ['#f59e0b', '#ec4899', '#8b5cf6'], heroLabelPrefix: 'Top Discount:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Discounts <span class="tab-badge">${mock.discountItems.length}</span></button>
        <button class="report-tab-btn" data-tab="offer"><i data-feather="percent" style="width:13px;height:13px;"></i> Offers <span class="tab-badge">${offerItems.length}</span></button>
        <button class="report-tab-btn" data-tab="coupon"><i data-feather="tag" style="width:13px;height:13px;"></i> Coupons <span class="tab-badge">${couponItems.length}</span></button>
        <button class="report-tab-btn" data-tab="membership"><i data-feather="award" style="width:13px;height:13px;"></i> Membership <span class="tab-badge">${memItems.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Date & Time', 'Order Ref', 'Type', 'Discount Code/Name', 'Customer', 'Applied On', 'Gross Price', 'Discount Deducted', 'Net Paid', 'Staff'];
    const formatRow = (d) => [
        `<span style="font-size:0.82rem; color:#475569;">${d.date}</span>`,
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">${d.refId}</span>`,
        `<span class="status-pill active" style="text-transform:capitalize;">${d.type}</span>`,
        `<strong style="color:#0f172a; font-size:0.83rem;">${d.name}</strong>`,
        `<span style="font-size:0.83rem; color:#334155;">${d.customer}</span>`,
        `<span style="font-size:0.8rem; color:#64748b;">${d.appliedOn}</span>`,
        formatCurrency(d.gross),
        `<strong style="color:#f43f5e; font-size:0.85rem;">-${formatCurrency(d.net)}</strong>`,
        `<span style="color:#10b981; font-weight:600;">${formatCurrency(d.gross - d.net)}</span>`,
        `<span style="font-size:0.8rem; color:#64748b;">${d.staff}</span>`
    ];

    const tabData = {
        all: mock.discountItems.map(formatRow),
        offer: offerItems.map(formatRow),
        coupon: couponItems.map(formatRow),
        membership: memItems.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'discount usages',
            reportFileName: `Discounts_${tab}`,
            searchPlaceholder: 'Search discount name, code, customer or staff...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 6: Refunds & Payouts (Outgoing Leaks)
// =============================================================================

async function renderFinRefunds(data, supabase) {
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const bookingRefunds = mock.refundItems.filter(r => r.stream === 'Booking');
    const productRefunds = mock.refundItems.filter(r => r.stream === 'Product Return');
    const memRefunds     = mock.refundItems.filter(r => r.stream === 'Membership Cancel');

    const totalRefunded = mock.refundItems.reduce((acc, r) => acc + r.refundAmount, 0);
    const refundCount   = mock.refundItems.length;
    const avgRefund     = Math.round(totalRefunded / (refundCount || 1));
    const refundRate    = Math.round((totalRefunded / mock.grossTotal) * 100);

    data.kpi1 = { label: 'Total Refunded Outflow', value: formatCurrency(totalRefunded), sub: 'Paid Out Back to Clients' };
    data.kpi2 = { label: 'Refund Events Count',    value: `${refundCount} Payouts`, sub: 'Cancelled / Returned Items' };
    data.kpi3 = { label: 'Gross Refund Rate',       value: `${refundRate}%`, sub: 'Refunds / Gross Inflow' };
    data.kpi4 = { label: 'Average Refund Payout',  value: formatCurrency(avgRefund), sub: 'Mean Refund Ticket Size' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Refund Trend Timeline
    renderFinTrendChart(mock.dateLabels, mock.outflowTrend.map(v => Math.round(v * 0.25)), {
        color: '#f43f5e',
        seriesLabel: 'Refund Payouts (₹)'
    });

    // Right Chart: Refunds by Source Stream
    renderFinDistributionChart(
        ['Booking Cancellations', 'POS Product Returns', 'Membership Cancellations'],
        [
            bookingRefunds.reduce((a, r) => a + r.refundAmount, 0),
            productRefunds.reduce((a, r) => a + r.refundAmount, 0),
            memRefunds.reduce((a, r) => a + r.refundAmount, 0)
        ],
        { colors: ['#6366f1', '#0ea5e9', '#ec4899'], heroLabelPrefix: 'Highest Returns:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Refunds <span class="tab-badge">${mock.refundItems.length}</span></button>
        <button class="report-tab-btn" data-tab="booking"><i data-feather="calendar" style="width:13px;height:13px;"></i> Bookings <span class="tab-badge">${bookingRefunds.length}</span></button>
        <button class="report-tab-btn" data-tab="product"><i data-feather="package" style="width:13px;height:13px;"></i> Product Returns <span class="tab-badge">${productRefunds.length}</span></button>
        <button class="report-tab-btn" data-tab="membership"><i data-feather="award" style="width:13px;height:13px;"></i> Membership Cancels <span class="tab-badge">${memRefunds.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Refund Date', 'Payment Ref', 'Original Order Ref', 'Stream', 'Customer', 'Original Total', 'Refund Amount', 'Payment Method', 'Notes / Reason'];
    const formatRow = (r) => [
        `<span style="font-weight:600; color:#0f172a;">${r.date}</span>`,
        `<span style="font-family:monospace; font-weight:700; color:#f43f5e;">#${r.refundId}</span>`,
        `<span style="font-family:monospace; font-size:0.8rem; color:#475569;">${r.orderRef}</span>`,
        `<span class="status-pill active">${r.stream}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${r.customer}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${r.phone}</span></div>`,
        formatCurrency(r.originalPrice),
        `<strong style="color:#ef4444; font-size:0.85rem;">-${formatCurrency(r.refundAmount)}</strong>`,
        `<span style="font-size:0.8rem; color:#334155;">${r.method}</span>`,
        `<span style="font-size:0.78rem; color:#64748b;">${r.reason}</span>`
    ];

    const tabData = {
        all: mock.refundItems.map(formatRow),
        booking: bookingRefunds.map(formatRow),
        product: productRefunds.map(formatRow),
        membership: memRefunds.map(formatRow)
    };

    const activateTab = (tab) => {
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        setupReportTable(headers, tabData[tab] || tabData.all, {
            unitName: 'refund records',
            reportFileName: `Refunds_${tab}`,
            searchPlaceholder: 'Search customer, payment ref, reason or stream...'
        });
    };

    tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.onclick = () => activateTab(btn.getAttribute('data-tab'));
    });

    activateTab('all');
}

// =============================================================================
// SUB-REPORT 7: Pending Dues & Receivables
// =============================================================================

async function renderFinPendingDues(data, supabase) {
    const mock = generateMockFinancialData();
    const tableContainer = document.querySelector('.data-table-container');
    const tabBar = ensureTabBar(tableContainer);

    const serviceDues = mock.duesItems.filter(d => d.stream === 'Service');
    const productDues = mock.duesItems.filter(d => d.stream === 'Product');
    const overdueDues = mock.duesItems.filter(d => parseInt(d.aging) > 15);

    const totalDues   = mock.duesItems.reduce((acc, d) => acc + d.due, 0);
    const pendingCnt  = mock.duesItems.length;
    const avgDue      = Math.round(totalDues / (pendingCnt || 1));
    const agedDues    = overdueDues.reduce((acc, d) => acc + d.due, 0);

    data.kpi1 = { label: 'Total Pending Dues',     value: formatCurrency(totalDues), sub: 'Uncollected Customer Balances' };
    data.kpi2 = { label: 'Pending Invoices',       value: `${pendingCnt} Open Bills`, sub: 'Awaiting Settlement' };
    data.kpi3 = { label: 'Average Due / Client',   value: formatCurrency(avgDue), sub: 'Mean Outstanding Amount' };
    data.kpi4 = { label: 'Overdue Dues (>15 Days)',value: formatCurrency(agedDues), sub: 'Aging Receivables Risk' };
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // Left Chart: Dues Generated vs Recovered
    renderFinTrendChart(mock.dateLabels, mock.dateLabels.map((_, i) => Math.round(2200 + Math.sin(i * 1.5) * 800)), {
        color: '#f59e0b',
        seriesLabel: 'Open Dues (₹)'
    });

    // Right Chart: Pending Dues by Stream
    renderFinDistributionChart(
        ['Service Appointments', 'Retail POS Sales', 'Membership Dues'],
        [
            serviceDues.reduce((a, d) => a + d.due, 0),
            productDues.reduce((a, d) => a + d.due, 0),
            Math.round(totalDues * 0.15)
        ],
        { colors: ['#6366f1', '#0ea5e9', '#8b5cf6'], heroLabelPrefix: 'Highest Dues:' }
    );

    // Tabs Setup
    tabBar.innerHTML = `
        <button class="report-tab-btn active" data-tab="all"><i data-feather="grid" style="width:13px;height:13px;"></i> All Pending Dues <span class="tab-badge">${mock.duesItems.length}</span></button>
        <button class="report-tab-btn" data-tab="service"><i data-feather="calendar" style="width:13px;height:13px;"></i> Services <span class="tab-badge">${serviceDues.length}</span></button>
        <button class="report-tab-btn" data-tab="product"><i data-feather="package" style="width:13px;height:13px;"></i> Retail POS <span class="tab-badge">${productDues.length}</span></button>
        <button class="report-tab-btn" data-tab="overdue"><i data-feather="clock" style="width:13px;height:13px;"></i> Overdue (>15d) <span class="tab-badge">${overdueDues.length}</span></button>
    `;
    if (window.feather) feather.replace();

    const headers = ['Invoice Ref', 'Date Created', 'Stream', 'Customer', 'Total Bill', 'Paid So Far', 'Balance Due', 'Aging', 'Action'];
    const formatRow = (d) => [
        `<span style="font-family:monospace; font-weight:700; color:#3b82f6;">${d.invoiceRef}</span>`,
        `<span style="font-size:0.82rem; color:#475569;">${d.date}</span>`,
        `<span class="status-pill active">${d.stream}</span>`,
        `<div><strong style="font-size:0.83rem; color:#0f172a;">${d.customer}</strong><span style="display:block; font-size:0.72rem; color:#64748b;">${d.phone}</span></div>`,
        formatCurrency(d.total),
        `<span style="color:#10b981; font-weight:500;">${formatCurrency(d.paid)}</span>`,
        `<strong style="color:#ef4444; font-size:0.85rem;">${formatCurrency(d.due)}</strong>`,
        `<span class="status-pill pending" style="font-size:0.75rem;">${d.aging}</span>`,
        `<button class="btn-top-action" style="padding:3px 10px; font-size:0.75rem; background:#6366f1; color:#fff;" onclick="alert('Open collection modal for ${d.customer} (${formatCurrency(d.due)})')">Collect</button>`
    ];

    const tabData = {
        all: mock.duesItems.map(formatRow),
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

    // Wire apply button
    if (btnApply) {
        btnApply.onclick = () => handler(data, supabase);
    }
    if (filterBranch) {
        filterBranch.onchange = () => handler(data, supabase);
    }

    try {
        await handler(data, supabase);
    } catch (err) {
        console.error('[financial] Error executing report renderer:', err);
    }
}
