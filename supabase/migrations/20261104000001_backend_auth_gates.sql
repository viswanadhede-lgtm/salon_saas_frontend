-- =============================================================================
-- Migration: 20261104000001_backend_auth_gates.sql
-- Phase A: Backend Zero-Trust Authorization Infrastructure
--
-- Creates 4 building blocks that ALL subsequent RPC hardening migrations
-- will use. No existing RPC is modified in this migration.
--
-- Components:
--   A1. shared.is_subscription_active(sub RECORD)
--         → mirrors evaluateSubscription() JS logic exactly
--   A2. shared.check_permission(p_company_id UUID, p_required_key TEXT)
--         → Gate 2: looks up role_permissions for auth.uid()
--   A3. shared.check_plan_feature(p_company_id UUID, p_required_key TEXT)
--         → Gate 3: looks up plan_features for company's plan_id
--   A4. shared.check_quota(p_company_id UUID, p_limit_key TEXT)
--         → Quota: compares usage_counters vs plan_limits
--   A5. public.get_session_context()
--         → Single RPC the frontend calls on cold start (replaces 3 manager fetches)
--
-- Schema map:
--   shared.users          — user rows (user_id, company_id, role_id, role_name, status)
--   shared.companies      — company rows (company_id, plan_id, status)
--   shared.roles          — role definitions
--   shared.role_permissions — (role_id, company_id, permission_key TEXT / JSON array string)
--   platform.subscriptions  — subscription lifecycle rows
--   platform.plan_features  — (plan_id, feature_key TEXT / JSON array string)
--   platform.plan_limits    — (plan_id, limit_key TEXT, limit_value NUMERIC)
--   platform.usage_counters — (company_id, metric_key TEXT, current_count INT)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A1. shared.is_subscription_active
--     Mirrors the evaluateSubscription() logic from subscription-state-manager.js
--     Returns TRUE if the subscription grants full write access right now.
--     The caller passes a ROW from platform.subscriptions (or a compatible
--     composite record). Uses NO external queries — pure date/status math.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.is_subscription_active(
    p_status            text,
    p_is_trial          boolean,
    p_current_period_end_at  timestamptz,
    p_trial_end_at           timestamptz,
    p_grace_period_end_at    timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_temp
AS $$
DECLARE
    v_now              timestamptz := NOW();
    v_raw_status       text        := LOWER(TRIM(COALESCE(p_status, '')));
    v_is_trial         boolean     := COALESCE(p_is_trial, false) OR v_raw_status = 'trial';
    v_effective_end    timestamptz;
    v_time_valid       boolean;
    v_in_grace         boolean;
BEGIN
    -- Compute effective end date (mirrors JS logic exactly)
    IF v_is_trial THEN
        v_effective_end := COALESCE(p_trial_end_at, p_current_period_end_at);
    ELSE
        v_effective_end := COALESCE(p_current_period_end_at, p_trial_end_at);
    END IF;

    v_time_valid := (v_effective_end IS NULL OR v_effective_end > v_now);
    v_in_grace   := (p_grace_period_end_at IS NOT NULL AND p_grace_period_end_at > v_now);

    -- ── Status evaluation (exact mirror of evaluateSubscription() switch) ──

    IF v_raw_status = 'active' THEN
        RETURN (v_effective_end IS NULL OR v_time_valid);

    ELSIF v_raw_status = 'trial' OR (v_is_trial AND v_raw_status <> 'cancelled') THEN
        RETURN (v_effective_end IS NULL OR v_time_valid);

    ELSIF v_is_trial AND v_raw_status = 'cancelled' THEN
        -- Trial cancelled immediately — no grace period, access revoked now
        RETURN false;

    ELSIF v_raw_status = 'authenticated' THEN
        -- Mandate setup phase: full access
        RETURN true;

    ELSIF v_raw_status = 'pending' THEN
        -- Pending renewal charge: allow if within grace period or period valid
        RETURN (v_in_grace OR v_time_valid);

    ELSIF v_raw_status = 'cancelled' THEN
        -- Paid subscription scheduled for end of cycle: retain until period end
        RETURN v_time_valid;

    ELSIF v_raw_status IN ('paused', 'halted', 'completed') THEN
        RETURN false;

    ELSE
        -- Unknown status fallback
        RETURN v_time_valid;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION shared.is_subscription_active(text, boolean, timestamptz, timestamptz, timestamptz)
    TO authenticated, service_role;

COMMENT ON FUNCTION shared.is_subscription_active IS
    'Gate 1 — Pure date/status math mirror of evaluateSubscription() JS. '
    'Returns TRUE when the tenant has full write access. '
    'IMMUTABLE: no DB calls, deterministic given the same inputs.';


-- ---------------------------------------------------------------------------
-- A2. shared.check_permission
--     Gate 2 — RBAC check.
--     Looks up the calling user's role_permissions row and checks whether
--     the required permission key is present (or the wildcard ''ALL'' is set).
--     Raises EXCEPTION 'PERMISSION_DENIED' if the check fails.
--     Owner/super_admin role_name bypass the DB lookup (always granted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.check_permission(
    p_company_id  uuid,
    p_required_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_uid         uuid := auth.uid();
    v_role        text := auth.role();
    v_user        record;
    v_perm_text   text;
    v_perm_arr    jsonb;
BEGIN
    -- service_role (Edge Functions, admin jobs) always bypasses RBAC
    IF v_role = 'service_role' THEN
        RETURN;
    END IF;

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: No authenticated session.';
    END IF;

    -- Load the calling user's record
    SELECT * INTO v_user
    FROM shared.users
    WHERE user_id = v_uid
      AND company_id = p_company_id
      AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User not found in company.';
    END IF;

    -- Owners and super_admins always have full access (wildcard bypass)
    IF LOWER(COALESCE(v_user.role_name, '')) IN ('owner', 'super_admin') THEN
        RETURN;
    END IF;

    -- Fetch the user's role_permissions row
    SELECT permission_key INTO v_perm_text
    FROM shared.role_permissions
    WHERE role_id   = v_user.role_id
      AND company_id = p_company_id
      AND LOWER(COALESCE(status, '')) = 'active'
    LIMIT 1;

    IF v_perm_text IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: No permission record found for role.';
    END IF;

    -- Parse the JSON text array
    BEGIN
        v_perm_arr := v_perm_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
        -- Malformed permission_key stored: deny by default
        RAISE EXCEPTION 'PERMISSION_DENIED: Malformed permission record.';
    END;

    -- Check for wildcard 'ALL' or the specific required key
    IF v_perm_arr ? 'ALL' OR v_perm_arr ? p_required_key THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'PERMISSION_DENIED: Missing permission: %', p_required_key
        USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION shared.check_permission(uuid, text)
    TO authenticated, service_role;

COMMENT ON FUNCTION shared.check_permission IS
    'Gate 2 — RBAC. Raises PERMISSION_DENIED if auth.uid() lacks the '
    'required permission key for the company. Owner/super_admin bypass the check. '
    'service_role always passes. Use inside every mutation RPC.';


-- ---------------------------------------------------------------------------
-- A3. shared.check_subscription
--     Gate 1 — Subscription state check.
--     Fetches the latest subscription row for the company and calls
--     shared.is_subscription_active(). Raises EXCEPTION if not active.
--     Certain RPCs (billing, support, notifications) are exempt — those callers
--     simply do not call this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.check_subscription(
    p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_role text := auth.role();
    v_sub  record;
BEGIN
    -- service_role always bypasses subscription gate
    IF v_role = 'service_role' THEN
        RETURN;
    END IF;

    -- Fetch the most recent subscription row for this company
    SELECT
        status,
        is_trial,
        current_period_end_at,
        trial_end_at,
        grace_period_end_at
    INTO v_sub
    FROM platform.subscriptions
    WHERE company_id = p_company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SUBSCRIPTION_EXPIRED: No subscription record found for company.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT shared.is_subscription_active(
        v_sub.status,
        v_sub.is_trial,
        v_sub.current_period_end_at,
        v_sub.trial_end_at,
        v_sub.grace_period_end_at
    ) THEN
        RAISE EXCEPTION 'SUBSCRIPTION_EXPIRED: Subscription is not active. Status: %', v_sub.status
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION shared.check_subscription(uuid)
    TO authenticated, service_role;

COMMENT ON FUNCTION shared.check_subscription IS
    'Gate 1 — Subscription. Raises SUBSCRIPTION_EXPIRED if the company''s '
    'latest subscription row is not in a full-access state. '
    'service_role bypasses. Exempt RPCs (billing, support, notifications) '
    'do not call this function at all.';


-- ---------------------------------------------------------------------------
-- A4. shared.check_plan_feature
--     Gate 3 — Plan tier feature check.
--     Looks up the company's plan_id via shared.companies, then checks the
--     platform.plan_features row for that plan to see if the required
--     feature key is present in the JSON array column.
--     Raises EXCEPTION 'PLAN_FEATURE_LOCKED' if not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.check_plan_feature(
    p_company_id  uuid,
    p_required_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_role         text := auth.role();
    v_plan_id      uuid;
    v_feature_text text;
    v_feature_arr  jsonb;
BEGIN
    -- service_role bypasses plan feature gate
    IF v_role = 'service_role' THEN
        RETURN;
    END IF;

    -- Resolve plan_id from the company record
    SELECT plan_id INTO v_plan_id
    FROM shared.companies
    WHERE company_id = p_company_id;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'PLAN_FEATURE_LOCKED: Company has no plan assigned.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Fetch the plan_features row
    SELECT feature_key INTO v_feature_text
    FROM platform.plan_features
    WHERE plan_id = v_plan_id
    LIMIT 1;

    IF v_feature_text IS NULL THEN
        RAISE EXCEPTION 'PLAN_FEATURE_LOCKED: No feature record found for plan.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Parse the JSON text array
    BEGIN
        v_feature_arr := v_feature_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'PLAN_FEATURE_LOCKED: Malformed plan_features record.'
            USING ERRCODE = 'P0001';
    END;

    -- Check if the required feature key is in the array
    IF NOT (v_feature_arr ? p_required_key) THEN
        RAISE EXCEPTION 'PLAN_FEATURE_LOCKED: Feature "%" is not included in your plan.', p_required_key
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION shared.check_plan_feature(uuid, text)
    TO authenticated, service_role;

COMMENT ON FUNCTION shared.check_plan_feature IS
    'Gate 3 — Plan tier. Raises PLAN_FEATURE_LOCKED if the company''s plan '
    'does not include the required feature key. '
    'service_role bypasses. Used for module-level write operations.';


-- ---------------------------------------------------------------------------
-- A5. shared.check_quota
--     Quota Gate — Capacity enforcement for branches, users, and staff.
--     Compares platform.usage_counters[metric_key] vs platform.plan_limits[limit_key].
--     Raises EXCEPTION 'PLAN_LIMIT_REACHED' if the counter >= the limit.
--     Call BEFORE the INSERT in create_branch_atomic, create_user_atomic,
--     create_staff_atomic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.check_quota(
    p_company_id uuid,
    p_limit_key  text   -- 'max_branches' | 'max_users' | 'max_staff'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_role          text := auth.role();
    v_plan_id       uuid;
    v_max_limit     numeric;
    v_current_count bigint;
BEGIN
    -- service_role bypasses quota gate
    IF v_role = 'service_role' THEN
        RETURN;
    END IF;

    -- Resolve plan_id
    SELECT plan_id INTO v_plan_id
    FROM shared.companies
    WHERE company_id = p_company_id;

    IF v_plan_id IS NULL THEN
        -- No plan: deny capacity actions by default
        RAISE EXCEPTION 'PLAN_LIMIT_REACHED: Company has no plan assigned.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Fetch the plan ceiling from plan_limits
    SELECT limit_value INTO v_max_limit
    FROM platform.plan_limits
    WHERE plan_id = v_plan_id
      AND limit_key = p_limit_key
    LIMIT 1;

    IF v_max_limit IS NULL THEN
        -- No limit row found: treat as unlimited (allow)
        RETURN;
    END IF;

    -- Fetch current usage from usage_counters
    -- Note: the column is `metric_key` (confirmed from existing migrations)
    SELECT current_count INTO v_current_count
    FROM platform.usage_counters
    WHERE company_id = p_company_id
      AND metric_key = p_limit_key
    LIMIT 1;

    v_current_count := COALESCE(v_current_count, 0);

    IF v_current_count >= v_max_limit THEN
        RAISE EXCEPTION 'PLAN_LIMIT_REACHED: % limit reached (% / %). Upgrade your plan to add more.',
            p_limit_key, v_current_count, v_max_limit
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION shared.check_quota(uuid, text)
    TO authenticated, service_role;

COMMENT ON FUNCTION shared.check_quota IS
    'Quota Gate — Raises PLAN_LIMIT_REACHED if usage_counters[metric_key] '
    '>= plan_limits[limit_key] for this company''s plan. '
    'Call before INSERT in create_branch_atomic, create_user_atomic, create_staff_atomic. '
    'service_role bypasses.';


-- =============================================================================
-- A6. public.get_session_context
--     The single RPC the frontend calls on cold start.
--     Returns a JSONB blob with the full session context derived entirely from
--     auth.uid() — no localStorage values, no client-supplied IDs.
--     Replaces the 3 separate manager DB fetches (subscription, rbac, plan features).
--
--     Output shape:
--     {
--       "user": { user_id, email, name, role_name, role_id, branch_id, status },
--       "company": { company_id, company_name, plan_id, plan_name, status },
--       "subscription": {
--         "access_level": "full" | "read-only",
--         "status", "is_trial", "current_period_end_at", "trial_end_at",
--         "grace_period_end_at", "days_remaining", "is_expiring_soon",
--         "plan_name", "billing_cycle", "auto_renew", "cancel_at_cycle_end"
--       },
--       "permissions": ["perm_key_1", "perm_key_2", ...] | ["ALL"],
--       "plan_features": ["feature_key_1", "feature_key_2", ...],
--       "plan_limits": { "max_branches": 3, "max_users": 5, "max_staff": 20 },
--       "usage": { "max_branches": 1, "max_users": 2, "max_staff": 8 }
--     }
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_session_context()
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

    -- Compute access_level using Gate 1 logic
    IF v_sub IS NULL THEN
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
    IF v_sub IS NOT NULL THEN
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

    -- ── 7. Load current usage ─────────────────────────────────────────────────
    SELECT jsonb_object_agg(metric_key, current_count) INTO v_usage
    FROM platform.usage_counters
    WHERE company_id = v_user.company_id
      AND metric_key IN ('max_branches', 'max_users', 'max_staff');
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
            'company_name', COALESCE(v_company.name, v_company.company_name),
            'plan_id',      v_company.plan_id,
            'plan_name',    COALESCE(v_sub.plan_name, 'Standard'),
            'status',       v_company.status
        ),
        'subscription', CASE WHEN v_sub IS NULL THEN
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

-- Public passthrough wrapper (called by Supabase JS client as supabase.rpc('get_session_context'))
CREATE OR REPLACE FUNCTION public.get_session_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.get_session_context();
END;
$$;

GRANT EXECUTE ON FUNCTION app.get_session_context()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_session_context() TO authenticated, service_role;

COMMENT ON FUNCTION app.get_session_context IS
    'Single cold-start RPC. Returns the full session context (user, company, '
    'subscription access_level, permissions array, plan_features array, '
    'plan_limits, usage counters) derived entirely from auth.uid(). '
    'The frontend stores this in sessionStorage and uses it for all UX gates. '
    'No client-supplied IDs are trusted — all data is derived server-side.';

-- =============================================================================
-- END OF PHASE A — BACKEND AUTH GATE INFRASTRUCTURE
-- =============================================================================
-- Next: 20261104000002_harden_pos_bookings_gates.sql (Phase B)
--       Adds shared.check_subscription + shared.check_permission calls to:
--       create_pos_sale_atomic, process_pos_refund_atomic,
--       assign_membership_atomic, process_membership_refund_atomic,
--       create_booking_atomic, update_booking_atomic, cancel_booking_atomic,
--       create_branch_atomic (+quota), create_user_atomic (+quota),
--       create_staff_atomic (+quota)
-- =============================================================================
