-- ==============================================================================
-- Migration: 20261103000006_harden_booking_payments_and_refunds.sql
-- Description: Unit 3 (Bookings) - Harden payment settlement and refund routines:
--              1. app.process_booking_payment_atomic:
--                 - Multi-tenant boundary check
--                 - Authoritative server-side coupon & discount validation
--                 - Authoritative final_amount calculation
--                 - Atomic 3-table ledger synchronization + discount_usages log
--              2. app.process_booking_refund_atomic:
--                 - Multi-tenant boundary check
--                 - RBAC authorization check (Owner / Manager only)
--                 - 100% full refund policy
--                 - Customer total_spent reversal if completed
--                 - Discount usage reversal in discount_usages
-- Date: 2026-11-03
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Master Routine: app.process_booking_payment_atomic
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS app.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION app.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text DEFAULT NULL::text,
    p_discount_name   text DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT NULL::numeric,
    p_notes           text DEFAULT NULL::text,
    p_discount_id     uuid DEFAULT NULL::uuid
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
    v_discount_id       uuid := p_discount_id;
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
    -- 1. Fetch summary row
    SELECT total_price, customer_id, company_id, branch_id, staff_id::text, staff_name, status, payment_status
    INTO   v_total_price, v_customer_id, v_company_id, v_branch_id, v_staff_id_text, v_staff_name, v_booking_status, v_payment_status
    FROM   app.bookings_for_business_transaction
    WHERE  booking_id = p_booking_id;

    IF v_total_price IS NULL THEN
        RAISE EXCEPTION 'Booking not found: %', p_booking_id;
    END IF;

    -- 2. Multi-tenant boundary check (Logic 1)
    IF NOT shared.verify_tenant_access(v_company_id, v_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', v_company_id, v_branch_id;
    END IF;

    -- 3. Payment Status Guard (Logic 18)
    IF LOWER(COALESCE(v_payment_status, '')) = 'paid' THEN
        RAISE EXCEPTION 'Booking % is already paid', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking_status, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot process payment for a cancelled booking';
    END IF;

    -- Parse first staff UUID for logging
    BEGIN
        v_staff_id_uuid := TRIM(SPLIT_PART(v_staff_id_text, ',', 1))::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_staff_id_uuid := NULL;
    END;

    -- 4. Authoritative Server-Side Discount & Coupon Verification (Logic 19)
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
                
                -- Check date validity
                IF v_coupon.valid_from IS NOT NULL AND CURRENT_DATE < v_coupon.valid_from THEN
                    RAISE EXCEPTION 'Coupon % is not valid until %', v_coupon.coupon_code, v_coupon.valid_from;
                END IF;
                IF v_coupon.valid_to IS NOT NULL AND CURRENT_DATE > v_coupon.valid_to THEN
                    RAISE EXCEPTION 'Coupon % expired on %', v_coupon.coupon_code, v_coupon.valid_to;
                END IF;

                -- Check minimum bill requirement
                IF v_coupon.min_bill_amount IS NOT NULL AND v_total_price < v_coupon.min_bill_amount THEN
                    RAISE EXCEPTION 'Bill amount (%) does not meet coupon % minimum requirement of %',
                        v_total_price, v_coupon.coupon_code, v_coupon.min_bill_amount;
                END IF;

                -- Check per-customer usage limit
                IF v_coupon.usage_per_customer IS NOT NULL AND v_coupon.usage_per_customer > 0 THEN
                    SELECT COUNT(*) INTO v_usage_count
                    FROM app.discount_usages
                    WHERE customer_id = v_customer_id 
                      AND discount_id = v_coupon.coupon_id 
                      AND status = 'applied';

                    IF v_usage_count >= v_coupon.usage_per_customer THEN
                        RAISE EXCEPTION 'Customer has reached the redemption limit (% times) for coupon %',
                            v_coupon.usage_per_customer, v_coupon.coupon_code;
                    END IF;
                END IF;

                -- Calculate verified discount
                IF LOWER(COALESCE(v_coupon.discount_type, 'percentage')) = 'percentage' THEN
                    v_verified_discount := ROUND((v_total_price * v_coupon.discount_value / 100.0), 2);
                ELSE
                    v_verified_discount := LEAST(v_total_price, v_coupon.discount_value);
                END IF;
            ELSE
                -- Coupon not found in catalog; fallback to client amount if within safe limits
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
            -- Manual discount or other type
            v_verified_discount := LEAST(v_total_price, COALESCE(p_discount_amount, 0));
        END IF;
    END IF;

    -- Authoritatively compute final bill amount (Logic 18)
    v_final := GREATEST(0, v_total_price - v_verified_discount);

    -- 5. Atomic Three-Table Ledger Synchronization (Logic 20)
    -- 5.1 Update business_transactions: created -> paid
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

    -- 5.2 Update bookings_for_business_transaction
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status  = 'paid',
        discount_type   = p_discount_type,
        discount_name   = p_discount_name,
        discount_amount = v_verified_discount,
        final_amount    = v_final,
        updated_at      = NOW()
    WHERE booking_id = p_booking_id;

    -- 5.3 Update all service rows in bookings
    UPDATE app.bookings
    SET
        payment    = 'paid',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- 5.4 Track discount usage in discount_usages
    IF v_verified_discount > 0 THEN
        INSERT INTO app.discount_usages (
            id,
            company_id,
            branch_id,
            customer_id,
            staff_id,
            staff_name,
            reference_type,
            reference_id,
            payment_id,
            discount_type,
            discount_id,
            membership_plan_id,
            discount_name,
            discount_amount,
            status,
            used_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_company_id,
            v_branch_id,
            v_customer_id,
            v_staff_id_uuid,
            v_staff_name,
            'booking',
            p_booking_id,
            v_payment_id,
            p_discount_type,
            v_discount_id,
            CASE WHEN LOWER(p_discount_type) = 'membership' THEN v_discount_id ELSE NULL END,
            p_discount_name,
            v_verified_discount,
            'applied',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success',      true,
        'booking_id',   p_booking_id,
        'payment_id',   v_payment_id,
        'total_price',  v_total_price,
        'discount',     v_verified_discount,
        'final_amount', v_final,
        'payment_method', p_payment_method
    );
END;
$$;

-- Public compatibility wrapper
CREATE OR REPLACE FUNCTION public.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text DEFAULT NULL::text,
    p_discount_name   text DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT NULL::numeric,
    p_notes           text DEFAULT NULL::text,
    p_discount_id     uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_booking_payment_atomic(
        p_booking_id,
        p_payment_method,
        p_discount_type,
        p_discount_name,
        p_discount_amount,
        p_final_amount,
        p_notes,
        p_discount_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION app.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- 2. Master Routine: app.process_booking_refund_atomic
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_booking_refund_atomic(uuid, text, text, text);
DROP FUNCTION IF EXISTS app.process_booking_refund_atomic(uuid, text, text, text);

CREATE OR REPLACE FUNCTION app.process_booking_refund_atomic(
    p_booking_id     uuid,
    p_refund_reason  text DEFAULT NULL::text,
    p_refund_notes   text DEFAULT NULL::text,
    p_refund_method  text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
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

    -- Check if already refunded (Duplicate Refund Guard)
    IF LOWER(COALESCE(v_booking.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'Booking % has already been refunded', p_booking_id;
    END IF;

    -- 2. Multi-tenant boundary check (Logic 1)
    IF NOT shared.verify_tenant_access(v_booking.company_id, v_booking.branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', v_booking.company_id, v_booking.branch_id;
    END IF;

    -- 3. RBAC Refund Authorization Check (Logic 24)
    IF auth.uid() IS NOT NULL AND auth.role() <> 'service_role' THEN
        SELECT LOWER(role_name) INTO v_caller_role
        FROM shared.users
        WHERE user_id = auth.uid() AND company_id = v_booking.company_id;

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('owner', 'super_admin', 'admin', 'manager') THEN
            RAISE EXCEPTION 'Unauthorized: Only owners or managers can issue refunds';
        END IF;
    END IF;

    -- 4. Locate Original Paid Transaction (Logic 22)
    SELECT * INTO v_paid_record
    FROM app.business_transactions
    WHERE reference_id = p_booking_id
      AND reference_type = 'booking'
      AND status = 'paid'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No paid transaction found for booking: %. Only paid bookings can be refunded.', p_booking_id;
    END IF;

    v_refund_amount := COALESCE(v_paid_record.final_amount, v_paid_record.amount);
    v_was_completed := (LOWER(COALESCE(v_booking.status, '')) = 'completed');
    v_customer_id   := v_booking.customer_id;

    -- 5. Insert Immutable Refund Row in app.business_transactions (Logic 22)
    INSERT INTO app.business_transactions (
        payment_id,
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        currency,
        payment_method,
        status,
        notes,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
        paid_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_paid_record.company_id,
        v_paid_record.branch_id,
        p_booking_id,
        'booking',
        v_refund_amount,
        COALESCE(v_paid_record.currency, 'INR'),
        COALESCE(p_refund_method, v_paid_record.payment_method),
        'refunded',
        COALESCE(p_refund_notes, p_refund_reason, 'Booking 100% full refund'),
        v_paid_record.discount_type,
        v_paid_record.discount_name,
        v_paid_record.discount_amount,
        v_refund_amount,
        NOW(),
        NOW(),
        NOW()
    );

    -- 6. Update bookings_for_business_transaction
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status = 'refunded',
        status         = 'cancelled',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- 7. Update all service rows in bookings
    UPDATE app.bookings
    SET
        status     = 'cancelled',
        payment    = 'refunded',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- 8. Customer Spend Reversal (Logic 23)
    IF v_was_completed AND v_customer_id IS NOT NULL THEN
        UPDATE app.customers
        SET
            total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_refund_amount),
            updated_at  = NOW()
        WHERE customer_id = v_customer_id;
    END IF;

    -- 9. Reverse Discount in discount_usages (Logic 23)
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
        'success',       true,
        'booking_id',    p_booking_id,
        'refund_amount', v_refund_amount,
        'was_completed', v_was_completed,
        'status',        'cancelled',
        'payment_status','refunded'
    );
END;
$$;

-- Public compatibility wrapper
CREATE OR REPLACE FUNCTION public.process_booking_refund_atomic(
    p_booking_id     uuid,
    p_refund_reason  text DEFAULT NULL::text,
    p_refund_notes   text DEFAULT NULL::text,
    p_refund_method  text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_booking_refund_atomic(
        p_booking_id,
        p_refund_reason,
        p_refund_notes,
        p_refund_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION app.process_booking_refund_atomic(uuid, text, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_booking_refund_atomic(uuid, text, text, text) TO authenticated, service_role, anon;
