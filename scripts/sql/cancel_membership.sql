-- ============================================================================
-- RPC FUNCTION: public.cancel_membership
-- Purpose: Atomically validate and cancel an active membership purchase.
--          Does NOT touch business_transactions (Option A: original payment remains
--          valid on ledger until refund is processed in State 3).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_membership(
    p_purchase_id   uuid,
    p_company_id    uuid DEFAULT NULL,
    p_branch_id     uuid DEFAULT NULL,
    p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status    text;
    v_current_payment   text;
    v_customer_name     text;
    v_plan_name         text;
    v_today             date := CURRENT_DATE;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. READ & VALIDATE CURRENT PURCHASE (public.membership_purchases)
    -- -------------------------------------------------------------------------
    SELECT status, payment_status, customer_name, plan_name
    INTO v_current_status, v_current_payment, v_customer_name, v_plan_name
    FROM public.membership_purchases
    WHERE purchase_id = p_purchase_id
      AND (p_company_id IS NULL OR company_id = p_company_id)
    LIMIT 1;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Membership purchase record not found.'
        );
    END IF;

    -- Only active memberships can be cancelled
    IF v_current_status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only active memberships can be cancelled. Current status is: ' || v_current_status
        );
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. WRITE UPDATE TO public.membership_purchases
    -- -------------------------------------------------------------------------
    UPDATE public.membership_purchases
    SET 
        status = 'cancelled',
        cancelled_date = v_today,
        notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
        updated_at = NOW()
    WHERE purchase_id = p_purchase_id;

    -- -------------------------------------------------------------------------
    -- 3. RETURN SUCCESS RESULT
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', p_purchase_id,
        'customer_name', v_customer_name,
        'plan_name', v_plan_name,
        'status', 'cancelled',
        'cancelled_date', v_today,
        'notes', p_notes
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
