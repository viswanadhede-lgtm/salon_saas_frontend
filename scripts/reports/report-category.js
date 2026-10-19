// scripts/reports/report-category.js
// Dynamically renders sub-report cards based on ?cat= URL parameter

import { supabase } from '../../lib/supabase.js';

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
                type: 'bk-total',
                label: 'Total Appointments',
                desc: 'All appointments across all statuses',
                icon: 'calendar',
                colorClass: 'bg-indigo'
            },
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
// Bookings Hub: Stat Cards — live from get_bookings_report RPC
// ============================================================

async function renderBookingsCategoryStats() {
    const container = document.getElementById('categoryStatCards');
    if (!container) return;

    container.style.display = 'grid';

    // Render skeleton immediately
    container.innerHTML = `
        <div class="bk-hub-stat">
            <div class="bk-hub-stat-icon bk-hub-indigo"><i data-feather="calendar"></i></div>
            <div class="bk-hub-stat-body">
                <span class="bk-hub-stat-val" id="bkHubTotal">—</span>
                <span class="bk-hub-stat-label">Total Bookings</span>
                <span class="bk-hub-stat-desc">All relevant statuses</span>
            </div>
        </div>
        <div class="bk-hub-stat">
            <div class="bk-hub-stat-icon bk-hub-green"><i data-feather="check-circle"></i></div>
            <div class="bk-hub-stat-body">
                <span class="bk-hub-stat-val" id="bkHubCompleted">—</span>
                <span class="bk-hub-stat-label">Completed Bookings</span>
                <span class="bk-hub-stat-desc bk-hub-green-txt" id="bkHubRevenue">Realised revenue: —</span>
            </div>
        </div>
        <div class="bk-hub-stat">
            <div class="bk-hub-stat-icon bk-hub-red"><i data-feather="x-circle"></i></div>
            <div class="bk-hub-stat-body">
                <span class="bk-hub-stat-val" id="bkHubCancelled">—</span>
                <span class="bk-hub-stat-label">Cancelled Bookings</span>
                <span class="bk-hub-stat-desc bk-hub-red-txt" id="bkHubCancelVal">Estimated value: —</span>
            </div>
        </div>
        <div class="bk-hub-stat">
            <div class="bk-hub-stat-icon bk-hub-amber"><i data-feather="user-x"></i></div>
            <div class="bk-hub-stat-body">
                <span class="bk-hub-stat-val" id="bkHubNoShows">—</span>
                <span class="bk-hub-stat-label">No-Shows</span>
                <span class="bk-hub-stat-desc bk-hub-red-txt" id="bkHubNoShowVal">Estimated missed: —</span>
            </div>
        </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();

    // Fetch live data
    try {
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');
        const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
        const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;
        const now       = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endDate   = now.toISOString().split('T')[0];

        const { data: rawResult, error } = await supabase.rpc('get_bookings_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: startDate,
            p_end_date:   endDate
        });

        if (error || !rawResult) throw (error || new Error('Empty response'));

        let result = rawResult;
        if (typeof result === 'string') {
            try { result = JSON.parse(result); } catch (e) {}
        }
        if (Array.isArray(result)) {
            result = result[0] || {};
        }
        if (result && typeof result === 'object') {
            if (result.bookings_report) {
                result = result.bookings_report;
            } else if (result.get_bookings_report) {
                result = result.get_bookings_report;
            }
        }
        if (typeof result === 'string') {
            try { result = JSON.parse(result); } catch (e) {}
        }

        const sc = (result && result.stat_cards) ? result.stat_cards : {};

        const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
        const cur = (n) => '\u20b9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        setEl('bkHubTotal',     fmt(sc.total_bookings));
        setEl('bkHubCompleted', fmt(sc.completed_bookings));
        setEl('bkHubRevenue',   'Realised revenue: ' + cur(sc.realized_revenue));
        setEl('bkHubCancelled', fmt(sc.cancelled_bookings));
        setEl('bkHubCancelVal', 'Estimated value: ' + cur(sc.estimated_value_affected));
        setEl('bkHubNoShows',   fmt(sc.no_show_bookings));
        setEl('bkHubNoShowVal', 'Estimated missed: ' + cur(sc.estimated_value_missed));

    } catch (err) {
        console.error('[report-category] Bookings stat cards RPC failed:', err);
        // Stat cards stay as — (non-breaking graceful degradation)
    }
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
        renderBookingsCategoryStats(); // async — updates DOM when RPC returns
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
