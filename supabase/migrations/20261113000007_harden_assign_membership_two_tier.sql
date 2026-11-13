-- Migration: 20261113000007_harden_assign_membership_two_tier.sql
-- Description: Two-Tier Architecture for assign_membership (Approach A):
--   1. app.validate_assign_membership: Pure internal validation & data preparation RPC
--      - Validates plan existence & active status in app.memberships
--      - Enforces duplicate active membership prevention in app.membership_purchases
--      - Calculates authoritative expiry date and price/discount clamping
--      - Prepares clean payloads for writes
--   2. app.assign_membership_atomic: Master RPC strictly sectionized into:
--      - SECTION 1: Security Checks (preconditions, tenant boundary, subscription, RBAC, plan feature, staff auth, strict payment method)
--      - SECTION 2: Exactly 3 Steps:
--          Step 1: Call app.validate_assign_membership and reject if invalid
--          Step 2: Atomically insert into app.membership_purchases
--          Step 3: Atomically insert into app.business_transactions
--   3. Public wrappers in public schema
--   4. ACL Lockdown: Revoke PUBLIC/anon, grant strictly to authenticated and service_role

-- Drop legacy 17-parameter overloads cleanly to eliminate stale ACLs
DROP FUNCTION IF EXISTS app.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text) CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INTERNAL VALIDATION RPC: app.validate_assign_membership
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.validate_assign_membership(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid,
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_id           uuid    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT 0,
    p_final_amount          numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_customer          record;
    v_plan              record;
    v_active_purchase   record;
    v_purchase_date     date    := COALESCE(p_purchase_date, CURRENT_DATE);
    v_duration          bigint;
    v_expiry_date       date;
    v_catalog_price     numeric;
    v_discount          numeric := 0;
    v_final             numeric := 0;
BEGIN
    -- 1. Input preconditions
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'company_id is mandatory');
    END IF;

    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'branch_id is mandatory');
    END IF;

    IF p_membership_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'membership_id is mandatory');
    END IF;

    IF p_customer_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'customer_id is mandatory');
    END IF;

    -- 2. Tenant boundary check
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Unauthorized tenant access');
    END IF;

    -- 3. Customer existence check (zero mutation - reads only)
    SELECT customer_id, customer_name, customer_phone, customer_email, status
    INTO   v_customer
    FROM   app.customers
    WHERE  customer_id = p_customer_id
      AND  company_id  = p_company_id
    LIMIT  1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Customer not found in company: %s', p_customer_id));
    END IF;

    IF LOWER(COALESCE(v_customer.status, 'active')) <> 'active' THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Customer "%s" is inactive', v_customer.customer_name));
    END IF;

    -- 4. Membership plan verification & status check
    SELECT membership_id, plan_name, price, duration, status
    INTO   v_plan
    FROM   app.memberships
    WHERE  membership_id = p_membership_id
      AND  company_id    = p_company_id
    LIMIT  1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Membership plan not found in company: %s', p_membership_id));
    END IF;

    IF LOWER(COALESCE(v_plan.status, '')) <> 'active' THEN
        RETURN jsonb_build_object('valid', false, 'reason', format('Membership plan "%s" is not active', v_plan.plan_name));
    END IF;

    -- 5. Duplicate active membership prevention guard
    SELECT purchase_id, plan_name, expiry_date, status
    INTO   v_active_purchase
    FROM   app.membership_purchases
    WHERE  customer_id   = p_customer_id
      AND  membership_id = p_membership_id
      AND  company_id    = p_company_id
      AND  status        = 'active'
      AND  (expiry_date IS NULL OR expiry_date >= v_purchase_date)
    ORDER BY created_at DESC
    LIMIT  1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', format('Customer "%s" already has an active membership for plan "%s" (expires: %s)',
                v_customer.customer_name,
                v_plan.plan_name,
                COALESCE(v_active_purchase.expiry_date::text, 'No Expiry')
            )
        );
    END IF;

    -- 6. Expiry date calculation
    v_duration := COALESCE(v_plan.duration, 12);
    IF v_duration <= 0 THEN
        v_duration := 12;
    END IF;
    v_expiry_date := (v_purchase_date + (v_duration || ' months')::interval)::date;

    -- 7. Authoritative pricing & discount clamping
    v_catalog_price := COALESCE(v_plan.price, 0);
    v_discount      := ROUND(GREATEST(0, LEAST(COALESCE(p_discount_amount, 0), v_catalog_price)), 2);
    v_final         := GREATEST(0, v_catalog_price - v_discount);

    -- 8. Validated response payload
    RETURN jsonb_build_object(
        'valid',            true,
        'membership_id',    v_plan.membership_id,
        'plan_name',        v_plan.plan_name,
        'catalog_price',    v_catalog_price,
        'duration',         v_duration,
        'purchase_date',    v_purchase_date,
        'expiry_date',      v_expiry_date,
        'discount_type',    NULLIF(TRIM(COALESCE(p_discount_type, '')), ''),
        'discount_name',    NULLIF(TRIM(COALESCE(p_discount_name, '')), ''),
        'discount_id',      p_discount_id,
        'discount_amount',  v_discount,
        'final_amount',     v_final,
        'customer_id',      v_customer.customer_id,
        'customer_name',    v_customer.customer_name,
        'customer_phone',   v_customer.customer_phone,
        'customer_email',   v_customer.customer_email
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MASTER RPC: app.assign_membership_atomic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.assign_membership_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid,
    p_customer_phone        text    DEFAULT NULL,
    p_customer_name         text    DEFAULT NULL,
    p_customer_email        text    DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_id           uuid    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT 0,
    p_final_amount          numeric DEFAULT NULL,
    p_assigned_by_user_id   uuid    DEFAULT NULL,
    p_assigned_by_user_name text    DEFAULT 'System',
    p_notes                 text    DEFAULT NULL,
    p_purchase_id           uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Resolved staff audit
    v_resolved_staff_id     uuid;
    v_resolved_staff_name   text;
    v_staff_rec             record;

    -- Validated payment method
    v_clean_method          text;

    -- Operational IDs
    v_purchase_id           uuid;
    v_payment_id            uuid;

    -- Validation result
    v_val                   jsonb;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS & VAULT DOOR
    -- =========================================================================

    -- 1.1 Input Preconditions
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory';
    END IF;

    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory';
    END IF;

    IF p_membership_id IS NULL THEN
        RAISE EXCEPTION 'membership_id is mandatory';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_id is mandatory';
    END IF;

    -- 1.2 Tenant Boundary Enforcement
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'assign_membership');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    -- 1.6 Authoritative Staff Resolution & Authorization
    IF auth.uid() IS NOT NULL THEN
        v_resolved_staff_id := auth.uid();
    ELSE
        v_resolved_staff_id := p_assigned_by_user_id;
    END IF;

    v_resolved_staff_name := TRIM(COALESCE(p_assigned_by_user_name, ''));

    IF v_resolved_staff_id IS NOT NULL THEN
        SELECT user_id, name INTO v_staff_rec
        FROM shared.users
        WHERE user_id = v_resolved_staff_id AND company_id = p_company_id;

        IF FOUND THEN
            IF v_resolved_staff_name = '' OR LOWER(v_resolved_staff_name) = 'system' THEN
                v_resolved_staff_name := v_staff_rec.name;
            END IF;
        ELSE
            SELECT staff_id, staff_name, branch_id INTO v_staff_rec
            FROM app.staff
            WHERE staff_id = v_resolved_staff_id AND company_id = p_company_id;

            IF FOUND THEN
                IF v_staff_rec.branch_id IS DISTINCT FROM p_branch_id THEN
                    RAISE EXCEPTION 'Staff % is not authorized or active for branch %', v_resolved_staff_id, p_branch_id;
                END IF;
                IF v_resolved_staff_name = '' OR LOWER(v_resolved_staff_name) = 'system' THEN
                    v_resolved_staff_name := v_staff_rec.staff_name;
                END IF;
            END IF;
        END IF;
    END IF;

    IF v_resolved_staff_name = '' THEN
        v_resolved_staff_name := 'System';
    END IF;

    -- 1.7 Strict Payment Method Validation (No silent fallback)
    v_clean_method := LOWER(TRIM(COALESCE(p_payment_method, '')));
    IF v_clean_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: "%". Supported methods are cash, upi, card.', p_payment_method;
    END IF;

    -- 1.8 Duplicate Purchase ID Guard
    IF p_purchase_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM app.membership_purchases WHERE purchase_id = p_purchase_id) THEN
            RAISE EXCEPTION 'Duplicate purchase_id: %', p_purchase_id;
        END IF;
        v_purchase_id := p_purchase_id;
    ELSE
        v_purchase_id := gen_random_uuid();
    END IF;

    -- =========================================================================
    -- SECTION 2: CORE MEMBERSHIP ENROLLMENT (Exactly 3 Steps)
    -- =========================================================================

    -- ── Step 1: Verification, Validation & Data Preparation ──────────────────
    v_val := app.validate_assign_membership(
        p_company_id      => p_company_id,
        p_branch_id       => p_branch_id,
        p_membership_id   => p_membership_id,
        p_customer_id     => p_customer_id,
        p_purchase_date   => p_purchase_date,
        p_discount_type   => p_discount_type,
        p_discount_name   => p_discount_name,
        p_discount_id     => p_discount_id,
        p_discount_amount => p_discount_amount,
        p_final_amount    => p_final_amount
    );

    IF NOT (v_val->>'valid')::boolean THEN
        RAISE EXCEPTION 'Membership assignment validation failed: %', v_val->>'reason';
    END IF;

    -- ── Step 2: Atomic Write 1 — app.membership_purchases ────────────────────
    INSERT INTO app.membership_purchases (
        purchase_id,
        company_id,
        branch_id,
        customer_id,
        customer_name,
        membership_id,
        plan_name,
        price,
        duration,
        purchase_date,
        expiry_date,
        status,
        payment_method,
        payment_status,
        assigned_by_user_id,
        assigned_by_user_name,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_purchase_id,
        p_company_id,
        p_branch_id,
        p_customer_id,
        v_val->>'customer_name',
        p_membership_id,
        v_val->>'plan_name',
        (v_val->>'catalog_price')::numeric,
        (v_val->>'duration')::bigint,
        (v_val->>'purchase_date')::date,
        (v_val->>'expiry_date')::date,
        'active',
        v_clean_method,
        'paid',
        v_resolved_staff_id,
        v_resolved_staff_name,
        NULLIF(v_val->>'discount_type', ''),
        NULLIF(v_val->>'discount_name', ''),
        (v_val->>'discount_amount')::numeric,
        (v_val->>'final_amount')::numeric,
        NULLIF(TRIM(p_notes), ''),
        NOW(),
        NOW()
    );

    -- ── Step 3: Atomic Write 2 — app.business_transactions ───────────────────
    INSERT INTO app.business_transactions (
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        final_amount,
        currency,
        payment_method,
        status,
        notes,
        created_by,
        created_by_user_name,
        paid_at,
        created_at,
        updated_at,
        discount_type,
        discount_name,
        discount_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        v_purchase_id,
        'membership',
        (v_val->>'final_amount')::numeric,
        (v_val->>'final_amount')::numeric,
        'INR',
        v_clean_method,
        'paid',
        COALESCE(NULLIF(TRIM(p_notes), ''), 'Membership Enrollment: ' || (v_val->>'plan_name')),
        v_resolved_staff_id,
        v_resolved_staff_name,
        NOW(),
        NOW(),
        NOW(),
        NULLIF(v_val->>'discount_type', ''),
        NULLIF(v_val->>'discount_name', ''),
        (v_val->>'discount_amount')::numeric
    )
    RETURNING payment_id INTO v_payment_id;

    -- Return standardized authoritative response
    RETURN jsonb_build_object(
        'success',          true,
        'purchase_id',      v_purchase_id,
        'payment_id',       v_payment_id,
        'customer_id',      p_customer_id,
        'customer_name',    v_val->>'customer_name',
        'plan_name',        v_val->>'plan_name',
        'purchase_date',    v_val->>'purchase_date',
        'expiry_date',      v_val->>'expiry_date',
        'catalog_price',    (v_val->>'catalog_price')::numeric,
        'discount_amount',  (v_val->>'discount_amount')::numeric,
        'final_amount',     (v_val->>'final_amount')::numeric
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PUBLIC POSTGREST WRAPPERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_assign_membership(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid,
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_id           uuid    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT 0,
    p_final_amount          numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.validate_assign_membership(
        p_company_id,
        p_branch_id,
        p_membership_id,
        p_customer_id,
        p_purchase_date,
        p_discount_type,
        p_discount_name,
        p_discount_id,
        p_discount_amount,
        p_final_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_membership_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid,
    p_customer_phone        text    DEFAULT NULL,
    p_customer_name         text    DEFAULT NULL,
    p_customer_email        text    DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_id           uuid    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT 0,
    p_final_amount          numeric DEFAULT NULL,
    p_assigned_by_user_id   uuid    DEFAULT NULL,
    p_assigned_by_user_name text    DEFAULT 'System',
    p_notes                 text    DEFAULT NULL,
    p_purchase_id           uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.assign_membership_atomic(
        p_company_id,
        p_branch_id,
        p_membership_id,
        p_customer_id,
        p_customer_phone,
        p_customer_name,
        p_customer_email,
        p_payment_method,
        p_purchase_date,
        p_discount_type,
        p_discount_name,
        p_discount_id,
        p_discount_amount,
        p_final_amount,
        p_assigned_by_user_id,
        p_assigned_by_user_name,
        p_notes,
        p_purchase_id
    );
END;
$$;

-- Alias matching assign_membership
CREATE OR REPLACE FUNCTION public.assign_membership(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid,
    p_customer_phone        text    DEFAULT NULL,
    p_customer_name         text    DEFAULT NULL,
    p_customer_email        text    DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_id           uuid    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT 0,
    p_final_amount          numeric DEFAULT NULL,
    p_assigned_by_user_id   uuid    DEFAULT NULL,
    p_assigned_by_user_name text    DEFAULT 'System',
    p_notes                 text    DEFAULT NULL,
    p_purchase_id           uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.assign_membership_atomic(
        p_company_id,
        p_branch_id,
        p_membership_id,
        p_customer_id,
        p_customer_phone,
        p_customer_name,
        p_customer_email,
        p_payment_method,
        p_purchase_date,
        p_discount_type,
        p_discount_name,
        p_discount_id,
        p_discount_amount,
        p_final_amount,
        p_assigned_by_user_id,
        p_assigned_by_user_name,
        p_notes,
        p_purchase_id
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACL LOCKDOWN
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_membership(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_membership(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role;
