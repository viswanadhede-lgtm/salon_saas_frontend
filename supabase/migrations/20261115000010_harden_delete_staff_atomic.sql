-- =============================================================================
-- Migration: 20261115000010_harden_delete_staff_atomic.sql
-- Module: Staff Management (Page 1 - Staff)
-- Target: app.delete_staff_atomic and public.delete_staff_atomic
-- Architecture: Two-Tier Standard (Section 1 = Security & Preconditions, Section 2 = Core Logic)
-- Tables Written: app.staff (UPDATE soft-delete), app.staff_schedule (DELETE future shifts)
-- =============================================================================

-- Drop existing functions to allow signature update if needed
DROP FUNCTION IF EXISTS public.delete_staff_atomic(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.delete_staff_atomic(uuid, uuid, uuid) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.delete_staff_atomic
-- =============================================================================
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
    v_target_staff    app.staff%ROWTYPE;
    v_deleted_staff   app.staff%ROWTYPE;
    v_future_bookings int := 0;
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
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'staff_id is mandatory' USING ERRCODE = 'P0001';
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
    PERFORM shared.check_permission(p_company_id, 'delete_staff');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Pessimistically lock existing staff member
    SELECT * INTO v_target_staff
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found or already deleted' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Active booking dependency guard
    SELECT COUNT(*) INTO v_future_bookings
    FROM app.bookings
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND booking_status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_future_bookings > 0 THEN
        RAISE EXCEPTION 'Cannot delete this staff member because there are % upcoming active booking(s) assigned to them. Please reschedule or reassign the booking(s) first.', v_future_bookings
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Atomic soft-delete staff
    UPDATE app.staff
    SET status = 'deleted',
        updated_at = NOW()
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
    RETURNING * INTO v_deleted_staff;

    -- Step 2.4: Clean up future schedule shifts (to prevent ghost slots on booking calendar)
    DELETE FROM app.staff_schedule
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND schedule_date >= CURRENT_DATE;

    -- Return authoritative deleted record with success boolean for client compatibility
    RETURN to_jsonb(v_deleted_staff) || jsonb_build_object('success', true, 'status', 'deleted');
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.delete_staff_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.delete_staff_atomic(uuid, uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
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
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.delete_staff_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_staff_atomic(uuid, uuid, uuid) TO authenticated, service_role;

