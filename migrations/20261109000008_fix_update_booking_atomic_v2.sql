-- Migration: update_booking_atomic v2
-- Fixes:
--   1. Business hours check REMOVED (independent for now)
--   2. Re-INSERT into app.bookings now includes: duration, created_by_user_id, created_by_user_name
--      (original creator is preserved from the existing summary row)
--   3. UPDATE of bookings_for_business_transaction now includes total_duration

CREATE OR REPLACE FUNCTION app.update_booking_atomic(
    p_booking_id    uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_booking_date  date,
    p_start_time    time without time zone,
    p_notes         text,
    p_status        text,
    p_services      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_item_duration     integer;
    v_item_start        time;
    v_item_end          time;
    v_staff_name        text;
    v_is_off            boolean;

    -- Collision detection
    v_conflict_booking  uuid;
    v_conflict_start    time;
    v_conflict_end      time;

    -- Aggregates
    v_total_price       numeric := 0;
    v_total_duration    integer := 0;
    v_service_names     text    := '';
    v_staff_names       text    := '';
    v_service_ids       text    := '';
    v_staff_ids         text    := '';
    v_min_start_time    time    := NULL;
    v_max_end_time      time    := NULL;
    v_norm_status       text    := LOWER(COALESCE(TRIM(p_status), 'booked'));
BEGIN
    -- ----------------------------------------------------------------
    -- Step 1: Validation & tenant check
    -- ----------------------------------------------------------------
    IF p_booking_id IS NULL OR p_company_id IS NULL OR p_branch_id IS NULL OR p_booking_date IS NULL THEN
        RAISE EXCEPTION 'booking_id, company_id, branch_id, and booking_date are mandatory';
    END IF;

    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    -- ----------------------------------------------------------------
    -- Step 2: Fetch existing booking summary
    --         (carries customer info + original creator info)
    -- ----------------------------------------------------------------
    SELECT * INTO v_booking
    FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found for this company', p_booking_id;
    END IF;

    -- Business hours check: REMOVED (independent for now)

    -- ----------------------------------------------------------------
    -- Step 3: Delete existing service rows to re-insert updated ones
    -- ----------------------------------------------------------------
    DELETE FROM app.bookings WHERE booking_id = p_booking_id;

    -- ----------------------------------------------------------------
    -- Step 4: Loop — re-INSERT one row per service into app.bookings
    -- ----------------------------------------------------------------
    FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id := NULLIF(v_service->>'service_id', '')::uuid;
        v_package_id := NULLIF(v_service->>'package_id', '')::uuid;
        v_staff_id   := NULLIF(v_service->>'staff_id',   '')::uuid;

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
                v_item_duration := COALESCE((v_service->>'duration')::integer, 30);
            END IF;
        ELSE
            v_service_name  := COALESCE(v_service->>'service_name', 'Custom Service');
            v_item_price    := COALESCE((v_service->>'price')::numeric, 0);
            v_item_duration := COALESCE((v_service->>'duration')::integer, 30);
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

        -- Staff validation & double-booking check
        IF v_staff_id IS NOT NULL THEN
            SELECT staff_name INTO v_staff_name
            FROM app.staff
            WHERE staff_id  = v_staff_id
              AND company_id = p_company_id
              AND LOWER(status) = 'active';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected staff member is inactive or does not belong to this salon';
            END IF;

            -- Off-duty check
            SELECT is_off INTO v_is_off
            FROM app.staff_schedule
            WHERE staff_id      = v_staff_id
              AND schedule_date = p_booking_date
            LIMIT 1;

            IF v_is_off IS NOT NULL AND v_is_off = true THEN
                RAISE EXCEPTION 'Stylist % is marked off-duty on %', v_staff_name, p_booking_date;
            END IF;

            -- Overlap collision check (excluding current booking being updated)
            SELECT b.booking_id, b.start_time, b.end_time
            INTO v_conflict_booking, v_conflict_start, v_conflict_end
            FROM app.bookings b
            WHERE b.company_id   = p_company_id
              AND b.branch_id    = p_branch_id
              AND b.staff_id     = v_staff_id
              AND b.booking_date = p_booking_date
              AND b.booking_id  <> p_booking_id
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

        -- Re-INSERT service row into app.bookings
        -- Preserves original creator info; updates duration and new columns
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
            duration,
            notes,
            price,
            status,
            payment,
            booking_type,
            created_by_user_id,
            created_by_user_name,
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
            v_item_duration,
            p_notes,
            v_item_price,
            v_norm_status,
            COALESCE(v_booking.payment_status, 'pending'),
            COALESCE(v_booking.booking_type, 'walk-in'),
            v_booking.created_by_user_id,
            v_booking.created_by_user_name,
            v_booking.created_at,
            NOW()
        );

        -- Accumulate totals
        v_total_price    := v_total_price    + v_item_price;
        v_total_duration := v_total_duration + v_item_duration;

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

    -- ----------------------------------------------------------------
    -- Step 5: UPDATE summary row in bookings_for_business_transaction
    -- ----------------------------------------------------------------
    UPDATE app.bookings_for_business_transaction
    SET
        service_id      = v_service_ids,
        staff_id        = v_staff_ids,
        service_name    = v_service_names,
        staff_name      = v_staff_names,
        booking_date    = p_booking_date,
        start_time      = v_min_start_time,
        end_time        = v_max_end_time,
        total_price     = v_total_price,
        total_duration  = v_total_duration,
        notes           = p_notes,
        status          = v_norm_status,
        final_amount    = CASE
                            WHEN payment_status = 'paid' THEN final_amount
                            ELSE v_total_price
                          END,
        updated_at      = NOW()
    WHERE booking_id = p_booking_id;

    -- ----------------------------------------------------------------
    -- Step 6: UPDATE open transaction in business_transactions (unpaid only)
    -- ----------------------------------------------------------------
    UPDATE app.business_transactions
    SET
        amount       = v_total_price,
        final_amount = v_total_price,
        updated_at   = NOW()
    WHERE reference_id   = p_booking_id
      AND reference_type = 'booking'
      AND status         = 'created';

    -- ----------------------------------------------------------------
    -- Step 7: Return result
    -- ----------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',          true,
        'booking_id',       p_booking_id,
        'total_price',      v_total_price,
        'total_duration',   v_total_duration,
        'status',           v_norm_status
    );
END;
$$;
