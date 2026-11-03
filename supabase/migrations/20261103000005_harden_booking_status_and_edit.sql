-- ==============================================================================
-- Migration: 20261103000005_harden_booking_status_and_edit.sql
-- Description: Unit 2 (Bookings) - Deploy atomic status state machine & hardened edit routine:
--              1. app.update_booking_status_atomic (replaces raw client mutations)
--              2. Enforces prepayment requirement before marking completed
--              3. Hardened app.update_booking_atomic with catalog price lookup & collision check
-- Date: 2026-11-03
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Master Routine: app.update_booking_status_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_booking_status_atomic(
    p_booking_id  uuid,
    p_company_id  uuid,
    p_branch_id   uuid,
    p_new_status  text,
    p_notes       text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking           record;
    v_norm_status       text := LOWER(TRIM(p_new_status));
    v_allowed_statuses  text[] := ARRAY['booked', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no-show'];
BEGIN
    -- 1. Input sanitization
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is mandatory';
    END IF;
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory';
    END IF;
    IF v_norm_status IS NULL OR NOT (v_norm_status = ANY(v_allowed_statuses)) THEN
        RAISE EXCEPTION 'Invalid booking status: %. Allowed statuses are: booked, confirmed, in_progress, completed, cancelled, no-show', p_new_status;
    END IF;

    -- 2. Multi-tenant boundary check (Logic 1)
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 3. Fetch existing booking summary
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company', p_booking_id;
    END IF;

    -- 4. State Machine Transition Rules (Logic 14)
    IF LOWER(COALESCE(v_booking.status, '')) = 'completed' AND v_norm_status IN ('booked', 'in_progress') THEN
        RAISE EXCEPTION 'Completed bookings cannot transition back to %', v_norm_status;
    END IF;

    IF LOWER(COALESCE(v_booking.status, '')) = 'cancelled' AND v_norm_status = 'completed' THEN
        RAISE EXCEPTION 'Cancelled bookings cannot transition directly to completed';
    END IF;

    -- 5. Completion Prepayment Precondition (Logic 15)
    IF v_norm_status = 'completed' THEN
        IF LOWER(COALESCE(v_booking.payment_status, 'pending')) <> 'paid' THEN
            RAISE EXCEPTION 'Cannot mark booking as completed: Payment status is % (must be paid before completion)', v_booking.payment_status;
        END IF;
    END IF;

    -- 6. Atomic Status Update Across Tables
    -- Line items
    UPDATE app.bookings
    SET 
        status     = v_norm_status,
        notes      = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- Summary row (This fires trg_update_customer_stats_on_complete if status becomes completed)
    UPDATE app.bookings_for_business_transaction
    SET 
        status     = v_norm_status,
        notes      = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- If cancelled, cancel any open unpaid transaction
    IF v_norm_status = 'cancelled' THEN
        UPDATE app.business_transactions
        SET 
            status     = 'cancelled',
            updated_at = NOW()
        WHERE reference_id = p_booking_id 
          AND reference_type = 'booking' 
          AND status = 'created';
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'booking_id',     p_booking_id,
        'previous_status', v_booking.status,
        'new_status',     v_norm_status,
        'payment_status', v_booking.payment_status
    );
END;
$$;

-- Public compatibility wrapper
CREATE OR REPLACE FUNCTION public.update_booking_status_atomic(
    p_booking_id  uuid,
    p_company_id  uuid,
    p_branch_id   uuid,
    p_new_status  text,
    p_notes       text DEFAULT NULL::text
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

GRANT EXECUTE ON FUNCTION app.update_booking_status_atomic(uuid, uuid, uuid, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, uuid, text, text) TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- 2. Master Routine: app.update_booking_atomic (Hardened)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_booking_atomic(uuid, uuid, uuid, date, time without time zone, text, text, jsonb);
DROP FUNCTION IF EXISTS app.update_booking_atomic(uuid, uuid, uuid, date, time without time zone, text, text, jsonb);

CREATE OR REPLACE FUNCTION app.update_booking_atomic(
    p_booking_id   uuid,
    p_company_id   uuid,
    p_branch_id    uuid,
    p_booking_date date,
    p_start_time   time without time zone,
    p_notes        text DEFAULT NULL::text,
    p_status       text DEFAULT 'booked'::text,
    p_services     jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking           record;
    v_service           jsonb;
    v_service_id        uuid;
    v_package_id        uuid;
    v_staff_id          uuid;
    v_db_service        record;
    v_service_name      text;
    v_item_price        numeric;
    v_item_duration     bigint;
    v_item_start        time;
    v_item_end          time;
    v_staff_name        text;
    v_is_off            boolean;

    -- Collision detection
    v_conflict_booking  uuid;
    v_conflict_start    time;
    v_conflict_end      time;

    -- Operating hours
    v_day_name          text;
    v_is_open           boolean;
    v_open_time         time;
    v_close_time        time;

    -- Aggregates
    v_total_price       numeric := 0;
    v_service_names     text := '';
    v_staff_names       text := '';
    v_service_ids       text := '';
    v_staff_ids         text := '';
    v_min_start_time    time := NULL;
    v_max_end_time      time := NULL;
    v_norm_status       text := LOWER(COALESCE(TRIM(p_status), 'booked'));
BEGIN
    -- 1. Validation & Tenant Check
    IF p_booking_id IS NULL OR p_company_id IS NULL OR p_branch_id IS NULL OR p_booking_date IS NULL THEN
        RAISE EXCEPTION 'booking_id, company_id, branch_id, and booking_date are mandatory';
    END IF;

    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 2. Fetch existing booking summary
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company', p_booking_id;
    END IF;

    -- 3. Check Operating Hours if configured
    v_day_name := TRIM(TO_CHAR(p_booking_date, 'Day'));
    SELECT is_open, opening_time, closing_time
    INTO v_is_open, v_open_time, v_close_time
    FROM app.business_hours
    WHERE company_id = p_company_id 
      AND branch_id = p_branch_id 
      AND LOWER(day_of_week) = LOWER(v_day_name)
    LIMIT 1;

    IF v_is_open IS NOT NULL AND v_is_open = false THEN
        RAISE EXCEPTION 'Branch is closed on %', v_day_name;
    END IF;

    -- 4. Delete existing service lines to atomically re-insert updated lines
    DELETE FROM app.bookings WHERE booking_id = p_booking_id;

    -- 5. Process Updated Service Line Items (Authoritative Pricing & Collision Checks)
    FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id := NULLIF(v_service->>'service_id', '')::uuid;
        v_package_id := NULLIF(v_service->>'package_id', '')::uuid;
        v_staff_id   := NULLIF(v_service->>'staff_id', '')::uuid;

        -- Authoritative price & duration lookup
        IF v_service_id IS NOT NULL THEN
            SELECT * INTO v_db_service
            FROM app.services
            WHERE service_id = v_service_id AND company_id = p_company_id;

            IF FOUND THEN
                v_service_name  := v_db_service.service_name;
                v_item_price    := v_db_service.price;
                v_item_duration := COALESCE(v_db_service.duration, 30);
            ELSE
                v_service_name  := COALESCE(v_service->>'service_name', 'Custom Service');
                v_item_price    := COALESCE((v_service->>'price')::numeric, 0);
                v_item_duration := COALESCE((v_service->>'duration')::bigint, 30);
            END IF;
        ELSE
            v_service_name  := COALESCE(v_service->>'service_name', 'Custom Service');
            v_item_price    := COALESCE((v_service->>'price')::numeric, 0);
            v_item_duration := COALESCE((v_service->>'duration')::bigint, 30);
        END IF;

        -- Time calculation
        v_item_start := COALESCE(NULLIF(v_service->>'start_time', '')::time, p_start_time);
        IF v_item_start IS NULL THEN
            v_item_start := '10:00:00'::time;
        END IF;

        v_item_end := COALESCE(
            NULLIF(v_service->>'end_time', '')::time,
            v_item_start + (v_item_duration || ' minutes')::interval
        );

        -- Staff Validation & Double-Booking Check
        IF v_staff_id IS NOT NULL THEN
            SELECT staff_name INTO v_staff_name
            FROM app.staff
            WHERE staff_id = v_staff_id AND company_id = p_company_id AND LOWER(status) = 'active';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected staff member is inactive or does not belong to this salon';
            END IF;

            -- Schedule check if roster exists
            SELECT is_off INTO v_is_off
            FROM app.staff_schedule
            WHERE staff_id = v_staff_id AND schedule_date = p_booking_date
            LIMIT 1;

            IF v_is_off IS NOT NULL AND v_is_off = true THEN
                RAISE EXCEPTION 'Stylist % is marked off-duty on %', v_staff_name, p_booking_date;
            END IF;

            -- Overlap collision check (excluding current booking)
            SELECT b.booking_id, b.start_time, b.end_time
            INTO v_conflict_booking, v_conflict_start, v_conflict_end
            FROM app.bookings b
            WHERE b.company_id = p_company_id
              AND b.branch_id = p_branch_id
              AND b.staff_id = v_staff_id
              AND b.booking_date = p_booking_date
              AND b.booking_id <> p_booking_id
              AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'no-show')
              AND (b.start_time, b.end_time) OVERLAPS (v_item_start, v_item_end)
            LIMIT 1;

            IF FOUND THEN
                RAISE EXCEPTION 'Stylist % already has an active appointment from % to % on this date',
                    v_staff_name, v_conflict_start, v_conflict_end;
            END IF;
        ELSE
            v_staff_name := 'Unassigned';
        END IF;

        -- Re-insert service line
        INSERT INTO app.bookings (
            id,
            booking_id,
            company_id,
            branch_id,
            customer_id,
            service_id,
            package_id,
            staff_id,
            customer_name,
            customer_mail,
            customer_phone,
            service_name,
            staff_name,
            booking_date,
            start_time,
            end_time,
            notes,
            price,
            status,
            payment,
            booking_type,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            p_booking_id,
            p_company_id,
            p_branch_id,
            v_booking.customer_id,
            v_service_id,
            v_package_id,
            v_staff_id,
            v_booking.customer_name,
            v_booking.customer_mail,
            v_booking.customer_phone,
            v_service_name,
            v_staff_name,
            p_booking_date,
            v_item_start,
            v_item_end,
            p_notes,
            v_item_price,
            v_norm_status,
            COALESCE(v_booking.payment_status, 'pending'),
            COALESCE(v_booking.booking_type, 'walk-in'),
            v_booking.created_at,
            NOW()
        );

        -- Accumulate totals
        v_total_price := v_total_price + v_item_price;

        IF v_service_names <> '' THEN v_service_names := v_service_names || ', '; END IF;
        v_service_names := v_service_names || v_service_name;

        IF v_staff_names <> '' THEN v_staff_names := v_staff_names || ', '; END IF;
        v_staff_names := v_staff_names || v_staff_name;

        IF v_service_ids <> '' THEN v_service_ids := v_service_ids || ', '; END IF;
        v_service_ids := v_service_ids || COALESCE(v_service_id::text, '');

        IF v_staff_ids <> '' THEN v_staff_ids := v_staff_ids || ', '; END IF;
        v_staff_ids := v_staff_ids || COALESCE(v_staff_id::text, '');

        IF v_min_start_time IS NULL OR v_item_start < v_min_start_time THEN
            v_min_start_time := v_item_start;
        END IF;
        IF v_max_end_time IS NULL OR v_item_end > v_max_end_time THEN
            v_max_end_time := v_item_end;
        END IF;
    END LOOP;

    -- 6. Update Summary Row
    UPDATE app.bookings_for_business_transaction
    SET
        service_id   = v_service_ids,
        staff_id     = v_staff_ids,
        service_name = v_service_names,
        staff_name   = v_staff_names,
        booking_date = p_booking_date,
        start_time   = v_min_start_time,
        end_time     = v_max_end_time,
        notes        = p_notes,
        status       = v_norm_status,
        total_price  = v_total_price,
        final_amount = CASE
                         WHEN payment_status = 'paid' THEN final_amount
                         ELSE v_total_price
                       END,
        updated_at   = NOW()
    WHERE booking_id = p_booking_id;

    -- 7. Update Open Transaction Ledger Row if still unpaid
    UPDATE app.business_transactions
    SET
        amount       = v_total_price,
        final_amount = v_total_price,
        updated_at   = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'created';

    RETURN jsonb_build_object(
        'success',     true,
        'booking_id',  p_booking_id,
        'total_price', v_total_price,
        'status',      v_norm_status
    );
END;
$$;

-- Public compatibility wrapper
CREATE OR REPLACE FUNCTION public.update_booking_atomic(
    p_booking_id   uuid,
    p_company_id   uuid,
    p_branch_id    uuid,
    p_booking_date date,
    p_start_time   time without time zone,
    p_notes        text DEFAULT NULL::text,
    p_status       text DEFAULT 'booked'::text,
    p_services     jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_booking_atomic(
        p_booking_id,
        p_company_id,
        p_branch_id,
        p_booking_date,
        p_start_time,
        p_notes,
        p_status,
        p_services
    );
END;
$$;

GRANT EXECUTE ON FUNCTION app.update_booking_atomic(uuid, uuid, uuid, date, time without time zone, text, text, jsonb) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_atomic(uuid, uuid, uuid, date, time without time zone, text, text, jsonb) TO authenticated, service_role, anon;
