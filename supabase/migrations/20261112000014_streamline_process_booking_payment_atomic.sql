-- Migration: 20261112000014_streamline_process_booking_payment_atomic.sql
-- Description:
--   Streamline RPC #3 (process_booking_payment_atomic) to strict 2-Section architecture:
--   Section 1: Security & Auth Gates (Tenant verify + 3 Gates: Subscription, Permission, Plan Feature).
--   Section 2: Hardened Bank-Grade Payment Settlement (The 4 Steps):
--     - Strict coupon validation with concurrency locks (FOR UPDATE); zero fallback to client amounts.
--     - Strict customer membership purchase verification (checks app.membership_purchases for customer_id, paid status & expiry).
--     - Payment method normalization and whitelisting ('cash', 'upi', 'card' with NULLIF empty string protection).
--     - Cap discount to bill total; validate client p_final_amount against server-calculated amount.
--     - Step 1: app.bookings — update payment_status = 'paid' with ROW_COUNT verification.
--     - Step 2: app.bookings_for_business_transaction — update payment_status = 'paid' + conditional discount metadata.
--     - Step 3: app.business_transactions — transition status 'created' -> 'paid', record paid_at, payment_method, final_amount.
--     - Step 4: app.discount_usages — insert usage audit log ONLY if discount applied (> 0), linked to payment_id.

-- ── 1. DROP ALL EXISTING OVERLOADS & LEGACY STUBS ────────────────────────────
DROP FUNCTION IF EXISTS app.process_booking_payment_atomic(uuid, uuid, uuid, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS app.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_booking_payment_atomic(uuid, uuid, uuid, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) CASCADE;

-- ── 2. MASTER FUNCTION IN APP SCHEMA ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text    DEFAULT NULL::text,
    p_discount_name   text    DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT NULL::numeric,
    p_notes           text    DEFAULT NULL::text,
    p_discount_id     uuid    DEFAULT NULL::uuid
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
    v_verified_discount numeric := 0;
    v_staff_id_text     text;
    v_staff_id_uuid     uuid;
    v_staff_name        text;
    v_booking_status    text;
    v_payment_status    text;
    v_clean_method      text;
    v_coupon            record;
    v_membership        record;
    v_usage_count       integer;
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

    -- Normalize and validate payment method (Issue 7 & 8)
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

    -- Discount Verification & Calculation (Issues 2, 3, 4, 5, 6)
    IF p_discount_type IS NOT NULL AND LOWER(TRIM(p_discount_type)) NOT IN ('', 'none') THEN
        IF LOWER(p_discount_type) = 'coupon' THEN
            -- Concurrency-safe coupon row lock (Issue 5)
            SELECT * INTO v_coupon
            FROM app.coupons
            WHERE company_id = v_company_id
              AND (coupon_id = v_discount_id OR LOWER(coupon_code) = LOWER(TRIM(p_discount_name)))
              AND LOWER(status) = 'active'
            FOR UPDATE;

            -- Reject invalid coupons without fallback (Issue 2)
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Coupon "%" not found or inactive.', COALESCE(p_discount_name, v_discount_id::text);
            END IF;

            v_discount_id := v_coupon.coupon_id;

            IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < CURRENT_DATE THEN
                RAISE EXCEPTION 'Coupon "%" expired on %.', v_coupon.coupon_code, v_coupon.valid_until;
            END IF;
            IF v_coupon.valid_from IS NOT NULL AND v_coupon.valid_from > CURRENT_DATE THEN
                RAISE EXCEPTION 'Coupon "%" is not active yet (valid from %).', v_coupon.coupon_code, v_coupon.valid_from;
            END IF;
            IF v_coupon.min_bill_amount IS NOT NULL AND v_total_price < v_coupon.min_bill_amount THEN
                RAISE EXCEPTION 'Order total ₹% is below the minimum requirement of ₹% for coupon "%".',
                    v_total_price, v_coupon.min_bill_amount, v_coupon.coupon_code;
            END IF;
            IF v_coupon.usage_per_customer IS NOT NULL AND v_coupon.usage_per_customer > 0 THEN
                SELECT COUNT(*) INTO v_usage_count
                FROM app.discount_usages
                WHERE customer_id = v_customer_id
                  AND discount_id = v_coupon.coupon_id
                  AND status      = 'applied';
                IF v_usage_count >= v_coupon.usage_per_customer THEN
                    RAISE EXCEPTION 'Customer has reached the redemption limit (%) for coupon "%".',
                        v_coupon.usage_per_customer, v_coupon.coupon_code;
                END IF;
            END IF;

            IF LOWER(COALESCE(v_coupon.discount_type, 'percentage')) = 'percentage' THEN
                v_verified_discount := ROUND((v_total_price * v_coupon.discount_value / 100.0), 2);
            ELSE
                v_verified_discount := v_coupon.discount_value;
            END IF;

        ELSIF LOWER(p_discount_type) = 'membership' THEN
            -- Verify customer actually purchased and holds an active membership (Issue 6)
            SELECT mp.membership_id, mp.plan_name, m.discount_type, m.discount_value
            INTO v_membership
            FROM app.membership_purchases mp
            JOIN app.memberships m ON m.membership_id = mp.membership_id
            WHERE mp.customer_id = v_customer_id
              AND mp.company_id  = v_company_id
              AND (mp.membership_id = v_discount_id OR LOWER(mp.plan_name) = LOWER(TRIM(p_discount_name)))
              AND LOWER(COALESCE(mp.status, '')) = 'active'
              AND LOWER(COALESCE(mp.payment_status, '')) = 'paid'
              AND (mp.expiry_date IS NULL OR mp.expiry_date >= CURRENT_DATE)
            LIMIT 1;

            -- Reject invalid memberships without fallback (Issue 3)
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Customer does not hold an active, valid membership for "%".', COALESCE(p_discount_name, v_discount_id::text);
            END IF;

            v_discount_id := v_membership.membership_id;
            IF LOWER(COALESCE(v_membership.discount_type, 'percentage')) = 'percentage' THEN
                v_verified_discount := ROUND((v_total_price * v_membership.discount_value / 100.0), 2);
            ELSE
                v_verified_discount := v_membership.discount_value;
            END IF;

        ELSIF LOWER(p_discount_type) IN ('manual', 'offer', 'custom') THEN
            -- Manual discount entered by authorized staff
            v_verified_discount := COALESCE(p_discount_amount, 0);
        ELSE
            RAISE EXCEPTION 'Unknown or unsupported discount type: "%".', p_discount_type;
        END IF;
    END IF;

    -- Ensure discount is clamped between 0 and bill total (Issue 4)
    v_verified_discount := LEAST(v_total_price, GREATEST(0, v_verified_discount));
    v_final := v_total_price - v_verified_discount;

    -- Validate client final amount matches server calculation (Issue 1)
    IF p_final_amount IS NOT NULL AND ABS(p_final_amount - v_final) > 0.01 THEN
        RAISE EXCEPTION 'Payment amount mismatch: server calculated ₹%, client received ₹%.', v_final, p_final_amount;
    END IF;

    -- Step 1: Update app.bookings with row count check (Issue 9)
    UPDATE app.bookings
    SET payment_status = 'paid',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking line items for booking %.', p_booking_id;
    END IF;

    -- Step 2: Update app.bookings_for_business_transaction with row count check (Issue 9)
    UPDATE app.bookings_for_business_transaction
    SET payment_status  = 'paid',
        discount_type   = CASE WHEN v_verified_discount > 0 THEN p_discount_type ELSE NULL END,
        discount_name   = CASE WHEN v_verified_discount > 0 THEN p_discount_name ELSE NULL END,
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
        discount_name   = CASE WHEN v_verified_discount > 0 THEN p_discount_name ELSE NULL END,
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
        'payment_method', v_clean_method
    );
END;
$$;

-- ── 3. PUBLIC GATEWAY WRAPPER ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_booking_payment_atomic(
    p_booking_id      uuid,
    p_payment_method  text,
    p_discount_type   text    DEFAULT NULL::text,
    p_discount_name   text    DEFAULT NULL::text,
    p_discount_amount numeric DEFAULT 0,
    p_final_amount    numeric DEFAULT NULL::numeric,
    p_notes           text    DEFAULT NULL::text,
    p_discount_id     uuid    DEFAULT NULL::uuid
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

-- ── 4. GRANTS & RELOAD ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION app.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.process_booking_payment_atomic(uuid, text, text, text, numeric, numeric, text, uuid) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
