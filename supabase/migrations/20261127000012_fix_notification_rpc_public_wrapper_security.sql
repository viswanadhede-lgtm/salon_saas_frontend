-- ============================================================
-- Migration: Fix public.save_notification_settings_atomic
-- ROOT CAUSE: public wrapper was SECURITY INVOKER, so when an
-- authenticated user called it, Postgres tried to call
-- app.save_notification_settings_atomic as that user — but
-- app.fn only has EXECUTE for service_role, causing the
-- "permission denied for function" error.
-- FIX: Change public wrapper to SECURITY DEFINER so it always
-- runs as its owner (postgres) which has EXECUTE on app.fn.
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_notification_settings_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_system_notifications  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER                          -- ← was INVOKER; now runs as owner (postgres)
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
GRANT  EXECUTE ON FUNCTION public.save_notification_settings_atomic(uuid, uuid, jsonb) TO anon;
GRANT  EXECUTE ON FUNCTION public.save_notification_settings_atomic(uuid, uuid, jsonb) TO service_role;
