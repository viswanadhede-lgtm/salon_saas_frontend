-- =============================================================================
-- Migration: 20261115000008_harden_create_staff_atomic.sql
-- Module: Staff Management (Page 1 - Staff)
-- Target: app.create_staff_atomic and public.create_staff_atomic
-- Architecture: Two-Tier Standard (Section 1 = Security & Preconditions, Section 2 = Core Logic)
-- Tables Written: app.staff (INSERT)
-- =============================================================================

-- Drop existing functions to allow signature update if needed
DROP FUNCTION IF EXISTS public.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS app.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.create_staff_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.create_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_name       text,
    p_phone            text,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT 'Staff',
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name   text := trim(p_staff_name);
    v_norm_phone   text;
    v_clean_email  text := NULLIF(lower(trim(p_email)), '');
    v_status       text := COALESCE(NULLIF(lower(trim(p_status)), ''), 'active');
    v_new_staff_id uuid := gen_random_uuid();
    v_new_staff    app.staff%ROWTYPE;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Staff name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Staff name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'A valid phone number with at least 7 digits is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_norm_phone) > 15 THEN
        RAISE EXCEPTION 'Phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
    END IF;

    IF v_status NOT IN ('active', 'inactive', 'on-leave') THEN
        RAISE EXCEPTION 'Status must be active, inactive, or on-leave' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_email IS NOT NULL AND length(v_clean_email) > 255 THEN
        RAISE EXCEPTION 'Email cannot exceed 255 characters' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access.' USING ERRCODE = '42501';
    END IF;

    -- Verify branch belongs to company and is active
    IF NOT EXISTS (
        SELECT 1 FROM shared.branches 
        WHERE branch_id = p_branch_id AND company_id = p_company_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Branch not found or does not belong to this company' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.4: Subscription verification
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission verification
    PERFORM shared.check_permission(p_company_id, 'create_staff');

    -- Step 1.6: SaaS Plan Quota Check
    PERFORM shared.check_quota(p_company_id, 'max_staff');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Duplicate phone check with pessimistic locking
    PERFORM 1
    FROM app.staff
    WHERE company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted'
      AND (
          (length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 10 
           AND length(v_norm_phone) >= 10 
           AND RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = RIGHT(v_norm_phone, 10))
          OR regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_norm_phone
      )
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'Another staff member already uses this phone number in this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Insert new staff record atomically
    INSERT INTO app.staff (
        staff_id,
        company_id,
        branch_id,
        staff_name,
        phone,
        email,
        role_name,
        services_offered,
        notes,
        status,
        joined_at,
        created_at,
        updated_at
    ) VALUES (
        v_new_staff_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        v_norm_phone,
        v_clean_email,
        COALESCE(NULLIF(trim(p_role_name), ''), 'Staff'),
        NULLIF(trim(p_services_offered), ''),
        NULLIF(trim(p_notes), ''),
        v_status,
        CURRENT_DATE,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_staff;

    -- Return full authoritative record with success boolean for client compatibility
    RETURN to_jsonb(v_new_staff) || jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_name       text,
    p_phone            text,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT 'Staff',
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_staff_atomic(
        p_company_id,
        p_branch_id,
        p_staff_name,
        p_phone,
        p_email,
        p_role_name,
        p_services_offered,
        p_notes,
        p_status
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down public wrapper
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_staff_atomic(uuid, uuid, text, text, text, text, text, text, text) TO authenticated, service_role;
