-- ==============================================================================
-- Migration: 20261114000002_harden_create_service_atomic.sql
-- Module: Services (Tab 1: Services) - RPC 1
-- Description: Two-Tier Hardening for create_service_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Authoritative Category Lookup, Duplicate Check, Atomic Write
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid,
    p_price         numeric,
    p_duration      bigint,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT 'active'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name    text := TRIM(p_service_name);
    v_status        text := LOWER(TRIM(COALESCE(p_status, 'active')));
    v_cat_name      text;
    v_service_id    uuid := gen_random_uuid();
BEGIN
    -- -------------------------------------------------------------------------
    -- SECTION 1: SECURITY CHECKS, PRECONDITIONS & AUTHORIZATION GATES
    -- -------------------------------------------------------------------------

    -- 1.1 Input Parameter Mandatory Guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Service name is required.' USING ERRCODE = 'P0001';
    END IF;

    IF p_category_id IS NULL THEN
        RAISE EXCEPTION 'category_id is mandatory.' USING ERRCODE = 'P0001';
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'Service price must be 0 or greater.' USING ERRCODE = 'P0001';
    END IF;

    IF p_duration IS NULL OR p_duration < 1 THEN
        RAISE EXCEPTION 'Service duration must be at least 1 minute.' USING ERRCODE = 'P0001';
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

    -- Step 1: Authoritative Category Validation & Name Resolution
    SELECT category_name INTO v_cat_name
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted';

    IF v_cat_name IS NULL THEN
        RAISE EXCEPTION 'Selected service category is invalid or deleted.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2: Duplicate Service Name Guard (within category, non-deleted)
    IF EXISTS (
        SELECT 1 FROM app.services
        WHERE company_id  = p_company_id
          AND branch_id   = p_branch_id
          AND category_id = p_category_id
          AND LOWER(TRIM(service_name)) = LOWER(v_clean_name)
          AND status <> 'deleted'
    ) THEN
        RAISE EXCEPTION 'A service with this name already exists in this category.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 3: Atomic Insert into app.services
    INSERT INTO app.services (
        service_id,
        company_id,
        branch_id,
        service_name,
        category_id,
        category_name,
        price,
        duration,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_service_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        p_category_id,
        v_cat_name,
        p_price,
        p_duration,
        NULLIF(TRIM(p_description), ''),
        v_status,
        clock_timestamp(),
        clock_timestamp()
    );

    -- Step 4: Standardized Output Return
    RETURN jsonb_build_object(
        'success', true,
        'service_id', v_service_id,
        'service_name', v_clean_name,
        'category_id', p_category_id,
        'category_name', v_cat_name,
        'price', p_price,
        'duration', p_duration,
        'status', v_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.create_service_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid,
    p_price         numeric,
    p_duration      bigint,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT 'active'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_service_atomic(
        p_company_id    => p_company_id,
        p_branch_id     => p_branch_id,
        p_service_name  => p_service_name,
        p_category_id   => p_category_id,
        p_price         => p_price,
        p_duration      => p_duration,
        p_description   => p_description,
        p_status        => p_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Strict ACL Lockdown
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.create_service_atomic(uuid, uuid, text, uuid, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.create_service_atomic(uuid, uuid, text, uuid, numeric, bigint, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_service_atomic(uuid, uuid, text, uuid, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_atomic(uuid, uuid, text, uuid, numeric, bigint, text, text) TO authenticated, service_role;

