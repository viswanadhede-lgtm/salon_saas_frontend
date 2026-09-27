// reset-password.js – Handles the reset password page logic
// Reads Supabase recovery session from URL hash (#access_token=...&type=recovery),
// validates form, then calls supabase.auth.updateUser() to set the new password.

import { supabase } from './lib/supabase.js';

(function () {

    // ── Element refs ───────────────────────────────────────────────────────────
    const form             = document.getElementById('rpForm');
    const newPwdInput      = document.getElementById('rpNewPwd');
    const confirmPwdInput  = document.getElementById('rpConfirmPwd');
    const newPwdHint       = document.getElementById('rpNewPwdHint');
    const confirmHint      = document.getElementById('rpConfirmHint');
    const submitBtn        = document.getElementById('rpSubmitBtn');
    const successEl        = document.getElementById('rpSuccess');
    const invalidBanner    = document.getElementById('invalidTokenBanner');
    const backLink         = document.querySelector('.rp-back');

    // ── Extract Supabase recovery session from URL hash ────────────────────────
    // Supabase recovery emails redirect to: reset-password.html#access_token=...&type=recovery
    let recoveryToken = null;

    (function parseHash() {
        const hash = window.location.hash;
        if (!hash) return;
        const params = new URLSearchParams(hash.replace('#', ''));
        const type = params.get('type');
        const accessToken = params.get('access_token');

        if (type === 'recovery' && accessToken) {
            recoveryToken = accessToken;
            // Store in localStorage so updateUser() can use it via the wrapper
            localStorage.setItem('token', accessToken);
            const refreshToken = params.get('refresh_token');
            if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
            // Clean the URL so the token isn't visible or bookmarkable
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    })();

    // ── If no valid recovery token, show invalid banner immediately ────────────
    if (!recoveryToken) {
        showInvalidToken();
    }

    // ── Password eye toggles ───────────────────────────────────────────────────
    document.querySelectorAll('.rp-eye').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('svg').innerHTML = isPassword
                ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
                : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
        });
    });

    // ── Form submit ────────────────────────────────────────────────────────────
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!recoveryToken) { showInvalidToken(); return; }

        const newPwd     = newPwdInput.value.trim();
        const confirmPwd = confirmPwdInput.value.trim();
        let valid = true;

        // Clear previous hints
        clearHint(newPwdInput, newPwdHint);
        clearHint(confirmPwdInput, confirmHint);

        // Validate min length
        if (newPwd.length < 6) {
            showHint(newPwdInput, newPwdHint, 'Password must be at least 6 characters.');
            valid = false;
        }

        // Validate match
        if (newPwd !== confirmPwd) {
            showHint(confirmPwdInput, confirmHint, 'Passwords do not match.');
            valid = false;
        }

        if (!valid) return;

        // Loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Resetting…';
        document.body.style.cursor = 'wait';

        try {
            const { error } = await supabase.auth.updateUser({ password: newPwd });

            if (!error) {
                // Clear the recovery token from storage so it can't be reused
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                showSuccess();
            } else {
                const msg = error.message || null;
                if (msg && /invalid|expired|not found/i.test(msg)) {
                    showInvalidToken();
                } else {
                    showHint(confirmPwdInput, confirmHint, msg || 'Something went wrong. Please try again.');
                }
            }
        } catch (err) {
            showHint(confirmPwdInput, confirmHint, 'Network error. Please check your connection and try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
            document.body.style.cursor = '';
        }
    });

    // ── Helpers ────────────────────────────────────────────────────────────────
    function showHint(input, hintEl, message) {
        hintEl.textContent = message;
        input.classList.add('is-error');
    }

    function clearHint(input, hintEl) {
        hintEl.textContent = '';
        input.classList.remove('is-error');
    }

    function showSuccess() {
        form.style.display = 'none';
        if (backLink) backLink.style.display = 'none';
        successEl.style.display = 'block';
        document.querySelector('.rp-subtitle').style.display = 'none';
        // Auto-redirect to sign in after 2s
        setTimeout(() => { window.location.href = 'signin.html'; }, 2000);
    }

    function showInvalidToken() {
        form.style.display = 'none';
        invalidBanner.style.display = 'flex';
        document.querySelector('.rp-subtitle').style.display = 'none';
    }

})();
