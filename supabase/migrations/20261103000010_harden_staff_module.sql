-- =============================================================================
-- Migration: 20261103000010_harden_staff_module.sql
-- Module 5: Staff Management, Staff Scheduling & Branch Operating Hours
-- Architecture: Zero-Trust Frontend / Authoritative Backend-First Standard
--
-- Objects Deployed:
--   1. app.create_staff_atomic          / public.create_staff_atomic
--   2. app.update_staff_atomic          / public.update_staff_atomic
--   3. app.delete_staff_atomic          / public.delete_staff_atomic
--   4. app.save_staff_schedule_atomic   / public.save_staff_schedule_atomic
--   5. app.delete_staff_schedule_atomic / public.delete_staff_schedule_atomic
--   6. app.save_business_hours_atomic   / public.save_business_hours_atomic
-- =============================================================================

-- =============================================================================
-- PART 1: STAFF DIRECTORY RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_staff_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_staff_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_staff_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_staff_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_staff_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_staff_atomic CASCADE;

CREATE OR REPLACE FUNCTION app.create_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_name       text,
    p_phone            text,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT 'Staff',
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := NULLIF(trim(p_staff_name), '');
    v_clean_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_clean_email text := NULLIF(lower(trim(p_email)), '');
    v_status text := COALESCE(NULLIF(lower(trim(p_status)), ''), 'active');
    v_new_staff_id uuid := gen_random_uuid();
    v_max_staff numeric;
    v_current_staff_count int;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF v_clean_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff name is required.');
    END IF;

    IF length(v_clean_phone) < 7 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid phone number with at least 7 digits is required.');
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    -- SaaS Plan Limit Check for max_staff
    SELECT l.limit_value INTO v_max_staff
    FROM platform.subscriptions s
    JOIN platform.plan_limits l ON l.plan_id = s.plan_id AND l.limit_key = 'max_staff'
    WHERE s.company_id = p_company_id
      AND LOWER(COALESCE(s.status, '')) IN ('active', 'trialing', 'authenticated')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_max_staff IS NOT NULL AND v_max_staff > 0 THEN
        SELECT COUNT(*) INTO v_current_staff_count
        FROM app.staff
        WHERE company_id = p_company_id
          AND status <> 'deleted';

        IF v_current_staff_count >= v_max_staff THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Maximum staff limit (' || v_max_staff || ') reached for your subscription plan. Please upgrade your plan to add more staff.'
            );
        END IF;
    END IF;

    -- Phone Deduplication Check in branch (matching normalized phone or last 10 digits)
    IF EXISTS (
        SELECT 1 FROM app.staff
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND status <> 'deleted'
          AND (
              regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_clean_phone
              OR (
                  length(v_clean_phone) >= 10
                  AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
                  AND RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_phone, 10)
              )
          )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Another staff member already uses this phone number.');
    END IF;

    INSERT INTO app.staff (
        staff_id, company_id, branch_id, staff_name, phone, email,
        role_name, services_offered, notes, status, joined_at, created_at, updated_at
    ) VALUES (
        v_new_staff_id, p_company_id, p_branch_id, v_clean_name, trim(p_phone), v_clean_email,
        COALESCE(NULLIF(trim(p_role_name), ''), 'Staff'),
        NULLIF(trim(p_services_offered), ''),
        NULLIF(trim(p_notes), ''),
        v_status, CURRENT_DATE, NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_new_staff_id,
        'staff_name', v_clean_name,
        'status', v_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_name       text,
    p_phone            text,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT 'Staff',
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_staff_atomic(
        p_company_id, p_branch_id, p_staff_name, p_phone,
        p_email, p_role_name, p_services_offered, p_notes, p_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.update_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_staff_name       text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT NULL,
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := NULLIF(trim(p_staff_name), '');
    v_clean_phone text := CASE WHEN p_phone IS NOT NULL THEN regexp_replace(trim(p_phone), '[^0-9]', '', 'g') ELSE NULL END;
    v_clean_email text := CASE WHEN p_email IS NOT NULL THEN NULLIF(lower(trim(p_email)), '') ELSE NULL END;
    v_status text := CASE WHEN p_status IS NOT NULL THEN NULLIF(lower(trim(p_status)), '') ELSE NULL END;
    v_old_name text;
    v_old_phone text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT staff_name, phone INTO v_old_name, v_old_phone
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_old_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff member not found or does not belong to this branch.');
    END IF;

    IF p_staff_name IS NOT NULL AND v_clean_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff name cannot be empty.');
    END IF;

    IF v_clean_phone IS NOT NULL THEN
        IF length(v_clean_phone) < 7 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Phone number must have at least 7 digits.');
        END IF;

        IF EXISTS (
            SELECT 1 FROM app.staff
            WHERE company_id = p_company_id
              AND branch_id = p_branch_id
              AND staff_id <> p_staff_id
              AND status <> 'deleted'
              AND (
                  regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_clean_phone
                  OR (
                      length(v_clean_phone) >= 10
                      AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
                      AND RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_phone, 10)
                  )
              )
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Another staff member already uses this phone number.');
        END IF;
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    UPDATE app.staff SET
        staff_name = COALESCE(v_clean_name, staff_name),
        phone = CASE WHEN p_phone IS NOT NULL THEN trim(p_phone) ELSE phone END,
        email = CASE WHEN p_email IS NOT NULL THEN v_clean_email ELSE email END,
        role_name = CASE WHEN p_role_name IS NOT NULL THEN COALESCE(NULLIF(trim(p_role_name), ''), 'Staff') ELSE role_name END,
        services_offered = CASE WHEN p_services_offered IS NOT NULL THEN NULLIF(trim(p_services_offered), '') ELSE services_offered END,
        notes = CASE WHEN p_notes IS NOT NULL THEN NULLIF(trim(p_notes), '') ELSE notes END,
        status = COALESCE(v_status, status),
        updated_at = NOW()
    WHERE staff_id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'staff_name', COALESCE(v_clean_name, v_old_name),
        'status', COALESCE(v_status, (SELECT status FROM app.staff WHERE staff_id = p_staff_id))
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_staff_name       text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT NULL,
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_staff_atomic(
        p_company_id, p_branch_id, p_staff_id, p_staff_name, p_phone,
        p_email, p_role_name, p_services_offered, p_notes, p_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_staff_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_staff_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_staff_name text;
    v_future_bookings int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT staff_name INTO v_staff_name
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_staff_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff member not found or already deleted.');
    END IF;

    -- Dependency Guard: Check for upcoming active bookings
    SELECT COUNT(*) INTO v_future_bookings
    FROM app.bookings
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_future_bookings > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete this staff member because there are ' || v_future_bookings || ' upcoming active booking(s) assigned to them. Please reschedule or reassign the booking(s) first.'
        );
    END IF;

    -- Soft-delete staff
    UPDATE app.staff
    SET status = 'deleted',
        updated_at = NOW()
    WHERE staff_id = p_staff_id;

    -- Clean up future schedules so they don't produce ghost calendar availability
    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= CURRENT_DATE;

    RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id, 'status', 'deleted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_staff_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_staff_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_staff_atomic(p_company_id, p_branch_id, p_staff_id);
END;
$$;

-- =============================================================================
-- PART 2: STAFF SCHEDULE RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS public.save_staff_schedule_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_staff_schedule_atomic CASCADE;
DROP FUNCTION IF EXISTS app.save_staff_schedule_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_staff_schedule_atomic CASCADE;

CREATE OR REPLACE FUNCTION app.save_staff_schedule_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_year             int,
    p_month            int,
    p_schedule_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_month_start date;
    v_month_end date;
    v_month_str text;
    v_delete_from date;
    v_staff_name text;
    v_conflict_date date;
    v_conflict_start time;
    v_conflict_end time;
    v_inserted_count int := 0;
    r RECORD;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid year and month (1-12) are required.');
    END IF;

    SELECT staff_name INTO v_staff_name
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_staff_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff member not found or is deleted.');
    END IF;

    v_month_start := make_date(p_year, p_month, 1);
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;
    v_month_str := to_char(v_month_start, 'YYYY-MM');
    v_delete_from := GREATEST(CURRENT_DATE, v_month_start);

    IF v_delete_from > v_month_end THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot modify schedules for a past month.');
    END IF;

    -- Booking Conflict Verification
    IF p_schedule_entries IS NOT NULL AND jsonb_array_length(p_schedule_entries) > 0 THEN
        FOR r IN (
            SELECT 
                (e->>'schedule_date')::date AS s_date,
                COALESCE((e->>'is_off')::boolean, false) AS s_off,
                NULLIF(e->>'start_time', '')::time AS s_start,
                NULLIF(e->>'end_time', '')::time AS s_end
            FROM jsonb_array_elements(p_schedule_entries) AS e
            WHERE (e->>'schedule_date')::date >= v_delete_from
              AND (e->>'schedule_date')::date <= v_month_end
        ) LOOP
            IF r.s_off = true THEN
                SELECT booking_date, start_time, end_time
                INTO v_conflict_date, v_conflict_start, v_conflict_end
                FROM app.bookings
                WHERE staff_id = p_staff_id
                  AND company_id = p_company_id
                  AND branch_id = p_branch_id
                  AND booking_date = r.s_date
                  AND status IN ('booked', 'confirmed')
                LIMIT 1;

                IF FOUND THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Cannot mark stylist as off-duty on ' || to_char(v_conflict_date, 'YYYY-MM-DD') || ' because an active appointment is scheduled from ' || to_char(v_conflict_start, 'HH24:MI') || ' to ' || to_char(v_conflict_end, 'HH24:MI') || '. Please reschedule or reassign the appointment first.'
                    );
                END IF;
            ELSIF r.s_start IS NOT NULL AND r.s_end IS NOT NULL THEN
                SELECT booking_date, start_time, end_time
                INTO v_conflict_date, v_conflict_start, v_conflict_end
                FROM app.bookings
                WHERE staff_id = p_staff_id
                  AND company_id = p_company_id
                  AND branch_id = p_branch_id
                  AND booking_date = r.s_date
                  AND status IN ('booked', 'confirmed')
                  AND (start_time < r.s_start OR end_time > r.s_end)
                LIMIT 1;

                IF FOUND THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Shift hours (' || to_char(r.s_start, 'HH24:MI') || '-' || to_char(r.s_end, 'HH24:MI') || ') on ' || to_char(v_conflict_date, 'YYYY-MM-DD') || ' conflict with an active appointment scheduled from ' || to_char(v_conflict_start, 'HH24:MI') || ' to ' || to_char(v_conflict_end, 'HH24:MI') || '. Please reschedule the appointment first.'
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Atomically purge existing entries in range
    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= v_delete_from
      AND schedule_date <= v_month_end;

    -- Bulk insert new schedule entries
    IF p_schedule_entries IS NOT NULL AND jsonb_array_length(p_schedule_entries) > 0 THEN
        INSERT INTO app.staff_schedule (
            id, schedule_id, company_id, branch_id, staff_id,
            schedule_date, schedule_month, start_time, end_time, is_off, notes, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), gen_random_uuid(), p_company_id, p_branch_id, p_staff_id,
            (e->>'schedule_date')::date,
            v_month_str,
            NULLIF(e->>'start_time', '')::time,
            NULLIF(e->>'end_time', '')::time,
            COALESCE((e->>'is_off')::boolean, false),
            NULLIF(trim(e->>'notes'), ''),
            NOW(), NOW()
        FROM jsonb_array_elements(p_schedule_entries) AS e
        WHERE (e->>'schedule_date')::date >= v_delete_from
          AND (e->>'schedule_date')::date <= v_month_end;

        GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'month', v_month_str,
        'saved_entries_count', v_inserted_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_staff_schedule_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_year             int,
    p_month            int,
    p_schedule_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.save_staff_schedule_atomic(
        p_company_id, p_branch_id, p_staff_id, p_year, p_month, p_schedule_entries
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_staff_schedule_atomic(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_staff_id     uuid,
    p_target_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_month_start date;
    v_month_end date;
    v_delete_from date;
    v_active_bookings int := 0;
    v_deleted_count int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF p_target_month IS NULL OR p_target_month !~ '^\d{4}-\d{2}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target month must be in format YYYY-MM.');
    END IF;

    v_month_start := (p_target_month || '-01')::date;
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;
    v_delete_from := GREATEST(CURRENT_DATE, v_month_start);

    IF v_delete_from > v_month_end THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot delete past schedules.');
    END IF;

    -- Booking Check
    SELECT COUNT(*) INTO v_active_bookings
    FROM app.bookings
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= v_delete_from
      AND booking_date <= v_month_end;

    IF v_active_bookings > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete schedule for ' || p_target_month || ' because there are ' || v_active_bookings || ' active booking(s) scheduled for this staff member during this period. Please reschedule them first.'
        );
    END IF;

    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= v_delete_from
      AND schedule_date <= v_month_end;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'target_month', p_target_month,
        'deleted_count', v_deleted_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_staff_schedule_atomic(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_staff_id     uuid,
    p_target_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_staff_schedule_atomic(
        p_company_id, p_branch_id, p_staff_id, p_target_month
    );
END;
$$;

-- =============================================================================
-- PART 3: BRANCH OPERATING HOURS RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS public.save_business_hours_atomic CASCADE;
DROP FUNCTION IF EXISTS app.save_business_hours_atomic CASCADE;

CREATE OR REPLACE FUNCTION app.save_business_hours_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_hours      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    r RECORD;
    v_day text;
    v_open boolean;
    v_start time;
    v_end time;
    v_upsert_count int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array' OR jsonb_array_length(p_hours) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Business hours array cannot be empty.');
    END IF;

    -- Validation loop
    FOR r IN SELECT value FROM jsonb_array_elements(p_hours) LOOP
        v_day := initcap(trim(r.value->>'day_of_week'));
        v_open := COALESCE((r.value->>'is_open')::boolean, true);
        v_start := NULLIF(r.value->>'opening_time', '')::time;
        v_end := NULLIF(r.value->>'closing_time', '')::time;

        IF v_day NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid day of week: ' || COALESCE(v_day, 'NULL'));
        END IF;

        IF v_open = true THEN
            IF v_start IS NULL OR v_end IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Opening and closing times are required when ' || v_day || ' is marked open.');
            END IF;

            IF v_start >= v_end THEN
                RETURN jsonb_build_object('success', false, 'error', 'Opening time (' || to_char(v_start, 'HH24:MI') || ') must be earlier than closing time (' || to_char(v_end, 'HH24:MI') || ') for ' || v_day || '.');
            END IF;
        END IF;
    END LOOP;

    -- Upsert all 7 days
    INSERT INTO app.business_hours (
        id, company_id, branch_id, day_of_week, opening_time, closing_time, is_open, updated_at
    )
    SELECT
        gen_random_uuid(),
        p_company_id,
        p_branch_id,
        initcap(trim(h->>'day_of_week')),
        NULLIF(h->>'opening_time', '')::time,
        NULLIF(h->>'closing_time', '')::time,
        COALESCE((h->>'is_open')::boolean, true),
        NOW()
    FROM jsonb_array_elements(p_hours) AS h
    ON CONFLICT (company_id, branch_id, day_of_week)
    DO UPDATE SET
        opening_time = EXCLUDED.opening_time,
        closing_time = EXCLUDED.closing_time,
        is_open = EXCLUDED.is_open,
        updated_at = NOW();

    GET DIAGNOSTICS v_upsert_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'updated_count', v_upsert_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_business_hours_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_hours      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.save_business_hours_atomic(p_company_id, p_branch_id, p_hours);
END;
$$;

-- =============================================================================
-- PART 4: PERMISSIONS & GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.create_staff_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_staff_atomic          TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_staff_schedule_atomic   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_staff_schedule_atomic TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_business_hours_atomic   TO anon, authenticated;
