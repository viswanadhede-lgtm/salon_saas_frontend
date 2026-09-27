// scripts/reports/report-modules/operations.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderStaff(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR STAFF ---
        const companyId = localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id');
        
        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            const { data: dbStaff, error } = await supabase
                .from('staff')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted');
            
            if (error) throw error;
            
            const staffList = dbStaff || [];
            
            // Calculate KPIs
            const activeStaff = staffList.filter(s => s.status === 'active').length;
            
            const formattedRows = staffList.map(s => {
                const name = s.staff_name || s.name || 'Unknown';
                const role = s.role_name || s.role || 'Unassigned';
                const statusHtml = s.status === 'active' ? '<span class="status-pill active">Active</span>' :
                                   s.status === 'on-leave' ? '<span class="status-pill pending">On Leave</span>' :
                                   '<span class="status-pill cancelled">Inactive</span>';
                
                // Mocks for analytical data not stored in the core staff schema
                // In a production app, these would come from an SQL aggregation view or join query.
                const appointments = s.appointments || Math.floor(Math.random() * 50) + 10;
                const hours = s.total_hours || (Math.floor(Math.random() * 40) + 40) + 'h';
                const rev = s.revenue ? formatCurrency(s.revenue) : formatCurrency(Math.floor(Math.random() * 40000) + 10000);
                const rating = s.rating || (4 + Math.random()).toFixed(1) + '/5';

                return [name, role, statusHtml, appointments, hours, rev, rating];
            });
            
            // Override KPI 1
            data.kpi1.value = activeStaff.toString();
            // Top Performer logic mockup
            if (staffList.length > 0) {
                data.kpi3.value = staffList[0].staff_name || staffList[0].name || 'Sarah M.';
            }

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading staff report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderServices(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR SERVICE PERFORMANCE ---
        const companyId = localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch both services and bookings in parallel
            const [svcRes, bkRes] = await Promise.all([
                supabase
                    .from('services')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .order('service_name', { ascending: true }),
                supabase
                    .from('bookings')
                    .select('service_name, price, status')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
            ]);

            if (svcRes.error) throw svcRes.error;

            const servicesList = (svcRes.data || []).filter(s =>
                s.status && s.status.toLowerCase() !== 'deleted'
            );
            const bookingsList = bkRes.data || [];

            // Build a lookup: service_name -> { timesBooked, revenue }
            const bookingStats = {};
            bookingsList.forEach(b => {
                const key = (b.service_name || '').toLowerCase();
                if (!key) return;
                if (!bookingStats[key]) bookingStats[key] = { timesBooked: 0, revenue: 0 };
                bookingStats[key].timesBooked++;
                if (b.status === 'completed') {
                    bookingStats[key].revenue += Number(b.price || 0);
                }
            });

            // KPI calculations
            const activeServices = servicesList.filter(s => s.status === 'active').length;
            let totalRevenue = 0;
            let totalBookingsCount = 0;
            let topService = { name: 'â€”', count: 0 };

            servicesList.forEach(s => {
                const key = (s.service_name || '').toLowerCase();
                const stats = bookingStats[key] || { timesBooked: 0, revenue: 0 };
                totalRevenue += stats.revenue;
                totalBookingsCount += stats.timesBooked;
                if (stats.timesBooked > topService.count) {
                    topService = { name: s.service_name, count: stats.timesBooked };
                }
            });

            // Calculate avg duration in minutes
            const avgDuration = servicesList.length > 0
                ? Math.round(servicesList.reduce((sum, s) => sum + (Number(s.duration) || 0), 0) / servicesList.length)
                : 0;

            const formattedRows = servicesList.map(s => {
                const key = (s.service_name || '').toLowerCase();
                const stats = bookingStats[key] || { timesBooked: 0, revenue: 0 };

                const name = s.service_name || 'â€”';
                const category = s.category_name || 'â€”';
                const duration = s.duration ? `${s.duration}m` : 'â€”';
                const price = s.price != null ? formatCurrency(s.price) : 'â€”';
                const timesBooked = stats.timesBooked;
                const revenue = formatCurrency(stats.revenue);

                const statusHtml = s.status === 'active'
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';

                return [name, category, duration, price, timesBooked, revenue, statusHtml];
            });

            // Update headers to match columns we are rendering
            data.headers = ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue Generated', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Services';
            data.kpi1.value = activeServices.toString();
            data.kpi2.label = 'Total Bookings';
            data.kpi2.value = totalBookingsCount.toString();
            data.kpi3.label = 'Top Service';
            data.kpi3.value = topService.name;
            data.kpi4.label = 'Avg Duration';
            data.kpi4.value = avgDuration ? `${avgDuration}m` : 'â€”';

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading services report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderBranch(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR BRANCH PERFORMANCE ---
        const companyId = localStorage.getItem('company_id');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch all branches, bookings, and staff in parallel (company-wide, not filtered by branch)
            const [branchRes, bookingRes, staffRes] = await Promise.all([
                supabase
                    .from('branches')
                    .select('branch_id, branch_name, branch_address, branch_phone, status')
                    .eq('company_id', companyId)
                    .neq('status', 'deleted'),
                supabase
                    .from('bookings')
                    .select('branch_id, price, status')
                    .eq('company_id', companyId),
                supabase
                    .from('staff')
                    .select('branch_id, status')
                    .eq('company_id', companyId)
                    .neq('status', 'deleted')
            ]);

            if (branchRes.error) throw branchRes.error;

            const branchesList = branchRes.data || [];
            const bookingsList = bookingRes.data || [];
            const staffList    = staffRes.data || [];

            // Build per-branch stats
            const branchStats = {};
            branchesList.forEach(b => {
                branchStats[b.branch_id] = { bookings: 0, revenue: 0, staff: 0 };
            });

            bookingsList.forEach(b => {
                if (!branchStats[b.branch_id]) return;
                branchStats[b.branch_id].bookings++;
                if (b.status === 'completed') {
                    branchStats[b.branch_id].revenue += Number(b.price || 0);
                }
            });

            staffList.forEach(s => {
                if (!branchStats[s.branch_id]) return;
                branchStats[s.branch_id].staff++;
            });

            // KPIs
            const activeBranches = branchesList.filter(b => b.status === 'active').length;
            const totalVisits = bookingsList.length;
            let totalRevenue = 0;
            let topBranch = { name: 'â€”', bookings: 0 };

            branchesList.forEach(b => {
                const stats = branchStats[b.branch_id];
                totalRevenue += stats.revenue;
                if (stats.bookings > topBranch.bookings) {
                    topBranch = { name: b.branch_name, bookings: stats.bookings };
                }
            });

            const formattedRows = branchesList.map(b => {
                const stats = branchStats[b.branch_id];
                const name    = b.branch_name || 'â€”';
                const address = b.branch_address || 'â€”';
                const phone   = b.branch_phone || 'â€”';
                const staff   = stats.staff;
                const visits  = stats.bookings;
                const revenue = formatCurrency(stats.revenue);
                const statusHtml = b.status === 'active'
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';

                return [name, address, phone, staff, visits, revenue, statusHtml];
            });

            // Update headers
            data.headers = ['Branch Name', 'Address', 'Phone', 'Staff Count', 'Total Visits', 'Revenue', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Branches';
            data.kpi1.value = activeBranches.toString();
            data.kpi2.label = 'Total Visits';
            data.kpi2.value = totalVisits.toString();
            data.kpi3.label = 'Top Branch';
            data.kpi3.value = topBranch.name;
            data.kpi4.label = 'Total Revenue';
            data.kpi4.value = formatCurrency(totalRevenue);

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading branch report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderOpsStaff(data, supabase) {
        // â”€â”€ LIVE: Staff Performance Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        const loadStaffData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
            const bid   = (filterBranch && filterBranch.value !== 'all')
                ? filterBranch.value
                : localStorage.getItem('active_branch_id');

            data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_staff_performance_summary', args),
                    supabase.rpc('get_staff_performance_trend', args),
                    supabase.rpc('get_staff_performance_distribution', args),
                    supabase.rpc('get_staff_performance_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_staff_performance_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.total_bookings         || 0).toLocaleString();
                    data.kpi2.value = sumRow.total_revenue         != null ? formatCurrency(sumRow.total_revenue)         : 'â€”';
                    data.kpi3.value = sumRow.avg_bookings_per_staff != null ? Number(sumRow.avg_bookings_per_staff).toFixed(1) : 'â€”';
                    data.kpi4.value = sumRow.avg_revenue_per_staff  != null ? formatCurrency(sumRow.avg_revenue_per_staff)  : 'â€”';
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = 'â€”';
                    data.kpi3.value = 'â€”'; data.kpi4.value = 'â€”';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart â€” daily bookings
                if (trendRes.error) console.warn('get_staff_performance_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.bookings || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” revenue share per staff
                if (distRes.error) console.warn('get_staff_performance_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.staff_name || 'Unknown'),
                            distRes.data.map(s => Number(s.revenue || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table â€” 8 columns
                data.headers = ['Staff Name', 'Total Bookings', 'Completed', 'Completion Rate', 'Revenue', 'Avg / Booking', 'Last Booking', 'Status'];
                if (tRes.error) console.warn('get_staff_performance_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const name       = r.staff_name    || 'â€”';
                        const totalBk    = Number(r.total_bookings     || 0).toLocaleString();
                        const completed  = Number(r.completed_services || 0).toLocaleString();
                        const rate       = r.completion_rate != null ? Number(r.completion_rate).toFixed(1) + '%' : 'â€”';
                        const revenue    = r.total_revenue  != null ? formatCurrency(r.total_revenue)  : 'â€”';
                        const avgBk      = r.avg_revenue_per_booking != null ? formatCurrency(r.avg_revenue_per_booking) : 'â€”';
                        const lastBk     = r.last_booking_date
                            ? new Date(r.last_booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';

                        const rateColor  = Number(r.completion_rate) >= 75 ? '#10b981' : Number(r.completion_rate) >= 50 ? '#f59e0b' : '#ef4444';
                        const statusStyle = r.status === 'Active'
                            ? 'background:#dcfce7;color:#166534;'
                            : 'background:#f1f5f9;color:#64748b;';

                        return [
                            `<strong>${name}</strong>`,
                            totalBk,
                            completed,
                            `<span style="color:${rateColor};font-weight:600;">${rate}</span>`,
                            `<strong style="color:#10b981;">${revenue}</strong>`,
                            avgBk,
                            lastBk,
                            `<span class="status-pill" style="${statusStyle}">${r.status || 'â€”'}</span>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadStaffData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadStaffData);
            loadStaffData();
        });

}

async function renderOpsBranch(data, supabase) {
        // â”€â”€ LIVE: Branch Performance Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Company-wide: no branch filter â€” always compares ALL branches
        const companyId   = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd   = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply    = document.getElementById('btnApplyFilters');

        // Hide branch filter â€” not applicable for cross-branch comparison
        if (filterBranch) {
            const branchWrapper = filterBranch.closest('.filter-group') || filterBranch.parentElement;
            if (branchWrapper) branchWrapper.style.display = 'none';
        }

        const now      = new Date();
        const today    = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value)   filterEnd.value   = today.toISOString().split('T')[0];
        }

        const loadBranchData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end   = filterEnd   ? filterEnd.value   : '2099-12-31';

            data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_branch_performance_summary', args),
                    supabase.rpc('get_branch_performance_trend', args),
                    supabase.rpc('get_branch_performance_distribution', args),
                    supabase.rpc('get_branch_performance_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_branch_performance_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.total_branches         || 0).toLocaleString();
                    data.kpi2.value = sumRow.total_revenue          != null ? formatCurrency(sumRow.total_revenue)          : 'â€”';
                    data.kpi3.value = sumRow.top_branch             || 'â€”';
                    data.kpi4.value = sumRow.avg_revenue_per_branch  != null ? formatCurrency(sumRow.avg_revenue_per_branch)  : 'â€”';
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = 'â€”';
                    data.kpi3.value = 'â€”'; data.kpi4.value = 'â€”';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart â€” daily bookings across all branches
                if (trendRes.error) console.warn('get_branch_performance_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.bookings || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” revenue per branch
                if (distRes.error) console.warn('get_branch_performance_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.branch_name || 'Unknown'),
                            distRes.data.map(s => Number(s.revenue || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table â€” 11 columns
                data.headers = ['Branch', 'Active Staff', 'Bookings', 'Completed', 'Cancelled', 'No-Shows', 'Revenue', 'Expenses', 'Net Revenue', 'Completion Rate', 'Status'];
                if (tRes.error) console.warn('get_branch_performance_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const name       = r.branch_name    || 'â€”';
                        const staff      = Number(r.active_staff    || 0).toLocaleString();
                        const totalBk    = Number(r.total_bookings  || 0).toLocaleString();
                        const completed  = Number(r.completed       || 0).toLocaleString();
                        const cancelled  = Number(r.cancelled       || 0).toLocaleString();
                        const noShows    = Number(r.no_shows        || 0).toLocaleString();
                        const revenue    = r.total_revenue   != null ? formatCurrency(r.total_revenue)   : 'â€”';
                        const expenses   = r.total_expenses  != null ? formatCurrency(r.total_expenses)  : 'â€”';
                        const netRev     = r.net_revenue     != null ? r.net_revenue : 0;
                        const netColor   = netRev >= 0 ? '#10b981' : '#ef4444';
                        const netHtml    = `<strong style="color:${netColor};">${formatCurrency(netRev)}</strong>`;
                        const rate       = r.completion_rate != null ? Number(r.completion_rate).toFixed(1) + '%' : 'â€”';
                        const rateColor  = Number(r.completion_rate) >= 75 ? '#10b981' : Number(r.completion_rate) >= 50 ? '#f59e0b' : '#ef4444';

                        const statusStyle = r.status === 'Active'
                            ? 'background:#dcfce7;color:#166534;'
                            : 'background:#f1f5f9;color:#64748b;';

                        return [
                            `<strong>${name}</strong>`,
                            staff,
                            totalBk,
                            `<span style="color:#10b981;">${completed}</span>`,
                            `<span style="color:#ef4444;">${cancelled}</span>`,
                            `<span style="color:#f59e0b;">${noShows}</span>`,
                            `<strong style="color:#10b981;">${revenue}</strong>`,
                            `<span style="color:#ef4444;">${expenses}</span>`,
                            netHtml,
                            `<span style="color:${rateColor};font-weight:600;">${rate}</span>`,
                            `<span class="status-pill" style="${statusStyle}">${r.status || 'â€”'}</span>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadBranchData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        if (btnApply) btnApply.addEventListener('click', loadBranchData);
        loadBranchData();

}

const handlers = {
    'staff': renderStaff,
    'services': renderServices,
    'branch': renderBranch,
    'ops-staff': renderOpsStaff,
    'ops-branch': renderOpsBranch
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
