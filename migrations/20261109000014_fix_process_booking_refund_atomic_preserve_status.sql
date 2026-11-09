-- ============================================================================
-- Migration: 20261109000014_fix_process_booking_refund_atomic_preserve_status.sql
-- Description: Ensure process_booking_refund_atomic does NOT modify booking_status
--              in app.bookings or app.bookings_for_business_transaction.
--              Only payment_status should be updated to 'refunded'.
--              Status changes (cancelled, completed, etc.) belong exclusively to
--              update_booking_status_atomic.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.process_booking_refund_atomic(
    p_booking_id uuid,
    p_refund_reason text DEFAULT NULL::text,
    p_refund_notes text DEFAULT NULL::text,
    p_refund_method text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking        record;
    v_paid_record    record;
    v_refund_amount  numeric;
    v_was_completed  boolean;
    v_customer_id    uuid;
    v_caller_role    text;
BEGIN
    -- 1. Fetch booking summary
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found: %', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'Booking % has already been refunded', p_booking_id;
    END IF;

    -- 2. Tenant check
    IF NOT shared.verify_tenant_access(v_booking.company_id, v_booking.branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', v_booking.company_id, v_booking.branch_id;
    END IF;

    -- 3. RBAC refund authorization
    IF auth.uid() IS NOT NULL AND auth.role() <> 'service_role' THEN
        SELECT LOWER(role_name) INTO v_caller_role
        FROM shared.users
        WHERE user_id = auth.uid() AND company_id = v_booking.company_id;

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('owner', 'super_admin', 'admin', 'manager') THEN
            RAISE EXCEPTION 'Unauthorized: Only owners or managers can issue refunds';
        END IF;
    END IF;

    -- 4. Locate original paid transaction
    SELECT * INTO v_paid_record
    FROM app.business_transactions
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'paid'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No paid transaction found for booking: %. Only paid bookings can be refunded.', p_booking_id;
    END IF;

    v_refund_amount := COALESCE(v_paid_record.final_amount, v_paid_record.amount);
    v_was_completed := (LOWER(COALESCE(v_booking.booking_status, '')) = 'completed');
    v_customer_id   := v_booking.customer_id;

    -- 5. Insert refund row in business_transactions
    INSERT INTO app.business_transactions (
        payment_id, company_id, branch_id,
        reference_id, reference_type,
        amount, currency, payment_method, status, notes,
        discount_type, discount_name, discount_amount,
        final_amount, paid_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        v_paid_record.company_id, v_paid_record.branch_id,
        p_booking_id, 'booking',
        v_refund_amount, COALESCE(v_paid_record.currency, 'INR'),
        COALESCE(p_refund_method, v_paid_record.payment_method),
        'refunded',
        COALESCE(p_refund_notes, p_refund_reason, 'Booking 100% full refund'),
        v_paid_record.discount_type, v_paid_record.discount_name, v_paid_record.discount_amount,
        v_refund_amount, NOW(), NOW(), NOW()
    );

    -- 6. Update bookings_for_business_transaction: update payment_status ONLY (preserve booking_status)
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status = 'refunded',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- 7. Update all service rows in app.bookings: update payment_status ONLY (preserve booking_status)
    UPDATE app.bookings
    SET
        payment_status = 'refunded',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- 8. Customer spend reversal
    IF v_was_completed AND v_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET
            total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_refund_amount),
            updated_at  = NOW()
        WHERE customer_id = v_customer_id;
    END IF;

    -- 9. Reverse discount usages
    UPDATE app.discount_usages
    SET
        status          = 'reversed',
        reversal_amount = discount_amount,
        reversed_at     = NOW(),
        reversal_reason = COALESCE(p_refund_notes, p_refund_reason, 'Booking refunded'),
        updated_at      = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'applied';

    RETURN jsonb_build_object(
        'success',        true,
        'booking_id',     p_booking_id,
        'refund_amount',  v_refund_amount,
        'was_completed',  v_was_completed,
        'booking_status', v_booking.booking_status,
        'payment_status', 'refunded'
    );
END;
$function$;

