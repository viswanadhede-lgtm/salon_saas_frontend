-- =============================================================================
-- Migration 20261103000015 — Part B: Harden IAM Module (Role/Permission/Prefs)
-- Procedures: create_role_atomic, update_role_atomic, delete_role_atomic,
--             save_role_permissions_atomic, upsert_user_preferences_atomic
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 7. create_role_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_role_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,
  p_role_name   text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_new_role_id uuid;
  v_exists      boolean;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  IF LOWER(p_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner is a protected role name and cannot be created.';
  END IF;

  -- Name uniqueness (case-insensitive) within company
  SELECT EXISTS(
    SELECT 1 FROM shared.roles
    WHERE company_id = p_company_id
      AND LOWER(role_name) = LOWER(p_role_name)
      AND status <> 'deleted'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'A role with this name already exists in your company.';
  END IF;

  v_new_role_id := gen_random_uuid();

  INSERT INTO shared.roles (
    role_id, company_id, branch_id,
    role_name, description,
    is_default, status,
    created_at, updated_at
  ) VALUES (
    v_new_role_id, p_company_id, p_branch_id,
    p_role_name, COALESCE(p_description, p_role_name || ' role'),
    false, 'active',
    NOW(), NOW()
  );

  RETURN jsonb_build_object('success', true, 'role_id', v_new_role_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_role_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,
  p_role_name   text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.create_role_atomic(p_company_id, p_branch_id, p_role_name, p_description);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. update_role_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid,
  p_role_name   text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_current_name text;
  v_exists       boolean;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  SELECT role_name INTO v_current_name
  FROM shared.roles
  WHERE role_id = p_role_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;

  IF LOWER(v_current_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be modified.';
  END IF;

  IF LOWER(p_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner is a protected role name.';
  END IF;

  -- Uniqueness check (excluding self)
  SELECT EXISTS(
    SELECT 1 FROM shared.roles
    WHERE company_id = p_company_id
      AND LOWER(role_name) = LOWER(p_role_name)
      AND role_id <> p_role_id
      AND status <> 'deleted'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'Another role with this name already exists.';
  END IF;

  UPDATE shared.roles SET
    role_name   = p_role_name,
    description = COALESCE(p_description, description),
    updated_at  = NOW()
  WHERE role_id = p_role_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid,
  p_role_name   text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.update_role_atomic(p_company_id, p_role_id, p_role_name, p_description);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. delete_role_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_role_name   text;
  v_user_count  integer;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  SELECT role_name INTO v_role_name
  FROM shared.roles
  WHERE role_id = p_role_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;

  IF LOWER(v_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be deleted.';
  END IF;

  -- Block deletion if active users are assigned to this role
  SELECT COUNT(*) INTO v_user_count
  FROM shared.users
  WHERE role_id = p_role_id AND company_id = p_company_id AND status = 'active';

  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete role: % active user(s) are assigned to it. Reassign them first.', v_user_count;
  END IF;

  -- Soft-delete the role
  UPDATE shared.roles SET
    status     = 'deleted',
    updated_at = NOW()
  WHERE role_id = p_role_id AND company_id = p_company_id;

  -- Hard-delete all permission rows for this role
  DELETE FROM shared.role_permissions
  WHERE role_id = p_role_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.delete_role_atomic(p_company_id, p_role_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. save_role_permissions_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_role_permissions_atomic(
  p_company_id      uuid,
  p_branch_id       uuid,
  p_role_id         uuid,
  p_role_name       text,
  p_permission_keys jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_role_name     text;
  v_existing_ids  uuid[];
  v_primary_id    uuid;
  v_extra_ids     uuid[];
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  -- Validate role exists and belongs to company
  SELECT role_name INTO v_role_name
  FROM shared.roles
  WHERE role_id = p_role_id AND company_id = p_company_id AND status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;

  IF LOWER(v_role_name) = 'owner' THEN
    RAISE EXCEPTION 'Owner role permissions cannot be modified.';
  END IF;

  -- Collect existing permission row ids
  SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_existing_ids
  FROM shared.role_permissions
  WHERE role_id = p_role_id AND company_id = p_company_id;

  IF v_existing_ids IS NOT NULL AND array_length(v_existing_ids, 1) > 0 THEN
    v_primary_id := v_existing_ids[1];

    -- Update primary row
    UPDATE shared.role_permissions SET
      branch_id      = p_branch_id,
      role_name      = p_role_name,
      permission_key = p_permission_keys::text,
      status         = 'active',
      updated_at     = NOW()
    WHERE id = v_primary_id;

    -- Delete any duplicate extra rows
    IF array_length(v_existing_ids, 1) > 1 THEN
      v_extra_ids := v_existing_ids[2:];
      DELETE FROM shared.role_permissions WHERE id = ANY(v_extra_ids);
    END IF;
  ELSE
    -- Insert a fresh single row
    INSERT INTO shared.role_permissions (
      id, company_id, branch_id,
      role_id, role_name,
      permission_key, status,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_branch_id,
      p_role_id, p_role_name,
      p_permission_keys::text, 'active',
      NOW(), NOW()
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_role_permissions_atomic(
  p_company_id      uuid,
  p_branch_id       uuid,
  p_role_id         uuid,
  p_role_name       text,
  p_permission_keys jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_role_permissions_atomic(
    p_company_id, p_branch_id, p_role_id, p_role_name, p_permission_keys
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. upsert_user_preferences_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.upsert_user_preferences_atomic(
  p_user_id       uuid,
  p_company_id    uuid  DEFAULT NULL,
  p_branch_id     uuid  DEFAULT NULL,
  p_language      text  DEFAULT NULL,
  p_theme         text  DEFAULT NULL,
  p_notifications boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;

  IF p_company_id IS NOT NULL THEN
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
      RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;
  END IF;

  SELECT id INTO v_existing_id
  FROM shared.user_preferences
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE shared.user_preferences SET
      company_id    = COALESCE(p_company_id, company_id),
      branch_id     = COALESCE(p_branch_id, branch_id),
      language      = COALESCE(p_language, language),
      theme         = COALESCE(p_theme, theme),
      notifications = COALESCE(p_notifications, notifications),
      updated_at    = NOW()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO shared.user_preferences (
      id, user_id, company_id, branch_id,
      language, theme, notifications,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_user_id,
      p_company_id, p_branch_id,
      p_language, p_theme, p_notifications,
      NOW(), NOW()
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences_atomic(
  p_user_id       uuid,
  p_company_id    uuid  DEFAULT NULL,
  p_branch_id     uuid  DEFAULT NULL,
  p_language      text  DEFAULT NULL,
  p_theme         text  DEFAULT NULL,
  p_notifications boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.upsert_user_preferences_atomic(
    p_user_id, p_company_id, p_branch_id,
    p_language, p_theme, p_notifications
  );
END;
$$;

