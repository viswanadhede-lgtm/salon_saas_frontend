// scripts/reports/report-builder.js
// Handles dynamic UI loading for report-detail.html based on the '?type=' query string

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
        kpi1: { label: 'Total Customers', value: '8,420' },
        kpi2: { label: 'New This Month', value: '342' },
        kpi3: { label: 'Retention Rate', value: '68%' },
        kpi4: { label: 'Avg Feedback', value: '4.8/5' },
        tableTitle: 'Customer Registry',
        headers: ['Joined Date', 'Customer Name', 'Phone', 'Total Visits', 'Total Spend', 'Last Visit', 'Status'],
        rows: [
            ['2023-01-15', 'Priya Singh', '+91 9876543210', '14', '₹12,450', '2024-03-20', '<span class="status-pill active">Active</span>'],
            ['2023-05-22', 'Vikram Rao', '+91 9876543211', '6', '₹4,200', '2023-11-10', '<span class="status-pill cancelled">Inactive</span>']
        ]
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

document.addEventListener('DOMContentLoaded', () => {
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
    
    // 3. Update KPI Card Labels and Values (using DOM IDs)
    const lbl1 = document.getElementById('kpiLabel1');
    const val1 = document.getElementById('kpiValue1');
    if (lbl1 && val1) { lbl1.textContent = data.kpi1.label; val1.textContent = data.kpi1.value; }

    const lbl2 = document.getElementById('kpiLabel2');
    const val2 = document.getElementById('kpiValue2');
    if (lbl2 && val2) { lbl2.textContent = data.kpi2.label; val2.textContent = data.kpi2.value; }

    const lbl3 = document.getElementById('kpiLabel3');
    const val3 = document.getElementById('kpiValue3');
    if (lbl3 && val3) { lbl3.textContent = data.kpi3.label; val3.textContent = data.kpi3.value; }

    const lbl4 = document.getElementById('kpiLabel4');
    const val4 = document.getElementById('kpiValue4');
    if (lbl4 && val4) { lbl4.textContent = data.kpi4.label; val4.textContent = data.kpi4.value; }

    // 4. Update the Table Headers and Body
    const tableContainer = document.querySelector('.data-table-container');
    if (tableContainer && data.headers) {
        // Update Title
        const tableHeaderTitle = tableContainer.querySelector('.table-header h2');
        if (tableHeaderTitle) tableHeaderTitle.textContent = data.tableTitle || 'Detailed Records';

        const theadRow = document.querySelector('#tableHead tr');
        const tbody = document.getElementById('tableBody');

        if (theadRow && tbody) {
            // Render Headers
            theadRow.innerHTML = data.headers.map(h => `<th>${h}</th>`).join('');

            // Render Rows
            if (data.rows && data.rows.length > 0) {
                tbody.innerHTML = data.rows.map(row => 
                    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
                ).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="${data.headers.length}" style="text-align: center; padding: 2rem;">No data available for this report type.</td></tr>`;
            }
        }
    }
});
