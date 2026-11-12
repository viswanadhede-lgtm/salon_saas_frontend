-- Migration: 20261112000005_fix_pos_refund_atomic_direct_insert.sql
-- Description: Updates process_pos_refund_atomic:
--   1. Removes "Restock Inventory" (product stock is untouched on refund).
--   2. Inserts directly into app.business_transactions for the refund ledger row.
--   3. Keeps writing to app.sales (1 row per product, status='refunded') and
--      app.sales_for_business_transactions (1 consolidated row, payment_status='refunded').
--   4. Drops trg_create_pos_business_transaction.
--   5. DOES NOT TOUCH create_pos_sale_atomic.

-- ============================================================================
-- Step 1: Drop Trigger trg_create_pos_business_transaction
-- ============================================================================
DROP TRIGGER IF EXISTS trg_create_pos_business_transaction ON app.sales_for_business_transactions;

-- ============================================================================
-- Step 2: Update app.process_pos_refund_atomic
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

        -- Table 1: Insert refund line item into app.sales (1 row per returned product)
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

    -- ── Table 3: Direct Insert into app.business_transactions (No Trigger) ──
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
-- Step 3: public.process_pos_refund_atomic (Zero-Downtime PostgREST Wrapper)
-- ============================================================================
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
-- Step 4: Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION app.process_pos_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic TO authenticated, service_role, anon;

