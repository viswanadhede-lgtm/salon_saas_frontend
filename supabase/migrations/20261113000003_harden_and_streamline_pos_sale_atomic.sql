-- ==============================================================================
-- Migration: 20261113000003_harden_and_streamline_pos_sale_atomic.sql
-- Description: Hardened & Streamlined POS Sale Atomic Architecture:
--              SECTION 1: Security, Tenant Boundary & Authorization Gates
--                - Mandatory inputs validation
--                - Duplicate sale protection (Issue 6)
--                - Strict payment method validation (Issue 5 - no silent cash fallback)
--                - Tenant boundary enforcement (Issue 10)
--                - Gates 1, 2, 3 (Subscription, RBAC pos_checkout, Plan pos_system)
--              SECTION 2: Core POS Sale Settlement
--                - Server-authoritative staff resolution & validation (Issue 4)
--                - Single-pass product lookup with branch isolation (Issues 1, 2, 7)
--                - Active status & catalog price enforcement (Issue 1 - zero frontend price fallback)
--                - Strict quantity validation (Issue 8 - reject <= 0)
--                - Step 1: Validates Discount via app.validate_discount & manual guardrails (Issue 3)
--                - Step 2: Updates app.sales (1 row per product item from cached memory)
--                - Step 3: Updates app.sales_for_business_transactions (1 summary row)
--                - Step 4: Updates app.business_transactions (1 financial ledger row)
--                - Step 5: Inserts into app.discount_usages (if discount used)
--                - Clean return contract (Issue 9 - removed deducted_items)
-- ==============================================================================

-- 1. Hardened & Streamlined app.create_pos_sale_atomic
CREATE OR REPLACE FUNCTION app.create_pos_sale_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_sale_id         uuid,
    p_customer_id     uuid    DEFAULT NULL::uuid,
    p_customer_name   text    DEFAULT 'Walk-in Customer'::text,
    p_customer_phone  text    DEFAULT ''::text,
    p_payment_method  text    DEFAULT 'cash'::text,
    p_staff_id        uuid    DEFAULT NULL::uuid,
    p_staff_name      text    DEFAULT 'System'::text,
    p_items           jsonb   DEFAULT '[]'::jsonb,
    p_discount_type   text    DEFAULT NULL::text,
    p_discount_name   text    DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT 0,
    p_discount_id     uuid    DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Cart & Validation
    v_item                    jsonb;
    v_prod_id                 uuid;
    v_req_qty                 bigint;
    v_prod_rec                record;
    v_validated_items         jsonb := '[]'::jsonb;
    v_total_price             numeric := 0;
    v_total_quantity          bigint := 0;
    v_product_ids             uuid[] := ARRAY[]::uuid[];
    v_product_names           text[] := ARRAY[]::text[];
    v_category_ids            uuid[] := ARRAY[]::uuid[];
    v_category_names          text[] := ARRAY[]::text[];

    -- Staff Resolution
    v_resolved_staff_id       uuid := p_staff_id;
    v_resolved_staff_name     text := 'System';

    -- Discount Delegation
    v_discount_type           text;
    v_discount_name           text;
    v_discount_id             uuid := p_discount_id;
    v_disc_result             jsonb;
    v_authoritative_discount  numeric := 0;
    v_final_amount            numeric := 0;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY, TENANT BOUNDARY & AUTHORIZATION GATES
    -- =========================================================================

    -- 1.1 Input Sanitization & Preconditions
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory';
    END IF;

    IF p_sale_id IS NULL THEN
        RAISE EXCEPTION 'sale_id is mandatory';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart cannot be empty for POS sale';
    END IF;

    -- Duplicate sale check (Issue 6)
    IF EXISTS (SELECT 1 FROM app.sales_for_business_transactions WHERE sale_id = p_sale_id) THEN
        RAISE EXCEPTION 'Sale % has already been processed', p_sale_id;
    END IF;

    -- Strict Payment Method Validation (Issue 5 - no silent fallback to cash)
    p_payment_method := LOWER(COALESCE(TRIM(p_payment_method), ''));
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: "%". Supported methods are cash, upi, card.', p_payment_method;
    END IF;

    -- 1.2 Multi-Tenant Boundary Enforcement (Issue 10)
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'pos_checkout');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'pos_system');

    -- =========================================================================
    -- SECTION 2: CORE POS SALE SETTLEMENT
    -- =========================================================================

    -- Authoritative Staff Identity Resolution (Issue 4)
    IF v_resolved_staff_id IS NULL THEN
        v_resolved_staff_id := auth.uid();
    END IF;

    IF v_resolved_staff_id IS NOT NULL THEN
        -- Lookup in app.staff
        SELECT staff_name INTO v_resolved_staff_name
        FROM app.staff
        WHERE staff_id = v_resolved_staff_id
          AND company_id = p_company_id
          AND LOWER(COALESCE(status, 'active')) = 'active';

        -- Fallback to shared.users
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

    -- Single-Pass Product Lookup, Active & Branch Validation (Issues 1, 2, 7, 8)
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := NULLIF(TRIM(COALESCE(v_item->>'product_id', '')), '')::uuid;
        IF v_prod_id IS NULL THEN
            RAISE EXCEPTION 'Every cart item must specify a valid product_id';
        END IF;

        -- Strict Quantity Validation (Issue 8 - no silent coercion to 1)
        BEGIN
            v_req_qty := (v_item->>'quantity')::bigint;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid quantity for product %. Quantity must be a valid integer.', v_prod_id;
        END;

        IF v_req_qty IS NULL OR v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity % for product %. Quantity must be greater than zero.', v_req_qty, v_prod_id;
        END IF;

        -- Authoritative Product Lookup with Branch Isolation (Issues 1 & 2)
        SELECT product_id, product_name, price, category_id, category_name, status, branch_id
        INTO v_prod_rec
        FROM app.products
        WHERE product_id = v_prod_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id IS NULL OR branch_id = p_branch_id);

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in authorized company/branch', v_prod_id;
        END IF;

        -- Active Status Check (Issue 1)
        IF COALESCE(LOWER(TRIM(v_prod_rec.status)), 'active') <> 'active' THEN
            RAISE EXCEPTION 'Product "%" is inactive and cannot be sold', v_prod_rec.product_name;
        END IF;

        -- Price Check (Issue 1 - zero fallback to frontend price)
        IF v_prod_rec.price IS NULL OR v_prod_rec.price < 0 THEN
            RAISE EXCEPTION 'Product "%" does not have a valid catalogue price', v_prod_rec.product_name;
        END IF;

        -- Store validated item details in memory (Single-Pass Cache, Issue 7)
        v_validated_items := v_validated_items || jsonb_build_object(
            'product_id', v_prod_rec.product_id,
            'product_name', v_prod_rec.product_name,
            'category_id', v_prod_rec.category_id,
            'category_name', COALESCE(v_prod_rec.category_name, ''),
            'quantity', v_req_qty,
            'price', v_prod_rec.price,
            'item_total', v_req_qty * v_prod_rec.price
        );

        v_total_price := v_total_price + (v_req_qty * v_prod_rec.price);
        v_total_quantity := v_total_quantity + v_req_qty;

        v_product_ids := array_append(v_product_ids, v_prod_rec.product_id);
        v_product_names := array_append(v_product_names, v_prod_rec.product_name);
        IF v_prod_rec.category_id IS NOT NULL THEN
            v_category_ids := array_append(v_category_ids, v_prod_rec.category_id);
        END IF;
        IF v_prod_rec.category_name IS NOT NULL THEN
            v_category_names := array_append(v_category_names, v_prod_rec.category_name);
        END IF;
    END LOOP;

    -- ── Step 1: Validates Discount (if used) by calling validate_discount RPC (Issue 3) ─
    v_discount_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    v_discount_name := TRIM(COALESCE(p_discount_name, ''));
    v_discount_id   := p_discount_id;

    IF v_discount_type <> '' AND v_discount_type NOT IN ('none', 'null') THEN
        IF v_discount_type IN ('coupon', 'offer', 'membership') THEN
            v_disc_result := app.validate_discount(
                p_company_id      => p_company_id,
                p_branch_id       => p_branch_id,
                p_discount_type   => v_discount_type,
                p_code_or_id      => CASE 
                                         WHEN v_discount_type = 'membership' THEN COALESCE(v_discount_id::text, '')
                                         WHEN v_discount_type = 'offer' THEN COALESCE(v_discount_id::text, v_discount_name)
                                         ELSE COALESCE(v_discount_name, v_discount_id::text)
                                     END,
                p_bill_amount     => v_total_price,
                p_customer_id     => p_customer_id,
                p_applicable_type => 'product'
            );

            IF NOT COALESCE((v_disc_result->>'valid')::boolean, false) THEN
                RAISE EXCEPTION 'Discount rejected: %', COALESCE(v_disc_result->>'reason', 'Invalid discount');
            END IF;

            v_authoritative_discount := COALESCE((v_disc_result->>'discount_amount')::numeric, 0);
            v_discount_id            := NULLIF(v_disc_result->>'discount_id', '')::uuid;
            v_discount_name          := COALESCE(v_disc_result->>'discount_name', v_discount_name);

        ELSIF v_discount_type IN ('manual', 'custom') THEN
            IF p_discount_amount < 0 THEN
                RAISE EXCEPTION 'Manual discount amount cannot be negative';
            END IF;
            v_authoritative_discount := COALESCE(p_discount_amount, 0);
            IF v_discount_name = '' THEN
                v_discount_name := 'Manual Discount';
            END IF;
        ELSE
            RAISE EXCEPTION 'Unknown or unsupported discount type: "%"', p_discount_type;
        END IF;
    END IF;

    -- Clamp discount between 0 and bill total
    v_authoritative_discount := ROUND(LEAST(v_total_price, GREATEST(0, v_authoritative_discount)), 2);
    v_final_amount := GREATEST(0, v_total_price - v_authoritative_discount);

    -- ── Step 2: Updates sales table (1 row per 1 product) atomically (Issue 7) ──────────
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_validated_items)
    LOOP
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
            (v_item->>'product_id')::uuid,
            v_item->>'product_name',
            NULLIF(v_item->>'category_id', '')::uuid,
            COALESCE(v_item->>'category_name', ''),
            p_customer_id,
            p_customer_name,
            p_customer_phone,
            (v_item->>'quantity')::bigint,
            (v_item->>'price')::numeric,
            (v_item->>'item_total')::numeric,
            p_payment_method,
            'paid',
            v_resolved_staff_id,
            v_resolved_staff_name,
            NOW(),
            NOW()
        );
    END LOOP;

    -- ── Step 3: Updates sales_for_business_transactions table atomically ──────
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
        v_resolved_staff_id,
        v_resolved_staff_name,
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_authoritative_discount,
        v_final_amount,
        NOW(),
        NOW()
    );

    -- ── Step 4: Updates business_transactions table 1 row for financial ledger ─
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
        v_resolved_staff_id,
        v_resolved_staff_name,
        NOW(),
        NOW(),
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_authoritative_discount,
        v_final_amount
    );

    -- ── Step 5: Insert into discount_usages if any discount used ──────────────
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
            v_resolved_staff_id,
            v_resolved_staff_name,
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

    -- Return JSON payload (Issue 9 - clean contract without deducted_items)
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'total_quantity', v_total_quantity,
        'total_price', v_total_price,
        'discount_amount', v_authoritative_discount,
        'final_amount', v_final_amount
    );
END;
$$;

-- 2. Zero-Downtime Public Schema Wrapper
CREATE OR REPLACE FUNCTION public.create_pos_sale_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_sale_id         uuid,
    p_customer_id     uuid    DEFAULT NULL::uuid,
    p_customer_name   text    DEFAULT 'Walk-in Customer'::text,
    p_customer_phone  text    DEFAULT ''::text,
    p_payment_method  text    DEFAULT 'cash'::text,
    p_staff_id        uuid    DEFAULT NULL::uuid,
    p_staff_name      text    DEFAULT 'System'::text,
    p_items           jsonb   DEFAULT '[]'::jsonb,
    p_discount_type   text    DEFAULT NULL::text,
    p_discount_name   text    DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT 0,
    p_discount_id     uuid    DEFAULT NULL::uuid
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

-- 3. Grants
GRANT EXECUTE ON FUNCTION app.create_pos_sale_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic TO authenticated, service_role, anon;

