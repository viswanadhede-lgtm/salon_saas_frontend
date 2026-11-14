-- ==============================================================================
-- Migration: 20261114000004_harden_delete_service_atomic.sql
-- Module: Services (Tab 1: Services) - RPC 3
-- Description: Two-Tier Hardening for delete_service_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Row Lock, Package Dependency Guard, Active Bookings Guard, Atomic Soft-Delete
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.delete_service_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_service_name  text;
    v_status        text;
    v_pkg_names     text;
    v_active_bks    bigint;
BEGIN
    -- -------------------------------------------------------------------------
    -- SECTION 1: SECURITY CHECKS, PRECONDITIONS & AUTHORIZATION GATES
    -- -------------------------------------------------------------------------

    -- 1.1 Mandatory Identifier Guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF p_service_id IS NULL THEN
        RAISE EXCEPTION 'service_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    -- 1.2 Tenant Boundary Enforcement
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.' USING ERRCODE = '42501';
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'services_management');

    -- -------------------------------------------------------------------------
    -- SECTION 2: CORE BUSINESS LOGIC (SEQUENTIAL & ATOMIC)
    -- -------------------------------------------------------------------------

    -- Step 1: Pessimistic Row Lock & Service Verification
    SELECT service_name, status
    INTO v_service_name, v_status
    FROM app.services
    WHERE service_id = p_service_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF v_service_name IS NULL THEN
        RAISE EXCEPTION 'Service not found or already deleted.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2: Package Dependency Guard
    -- Check if service is included in any active/non-deleted packages for this branch
    SELECT string_agg(p.package_name, ', ')
    INTO v_pkg_names
    FROM app.package_services ps
    JOIN app.packages p ON p.package_id = ps.package_id
    WHERE ps.service_id = p_service_id
      AND p.company_id = p_company_id
      AND p.branch_id  = p_branch_id
      AND p.status <> 'deleted';

    IF v_pkg_names IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot delete service: Assigned to active package(s): %', v_pkg_names USING ERRCODE = 'P0001';
    END IF;

    -- Step 3: Active Bookings Dependency Guard
    -- Check if service has any pending/booked appointments in the future or open
    SELECT COUNT(*)
    INTO v_active_bks
    FROM app.bookings
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND booking_status = 'booked';

    IF v_active_bks > 0 THEN
        RAISE EXCEPTION 'Cannot delete service: Has % active appointment(s) scheduled.', v_active_bks USING ERRCODE = 'P0001';
    END IF;

    -- Step 4: Atomic Soft Delete
    UPDATE app.services
    SET status     = 'deleted',
        updated_at = clock_timestamp()
    WHERE service_id = p_service_id;

    -- Step 5: Standardized JSON Return
    RETURN jsonb_build_object(
        'success', true,
        'service_id', p_service_id,
        'service_name', v_service_name,
        'status', 'deleted'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.delete_service_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_service_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_service_atomic(
        p_company_id => p_company_id,
        p_branch_id  => p_branch_id,
        p_service_id => p_service_id
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Strict ACL Lockdown
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.delete_service_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.delete_service_atomic(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_service_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_service_atomic(uuid, uuid, uuid) TO authenticated, service_role;

