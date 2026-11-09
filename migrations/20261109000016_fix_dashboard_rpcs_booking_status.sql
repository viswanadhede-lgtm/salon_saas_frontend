-- ============================================================================
-- Migration: 20261109000016_fix_dashboard_rpcs_booking_status.sql
-- Description: Fix column references (status -> booking_status) in
--              dashboard_top_services and dashboard_statcards_four.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dashboard_top_services(
    p_branch_id uuid,
    p_company_id uuid DEFAULT NULL::uuid,
    p_period text DEFAULT 'today'::text,
    p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(service_name text, count bigint, revenue numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $function$
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
    FROM app.bookings b
    WHERE b.branch_id = p_branch_id
      AND (p_company_id IS NULL OR b.company_id = p_company_id)
      AND b.booking_date >= v_start_date
      AND b.booking_date <= v_end_date
      AND (b.booking_status IS NULL OR LOWER(TRIM(b.booking_status)) NOT IN ('cancelled', 'no-show', 'noshow', 'no_show'))
    GROUP BY COALESCE(NULLIF(TRIM(b.service_name), ''), 'Other')
    ORDER BY count DESC, revenue DESC
    LIMIT 5;
END;
$function$;


CREATE OR REPLACE FUNCTION public.dashboard_statcards_four(
    p_branch_id uuid,
    p_company_id uuid
)
RETURNS TABLE(
    todays_bookings bigint,
    completed_appointments bigint,
    no_shows bigint,
    cancelled bigint,
    todays_revenue numeric,
    booking_trend numeric,
    revenue_trend numeric,
    completion_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
    v_today            date    := CURRENT_DATE;
    v_yesterday        date    := CURRENT_DATE - INTERVAL '1 day';

    v_todays_bookings  bigint;
    v_completed        bigint;
    v_no_shows         bigint;
    v_cancelled        bigint;
    v_todays_revenue   numeric;

    v_yest_bookings    bigint;
    v_yest_revenue     numeric;

    v_booking_trend    numeric;
    v_revenue_trend    numeric;
    v_completion_rate  numeric;
BEGIN
    -- 1. TODAY'S COUNTS (all statuses)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE booking_status = 'completed'),
        COUNT(*) FILTER (WHERE booking_status = 'no-show'),
        COUNT(*) FILTER (WHERE booking_status = 'cancelled')
    INTO
        v_todays_bookings,
        v_completed,
        v_no_shows,
        v_cancelled
    FROM app.bookings_for_business_transaction
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND booking_date = v_today;

    -- 2. TODAY'S REVENUE (completed + paid only)
    SELECT COALESCE(SUM(final_amount), 0)
    INTO v_todays_revenue
    FROM app.bookings_for_business_transaction
    WHERE branch_id      = p_branch_id
      AND company_id     = p_company_id
      AND booking_date   = v_today
      AND booking_status = 'completed'
      AND payment_status = 'paid';

    -- 3. YESTERDAY'S COUNTS (for trend)
    SELECT COUNT(*)
    INTO v_yest_bookings
    FROM app.bookings_for_business_transaction
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND booking_date = v_yesterday;

    -- 4. YESTERDAY'S REVENUE (for trend)
    SELECT COALESCE(SUM(final_amount), 0)
    INTO v_yest_revenue
    FROM app.bookings_for_business_transaction
    WHERE branch_id      = p_branch_id
      AND company_id     = p_company_id
      AND booking_date   = v_yesterday
      AND booking_status = 'completed'
      AND payment_status = 'paid';

    -- 5. BOOKING TREND %
    IF COALESCE(v_yest_bookings, 0) = 0 THEN
        v_booking_trend := CASE WHEN COALESCE(v_todays_bookings, 0) > 0 THEN 100 ELSE 0 END;
    ELSE
        v_booking_trend := ROUND(
            ((COALESCE(v_todays_bookings, 0) - v_yest_bookings)::numeric / v_yest_bookings) * 100
        , 1);
    END IF;

    -- 6. REVENUE TREND %
    IF COALESCE(v_yest_revenue, 0) = 0 THEN
        v_revenue_trend := CASE WHEN COALESCE(v_todays_revenue, 0) > 0 THEN 100 ELSE 0 END;
    ELSE
        v_revenue_trend := ROUND(
            ((COALESCE(v_todays_revenue, 0) - v_yest_revenue) / v_yest_revenue) * 100
        , 1);
    END IF;

    -- 7. COMPLETION RATE %
    IF COALESCE(v_todays_bookings, 0) = 0 THEN
        v_completion_rate := 0;
    ELSE
        v_completion_rate := ROUND(
            (COALESCE(v_completed, 0)::numeric / v_todays_bookings) * 100
        , 1);
    END IF;

    -- 8. RETURN
    RETURN QUERY SELECT
        COALESCE(v_todays_bookings, 0),
        COALESCE(v_completed,       0),
        COALESCE(v_no_shows,        0),
        COALESCE(v_cancelled,       0),
        COALESCE(v_todays_revenue,  0),
        COALESCE(v_booking_trend,   0),
        COALESCE(v_revenue_trend,   0),
        COALESCE(v_completion_rate, 0);
END;
$function$;
