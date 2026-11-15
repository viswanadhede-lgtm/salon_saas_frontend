-- =============================================================================
-- Migration: 20261115000012_harden_global_staff_profile_modal.sql
-- Module: Staff Management (Page 1 - Staff Directory & Profile Modal)
-- Target: app.global_staff_profile_modal and public.global_staff_profile_modal
-- Architecture: Two-Tier Standard (Section 1 = Security & Preconditions, Section 2 = Core Logic)
-- Tables Read: app.staff, app.bookings, app.staff_schedule
-- =============================================================================

-- Drop existing functions to allow signature update if needed
DROP FUNCTION IF EXISTS public.global_staff_profile_modal(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.global_staff_profile_modal(uuid, uuid, uuid) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.global_staff_profile_modal
-- =============================================================================
CREATE OR REPLACE FUNCTION app.global_staff_profile_modal(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_staff_id    uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_staff            app.staff%ROWTYPE;
    v_total_completed  int := 0;
    v_upcoming_count   int := 0;
    v_total_revenue    numeric := 0.00;
    v_today_is_off     boolean := false;
    v_today_start_time time := NULL;
    v_today_end_time   time := NULL;
    v_recent_bookings  jsonb := '[]'::jsonb;
    v_upcoming_schedule jsonb := '[]'::jsonb;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'staff_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.' USING ERRCODE = '42501';
    END IF;

    -- Verify branch belongs to company and is active (if branch_id supplied)
    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM shared.branches 
            WHERE branch_id = p_branch_id AND company_id = p_company_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Branch not found or does not belong to this company' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 1.3: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission verification
    PERFORM shared.check_permission(p_company_id, 'staff_management');

    -- Step 1.5: Verify target staff member exists in company and is not deleted
    SELECT * INTO v_staff
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found or does not belong to this branch' USING ERRCODE = 'P0001';
    END IF;

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Workforce Performance & Revenue KPIs from app.bookings
    SELECT 
        COALESCE(COUNT(*) FILTER (WHERE booking_status = 'completed'), 0)::int,
        COALESCE(COUNT(*) FILTER (WHERE booking_status IN ('booked', 'confirmed') AND booking_date >= CURRENT_DATE), 0)::int,
        COALESCE(SUM(price) FILTER (WHERE booking_status = 'completed'), 0.00)::numeric
    INTO 
        v_total_completed,
        v_upcoming_count,
        v_total_revenue
    FROM app.bookings
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    -- Step 2.2: Today's Shift Roster Status from app.staff_schedule
    SELECT 
        COALESCE(is_off, false),
        start_time,
        end_time
    INTO 
        v_today_is_off,
        v_today_start_time,
        v_today_end_time
    FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND schedule_date = CURRENT_DATE
    ORDER BY created_at DESC
    LIMIT 1;

    -- Master status 'on-leave' takes precedence for today's off-duty indicator
    IF v_staff.status = 'on-leave' THEN
        v_today_is_off := true;
    END IF;

    -- Step 2.3: Package Recent Appointments History (Limit 10)
    SELECT COALESCE(jsonb_agg(b_row), '[]'::jsonb) INTO v_recent_bookings
    FROM (
        SELECT 
            booking_id,
            customer_name,
            service_name,
            booking_date,
            start_time,
            end_time,
            price,
            booking_status,
            payment_status
        FROM app.bookings
        WHERE staff_id = p_staff_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        ORDER BY booking_date DESC, start_time DESC
        LIMIT 10
    ) b_row;

    -- Step 2.4: Package Upcoming 7-Day Shift Roster
    SELECT COALESCE(jsonb_agg(s_row), '[]'::jsonb) INTO v_upcoming_schedule
    FROM (
        SELECT 
            schedule_id,
            schedule_date,
            start_time,
            end_time,
            is_off,
            notes
        FROM app.staff_schedule
        WHERE staff_id = p_staff_id
          AND company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND schedule_date >= CURRENT_DATE
        ORDER BY schedule_date ASC
        LIMIT 7
    ) s_row;

    -- Step 2.5: Assemble & Return Authoritative Payload
    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_staff.staff_id,
        'company_id', v_staff.company_id,
        'branch_id', v_staff.branch_id,
        'staff_name', v_staff.staff_name,
        'phone', v_staff.phone,
        'email', v_staff.email,
        'role_name', v_staff.role_name,
        'services_offered', v_staff.services_offered,
        'notes', v_staff.notes,
        'status', v_staff.status,
        'joined_at', v_staff.joined_at,
        'total_completed', v_total_completed,
        'upcoming_count', v_upcoming_count,
        'total_revenue', v_total_revenue,
        'today_is_off', COALESCE(v_today_is_off, false),
        'today_start_time', v_today_start_time,
        'today_end_time', v_today_end_time,
        'recent_bookings', v_recent_bookings,
        'upcoming_schedule', v_upcoming_schedule
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.global_staff_profile_modal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.global_staff_profile_modal(uuid, uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.global_staff_profile_modal(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_staff_id    uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.global_staff_profile_modal(p_company_id, p_branch_id, p_staff_id);
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.global_staff_profile_modal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.global_staff_profile_modal(uuid, uuid, uuid) TO authenticated, service_role;

