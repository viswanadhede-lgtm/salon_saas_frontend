-- ============================================================================
-- Migration: 20261112000001_fix_customers_page_statcards_schema.sql
-- Description: Fix customers_page__four_statcards and trendelements to query
--              app.customers instead of dropped public.customers view.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.customers_page__four_statcards(p_company_id uuid, p_branch_id uuid)
RETURNS TABLE(
    total_customers bigint,
    new_this_month bigint,
    vip_customers bigint,
    inactive_customers bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT
        COUNT(*) AS total_customers,

        COUNT(*) FILTER (
            WHERE created_at >= date_trunc('month', CURRENT_DATE)
              AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        ) AS new_this_month,

        COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(tags, ''))) = 'vip'
        ) AS vip_customers,

        COUNT(*) FILTER (
            WHERE (last_visit IS NOT NULL AND last_visit <= CURRENT_DATE - INTERVAL '90 days')
               OR (last_visit IS NULL AND created_at <= CURRENT_DATE - INTERVAL '90 days')
        ) AS inactive_customers

    FROM app.customers

    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status IS DISTINCT FROM 'deleted';
$$;

CREATE OR REPLACE FUNCTION app.customers_page__four_statcards(p_company_id uuid, p_branch_id uuid)
RETURNS TABLE(
    total_customers bigint,
    new_this_month bigint,
    vip_customers bigint,
    inactive_customers bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT * FROM public.customers_page__four_statcards(p_company_id, p_branch_id);
$$;

CREATE OR REPLACE FUNCTION public.customers_page__four_statcard_trendelements(p_company_id uuid, p_branch_id uuid)
RETURNS TABLE(
    total_customers_change_percent numeric,
    new_customers_change_percent numeric,
    vip_customers_percentage numeric,
    inactive_customers_percentage numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
WITH customer_base AS (
    SELECT
        customer_id,
        created_at,
        tags,
        last_visit,
        status
    FROM app.customers
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status IS DISTINCT FROM 'deleted'
),

periods AS (
    SELECT
        date_trunc('month', CURRENT_DATE)::date AS current_month_start,
        (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date AS previous_month_start,
        (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AS next_month_start
),

metrics AS (
    SELECT
        /* Current total customers */
        COUNT(*) AS current_total_customers,

        /* Customers that existed at the end of last month */
        COUNT(*) FILTER (
            WHERE created_at < p.current_month_start
        ) AS previous_total_customers,

        /* New customers this month */
        COUNT(*) FILTER (
            WHERE created_at >= p.current_month_start
              AND created_at < p.next_month_start
        ) AS current_new_customers,

        /* New customers last month */
        COUNT(*) FILTER (
            WHERE created_at >= p.previous_month_start
              AND created_at < p.current_month_start
        ) AS previous_new_customers,

        /* Current VIP customers */
        COUNT(*) FILTER (
            WHERE LOWER(TRIM(COALESCE(tags, ''))) = 'vip'
        ) AS current_vip_customers,

        /* Current inactive customers */
        COUNT(*) FILTER (
            WHERE (last_visit IS NOT NULL AND last_visit <= CURRENT_DATE - INTERVAL '90 days')
               OR (last_visit IS NULL AND created_at <= CURRENT_DATE - INTERVAL '90 days')
        ) AS current_inactive_customers

    FROM customer_base
    CROSS JOIN periods p
)

SELECT
    CASE
        WHEN previous_total_customers = 0
             AND current_total_customers = 0
            THEN 0

        WHEN previous_total_customers = 0
            THEN NULL

        ELSE ROUND(
            (
                (current_total_customers - previous_total_customers)::numeric
                / previous_total_customers
            ) * 100,
            2
        )
    END AS total_customers_change_percent,

    CASE
        WHEN previous_new_customers = 0
             AND current_new_customers = 0
            THEN 0

        WHEN previous_new_customers = 0
            THEN NULL

        ELSE ROUND(
            (
                (current_new_customers - previous_new_customers)::numeric
                / previous_new_customers
            ) * 100,
            2
        )
    END AS new_customers_change_percent,

    CASE
        WHEN current_total_customers = 0
            THEN 0

        ELSE ROUND(
            (
                current_vip_customers::numeric
                / current_total_customers
            ) * 100,
            2
        )
    END AS vip_customers_percentage,

    CASE
        WHEN current_total_customers = 0
            THEN 0

        ELSE ROUND(
            (
                current_inactive_customers::numeric
                / current_total_customers
            ) * 100,
            2
        )
    END AS inactive_customers_percentage

FROM metrics;
$$;

CREATE OR REPLACE FUNCTION app.customers_page__four_statcard_trendelements(p_company_id uuid, p_branch_id uuid)
RETURNS TABLE(
    total_customers_change_percent numeric,
    new_customers_change_percent numeric,
    vip_customers_percentage numeric,
    inactive_customers_percentage numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT * FROM public.customers_page__four_statcard_trendelements(p_company_id, p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION public.customers_page__four_statcards(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.customers_page__four_statcards(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customers_page__four_statcard_trendelements(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.customers_page__four_statcard_trendelements(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

