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
