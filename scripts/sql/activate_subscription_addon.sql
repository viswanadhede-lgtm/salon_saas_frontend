-- =============================================================================
-- RPC FUNCTION: public.activate_subscription_addon
-- Purpose: Atomically records a purchased add-on in subscription_add_ons
--          and logs the transaction in payments ledger upon payment confirmation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.activate_subscription_addon(
    p_company_id        uuid,
    p_subscription_id   text,
    p_addon_id          uuid,
    p_addon_name        text,
    p_price             numeric,
    p_duration_days     bigint,
    p_order_id          text,
    p_payment_id        text,
    p_payment_method    text DEFAULT 'online',
    p_customer_name     text DEFAULT NULL,
    p_customer_email    text DEFAULT NULL,
    p_customer_phone    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now               timestamptz := NOW();
    v_end_date          timestamptz;
    v_sub_addon_id      uuid;
    v_payment_id_gen    uuid;
BEGIN
    -- 1. Validate mandatory fields
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id is required');
    END IF;
    IF p_subscription_id IS NULL OR TRIM(p_subscription_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'subscription_id is required');
    END IF;
    IF p_addon_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'addon_id is required');
    END IF;

    -- 2. Calculate duration
    -- Default to 30 days if null or invalid
    v_end_date := v_now + (COALESCE(NULLIF(p_duration_days, 0), 30) || ' days')::interval;

    -- 3. Idempotency: Deactivate any existing active record for this specific addon to prevent duplicates
    UPDATE public.subscription_add_ons
    SET 
        status     = 'superseded',
        updated_at = v_now
    WHERE company_id = p_company_id
      AND addon_id   = p_addon_id
      AND LOWER(COALESCE(status, '')) = 'active';

    -- 4. Atomically insert new active record in public.subscription_add_ons
    INSERT INTO public.subscription_add_ons (
        id,
        subscription_id,
        company_id,
        addon_id,
        addon_name,
        price,
        status,
        started_at,
        ended_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_subscription_id,
        p_company_id,
        p_addon_id,
        COALESCE(p_addon_name, 'Add-on'),
        COALESCE(p_price, 0),
        'active',
        v_now,
        v_end_date,
        v_now,
        v_now
    )
    RETURNING id INTO v_sub_addon_id;

    -- 5. Atomically record transaction ledger row in public.payments
    IF p_order_id IS NOT NULL AND TRIM(p_order_id) <> '' THEN
        INSERT INTO public.payments (
            id,
            order_id,
            company_id,
            subscription_id,
            amount,
            name,
            email,
            phone,
            payment_id,
            status,
            payment_method,
            created_at
        ) VALUES (
            gen_random_uuid(),
            p_order_id,
            p_company_id,
            p_subscription_id,
            COALESCE(p_price, 0),
            p_customer_name,
            p_customer_email,
            p_customer_phone,
            p_payment_id,
            'paid',
            COALESCE(p_payment_method, 'online'),
            v_now
        )
        RETURNING id INTO v_payment_id_gen;
    END IF;

    -- 6. Return structured JSON result
    RETURN jsonb_build_object(
        'success',              true,
        'message',              'Add-on activated successfully',
        'subscription_addon_id', v_sub_addon_id,
        'payment_row_id',       v_payment_id_gen,
        'addon_id',             p_addon_id,
        'addon_name',           p_addon_name,
        'price',                p_price,
        'status',               'active',
        'started_at',           v_now,
        'ended_at',             v_end_date
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Failed to activate add-on: ' || SQLERRM
    );
END;
$$;

-- =============================================================================
-- RPC FUNCTION: public.deactivate_subscription_addon
-- Purpose: Atomically deactivates / removes an active add-on from a company subscription.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deactivate_subscription_addon(
    p_company_id uuid,
    p_addon_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now timestamptz := NOW();
    v_updated_count integer := 0;
BEGIN
    IF p_company_id IS NULL OR p_addon_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id and addon_id are required');
    END IF;

    UPDATE public.subscription_add_ons
    SET 
        status     = 'cancelled',
        updated_at = v_now
    WHERE company_id = p_company_id
      AND addon_id   = p_addon_id
      AND LOWER(COALESCE(status, '')) = 'active';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No active add-on found to remove');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Add-on deactivated successfully',
        'addon_id', p_addon_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Failed to deactivate add-on: ' || SQLERRM
    );
END;
$$;
