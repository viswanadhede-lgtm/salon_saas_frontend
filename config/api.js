const BASE_URL = "https://dev.bharathbots.com/webhook";

// Razorpay Configuration
export const RAZORPAY = {
  CALLBACK_URL: "https://www.bharathbots.com/payment-result.html"
};

export const API = {
  AUTH_REGISTER_COMPANY: `${BASE_URL}/auth_register_company`,
  AUTH_LOGIN: `${BASE_URL}/auth_login`,
  CREATE_PAYMENT_LINK: `${BASE_URL}/create_payment_link`,
  AUTH_CHECK_EMAIL_EXISTS: `${BASE_URL}/auth_check_email_exists`,
  AUTH_REFRESH_SESSION: `${BASE_URL}/auth_refresh_session`,
  AUTH_LOGOUT: `${BASE_URL}/auth_logout`,
  START_FREE_TRIAL: `${BASE_URL}/start_free_trial`,
  READ_ADDONS: `${BASE_URL}/read_addons`,
  CREATE_ORDER: `${BASE_URL}/create_order`,
  AUTH_GUARD: `${BASE_URL}/auth_guard`,
  GET_APP_CONTEXT: `${BASE_URL}/get_app_context`,
  PAYMENT_STATUS: `${BASE_URL}/payment_status`,
  SUBSCRIPTION_CREATE: `${BASE_URL}/subscription_create`,
  CREATE_CUSTOMER: `${BASE_URL}/create_customer`,
  READ_CUSTOMERS: `${BASE_URL}/read_customers`,
  UPDATE_CUSTOMER: `${BASE_URL}/update_customer`,
  DELETE_CUSTOMER: `${BASE_URL}/delete_customer`,
  CREATE_SERVICE_CATEGORY: `${BASE_URL}/create_service_category`,
  READ_SERVICE_CATEGORY: `${BASE_URL}/read_service_category`,
  UPDATE_SERVICE_CATEGORY: `${BASE_URL}/update_service_category`,
  DELETE_SERVICE_CATEGORY: `${BASE_URL}/delete_service_category`,
  CREATE_SERVICE: `${BASE_URL}/create_service`,
  READ_SERVICES: `${BASE_URL}/read_services`,
  UPDATE_SERVICE: `${BASE_URL}/update_service`,
  DELETE_SERVICE: `${BASE_URL}/delete_service`,
  CREATE_BOOKING: `${BASE_URL}/create_booking`,
  UPDATE_BOOKING: `${BASE_URL}/update_booking`,
  READ_BOOKINGS: `${BASE_URL}/read_bookings`,
  CANCEL_BOOKING: `${BASE_URL}/cancel_booking`,
  CREATE_STAFF: `${BASE_URL}/create_staff`,
  READ_STAFF: `${BASE_URL}/read_staff`,
  UPDATE_STAFF: `${BASE_URL}/update_staff`,
  DELETE_STAFF: `${BASE_URL}/delete_staff`,
  READ_SCHEDULE: `${BASE_URL}/read_schedule`,
  CREATE_SCHEDULE: `${BASE_URL}/create_schedule`,
  UPDATE_SCHEDULE: `${BASE_URL}/update_schedule`,
  DELETE_SCHEDULE: `${BASE_URL}/delete_schedule`,
  READ_ROLES: `${BASE_URL}/read_roles`,
  CREATE_ROLE: `${BASE_URL}/create_role`,
  UPDATE_ROLE: `${BASE_URL}/update_role`,
  DELETE_ROLE: `${BASE_URL}/delete_role`
};

/**
 * Standardized fetch wrapper that automatically injects the Authorization token,
 * an optional X-Feature-Key header, and an X-Action-Type header for backend RBAC gating.
 * 
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Standard fetch options (method, body, etc.)
 * @param {string|null} featureKey - The feature constant from feature-registry.js (e.g., FEATURES.DASHBOARD_ACCESS)
 * @param {string|null} actionType - The CRUD action being performed ('create', 'read', 'update', 'delete')
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, options = {}, featureKey = null, actionType = null) {
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

    if (actionType) {
        headers['X-Action-Type'] = actionType;
    }

    // Merge our computed headers back into the options
    const fetchOptions = {
        ...options,
        headers
    };

    return fetch(url, fetchOptions);
}
