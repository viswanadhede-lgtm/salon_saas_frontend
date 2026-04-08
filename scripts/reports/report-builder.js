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
    } else {
        // Render hardcoded mock data for the rest of the reports
        updateTable(data.headers, data.rows);
    }
});
