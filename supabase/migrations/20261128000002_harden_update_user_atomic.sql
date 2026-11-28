-- =============================================================================
-- Migration 20261128000002: Harden update_user_atomic & drop toggle_user_status_atomic
-- Module: User Management (IAM)
-- Functions:
--   shared.update_user_atomic / public.update_user_atomic
-- Dropped:
--   app.toggle_user_status_atomic / public.toggle_user_status_atomic
-- Architecture: Two-Tier Standard
--   Section 1 = Security & Preconditions (Fail-Fast)
--   Section 2 = Sequential Atomic Core Logic
-- Tables Written: shared.users, shared.branches (manager_name sync)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART A: DROP old app.* & public.* update / toggle functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) CASCADE;

DROP FUNCTION IF EXISTS app.toggle_user_status_atomic(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.toggle_user_status_atomic(uuid, uuid, text) CASCADE;


-- ---------------------------------------------------------------------------
-- PART B: CANONICAL FUNCTION — shared.update_user_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.update_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid,
    p_name        text,
    p_phone       text    DEFAULT NULL,
    p_email       text    DEFAULT NULL,
    p_role_id     uuid    DEFAULT NULL,
    p_role_name   text    DEFAULT NULL,
    p_branch_id   uuid    DEFAULT NULL,
    p_status      text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name     text := NULLIF(TRIM(p_name), '');
    v_clean_email    text := NULLIF(LOWER(TRIM(p_email)), '');
    v_clean_phone    text := NULLIF(TRIM(p_phone), '');
    v_norm_digits    text;
    v_status         text := COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), 'active');
    v_existing_user  shared.users%ROWTYPE;
    v_role_name      text;
    v_updated_user   shared.users%ROWTYPE;
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
    PERFORM shared.check_permission(p_company_id, 'user_update');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Lock target user row & confirm existence
    SELECT * INTO v_existing_user
    FROM shared.users
    WHERE user_id    = p_user_id
      AND company_id = p_company_id
      AND status     <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Protect Owner / Super Admin accounts from modification
    IF LOWER(TRIM(COALESCE(v_existing_user.role_name, ''))) IN ('owner', 'super_admin') THEN
        RAISE EXCEPTION 'Owner users cannot be modified.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Prevent self-deactivation lockout
    IF auth.uid() IS NOT NULL AND p_user_id = auth.uid() AND v_status = 'inactive' THEN
        RAISE EXCEPTION 'You cannot deactivate your own active account.' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.4: Duplicate email check (against OTHER non-deleted company users)
    PERFORM 1
    FROM shared.users
    WHERE company_id = p_company_id
      AND user_id   <> p_user_id
      AND LOWER(TRIM(email)) = v_clean_email
      AND status    <> 'deleted'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'Another user with email "%" already exists in your company', v_clean_email
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.5: Authoritative role lookup + Owner/Super Admin assignment guard
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

    -- Step 2.6: Optional branch ownership check
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

    -- Step 2.7: Update user record atomically
    UPDATE shared.users SET
        name       = v_clean_name,
        phone      = v_clean_phone,
        email      = v_clean_email,
        role_id    = p_role_id,
        role_name  = v_role_name,
        branch_id  = p_branch_id,
        status     = v_status,
        updated_at = NOW()
    WHERE user_id    = p_user_id
      AND company_id = p_company_id
    RETURNING * INTO v_updated_user;

    -- Step 2.8: Keep cached branch manager_name aligned if this user manages branches
    IF v_existing_user.name IS DISTINCT FROM v_clean_name THEN
        UPDATE shared.branches
        SET manager_name = v_clean_name,
            updated_at   = NOW()
        WHERE company_id = p_company_id
          AND manager_id = p_user_id
          AND status     <> 'deleted';
    END IF;

    -- Return authoritative record (never expose password_hash) + success flag
    RETURN (to_jsonb(v_updated_user) - 'password_hash') || jsonb_build_object('success', true);
END;
$$;


-- ---------------------------------------------------------------------------
-- PART C: ACL — Lock down shared.update_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION shared.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION shared.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- PART D: PUBLIC WRAPPER (1:1 pass-through)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_atomic(
    p_company_id  uuid,
    p_user_id     uuid,
    p_name        text,
    p_phone       text    DEFAULT NULL,
    p_email       text    DEFAULT NULL,
    p_role_id     uuid    DEFAULT NULL,
    p_role_name   text    DEFAULT NULL,
    p_branch_id   uuid    DEFAULT NULL,
    p_status      text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.update_user_atomic(
        p_company_id, p_user_id,  p_name,
        p_phone,      p_email,    p_role_id,
        p_role_name,  p_branch_id, p_status
    );
END;
$$;


-- ---------------------------------------------------------------------------
-- PART E: ACL — Lock down public.update_user_atomic
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_atomic(uuid, uuid, text, text, text, uuid, text, uuid, text) TO authenticated, service_role;
