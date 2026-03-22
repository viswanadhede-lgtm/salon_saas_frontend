// reset-password.js – Handles the reset password page logic
// Reads ?token from URL, validates form, calls auth_reset_password_confirm API.

(function () {
    const API_URL = 'https://dev.bharathbots.com/webhook/auth_reset_password_confirm';

    // ── Read token from URL ────────────────────────────────────────────────────
    const params  = new URLSearchParams(window.location.search);
    const token   = params.get('token');

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

    // ── If no token in URL, show invalid banner immediately ───────────────────
    if (!token) {
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
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!token) { showInvalidToken(); return; }

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

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, new_password: newPwd })
        })
        .then(res => res.json())
        .then(data => {
            const result = Array.isArray(data) ? data[0] : data;

            if (result && result.success) {
                showSuccess();
            } else {
                const msg = (result && result.message) ? result.message : null;
                // Detect invalid/expired token scenarios
                if (
                    !result ||
                    (result.error && /invalid|expired/i.test(result.error)) ||
                    (msg && /invalid|expired/i.test(msg))
                ) {
                    showInvalidToken();
                } else {
                    showHint(confirmPwdInput, confirmHint, msg || 'Something went wrong. Please try again.');
                }
            }
        })
        .catch(() => {
            showHint(confirmPwdInput, confirmHint, 'Network error. Please check your connection and try again.');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
            document.body.style.cursor = '';
        });
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
    }

    function showInvalidToken() {
        form.style.display = 'none';
        invalidBanner.style.display = 'flex';
        document.querySelector('.rp-subtitle').style.display = 'none';
    }

})();
