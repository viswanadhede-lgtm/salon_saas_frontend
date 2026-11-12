-- Migration: 20261112000010_unified_discounts_manager.sql
-- Description:
--   1. Create authoritative app.validate_discount RPC (Coupons, Offers, Memberships).
--   2. Create app.get_available_discounts RPC (Eligible Offers and Active Membership Perk).
--   3. Enforce 1-time usage per customer on coupons & offers via app.discount_usages.
--   4. Enforce optional min_bill_amount (NULL/0 = no minimum).
--   5. Enforce scope booleans (all_services, all_products, all_memberships).
--   6. Enforce active membership verification (status = 'active', expiry_date >= CURRENT_DATE).

-- ── 1. RPC: app.validate_discount ────────────────────────────────────────────
DROP FUNCTION IF EXISTS app.validate_discount(uuid, uuid, text, text, numeric, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_discount(uuid, uuid, text, text, numeric, uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION app.validate_discount(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_discount_type     text,          -- 'coupon' | 'offer' | 'membership'
    p_code_or_id        text,          -- coupon code or UUID of offer/membership
    p_bill_amount       numeric DEFAULT 0,
    p_customer_id       uuid    DEFAULT NULL,
    p_applicable_type   text    DEFAULT 'service' -- 'service' | 'product' | 'membership'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_type         text;
    v_clean_code_or_id   text;
    v_applicable_type    text;
    v_discount_id        uuid;
    v_discount_name      text;
    v_discount_calc_type text; -- 'percentage' | 'fixed'
    v_discount_value     numeric := 0;
    v_discount_amount    numeric := 0;
    v_min_bill           numeric := NULL;
    v_valid_from         date := NULL;
    v_valid_to           date := NULL;
    v_all_services       boolean := true;
    v_all_products       boolean := true;
    v_all_memberships    boolean := true;
    v_status             text;
    v_used_count         bigint := 0;
    v_today              date := CURRENT_DATE;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Invalid tenant context.');
    END IF;

    v_clean_type := LOWER(TRIM(COALESCE(p_discount_type, '')));
    v_clean_code_or_id := TRIM(COALESCE(p_code_or_id, ''));
    v_applicable_type := LOWER(TRIM(COALESCE(p_applicable_type, 'service')));

    IF v_clean_type NOT IN ('coupon', 'offer', 'membership') THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Invalid discount type. Must be coupon, offer, or membership.');
    END IF;

    -- =========================================================================
    -- STREAM 1: COUPONS
    -- =========================================================================
    IF v_clean_type = 'coupon' THEN
        IF v_clean_code_or_id = '' THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Please enter a coupon code.');
        END IF;

        SELECT coupon_id, coupon_code, discount_type, discount_value, min_bill_amount,
               valid_from, valid_to, all_services, all_products, all_memberships, status
        INTO v_discount_id, v_discount_name, v_discount_calc_type, v_discount_value, v_min_bill,
             v_valid_from, v_valid_to, v_all_services, v_all_products, v_all_memberships, v_status
        FROM app.coupons
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL)
          AND UPPER(coupon_code) = UPPER(v_clean_code_or_id)
        LIMIT 1;

        IF v_discount_id IS NULL THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Invalid coupon code.');
        END IF;

        IF v_status <> 'active' THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is inactive.');
        END IF;

        -- Date checks
        IF v_valid_from IS NOT NULL AND v_today < v_valid_from THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not yet active.');
        END IF;
        IF v_valid_to IS NOT NULL AND v_today > v_valid_to THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon has expired.');
        END IF;

        -- Scope checks
        IF v_applicable_type = 'service' AND NOT COALESCE(v_all_services, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to services/appointments.');
        ELSIF v_applicable_type = 'product' AND NOT COALESCE(v_all_products, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to products.');
        ELSIF v_applicable_type = 'membership' AND NOT COALESCE(v_all_memberships, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not applicable to membership purchases.');
        END IF;

        -- Min bill check (optional: only if not null and > 0)
        IF v_min_bill IS NOT NULL AND v_min_bill > 0 AND COALESCE(p_bill_amount, 0) < v_min_bill THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Minimum bill amount of ₹' || v_min_bill || ' required.');
        END IF;

        -- 1-Time usage limit per customer
        IF p_customer_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_used_count
            FROM app.discount_usages
            WHERE discount_id = v_discount_id
              AND customer_id = p_customer_id
              AND status IN ('applied', 'used');

            IF v_used_count >= 1 THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'You have already redeemed this coupon.');
            END IF;
        END IF;

    -- =========================================================================
    -- STREAM 2: OFFERS
    -- =========================================================================
    ELSIF v_clean_type = 'offer' THEN
        IF v_clean_code_or_id = '' THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Please select an offer.');
        END IF;

        -- Lookup offer by UUID or offer_name
        SELECT offer_id, offer_name, discount_type, discount_value, min_bill_amount,
               valid_from, valid_to, all_services, all_products, all_memberships, status
        INTO v_discount_id, v_discount_name, v_discount_calc_type, v_discount_value, v_min_bill,
             v_valid_from, v_valid_to, v_all_services, v_all_products, v_all_memberships, v_status
        FROM app.offers
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL)
          AND (
              offer_id::text = v_clean_code_or_id
              OR UPPER(offer_name) = UPPER(v_clean_code_or_id)
          )
        LIMIT 1;

        IF v_discount_id IS NULL THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer not found.');
        END IF;

        IF v_status <> 'active' THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'This offer is inactive.');
        END IF;

        -- Date checks
        IF v_valid_from IS NOT NULL AND v_today < v_valid_from THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer is not yet active.');
        END IF;
        IF v_valid_to IS NOT NULL AND v_today > v_valid_to THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer has expired.');
        END IF;

        -- Scope checks
        IF v_applicable_type = 'service' AND NOT COALESCE(v_all_services, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer is not applicable to services/appointments.');
        ELSIF v_applicable_type = 'product' AND NOT COALESCE(v_all_products, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer is not applicable to products.');
        ELSIF v_applicable_type = 'membership' AND NOT COALESCE(v_all_memberships, false) THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Offer is not applicable to membership purchases.');
        END IF;

        -- Min bill check (optional: only if not null and > 0)
        IF v_min_bill IS NOT NULL AND v_min_bill > 0 AND COALESCE(p_bill_amount, 0) < v_min_bill THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Minimum bill amount of ₹' || v_min_bill || ' required.');
        END IF;

        -- 1-Time usage limit per customer
        IF p_customer_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_used_count
            FROM app.discount_usages
            WHERE discount_id = v_discount_id
              AND customer_id = p_customer_id
              AND status IN ('applied', 'used');

            IF v_used_count >= 1 THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'You have already redeemed this offer.');
            END IF;
        END IF;

    -- =========================================================================
    -- STREAM 3: MEMBERSHIPS
    -- =========================================================================
    ELSIF v_clean_type = 'membership' THEN
        IF p_customer_id IS NULL THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'Customer must be selected to check membership benefits.');
        END IF;

        -- Lookup customer's active membership pass and plan terms
        DECLARE
            v_purchase_id uuid;
            v_membership_id uuid;
            v_expiry_date date;
            v_purchase_status text;
        BEGIN
            SELECT mp.purchase_id, mp.membership_id, mp.expiry_date, mp.status,
                   m.plan_name, m.discount_type, m.discount_value,
                   m.all_services, m.all_products, m.all_memberships
            INTO v_purchase_id, v_membership_id, v_expiry_date, v_purchase_status,
                 v_discount_name, v_discount_calc_type, v_discount_value,
                 v_all_services, v_all_products, v_all_memberships
            FROM app.membership_purchases mp
            JOIN app.memberships m ON m.membership_id = mp.membership_id
            WHERE mp.customer_id = p_customer_id
              AND mp.company_id = p_company_id
              AND (v_clean_code_or_id = '' OR mp.membership_id::text = v_clean_code_or_id OR mp.purchase_id::text = v_clean_code_or_id)
            ORDER BY 
              CASE WHEN mp.status = 'active' AND mp.expiry_date >= v_today THEN 1 ELSE 2 END,
              mp.expiry_date DESC
            LIMIT 1;

            IF v_purchase_id IS NULL THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'No membership found for this customer.');
            END IF;

            -- Active status check
            IF v_purchase_status <> 'active' THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Customer membership is ' || v_purchase_status || '.');
            END IF;

            -- Expiry date check
            IF v_expiry_date < v_today THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Customer membership expired on ' || v_expiry_date || '.');
            END IF;

            -- Plan discount check
            IF v_discount_value IS NULL OR v_discount_value <= 0 THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Customer membership plan provides no discount.');
            END IF;

            -- Scope checks
            IF v_applicable_type = 'service' AND NOT COALESCE(v_all_services, false) THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Membership discount is not applicable to services/appointments.');
            ELSIF v_applicable_type = 'product' AND NOT COALESCE(v_all_products, false) THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Membership discount is not applicable to products.');
            ELSIF v_applicable_type = 'membership' AND NOT COALESCE(v_all_memberships, false) THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'Membership discount is not applicable to membership purchases.');
            END IF;

            v_discount_id := v_membership_id;
        END;
    END IF;

    -- Calculate Discount Amount
    IF v_discount_calc_type = 'percentage' THEN
        v_discount_amount := ROUND((COALESCE(p_bill_amount, 0) * v_discount_value / 100.0), 2);
    ELSE
        v_discount_amount := LEAST(v_discount_value, COALESCE(p_bill_amount, 0));
    END IF;

    IF v_discount_amount < 0 THEN
        v_discount_amount := 0;
    END IF;

    RETURN jsonb_build_object(
        'valid',                true,
        'discount_type',        v_clean_type,
        'discount_id',          v_discount_id,
        'discount_name',        v_discount_name,
        'discount_calc_type',   v_discount_calc_type,
        'discount_value',       v_discount_value,
        'discount_amount',      v_discount_amount
    );
END;
$$;

-- Public PostgREST wrapper
CREATE OR REPLACE FUNCTION public.validate_discount(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_discount_type     text,
    p_code_or_id        text,
    p_bill_amount       numeric DEFAULT 0,
    p_customer_id       uuid    DEFAULT NULL,
    p_applicable_type   text    DEFAULT 'service'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.validate_discount(
        p_company_id,
        p_branch_id,
        p_discount_type,
        p_code_or_id,
        p_bill_amount,
        p_customer_id,
        p_applicable_type
    );
END;
$$;

-- ── 2. RPC: app.get_available_discounts ──────────────────────────────────────
DROP FUNCTION IF EXISTS app.get_available_discounts(uuid, uuid, uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_available_discounts(uuid, uuid, uuid, numeric, text) CASCADE;

CREATE OR REPLACE FUNCTION app.get_available_discounts(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid    DEFAULT NULL,
    p_bill_amount     numeric DEFAULT 0,
    p_applicable_type text    DEFAULT 'service' -- 'service' | 'product' | 'membership'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_today           date := CURRENT_DATE;
    v_applicable_type text := LOWER(TRIM(COALESCE(p_applicable_type, 'service')));
    v_membership      jsonb := NULL;
    v_offers          jsonb := '[]'::jsonb;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid tenant context.');
    END IF;

    -- 2. Check Customer's Active Membership Perk
    IF p_customer_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'purchase_id', mp.purchase_id,
            'membership_id', mp.membership_id,
            'plan_name', m.plan_name,
            'discount_type', m.discount_type,
            'discount_value', m.discount_value,
            'discount_amount', CASE 
                                 WHEN m.discount_type = 'percentage' 
                                   THEN ROUND((COALESCE(p_bill_amount, 0) * m.discount_value / 100.0), 2)
                                 ELSE LEAST(m.discount_value, COALESCE(p_bill_amount, 0))
                               END,
            'expiry_date', mp.expiry_date
        )
        INTO v_membership
        FROM app.membership_purchases mp
        JOIN app.memberships m ON m.membership_id = mp.membership_id
        WHERE mp.customer_id = p_customer_id
          AND mp.company_id = p_company_id
          AND mp.status = 'active'
          AND mp.expiry_date >= v_today
          AND COALESCE(m.discount_value, 0) > 0
          AND (
              (v_applicable_type = 'service' AND COALESCE(m.all_services, false))
              OR (v_applicable_type = 'product' AND COALESCE(m.all_products, false))
              OR (v_applicable_type = 'membership' AND COALESCE(m.all_memberships, false))
          )
        ORDER BY mp.expiry_date DESC
        LIMIT 1;
    END IF;

    -- 3. Fetch Active Offers:
    --    - status = 'active' and valid dates
    --    - scope matches v_applicable_type
    --    - min_bill_amount met (if not null)
    --    - customer has NOT redeemed it yet (1-time rule)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'offer_id', o.offer_id,
            'offer_name', o.offer_name,
            'discount_type', o.discount_type,
            'discount_value', o.discount_value,
            'min_bill_amount', o.min_bill_amount,
            'discount_amount', CASE 
                                 WHEN o.discount_type = 'percentage' 
                                   THEN ROUND((COALESCE(p_bill_amount, 0) * o.discount_value / 100.0), 2)
                                 ELSE LEAST(o.discount_value, COALESCE(p_bill_amount, 0))
                               END,
            'valid_from', o.valid_from,
            'valid_to', o.valid_to
        )
    ), '[]'::jsonb)
    INTO v_offers
    FROM app.offers o
    WHERE o.company_id = p_company_id
      AND (o.branch_id = p_branch_id OR o.branch_id IS NULL)
      AND o.status = 'active'
      AND (o.valid_from IS NULL OR o.valid_from <= v_today)
      AND (o.valid_to IS NULL OR o.valid_to >= v_today)
      AND (o.min_bill_amount IS NULL OR o.min_bill_amount <= 0 OR COALESCE(p_bill_amount, 0) >= o.min_bill_amount)
      AND (
          (v_applicable_type = 'service' AND COALESCE(o.all_services, false))
          OR (v_applicable_type = 'product' AND COALESCE(o.all_products, false))
          OR (v_applicable_type = 'membership' AND COALESCE(o.all_memberships, false))
      )
      AND (
          p_customer_id IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM app.discount_usages du
              WHERE du.discount_id = o.offer_id
                AND du.customer_id = p_customer_id
                AND du.status IN ('applied', 'used')
          )
      );

    RETURN jsonb_build_object(
        'success', true,
        'membership', v_membership,
        'offers', v_offers
    );
END;
$$;

-- Public PostgREST wrapper
CREATE OR REPLACE FUNCTION public.get_available_discounts(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid    DEFAULT NULL,
    p_bill_amount     numeric DEFAULT 0,
    p_applicable_type text    DEFAULT 'service'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.get_available_discounts(
        p_company_id,
        p_branch_id,
        p_customer_id,
        p_bill_amount,
        p_applicable_type
    );
END;
$$;

-- ── 3. Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION app.validate_discount TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.validate_discount TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION app.get_available_discounts TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_available_discounts TO authenticated, service_role, anon;
