-- =============================================================================
-- Migration: 20261103000009_harden_services_module.sql
-- Module 4: SERVICES & PACKAGES — Zero-Trust Backend Hardening
-- =============================================================================
-- Routines Deployed:
--   1. app.create_service_category_atomic + public wrapper
--   2. app.update_service_category_atomic + public wrapper (atomic cascading rename)
--   3. app.delete_service_category_atomic + public wrapper (active service guard)
--   4. app.create_service_atomic          + public wrapper (pricing & category guard)
--   5. app.update_service_atomic          + public wrapper (atomic package sync)
--   6. app.delete_service_atomic          + public wrapper (active package & booking guard)
--   7. app.create_package_atomic          + public wrapper (hardened with tenant check)
--   8. app.update_package_atomic          + public wrapper (hardened with tenant check)
--   9. app.delete_package_atomic          + public wrapper (upcoming booking guard)
-- =============================================================================

-- =============================================================================
-- PART 1: SERVICE CATEGORIES RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION app.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_cat_id uuid := gen_random_uuid();
    v_clean_name text := trim(p_category_name);
    v_status text := lower(trim(coalesce(p_status, 'active')));
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name is required.');
    END IF;

    IF length(v_clean_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name must be 100 characters or fewer.');
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.service_categories
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND lower(trim(category_name)) = lower(v_clean_name)
          AND status <> 'deleted'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists.');
    END IF;

    INSERT INTO app.service_categories (
        category_id, company_id, branch_id, category_name, description, status, created_at, updated_at
    ) VALUES (
        v_cat_id, p_company_id, p_branch_id, v_clean_name, NULLIF(trim(p_description), ''), v_status, NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'category_id', v_cat_id,
        'category_name', v_clean_name,
        'status', v_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_service_category_atomic(p_company_id, p_branch_id, p_category_name, p_description, p_status);
END;
$$;

CREATE OR REPLACE FUNCTION app.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := NULLIF(trim(p_category_name), '');
    v_status text := NULLIF(lower(trim(p_status)), '');
    v_old_name text;
    v_updated_services int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT category_name INTO v_old_name
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_old_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category not found or does not belong to this branch.');
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    IF v_clean_name IS NOT NULL AND lower(v_clean_name) <> lower(v_old_name) THEN
        IF EXISTS (
            SELECT 1 FROM app.service_categories
            WHERE company_id = p_company_id
              AND branch_id = p_branch_id
              AND category_id <> p_category_id
              AND lower(trim(category_name)) = lower(v_clean_name)
              AND status <> 'deleted'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists.');
        END IF;
    END IF;

    UPDATE app.service_categories SET
        category_name = COALESCE(v_clean_name, category_name),
        description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
        status = COALESCE(v_status, status),
        updated_at = NOW()
    WHERE category_id = p_category_id;

    -- Atomic cascading rename to all active services linked to this category
    IF v_clean_name IS NOT NULL AND v_clean_name <> v_old_name THEN
        WITH updated_services AS (
            UPDATE app.services
            SET category_name = v_clean_name,
                updated_at = NOW()
            WHERE category_id = p_category_id
              AND company_id = p_company_id
              AND branch_id = p_branch_id
              AND status <> 'deleted'
            RETURNING service_id
        )
        SELECT COUNT(*) INTO v_updated_services FROM updated_services;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'category_id', p_category_id,
        'category_name', COALESCE(v_clean_name, v_old_name),
        'services_updated_count', v_updated_services
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_service_category_atomic(p_company_id, p_branch_id, p_category_id, p_category_name, p_description, p_status);
END;
$$;

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
    v_cat_name text;
    v_active_services int;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT category_name INTO v_cat_name
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_cat_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category not found or already deleted.');
    END IF;

    SELECT COUNT(*) INTO v_active_services
    FROM app.services
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_active_services > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete category: ' || v_active_services || ' active service(s) are still assigned to it. Please reassign or delete the services first.',
            'active_services_count', v_active_services
        );
    END IF;

    UPDATE app.service_categories
    SET status = 'deleted',
        updated_at = NOW()
    WHERE category_id = p_category_id;

    RETURN jsonb_build_object(
        'success', true,
        'category_id', p_category_id,
        'active_services_count', 0
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

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
    RETURN app.delete_service_category_atomic(p_company_id, p_branch_id, p_category_id);
END;
$$;

-- =============================================================================
-- PART 2: SERVICES RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION app.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid,
    p_price         numeric,
    p_duration      bigint,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_service_id uuid := gen_random_uuid();
    v_clean_name text := trim(p_service_name);
    v_status text := lower(trim(coalesce(p_status, 'active')));
    v_cat_name text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service name is required.');
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service price must be 0 or greater.');
    END IF;

    IF p_duration IS NULL OR p_duration < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service duration must be at least 1 minute.');
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    SELECT category_name INTO v_cat_name
    FROM app.service_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_cat_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected service category is invalid or deleted.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.services
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND lower(trim(service_name)) = lower(v_clean_name)
          AND status <> 'deleted'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'A service with this name already exists.');
    END IF;

    INSERT INTO app.services (
        service_id, company_id, branch_id, service_name, category_id, category_name,
        price, duration, description, status, created_at, updated_at
    ) VALUES (
        v_service_id, p_company_id, p_branch_id, v_clean_name, p_category_id, v_cat_name,
        p_price, p_duration, NULLIF(trim(p_description), ''), v_status, NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'service_id', v_service_id,
        'service_name', v_clean_name,
        'price', p_price,
        'duration', p_duration,
        'category_name', v_cat_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid,
    p_price         numeric,
    p_duration      bigint,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_service_atomic(
        p_company_id, p_branch_id, p_service_name, p_category_id,
        p_price, p_duration, p_description, p_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.update_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_id    uuid,
    p_service_name  text    DEFAULT NULL,
    p_category_id   uuid    DEFAULT NULL,
    p_price         numeric DEFAULT NULL,
    p_duration      bigint  DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := NULLIF(trim(p_service_name), '');
    v_status text := NULLIF(lower(trim(p_status)), '');
    v_old_name text;
    v_old_cat_id uuid;
    v_cat_name text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT service_name, category_id INTO v_old_name, v_old_cat_id
    FROM app.services
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_old_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service not found or does not belong to this branch.');
    END IF;

    IF p_price IS NOT NULL AND p_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service price must be 0 or greater.');
    END IF;

    IF p_duration IS NOT NULL AND p_duration < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service duration must be at least 1 minute.');
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    IF v_clean_name IS NOT NULL AND lower(v_clean_name) <> lower(v_old_name) THEN
        IF EXISTS (
            SELECT 1 FROM app.services
            WHERE company_id = p_company_id
              AND branch_id = p_branch_id
              AND service_id <> p_service_id
              AND lower(trim(service_name)) = lower(v_clean_name)
              AND status <> 'deleted'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'A service with this name already exists.');
        END IF;
    END IF;

    IF p_category_id IS NOT NULL AND p_category_id <> v_old_cat_id THEN
        SELECT category_name INTO v_cat_name
        FROM app.service_categories
        WHERE category_id = p_category_id
          AND company_id = p_company_id
          AND branch_id = p_branch_id
          AND status <> 'deleted';

        IF v_cat_name IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Selected service category is invalid or deleted.');
        END IF;
    END IF;

    UPDATE app.services SET
        service_name = COALESCE(v_clean_name, service_name),
        category_id = COALESCE(p_category_id, category_id),
        category_name = COALESCE(v_cat_name, category_name),
        price = COALESCE(p_price, price),
        duration = COALESCE(p_duration, duration),
        description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
        status = COALESCE(v_status, status),
        updated_at = NOW()
    WHERE service_id = p_service_id;

    IF v_clean_name IS NOT NULL AND v_clean_name <> v_old_name THEN
        UPDATE app.package_services
        SET service_name = v_clean_name
        WHERE service_id = p_service_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'service_id', p_service_id,
        'service_name', COALESCE(v_clean_name, v_old_name),
        'price', COALESCE(p_price, (SELECT price FROM app.services WHERE service_id = p_service_id)),
        'duration', COALESCE(p_duration, (SELECT duration FROM app.services WHERE service_id = p_service_id))
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_id    uuid,
    p_service_name  text    DEFAULT NULL,
    p_category_id   uuid    DEFAULT NULL,
    p_price         numeric DEFAULT NULL,
    p_duration      bigint  DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_service_atomic(
        p_company_id, p_branch_id, p_service_id, p_service_name,
        p_category_id, p_price, p_duration, p_description, p_status
    );
END;
$$;

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
    v_svc_name text;
    v_active_pkgs text;
    v_future_bookings int;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT service_name INTO v_svc_name
    FROM app.services
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_svc_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service not found or already deleted.');
    END IF;

    -- Dependency Guard 1: Active Packages
    SELECT string_agg(p.package_name, ', ') INTO v_active_pkgs
    FROM app.package_services ps
    JOIN app.packages p ON ps.package_id = p.package_id
    WHERE ps.service_id = p_service_id
      AND p.company_id = p_company_id
      AND p.branch_id = p_branch_id
      AND p.is_active = true
      AND p.status <> 'deleted';

    IF v_active_pkgs IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete this service because it is currently included in active package(s): ' || v_active_pkgs || '. Please remove it from the package(s) or deactivate them first.'
        );
    END IF;

    -- Dependency Guard 2: Future Active Bookings
    SELECT COUNT(*) INTO v_future_bookings
    FROM app.bookings
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_future_bookings > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete this service because there are ' || v_future_bookings || ' upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first.'
        );
    END IF;

    UPDATE app.services
    SET status = 'deleted',
        updated_at = NOW()
    WHERE service_id = p_service_id;

    RETURN jsonb_build_object('success', true, 'service_id', p_service_id, 'status', 'deleted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

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
    RETURN app.delete_service_atomic(p_company_id, p_branch_id, p_service_id);
END;
$$;

-- =============================================================================
-- PART 3: PACKAGES RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_package_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_package_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_package_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_package_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_package_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_package_atomic CASCADE;

CREATE OR REPLACE FUNCTION app.create_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_name   text,
    p_description    text        DEFAULT NULL,
    p_original_price numeric     DEFAULT 0,
    p_final_price    numeric     DEFAULT 0,
    p_is_active      boolean     DEFAULT true,
    p_service_ids    uuid[]      DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := trim(p_package_name);
    v_new_pkg_id uuid := gen_random_uuid();
    v_is_active boolean := COALESCE(p_is_active, true);
    v_status text := CASE WHEN v_is_active THEN 'active' ELSE 'inactive' END;
    v_valid_services int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package name cannot be empty.');
    END IF;

    IF p_original_price IS NULL OR p_original_price < 0 OR p_final_price IS NULL OR p_final_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package prices must be non-negative numeric values.');
    END IF;

    IF p_final_price > p_original_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'Final price cannot exceed original price.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.packages
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND lower(trim(package_name)) = lower(v_clean_name)
          AND status <> 'deleted'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'A package with this name already exists in this branch.');
    END IF;

    IF p_service_ids IS NULL OR cardinality(p_service_ids) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package must contain at least one service.');
    END IF;

    SELECT COUNT(*) INTO v_valid_services
    FROM app.services
    WHERE service_id = ANY(p_service_ids)
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_valid_services <> cardinality(p_service_ids) THEN
        RETURN jsonb_build_object('success', false, 'error', 'One or more selected services are invalid, deleted, or do not belong to this branch.');
    END IF;

    INSERT INTO app.packages (
        package_id, company_id, branch_id, package_name, description,
        original_price, final_price, is_active, status, services_count, created_at, updated_at
    ) VALUES (
        v_new_pkg_id, p_company_id, p_branch_id, v_clean_name, NULLIF(trim(p_description), ''),
        p_original_price, p_final_price, v_is_active, v_status, v_valid_services, NOW(), NOW()
    );

    INSERT INTO app.package_services (package_id, service_id, service_name, created_at)
    SELECT v_new_pkg_id, s.service_id, s.service_name, NOW()
    FROM app.services s
    WHERE s.service_id = ANY(p_service_ids);

    RETURN jsonb_build_object(
        'success', true,
        'package_id', v_new_pkg_id,
        'package_name', v_clean_name,
        'services_count', v_valid_services,
        'status', v_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_name   text,
    p_description    text        DEFAULT NULL,
    p_original_price numeric     DEFAULT 0,
    p_final_price    numeric     DEFAULT 0,
    p_is_active      boolean     DEFAULT true,
    p_service_ids    uuid[]      DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_package_atomic(
        p_company_id, p_branch_id, p_package_name, p_description,
        p_original_price, p_final_price, p_is_active, p_service_ids
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.update_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_id     uuid,
    p_package_name   text        DEFAULT NULL,
    p_description    text        DEFAULT NULL,
    p_original_price numeric     DEFAULT NULL,
    p_final_price    numeric     DEFAULT NULL,
    p_is_active      boolean     DEFAULT NULL,
    p_service_ids    uuid[]      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text := NULLIF(trim(p_package_name), '');
    v_old_name text;
    v_curr_orig numeric;
    v_curr_final numeric;
    v_target_orig numeric;
    v_target_final numeric;
    v_is_active boolean;
    v_status text;
    v_valid_services int;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT package_name, original_price, final_price, is_active
    INTO v_old_name, v_curr_orig, v_curr_final, v_is_active
    FROM app.packages
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_old_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package not found or does not belong to this branch.');
    END IF;

    v_target_orig := COALESCE(p_original_price, v_curr_orig);
    v_target_final := COALESCE(p_final_price, v_curr_final);

    IF v_target_orig < 0 OR v_target_final < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package prices must be non-negative.');
    END IF;

    IF v_target_final > v_target_orig THEN
        RETURN jsonb_build_object('success', false, 'error', 'Final price cannot exceed original price.');
    END IF;

    IF v_clean_name IS NOT NULL AND lower(v_clean_name) <> lower(v_old_name) THEN
        IF EXISTS (
            SELECT 1 FROM app.packages
            WHERE company_id = p_company_id
              AND branch_id = p_branch_id
              AND package_id <> p_package_id
              AND lower(trim(package_name)) = lower(v_clean_name)
              AND status <> 'deleted'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'A package with this name already exists in this branch.');
        END IF;
    END IF;

    IF p_is_active IS NOT NULL THEN
        v_is_active := p_is_active;
    END IF;
    v_status := CASE WHEN v_is_active THEN 'active' ELSE 'inactive' END;

    IF p_service_ids IS NOT NULL THEN
        IF cardinality(p_service_ids) = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Package must contain at least one service.');
        END IF;

        SELECT COUNT(*) INTO v_valid_services
        FROM app.services
        WHERE service_id = ANY(p_service_ids)
          AND company_id = p_company_id
          AND branch_id = p_branch_id
          AND status <> 'deleted';

        IF v_valid_services <> cardinality(p_service_ids) THEN
            RETURN jsonb_build_object('success', false, 'error', 'One or more replacement services are invalid, deleted, or do not belong to this branch.');
        END IF;

        DELETE FROM app.package_services WHERE package_id = p_package_id;

        INSERT INTO app.package_services (package_id, service_id, service_name, created_at)
        SELECT p_package_id, s.service_id, s.service_name, NOW()
        FROM app.services s
        WHERE s.service_id = ANY(p_service_ids);
    ELSE
        SELECT COUNT(*) INTO v_valid_services FROM app.package_services WHERE package_id = p_package_id;
    END IF;

    UPDATE app.packages SET
        package_name = COALESCE(v_clean_name, package_name),
        description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
        original_price = v_target_orig,
        final_price = v_target_final,
        is_active = v_is_active,
        status = v_status,
        services_count = v_valid_services,
        updated_at = NOW()
    WHERE package_id = p_package_id;

    RETURN jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'package_name', COALESCE(v_clean_name, v_old_name),
        'services_count', v_valid_services,
        'status', v_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_id     uuid,
    p_package_name   text        DEFAULT NULL,
    p_description    text        DEFAULT NULL,
    p_original_price numeric     DEFAULT NULL,
    p_final_price    numeric     DEFAULT NULL,
    p_is_active      boolean     DEFAULT NULL,
    p_service_ids    uuid[]      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_package_atomic(
        p_company_id, p_branch_id, p_package_id, p_package_name,
        p_description, p_original_price, p_final_price, p_is_active, p_service_ids
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_pkg_name text;
    v_future_bookings int := 0;
    v_future_bbt int := 0;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    SELECT package_name INTO v_pkg_name
    FROM app.packages
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF v_pkg_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Package not found or already deleted.');
    END IF;

    -- Dependency Guard: upcoming bookings referencing this package
    SELECT COUNT(*) INTO v_future_bookings
    FROM app.bookings
    WHERE service_id = p_package_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    SELECT COUNT(*) INTO v_future_bbt
    FROM app.bookings_for_business_transaction
    WHERE service_id ILIKE '%' || p_package_id::text || '%'
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF (v_future_bookings + v_future_bbt) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot delete this package because there are ' || (v_future_bookings + v_future_bbt) || ' upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first.'
        );
    END IF;

    UPDATE app.packages
    SET status = 'deleted',
        is_active = false,
        updated_at = NOW()
    WHERE package_id = p_package_id;

    RETURN jsonb_build_object('success', true, 'package_id', p_package_id, 'status', 'deleted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_package_atomic(p_company_id, p_branch_id, p_package_id);
END;
$$;

-- =============================================================================
-- PART 4: PERMISSIONS & GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.create_service_category_atomic TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_category_atomic TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_service_category_atomic TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_service_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_service_atomic          TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_package_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_package_atomic          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_atomic          TO anon, authenticated;
