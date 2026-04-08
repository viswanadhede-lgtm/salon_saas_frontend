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
        kpi4: { label: 'Total Discounts', value: '₹12,450' }
    },
    bookings: {
        title: 'Bookings & Appointments',
        subtitle: 'Schedule utilization and appointment status',
        icon: 'calendar',
        kpi1: { label: 'Total Bookings', value: '1,245' },
        kpi2: { label: 'Completed', value: '1,120' },
        kpi3: { label: 'Cancellations', value: '85' },
        kpi4: { label: 'No-Shows', value: '40' }
    },
    customers: {
        title: 'Customer Analytics',
        subtitle: 'Retention, acquisition, and feedback',
        icon: 'users',
        kpi1: { label: 'Total Customers', value: '8,420' },
        kpi2: { label: 'New This Month', value: '342' },
        kpi3: { label: 'Retention Rate', value: '68%' },
        kpi4: { label: 'Avg Feedback', value: '4.8/5' }
    },
    services: {
        title: 'Service Performance',
        subtitle: 'Most popular and profitable services',
        icon: 'scissors',
        kpi1: { label: 'Top Service', value: 'Haircut' },
        kpi2: { label: 'Services Performed', value: '4,210' },
        kpi3: { label: 'Service Revenue', value: '₹4,12,000' },
        kpi4: { label: 'Avg Duration', value: '45m' }
    },
    products: {
        title: 'Inventory & Products',
        subtitle: 'Retail sales and stock levels',
        icon: 'package',
        kpi1: { label: 'Products Sold', value: '520' },
        kpi2: { label: 'Retail Revenue', value: '₹1,24,000' },
        kpi3: { label: 'Low Stock Items', value: '12' },
        kpi4: { label: 'Inventory Value', value: '₹48,000' }
    },
    staff: {
        title: 'Staff & Attendance',
        subtitle: 'Employee performance and working hours',
        icon: 'user-check',
        kpi1: { label: 'Active Staff', value: '18' },
        kpi2: { label: 'Total Hours', value: '2,840' },
        kpi3: { label: 'Top Performer', value: 'Sarah M.' },
        kpi4: { label: 'Commission', value: '₹42,000' }
    },
    branch: {
        title: 'Branch Performance',
        subtitle: 'Multi-location comparative analysis',
        icon: 'map-pin',
        kpi1: { label: 'Active Branches', value: '3' },
        kpi2: { label: 'Top Branch', value: 'Downtown' },
        kpi3: { label: 'Total Visits', value: '4,210' },
        kpi4: { label: 'Growth YoY', value: '+14%' }
    },
    marketing: {
        title: 'Marketing ROI',
        subtitle: 'Campaign performance and conversion rates',
        icon: 'trending-up',
        kpi1: { label: 'Active Campaigns', value: '4' },
        kpi2: { label: 'Total Reach', value: '12,400' },
        kpi3: { label: 'Conversions', value: '840' },
        kpi4: { label: 'ROI', value: '340%' }
    },
    membership: {
        title: 'Memberships',
        subtitle: 'Active plans and recurring revenue',
        icon: 'award',
        kpi1: { label: 'Active Members', value: '420' },
        kpi2: { label: 'Monthly MRR', value: '₹1,45,000' },
        kpi3: { label: 'Churn Rate', value: '2.4%' },
        kpi4: { label: 'LTV', value: '₹4,800' }
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

});
