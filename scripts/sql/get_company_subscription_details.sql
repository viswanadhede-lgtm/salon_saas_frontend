-- =============================================================================
-- RPC FUNCTION: public.get_company_subscription_details
-- Purpose: Unified master reader for Billing & Subscription module.
-- Returns consolidated subscription status, plan features, active add-ons,
-- available add-ons catalog, billing settings, billing info, and payment history.
-- Aligned with exact table definitions for:
--   - public.subscriptions
--   - public.plans
--   - public.plan_features
--   - public.subscription_add_ons
--   - public.add_ons
--   - public.billing_settings
--   - public.company_billing_information
--   - public.payments
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_company_subscription_details(
    p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_row      record;
    v_subscription_id       text;
    v_plan_id               uuid;
    v_cycle                 text := 'monthly';
    v_subscription_json     jsonb := NULL;
    v_features_json         jsonb := '{"included_keys": [], "excluded_keys": []}'::jsonb;
    v_active_addons_json    jsonb := '[]'::jsonb;
    v_available_addons_json jsonb := '[]'::jsonb;
    v_billing_settings_json jsonb := '{"tax_name": "GST", "tax_rate": 0, "is_active": false}'::jsonb;
    v_billing_info_json     jsonb := NULL;
    v_payment_history_json  jsonb := '[]'::jsonb;
    v_payment_method_json   jsonb := NULL;
    v_all_features          text[];
    v_included_features     text[];
    v_excluded_features     text[];
BEGIN
    -- 1. Validate required company_id
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'company_id is required'
        );
    END IF;

    -- 2. Fetch active or latest subscription for this company
    -- Preference order: active, trial, past_due, cancelled
    SELECT 
        s.subscription_id,
        s.company_id,
        s.plan_id,
        s.user_id,
        s.name,
        s.email,
        s.phone,
        s.billing_cycle,
        s.status,
        s.subscription_start_date,
        s.subscription_end_date,
        s.next_billing_at,
        s.billing_amount,
        COALESCE(p.plan_name, s.plan_name, 'Growth') AS plan_name,
        s.auto_renew,
        s.razorpay_subscription_id,
        s.razorpay_customer_id,
        s.remarks,
        p.price_monthly,
        p.price_yearly,
        s.created_at,
        s.updated_at
    INTO v_subscription_row
    FROM public.subscriptions s
    LEFT JOIN public.plans p ON p.plan_id = s.plan_id
    WHERE s.company_id = p_company_id
      AND LOWER(COALESCE(s.status, '')) IN ('active', 'trial', 'past_due', 'cancelled')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Fallback: If no subscription found with priority statuses, look for most recent row
    IF v_subscription_row.subscription_id IS NULL THEN
        SELECT 
            s.subscription_id,
            s.company_id,
            s.plan_id,
            s.user_id,
            s.name,
            s.email,
            s.phone,
            s.billing_cycle,
            s.status,
            s.subscription_start_date,
            s.subscription_end_date,
            s.next_billing_at,
            s.billing_amount,
            COALESCE(p.plan_name, s.plan_name, 'Growth') AS plan_name,
            s.auto_renew,
            s.razorpay_subscription_id,
            s.razorpay_customer_id,
            s.remarks,
            p.price_monthly,
            p.price_yearly,
            s.created_at,
            s.updated_at
        INTO v_subscription_row
        FROM public.subscriptions s
        LEFT JOIN public.plans p ON p.plan_id = s.plan_id
        WHERE s.company_id = p_company_id
        ORDER BY s.created_at DESC
        LIMIT 1;
    END IF;

    -- Format subscription JSON if record exists
    IF v_subscription_row.subscription_id IS NOT NULL THEN
        v_subscription_id := v_subscription_row.subscription_id;
        v_plan_id         := v_subscription_row.plan_id;
        v_cycle           := LOWER(COALESCE(v_subscription_row.billing_cycle, 'monthly'));

        v_subscription_json := jsonb_build_object(
            'subscription_id',          v_subscription_row.subscription_id,
            'company_id',               v_subscription_row.company_id,
            'plan_id',                  v_subscription_row.plan_id,
            'plan_name',                v_subscription_row.plan_name,
            'billing_cycle',            v_cycle,
            'billing_amount',           COALESCE(v_subscription_row.billing_amount, 0),
            'status',                   COALESCE(v_subscription_row.status, 'active'),
            'auto_renew',               COALESCE(v_subscription_row.auto_renew, true),
            'subscription_start_date',  v_subscription_row.subscription_start_date,
            'subscription_end_date',    v_subscription_row.subscription_end_date,
            'next_billing_at',          v_subscription_row.next_billing_at,
            'razorpay_subscription_id', v_subscription_row.razorpay_subscription_id,
            'razorpay_customer_id',     v_subscription_row.razorpay_customer_id,
            'remarks',                  v_subscription_row.remarks,
            'created_at',               v_subscription_row.created_at
        );
    END IF;

    -- 3. Plan Features Catalog & Included/Excluded Sets
    SELECT COALESCE(array_agg(DISTINCT feature_key), ARRAY[]::text[])
    INTO v_all_features
    FROM public.plan_features
    WHERE feature_key IS NOT NULL;

    IF v_plan_id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT feature_key), ARRAY[]::text[])
        INTO v_included_features
        FROM public.plan_features
        WHERE plan_id = v_plan_id;
    ELSE
        v_included_features := ARRAY[]::text[];
    END IF;

    SELECT COALESCE(array_agg(f), ARRAY[]::text[])
    INTO v_excluded_features
    FROM unnest(v_all_features) AS f
    WHERE f <> ALL(v_included_features);

    v_features_json := jsonb_build_object(
        'included_keys', to_jsonb(v_included_features),
        'excluded_keys', to_jsonb(v_excluded_features)
    );

    -- 4. Active Add-ons for current subscription
    IF v_subscription_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',             sa.addon_id,
                'sub_addon_id',   sa.id,
                'name',           COALESCE(sa.addon_name, a.name, 'Add-on'),
                'description',    COALESCE(a.description, ''),
                'price',          COALESCE(sa.price, CASE WHEN v_cycle IN ('yearly', 'annual', 'annually') THEN a.price_yearly ELSE a.price_monthly END, 0),
                'price_monthly',  COALESCE(a.price_monthly, 0),
                'price_yearly',   COALESCE(a.price_yearly, 0),
                'status',         COALESCE(sa.status, 'active'),
                'started_at',     sa.started_at,
                'ended_at',       sa.ended_at
            ) ORDER BY sa.started_at DESC, sa.id ASC
        ), '[]'::jsonb)
        INTO v_active_addons_json
        FROM public.subscription_add_ons sa
        LEFT JOIN public.add_ons a ON a.addon_id = sa.addon_id
        WHERE sa.subscription_id = v_subscription_id
          AND LOWER(COALESCE(sa.status, '')) IN ('active', 'cancelling');
    END IF;

    -- 5. Available Add-ons Master Catalog
    -- Uses price_monthly and price_yearly from add_ons definition
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',                addon_id,
            'name',              name,
            'description',       COALESCE(description, ''),
            'price',             COALESCE(CASE WHEN v_cycle IN ('yearly', 'annual', 'annually') THEN price_yearly ELSE price_monthly END, price_monthly, 0),
            'price_monthly',     COALESCE(price_monthly, 0),
            'price_yearly',      COALESCE(price_yearly, 0),
            'duration_monthly',  duration_monthly,
            'duration_yearly',   duration_yearly,
            'status',            COALESCE(status, 'active')
        ) ORDER BY price_monthly ASC NULLS LAST, name ASC
    ), '[]'::jsonb)
    INTO v_available_addons_json
    FROM public.add_ons
    WHERE LOWER(COALESCE(status, 'active')) = 'active';

    IF jsonb_array_length(v_available_addons_json) = 0 THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',                addon_id,
                'name',              name,
                'description',       COALESCE(description, ''),
                'price',             COALESCE(CASE WHEN v_cycle IN ('yearly', 'annual', 'annually') THEN price_yearly ELSE price_monthly END, price_monthly, 0),
                'price_monthly',     COALESCE(price_monthly, 0),
                'price_yearly',      COALESCE(price_yearly, 0),
                'duration_monthly',  duration_monthly,
                'duration_yearly',   duration_yearly,
                'status',            COALESCE(status, 'active')
            ) ORDER BY price_monthly ASC NULLS LAST, name ASC
        ), '[]'::jsonb)
        INTO v_available_addons_json
        FROM public.add_ons;
    END IF;

    -- 6. Billing Settings (Tax configuration)
    SELECT jsonb_build_object(
        'tax_name',   COALESCE(TRIM(tax_name), 'GST'),
        'tax_rate',   COALESCE(tax_rate, 0),
        'is_active',  COALESCE(is_active, false)
    )
    INTO v_billing_settings_json
    FROM public.billing_settings
    WHERE company_id = p_company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_billing_settings_json IS NULL THEN
        v_billing_settings_json := jsonb_build_object(
            'tax_name',  'GST',
            'tax_rate',  0,
            'is_active', false
        );
    END IF;

    -- 7. Company Billing Information
    SELECT jsonb_build_object(
        'id',                  id,
        'company_id',          company_id,
        'legal_business_name', legal_business_name,
        'gstin',               gstin,
        'pan',                 pan,
        'billing_email',       billing_email,
        'billing_phone',       billing_phone,
        'address_line_1',      address_line_1,
        'address_line_2',      address_line_2,
        'city',                city,
        'district',            district,
        'state',               state,
        'pin_code',            pin_code,
        'country',             COALESCE(country, 'India')
    )
    INTO v_billing_info_json
    FROM public.company_billing_information
    WHERE company_id = p_company_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- 8. Payment History (From payments table)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',              COALESCE(invoice_id, payment_id, order_id, 'PAY-' || id::text),
            'raw_id',          id,
            'order_id',        order_id,
            'payment_id',      payment_id,
            'invoice_id',      invoice_id,
            'subscription_id', subscription_id,
            'amount',          COALESCE(amount, 0),
            'status',          COALESCE(status, 'paid'),
            'payment_method',  COALESCE(payment_method, 'Razorpay'),
            'created_at',      created_at,
            'plan_id',         plan_id
        ) ORDER BY created_at DESC
    ), '[]'::jsonb)
    INTO v_payment_history_json
    FROM public.payments
    WHERE company_id = p_company_id;

    -- 9. Latest Payment Method Details
    SELECT jsonb_build_object(
        'payment_method', COALESCE(payment_method, 'Razorpay'),
        'payment_id',     payment_id,
        'created_at',     created_at
    )
    INTO v_payment_method_json
    FROM public.payments
    WHERE company_id = p_company_id
      AND LOWER(COALESCE(status, '')) = 'paid'
    ORDER BY created_at DESC
    LIMIT 1;

    -- 10. Assemble and Return Master Response
    RETURN jsonb_build_object(
        'success',              true,
        'company_id',           p_company_id,
        'subscription',         v_subscription_json,
        'features',             v_features_json,
        'active_addons',        v_active_addons_json,
        'available_addons',     v_available_addons_json,
        'billing_settings',     v_billing_settings_json,
        'billing_information',  v_billing_info_json,
        'payment_history',      v_payment_history_json,
        'payment_method',       v_payment_method_json
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$;

-- Grant execution permissions to all relevant roles
GRANT EXECUTE ON FUNCTION public.get_company_subscription_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_subscription_details(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_company_subscription_details(uuid) TO anon;
