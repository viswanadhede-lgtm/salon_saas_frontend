-- =============================================================================
-- Migration: 20261115000015_harden_delete_staff_schedule_atomic.sql
-- Module: Staff Module (Page 2: Staff Schedules)
-- RPC 3: app.delete_staff_schedule_atomic / public.delete_staff_schedule_atomic
-- Standard: Two-Tier Architecture (Section 1 Security & Preconditions fail-fast,
--           Section 2 Sequential Atomic Core Logic with Concurrency Controls)
-- Tables Written: app.staff_schedule (DELETE)
-- Tables Read: app.staff, shared.branches, app.bookings, app.staff_schedule
-- =============================================================================

-- Drop legacy overload variants to eliminate RPC signature ambiguity
DROP FUNCTION IF EXISTS public.delete_staff_schedule_atomic(uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS app.delete_staff_schedule_atomic(uuid, uuid, uuid, text) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.delete_staff_schedule_atomic
-- =============================================================================
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
    -- State & computation variables
    v_staff_name       text;
    v_staff_status     text;
    v_month_start      date;
    v_month_end        date;
    v_delete_from      date;
    v_active_bookings  integer := 0;
    v_deleted_count    integer := 0;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- SECTION 1: SECURITY & PRECONDITION FAIL-FAST GATES
    -- ─────────────────────────────────────────────────────────────────────────

    -- 1.1 Mandatory Identifier NULL Guards
    IF p_company_id IS NULL OR p_branch_id IS NULL OR p_staff_id IS NULL OR p_target_month IS NULL THEN
        RAISE EXCEPTION 'Company ID, Branch ID, Staff ID, and Target Month are required.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 1.2 Target Month Format Validation (YYYY-MM)
    IF p_target_month !~ '^\d{4}-\d{2}$' THEN
        RAISE EXCEPTION 'Target month must be in format YYYY-MM.'
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
    PERFORM shared.check_permission(p_company_id, 'delete_staff_schedule');

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
    v_month_start := (p_target_month || '-01')::date;
    v_month_end   := (v_month_start + interval '1 month - 1 day')::date;

    -- Step 2.3: Historical Past-Month Protection Guard
    v_delete_from := GREATEST(CURRENT_DATE, v_month_start);

    IF v_delete_from > v_month_end THEN
        RAISE EXCEPTION 'Cannot delete past schedules. Historical rosters are preserved for audit and payroll records.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.4: Existing Schedule Precondition Guard
    IF NOT EXISTS (
        SELECT 1 FROM app.staff_schedule
        WHERE staff_id = p_staff_id
          AND company_id = p_company_id
          AND branch_id = p_branch_id
          AND schedule_month = p_target_month
    ) THEN
        RAISE EXCEPTION 'No schedule found for % in % to delete.', v_staff_name, p_target_month
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.5: Active Booking Conflict Guard (The "Never Ghost A Customer" Guard)
    SELECT COUNT(*) INTO v_active_bookings
    FROM app.bookings
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND booking_status IN ('booked', 'confirmed')
      AND booking_date >= v_delete_from
      AND booking_date <= v_month_end;

    IF v_active_bookings > 0 THEN
        RAISE EXCEPTION 'Cannot delete schedule for % in % because there are % active booking(s) scheduled for this staff member during this period. Please reschedule or reassign them first.',
            v_staff_name, p_target_month, v_active_bookings
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.6: Atomic Purge of Modifiable Shifts
    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= v_delete_from
      AND schedule_date <= v_month_end;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Step 2.7: Authoritative Return Confirmation Payload
    RETURN jsonb_build_object(
        'success', true,
        'action', 'delete',
        'staff_id', p_staff_id,
        'staff_name', v_staff_name,
        'target_month', p_target_month,
        'deleted_count', v_deleted_count,
        'deleted_from', to_char(v_delete_from, 'YYYY-MM-DD'),
        'deleted_to', to_char(v_month_end, 'YYYY-MM-DD')
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down canonical app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.delete_staff_schedule_atomic(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.delete_staff_schedule_atomic(uuid, uuid, uuid, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 API pass-through for client compatibility)
-- =============================================================================
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
        p_company_id,
        p_branch_id,
        p_staff_id,
        p_target_month
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.delete_staff_schedule_atomic(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_staff_schedule_atomic(uuid, uuid, uuid, text) TO authenticated, service_role;

