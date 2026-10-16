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

//3. When Refund happens the Payment status is updated to Refunded.


// ====================================================================================================================================================================================================================
// PRODUCTS PAGE
// ====================================================================================================================================================================================================================

// TABLES USED

//  products TABLE
//  product_categories TABLE

// 1. Stock Update - [RPC Function] - deduct_product_stock - To deduct product quantities from the PRODUCTS table during POS checkout, safely handling concurrent sales.

// 2. Storage Bucket -  product-images  -  Stores product photos -  OPERATIONS: Upload (PUT), Delete (REMOVE), Get Public URL


//============================================================================================================================================================================
// POS PAGE
//============================================================================================================================================================================

// WORKING SUMMARY

  // When products are selected and Collect is clicked in POS, the Global Payment Modal opens.
  // When 'Collect Payment' button is clicked in the modal, the RPC Function `create_pos_sale_atomic` runs:
  //   1. Validates and deducts stock from `products` table atomically (locking rows to prevent overselling).
  //   2. Inserts all product line items into `sales` table (one row for each product, status = 'paid').
  //   3. Inserts 1 consolidated summary row into `sales_for_business_transactions` table (payment_status = 'paid').
  // When the summary row is inserted into `sales_for_business_transactions`, the DB Trigger `trg_create_pos_business_transaction` fires:
  //   - Automatically writes 1 financial ledger row into `business_transactions` (reference_type = 'product', reference_id = sale_id, status = 'paid', paid_at = NOW()).

// TABLES USED:
   
    // 1. sales Table - 1 row per product item in a sale (status = 'paid')
    // 2. sales_for_business_transactions Table - Consolidated 1 header/summary row per sale transaction (payment_status = 'paid')
    // 3. business_transactions Table - Central financial ledger row (reference_type = 'product', status = 'paid')
    // 4. products Table - Stock quantities decremented atomically

// RPC FUNCTIONS USED:

    // RPC 1: create_pos_sale_atomic
    //   - Parameters: p_company_id, p_branch_id, p_sale_id, p_customer_id, p_customer_name, p_customer_phone, p_payment_method, p_staff_id, p_staff_name, p_items (jsonb), p_discount_type, p_discount_name, p_discount_amount, p_final_amount
    //   - Actions: Validates & deducts inventory in products table, inserts line items into sales table, inserts consolidated summary row into sales_for_business_transactions table.
    //   - Returns: JSON with success, sale_id, total_quantity, total_price, final_amount, and deducted_items (with remaining_stock for alerts).

// DB TRIGGERS USED:
  
    // Trigger 1: trg_create_pos_business_transaction (Function: trg_pos_sale_business_transaction)
    //   - Fires: AFTER INSERT ON sales_for_business_transactions FOR EACH ROW
    //   - Action: Inserts a row into business_transactions with status = 'paid', reference_type = 'product', reference_id = sale_id, amount = final_amount, paid_at = NOW().


//=============================================================================================================================================================
// SALES HISTORY PAGE
//=============================================================================================================================================================

// REFUND LOGIC

// When clicked on refund in the actions column, it will open the refund modal (here the frontend will calculate the refund calculations and display it in the UI ) and once the issue refund button is clicked then it will call the RPC function *process_pos_refund_atomic* ... whose functionality is explained below ..

   //   >>> Frontend will not modify anything from the existing table

   //   >>> Even the RPC Function *process_pos_refund_atomic* should not update anytable except the products table the products count ... other three tables would be a new row insertion....rather it should add a new row in all the three tables
         
         // .. sales table - new row should be inserted (one row per one product status = refunded)  -  done by this RPC function [process_pos_refund_atomic]
         //.. sales for business transaction - new row should be added (one consolidated row per transaction status = refunded)  -  done by this RPC function [process_pos_refund_atomic]
         //.. Business Transactions - one row should be added (one consolidated row per transaction with status = refunded) - Done by the trigger [trg_create_pos_business_transaction ]
         // .. Products table - Product count should be increased - -  done by this RPC function [process_pos_refund_atomic]

   // how a refund row in business transaction table is inserted ?

       // we will use a trigger * trg_create_pos_business_transaction * 
          
       // This trigger is being used at two functions 
          
            //  1 is when a pos sale is happened, the create_pos_sale_atomic Function inserts into the sales table and sales for business transaction table and when a row is 
                 //   inserted in the sales for business transactions table then this trigger * trg_create_pos_business_transaction * will create a new row in business transactions    	  table...
            // 2: so we are using this trigger to do the insertion of new refund row in the business transaction table ... so it will use type = paid and type = refund ...
                 //Based on the type this trigger writes the paid row and the refunded row ...
   


//=====================================================================================================================

// RPC FUNCTIONS USED: 
//   process_pos_refund_atomic - (Refund RPC: to be implemented for atomic return)

// TRIGGER USED:
//   trg_create_pos_business_transaction 


//====================================================================================================

// 3 states of Actions column related to Refunds in the sales history table

// State 1: Sale is PAID (no refund yet) >>> Action will show "Info Button" >>> clicking on which will open a modal with 2 cards >> 1 = Invoice & 2 = Refund.

// State 2: Sale is partial (some items refunded, some still active) >>> Same Info button, same modal, but now 3 cards >>> 1 = Invoice, 2 = Refunded (read-only)[Shows what     	 was already refunded — which products, qty, amount. No action, just info], 3 = Refund [Click → opens Refund modal (to return the remaining items)]

// State 3: State 3: Sale is refunded (fully refunded) >> Same Info Button >> modal opens with 2 cards >> 1 = Invoice, 2 = Refunded (read only) Shows full refund details — 	 no Refund card since nothing left to return.



//========================================================================================================================================================================================================================================================================
//  MEMBERSHIPS PAGE
//=====================================================================================================================================================================================

// MEMBERHSIP PLANS TAB

// For Membership Plans tab it used only 1 table -  MEMBERSHIPS TABLE -  No RPC or NO Nothing 

//========================================================================================================

// ACTIVE MEMBERSHIPS TAB----------------- 

// MEMBERSHIP_PURCHASES TABLE


// ACTIVE MEMBERSHIPS TABLE - STATUS, PAYMENT & ACTIONS RELATIONSHIPS 

     // State 1: If Status = Active || AND || Payment = Paid || THEN || Actions will show View & cancel

     // State 2: If Status = Expired || AND || Payment = Paid || THEN || Actions will show View & Renew

     // State 3: If Status = Cancelled || AND || Payment = Paid || THEN || Actions will show View & Refund

     // State 4: If Status = Refunded  || AND || Payment = Refunded || THEN || Actions will show View + Info


// Renew Logic - When renew is clicked the assign membership modal opens with pre filled details.

// Status set to Expired logic - It is done by the Frontend only, when expiry date < Todays date then the frontend will update the status to expired in the memberhsip..when ever this page loads.


//--------------------------------------------------------------

// ASSIGN MEMBERSHIP WORKING PROCESS --

      // When user opened assign memberhsip modal and clicked on collect payment in the assign membership modal  then the frontend will activate this RPC And what this RPC does is 

          //1. RPC will read from the 3 tables mentioned (customers, memberships and memberhsip_purchases) 
          //2. write to memberhsip_purchases table
          //3. conditional write to customers table
          //4. write to business transaction table ..

//  EXPLANATION :-

// RPC FUNCTION 1. assign_membership RPC: What Does It Do & Which Tables?
         // What it does:

        //It executes the entire assignment workflow in one single database transaction (BEGIN ... COMMIT). If anything fails (e.g. invalid plan ID or network glitch), the whole transaction rolls back, preventing partial or broken records.

    // Which tables does it READ from?

                // 1. memberships table (Read):

                    // a. Reads the membership plan by membership_id to verify true plan price, duration, and discounts directly from the server (ensuring client-side tampering is      	   impossible).
            
                // 2. customers table (Read):

                    // a.Checks if a customer with the given phone number already exists.

                // 3. membership_purchases table (Read):
    
                    // a.Checks if the customer already has an active membership for this plan to prevent accidental duplicate purchases.


   // Which tables does it WRITE to?

                // 1. customers table (Conditional Write):

	                // a.If the customer does not exist yet, it inserts a new customer record (customer_name, customer_phone, customer_email, company_id, branch_id).

                // 2. membership_purchases table (Write):
 
                    // a.Inserts the new purchase record (purchase_id, company_id, branch_id, customer_id, plan_name, price, duration, purchase_date, expiry_date, payment_method,   	    payment_status = 'paid', status = 'active').

                // 3. business_transactions table (Write):
          
                    // a.Inserts the financial ledger entry (reference_id = purchase_id, reference_type = 'membership', amount = final_amount, status = 'paid', payment_method).


//  --------------------------------------------------------------------------

// MEMBERSHIP CANCELLATION WORKING PROCESS.

   //   In the Active Memberships table, when a record is in State 1 (status = 'active' & payment_status = 'paid'), the action column displays View and Cancel.
         // Clicking Cancel opens the confirmation modal displaying customer name, plan name, start date, elapsed duration, and an optional Reason / Notes textarea.
         // Clicking "Cancel Membership" in the modal activates this RPC cancel_membership

    // so what this RPC [cancel_membership]do is (it updates only one table) it will read from membership purchases table and updates the memberhsip purchases table ... 

        //it updates the below columns in the membership purchases table.

        // 1. status = cancelled
        // 2. cancelled date = current date ?
        // 3. udpated at = now
        // 4. notes = if any.


//  ----------------------------------------------------------------------------------

// MEMBERSHIP REFUND WORKING PROCESS.

     // In the Active Memberships table, when a record is in State 3 (status = 'cancelled' & payment_status = 'paid'), the action column displays View and Refund
          
     // Clicking Refund opens the Process Membership Refund modal displaying:
               //  Original plan price & collected amount.
               //  Refund amount input (defaults to the collected amount, with validation preventing refunds higher than paid).
               //  Refund payment method selection (cash, upi, card).
               //  Refund reason dropdown (e.g., Customer Relocation, Dissatisfied with Service, Medical Issues, Other) + optional notes.
     
     // Clicking the "Issue Refund" button activates this RPC: process_membership_refund.
            

    // So what this RPC [process_membership_refund]do is It executes the entire refund operation inside one atomic database transaction (BEGIN ... COMMIT). If any part fails (e.g., refund exceeds paid amount, invalid payment method), everything is rolled back:
         
         // Validates that the membership is cancelled and has not already been refunded.
         // Updates the purchase record status to 'refunded'.
         // Records a new financial refund entry in the central ledger (business_transactions).
         // Reverses the refunded amount from the customer's lifetime spend (customers.total_spent).


    // WHICH TABLES DOES IT READ FROM

         // 1. membership_purchases (Read):

              //Reads the purchase record by purchase_id to verify:
              // Record exists and belongs to the active company/branch.
              // status = 'cancelled' and payment_status = 'paid'.
              // Fetches final_amount, customer_id, customer_name, and plan_name.
         
         // 2. business_transactions (Read):

              // Checks existing transaction entries for this purchase_id to ensure total refunds do not exceed the original payment.
         
         // 3. customers (Read):

              // Reads the customer's current total_spent for reversal.


    // WHICH TABLES DOES IT WRITE TO:

         // 1. membership_purchases (Write / Update):

              //status = 'refunded'
              //payment_status = 'refunded'
              //notes = Appends the refund reason and notes to the existing notes.
              //updated_at = NOW() (This immediately flips the row into State 4: Refunded + Refunded, displaying View + Info).


         // 2. business_transactions (Write / Insert):

            //Inserts a new refund ledger row:
            //reference_id = purchase_id
            //reference_type = 'membership'
            //amount = p_refund_amount
            //final_amount = p_refund_amount
            //currency = 'INR'
            //payment_method = p_payment_method ('cash', 'upi', or 'card')
            //status = 'refunded'
            //notes = p_refund_reason
            //created_by = p_staff_id
            //paid_at = NOW()


         // 3. customers (Write / Update):

            // Deducts the refunded amount from customer lifetime spend:
                // total_spent = GREATEST(0, COALESCE(total_spent, 0) - p_refund_amount)
            // updated_at = NOW()

// -----------------------------------------------------------------------------------------------------------------


//=================================================================================================================================
// PENDING PAYMENTS PAGE
//==================================================================================================================================

// Pending payments page reads from the table - bookings_for_business_transaction TABLE
// when clicked on collect it will trigger this [RPC Function] - (process_booking_payment_atomic) - Working function is described in the Bookings page.


//===========================================================================================================================================
//PAYMENTS HISTORY PAGE
//============================================================================================================================================

// we will use VIEW table - || payment_history_view ||

// How the View Works

      //Aggregates all 3 revenue sources:

         // Bookings (type: 'Service') from bookings_for_business_transaction

         // POS (type: 'Product') from sales_for_business_transactions (with array_to_string(product_names, ', '))

         // Memberships (type: 'Membership') from membership_purchases
      
         // Filters for settled states only: payment_status IN ('paid', 'refunded').

         // Joins with business_transactions: Gathers the central ledger payment ID, method, and timestamps where recorded, with seamless fallback to the source table so zero transactions are lost.

         // Grants permissions: Automatically grants SELECT to anon, authenticated, and service_role.

//================================================================================================================================================
//PAYMENTS HISTORY VIEW uses the TABLES below
//------------------------------------------------------------

// 1. bookings_for_business_transaction
// 2. sales_for_business_transactions
// 3. membership_purchases
// 4. business_transactions

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// DETAILED DATA MAPPING TO THE UI (11 COLUMNS)
// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | UI Column      | View Column (payment_history_view)   | Source 1: Bookings (Service)                                                             | Source 2: POS (Product)                                                                   | Source 3: Memberships (Membership)                                            |
// |----------------|--------------------------------------|----------------------------------------------------------------------------------------- |------------------------------------------------------------------------------------------ |-----------------------------------------------------------------------------  |
// | Date & Time    | paid_at                              | business_transactions.paid_at (fallback: bookings_for_business_transaction.updated_at)   | sales_for_business_transactions.created_at (or business_transactions.paid_at)             | membership_purchases.created_at (or business_transactions.paid_at)            |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Customer       | customer_name & customer_id          | bookings_for_business_transaction.customer_name & .customer_id                           | sales_for_business_transactions.customer_name & .customer_id                              | membership_purchases.customer_name & .customer_id                             |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Type           | type                                 | 'Service' (constant)                                                                     | 'Product' (constant)                                                                      | 'Membership' (constant)                                                       |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Item           | item_name                            | bookings_for_business_transaction.service_name                                           | sales_for_business_transactions.product_names (via array_to_string)                       | membership_purchases.plan_name                                                |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Amount         | original_amount                      | business_transactions.amount (or bookings_for_business_transaction.total_price)          | sales_for_business_transactions.total_price (or business_transactions.amount)             | membership_purchases.price (or business_transactions.amount)                  |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Discount       | discount_amount & discount_name      | bookings_for_business_transaction.discount_amount & .discount_name                       | sales_for_business_transactions.discount_amount & .discount_name                          | membership_purchases.discount_amount & .discount_name                         |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Final Amount   | final_amount                         | business_transactions.final_amount (or bookings_for_business_transaction.final_amount)   | sales_for_business_transactions.final_amount (or business_transactions.final_amount)      | membership_purchases.final_amount (or business_transactions.final_amount)     |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Method         | payment_method                       | business_transactions.payment_method                                                     | sales_for_business_transactions.payment_method (or business_transactions.payment_method)  | membership_purchases.payment_method (or business_transactions.payment_method) |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Staff          | staff_name                           | bookings_for_business_transaction.staff_name                                             | sales_for_business_transactions.staff_name                                                | membership_purchases.assigned_by_user_name                                    |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Status         | status                               | business_transactions.status (or bookings_for_business_transaction.payment_status)       | sales_for_business_transactions.payment_status (or business_transactions.status)          | membership_purchases.payment_status (or business_transactions.status)         |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
// | Actions        | payment_id / reference_id            | business_transactions.payment_id (or bookings_for_business_transaction.booking_id)       | sales_for_business_transactions.sale_id                                                   | membership_purchases.purchase_id                                              |
// |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|




// ==============================================================================================================================================================================================================================================================================================================================================================
// COUPONS PAGE
// ==============================================================================================================================================================================================================================================================================================================================================================

// All Direct Supabase queries only ... and it is only one table COUPONS that the frontend is reading and writing to.



// ========================================================================================================================================================================================
// OFFERS PAGE
// ===================================================================================================================================================================================================

// All Direct Supabase queries only ... and it is only one table OFFERS that the frontend is reading and writing to.


//=======================================================================================================================================================================================================
// EXPENSES PAGE
//=======================================================================================================================================================================================================

// Four Stat Cards and their trend indicators RPC FUNCTION - get_expenses_stat_cards

// Rest everything direct supabase and uses expenses table..

//===========================================================================================================================================================================================


//=================================================================================================================================================================
// DASHBOARD
//==================================================================================================================================================================================

// Stat cards four - RPC FUNCTION - dashboard_statcards_four.

// Today's revenue analytics - RPC FUNCTION - dashboard_todays_revenue_kpis.

 // Appointments Tab card - has 3 tabs - upcoming appointments, completed appointments, noshows& cancellations - Source Table = bookings_for_business_transaction .

 // Product sales today - direct supabase - source table = SALES Table .

 // Weekly Revenue (Bar Chart) -  RPC FUNCTION - dashboard_weekly_revenue .

 // Top Services This Week - RPC FUNCTION - dashboard_top_services   (Top Services This Week & Top Services Today)

 // Top Services Today - RPC FUNCTION - dashboard_top_services   (Top Services This Week & Top Services Today)


 //==============================================================================================================================================================================
 //
 //==============================================================================================================================================================================



















