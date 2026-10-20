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
// Bookings Hub: Landing Page — live from get_bookings_report RPC
// ============================================================

function parseRowDate(row) {
    if (!row) return null;
    const raw = row.date || row.datetime || row.refund_date || '';
    if (!raw) return null;
    const cleanDateStr = String(raw).split(',')[0].trim();
    const parsed = new Date(cleanDateStr);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
}

function build7DayTrend(rows, unitLabel = 'bookings') {
    const days = [];
    const now = new Date();
    // 7 days ending today
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const y = d.getFullYear();
        const m = d.getMonth();
        const dt = d.getDate();
        const shortLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        days.push({ y, m, dt, shortLabel, count: 0 });
    }

    if (Array.isArray(rows)) {
        rows.forEach(r => {
            const rd = parseRowDate(r);
            if (!rd) return;
            const y = rd.getFullYear();
            const m = rd.getMonth();
            const dt = rd.getDate();
            const match = days.find(d => d.y === y && d.m === m && d.dt === dt);
            if (match) {
                match.count += 1;
            }
        });
    }

    const max = Math.max(...days.map(d => d.count), 1);

    return days.map((d, idx) => {
        const isToday = (idx === 6);
        const h = d.count > 0 ? Math.min(28, Math.round(6 + (d.count / max) * 22)) : 3;
        const opacity = d.count > 0 ? (isToday ? '1' : '0.82') : '0.22';
        const tooltip = `${d.shortLabel}: ${d.count} ${unitLabel}`;
        return `<span style="height: ${h}px; opacity: ${opacity};" title="${tooltip}"></span>`;
    }).join('');
}

async function renderBookingsLandingPage() {
    const hubView     = document.getElementById('bookingsHubView');
    const defaultView = document.getElementById('defaultCategoryView');
    if (!hubView) return;

    if (defaultView) defaultView.style.display = 'none';
    hubView.style.display = 'block';

    const now          = new Date();
    // 1. Render initial layout matching screenshot exactly
    hubView.innerHTML = `
        <!-- Page Title Header (Bold Heading) -->
        <div class="bk-page-header">
            <h1>Bookings Reports</h1>
            <p>Booking outcomes and their financial impact</p>
        </div>

        <!-- 5 Snapshot Stat Cards in One Big Card Container -->
        <div class="bk-snapshot-panel">
            <div class="bk-snapshot-grid">
                <!-- 1. Total Bookings -->
                <div class="bk-snapshot-card">
                    <div class="bk-snap-icon bg-indigo-circle">
                        <i data-feather="calendar"></i>
                    </div>
                    <div class="bk-snap-body">
                        <span class="bk-snap-label">Total Bookings</span>
                        <span class="bk-snap-val" id="bkSnapTotal">—</span>
                        <span class="bk-snap-sub">All booking statuses</span>
                    </div>
                    <div class="bk-mini-bars blue-bars" id="bkBarsTotal">
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                    </div>
                </div>

                <!-- 2. Completed Bookings -->
                <div class="bk-snapshot-card">
                    <div class="bk-snap-icon bg-green-circle">
                        <i data-feather="check-circle"></i>
                    </div>
                    <div class="bk-snap-body">
                        <span class="bk-snap-label">Completed Bookings</span>
                        <span class="bk-snap-val" id="bkSnapCompleted">—</span>
                        <span class="bk-snap-sub txt-green" id="bkSnapRevenue">Realised revenue:<br>—</span>
                    </div>
                    <div class="bk-mini-bars green-bars" id="bkBarsCompleted">
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                    </div>
                </div>

                <!-- 3. Cancelled Bookings -->
                <div class="bk-snapshot-card">
                    <div class="bk-snap-icon bg-red-circle">
                        <i data-feather="x-circle"></i>
                    </div>
                    <div class="bk-snap-body">
                        <span class="bk-snap-label">Cancelled Bookings</span>
                        <span class="bk-snap-val" id="bkSnapCancelled">—</span>
                        <span class="bk-snap-sub txt-red" id="bkSnapCancelVal">Estimated value:<br>—</span>
                    </div>
                    <div class="bk-mini-bars red-bars" id="bkBarsCancelled">
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                    </div>
                </div>

                <!-- 4. No-Shows -->
                <div class="bk-snapshot-card">
                    <div class="bk-snap-icon bg-amber-circle">
                        <i data-feather="user-x"></i>
                    </div>
                    <div class="bk-snap-body">
                        <span class="bk-snap-label">No-Shows</span>
                        <span class="bk-snap-val" id="bkSnapNoShows">—</span>
                        <span class="bk-snap-sub txt-amber" id="bkSnapNoShowVal">Estimated missed:<br>—</span>
                    </div>
                    <div class="bk-mini-bars amber-bars" id="bkBarsNoShows">
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                    </div>
                </div>

                <!-- 5. Refunded Bookings -->
                <div class="bk-snapshot-card">
                    <div class="bk-snap-icon bg-purple-circle">
                        <i data-feather="rotate-ccw"></i>
                    </div>
                    <div class="bk-snap-body">
                        <span class="bk-snap-label">Refunded Bookings</span>
                        <span class="bk-snap-val" id="bkSnapRefunded">—</span>
                        <span class="bk-snap-sub txt-purple" id="bkSnapRefundVal">Total refunded:<br>—</span>
                    </div>
                    <div class="bk-mini-bars purple-bars" id="bkBarsRefunded">
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                        <span style="height: 3px; opacity: 0.22;"></span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section Divider -->
        <div class="bk-section-divider"></div>

        <!-- Section 2: Explore Detailed Reports -->
        <div class="bk-section-header">
            <div>
                <h2>Explore Detailed Reports</h2>
                <p class="bk-section-subtitle">Get in-depth insights for each booking category</p>
            </div>
            <div class="bk-section-badge-wrap">
                <span class="bk-badge-purple">5 REPORTS</span>
                <span class="bk-info-text"><i data-feather="info"></i> Click any report to view detailed records</span>
            </div>
        </div>

        <!-- 5 Detailed Sub-Report Cards Grid -->
        <div class="bk-detailed-grid">
            <!-- 1. Total Appointments -->
            <a href="report-detail.html?type=bk-total&cat=bookings" class="bk-detailed-card" id="cardBkTotal">
                <div class="bk-card-top">
                    <div class="bk-card-icon bg-indigo-circle">
                        <i data-feather="calendar"></i>
                    </div>
                    <div class="bk-card-info">
                        <h3>Total Appointments</h3>
                        <p>All bookings, dates, services and statuses</p>
                    </div>
                    <i data-feather="chevron-right" class="bk-card-arrow"></i>
                </div>
                <div class="bk-card-bottom">
                    <div class="bk-metric-chip chip-blue">
                        <span class="bk-chip-val" id="bkCardTotalCount">—</span>
                        <span class="bk-chip-lbl">Total bookings</span>
                    </div>
                </div>
                <svg class="bk-card-wave" viewBox="0 0 160 70" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="waveBlue" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#818cf8" stop-opacity="0.25"/>
                            <stop offset="100%" stop-color="#c7d2fe" stop-opacity="0.04"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,52 Q40,50 80,34 T160,18 L160,70 L0,70 Z" fill="url(#waveBlue)"/>
                </svg>
            </a>

            <!-- 2. Completed Bookings -->
            <a href="report-detail.html?type=bk-completed&cat=bookings" class="bk-detailed-card" id="cardBkCompleted">
                <div class="bk-card-top">
                    <div class="bk-card-icon bg-green-circle">
                        <i data-feather="check-circle"></i>
                    </div>
                    <div class="bk-card-info">
                        <h3>Completed Bookings</h3>
                        <p>Realised revenue, service performance and trends</p>
                    </div>
                    <i data-feather="chevron-right" class="bk-card-arrow"></i>
                </div>
                <div class="bk-card-bottom">
                    <div class="bk-metric-chip chip-green">
                        <span class="bk-chip-val txt-green" id="bkCardCompletedCount">—</span>
                        <span class="bk-chip-lbl">Completed bookings</span>
                    </div>
                    <div class="bk-metric-chip chip-green">
                        <span class="bk-chip-val txt-green" id="bkCardCompletedRevenue">—</span>
                        <span class="bk-chip-lbl">Total revenue</span>
                    </div>
                </div>
                <svg class="bk-card-wave" viewBox="0 0 160 70" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="waveGreen" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#34d399" stop-opacity="0.25"/>
                            <stop offset="100%" stop-color="#a7f3d0" stop-opacity="0.04"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,52 Q40,50 80,34 T160,18 L160,70 L0,70 Z" fill="url(#waveGreen)"/>
                </svg>
            </a>

            <!-- 3. Cancelled Bookings -->
            <a href="report-detail.html?type=bk-cancelled&cat=bookings" class="bk-detailed-card" id="cardBkCancelled">
                <div class="bk-card-top">
                    <div class="bk-card-icon bg-red-circle">
                        <i data-feather="x-circle"></i>
                    </div>
                    <div class="bk-card-info">
                        <h3>Cancelled Bookings</h3>
                        <p>Cancellation count, reasons and estimated value affected</p>
                    </div>
                    <i data-feather="chevron-right" class="bk-card-arrow"></i>
                </div>
                <div class="bk-card-bottom">
                    <div class="bk-metric-chip chip-red">
                        <span class="bk-chip-val txt-red" id="bkCardCancelledCount">—</span>
                        <span class="bk-chip-lbl">Cancelled bookings</span>
                    </div>
                    <div class="bk-metric-chip chip-red">
                        <span class="bk-chip-val txt-red" id="bkCardCancelledValue">—</span>
                        <span class="bk-chip-lbl">Estimated value</span>
                    </div>
                </div>
                <svg class="bk-card-wave" viewBox="0 0 160 70" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="waveRed" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#f87171" stop-opacity="0.25"/>
                            <stop offset="100%" stop-color="#fecaca" stop-opacity="0.04"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,52 Q40,50 80,34 T160,18 L160,70 L0,70 Z" fill="url(#waveRed)"/>
                </svg>
            </a>

            <!-- 4. No-Show Bookings -->
            <a href="report-detail.html?type=bk-no-shows&cat=bookings" class="bk-detailed-card" id="cardBkNoShows">
                <div class="bk-card-top">
                    <div class="bk-card-icon bg-amber-circle">
                        <i data-feather="user-x"></i>
                    </div>
                    <div class="bk-card-info">
                        <h3>No-Show Bookings</h3>
                        <p>Missed appointments and estimated lost value</p>
                    </div>
                    <i data-feather="chevron-right" class="bk-card-arrow"></i>
                </div>
                <div class="bk-card-bottom">
                    <div class="bk-metric-chip chip-amber">
                        <span class="bk-chip-val txt-amber" id="bkCardNoShowCount">—</span>
                        <span class="bk-chip-lbl">No-show bookings</span>
                    </div>
                    <div class="bk-metric-chip chip-amber">
                        <span class="bk-chip-val txt-amber" id="bkCardNoShowValue">—</span>
                        <span class="bk-chip-lbl">Estimated missed</span>
                    </div>
                </div>
                <svg class="bk-card-wave" viewBox="0 0 160 70" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="waveAmber" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.25"/>
                            <stop offset="100%" stop-color="#fde68a" stop-opacity="0.04"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,52 Q40,50 80,34 T160,18 L160,70 L0,70 Z" fill="url(#waveAmber)"/>
                </svg>
            </a>

            <!-- 5. Refunded Bookings -->
            <a href="report-detail.html?type=bk-refunds&cat=bookings" class="bk-detailed-card" id="cardBkRefunds">
                <div class="bk-card-top">
                    <div class="bk-card-icon bg-purple-circle">
                        <i data-feather="rotate-ccw"></i>
                    </div>
                    <div class="bk-card-info">
                        <h3>Refunded Bookings</h3>
                        <p>Refund transactions, amounts and refund rates</p>
                    </div>
                    <i data-feather="chevron-right" class="bk-card-arrow"></i>
                </div>
                <div class="bk-card-bottom">
                    <div class="bk-metric-chip chip-purple">
                        <span class="bk-chip-val txt-purple" id="bkCardRefundCount">—</span>
                        <span class="bk-chip-lbl">Refunded bookings</span>
                    </div>
                    <div class="bk-metric-chip chip-purple">
                        <span class="bk-chip-val txt-purple" id="bkCardRefundValue">—</span>
                        <span class="bk-chip-lbl">Total refunded</span>
                    </div>
                </div>
                <svg class="bk-card-wave" viewBox="0 0 160 70" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="wavePurple" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#c084fc" stop-opacity="0.25"/>
                            <stop offset="100%" stop-color="#f3e8ff" stop-opacity="0.04"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,52 Q40,50 80,34 T160,18 L160,70 L0,70 Z" fill="url(#wavePurple)"/>
                </svg>
            </a>
        </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();

    // Fetch live data from master RPC
    try {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const sanitizeUuid = (val) => {
            if (!val || typeof val !== 'string') return null;
            const t = val.trim();
            if (['all', 'null', 'undefined', 'none', '', 'branch_1'].includes(t.toLowerCase())) return null;
            return UUID_REGEX.test(t) ? t : null;
        };

        const rawCompany = localStorage.getItem('company_id');
        const rawBranch  = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');

        let cid = sanitizeUuid(rawCompany);
        let bid = sanitizeUuid(rawBranch);

        // If rawBranch is a branch name like "Main Branch", resolve its UUID from branches table
        if (!bid && rawBranch && typeof rawBranch === 'string' && rawBranch !== 'all' && rawBranch !== 'branch_1') {
            try {
                const { data: bMatch } = await supabase
                    .from('branches')
                    .select('branch_id')
                    .ilike('branch_name', `%${rawBranch}%`)
                    .limit(1)
                    .maybeSingle();
                if (bMatch && bMatch.branch_id && UUID_REGEX.test(bMatch.branch_id)) {
                    bid = bMatch.branch_id;
                }
            } catch (bErr) {}
        }

        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const startDate = sixtyDaysAgo.toISOString().split('T')[0];
        const endDate   = today.toISOString().split('T')[0];

        let rawResult = null;
        const { data: callData, error: callError } = await supabase.rpc('get_bookings_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: startDate,
            p_end_date:   endDate
        });

        if (callError || !callData) {
            console.warn('[report-category] Initial RPC call failed, retrying with p_branch_id: null:', callError);
            const { data: fallbackData } = await supabase.rpc('get_bookings_report', {
                p_company_id: cid,
                p_branch_id:  null,
                p_start_date: startDate,
                p_end_date:   endDate
            });
            rawResult = fallbackData;
        } else {
            rawResult = callData;
        }

        if (!rawResult) throw (callError || new Error('Empty response'));

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

        const sc  = (result && result.stat_cards) ? result.stat_cards : {};
        const ref = (result && result.bk_refunds && result.bk_refunds.kpis) ? result.bk_refunds.kpis : {};

        const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
        const cur = (n) => '\u20b9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

        const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

        const refCount = (ref.refunded_bookings !== undefined && ref.refunded_bookings !== null) ? ref.refunded_bookings : (sc.refunded_bookings || 0);
        const refVal   = (ref.total_refunded !== undefined && ref.total_refunded !== null) ? ref.total_refunded : (sc.total_refunded_amount || 0);

        // Section 1: Snapshot Cards (Descriptions split onto 2 lines to never truncate)
        setEl('bkSnapTotal',       fmt(sc.total_bookings));
        setEl('bkSnapCompleted',   fmt(sc.completed_bookings));
        setHtml('bkSnapRevenue',   'Realised revenue:<br>' + cur(sc.realized_revenue));
        setEl('bkSnapCancelled',   fmt(sc.cancelled_bookings));
        setHtml('bkSnapCancelVal', 'Estimated value:<br>' + cur(sc.estimated_value_affected));
        setEl('bkSnapNoShows',     fmt(sc.no_show_bookings));
        setHtml('bkSnapNoShowVal', 'Estimated missed:<br>' + cur(sc.estimated_value_missed));
        setEl('bkSnapRefunded',    fmt(refCount));
        setHtml('bkSnapRefundVal', 'Total refunded:<br>' + cur(refVal));

        // Section 1.1: Dynamic 7-Day Trend Mini Charts
        const totalRows     = (result && result.bk_total     && result.bk_total.rows)     ? result.bk_total.rows     : [];
        const completedRows = (result && result.bk_completed && result.bk_completed.rows) ? result.bk_completed.rows : [];
        const cancelledRows = (result && result.bk_cancelled && result.bk_cancelled.rows) ? result.bk_cancelled.rows : [];
        const noShowRows    = (result && result.bk_no_shows  && result.bk_no_shows.rows)  ? result.bk_no_shows.rows  : [];
        const refundRows    = (result && result.bk_refunds   && result.bk_refunds.rows)   ? result.bk_refunds.rows   : [];

        const elTotalBars = document.getElementById('bkBarsTotal');
        if (elTotalBars) elTotalBars.innerHTML = build7DayTrend(totalRows, 'bookings');

        const elCompBars = document.getElementById('bkBarsCompleted');
        if (elCompBars) elCompBars.innerHTML = build7DayTrend(completedRows, 'completed');

        const elCancBars = document.getElementById('bkBarsCancelled');
        if (elCancBars) elCancBars.innerHTML = build7DayTrend(cancelledRows, 'cancelled');

        const elNoShowBars = document.getElementById('bkBarsNoShows');
        if (elNoShowBars) elNoShowBars.innerHTML = build7DayTrend(noShowRows, 'no-shows');

        const elRefBars = document.getElementById('bkBarsRefunded');
        if (elRefBars) elRefBars.innerHTML = build7DayTrend(refundRows, 'refunds');

        // Section 2: Detailed Cards
        setEl('bkCardTotalCount',        fmt(sc.total_bookings));
        setEl('bkCardCompletedCount',    fmt(sc.completed_bookings));
        setEl('bkCardCompletedRevenue',  cur(sc.realized_revenue));
        setEl('bkCardCancelledCount',    fmt(sc.cancelled_bookings));
        setEl('bkCardCancelledValue',    cur(sc.estimated_value_affected));
        setEl('bkCardNoShowCount',       fmt(sc.no_show_bookings));
        setEl('bkCardNoShowValue',       cur(sc.estimated_value_missed));
        setEl('bkCardRefundCount',       fmt(ref.refunded_bookings || sc.refunded_bookings));
        setEl('bkCardRefundValue',       cur(ref.total_refunded || sc.total_refunded_amount));

    } catch (err) {
        console.error('[report-category] Bookings landing page RPC error:', err);
    }
}


// ============================================================
// Render
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cat = (urlParams.get('cat') || 'financial').toLowerCase();

    // Bookings has its dedicated rich landing page view matching design
    if (cat === 'bookings') {
        document.title = 'Bookings Reports - BharathBots';
        renderBookingsLandingPage();

        // Update sidebar active state
        const reportLinks = document.querySelectorAll('.submenu-link');
        reportLinks.forEach(link => {
            if (link.getAttribute('href') === 'reports.html') {
                link.classList.add('active');
            }
        });

        // Listen for branch changes from global header
        window.addEventListener('branchChanged', () => renderBookingsLandingPage());
        document.addEventListener('change', (e) => {
            if (e.target && (e.target.id === 'branchSelect' || e.target.name === 'branchSelect')) {
                renderBookingsLandingPage();
            }
        });
        return;
    }

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

    // Render sub-report cards for other categories
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
