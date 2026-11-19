-- =============================================================================
-- Migration: RPC 2 - app.get_analytics_overview
--                  & public.get_analytics_overview
-- Module   : Module 14 - Analytics & Overview
-- Purpose  : Hardened two-tier analytics overview controller.
--            Internally delegates core net revenue to RPC 1:
--            app.three_core_modules_net_revenue_summary
--            Provides operational cards, status breakdowns, cohort analytics,
--            charts, and leaderboards across all 9 sections.
-- Two-Tier Architecture Standard:
--   - Security & Tenant isolation in Section 1
--   - Core Business logic across 9 sections in Section 2
--   - Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_analytics_overview(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_analytics_overview(uuid, uuid, date, date);

-- =============================================================================
-- 1. Core Logic Function in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_analytics_overview(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT ((CURRENT_DATE - INTERVAL '15 days'))::date,
    p_end_date    date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, shared, public
AS $$
DECLARE
    -- Normalised date parameters
    v_start_date             date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '15 days')::date);
    v_end_date               date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date              date;

    -- Comparison timeframe (previous equal period)
    v_period_days            int;
    v_prev_end_date          date;
    v_prev_start_date        date;

    -- Row 1: Revenue Summary (Core numbers from RPC 1)
    v_rev_bookings           numeric := 0;
    v_rev_products           numeric := 0;
    v_rev_memberships        numeric := 0;
    v_rev_total              numeric := 0;
    v_prev_rev_total         numeric := 0;
    v_prev_rev_book          numeric := 0;
    v_prev_rev_prod          numeric := 0;
    v_prev_rev_memb          numeric := 0;

    -- Row 2: Expenses & Net Revenue
    v_total_expenses         numeric := 0;
    v_prev_expenses          numeric := 0;
    v_net_revenue            numeric := 0;
    v_prev_net_rev           numeric := 0;

    -- Row 3: Revenue & Expense Breakdown
    v_chart_timeline         jsonb := '[]'::jsonb;
    v_expense_cats           jsonb := '[]'::jsonb;

    -- Row 4: Business Activity (with Status Breakdowns)
    v_act_bookings           bigint := 0;
    v_prev_act_book          bigint := 0;
    v_bk_completed           bigint := 0;
    v_bk_cancelled           bigint := 0;
    v_bk_noshow              bigint := 0;
    v_bk_refunded            bigint := 0;

    v_act_products           bigint := 0;
    v_prev_act_prod          bigint := 0;
    v_pr_completed           bigint := 0;
    v_pr_refunded            bigint := 0;

    v_act_memberships        bigint := 0;
    v_prev_act_memb          bigint := 0;
    v_mb_active              bigint := 0;
    v_mb_refunded            bigint := 0;

    -- Row 5: Sources Trend
    v_sources_trend          jsonb := '[]'::jsonb;

    -- Row 6: Top 5 Performers
    v_top_services           jsonb := '[]'::jsonb;
    v_top_products           jsonb := '[]'::jsonb;
    v_top_memberships        jsonb := '[]'::jsonb;

    -- Row 7: Customer Analytics (Cohort segmentation)
    v_cust_total             bigint := 0;
    v_prev_cust_total        bigint := 0;
    v_cust_regular           bigint := 0;
    v_prev_cust_regular      bigint := 0;
    v_cust_vip               bigint := 0;
    v_prev_cust_vip          bigint := 0;
    v_cust_loyal             bigint := 0;
    v_prev_cust_loyal        bigint := 0;

    -- Backward compatibility customer metrics
    v_cust_new               bigint := 0;
    v_prev_cust_new          bigint := 0;
    v_cust_returning         bigint := 0;
    v_prev_cust_ret          bigint := 0;
    v_cust_repeat_rate       numeric := 0;
    v_prev_cust_repeat       numeric := 0;

    -- Row 8: Staff Analytics
    v_staff_total            bigint := 0;
    v_staff_completed        bigint := 0;
    v_staff_revenue          numeric := 0;
    v_prev_staff_completed   bigint := 0;
    v_prev_staff_rev         numeric := 0;
    v_top_staff              jsonb := '[]'::jsonb;

    -- Row 9: Marketing Analytics
    v_mkt_coupons            bigint := 0;
    v_prev_mkt_coupons       bigint := 0;
    v_mkt_memberships        bigint := 0;
    v_prev_mkt_memb          bigint := 0;
    v_mkt_offers             bigint := 0;
    v_prev_mkt_offers        bigint := 0;
    v_mkt_discounts          numeric := 0;
    v_prev_mkt_disc          numeric := 0;

    -- Final JSON output
    v_result                 jsonb;
BEGIN
    -- Normalize inverted dates
    IF v_start_date > v_end_date THEN
        v_temp_date  := v_start_date;
        v_start_date := v_end_date;
        v_end_date   := v_temp_date;
    END IF;

    -- =========================================================================
    -- SECTION 1: SECURITY & MULTI-TENANT ISOLATION GATES
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

    -- Step 1.3: Branch-company ownership check
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
    -- SECTION 2: CORE BUSINESS LOGIC (9 ROWS)
    -- =========================================================================

    -- ── 0. TIME WINDOW DERIVATION ────────────────────────────────────────────
    v_period_days     := GREATEST(1, (v_end_date - v_start_date) + 1);
    v_prev_end_date   := v_start_date - 1;
    v_prev_start_date := v_prev_end_date - v_period_days + 1;

    -- ── 1. ROW 1: REVENUE SUMMARY (Via RPC 1) ────────────────────────────────
    -- Current Period
    SELECT 
        COALESCE(bookings_net_revenue, 0),
        COALESCE(products_net_revenue, 0),
        COALESCE(memberships_net_revenue, 0),
        COALESCE(total_net_revenue, 0)
    INTO v_rev_bookings, v_rev_products, v_rev_memberships, v_rev_total
    FROM app.three_core_modules_net_revenue_summary(
        p_company_id => p_company_id,
        p_branch_id  => p_branch_id,
        p_start_date => v_start_date,
        p_end_date   => v_end_date
    );

    -- Previous Period (for Growth % badges)
    SELECT 
        COALESCE(bookings_net_revenue, 0),
        COALESCE(products_net_revenue, 0),
        COALESCE(memberships_net_revenue, 0),
        COALESCE(total_net_revenue, 0)
    INTO v_prev_rev_book, v_prev_rev_prod, v_prev_rev_memb, v_prev_rev_total
    FROM app.three_core_modules_net_revenue_summary(
        p_company_id => p_company_id,
        p_branch_id  => p_branch_id,
        p_start_date => v_prev_start_date,
        p_end_date   => v_prev_end_date
    );

    -- ── 2. ROW 2: EXPENSES & NET REVENUE ──────────────────────────────────────
    -- Current Period Expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM app.expenses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND date BETWEEN v_start_date AND v_end_date
      AND (status IS NULL OR status <> 'deleted');

    -- Previous Period Expenses
    SELECT COALESCE(SUM(amount), 0) INTO v_prev_expenses
    FROM app.expenses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND date BETWEEN v_prev_start_date AND v_prev_end_date
      AND (status IS NULL OR status <> 'deleted');

    -- Net Revenue / Profit
    v_net_revenue  := v_rev_total - v_total_expenses;
    v_prev_net_rev := v_prev_rev_total - v_prev_expenses;

    -- ── 3. ROW 3: REVENUE & EXPENSE ANALYSIS ──────────────────────────────────
    -- Daily Net Revenue & Expenses Timeline
    WITH daily_calendar AS (
        SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date AS d_date
    ),
    daily_rev AS (
        SELECT 
            DATE(COALESCE(bt.paid_at, bt.created_at)) AS tx_date,
            GREATEST(0, COALESCE(SUM(
                CASE 
                    WHEN bt.status = 'paid' THEN ABS(COALESCE(bt.final_amount, bt.amount, 0))
                    WHEN bt.status = 'refunded' THEN -ABS(COALESCE(bt.final_amount, bt.amount, 0))
                    ELSE 0 
                END
            ), 0)) AS net_rev
        FROM app.business_transactions bt
        WHERE bt.company_id = p_company_id
          AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND DATE(COALESCE(bt.paid_at, bt.created_at)) BETWEEN v_start_date AND v_end_date
          AND bt.status IN ('paid', 'refunded')
        GROUP BY DATE(COALESCE(bt.paid_at, bt.created_at))
    ),
    daily_exp AS (
        SELECT date AS exp_date, COALESCE(SUM(amount), 0) AS total_exp
        FROM app.expenses
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND date BETWEEN v_start_date AND v_end_date
          AND (status IS NULL OR status <> 'deleted')
        GROUP BY date
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'date', TO_CHAR(c.d_date, 'YYYY-MM-DD'),
            'label', TO_CHAR(c.d_date, 'Mon DD'),
            'revenue', COALESCE(r.net_rev, 0),
            'expense', COALESCE(e.total_exp, 0)
        ) ORDER BY c.d_date ASC
    ) INTO v_chart_timeline
    FROM daily_calendar c
    LEFT JOIN daily_rev r ON c.d_date = r.tx_date
    LEFT JOIN daily_exp e ON c.d_date = e.exp_date;

    -- Expense Breakdown Donut
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'category', COALESCE(NULLIF(TRIM(category), ''), 'Other'),
            'amount', cat_total,
            'percentage', CASE WHEN v_total_expenses > 0 
                THEN ROUND((cat_total / v_total_expenses) * 100, 1) ELSE 0 END
        ) ORDER BY cat_total DESC
    ), '[]'::jsonb)
    INTO v_expense_cats
    FROM (
        SELECT category, SUM(amount) AS cat_total
        FROM app.expenses
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND date BETWEEN v_start_date AND v_end_date
          AND (status IS NULL OR status <> 'deleted')
        GROUP BY category
    ) sub;

    -- ── 4. ROW 4: BUSINESS ACTIVITY (WITH STATUS BREAKDOWNS) ──────────────────
    -- 1. Bookings Activity & Status Breakdown
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) = 'completed' AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')),
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) = 'cancelled'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')),
        COUNT(*) FILTER (WHERE LOWER(TRIM(payment_status)) = 'refunded' OR LOWER(TRIM(booking_status)) = 'refunded')
    INTO v_act_bookings, v_bk_completed, v_bk_cancelled, v_bk_noshow, v_bk_refunded
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND booking_date BETWEEN v_start_date AND v_end_date;

    -- Previous Period Bookings Count (for Growth %)
    SELECT COUNT(*) INTO v_prev_act_book
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date;

    -- 2. Products Activity & Status Breakdown
    SELECT 
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN LOWER(TRIM(payment_status)) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1)
            WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(total_quantity, 1))
            ELSE 0 END), 0)),
        COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_status)) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN ABS(COALESCE(total_quantity, 1)) ELSE 0 END), 0)
    INTO v_act_products, v_pr_completed, v_pr_refunded
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    -- Previous Period Products Sold
    SELECT GREATEST(0, COALESCE(SUM(CASE 
        WHEN LOWER(TRIM(payment_status)) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1)
        WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(total_quantity, 1))
        ELSE 0 END), 0))
    INTO v_prev_act_prod
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date;

    -- 3. Memberships Activity & Status Breakdown
    SELECT 
        COUNT(*) FILTER (WHERE payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded'),
        COUNT(*) FILTER (WHERE payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(payment_status)) = 'refunded')
    INTO v_act_memberships, v_mb_active, v_mb_refunded
    FROM app.membership_purchases
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND COALESCE(purchase_date, created_at::date) BETWEEN v_start_date AND v_end_date;

    -- Previous Period Memberships Count
    SELECT COUNT(*) INTO v_prev_act_memb
    FROM app.membership_purchases
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND COALESCE(purchase_date, created_at::date) BETWEEN v_prev_start_date AND v_prev_end_date
      AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded');

    -- ── 5. ROW 5: REVENUE TREND BY BUSINESS SOURCE ───────────────────────────
    WITH daily_calendar AS (
        SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date AS d_date
    ),
    daily_sources AS (
        SELECT 
            DATE(COALESCE(bt.paid_at, bt.created_at)) AS tx_date,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN bt.status = 'paid' AND bt.reference_type IN ('booking', 'service') THEN ABS(COALESCE(bt.final_amount, bt.amount, 0))
                WHEN bt.status = 'refunded' AND bt.reference_type IN ('booking', 'service') THEN -ABS(COALESCE(bt.final_amount, bt.amount, 0))
                ELSE 0 END), 0)) AS bookings_rev,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN bt.status = 'paid' AND bt.reference_type IN ('product', 'pos') THEN ABS(COALESCE(bt.final_amount, bt.amount, 0))
                WHEN bt.status = 'refunded' AND bt.reference_type IN ('product', 'pos') THEN -ABS(COALESCE(bt.final_amount, bt.amount, 0))
                ELSE 0 END), 0)) AS products_rev,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN bt.status = 'paid' AND bt.reference_type = 'membership' THEN ABS(COALESCE(bt.final_amount, bt.amount, 0))
                WHEN bt.status = 'refunded' AND bt.reference_type = 'membership' THEN -ABS(COALESCE(bt.final_amount, bt.amount, 0))
                ELSE 0 END), 0)) AS memberships_rev
        FROM app.business_transactions bt
        WHERE bt.company_id = p_company_id
          AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND DATE(COALESCE(bt.paid_at, bt.created_at)) BETWEEN v_start_date AND v_end_date
          AND bt.status IN ('paid', 'refunded')
        GROUP BY DATE(COALESCE(bt.paid_at, bt.created_at))
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'date', TO_CHAR(c.d_date, 'YYYY-MM-DD'),
            'label', TO_CHAR(c.d_date, 'Mon DD'),
            'bookings', COALESCE(s.bookings_rev, 0),
            'products', COALESCE(s.products_rev, 0),
            'memberships', COALESCE(s.memberships_rev, 0)
        ) ORDER BY c.d_date ASC
    ) INTO v_sources_trend
    FROM daily_calendar c
    LEFT JOIN daily_sources s ON c.d_date = s.tx_date;

    -- ── 6. ROW 6: TOP 5 PERFORMERS ───────────────────────────────────────────
    -- Top 5 Services (from bookings, excluding cancelled/refunded)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'rank', sub.r,
            'name', sub.service_name,
            'count', sub.svc_count,
            'revenue', sub.svc_rev
        )
    ), '[]'::jsonb)
    INTO v_top_services
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, SUM(COALESCE(price, 0)) DESC) AS r,
            COALESCE(NULLIF(TRIM(service_name), ''), 'Other Service') AS service_name,
            COUNT(*) AS svc_count,
            COALESCE(SUM(COALESCE(price, 0)), 0) AS svc_rev
        FROM app.bookings
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND (booking_status IS NULL OR LOWER(TRIM(booking_status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
        GROUP BY COALESCE(NULLIF(TRIM(service_name), ''), 'Other Service')
        LIMIT 5
    ) sub;

    -- Top 5 Products (from sales_for_business_transactions, NET of returns)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'rank', sub.r,
            'name', sub.product_name,
            'count', sub.units_sold,
            'revenue', sub.prod_rev
        )
    ), '[]'::jsonb)
    INTO v_top_products
    FROM (
        SELECT 
            ROW_NUMBER() OVER (
                ORDER BY GREATEST(0, SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_status, 'paid'))) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1) WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(total_quantity, 1)) ELSE 0 END)) DESC,
                         GREATEST(0, SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_status, 'paid'))) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(final_amount, total_price, 0) WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(final_amount, total_price, 0)) ELSE 0 END)) DESC
            ) AS r,
            COALESCE(NULLIF(TRIM(ARRAY_TO_STRING(product_names, ', ')), ''), 'Other Product') AS product_name,
            GREATEST(0, SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_status, 'paid'))) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1) WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(total_quantity, 1)) ELSE 0 END)) AS units_sold,
            GREATEST(0, SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_status, 'paid'))) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(final_amount, total_price, 0) WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(final_amount, total_price, 0)) ELSE 0 END)) AS prod_rev
        FROM app.sales_for_business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND created_at::date BETWEEN v_start_date AND v_end_date
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) IN ('paid', 'refunded'))
        GROUP BY COALESCE(NULLIF(TRIM(ARRAY_TO_STRING(product_names, ', ')), ''), 'Other Product')
        HAVING GREATEST(0, SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_status, 'paid'))) = 'paid' AND refund_reference_id IS NULL THEN COALESCE(total_quantity, 1) WHEN refund_reference_id IS NOT NULL OR LOWER(TRIM(payment_status)) = 'refunded' THEN -ABS(COALESCE(total_quantity, 1)) ELSE 0 END)) > 0
        LIMIT 5
    ) sub;

    -- Top 5 Memberships (from membership_purchases)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'rank', sub.r,
            'name', sub.plan_name,
            'count', sub.plan_count,
            'revenue', sub.plan_rev
        )
    ), '[]'::jsonb)
    INTO v_top_memberships
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, SUM(COALESCE(final_amount, price, 0)) DESC) AS r,
            COALESCE(NULLIF(TRIM(plan_name), ''), 'Standard Membership') AS plan_name,
            COUNT(*) AS plan_count,
            COALESCE(SUM(COALESCE(final_amount, price, 0)), 0) AS plan_rev
        FROM app.membership_purchases
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND COALESCE(purchase_date, created_at::date) BETWEEN v_start_date AND v_end_date
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
        GROUP BY COALESCE(NULLIF(TRIM(plan_name), ''), 'Standard Membership')
        LIMIT 5
    ) sub;

    -- ── 7. ROW 7: CUSTOMER CRM ANALYTICS (COHORT SEGMENTATION) ───────────────
    -- Transacting customers in current period
    WITH current_active_cust AS (
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND customer_id IS NOT NULL
          AND LOWER(TRIM(booking_status)) <> 'cancelled'
        GROUP BY customer_id
        UNION ALL
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.sales_for_business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND created_at::date BETWEEN v_start_date AND v_end_date
          AND customer_id IS NOT NULL
          AND payment_status = 'paid'
        GROUP BY customer_id
        UNION ALL
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.membership_purchases
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND COALESCE(purchase_date, created_at::date) BETWEEN v_start_date AND v_end_date
          AND customer_id IS NOT NULL
          AND (payment_status IS NULL OR payment_status <> 'refunded')
        GROUP BY customer_id
    ),
    curr_cust_agg AS (
        SELECT customer_id, SUM(visit_count) AS total_visits
        FROM current_active_cust
        GROUP BY customer_id
    )
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE c.tags ILIKE '%regular%'),
        COUNT(*) FILTER (WHERE c.tags ILIKE '%vip%'),
        COUNT(*) FILTER (WHERE a.total_visits > 1),
        COUNT(*) FILTER (WHERE c.created_at::date >= v_start_date),
        COUNT(*) FILTER (WHERE c.created_at::date < v_start_date)
    INTO v_cust_total, v_cust_regular, v_cust_vip, v_cust_loyal, v_cust_new, v_cust_returning
    FROM curr_cust_agg a
    LEFT JOIN app.customers c ON a.customer_id = c.customer_id;

    v_cust_repeat_rate := CASE 
        WHEN v_cust_total > 0 THEN ROUND((v_cust_returning::numeric / v_cust_total::numeric) * 100, 1)
        ELSE 0 
    END;

    -- Transacting customers in previous period (for trend badges)
    WITH prev_active_cust AS (
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
          AND customer_id IS NOT NULL
          AND LOWER(TRIM(booking_status)) <> 'cancelled'
        GROUP BY customer_id
        UNION ALL
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.sales_for_business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
          AND customer_id IS NOT NULL
          AND payment_status = 'paid'
        GROUP BY customer_id
        UNION ALL
        SELECT customer_id, COUNT(*) AS visit_count
        FROM app.membership_purchases
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND COALESCE(purchase_date, created_at::date) BETWEEN v_prev_start_date AND v_prev_end_date
          AND customer_id IS NOT NULL
          AND (payment_status IS NULL OR payment_status <> 'refunded')
        GROUP BY customer_id
    ),
    prev_cust_agg AS (
        SELECT customer_id, SUM(visit_count) AS total_visits
        FROM prev_active_cust
        GROUP BY customer_id
    )
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE c.tags ILIKE '%regular%'),
        COUNT(*) FILTER (WHERE c.tags ILIKE '%vip%'),
        COUNT(*) FILTER (WHERE a.total_visits > 1),
        COUNT(*) FILTER (WHERE c.created_at::date >= v_prev_start_date),
        COUNT(*) FILTER (WHERE c.created_at::date < v_prev_start_date)
    INTO v_prev_cust_total, v_prev_cust_regular, v_prev_cust_vip, v_prev_cust_loyal, v_prev_cust_new, v_prev_cust_ret
    FROM prev_cust_agg a
    LEFT JOIN app.customers c ON a.customer_id = c.customer_id;

    v_prev_cust_repeat := CASE 
        WHEN v_prev_cust_total > 0 THEN ROUND((v_prev_cust_ret::numeric / v_prev_cust_total::numeric) * 100, 1)
        ELSE 0 
    END;

    -- ── 8. ROW 8: STAFF ANALYTICS ─────────────────────────────────────────────
    SELECT COUNT(*) INTO v_staff_total
    FROM app.staff
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (status IS NULL OR LOWER(TRIM(status)) = 'active');

    -- Completed appointments (distinct bookings) & service revenue
    SELECT 
        COUNT(*),
        COALESCE(SUM(COALESCE(final_amount, total_price, 0)), 0)
    INTO v_staff_completed, v_staff_revenue
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND booking_date BETWEEN v_start_date AND v_end_date
      AND LOWER(TRIM(booking_status)) = 'completed';

    SELECT 
        COUNT(*),
        COALESCE(SUM(COALESCE(final_amount, total_price, 0)), 0)
    INTO v_prev_staff_completed, v_prev_staff_rev
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
      AND LOWER(TRIM(booking_status)) = 'completed';

    -- Top 5 Staff Leaderboard (Bookings served & Revenue)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'rank', sub.r,
            'name', sub.staff_name,
            'bookings', sub.completed_count,
            'revenue', sub.staff_rev
        )
    ), '[]'::jsonb)
    INTO v_top_staff
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT b.booking_id) DESC, SUM(COALESCE(b.price, 0)) DESC) AS r,
            COALESCE(NULLIF(TRIM(b.staff_name), ''), 'Staff Member') AS staff_name,
            COUNT(DISTINCT b.booking_id) AS completed_count,
            COALESCE(SUM(COALESCE(b.price, 0)), 0) AS staff_rev
        FROM app.bookings b
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(b.booking_status)) = 'completed'
        GROUP BY COALESCE(NULLIF(TRIM(b.staff_name), ''), 'Staff Member')
        LIMIT 5
    ) sub;

    -- ── 9. ROW 9: MARKETING ANALYTICS (Using discount_usages with fallback) ──
    -- 1. Primary Query: discount_usages table
    SELECT 
        COUNT(*) FILTER (WHERE LOWER(TRIM(discount_type)) = 'coupon' AND status <> 'reversed'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(discount_type)) = 'offer' AND status <> 'reversed'),
        GREATEST(0, COALESCE(SUM(CASE WHEN status <> 'reversed' THEN discount_amount - reversal_amount ELSE 0 END), 0))
    INTO v_mkt_coupons, v_mkt_offers, v_mkt_discounts
    FROM app.discount_usages
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND COALESCE(used_at, created_at)::date BETWEEN v_start_date AND v_end_date;

    SELECT 
        COUNT(*) FILTER (WHERE LOWER(TRIM(discount_type)) = 'coupon' AND status <> 'reversed'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(discount_type)) = 'offer' AND status <> 'reversed'),
        GREATEST(0, COALESCE(SUM(CASE WHEN status <> 'reversed' THEN discount_amount - reversal_amount ELSE 0 END), 0))
    INTO v_prev_mkt_coupons, v_prev_mkt_offers, v_prev_mkt_disc
    FROM app.discount_usages
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND COALESCE(used_at, created_at)::date BETWEEN v_prev_start_date AND v_prev_end_date;

    -- 2. Fallback: If discount_usages has zero records
    IF v_mkt_coupons = 0 AND v_mkt_offers = 0 AND v_mkt_discounts = 0 THEN
        -- Fallback Coupons
        SELECT COUNT(*) INTO v_mkt_coupons
        FROM (
            SELECT 1 FROM app.bookings_for_business_transaction 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND booking_date BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
              AND (booking_status IS NULL OR LOWER(TRIM(booking_status)) <> 'cancelled')
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
            UNION ALL
            SELECT 1 FROM app.sales_for_business_transactions 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND created_at::date BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('cancelled', 'refunded'))
            UNION ALL
            SELECT 1 FROM app.membership_purchases
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND COALESCE(purchase_date, created_at::date) BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
        ) c_fallback;

        SELECT COUNT(*) INTO v_prev_mkt_coupons
        FROM (
            SELECT 1 FROM app.bookings_for_business_transaction 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
            UNION ALL
            SELECT 1 FROM app.sales_for_business_transactions 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
            UNION ALL
            SELECT 1 FROM app.membership_purchases
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND COALESCE(purchase_date, created_at::date) BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%coupon%'
        ) c_prev_fallback;

        -- Fallback Offers
        SELECT COUNT(*) INTO v_mkt_offers
        FROM (
            SELECT 1 FROM app.bookings_for_business_transaction 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND booking_date BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%offer%'
              AND (booking_status IS NULL OR LOWER(TRIM(booking_status)) <> 'cancelled')
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
            UNION ALL
            SELECT 1 FROM app.sales_for_business_transactions 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND created_at::date BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%offer%'
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('cancelled', 'refunded'))
            UNION ALL
            SELECT 1 FROM app.membership_purchases
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND COALESCE(purchase_date, created_at::date) BETWEEN v_start_date AND v_end_date
              AND LOWER(discount_type) LIKE '%offer%'
              AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
        ) o_fallback;

        SELECT COUNT(*) INTO v_prev_mkt_offers
        FROM (
            SELECT 1 FROM app.bookings_for_business_transaction 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%offer%'
            UNION ALL
            SELECT 1 FROM app.sales_for_business_transactions 
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%offer%'
            UNION ALL
            SELECT 1 FROM app.membership_purchases
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND COALESCE(purchase_date, created_at::date) BETWEEN v_prev_start_date AND v_prev_end_date
              AND LOWER(discount_type) LIKE '%offer%'
        ) o_prev_fallback;

        -- Fallback Total Discounts
        SELECT COALESCE(SUM(discount_amount), 0) INTO v_mkt_discounts
        FROM app.business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND DATE(COALESCE(paid_at, created_at)) BETWEEN v_start_date AND v_end_date
          AND status = 'paid';

        SELECT COALESCE(SUM(discount_amount), 0) INTO v_prev_mkt_disc
        FROM app.business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND DATE(COALESCE(paid_at, created_at)) BETWEEN v_prev_start_date AND v_prev_end_date
          AND status = 'paid';
    END IF;

    -- Memberships Purchased (acquisition channel)
    v_mkt_memberships := v_act_memberships;
    v_prev_mkt_memb   := v_prev_act_memb;

    -- ── 10. CONSTRUCT COMPLETE JSON RETURN OBJECT ─────────────────────────────
    v_result := jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', v_start_date,
            'end_date', v_end_date,
            'prev_start_date', v_prev_start_date,
            'prev_end_date', v_prev_end_date,
            'days', v_period_days
        ),
        'revenue_summary', jsonb_build_object(
            'total_revenue',        v_rev_total,
            'total_growth_pct',     CASE WHEN v_prev_rev_total > 0 THEN ROUND(((v_rev_total - v_prev_rev_total) / v_prev_rev_total) * 100, 1) WHEN v_prev_rev_total = 0 AND v_rev_total > 0 THEN 100.0 ELSE 0.0 END,
            'bookings_revenue',     v_rev_bookings,
            'bookings_growth_pct',  CASE WHEN v_prev_rev_book > 0 THEN ROUND(((v_rev_bookings - v_prev_rev_book) / v_prev_rev_book) * 100, 1) WHEN v_prev_rev_book = 0 AND v_rev_bookings > 0 THEN 100.0 ELSE 0.0 END,
            'products_revenue',     v_rev_products,
            'products_growth_pct',  CASE WHEN v_prev_rev_prod > 0 THEN ROUND(((v_rev_products - v_prev_rev_prod) / v_prev_rev_prod) * 100, 1) WHEN v_prev_rev_prod = 0 AND v_rev_products > 0 THEN 100.0 ELSE 0.0 END,
            'memberships_revenue',  v_rev_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_rev_memb > 0 THEN ROUND(((v_rev_memberships - v_prev_rev_memb) / v_prev_rev_memb) * 100, 1) WHEN v_prev_rev_memb = 0 AND v_rev_memberships > 0 THEN 100.0 ELSE 0.0 END
        ),
        'expenses_net_revenue', jsonb_build_object(
            'total_expenses',       v_total_expenses,
            'expenses_growth_pct',  CASE WHEN v_prev_expenses > 0 THEN ROUND(((v_total_expenses - v_prev_expenses) / v_prev_expenses) * 100, 1) WHEN v_prev_expenses = 0 AND v_total_expenses > 0 THEN 100.0 ELSE 0.0 END,
            'net_revenue',          v_net_revenue,
            'net_growth_pct',       CASE WHEN v_prev_net_rev > 0 THEN ROUND(((v_net_revenue - v_prev_net_rev) / v_prev_net_rev) * 100, 1) WHEN v_prev_net_rev = 0 AND v_net_revenue > 0 THEN 100.0 ELSE 0.0 END
        ),
        'rev_exp_analysis', jsonb_build_object(
            'timeline', v_chart_timeline,
            'revenue_distribution', jsonb_build_object(
                'bookings',    v_rev_bookings,
                'products',    v_rev_products,
                'memberships', v_rev_memberships
            ),
            'expense_breakdown', v_expense_cats
        ),
        'business_activity', jsonb_build_object(
            'total_bookings',         v_act_bookings,
            'bookings_growth_pct',    CASE WHEN v_prev_act_book > 0 THEN ROUND(((v_act_bookings - v_prev_act_book)::numeric / v_prev_act_book::numeric) * 100, 1) WHEN v_prev_act_book = 0 AND v_act_bookings > 0 THEN 100.0 ELSE 0.0 END,
            'bookings_breakdown',     jsonb_build_object(
                'completed', v_bk_completed,
                'cancelled', v_bk_cancelled,
                'no_show',   v_bk_noshow,
                'refunded',  v_bk_refunded
            ),
            'products_sold',          v_act_products,
            'products_growth_pct',    CASE WHEN v_prev_act_prod > 0 THEN ROUND(((v_act_products - v_prev_act_prod)::numeric / v_prev_act_prod::numeric) * 100, 1) WHEN v_prev_act_prod = 0 AND v_act_products > 0 THEN 100.0 ELSE 0.0 END,
            'products_breakdown',     jsonb_build_object(
                'completed', v_pr_completed,
                'refunded',  v_pr_refunded
            ),
            'memberships_purchased',  v_act_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_act_memb > 0 THEN ROUND(((v_act_memberships - v_prev_act_memb)::numeric / v_prev_act_memb::numeric) * 100, 1) WHEN v_prev_act_memb = 0 AND v_act_memberships > 0 THEN 100.0 ELSE 0.0 END,
            'memberships_breakdown',  jsonb_build_object(
                'active',    v_mb_active,
                'refunded',  v_mb_refunded
            )
        ),
        'sources_trend', v_sources_trend,
        'top_performers', jsonb_build_object(
            'services',    v_top_services,
            'products',    v_top_products,
            'memberships', v_top_memberships
        ),
        'customer_analytics', jsonb_build_object(
            'total_customers',      v_cust_total,
            'total_growth_pct',     CASE WHEN v_prev_cust_total > 0 THEN ROUND(((v_cust_total - v_prev_cust_total)::numeric / v_prev_cust_total::numeric) * 100, 1) WHEN v_prev_cust_total = 0 AND v_cust_total > 0 THEN 100.0 ELSE 0.0 END,
            'regular_customers',    v_cust_regular,
            'regular_growth_pct',   CASE WHEN v_prev_cust_regular > 0 THEN ROUND(((v_cust_regular - v_prev_cust_regular)::numeric / v_prev_cust_regular::numeric) * 100, 1) WHEN v_prev_cust_regular = 0 AND v_cust_regular > 0 THEN 100.0 ELSE 0.0 END,
            'vip_customers',        v_cust_vip,
            'vip_growth_pct',       CASE WHEN v_prev_cust_vip > 0 THEN ROUND(((v_cust_vip - v_prev_cust_vip)::numeric / v_prev_cust_vip::numeric) * 100, 1) WHEN v_prev_cust_vip = 0 AND v_cust_vip > 0 THEN 100.0 ELSE 0.0 END,
            'loyal_customers',      v_cust_loyal,
            'loyal_growth_pct',     CASE WHEN v_prev_cust_loyal > 0 THEN ROUND(((v_cust_loyal - v_prev_cust_loyal)::numeric / v_prev_cust_loyal::numeric) * 100, 1) WHEN v_prev_cust_loyal = 0 AND v_cust_loyal > 0 THEN 100.0 ELSE 0.0 END,
            -- Backward compatibility keys
            'new_customers',        v_cust_new,
            'new_growth_pct',       CASE WHEN v_prev_cust_new > 0 THEN ROUND(((v_cust_new - v_prev_cust_new)::numeric / v_prev_cust_new::numeric) * 100, 1) WHEN v_prev_cust_new = 0 AND v_cust_new > 0 THEN 100.0 ELSE 0.0 END,
            'returning_customers',  v_cust_returning,
            'returning_growth_pct', CASE WHEN v_prev_cust_ret > 0 THEN ROUND(((v_cust_returning - v_prev_cust_ret)::numeric / v_prev_cust_ret::numeric) * 100, 1) WHEN v_prev_cust_ret = 0 AND v_cust_returning > 0 THEN 100.0 ELSE 0.0 END,
            'repeat_visit_rate',    v_cust_repeat_rate,
            'repeat_growth_pct',    CASE WHEN v_prev_cust_repeat > 0 THEN ROUND((v_cust_repeat_rate - v_prev_cust_repeat), 1) WHEN v_prev_cust_repeat = 0 AND v_cust_repeat_rate > 0 THEN 100.0 ELSE 0.0 END
        ),
        'staff_analytics', jsonb_build_object(
            'total_staff',            v_staff_total,
            'completed_appointments', v_staff_completed,
            'completed_growth_pct',   CASE WHEN v_prev_staff_completed > 0 THEN ROUND(((v_staff_completed - v_prev_staff_completed)::numeric / v_prev_staff_completed::numeric) * 100, 1) WHEN v_prev_staff_completed = 0 AND v_staff_completed > 0 THEN 100.0 ELSE 0.0 END,
            'staff_service_revenue',  v_staff_revenue,
            'revenue_growth_pct',     CASE WHEN v_prev_staff_rev > 0 THEN ROUND(((v_staff_revenue - v_prev_staff_rev) / v_prev_staff_rev) * 100, 1) WHEN v_prev_staff_rev = 0 AND v_staff_revenue > 0 THEN 100.0 ELSE 0.0 END,
            'top_staff',              v_top_staff
        ),
        'marketing_analytics', jsonb_build_object(
            'coupons_redeemed',       v_mkt_coupons,
            'coupons_growth_pct',     CASE WHEN v_prev_mkt_coupons > 0 THEN ROUND(((v_mkt_coupons - v_prev_mkt_coupons)::numeric / v_prev_mkt_coupons::numeric) * 100, 1) WHEN v_prev_mkt_coupons = 0 AND v_mkt_coupons > 0 THEN 100.0 ELSE 0.0 END,
            'memberships_purchased',  v_mkt_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_mkt_memb > 0 THEN ROUND(((v_mkt_memberships - v_prev_mkt_memb)::numeric / v_prev_mkt_memb::numeric) * 100, 1) WHEN v_prev_mkt_memb = 0 AND v_mkt_memberships > 0 THEN 100.0 ELSE 0.0 END,
            'offer_redemptions',      v_mkt_offers,
            'offers_growth_pct',      CASE WHEN v_prev_mkt_offers > 0 THEN ROUND(((v_mkt_offers - v_prev_mkt_offers)::numeric / v_prev_mkt_offers::numeric) * 100, 1) WHEN v_prev_mkt_offers = 0 AND v_mkt_offers > 0 THEN 100.0 ELSE 0.0 END,
            'total_discounts_given',  v_mkt_discounts,
            'discounts_growth_pct',   CASE WHEN v_prev_mkt_disc > 0 THEN ROUND(((v_mkt_discounts - v_prev_mkt_disc) / v_prev_mkt_disc) * 100, 1) WHEN v_prev_mkt_disc = 0 AND v_mkt_discounts > 0 THEN 100.0 ELSE 0.0 END
        )
    );

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 2. Public Schema Wrapper (Preserving parameter order & names)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_analytics_overview(
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_company_id  uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT ((CURRENT_DATE - INTERVAL '15 days'))::date,
    p_end_date    date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN app.get_analytics_overview(
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
REVOKE ALL ON FUNCTION app.get_analytics_overview(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_analytics_overview(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_analytics_overview(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_overview(uuid, uuid, date, date) TO authenticated, service_role;
