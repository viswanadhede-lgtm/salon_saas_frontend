import { supabase } from '../lib/supabase.js';

// Ensure Chart.js is loaded
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.color = '#64748b';

// Global Vars for Charts to allow destruction/re-creation
let revenueTrendChartInstance = null;
let bookingTrendChartInstance = null;
let staffPerformanceChartInstance = null;
let revenueSplitChartInstance = null;

const initializeOverview = async () => {
    // 1. Initialize UI Elements (Filters)
    const companyId = localStorage.getItem('company_id');
    const branchSelect = document.getElementById('branchSelect');
    const dateRange = document.getElementById('overviewDateRange');

    // Load Branches
    if (branchSelect) {
        try {
            const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
            if (bList && bList.length > 0) {
                branchSelect.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                branchSelect.value = localStorage.getItem('active_branch_id') || 'all';
            }
        } catch(e) { console.warn('Branches load failed', e); }
    }

    // Prepare filter bounds based on select dropdown
    const getDateRangeBounds = () => {
        const val = dateRange ? dateRange.value : '30days';
        const now = new Date();
        const start = new Date(now);
        if (val === '30days') start.setDate(now.getDate() - 30);
        else if (val === '3months') start.setMonth(now.getMonth() - 3);
        else if (val === '6months') start.setMonth(now.getMonth() - 6);
        else if (val === '12months') start.setMonth(now.getMonth() - 12);
        
        return {
            start: start.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0]
        };
    };

    // 2. Main Fetch Function
    const loadOverviewData = async () => {
        const bounds = getDateRangeBounds();
        const branchId = (branchSelect && branchSelect.value !== 'all') ? branchSelect.value : null;

        const args = {
            p_company_id: companyId,
            p_branch_id: branchId,
            p_start_date: bounds.start,
            p_end_date: bounds.end
        };

        // UI Loading States
        const kpiEls = document.querySelectorAll('.stat-value');
        kpiEls.forEach(el => el.innerHTML = '<i data-feather="loader" style="animation:spin 1s linear infinite;"></i>');
        if (window.feather) feather.replace();

        try {
            const [kpiRes, trendRes, leadersRes, splitRes, insightsRes, branchRes] = await Promise.all([
                supabase.rpc('get_overview_kpis', args),
                supabase.rpc('get_overview_trends', args),
                supabase.rpc('get_overview_leaders', args),
                supabase.rpc('get_overview_revenue_split', args),
                supabase.rpc('get_overview_insights', args),
                supabase.rpc('get_overview_branch_performance', { 
                    p_company_id: companyId, 
                    p_start_date: args.p_start_date, 
                    p_end_date: args.p_end_date 
                }) // Note: branch logic applies globally, ignoring p_branch_id
            ]);

            // ── A. Render KPIs ──
            const kpi = Array.isArray(kpiRes.data) ? kpiRes.data[0] : (kpiRes.data || { gross_revenue: 0, total_expenses: 0, net_revenue: 0, total_bookings: 0 });
            
            // Assuming order of cards in HTML is: Revenue(Gross), Bookings, New Customers (mapped to Net Revenue), Avg Booking Value (mapped to Total Bookings or vice versa).
            // Let's explicitly target them by creating IDs or mapping logically based on the HTML tree.
            const cards = document.querySelectorAll('.stat-card');
            
            if (cards.length >= 4) {
                // Card 1: Gross Revenue
                const lbl1 = cards[0].querySelector('.stat-label');
                const val1 = cards[0].querySelector('.stat-value');
                if (lbl1) lbl1.textContent = 'Gross Revenue';
                if (val1) val1.textContent = `₹${Number(kpi.gross_revenue || 0).toLocaleString('en-IN')}`;
                
                // Card 2: Expenses
                const lbl2 = cards[1].querySelector('.stat-label');
                const val2 = cards[1].querySelector('.stat-value');
                const iconBase2 = cards[1].querySelector('.stat-icon');
                if (lbl2) lbl2.textContent = 'Total Expenses';
                if (val2) val2.textContent = `₹${Number(kpi.total_expenses || 0).toLocaleString('en-IN')}`;
                if (iconBase2) {
                    iconBase2.className = 'stat-icon bg-rose-light';
                    iconBase2.innerHTML = '<i data-feather="dollar-sign" class="text-rose" style="color: #f43f5e;"></i>';
                }
                
                // Card 3: Net Revenue (Profit)
                const netRev = Number(kpi.net_revenue || 0);
                const lbl3 = cards[2].querySelector('.stat-label');
                const val3 = cards[2].querySelector('.stat-value');
                if (lbl3) lbl3.textContent = 'Net Revenue';
                if (val3) {
                    val3.textContent = `₹${netRev.toLocaleString('en-IN')}`;
                    val3.style.color = netRev >= 0 ? '#10b981' : '#ef4444';
                }
                
                // Card 4: Total Bookings
                const lbl4 = cards[3].querySelector('.stat-label');
                const val4 = cards[3].querySelector('.stat-value');
                if (lbl4) lbl4.textContent = 'Total Bookings';
                if (val4) val4.textContent = kpi.total_bookings || '0';
            }

            // ── B. Render Trends (Line Chart) ──
            const trendData = trendRes.data || [];
            const labels = trendData.map(t => new Date(t.trend_date).toLocaleDateString(undefined, { month:'short', day:'numeric'}));

            // Revenue Trend Chart
            const revCtx = document.getElementById('revenueTrendChart')?.getContext('2d');
            if (revCtx) {
                if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();
                revenueTrendChartInstance = new Chart(revCtx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Gross Revenue',
                                data: trendData.map(t => Number(t.daily_revenue || 0)),
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: 'Expenses',
                                data: trendData.map(t => Number(t.daily_expenses || 0)),
                                borderColor: '#ef4444',
                                borderDash: [5, 5],
                                backgroundColor: 'transparent',
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { datalabels: { display: false }, legend: { position: 'top' } },
                        scales: { y: { beginAtZero: true, grid: { borderDash: [2, 2] } } }
                    }
                });
            }

            // Booking Volume Chart
            const bookCtx = document.getElementById('bookingTrendChart')?.getContext('2d');
            if (bookCtx) {
                if (bookingTrendChartInstance) bookingTrendChartInstance.destroy();
                bookingTrendChartInstance = new Chart(bookCtx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Completed Bookings',
                            data: trendData.map(t => Number(t.daily_bookings || 0)),
                            backgroundColor: '#6366f1',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { datalabels: { display: false }, legend: { position: 'top' } },
                        scales: { y: { beginAtZero: true, grid: { borderDash: [2, 2] } } }
                    }
                });
            }

            // ── C. Render Performance Leaders ──
            const leadersData = leadersRes.data || [];
            const topServices = leadersData.filter(l => l.leader_type === 'service');
            const topStaff = leadersData.filter(l => l.leader_type === 'staff');

            // Top Services HTML Injection
            const perfList = document.querySelector('.performance-list');
            if (perfList) {
                perfList.innerHTML = '';
                if (topServices.length === 0) {
                    perfList.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;">No services data available</div>';
                } else {
                    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'];
                    topServices.forEach((s, idx) => {
                        const color = colors[idx % colors.length];
                        perfList.innerHTML += `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
                                    <span style="font-weight: 500;">${s.name || 'Unknown'}</span>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-weight: 600;">₹${Number(s.revenue || 0).toLocaleString('en-IN')}</div>
                                    <div style="font-size: 0.75rem; color: #94a3b8;">${s.bookings} bookings</div>
                                </div>
                            </div>
                        `;
                    });
                }
            }

            // Top Staff Horizontal Bar Chart
            const staffCtx = document.getElementById('staffPerformanceChart')?.getContext('2d');
            if (staffCtx) {
                if (staffPerformanceChartInstance) staffPerformanceChartInstance.destroy();
                staffPerformanceChartInstance = new Chart(staffCtx, {
                    type: 'bar',
                    data: {
                        labels: topStaff.map(s => s.name || 'Unknown'),
                        datasets: [{
                            label: 'Revenue Generated',
                            data: topStaff.map(s => Number(s.revenue || 0)),
                            backgroundColor: '#3b82f6',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        indexAxis: 'y', // Makes it horizontal
                        responsive: true, maintainAspectRatio: false,
                        plugins: { datalabels: { display: false }, legend: { display: false } },
                        scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }
                    }
                });
            }

            // ── D. Render Revenue Split (Donut Chart) ──
            const splitData = splitRes.data || [];
            let servicesRev = 0, productsRev = 0, membersRev = 0;
            
            splitData.forEach(row => {
                const amt = Number(row.revenue || 0);
                if (row.source_type === 'booking' || row.source_type === 'service') servicesRev += amt;
                else if (row.source_type === 'product') productsRev += amt;
                else if (row.source_type === 'membership') membersRev += amt;
                else servicesRev += amt; // default unknown to services
            });

            const totalRevForDonut = servicesRev + productsRev + membersRev;
            const splitCtx = document.getElementById('revenueSplitChart')?.getContext('2d');
            
            if (splitCtx) {
                if (revenueSplitChartInstance) revenueSplitChartInstance.destroy();
                revenueSplitChartInstance = new Chart(splitCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Services', 'Products', 'Memberships'],
                        datasets: [{
                            data: [servicesRev, productsRev, membersRev],
                            backgroundColor: ['#6366f1', '#f59e0b', '#10b981'],
                            borderWidth: 0,
                            cutout: '75%'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { 
                            datalabels: { display: false }, 
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return ' ₹' + context.raw.toLocaleString('en-IN');
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Update primary donut result in center
            if (totalRevForDonut > 0) {
                const centerVal = document.querySelector('.result-title');
                const centerSub = document.querySelector('.result-subtitle');
                if (centerVal) centerVal.textContent = Math.round((servicesRev / totalRevForDonut) * 100) + '%';
                if (centerSub) centerSub.textContent = 'SERVICES';

                const primaryValue = document.querySelector('.primary-value');
                if (primaryValue) primaryValue.textContent = Math.round((servicesRev / totalRevForDonut) * 100) + '%';
            }

            // Update Marketing Block (Memberships Data)
            const membRevEl = document.getElementById('overviewMembRevenue');
            if (membRevEl) membRevEl.textContent = `₹${membersRev.toLocaleString('en-IN')}`;

            // Fetch Coupons and Offers Usage directly (they don't need a dedicated RPC)
            Promise.all([
                supabase.from('coupons').select('current_usage_count').eq('company_id', companyId),
                supabase.from('offers').select('current_usage_count').eq('company_id', companyId)
            ]).then(([couponsData, offersData]) => {
                let couponsUsed = 0;
                let offersRedeemed = 0;

                if (couponsData.data) couponsUsed = couponsData.data.reduce((sum, c) => sum + Number(c.current_usage_count || 0), 0);
                if (offersData.data) offersRedeemed = offersData.data.reduce((sum, o) => sum + Number(o.current_usage_count || 0), 0);

                const cEl = document.getElementById('overviewCouponsUsed');
                const oEl = document.getElementById('overviewOffersRedeemed');
                
                if (cEl) cEl.textContent = couponsUsed;
                if (oEl) oEl.textContent = offersRedeemed;
            }).catch(e => console.warn('Could not load marketing metrics', e));

            // Update Metric Items list
            const metrics = document.querySelectorAll('.metric-item');
            if (metrics.length >= 3) {
                metrics[0].querySelector('h4').textContent = 'Services';
                metrics[0].querySelector('p').textContent = `₹${servicesRev.toLocaleString('en-IN')}`;
                metrics[1].querySelector('h4').textContent = 'Products';
                metrics[1].querySelector('p').textContent = `₹${productsRev.toLocaleString('en-IN')}`;
                metrics[2].querySelector('h4').textContent = 'Memberships';
                metrics[2].querySelector('p').textContent = `₹${membersRev.toLocaleString('en-IN')}`;
            }

            // ── E. Render Insights & Branch ──
            if (insightsRes && insightsRes.data && insightsRes.data.length > 0) {
                const insight = insightsRes.data[0];
                const retCustEl = document.getElementById('overviewReturningCust');
                const retRateEl = document.getElementById('overviewRetentionRate');
                const loyalEl = document.getElementById('overviewLoyalCust');
                const loyalBar = document.getElementById('overviewLoyalBar');
                
                if (retCustEl) retCustEl.textContent = `${insight.returning_percentage || 0}%`;
                if (retRateEl) retRateEl.textContent = `${insight.retention_rate || 0}%`;
                if (loyalEl) loyalEl.textContent = insight.loyal_customers || '0';
                
                // An arbitrary visual max bound of 100 loyal customers for the progress bar
                if (loyalBar) {
                    const maxBound = 100; 
                    const pct = Math.min(((insight.loyal_customers || 0) / maxBound) * 100, 100);
                    loyalBar.style.width = `${pct}%`;
                }
            }

            // Branch Performance Chart
            const branchCtx = document.getElementById('branchPerformanceChart')?.getContext('2d');
            const branchData = branchRes?.data || [];
            if (branchCtx && branchData.length > 0) {
                // Destroy old dummy inline branch chart if it somehow exists (this chart does not have an instance variable yet)
                if (window.branchPerformanceChartInstance) window.branchPerformanceChartInstance.destroy();
                
                window.branchPerformanceChartInstance = new Chart(branchCtx, {
                    type: 'bar',
                    data: {
                        labels: branchData.map(b => b.branch_name || 'Unknown'),
                        datasets: [{
                            data: branchData.map(b => Number(b.revenue || 0)),
                            backgroundColor: '#8b5cf6',
                            borderRadius: 6,
                            hoverBackgroundColor: '#7c3aed'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, datalabels: { display: false } },
                        scales: { y: { display: false }, x: { display: true, grid: {display: false} } }
                    }
                });
            }

            if (window.feather) feather.replace();

        } catch (err) {
            console.error('Error loading overview data:', err);
            const kpiEls = document.querySelectorAll('.stat-value');
            kpiEls.forEach(el => el.textContent = 'Error');
        }
    };

    // 3. Attach Listeners
    if (branchSelect) branchSelect.addEventListener('change', loadOverviewData);
    if (dateRange) dateRange.addEventListener('change', loadOverviewData);

    // Initial Load
    loadOverviewData();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOverview);
} else {
    initializeOverview();
}
