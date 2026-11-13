-- Migration: 20261113000010_assign_membership_add_discount_validation.sql
-- Description: Adds discount validation to assign_membership_atomic Section 2:
--   1. Strips discount params from app.validate_assign_membership (5 params only).
--      validate_assign_membership now purely validates: plan, customer, duplicate guard,
--      expiry calc, and catalog price. Zero discount logic.
--   2. Updates app.assign_membership_atomic Section 2 from 3 steps to 5 steps:
--      Step 1: validate_assign_membership (plan + customer validation)
--      Step 2: validate_discount (authoritative DB-level discount check — conditional)
--      Step 3: INSERT app.membership_purchases (atomic)
--      Step 4: INSERT app.business_transactions (atomic)
--      Step 5: INSERT app.discount_usages (atomic — conditional, only if discount used)
--   3. Updates public schema wrappers to match new validate_assign_membership signature.
--   4. ACL lockdown: drops old 10-param overload grants, issues fresh grants on new 5-param overloads.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP OLD 10-PARAM validate_assign_membership (discount params removed)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS app.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.validate_assign_membership(uuid, uuid, uuid, uuid, date, text, text, uuid, numeric, numeric) CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REBUILD app.validate_assign_membership (5 params — plan + customer only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.validate_assign_membership(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_membership_id     uuid,
    p_customer_id       uuid,
    p_purchase_date     date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_customer        record;
    v_plan            record;
    v_active_purchase record;
    v_purchase_date   date   := COALESCE(p_purchase_date, CURRENT_DATE);
    v_duration        bigint;
    v_expiry_date     date;
    v_catalog_price   numeric;
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

    -- 3. Customer existence check (read-only)
    SELECT customer_id, customer_name, customer_phone, customer_email, status
    INTO   v_customer
    FROM   app.customers
    WHERE  customer_id = p_customer_id
      AND  company_id  = p_company_id
    LIMIT  1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason',
            format('Customer not found in company: %s', p_customer_id));
    END IF;

    IF LOWER(COALESCE(v_customer.status, 'active')) <> 'active' THEN
        RETURN jsonb_build_object('valid', false, 'reason',
            format('Customer "%s" is inactive', v_customer.customer_name));
    END IF;

    -- 4. Membership plan verification & status check
    SELECT membership_id, plan_name, price, duration, status
    INTO   v_plan
    FROM   app.memberships
    WHERE  membership_id = p_membership_id
      AND  company_id    = p_company_id
    LIMIT  1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason',
            format('Membership plan not found in company: %s', p_membership_id));
    END IF;

    IF LOWER(COALESCE(v_plan.status, '')) <> 'active' THEN
        RETURN jsonb_build_object('valid', false, 'reason',
            format('Membership plan "%s" is not active', v_plan.plan_name));
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
            'valid',  false,
            'reason', format(
                'Customer "%s" already has an active membership for plan "%s" (expires: %s)',
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

    -- 7. Catalog price (no discount logic — discount is handled by validate_discount in Step 2)
    v_catalog_price := COALESCE(v_plan.price, 0);

    -- 8. Validated response payload (plan + customer fields only)
    RETURN jsonb_build_object(
        'valid',          true,
        'membership_id',  v_plan.membership_id,
        'plan_name',      v_plan.plan_name,
        'catalog_price',  v_catalog_price,
        'duration',       v_duration,
        'purchase_date',  v_purchase_date,
        'expiry_date',    v_expiry_date,
        'customer_id',    v_customer.customer_id,
        'customer_name',  v_customer.customer_name,
        'customer_phone', v_customer.customer_phone,
        'customer_email', v_customer.customer_email
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REBUILD app.assign_membership_atomic — SECTION 2: NOW 5 STEPS
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

    -- Step 1: Plan + customer validation result
    v_val                   jsonb;

    -- Resolved pricing (from Step 1 & Step 2)
    v_catalog_price         numeric;
    v_discount_amount       numeric := 0;
    v_final_amount          numeric;

    -- Step 2: Discount validation result & resolved fields
    v_disc                  jsonb;
    v_disc_code_or_id       text;
    v_disc_type_resolved    text;
    v_disc_id_resolved      uuid;
    v_disc_name_resolved    text;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS & VAULT DOOR (unchanged)
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
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %',
            p_company_id, p_branch_id;
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
                    RAISE EXCEPTION 'Staff % is not authorized or active for branch %',
                        v_resolved_staff_id, p_branch_id;
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
        RAISE EXCEPTION 'Invalid payment method: "%". Supported methods are cash, upi, card.',
            p_payment_method;
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
    -- SECTION 2: CORE MEMBERSHIP ENROLLMENT (5 Steps)
    -- =========================================================================

    -- ── Step 1: Plan + Customer Verification & Validation ────────────────────
    -- Validates: plan exists & is active, customer exists & is active,
    -- duplicate active membership guard, expiry date calculation, catalog price.
    -- No discount logic here — discount is handled exclusively in Step 2.
    v_val := app.validate_assign_membership(
        p_company_id    => p_company_id,
        p_branch_id     => p_branch_id,
        p_membership_id => p_membership_id,
        p_customer_id   => p_customer_id,
        p_purchase_date => p_purchase_date
    );

    IF NOT (v_val->>'valid')::boolean THEN
        RAISE EXCEPTION 'Membership assignment validation failed: %', v_val->>'reason';
    END IF;

    -- Extract catalog price from Step 1 result
    v_catalog_price  := (v_val->>'catalog_price')::numeric;
    v_discount_amount := 0;
    v_final_amount   := v_catalog_price;

    -- ── Step 2: Authoritative Discount Validation (conditional) ──────────────
    -- Fires ONLY when a discount type is provided.
    -- Calls app.validate_discount to verify the discount is real, active,
    -- not exhausted, and applicable to 'membership' transactions.
    -- The authoritative discount_amount comes from this step — not from the caller.
    IF p_discount_type IS NOT NULL AND TRIM(COALESCE(p_discount_type, '')) <> '' THEN

        -- Resolve p_code_or_id:
        --   For 'coupon' type: p_discount_name holds the coupon code string
        --   For 'offer' type:  p_discount_id holds the offer UUID
        --   Fallback: p_discount_id as text
        v_disc_code_or_id := COALESCE(
            NULLIF(TRIM(COALESCE(p_discount_name, '')), ''),
            COALESCE(p_discount_id::text, ''),
            ''
        );

        v_disc := app.validate_discount(
            p_company_id      => p_company_id,
            p_branch_id       => p_branch_id,
            p_discount_type   => p_discount_type,
            p_code_or_id      => v_disc_code_or_id,
            p_bill_amount     => v_catalog_price,
            p_customer_id     => p_customer_id,
            p_applicable_type => 'membership'
        );

        IF NOT (v_disc->>'valid')::boolean THEN
            RAISE EXCEPTION 'Discount validation failed: %', v_disc->>'reason';
        END IF;

        -- Extract authoritative values from validate_discount result
        v_discount_amount     := GREATEST(0, COALESCE((v_disc->>'discount_amount')::numeric, 0));
        v_final_amount        := GREATEST(0, v_catalog_price - v_discount_amount);
        v_disc_type_resolved  := v_disc->>'discount_type';
        v_disc_id_resolved    := (v_disc->>'discount_id')::uuid;
        v_disc_name_resolved  := v_disc->>'discount_name';
    END IF;

    -- ── Step 3: Atomic INSERT — app.membership_purchases ─────────────────────
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
        v_catalog_price,
        (v_val->>'duration')::bigint,
        (v_val->>'purchase_date')::date,
        (v_val->>'expiry_date')::date,
        'active',
        v_clean_method,
        'paid',
        v_resolved_staff_id,
        v_resolved_staff_name,
        NULLIF(v_disc_type_resolved, ''),
        NULLIF(v_disc_name_resolved, ''),
        v_discount_amount,
        v_final_amount,
        NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        NOW(),
        NOW()
    );

    -- ── Step 4: Atomic INSERT — app.business_transactions ────────────────────
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
        v_final_amount,
        v_final_amount,
        'INR',
        v_clean_method,
        'paid',
        COALESCE(
            NULLIF(TRIM(COALESCE(p_notes, '')), ''),
            'Membership Enrollment: ' || (v_val->>'plan_name')
        ),
        v_resolved_staff_id,
        v_resolved_staff_name,
        NOW(),
        NOW(),
        NOW(),
        NULLIF(v_disc_type_resolved, ''),
        NULLIF(v_disc_name_resolved, ''),
        v_discount_amount
    )
    RETURNING payment_id INTO v_payment_id;

    -- ── Step 5: Atomic INSERT — app.discount_usages (conditional) ────────────
    -- Fires ONLY when a discount was actually applied (discount_amount > 0
    -- and a valid discount_id was resolved from Step 2).
    IF v_discount_amount > 0 AND v_disc_id_resolved IS NOT NULL THEN
        INSERT INTO app.discount_usages (
            company_id,
            branch_id,
            customer_id,
            reference_type,
            reference_id,
            payment_id,
            discount_type,
            discount_id,
            membership_plan_id,
            discount_name,
            discount_amount,
            status,
            staff_id,
            staff_name,
            used_at,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            p_branch_id,
            p_customer_id,
            'membership',
            v_purchase_id,
            v_payment_id,
            v_disc_type_resolved,
            v_disc_id_resolved,
            p_membership_id,
            v_disc_name_resolved,
            v_discount_amount,
            'applied',
            v_resolved_staff_id,
            v_resolved_staff_name,
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

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
        'catalog_price',    v_catalog_price,
        'discount_amount',  v_discount_amount,
        'final_amount',     v_final_amount
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REBUILD PUBLIC WRAPPERS (match new signatures)
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. public.validate_assign_membership (5 params — mirrors new app.*)
CREATE OR REPLACE FUNCTION public.validate_assign_membership(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_membership_id     uuid,
    p_customer_id       uuid,
    p_purchase_date     date DEFAULT CURRENT_DATE
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
        p_purchase_date
    );
END;
$$;

-- 4b. public.assign_membership_atomic (18 params — unchanged)
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

-- 4c. public.assign_membership alias (18 params — unchanged)
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
-- 5. ACL LOCKDOWN
-- ─────────────────────────────────────────────────────────────────────────────

-- app.validate_assign_membership (new 5-param signature)
REVOKE ALL ON FUNCTION app.validate_assign_membership(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.validate_assign_membership(uuid, uuid, uuid, uuid, date) TO authenticated, service_role, postgres;

-- app.assign_membership_atomic (18 params — unchanged signature)
REVOKE ALL ON FUNCTION app.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role, postgres;

-- public.validate_assign_membership (new 5-param signature)
REVOKE ALL ON FUNCTION public.validate_assign_membership(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_assign_membership(uuid, uuid, uuid, uuid, date) TO authenticated, service_role, postgres;

-- public.assign_membership_atomic (18 params — unchanged signature)
REVOKE ALL ON FUNCTION public.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_membership_atomic(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role, postgres;

-- public.assign_membership alias (18 params — unchanged signature)
REVOKE ALL ON FUNCTION public.assign_membership(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_membership(uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, uuid, numeric, numeric, uuid, text, text, uuid) TO authenticated, service_role, postgres;

