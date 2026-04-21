import i18n from '../i18n.js';

export const Header = {
    render: () => {
        const headerContainer = document.querySelector('.top-header');
        if (!headerContainer) return;

        const contextStr = localStorage.getItem('appContext');
        let userName = 'User';
        let userRole = 'Role';
        let branches = [];
        let currentBranchId = '';

        if (contextStr) {
            try {
                const context = JSON.parse(contextStr);
                userName = context.user?.name || userName;
                userRole = context.user?.role_name || userRole;
                branches = context.branches || [];
                currentBranchId = context.current_branch_id || '';
            } catch (e) {}
        }

        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=1E3A8A&color=fff`;

        headerContainer.innerHTML = `
            <div class="header-left">
                <!-- Branch Switcher -->
                <div class="branch-switcher">
                    <i data-feather="map-pin" class="branch-icon"></i>
                    <select id="branchSelect" class="branch-select">
                        ${branches.map(b => `<option value="${b.branch_id || b.id}" ${ (b.branch_id || b.id) === currentBranchId ? 'selected' : '' }>${b.branch_name || b.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="header-center">
                <div class="search-bar">
                    <i data-feather="search" class="search-icon"></i>
                    <input type="text" placeholder="${i18n.t('header.search_placeholder')}" class="search-input">
                </div>
            </div>

            <div class="header-right">
                <!-- Quick Actions -->
                <div class="quick-actions">
                    <button class="qa-btn qa-primary" id="btnNewBooking" data-sub-feature="dashboard_create_booking">
                        <i data-feather="calendar" class="qa-icon"></i>
                        <span>${i18n.t('header.new_booking')}</span>
                    </button>
                </div>
                <div class="header-divider"></div>
                <div class="plan-badge" id="headerPlanBadge">Growth</div>
                <button class="icon-btn" title="Notifications">
                    <i data-feather="bell"></i>
                    <span class="notification-dot"></span>
                </button>
                <div class="user-profile" id="userProfileDropdown">
                    <div class="avatar" id="avatarBtn">
                        <img src="${avatarUrl}" alt="User">
                    </div>

                    <!-- Profile Dropdown Menu -->
                    <div class="profile-dropdown" id="profileMenu">
                        <div class="dropdown-header">
                            <p class="dropdown-name">${userName}</p>
                            <p class="dropdown-role">${userRole}</p>
                        </div>
                        <div class="dropdown-divider"></div>
                        <ul class="dropdown-list">
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="user"></i>
                                    <span>${i18n.t('header.profile')}</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="calendar"></i>
                                    <span>${i18n.t('header.schedule')}</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item" id="openSettingsBtn">
                                    <i data-feather="settings"></i>
                                    <span>${i18n.t('header.settings')}</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="help-circle"></i>
                                    <span>${i18n.t('header.support')}</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item text-danger" id="logoutBtn">
                                    <i data-feather="log-out"></i>
                                    <span>${i18n.t('header.logout')}</span>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Re-init feather icons
        if (window.feather) {
            window.feather.replace();
        }

        // Re-setup profile dropdown logic
        const avatarBtn = document.getElementById('avatarBtn');
        const profileMenu = document.getElementById('profileMenu');
        const backdrop = document.getElementById('profileBackdrop');

        if (avatarBtn && profileMenu && backdrop) {
            avatarBtn.onclick = () => {
                profileMenu.classList.toggle('active');
                backdrop.classList.toggle('active');
            };
            backdrop.onclick = () => {
                profileMenu.classList.remove('active');
                backdrop.classList.remove('active');
            };
        }

        // Setup Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                localStorage.clear();
                window.location.href = 'signin.html';
            };
        }

        // Branch switcher sync
        const branchSelect = document.getElementById('branchSelect');
        if (branchSelect) {
            branchSelect.addEventListener('change', e => {
                localStorage.setItem('active_branch_id', e.target.value);
            });
        }
    }
};
