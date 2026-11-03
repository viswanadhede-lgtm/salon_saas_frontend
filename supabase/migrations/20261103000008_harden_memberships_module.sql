-- =============================================================================
-- Migration: 20261103000008_harden_memberships_module.sql
-- Module 3: MEMBERSHIPS — Zero-Trust Backend Hardening
-- =============================================================================
-- Replaces:
--   public.assign_membership         → app.assign_membership_atomic + public wrapper
--   public.cancel_membership         → app.cancel_membership_atomic + public wrapper
--   public.process_membership_refund → app.process_membership_refund_atomic + public wrapper
-- New:
--   app.create_membership_plan  + public wrapper
--   app.update_membership_plan  + public wrapper
--   app.delete_membership_plan  + public wrapper
-- =============================================================================

-- ── CALL 1 ───────────────────────────────────────────────────────────────────
-- Drop old weak public RPCs
-- CREATE app.assign_membership_atomic
-- =============================================================================

DROP FUNCTION IF EXISTS public.assign_membership CASCADE;
DROP FUNCTION IF EXISTS public.cancel_membership CASCADE;
DROP FUNCTION IF EXISTS public.process_membership_refund CASCADE;

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

    -- Coupon / offer resolution
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

    -- Final computed amounts (server authority)
    v_server_discount       numeric := 0;
    v_server_final          numeric;
    v_resolved_discount_id  uuid    := p_discount_id;
BEGIN
    -- -------------------------------------------------------------------------
    -- A1. TENANT ISOLATION
    -- -------------------------------------------------------------------------
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- -------------------------------------------------------------------------
    -- A2 + A3. READ PLAN — strict tenant match, no NULL bypass
    -- -------------------------------------------------------------------------
    SELECT plan_name, price, duration, status
    INTO   v_plan_name, v_plan_price, v_plan_duration, v_plan_status
    FROM   app.memberships
    WHERE  membership_id = p_membership_id
      AND  company_id    = p_company_id
      AND  branch_id     = p_branch_id
    LIMIT  1;

    IF v_plan_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan not found or does not belong to this branch.');
    END IF;

    -- A3. Plan must be active
    IF LOWER(COALESCE(v_plan_status,'')) <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan is not active. Current status: ' || COALESCE(v_plan_status,'unknown'));
    END IF;

    -- -------------------------------------------------------------------------
    -- A5. COUPON RE-VALIDATION (server-side, 6-step)
    -- -------------------------------------------------------------------------
    IF p_discount_type = 'coupon' AND p_discount_name IS NOT NULL THEN
        SELECT coupon_id, discount_type, discount_value,
               min_bill_amount, total_usage_limit, usage_per_customer,
               COALESCE(usage_count, 0), all_memberships
        INTO   v_coupon_id, v_coupon_discount_type, v_coupon_discount_value,
               v_coupon_min_bill, v_coupon_total_limit, v_coupon_per_customer,
               v_coupon_usage_count, v_coupon_all_mem
        FROM   app.coupons
        WHERE  coupon_code  = p_discount_name
          AND  company_id   = p_company_id
          AND  status       = 'active'
          AND  valid_from   <= v_purchase_date
          AND  valid_to     >= v_purchase_date
        LIMIT  1;

        IF v_coupon_id IS NOT NULL THEN
            -- Step ③: must apply to memberships
            -- Step ④: min bill check
            -- Step ⑤: total usage limit
            -- Step ⑥: per-customer limit
            IF v_coupon_all_mem = true
               AND (v_coupon_min_bill IS NULL OR v_plan_price >= v_coupon_min_bill)
               AND (v_coupon_total_limit IS NULL OR v_coupon_usage_count < v_coupon_total_limit)
            THEN
                -- Per-customer limit check
                IF v_coupon_per_customer IS NOT NULL AND v_customer_id IS NOT NULL THEN
                    SELECT COUNT(*) INTO v_customer_coupon_uses
                    FROM   app.discount_usages
                    WHERE  discount_id   = v_coupon_id
                      AND  customer_id   = v_customer_id
                      AND  discount_type = 'coupon'
                      AND  status        = 'applied';

                    IF v_customer_coupon_uses < v_coupon_per_customer THEN
                        -- Coupon is valid
                        v_resolved_discount_id := v_coupon_id;
                        IF v_coupon_discount_type = 'percentage' THEN
                            v_server_discount := ROUND((v_plan_price * v_coupon_discount_value / 100), 2);
                        ELSE
                            v_server_discount := LEAST(v_coupon_discount_value, v_plan_price);
                        END IF;
                    END IF;
                ELSE
                    -- No per-customer limit
                    v_resolved_discount_id := v_coupon_id;
                    IF v_coupon_discount_type = 'percentage' THEN
                        v_server_discount := ROUND((v_plan_price * v_coupon_discount_value / 100), 2);
                    ELSE
                        v_server_discount := LEAST(v_coupon_discount_value, v_plan_price);
                    END IF;
                END IF;
            END IF;
            -- If any check failed, v_server_discount remains 0 (full price)
        END IF;

    -- -------------------------------------------------------------------------
    -- A6. OFFER RE-VALIDATION
    -- -------------------------------------------------------------------------
    ELSIF p_discount_type = 'offer' AND p_discount_id IS NOT NULL THEN
        SELECT discount_type, discount_value, all_memberships
        INTO   v_offer_discount_type, v_offer_discount_value, v_offer_all_mem
        FROM   app.offers
        WHERE  offer_id   = p_discount_id
          AND  company_id = p_company_id
          AND  status     = 'active'
          AND  (valid_from IS NULL OR valid_from <= v_purchase_date)
          AND  (valid_to   IS NULL OR valid_to   >= v_purchase_date)
        LIMIT  1;

        IF v_offer_all_mem = true AND v_offer_discount_value IS NOT NULL THEN
            v_resolved_discount_id := p_discount_id;
            IF v_offer_discount_type = 'percentage' THEN
                v_server_discount := ROUND((v_plan_price * v_offer_discount_value / 100), 2);
            ELSE
                v_server_discount := LEAST(v_offer_discount_value, v_plan_price);
            END IF;
        END IF;

    -- Manual discount — accepted as-is but capped at plan price
    ELSIF p_discount_type = 'manual' AND COALESCE(p_discount_amount, 0) > 0 THEN
        v_server_discount := LEAST(COALESCE(p_discount_amount, 0), v_plan_price);
    END IF;

    -- -------------------------------------------------------------------------
    -- A4 + A7. CATALOG PRICE AUTHORITY — server computes final amount
    -- -------------------------------------------------------------------------
    v_server_final := GREATEST(0, v_plan_price - v_server_discount);

    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- -------------------------------------------------------------------------
    -- A8. CUSTOMER DEDUP + CREATE
    -- -------------------------------------------------------------------------
    IF v_customer_id IS NOT NULL THEN
        SELECT customer_name, customer_phone
        INTO   v_customer_name, v_customer_phone
        FROM   app.customers
        WHERE  customer_id = v_customer_id
          AND  company_id  = p_company_id
        LIMIT  1;

        IF v_customer_name IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Customer not found or does not belong to this company.');
        END IF;
    ELSE
        IF v_customer_phone IS NULL OR v_customer_phone = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Customer phone is required when customer ID is not provided.');
        END IF;

        IF v_customer_name IS NULL OR v_customer_name = '' THEN
            v_customer_name := 'Walk-in Customer';
        END IF;

        SELECT customer_id INTO v_customer_id
        FROM   app.customers
        WHERE  customer_phone = v_customer_phone
          AND  company_id     = p_company_id
        LIMIT  1;

        IF v_customer_id IS NULL THEN
            v_customer_id := gen_random_uuid();
            INSERT INTO app.customers (
                customer_id, company_id, branch_id,
                customer_name, customer_phone, customer_email,
                status, total_visits, total_spent, created_at, updated_at
            ) VALUES (
                v_customer_id, p_company_id, p_branch_id,
                v_customer_name, v_customer_phone, NULLIF(TRIM(p_customer_email), ''),
                'active', 1, 0, NOW(), NOW()
            );
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- A9. DUPLICATE ACTIVE MEMBERSHIP GUARD
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM app.membership_purchases
        WHERE  customer_id  = v_customer_id
          AND  membership_id = p_membership_id
          AND  status        = 'active'
          AND  (expiry_date IS NULL OR expiry_date >= v_purchase_date)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer already has an active membership for this plan.');
    END IF;

    -- -------------------------------------------------------------------------
    -- A10. EXPIRY DATE
    -- -------------------------------------------------------------------------
    IF COALESCE(v_plan_duration, 0) > 0 THEN
        v_expiry_date := (v_purchase_date + (v_plan_duration || ' months')::interval)::date;
    ELSE
        v_expiry_date := (v_purchase_date + '12 months'::interval)::date;
    END IF;

    -- -------------------------------------------------------------------------
    -- A11. ATOMIC MULTI-TABLE WRITES
    -- -------------------------------------------------------------------------

    -- ① INSERT membership_purchases
    INSERT INTO app.membership_purchases (
        purchase_id, company_id, branch_id,
        customer_id, customer_name,
        membership_id, plan_name, price, duration,
        purchase_date, expiry_date, status,
        payment_method, payment_status,
        assigned_by_user_id, assigned_by_user_name, notes,
        discount_type, discount_name, discount_amount, final_amount,
        created_at, updated_at
    ) VALUES (
        v_purchase_id, p_company_id, p_branch_id,
        v_customer_id, v_customer_name,
        p_membership_id, v_plan_name, v_plan_price, v_plan_duration,
        v_purchase_date, v_expiry_date, 'active',
        v_payment_method, 'paid',
        p_assigned_by_user_id, p_assigned_by_user_name, p_notes,
        CASE WHEN v_server_discount > 0 THEN p_discount_type ELSE NULL END,
        CASE WHEN v_server_discount > 0 THEN p_discount_name ELSE NULL END,
        CASE WHEN v_server_discount > 0 THEN v_server_discount ELSE NULL END,
        v_server_final,
        NOW(), NOW()
    );

    -- ② INSERT business_transactions (authoritative final_amount)
    INSERT INTO app.business_transactions (
        company_id, branch_id,
        reference_id, reference_type,
        amount, final_amount, currency,
        payment_method, status, notes,
        created_by, paid_at,
        discount_type, discount_name, discount_amount,
        created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id,
        v_purchase_id, 'membership',
        v_server_final, v_server_final, 'INR',
        v_payment_method, 'paid',
        COALESCE(NULLIF(TRIM(p_notes),''), 'Membership Enrollment: ' || v_plan_name),
        p_assigned_by_user_id, NOW(),
        CASE WHEN v_server_discount > 0 THEN p_discount_type ELSE NULL END,
        CASE WHEN v_server_discount > 0 THEN p_discount_name ELSE NULL END,
        CASE WHEN v_server_discount > 0 THEN v_server_discount ELSE NULL END,
        NOW(), NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- ③ UPDATE customer LTV
    UPDATE app.customers
    SET    total_spent = COALESCE(total_spent, 0) + v_server_final,
           last_visit  = v_purchase_date,
           updated_at  = NOW()
    WHERE  customer_id = v_customer_id;

    -- ④ INSERT discount_usages if discount applied
    IF v_server_discount > 0 THEN
        INSERT INTO app.discount_usages (
            company_id, branch_id, customer_id,
            staff_id, staff_name,
            reference_type, reference_id, payment_id,
            membership_plan_id,
            discount_type, discount_id, discount_name, discount_amount,
            status, used_at, created_at, updated_at
        ) VALUES (
            p_company_id, p_branch_id, v_customer_id,
            p_assigned_by_user_id, p_assigned_by_user_name,
            'membership', v_purchase_id, v_payment_id,
            p_membership_id,
            p_discount_type, v_resolved_discount_id, p_discount_name, v_server_discount,
            'applied', NOW(), NOW(), NOW()
        );

        -- ⑤ Increment coupon usage_count if coupon was used
        IF p_discount_type = 'coupon' AND v_resolved_discount_id IS NOT NULL THEN
            UPDATE app.coupons
            SET    usage_count = COALESCE(usage_count, 0) + 1,
                   updated_at  = NOW()
            WHERE  coupon_id = v_resolved_discount_id;
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- A12. RETURN SUCCESS
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',          true,
        'purchase_id',      v_purchase_id,
        'payment_id',       v_payment_id,
        'customer_id',      v_customer_id,
        'customer_name',    v_customer_name,
        'plan_name',        v_plan_name,
        'purchase_date',    v_purchase_date,
        'expiry_date',      v_expiry_date,
        'catalog_price',    v_plan_price,
        'discount_amount',  v_server_discount,
        'final_amount',     v_server_final,
        'payment_method',   v_payment_method
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── CALL 2 ───────────────────────────────────────────────────────────────────
-- Public wrapper for assign_membership_atomic
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_membership_atomic(
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
BEGIN
    RETURN app.assign_membership_atomic(
        p_company_id, p_branch_id, p_membership_id,
        p_customer_id, p_customer_phone, p_customer_name, p_customer_email,
        p_payment_method, p_purchase_date,
        p_discount_type, p_discount_name, p_discount_id,
        p_discount_amount, p_final_amount,
        p_assigned_by_user_id, p_assigned_by_user_name, p_notes
    );
END;
$$;

-- ── CALL 3 ───────────────────────────────────────────────────────────────────
-- app.cancel_membership_atomic + public wrapper
-- =============================================================================

CREATE OR REPLACE FUNCTION app.cancel_membership_atomic(
    p_purchase_id   uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_notes         text    DEFAULT NULL,
    p_staff_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_current_status    text;
    v_customer_id       uuid;
    v_customer_name     text;
    v_plan_name         text;
    v_final_amount      numeric;
    v_today             date := CURRENT_DATE;
BEGIN
    -- B1. TENANT ISOLATION
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- B2. PURCHASE EXISTENCE + STRICT TENANT OWNERSHIP
    SELECT status, customer_id, customer_name, plan_name, final_amount
    INTO   v_current_status, v_customer_id, v_customer_name, v_plan_name, v_final_amount
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    LIMIT  1;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase not found or does not belong to this branch.');
    END IF;

    -- B3. STATE MACHINE — only active → cancelled
    IF v_current_status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only active memberships can be cancelled. Current status: ' || v_current_status
        );
    END IF;

    -- B4. CANCELLATION LEDGER — written atomically (was client-side before)
    INSERT INTO app.business_transactions (
        company_id, branch_id,
        reference_id, reference_type,
        amount, final_amount, currency,
        payment_method, status, notes,
        created_by, paid_at,
        created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id,
        p_purchase_id, 'membership',
        0, 0, 'INR',
        'cash', 'cancelled',
        COALESCE(NULLIF(TRIM(p_notes),''), 'Membership Cancelled: ' || v_plan_name),
        p_staff_id, NOW(),
        NOW(), NOW()
    );

    -- B5. UPDATE PURCHASE STATUS
    UPDATE app.membership_purchases
    SET    status         = 'cancelled',
           cancelled_date = v_today,
           notes          = COALESCE(NULLIF(TRIM(p_notes),''), notes),
           updated_at     = NOW()
    WHERE  purchase_id = p_purchase_id;

    RETURN jsonb_build_object(
        'success',        true,
        'purchase_id',    p_purchase_id,
        'customer_name',  v_customer_name,
        'plan_name',      v_plan_name,
        'status',         'cancelled',
        'cancelled_date', v_today,
        'notes',          p_notes
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_membership_atomic(
    p_purchase_id   uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_notes         text    DEFAULT NULL,
    p_staff_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.cancel_membership_atomic(p_purchase_id, p_company_id, p_branch_id, p_notes, p_staff_id);
END;
$$;

-- ── CALL 4 ───────────────────────────────────────────────────────────────────
-- app.process_membership_refund_atomic + public wrapper
-- =============================================================================

CREATE OR REPLACE FUNCTION app.process_membership_refund_atomic(
    p_purchase_id       uuid,
    p_company_id        uuid,
    p_branch_id         uuid,
    p_refund_amount     numeric,
    p_payment_method    text    DEFAULT 'cash',
    p_refund_reason     text    DEFAULT 'Customer Requested Refund',
    p_staff_id          uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_customer_id       uuid;
    v_customer_name     text;
    v_plan_name         text;
    v_purchase_status   text;
    v_payment_status    text;
    v_final_amount      numeric;
    v_payment_method    text;
    v_payment_id        uuid;
    v_already_refunded  numeric := 0;
    v_max_refundable    numeric := 0;
BEGIN
    -- C1. TENANT ISOLATION
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- C2. PURCHASE EXISTENCE + STRICT TENANT OWNERSHIP
    SELECT customer_id, customer_name, plan_name, status, payment_status, final_amount
    INTO   v_customer_id, v_customer_name, v_plan_name, v_purchase_status, v_payment_status, v_final_amount
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    LIMIT  1;

    IF v_customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase not found or does not belong to this branch.');
    END IF;

    -- C3. STATE MACHINE — only cancelled → refunded
    IF v_purchase_status <> 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only cancelled memberships can be refunded. Current status: ' || v_purchase_status
        );
    END IF;

    IF v_payment_status = 'refunded' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This membership has already been fully refunded.');
    END IF;

    -- C4. MAX REFUNDABLE CALCULATION
    SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM   app.business_transactions
    WHERE  reference_id   = p_purchase_id
      AND  reference_type = 'membership'
      AND  status         = 'refunded';

    v_max_refundable := GREATEST(0, COALESCE(v_final_amount, 0) - v_already_refunded);

    IF p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be greater than zero.');
    END IF;

    IF p_refund_amount > v_max_refundable THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount exceeds refundable limit. Max refundable: ' || v_max_refundable
        );
    END IF;

    -- C5. PAYMENT METHOD NORMALISATION
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- C6. WRITE REFUND LEDGER
    INSERT INTO app.business_transactions (
        company_id, branch_id,
        reference_id, reference_type,
        amount, final_amount, currency,
        payment_method, status, notes,
        created_by, paid_at, created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id,
        p_purchase_id, 'membership',
        p_refund_amount, p_refund_amount, 'INR',
        v_payment_method, 'refunded',
        COALESCE(NULLIF(TRIM(p_refund_reason),''), 'Membership Refund: ' || v_plan_name),
        p_staff_id, NOW(), NOW(), NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- C7. UPDATE PURCHASE RECORD
    UPDATE app.membership_purchases
    SET    status         = 'refunded',
           payment_status = 'refunded',
           notes          = CASE
                                WHEN notes IS NOT NULL AND notes <> ''
                                THEN notes || ' | Refund: ' || COALESCE(p_refund_reason, 'Refunded')
                                ELSE 'Refund: ' || COALESCE(p_refund_reason, 'Refunded')
                            END,
           updated_at     = NOW()
    WHERE  purchase_id = p_purchase_id;

    -- C8. REVERSE CUSTOMER LTV
    IF v_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET    total_spent = GREATEST(0, COALESCE(total_spent, 0) - p_refund_amount),
               updated_at  = NOW()
        WHERE  customer_id = v_customer_id;
    END IF;

    -- C9. REVERSE DISCOUNT USAGE
    UPDATE app.discount_usages
    SET    status          = 'reversed',
           reversal_amount = discount_amount,
           reversed_at     = NOW(),
           reversal_reason = COALESCE(p_refund_reason, 'Membership Refund'),
           updated_at      = NOW()
    WHERE  reference_id   = p_purchase_id
      AND  reference_type = 'membership'
      AND  status         = 'applied';

    RETURN jsonb_build_object(
        'success',           true,
        'purchase_id',       p_purchase_id,
        'refund_payment_id', v_payment_id,
        'customer_name',     v_customer_name,
        'plan_name',         v_plan_name,
        'refund_amount',     p_refund_amount,
        'payment_method',    v_payment_method,
        'status',            'refunded',
        'payment_status',    'refunded'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_membership_refund_atomic(
    p_purchase_id       uuid,
    p_company_id        uuid,
    p_branch_id         uuid,
    p_refund_amount     numeric,
    p_payment_method    text    DEFAULT 'cash',
    p_refund_reason     text    DEFAULT 'Customer Requested Refund',
    p_staff_id          uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_membership_refund_atomic(
        p_purchase_id, p_company_id, p_branch_id,
        p_refund_amount, p_payment_method, p_refund_reason, p_staff_id
    );
END;
$$;

-- ── CALL 5 ───────────────────────────────────────────────────────────────────
-- Plan CRUD RPCs (3 new) + GRANT statements
-- =============================================================================

CREATE OR REPLACE FUNCTION app.create_membership_plan(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_plan_name         text,
    p_price             numeric,
    p_duration          bigint,
    p_discount_type     text    DEFAULT NULL,
    p_discount_value    numeric DEFAULT NULL,
    p_description       text    DEFAULT NULL,
    p_all_services      boolean DEFAULT true,
    p_all_products      boolean DEFAULT false,
    p_all_memberships   boolean DEFAULT false,
    p_valid_from        date    DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_membership_id uuid := gen_random_uuid();
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF TRIM(COALESCE(p_plan_name,'')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Plan name is required.');
    END IF;
    IF COALESCE(p_price, -1) < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Price must be 0 or greater.');
    END IF;
    IF COALESCE(p_duration, 0) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duration must be at least 1 month.');
    END IF;
    IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('percentage','flat') THEN
        RETURN jsonb_build_object('success', false, 'error', 'discount_type must be ''percentage'' or ''flat''.');
    END IF;

    INSERT INTO app.memberships (
        membership_id, company_id, branch_id,
        plan_name, description, price, duration,
        discount_type, discount_value,
        all_services, all_products, all_memberships,
        valid_from, status, created_at, updated_at
    ) VALUES (
        v_membership_id, p_company_id, p_branch_id,
        TRIM(p_plan_name), NULLIF(TRIM(COALESCE(p_description,'')), ''), p_price, p_duration,
        p_discount_type, p_discount_value,
        COALESCE(p_all_services, true), COALESCE(p_all_products, false), COALESCE(p_all_memberships, false),
        COALESCE(p_valid_from, CURRENT_DATE), 'active', NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'membership_id', v_membership_id, 'plan_name', TRIM(p_plan_name));

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_membership_plan(
    p_company_id uuid, p_branch_id uuid, p_plan_name text, p_price numeric, p_duration bigint,
    p_discount_type text DEFAULT NULL, p_discount_value numeric DEFAULT NULL,
    p_description text DEFAULT NULL, p_all_services boolean DEFAULT true,
    p_all_products boolean DEFAULT false, p_all_memberships boolean DEFAULT false,
    p_valid_from date DEFAULT CURRENT_DATE
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp AS $$
BEGIN
    RETURN app.create_membership_plan(p_company_id, p_branch_id, p_plan_name, p_price, p_duration,
        p_discount_type, p_discount_value, p_description, p_all_services, p_all_products,
        p_all_memberships, p_valid_from);
END; $$;

CREATE OR REPLACE FUNCTION app.update_membership_plan(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_membership_id     uuid,
    p_plan_name         text    DEFAULT NULL,
    p_price             numeric DEFAULT NULL,
    p_duration          bigint  DEFAULT NULL,
    p_discount_type     text    DEFAULT NULL,
    p_discount_value    numeric DEFAULT NULL,
    p_description       text    DEFAULT NULL,
    p_all_services      boolean DEFAULT NULL,
    p_all_products      boolean DEFAULT NULL,
    p_all_memberships   boolean DEFAULT NULL,
    p_status            text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_exists    boolean;
    v_plan_name text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT EXISTS(
        SELECT 1 FROM app.memberships
        WHERE membership_id = p_membership_id
          AND company_id    = p_company_id
          AND branch_id     = p_branch_id
          AND status        <> 'deleted'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan not found or already deleted.');
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('active','inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'status must be ''active'' or ''inactive''.');
    END IF;

    UPDATE app.memberships SET
        plan_name       = COALESCE(NULLIF(TRIM(p_plan_name),''),   plan_name),
        price           = COALESCE(p_price,           price),
        duration        = COALESCE(p_duration,         duration),
        discount_type   = CASE WHEN p_discount_type IS NOT NULL THEN p_discount_type ELSE discount_type END,
        discount_value  = COALESCE(p_discount_value,   discount_value),
        description     = COALESCE(NULLIF(TRIM(p_description),''), description),
        all_services    = COALESCE(p_all_services,     all_services),
        all_products    = COALESCE(p_all_products,     all_products),
        all_memberships = COALESCE(p_all_memberships,  all_memberships),
        status          = COALESCE(p_status,            status),
        updated_at      = NOW()
    WHERE membership_id = p_membership_id
    RETURNING plan_name INTO v_plan_name;

    RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'plan_name', v_plan_name);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_membership_plan(
    p_company_id uuid, p_branch_id uuid, p_membership_id uuid,
    p_plan_name text DEFAULT NULL, p_price numeric DEFAULT NULL, p_duration bigint DEFAULT NULL,
    p_discount_type text DEFAULT NULL, p_discount_value numeric DEFAULT NULL,
    p_description text DEFAULT NULL, p_all_services boolean DEFAULT NULL,
    p_all_products boolean DEFAULT NULL, p_all_memberships boolean DEFAULT NULL,
    p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp AS $$
BEGIN
    RETURN app.update_membership_plan(p_company_id, p_branch_id, p_membership_id,
        p_plan_name, p_price, p_duration, p_discount_type, p_discount_value,
        p_description, p_all_services, p_all_products, p_all_memberships, p_status);
END; $$;

CREATE OR REPLACE FUNCTION app.delete_membership_plan(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_exists        boolean;
    v_active_count  int;
    v_plan_name     text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT EXISTS(
        SELECT 1 FROM app.memberships
        WHERE membership_id = p_membership_id
          AND company_id    = p_company_id
          AND branch_id     = p_branch_id
          AND status        <> 'deleted'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan not found or already deleted.');
    END IF;

    SELECT plan_name INTO v_plan_name
    FROM   app.memberships WHERE membership_id = p_membership_id;

    -- Active member guard
    SELECT COUNT(*) INTO v_active_count
    FROM   app.membership_purchases
    WHERE  membership_id = p_membership_id
      AND  status        = 'active';

    IF v_active_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Cannot delete — this plan has ' || v_active_count || ' active member(s). Cancel their memberships first.',
            'active_member_count', v_active_count
        );
    END IF;

    UPDATE app.memberships
    SET    status     = 'deleted',
           updated_at = NOW()
    WHERE  membership_id = p_membership_id;

    RETURN jsonb_build_object(
        'success',              true,
        'membership_id',        p_membership_id,
        'plan_name',            v_plan_name,
        'active_member_count',  0
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_membership_plan(
    p_company_id uuid, p_branch_id uuid, p_membership_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp AS $$
BEGIN
    RETURN app.delete_membership_plan(p_company_id, p_branch_id, p_membership_id);
END; $$;

CREATE OR REPLACE FUNCTION app.sync_expired_memberships(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_count int;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    WITH updated AS (
        UPDATE app.membership_purchases
        SET    status     = 'expired',
               updated_at = NOW()
        WHERE  company_id  = p_company_id
          AND  branch_id   = p_branch_id
          AND  status      = 'active'
          AND  expiry_date < CURRENT_DATE
        RETURNING purchase_id
    )
    SELECT COUNT(*) INTO v_count FROM updated;

    RETURN jsonb_build_object('success', true, 'expired_count', v_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_expired_memberships(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.sync_expired_memberships(p_company_id, p_branch_id);
END;
$$;

-- ── GRANTS ───────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.assign_membership_atomic           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_membership_atomic           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_membership_refund_atomic   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_membership_plan             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_membership_plan             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_membership_plan             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_expired_memberships           TO anon, authenticated;

