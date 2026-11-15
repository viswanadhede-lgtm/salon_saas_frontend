-- =============================================================================
-- Migration: Harden create_customer_atomic
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Tables written: app.customers
-- =============================================================================

-- Drop public wrapper
DROP FUNCTION IF EXISTS public.create_customer_atomic(uuid, uuid, text, text, text, date, text, text);

-- Drop app function
DROP FUNCTION IF EXISTS app.create_customer_atomic(uuid, uuid, text, text, text, date, text, text);

-- =============================================================================
-- CANONICAL: app.create_customer_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION app.create_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
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
    v_clean_name   text := trim(p_customer_name);
    v_norm_phone   text;
    v_new_cust_id  uuid := gen_random_uuid();
    v_new_cust     app.customers%ROWTYPE;
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

    -- Step 2.1: Duplicate phone check with pessimistic locking
    PERFORM 1
    FROM app.customers
    WHERE company_id = p_company_id
      AND status <> 'deleted'
      AND (
          (length(regexp_replace(customer_phone, '\D', '', 'g')) >= 10 
           AND length(v_norm_phone) >= 10 
           AND RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_norm_phone, 10))
          OR regexp_replace(customer_phone, '\D', '', 'g') = v_norm_phone
      )
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'A customer with this phone number already exists in this company' USING ERRCODE = 'P0001';
    END IF;

    -- Step 2.2: Insert Customer Record
    INSERT INTO app.customers (
        customer_id,
        company_id,
        branch_id,
        customer_name,
        customer_phone,
        customer_email,
        dob,
        tags,
        notes,
        status,
        total_spent,
        created_at,
        updated_at
    ) VALUES (
        v_new_cust_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        v_norm_phone,
        NULLIF(trim(p_customer_email), ''),
        p_dob,
        COALESCE(NULLIF(trim(p_tags), ''), 'new'),
        NULLIF(trim(p_notes), ''),
        'active',
        0.00,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_cust;

    -- Step 2.3: Return JSONB
    RETURN to_jsonb(v_new_cust);
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.create_customer_atomic(uuid, uuid, text, text, text, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.create_customer_atomic(uuid, uuid, text, text, text, date, text, text) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
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
    RETURN app.create_customer_atomic(
        p_company_id,
        p_branch_id,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_dob,
        p_tags,
        p_notes
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_customer_atomic(uuid, uuid, text, text, text, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_customer_atomic(uuid, uuid, text, text, text, date, text, text) TO authenticated, service_role;

