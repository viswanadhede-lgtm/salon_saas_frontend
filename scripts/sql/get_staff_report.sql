-- =============================================================================
-- Function: public.get_staff_report
-- Master RPC for Staff Performance Reports
-- Sub-Report 1: Staff Overview (p_staff_id IS NULL)
-- Sub-Report 2: Staff 360° Insights (p_staff_id IS NOT NULL)
--
-- Arguments:
--   p_company_id  uuid              (Mandatory salon company identifier)
--   p_branch_id   uuid DEFAULT NULL (Optional specific branch filter)
--   p_start_date  date DEFAULT (CURRENT_DATE - 30 days)
--   p_end_date    date DEFAULT CURRENT_DATE
--   p_staff_id    uuid DEFAULT NULL (If NULL -> Overview; If set -> 360° Insights)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_report(
    p_company_id   uuid,
    p_branch_id    uuid DEFAULT NULL::uuid,
    p_start_date   date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date,
    p_end_date     date DEFAULT CURRENT_DATE,
    p_staff_id     uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;

    -- Common Staff Directory (Used for search bar & staff tables)
    v_staff_directory jsonb := '[]'::jsonb;

    -- =========================================================================
    -- SUB-REPORT 1: STAFF OVERVIEW VARIABLES (when p_staff_id IS NULL)
    -- =========================================================================
    v_total_staff          bigint := 0;
    v_active_staff         bigint := 0;
    v_on_leave_staff       bigint := 0;
    v_inactive_staff       bigint := 0;

    v_top_performer_name   text := '—';
    v_top_performer_rev    numeric := 0;
    v_top_performer_bks    bigint := 0;

    v_total_completed_bks  bigint := 0;
    v_avg_bookings_staff   numeric := 0;

    v_active_pct           numeric := 0;
    v_on_leave_pct         numeric := 0;
    v_inactive_pct         numeric := 0;

    v_trend_months         jsonb := '[]'::jsonb;
    v_trend_active         jsonb := '[]'::jsonb;
    v_trend_leave          jsonb := '[]'::jsonb;
    v_trend_joined         jsonb := '[]'::jsonb;

    -- =========================================================================
    -- SUB-REPORT 2: STAFF 360° INSIGHTS VARIABLES (when p_staff_id IS NOT NULL)
    -- =========================================================================
    v_s_name               text;
    v_s_role               text;
    v_s_phone              text;
    v_s_email              text;
    v_s_joined             text;
    v_s_status             text;
    v_s_services           text;
    v_s_notes              text;

    -- Salon Totals for Benchmarking (% of all other staff)
    v_salon_total_rev      numeric := 0;
    v_salon_bookings_rev   numeric := 0;
    v_salon_products_rev   numeric := 0;
    v_salon_memberships_rev numeric := 0;

    -- Staff Personal Totals
    v_staff_total_rev      numeric := 0;
    v_staff_bookings_rev   numeric := 0;
    v_staff_products_rev   numeric := 0;
    v_staff_memberships_rev numeric := 0;

    -- Percentage Shares
    v_staff_total_share_pct      numeric := 0;
    v_staff_bookings_share_pct   numeric := 0;
    v_staff_products_share_pct   numeric := 0;
    v_staff_memberships_share_pct numeric := 0;

    -- Personal Revenue Mix Percentages (% of this staff's total revenue)
    v_mix_bookings_pct     numeric := 0;
    v_mix_products_pct     numeric := 0;
    v_mix_memberships_pct  numeric := 0;

    -- Monthly Spend Trend
    v_staff_monthly_months jsonb := '[]'::jsonb;
    v_staff_monthly_bks    jsonb := '[]'::jsonb;
    v_staff_monthly_prods  jsonb := '[]'::jsonb;
    v_staff_monthly_membs  jsonb := '[]'::jsonb;

    -- Activity Ledgers
    v_ledger_bookings      jsonb := '[]'::jsonb;
    v_ledger_products      jsonb := '[]'::jsonb;
    v_ledger_memberships   jsonb := '[]'::jsonb;

BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 0. PRE-FETCH STAFF DIRECTORY (Always Included for Search & Leaderboard)
    -- ─────────────────────────────────────────────────────────────────────────
    WITH staff_metrics AS (
        SELECT
            s.staff_id,
            s.staff_name,
            COALESCE(s.role_name, 'Staff') AS role_name,
            COALESCE(s.phone, '—') AS phone,
            COALESCE(s.email, '—') AS email,
            COALESCE(s.status, 'active') AS status,
            COALESCE(s.services_offered, 'All Services') AS services_offered,
            TO_CHAR(COALESCE(s.joined_at, s.created_at), 'DD Mon YYYY') AS joined_formatted,

            -- Bookings attribution
            COALESCE(bk.completed_bookings, 0) AS completed_bookings,
            COALESCE(bk.service_revenue, 0) AS service_revenue,

            -- Product Sales attribution
            COALESCE(ps.retail_sales, 0) AS retail_sales,

            -- Membership Sales attribution
            COALESCE(ms.membership_sales, 0) AS membership_sales,

            -- Total Combined Revenue
            (COALESCE(bk.service_revenue, 0) + COALESCE(ps.retail_sales, 0) + COALESCE(ms.membership_sales, 0)) AS total_revenue,

            -- Average Ticket Size
            CASE
                WHEN COALESCE(bk.completed_bookings, 0) > 0 THEN
                    ROUND(COALESCE(bk.service_revenue, 0) / bk.completed_bookings)
                ELSE 0
            END AS avg_ticket

        FROM public.staff s

        -- Bookings aggregation (UUID-safe match with name fallback; aggregated to 1 row per staff)
        LEFT JOIN (
            SELECT
                COALESCE(st.staff_id, s_name.staff_id) AS resolved_staff_id,
                COUNT(*) AS completed_bookings,
                COALESCE(SUM(b.final_amount), 0) AS service_revenue
            FROM public.bookings_for_business_transaction b
            LEFT JOIN public.staff st 
              ON NULLIF(TRIM(b.staff_id), '') = st.staff_id::text
              AND (p_company_id IS NULL OR st.company_id = p_company_id)
            LEFT JOIN public.staff s_name 
              ON NULLIF(TRIM(b.staff_id), '') IS NULL 
              AND LOWER(TRIM(b.staff_name)) = LOWER(TRIM(s_name.staff_name))
              AND (p_company_id IS NULL OR s_name.company_id = p_company_id)
              AND (b.branch_id IS NULL OR s_name.branch_id = b.branch_id)
            WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND b.booking_date BETWEEN p_start_date AND p_end_date
              AND LOWER(TRIM(COALESCE(b.status, ''))) = 'completed'
            GROUP BY 1
        ) bk ON bk.resolved_staff_id = s.staff_id

        -- Product Sales aggregation (UUID-safe match with name fallback)
        LEFT JOIN (
            SELECT
                COALESCE(sale.staff_id, s_name.staff_id) AS resolved_staff_id,
                COALESCE(SUM(sale.final_amount), 0) AS retail_sales
            FROM public.sales_for_business_transactions sale
            LEFT JOIN public.staff s_name 
              ON sale.staff_id IS NULL 
              AND LOWER(TRIM(sale.staff_name)) = LOWER(TRIM(s_name.staff_name))
              AND (p_company_id IS NULL OR s_name.company_id = p_company_id)
              AND (sale.branch_id IS NULL OR s_name.branch_id = sale.branch_id)
            WHERE (p_company_id IS NULL OR sale.company_id = p_company_id)
              AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
              AND sale.created_at::date BETWEEN p_start_date AND p_end_date
            GROUP BY 1
        ) ps ON ps.resolved_staff_id = s.staff_id

        -- Membership Purchases aggregation (assigned_by_user_id is the staff id)
        LEFT JOIN (
            SELECT
                COALESCE(mp.assigned_by_user_id, s_name.staff_id) AS resolved_staff_id,
                COALESCE(SUM(mp.final_amount), 0) AS membership_sales
            FROM public.membership_purchases mp
            LEFT JOIN public.staff s_name 
              ON mp.assigned_by_user_id IS NULL 
              AND LOWER(TRIM(mp.assigned_by_user_name)) = LOWER(TRIM(s_name.staff_name))
              AND (p_company_id IS NULL OR s_name.company_id = p_company_id)
              AND (mp.branch_id IS NULL OR s_name.branch_id = mp.branch_id)
            WHERE (p_company_id IS NULL OR mp.company_id = p_company_id)
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
              AND mp.purchase_date BETWEEN p_start_date AND p_end_date
            GROUP BY 1
        ) ms ON ms.resolved_staff_id = s.staff_id

        WHERE (p_company_id IS NULL OR s.company_id = p_company_id)
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted'
        ORDER BY (COALESCE(bk.service_revenue, 0) + COALESCE(ps.retail_sales, 0) + COALESCE(ms.membership_sales, 0)) DESC, s.staff_name ASC
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', sm.staff_id,
            'name', sm.staff_name,
            'role', sm.role_name,
            'phone', sm.phone,
            'email', sm.email,
            'status', sm.status,
            'services_offered', sm.services_offered,
            'joined', sm.joined_formatted,
            'completed_bookings', sm.completed_bookings,
            'service_revenue', sm.service_revenue,
            'retail_sales', sm.retail_sales,
            'membership_sales', sm.membership_sales,
            'total_revenue', sm.total_revenue,
            'avg_ticket', sm.avg_ticket
        )
    ), '[]'::jsonb)
    INTO v_staff_directory
    FROM staff_metrics sm;


    -- =========================================================================
    -- ROUTE 1: SUB-REPORT 1: STAFF OVERVIEW (when p_staff_id IS NULL)
    -- =========================================================================
    IF p_staff_id IS NULL THEN

        -- Headcount metrics
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(s.status, 'active'))) = 'active'),
            COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(s.status, ''))) LIKE '%leave%'),
            COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(s.status, ''))) = 'inactive')
        INTO
            v_total_staff,
            v_active_staff,
            v_on_leave_staff,
            v_inactive_staff
        FROM public.staff s
        WHERE (p_company_id IS NULL OR s.company_id = p_company_id)
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted';

        IF v_total_staff > 0 THEN
            v_active_pct   := ROUND((v_active_staff::numeric   / v_total_staff::numeric) * 100.0);
            v_on_leave_pct := ROUND((v_on_leave_staff::numeric / v_total_staff::numeric) * 100.0);
            v_inactive_pct := ROUND((v_inactive_staff::numeric / v_total_staff::numeric) * 100.0);
        END IF;

        -- Top Performer (from directory)
        IF jsonb_array_length(v_staff_directory) > 0 THEN
            v_top_performer_name := COALESCE(v_staff_directory->0->>'name', '—');
            v_top_performer_rev  := COALESCE((v_staff_directory->0->>'total_revenue')::numeric, 0);
            v_top_performer_bks  := COALESCE((v_staff_directory->0->>'completed_bookings')::bigint, 0);
        END IF;

        -- Average Bookings per Active Staff
        SELECT COUNT(*)
        INTO v_total_completed_bks
        FROM public.bookings_for_business_transaction b
        WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(COALESCE(b.status, ''))) = 'completed';

        IF v_active_staff > 0 THEN
            v_avg_bookings_staff := ROUND(v_total_completed_bks::numeric / v_active_staff::numeric, 1);
        ELSE
            v_avg_bookings_staff := v_total_completed_bks;
        END IF;

        -- Monthly Capacity Trend (Last 6 Months)
        WITH months_series AS (
            SELECT
                DATE_TRUNC('month', m)::date AS month_start,
                TO_CHAR(m, 'Mon') AS month_label
            FROM GENERATE_SERIES(
                DATE_TRUNC('month', CURRENT_DATE - '5 months'::interval)::date,
                DATE_TRUNC('month', CURRENT_DATE)::date,
                '1 month'::interval
            ) m
        ),
        monthly_staff AS (
            SELECT
                ms.month_start,
                ms.month_label,
                -- New joined in that month
                (
                    SELECT COUNT(*)
                    FROM public.staff s
                    WHERE (p_company_id IS NULL OR s.company_id = p_company_id)
                      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                      AND DATE_TRUNC('month', COALESCE(s.joined_at, s.created_at))::date = ms.month_start
                ) AS new_joined,
                v_active_staff AS active_count,
                v_on_leave_staff AS leave_count
            FROM months_series ms
            ORDER BY ms.month_start ASC
        )
        SELECT
            COALESCE(jsonb_agg(month_label ORDER BY month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(active_count ORDER BY month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(leave_count ORDER BY month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(new_joined ORDER BY month_start), '[]'::jsonb)
        INTO
            v_trend_months,
            v_trend_active,
            v_trend_leave,
            v_trend_joined
        FROM monthly_staff;

        -- Sub-Report 1 Output JSON
        v_result := jsonb_build_object(
            'sub_report', 'staff-overview',
            'kpis', jsonb_build_object(
                'total_staff', v_total_staff,
                'active_staff', v_active_staff,
                'on_leave_staff', v_on_leave_staff,
                'inactive_staff', v_inactive_staff,
                'top_performer_name', v_top_performer_name,
                'top_performer_revenue', v_top_performer_rev,
                'top_performer_bookings', v_top_performer_bks,
                'avg_bookings_per_staff', v_avg_bookings_staff
            ),
            'capacity_trend', jsonb_build_object(
                'months', v_trend_months,
                'active_staff', v_trend_active,
                'on_leave', v_trend_leave,
                'new_joined', v_trend_joined
            ),
            'status_distribution', jsonb_build_object(
                'total', v_total_staff,
                'active', v_active_staff,
                'active_pct', v_active_pct,
                'on_leave', v_on_leave_staff,
                'on_leave_pct', v_on_leave_pct,
                'inactive', v_inactive_staff,
                'inactive_pct', v_inactive_pct
            ),
            'staff_directory', v_staff_directory
        );

        RETURN v_result;

    -- =========================================================================
    -- ROUTE 2: SUB-REPORT 2: STAFF 360° INSIGHTS (when p_staff_id IS NOT NULL OR p_sub_report = 'staff-insights')
    -- =========================================================================
    ELSE

        -- If p_staff_id was not provided, auto-pick the top staff member from directory
        IF p_staff_id IS NULL AND jsonb_array_length(v_staff_directory) > 0 THEN
            p_staff_id := (v_staff_directory->0->>'id')::uuid;
        END IF;

        -- 1. Fetch Staff Profile Dossier
        SELECT
            s.staff_name,
            COALESCE(s.role_name, 'Staff'),
            COALESCE(s.phone, '—'),
            COALESCE(s.email, '—'),
            TO_CHAR(COALESCE(s.joined_at, s.created_at), 'DD Mon YYYY'),
            COALESCE(s.status, 'active'),
            COALESCE(s.services_offered, 'All Services'),
            COALESCE(s.notes, '—')
        INTO
            v_s_name,
            v_s_role,
            v_s_phone,
            v_s_email,
            v_s_joined,
            v_s_status,
            v_s_services,
            v_s_notes
        FROM public.staff s
        WHERE s.staff_id = p_staff_id;

        -- Fallback if p_staff_id was deleted or not found
        IF v_s_name IS NULL THEN
            SELECT
                s.staff_id,
                s.staff_name,
                COALESCE(s.role_name, 'Staff'),
                COALESCE(s.phone, '—'),
                COALESCE(s.email, '—'),
                TO_CHAR(COALESCE(s.joined_at, s.created_at), 'DD Mon YYYY'),
                COALESCE(s.status, 'active'),
                COALESCE(s.services_offered, 'All Services'),
                COALESCE(s.notes, '—')
            INTO
                p_staff_id,
                v_s_name,
                v_s_role,
                v_s_phone,
                v_s_email,
                v_s_joined,
                v_s_status,
                v_s_services,
                v_s_notes
            FROM public.staff s
            WHERE (p_company_id IS NULL OR s.company_id = p_company_id)
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted'
            ORDER BY s.staff_name ASC
            LIMIT 1;
        END IF;

        -- 2. Fetch Salon Totals in Period (for benchmarking % of all other staff)
        SELECT COALESCE(SUM(b.final_amount), 0)
        INTO v_salon_bookings_rev
        FROM public.bookings_for_business_transaction b
        WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(COALESCE(b.status, ''))) = 'completed';

        SELECT COALESCE(SUM(sale.final_amount), 0)
        INTO v_salon_products_rev
        FROM public.sales_for_business_transactions sale
        WHERE (p_company_id IS NULL OR sale.company_id = p_company_id)
          AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
          AND sale.created_at::date BETWEEN p_start_date AND p_end_date;

        SELECT COALESCE(SUM(mp.final_amount), 0)
        INTO v_salon_memberships_rev
        FROM public.membership_purchases mp
        WHERE (p_company_id IS NULL OR mp.company_id = p_company_id)
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND mp.purchase_date BETWEEN p_start_date AND p_end_date;

        v_salon_total_rev := v_salon_bookings_rev + v_salon_products_rev + v_salon_memberships_rev;

        -- 3. Fetch Staff Personal Totals
        SELECT COALESCE(SUM(b.final_amount), 0)
        INTO v_staff_bookings_rev
        FROM public.bookings_for_business_transaction b
        WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND (
              (NULLIF(TRIM(b.staff_id), '') IS NOT NULL AND b.staff_id = p_staff_id::text)
              OR (NULLIF(TRIM(b.staff_id), '') IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(b.staff_name)) = LOWER(TRIM(v_s_name)))
          )
          AND b.booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(COALESCE(b.status, ''))) = 'completed';

        SELECT COALESCE(SUM(sale.final_amount), 0)
        INTO v_staff_products_rev
        FROM public.sales_for_business_transactions sale
        WHERE (p_company_id IS NULL OR sale.company_id = p_company_id)
          AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
          AND (
              (sale.staff_id IS NOT NULL AND sale.staff_id = p_staff_id)
              OR (sale.staff_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(sale.staff_name)) = LOWER(TRIM(v_s_name)))
          )
          AND sale.created_at::date BETWEEN p_start_date AND p_end_date;

        SELECT COALESCE(SUM(mp.final_amount), 0)
        INTO v_staff_memberships_rev
        FROM public.membership_purchases mp
        WHERE (p_company_id IS NULL OR mp.company_id = p_company_id)
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND (
              (mp.assigned_by_user_id IS NOT NULL AND mp.assigned_by_user_id = p_staff_id)
              OR (mp.assigned_by_user_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(mp.assigned_by_user_name)) = LOWER(TRIM(v_s_name)))
          )
          AND mp.purchase_date BETWEEN p_start_date AND p_end_date;

        v_staff_total_rev := v_staff_bookings_rev + v_staff_products_rev + v_staff_memberships_rev;

        -- Calculate % Share of Total Salon Revenue
        IF v_salon_total_rev > 0 THEN
            v_staff_total_share_pct := ROUND((v_staff_total_rev / v_salon_total_rev) * 100.0, 1);
        END IF;

        IF v_salon_bookings_rev > 0 THEN
            v_staff_bookings_share_pct := ROUND((v_staff_bookings_rev / v_salon_bookings_rev) * 100.0, 1);
        END IF;

        IF v_salon_products_rev > 0 THEN
            v_staff_products_share_pct := ROUND((v_staff_products_rev / v_salon_products_rev) * 100.0, 1);
        END IF;

        IF v_salon_memberships_rev > 0 THEN
            v_staff_memberships_share_pct := ROUND((v_staff_memberships_rev / v_salon_memberships_rev) * 100.0, 1);
        END IF;

        -- Personal Revenue Mix Percentages (% of this staff's total revenue)
        IF v_staff_total_rev > 0 THEN
            v_mix_bookings_pct    := ROUND((v_staff_bookings_rev    / v_staff_total_rev) * 100.0, 1);
            v_mix_products_pct    := ROUND((v_staff_products_rev    / v_staff_total_rev) * 100.0, 1);
            v_mix_memberships_pct := ROUND((v_staff_memberships_rev / v_staff_total_rev) * 100.0, 1);
        END IF;

        -- 4. Monthly 3-Bar Spend Breakdown for Staff (Last 6 Months)
        WITH months_series AS (
            SELECT
                DATE_TRUNC('month', m)::date AS month_start,
                TO_CHAR(m, 'Mon') AS month_label
            FROM GENERATE_SERIES(
                DATE_TRUNC('month', CURRENT_DATE - '5 months'::interval)::date,
                DATE_TRUNC('month', CURRENT_DATE)::date,
                '1 month'::interval
            ) m
        ),
        s_bookings AS (
            SELECT
                DATE_TRUNC('month', b.booking_date)::date AS m_start,
                COALESCE(SUM(b.final_amount), 0) AS amt
            FROM public.bookings_for_business_transaction b
            WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND (
                  (NULLIF(TRIM(b.staff_id), '') IS NOT NULL AND b.staff_id = p_staff_id::text)
                  OR (NULLIF(TRIM(b.staff_id), '') IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(b.staff_name)) = LOWER(TRIM(v_s_name)))
              )
              AND LOWER(TRIM(COALESCE(b.status, ''))) = 'completed'
              AND b.booking_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        ),
        s_sales AS (
            SELECT
                DATE_TRUNC('month', sale.created_at::date)::date AS m_start,
                COALESCE(SUM(sale.final_amount), 0) AS amt
            FROM public.sales_for_business_transactions sale
            WHERE (p_company_id IS NULL OR sale.company_id = p_company_id)
              AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
              AND (
                  (sale.staff_id IS NOT NULL AND sale.staff_id = p_staff_id)
                  OR (sale.staff_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(sale.staff_name)) = LOWER(TRIM(v_s_name)))
              )
              AND sale.created_at >= (CURRENT_DATE - '6 months'::interval)
            GROUP BY 1
        ),
        s_memberships AS (
            SELECT
                DATE_TRUNC('month', mp.purchase_date)::date AS m_start,
                COALESCE(SUM(mp.final_amount), 0) AS amt
            FROM public.membership_purchases mp
            WHERE (p_company_id IS NULL OR mp.company_id = p_company_id)
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
              AND (
                  (mp.assigned_by_user_id IS NOT NULL AND mp.assigned_by_user_id = p_staff_id)
                  OR (mp.assigned_by_user_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(mp.assigned_by_user_name)) = LOWER(TRIM(v_s_name)))
              )
              AND mp.purchase_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        )
        SELECT
            COALESCE(jsonb_agg(ms.month_label ORDER BY ms.month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(ROUND(COALESCE(sb.amt, 0)) ORDER BY ms.month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(ROUND(COALESCE(ss.amt, 0)) ORDER BY ms.month_start), '[]'::jsonb),
            COALESCE(jsonb_agg(ROUND(COALESCE(sm.amt, 0)) ORDER BY ms.month_start), '[]'::jsonb)
        INTO
            v_staff_monthly_months,
            v_staff_monthly_bks,
            v_staff_monthly_prods,
            v_staff_monthly_membs
        FROM months_series ms
        LEFT JOIN s_bookings sb ON sb.m_start = ms.month_start
        LEFT JOIN s_sales ss ON ss.m_start = ms.month_start
        LEFT JOIN s_memberships sm ON sm.m_start = ms.month_start;

        -- 5. Activity Ledger Tab 1: Completed Bookings
        SELECT COALESCE(jsonb_agg(br), '[]'::jsonb)
        INTO v_ledger_bookings
        FROM (
            SELECT
                TO_CHAR(b.booking_date, 'DD Mon YYYY') ||
                CASE
                    WHEN b.start_time IS NOT NULL THEN ', ' || TO_CHAR(b.start_time, 'HH12:MI AM')
                    ELSE ''
                END AS col_datetime,
                COALESCE(b.service_name, 'Hair Service') AS col_service,
                COALESCE(b.customer_name, 'Guest') AS col_customer,
                b.total_price AS col_gross,
                CASE
                    WHEN COALESCE(b.discount_amount, 0) > 0 THEN
                        '-₹' || b.discount_amount::text || ' (' || COALESCE(b.discount_name, 'Promo') || ')'
                    ELSE '—'
                END AS col_discount,
                b.final_amount AS col_final,
                COALESCE(b.payment_status, 'Paid') AS col_payment,
                COALESCE(b.status, 'Completed') AS col_status
            FROM public.bookings_for_business_transaction b
            WHERE (p_company_id IS NULL OR b.company_id = p_company_id)
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND (
                  (NULLIF(TRIM(b.staff_id), '') IS NOT NULL AND b.staff_id = p_staff_id::text)
                  OR (NULLIF(TRIM(b.staff_id), '') IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(b.staff_name)) = LOWER(TRIM(v_s_name)))
              )
            ORDER BY b.booking_date DESC, b.start_time DESC NULLS LAST
            LIMIT 50
        ) br;

        -- 6. Activity Ledger Tab 2: Retail POS Sales
        SELECT COALESCE(jsonb_agg(pr), '[]'::jsonb)
        INTO v_ledger_products
        FROM (
            SELECT
                TO_CHAR(sale.created_at, 'DD Mon YYYY') AS col_date,
                SUBSTRING(sale.sale_id::text, 1, 8) AS col_sale_ref,
                COALESCE(sale.customer_name, 'Walk-in Client') AS col_customer,
                array_to_string(sale.product_names, ', ') AS col_products,
                array_to_string(sale.category_names, ', ') AS col_categories,
                COALESCE(sale.total_quantity, 1) AS col_qty,
                sale.total_price AS col_gross,
                CASE
                    WHEN COALESCE(sale.discount_amount, 0) > 0 THEN
                        '-₹' || sale.discount_amount::text || ' (' || COALESCE(sale.discount_name, 'Offer') || ')'
                    ELSE '—'
                END AS col_discount,
                sale.final_amount AS col_final,
                COALESCE(sale.payment_method, 'Cash') AS col_payment
            FROM public.sales_for_business_transactions sale
            WHERE (p_company_id IS NULL OR sale.company_id = p_company_id)
              AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
              AND (
                  (sale.staff_id IS NOT NULL AND sale.staff_id = p_staff_id)
                  OR (sale.staff_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(sale.staff_name)) = LOWER(TRIM(v_s_name)))
              )
            ORDER BY sale.created_at DESC
            LIMIT 50
        ) pr;

        -- 7. Activity Ledger Tab 3: Membership Plan Sales
        SELECT COALESCE(jsonb_agg(mr), '[]'::jsonb)
        INTO v_ledger_memberships
        FROM (
            SELECT
                TO_CHAR(mp.purchase_date, 'DD Mon YYYY') AS col_purchase_date,
                mp.plan_name AS col_plan,
                COALESCE(mp.customer_name, 'Member') AS col_customer,
                COALESCE(mp.duration::text || ' Months', '12 Months') AS col_duration,
                TO_CHAR(mp.expiry_date, 'DD Mon YYYY') AS col_expiry_date,
                mp.price AS col_plan_price,
                CASE
                    WHEN COALESCE(mp.discount_amount, 0) > 0 THEN
                        '-₹' || mp.discount_amount::text || ' (' || COALESCE(mp.discount_name, 'Promo') || ')'
                    ELSE '—'
                END AS col_discount,
                mp.final_amount AS col_final,
                COALESCE(mp.payment_method, 'UPI') AS col_payment,
                COALESCE(mp.status, 'active') AS col_status
            FROM public.membership_purchases mp
            WHERE (p_company_id IS NULL OR mp.company_id = p_company_id)
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
              AND (
                  (mp.assigned_by_user_id IS NOT NULL AND mp.assigned_by_user_id = p_staff_id)
                  OR (mp.assigned_by_user_id IS NULL AND v_s_name IS NOT NULL AND LOWER(TRIM(mp.assigned_by_user_name)) = LOWER(TRIM(v_s_name)))
              )
            ORDER BY mp.purchase_date DESC
            LIMIT 20
        ) mr;

        -- Construct Sub-Report 2 Output JSON
        v_result := jsonb_build_object(
            'sub_report', 'staff-insights',
            'profile', jsonb_build_object(
                'id', p_staff_id,
                'name', v_s_name,
                'role', v_s_role,
                'phone', v_s_phone,
                'email', v_s_email,
                'joined', v_s_joined,
                'status', v_s_status,
                'services_offered', v_s_services,
                'notes', v_s_notes
            ),
            'spend_kpis', jsonb_build_object(
                'total_revenue', v_staff_total_rev,
                'total_revenue_share_pct', v_staff_total_share_pct,
                'bookings_revenue', v_staff_bookings_rev,
                'bookings_staff_pct', v_mix_bookings_pct,
                'bookings_revenue_share_pct', v_staff_bookings_share_pct,
                'products_revenue', v_staff_products_rev,
                'products_staff_pct', v_mix_products_pct,
                'products_revenue_share_pct', v_staff_products_share_pct,
                'memberships_revenue', v_staff_memberships_rev,
                'memberships_staff_pct', v_mix_memberships_pct,
                'memberships_revenue_share_pct', v_staff_memberships_share_pct
            ),
            'monthly_trend', jsonb_build_object(
                'months', v_staff_monthly_months,
                'bookings', v_staff_monthly_bks,
                'products', v_staff_monthly_prods,
                'memberships', v_staff_monthly_membs
            ),
            'revenue_mix', jsonb_build_object(
                'total', v_staff_total_rev,
                'bookings_val', v_staff_bookings_rev,
                'bookings_pct', v_mix_bookings_pct,
                'products_val', v_staff_products_rev,
                'products_pct', v_mix_products_pct,
                'memberships_val', v_staff_memberships_rev,
                'memberships_pct', v_mix_memberships_pct
            ),
            'ledger', jsonb_build_object(
                'bookings', v_ledger_bookings,
                'products', v_ledger_products,
                'memberships', v_ledger_memberships
            ),
            'staff_directory', v_staff_directory
        );

        RETURN v_result;

    END IF;

END;
$function$;
