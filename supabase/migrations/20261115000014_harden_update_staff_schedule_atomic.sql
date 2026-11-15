-- =============================================================================
-- Migration: 20261115000014_harden_update_staff_schedule_atomic.sql
-- Module: Staff Module (Page 2: Staff Schedules)
-- RPC 2: app.update_staff_schedule_atomic / public.update_staff_schedule_atomic
-- Standard: Two-Tier Architecture (Section 1 Security & Preconditions fail-fast,
--           Section 2 Sequential Atomic Core Logic with Concurrency Controls)
-- Tables Written: app.staff_schedule (DELETE + INSERT)
-- Tables Read: app.staff, shared.branches, app.bookings, app.staff_schedule
-- =============================================================================

-- Drop legacy overload variants to eliminate RPC signature ambiguity
DROP FUNCTION IF EXISTS public.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) CASCADE;
DROP FUNCTION IF EXISTS app.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.update_staff_schedule_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.update_staff_schedule_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_year             integer,
    p_month            integer,
    p_schedule_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- State & computation variables
    v_staff_name       text;
    v_staff_status     text;
    v_month_start      date;
    v_month_end        date;
    v_month_str        text;
    v_delete_from      date;
    v_inserted_count   integer := 0;
    
    -- Booking conflict verification variables
    v_conflict_date    date;
    v_conflict_start   time;
    v_conflict_end     time;
    r                  RECORD;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- SECTION 1: SECURITY & PRECONDITION FAIL-FAST GATES
    -- ─────────────────────────────────────────────────────────────────────────

    -- 1.1 Mandatory Identifier NULL Guards
    IF p_company_id IS NULL OR p_branch_id IS NULL OR p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Company ID, Branch ID, and Staff ID are required.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 1.2 Year & Month Boundary Validation
    IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'Valid year (2000-2100) and month (1-12) are required.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 1.3 Tenant Boundary Isolation Guard
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.'
            USING ERRCODE = '42501';
    END IF;

    -- Verify target branch exists, belongs to company, and is active
    PERFORM 1 FROM shared.branches
    WHERE branch_id = p_branch_id
      AND company_id = p_company_id
      AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or is inactive.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 1.4 Active Subscription Guard
    PERFORM shared.check_subscription(p_company_id);

    -- 1.5 Granular RBAC Permission Guard
    PERFORM shared.check_permission(p_company_id, 'edit_staff_schedule');

    -- ─────────────────────────────────────────────────────────────────────────
    -- SECTION 2: SEQUENTIAL ATOMIC CORE BUSINESS LOGIC
    -- ─────────────────────────────────────────────────────────────────────────

    -- Step 2.1: Staff Existence & Row Lock (Pessimistic Concurrency Control)
    SELECT staff_name, status INTO v_staff_name, v_staff_status
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found or is deleted.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Compute Calendar Month Date Boundaries
    v_month_start := make_date(p_year, p_month, 1);
    v_month_end   := (v_month_start + interval '1 month - 1 day')::date;
    v_month_str   := to_char(v_month_start, 'YYYY-MM');

    -- Step 2.3: Historical Past-Month Protection Guard
    -- We allow modifying future days in current month, but never strictly past months.
    v_delete_from := GREATEST(CURRENT_DATE, v_month_start);

    IF v_delete_from > v_month_end THEN
        RAISE EXCEPTION 'Cannot modify schedules for a past month. Past rosters are preserved for historical audit.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.4: Existing Schedule Precondition Check (Core Update Invariant)
    IF NOT EXISTS (
        SELECT 1 FROM app.staff_schedule
        WHERE staff_id = p_staff_id
          AND company_id = p_company_id
          AND branch_id = p_branch_id
          AND schedule_month = v_month_str
    ) THEN
        RAISE EXCEPTION 'No existing schedule found for % in % to update. Please create a schedule first.',
            v_staff_name, v_month_str
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.5: Active Booking Conflict Verification Loop (The "Never Ghost A Customer" Guard)
    IF p_schedule_entries IS NOT NULL AND jsonb_array_length(p_schedule_entries) > 0 THEN
        FOR r IN (
            SELECT 
                (e->>'schedule_date')::date AS s_date,
                COALESCE((e->>'is_off')::boolean, false) AS s_off,
                NULLIF(TRIM(e->>'start_time'), '')::time AS s_start,
                NULLIF(TRIM(e->>'end_time'), '')::time AS s_end,
                NULLIF(TRIM(e->>'notes'), '') AS s_notes
            FROM jsonb_array_elements(p_schedule_entries) AS e
            WHERE (e->>'schedule_date')::date >= v_delete_from
              AND (e->>'schedule_date')::date <= v_month_end
        ) LOOP
            -- Time logic validation: start time must precede end time when working
            IF NOT r.s_off AND r.s_start IS NOT NULL AND r.s_end IS NOT NULL AND r.s_start >= r.s_end THEN
                RAISE EXCEPTION 'Shift start time (%) must be earlier than shift end time (%) on %.',
                    to_char(r.s_start, 'HH24:MI'),
                    to_char(r.s_end, 'HH24:MI'),
                    to_char(r.s_date, 'YYYY-MM-DD')
                USING ERRCODE = 'P0001';
            END IF;

            -- Conflict Check A: Marked off-duty while active bookings exist on that day
            IF r.s_off = true THEN
                SELECT booking_date, start_time, end_time
                INTO v_conflict_date, v_conflict_start, v_conflict_end
                FROM app.bookings
                WHERE staff_id = p_staff_id
                  AND company_id = p_company_id
                  AND branch_id = p_branch_id
                  AND booking_date = r.s_date
                  AND booking_status IN ('booked', 'confirmed')
                LIMIT 1;

                IF FOUND THEN
                    RAISE EXCEPTION 'Cannot mark stylist as off-duty on % because an active appointment is scheduled from % to %. Please reschedule or reassign the appointment first.',
                        to_char(v_conflict_date, 'YYYY-MM-DD'),
                        to_char(v_conflict_start, 'HH24:MI'),
                        to_char(v_conflict_end, 'HH24:MI')
                    USING ERRCODE = 'P0001';
                END IF;

            -- Conflict Check B: Shift hours shrunk outside active booking time window
            ELSIF r.s_start IS NOT NULL AND r.s_end IS NOT NULL THEN
                SELECT booking_date, start_time, end_time
                INTO v_conflict_date, v_conflict_start, v_conflict_end
                FROM app.bookings
                WHERE staff_id = p_staff_id
                  AND company_id = p_company_id
                  AND branch_id = p_branch_id
                  AND booking_date = r.s_date
                  AND booking_status IN ('booked', 'confirmed')
                  AND (start_time < r.s_start OR end_time > r.s_end)
                LIMIT 1;

                IF FOUND THEN
                    RAISE EXCEPTION 'Shift hours (% - %) on % conflict with an active appointment scheduled from % to %. Please reschedule the appointment first.',
                        to_char(r.s_start, 'HH24:MI'),
                        to_char(r.s_end, 'HH24:MI'),
                        to_char(v_conflict_date, 'YYYY-MM-DD'),
                        to_char(v_conflict_start, 'HH24:MI'),
                        to_char(v_conflict_end, 'HH24:MI')
                    USING ERRCODE = 'P0001';
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Step 2.6: Atomic Purge of Existing Modifiable Shifts
    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= v_delete_from
      AND schedule_date <= v_month_end;

    -- Step 2.7: Bulk Insert Verified Shift Rows
    IF p_schedule_entries IS NOT NULL AND jsonb_array_length(p_schedule_entries) > 0 THEN
        INSERT INTO app.staff_schedule (
            id,
            schedule_id,
            company_id,
            branch_id,
            staff_id,
            schedule_date,
            schedule_month,
            start_time,
            end_time,
            is_off,
            notes,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            gen_random_uuid(),
            p_company_id,
            p_branch_id,
            p_staff_id,
            (e->>'schedule_date')::date,
            v_month_str,
            NULLIF(TRIM(e->>'start_time'), '')::time,
            NULLIF(TRIM(e->>'end_time'), '')::time,
            COALESCE((e->>'is_off')::boolean, false),
            NULLIF(TRIM(e->>'notes'), ''),
            NOW(),
            NOW()
        FROM jsonb_array_elements(p_schedule_entries) AS e
        WHERE (e->>'schedule_date')::date >= v_delete_from
          AND (e->>'schedule_date')::date <= v_month_end;

        GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    END IF;

    -- Step 2.8: Authoritative Return Confirmation Payload
    RETURN jsonb_build_object(
        'success', true,
        'action', 'update',
        'staff_id', p_staff_id,
        'staff_name', v_staff_name,
        'month', v_month_str,
        'updated_count', v_inserted_count,
        'effective_from', to_char(v_delete_from, 'YYYY-MM-DD'),
        'effective_to', to_char(v_month_end, 'YYYY-MM-DD')
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down canonical app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 API pass-through for client compatibility)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_staff_schedule_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_year             integer,
    p_month            integer,
    p_schedule_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_staff_schedule_atomic(
        p_company_id,
        p_branch_id,
        p_staff_id,
        p_year,
        p_month,
        p_schedule_entries
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_staff_schedule_atomic(uuid, uuid, uuid, integer, integer, jsonb) TO authenticated, service_role;

