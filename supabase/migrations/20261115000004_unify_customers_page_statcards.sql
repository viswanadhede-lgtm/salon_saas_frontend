-- =============================================================================
-- Migration: Unify customers_page__four_statcards & trend elements
-- Two-Tier Architecture: Section 1 = Security Gates, Section 2 = Core Logic
-- Returns: All 8 stat card metrics in a single atomic snapshot
-- =============================================================================

-- Drop existing wrappers and functions
DROP FUNCTION IF EXISTS public.customers_page__four_statcards(uuid, uuid);
DROP FUNCTION IF EXISTS app.customers_page__four_statcards(uuid, uuid);
DROP FUNCTION IF EXISTS public.customers_page__four_statcard_trendelements(uuid, uuid);
DROP FUNCTION IF EXISTS app.customers_page__four_statcard_trendelements(uuid, uuid);

-- =============================================================================
-- CANONICAL: app.customers_page__four_statcards
-- =============================================================================
CREATE OR REPLACE FUNCTION app.customers_page__four_statcards(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE (
    total_customers                bigint,
    new_this_month                 bigint,
    vip_customers                  bigint,
    inactive_customers             bigint,
    total_customers_change_percent numeric,
    new_customers_change_percent   numeric,
    vip_customers_percentage       numeric,
    inactive_customers_percentage  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Tenant access verification (supports optional branch_id)
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: tenant access denied' USING ERRCODE = '42501';
    END IF;

    -- Step 1.3: Subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission check
    PERFORM shared.check_permission(p_company_id, 'customers_management');

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC (Single-Pass Aggregation)
    -- =========================================================================

    RETURN QUERY
    WITH customer_base AS (
        SELECT
            c.customer_id,
            c.created_at,
            c.tags,
            c.last_visit,
            c.status
        FROM app.customers c
        WHERE c.company_id = p_company_id
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
          AND c.status IS DISTINCT FROM 'deleted'
    ),
    periods AS (
        SELECT
            date_trunc('month', CURRENT_DATE)::date AS current_month_start,
            (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date AS previous_month_start,
            (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AS next_month_start
    ),
    metrics AS (
        SELECT
            COUNT(*) AS current_total_customers,
            COUNT(*) FILTER (WHERE cb.created_at < p.current_month_start) AS previous_total_customers,
            COUNT(*) FILTER (WHERE cb.created_at >= p.current_month_start AND cb.created_at < p.next_month_start) AS current_new_customers,
            COUNT(*) FILTER (WHERE cb.created_at >= p.previous_month_start AND cb.created_at < p.current_month_start) AS previous_new_customers,
            COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(cb.tags, ''))) = 'vip') AS current_vip_customers,
            COUNT(*) FILTER (
                WHERE (cb.last_visit IS NOT NULL AND cb.last_visit <= CURRENT_DATE - INTERVAL '90 days')
                   OR (cb.last_visit IS NULL AND cb.created_at <= CURRENT_DATE - INTERVAL '90 days')
            ) AS current_inactive_customers
        FROM customer_base cb
        CROSS JOIN periods p
        GROUP BY p.current_month_start, p.previous_month_start, p.next_month_start
    )
    SELECT
        COALESCE(m.current_total_customers, 0)::bigint AS total_customers,
        COALESCE(m.current_new_customers, 0)::bigint AS new_this_month,
        COALESCE(m.current_vip_customers, 0)::bigint AS vip_customers,
        COALESCE(m.current_inactive_customers, 0)::bigint AS inactive_customers,

        CASE
            WHEN COALESCE(m.previous_total_customers, 0) = 0 AND COALESCE(m.current_total_customers, 0) = 0 THEN 0
            WHEN COALESCE(m.previous_total_customers, 0) = 0 THEN NULL
            ELSE ROUND(((m.current_total_customers - m.previous_total_customers)::numeric / m.previous_total_customers) * 100, 2)
        END AS total_customers_change_percent,

        CASE
            WHEN COALESCE(m.previous_new_customers, 0) = 0 AND COALESCE(m.current_new_customers, 0) = 0 THEN 0
            WHEN COALESCE(m.previous_new_customers, 0) = 0 THEN NULL
            ELSE ROUND(((m.current_new_customers - m.previous_new_customers)::numeric / m.previous_new_customers) * 100, 2)
        END AS new_customers_change_percent,

        CASE
            WHEN COALESCE(m.current_total_customers, 0) = 0 THEN 0
            ELSE ROUND((m.current_vip_customers::numeric / m.current_total_customers) * 100, 2)
        END AS vip_customers_percentage,

        CASE
            WHEN COALESCE(m.current_total_customers, 0) = 0 THEN 0
            ELSE ROUND((m.current_inactive_customers::numeric / m.current_total_customers) * 100, 2)
        END AS inactive_customers_percentage
    FROM periods p
    LEFT JOIN metrics m ON true;
END;
$$;

-- =============================================================================
-- ACL: Lock down app function
-- =============================================================================
REVOKE EXECUTE ON FUNCTION app.customers_page__four_statcards(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.customers_page__four_statcards(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC WRAPPER (1:1 pass-through)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customers_page__four_statcards(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE (
    total_customers                bigint,
    new_this_month                 bigint,
    vip_customers                  bigint,
    inactive_customers             bigint,
    total_customers_change_percent numeric,
    new_customers_change_percent   numeric,
    vip_customers_percentage       numeric,
    inactive_customers_percentage  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'shared', 'app', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.customers_page__four_statcards(p_company_id, p_branch_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.customers_page__four_statcards(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.customers_page__four_statcards(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- BACKWARD COMPATIBILITY: public.customers_page__four_statcard_trendelements
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customers_page__four_statcard_trendelements(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE(
    total_customers_change_percent numeric,
    new_customers_change_percent   numeric,
    vip_customers_percentage       numeric,
    inactive_customers_percentage  numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
    SELECT
        s.total_customers_change_percent,
        s.new_customers_change_percent,
        s.vip_customers_percentage,
        s.inactive_customers_percentage
    FROM public.customers_page__four_statcards(p_company_id, p_branch_id) s;
$$;

REVOKE EXECUTE ON FUNCTION public.customers_page__four_statcard_trendelements(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.customers_page__four_statcard_trendelements(uuid, uuid) TO authenticated, service_role;
