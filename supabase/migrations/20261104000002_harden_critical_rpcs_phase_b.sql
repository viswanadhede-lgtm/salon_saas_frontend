-- =============================================================================
-- Migration: 20261104000002_harden_critical_rpcs_phase_b.sql
-- Phase B: Inject Auth Gates into Critical Money & Capacity RPCs
--
-- Strategy: Each function below is a targeted CREATE OR REPLACE that adds
--   shared.check_subscription()  → Gate 1
--   shared.check_permission()    → Gate 2 (RBAC)
--   shared.check_plan_feature()  → Gate 3 (Plan tier)
--   shared.check_quota()         → Capacity quotas
-- immediately after the existing shared.verify_tenant_access() call.
-- All other business logic is preserved exactly.
--
-- Functions hardened in this file:
--   B1.  app.create_pos_sale_atomic        (+Gate1 +Gate2:pos_checkout    +Gate3:pos_system)
--   B2.  app.process_pos_refund_atomic     (+Gate1 +Gate2:pos_issue_refund)
--   B3.  app.assign_membership_atomic      (+Gate1 +Gate2:assign_membership +Gate3:marketing_memberships)
--   B4.  app.process_membership_refund_atomic (+Gate1 +Gate2:refund_membership)
--   B5.  app.create_booking_atomic         (+Gate1 +Gate2:create_booking  +Gate3:bookings_management)
--        (replaces the weak status-string-only check with shared.check_subscription)
--   B6.  app.update_booking_atomic         (+Gate1 +Gate2:update_booking)
--   B7.  app.cancel_booking_atomic         (+Gate1 +Gate2:cancel_booking)
--   B8.  app.process_booking_payment_atomic(+Gate1 +Gate2:collect_payment)
--   B9.  app.process_booking_refund_atomic (+Gate1 +Gate2:booking_refund)
--   B10. app.create_branch_atomic          (+Gate1 +Gate2:branch_create +Quota:max_branches)
--   B11. app.create_user_atomic            (+Gate1 +Gate2:user_create   +Quota:max_users)
--   B12. app.create_staff_atomic           (+Gate1 +Gate2:create_staff  +Quota:max_staff)
--
-- Note: public.* wrappers all delegate to app.* — no changes needed to wrappers.
-- Note: Subscription-exempt RPCs (billing, support, notifications) are NOT touched.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- B1. app.create_pos_sale_atomic  — Gate 1 + Gate 2 (pos_checkout) + Gate 3 (pos_system)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_pos_sale_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_sale_id        uuid,
    p_customer_id    uuid    DEFAULT NULL::uuid,
    p_customer_name  text    DEFAULT 'Walk-in Customer'::text,
    p_customer_phone text    DEFAULT ''::text,
    p_payment_method text    DEFAULT 'cash'::text,
    p_staff_id       uuid    DEFAULT NULL::uuid,
    p_staff_name     text    DEFAULT 'System'::text,
    p_items          jsonb   DEFAULT '[]'::jsonb,
    p_discount_type  text    DEFAULT NULL::text,
    p_discount_name  text    DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount   numeric DEFAULT 0,
    p_discount_id    uuid    DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_item              jsonb;
    v_prod_id           uuid;
    v_req_qty           bigint;
    v_prod_rec          record;
    v_total_price       numeric := 0;
    v_total_quantity    bigint := 0;
    v_product_ids       uuid[]  := ARRAY[]::uuid[];
    v_product_names     text[]  := ARRAY[]::text[];
    v_category_ids      uuid[]  := ARRAY[]::uuid[];
    v_category_names    text[]  := ARRAY[]::text[];
    v_deducted_items    jsonb   := '[]'::jsonb;
    v_catalog_price     numeric;
    v_item_total        numeric;
    v_current_stock     bigint;
    v_new_stock         bigint;
    v_discount_type     text;
    v_discount_name     text;
    v_discount_id       uuid    := p_discount_id;
    v_authoritative_discount numeric := 0;
    v_final_amount      numeric := 0;
    v_coupon_rec        record;
    v_offer_rec         record;
    v_mem_rec           record;
    v_coupon_usage_count bigint := 0;
    v_cust_usage_count  bigint := 0;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1: Subscription active? ─────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — does this user have pos_checkout permission? ───────────
    PERFORM shared.check_permission(p_company_id, 'pos_checkout');

    -- ── GATE 3: Plan — does the plan include pos_system? ─────────────────────
    PERFORM shared.check_plan_feature(p_company_id, 'pos_system');

    -- ── ORIGINAL BUSINESS LOGIC (unchanged from 20261103000007) ──────────────
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

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_req_qty := GREATEST(1, COALESCE((v_item->>'quantity')::bigint, 1));

        IF v_prod_id IS NULL THEN
            RAISE EXCEPTION 'Every cart item must specify a valid product_id';
        END IF;

        SELECT product_id, product_name, price, stock_quantity, status, category_id, category_name
        INTO v_prod_rec
        FROM app.products
        WHERE product_id = v_prod_id
          AND company_id = p_company_id
          AND branch_id  = p_branch_id;

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

        v_new_stock := v_current_stock - v_req_qty;
        UPDATE app.products
        SET stock_quantity = v_new_stock, updated_at = NOW()
        WHERE product_id = v_prod_id;

        v_catalog_price := COALESCE(v_prod_rec.price, 0);
        v_item_total    := v_catalog_price * v_req_qty;
        v_total_price   := v_total_price + v_item_total;
        v_total_quantity := v_total_quantity + v_req_qty;

        v_product_ids   := v_product_ids   || v_prod_rec.product_id;
        v_product_names := v_product_names || v_prod_rec.product_name;
        v_category_ids  := v_category_ids  || v_prod_rec.category_id;
        v_category_names:= v_category_names|| v_prod_rec.category_name;

        v_deducted_items := v_deducted_items || jsonb_build_object(
            'product_id',   v_prod_rec.product_id,
            'product_name', v_prod_rec.product_name,
            'quantity',     v_req_qty,
            'unit_price',   v_catalog_price,
            'line_total',   v_item_total,
            'stock_after',  v_new_stock
        );
    END LOOP;

    -- ── Authoritative Discount Verification ──────────────────────────────────
    v_discount_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    v_discount_name := TRIM(COALESCE(p_discount_name, ''));

    IF v_discount_type = 'coupon' AND v_discount_name <> '' THEN
        SELECT id, discount_type, discount_value, min_bill_amount,
               total_usage_limit, per_customer_limit, applicable_to_all_memberships
        INTO v_coupon_rec
        FROM app.coupons
        WHERE company_id  = p_company_id
          AND branch_id   = p_branch_id
          AND LOWER(code) = LOWER(v_discount_name)
          AND status      = 'active'
          AND CURRENT_DATE BETWEEN start_date AND end_date
        LIMIT 1;

        IF FOUND THEN
            v_discount_id := v_coupon_rec.id;

            IF v_coupon_rec.total_usage_limit IS NOT NULL THEN
                SELECT COUNT(*) INTO v_coupon_usage_count
                FROM app.coupon_usages WHERE coupon_id = v_discount_id;
                IF v_coupon_usage_count >= v_coupon_rec.total_usage_limit THEN
                    RAISE EXCEPTION 'Coupon "%" has reached its total usage limit', v_discount_name;
                END IF;
            END IF;

            IF v_coupon_rec.per_customer_limit IS NOT NULL AND p_customer_id IS NOT NULL THEN
                SELECT COUNT(*) INTO v_cust_usage_count
                FROM app.coupon_usages
                WHERE coupon_id = v_discount_id AND customer_id = p_customer_id;
                IF v_cust_usage_count >= v_coupon_rec.per_customer_limit THEN
                    RAISE EXCEPTION 'Coupon "%" has already been used the maximum number of times by this customer', v_discount_name;
                END IF;
            END IF;

            IF v_coupon_rec.min_bill_amount IS NOT NULL AND v_total_price < v_coupon_rec.min_bill_amount THEN
                RAISE EXCEPTION 'Minimum bill amount of % required for coupon "%"', v_coupon_rec.min_bill_amount, v_discount_name;
            END IF;

            IF v_coupon_rec.discount_type = 'percentage' THEN
                v_authoritative_discount := ROUND(v_total_price * v_coupon_rec.discount_value / 100, 2);
            ELSE
                v_authoritative_discount := LEAST(v_coupon_rec.discount_value, v_total_price);
            END IF;

            INSERT INTO app.coupon_usages (id, coupon_id, customer_id, company_id, branch_id, used_at)
            VALUES (gen_random_uuid(), v_discount_id, p_customer_id, p_company_id, p_branch_id, NOW())
            ON CONFLICT DO NOTHING;
        END IF;

    ELSIF v_discount_type = 'offer' AND v_discount_name <> '' THEN
        SELECT id, discount_type, discount_value
        INTO v_offer_rec
        FROM app.offers
        WHERE company_id  = p_company_id
          AND branch_id   = p_branch_id
          AND LOWER(title) = LOWER(v_discount_name)
          AND status      = 'active'
          AND CURRENT_DATE BETWEEN start_date AND end_date
        LIMIT 1;

        IF FOUND THEN
            v_discount_id := v_offer_rec.id;
            IF v_offer_rec.discount_type = 'percentage' THEN
                v_authoritative_discount := ROUND(v_total_price * v_offer_rec.discount_value / 100, 2);
            ELSE
                v_authoritative_discount := LEAST(v_offer_rec.discount_value, v_total_price);
            END IF;
        END IF;

    ELSIF v_discount_type = 'membership' AND v_discount_name <> '' THEN
        SELECT mp.id, mp.discount_type, mp.discount_value
        INTO v_mem_rec
        FROM app.memberships mp
        JOIN app.customer_memberships cm ON cm.membership_id = mp.membership_id
        WHERE mp.company_id  = p_company_id
          AND mp.branch_id   = p_branch_id
          AND cm.customer_id = p_customer_id
          AND cm.status      = 'active'
          AND CURRENT_DATE <= cm.expiry_date
        LIMIT 1;

        IF FOUND THEN
            v_discount_id := v_mem_rec.id;
            IF v_mem_rec.discount_type = 'percentage' THEN
                v_authoritative_discount := ROUND(v_total_price * v_mem_rec.discount_value / 100, 2);
            ELSE
                v_authoritative_discount := LEAST(v_mem_rec.discount_value, v_total_price);
            END IF;
        END IF;
    END IF;

    v_final_amount := GREATEST(0, v_total_price - v_authoritative_discount);

    -- ── Write sale records ────────────────────────────────────────────────────
    INSERT INTO app.sales_for_business_transactions (
        sale_id, company_id, branch_id,
        customer_id, customer_name, customer_phone,
        payment_method, staff_id, staff_name,
        gross_total, discount_type, discount_name,
        discount_amount, final_amount,
        discount_id, product_ids, product_names,
        category_ids, category_names, total_quantity,
        status, created_at, updated_at
    ) VALUES (
        p_sale_id, p_company_id, p_branch_id,
        p_customer_id, p_customer_name, p_customer_phone,
        p_payment_method, p_staff_id, p_staff_name,
        v_total_price, v_discount_type, v_discount_name,
        v_authoritative_discount, v_final_amount,
        v_discount_id, v_product_ids, v_product_names,
        v_category_ids, v_category_names, v_total_quantity,
        'completed', NOW(), NOW()
    );

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_deducted_items)
    LOOP
        INSERT INTO app.sales (
            id, sale_id, company_id, branch_id,
            customer_id, product_id, product_name,
            quantity, unit_price, line_total,
            payment_method, status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_sale_id, p_company_id, p_branch_id,
            p_customer_id,
            (v_item->>'product_id')::uuid,
            v_item->>'product_name',
            (v_item->>'quantity')::bigint,
            (v_item->>'unit_price')::numeric,
            (v_item->>'line_total')::numeric,
            p_payment_method, 'completed', NOW(), NOW()
        );
    END LOOP;

    -- Update customer LTV
    IF p_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET total_spend = COALESCE(total_spend, 0) + v_final_amount,
            updated_at  = NOW()
        WHERE customer_id = p_customer_id AND company_id = p_company_id;
    END IF;

    RETURN jsonb_build_object(
        'success',       true,
        'sale_id',       p_sale_id,
        'gross_total',   v_total_price,
        'discount',      v_authoritative_discount,
        'final_amount',  v_final_amount,
        'items_sold',    v_total_quantity
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B2. app.process_pos_refund_atomic  — Gate 1 + Gate 2 (pos_issue_refund)
-- Inject gates; all other logic unchanged from 20261103000007.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_pos_refund_atomic(
    p_original_sale_id uuid,
    p_refund_sale_id   uuid,
    p_company_id       uuid,
    p_branch_id        uuid,
    p_customer_id      uuid    DEFAULT NULL::uuid,
    p_customer_name    text    DEFAULT 'Walk-in'::text,
    p_customer_phone   text    DEFAULT NULL::text,
    p_payment_method   text    DEFAULT 'cash'::text,
    p_staff_id         uuid    DEFAULT NULL::uuid,
    p_staff_name       text    DEFAULT 'System'::text,
    p_refund_reason    text    DEFAULT ''::text,
    p_items            jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_original_summary  app.sales_for_business_transactions%ROWTYPE;
    v_original_item     app.sales%ROWTYPE;
    v_item              jsonb;
    v_item_id           uuid;
    v_return_qty        bigint;
    v_line_total        numeric;
    v_total_returned_gross numeric := 0;
    v_total_quantity    bigint := 0;
    v_sold_qty          bigint;
    v_previously_refunded_qty bigint;
    v_product_ids       uuid[]  := ARRAY[]::uuid[];
    v_product_names     text[]  := ARRAY[]::text[];
    v_category_ids      uuid[]  := ARRAY[]::uuid[];
    v_category_names    text[]  := ARRAY[]::text[];
    v_orig_gross_total  numeric := 0;
    v_orig_discount     numeric := 0;
    v_discount_to_reverse numeric := 0;
    v_final_refund_payable numeric := 0;
    v_rec_discount      numeric := 0;
    v_rec_reversed      numeric := 0;
    v_remaining_discount numeric := 0;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1: Subscription active? ─────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — does this user have pos_issue_refund permission? ───────
    PERFORM shared.check_permission(p_company_id, 'pos_issue_refund');

    -- ── ORIGINAL BUSINESS LOGIC (unchanged from 20261103000007) ──────────────
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

    SELECT * INTO v_original_summary
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
       OR v_original_summary.branch_id IS DISTINCT FROM p_branch_id THEN
        RAISE EXCEPTION 'Original sale does not match the supplied company and branch';
    END IF;

    IF EXISTS (SELECT 1 FROM app.sales WHERE refund_reference_id = p_refund_sale_id)
    OR EXISTS (SELECT 1 FROM app.sales_for_business_transactions WHERE refund_reference_id = p_refund_sale_id) THEN
        RAISE EXCEPTION 'This refund reference has already been used: %', p_refund_sale_id;
    END IF;

    v_orig_gross_total := COALESCE(v_original_summary.gross_total, 0);
    v_orig_discount    := COALESCE(v_original_summary.discount_amount, 0);
    v_remaining_discount := v_orig_discount;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id    := (v_item->>'item_id')::uuid;
        v_return_qty := (v_item->>'return_qty')::bigint;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Each refund item must include its original sales item_id';
        END IF;
        IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
            RAISE EXCEPTION 'Return quantity must be greater than zero';
        END IF;

        SELECT * INTO v_original_item
        FROM app.sales
        WHERE id = v_item_id
          AND sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Original sales item % not found in sale %', v_item_id, p_original_sale_id;
        END IF;

        v_sold_qty := COALESCE(v_original_item.quantity, 0);

        SELECT COALESCE(SUM(quantity), 0)
        INTO v_previously_refunded_qty
        FROM app.sales
        WHERE sale_id  = p_original_sale_id
          AND product_id = v_original_item.product_id
          AND status = 'refunded';

        IF (v_previously_refunded_qty + v_return_qty) > v_sold_qty THEN
            RAISE EXCEPTION 'Cannot refund more units than were sold for this item (sold: %, already refunded: %, requesting: %)',
                v_sold_qty, v_previously_refunded_qty, v_return_qty;
        END IF;

        v_line_total := COALESCE(v_original_item.unit_price, 0) * v_return_qty;

        IF v_orig_gross_total > 0 THEN
            v_rec_discount  := ROUND(v_orig_discount * v_line_total / v_orig_gross_total, 2);
            v_rec_reversed  := LEAST(v_rec_discount, v_remaining_discount);
            v_remaining_discount := v_remaining_discount - v_rec_reversed;
        ELSE
            v_rec_reversed := 0;
        END IF;

        v_total_returned_gross := v_total_returned_gross + v_line_total;
        v_discount_to_reverse  := v_discount_to_reverse  + v_rec_reversed;
        v_total_quantity       := v_total_quantity + v_return_qty;

        v_product_ids   := v_product_ids   || v_original_item.product_id;
        v_product_names := v_product_names || v_original_item.product_name;

        UPDATE app.products
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_return_qty,
            updated_at = NOW()
        WHERE product_id = v_original_item.product_id
          AND company_id = p_company_id;

        INSERT INTO app.sales (
            id, sale_id, company_id, branch_id,
            customer_id, product_id, product_name,
            quantity, unit_price, line_total,
            payment_method, status,
            refund_reference_id, refund_reason,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_refund_sale_id, p_company_id, p_branch_id,
            p_customer_id, v_original_item.product_id, v_original_item.product_name,
            v_return_qty, v_original_item.unit_price, v_line_total,
            p_payment_method, 'refunded',
            p_original_sale_id, p_refund_reason,
            NOW(), NOW()
        );
    END LOOP;

    v_final_refund_payable := GREATEST(0, v_total_returned_gross - v_discount_to_reverse);

    INSERT INTO app.sales_for_business_transactions (
        sale_id, company_id, branch_id,
        customer_id, customer_name, customer_phone,
        payment_method, staff_id, staff_name,
        gross_total, discount_amount, final_amount,
        product_ids, product_names,
        category_ids, category_names, total_quantity,
        status, refund_reference_id, refund_reason,
        created_at, updated_at
    ) VALUES (
        p_refund_sale_id, p_company_id, p_branch_id,
        p_customer_id, p_customer_name, p_customer_phone,
        p_payment_method, p_staff_id, p_staff_name,
        -v_total_returned_gross, -v_discount_to_reverse, -v_final_refund_payable,
        v_product_ids, v_product_names,
        v_category_ids, v_category_names, v_total_quantity,
        'refunded', p_original_sale_id, p_refund_reason,
        NOW(), NOW()
    );

    IF p_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET total_spend = GREATEST(0, COALESCE(total_spend, 0) - v_final_refund_payable),
            updated_at  = NOW()
        WHERE customer_id = p_customer_id AND company_id = p_company_id;
    END IF;

    RETURN jsonb_build_object(
        'success',              true,
        'refund_sale_id',       p_refund_sale_id,
        'gross_returned',       v_total_returned_gross,
        'discount_reversed',    v_discount_to_reverse,
        'net_refund_payable',   v_final_refund_payable,
        'items_returned',       v_total_quantity
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B3. app.assign_membership_atomic  — Gate 1 + Gate 2 (assign_membership) + Gate 3 (marketing_memberships)
-- Only the gate block is added; existing DECLARE and business logic is preserved.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.assign_membership_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid        DEFAULT NULL,
    p_customer_phone        text        DEFAULT NULL,
    p_customer_name         text        DEFAULT NULL,
    p_customer_email        text        DEFAULT NULL,
    p_payment_method        text        DEFAULT 'cash',
    p_purchase_date         date        DEFAULT CURRENT_DATE,
    p_discount_type         text        DEFAULT NULL,
    p_discount_name         text        DEFAULT NULL,
    p_discount_id           uuid        DEFAULT NULL,
    p_discount_amount       numeric     DEFAULT NULL,
    p_final_amount          numeric     DEFAULT NULL,
    p_assigned_by_user_id   uuid        DEFAULT NULL,
    p_assigned_by_user_name text        DEFAULT NULL,
    p_notes                 text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_plan_name             text;
    v_plan_price            numeric;
    v_plan_duration         bigint;
    v_plan_status           text;
    v_customer_id           uuid    := p_customer_id;
    v_customer_name         text    := TRIM(p_customer_name);
    v_customer_phone        text    := TRIM(p_customer_phone);
    v_purchase_id           uuid    := gen_random_uuid();
    v_payment_id            uuid;
    v_purchase_date         date    := COALESCE(p_purchase_date, CURRENT_DATE);
    v_expiry_date           date;
    v_payment_method        text;
    v_coupon_id             uuid;
    v_coupon_discount_type  text;
    v_coupon_discount_value numeric;
    v_coupon_min_bill       numeric;
    v_coupon_total_limit    int;
    v_coupon_per_customer   int;
    v_coupon_usage_count    int;
    v_coupon_all_mem        boolean;
    v_customer_coupon_uses  int;
    v_offer_discount_type   text;
    v_offer_discount_value  numeric;
    v_offer_all_mem         boolean;
    v_server_discount       numeric := 0;
    v_server_final          numeric;
    v_resolved_discount_id  uuid    := p_discount_id;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1: Subscription active? ─────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — assign_membership permission ───────────────────────────
    PERFORM shared.check_permission(p_company_id, 'assign_membership');

    -- ── GATE 3: Plan — marketing_memberships included? ────────────────────────
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    -- ── ORIGINAL BUSINESS LOGIC (unchanged from 20261103000008) ──────────────
    SELECT plan_name, price, duration, status
    INTO   v_plan_name, v_plan_price, v_plan_duration, v_plan_status
    FROM   app.memberships
    WHERE  membership_id = p_membership_id
      AND  company_id    = p_company_id
      AND  branch_id     = p_branch_id
    LIMIT  1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership plan not found in this company/branch.';
    END IF;
    IF LOWER(COALESCE(v_plan_status, '')) <> 'active' THEN
        RAISE EXCEPTION 'Membership plan "%" is not active.', v_plan_name;
    END IF;

    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    IF v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
        v_customer_phone := regexp_replace(v_customer_phone, '[^0-9]', '', 'g');
    END IF;

    IF v_customer_id IS NOT NULL THEN
        PERFORM 1 FROM app.customers
        WHERE customer_id = v_customer_id AND company_id = p_company_id;
        IF NOT FOUND THEN v_customer_id := NULL; END IF;
    END IF;

    IF v_customer_id IS NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
        SELECT customer_id INTO v_customer_id
        FROM app.customers
        WHERE company_id = p_company_id
          AND regexp_replace(COALESCE(customer_phone,''), '[^0-9]','','g') = v_customer_phone
        LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        v_customer_id := gen_random_uuid();
        INSERT INTO app.customers (
            customer_id, company_id, branch_id,
            customer_name, customer_phone, customer_email,
            status, created_at, updated_at
        ) VALUES (
            v_customer_id, p_company_id, p_branch_id,
            COALESCE(NULLIF(v_customer_name,''), 'Member'), v_customer_phone, p_customer_email,
            'active', NOW(), NOW()
        );
    ELSE
        UPDATE app.customers
        SET customer_name  = COALESCE(NULLIF(v_customer_name,''), customer_name),
            customer_email = COALESCE(p_customer_email, customer_email),
            updated_at     = NOW()
        WHERE customer_id = v_customer_id;
    END IF;

    -- Server-side discount computation (coupon / offer — same logic as original)
    IF p_discount_type IS NOT NULL AND p_discount_name IS NOT NULL THEN
        IF LOWER(p_discount_type) = 'coupon' THEN
            SELECT id, discount_type, discount_value, min_bill_amount,
                   total_usage_limit, per_customer_limit, applicable_to_all_memberships
            INTO v_coupon_id, v_coupon_discount_type, v_coupon_discount_value,
                 v_coupon_min_bill, v_coupon_total_limit, v_coupon_per_customer, v_coupon_all_mem
            FROM app.coupons
            WHERE company_id = p_company_id AND branch_id = p_branch_id
              AND LOWER(code) = LOWER(p_discount_name) AND status = 'active'
              AND CURRENT_DATE BETWEEN start_date AND end_date
            LIMIT 1;

            IF FOUND THEN
                v_resolved_discount_id := v_coupon_id;
                IF v_coupon_total_limit IS NOT NULL THEN
                    SELECT COUNT(*) INTO v_coupon_usage_count FROM app.coupon_usages WHERE coupon_id = v_coupon_id;
                    IF v_coupon_usage_count >= v_coupon_total_limit THEN
                        RAISE EXCEPTION 'Coupon has reached total usage limit.';
                    END IF;
                END IF;
                IF v_coupon_per_customer IS NOT NULL THEN
                    SELECT COUNT(*) INTO v_customer_coupon_uses FROM app.coupon_usages
                    WHERE coupon_id = v_coupon_id AND customer_id = v_customer_id;
                    IF v_customer_coupon_uses >= v_coupon_per_customer THEN
                        RAISE EXCEPTION 'Coupon per-customer usage limit reached.';
                    END IF;
                END IF;
                IF v_coupon_min_bill IS NOT NULL AND v_plan_price < v_coupon_min_bill THEN
                    RAISE EXCEPTION 'Minimum bill amount not met for coupon.';
                END IF;
                IF v_coupon_discount_type = 'percentage' THEN
                    v_server_discount := ROUND(v_plan_price * v_coupon_discount_value / 100, 2);
                ELSE
                    v_server_discount := LEAST(v_coupon_discount_value, v_plan_price);
                END IF;
                INSERT INTO app.coupon_usages (id, coupon_id, customer_id, company_id, branch_id, used_at)
                VALUES (gen_random_uuid(), v_coupon_id, v_customer_id, p_company_id, p_branch_id, NOW())
                ON CONFLICT DO NOTHING;
            END IF;
        ELSIF LOWER(p_discount_type) = 'offer' THEN
            SELECT id, discount_type, discount_value, applicable_to_all_memberships
            INTO v_resolved_discount_id, v_offer_discount_type, v_offer_discount_value, v_offer_all_mem
            FROM app.offers
            WHERE company_id = p_company_id AND branch_id = p_branch_id
              AND LOWER(title) = LOWER(p_discount_name) AND status = 'active'
              AND CURRENT_DATE BETWEEN start_date AND end_date
            LIMIT 1;
            IF FOUND THEN
                IF v_offer_discount_type = 'percentage' THEN
                    v_server_discount := ROUND(v_plan_price * v_offer_discount_value / 100, 2);
                ELSE
                    v_server_discount := LEAST(v_offer_discount_value, v_plan_price);
                END IF;
            END IF;
        END IF;
    END IF;

    v_server_final := GREATEST(0, v_plan_price - v_server_discount);
    v_expiry_date  := v_purchase_date + COALESCE(v_plan_duration, 30);

    INSERT INTO app.customer_memberships (
        purchase_id, membership_id, customer_id, company_id, branch_id,
        plan_name, purchase_date, expiry_date, status,
        discount_type, discount_name, discount_id, discount_amount, final_amount,
        assigned_by_user_id, assigned_by_user_name, notes,
        created_at, updated_at
    ) VALUES (
        v_purchase_id, p_membership_id, v_customer_id, p_company_id, p_branch_id,
        v_plan_name, v_purchase_date, v_expiry_date, 'active',
        p_discount_type, p_discount_name, v_resolved_discount_id,
        v_server_discount, v_server_final,
        p_assigned_by_user_id, p_assigned_by_user_name, p_notes,
        NOW(), NOW()
    );

    v_payment_id := gen_random_uuid();
    INSERT INTO app.payments (
        payment_id, company_id, branch_id, customer_id,
        payment_type, reference_id, amount,
        payment_method, status, created_at, updated_at
    ) VALUES (
        v_payment_id, p_company_id, p_branch_id, v_customer_id,
        'membership', v_purchase_id, v_server_final,
        v_payment_method, 'completed', NOW(), NOW()
    );

    UPDATE app.customers
    SET total_spend = COALESCE(total_spend, 0) + v_server_final,
        updated_at  = NOW()
    WHERE customer_id = v_customer_id AND company_id = p_company_id;

    RETURN jsonb_build_object(
        'success',      true,
        'purchase_id',  v_purchase_id,
        'payment_id',   v_payment_id,
        'customer_id',  v_customer_id,
        'plan_name',    v_plan_name,
        'expiry_date',  v_expiry_date,
        'final_amount', v_server_final
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B4. app.process_membership_refund_atomic  — Gate 1 + Gate 2 (refund_membership)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_membership_refund_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_purchase_id   uuid,
    p_refund_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_purchase      record;
    v_refund_amount numeric;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1: Subscription active? ─────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — refund_membership permission ───────────────────────────
    PERFORM shared.check_permission(p_company_id, 'refund_membership');

    -- ── ORIGINAL BUSINESS LOGIC (unchanged from 20261103000008) ──────────────
    SELECT * INTO v_purchase
    FROM app.customer_memberships
    WHERE purchase_id = p_purchase_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership purchase not found.';
    END IF;
    IF LOWER(COALESCE(v_purchase.status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'This membership purchase has already been refunded.';
    END IF;

    v_refund_amount := COALESCE(v_purchase.final_amount, 0);

    UPDATE app.customer_memberships
    SET status        = 'refunded',
        refund_reason = p_refund_reason,
        updated_at    = NOW()
    WHERE purchase_id = p_purchase_id;

    INSERT INTO app.payments (
        payment_id, company_id, branch_id, customer_id,
        payment_type, reference_id, amount,
        payment_method, status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_company_id, p_branch_id, v_purchase.customer_id,
        'membership_refund', p_purchase_id, -v_refund_amount,
        'cash', 'refunded', NOW(), NOW()
    );

    UPDATE app.customers
    SET total_spend = GREATEST(0, COALESCE(total_spend, 0) - v_refund_amount),
        updated_at  = NOW()
    WHERE customer_id = v_purchase.customer_id AND company_id = p_company_id;

    RETURN jsonb_build_object(
        'success',       true,
        'purchase_id',   p_purchase_id,
        'refund_amount', v_refund_amount
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B5. app.create_booking_atomic  — Gate 1 (replaces weak check) + Gate 2 (create_booking) + Gate 3 (bookings_management)
-- The old Step 3 "SaaS Plan Entitlement" block (status-string check) is now
-- replaced by shared.check_subscription() which uses is_subscription_active().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_booking_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid,
    p_customer_name   text,
    p_customer_email  text,
    p_customer_phone  text,
    p_is_new_customer boolean,
    p_services        jsonb,
    p_booking_date    date,
    p_notes           text    DEFAULT NULL::text,
    p_booking_type    text    DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_phone       text;
    v_customer_id       uuid    := p_customer_id;
    v_customer_name     text    := COALESCE(TRIM(p_customer_name), 'Walk-in Customer');
    v_customer_email    text    := NULLIF(TRIM(p_customer_email), '');
    v_sub_status        text;
    v_booking_limit     numeric;
    v_current_usage     integer;
    v_day_name          text;
    v_is_open           boolean;
    v_open_time         time;
    v_close_time        time;
    v_service           jsonb;
    v_service_id        uuid;
    v_package_id        uuid;
    v_staff_id          uuid;
    v_db_service        record;
    v_service_name      text;
    v_item_price        numeric;
    v_item_duration     bigint;
    v_item_start        time;
    v_item_end          time;
    v_staff_name        text;
    v_total_price       numeric := 0;
    v_total_duration    bigint  := 0;
    v_booking_items     jsonb   := '[]'::jsonb;
    v_overlap_check     integer;
BEGIN
    -- ── Step 1: Basic input validation ───────────────────────────────────────
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service line item must be selected for booking';
    END IF;
    IF p_booking_id IS NULL THEN
        p_booking_id := gen_random_uuid();
    END IF;

    -- ── Step 2: Multi-Tenant Boundary ────────────────────────────────────────
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    -- ── GATE 1: Subscription active? (replaces old Step 3 weak check) ────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — create_booking permission ──────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'create_booking');

    -- ── GATE 3: Plan — bookings_management included? ─────────────────────────
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- ── Step 4: Customer Deduplication ───────────────────────────────────────
    v_clean_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');

    IF v_customer_id IS NOT NULL THEN
        PERFORM 1 FROM app.customers WHERE customer_id = v_customer_id AND company_id = p_company_id;
        IF NOT FOUND THEN v_customer_id := NULL; END IF;
    END IF;

    IF v_customer_id IS NULL AND v_clean_phone <> '' THEN
        SELECT customer_id INTO v_customer_id
        FROM app.customers
        WHERE company_id = p_company_id
          AND regexp_replace(COALESCE(customer_phone,''), '[^0-9]', '', 'g') = v_clean_phone
        LIMIT 1;
    END IF;

    IF v_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET last_visit     = p_booking_date,
            customer_name  = COALESCE(NULLIF(v_customer_name, 'Walk-in Customer'), customer_name),
            customer_email = COALESCE(v_customer_email, customer_email),
            updated_at     = NOW()
        WHERE customer_id = v_customer_id;
    ELSE
        v_customer_id := COALESCE(p_customer_id, gen_random_uuid());
        INSERT INTO app.customers (
            customer_id, company_id, branch_id,
            customer_name, customer_email, customer_phone,
            first_visit, last_visit, status,
            created_at, updated_at
        ) VALUES (
            v_customer_id, p_company_id, p_branch_id,
            v_customer_name, v_customer_email, p_customer_phone,
            p_booking_date, p_booking_date, 'active',
            NOW(), NOW()
        );
    END IF;

    -- ── Step 5: Business Hours Validation ────────────────────────────────────
    v_day_name := TRIM(TO_CHAR(p_booking_date, 'Day'));

    SELECT is_open, open_time, close_time
    INTO v_is_open, v_open_time, v_close_time
    FROM app.business_hours
    WHERE company_id = p_company_id
      AND branch_id  = p_branch_id
      AND LOWER(TRIM(day_of_week)) = LOWER(v_day_name)
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No business hours found for % at this branch', v_day_name;
    END IF;
    IF NOT COALESCE(v_is_open, false) THEN
        RAISE EXCEPTION 'Branch is closed on %', v_day_name;
    END IF;

    -- ── Step 6: Service catalog lookup + staff validation + overlap check ─────
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id := (v_service->>'service_id')::uuid;
        v_package_id := (v_service->>'package_id')::uuid;
        v_staff_id   := (v_service->>'staff_id')::uuid;
        v_item_start := (v_service->>'start_time')::time;

        IF v_service_id IS NULL AND v_package_id IS NULL THEN
            RAISE EXCEPTION 'Each booking item must specify a service_id or package_id';
        END IF;

        IF v_service_id IS NOT NULL THEN
            SELECT service_name, price, duration
            INTO v_service_name, v_item_price, v_item_duration
            FROM app.services
            WHERE service_id = v_service_id
              AND company_id = p_company_id
              AND status = 'active'
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Service % not found or inactive in this company', v_service_id;
            END IF;
        ELSE
            SELECT package_name, price, duration
            INTO v_service_name, v_item_price, v_item_duration
            FROM app.packages
            WHERE package_id = v_package_id
              AND company_id = p_company_id
              AND status = 'active'
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Package % not found or inactive in this company', v_package_id;
            END IF;
        END IF;

        v_item_end := v_item_start + (v_item_duration || ' minutes')::interval;

        IF v_item_start < v_open_time OR v_item_end > v_close_time THEN
            RAISE EXCEPTION 'Service "%" is scheduled outside branch business hours (% - %)',
                v_service_name, v_open_time, v_close_time;
        END IF;

        IF v_staff_id IS NOT NULL THEN
            PERFORM 1 FROM app.staff
            WHERE staff_id = v_staff_id AND company_id = p_company_id AND status = 'active';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Staff member % not found or inactive', v_staff_id;
            END IF;

            SELECT name INTO v_staff_name FROM app.staff WHERE staff_id = v_staff_id;

            SELECT COUNT(*) INTO v_overlap_check
            FROM app.bookings b
            JOIN app.booking_services bs ON bs.booking_id = b.booking_id
            WHERE b.staff_id    = v_staff_id
              AND b.company_id  = p_company_id
              AND b.booking_date = p_booking_date
              AND b.status NOT IN ('cancelled', 'no_show')
              AND bs.start_time <  v_item_end
              AND bs.end_time   >  v_item_start;

            IF v_overlap_check > 0 THEN
                RAISE EXCEPTION 'Staff member % has a conflicting booking at that time', v_staff_name;
            END IF;
        END IF;

        v_total_price    := v_total_price + COALESCE(v_item_price, 0);
        v_total_duration := v_total_duration + COALESCE(v_item_duration, 0);

        v_booking_items := v_booking_items || jsonb_build_object(
            'service_id',   v_service_id,
            'package_id',   v_package_id,
            'service_name', v_service_name,
            'staff_id',     v_staff_id,
            'staff_name',   v_staff_name,
            'price',        v_item_price,
            'duration',     v_item_duration,
            'start_time',   v_item_start,
            'end_time',     v_item_end
        );
    END LOOP;

    -- ── Step 7: Insert booking ────────────────────────────────────────────────
    INSERT INTO app.bookings (
        booking_id, company_id, branch_id,
        customer_id, customer_name,
        booking_date, total_price, total_duration,
        notes, booking_type, status,
        created_at, updated_at
    ) VALUES (
        p_booking_id, p_company_id, p_branch_id,
        v_customer_id, v_customer_name,
        p_booking_date, v_total_price, v_total_duration,
        p_notes, COALESCE(p_booking_type, 'walk-in'), 'pending',
        NOW(), NOW()
    );

    FOR v_service IN SELECT value FROM jsonb_array_elements(v_booking_items)
    LOOP
        INSERT INTO app.booking_services (
            id, booking_id, company_id, branch_id,
            service_id, package_id, service_name,
            staff_id, staff_name, price, duration,
            start_time, end_time, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_booking_id, p_company_id, p_branch_id,
            (v_service->>'service_id')::uuid,
            (v_service->>'package_id')::uuid,
            v_service->>'service_name',
            (v_service->>'staff_id')::uuid,
            v_service->>'staff_name',
            (v_service->>'price')::numeric,
            (v_service->>'duration')::bigint,
            (v_service->>'start_time')::time,
            (v_service->>'end_time')::time,
            NOW(), NOW()
        );
    END LOOP;

    RETURN p_booking_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B6. app.update_booking_atomic  — Gate 1 + Gate 2 (update_booking)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.update_booking_atomic(
    p_booking_id    uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_booking_date  date        DEFAULT NULL,
    p_notes         text        DEFAULT NULL,
    p_status        text        DEFAULT NULL,
    p_services      jsonb       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking record;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'update_booking');

    -- ── ORIGINAL BUSINESS LOGIC ───────────────────────────────────────────────
    SELECT * INTO v_booking
    FROM app.bookings
    WHERE booking_id = p_booking_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found in this company/branch.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.status,'')) IN ('cancelled','completed') THEN
        RAISE EXCEPTION 'Cannot update a booking that is already %.', v_booking.status;
    END IF;

    UPDATE app.bookings
    SET booking_date = COALESCE(p_booking_date, booking_date),
        notes        = COALESCE(p_notes, notes),
        status       = COALESCE(p_status, status),
        updated_at   = NOW()
    WHERE booking_id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B7. app.cancel_booking_atomic  — Gate 1 + Gate 2 (cancel_booking)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.cancel_booking_atomic(
    p_booking_id    uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_cancel_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking record;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'cancel_booking');

    SELECT * INTO v_booking
    FROM app.bookings
    WHERE booking_id = p_booking_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.status,'')) = 'cancelled' THEN
        RAISE EXCEPTION 'Booking is already cancelled.';
    END IF;

    UPDATE app.bookings
    SET status        = 'cancelled',
        cancel_reason = p_cancel_reason,
        cancelled_at  = NOW(),
        updated_at    = NOW()
    WHERE booking_id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', 'cancelled');
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B8. app.process_booking_payment_atomic  — Gate 1 + Gate 2 (collect_payment)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_booking_payment_atomic(
    p_booking_id     uuid,
    p_company_id     uuid,
    p_branch_id      uuid,
    p_payment_method text    DEFAULT 'cash',
    p_amount_paid    numeric DEFAULT NULL,
    p_notes          text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking   record;
    v_payment_id uuid := gen_random_uuid();
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'collect_payment');

    SELECT * INTO v_booking
    FROM app.bookings
    WHERE booking_id = p_booking_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.status,'')) = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot collect payment for a cancelled booking.';
    END IF;

    IF LOWER(COALESCE(v_booking.payment_status,'')) = 'paid' THEN
        RAISE EXCEPTION 'Booking % has already been paid.', p_booking_id;
    END IF;

    UPDATE app.bookings
    SET status         = 'completed',
        payment_status = 'paid',
        payment_method = p_payment_method,
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    INSERT INTO app.payments (
        payment_id, company_id, branch_id, customer_id,
        payment_type, reference_id, amount,
        payment_method, notes, status,
        created_at, updated_at
    ) VALUES (
        v_payment_id, p_company_id, p_branch_id, v_booking.customer_id,
        'booking', p_booking_id, COALESCE(p_amount_paid, v_booking.total_price),
        p_payment_method, p_notes, 'completed',
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'payment_id', v_payment_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B9. app.process_booking_refund_atomic  — Gate 1 + Gate 2 (booking_refund)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_booking_refund_atomic(
    p_booking_id    uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_refund_reason text    DEFAULT NULL,
    p_refund_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking   record;
    v_refund_id uuid := gen_random_uuid();
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'booking_refund');

    SELECT * INTO v_booking
    FROM app.bookings
    WHERE booking_id = p_booking_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.payment_status,'')) <> 'paid' THEN
        RAISE EXCEPTION 'Cannot refund a booking that has not been paid.';
    END IF;

    IF LOWER(COALESCE(v_booking.payment_status,'')) = 'refunded' THEN
        RAISE EXCEPTION 'Booking % has already been refunded.', p_booking_id;
    END IF;

    UPDATE app.bookings
    SET payment_status = 'refunded',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    INSERT INTO app.payments (
        payment_id, company_id, branch_id, customer_id,
        payment_type, reference_id, amount,
        payment_method, notes, status,
        created_at, updated_at
    ) VALUES (
        v_refund_id, p_company_id, p_branch_id, v_booking.customer_id,
        'booking_refund', p_booking_id,
        -COALESCE(p_refund_amount, v_booking.total_price),
        'cash', p_refund_reason, 'refunded',
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'refund_id', v_refund_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B10. app.create_branch_atomic  — Gate 1 + Gate 2 (branch_create) + Quota (max_branches)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_branch_atomic(
    p_company_id      uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_new_branch_id uuid    := gen_random_uuid();
    v_exists        boolean;
    v_name          text    := NULLIF(TRIM(p_branch_name), '');
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION 'Access denied: Invalid company context.';
    END IF;

    -- ── GATE 1 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'branch_create');

    -- ── QUOTA: max_branches ──────────────────────────────────────────────────
    PERFORM shared.check_quota(p_company_id, 'max_branches');

    -- ── ORIGINAL BUSINESS LOGIC ───────────────────────────────────────────────
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Branch name is required.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM shared.branches
        WHERE company_id = p_company_id
          AND LOWER(branch_name) = LOWER(v_name)
          AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A branch named "%" already exists in your company.', v_name;
    END IF;

    IF p_manager_user_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM shared.users
            WHERE user_id = p_manager_user_id AND company_id = p_company_id AND status <> 'deleted'
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION 'Manager user not found in this company.';
        END IF;
    END IF;

    INSERT INTO shared.branches (
        branch_id, company_id, branch_name, branch_phone, branch_email,
        branch_code, manager_user_id, address_line_1, address_line_2,
        locality_area, landmark, city, district, state, pin_code,
        country, branch_address, google_maps_url, latitude, longitude,
        status, created_at, updated_at
    ) VALUES (
        v_new_branch_id, p_company_id, v_name, p_branch_phone, p_branch_email,
        p_branch_code, p_manager_user_id, p_address_line_1, p_address_line_2,
        p_locality_area, p_landmark, p_city, p_district, p_state, p_pin_code,
        COALESCE(p_country, 'India'), p_branch_address, p_google_maps_url,
        p_latitude, p_longitude, COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success',     true,
        'branch_id',   v_new_branch_id,
        'branch_name', v_name
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B11. app.create_user_atomic  — Gate 1 + Gate 2 (user_create) + Quota (max_users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_user_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_user_id     uuid,
    p_name        text,
    p_email       text,
    p_phone       text,
    p_role_id     uuid,
    p_role_name   text,
    p_status      text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- ── GATE 1 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'user_create');

    -- ── QUOTA: max_users ─────────────────────────────────────────────────────
    PERFORM shared.check_quota(p_company_id, 'max_users');

    -- ── ORIGINAL BUSINESS LOGIC (unchanged from 20261103000015a) ─────────────
    SELECT EXISTS(
        SELECT 1 FROM shared.roles
        WHERE role_id = p_role_id AND company_id = p_company_id AND status <> 'deleted'
    ) INTO v_exists;
    IF NOT v_exists THEN
        RAISE EXCEPTION 'Role not found or inactive.';
    END IF;

    INSERT INTO shared.users (
        user_id, company_id, branch_id,
        name, email, phone,
        role_id, role_name, status,
        created_at, updated_at
    ) VALUES (
        p_user_id, p_company_id, p_branch_id,
        p_name, p_email, p_phone,
        p_role_id, p_role_name, p_status,
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- B12. app.create_staff_atomic  — Gate 1 + Gate 2 (create_staff) + Quota (max_staff)
-- Preserves exact parameter signature from 20261103000010_harden_staff_module.sql
-- (p_staff_name, p_phone, p_email, p_role_name, p_services_offered, p_notes)
-- The original already had a plan limit check using a raw SQL join — this
-- migration replaces that with the unified shared.check_quota() helper.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_name       text,
    p_phone            text,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT 'Staff',
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name   text := NULLIF(TRIM(p_staff_name), '');
    v_clean_phone  text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_clean_email  text := NULLIF(LOWER(TRIM(p_email)), '');
    v_status       text := COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), 'active');
    v_new_staff_id uuid := gen_random_uuid();
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATE 1 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2 ────────────────────────────────────────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'create_staff');

    -- ── QUOTA: max_staff (replaces the raw plan_limits JOIN in original) ──────
    PERFORM shared.check_quota(p_company_id, 'max_staff');

    -- ── ORIGINAL BUSINESS LOGIC (preserved from 20261103000010) ─────────────
    IF v_clean_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff name is required.');
    END IF;

    IF LENGTH(v_clean_phone) < 7 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid phone number with at least 7 digits is required.');
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.staff
        WHERE company_id = p_company_id
          AND branch_id  = p_branch_id
          AND status <> 'deleted'
          AND (
              regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_clean_phone
              OR (
                  LENGTH(v_clean_phone) >= 10
                  AND LENGTH(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
                  AND RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_phone, 10)
              )
          )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Another staff member already uses this phone number.');
    END IF;

    INSERT INTO app.staff (
        staff_id, company_id, branch_id, staff_name, phone, email,
        role_name, services_offered, notes, status, joined_at, created_at, updated_at
    ) VALUES (
        v_new_staff_id, p_company_id, p_branch_id, v_clean_name, TRIM(p_phone), v_clean_email,
        COALESCE(NULLIF(TRIM(p_role_name), ''), 'Staff'),
        NULLIF(TRIM(p_services_offered), ''),
        NULLIF(TRIM(p_notes), ''),
        v_status, CURRENT_DATE, NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success',    true,
        'staff_id',   v_new_staff_id,
        'staff_name', v_clean_name,
        'status',     v_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =============================================================================
-- END OF PHASE B — CRITICAL MONEY & CAPACITY RPCs HARDENED
-- =============================================================================
-- Summary of protection added:
--   POS sale:              Gate1 + Gate2(pos_checkout)        + Gate3(pos_system)
--   POS refund:            Gate1 + Gate2(pos_issue_refund)
--   Assign membership:     Gate1 + Gate2(assign_membership)   + Gate3(marketing_memberships)
--   Membership refund:     Gate1 + Gate2(refund_membership)
--   Create booking:        Gate1 + Gate2(create_booking)      + Gate3(bookings_management)
--   Update booking:        Gate1 + Gate2(update_booking)
--   Cancel booking:        Gate1 + Gate2(cancel_booking)
--   Collect payment:       Gate1 + Gate2(collect_payment)
--   Booking refund:        Gate1 + Gate2(booking_refund)
--   Create branch:         Gate1 + Gate2(branch_create)       + Quota(max_branches)
--   Create user:           Gate1 + Gate2(user_create)         + Quota(max_users)
--   Create staff:          Gate1 + Gate2(create_staff)        + Quota(max_staff)
--
-- Next: 20261104000003_harden_remaining_rpcs_phase_c.sql
-- =============================================================================
