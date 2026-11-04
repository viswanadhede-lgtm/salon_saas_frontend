-- =============================================================================
-- Migration 20261103000015 — Part A: Harden IAM Module (User Procedures)
-- Procedures: create_user_atomic, update_user_atomic, toggle_user_status_atomic,
--             delete_user_atomic, update_user_last_login_atomic,
--             update_user_profile_name_phone_atomic
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_user_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,
  p_user_id     uuid,
  p_name        text,
  p_email       text,
  p_phone       text,
  p_role_id     uuid,
  p_role_name   text,
  p_status      text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Tenant guard
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  -- Owner role guard
  IF LOWER(p_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner is a protected role and cannot be assigned.';
  END IF;

  -- Email uniqueness within company
  SELECT EXISTS(
    SELECT 1 FROM shared.users
    WHERE company_id = p_company_id
      AND LOWER(email) = LOWER(p_email)
      AND status <> 'deleted'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'A user with this email already exists in your company.';
  END IF;

  -- Role must exist and be active
  SELECT EXISTS(
    SELECT 1 FROM shared.roles
    WHERE role_id = p_role_id
      AND company_id = p_company_id
      AND status <> 'deleted'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Role not found or inactive.';
  END IF;

  -- Insert user profile
  INSERT INTO shared.users (
    user_id, company_id, branch_id,
    name, email, phone,
    role_id, role_name, status,
    created_at, updated_at
  ) VALUES (
    p_user_id, p_company_id, p_branch_id,
    p_name, p_email, p_phone,
    p_role_id, p_role_name, p_status,
    NOW(), NOW()
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,
  p_user_id     uuid,
  p_name        text,
  p_email       text,
  p_phone       text,
  p_role_id     uuid,
  p_role_name   text,
  p_status      text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.create_user_atomic(
    p_company_id, p_branch_id, p_user_id,
    p_name, p_email, p_phone,
    p_role_id, p_role_name, p_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. update_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text,
  p_email       text,
  p_role_id     uuid,
  p_role_name   text,
  p_branch_id   uuid,
  p_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_current_role text;
  v_exists       boolean;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  -- Fetch current role of target user
  SELECT role_name INTO v_current_role
  FROM shared.users
  WHERE user_id = p_user_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  -- Protect owner user
  IF LOWER(v_current_role) = 'owner' THEN
    RAISE EXCEPTION 'Owner users cannot be modified.';
  END IF;

  -- Cannot assign owner role
  IF LOWER(p_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner is a protected role and cannot be assigned.';
  END IF;

  -- Role must exist and be active
  SELECT EXISTS(
    SELECT 1 FROM shared.roles
    WHERE role_id = p_role_id
      AND company_id = p_company_id
      AND status <> 'deleted'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Role not found or inactive.';
  END IF;

  UPDATE shared.users SET
    name       = p_name,
    phone      = p_phone,
    email      = p_email,
    role_id    = p_role_id,
    role_name  = p_role_name,
    branch_id  = p_branch_id,
    status     = p_status,
    updated_at = NOW()
  WHERE user_id = p_user_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text,
  p_email       text,
  p_role_id     uuid,
  p_role_name   text,
  p_branch_id   uuid,
  p_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.update_user_atomic(
    p_company_id, p_user_id,
    p_name, p_phone, p_email,
    p_role_id, p_role_name, p_branch_id, p_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. toggle_user_status_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.toggle_user_status_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_new_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  IF p_new_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status value. Must be active or inactive.';
  END IF;

  SELECT role_name INTO v_current_role
  FROM shared.users
  WHERE user_id = p_user_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF LOWER(v_current_role) = 'owner' THEN
    RAISE EXCEPTION 'Owner users cannot be modified.';
  END IF;

  UPDATE shared.users SET
    status     = p_new_status,
    updated_at = NOW()
  WHERE user_id = p_user_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_user_status_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_new_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.toggle_user_status_atomic(p_company_id, p_user_id, p_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. delete_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  SELECT role_name INTO v_current_role
  FROM shared.users
  WHERE user_id = p_user_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF LOWER(v_current_role) = 'owner' THEN
    RAISE EXCEPTION 'Owner users cannot be deleted.';
  END IF;

  UPDATE shared.users SET
    status     = 'deleted',
    updated_at = NOW()
  WHERE user_id = p_user_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.delete_user_atomic(p_company_id, p_user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. update_user_last_login_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_user_last_login_atomic(
  p_user_id  uuid  DEFAULT NULL,
  p_email    text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL AND p_email IS NULL THEN
    RAISE EXCEPTION 'Either p_user_id or p_email must be provided.';
  END IF;

  IF p_user_id IS NOT NULL THEN
    UPDATE shared.users SET last_login_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE shared.users SET last_login_at = NOW()
    WHERE LOWER(email) = LOWER(p_email);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_last_login_atomic(
  p_user_id  uuid  DEFAULT NULL,
  p_email    text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.update_user_last_login_atomic(p_user_id, p_email);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. update_user_profile_name_phone_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_user_profile_name_phone_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  UPDATE shared.users SET
    name       = p_name,
    phone      = p_phone,
    updated_at = NOW()
  WHERE user_id = p_user_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_profile_name_phone_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.update_user_profile_name_phone_atomic(p_company_id, p_user_id, p_name, p_phone);
END;
$$;

