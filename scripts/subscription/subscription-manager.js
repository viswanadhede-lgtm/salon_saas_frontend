/**
 * Global Subscription State
 */
window.Subscription = {
    plan: null,
    features: [],
    limits: {}
};

/**
 * Initializes the global subscription state from backend payload.
 * 
 * @param {Object} data - The subscription data payload.
 */
export function initializeSubscription(data) {
    if (!data) return;
    
    window.Subscription.plan = data.plan || null;
    window.Subscription.features = Array.isArray(data.features) ? data.features : [];
    window.Subscription.limits = data.limits || {};
}

/**
 * Returns the current subscription plan.
 * @returns {string|null}
 */
export function getPlan() {
    return window.Subscription.plan;
}

/**
 * Checks if the current subscription grants access to a specific feature.
 * 
 * @param {string} featureKey - The string identifier from the feature registry.
 * @returns {boolean} True if the feature exists in the current subscription.
 */
export function hasFeature(featureKey) {
    if (!window.Subscription || !Array.isArray(window.Subscription.features)) return false;
    return window.Subscription.features.includes(featureKey);
}

/**
 * Checks if the subscription state has been initialized.
 * @returns {boolean}
 */
export function isSubscriptionReady() {
    return (
        window.Subscription.plan !== null &&
        Array.isArray(window.Subscription.features)
    );
}

/**
 * Generic limit checker.
 * 
 * @param {string} limitKey - The key of the limit (e.g., 'max_staff').
 * @param {number} currentCount - The current count to check against the limit.
 * @returns {boolean} True if within limit or if limit is not set.
 */
export function withinLimit(limitKey, currentCount) {
    if (!window.Subscription || !window.Subscription.limits) return true;
    
    const limit = window.Subscription.limits[limitKey];
    if (limit === undefined || limit === null) return true; // Assume unlimited
    
    return currentCount < limit;
}

/**
 * Checks if the current staff count allows adding more staff based on subscription limits.
 * 
 * @param {number} currentCount - The current number of staff members.
 * @returns {boolean} True if currentCount is strictly less than max_staff limit.
 */
export function canAddStaff(currentCount) {
    return withinLimit('max_staff', currentCount);
}

/**
 * Checks if the current branch count allows adding more branches based on subscription limits.
 * 
 * @param {number} currentCount - The current number of branches.
 * @returns {boolean} True if currentCount is strictly less than max_branches limit.
 */
export function canAddBranch(currentCount) {
    return withinLimit('max_branches', currentCount);
}

export const Subscription = window.Subscription;
