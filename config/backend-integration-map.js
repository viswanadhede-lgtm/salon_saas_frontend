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

// 1. SERVICES TAB
//
// Services Table - No RPC Functions
//

// 2. SERVICE CATEGORIES TAB
//
// Service Categories Table - No RPC Functions
//

// 3. PACKAGES TAB
//
// Packages Table & package_services Table (when a new package is created package name is created in the packages table and the services inside the package are written into the package_services table)
// 
//
//    a. Create a New Package
//       create_package_atomic [RPC Function] - This one creates a new package.
//       
//
//    b. Update a Package
//       update_package_atomic [RPC Function] -  This one updates an existing package.
//     

//===================================================================================================
// STAFF PAGE
//==================================================================================================

//  1. Stat Cards - Direct supabase query - No RPC Functions - Source Table is STAFF Table.

//  For staff page its only the STAFF table ..
//

//========================================================================================================
// STAFF SCHEDULE 
//========================================================================================================

// staff schedule page uses 3 tables

// a. Staff table - Populating the staff dropdown in the Create modal.
// b. staff_schedule table - To save the staff's schedule data.
// c. bookings_for_business_transaction - Fetching today's booking count per staff (Today Bookings column in the table).

//====================================================================================================================
