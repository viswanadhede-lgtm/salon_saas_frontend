-- ====================================================================================================
-- DASHBOARD BOTTOM CARDS RPC FUNCTIONS
-- 1. dashboard_weekly_revenue (for Weekly Revenue Bar Chart)
-- 2. dashboard_top_services   (for Top Services This Week & Top Services Today)
-- ====================================================================================================

-- ── 1. RPC: dashboard_weekly_revenue ────────────────────────────────────────────────────────────────
-- Returns 7 chronological days (p_today - 6 days through p_today)
-- Computes Net Daily Revenue: SUM(paid) - SUM(refunded) from business_transactions
-- Floored at 0 to avoid negative bars

CREATE OR REPLACE FUNCTION dashboard_weekly_revenue(
    p_branch_id  uuid,
    p_company_id uuid DEFAULT NULL,
    p_today      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    date       text,
    day_label  text,
    revenue    numeric,
    is_today   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT 
            (p_today - (6 - i))::date AS d_date,
            TO_CHAR((p_today - (6 - i))::date, 'YYYY-MM-DD') AS d_str,
            CASE EXTRACT(DOW FROM (p_today - (6 - i))::date)::int
                WHEN 0 THEN 'S'
                WHEN 1 THEN 'M'
                WHEN 2 THEN 'T'
                WHEN 3 THEN 'W'
                WHEN 4 THEN 'T'
                WHEN 5 THEN 'F'
                WHEN 6 THEN 'S'
            END AS d_label,
            ((p_today - (6 - i))::date = p_today) AS d_is_today
        FROM generate_series(0, 6) AS i
    ),
    tx_agg AS (
        SELECT 
            DATE(COALESCE(paid_at, created_at)) AS tx_date,
            COALESCE(SUM(
                CASE 
                    WHEN status = 'paid' THEN COALESCE(final_amount, amount, 0)
                    WHEN status = 'refunded' THEN -COALESCE(final_amount, amount, 0)
                    ELSE 0
                END
            ), 0) AS net_rev
        FROM business_transactions
        WHERE branch_id = p_branch_id
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND reference_type IN ('booking', 'product', 'membership')
          AND status IN ('paid', 'refunded')
          AND DATE(COALESCE(paid_at, created_at)) >= (p_today - 6)
          AND DATE(COALESCE(paid_at, created_at)) <= p_today
        GROUP BY DATE(COALESCE(paid_at, created_at))
    )
    SELECT 
        ds.d_str AS date,
        ds.d_label AS day_label,
        GREATEST(0, COALESCE(ta.net_rev, 0))::numeric AS revenue,
        ds.d_is_today AS is_today
    FROM date_series ds
    LEFT JOIN tx_agg ta ON ds.d_date = ta.tx_date
    ORDER BY ds.d_date ASC;
END;
$$;


-- ── 2. RPC: dashboard_top_services ──────────────────────────────────────────────────────────────────
-- Returns Top 5 services ranked by booking count (and revenue as tie-breaker)
-- Supports both 'today' and 'week' periods
-- Filters out 'cancelled' and 'no-show' bookings

CREATE OR REPLACE FUNCTION dashboard_top_services(
    p_branch_id  uuid,
    p_company_id uuid DEFAULT NULL,
    p_period     text DEFAULT 'today', -- 'today' or 'week'
    p_today      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    service_name text,
    count        bigint,
    revenue      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date date;
    v_end_date   date;
BEGIN
    IF LOWER(p_period) = 'week' THEN
        v_start_date := (p_today - 6);
        v_end_date   := p_today;
    ELSE
        v_start_date := p_today;
        v_end_date   := p_today;
    END IF;

    RETURN QUERY
    SELECT 
        COALESCE(NULLIF(TRIM(b.service_name), ''), 'Other')::text AS service_name,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(COALESCE(b.price, 0)), 0)::numeric AS revenue
    FROM bookings b
    WHERE b.branch_id = p_branch_id
      AND (p_company_id IS NULL OR b.company_id = p_company_id)
      AND b.booking_date >= v_start_date
      AND b.booking_date <= v_end_date
      AND (b.status IS NULL OR LOWER(TRIM(b.status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
    GROUP BY COALESCE(NULLIF(TRIM(b.service_name), ''), 'Other')
    ORDER BY count DESC, revenue DESC
    LIMIT 5;
END;
$$;
