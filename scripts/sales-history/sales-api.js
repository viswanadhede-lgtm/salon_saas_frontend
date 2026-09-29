// scripts/sales-history/sales-api.js

import { supabase } from '../../lib/supabase.js';

/**
 * Data Access Layer for Sales History.
 * Preserves exact Supabase queries, mutations, tables, and constraints.
 */

// ─────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────

export async function fetchSalesHistoryFromDb(companyId, branchId) {
    return await supabase
        .from('sales_for_business_transactions')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
}

export async function fetchCustomerById(customerId) {
    return await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
}

export async function fetchOriginalTransaction(saleId) {
    return await supabase
        .from('business_transactions')
        .select('id, payment_method')
        .eq('reference_id', saleId)
        .order('paid_at', { ascending: true })
        .limit(1);
}

export async function fetchSaleLineItems(saleId) {
    return await supabase
        .from('sales')
        .select('*')
        .eq('sale_id', saleId);
}

export async function fetchSaleLineItemsOrdered(saleId) {
    return await supabase
        .from('sales')
        .select('*')
        .eq('sale_id', saleId)
        .order('id', { ascending: true });
}

export async function fetchProductStock(productId) {
    return await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();
}

// ─────────────────────────────────────────────────────────────
// WRITES
// ─────────────────────────────────────────────────────────────

export async function insertProductPayment(txnData) {
    return await supabase
        .from('business_transactions')
        .insert(txnData);
}

export function buildSaleItemUpdatePromise(itemId, updatePayload) {
    return supabase
        .from('sales')
        .update(updatePayload)
        .eq('id', itemId);
}

export function buildProductStockUpdatePromise(productId, newStock) {
    return supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', productId);
}

export async function insertRefundLedger(ledgerRows) {
    return await supabase
        .from('business_transactions')
        .insert(ledgerRows);
}
