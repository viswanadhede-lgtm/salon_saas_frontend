// Simulated Backend Payload for testing.
// In reality, this comes from the server when the user logs in.
const MOCK_USER_SESSION = {
    user: {
        id: 'USR_123',
        name: 'Sarah Stylist',
        role_name: 'Senior Stylist'
    },
    // The server specifically gives Sarah these exact granular actions
    permitted_sub_features: [
        'booking_create',
        'booking_edit',
        'pos_checkout',
        'customer_create',
        'report_view_basic',
        'staff_view_all_schedules'
        // Notice she does NOT have 'pos_issue_refund' or 'customer_export'
    ]
};

let userSubFeatures = [];

/**
 * Initializes the user's granular sub-features. 
 * Eventually this will read from localStorage or fetch from the API.
 */
export function initSubFeatures() {
    userSubFeatures = MOCK_USER_SESSION.permitted_sub_features || [];
    console.log(`[Sub-Feature Manager] Loaded ${userSubFeatures.length} sub-features for ${MOCK_USER_SESSION.user.role_name} (Simulation)`);
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

// Auto-init for frontend prototype
initSubFeatures();
