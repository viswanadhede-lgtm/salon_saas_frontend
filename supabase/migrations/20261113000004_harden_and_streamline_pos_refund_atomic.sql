-- ==============================================================================
-- Migration: 20261113000004_harden_and_streamline_pos_refund_atomic.sql
-- Description: Hardened & Streamlined POS Refund Architecture:
--              1. app.validate_pos_refund (Internal Validation & Financial Calculation RPC)
--                 - Multi-tenant boundary verification
--                 - Original sale summary lookup & branch matching
--                 - Item-by-item verification against original sale line items
--                 - Over-refund prevention across partial refunds (Fixes Bug 1)
--                 - Duplicate line item batch protection
--                 - Price-weighted proportional discount reversal calculation
--                 - Zero inventory mutations (app.products untouched)
--                 - Zero customer mutations (app.customers untouched)
--              2. public.validate_pos_refund (Zero-downtime PostgREST wrapper)
--              3. app.process_pos_refund_atomic (Master Atomic Refund Settlement):
--                 - SECTION 1: Security, Tenant Boundary & Authorization Gates
--                   - Mandatory inputs validation
--                   - Duplicate refund reference protection
--                   - Strict payment method validation (cash, upi, card - no silent fallback)
--                   - Tenant boundary check (shared.verify_tenant_access)
--                   - Gate 1: Subscription (shared.check_subscription)
--                   - Gate 2: RBAC (shared.check_permission 'pos_issue_refund')
--                   - Gate 3: Plan Feature (shared.check_plan_feature 'pos_system')
--                 - SECTION 2: Core POS Refund Settlement
--                   - Server-authoritative staff resolution & validation
--                   - Step 1: Validates Refund via app.validate_pos_refund
--                   - Step 2: Updates app.sales (1 row per returned product item)
--                   - Step 3: Updates app.sales_for_business_transactions (1 summary row)
--                   - Step 4: Updates app.business_transactions (1 financial ledger row)
--                   - Step 5: Updates app.discount_usages (if discount reversed)
--              4. public.process_pos_refund_atomic (Zero-downtime PostgREST wrapper)
-- ==============================================================================

-- ==============================================================================
-- 1. Internal Calculation & Validation RPC: app.validate_pos_refund
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
    v_orig_summary          app.sales_for_business_transactions%ROWTYPE;
    v_orig_item             app.sales%ROWTYPE;
    v_item                  jsonb;
    v_item_id               uuid;
    v_prod_id               uuid;
    v_return_qty            bigint;
    v_sold_qty              bigint;
    v_previously_refunded   bigint;
    v_line_total            numeric;
    v_total_returned_gross  numeric := 0;
    v_total_quantity        bigint := 0;
    v_validated_items       jsonb := '[]'::jsonb;
    v_batch_qty_map         jsonb := '{}'::jsonb;
    v_curr_batch_qty        bigint := 0;

    -- Discount Reversal
    v_orig_gross_total      numeric := 0;
    v_orig_discount         numeric := 0;
    v_discount_to_reverse   numeric := 0;
    v_final_refund_payable  numeric := 0;
    v_rec_discount          numeric := 0;
    v_rec_reversed          numeric := 0;
    v_remaining_discount    numeric := 0;
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

    -- 3. Lookup original sale summary
    SELECT *
    INTO v_orig_summary
    FROM app.sales_for_business_transactions
    WHERE sale_id = p_original_sale_id
      AND refund_reference_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

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

    -- 4. Item-by-item validation and stock limit calculation
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id    := NULLIF(TRIM(COALESCE(v_item->>'item_id', '')), '')::uuid;
        v_prod_id    := NULLIF(TRIM(COALESCE(v_item->>'product_id', '')), '')::uuid;
        v_return_qty := COALESCE((v_item->>'return_qty')::bigint, (v_item->>'quantity')::bigint, 0);

        IF v_return_qty <= 0 THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Return quantity must be greater than zero for all items');
        END IF;

        IF v_item_id IS NOT NULL THEN
            SELECT * INTO v_orig_item
            FROM app.sales
            WHERE id = v_item_id
              AND sale_id = p_original_sale_id
              AND refund_reference_id IS NULL;
        ELSE
            SELECT * INTO v_orig_item
            FROM app.sales
            WHERE product_id = v_prod_id
              AND sale_id = p_original_sale_id
              AND refund_reference_id IS NULL
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('valid', false, 'reason', format('Item %s not found in original sale %s', COALESCE(v_item_id::text, v_prod_id::text, 'unknown'), p_original_sale_id));
        END IF;

        -- Check total sold for this product in this sale
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_sold_qty
        FROM app.sales
        WHERE sale_id = p_original_sale_id
          AND product_id = v_orig_item.product_id
          AND refund_reference_id IS NULL;

        -- Check total previously refunded for this product in this sale (Fixes Bug 1)
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_previously_refunded
        FROM app.sales
        WHERE sale_id = p_original_sale_id
          AND product_id = v_orig_item.product_id
          AND status = 'refunded';

        -- Get previously processed in this batch for the same product
        v_curr_batch_qty := COALESCE((v_batch_qty_map->>v_orig_item.product_id::text)::bigint, 0);

        IF (v_previously_refunded + v_curr_batch_qty + v_return_qty) > v_sold_qty THEN
            RETURN jsonb_build_object(
                'valid', false,
                'reason', format('Cannot return %s units of "%s". Sold: %s, Already refunded: %s, In this request: %s, Max returnable: %s',
                    v_return_qty,
                    v_orig_item.product_name,
                    v_sold_qty,
                    v_previously_refunded,
                    v_curr_batch_qty,
                    GREATEST(0, v_sold_qty - (v_previously_refunded + v_curr_batch_qty))
                )
            );
        END IF;

        v_batch_qty_map := jsonb_set(
            v_batch_qty_map,
            ARRAY[v_orig_item.product_id::text],
            to_jsonb(v_curr_batch_qty + v_return_qty)
        );

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

    -- 5. Calculate Proportional Price-Weighted Discount Reversal
    v_orig_gross_total := COALESCE(v_orig_summary.total_price, 0);
    v_orig_discount    := COALESCE(v_orig_summary.discount_amount, 0);

    IF v_orig_gross_total > 0 AND v_orig_discount > 0 THEN
        SELECT discount_amount, reversal_amount
        INTO v_rec_discount, v_rec_reversed
        FROM app.discount_usages
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos'
        LIMIT 1;

        v_remaining_discount  := GREATEST(0, COALESCE(v_rec_discount, v_orig_discount) - COALESCE(v_rec_reversed, 0));
        v_discount_to_reverse := ROUND((v_total_returned_gross / v_orig_gross_total) * v_orig_discount, 2);
        v_discount_to_reverse := LEAST(v_discount_to_reverse, v_remaining_discount);
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
-- 2. Public wrapper: public.validate_pos_refund
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
-- 3. Master Routine: app.process_pos_refund_atomic
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
    v_resolved_staff_id     uuid := p_staff_id;
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

    -- Authoritative Staff Identity Resolution
    IF v_resolved_staff_id IS NULL THEN
        v_resolved_staff_id := auth.uid();
    END IF;

    IF v_resolved_staff_id IS NOT NULL THEN
        SELECT staff_name INTO v_resolved_staff_name
        FROM app.staff
        WHERE staff_id = v_resolved_staff_id
          AND company_id = p_company_id
          AND LOWER(COALESCE(status, 'active')) = 'active';

        IF v_resolved_staff_name IS NULL THEN
            SELECT name INTO v_resolved_staff_name
            FROM shared.users
            WHERE user_id = v_resolved_staff_id
              AND company_id = p_company_id
              AND LOWER(COALESCE(status, 'active')) = 'active';
        END IF;

        IF v_resolved_staff_name IS NULL THEN
            RAISE EXCEPTION 'Staff % is not a valid, active staff member of company %', v_resolved_staff_id, p_company_id;
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

    -- ── Step 2: Updates app.sales (1 row per returned product item) ────────────
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
        'payment_status', 'refunded'
    );
END;
$$;

-- ==============================================================================
-- 4. Public wrapper: public.process_pos_refund_atomic
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
-- 5. Permissions
-- ==============================================================================
GRANT EXECUTE ON FUNCTION app.validate_pos_refund TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.validate_pos_refund TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION app.process_pos_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic TO authenticated, service_role, anon;

