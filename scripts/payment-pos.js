// ============================================================================
// DEPRECATED & RETIRED: scripts/payment-pos.js
// Status: Retired as part of Module 2 (POS) Backend-First Migration
// Reason: POS checkouts are authoritatively executed via pos.js calling
//         the hardened atomic stored procedure `create_pos_sale_atomic`.
//         Direct client-side table mutations (.from('sales').insert,
//         .from('sales_for_business_transactions').insert, and
//         .from('business_transactions').insert) have been eliminated.
// ============================================================================

console.warn('[RETIRED] scripts/payment-pos.js is deprecated. Use pos.js with create_pos_sale_atomic.');
