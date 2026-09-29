// dashboard.js - Thin Orchestrator for BharathBots Main Dashboard
// Modularized from 1,704-line monolith into focused scripts under scripts/dashboard/
// Loaded via <script src="dashboard.js"></script> by dashboard.html

// ── 1. Immediate Global Navigation Contract ─────────────────────────────────
// Must be immediately available for inline HTML onclick/ondblclick handlers
window.navigateToBooking = function(status, bookingId) {
    status = (status || '').toLowerCase();
    if (status === 'completed') {
        window.location.href = `completed-appointments.html?highlight=${bookingId}`;
    } else if (status === 'cancelled' || status === 'no-show') {
        window.location.href = `no-shows-cancellations.html?highlight=${bookingId}`;
    } else {
        window.location.href = `upcoming-appointments.html?highlight=${bookingId}`;
    }
};

// ── 2. Global Data Refresh Coordinator ──────────────────────────────────────
window.refreshAllData = function(branchId) {
    const activeBranchId = branchId || localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
    
    // 1. Dashboard specific renderers
    if (typeof window.fetchAndRenderDashboardKPIs === 'function') {
        window.fetchAndRenderDashboardKPIs(activeBranchId);
    }
    if (typeof window.fetchAndRenderProductSales === 'function') {
        window.fetchAndRenderProductSales(activeBranchId);
    }
    if (typeof window.fetchAndRenderAppointments === 'function') {
        window.fetchAndRenderAppointments(activeBranchId);
    }
    if (typeof window.fetchAndRenderTopServicesToday === 'function') {
        window.fetchAndRenderTopServicesToday(activeBranchId);
    }
    if (typeof window.fetchAndRenderWeeklyRevenue === 'function') {
        window.fetchAndRenderWeeklyRevenue(activeBranchId);
    }
    if (typeof window.fetchAndRenderTopServicesWeekly === 'function') {
        window.fetchAndRenderTopServicesWeekly(activeBranchId);
    }
    
    // 2. Sub-pages (Today's Bookings, Completed, No-shows)
    if (typeof window.initPage === 'function') {
        window.initPage();
    }
    // 3. Revenue sub-page
    if (typeof window.calculateAndRenderRevenue === 'function') {
        window.calculateAndRenderRevenue();
    }
    // 4. Bookings page
    if (typeof window.fetchBookings === 'function') {
        window.fetchBookings();
    }
};

// ── 3. Async Module Loader & Dashboard Lifecycle ────────────────────────────
(async function initDashboardOrchestrator() {
    'use strict';

    try {
        const [
            stateMod,
            kpisMod,
            salesMod,
            apptsMod,
            servicesMod,
            revenueMod,
            navMod
        ] = await Promise.all([
            import('./scripts/dashboard/dashboard-state.js'),
            import('./scripts/dashboard/dashboard-kpis.js'),
            import('./scripts/dashboard/dashboard-sales.js'),
            import('./scripts/dashboard/dashboard-appointments.js'),
            import('./scripts/dashboard/dashboard-services.js'),
            import('./scripts/dashboard/dashboard-revenue.js'),
            import('./scripts/dashboard/dashboard-navigation.js')
        ]);

        const { getBranchId, getSelectedPlan, updateHeaderBadges } = stateMod;
        const { fetchAndRenderDashboardKPIs } = kpisMod;
        const { fetchAndRenderProductSales } = salesMod;
        const { fetchAndRenderAppointments, initAppointmentTabs } = apptsMod;
        const { fetchAndRenderTopServicesToday, fetchAndRenderTopServicesWeekly } = servicesMod;
        const { fetchAndRenderWeeklyRevenue } = revenueMod;
        const { navigateToBooking } = navMod;

        // Expose public dashboard renderers on window
        window.navigateToBooking = navigateToBooking;
        window.fetchAndRenderDashboardKPIs = fetchAndRenderDashboardKPIs;
        window.fetchAndRenderProductSales = fetchAndRenderProductSales;
        window.fetchAndRenderAppointments = fetchAndRenderAppointments;
        window.fetchAndRenderTopServicesToday = fetchAndRenderTopServicesToday;
        window.fetchAndRenderWeeklyRevenue = fetchAndRenderWeeklyRevenue;
        window.fetchAndRenderTopServicesWeekly = fetchAndRenderTopServicesWeekly;

        function runDashboardInit() {
            // Authentication check
            const authToken = localStorage.getItem('token');
            if (!authToken) {
                console.warn('No token found, redirecting to sign in');
            }

            // Sync header plan badge
            const selectedPlan = getSelectedPlan();
            updateHeaderBadges(selectedPlan);

            // Wire appointment tabs
            initAppointmentTabs();

            // Initial fetch if branch is resolved
            const branchId = getBranchId();
            if (branchId) {
                fetchAndRenderDashboardKPIs(branchId);
                fetchAndRenderProductSales(branchId);
                fetchAndRenderAppointments(branchId);
                fetchAndRenderTopServicesToday(branchId);
                fetchAndRenderWeeklyRevenue(branchId);
                fetchAndRenderTopServicesWeekly(branchId);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runDashboardInit);
        } else {
            runDashboardInit();
        }

    } catch (err) {
        console.error('Error loading dashboard modules:', err);
    }
})();
