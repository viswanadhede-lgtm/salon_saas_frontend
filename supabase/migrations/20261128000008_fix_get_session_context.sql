-- =============================================================================
-- Migration 20261128000008: Harden & fix get_session_context
-- Fixes why non-Owner users got "Access Restricted" immediately after login:
--   1. platform.usage_counters column is `limit_key`, NOT `metric_key`
--      -> previously threw ERROR 42703: column "metric_key" does not exist
--      -> get_session_context() failed on every login, causing rbac-manager to
--         fall back to an empty [] permission array after login cleared cache,
--         locking out every non-Owner role (Owners bypassed Gate 2/3 in JS).
--   2. shared.companies has no `name` column (`display_name` / `company_name`)
--      -> `v_company.name` would throw "record v_company has no field name".
-- Architecture:
--   Move canonical to shared.get_session_context(), keep public.get_session_context()
--   wrapper, lock ACLs (anon revoked; authenticated + service_role granted).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART A: Drop old app.* & public.* functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.get_session_context()    CASCADE;
DROP FUNCTION IF EXISTS public.get_session_context() CASCADE;


-- ---------------------------------------------------------------------------
-- PART B: CANONICAL — shared.get_session_context()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.get_session_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_uid             uuid := auth.uid();
    v_user            record;
    v_company         record;
    v_sub             record;
    v_has_sub         boolean := false;
    v_perm_text       text;
    v_perm_arr        jsonb;
    v_feature_text    text;
    v_feature_arr     jsonb;
    v_limits          jsonb;
    v_usage           jsonb;
    v_access_level    text;
    v_now             timestamptz := NOW();
    v_effective_end   timestamptz;
    v_days_remaining  integer;
    v_is_expiring     boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: No session found.';
    END IF;

    -- ── 1. Load user record ──────────────────────────────────────────────────
    SELECT * INTO v_user
    FROM shared.users
    WHERE user_id = v_uid
      AND status  = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: User record not found or inactive.';
    END IF;

    -- ── 2. Load company record ───────────────────────────────────────────────
    SELECT * INTO v_company
    FROM shared.companies
    WHERE company_id = v_user.company_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Company record not found.';
    END IF;

    -- ── 3. Load latest subscription row ─────────────────────────────────────
    SELECT
        status,
        is_trial,
        current_period_end_at,
        trial_end_at,
        grace_period_end_at,
        plan_name,
        billing_cycle,
        auto_renew,
        cancel_at_cycle_end,
        billing_amount_minor,
        next_billing_at,
        razorpay_subscription_id
    INTO v_sub
    FROM platform.subscriptions
    WHERE company_id = v_user.company_id
    ORDER BY created_at DESC
    LIMIT 1;
    v_has_sub := FOUND;

    -- Compute access_level using Gate 1 logic
    IF NOT v_has_sub THEN
        v_access_level := 'read-only';
    ELSIF shared.is_subscription_active(
        v_sub.status,
        v_sub.is_trial,
        v_sub.current_period_end_at,
        v_sub.trial_end_at,
        v_sub.grace_period_end_at
    ) THEN
        v_access_level := 'full';
    ELSE
        v_access_level := 'read-only';
    END IF;

    -- Compute days remaining
    IF v_has_sub THEN
        IF COALESCE(v_sub.is_trial, false) THEN
            v_effective_end := COALESCE(v_sub.trial_end_at, v_sub.current_period_end_at);
        ELSE
            v_effective_end := COALESCE(v_sub.current_period_end_at, v_sub.trial_end_at);
        END IF;
    END IF;

    IF v_effective_end IS NOT NULL AND v_effective_end > v_now THEN
        v_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_effective_end - v_now)) / 86400))::integer;
    ELSE
        v_days_remaining := 0;
    END IF;

    v_is_expiring := (v_days_remaining > 0 AND v_days_remaining <= 5);

    -- ── 4. Load role permissions ─────────────────────────────────────────────
    -- Owner/super_admin → wildcard ['ALL']
    IF LOWER(COALESCE(v_user.role_name, '')) IN ('owner', 'super_admin') THEN
        v_perm_arr := '["ALL"]'::jsonb;
    ELSE
        SELECT permission_key INTO v_perm_text
        FROM shared.role_permissions
        WHERE role_id    = v_user.role_id
          AND company_id = v_user.company_id
          AND LOWER(COALESCE(status, '')) = 'active'
        LIMIT 1;

        IF v_perm_text IS NOT NULL THEN
            BEGIN
                v_perm_arr := v_perm_text::jsonb;
            EXCEPTION WHEN OTHERS THEN
                v_perm_arr := '[]'::jsonb;
            END;
        ELSE
            v_perm_arr := '[]'::jsonb;
        END IF;
    END IF;

    -- ── 5. Load plan features ─────────────────────────────────────────────────
    IF v_company.plan_id IS NOT NULL THEN
        SELECT feature_key INTO v_feature_text
        FROM platform.plan_features
        WHERE plan_id = v_company.plan_id
        LIMIT 1;

        IF v_feature_text IS NOT NULL THEN
            BEGIN
                v_feature_arr := v_feature_text::jsonb;
            EXCEPTION WHEN OTHERS THEN
                v_feature_arr := '[]'::jsonb;
            END;
        ELSE
            v_feature_arr := '[]'::jsonb;
        END IF;
    ELSE
        v_feature_arr := '[]'::jsonb;
    END IF;

    -- ── 6. Load plan limits ───────────────────────────────────────────────────
    IF v_company.plan_id IS NOT NULL THEN
        SELECT jsonb_object_agg(limit_key, limit_value) INTO v_limits
        FROM platform.plan_limits
        WHERE plan_id = v_company.plan_id
          AND limit_key IN ('max_branches', 'max_users', 'max_staff');
    END IF;
    v_limits := COALESCE(v_limits, '{}'::jsonb);

    -- ── 7. Load current usage (column is limit_key, not metric_key) ──────────
    SELECT jsonb_object_agg(limit_key, current_count) INTO v_usage
    FROM platform.usage_counters
    WHERE company_id = v_user.company_id
      AND limit_key IN ('max_branches', 'max_users', 'max_staff');
    v_usage := COALESCE(v_usage, '{}'::jsonb);

    -- ── 8. Build and return the context blob ─────────────────────────────────
    RETURN jsonb_build_object(
        'user', jsonb_build_object(
            'user_id',   v_user.user_id,
            'name',      v_user.name,
            'email',     v_user.email,
            'role_name', v_user.role_name,
            'role_id',   v_user.role_id,
            'branch_id', v_user.branch_id,
            'status',    v_user.status
        ),
        'company', jsonb_build_object(
            'company_id',   v_company.company_id,
            'company_name', COALESCE(v_company.display_name, v_company.company_name),
            'plan_id',      v_company.plan_id,
            'plan_name',    COALESCE(v_sub.plan_name, v_company.plan_name, 'Standard'),
            'status',       v_company.status
        ),
        'subscription', CASE WHEN NOT v_has_sub THEN
            jsonb_build_object(
                'access_level', 'read-only',
                'status', 'none',
                'is_trial', false,
                'days_remaining', 0,
                'is_expiring_soon', false
            )
        ELSE
            jsonb_build_object(
                'access_level',           v_access_level,
                'status',                 v_sub.status,
                'is_trial',               COALESCE(v_sub.is_trial, false),
                'current_period_end_at',  v_sub.current_period_end_at,
                'trial_end_at',           v_sub.trial_end_at,
                'grace_period_end_at',    v_sub.grace_period_end_at,
                'days_remaining',         v_days_remaining,
                'is_expiring_soon',       v_is_expiring,
                'plan_name',              v_sub.plan_name,
                'billing_cycle',          v_sub.billing_cycle,
                'auto_renew',             COALESCE(v_sub.auto_renew, true),
                'cancel_at_cycle_end',    COALESCE(v_sub.cancel_at_cycle_end, false),
                'next_billing_at',        v_sub.next_billing_at,
                'razorpay_subscription_id', v_sub.razorpay_subscription_id
            )
        END,
        'permissions',    v_perm_arr,
        'plan_features',  v_feature_arr,
        'plan_limits',    v_limits,
        'usage',          v_usage
    );
END;
$$;

REVOKE ALL ON FUNCTION shared.get_session_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION shared.get_session_context() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART C: PUBLIC WRAPPER — public.get_session_context()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_context()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, shared
AS $$
    SELECT shared.get_session_context();
$$;

REVOKE ALL ON FUNCTION public.get_session_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_session_context() TO authenticated, service_role;
