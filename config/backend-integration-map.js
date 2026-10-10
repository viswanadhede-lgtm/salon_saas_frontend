// BACKEND INTEGRATION MAP

// ==================================================
// IMPORTANT PURPOSE
// ==================================================

// This map is documentation only. Features are added only after
// their integration has been audited, hardened, implemented,
// and validated.

// ==================================================
// CUSTOMERS PAGE
// ==================================================

// 1. Stat Cards
//    customers_page__four_statcards [RPC Function]
//    Source: customers table
//
//    - Total Customers
//    - New This Month
//    - VIP Customers
//    - Inactive (90+ Days)

// 2. Customers Table
//    Source: customers table directly
//
//    - Customer
//    - Contact
//    - Last Visit
//    - Tags / Status
//    - Notes
//
//    a. Total Spent Updation - Booking
//       On completed booking:
//       customers.total_spent is updated with the booking value.
//
//    b. Total Spent Updation - Product Sale
//       On completed product sale:
//       customers.total_spent is updated with the product-sale value.
//
//    c. Total Spent Updation - Membership Purchase
//       On completed membership purchase:
//       customers.total_spent is updated with the membership value.
//
//    d. Last Visit Updation - Booking
//       On completed booking:
//       customers.last_visit is updated.
//
//    e. Last Visit Updation - Product Sale
//       On completed product sale:
//       customers.last_visit is updated.
//
//    f. Last Visit Updation - Membership Purchase
//       On completed membership purchase:
//       customers.last_visit is updated.
//
//    g. Clickable Total Spent
//       customers_page_clickable_total_spent [RPC Function]
//       Sources:
//       - bookings_for_business_transaction
//       - sales_for_business_transactions
//       - membership_purchases

// 3. Stat Card Trend Elements
//    customers_page__four_statcard_trendelements [RPC Function]
//    Source: customers table

// 4. Global Customer Profile Modal
//    Uses two RPC Functions:
//    - Global_customer_profile_modal
//    - customers_page_clickable_total_spent
//
//    Global_customer_profile_modal sources:
//    - customers
//    - bookings_for_business_transaction

//===================================================================================================
//SERVICES PAGE
//===================================================================================================

//SERVICES TAB
//
// 1. 