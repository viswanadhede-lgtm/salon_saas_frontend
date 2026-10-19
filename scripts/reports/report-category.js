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
        subtitle: 'Booking outcomes and their financial impact.',
        icon: 'calendar',
        colorClass: 'bg-indigo',
        sectionTitle: 'Booking Reports',
        statCards: [
            {
                label: 'Total bookings',
                value: '—',
                desc: 'All relevant statuses',
                icon: 'calendar',
                iconColor: '#3b82f6',
                descClass: ''
            },
            {
                label: 'Completed',
                value: '—',
                desc: 'Realized service revenue',
                icon: 'calendar',
                iconColor: '#10b981',
                descClass: 'text-green'
            },
            {
                label: 'Cancelled',
                value: '—',
                desc: 'Estimated value affected',
                icon: 'calendar',
                iconColor: '#ef4444',
                descClass: 'text-red'
            },
            {
                label: 'No-shows',
                value: '—',
                desc: 'Estimated value missed',
                icon: 'user-x',
                iconColor: '#f59e0b',
                descClass: 'text-red'
            }
        ],
        subReports: [
            {
                type: 'bk-completed',
                label: 'Completed Bookings & Revenue',
                desc: 'Completed appointments, realized revenue, and service performance.',
                icon: 'calendar',
                iconColor: '#10b981'
            },
            {
                type: 'bk-cancelled',
                label: 'Cancelled Bookings',
                desc: 'Cancellation count, reasons, and estimated revenue loss.',
                icon: 'calendar',
                iconColor: '#ef4444'
            },
            {
                type: 'bk-no-shows',
                label: 'No-Show Bookings',
                desc: 'Missed appointments, repeat no-shows, and estimated loss.',
                icon: 'user-x',
                iconColor: '#f59e0b'
            },
            {
                type: 'bk-refunded',
                label: 'Refunded Bookings',
                desc: 'Refunded appointments, amounts, and refund status.',
                icon: 'briefcase',
                iconColor: '#8b5cf6'
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
// Render
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cat = (urlParams.get('cat') || 'financial').toLowerCase();

    const config = CATEGORIES[cat] || CATEGORIES['financial'];

    // Update page <title>
    document.title = `${config.title} Reports - BharathBots`;

    // Update banner text
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSub   = document.getElementById('bannerSubtitle');

    if (bannerTitle) bannerTitle.textContent = `${config.title} Reports`;
    if (bannerSub)   bannerSub.textContent  = config.subtitle;

    // Render category-level Stat Cards if configured (e.g. Screenshot 1)
    const statCardsRow = document.getElementById('categoryStatCardsRow');
    const mockupNote = document.getElementById('mockupNote');
    if (statCardsRow && config.statCards && config.statCards.length > 0) {
        statCardsRow.style.display = 'grid';
        statCardsRow.innerHTML = config.statCards.map(sc => `
            <div class="category-stat-card">
                <div class="cat-stat-top">
                    <i data-feather="${sc.icon}" style="color: ${sc.iconColor || '#3b82f6'};"></i>
                    <span>${sc.label}</span>
                </div>
                <div class="cat-stat-value">${sc.value}</div>
                <div class="cat-stat-desc ${sc.descClass || ''}">${sc.desc}</div>
            </div>
        `).join('');
        if (mockupNote) mockupNote.style.display = 'block';
    } else {
        if (statCardsRow) statCardsRow.style.display = 'none';
        if (mockupNote) mockupNote.style.display = 'none';
    }

    // Update Section Title
    const sectionTitleEl = document.getElementById('subReportsSectionTitle');
    if (sectionTitleEl) {
        sectionTitleEl.textContent = config.sectionTitle || 'Reports';
        sectionTitleEl.style.display = 'block';
    }

    // Render sub-report cards (modern 2x2 grid style)
    const grid = document.getElementById('subReportsGrid');
    if (grid) {
        grid.innerHTML = config.subReports.map(sr => `
            <a href="report-detail.html?type=${sr.type}&cat=${cat}" class="sub-report-card-modern" id="sr-${sr.type}">
                <div>
                    <i data-feather="${sr.icon}" class="top-icon" style="color: ${sr.iconColor || '#6366f1'};"></i>
                </div>
                <h3>${sr.label}</h3>
                <p>${sr.desc}</p>
                <div class="card-footer-link">
                    <span>View report</span>
                    <i data-feather="arrow-right"></i>
                </div>
            </a>
        `).join('');
    }

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
