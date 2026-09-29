// scripts/dashboard/dashboard-kpis.js
// Dashboard KPI cards data-fetcher and renderer.
// Calls Supabase RPC: get_dashboard_today_kpis.

import { supabase } from '../../lib/supabase.js';

export async function fetchAndRenderDashboardKPIs(currentBranchId) {
    if (!currentBranchId) return;
    
    try {
        const { data, error } = await supabase.rpc('get_dashboard_today_kpis', { 
            p_branch_id: currentBranchId 
        });

        if (error) throw error;
        
        if (data) {
            // Formatting Helpers
            const fmtTrend = (val) => `<i data-feather="trending-${val >= 0 ? 'up' : 'down'}"></i> ${Math.abs(val)}%`;
            const trendClass = (val) => `stat-trend ${val >= 0 ? 'positive' : 'negative'}`;

            // Card 1
            const elBookings = document.getElementById('kpiTodayBookings');
            if (elBookings) {
                elBookings.textContent = data.todays_bookings;
                const bTrendEl = document.getElementById('kpiTodayBookingsTrend');
                if (bTrendEl) {
                    bTrendEl.innerHTML = `${fmtTrend(data.booking_trend)} vs yesterday`;
                    bTrendEl.className = trendClass(data.booking_trend);
                }
            }

            // Card 2
            const elAppts = document.getElementById('kpiCompletedAppts');
            if (elAppts) {
                elAppts.innerHTML = `${data.completed_appointments} <span class="stat-value-sub" id="kpiCompletedApptsSub">/ ${data.todays_bookings} completed</span>`;
                const cTrendEl = document.getElementById('kpiCompletedApptsTrend');
                if (cTrendEl) {
                    cTrendEl.innerHTML = `<i data-feather="trending-${data.completion_rate >= 50 ? 'up' : 'down'}"></i> ${data.completion_rate}% completion rate`;
                    cTrendEl.className = trendClass(data.completion_rate - 50);
                }
            }

            // Card 3
            const elNoShows = document.getElementById('kpiNoShows');
            if (elNoShows) {
                elNoShows.innerHTML = `No-shows: <strong>${data.no_shows}</strong>`;
                const elCancelled = document.getElementById('kpiCancelled');
                if (elCancelled) {
                    elCancelled.innerHTML = `Cancelled: <strong>${data.cancelled}</strong>`;
                }
            }

            // Card 4
            const elRevenue = document.getElementById('kpiTodayRevenue');
            if (elRevenue) {
                elRevenue.textContent = `₹${Number(data.todays_revenue).toLocaleString('en-IN')}`;
                const rTrendEl = document.getElementById('kpiTodayRevenueTrend');
                if (rTrendEl) {
                    rTrendEl.innerHTML = `${fmtTrend(data.revenue_trend)} vs yesterday`;
                    rTrendEl.className = trendClass(data.revenue_trend);
                }
            }

            if (window.feather) feather.replace();
        }
    } catch (err) {
        console.error("Error fetching Dashboard KPIs:", err);
    }
}
