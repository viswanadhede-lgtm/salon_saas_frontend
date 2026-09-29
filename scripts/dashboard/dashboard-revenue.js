// scripts/dashboard/dashboard-revenue.js
// Handles fetching and rendering the 7-day weekly revenue chart

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderWeeklyRevenue(currentBranchId) {
    const chartContainer = document.getElementById('weeklyRevenueChart');
    if (!chartContainer || !currentBranchId) return;

    try {
        const companyId = getCompanyId();

        const now = new Date();
        const endDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const startDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - (6 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

        // Direct query — all 3 income streams, both paid + refunded rows
        const { data: txData, error } = await supabase
            .from('business_transactions')
            .select('paid_at, final_amount, amount, status')
            .eq('company_id', companyId)
            .eq('branch_id', currentBranchId)
            .in('status', ['paid', 'refunded'])
            .in('reference_type', ['booking', 'product', 'membership'])
            .gte('paid_at', startDate + 'T00:00:00')
            .lte('paid_at', endDate + 'T23:59:59');

        if (error) throw error;

        // Initialize last 7 days with 0
        const dayMap = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const dailyRevenue = {};

        for (let i = 0; i < 7; i++) {
            const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateKey = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            dailyRevenue[dateKey] = {
                date: dateKey,
                revenue: 0,
                day: dayMap[d.getDay()],
                isToday: i === 0
            };
        }

        // Aggregate: paid adds, refunded subtracts — net revenue per day
        if (txData) {
            txData.forEach(tx => {
                const dateKey = tx.paid_at ? tx.paid_at.split('T')[0] : null;
                if (!dateKey || !dailyRevenue[dateKey]) return;

                // Use final_amount (post-discount) with fallback to amount
                const value = Number(tx.final_amount ?? tx.amount ?? 0);

                if (tx.status === 'paid')     dailyRevenue[dateKey].revenue += value;
                if (tx.status === 'refunded') dailyRevenue[dateKey].revenue -= value;
            });
        }

        // Floor net at 0 (handles cross-week refunds)
        Object.values(dailyRevenue).forEach(d => {
            d.revenue = Math.max(0, d.revenue);
        });

        // Sort by date ascending for the chart
        const sortedItems = Object.values(dailyRevenue).sort((a, b) => a.date.localeCompare(b.date));
        const maxRevenue = Math.max(...sortedItems.map(item => item.revenue), 1000);

        chartContainer.innerHTML = sortedItems.map(item => {
            const heightPerc = Math.max(Math.round((item.revenue / maxRevenue) * 100), 2);
            return `
                <div class="bar-group ${item.isToday ? 'active' : ''}">
                    <div class="bar" style="height: ${heightPerc}%" title="₹${item.revenue.toLocaleString('en-IN')}"></div>
                    <span class="day">${item.day}</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching Weekly Revenue:", err);
        chartContainer.innerHTML = '<div class="centered-placeholder" style="color:#ef4444; min-height: 180px;">Error loading revenue.</div>';
    }
}
