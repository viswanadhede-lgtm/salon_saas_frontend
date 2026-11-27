-- ============================================================
-- Migration: Move save_notification_settings_atomic core
-- from shared schema → app schema (correct architecture)
-- public wrapper now calls app.save_notification_settings_atomic
-- ============================================================

-- ── Drop wrong shared impl + old public wrapper ──────────────
DROP FUNCTION IF EXISTS shared.save_notification_settings_atomic(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.save_notification_settings_atomic(uuid, uuid, jsonb);

-- ============================================================
-- SECTION 1 — SECURITY
-- SECTION 2 — CORE LOGIC
-- (app schema implementation, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION app.save_notification_settings_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_system_notifications  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, shared, public, pg_temp
AS $$
DECLARE
    v_caller_uid uuid;
BEGIN
    -- ── SECTION 1: SECURITY ──────────────────────────────────

    -- 1. Require an authenticated session
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: No authenticated session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Validate required UUID params
    IF p_company_id IS NULL OR p_branch_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_company_id and p_branch_id are required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 3. Validate p_system_notifications is a jsonb object (not null, not array)
    IF p_system_notifications IS NULL
       OR jsonb_typeof(p_system_notifications) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_system_notifications must be a JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Company membership + branch ownership checks deferred (TODO)

    -- ── SECTION 2: CORE LOGIC ────────────────────────────────

    INSERT INTO app.notification_settings (
        company_id,
        branch_id,
        system_notifications,
        created_at,
        updated_at
    )
    VALUES (
        p_company_id,
        p_branch_id,
        p_system_notifications,
        now(),
        now()
    )
    ON CONFLICT (company_id, branch_id)
    DO UPDATE SET
        system_notifications = EXCLUDED.system_notifications,
        updated_at           = now();

    RETURN jsonb_build_object('success', true);

EXCEPTION
    WHEN insufficient_privilege OR invalid_parameter_value THEN
        RAISE;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'INTERNAL: Unexpected error in save_notification_settings_atomic: %', SQLERRM
            USING ERRCODE = 'internal_error';
END;
$$;

-- ── ACLs on app function ─────────────────────────────────────
REVOKE ALL   ON FUNCTION app.save_notification_settings_atomic(uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.save_notification_settings_atomic(uuid, uuid, jsonb) TO service_role;

-- ============================================================
-- Public wrapper — called by supabase.rpc() from the frontend
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_notification_settings_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_system_notifications  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN app.save_notification_settings_atomic(
        p_company_id,
        p_branch_id,
        p_system_notifications
    );
END;
$$;

-- ── ACLs on public wrapper ───────────────────────────────────
REVOKE ALL   ON FUNCTION public.save_notification_settings_atomic(uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.save_notification_settings_atomic(uuid, uuid, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_notification_settings_atomic(uuid, uuid, jsonb) TO service_role;
