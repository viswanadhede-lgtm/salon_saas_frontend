// logout.js – Shared secure logout handler for all dashboard pages

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        // Find any element that contains a "Logout" span inside a .text-danger link
        document.querySelectorAll('.dropdown-item.text-danger, a.dropdown-item[style*="color:#ef4444"]').forEach(logoutBtn => {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handleLogout();
            });
        });
    });

    function handleLogout() {
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
            // Always clear localStorage and redirect, even if the API call fails
            localStorage.removeItem('token');
            localStorage.removeItem('company_id');
            localStorage.removeItem('role_id');
            localStorage.removeItem('signup_data');
            localStorage.removeItem('selected_plan');
            console.log('[logout] Local session cleared. Redirecting to sign-in.');
            window.location.href = 'index.html';
        });
    }
})();
