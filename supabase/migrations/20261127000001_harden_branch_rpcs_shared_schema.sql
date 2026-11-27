-- =============================================================================
-- Migration 20261127000001: Harden Branch RPCs — Move core to shared schema
-- Module: Branch Management
-- Functions:
--   shared.create_branch_atomic        / public.create_branch_atomic
--   shared.update_branch_atomic        / public.update_branch_atomic
--   shared.toggle_branch_status_atomic / public.toggle_branch_status_atomic
--   shared.delete_branch_atomic        / public.delete_branch_atomic
-- Architecture: Two-Tier Standard
--   Section 1 = Security & Preconditions (Fail-Fast)
--   Section 2 = Sequential Atomic Core Logic
-- Tables Written: shared.branches
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DROP old app.* functions (old schema, being replaced by shared.*)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS app.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS app.toggle_branch_status_atomic(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS app.delete_branch_atomic(uuid, uuid) CASCADE;

-- DROP old public.* wrappers (signature unchanged, but re-created to point to shared.*)
DROP FUNCTION IF EXISTS public.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.toggle_branch_status_atomic(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.delete_branch_atomic(uuid, uuid) CASCADE;


-- =============================================================================
-- =============================================================================
-- 1. create_branch_atomic
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- CANONICAL FUNCTION: shared.create_branch_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION shared.create_branch_atomic(
    p_company_id      uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_new_branch_id uuid   := gen_random_uuid();
    v_clean_name    text   := NULLIF(TRIM(p_branch_name), '');
    v_clean_email   text   := NULLIF(LOWER(TRIM(p_branch_email)), '');
    v_norm_phone    text;
    v_clean_code    text   := NULLIF(TRIM(p_branch_code), '');
    v_status        text   := COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), 'active');
    v_new_branch    shared.branches%ROWTYPE;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'Branch name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Branch name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_branch_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'A valid phone number with at least 7 digits is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_norm_phone) > 15 THEN
        RAISE EXCEPTION 'Phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_email IS NOT NULL AND length(v_clean_email) > 255 THEN
        RAISE EXCEPTION 'Email cannot exceed 255 characters' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'create_branch');

    -- Step 1.6: SaaS Plan Quota Check
    PERFORM shared.check_quota(p_company_id, 'max_branches');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Duplicate name check with pessimistic locking
    PERFORM 1
    FROM shared.branches
    WHERE company_id = p_company_id
      AND LOWER(branch_name) = LOWER(v_clean_name)
      AND status <> 'deleted'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A branch named "%" already exists in your company', v_clean_name
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Optional manager user verification
    IF p_manager_user_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM shared.users
            WHERE user_id   = p_manager_user_id
              AND company_id = p_company_id
              AND status     <> 'deleted'
        ) THEN
            RAISE EXCEPTION 'Manager user not found in this company' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.3: Insert new branch record atomically
    INSERT INTO shared.branches (
        branch_id,        company_id,       branch_name,      branch_phone,
        branch_email,     branch_code,      manager_user_id,
        address_line_1,   address_line_2,   locality_area,    landmark,
        city,             district,         state,            pin_code,
        country,          branch_address,   google_maps_url,
        latitude,         longitude,        status,
        created_at,       updated_at
    ) VALUES (
        v_new_branch_id,  p_company_id,     v_clean_name,     v_norm_phone,
        v_clean_email,    v_clean_code,     p_manager_user_id,
        NULLIF(TRIM(p_address_line_1),  ''), NULLIF(TRIM(p_address_line_2), ''),
        NULLIF(TRIM(p_locality_area),   ''), NULLIF(TRIM(p_landmark),        ''),
        NULLIF(TRIM(p_city),            ''), NULLIF(TRIM(p_district),         ''),
        NULLIF(TRIM(p_state),           ''), NULLIF(TRIM(p_pin_code),         ''),
        COALESCE(NULLIF(TRIM(p_country), ''), 'India'),
        NULLIF(TRIM(p_branch_address),  ''), NULLIF(TRIM(p_google_maps_url),  ''),
        p_latitude,       p_longitude,      v_status,
        NOW(),            NOW()
    )
    RETURNING * INTO v_new_branch;

    -- Return full authoritative record + success flag for client compatibility
    RETURN to_jsonb(v_new_branch) || jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- ACL: Lock down shared function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION shared.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_branch_atomic(
    p_company_id      uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.create_branch_atomic(
        p_company_id,      p_branch_name,     p_branch_phone,    p_branch_email,
        p_branch_code,     p_manager_user_id, p_address_line_1,  p_address_line_2,
        p_locality_area,   p_landmark,        p_city,            p_district,
        p_state,           p_pin_code,        p_country,         p_branch_address,
        p_google_maps_url, p_latitude,        p_longitude,       p_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_branch_atomic(uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) TO authenticated, service_role;


-- =============================================================================
-- =============================================================================
-- 2. update_branch_atomic
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- CANONICAL FUNCTION: shared.update_branch_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION shared.update_branch_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name    text := NULLIF(TRIM(p_branch_name), '');
    v_clean_email   text := NULLIF(LOWER(TRIM(p_branch_email)), '');
    v_norm_phone    text;
    v_clean_code    text := NULLIF(TRIM(p_branch_code), '');
    v_updated_branch shared.branches%ROWTYPE;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'Branch name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Branch name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_branch_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'A valid phone number with at least 7 digits is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_norm_phone) > 15 THEN
        RAISE EXCEPTION 'Phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_email IS NOT NULL AND length(v_clean_email) > 255 THEN
        RAISE EXCEPTION 'Email cannot exceed 255 characters' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'update_branch');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Verify branch exists and is not deleted (with pessimistic lock)
    PERFORM 1
    FROM shared.branches
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or has been deleted' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Duplicate name check against other branches
    IF EXISTS (
        SELECT 1 FROM shared.branches
        WHERE company_id  = p_company_id
          AND LOWER(branch_name) = LOWER(v_clean_name)
          AND branch_id   <> p_branch_id
          AND status      <> 'deleted'
    ) THEN
        RAISE EXCEPTION 'Another branch named "%" already exists in your company', v_clean_name
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Optional manager user verification
    IF p_manager_user_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM shared.users
            WHERE user_id   = p_manager_user_id
              AND company_id = p_company_id
              AND status     <> 'deleted'
        ) THEN
            RAISE EXCEPTION 'Manager user not found in this company' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.4: Update branch record atomically
    UPDATE shared.branches SET
        branch_name     = v_clean_name,
        branch_phone    = v_norm_phone,
        branch_email    = v_clean_email,
        branch_code     = v_clean_code,
        manager_user_id = p_manager_user_id,
        address_line_1  = NULLIF(TRIM(p_address_line_1),  ''),
        address_line_2  = NULLIF(TRIM(p_address_line_2),  ''),
        locality_area   = NULLIF(TRIM(p_locality_area),   ''),
        landmark        = NULLIF(TRIM(p_landmark),         ''),
        city            = NULLIF(TRIM(p_city),             ''),
        district        = NULLIF(TRIM(p_district),         ''),
        state           = NULLIF(TRIM(p_state),            ''),
        pin_code        = NULLIF(TRIM(p_pin_code),         ''),
        country         = COALESCE(NULLIF(TRIM(p_country), ''), 'India'),
        branch_address  = NULLIF(TRIM(p_branch_address),  ''),
        google_maps_url = NULLIF(TRIM(p_google_maps_url),  ''),
        latitude        = p_latitude,
        longitude       = p_longitude,
        status          = COALESCE(p_status, status),
        updated_at      = NOW()
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
    RETURNING * INTO v_updated_branch;

    -- Return full authoritative record + success flag for client compatibility
    RETURN to_jsonb(v_updated_branch) || jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- ACL: Lock down shared function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION shared.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_branch_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.update_branch_atomic(
        p_company_id,      p_branch_id,       p_branch_name,     p_branch_phone,
        p_branch_email,    p_branch_code,     p_manager_user_id, p_address_line_1,
        p_address_line_2,  p_locality_area,   p_landmark,        p_city,
        p_district,        p_state,           p_pin_code,        p_country,
        p_branch_address,  p_google_maps_url, p_latitude,        p_longitude,
        p_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_branch_atomic(uuid, uuid, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, text) TO authenticated, service_role;


-- =============================================================================
-- =============================================================================
-- 3. toggle_branch_status_atomic
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- CANONICAL FUNCTION: shared.toggle_branch_status_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION shared.toggle_branch_status_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_new_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_active_count integer;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Domain validation
    IF p_new_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'update_branch');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Last-active-branch guard — cannot deactivate the only active branch
    IF p_new_status = 'inactive' THEN
        SELECT COUNT(*) INTO v_active_count
        FROM shared.branches
        WHERE company_id = p_company_id
          AND branch_id  <> p_branch_id
          AND status      = 'active';

        IF v_active_count = 0 THEN
            RAISE EXCEPTION 'Cannot deactivate branch: a company must have at least one active branch'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.2: Apply status update
    UPDATE shared.branches SET
        status     = p_new_status,
        updated_at = NOW()
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or has been deleted' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'success',    true,
        'branch_id',  p_branch_id,
        'new_status', p_new_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down shared function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION shared.toggle_branch_status_atomic(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.toggle_branch_status_atomic(uuid, uuid, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.toggle_branch_status_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_new_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.toggle_branch_status_atomic(p_company_id, p_branch_id, p_new_status);
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.toggle_branch_status_atomic(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.toggle_branch_status_atomic(uuid, uuid, text) TO authenticated, service_role;


-- =============================================================================
-- =============================================================================
-- 4. delete_branch_atomic
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- CANONICAL FUNCTION: shared.delete_branch_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION shared.delete_branch_atomic(
    p_company_id  uuid,
    p_branch_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_non_deleted_count integer;
    v_booking_count     integer;
    v_staff_count       integer;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.3: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission verification
    PERFORM shared.check_permission(p_company_id, 'delete_branch');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Last-operational-branch guard — company must retain at least one
    SELECT COUNT(*) INTO v_non_deleted_count
    FROM shared.branches
    WHERE company_id = p_company_id
      AND branch_id  <> p_branch_id
      AND status     <> 'deleted';

    IF v_non_deleted_count = 0 THEN
        RAISE EXCEPTION 'Cannot delete branch: a company must have at least one operational branch'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Active bookings guard
    SELECT COUNT(*) INTO v_booking_count
    FROM app.bookings
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     IN ('pending', 'confirmed', 'in_service');

    IF v_booking_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete branch: % active booking(s) are scheduled for this branch', v_booking_count
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Active staff guard
    SELECT COUNT(*) INTO v_staff_count
    FROM app.staff
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     = 'active';

    IF v_staff_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete branch: % active staff member(s) are assigned here — reassign them first', v_staff_count
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.4: Soft-delete the branch
    UPDATE shared.branches SET
        status     = 'deleted',
        updated_at = NOW()
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch not found or already deleted' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object('success', true, 'branch_id', p_branch_id);
END;
$$;

-- =============================================================================
-- ACL: Lock down shared function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION shared.delete_branch_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.delete_branch_atomic(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_branch_atomic(
    p_company_id  uuid,
    p_branch_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.delete_branch_atomic(p_company_id, p_branch_id);
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.delete_branch_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_branch_atomic(uuid, uuid) TO authenticated, service_role;
