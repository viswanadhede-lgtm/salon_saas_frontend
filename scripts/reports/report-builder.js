// scripts/reports/report-builder.js
// Handles dynamic UI loading for report-detail.html based on the '?type=' query string

import { supabase } from '../../lib/supabase.js';

const REPORT_TYPES = {
    financial: {
        title: 'Financial Reports',
        subtitle: 'Revenue, payments, and discounts analysis',
        icon: 'dollar-sign',
        kpi1: { label: 'Total Revenue', value: '₹2,82,900' },
        kpi2: { label: 'Total Transactions', value: '2,142' },
        kpi3: { label: 'Average Ticket', value: '₹1,320' },
        kpi4: { label: 'Total Discounts', value: '₹12,450' },
        tableTitle: 'Detailed Records',
        headers: ['Date', 'Transaction Type', 'Description', 'Category', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Payment', 'Haircut & Styling', 'Service', 'Card', '₹1,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Payment', 'Skin Care Kit', 'Product', 'Cash', '₹850', '<span class="status-pill completed">Completed</span>']
        ]
    },
    bookings: {
        title: 'Bookings & Appointments',
        subtitle: 'Schedule utilization and appointment status',
        icon: 'calendar',
        kpi1: { label: 'Total Bookings', value: '1,245' },
        kpi2: { label: 'Completed', value: '1,120' },
        kpi3: { label: 'Cancellations', value: '85' },
        kpi4: { label: 'No-Shows', value: '40' },
        tableTitle: 'Booking History',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Duration', 'Status'],
        rows: [
            ['2024-03-21', '10:00 AM', 'Anita Sharma', 'Bridal Makeup', 'Sarah', '2h', '<span class="status-pill confirmed">Confirmed</span>'],
            ['2024-03-21', '12:30 PM', 'Raj Patel', 'Haircut', 'Michael', '45m', '<span class="status-pill pending">Pending</span>']
        ]
    },
    customers: {
        title: 'Customer Analytics',
        subtitle: 'Retention, acquisition, and feedback',
        icon: 'users',
        kpi1: { label: 'Total Customers', value: 'Loading...' },
        kpi2: { label: 'New This Month', value: 'Loading...' },
        kpi3: { label: 'Total Value', value: 'Loading...' },
        kpi4: { label: 'Avg Bookings', value: 'Loading...' },
        tableTitle: 'Customer Registry',
        headers: ['Joined Date', 'Customer Name', 'Phone', 'Total Visits', 'Total Spend', 'Last Visit', 'Status'],
        rows: [] // Will map dynamically via supabase
    },
    services: {
        title: 'Service Performance',
        subtitle: 'Most popular and profitable services',
        icon: 'scissors',
        kpi1: { label: 'Top Service', value: 'Haircut' },
        kpi2: { label: 'Services Performed', value: '4,210' },
        kpi3: { label: 'Service Revenue', value: '₹4,12,000' },
        kpi4: { label: 'Avg Duration', value: '45m' },
        tableTitle: 'Service Metrics',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue generated', 'Trend'],
        rows: [
            ['Women\'s Haircut', 'Hair', '45m', '₹600', '420', '₹2,52,000', '<span style="color:var(--emerald);">+12%</span>'],
            ['Basic Facial', 'Skin', '60m', '₹1200', '150', '₹1,80,000', '<span style="color:var(--emerald);">+5%</span>']
        ]
    },
    products: {
        title: 'Inventory & Products',
        subtitle: 'Retail sales and stock levels',
        icon: 'package',
        kpi1: { label: 'Products Sold', value: '520' },
        kpi2: { label: 'Retail Revenue', value: '₹1,24,000' },
        kpi3: { label: 'Low Stock Items', value: '12' },
        kpi4: { label: 'Inventory Value', value: '₹48,000' },
        tableTitle: 'Inventory Log',
        headers: ['Product Name', 'Brand', 'Category', 'Stock Level', 'Price', 'Units Sold', 'Status'],
        rows: [
            ['Argan Oil Serum', 'Moroccanoil', 'Hair Care', '24', '₹1,500', '42', '<span class="status-pill completed">In Stock</span>'],
            ['Volumizing Shampoo', 'Loreal', 'Hair Care', '3', '₹800', '115', '<span class="status-pill pending">Low Stock</span>']
        ]
    },
    staff: {
        title: 'Staff & Attendance',
        subtitle: 'Employee performance and working hours',
        icon: 'user-check',
        kpi1: { label: 'Active Staff', value: '18' },
        kpi2: { label: 'Total Hours', value: '2,840' },
        kpi3: { label: 'Top Performer', value: 'Sarah M.' },
        kpi4: { label: 'Commission', value: '₹42,000' },
        tableTitle: 'Staff Directory',
        headers: ['Staff Name', 'Role', 'Status', 'Appointments', 'Total Hours', 'Revenue', 'Rating'],
        rows: [
            ['Sarah M.', 'Senior Stylist', '<span class="status-pill active">Active</span>', '124', '160h', '₹85,000', '4.9/5'],
            ['Michael', 'Barber', '<span class="status-pill active">Active</span>', '98', '140h', '₹42,000', '4.7/5']
        ]
    },
    branch: {
        title: 'Branch Performance',
        subtitle: 'Multi-location comparative analysis',
        icon: 'map-pin',
        kpi1: { label: 'Active Branches', value: '3' },
        kpi2: { label: 'Top Branch', value: 'Downtown' },
        kpi3: { label: 'Total Visits', value: '4,210' },
        kpi4: { label: 'Growth YoY', value: '+14%' },
        tableTitle: 'Branch Overview',
        headers: ['Branch Name', 'Manager', 'Staff Count', 'Monthly Visitors', 'Monthly Revenue', 'Growth', 'Status'],
        rows: [
            ['Downtown HQ', 'Ravi K.', '12', '1,840', '₹4,50,000', '+18%', '<span class="status-pill active">Active</span>'],
            ['Indiranagar', 'Priya S.', '8', '950', '₹2,10,000', '+5%', '<span class="status-pill active">Active</span>']
        ]
    },
    marketing: {
        title: 'Marketing ROI',
        subtitle: 'Campaign performance and conversion rates',
        icon: 'trending-up',
        kpi1: { label: 'Active Campaigns', value: '4' },
        kpi2: { label: 'Total Reach', value: '12,400' },
        kpi3: { label: 'Conversions', value: '840' },
        kpi4: { label: 'ROI', value: '340%' },
        tableTitle: 'Campaign Tracking',
        headers: ['Campaign Name', 'Platform', 'Start Date', 'End Date', 'Spend', 'Conversions', 'Status'],
        rows: [
            ['Summer Special', 'Instagram', '2024-03-01', '2024-03-31', '₹5,000', '142', '<span class="status-pill active">Running</span>'],
            ['Bridal Season', 'Facebook', '2024-01-15', '2024-02-15', '₹12,000', '310', '<span class="status-pill completed">Completed</span>']
        ]
    },
    membership: {
        title: 'Memberships',
        subtitle: 'Active plans and recurring revenue',
        icon: 'award',
        kpi1: { label: 'Active Members', value: '420' },
        kpi2: { label: 'Monthly MRR', value: '₹1,45,000' },
        kpi3: { label: 'Churn Rate', value: '2.4%' },
        kpi4: { label: 'LTV', value: '₹4,800' },
        tableTitle: 'Membership Logs',
        headers: ['Member Name', 'Tier', 'Join Date', 'Renewal Date', 'Monthly Fee', 'Total Value', 'Status'],
        rows: [
            ['Arjun Reddy', 'Gold Tier', '2023-08-01', '2024-08-01', '₹999', '₹8,000', '<span class="status-pill active">Active</span>'],
            ['Neha Gupta', 'Silver Tier', '2024-01-10', '2024-07-10', '₹499', '₹1,500', '<span class="status-pill active">Active</span>']
        ]
    },
    expenses: {
        title: 'Expenses Report',
        subtitle: 'Track and analyse all business expenditures',
        icon: 'credit-card',
        kpi1: { label: 'Total Expenses', value: 'Loading...' },
        kpi2: { label: 'This Month', value: 'Loading...' },
        kpi3: { label: 'Top Category', value: 'Loading...' },
        kpi4: { label: 'Avg per Entry', value: 'Loading...' },
        tableTitle: 'Expense Records',
        headers: ['Date', 'Category', 'Amount', 'Notes', 'Added By'],
        rows: []
    }
};

function formatCurrency(num) {
    if (isNaN(num)) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get current tracking parameters
    const urlParams = new URLSearchParams(window.location.search);
    let type = urlParams.get('type') || 'financial';
    
    // Normalize fallback
    if (!REPORT_TYPES[type]) {
        type = 'financial';
    }
    
    const data = REPORT_TYPES[type];
    console.log(`[report-builder] Initializing ${type} report views.`);
    
    // 2. Update page header elements dynamically
    const titleEl = document.getElementById('reportTitle');
    const subtitleEl = document.getElementById('reportSubtitle');
    const rightChartTitleEl = document.getElementById('rightChartTitle');
    
    if (titleEl) titleEl.textContent = data.title;
    if (subtitleEl) subtitleEl.textContent = data.subtitle;
    if (rightChartTitleEl) rightChartTitleEl.textContent = 'Distribution';
    
    // 3. Prepare to update DOM
    const updateKPIs = (k1, k2, k3, k4) => {
        const lbl1 = document.getElementById('kpiLabel1'); const val1 = document.getElementById('kpiValue1');
        if (lbl1 && val1) { lbl1.textContent = k1.label; val1.textContent = k1.value; }

        const lbl2 = document.getElementById('kpiLabel2'); const val2 = document.getElementById('kpiValue2');
        if (lbl2 && val2) { lbl2.textContent = k2.label; val2.textContent = k2.value; }

        const lbl3 = document.getElementById('kpiLabel3'); const val3 = document.getElementById('kpiValue3');
        if (lbl3 && val3) { lbl3.textContent = k3.label; val3.textContent = k3.value; }

        const lbl4 = document.getElementById('kpiLabel4'); const val4 = document.getElementById('kpiValue4');
        if (lbl4 && val4) { lbl4.textContent = k4.label; val4.textContent = k4.value; }
    };
    
    const updateTable = (headers, rows) => {
        const tableContainer = document.querySelector('.data-table-container');
        if (!tableContainer) return;
        
        const tableHeaderTitle = tableContainer.querySelector('.table-header h2');
        if (tableHeaderTitle) tableHeaderTitle.textContent = data.tableTitle || 'Detailed Records';

        const theadRow = document.querySelector('#tableHead tr');
        const tbody = document.getElementById('tableBody');

        if (theadRow && tbody) {
            theadRow.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
            if (rows && rows.length > 0) {
                tbody.innerHTML = rows.map(row => 
                    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
                ).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align: center; padding: 2rem;">No data available for this report.</td></tr>`;
            }
        }
    };

    // 4. Initial layout render
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    
    if (type === 'customers') {
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
    } else if (type === 'staff') {
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
    } else if (type === 'bookings') {
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
                let timeDisplay = b.start_time || '—';
                if (timeDisplay !== '—') {
                    try {
                        const [hh, mm] = timeDisplay.split(':').map(Number);
                        const ampm = hh >= 12 ? 'PM' : 'AM';
                        const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
                        timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
                    } catch {}
                }
                
                const customer = b.customer_name || '—';
                const service = b.service_name || '—';
                const staff = b.staff_name || '—';
                // Mock duration if not available natively
                const duration = b.duration || '45m';
                
                let statusHtml = '<span class="status-pill pending">Pending</span>';
                if (b.status === 'completed') statusHtml = '<span class="status-pill completed">Completed</span>';
                if (b.status === 'cancelled') statusHtml = '<span class="status-pill cancelled">Cancelled</span>';
                if (b.status === 'confirmed' || b.status === 'booked') statusHtml = '<span class="status-pill active">Confirmed</span>';
                if (b.status === 'no-show' || b.status === 'no_show') statusHtml = '<span class="status-pill cancelled" style="background:#fef3c7; color:#92400e;">No-Show</span>';

                return [dateDisplay, timeDisplay, customer, service, staff, duration, statusHtml];
            });
            
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
    } else if (type === 'services') {
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
            let topService = { name: '—', count: 0 };

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

                const name = s.service_name || '—';
                const category = s.category_name || '—';
                const duration = s.duration ? `${s.duration}m` : '—';
                const price = s.price != null ? formatCurrency(s.price) : '—';
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
            data.kpi4.value = avgDuration ? `${avgDuration}m` : '—';

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading services report data:', err);
            updateTable(data.headers, []);
        }
    } else if (type === 'branch') {
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
            let topBranch = { name: '—', bookings: 0 };

            branchesList.forEach(b => {
                const stats = branchStats[b.branch_id];
                totalRevenue += stats.revenue;
                if (stats.bookings > topBranch.bookings) {
                    topBranch = { name: b.branch_name, bookings: stats.bookings };
                }
            });

            const formattedRows = branchesList.map(b => {
                const stats = branchStats[b.branch_id];
                const name    = b.branch_name || '—';
                const address = b.branch_address || '—';
                const phone   = b.branch_phone || '—';
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
    } else if (type === 'membership') {
        // --- LIVE SUPABASE INTEGRATION FOR MEMBERSHIPS ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch purchases and plans in parallel
            const [purchasesRes, plansRes] = await Promise.all([
                supabase
                    .from('membership_purchases')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .order('purchase_date', { ascending: false }),
                supabase
                    .from('memberships')
                    .select('membership_id, plan_name, price, duration_months, status')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
            ]);

            if (purchasesRes.error) throw purchasesRes.error;

            const purchases = purchasesRes.data || [];
            const plans     = plansRes.data  || [];

            // Deduplicate plans by membership_id (since the table has one row per service)
            const seenPlanIds = new Set();
            const uniquePlans = plans.filter(p => {
                if (seenPlanIds.has(p.membership_id)) return false;
                seenPlanIds.add(p.membership_id);
                return true;
            });

            // KPI calculations
            const now = new Date();
            const activeMembers   = purchases.filter(p => p.status === 'active').length;
            const cancelledCount  = purchases.filter(p => p.status === 'cancelled').length;
            const totalMRR        = purchases
                .filter(p => p.status === 'active')
                .reduce((sum, p) => sum + (Number(p.price || 0) / Math.max(Number(p.duration || 1), 1)), 0);
            const activePlansCount = uniquePlans.filter(p => p.status === 'active').length;

            // Format rows from membership_purchases
            const formattedRows = purchases.map(p => {
                const memberName   = p.customer_name || '—';
                const planName     = p.plan_name || p.membership_name || '—';
                const joinDate     = p.purchase_date  ? new Date(p.purchase_date).toLocaleDateString()  : '—';
                const renewalDate  = p.expiry_date    ? new Date(p.expiry_date).toLocaleDateString()    : '—';
                const monthlyFee   = p.duration && Number(p.duration) > 0
                    ? formatCurrency(Number(p.price || 0) / Number(p.duration))
                    : formatCurrency(p.price || 0);
                const totalValue   = formatCurrency(p.price || 0);

                let statusHtml = '<span class="status-pill pending">Expired</span>';
                if (p.status === 'active')    statusHtml = '<span class="status-pill active">Active</span>';
                if (p.status === 'cancelled') statusHtml = '<span class="status-pill cancelled">Cancelled</span>';

                return [memberName, planName, joinDate, renewalDate, monthlyFee, totalValue, statusHtml];
            });

            // Update headers
            data.headers = ['Member Name', 'Plan', 'Join Date', 'Renewal Date', 'Monthly Fee', 'Total Value', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Members';
            data.kpi1.value = activeMembers.toString();
            data.kpi2.label = 'Active Plans';
            data.kpi2.value = activePlansCount.toString();
            data.kpi3.label = 'Monthly MRR';
            data.kpi3.value = formatCurrency(Math.round(totalMRR));
            data.kpi4.label = 'Cancellations';
            data.kpi4.value = cancelledCount.toString();

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading membership report data:', err);
            updateTable(data.headers, []);
        }
    } else if (type === 'marketing') {
        // --- LIVE SUPABASE INTEGRATION FOR MARKETING (OFFERS + COUPONS) ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch offers and coupons in parallel
            const [offersRes, couponsRes] = await Promise.all([
                supabase
                    .from('offers')
                    .select('offer_id, offer_name, discount_type, discount_value, valid_from, valid_to, status, current_usage_count, total_usage_limit')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('coupons')
                    .select('coupon_id, coupon_code, discount_type, discount_value, valid_from, valid_to, status, current_usage_count, total_usage_limit')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
                    .order('created_at', { ascending: false })
            ]);

            // Deduplicate offers by offer_id (flattened table has one row per service)
            const seenOfferIds = new Set();
            const offers = (offersRes.data || []).filter(o => {
                if (seenOfferIds.has(o.offer_id)) return false;
                seenOfferIds.add(o.offer_id);
                return true;
            });
            const coupons = couponsRes.data || [];

            const now = new Date();

            // Helper to determine if an item is currently active
            const isCurrentlyActive = item => {
                if (item.status !== 'active') return false;
                if (item.valid_to && new Date(item.valid_to) < now) return false;
                return true;
            };

            // KPIs
            const activeOffers  = offers.filter(isCurrentlyActive).length;
            const activeCoupons = coupons.filter(isCurrentlyActive).length;
            const totalActive   = activeOffers + activeCoupons;
            const totalItems    = offers.length + coupons.length;

            const totalUsage = [
                ...offers.map(o  => Number(o.current_usage_count  || 0)),
                ...coupons.map(c => Number(c.current_usage_count || 0))
            ].reduce((sum, v) => sum + v, 0);

            // Build unified rows: offers + coupons together
            const offerRows = offers.map(o => {
                const name       = o.offer_name || '—';
                const type       = 'Offer';
                const discount   = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
                const startDate  = o.valid_from ? new Date(o.valid_from).toLocaleDateString() : 'Always';
                const endDate    = o.valid_to   ? new Date(o.valid_to).toLocaleDateString()   : 'No Expiry';
                const usage      = `${o.current_usage_count || 0} / ${o.total_usage_limit || '∞'}`;
                const statusHtml = isCurrentlyActive(o)
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';
                return [name, type, discount, startDate, endDate, usage, statusHtml];
            });

            const couponRows = coupons.map(c => {
                const name       = c.coupon_code || '—';
                const type       = 'Coupon';
                const discount   = c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`;
                const startDate  = c.valid_from ? new Date(c.valid_from).toLocaleDateString() : 'Always';
                const endDate    = c.valid_to   ? new Date(c.valid_to).toLocaleDateString()   : 'No Expiry';
                const usage      = `${c.current_usage_count || 0} / ${c.total_usage_limit || '∞'}`;
                const statusHtml = isCurrentlyActive(c)
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';
                return [name, type, discount, startDate, endDate, usage, statusHtml];
            });

            const formattedRows = [...offerRows, ...couponRows];

            // Update headers
            data.headers = ['Name / Code', 'Type', 'Discount', 'Start Date', 'End Date', 'Usage', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Promotions';
            data.kpi1.value = totalActive.toString();
            data.kpi2.label = 'Total Offers';
            data.kpi2.value = offers.length.toString();
            data.kpi3.label = 'Total Coupons';
            data.kpi3.value = coupons.length.toString();
            data.kpi4.label = 'Total Redemptions';
            data.kpi4.value = totalUsage.toString();

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading marketing report data:', err);
            updateTable(data.headers, []);
        }
    } else if (type === 'products') {
        // --- LIVE SUPABASE INTEGRATION FOR PRODUCTS (INVENTORY) ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            const { data: dbProducts, error } = await supabase
                .from('products')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .order('product_name', { ascending: true });

            if (error) throw error;

            const productsList = (dbProducts || []).filter(p =>
                (p.status || '').toLowerCase() !== 'deleted'
            );

            // KPI calculations
            const activeProducts  = productsList.filter(p => (p.status || '').toLowerCase() === 'active').length;
            const outOfStock      = productsList.filter(p => Number(p.stock_quantity || 0) === 0).length;
            const lowStock        = productsList.filter(p => {
                const qty = Number(p.stock_quantity || 0);
                return qty > 0 && qty <= 5;
            }).length;
            const totalStockValue = productsList.reduce((sum, p) =>
                sum + (Number(p.price || 0) * Number(p.stock_quantity || 0)), 0
            );

            const formattedRows = productsList.map(p => {
                const name     = p.product_name || '—';
                const category = p.category_name || 'Uncategorized';
                const price    = p.price != null ? formatCurrency(p.price) : '—';
                const qty      = Number(p.stock_quantity || 0);
                const value    = formatCurrency(Number(p.price || 0) * qty);

                // Stock badge
                let stockHtml;
                if (qty === 0) {
                    stockHtml = '<span class="status-pill cancelled">Out of Stock</span>';
                } else if (qty <= 5) {
                    stockHtml = `<span class="status-pill pending">Low (${qty})</span>`;
                } else {
                    stockHtml = `<span class="status-pill active">In Stock (${qty})</span>`;
                }

                const statusHtml = (p.status || '').toLowerCase() === 'active'
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';

                return [name, category, price, stockHtml, value, statusHtml];
            });

            // Update headers
            data.headers = ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Total Products';
            data.kpi1.value = activeProducts.toString();
            data.kpi2.label = 'Out of Stock';
            data.kpi2.value = outOfStock.toString();
            data.kpi3.label = 'Low Stock';
            data.kpi3.value = lowStock.toString();
            data.kpi4.label = 'Total Stock Value';
            data.kpi4.value = formatCurrency(totalStockValue);

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading products report data:', err);
            updateTable(data.headers, []);
        }
    } else if (type === 'expenses') {
        // --- LIVE SUPABASE INTEGRATION FOR EXPENSES ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            let query = supabase
                .from('expenses')
                .select('*')
                .eq('company_id', companyId)
                .neq('status', 'deleted')
                .order('date', { ascending: false });

            // Filter by branch if available
            if (branchId) query = query.eq('branch_id', branchId);

            const { data: dbExpenses, error } = await query;
            if (error) throw error;

            const expensesList = dbExpenses || [];

            // KPI calculations
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const totalAmount = expensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
            const thisMonthTotal = expensesList
                .filter(e => e.date && new Date(e.date) >= startOfMonth)
                .reduce((sum, e) => sum + Number(e.amount || 0), 0);
            const avgPerEntry = expensesList.length > 0
                ? totalAmount / expensesList.length
                : 0;

            // Find top category by total spend
            const categoryTotals = {};
            expensesList.forEach(e => {
                const cat = e.category || 'Other';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount || 0);
            });
            const topCategory = Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

            // Build table rows
            const formattedRows = expensesList.map(e => {
                const date     = e.date ? new Date(e.date).toLocaleDateString() : '—';
                const category = e.category || 'Other';
                const amount   = formatCurrency(Number(e.amount || 0));
                const notes    = e.notes || '—';
                const addedBy  = e.added_by || 'Admin';
                return [date, category, amount, notes, addedBy];
            });

            // Override KPIs
            data.kpi1.label = 'Total Expenses';
            data.kpi1.value = formatCurrency(totalAmount);
            data.kpi2.label = 'This Month';
            data.kpi2.value = formatCurrency(thisMonthTotal);
            data.kpi3.label = 'Top Category';
            data.kpi3.value = topCategory;
            data.kpi4.label = 'Avg per Entry';
            data.kpi4.value = formatCurrency(Math.round(avgPerEntry));

            data.headers = ['Date', 'Category', 'Amount', 'Notes', 'Added By'];

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading expenses report data:', err);
            updateTable(data.headers, []);
        }
    } else {
        // Render hardcoded mock data for the rest of the reports
        updateTable(data.headers, data.rows);
    }
});
