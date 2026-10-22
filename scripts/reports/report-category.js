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
        subtitle: 'Executive P&L, incoming revenue streams, payments, operating costs, discounts and refunds',
        icon: 'dollar-sign',
        colorClass: 'bg-blue',
        subReports: [
            {
                type: 'fin-overview',
                label: 'Financial Overview',
                desc: 'Executive P&L summary, gross revenue, net cash flow and operating margin',
                icon: 'bar-chart-2',
                colorClass: 'bg-emerald'
            },
            {
                type: 'fin-revenue',
                label: 'Revenue Streams',
                desc: 'Income breakdown from bookings, product sales and memberships',
                icon: 'trending-up',
                colorClass: 'bg-blue'
            },
            {
                type: 'fin-payments',
                label: 'Payments & Collections',
                desc: 'Reconcile cash in drawer, UPI, cards, and digital settlements',
                icon: 'credit-card',
                colorClass: 'bg-indigo'
            },
            {
                type: 'fin-expenses',
                label: 'Operating Expenses',
                desc: 'All salon expenditures, staff wages, supplies and utility bills',
                icon: 'shopping-cart',
                colorClass: 'bg-orange'
            },
            {
                type: 'fin-discounts',
                label: 'Discounts & Deductions',
                desc: 'Track margin erosion across coupon codes, offers and member perks',
                icon: 'tag',
                colorClass: 'bg-violet'
            },
            {
                type: 'fin-refunds',
                label: 'Refunds & Returns',
                desc: 'Audit booking cancellations, POS product returns and membership refunds',
                icon: 'rotate-ccw',
                colorClass: 'bg-rose'
            },
            {
                type: 'fin-pending-dues',
                label: 'Pending Dues & Receivables',
                desc: 'Track uncollected balances, customer aging dues and recovery',
                icon: 'clock',
                colorClass: 'bg-amber'
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
                label: 'Total Bookings',
                desc: 'All bookings across all statuses',
                icon: 'calendar',
                colorClass: 'bg-indigo'
            },
            {
                type: 'bk-completed',
                label: 'Completed Bookings & Revenue',
                desc: 'Realised revenue and service performance',
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
                label: 'Customer Overview',
                desc: 'Total base, membership, VIP and loyal repeat clientele',
                icon: 'users',
                colorClass: 'bg-violet'
            },
            {
                type: 'cust-insights',
                label: 'Customer 360° Insights',
                desc: 'Individual customer dossier, multi-channel spend & activity history',
                icon: 'user-check',
                colorClass: 'bg-purple'
            }
        ]
    },
    staff: {
        title: 'Staff Performance',
        subtitle: 'Staff headcount, capacity timeline, service volume, revenue generation and individual performance 360°',
        icon: 'user-check',
        colorClass: 'bg-amber',
        subReports: [
            {
                type: 'staff-overview',
                label: 'Staff Overview',
                desc: 'Staff headcount, capacity timeline, status distribution & team performance leaderboard',
                icon: 'users',
                colorClass: 'bg-amber'
            },
            {
                type: 'staff-insights',
                label: 'Staff 360° Insights',
                desc: 'Individual staff profile, service bookings, retail POS sales, membership sales & revenue contribution share',
                icon: 'award',
                colorClass: 'bg-indigo'
            }
        ]
    },
    products: {
        title: 'Product Sales',
        subtitle: 'Retail performance, product metrics, line items, discounts & payment reconciliation',
        icon: 'package',
        colorClass: 'bg-sky',
        subReports: [
            {
                type: 'prod-overview',
                label: 'Product Sales Overview',
                desc: 'Executive summary of sales, top products, trends & category split',
                icon: 'bar-chart-2',
                colorClass: 'bg-emerald'
            },
            {
                type: 'prod-wise',
                label: 'Product-wise Sales Report',
                desc: 'Detailed SKU-level performance, quantities sold, returned & net sales',
                icon: 'box',
                colorClass: 'bg-blue'
            },
            {
                type: 'prod-category',
                label: 'Sales by Category',
                desc: 'Compare category contributions, volume and revenue performance',
                icon: 'grid',
                colorClass: 'bg-purple'
            },
            {
                type: 'prod-transactions',
                label: 'Sales Transactions Report',
                desc: 'Searchable record of individual POS retail sales and line items',
                icon: 'file-text',
                colorClass: 'bg-indigo'
            },
            {
                type: 'prod-discounts',
                label: 'Discounts Report',
                desc: 'Analyze coupon codes, membership perks, and revenue impact',
                icon: 'tag',
                colorClass: 'bg-rose'
            },
            {
                type: 'prod-returns',
                label: 'Product Returns & Refunds Report',
                desc: 'Track return reasons, refunded amounts and inventory adjustments',
                icon: 'rotate-ccw',
                colorClass: 'bg-amber'
            },
            {
                type: 'prod-payments',
                label: 'Sales Payments Report',
                desc: 'Reconcile sales against cash, UPI, card and pending collections',
                icon: 'credit-card',
                colorClass: 'bg-cyan'
            }
        ]
    },
    memberships: {
        title: 'Memberships',
        subtitle: 'Subscriptions, plan sales, active members, renewals, usage & cancellations',
        icon: 'award',
        colorClass: 'bg-purple',
        subReports: [
            {
                type: 'mem-overview',
                label: 'Memberships Overview',
                desc: 'Executive summary of subscription revenue, active members base, and benefits ROI',
                icon: 'bar-chart-2',
                colorClass: 'bg-purple'
            },
            {
                type: 'mem-sales',
                label: 'Membership Sales & Revenue',
                desc: 'Plan sales ledger, collected payments, discounts and staff sales attribution',
                icon: 'dollar-sign',
                colorClass: 'bg-blue'
            },
            {
                type: 'mem-members',
                label: 'Active Members & Renewals',
                desc: 'Member directory, upcoming expiry alerts, call list and retention tracking',
                icon: 'users',
                colorClass: 'bg-emerald'
            },
            {
                type: 'mem-usage',
                label: 'Member Benefits & Usage',
                desc: 'Track member discounts redeemed on bookings, salon visits and service spend',
                icon: 'tag',
                colorClass: 'bg-violet'
            },
            {
                type: 'mem-cancellations',
                label: 'Cancellations & Refunds',
                desc: 'Cancelled subscriptions, refund payouts, churn rate and cancellation reasons',
                icon: 'rotate-ccw',
                colorClass: 'bg-rose'
            }
        ]
    },
    discounts: {
        title: 'Discount Usages',
        subtitle: 'Coupon redemptions, promotional offers, and membership discount analytics',
        icon: 'tag',
        colorClass: 'bg-rose',
        subReports: [
            {
                type: 'discount-usages',
                label: 'Discount Usages Report',
                desc: 'Comprehensive breakdown of coupon codes, special offers, and membership perks',
                icon: 'tag',
                colorClass: 'bg-rose'
            }
        ]
    }
};

CATEGORIES['product-sales']   = CATEGORIES.products;
CATEGORIES['membership']      = CATEGORIES.memberships;
CATEGORIES['discount-usages'] = CATEGORIES.discounts;

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
    const banner      = document.getElementById('categoryBanner');
    const bannerIcon  = document.getElementById('bannerIcon');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSub   = document.getElementById('bannerSubtitle');

    if (banner) {
        if (['bookings', 'products', 'product-sales', 'memberships', 'membership', 'discounts', 'discount-usages'].includes(cat)) {
            banner.classList.add('banner-plain');
        } else {
            banner.classList.remove('banner-plain');
        }
    }

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

    // Re-render all feather icons
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
