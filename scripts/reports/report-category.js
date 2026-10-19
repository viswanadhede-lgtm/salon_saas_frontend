// scripts/reports/report-category.js
// Dynamically renders sub-report cards based on ?cat= URL parameter

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase-config.js';

// ============================================================
// Category Configuration
// Each category has: title, subtitle, icon, color, and an
// array of sub-reports (each with type, label, desc, icon, color)
// The 'type' maps directly to ?type= on report-detail.html
// ============================================================

const CATEGORIES = {
    financial: {
        title: 'Financial',
        subtitle: 'Detailed breakdown of your business finances',
        icon: 'dollar-sign',
        colorClass: 'bg-blue',
        subReports: [
            {
                type: 'fin-revenue',
                label: 'Revenue',
                desc: 'Total income from all sources over time',
                icon: 'trending-up',
                colorClass: 'bg-blue'
            },
            {
                type: 'fin-payments',
                label: 'Payments',
                desc: 'Breakdown by payment method and channel',
                icon: 'credit-card',
                colorClass: 'bg-indigo'
            },
            {
                type: 'fin-refunds',
                label: 'Refunds',
                desc: 'Refunded transactions and reasons',
                icon: 'rotate-ccw',
                colorClass: 'bg-rose'
            },
            {
                type: 'fin-pending-dues',
                label: 'Pending Dues',
                desc: 'Unpaid balances and outstanding dues',
                icon: 'clock',
                colorClass: 'bg-amber'
            },
            {
                type: 'fin-discounts',
                label: 'Discounts',
                desc: 'Total discounts given and their impact',
                icon: 'tag',
                colorClass: 'bg-violet'
            },
            {
                type: 'fin-expenses',
                label: 'Expenses',
                desc: 'All business expenditures by category',
                icon: 'shopping-cart',
                colorClass: 'bg-orange'
            }
        ]
    },
    sales: {
        title: 'Sales & Services',
        subtitle: 'Performance metrics across all sales channels',
        icon: 'shopping-bag',
        colorClass: 'bg-emerald',
        subReports: [
            {
                type: 'sales-total',
                label: 'Total Sales',
                desc: 'Combined POS and service sales overview',
                icon: 'bar-chart-2',
                colorClass: 'bg-emerald'
            },
            {
                type: 'sales-service-revenue',
                label: 'Service Revenue',
                desc: 'Revenue generated from service bookings',
                icon: 'scissors',
                colorClass: 'bg-teal'
            },
            {
                type: 'sales-product-sales',
                label: 'Product Sales',
                desc: 'Retail product units sold and revenue',
                icon: 'package',
                colorClass: 'bg-amber'
            },
            {
                type: 'sales-top-services',
                label: 'Top Services',
                desc: 'Highest performing services by bookings',
                icon: 'award',
                colorClass: 'bg-violet'
            },
            {
                type: 'sales-top-products',
                label: 'Top Products',
                desc: 'Best-selling retail products by units',
                icon: 'box',
                colorClass: 'bg-sky'
            },
            {
                type: 'sales-membership-revenue',
                label: 'Membership Revenue',
                desc: 'Revenue generated from membership plans',
                icon: 'award',
                colorClass: 'bg-purple'
            }
        ]
    },
    bookings: {
        title: 'Bookings',
        subtitle: 'Booking outcomes and their financial impact',
        icon: 'calendar',
        colorClass: 'bg-indigo',
        subReports: [
            {
                type: 'bk-completed',
                label: 'Completed Bookings & Revenue',
                desc: 'Realized revenue and service performance',
                icon: 'check-circle',
                colorClass: 'bg-emerald'
            },
            {
                type: 'bk-cancelled',
                label: 'Cancelled Bookings',
                desc: 'Cancellation count, reasons, and value loss',
                icon: 'x-circle',
                colorClass: 'bg-rose'
            },
            {
                type: 'bk-no-shows',
                label: 'No-Show Bookings',
                desc: 'Missed appointments and estimated value missed',
                icon: 'user-x',
                colorClass: 'bg-amber'
            },
            {
                type: 'bk-refunds',
                label: 'Refunded Bookings',
                desc: 'Refund count, amounts, and refund rate',
                icon: 'rotate-ccw',
                colorClass: 'bg-purple'
            }
        ]
    },
    customers: {
        title: 'Customers',
        subtitle: 'Customer acquisition, retention and behaviour',
        icon: 'users',
        colorClass: 'bg-violet',
        subReports: [
            {
                type: 'cust-metrics',
                label: 'Customers Overview',
                desc: 'Total, new, active and inactive customers',
                icon: 'users',
                colorClass: 'bg-violet'
            },
            {
                type: 'cust-insights',
                label: 'Customer Insights',
                desc: 'Deep-dive into customer behaviour and spend',
                icon: 'bar-chart-2',
                colorClass: 'bg-purple'
            }
        ]
    },
    operations: {
        title: 'Operations',
        subtitle: 'Staff and branch performance metrics',
        icon: 'activity',
        colorClass: 'bg-rose',
        subReports: [
            {
                type: 'ops-staff',
                label: 'Staff Performance',
                desc: 'Revenue, bookings and ratings by staff',
                icon: 'user-check',
                colorClass: 'bg-rose'
            },
            {
                type: 'ops-branch',
                label: 'Branch Performance',
                desc: 'Multi-location comparison and trends',
                icon: 'map-pin',
                colorClass: 'bg-cyan'
            }
        ]
    }
};

// ============================================================
// Bookings Hub: Live Stat Cards (bookings category only)
// ============================================================

async function renderBookingsCategoryStats() {
    const container = document.getElementById('categoryStatCards');
    if (!container) return;

    const companyId = localStorage.getItem('company_id');
    if (!companyId) return;

    // Show skeleton
    container.style.display = 'grid';
    container.innerHTML = `
        <div class="bk-hub-stat skeleton"><div class="bk-hub-stat-icon"></div><div class="bk-hub-stat-body"><span class="bk-hub-stat-val">...</span><span class="bk-hub-stat-label">Loading</span></div></div>
        <div class="bk-hub-stat skeleton"><div class="bk-hub-stat-icon"></div><div class="bk-hub-stat-body"><span class="bk-hub-stat-val">...</span><span class="bk-hub-stat-label">Loading</span></div></div>
        <div class="bk-hub-stat skeleton"><div class="bk-hub-stat-icon"></div><div class="bk-hub-stat-body"><span class="bk-hub-stat-val">...</span><span class="bk-hub-stat-label">Loading</span></div></div>
        <div class="bk-hub-stat skeleton"><div class="bk-hub-stat-icon"></div><div class="bk-hub-stat-body"><span class="bk-hub-stat-val">...</span><span class="bk-hub-stat-label">Loading</span></div></div>
    `;

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Single RPC: get hub summary counts
        const { data, error } = await supabase.rpc('get_bookings_hub_summary', {
            p_company_id: companyId
        });

        let total = 0, completed = 0, cancelled = 0, noShows = 0;
        let completedRevenue = '—', cancelledValue = '—', noShowValue = '—';

        if (!error && data) {
            const row = Array.isArray(data) ? data[0] : data;
            if (row) {
                total     = Number(row.total_bookings   || 0);
                completed = Number(row.completed        || 0);
                cancelled = Number(row.cancelled        || 0);
                noShows   = Number(row.no_shows         || 0);
                if (row.completed_revenue != null)
                    completedRevenue = '₹' + Number(row.completed_revenue).toLocaleString('en-IN');
                if (row.cancelled_value != null)
                    cancelledValue = '₹' + Number(row.cancelled_value).toLocaleString('en-IN');
                if (row.no_show_value != null)
                    noShowValue = '₹' + Number(row.no_show_value).toLocaleString('en-IN');
            }
        }

        const fmt = n => Number(n).toLocaleString('en-IN');

        container.innerHTML = `
            <div class="bk-hub-stat">
                <div class="bk-hub-stat-icon bk-hub-indigo">
                    <i data-feather="calendar"></i>
                </div>
                <div class="bk-hub-stat-body">
                    <span class="bk-hub-stat-val">${fmt(total)}</span>
                    <span class="bk-hub-stat-label">Total Bookings</span>
                    <span class="bk-hub-stat-desc">All statuses combined</span>
                </div>
            </div>
            <div class="bk-hub-stat">
                <div class="bk-hub-stat-icon bk-hub-green">
                    <i data-feather="check-circle"></i>
                </div>
                <div class="bk-hub-stat-body">
                    <span class="bk-hub-stat-val">${fmt(completed)}</span>
                    <span class="bk-hub-stat-label">Completed Bookings</span>
                    <span class="bk-hub-stat-desc bk-hub-green-txt">Realised revenue: ${completedRevenue}</span>
                </div>
            </div>
            <div class="bk-hub-stat">
                <div class="bk-hub-stat-icon bk-hub-red">
                    <i data-feather="x-circle"></i>
                </div>
                <div class="bk-hub-stat-body">
                    <span class="bk-hub-stat-val">${fmt(cancelled)}</span>
                    <span class="bk-hub-stat-label">Cancelled Bookings</span>
                    <span class="bk-hub-stat-desc bk-hub-red-txt">Estimated value: ${cancelledValue}</span>
                </div>
            </div>
            <div class="bk-hub-stat">
                <div class="bk-hub-stat-icon bk-hub-amber">
                    <i data-feather="user-x"></i>
                </div>
                <div class="bk-hub-stat-body">
                    <span class="bk-hub-stat-val">${fmt(noShows)}</span>
                    <span class="bk-hub-stat-label">No-Shows</span>
                    <span class="bk-hub-stat-desc bk-hub-red-txt">Estimated missed: ${noShowValue}</span>
                </div>
            </div>
        `;
    } catch (err) {
        console.warn('Bookings hub stat cards failed:', err);
        container.style.display = 'none';
    }

    if (typeof feather !== 'undefined') feather.replace();
}

// ============================================================
// Render
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cat = (urlParams.get('cat') || 'financial').toLowerCase();

    const config = CATEGORIES[cat] || CATEGORIES['financial'];

    // Update page <title>
    document.title = `${config.title} Reports - BharathBots`;

    // Update banner
    const bannerIcon  = document.getElementById('bannerIcon');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSub   = document.getElementById('bannerSubtitle');

    if (bannerIcon)  bannerIcon.className  = `category-banner-icon ${config.colorClass}`;
    if (bannerTitle) bannerTitle.textContent = `${config.title} Reports`;
    if (bannerSub)   bannerSub.textContent  = config.subtitle;

    // Re-render the feather icon inside the banner
    if (bannerIcon) {
        bannerIcon.innerHTML = `<i data-feather="${config.icon}"></i>`;
    }

    // Bookings-only: inject live stat cards above the sub-reports grid
    if (cat === 'bookings') {
        renderBookingsCategoryStats();
    }

    // Render sub-report cards
    const grid = document.getElementById('subReportsGrid');
    if (!grid) return;

    // Add section heading for bookings
    if (cat === 'bookings') {
        const heading = document.createElement('p');
        heading.className = 'sub-reports-section-label';
        heading.textContent = 'Booking Reports';
        grid.parentNode.insertBefore(heading, grid);
    }

    grid.innerHTML = config.subReports.map(sr => `
        <a href="report-detail.html?type=${sr.type}&cat=${cat}" class="sub-report-card" id="sr-${sr.type}">
            <div class="sub-report-icon-wrap ${sr.colorClass}">
                <i data-feather="${sr.icon}"></i>
            </div>
            <div class="sub-report-details">
                <h3>${sr.label}</h3>
                <p>${sr.desc}</p>
            </div>
            <i data-feather="chevron-right" class="arrow"></i>
        </a>
    `).join('');

    // Re-render all feather icons (including newly injected ones)
    if (typeof feather !== 'undefined') {
        feather.replace();
    }

    // Update sidebar active state
    const reportLinks = document.querySelectorAll('.submenu-link');
    reportLinks.forEach(link => {
        if (link.getAttribute('href') === 'reports.html') {
            link.classList.add('active');
        }
    });
});
