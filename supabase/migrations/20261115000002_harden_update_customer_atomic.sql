-- =============================================================================
-- Migration: Harden update_customer_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.customers
-- =============================================================================

-- Drop public wrapper
DROP FUNCTION IF EXISTS public.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text);

-- Drop app function
DROP FUNCTION IF EXISTS app.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text);

-- =============================================================================
-- CANONICAL: app.update_customer_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.update_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_customer_id    uuid,
    p_customer_name   text,
    p_customer_phone  text,
    p_customer_email  text DEFAULT NULL,
    p_dob             date DEFAULT NULL,
    p_tags            text DEFAULT NULL,
    p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
DECLARE
    v_clean_name    text := trim(p_customer_name);
    v_norm_phone    text;
    v_old_name      text;
    v_old_phone     text;
    v_updated_cust  app.customers%ROWTYPE;
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

    -- Step 1.2: Field bounds & domain validation
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Customer name is required' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Customer name cannot exceed 150 characters' USING ERRCODE = 'P0001';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'Customer phone number must contain at least 7 digits' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_norm_phone) > 15 THEN
        RAISE EXCEPTION 'Customer phone number cannot exceed 15 digits' USING ERRCODE = 'P0001';
    END IF;

    IF p_dob IS NOT NULL AND p_dob > CURRENT_DATE THEN
        RAISE EXCEPTION 'Date of birth cannot be in the future' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.3: Tenant access verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Step 1.4: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission check
    PERFORM shared.check_permission(p_company_id, 'customers_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    -- Step 2.1: Lock & verify target customer
    SELECT customer_name, customer_phone
    INTO v_old_name, v_old_phone
    FROM app.customers
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND status <> 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or access denied' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Duplicate phone check against other active customers (if phone changed)
    IF v_norm_phone <> v_old_phone THEN
        PERFORM 1
        FROM app.customers
        WHERE company_id = p_company_id
          AND customer_id <> p_customer_id
          AND status <> 'deleted'
          AND (
              (length(regexp_replace(customer_phone, '\D', '', 'g')) >= 10 
               AND length(v_norm_phone) >= 10 
               AND RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_norm_phone, 10))
              OR regexp_replace(customer_phone, '\D', '', 'g') = v_norm_phone
          )
        FOR UPDATE;

        IF FOUND THEN
            RAISE EXCEPTION 'Another customer with this phone number already exists in this company' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Step 2.3: Update Customer Record (preserving total_spent, last_visit, status)
    UPDATE app.customers
    SET
        customer_name  = v_clean_name,
        customer_phone = v_norm_phone,
        customer_email = NULLIF(trim(p_customer_email), ''),
        dob            = p_dob,
        tags           = NULLIF(trim(p_tags), ''),
        notes          = NULLIF(trim(p_notes), ''),
        updated_at     = NOW()
    WHERE customer_id  = p_customer_id
      AND company_id   = p_company_id
    RETURNING * INTO v_updated_cust;

    -- Step 2.4: Return JSONB
    RETURN to_jsonb(v_updated_cust);
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_customer_id    uuid,
    p_customer_name   text,
    p_customer_phone  text,
    p_customer_email  text DEFAULT NULL,
    p_dob             date DEFAULT NULL,
    p_tags            text DEFAULT NULL,
    p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN app.update_customer_atomic(
        p_company_id,
        p_branch_id,
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_dob,
        p_tags,
        p_notes
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_customer_atomic(uuid, uuid, uuid, text, text, text, date, text, text) TO authenticated, service_role;

