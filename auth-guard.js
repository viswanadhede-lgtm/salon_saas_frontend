// auth-guard.js
// Drop this script into every protected dashboard page.
// It:
//   1. Validates the current token on page load → redirects to signin if invalid/missing
//   2. Silently refreshes the Supabase access_token every 50 min using the refresh_token

(function () {

    const SUPABASE_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
    const SUPABASE_ANON = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';
    const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

    // ─── Pages that do NOT need an auth check ─────────────────────────────────
    const PUBLIC_PAGES = ['signin.html', 'plans.html', 'onboarding.html', 'payment-result.html'];
    const currentPage  = window.location.pathname.split('/').pop();
    if (PUBLIC_PAGES.some(p => currentPage.endsWith(p))) return;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function redirectToLogin(reason) {
        console.warn('[auth-guard] Redirecting to signin:', reason);
        clearSession();
        window.location.href = 'signin.html';
    }

    function clearSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('company_id');
        localStorage.removeItem('active_branch_id');
        localStorage.removeItem('role_id');
        localStorage.removeItem('userFeatures');
        localStorage.removeItem('userSubFeatures');
        localStorage.removeItem('appContext');
    }

    // ─── Token Refresh via Supabase REST ──────────────────────────────────────
    async function refreshToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            redirectToLogin('No refresh_token in storage');
            return false;
        }

        try {
            const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    'apikey':       SUPABASE_ANON,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.access_token) {
                console.error('[auth-guard] Token refresh failed:', data);
                redirectToLogin('Token refresh rejected by Supabase');
                return false;
            }

            // Persist new tokens
            localStorage.setItem('token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('refresh_token', data.refresh_token);
            }

            console.log('[auth-guard] Token silently refreshed ✓');
            return true;

        } catch (err) {
            console.error('[auth-guard] Network error during token refresh:', err);
            return false; // Don't redirect on network errors — user may be temporarily offline
        }
    }

    // ─── Validate current token with Supabase ─────────────────────────────────
    async function validateSession() {
        const token = localStorage.getItem('token');
        if (!token) {
            redirectToLogin('No token in storage');
            return;
        }

        try {
            const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                method: 'GET',
                headers: {
                    'apikey':        SUPABASE_ANON,
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.status === 401) {
                // Token expired — try to refresh first
                console.warn('[auth-guard] Token expired (401). Attempting silent refresh...');
                const refreshed = await refreshToken();
                if (!refreshed) return; // redirectToLogin already called inside refreshToken
                console.log('[auth-guard] Session restored via refresh ✓');
                return;
            }

            if (!res.ok) {
                redirectToLogin(`Unexpected auth error: HTTP ${res.status}`);
                return;
            }

            console.log('[auth-guard] Session valid ✓');

        } catch (err) {
            // Network failure — don't boot the user out, they may be offline momentarily
            console.warn('[auth-guard] Could not reach Supabase to validate session:', err.message);
        }
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    // 1. Validate immediately on page load
    validateSession();

    // 2. Silently refresh token every 50 minutes
    setInterval(async () => {
        console.log('[auth-guard] Running scheduled token refresh...');
        await refreshToken();
    }, REFRESH_INTERVAL_MS);

})();
