-- =============================================================================
-- Migration: 20261127000007_harden_save_business_hours_atomic.sql
-- Purpose  : Upgrade save_business_hours_atomic from app schema → shared schema
--            with full 2-section hardened pattern (ACLs, subscription,
--            save_hours_settings permission gate, Title Case day_of_week check
--            matching business_hours_day_of_week_check, opening_time/closing_time
--            columns, and branch existence guard)
-- =============================================================================

-- ─── PART A: DROP OLD FUNCTIONS ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS app.save_business_hours_atomic(uuid, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.save_business_hours_atomic(uuid, uuid, jsonb) CASCADE;

-- ─── PART B: CREATE shared.save_business_hours_atomic ────────────────────────

CREATE OR REPLACE FUNCTION shared.save_business_hours_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_hours      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, app, platform, public, pg_temp
AS $$
DECLARE
    v_hour           jsonb;
    v_day            text;
    v_is_open        boolean;
    v_open_time      time;
    v_close_time     time;
    v_id             uuid;
    v_upserted_count integer := 0;
    v_valid_days     text[]  := ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    v_seen_days      text[]  := ARRAY[]::text[];
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 1.1: NULL & structural guards
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id is required');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'branch_id is required');
    END IF;
    IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array' OR jsonb_array_length(p_hours) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Hours data is required and must be a non-empty array');
    END IF;

    -- Step 1.2: Domain validation on each day entry
    FOR v_hour IN SELECT value FROM jsonb_array_elements(p_hours)
    LOOP
        v_day     := INITCAP(LOWER(TRIM(v_hour->>'day_of_week')));
        v_is_open := COALESCE((v_hour->>'is_open')::boolean, false);

        -- day_of_week must match app.business_hours CHECK constraint (Monday–Sunday)
        IF v_day IS NULL OR NOT (v_day = ANY(v_valid_days)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format('Invalid day_of_week: "%s". Must be Monday–Sunday.', COALESCE(v_hour->>'day_of_week', 'NULL'))
            );
        END IF;

        -- Reject duplicate day_of_week entries in the same payload
        IF v_day = ANY(v_seen_days) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format('Duplicate day_of_week in payload: %s', v_day)
            );
        END IF;
        v_seen_days := array_append(v_seen_days, v_day);

        v_open_time  := NULLIF(TRIM(v_hour->>'opening_time'), '')::time;
        v_close_time := NULLIF(TRIM(v_hour->>'closing_time'), '')::time;

        -- If open: opening_time and closing_time must be present and valid
        IF v_is_open THEN
            IF v_open_time IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', format('Opening time is required when %s is open', v_day));
            END IF;
            IF v_close_time IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', format('Closing time is required when %s is open', v_day));
            END IF;
            IF v_open_time >= v_close_time THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'message', format(
                        'Opening time (%s) must be before closing time (%s) for %s',
                        to_char(v_open_time, 'HH24:MI'),
                        to_char(v_close_time, 'HH24:MI'),
                        v_day
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- Step 1.3: Tenant & branch security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: invalid company or branch context');
    END IF;

    -- Step 1.4: Subscription gate
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission gate
    PERFORM shared.check_permission(p_company_id, 'save_hours_settings');

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 2.1: Verify active/non-deleted branch exists with FOR UPDATE lock
    IF NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id  = p_branch_id
          AND company_id = p_company_id
          AND status     <> 'deleted'
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch not found or has been deleted');
    END IF;

    -- Step 2.2: Loop through each day and upsert into app.business_hours
    FOR v_hour IN SELECT value FROM jsonb_array_elements(p_hours)
    LOOP
        v_day        := INITCAP(LOWER(TRIM(v_hour->>'day_of_week')));
        v_is_open    := COALESCE((v_hour->>'is_open')::boolean, false);
        v_open_time  := NULLIF(TRIM(v_hour->>'opening_time'), '')::time;
        v_close_time := NULLIF(TRIM(v_hour->>'closing_time'), '')::time;

        SELECT id INTO v_id
        FROM app.business_hours
        WHERE company_id  = p_company_id
          AND branch_id   = p_branch_id
          AND day_of_week = v_day
        LIMIT 1;

        IF FOUND THEN
            UPDATE app.business_hours SET
                is_open      = v_is_open,
                opening_time = v_open_time,
                closing_time = v_close_time,
                updated_at   = now()
            WHERE id = v_id;
        ELSE
            INSERT INTO app.business_hours (
                id, company_id, branch_id, day_of_week,
                is_open, opening_time, closing_time,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_company_id, p_branch_id, v_day,
                v_is_open, v_open_time, v_close_time,
                now(), now()
            );
        END IF;

        v_upserted_count := v_upserted_count + 1;
    END LOOP;

    -- Step 2.3: Return success
    RETURN jsonb_build_object('success', true, 'updated_count', v_upserted_count);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- ─── PART C: ACL on shared.save_business_hours_atomic ────────────────────────

REVOKE ALL ON FUNCTION shared.save_business_hours_atomic(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION shared.save_business_hours_atomic(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION shared.save_business_hours_atomic(uuid, uuid, jsonb) TO authenticated, service_role;

-- ─── PART D: CREATE public.save_business_hours_atomic (thin wrapper) ─────────

CREATE OR REPLACE FUNCTION public.save_business_hours_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_hours      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.save_business_hours_atomic(p_company_id, p_branch_id, p_hours);
END;
$$;

-- ─── PART E: ACL on public.save_business_hours_atomic ────────────────────────

REVOKE ALL ON FUNCTION public.save_business_hours_atomic(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_business_hours_atomic(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_business_hours_atomic(uuid, uuid, jsonb) TO authenticated, service_role;
