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
        backCat: null,
        kpi1: { label: 'Total Expenses', value: 'Loading...' },
        kpi2: { label: 'Number of Expenses', value: 'Loading...' },
        kpi3: { label: 'Avg Expense', value: 'Loading...' },
        kpi4: null,
        tableTitle: 'Expense Records',
        headers: ['Date', 'Category', 'Amount', 'Notes', 'Added By'],
        rows: []
    },

    // ─────────────────────────────────────────────
    // FINANCIAL SUB-REPORTS
    // ─────────────────────────────────────────────
    'fin-revenue': {
        title: 'Revenue',
        subtitle: 'Total income from all sources over time',
        icon: 'trending-up',
        backCat: 'financial',
        kpi1: { label: 'Total Revenue', value: '—' },
        kpi2: { label: 'This Month', value: '—' },
        kpi3: { label: 'This Week', value: '—' },
        kpi4: { label: 'Avg Daily', value: '—' },
        tableTitle: 'Revenue Breakdown',
        headers: ['Date', 'Source', 'Description', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Service', 'Haircut & Styling', 'Card', '₹1,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Product', 'Argan Oil Serum', 'Cash', '₹1,500', '<span class="status-pill completed">Completed</span>']
        ]
    },
    'fin-payments': {
        title: 'Payments',
        subtitle: 'Payment methods breakdown and transaction history',
        icon: 'credit-card',
        backCat: 'financial',
        kpi1: { label: 'Total Collected', value: '—' },
        kpi2: { label: 'Number of Payments', value: '—' },
        kpi3: { label: 'Cash', value: '—' },
        kpi4: { label: 'UPI', value: '—' },
        kpi5: { label: 'Card', value: '—' },
        tableTitle: 'Payment Events',
        headers: ['Date & Time', 'Transaction Ref', 'Source', 'Payment Method', 'Amount'],
        rows: []
    },
    'fin-refunds': {
        title: 'Refunds',
        subtitle: 'Refunded transactions and reversal details',
        icon: 'rotate-ccw',
        backCat: 'financial',
        kpi1: { label: 'Total Refunded', value: '—' },
        kpi2: { label: 'No. of Refunds', value: '—' },
        kpi3: { label: 'Avg Refund', value: '—' },
        kpi4: null,
        tableTitle: 'Refund Records',
        headers: ['Refunded On', 'Transaction Ref', 'Category', 'Method', 'Amount', 'Notes'],
        rows: []
    },
    'fin-pending-dues': {
        title: 'Pending Dues',
        subtitle: 'Unpaid balances and outstanding dues',
        icon: 'clock',
        backCat: 'financial',
        kpi1: { label: 'Total Due', value: '—' },
        kpi2: { label: 'Pending Transactions', value: '—' },
        kpi3: { label: 'Avg Due', value: '—' },
        kpi4: null,
        tableTitle: 'Pending Payment Records',
        headers: ['Transaction Ref', 'Category', 'Total Amount', 'Collected', 'Due Amount', 'Action'],
        rows: []
    },
    'fin-discounts': {
        title: 'Discounts',
        subtitle: 'Discount amounts given and their revenue impact',
        icon: 'tag',
        backCat: 'financial',
        kpi1: { label: 'Total Discounts', value: '—' },
        kpi2: { label: 'This Month', value: '—' },
        kpi3: { label: 'Coupon Discounts', value: '—' },
        kpi4: { label: 'Offer Discounts', value: '—' },
        tableTitle: 'Discount Records',
        headers: ['Date', 'Customer', 'Type', 'Code / Offer', 'Original', 'Discount', 'Final Amount'],
        rows: [
            ['2024-03-21', 'Nisha P.', 'Coupon', 'SAVE20', '₹1,500', '-₹300', '₹1,200'],
            ['2024-03-20', 'Arjun K.', 'Offer', 'Summer Deal', '₹2,000', '-₹400', '₹1,600']
        ]
    },
    'fin-expenses': {
        title: 'Expenses',
        subtitle: 'All business expenditures by category',
        icon: 'shopping-cart',
        backCat: 'financial',
        kpi1: { label: 'Total Expenses', value: 'Loading...' },
        kpi2: { label: 'Number of Expenses', value: 'Loading...' },
        kpi3: { label: 'Avg Expense', value: 'Loading...' },
        kpi4: null,
        tableTitle: 'Expense Records',
        headers: ['Date', 'Category', 'Amount', 'Notes', 'Added By'],
        rows: []
    },

    // ─────────────────────────────────────────────
    // SALES & SERVICES SUB-REPORTS
    // ─────────────────────────────────────────────
    'sales-total': {
        title: 'Total Sales',
        subtitle: 'Combined POS and service sales overview',
        icon: 'bar-chart-2',
        backCat: 'sales',
        kpi1: { label: 'Total Sales', value: '—' },
        kpi2: { label: 'Total Orders', value: '—' },
        kpi3: { label: 'Avg Order Value', value: '—' },
        kpi4: { label: 'Total Items Sold', value: '—' },
        tableTitle: 'Sales Ledger',
        headers: ['Date', 'Type', 'Customer', 'Description', 'Qty', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Service', 'Anita S.', 'Bridal Makeup', '1', '₹4,500', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Product', 'Walk-in', 'Argan Oil Serum', '2', '₹3,000', '<span class="status-pill completed">Completed</span>']
        ]
    },
    'sales-service-revenue': {
        title: 'Service Revenue',
        subtitle: 'Revenue generated from service bookings',
        icon: 'scissors',
        backCat: 'sales',
        kpi1: { label: 'Total Service Revenue', value: 'Loading...' },
        kpi2: { label: 'Total Service Bookings', value: 'Loading...' },
        kpi3: { label: 'Avg Service Value', value: 'Loading...' },
        kpi4: { label: 'Total Services Delivered', value: 'Loading...' },
        tableTitle: 'Service Revenue Details',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue Generated', 'Status'],
        rows: []
    },
    'sales-product-sales': {
        title: 'Product Sales',
        subtitle: 'Retail product units sold and revenue',
        icon: 'package',
        backCat: 'sales',
        kpi1: { label: 'Total Products', value: 'Loading...' },
        kpi2: { label: 'Out of Stock', value: 'Loading...' },
        kpi3: { label: 'Low Stock', value: 'Loading...' },
        kpi4: { label: 'Total Stock Value', value: 'Loading...' },
        tableTitle: 'Product Inventory',
        headers: ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'],
        rows: []
    },
    'sales-top-services': {
        title: 'Top Services',
        subtitle: 'Highest performing services by bookings and revenue',
        icon: 'award',
        backCat: 'sales',
        kpi1: { label: 'Active Services', value: 'Loading...' },
        kpi2: { label: 'Total Bookings', value: 'Loading...' },
        kpi3: { label: 'Top Service', value: 'Loading...' },
        kpi4: { label: 'Avg Duration', value: 'Loading...' },
        tableTitle: 'Service Rankings',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue Generated', 'Status'],
        rows: []
    },
    'sales-top-products': {
        title: 'Top Products',
        subtitle: 'Best-selling retail products by units and revenue',
        icon: 'box',
        backCat: 'sales',
        kpi1: { label: 'Total Products', value: 'Loading...' },
        kpi2: { label: 'Units Sold', value: '—' },
        kpi3: { label: 'Top Product', value: '—' },
        kpi4: { label: 'Retail Revenue', value: '—' },
        tableTitle: 'Product Rankings',
        headers: ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'],
        rows: []
    },
    'sales-membership-revenue': {
        title: 'Membership Revenue',
        subtitle: 'Revenue generated from membership plans',
        icon: 'award',
        backCat: 'sales',
        kpi1: { label: 'Membership Revenue', value: 'Loading...' },
        kpi2: { label: 'Plans Sold', value: 'Loading...' },
        kpi3: { label: 'Top Plan', value: 'Loading...' },
        kpi4: { label: 'Avg Plan Value', value: 'Loading...' },
        tableTitle: 'Membership Sales Details',
        headers: ['Plan Name', 'Duration', 'Price', 'Times Sold', 'Revenue Generated', 'Status'],
        rows: []
    },

    // ─────────────────────────────────────────────
    // BOOKINGS SUB-REPORTS
    // ─────────────────────────────────────────────
    'bk-total': {
        title: 'Total Appointments',
        subtitle: 'All appointments across all statuses',
        icon: 'calendar',
        backCat: 'bookings',
        kpi1: { label: 'Total Bookings', value: 'Loading...' },
        kpi2: { label: 'Completed', value: 'Loading...' },
        kpi3: { label: 'Cancelled', value: 'Loading...' },
        kpi4: { label: 'No-Shows', value: 'Loading...' },
        tableTitle: 'All Appointments',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Duration', 'Status'],
        rows: []
    },
    'bk-completed': {
        title: 'Completed Appointments',
        subtitle: 'Successfully completed appointments',
        icon: 'check-circle',
        backCat: 'bookings',
        kpi1: { label: 'Completed', value: 'Loading...' },
        kpi2: { label: 'This Month', value: 'Loading...' },
        kpi3: { label: 'This Week', value: 'Loading...' },
        kpi4: { label: 'Completion Rate', value: 'Loading...' },
        tableTitle: 'Completed Appointments',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Duration', 'Amount'],
        rows: []
    },
    'bk-cancelled': {
        title: 'Cancelled Appointments',
        subtitle: 'Cancellations by reason and time period',
        icon: 'x-circle',
        backCat: 'bookings',
        kpi1: { label: 'Cancelled', value: 'Loading...' },
        kpi2: { label: 'This Month', value: 'Loading...' },
        kpi3: { label: 'This Week', value: 'Loading...' },
        kpi4: { label: 'Cancellation Rate', value: 'Loading...' },
        tableTitle: 'Cancelled Appointments',
        headers: ['Date', 'Customer', 'Service', 'Staff', 'Cancelled On', 'Reason', 'Status'],
        rows: [
            ['2024-03-21', 'Deepa R.', 'Hair Spa', 'Priya', '2024-03-20', 'Personal Reason', '<span class="status-pill cancelled">Cancelled</span>'],
            ['2024-03-19', 'Mohan V.', 'Beard Trim', 'Ravi', '2024-03-18', 'No Reason Given', '<span class="status-pill cancelled">Cancelled</span>']
        ]
    },
    'bk-no-shows': {
        title: 'No-Shows',
        subtitle: 'Customers who missed their appointments',
        icon: 'user-x',
        backCat: 'bookings',
        kpi1: { label: 'No-Shows', value: 'Loading...' },
        kpi2: { label: 'This Month', value: 'Loading...' },
        kpi3: { label: 'This Week', value: 'Loading...' },
        kpi4: { label: 'No-Show Rate', value: 'Loading...' },
        tableTitle: 'No-Show Records',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount Lost', 'Status'],
        rows: [
            ['2024-03-21', '10:00 AM', 'Ajay K.', 'Haircut', 'Michael', '₹600', '<span class="status-pill cancelled" style="background:#fef3c7;color:#92400e;">No-Show</span>'],
            ['2024-03-20', '02:00 PM', 'Sneha M.', 'Facial', 'Priya', '₹1,200', '<span class="status-pill cancelled" style="background:#fef3c7;color:#92400e;">No-Show</span>']
        ]
    },

    // ─────────────────────────────────────────────
    // CUSTOMERS SUB-REPORTS
    // ─────────────────────────────────────────────
    'cust-new': {
        title: 'New Customers',
        subtitle: 'First-time customers and acquisition trends',
        icon: 'user-plus',
        backCat: 'customers',
        kpi1: { label: 'Total Customers', value: 'Loading...' },
        kpi2: { label: 'New This Month', value: 'Loading...' },
        kpi3: { label: 'New This Week', value: 'Loading...' },
        kpi4: { label: 'Avg Spend (New)', value: '—' },
        tableTitle: 'New Customer Registry',
        headers: ['Joined Date', 'Customer Name', 'Phone', 'Total Visits', 'Total Spend', 'Last Visit', 'Status'],
        rows: []
    },
    'cust-returning': {
        title: 'Returning Customers',
        subtitle: 'Repeat visits and loyalty patterns',
        icon: 'repeat',
        backCat: 'customers',
        kpi1: { label: 'Total Customers', value: 'Loading...' },
        kpi2: { label: 'Returning (2+ visits)', value: 'Loading...' },
        kpi3: { label: 'Retention Rate', value: '—' },
        kpi4: { label: 'Avg Bookings', value: 'Loading...' },
        tableTitle: 'Returning Customer Registry',
        headers: ['Joined Date', 'Customer Name', 'Phone', 'Total Visits', 'Total Spend', 'Last Visit', 'Status'],
        rows: []
    },

    // ─────────────────────────────────────────────
    // OPERATIONS SUB-REPORTS
    // ─────────────────────────────────────────────
    'ops-staff': {
        title: 'Staff Performance',
        subtitle: 'Revenue, bookings and ratings by staff member',
        icon: 'user-check',
        backCat: 'operations',
        kpi1: { label: 'Active Staff', value: 'Loading...' },
        kpi2: { label: 'Total Hours', value: '—' },
        kpi3: { label: 'Top Performer', value: 'Loading...' },
        kpi4: { label: 'Commission', value: '—' },
        tableTitle: 'Staff Directory',
        headers: ['Staff Name', 'Role', 'Status', 'Appointments', 'Total Hours', 'Revenue', 'Rating'],
        rows: []
    },
    'ops-branch': {
        title: 'Branch Performance',
        subtitle: 'Multi-location comparison and trends',
        icon: 'map-pin',
        backCat: 'operations',
        kpi1: { label: 'Active Branches', value: 'Loading...' },
        kpi2: { label: 'Total Visits', value: 'Loading...' },
        kpi3: { label: 'Top Branch', value: 'Loading...' },
        kpi4: { label: 'Total Revenue', value: 'Loading...' },
        tableTitle: 'Branch Overview',
        headers: ['Branch Name', 'Address', 'Phone', 'Staff Count', 'Total Visits', 'Revenue', 'Status'],
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
    
    // 2. Update page <title>
    document.title = `${data.title} - BharathBots Reports`;

    // 3. Update page header elements dynamically
    const titleEl = document.getElementById('reportTitle');
    const subtitleEl = document.getElementById('reportSubtitle');
    const rightChartTitleEl = document.getElementById('rightChartTitle');
    
    if (titleEl) titleEl.textContent = data.title;
    if (subtitleEl) subtitleEl.textContent = data.subtitle;
    if (rightChartTitleEl) rightChartTitleEl.textContent = 'Distribution';

    // 4. Wire "Back" breadcrumb link
    //    If this report came from a category (has backCat), show "Back to <Category> Reports"
    //    Otherwise show "Back to Report Library"
    const backLinkEl = document.getElementById('reportBackLink');
    if (backLinkEl) {
        if (data.backCat) {
            const catLabels = {
                financial: 'Financial',
                sales: 'Sales & Services',
                bookings: 'Bookings',
                customers: 'Customers',
                operations: 'Operations'
            };
            backLinkEl.textContent = `← Back to ${catLabels[data.backCat] || data.backCat} Reports`;
            backLinkEl.href = `report-category.html?cat=${data.backCat}`;
        } else {
            backLinkEl.textContent = '← Back to Report Library';
            backLinkEl.href = 'reports.html';
        }
    }

    
    // 3. Prepare to update DOM
    const updateKPIs = (k1, k2, k3, k4 = null, k5 = null) => {
        const lbl1 = document.getElementById('kpiLabel1'); const val1 = document.getElementById('kpiValue1');
        if (lbl1 && val1 && k1) { lbl1.textContent = k1.label; val1.textContent = k1.value; }

        const lbl2 = document.getElementById('kpiLabel2'); const val2 = document.getElementById('kpiValue2');
        if (lbl2 && val2 && k2) { lbl2.textContent = k2.label; val2.textContent = k2.value; }

        const lbl3 = document.getElementById('kpiLabel3'); const val3 = document.getElementById('kpiValue3');
        if (lbl3 && val3 && k3) { lbl3.textContent = k3.label; val3.textContent = k3.value; }

        const kpiRow = document.getElementById('kpiRow');
        
        const card4 = document.getElementById('kpiLabel4')?.closest('.kpi-card') || (kpiRow && kpiRow.children.length > 3 ? kpiRow.children[3] : null);
        const lbl4 = document.getElementById('kpiLabel4'); 
        const val4 = document.getElementById('kpiValue4');
        
        if (lbl4 && val4 && k4) { 
            lbl4.textContent = k4.label; val4.textContent = k4.value; 
            if (card4) card4.style.display = 'flex';
        } else if (card4) {
            card4.style.display = 'none';
        }

        const card5 = document.getElementById('kpiCard5');
        const lbl5 = document.getElementById('kpiLabel5'); 
        const val5 = document.getElementById('kpiValue5');
        
        let visibleCount = 3;
        if (k4) visibleCount = 4;
        if (k5) visibleCount = 5;
        
        if (k5 && card5 && lbl5 && val5 && kpiRow) {
            lbl5.textContent = k5.label; 
            val5.textContent = k5.value;
            card5.style.display = 'flex';
        } else if (card5 && kpiRow) {
            card5.style.display = 'none';
        }
        
        if (kpiRow) {
            kpiRow.style.gridTemplateColumns = `repeat(${Math.max(1, visibleCount)}, 1fr)`;
        }
    };

    let trendChartInstance = null;

    /**
     * Renders a bar chart with grey bars and a highlighted purple bar for the most recent data point.
     * Matches the design aesthetic provided: rounded corners and premium color palette.
     */
    const renderTrendChart = (labels, values) => {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        // Highlight the last bar (most recent day) with purple
        const backgroundColors = values.map((_, i) => 
            i === values.length - 1 ? '#d946ef' : '#e2e8f0'
        );

        trendChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderRadius: 8,
                    borderSkipped: false,
                    barThickness: 32
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        cornerRadius: 8,
                        displayColors: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            display: true,
                            drawBorder: false,
                            color: '#f1f5f9'
                        },
                        ticks: {
                            precision: 0,
                            color: '#94a3b8',
                            font: { size: 11 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
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
                tbody.innerHTML = rows.map(row => {
                    if (row && typeof row === 'object' && row.rawHtml) {
                        return row.rawHtml;
                    }
                    return `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                }).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align: center; padding: 2rem;">No data available for this report.</td></tr>`;
            }
        }
    };

    let distributionChartInstance = null;
    const renderDistributionChart = (labels, values) => {
        const ctx = document.getElementById('distributionChart');
        if(!ctx) return;
        if(distributionChartInstance) distributionChartInstance.destroy();
        
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
        
        distributionChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 13 },
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        const legendContainer = document.getElementById('infographicLegend');
        if (legendContainer) {
            if (labels.length === 0 || values.every(v => v === 0)) {
                legendContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.875rem;">No data to display</div>';
            } else {
                const total = values.reduce((a, b) => a + b, 0);
                legendContainer.innerHTML = labels.map((l, i) => {
                    const val = values[i];
                    const perc = total > 0 ? Math.round((val / total) * 100) : 0;
                    return `
                        <div class="metric-item">
                            <span class="metric-dot" style="background-color: ${colors[i % colors.length]};"></span>
                            <div class="metric-label">
                                <span class="name">${l}</span>
                                <span class="perc">${perc}%</span>
                            </div>
                            <div class="metric-value">${formatCurrency(val)}</div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (values.length > 0 && !values.every(v => v === 0)) {
            const maxIdx = values.indexOf(Math.max(...values));
            const total = values.reduce((a,b)=>a+b, 0);
            const perc = total > 0 ? Math.round((values[maxIdx] / total) * 100) : 0;
            const hmVal = document.getElementById('heroMetricValue');
            const hmLabel = document.getElementById('heroMetricLabel');
            if(hmVal) hmVal.textContent = perc + '%';
            if(hmLabel) hmLabel.textContent = 'Revenue from ' + labels[maxIdx];
        } else {
            const hmVal = document.getElementById('heroMetricValue');
            const hmLabel = document.getElementById('heroMetricLabel');
            if(hmVal) hmVal.textContent = '0%';
            if(hmLabel) hmLabel.textContent = 'No Data Available';
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
    } else if (type === 'fin-revenue') {
        // --- LIVE SUPABASE INTEGRATION FOR REVENUE REPORT ---
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        // Set Default Dates
        if (filterStart && filterEnd) {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        // Fetch Branches
        try {
            const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
            if (bList && filterBranch) {
                const existing = filterBranch.value;
                filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                filterBranch.value = existing || 'all';
            }
        } catch(e) { console.warn('Could not fetch branches', e); }

        const loadRevenueData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_revenue_summary', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (sumError) console.warn('KPI fetch error:', sumError);
                
                let rev = 0, coll = 0, pend = 0, ref = 0;
                if (sumData) {
                    const rows = Array.isArray(sumData) ? sumData : [sumData];
                    rows.forEach(row => {
                        if(row) {
                            rev += Number(row.total_revenue || row.total || 0);
                            coll += Number(row.collected_amount || row.paid_amount || 0);
                            pend += Number(row.pending_amount || row.due_amount || 0);
                            ref += Number(row.refunded_amount || 0);
                        }
                    });
                }
                data.kpi1.value = formatCurrency(rev);
                data.kpi2.value = formatCurrency(coll);
                data.kpi3.value = formatCurrency(pend);
                data.kpi4.value = formatCurrency(ref);
                data.kpi1.label = 'Total Revenue';
                data.kpi2.label = 'Collected';
                data.kpi3.label = 'Pending';
                data.kpi4.label = 'Refunded';
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Line Chart
                const { data: trendData, error: trendError } = await supabase.rpc('get_revenue_trend', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (trendError) console.warn('Trend fetch error:', trendError);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.revenue)));
                    } else {
                        renderTrendChart([], []);
                    }
                }

                // 3. Donut Chart
                const { data: splitData, error: splitError } = await supabase.rpc('get_revenue_split', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (splitError) console.warn('Split fetch error:', splitError);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.category || 'Other'), splitData.map(s => Number(s.revenue || 0)));
                } else {
                    renderDistributionChart([], []);
                }

                // 4. Data Table (Level 1 Master View)
                data.headers = ['Transaction ID', 'Type', 'Total Amount', 'Collected', 'Due', 'Refunded'];
                
                const { data: tData, error: tError } = await supabase.rpc('get_revenue_table', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });

                if (tError) console.warn('Table fetch error:', tError);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const refId = r.reference_id || 'Unknown';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const total = formatCurrency(r.total_amount);
                        const paid = formatCurrency(r.paid_amount);
                        
                        let dueText = '—';
                        if (r.due_amount > 0) dueText = `<span style="color: #ef4444; font-weight: 600;">${formatCurrency(r.due_amount)}</span>`;
                        
                        let refText = '—';
                        if (r.refunded_amount > 0) refText = `<span style="color: #f59e0b; font-weight: 600;">${formatCurrency(r.refunded_amount)}</span>`;
                        
                        const rawHtml = `<tr style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" data-action="drilldown" data-ref="${refId}">
                            <td style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</td>
                            <td><span class="status-pill active">${sType}</span></td>
                            <td>${total}</td>
                            <td style="color: #10b981; font-weight:500;">${paid}</td>
                            <td>${dueText}</td>
                            <td>${refText}</td>
                        </tr>`;

                        return { rawHtml };
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }
            } catch (err) {
                console.error('Critical exception in loadRevenueData:', err);
                renderTrendChart([], []);
                renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        if (btnApply) btnApply.addEventListener('click', loadRevenueData);
        loadRevenueData();

        // Level 2 Drilldown Handler
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.addEventListener('click', async (e) => {
                const tr = e.target.closest('tr[data-action="drilldown"]');
                if (!tr) return;
                const refId = tr.getAttribute('data-ref');
                if (!refId || refId === 'Unknown') return;
                
                // Show modal logic
                let modalOverlay = document.getElementById('drilldownModalOverlay');
                if (!modalOverlay) {
                    modalOverlay = document.createElement('div');
                    modalOverlay.id = 'drilldownModalOverlay';
                    modalOverlay.className = 'modal-overlay active';
                    modalOverlay.style.zIndex = '9999';
                    modalOverlay.innerHTML = `
                        <div class="modal-container" style="max-width: 800px; width: 90%;">
                            <div class="modal-header">
                                <div class="header-titles">
                                    <h2>Transaction Drill-down</h2>
                                    <p class="subtitle" id="drilldownSubtitle">Ledger entries for transaction</p>
                                </div>
                                <button class="modal-close" onclick="document.getElementById('drilldownModalOverlay').classList.remove('active')"><i data-feather="x"></i></button>
                            </div>
                            <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; max-height: 60vh;">
                                <table class="custom-table" style="width: 100%;">
                                    <thead>
                                        <tr>
                                            <th>Date Executed</th>
                                            <th>Payment Method</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody id="drilldownTbody">
                                        <tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modalOverlay);
                    if (window.feather) feather.replace();
                } else {
                    modalOverlay.classList.add('active');
                    document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
                }

                document.getElementById('drilldownSubtitle').textContent = `Ledger history for Ref: #${refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId}`;

                try {
                    const { data: logs, error } = await supabase
                        .from('business_transactions')
                        .select('*')
                        .eq('reference_id', refId)
                        .order('created_at', { ascending: false });

                    if (error || !logs || logs.length === 0) {
                        document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No logs found.</td></tr>';
                        return;
                    }

                    document.getElementById('drilldownTbody').innerHTML = logs.map(log => {
                        const date = new Date(log.created_at).toLocaleString();
                        const method = log.payment_method ? log.payment_method.toUpperCase() : '—';
                        const amount = formatCurrency(log.amount);
                        let statusHtml = '';
                        if (log.status === 'paid') statusHtml = '<span class="status-pill completed">Paid</span>';
                        else if (log.status === 'refunded') statusHtml = '<span class="status-pill cancelled" style="background:#fef3c7; color:#d97706;">Refunded</span>';
                        else statusHtml = '<span class="status-pill pending" style="text-transform: capitalize;">' + (log.status || 'Pending') + '</span>';
                        const notes = log.notes || '—';

                        return `<tr>
                            <td>${date}</td>
                            <td style="font-weight: 600;">${method}</td>
                            <td>${amount}</td>
                            <td>${statusHtml}</td>
                            <td style="color: #64748b; font-size: 0.8rem;">${notes}</td>
                        </tr>`;
                    }).join('');
                } catch (err) {
                    document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color:red;">Failed to fetch logs.</td></tr>';
                }
            });
        }

    } else if (type === 'fin-payments') {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

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

        const loadPaymentsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_payments_summary', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_collected || 0);
                        data.kpi2.value = Number(row.total_payments || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.cash_amount || 0);
                        data.kpi4.value = formatCurrency(row.upi_amount || 0);
                        data.kpi5.value = formatCurrency(row.card_amount || 0);
                    }
                } else {
                    data.kpi1.value = '₹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '₹0';
                    data.kpi4.value = '₹0';
                    data.kpi5.value = '₹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4, data.kpi5);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_payments_trend', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_payments_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_payments_split', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_payments_split Error:', e3);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.method ? s.method.toUpperCase() : 'Other'), splitData.map(s => Number(s.amount || 0)));
                } else renderDistributionChart([], []);

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_payments_table', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_payments_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const paidAt = r.paid_at ? new Date(r.paid_at).toLocaleString() : '—';
                        const refId = r.reference_id || '—';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const method = (r.payment_method || 'Unknown').toUpperCase();
                        const amount = formatCurrency(r.amount);
                        
                        return [
                            paidAt, 
                            `<span style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</span>`, 
                            `<span class="status-pill active" style="background:#e0e7ff; color:#4338ca;">${sType}</span>`, 
                            `<strong style="color:#334155;">${method}</strong>`, 
                            `<strong style="color:#10b981;">${amount}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                renderTrendChart([], []); renderDistributionChart([], []); updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadPaymentsData);
            loadPaymentsData();
        });

    } else if (type === 'fin-refunds') {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

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

        const loadRefundsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_refunds_summary', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        const tRefunded = Number(row.total_refunded || 0);
                        const tRefunds = Number(row.total_refunds || 0);
                        const avgRefund = tRefunds > 0 ? (tRefunded / tRefunds) : 0;
                        
                        data.kpi1.value = formatCurrency(tRefunded);
                        data.kpi2.value = tRefunds.toLocaleString();
                        data.kpi3.value = formatCurrency(avgRefund);
                    }
                } else {
                    data.kpi1.value = '₹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '₹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_refunds_trend', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_refunds_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_refunds_split', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_refunds_split Error:', e3);
                if (typeof renderDistributionChart === 'function') {
                    if (splitData && splitData.length > 0) {
                        renderDistributionChart(splitData.map(s => s.category ? s.category.toUpperCase() : 'OTHER'), splitData.map(s => Number(s.amount || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_refunds_table', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_refunds_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const createdDate = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
                        const refId = r.reference_id || '—';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const method = (r.payment_method || 'Unknown').toUpperCase();
                        const amount = formatCurrency(r.amount);
                        const notes = r.notes || '—';
                        
                        return [
                            createdDate, 
                            `<span style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</span>`, 
                            `<span class="status-pill active" style="background:#fef3c7; color:#d97706;">${sType}</span>`, 
                            `<strong style="color:#475569;">${method}</strong>`, 
                            `<strong style="color:#ef4444;">${amount}</strong>`,
                            `<span style="color:#94a3b8; font-size:0.875rem;">${notes}</span>`
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
            if (btnApply) btnApply.addEventListener('click', loadRefundsData);
            loadRefundsData();
        });

    } else if (type === 'fin-pending-dues') {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

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

        const loadDuesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_dues_summary', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_due || 0);
                        data.kpi2.value = Number(row.pending_transactions || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.avg_due || 0);
                    }
                } else {
                    data.kpi1.value = '₹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '₹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_dues_trend', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_dues_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.due_amount || 0)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_dues_split', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_dues_split Error:', e3);
                if (typeof renderDistributionChart === 'function') {
                    if (splitData && splitData.length > 0) {
                        renderDistributionChart(splitData.map(s => s.category ? s.category.toUpperCase() : 'OTHER'), splitData.map(s => Number(s.due_amount || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_dues_table', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_dues_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const refId = r.reference_id || 'Unknown';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        
                        const total = formatCurrency(r.total_amount || 0);
                        const paid = formatCurrency(r.paid_amount || 0);
                        const due = formatCurrency(r.due_amount || 0);
                        
                        // Enforce Due styling
                        const dueHtml = `<span style="color: #ef4444; font-weight: 600;">${due}</span>`;
                        // Action button embedding the ID for quick collections
                        const actionHtml = `<button class="btn-primary" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 6px; background: #6366f1;" onclick="alert('Collect action clicked for Ref: ${refId}')">Collect</button>`;

                        return [
                            `<span style="font-family: monospace; font-weight: 600; color: #475569;">#${shortRef}</span>`, 
                            `<span class="status-pill pending" style="text-transform:uppercase;">${sType}</span>`, 
                            total, 
                            `<strong style="color:#10b981;">${paid}</strong>`, 
                            dueHtml,
                            actionHtml
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
            if (btnApply) btnApply.addEventListener('click', loadDuesData);
            loadDuesData();
        });

    } else if (type === 'sales-total') {
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
                const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
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
                    data.kpi1.value = '₹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '₹0';
                    data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('get_sales_trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendRes.data.map(t => Number(t.total_sales || 0)));
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
                        const dateText = r.date ? new Date(r.date).toLocaleString() : '—';
                        const typeText = (r.item_type || 'Unknown').toUpperCase();
                        const itemName = r.item_name || '—';
                        const cat = r.category || '—';
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

    } else if (type === 'sales-service-revenue') {
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
                const args = { p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end };
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
                    data.kpi1.value = '₹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = '₹0';
                    data.kpi4.value = '0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Chart
                if (trendRes.error) console.warn('Trend Error:', trendRes.error);
                if (typeof renderTrendChart === 'function') {
                    if (trendRes.data && trendRes.data.length > 0) {
                        renderTrendChart(trendRes.data.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendRes.data.map(t => Number(t.total_sales || t.revenue || t.total_revenue || 0)));
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
                        const dateText = r.date ? new Date(r.date).toLocaleString() : '—';
                        const itemName = r.service_name || r.item_name || '—';
                        const cat = r.category || '—';
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
    } else if (type === 'expenses' || type === 'fin-expenses') {
        // --- LIVE SUPABASE INTEGRATION FOR EXPENSES ---
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        // Set Default Dates
        if (filterStart && filterEnd) {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        // Fetch Branches
        try {
            const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
            if (bList && filterBranch) {
                const existing = filterBranch.value;
                filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                filterBranch.value = existing || 'all';
            }
        } catch(e) { console.warn('Could not fetch branches', e); }

        const loadExpensesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_expenses_summary', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (sumError) console.warn('KPI fetch error:', sumError);
                
                let totalExp = 0, totalEntries = 0, avgExp = 0;
                if (sumData && sumData.length > 0) {
                    const row = sumData[0];
                    totalExp = Number(row.total_expenses || 0);
                    totalEntries = Number(row.total_entries || 0);
                    avgExp = Number(row.avg_expense || 0);
                }
                
                data.kpi1.label = 'Total Expenses';
                data.kpi1.value = formatCurrency(totalExp);
                data.kpi2.label = 'Number of Entries';
                data.kpi2.value = totalEntries.toString();
                data.kpi3.label = 'Avg Expense';
                data.kpi3.value = formatCurrency(Math.round(avgExp));
                data.kpi4 = null;
                
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Line Chart
                const { data: trendData, error: trendError } = await supabase.rpc('get_expenses_trend', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (trendError) console.warn('Trend fetch error:', trendError);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else {
                        renderTrendChart([], []);
                    }
                }

                // 3. Donut Chart
                const { data: splitData, error: splitError } = await supabase.rpc('get_expenses_split', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (splitError) console.warn('Split fetch error:', splitError);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.category || 'Other'), splitData.map(s => Number(s.amount || 0)));
                } else {
                    renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Category', 'Amount', 'Notes', 'Status'];
                
                const { data: tData, error: tError } = await supabase.rpc('get_expenses_table', {
                    p_branch_id: bid, p_start_date: start, p_end_date: end
                });

                if (tError) console.warn('Table fetch error:', tError);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const date = r.date ? new Date(r.date).toLocaleDateString() : '—';
                        const cat = r.category || 'Other';
                        const amt = formatCurrency(Number(r.amount || 0));
                        const notes = r.notes || '—';
                        
                        let sType = (r.status || 'completed').toLowerCase();
                        let statusHtml = '<span class="status-pill active">Active</span>';
                        if (sType === 'deleted' || sType === 'cancelled') {
                           statusHtml = '<span class="status-pill cancelled">Deleted</span>';
                        } else if (sType === 'pending') {
                           statusHtml = '<span class="status-pill pending">Pending</span>';
                        } else {
                           statusHtml = `<span class="status-pill completed">${r.status || 'Completed'}</span>`;
                        }

                        return [date, cat, amt, notes, statusHtml];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }
            } catch (err) {
                console.error('Critical exception in loadExpensesData:', err);
                renderTrendChart([], []);
                renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        if (btnApply) btnApply.addEventListener('click', loadExpensesData);
        loadExpensesData();
    } else {
        // Render hardcoded mock data for the rest of the reports
        updateTable(data.headers, data.rows);
    }
});
