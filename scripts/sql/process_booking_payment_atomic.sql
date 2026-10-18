-- ============================================================================
-- RPC FUNCTION: public.process_booking_payment_atomic
-- Purpose: Atomically update booking, consolidated transaction, business ledger,
--          and record discount usage in public.discount_usages.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_booking_payment_atomic(
  p_booking_id uuid, 
  p_payment_method text, 
  p_discount_type text DEFAULT NULL::text, 
  p_discount_name text DEFAULT NULL::text, 
  p_discount_amount numeric DEFAULT 0, 
  p_final_amount numeric DEFAULT NULL::numeric, 
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_total_price NUMERIC;
  v_final       NUMERIC;
  v_customer_id UUID;
  v_company_id  UUID;
  v_branch_id   UUID;
  v_payment_id  UUID;
BEGIN
  -- ──────────────────────────────────────────────
  -- Get the total price and details from summary
  -- ──────────────────────────────────────────────
  SELECT total_price, customer_id, company_id, branch_id 
  INTO v_total_price, v_customer_id, v_company_id, v_branch_id
  FROM bookings_for_business_transaction
  WHERE booking_id = p_booking_id;

  IF v_total_price IS NULL THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  -- Calculate final amount if not provided
  v_final := COALESCE(p_final_amount, v_total_price - COALESCE(p_discount_amount, 0));

  -- ──────────────────────────────────────────────
  -- 1. Update business_transactions: created → paid
  -- ──────────────────────────────────────────────
  UPDATE business_transactions
  SET
    status          = 'paid',
    payment_method  = p_payment_method,
    paid_at         = NOW(),
    amount          = v_total_price,
    discount_type   = p_discount_type,
    discount_name   = p_discount_name,
    discount_amount = COALESCE(p_discount_amount, 0),
    final_amount    = v_final,
    notes           = COALESCE(p_notes, notes),
    updated_at      = NOW()
  WHERE reference_id   = p_booking_id
    AND reference_type = 'booking'
    AND status         = 'created'
  RETURNING payment_id INTO v_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No "created" transaction found for booking: %. It may already be paid.', p_booking_id;
  END IF;

  -- ──────────────────────────────────────────────
  -- 2. Update bookings_for_business_transaction
  -- ──────────────────────────────────────────────
  UPDATE bookings_for_business_transaction
  SET
    payment_status  = 'paid',
    discount_type   = p_discount_type,
    discount_name   = p_discount_name,
    discount_amount = COALESCE(p_discount_amount, 0),
    final_amount    = v_final,
    updated_at      = NOW()
  WHERE booking_id = p_booking_id;

  -- ──────────────────────────────────────────────
  -- 3. Update all service rows in bookings
  -- ──────────────────────────────────────────────
  UPDATE bookings
  SET
    payment    = 'paid',
    updated_at = NOW()
  WHERE booking_id = p_booking_id;

  -- ──────────────────────────────────────────────
  -- 4. [NEW] Track discount in discount_usages
  -- ──────────────────────────────────────────────
  IF COALESCE(p_discount_amount, 0) > 0 THEN
    INSERT INTO public.discount_usages (
      company_id,
      branch_id,
      customer_id,
      reference_type,
      reference_id,
      payment_id,
      discount_type,
      discount_name,
      discount_amount,
      status,
      used_at,
      created_at,
      updated_at
    ) VALUES (
      v_company_id,
      v_branch_id,
      v_customer_id,
      'booking',
      p_booking_id,
      v_payment_id,
      p_discount_type,
      p_discount_name,
      p_discount_amount,
      'applied',
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'booking_id',   p_booking_id,
    'total_price',  v_total_price,
    'discount',     COALESCE(p_discount_amount, 0),
    'final_amount', v_final
  );
END;
$function$;
