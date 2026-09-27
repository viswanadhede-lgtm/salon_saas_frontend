/**
 * scripts/app-layout/profile.js
 * Controls user profile dropdown menu, shared generic modal injection,
 * profile editing and photo upload, and profile state hydration from appContext.
 */

import { openScheduleModal } from './schedule.js';
import { openSettingsModal, handleSettingsSave } from './settings.js';

let pendingProfilePhoto = null;

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
            if (typeof openScheduleModal === 'function') {
                openScheduleModal();
            } else if (typeof window.openScheduleModal === 'function') {
                window.openScheduleModal();
            }
        });
    }

    // Wire Settings Button
    const settingsBtn = document.getElementById('menuItemSettings');
    if (settingsBtn && !settingsBtn.dataset.appLayoutInit) {
        settingsBtn.dataset.appLayoutInit = '1';
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeProfileMenu();
            if (typeof openSettingsModal === 'function') {
                openSettingsModal();
            } else if (typeof window.openSettingsModal === 'function') {
                window.openSettingsModal();
            }
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

export function ensureProfileModalHtml() {
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

export function bindProfileModalEvents(modalOverlay) {
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
                if (typeof handleSettingsSave === 'function') {
                    await handleSettingsSave();
                } else if (typeof window.handleSettingsSave === 'function') {
                    await window.handleSettingsSave();
                }
            } else if (titleEl && titleEl.textContent === 'Profile') {
                await handleProfileSave();
            }
        });
    }
}

export async function handleProfileSave() {
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

        const { supabase } = await import('../../lib/supabase.js');

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

export function hydrateProfileFromContext() {
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

// Preserve global window APIs
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
