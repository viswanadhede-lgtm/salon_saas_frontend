// ============================================================================
// scripts/overview.js - Analytics Business Overview Controller
// Live integration with Supabase RPC: get_analytics_overview
// Covers all 9 rows: Revenue, Expenses, Rev/Exp Analysis, Activity,
// Sources Trend, Top Performers, Customer, Staff, Marketing Analytics
// ============================================================================

import { supabase } from '../lib/supabase.js';

// Chart.js Global Defaults
if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = '#64748b';
}

// Singleton chart instances (destroyed + re-created on each reload)
let revExpTrendChartInstance       = null;
let revDistDonutChartInstance      = null;
let expBreakdownDonutChartInstance = null;
let bookingsTrendChartInstance     = null;
let productsTrendChartInstance     = null;
let membershipsTrendChartInstance  = null;

// Utility: Format Indian Rupee
function fmtINR(val) {
    return 'Rs.' + Number(val || 0).toLocaleString('en-IN');
}

// Utility: Render a growth badge + period label into a trend-row
function renderTrendRow(rowEl, pct, periodLabel) {
    if (!rowEl) return;
    const badge  = rowEl.querySelector('.ov-trend-badge');
    const period = rowEl.querySelector('.ov-trend-period');
    const num = parseFloat(pct) || 0;
    if (badge) {
        const arrow  = num >= 0 ? '\u2191' : '\u2193';
        badge.textContent = arrow + ' ' + Math.abs(num).toFixed(1) + '%';
        badge.className   = 'ov-trend-badge ' + (num >= 0 ? 'up' : 'down');
    }
    if (period) period.textContent = periodLabel;
}

// Utility: Build human-readable comparison label from period object
function buildComparisonLabel(period) {
    if (!period) return 'vs previous period';
    const start = period.prev_start_date;
    const end   = period.prev_end_date;
    if (!start || !end) return 'vs previous period';
    const s   = new Date(start + 'T00:00:00');
    const e   = new Date(end   + 'T00:00:00');
    const fmt = function(d) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    return 'vs ' + fmt(s) + ' to ' + fmt(e);
}

// Utility: localStorage-safe branch id getter
function getBranchId() {
    let b = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
    if (b === 'null' || b === 'undefined') b = null;
    if (!b) {
        try {
            const ctx = JSON.parse(localStorage.getItem('active_company_context') || localStorage.getItem('appContext') || '{}');
            b = (ctx.branch && (ctx.branch.branch_id || ctx.branch.id)) ||
                (ctx.activeBranch && (ctx.activeBranch.id || ctx.activeBranch.branch_id));
        } catch (_) {}
    }
    return b || null;
}

// Utility: localStorage-safe company id getter
function getCompanyId() {
    let c = localStorage.getItem('company_id');
    if (c === 'null' || c === 'undefined') c = null;
    if (!c) {
        try {
            const ctx = JSON.parse(localStorage.getItem('active_company_context') || localStorage.getItem('appContext') || '{}');
            c = (ctx.company && (ctx.company.company_id || ctx.company.id));
        } catch (_) {}
    }
    return c || null;
}

// Utility: Parse date range from selector value
function getDateRange(selectorVal) {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const pad   = function(n) { return String(n).padStart(2, '0'); };
    const iso   = function(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

    if (selectorVal === 'today') {
        return { start: iso(today), end: iso(today) };
    }
    if (selectorVal === 'this_week') {
        const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
        const mon = new Date(today);
        mon.setDate(today.getDate() - day);
        return { start: iso(mon), end: iso(today) };
    }
    if (selectorVal === '30days') {
        const from = new Date(today);
        from.setDate(today.getDate() - 29);
        return { start: iso(from), end: iso(today) };
    }
    if (selectorVal === 'this_month') {
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: iso(from), end: iso(today) };
    }
    // Default: oct1_16 test range
    return { start: '2026-10-01', end: '2026-10-16' };
}

// =============================================================================
// BRANCH SELECTOR
// =============================================================================
async function initBranchSelector() {
    const branchSelect = document.getElementById('branchSelect');
    if (!branchSelect) return;
    try {
        const companyId = getCompanyId();
        let query = supabase.from('branches').select('branch_id, branch_name, status');
        if (companyId) query = query.eq('company_id', companyId);
        const { data: branches, error } = await query;
        if (!error && Array.isArray(branches) && branches.length > 0) {
            const activeId = getBranchId();
            branchSelect.innerHTML = branches.map(function(b) {
                return '<option value="' + b.branch_id + '"' + (b.branch_id === activeId ? ' selected' : '') + '>' + (b.branch_name || 'Branch') + '</option>';
            }).join('');
        }
    } catch (e) {
        console.warn('[Overview] Branch selector error:', e);
    }
}

// =============================================================================
// CHART RENDERERS
// =============================================================================

// Chart 1: Revenue & Expense Trend Line Chart (Row 3)
function renderRevExpTrendChart(labels, revData, expData) {
    const canvas = document.getElementById('revExpTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (revExpTrendChartInstance) revExpTrendChartInstance.destroy();

    const ctx      = canvas.getContext('2d');
    const gradBlue = ctx.createLinearGradient(0, 0, 0, 240);
    gradBlue.addColorStop(0, 'rgba(59,130,246,0.25)');
    gradBlue.addColorStop(1, 'rgba(59,130,246,0.00)');
    const gradRose = ctx.createLinearGradient(0, 0, 0, 240);
    gradRose.addColorStop(0, 'rgba(244,63,94,0.20)');
    gradRose.addColorStop(1, 'rgba(244,63,94,0.00)');

    revExpTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue', data: revData,
                    borderColor: '#3b82f6', backgroundColor: gradBlue,
                    borderWidth: 2.5, fill: true, tension: 0.38,
                    pointRadius: 4, pointHoverRadius: 6,
                    pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 2
                },
                {
                    label: 'Expenses', data: expData,
                    borderColor: '#f43f5e', backgroundColor: gradRose,
                    borderWidth: 2.5, fill: true, tension: 0.38,
                    pointRadius: 4, pointHoverRadius: 6,
                    pointBackgroundColor: '#f43f5e', pointBorderColor: '#fff', pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', titleColor: '#fff', bodyColor: '#e2e8f0',
                    padding: 10, borderRadius: 8,
                    callbacks: {
                        label: function(c) { return c.dataset.label + ': Rs.' + Number(c.raw).toLocaleString('en-IN'); }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9', drawBorder: false },
                    ticks: {
                        font: { size: 11 },
                        callback: function(v) { return v === 0 ? 'Rs.0' : 'Rs.' + Math.round(v / 1000) + 'K'; }
                    }
                },
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } }
            }
        }
    });
}

// Chart 2: Revenue Distribution Donut (Row 3)
function renderRevenueDistributionDonut(bookingsRev, productsRev, membershipsRev) {
    const canvas = document.getElementById('revDistDonutChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (revDistDonutChartInstance) revDistDonutChartInstance.destroy();

    const ctx   = canvas.getContext('2d');
    const total = bookingsRev + productsRev + membershipsRev;

    revDistDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bookings', 'Products', 'Memberships'],
            datasets: [{
                data: [bookingsRev, productsRev, membershipsRev],
                backgroundColor: ['#3b82f6', '#f97316', '#8b5cf6'],
                hoverBackgroundColor: ['#2563eb', '#ea580c', '#7c3aed'],
                borderWidth: 0, spacing: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            const pct = total > 0 ? Math.round((c.raw / total) * 1000) / 10 : 0;
                            return ' ' + c.label + ': Rs.' + Number(c.raw).toLocaleString('en-IN') + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });

    // Update legend list dynamically
    const legendEl = document.getElementById('revDistDonutLegendList');
    if (legendEl) {
        const items = [
            { label: 'Bookings',    val: bookingsRev,    color: '#3b82f6' },
            { label: 'Products',    val: productsRev,    color: '#f97316' },
            { label: 'Memberships', val: membershipsRev, color: '#8b5cf6' }
        ];
        legendEl.innerHTML = items.map(function(it) {
            const pct = total > 0 ? (it.val / total * 100).toFixed(1) : '0.0';
            return '<div class="ov-donut-legend-row">' +
                '<div class="ov-donut-legend-left">' +
                '<span class="ov-legend-dot" style="background:' + it.color + ';"></span>' +
                '<span>' + it.label + '</span>' +
                '</div>' +
                '<div class="ov-donut-legend-right">' +
                '<span class="ov-donut-legend-pct">' + pct + '%</span>' +
                '<span class="ov-donut-legend-amt">Rs.' + Number(it.val).toLocaleString('en-IN') + '</span>' +
                '</div>' +
                '</div>';
        }).join('');
    }
}

// Chart 3: Expense Breakdown Donut (Row 3) - dynamic categories from RPC
function renderExpenseBreakdownDonut(breakdownArray) {
    const canvas = document.getElementById('expBreakdownDonutChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (expBreakdownDonutChartInstance) expBreakdownDonutChartInstance.destroy();

    const palette = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#94a3b8', '#8b5cf6', '#06b6d4'];
    const items   = Array.isArray(breakdownArray) && breakdownArray.length > 0
        ? breakdownArray
        : [{ category: 'No Data', amount: 1, percentage: 100 }];

    const ctx = canvas.getContext('2d');
    expBreakdownDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: items.map(function(i) { return i.category; }),
            datasets: [{
                data: items.map(function(i) { return i.amount; }),
                backgroundColor: palette.slice(0, items.length),
                hoverBackgroundColor: palette.slice(0, items.length),
                borderWidth: 0, spacing: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            var it = items[c.dataIndex];
                            return ' ' + c.label + ': Rs.' + Number(c.raw).toLocaleString('en-IN') + ' (' + ((it && it.percentage) || 0).toFixed(1) + '%)';
                        }
                    }
                }
            }
        }
    });

    // Update legend list dynamically
    const legendEl = document.getElementById('expBreakdownDonutLegendList');
    if (legendEl) {
        if (items.length === 1 && items[0].category === 'No Data') {
            legendEl.innerHTML = '<p style="font-size:0.75rem;color:#94a3b8;text-align:center;padding:8px 0;">No expense data for this period</p>';
        } else {
            legendEl.innerHTML = items.map(function(it, idx) {
                return '<div class="ov-donut-legend-row">' +
                    '<div class="ov-donut-legend-left">' +
                    '<span class="ov-legend-dot" style="background:' + (palette[idx] || '#94a3b8') + ';"></span>' +
                    '<span>' + it.category + '</span>' +
                    '</div>' +
                    '<div class="ov-donut-legend-right">' +
                    '<span class="ov-donut-legend-pct">' + (it.percentage || 0).toFixed(1) + '%</span>' +
                    '<span class="ov-donut-legend-amt">Rs.' + Number(it.amount).toLocaleString('en-IN') + '</span>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }
    }
}

// Charts: Sources Trend mini-line charts (Row 5)
function renderSourceTrendCharts(labels, bookingsData, productsData, membershipsData) {
    function makeChart(canvasId, data, hexColor, tooltipLabel, oldInstance) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return oldInstance;
        if (oldInstance) oldInstance.destroy();
        const ctx  = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 150);
        // Convert hex to rgba manually for gradient
        var r = parseInt(hexColor.slice(1,3),16), g = parseInt(hexColor.slice(3,5),16), b = parseInt(hexColor.slice(5,7),16);
        grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.22)');
        grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.00)');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data, borderColor: hexColor, backgroundColor: grad,
                    borderWidth: 2.2, fill: true, tension: 0.38,
                    pointRadius: 3.5, pointHoverRadius: 5.5,
                    pointBackgroundColor: hexColor, pointBorderColor: '#fff', pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(c) { return ' ' + tooltipLabel + ': ' + c.raw; } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } }
                }
            }
        });
    }

    bookingsTrendChartInstance    = makeChart('bookingsTrendChart',    bookingsData,    '#2563eb', 'Bookings',    bookingsTrendChartInstance);
    productsTrendChartInstance    = makeChart('productsTrendChart',    productsData,    '#ea580c', 'Products',    productsTrendChartInstance);
    membershipsTrendChartInstance = makeChart('membershipsTrendChart', membershipsData, '#9333ea', 'Memberships', membershipsTrendChartInstance);
}

// =============================================================================
// ROW DATA BINDERS
// =============================================================================

// Row 1: Revenue Summary
function bindRevenueSummary(rs, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('kpiTotalRevenue',       fmtINR(rs.total_revenue));
    set('kpiBookingsRevenue',    fmtINR(rs.bookings_revenue));
    set('kpiProductsRevenue',    fmtINR(rs.products_revenue));
    set('kpiMembershipsRevenue', fmtINR(rs.memberships_revenue));

    var cards   = document.querySelectorAll('#revenueSummarySection .ov-metric-card');
    var growths = [rs.total_growth_pct, rs.bookings_growth_pct, rs.products_growth_pct, rs.memberships_growth_pct];
    cards.forEach(function(card, i) {
        var row = card.querySelector('.ov-trend-row');
        if (row) renderTrendRow(row, growths[i], compLabel);
    });
}

// Row 2: Expenses & Net Revenue
function bindExpensesNetRevenue(en, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('kpiTotalExpenses', fmtINR(en.total_expenses));
    set('kpiNetRevenue',    fmtINR(en.net_revenue));

    var cards   = document.querySelectorAll('#expensesNetRevenueSection .ov-metric-card-horizontal');
    var growths = [en.expenses_growth_pct, en.net_growth_pct];
    cards.forEach(function(card, i) {
        var row = card.querySelector('.ov-trend-row');
        if (row) renderTrendRow(row, growths[i], compLabel);
    });
}

// Row 3: Rev/Exp Analysis - charts
function bindRevExpAnalysis(analysis, rs) {
    var timeline = Array.isArray(analysis.timeline) ? analysis.timeline : [];
    var labels   = timeline.map(function(t) { return t.label; });
    var revData  = timeline.map(function(t) { return Number(t.revenue) || 0; });
    var expData  = timeline.map(function(t) { return Number(t.expense)  || 0; });

    renderRevExpTrendChart(labels, revData, expData);

    var dist   = analysis.revenue_distribution || {};
    var bRev   = Number(dist.bookings    || rs.bookings_revenue    || 0);
    var pRev   = Number(dist.products    || rs.products_revenue    || 0);
    var mRev   = Number(dist.memberships || rs.memberships_revenue || 0);
    renderRevenueDistributionDonut(bRev, pRev, mRev);

    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('donutRevCenterVal', fmtINR(bRev + pRev + mRev));

    renderExpenseBreakdownDonut(analysis.expense_breakdown || []);
    var totalExp = (analysis.expense_breakdown || []).reduce(function(s, i) { return s + (i.amount || 0); }, 0);
    set('donutExpCenterVal', fmtINR(totalExp));
}

// Row 4: Business Activity
function bindBusinessActivity(ba, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('kpiActivityBookings',    ba.total_bookings);
    set('kpiActivityProducts',    ba.products_sold);
    set('kpiActivityMemberships', ba.memberships_purchased);

    var cards   = document.querySelectorAll('#businessActivitySection .ov-metric-with-bars');
    var growths = [ba.bookings_growth_pct, ba.products_growth_pct, ba.memberships_growth_pct];
    cards.forEach(function(card, i) {
        var row = card.querySelector('.ov-trend-row');
        if (row) renderTrendRow(row, growths[i], compLabel);
    });
}

// Row 5: Sources Trend
function bindSourcesTrend(sourcesTrend, ba, rs, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('sourceBookingsVal',    ba.total_bookings);
    set('sourceProductsVal',    ba.products_sold);
    set('sourceMembershipsVal', ba.memberships_purchased);

    var cards   = document.querySelectorAll('#sourcesTrendSection .ov-source-trend-card');
    var growths = [rs.bookings_growth_pct, rs.products_growth_pct, rs.memberships_growth_pct];
    cards.forEach(function(card, i) {
        var badge  = card.querySelector('.ov-trend-badge');
        var period = card.querySelector('.ov-trend-period');
        var num    = parseFloat(growths[i]) || 0;
        if (badge) {
            badge.textContent = (num >= 0 ? '\u2191' : '\u2193') + ' ' + Math.abs(num).toFixed(1) + '%';
            badge.className   = 'ov-trend-badge ' + (num >= 0 ? 'up' : 'down');
        }
        if (period) period.textContent = compLabel;
    });

    var trend       = Array.isArray(sourcesTrend) ? sourcesTrend : [];
    var labels      = trend.map(function(t) { return t.label; });
    var bookingsArr = trend.map(function(t) { return Number(t.bookings    || 0); });
    var productsArr = trend.map(function(t) { return Number(t.products    || 0); });
    var membArr     = trend.map(function(t) { return Number(t.memberships || 0); });

    renderSourceTrendCharts(labels, bookingsArr, productsArr, membArr);
}

// Row 6: Top 5 Performers
function bindTopPerformers(tp) {
    function renderTable(tbodyId, rows) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        if (!Array.isArray(rows) || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8;">No data for this period</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function(r) {
            return '<tr>' +
                '<td class="rank">' + r.rank + '</td>' +
                '<td class="item-name">' + (r.name || '-') + '</td>' +
                '<td class="num">' + (r.count || 0) + '</td>' +
                '<td class="num revenue-cell">' + fmtINR(r.revenue) + '</td>' +
                '</tr>';
        }).join('');
    }

    renderTable('topServicesTableBody',    tp.services    || []);
    renderTable('topProductsTableBody',    tp.products    || []);
    renderTable('topMembershipsTableBody', tp.memberships || []);
}

// Row 7: Customer Analytics
function bindCustomerAnalytics(ca, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('custTotal',      ca.total_customers);
    set('custNew',        ca.new_customers);
    set('custReturning',  ca.returning_customers);
    set('custRepeatRate', Number(ca.repeat_visit_rate || 0).toFixed(1) + '%');

    document.querySelectorAll('#customerAnalyticsSection .ov-trend-period').forEach(function(el) {
        el.textContent = compLabel;
    });
}

// Row 8: Staff Analytics
function bindStaffAnalytics(sa, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('staffTotal',     sa.total_staff);
    set('staffCompleted', sa.completed_appointments);
    set('staffRevenue',   fmtINR(sa.staff_service_revenue));

    document.querySelectorAll('#staffAnalyticsSection .ov-trend-period').forEach(function(el) {
        el.textContent = compLabel;
    });

    var listEl   = document.getElementById('topStaffList');
    var topStaff = Array.isArray(sa.top_staff) ? sa.top_staff : [];
    if (listEl) {
        if (topStaff.length === 0) {
            listEl.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;text-align:center;padding:12px 0;">No staff activity for this period</p>';
        } else {
            var avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e'];
            listEl.innerHTML = topStaff.map(function(s, idx) {
                var initials = (s.name || 'ST').split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
                var color    = avatarColors[idx % avatarColors.length];
                return '<div class="ov-staff-row">' +
                    '<div class="ov-staff-left">' +
                    '<span class="ov-staff-rank">' + s.rank + '</span>' +
                    '<span class="ov-staff-avatar" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:' + color + ';color:#fff;font-size:0.7rem;font-weight:700;flex-shrink:0;">' + initials + '</span>' +
                    '<span class="ov-staff-name">' + (s.name || 'Staff') + '</span>' +
                    '</div>' +
                    '<div class="ov-staff-right">' +
                    '<span class="ov-staff-bookings">' + s.bookings + ' bookings</span>' +
                    '<span class="ov-staff-divider">|</span>' +
                    '<span class="ov-staff-rev">' + fmtINR(s.revenue) + '</span>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }
    }
}

// Row 9: Marketing Analytics
function bindMarketingAnalytics(ma, compLabel) {
    function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    set('mktCoupons',     ma.coupons_redeemed);
    set('mktMemberships', ma.memberships_purchased);
    set('mktOffers',      ma.offer_redemptions);
    set('mktDiscounts',   fmtINR(ma.total_discounts_given));

    var cards   = document.querySelectorAll('#marketingAnalyticsSection .ov-metric-card');
    var growths = [ma.coupons_growth_pct, ma.memberships_growth_pct, ma.offers_growth_pct, ma.discounts_growth_pct];
    cards.forEach(function(card, i) {
        var row = card.querySelector('.ov-trend-row');
        if (row) renderTrendRow(row, growths[i], compLabel);
    });
}

// =============================================================================
// LOADING STATE
// =============================================================================
function showLoadingState() {
    document.querySelectorAll('.ov-metric-value').forEach(function(el) {
        el.style.opacity    = '0.35';
        el.style.transition = 'opacity 0.3s';
    });
}

function hideLoadingState() {
    document.querySelectorAll('.ov-metric-value').forEach(function(el) {
        el.style.opacity = '1';
    });
}

// =============================================================================
// ERROR BANNER
// =============================================================================
function showErrorBanner(msg) {
    var existing = document.getElementById('ovErrorBanner');
    if (existing) existing.remove();
    var banner       = document.createElement('div');
    banner.id        = 'ovErrorBanner';
    banner.style.cssText = [
        'position:fixed', 'top:70px', 'left:50%', 'transform:translateX(-50%)',
        'background:#fef2f2', 'border:1px solid #fecaca', 'border-radius:10px',
        'color:#b91c1c', 'padding:12px 20px', 'font-size:0.85rem',
        'z-index:9999', 'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
        'display:flex', 'align-items:center', 'gap:10px', 'max-width:90%'
    ].join(';');
    banner.innerHTML = '<span>&#9888;&#65039;</span><span>' + msg + '</span>' +
        '<button onclick="this.parentElement.remove()" style="margin-left:12px;background:none;border:none;cursor:pointer;color:#b91c1c;font-size:1rem;">&#x2715;</button>';
    document.body.appendChild(banner);
    setTimeout(function() { if (banner.parentNode) banner.remove(); }, 6000);
}

// =============================================================================
// MASTER LOADER - calls RPC + binds all 9 rows
// =============================================================================
async function loadOverviewData() {
    showLoadingState();
    try {
        const companyId = getCompanyId();

        // Read selected values from UI filters
        const dateRangeEl  = document.getElementById('overviewDateRange');
        const branchEl     = document.getElementById('branchSelect');
        const selectorVal  = dateRangeEl ? dateRangeEl.value : 'oct1_16';
        const activeBranch = branchEl    ? branchEl.value    : (getBranchId() || null);

        const { start, end } = getDateRange(selectorVal);

        // Build RPC params (only include non-null values)
        const rpcParams = { p_start_date: start, p_end_date: end };
        if (activeBranch && activeBranch !== 'null' && activeBranch !== 'undefined') {
            rpcParams.p_branch_id = activeBranch;
        }
        if (companyId) {
            rpcParams.p_company_id = companyId;
        }

        console.log('[Overview] Calling RPC get_analytics_overview:', rpcParams);

        const { data, error } = await supabase.rpc('get_analytics_overview', rpcParams);

        if (error) {
            console.error('[Overview] RPC error:', error);
            hideLoadingState();
            showErrorBanner('Failed to load analytics: ' + (error.message || JSON.stringify(error)));
            return;
        }
        if (!data) {
            console.warn('[Overview] RPC returned null');
            hideLoadingState();
            return;
        }

        console.log('[Overview] RPC data:', data);

        // Build comparison label from period returned by RPC
        const compLabel = buildComparisonLabel(data.period);

        // Destructure all 9 sections with safe fallbacks
        const rs = data.revenue_summary      || {};
        const en = data.expenses_net_revenue || {};
        const ea = data.rev_exp_analysis     || {};
        const ba = data.business_activity    || {};
        const st = data.sources_trend        || [];
        const tp = data.top_performers       || {};
        const ca = data.customer_analytics   || {};
        const sa = data.staff_analytics      || {};
        const ma = data.marketing_analytics  || {};

        // Bind all rows
        bindRevenueSummary(rs, compLabel);
        bindExpensesNetRevenue(en, compLabel);
        bindRevExpAnalysis(ea, rs);
        bindBusinessActivity(ba, compLabel);
        bindSourcesTrend(st, ba, rs, compLabel);
        bindTopPerformers(tp);
        bindCustomerAnalytics(ca, compLabel);
        bindStaffAnalytics(sa, compLabel);
        bindMarketingAnalytics(ma, compLabel);

        hideLoadingState();

        // Re-init feather icons after any DOM injection
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('[Overview] Unexpected error:', err);
        hideLoadingState();
        showErrorBanner('Unexpected error: ' + err.message);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================
async function initOverviewPage() {
    if (window.feather) feather.replace();

    // Init branch dropdown first, then fetch live data
    await initBranchSelector();
    await loadOverviewData();

    // Re-fire on filter changes
    const dateRangeEl = document.getElementById('overviewDateRange');
    const branchEl    = document.getElementById('branchSelect');
    if (dateRangeEl) dateRangeEl.addEventListener('change', loadOverviewData);
    if (branchEl)    branchEl.addEventListener('change', loadOverviewData);
}

// DOM-ready guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverviewPage);
} else {
    initOverviewPage();
}
