-- ============================================================================
-- Migration: 20261111000003_fix_create_booking_atomic_status_booked.sql
-- Description: In app.create_booking_atomic, set initial booking_status to 'booked'
--              instead of 'pending'. Also migrate existing 'pending' booking rows to 'booked'.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.create_booking_atomic(
    p_booking_id uuid DEFAULT NULL::uuid,
    p_company_id uuid DEFAULT NULL::uuid,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT NULL::text,
    p_customer_email text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_is_new_customer boolean DEFAULT false,
    p_services jsonb DEFAULT '[]'::jsonb,
    p_booking_date date DEFAULT NULL::date,
    p_notes text DEFAULT NULL::text,
    p_booking_type text DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    v_pkg_id            uuid;
    v_pkg_price         numeric;
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
            SELECT package_name, COALESCE(final_price, original_price, 0), 60 INTO v_service_name, v_item_price, v_item_duration
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
            p_notes,        'booked',       NULL,           COALESCE(p_booking_type, 'walk-in'),
            v_created_by_id,                v_created_by_name,
            NOW(),          NOW()
        );

        -- Add to total ONLY if this is a standalone service (not part of a package)
        IF v_package_id IS NULL THEN
            v_total_price := v_total_price + COALESCE(v_item_price, 0);
        END IF;

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

    -- Add each distinct package price ONCE (using final_price or original_price)
    FOR v_pkg_id IN
        SELECT DISTINCT NULLIF(value->>'package_id', '')::uuid
        FROM jsonb_array_elements(p_services)
        WHERE NULLIF(value->>'package_id', '') IS NOT NULL
    LOOP
        SELECT COALESCE(final_price, original_price, 0) INTO v_pkg_price
        FROM app.packages
        WHERE package_id = v_pkg_id AND company_id = p_company_id
        LIMIT 1;

        v_total_price := v_total_price + COALESCE(v_pkg_price, 0);
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
        p_notes,        'booked',       'unpaid',       COALESCE(p_booking_type, 'walk-in'),
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
$function$;

-- Update public schema wrapper if exists
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_booking_id uuid DEFAULT NULL::uuid,
    p_company_id uuid DEFAULT NULL::uuid,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT NULL::text,
    p_customer_email text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_is_new_customer boolean DEFAULT false,
    p_services jsonb DEFAULT '[]'::jsonb,
    p_booking_date date DEFAULT NULL::date,
    p_notes text DEFAULT NULL::text,
    p_booking_type text DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN app.create_booking_atomic(
        p_booking_id, p_company_id, p_branch_id, p_customer_id,
        p_customer_name, p_customer_email, p_customer_phone,
        p_is_new_customer, p_services, p_booking_date, p_notes, p_booking_type
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION app.create_booking_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic TO anon, authenticated, service_role;

-- Migrate all existing 'pending' booking rows to 'booked'
UPDATE app.bookings
SET booking_status = 'booked'
WHERE LOWER(booking_status) = 'pending';

UPDATE app.bookings_for_business_transaction
SET booking_status = 'booked'
WHERE LOWER(booking_status) = 'pending';

NOTIFY pgrst, 'reload schema';

