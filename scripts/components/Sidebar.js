import i18n from '../i18n.js';

export const Sidebar = {
    render: () => {
        const sidebarContainer = document.getElementById('sidebar');
        if (!sidebarContainer) return;

        // Current page for active class
        const path = window.location.pathname;
        const page = path.substring(path.lastIndexOf('/') + 1) || 'dashboard.html';

        sidebarContainer.innerHTML = `
            <div class="sidebar-header">
                <div class="logo">
                    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="6" width="28" height="20" rx="4" stroke="currentColor" stroke-width="2" />
                        <path d="M8 12C8 12 11 16 16 16C21 16 24 12 24 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        <circle cx="16" cy="16" r="2" fill="currentColor" />
                    </svg>
                    <span class="logo-text">BharathBots</span>
                </div>
                <button class="toggle-btn" id="sidebarToggle" title="Close sidebar">
                    <i data-feather="sidebar" class="toggle-icon"></i>
                </button>
            </div>

            <nav class="sidebar-nav">
                <ul class="nav-list">
                    <!-- Dashboard -->
                    <li class="nav-item ${page === 'dashboard.html' ? 'active' : ''}" title="${i18n.t('nav.dashboard')}">
                        <a href="dashboard.html" class="nav-link" data-feature="dashboard_access">
                            <i data-feather="home" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.dashboard')}</span>
                        </a>
                    </li>

                    <!-- Bookings -->
                    <li class="nav-item ${page === 'bookings.html' ? 'active' : ''}" title="${i18n.t('nav.bookings')}">
                        <a href="bookings.html" class="nav-link" data-feature="bookings_management">
                            <i data-feather="calendar" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.bookings')}</span>
                        </a>
                    </li>

                    <!-- Customers -->
                    <li class="nav-item ${page === 'customers.html' ? 'active' : ''}" title="${i18n.t('nav.customers')}">
                        <a href="customers.html" class="nav-link" data-feature="customers_management">
                            <i data-feather="users" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.customers')}</span>
                        </a>
                    </li>

                    <!-- Staff -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.staff')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="user-check" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.staff')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="staff.html" class="submenu-link" data-feature="staff_management"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.staff')}</span></a></li>
                            <li><a href="staff-schedule.html" class="submenu-link" data-feature="staff_schedules"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.staff_schedule')}</span></a></li>
                        </ul>
                    </li>

                    <!-- Services -->
                    <li class="nav-item ${page === 'services.html' ? 'active' : ''}" title="${i18n.t('nav.services')}">
                        <a href="services.html" class="nav-link" data-feature="services_management">
                            <i data-feather="scissors" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.services')}</span>
                        </a>
                    </li>

                    <!-- Sales -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.sales')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="dollar-sign" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.sales')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="pos.html" class="submenu-link" data-feature="pos_system"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.pos')}</span></a></li>
                            <li><a href="products.html" class="submenu-link" data-feature="product_management"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.products')}</span></a></li>
                            <li><a href="sales-history.html" class="submenu-link" data-feature="sales_history"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.sales_history')}</span></a></li>
                        </ul>
                    </li>

                    <!-- Payments -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.payments')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="credit-card" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.payments')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="pending-payments.html" class="submenu-link" data-feature="pending_payments"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.pending_payments')}</span></a></li>
                            <li><a href="payments-history.html" class="submenu-link" data-feature="payments_history"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.payments_history')}</span></a></li>
                        </ul>
                    </li>

                    <!-- Marketing -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.marketing')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="gift" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.marketing')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="offers.html" class="submenu-link" data-feature="marketing_offers"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.offers')}</span></a></li>
                            <li><a href="coupons.html" class="submenu-link" data-feature="marketing_coupons"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.coupons')}</span></a></li>
                            <li><a href="memberships.html" class="submenu-link" data-feature="marketing_memberships"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.memberships')}</span></a></li>
                            <li><a href="ad-campaigns.html" class="submenu-link" data-feature="marketing_campaigns"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.ad_campaigns')}</span></a></li>
                        </ul>
                    </li>

                    <!-- Analytics -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.analytics')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="bar-chart-2" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.analytics')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="overview.html" class="submenu-link" data-feature="analytics_overview"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.overview')}</span></a></li>
                            <li><a href="reports.html" class="submenu-link" data-feature="reports_access"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.reports')}</span></a></li>
                            <li><a href="expenses.html" class="submenu-link" data-feature="analytics_expenses"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.expenses')}</span></a></li>
                        </ul>
                    </li>

                    <!-- Settings -->
                    <li class="nav-item has-submenu" title="${i18n.t('nav.settings')}">
                        <div class="nav-link submenu-toggle">
                            <i data-feather="settings" class="nav-icon"></i>
                            <span class="nav-text">${i18n.t('nav.settings')}</span>
                            <i data-feather="chevron-down" class="submenu-arrow"></i>
                        </div>
                        <ul class="submenu">
                            <li><a href="company.html" class="submenu-link" data-feature="company_settings"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.company')}</span></a></li>
                            <li><a href="branches.html" class="submenu-link" data-feature="branch_management"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.branches')}</span></a></li>
                            <li><a href="users.html" class="submenu-link" data-feature="user_management"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.users')}</span></a></li>
                            <li><a href="roles-permissions.html" class="submenu-link" data-feature="roles_permissions"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.roles_permissions')}</span></a></li>
                            <li><a href="custom-fields.html" class="submenu-link" data-feature="custom_fields"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.custom_fields')}</span></a></li>
                            <li><a href="billing-subscription.html" class="submenu-link" data-feature="billing_subscription_management"><span class="submenu-bullet">&bull;</span><span class="nav-text">${i18n.t('nav.billing_subscription')}</span></a></li>
                        </ul>
                    </li>
                </ul>
            </nav>
        `;

        // Re-init feather icons after injection
        if (window.feather) {
            window.feather.replace();
        }

        // Re-setup sidebar toggle event listener
        setTimeout(() => {
            const sidebarToggle = document.getElementById('sidebarToggle');
            const sidebar = document.getElementById('sidebar');
            const mainWrapper = document.getElementById('mainWrapper');

            if (sidebarToggle && sidebar && mainWrapper) {
                sidebarToggle.onclick = () => {
                    sidebar.classList.toggle('collapsed');
                    mainWrapper.classList.toggle('expanded');
                };
            }

            // Submenu toggles
            document.querySelectorAll('.submenu-toggle').forEach(toggle => {
                toggle.onclick = (e) => {
                    const navItem = toggle.closest('.nav-item');
                    navItem.classList.toggle('open');
                };
            });
        }, 10);
    }
};
