// BACKEND INTEGRATION MAP
// ==================================================
// IMPORTANT PURPOSE
// ==================================================
// This map is documentation only. Features are added only after their integration has been audited, hardened, implemented, and validated.

// ==================================================
// CUSTOMERS PAGE
// ==================================================================================================================================================
// 1. Statcards - customers_page__four_statcards [RPC Function]  -  Source Table is Customers Table.
// 2. Customers Table - All the columns will get the data from the customers table directly.
//     a.Total Spent Updation - Bookings: current value in total spent + current booking value and then updates the total spent value in the customers table.
//     b.Total Spent Updation - Product sale: current value in total spent + current product sale value and then updates the total spent value in the customers table.
//     c.Total Spent Updation - Membership purchased : current value in total spent + current membership purchased value and then updates the total spent value in the customers table.
//          d.Last Visit Updation - Bookings: Booking status is completed then the last visit in the customers table will be updated with the timeztampz.
//          e.Last Visit Updation - Product sale: product sale is completed then the last visit in the customers table will be updated with the timeztampz.
//          f.Last visit Updation - Membership purchased: membership purchased is completed then the last visit in the customers table will be updated with the timeztampz.
//    g.Clickable Total Spent - customers_page_clickable_total_spent [RPC Function] - 3 Tables being used are (bookings_for_business_transaction), (sales_for_business_transactions),(membership_purchases).
// 3. StatCards TrendElements - customers_page__four_statcard_trendelements [RPC Function] - Source Table is Customers Table.