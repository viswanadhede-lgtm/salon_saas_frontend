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
// BOOKINGS
//====================================================================================================================

// A. Core Transaction and Booking Tables
//
//  1. bookings_for_business_transaction TABLE - Written By RPC Function - create_booking_atomic 
//  2. bookings TABLE  - written By RPC Function - Create_booking_atomic 
//  3. business_transactions TABLE -
//  4. customers TABLE

// B. Catalog and Dropdown Tables — Read Operations
//  
//  1. Services TABLE - Populates service selection options in New Booking and Edit Booking modals.
//  2. staff TABLE - Populates staff assignment dropdowns, staff filters, and staff name lookups.
//  3. packages TABLE - Populates package selection options in the booking modal.
//  4. package_services TABLE - Expands a selected package into its constituent services.

// C. Auxiliary Tables — Customer Profile Modal
//  
//  1. sales_for_business_transactions TABLE - Used to retrieve retail product sales for the customer's lifetime spend calculation in viewCustomerProfile().
//  2. membership_purchases TABLE - Used to retrieve membership purchase information for the customer's lifetime spend calculation in viewCustomerProfile().

//=============================================================================================================================================================

// DB TRIGGERS & RPC FUNCTIONS // ===============

//DB TRIGGERS:

          // Trigger 1 : trg_create_initial_business_transaction -- Whenever a new booking summary row is inserted, it immediately inserts a row into business_transactions
          // Trigger 2 : trg_update_customer_stats_on_complete -- updates the customers table's total spent and last visit columns ...

// RPC FUNCTIONS // ==============================================

// 4 Core RPC Functions (plus 1 Calendar Aggregation RPC):

// RPC 1: create_booking_atomic 
  
    //  Inserts all service rows into bookings Table (one row for one service) and Inserts the 1 consolidated summary row into bookings_for_business_transaction Table.

// RPC 2: update_booking_atomic

    // if the Booking is updated .. this function updates in all 4 tables - Bookings Table, bookings_for_business_transaction TABLE and Business Transactions TABLE.

// RPC 3: process_booking_payment_atomic

    //   a.when payment is done it Updates the existing business_transactions row (reference_id = p_booking_id and status = 'created') ➔ status = 'paid', payment_method = p_payment_method,     		paid_at = NOW().
    //   b. Updates bookings_for_business_transaction ➔ payment_status = 'paid', final_amount = p_amount_collected, discount fields.
    //   c. Updates all service rows in bookings ➔ payment = 'paid'.

// RPC 4: process_booking_refund_atomic

    //   a. Reads the paid amount from business_transactions.
    //   b. Inserts a NEW row into business_transactions with status = 'refunded', amount = paid_amount, reference_id = p_booking_id.
    //   c. Updates bookings_for_business_transaction ➔ payment_status = 'refunded', status = 'cancelled'.
    //   d. Updates all service rows in bookings ➔ status = 'cancelled', payment = 'refunded'.
    //   e. If the booking was previously 'completed', deducts the refund from customers.total_spent.

// RPC 5: get_calendar_month_bookings_summary (For Tab 3 Calendar)

    //   a. What it returns: Daily counts for each date (total, booked, confirmed, completed, cancelled, no_show).

//
//
//====================================================================================================================================================================================================================


// Bookings summary 

// 1. New Booking Creation

// Mechanism: RPC Function (create_booking_atomic)
// Execution:
// The frontend sends a single payload containing customer info, service items, and summary totals.
// In one atomic PostgreSQL transaction:
// Checks for customer existence / creates customer if new.
// Inserts N service rows into the bookings table (sharing the same booking_id).
// Inserts 1 consolidated summary row into bookings_for_business_transaction.
// Why: Prevents orphaned rows, eliminates duplicate client HTTP calls, and ensures 100% database consistency.

// 2. Update Booking

// Mechanism: RPC Function (update_booking_atomic)
// Execution:
// The frontend sends an updated payload containing booking_id, appointment date/time, notes, status, and the updated list of services (including staff assignments and prices).
// In one atomic PostgreSQL transaction across 3 tables:
// 1. bookings: Atomically deletes previous service rows for this booking_id and re-inserts the updated service line items.
// 2. bookings_for_business_transaction: UPDATES the consolidated summary row with the new comma-separated service names, staff names, IDs, date, time, notes, status, recalculated total_price, and final_amount (if unpaid).
// 3. business_transactions: UPDATES the existing open transaction row (where reference_id = booking_id AND status = 'created') setting amount = new total_price. (If already paid, the past financial record remains untouched and immutable).
// 4. Customer Stats Trigger: If the status transitions to 'completed', Trigger 2 auto-fires to update customers.total_spent and customers.last_visit.
// Why:
// - Prevents ledger desynchronization: When services or prices are added/removed, the financial ledger and the Pending Payments page immediately reflect the new due amount.
// - Replaces multiple loose network calls with 1 atomic database transaction.
// - Guarantees zero orphaned rows or half-saved records if a network failure occurs during an edit.


// 3. Initial Transaction Creation

// Mechanism: Database Trigger (AFTER INSERT ON bookings_for_business_transaction)
// Execution:
// Automatically creates an initial ledger row in business_transactions:
// reference_id = booking_id
// reference_type = 'booking'
// amount = total_price
// status = 'created'
// Why: Guaranteed financial record creation on the database level, regardless of how or where the booking was created.

// 4. Payment Collection (Full Payment Only — No Partial Payments)

// Mechanism: Atomic Payment Flow across 3 Tables
// Execution:
// business_transactions: UPDATES the existing transaction row from status = 'created' ➔ status = 'paid', records payment_method, and sets paid_at = NOW().
// bookings_for_business_transaction: UPDATES the row setting payment_status = 'paid', along with applied discount and final amount.
// bookings: UPDATES all individual service rows for that booking_id setting payment = 'paid'.
// Why: Modifies existing rows instead of creating duplicate records, preventing accidental double-counting in ledger summaries.

// 5. Refund Processing (Full Refunds Only — No Partial Refunds)

// Rule & Calculation:
// Refund Amount = Total Paid Amount (100% full refund of the amount collected).
// Execution across 3 Tables:
// business_transactions: INSERTS a new row with status = 'refunded', amount = paid_amount, referencing the original booking_id.
// bookings_for_business_transaction: UPDATES the existing row setting payment_status = 'refunded' and status = 'cancelled'.
// bookings: UPDATES all existing service rows setting status = 'cancelled' and payment = 'refunded'.
// Why: Maintains an immutable accounting audit trail (never deleting past payments) while accurately updating appointment statuses.

// 6. Pending Payments Page

// Source: bookings_for_business_transaction
// Filter: payment_status IN ('pending', 'created')
// Display:
// 1 row per booking_id.
// Shows Customer, Service list, Staff, Date/Time, and Bill Amount.
// Since no partial payments exist: Amount Paid = ₹0, Amount Due = Full Bill.
// Why: Leverages the table that already consolidates customer details, services, and amounts in a single query.


// 7. Payments History Page

// Source: business_transactions (via payment_history_view)
// Filter: Displays settled payments (status = 'paid') AND refund ledger entries (status = 'refunded').
// Display: Shows transaction receipts, customer names, payment methods, timestamps, and refund events distinctly.
// Why: Provides a true financial ledger containing all inflows (payments) and outflows (refunds).



// 8. Customer Table Updation (total_spent & last_visit)

// Trigger Event: Triggered only when a booking's status changes to 'completed'.
// Execution:
// On Completion:
// customers.total_spent = current total_spent + final_amount
// customers.last_visit = NOW()
// On Subsequent Refund:
// If a completed booking is later refunded, the refunded amount is deducted: customers.total_spent = customers.total_spent - refund_amount
// Why: Executed in the database to prevent client-side race conditions and keep VIP/spending analytics 100% accurate.
// Architectural Summary Matrix
// Domain	Target Table(s)	Operation	Mechanism
// New Booking	bookings + bookings_for_business_transaction	Insert	RPC Function (create_booking_atomic)
// Initial Transaction	business_transactions (status = 'created')	Insert	Supabase Database Trigger
// Collect Payment	business_transactions + bookings_for_business_transaction + bookings	Update across all 3	RPC or Transactional Update
// Process Refund	business_transactions (Insert refund row) + bookings_for_business_transaction & bookings (Update)	Insert + Updates	RPC Function (process_booking_refund_atomic)
// Pending Payments	bookings_for_business_transaction	Read (status != 'paid')	Direct Supabase Query
// Payments History	payment_history_view (business_transactions)	Read ('paid', 'refunded')	Direct Supabase Query
// Customer Stats	customers (total_spent, last_visit)	Update	DB Trigger / Atomic Function

//========================================================================================================================================================================================
// BOOKING-STATUS, PAYMENT-STATUS  &  ACTIONS relation in Bookings Table
//

    //state 1 : IF Status = Booked/Confirmed  ||    AND  ||  Payment = Collect  || THEN ||  Actions show Update.

    //state 2 : IF Status = Completed   ||  AND  ||  Payment = Paid     ||  THEN    ||  Actions will show view 

    //state 3 : IF Status = Cancelled   ||  AND  ||  Payment = Collect  || THEN     ||  Actions will show Rebook (when the booking status is updated to cancelled the payment collect button should grey out and show cancelled with grey color light weight under the collect button )

    //state 4:  IF Status = Cancelled   ||  AND  ||  Payment = Paid     ||  THEN    ||  Actions will show Info [when clicked on it will show two options REFUND and REBOOK ]

    //state 5:  IF Status = No-Show     ||  AND  ||  Payment = Collect  || THEN     ||  Actions will show Rebook (when the booking status is updated to No-Show the payment collect button should grey out and show cancelled with grey color light weight under the collect button )

    //state 6:  IF Status = No-Show     ||  AND  ||  Payment = Paid     ||  THEN    ||  Actions will show Info [when clicked on it will show two options Refund and Rebook ]

// NOTES:   

//1. Basically No-Show and Cancelled are the same

//2. Booking status can not change to complete with out payment is paid.


====================================================================================================================================================================================================================