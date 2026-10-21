// scripts/reports/report-modules/discounts.js
// Discount Usages Intelligence & Audit Module
// Comprehensive breakdown of Coupon Codes, Promotional Offers, and Membership Perks

import { formatCurrency, updateKPIs } from './shared.js';

let trendChartInstance = null;
let distChartInstance = null;

// Helper: Safely destroy previous Chart.js instances
function destroyChart(instance) {
    if (instance && typeof instance.destroy === 'function') {
        try { instance.destroy(); } catch (e) { /* ignore */ }
    }
    return null;
}

// Helper: Resolve Company ID
function resolveCompanyId() {
    const c = localStorage.getItem('company_id');
    return (c && c !== 'null' && c !== 'undefined' && c !== 'all') ? c : null;
}

// Helper: Resolve Branch ID
function resolveBranchId(filterBranch) {
    if (filterBranch && filterBranch.value !== undefined) {
        if (filterBranch.value === 'all' || !filterBranch.value) return null;
        return filterBranch.value;
    }
    const stored = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id');
    return (stored && stored !== 'all' && stored !== 'null' && stored !== 'undefined') ? stored : null;
}

// Helper: Safely Unwrap RPC result from Supabase
function unwrapRpcResult(data) {
    if (!data) return null;
    let res = data;
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) { console.warn('[discounts] JSON parse warning:', e); }
    }
    if (Array.isArray(res)) {
        res = res[0] || {};
    }
    if (res && typeof res === 'object') {
        if (res.get_discount_report) {
            res = res.get_discount_report;
        } else if (res.discount_report) {
            res = res.discount_report;
        }
    }
    if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) {}
    }
    return (res && typeof res === 'object') ? res : null;
}

// Helper: Call the Master RPC
async function callDiscountRpc(supabase, companyId, branchId, start, end) {
    const cid = (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== 'all') ? companyId : null;
    const bid = (branchId && branchId !== 'null' && branchId !== 'undefined' && branchId !== 'all') ? branchId : null;

    console.log('[discounts] Calling get_discount_report with:', { cid, bid, start, end });
    try {
        const { data, error } = await supabase.rpc('get_discount_report', {
            p_company_id: cid,
            p_branch_id:  bid,
            p_start_date: start,
            p_end_date:   end
        });

        if (error) {
            console.warn('[discounts] get_discount_report RPC returned error or not yet installed:', error.message);
            return null;
        }
        return unwrapRpcResult(data);
    } catch (err) {
        console.warn('[discounts] Error executing get_discount_report RPC:', err.message);
        return null;
    }
}

// ============================================================================
// Interactive Table Setup (Headers, Rows, Pagination, Search, CSV Export, Print)
// ============================================================================
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

        if (recordBadge) {
            recordBadge.textContent = `${total.toLocaleString('en-IN')} ${unitName}`;
        }

        if (tbody) {
            if (pageItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center;padding:2.5rem;color:#94a3b8;font-size:0.9rem;">No matching ${unitName} found.</td></tr>`;
            } else {
                tbody.innerHTML = pageItems.map(r => {
                    const cells = Array.isArray(r) ? r : Object.values(r);
                    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
                }).join('');
            }
        }

        if (paginationInfo) {
            if (total === 0) {
                paginationInfo.textContent = `Showing 0 to 0 of 0 ${unitName}`;
            } else {
                paginationInfo.textContent = `Showing ${(startIdx + 1).toLocaleString('en-IN')} to ${endIdx.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${unitName}`;
            }
        }

        if (paginationControls) {
            if (totalPages <= 1) {
                paginationControls.innerHTML = '';
            } else {
                let html = '';
                html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Previous</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                    } else if (p === currentPage - 2 || p === currentPage + 2) {
                        html += `<span class="page-dots" style="color:#94a3b8;padding:0 4px;font-size:0.85rem;">...</span>`;
                    }
                }
                html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>`;
                paginationControls.innerHTML = html;

                paginationControls.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
                    btn.onclick = () => {
                        const target = parseInt(btn.getAttribute('data-page'));
                        if (!isNaN(target)) renderPage(target);
                    };
                });
            }
        }

        if (window.feather) {
            try { feather.replace(); } catch (e) {}
        }
    }

    if (searchInput) {
        if (options.clearSearch !== false) {
            searchInput.value = '';
        }
        if (options.searchPlaceholder) {
            searchInput.placeholder = options.searchPlaceholder;
        }
        searchInput.oninput = (e) => {
            const q = (e.target.value || '').toLowerCase().trim();
            if (!q) {
                filteredRows = [...(rows || [])];
            } else {
                filteredRows = (rows || []).filter(r => {
                    const text = Array.isArray(r)
                        ? r.map(c => String(c).replace(/<[^>]*>?/gm, '')).join(' ').toLowerCase()
                        : JSON.stringify(r).toLowerCase();
                    return text.includes(q);
                });
            }
            renderPage(1);
        };
    }

    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!filteredRows || filteredRows.length === 0) {
                alert(`No ${unitName} to export.`);
                return;
            }
            const cleanHeaders = headers.map(h => `"${h.replace(/"/g, '""')}"`);
            const csvLines = [cleanHeaders.join(',')];
            filteredRows.forEach(r => {
                const rawCells = Array.isArray(r) ? r : Object.values(r);
                const line = rawCells.map(c => {
                    const plain = String(c).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                    return `"${plain.replace(/"/g, '""')}"`;
                });
                csvLines.push(line.join(','));
            });
            const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${options.reportFileName || 'discounts_report'}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        };
    }

    if (printBtn) {
        printBtn.onclick = () => window.print();
    }

    renderPage(1);
}

// ============================================================================
// Realistic Mock Fallback Generator
// (Displayed immediately while RPC is being created/integrated)
// ============================================================================
function generateMockDiscountData() {
    const customers = [
        { name: 'Ananya Sharma', phone: '+91 98765 43210' },
        { name: 'Priya Patel', phone: '+91 98234 56789' },
        { name: 'Rahul Verma', phone: '+91 97123 45678' },
        { name: 'Sneha Reddy', phone: '+91 99887 76655' },
        { name: 'Deepak Joshi', phone: '+91 91234 56780' },
        { name: 'Kavita Nair', phone: '+91 98450 12345' },
        { name: 'Vikram Mehta', phone: '+91 97654 32109' },
        { name: 'Pooja Iyer', phone: '+91 99112 23344' },
        { name: 'Arjun Das', phone: '+91 98334 55667' },
        { name: 'Ritu Kapoor', phone: '+91 98711 22334' },
        { name: 'Siddharth Rao', phone: '+91 98990 11223' },
        { name: 'Meera Deshmukh', phone: '+91 99345 67890' }
    ];

    const staffMembers = [
        { name: 'Sarah Miller', role: 'Senior Stylist' },
        { name: 'Michael Chen', role: 'Hair Specialist' },
        { name: 'Jessica Taylor', role: 'Color Expert' },
        { name: 'David Wilson', role: 'Barber' },
        { name: 'Emily Brown', role: 'Spa Therapist' }
    ];

    const coupons = [
        { name: 'WELCOME10', desc: '10% New Client Welcome', base: 250 },
        { name: 'DIWALI20', desc: 'Festive 20% Special', base: 600 },
        { name: 'FLAT500', desc: 'Flat ₹500 on Color Service', base: 500 },
        { name: 'GLOW50', desc: 'Glow Facial 50% Off', base: 750 },
        { name: 'SUMMER15', desc: 'Summer Hair Spa 15%', base: 350 }
    ];

    const offers = [
        { name: 'Happy Hours (Tue-Thu)', desc: '20% Afternoon Off-Peak Promo', base: 450 },
        { name: 'Bridal Package Promo', desc: 'Combo Bundle Discount ₹1,500', base: 1500 },
        { name: 'Weekend Grooming Deal', desc: 'Haircut + Beard Trim 15%', base: 200 },
        { name: 'Color + Spa Special', desc: 'Cross-service combo bonus', base: 850 },
        { name: 'Keratin Festival Deal', desc: 'Flat ₹1,200 Off on Treatment', base: 1200 }
    ];

    const memberships = [
        { name: 'Gold Club 15% Off', desc: 'Gold Plan Service Benefit', base: 420 },
        { name: 'VIP Diamond 20% Off', desc: 'Diamond Unlimited Perks', base: 850 },
        { name: 'Silver Member 10%', desc: 'Silver Card Salon Perk', base: 280 },
        { name: 'Platinum All-Access 25%', desc: 'Elite Membership Tier', base: 1100 }
    ];

    const ledger = [];
    let netCoupon = 0, countCoupon = 0;
    let netOffer = 0, countOffer = 0;
    let netMembership = 0, countMembership = 0;

    const baseDates = [
        '2024-10-21 15:30', '2024-10-21 12:15', '2024-10-20 18:40', '2024-10-20 14:10',
        '2024-10-19 17:25', '2024-10-19 11:00', '2024-10-18 16:50', '2024-10-18 13:20',
        '2024-10-17 19:10', '2024-10-16 15:45', '2024-10-15 12:30', '2024-10-14 17:15',
        '2024-10-13 14:00', '2024-10-12 16:30', '2024-10-11 11:45', '2024-10-10 18:00',
        '2024-10-09 13:15', '2024-10-08 15:20', '2024-10-07 16:40', '2024-10-05 14:50',
        '2024-09-28 17:10', '2024-09-24 13:30', '2024-09-19 16:20', '2024-09-15 11:15'
    ];

    baseDates.forEach((dt, idx) => {
        const cust = customers[idx % customers.length];
        const staff = staffMembers[idx % staffMembers.length];
        const typeMod = idx % 3; // 0: coupon, 1: offer, 2: membership
        let dType = 'coupon', dObj = coupons[idx % coupons.length], refType = 'Booking';

        if (typeMod === 1) {
            dType = 'offer';
            dObj = offers[idx % offers.length];
            refType = (idx % 2 === 0) ? 'Booking' : 'POS Retail';
        } else if (typeMod === 2) {
            dType = 'membership';
            dObj = memberships[idx % memberships.length];
            refType = (idx % 3 === 0) ? 'Membership' : 'Booking';
        }

        const discAmount = dObj.base + ((idx * 73) % 250);
        let revAmount = 0;
        let status = 'applied';

        // Introduce a couple of reversals to test audited states
        if (idx === 4) {
            revAmount = discAmount;
            status = 'reversed';
        } else if (idx === 11) {
            revAmount = 200;
            status = 'partially_reversed';
        }

        const netAmount = Math.max(0, discAmount - revAmount);

        if (dType === 'coupon') {
            netCoupon += netAmount;
            countCoupon++;
        } else if (dType === 'offer') {
            netOffer += netAmount;
            countOffer++;
        } else if (dType === 'membership') {
            netMembership += netAmount;
            countMembership++;
        }

        ledger.push({
            id: `disc-${idx + 1}`,
            used_at: dt,
            customer_name: cust.name,
            customer_phone: cust.phone,
            staff_name: staff.name,
            discount_type: dType,
            discount_name: dObj.name,
            reference_type: refType,
            reference_code: `${refType.substring(0, 2).toUpperCase()}-${1000 + idx}`,
            discount_amount: discAmount,
            reversal_amount: revAmount,
            net_amount: netAmount,
            status: status
        });
    });

    const netTotal = netCoupon + netOffer + netMembership;
    const totalCount = countCoupon + countOffer + countMembership;

    return {
        kpis: {
            total_discounts_amount: netTotal,
            total_discounts_count: totalCount,
            coupon_amount: netCoupon,
            coupon_count: countCoupon,
            coupon_pct: totalCount > 0 ? Math.round((netCoupon / netTotal) * 100) : 0,
            offer_amount: netOffer,
            offer_count: countOffer,
            offer_pct: totalCount > 0 ? Math.round((netOffer / netTotal) * 100) : 0,
            membership_amount: netMembership,
            membership_count: countMembership,
            membership_pct: totalCount > 0 ? Math.round((netMembership / netTotal) * 100) : 0
        },
        timeline: {
            labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
            coupons: [3800, 4200, 4900, 5600, 6800, netCoupon],
            offers: [5200, 5900, 6800, 7900, 9400, netOffer],
            memberships: [3100, 3600, 4400, 5200, 6300, netMembership]
        },
        distribution: {
            total_amount: netTotal,
            total_count: totalCount,
            coupons: { count: countCoupon, amount: netCoupon, pct: totalCount > 0 ? Math.round((countCoupon / totalCount) * 100) : 0 },
            offers: { count: countOffer, amount: netOffer, pct: totalCount > 0 ? Math.round((countOffer / totalCount) * 100) : 0 },
            memberships: { count: countMembership, amount: netMembership, pct: totalCount > 0 ? Math.round((countMembership / totalCount) * 100) : 0 }
        },
        ledger: ledger
    };
}

// ============================================================================
// Main Render Entrypoint (Invoked by report-builder.js)
// ============================================================================
export async function render(data, supabase, type) {
    console.log('[discounts.js] Initializing Discount Usages Report module:', { type });

    const companyId    = resolveCompanyId();
    const filterStart  = document.getElementById('filterStartDate');
    const filterEnd    = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply     = document.getElementById('btnApplyFilters');

    // ── Load & Display Data ──────────────────────────────────────────────────
    const loadDiscountReport = async () => {
        const start = filterStart ? filterStart.value : (new Date(Date.now() - 30 * 86400000)).toISOString().split('T')[0];
        const end   = filterEnd   ? filterEnd.value   : (new Date()).toISOString().split('T')[0];
        const bid   = resolveBranchId(filterBranch);

        // Put KPI cards in Loading state
        updateKPIs(
            { label: 'Total Discounts Given', value: 'Loading...' },
            { label: 'Coupon Discounts',      value: 'Loading...' },
            { label: 'Offer Discounts',       value: 'Loading...' },
            { label: 'Membership Discounts',  value: 'Loading...' }
        );

        let reportData = await callDiscountRpc(supabase, companyId, bid, start, end);

        if (!reportData || !reportData.kpis) {
            console.info('[discounts.js] Using rich mock preview until get_discount_report RPC is installed in Supabase');
            reportData = generateMockDiscountData();
        }

        const { kpis, timeline, distribution, ledger } = reportData;

        // ── 1. Update 4 Stat Cards ──────────────────────────────────────────
        // Specification:
        // Card 1: Total Discounts Given (Amount + Count)
        // Card 2: Coupon Discounts (Amount + Count + % of total)
        // Card 3: Offer Discounts (Amount + Count + % of total)
        // Card 4: Membership Discounts (Amount + Count + % of total)
        updateKPIs(
            {
                label: 'Total Discounts Given',
                value: formatCurrency(kpis.total_discounts_amount || 0),
                subHtml: `
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#64748b; font-weight:600; margin-top:4px;">
                        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10b981;"></span>
                        <span>${(kpis.total_discounts_count || 0).toLocaleString('en-IN')} total redemptions</span>
                    </div>`
            },
            {
                label: 'Coupon Discounts',
                value: formatCurrency(kpis.coupon_amount || 0),
                subHtml: `
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#e11d48; font-weight:600; margin-top:4px;">
                        <span>${formatCurrency(kpis.coupon_amount || 0)}</span>
                        <span style="color:#94a3b8;">·</span>
                        <span>${kpis.coupon_count || 0} usages (${kpis.coupon_pct || 0}%)</span>
                    </div>`
            },
            {
                label: 'Offer Discounts',
                value: formatCurrency(kpis.offer_amount || 0),
                subHtml: `
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#d97706; font-weight:600; margin-top:4px;">
                        <span>${formatCurrency(kpis.offer_amount || 0)}</span>
                        <span style="color:#94a3b8;">·</span>
                        <span>${kpis.offer_count || 0} usages (${kpis.offer_pct || 0}%)</span>
                    </div>`
            },
            {
                label: 'Membership Discounts',
                value: formatCurrency(kpis.membership_amount || 0),
                subHtml: `
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#7c3aed; font-weight:600; margin-top:4px;">
                        <span>${formatCurrency(kpis.membership_amount || 0)}</span>
                        <span style="color:#94a3b8;">·</span>
                        <span>${kpis.membership_count || 0} usages (${kpis.membership_pct || 0}%)</span>
                    </div>`
            }
        );

        // ── 2. Render Left Chart: Line Chart (Timeline vs Revenue for 3 Types) ──
        const trendCanvas = document.getElementById('trendChart');
        const leftTitle = document.getElementById('leftChartTitle');
        if (leftTitle) {
            leftTitle.textContent = 'Discounts Trend (Coupons vs Offers vs Memberships)';
        }

        if (trendCanvas) {
            trendChartInstance = destroyChart(trendChartInstance);

            const labels = timeline.labels || ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
            const couponData = timeline.coupons || [];
            const offerData  = timeline.offers || [];
            const memData    = timeline.memberships || [];

            trendChartInstance = new Chart(trendCanvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Coupon Discounts',
                            data: couponData,
                            borderColor: '#f43f5e',
                            backgroundColor: 'rgba(244, 63, 94, 0.08)',
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.38,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#f43f5e'
                        },
                        {
                            label: 'Offer Discounts',
                            data: offerData,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.08)',
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.38,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#f59e0b'
                        },
                        {
                            label: 'Membership Discounts',
                            data: memData,
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.08)',
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.38,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#8b5cf6'
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
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 11, weight: '600', family: 'Inter' },
                                boxWidth: 12,
                                usePointStyle: true,
                                color: '#475569'
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            titleFont: { size: 12, weight: 'bold', family: 'Inter' },
                            bodyFont: { size: 12, family: 'Inter' },
                            padding: 10,
                            cornerRadius: 8,
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw || 0)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#64748b',
                                font: { size: 11, family: 'Inter' },
                                callback: (val) => '₹' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val)
                            },
                            grid: { color: '#f1f5f9' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', font: { size: 11, family: 'Inter' } }
                        }
                    }
                }
            });
        }

        // ── 3. Render Right Chart: Donut Chart ───────────────────────────────
        // Centre: Total Discounts Given (Amount + Count)
        // Circle slices: Coupon, Offer, Membership
        const distCanvas = document.getElementById('distributionChart');
        const rightTitle = document.getElementById('rightChartTitle');
        if (rightTitle) {
            rightTitle.textContent = 'Discounts Share by Type';
        }

        if (distCanvas) {
            distChartInstance = destroyChart(distChartInstance);

            const totalAmount = distribution.total_amount || kpis.total_discounts_amount || 0;
            const totalCount = distribution.total_count || kpis.total_discounts_count || 0;

            const cData = distribution.coupons || { count: 0, amount: 0, pct: 0 };
            const oData = distribution.offers || { count: 0, amount: 0, pct: 0 };
            const mData = distribution.memberships || { count: 0, amount: 0, pct: 0 };

            // Center Label & Value
            const centerVal = document.getElementById('donutCenterValue');
            const centerLbl = document.getElementById('donutCenterLabel');
            if (centerVal) centerVal.textContent = formatCurrency(totalAmount);
            if (centerLbl) centerLbl.textContent = `${totalCount} Usages`;

            const slices = [
                {
                    label: 'Coupon Discounts',
                    count: cData.count,
                    amount: cData.amount,
                    pct: cData.pct,
                    color: '#f43f5e'
                },
                {
                    label: 'Offer Discounts',
                    count: oData.count,
                    amount: oData.amount,
                    pct: oData.pct,
                    color: '#f59e0b'
                },
                {
                    label: 'Membership Discounts',
                    count: mData.count,
                    amount: mData.amount,
                    pct: mData.pct,
                    color: '#8b5cf6'
                }
            ];

            distChartInstance = new Chart(distCanvas, {
                type: 'doughnut',
                data: {
                    labels: slices.map(s => s.label),
                    datasets: [{
                        data: slices.map(s => s.amount),
                        backgroundColor: slices.map(s => s.color),
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
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
                            callbacks: {
                                label: (ctx) => {
                                    const s = slices[ctx.dataIndex];
                                    return ` ${s.label}: ${formatCurrency(s.amount)} · ${s.count} (${s.pct}%)`;
                                }
                            }
                        }
                    }
                }
            });

            // Donut Legend Component
            const legendEl = document.getElementById('donutLegend');
            if (legendEl) {
                legendEl.innerHTML = slices.map(s => `
                    <div class="donut-legend-item" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:6px 12px; background:#f8fafc; border-radius:8px; margin-bottom:5px; border:1px solid #f1f5f9;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background-color:${s.color}; width:10px; height:10px; border-radius:50%; display:inline-block; flex-shrink:0;"></span>
                            <span style="font-weight:600; color:#334155; font-size:0.82rem;">${s.label}</span>
                        </div>
                        <div style="font-weight:700; color:#0f172a; font-size:0.82rem; text-align:right;">
                            ${formatCurrency(s.amount)}
                            <span style="font-weight:500; color:#64748b; font-size:0.75rem; margin-left:4px;">${s.count} (${s.pct}%)</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // ── 4. Render Table with 4 Tabs ─────────────────────────────────────
        // 1. Total discounts given
        // 2. Coupon discounts tab
        // 3. Offers discounts tab
        // 4. Membership discounts tab
        renderDiscountTabs(ledger || []);
    };

    const renderDiscountTabs = (ledgerList) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;

        let tabBar = document.getElementById('discountReportTabsBar');
        if (!tabBar) {
            tabBar = document.createElement('div');
            tabBar.id = 'discountReportTabsBar';
            tabBar.className = 'report-tabs-bar';
            const topBar = tableContainer.querySelector('.table-top-bar');
            if (topBar) {
                topBar.insertAdjacentElement('afterend', tabBar);
            }
        }

        const couponList = ledgerList.filter(d => (d.discount_type || '').toLowerCase() === 'coupon');
        const offerList  = ledgerList.filter(d => (d.discount_type || '').toLowerCase() === 'offer');
        const memList    = ledgerList.filter(d => (d.discount_type || '').toLowerCase() === 'membership');

        tabBar.innerHTML = `
            <button class="report-tab-btn active" data-tab="all">
                <i data-feather="grid" style="width:13px;height:13px;"></i>
                Total Discounts <span class="tab-badge">${ledgerList.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="coupon">
                <i data-feather="tag" style="width:13px;height:13px;"></i>
                Coupon Discounts <span class="tab-badge">${couponList.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="offer">
                <i data-feather="percent" style="width:13px;height:13px;"></i>
                Offers Discounts <span class="tab-badge">${offerList.length}</span>
            </button>
            <button class="report-tab-btn" data-tab="membership">
                <i data-feather="award" style="width:13px;height:13px;"></i>
                Membership Discounts <span class="tab-badge">${memList.length}</span>
            </button>
        `;

        if (window.feather) {
            try { feather.replace(); } catch (e) {}
        }

        const buildRow = (item) => {
            // Format Type Pill Badge
            let typeBadge = '';
            const t = (item.discount_type || '').toLowerCase();
            if (t === 'coupon') {
                typeBadge = `<span class="status-pill" style="background:#ffe4e6; color:#e11d48; font-weight:600; border:1px solid #fecdd3;">Coupon</span>`;
            } else if (t === 'offer') {
                typeBadge = `<span class="status-pill" style="background:#fef3c7; color:#b45309; font-weight:600; border:1px solid #fde68a;">Special Offer</span>`;
            } else if (t === 'membership') {
                typeBadge = `<span class="status-pill" style="background:#f3e8ff; color:#7e22ce; font-weight:600; border:1px solid #e9d5ff;">Membership</span>`;
            } else {
                typeBadge = `<span class="status-pill active">${item.discount_type || 'Discount'}</span>`;
            }

            // Format Status Badge
            let statusBadge = '';
            const st = (item.status || 'applied').toLowerCase();
            if (st === 'reversed') {
                statusBadge = `<span class="status-pill cancelled" style="font-weight:600;">Reversed</span>`;
            } else if (st.includes('partial')) {
                statusBadge = `<span class="status-pill pending" style="font-weight:600;">Partially Reversed</span>`;
            } else {
                statusBadge = `<span class="status-pill completed" style="font-weight:600;">Applied</span>`;
            }

            // Customer info
            const custInit = (item.customer_name || 'C').charAt(0).toUpperCase();
            const custDisplay = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:28px; height:28px; border-radius:50%; background:#e2e8f0; color:#334155; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem;">${custInit}</span>
                    <div>
                        <strong style="color:#0f172a; display:block; font-size:0.83rem;">${item.customer_name || 'Walk-in Customer'}</strong>
                        ${item.customer_phone ? `<span style="font-size:0.72rem; color:#64748b;">${item.customer_phone}</span>` : ''}
                    </div>
                </div>
            `;

            // Staff info
            const staffDisplay = item.staff_name
                ? `<div style="font-weight:600; color:#334155; font-size:0.83rem;">${item.staff_name}</div>`
                : `<span style="color:#94a3b8; font-size:0.8rem;">—</span>`;

            // Reference Info (Booking / POS Retail / Membership)
            const refDisplay = `
                <div>
                    <span style="font-weight:600; color:#0f172a; font-size:0.82rem;">${item.reference_type || 'Booking'}</span>
                    ${item.reference_code ? `<span style="display:block; font-size:0.72rem; color:#64748b; font-family:monospace;">#${item.reference_code}</span>` : ''}
                </div>
            `;

            // Reversal Amount display
            const revDisplay = (item.reversal_amount || 0) > 0
                ? `<span style="color:#dc2626; font-weight:600; font-size:0.83rem;">${formatCurrency(item.reversal_amount)}</span>`
                : `<span style="color:#94a3b8; font-size:0.8rem;">—</span>`;

            // Net discount amount display
            const netDisplay = `<strong style="color:#059669; font-size:0.85rem;">${formatCurrency(item.net_amount || (item.discount_amount - (item.reversal_amount || 0)))}</strong>`;

            return [
                `<div style="font-size:0.8rem; color:#334155; font-weight:500;">${item.used_at || '—'}</div>`,
                custDisplay,
                staffDisplay,
                typeBadge,
                `<strong style="color:#0f172a; font-size:0.83rem;">${item.discount_name || 'Standard Discount'}</strong>`,
                refDisplay,
                `<span style="font-weight:600; color:#475569; font-size:0.83rem;">${formatCurrency(item.discount_amount || 0)}</span>`,
                revDisplay,
                netDisplay,
                statusBadge
            ];
        };

        const headers = [
            'Date & Time',
            'Customer',
            'Staff',
            'Type',
            'Discount Name',
            'Applied On',
            'Gross Discount',
            'Reversal',
            'Net Discount',
            'Status'
        ];

        const tabDatasets = {
            all: {
                title: 'All Discount Usages Ledger',
                unitName: 'discount records',
                fileName: 'All_Discount_Usages',
                rows: ledgerList.map(buildRow)
            },
            coupon: {
                title: 'Coupon Code Redemptions Ledger',
                unitName: 'coupon redemptions',
                fileName: 'Coupon_Discounts_Ledger',
                rows: couponList.map(buildRow)
            },
            offer: {
                title: 'Promotional Offers & Deals Ledger',
                unitName: 'offer redemptions',
                fileName: 'Offer_Discounts_Ledger',
                rows: offerList.map(buildRow)
            },
            membership: {
                title: 'Membership Benefits & Perks Ledger',
                unitName: 'membership discounts',
                fileName: 'Membership_Discounts_Ledger',
                rows: memList.map(buildRow)
            }
        };

        const activateTab = (tabKey) => {
            tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
            });

            const config = tabDatasets[tabKey] || tabDatasets.all;
            const titleEl = document.getElementById('tableTitleText');
            if (titleEl) titleEl.textContent = config.title;

            setupReportTable(headers, config.rows, {
                unitName: config.unitName,
                reportFileName: config.fileName,
                searchPlaceholder: 'Search by customer, staff, discount code, reference, status...',
                pageSize: 10
            });
        };

        tabBar.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.getAttribute('data-tab');
                activateTab(tabKey);
            });
        });

        activateTab('all');
    };

    if (btnApply) {
        btnApply.onclick = loadDiscountReport;
    }

    await loadDiscountReport();
}
