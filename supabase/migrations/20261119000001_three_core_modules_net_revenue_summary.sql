-- =============================================================================
-- Migration: RPC 1 - app.three_core_modules_net_revenue_summary
--                  & public.three_core_modules_net_revenue_summary
-- Module   : Module 14 - Analytics & Overview (Card 1: Revenue Summary)
-- Purpose  : Computes exact net revenue for the 3 core business modules:
--            1. Bookings Net Revenue (All-or-nothing: 1 paid, 1 refund -> Net 0)
--            2. Product Sales Net Revenue (Compulsory sale-first check via
--               sales_for_business_transactions; supports multiple partial refunds)
--            3. Memberships Net Revenue (All-or-nothing: 1 paid, 1 refund -> Net 0)
--            4. Total Net Revenue = Bookings Net + Products Net + Memberships Net
-- Two-Tier Architecture Standard:
--   - Security & Tenant isolation in Section 1
--   - Business logic in Section 2 (Groups A, B, C)
--   - Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

-- Drop existing functions if any
DROP FUNCTION IF EXISTS public.three_core_modules_net_revenue_summary(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.three_core_modules_net_revenue_summary(uuid, uuid, date, date);

-- =============================================================================
-- 1. Core Logic in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.three_core_modules_net_revenue_summary(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT NULL::date,
    p_end_date    date DEFAULT NULL::date
)
RETURNS TABLE (
    bookings_net_revenue    numeric,
    products_net_revenue    numeric,
    memberships_net_revenue numeric,
    total_net_revenue       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, shared, public
AS $$
DECLARE
    v_start_date             date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '15 days');
    v_end_date               date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date              date;
    v_bookings_net_revenue    numeric := 0;
    v_products_net_revenue    numeric := 0;
    v_memberships_net_revenue numeric := 0;
    v_total_net_revenue       numeric := 0;
BEGIN
    -- Normalize date range if inverted
    IF v_start_date > v_end_date THEN
        v_temp_date  := v_start_date;
        v_start_date := v_end_date;
        v_end_date   := v_temp_date;
    END IF;

    -- =========================================================================
    -- SECTION 1: SECURITY & TENANT ISOLATION GATES
    -- =========================================================================

    -- Step 1.1: Mandatory identifier check
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory'
            USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant access verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %',
            p_company_id, p_branch_id
            USING ERRCODE = '42501';
    END IF;

    -- Step 1.3: Branch-company ownership check (if branch_id provided)
    IF p_branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id = p_branch_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: branch % does not belong to company %',
            p_branch_id, p_company_id
            USING ERRCODE = '42501';
    END IF;

    -- Step 1.4: Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- =========================================================================
    -- SECTION 2: CORE BUSINESS LOGIC (3 GROUPS)
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- GROUP A: BOOKINGS NET REVENUE CALCULATION
    -- Source: app.business_transactions (reference_type = 'booking')
    -- Rule: Max 1 paid row, max 1 refund row.
    --       If refund row exists -> Net = 0 (treated as unbooked).
    --       If only paid row exists -> Net = ABS(COALESCE(final_amount, amount, 0)).
    -- -------------------------------------------------------------------------
    WITH booking_agg AS (
        SELECT 
            bt.reference_id AS booking_id,
            COUNT(*) FILTER (WHERE bt.status = 'paid') AS paid_count,
            COUNT(*) FILTER (WHERE bt.status = 'refunded') AS refund_count,
            MAX(CASE WHEN bt.status = 'paid' THEN ABS(COALESCE(bt.final_amount, bt.amount, 0)) ELSE 0 END) AS paid_amount
        FROM app.business_transactions bt
        WHERE bt.company_id = p_company_id
          AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND bt.reference_type = 'booking'
          AND bt.status IN ('paid', 'refunded')
          AND DATE(COALESCE(bt.paid_at, bt.created_at)) BETWEEN v_start_date AND v_end_date
        GROUP BY bt.reference_id
    )
    SELECT COALESCE(SUM(
        CASE 
            WHEN refund_count > 0 THEN 0
            WHEN paid_count > 0 THEN paid_amount
            ELSE 0
        END
    ), 0)
    INTO v_bookings_net_revenue
    FROM booking_agg;

    -- -------------------------------------------------------------------------
    -- GROUP B: PRODUCT SALES NET REVENUE CALCULATION
    -- Compulsory check: Start from product sales (status = 'paid') in date range.
    -- For each sale, check app.sales_for_business_transactions for refund_reference_id.
    -- If refunds exist, sum refund rows in app.business_transactions (supports partial refunds).
    -- Net for sale = GREATEST(0, paid_amount - total_refund_for_sale).
    -- -------------------------------------------------------------------------
    WITH product_sales AS (
        SELECT 
            bt.reference_id AS sale_id,
            ABS(COALESCE(bt.final_amount, bt.amount, 0)) AS paid_amount,
            COALESCE((
                SELECT SUM(ABS(COALESCE(bt_ref.final_amount, bt_ref.amount, 0)))
                FROM app.sales_for_business_transactions sfbt
                JOIN app.business_transactions bt_ref
                  ON bt_ref.reference_id = sfbt.refund_reference_id
                 AND bt_ref.reference_type = 'product'
                 AND bt_ref.status = 'refunded'
                 AND bt_ref.company_id = p_company_id
                WHERE sfbt.sale_id = bt.reference_id
                  AND sfbt.refund_reference_id IS NOT NULL
                  AND sfbt.company_id = p_company_id
            ), 0) AS total_refund_for_sale
        FROM app.business_transactions bt
        WHERE bt.company_id = p_company_id
          AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND bt.reference_type = 'product'
          AND bt.status = 'paid'
          AND DATE(COALESCE(bt.paid_at, bt.created_at)) BETWEEN v_start_date AND v_end_date
    )
    SELECT COALESCE(SUM(GREATEST(0, paid_amount - total_refund_for_sale)), 0)
    INTO v_products_net_revenue
    FROM product_sales;

    -- -------------------------------------------------------------------------
    -- GROUP C: MEMBERSHIP PURCHASES NET REVENUE CALCULATION
    -- Source: app.business_transactions (reference_type = 'membership')
    -- Rule: Max 1 paid row, max 1 refund row.
    --       If refund row exists -> Net = 0.
    --       If only paid row exists -> Net = ABS(COALESCE(final_amount, amount, 0)).
    -- -------------------------------------------------------------------------
    WITH membership_agg AS (
        SELECT 
            bt.reference_id AS purchase_id,
            COUNT(*) FILTER (WHERE bt.status = 'paid') AS paid_count,
            COUNT(*) FILTER (WHERE bt.status = 'refunded') AS refund_count,
            MAX(CASE WHEN bt.status = 'paid' THEN ABS(COALESCE(bt.final_amount, bt.amount, 0)) ELSE 0 END) AS paid_amount
        FROM app.business_transactions bt
        WHERE bt.company_id = p_company_id
          AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND bt.reference_type = 'membership'
          AND bt.status IN ('paid', 'refunded')
          AND DATE(COALESCE(bt.paid_at, bt.created_at)) BETWEEN v_start_date AND v_end_date
        GROUP BY bt.reference_id
    )
    SELECT COALESCE(SUM(
        CASE 
            WHEN refund_count > 0 THEN 0
            WHEN paid_count > 0 THEN paid_amount
            ELSE 0
        END
    ), 0)
    INTO v_memberships_net_revenue
    FROM membership_agg;

    -- -------------------------------------------------------------------------
    -- TOTAL NET REVENUE CALCULATION
    -- Total Net Revenue = Bookings Net + Products Net + Memberships Net
    -- -------------------------------------------------------------------------
    v_total_net_revenue := v_bookings_net_revenue + v_products_net_revenue + v_memberships_net_revenue;

    -- Return the single summary row
    RETURN QUERY
    SELECT 
        ROUND(v_bookings_net_revenue, 2),
        ROUND(v_products_net_revenue, 2),
        ROUND(v_memberships_net_revenue, 2),
        ROUND(v_total_net_revenue, 2);

END;
$$;

-- =============================================================================
-- 2. Public Schema Wrapper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.three_core_modules_net_revenue_summary(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT NULL::date,
    p_end_date    date DEFAULT NULL::date
)
RETURNS TABLE (
    bookings_net_revenue    numeric,
    products_net_revenue    numeric,
    memberships_net_revenue numeric,
    total_net_revenue       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.three_core_modules_net_revenue_summary(
        p_company_id => p_company_id,
        p_branch_id  => p_branch_id,
        p_start_date => p_start_date,
        p_end_date   => p_end_date
    );
END;
$$;

-- =============================================================================
-- 3. Security Permissions
-- =============================================================================
REVOKE ALL ON FUNCTION app.three_core_modules_net_revenue_summary(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.three_core_modules_net_revenue_summary(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.three_core_modules_net_revenue_summary(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.three_core_modules_net_revenue_summary(uuid, uuid, date, date) TO authenticated, service_role;
