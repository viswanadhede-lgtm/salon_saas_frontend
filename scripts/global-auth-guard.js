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
    '/pos.html': FEATURES.POS_SYSTEM,
    '/products.html': FEATURES.PRODUCT_MANAGEMENT,
    '/sales-history.html': FEATURES.SALES_HISTORY,
    '/pending-payments.html': FEATURES.PENDING_PAYMENTS,
    '/payments-history.html': FEATURES.PAYMENTS_HISTORY,
    '/offers.html': FEATURES.MARKETING_OFFERS,
    '/coupons.html': FEATURES.MARKETING_COUPONS,
    '/memberships.html': FEATURES.MARKETING_MEMBERSHIPS,
    '/ad-campaigns.html': FEATURES.MARKETING_CAMPAIGNS,
    '/overview.html': FEATURES.ANALYTICS_OVERVIEW,
    '/reports.html': FEATURES.REPORTS_ACCESS,
    '/company.html': FEATURES.COMPANY_SETTINGS,
    '/branches.html': FEATURES.BRANCH_MANAGEMENT,
    '/users.html': FEATURES.USER_MANAGEMENT,
    '/roles-permissions.html': FEATURES.ROLES_PERMISSIONS,
    '/custom-fields.html': FEATURES.CUSTOM_FIELDS,
    '/billing-subscription.html': FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
};

export async function runGlobalAuthGuard() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';

    // 1. Map route to the strictly matching feature key
    const featureKey = ROUTE_MAP[filename] || null;
    
    // 2. If the current page is not linked to an overarching Security Feature, it is considered Public!
    if (!featureKey) {
        console.log(`[Auth Guard] Public Route Detected: ${filename}. Bypassing security checks.`);
        removeAuthSpinner();
        return;
    }

    // 3. We enforce session validation solely on these explicit Feature Pages
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('[Auth Guard] No active session token found, redirecting to login.');
        window.location.href = 'signin.html';
        return;
    }

    // 4. CHECK LOCAL CACHE FOR INSTANT ROUTING (Optimistic UI)
    const cachedFeaturesStr = localStorage.getItem('userFeatures');
    let cachedFeatures = null;
    try {
        if (cachedFeaturesStr) cachedFeatures = JSON.parse(cachedFeaturesStr);
    } catch(e) { console.error("Could not parse cached features", e); }
    
    // If we have features in cache, unlock instantly and let the background check handle security
    if (cachedFeatures && Array.isArray(cachedFeatures)) {
        console.log(`[Auth Guard] Instant Cache hit! Validating against ${cachedFeatures.length} features.`);
        
        // Ensure the hourly & daily heartbeats are running silently
        setupHourlyCheck();
        setupDailyRefresh();

        // Optimistic check: are they allowed?
        if (!cachedFeatures.includes(featureKey)) {
            console.error(`[Auth Guard] Cache says restricted. Access Denied dynamically for: ${featureKey}`);
            showAuthBlockModal('FEATURE_NOT_ALLOWED', "You currently don't have access to this feature. Please upgrade to have access to the features.", "Upgrade", "billing-subscription.html");
            return;
        }

        // Proceed Instantly - Zero Wait!
        console.log(`[Auth Guard] Instant Unlock for feature: ${featureKey}`);
        populateGlobalHeader(); // Hydrate UI from cached context
        initSubFeatures();
        applySubFeatureGates();
        removeAuthSpinner();
        return;
    }

    // 5. CACHE MISS (Cold Start): Requires blocking API call and UI spinner
    try {
        console.log(`[Auth Guard] Cache missing. Fetching payloads securely from API for feature: ${featureKey || 'Generic Authenticated Route'}`);
        
        // Make the universal API Calls concurrently (injects token + custom headers)
        const [authResponse, contextResponse] = await Promise.all([
            fetchWithAuth(API.AUTH_GUARD, { method: 'POST' }, featureKey, 'read'),
            fetchWithAuth(API.GET_APP_CONTEXT, { method: 'POST' }, featureKey, 'read')
        ]);
        
        if (!authResponse.ok) {
            console.error('[Auth Guard] API Request failed (HTTP ' + authResponse.status + ').');
            showAuthBlockModal('ERROR', 'Unable to verify session with the server. Please try again later.', 'Refresh Page', window.location.href);
            return;
        }

        const data = await authResponse.json();

        // 1. Check if access is denied and handle by error type
        if (data.allowed === false) {
            if (data.error === 'INVALID_SESSION') {
                console.error('[Auth Guard] Session invalid.');
                localStorage.removeItem('token');
                showAuthBlockModal('INVALID_SESSION', "Your session is expired, please login.", "Sign In", "signin.html");
            } else if (data.error === 'SUBSCRIPTION_INACTIVE') {
                console.error('[Auth Guard] Subscription inactive.');
                showAuthBlockModal('SUBSCRIPTION_INACTIVE', "Your subscription is not active. Please subscribe now to access the features.", "Subscribe Now", "billing-subscription.html");
            } else if (data.error === 'FEATURE_NOT_ALLOWED') {
                console.error(`[Auth Guard] Feature not allowed: ${featureKey}`);
                showAuthBlockModal('FEATURE_NOT_ALLOWED', "You currently don't have access to this feature. Please upgrade to have access to the features.", "Upgrade", "billing-subscription.html");
            } else {
                console.error('[Auth Guard] Access denied with unknown error:', data.error);
                showAuthBlockModal('ERROR', 'Access denied. Please contact support.', 'Go to Dashboard', 'dashboard.html');
            }
            return;
        }

        console.log('[Auth Guard] Session Validated! Processing payload for allowed UI subsystems...');

        // 6. Temporarily cache granular sub-features and features state 
        if (data.permissions) localStorage.setItem('userSubFeatures', JSON.stringify(data.permissions));
        if (data.features)   localStorage.setItem('userFeatures', JSON.stringify(data.features));

        // Process App Context gracefully
        if (contextResponse && contextResponse.ok) {
            try {
                const contextData = await contextResponse.json();
                const actualContext = Array.isArray(contextData) ? contextData[0] : contextData;
                localStorage.setItem('appContext', JSON.stringify(actualContext));
            } catch (e) {
                console.warn('[Auth Guard] Failed to parse get_app_context response.', e);
            }
        }

        setupHourlyCheck(); // Start the hourly heartbeat
        setupDailyRefresh(); // Start the 24-hour token slide

        // Hydrate header from newly minted cache
        populateGlobalHeader();

        // 7. Trigger the visual UI unlocking sequence mapping
        initSubFeatures(); // Reloads sub-features into the JS runtime state
        applySubFeatureGates(); // Loops over all locked dom buttons and unleashes allowed ones
        
        // 8. Reveal the securely rendered page to the user
        removeAuthSpinner();
        
    } catch (error) {
        console.error('[Auth Guard] Catastrophic network error during secure gateway validation:', error);
        showAuthBlockModal('ERROR', "A network error occurred while verifying access.", "Refresh Page", window.location.href);
    }
}

document.addEventListener('DOMContentLoaded', runGlobalAuthGuard);

let hourlyCheckInterval = null;

function setupHourlyCheck() {
    if (hourlyCheckInterval) return; // Prevent multiple intervals
    
    // Set for exactly 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    
    hourlyCheckInterval = setInterval(async () => {
        try {
            console.log('[Auth Guard] Initiating silent hourly heartbeat validation...');
            const path = window.location.pathname;
            const filename = path.substring(path.lastIndexOf('/')) || '/';
            const featureKey = ROUTE_MAP[filename] || null;

            // Silently call auth_guard behind the scenes
            const response = await fetchWithAuth(API.AUTH_GUARD, { method: 'POST' }, featureKey, 'read');
            if (!response.ok) throw new Error('Network error on heartbeat');
            
            const data = await response.json();

            // 1. Check if access is denied and handle by error type
            if (data.allowed === false) {
                clearInterval(hourlyCheckInterval);
                if (data.error === 'INVALID_SESSION') {
                    localStorage.removeItem('token');
                    showAuthBlockModal('INVALID_SESSION', "Your session is expired, please login.", "Sign In", "signin.html");
                } else if (data.error === 'SUBSCRIPTION_INACTIVE') {
                    showAuthBlockModal('SUBSCRIPTION_INACTIVE', "Your subscription is not active. Please subscribe now to access the features.", "Subscribe Now", "billing-subscription.html");
                } else if (data.error === 'FEATURE_NOT_ALLOWED') {
                    showAuthBlockModal('FEATURE_NOT_ALLOWED', "You currently don't have access to this feature. Please upgrade to have access to the features.", "Upgrade", "billing-subscription.html");
                } else {
                    showAuthBlockModal('ERROR', 'Access denied. Please contact support.', 'Go to Dashboard', 'dashboard.html');
                }
                return;
            }

            // Sync cache gracefully
            if (data.features) localStorage.setItem('userFeatures', JSON.stringify(data.features));
            if (data.permissions) {
                localStorage.setItem('userSubFeatures', JSON.stringify(data.permissions));
                initSubFeatures();
                applySubFeatureGates();
            }
            
            console.log('[Auth Guard] Silent hourly heartbeat validated successfully.');
        } catch (error) {
            console.warn('[Auth Guard] Silent hourly heartbeat failed. Will retry next hour.', error);
        }
    }, ONE_HOUR);
}

let dailyRefreshInterval = null;

/**
 * Sets up a background timer to ping the backend every 24 hours 
 * to slide the session expiration window. The token remains the same.
 */
function setupDailyRefresh() {
    if (dailyRefreshInterval) return; // Prevent multiple intervals
    
    // Set for exactly 24 hours
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    dailyRefreshInterval = setInterval(async () => {
        try {
            console.log('[Auth Guard] Pinging auth_refresh_session to slide token expiration (Daily Heartbeat)...');
            const response = await fetchWithAuth(API.AUTH_REFRESH_SESSION, { method: 'POST' });
            
            if (!response.ok) {
                console.warn('[Auth Guard] Daily session refresh failed remotely. HTTP:', response.status);
            } else {
                console.log('[Auth Guard] Daily session effectively sliding forward.');
            }
        } catch (error) {
            console.warn('[Auth Guard] Daily session refresh drop due to network error.', error);
        }
    }, ONE_DAY);
}

/**
 * Hydrates the global header elements with cached get_app_context data.
 */
export function populateGlobalHeader() {
    const contextStr = localStorage.getItem('appContext');
    if (!contextStr) return;
    
    try {
        const context = JSON.parse(contextStr);
        
        // 1. Get DOM Elements
        const branchSelect = document.getElementById('branchSelect');
        const planBadge = document.getElementById('headerPlanBadge');
        const profileMenu = document.getElementById('profileMenu');
        const avatarImg = document.querySelector('#avatarBtn img');
        
        // 2. Populate Header Plan Badge
        if (planBadge && context.company && context.company.plan) {
            // Capitalize the first letter (e.g. "advance" -> "Advance")
            const planString = context.company.plan;
            planBadge.textContent = planString.charAt(0).toUpperCase() + planString.slice(1);
        }
        
        // 3. Populate Profile Dropdown
        if (profileMenu && context.user) {
            const nameEl = profileMenu.querySelector('.dropdown-name');
            const roleEl = profileMenu.querySelector('.dropdown-role');
            if (nameEl && context.user.name) nameEl.textContent = context.user.name;
            if (roleEl && context.user.role_name) roleEl.textContent = context.user.role_name;
        }

        // 4. Update Avatar Circle (Header)
        let mainAvatarUrl = '';
        if (avatarImg && context.user) {
            if (context.user.profile_photo && context.user.profile_photo.trim() !== '') {
                mainAvatarUrl = context.user.profile_photo;
            } else if (context.user.name) {
                const encodedName = encodeURIComponent(context.user.name);
                mainAvatarUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=1E3A8A&color=fff`;
            }
            if (mainAvatarUrl) avatarImg.src = mainAvatarUrl;
        }
        
        // 4b. Hydrate the Profile Details Modal (If it exists on the page)
        if (context.user) {
            const profileAvatarImg = document.getElementById('profileAvatarImg');
            const profileNameDisplay = document.querySelector('.profile-name-display');
            const profileRoleDisplay = document.querySelector('.profile-role-display');
            
            const profileFirstName = document.getElementById('profileFirstName');
            const profileLastName = document.getElementById('profileLastName');
            const profilePhone = document.getElementById('profilePhone');
            const profileEmail = document.getElementById('profileEmail');
            const profileRoleInput = document.getElementById('profileRole');
            const profileJoined = document.getElementById('profileJoined');
            
            if (profileAvatarImg && mainAvatarUrl) profileAvatarImg.src = mainAvatarUrl;
            if (profileNameDisplay && context.user.name) profileNameDisplay.textContent = context.user.name;
            if (profileRoleDisplay && context.user.role_name) profileRoleDisplay.textContent = context.user.role_name;
            
            if (profileFirstName && context.user.first_name) profileFirstName.value = context.user.first_name;
            if (profileLastName && context.user.last_name) profileLastName.value = context.user.last_name;
            if (profilePhone && context.user.phone) profilePhone.value = context.user.phone;
            if (profileEmail && context.user.email) profileEmail.value = context.user.email;
            if (profileRoleInput && context.user.role_name) profileRoleInput.value = context.user.role_name;
            if (profileJoined && context.user.joined_on) profileJoined.value = context.user.joined_on;
            
            const profileEmergencyName = document.getElementById('profileEmergencyName');
            const profileEmergencyPhone = document.getElementById('profileEmergencyPhone');
            if (profileEmergencyName && context.user.emergency_contact_name) profileEmergencyName.value = context.user.emergency_contact_name;
            if (profileEmergencyPhone && context.user.emergency_contact_number) profileEmergencyPhone.value = context.user.emergency_contact_number;
        }
        
        // 5. Populate Branch Dropdown
        if (branchSelect && context.branches && Array.isArray(context.branches) && context.branches.length > 0) {
            // Sort branches to automatically find the lowest numeric ID as fallback
            const sortedBranches = [...context.branches].sort((a, b) => {
                // Extract numbers from "BR_001" if possible
                const aNum = parseInt((a.id || '').replace(/\D/g, '')) || 0;
                const bNum = parseInt((b.id || '').replace(/\D/g, '')) || 0;
                return aNum - bNum;
            });
            
            // Rebuild the <select> dropdown
            branchSelect.innerHTML = '';
            sortedBranches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.branch_id || b.id;
                opt.textContent = b.branch_name || b.name;
                branchSelect.appendChild(opt);
            });
            
            // Select explicit current_branch_id from payload, OR fallback to lowest sorted ID
            const defaultBranchVal = context.current_branch_id || (sortedBranches[0].id);
            
            // Preserve user's manual selection only if requested, otherwise enforce backend state
            if (!localStorage.getItem('active_branch_id') || context.current_branch_id) {
                localStorage.setItem('active_branch_id', defaultBranchVal);
            }
            
            branchSelect.value = localStorage.getItem('active_branch_id') || lowestBranchVal;
            
            // Bind the "change" event if it isn't completely bound externally
            branchSelect.addEventListener('change', (e) => {
                localStorage.setItem('active_branch_id', e.target.value);
            });
        }
        
        // 6. Populate Schedule Modal
        if (context.schedule) {
            const renderScheduleList = (paneId, weekData) => {
                const pane = document.getElementById(paneId);
                if (!pane) return;
                const ul = pane.querySelector('.schedule-list');
                if (!ul) return;
                
                ul.innerHTML = ''; // Clear hardcoded HTML
                
                if (!weekData || weekData.length === 0) {
                    ul.innerHTML = '<li style="padding: 16px; text-align: center; color: #64748b; font-size: 0.9rem;">No schedule available for this week.</li>';
                    return;
                }
                
                weekData.forEach(shift => {
                    const li = document.createElement('li');
                    li.className = 'schedule-item';
                    li.style.cssText = 'display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 12px 16px; background: #f8fafc; border-radius: 8px; align-items: center; margin-bottom: 8px;';
                    li.innerHTML = `
                        <div class="schedule-date" style="font-size: 0.85rem; color: #64748b; font-weight: 500;">${shift.date || ''}</div>
                        <div class="schedule-day" style="font-weight: 600; color: #334155; font-size: 0.9rem;">${shift.day || ''}</div>
                        <div class="schedule-time" style="color: #0f172a; font-size: 0.9rem; font-weight: 500;">${shift.time || ''}</div>
                        <div class="schedule-notes" style="color: #64748b; font-size: 0.85rem; text-align: right;">${shift.comments || ''}</div>
                    `;
                    ul.appendChild(li);
                });
            };
            
            renderScheduleList('paneThisWeek', context.schedule.this_week);
            renderScheduleList('paneNextWeek', context.schedule.next_week);
        }

    } catch (e) {
        console.error('[Auth Guard] Failed to hydrate global header DOM securely', e);
    }
}

/**
 * Removes the BharathBots branded loading spinner and reveals the page.
 */
function removeAuthSpinner() {
    document.documentElement.style.display = '';
    const loader = document.getElementById('bbAuthLoader');
    const loaderStyle = document.getElementById('bbLoaderStyle');
    if (loader) loader.remove();
    if (loaderStyle) loaderStyle.remove();
}

/**
 * Helper to display an un-closable, full-screen blocking modal
 * Uses existing CSS variables and tailwind-style properties to match the theme.
 */
function showAuthBlockModal(errorType, messageText, buttonText, buttonLink) {
    // 0. Prevent duplicate modals — bail out if one is already shown
    if (document.getElementById('authGuardBlockOverlay')) return;

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
        <div id="authGuardBlockOverlay" onclick="window.location.href='dashboard.html'" style="display: flex !important; z-index: 2147483647 !important; background: rgba(15, 23, 42, 0.75) !important; backdrop-filter: blur(12px) !important; position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; align-items: center !important; justify-content: center !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; cursor: pointer !important;">
            <div onclick="event.stopPropagation()" style="max-width: 440px !important; width: 90% !important; text-align: center !important; padding: 2.5rem !important; border-radius: 16px !important; background: white !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important; border: 1px solid #e2e8f0 !important; animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important; position: relative !important; z-index: 2147483647 !important; display: block !important; cursor: default !important;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 0 1.5rem 0;">
                    <div style="background: ${iconBg}; color: ${iconColor}; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
                    </div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: 0; font-family: Inter, sans-serif;">Access Restricted</h2>
                </div>
                <div style="padding: 0 0 2rem 0;">
                    <p style="font-size: 1.05rem; color: #475569; line-height: 1.6; margin: 0; font-family: Inter, sans-serif;">${messageText}</p>
                </div>
                <div style="display: flex; justify-content: center; padding: 0; width: 100%;">
                    <button style="width: 100% !important; padding: 1rem !important; font-size: 1rem !important; font-weight: 600 !important; font-family: Inter, sans-serif !important; cursor: pointer !important; border-radius: 8px !important; border: none !important; background: #0f172a !important; color: white !important; transition: background 0.2s !important; display: block !important;" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='#0f172a'" onclick="window.location.href='${buttonLink}'">${buttonText}</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(24px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

