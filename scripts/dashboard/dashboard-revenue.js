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
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Call RPC: dashboard_weekly_revenue
        const { data: sortedItems, error } = await supabase.rpc('dashboard_weekly_revenue', {
            p_branch_id:  currentBranchId,
            p_company_id: companyId || null,
            p_today:      today
        });

        if (error) throw error;

        const maxRevenue = Math.max(...(sortedItems || []).map(item => Number(item.revenue || 0)), 1000);

        chartContainer.innerHTML = (sortedItems || []).map(item => {
            const rev = Number(item.revenue || 0);
            const heightPerc = Math.max(Math.round((rev / maxRevenue) * 100), 2);
            return `
                <div class="bar-group ${item.is_today ? 'active' : ''}">
                    <div class="bar" style="height: ${heightPerc}%" title="₹${rev.toLocaleString('en-IN')}"></div>
                    <span class="day">${item.day_label}</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching Weekly Revenue:", err);
        chartContainer.innerHTML = '<div class="centered-placeholder" style="color:#ef4444; min-height: 180px;">Error loading revenue.</div>';
    }
}
