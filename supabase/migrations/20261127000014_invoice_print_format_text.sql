-- ============================================================
-- Migration: invoice_settings.print_format jsonb → text
-- Simpler: just store "a4", "thermal_80", or "thermal_58"
-- Drop/recreate RPCs with text param
-- ============================================================

ALTER TABLE app.invoice_settings ALTER COLUMN print_format TYPE text USING (print_format->>'layout');
ALTER TABLE app.invoice_settings ALTER COLUMN print_format SET DEFAULT 'a4';

DROP FUNCTION IF EXISTS public.save_invoice_settings_atomic(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS app.save_invoice_settings_atomic(uuid, uuid, jsonb);

-- ── app function (SECURITY DEFINER) ──────────────────────────
CREATE OR REPLACE FUNCTION app.save_invoice_settings_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_print_format  text
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

    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: No authenticated session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_company_id IS NULL OR p_branch_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_company_id and p_branch_id are required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_print_format IS NULL OR trim(p_print_format) = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_print_format is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ── SECTION 2: CORE LOGIC ────────────────────────────────

    INSERT INTO app.invoice_settings (company_id, branch_id, print_format, created_at, updated_at)
    VALUES (p_company_id, p_branch_id, p_print_format, now(), now())
    ON CONFLICT (company_id, branch_id)
    DO UPDATE SET
        print_format = EXCLUDED.print_format,
        updated_at   = now();

    RETURN jsonb_build_object('success', true);

EXCEPTION
    WHEN insufficient_privilege OR invalid_parameter_value THEN RAISE;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'INTERNAL: %', SQLERRM USING ERRCODE = 'internal_error';
END;
$$;

REVOKE ALL   ON FUNCTION app.save_invoice_settings_atomic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.save_invoice_settings_atomic(uuid, uuid, text) TO service_role;

-- ── public wrapper (SECURITY DEFINER) ────────────────────────
CREATE OR REPLACE FUNCTION public.save_invoice_settings_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_print_format  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN app.save_invoice_settings_atomic(p_company_id, p_branch_id, p_print_format);
END;
$$;

REVOKE ALL   ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, text) TO service_role;
