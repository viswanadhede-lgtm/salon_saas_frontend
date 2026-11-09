-- Migration: Rename status->booking_status, payment->payment_status
-- ALTER TABLE already applied. This migration fixes all affected DB functions.

-- ============================================================
-- 1. cancel_booking_atomic
-- ============================================================
CREATE OR REPLACE FUNCTION app.cancel_booking_atomic(
    p_booking_id    uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_cancel_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'cancel_booking');

    SELECT * INTO v_booking
    FROM app.bookings
    WHERE booking_id = p_booking_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.booking_status,'')) = 'cancelled' THEN
        RAISE EXCEPTION 'Booking is already cancelled.';
    END IF;

    UPDATE app.bookings
    SET booking_status = 'cancelled',
        cancel_reason  = p_cancel_reason,
        cancelled_at   = NOW(),
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'booking_status', 'cancelled');
END;
$$;


-- ============================================================
-- 2. update_booking_status_atomic
-- ============================================================
CREATE OR REPLACE FUNCTION app.update_booking_status_atomic(
    p_booking_id uuid,
    p_company_id uuid,
    p_branch_id  uuid,
    p_new_status text,
    p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking           record;
    v_norm_status       text    := LOWER(TRIM(p_new_status));
    v_allowed_statuses  text[]  := ARRAY['booked','confirmed','in_progress','completed','cancelled','no-show'];
BEGIN
    -- 1. Input sanitization
    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id is mandatory'; END IF;
    IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id is mandatory'; END IF;
    IF v_norm_status IS NULL OR NOT (v_norm_status = ANY(v_allowed_statuses)) THEN
        RAISE EXCEPTION 'Invalid booking status: %. Allowed: booked, confirmed, in_progress, completed, cancelled, no-show', p_new_status;
    END IF;

    -- 2. Tenant check
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    -- 3. Fetch existing summary row
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company', p_booking_id;
    END IF;

    -- 4. State machine transition rules
    IF LOWER(COALESCE(v_booking.booking_status, '')) = 'completed' AND v_norm_status IN ('booked', 'in_progress') THEN
        RAISE EXCEPTION 'Completed bookings cannot transition back to %', v_norm_status;
    END IF;

    IF LOWER(COALESCE(v_booking.booking_status, '')) = 'cancelled' AND v_norm_status = 'completed' THEN
        RAISE EXCEPTION 'Cancelled bookings cannot transition directly to completed';
    END IF;

    -- 5. Completion requires payment
    IF v_norm_status = 'completed' THEN
        IF LOWER(COALESCE(v_booking.payment_status, 'pending')) <> 'paid' THEN
            RAISE EXCEPTION 'Cannot mark booking as completed: Payment status is % (must be paid before completion)', v_booking.payment_status;
        END IF;
    END IF;

    -- 6. Atomic status update across tables
    UPDATE app.bookings
    SET
        booking_status = v_norm_status,
        notes          = COALESCE(p_notes, notes),
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    UPDATE app.bookings_for_business_transaction
    SET
        booking_status = v_norm_status,
        notes          = COALESCE(p_notes, notes),
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- If cancelled, cancel any open unpaid transaction
    IF v_norm_status = 'cancelled' THEN
        UPDATE app.business_transactions
        SET
            status     = 'cancelled',
            updated_at = NOW()
        WHERE reference_id   = p_booking_id
          AND reference_type = 'booking'
          AND status         = 'created';
    END IF;

    RETURN jsonb_build_object(
        'success',          true,
        'booking_id',       p_booking_id,
        'previous_status',  v_booking.booking_status,
        'new_status',       v_norm_status,
        'payment_status',   v_booking.payment_status
    );
END;
$$;


-- ============================================================
-- 3. process_booking_payment_atomic — only fix: payment->'paid' on bookings
--    and read booking_status from bookings_for_business_transaction
-- ============================================================
CREATE OR REPLACE FUNCTION app.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text    DEFAULT NULL,
    p_discount_name   text    DEFAULT NULL,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT NULL,
    p_notes           text    DEFAULT NULL,
    p_discount_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_price       numeric;
    v_final             numeric;
    v_customer_id       uuid;
    v_company_id        uuid;
    v_branch_id         uuid;
    v_payment_id        uuid;
    v_discount_id       uuid    := p_discount_id;
    v_verified_discount numeric := 0;
    v_staff_id_text     text;
    v_staff_id_uuid     uuid;
    v_staff_name        text;
    v_booking_status    text;
    v_payment_status    text;
    v_coupon            record;
    v_membership        record;
    v_usage_count       integer;
BEGIN
    -- 1. Fetch summary row (booking_status = renamed column)
    SELECT total_price, customer_id, company_id, branch_id, staff_id::text, staff_name, booking_status, payment_status
    INTO   v_total_price, v_customer_id, v_company_id, v_branch_id, v_staff_id_text, v_staff_name, v_booking_status, v_payment_status
    FROM   app.bookings_for_business_transaction
    WHERE  booking_id = p_booking_id;

    IF v_total_price IS NULL THEN
        RAISE EXCEPTION 'Booking not found: %', p_booking_id;
    END IF;

    -- 2. Tenant check
    IF NOT shared.verify_tenant_access(v_company_id, v_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', v_company_id, v_branch_id;
    END IF;

    -- 3. Guards
    IF LOWER(COALESCE(v_payment_status, '')) = 'paid' THEN
        RAISE EXCEPTION 'Booking % is already paid', p_booking_id;
    END IF;
    IF LOWER(COALESCE(v_booking_status, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot process payment for a cancelled booking';
    END IF;

    -- Parse first staff UUID
    BEGIN
        v_staff_id_uuid := TRIM(SPLIT_PART(v_staff_id_text, ',', 1))::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_staff_id_uuid := NULL;
    END;

    -- 4. Discount verification
    IF p_discount_type IS NOT NULL AND LOWER(TRIM(p_discount_type)) NOT IN ('', 'none') THEN
        IF LOWER(p_discount_type) = 'coupon' THEN
            SELECT * INTO v_coupon
            FROM app.coupons
            WHERE company_id = v_company_id
              AND (coupon_id = v_discount_id OR LOWER(coupon_code) = LOWER(TRIM(p_discount_name)))
              AND LOWER(status) = 'active'
            LIMIT 1;

            IF FOUND THEN
                v_discount_id := v_coupon.coupon_id;
                IF v_coupon.valid_from IS NOT NULL AND CURRENT_DATE < v_coupon.valid_from THEN
                    RAISE EXCEPTION 'Coupon % is not valid until %', v_coupon.coupon_code, v_coupon.valid_from;
                END IF;
                IF v_coupon.valid_to IS NOT NULL AND CURRENT_DATE > v_coupon.valid_to THEN
                    RAISE EXCEPTION 'Coupon % expired on %', v_coupon.coupon_code, v_coupon.valid_to;
                END IF;
                IF v_coupon.min_bill_amount IS NOT NULL AND v_total_price < v_coupon.min_bill_amount THEN
                    RAISE EXCEPTION 'Bill amount (%) does not meet coupon % minimum of %',
                        v_total_price, v_coupon.coupon_code, v_coupon.min_bill_amount;
                END IF;
                IF v_coupon.usage_per_customer IS NOT NULL AND v_coupon.usage_per_customer > 0 THEN
                    SELECT COUNT(*) INTO v_usage_count
                    FROM app.discount_usages
                    WHERE customer_id = v_customer_id
                      AND discount_id = v_coupon.coupon_id
                      AND status      = 'applied';
                    IF v_usage_count >= v_coupon.usage_per_customer THEN
                        RAISE EXCEPTION 'Customer has reached redemption limit (%) for coupon %',
                            v_coupon.usage_per_customer, v_coupon.coupon_code;
                    END IF;
                END IF;
                IF LOWER(COALESCE(v_coupon.discount_type, 'percentage')) = 'percentage' THEN
                    v_verified_discount := ROUND((v_total_price * v_coupon.discount_value / 100.0), 2);
                ELSE
                    v_verified_discount := LEAST(v_total_price, v_coupon.discount_value);
                END IF;
            ELSE
                v_verified_discount := LEAST(v_total_price, COALESCE(p_discount_amount, 0));
            END IF;

        ELSIF LOWER(p_discount_type) = 'membership' THEN
            SELECT * INTO v_membership
            FROM app.memberships
            WHERE company_id = v_company_id
              AND (membership_id = v_discount_id OR LOWER(plan_name) = LOWER(TRIM(p_discount_name)))
              AND LOWER(status) = 'active'
            LIMIT 1;

            IF FOUND THEN
                v_discount_id := v_membership.membership_id;
                IF LOWER(COALESCE(v_membership.discount_type, 'percentage')) = 'percentage' THEN
                    v_verified_discount := ROUND((v_total_price * v_membership.discount_value / 100.0), 2);
                ELSE
                    v_verified_discount := LEAST(v_total_price, v_membership.discount_value);
                END IF;
            ELSE
                v_verified_discount := LEAST(v_total_price, COALESCE(p_discount_amount, 0));
            END IF;
        ELSE
            v_verified_discount := LEAST(v_total_price, COALESCE(p_discount_amount, 0));
        END IF;
    END IF;

    v_final := GREATEST(0, v_total_price - v_verified_discount);

    -- 5. Atomic three-table ledger sync
    -- 5.1 business_transactions: created → paid
    UPDATE app.business_transactions
    SET
        status          = 'paid',
        payment_method  = LOWER(COALESCE(p_payment_method, 'cash')),
        paid_at         = NOW(),
        amount          = v_total_price,
        discount_type   = p_discount_type,
        discount_name   = p_discount_name,
        discount_amount = v_verified_discount,
        final_amount    = v_final,
        notes           = COALESCE(p_notes, notes),
        updated_at      = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'created'
    RETURNING payment_id INTO v_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No open transaction found for booking: %. It may already be paid.', p_booking_id;
    END IF;

    -- 5.2 bookings_for_business_transaction
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status  = 'paid',
        discount_type   = p_discount_type,
        discount_name   = p_discount_name,
        discount_amount = v_verified_discount,
        final_amount    = v_final,
        updated_at      = NOW()
    WHERE booking_id = p_booking_id;

    -- 5.3 all service rows in bookings (payment_status = renamed from payment)
    UPDATE app.bookings
    SET
        payment_status = 'paid',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- 5.4 Discount usage tracking
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
            p_discount_name, v_verified_discount,
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
        'payment_method', p_payment_method
    );
END;
$$;


-- ============================================================
-- 4. process_booking_refund_atomic
--    Fixes: v_booking.status -> booking_status, payment->'refunded' -> payment_status, 
--           status='cancelled' on bookings -> booking_status
-- ============================================================
CREATE OR REPLACE FUNCTION app.process_booking_refund_atomic(
    p_booking_id    uuid,
    p_refund_reason text DEFAULT NULL,
    p_refund_notes  text DEFAULT NULL,
    p_refund_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

    -- 6. Update bookings_for_business_transaction
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status = 'refunded',
        booking_status = 'cancelled',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- 7. Update all service rows in app.bookings (renamed columns)
    UPDATE app.bookings
    SET
        booking_status = 'cancelled',
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
        'booking_status', 'cancelled',
        'payment_status', 'refunded'
    );
END;
$$;


-- ============================================================
-- 5. delete_staff_atomic — fix: booking status check
-- ============================================================
CREATE OR REPLACE FUNCTION app.delete_staff_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_staff_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_staff_name      text;
    v_future_bookings int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT staff_name INTO v_staff_name
    FROM app.staff
    WHERE staff_id   = p_staff_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status    <> 'deleted';

    IF v_staff_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff member not found or already deleted.');
    END IF;

    -- Dependency guard: upcoming active bookings (using renamed column)
    SELECT COUNT(*) INTO v_future_bookings
    FROM app.bookings
    WHERE staff_id     = p_staff_id
      AND company_id   = p_company_id
      AND branch_id    = p_branch_id
      AND booking_status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_future_bookings > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete this staff member because there are ' || v_future_bookings ||
                     ' upcoming active booking(s) assigned to them. Please reschedule or reassign first.'
        );
    END IF;

    -- Soft-delete staff
    UPDATE app.staff
    SET status     = 'deleted',
        updated_at = NOW()
    WHERE staff_id = p_staff_id;

    -- Clean up future schedules
    DELETE FROM app.staff_schedule
    WHERE staff_id      = p_staff_id
      AND company_id    = p_company_id
      AND branch_id     = p_branch_id
      AND schedule_date >= CURRENT_DATE;

    RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id, 'status', 'deleted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
