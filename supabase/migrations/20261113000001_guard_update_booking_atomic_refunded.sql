-- Migration: 20261113000001_guard_update_booking_atomic_refunded.sql
-- Description:
--   Surgical fix for Scenario 26: Add lifecycle guard in app.update_booking_atomic
--   to reject editing bookings that have already been refunded (payment_status = 'refunded').

CREATE OR REPLACE FUNCTION app.update_booking_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid,
    p_booking_date    date                    DEFAULT NULL::date,
    p_start_time      time without time zone  DEFAULT NULL::time without time zone,
    p_notes           text                    DEFAULT NULL::text,
    p_status          text                    DEFAULT 'booked'::text,
    p_services        jsonb                   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_booking           record;
    v_booking_date      date;
    v_booking_time      time;
    v_notes             text;
    v_norm_status       text;
    v_service           jsonb;
    v_service_id        uuid;
    v_package_id        uuid;
    v_staff_id          uuid;
    v_service_name      text;
    v_staff_name        text;
    v_item_price        numeric;
    v_item_duration     integer;
    v_item_start        time;
    v_item_end          time;
    v_total_price       numeric := 0;
    v_total_duration    integer := 0;
    v_all_service_ids   text    := '';
    v_all_staff_ids     text    := '';
    v_all_service_names text    := '';
    v_all_staff_names   text    := '';
    v_earliest_start    time    := NULL;
    v_latest_end        time    := NULL;
    v_is_first          boolean := true;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & AUTH GATES (The Vault Door)
    -- =========================================================================
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Access to company % / branch % denied.', p_company_id, p_branch_id;
    END IF;

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_booking');
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is required.';
    END IF;

    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service must be included in booking update.';
    END IF;

    -- =========================================================================
    -- SECTION 2: CORE LOGIC (Option A: 6 Steps)
    -- =========================================================================

    -- Step 1: Retrieve and validate existing booking summary
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company.', p_booking_id;
    END IF;

    IF LOWER(COALESCE(v_booking.booking_status, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot update a booking that has already been cancelled.';
    END IF;

    -- Financial integrity guard: Cannot modify services/schedule/pricing on a paid booking
    IF LOWER(COALESCE(v_booking.payment_status, '')) = 'paid' THEN
        RAISE EXCEPTION 'Cannot edit a booking that has already been paid. Please issue a refund first if services or pricing need to change.';
    END IF;

    -- Financial integrity guard: Cannot modify services/schedule/pricing on a refunded booking
    IF LOWER(COALESCE(v_booking.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'Cannot update a booking that has already been refunded.';
    END IF;

    -- Resolve fallback values from existing record if not provided
    v_booking_date := COALESCE(p_booking_date, v_booking.booking_date, CURRENT_DATE);
    v_booking_time := COALESCE(p_start_time, v_booking.start_time, '09:00:00'::time);
    v_norm_status  := LOWER(COALESCE(TRIM(p_status), v_booking.booking_status, 'booked'));
    v_notes        := COALESCE(p_notes, v_booking.notes);

    -- Step 2: Delete existing service rows in app.bookings
    DELETE FROM app.bookings WHERE booking_id = p_booking_id;

    -- Step 3: Insert rebuilt service rows in app.bookings
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id    := NULLIF(v_service->>'service_id', '')::uuid;
        v_package_id    := NULLIF(v_service->>'package_id', '')::uuid; -- Preserves package link
        v_staff_id      := NULLIF(v_service->>'staff_id', '')::uuid;
        v_service_name  := COALESCE(NULLIF(TRIM(v_service->>'service_name'), ''), 'Service');
        v_staff_name    := COALESCE(NULLIF(TRIM(v_service->>'staff_name'), ''), 'Unassigned');
        v_item_price    := COALESCE((v_service->>'price')::numeric, 0);
        v_item_start    := COALESCE(NULLIF(v_service->>'start_time', '')::time, v_booking_time);
        v_item_end      := NULLIF(v_service->>'end_time', '')::time;

        -- Resolve duration from JSON, or time interval, with midnight rollover protection
        v_item_duration := COALESCE(
            NULLIF(NULLIF(v_service->>'duration', ''), '0')::integer,
            CASE 
                WHEN v_item_start IS NOT NULL AND v_item_end IS NOT NULL THEN
                    CASE 
                        WHEN v_item_end >= v_item_start THEN
                            (EXTRACT(EPOCH FROM (v_item_end - v_item_start)) / 60)::integer
                        ELSE 
                            -- Midnight rollover: adds 24 hours (1440 minutes)
                            ((EXTRACT(EPOCH FROM (v_item_end - v_item_start)) / 60)::integer + 1440)
                    END
                ELSE 30
            END
        );

        IF v_item_duration IS NULL OR v_item_duration <= 0 THEN
            v_item_duration := 30;
        END IF;

        IF v_item_end IS NULL THEN
            v_item_end := (v_item_start + (v_item_duration || ' minutes')::interval)::time;
        END IF;

        INSERT INTO app.bookings (
            id,             booking_id,     company_id,         branch_id,
            customer_id,    customer_name,  customer_mail,      customer_phone,
            service_id,     service_name,
            staff_id,       staff_name,
            package_id,     -- Written ONLY when service belongs to a package
            booking_date,
            start_time,     end_time,       duration,
            price,
            notes,          booking_status, payment_status,     booking_type,
            created_by_user_id,             created_by_user_name,
            created_at,     updated_at
        ) VALUES (
            gen_random_uuid(), p_booking_id, p_company_id,      p_branch_id,
            v_booking.customer_id, v_booking.customer_name, v_booking.customer_mail, v_booking.customer_phone,
            v_service_id,   v_service_name,
            v_staff_id,     v_staff_name,
            v_package_id,
            v_booking_date,
            v_item_start,   v_item_end,     v_item_duration,
            v_item_price,
            v_notes,        v_norm_status,  COALESCE(v_booking.payment_status, 'unpaid'), COALESCE(v_booking.booking_type, 'walk-in'),
            v_booking.created_by_user_id,   v_booking.created_by_user_name,
            v_booking.created_at,           NOW()
        );

        v_total_price    := v_total_price + v_item_price;
        v_total_duration := v_total_duration + v_item_duration;

        IF v_is_first THEN
            v_all_service_ids   := COALESCE(v_service_id::text, '');
            v_all_staff_ids     := COALESCE(v_staff_id::text, '');
            v_all_service_names := v_service_name;
            v_all_staff_names   := v_staff_name;
            v_is_first          := false;
        ELSE
            v_all_service_ids   := v_all_service_ids   || ', ' || COALESCE(v_service_id::text, '');
            v_all_staff_ids     := v_all_staff_ids     || ', ' || COALESCE(v_staff_id::text, '');
            v_all_service_names := v_all_service_names || ', ' || v_service_name;
            v_all_staff_names   := v_all_staff_names   || ', ' || v_staff_name;
        END IF;

        IF v_item_start IS NOT NULL AND (v_earliest_start IS NULL OR v_item_start < v_earliest_start) THEN
            v_earliest_start := v_item_start;
        END IF;
        IF v_item_end IS NOT NULL AND (v_latest_end IS NULL OR v_item_end > v_latest_end) THEN
            v_latest_end := v_item_end;
        END IF;
    END LOOP;

    -- Step 4: Delete old summary row from app.bookings_for_business_transaction
    DELETE FROM app.bookings_for_business_transaction WHERE booking_id = p_booking_id;

    -- Step 5: Insert updated consolidated summary row (preserving original ID and created_at)
    INSERT INTO app.bookings_for_business_transaction (
        id,
        booking_id,     company_id,     branch_id,
        customer_id,    customer_name,  customer_mail,  customer_phone,
        service_id,     service_name,
        staff_id,       staff_name,
        booking_date,   start_time,     end_time,
        total_price,    total_duration,
        notes,          booking_status, payment_status, booking_type,
        discount_type,  discount_name,  discount_amount,
        final_amount,
        created_by_user_id,             created_by_user_name,
        created_at,     updated_at
    ) VALUES (
        v_booking.id,
        p_booking_id,   p_company_id,   p_branch_id,
        v_booking.customer_id, v_booking.customer_name, v_booking.customer_mail, v_booking.customer_phone,
        v_all_service_ids,  v_all_service_names,
        v_all_staff_ids,    v_all_staff_names,
        v_booking_date, COALESCE(v_earliest_start, v_booking_time), COALESCE(v_latest_end, v_booking_time),
        v_total_price,  v_total_duration,
        v_notes,        v_norm_status,  COALESCE(v_booking.payment_status, 'unpaid'), COALESCE(v_booking.booking_type, 'walk-in'),
        v_booking.discount_type, v_booking.discount_name, COALESCE(v_booking.discount_amount, 0),
        v_total_price - COALESCE(v_booking.discount_amount, 0),
        v_booking.created_by_user_id,   v_booking.created_by_user_name,
        v_booking.created_at,           NOW()
    );

    -- Step 6: Update open receivable in app.business_transactions (status = 'created' only)
    UPDATE app.business_transactions
    SET
        amount       = v_total_price,
        final_amount = v_total_price - COALESCE(v_booking.discount_amount, 0),
        updated_at   = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'created';

    RETURN jsonb_build_object(
        'success',        true,
        'booking_id',     p_booking_id,
        'booking_date',   v_booking_date,
        'start_time',     v_booking_time,
        'total_price',    v_total_price,
        'total_duration', v_total_duration,
        'booking_status', v_norm_status,
        'message',        'Booking updated successfully via Option A'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
