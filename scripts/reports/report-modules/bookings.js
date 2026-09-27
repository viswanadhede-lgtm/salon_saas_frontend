// scripts/reports/report-modules/bookings.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderBookings(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR BOOKINGS ---
        const companyId = localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id');
        
        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            const { data: dbBookings, error } = await supabase
                .from('bookings')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .order('booking_date', { ascending: false });
            
            if (error) throw error;
            
            const bookingsList = dbBookings || [];
            
            // Calculate KPIs
            const totalBookings = bookingsList.length;
            const completed = bookingsList.filter(b => b.status === 'completed').length;
            const cancelled = bookingsList.filter(b => b.status === 'cancelled').length;
            const noShows = bookingsList.filter(b => ['no-show', 'no_show'].includes(b.status)).length;
            
            const formattedRows = bookingsList.map(b => {
                const dateDisplay = b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'Unknown';
                let timeDisplay = b.start_time || 'â€”';
                if (timeDisplay !== 'â€”') {
                    try {
                        const [hh, mm] = timeDisplay.split(':').map(Number);
                        const ampm = hh >= 12 ? 'PM' : 'AM';
                        const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
                        timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
                    } catch {}
                }
                
                const customer = b.customer_name || 'â€”';
                const service = b.service_name || 'â€”';
                const staff = b.staff_name || 'â€”';
                // Mock duration if not available natively
                const duration = b.duration || '45m';
                
                let statusHtml = '<span class="status-pill pending">Pending</span>';
                if (b.status === 'completed') statusHtml = '<span class="status-pill completed">Completed</span>';
                if (b.status === 'cancelled') statusHtml = '<span class="status-pill cancelled">Cancelled</span>';
                if (b.status === 'confirmed' || b.status === 'booked') statusHtml = '<span class="status-pill active">Confirmed</span>';
                if (b.status === 'no-show' || b.status === 'no_show') statusHtml = '<span class="status-pill cancelled" style="background:#fef3c7; color:#92400e;">No-Show</span>';

                return [dateDisplay, timeDisplay, customer, service, staff, duration, statusHtml];
            });
            
            // --- Trends Aggregation for Chart ---
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                last7Days.push(d.toISOString().split('T')[0]);
            }

            const dailyCounts = last7Days.map(dateStr => {
                return bookingsList.filter(b => b.booking_date === dateStr).length;
            });

            const labels = last7Days.map(dateStr => {
                const d = new Date(dateStr);
                return d.toLocaleDateString('en-US', { weekday: 'short' });
            });

            renderTrendChart(labels, dailyCounts);

            // Override KPIs
            data.kpi1.value = totalBookings.toString();
            data.kpi2.value = completed.toString();
            data.kpi3.value = cancelled.toString();
            data.kpi4.value = noShows.toString();

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading bookings report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderBkTotal(data, supabase) {
        // â”€â”€ LIVE: Total Appointments Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const companyId = localStorage.getItem('company_id');
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

        const loadBookingsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end   = filterEnd   ? filterEnd.value   : '2099-12-31';
            // Fall back to active branch when "All Branches" is selected (functions use strict = not IS NULL)
            const bid = (filterBranch && filterBranch.value !== 'all')
                ? filterBranch.value
                : localStorage.getItem('active_branch_id');

            // Loading state
            data.kpi1.value = 'Loading...'; data.kpi2.value = 'Loading...';
            data.kpi3.value = 'Loading...'; data.kpi4.value = 'Loading...';
            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            const tbody = document.getElementById('tableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = {
                    p_company_id: companyId,
                    p_branch_id:  bid,
                    p_start_date: start,
                    p_end_date:   end
                };
                const summaryArgs = {
                    p_company_id: companyId,
                    p_branch_id:  bid,
                    p_start_date: start,
                    p_end_date:   end
                };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_bookings_summary', summaryArgs),
                    supabase.rpc('get_bookings_trend', args),
                    supabase.rpc('get_bookings_status_distribution', args),
                    supabase.rpc('get_bookings_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_bookings_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.total_appointments || sumRow.total_bookings || 0).toLocaleString();
                    data.kpi2.value = Number(sumRow.completed          || 0).toLocaleString();
                    data.kpi3.value = Number(sumRow.cancelled          || 0).toLocaleString();
                    data.kpi4.value = Number(sumRow.no_shows || sumRow.no_show || sumRow.noshow || 0).toLocaleString();
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = '0';
                    data.kpi3.value = '0'; data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Bar Chart
                if (trendRes.error) console.warn('get_bookings_trend Error:', trendRes.error);
                console.log('[bk-total] trendRes.data:', trendRes.data);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.completed || 0) + Number(t.cancelled || 0) + Number(t.no_shows || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart - Status Distribution
                if (distRes.error) console.warn('get_bookings_status_distribution Error:', distRes.error);
                console.log('[bk-total] distRes.data:', distRes.data);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => {
                                const st = (s.status || 'unknown').replace('_', '-');
                                return st.charAt(0).toUpperCase() + st.slice(1);
                            }),
                            distRes.data.map(s => Number(s.count || s.total || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Status', 'Amount'];
                if (tRes.error) console.warn('get_bookings_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const statusStyles = {
                        'completed': 'background:#dcfce7;color:#166534;',
                        'confirmed': 'background:#dbeafe;color:#1e40af;',
                        'booked':    'background:#e0e7ff;color:#3730a3;',
                        'cancelled': 'background:#fee2e2;color:#991b1b;',
                        'no-show':   'background:#fef3c7;color:#92400e;',
                        'no_show':   'background:#fef3c7;color:#92400e;'
                    };
                    const tRows = tRes.data.map(r => {
                        const dateText = r.booking_date
                            ? new Date(r.booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';
                        const timeText  = r.start_time ? r.start_time.slice(0, 5) : 'â€”';
                        const customer  = r.customer_name || 'â€”';
                        const service   = r.service_name  || 'â€”';
                        const staff     = r.staff_name    || 'â€”';
                        const stKey     = (r.status || 'booked').toLowerCase().replace('_', '-');
                        const stStyle   = statusStyles[stKey] || '';
                        const statusHtml = `<span class="status-pill" style="${stStyle}">${stKey.charAt(0).toUpperCase() + stKey.slice(1)}</span>`;
                        const amount    = r.total_price != null
                            ? formatCurrency(r.total_price)
                            : (r.price != null ? formatCurrency(r.price) : 'â€”');

                        return [dateText, timeText, customer, service, staff, statusHtml, amount];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadBookingsData:', err);
                if (typeof renderTrendChart === 'function')       renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadBookingsData);
            loadBookingsData();
        });

}

async function renderBkCompleted(data, supabase) {
        // â”€â”€ LIVE: Completed Appointments Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        const loadCompletedData = async () => {
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
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_completed_bookings_summary', args),
                    supabase.rpc('get_completed_bookings_trend', args),
                    supabase.rpc('get_completed_distribution', args),
                    supabase.rpc('get_completed_bookings_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_completed_bookings_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.completed        || 0).toLocaleString();
                    data.kpi2.value = Number(sumRow.this_month       || 0).toLocaleString();
                    data.kpi3.value = Number(sumRow.this_week        || 0).toLocaleString();
                    data.kpi4.value = (Number(sumRow.completion_rate || 0).toFixed(1)) + '%';
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = '0';
                    data.kpi3.value = '0'; data.kpi4.value = '0%';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Bar Chart â€” x: booking_date, y: completed count
                if (trendRes.error) console.warn('get_completed_bookings_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.completed || t.count || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” label: 'completed'/'not_completed', count
                if (distRes.error) console.warn('get_completed_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => {
                                const lbl = (s.label || s.status || 'unknown').replace('_', ' ');
                                return lbl.charAt(0).toUpperCase() + lbl.slice(1);
                            }),
                            distRes.data.map(s => Number(s.count || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                // Columns: booking_date, booking_time, customer_name, service_name, staff_name, duration, amount
                data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Duration', 'Amount'];
                if (tRes.error) console.warn('get_completed_bookings_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.booking_date
                            ? new Date(r.booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';
                        const timeText   = r.booking_time || (r.start_time ? r.start_time.slice(0, 5) : 'â€”');
                        const customer   = r.customer_name || 'â€”';
                        const service    = r.service_name  || 'â€”';
                        const staff      = r.staff_name    || 'â€”';
                        const duration   = r.duration      || 'N/A';
                        const amount     = r.amount != null ? formatCurrency(r.amount)
                                         : r.total_price != null ? formatCurrency(r.total_price) : 'â€”';

                        return [
                            dateText,
                            timeText,
                            customer,
                            service,
                            staff,
                            `<span style="color:#64748b; font-size:0.875rem;">${duration}</span>`,
                            `<strong style="color:#10b981;">${amount}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadCompletedData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadCompletedData);
            loadCompletedData();
        });

}

async function renderBkCancelled(data, supabase) {
        // â”€â”€ LIVE: Cancelled Appointments Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        const loadCancelledData = async () => {
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
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_cancelled_bookings_summary', args),
                    supabase.rpc('get_cancelled_bookings_trend', args),
                    supabase.rpc('get_cancelled_distribution', args),
                    supabase.rpc('get_cancelled_bookings_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_cancelled_bookings_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.cancelled         || 0).toLocaleString();
                    data.kpi2.value = Number(sumRow.this_month        || 0).toLocaleString();
                    data.kpi3.value = Number(sumRow.this_week         || 0).toLocaleString();
                    data.kpi4.value = (Number(sumRow.cancellation_rate || 0).toFixed(1)) + '%';
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = '0';
                    data.kpi3.value = '0'; data.kpi4.value = '0%';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Bar Chart â€” x: booking_date, y: cancelled count
                if (trendRes.error) console.warn('get_cancelled_bookings_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.cancelled || t.count || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” label: 'Cancelled'/'Active', count
                if (distRes.error) console.warn('get_cancelled_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.label || s.status || 'Unknown'),
                            distRes.data.map(s => Number(s.count || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                // Columns: booking_date, customer_name, service_name, staff_name, total_price, status
                data.headers = ['Date', 'Customer', 'Service', 'Staff', 'Amount', 'Status'];
                if (tRes.error) console.warn('get_cancelled_bookings_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.booking_date
                            ? new Date(r.booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';
                        const customer = r.customer_name || 'â€”';
                        const service  = r.service_name  || 'â€”';
                        const staff    = r.staff_name    || 'â€”';
                        const amount   = r.total_price != null ? formatCurrency(r.total_price) : 'â€”';
                        const statusHtml = `<span class="status-pill" style="background:#fee2e2;color:#991b1b;">Cancelled</span>`;

                        return [dateText, customer, service, staff, amount, statusHtml];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadCancelledData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadCancelledData);
            loadCancelledData();
        });

}

async function renderBkNoShows(data, supabase) {
        // â”€â”€ LIVE: No-Shows Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        const loadNoShowData = async () => {
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
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading data...</td></tr>';

            try {
                const args = { p_company_id: companyId, p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };

                const [sumRes, trendRes, distRes, tRes] = await Promise.all([
                    supabase.rpc('get_no_show_summary', args),
                    supabase.rpc('get_no_show_trend', args),
                    supabase.rpc('get_no_show_distribution', args),
                    supabase.rpc('get_no_show_table', args)
                ]);

                // 1. KPI Cards
                if (sumRes.error) console.warn('get_no_show_summary Error:', sumRes.error);
                const sumRow = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
                if (sumRow) {
                    data.kpi1.value = Number(sumRow.no_shows     || 0).toLocaleString();
                    data.kpi2.value = Number(sumRow.this_month   || 0).toLocaleString();
                    data.kpi3.value = Number(sumRow.this_week    || 0).toLocaleString();
                    data.kpi4.value = (Number(sumRow.no_show_rate || 0).toFixed(1)) + '%';
                } else {
                    data.kpi1.value = '0'; data.kpi2.value = '0';
                    data.kpi3.value = '0'; data.kpi4.value = '0%';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Bar Chart â€” x: booking_date, y: no_shows count
                if (trendRes.error) console.warn('get_no_show_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(
                            trendRes.data.map(t => new Date(t.booking_date || t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                            trendRes.data.map(t => Number(t.no_shows || t.count || 0))
                        );
                    } else renderTrendChart([], []);
                }

                // 3. Donut Chart â€” label: 'No-Show'/'Attended', count
                if (distRes.error) console.warn('get_no_show_distribution Error:', distRes.error);
                if (typeof renderDistributionChart === 'function') {
                    if (distRes.data && distRes.data.length > 0) {
                        renderDistributionChart(
                            distRes.data.map(s => s.label || s.status || 'Unknown'),
                            distRes.data.map(s => Number(s.count || 0))
                        );
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                // Columns: booking_date, booking_time, customer_name, service_name, staff_name, total_price, status
                data.headers = ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount Lost', 'Status'];
                if (tRes.error) console.warn('get_no_show_table Error:', tRes.error);
                if (tRes.data && tRes.data.length > 0) {
                    const tRows = tRes.data.map(r => {
                        const dateText = r.booking_date
                            ? new Date(r.booking_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                            : 'â€”';
                        const timeText   = r.booking_time || (r.start_time ? r.start_time.slice(0, 5) : 'â€”');
                        const customer   = r.customer_name || 'â€”';
                        const service    = r.service_name  || 'â€”';
                        const staff      = r.staff_name    || 'â€”';
                        const amountLost = r.total_price != null ? formatCurrency(r.total_price) : 'â€”';
                        const statusHtml = `<span class="status-pill" style="background:#fef3c7;color:#92400e;">No-Show</span>`;

                        return [dateText, timeText, customer, service, staff,
                            `<strong style="color:#f59e0b;">${amountLost}</strong>`,
                            statusHtml
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }

            } catch (err) {
                console.error('Critical exception in loadNoShowData:', err);
                if (typeof renderTrendChart === 'function')        renderTrendChart([], []);
                if (typeof renderDistributionChart === 'function') renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadNoShowData);
            loadNoShowData();
        });

}

const handlers = {
    'bookings': renderBookings,
    'bk-total': renderBkTotal,
    'bk-completed': renderBkCompleted,
    'bk-cancelled': renderBkCancelled,
    'bk-no-shows': renderBkNoShows
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
