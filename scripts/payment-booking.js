// ============================================================================
// DEPRECATED & RETIRED: scripts/payment-booking.js
// Status: Retired as part of Module 1 (Bookings) & Module 9 (Expenses & Financials)
// Reason: Booking payments are authoritatively settled via
//         the hardened atomic stored procedure `process_booking_payment_atomic`
//         (public.process_booking_payment_atomic). Direct client-side table
//         mutations (.from('business_transactions').insert, .from('bookings').update)
//         have been permanently eliminated.
// ============================================================================

console.warn('[RETIRED] scripts/payment-booking.js is deprecated. Use process_booking_payment_atomic.');
