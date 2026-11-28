-- =============================================================================
-- Migration 20261128000003: Harden delete_user_atomic
-- Module: User Management (IAM)
-- Functions:
--   shared.delete_user_atomic / public.delete_user_atomic
-- Dropped:
--   app.delete_user_atomic / public.delete_user_atomic (old versions)
-- Architecture: Two-Tier Standard
--   Section 1 = Security & Preconditions (Fail-Fast)
--   Section 2 = Sequential Atomic Core Logic
-- Tables Written:
--   shared.users          (soft-delete: status = 'deleted')
--   shared.branches       (auto-clear manager_id / manager_name)
--   platform.usage_counters (decrement max_users counter)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART A: DROP old app.* & public.* delete functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.delete_user_atomic(uuid, uuid)        CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_atomic(uuid, uuid)     CASCADE;

-- also drop any variant with 3 params just in case
DROP FUNCTION IF EXISTS app.delete_user_atomic(uuid, uuid, text)  CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_atomic(uuid, uuid, text) CASCADE;


-- ---------------------------------------------------------------------------
-- PART B: CANONICAL FUNCTION – shared.delete_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.delete_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, public, extensions
AS $$
DECLARE
    v_ctx          jsonb;
    v_target       shared.users%ROWTYPE;
    v_role_name    text;
BEGIN

    -- =========================================================================
    -- SECTION 1 — Security & Preconditions (Fail-Fast)
    -- =========================================================================

    -- 1.1  NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is required' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required'    USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 1.2  Tenant access — no branch scope needed for user delete
    PERFORM shared.verify_tenant_access(p_company_id, NULL);

    -- 1.3  Subscription gate
    v_ctx := shared.get_session_context(p_company_id);
    PERFORM shared.check_subscription(v_ctx);

    -- 1.4  Permission gate
    PERFORM shared.check_permission(v_ctx, 'user_delete');


    -- =========================================================================
    -- SECTION 2 — Atomic Core Logic
    -- =========================================================================

    -- 2.1  Lock target user row & confirm existence
    SELECT * INTO v_target
    FROM shared.users
    WHERE id = p_user_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_target.status = 'deleted' THEN
        RAISE EXCEPTION 'User is already deleted' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 2.2  Protect Owner / super_admin — cannot delete these roles
    v_role_name := LOWER(COALESCE(v_target.role_name, ''));
    IF v_role_name IN ('owner', 'super_admin', 'superadmin') THEN
        RAISE EXCEPTION 'Cannot delete an Owner or Super Admin account'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2.3  Self-delete guard — a user cannot delete their own account
    IF auth.uid() IS NOT NULL AND p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2.4  Soft-delete the user
    UPDATE shared.users
    SET
        status     = 'deleted',
        updated_at = NOW()
    WHERE id = p_user_id
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


-- ---------------------------------------------------------------------------
-- PART C: ACL – lock down shared.delete_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION shared.delete_user_atomic(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION shared.delete_user_atomic(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION shared.delete_user_atomic(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION shared.delete_user_atomic(uuid, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- PART D: PUBLIC WRAPPER – public.delete_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared, extensions
AS $$
    SELECT shared.delete_user_atomic(p_company_id, p_user_id);
$$;


-- ---------------------------------------------------------------------------
-- PART E: ACL – lock down public.delete_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.delete_user_atomic(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_user_atomic(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_atomic(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_user_atomic(uuid, uuid) TO service_role;
