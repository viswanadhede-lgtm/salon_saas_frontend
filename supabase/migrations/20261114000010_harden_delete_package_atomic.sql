-- =============================================================================
-- Migration: Harden delete_package_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.packages
-- =============================================================================

-- Drop public wrapper
DROP FUNCTION IF EXISTS public.delete_package_atomic(uuid, uuid, uuid);

-- Drop app function
DROP FUNCTION IF EXISTS app.delete_package_atomic(uuid, uuid, uuid);

-- =============================================================================
-- CANONICAL: app.delete_package_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_package_id IS NULL THEN
        RAISE EXCEPTION 'package_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant access verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Step 1.3: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission check
    PERFORM shared.check_permission(p_company_id, 'services_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Lock & verify target package
    PERFORM 1
    FROM app.packages
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Package not found or does not belong to this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Dependency check — block deletion if assigned to active bookings
    PERFORM 1
    FROM app.bookings
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND booking_status = 'booked'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Cannot delete package assigned to active bookings' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Atomically soft-delete package
    UPDATE app.packages
    SET status     = 'deleted',
        is_active  = false,
        updated_at = NOW()
    WHERE package_id = p_package_id;

    -- Step 2.4: Return JSONB result
    RETURN jsonb_build_object(
        'success',    true,
        'package_id', p_package_id,
        'status',     'deleted'
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.delete_package_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.delete_package_atomic(uuid, uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN app.delete_package_atomic(p_company_id, p_branch_id, p_package_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_package_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_package_atomic(uuid, uuid, uuid) TO authenticated, service_role;

