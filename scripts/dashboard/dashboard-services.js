// scripts/dashboard/dashboard-services.js
// Handles fetching and rendering top services for today and the past 7 days.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderTopServicesToday(currentBranchId) {
    const listContainer = document.getElementById('topServicesTodayList');
    if (!listContainer || !currentBranchId) return;

    try {
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const companyId = getCompanyId();

        // Fetch today's bookings for this branch
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('service_name, price')
            .eq('company_id', companyId)
            .eq('branch_id', currentBranchId)
            .eq('booking_date', today)
            .not('status', 'in', '("cancelled","no-show")');

        if (error) throw error;

        if (!bookings || bookings.length === 0) {
            listContainer.innerHTML = '<li class="centered-placeholder">No services recorded today.</li>';
            return;
        }

        // Aggregate counts
        const serviceMap = {};
        bookings.forEach(b => {
            const name = b.service_name || 'Other';
            if (!serviceMap[name]) {
                serviceMap[name] = { name, count: 0, revenue: 0 };
            }
            serviceMap[name].count++;
            serviceMap[name].revenue += Number(b.price || 0);
        });

        const allCounts = [...new Set(Object.values(serviceMap).map(s => s.count))].sort((a, b) => b - a);
        
        // We just sort by frequencies then revenue, and cap strictly at 5 rows
        const allTiedServices = [];
        allCounts.forEach(count => {
            const tiedServices = Object.values(serviceMap)
                .filter(s => s.count === count)
                .sort((a, b) => b.revenue - a.revenue);
            allTiedServices.push(...tiedServices);
        });

        const finalServices = allTiedServices.slice(0, 5);
        const maxCount = finalServices.length > 0 ? finalServices[0].count : 1;
        const colors = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#818cf8', '#fb7185'];

        listContainer.innerHTML = finalServices.map((s, idx) => {
            const percentage = Math.round((s.count / maxCount) * 100);
            const color = colors[idx % colors.length];
            return `
                <li class="services-today-item">
                    <div class="sti-info" style="align-items: center; margin-right: 15px;">
                        <span class="sti-dot" style="background:${color};"></span>
                        <span class="sti-name" style="line-height: 1.2;">${s.name}</span>
                    </div>
                    <div class="sti-right">
                        <div class="sti-bar-track">
                            <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                        </div>
                        <span class="sti-count" style="width: 25px; text-align: right; font-weight: 700;">${s.count}</span>
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
        const endDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const startDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - (6 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

        // Fetch bookings for the last 7 days
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('service_name, price')
            .eq('company_id', companyId)
            .eq('branch_id', currentBranchId)
            .gte('booking_date', startDate)
            .lte('booking_date', endDate)
            .not('status', 'in', '("cancelled","no-show")');

        if (error) throw error;

        if (!bookings || bookings.length === 0) {
            listContainer.innerHTML = '<li class="centered-placeholder" style="min-height: 180px;">No service data for this week.</li>';
            return;
        }

        // Aggregate counts and revenue
        const serviceMap = {};
        bookings.forEach(b => {
            const name = b.service_name || 'Other';
            if (!serviceMap[name]) {
                serviceMap[name] = { name, count: 0, revenue: 0 };
            }
            serviceMap[name].count++;
            serviceMap[name].revenue += Number(b.price || 0);
        });

        const allCounts = [...new Set(Object.values(serviceMap).map(s => s.count))].sort((a, b) => b - a);
        
        // We just sort by frequencies then revenue, and cap strictly at 5 rows
        const allTiedServices = [];
        allCounts.forEach(count => {
            const tiedServices = Object.values(serviceMap)
                .filter(s => s.count === count)
                .sort((a, b) => b.revenue - a.revenue);
            allTiedServices.push(...tiedServices);
        });

        const finalServices = allTiedServices.slice(0, 5);

        // Revert any inline styles injected for the grid
        listContainer.style = '';

        const colors = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#818cf8', '#fb7185'];
        const maxCount = finalServices.length > 0 ? finalServices[0].count : 1;

        listContainer.innerHTML = finalServices.map((s, idx) => {
            const percentage = Math.round((s.count / maxCount) * 100);
            const color = colors[idx % colors.length];
            
            return `
                <li class="services-today-item">
                    <div class="sti-info" style="align-items: center; margin-right: 15px;">
                        <span class="sti-dot" style="background:${color};"></span>
                        <span class="sti-name" style="line-height: 1.2;">${s.name}</span>
                    </div>
                    <div class="sti-right">
                        <div class="sti-bar-track">
                            <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                        </div>
                        <span class="sti-count" style="width: 25px; text-align: right; font-weight: 700;">${s.count}</span>
                    </div>
                </li>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching Weekly Top Services:", err);
        listContainer.innerHTML = '<li class="centered-placeholder" style="color:#ef4444; min-height: 180px;">Error loading services.</li>';
    }
}
