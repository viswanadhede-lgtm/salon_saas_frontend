-- ============================================================================
-- Migration: 20261103000012_harden_marketing_module.sql
-- Module 7: Marketing (Coupons & Offers) - Zero-Trust Backend-First Hardening
--
-- Procedures Defined:
--   1. app.create_coupon_atomic (wrapped by public.create_coupon_atomic)
--   2. app.update_coupon_atomic (wrapped by public.update_coupon_atomic)
--   3. app.delete_coupon_atomic (wrapped by public.delete_coupon_atomic)
--   4. app.create_offer_atomic (wrapped by public.create_offer_atomic)
--   5. app.update_offer_atomic (wrapped by public.update_offer_atomic)
--   6. app.delete_offer_atomic (wrapped by public.delete_offer_atomic)
--   7. app.validate_discount_code (wrapped by public.validate_discount_code)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING SIGNATURES FOR CLEAN RE-CREATION
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_coupon_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_coupon_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_coupon_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_coupon_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_coupon_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_coupon_atomic CASCADE;

DROP FUNCTION IF EXISTS public.create_offer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_offer_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_offer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_offer_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_offer_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_offer_atomic CASCADE;

DROP FUNCTION IF EXISTS public.validate_discount_code CASCADE;
DROP FUNCTION IF EXISTS app.validate_discount_code CASCADE;

-- ----------------------------------------------------------------------------
-- 2. CREATE COUPON ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_code text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_total_usage_limit bigint DEFAULT NULL,
    p_usage_per_customer bigint DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_code text;
    v_clean_type text;
    v_new_id uuid := gen_random_uuid();
    v_coupon app.coupons%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Code Validation
    v_clean_code := UPPER(TRIM(COALESCE(p_coupon_code, '')));
    IF v_clean_code = '' THEN
        RAISE EXCEPTION 'Coupon code is required.';
    END IF;

    -- Duplicate Code Check (scoped to company/branch, ignoring deleted)
    IF EXISTS (
        SELECT 1 FROM app.coupons
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND UPPER(coupon_code) = v_clean_code
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'A coupon with code "%" already exists.', v_clean_code;
    END IF;

    -- Discount Type & Value Validation
    v_clean_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    IF v_clean_type = 'flat' THEN v_clean_type := 'fixed'; END IF;
    IF v_clean_type NOT IN ('percentage', 'fixed') THEN
        RAISE EXCEPTION 'Invalid discount type. Must be "percentage" or "fixed".';
    END IF;

    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
        RAISE EXCEPTION 'Discount value must be greater than zero.';
    END IF;

    IF v_clean_type = 'percentage' AND p_discount_value > 100 THEN
        RAISE EXCEPTION 'Percentage discount cannot exceed 100%%.';
    END IF;

    -- Date Validation
    IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_from > p_valid_to THEN
        RAISE EXCEPTION 'Valid from date cannot be after valid to date.';
    END IF;

    -- Min Bill Amount Validation
    IF p_min_bill_amount IS NOT NULL AND p_min_bill_amount < 0 THEN
        RAISE EXCEPTION 'Minimum bill amount cannot be negative.';
    END IF;

    -- Insert
    INSERT INTO app.coupons (
        coupon_id,
        id,
        company_id,
        branch_id,
        coupon_code,
        discount_type,
        discount_value,
        min_bill_amount,
        valid_from,
        valid_to,
        status,
        total_usage_limit,
        usage_per_customer,
        all_services,
        all_products,
        all_memberships,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        v_new_id,
        p_company_id,
        p_branch_id,
        v_clean_code,
        v_clean_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        'active',
        p_total_usage_limit,
        p_usage_per_customer,
        COALESCE(p_all_services, false),
        COALESCE(p_all_products, false),
        COALESCE(p_all_memberships, false),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_coupon;

    RETURN to_jsonb(v_coupon);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_code text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_total_usage_limit bigint DEFAULT NULL,
    p_usage_per_customer bigint DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_coupon_atomic(
        p_company_id,
        p_branch_id,
        p_coupon_code,
        p_discount_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        p_total_usage_limit,
        p_usage_per_customer,
        p_all_services,
        p_all_products,
        p_all_memberships
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. UPDATE COUPON ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_id uuid,
    p_coupon_code text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_status text DEFAULT 'active',
    p_total_usage_limit bigint DEFAULT NULL,
    p_usage_per_customer bigint DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_code text;
    v_clean_type text;
    v_coupon app.coupons%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.coupons
        WHERE (coupon_id = p_coupon_id OR id = p_coupon_id)
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Coupon not found or access denied.';
    END IF;

    -- Code Validation & Uniqueness
    v_clean_code := UPPER(TRIM(COALESCE(p_coupon_code, '')));
    IF v_clean_code = '' THEN
        RAISE EXCEPTION 'Coupon code is required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.coupons
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND coupon_id != p_coupon_id AND id != p_coupon_id
          AND UPPER(coupon_code) = v_clean_code
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Another coupon with code "%" already exists.', v_clean_code;
    END IF;

    -- Discount Type & Value Validation
    v_clean_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    IF v_clean_type = 'flat' THEN v_clean_type := 'fixed'; END IF;
    IF v_clean_type NOT IN ('percentage', 'fixed') THEN
        RAISE EXCEPTION 'Invalid discount type. Must be "percentage" or "fixed".';
    END IF;

    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
        RAISE EXCEPTION 'Discount value must be greater than zero.';
    END IF;

    IF v_clean_type = 'percentage' AND p_discount_value > 100 THEN
        RAISE EXCEPTION 'Percentage discount cannot exceed 100%%.';
    END IF;

    -- Date Validation
    IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_from > p_valid_to THEN
        RAISE EXCEPTION 'Valid from date cannot be after valid to date.';
    END IF;

    -- Min Bill Amount Validation
    IF p_min_bill_amount IS NOT NULL AND p_min_bill_amount < 0 THEN
        RAISE EXCEPTION 'Minimum bill amount cannot be negative.';
    END IF;

    -- Update
    UPDATE app.coupons
    SET
        coupon_code        = v_clean_code,
        discount_type      = v_clean_type,
        discount_value     = p_discount_value,
        min_bill_amount    = p_min_bill_amount,
        valid_from         = p_valid_from,
        valid_to           = p_valid_to,
        status             = COALESCE(NULLIF(TRIM(p_status), ''), 'active'),
        total_usage_limit  = p_total_usage_limit,
        usage_per_customer = p_usage_per_customer,
        all_services       = COALESCE(p_all_services, false),
        all_products       = COALESCE(p_all_products, false),
        all_memberships    = COALESCE(p_all_memberships, false),
        updated_at         = NOW()
    WHERE (coupon_id = p_coupon_id OR id = p_coupon_id)
      AND company_id = p_company_id
    RETURNING * INTO v_coupon;

    RETURN to_jsonb(v_coupon);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_id uuid,
    p_coupon_code text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_status text DEFAULT 'active',
    p_total_usage_limit bigint DEFAULT NULL,
    p_usage_per_customer bigint DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_coupon_atomic(
        p_company_id,
        p_branch_id,
        p_coupon_id,
        p_coupon_code,
        p_discount_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        p_status,
        p_total_usage_limit,
        p_usage_per_customer,
        p_all_services,
        p_all_products,
        p_all_memberships
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. DELETE COUPON ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.coupons
        WHERE (coupon_id = p_coupon_id OR id = p_coupon_id)
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Coupon not found or already deleted.';
    END IF;

    -- Soft Delete
    UPDATE app.coupons
    SET status = 'deleted',
        updated_at = NOW()
    WHERE (coupon_id = p_coupon_id OR id = p_coupon_id)
      AND company_id = p_company_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_coupon_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_coupon_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_coupon_atomic(
        p_company_id,
        p_branch_id,
        p_coupon_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. CREATE OFFER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_name text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_clean_type text;
    v_new_id uuid := gen_random_uuid();
    v_offer app.offers%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Name Validation
    v_clean_name := TRIM(COALESCE(p_offer_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Offer name is required.';
    END IF;

    -- Duplicate Name Check
    IF EXISTS (
        SELECT 1 FROM app.offers
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND LOWER(offer_name) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'An offer with name "%" already exists.', v_clean_name;
    END IF;

    -- Discount Type & Value Validation
    v_clean_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    IF v_clean_type = 'flat' THEN v_clean_type := 'fixed'; END IF;
    IF v_clean_type NOT IN ('percentage', 'fixed') THEN
        RAISE EXCEPTION 'Invalid discount type. Must be "percentage" or "fixed".';
    END IF;

    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
        RAISE EXCEPTION 'Discount value must be greater than zero.';
    END IF;

    IF v_clean_type = 'percentage' AND p_discount_value > 100 THEN
        RAISE EXCEPTION 'Percentage discount cannot exceed 100%%.';
    END IF;

    -- Date Validation
    IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_from > p_valid_to THEN
        RAISE EXCEPTION 'Valid from date cannot be after valid to date.';
    END IF;

    -- Min Bill Amount Validation
    IF p_min_bill_amount IS NOT NULL AND p_min_bill_amount < 0 THEN
        RAISE EXCEPTION 'Minimum bill amount cannot be negative.';
    END IF;

    -- Insert
    INSERT INTO app.offers (
        offer_id,
        id,
        company_id,
        branch_id,
        offer_name,
        discount_type,
        discount_value,
        min_bill_amount,
        valid_from,
        valid_to,
        status,
        all_services,
        all_products,
        all_memberships,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        v_new_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        v_clean_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        'active',
        COALESCE(p_all_services, false),
        COALESCE(p_all_products, false),
        COALESCE(p_all_memberships, false),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_offer;

    RETURN to_jsonb(v_offer);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_name text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_offer_atomic(
        p_company_id,
        p_branch_id,
        p_offer_name,
        p_discount_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        p_all_services,
        p_all_products,
        p_all_memberships
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. UPDATE OFFER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_id uuid,
    p_offer_name text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_status text DEFAULT 'active',
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_clean_type text;
    v_offer app.offers%ROWTYPE;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.offers
        WHERE (offer_id = p_offer_id OR id = p_offer_id)
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Offer not found or access denied.';
    END IF;

    -- Name Validation & Uniqueness
    v_clean_name := TRIM(COALESCE(p_offer_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Offer name is required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.offers
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND offer_id != p_offer_id AND id != p_offer_id
          AND LOWER(offer_name) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Another offer with name "%" already exists.', v_clean_name;
    END IF;

    -- Discount Type & Value Validation
    v_clean_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    IF v_clean_type = 'flat' THEN v_clean_type := 'fixed'; END IF;
    IF v_clean_type NOT IN ('percentage', 'fixed') THEN
        RAISE EXCEPTION 'Invalid discount type. Must be "percentage" or "fixed".';
    END IF;

    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
        RAISE EXCEPTION 'Discount value must be greater than zero.';
    END IF;

    IF v_clean_type = 'percentage' AND p_discount_value > 100 THEN
        RAISE EXCEPTION 'Percentage discount cannot exceed 100%%.';
    END IF;

    -- Date Validation
    IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_from > p_valid_to THEN
        RAISE EXCEPTION 'Valid from date cannot be after valid to date.';
    END IF;

    -- Min Bill Amount Validation
    IF p_min_bill_amount IS NOT NULL AND p_min_bill_amount < 0 THEN
        RAISE EXCEPTION 'Minimum bill amount cannot be negative.';
    END IF;

    -- Update
    UPDATE app.offers
    SET
        offer_name      = v_clean_name,
        discount_type   = v_clean_type,
        discount_value  = p_discount_value,
        min_bill_amount = p_min_bill_amount,
        valid_from      = p_valid_from,
        valid_to        = p_valid_to,
        status          = COALESCE(NULLIF(TRIM(p_status), ''), 'active'),
        all_services    = COALESCE(p_all_services, false),
        all_products    = COALESCE(p_all_products, false),
        all_memberships = COALESCE(p_all_memberships, false),
        updated_at      = NOW()
    WHERE (offer_id = p_offer_id OR id = p_offer_id)
      AND company_id = p_company_id
    RETURNING * INTO v_offer;

    RETURN to_jsonb(v_offer);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_id uuid,
    p_offer_name text,
    p_discount_type text,
    p_discount_value numeric,
    p_min_bill_amount numeric DEFAULT NULL,
    p_valid_from date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_status text DEFAULT 'active',
    p_all_services boolean DEFAULT false,
    p_all_products boolean DEFAULT false,
    p_all_memberships boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_offer_atomic(
        p_company_id,
        p_branch_id,
        p_offer_id,
        p_offer_name,
        p_discount_type,
        p_discount_value,
        p_min_bill_amount,
        p_valid_from,
        p_valid_to,
        p_status,
        p_all_services,
        p_all_products,
        p_all_memberships
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. DELETE OFFER ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.offers
        WHERE (offer_id = p_offer_id OR id = p_offer_id)
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Offer not found or already deleted.';
    END IF;

    -- Soft Delete
    UPDATE app.offers
    SET status = 'deleted',
        updated_at = NOW()
    WHERE (offer_id = p_offer_id OR id = p_offer_id)
      AND company_id = p_company_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_offer_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_offer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_offer_atomic(
        p_company_id,
        p_branch_id,
        p_offer_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. VALIDATE DISCOUNT CODE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.validate_discount_code(
    p_company_id uuid,
    p_branch_id uuid,
    p_code text,
    p_bill_amount numeric DEFAULT 0,
    p_customer_id uuid DEFAULT NULL,
    p_applicable_type text DEFAULT 'service'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_code text;
    v_coupon app.coupons%ROWTYPE;
    v_total_used bigint;
    v_cust_used bigint;
    v_discount_amount numeric := 0;
BEGIN
    -- Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Invalid tenant context.');
    END IF;

    v_clean_code := UPPER(TRIM(COALESCE(p_code, '')));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Please enter a coupon code.');
    END IF;

    -- Lookup Coupon
    SELECT * INTO v_coupon
    FROM app.coupons
    WHERE company_id = p_company_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND UPPER(coupon_code) = v_clean_code
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Invalid or inactive coupon code.');
    END IF;

    -- Date Validation
    IF v_coupon.valid_from IS NOT NULL AND CURRENT_DATE < v_coupon.valid_from THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not yet active.');
    END IF;

    IF v_coupon.valid_to IS NOT NULL AND CURRENT_DATE > v_coupon.valid_to THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Coupon has expired.');
    END IF;

    -- Minimum Bill Amount
    IF v_coupon.min_bill_amount IS NOT NULL AND COALESCE(p_bill_amount, 0) < v_coupon.min_bill_amount THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'Minimum bill amount of ₹' || v_coupon.min_bill_amount || ' required.'
        );
    END IF;

    -- Scope / Applicability Validation
    IF p_applicable_type = 'service' AND NOT v_coupon.all_services AND (v_coupon.all_products OR v_coupon.all_memberships) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to services.');
    ELSIF p_applicable_type = 'product' AND NOT v_coupon.all_products AND (v_coupon.all_services OR v_coupon.all_memberships) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to products.');
    ELSIF p_applicable_type = 'membership' AND NOT v_coupon.all_memberships AND (v_coupon.all_services OR v_coupon.all_products) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to memberships.');
    END IF;

    -- Total Usage Limit
    IF v_coupon.total_usage_limit IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_used
        FROM app.discount_usages
        WHERE discount_id = v_coupon.coupon_id
          AND status = 'applied';

        IF v_total_used >= v_coupon.total_usage_limit THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon total usage limit reached.');
        END IF;
    END IF;

    -- Usage Per Customer Limit
    IF v_coupon.usage_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_cust_used
        FROM app.discount_usages
        WHERE discount_id = v_coupon.coupon_id
          AND customer_id = p_customer_id
          AND status = 'applied';

        IF v_cust_used >= v_coupon.usage_per_customer THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'You have reached the redemption limit for this coupon.');
        END IF;
    END IF;

    -- Compute Authoritative Discount Amount
    IF v_coupon.discount_type = 'percentage' THEN
        v_discount_amount := ROUND((COALESCE(p_bill_amount, 0) * v_coupon.discount_value / 100.0), 2);
    ELSE
        v_discount_amount := LEAST(v_coupon.discount_value, COALESCE(p_bill_amount, 0));
    END IF;

    RETURN jsonb_build_object(
        'valid',           true,
        'discount_id',     v_coupon.coupon_id,
        'discount_name',   v_coupon.coupon_code,
        'discount_type',   v_coupon.discount_type,
        'discount_value',  v_coupon.discount_value,
        'discount_amount', v_discount_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_discount_code(
    p_company_id uuid,
    p_branch_id uuid,
    p_code text,
    p_bill_amount numeric DEFAULT 0,
    p_customer_id uuid DEFAULT NULL,
    p_applicable_type text DEFAULT 'service'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.validate_discount_code(
        p_company_id,
        p_branch_id,
        p_code,
        p_bill_amount,
        p_customer_id,
        p_applicable_type
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. GRANT EXECUTE PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app.create_coupon_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_coupon_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.update_coupon_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_coupon_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.delete_coupon_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_coupon_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.create_offer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_offer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.update_offer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_offer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.delete_offer_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_offer_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.validate_discount_code TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.validate_discount_code TO authenticated, anon, service_role;
