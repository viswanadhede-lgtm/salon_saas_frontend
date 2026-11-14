-- ==============================================================================
-- Migration: 20261114000005_harden_create_service_category_atomic.sql
-- Module: Services (Tab 2: Service Categories) - RPC 1
-- Description: Two-Tier Hardening for create_service_category_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Branch-scoped Duplicate Check, Atomic Write to app.service_categories
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT 'active'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_cat_id     uuid := gen_random_uuid();
    v_clean_name text := TRIM(p_category_name);
    v_status     text := LOWER(TRIM(COALESCE(p_status, 'active')));
BEGIN
    -- -------------------------------------------------------------------------
    -- SECTION 1: SECURITY CHECKS, PRECONDITIONS & AUTHORIZATION GATES
    -- -------------------------------------------------------------------------

    -- 1.1 Mandatory Identifier & Field Bounds Guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Category name is required.' USING ERRCODE = 'P0001';
    END IF;

    IF length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Category name must be 100 characters or fewer.' USING ERRCODE = 'P0001';
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive.' USING ERRCODE = 'P0001';
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

    -- Step 1: Duplicate Category Name Guard (branch-scoped, non-deleted)
    IF EXISTS (
        SELECT 1 FROM app.service_categories
        WHERE company_id = p_company_id
          AND branch_id  = p_branch_id
          AND LOWER(TRIM(category_name)) = LOWER(v_clean_name)
          AND status <> 'deleted'
    ) THEN
        RAISE EXCEPTION 'A service category with this name already exists.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2: Atomic Insert into app.service_categories
    INSERT INTO app.service_categories (
        category_id,
        company_id,
        branch_id,
        category_name,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_cat_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        NULLIF(TRIM(p_description), ''),
        v_status,
        clock_timestamp(),
        clock_timestamp()
    );

    -- Step 3: Standardized Output Return
    RETURN jsonb_build_object(
        'success', true,
        'category_id', v_cat_id,
        'category_name', v_clean_name,
        'status', v_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.create_service_category_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT 'active'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_service_category_atomic(
        p_company_id    => p_company_id,
        p_branch_id     => p_branch_id,
        p_category_name => p_category_name,
        p_description   => p_description,
        p_status        => p_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Strict ACL Lockdown
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.create_service_category_atomic(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.create_service_category_atomic(uuid, uuid, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_service_category_atomic(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_category_atomic(uuid, uuid, text, text, text) TO authenticated, service_role;

