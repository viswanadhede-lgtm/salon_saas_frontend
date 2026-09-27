/**
 * scripts/app-layout.js
 * Centralized layout controller for the BharathBots authenticated application shell.
 * Controls sidebar collapse, mobile drawer, submenu accordion, active navigation,
 * and header user profile dropdown.
 */

// Route to primary navigation and submenu mapping
const ROUTE_NAV_MAP = {
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
 * 1. Initialize Desktop and Mobile Sidebar Toggle
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
 * 2. Initialize Submenu Accordions
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
 * 3. Centralized Active Navigation Determination
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

/**
 * 4. Header User Profile Dropdown
 */
export function initProfileMenu() {
    const avatarBtn = document.getElementById('avatarBtn');
    const profileMenu = document.getElementById('profileMenu');
    const profileBackdrop = document.getElementById('profileBackdrop');
    const userProfileDropdown = document.getElementById('userProfileDropdown');

    if (!avatarBtn || !profileMenu) return;

    const closeProfileMenu = () => {
        profileMenu.classList.remove('show');
        if (profileBackdrop) profileBackdrop.classList.remove('active');
    };

    const openProfileMenu = () => {
        profileMenu.classList.add('show');
        if (profileBackdrop) profileBackdrop.classList.add('active');
    };

    // Toggle on Avatar click
    if (!avatarBtn.dataset.appLayoutInit) {
        avatarBtn.dataset.appLayoutInit = '1';
        avatarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            profileMenu.classList.contains('show') ? closeProfileMenu() : openProfileMenu();
        });
        avatarBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                profileMenu.classList.contains('show') ? closeProfileMenu() : openProfileMenu();
            }
        });
    }

    // Close on Backdrop click
    if (profileBackdrop && !profileBackdrop.dataset.appLayoutInit) {
        profileBackdrop.dataset.appLayoutInit = '1';
        profileBackdrop.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
        });
    }

    // Close when clicking outside
    if (!window._profileDropdownOutsideBound) {
        window._profileDropdownOutsideBound = true;
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('profileMenu');
            const dropdown = document.getElementById('userProfileDropdown');
            if (menu && menu.classList.contains('show') && dropdown && !dropdown.contains(e.target)) {
                closeProfileMenu();
            }
        });
    }

    // Wire Profile Button
    const profileBtn = document.getElementById('menuItemProfile');
    if (profileBtn && !profileBtn.dataset.appLayoutInit) {
        profileBtn.dataset.appLayoutInit = '1';
        profileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
            openProfileModal();
        });
    }

    // Wire Schedule Button
    const scheduleBtn = document.getElementById('menuItemSchedule');
    if (scheduleBtn && !scheduleBtn.dataset.appLayoutInit) {
        scheduleBtn.dataset.appLayoutInit = '1';
        scheduleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
            openScheduleModal();
        });
    }

    // Wire Settings Button
    const settingsBtn = document.getElementById('menuItemSettings');
    if (settingsBtn && !settingsBtn.dataset.appLayoutInit) {
        settingsBtn.dataset.appLayoutInit = '1';
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
            openSettingsModal();
        });
    }

    // Wire Logout Button with Confirmation
    const logoutBtn = document.getElementById('menuItemLogout');
    if (logoutBtn && !logoutBtn.dataset.appLayoutInit) {
        logoutBtn.dataset.appLayoutInit = '1';
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
            if (typeof window.openLogoutModal === 'function') {
                window.openLogoutModal();
            } else if (document.getElementById('logoutModalBackdrop')) {
                document.getElementById('logoutModalBackdrop').classList.add('active');
            } else if (confirm('Are you sure you want to logout?')) {
                if (typeof window.handleLogout === 'function') {
                    window.handleLogout();
                } else {
                    localStorage.removeItem('token');
                    localStorage.removeItem('appContext');
                    localStorage.removeItem('company_id');
                    window.location.href = 'signin.html';
                }
            }
        });
    }
}

let pendingProfilePhoto = null;

function ensureProfileModalHtml() {
    const existingOverlay = document.getElementById('genericModalOverlay');
    if (!existingOverlay) {
        if (!document.body) return;

        const modalHtml = `
    <!-- Profile & Settings Modal (Shared App Shell Component) -->
    <div class="modal-overlay" id="genericModalOverlay">
        <div class="modal-container" id="genericModal" style="width: 75%; max-width: 75%; min-height: 85vh;">
            <div class="modal-header">
                <div class="header-titles">
                    <h2 id="genericModalTitle">Profile</h2>
                    <p class="subtitle" id="genericModalSubtitle">View and manage your personal profile.</p>
                </div>
                <button class="modal-close" id="closeGenericModal"><i data-feather="x"></i></button>
            </div>

            <!-- Profile Body: 2-column layout -->
            <div class="modal-body" style="padding: 2rem 0; flex: 1; overflow-y: auto;" id="genericModalBody">
                <style>
                    #profileContent .form-label {
                        font-size: 0.85rem;
                        font-weight: 600;
                        margin-bottom: 6px;
                        color: #475569;
                        transition: color 0.2s ease;
                    }
                    #profileContent .form-group:hover .form-label {
                        color: #1e293b;
                    }
                    #profileContent .form-input {
                        height: 46px;
                        font-size: 0.95rem;
                        padding: 10px 16px;
                        border-radius: 10px;
                        border: 1px solid #e2e8f0;
                        background-color: #fafafa;
                        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) inset;
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    #profileContent .form-input:hover:not(.read-only-input) {
                        background-color: #ffffff;
                        border-color: #cbd5e1;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
                    }
                    #profileContent .form-input:focus {
                        background-color: #ffffff;
                        border-color: #8b5cf6;
                        box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12), 0 2px 4px rgba(0, 0, 0, 0.05);
                        transform: translateY(-1px);
                    }
                    #profileContent .read-only-input {
                        background-color: #f8fafc;
                        border-color: #f1f5f9;
                        color: #64748b;
                        box-shadow: none !important;
                        transform: none !important;
                    }
                    #profileContent .form-grid {
                        gap: 24px !important;
                        margin-bottom: 24px !important;
                    }
                    #profileContent .form-group {
                        margin-bottom: 24px;
                    }
                    .profile-avatar-wrap {
                        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease;
                    }
                    .profile-avatar-wrap:hover {
                        transform: scale(1.05) translateY(-2px);
                        box-shadow: 0 0 0 6px #e0e7ff, 0 12px 24px rgba(30, 58, 138, 0.2) !important;
                    }
                    .change-photo-btn {
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        position: relative;
                        overflow: hidden;
                    }
                    .change-photo-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
                    }
                    .change-photo-btn:active {
                        transform: translateY(0);
                    }
                    .profile-name-display {
                        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                        -webkit-background-clip: text;
                        background-clip: text;
                        -webkit-text-fill-color: transparent;
                        display: inline-block;
                    }
                </style>
                <div id="profileContent" style="display: grid; grid-template-columns: 35% 65%; gap: 0; min-height: 100%; width: 100%;">
                    <!-- LEFT: Avatar column -->
                    <div style="display: flex; flex-direction: column; align-items: center; padding: 1rem 2.5rem 2rem 2.5rem; border-right: 1px solid #f1f5f9; width: 100%; box-sizing: border-box; justify-content: flex-start;">
                        <div class="profile-avatar-wrap" style="width: 140px; height: 140px; margin-bottom: 24px; box-shadow: 0 0 0 4px #c7d2fe, 0 6px 16px rgba(30, 58, 138, 0.18); border-radius: 50%; overflow: hidden;">
                            <img id="profileAvatarImg" src="https://ui-avatars.com/api/?name=Admin+User&background=1E3A8A&color=fff&size=256" alt="Profile Avatar" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <label for="profilePhotoInput" class="change-photo-btn" style="padding: 10px 20px; font-size: 0.95rem; margin-bottom: 32px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: #eef2ff; color: #4338ca; font-weight: 500;">
                            <i data-feather="camera" style="width: 16px; height: 16px;"></i>
                            Change Photo
                        </label>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;">
                        <p class="profile-name-display" style="font-size: 1.35rem; font-weight: 700; margin-bottom: 6px;">Admin User</p>
                        <p class="profile-role-display" style="font-size: 0.95rem; padding: 6px 18px; background: #f1f5f9; border-radius: 20px; color: #475569; font-weight: 500;">Owner</p>
                    </div>

                    <!-- RIGHT: Form fields -->
                    <div style="display: flex; flex-direction: column; padding: 1rem 2.5rem 3rem 2.5rem; gap: 0; width: 100%; max-width: 720px; margin: 0 auto; box-sizing: border-box; justify-content: flex-start;">
                        <h3 style="font-size: 1rem; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">Personal Information</h3>

                        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileFirstName">First Name</label>
                                <input type="text" id="profileFirstName" class="form-input" value="Admin" placeholder="First name">
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileLastName">Last Name</label>
                                <input type="text" id="profileLastName" class="form-input" value="User" placeholder="Last name">
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="form-label" for="profilePhone">Phone Number</label>
                            <input type="tel" id="profilePhone" class="form-input" value="+91 98765 43210" placeholder="Phone number">
                        </div>

                        <div class="form-group" style="margin-bottom: 24px;">
                            <label class="form-label" for="profileEmail">Email Address</label>
                            <input type="email" id="profileEmail" class="form-input read-only-input" value="admin@salon.com" readonly>
                        </div>

                        <h3 style="font-size: 1rem; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                            Emergency Contact
                            <span style="font-size: 0.78rem; font-weight: 400; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Optional</span>
                        </h3>

                        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileEmergencyName">Contact Name</label>
                                <input type="text" id="profileEmergencyName" class="form-input" placeholder="Enter contact name">
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileEmergencyPhone">Contact Number</label>
                                <input type="tel" id="profileEmergencyPhone" class="form-input" placeholder="Enter contact number">
                            </div>
                        </div>

                        <h3 style="font-size: 1rem; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">Account Information</h3>

                        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileRole">Role</label>
                                <input type="text" id="profileRole" class="form-input read-only-input" value="Owner" readonly>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileBranch">Assigned Branch</label>
                                <input type="text" id="profileBranch" class="form-input read-only-input" value="Main Branch" readonly>
                            </div>
                        </div>

                        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileJoined">Joined On</label>
                                <input type="text" id="profileJoined" class="form-input read-only-input" value="January 15, 2024" readonly>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="profileLastLogin">Last Login</label>
                                <input type="text" id="profileLastLogin" class="form-input read-only-input" value="Today" readonly>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ===== SETTINGS CONTENT ===== -->
                <div id="settingsContent" style="display: none; grid-template-columns: 65% 35%; gap: 0; min-height: 100%; width: 100%;">
                    <!-- LEFT: App Preferences -->
                    <div style="display: flex; flex-direction: column; padding: 1rem 2.5rem 3rem 2.5rem; border-right: 1px solid #f1f5f9; width: 100%; box-sizing: border-box; justify-content: center; align-items: center;">
                        <div style="width: 100%; max-width: 450px;">
                            <h3 style="font-size: 1.1rem; font-weight: 600; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; width: 100%;">App Preferences</h3>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsLanguage">Language</label>
                                <select id="settingsLanguage" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="en" selected>English</option>
                                    <option value="hi">Hindi</option>
                                    <option value="te">Telugu</option>
                                    <option value="ta">Tamil</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsTheme">Theme</label>
                                <select id="settingsTheme" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="light" selected>Light</option>
                                    <option value="dark">Dark</option>
                                    <option value="system">System Default</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsNotifications">Notifications</label>
                                <select id="settingsNotifications" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="enabled" selected>Enabled</option>
                                    <option value="disabled">Disabled</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsTimeZone">Time Zone</label>
                                <select id="settingsTimeZone" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="Asia/Kolkata" selected>Asia/Kolkata (IST)</option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsDateTimeFormat">Date & Time Format</label>
                                <select id="settingsDateTimeFormat" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="DD MMM YYYY, hh:mm A" selected>DD MMM YYYY, hh:mm A</option>
                                    <option value="MM/DD/YYYY, HH:mm">MM/DD/YYYY, HH:mm</option>
                                    <option value="YYYY-MM-DD, HH:mm">YYYY-MM-DD, HH:mm</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <!-- RIGHT: App Information -->
                    <div style="display: flex; flex-direction: column; padding: 1rem 2.5rem 3rem 2.5rem; gap: 0; width: 100%; box-sizing: border-box; justify-content: flex-start;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">App Information</h3>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="form-label">Version</label>
                            <p id="settingsVersion" style="font-size: 0.95rem; color: #3b82f6; margin: 0; padding-top: 10px; font-weight: 600;">v1.0.0</p>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="form-label">Status</label>
                            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px;">
                                <p id="settingsStatus" style="font-size: 0.95rem; color: #10b981; font-weight: 600; margin: 0;">Up to date</p>
                                <button id="btnUpdateApp" class="btn btn-primary" style="display: none; padding: 6px 14px; font-size: 0.8rem; height: auto; border-radius: 6px;">Update</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ===== OTHER SECTION CONTENT (placeholder) ===== -->
                <div id="genericPlaceholderContent" style="display:none; align-items: center; justify-content: center; height: 100%; text-align: center; color: #94a3b8;">
                    <div>
                        <i data-feather="layers" style="width: 40px; height: 40px; margin-bottom: 12px; stroke: #cbd5e1;"></i>
                        <p style="font-size: 0.95rem; font-weight: 500; margin: 0;">Content coming soon</p>
                        <p style="font-size: 0.8rem; margin-top: 4px;">This section is under construction.</p>
                    </div>
                </div>
            </div>

            <div class="modal-footer" id="genericModalFooter" style="justify-content: flex-end; align-items: center; gap: 12px; display: flex;">
                <button type="button" class="btn btn-secondary" id="btnCloseGenericModal" style="flex: none; width: 140px;">Cancel</button>
                <button type="button" class="btn btn-primary" id="btnSaveGenericModal" style="flex: none; width: 160px;">Save Changes</button>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } else {
        const body = document.getElementById('genericModalBody');
        if (body && !document.getElementById('settingsContent')) {
            const settingsHtml = `
                <!-- ===== SETTINGS CONTENT ===== -->
                <div id="settingsContent" style="display: none; grid-template-columns: 65% 35%; gap: 0; min-height: 100%; width: 100%;">
                    <!-- LEFT: App Preferences -->
                    <div style="display: flex; flex-direction: column; padding: 1rem 2.5rem 3rem 2.5rem; border-right: 1px solid #f1f5f9; width: 100%; box-sizing: border-box; justify-content: center; align-items: center;">
                        <div style="width: 100%; max-width: 450px;">
                            <h3 style="font-size: 1.1rem; font-weight: 600; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; width: 100%;">App Preferences</h3>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsLanguage">Language</label>
                                <select id="settingsLanguage" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="en" selected>English</option>
                                    <option value="hi">Hindi</option>
                                    <option value="te">Telugu</option>
                                    <option value="ta">Tamil</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsTheme">Theme</label>
                                <select id="settingsTheme" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="light" selected>Light</option>
                                    <option value="dark">Dark</option>
                                    <option value="system">System Default</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsNotifications">Notifications</label>
                                <select id="settingsNotifications" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="enabled" selected>Enabled</option>
                                    <option value="disabled">Disabled</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsTimeZone">Time Zone</label>
                                <select id="settingsTimeZone" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="Asia/Kolkata" selected>Asia/Kolkata (IST)</option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" for="settingsDateTimeFormat">Date & Time Format</label>
                                <select id="settingsDateTimeFormat" class="form-input" style="appearance: auto; cursor: pointer;">
                                    <option value="DD MMM YYYY, hh:mm A" selected>DD MMM YYYY, hh:mm A</option>
                                    <option value="MM/DD/YYYY, HH:mm">MM/DD/YYYY, HH:mm</option>
                                    <option value="YYYY-MM-DD, HH:mm">YYYY-MM-DD, HH:mm</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <!-- RIGHT: App Information -->
                    <div style="display: flex; flex-direction: column; padding: 1rem 2.5rem 3rem 2.5rem; gap: 0; width: 100%; box-sizing: border-box; justify-content: flex-start;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">App Information</h3>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="form-label">Version</label>
                            <p id="settingsVersion" style="font-size: 0.95rem; color: #3b82f6; margin: 0; padding-top: 10px; font-weight: 600;">v1.0.0</p>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="form-label">Status</label>
                            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px;">
                                <p id="settingsStatus" style="font-size: 0.95rem; color: #10b981; font-weight: 600; margin: 0;">Up to date</p>
                                <button id="btnUpdateApp" class="btn btn-primary" style="display: none; padding: 6px 14px; font-size: 0.8rem; height: auto; border-radius: 6px;">Update</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            body.insertAdjacentHTML('beforeend', settingsHtml);
        }
    }
}

function bindProfileModalEvents(modalOverlay) {
    if (!modalOverlay || modalOverlay.dataset.appLayoutEventsBound) return;
    modalOverlay.dataset.appLayoutEventsBound = '1';

    const closeBtn = document.getElementById('closeGenericModal');
    const cancelBtn = document.getElementById('btnCloseGenericModal');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeProfileModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeProfileModal();
    });

    const photoInput = document.getElementById('profilePhotoInput');
    if (photoInput && !photoInput.dataset.photoBound) {
        photoInput.dataset.photoBound = '1';
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const allowed = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowed.includes(file.type)) {
                alert('Only JPEG, PNG, or WebP images are allowed.');
                photoInput.value = '';
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                alert('Photo must be 2 MB or smaller.');
                photoInput.value = '';
                return;
            }

            pendingProfilePhoto = file;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                const modalAvatar = document.getElementById('profileAvatarImg');
                if (modalAvatar) modalAvatar.src = dataUrl;
                const headerAvatar = document.querySelector('#avatarBtn img');
                if (headerAvatar) headerAvatar.src = dataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    const saveBtn = document.getElementById('btnSaveGenericModal');
    if (saveBtn && !saveBtn.dataset.appLayoutSaveBound) {
        saveBtn.dataset.appLayoutSaveBound = '1';
        saveBtn.addEventListener('click', async () => {
            if (typeof window.navigateToBooking === 'function' && window.location.pathname.includes('dashboard.html')) {
                return;
            }
            const titleEl = document.getElementById('genericModalTitle');
            if (titleEl && titleEl.textContent === 'Settings') {
                await handleSettingsSave();
            } else if (titleEl && titleEl.textContent === 'Profile') {
                await handleProfileSave();
            }
        });
    }
}

async function handleProfileSave() {
    const btn = document.getElementById('btnSaveGenericModal');
    if (!btn) return;
    const originalText = btn.textContent;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) throw new Error('App context not found. Please refresh.');
        const context = JSON.parse(contextStr);
        const user_id = context.user?.user_id || context.user?.id;
        if (!user_id) throw new Error('User ID not found in session.');

        const firstNameInput = document.getElementById('profileFirstName');
        const lastNameInput  = document.getElementById('profileLastName');
        const phoneInput     = document.getElementById('profilePhone');
        const emergencyNameInput  = document.getElementById('profileEmergencyName');
        const emergencyPhoneInput = document.getElementById('profileEmergencyPhone');

        const firstName      = firstNameInput ? firstNameInput.value.trim() : '';
        const lastName       = lastNameInput ? lastNameInput.value.trim() : '';
        const phone          = phoneInput ? phoneInput.value.trim() : '';
        const emergencyName  = emergencyNameInput ? emergencyNameInput.value.trim() : '';
        const emergencyPhone = emergencyPhoneInput ? emergencyPhoneInput.value.trim() : '';

        if (!firstName) throw new Error('First name is required.');

        btn.textContent = 'Saving...';
        btn.disabled = true;

        let newPhotoUrl = null;
        if (pendingProfilePhoto) {
            if (typeof window.uploadProfilePhoto === 'function') {
                newPhotoUrl = await window.uploadProfilePhoto(pendingProfilePhoto, user_id);
                if (!newPhotoUrl) {
                    btn.textContent = originalText;
                    btn.disabled = false;
                    return;
                }
            }
        }

        const { supabase } = await import('../lib/supabase.js');

        const profilePayload = {
            first_name:               firstName,
            last_name:                lastName,
            phone:                    phone,
            emergency_contact_name:   emergencyName,
            emergency_contact_number: emergencyPhone
        };
        if (newPhotoUrl) profilePayload.profile_photo = newPhotoUrl;

        const { error: profileErr } = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('user_id', user_id);

        if (profileErr) throw profileErr;

        const fullName = `${firstName} ${lastName}`.trim();
        const { error: userErr } = await supabase
            .from('users')
            .update({ name: fullName, phone })
            .eq('user_id', user_id);

        if (userErr) throw userErr;

        if (context.user) {
            context.user.name            = fullName;
            context.user.first_name      = firstName;
            context.user.last_name       = lastName;
            context.user.phone           = phone;
            context.user.emergency_name  = emergencyName;
            context.user.emergency_phone = emergencyPhone;
            if (newPhotoUrl) context.user.profile_photo = newPhotoUrl;
            localStorage.setItem('appContext', JSON.stringify(context));
        }

        pendingProfilePhoto = null;
        const photoInput = document.getElementById('profilePhotoInput');
        if (photoInput) photoInput.value = '';

        if (typeof window.populateGlobalHeader === 'function') {
            window.populateGlobalHeader();
        }

        if (typeof window.toast === 'function') {
            window.toast('Profile updated successfully!');
        } else {
            alert('Profile updated successfully!');
        }

        closeProfileModal();

    } catch (err) {
        console.error('[Profile Update] Error:', err);
        alert(err.message || 'Failed to update profile.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function hydrateProfileFromContext() {
    try {
        const ctxStr = localStorage.getItem('appContext');
        if (!ctxStr) return;
        const ctx = JSON.parse(ctxStr);
        const user = ctx.user;
        if (!user) return;

        const avatarImg = document.getElementById('profileAvatarImg');
        const nameDisp  = document.querySelector('.profile-name-display');
        const roleDisp  = document.querySelector('.profile-role-display');
        const fName     = document.getElementById('profileFirstName');
        const lName     = document.getElementById('profileLastName');
        const phone     = document.getElementById('profilePhone');
        const email     = document.getElementById('profileEmail');
        const role      = document.getElementById('profileRole');
        const joined    = document.getElementById('profileJoined');
        const branch    = document.getElementById('profileBranch');
        const emName    = document.getElementById('profileEmergencyName');
        const emPhone   = document.getElementById('profileEmergencyPhone');

        let avatarUrl = user.profile_photo || '';
        if (!avatarUrl && user.name) {
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1E3A8A&color=fff`;
        }
        if (avatarImg && avatarUrl) avatarImg.src = avatarUrl;
        if (nameDisp && user.name) nameDisp.textContent = user.name;
        if (roleDisp && user.role_name) roleDisp.textContent = user.role_name;
        if (fName && user.first_name) fName.value = user.first_name;
        if (lName && user.last_name) lName.value = user.last_name;
        if (phone && user.phone) phone.value = user.phone;
        if (email && user.email) email.value = user.email;
        if (role && user.role_name) role.value = user.role_name;
        if (joined && user.joined_on) joined.value = user.joined_on;
        if (emName && user.emergency_name) emName.value = user.emergency_name;
        if (emPhone && user.emergency_phone) emPhone.value = user.emergency_phone;
        if (branch) {
            const currentBranch = (ctx.branches || []).find(b => (b.branch_id || b.id) === (ctx.current_branch_id || localStorage.getItem('active_branch_id')));
            branch.value = currentBranch?.branch_name || currentBranch?.name || 'Main Branch';
        }
    } catch (e) {
        console.warn('[app-layout] Failed to hydrate profile from appContext:', e);
    }
}

export function openProfileModal() {
    ensureProfileModalHtml();
    const modalOverlay = document.getElementById('genericModalOverlay');
    if (!modalOverlay) return;

    bindProfileModalEvents(modalOverlay);

    const titleEl = document.getElementById('genericModalTitle');
    const subEl   = document.getElementById('genericModalSubtitle');
    if (titleEl) titleEl.textContent = 'Profile';
    if (subEl)   subEl.textContent   = 'View and manage your personal profile.';

    const profileContent     = document.getElementById('profileContent');
    const settingsContent    = document.getElementById('settingsContent');
    const placeholderContent = document.getElementById('genericPlaceholderContent');
    const footerSave         = document.getElementById('btnSaveGenericModal');

    if (profileContent)     profileContent.style.display = 'grid';
    if (settingsContent)    settingsContent.style.display = 'none';
    if (placeholderContent) placeholderContent.style.display = 'none';
    if (footerSave)         footerSave.style.display = '';

    if (typeof window.populateGlobalHeader === 'function') {
        window.populateGlobalHeader();
    } else {
        hydrateProfileFromContext();
    }

    modalOverlay.classList.add('active');

    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }
}

export function closeProfileModal() {
    const modalOverlay = document.getElementById('genericModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

async function fetchAndPopulateSettings() {
    const langDropdown = document.getElementById('settingsLanguage');
    const themeDropdown = document.getElementById('settingsTheme');
    const notifyDropdown = document.getElementById('settingsNotifications');

    if (!langDropdown || !themeDropdown || !notifyDropdown) return;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) return;
        const context = JSON.parse(contextStr);
        const user_id = context.user?.user_id || context.user?.id;
        if (!user_id) return;

        const { supabase } = await import('../lib/supabase.js');

        const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user_id)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const prefs = data[0];
            if (prefs.language) langDropdown.value = prefs.language;
            if (prefs.theme) themeDropdown.value = prefs.theme;
            if (prefs.notifications !== undefined) {
                notifyDropdown.value = prefs.notifications ? 'enabled' : 'disabled';
            }
        }
    } catch (err) {
        console.error("Fetch Settings Error:", err);
    }
}

async function handleSettingsSave() {
    const btn = document.getElementById('btnSaveGenericModal');
    if (!btn) return;
    const originalText = btn.textContent;

    const langDropdown = document.getElementById('settingsLanguage');
    const themeDropdown = document.getElementById('settingsTheme');
    const notifyDropdown = document.getElementById('settingsNotifications');

    const lang = langDropdown ? langDropdown.value : 'en';
    const theme = themeDropdown ? themeDropdown.value : 'light';
    const notify = notifyDropdown ? notifyDropdown.value === 'enabled' : true;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) throw new Error("User context not found.");
        const context = JSON.parse(contextStr);
        const user_id = context.user?.user_id || context.user?.id;
        const company_id = context.company?.company_id || localStorage.getItem('company_id');
        const branch_id = context.current_branch_id || localStorage.getItem('active_branch_id');

        if (!user_id) throw new Error("User ID not found in session.");

        btn.textContent = 'Saving...';
        btn.disabled = true;

        const { supabase } = await import('../lib/supabase.js');

        // Check if record exists
        const { data: existing, error: checkErr } = await supabase
            .from('user_preferences')
            .select('id')
            .eq('user_id', user_id)
            .limit(1);

        if (checkErr) throw checkErr;

        let result;
        if (existing && existing.length > 0) {
            result = await supabase
                .from('user_preferences')
                .update({
                    company_id,
                    branch_id,
                    language: lang,
                    theme: theme,
                    notifications: notify,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user_id);
        } else {
            result = await supabase
                .from('user_preferences')
                .insert([{
                    user_id,
                    company_id,
                    branch_id,
                    language: lang,
                    theme: theme,
                    notifications: notify,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]);
        }

        if (result.error) throw result.error;

        if (typeof window.toast === 'function') {
            window.toast("Settings saved successfully!");
        } else {
            alert("Settings saved successfully!");
        }

        closeProfileModal();

    } catch (err) {
        console.error("Settings Update Error:", err);
        alert(err.message || "Failed to update settings.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

export function openSettingsModal() {
    ensureProfileModalHtml();
    const modalOverlay = document.getElementById('genericModalOverlay');
    if (!modalOverlay) return;

    bindProfileModalEvents(modalOverlay);

    const titleEl = document.getElementById('genericModalTitle');
    const subEl   = document.getElementById('genericModalSubtitle');
    if (titleEl) titleEl.textContent = 'Settings';
    if (subEl)   subEl.textContent   = 'Configure your account preferences.';

    const profileContent     = document.getElementById('profileContent');
    const settingsContent    = document.getElementById('settingsContent');
    const placeholderContent = document.getElementById('genericPlaceholderContent');
    const footerSave         = document.getElementById('btnSaveGenericModal');

    if (profileContent)     profileContent.style.display = 'none';
    if (settingsContent)    settingsContent.style.display = 'grid';
    if (placeholderContent) placeholderContent.style.display = 'none';
    if (footerSave)         footerSave.style.display = '';

    fetchAndPopulateSettings();

    modalOverlay.classList.add('active');

    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }
}

function ensureScheduleModalHtml() {
    if (document.getElementById('scheduleModalOverlay')) return;
    if (!document.body) return;

    const modalHtml = `
    <!-- Schedule Modal (Shared App Shell Component) -->
    <div class="modal-overlay" id="scheduleModalOverlay">
        <div class="modal-container" id="scheduleModal" style="min-height: 60vh;">
            <div class="modal-header">
                <div class="header-titles">
                    <h2 id="scheduleModalTitle">Schedule</h2>
                    <p class="subtitle" id="scheduleModalSubtitle">View your upcoming work schedule.</p>
                </div>
                <button class="modal-close" id="closeScheduleModal"><i data-feather="x"></i></button>
            </div>

            <div class="modal-body" style="padding: 1.5rem; flex: 1; overflow-y: auto; flex-direction: column;">
                <!-- Tab Headers -->
                <div class="schedule-tabs" style="display: flex; gap: 8px; margin-bottom: 1.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                    <button class="schedule-tab-btn active" id="tabBtnThisWeek" style="padding: 8px 16px; border: none; background: none; font-weight: 600; font-size: 0.95rem; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; cursor: pointer; transition: all 0.2s;">This Week</button>
                    <button class="schedule-tab-btn" id="tabBtnNextWeek" style="padding: 8px 16px; border: none; background: none; font-weight: 500; font-size: 0.95rem; color: #64748b; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">Next Week</button>
                </div>

                <!-- Tab Content: This Week -->
                <div class="schedule-tab-pane" id="paneThisWeek" style="display: block;">
                    <div style="padding:40px; text-align:center; color:#64748b;">Loading your schedule...</div>
                </div>

                <!-- Tab Content: Next Week -->
                <div class="schedule-tab-pane" id="paneNextWeek" style="display: none;">
                    <div style="padding:40px; text-align:center; color:#64748b;">Loading your schedule...</div>
                </div>
            </div>

            <div class="modal-footer" style="justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btnCloseScheduleFooter">Close</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function bindScheduleModalEvents(modalOverlay) {
    if (!modalOverlay || modalOverlay.dataset.appLayoutEventsBound) return;
    modalOverlay.dataset.appLayoutEventsBound = '1';

    const closeBtn = document.getElementById('closeScheduleModal');
    const footerCloseBtn = document.getElementById('btnCloseScheduleFooter');
    if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeScheduleModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeScheduleModal();
    });

    const tabBtnThisWeek = document.getElementById('tabBtnThisWeek');
    const tabBtnNextWeek = document.getElementById('tabBtnNextWeek');
    const paneThisWeek = document.getElementById('paneThisWeek');
    const paneNextWeek = document.getElementById('paneNextWeek');

    if (tabBtnThisWeek && tabBtnNextWeek) {
        tabBtnThisWeek.addEventListener('click', () => {
            tabBtnThisWeek.classList.add('active');
            tabBtnNextWeek.classList.remove('active');
            tabBtnThisWeek.style.color = '#1e3a8a';
            tabBtnThisWeek.style.borderBottom = '2px solid #1e3a8a';
            tabBtnThisWeek.style.fontWeight = '600';

            tabBtnNextWeek.style.color = '#64748b';
            tabBtnNextWeek.style.borderBottom = '2px solid transparent';
            tabBtnNextWeek.style.fontWeight = '500';

            if (paneThisWeek) paneThisWeek.style.display = 'block';
            if (paneNextWeek) paneNextWeek.style.display = 'none';
        });

        tabBtnNextWeek.addEventListener('click', () => {
            tabBtnNextWeek.classList.add('active');
            tabBtnThisWeek.classList.remove('active');
            tabBtnNextWeek.style.color = '#1e3a8a';
            tabBtnNextWeek.style.borderBottom = '2px solid #1e3a8a';
            tabBtnNextWeek.style.fontWeight = '600';

            tabBtnThisWeek.style.color = '#64748b';
            tabBtnThisWeek.style.borderBottom = '2px solid transparent';
            tabBtnThisWeek.style.fontWeight = '500';

            if (paneThisWeek) paneThisWeek.style.display = 'none';
            if (paneNextWeek) paneNextWeek.style.display = 'block';
        });
    }
}

async function fetchAndRenderUserSchedule() {
    const paneThisWeek = document.getElementById('paneThisWeek');
    const paneNextWeek = document.getElementById('paneNextWeek');
    if (!paneThisWeek || !paneNextWeek) return;

    // Show loading state
    const loadingHtml = '<div style="padding:40px; text-align:center; color:#64748b;"><div class="spinner-sm" style="margin:0 auto 12px;"></div>Loading your schedule...</div>';
    paneThisWeek.innerHTML = loadingHtml;
    paneNextWeek.innerHTML = loadingHtml;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) throw new Error("App context not found.");
        const context = JSON.parse(contextStr);
        const userEmail = context.user?.email;
        const companyId = context.company?.company_id || localStorage.getItem('company_id');

        if (!userEmail) throw new Error("User email not found in session.");

        const { supabase } = await import('../lib/supabase.js');

        // 1. Find staff_id by email
        let staffQuery = supabase
            .from('staff')
            .select('staff_id, role_name')
            .eq('email', userEmail);

        if (companyId) {
            staffQuery = staffQuery.eq('company_id', companyId);
        }

        const { data: staffDataArr, error: staffErr } = await staffQuery.limit(1);

        if (staffErr) throw staffErr;
        const staffData = staffDataArr && staffDataArr.length > 0 ? staffDataArr[0] : null;
        if (!staffData) {
            const noStaffHtml = '<div style="padding:40px; text-align:center; color:#64748b;">No staff record found for your email. Please contact your administrator.</div>';
            paneThisWeek.innerHTML = noStaffHtml;
            paneNextWeek.innerHTML = noStaffHtml;
            return;
        }

        const staffId = staffData.staff_id;

        // 2. Calculate Date Ranges
        const today = new Date();
        const getMonday = (d) => {
            const date = new Date(d);
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
            return new Date(date.setDate(diff));
        };

        const thisMon = getMonday(today);
        const nextMon = new Date(thisMon);
        nextMon.setDate(thisMon.getDate() + 7);

        const formatDateISO = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const getWeekDates = (monday) => {
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                dates.push(formatDateISO(d));
            }
            return dates;
        };

        const thisWeekDates = getWeekDates(thisMon);
        const nextWeekDates = getWeekDates(nextMon);

        // 3. Fetch Schedules
        const allDates = [...thisWeekDates, ...nextWeekDates];
        const { data: schedData, error: schedErr } = await supabase
            .from('staff_schedule')
            .select('*')
            .eq('staff_id', staffId)
            .in('schedule_date', allDates);

        if (schedErr) throw schedErr;

        // 4. Render Helper
        const renderWeek = (dates) => {
            let html = `
                <div style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 6px 16px 10px 16px; border-bottom: 1px solid #e2e8f0; margin-bottom: 10px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Date</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Day</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Time</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">Comments</div>
                </div>
                <ul class="schedule-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">
            `;

            dates.forEach(dateStr => {
                const [y, m, d] = dateStr.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const record = (schedData || []).find(s => s.schedule_date === dateStr);

                if (!record || record.is_off) {
                    html += `
                        <li class="schedule-item" style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; align-items: center;">
                            <div style="font-size: 0.88rem; color: #475569; font-weight: 500;">${shortDate}</div>
                            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">${dayName}</div>
                            <div style="color: #ef4444; font-size: 0.9rem; font-weight: 600;">Off</div>
                            <div style="color: #94a3b8; font-size: 0.85rem; text-align: right;">${record?.notes || '-'}</div>
                        </li>
                    `;
                } else {
                    const start = record.start_time ? record.start_time.substring(0, 5) : '--';
                    const end = record.end_time ? record.end_time.substring(0, 5) : '--';
                    html += `
                        <li class="schedule-item" style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 12px 16px; background: #ffffff; border-radius: 8px; align-items: center; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.88rem; color: #475569; font-weight: 500;">${shortDate}</div>
                            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">${dayName}</div>
                            <div style="color: #0f172a; font-size: 0.9rem; font-weight: 500;">${start} - ${end}</div>
                            <div style="color: #64748b; font-size: 0.85rem; text-align: right;">${record.notes || '-'}</div>
                        </li>
                    `;
                }
            });

            html += `</ul>`;
            return html;
        };

        paneThisWeek.innerHTML = renderWeek(thisWeekDates);
        paneNextWeek.innerHTML = renderWeek(nextWeekDates);

    } catch (err) {
        console.error("Schedule Fetch Error:", err);
        const errHtml = `<div style="padding:40px; text-align:center; color:#ef4444;">Failed to load schedule: ${err.message}</div>`;
        paneThisWeek.innerHTML = errHtml;
        paneNextWeek.innerHTML = errHtml;
    }
}

export function openScheduleModal() {
    ensureScheduleModalHtml();
    const modalOverlay = document.getElementById('scheduleModalOverlay');
    if (!modalOverlay) return;

    bindScheduleModalEvents(modalOverlay);

    const tabBtnThisWeek = document.getElementById('tabBtnThisWeek');
    if (tabBtnThisWeek) tabBtnThisWeek.click();

    fetchAndRenderUserSchedule();

    modalOverlay.classList.add('active');

    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }
}

export function closeScheduleModal() {
    const modalOverlay = document.getElementById('scheduleModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

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
    btnNewBooking.addEventListener('click', (e) => {
        e.preventDefault();
        const bookingOverlay = document.getElementById('bookingModalOverlay');
        if (bookingOverlay) {
            bookingOverlay.style.display = 'flex';
        } else {
            window.location.href = 'bookings.html?action=new';
        }
    });
}

/**
 * 6. Date Chip Population
 */
export function populateDateChip() {
    const chip = document.getElementById('headerDateChip');
    if (!chip) return;
    const textEl = chip.querySelector('.date-chip-text');
    if (!textEl) return;

    const now = new Date();
    textEl.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
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
