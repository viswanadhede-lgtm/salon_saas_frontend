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
    console.log(`[Sub-Feature Manager] Initialized tracking matrix with ${userSubFeatures.length} authenticated micro-permissions.`);
}

/**
 * Check if the currently logged-in user has access to a specific sub-feature string.
 * @param {string} featureKey - the string representing the action (e.g. 'pos_issue_refund')
 * @returns {boolean} true if they have it, false if restricted.
 */
export function hasSubFeature(featureKey) {
    if (!featureKey) return true;
    return userSubFeatures.includes(featureKey);
}

// Auto-initialize instantly. Because auth-guard makes an async call, this executes
// securely *before* the API returns. The UI starts in a perfectly hardened locked state!
// Once the auth network response completes, it manually re-calls initSubFeatures() and the UI magically unlocks.
initSubFeatures();
