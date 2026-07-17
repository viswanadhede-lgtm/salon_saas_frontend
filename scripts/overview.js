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
        const end = new Date(now);

        if (val === 'today') {
            // Both start and end remain today
        } else if (val === 'this_week') {
            start.setDate(now.getDate() - 6); // Last 7 days including today
        } else if (val === '30days') {
            start.setDate(now.getDate() - 30);
        } else if (val === '3months') {
            start.setMonth(now.getMonth() - 3);
        } else if (val === '6months') {
            start.setMonth(now.getMonth() - 6);
        } else if (val === '12months') {
            start.setMonth(now.getMonth() - 12);
        } else if (val === 'custom') {
            const cs = document.getElementById('customStartDate').value;
            const ce = document.getElementById('customEndDate').value;
            if (cs && ce) {
                return { start: cs, end: ce };
            }
        }
        
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
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
            const [kpiRes, trendRes, splitRes, insightsRes, branchRes] = await Promise.all([
                supabase.rpc('get_overview_kpis', args),
                supabase.rpc('get_overview_trends', args),
                supabase.rpc('get_overview_revenue_split', args),
                supabase.rpc('get_overview_insights', args),
                supabase.rpc('get_overview_branch_performance', args) // Branch logic ignores p_branch_id globally
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

            // Generate dummy overlapping area data for demonstration
            const dummyServices = labels.map(() => Math.floor(Math.random() * 5000) + 3000);
            const dummyPOS = labels.map(() => Math.floor(Math.random() * 2000) + 500);
            const dummyMemberships = labels.map(() => Math.floor(Math.random() * 3000) + 1000);

            // Revenue Trend Chart (Clean Lines Style)
            const revCtx = document.getElementById('revenueTrendChart')?.getContext('2d');
            if (revCtx) {
                if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();

                revenueTrendChartInstance = new Chart(revCtx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Services',
                                data: dummyServices,
                                borderColor: '#4338ca',
                                borderWidth: 2.5,
                                backgroundColor: '#ffffff',
                                pointBackgroundColor: '#4338ca',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 4,
                                pointHoverRadius: 7,
                                fill: false,
                                tension: 0.35
                            },
                            {
                                label: 'POS',
                                data: dummyPOS,
                                borderColor: '#f59e0b',
                                borderWidth: 2.5,
                                backgroundColor: '#ffffff',
                                pointBackgroundColor: '#f59e0b',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 4,
                                pointHoverRadius: 7,
                                fill: false,
                                tension: 0.35
                            },
                            {
                                label: 'Memberships',
                                data: dummyMemberships,
                                borderColor: '#059669',
                                borderWidth: 2.5,
                                backgroundColor: '#ffffff',
                                pointBackgroundColor: '#059669',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 4,
                                pointHoverRadius: 7,
                                fill: false,
                                tension: 0.35
                            }
                        ]
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        plugins: { 
                            datalabels: { display: false }, 
                            legend: { 
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    padding: 20,
                                    font: { size: 12, weight: '600' }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#1e293b',
                                titleColor: '#f8fafc',
                                bodyColor: '#e2e8f0',
                                borderColor: '#334155',
                                borderWidth: 1,
                                cornerRadius: 8,
                                padding: 12,
                                callbacks: {
                                    label: function(context) {
                                        return ' ' + context.dataset.label + ': ₹' + context.raw.toLocaleString('en-IN');
                                    }
                                }
                            }
                        },
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                grid: { color: '#f1f5f9', drawBorder: false },
                                ticks: {
                                    callback: function(value) {
                                        if (value >= 1000) return '₹' + (value / 1000) + 'k';
                                        return '₹' + value;
                                    },
                                    font: { size: 11 },
                                    color: '#94a3b8'
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 11 }, color: '#94a3b8' }
                            }
                        }
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
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                grid: { borderDash: [2, 2], color: '#f1f5f9' },
                                ticks: { precision: 0 } // Forces 1, 2, 3 instead of 0.5, 1.5
                            },
                            x: {
                                grid: { display: false }
                            }
                        }
                    }
                });
            }

            // ── NEW CARDS: Staff & Product Performance dummy charts ──
            
            // Staff Performance Chart
            const staffLabels = ['Rahul', 'Priya', 'Amit', 'Neha', 'Vikram'];
            const staffData = staffLabels.map(() => Math.floor(Math.random() * 50000) + 10000);
            const nStaffCtx = document.getElementById('newStaffPerformanceChart')?.getContext('2d');
            if (nStaffCtx) {
                if (window.newStaffPerformanceChartInstance) window.newStaffPerformanceChartInstance.destroy();
                window.newStaffPerformanceChartInstance = new Chart(nStaffCtx, {
                    type: 'bar',
                    data: {
                        labels: staffLabels,
                        datasets: [{
                            label: 'Revenue',
                            data: staffData,
                            backgroundColor: '#3b82f6',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true, maintainAspectRatio: false,
                        plugins: { datalabels: { display: false }, legend: { display: false } },
                        scales: { x: { beginAtZero: true, grid: { borderDash: [2, 2], color: '#f1f5f9' } }, y: { grid: { display: false } } }
                    }
                });
            }

            // Product Performance Chart
            const productLabels = ['Hair Serum', 'Shampoo', 'Styling Gel', 'Face Pack', 'Conditioner'];
            const productData = productLabels.map(() => Math.floor(Math.random() * 20000) + 5000);
            const nProdCtx = document.getElementById('newProductPerformanceChart')?.getContext('2d');
            if (nProdCtx) {
                if (window.newProductPerformanceChartInstance) window.newProductPerformanceChartInstance.destroy();
                window.newProductPerformanceChartInstance = new Chart(nProdCtx, {
                    type: 'bar',
                    data: {
                        labels: productLabels,
                        datasets: [{
                            label: 'Sales Revenue',
                            data: productData,
                            backgroundColor: '#f59e0b',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true, maintainAspectRatio: false,
                        plugins: { datalabels: { display: false }, legend: { display: false } },
                        scales: { x: { beginAtZero: true, grid: { borderDash: [2, 2], color: '#f1f5f9' } }, y: { grid: { display: false } } }
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

            // Branch Performance Chart (Time-series line chart with dummy data)
            const branchCtx = document.getElementById('branchPerformanceChart')?.getContext('2d');
            if (branchCtx) {
                if (window.branchPerformanceChartInstance) window.branchPerformanceChartInstance.destroy();

                // Dummy time labels (last 14 days)
                const branchLabels = [];
                for (let i = 13; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    branchLabels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                }

                const dummyBranch1 = branchLabels.map(() => Math.floor(Math.random() * 8000) + 2000);
                const dummyBranch2 = branchLabels.map(() => Math.floor(Math.random() * 6000) + 1000);

                // Gradients
                const gradB1 = branchCtx.createLinearGradient(0, 0, 0, 300);
                gradB1.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
                gradB1.addColorStop(1, 'rgba(139, 92, 246, 0.05)');

                const gradB2 = branchCtx.createLinearGradient(0, 0, 0, 300);
                gradB2.addColorStop(0, 'rgba(236, 72, 153, 0.6)');
                gradB2.addColorStop(1, 'rgba(236, 72, 153, 0.05)');

                window.branchPerformanceChartInstance = new Chart(branchCtx, {
                    type: 'line',
                    data: {
                        labels: branchLabels,
                        datasets: [
                            {
                                label: 'Main Branch',
                                data: dummyBranch1,
                                borderColor: '#8b5cf6',
                                borderWidth: 3,
                                backgroundColor: gradB1,
                                pointRadius: 0,
                                pointHoverRadius: 6,
                                pointBackgroundColor: '#ffffff',
                                pointBorderColor: '#8b5cf6',
                                pointBorderWidth: 2,
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: 'Branch 2',
                                data: dummyBranch2,
                                borderColor: '#ec4899',
                                borderWidth: 3,
                                backgroundColor: gradB2,
                                pointRadius: 0,
                                pointHoverRadius: 6,
                                pointBackgroundColor: '#ffffff',
                                pointBorderColor: '#ec4899',
                                pointBorderWidth: 2,
                                fill: true,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            datalabels: { display: false },
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': ₹' + context.raw.toLocaleString('en-IN');
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { borderDash: [2, 2], color: '#f1f5f9' } },
                            x: { grid: { display: false } }
                        }
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
    
    if (dateRange) {
        dateRange.addEventListener('change', () => {
            const customWrap = document.getElementById('customDateWrap');
            if (dateRange.value === 'custom') {
                if(customWrap) customWrap.style.display = 'flex';
                // Do not load data immediately; wait for user to click Apply
            } else {
                if(customWrap) customWrap.style.display = 'none';
                loadOverviewData();
            }
        });
    }

    const btnApply = document.getElementById('btnApplyDate');
    const btnReset = document.getElementById('btnResetDate');
    
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const s = document.getElementById('customStartDate').value;
            const e = document.getElementById('customEndDate').value;
            if (s && e) loadOverviewData();
            else alert("Please select both start and end dates.");
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            document.getElementById('customStartDate').value = '';
            document.getElementById('customEndDate').value = '';
            dateRange.value = '30days';
            document.getElementById('customDateWrap').style.display = 'none';
            loadOverviewData();
        });
    }

    // Initial Load
    loadOverviewData();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOverview);
} else {
    initializeOverview();
}
