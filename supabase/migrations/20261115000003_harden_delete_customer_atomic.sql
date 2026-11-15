-- =============================================================================
-- Migration: Harden delete_customer_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.customers
-- =============================================================================

-- Drop public wrapper
DROP FUNCTION IF EXISTS public.delete_customer_atomic(uuid, uuid, uuid);

-- Drop app function
DROP FUNCTION IF EXISTS app.delete_customer_atomic(uuid, uuid, uuid);

-- =============================================================================
-- CANONICAL: app.delete_customer_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.delete_customer_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
DECLARE
    v_cust_name           text;
    v_active_bookings     integer := 0;
    v_active_memberships  integer := 0;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory' USING ERRCODE = 'P0001';
    END IF;
    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant access verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Step 1.3: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission check
    PERFORM shared.check_permission(p_company_id, 'customers_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Lock & verify target customer
    SELECT customer_name
    INTO v_cust_name
    FROM app.customers
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or already deleted' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Blocker 1 — Active or upcoming bookings (strictly using booking_status)
    SELECT COUNT(*) INTO v_active_bookings
    FROM app.bookings
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND booking_status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_active_bookings > 0 THEN
        RAISE EXCEPTION 'Cannot delete customer "%". They have % active or upcoming booking(s).'
            , v_cust_name, v_active_bookings
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.3: Blocker 2 — Active memberships
    SELECT COUNT(*) INTO v_active_memberships
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

    IF v_active_memberships > 0 THEN
        RAISE EXCEPTION 'Cannot delete customer "%". They hold % active membership(s).'
            , v_cust_name, v_active_memberships
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.4: Atomically soft-delete customer
    UPDATE app.customers
    SET status     = 'deleted',
        updated_at = NOW()
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id;

    -- Step 2.5: Return JSONB
    RETURN jsonb_build_object(
        'success',     true,
        'customer_id', p_customer_id,
        'status',      'deleted'
    );
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.delete_customer_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.delete_customer_atomic(uuid, uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_customer_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN app.delete_customer_atomic(
        p_company_id,
        p_branch_id,
        p_customer_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_customer_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_customer_atomic(uuid, uuid, uuid) TO authenticated, service_role;

