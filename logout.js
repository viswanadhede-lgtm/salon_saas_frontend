// logout.js – Shared secure logout handler for all dashboard pages

(function () {

    // ─── Inject Modal HTML & CSS on load ──────────────────────────────────────
    function injectLogoutModal() {
        const style = document.createElement('style');
        style.textContent = `
            #logoutModalBackdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.55);
                backdrop-filter: blur(4px);
                z-index: 99999;
                align-items: center;
                justify-content: center;
            }
            #logoutModalBackdrop.active {
                display: flex;
            }
            #logoutModalBox {
                background: #fff;
                border-radius: 16px;
                padding: 2rem 2rem 1.5rem;
                width: 100%;
                max-width: 380px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                text-align: center;
                animation: logoutFadeIn 0.2s ease;
            }
            @keyframes logoutFadeIn {
                from { opacity: 0; transform: scale(0.95) translateY(10px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            #logoutModalBox .logout-icon {
                width: 52px;
                height: 52px;
                background: #fef2f2;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 1rem;
            }
            #logoutModalBox .logout-icon svg {
                color: #ef4444;
                width: 24px;
                height: 24px;
            }
            #logoutModalBox h3 {
                font-size: 1.1rem;
                font-weight: 700;
                color: #0f172a;
                margin: 0 0 0.4rem;
            }
            #logoutModalBox p {
                font-size: 0.875rem;
                color: #64748b;
                margin: 0 0 1.5rem;
            }
            #logoutModalBox .logout-actions {
                display: flex;
                gap: 0.75rem;
            }
            #logoutModalBox .btn-cancel-logout {
                flex: 1;
                padding: 0.65rem 1rem;
                border-radius: 8px;
                border: 1.5px solid #e2e8f0;
                background: #fff;
                font-size: 0.875rem;
                font-weight: 600;
                color: #475569;
                cursor: pointer;
                transition: background 0.15s;
            }
            #logoutModalBox .btn-cancel-logout:hover {
                background: #f8fafc;
            }
            #logoutModalBox .btn-confirm-logout {
                flex: 1;
                padding: 0.65rem 1rem;
                border-radius: 8px;
                border: none;
                background: #ef4444;
                font-size: 0.875rem;
                font-weight: 600;
                color: #fff;
                cursor: pointer;
                transition: background 0.15s;
            }
            #logoutModalBox .btn-confirm-logout:hover {
                background: #dc2626;
            }
        `;
        document.head.appendChild(style);

        const backdrop = document.createElement('div');
        backdrop.id = 'logoutModalBackdrop';
        backdrop.innerHTML = `
            <div id="logoutModalBox">
                <div class="logout-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </div>
                <h3>Logout</h3>
                <p>Are you sure you want to logout?</p>
                <div class="logout-actions">
                    <button class="btn-cancel-logout" id="logoutCancelBtn">Cancel</button>
                    <button class="btn-confirm-logout" id="logoutConfirmBtn">Yes, Logout</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // Cancel
        document.getElementById('logoutCancelBtn').addEventListener('click', closeLogoutModal);

        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeLogoutModal();
        });

        // Confirm logout
        document.getElementById('logoutConfirmBtn').addEventListener('click', () => {
            closeLogoutModal();
            handleLogout();
        });
    }

    function openLogoutModal() {
        document.getElementById('logoutModalBackdrop').classList.add('active');
    }

    function closeLogoutModal() {
        document.getElementById('logoutModalBackdrop').classList.remove('active');
    }

    // ─── Bind logout button click → show modal ─────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        injectLogoutModal();
        injectLoggingOutOverlay();

        document.querySelectorAll('.dropdown-item.text-danger, a.dropdown-item[style*="color:#ef4444"]').forEach(logoutBtn => {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openLogoutModal();
            });
        });
    });

    // ─── Inject Logging-out Overlay ────────────────────────────────────────────
    function injectLoggingOutOverlay() {
        const style = document.createElement('style');
        style.textContent = `
            #loggingOutOverlay {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(6px);
                z-index: 999999;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 20px;
            }
            #loggingOutOverlay.active { display: flex; }
            #loggingOutOverlay .lou-box {
                background: #fff;
                border-radius: 16px;
                padding: 2rem 2.5rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.25);
                animation: louFadeIn 0.2s ease;
            }
            @keyframes louFadeIn {
                from { opacity: 0; transform: scale(0.95) translateY(12px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            #loggingOutOverlay .lou-spinner {
                width: 44px; height: 44px;
                border: 4px solid #e2e8f0;
                border-top-color: #ef4444;
                border-radius: 50%;
                animation: louSpin 0.75s linear infinite;
            }
            @keyframes louSpin { to { transform: rotate(360deg); } }
            #loggingOutOverlay .lou-text {
                font-size: 1rem; font-weight: 600;
                color: #0f172a; margin: 0;
            }
            #loggingOutOverlay .lou-sub {
                font-size: 0.8rem; color: #64748b; margin: 0;
            }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'loggingOutOverlay';
        overlay.innerHTML = `
            <div class="lou-box">
                <div class="lou-spinner"></div>
                <p class="lou-text">Logging you out…</p>
                <p class="lou-sub">Please wait a moment.</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function showLoggingOutOverlay() {
        const overlay = document.getElementById('loggingOutOverlay');
        if (overlay) overlay.classList.add('active');
        document.body.style.cursor = 'wait';
    }

    // ─── Actual Logout Logic ───────────────────────────────────────────────────
    function handleLogout() {
        // Show the "Logging you out..." overlay
        showLoggingOutOverlay();

        const token = localStorage.getItem('token');

        fetch('https://dev.bharathbots.com/webhook/auth_logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.success) {
                console.log('[logout] Session destroyed successfully.');
            } else {
                console.warn('[logout] Server returned unsuccessful logout, clearing locally anyway.');
            }
        })
        .catch(err => {
            console.error('[logout] Network error during logout:', err);
        })
        .finally(() => {
            // Always clear localStorage and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('company_id');
            localStorage.removeItem('role_id');
            localStorage.removeItem('signup_data');
            localStorage.removeItem('selected_plan');
            localStorage.removeItem('userFeatures');
            localStorage.removeItem('userSubFeatures');
            localStorage.removeItem('appContext');
            console.log('[logout] Local session cleared. Redirecting to sign-in.');
            document.body.style.cursor = '';
            window.location.href = 'signin.html?loggedout=true';
        });
    }

})();

