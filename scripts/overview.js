// scripts/overview.js - Analytics Business Overview Controller
// Matches the visual layout, chart rendering, and data breakdown from design.

import { supabase } from '../lib/supabase.js';

// Chart.js Global Configuration
if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = '#64748b';
}

let revExpTrendChartInstance = null;
let revDistDonutChartInstance = null;
let expBreakdownDonutChartInstance = null;
let bookingsTrendChartInstance = null;
let productsTrendChartInstance = null;
let membershipsTrendChartInstance = null;

// Helper: Format Rupee Currency
function fmtINR(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN');
}

// ── Chart Group: Section 9 Sources Trend (Bookings, Products, Memberships) ──
function renderSourceTrendCharts(labels, bookingsData, productsData, membershipsData) {
    // 1. Bookings Trend Chart
    const bCanvas = document.getElementById('bookingsTrendChart');
    if (bCanvas && typeof Chart !== 'undefined') {
        if (bookingsTrendChartInstance) bookingsTrendChartInstance.destroy();
        const ctx = bCanvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 150);
        grad.addColorStop(0, 'rgba(37, 99, 235, 0.22)');
        grad.addColorStop(1, 'rgba(37, 99, 235, 0.00)');

        bookingsTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: bookingsData,
                    borderColor: '#2563eb',
                    backgroundColor: grad,
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 3.5,
                    pointHoverRadius: 5.5,
                    pointBackgroundColor: '#2563eb',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Bookings: ${ctx.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9', borderDash: [3, 3] },
                        ticks: { font: { size: 10 }, stepSize: 10 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#64748b' }
                    }
                }
            }
        });
    }

    // 2. Product Sales Trend Chart
    const pCanvas = document.getElementById('productsTrendChart');
    if (pCanvas && typeof Chart !== 'undefined') {
        if (productsTrendChartInstance) productsTrendChartInstance.destroy();
        const ctx = pCanvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 150);
        grad.addColorStop(0, 'rgba(234, 88, 12, 0.22)');
        grad.addColorStop(1, 'rgba(234, 88, 12, 0.00)');

        productsTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: productsData,
                    borderColor: '#ea580c',
                    backgroundColor: grad,
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 3.5,
                    pointHoverRadius: 5.5,
                    pointBackgroundColor: '#ea580c',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Products Sold: ${ctx.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9', borderDash: [3, 3] },
                        ticks: { font: { size: 10 }, stepSize: 20 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#64748b' }
                    }
                }
            }
        });
    }

    // 3. Memberships Trend Chart
    const mCanvas = document.getElementById('membershipsTrendChart');
    if (mCanvas && typeof Chart !== 'undefined') {
        if (membershipsTrendChartInstance) membershipsTrendChartInstance.destroy();
        const ctx = mCanvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 150);
        grad.addColorStop(0, 'rgba(147, 51, 234, 0.22)');
        grad.addColorStop(1, 'rgba(147, 51, 234, 0.00)');

        membershipsTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: membershipsData,
                    borderColor: '#9333ea',
                    backgroundColor: grad,
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 3.5,
                    pointHoverRadius: 5.5,
                    pointBackgroundColor: '#9333ea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Memberships: ${ctx.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9', borderDash: [3, 3] },
                        ticks: { font: { size: 10 }, stepSize: 5 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#64748b' }
                    }
                }
            }
        });
    }
}

// ── Chart 1: Revenue & Expense Trend ─────────────────────────────────────────
function renderRevExpTrendChart(labels, revData, expData) {
    const canvas = document.getElementById('revExpTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (revExpTrendChartInstance) {
        revExpTrendChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Create Linear Gradients
    const gradBlue = ctx.createLinearGradient(0, 0, 0, 240);
    gradBlue.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    gradBlue.addColorStop(1, 'rgba(59, 130, 246, 0.00)');

    const gradRose = ctx.createLinearGradient(0, 0, 0, 240);
    gradRose.addColorStop(0, 'rgba(244, 63, 94, 0.20)');
    gradRose.addColorStop(1, 'rgba(244, 63, 94, 0.00)');

    revExpTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    borderColor: '#3b82f6',
                    backgroundColor: gradBlue,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Expenses',
                    data: expData,
                    borderColor: '#f43f5e',
                    backgroundColor: gradRose,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f43f5e',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
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
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    borderRadius: 8,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${fmtINR(ctx.raw)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#f1f5f9',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 11 },
                        callback: (val) => val === 0 ? '₹0' : `₹${Math.round(val / 1000)}K`
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#64748b'
                    }
                }
            }
        }
    });
}

// ── Chart 2: Revenue Distribution Donut ──────────────────────────────────────
function renderRevenueDistributionDonut(bookingsRev, productsRev, membershipsRev) {
    const canvas = document.getElementById('revDistDonutChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (revDistDonutChartInstance) {
        revDistDonutChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const total = bookingsRev + productsRev + membershipsRev;

    revDistDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bookings', 'Products', 'Memberships'],
            datasets: [{
                data: [bookingsRev, productsRev, membershipsRev],
                backgroundColor: ['#3b82f6', '#f97316', '#8b5cf6'],
                hoverBackgroundColor: ['#2563eb', '#ea580c', '#7c3aed'],
                borderWidth: 0,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round((val / total) * 1000) / 10 : 0;
                            return ` ${ctx.label}: ${fmtINR(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ── Chart 3: Expense Breakdown Donut ─────────────────────────────────────────
function renderExpenseBreakdownDonut(breakdown) {
    const canvas = document.getElementById('expBreakdownDonutChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (expBreakdownDonutChartInstance) {
        expBreakdownDonutChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const dataVals = [
        breakdown.rent || 10000,
        breakdown.salaries || 8000,
        breakdown.utilities || 5000,
        breakdown.supplies || 4000,
        breakdown.other || 5400
    ];
    const total = dataVals.reduce((a, b) => a + b, 0);

    expBreakdownDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Rent', 'Salaries', 'Utilities', 'Supplies', 'Other'],
            datasets: [{
                data: dataVals,
                backgroundColor: ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#94a3b8'],
                hoverBackgroundColor: ['#e11d48', '#d97706', '#059669', '#2563eb', '#64748b'],
                borderWidth: 0,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw;
                            const pct = total > 0 ? Math.round((val / total) * 1000) / 10 : 0;
                            return ` ${ctx.label}: ${fmtINR(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ── Populate Branch Selector ─────────────────────────────────────────────────
async function initBranchSelector() {
    const branchSelect = document.getElementById('branchSelect');
    if (!branchSelect) return;

    try {
        const companyId = localStorage.getItem('company_id');
        let query = supabase.from('branches').select('id, name');
        if (companyId) {
            query = query.eq('company_id', companyId);
        }
        const { data: branches, error } = await query;
        if (!error && Array.isArray(branches) && branches.length > 0) {
            const activeId = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
            branchSelect.innerHTML = branches.map(b => 
                `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${b.name || 'Main Branch'}</option>`
            ).join('');
        }
    } catch (e) {
        console.warn('Branch selection error:', e);
    }
}

// ── Master Loader ────────────────────────────────────────────────────────────
async function loadOverviewPage() {
    // 1. Initial Feather icons replace
    if (window.feather) feather.replace();

    // 2. Default Baseline Data (Matching the design screenshot)
    const baselineLabels = ['Oct 1', 'Oct 3', 'Oct 5', 'Oct 7', 'Oct 9', 'Oct 11', 'Oct 13', 'Oct 15'];
    const baselineRev = [6200, 7500, 6400, 9100, 10200, 13400, 16800, 12200];
    const baselineExp = [2100, 3200, 2600, 3500, 3100, 4900, 5200, 3900];

    // Render Line Chart
    renderRevExpTrendChart(baselineLabels, baselineRev, baselineExp);

    // Render Donut 1 (Revenue Distribution)
    renderRevenueDistributionDonut(78000, 28500, 18000);

    // Render Donut 2 (Expense Breakdown)
    renderExpenseBreakdownDonut({
        rent: 10000,
        salaries: 8000,
        utilities: 5000,
        supplies: 4000,
        other: 5400
    });

    // Render Section 9 (Sources Trend)
    const sourceLabels = ['Oct 1', 'Oct 4', 'Oct 7', 'Oct 10', 'Oct 13', 'Oct 16'];
    const baselineBookingsTrend = [11, 18, 14, 23, 27, 33];
    const baselineProductsTrend = [20, 43, 32, 47, 66, 53];
    const baselineMembershipsTrend = [2, 5, 3, 4, 6, 4];
    renderSourceTrendCharts(sourceLabels, baselineBookingsTrend, baselineProductsTrend, baselineMembershipsTrend);

    // 3. Connect filter listeners
    const dateRange = document.getElementById('overviewDateRange');
    const branchSelect = document.getElementById('branchSelect');

    const handleFilterChange = async () => {
        const selVal = dateRange ? dateRange.value : 'oct1_16';
        
        // Dynamic simulated adjustment based on timeframe
        let multiplier = 1.0;
        let dateSubtext = 'vs Sep 15 - Sep 30, 2026';

        if (selVal === 'today') {
            multiplier = 0.08;
            dateSubtext = 'vs yesterday';
        } else if (selVal === 'this_week') {
            multiplier = 0.45;
            dateSubtext = 'vs last week';
        } else if (selVal === '30days') {
            multiplier = 1.85;
            dateSubtext = 'vs previous 30 days';
        } else if (selVal === 'this_month') {
            multiplier = 1.0;
            dateSubtext = 'vs last month';
        }

        const totalRev = Math.round(124500 * multiplier);
        const bookRev = Math.round(78000 * multiplier);
        const prodRev = Math.round(28500 * multiplier);
        const membRev = Math.round(18000 * multiplier);
        const totalExp = Math.round(32400 * multiplier);
        const netBal = totalRev - totalExp;

        // Update Section 1
        const elTot = document.getElementById('kpiTotalRevenue');
        const elBook = document.getElementById('kpiBookingsRevenue');
        const elProd = document.getElementById('kpiProductsRevenue');
        const elMemb = document.getElementById('kpiMembershipsRevenue');
        if (elTot) elTot.textContent = fmtINR(totalRev);
        if (elBook) elBook.textContent = fmtINR(bookRev);
        if (elProd) elProd.textContent = fmtINR(prodRev);
        if (elMemb) elMemb.textContent = fmtINR(membRev);

        // Update Section 2
        const elExp = document.getElementById('kpiTotalExpenses');
        const elNet = document.getElementById('kpiNetRevenue');
        if (elExp) elExp.textContent = fmtINR(totalExp);
        if (elNet) elNet.textContent = fmtINR(netBal);

        // Update Donut Centers
        const elDonutRev = document.getElementById('donutRevCenterVal');
        const elDonutExp = document.getElementById('donutExpCenterVal');
        if (elDonutRev) elDonutRev.textContent = fmtINR(totalRev);
        if (elDonutExp) elDonutExp.textContent = fmtINR(totalExp);

        // Update Section 9 (Sources Trend)
        const baseBookingsCount = 186;
        const baseProductsCount = 342;
        const baseMembershipsCount = 24;

        const elSourceBookings = document.getElementById('sourceBookingsVal');
        const elSourceProducts = document.getElementById('sourceProductsVal');
        const elSourceMemberships = document.getElementById('sourceMembershipsVal');

        if (elSourceBookings) elSourceBookings.textContent = Math.round(baseBookingsCount * multiplier);
        if (elSourceProducts) elSourceProducts.textContent = Math.round(baseProductsCount * multiplier);
        if (elSourceMemberships) elSourceMemberships.textContent = Math.round(baseMembershipsCount * multiplier);

        // Update comparison periods
        document.querySelectorAll('.ov-trend-period').forEach(el => {
            if (el.textContent.includes('Sep 15') || el.textContent.includes('previous period')) {
                el.textContent = dateSubtext;
            }
        });

        // Re-render Donuts
        renderRevenueDistributionDonut(bookRev, prodRev, membRev);
        renderExpenseBreakdownDonut({
            rent: Math.round(10000 * multiplier),
            salaries: Math.round(8000 * multiplier),
            utilities: Math.round(5000 * multiplier),
            supplies: Math.round(4000 * multiplier),
            other: Math.round(5400 * multiplier)
        });

        // Re-render Line Chart with scaled values
        const scaledRev = baselineRev.map(v => Math.round(v * multiplier));
        const scaledExp = baselineExp.map(v => Math.round(v * multiplier));
        renderRevExpTrendChart(baselineLabels, scaledRev, scaledExp);

        // Re-render Section 9 Source Trend Charts
        const scaledBookingsTrend = baselineBookingsTrend.map(v => Math.max(1, Math.round(v * multiplier)));
        const scaledProductsTrend = baselineProductsTrend.map(v => Math.max(1, Math.round(v * multiplier)));
        const scaledMembershipsTrend = baselineMembershipsTrend.map(v => Math.max(1, Math.round(v * multiplier)));
        renderSourceTrendCharts(sourceLabels, scaledBookingsTrend, scaledProductsTrend, scaledMembershipsTrend);
    };

    if (dateRange) dateRange.addEventListener('change', handleFilterChange);
    if (branchSelect) branchSelect.addEventListener('change', handleFilterChange);
}

// ── DOM Initialization ───────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initBranchSelector();
        loadOverviewPage();
    });
} else {
    initBranchSelector();
    loadOverviewPage();
}
