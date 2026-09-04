import { SUB_FEATURES_MAP } from '../../config/sub-feature-registry.js';
import { FEATURES } from '../../config/feature-registry.js';

let userSubFeatures = [];

/**
 * Initializes the user's granular sub-features directly from the secure
 * localized cache populated by the backend Global Auth Guard API sequence.
 */
export function initSubFeatures() {
    const saved = localStorage.getItem('userSubFeatures');
    try {
        userSubFeatures = saved ? JSON.parse(saved) : [];
    } catch (e) {
        userSubFeatures = [];
    }

    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        const userFeatures = JSON.parse(localStorage.getItem('userFeatures') || '[]');
        const isOwner = appContext.user?.role_name?.toLowerCase() === 'owner'
                     || userFeatures.includes('ALL')
                     || userSubFeatures.includes('ALL');

        if (isOwner) {
            // Re-derive all sub-features from SUB_FEATURES_MAP for any features the salon/role has
            userFeatures.forEach(feat => {
                const children = SUB_FEATURES_MAP[feat] || [];
                children.forEach(sf => {
                    if (!userSubFeatures.includes(sf.key)) {
                        userSubFeatures.push(sf.key);
                    }
                });
            });
            localStorage.setItem('userSubFeatures', JSON.stringify(userSubFeatures));
        } else if (userFeatures.includes(FEATURES.COMPANY_SETTINGS) && userSubFeatures.includes('settings_manage_company')) {
            // Existing roles that already had general company settings management permission
            // should also have access to the settings cards unless explicitly restricted
            const settingsChildren = SUB_FEATURES_MAP[FEATURES.COMPANY_SETTINGS] || [];
            let updated = false;
            settingsChildren.forEach(sf => {
                if (!userSubFeatures.includes(sf.key)) {
                    userSubFeatures.push(sf.key);
                    updated = true;
                }
            });
            if (updated) {
                localStorage.setItem('userSubFeatures', JSON.stringify(userSubFeatures));
            }
        }
    } catch (e) {
        console.warn('[Sub-Feature Manager] Auto-sync error:', e);
    }

    console.log(`[Sub-Feature Manager] Initialized tracking matrix with ${userSubFeatures.length} authenticated micro-permissions.`);
}

/**
 * Check if the currently logged-in user has access to a specific sub-feature string.
 * @param {string} featureKey - the string representing the action (e.g. 'pos_issue_refund')
 * @returns {boolean} true if they have it, false if restricted.
 */
export function hasSubFeature(featureKey) {
    if (!featureKey) return true;
    if (userSubFeatures.includes('ALL')) return true;

    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (appContext.user?.role_name?.toLowerCase() === 'owner') return true;
        const userFeatures = JSON.parse(localStorage.getItem('userFeatures') || '[]');
        if (userFeatures.includes('ALL')) return true;
    } catch (e) {}

    return userSubFeatures.includes(featureKey);
}

// Auto-initialize instantly.
initSubFeatures();
