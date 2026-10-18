-- ============================================================================
-- RPC FUNCTION: public.process_booking_refund_atomic
-- Purpose: Atomically process 100% full booking refund, insert refund ledger entry,
--          cancel booking, reverse customer total_spent, and reverse discount in discount_usages.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_booking_refund_atomic(
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
  v_paid_record    RECORD;
  v_was_completed  BOOLEAN;
  v_customer_id    UUID;
  v_refund_amount  NUMERIC;
BEGIN
  -- ──────────────────────────────────────────────
  -- 1. Get the paid transaction
  -- ──────────────────────────────────────────────
  SELECT * INTO v_paid_record
  FROM business_transactions
  WHERE reference_id   = p_booking_id
    AND reference_type = 'booking'
    AND status         = 'paid'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No paid transaction found for booking: %', p_booking_id;
  END IF;

  v_refund_amount := COALESCE(v_paid_record.final_amount, v_paid_record.amount, 0);

  -- ──────────────────────────────────────────────
  -- 2. Check if booking was completed (for customer stats)
  -- ──────────────────────────────────────────────
  SELECT
    (bbt.status = 'completed'),
    bbt.customer_id
  INTO v_was_completed, v_customer_id
  FROM bookings_for_business_transaction bbt
  WHERE bbt.booking_id = p_booking_id;

  -- ──────────────────────────────────────────────
  -- 3. Insert refund row in business_transactions
  --    (immutable ledger — never delete the paid row)
  -- ──────────────────────────────────────────────
  INSERT INTO business_transactions (
    company_id, branch_id,
    reference_id, reference_type,
    amount, currency, payment_method,
    status, notes,
    discount_type, discount_name, discount_amount, final_amount,
    paid_at, created_at
  ) VALUES (
    v_paid_record.company_id,
    v_paid_record.branch_id,
    p_booking_id,
    'booking',
    v_refund_amount,
    COALESCE(v_paid_record.currency, 'INR'),
    COALESCE(p_refund_method, v_paid_record.payment_method),
    'refunded',
    COALESCE(p_refund_notes, p_refund_reason),
    v_paid_record.discount_type,
    v_paid_record.discount_name,
    v_paid_record.discount_amount,
    v_refund_amount,
    NOW(),
    NOW()
  );

  -- ──────────────────────────────────────────────
  -- 4. Update bookings_for_business_transaction
  -- ──────────────────────────────────────────────
  UPDATE bookings_for_business_transaction
  SET
    payment_status = 'refunded',
    status         = 'cancelled',
    updated_at     = NOW()
  WHERE booking_id = p_booking_id;

  -- ──────────────────────────────────────────────
  -- 5. Update all service rows in bookings
  -- ──────────────────────────────────────────────
  UPDATE bookings
  SET
    status     = 'cancelled',
    payment    = 'refunded',
    updated_at = NOW()
  WHERE booking_id = p_booking_id;

  -- ──────────────────────────────────────────────
  -- 6. If booking was completed, reverse customer stats
  -- ──────────────────────────────────────────────
  IF v_was_completed AND v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_refund_amount),
      updated_at  = NOW()
    WHERE customer_id = v_customer_id;
  END IF;

  -- ──────────────────────────────────────────────
  -- 7. [NEW] Reverse discount in discount_usages
  -- ──────────────────────────────────────────────
  UPDATE public.discount_usages
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
    'success',       true,
    'booking_id',    p_booking_id,
    'refund_amount', v_refund_amount,
    'was_completed', v_was_completed
  );
END;
$function$;
