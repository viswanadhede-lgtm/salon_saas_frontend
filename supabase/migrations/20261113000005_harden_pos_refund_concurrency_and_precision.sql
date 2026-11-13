-- ==============================================================================
-- Migration: 20261113000005_harden_pos_refund_concurrency_and_precision.sql
-- Description: Strengthened POS Refund Architecture with Concurrency & Precision:
--              1. Adds original_item_id column to app.sales for 1:1 line linkage
--              2. app.validate_pos_refund (Internal Validation & Financial Calculation):
--                 - Fix 1: Pessimistic row-level locking (FOR UPDATE) on sale & lines
--                 - Fix 2: Mandatory item_id with exact original line item lookup
--                 - Fix 3: Fail-fast duplicate item_id rejection in request payload
--                 - Fix 4: Final reconciliation rule eliminating 1-cent rounding drift
--                 - Fix 5: Pessimistic row locking on app.discount_usages
--              3. public.validate_pos_refund (Zero-downtime wrapper)
--              4. app.process_pos_refund_atomic:
--                 - Fix 6: Authoritative auth.uid() prioritization & branch authorization
--                 - Step 1: Validates via app.validate_pos_refund
--                 - Step 2: Inserts return lines into app.sales with original_item_id
--                 - Step 3: Inserts summary into app.sales_for_business_transactions
--                 - Step 4: Inserts financial ledger row into app.business_transactions
--                 - Step 5: Updates app.discount_usages (verified)
--              5. public.process_pos_refund_atomic (Zero-downtime wrapper)
-- ==============================================================================

-- ==============================================================================
-- 1. Ensure original_item_id column exists on app.sales
-- ==============================================================================
ALTER TABLE app.sales ADD COLUMN IF NOT EXISTS original_item_id uuid;

-- ==============================================================================
-- 2. Internal Calculation & Validation RPC: app.validate_pos_refund
-- ==============================================================================
CREATE OR REPLACE FUNCTION app.validate_pos_refund(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_original_sale_id  uuid,
    p_items             jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_orig_summary                  app.sales_for_business_transactions%ROWTYPE;
    v_orig_item                     app.sales%ROWTYPE;
    v_item                          jsonb;
    v_item_id                       uuid;
    v_return_qty                    bigint;
    v_sold_qty                      bigint;
    v_previously_refunded           bigint;
    v_line_total                    numeric;
    v_total_returned_gross          numeric := 0;
    v_total_quantity                bigint := 0;
    v_validated_items               jsonb := '[]'::jsonb;
    v_seen_item_ids                 uuid[] := ARRAY[]::uuid[];

    -- Totals for ERP Final Reconciliation Rule
    v_total_orig_sold_qty           bigint := 0;
    v_total_previously_refunded_qty bigint := 0;
    v_is_final_refund               boolean := false;

    -- Discount Reversal
    v_orig_gross_total              numeric := 0;
    v_orig_discount                 numeric := 0;
    v_discount_to_reverse           numeric := 0;
    v_final_refund_payable          numeric := 0;
    v_rec_discount                  numeric := 0;
    v_rec_reversed                  numeric := 0;
    v_remaining_discount            numeric := 0;
BEGIN
    -- 1. Input sanitization
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'company_id is mandatory');
    END IF;

    IF p_original_sale_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'original_sale_id is mandatory');
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'At least one refund item is required');
    END IF;

    -- 2. Tenant boundary check
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Unauthorized tenant access');
    END IF;

    -- 3. Lookup original sale summary with PESSIMISTIC ROW LOCK (Fix 1: Concurrency Protection)
    SELECT *
    INTO v_orig_summary
    FROM app.sales_for_business_transactions
    WHERE sale_id = p_original_sale_id
      AND refund_reference_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Original sale summary not found: %s', p_original_sale_id));
    END IF;

    IF v_orig_summary.company_id IS DISTINCT FROM p_company_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Original sale belongs to a different company');
    END IF;

    IF p_branch_id IS NOT NULL AND v_orig_summary.branch_id IS DISTINCT FROM p_branch_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Original sale belongs to a different branch');
    END IF;

    IF LOWER(COALESCE(v_orig_summary.payment_status, '')) NOT IN ('paid', 'completed') THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Original sale is not in paid status (status: %s)', v_orig_summary.payment_status));
    END IF;

    -- Query total original units sold for sale-wide reconciliation
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_orig_sold_qty
    FROM app.sales
    WHERE sale_id = p_original_sale_id
      AND refund_reference_id IS NULL;

    -- Query total units previously refunded across all prior refund transactions
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_previously_refunded_qty
    FROM app.sales
    WHERE sale_id = p_original_sale_id
      AND status = 'refunded';

    -- 4. Item-by-item validation and stock limit calculation
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id    := NULLIF(TRIM(COALESCE(v_item->>'item_id', '')), '')::uuid;
        v_return_qty := COALESCE((v_item->>'return_qty')::bigint, (v_item->>'quantity')::bigint, 0);

        -- Fix 2: Mandatory item_id check
        IF v_item_id IS NULL THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Each refund item must provide a valid original sale item_id');
        END IF;

        -- Fix 3: Reject duplicate item_id in request payload
        IF v_item_id = ANY(v_seen_item_ids) THEN
            RETURN jsonb_build_object(
                'valid', false,
                'reason', format('Duplicate item_id "%s" in refund request. Please consolidate quantities into a single entry.', v_item_id)
            );
        END IF;
        v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);

        IF v_return_qty <= 0 THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Return quantity must be greater than zero for all items');
        END IF;

        -- Fix 1 & Fix 2: Lock original line item and preserve exact line identity
        SELECT *
        INTO v_orig_item
        FROM app.sales
        WHERE id = v_item_id
          AND sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('valid', false, 'reason', format('Original sales item %s not found in sale %s', v_item_id, p_original_sale_id));
        END IF;

        v_sold_qty := COALESCE(v_orig_item.quantity, 0);

        -- Check total previously refunded for this specific line item
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_previously_refunded
        FROM app.sales
        WHERE sale_id = p_original_sale_id
          AND (original_item_id = v_orig_item.id OR (original_item_id IS NULL AND product_id = v_orig_item.product_id))
          AND status = 'refunded';

        IF (v_previously_refunded + v_return_qty) > v_sold_qty THEN
            RETURN jsonb_build_object(
                'valid', false,
                'reason', format('Cannot return %s units of "%s". Sold: %s, Already refunded: %s, Max returnable: %s',
                    v_return_qty,
                    v_orig_item.product_name,
                    v_sold_qty,
                    v_previously_refunded,
                    GREATEST(0, v_sold_qty - v_previously_refunded)
                )
            );
        END IF;

        -- Authoritative price calculation
        v_line_total := v_return_qty * v_orig_item.price;
        v_total_returned_gross := v_total_returned_gross + v_line_total;
        v_total_quantity := v_total_quantity + v_return_qty;

        v_validated_items := v_validated_items || jsonb_build_object(
            'item_id', v_orig_item.id,
            'product_id', v_orig_item.product_id,
            'product_name', v_orig_item.product_name,
            'category_id', v_orig_item.category_id,
            'category_name', v_orig_item.category_name,
            'price', v_orig_item.price,
            'return_qty', v_return_qty,
            'line_total', v_line_total
        );
    END LOOP;

    IF v_total_quantity <= 0 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Total refund quantity must be greater than zero');
    END IF;

    -- 5. Fix 4 & Fix 5: Calculate Discount Reversal with Final Reconciliation & Row Locking
    v_orig_gross_total := COALESCE(v_orig_summary.total_price, 0);
    v_orig_discount    := COALESCE(v_orig_summary.discount_amount, 0);

    -- Check if this refund clears all remaining items of the sale
    v_is_final_refund := (v_total_previously_refunded_qty + v_total_quantity) >= v_total_orig_sold_qty;

    IF v_orig_gross_total > 0 AND v_orig_discount > 0 THEN
        -- Lock discount_usages row
        SELECT discount_amount, reversal_amount
        INTO v_rec_discount, v_rec_reversed
        FROM app.discount_usages
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos'
        FOR UPDATE;

        v_remaining_discount := GREATEST(0, COALESCE(v_rec_discount, v_orig_discount) - COALESCE(v_rec_reversed, 0));

        IF v_is_final_refund THEN
            -- ERP Final Reconciliation Rule: reverse 100% of the remaining discount balance
            v_discount_to_reverse := v_remaining_discount;
        ELSE
            -- Proportional price-weighted discount reversal
            v_discount_to_reverse := ROUND((v_total_returned_gross / v_orig_gross_total) * v_orig_discount, 2);
            v_discount_to_reverse := LEAST(v_discount_to_reverse, v_remaining_discount);
        END IF;
    ELSE
        v_discount_to_reverse := 0;
    END IF;

    v_final_refund_payable := GREATEST(0, v_total_returned_gross - v_discount_to_reverse);

    -- 6. Successful validation response
    RETURN jsonb_build_object(
        'valid', true,
        'gross_returned', v_total_returned_gross,
        'discount_reversed', v_discount_to_reverse,
        'final_refund_payable', v_final_refund_payable,
        'total_quantity', v_total_quantity,
        'is_final_refund', v_is_final_refund,
        'validated_items', v_validated_items,
        'original_summary', jsonb_build_object(
            'company_id', v_orig_summary.company_id,
            'branch_id', v_orig_summary.branch_id,
            'customer_id', v_orig_summary.customer_id,
            'customer_name', v_orig_summary.customer_name,
            'customer_phone', v_orig_summary.customer_phone,
            'discount_type', v_orig_summary.discount_type,
            'discount_name', v_orig_summary.discount_name,
            'discount_amount', v_orig_summary.discount_amount,
            'total_price', v_orig_summary.total_price,
            'final_amount', v_orig_summary.final_amount
        )
    );
END;
$$;

-- ==============================================================================
-- 3. Public wrapper: public.validate_pos_refund
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_pos_refund(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_original_sale_id  uuid,
    p_items             jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.validate_pos_refund(
        p_company_id,
        p_branch_id,
        p_original_sale_id,
        p_items
    );
END;
$$;

-- ==============================================================================
-- 4. Master Routine: app.process_pos_refund_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION app.process_pos_refund_atomic(
    p_original_sale_id  uuid,
    p_refund_sale_id    uuid,
    p_company_id        uuid,
    p_branch_id         uuid,
    p_customer_id       uuid    DEFAULT NULL::uuid,
    p_customer_name     text    DEFAULT 'Walk-in'::text,
    p_customer_phone    text    DEFAULT NULL::text,
    p_payment_method    text    DEFAULT 'cash'::text,
    p_staff_id          uuid    DEFAULT NULL::uuid,
    p_staff_name        text    DEFAULT 'System'::text,
    p_refund_reason     text    DEFAULT ''::text,
    p_items             jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Validation Result
    v_val_result            jsonb;
    v_total_returned_gross  numeric := 0;
    v_discount_to_reverse   numeric := 0;
    v_final_refund_payable  numeric := 0;
    v_total_quantity        bigint := 0;

    -- Original Metadata
    v_target_branch_id      uuid;
    v_customer_id           uuid;
    v_customer_name         text;
    v_customer_phone        text;
    v_discount_type         text;
    v_discount_name         text;

    -- Staff Resolution
    v_resolved_staff_id     uuid;
    v_resolved_staff_name   text := 'System';

    -- Line Items Iteration
    v_item                  jsonb;
    v_product_ids           uuid[] := ARRAY[]::uuid[];
    v_product_names         text[] := ARRAY[]::text[];
    v_category_ids          uuid[] := ARRAY[]::uuid[];
    v_category_names        text[] := ARRAY[]::text[];
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY, TENANT BOUNDARY & AUTHORIZATION GATES
    -- =========================================================================

    -- 1.1 Input Preconditions
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory';
    END IF;

    IF p_original_sale_id IS NULL THEN
        RAISE EXCEPTION 'Original sale ID is required';
    END IF;

    IF p_refund_sale_id IS NULL THEN
        RAISE EXCEPTION 'Refund reference ID is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one refund item is required';
    END IF;

    -- Duplicate refund reference check
    IF EXISTS (
        SELECT 1 FROM app.sales WHERE refund_reference_id = p_refund_sale_id
    ) OR EXISTS (
        SELECT 1 FROM app.sales_for_business_transactions WHERE refund_reference_id = p_refund_sale_id
    ) OR EXISTS (
        SELECT 1 FROM app.business_transactions WHERE reference_id = p_refund_sale_id AND reference_type = 'product'
    ) THEN
        RAISE EXCEPTION 'This refund reference has already been used: %', p_refund_sale_id;
    END IF;

    -- Strict Payment Method Validation (No silent fallback to cash)
    p_payment_method := LOWER(COALESCE(TRIM(p_payment_method), ''));
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: "%". Supported methods are cash, upi, card.', p_payment_method;
    END IF;

    -- 1.2 Multi-Tenant Boundary Enforcement
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'pos_issue_refund');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'pos_system');

    -- =========================================================================
    -- SECTION 2: CORE POS REFUND SETTLEMENT (The 5 Steps)
    -- =========================================================================

    -- Fix 6: Authoritative Staff Identity Resolution & Branch Authorization
    IF auth.uid() IS NOT NULL THEN
        v_resolved_staff_id := auth.uid();
    ELSE
        v_resolved_staff_id := p_staff_id;
    END IF;

    IF v_resolved_staff_id IS NOT NULL THEN
        -- Lookup in app.staff for active assignment to company and branch (or multi-branch null)
        SELECT staff_name INTO v_resolved_staff_name
        FROM app.staff
        WHERE staff_id = v_resolved_staff_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id IS NULL OR branch_id = p_branch_id)
          AND LOWER(COALESCE(status, 'active')) = 'active';

        -- Fallback to shared.users (e.g. Owner/Admin with company-wide access)
        IF v_resolved_staff_name IS NULL THEN
            SELECT name INTO v_resolved_staff_name
            FROM shared.users
            WHERE user_id = v_resolved_staff_id
              AND company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id IS NULL OR branch_id = p_branch_id)
              AND LOWER(COALESCE(status, 'active')) = 'active';
        END IF;

        IF v_resolved_staff_name IS NULL THEN
            RAISE EXCEPTION 'Staff % is not authorized or active for branch % in company %',
                v_resolved_staff_id, p_branch_id, p_company_id;
        END IF;
    ELSE
        v_resolved_staff_name := 'System';
    END IF;

    -- ── Step 1: Validates Refund via app.validate_pos_refund ───────────────────
    v_val_result := app.validate_pos_refund(
        p_company_id       => p_company_id,
        p_branch_id        => p_branch_id,
        p_original_sale_id => p_original_sale_id,
        p_items            => p_items
    );

    IF NOT COALESCE((v_val_result->>'valid')::boolean, false) THEN
        RAISE EXCEPTION 'Refund validation failed: %', COALESCE(v_val_result->>'reason', 'Invalid refund request');
    END IF;

    v_total_returned_gross := (v_val_result->>'gross_returned')::numeric;
    v_discount_to_reverse  := (v_val_result->>'discount_reversed')::numeric;
    v_final_refund_payable := (v_val_result->>'final_refund_payable')::numeric;
    v_total_quantity       := (v_val_result->>'total_quantity')::bigint;

    v_target_branch_id     := COALESCE(p_branch_id, NULLIF(v_val_result->'original_summary'->>'branch_id', '')::uuid);
    v_customer_id          := COALESCE(p_customer_id, NULLIF(v_val_result->'original_summary'->>'customer_id', '')::uuid);
    v_customer_name        := COALESCE(NULLIF(TRIM(p_customer_name), ''), v_val_result->'original_summary'->>'customer_name', 'Walk-in');
    v_customer_phone       := COALESCE(p_customer_phone, v_val_result->'original_summary'->>'customer_phone');
    v_discount_type        := v_val_result->'original_summary'->>'discount_type';
    v_discount_name        := v_val_result->'original_summary'->>'discount_name';

    -- ── Step 2: Updates app.sales (1 row per returned product item with original_item_id) ────
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_val_result->'validated_items')
    LOOP
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
            original_item_id,
            created_at,
            updated_at
        ) VALUES (
            p_original_sale_id,
            v_target_branch_id,
            p_company_id,
            (v_item->>'product_id')::uuid,
            v_item->>'product_name',
            NULLIF(v_item->>'category_id', '')::uuid,
            v_item->>'category_name',
            v_customer_id,
            v_customer_name,
            v_customer_phone,
            (v_item->>'return_qty')::bigint,
            (v_item->>'price')::numeric,
            (v_item->>'line_total')::numeric,
            p_payment_method,
            'refunded',
            v_resolved_staff_id,
            v_resolved_staff_name,
            NULLIF(TRIM(p_refund_reason), ''),
            p_refund_sale_id,
            (v_item->>'item_id')::uuid,
            NOW(),
            NOW()
        );

        v_product_ids := array_append(v_product_ids, (v_item->>'product_id')::uuid);
        v_product_names := array_append(v_product_names, v_item->>'product_name');
        IF NULLIF(v_item->>'category_id', '') IS NOT NULL THEN
            v_category_ids := array_append(v_category_ids, (v_item->>'category_id')::uuid);
        END IF;
        IF NULLIF(v_item->>'category_name', '') IS NOT NULL THEN
            v_category_names := array_append(v_category_names, v_item->>'category_name');
        END IF;
    END LOOP;

    -- ── Step 3: Updates app.sales_for_business_transactions (1 summary row) ────
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
        v_target_branch_id,
        p_original_sale_id,
        p_refund_sale_id,
        v_product_ids,
        v_product_names,
        v_category_ids,
        v_category_names,
        v_customer_id,
        v_customer_name,
        v_customer_phone,
        v_total_quantity,
        v_total_returned_gross,
        p_payment_method,
        'refunded',
        v_resolved_staff_id,
        v_resolved_staff_name,
        v_discount_type,
        v_discount_name,
        v_discount_to_reverse,
        v_final_refund_payable,
        NOW(),
        NOW()
    );

    -- ── Step 4: Updates app.business_transactions (1 financial ledger row) ─────
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
        v_target_branch_id,
        p_refund_sale_id,
        'product',
        v_final_refund_payable,
        'INR',
        p_payment_method,
        'refunded',
        'POS Refund #' || SUBSTRING(p_refund_sale_id::text, 1, 8),
        v_resolved_staff_id,
        v_resolved_staff_name,
        NOW(),
        NOW(),
        v_discount_type,
        v_discount_name,
        v_discount_to_reverse,
        v_final_refund_payable
    );

    -- ── Step 5: Inserts / Updates app.discount_usages (if discount reversed) ──
    IF v_discount_to_reverse > 0 THEN
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

    -- Clean Return Contract
    RETURN jsonb_build_object(
        'success', true,
        'original_sale_id', p_original_sale_id,
        'refund_reference_id', p_refund_sale_id,
        'gross_returned', v_total_returned_gross,
        'discount_reversed', v_discount_to_reverse,
        'total_refunded', v_final_refund_payable,
        'total_quantity', v_total_quantity,
        'is_final_refund', (v_val_result->>'is_final_refund')::boolean,
        'payment_status', 'refunded'
    );
END;
$$;

-- ==============================================================================
-- 5. Public wrapper: public.process_pos_refund_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_pos_refund_atomic(
    p_original_sale_id  uuid,
    p_refund_sale_id    uuid,
    p_company_id        uuid,
    p_branch_id         uuid,
    p_customer_id       uuid    DEFAULT NULL::uuid,
    p_customer_name     text    DEFAULT 'Walk-in'::text,
    p_customer_phone    text    DEFAULT NULL::text,
    p_payment_method    text    DEFAULT 'cash'::text,
    p_staff_id          uuid    DEFAULT NULL::uuid,
    p_staff_name        text    DEFAULT 'System'::text,
    p_refund_reason     text    DEFAULT ''::text,
    p_items             jsonb   DEFAULT '[]'::jsonb
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

-- ==============================================================================
-- 6. Permissions
-- ==============================================================================
GRANT EXECUTE ON FUNCTION app.validate_pos_refund TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.validate_pos_refund TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION app.process_pos_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic TO authenticated, service_role, anon;

