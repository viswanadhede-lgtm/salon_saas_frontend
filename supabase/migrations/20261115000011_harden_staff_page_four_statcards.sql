-- =============================================================================
-- Migration: 20261115000011_harden_staff_page_four_statcards.sql
-- Module: Staff Management (Page 1 - Staff)
-- Target: app.staff_page_four_statcards and public.staff_page_four_statcards
-- Architecture: Two-Tier Standard (Section 1 = Security & Preconditions, Section 2 = Core Logic)
-- Tables Read: app.staff, app.staff_schedule
-- =============================================================================

-- Drop existing functions to allow signature update if needed
DROP FUNCTION IF EXISTS public.staff_page_four_statcards(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.staff_page_four_statcards(uuid, uuid) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.staff_page_four_statcards
-- =============================================================================
CREATE OR REPLACE FUNCTION app.staff_page_four_statcards(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_total_staff    int := 0;
    v_active_staff   int := 0;
    v_on_leave_today int := 0;
    v_on_duty_today  int := 0;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.' USING ERRCODE = '42501';
    END IF;

    -- Verify branch belongs to company and is active
    IF NOT EXISTS (
        SELECT 1 FROM shared.branches 
        WHERE branch_id = p_branch_id AND company_id = p_company_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Branch not found or does not belong to this company' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission verification
    PERFORM shared.check_permission(p_company_id, 'staff_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Single-pass authoritative aggregation across staff and today's schedule
    WITH today_schedule AS (
        SELECT 
            staff_id,
            bool_or(is_off) AS is_off_today
        FROM app.staff_schedule
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND schedule_date = CURRENT_DATE
        GROUP BY staff_id
    ),
    staff_pool AS (
        SELECT 
            s.staff_id,
            s.status,
            COALESCE(sch.is_off_today, false) AS is_off_today
        FROM app.staff s
        LEFT JOIN today_schedule sch ON sch.staff_id = s.staff_id
        WHERE s.company_id = p_company_id
          AND s.branch_id = p_branch_id
          AND s.status <> 'deleted'
    )
    SELECT 
        COALESCE(COUNT(*), 0)::int,
        COALESCE(COUNT(*) FILTER (WHERE status = 'active'), 0)::int,
        COALESCE(COUNT(*) FILTER (WHERE status = 'on-leave' OR (status = 'active' AND is_off_today = true)), 0)::int,
        COALESCE(COUNT(*) FILTER (WHERE status = 'active' AND is_off_today = false), 0)::int
    INTO
        v_total_staff,
        v_active_staff,
        v_on_leave_today,
        v_on_duty_today
    FROM staff_pool;

    -- Return authoritative snapshot object
    RETURN jsonb_build_object(
        'success', true,
        'total_staff', v_total_staff,
        'active_staff', v_active_staff,
        'on_leave_today', v_on_leave_today,
        'on_duty_today', v_on_duty_today
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.staff_page_four_statcards(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.staff_page_four_statcards(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.staff_page_four_statcards(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.staff_page_four_statcards(p_company_id, p_branch_id);
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.staff_page_four_statcards(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.staff_page_four_statcards(uuid, uuid) TO authenticated, service_role;

