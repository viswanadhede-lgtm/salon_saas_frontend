// scripts/reports/report-modules/products-sales.js
// Dedicated report module for all 7 Product Sales Reports:
// 1. prod-overview     - Product Sales Overview
// 2. prod-wise         - Product-wise Sales Report
// 3. prod-category     - Sales by Category
// 4. prod-transactions - Sales Transactions Report
// 5. prod-discounts    - Discounts Report
// 6. prod-returns      - Product Returns & Refunds Report
// 7. prod-payments     - Sales Payments Report
//
// Designed to consume a single Master RPC: get_product_sales_report(p_company_id, p_branch_id, p_start_date, p_end_date)
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
        console.warn('[products-sales] Branch fetch warning:', e);
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
        'completed': { color: '#065f46', bg: '#d1fae5', label: 'Completed' },
        'paid':      { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        'in stock':  { color: '#065f46', bg: '#d1fae5', label: 'In Stock' },
        'active':    { color: '#065f46', bg: '#d1fae5', label: 'Active' },
        'pending':   { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        'partial':   { color: '#86198f', bg: '#f5d0fe', label: 'Partial' },
        'refunded':  { color: '#b45309', bg: '#fef3c7', label: 'Refunded' },
        'returned':  { color: '#991b1b', bg: '#fee2e2', label: 'Returned' },
        'cancelled': { color: '#991b1b', bg: '#fee2e2', label: 'Cancelled' },
        'low stock': { color: '#b45309', bg: '#fef3c7', label: 'Low Stock' },
        'coupon':    { color: '#4338ca', bg: '#e0e7ff', label: 'Coupon' },
        'member':    { color: '#6d28d9', bg: '#ede9fe', label: 'Membership' },
        'manual':    { color: '#0369a1', bg: '#e0f2fe', label: 'Manual' },
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
            a.download = `${options.reportFileName || 'Product_Sales_Report'}_${new Date().toISOString().split('T')[0]}.csv`;
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
    const barColor = options.color || '#6366f1';
    const bgColors = values.map((_, i) => i === values.length - 1 ? '#0ea5e9' : barColor);

    trendChartInstance = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: options.datasetLabel || 'Sales',
                data: values,
                backgroundColor: chartType === 'line' ? 'rgba(99, 102, 241, 0.12)' : bgColors,
                borderColor: '#6366f1',
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
                        // Note: Chart.js rotates the Y-axis title counter-clockwise by 90°.
                        // Therefore, a rightward arrow '→' in the string points straight UPWARDS on screen.
                        text: options.yAxisTitle || (isCurrency ? 'Revenue (₹) →' : 'Units →'),
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

    const colors = options.colors || ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
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

async function callMasterProductSalesRpc(supabase, companyId, branchId, start, end) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    try {
        const { data, error } = await supabase.rpc('get_product_sales_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (!error && data) {
            let res = data;
            if (typeof res === 'string') {
                try { res = JSON.parse(res); } catch (e) { }
            }
            if (Array.isArray(res)) res = res[0] || {};
            if (res.product_sales_report) res = res.product_sales_report;
            if (res.get_product_sales_report) res = res.get_product_sales_report;
            if (typeof res === 'string') {
                try { res = JSON.parse(res); } catch (e) { }
            }
            if (res && typeof res === 'object' && Object.keys(res).length > 0) {
                console.log('[products-sales] Master RPC get_product_sales_report loaded successfully:', res);
                return res;
            }
        }
    } catch (e) {
        console.info('[products-sales] Master RPC not yet defined in database. Rendering standard preview dataset.');
    }

    return getPreviewData();
}

function getPreviewData() {
    return {
        // 1. Overview
        'prod_overview': {
            kpis: {
                total_sales: 142850,
                net_sales: 128400,
                total_discounts: 10250,
                total_refunds: 4200,
                gross_quantity: 359,
                quantity_sold: 348,
                quantity_returned: 11,
                unique_products: 42
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [14200, 18500, 16800, 22400, 19100, 24800, 15900, 16700]
            },
            categories: {
                labels: ['Hair Care', 'Skin Care', 'Styling & Tools', 'Beard & Men', 'Nail Care'],
                values: [58200, 34500, 18200, 11400, 6100]
            },
            sales_transactions: [
                {
                    sale_id: 'POS-2024-1082',
                    created_at: '2024-10-20, 04:30 PM',
                    customer_name: 'Priya Sharma',
                    customer_phone: '98765 43210',
                    staff_name: 'Aakash Verma',
                    product_names: ["L'Oréal Serie Expert Shampoo", "Moroccan Argan Oil"],
                    total_quantity: 2,
                    total_price: 2100,
                    discount_amount: 200,
                    discount_name: 'FESTIVE10',
                    final_amount: 1900,
                    payment_method: 'upi',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1081',
                    created_at: '2024-10-20, 03:15 PM',
                    customer_name: 'Rahul Mehta',
                    customer_phone: '98123 45678',
                    staff_name: 'Sneha Rao',
                    product_names: ['Beardo Godfather Beard Oil 30ml'],
                    total_quantity: 2,
                    total_price: 700,
                    discount_amount: 0,
                    discount_name: null,
                    final_amount: 700,
                    payment_method: 'card',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1080',
                    created_at: '2024-10-20, 01:45 PM',
                    customer_name: 'Ananya Roy',
                    customer_phone: '97654 32109',
                    staff_name: 'Kavita Nair',
                    product_names: ['Dermalogica Daily Microfoliant 74g'],
                    total_quantity: 1,
                    total_price: 1300,
                    discount_amount: 130,
                    discount_name: 'SILVER-10',
                    final_amount: 1170,
                    payment_method: 'upi',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1079',
                    created_at: '2024-10-20, 12:20 PM',
                    customer_name: 'Vikram Joshi',
                    customer_phone: '96543 21098',
                    staff_name: 'Aakash Verma',
                    product_names: ['Schwarzkopf Osis Dust It', 'Matte Hair Wax'],
                    total_quantity: 2,
                    total_price: 1100,
                    discount_amount: 100,
                    discount_name: 'COMBO-SAVER',
                    final_amount: 1000,
                    payment_method: 'cash',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1078',
                    created_at: '2024-10-19, 06:10 PM',
                    customer_name: 'Deepika Sen',
                    customer_phone: '95432 10987',
                    staff_name: 'Meera Iyer',
                    product_names: ['Olaplex No. 3 Hair Perfector 100ml'],
                    total_quantity: 1,
                    total_price: 1400,
                    discount_amount: 140,
                    discount_name: 'GOLD-10',
                    final_amount: 1260,
                    payment_method: 'upi',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1077',
                    created_at: '2024-10-19, 04:50 PM',
                    customer_name: 'Walk-in Client',
                    customer_phone: '—',
                    staff_name: 'Sneha Rao',
                    product_names: ['OPI ProSpa Nail & Cuticle Oil'],
                    total_quantity: 1,
                    total_price: 300,
                    discount_amount: 0,
                    discount_name: null,
                    final_amount: 300,
                    payment_method: 'cash',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1076',
                    created_at: '2024-10-19, 02:40 PM',
                    customer_name: 'Rohan Nambiar',
                    customer_phone: '94321 09876',
                    staff_name: 'Aakash Verma',
                    product_names: ['Kerastase Elixir Ultime Serum'],
                    total_quantity: 1,
                    total_price: 1050,
                    discount_amount: 100,
                    discount_name: 'STYLIST-PERK',
                    final_amount: 950,
                    payment_method: 'card',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1075',
                    created_at: '2024-10-18, 05:25 PM',
                    customer_name: 'Sunita Menon',
                    customer_phone: '93210 98765',
                    staff_name: 'Kavita Nair',
                    product_names: ["L'Oréal Serie Expert Shampoo 300ml"],
                    total_quantity: 2,
                    total_price: 1800,
                    discount_amount: 180,
                    discount_name: 'RETAIL10',
                    final_amount: 1620,
                    payment_method: 'upi',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1074',
                    created_at: '2024-10-18, 01:10 PM',
                    customer_name: 'Arjun Das',
                    customer_phone: '92109 87654',
                    staff_name: 'Sneha Rao',
                    product_names: ['Forest Essentials Facial Tonic Mist'],
                    total_quantity: 1,
                    total_price: 400,
                    discount_amount: 0,
                    discount_name: null,
                    final_amount: 400,
                    payment_method: 'upi',
                    payment_status: 'paid'
                },
                {
                    sale_id: 'POS-2024-1073',
                    created_at: '2024-10-17, 07:05 PM',
                    customer_name: 'Megha Rao',
                    customer_phone: '91098 76543',
                    staff_name: 'Meera Iyer',
                    product_names: ['BBlunt Hot Shot Heat Protection Mist'],
                    total_quantity: 1,
                    total_price: 350,
                    discount_amount: 35,
                    discount_name: 'AUTUMN50',
                    final_amount: 315,
                    payment_method: 'card',
                    payment_status: 'paid'
                }
            ]
        },

        // 2. Product-wise
        'prod_wise': {
            kpis: {
                total_units: 348,
                gross_units: 359,
                net_revenue: 128400,
                top_sku_name: "L'Oréal Shampoo",
                top_sku_units: 48,
                top_sku_pct: '30.1%',
                returned_units: 11,
                refunded_amount: 4200
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [38, 46, 41, 58, 44, 62, 39, 42]
            },
            distribution: {
                labels: ["L'Oréal Shampoo", 'Moroccan Oil', 'Dermalogica', 'Olaplex No. 3', 'Beardo Oil', 'Others'],
                values: [48, 28, 18, 14, 32, 208]
            },
            rows: [
                { rank: 1, name: "L'Oréal Serie Expert Shampoo 300ml", sku: 'SKU-HC-101', category: 'Hair Care', sold: 48, returned: 1, gross: 43200, disc: 3700, net: 38600, pct: '30.1%', txns: 44 },
                { rank: 2, name: 'Moroccan Argan Oil Hair Treatment 100ml', sku: 'SKU-HC-104', category: 'Hair Care', sold: 28, returned: 0, gross: 33600, disc: 2400, net: 31200, pct: '24.3%', txns: 26 },
                { rank: 3, name: 'Dermalogica Daily Microfoliant 74g', sku: 'SKU-SC-202', category: 'Skin Care', sold: 18, returned: 1, gross: 23400, disc: 1600, net: 20500, pct: '16.0%', txns: 17 },
                { rank: 4, name: 'Olaplex No. 3 Hair Perfector 100ml', sku: 'SKU-HC-108', category: 'Hair Care', sold: 14, returned: 0, gross: 19600, disc: 1400, net: 18200, pct: '14.2%', txns: 14 },
                { rank: 5, name: 'Beardo Godfather Beard Oil 30ml', sku: 'SKU-BC-401', category: 'Beard & Men', sold: 32, returned: 0, gross: 11200, disc: 800, net: 10400, pct: '8.1%', txns: 30 },
                { rank: 6, name: 'Kerastase Elixir Ultime Serum', sku: 'SKU-HC-115', category: 'Hair Care', sold: 9, returned: 0, gross: 9450, disc: 650, net: 8800, pct: '6.9%', txns: 9 },
                { rank: 7, name: 'Schwarzkopf Professional Osis Dust It', sku: 'SKU-ST-305', category: 'Styling & Tools', sold: 24, returned: 2, gross: 8400, disc: 600, net: 7100, pct: '5.5%', txns: 22 },
                { rank: 8, name: 'OPI ProSpa Nail & Cuticle Oil', sku: 'SKU-NC-501', category: 'Nail Care', sold: 22, returned: 0, gross: 6600, disc: 500, net: 6100, pct: '4.8%', txns: 21 },
                { rank: 9, name: 'BBlunt Hot Shot Heat Protection Mist', sku: 'SKU-HC-122', category: 'Hair Care', sold: 16, returned: 0, gross: 5600, disc: 400, net: 5200, pct: '4.1%', txns: 15 },
                { rank: 10, name: 'Forest Essentials Facial Tonic Mist', sku: 'SKU-SC-210', category: 'Skin Care', sold: 12, returned: 0, gross: 4800, disc: 350, net: 4450, pct: '3.5%', txns: 12 }
            ]
        },

        // 3. Category-wise
        'prod_category': {
            kpis: {
                total_categories: 5,
                top_category: 'Hair Care',
                items_sold: 348,
                avg_rev_per_cat: 25680
            },
            comparison: {
                labels: ['Hair Care', 'Skin Care', 'Styling & Tools', 'Beard & Men', 'Nail Care'],
                values: [62400, 34500, 18200, 11400, 6100]
            },
            rows: [
                { name: 'Hair Care', skus: 18, units: 162, gross: 67850, disc: 5450, net: 62400, pct: '48.6%', top: "L'Oréal Serie Expert Shampoo" },
                { name: 'Skin Care', skus: 11, units: 68, gross: 37400, disc: 2900, net: 34500, pct: '26.9%', top: 'Dermalogica Daily Microfoliant' },
                { name: 'Styling & Tools', skus: 6, units: 48, gross: 19800, disc: 1600, net: 18200, pct: '14.2%', top: 'Schwarzkopf Osis Dust It' },
                { name: 'Beard & Men', skus: 4, units: 44, gross: 12200, disc: 800, net: 11400, pct: '8.9%', top: 'Beardo Godfather Beard Oil' },
                { name: 'Nail Care', skus: 3, units: 26, gross: 6600, disc: 500, net: 6100, pct: '4.8%', top: 'OPI ProSpa Nail & Cuticle Oil' }
            ]
        },

        // 4. Transactions
        'prod_transactions': {
            kpis: {
                total_txns: 184,
                aov: 698,
                items_sold: 348,
                total_collected: 128400
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [18, 24, 21, 29, 23, 31, 20, 22]
            },
            tender_split: {
                labels: ['UPI (GPay / PhonePe)', 'Credit / Debit Card', 'Cash', 'Split Tender'],
                values: [74500, 36200, 13700, 4000]
            },
            rows: [
                { ref: 'POS-2024-1082', datetime: '2024-10-20, 04:30 PM', customer: 'Priya Sharma', staff: 'Aakash Verma', items: "L'Oréal Shampoo (1), Moroccan Oil (1)", gross: 2100, disc: 200, net: 1900, method: 'UPI', status: 'Completed' },
                { ref: 'POS-2024-1081', datetime: '2024-10-20, 03:15 PM', customer: 'Rahul Mehta', staff: 'Sneha Rao', items: 'Beardo Beard Oil (2)', gross: 700, disc: 0, net: 700, method: 'Card', status: 'Completed' },
                { ref: 'POS-2024-1080', datetime: '2024-10-20, 01:45 PM', customer: 'Ananya Roy', staff: 'Kavita Nair', items: 'Dermalogica Microfoliant (1)', gross: 1300, disc: 130, net: 1170, method: 'UPI', status: 'Completed' },
                { ref: 'POS-2024-1079', datetime: '2024-10-20, 12:20 PM', customer: 'Vikram Joshi', staff: 'Aakash Verma', items: 'Osis Dust It (1), Hair Wax (1)', gross: 1100, disc: 100, net: 1000, method: 'Cash', status: 'Completed' },
                { ref: 'POS-2024-1078', datetime: '2024-10-19, 06:10 PM', customer: 'Deepika Sen', staff: 'Meera Iyer', items: 'Olaplex No. 3 (1)', gross: 1400, disc: 140, net: 1260, method: 'UPI', status: 'Completed' },
                { ref: 'POS-2024-1077', datetime: '2024-10-19, 04:50 PM', customer: 'Walk-in Client', staff: 'Sneha Rao', items: 'OPI Nail Oil (1)', gross: 300, disc: 0, net: 300, method: 'Cash', status: 'Completed' },
                { ref: 'POS-2024-1076', datetime: '2024-10-19, 02:40 PM', customer: 'Rohan Nambiar', staff: 'Aakash Verma', items: 'Kerastase Serum (1)', gross: 1050, disc: 100, net: 950, method: 'Card', status: 'Completed' },
                { ref: 'POS-2024-1075', datetime: '2024-10-18, 05:25 PM', customer: 'Sunita Menon', staff: 'Kavita Nair', items: "L'Oréal Shampoo (2)", gross: 1800, disc: 180, net: 1620, method: 'UPI', status: 'Completed' },
                { ref: 'POS-2024-1074', datetime: '2024-10-18, 01:10 PM', customer: 'Arjun Das', staff: 'Sneha Rao', items: 'Forest Essentials Mist (1)', gross: 400, disc: 0, net: 400, method: 'UPI', status: 'Completed' },
                { ref: 'POS-2024-1073', datetime: '2024-10-17, 07:05 PM', customer: 'Megha Rao', staff: 'Meera Iyer', items: 'BBlunt Heat Protection (1)', gross: 350, disc: 35, net: 315, method: 'Card', status: 'Completed' }
            ]
        },

        // 5. Discounts
        'prod_discounts': {
            kpis: {
                total_discounts: 10250,
                discounted_sales: 62,
                avg_discount_sale: 165,
                discount_rate: '7.2%'
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [950, 1320, 1100, 1680, 1420, 1850, 1050, 1180]
            },
            discount_types: {
                labels: ['Coupon Code', 'Gold/Silver Membership', 'Promotional Campaign', 'Staff Manual Override'],
                values: [4600, 3100, 1800, 750]
            },
            rows: [
                { ref: 'POS-2024-1082', date: '2024-10-20', customer: 'Priya Sharma', type: 'Coupon', code: 'FESTIVE10', before: 2100, discount: 200, after: 1900, pct: '9.5%' },
                { ref: 'POS-2024-1080', date: '2024-10-20', customer: 'Ananya Roy', type: 'Membership', code: 'SILVER-10', before: 1300, discount: 130, after: 1170, pct: '10.0%' },
                { ref: 'POS-2024-1079', date: '2024-10-20', customer: 'Vikram Joshi', type: 'Promo', code: 'COMBO-SAVER', before: 1100, discount: 100, after: 1000, pct: '9.1%' },
                { ref: 'POS-2024-1078', date: '2024-10-19', customer: 'Deepika Sen', type: 'Membership', code: 'GOLD-10', before: 1400, discount: 140, after: 1260, pct: '10.0%' },
                { ref: 'POS-2024-1075', date: '2024-10-18', customer: 'Sunita Menon', type: 'Coupon', code: 'RETAIL10', before: 1800, discount: 180, after: 1620, pct: '10.0%' },
                { ref: 'POS-2024-1073', date: '2024-10-17', customer: 'Megha Rao', type: 'Coupon', code: 'AUTUMN50', before: 350, discount: 35, after: 315, pct: '10.0%' },
                { ref: 'POS-2024-1071', date: '2024-10-17', customer: 'Kunal Kapoor', type: 'Manual', code: 'Stylist Discretion', before: 900, discount: 90, after: 810, pct: '10.0%' },
                { ref: 'POS-2024-1068', date: '2024-10-16', customer: 'Swati Nair', type: 'Membership', code: 'PLATINUM-15', before: 2400, discount: 360, after: 2040, pct: '15.0%' },
                { ref: 'POS-2024-1065', date: '2024-10-15', customer: 'Rishi Varma', type: 'Promo', code: 'BEARD-FEST', before: 700, discount: 100, after: 600, pct: '14.3%' },
                { ref: 'POS-2024-1062', date: '2024-10-14', customer: 'Nisha Pillai', type: 'Coupon', code: 'WELCOME10', before: 1200, discount: 120, after: 1080, pct: '10.0%' }
            ]
        },

        // 6. Returns & Refunds
        'prod_returns': {
            kpis: {
                return_count: 8,
                units_returned: 11,
                total_refunded: 4200,
                return_rate: '2.9%'
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [0, 800, 0, 1300, 600, 900, 0, 600]
            },
            reasons: {
                labels: ['Damaged / Leaking', 'Wrong Item Purchased', 'Customer Skin Reaction', 'Defective Pump/Nozzle', 'Exchange for Shade'],
                values: [1600, 1100, 800, 450, 250]
            },
            rows: [
                { ref: 'RET-2024-041', originalRef: 'POS-2024-1062', date: '2024-10-20', product: "L'Oréal Serie Expert Shampoo 300ml", qty: 1, val: 900, refund: 900, method: 'UPI', reason: 'Damaged / Leaking', status: 'Refunded' },
                { ref: 'RET-2024-040', originalRef: 'POS-2024-1054', date: '2024-10-17', product: 'Dermalogica Daily Microfoliant 74g', qty: 1, val: 1300, refund: 1300, method: 'Card', reason: 'Customer Skin Reaction', status: 'Refunded' },
                { ref: 'RET-2024-039', originalRef: 'POS-2024-1049', date: '2024-10-15', product: 'Schwarzkopf Osis Dust It', qty: 2, val: 700, refund: 700, method: 'Cash', reason: 'Wrong Item Purchased', status: 'Refunded' },
                { ref: 'RET-2024-038', originalRef: 'POS-2024-1038', date: '2024-10-12', product: 'Beardo Godfather Beard Oil 30ml', qty: 1, val: 350, refund: 350, method: 'UPI', reason: 'Defective Pump/Nozzle', status: 'Refunded' },
                { ref: 'RET-2024-037', originalRef: 'POS-2024-1025', date: '2024-10-09', product: 'Forest Essentials Mist', qty: 1, val: 400, refund: 400, method: 'Store Credit', reason: 'Exchange for Shade', status: 'Completed' },
                { ref: 'RET-2024-036', originalRef: 'POS-2024-1014', date: '2024-10-05', product: 'BBlunt Heat Protection Mist', qty: 1, val: 350, refund: 350, method: 'UPI', reason: 'Damaged / Leaking', status: 'Refunded' },
                { ref: 'RET-2024-035', originalRef: 'POS-2024-1002', date: '2024-10-02', product: 'Moroccan Argan Oil 100ml', qty: 1, val: 1200, refund: 1200, method: 'Card', reason: 'Wrong Item Purchased', status: 'Refunded' }
            ]
        },

        // 7. Payments
        'prod_payments': {
            kpis: {
                total_collected: 128400,
                pending_dues: 2100,
                refunded_amount: 4200,
                net_reconciled: 124200
            },
            trend: {
                labels: ['01 Oct', '04 Oct', '07 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct', '20 Oct'],
                values: [14200, 18500, 16800, 22400, 19100, 24800, 15900, 16700]
            },
            methods: {
                labels: ['UPI (GooglePay / PhonePe)', 'Credit / Debit Card', 'Cash Payments', 'Split Tender'],
                values: [74500, 36200, 13700, 4000]
            },
            rows: [
                { payRef: 'PAY-2024-9102', saleRef: 'POS-2024-1082', datetime: '2024-10-20, 04:31 PM', customer: 'Priya Sharma', bill: 1900, collected: 1900, mode: 'UPI', status: 'Paid' },
                { payRef: 'PAY-2024-9101', saleRef: 'POS-2024-1081', datetime: '2024-10-20, 03:16 PM', customer: 'Rahul Mehta', bill: 700, collected: 700, mode: 'Card', status: 'Paid' },
                { payRef: 'PAY-2024-9100', saleRef: 'POS-2024-1080', datetime: '2024-10-20, 01:46 PM', customer: 'Ananya Roy', bill: 1170, collected: 1170, mode: 'UPI', status: 'Paid' },
                { payRef: 'PAY-2024-9099', saleRef: 'POS-2024-1079', datetime: '2024-10-20, 12:21 PM', customer: 'Vikram Joshi', bill: 1000, collected: 1000, mode: 'Cash', status: 'Paid' },
                { payRef: 'PAY-2024-9098', saleRef: 'POS-2024-1078', datetime: '2024-10-19, 06:12 PM', customer: 'Deepika Sen', bill: 1260, collected: 1260, mode: 'UPI', status: 'Paid' },
                { payRef: 'PAY-2024-9097', saleRef: 'POS-2024-1077', datetime: '2024-10-19, 04:51 PM', customer: 'Walk-in Client', bill: 300, collected: 300, mode: 'Cash', status: 'Paid' },
                { payRef: 'PAY-2024-9096', saleRef: 'POS-2024-1076', datetime: '2024-10-19, 02:41 PM', customer: 'Rohan Nambiar', bill: 950, collected: 950, mode: 'Card', status: 'Paid' },
                { payRef: 'PAY-2024-9095', saleRef: 'POS-2024-1075', datetime: '2024-10-18, 05:26 PM', customer: 'Sunita Menon', bill: 1620, collected: 1620, mode: 'UPI', status: 'Paid' },
                { payRef: 'PAY-2024-9094', saleRef: 'POS-2024-1074', datetime: '2024-10-18, 01:11 PM', customer: 'Arjun Das', bill: 400, collected: 400, mode: 'UPI', status: 'Paid' },
                { payRef: 'PAY-2024-9093', saleRef: 'POS-2024-1073', datetime: '2024-10-17, 07:06 PM', customer: 'Megha Rao', bill: 315, collected: 315, mode: 'Card', status: 'Paid' }
            ]
        }
    };
}

// =============================================================================
// Report Sub-Renderers
// =============================================================================

// 1. Product Sales Overview
async function renderProdOverview(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_overview || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const cats = report.categories || { labels: [], values: [] };
        const rows = report.sales_transactions || report.rows || [];

        // 1. KPI Cards (4 cards with rich financial & inventory breakdown)
        data.kpi1.value = fmtINR(k.total_sales || 142850);
        data.kpi1.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Gross billed retail sales</span>`;

        const discAmount = k.total_discounts || 10250;
        const refundAmount = k.total_refunds || 4200;
        data.kpi2.value = fmtINR(k.net_sales || 128400);
        data.kpi2.subHtml = `
            <span style="display:inline-flex;align-items:center;gap:3px;color:#b45309;font-weight:600;background:#fef3c7;padding:1px 6px;border-radius:4px;font-size:0.72rem;">
                -${fmtINR(discAmount)} Disc
            </span>
            <span style="display:inline-flex;align-items:center;gap:3px;color:#dc2626;font-weight:600;background:#fee2e2;padding:1px 6px;border-radius:4px;font-size:0.72rem;">
                -${fmtINR(refundAmount)} Refund
            </span>
        `;

        const grossQty = k.gross_quantity || 359;
        const returnedQty = k.quantity_returned || 11;
        const netQty = k.quantity_sold || 348;
        data.kpi3.value = Number(netQty).toLocaleString('en-IN') + ' units';
        data.kpi3.subHtml = `
            <span style="color:#64748b;font-size:0.75rem;">${grossQty} Gross</span>
            <span style="color:#cbd5e1;">•</span>
            <span style="color:#dc2626;font-weight:600;font-size:0.75rem;">-${returnedQty} Ret.</span>
        `;

        data.kpi4.value = Number(k.unique_products || 42).toLocaleString('en-IN') + ' SKUs';
        data.kpi4.subHtml = `<span style="color:#64748b;font-size:0.75rem;">Active in 5 categories</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart (Sales Trend)
        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Daily Product Revenue',
            color: '#0ea5e9'
        });

        // 3. Donut Chart (Category Share)
        renderDonutChart(cats.labels, cats.values, {
            centerLabel: 'Net Sales',
            centerValue: fmtINR(k.net_sales || 0),
            colors: ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899']
        });

        // 4. Data Table (Sales Transactions Ledger)
        data.headers = ['Date & Time', 'Sale Ref', 'Customer', 'Staff / Stylist', 'Items & Qty', 'Gross Total', 'Discount', 'Final Amount', 'Payment', 'Status'];
        setupReportTable(data.headers, rows, {
            unitName: 'transactions',
            reportFileName: 'Product_Sales_Overview_Transactions',
            rowFormatter: (r) => {
                const prodList = Array.isArray(r.product_names) ? r.product_names : [r.product_names || '—'];
                const prodDisplay = prodList.length > 1
                    ? `<span>${prodList[0]}</span> <span style="font-size:0.75rem;color:#6366f1;font-weight:600;">+${prodList.length - 1} more</span>`
                    : `<span>${prodList[0] || '—'}</span>`;

                const discDisplay = (r.discount_amount && Number(r.discount_amount) > 0)
                    ? `<span style="color:#b45309;font-weight:600;">-${fmtINR(r.discount_amount)}</span>${r.discount_name ? `<br><small style="color:#92400e;font-size:0.7rem;">(${r.discount_name})</small>` : ''}`
                    : `<span style="color:#94a3b8;">—</span>`;

                const payMethod = (r.payment_method || 'other').toUpperCase();
                const payBadgeStyle = payMethod === 'UPI' 
                    ? 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;'
                    : payMethod === 'CARD'
                    ? 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
                    : payMethod === 'CASH'
                    ? 'background:#fefce8;color:#a16207;border:1px solid #fef08a;'
                    : 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;';

                return [
                    `<span style="white-space:nowrap;font-size:0.8rem;color:#475569;">${r.created_at || '—'}</span>`,
                    `<strong style="color:#4f46e5;font-size:0.82rem;letter-spacing:0.3px;">#${r.sale_id || '—'}</strong>`,
                    `<div><strong>${r.customer_name || 'Walk-in'}</strong>${r.customer_phone && r.customer_phone !== '—' ? `<br><small style="color:#64748b;font-size:0.75rem;">${r.customer_phone}</small>` : ''}</div>`,
                    `<span style="color:#334155;font-weight:500;">${r.staff_name || '—'}</span>`,
                    `<div>${prodDisplay}<br><span style="display:inline-block;margin-top:2px;font-size:0.72rem;background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:4px;font-weight:600;">${r.total_quantity || 1} ${r.total_quantity === 1 ? 'item' : 'items'}</span></div>`,
                    `<span style="font-weight:500;color:#334155;">${fmtINR(r.total_price || 0)}</span>`,
                    discDisplay,
                    `<strong style="color:#059669;font-size:0.9rem;">${fmtINR(r.final_amount || 0)}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;letter-spacing:0.5px;${payBadgeStyle}">${payMethod}</span>`,
                    statusBadge(r.payment_status || 'paid')
                ];
            }
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 2. Product-wise Sales Report
async function renderProdWise(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_wise || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const dist = report.distribution || { labels: [], values: [] };
        const rows = report.rows || [];

        // 1. KPI Cards (Option 3: Balanced Commercial & Inventory)
        // Card 1: Total Units Sold
        data.kpi1.value = Number(k.total_units || 348).toLocaleString('en-IN') + ' units';
        data.kpi1.subHtml = `<span style="color:#64748b;font-size:0.75rem;">${k.gross_units || 359} Gross units billed</span>`;

        // Card 2: Net Product Revenue
        data.kpi2.value = fmtINR(k.net_revenue || 128400);
        data.kpi2.subHtml = `<span style="color:#059669;font-weight:600;font-size:0.75rem;">Realized after discounts</span>`;

        // Card 3: Top Selling SKU
        data.kpi3.value = k.top_sku_name || "L'Oréal Shampoo";
        data.kpi3.subHtml = `<span style="color:#4f46e5;font-weight:600;font-size:0.75rem;">${k.top_sku_units || 48} units • ${k.top_sku_pct || '30.1%'} vol</span>`;

        // Card 4: Units Returned
        data.kpi4.value = Number(k.returned_units || 11).toLocaleString('en-IN') + ' units';
        data.kpi4.subHtml = `<span style="color:#dc2626;font-weight:600;background:#fee2e2;padding:1px 6px;border-radius:4px;font-size:0.72rem;">-${fmtINR(k.refunded_amount || 4200)} refund val</span>`;

        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Chart (Units Sold Trend)
        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Units Sold',
            isCurrency: false,
            color: '#6366f1',
            yAxisTitle: 'Units Sold →',
            xAxisTitle: 'Timeline →'
        });

        // 3. Donut Chart (Top SKUs Volume Share)
        renderDonutChart(dist.labels, dist.values, {
            centerLabel: 'Units Sold',
            centerValue: Number(k.total_units || 348).toLocaleString('en-IN'),
            isCurrency: false,
            colors: ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#94a3b8']
        });

        // 4. Data Table (Product Performance & Sales Ledger)
        data.headers = ['Rank', 'Product Name', 'SKU', 'Category', 'Units Sold', 'Returned', 'Gross Sales', 'Discounts', 'Net Sales', 'Share %'];
        setupReportTable(data.headers, rows, {
            unitName: 'products',
            reportFileName: 'Product_Wise_Sales_Report',
            rowFormatter: (r) => {
                const rank = r.rank || '—';
                const rankBg = rank === 1 ? '#f59e0b' : (rank === 2 ? '#64748b' : (rank === 3 ? '#d97706' : '#f1f5f9'));
                const rankTextColor = (typeof rank === 'number' && rank <= 3) ? '#ffffff' : '#0f172a';

                const retBadge = (r.returned && Number(r.returned) > 0)
                    ? `<span style="color:#dc2626;font-weight:600;background:#fee2e2;padding:1px 6px;border-radius:4px;font-size:0.75rem;">-${r.returned}</span>`
                    : `<span style="color:#94a3b8;">0</span>`;

                const discBadge = (r.disc && Number(r.disc) > 0)
                    ? `<span style="color:#b45309;font-weight:600;">-${fmtINR(r.disc)}</span>`
                    : `<span style="color:#94a3b8;">—</span>`;

                return [
                    `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${rankBg};font-weight:700;font-size:0.75rem;color:${rankTextColor};">${rank}</span>`,
                    `<div><strong>${r.name}</strong><br><small style="color:#94a3b8;font-size:0.7rem;">${r.txns ? `${r.txns} bills` : ''}</small></div>`,
                    `<code style="background:#f8fafc;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;font-size:0.75rem;">${r.sku}</code>`,
                    `<span style="color:#64748b;font-weight:500;">${r.category}</span>`,
                    `<strong>${Number(r.sold || 0).toLocaleString('en-IN')}</strong>`,
                    retBadge,
                    `<span style="color:#334155;">${fmtINR(r.gross)}</span>`,
                    discBadge,
                    `<strong style="color:#059669;">${fmtINR(r.net)}</strong>`,
                    `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-weight:600;font-size:0.75rem;">${r.pct || '—'}</span>`
                ];
            }
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 3. Sales by Category
async function renderProdCategory(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_category || {};
        const k = report.kpis || {};
        const comp = report.comparison || { labels: [], values: [] };
        const rows = report.rows || [];

        data.kpi1.value = Number(k.total_categories || 0).toLocaleString('en-IN');
        data.kpi2.value = k.top_category || '—';
        data.kpi3.value = Number(k.items_sold || 0).toLocaleString('en-IN') + ' units';
        data.kpi4.value = fmtINR(k.avg_rev_per_cat || 0);
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        renderTrendChart(comp.labels, comp.values, {
            type: 'bar',
            datasetLabel: 'Category Revenue',
            color: '#8b5cf6'
        });

        renderDonutChart(comp.labels, comp.values, {
            centerLabel: 'Total Retail',
            colors: ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899']
        });

        data.headers = ['Category Name', 'Active SKUs', 'Units Sold', 'Gross Revenue', 'Discounts', 'Net Revenue', 'Revenue %', 'Top Selling Product'];
        setupReportTable(data.headers, rows, {
            unitName: 'categories',
            reportFileName: 'Sales_By_Category_Report',
            rowFormatter: (r) => [
                `<strong>${r.name}</strong>`,
                `${r.skus} SKUs`,
                `<strong>${r.units}</strong>`,
                fmtINR(r.gross),
                r.disc > 0 ? `<span style="color:#b45309;">-${fmtINR(r.disc)}</span>` : '₹0',
                `<strong style="color:#059669;">${fmtINR(r.net)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#f3e8ff;color:#6b21a8;font-weight:600;font-size:0.75rem;">${r.pct}</span>`,
                `<span style="color:#334155;">${r.top}</span>`
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 4. Sales Transactions Report
async function renderProdTransactions(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_transactions || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const tenders = report.tender_split || { labels: [], values: [] };
        const rows = report.rows || [];

        data.kpi1.value = Number(k.total_txns || 0).toLocaleString('en-IN') + ' sales';
        data.kpi2.value = fmtINR(k.aov || 0);
        data.kpi3.value = Number(k.items_sold || 0).toLocaleString('en-IN') + ' items';
        data.kpi4.value = fmtINR(k.total_collected || 0);
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Daily POS Invoices',
            isCurrency: false,
            color: '#4f46e5'
        });

        renderDonutChart(tenders.labels, tenders.values, {
            centerLabel: 'Collected',
            centerValue: fmtINR(k.total_collected || 0),
            colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
        });

        data.headers = ['Invoice Ref', 'Date & Time', 'Customer', 'Staff / Stylist', 'Line Items', 'Gross Amount', 'Discount', 'Net Amount', 'Payment', 'Status'];
        setupReportTable(data.headers, rows, {
            unitName: 'transactions',
            reportFileName: 'Sales_Transactions_Report',
            rowFormatter: (r) => [
                `<strong style="color:#4f46e5;">${r.ref}</strong>`,
                `<span style="color:#64748b;font-size:0.8rem;">${r.datetime}</span>`,
                `<strong>${r.customer}</strong>`,
                `<span>${r.staff}</span>`,
                `<span style="font-size:0.825rem;color:#334155;">${r.items}</span>`,
                fmtINR(r.gross),
                r.disc > 0 ? `<span style="color:#b45309;">-${fmtINR(r.disc)}</span>` : '₹0',
                `<strong style="color:#059669;">${fmtINR(r.net)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#e0e7ff;color:#3730a3;font-weight:600;font-size:0.75rem;">${r.method}</span>`,
                statusBadge(r.status)
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 5. Discounts Report
async function renderProdDiscounts(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_discounts || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const types = report.discount_types || { labels: [], values: [] };
        const rows = report.rows || [];

        data.kpi1.value = fmtINR(k.total_discounts || 0);
        data.kpi2.value = Number(k.discounted_sales || 0).toLocaleString('en-IN') + ' sales';
        data.kpi3.value = fmtINR(k.avg_discount_sale || 0);
        data.kpi4.value = k.discount_rate || '0%';
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Daily Discounts Given',
            color: '#f43f5e'
        });

        renderDonutChart(types.labels, types.values, {
            centerLabel: 'Discounts',
            centerValue: fmtINR(k.total_discounts || 0),
            colors: ['#f43f5e', '#a855f7', '#0ea5e9', '#f59e0b']
        });

        data.headers = ['Invoice Ref', 'Date', 'Customer', 'Discount Type', 'Code / Campaign', 'Gross Amount', 'Discount (₹)', 'Final Amount', 'Effective %'];
        setupReportTable(data.headers, rows, {
            unitName: 'discounts',
            reportFileName: 'Product_Discounts_Report',
            rowFormatter: (r) => [
                `<strong style="color:#4f46e5;">${r.ref}</strong>`,
                fmtDate(r.date),
                `<strong>${r.customer}</strong>`,
                statusBadge(r.type),
                `<code style="background:#f8fafc;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;font-weight:600;font-size:0.75rem;">${r.code}</code>`,
                fmtINR(r.before),
                `<strong style="color:#e11d48;">-${fmtINR(r.discount)}</strong>`,
                `<strong style="color:#059669;">${fmtINR(r.after)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fee2e2;color:#991b1b;font-weight:600;font-size:0.75rem;">${r.pct}</span>`
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 6. Product Returns & Refunds Report
async function renderProdReturns(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_returns || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const reasons = report.reasons || { labels: [], values: [] };
        const rows = report.rows || [];

        data.kpi1.value = Number(k.return_count || 0).toLocaleString('en-IN') + ' returns';
        data.kpi2.value = Number(k.units_returned || 0).toLocaleString('en-IN') + ' units';
        data.kpi3.value = fmtINR(k.total_refunded || 0);
        data.kpi4.value = k.return_rate || '0%';
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        renderTrendChart(trend.labels, trend.values, {
            type: 'bar',
            datasetLabel: 'Daily Refunded Value',
            color: '#f59e0b'
        });

        renderDonutChart(reasons.labels, reasons.values, {
            centerLabel: 'Refunded',
            centerValue: fmtINR(k.total_refunded || 0),
            colors: ['#ef4444', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6']
        });

        data.headers = ['Return Ref', 'Original Sale', 'Date', 'Product', 'Qty', 'Product Value', 'Refunded Amount', 'Refund Method', 'Reason', 'Status'];
        setupReportTable(data.headers, rows, {
            unitName: 'returns',
            reportFileName: 'Product_Returns_Report',
            rowFormatter: (r) => [
                `<strong style="color:#b45309;">${r.ref}</strong>`,
                `<span style="color:#64748b;">${r.originalRef}</span>`,
                fmtDate(r.date),
                `<strong>${r.product}</strong>`,
                `<strong>${r.qty}</strong>`,
                fmtINR(r.val),
                `<strong style="color:#dc2626;">-${fmtINR(r.refund)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fef3c7;color:#92400e;font-weight:600;font-size:0.75rem;">${r.method}</span>`,
                `<span style="color:#475569;">${r.reason}</span>`,
                statusBadge(r.status)
            ]
        });
    };

    await initBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.onclick = loadData;
    loadData();
}

// 7. Sales Payments Report
async function renderProdPayments(data, supabase) {
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

        const result = await callMasterProductSalesRpc(supabase, companyId, bid, start, end);
        const report = result.prod_payments || {};
        const k = report.kpis || {};
        const trend = report.trend || { labels: [], values: [] };
        const methods = report.methods || { labels: [], values: [] };
        const rows = report.rows || [];

        data.kpi1.value = fmtINR(k.total_collected || 0);
        data.kpi2.value = fmtINR(k.pending_dues || 0);
        data.kpi3.value = fmtINR(k.refunded_amount || 0);
        data.kpi4.value = fmtINR(k.net_reconciled || 0);
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        renderTrendChart(trend.labels, trend.values, {
            type: 'line',
            datasetLabel: 'Daily Collections',
            color: '#06b6d4'
        });

        renderDonutChart(methods.labels, methods.values, {
            centerLabel: 'Reconciled',
            centerValue: fmtINR(k.net_reconciled || 0),
            colors: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b']
        });

        data.headers = ['Payment Ref', 'Invoice Ref', 'Date & Time', 'Customer', 'Sale Total', 'Collected Amount', 'Payment Mode', 'Status'];
        setupReportTable(data.headers, rows, {
            unitName: 'payments',
            reportFileName: 'Sales_Payments_Report',
            rowFormatter: (r) => [
                `<strong style="color:#0891b2;">${r.payRef}</strong>`,
                `<span style="color:#64748b;">${r.saleRef}</span>`,
                `<span style="color:#64748b;font-size:0.8rem;">${r.datetime}</span>`,
                `<strong>${r.customer}</strong>`,
                fmtINR(r.bill),
                `<strong style="color:#059669;">${fmtINR(r.collected)}</strong>`,
                `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#cffafe;color:#155e75;font-weight:600;font-size:0.75rem;">${r.mode}</span>`,
                statusBadge(r.status)
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
    console.log('[products-sales] Dispatching render for type:', type);

    switch (type) {
        case 'prod-overview':
            await renderProdOverview(data, supabase);
            break;
        case 'prod-wise':
            await renderProdWise(data, supabase);
            break;
        case 'prod-category':
            await renderProdCategory(data, supabase);
            break;
        case 'prod-transactions':
            await renderProdTransactions(data, supabase);
            break;
        case 'prod-discounts':
            await renderProdDiscounts(data, supabase);
            break;
        case 'prod-returns':
            await renderProdReturns(data, supabase);
            break;
        case 'prod-payments':
            await renderProdPayments(data, supabase);
            break;
        default:
            console.warn('[products-sales] Unknown report sub-type:', type);
            await renderProdOverview(data, supabase);
            break;
    }
}
