-- ============================================================================
-- Migration: 20261103000011_harden_customers_module.sql
-- Module 6: Customers & CRM (Zero-Trust Backend-First Hardening)
--
-- Procedures Defined:
--   1. app.create_customer_atomic (wrapped by public.create_customer_atomic)
--   2. app.update_customer_atomic (wrapped by public.update_customer_atomic)
--   3. app.delete_customer_atomic (wrapped by public.delete_customer_atomic)
--   4. app.submit_customer_review_atomic (wrapped by public.submit_customer_review_atomic)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING SIGNATURES FOR CLEAN RE-CREATION
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_customer_atomic CASCADE;
DROP FUNCTION IF EXISTS public.submit_customer_review_atomic CASCADE;
DROP FUNCTION IF EXISTS app.submit_customer_review_atomic CASCADE;

-- ----------------------------------------------------------------------------
-- 2. CREATE CUSTOMER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_email text DEFAULT NULL,
    p_dob date DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_norm_phone text;
    v_existing_id uuid;
    v_new_cust app.customers%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Basic Validations
    IF TRIM(COALESCE(p_customer_name, '')) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'Customer phone number must contain at least 7 digits.';
    END IF;

    -- Duplicate Phone Check (scoped to company, ignoring deleted customers)
    SELECT customer_id INTO v_existing_id
    FROM app.customers
    WHERE company_id = p_company_id
      AND status != 'deleted'
      AND (
          (length(regexp_replace(customer_phone, '\D', '', 'g')) >= 10 AND length(v_norm_phone) >= 10 AND RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_norm_phone, 10))
          OR regexp_replace(customer_phone, '\D', '', 'g') = v_norm_phone
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'A customer with this phone number already exists in this company.';
    END IF;

    -- Insert Customer Record
    INSERT INTO app.customers (
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
        p_company_id,
        p_branch_id,
        TRIM(p_customer_name),
        v_norm_phone,
        NULLIF(TRIM(p_customer_email), ''),
        p_dob,
        COALESCE(NULLIF(TRIM(p_tags), ''), 'new'),
        NULLIF(TRIM(p_notes), ''),
        'active',
        0.00,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_cust;

    RETURN to_jsonb(v_new_cust);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_email text DEFAULT NULL,
    p_dob date DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
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

-- ----------------------------------------------------------------------------
-- 3. UPDATE CUSTOMER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_email text DEFAULT NULL,
    p_dob date DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_norm_phone text;
    v_existing_id uuid;
    v_updated_cust app.customers%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.customers 
        WHERE customer_id = p_customer_id AND company_id = p_company_id AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Customer not found or access denied.';
    END IF;

    -- Basic Validations
    IF TRIM(COALESCE(p_customer_name, '')) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;

    v_norm_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    IF length(v_norm_phone) < 7 THEN
        RAISE EXCEPTION 'Customer phone number must contain at least 7 digits.';
    END IF;

    -- Duplicate Phone Check against other customers in company
    SELECT customer_id INTO v_existing_id
    FROM app.customers
    WHERE company_id = p_company_id
      AND customer_id != p_customer_id
      AND status != 'deleted'
      AND (
          (length(regexp_replace(customer_phone, '\D', '', 'g')) >= 10 AND length(v_norm_phone) >= 10 AND RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_norm_phone, 10))
          OR regexp_replace(customer_phone, '\D', '', 'g') = v_norm_phone
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Another customer with this phone number already exists in this company.';
    END IF;

    -- Update Customer (Authoritative total_spent & last_visit are strictly preserved)
    UPDATE app.customers
    SET
        customer_name  = TRIM(p_customer_name),
        customer_phone = v_norm_phone,
        customer_email = NULLIF(TRIM(p_customer_email), ''),
        dob            = p_dob,
        tags           = NULLIF(TRIM(p_tags), ''),
        notes          = NULLIF(TRIM(p_notes), ''),
        updated_at     = NOW()
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
    RETURNING * INTO v_updated_cust;

    RETURN to_jsonb(v_updated_cust);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_email text DEFAULT NULL,
    p_dob date DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
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

-- ----------------------------------------------------------------------------
-- 4. DELETE CUSTOMER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_cust_name text;
    v_active_bookings integer;
    v_active_memberships integer;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    SELECT customer_name INTO v_cust_name
    FROM app.customers
    WHERE customer_id = p_customer_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or already deleted.';
    END IF;

    -- Blocker 1: Active or Upcoming Bookings
    SELECT COUNT(*) INTO v_active_bookings
    FROM app.bookings
    WHERE customer_id = p_customer_id
      AND company_id = p_company_id
      AND status IN ('booked', 'confirmed')
      AND booking_date >= CURRENT_DATE;

    IF v_active_bookings > 0 THEN
        RAISE EXCEPTION 'Cannot delete customer "%". They have % active or upcoming booking(s).', v_cust_name, v_active_bookings;
    END IF;

    -- Blocker 2: Active Memberships
    SELECT COUNT(*) INTO v_active_memberships
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND company_id = p_company_id
      AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

    IF v_active_memberships > 0 THEN
        RAISE EXCEPTION 'Cannot delete customer "%". They hold % active membership(s).', v_cust_name, v_active_memberships;
    END IF;

    -- Soft Delete
    UPDATE app.customers
    SET status = 'deleted',
        updated_at = NOW()
    WHERE customer_id = p_customer_id
      AND company_id = p_company_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_customer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_customer_atomic(
        p_company_id,
        p_branch_id,
        p_customer_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SUBMIT CUSTOMER REVIEW ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.submit_customer_review_atomic(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_rating integer DEFAULT NULL,
    p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_review_rec shared.reviews%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Validations
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required to submit a review.';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Review rating must be an integer between 1 and 5.';
    END IF;

    -- Insert Review into shared.reviews
    INSERT INTO shared.reviews (
        user_id,
        company_id,
        branch_id,
        rating,
        comments,
        created_at
    ) VALUES (
        p_user_id,
        p_company_id,
        p_branch_id,
        p_rating,
        NULLIF(TRIM(p_comments), ''),
        NOW()
    )
    RETURNING * INTO v_review_rec;

    RETURN to_jsonb(v_review_rec);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_customer_review_atomic(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_rating integer DEFAULT NULL,
    p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.submit_customer_review_atomic(
        p_company_id,
        p_branch_id,
        p_user_id,
        p_rating,
        p_comments
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. GRANT EXECUTE PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app.create_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.update_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.delete_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_customer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.submit_customer_review_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_customer_review_atomic TO authenticated, anon, service_role;
