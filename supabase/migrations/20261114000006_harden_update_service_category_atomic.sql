-- ==============================================================================
-- Migration: 20261114000006_harden_update_service_category_atomic.sql
-- Module: Services (Tab 2: Service Categories) - RPC 2
-- Description: Two-Tier Hardening for update_service_category_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Row Lock, Duplicate Guard, Atomic Update, Cascade to Services
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text DEFAULT NULL::text,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name        text := NULLIF(TRIM(p_category_name), '');
    v_status            text := NULLIF(LOWER(TRIM(p_status)), '');
    v_old_name          text;
    v_old_status        text;
    v_target_name       text;
    v_target_status     text;
    v_updated_services  integer := 0;
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

    -- 1.2 Field Bounds & Domain Validation (if provided)
    IF p_category_name IS NOT NULL AND TRIM(p_category_name) = '' THEN
        RAISE EXCEPTION 'Category name cannot be empty.' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_name IS NOT NULL AND length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Category name must be 100 characters or fewer.' USING ERRCODE = 'P0001';
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive.' USING ERRCODE = 'P0001';
    END IF;

    -- 1.3 Tenant Boundary Enforcement
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.' USING ERRCODE = '42501';
    END IF;

    -- 1.4 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.5 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'services_management');

    -- -------------------------------------------------------------------------
    -- SECTION 2: CORE BUSINESS LOGIC (SEQUENTIAL & ATOMIC)
    -- -------------------------------------------------------------------------

    -- Step 1: Pessimistic Row Lock & Existing Category Verification
    SELECT category_name, status
    INTO v_old_name, v_old_status
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF v_old_name IS NULL THEN
        RAISE EXCEPTION 'Category not found or does not belong to this branch.' USING ERRCODE = 'P0001';
    END IF;

    v_target_name := COALESCE(v_clean_name, v_old_name);
    v_target_status := COALESCE(v_status, v_old_status);

    -- Step 2: Duplicate Category Name Guard (branch-scoped, non-deleted, excluding self)
    IF LOWER(v_target_name) <> LOWER(v_old_name) THEN
        IF EXISTS (
            SELECT 1 FROM app.service_categories
            WHERE company_id = p_company_id
              AND branch_id  = p_branch_id
              AND category_id <> p_category_id
              AND LOWER(TRIM(category_name)) = LOWER(v_target_name)
              AND status <> 'deleted'
        ) THEN
            RAISE EXCEPTION 'A service category with this name already exists.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 3: Atomic Update into app.service_categories
    UPDATE app.service_categories SET
        category_name = v_target_name,
        description   = CASE 
            WHEN p_description IS NOT NULL THEN NULLIF(TRIM(p_description), '') 
            ELSE description 
        END,
        status        = v_target_status,
        updated_at    = clock_timestamp()
    WHERE category_id = p_category_id;

    -- Step 4: Cascade Category Name Update to app.services if renamed
    IF LOWER(v_target_name) <> LOWER(v_old_name) THEN
        WITH updated_services AS (
            UPDATE app.services
            SET category_name = v_target_name,
                updated_at    = clock_timestamp()
            WHERE category_id = p_category_id
              AND company_id  = p_company_id
              AND branch_id   = p_branch_id
              AND status <> 'deleted'
            RETURNING service_id
        )
        SELECT COUNT(*) INTO v_updated_services FROM updated_services;
    END IF;

    -- Step 5: Standardized Output Return
    RETURN jsonb_build_object(
        'success', true,
        'category_id', p_category_id,
        'category_name', v_target_name,
        'status', v_target_status,
        'services_updated_count', v_updated_services
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.update_service_category_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text DEFAULT NULL::text,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_service_category_atomic(
        p_company_id    => p_company_id,
        p_branch_id     => p_branch_id,
        p_category_id   => p_category_id,
        p_category_name => p_category_name,
        p_description   => p_description,
        p_status        => p_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Strict ACL Lockdown
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.update_service_category_atomic(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.update_service_category_atomic(uuid, uuid, uuid, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_service_category_atomic(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_category_atomic(uuid, uuid, uuid, text, text, text) TO authenticated, service_role;

