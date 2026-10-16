// scripts/dashboard/dashboard-kpis.js
// Dashboard KPI stat cards — data fetcher and renderer.
// RPC: dashboard_statcards_four(p_branch_id, p_company_id)

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderDashboardKPIs(currentBranchId) {
    if (!currentBranchId) return;

    const companyId = getCompanyId();
    if (!companyId) {
        console.warn('fetchAndRenderDashboardKPIs: company_id not found in localStorage.');
        return;
    }

    try {
        const { data, error } = await supabase.rpc('dashboard_statcards_four', {
            p_branch_id:  currentBranchId,
            p_company_id: companyId
        });

        if (error) throw error;

        // RPC returns an array with one row; unwrap it
        const d = Array.isArray(data) ? data[0] : data;
        if (!d) return;

        // ── Formatting helpers ────────────────────────────────────────────────
        const fmtTrend = (val) =>
            `<i data-feather="trending-${val >= 0 ? 'up' : 'down'}"></i> ${Math.abs(val)}%`;
        const trendClass = (val) => `stat-trend ${val >= 0 ? 'positive' : 'negative'}`;

        // ── Card 1 · Today's Bookings ─────────────────────────────────────────
        const elBookings = document.getElementById('kpiTodayBookings');
        if (elBookings) {
            elBookings.textContent = d.todays_bookings;
            const bTrendEl = document.getElementById('kpiTodayBookingsTrend');
            if (bTrendEl) {
                bTrendEl.innerHTML = `${fmtTrend(d.booking_trend)} vs yesterday`;
                bTrendEl.className = trendClass(d.booking_trend);
            }
        }

        // ── Card 2 · Completed Appointments ──────────────────────────────────
        const elAppts = document.getElementById('kpiCompletedAppts');
        if (elAppts) {
            elAppts.innerHTML = `${d.completed_appointments} <span class="stat-value-sub" id="kpiCompletedApptsSub">/ ${d.todays_bookings} total</span>`;
            const cTrendEl = document.getElementById('kpiCompletedApptsTrend');
            if (cTrendEl) {
                cTrendEl.innerHTML = `<i data-feather="trending-${d.completion_rate >= 50 ? 'up' : 'down'}"></i> ${d.completion_rate}% completion rate`;
                cTrendEl.className = trendClass(d.completion_rate - 50);
            }
        }

        // ── Card 3 · No-shows & Cancellations ────────────────────────────────
        const elNoShows = document.getElementById('kpiNoShows');
        if (elNoShows) {
            elNoShows.innerHTML = `No-shows: <strong>${d.no_shows}</strong>`;
        }
        const elCancelled = document.getElementById('kpiCancelled');
        if (elCancelled) {
            elCancelled.innerHTML = `Cancelled: <strong>${d.cancelled}</strong>`;
        }

        // ── Card 4 · Today's Revenue ──────────────────────────────────────────
        const elRevenue = document.getElementById('kpiTodayRevenue');
        if (elRevenue) {
            elRevenue.textContent = `₹${Number(d.todays_revenue).toLocaleString('en-IN')}`;
            const rTrendEl = document.getElementById('kpiTodayRevenueTrend');
            if (rTrendEl) {
                rTrendEl.innerHTML = `${fmtTrend(d.revenue_trend)} vs yesterday`;
                rTrendEl.className = trendClass(d.revenue_trend);
            }
        }

        // Re-render feather icons injected above
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('Error fetching Dashboard KPIs:', err);
    }
}
