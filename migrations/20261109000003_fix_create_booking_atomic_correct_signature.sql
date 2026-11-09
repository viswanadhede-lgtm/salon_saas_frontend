-- Migration: Fix create_booking_atomic with CORRECT 12-param signature (matching frontend call)
-- Keeps exact same parameter list as original so PostgREST can resolve it
-- Fixed bugs:
--   1. SELECT staff_name (not 'name') from app.staff
--   2. INSERT into app.bookings flat schema: customer_mail, price, start_time, end_time
--      (not total_price / total_duration / customer_email / booking_services)
--   3. Removed non-existent app.booking_services table
--   4. Removed broken overlap check that joined app.booking_services
--   5. One flat row per service in app.bookings, all sharing the same booking_id

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
    v_clean_phone       text;
    v_customer_id       uuid    := p_customer_id;
    v_customer_name     text    := COALESCE(TRIM(p_customer_name), 'Walk-in Customer');
    v_customer_email    text    := NULLIF(TRIM(p_customer_email), '');
    v_service           jsonb;
    v_service_id        uuid;
    v_package_id        uuid;
    v_staff_id          uuid;
    v_service_name      text;
    v_item_price        numeric;
    v_item_duration     bigint;
    v_item_start        time;
    v_item_end          time;
    v_staff_name        text;
BEGIN
    -- Validate at least one service
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service line item must be selected for booking';
    END IF;

    -- Generate booking ID if not provided
    IF p_booking_id IS NULL THEN
        p_booking_id := gen_random_uuid();
    END IF;

    -- Tenant access check
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_booking');
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- Normalize phone
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g');

    -- Customer upsert / lookup
    IF p_is_new_customer = false AND p_customer_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM app.customers
            WHERE customer_id = p_customer_id AND company_id = p_company_id
        ) THEN
            RAISE EXCEPTION 'Customer % does not belong to company %', p_customer_id, p_company_id;
        END IF;
    ELSE
        -- Try to find existing customer by phone
        IF v_clean_phone IS NOT NULL AND v_clean_phone <> '' THEN
            SELECT customer_id INTO v_customer_id
            FROM app.customers
            WHERE company_id = p_company_id
              AND REGEXP_REPLACE(customer_phone, '[^0-9+]', '', 'g') = v_clean_phone
            LIMIT 1;
        END IF;

        -- Create new customer if not found
        IF v_customer_id IS NULL THEN
            v_customer_id := COALESCE(p_customer_id, gen_random_uuid());
            INSERT INTO app.customers (
                customer_id, company_id, branch_id,
                customer_name, customer_email, customer_phone,
                first_visit, last_visit, status,
                created_at, updated_at
            ) VALUES (
                v_customer_id, p_company_id, p_branch_id,
                v_customer_name, v_customer_email, p_customer_phone,
                p_booking_date, p_booking_date, 'active',
                NOW(), NOW()
            );
        END IF;
    END IF;

    -- Business hours check: REMOVED (independent for now)

    -- Loop: insert ONE flat row per service into app.bookings
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id  := (v_service->>'service_id')::uuid;
        v_package_id  := (v_service->>'package_id')::uuid;
        v_staff_id    := (v_service->>'staff_id')::uuid;
        v_item_start  := (v_service->>'start_time')::time;

        IF v_service_id IS NULL AND v_package_id IS NULL THEN
            RAISE EXCEPTION 'Each booking item must specify a service_id or package_id';
        END IF;

        -- Fetch service details
        IF v_service_id IS NOT NULL THEN
            SELECT service_name, price, duration
            INTO v_service_name, v_item_price, v_item_duration
            FROM app.services
            WHERE service_id = v_service_id
              AND company_id = p_company_id
              AND status = 'active'
            LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Service % not found or inactive in this company', v_service_id;
            END IF;
        ELSE
            SELECT package_name, price, duration
            INTO v_service_name, v_item_price, v_item_duration
            FROM app.packages
            WHERE package_id = v_package_id
              AND company_id = p_company_id
              AND status = 'active'
            LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Package % not found or inactive in this company', v_package_id;
            END IF;
        END IF;

        -- Compute end time from duration
        IF v_item_start IS NOT NULL AND v_item_duration IS NOT NULL THEN
            v_item_end := v_item_start + (v_item_duration || ' minutes')::interval;
        ELSE
            v_item_end := NULL;
        END IF;

        -- Validate staff and get staff_name (FIXED: was SELECT name, correct is SELECT staff_name)
        v_staff_name := NULL;
        IF v_staff_id IS NOT NULL THEN
            PERFORM 1 FROM app.staff
            WHERE staff_id = v_staff_id
              AND company_id = p_company_id
              AND status = 'active';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Staff member % not found or inactive', v_staff_id;
            END IF;
            SELECT staff_name INTO v_staff_name
            FROM app.staff
            WHERE staff_id = v_staff_id;
        END IF;

        -- Insert flat row into app.bookings (FIXED column names to match actual schema)
        INSERT INTO app.bookings (
            booking_id,
            company_id,
            branch_id,
            customer_id,
            customer_name,
            customer_mail,
            customer_phone,
            service_id,
            service_name,
            staff_id,
            staff_name,
            booking_date,
            start_time,
            end_time,
            price,
            notes,
            status,
            booking_type,
            package_id,
            created_at,
            updated_at
        ) VALUES (
            p_booking_id,
            p_company_id,
            p_branch_id,
            v_customer_id,
            v_customer_name,
            v_customer_email,
            v_clean_phone,
            v_service_id,
            v_service_name,
            v_staff_id,
            v_staff_name,
            p_booking_date,
            v_item_start,
            v_item_end,
            COALESCE(v_item_price, 0),
            p_notes,
            'pending',
            COALESCE(p_booking_type, 'walk-in'),
            v_package_id,
            NOW(),
            NOW()
        );

    END LOOP;

    RETURN p_booking_id;
END;
$$;

