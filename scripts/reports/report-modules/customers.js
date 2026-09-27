// scripts/reports/report-modules/customers.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderCustomers(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR CUSTOMERS ---
        const companyId = localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id');
        
        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            const { data: dbCustomers, error } = await supabase
                .from('customers')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const customersList = dbCustomers || [];
            
            // Calculate KPIs
            const now = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            
            const totalCust = customersList.length;
            const newCust = customersList.filter(c => c.created_at && new Date(c.created_at) >= thirtyDaysAgo).length;
            
            let totalValue = 0;
            let totalBookingsAcrossAll = 0;
            
            const formattedRows = customersList.map(c => {
                totalValue += (c.total_spent || 0);
                totalBookingsAcrossAll += (c.total_bookings || 0);
                
                const joinedDate = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Unknown';
                const name = c.customer_name || 'N/A';
                const phone = c.customer_phone || 'N/A';
                const visits = c.total_bookings || 0;
                const spend = formatCurrency(c.total_spent || 0);
                const lastVisit = c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Never';
                
                // compute status based on last visit
                let statusHtml = '<span class="status-pill active">Active</span>';
                if (c.last_visit) {
                    const daysSince = (now - new Date(c.last_visit)) / (1000 * 60 * 60 * 24);
                    if (daysSince > 90) statusHtml = '<span class="status-pill cancelled">Inactive</span>';
                } else {
                     statusHtml = '<span class="status-pill pending">New</span>';
                }

                return [joinedDate, name, phone, visits, spend, lastVisit, statusHtml];
            });
            
            // Override KPIs
            data.kpi1.value = totalCust.toString();
            data.kpi2.value = newCust.toString();
            data.kpi3.value = formatCurrency(totalValue);
            data.kpi4.value = totalCust > 0 ? (totalBookingsAcrossAll / totalCust).toFixed(1) : '0';
            
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading customer report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderCustMetrics(data, supabase) {
        // â”€â”€ LIVE: Customer Metrics Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const companyId    = localStorage.getItem('company_id');
        const filterStart  = document.getElementById('filterStartDate');
        const filterEnd    = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply     = document.getElementById('btnApplyFilters');

        const now      = new Date();
        const today    = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value)   filterEnd.value   = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                        bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { console.warn('Branch fetch failed', e); }
        };

        const loadCustomerMetrics = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
            const bid   = (filterBranch && filterBranch.value !== 'all')
                ? filterBranch.value
                : localStorage.getItem('active_branch_id');

            // Loading state
            data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const baseArgs  = { p_company_id: companyId, p_branch_id: bid };
                const rangeArgs = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_customer_metrics_summary', baseArgs),
                    supabase.rpc('get_customer_metrics_trend', rangeArgs),
                    supabase.rpc('get_customer_metrics_distribution', baseArgs),
                    supabase.rpc('get_customer_metrics_table', rangeArgs)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_customer_metrics_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.total_customers    || 0).toLocaleString();
                    data.kpi2.value = Number(sumRow.new_customers      || 0).toLocaleString();
                    data.kpi3.value = Number(sumRow.active_customers   || 0).toLocaleString();
                    data.kpi4.value = Number(sumRow.inactive_customers || 0).toLocaleString();
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = '0';
                    data.kpi3.value = '0'; data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Bar Chart â€” new customers per day
                if (trendRes.error) console.warn('get_customer_metrics_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.join_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.new_customers || t.count || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” Active vs Inactive
                if (distRes.error) console.warn('get_customer_metrics_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.label || 'Unknown'),
                            distRes.data.map(s => Number(s.count || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table â€” 9 columns
                data.headers = ['Customer', 'Total Bookings', 'Completed', 'Revenue', 'First Booking', 'Last Booking', 'Last Completed', 'Type', 'Status'];
                if (tRes.error) console.warn('get_customer_metrics_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const name    = r.customer_name  || 'â€”';
                        const phone   = r.customer_phone || '';
                        const custCell = phone ? `<div><strong>${name}</strong><br><small style="color:#64748b;">${phone}</small></div>` : `<strong>${name}</strong>`;
                        const totalBk  = Number(r.total_bookings     || 0).toLocaleString();
                        const compBk   = Number(r.completed_bookings || 0).toLocaleString();
                        const revenue  = r.total_revenue != null ? formatCurrency(r.total_revenue) : 'â€”';
                        const firstBk  = r.first_booking_date ? new Date(r.first_booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : 'â€”';
                        const lastBk   = r.last_booking_date  ? new Date(r.last_booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})  : 'â€”';
                        const lastComp = r.last_completed_service_date ? new Date(r.last_completed_service_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : 'â€”';

                        const typeStyle = r.customer_type === 'New'
                            ? 'background:#e0e7ff;color:#3730a3;'
                            : 'background:#fef3c7;color:#92400e;';
                        const typeHtml = `<span class="status-pill" style="${typeStyle}">${r.customer_type || 'â€”'}</span>`;

                        const statusStyle = r.status === 'Active'
                            ? 'background:#dcfce7;color:#166534;'
                            : 'background:#f1f5f9;color:#64748b;';
                        const statusHtml = `<span class="status-pill" style="${statusStyle}">${r.status || 'â€”'}</span>`;

                        return [custCell, totalBk, compBk, `<strong style="color:#10b981;">${revenue}</strong>`, firstBk, lastBk, lastComp, typeHtml, statusHtml];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadCustomerMetrics:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadCustomerMetrics);
            loadCustomerMetrics();
        });

}

async function renderCustInsights(data, supabase) {
        // â”€â”€ LIVE: Customer Insights Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const companyId    = localStorage.getItem('company_id');
        const filterStart  = document.getElementById('filterStartDate');
        const filterEnd    = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply     = document.getElementById('btnApplyFilters');

        const now      = new Date();
        const today    = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value)   filterEnd.value   = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                        bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { console.warn('Branch fetch failed', e); }
        };

        const loadInsightsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
            const bid   = (filterBranch && filterBranch.value !== 'all')
                ? filterBranch.value
                : localStorage.getItem('active_branch_id');

            data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_customer_insights_summary', args),
                    supabase.rpc('get_customer_insights_trend', args),
                    supabase.rpc('get_customer_insights_distribution', args),
                    supabase.rpc('get_customer_insights_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_customer_insights_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = sumRow.top_customer                || 'â€”';
                    data.kpi2.value = sumRow.avg_revenue_per_customer != null ? formatCurrency(sumRow.avg_revenue_per_customer) : 'â€”';
                    data.kpi3.value = sumRow.avg_visits_per_customer  != null ? Number(sumRow.avg_visits_per_customer).toFixed(1) : 'â€”';
                    data.kpi4.value = sumRow.repeat_customer_rate     != null ? Number(sumRow.repeat_customer_rate).toFixed(1) + '%' : 'â€”';
                } else {
                    data.kpi1.value = 'â€”'; data.kpi2.value = 'â€”';
                    data.kpi3.value = 'â€”'; data.kpi4.value = 'â€”';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart â€” visits per day
                if (trendRes.error) console.warn('get_customer_insights_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.visits || t.count || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” New vs Repeat
                if (distRes.error) console.warn('get_customer_insights_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.label || 'Unknown'),
                            distRes.data.map(s => Number(s.count || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table â€” 7 columns
                data.headers = ['Customer', 'Total Visits', 'Total Spend', 'Avg / Visit', 'Favourite Service', 'Last Visit', 'Status'];
                if (tRes.error) console.warn('get_customer_insights_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const name     = r.customer_name  || 'â€”';
                        const phone    = r.customer_phone || '';
                        const custCell = phone
                            ? `<div><strong>${name}</strong><br><small style="color:#64748b;">${phone}</small></div>`
                            : `<strong>${name}</strong>`;
                        const visits   = Number(r.total_visits || 0).toLocaleString();
                        const spend    = r.total_spend != null ? formatCurrency(r.total_spend) : 'â€”';
                        const avgVisit = r.avg_spend_per_visit != null ? formatCurrency(r.avg_spend_per_visit) : 'â€”';
                        const favSvc   = r.favourite_service || 'â€”';
                        const lastVisit = r.last_visit
                            ? new Date(r.last_visit).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';
                        const statusStyle = r.status === 'Active'
                            ? 'background:#dcfce7;color:#166534;'
                            : 'background:#f1f5f9;color:#64748b;';
                        const statusHtml = `<span class="status-pill" style="${statusStyle}">${r.status || 'â€”'}</span>`;

                        return [
                            custCell,
                            visits,
                            `<strong style="color:#10b981;">${spend}</strong>`,
                            avgVisit,
                            `<span style="color:#6366f1;font-weight:500;">${favSvc}</span>`,
                            lastVisit,
                            statusHtml
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadInsightsData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadInsightsData);
            loadInsightsData();
        });

}

const handlers = {
    'customers': renderCustomers,
    'cust-metrics': renderCustMetrics,
    'cust-insights': renderCustInsights
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
