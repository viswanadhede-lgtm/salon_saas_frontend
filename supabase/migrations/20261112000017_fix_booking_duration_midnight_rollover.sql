-- Migration: 20261112000017_fix_booking_duration_midnight_rollover.sql
-- Description:
--   1. Harden duration resolution in create_booking_atomic and update_booking_atomic:
--      - Protect against '0' or missing duration strings in JSON payload.
--      - Fix midnight rollover in time subtraction (when end_time < start_time across 24h boundary).
--      - Guarantee v_item_duration is always > 0.
--   2. Correct existing test booking with 0 duration.

-- ── 1. UPDATE MASTER FUNCTION: app.create_booking_atomic ─────────────────────
CREATE OR REPLACE FUNCTION app.create_booking_atomic(
    p_booking_id      uuid    DEFAULT NULL::uuid,
    p_company_id      uuid    DEFAULT NULL::uuid,
    p_branch_id       uuid    DEFAULT NULL::uuid,
    p_customer_id     uuid    DEFAULT NULL::uuid,
    p_customer_name   text    DEFAULT NULL::text,
    p_customer_email  text    DEFAULT NULL::text,
    p_customer_phone  text    DEFAULT NULL::text,
    p_is_new_customer boolean DEFAULT false,
    p_services        jsonb   DEFAULT '[]'::jsonb,
    p_booking_date    date    DEFAULT NULL::date,
    p_notes           text    DEFAULT NULL::text,
    p_booking_type    text    DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_created_by_id     uuid    := auth.uid();
    v_created_by_name   text;
    v_customer_rec      record;
    v_booking_date      date    := COALESCE(p_booking_date, CURRENT_DATE);
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
    PERFORM shared.check_permission(p_company_id, 'create_booking');
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- Basic input validation
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service must be selected for booking.';
    END IF;

    IF p_booking_id IS NULL THEN
        p_booking_id := gen_random_uuid();
    END IF;

    -- Grab user name for audit log
    SELECT name INTO v_created_by_name FROM shared.users WHERE user_id = v_created_by_id LIMIT 1;
    v_created_by_name := COALESCE(v_created_by_name, 'Staff');

    -- =========================================================================
    -- SECTION 2: CORE LOGIC (Verify Customer + Insert into 3 Tables)
    -- =========================================================================
    
    -- 2.1 Customer Verification (Match existing only — NO customer inserts)
    IF p_customer_id IS NOT NULL THEN
        SELECT customer_id, customer_name, customer_email, customer_phone
        INTO v_customer_rec
        FROM app.customers
        WHERE customer_id = p_customer_id AND company_id = p_company_id
        LIMIT 1;
    ELSIF p_customer_phone IS NOT NULL AND TRIM(p_customer_phone) <> '' THEN
        SELECT customer_id, customer_name, customer_email, customer_phone
        INTO v_customer_rec
        FROM app.customers
        WHERE company_id = p_company_id
          AND REGEXP_REPLACE(customer_phone, '[^0-9+]', '', 'g') = REGEXP_REPLACE(p_customer_phone, '[^0-9+]', '', 'g')
        LIMIT 1;
    END IF;

    IF v_customer_rec.customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer not found. Please select or register a customer first.';
    END IF;

    -- 2.2 Table 1: Insert Line Items into app.bookings
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id    := NULLIF(v_service->>'service_id', '')::uuid;
        v_package_id    := NULLIF(v_service->>'package_id', '')::uuid; -- NULL if standalone service
        v_staff_id      := NULLIF(v_service->>'staff_id', '')::uuid;
        v_service_name  := COALESCE(NULLIF(TRIM(v_service->>'service_name'), ''), 'Service');
        v_staff_name    := COALESCE(NULLIF(TRIM(v_service->>'staff_name'), ''), 'Unassigned');
        v_item_price    := COALESCE((v_service->>'price')::numeric, 0);
        v_item_start    := COALESCE(NULLIF(v_service->>'start_time', '')::time, '09:00:00'::time);
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
            v_customer_rec.customer_id, v_customer_rec.customer_name, v_customer_rec.customer_email, v_customer_rec.customer_phone,
            v_service_id,   v_service_name,
            v_staff_id,     v_staff_name,
            v_package_id,
            v_booking_date,
            v_item_start,   v_item_end,     v_item_duration,
            v_item_price,
            p_notes,        'booked',       'unpaid',           COALESCE(p_booking_type, 'walk-in'),
            v_created_by_id,                v_created_by_name,
            NOW(),          NOW()
        );

        -- Accumulate totals
        v_total_price    := v_total_price + v_item_price;
        v_total_duration := v_total_duration + v_item_duration;

        -- Build comma-separated summary strings
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

    -- 2.3 Table 2: Insert 1 Consolidated Row into app.bookings_for_business_transaction
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
        gen_random_uuid(),
        p_booking_id,   p_company_id,   p_branch_id,
        v_customer_rec.customer_id, v_customer_rec.customer_name, v_customer_rec.customer_email, v_customer_rec.customer_phone,
        v_all_service_ids,  v_all_service_names,
        v_all_staff_ids,    v_all_staff_names,
        v_booking_date, COALESCE(v_earliest_start, '09:00:00'::time), COALESCE(v_latest_end, '09:30:00'::time),
        v_total_price,  v_total_duration,
        p_notes,        'booked',       'unpaid',       COALESCE(p_booking_type, 'walk-in'),
        NULL, NULL, 0,
        v_total_price,
        v_created_by_id,                v_created_by_name,
        NOW(),          NOW()
    );

    -- 2.4 Table 3: Insert 1 Open Receivable into app.business_transactions
    INSERT INTO app.business_transactions (
        payment_id,
        company_id,     branch_id,
        reference_id,   reference_type,
        amount,         currency,
        payment_method, status,
        notes,          created_by,
        created_at,     updated_at
    ) VALUES (
        gen_random_uuid(),
        p_company_id,   p_branch_id,
        p_booking_id,   'booking',
        v_total_price,  'INR',
        'cash',         'created',
        p_notes,        v_created_by_id,
        NOW(),          NOW()
    );

    RETURN p_booking_id;
END;
$$;

-- ── 2. UPDATE MASTER FUNCTION: app.update_booking_atomic ─────────────────────
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

-- ── 3. FIX EXISTING BOOKING WITH ZERO DURATION ───────────────────────────────
UPDATE app.bookings
SET duration = 120
WHERE booking_id = '0216ebff-7037-4fed-92d2-099a62f63226'
  AND (duration = 0 OR duration IS NULL)
  AND service_name ILIKE '%Haircolor%';

UPDATE app.bookings_for_business_transaction
SET total_duration = (
    SELECT COALESCE(SUM(duration), 0)
    FROM app.bookings
    WHERE booking_id = '0216ebff-7037-4fed-92d2-099a62f63226'
)
WHERE booking_id = '0216ebff-7037-4fed-92d2-099a62f63226';

NOTIFY pgrst, 'reload schema';
