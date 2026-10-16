-- ============================================================================
-- RPC Function: get_expenses_stat_cards
-- Description: Aggregates the 4 executive stat cards for the Expenses module:
--   1. Today's Expenses (+ % change vs yesterday)
--   2. This Month's Expenses (+ % change vs last month)
--   3. Total Lifetime Expenses
--   4. Top Expense Category (Category name, amount, % of total)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_expenses_stat_cards(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_timezone text DEFAULT 'Asia/Kolkata'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Dates based on salon timezone
    v_today date;
    v_yesterday date;
    v_this_month_start date;
    v_this_month_end date;
    v_last_month_start date;
    v_last_month_end date;

    -- Card 1: Today
    v_today_total numeric := 0;
    v_yesterday_total numeric := 0;
    v_today_trend_pct numeric := 0;
    v_today_trend_direction text := 'flat'; -- 'up', 'down', 'flat'

    -- Card 2: This Month
    v_this_month_total numeric := 0;
    v_last_month_total numeric := 0;
    v_this_month_trend_pct numeric := 0;
    v_this_month_trend_direction text := 'flat'; -- 'up', 'down', 'flat'

    -- Card 3: Lifetime Total
    v_lifetime_total numeric := 0;

    -- Card 4: Top Category
    v_top_category_name text := NULL;
    v_top_category_total numeric := 0;
    v_top_category_pct numeric := 0;
BEGIN
    -- 1. Resolve local calendar dates using the salon's timezone
    v_today := (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata'))::date;
    v_yesterday := v_today - 1;
    
    v_this_month_start := date_trunc('month', v_today)::date;
    v_this_month_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
    
    v_last_month_start := (date_trunc('month', v_today) - interval '1 month')::date;
    v_last_month_end := (date_trunc('month', v_today) - interval '1 day')::date;

    -- 2. Aggregate Today, Yesterday, This Month, Last Month, and Lifetime Total
    SELECT
        COALESCE(SUM(CASE WHEN e.date = v_today THEN e.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN e.date = v_yesterday THEN e.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN e.date >= v_this_month_start AND e.date <= v_this_month_end THEN e.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN e.date >= v_last_month_start AND e.date <= v_last_month_end THEN e.amount ELSE 0 END), 0),
        COALESCE(SUM(e.amount), 0)
    INTO
        v_today_total,
        v_yesterday_total,
        v_this_month_total,
        v_last_month_total,
        v_lifetime_total
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND COALESCE(e.status, 'active') <> 'deleted';

    -- 3. Calculate Trend for Today vs Yesterday
    IF v_yesterday_total = 0 AND v_today_total = 0 THEN
        v_today_trend_pct := 0;
        v_today_trend_direction := 'flat';
    ELSIF v_yesterday_total = 0 AND v_today_total > 0 THEN
        v_today_trend_pct := 100;
        v_today_trend_direction := 'up';
    ELSIF v_today_total = 0 AND v_yesterday_total > 0 THEN
        v_today_trend_pct := 100;
        v_today_trend_direction := 'down';
    ELSE
        v_today_trend_pct := ROUND(ABS(((v_today_total - v_yesterday_total) / v_yesterday_total) * 100.0), 1);
        IF v_today_total > v_yesterday_total THEN
            v_today_trend_direction := 'up';
        ELSIF v_today_total < v_yesterday_total THEN
            v_today_trend_direction := 'down';
        ELSE
            v_today_trend_direction := 'flat';
        END IF;
    END IF;

    -- 4. Calculate Trend for This Month vs Last Month
    IF v_last_month_total = 0 AND v_this_month_total = 0 THEN
        v_this_month_trend_pct := 0;
        v_this_month_trend_direction := 'flat';
    ELSIF v_last_month_total = 0 AND v_this_month_total > 0 THEN
        v_this_month_trend_pct := 100;
        v_this_month_trend_direction := 'up';
    ELSIF v_this_month_total = 0 AND v_last_month_total > 0 THEN
        v_this_month_trend_pct := 100;
        v_this_month_trend_direction := 'down';
    ELSE
        v_this_month_trend_pct := ROUND(ABS(((v_this_month_total - v_last_month_total) / v_last_month_total) * 100.0), 1);
        IF v_this_month_total > v_last_month_total THEN
            v_this_month_trend_direction := 'up';
        ELSIF v_this_month_total < v_last_month_total THEN
            v_this_month_trend_direction := 'down';
        ELSE
            v_this_month_trend_direction := 'flat';
        END IF;
    END IF;

    -- 5. Find Top Expense Category (Lifetime)
    SELECT
        COALESCE(e.category, 'Other'),
        COALESCE(SUM(e.amount), 0)
    INTO
        v_top_category_name,
        v_top_category_total
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND COALESCE(e.status, 'active') <> 'deleted'
    GROUP BY COALESCE(e.category, 'Other')
    ORDER BY SUM(e.amount) DESC
    LIMIT 1;

    -- 6. Calculate Top Category Percentage of Lifetime Total
    IF v_lifetime_total > 0 AND v_top_category_total > 0 THEN
        v_top_category_pct := ROUND((v_top_category_total / v_lifetime_total) * 100.0, 1);
    ELSE
        v_top_category_pct := 0;
    END IF;

    -- 7. Return JSON response
    RETURN jsonb_build_object(
        'today_expenses', v_today_total,
        'yesterday_expenses', v_yesterday_total,
        'today_trend_pct', v_today_trend_pct,
        'today_trend_direction', v_today_trend_direction,
        'this_month_expenses', v_this_month_total,
        'last_month_expenses', v_last_month_total,
        'this_month_trend_pct', v_this_month_trend_pct,
        'this_month_trend_direction', v_this_month_trend_direction,
        'total_expenses', v_lifetime_total,
        'top_category_name', COALESCE(v_top_category_name, 'None'),
        'top_category_amount', v_top_category_total,
        'top_category_pct', v_top_category_pct
    );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_expenses_stat_cards(uuid, uuid, text) TO authenticated, service_role, anon;

-- Recommended Index for performance
CREATE INDEX IF NOT EXISTS idx_expenses_company_branch_date 
ON public.expenses (company_id, branch_id, date) 
WHERE status <> 'deleted';
