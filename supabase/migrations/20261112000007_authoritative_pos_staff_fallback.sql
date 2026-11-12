-- Migration: 20261112000007_authoritative_pos_staff_fallback.sql
-- Description: Adds authoritative backend fallback for staff_id (auth.uid()) and staff_name (shared.users/app.staff lookup)
-- to both create_pos_sale_atomic and process_pos_refund_atomic.
-- This guarantees staff_id and staff_name are ALWAYS recorded in all 3 tables:
--   1. app.sales (staff_id, staff_name)
--   2. app.sales_for_business_transactions (staff_id, staff_name)
--   3. app.business_transactions (created_by, created_by_user_name)
-- even if the frontend passes null or 'System'.

-- ============================================================================
-- 1. Ensure staff_id column exists on app.sales
-- ============================================================================
ALTER TABLE app.sales ADD COLUMN IF NOT EXISTS staff_id uuid;

-- ============================================================================
-- 2. Update app.create_pos_sale_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION app.create_pos_sale_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_sale_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT 'Walk-in Customer'::text,
    p_customer_phone text DEFAULT ''::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_staff_id uuid DEFAULT NULL::uuid,
    p_staff_name text DEFAULT 'System'::text,
    p_items jsonb DEFAULT '[]'::jsonb,
    p_discount_type text DEFAULT NULL::text,
    p_discount_name text DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount numeric DEFAULT 0,
    p_discount_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Tenant & Input Verification
    v_item jsonb;
    v_prod_id uuid;
    v_req_qty bigint;
    v_prod_rec record;
    
    -- Cart Aggregates
    v_total_price numeric := 0;
    v_total_quantity bigint := 0;
    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_product_names text[] := ARRAY[]::text[];
    v_category_ids uuid[] := ARRAY[]::uuid[];
    v_category_names text[] := ARRAY[]::text[];
    v_deducted_items jsonb := '[]'::jsonb;
    
    -- Item Processing
    v_catalog_price numeric;
    v_item_total numeric;
    v_current_stock bigint;
    v_new_stock bigint;

    -- Authoritative Discount Verification
    v_discount_type text;
    v_discount_name text;
    v_discount_id uuid := p_discount_id;
    v_authoritative_discount numeric := 0;
    v_final_amount numeric := 0;
    v_coupon_rec record;
    v_offer_rec record;
    v_mem_rec record;
    v_coupon_usage_count bigint := 0;
    v_cust_usage_count bigint := 0;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATES ─────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'pos_checkout');
    PERFORM shared.check_plan_feature(p_company_id, 'pos_system');

    -- ── AUTHORITATIVE STAFF RESOLUTION ────────────────────────────────────────
    IF p_staff_id IS NULL THEN
        p_staff_id := auth.uid();
    END IF;

    IF (p_staff_name IS NULL OR TRIM(p_staff_name) = '' OR LOWER(TRIM(p_staff_name)) = 'system') AND p_staff_id IS NOT NULL THEN
        SELECT name INTO p_staff_name FROM shared.users WHERE user_id = p_staff_id;
        IF p_staff_name IS NULL THEN
            SELECT staff_name INTO p_staff_name FROM app.staff WHERE staff_id = p_staff_id;
        END IF;
        IF p_staff_name IS NULL THEN
            p_staff_name := 'System';
        END IF;
    END IF;

    -- ── 1. Basic Validation & Input Sanitization ──────────────────────────────
    IF p_sale_id IS NULL THEN
        RAISE EXCEPTION 'Sale ID is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart cannot be empty for POS sale';
    END IF;

    p_payment_method := LOWER(COALESCE(TRIM(p_payment_method), 'cash'));
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        p_payment_method := 'cash';
    END IF;

    -- ── 2. Lock all matching products in deterministic order ───────────────────
    PERFORM product_id 
    FROM app.products
    WHERE product_id IN (
        SELECT DISTINCT (value->>'product_id')::uuid 
        FROM jsonb_array_elements(p_items)
        WHERE (value->>'product_id') IS NOT NULL
    )
    AND company_id = p_company_id
    ORDER BY product_id
    FOR UPDATE;

    -- ── 3. Process each item: Catalog lookup, check active & stock ─────────────
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_req_qty := GREATEST(1, COALESCE((v_item->>'quantity')::bigint, 1));

        IF v_prod_id IS NULL THEN
            RAISE EXCEPTION 'Every cart item must specify a valid product_id';
        END IF;

        -- Authoritative Product Lookup
        SELECT product_id, product_name, price, stock_quantity, status, category_id, category_name
        INTO v_prod_rec
        FROM app.products
        WHERE product_id = v_prod_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id);

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in authorized company/branch', v_prod_id;
        END IF;

        IF COALESCE(LOWER(TRIM(v_prod_rec.status)), 'active') <> 'active' THEN
            RAISE EXCEPTION 'Product "%" is inactive and cannot be sold', v_prod_rec.product_name;
        END IF;

        v_current_stock := COALESCE(v_prod_rec.stock_quantity, 0);

        IF v_current_stock < v_req_qty THEN
            RAISE EXCEPTION 'Insufficient stock for "%": requested %, available %', 
                v_prod_rec.product_name, v_req_qty, v_current_stock;
        END IF;

        -- Deduct inventory
        v_new_stock := v_current_stock - v_req_qty;
        UPDATE app.products
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE product_id = v_prod_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id);

        -- Record deduction info for alerts
        v_deducted_items := v_deducted_items || jsonb_build_object(
            'product_id', v_prod_id,
            'product_name', v_prod_rec.product_name,
            'remaining_stock', v_new_stock
        );

        -- Authoritative Catalog Pricing
        v_catalog_price := COALESCE(v_prod_rec.price, 0);
        v_item_total := v_req_qty * v_catalog_price;

        -- ── Table 1: Insert line item into app.sales (1 row per product) ──────
        INSERT INTO app.sales (
            sale_id,
            company_id,
            branch_id,
            product_id,
            product_name,
            category_id,
            category_name,
            customer_id,
            customer_name,
            customer_phone,
            quantity,
            price,
            total_amount,
            payment_method,
            status,
            staff_id,
            staff_name,
            created_at,
            updated_at
        ) VALUES (
            p_sale_id,
            p_company_id,
            p_branch_id,
            v_prod_id,
            v_prod_rec.product_name,
            v_prod_rec.category_id,
            v_prod_rec.category_name,
            p_customer_id,
            p_customer_name,
            p_customer_phone,
            v_req_qty,
            v_catalog_price,
            v_item_total,
            p_payment_method,
            'paid',
            p_staff_id,
            p_staff_name,
            NOW(),
            NOW()
        );

        -- Accumulate totals
        v_total_price := v_total_price + v_item_total;
        v_total_quantity := v_total_quantity + v_req_qty;

        v_product_ids := array_append(v_product_ids, v_prod_id);
        v_product_names := array_append(v_product_names, v_prod_rec.product_name);
        IF v_prod_rec.category_id IS NOT NULL THEN
            v_category_ids := array_append(v_category_ids, v_prod_rec.category_id);
        END IF;
        IF v_prod_rec.category_name IS NOT NULL THEN
            v_category_names := array_append(v_category_names, v_prod_rec.category_name);
        END IF;
    END LOOP;

    -- ── 4. Authoritative Server-Side Coupon / Discount Validation ─────────────
    v_discount_type := LOWER(COALESCE(TRIM(p_discount_type), ''));
    v_discount_name := TRIM(COALESCE(p_discount_name, ''));

    IF v_discount_type = 'coupon' AND v_discount_name <> '' THEN
        SELECT coupon_id, discount_type, discount_value, min_bill_amount, valid_from, valid_to, status, total_usage_limit, usage_per_customer
        INTO v_coupon_rec
        FROM app.coupons
        WHERE coupon_code = v_discount_name
          AND company_id = p_company_id
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or nonexistent coupon code: %', v_discount_name;
        END IF;

        IF LOWER(COALESCE(v_coupon_rec.status, 'active')) <> 'active' THEN
            RAISE EXCEPTION 'Coupon code % is inactive', v_discount_name;
        END IF;

        IF v_coupon_rec.valid_from IS NOT NULL AND CURRENT_DATE < v_coupon_rec.valid_from THEN
            RAISE EXCEPTION 'Coupon code % is not yet active', v_discount_name;
        END IF;

        IF v_coupon_rec.valid_to IS NOT NULL AND CURRENT_DATE > v_coupon_rec.valid_to THEN
            RAISE EXCEPTION 'Coupon code % has expired', v_discount_name;
        END IF;

        IF v_coupon_rec.min_bill_amount IS NOT NULL AND v_total_price < v_coupon_rec.min_bill_amount THEN
            RAISE EXCEPTION 'Bill total % is below minimum spend requirement % for coupon %', 
                v_total_price, v_coupon_rec.min_bill_amount, v_discount_name;
        END IF;

        IF v_coupon_rec.total_usage_limit IS NOT NULL THEN
            SELECT COUNT(*) INTO v_coupon_usage_count
            FROM app.discount_usages
            WHERE discount_id = v_coupon_rec.coupon_id
              AND status = 'applied';

            IF v_coupon_usage_count >= v_coupon_rec.total_usage_limit THEN
                RAISE EXCEPTION 'Coupon code % has reached its maximum global usage limit', v_discount_name;
            END IF;
        END IF;

        IF v_coupon_rec.usage_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_cust_usage_count
            FROM app.discount_usages
            WHERE discount_id = v_coupon_rec.coupon_id
              AND customer_id = p_customer_id
              AND status = 'applied';

            IF v_cust_usage_count >= v_coupon_rec.usage_per_customer THEN
                RAISE EXCEPTION 'You have reached the maximum allowed uses for coupon %', v_discount_name;
            END IF;
        END IF;

        v_discount_id := v_coupon_rec.coupon_id;
        IF LOWER(v_coupon_rec.discount_type) = 'percentage' THEN
            v_authoritative_discount := ROUND((v_total_price * v_coupon_rec.discount_value) / 100.0, 2);
        ELSE
            v_authoritative_discount := LEAST(v_coupon_rec.discount_value, v_total_price);
        END IF;

    ELSIF v_discount_type = 'offer' AND (v_discount_id IS NOT NULL OR v_discount_name <> '') THEN
        SELECT offer_id, offer_name, discount_type, discount_value, min_bill_amount, valid_from, valid_to, status
        INTO v_offer_rec
        FROM app.offers
        WHERE (offer_id = v_discount_id OR offer_name = v_discount_name)
          AND company_id = p_company_id
        LIMIT 1;

        IF FOUND THEN
            IF LOWER(COALESCE(v_offer_rec.status, 'active')) = 'active'
               AND (v_offer_rec.valid_from IS NULL OR CURRENT_DATE >= v_offer_rec.valid_from)
               AND (v_offer_rec.valid_to IS NULL OR CURRENT_DATE <= v_offer_rec.valid_to)
               AND (v_offer_rec.min_bill_amount IS NULL OR v_total_price >= v_offer_rec.min_bill_amount) THEN
                v_discount_id := v_offer_rec.offer_id;
                v_discount_name := v_offer_rec.offer_name;
                IF LOWER(v_offer_rec.discount_type) = 'percentage' THEN
                    v_authoritative_discount := ROUND((v_total_price * v_offer_rec.discount_value) / 100.0, 2);
                ELSE
                    v_authoritative_discount := LEAST(v_offer_rec.discount_value, v_total_price);
                END IF;
            END IF;
        END IF;

    ELSIF v_discount_type = 'membership' AND (v_discount_id IS NOT NULL OR v_discount_name <> '') THEN
        SELECT id, name, discount_percent
        INTO v_mem_rec
        FROM app.memberships
        WHERE (id = v_discount_id OR name = v_discount_name)
          AND company_id = p_company_id
        LIMIT 1;

        IF FOUND AND COALESCE(v_mem_rec.discount_percent, 0) > 0 THEN
            v_discount_id := v_mem_rec.id;
            v_discount_name := v_mem_rec.name;
            v_authoritative_discount := ROUND((v_total_price * v_mem_rec.discount_percent) / 100.0, 2);
        END IF;

    ELSIF v_discount_type = 'manual' AND COALESCE(p_discount_amount, 0) > 0 THEN
        v_authoritative_discount := LEAST(COALESCE(p_discount_amount, 0), v_total_price);
    END IF;

    v_authoritative_discount := GREATEST(0, LEAST(v_authoritative_discount, v_total_price));
    v_final_amount := GREATEST(0, v_total_price - v_authoritative_discount);

    -- ── 5. Insert Consolidated Summary into app.sales_for_business_transactions ──
    INSERT INTO app.sales_for_business_transactions (
        company_id,
        branch_id,
        sale_id,
        product_ids,
        product_names,
        category_ids,
        category_names,
        customer_id,
        customer_name,
        customer_phone,
        total_quantity,
        total_price,
        payment_method,
        payment_status,
        staff_id,
        staff_name,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
        created_at,
        updated_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_sale_id,
        v_product_ids,
        v_product_names,
        v_category_ids,
        v_category_names,
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        v_total_quantity,
        v_total_price,
        p_payment_method,
        'paid',
        p_staff_id,
        p_staff_name,
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_authoritative_discount,
        v_final_amount,
        NOW(),
        NOW()
    );

    -- ── 6. Direct Insert into app.business_transactions (No Trigger) ──────────
    INSERT INTO app.business_transactions (
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        currency,
        payment_method,
        status,
        notes,
        created_by,
        created_by_user_name,
        paid_at,
        created_at,
        discount_type,
        discount_name,
        discount_amount,
        final_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_sale_id,
        'product',
        v_final_amount,
        'INR',
        p_payment_method,
        'paid',
        'POS Sale #' || SUBSTRING(p_sale_id::text, 1, 8),
        p_staff_id,
        p_staff_name,
        NOW(),
        NOW(),
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_authoritative_discount,
        v_final_amount
    );

    -- ── 7. Track Discount in app.discount_usages ──────────────────────────────
    IF v_authoritative_discount > 0 THEN
        INSERT INTO app.discount_usages (
            company_id,
            branch_id,
            customer_id,
            staff_id,
            staff_name,
            reference_type,
            reference_id,
            discount_type,
            discount_id,
            membership_plan_id,
            discount_name,
            discount_amount,
            status,
            used_at,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            p_branch_id,
            p_customer_id,
            p_staff_id,
            p_staff_name,
            'pos',
            p_sale_id,
            NULLIF(v_discount_type, ''),
            v_discount_id,
            CASE WHEN v_discount_type = 'membership' THEN v_discount_id ELSE NULL END,
            v_discount_name,
            v_authoritative_discount,
            'applied',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- ── 8. Update Customer Last Visit Date ─────────────────────────────────────
    IF p_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET last_visit = CURRENT_DATE,
            updated_at = NOW()
        WHERE customer_id = p_customer_id
          AND company_id = p_company_id;
    END IF;

    -- ── 9. Return Result Payload ──────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'total_quantity', v_total_quantity,
        'total_price', v_total_price,
        'discount_amount', v_authoritative_discount,
        'final_amount', v_final_amount,
        'deducted_items', v_deducted_items
    );
END;
$$;

-- ============================================================================
-- 3. Update app.process_pos_refund_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION app.process_pos_refund_atomic(
    p_original_sale_id uuid,
    p_refund_sale_id uuid,
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT 'Walk-in'::text,
    p_customer_phone text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_staff_id uuid DEFAULT NULL::uuid,
    p_staff_name text DEFAULT 'System'::text,
    p_refund_reason text DEFAULT ''::text,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_original_summary app.sales_for_business_transactions%ROWTYPE;
    v_original_item app.sales%ROWTYPE;

    v_item jsonb;
    v_item_id uuid;
    v_return_qty bigint;
    v_line_total numeric;
    v_total_returned_gross numeric := 0;
    v_total_quantity bigint := 0;

    v_sold_qty bigint;
    v_previously_refunded_qty bigint;

    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_product_names text[] := ARRAY[]::text[];
    v_category_ids uuid[] := ARRAY[]::uuid[];
    v_category_names text[] := ARRAY[]::text[];

    -- Variables for discount reversal
    v_orig_gross_total numeric := 0;
    v_orig_discount numeric := 0;
    v_discount_to_reverse numeric := 0;
    v_final_refund_payable numeric := 0;
    v_rec_discount numeric := 0;
    v_rec_reversed numeric := 0;
    v_remaining_discount numeric := 0;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATES ─────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'pos_issue_refund');

    -- ── AUTHORITATIVE STAFF RESOLUTION ────────────────────────────────────────
    IF p_staff_id IS NULL THEN
        p_staff_id := auth.uid();
    END IF;

    IF (p_staff_name IS NULL OR TRIM(p_staff_name) = '' OR LOWER(TRIM(p_staff_name)) = 'system') AND p_staff_id IS NOT NULL THEN
        SELECT name INTO p_staff_name FROM shared.users WHERE user_id = p_staff_id;
        IF p_staff_name IS NULL THEN
            SELECT staff_name INTO p_staff_name FROM app.staff WHERE staff_id = p_staff_id;
        END IF;
        IF p_staff_name IS NULL THEN
            p_staff_name := 'System';
        END IF;
    END IF;

    -- ── 1. Validate Required Inputs ───────────────────────────────────────────
    IF p_original_sale_id IS NULL THEN
        RAISE EXCEPTION 'Original sale ID is required';
    END IF;

    IF p_refund_sale_id IS NULL THEN
        RAISE EXCEPTION 'Refund reference ID is required';
    END IF;

    p_payment_method := LOWER(COALESCE(TRIM(p_payment_method), 'cash'));
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        p_payment_method := 'cash';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one refund item is required';
    END IF;

    -- ── 2. Lock original sale summary ─────────────────────────────────────────
    SELECT *
    INTO v_original_summary
    FROM app.sales_for_business_transactions
    WHERE sale_id = p_original_sale_id
      AND refund_reference_id IS NULL
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original sale summary not found: %', p_original_sale_id;
    END IF;

    IF v_original_summary.company_id IS DISTINCT FROM p_company_id
       OR (p_branch_id IS NOT NULL AND v_original_summary.branch_id IS DISTINCT FROM p_branch_id) THEN
        RAISE EXCEPTION 'Original sale does not match the supplied company and branch';
    END IF;

    -- ── 3. Prevent reuse of existing refund reference ─────────────────────────
    IF EXISTS (
        SELECT 1 FROM app.sales WHERE refund_reference_id = p_refund_sale_id
    ) OR EXISTS (
        SELECT 1 FROM app.sales_for_business_transactions WHERE refund_reference_id = p_refund_sale_id
    ) THEN
        RAISE EXCEPTION 'This refund reference has already been used: %', p_refund_sale_id;
    END IF;

    -- ── 4. Validate every requested item & prevent over-refunding ─────────────
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'item_id')::uuid;
        v_return_qty := (v_item->>'return_qty')::bigint;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Each refund item must include its original sales item_id';
        END IF;

        IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
            RAISE EXCEPTION 'Return quantity must be greater than zero';
        END IF;

        -- Lock original line item
        SELECT *
        INTO v_original_item
        FROM app.sales
        WHERE id = v_item_id
          AND sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Original sales item % not found in sale %', v_item_id, p_original_sale_id;
        END IF;

        v_sold_qty := COALESCE(v_original_item.quantity, 0);

        -- Check total already refunded for this line item
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_previously_refunded_qty
        FROM app.sales
        WHERE refund_reference_id = p_original_sale_id
          AND product_id = v_original_item.product_id
          AND status = 'refunded';

        IF (v_previously_refunded_qty + v_return_qty) > v_sold_qty THEN
            RAISE EXCEPTION 'Cannot return % units of "%". Sold: %, Already refunded: %, Max returnable: %',
                v_return_qty,
                v_original_item.product_name,
                v_sold_qty,
                v_previously_refunded_qty,
                GREATEST(0, v_sold_qty - v_previously_refunded_qty);
        END IF;

        -- Note: Inventory restock has been removed as requested. Product stock is NOT updated.

        -- ── Table 1: Insert refund line item into app.sales (1 row per returned product) ──
        v_line_total := v_return_qty * v_original_item.price;
        v_total_returned_gross := v_total_returned_gross + v_line_total;
        v_total_quantity := v_total_quantity + v_return_qty;

        INSERT INTO app.sales (
            sale_id,
            branch_id,
            company_id,
            product_id,
            product_name,
            category_id,
            category_name,
            customer_id,
            customer_name,
            customer_phone,
            quantity,
            price,
            total_amount,
            payment_method,
            status,
            staff_id,
            staff_name,
            return_reason,
            refund_reference_id,
            created_at,
            updated_at
        ) VALUES (
            p_original_sale_id,
            p_branch_id,
            p_company_id,
            v_original_item.product_id,
            v_original_item.product_name,
            v_original_item.category_id,
            v_original_item.category_name,
            v_original_summary.customer_id,
            v_original_summary.customer_name,
            v_original_summary.customer_phone,
            v_return_qty,
            v_original_item.price,
            v_line_total,
            p_payment_method,
            'refunded',
            p_staff_id,
            p_staff_name,
            NULLIF(TRIM(p_refund_reason), ''),
            p_refund_sale_id,
            NOW(),
            NOW()
        );

        v_product_ids := array_append(v_product_ids, v_original_item.product_id);
        v_product_names := array_append(v_product_names, v_original_item.product_name);
        IF v_original_item.category_id IS NOT NULL THEN
            v_category_ids := array_append(v_category_ids, v_original_item.category_id);
        END IF;
        IF v_original_item.category_name IS NOT NULL THEN
            v_category_names := array_append(v_category_names, v_original_item.category_name);
        END IF;
    END LOOP;

    IF v_total_quantity <= 0 THEN
        RAISE EXCEPTION 'Refund quantity must be greater than zero';
    END IF;

    -- ── 5. Calculate Price-Weighted Proportional Discount Reversal ────────────
    v_orig_gross_total := COALESCE(v_original_summary.total_price, 0);
    v_orig_discount := COALESCE(v_original_summary.discount_amount, 0);

    IF v_orig_gross_total > 0 AND v_orig_discount > 0 THEN
        SELECT discount_amount, reversal_amount
        INTO v_rec_discount, v_rec_reversed
        FROM app.discount_usages
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos'
        LIMIT 1;

        v_remaining_discount := GREATEST(0, COALESCE(v_rec_discount, v_orig_discount) - COALESCE(v_rec_reversed, 0));
        v_discount_to_reverse := ROUND((v_total_returned_gross / v_orig_gross_total) * v_orig_discount, 2);
        v_discount_to_reverse := LEAST(v_discount_to_reverse, v_remaining_discount);
    ELSE
        v_discount_to_reverse := 0;
    END IF;

    v_final_refund_payable := GREATEST(0, v_total_returned_gross - v_discount_to_reverse);

    -- ── Table 2: Insert Consolidated Summary into app.sales_for_business_transactions ──
    INSERT INTO app.sales_for_business_transactions (
        company_id,
        branch_id,
        sale_id,
        refund_reference_id,
        product_ids,
        product_names,
        category_ids,
        category_names,
        customer_id,
        customer_name,
        customer_phone,
        total_quantity,
        total_price,
        payment_method,
        payment_status,
        staff_id,
        staff_name,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
        created_at,
        updated_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_original_sale_id,
        p_refund_sale_id,
        v_product_ids,
        v_product_names,
        v_category_ids,
        v_category_names,
        v_original_summary.customer_id,
        v_original_summary.customer_name,
        v_original_summary.customer_phone,
        v_total_quantity,
        v_total_returned_gross,
        p_payment_method,
        'refunded',
        p_staff_id,
        p_staff_name,
        v_original_summary.discount_type,
        v_original_summary.discount_name,
        v_discount_to_reverse,
        v_final_refund_payable,
        NOW(),
        NOW()
    );

    -- ── Table 3: Direct Insert into app.business_transactions (No Trigger) ────
    INSERT INTO app.business_transactions (
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        currency,
        payment_method,
        status,
        notes,
        created_by,
        created_by_user_name,
        paid_at,
        created_at,
        discount_type,
        discount_name,
        discount_amount,
        final_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_refund_sale_id,
        'product',
        v_final_refund_payable,
        'INR',
        p_payment_method,
        'refunded',
        'POS Refund #' || SUBSTRING(p_refund_sale_id::text, 1, 8),
        p_staff_id,
        p_staff_name,
        NOW(),
        NOW(),
        v_original_summary.discount_type,
        v_original_summary.discount_name,
        v_discount_to_reverse,
        v_final_refund_payable
    );

    -- ── 7. Update app.discount_usages Reversal Audit ───────────────────────────
    IF v_orig_discount > 0 THEN
        UPDATE app.discount_usages
        SET reversal_amount = LEAST(discount_amount, COALESCE(reversal_amount, 0) + v_discount_to_reverse),
            status = CASE
                WHEN (COALESCE(reversal_amount, 0) + v_discount_to_reverse) >= discount_amount THEN 'reversed'
                ELSE 'partially_reversed'
            END,
            reversed_at = NOW(),
            reversal_reason = COALESCE(NULLIF(TRIM(p_refund_reason), ''), 'POS Partial/Full Return'),
            updated_at = NOW()
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos';
    END IF;

    -- ── 8. Return Result Payload ──────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'original_sale_id', p_original_sale_id,
        'refund_reference_id', p_refund_sale_id,
        'gross_returned', v_total_returned_gross,
        'discount_reversed', v_discount_to_reverse,
        'total_refunded', v_final_refund_payable,
        'total_quantity', v_total_quantity,
        'payment_status', 'refunded'
    );
END;
$$;

-- ============================================================================
-- 4. Ensure public schema wrappers exist and pass all arguments
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_pos_sale_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_sale_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT 'Walk-in Customer'::text,
    p_customer_phone text DEFAULT ''::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_staff_id uuid DEFAULT NULL::uuid,
    p_staff_name text DEFAULT 'System'::text,
    p_items jsonb DEFAULT '[]'::jsonb,
    p_discount_type text DEFAULT NULL::text,
    p_discount_name text DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount numeric DEFAULT 0,
    p_discount_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_pos_sale_atomic(
        p_company_id,
        p_branch_id,
        p_sale_id,
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        p_payment_method,
        p_staff_id,
        p_staff_name,
        p_items,
        p_discount_type,
        p_discount_name,
        p_discount_amount,
        p_final_amount,
        p_discount_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pos_refund_atomic(
    p_original_sale_id uuid,
    p_refund_sale_id uuid,
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT 'Walk-in'::text,
    p_customer_phone text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_staff_id uuid DEFAULT NULL::uuid,
    p_staff_name text DEFAULT 'System'::text,
    p_refund_reason text DEFAULT ''::text,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_pos_refund_atomic(
        p_original_sale_id,
        p_refund_sale_id,
        p_company_id,
        p_branch_id,
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        p_payment_method,
        p_staff_id,
        p_staff_name,
        p_refund_reason,
        p_items
    );
END;
$$;

-- ============================================================================
-- 5. Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION app.create_pos_sale_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION app.process_pos_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic TO authenticated, service_role, anon;
