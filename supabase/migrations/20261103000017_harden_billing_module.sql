-- =============================================================================
-- Migration 20261103000017: Harden Module 12 (SaaS Billing & Subscriptions)
-- Procedures:
--   app.cancel_subscription_addon_atomic / public.cancel_subscription_addon_atomic
--   app.reactivate_subscription_addon_atomic / public.reactivate_subscription_addon_atomic
--   app.sync_plan_features_atomic / public.sync_plan_features_atomic
--   app.sync_usage_counter_atomic / public.sync_usage_counter_atomic
--   app.backfill_oauth_phone_atomic / public.backfill_oauth_phone_atomic
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. cancel_subscription_addon_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.cancel_subscription_addon_atomic(
  p_company_id uuid,
  p_addon_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_now           timestamptz := NOW();
  v_updated_count integer := 0;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  UPDATE platform.subscription_add_ons
  SET
    status     = 'cancelling',
    updated_at = v_now
  WHERE company_id = p_company_id
    AND addon_id   = p_addon_id
    AND LOWER(COALESCE(status, '')) = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No active add-on found to cancel.';
  END IF;

  RETURN jsonb_build_object(
    'success',  true,
    'message',  'Add-on scheduled for cancellation at cycle end',
    'addon_id', p_addon_id,
    'status',   'cancelling'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_subscription_addon_atomic(
  p_company_id uuid,
  p_addon_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.cancel_subscription_addon_atomic(p_company_id, p_addon_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. reactivate_subscription_addon_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.reactivate_subscription_addon_atomic(
  p_company_id uuid,
  p_addon_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_now           timestamptz := NOW();
  v_updated_count integer := 0;
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  UPDATE platform.subscription_add_ons
  SET
    status     = 'active',
    updated_at = v_now
  WHERE company_id = p_company_id
    AND addon_id   = p_addon_id
    AND LOWER(COALESCE(status, '')) = 'cancelling';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No cancelling add-on found to reactivate.';
  END IF;

  RETURN jsonb_build_object(
    'success',  true,
    'message',  'Add-on reactivated successfully',
    'addon_id', p_addon_id,
    'status',   'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_subscription_addon_atomic(
  p_company_id uuid,
  p_addon_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.reactivate_subscription_addon_atomic(p_company_id, p_addon_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. sync_plan_features_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_plan_features_atomic(
  p_plan_id       uuid,
  p_feature_keys  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_ids uuid[];
  v_primary_id   uuid;
  v_extra_ids    uuid[];
  v_json_text    text := p_feature_keys::text;
BEGIN
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id is required.';
  END IF;

  SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_existing_ids
  FROM platform.plan_features
  WHERE plan_id = p_plan_id;

  IF v_existing_ids IS NOT NULL AND array_length(v_existing_ids, 1) > 0 THEN
    v_primary_id := v_existing_ids[1];

    UPDATE platform.plan_features SET
      feature_key = v_json_text
    WHERE id = v_primary_id;

    IF array_length(v_existing_ids, 1) > 1 THEN
      v_extra_ids := v_existing_ids[2:];
      DELETE FROM platform.plan_features WHERE id = ANY(v_extra_ids);
    END IF;
  ELSE
    INSERT INTO platform.plan_features (
      id, plan_id, feature_key, created_at
    ) VALUES (
      gen_random_uuid(), p_plan_id, v_json_text, NOW()
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'plan_id', p_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_plan_features_atomic(
  p_plan_id       uuid,
  p_feature_keys  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.sync_plan_features_atomic(p_plan_id, p_feature_keys);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. sync_usage_counter_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_usage_counter_atomic(
  p_company_id    uuid,
  p_limit_key     text,
  p_current_count integer DEFAULT NULL,
  p_max_limit     integer DEFAULT NULL,
  p_plan_id       uuid    DEFAULT NULL,
  p_branch_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  IF p_limit_key IS NULL OR TRIM(p_limit_key) = '' THEN
    RAISE EXCEPTION 'limit_key is required.';
  END IF;

  SELECT id INTO v_existing_id
  FROM platform.usage_counters
  WHERE company_id = p_company_id
    AND limit_key  = p_limit_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE platform.usage_counters SET
      current_count = COALESCE(p_current_count, current_count),
      max_limit     = COALESCE(p_max_limit, max_limit),
      plan_id       = COALESCE(p_plan_id, plan_id),
      branch_id     = COALESCE(p_branch_id, branch_id),
      updated_at    = v_now
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO platform.usage_counters (
      id, company_id, branch_id, plan_id,
      limit_key, current_count, max_limit,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_branch_id, p_plan_id,
      p_limit_key, COALESCE(p_current_count, 0), COALESCE(p_max_limit, 9999),
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'company_id',    p_company_id,
    'limit_key',     p_limit_key,
    'current_count', p_current_count,
    'max_limit',     p_max_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_usage_counter_atomic(
  p_company_id    uuid,
  p_limit_key     text,
  p_current_count integer DEFAULT NULL,
  p_max_limit     integer DEFAULT NULL,
  p_plan_id       uuid    DEFAULT NULL,
  p_branch_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.sync_usage_counter_atomic(
    p_company_id, p_limit_key, p_current_count, p_max_limit, p_plan_id, p_branch_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. backfill_oauth_phone_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.backfill_oauth_phone_atomic(
  p_company_id uuid,
  p_user_id    uuid,
  p_phone      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_phone text := NULLIF(TRIM(p_phone), '');
  v_now   timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'phone is required');
  END IF;

  UPDATE shared.users SET
    phone      = v_phone,
    updated_at = v_now
  WHERE user_id = p_user_id AND company_id = p_company_id;

  UPDATE shared.profiles SET
    phone      = v_phone,
    updated_at = v_now
  WHERE user_id = p_user_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_oauth_phone_atomic(
  p_company_id uuid,
  p_user_id    uuid,
  p_phone      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.backfill_oauth_phone_atomic(p_company_id, p_user_id, p_phone);
END;
$$;
