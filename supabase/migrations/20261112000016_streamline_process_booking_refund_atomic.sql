-- Migration: 20261112000016_streamline_process_booking_refund_atomic.sql
-- Description:
--   Streamline RPC #5 (process_booking_refund_atomic) to strict 2-Section architecture:
--   Section 1: Security & Auth Gates (Tenant verify + 3 Gates: Subscription, Permission, Plan Feature).
--   Section 2: Core Option A Execution (3 Steps):
--     Step 1: Pre-flight Verification & Original Payment Lookup
--     Step 2: Atomic Mutation of the 3 Triad Tables (business_transactions insert, bookings & summary update)
--     Step 3: Discount Usage Reversal (app.discount_usages)

-- ── 1. DROP ALL EXISTING OVERLOADS & LEGACY STUBS ────────────────────────────
DROP FUNCTION IF EXISTS app.process_booking_refund_atomic(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS app.process_booking_refund_atomic(uuid, uuid, uuid, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.process_booking_refund_atomic(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_booking_refund_atomic(uuid, uuid, uuid, text, numeric) CASCADE;

-- ── 2. MASTER FUNCTION IN APP SCHEMA ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_booking_refund_atomic(
    p_booking_id      uuid,
    p_refund_reason   text DEFAULT NULL::text,
    p_refund_notes    text DEFAULT NULL::text,
    p_refund_method   text DEFAULT 'cash'::text,
    p_company_id      uuid DEFAULT NULL::uuid,
    p_branch_id       uuid DEFAULT NULL::uuid,
    p_refund_amount   numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking           record;
    v_paid_record       record;
    v_refund_id         uuid := gen_random_uuid();
    v_company_id        uuid;
    v_branch_id         uuid;
    v_refund_amount     numeric;
    v_clean_method      text;
    v_rows_updated      integer;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & AUTH GATES (The Vault Door)
    -- =========================================================================
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is required.';
    END IF;

    -- Fetch booking summary to resolve tenant context & lock row
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    v_company_id := COALESCE(p_company_id, v_booking.company_id);
    v_branch_id  := COALESCE(p_branch_id, v_booking.branch_id);

    IF p_company_id IS NOT NULL AND p_company_id <> v_booking.company_id THEN
        RAISE EXCEPTION 'Company ID mismatch for booking %.', p_booking_id;
    END IF;

    -- Gate 1: Tenant Isolation
    IF NOT shared.verify_tenant_access(v_company_id, v_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Access to company % / branch % denied.', v_company_id, v_branch_id;
    END IF;

    -- Gate 2: Subscription Check
    PERFORM shared.check_subscription(v_company_id);

    -- Gate 3: Permission Check (booking_refund)
    PERFORM shared.check_permission(v_company_id, 'booking_refund');

    -- Gate 4: Plan Feature Check (bookings_management)
    PERFORM shared.check_plan_feature(v_company_id, 'bookings_management');

    -- =========================================================================
    -- SECTION 2: CORE LOGIC (3 Steps)
    -- =========================================================================

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 1: Pre-flight Verification & Original Payment Lookup
    -- ─────────────────────────────────────────────────────────────────────────
    -- Guard: Check if booking is already refunded
    IF LOWER(COALESCE(v_booking.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'Booking % has already been refunded.', p_booking_id;
    END IF;

    -- Locate original paid transaction in app.business_transactions
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

    -- Authoritative refund amount: defaults to full paid amount, or custom amount bounded by paid amount
    v_refund_amount := COALESCE(v_paid_record.final_amount, v_paid_record.amount, 0);

    IF p_refund_amount IS NOT NULL THEN
        IF p_refund_amount <= 0 THEN
            RAISE EXCEPTION 'Refund amount must be greater than zero.';
        END IF;
        IF p_refund_amount > v_refund_amount THEN
            RAISE EXCEPTION 'Refund amount (%) exceeds original paid amount (%).', p_refund_amount, v_refund_amount;
        END IF;
        v_refund_amount := p_refund_amount;
    END IF;

    -- Clean and whitelist payment method
    v_clean_method := LOWER(COALESCE(NULLIF(TRIM(p_refund_method), ''), v_paid_record.payment_method, 'cash'));
    IF v_clean_method NOT IN ('cash', 'card', 'upi', 'other') THEN
        v_clean_method := 'cash';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 2: Atomic Mutation of the 3 Triad Tables
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Insert refund record into app.business_transactions
    INSERT INTO app.business_transactions (
        payment_id, company_id, branch_id,
        reference_id, reference_type,
        amount, currency, payment_method, status, notes,
        created_by,
        discount_type, discount_name, discount_amount,
        final_amount, paid_at, created_at, updated_at
    ) VALUES (
        v_refund_id,
        v_paid_record.company_id, v_paid_record.branch_id,
        p_booking_id, 'booking',
        v_refund_amount, COALESCE(v_paid_record.currency, 'INR'),
        v_clean_method,
        'refunded',
        COALESCE(p_refund_notes, p_refund_reason, 'Booking refund processed'),
        auth.uid(),
        v_paid_record.discount_type, v_paid_record.discount_name, v_paid_record.discount_amount,
        v_refund_amount, NOW(), NOW(), NOW()
    );

    -- 2. Update summary row in app.bookings_for_business_transaction (preserves booking_status)
    UPDATE app.bookings_for_business_transaction
    SET
        payment_status = 'refunded',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking summary for booking %.', p_booking_id;
    END IF;

    -- 3. Update all service line items in app.bookings (preserves booking_status)
    UPDATE app.bookings
    SET
        payment_status = 'refunded',
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking service items for booking %.', p_booking_id;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 3: Discount Usage Reversal (app.discount_usages)
    -- ─────────────────────────────────────────────────────────────────────────
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
        'refund_id',      v_refund_id,
        'refund_amount',  v_refund_amount,
        'payment_status', 'refunded',
        'booking_status', v_booking.booking_status,
        'message',        format('Refund of %s successfully processed for booking %s', v_refund_amount, p_booking_id)
    );
END;
$$;

-- ── 3. PUBLIC GATEWAY ROUTINE ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_booking_refund_atomic(
    p_booking_id      uuid,
    p_refund_reason   text DEFAULT NULL::text,
    p_refund_notes    text DEFAULT NULL::text,
    p_refund_method   text DEFAULT 'cash'::text,
    p_company_id      uuid DEFAULT NULL::uuid,
    p_branch_id       uuid DEFAULT NULL::uuid,
    p_refund_amount   numeric DEFAULT NULL::numeric
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
        p_refund_method,
        p_company_id,
        p_branch_id,
        p_refund_amount
    );
END;
$$;

-- ── 4. PERMISSIONS & SCHEMA CACHE RELOAD ──────────────────────────────────────
REVOKE ALL ON FUNCTION app.process_booking_refund_atomic(uuid, text, text, text, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.process_booking_refund_atomic(uuid, text, text, text, uuid, uuid, numeric) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.process_booking_refund_atomic(uuid, text, text, text, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_booking_refund_atomic(uuid, text, text, text, uuid, uuid, numeric) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

