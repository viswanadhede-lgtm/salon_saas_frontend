-- ============================================================================
-- RPC FUNCTION: public.overview_analytics
-- Purpose: Complete single round-trip Master RPC for Analytics Business Overview.
-- Covers all 9 Rows with strict net revenue accounting (subtracting refunds)
-- and comparison against the preceding date window.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.overview_analytics(
    p_branch_id  uuid DEFAULT NULL,
    p_company_id uuid DEFAULT NULL,
    p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '15 days')::date,
    p_end_date   date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Comparison timeframe (previous equal period)
    v_period_days      int;
    v_prev_end_date    date;
    v_prev_start_date  date;

    -- Row 1: Revenue Summary
    v_rev_bookings     numeric := 0;
    v_rev_products     numeric := 0;
    v_rev_memberships  numeric := 0;
    v_rev_total        numeric := 0;
    v_prev_rev_total   numeric := 0;
    v_prev_rev_book    numeric := 0;
    v_prev_rev_prod    numeric := 0;
    v_prev_rev_memb    numeric := 0;

    -- Row 2: Expenses & Net Revenue
    v_total_expenses   numeric := 0;
    v_prev_expenses    numeric := 0;
    v_net_revenue      numeric := 0;
    v_prev_net_rev     numeric := 0;

    -- Row 3: Revenue & Expense Breakdown
    v_chart_timeline   jsonb := '[]'::jsonb;
    v_expense_cats     jsonb := '[]'::jsonb;

    -- Row 4: Business Activity
    v_act_bookings     bigint := 0;
    v_act_products     bigint := 0;
    v_act_memberships  bigint := 0;
    v_prev_act_book    bigint := 0;
    v_prev_act_prod    bigint := 0;
    v_prev_act_memb    bigint := 0;

    -- Row 5: Sources Trend
    v_sources_trend    jsonb := '[]'::jsonb;

    -- Row 6: Top 5 Performers
    v_top_services     jsonb := '[]'::jsonb;
    v_top_products     jsonb := '[]'::jsonb;
    v_top_memberships  jsonb := '[]'::jsonb;

    -- Row 7: Customer Analytics
    v_cust_total       bigint := 0;
    v_cust_new         bigint := 0;
    v_cust_returning   bigint := 0;
    v_cust_repeat_rate numeric := 0;

    -- Row 8: Staff Analytics
    v_staff_total      bigint := 0;
    v_staff_completed  bigint := 0;
    v_staff_revenue    numeric := 0;
    v_top_staff        jsonb := '[]'::jsonb;

    -- Row 9: Marketing Analytics
    v_mkt_coupons      bigint := 0;
    v_prev_mkt_coupons bigint := 0;
    v_mkt_memberships  bigint := 0;
    v_prev_mkt_memb    bigint := 0;
    v_mkt_offers       bigint := 0;
    v_prev_mkt_offers  bigint := 0;
    v_mkt_discounts    numeric := 0;
    v_prev_mkt_disc    numeric := 0;

    -- Result JSON object
    v_result           jsonb;
BEGIN
    -- -- 0. TIME WINDOW CALCULATIONS -------------------------------------------
    v_period_days     := GREATEST(1, (p_end_date - p_start_date) + 1);
    v_prev_end_date   := p_start_date - 1;
    v_prev_start_date := v_prev_end_date - v_period_days + 1;

    -- -- 1. ROW 1: REVENUE SUMMARY (Net = Paid minus Refunded) ----------------
    -- Current Period
    SELECT
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'booking' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'booking' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0)),
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'product' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'product' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0)),
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'membership' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'membership' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0))
    INTO v_rev_bookings, v_rev_products, v_rev_memberships
    FROM public.business_transactions
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
      AND status IN ('paid', 'refunded');

    v_rev_total := v_rev_bookings + v_rev_products + v_rev_memberships;

    -- Previous Period (for Growth % badges)
    SELECT
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'booking' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'booking' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0)),
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'product' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'product' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0)),
        GREATEST(0, COALESCE(SUM(CASE 
            WHEN status = 'paid' AND reference_type = 'membership' THEN COALESCE(final_amount, amount, 0)
            WHEN status = 'refunded' AND reference_type = 'membership' THEN -COALESCE(final_amount, amount, 0)
            ELSE 0 END), 0))
    INTO v_prev_rev_book, v_prev_rev_prod, v_prev_rev_memb
    FROM public.business_transactions
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND DATE(COALESCE(paid_at, created_at)) BETWEEN v_prev_start_date AND v_prev_end_date
      AND status IN ('paid', 'refunded');

    v_prev_rev_total := v_prev_rev_book + v_prev_rev_prod + v_prev_rev_memb;

    -- -- 2. ROW 2: EXPENSES & NET REVENUE --------------------------------------
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM public.expenses
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND date BETWEEN p_start_date AND p_end_date
      AND (status IS NULL OR status <> 'deleted');

    SELECT COALESCE(SUM(amount), 0) INTO v_prev_expenses
    FROM public.expenses
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND date BETWEEN v_prev_start_date AND v_prev_end_date
      AND (status IS NULL OR status <> 'deleted');

    v_net_revenue  := v_rev_total - v_total_expenses;
    v_prev_net_rev := v_prev_rev_total - v_prev_expenses;

    -- -- 3. ROW 3: REVENUE & EXPENSE ANALYSIS ----------------------------------
    -- Daily Net Revenue & Expenses Timeline
    WITH daily_calendar AS (
        SELECT generate_series(p_start_date, p_end_date, INTERVAL '1 day')::date AS d_date
    ),
    daily_rev AS (
        SELECT 
            DATE(COALESCE(paid_at, created_at)) AS tx_date,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN status = 'paid' THEN COALESCE(final_amount, amount, 0)
                WHEN status = 'refunded' THEN -COALESCE(final_amount, amount, 0)
                ELSE 0 END), 0)) AS net_rev
        FROM public.business_transactions
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
          AND status IN ('paid', 'refunded')
        GROUP BY DATE(COALESCE(paid_at, created_at))
    ),
    daily_exp AS (
        SELECT date AS exp_date, COALESCE(SUM(amount), 0) AS total_exp
        FROM public.expenses
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND date BETWEEN p_start_date AND p_end_date
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
        FROM public.expenses
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND date BETWEEN p_start_date AND p_end_date
          AND (status IS NULL OR status <> 'deleted')
        GROUP BY category
    ) sub;

    -- -- 4. ROW 4: BUSINESS ACTIVITY -------------------------------------------
    -- Total Bookings
    SELECT COUNT(*) INTO v_act_bookings
    FROM public.bookings_for_business_transaction
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
      AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded');

    SELECT COUNT(*) INTO v_prev_act_book
    FROM public.bookings_for_business_transaction
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
      AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded');

    -- Products Sold (Sum of physical units)
    SELECT COALESCE(SUM(quantity), 0) INTO v_act_products
    FROM public.sales
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at::date BETWEEN p_start_date AND p_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('refunded', 'cancelled'));

    SELECT COALESCE(SUM(quantity), 0) INTO v_prev_act_prod
    FROM public.sales
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('refunded', 'cancelled'));

    -- Memberships Purchased
    SELECT COUNT(*) INTO v_act_memberships
    FROM public.membership_purchases
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND COALESCE(purchase_date, created_at::date) BETWEEN p_start_date AND p_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
      AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded');

    SELECT COUNT(*) INTO v_prev_act_memb
    FROM public.membership_purchases
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND COALESCE(purchase_date, created_at::date) BETWEEN v_prev_start_date AND v_prev_end_date
      AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
      AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded');

    -- -- 5. ROW 5: REVENUE TREND BY BUSINESS SOURCE ---------------------------
    WITH daily_calendar AS (
        SELECT generate_series(p_start_date, p_end_date, INTERVAL '1 day')::date AS d_date
    ),
    daily_sources AS (
        SELECT 
            DATE(COALESCE(paid_at, created_at)) AS tx_date,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN status = 'paid' AND reference_type = 'booking' THEN COALESCE(final_amount, amount, 0)
                WHEN status = 'refunded' AND reference_type = 'booking' THEN -COALESCE(final_amount, amount, 0)
                ELSE 0 END), 0)) AS bookings_rev,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN status = 'paid' AND reference_type = 'product' THEN COALESCE(final_amount, amount, 0)
                WHEN status = 'refunded' AND reference_type = 'product' THEN -COALESCE(final_amount, amount, 0)
                ELSE 0 END), 0)) AS products_rev,
            GREATEST(0, COALESCE(SUM(CASE 
                WHEN status = 'paid' AND reference_type = 'membership' THEN COALESCE(final_amount, amount, 0)
                WHEN status = 'refunded' AND reference_type = 'membership' THEN -COALESCE(final_amount, amount, 0)
                ELSE 0 END), 0)) AS memberships_rev
        FROM public.business_transactions
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
          AND status IN ('paid', 'refunded')
        GROUP BY DATE(COALESCE(paid_at, created_at))
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

    -- -- 6. ROW 6: TOP 5 PERFORMERS -------------------------------------------
    -- Top 5 Services (from bookings)
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
        FROM public.bookings
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
        GROUP BY COALESCE(NULLIF(TRIM(service_name), ''), 'Other Service')
        LIMIT 5
    ) sub;

    -- Top 5 Products (from sales)
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
            ROW_NUMBER() OVER (ORDER BY SUM(COALESCE(quantity, 1)) DESC, SUM(COALESCE(total_amount, price * quantity, 0)) DESC) AS r,
            COALESCE(NULLIF(TRIM(product_name), ''), 'Other Product') AS product_name,
            SUM(COALESCE(quantity, 1)) AS units_sold,
            COALESCE(SUM(COALESCE(total_amount, price * quantity, 0)), 0) AS prod_rev
        FROM public.sales
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN p_start_date AND p_end_date
          AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('refunded', 'cancelled'))
        GROUP BY COALESCE(NULLIF(TRIM(product_name), ''), 'Other Product')
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
        FROM public.membership_purchases
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND COALESCE(purchase_date, created_at::date) BETWEEN p_start_date AND p_end_date
          AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
        GROUP BY COALESCE(NULLIF(TRIM(plan_name), ''), 'Standard Membership')
        LIMIT 5
    ) sub;

    -- -- 7. ROW 7: CUSTOMER ANALYTICS ------------------------------------------
    -- Distinct customers transacting in current period across bookings, sales, and memberships
    SELECT COUNT(DISTINCT customer_id) INTO v_cust_total
    FROM (
        SELECT customer_id 
        FROM public.bookings_for_business_transaction
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND customer_id IS NOT NULL
          AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
        UNION
        SELECT customer_id 
        FROM public.sales_for_business_transactions
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN p_start_date AND p_end_date
          AND customer_id IS NOT NULL
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('cancelled', 'refunded'))
        UNION
        SELECT customer_id 
        FROM public.membership_purchases
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND COALESCE(purchase_date, created_at::date) BETWEEN p_start_date AND p_end_date
          AND customer_id IS NOT NULL
          AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) <> 'refunded')
    ) active_cust;

    -- New customers created during period
    SELECT COUNT(*) INTO v_cust_new
    FROM public.customers
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    v_cust_returning   := GREATEST(0, v_cust_total - v_cust_new);
    v_cust_repeat_rate := CASE 
        WHEN v_cust_total > 0 THEN ROUND((v_cust_returning::numeric / v_cust_total::numeric) * 100, 1)
        ELSE 0 
    END;

    -- -- 8. ROW 8: STAFF ANALYTICS ---------------------------------------------
    SELECT COUNT(*) INTO v_staff_total
    FROM public.staff
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND (status IS NULL OR LOWER(TRIM(status)) = 'active');

    -- Completed appointments & service revenue
    SELECT 
        COUNT(*),
        COALESCE(SUM(COALESCE(price, 0)), 0)
    INTO v_staff_completed, v_staff_revenue
    FROM public.bookings
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date
      AND LOWER(TRIM(status)) = 'completed';

    -- Top 3-5 Staff Leaderboard
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
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, SUM(COALESCE(b.price, 0)) DESC) AS r,
            COALESCE(NULLIF(TRIM(b.staff_name), ''), 'Staff Member') AS staff_name,
            COUNT(*) AS completed_count,
            COALESCE(SUM(COALESCE(b.price, 0)), 0) AS staff_rev
        FROM public.bookings b
        WHERE (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND (p_company_id IS NULL OR b.company_id = p_company_id)
          AND b.booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(b.status)) = 'completed'
        GROUP BY COALESCE(NULLIF(TRIM(b.staff_name), ''), 'Staff Member')
        LIMIT 5
    ) sub;

    -- -- 9. ROW 9: MARKETING ANALYTICS -----------------------------------------
    -- 1. Coupons Redeemed
    SELECT COUNT(*) INTO v_mkt_coupons
    FROM (
        SELECT 1 FROM public.bookings_for_business_transaction 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND (LOWER(discount_type) LIKE '%coupon%' OR discount_name IS NOT NULL)
          AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
        UNION ALL
        SELECT 1 FROM public.sales_for_business_transactions 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN p_start_date AND p_end_date
          AND (LOWER(discount_type) LIKE '%coupon%' OR discount_name IS NOT NULL)
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('cancelled', 'refunded'))
    ) c_curr;

    SELECT COUNT(*) INTO v_prev_mkt_coupons
    FROM (
        SELECT 1 FROM public.bookings_for_business_transaction 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
          AND (LOWER(discount_type) LIKE '%coupon%' OR discount_name IS NOT NULL)
        UNION ALL
        SELECT 1 FROM public.sales_for_business_transactions 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
          AND (LOWER(discount_type) LIKE '%coupon%' OR discount_name IS NOT NULL)
    ) c_prev;

    -- 2. Memberships Purchased (via marketing/promotions)
    v_mkt_memberships := v_act_memberships;
    v_prev_mkt_memb   := v_prev_act_memb;

    -- 3. Offer Redemptions
    SELECT COUNT(*) INTO v_mkt_offers
    FROM (
        SELECT 1 FROM public.bookings_for_business_transaction 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(discount_type) LIKE '%offer%'
          AND (status IS NULL OR LOWER(TRIM(status)) <> 'cancelled')
        UNION ALL
        SELECT 1 FROM public.sales_for_business_transactions 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN p_start_date AND p_end_date
          AND LOWER(discount_type) LIKE '%offer%'
          AND (payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('cancelled', 'refunded'))
    ) o_curr;

    SELECT COUNT(*) INTO v_prev_mkt_offers
    FROM (
        SELECT 1 FROM public.bookings_for_business_transaction 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN v_prev_start_date AND v_prev_end_date
          AND LOWER(discount_type) LIKE '%offer%'
        UNION ALL
        SELECT 1 FROM public.sales_for_business_transactions 
        WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at::date BETWEEN v_prev_start_date AND v_prev_end_date
          AND LOWER(discount_type) LIKE '%offer%'
    ) o_prev;

    -- 4. Total Discounts Given (across business_transactions)
    SELECT COALESCE(SUM(discount_amount), 0) INTO v_mkt_discounts
    FROM public.business_transactions
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
      AND status = 'paid';

    SELECT COALESCE(SUM(discount_amount), 0) INTO v_prev_mkt_disc
    FROM public.business_transactions
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND DATE(COALESCE(paid_at, created_at)) BETWEEN v_prev_start_date AND v_prev_end_date
      AND status = 'paid';


    -- -- 10. CONSTRUCT COMPLETE JSON RETURN OBJECT -----------------------------
    v_result := jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'prev_start_date', v_prev_start_date,
            'prev_end_date', v_prev_end_date,
            'days', v_period_days
        ),
        'revenue_summary', jsonb_build_object(
            'total_revenue', v_rev_total,
            'total_growth_pct', CASE WHEN v_prev_rev_total > 0 THEN ROUND(((v_rev_total - v_prev_rev_total) / v_prev_rev_total) * 100, 1) ELSE 0 END,
            'bookings_revenue', v_rev_bookings,
            'bookings_growth_pct', CASE WHEN v_prev_rev_book > 0 THEN ROUND(((v_rev_bookings - v_prev_rev_book) / v_prev_rev_book) * 100, 1) ELSE 0 END,
            'products_revenue', v_rev_products,
            'products_growth_pct', CASE WHEN v_prev_rev_prod > 0 THEN ROUND(((v_rev_products - v_prev_rev_prod) / v_prev_rev_prod) * 100, 1) ELSE 0 END,
            'memberships_revenue', v_rev_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_rev_memb > 0 THEN ROUND(((v_rev_memberships - v_prev_rev_memb) / v_prev_rev_memb) * 100, 1) ELSE 0 END
        ),
        'expenses_net_revenue', jsonb_build_object(
            'total_expenses', v_total_expenses,
            'expenses_growth_pct', CASE WHEN v_prev_expenses > 0 THEN ROUND(((v_total_expenses - v_prev_expenses) / v_prev_expenses) * 100, 1) ELSE 0 END,
            'net_revenue', v_net_revenue,
            'net_growth_pct', CASE WHEN v_prev_net_rev > 0 THEN ROUND(((v_net_revenue - v_prev_net_rev) / v_prev_net_rev) * 100, 1) ELSE 0 END
        ),
        'rev_exp_analysis', jsonb_build_object(
            'timeline', v_chart_timeline,
            'revenue_distribution', jsonb_build_object(
                'bookings', v_rev_bookings,
                'products', v_rev_products,
                'memberships', v_rev_memberships
            ),
            'expense_breakdown', v_expense_cats
        ),
        'business_activity', jsonb_build_object(
            'total_bookings', v_act_bookings,
            'bookings_growth_pct', CASE WHEN v_prev_act_book > 0 THEN ROUND(((v_act_bookings - v_prev_act_book)::numeric / v_prev_act_book::numeric) * 100, 1) ELSE 0 END,
            'products_sold', v_act_products,
            'products_growth_pct', CASE WHEN v_prev_act_prod > 0 THEN ROUND(((v_act_products - v_prev_act_prod)::numeric / v_prev_act_prod::numeric) * 100, 1) ELSE 0 END,
            'memberships_purchased', v_act_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_act_memb > 0 THEN ROUND(((v_act_memberships - v_prev_act_memb)::numeric / v_prev_act_memb::numeric) * 100, 1) ELSE 0 END
        ),
        'sources_trend', v_sources_trend,
        'top_performers', jsonb_build_object(
            'services', v_top_services,
            'products', v_top_products,
            'memberships', v_top_memberships
        ),
        'customer_analytics', jsonb_build_object(
            'total_customers', v_cust_total,
            'new_customers', v_cust_new,
            'returning_customers', v_cust_returning,
            'repeat_visit_rate', v_cust_repeat_rate
        ),
        'staff_analytics', jsonb_build_object(
            'total_staff', v_staff_total,
            'completed_appointments', v_staff_completed,
            'staff_service_revenue', v_staff_revenue,
            'top_staff', v_top_staff
        ),
        'marketing_analytics', jsonb_build_object(
            'coupons_redeemed', v_mkt_coupons,
            'coupons_growth_pct', CASE WHEN v_prev_mkt_coupons > 0 THEN ROUND(((v_mkt_coupons - v_prev_mkt_coupons)::numeric / v_prev_mkt_coupons::numeric) * 100, 1) ELSE 0 END,
            'memberships_purchased', v_mkt_memberships,
            'memberships_growth_pct', CASE WHEN v_prev_mkt_memb > 0 THEN ROUND(((v_mkt_memberships - v_prev_mkt_memb)::numeric / v_prev_mkt_memb::numeric) * 100, 1) ELSE 0 END,
            'offer_redemptions', v_mkt_offers,
            'offers_growth_pct', CASE WHEN v_prev_mkt_offers > 0 THEN ROUND(((v_mkt_offers - v_prev_mkt_offers)::numeric / v_prev_mkt_offers::numeric) * 100, 1) ELSE 0 END,
            'total_discounts_given', v_mkt_discounts,
            'discounts_growth_pct', CASE WHEN v_prev_mkt_disc > 0 THEN ROUND(((v_mkt_discounts - v_prev_mkt_disc) / v_prev_mkt_disc) * 100, 1) ELSE 0 END
        )
    );

    RETURN v_result;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.overview_analytics(uuid, uuid, date, date) TO authenticated, service_role, anon;

-- Alias: get_analytics_overview
CREATE OR REPLACE FUNCTION public.get_analytics_overview(
    p_branch_id  uuid DEFAULT NULL,
    p_company_id uuid DEFAULT NULL,
    p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '15 days')::date,
    p_end_date   date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.overview_analytics(p_branch_id, p_company_id, p_start_date, p_end_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_overview(uuid, uuid, date, date) TO authenticated, service_role, anon;

