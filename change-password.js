// change-password.js – Injects "Change Password" button into Profile modal's left column
// and provides a nested Change Password modal. Shared across all dashboard pages.

(function () {

    // ─── Inject styles ─────────────────────────────────────────────────────────
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #btnChangePassword {
                margin-top: auto;
                width: 100%;
                padding: 10px 16px;
                border-radius: 8px;
                border: 1.5px solid #e2e8f0;
                background: #fff;
                font-size: 0.875rem;
                font-weight: 600;
                color: #1e3a8a;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: background 0.15s, border-color 0.15s;
                margin-top: 24px;
            }
            #btnChangePassword:hover {
                background: #eff6ff;
                border-color: #1e3a8a;
            }
            #btnChangePassword svg {
                width: 16px; height: 16px;
                stroke: #1e3a8a;
                stroke-width: 2;
                fill: none;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            /* Change Password Modal */
            #chgPwdBackdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(4px);
                z-index: 100000;
                align-items: center;
                justify-content: center;
            }
            #chgPwdBackdrop.active { display: flex; }
            #chgPwdBox {
                background: #fff;
                border-radius: 16px;
                padding: 2rem;
                width: 100%;
                max-width: 420px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.22);
                animation: chgPwdIn 0.2s ease;
            }
            @keyframes chgPwdIn {
                from { opacity: 0; transform: scale(0.95) translateY(12px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            #chgPwdBox .cpwd-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 1.5rem;
            }
            #chgPwdBox .cpwd-icon {
                width: 44px; height: 44px;
                border-radius: 50%;
                background: #eff6ff;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            #chgPwdBox .cpwd-icon svg {
                width: 20px; height: 20px;
                stroke: #1e3a8a; fill: none;
                stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
            }
            #chgPwdBox h3 {
                font-size: 1.05rem; font-weight: 700;
                color: #0f172a; margin: 0 0 2px;
            }
            #chgPwdBox .cpwd-subtitle {
                font-size: 0.8rem; color: #64748b; margin: 0;
            }
            #chgPwdBox .cpwd-field {
                margin-bottom: 1rem;
            }
            #chgPwdBox .cpwd-label {
                display: block;
                font-size: 0.8rem; font-weight: 600;
                color: #475569; margin-bottom: 6px;
            }
            #chgPwdBox .cpwd-input-wrap {
                position: relative;
            }
            #chgPwdBox .cpwd-input {
                width: 100%; padding: 10px 40px 10px 12px;
                border: 1.5px solid #e2e8f0; border-radius: 8px;
                font-size: 0.875rem; color: #0f172a;
                outline: none; box-sizing: border-box;
                transition: border-color 0.15s;
            }
            #chgPwdBox .cpwd-input:focus { border-color: #1e3a8a; }
            #chgPwdBox .cpwd-toggle {
                position: absolute; right: 10px; top: 50%;
                transform: translateY(-50%);
                background: none; border: none; cursor: pointer;
                padding: 0; color: #94a3b8;
            }
            #chgPwdBox .cpwd-toggle svg {
                width: 16px; height: 16px;
                stroke: currentColor; fill: none;
                stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
            }
            #chgPwdBox .cpwd-error {
                font-size: 0.78rem; color: #ef4444;
                margin-top: 4px; display: none;
            }
            #chgPwdBox .cpwd-actions {
                display: flex; gap: 0.75rem; margin-top: 1.5rem;
            }
            #chgPwdBox .cpwd-cancel {
                flex: 1; padding: 0.65rem;
                border-radius: 8px; border: 1.5px solid #e2e8f0;
                background: #fff; font-size: 0.875rem; font-weight: 600;
                color: #475569; cursor: pointer;
            }
            #chgPwdBox .cpwd-cancel:hover { background: #f8fafc; }
            #chgPwdBox .cpwd-submit {
                flex: 1; padding: 0.65rem;
                border-radius: 8px; border: none;
                background: #1e3a8a; font-size: 0.875rem; font-weight: 600;
                color: #fff; cursor: pointer;
                transition: background 0.15s;
            }
            #chgPwdBox .cpwd-submit:hover { background: #1e40af; }
            #chgPwdBox .cpwd-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        `;
        document.head.appendChild(style);
    }

    // ─── Inject Change Password Modal HTML ─────────────────────────────────────
    function injectModal() {
        const backdrop = document.createElement('div');
        backdrop.id = 'chgPwdBackdrop';
        backdrop.innerHTML = `
            <div id="chgPwdBox">
                <div class="cpwd-header">
                    <div class="cpwd-icon">
                        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                        <h3>Change Password</h3>
                        <p class="cpwd-subtitle">Update your account password securely.</p>
                    </div>
                </div>

                <div class="cpwd-field">
                    <label class="cpwd-label" for="cpwdCurrent">Current Password</label>
                    <div class="cpwd-input-wrap">
                        <input type="password" id="cpwdCurrent" class="cpwd-input" placeholder="Enter current password" autocomplete="current-password">
                        <button type="button" class="cpwd-toggle" data-target="cpwdCurrent">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                </div>

                <div class="cpwd-field">
                    <label class="cpwd-label" for="cpwdNew">New Password</label>
                    <div class="cpwd-input-wrap">
                        <input type="password" id="cpwdNew" class="cpwd-input" placeholder="Enter new password" autocomplete="new-password">
                        <button type="button" class="cpwd-toggle" data-target="cpwdNew">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                </div>

                <div class="cpwd-field">
                    <label class="cpwd-label" for="cpwdConfirm">Confirm New Password</label>
                    <div class="cpwd-input-wrap">
                        <input type="password" id="cpwdConfirm" class="cpwd-input" placeholder="Re-enter new password" autocomplete="new-password">
                        <button type="button" class="cpwd-toggle" data-target="cpwdConfirm">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                    <p class="cpwd-error" id="cpwdMismatchError">Passwords do not match.</p>
                </div>

                <div class="cpwd-actions">
                    <button type="button" class="cpwd-cancel" id="cpwdCancelBtn">Cancel</button>
                    <button type="button" class="cpwd-submit" id="cpwdSubmitBtn">Update Password</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // Password visibility toggles
        backdrop.querySelectorAll('.cpwd-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById(btn.dataset.target);
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.querySelector('svg').innerHTML = isPassword
                    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
                    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
            });
        });

        // Cancel
        document.getElementById('cpwdCancelBtn').addEventListener('click', closeChgPwdModal);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) closeChgPwdModal(); });

        // Submit
        document.getElementById('cpwdSubmitBtn').addEventListener('click', () => {
            const currentPwd = document.getElementById('cpwdCurrent').value.trim();
            const newPwd = document.getElementById('cpwdNew').value.trim();
            const confirmPwd = document.getElementById('cpwdConfirm').value.trim();
            const errorEl = document.getElementById('cpwdMismatchError');
            const submitBtn = document.getElementById('cpwdSubmitBtn');

            // Frontend validation: new and confirm must match
            if (newPwd !== confirmPwd) {
                errorEl.textContent = 'Passwords do not match.';
                errorEl.style.display = 'block';
                return;
            }
            errorEl.style.display = 'none';

            // Call the change password API
            const token = localStorage.getItem('token');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';

            fetch('https://dev.bharathbots.com/webhook/auth_change_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: currentPwd,
                    new_password: newPwd
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    console.log('[change-password] Password updated successfully.');
                    closeChgPwdModal();
                } else {
                    const msg = (data && data.message) ? data.message : 'Failed to update password. Please try again.';
                    errorEl.textContent = msg;
                    errorEl.style.display = 'block';
                }
            })
            .catch(err => {
                console.error('[change-password] Network error:', err);
                errorEl.textContent = 'Network error. Please check your connection and try again.';
                errorEl.style.display = 'block';
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Password';
            });
        });
    }

    // ─── Inject Change Password Button into Profile modal's left column ─────────
    function injectButton() {
        const profileContent = document.getElementById('profileContent');
        if (!profileContent) return;

        // ── Feature gate: only show if subscription includes password_management ──
        const features = window.Subscription && Array.isArray(window.Subscription.features)
            ? window.Subscription.features
            : [];
        if (!features.includes('password_management')) {
            console.info('[change-password] Feature "password_management" not in subscription. Button hidden.');
            return;
        }

        // Left column is the first child div
        const leftCol = profileContent.querySelector('div');
        if (!leftCol) return;

        // Avoid double-inject
        if (document.getElementById('btnChangePassword')) return;

        const btn = document.createElement('button');
        btn.id = 'btnChangePassword';
        btn.type = 'button';
        btn.innerHTML = `
            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Change Password
        `;
        btn.addEventListener('click', () => openChgPwdModal());
        leftCol.appendChild(btn);
    }

    function openChgPwdModal() {
        // Reset fields
        ['cpwdCurrent', 'cpwdNew', 'cpwdConfirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ''; el.type = 'password'; }
        });
        const err = document.getElementById('cpwdMismatchError');
        if (err) err.style.display = 'none';
        document.getElementById('chgPwdBackdrop').classList.add('active');
    }

    function closeChgPwdModal() {
        document.getElementById('chgPwdBackdrop').classList.remove('active');
    }

    // ─── Hook into Profile modal open event ────────────────────────────────────
    // The profile modal is opened via openGenericModal() in dashboard.js.
    // We observe when #profileContent becomes visible to inject the button.
    function watchProfileModal() {
        const profileContent = document.getElementById('profileContent');
        if (!profileContent) return;

        const observer = new MutationObserver(() => {
            if (profileContent.style.display !== 'none' && profileContent.style.display !== '') {
                injectButton();
            }
        });
        observer.observe(profileContent, { attributes: true, attributeFilter: ['style'] });

        // Also try injecting immediately (in case it's already visible)
        injectButton();
    }

    // ─── Init ──────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        injectModal();
        watchProfileModal();
    });

})();
