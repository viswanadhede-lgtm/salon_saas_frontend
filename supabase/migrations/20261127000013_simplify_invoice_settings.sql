-- ============================================================
-- Migration: Simplify invoice_settings
-- Drop old 4-column table + RPCs, rebuild with single
-- print_format jsonb column.
-- ============================================================

-- ── Drop old RPCs ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_invoice_settings_atomic(uuid, uuid, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS app.save_invoice_settings_atomic(uuid, uuid, jsonb, jsonb, jsonb, jsonb);

-- ── Drop old table (no data yet) ──────────────────────────────
DROP TABLE IF EXISTS app.invoice_settings;

-- ── Recreate table (simple) ───────────────────────────────────
CREATE TABLE app.invoice_settings (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid        NOT NULL,
    branch_id       uuid        NOT NULL,
    print_format    jsonb       NOT NULL DEFAULT '{"layout":"a4"}',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    CONSTRAINT invoice_settings_company_branch_key UNIQUE (company_id, branch_id)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE app.invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_invoice_settings
    ON app.invoice_settings
    FOR SELECT
    TO anon, authenticated
    USING (shared.verify_tenant_access(company_id, NULL::uuid));

-- ── Table grants ──────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON app.invoice_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.invoice_settings TO anon;
GRANT ALL ON app.invoice_settings TO service_role;

-- ============================================================
-- SECTION 1 — SECURITY
-- SECTION 2 — CORE LOGIC
-- (app schema implementation, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION app.save_invoice_settings_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_print_format  jsonb
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

    -- 3. Validate print_format is a jsonb object
    IF p_print_format IS NULL
       OR jsonb_typeof(p_print_format) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_print_format must be a JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ── SECTION 2: CORE LOGIC ────────────────────────────────

    INSERT INTO app.invoice_settings (
        company_id, branch_id, print_format, created_at, updated_at
    )
    VALUES (
        p_company_id, p_branch_id, p_print_format, now(), now()
    )
    ON CONFLICT (company_id, branch_id)
    DO UPDATE SET
        print_format = EXCLUDED.print_format,
        updated_at   = now();

    RETURN jsonb_build_object('success', true);

EXCEPTION
    WHEN insufficient_privilege OR invalid_parameter_value THEN
        RAISE;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'INTERNAL: Unexpected error in save_invoice_settings_atomic: %', SQLERRM
            USING ERRCODE = 'internal_error';
END;
$$;

-- ── ACLs on app function ──────────────────────────────────────
REVOKE ALL   ON FUNCTION app.save_invoice_settings_atomic(uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.save_invoice_settings_atomic(uuid, uuid, jsonb) TO service_role;

-- ============================================================
-- Public wrapper — called by supabase.rpc() from the frontend
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_invoice_settings_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_print_format  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN app.save_invoice_settings_atomic(
        p_company_id,
        p_branch_id,
        p_print_format
    );
END;
$$;

-- ── ACLs on public wrapper ────────────────────────────────────
REVOKE ALL   ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, jsonb) TO anon;
GRANT  EXECUTE ON FUNCTION public.save_invoice_settings_atomic(uuid, uuid, jsonb) TO service_role;
