-- =============================================================================
-- Migration: Harden update_package_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.packages, app.package_services
-- =============================================================================

-- Drop public wrapper
DROP FUNCTION IF EXISTS public.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]);

-- Drop app function
DROP FUNCTION IF EXISTS app.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]);

-- =============================================================================
-- CANONICAL: app.update_package_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.update_package_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_package_id      uuid,
    p_package_name    text    DEFAULT NULL,
    p_description     text    DEFAULT NULL,
    p_original_price  numeric DEFAULT NULL,
    p_final_price     numeric DEFAULT NULL,
    p_is_active       boolean DEFAULT NULL,
    p_service_ids     uuid[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
DECLARE
    v_clean_name     text := NULLIF(trim(p_package_name), '');
    v_old_name       text;
    v_old_desc       text;
    v_curr_orig      numeric;
    v_curr_final     numeric;
    v_target_orig    numeric;
    v_target_final   numeric;
    v_is_active      boolean;
    v_status         text;
    v_valid_services int;
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

    -- Step 1.2: Field bounds & domain validation
    IF p_package_name IS NOT NULL AND v_clean_name IS NULL THEN
        RAISE EXCEPTION 'Package name cannot be empty' USING ERRCODE = 'P0001';
    END IF;
    IF v_clean_name IS NOT NULL AND length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Package name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;
    IF p_original_price IS NOT NULL AND p_original_price < 0 THEN
        RAISE EXCEPTION 'Original price must be a non-negative value' USING ERRCODE = 'P0001';
    END IF;
    IF p_final_price IS NOT NULL AND p_final_price < 0 THEN
        RAISE EXCEPTION 'Final price must be a non-negative value' USING ERRCODE = 'P0001';
    END IF;
    IF p_service_ids IS NOT NULL AND cardinality(p_service_ids) = 0 THEN
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

    -- Step 2.1: Lock & verify target package
    SELECT package_name, description, original_price, final_price, is_active
    INTO v_old_name, v_old_desc, v_curr_orig, v_curr_final, v_is_active
    FROM app.packages
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Package not found or does not belong to this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Compute & validate effective prices
    v_target_orig  := COALESCE(p_original_price, v_curr_orig);
    v_target_final := COALESCE(p_final_price, v_curr_final);

    IF v_target_final > v_target_orig THEN
        RAISE EXCEPTION 'Final price cannot exceed original price' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Duplicate package name check (if name is being modified)
    IF v_clean_name IS NOT NULL AND lower(v_clean_name) <> lower(v_old_name) THEN
        PERFORM 1
        FROM app.packages
        WHERE company_id = p_company_id
          AND branch_id  = p_branch_id
          AND package_id <> p_package_id
          AND lower(trim(package_name)) = lower(v_clean_name)
          AND status <> 'deleted'
        FOR UPDATE;

        IF FOUND THEN
            RAISE EXCEPTION 'A package with this name already exists in this branch' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.4: Atomic service mapping replacement (if p_service_ids provided)
    IF p_service_ids IS NOT NULL THEN
        SELECT COUNT(*) INTO v_valid_services
        FROM app.services
        WHERE service_id = ANY(p_service_ids)
          AND company_id = p_company_id
          AND branch_id  = p_branch_id
          AND status <> 'deleted';

        IF v_valid_services <> cardinality(p_service_ids) THEN
            RAISE EXCEPTION 'One or more replacement services are invalid or do not belong to this branch' USING ERRCODE = 'P0001';
        END IF;

        DELETE FROM app.package_services WHERE package_id = p_package_id;

        INSERT INTO app.package_services (package_id, service_id, service_name, created_at)
        SELECT p_package_id, s.service_id, s.service_name, NOW()
        FROM app.services s
        WHERE s.service_id = ANY(p_service_ids);
    ELSE
        SELECT COUNT(*) INTO v_valid_services
        FROM app.package_services
        WHERE package_id = p_package_id;
    END IF;

    -- Step 2.5: Apply active status & update package row
    IF p_is_active IS NOT NULL THEN
        v_is_active := p_is_active;
    END IF;
    v_status := CASE WHEN v_is_active THEN 'active' ELSE 'inactive' END;

    UPDATE app.packages SET
        package_name   = COALESCE(v_clean_name, package_name),
        description    = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
        original_price = v_target_orig,
        final_price    = v_target_final,
        is_active      = v_is_active,
        status         = v_status,
        services_count = v_valid_services,
        updated_at     = NOW()
    WHERE package_id   = p_package_id;

    -- Step 2.6: Return JSONB result
    RETURN jsonb_build_object(
        'success',        true,
        'package_id',     p_package_id,
        'package_name',   COALESCE(v_clean_name, v_old_name),
        'services_count', v_valid_services,
        'status',         v_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_package_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_package_id      uuid,
    p_package_name    text    DEFAULT NULL,
    p_description     text    DEFAULT NULL,
    p_original_price  numeric DEFAULT NULL,
    p_final_price     numeric DEFAULT NULL,
    p_is_active       boolean DEFAULT NULL,
    p_service_ids     uuid[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN app.update_package_atomic(
        p_company_id, p_branch_id, p_package_id, p_package_name,
        p_description, p_original_price, p_final_price, p_is_active, p_service_ids
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_package_atomic(uuid, uuid, uuid, text, text, numeric, numeric, boolean, uuid[]) TO authenticated, service_role;

