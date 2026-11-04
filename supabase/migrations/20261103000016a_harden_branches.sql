-- =============================================================================
-- Migration 20261103000016a: Harden Module 11 (Part A - Branches)
-- Procedures:
--   app.create_branch_atomic / public.create_branch_atomic
--   app.update_branch_atomic / public.update_branch_atomic
--   app.toggle_branch_status_atomic / public.toggle_branch_status_atomic
--   app.delete_branch_atomic / public.delete_branch_atomic
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_branch_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_branch_atomic(
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
  v_new_branch_id uuid := gen_random_uuid();
  v_exists        boolean;
  v_name          text := NULLIF(TRIM(p_branch_name), '');
BEGIN
  -- Tenant guard
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Branch name is required.';
  END IF;

  -- Name uniqueness within company (non-deleted)
  SELECT EXISTS(
    SELECT 1 FROM shared.branches
    WHERE company_id = p_company_id
      AND LOWER(branch_name) = LOWER(v_name)
      AND status <> 'deleted'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'A branch named "%" already exists in your company.', v_name;
  END IF;

  -- Optional manager verification
  IF p_manager_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM shared.users
      WHERE user_id = p_manager_user_id
        AND company_id = p_company_id
        AND status <> 'deleted'
    ) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Manager user not found in this company.';
    END IF;
  END IF;

  INSERT INTO shared.branches (
    branch_id, company_id, branch_name, branch_phone, branch_email,
    branch_code, manager_user_id, address_line_1, address_line_2,
    locality_area, landmark, city, district, state, pin_code,
    country, branch_address, google_maps_url, latitude, longitude,
    status, created_at, updated_at
  ) VALUES (
    v_new_branch_id, p_company_id, v_name, p_branch_phone, p_branch_email,
    p_branch_code, p_manager_user_id, p_address_line_1, p_address_line_2,
    p_locality_area, p_landmark, p_city, p_district, p_state, p_pin_code,
    COALESCE(p_country, 'India'), p_branch_address, p_google_maps_url,
    p_latitude, p_longitude, COALESCE(p_status, 'active'), NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'branch_id', v_new_branch_id,
    'branch_name', v_name
  );
END;
$$;

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
  RETURN app.create_branch_atomic(
    p_company_id, p_branch_name, p_branch_phone, p_branch_email,
    p_branch_code, p_manager_user_id, p_address_line_1, p_address_line_2,
    p_locality_area, p_landmark, p_city, p_district, p_state, p_pin_code,
    p_country, p_branch_address, p_google_maps_url, p_latitude, p_longitude,
    p_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. update_branch_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_branch_atomic(
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
  v_name   text := NULLIF(TRIM(p_branch_name), '');
  v_exists boolean;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Branch name is required.';
  END IF;

  -- Ensure branch exists and is not deleted
  SELECT EXISTS(
    SELECT 1 FROM shared.branches
    WHERE branch_id = p_branch_id
      AND company_id = p_company_id
      AND status <> 'deleted'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Branch not found or has been deleted.';
  END IF;

  -- Name uniqueness check against other branches in company
  SELECT EXISTS(
    SELECT 1 FROM shared.branches
    WHERE company_id = p_company_id
      AND LOWER(branch_name) = LOWER(v_name)
      AND branch_id <> p_branch_id
      AND status <> 'deleted'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'Another branch named "%" already exists in your company.', v_name;
  END IF;

  -- Manager user check
  IF p_manager_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM shared.users
      WHERE user_id = p_manager_user_id
        AND company_id = p_company_id
        AND status <> 'deleted'
    ) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Manager user not found in this company.';
    END IF;
  END IF;

  UPDATE shared.branches SET
    branch_name     = v_name,
    branch_phone    = p_branch_phone,
    branch_email    = p_branch_email,
    branch_code     = p_branch_code,
    manager_user_id = p_manager_user_id,
    address_line_1  = p_address_line_1,
    address_line_2  = p_address_line_2,
    locality_area   = p_locality_area,
    landmark        = p_landmark,
    city            = p_city,
    district        = p_district,
    state           = p_state,
    pin_code        = p_pin_code,
    country         = COALESCE(p_country, country),
    branch_address  = p_branch_address,
    google_maps_url = p_google_maps_url,
    latitude        = p_latitude,
    longitude       = p_longitude,
    status          = COALESCE(p_status, status),
    updated_at      = NOW()
  WHERE branch_id = p_branch_id
    AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

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
  RETURN app.update_branch_atomic(
    p_company_id, p_branch_id, p_branch_name, p_branch_phone,
    p_branch_email, p_branch_code, p_manager_user_id, p_address_line_1,
    p_address_line_2, p_locality_area, p_landmark, p_city, p_district,
    p_state, p_pin_code, p_country, p_branch_address, p_google_maps_url,
    p_latitude, p_longitude, p_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. toggle_branch_status_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.toggle_branch_status_atomic(
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
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  IF p_new_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status value. Must be active or inactive.';
  END IF;

  -- Guard: If deactivating, ensure company has at least 1 other active branch
  IF p_new_status = 'inactive' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM shared.branches
    WHERE company_id = p_company_id
      AND branch_id <> p_branch_id
      AND status = 'active';

    IF v_active_count = 0 THEN
      RAISE EXCEPTION 'Cannot deactivate branch: A company must have at least one active branch.';
    END IF;
  END IF;

  UPDATE shared.branches SET
    status     = p_new_status,
    updated_at = NOW()
  WHERE branch_id = p_branch_id
    AND company_id = p_company_id
    AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found or has been deleted.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'branch_id', p_branch_id,
    'new_status', p_new_status
  );
END;
$$;

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
  RETURN app.toggle_branch_status_atomic(p_company_id, p_branch_id, p_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. delete_branch_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_branch_atomic(
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
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  -- Guard 1: Must have at least 1 other non-deleted branch
  SELECT COUNT(*) INTO v_non_deleted_count
  FROM shared.branches
  WHERE company_id = p_company_id
    AND branch_id <> p_branch_id
    AND status <> 'deleted';

  IF v_non_deleted_count = 0 THEN
    RAISE EXCEPTION 'Cannot delete branch: A company must have at least one operational branch.';
  END IF;

  -- Guard 2: Active upcoming bookings
  SELECT COUNT(*) INTO v_booking_count
  FROM app.bookings
  WHERE branch_id = p_branch_id
    AND company_id = p_company_id
    AND status IN ('pending', 'confirmed', 'in_service');

  IF v_booking_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete branch: % active booking(s) are scheduled for this branch.', v_booking_count;
  END IF;

  -- Guard 3: Active staff assigned exclusively to this branch
  SELECT COUNT(*) INTO v_staff_count
  FROM app.staff
  WHERE branch_id = p_branch_id
    AND company_id = p_company_id
    AND status = 'active';

  IF v_staff_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete branch: % active staff member(s) are assigned to this branch. Reassign them first.', v_staff_count;
  END IF;

  -- Soft delete
  UPDATE shared.branches SET
    status     = 'deleted',
    updated_at = NOW()
  WHERE branch_id = p_branch_id
    AND company_id = p_company_id
    AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found or already deleted.';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

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
  RETURN app.delete_branch_atomic(p_company_id, p_branch_id);
END;
$$;

