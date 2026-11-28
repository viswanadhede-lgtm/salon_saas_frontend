-- =============================================================================
-- Migration 20261128000004: Harden session-tracking RPCs
-- Module: User Management (IAM) — Session Tracking
-- Changes:
--   1. Add last_logout_at column to shared.users
--   2. Drop old app.update_user_last_login_atomic / public.*
--   3. Create shared.track_user_login_atomic  + public.* wrapper  (renamed)
--   4. Create shared.track_user_logout_atomic + public.* wrapper  (new)
-- Architecture: Two-Tier Standard (shared.* canonical, public.* wrapper)
-- ACLs: anon revoked, authenticated + service_role granted
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: Add last_logout_at column to shared.users
-- ---------------------------------------------------------------------------
ALTER TABLE shared.users
    ADD COLUMN IF NOT EXISTS last_logout_at timestamptz DEFAULT NULL;


-- ---------------------------------------------------------------------------
-- PART B: Drop old app.* & public.* login tracking functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.update_user_last_login_atomic(uuid, text)    CASCADE;
DROP FUNCTION IF EXISTS public.update_user_last_login_atomic(uuid, text) CASCADE;


-- ---------------------------------------------------------------------------
-- PART C: CANONICAL — shared.track_user_login_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.track_user_login_atomic(
    p_user_id uuid  DEFAULT NULL,
    p_email   text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, public, extensions
AS $$
BEGIN
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_user_id IS NOT NULL THEN
        UPDATE shared.users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        UPDATE shared.users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE LOWER(email) = LOWER(p_email);
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ACL
REVOKE ALL ON FUNCTION shared.track_user_login_atomic(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION shared.track_user_login_atomic(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION shared.track_user_login_atomic(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION shared.track_user_login_atomic(uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- PART D: PUBLIC WRAPPER — public.track_user_login_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_user_login_atomic(
    p_user_id uuid  DEFAULT NULL,
    p_email   text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared, extensions
AS $$
    SELECT shared.track_user_login_atomic(p_user_id, p_email);
$$;

-- ACL
REVOKE ALL ON FUNCTION public.track_user_login_atomic(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.track_user_login_atomic(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.track_user_login_atomic(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.track_user_login_atomic(uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- PART E: CANONICAL — shared.track_user_logout_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.track_user_logout_atomic(
    p_user_id uuid  DEFAULT NULL,
    p_email   text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, public, extensions
AS $$
BEGIN
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_user_id IS NOT NULL THEN
        UPDATE shared.users
        SET last_logout_at = NOW(), updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        UPDATE shared.users
        SET last_logout_at = NOW(), updated_at = NOW()
        WHERE LOWER(email) = LOWER(p_email);
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ACL
REVOKE ALL ON FUNCTION shared.track_user_logout_atomic(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION shared.track_user_logout_atomic(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION shared.track_user_logout_atomic(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION shared.track_user_logout_atomic(uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- PART F: PUBLIC WRAPPER — public.track_user_logout_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_user_logout_atomic(
    p_user_id uuid  DEFAULT NULL,
    p_email   text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared, extensions
AS $$
    SELECT shared.track_user_logout_atomic(p_user_id, p_email);
$$;

-- ACL
REVOKE ALL ON FUNCTION public.track_user_logout_atomic(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.track_user_logout_atomic(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.track_user_logout_atomic(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.track_user_logout_atomic(uuid, text) TO service_role;
