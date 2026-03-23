import { API, fetchWithAuth } from '../config/api.js';
import { FEATURES } from '../config/feature-registry.js';
import { initSubFeatures } from './sub-features/sub-feature-manager.js';
import { applySubFeatureGates } from './sub-features/sub-feature-gate.js';

// Dictionary mapping the raw HTML browser routes to exact backend Feature strings
const ROUTE_MAP = {
    '/dashboard.html': FEATURES.DASHBOARD_ACCESS,
    '/bookings.html': FEATURES.BOOKINGS_MANAGEMENT,
    '/customers.html': FEATURES.CUSTOMERS_MANAGEMENT,
    '/staff.html': FEATURES.STAFF_MANAGEMENT,
    '/services.html': FEATURES.SERVICES_MANAGEMENT,
    '/sales.html': FEATURES.POS_SYSTEM,
    '/products.html': FEATURES.PRODUCT_MANAGEMENT,
    '/sales-history.html': FEATURES.SALES_HISTORY,
    '/pending-payments.html': FEATURES.PENDING_PAYMENTS,
    '/payments-history.html': FEATURES.PAYMENTS_HISTORY,
    '/marketing-offers.html': FEATURES.MARKETING_OFFERS,
    '/coupons.html': FEATURES.MARKETING_COUPONS,
    '/memberships.html': FEATURES.MARKETING_MEMBERSHIPS,
    '/ad-campaigns.html': FEATURES.MARKETING_CAMPAIGNS,
    '/overview.html': FEATURES.ANALYTICS_OVERVIEW,
    '/reports.html': FEATURES.REPORTS_ACCESS,
    '/company-settings.html': FEATURES.COMPANY_SETTINGS,
    '/branches.html': FEATURES.BRANCH_MANAGEMENT,
    '/users.html': FEATURES.USER_MANAGEMENT,
    '/roles-permissions.html': FEATURES.ROLES_PERMISSIONS,
    '/custom-fields.html': FEATURES.CUSTOM_FIELDS,
    '/billing.html': FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
};

export async function runGlobalAuthGuard() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';

    // 1. Map route to the strictly matching feature key
    const featureKey = ROUTE_MAP[filename] || null;
    
    // 2. If the current page is not linked to an overarching Security Feature, it is considered Public!
    if (!featureKey) {
        console.log(`[Auth Guard] Public Route Detected: ${filename}. Bypassing security checks.`);
        document.documentElement.style.display = ''; // Reveal if it was hidden by the loader
        return;
    }

    // 3. We enforce session validation solely on these explicit Feature Pages
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('[Auth Guard] No active session token found, redirecting to login.');
        window.location.href = 'signin.html';
        return;
    }

    try {
        console.log(`[Auth Guard] Validating page access strictly against feature: ${featureKey || 'Generic Authenticated Route'}`);
        
        // 3. Make the universal API Call (injects token + custom headers)
        const response = await fetchWithAuth(API.AUTH_GUARD, { method: 'POST' }, featureKey, 'read');
        
        if (!response.ok) {
            console.error('[Auth Guard] API Request failed (HTTP ' + response.status + ').');
            showAuthBlockModal('ERROR', 'Unable to verify session with the server. Please try again later.', 'Refresh Page', window.location.href);
            return;
        }

        const data = await response.json();
        
        // 1. Handle explicit backend rejection states
        if (data.allowed === false) {
             console.error(`[Auth Guard] Access Denied. Reason: ${data.error}`);
             
             if (data.error === 'FEATURE_NOT_ALLOWED') {
                 showAuthBlockModal('FEATURE_NOT_ALLOWED', "You currently don't have access to this feature. Please upgrade to have access to the features.", "Upgrade", "billing-subscription.html");
             } else if (data.error === 'SUBSCRIPTION_INACTIVE') {
                 showAuthBlockModal('SUBSCRIPTION_INACTIVE', "Your subscription is not active. Please subscribe now to access the features.", "Subscribe Now", "billing-subscription.html");
             } else if (data.error === 'INVALID_SESSION') {
                 localStorage.removeItem('token');
                 showAuthBlockModal('INVALID_SESSION', "Your session is expired, please login.", "Sign In", "signin.html");
             } else {
                 showAuthBlockModal('ERROR', "Access denied. Please check your permissions.", "Go to Dashboard", "dashboard.html");
             }
             return;
        }
        
        // 2. Double check the success flags just in case (fallback if allowed is strangely true)
        if (!data.session_valid) {
             console.error('[Auth Guard] Backend explicit session invalid.');
             localStorage.removeItem('token');
             showAuthBlockModal('INVALID_SESSION', "Your session is expired, please login.", "Sign In", "signin.html");
             return;
        }
        if (!data.subscription_active) {
             console.error('[Auth Guard] Backend explicit subscription inactive.');
             showAuthBlockModal('SUBSCRIPTION_INACTIVE', "Your subscription is not active. Please subscribe now to access the features.", "Subscribe Now", "billing-subscription.html");
             return;
        }
        if (!data.feature_allowed) {
             console.error('[Auth Guard] Backend explicit feature not allowed.');
             showAuthBlockModal('FEATURE_NOT_ALLOWED', "You currently don't have access to this feature. Please upgrade to have access to the features.", "Upgrade", "billing-subscription.html");
             return;
        }

        console.log('[Auth Guard] Session Validated! Processing payload for allowed UI subsystems: ', data.permissions);

        // 3. Temporarily cache granular sub-features memory state 
        localStorage.setItem('userSubFeatures', JSON.stringify(data.permissions || []));

        // 5. Trigger the visual UI unlocking sequence mapping
        initSubFeatures(); // Reloads sub-features into the JS runtime state
        applySubFeatureGates(); // Loops over all locked dom buttons and unleashes allowed ones
        
        // 6. Reveal the securely rendered page to the user
        document.documentElement.style.display = '';
        
    } catch (error) {
        console.error('[Auth Guard] Catastrophic network error during secure gateway validation:', error);
        showAuthBlockModal('ERROR', "A network error occurred while verifying access.", "Refresh Page", window.location.href);
    }
}

document.addEventListener('DOMContentLoaded', runGlobalAuthGuard);

/**
 * Helper to display an un-closable, full-screen blocking modal
 * Uses existing CSS variables and tailwind-style properties to match the theme.
 */
function showAuthBlockModal(errorType, messageText, buttonText, buttonLink) {
    // 1. Reveal the DOM layout (so the auth-loader doesn't violently redirect us after 10s timeout)
    document.documentElement.style.display = '';
    
    // 2. Heavy blur on the actual page content to protect sensitive empty layouts
    // If we have a #mainWrapper and sidebar, blur them. Otherwise blur the body's direct children.
    const wrapper = document.getElementById('mainWrapper');
    const sidebar = document.getElementById('sidebar');
    
    if (wrapper) {
        wrapper.style.filter = 'blur(10px) grayscale(50%)';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.userSelect = 'none';
    } 
    if (sidebar) {
        sidebar.style.filter = 'blur(10px) grayscale(50%)';
        sidebar.style.pointerEvents = 'none';
        sidebar.style.userSelect = 'none';
    }
    if (!wrapper && !sidebar) {
        // Fallback: manually blur all body children except our soon-to-be-injected modal
        Array.from(document.body.children).forEach(child => {
            if (child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
                child.style.filter = 'blur(10px)';
                child.style.pointerEvents = 'none';
                child.style.userSelect = 'none';
            }
        });
    }

    // 3. Inject the rigid modal overlay
    // Overriding auth colors based on errorType to match standard SaaS aesthetics
    const iconColor = errorType === 'SUBSCRIPTION_INACTIVE' ? '#f59e0b' : '#ef4444'; 
    const iconBg = errorType === 'SUBSCRIPTION_INACTIVE' ? '#fef3c7' : '#fee2e2';
    const iconPath = errorType === 'SUBSCRIPTION_INACTIVE' 
        ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' // Alert Triangle
        : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'; // Circle X

    const modalHtml = `
        <div class="modal-overlay auth-guard-overlay" style="display: flex; z-index: 999999; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(8px); position: fixed; top: 0; left: 0; width: 100%; height: 100%; align-items: center; justify-content: center;">
            <div class="modal-container" style="max-width: 440px; width: 90%; text-align: center; padding: 2.5rem; border-radius: 16px; background: white; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; animation: fadeInUp 0.3s ease-out;">
                <div class="modal-header" style="justify-content: center; border-bottom: none; padding: 0 0 1rem 0;">
                    <div style="background: ${iconBg}; color: ${iconColor}; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
                    </div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: 0;">Access Restricted</h2>
                </div>
                <div class="modal-body" style="padding: 0 0 2rem 0;">
                    <p style="font-size: 1.05rem; color: #475569; line-height: 1.6; margin: 0;">${messageText}</p>
                </div>
                <div class="modal-footer" style="justify-content: center; border-top: none; padding: 0;">
                    <button class="btn-primary" style="width: 100%; padding: 0.875rem; font-size: 1rem; font-weight: 600; cursor: pointer; border-radius: 8px; border: none; background: #0f172a; color: white; transition: background 0.2s;" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='#0f172a'" onclick="window.location.href='${buttonLink}'">${buttonText}</button>
                </div>
            </div>
            <style>
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

