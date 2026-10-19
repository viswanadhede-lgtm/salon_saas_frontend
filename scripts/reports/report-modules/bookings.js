// scripts/reports/report-modules/bookings.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

// Helper to initialize branch dropdown from Supabase
async function setupBranchDropdown(supabase, companyId, filterBranch) {
    if (!filterBranch || !companyId) return;
    try {
        const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
        if (bList && bList.length > 0) {
            const existing = filterBranch.value;
            filterBranch.innerHTML = '<option value="all">All Branches</option>' +
                bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
            filterBranch.value = existing || 'all';
        }
    } catch (e) {
        console.warn('Branch fetch failed:', e);
    }
}

// Helper to set default date inputs
function setupDefaultDates(filterStart, filterEnd) {
    if (filterStart && filterEnd && !filterStart.value && !filterEnd.value) {
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
        filterStart.value = firstDay.toISOString().split('T')[0];
        filterEnd.value = today.toISOString().split('T')[0];
    }
}

// ============================================================
// 1. COMPLETED BOOKINGS & REVENUE (bk-completed)
// ============================================================
async function renderBkCompleted(data, supabase) {
    const companyId = localStorage.getItem('company_id');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setupDefaultDates(filterStart, filterEnd);

    const loadCompletedData = async () => {
        // 1. KPI Cards
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // 2. Trend Bar Chart: Completed Bookings & Revenue over time
        const trendLabels = ['Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19'];
        const trendValues = [18, 24, 21, 35, 42, 38];
        if (typeof renderTrendChart === 'function') {
            renderTrendChart(trendLabels, trendValues);
        }

        // 3. Donut Chart: Revenue by Service Category
        const distLabels = ['Hair Services', 'Skin Care', 'Spa & Wellness', 'Makeup'];
        const distValues = [118000, 64000, 39800, 24000];
        if (typeof renderDistributionChart === 'function') {
            renderDistributionChart(distLabels, distValues);
        }

        // Update hero insight in right chart
        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = '48%';
        if (hmLabel) hmLabel.textContent = 'Revenue from Hair Services';

        // 4. Data Table
        updateTable(data.headers, data.rows || []);
    };

    await setupBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadCompletedData);
    await loadCompletedData();
}

// ============================================================
// 2. CANCELLED BOOKINGS (bk-cancelled)
// ============================================================
async function renderBkCancelled(data, supabase) {
    const companyId = localStorage.getItem('company_id');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setupDefaultDates(filterStart, filterEnd);

    const loadCancelledData = async () => {
        // 1. KPI Cards
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // Color card 3 value red
        const val3 = document.getElementById('kpiValue3');
        if (val3) val3.style.color = '#ef4444';

        // 2. Trend Bar Chart: Cancellations over time
        const trendLabels = ['Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19'];
        const trendValues = [3, 5, 2, 8, 12, 6];
        if (typeof renderTrendChart === 'function') {
            renderTrendChart(trendLabels, trendValues);
        }

        // 3. Donut Chart: Cancellation Reasons
        const distLabels = ['Customer Emergency', 'Rescheduled', 'Staff Unavailable', 'No Reason Given'];
        const distValues = [28, 18, 12, 6];
        if (typeof renderDistributionChart === 'function') {
            renderDistributionChart(distLabels, distValues);
        }

        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = '44%';
        if (hmLabel) hmLabel.textContent = 'Customer Emergencies';

        // 4. Data Table
        updateTable(data.headers, data.rows || []);
    };

    await setupBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadCancelledData);
    await loadCancelledData();
}

// ============================================================
// 3. NO-SHOW BOOKINGS (bk-no-shows) - Matches Screenshots 2 & 3
// ============================================================
async function renderBkNoShows(data, supabase) {
    const companyId = localStorage.getItem('company_id');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setupDefaultDates(filterStart, filterEnd);

    const loadNoShowData = async () => {
        // 1. KPI Cards (Screenshot 2)
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // Styling for values
        const val1 = document.getElementById('kpiValue1');
        if (val1) val1.style.color = '#ef4444'; // Red value 128
        const val2 = document.getElementById('kpiValue2');
        if (val2) val2.style.color = '#1e293b';

        // 2. Trend Bar Chart: No-Shows by Day of Week
        const leftTitle = document.getElementById('leftChartTitle');
        if (leftTitle) leftTitle.textContent = 'No-Shows by Day of Week';
        const trendLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const trendValues = [12, 14, 11, 16, 22, 29, 24];
        if (typeof renderTrendChart === 'function') {
            renderTrendChart(trendLabels, trendValues);
        }

        // 3. Donut Chart: No-Shows by Service (Screenshot 3: 40%, 28%, 18%, 14%)
        const rightTitle = document.getElementById('rightChartTitle');
        if (rightTitle) rightTitle.textContent = 'No-Shows by Service';

        const distLabels = ['Hair Services', 'Skin Treatments', 'Spa Services', 'Other'];
        const distValues = [51, 36, 23, 18];
        if (typeof renderDistributionChart === 'function') {
            renderDistributionChart(distLabels, distValues);
        }

        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = '128';
        if (hmLabel) hmLabel.textContent = 'Total No-Shows';

        // 4. Data Table
        updateTable(data.headers, data.rows || []);
    };

    await setupBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadNoShowData);
    await loadNoShowData();
}

// ============================================================
// 4. REFUNDED BOOKINGS (bk-refunded) - Matches Screenshots 4 & 5
// ============================================================
async function renderBkRefunded(data, supabase) {
    const companyId = localStorage.getItem('company_id');
    const filterStart = document.getElementById('filterStartDate');
    const filterEnd = document.getElementById('filterEndDate');
    const filterBranch = document.getElementById('filterBranch');
    const btnApply = document.getElementById('btnApplyFilters');

    setupDefaultDates(filterStart, filterEnd);

    const loadRefundedData = async () => {
        // 1. KPI Cards (Screenshot 4)
        updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

        // Styling for total refunded in red
        const val2 = document.getElementById('kpiValue2');
        if (val2) val2.style.color = '#ef4444';

        // 2. Trend Bar Chart: Refund Volume Trend
        const leftTitle = document.getElementById('leftChartTitle');
        if (leftTitle) leftTitle.textContent = 'Refund Volume & Trend';
        const trendLabels = ['Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19'];
        const trendValues = [4, 6, 3, 9, 14, 8];
        if (typeof renderTrendChart === 'function') {
            renderTrendChart(trendLabels, trendValues);
        }

        // 3. Donut Chart: Refunds by Reason (Screenshot 5: 40%, 28%, 18%, 14%)
        const rightTitle = document.getElementById('rightChartTitle');
        if (rightTitle) rightTitle.textContent = 'Refunds by Reason';

        const distLabels = ['Customer cancellation', 'Service unavailable', 'Booking error', 'Other / unknown'];
        const distValues = [34, 24, 15, 13];
        if (typeof renderDistributionChart === 'function') {
            renderDistributionChart(distLabels, distValues);
        }

        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = '₹42.5k';
        if (hmLabel) hmLabel.textContent = 'Total Refunded';

        // 4. Data Table
        updateTable(data.headers, data.rows || []);
    };

    await setupBranchDropdown(supabase, companyId, filterBranch);
    if (btnApply) btnApply.addEventListener('click', loadRefundedData);
    await loadRefundedData();
}

// ============================================================
// Legacy Top-Level Handlers (for backward compatibility)
// ============================================================
async function renderBookings(data) {
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    updateTable(data.headers, data.rows || []);
}

async function renderBkTotal(data) {
    updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
    updateTable(data.headers, data.rows || []);
}

// ============================================================
// Dispatcher
// ============================================================
const handlers = {
    'bookings': renderBookings,
    'bk-total': renderBkTotal,
    'bk-completed': renderBkCompleted,
    'bk-cancelled': renderBkCancelled,
    'bk-no-shows': renderBkNoShows,
    'bk-refunded': renderBkRefunded
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
