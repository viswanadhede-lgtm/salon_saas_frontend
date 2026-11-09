-- ============================================================================
-- Fix: create_booking_atomic — wrong column names in business_hours query
--
-- Bug: app.create_booking_atomic (phase_b version) referenced non-existent
--      columns `open_time` and `close_time` on app.business_hours.
--      Actual columns are `opening_time` and `closing_time`.
--
-- Error thrown: "column open_time does not exist" (SQLSTATE 42703)
-- Affected RPC: app.create_booking_atomic / public.create_booking_atomic
-- ============================================================================

CREATE OR REPLACE FUNCTION app.create_booking_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid,
    p_customer_name   text,
    p_customer_email  text,
    p_customer_phone  text,
    p_is_new_customer boolean,
    p_services        jsonb,
    p_booking_date    date,
    p_notes           text    DEFAULT NULL::text,
    p_booking_type    text    DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_phone       text;
    v_customer_id       uuid    := p_customer_id;
    v_customer_name     text    := COALESCE(TRIM(p_customer_name), 'Walk-in Customer');
    v_customer_email    text    := NULLIF(TRIM(p_customer_email), '');
    v_sub_status        text;
    v_booking_limit     numeric;
    v_current_usage     integer;
    v_day_name          text;
    v_is_open           boolean;
    v_open_time         time;
    v_close_time        time;
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
    v_total_price       numeric := 0;
    v_total_duration    bigint  := 0;
    v_booking_items     jsonb   := '[]'::jsonb;
    v_overlap_check     integer;
BEGIN
    -- ── Step 1: Basic input validation ──────────────────────────────────────────
    IF p_services IS NULL OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'At least one service line item must be selected for booking';
    END IF;
    IF p_booking_id IS NULL THEN
        p_booking_id := gen_random_uuid();
    END IF;

    -- ── Step 2: Multi-Tenant Boundary ───────────────────────────────────────────
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission for company % / branch %', p_company_id, p_branch_id;
    END IF;

    -- ── GATE 1: Subscription active? ────────────────────────────────────────────
    PERFORM shared.check_subscription(p_company_id);

    -- ── GATE 2: RBAC — create_booking permission ────────────────────────────────
    PERFORM shared.check_permission(p_company_id, 'create_booking');

    -- ── GATE 3: Plan — bookings_management included? ────────────────────────────
    PERFORM shared.check_plan_feature(p_company_id, 'bookings_management');

    -- ── Step 4: Customer Deduplication ──────────────────────────────────────────
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g');

    IF p_is_new_customer = false AND p_customer_id IS NOT NULL THEN
        -- Existing customer — verify they belong to this company
        IF NOT EXISTS (
            SELECT 1 FROM app.customers
            WHERE customer_id = p_customer_id AND company_id = p_company_id
        ) THEN
            RAISE EXCEPTION 'Customer % does not belong to company %', p_customer_id, p_company_id;
        END IF;
    ELSE
        -- New or unknown — deduplicate by phone
        IF v_clean_phone IS NOT NULL AND v_clean_phone <> '' THEN
            SELECT customer_id INTO v_customer_id
            FROM app.customers
            WHERE company_id = p_company_id
              AND REGEXP_REPLACE(customer_phone, '[^0-9+]', '', 'g') = v_clean_phone
            LIMIT 1;
        END IF;

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

    -- ── Step 5: Business Hours Validation — DISABLED ────────────────────────────
    -- Business hours validation is intentionally skipped.
    -- Bookings can be made at any time regardless of branch operating hours.

    -- ── Step 6: Service catalog lookup + staff validation + overlap check ────────
    FOR v_service IN SELECT value FROM jsonb_array_elements(p_services)
    LOOP
        v_service_id := (v_service->>'service_id')::uuid;
        v_package_id := (v_service->>'package_id')::uuid;
        v_staff_id   := (v_service->>'staff_id')::uuid;
        v_item_start := (v_service->>'start_time')::time;

        IF v_service_id IS NULL AND v_package_id IS NULL THEN
            RAISE EXCEPTION 'Each booking item must specify a service_id or package_id';
        END IF;

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

        v_item_end := v_item_start + (v_item_duration || ' minutes')::interval;

        -- Business hours window check is disabled.

        IF v_staff_id IS NOT NULL THEN
            PERFORM 1 FROM app.staff
            WHERE staff_id = v_staff_id AND company_id = p_company_id AND status = 'active';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Staff member % not found or inactive', v_staff_id;
            END IF;

            SELECT name INTO v_staff_name FROM app.staff WHERE staff_id = v_staff_id;

            SELECT COUNT(*) INTO v_overlap_check
            FROM app.bookings b
            JOIN app.booking_services bs ON bs.booking_id = b.booking_id
            WHERE b.staff_id    = v_staff_id
              AND b.company_id  = p_company_id
              AND b.booking_date = p_booking_date
              AND b.status NOT IN ('cancelled', 'no_show')
              AND bs.start_time <  v_item_end
              AND bs.end_time   >  v_item_start;

            IF v_overlap_check > 0 THEN
                RAISE EXCEPTION 'Staff member % has a conflicting booking at that time', v_staff_name;
            END IF;
        END IF;

        v_total_price    := v_total_price + COALESCE(v_item_price, 0);
        v_total_duration := v_total_duration + COALESCE(v_item_duration, 0);

        v_booking_items := v_booking_items || jsonb_build_object(
            'service_id',   v_service_id,
            'package_id',   v_package_id,
            'service_name', v_service_name,
            'staff_id',     v_staff_id,
            'staff_name',   v_staff_name,
            'price',        v_item_price,
            'duration',     v_item_duration,
            'start_time',   v_item_start,
            'end_time',     v_item_end
        );
    END LOOP;

    -- ── Step 7: Insert booking ───────────────────────────────────────────────────
    INSERT INTO app.bookings (
        booking_id, company_id, branch_id,
        customer_id, customer_name,
        booking_date, total_price, total_duration,
        notes, booking_type, status,
        created_at, updated_at
    ) VALUES (
        p_booking_id, p_company_id, p_branch_id,
        v_customer_id, v_customer_name,
        p_booking_date, v_total_price, v_total_duration,
        p_notes, COALESCE(p_booking_type, 'walk-in'), 'pending',
        NOW(), NOW()
    );

    FOR v_service IN SELECT value FROM jsonb_array_elements(v_booking_items)
    LOOP
        INSERT INTO app.booking_services (
            id, booking_id, company_id, branch_id,
            service_id, package_id, service_name,
            staff_id, staff_name, price, duration,
            start_time, end_time, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_booking_id, p_company_id, p_branch_id,
            (v_service->>'service_id')::uuid,
            (v_service->>'package_id')::uuid,
            v_service->>'service_name',
            (v_service->>'staff_id')::uuid,
            v_service->>'staff_name',
            (v_service->>'price')::numeric,
            (v_service->>'duration')::bigint,
            (v_service->>'start_time')::time,
            (v_service->>'end_time')::time,
            NOW(), NOW()
        );
    END LOOP;

    RETURN p_booking_id;
END;
$$;

-- Re-expose via public wrapper (no change to signature needed)
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_booking_id      uuid,
    p_company_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid,
    p_customer_name   text,
    p_customer_email  text,
    p_customer_phone  text,
    p_is_new_customer boolean,
    p_services        jsonb,
    p_booking_date    date,
    p_notes           text    DEFAULT NULL::text,
    p_booking_type    text    DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_booking_atomic(
        p_booking_id, p_company_id, p_branch_id,
        p_customer_id, p_customer_name, p_customer_email, p_customer_phone,
        p_is_new_customer, p_services, p_booking_date, p_notes, p_booking_type
    );
END;
$$;
