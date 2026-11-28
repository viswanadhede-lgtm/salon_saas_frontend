-- =============================================================================
-- Migration 20261128000006: Enforce two-section pattern on user_login_logout_metrics
-- Section 1 = Security & Preconditions (Fail-Fast)
-- Section 2 = Atomic Core Logic
-- Note: No tenant/subscription/permission gates — this is a lightweight
--       auth-event timestamp write, not a user-facing data mutation.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: CANONICAL — shared.user_login_logout_metrics (two-section hardened)
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

    -- =========================================================================
    -- SECTION 1 — Security & Preconditions (Fail-Fast)
    -- =========================================================================

    -- 1.1  Validate event type — must be exactly 'login' or 'logout'
    IF p_event IS NULL OR p_event NOT IN ('login', 'logout') THEN
        RAISE EXCEPTION 'p_event must be ''login'' or ''logout'', got: %', COALESCE(p_event, 'NULL')
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 1.2  At least one user identifier is required
    IF p_user_id IS NULL AND (p_email IS NULL OR TRIM(p_email) = '') THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;


    -- =========================================================================
    -- SECTION 2 — Atomic Core Logic
    -- =========================================================================

    -- 2.1  Write the appropriate timestamp column based on event type
    IF p_event = 'login' THEN

        IF p_user_id IS NOT NULL THEN
            UPDATE shared.users
            SET last_login_at = NOW(),
                updated_at    = NOW()
            WHERE id = p_user_id;
        ELSE
            UPDATE shared.users
            SET last_login_at = NOW(),
                updated_at    = NOW()
            WHERE LOWER(email) = LOWER(TRIM(p_email));
        END IF;

    ELSE  -- p_event = 'logout'

        IF p_user_id IS NOT NULL THEN
            UPDATE shared.users
            SET last_logout_at = NOW(),
                updated_at     = NOW()
            WHERE id = p_user_id;
        ELSE
            UPDATE shared.users
            SET last_logout_at = NOW(),
                updated_at     = NOW()
            WHERE LOWER(email) = LOWER(TRIM(p_email));
        END IF;

    END IF;

    -- 2.2  Return success with the event echoed back for traceability
    RETURN jsonb_build_object('success', true, 'event', p_event);

END;
$$;

-- ACL (unchanged)
REVOKE ALL ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION shared.user_login_logout_metrics(text, uuid, text) TO service_role;


-- ---------------------------------------------------------------------------
-- PART B: PUBLIC WRAPPER — public.user_login_logout_metrics (unchanged logic)
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

-- ACL (unchanged)
REVOKE ALL ON FUNCTION public.user_login_logout_metrics(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_login_logout_metrics(text, uuid, text) TO service_role;
