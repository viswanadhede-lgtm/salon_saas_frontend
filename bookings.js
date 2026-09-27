// bookings.js - Main Application Orchestrator
import { FEATURES } from './config/feature-registry.js';
import { getLiveBookings } from './scripts/bookings/bookings-state.js';
import { fetchBookings, setOnBookingsRefreshed } from './scripts/bookings/bookings-data.js';
import { renderBookings, toggleSvcExtra } from './scripts/bookings/bookings-table.js';
import { getFilteredBookings, populateStaffFilter, attachFilterListeners, toggleSort, _applyPendingStaffFilter } from './scripts/bookings/bookings-filters.js';
import { renderCalendar, initCalendarListeners } from './scripts/bookings/bookings-calendar.js';
import { setupModals } from './scripts/bookings/booking-modals-inject.js';
import { openEditBookingModal, attachEditModalListeners } from './scripts/bookings/booking-edit-modal.js';
import { updateBookingStatus, confirmUpdateBookingStatus, attachStatusActionsListeners } from './scripts/bookings/booking-status-actions.js';
import { openBookingPayment } from './scripts/bookings/booking-payment-bridge.js';
import { 
    openViewBookingModal, 
    triggerInvoice, 
    triggerRebook, 
    openCancelledBookingModal, 
    viewCustomerProfile, 
    openRefundModal, 
    triggerRefund, 
    attachViewModalsListeners 
} from './scripts/bookings/booking-view-modals.js';

// ─── Wire Data Refresh Handler ───────────────────────────────────────────────
setOnBookingsRefreshed(() => {
    populateStaffFilter();
    renderBookings(getFilteredBookings());
    if (typeof renderCalendar === 'function') {
        renderCalendar();
    }
});

// ─── Global Window Contract ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.fetchBookings               = fetchBookings;
    window.liveBookingsData            = getLiveBookings();
    window.openEditBookingModal        = openEditBookingModal;
    window.openBookingPayment          = openBookingPayment;
    window.openViewBookingModal        = openViewBookingModal;
    window.openCancelledBookingModal   = openCancelledBookingModal;
    window.viewCustomerProfile         = viewCustomerProfile;
    window.updateBookingStatus         = updateBookingStatus;
    window.confirmUpdateBookingStatus  = confirmUpdateBookingStatus;
    window.triggerInvoice              = triggerInvoice;
    window.triggerRebook               = triggerRebook;
    window.triggerRefund               = triggerRefund;
    window.openRefundModal             = openRefundModal;
    window.toggleSort                  = toggleSort;
    window.toggleSvcExtra              = toggleSvcExtra;
    window._applyPendingStaffFilter    = _applyPendingStaffFilter;
}

// ─── Tab Switching Logic ──────────────────────────────────────────────────────
function attachTabListeners() {
    const tabBtns = document.querySelectorAll('.bookings-tab-btn');
    const tabPanes = document.querySelectorAll('.bookings-tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
            }

            // If switching to Calendar, ensure calendar view is rendered
            if (targetId === 'paneCalendar' && typeof renderCalendar === 'function') {
                renderCalendar();
            }
        });
    });
}

// ─── Branch Switch Listener ──────────────────────────────────────────────────
function attachBranchListener() {
    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect) {
        branchSelect.addEventListener('change', async (e) => {
            const val = e.target.value;
            if (val && val !== 'branch_1' && val !== 'branch_2' && val !== 'all') {
                localStorage.setItem('branch_id', val);
                localStorage.setItem('active_branch_id', val);
            }
            await fetchBookings();
        });
    }
}

// ─── Page Initialization ──────────────────────────────────────────────────────
export async function initBookings() {
    window.fetchBookings = fetchBookings;
    setupModals();
    attachTabListeners();
    initCalendarListeners();
    attachBranchListener();
    attachFilterListeners();
    attachEditModalListeners();
    attachStatusActionsListeners();
    attachViewModalsListeners();

    // Listen for global payment recording event
    document.addEventListener('payment-recorded', async () => {
        console.log('[Bookings] Payment recorded event detected, refreshing...');
        await fetchBookings();
    });

    await fetchBookings();

    // Catch any delayed branch or auth context population
    setTimeout(() => {
        const currentData = getLiveBookings();
        if (!currentData || currentData.length === 0) {
            fetchBookings();
        }
    }, 600);
}

// Ensure calendar listeners are attached on DOMContentLoaded
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCalendarListeners);
    } else {
        initCalendarListeners();
    }
}

export { fetchBookings };
