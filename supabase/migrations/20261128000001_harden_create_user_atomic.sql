-- =============================================================================
-- Migration 20261128000001: Harden create_user_atomic — Move core to shared schema
-- Module: User Management (IAM)
-- Functions:
--   shared.create_user_atomic / public.create_user_atomic
-- Architecture: Two-Tier Standard
--   Section 1 = Security & Preconditions (Fail-Fast)
--   Section 2 = Sequential Atomic Core Logic
-- Tables Written: shared.users, platform.usage_counters
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART A: DROP old app.* & public.* functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) CASCADE;


-- ---------------------------------------------------------------------------
-- PART B: CANONICAL FUNCTION — shared.create_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.create_user_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_user_id     uuid,
    p_name        text,
    p_email       text,
    p_phone       text    DEFAULT NULL,
    p_role_id     uuid    DEFAULT NULL,
    p_role_name   text    DEFAULT NULL,
    p_status      text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name   text := NULLIF(TRIM(p_name), '');
    v_clean_email  text := NULLIF(LOWER(TRIM(p_email)), '');
    v_clean_phone  text := NULLIF(TRIM(p_phone), '');
    v_norm_digits  text;
    v_status       text := COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), 'active');
    v_role_name    text;
    v_new_user     shared.users%ROWTYPE;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_role_id IS NULL THEN
        RAISE EXCEPTION 'Role selection is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'Full name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Full name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_email IS NULL THEN
        RAISE EXCEPTION 'Email address is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_email) > 255 OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'A valid email address is required' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_phone IS NOT NULL THEN
        v_norm_digits := regexp_replace(v_clean_phone, '\D', '', 'g');
        IF length(v_norm_digits) < 7 OR length(v_norm_digits) > 15 OR length(v_clean_phone) > 30 THEN
            RAISE EXCEPTION 'Phone number must contain between 7 and 15 digits' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status must be active or inactive' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'user_create');

    -- Step 1.6: SaaS Plan Quota Check
    PERFORM shared.check_quota(p_company_id, 'max_users');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Guard against duplicate user_id or duplicate email with locking
    PERFORM 1
    FROM shared.users
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A user profile already exists for this account'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1
    FROM shared.users
    WHERE company_id = p_company_id
      AND LOWER(TRIM(email)) = v_clean_email
      AND status <> 'deleted'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A user with email "%" already exists in your company', v_clean_email
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Authoritative role lookup + Owner/Super Admin role protection
    SELECT role_name INTO v_role_name
    FROM shared.roles
    WHERE role_id    = p_role_id
      AND company_id = p_company_id
      AND status     <> 'deleted'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected role not found or inactive.' USING ERRCODE = 'P0001';
    END IF;

    IF LOWER(TRIM(COALESCE(v_role_name, ''))) IN ('owner', 'super_admin')
       OR LOWER(TRIM(COALESCE(p_role_name, ''))) IN ('owner', 'super_admin') THEN
        RAISE EXCEPTION 'Owner is a protected role and cannot be assigned.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Optional branch verification
    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM shared.branches
            WHERE branch_id  = p_branch_id
              AND company_id = p_company_id
              AND status     <> 'deleted'
        ) THEN
            RAISE EXCEPTION 'Selected branch not found in this company.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.4: Insert user record atomically
    INSERT INTO shared.users (
        user_id,    company_id, branch_id,
        name,       email,      phone,
        role_id,    role_name,  status,
        created_at, updated_at
    ) VALUES (
        p_user_id,     p_company_id, p_branch_id,
        v_clean_name,  v_clean_email, v_clean_phone,
        p_role_id,     v_role_name,  v_status,
        NOW(),         NOW()
    )
    RETURNING * INTO v_new_user;

    -- Step 2.5: Increment max_users usage counter
    UPDATE platform.usage_counters
    SET current_count = COALESCE(current_count, 0) + 1,
        updated_at    = NOW()
    WHERE company_id = p_company_id
      AND limit_key  = 'max_users';

    -- Return authoritative record (never expose password_hash) + success flag
    RETURN (to_jsonb(v_new_user) - 'password_hash') || jsonb_build_object('success', true);
END;
$$;


-- ---------------------------------------------------------------------------
-- PART C: ACL — Lock down shared.create_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION shared.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION shared.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART D: PUBLIC WRAPPER (1:1 pass-through)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_user_id     uuid,
    p_name        text,
    p_email       text,
    p_phone       text    DEFAULT NULL,
    p_role_id     uuid    DEFAULT NULL,
    p_role_name   text    DEFAULT NULL,
    p_status      text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.create_user_atomic(
        p_company_id, p_branch_id, p_user_id,
        p_name,       p_email,     p_phone,
        p_role_id,    p_role_name, p_status
    );
END;
$$;


-- ---------------------------------------------------------------------------
-- PART E: ACL — Lock down public.create_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_user_atomic(uuid, uuid, uuid, text, text, text, uuid, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART F: Reconcile max_users usage_counters against actual non-deleted rows
-- ---------------------------------------------------------------------------
UPDATE platform.usage_counters uc
SET current_count = COALESCE((
        SELECT COUNT(*)
        FROM shared.users u
        WHERE u.company_id = uc.company_id
          AND u.status <> 'deleted'
    ), 0),
    updated_at = NOW()
WHERE uc.limit_key = 'max_users';
