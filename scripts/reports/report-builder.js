// scripts/reports/report-builder.js
// Thin orchestrator for report-detail.html based on the '?type=' query string

import { supabase } from '../../lib/supabase.js';
import { updateKPIs, updateTable } from './report-modules/shared.js';

const REPORT_TYPES = {
    financial: {
        title: 'Financial Reports',
        subtitle: 'Revenue, payments, and discounts analysis',
        icon: 'dollar-sign',
        kpi1: { label: 'Total Revenue', value: 'Ã¢â€šÂ¹2,82,900' },
        kpi2: { label: 'Total Transactions', value: '2,142' },
        kpi3: { label: 'Average Ticket', value: 'Ã¢â€šÂ¹1,320' },
        kpi4: { label: 'Total Discounts', value: 'Ã¢â€šÂ¹12,450' },
        tableTitle: 'Detailed Records',
        headers: ['Date', 'Transaction Type', 'Description', 'Category', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Payment', 'Haircut & Styling', 'Service', 'Card', 'Ã¢â€šÂ¹1,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Payment', 'Skin Care Kit', 'Product', 'Cash', 'Ã¢â€šÂ¹850', '<span class="status-pill completed">Completed</span>']
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
        kpi3: { label: 'Service Revenue', value: 'Ã¢â€šÂ¹4,12,000' },
        kpi4: { label: 'Avg Duration', value: '45m' },
        tableTitle: 'Service Metrics',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue generated', 'Trend'],
        rows: [
            ['Women\'s Haircut', 'Hair', '45m', 'Ã¢â€šÂ¹600', '420', 'Ã¢â€šÂ¹2,52,000', '<span style="color:var(--emerald);">+12%</span>'],
            ['Basic Facial', 'Skin', '60m', 'Ã¢â€šÂ¹1200', '150', 'Ã¢â€šÂ¹1,80,000', '<span style="color:var(--emerald);">+5%</span>']
        ]
    },
    products: {
        title: 'Inventory & Products',
        subtitle: 'Retail sales and stock levels',
        icon: 'package',
        kpi1: { label: 'Products Sold', value: '520' },
        kpi2: { label: 'Retail Revenue', value: 'Ã¢â€šÂ¹1,24,000' },
        kpi3: { label: 'Low Stock Items', value: '12' },
        kpi4: { label: 'Inventory Value', value: 'Ã¢â€šÂ¹48,000' },
        tableTitle: 'Inventory Log',
        headers: ['Product Name', 'Brand', 'Category', 'Stock Level', 'Price', 'Units Sold', 'Status'],
        rows: [
            ['Argan Oil Serum', 'Moroccanoil', 'Hair Care', '24', 'Ã¢â€šÂ¹1,500', '42', '<span class="status-pill completed">In Stock</span>'],
            ['Volumizing Shampoo', 'Loreal', 'Hair Care', '3', 'Ã¢â€šÂ¹800', '115', '<span class="status-pill pending">Low Stock</span>']
        ]
    },
    staff: {
        title: 'Staff & Attendance',
        subtitle: 'Employee performance and working hours',
        icon: 'user-check',
        kpi1: { label: 'Active Staff', value: '18' },
        kpi2: { label: 'Total Hours', value: '2,840' },
        kpi3: { label: 'Top Performer', value: 'Sarah M.' },
        kpi4: { label: 'Commission', value: 'Ã¢â€šÂ¹42,000' },
        tableTitle: 'Staff Directory',
        headers: ['Staff Name', 'Role', 'Status', 'Appointments', 'Total Hours', 'Revenue', 'Rating'],
        rows: [
            ['Sarah M.', 'Senior Stylist', '<span class="status-pill active">Active</span>', '124', '160h', 'Ã¢â€šÂ¹85,000', '4.9/5'],
            ['Michael', 'Barber', '<span class="status-pill active">Active</span>', '98', '140h', 'Ã¢â€šÂ¹42,000', '4.7/5']
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
            ['Downtown HQ', 'Ravi K.', '12', '1,840', 'Ã¢â€šÂ¹4,50,000', '+18%', '<span class="status-pill active">Active</span>'],
            ['Indiranagar', 'Priya S.', '8', '950', 'Ã¢â€šÂ¹2,10,000', '+5%', '<span class="status-pill active">Active</span>']
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
            ['Summer Special', 'Instagram', '2024-03-01', '2024-03-31', 'Ã¢â€šÂ¹5,000', '142', '<span class="status-pill active">Running</span>'],
            ['Bridal Season', 'Facebook', '2024-01-15', '2024-02-15', 'Ã¢â€šÂ¹12,000', '310', '<span class="status-pill completed">Completed</span>']
        ]
    },
    membership: {
        title: 'Memberships',
        subtitle: 'Active plans and recurring revenue',
        icon: 'award',
        kpi1: { label: 'Active Members', value: '420' },
        kpi2: { label: 'Monthly MRR', value: 'Ã¢â€šÂ¹1,45,000' },
        kpi3: { label: 'Churn Rate', value: '2.4%' },
        kpi4: { label: 'LTV', value: 'Ã¢â€šÂ¹4,800' },
        tableTitle: 'Membership Logs',
        headers: ['Member Name', 'Tier', 'Join Date', 'Renewal Date', 'Monthly Fee', 'Total Value', 'Status'],
        rows: [
            ['Arjun Reddy', 'Gold Tier', '2023-08-01', '2024-08-01', 'Ã¢â€šÂ¹999', 'Ã¢â€šÂ¹8,000', '<span class="status-pill active">Active</span>'],
            ['Neha Gupta', 'Silver Tier', '2024-01-10', '2024-07-10', 'Ã¢â€šÂ¹499', 'Ã¢â€šÂ¹1,500', '<span class="status-pill active">Active</span>']
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

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // FINANCIAL SUB-REPORTS
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    'fin-revenue': {
        title: 'Revenue',
        subtitle: 'Total income from all sources over time',
        icon: 'trending-up',
        backCat: 'financial',
        kpi1: { label: 'Total Revenue', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'This Month', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'This Week', value: 'Ã¢â‚¬â€' },
        kpi4: { label: 'Avg Daily', value: 'Ã¢â‚¬â€' },
        tableTitle: 'Revenue Breakdown',
        headers: ['Date', 'Source', 'Description', 'Payment Method', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Service', 'Haircut & Styling', 'Card', 'Ã¢â€šÂ¹1,200', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Product', 'Argan Oil Serum', 'Cash', 'Ã¢â€šÂ¹1,500', '<span class="status-pill completed">Completed</span>']
        ]
    },
    'fin-payments': {
        title: 'Payments',
        subtitle: 'Payment methods breakdown and transaction history',
        icon: 'credit-card',
        backCat: 'financial',
        kpi1: { label: 'Total Collected', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'Number of Payments', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'Cash', value: 'Ã¢â‚¬â€' },
        kpi4: { label: 'UPI', value: 'Ã¢â‚¬â€' },
        kpi5: { label: 'Card', value: 'Ã¢â‚¬â€' },
        tableTitle: 'Payment Events',
        headers: ['Date & Time', 'Transaction Ref', 'Source', 'Payment Method', 'Amount'],
        rows: []
    },
    'fin-refunds': {
        title: 'Refunds',
        subtitle: 'Refunded transactions and reversal details',
        icon: 'rotate-ccw',
        backCat: 'financial',
        kpi1: { label: 'Total Refunded', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'No. of Refunds', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'Avg Refund', value: 'Ã¢â‚¬â€' },
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
        kpi1: { label: 'Total Due', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'Pending Transactions', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'Avg Due', value: 'Ã¢â‚¬â€' },
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
        kpi1: { label: 'Total Discounts', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'This Month', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'Coupon Discounts', value: 'Ã¢â‚¬â€' },
        kpi4: { label: 'Offer Discounts', value: 'Ã¢â‚¬â€' },
        tableTitle: 'Discount Records',
        headers: ['Date', 'Customer', 'Type', 'Code / Offer', 'Original', 'Discount', 'Final Amount'],
        rows: [
            ['2024-03-21', 'Nisha P.', 'Coupon', 'SAVE20', 'Ã¢â€šÂ¹1,500', '-Ã¢â€šÂ¹300', 'Ã¢â€šÂ¹1,200'],
            ['2024-03-20', 'Arjun K.', 'Offer', 'Summer Deal', 'Ã¢â€šÂ¹2,000', '-Ã¢â€šÂ¹400', 'Ã¢â€šÂ¹1,600']
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

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // SALES & SERVICES SUB-REPORTS
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    'sales-total': {
        title: 'Total Sales',
        subtitle: 'Combined POS and service sales overview',
        icon: 'bar-chart-2',
        backCat: 'sales',
        kpi1: { label: 'Total Sales', value: 'Ã¢â‚¬â€' },
        kpi2: { label: 'Total Orders', value: 'Ã¢â‚¬â€' },
        kpi3: { label: 'Avg Order Value', value: 'Ã¢â‚¬â€' },
        kpi4: { label: 'Total Items Sold', value: 'Ã¢â‚¬â€' },
        tableTitle: 'Sales Ledger',
        headers: ['Date', 'Type', 'Customer', 'Description', 'Qty', 'Amount', 'Status'],
        rows: [
            ['2024-03-21', 'Service', 'Anita S.', 'Bridal Makeup', '1', 'Ã¢â€šÂ¹4,500', '<span class="status-pill completed">Completed</span>'],
            ['2024-03-21', 'Product', 'Walk-in', 'Argan Oil Serum', '2', 'Ã¢â€šÂ¹3,000', '<span class="status-pill completed">Completed</span>']
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
        kpi1: { label: 'Total Product Revenue', value: 'Loading...' },
        kpi2: { label: 'Total Items Sold', value: 'Loading...' },
        kpi3: { label: 'Total Orders', value: 'Loading...' },
        kpi4: { label: 'Average Order Value (AOV)', value: 'Loading...' },
        tableTitle: 'Product Inventory',
        headers: ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'],
        rows: []
    },
    'sales-top-services': {
        title: 'Top Services',
        subtitle: 'Highest performing services by bookings and revenue',
        icon: 'award',
        backCat: 'sales',
        kpi1: { label: 'Top Service Name', value: 'Loading...' },
        kpi2: { label: 'Top Service Revenue', value: 'Loading...' },
        kpi3: { label: 'Top 5 Revenue', value: 'Loading...' },
        kpi4: { label: 'Top 5 Contribution %', value: 'Loading...' },
        tableTitle: 'Service Rankings',
        headers: ['Service Name', 'Category', 'Duration', 'Price', 'Times Booked', 'Revenue Generated', 'Status'],
        rows: []
    },
    'sales-top-products': {
        title: 'Top Products',
        subtitle: 'Best-selling retail products by units and revenue',
        icon: 'box',
        backCat: 'sales',
        kpi1: { label: 'Top Product', value: 'Loading...' },
        kpi2: { label: 'Top 5 Revenue', value: 'Loading...' },
        kpi3: { label: 'Top 5 Contribution %', value: 'Loading...' },
        kpi4: { label: 'Best Seller (by quantity)', value: 'Loading...' },
        tableTitle: 'Product Rankings',
        headers: ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'],
        rows: []
    },
    'sales-membership-revenue': {
        title: 'Membership Revenue',
        subtitle: 'Revenue generated from membership plans',
        icon: 'award',
        backCat: 'sales',
        kpi1: { label: 'Total Membership Revenue', value: 'Loading...' },
        kpi2: { label: 'Total Memberships Sold', value: 'Loading...' },
        kpi3: { label: 'Total Plans Sold', value: 'Loading...' },
        kpi4: { label: 'Avg Membership Value', value: 'Loading...' },
        tableTitle: 'Membership Sales Details',
        headers: ['Plan Name', 'Duration', 'Price', 'Times Sold', 'Revenue Generated', 'Status'],
        rows: []
    },

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // BOOKINGS SUB-REPORTS
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
            ['2024-03-21', '10:00 AM', 'Ajay K.', 'Haircut', 'Michael', 'Ã¢â€šÂ¹600', '<span class="status-pill cancelled" style="background:#fef3c7;color:#92400e;">No-Show</span>'],
            ['2024-03-20', '02:00 PM', 'Sneha M.', 'Facial', 'Priya', 'Ã¢â€šÂ¹1,200', '<span class="status-pill cancelled" style="background:#fef3c7;color:#92400e;">No-Show</span>']
        ]
    },

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // CUSTOMERS SUB-REPORTS
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        kpi1: { label: 'Top Customer',            value: 'Loading...' },
        kpi2: { label: 'Avg Revenue / Customer',  value: 'Loading...' },
        kpi3: { label: 'Avg Visits / Customer',  value: 'Loading...' },
        kpi4: { label: 'Repeat Customer Rate',    value: 'Loading...' },
        tableTitle: 'Customer Deep-Dive',
        headers: ['Customer', 'Total Visits', 'Total Spend', 'Avg / Visit', 'Favourite Service', 'Last Visit', 'Status'],
        rows: []
    },


    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // OPERATIONS SUB-REPORTS
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        kpi1: { label: 'Total Branches',        value: 'Loading...' },
        kpi2: { label: 'Total Revenue',          value: 'Loading...' },
        kpi3: { label: 'Top Branch',             value: 'Loading...' },
        kpi4: { label: 'Avg Revenue / Branch',   value: 'Loading...' },
        tableTitle: 'Branch Comparison',
        headers: ['Branch', 'Active Staff', 'Bookings', 'Completed', 'Cancelled', 'No-Shows', 'Revenue', 'Expenses', 'Net Revenue', 'Completion Rate', 'Status'],
        rows: []
    }
};

const TYPE_MODULE_MAP = {
    // Financial
    'financial': './report-modules/financial.js',
    'fin-revenue': './report-modules/financial.js',
    'fin-payments': './report-modules/financial.js',
    'fin-refunds': './report-modules/financial.js',
    'fin-pending-dues': './report-modules/financial.js',
    'fin-discounts': './report-modules/financial.js',
    'fin-expenses': './report-modules/financial.js',
    'expenses': './report-modules/financial.js',

    // Sales
    'sales-total': './report-modules/sales.js',
    'sales-service-revenue': './report-modules/sales.js',
    'sales-product-sales': './report-modules/sales.js',
    'sales-membership-revenue': './report-modules/sales.js',
    'sales-top-products': './report-modules/sales.js',
    'sales-top-services': './report-modules/sales.js',

    // Bookings
    'bookings': './report-modules/bookings.js',
    'bk-total': './report-modules/bookings.js',
    'bk-completed': './report-modules/bookings.js',
    'bk-cancelled': './report-modules/bookings.js',
    'bk-no-shows': './report-modules/bookings.js',

    // Customers
    'customers': './report-modules/customers.js',
    'cust-metrics': './report-modules/customers.js',
    'cust-insights': './report-modules/customers.js',

    // Operations
    'staff': './report-modules/operations.js',
    'services': './report-modules/operations.js',
    'branch': './report-modules/operations.js',
    'ops-staff': './report-modules/operations.js',
    'ops-branch': './report-modules/operations.js',

    // Misc
    'membership': './report-modules/misc.js',
    'marketing': './report-modules/misc.js',
    'products': './report-modules/misc.js'
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get current tracking parameters
    const urlParams = new URLSearchParams(window.location.search);
    let type = urlParams.get('type') || 'financial';

    // Normalize fallback
    if (!REPORT_TYPES[type]) {
        type = 'financial';
    }

    const data = REPORT_TYPES[type];
    data.type = type;
    console.log([report-builder] Initializing  report views.);

    // 2. Update page <title>
    document.title = ${data.title} - BharathBots Reports;

    // 3. Update page header elements dynamically
    const titleEl = document.getElementById('reportTitle');
    const subtitleEl = document.getElementById('reportSubtitle');
    const rightChartTitleEl = document.getElementById('rightChartTitle');

    if (titleEl) titleEl.textContent = data.title;
    if (subtitleEl) subtitleEl.textContent = data.subtitle;
    if (rightChartTitleEl) rightChartTitleEl.textContent = 'Distribution';

    // 4. Wire "Back" breadcrumb link
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
            backLinkEl.textContent = Ã¢â€ Â Back to  Reports;
            backLinkEl.href = eport-category.html?cat=;
        } else {
            backLinkEl.textContent = 'Ã¢â€ Â Back to Report Library';
            backLinkEl.href = 'reports.html';
        }
    }

    // Set table header title if specified in metadata
    const tableHeaderTitle = document.querySelector('.data-table-container .table-header h2');
    if (tableHeaderTitle && data.tableTitle) {
        tableHeaderTitle.textContent = data.tableTitle;
    }

    // 5. Initial layout render
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

    // 6. Delegate to the category module
    const modulePath = TYPE_MODULE_MAP[type] || './report-modules/misc.js';
    try {
        const reportModule = await import(modulePath);
        if (reportModule && typeof reportModule.render === 'function') {
            await reportModule.render(data, supabase, type);
        } else {
            updateTable(data.headers, data.rows || []);
        }
    } catch (err) {
        console.error([report-builder] Failed to load module :, err);
        updateTable(data.headers, data.rows || []);
    }
});
