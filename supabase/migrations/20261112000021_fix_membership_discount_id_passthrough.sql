-- Migration: 20261112000021_fix_membership_discount_id_passthrough.sql
-- Description: Surgical fix in process_booking_payment_atomic:
--              When delegating to app.validate_discount for membership discounts,
--              forward the authoritative membership_id UUID (v_discount_id::text)
--              instead of the human-readable plan name (v_discount_name).
--              Ensures verification in app.membership_purchases is strictly ID-anchored.

CREATE OR REPLACE FUNCTION app.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text    DEFAULT NULL,
    p_discount_name   text    DEFAULT NULL,
    p_discount_amount numeric DEFAULT NULL,
    p_final_amount    numeric DEFAULT NULL,
    p_notes           text    DEFAULT NULL,
    p_discount_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_total_price       numeric;
    v_final             numeric;
    v_customer_id       uuid;
    v_company_id        uuid;
    v_branch_id         uuid;
    v_payment_id        uuid;
    v_discount_id       uuid    := p_discount_id;
    v_discount_name     text    := p_discount_name;
    v_verified_discount numeric := 0;
    v_staff_id_text     text;
    v_staff_id_uuid     uuid;
    v_staff_name        text;
    v_booking_status    text;
    v_payment_status    text;
    v_clean_method      text;
    v_disc_result       jsonb;
    v_rows_updated      integer;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & AUTH GATES (The Vault Door)
    -- =========================================================================
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is required.';
    END IF;

    -- Fetch summary record to resolve tenant context
    SELECT total_price, customer_id, company_id, branch_id, staff_id::text, staff_name, booking_status, payment_status
    INTO   v_total_price, v_customer_id, v_company_id, v_branch_id, v_staff_id_text, v_staff_name, v_booking_status, v_payment_status
    FROM   app.bookings_for_business_transaction
    WHERE  booking_id = p_booking_id;

    IF v_total_price IS NULL THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Gate 1: Tenant check
    IF NOT shared.verify_tenant_access(v_company_id, v_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Access to company % / branch % denied.', v_company_id, v_branch_id;
    END IF;

    -- Gate 2: Subscription, Permission & Plan Feature
    PERFORM shared.check_subscription(v_company_id);
    PERFORM shared.check_permission(v_company_id, 'collect_payment');
    PERFORM shared.check_plan_feature(v_company_id, 'bookings_management');

    -- Lifecycle guards
    IF LOWER(COALESCE(v_payment_status, '')) = 'paid' THEN
        RAISE EXCEPTION 'Booking % has already been paid.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking_status, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot process payment for a cancelled booking.';
    END IF;

    -- Normalize and validate payment method (cash, upi, card only)
    v_clean_method := LOWER(COALESCE(NULLIF(TRIM(p_payment_method), ''), 'cash'));
    IF v_clean_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: "%". Accepted methods are cash, upi, card.', v_clean_method;
    END IF;

    -- Resolve primary staff UUID for audit log
    BEGIN
        v_staff_id_uuid := TRIM(SPLIT_PART(v_staff_id_text, ',', 1))::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_staff_id_uuid := NULL;
    END;

    -- =========================================================================
    -- SECTION 2: CORE PAYMENT SETTLEMENT (The 4 Steps)
    -- =========================================================================

    -- Centralized Discount Delegation to app.validate_discount
    IF p_discount_type IS NOT NULL AND LOWER(TRIM(p_discount_type)) NOT IN ('', 'none') THEN
        IF LOWER(TRIM(p_discount_type)) IN ('coupon', 'membership', 'offer') THEN
            -- Call Centralized Validator:
            -- For membership, pass v_discount_id UUID so validation matches app.membership_purchases by ID.
            v_disc_result := app.validate_discount(
                p_company_id      => v_company_id,
                p_branch_id       => v_branch_id,
                p_discount_type   => LOWER(TRIM(p_discount_type)),
                p_code_or_id      => CASE 
                                         WHEN LOWER(TRIM(p_discount_type)) = 'membership' THEN COALESCE(v_discount_id::text, '')
                                         WHEN LOWER(TRIM(p_discount_type)) = 'offer' THEN COALESCE(v_discount_id::text, v_discount_name)
                                         ELSE COALESCE(v_discount_name, v_discount_id::text)
                                     END,
                p_bill_amount     => v_total_price,
                p_customer_id     => v_customer_id,
                p_applicable_type => 'service'
            );

            IF NOT (v_disc_result->>'valid')::boolean THEN
                RAISE EXCEPTION 'Discount rejected: %', v_disc_result->>'reason';
            END IF;

            v_verified_discount := COALESCE((v_disc_result->>'discount_amount')::numeric, 0);
            v_discount_id       := NULLIF(v_disc_result->>'discount_id', '')::uuid;
            v_discount_name     := COALESCE(v_disc_result->>'discount_name', v_discount_name);

        ELSIF LOWER(TRIM(p_discount_type)) IN ('manual', 'custom') THEN
            -- Staff manual override (capped to total price)
            v_verified_discount := COALESCE(p_discount_amount, 0);
        ELSE
            RAISE EXCEPTION 'Unknown or unsupported discount type: "%".', p_discount_type;
        END IF;
    END IF;

    -- Clamp discount between 0 and bill total
    v_verified_discount := LEAST(v_total_price, GREATEST(0, v_verified_discount));
    -- Round to nearest integer so server always produces a round figure,
    -- matching the client's Math.round() and preventing amount mismatch errors.
    v_verified_discount := ROUND(v_verified_discount, 0);
    v_final := v_total_price - v_verified_discount;

    -- Validate client final amount matches server calculation
    IF p_final_amount IS NOT NULL AND ABS(p_final_amount - v_final) > 0.01 THEN
        RAISE EXCEPTION 'Payment amount mismatch: server calculated ₹%, client received ₹%.', v_final, p_final_amount;
    END IF;

    -- Step 1: Update app.bookings with row count check
    UPDATE app.bookings
    SET payment_status = 'paid',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking line items for booking %.', p_booking_id;
    END IF;

    -- Step 2: Update app.bookings_for_business_transaction with row count check
    UPDATE app.bookings_for_business_transaction
    SET payment_status  = 'paid',
        discount_type   = CASE WHEN v_verified_discount > 0 THEN p_discount_type ELSE NULL END,
        discount_name   = CASE WHEN v_verified_discount > 0 THEN v_discount_name ELSE NULL END,
        discount_amount = CASE WHEN v_verified_discount > 0 THEN v_verified_discount ELSE 0 END,
        final_amount    = v_final,
        updated_at      = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking summary for booking %.', p_booking_id;
    END IF;

    -- Step 3: Transition app.business_transactions from 'created' to 'paid'
    UPDATE app.business_transactions
    SET status          = 'paid',
        payment_method  = v_clean_method,
        paid_at         = NOW(),
        amount          = v_total_price,
        discount_type   = CASE WHEN v_verified_discount > 0 THEN p_discount_type ELSE NULL END,
        discount_name   = CASE WHEN v_verified_discount > 0 THEN v_discount_name ELSE NULL END,
        discount_amount = CASE WHEN v_verified_discount > 0 THEN v_verified_discount ELSE 0 END,
        final_amount    = v_final,
        notes           = COALESCE(p_notes, notes),
        updated_at      = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'created'
    RETURNING payment_id INTO v_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No open transaction found for booking: %. It may already be paid or cancelled.', p_booking_id;
    END IF;

    -- Step 4: Record discount usage in app.discount_usages (ONLY if discount was applied)
    IF v_verified_discount > 0 THEN
        INSERT INTO app.discount_usages (
            id, company_id, branch_id, customer_id, staff_id, staff_name,
            reference_type, reference_id, payment_id,
            discount_type, discount_id, membership_plan_id, discount_name, discount_amount,
            status, used_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_company_id, v_branch_id, v_customer_id, v_staff_id_uuid, v_staff_name,
            'booking', p_booking_id, v_payment_id,
            p_discount_type, v_discount_id,
            CASE WHEN LOWER(p_discount_type) = 'membership' THEN v_discount_id ELSE NULL END,
            v_discount_name, v_verified_discount,
            'applied', NOW(), NOW(), NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'booking_id',     p_booking_id,
        'payment_id',     v_payment_id,
        'total_price',    v_total_price,
        'discount',       v_verified_discount,
        'final_amount',   v_final,
        'payment_method', v_clean_method
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

