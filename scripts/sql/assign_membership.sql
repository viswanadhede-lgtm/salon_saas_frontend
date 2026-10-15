-- ============================================================================
-- RPC FUNCTION: public.assign_membership
-- Purpose: Atomically validate plan, ensure customer exists, prevent duplicates,
--          create membership purchase, log business transaction, and update customer spend.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_membership(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid    DEFAULT NULL,
    p_customer_phone        text    DEFAULT NULL,
    p_customer_name         text    DEFAULT NULL,
    p_customer_email        text    DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_purchase_date         date    DEFAULT CURRENT_DATE,
    p_discount_type         text    DEFAULT NULL,
    p_discount_name         text    DEFAULT NULL,
    p_discount_amount       numeric DEFAULT NULL,
    p_final_amount          numeric DEFAULT NULL,
    p_assigned_by_user_id   uuid    DEFAULT NULL,
    p_assigned_by_user_name text    DEFAULT NULL,
    p_notes                 text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan_name         text;
    v_plan_price        numeric;
    v_plan_duration     bigint;
    v_plan_status       text;

    v_customer_id       uuid := p_customer_id;
    v_customer_name     text := TRIM(p_customer_name);
    v_customer_phone    text := TRIM(p_customer_phone);

    v_purchase_id       uuid := gen_random_uuid();
    v_payment_id        uuid;
    v_purchase_date     date := COALESCE(p_purchase_date, CURRENT_DATE);
    v_expiry_date       date;
    v_final_amount      numeric;
    v_discount_amount   numeric;
    v_payment_method    text;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. READ & VALIDATE PLAN (public.memberships)
    -- -------------------------------------------------------------------------
    SELECT plan_name, price, duration, status
    INTO v_plan_name, v_plan_price, v_plan_duration, v_plan_status
    FROM public.memberships
    WHERE (membership_id = p_membership_id OR id = p_membership_id)
      AND (company_id = p_company_id OR company_id IS NULL)
    LIMIT 1;

    IF v_plan_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan not found.');
    END IF;

    IF v_plan_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected membership plan is inactive.');
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. READ & CONDITIONAL WRITE TO CUSTOMER (public.customers)
    -- -------------------------------------------------------------------------
    -- A. If customer_id provided, verify customer exists
    IF v_customer_id IS NOT NULL THEN
        SELECT customer_name, customer_phone INTO v_customer_name, v_customer_phone
        FROM public.customers
        WHERE customer_id = v_customer_id;
    END IF;

    -- B. If not found by ID or ID not passed, check by phone
    IF v_customer_id IS NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
        SELECT customer_id, customer_name INTO v_customer_id, v_customer_name
        FROM public.customers
        WHERE (company_id = p_company_id OR company_id IS NULL)
          AND REPLACE(customer_phone, ' ', '') = REPLACE(v_customer_phone, ' ', '')
        LIMIT 1;
    END IF;

    -- C. If customer still does NOT exist, insert new customer row
    IF v_customer_id IS NULL THEN
        IF v_customer_phone IS NULL OR LENGTH(v_customer_phone) < 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Valid 10-digit phone number is required for new customer.');
        END IF;

        INSERT INTO public.customers (
            company_id,
            branch_id,
            customer_name,
            customer_phone,
            customer_email,
            status,
            total_spent,
            last_visit,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            p_branch_id,
            COALESCE(NULLIF(v_customer_name, ''), 'New Customer'),
            v_customer_phone,
            NULLIF(TRIM(p_customer_email), ''),
            'active',
            0,
            v_purchase_date,
            NOW(),
            NOW()
        )
        RETURNING customer_id, customer_name INTO v_customer_id, v_customer_name;
    ELSE
        -- Fallback to provided name if DB has empty name
        IF v_customer_name IS NULL OR v_customer_name = '' THEN
            v_customer_name := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Customer');
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. CHECK FOR DUPLICATE ACTIVE MEMBERSHIP (public.membership_purchases)
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM public.membership_purchases
        WHERE customer_id = v_customer_id
          AND (membership_id = p_membership_id)
          AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date >= v_purchase_date)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Customer already has an active membership for this plan.'
        );
    END IF;

    -- -------------------------------------------------------------------------
    -- 4. PREPARE DATES & AMOUNTS
    -- -------------------------------------------------------------------------
    -- Calculate expiry date from plan duration
    IF v_plan_duration IS NOT NULL AND v_plan_duration > 0 THEN
        v_expiry_date := (v_purchase_date + (v_plan_duration || ' months')::interval)::date;
    ELSE
        v_expiry_date := (v_purchase_date + '12 months'::interval)::date;
    END IF;

    -- Determine financial numbers
    v_final_amount := COALESCE(p_final_amount, v_plan_price);
    v_discount_amount := COALESCE(p_discount_amount, GREATEST(0, v_plan_price - v_final_amount));

    -- Enforce business_transactions check constraint: 'cash', 'upi', 'card'
    v_payment_method := LOWER(COALESCE(TRIM(p_payment_method), 'cash'));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. WRITE TO public.membership_purchases
    -- -------------------------------------------------------------------------
    INSERT INTO public.membership_purchases (
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
        notes,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
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
        p_notes,
        p_discount_type,
        p_discount_name,
        v_discount_amount,
        v_final_amount,
        NOW(),
        NOW()
    );

    -- -------------------------------------------------------------------------
    -- 6. WRITE TO public.business_transactions
    -- -------------------------------------------------------------------------
    INSERT INTO public.business_transactions (
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
        updated_at,
        discount_type,
        discount_name,
        discount_amount,
        final_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        v_purchase_id,
        'membership',
        v_plan_price,
        'INR',
        v_payment_method,
        'paid',
        COALESCE(NULLIF(TRIM(p_notes), ''), 'Membership Enrollment: ' || v_plan_name),
        p_assigned_by_user_id,
        NOW(),
        NOW(),
        NOW(),
        p_discount_type,
        p_discount_name,
        v_discount_amount,
        v_final_amount
    )
    RETURNING payment_id INTO v_payment_id;

    -- -------------------------------------------------------------------------
    -- 7. UPDATE CUSTOMER STATS (public.customers)
    -- -------------------------------------------------------------------------
    UPDATE public.customers
    SET total_spent = COALESCE(total_spent, 0) + v_final_amount,
        last_visit = v_purchase_date,
        updated_at = NOW()
    WHERE customer_id = v_customer_id;

    -- -------------------------------------------------------------------------
    -- 8. RETURN JSON RESPONSE
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'payment_id', v_payment_id,
        'customer_id', v_customer_id,
        'customer_name', v_customer_name,
        'plan_name', v_plan_name,
        'purchase_date', v_purchase_date,
        'expiry_date', v_expiry_date,
        'final_amount', v_final_amount,
        'payment_method', v_payment_method
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
