const BASE_URL = "https://dev.bharathbots.com/webhook";

// Razorpay Configuration
export const RAZORPAY = {
  CALLBACK_URL: "https://www.bharathbots.com/payment-result.html"
};

export const API = {
  AUTH_REGISTER_COMPANY: `${BASE_URL}/auth_register_company`,
  AUTH_LOGIN: `${BASE_URL}/auth_login`,
  CREATE_PAYMENT_LINK: `${BASE_URL}/create_payment_link`,
  START_FREE_TRIAL: `${BASE_URL}/start_free_trial`,
  READ_ADDONS: `${BASE_URL}/read_addons`,
  CREATE_ORDER: `${BASE_URL}/create_order`,
  AUTH_GUARD: `${BASE_URL}/auth_guard`,
  PAYMENT_STATUS: `${BASE_URL}/payment_status`
};

/**
 * Standardized fetch wrapper that automatically injects the Authorization token 
 * and an optional X-Feature-Key header for feature gating on the backend.
 * 
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Standard fetch options (method, body, etc.)
 * @param {string|null} featureKey - The feature constant from feature-registry.js (e.g., FEATURES.DASHBOARD_ACCESS)
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, options = {}, featureKey = null) {
    const token = localStorage.getItem('token');
    
    // Initialize headers object, merging with any provided in options
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (featureKey) {
        headers['X-Feature-Key'] = featureKey;
    }

    // Merge our computed headers back into the options
    const fetchOptions = {
        ...options,
        headers
    };

    return fetch(url, fetchOptions);
}
