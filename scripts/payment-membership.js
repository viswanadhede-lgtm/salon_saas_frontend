// ============================================================================
// DEPRECATED & RETIRED: scripts/payment-membership.js
// Status: Retired as part of Module 3 (Memberships) Zero-Trust Migration
// Reason: Membership enrollments are authoritatively executed via
//         memberships-assign-modal.js calling the hardened atomic stored
//         procedure `assign_membership_atomic` (public.assign_membership_atomic).
//         Direct client-side table mutations (.from('membership_purchases').insert,
//         .from('customers').insert, and .from('business_transactions').insert)
//         have been permanently eliminated.
// ============================================================================

console.warn('[RETIRED] scripts/payment-membership.js is deprecated. Use memberships-assign-modal.js with assign_membership_atomic.');
