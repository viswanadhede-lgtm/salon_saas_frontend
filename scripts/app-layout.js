/**
 * scripts/app-layout.js
 * Centralized layout orchestrator for the BharathBots authenticated application shell.
 * Coordinates modularized sub-responsibilities:
 * - sidebar.js   : Sidebar collapse, mobile drawer, submenu accordion, active navigation
 * - profile.js   : Profile dropdown menu, modal injection, profile editing and photo upload
 * - settings.js  : App preferences fetching and saving
 * - schedule.js  : Staff work schedule modal and data rendering
 */

// 1. Sidebar & Navigation
import {
    ROUTE_NAV_MAP,
    initSidebar,
    initSubmenus,
    updateActiveNav
} from './app-layout/sidebar.js';

// 2. Profile Menu & Modal
import {
    initProfileMenu,
    openProfileModal,
    closeProfileModal,
    ensureProfileModalHtml,
    bindProfileModalEvents,
    hydrateProfileFromContext,
    handleProfileSave
} from './app-layout/profile.js';

// 3. Settings Modal
import {
    openSettingsModal,
    handleSettingsSave,
    fetchAndPopulateSettings
} from './app-layout/settings.js';

// 4. Schedule Modal
import {
    openScheduleModal,
    closeScheduleModal,
    ensureScheduleModalHtml,
    bindScheduleModalEvents,
    fetchAndRenderUserSchedule
} from './app-layout/schedule.js';

// Re-export sub-modules for complete backwards compatibility
export {
    ROUTE_NAV_MAP,
    initSidebar,
    initSubmenus,
    updateActiveNav,
    initProfileMenu,
    openProfileModal,
    closeProfileModal,
    ensureProfileModalHtml,
    bindProfileModalEvents,
    hydrateProfileFromContext,
    handleProfileSave,
    openSettingsModal,
    handleSettingsSave,
    fetchAndPopulateSettings,
    openScheduleModal,
    closeScheduleModal,
    ensureScheduleModalHtml,
    bindScheduleModalEvents,
    fetchAndRenderUserSchedule
};

// Preserve global window APIs for backwards compatibility
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeProfileModal;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;

/**
 * 5. Quick Actions ("New Booking" in Header)
 */
export function initQuickActions() {
    const btnNewBooking = document.getElementById('btnNewBooking');
    if (!btnNewBooking || btnNewBooking.dataset.appLayoutInit) return;

    btnNewBooking.dataset.appLayoutInit = '1';
    btnNewBooking.addEventListener('click', async (e) => {
        e.preventDefault();
        if (typeof window.openGlobalBookingModal === 'function') {
            window.openGlobalBookingModal();
        } else {
            try {
                const { initGlobalBookingModal } = await import('./global-booking-modal.js');
                initGlobalBookingModal();
                if (typeof window.openGlobalBookingModal === 'function') {
                    window.openGlobalBookingModal();
                }
            } catch (err) {
                console.error('[QuickActions] Failed to open booking modal:', err);
            }
        }
    });
}

/**
 * 6. Date Chip Population
 * Renders the current date and auto-refreshes at midnight so long sessions
 * (overnight shifts, open tabs) always show the correct date.
 */
let _dateChipMidnightTimer = null;

export function populateDateChip() {
    const chip   = document.getElementById('headerDateChip');
    if (!chip) return;
    const textEl = chip.querySelector('.date-chip-text');
    if (!textEl) return;

    // Write today's date
    const now = new Date();
    textEl.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day:     'numeric',
        month:   'short',
        year:    'numeric'
    });

    // Schedule a refresh at the next midnight (only once per session)
    if (_dateChipMidnightTimer) return;

    const msUntilMidnight = (() => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow - now;
    })();

    _dateChipMidnightTimer = setTimeout(() => {
        _dateChipMidnightTimer = null;
        populateDateChip();                         // refresh for the new day
        setInterval(() => populateDateChip(), 24 * 60 * 60 * 1000); // daily thereafter
    }, msUntilMidnight);
}

/**
 * Master layout initializer
 */
export function initLayout() {
    initSidebar();
    initSubmenus();
    updateActiveNav();
    initProfileMenu();
    initQuickActions();
    populateDateChip();

    // Render Feather Icons
    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }

    // Re-hydrate Header via global-auth-guard if available
    if (typeof window.populateGlobalHeader === 'function') {
        window.populateGlobalHeader();
    }

    // Apply sub-feature gating if available
    if (typeof window.applySubFeatureGates === 'function') {
        window.applySubFeatureGates();
    }
}
