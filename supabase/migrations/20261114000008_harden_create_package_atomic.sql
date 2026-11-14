-- =============================================================================
-- Migration: Harden create_package_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.packages, app.package_services
-- =============================================================================

-- Drop public wrapper (re-created below)
DROP FUNCTION IF EXISTS public.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]);

-- Drop existing app function
DROP FUNCTION IF EXISTS app.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]);

-- =============================================================================
-- CANONICAL: app.create_package_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.create_package_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_package_name    text,
    p_description     text    DEFAULT NULL,
    p_original_price  numeric DEFAULT 0,
    p_final_price     numeric DEFAULT 0,
    p_is_active       boolean DEFAULT true,
    p_service_ids     uuid[]  DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
DECLARE
    v_clean_name     text    := trim(p_package_name);
    v_new_pkg_id     uuid    := gen_random_uuid();
    v_is_active      boolean := COALESCE(p_is_active, true);
    v_status         text    := CASE WHEN v_is_active THEN 'active' ELSE 'inactive' END;
    v_valid_services int     := 0;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is required' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is required' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Package name cannot be empty' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Package name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;
    IF p_original_price IS NULL OR p_original_price < 0 THEN
        RAISE EXCEPTION 'Original price must be a non-negative value' USING ERRCODE = 'P0001';
    END IF;
    IF p_final_price IS NULL OR p_final_price < 0 THEN
        RAISE EXCEPTION 'Final price must be a non-negative value' USING ERRCODE = 'P0001';
    END IF;
    IF p_final_price > p_original_price THEN
        RAISE EXCEPTION 'Final price cannot exceed original price' USING ERRCODE = 'P0001';
    END IF;
    IF p_service_ids IS NULL OR cardinality(p_service_ids) = 0 THEN
        RAISE EXCEPTION 'Package must contain at least one service' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant access verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Step 1.4: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission check
    PERFORM shared.check_permission(p_company_id, 'services_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Duplicate package name check (with row-level lock)
    PERFORM 1
    FROM app.packages
    WHERE company_id = p_company_id
      AND branch_id  = p_branch_id
      AND lower(trim(package_name)) = lower(v_clean_name)
      AND status <> 'deleted'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A package with this name already exists in this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Validate all service_ids are active and belong to this branch
    SELECT COUNT(*) INTO v_valid_services
    FROM app.services
    WHERE service_id = ANY(p_service_ids)
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted';

    IF v_valid_services <> cardinality(p_service_ids) THEN
        RAISE EXCEPTION 'One or more selected services are invalid or do not belong to this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Insert package
    INSERT INTO app.packages (
        package_id, company_id, branch_id, package_name, description,
        original_price, final_price, is_active, status, services_count,
        created_at, updated_at
    ) VALUES (
        v_new_pkg_id, p_company_id, p_branch_id, v_clean_name,
        NULLIF(trim(p_description), ''),
        p_original_price, p_final_price, v_is_active, v_status,
        v_valid_services, NOW(), NOW()
    );

    -- Step 2.4: Insert package_services (service_id + service_name snapshot)
    INSERT INTO app.package_services (package_id, service_id, service_name, created_at)
    SELECT v_new_pkg_id, s.service_id, s.service_name, NOW()
    FROM app.services s
    WHERE s.service_id = ANY(p_service_ids);

    RETURN jsonb_build_object(
        'success',        true,
        'package_id',     v_new_pkg_id,
        'package_name',   v_clean_name,
        'services_count', v_valid_services,
        'status',         v_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (thin pass-through for PostgREST)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_package_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_package_name    text,
    p_description     text    DEFAULT NULL,
    p_original_price  numeric DEFAULT 0,
    p_final_price     numeric DEFAULT 0,
    p_is_active       boolean DEFAULT true,
    p_service_ids     uuid[]  DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN app.create_package_atomic(
        p_company_id, p_branch_id, p_package_name, p_description,
        p_original_price, p_final_price, p_is_active, p_service_ids
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_package_atomic(uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) TO authenticated, service_role;

