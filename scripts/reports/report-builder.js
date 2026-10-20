// scripts/reports/report-builder.js
// Thin orchestrator for report-detail.html based on the '?type=' query string

import { supabase } from '../../lib/supabase.js';
import { updateKPIs, updateTable } from './report-modules/shared.js';

const REPORT_TYPES = {
    financial: {
        title: 'Financial Reports',
        subtitle: 'Revenue, payments, and discounts analysis',
        icon: 'dollar-sign',
        kpi1: { label: 'Total Revenue',       value: '\u20b92,82,900' },
        kpi2: { label: 'Total Transactions',   value: '2,142' },
        kpi3: { label: 'Average Ticket',       value: '\u20b91,320' },
        kpi4: { label: 'Total Discounts',      value: '\u20b912,450' },
        tableTitle: 'Detailed Records',
        headers: ['Date', 'Transaction Type', 'Description', 'Category', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Payment', 'Haircut & Styling', 'Service', 'Card', '\u20b91,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Payment', 'Skin Care Kit',     'Product', 'Cash', '\u20b9850',   '<span class="status-pill completed">Completed</span>']
        ]
    },
    bookings: {
        title: 'Bookings & Appointments',
        subtitle: 'Schedule utilization and appointment status',
        icon: 'calendar',
        kpi1: { label: 'Total Bookings', value: '1,245' },
        kpi2: { label: 'Completed',      value: '1,120' },
        kpi3: { label: 'Cancellations',  value: '85' },
        kpi4: { label: 'No-Shows',       value: '40' },
        tableTitle: 'Booking History',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Duration', 'Status'],
        rows: [
            ['2024-03-21', '10:00 AM', 'Anita Sharma', 'Bridal Makeup', 'Sarah',   '2h',  '<span class="status-pill confirmed">Confirmed</span>'],
            ['2024-03-21', '12:30 PM', 'Raj Patel',    'Haircut',       'Michael', '45m', '<span class="status-pill pending">Pending</span>']
        ]
    },
    customers: {
        title: 'Customer Analytics',
        subtitle: 'Retention, acquisition, and feedback',
        icon: 'users',
        kpi1: { label: 'Total Customers',  value: 'Loading...' },
        kpi2: { label: 'New This Month',   value: 'Loading...' },
        kpi3: { label: 'Total Value',      value: 'Loading...' },
        kpi4: { label: 'Avg Bookings',     value: 'Loading...' },
        tableTitle: 'Customer Registry',
        headers: ['Joined Date', 'Customer Name', 'Phone', 'Total Visits', 'Total Spend', 'Last Visit', 'Status'],
        rows: []
    },
    services: {
        title: 'Service Performance',
        subtitle: 'Most popular and profitable services',
        icon: 'scissors',
        kpi1: { label: 'Top Service',        value: 'Haircut' },
        kpi2: { label: 'Services Performed', value: '4,210' },
        kpi3: { label: 'Service Revenue',    value: '\u20b94,12,000' },
        kpi4: { label: 'Avg Duration',       value: '45m' },
        tableTitle: 'Service Metrics',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue generated', 'Trend'],
        rows: [
            ["Women's Haircut", 'Hair', '45m', '\u20b9600',   '420', '\u20b92,52,000', '<span style="color:var(--emerald);">+12%</span>'],
            ['Basic Facial',    'Skin', '60m', '\u20b91200',  '150', '\u20b91,80,000', '<span style="color:var(--emerald);">+5%</span>']
        ]
    },
    products: {
        title: 'Inventory & Products',
        subtitle: 'Retail sales and stock levels',
        icon: 'package',
        kpi1: { label: 'Products Sold',    value: '520' },
        kpi2: { label: 'Retail Revenue',   value: '\u20b91,24,000' },
        kpi3: { label: 'Low Stock Items',  value: '12' },
        kpi4: { label: 'Inventory Value',  value: '\u20b948,000' },
        tableTitle: 'Inventory Log',
        headers: ['Product Name', 'Brand', 'Category', 'Stock Level', 'Price', 'Units Sold', 'Status'],
        rows: [
            ['Argan Oil Serum',      'Moroccanoil', 'Hair Care', '24', '\u20b91,500', '42',  '<span class="status-pill completed">In Stock</span>'],
            ['Volumizing Shampoo',   'Loreal',      'Hair Care', '3',  '\u20b9800',   '115', '<span class="status-pill pending">Low Stock</span>']
        ]
    },
    staff: {
        title: 'Staff & Attendance',
        subtitle: 'Employee performance and working hours',
        icon: 'user-check',
        kpi1: { label: 'Active Staff',  value: '18' },
        kpi2: { label: 'Total Hours',   value: '2,840' },
        kpi3: { label: 'Top Performer', value: 'Sarah M.' },
        kpi4: { label: 'Commission',    value: '\u20b942,000' },
        tableTitle: 'Staff Directory',
        headers: ['Staff Name', 'Role', 'Status', 'Appointments', 'Total Hours', 'Revenue', 'Rating'],
        rows: [
            ['Sarah M.', 'Senior Stylist', '<span class="status-pill active">Active</span>', '124', '160h', '\u20b985,000', '4.9/5'],
            ['Michael',  'Barber',         '<span class="status-pill active">Active</span>', '98',  '140h', '\u20b942,000', '4.7/5']
        ]
    },
    branch: {
        title: 'Branch Performance',
        subtitle: 'Multi-location comparative analysis',
        icon: 'map-pin',
        kpi1: { label: 'Active Branches', value: '3' },
        kpi2: { label: 'Top Branch',      value: 'Downtown' },
        kpi3: { label: 'Total Visits',    value: '4,210' },
        kpi4: { label: 'Growth YoY',      value: '+14%' },
        tableTitle: 'Branch Overview',
        headers: ['Branch Name', 'Manager', 'Staff Count', 'Monthly Visitors', 'Monthly Revenue', 'Growth', 'Status'],
        rows: [
            ['Downtown HQ', 'Ravi K.',  '12', '1,840', '\u20b94,50,000', '+18%', '<span class="status-pill active">Active</span>'],
            ['Indiranagar',  'Priya S.', '8',  '950',   '\u20b92,10,000', '+5%',  '<span class="status-pill active">Active</span>']
        ]
    },
    marketing: {
        title: 'Marketing ROI',
        subtitle: 'Campaign performance and conversion rates',
        icon: 'trending-up',
        kpi1: { label: 'Active Campaigns', value: '4' },
        kpi2: { label: 'Total Reach',      value: '12,400' },
        kpi3: { label: 'Conversions',      value: '840' },
        kpi4: { label: 'ROI',              value: '340%' },
        tableTitle: 'Campaign Tracking',
        headers: ['Campaign Name', 'Platform', 'Start Date', 'End Date', 'Spend', 'Conversions', 'Status'],
        rows: [
            ['Summer Special', 'Instagram', '2024-03-01', '2024-03-31', '\u20b95,000',  '142', '<span class="status-pill active">Running</span>'],
            ['Bridal Season',  'Facebook',  '2024-01-15', '2024-02-15', '\u20b912,000', '310', '<span class="status-pill completed">Completed</span>']
        ]
    },
    membership: {
        title: 'Memberships',
        subtitle: 'Active plans and recurring revenue',
        icon: 'award',
        kpi1: { label: 'Active Members', value: '420' },
        kpi2: { label: 'Monthly MRR',    value: '\u20b91,45,000' },
        kpi3: { label: 'Churn Rate',     value: '2.4%' },
        kpi4: { label: 'LTV',            value: '\u20b94,800' },
        tableTitle: 'Membership Logs',
        headers: ['Member Name', 'Tier', 'Join Date', 'Renewal Date', 'Monthly Fee', 'Total Value', 'Status'],
        rows: [
            ['Arjun Reddy', 'Gold Tier',   '2023-08-01', '2024-08-01', '\u20b9999', '\u20b98,000', '<span class="status-pill active">Active</span>'],
            ['Neha Gupta',  'Silver Tier', '2024-01-10', '2024-07-10', '\u20b9499', '\u20b91,500', '<span class="status-pill active">Active</span>']
        ]
    },
    expenses: {
        title: 'Expenses Report',
        subtitle: 'Track and analyse all business expenditures',
        icon: 'credit-card',
        backCat: null,
        kpi1: { label: 'Total Expenses',      value: 'Loading...' },
        kpi2: { label: 'Number of Expenses',  value: 'Loading...' },
        kpi3: { label: 'Avg Expense',         value: 'Loading...' },
        kpi4: null,
        tableTitle: 'Expense Records',
        headers: ['Date', 'Category', 'Amount', 'Notes', 'Added By'],
        rows: []
    },

    // ── FINANCIAL SUB-REPORTS ────────────────────────────────────────────────
    'fin-revenue': {
        title: 'Revenue',
        subtitle: 'Total income from all sources over time',
        icon: 'trending-up',
        backCat: 'financial',
        kpi1: { label: 'Total Revenue', value: '\u2014' },
        kpi2: { label: 'This Month',    value: '\u2014' },
        kpi3: { label: 'This Week',     value: '\u2014' },
        kpi4: { label: 'Avg Daily',     value: '\u2014' },
        tableTitle: 'Revenue Breakdown',
        headers: ['Date', 'Source', 'Description', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Service', 'Haircut & Styling', 'Card', '\u20b91,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Product', 'Argan Oil Serum',   'Cash', '\u20b91,500', '<span class="status-pill completed">Completed</span>']
        ]
    },
    'fin-payments': {
        title: 'Payments',
        subtitle: 'Payment methods breakdown and transaction history',
        icon: 'credit-card',
        backCat: 'financial',
        kpi1: { label: 'Total Collected',    value: '\u2014' },
        kpi2: { label: 'Number of Payments', value: '\u2014' },
        kpi3: { label: 'Cash',               value: '\u2014' },
        kpi4: { label: 'UPI',                value: '\u2014' },
        kpi5: { label: 'Card',               value: '\u2014' },
        tableTitle: 'Payment Events',
        headers: ['Date & Time', 'Transaction Ref', 'Source', 'Payment Method', 'Amount'],
        rows: []
    },
    'fin-refunds': {
        title: 'Refunds',
        subtitle: 'Refunded transactions and reversal details',
        icon: 'rotate-ccw',
        backCat: 'financial',
        kpi1: { label: 'Total Refunded', value: '\u2014' },
        kpi2: { label: 'No. of Refunds', value: '\u2014' },
        kpi3: { label: 'Avg Refund',     value: '\u2014' },
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
        kpi1: { label: 'Total Due',              value: '\u2014' },
        kpi2: { label: 'Pending Transactions',   value: '\u2014' },
        kpi3: { label: 'Avg Due',                value: '\u2014' },
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
        kpi1: { label: 'Total Discounts',  value: '\u2014' },
        kpi2: { label: 'This Month',       value: '\u2014' },
        kpi3: { label: 'Coupon Discounts', value: '\u2014' },
        kpi4: { label: 'Offer Discounts',  value: '\u2014' },
        tableTitle: 'Discount Records',
        headers: ['Date', 'Customer', 'Type', 'Code / Offer', 'Original', 'Discount', 'Final Amount'],
        rows: [
            ['2024-03-21', 'Nisha P.',  'Coupon', 'SAVE20',     '\u20b91,500', '-\u20b9300', '\u20b91,200'],
            ['2024-03-20', 'Arjun K.', 'Offer',  'Summer Deal', '\u20b92,000', '-\u20b9400', '\u20b91,600']
        ]
    },
    'fin-expenses': {
        title: 'Expenses',
        subtitle: 'All business expenditures by category',
        icon: 'shopping-cart',
        backCat: 'financial',
        kpi1: { label: 'Total Expenses',     value: 'Loading...' },
        kpi2: { label: 'Number of Expenses', value: 'Loading...' },
        kpi3: { label: 'Avg Expense',        value: 'Loading...' },
        kpi4: null,
        tableTitle: 'Expense Records',
        headers: ['Date', 'Category', 'Amount', 'Notes', 'Added By'],
        rows: []
    },

    // ── BOOKINGS SUB-REPORTS ─────────────────────────────────────────────────
    'bk-total': {
        title: 'Total Bookings',
        subtitle: 'All bookings across all statuses',
        icon: 'calendar',
        backCat: 'bookings',
        kpi1: { label: 'Total Bookings', value: 'Loading...' },
        kpi2: { label: 'Completed',      value: 'Loading...' },
        kpi3: { label: 'Cancelled',      value: 'Loading...' },
        kpi4: { label: 'No-Shows',       value: 'Loading...' },
        tableTitle: 'All Bookings',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Payment', 'Status'],
        rows: []
    },
    'bk-completed': {
        title: 'Completed Bookings & Revenue',
        subtitle: 'Completed appointments, realized revenue, and service performance',
        icon: 'check-circle',
        backCat: 'bookings',
        kpi1: { label: 'Completed Bookings',        value: 'Loading...' },
        kpi2: { label: 'Completion Rate',            value: 'Loading...' },
        kpi3: { label: 'Completed Bookings Revenue', value: 'Loading...' },
        kpi4: { label: 'Avg Revenue per Booking',    value: 'Loading...' },
        tableTitle: 'Completed Booking Records',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Amount', 'Payment', 'Status'],
        rows: []
    },
    'bk-cancelled': {
        title: 'Cancelled Bookings',
        subtitle: 'Cancellation count, reasons, and estimated revenue loss',
        icon: 'x-circle',
        backCat: 'bookings',
        kpi1: { label: 'Cancelled Bookings',      value: 'Loading...' },
        kpi2: { label: 'Cancellation Rate',        value: 'Loading...' },
        kpi3: { label: 'Estimated Value Affected', value: 'Loading...' },
        kpi4: { label: 'Same-Day Cancellations',   value: 'Loading...' },
        tableTitle: 'Cancelled Booking Records',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Staff', 'Est. Value', 'Reason', 'Status'],
        rows: []
    },
    'bk-no-shows': {
        title: 'No-Show Bookings',
        subtitle: 'Missed appointments, repeat no-shows, and estimated loss',
        icon: 'user-x',
        backCat: 'bookings',
        kpi1: { label: 'No-Show Bookings',        value: 'Loading...' },
        kpi2: { label: 'Estimated Value Missed',   value: 'Loading...' },
        kpi3: { label: 'No-Show Rate',             value: 'Loading...' },
        kpi4: { label: 'Repeat No-Show Customers', value: 'Loading...' },
        tableTitle: 'No-Show Booking Records',
        headers: ['Date', 'Time', 'Customer', 'Phone', 'Services Missed', 'Staff Assigned', 'Missed Value', 'Status'],
        rows: []
    },
    'bk-refunds': {
        title: 'Refunded Bookings',
        subtitle: 'Refunded appointments, amounts, and refund status',
        icon: 'rotate-ccw',
        backCat: 'bookings',
        kpi1: { label: 'Refunded Bookings', value: 'Loading...' },
        kpi2: { label: 'Total Refunded',    value: 'Loading...' },
        kpi3: { label: 'Average Refund',    value: 'Loading...' },
        kpi4: { label: 'Refund Rate',       value: 'Loading...' },
        tableTitle: 'Refunded Booking Records',
        headers: ['Date', 'Time', 'Customer', 'Service', 'Method', 'Amount', 'Reason / Notes', 'Status'],
        rows: []
    },

    // ── CUSTOMERS SUB-REPORTS ────────────────────────────────────────────────
    'cust-metrics': {
        title: 'Customers Overview',
        subtitle: 'Total, new, active and inactive customers',
        icon: 'users',
        backCat: 'customers',
        kpi1: { label: 'Total Customers',   value: 'Loading...' },
        kpi2: { label: 'New This Month',     value: 'Loading...' },
        kpi3: { label: 'Active Customers',   value: 'Loading...' },
        kpi4: { label: 'Inactive Customers', value: 'Loading...' },
        tableTitle: 'Customer Overview',
        headers: ['Customer', 'Total Bookings', 'Completed', 'Revenue', 'First Booking', 'Last Booking', 'Last Completed', 'Type', 'Status'],
        rows: []
    },
    'cust-insights': {
        title: 'Customer Insights',
        subtitle: 'Deep-dive into customer behaviour and spend',
        icon: 'bar-chart-2',
        backCat: 'customers',
        kpi1: { label: 'Top Customer',           value: 'Loading...' },
        kpi2: { label: 'Avg Revenue / Customer', value: 'Loading...' },
        kpi3: { label: 'Avg Visits / Customer',  value: 'Loading...' },
        kpi4: { label: 'Repeat Customer Rate',   value: 'Loading...' },
        tableTitle: 'Customer Deep-Dive',
        headers: ['Customer', 'Total Visits', 'Total Spend', 'Avg / Visit', 'Favourite Service', 'Last Visit', 'Status'],
        rows: []
    },

    // ── OPERATIONS SUB-REPORTS ───────────────────────────────────────────────
    'ops-staff': {
        title: 'Staff Performance',
        subtitle: 'Revenue, bookings and ratings by staff member',
        icon: 'user-check',
        backCat: 'operations',
        kpi1: { label: 'Total Bookings Handled',  value: 'Loading...' },
        kpi2: { label: 'Total Revenue Generated', value: 'Loading...' },
        kpi3: { label: 'Avg Bookings / Staff',    value: 'Loading...' },
        kpi4: { label: 'Avg Revenue / Staff',     value: 'Loading...' },
        tableTitle: 'Staff Performance Breakdown',
        headers: ['Staff Name', 'Total Bookings', 'Completed', 'Completion Rate', 'Revenue', 'Avg / Booking', 'Last Booking', 'Status'],
        rows: []
    },
    'ops-branch': {
        title: 'Branch Performance',
        subtitle: 'Multi-location comparison and trends',
        icon: 'map-pin',
        backCat: 'operations',
        kpi1: { label: 'Total Branches',      value: 'Loading...' },
        kpi2: { label: 'Total Revenue',        value: 'Loading...' },
        kpi3: { label: 'Top Branch',           value: 'Loading...' },
        kpi4: { label: 'Avg Revenue / Branch', value: 'Loading...' },
        tableTitle: 'Branch Comparison',
        headers: ['Branch', 'Active Staff', 'Bookings', 'Completed', 'Cancelled', 'No-Shows', 'Revenue', 'Expenses', 'Net Revenue', 'Completion Rate', 'Status'],
        rows: []
    },

    // ── PRODUCT SALES SUB-REPORTS ──────────────────────────────────────────
    'prod-overview': {
        title: 'Product Sales Overview',
        subtitle: 'Executive summary of retail performance for the selected date range and branch',
        icon: 'bar-chart-2',
        backCat: 'products',
        leftChartTitle: 'Sales Revenue Trend',
        rightChartTitle: 'Sales by Category',
        kpi1: { label: 'Total Sales',        value: 'Loading...' },
        kpi2: { label: 'Net Sales',          value: 'Loading...' },
        kpi3: { label: 'Quantity Sold',      value: 'Loading...' },
        kpi4: { label: 'Unique Products',    value: 'Loading...' },
        tableTitle: 'Sales Transactions',
        headers: ['Date & Time', 'Sale Ref', 'Customer', 'Staff / Stylist', 'Items & Qty', 'Gross Total', 'Discount', 'Final Amount', 'Payment', 'Status'],
        rows: []
    },
    'prod-wise': {
        title: 'Product-wise Sales Report',
        subtitle: 'Detailed performance metrics for each retail product SKU',
        icon: 'box',
        backCat: 'products',
        leftChartTitle: 'Product Sales Volume Trend',
        rightChartTitle: 'Top 5 Products Volume',
        kpi1: { label: 'Active SKUs Sold',   value: 'Loading...' },
        kpi2: { label: 'Total Units Sold',   value: 'Loading...' },
        kpi3: { label: 'Gross Sales',        value: 'Loading...' },
        kpi4: { label: 'Total Discounts',    value: 'Loading...' },
        tableTitle: 'Product Performance Ledger',
        headers: ['Product Name', 'SKU / ID', 'Category', 'Qty Sold', 'Qty Returned', 'Gross Sales', 'Discounts', 'Net Sales', 'Transactions'],
        rows: []
    },
    'prod-category': {
        title: 'Sales by Category',
        subtitle: 'Compare product categories and identify top revenue drivers',
        icon: 'grid',
        backCat: 'products',
        leftChartTitle: 'Category Revenue Comparison',
        rightChartTitle: 'Category Revenue Share',
        kpi1: { label: 'Total Categories',     value: 'Loading...' },
        kpi2: { label: 'Top Category',         value: 'Loading...' },
        kpi3: { label: 'Total Items Sold',     value: 'Loading...' },
        kpi4: { label: 'Avg Rev / Category',   value: 'Loading...' },
        tableTitle: 'Category Breakdown',
        headers: ['Category Name', 'Active SKUs', 'Units Sold', 'Gross Revenue', 'Discounts', 'Net Revenue', 'Revenue %', 'Top Product'],
        rows: []
    },
    'prod-transactions': {
        title: 'Sales Transactions Report',
        subtitle: 'Searchable ledger of individual retail POS sales and line items',
        icon: 'file-text',
        backCat: 'products',
        leftChartTitle: 'Daily POS Transaction Volume',
        rightChartTitle: 'Payment Method Breakdown',
        kpi1: { label: 'Total Transactions',   value: 'Loading...' },
        kpi2: { label: 'Avg Order Value (AOV)',value: 'Loading...' },
        kpi3: { label: 'Total Items Sold',     value: 'Loading...' },
        kpi4: { label: 'Total Collected',      value: 'Loading...' },
        tableTitle: 'POS Sales Ledger',
        headers: ['Invoice Ref', 'Date & Time', 'Customer', 'Staff / Stylist', 'Items & Qty', 'Gross Amount', 'Discount', 'Net Amount', 'Payment', 'Status'],
        rows: []
    },
    'prod-discounts': {
        title: 'Product Discounts Report',
        subtitle: 'Understand how discounts, coupons, and membership perks impact sales',
        icon: 'tag',
        backCat: 'products',
        leftChartTitle: 'Discounts vs Net Sales Trend',
        rightChartTitle: 'Discounts by Type',
        kpi1: { label: 'Total Discounts',     value: 'Loading...' },
        kpi2: { label: 'Discounted Sales',    value: 'Loading...' },
        kpi3: { label: 'Avg Discount / Sale', value: 'Loading...' },
        kpi4: { label: 'Discount Rate %',     value: 'Loading...' },
        tableTitle: 'Discount & Coupon Usage Log',
        headers: ['Invoice Ref', 'Date', 'Customer', 'Discount Type', 'Code / Campaign', 'Gross Amount', 'Discount (₹)', 'Final Amount', 'Effective %'],
        rows: []
    },
    'prod-returns': {
        title: 'Product Returns & Refunds Report',
        subtitle: 'Track returned retail products, refunds, and their impact on net revenue',
        icon: 'rotate-ccw',
        backCat: 'products',
        leftChartTitle: 'Returns & Refunds Trend',
        rightChartTitle: 'Return Reasons Breakdown',
        kpi1: { label: 'Return Requests',    value: 'Loading...' },
        kpi2: { label: 'Units Returned',     value: 'Loading...' },
        kpi3: { label: 'Total Refunded',     value: 'Loading...' },
        kpi4: { label: 'Return Rate %',      value: 'Loading...' },
        tableTitle: 'Product Returns Ledger',
        headers: ['Return Ref', 'Original Invoice', 'Return Date', 'Product', 'Qty', 'Returned Value', 'Refunded Amount', 'Payment Method', 'Reason', 'Status'],
        rows: []
    },
    'prod-payments': {
        title: 'Sales Payments Report',
        subtitle: 'Reconcile sales against payments recorded across cash, UPI, card, and refunds',
        icon: 'credit-card',
        backCat: 'products',
        leftChartTitle: 'Daily Payment Collections Trend',
        rightChartTitle: 'Payment Tender Split',
        kpi1: { label: 'Total Collected',    value: 'Loading...' },
        kpi2: { label: 'Pending Dues',       value: 'Loading...' },
        kpi3: { label: 'Refunded Amount',    value: 'Loading...' },
        kpi4: { label: 'Net Reconciled',     value: 'Loading...' },
        tableTitle: 'Sales Payment Reconciliation',
        headers: ['Payment Ref', 'Invoice Ref', 'Date & Time', 'Customer', 'Sale Total', 'Collected', 'Payment Mode', 'Status'],
        rows: []
    }
};

const TYPE_MODULE_MAP = {
    // Financial
    'financial':        './report-modules/financial.js',
    'fin-revenue':      './report-modules/financial.js',
    'fin-payments':     './report-modules/financial.js',
    'fin-refunds':      './report-modules/financial.js',
    'fin-pending-dues': './report-modules/financial.js',
    'fin-discounts':    './report-modules/financial.js',
    'fin-expenses':     './report-modules/financial.js',
    'expenses':         './report-modules/financial.js',

    // Product Sales
    'prod-overview':     './report-modules/products-sales.js',
    'prod-wise':         './report-modules/products-sales.js',
    'prod-category':     './report-modules/products-sales.js',
    'prod-transactions': './report-modules/products-sales.js',
    'prod-discounts':    './report-modules/products-sales.js',
    'prod-returns':      './report-modules/products-sales.js',
    'prod-payments':     './report-modules/products-sales.js',

    // Bookings
    'bookings':     './report-modules/bookings.js',
    'bk-total':     './report-modules/bookings.js',
    'bk-completed': './report-modules/bookings.js',
    'bk-cancelled': './report-modules/bookings.js',
    'bk-no-shows':  './report-modules/bookings.js',
    'bk-refunds':   './report-modules/bookings.js',

    // Customers
    'customers':     './report-modules/customers.js',
    'cust-metrics':  './report-modules/customers.js',
    'cust-insights': './report-modules/customers.js',

    // Operations
    'staff':      './report-modules/operations.js',
    'services':   './report-modules/operations.js',
    'branch':     './report-modules/operations.js',
    'ops-staff':  './report-modules/operations.js',
    'ops-branch': './report-modules/operations.js',

    // Misc
    'membership': './report-modules/misc.js',
    'marketing':  './report-modules/misc.js',
    'products':   './report-modules/misc.js'
};

// ============================================================
// Report Date Range Popover Modal Controller
// ============================================================
function initReportDateFilterModal() {
    const btnModal       = document.getElementById('btnDateFilterModal');
    const menu           = document.getElementById('reportDateFilterMenu');
    const labelEl        = document.getElementById('dateFilterLabel');
    const presetsView    = document.getElementById('datePresetsView');
    const customView     = document.getElementById('dateCustomView');
    const btnBackPresets = document.getElementById('btnBackToPresets');
    const startInput     = document.getElementById('filterStartDate');
    const endInput       = document.getElementById('filterEndDate');
    const btnReset       = document.getElementById('btnFilterReset');
    const btnApply       = document.getElementById('btnApplyFilters');
    const radios         = document.querySelectorAll('input[name="reportPresetDate"]');

    if (!btnModal || !menu) return;

    let activePreset = 'last_30_days';
    let isCustomMode = false;

    const toIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const calculatePreset = (val) => {
        const now = new Date();
        const y   = now.getFullYear();
        const m   = now.getMonth();
        const d   = now.getDate();

        if (val === 'today') {
            const todayStr = toIso(now);
            return { start: todayStr, end: todayStr, label: 'Today' };
        }
        if (val === 'last_7_days' || val === 'one_week') {
            const past7 = new Date(now);
            past7.setDate(d - 6);
            return { start: toIso(past7), end: toIso(now), label: 'Last 7 Days' };
        }
        if (val === 'last_30_days' || val === 'one_month') {
            const past30 = new Date(now);
            past30.setDate(d - 29);
            return { start: toIso(past30), end: toIso(now), label: 'Last 30 Days' };
        }
        if (val === 'all_time') {
            return { start: '2000-01-01', end: '2099-12-31', label: 'All Time' };
        }
        if (val === 'last_3_months') {
            const threeMonthsAgo = new Date(now);
            threeMonthsAgo.setMonth(m - 3);
            return { start: toIso(threeMonthsAgo), end: toIso(now), label: 'Last 3 Months' };
        }
        if (val === 'last_6_months') {
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(m - 6);
            return { start: toIso(sixMonthsAgo), end: toIso(now), label: 'Last 6 Months' };
        }
        if (val === 'last_12_months' || val === 'one_year') {
            const oneYearAgo = new Date(now);
            oneYearAgo.setFullYear(y - 1);
            return { start: toIso(oneYearAgo), end: toIso(now), label: 'Last 12 Months' };
        }
        return null;
    };

    const showPresetsView = () => {
        isCustomMode = false;
        if (presetsView) presetsView.style.display = 'block';
        if (customView) customView.style.display = 'none';
        if (window.feather) window.feather.replace();
    };

    const showCustomView = () => {
        isCustomMode = true;
        if (presetsView) presetsView.style.display = 'none';
        if (customView) customView.style.display = 'block';
        if (window.feather) window.feather.replace();
    };

    const setRadioChecked = (val) => {
        radios.forEach(r => {
            r.checked = (r.value === val);
        });
        activePreset = val;
    };

    // Toggle popover menu
    btnModal.onclick = (e) => {
        e.stopPropagation();
        const willShow = !menu.classList.contains('show');
        if (willShow) {
            setRadioChecked(activePreset);
            if (!isCustomMode) {
                showPresetsView();
            } else {
                showCustomView();
            }
            menu.classList.add('show');
            if (window.feather) window.feather.replace();
        } else {
            menu.classList.remove('show');
        }
    };

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !btnModal.contains(e.target)) {
            menu.classList.remove('show');
        }
    });

    // Preset radio selection
    radios.forEach(radio => {
        radio.addEventListener('click', () => {
            radios.forEach(r => {
                if (r !== radio) r.checked = false;
            });
            radio.checked = true;
        });

        radio.addEventListener('change', () => {
            if (radio.value === 'custom') {
                showCustomView();
                if (startInput) startInput.focus();
                return;
            }
            setRadioChecked(radio.value);

            const preset = calculatePreset(radio.value);
            if (preset && startInput && endInput) {
                startInput.value = preset.start;
                endInput.value   = preset.end;
                activePreset = radio.value;
                isCustomMode = false;
                if (labelEl) labelEl.textContent = preset.label;
                menu.classList.remove('show');
                if (btnApply) btnApply.click();
            }
        });
    });

    // Support clicking label of custom dates
    const labelCustom = document.getElementById('labelCustomDates');
    if (labelCustom) {
        labelCustom.onclick = (e) => {
            const radioCustom = document.getElementById('radioCustomDates');
            if (radioCustom) radioCustom.checked = true;
            showCustomView();
        };
    }

    // Back button in Custom view
    if (btnBackPresets) {
        btnBackPresets.onclick = (e) => {
            e.stopPropagation();
            showPresetsView();
        };
    }

    // Default to Last 30 Days on initial load
    const initialPreset = calculatePreset('last_30_days');
    if (initialPreset && startInput && endInput && !startInput.value && !endInput.value) {
        startInput.value = initialPreset.start;
        endInput.value   = initialPreset.end;
        if (labelEl) labelEl.textContent = 'Last 30 Days';
        setRadioChecked('last_30_days');
    }

    // Reset button: resets to Last 30 Days, switches to Presets view, closes modal, reloads
    if (btnReset) {
        btnReset.onclick = (e) => {
            e.stopPropagation();
            const preset = calculatePreset('last_30_days');
            if (preset && startInput && endInput) {
                startInput.value = preset.start;
                endInput.value   = preset.end;
                setRadioChecked('last_30_days');
                if (labelEl) labelEl.textContent = 'Last 30 Days';
            }
            showPresetsView();
            menu.classList.remove('show');
            if (btnApply) btnApply.click();
        };
    }

    // Apply button: updates label based on current mode and closes menu
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            menu.classList.remove('show');
            if (isCustomMode) {
                if (startInput && endInput && startInput.value && endInput.value) {
                    if (startInput.value > endInput.value) {
                        const tmp = startInput.value;
                        startInput.value = endInput.value;
                        endInput.value = tmp;
                    }
                    const fmtD = (s) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    if (labelEl) labelEl.textContent = `${fmtD(startInput.value)} - ${fmtD(endInput.value)}`;
                    setRadioChecked('custom');
                } else if (labelEl) {
                    labelEl.textContent = 'Custom Dates';
                    setRadioChecked('custom');
                }
            } else {
                const preset = calculatePreset(activePreset);
                if (labelEl && preset) labelEl.textContent = preset.label;
            }
        });
    }

    if (window.feather) window.feather.replace();
}

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Initialize Date Range Filter Popover Modal
    initReportDateFilterModal();
    // 1. Read ?type= from URL
    const urlParams = new URLSearchParams(window.location.search);
    let type = urlParams.get('type') || 'financial';

    // Normalize: fall back to financial if type is unrecognised
    if (!REPORT_TYPES[type]) {
        type = 'financial';
    }

    const data = REPORT_TYPES[type];
    data.type  = type;
    console.log('[report-builder] Initializing "' + type + '" report views.');

    // 2. Update page title
    document.title = data.title + ' - BharathBots Reports';

    // 3. Update header elements
    const titleEl           = document.getElementById('reportTitle');
    const subtitleEl        = document.getElementById('reportSubtitle');
    const leftChartTitleEl  = document.getElementById('leftChartTitle');
    const rightChartTitleEl = document.getElementById('rightChartTitle');

    if (titleEl)           titleEl.textContent           = data.title;
    if (subtitleEl)        subtitleEl.textContent        = data.subtitle;
    if (leftChartTitleEl && data.leftChartTitle) {
        leftChartTitleEl.textContent = data.leftChartTitle;
    }
    if (rightChartTitleEl) {
        if (data.rightChartTitle) {
            rightChartTitleEl.textContent = data.rightChartTitle;
        } else {
            rightChartTitleEl.textContent = (type === 'bk-total') ? 'Booking Status Distribution' : 'Distribution';
        }
    }

    // 4. Wire Back breadcrumb
    const backLinkEl = document.getElementById('reportBackLink');
    if (backLinkEl) {
        if (data.backCat) {
            const catLabels = {
                financial:  'Financial',
                bookings:   'Bookings',
                customers:  'Customers',
                operations: 'Operations',
                products:   'Product Sales'
            };
            backLinkEl.textContent = '\u2190 Back to ' + (catLabels[data.backCat] || data.backCat) + ' Reports';
            backLinkEl.href        = 'report-category.html?cat=' + data.backCat;
        } else {
            backLinkEl.textContent = '\u2190 Back to Report Library';
            backLinkEl.href        = 'reports.html';
        }
    }

    // 5. Set table section title
    const tableHeaderTitle = document.getElementById('tableTitleText') || document.querySelector('.data-table-container .table-header h2');
    if (tableHeaderTitle && data.tableTitle) {
        tableHeaderTitle.textContent = data.tableTitle;
    }

    // 6. Render KPI cards or Snapshot panel
    const snapPanel  = document.getElementById('bkSnapshotPanel');
    const snapComp   = document.getElementById('bkCompletedSnapshotPanel');
    const snapCanc   = document.getElementById('bkCancelledSnapshotPanel');
    const snapNoShow = document.getElementById('bkNoShowSnapshotPanel');
    const snapRefund = document.getElementById('bkRefundSnapshotPanel');
    const kpiRow     = document.getElementById('kpiRow');

    const isSnapshotReport = ['bk-total', 'bk-completed', 'bk-cancelled', 'bk-no-shows', 'bk-refunds'].includes(type);
    if (isSnapshotReport) {
        if (snapPanel)  snapPanel.style.display  = (type === 'bk-total')     ? 'block' : 'none';
        if (snapComp)   snapComp.style.display   = (type === 'bk-completed') ? 'block' : 'none';
        if (snapCanc)   snapCanc.style.display   = (type === 'bk-cancelled') ? 'block' : 'none';
        if (snapNoShow) snapNoShow.style.display = (type === 'bk-no-shows')  ? 'block' : 'none';
        if (snapRefund) snapRefund.style.display = (type === 'bk-refunds')   ? 'block' : 'none';
        if (kpiRow)     kpiRow.style.display     = 'none';
    } else {
        if (snapPanel)  snapPanel.style.display  = 'none';
        if (snapComp)   snapComp.style.display   = 'none';
        if (snapCanc)   snapCanc.style.display   = 'none';
        if (snapNoShow) snapNoShow.style.display = 'none';
        if (snapRefund) snapRefund.style.display = 'none';
        if (kpiRow)     kpiRow.style.display     = 'grid';
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    }

    // 7. Delegate to the category module
    const modulePath = TYPE_MODULE_MAP[type] || './report-modules/misc.js';
    try {
        const reportModule = await import(modulePath);
        if (reportModule && typeof reportModule.render === 'function') {
            await reportModule.render(data, supabase, type);
        } else {
            updateTable(data.headers, data.rows || []);
        }
    } catch (err) {
        console.error('[report-builder] Failed to load module "' + type + '":', err);
        updateTable(data.headers, data.rows || []);
    }
});
