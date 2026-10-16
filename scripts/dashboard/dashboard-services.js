// scripts/dashboard/dashboard-services.js
// Handles fetching and rendering top services for today and the past 7 days.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderTopServicesToday(currentBranchId) {
    const listContainer = document.getElementById('topServicesTodayList');
    if (!listContainer || !currentBranchId) return;

    try {
        const companyId = getCompanyId();
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Call RPC: dashboard_top_services for today
        const { data: services, error } = await supabase.rpc('dashboard_top_services', {
            p_branch_id:  currentBranchId,
            p_company_id: companyId || null,
            p_period:     'today',
            p_today:      today
        });

        if (error) throw error;

        if (!services || services.length === 0) {
            listContainer.innerHTML = '<li class="centered-placeholder">No services recorded today.</li>';
            return;
        }

        const maxCount = Math.max(...services.map(s => Number(s.count || 0)), 1);
        const colors = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#818cf8', '#fb7185'];

        listContainer.innerHTML = services.map((s, idx) => {
            const count = Number(s.count || 0);
            const percentage = Math.round((count / maxCount) * 100);
            const color = colors[idx % colors.length];
            return `
                <li class="services-today-item">
                    <div class="sti-info" style="align-items: center; margin-right: 15px;">
                        <span class="sti-dot" style="background:${color};"></span>
                        <span class="sti-name" style="line-height: 1.2;">${s.service_name}</span>
                    </div>
                    <div class="sti-right">
                        <div class="sti-bar-track">
                            <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                        </div>
                        <span class="sti-count" style="width: 25px; text-align: right; font-weight: 700;">${count}</span>
                    </div>
                </li>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching Top Services Today:", err);
        listContainer.innerHTML = '<li class="centered-placeholder" style="color:#ef4444;">Error loading services.</li>';
    }
}

export async function fetchAndRenderTopServicesWeekly(currentBranchId) {
    const listContainer = document.getElementById('topServicesWeeklyList');
    if (!listContainer || !currentBranchId) return;

    try {
        const companyId = getCompanyId();
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Call RPC: dashboard_top_services for week
        const { data: services, error } = await supabase.rpc('dashboard_top_services', {
            p_branch_id:  currentBranchId,
            p_company_id: companyId || null,
            p_period:     'week',
            p_today:      today
        });

        if (error) throw error;

        if (!services || services.length === 0) {
            listContainer.innerHTML = '<li class="centered-placeholder" style="min-height: 180px;">No service data for this week.</li>';
            return;
        }

        listContainer.style = '';

        const maxCount = Math.max(...services.map(s => Number(s.count || 0)), 1);
        const colors = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#818cf8', '#fb7185'];

        listContainer.innerHTML = services.map((s, idx) => {
            const count = Number(s.count || 0);
            const percentage = Math.round((count / maxCount) * 100);
            const color = colors[idx % colors.length];
            
            return `
                <li class="services-today-item">
                    <div class="sti-info" style="align-items: center; margin-right: 15px;">
                        <span class="sti-dot" style="background:${color};"></span>
                        <span class="sti-name" style="line-height: 1.2;">${s.service_name}</span>
                    </div>
                    <div class="sti-right">
                        <div class="sti-bar-track">
                            <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                        </div>
                        <span class="sti-count" style="width: 25px; text-align: right; font-weight: 700;">${count}</span>
                    </div>
                </li>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching Weekly Top Services:", err);
        listContainer.innerHTML = '<li class="centered-placeholder" style="color:#ef4444; min-height: 180px;">Error loading services.</li>';
    }
}
