-- Migration: 20261112000008_fix_assign_membership_atomic_schema.sql
-- Description: Fixes app.assign_membership_atomic to:
--   1. Check customer, and ONLY insert into app.customers if customer does not exist.
--      Does NOT update existing customers.
--   2. Check if customer already has an active membership for the selected plan in app.membership_purchases.
--      Prevents duplicate active memberships.
--   3. Writes 1 row into app.membership_purchases (fixing legacy customer_memberships reference).
--   4. Writes 1 row directly into app.business_transactions (fixing legacy payments reference).
--   5. Tracks discounts in app.discount_usages if discount applied.
--   6. Enforces authoritative staff resolution (auth.uid() fallback, user name resolution).

CREATE OR REPLACE FUNCTION app.assign_membership_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_membership_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_phone text DEFAULT ''::text,
    p_customer_name text DEFAULT 'Customer'::text,
    p_customer_email text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_purchase_date date DEFAULT CURRENT_DATE,
    p_discount_type text DEFAULT NULL::text,
    p_discount_name text DEFAULT NULL::text,
    p_discount_id uuid DEFAULT NULL::uuid,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount numeric DEFAULT 0,
    p_assigned_by_user_id uuid DEFAULT NULL::uuid,
    p_assigned_by_user_name text DEFAULT 'System'::text,
    p_notes text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Membership Plan info
    v_plan_name             text;
    v_plan_price            numeric;
    v_plan_duration         bigint;
    v_plan_status           text;

    -- Customer info
    v_customer_id           uuid    := p_customer_id;
    v_customer_name         text    := TRIM(COALESCE(p_customer_name, ''));
    v_customer_phone        text    := TRIM(COALESCE(p_customer_phone, ''));

    -- Transaction IDs & Dates
    v_purchase_id           uuid    := gen_random_uuid();
    v_payment_id            uuid;
    v_purchase_date         date    := COALESCE(p_purchase_date, CURRENT_DATE);
    v_expiry_date           date;
    v_payment_method        text;

    -- Discount calculations
    v_discount_type         text;
    v_discount_name         text;
    v_resolved_discount_id  uuid    := p_discount_id;
    v_server_discount       numeric := 0;
    v_server_final          numeric := 0;
    v_coupon_rec            record;
    v_offer_rec             record;
    v_coupon_usage_count    bigint  := 0;
    v_cust_usage_count      bigint  := 0;
BEGIN
    -- ── TENANT BOUNDARY ───────────────────────────────────────────────────────
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- ── GATES ─────────────────────────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'assign_membership');
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    -- ── AUTHORITATIVE STAFF RESOLUTION ────────────────────────────────────────
    IF p_assigned_by_user_id IS NULL THEN
        p_assigned_by_user_id := auth.uid();
    END IF;

    IF (p_assigned_by_user_name IS NULL OR TRIM(p_assigned_by_user_name) = '' OR LOWER(TRIM(p_assigned_by_user_name)) = 'system') AND p_assigned_by_user_id IS NOT NULL THEN
        SELECT name INTO p_assigned_by_user_name FROM shared.users WHERE user_id = p_assigned_by_user_id;
        IF p_assigned_by_user_name IS NULL THEN
            SELECT staff_name INTO p_assigned_by_user_name FROM app.staff WHERE staff_id = p_assigned_by_user_id;
        END IF;
        IF p_assigned_by_user_name IS NULL THEN
            p_assigned_by_user_name := 'System';
        END IF;
    END IF;

    -- ── 1. Plan Verification ──────────────────────────────────────────────────
    SELECT plan_name, price, duration, status
    INTO   v_plan_name, v_plan_price, v_plan_duration, v_plan_status
    FROM   app.memberships
    WHERE  membership_id = p_membership_id
      AND  company_id    = p_company_id
    LIMIT  1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership plan not found in this company.';
    END IF;

    IF LOWER(COALESCE(v_plan_status, '')) <> 'active' THEN
        RAISE EXCEPTION 'Membership plan "%" is not active.', v_plan_name;
    END IF;

    -- ── 2. Payment Method Normalization ───────────────────────────────────────
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- ── 3. Customer Check & Create (DO NOT EDIT IF EXISTS) ────────────────────
    IF v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
        v_customer_phone := regexp_replace(v_customer_phone, '[^0-9]', '', 'g');
    END IF;

    -- Check if customer exists by ID
    IF v_customer_id IS NOT NULL THEN
        SELECT customer_id, customer_name, customer_phone
        INTO   v_customer_id, v_customer_name, v_customer_phone
        FROM   app.customers
        WHERE  customer_id = v_customer_id
          AND  company_id  = p_company_id
        LIMIT  1;
    END IF;

    -- Check if customer exists by phone
    IF v_customer_id IS NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
        SELECT customer_id, customer_name, customer_phone
        INTO   v_customer_id, v_customer_name, v_customer_phone
        FROM   app.customers
        WHERE  company_id = p_company_id
          AND  regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = v_customer_phone
        LIMIT  1;
    END IF;

    -- If customer does NOT exist: insert new customer
    IF v_customer_id IS NULL THEN
        v_customer_id := gen_random_uuid();
        IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
            v_customer_name := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Customer');
        END IF;

        INSERT INTO app.customers (
            customer_id,
            company_id,
            branch_id,
            customer_name,
            customer_phone,
            customer_email,
            status,
            total_spent,
            created_at,
            updated_at
        ) VALUES (
            v_customer_id,
            p_company_id,
            p_branch_id,
            v_customer_name,
            v_customer_phone,
            NULLIF(TRIM(p_customer_email), ''),
            'active',
            0,
            NOW(),
            NOW()
        );
    END IF;
    -- Note: If customer already exists, we intentionally DO NOT edit/update the customer.

    -- ── 4. Duplicate Active Membership Guard ──────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM app.membership_purchases
        WHERE  customer_id   = v_customer_id
          AND  membership_id  = p_membership_id
          AND  company_id    = p_company_id
          AND  status        = 'active'
          AND  (expiry_date IS NULL OR expiry_date >= v_purchase_date)
    ) THEN
        RAISE EXCEPTION 'Customer already has an active membership for this plan.';
    END IF;

    -- ── 5. Expiry Date Calculation ────────────────────────────────────────────
    IF COALESCE(v_plan_duration, 0) > 0 THEN
        v_expiry_date := (v_purchase_date + (v_plan_duration || ' months')::interval)::date;
    ELSE
        v_expiry_date := (v_purchase_date + '12 months'::interval)::date;
    END IF;

    -- ── 6. Server-Side Authoritative Discount Validation ──────────────────────
    v_discount_type := LOWER(COALESCE(TRIM(p_discount_type), ''));
    v_discount_name := TRIM(COALESCE(p_discount_name, ''));

    IF v_discount_type = 'coupon' AND (v_discount_name <> '' OR p_discount_id IS NOT NULL) THEN
        SELECT coupon_id, coupon_code, discount_type, discount_value, min_bill_amount, valid_from, valid_to, status, total_usage_limit, usage_per_customer
        INTO   v_coupon_rec
        FROM   app.coupons
        WHERE  (coupon_id = p_discount_id OR LOWER(coupon_code) = LOWER(v_discount_name))
          AND  company_id = p_company_id
        LIMIT  1;

        IF FOUND AND LOWER(COALESCE(v_coupon_rec.status, 'active')) = 'active'
           AND (v_coupon_rec.valid_from IS NULL OR v_purchase_date >= v_coupon_rec.valid_from)
           AND (v_coupon_rec.valid_to IS NULL OR v_purchase_date <= v_coupon_rec.valid_to)
           AND (v_coupon_rec.min_bill_amount IS NULL OR v_plan_price >= v_coupon_rec.min_bill_amount) THEN

            v_resolved_discount_id := v_coupon_rec.coupon_id;
            v_discount_name := COALESCE(NULLIF(v_discount_name, ''), v_coupon_rec.coupon_code);

            IF v_coupon_rec.total_usage_limit IS NOT NULL THEN
                SELECT COUNT(*) INTO v_coupon_usage_count
                FROM app.discount_usages
                WHERE discount_id = v_coupon_rec.coupon_id
                  AND status = 'applied';

                IF v_coupon_usage_count >= v_coupon_rec.total_usage_limit THEN
                    RAISE EXCEPTION 'Coupon code % has reached its maximum global usage limit', v_discount_name;
                END IF;
            END IF;

            IF v_coupon_rec.usage_per_customer IS NOT NULL AND v_customer_id IS NOT NULL THEN
                SELECT COUNT(*) INTO v_cust_usage_count
                FROM app.discount_usages
                WHERE discount_id = v_coupon_rec.coupon_id
                  AND customer_id = v_customer_id
                  AND status = 'applied';

                IF v_cust_usage_count >= v_coupon_rec.usage_per_customer THEN
                    RAISE EXCEPTION 'You have reached the maximum allowed uses for coupon %', v_discount_name;
                END IF;
            END IF;

            IF LOWER(v_coupon_rec.discount_type) = 'percentage' THEN
                v_server_discount := ROUND((v_plan_price * v_coupon_rec.discount_value) / 100.0, 2);
            ELSE
                v_server_discount := LEAST(v_coupon_rec.discount_value, v_plan_price);
            END IF;
        END IF;

    ELSIF v_discount_type = 'offer' AND (v_discount_name <> '' OR p_discount_id IS NOT NULL) THEN
        SELECT offer_id, offer_name, discount_type, discount_value, min_bill_amount, valid_from, valid_to, status
        INTO   v_offer_rec
        FROM   app.offers
        WHERE  (offer_id = p_discount_id OR LOWER(offer_name) = LOWER(v_discount_name))
          AND  company_id = p_company_id
        LIMIT  1;

        IF FOUND AND LOWER(COALESCE(v_offer_rec.status, 'active')) = 'active'
           AND (v_offer_rec.valid_from IS NULL OR v_purchase_date >= v_offer_rec.valid_from)
           AND (v_offer_rec.valid_to IS NULL OR v_purchase_date <= v_offer_rec.valid_to)
           AND (v_offer_rec.min_bill_amount IS NULL OR v_plan_price >= v_offer_rec.min_bill_amount) THEN

            v_resolved_discount_id := v_offer_rec.offer_id;
            v_discount_name := COALESCE(NULLIF(v_discount_name, ''), v_offer_rec.offer_name);

            IF LOWER(v_offer_rec.discount_type) = 'percentage' THEN
                v_server_discount := ROUND((v_plan_price * v_offer_rec.discount_value) / 100.0, 2);
            ELSE
                v_server_discount := LEAST(v_offer_rec.discount_value, v_plan_price);
            END IF;
        END IF;

    ELSIF v_discount_type = 'manual' AND COALESCE(p_discount_amount, 0) > 0 THEN
        v_server_discount := LEAST(COALESCE(p_discount_amount, 0), v_plan_price);
    END IF;

    v_server_discount := GREATEST(0, LEAST(v_server_discount, v_plan_price));
    v_server_final    := GREATEST(0, v_plan_price - v_server_discount);

    -- ── 7. Atomic Write 1: app.membership_purchases ───────────────────────────
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
        v_customer_id,
        v_customer_name,
        p_membership_id,
        v_plan_name,
        v_plan_price,
        v_plan_duration,
        v_purchase_date,
        v_expiry_date,
        'active',
        v_payment_method,
        'paid',
        p_assigned_by_user_id,
        p_assigned_by_user_name,
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_server_discount,
        v_server_final,
        NULLIF(TRIM(p_notes), ''),
        NOW(),
        NOW()
    );

    -- ── 8. Atomic Write 2: app.business_transactions ──────────────────────────
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
        discount_type,
        discount_name,
        discount_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        v_purchase_id,
        'membership',
        v_server_final,
        v_server_final,
        'INR',
        v_payment_method,
        'paid',
        COALESCE(NULLIF(TRIM(p_notes), ''), 'Membership Enrollment: ' || v_plan_name),
        p_assigned_by_user_id,
        p_assigned_by_user_name,
        NOW(),
        NOW(),
        NULLIF(v_discount_type, ''),
        NULLIF(v_discount_name, ''),
        v_server_discount
    ) RETURNING payment_id INTO v_payment_id;

    -- ── 9. Track Discount Usages (if discount applied) ─────────────────────────
    IF v_server_discount > 0 THEN
        INSERT INTO app.discount_usages (
            company_id,
            branch_id,
            customer_id,
            staff_id,
            staff_name,
            reference_type,
            reference_id,
            payment_id,
            membership_plan_id,
            discount_type,
            discount_id,
            discount_name,
            discount_amount,
            status,
            used_at,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            p_branch_id,
            v_customer_id,
            p_assigned_by_user_id,
            p_assigned_by_user_name,
            'membership',
            v_purchase_id,
            v_payment_id,
            p_membership_id,
            NULLIF(v_discount_type, ''),
            v_resolved_discount_id,
            v_discount_name,
            v_server_discount,
            'applied',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- ── 10. Return Result Payload ─────────────────────────────────────────────
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
        'final_amount',     v_server_final
    );
END;
$$;

-- ============================================================================
-- Public Wrapper for PostgREST
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_membership_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_membership_id uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_phone text DEFAULT ''::text,
    p_customer_name text DEFAULT 'Customer'::text,
    p_customer_email text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'::text,
    p_purchase_date date DEFAULT CURRENT_DATE,
    p_discount_type text DEFAULT NULL::text,
    p_discount_name text DEFAULT NULL::text,
    p_discount_id uuid DEFAULT NULL::uuid,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount numeric DEFAULT 0,
    p_assigned_by_user_id uuid DEFAULT NULL::uuid,
    p_assigned_by_user_name text DEFAULT 'System'::text,
    p_notes text DEFAULT ''::text
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
        p_notes
    );
END;
$$;

-- ============================================================================
-- Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION app.assign_membership_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.assign_membership_atomic TO authenticated, service_role, anon;
