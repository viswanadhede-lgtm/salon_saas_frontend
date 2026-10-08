// scripts/memberships/memberships-api.js
import { supabase } from '../../lib/supabase.js';

// ── Customers ──────────────────────────────────────────────────────────────
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

export async function createCustomerApi(customerPayload) {
    return await supabase
        .from('customers')
        .insert(customerPayload)
        .select();
}

// ── Services ───────────────────────────────────────────────────────────────
export async function fetchServicesApi(companyId, branchId) {
    return await supabase
        .from('services')
        .select('service_id, service_name, status')
        .eq('company_id', companyId)
        .eq('branch_id', branchId);
}

// ── Plans ──────────────────────────────────────────────────────────────────
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
    ]);
}

export async function deletePlanRowsApi(planId) {
    return await supabase
        .from('memberships')
        .eq('membership_id', planId)
        .delete();
}

export async function insertPlanRowsApi(rowsToInsert) {
    return await supabase
        .from('memberships')
        .insert(rowsToInsert);
}

export async function softDeletePlanApi(planId) {
    return await supabase
        .from('memberships')
        .eq('membership_id', planId)
        .update({ status: 'deleted' });
}

// ── Purchases ──────────────────────────────────────────────────────────────
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

export async function insertMembershipPurchaseApi(purchasePayload) {
    return await supabase
        .from('membership_purchases')
        .insert(purchasePayload);
}

export async function cancelMembershipPurchaseApi(purchaseId, notes, cancelledDate) {
    const res = await supabase
        .from('membership_purchases')
        .eq('purchase_id', purchaseId)
        .update({ status: 'cancelled', notes: notes, cancelled_date: cancelledDate });

    if (res.error) {
        // fallback if pk is id
        return await supabase
            .from('membership_purchases')
            .eq('id', purchaseId)
            .update({ status: 'cancelled', notes: notes, cancelled_date: cancelledDate });
    }
    return res;
}

export async function updatePurchaseRefundStatusApi(purchaseId, updateData) {
    return await supabase
        .from('membership_purchases')
        .update(updateData)
        .eq('purchase_id', purchaseId);
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

// ── Business Transactions (Ledger) ─────────────────────────────────────────
export async function insertCancellationLedgerApi(ledgerPayload) {
    return await supabase
        .from('business_transactions')
        .insert([ledgerPayload]);
}

export async function fetchTransactionsForPurchaseApi(purchaseId) {
    return await supabase
        .from('business_transactions')
        .select('*')
        .eq('reference_id', purchaseId)
        .eq('reference_type', 'membership');
}

export async function insertRefundTransactionApi(refundPayload) {
    return await supabase
        .from('business_transactions')
        .insert(refundPayload);
}

export async function fetchTransactionsSummaryForPurchaseApi(purchaseId) {
    return await supabase
        .from('business_transactions')
        .select('amount, status, created_at, paid_at, notes')
        .eq('reference_id', purchaseId)
        .eq('reference_type', 'membership')
        .order('created_at', { ascending: false });
}
