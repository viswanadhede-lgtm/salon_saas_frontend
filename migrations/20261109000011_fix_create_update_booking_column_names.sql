-- Migration: Fix create_booking_atomic + update_booking_atomic INSERT column names
-- After renaming app.bookings.status->booking_status and payment->payment_status,
-- these functions' INSERT statements needed updating.

-- ============================================================
-- create_booking_atomic v5 (column name fixes only)
-- ============================================================
CREATE OR REPLACE FUNCTION app.create_booking_atomic(
    p_booking_id        uuid        DEFAULT NULL,
    p_company_id        uuid        DEFAULT NULL,
    p_branch_id         uuid        DEFAULT NULL,
    p_customer_id       uuid        DEFAULT NULL,
    p_customer_name     text        DEFAULT NULL,
    p_customer_email    text        DEFAULT NULL,
    p_customer_phone    text        DEFAULT NULL,
    p_is_new_customer   boolean     DEFAULT false,
    p_services          jsonb       DEFAULT '[]'::jsonb,
    p_booking_date      date        DEFAULT NULL,
    p_notes             text        DEFAULT NULL,
    p_booking_type      text        DEFAULT 'walk-in'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_created_by_id     uuid    := auth.uid();
    v_created_by_name   text;
    v_clean_phone       text;
    v_customer_id       uuid    := p_customer_id;
    v_customer_name     text    := COALESCE(TRIM(p_customer_name), 'Walk-in Customer');
    v_customer_email    text    := NULLIF(TRIM(p_customer_email), '');
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
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service must be selected for booking';
    END IF;

    IF p_booking_id IS NULL THEN p_booking_id := gen_random_uuid(); END IF;

    SELECT name INTO v_created_by_name FROM shared.users WHERE user_id = v_created_by_id LIMIT 1;

    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_booking');
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    v_clean_phone := REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g');

    IF p_is_new_customer = false AND p_customer_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM app.customers WHERE customer_id = p_customer_id AND company_id = p_company_id) THEN
            RAISE EXCEPTION 'Customer % does not belong to company %', p_customer_id, p_company_id;
        END IF;
    ELSE
        IF v_clean_phone IS NOT NULL AND v_clean_phone <> '' THEN
            SELECT customer_id INTO v_customer_id FROM app.customers
            WHERE company_id = p_company_id
              AND REGEXP_REPLACE(customer_phone, '[^0-9+]', '', 'g') = v_clean_phone LIMIT 1;
        END IF;
        IF v_customer_id IS NULL THEN
            v_customer_id := COALESCE(p_customer_id, gen_random_uuid());
            INSERT INTO app.customers (customer_id, company_id, branch_id, customer_name, customer_email, customer_phone, first_visit, last_visit, status, created_at, updated_at)
            VALUES (v_customer_id, p_company_id, p_branch_id, v_customer_name, v_customer_email, p_customer_phone, p_booking_date, p_booking_date, 'active', NOW(), NOW());
        END IF;
    END IF;

    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id  := (v_service->>'service_id')::uuid;
        v_package_id  := (v_service->>'package_id')::uuid;
        v_staff_id    := (v_service->>'staff_id')::uuid;
        v_item_start  := (v_service->>'start_time')::time;

        IF v_service_id IS NULL AND v_package_id IS NULL THEN
            RAISE EXCEPTION 'Each booking item must have a service_id or package_id';
        END IF;

        IF v_service_id IS NOT NULL THEN
            SELECT service_name, price, duration INTO v_service_name, v_item_price, v_item_duration
            FROM app.services WHERE service_id = v_service_id AND company_id = p_company_id AND status = 'active' LIMIT 1;
            IF NOT FOUND THEN RAISE EXCEPTION 'Service % not found or inactive', v_service_id; END IF;
        ELSE
            SELECT package_name, price, duration INTO v_service_name, v_item_price, v_item_duration
            FROM app.packages WHERE package_id = v_package_id AND company_id = p_company_id AND status = 'active' LIMIT 1;
            IF NOT FOUND THEN RAISE EXCEPTION 'Package % not found or inactive', v_package_id; END IF;
        END IF;

        v_item_end := CASE WHEN v_item_start IS NOT NULL AND v_item_duration IS NOT NULL
                          THEN v_item_start + (v_item_duration || ' minutes')::interval
                          ELSE NULL END;

        v_staff_name := NULL;
        IF v_staff_id IS NOT NULL THEN
            PERFORM 1 FROM app.staff WHERE staff_id = v_staff_id AND company_id = p_company_id AND status = 'active';
            IF NOT FOUND THEN RAISE EXCEPTION 'Staff member % not found or inactive', v_staff_id; END IF;
            SELECT staff_name INTO v_staff_name FROM app.staff WHERE staff_id = v_staff_id;
        END IF;

        INSERT INTO app.bookings (
            booking_id,     company_id,     branch_id,
            customer_id,    customer_name,  customer_mail,  customer_phone,
            service_id,     service_name,
            staff_id,       staff_name,
            package_id,
            booking_date,
            start_time,     end_time,       duration,
            price,
            notes,          booking_status, payment_status, booking_type,
            created_by_user_id,             created_by_user_name,
            created_at,     updated_at
        ) VALUES (
            p_booking_id,   p_company_id,   p_branch_id,
            v_customer_id,  v_customer_name, v_customer_email, v_clean_phone,
            v_service_id,   v_service_name,
            v_staff_id,     v_staff_name,
            v_package_id,
            p_booking_date,
            v_item_start,   v_item_end,     v_item_duration,
            COALESCE(v_item_price, 0),
            p_notes,        'pending',      NULL,           COALESCE(p_booking_type, 'walk-in'),
            v_created_by_id,                v_created_by_name,
            NOW(),          NOW()
        );

        v_total_price    := v_total_price    + COALESCE(v_item_price, 0);
        v_total_duration := v_total_duration + COALESCE(v_item_duration, 0);

        IF v_is_first THEN
            v_all_service_ids := COALESCE(v_service_id::text,''); v_all_staff_ids := COALESCE(v_staff_id::text,'');
            v_all_service_names := COALESCE(v_service_name,''); v_all_staff_names := COALESCE(v_staff_name,'');
            v_is_first := false;
        ELSE
            v_all_service_ids   := v_all_service_ids   || ', ' || COALESCE(v_service_id::text,'');
            v_all_staff_ids     := v_all_staff_ids     || ', ' || COALESCE(v_staff_id::text,'');
            v_all_service_names := v_all_service_names || ', ' || COALESCE(v_service_name,'');
            v_all_staff_names   := v_all_staff_names   || ', ' || COALESCE(v_staff_name,'');
        END IF;

        IF v_item_start IS NOT NULL AND (v_earliest_start IS NULL OR v_item_start < v_earliest_start) THEN v_earliest_start := v_item_start; END IF;
        IF v_item_end   IS NOT NULL AND (v_latest_end   IS NULL OR v_item_end   > v_latest_end)   THEN v_latest_end   := v_item_end;   END IF;
    END LOOP;

    INSERT INTO app.bookings_for_business_transaction (
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
        p_booking_id,   p_company_id,   p_branch_id,
        v_customer_id,  v_customer_name, v_customer_email, v_clean_phone,
        v_all_service_ids,  v_all_service_names,
        v_all_staff_ids,    v_all_staff_names,
        p_booking_date, v_earliest_start, v_latest_end,
        v_total_price,  v_total_duration,
        p_notes,        'pending',      'unpaid',       COALESCE(p_booking_type, 'walk-in'),
        NULL, NULL, NULL,
        v_total_price,
        v_created_by_id,                v_created_by_name,
        NOW(),          NOW()
    );

    INSERT INTO app.business_transactions (
        company_id,     branch_id,
        reference_id,   reference_type,
        amount,         currency,
        payment_method, status,
        notes,
        created_by,     created_by_user_name,
        paid_at,
        discount_type,  discount_name,  discount_amount,
        final_amount,
        created_at,     updated_at
    ) VALUES (
        p_company_id,   p_branch_id,
        p_booking_id,   'booking',
        v_total_price,  'INR',
        NULL,           'created',
        p_notes,
        v_created_by_id, v_created_by_name,
        NULL,
        NULL, NULL, NULL,
        v_total_price,
        NOW(),          NOW()
    );

    RETURN p_booking_id;
END;
$$;


-- ============================================================
-- update_booking_atomic v4 (column name fixes in INSERT)
-- ============================================================
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
    v_conflict_booking  uuid;
    v_conflict_start    time;
    v_conflict_end      time;
    v_total_price       numeric := 0;
    v_total_duration    integer := 0;
    v_service_names     text    := '';
    v_staff_names       text    := '';
    v_service_ids       text    := '';
    v_staff_ids         text    := '';
    v_min_start_time    time    := NULL;
    v_max_end_time      time    := NULL;
    v_norm_status       text    := LOWER(COALESCE(TRIM(p_status), 'booked'));
    v_final_amount      numeric;
BEGIN
    IF p_booking_id IS NULL OR p_company_id IS NULL OR p_branch_id IS NULL OR p_booking_date IS NULL THEN
        RAISE EXCEPTION 'booking_id, company_id, branch_id, and booking_date are mandatory';
    END IF;

    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    SELECT * INTO v_booking FROM app.bookings_for_business_transaction
    WHERE booking_id = p_booking_id AND company_id = p_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking % not found for this company', p_booking_id; END IF;

    DELETE FROM app.bookings WHERE booking_id = p_booking_id;

    FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id := NULLIF(v_service->>'service_id', '')::uuid;
        v_package_id := NULLIF(v_service->>'package_id', '')::uuid;
        v_staff_id   := NULLIF(v_service->>'staff_id',   '')::uuid;

        IF v_service_id IS NOT NULL THEN
            SELECT * INTO v_db_service FROM app.services WHERE service_id = v_service_id AND company_id = p_company_id;
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

        v_item_start := COALESCE(NULLIF(v_service->>'start_time','')::time, p_start_time);
        IF v_item_start IS NULL THEN v_item_start := '10:00:00'::time; END IF;
        v_item_end := COALESCE(NULLIF(v_service->>'end_time','')::time, v_item_start + (v_item_duration || ' minutes')::interval);

        IF v_staff_id IS NOT NULL THEN
            SELECT staff_name INTO v_staff_name FROM app.staff
            WHERE staff_id = v_staff_id AND company_id = p_company_id AND LOWER(status) = 'active';
            IF NOT FOUND THEN RAISE EXCEPTION 'Selected staff member is inactive or does not belong to this salon'; END IF;

            SELECT is_off INTO v_is_off FROM app.staff_schedule
            WHERE staff_id = v_staff_id AND schedule_date = p_booking_date LIMIT 1;
            IF v_is_off IS NOT NULL AND v_is_off = true THEN
                RAISE EXCEPTION 'Stylist % is marked off-duty on %', v_staff_name, p_booking_date;
            END IF;

            SELECT b.booking_id, b.start_time, b.end_time INTO v_conflict_booking, v_conflict_start, v_conflict_end
            FROM app.bookings b
            WHERE b.company_id = p_company_id AND b.branch_id = p_branch_id AND b.staff_id = v_staff_id
              AND b.booking_date = p_booking_date AND b.booking_id <> p_booking_id
              AND LOWER(COALESCE(b.booking_status,'')) NOT IN ('cancelled','no-show')
              AND (b.start_time, b.end_time) OVERLAPS (v_item_start, v_item_end) LIMIT 1;
            IF FOUND THEN
                RAISE EXCEPTION 'Stylist % already has an active appointment from % to % on this date', v_staff_name, v_conflict_start, v_conflict_end;
            END IF;
        ELSE
            v_staff_name := 'Unassigned';
        END IF;

        INSERT INTO app.bookings (
            id,             booking_id,     company_id,         branch_id,
            customer_id,    customer_name,  customer_mail,      customer_phone,
            service_id,     service_name,
            staff_id,       staff_name,
            package_id,     booking_date,
            start_time,     end_time,       duration,
            notes,          price,          booking_status,
            payment_status, booking_type,
            created_by_user_id,             created_by_user_name,
            created_at,     updated_at
        ) VALUES (
            gen_random_uuid(), p_booking_id, p_company_id,      p_branch_id,
            v_booking.customer_id, v_booking.customer_name, v_booking.customer_mail, v_booking.customer_phone,
            v_service_id,   v_service_name,
            v_staff_id,     v_staff_name,
            v_package_id,   p_booking_date,
            v_item_start,   v_item_end,     v_item_duration,
            p_notes,        v_item_price,   v_norm_status,
            COALESCE(v_booking.payment_status, 'unpaid'), COALESCE(v_booking.booking_type, 'walk-in'),
            v_booking.created_by_user_id,   v_booking.created_by_user_name,
            v_booking.created_at,           NOW()
        );

        v_total_price    := v_total_price    + v_item_price;
        v_total_duration := v_total_duration + v_item_duration;

        IF v_service_names <> '' THEN v_service_names := v_service_names || ', '; END IF; v_service_names := v_service_names || v_service_name;
        IF v_staff_names   <> '' THEN v_staff_names   := v_staff_names   || ', '; END IF; v_staff_names   := v_staff_names   || v_staff_name;
        IF v_service_ids   <> '' THEN v_service_ids   := v_service_ids   || ', '; END IF; v_service_ids   := v_service_ids   || COALESCE(v_service_id::text,'');
        IF v_staff_ids     <> '' THEN v_staff_ids     := v_staff_ids     || ', '; END IF; v_staff_ids     := v_staff_ids     || COALESCE(v_staff_id::text,'');

        IF v_min_start_time IS NULL OR v_item_start < v_min_start_time THEN v_min_start_time := v_item_start; END IF;
        IF v_max_end_time   IS NULL OR v_item_end   > v_max_end_time   THEN v_max_end_time   := v_item_end;   END IF;
    END LOOP;

    v_final_amount := CASE WHEN v_booking.payment_status = 'paid' THEN v_booking.final_amount ELSE v_total_price END;

    DELETE FROM app.bookings_for_business_transaction WHERE booking_id = p_booking_id;

    INSERT INTO app.bookings_for_business_transaction (
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
        p_booking_id,   p_company_id,   p_branch_id,
        v_booking.customer_id, v_booking.customer_name, v_booking.customer_mail, v_booking.customer_phone,
        v_service_ids,  v_service_names,
        v_staff_ids,    v_staff_names,
        p_booking_date, v_min_start_time, v_max_end_time,
        v_total_price,  v_total_duration,
        p_notes,        v_norm_status,  COALESCE(v_booking.payment_status,'unpaid'), COALESCE(v_booking.booking_type,'walk-in'),
        v_booking.discount_type, v_booking.discount_name, v_booking.discount_amount,
        v_final_amount,
        v_booking.created_by_user_id,   v_booking.created_by_user_name,
        v_booking.created_at,           NOW()
    );

    UPDATE app.business_transactions
    SET amount = v_total_price, final_amount = v_total_price, updated_at = NOW()
    WHERE reference_id = p_booking_id AND reference_type = 'booking' AND status = 'created';

    RETURN jsonb_build_object(
        'success', true, 'booking_id', p_booking_id,
        'total_price', v_total_price, 'total_duration', v_total_duration, 'status', v_norm_status
    );
END;
$$;
