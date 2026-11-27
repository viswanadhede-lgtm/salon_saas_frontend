-- =============================================================================
-- Migration 20261127000002: Fix shared.check_quota & shared.create_branch_atomic
-- Fixes:
--   1. shared.check_quota: query platform.usage_counters using `limit_key`
--      (column `metric_key` does not exist in platform.usage_counters)
--   2. shared.create_branch_atomic:
--      - Step 1.5: use `'branch_create'` permission key matching shared.role_permissions
--      - Step 2.2/2.3: write `manager_id` and `manager_name` matching shared.branches
--        (`manager_user_id` column does not exist in shared.branches)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix shared.check_quota (`metric_key` -> `limit_key`)
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
        RAISE EXCEPTION 'PLAN_LIMIT_REACHED: Company has no plan assigned.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Fetch the plan ceiling from plan_limits
    SELECT limit_value INTO v_max_limit
    FROM platform.plan_limits
    WHERE plan_id   = v_plan_id
      AND limit_key = p_limit_key
    LIMIT 1;

    IF v_max_limit IS NULL THEN
        RETURN;
    END IF;

    -- Fetch current usage from platform.usage_counters (`limit_key`)
    SELECT current_count INTO v_current_count
    FROM platform.usage_counters
    WHERE company_id = p_company_id
      AND limit_key  = p_limit_key
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


-- ---------------------------------------------------------------------------
-- 2. Update shared.create_branch_atomic (`branch_create`, `manager_id`, `manager_name`)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.create_branch_atomic(
    p_company_id      uuid,
    p_branch_name     text,
    p_branch_phone    text,
    p_branch_email    text    DEFAULT NULL,
    p_branch_code     text    DEFAULT NULL,
    p_manager_user_id uuid    DEFAULT NULL,
    p_address_line_1  text    DEFAULT NULL,
    p_address_line_2  text    DEFAULT NULL,
    p_locality_area   text    DEFAULT NULL,
    p_landmark        text    DEFAULT NULL,
    p_city            text    DEFAULT NULL,
    p_district        text    DEFAULT NULL,
    p_state           text    DEFAULT NULL,
    p_pin_code        text    DEFAULT NULL,
    p_country         text    DEFAULT 'India',
    p_branch_address  text    DEFAULT NULL,
    p_google_maps_url text    DEFAULT NULL,
    p_latitude        numeric DEFAULT NULL,
    p_longitude       numeric DEFAULT NULL,
    p_status          text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_new_branch_id uuid   := gen_random_uuid();
    v_clean_name    text   := NULLIF(TRIM(p_branch_name), '');
    v_clean_email   text   := NULLIF(LOWER(TRIM(p_branch_email)), '');
    v_norm_phone    text;
    v_clean_code    text   := NULLIF(TRIM(p_branch_code), '');
    v_status        text   := COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), 'active');
    v_manager_name  text   := NULL;
    v_new_branch    shared.branches%ROWTYPE;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'Branch name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Branch name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_branch_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'A valid phone number with at least 7 digits is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_norm_phone) > 15 THEN
        RAISE EXCEPTION 'Phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_email IS NOT NULL AND length(v_clean_email) > 255 THEN
        RAISE EXCEPTION 'Email cannot exceed 255 characters' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'branch_create');

    -- Step 1.6: SaaS Plan Quota Check
    PERFORM shared.check_quota(p_company_id, 'max_branches');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Duplicate name check with pessimistic locking
    PERFORM 1
    FROM shared.branches
    WHERE company_id = p_company_id
      AND LOWER(branch_name) = LOWER(v_clean_name)
      AND status <> 'deleted'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A branch named "%" already exists in your company', v_clean_name
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Optional manager user verification & resolve authoritative name
    IF p_manager_user_id IS NOT NULL THEN
        SELECT NULLIF(TRIM(name), '') INTO v_manager_name
        FROM shared.users
        WHERE user_id    = p_manager_user_id
          AND company_id = p_company_id
          AND status     <> 'deleted'
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Manager user not found in this company' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.3: Insert new branch record atomically
    INSERT INTO shared.branches (
        branch_id,        company_id,       branch_name,      branch_phone,
        branch_email,     branch_code,      manager_id,       manager_name,
        address_line_1,   address_line_2,   locality_area,    landmark,
        city,             district,         state,            pin_code,
        country,          branch_address,   google_maps_url,
        latitude,         longitude,        status,
        created_at,       updated_at
    ) VALUES (
        v_new_branch_id,  p_company_id,     v_clean_name,     v_norm_phone,
        v_clean_email,    v_clean_code,     p_manager_user_id, v_manager_name,
        NULLIF(TRIM(p_address_line_1),  ''), NULLIF(TRIM(p_address_line_2), ''),
        NULLIF(TRIM(p_locality_area),   ''), NULLIF(TRIM(p_landmark),        ''),
        NULLIF(TRIM(p_city),            ''), NULLIF(TRIM(p_district),         ''),
        NULLIF(TRIM(p_state),           ''), NULLIF(TRIM(p_pin_code),         ''),
        COALESCE(NULLIF(TRIM(p_country), ''), 'India'),
        NULLIF(TRIM(p_branch_address),  ''), NULLIF(TRIM(p_google_maps_url),  ''),
        p_latitude,       p_longitude,      v_status,
        NOW(),            NOW()
    )
    RETURNING * INTO v_new_branch;

    -- Return full authoritative record + success flag for client compatibility
    RETURN to_jsonb(v_new_branch) || jsonb_build_object('success', true);
END;
$$;
