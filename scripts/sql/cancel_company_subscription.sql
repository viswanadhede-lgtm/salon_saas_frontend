-- =============================================================================
-- RPC FUNCTION: public.cancel_company_subscription
-- Purpose: Atomically schedules or executes cancellation for a company's subscription.
--          Turns off auto_renew, logs cancellation reason & feedback in remarks,
--          and updates timestamps.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_company_subscription(
    p_company_id        uuid,
    p_subscription_id   text DEFAULT NULL,
    p_reason            text DEFAULT NULL,
    p_feedback          text DEFAULT NULL,
    p_immediate         boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sub_row           record;
    v_now               timestamptz := NOW();
    v_formatted_remarks text;
    v_updated_row       record;
BEGIN
    -- 1. Validate required company_id
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'company_id is required'
        );
    END IF;

    -- 2. Locate active or pending subscription for this company
    IF p_subscription_id IS NOT NULL AND TRIM(p_subscription_id) <> '' THEN
        SELECT *
        INTO v_sub_row
        FROM public.subscriptions
        WHERE company_id = p_company_id
          AND (subscription_id = p_subscription_id OR razorpay_subscription_id = p_subscription_id)
        LIMIT 1;
    ELSE
        SELECT *
        INTO v_sub_row
        FROM public.subscriptions
        WHERE company_id = p_company_id
          AND LOWER(COALESCE(status, '')) IN ('active', 'trial', 'trialing', 'created', 'authenticated')
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- 3. If no active subscription found
    IF v_sub_row.subscription_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'No active subscription found for this company to cancel'
        );
    END IF;

    -- 4. Check if already fully cancelled
    IF v_sub_row.auto_renew = false AND LOWER(COALESCE(v_sub_row.status, '')) = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success',           true,
            'already_cancelled', true,
            'message',           'Subscription is already cancelled',
            'subscription_id',   v_sub_row.subscription_id,
            'status',            v_sub_row.status,
            'auto_renew',        v_sub_row.auto_renew
        );
    END IF;

    -- 5. Format cancellation remarks for audit trail
    v_formatted_remarks := 'Cancelled by user (' || 
        CASE WHEN p_immediate THEN 'immediate' ELSE 'at cycle end' END || '): ' ||
        COALESCE(NULLIF(TRIM(p_reason), ''), 'No reason provided') ||
        CASE WHEN p_feedback IS NOT NULL AND TRIM(p_feedback) <> '' 
             THEN ' - ' || TRIM(p_feedback) 
             ELSE '' 
        END;

    IF v_sub_row.remarks IS NOT NULL AND TRIM(v_sub_row.remarks) <> '' THEN
        v_formatted_remarks := v_sub_row.remarks || ' | ' || v_formatted_remarks;
    END IF;

    -- 6. Perform atomic update on public.subscriptions
    UPDATE public.subscriptions
    SET
        auto_renew = false,
        remarks    = v_formatted_remarks,
        status     = CASE 
                        WHEN p_immediate THEN 'cancelled' 
                        ELSE status 
                     END,
        subscription_end_date = CASE 
                                   WHEN p_immediate THEN v_now 
                                   ELSE subscription_end_date 
                                END,
        updated_at = v_now
    WHERE subscription_id = v_sub_row.subscription_id
    RETURNING * INTO v_updated_row;

    -- 7. Return structured JSON response
    RETURN jsonb_build_object(
        'success',                  true,
        'message',                  CASE 
                                        WHEN p_immediate THEN 'Subscription cancelled immediately' 
                                        ELSE 'Subscription scheduled for cancellation at billing cycle end' 
                                    END,
        'subscription_id',          v_updated_row.subscription_id,
        'razorpay_subscription_id', v_updated_row.razorpay_subscription_id,
        'plan_name',                v_updated_row.plan_name,
        'status',                   v_updated_row.status,
        'auto_renew',               v_updated_row.auto_renew,
        'subscription_end_date',    v_updated_row.subscription_end_date,
        'next_billing_at',          v_updated_row.next_billing_at,
        'remarks',                  v_updated_row.remarks,
        'updated_at',               v_updated_row.updated_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Failed to cancel subscription: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.cancel_company_subscription IS 
'Atomically cancels or turns off auto_renew for a company subscription with audit trail in remarks.';
