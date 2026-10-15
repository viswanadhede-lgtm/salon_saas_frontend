-- ============================================================================
-- RPC FUNCTION: public.process_membership_refund
-- Purpose: Atomically validate and process a membership refund, record a refund
--          entry in business_transactions, and reverse customer total_spent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_membership_refund(
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
    -- -------------------------------------------------------------------------
    -- 1. READ & VALIDATE MEMBERSHIP PURCHASE (public.membership_purchases)
    -- -------------------------------------------------------------------------
    SELECT 
        customer_id, customer_name, plan_name, status, payment_status, final_amount
    INTO 
        v_customer_id, v_customer_name, v_plan_name, v_purchase_status, v_payment_status, v_final_amount
    FROM public.membership_purchases
    WHERE purchase_id = p_purchase_id
      AND (p_company_id IS NULL OR company_id = p_company_id)
    LIMIT 1;

    IF v_purchase_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase record not found.');
    END IF;

    -- Must be cancelled first
    IF v_purchase_status <> 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only cancelled memberships can be refunded. Current status: ' || v_purchase_status);
    END IF;

    -- Must be currently paid (cannot refund an already refunded record)
    IF v_payment_status = 'refunded' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This membership has already been refunded.');
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. CHECK REFUNDABLE LIMITS (public.business_transactions)
    -- -------------------------------------------------------------------------
    -- Calculate any prior refunds logged in business_transactions
    SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM public.business_transactions
    WHERE reference_id = p_purchase_id
      AND reference_type = 'membership'
      AND status = 'refunded';

    v_max_refundable := GREATEST(0, COALESCE(v_final_amount, 0) - v_already_refunded);

    IF p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be greater than zero.');
    END IF;

    IF p_refund_amount > v_max_refundable THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount (₹' || p_refund_amount || ') exceeds refundable limit (₹' || v_max_refundable || ').'
        );
    END IF;

    -- Normalize payment method for check constraint ('cash', 'upi', 'card')
    v_payment_method := LOWER(COALESCE(TRIM(p_payment_method), 'cash'));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. WRITE TO public.business_transactions (Insert Refund Ledger Record)
    -- -------------------------------------------------------------------------
    INSERT INTO public.business_transactions (
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
        paid_at,
        created_at,
        updated_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_purchase_id,
        'membership',
        p_refund_amount,
        p_refund_amount,
        'INR',
        v_payment_method,
        'refunded',
        COALESCE(NULLIF(TRIM(p_refund_reason), ''), 'Membership Refund: ' || v_plan_name),
        p_staff_id,
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- -------------------------------------------------------------------------
    -- 4. UPDATE public.membership_purchases
    -- -------------------------------------------------------------------------
    UPDATE public.membership_purchases
    SET 
        status = 'refunded',
        payment_status = 'refunded',
        notes = CASE 
            WHEN notes IS NOT NULL AND notes <> '' 
            THEN notes || ' | Refund: ' || COALESCE(p_refund_reason, 'Refunded')
            ELSE 'Refund: ' || COALESCE(p_refund_reason, 'Refunded')
        END,
        updated_at = NOW()
    WHERE purchase_id = p_purchase_id;

    -- -------------------------------------------------------------------------
    -- 5. REVERSE CUSTOMER SPEND (public.customers)
    -- -------------------------------------------------------------------------
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_spent = GREATEST(0, COALESCE(total_spent, 0) - p_refund_amount),
            updated_at = NOW()
        WHERE customer_id = v_customer_id;
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. RETURN SUCCESS RESULT
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', p_purchase_id,
        'refund_payment_id', v_payment_id,
        'customer_name', v_customer_name,
        'plan_name', v_plan_name,
        'refund_amount', p_refund_amount,
        'payment_method', v_payment_method,
        'status', 'refunded',
        'payment_status', 'refunded'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
