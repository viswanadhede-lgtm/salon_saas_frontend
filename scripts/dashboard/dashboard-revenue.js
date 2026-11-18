// scripts/dashboard/dashboard-revenue.js
// Handles fetching and rendering the 7-day weekly revenue chart.
// Powered by RPC 3: dashboard_weekly_revenue.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderWeeklyRevenue(currentBranchId) {
    const chartContainer = document.getElementById('weeklyRevenueChart');
    if (!chartContainer) return;

    try {
        const companyId = getCompanyId();
        if (!companyId) {
            chartContainer.innerHTML = '<div class="centered-placeholder" style="color:#94a3b8; min-height: 180px;">No company session found.</div>';
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Sanitize branch UUID (if invalid or 'all', leave null to query company-wide)
        const validBranchId = (currentBranchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentBranchId))
            ? currentBranchId
            : null;

        // Call RPC: dashboard_weekly_revenue
        const { data: sortedItems, error } = await supabase.rpc('dashboard_weekly_revenue', {
            p_branch_id:  validBranchId,
            p_company_id: companyId,
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
