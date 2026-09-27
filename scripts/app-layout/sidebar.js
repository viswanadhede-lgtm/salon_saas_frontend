/**
 * scripts/app-layout/sidebar.js
 * Controls desktop sidebar collapse, mobile drawer, submenu accordion,
 * active navigation state determination, and global Escape key listener.
 */

// Route to primary navigation and submenu mapping
export const ROUTE_NAV_MAP = {
    // Dashboard section
    'dashboard.html':               { route: 'dashboard', subroute: null },
    'todays-bookings.html':         { route: 'dashboard', subroute: null },
    'completed-appointments.html':  { route: 'dashboard', subroute: null },
    'no-shows-cancellations.html':  { route: 'dashboard', subroute: null },
    'todays-revenue.html':          { route: 'dashboard', subroute: null },
    'upcoming-appointments.html':   { route: 'dashboard', subroute: null },

    // Bookings section
    'bookings.html':                { route: 'bookings', subroute: null },

    // Customers section
    'customers.html':               { route: 'customers', subroute: null },

    // Staff section
    'staff.html':                   { route: 'staff', subroute: 'staff' },
    'staff-schedule.html':          { route: 'staff', subroute: 'staff-schedule' },

    // Services section
    'services.html':                { route: 'services', subroute: null },
    'service-categories.html':      { route: 'services', subroute: null },

    // Sales section
    'pos.html':                     { route: 'sales', subroute: 'pos' },
    'products.html':                { route: 'sales', subroute: 'products' },
    'sales-history.html':           { route: 'sales', subroute: 'sales-history' },
    'payment-pos.html':             { route: 'sales', subroute: 'pos' },

    // Payments section
    'pending-payments.html':        { route: 'payments', subroute: 'pending-payments' },
    'payments-history.html':        { route: 'payments', subroute: 'payments-history' },
    'payment-booking.html':         { route: 'payments', subroute: 'pending-payments' },
    'payment-membership.html':      { route: 'payments', subroute: 'pending-payments' },

    // Marketing section
    'offers.html':                  { route: 'marketing', subroute: 'offers' },
    'coupons.html':                 { route: 'marketing', subroute: 'coupons' },
    'memberships.html':             { route: 'marketing', subroute: 'memberships' },
    'ad-campaigns.html':            { route: 'marketing', subroute: 'ad-campaigns' },

    // Analytics section
    'overview.html':                { route: 'analytics', subroute: 'overview' },
    'reports.html':                 { route: 'analytics', subroute: 'reports' },
    'report-category.html':         { route: 'analytics', subroute: 'reports' },
    'report-detail.html':           { route: 'analytics', subroute: 'reports' },
    'expenses.html':                { route: 'analytics', subroute: 'expenses' },

    // Settings section
    'company.html':                 { route: 'settings', subroute: 'company' },
    'settings-business.html':       { route: 'settings', subroute: 'company' },
    'settings-contact.html':        { route: 'settings', subroute: 'company' },
    'settings-branding.html':       { route: 'settings', subroute: 'company' },
    'settings-hours.html':          { route: 'settings', subroute: 'company' },
    'settings-tax.html':            { route: 'settings', subroute: 'company' },
    'settings-billing.html':        { route: 'settings', subroute: 'company' },
    'settings-invoice.html':        { route: 'settings', subroute: 'company' },
    'settings-invoice-common.html': { route: 'settings', subroute: 'company' },
    'settings-invoice-booking.html':{ route: 'settings', subroute: 'company' },
    'settings-invoice-pos.html':    { route: 'settings', subroute: 'company' },
    'settings-invoice-membership.html': { route: 'settings', subroute: 'company' },
    'settings-booking.html':        { route: 'settings', subroute: 'company' },
    'settings-payments.html':       { route: 'settings', subroute: 'company' },
    'settings-notifications.html':  { route: 'settings', subroute: 'company' },
    'users.html':                   { route: 'settings', subroute: 'users' },
    'roles-permissions.html':       { route: 'settings', subroute: 'roles-permissions' },
    'billing-subscription.html':    { route: 'settings', subroute: 'billing-subscription' },
    'branches.html':                { route: 'settings', subroute: 'company' },
    'support.html':                 { route: 'settings', subroute: null },
    'issue-history.html':           { route: 'settings', subroute: null }
};

/**
 * Initialize Desktop and Mobile Sidebar Toggle
 */
export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const mobileToggleBtn = document.getElementById('mobileSidebarToggle');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (!sidebar) return;

    // Desktop: Check local storage for persistent collapsed preference
    const sidebarState = localStorage.getItem('sidebar_collapsed');
    if (sidebarState === 'true') {
        sidebar.classList.add('collapsed');
        if (toggleBtn) toggleBtn.setAttribute('title', 'Open sidebar');
    }

    // Desktop Toggle: Click event
    if (toggleBtn && !toggleBtn.dataset.appLayoutInit) {
        toggleBtn.dataset.appLayoutInit = '1';
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebar_collapsed', isCollapsed);
            toggleBtn.setAttribute('title', isCollapsed ? 'Open sidebar' : 'Close sidebar');
        });
    }

    // Mobile Toggle: Open/Close Drawer
    if (mobileToggleBtn && !mobileToggleBtn.dataset.appLayoutInit) {
        mobileToggleBtn.dataset.appLayoutInit = '1';
        mobileToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = sidebar.classList.toggle('open');
            if (sidebarBackdrop) {
                sidebarBackdrop.classList.toggle('active', isOpen);
            }
        });
    }

    // Mobile Backdrop: Close when clicking overlay
    if (sidebarBackdrop && !sidebarBackdrop.dataset.appLayoutInit) {
        sidebarBackdrop.dataset.appLayoutInit = '1';
        sidebarBackdrop.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarBackdrop.classList.remove('active');
        });
    }

    // Global Keydown: Close mobile drawer or profile menu on Escape
    if (!window._appLayoutKeydownBound) {
        window._appLayoutKeydownBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
                }
                const profileMenu = document.getElementById('profileMenu');
                const profileBackdrop = document.getElementById('profileBackdrop');
                if (profileMenu && profileMenu.classList.contains('show')) {
                    profileMenu.classList.remove('show');
                    if (profileBackdrop) profileBackdrop.classList.remove('active');
                }
                const genericModal = document.getElementById('genericModalOverlay');
                if (genericModal && genericModal.classList.contains('active')) {
                    genericModal.classList.remove('active');
                }
                const scheduleModal = document.getElementById('scheduleModalOverlay');
                if (scheduleModal && scheduleModal.classList.contains('active')) {
                    scheduleModal.classList.remove('active');
                }
            }
        });
    }
}

/**
 * Initialize Submenu Accordions
 */
export function initSubmenus() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const submenuToggles = document.querySelectorAll('.submenu-toggle');

    submenuToggles.forEach(toggle => {
        if (toggle.dataset.appLayoutInit) return;
        toggle.dataset.appLayoutInit = '1';

        const handleToggle = (e) => {
            e.preventDefault();
            const parentItem = toggle.closest('.has-submenu');
            if (!parentItem) return;

            parentItem.classList.toggle('submenu-open');

            // If user opens a submenu while sidebar is collapsed, expand sidebar
            if (sidebar && sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                localStorage.setItem('sidebar_collapsed', 'false');
                if (toggleBtn) toggleBtn.setAttribute('title', 'Close sidebar');
            }
        };

        toggle.addEventListener('click', handleToggle);
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                handleToggle(e);
            }
        });
    });
}

/**
 * Centralized Active Navigation Determination
 */
export function updateActiveNav() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Normalize current path name (e.g. "/bookings.html" -> "bookings.html")
    let pathname = window.location.pathname;
    let filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'dashboard.html';

    // Clear hardcoded active states
    sidebar.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active', 'submenu-open'));
    sidebar.querySelectorAll('.submenu-link').forEach(el => el.classList.remove('active'));

    const mapping = ROUTE_NAV_MAP[filename] || { route: 'dashboard', subroute: null };

    // Find parent nav item by data-route or link href
    const parentNavItem = sidebar.querySelector(`.nav-item[data-route="${mapping.route}"]`)
        || Array.from(sidebar.querySelectorAll('.nav-item')).find(item => {
            const link = item.querySelector('a.nav-link');
            return link && link.getAttribute('href') === filename;
        });

    if (parentNavItem) {
        parentNavItem.classList.add('active');

        // If it's a submenu group
        if (parentNavItem.classList.contains('has-submenu')) {
            parentNavItem.classList.add('submenu-open');

            // Find matching sub-link
            if (mapping.subroute) {
                const subLink = parentNavItem.querySelector(`.submenu-link[data-subroute="${mapping.subroute}"]`)
                    || parentNavItem.querySelector(`.submenu-link[href="${filename}"]`);
                if (subLink) {
                    subLink.classList.add('active');
                }
            } else {
                const subLink = parentNavItem.querySelector(`.submenu-link[href="${filename}"]`);
                if (subLink) {
                    subLink.classList.add('active');
                }
            }
        }
    }
}
