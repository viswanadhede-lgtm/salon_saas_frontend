import { supabase } from './lib/supabase.js';

// ─── Show "Logged out successfully" toast if redirected from logout ────────────
(function () {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('loggedout')) return;

    // Remove the query param from the URL without reloading
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Inject toast styles
    const style = document.createElement('style');
    style.textContent = `
        #loggedOutToast {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 999999;
            background: #fff;
            border: 1.5px solid #bbf7d0;
            border-radius: 12px;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            font-family: inherit;
            animation: lotIn 0.3s ease;
            min-width: 260px;
        }
        @keyframes lotIn {
            from { opacity: 0; transform: translateY(-12px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        #loggedOutToast.fade-out {
            animation: lotOut 0.3s ease forwards;
        }
        @keyframes lotOut {
            to { opacity: 0; transform: translateY(-12px); }
        }
        #loggedOutToast .lot-icon {
            width: 36px; height: 36px; border-radius: 50%;
            background: #dcfce7;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        }
        #loggedOutToast .lot-icon svg {
            width: 18px; height: 18px;
            stroke: #16a34a; fill: none;
            stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
        }
        #loggedOutToast .lot-text {
            font-size: 0.875rem; font-weight: 600; color: #0f172a; margin: 0;
        }
        #loggedOutToast .lot-sub {
            font-size: 0.78rem; color: #64748b; margin: 2px 0 0;
        }
    `;
    document.head.appendChild(style);

    // Inject toast HTML
    const toast = document.createElement('div');
    toast.id = 'loggedOutToast';
    toast.innerHTML = `
        <div class="lot-icon">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
            <p class="lot-text">Logged out successfully</p>
            <p class="lot-sub">See you next time!</p>
        </div>
    `;
    document.body.appendChild(toast);

    // Auto-dismiss after 3s
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
})();

// ─── Forgot Password Modal ──────────────────────────────────────────────────
(function () {
    function injectForgotPasswordModal() {
        // Styles
        const style = document.createElement('style');
        style.textContent = `
            #fwdBackdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15,23,42,0.55);
                backdrop-filter: blur(4px);
                z-index: 999999;
                align-items: center;
                justify-content: center;
            }
            #fwdBackdrop.active { display: flex; }
            #fwdBox {
                background: #fff;
                border-radius: 16px;
                padding: 2rem;
                width: 100%;
                max-width: 420px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.22);
                animation: fwdIn 0.2s ease;
            }
            @keyframes fwdIn {
                from { opacity:0; transform: scale(0.95) translateY(12px); }
                to   { opacity:1; transform: scale(1) translateY(0); }
            }
            #fwdBox .fwd-header {
                display: flex; align-items: center; gap: 12px; margin-bottom: 1.25rem;
            }
            #fwdBox .fwd-icon {
                width: 44px; height: 44px; border-radius: 50%;
                background: #eff6ff;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            }
            #fwdBox .fwd-icon svg {
                width: 20px; height: 20px;
                stroke: #1e3a8a; fill: none;
                stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
            }
            #fwdBox h3 { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin: 0 0 2px; }
            #fwdBox .fwd-sub { font-size: 0.8rem; color: #64748b; margin: 0; }
            #fwdBox .fwd-label {
                display: block; font-size: 0.8rem; font-weight: 600;
                color: #475569; margin-bottom: 6px;
            }
            #fwdBox .fwd-input {
                width: 100%; padding: 10px 12px;
                border: 1.5px solid #e2e8f0; border-radius: 8px;
                font-size: 0.875rem; color: #0f172a;
                outline: none; box-sizing: border-box;
                transition: border-color 0.15s;
            }
            #fwdBox .fwd-input:focus { border-color: #1e3a8a; }
            #fwdBox .fwd-msg {
                font-size: 0.8rem; margin-top: 8px; display: none; line-height: 1.5;
            }
            #fwdBox .fwd-actions {
                display: flex; gap: 0.75rem; margin-top: 1.5rem;
            }
            #fwdBox .fwd-cancel {
                flex: 1; padding: 0.65rem;
                border-radius: 8px; border: 1.5px solid #e2e8f0;
                background: #fff; font-size: 0.875rem; font-weight: 600;
                color: #475569; cursor: pointer;
            }
            #fwdBox .fwd-cancel:hover { background: #f8fafc; }
            #fwdBox .fwd-submit {
                flex: 1; padding: 0.65rem;
                border-radius: 8px; border: none;
                background: #1e3a8a; font-size: 0.875rem; font-weight: 600;
                color: #fff; cursor: pointer; transition: background 0.15s;
            }
            #fwdBox .fwd-submit:hover { background: #1e40af; }
            #fwdBox .fwd-submit:disabled { opacity: 0.6; cursor: wait; }
        `;
        document.head.appendChild(style);

        // HTML
        const backdrop = document.createElement('div');
        backdrop.id = 'fwdBackdrop';
        backdrop.innerHTML = `
            <div id="fwdBox">
                <div class="fwd-header">
                    <div class="fwd-icon">
                        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                        <h3>Forgot Password?</h3>
                        <p class="fwd-sub">We'll send a reset link to your email.</p>
                    </div>
                </div>
                <label class="fwd-label" for="fwdEmail">Email Address</label>
                <input type="email" id="fwdEmail" class="fwd-input" placeholder="Enter your registered email">
                <p class="fwd-msg" id="fwdMsg"></p>
                <div class="fwd-actions">
                    <button type="button" class="fwd-cancel" id="fwdCancelBtn">Cancel</button>
                    <button type="button" class="fwd-submit" id="fwdSubmitBtn">Send Reset Link</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // Close on backdrop click / cancel
        backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
        document.getElementById('fwdCancelBtn').addEventListener('click', closeModal);

        // Submit
        document.getElementById('fwdSubmitBtn').addEventListener('click', () => {
            const email = document.getElementById('fwdEmail').value.trim();
            const msgEl = document.getElementById('fwdMsg');
            const btn = document.getElementById('fwdSubmitBtn');

            if (!email) {
                msgEl.style.color = '#ef4444';
                msgEl.textContent = 'Please enter your email address.';
                msgEl.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Sending...';
            btn.style.cursor = 'wait';
            document.body.style.cursor = 'wait';
            msgEl.style.display = 'none';

            fetch('https://dev.bharathbots.com/webhook/auth_reset_password_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            .then(res => res.json())
            .then(data => {
                const result = Array.isArray(data) ? data[0] : data;
                if (result && result.success) {
                    msgEl.style.color = '#16a34a';
                    msgEl.textContent = result.message || 'Reset link sent to your registered email ID. Please check your inbox and reset your password.';
                    msgEl.style.display = 'block';
                    // Hide the action buttons after success
                    document.querySelector('#fwdBox .fwd-actions').style.display = 'none';
                } else {
                    msgEl.style.color = '#ef4444';
                    msgEl.textContent = (result && result.message) || 'Something went wrong. Please try again.';
                    msgEl.style.display = 'block';
                }
            })
            .catch(() => {
                msgEl.style.color = '#ef4444';
                msgEl.textContent = 'Network error. Please check your connection and try again.';
                msgEl.style.display = 'block';
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Send Reset Link';
                btn.style.cursor = '';
                document.body.style.cursor = '';
            });
        });
    }

    function openModal() {
        // Pre-fill email from the signin form if available
        const signinEmail = document.getElementById('email');
        const fwdEmail = document.getElementById('fwdEmail');
        const msgEl = document.getElementById('fwdMsg');
        const actions = document.querySelector('#fwdBox .fwd-actions');
        if (fwdEmail && signinEmail) fwdEmail.value = signinEmail.value.trim();
        if (msgEl) msgEl.style.display = 'none';
        if (actions) actions.style.display = 'flex';
        document.getElementById('fwdBackdrop').classList.add('active');
    }

    function closeModal() {
        document.getElementById('fwdBackdrop').classList.remove('active');
    }

    document.addEventListener('DOMContentLoaded', () => {
        injectForgotPasswordModal();
        const link = document.getElementById('forgotPasswordLink');
        if (link) {
            link.addEventListener('click', e => {
                e.preventDefault();
                openModal();
            });
        }
    });
})();

document.addEventListener('DOMContentLoaded', () => {
    // Password visibility toggle
    const togglePasswordBtn = document.querySelector('.btn-toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle the eye icon SVG
            const svg = togglePasswordBtn.querySelector('svg');
            if (type === 'text') {
                // Eye-off icon
                svg.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                `;
            } else {
                // Eye icon
                svg.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
        });
    }

    // Signup form submission
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fullname = document.getElementById('fullname').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            
            const btn = signupForm.querySelector('.btn-primary');
            const originalText = btn.textContent;
            
            btn.textContent = 'Signing up...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';
            btn.disabled = true;

            try {
                // Perform native Supabase signUp
                const { data, error } = await supabase.auth.signUp({
                    email, 
                    password,
                    data: { full_name: fullname, phone: phone }
                });

                if (error || !data?.user) {
                    const errorMsg = error?.message || error?.msg || error?.error_description || 'Sign up failed.';
                    if (errorMsg.includes('already registered')) {
                         throw new Error('Account already exists. Please sign in.');
                    }
                    throw new Error(errorMsg);
                }

                // SHA-256 hash the password for safe storage
                const pwEncoder = new TextEncoder();
                const pwBuffer = await crypto.subtle.digest('SHA-256', pwEncoder.encode(password));
                const password_hash = Array.from(new Uint8Array(pwBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                // If successful, save partial signup data locally
                const signupData = {
                    full_name: fullname,
                    email: email,
                    phone: phone,
                    user_id: data.user.id,
                    password_hash: password_hash
                };
                localStorage.setItem('signup_data', JSON.stringify(signupData));
                
                // Check if session exists (no email confirmation) or if OTP verification is required
                if (data.session?.access_token) {
                    localStorage.setItem('token', data.session.access_token);
                    
                    btn.textContent = 'Welcome to BharathBots!';
                    btn.style.backgroundColor = '#10b981'; 
                    
                    setTimeout(() => {
                        window.location.href = 'plans.html';
                    }, 1500);
                } else {
                    // OTP is required (Email confirmations are ON)
                    document.getElementById('signup-form').style.display = 'none';
                    
                    const divider = document.querySelector('.divider');
                    if (divider) divider.style.display = 'none';
                    
                    const loginLink = document.querySelector('.login-link');
                    if (loginLink) loginLink.style.display = 'none';

                    const otpForm = document.getElementById('otp-form');
                    otpForm.style.display = 'block';
                    otpForm.dataset.email = email; // Store for the verify step

                    btn.textContent = originalText;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.disabled = false;
                }

            } catch (err) {
                console.error('[signup] Error:', err);
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.disabled = false;
                alert(err.message || 'An error occurred. Please try again.');
            }
        });
    }

    // OTP Verification Form
    const otpForm = document.getElementById('otp-form');
    if (otpForm) {
        // Handle "Change Email" 
        document.getElementById('btn-back-signup').addEventListener('click', () => {
            otpForm.style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
            document.querySelector('.divider').style.display = '';
            document.querySelector('.login-link').style.display = '';
        });

        // Handle OTP Submit
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-verify-otp');
            const errDiv = document.getElementById('otp-error');
            const originalText = btn.textContent;
            
            errDiv.style.display = 'none';
            btn.textContent = 'Verifying...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';
            btn.disabled = true;

            const email = otpForm.dataset.email;
            const token = document.getElementById('otp').value.trim();

            try {
                const { data, error } = await supabase.auth.verifyOtp({
                    email: email,
                    token: token,
                    type: 'signup'
                });

                if (error || !data?.session) {
                    const errorMsg = error?.message || error?.msg || error?.error_description || 'Invalid OTP code.';
                    throw new Error(errorMsg);
                }

                // Verification Success! Store token and route to plans.
                localStorage.setItem('token', data.session.access_token);
                
                // Keep signup data perfectly in sync with the resolved ID
                let signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');
                signupData.user_id = data.user.id;
                localStorage.setItem('signup_data', JSON.stringify(signupData));

                btn.textContent = 'Verified!';
                btn.style.backgroundColor = '#10b981'; 
                
                setTimeout(() => {
                    window.location.href = 'plans.html';
                }, 1000);

            } catch (err) {
                console.error('[verifyOtp] Error:', err);
                errDiv.textContent = err.message || 'Invalid code. Please try again.';
                errDiv.style.display = 'block';
                
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.disabled = false;
            }
        });
    }

    // Signin form submission
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const btn = signinForm.querySelector('.btn-primary');
            const originalText = btn.textContent;

            btn.textContent = 'Signing in...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';
            btn.disabled = true;

            try {
                // Step 1: Login via Supabase Auth
                const { data, error } = await supabase.auth.signInWithPassword({
                    email, password
                });

                if (error || !data?.session) {
                    const errorMsg = error?.message || error?.msg || error?.error_description || 'Invalid credentials';
                    throw new Error(errorMsg);
                }

                const token = data.session.access_token;
                const user_id = data.user.id;

                localStorage.setItem('token', token);
                if (data.session.refresh_token) {
                    localStorage.setItem('refresh_token', data.session.refresh_token);
                }

                // Step 2: Grab the user mapping from our actual users table
                const { data: userData, error: userError } = await supabase.from('users')
                    .select('company_id, branch_id, role_id, status')
                    .eq('user_id', user_id);

                if (!userError && userData && userData.length > 0) {
                    const profile = userData[0];
                    if (profile.status === 'deleted' || profile.status === 'inactive') {
                        localStorage.removeItem('token');
                        throw new Error('Your account has been deactivated. Please contact your administrator.');
                    }
                    if (profile.company_id) localStorage.setItem('company_id', profile.company_id);
                    if (profile.branch_id) localStorage.setItem('active_branch_id', profile.branch_id); // Ensures app pulls correctly
                    if (profile.role_id) localStorage.setItem('role_id', profile.role_id);
                }

                // Clear any stale feature caches to guarantee a fresh fetch on the dashboard loader
                localStorage.removeItem('userFeatures');
                localStorage.removeItem('userSubFeatures');
                localStorage.removeItem('appContext');

                btn.textContent = 'Welcome back!';
                btn.style.backgroundColor = '#10b981';
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);

            } catch (err) {
                console.error('[signin] Login error:', err);
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.disabled = false;
                alert('Sign in failed. ' + err.message);
            }
        });
    }

    // Add subtle intersection observer animation for the form wrapper
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    const formWrapper = document.querySelector('.form-wrapper');
    if (formWrapper) {
        // Initial state before animation triggers (if JS is loaded)
        formWrapper.style.opacity = '0';
        formWrapper.style.transform = 'translateY(20px)';
        formWrapper.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(formWrapper);
    }
});
