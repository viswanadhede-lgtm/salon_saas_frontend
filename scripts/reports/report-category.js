// scripts/reports/report-category.js
// Dynamically renders sub-report cards based on ?cat= URL parameter

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
        subtitle: 'Appointment analytics and scheduling insights',
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
                label: 'Completed',
                desc: 'Successfully completed appointments',
                icon: 'check-circle',
                colorClass: 'bg-emerald'
            },
            {
                type: 'bk-cancelled',
                label: 'Cancelled',
                desc: 'Cancellations by reason and time period',
                icon: 'x-circle',
                colorClass: 'bg-rose'
            },
            {
                type: 'bk-no-shows',
                label: 'No-Shows',
                desc: 'Customers who missed their appointments',
                icon: 'user-x',
                colorClass: 'bg-amber'
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
                type: 'cust-new',
                label: 'New Customers',
                desc: 'First-time customers and acquisition trends',
                icon: 'user-plus',
                colorClass: 'bg-violet'
            },
            {
                type: 'cust-returning',
                label: 'Returning Customers',
                desc: 'Repeat visits and loyalty patterns',
                icon: 'repeat',
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

    // Render sub-report cards
    const grid = document.getElementById('subReportsGrid');
    if (!grid) return;

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
