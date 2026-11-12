-- Migration: 20261112000012_streamline_create_booking_atomic.sql
-- Description:
--   Streamline RPC #1 (create_booking_atomic) to strict 2-Section architecture:
--   Section 1: Security & Auth Gates (Tenant verify + 3 Gates: Subscription, Permission, Plan Feature).
--   Section 2: Core 3-Table Triad Insertion:
--     - Customer verification (match existing only — zero customer inserts).
--     - Table 1: app.bookings (and line items with package_id written ONLY when service belongs to package).
--     - Table 2: app.bookings_for_business_transaction (1 consolidated operational summary row).
--     - Table 3: app.business_transactions (1 open financial ledger record with status = 'created').

-- ── 1. MASTER FUNCTION IN APP SCHEMA ─────────────────────────────────────────
DROP FUNCTION IF EXISTS app.create_booking_atomic(uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, date, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_booking_atomic(uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, date, text, text) CASCADE;

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

    -- Update last_visit date on the customer profile
    UPDATE app.customers
    SET last_visit = v_booking_date, updated_at = NOW()
    WHERE customer_id = v_customer_rec.customer_id;

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
        
        -- Resolve duration from JSON, or time interval, or default 30 mins
        v_item_duration := COALESCE(
            NULLIF(v_service->>'duration', '')::integer,
            CASE 
                WHEN v_item_start IS NOT NULL AND v_item_end IS NOT NULL 
                THEN GREATEST((EXTRACT(EPOCH FROM (v_item_end - v_item_start)) / 60)::integer, 0)
                ELSE 30
            END
        );

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
        notes,
        created_by,     created_by_user_name,
        paid_at,
        discount_type,  discount_name,  discount_amount,
        final_amount,
        created_at,     updated_at
    ) VALUES (
        gen_random_uuid(),
        p_company_id,   p_branch_id,
        p_booking_id,   'booking',
        v_total_price,  'INR',
        NULL,           'created',
        p_notes,
        v_created_by_id, v_created_by_name,
        NULL,
        NULL, NULL, 0,
        v_total_price,
        NOW(),          NOW()
    );

    RETURN p_booking_id;
END;
$$;

-- ── 2. PUBLIC GATEWAY WRAPPER ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
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
BEGIN
    RETURN app.create_booking_atomic(
        p_booking_id,
        p_company_id,
        p_branch_id,
        p_customer_id,
        p_customer_name,
        p_customer_email,
        p_customer_phone,
        p_is_new_customer,
        p_services,
        p_booking_date,
        p_notes,
        p_booking_type
    );
END;
$$;

-- ── 3. GRANTS & RELOAD ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION app.create_booking_atomic(uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, date, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, date, text, text) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
