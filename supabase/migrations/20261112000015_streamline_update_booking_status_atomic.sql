-- Migration: 20261112000015_streamline_update_booking_status_atomic.sql
-- Description:
--   Streamline RPC #4 (update_booking_status_atomic) to strict 2-Section architecture:
--   Section 1: Security & Auth Gates (Tenant verify + 3 Gates: Subscription, Permission, Plan Feature).
--   Section 2: Core Status Logic:
--     Step 1: Fetch Existing Booking & Status Alias Normalization + State Machine Rules
--     Step 2: Atomic Updates on Bookings Tables (app.bookings and app.bookings_for_business_transaction)
--     Step 3: Financial Triad Synchronization (cancel open receivable in app.business_transactions on cancelled/no-show)

-- ── 1. DROP ALL EXISTING OVERLOADS & LEGACY STUBS ────────────────────────────
DROP FUNCTION IF EXISTS app.update_booking_status_atomic(uuid, uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_booking_status_atomic(uuid, uuid, uuid, text, text) CASCADE;

-- ── 2. MASTER FUNCTION IN APP SCHEMA ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.update_booking_status_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid DEFAULT NULL::uuid,
    p_new_status      text DEFAULT NULL::text,
    p_notes           text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking           record;
    v_raw_status        text;
    v_norm_status       text;
    v_rows_updated      integer;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & AUTH GATES (The Vault Door)
    -- =========================================================================
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is required.';
    END IF;

    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is required.';
    END IF;

    -- Gate 1: Tenant check
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Access to company % / branch % denied.', p_company_id, p_branch_id;
    END IF;

    -- Gate 2: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Gate 3: Permission check
    PERFORM shared.check_permission(p_company_id, 'update_booking');

    -- Gate 4: Plan feature check
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- =========================================================================
    -- SECTION 2: CORE LOGIC (3 Steps)
    -- =========================================================================

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 1: Status Alias Normalization & State Machine Guards
    -- ─────────────────────────────────────────────────────────────────────────
    v_raw_status := LOWER(TRIM(COALESCE(p_new_status, '')));

    IF v_raw_status IN ('in-progress', 'in_progress', 'in-service', 'inprogress') THEN
        v_norm_status := 'in_progress';
    ELSIF v_raw_status IN ('no-show', 'no_show', 'noshow') THEN
        v_norm_status := 'no-show';
    ELSIF v_raw_status IN ('booked', 'confirmed', 'completed', 'cancelled') THEN
        v_norm_status := v_raw_status;
    ELSE
        RAISE EXCEPTION 'Invalid booking status: %. Allowed: booked, confirmed, in_progress, completed, cancelled, no-show', p_new_status;
    END IF;

    -- Lock and fetch existing booking summary row
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company.', p_booking_id;
    END IF;

    -- State machine guardrails:
    -- Guard 1: Completed bookings cannot transition back to booked or in_progress
    IF LOWER(COALESCE(v_booking.booking_status, '')) = 'completed' AND v_norm_status IN ('booked', 'in_progress') THEN
        RAISE EXCEPTION 'Completed bookings cannot transition back to %', v_norm_status;
    END IF;

    -- Guard 2: Cancelled bookings cannot jump directly to completed
    IF LOWER(COALESCE(v_booking.booking_status, '')) = 'cancelled' AND v_norm_status = 'completed' THEN
        RAISE EXCEPTION 'Cancelled bookings cannot transition directly to completed';
    END IF;

    -- Guard 3: Completion requires paid status
    IF v_norm_status = 'completed' THEN
        IF LOWER(COALESCE(v_booking.payment_status, 'pending')) <> 'paid' THEN
            RAISE EXCEPTION 'Cannot mark booking as completed: Payment status is % (must be paid before completion)', v_booking.payment_status;
        END IF;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 2: Atomic Update across Bookings Tables
    -- ─────────────────────────────────────────────────────────────────────────
    -- Update all line items in app.bookings
    UPDATE app.bookings
    SET
        booking_status = v_norm_status,
        notes          = COALESCE(p_notes, notes),
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    -- Update summary row in app.bookings_for_business_transaction
    UPDATE app.bookings_for_business_transaction
    SET
        booking_status = v_norm_status,
        notes          = COALESCE(p_notes, notes),
        updated_at     = NOW()
    WHERE booking_id = p_booking_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to update booking summary for booking %', p_booking_id;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Step 3: Financial Triad Synchronization (app.business_transactions)
    -- ─────────────────────────────────────────────────────────────────────────
    -- If status is cancelled or no-show, cancel any open unpaid receivable
    IF v_norm_status IN ('cancelled', 'no-show') THEN
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
        'payment_status',   v_booking.payment_status,
        'message',          format('Booking status successfully updated from %s to %s', v_booking.booking_status, v_norm_status)
    );
END;
$$;

-- ── 3. PUBLIC GATEWAY ROUTINE ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_booking_status_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid DEFAULT NULL::uuid,
    p_new_status      text DEFAULT NULL::text,
    p_notes           text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_booking_status_atomic(
        p_booking_id,
        p_company_id,
        p_branch_id,
        p_new_status,
        p_notes
    );
END;
$$;

-- ── 4. PERMISSIONS & SCHEMA CACHE RELOAD ──────────────────────────────────────
REVOKE ALL ON FUNCTION app.update_booking_status_atomic(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_booking_status_atomic(uuid, uuid, uuid, text, text) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.update_booking_status_atomic(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, uuid, text, text) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

