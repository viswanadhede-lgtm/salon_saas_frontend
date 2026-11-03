# BHARATHBOTS — SALON SAAS
# Module 2: POS (Point of Sale) — Stage 2: Architecture Specification & Detailed Logic Notes

**Document Version**: 1.0.0  
**Date**: November 3, 2026  
**Status**: **PROPOSED — PENDING USER APPROVAL**  
**Target Environment**: Supabase PostgreSQL 17 (`qxmgyxjwpxkdbgldpdil`, region `ap-south-1`)  
**Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First Execution  

---

## 1. Overview & Core Objectives

The **POS (Point of Sale)** module governs all counter-top retail sales of physical products (e.g., hair care products, shampoos, styling gels, accessories) and their post-sale lifecycle (returns, inventory adjustments, and financial ledger accounting).

### Primary Security & Architectural Objectives
1. **Zero-Trust Frontend**: Eliminate client-side price and discount authority. The server must look up product prices directly from `app.products` and validate coupon/offer rules against `app.coupons` and `app.offers`.
2. **Strict Multi-Tenant Isolation**: Every checkout and return must invoke `shared.verify_tenant_access(p_company_id, p_branch_id)` and verify that all products and customers belong to the authorized tenant branch.
3. **Deadlock-Free Concurrency & Inventory Integrity**: Ensure concurrent counter sales lock product inventory in deterministic order (`ORDER BY product_id FOR UPDATE`) to eliminate race conditions and overselling.
4. **Authoritative Financial Reconciliation**: Ensure every sale and refund consistently and atomically updates:
   - Line items: `app.sales`
   - Transaction headers: `app.sales_for_business_transactions`
   - Central financial ledger: `app.business_transactions`
   - Inventory: `app.products.stock_quantity`
   - Promotion logs: `app.discount_usages`
   - Customer LTV: `app.customers.total_spent` and `last_visit`

---

## 2. Granular Specification for All 18 Logics

### Unit 1: POS Checkout & Inventory Deduction (Logics 1–11)

#### Logic 1: Multi-Tenant Authorization & Boundary Verification
- **Vulnerability Solved**: Previously, `create_pos_sale_atomic` accepted `p_company_id` and `p_branch_id` without validating caller privileges, allowing cross-tenant writes.
- **Specification**:
  - The routine calls `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - Asserts that `p_company_id` and `p_branch_id` are NOT NULL and valid UUIDs.
  - Aborts with `'FORBIDDEN: Caller is not authorized for target tenant branch'` if verification fails.

#### Logic 2: Cart Non-Empty & Input Sanitization Guard
- **Specification**:
  - Validates `p_items` is a non-empty JSONB array (`jsonb_array_length(p_items) > 0`).
  - Standardizes `p_payment_method` to lowercase; restricts to `('cash', 'card', 'upi')` (defaulting to `'cash'`).
  - Validates `p_sale_id` is a non-null UUID.

#### Logic 3: Authoritative Product Catalog Price Lookup (Anti-Tampering)
- **Vulnerability Solved**: CRITICAL. Previous implementation used `v_item_price := COALESCE(v_item.price, 0)` from the client's payload. An attacker could edit the browser JS cart to purchase a ₹2,000 product for ₹1.
- **Specification**:
  - Client-submitted `item.price` is **completely ignored**.
  - For each product in `p_items`, the procedure queries `app.products.price` where `product_id = v_prod_id AND company_id = p_company_id AND branch_id = p_branch_id`.
  - Authoritative line total is computed as: `v_item_total := v_item_qty * v_catalog_price`.
  - Authoritative gross sale total is computed as: `v_total_price := SUM(v_item_qty * v_catalog_price)`.

#### Logic 4: Product Active Status & Branch Assignment Validation
- **Specification**:
  - Checks `COALESCE(LOWER(TRIM(p.status)), 'active') = 'active'`.
  - If a product is inactive or discontinued, raises exception: `'Product "[Name]" is inactive and cannot be sold'`.
  - Verifies `p.company_id = p_company_id` and `p.branch_id = p_branch_id`. If product belongs to a different branch/tenant, raises `'Product not found in this branch'`.

#### Logic 5: Deterministic Row-Level Concurrency Locking (`FOR UPDATE`)
- **Specification**:
  - To prevent database deadlocks when two cashiers checkout the same products simultaneously in different orders:
  - Aggregate any duplicate cart line items by `product_id` (summing requested quantities).
  - Lock all matching product rows in deterministic ascending order:
    ```sql
    PERFORM product_id FROM app.products 
    WHERE product_id = ANY(v_cart_product_ids) AND company_id = p_company_id 
    ORDER BY product_id FOR UPDATE;
    ```

#### Logic 6: Negative Stock Prevention Guard
- **Specification**:
  - Evaluates locked stock: `IF v_current_stock < v_required_qty THEN ...`
  - Rejects the checkout atomically with:
    `'Insufficient stock for "[Product Name]": requested %, available %'`.
  - Calculates `v_remaining_stock := v_current_stock - v_required_qty`.
  - Decrements stock: `UPDATE app.products SET stock_quantity = v_remaining_stock, updated_at = NOW() WHERE product_id = ...`.

#### Logic 7: Multi-Item Line Item Insertion (`app.sales`)
- **Specification**:
  - For each item, inserts a line row into `app.sales` with:
    - `sale_id = p_sale_id`
    - `company_id = p_company_id`, `branch_id = p_branch_id`
    - `product_id = v_prod_id`, `product_name = v_product_name`
    - `category_id = v_category_id`, `category_name = v_category_name`
    - `customer_id = v_customer_id`, `customer_name = v_customer_name`, `customer_phone = v_customer_phone`
    - `quantity = v_qty`, `price = v_catalog_price`, `total_amount = v_item_total`
    - `payment_method = p_payment_method`, `status = 'paid'`, `staff_name = p_staff_name`

#### Logic 8: Consolidated Header Row Insertion (`app.sales_for_business_transactions`)
- **Specification**:
  - Inserts 1 header summary row for the sale with:
    - `sale_id = p_sale_id`
    - `product_ids = v_product_ids_array`, `product_names = v_product_names_array`
    - `category_ids = v_category_ids_array`, `category_names = v_category_names_array`
    - `total_quantity = v_total_qty`, `total_price = v_total_gross_price`
    - `discount_type = v_valid_discount_type`, `discount_name = v_valid_discount_name`
    - `discount_amount = v_authoritative_discount_amount`
    - `final_amount = v_authoritative_final_amount`
    - `payment_status = 'paid'`, `payment_method = p_payment_method`

#### Logic 9: Financial Ledger Synchronization (`app.business_transactions`)
- **Specification**:
  - Synchronizes with `app.business_transactions` via trigger `trg_create_pos_business_transaction` (hardened).
  - Populates: `reference_id = p_sale_id`, `reference_type = 'product'`, `amount = v_authoritative_final_amount`, `final_amount = v_authoritative_final_amount`, `discount_type = v_valid_discount_type`, `discount_name = v_valid_discount_name`, `discount_amount = v_authoritative_discount_amount`, `status = 'paid'`, `paid_at = NOW()`.

#### Logic 10: Authoritative Server-Side Coupon & Offer Validation
- **Vulnerability Solved**: CRITICAL. Previous code trusted `p_discount_amount` computed in browser JS.
- **Specification**:
  - If `p_discount_type = 'coupon'`:
    - Queries `app.coupons` by `coupon_code = p_discount_name AND company_id = p_company_id AND status = 'active'`.
    - Asserts `CURRENT_DATE BETWEEN COALESCE(valid_from, CURRENT_DATE) AND COALESCE(valid_to, CURRENT_DATE)`.
    - Asserts `v_total_price >= COALESCE(min_bill_amount, 0)`.
    - If `total_usage_limit` is set: checks `SELECT COUNT(*) FROM app.discount_usages WHERE discount_id = v_coupon.coupon_id` is less than limit.
    - If `usage_per_customer` is set and `v_customer_id` is provided: checks customer usage count.
    - Authoritatively calculates discount:
      - `percentage`: `v_authoritative_discount := ROUND((v_total_price * v_coupon.discount_value) / 100, 2)`
      - `flat`: `v_authoritative_discount := LEAST(v_coupon.discount_value, v_total_price)`
  - If `p_discount_type = 'offer'`:
    - Queries `app.offers` by `offer_id = p_discount_id` or `offer_name = p_discount_name`.
    - Re-validates active date range and minimum spend.
    - Computes authoritative discount.
  - If `p_discount_type = 'manual'`:
    - Caps manual discount at `v_total_price` (cannot exceed 100%).
  - Authoritative final amount:
    `v_authoritative_final_amount := GREATEST(0, v_total_price - v_authoritative_discount)`.

#### Logic 11: Discount Usage Logging (`app.discount_usages`)
- **Specification**:
  - If `v_authoritative_discount > 0`:
    - Inserts audit record into `app.discount_usages`:
      - `company_id = p_company_id`, `branch_id = p_branch_id`, `customer_id = v_customer_id`
      - `reference_type = 'pos'`, `reference_id = p_sale_id`
      - `discount_type = v_valid_discount_type`, `discount_id = v_discount_id`, `discount_name = v_valid_discount_name`
      - `discount_amount = v_authoritative_discount`, `status = 'applied'`, `used_at = NOW()`

---

### Unit 2: POS Refunds, Stock Re-increments & Ledger Reversals (Logics 12–17)

#### Logic 12: Original Sale Verification & Multi-Tenant Boundary Guard
- **Specification**:
  - Routine calls `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - Locks original sale header in `app.sales_for_business_transactions WHERE sale_id = p_original_sale_id AND refund_reference_id IS NULL FOR UPDATE`.
  - Asserts original sale belongs to `p_company_id` and `p_branch_id`.
  - Asserts original sale status is `'paid'`.

#### Logic 13: Refund Reference Deduplication Guard
- **Specification**:
  - Validates `p_refund_sale_id` is a valid, unique UUID.
  - Asserts `NOT EXISTS (SELECT 1 FROM app.sales WHERE refund_reference_id = p_refund_sale_id)` and `NOT EXISTS (SELECT 1 FROM app.sales_for_business_transactions WHERE refund_reference_id = p_refund_sale_id)`.
  - Aborts if reference has already been executed.

#### Logic 14: Per-Item Refundable Quantity Guard
- **Specification**:
  - For each returned item in `p_items`:
    - Locks original sale item row in `app.sales WHERE id = v_item_id FOR UPDATE`.
    - Computes:
      `v_already_refunded_qty := COALESCE((SELECT SUM(quantity) FROM app.sales WHERE sale_id = p_original_sale_id AND product_id = v_original_item.product_id AND status = 'refunded'), 0)`.
      `v_max_refundable := v_original_item.quantity - v_already_refunded_qty`.
    - If `v_return_qty > v_max_refundable`: raises exception `'Cannot return % units of %; only % units remaining refundable'`.

#### Logic 15: Concurrency-Safe Stock Re-Increment on Return
- **Specification**:
  - Locks product row: `SELECT stock_quantity FROM app.products WHERE product_id = v_original_item.product_id FOR UPDATE`.
  - Restores inventory:
    `UPDATE app.products SET stock_quantity = stock_quantity + v_return_qty, updated_at = NOW() WHERE product_id = v_original_item.product_id`.

#### Logic 16: Price-Weighted Proportional Discount Reversal Math
- **Specification**:
  - When returning a subset of items from a discounted order, discount reversal must be proportional to the value returned:
    `v_discount_to_reverse := ROUND((v_total_returned_gross / v_orig_gross_total) * v_orig_discount, 2)`.
  - Caps reversal so total cumulative reversed discount does not exceed original discount.
  - Net refund payable to customer:
    `v_final_refund_payable := GREATEST(0, v_total_returned_gross - v_discount_to_reverse)`.

#### Logic 17: Refund Financial Ledger & Discount Usage State Reversal
- **Specification**:
  - Inserts refunded line item rows into `app.sales` with `status = 'refunded'`, `refund_reference_id = p_refund_sale_id`, `quantity = v_return_qty`, `total_amount = v_line_return_gross`.
  - Inserts consolidated refund summary into `app.sales_for_business_transactions` with `payment_status = 'refunded'`, `refund_reference_id = p_refund_sale_id`, `total_price = v_total_returned_gross`, `discount_amount = v_discount_to_reverse`, `final_amount = v_final_refund_payable`.
  - Trigger `trg_create_pos_business_transaction` records refund ledger entry in `app.business_transactions` (`status = 'refunded'`, `amount = v_final_refund_payable`).
  - Updates `app.discount_usages`:
    - `reversal_amount = reversal_amount + v_discount_to_reverse`
    - `status = CASE WHEN (reversal_amount >= discount_amount) THEN 'reversed' ELSE 'partially_reversed' END`
    - `reversed_at = NOW()`, `reversal_reason = p_refund_reason`.

---

### Workflow C: Maintenance & Customer Tracking (Logic 18)

#### Logic 18: POS Customer Lifetime Value (LTV) Updates
- **Specification**:
  - On **Sale Completion**: If `p_customer_id` is provided, atomically update `app.customers`:
    ```sql
    UPDATE app.customers
    SET total_spent = COALESCE(total_spent, 0) + v_authoritative_final_amount,
        last_visit = CURRENT_DATE,
        updated_at = NOW()
    WHERE customer_id = p_customer_id AND company_id = p_company_id;
    ```
  - On **Refund Completion**: If `v_customer_id` is provided, reverse customer lifetime spend:
    ```sql
    UPDATE app.customers
    SET total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_final_refund_payable),
        updated_at = NOW()
    WHERE customer_id = v_customer_id AND company_id = p_company_id;
    ```

---

## 3. Database Implementation Plan (Stage 3 Preview)

All changes will be packaged into migration file:  
`supabase/migrations/20261103000007_harden_pos_module.sql`

### Structure of Migration:
1. **Drop old public functions** with signature cleanup:
   - `DROP FUNCTION IF EXISTS public.create_pos_sale_atomic;`
   - `DROP FUNCTION IF EXISTS public.process_pos_refund_atomic;`
2. **Deploy `app.create_pos_sale_atomic`**:
   - Schema: `app`
   - Security: `SECURITY DEFINER`
   - Config: `SET search_path = platform, shared, app, public, pg_temp;`
   - Returns: `jsonb` with `success`, `sale_id`, `total_price`, `final_amount`, `discount_amount`, `deducted_items`
3. **Deploy PostgREST wrapper `public.create_pos_sale_atomic`**:
   - Calls `app.create_pos_sale_atomic` directly with identical arguments.
4. **Deploy `app.process_pos_refund_atomic`**:
   - Schema: `app`
   - Security: `SECURITY DEFINER`
   - Config: `SET search_path = platform, shared, app, public, pg_temp;`
   - Returns: `jsonb` with `success`, `original_sale_id`, `refund_reference_id`, `gross_returned`, `discount_reversed`, `total_refunded`
5. **Deploy PostgREST wrapper `public.process_pos_refund_atomic`**:
   - Calls `app.process_pos_refund_atomic` directly with identical arguments.
6. **Harden Trigger `app.trg_pos_sale_business_transaction`**:
   - Ensures `discount_type`, `discount_name`, `discount_amount`, and `final_amount` are mirrored into `app.business_transactions`.

---

## 4. Test & Verification Plan (Stage 4 Preview)

The following integration test suite will be executed against Supabase PostgreSQL:

| Test ID | Scenario | Expected Result |
|---|---|---|
| **TEST-POS-01** | **Price Tampering Attack**: Submit ₹10 in cart for ₹500 product | **Blocked / Overridden**: Sale succeeds with ₹500 from catalog; ₹10 is ignored |
| **TEST-POS-02** | **Negative Stock Guard**: Order 10 units when stock is 2 | **Blocked**: Exception `'Insufficient stock'` raised; no rows inserted |
| **TEST-POS-03** | **Concurrency & Stock Decrement**: Order 2 units when stock is 10 | **Verified**: Stock decrements to exactly 8; row locked with `FOR UPDATE` |
| **TEST-POS-04** | **Server Coupon Validation**: Submit invalid coupon code `FAKE99` | **Blocked**: Exception `'Invalid or inactive coupon code'` raised |
| **TEST-POS-05** | **Authoritative Percentage Coupon**: Apply 10% coupon on ₹1,000 cart | **Verified**: `discount_amount = 100`, `final_amount = 900` authoritatively calculated |
| **TEST-POS-06** | **3-Table Ledger Consistency**: Verify sale completion | **Verified**: Rows in `sales`, `sales_for_business_transactions`, and `business_transactions` match exactly |
| **TEST-POS-07** | **Partial Refund & Stock Restoration**: Return 1 of 2 purchased units | **Verified**: Product stock increases by 1; refund row logged; status is `refunded` |
| **TEST-POS-08** | **Excess Refund Guard**: Try to return 3 units when only 2 were bought | **Blocked**: Exception `'Cannot return % units'` raised |
| **TEST-POS-09** | **Proportional Discount Reversal**: Return 50% of items on a discounted sale | **Verified**: Exactly 50% of discount is reversed; net payout is calculated accurately |
| **TEST-POS-10** | **Duplicate Refund Reference**: Re-submit same `p_refund_sale_id` | **Blocked**: Exception `'This refund reference has already been used'` raised |
| **TEST-POS-11** | **Customer Spend Sync & Reversal**: Check customer `total_spent` | **Verified**: `total_spent` increases on sale and decreases on refund |

---

## 5. Review & Approval Checkpoint

Please review this specification for **Module 2: POS**. Once you approve:
1. We will generate migration `20261103000007_harden_pos_module.sql`.
2. Deploy both routines to Supabase PostgreSQL.
3. Run the automated integration test suite to verify all 18 logics.
4. Clean up orphaned dead code (`scripts/payment-pos.js`) and deliver the Stage 5 audit report.

