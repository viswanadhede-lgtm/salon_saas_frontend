CREATE OR REPLACE FUNCTION public.assign_membership(
    p_company_id uuid, 
    p_branch_id uuid, 
    p_membership_id uuid, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_customer_phone text DEFAULT NULL::text, 
    p_customer_name text DEFAULT NULL::text, 
    p_customer_email text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'cash'::text, 
    p_purchase_date date DEFAULT CURRENT_DATE, 
    p_discount_type text DEFAULT NULL::text, 
    p_discount_name text DEFAULT NULL::text, 
    p_discount_amount numeric DEFAULT NULL::numeric, 
    p_final_amount numeric DEFAULT NULL::numeric, 
    p_assigned_by_user_id uuid DEFAULT NULL::uuid, 
    p_assigned_by_user_name text DEFAULT NULL::text, 
    p_notes text DEFAULT NULL::text, 
    p_discount_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    v_discount_id       uuid := p_discount_id;
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

    IF v_plan_status IS NOT NULL AND LOWER(v_plan_status) NOT IN ('active', 'enabled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership plan is not active.');
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. RESOLVE OR CREATE CUSTOMER (public.customers)
    -- -------------------------------------------------------------------------
    IF v_customer_id IS NOT NULL THEN
        SELECT customer_name, customer_phone
        INTO v_customer_name, v_customer_phone
        FROM public.customers
        WHERE customer_id = v_customer_id
          AND company_id = p_company_id
        LIMIT 1;

        IF v_customer_name IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Customer not found.');
        END IF;
    ELSE
        IF v_customer_phone IS NULL OR v_customer_phone = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Customer phone number is required.');
        END IF;

        IF v_customer_name IS NULL OR v_customer_name = '' THEN
            v_customer_name := 'Walk-in Customer';
        END IF;

        SELECT customer_id INTO v_customer_id
        FROM public.customers
        WHERE customer_phone = v_customer_phone
          AND company_id = p_company_id
        LIMIT 1;

        IF v_customer_id IS NULL THEN
            v_customer_id := gen_random_uuid();
            INSERT INTO public.customers (\
                customer_id,\
                company_id,\
                branch_id,\
                customer_name,\
                customer_phone,\
                customer_email,\
                status,\
                total_visits,\
                total_spent,\
                created_at,\
                updated_at\
            ) VALUES (\
                v_customer_id,\
                p_company_id,\
                p_branch_id,\
                v_customer_name,\
                v_customer_phone,\
                NULLIF(TRIM(p_customer_email), ''),\
                'active',\
                1,\
                0,\
                NOW(),\
                NOW()\
            );
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. CHECK FOR DUPLICATE ACTIVE MEMBERSHIP
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
    IF v_plan_duration IS NOT NULL AND v_plan_duration > 0 THEN
        v_expiry_date := (v_purchase_date + (v_plan_duration || ' months')::interval)::date;
    ELSE
        v_expiry_date := (v_purchase_date + '12 months'::interval)::date;
    END IF;

    v_final_amount := COALESCE(p_final_amount, v_plan_price);
    v_discount_amount := COALESCE(p_discount_amount, GREATEST(0, v_plan_price - v_final_amount));

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
    -- 8. TRACK DISCOUNT IN public.discount_usages (WITH discount_id and staff details)
    -- -------------------------------------------------------------------------
    IF COALESCE(v_discount_amount, 0) > 0 THEN
        -- Auto-resolve discount_id if not directly passed
        IF v_discount_id IS NULL AND p_discount_type = 'coupon' AND p_discount_name IS NOT NULL THEN
            SELECT coupon_id INTO v_discount_id FROM public.coupons WHERE coupon_code = p_discount_name LIMIT 1;
        ELSIF v_discount_id IS NULL AND p_discount_type = 'offer' AND p_discount_name IS NOT NULL THEN
            SELECT offer_id INTO v_discount_id FROM public.offers WHERE offer_name = p_discount_name LIMIT 1;
        END IF;

        INSERT INTO public.discount_usages (
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
            p_discount_type,
            v_discount_id,
            p_discount_name,
            v_discount_amount,
            'applied',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- -------------------------------------------------------------------------
    -- 9. RETURN JSON RESPONSE
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
$function$;
