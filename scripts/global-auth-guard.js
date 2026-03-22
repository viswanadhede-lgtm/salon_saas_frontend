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

const PUBLIC_ROUTES = [
    '/signin.html',
    '/signup.html',
    '/reset-password.html',
    '/change-password.html',
    '/payment-result.html',
    '/landing.html',
    '/'
];

export async function runGlobalAuthGuard() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';

    // 1. Instantly skip public routes (login/reset pages shouldn't block themselves)
    if (PUBLIC_ROUTES.includes(filename)) {
        return;
    }

    // 2. Map route to the strictly matching feature key
    const featureKey = ROUTE_MAP[filename] || null;
    
    // We enforce session validation everywhere except explicitly public routes
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
            console.error('[Auth Guard] Strict Access Denied (HTTP ' + response.status + ') - Logging out.');
            localStorage.removeItem('token');
            window.location.href = 'signin.html';
            return;
        }

        const data = await response.json();
        
        // 1. Handle explicit backend rejection states
        if (data.allowed === false) {
             console.error(`[Auth Guard] Access Denied. Reason: ${data.error}`);
             
             if (data.error === 'INVALID_SESSION') {
                 localStorage.removeItem('token');
             }
             
             // Temporarily routing all rejections to login for maximum safety
             window.location.href = 'signin.html'; 
             return;
        }
        
        // 2. Double check the success flags just in case
        if (!data.session_valid || !data.subscription_active || !data.feature_allowed) {
             console.error('[Auth Guard] Backend explicitly denied access based on token, subscription, or role restrictions.');
             if (!data.session_valid) localStorage.removeItem('token');
             window.location.href = 'signin.html'; 
             return;
        }

        console.log('[Auth Guard] Session Validated! Processing payload for allowed UI subsystems: ', data.permissions);

        // 3. Temporarily cache granular sub-features memory state 
        localStorage.setItem('userSubFeatures', JSON.stringify(data.permissions || []));

        // 5. Trigger the visual UI unlocking sequence mapping
        initSubFeatures(); // Reloads sub-features into the JS runtime state
        applySubFeatureGates(); // Loops over all locked dom buttons and unleashes allowed ones
        
    } catch (error) {
        console.error('[Auth Guard] Catastrophic network error during secure gateway validation:', error);
    }
}

document.addEventListener('DOMContentLoaded', runGlobalAuthGuard);
