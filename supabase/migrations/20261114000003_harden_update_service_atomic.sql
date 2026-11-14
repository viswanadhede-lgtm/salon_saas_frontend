-- ==============================================================================
-- Migration: 20261114000003_harden_update_service_atomic.sql
-- Module: Services (Tab 1: Services) - RPC 2
-- Description: Two-Tier Hardening for update_service_atomic:
--              SECTION 1: Preconditions, Tenant Boundary, Subscription Gate, RBAC Gate
--              SECTION 2: Row Lock, Category Lookup, Scoped Duplicate Guard, Atomic Update, Cascade to Packages
--              ACL: Revoke from PUBLIC, anon; Grant to authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION app.update_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_id    uuid,
    p_service_name  text DEFAULT NULL::text,
    p_category_id   uuid DEFAULT NULL::uuid,
    p_price         numeric DEFAULT NULL::numeric,
    p_duration      bigint DEFAULT NULL::bigint,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Clean & normalize inputs
    v_clean_name        text := NULLIF(TRIM(p_service_name), '');
    v_status            text := NULLIF(LOWER(TRIM(p_status)), '');
    
    -- State variables
    v_old_name          text;
    v_old_cat_id        uuid;
    v_old_cat_name      text;
    v_target_name       text;
    v_target_cat_id     uuid;
    v_cat_name          text;
    v_updated_price     numeric;
    v_updated_duration  bigint;
    v_updated_status    text;
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

    -- 1.2 Field Bounds & Domain Validation (if provided)
    IF p_service_name IS NOT NULL AND TRIM(p_service_name) = '' THEN
        RAISE EXCEPTION 'Service name cannot be empty.' USING ERRCODE = 'P0001';
    END IF;

    IF p_price IS NOT NULL AND p_price < 0 THEN
        RAISE EXCEPTION 'Service price must be 0 or greater.' USING ERRCODE = 'P0001';
    END IF;

    IF p_duration IS NOT NULL AND p_duration < 1 THEN
        RAISE EXCEPTION 'Service duration must be at least 1 minute.' USING ERRCODE = 'P0001';
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

    -- Step 1: Pessimistic Row Lock & Existing Service Verification
    SELECT service_name, category_id, category_name
    INTO v_old_name, v_old_cat_id, v_old_cat_name
    FROM app.services
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF v_old_name IS NULL THEN
        RAISE EXCEPTION 'Service not found or does not belong to this branch.' USING ERRCODE = 'P0001';
    END IF;

    -- Determine target values
    v_target_name := COALESCE(v_clean_name, v_old_name);
    v_target_cat_id := COALESCE(p_category_id, v_old_cat_id);

    -- Step 2: Category Validation & Name Resolution (if category was updated)
    IF p_category_id IS NOT NULL AND p_category_id <> v_old_cat_id THEN
        SELECT category_name INTO v_cat_name
        FROM app.service_categories
        WHERE category_id = p_category_id
          AND company_id  = p_company_id
          AND branch_id   = p_branch_id
          AND status <> 'deleted';

        IF v_cat_name IS NULL THEN
            RAISE EXCEPTION 'Selected service category is invalid or deleted.' USING ERRCODE = 'P0001';
        END IF;
    ELSE
        v_cat_name := v_old_cat_name;
    END IF;

    -- Step 3: Duplicate Service Name Guard (Category-scoped, excluding self)
    IF LOWER(v_target_name) <> LOWER(v_old_name) OR v_target_cat_id <> v_old_cat_id THEN
        IF EXISTS (
            SELECT 1 FROM app.services
            WHERE company_id  = p_company_id
              AND branch_id   = p_branch_id
              AND category_id = v_target_cat_id
              AND service_id <> p_service_id
              AND LOWER(TRIM(service_name)) = LOWER(v_target_name)
              AND status <> 'deleted'
        ) THEN
            RAISE EXCEPTION 'A service with this name already exists in this category.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 4: Atomic Update into app.services
    UPDATE app.services SET
        service_name  = v_target_name,
        category_id   = v_target_cat_id,
        category_name = v_cat_name,
        price         = COALESCE(p_price, price),
        duration      = COALESCE(p_duration, duration),
        description   = CASE 
            WHEN p_description IS NOT NULL THEN NULLIF(TRIM(p_description), '') 
            ELSE description 
        END,
        status        = COALESCE(v_status, status),
        updated_at    = clock_timestamp()
    WHERE service_id  = p_service_id
    RETURNING price, duration, status INTO v_updated_price, v_updated_duration, v_updated_status;

    -- Step 5: Cascade Service Name Update to app.package_services if renamed
    IF LOWER(v_target_name) <> LOWER(v_old_name) THEN
        UPDATE app.package_services
        SET service_name = v_target_name
        WHERE service_id = p_service_id;
    END IF;

    -- Step 6: Standardized Output Return
    RETURN jsonb_build_object(
        'success', true,
        'service_id', p_service_id,
        'service_name', v_target_name,
        'category_id', v_target_cat_id,
        'category_name', v_cat_name,
        'price', v_updated_price,
        'duration', v_updated_duration,
        'status', v_updated_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Wrapper: public.update_service_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_id    uuid,
    p_service_name  text DEFAULT NULL::text,
    p_category_id   uuid DEFAULT NULL::uuid,
    p_price         numeric DEFAULT NULL::numeric,
    p_duration      bigint DEFAULT NULL::bigint,
    p_description   text DEFAULT NULL::text,
    p_status        text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_service_atomic(
        p_company_id    => p_company_id,
        p_branch_id     => p_branch_id,
        p_service_id    => p_service_id,
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
REVOKE EXECUTE ON FUNCTION app.update_service_atomic(uuid, uuid, uuid, text, uuid, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.update_service_atomic(uuid, uuid, uuid, text, uuid, numeric, bigint, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_service_atomic(uuid, uuid, uuid, text, uuid, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_atomic(uuid, uuid, uuid, text, uuid, numeric, bigint, text, text) TO authenticated, service_role;

