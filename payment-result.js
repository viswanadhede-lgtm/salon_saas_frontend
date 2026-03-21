import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- UI Element References ---
    const iconArea  = document.getElementById('iconArea');
    const resultIcon = document.getElementById('resultIcon');
    const heading   = document.getElementById('heading');
    const subtext   = document.getElementById('subtext');
    const step1     = document.getElementById('step1');
    const step2     = document.getElementById('step2');
    const step3     = document.getElementById('step3');
    const retryBtn  = document.getElementById('retryBtn');

    // --- Read Razorpay callback params from URL ---
    const params              = new URLSearchParams(window.location.search);
    const razorpay_payment_id = params.get('razorpay_payment_id');
    const razorpay_order_id   = params.get('razorpay_order_id');
    const razorpay_signature  = params.get('razorpay_signature');

    // --- Guard: if params are missing, something went wrong ---
    if (!razorpay_payment_id || !razorpay_order_id) {
        showError(
            'Missing Payment Details',
            'We couldn\'t read your payment details from the redirect. Please try again or contact support.'
        );
        return;
    }

    // --- Read & validate session token ---
    // First try URL param (handles cross-origin localStorage — token passed from payments page)
    // Then fall back to localStorage on this domain
    const tokenFromUrl = params.get('t');
    if (tokenFromUrl) {
        localStorage.setItem('token', tokenFromUrl);
        console.log('[payment-result] Token received from URL param and stored in localStorage.');
    }
    const token = tokenFromUrl || localStorage.getItem('token');
    console.log('[payment-result] Token present:', !!token, token ? `(${token.substring(0, 10)}...)` : '(missing)');

    if (!token) {
        console.error('[payment-result] No session token found. Stopping execution.');
        showError(
            'Session Expired',
            'Your session could not be verified. Please sign in again and retry the payment.'
        );
        return;
    }

    // --- Step 1 is already "active" in HTML, start the flow ---
    verifyPayment();

    // ---------------------------------------------------------------
    // PHASE 1: Call /payment_status with Razorpay proofs
    // ---------------------------------------------------------------
    function verifyPayment() {
        let attempts = 0;
        const maxAttempts = 3;

        const payload = {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        };

        const checkStatus = () => {
            if (attempts >= maxAttempts) {
                showPending();
                return;
            }

            attempts++;

            fetchWithAuth(API.PAYMENT_STATUS, {
                method: 'POST',
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(result => {
                // Unwrap array response: [{ "status": "paid" }]
                const data = Array.isArray(result) ? result[0] : result;
                const status = (data.status || '').toLowerCase();

                if (status === 'paid') {
                    // ✅ Payment confirmed — move to auth_guard
                    markDone(step1);
                    markActive(step2);
                    requestDashboardAccess();
                } else if (status === 'pending') {
                    // ⏳ Not confirmed yet — retry
                    setTimeout(checkStatus, 3000);
                } else {
                    // Unknown — retry as caution
                    setTimeout(checkStatus, 3000);
                }
            })
            .catch(err => {
                console.error('Payment Status Error:', err);
                setTimeout(checkStatus, 3000);
            });
        };

        checkStatus();
    }

    // ---------------------------------------------------------------
    // PHASE 2: Request Dashboard Access via /auth_guard
    // ---------------------------------------------------------------
    function requestDashboardAccess() {
        console.log('[payment-result] Verifying Dashboard Access with auth_guard...');

        // Make a single call passing the DASHBOARD_ACCESS feature key and 'read' action
        fetchWithAuth(API.AUTH_GUARD, {
            method: 'POST'
        }, FEATURES.DASHBOARD_ACCESS, 'read')
        .then(res => {
            if (!res.ok) throw new Error("Unauthorized");
            return res.json();
        })
        .then(data => {
            console.log('[payment-result] auth_guard feature access response:', data);
            
            // Assume success if the backend didn't reject the specific feature request
            markDone(step2);
            markActive(step3);
            showSuccess();
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        })
        .catch(err => {
            console.error('Auth Guard Feature Access Error:', err);
            showError('Dashboard Access Denied', 'Your payment succeeded, but dashboard access could not be granted right now. Please try refreshing or contact support.');
        });
    }

    // ---------------------------------------------------------------
    // UI State Helpers
    // ---------------------------------------------------------------

    function markDone(el) {
        el.classList.remove('active');
        el.classList.add('done');
    }

    function markActive(el) {
        el.classList.add('active');
    }

    function markFailed(el) {
        el.classList.remove('active');
        el.classList.add('failed');
    }

    function showSuccess() {
        iconArea.classList.add('success');
        resultIcon.innerHTML = `
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`;
        heading.textContent = 'Payment Confirmed!';
        subtext.textContent = 'Your subscription is active. Redirecting you to the dashboard...';
        markDone(step3);
    }

    function showPending() {
        heading.textContent = 'Payment Under Review';
        subtext.textContent = 'Your payment is being processed. This can take a few minutes. You can safely close this page and check your dashboard later.';
        step1.classList.remove('active');
        step2.classList.remove('active');
    }

    function showError(title, message) {
        iconArea.classList.add('error');
        resultIcon.innerHTML = `
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
        heading.textContent = title;
        subtext.textContent = message;
        retryBtn.style.display = 'inline-block';
    }
});
