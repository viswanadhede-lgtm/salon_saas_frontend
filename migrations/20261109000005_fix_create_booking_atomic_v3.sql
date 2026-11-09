-- Migration: Full rewrite of create_booking_atomic v3
-- Atomically writes to 3 tables:
--   1. app.bookings              — one flat row per service
--   2. app.bookings_for_business_transaction — one summary row per booking
--   3. app.business_transactions — one financial transaction row per booking

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
    -- Customer vars
    v_clean_phone           text;
    v_customer_id           uuid    := p_customer_id;
    v_customer_name         text    := COALESCE(TRIM(p_customer_name), 'Walk-in Customer');
    v_customer_email        text    := NULLIF(TRIM(p_customer_email), '');

    -- Per-service loop vars
    v_service               jsonb;
    v_service_id            uuid;
    v_package_id            uuid;
    v_staff_id              uuid;
    v_service_name          text;
    v_staff_name            text;
    v_item_price            numeric;
    v_item_duration         integer;
    v_item_start            time;
    v_item_end              time;

    -- Accumulators for summary row
    v_total_price           numeric := 0;
    v_total_duration        integer := 0;
    v_all_service_ids       text    := '';
    v_all_staff_ids         text    := '';
    v_all_service_names     text    := '';
    v_all_staff_names       text    := '';
    v_earliest_start        time    := NULL;
    v_latest_end            time    := NULL;
    v_is_first              boolean := true;
BEGIN
    -- ----------------------------------------------------------------
    -- Step 1: Validate
    -- ----------------------------------------------------------------
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service must be selected for booking';
    END IF;

    IF p_booking_id IS NULL THEN
        p_booking_id := gen_random_uuid();
    END IF;

    -- ----------------------------------------------------------------
    -- Step 2: Tenant & permission checks
    -- ----------------------------------------------------------------
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: no permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_booking');
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- ----------------------------------------------------------------
    -- Step 3: Normalize phone
    -- ----------------------------------------------------------------
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g');

    -- ----------------------------------------------------------------
    -- Step 4: Customer upsert / lookup
    -- ----------------------------------------------------------------
    IF p_is_new_customer = false AND p_customer_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM app.customers
            WHERE customer_id = p_customer_id AND company_id = p_company_id
        ) THEN
            RAISE EXCEPTION 'Customer % does not belong to company %', p_customer_id, p_company_id;
        END IF;
    ELSE
        -- Try to find existing customer by normalized phone
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

    -- ----------------------------------------------------------------
    -- Step 5: Loop over services — resolve, validate, INSERT one row
    --         per service into app.bookings, and accumulate summary data
    -- ----------------------------------------------------------------
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id    := (v_service->>'service_id')::uuid;
        v_package_id    := (v_service->>'package_id')::uuid;
        v_staff_id      := (v_service->>'staff_id')::uuid;
        v_item_start    := (v_service->>'start_time')::time;

        IF v_service_id IS NULL AND v_package_id IS NULL THEN
            RAISE EXCEPTION 'Each booking item must have a service_id or package_id';
        END IF;

        -- Resolve service details
        IF v_service_id IS NOT NULL THEN
            SELECT service_name, price, duration
            INTO   v_service_name, v_item_price, v_item_duration
            FROM   app.services
            WHERE  service_id = v_service_id
              AND  company_id = p_company_id
              AND  status = 'active'
            LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Service % not found or inactive', v_service_id;
            END IF;
        ELSE
            SELECT package_name, price, duration
            INTO   v_service_name, v_item_price, v_item_duration
            FROM   app.packages
            WHERE  package_id = v_package_id
              AND  company_id = p_company_id
              AND  status = 'active'
            LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Package % not found or inactive', v_package_id;
            END IF;
        END IF;

        -- Compute end time
        IF v_item_start IS NOT NULL AND v_item_duration IS NOT NULL THEN
            v_item_end := v_item_start + (v_item_duration || ' minutes')::interval;
        ELSE
            v_item_end := NULL;
        END IF;

        -- Resolve staff name
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

        -- ---- INSERT into app.bookings (one row per service) ----
        INSERT INTO app.bookings (
            booking_id, company_id, branch_id,
            customer_id, customer_name, customer_mail, customer_phone,
            service_id, service_name,
            staff_id, staff_name,
            package_id,
            booking_date,
            start_time, end_time, duration,
            price,
            notes, status, payment, booking_type,
            created_at, updated_at
        ) VALUES (
            p_booking_id, p_company_id, p_branch_id,
            v_customer_id, v_customer_name, v_customer_email, v_clean_phone,
            v_service_id, v_service_name,
            v_staff_id, v_staff_name,
            v_package_id,
            p_booking_date,
            v_item_start, v_item_end, v_item_duration,
            COALESCE(v_item_price, 0),
            p_notes, 'pending', NULL, COALESCE(p_booking_type, 'walk-in'),
            NOW(), NOW()
        );

        -- ---- Accumulate summary values ----
        v_total_price    := v_total_price    + COALESCE(v_item_price, 0);
        v_total_duration := v_total_duration + COALESCE(v_item_duration, 0);

        -- Comma-separated ID and name lists
        IF v_is_first THEN
            v_all_service_ids   := COALESCE(v_service_id::text, '');
            v_all_staff_ids     := COALESCE(v_staff_id::text, '');
            v_all_service_names := COALESCE(v_service_name, '');
            v_all_staff_names   := COALESCE(v_staff_name, '');
            v_is_first          := false;
        ELSE
            v_all_service_ids   := v_all_service_ids   || ', ' || COALESCE(v_service_id::text, '');
            v_all_staff_ids     := v_all_staff_ids     || ', ' || COALESCE(v_staff_id::text, '');
            v_all_service_names := v_all_service_names || ', ' || COALESCE(v_service_name, '');
            v_all_staff_names   := v_all_staff_names   || ', ' || COALESCE(v_staff_name, '');
        END IF;

        -- Earliest start / latest end
        IF v_item_start IS NOT NULL THEN
            IF v_earliest_start IS NULL OR v_item_start < v_earliest_start THEN
                v_earliest_start := v_item_start;
            END IF;
        END IF;
        IF v_item_end IS NOT NULL THEN
            IF v_latest_end IS NULL OR v_item_end > v_latest_end THEN
                v_latest_end := v_item_end;
            END IF;
        END IF;

    END LOOP;

    -- ----------------------------------------------------------------
    -- Step 6: INSERT summary row into app.bookings_for_business_transaction
    -- ----------------------------------------------------------------
    INSERT INTO app.bookings_for_business_transaction (
        booking_id, company_id, branch_id,
        customer_id, customer_name, customer_mail, customer_phone,
        service_id, service_name,
        staff_id, staff_name,
        booking_date,
        start_time, end_time,
        total_price, total_duration,
        notes, status, payment_status, booking_type,
        discount_type, discount_name, discount_amount,
        final_amount,
        created_at, updated_at
    ) VALUES (
        p_booking_id, p_company_id, p_branch_id,
        v_customer_id, v_customer_name, v_customer_email, v_clean_phone,
        v_all_service_ids, v_all_service_names,
        v_all_staff_ids,   v_all_staff_names,
        p_booking_date,
        v_earliest_start, v_latest_end,
        v_total_price, v_total_duration,
        p_notes, 'pending', 'unpaid', COALESCE(p_booking_type, 'walk-in'),
        NULL, NULL, NULL,
        v_total_price,
        NOW(), NOW()
    );

    -- ----------------------------------------------------------------
    -- Step 7: INSERT financial transaction row into app.business_transactions
    -- ----------------------------------------------------------------
    INSERT INTO app.business_transactions (
        company_id, branch_id,
        reference_id, reference_type,
        amount, currency,
        payment_method, status,
        notes,
        created_by,
        paid_at,
        discount_type, discount_name, discount_amount,
        final_amount,
        created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id,
        p_booking_id, 'booking',
        v_total_price, 'INR',
        NULL, 'created',
        p_notes,
        auth.uid(),
        NULL,
        NULL, NULL, NULL,
        v_total_price,
        NOW(), NOW()
    );

    -- ----------------------------------------------------------------
    -- Step 8: Return the booking ID
    -- ----------------------------------------------------------------
    RETURN p_booking_id;
END;
$$;
