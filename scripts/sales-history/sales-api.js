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
        .eq('product_id', productId)
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

/**
 * Atomic POS refund RPC.
 * Executes in a single DB transaction:
 *   1. Increments product stock (stock_quantity + returned_qty)
 *   2. Inserts 1 new sales row per returned product (status = 'refunded')
 *   3. Inserts 1 consolidated summary row in sales_for_business_transactions (payment_status = 'refunded')
 *   4. DB trigger trg_pos_sale_business_transaction auto-writes business_transactions
 *
 * @param {Object} params
 * @param {string}   params.p_original_sale_id  - Parent sale UUID (the PAID sale being refunded against)
 * @param {string}   params.p_refund_sale_id    - New UUID generated for this refund transaction
 * @param {string}   params.p_company_id
 * @param {string}   params.p_branch_id
 * @param {string}   params.p_customer_id       - null for walk-ins
 * @param {string}   params.p_customer_name
 * @param {string}   params.p_customer_phone
 * @param {string}   params.p_payment_method    - 'cash' | 'card' | 'upi'
 * @param {string}   params.p_staff_id
 * @param {string}   params.p_staff_name
 * @param {string}   params.p_refund_reason
 * @param {Array}    params.p_items             - [{ item_id, product_id, product_name, category_id, return_qty, price }]
 */
export async function executePosRefundAtomic(params) {
    return await supabase.rpc('process_pos_refund_atomic', params);
}

// ─── Legacy helpers (kept for backward-compat; no longer called by processRefund) ───

/** @deprecated Use executePosRefundAtomic instead */
export function buildSaleItemUpdatePromise(itemId, updatePayload) {
    return supabase
        .from('sales')
        .update(updatePayload)
        .eq('id', itemId);
}

/** @deprecated Use executePosRefundAtomic instead */
export function buildProductStockUpdatePromise(productId, newStock) {
    return supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('product_id', productId);
}

/** @deprecated Use executePosRefundAtomic instead */
export async function insertRefundLedger(ledgerRows) {
    return await supabase
        .from('business_transactions')
        .insert(ledgerRows);
}
