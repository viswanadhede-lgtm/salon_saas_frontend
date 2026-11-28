-- =============================================================================
-- Migration 20261128000005: Consolidate session tracking into one RPC
-- Drops: shared/public.track_user_login_atomic
--        shared/public.track_user_logout_atomic
-- Creates: shared.user_login_logout_metrics + public.* wrapper
-- Params:
--   p_event   text  — 'login' | 'logout'
--   p_user_id uuid  — optional
--   p_email   text  — optional (at least one of user_id / email required)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: Drop the two separate RPCs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS shared.track_user_login_atomic(uuid, text)  CASCADE;
DROP FUNCTION IF EXISTS public.track_user_login_atomic(uuid, text)  CASCADE;
DROP FUNCTION IF EXISTS shared.track_user_logout_atomic(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.track_user_logout_atomic(uuid, text) CASCADE;


-- ---------------------------------------------------------------------------
-- PART B: CANONICAL — shared.user_login_logout_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.user_login_logout_metrics(
    p_event   text,
    p_user_id uuid DEFAULT NULL,
    p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, public, extensions
AS $$
BEGIN
    -- Validate event type
    IF p_event NOT IN ('login', 'logout') THEN
        RAISE EXCEPTION 'p_event must be ''login'' or ''logout'', got: %', p_event
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- At least one identifier required
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_event = 'login' THEN
        IF p_user_id IS NOT NULL THEN
            UPDATE shared.users
            SET last_login_at = NOW(), updated_at = NOW()
            WHERE id = p_user_id;
        ELSE
            UPDATE shared.users
            SET last_login_at = NOW(), updated_at = NOW()
            WHERE LOWER(email) = LOWER(p_email);
        END IF;

    ELSIF p_event = 'logout' THEN
        IF p_user_id IS NOT NULL THEN
            UPDATE shared.users
            SET last_logout_at = NOW(), updated_at = NOW()
            WHERE id = p_user_id;
        ELSE
            UPDATE shared.users
            SET last_logout_at = NOW(), updated_at = NOW()
            WHERE LOWER(email) = LOWER(p_email);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'event', p_event);
END;
$$;

-- ACL
REVOKE ALL ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- PART C: PUBLIC WRAPPER — public.user_login_logout_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_login_logout_metrics(
    p_event   text,
    p_user_id uuid DEFAULT NULL,
    p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared, extensions
AS $$
    SELECT shared.user_login_logout_metrics(p_event, p_user_id, p_email);
$$;

-- ACL
REVOKE ALL ON FUNCTION public.user_login_logout_metrics(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) TO service_role;
