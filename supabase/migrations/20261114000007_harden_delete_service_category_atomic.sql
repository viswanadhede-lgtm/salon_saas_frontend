-- ==============================================================================
-- Migration: 20261114000007_harden_delete_service_category_atomic.sql
-- Module: Services (Tab 2: Service Categories) - RPC 3
-- Description: Two-Tier Hardening for delete_service_category_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Row Lock, Active Services Dependency Guard, Atomic Soft-Delete
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.delete_service_category_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_category_name text;
    v_status        text;
    v_active_svcs   bigint;
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

    IF p_category_id IS NULL THEN
        RAISE EXCEPTION 'category_id is mandatory.' USING ERRCODE = 'P0001';
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

    -- Step 1: Pessimistic Row Lock & Category Verification
    SELECT category_name, status
    INTO v_category_name, v_status
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF v_category_name IS NULL THEN
        RAISE EXCEPTION 'Service category not found or already deleted.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2: Active Services Dependency Guard
    -- Block deletion if any active (non-deleted) services exist under this category
    SELECT COUNT(*)
    INTO v_active_svcs
    FROM app.services
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted';

    IF v_active_svcs > 0 THEN
        RAISE EXCEPTION 'Cannot delete category: It has % active service(s) assigned to it.', v_active_svcs USING ERRCODE = 'P0001';
    END IF;

    -- Step 3: Atomic Soft Delete
    UPDATE app.service_categories
    SET status     = 'deleted',
        updated_at = clock_timestamp()
    WHERE category_id = p_category_id;

    -- Step 4: Standardized Output Return
    RETURN jsonb_build_object(
        'success', true,
        'category_id', p_category_id,
        'category_name', v_category_name,
        'status', 'deleted'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.delete_service_category_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_service_category_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_service_category_atomic(
        p_company_id  => p_company_id,
        p_branch_id   => p_branch_id,
        p_category_id => p_category_id
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Strict ACL Lockdown
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.delete_service_category_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.delete_service_category_atomic(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_service_category_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_service_category_atomic(uuid, uuid, uuid) TO authenticated, service_role;

