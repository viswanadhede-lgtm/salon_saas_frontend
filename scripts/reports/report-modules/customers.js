// scripts/reports/report-modules/customers.js
// 360-Degree Customer Intelligence Module
// Sub-Report 1: Customer Overview (Macro Salon-Wide Fleet View)
// Sub-Report 2: Customer 360° Insights (Single-Customer Dossier & Spend History)

import { formatCurrency, updateKPIs, updateTable } from './shared.js';

let trendChartInstance = null;
let distChartInstance = null;

// Helper: Safely destroy previous Chart.js instances
function destroyChart(instance) {
    if (instance && typeof instance.destroy === 'function') {
        try { instance.destroy(); } catch (e) { /* ignore */ }
    }
    return null;
}

// ============================================================================
// 1. SUB-REPORT 1: CUSTOMER OVERVIEW (Macro Salon-Wide View)
// ============================================================================

async function renderCustMetrics(data, supabase) {
    console.log('[customers.js] Initializing Sub-Report 1: Customer Overview');

    const companyId    = localStorage.getItem('company_id');
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // Remove any leftover Customer Insights container if user switched sub-reports
    const oldInsightsWrap = document.getElementById('custInsightsTopWrap');
    if (oldInsightsWrap) oldInsightsWrap.remove();

    // ── Demo / Fallback Data Store for Customer Overview ──────────────────
    const getOverviewData = () => {
        const clients = [
            { id: 'c1', name: 'Anita Sharma', phone: '+91 98765 43210', email: 'anita.s@gmail.com', joined: '12 Jan 2024', visits: 6, spent: 18450, spentBookings: 12200, spentProducts: 3750, spentMemberships: 2500, discounts: 1450, lastVisit: '18 Oct 2026 (3 days ago)', tag: 'VIP', isLoyal: true },
            { id: 'c2', name: 'Rajesh Patel', phone: '+91 98450 12345', email: 'rajesh.p@yahoo.com', joined: '04 Mar 2024', visits: 4, spent: 9200, spentBookings: 5600, spentProducts: 1600, spentMemberships: 2000, discounts: 600, lastVisit: '16 Oct 2026 (5 days ago)', tag: 'Member', isLoyal: true },
            { id: 'c3', name: 'Priya Sundaram', phone: '+91 97411 98765', email: 'priya.sun@outlook.com', joined: '22 Feb 2024', visits: 5, spent: 14200, spentBookings: 9800, spentProducts: 4400, spentMemberships: 0, discounts: 1100, lastVisit: '14 Oct 2026 (7 days ago)', tag: 'VIP', isLoyal: true },
            { id: 'c4', name: 'Vikram Malhotra', phone: '+91 96320 87654', email: 'vikram.m@gmail.com', joined: '19 May 2024', visits: 2, spent: 3400, spentBookings: 2600, spentProducts: 800, spentMemberships: 0, discounts: 250, lastVisit: '10 Oct 2026 (11 days ago)', tag: 'Regular', isLoyal: true },
            { id: 'c5', name: 'Sneha Reddy', phone: '+91 95123 45678', email: 'sneha.r@gmail.com', joined: '08 Jun 2024', visits: 3, spent: 6800, spentBookings: 3800, spentProducts: 1000, spentMemberships: 2000, discounts: 500, lastVisit: '08 Oct 2026 (13 days ago)', tag: 'Member', isLoyal: true },
            { id: 'c6', name: 'Arjun Das', phone: '+91 94231 65498', email: 'arjun.das@gmail.com', joined: '14 Jul 2024', visits: 1, spent: 1200, spentBookings: 1200, spentProducts: 0, spentMemberships: 0, discounts: 0, lastVisit: '25 Sep 2026 (26 days ago)', tag: 'Regular', isLoyal: false },
            { id: 'c7', name: 'Kavita Menon', phone: '+91 93120 78945', email: 'kavita.m@gmail.com', joined: '29 Aug 2024', visits: 3, spent: 7500, spentBookings: 5200, spentProducts: 2300, spentMemberships: 0, discounts: 800, lastVisit: '20 Sep 2026 (31 days ago)', tag: 'VIP', isLoyal: true },
            { id: 'c8', name: 'Rohan Mehra', phone: '+91 92014 36587', email: 'rohan.m@rediffmail.com', joined: '02 Sep 2024', visits: 1, spent: 950, spentBookings: 950, spentProducts: 0, spentMemberships: 0, discounts: 0, lastVisit: '15 Sep 2026 (36 days ago)', tag: 'Regular', isLoyal: false },
            { id: 'c9', name: 'Meera Nambiar', phone: '+91 91547 89632', email: 'meera.n@gmail.com', joined: '15 Sep 2024', visits: 2, spent: 4800, spentBookings: 2400, spentProducts: 900, spentMemberships: 1500, discounts: 350, lastVisit: '12 Sep 2026 (39 days ago)', tag: 'Member', isLoyal: true },
            { id: 'c10', name: 'Siddharth Rao', phone: '+91 90874 12563', email: 'sid.rao@gmail.com', joined: '01 Oct 2024', visits: 1, spent: 1500, spentBookings: 1500, spentProducts: 0, spentMemberships: 0, discounts: 100, lastVisit: '05 Sep 2026 (46 days ago)', tag: 'Regular', isLoyal: false }
        ];

        return {
            totalCustomers: 2450,
            membershipClients: 94,
            vipClients: 185,
            regularClients: 2171,
            loyalCustomers: 312,
            trendMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
            trendUniqueCustomers: [140, 165, 190, 210, 245, 280],
            trendTotalVisits:     [230, 290, 340, 395, 470, 560],
            donutData: [
                { label: 'Regular Clients', count: 2171, perc: 88, color: '#6366f1' },
                { label: 'VIP Clients',     count: 185,  perc: 8,  color: '#8b5cf6' },
                { label: 'Membership Plans', count: 94,   perc: 4,  color: '#f59e0b' }
            ],
            clients
        };
    };

    const loadCustomerOverview = async () => {
        const ov = getOverviewData();

        // 1. Render 4 Stat Cards
        updateKPIs(
            { label: 'Total Customers',            value: ov.totalCustomers.toLocaleString('en-IN'), sub: 'All registered profiles' },
            { label: 'Membership Clients',         value: ov.membershipClients.toLocaleString('en-IN'), sub: 'Active subscription plans' },
            { label: 'VIP Clients',                value: ov.vipClients.toLocaleString('en-IN'), subHtml: `<span style="color:#64748b;font-weight:600;font-size:0.75rem;">Regular: ${ov.regularClients.toLocaleString('en-IN')}</span>` },
            { label: 'Loyal Customers (2+ Visits)', value: ov.loyalCustomers.toLocaleString('en-IN'), sub: '2+ visits in selected period' }
        );

        // 2. Render Left Chart: Dual-Bar (Unique Customers vs. Total Visits)
        const trendCanvas = document.getElementById('trendChart');
        if (trendCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);
            trendChartInstance = new Chart(trendCanvas, {
                type: 'bar',
                data: {
                    labels: ov.trendMonths,
                    datasets: [
                        {
                            label: 'Unique Customers',
                            data: ov.trendUniqueCustomers,
                            backgroundColor: '#6366f1',
                            borderRadius: 6,
                            barPercentage: 0.65,
                            categoryPercentage: 0.75
                        },
                        {
                            label: 'Total Visits',
                            data: ov.trendTotalVisits,
                            backgroundColor: '#10b981',
                            borderRadius: 6,
                            barPercentage: 0.65,
                            categoryPercentage: 0.75
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 12, weight: '600', family: 'Inter' },
                                boxWidth: 12,
                                boxHeight: 12,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            padding: 12,
                            cornerRadius: 8
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' },
                            ticks: { color: '#64748b', font: { size: 11 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
                        }
                    }
                }
            });
        }

        // 3. Render Right Chart: Tier Composition Donut
        const distCanvas = document.getElementById('distributionChart');
        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = ov.totalCustomers.toLocaleString('en-IN');
            if (centerLbl) centerLbl.textContent = 'Total Clients';

            distChartInstance = new Chart(distCanvas, {
                type: 'doughnut',
                data: {
                    labels: ov.donutData.map(d => d.label),
                    datasets: [{
                        data: ov.donutData.map(d => d.count),
                        backgroundColor: ov.donutData.map(d => d.color),
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '74%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString('en-IN')} clients`
                            }
                        }
                    }
                }
            });

            // Update Donut Legend (3 Rows in same card)
            const legendEl = document.getElementById('donutLegend');
            if (legendEl) {
                legendEl.innerHTML = ov.donutData.map(d => `
                    <div class="donut-legend-item">
                        <span class="donut-legend-dot" style="background-color: ${d.color};"></span>
                        <div class="donut-legend-text">
                            <strong>${d.label}:</strong> ${d.count.toLocaleString('en-IN')} clients
                            <span style="color:#64748b; font-size:0.75rem; margin-left:4px;">(${d.perc}%)</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 4. Render Table with 4 Tabs above it
        renderOverviewTableWithTabs(ov.clients);
    };

    const renderOverviewTableWithTabs = (clientsList) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        // Inject 4-tab bar above table if not already present
        let tabBar = document.getElementById('custOverviewTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'custOverviewTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        const counts = {
            all: clientsList.length,
            loyal: clientsList.filter(c => c.isLoyal).length,
            vip: clientsList.filter(c => c.tag === 'VIP').length,
            member: clientsList.filter(c => c.tag === 'Member').length
        };

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="all">
                All Customers <span class="tab-badge">${counts.all}</span>
            </button>
            <button class="report-tab-btn" data-tab="loyal">
                Loyal (2+ Visits) <span class="tab-badge">${counts.loyal}</span>
            </button>
            <button class="report-tab-btn" data-tab="vip">
                VIP Clients <span class="tab-badge">${counts.vip}</span>
            </button>
            <button class="report-tab-btn" data-tab="member">
                Membership Clients <span class="tab-badge">${counts.member}</span>
            </button>
        `;

        let activeTab = 'all';
        let searchQuery = '';

        const headers = ['Customer', 'Joined Date', 'Total Visits', 'Total Spent', 'Bookings', 'Products', 'Membership', 'Discounts Saved', 'Last Visit', 'Tag', 'Action'];

        const filterAndRenderRows = () => {
            let filtered = clientsList;

            // Filter by active tab
            if (activeTab === 'loyal')  filtered = filtered.filter(c => c.isLoyal);
            if (activeTab === 'vip')    filtered = filtered.filter(c => c.tag === 'VIP');
            if (activeTab === 'member') filtered = filtered.filter(c => c.tag === 'Member');

            // Filter by search input
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter(c =>
                    c.name.toLowerCase().includes(q) ||
                    c.phone.toLowerCase().includes(q) ||
                    (c.email && c.email.toLowerCase().includes(q))
                );
            }

            // Update record count badge
            const countBadge = document.getElementById('tableRecordCountBadge');
            if (countBadge) countBadge.textContent = `${filtered.length} customers`;

            const rows = filtered.map(c => {
                const custCell = `<div><strong>${c.name}</strong><br><small style="color:#64748b;">${c.phone}</small></div>`;
                const visits = `<strong>${c.visits}</strong>`;
                const spent = `<strong style="color:#059669;">${formatCurrency(c.spent)}</strong>`;
                const bkSpent = `<span style="font-weight:600;color:#3b82f6;">${formatCurrency(c.spentBookings)}</span>`;
                const prodSpent = `<span style="font-weight:600;color:#f59e0b;">${formatCurrency(c.spentProducts)}</span>`;
                const memSpent = c.spentMemberships > 0
                    ? `<span style="font-weight:600;color:#eab308;">${formatCurrency(c.spentMemberships)}</span>`
                    : `<span style="color:#94a3b8;font-weight:400;">—</span>`;
                const discounts = c.discounts > 0 ? `<span style="color:#e11d48;font-weight:600;">-${formatCurrency(c.discounts)}</span>` : '<span style="color:#94a3b8;">—</span>';
                
                const tagStyle = c.tag === 'VIP' ? 'background:#f3e8ff;color:#6b21a8;' :
                                 c.tag === 'Member' ? 'background:#fef3c7;color:#92400e;' :
                                 'background:#e0e7ff;color:#3730a3;';
                const tagHtml = `<span class="status-pill" style="${tagStyle}">${c.tag}</span>`;

                const actionBtn = `
                    <a href="report-detail.html?type=cust-insights&customerId=${c.id}&cat=customers" class="btn-view-360">
                        View 360° <i data-feather="arrow-right"></i>
                    </a>
                `;

                return [custCell, c.joined, visits, spent, bkSpent, prodSpent, memSpent, discounts, c.lastVisit, tagHtml, actionBtn];
            });

            updateTable(headers, rows);
            if (window.feather) feather.replace();
        };

        // Wire tab click listeners
        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tabBar.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeTab = btn.getAttribute('data-tab');
                filterAndRenderRows();
            });
        });

        // Wire search input
        const searchInput = document.getElementById('tableSearchInput');
        if (searchInput) {
            searchInput.placeholder = 'Search customer by name, phone, or email...';
            searchInput.oninput = (e) => {
                searchQuery = e.target.value.trim();
                filterAndRenderRows();
            };
        }

        filterAndRenderRows();
    };

    loadCustomerOverview();
    if (btnApply) btnApply.onclick = loadCustomerOverview;
}

// ============================================================================
// 2. SUB-REPORT 2: CUSTOMER 360° INSIGHTS (Deep-Dive Individual Profile)
// ============================================================================

async function renderCustInsights(data, supabase) {
    console.log('[customers.js] Initializing Sub-Report 2: Customer 360° Insights');

    // ── Repository of 360° Customer Profiles ───────────────────────────────
    const CUSTOMER_STORE = [
        {
            id: 'c1',
            name: 'Anita Sharma',
            phone: '+91 98765 43210',
            email: 'anita.s@gmail.com',
            dob: '15 Aug 1992',
            joined: '12 Jan 2024',
            tag: 'VIP',
            spentTotal: 18450,
            spentBookings: 12200,
            spentProducts: 3750,
            spentMemberships: 2500,
            discountsUsedCount: 5,
            discountsTotalSaved: 1450,
            monthlyMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
            monthlyBookings:    [1800, 2400, 1600, 2200, 2000, 2200],
            monthlyProducts:    [850,  600,  0,    1100, 450,  750],
            monthlyMemberships: [0,    0,    2500, 0,    0,    0],
            bookings: [
                ['18 Oct 2026, 11:30 AM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Hair Spa & Styling</span>', 'Sarah M.', '₹2,200', '<span style="color:#e11d48;font-weight:600;">-₹200 (VIP10)</span>', '<strong>₹2,000</strong>', '<span class="status-pill completed">Paid (UPI)</span>', '<span class="status-pill active">Completed</span>'],
                ['28 Sep 2026, 04:00 PM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Bridal Facial Glow</span>', 'Priya K.', '₹3,500', '<span style="color:#e11d48;font-weight:600;">-₹350 (GoldPass)</span>', '<strong>₹3,150</strong>', '<span class="status-pill completed">Paid (Card)</span>', '<span class="status-pill active">Completed</span>'],
                ['15 Aug 2026, 02:30 PM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Hair Coloring & Highlights</span>', 'Sarah M.', '₹4,500', '<span style="color:#e11d48;font-weight:600;">-₹450 (SUMMER20)</span>', '<strong>₹4,050</strong>', '<span class="status-pill completed">Paid (UPI)</span>', '<span class="status-pill active">Completed</span>'],
                ['02 Jul 2026, 10:00 AM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Pedicure Deluxe</span>', 'Anjali R.', '₹1,200', '—', '<strong>₹1,200</strong>', '<span class="status-pill completed">Paid (Cash)</span>', '<span class="status-pill active">Completed</span>'],
                ['14 May 2026, 05:00 PM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Haircut & Blowdry</span>', 'Michael B.', '₹1,800', '—', '<strong>₹1,800</strong>', '<span class="status-pill completed">Paid (UPI)</span>', '<span class="status-pill active">Completed</span>']
            ],
            products: [
                ['18 Oct 2026', 'Moroccanoil Treatment 100ml', 'Hair Care', '1', '₹1,500', '<span style="color:#e11d48;font-weight:600;">-₹150 (Offer)</span>', '<strong>₹1,350</strong>', 'UPI', 'Sarah M.'],
                ['15 Aug 2026', 'L\'Oreal Color Protect Shampoo', 'Hair Care', '2', '₹1,600', '<span style="color:#e11d48;font-weight:600;">-₹150 (Combo)</span>', '<strong>₹1,450</strong>', 'Card', 'Cashier Desk'],
                ['14 May 2026', 'OPI Nail Lacquer Red', 'Nail Care', '1', '₹950', '—', '<strong>₹950</strong>', 'Cash', 'Michael B.']
            ],
            memberships: [
                ['Gold Annual Privilege Pass', '02 Jul 2026', '12 Months', '01 Jul 2027', '₹2,500', '<span style="color:#e11d48;font-weight:600;">-₹150 (WELCOME)</span>', '<strong>₹2,350</strong>', 'UPI', '<span class="status-pill active">Active</span>']
            ],
            discounts: [
                ['18 Oct 2026', 'VIP10 (10% Off Services)', 'VIP Tag Perk', 'Booking: Hair Spa', '<strong style="color:#e11d48;">-₹200</strong>', '<span class="status-pill completed">Applied</span>'],
                ['18 Oct 2026', 'Retail Special 10%', 'Offer', 'POS: Moroccanoil', '<strong style="color:#e11d48;">-₹150</strong>', '<span class="status-pill completed">Applied</span>'],
                ['28 Sep 2026', 'GoldPass Benefit (10%)', 'Membership', 'Booking: Bridal Facial', '<strong style="color:#e11d48;">-₹350</strong>', '<span class="status-pill completed">Applied</span>'],
                ['15 Aug 2026', 'SUMMER20 Promo', 'Coupon', 'Booking: Hair Coloring', '<strong style="color:#e11d48;">-₹450</strong>', '<span class="status-pill completed">Applied</span>'],
                ['15 Aug 2026', 'Combo Care Discount', 'Offer', 'POS: Shampoo', '<strong style="color:#e11d48;">-₹150</strong>', '<span class="status-pill completed">Applied</span>']
            ]
        },
        {
            id: 'c2',
            name: 'Rajesh Patel',
            phone: '+91 98450 12345',
            email: 'rajesh.p@yahoo.com',
            dob: '24 Nov 1988',
            joined: '04 Mar 2024',
            tag: 'Member',
            spentTotal: 9200,
            spentBookings: 5600,
            spentProducts: 1600,
            spentMemberships: 2000,
            discountsUsedCount: 3,
            discountsTotalSaved: 600,
            monthlyMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
            monthlyBookings:    [1200, 0,    1400, 1000, 0,    2000],
            monthlyProducts:    [0,    800,  0,    0,    800,  0],
            monthlyMemberships: [2000, 0,    0,    0,    0,    0],
            bookings: [
                ['16 Oct 2026, 05:00 PM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Men\'s Haircut & Beard Grooming</span>', 'Vikram S.', '₹1,200', '<span style="color:#e11d48;font-weight:600;">-₹200 (MEMBERSHIP)</span>', '<strong>₹1,000</strong>', '<span class="status-pill completed">Paid (UPI)</span>', '<span class="status-pill active">Completed</span>'],
                ['10 Aug 2026, 06:30 PM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Classic Facial</span>', 'Vikram S.', '₹1,600', '<span style="color:#e11d48;font-weight:600;">-₹200 (MEMBERSHIP)</span>', '<strong>₹1,400</strong>', '<span class="status-pill completed">Paid (Card)</span>', '<span class="status-pill active">Completed</span>'],
                ['12 Jul 2026, 11:00 AM', '<span class="status-pill active" style="background:#e0e7ff;color:#3730a3;">Beard Styling & Spa</span>', 'Michael B.', '₹1,400', '—', '<strong>₹1,400</strong>', '<span class="status-pill completed">Paid (Cash)</span>', '<span class="status-pill active">Completed</span>']
            ],
            products: [
                ['20 Sep 2026', 'Beard Serum Organic', 'Beard Care', '1', '₹800', '—', '<strong>₹800</strong>', 'UPI', 'Vikram S.'],
                ['15 Jun 2026', 'Charcoal Face Wash', 'Skin Care', '1', '₹800', '—', '<strong>₹800</strong>', 'Card', 'Desk']
            ],
            memberships: [
                ['Silver Grooming Plan', '04 Mar 2026', '6 Months', '03 Sep 2026', '₹2,000', '<span style="color:#e11d48;font-weight:600;">-₹200 (PROMO)</span>', '<strong>₹1,800</strong>', 'UPI', '<span class="status-pill cancelled">Expired</span>']
            ],
            discounts: [
                ['16 Oct 2026', 'Silver Pass 15%', 'Membership', 'Booking: Haircut', '<strong style="color:#e11d48;">-₹200</strong>', '<span class="status-pill completed">Applied</span>'],
                ['10 Aug 2026', 'Silver Pass 15%', 'Membership', 'Booking: Facial', '<strong style="color:#e11d48;">-₹200</strong>', '<span class="status-pill completed">Applied</span>'],
                ['04 Mar 2026', 'PROMO Welcome', 'Coupon', 'Membership: Silver Pass', '<strong style="color:#e11d48;">-₹200</strong>', '<span class="status-pill completed">Applied</span>']
            ]
        }
    ];

    // Determine which customer to load (read from URL query string if present)
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('customerId') || 'c1';
    let currentCustomer = CUSTOMER_STORE.find(c => c.id === targetId) || CUSTOMER_STORE[0];

    // ── Inject Top Search & Profile Dossier ────────────────────────────────
    let topWrap = document.getElementById('custInsightsTopWrap');
    if (!topWrap) {
        topWrap = document.createElement('div');
        topWrap.id = 'custInsightsTopWrap';
        topWrap.className = 'cust-insights-top-wrap';

        const mainContent = document.querySelector('.main-content-area') || document.querySelector('.report-container') || document.getElementById('kpiRow')?.parentElement;
        const kpiRow = document.getElementById('kpiRow');
        if (kpiRow && kpiRow.parentElement) {
            kpiRow.parentElement.insertBefore(topWrap, kpiRow);
        }
    }

    const renderTopSearchAndDossier = () => {
        topWrap.innerHTML = `
            <!-- Progressive CRM Search Bar -->
            <div class="cust-search-bar-wrap">
                <div class="cust-search-input-box">
                    <i data-feather="search"></i>
                    <input type="text" id="custProfileSearchInput" placeholder="Search customer CRM by name, phone (+91), or email to load 360° profile..." autocomplete="off">
                </div>
                <div class="cust-search-dropdown" id="custSearchDropdown"></div>
            </div>

            <!-- Customer 360 Dossier Header Card -->
            <div class="cust-profile-dossier">
                <div class="cust-dossier-left">
                    <div class="cust-dossier-avatar">${currentCustomer.name.charAt(0)}</div>
                    <div>
                        <h3 class="cust-dossier-name">${currentCustomer.name}</h3>
                        <div class="cust-dossier-meta">
                            <span><i data-feather="phone" style="width:12px;height:12px;"></i> ${currentCustomer.phone}</span>
                            <span><i data-feather="mail" style="width:12px;height:12px;"></i> ${currentCustomer.email}</span>
                            <span><i data-feather="calendar" style="width:12px;height:12px;"></i> DOB: ${currentCustomer.dob}</span>
                            <span><i data-feather="clock" style="width:12px;height:12px;"></i> Member Since: ${currentCustomer.joined}</span>
                        </div>
                    </div>
                </div>
                <div class="cust-dossier-right">
                    <span class="status-pill" style="${currentCustomer.tag === 'VIP' ? 'background:#f3e8ff;color:#6b21a8;' : 'background:#fef3c7;color:#92400e;'} font-size:0.8rem; padding:4px 14px;">
                        ${currentCustomer.tag} Client
                    </span>
                    <span class="badge-discounts-used">
                        <i data-feather="tag"></i> ${currentCustomer.discountsUsedCount} Discounts Claimed • Saved ${formatCurrency(currentCustomer.discountsTotalSaved)}
                    </span>
                </div>
            </div>
        `;

        if (window.feather) feather.replace();

        // Wire progressive search auto-complete
        const searchInput = document.getElementById('custProfileSearchInput');
        const dropdown = document.getElementById('custSearchDropdown');

        if (searchInput && dropdown) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) {
                    dropdown.style.display = 'none';
                    return;
                }

                const matches = CUSTOMER_STORE.filter(c =>
                    c.name.toLowerCase().includes(q) ||
                    c.phone.toLowerCase().includes(q) ||
                    c.email.toLowerCase().includes(q)
                );

                if (matches.length === 0) {
                    dropdown.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:0.85rem;">No customer matches found.</div>`;
                    dropdown.style.display = 'block';
                    return;
                }

                dropdown.innerHTML = matches.map(c => `
                    <div class="cust-search-item" data-id="${c.id}">
                        <div class="cust-search-left">
                            <div class="cust-avatar-circle">${c.name.charAt(0)}</div>
                            <div class="cust-info-text">
                                <strong>${c.name}</strong>
                                <span>${c.phone} • ${c.email}</span>
                            </div>
                        </div>
                        <div class="cust-search-right">
                            <div class="cust-search-spend">${formatCurrency(c.spentTotal)}</div>
                            <span class="status-pill" style="font-size:0.68rem;padding:2px 8px;">${c.tag}</span>
                        </div>
                    </div>
                `).join('');

                dropdown.style.display = 'block';

                dropdown.querySelectorAll('.cust-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const selId = item.getAttribute('data-id');
                        const found = CUSTOMER_STORE.find(c => c.id === selId);
                        if (found) {
                            currentCustomer = found;
                            // Update URL query string without reloading
                            const newUrl = new URL(window.location.href);
                            newUrl.searchParams.set('customerId', selId);
                            window.history.pushState({}, '', newUrl);

                            dropdown.style.display = 'none';
                            searchInput.value = '';
                            renderCompleteInsights();
                        }
                    });
                });
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (ev) => {
                if (!topWrap.contains(ev.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }
    };

    const renderCompleteInsights = () => {
        renderTopSearchAndDossier();

        // 1. Render 4 Spending KPI Cards
        updateKPIs(
            { label: 'Total Spent',           value: formatCurrency(currentCustomer.spentTotal),       sub: 'Lifetime spend across all streams' },
            { label: 'Spent on Bookings',     value: formatCurrency(currentCustomer.spentBookings),    sub: 'Service appointments' },
            { label: 'Spent on Products',     value: formatCurrency(currentCustomer.spentProducts),    sub: 'Retail POS purchases' },
            { label: 'Spent on Memberships',  value: formatCurrency(currentCustomer.spentMemberships), sub: 'Plan fees paid' }
        );

        // 2. Render Left Chart: Clustered 3-Bar Spend over Time
        const trendCanvas = document.getElementById('trendChart');
        if (trendCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);
            trendChartInstance = new Chart(trendCanvas, {
                type: 'bar',
                data: {
                    labels: currentCustomer.monthlyMonths,
                    datasets: [
                        {
                            label: 'Bookings',
                            data: currentCustomer.monthlyBookings,
                            backgroundColor: '#3b82f6',
                            borderRadius: 6,
                            barPercentage: 0.7,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Product Sales',
                            data: currentCustomer.monthlyProducts,
                            backgroundColor: '#f59e0b',
                            borderRadius: 6,
                            barPercentage: 0.7,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Memberships',
                            data: currentCustomer.monthlyMemberships,
                            backgroundColor: '#eab308',
                            borderRadius: 6,
                            barPercentage: 0.7,
                            categoryPercentage: 0.8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 12, weight: '600', family: 'Inter' },
                                boxWidth: 12,
                                boxHeight: 12,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#64748b',
                                callback: (v) => formatCurrency(v)
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
                        }
                    }
                }
            });
        }

        // 3. Render Right Chart: Wallet-Share Donut
        const distCanvas = document.getElementById('distributionChart');
        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = formatCurrency(currentCustomer.spentTotal);
            if (centerLbl) centerLbl.textContent = 'Total Spent';

            const walletData = [
                { label: 'Bookings',    val: currentCustomer.spentBookings,    color: '#3b82f6' },
                { label: 'Products',    val: currentCustomer.spentProducts,    color: '#f59e0b' },
                { label: 'Memberships', val: currentCustomer.spentMemberships, color: '#eab308' }
            ];

            const total = currentCustomer.spentTotal || 1;

            distChartInstance = new Chart(distCanvas, {
                type: 'doughnut',
                data: {
                    labels: walletData.map(d => d.label),
                    datasets: [{
                        data: walletData.map(d => d.val),
                        backgroundColor: walletData.map(d => d.color),
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '74%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${Math.round((ctx.raw / total) * 100)}%)`
                            }
                        }
                    }
                }
            });

            // Update Donut Legend (3 Rows in same card)
            const legendEl = document.getElementById('donutLegend');
            if (legendEl) {
                legendEl.innerHTML = walletData.map(d => `
                    <div class="donut-legend-item">
                        <span class="donut-legend-dot" style="background-color: ${d.color};"></span>
                        <div class="donut-legend-text">
                            <strong>${d.label}:</strong> ${formatCurrency(d.val)}
                            <span style="color:#64748b; font-size:0.75rem; margin-left:4px;">(${Math.round((d.val / total) * 100)}%)</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 4. Render Table with 4 Tabs (Bookings, POS, Memberships, Discounts)
        renderInsightsActivityTabs();
    };

    const renderInsightsActivityTabs = () => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        let tabBar = document.getElementById('custInsightsTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'custInsightsTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="bookings">
                Bookings <span class="tab-badge">${currentCustomer.bookings.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="products">
                Retail POS <span class="tab-badge">${currentCustomer.products.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="memberships">
                Memberships <span class="tab-badge">${currentCustomer.memberships.length}</span>
            </button>
        `;

        let activeTab = 'bookings';
        let searchQuery = '';

        const tabConfigs = {
            bookings: {
                title: `${currentCustomer.name}'s Booking History`,
                headers: ['Date & Time', 'Service(s)', 'Staff', 'Gross Total', 'Discount', 'Final Paid', 'Payment', 'Status'],
                getRows: () => currentCustomer.bookings
            },
            products: {
                title: `${currentCustomer.name}'s Retail POS Purchases`,
                headers: ['Sale Date', 'Products', 'Categories', 'Qty', 'Gross Total', 'Discount', 'Final Amount', 'Payment Mode', 'Billed By'],
                getRows: () => currentCustomer.products
            },
            memberships: {
                title: `${currentCustomer.name}'s Membership Plans`,
                headers: ['Plan Name', 'Purchase Date', 'Duration', 'Expiry Date', 'Plan Price', 'Discount', 'Final Paid', 'Payment Mode', 'Status'],
                getRows: () => currentCustomer.memberships
            }
        };

        const switchTabAndRender = () => {
            const config = tabConfigs[activeTab];
            const titleEl = document.getElementById('tableTitleText');
            if (titleEl) titleEl.textContent = config.title;

            let rows = config.getRows();

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                rows = rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q)));
            }

            const countBadge = document.getElementById('tableRecordCountBadge');
            if (countBadge) countBadge.textContent = `${rows.length} records`;

            updateTable(config.headers, rows);
            if (window.feather) feather.replace();
        };

        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tabBar.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeTab = btn.getAttribute('data-tab');
                switchTabAndRender();
            });
        });

        const searchInput = document.getElementById('tableSearchInput');
        if (searchInput) {
            searchInput.placeholder = 'Search within selected ledger tab...';
            searchInput.oninput = (e) => {
                searchQuery = e.target.value.trim();
                switchTabAndRender();
            };
        }

        switchTabAndRender();
    };

    renderCompleteInsights();
}

// ── Shared Module Dispatcher ────────────────────────────────────────────────
const handlers = {
    'cust-metrics': renderCustMetrics,
    'cust-insights': renderCustInsights,
    'customers': renderCustMetrics
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
