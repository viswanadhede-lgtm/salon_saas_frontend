-- =============================================================================
-- Migration: 20261115000009_harden_update_staff_atomic.sql
-- Module: Staff Management (Page 1 - Staff)
-- Target: app.update_staff_atomic and public.update_staff_atomic
-- Architecture: Two-Tier Standard (Section 1 = Security & Preconditions, Section 2 = Core Logic)
-- Tables Written: app.staff (UPDATE)
-- =============================================================================

-- Drop existing functions to allow signature update if needed
DROP FUNCTION IF EXISTS public.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS app.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) CASCADE;

-- =============================================================================
-- CANONICAL FUNCTION: app.update_staff_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.update_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_staff_name       text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT NULL,
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name      text := CASE WHEN p_staff_name IS NOT NULL THEN trim(p_staff_name) ELSE NULL END;
    v_norm_phone      text := CASE WHEN p_phone IS NOT NULL THEN regexp_replace(p_phone, '\D', '', 'g') ELSE NULL END;
    v_clean_email     text := CASE WHEN p_email IS NOT NULL THEN NULLIF(lower(trim(p_email)), '') ELSE NULL END;
    v_status          text := CASE WHEN p_status IS NOT NULL THEN lower(trim(p_status)) ELSE NULL END;
    v_existing_staff  app.staff%ROWTYPE;
    v_updated_staff   app.staff%ROWTYPE;
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
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'staff_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF p_staff_name IS NOT NULL THEN
        IF v_clean_name = '' THEN
            RAISE EXCEPTION 'Staff name cannot be empty' USING ERRCODE = 'P0001';
        END IF;
        IF length(v_clean_name) > 150 THEN
            RAISE EXCEPTION 'Staff name cannot exceed 150 characters' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF p_phone IS NOT NULL THEN
        IF length(v_norm_phone) < 7 THEN
            RAISE EXCEPTION 'A valid phone number with at least 7 digits is required' USING ERRCODE = 'P0001';
        END IF;
        IF length(v_norm_phone) > 15 THEN
            RAISE EXCEPTION 'Phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive', 'on-leave') THEN
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
    PERFORM shared.check_permission(p_company_id, 'update_staff');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Pessimistically lock existing staff member
    SELECT * INTO v_existing_staff
    FROM app.staff
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found or does not belong to this branch' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Phone deduplication check if phone changed
    IF v_norm_phone IS NOT NULL AND v_norm_phone <> regexp_replace(COALESCE(v_existing_staff.phone, ''), '\D', '', 'g') THEN
        PERFORM 1
        FROM app.staff
        WHERE company_id = p_company_id
          AND branch_id = p_branch_id
          AND staff_id <> p_staff_id
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
    END IF;

    -- Step 2.3: Atomic Update
    UPDATE app.staff
    SET staff_name       = COALESCE(v_clean_name, staff_name),
        phone            = COALESCE(v_norm_phone, phone),
        email            = CASE WHEN p_email IS NOT NULL THEN v_clean_email ELSE email END,
        role_name        = CASE WHEN p_role_name IS NOT NULL THEN COALESCE(NULLIF(trim(p_role_name), ''), 'Staff') ELSE role_name END,
        services_offered = CASE WHEN p_services_offered IS NOT NULL THEN NULLIF(trim(p_services_offered), '') ELSE services_offered END,
        notes            = CASE WHEN p_notes IS NOT NULL THEN NULLIF(trim(p_notes), '') ELSE notes END,
        status           = COALESCE(v_status, status),
        updated_at       = NOW()
    WHERE staff_id = p_staff_id
      AND company_id = p_company_id
      AND branch_id = p_branch_id
    RETURNING * INTO v_updated_staff;

    -- Return full authoritative record with success boolean for client compatibility
    RETURN to_jsonb(v_updated_staff) || jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_staff_name       text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT NULL,
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_staff_atomic(
        p_company_id,
        p_branch_id,
        p_staff_id,
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
REVOKE EXECUTE ON FUNCTION public.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_staff_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

