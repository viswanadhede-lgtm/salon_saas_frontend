// scripts/memberships/memberships-api.js
// Hardened Module 3: All mutations routed through Authoritative Atomic RPCs.
// Zero direct table mutations on transactional tables.

import { supabase } from '../../lib/supabase.js';

// ── Customers (Read-Only) ──────────────────────────────────────────────────
export async function fetchCustomersApi(companyId, branchId) {
    return await supabase
        .from('customers')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId);
}

export async function fetchCustomerByIdApi(customerId) {
    return await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
}

// ── Services (Read-Only) ───────────────────────────────────────────────────
export async function fetchServicesApi(companyId, branchId) {
    return await supabase
        .from('services')
        .select('service_id, service_name, status')
        .eq('company_id', companyId)
        .eq('branch_id', branchId);
}

// ── Plans (Read-Only) ──────────────────────────────────────────────────────
export async function fetchPlansAndMemberCountsApi(companyId, branchId) {
    return await Promise.all([
        supabase
            .from('memberships')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false }),
        supabase
            .from('membership_purchases')
            .select('membership_id')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('status', 'active')   // ← count active members only
    ]);
}

// ── Plan Management via Stored Procedures ─────────────────────────────────
export async function createMembershipPlanRpcApi(rpcPayload) {
    return await supabase.rpc('create_membership_plan', rpcPayload);
}

export async function updateMembershipPlanRpcApi(rpcPayload) {
    return await supabase.rpc('update_membership_plan', rpcPayload);
}

export async function deleteMembershipPlanRpcApi(rpcPayload) {
    return await supabase.rpc('delete_membership_plan', rpcPayload);
}

// ── Purchases (Read-Only) ──────────────────────────────────────────────────
export async function fetchPurchasesApi(companyId, branchId) {
    return await supabase
        .from('membership_purchases')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .order('purchase_date', { ascending: false });
}

export async function checkDuplicateActivePurchaseApi(customerId, membershipId, companyId, branchId) {
    let dupQuery = supabase
        .from('membership_purchases')
        .select('*')
        .eq('customer_id', customerId)
        .eq('membership_id', membershipId)
        .eq('status', 'active');

    if (companyId) dupQuery = dupQuery.eq('company_id', companyId);
    if (branchId) dupQuery = dupQuery.eq('branch_id', branchId);

    return await dupQuery;
}

export async function fetchPurchaseByIdApi(purchaseId) {
    const res = await supabase
        .from('membership_purchases')
        .select('*')
        .eq('purchase_id', purchaseId)
        .limit(1);

    if (res.error) {
        return await supabase
            .from('membership_purchases')
            .select('*')
            .eq('id', purchaseId)
            .limit(1);
    }
    return res;
}

// ── Memberships Transactional RPCs ─────────────────────────────────────────
export async function assignMembershipRpcApi(rpcPayload) {
    return await supabase.rpc('assign_membership_atomic', rpcPayload);
}

export async function cancelMembershipRpcApi(rpcPayload) {
    return await supabase.rpc('cancel_membership_atomic', rpcPayload);
}

export async function processMembershipRefundRpcApi(rpcPayload) {
    return await supabase.rpc('process_membership_refund_atomic', rpcPayload);
}

export async function syncExpiredMembershipsRpcApi(companyId, branchId) {
    return await supabase.rpc('sync_expired_memberships', {
        p_company_id: companyId,
        p_branch_id: branchId
    });
}

// ── Business Transactions Ledger (Read-Only) ───────────────────────────────
export async function fetchTransactionsForPurchaseApi(purchaseId) {
    return await supabase
        .from('business_transactions')
        .select('*')
        .eq('reference_id', purchaseId)
        .eq('reference_type', 'membership');
}

export async function fetchTransactionsSummaryForPurchaseApi(purchaseId) {
    return await supabase
        .from('business_transactions')
        .select('amount, status, created_at, paid_at, notes')
        .eq('reference_id', purchaseId)
        .eq('reference_type', 'membership')
        .order('created_at', { ascending: false });
}
