-- =============================================================================
-- Migration: 20261127000004_harden_update_branch_atomic.sql
-- Purpose  : Upgrade update_branch_atomic from app schema → shared schema
--            with full 2-section hardened pattern (ACLs, subscription,
--            permission gate, existence check, manager resolution)
-- =============================================================================

-- ─── PART A: DROP OLD FUNCTIONS ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS app.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) CASCADE;

DROP FUNCTION IF EXISTS public.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) CASCADE;

-- ─── PART B: CREATE shared.update_branch_atomic ───────────────────────────────

CREATE OR REPLACE FUNCTION shared.update_branch_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
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
SET search_path = shared, public
AS $$
DECLARE
    v_updated_branch shared.branches%ROWTYPE;
    v_manager_name   text;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 1.1: NULL guards
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id is required');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'branch_id is required');
    END IF;
    IF p_branch_name IS NULL OR trim(p_branch_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch name is required');
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF char_length(trim(p_branch_name)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch name must be 100 characters or fewer');
    END IF;
    IF p_branch_email IS NOT NULL AND char_length(trim(p_branch_email)) > 254 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Email address is too long');
    END IF;
    IF p_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Status must be active or inactive');
    END IF;

    -- Step 1.3: Tenant security
    PERFORM shared.verify_tenant_access(p_company_id);

    -- Step 1.4: Subscription gate
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission gate
    PERFORM shared.check_permission(p_company_id, 'branch_update');

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 2.1: Existence check with FOR UPDATE lock
    IF NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id = p_branch_id
          AND company_id = p_company_id
          AND status <> 'deleted'
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch not found or access denied');
    END IF;

    -- Step 2.2: Duplicate name check (against OTHER branches of same company)
    IF EXISTS (
        SELECT 1 FROM shared.branches
        WHERE company_id  = p_company_id
          AND branch_id  <> p_branch_id
          AND lower(trim(branch_name)) = lower(trim(p_branch_name))
          AND status     <> 'deleted'
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Another branch with this name already exists');
    END IF;

    -- Step 2.3: Optional manager verification & name resolution
    IF p_manager_user_id IS NOT NULL THEN
        SELECT name INTO v_manager_name
        FROM shared.users
        WHERE user_id    = p_manager_user_id
          AND company_id = p_company_id
          AND status    <> 'deleted'
        LIMIT 1;

        IF v_manager_name IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Selected manager not found in this company');
        END IF;
    ELSE
        v_manager_name := NULL;
    END IF;

    -- Step 2.4: UPDATE shared.branches
    UPDATE shared.branches SET
        branch_name     = trim(p_branch_name),
        branch_phone    = p_branch_phone,
        branch_email    = p_branch_email,
        branch_code     = p_branch_code,
        manager_id      = p_manager_user_id,
        manager_name    = v_manager_name,
        address_line_1  = p_address_line_1,
        address_line_2  = p_address_line_2,
        locality_area   = p_locality_area,
        landmark        = p_landmark,
        city            = p_city,
        district        = p_district,
        state           = p_state,
        pin_code        = p_pin_code,
        country         = COALESCE(p_country, 'India'),
        branch_address  = p_branch_address,
        google_maps_url = p_google_maps_url,
        latitude        = p_latitude,
        longitude       = p_longitude,
        status          = p_status,
        updated_at      = now()
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
    RETURNING * INTO v_updated_branch;

    -- Step 2.5: Return success with updated branch data
    RETURN to_jsonb(v_updated_branch) || jsonb_build_object('success', true);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', SQLERRM
        );
END;
$$;

-- ─── PART C: ACL on shared.update_branch_atomic ───────────────────────────────

REVOKE ALL ON FUNCTION shared.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION shared.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) FROM anon;

GRANT EXECUTE ON FUNCTION shared.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) TO authenticated, service_role;

-- ─── PART D: CREATE public.update_branch_atomic (thin wrapper) ────────────────

CREATE OR REPLACE FUNCTION public.update_branch_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
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
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.update_branch_atomic(
        p_company_id, p_branch_id, p_branch_name, p_branch_phone,
        p_branch_email, p_branch_code, p_manager_user_id,
        p_address_line_1, p_address_line_2, p_locality_area, p_landmark,
        p_city, p_district, p_state, p_pin_code, p_country,
        p_branch_address, p_google_maps_url, p_latitude, p_longitude,
        p_status
    );
END;
$$;

-- ─── PART E: ACL on public.update_branch_atomic ───────────────────────────────

REVOKE ALL ON FUNCTION public.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_branch_atomic(
    uuid, uuid, text, text, text, text, uuid,
    text, text, text, text, text, text, text, text, text,
    text, text, numeric, numeric, text
) TO authenticated, service_role;
