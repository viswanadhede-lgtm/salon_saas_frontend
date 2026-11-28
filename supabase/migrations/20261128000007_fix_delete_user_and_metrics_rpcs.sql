-- =============================================================================
-- Migration 20261128000007: Fix column & security gate bugs in delete_user_atomic
--                            and user_login_logout_metrics
-- Fixes:
--   1. shared.delete_user_atomic:
--      - Enforce boolean return of shared.verify_tenant_access(p_company_id, NULL)
--      - Fix shared.check_subscription(p_company_id) and shared.check_permission(p_company_id, 'user_delete')
--        (previous version called nonexistent shared.get_session_context(uuid))
--      - Fix WHERE id = p_user_id -> WHERE user_id = p_user_id (shared.users PK is user_id)
--      - Use consistent search_path (platform, shared, app, public, pg_temp)
--   2. shared.user_login_logout_metrics:
--      - Fix WHERE id = p_user_id -> WHERE user_id = p_user_id
--      - Add Section 1 session/caller identity check (non-service_role callers can
--        only update their own user_id / JWT email)
--      - Skip deleted user rows and avoid duplicated SQL branches
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: CANONICAL — shared.delete_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.delete_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_target     shared.users%ROWTYPE;
    v_role_name  text;
BEGIN

    -- =========================================================================
    -- SECTION 1 — Security & Preconditions (Fail-Fast)
    -- =========================================================================

    -- 1.1  NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is required' USING ERRCODE = 'P0001';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required'    USING ERRCODE = 'P0001';
    END IF;

    -- 1.2  Tenant access — verify_tenant_access returns boolean and does not raise
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- 1.3  Subscription gate
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4  Permission gate
    PERFORM shared.check_permission(p_company_id, 'user_delete');


    -- =========================================================================
    -- SECTION 2 — Atomic Core Logic
    -- =========================================================================

    -- 2.1  Lock target user row & confirm existence
    SELECT * INTO v_target
    FROM shared.users
    WHERE user_id    = p_user_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0001';
    END IF;

    IF v_target.status = 'deleted' THEN
        RAISE EXCEPTION 'User is already deleted' USING ERRCODE = 'P0001';
    END IF;

    -- 2.2  Protect Owner / super_admin — cannot delete these roles
    v_role_name := LOWER(TRIM(COALESCE(v_target.role_name, '')));
    IF v_role_name IN ('owner', 'super_admin', 'superadmin') THEN
        RAISE EXCEPTION 'Cannot delete an Owner or Super Admin account'
            USING ERRCODE = '42501';
    END IF;

    -- 2.3  Self-delete guard — a user cannot delete their own account
    IF auth.uid() IS NOT NULL AND p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account'
            USING ERRCODE = 'P0001';
    END IF;

    -- 2.4  Soft-delete the user
    UPDATE shared.users
    SET
        status     = 'deleted',
        updated_at = NOW()
    WHERE user_id    = p_user_id
      AND company_id = p_company_id;

    -- 2.5  Auto-clear branch manager where this user was the manager
    UPDATE shared.branches
    SET
        manager_id   = NULL,
        manager_name = NULL,
        updated_at   = NOW()
    WHERE company_id = p_company_id
      AND manager_id = p_user_id
      AND status    <> 'deleted';

    -- 2.6  Decrement platform usage counter for max_users
    UPDATE platform.usage_counters
    SET
        current_count = GREATEST(COALESCE(current_count, 1) - 1, 0),
        updated_at    = NOW()
    WHERE company_id = p_company_id
      AND limit_key  = 'max_users';

    -- 2.7  Return success
    RETURN jsonb_build_object('success', true);

END;
$$;

REVOKE ALL ON FUNCTION shared.delete_user_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.delete_user_atomic(uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART B: PUBLIC WRAPPER — public.delete_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared
AS $$
    SELECT shared.delete_user_atomic(p_company_id, p_user_id);
$$;

REVOKE ALL ON FUNCTION public.delete_user_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_atomic(uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART C: CANONICAL — shared.user_login_logout_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.user_login_logout_metrics(
    p_event   text,
    p_user_id uuid DEFAULT NULL,
    p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_event       text := NULLIF(LOWER(TRIM(p_event)), '');
    v_clean_email text := NULLIF(LOWER(TRIM(p_email)), '');
    v_jwt_email   text := NULLIF(LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', ''))), '');
    v_uid         uuid := auth.uid();
    v_role        text := auth.role();
BEGIN

    -- =========================================================================
    -- SECTION 1 — Security & Preconditions (Fail-Fast)
    -- =========================================================================

    -- 1.1  Validate event type — must be exactly 'login' or 'logout'
    IF v_event IS NULL OR v_event NOT IN ('login', 'logout') THEN
        RAISE EXCEPTION 'p_event must be ''login'' or ''logout'', got: %', COALESCE(p_event, 'NULL')
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 1.2  At least one user identifier is required
    IF p_user_id IS NULL AND v_clean_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 1.3  Caller identity check — authenticated users may only record their own metrics
    IF COALESCE(v_role, '') <> 'service_role' THEN
        IF v_uid IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED: Valid session required' USING ERRCODE = '42501';
        END IF;

        IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
            RAISE EXCEPTION 'Unauthorized: Cannot update session metrics for another user'
                USING ERRCODE = '42501';
        END IF;

        IF v_clean_email IS NOT NULL AND v_jwt_email IS NOT NULL AND v_clean_email <> v_jwt_email THEN
            RAISE EXCEPTION 'Unauthorized: Cannot update session metrics for another email'
                USING ERRCODE = '42501';
        END IF;
    END IF;


    -- =========================================================================
    -- SECTION 2 — Atomic Core Logic
    -- =========================================================================

    -- 2.1  Write the appropriate timestamp column using PK lookup when p_user_id is present
    IF p_user_id IS NOT NULL THEN
        UPDATE shared.users
        SET last_login_at  = CASE WHEN v_event = 'login'  THEN NOW() ELSE last_login_at  END,
            last_logout_at = CASE WHEN v_event = 'logout' THEN NOW() ELSE last_logout_at END,
            updated_at     = NOW()
        WHERE user_id = p_user_id
          AND status <> 'deleted';
    ELSE
        UPDATE shared.users
        SET last_login_at  = CASE WHEN v_event = 'login'  THEN NOW() ELSE last_login_at  END,
            last_logout_at = CASE WHEN v_event = 'logout' THEN NOW() ELSE last_logout_at END,
            updated_at     = NOW()
        WHERE LOWER(TRIM(email)) = v_clean_email
          AND status <> 'deleted';
    END IF;

    -- 2.2  Return success with event echoed back
    RETURN jsonb_build_object('success', true, 'event', v_event);

END;
$$;

REVOKE ALL ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART D: PUBLIC WRAPPER — public.user_login_logout_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_login_logout_metrics(
    p_event   text,
    p_user_id uuid DEFAULT NULL,
    p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared
AS $$
    SELECT shared.user_login_logout_metrics(p_event, p_user_id, p_email);
$$;

REVOKE ALL ON FUNCTION public.user_login_logout_metrics(text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) TO authenticated, service_role;
