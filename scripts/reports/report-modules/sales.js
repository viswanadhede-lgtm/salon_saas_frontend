// scripts/reports/report-modules/sales.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderSalesTotal(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadSalesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel for strict performance requirement
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_total_sales_summary', args),
                    supabase.rpc('get_sales_trend', args),
                    supabase.rpc('get_sales_distribution', args),
                    supabase.rpc('get_sales_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_sales || 0);
                        data.kpi2.value = Number(row.total_orders || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.avg_order_value || 0);
                        data.kpi4.value = Number(row.total_items_sold || 0).toLocaleString();
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = 'â‚¹0';
                    data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('get_sales_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.service_revenue ?? t.total_amount ?? t.sales ?? t.total ?? t.sum;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('get_sales_distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.item_type ? s.item_type.toUpperCase() : 'OTHER'), splitRes.data.map(s => Number(s.total_sales || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Type', 'Item Name', 'Category', 'Quantity', 'Unit Price', 'Total Amount'];
                if (tRes.error) console.warn('get_sales_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.date ? new Date(r.date).toLocaleString() : 'â€”';
                        const typeText = (r.item_type || 'Unknown').toUpperCase();
                        const itemName = r.item_name || 'â€”';
                        const cat = r.category || 'â€”';
                        const qty = Number(r.quantity || 0).toLocaleString();
                        const price = formatCurrency(r.unit_price || 0);
                        const total = formatCurrency(r.total_amount || 0);

                        return [
                            dateText,
                            `<span class="status-pill active" style="background:#e0e7ff; color:#4338ca;">${typeText}</span>`,
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            cat,
                            qty,
                            price,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadSalesData);
            loadSalesData();
        });

}

async function renderSalesServiceRevenue(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadServiceRevenueData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_service_revenue_summary', args),
                    supabase.rpc('get_service_revenue_trend', args),
                    supabase.rpc('get_service_revenue_distribution', args),
                    supabase.rpc('get_service_revenue_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_revenue || row.total_sales || row.total_service_revenue || 0);
                        data.kpi2.value = Number(row.total_bookings || row.total_orders || row.total_service_bookings || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.avg_service_value || row.avg_order_value || 0);
                        data.kpi4.value = Number(row.total_services_delivered || row.total_items_sold || row.total_services || 0).toLocaleString();
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = 'â‚¹0';
                    data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.service_revenue ?? t.total_amount ?? t.sales ?? t.total ?? t.sum;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('Distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.category || s.item_type || s.service_category || 'OTHER'), splitRes.data.map(s => Number(s.total_sales || s.revenue || s.total_revenue || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Service Name', 'Category', 'Quantity', 'Unit Price', 'Total Amount'];
                if (tRes.error) console.warn('Table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.date ? new Date(r.date).toLocaleString() : 'â€”';
                        const itemName = r.service_name || r.item_name || 'â€”';
                        const cat = r.category || 'â€”';
                        const qty = Number(r.quantity || 0).toLocaleString();
                        const price = formatCurrency(r.unit_price || r.price || 0);
                        const total = formatCurrency(r.total_amount || r.revenue || 0);

                        return [
                            dateText,
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            `<span class="status-pill active" style="background:#f1f5f9; color:#475569;">${cat}</span>`,
                            qty,
                            price,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadServiceRevenueData);
            loadServiceRevenueData();
        });

}

async function renderSalesProductSales(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadProductSalesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_product_sales_summary', args),
                    supabase.rpc('get_product_sales_trend', args),
                    supabase.rpc('get_product_sales_distribution', args),
                    supabase.rpc('get_product_sales_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_product_revenue || row.total_revenue || row.total_sales || 0);
                        data.kpi2.value = Number(row.total_items_sold || row.total_products_sold || row.quantity_sold || 0).toLocaleString();
                        data.kpi3.value = Number(row.total_orders || row.total_bookings || row.total_transactions || 0).toLocaleString();
                        data.kpi4.value = formatCurrency(row.avg_order_value || row.avg_value || 0);
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '0';
                    data.kpi4.value = 'â‚¹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.product_revenue ?? t.total_product_revenue ?? t.total_amount ?? t.sales ?? t.total ?? t.sum;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('Distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.category || s.item_type || s.product_category || 'OTHER'), splitRes.data.map(s => Number(s.total_sales || s.revenue || s.total_revenue || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Product Name', 'Category', 'Quantity', 'Unit Price', 'Total Amount'];
                if (tRes.error) console.warn('Table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.date ? new Date(r.date).toLocaleString() : 'â€”';
                        const itemName = r.product_name || r.item_name || 'â€”';
                        const cat = r.category || 'â€”';
                        const qty = Number(r.quantity || 0).toLocaleString();
                        const price = formatCurrency(r.unit_price || r.price || 0);
                        const total = formatCurrency(r.total_amount || r.revenue || 0);

                        return [
                            dateText,
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            `<span class="status-pill active" style="background:#f1f5f9; color:#475569;">${cat}</span>`,
                            qty,
                            price,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadProductSalesData);
            loadProductSalesData();
        });

}

async function renderSalesMembershipRevenue(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadMembershipRevenueData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_membership_revenue_summary', args),
                    supabase.rpc('get_membership_revenue_trend', args),
                    supabase.rpc('get_membership_revenue_distribution', args),
                    supabase.rpc('get_membership_revenue_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_membership_revenue || row.total_revenue || row.total_sales || 0);
                        data.kpi2.value = Number(row.total_memberships_sold || row.total_items_sold || row.total_sales_count || 0).toLocaleString();
                        data.kpi3.value = Number(row.total_plans_sold || row.total_orders || row.total_transactions || 0).toLocaleString();
                        data.kpi4.value = formatCurrency(row.avg_membership_value || row.avg_order_value || row.avg_value || 0);
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '0';
                    data.kpi4.value = 'â‚¹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.membership_revenue ?? t.total_membership_revenue ?? t.total_amount ?? t.sales ?? t.total ?? t.sum;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('Distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.membership_name || s.category || s.item_type || s.plan_name || 'OTHER'), splitRes.data.map(s => Number(s.total_sales || s.revenue || s.total_revenue || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Plan Name', 'Duration', 'Price', 'Sold Count', 'Revenue Generated'];
                if (tRes.error) console.warn('Table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.date ? new Date(r.date).toLocaleString() : 'â€”';
                        const itemName = r.membership_name || r.plan_name || r.item_name || 'â€”';
                        const cat = r.membership_duration || r.duration_months || r.duration || r.category || 'â€”';
                        const price = formatCurrency(r.price || r.unit_price || 0);
                        const qty = Number(r.quantity || r.sold_count || 0).toLocaleString();
                        const total = formatCurrency(r.total_amount || r.revenue || 0);

                        return [
                            dateText,
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            `<span class="status-pill active" style="background:#f1f5f9; color:#475569;">${cat}</span>`,
                            price,
                            qty,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadMembershipRevenueData);
            loadMembershipRevenueData();
        });

}

async function renderSalesTopProducts(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadTopProductsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_top_products_summary', args),
                    supabase.rpc('get_top_products_trend', args),
                    supabase.rpc('get_top_products_distribution', args),
                    supabase.rpc('get_top_products_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = row.top_product || row.top_product_name || 'â€”';
                        data.kpi2.value = formatCurrency(row.top_5_revenue || row.total_sales || 0);
                        data.kpi3.value = row.top_5_contribution !== undefined ? `${row.top_5_contribution}%` : 'â€”';
                        data.kpi4.value = row.best_seller || row.best_selling_product || 'â€”';
                    }
                } else {
                    data.kpi1.value = 'â€”';
                    data.kpi2.value = 'â‚¹0';
                    data.kpi3.value = 'â€”';
                    data.kpi4.value = 'â€”';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.sales ?? t.total ?? t.sum;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('Distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.product_name || s.category || s.item_type || 'OTHER'), splitRes.data.map(s => Number(s.total_sales || s.revenue || s.total_revenue || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Product Name', 'Category', 'Unit Price', 'Sold Count', 'Revenue Generated'];
                if (tRes.error) console.warn('Table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.date ? new Date(r.date).toLocaleString() : 'â€”';
                        const itemName = r.product_name || r.item_name || 'â€”';
                        const cat = r.category || 'â€”';
                        const price = formatCurrency(r.price || r.unit_price || 0);
                        const qty = Number(r.quantity || r.sold_count || 0).toLocaleString();
                        const total = formatCurrency(r.total_amount || r.revenue || 0);

                        return [
                            dateText,
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            `<span class="status-pill active" style="background:#f1f5f9; color:#475569;">${cat}</span>`,
                            price,
                            qty,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadTopProductsData);
            loadTopProductsData();
        });

}

async function renderSalesTopServices(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadTopServicesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            // Loading state
            data.kpi1.value = 'Loading...';
            data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...';
            data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';

            try {
                // Execute all queries in parallel
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
                const [sumRes, trendRes, splitRes, tRes] = await Promise.all([
                    supabase.rpc('get_top_services_summary', args),
                    supabase.rpc('get_top_services_trend', args),
                    supabase.rpc('get_top_services_distribution', args),
                    supabase.rpc('get_top_services_table', args)
                ]);
                
                // 1. KPI Summary
                if (sumRes.error) console.warn('KPI fetch error:', sumRes.error);
                const sumData = sumRes.data;
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = row.top_service_name || row.top_service || row.service_name || row.name || 'â€”';
                        data.kpi2.value = formatCurrency(row.top_service_revenue || row.total_revenue || row.revenue || row.total_sales || 0);
                        data.kpi3.value = formatCurrency(row.top_5_revenue || row.total_top_5_revenue || row.top5_revenue || 0);
                        data.kpi4.value = (row.top_5_contribution !== undefined && row.top_5_contribution !== null) ? `${row.top_5_contribution}%` : ((row.top_5_contribution_percent || row.top5_contribution) !== undefined ? `${(row.top_5_contribution_percent || row.top5_contribution)}%` : 'â€”');
                    }
                } else {
                    data.kpi1.value = 'â€”';
                    data.kpi2.value = 'â‚¹0';
                    data.kpi3.value = 'â‚¹0';
                    data.kpi4.value = 'â€”';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        const extractVal = (t) => {
                            const val = t.total_sales ?? t.revenue ?? t.total_revenue ?? t.amount ?? t.sales ?? t.total ?? t.sum ?? t.service_revenue ?? t.top_service_revenue;
                            if (val !== undefined && val !== null) return Number(val);
                            for (let key in t) if (key !== 'date') { const n = parseFloat(t[key]); if(!isNaN(n)) return n; }
                            return 0;
                        };
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), 
                            trendRes.data.map(t => extractVal(t))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                if (splitRes.error) console.warn('Distribution Error:', splitRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (splitRes.data && splitRes.data.length > 0) {
                        renderDistributionChart(splitRes.data.map(s => s.service_name || s.category || s.item_type || 'OTHER'), splitRes.data.map(s => Number(s.total_sales || s.revenue || s.total_revenue || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Service Name', 'Category', 'Duration', 'Times Booked', 'Revenue Generated'];
                if (tRes.error) console.warn('Table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const itemName = r.service_name || r.name || r.item_name || 'â€”';
                        const cat = r.category || r.service_category || 'â€”';
                        const duration = r.duration || r.service_duration || 'â€”';
                        const qty = Number(r.times_booked || r.total_bookings || r.bookings || r.quantity || 0).toLocaleString();
                        const total = formatCurrency(r.revenue_generated || r.total_revenue || r.total_amount || r.revenue || 0);

                        return [
                            `<strong style="color:#334155;">${itemName}</strong>`,
                            `<span class="status-pill active" style="background:#f1f5f9; color:#475569;">${cat}</span>`,
                            duration,
                            qty,
                            `<strong style="color:#10b981;">${total}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadTopServicesData);
            loadTopServicesData();
        });

}

const handlers = {
    'sales-total': renderSalesTotal,
    'sales-service-revenue': renderSalesServiceRevenue,
    'sales-product-sales': renderSalesProductSales,
    'sales-membership-revenue': renderSalesMembershipRevenue,
    'sales-top-products': renderSalesTopProducts,
    'sales-top-services': renderSalesTopServices
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
