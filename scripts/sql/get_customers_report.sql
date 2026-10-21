-- =============================================================================
-- Function: public.get_customers_report
-- Master RPC for Customers Reports (Customer Overview & Customer 360° Insights)
-- Arguments:
--   p_company_id  uuid              (Mandatory salon company identifier)
--   p_branch_id   uuid DEFAULT NULL (Optional specific branch filter)
--   p_start_date  date DEFAULT (CURRENT_DATE - 30 days)
--   p_end_date    date DEFAULT CURRENT_DATE
--   p_customer_id uuid DEFAULT NULL (If NULL -> Overview; If set -> 360° Insights)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_customers_report(
    p_company_id   uuid,
    p_branch_id    uuid DEFAULT NULL::uuid,
    p_start_date   date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date,
    p_end_date     date DEFAULT CURRENT_DATE,
    p_customer_id  uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    -- Output wrapper
    v_result jsonb;

    -- Search CRM Directory (always included for search bar autocomplete)
    v_crm_directory jsonb := '[]'::jsonb;

    -- =========================================================================
    -- SUB-REPORT 1: OVERVIEW VARIABLES (when p_customer_id IS NULL)
    -- =========================================================================
    v_total_customers          bigint := 0;
    v_new_customers            bigint := 0;
    v_returning_customers      bigint := 0;

    v_membership_clients       bigint := 0;
    v_membership_pen_pct       numeric := 0;
    v_membership_expiring_soon bigint := 0;

    v_vip_clients              bigint := 0;
    v_regular_clients          bigint := 0;
    v_vip_pct                  numeric := 0;
    v_regular_pct              numeric := 0;

    v_loyal_clients            bigint := 0;
    v_repeat_rate_pct          numeric := 0;
    v_loyal_avg_visits         numeric := 0;

    v_trend_months             jsonb := '[]'::jsonb;
    v_trend_customers          jsonb := '[]'::jsonb;
    v_trend_revenue            jsonb := '[]'::jsonb;

    v_registry_rows            jsonb := '[]'::jsonb;

    -- =========================================================================
    -- SUB-REPORT 2: 360° INSIGHTS VARIABLES (when p_customer_id IS NOT NULL)
    -- =========================================================================
    v_cust_name                text;
    v_cust_phone               text;
    v_cust_email               text;
    v_cust_dob                 text;
    v_cust_joined              text;
    v_cust_tag                 text;
    v_cust_notes               text;
    v_cust_status              text;

    v_cust_spent_total         numeric := 0;
    v_cust_spent_bookings      numeric := 0;
    v_cust_spent_products      numeric := 0;
    v_cust_spent_memberships   numeric := 0;

    v_cust_visits_count        bigint := 0;
    v_cust_avg_per_visit       numeric := 0;

    v_cust_bookings_pct        numeric := 0;
    v_cust_products_pct        numeric := 0;
    v_cust_memberships_pct     numeric := 0;

    v_cust_discounts_count     bigint := 0;
    v_cust_discounts_saved     numeric := 0;

    v_cust_monthly_months      jsonb := '[]'::jsonb;
    v_cust_monthly_bookings    jsonb := '[]'::jsonb;
    v_cust_monthly_products    jsonb := '[]'::jsonb;
    v_cust_monthly_memberships jsonb := '[]'::jsonb;

    v_cust_bookings_rows       jsonb := '[]'::jsonb;
    v_cust_products_rows       jsonb := '[]'::jsonb;
    v_cust_memberships_rows    jsonb := '[]'::jsonb;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 0. GLOBAL CRM SEARCH DIRECTORY (Top 100 recent/active customers)
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(d), '[]'::jsonb)
    INTO v_crm_directory
    FROM (
        SELECT
            c.customer_id AS id,
            c.customer_name AS name,
            COALESCE(c.customer_phone, '') AS phone,
            COALESCE(c.customer_email, '') AS email,
            CASE
                WHEN c.tags::text ILIKE '%VIP%' THEN 'VIP'
                WHEN EXISTS (
                    SELECT 1 FROM public.membership_purchases mp
                    WHERE mp.customer_id = c.customer_id
                      AND mp.status = 'active'
                      AND mp.expiry_date >= CURRENT_DATE
                ) THEN 'Member'
                ELSE 'Regular'
            END AS tag
        FROM public.customers c
        WHERE c.company_id = p_company_id
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
        ORDER BY c.created_at DESC
        LIMIT 100
    ) d;

    -- =========================================================================
    -- BRANCH A: SUB-REPORT 1 — CUSTOMER OVERVIEW (when p_customer_id IS NULL)
    -- =========================================================================
    IF p_customer_id IS NULL THEN

        -- 1. Base Customer Counts (Total, New in period, Returning)
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE c.created_at::date BETWEEN p_start_date AND p_end_date)
        INTO
            v_total_customers,
            v_new_customers
        FROM public.customers c
        WHERE c.company_id = p_company_id
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id);

        v_returning_customers := GREATEST(v_total_customers - v_new_customers, 0);

        -- 2. Membership Clients (Active subscriptions & expiring soon)
        SELECT
            COUNT(DISTINCT mp.customer_id),
            COUNT(DISTINCT mp.customer_id) FILTER (
                WHERE mp.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + '30 days'::interval)::date
            )
        INTO
            v_membership_clients,
            v_membership_expiring_soon
        FROM public.membership_purchases mp
        WHERE mp.company_id = p_company_id
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND mp.status = 'active'
          AND mp.expiry_date >= CURRENT_DATE;

        IF v_total_customers > 0 THEN
            v_membership_pen_pct := ROUND(((v_membership_clients::numeric / v_total_customers::numeric) * 100.0), 1);
        END IF;

        -- 3. VIP vs Regular Clients
        SELECT
            COUNT(*) FILTER (WHERE c.tags::text ILIKE '%VIP%')
        INTO
            v_vip_clients
        FROM public.customers c
        WHERE c.company_id = p_company_id
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id);

        v_regular_clients := GREATEST(v_total_customers - v_vip_clients, 0);

        IF v_total_customers > 0 THEN
            v_vip_pct := ROUND(((v_vip_clients::numeric / v_total_customers::numeric) * 100.0), 1);
            v_regular_pct := ROUND(((v_regular_clients::numeric / v_total_customers::numeric) * 100.0), 1);
        END IF;

        -- 4. Loyal Customers (2+ completed visits in selected period)
        WITH customer_visits AS (
            SELECT
                b.customer_id,
                COUNT(b.booking_id) AS visit_count
            FROM public.bookings_for_business_transaction b
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND b.booking_date BETWEEN p_start_date AND p_end_date
              AND LOWER(TRIM(b.status)) = 'completed'
              AND b.customer_id IS NOT NULL
            GROUP BY b.customer_id
        )
        SELECT
            COUNT(*) FILTER (WHERE visit_count >= 2),
            COALESCE(ROUND(AVG(visit_count) FILTER (WHERE visit_count >= 2), 1), 0)
        INTO
            v_loyal_clients,
            v_loyal_avg_visits
        FROM customer_visits;

        IF v_total_customers > 0 THEN
            v_repeat_rate_pct := ROUND(((v_loyal_clients::numeric / v_total_customers::numeric) * 100.0), 1);
        END IF;

        -- 5. Left Chart: Monthly Trend (Last 6 Months: Unique Customers vs Total Revenue)
        WITH months_series AS (
            SELECT
                DATE_TRUNC('month', m)::date AS month_start,
                (DATE_TRUNC('month', m) + '1 month'::interval - '1 day'::interval)::date AS month_end,
                TO_CHAR(m, 'Mon') AS month_label
            FROM GENERATE_SERIES(
                DATE_TRUNC('month', CURRENT_DATE - '5 months'::interval)::date,
                DATE_TRUNC('month', CURRENT_DATE)::date,
                '1 month'::interval
            ) m
        ),
        monthly_bookings AS (
            SELECT
                DATE_TRUNC('month', b.booking_date)::date AS m_start,
                COUNT(DISTINCT b.customer_id) AS cust_count,
                COALESCE(SUM(b.final_amount), 0) AS rev
            FROM public.bookings_for_business_transaction b
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND LOWER(TRIM(b.status)) = 'completed'
              AND b.booking_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        ),
        monthly_sales AS (
            SELECT
                DATE_TRUNC('month', s.created_at::date)::date AS m_start,
                COUNT(DISTINCT s.customer_id) AS cust_count,
                COALESCE(SUM(s.final_amount), 0) AS rev
            FROM public.sales_for_business_transactions s
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.created_at >= (CURRENT_DATE - '6 months'::interval)
            GROUP BY 1
        ),
        monthly_memberships AS (
            SELECT
                DATE_TRUNC('month', mp.purchase_date)::date AS m_start,
                COUNT(DISTINCT mp.customer_id) AS cust_count,
                COALESCE(SUM(mp.final_amount), 0) AS rev
            FROM public.membership_purchases mp
            WHERE mp.company_id = p_company_id
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
              AND mp.purchase_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        )
        SELECT
            jsonb_agg(ms.month_label ORDER BY ms.month_start),
            jsonb_agg(COALESCE(mb.cust_count, 0) ORDER BY ms.month_start),
            jsonb_agg(
                ROUND(COALESCE(mb.rev, 0) + COALESCE(msl.rev, 0) + COALESCE(mmp.rev, 0))
                ORDER BY ms.month_start
            )
        INTO
            v_trend_months,
            v_trend_customers,
            v_trend_revenue
        FROM months_series ms
        LEFT JOIN monthly_bookings mb ON mb.m_start = ms.month_start
        LEFT JOIN monthly_sales msl ON msl.m_start = ms.month_start
        LEFT JOIN monthly_memberships mmp ON mmp.m_start = ms.month_start;

        -- 6. Customer Registry Table (Aggregating Spend, Visits, and Cohorts)
        WITH cust_bookings AS (
            SELECT
                b.customer_id,
                COUNT(b.booking_id) AS total_visits,
                COALESCE(SUM(b.final_amount), 0) AS spent_bookings,
                COALESCE(SUM(b.discount_amount), 0) AS discounts_bookings,
                MAX(b.booking_date) AS last_booking_date
            FROM public.bookings_for_business_transaction b
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND LOWER(TRIM(b.status)) = 'completed'
            GROUP BY b.customer_id
        ),
        cust_pos AS (
            SELECT
                s.customer_id,
                COALESCE(SUM(s.final_amount), 0) AS spent_products,
                COALESCE(SUM(s.discount_amount), 0) AS discounts_products,
                MAX(s.created_at::date) AS last_pos_date
            FROM public.sales_for_business_transactions s
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
            GROUP BY s.customer_id
        ),
        cust_memberships AS (
            SELECT
                mp.customer_id,
                COALESCE(SUM(mp.final_amount), 0) AS spent_memberships,
                COALESCE(SUM(mp.discount_amount), 0) AS discounts_memberships,
                BOOL_OR(mp.status = 'active' AND mp.expiry_date >= CURRENT_DATE) AS has_active_membership
            FROM public.membership_purchases mp
            WHERE mp.company_id = p_company_id
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
            GROUP BY mp.customer_id
        )
        SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
        INTO v_registry_rows
        FROM (
            SELECT
                c.customer_id AS id,
                c.customer_name AS name,
                COALESCE(c.customer_phone, '—') AS phone,
                COALESCE(c.customer_email, '—') AS email,
                TO_CHAR(c.created_at, 'DD Mon YYYY') AS joined,
                COALESCE(cb.total_visits, 0) AS visits,
                COALESCE(cb.spent_bookings, 0) + COALESCE(cp.spent_products, 0) + COALESCE(cm.spent_memberships, 0) AS spent,
                COALESCE(cb.spent_bookings, 0) AS spent_bookings,
                COALESCE(cp.spent_products, 0) AS spent_products,
                COALESCE(cm.spent_memberships, 0) AS spent_memberships,
                COALESCE(cb.discounts_bookings, 0) + COALESCE(cp.discounts_products, 0) + COALESCE(cm.discounts_memberships, 0) AS discounts,
                CASE
                    WHEN cb.last_booking_date IS NOT NULL THEN
                        TO_CHAR(cb.last_booking_date, 'DD Mon YYYY') || ' (' || (CURRENT_DATE - cb.last_booking_date)::text || ' days ago)'
                    WHEN c.last_visit IS NOT NULL THEN
                        TO_CHAR(c.last_visit::date, 'DD Mon YYYY')
                    ELSE 'No visits yet'
                END AS last_visit,
                CASE
                    WHEN c.tags::text ILIKE '%VIP%' THEN 'VIP'
                    WHEN COALESCE(cm.has_active_membership, false) THEN 'Member'
                    ELSE 'Regular'
                END AS tag,
                (COALESCE(cb.total_visits, 0) >= 2) AS is_loyal,
                (c.tags::text ILIKE '%VIP%') AS is_vip,
                COALESCE(cm.has_active_membership, false) AS is_member
            FROM public.customers c
            LEFT JOIN cust_bookings cb ON cb.customer_id = c.customer_id
            LEFT JOIN cust_pos cp ON cp.customer_id = c.customer_id
            LEFT JOIN cust_memberships cm ON cm.customer_id = c.customer_id
            WHERE c.company_id = p_company_id
              AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
            ORDER BY spent DESC, visits DESC
            LIMIT 250
        ) r;

        -- Construct Sub-Report 1 Output JSON
        v_result := jsonb_build_object(
            'sub_report', 'cust-metrics',
            'kpis', jsonb_build_object(
                'total_customers', v_total_customers,
                'new_customers', v_new_customers,
                'returning_customers', v_returning_customers,
                'membership_clients', v_membership_clients,
                'membership_pen_pct', v_membership_pen_pct,
                'membership_expiring_soon', v_membership_expiring_soon,
                'vip_clients', v_vip_clients,
                'regular_clients', v_regular_clients,
                'vip_pct', v_vip_pct,
                'regular_pct', v_regular_pct,
                'loyal_clients', v_loyal_clients,
                'repeat_rate_pct', v_repeat_rate_pct,
                'loyal_avg_visits', v_loyal_avg_visits
            ),
            'trend_chart', jsonb_build_object(
                'months', v_trend_months,
                'customers', v_trend_customers,
                'revenue', v_trend_revenue
            ),
            'tier_distribution', jsonb_build_object(
                'regular_count', v_regular_clients,
                'regular_pct', v_regular_pct,
                'vip_count', v_vip_clients,
                'vip_pct', v_vip_pct,
                'member_count', v_membership_clients,
                'member_pct', v_membership_pen_pct
            ),
            'registry_table', v_registry_rows,
            'crm_directory', v_crm_directory
        );

        RETURN v_result;

    -- =========================================================================
    -- BRANCH B: SUB-REPORT 2 — CUSTOMER 360° INSIGHTS (when p_customer_id IS NOT NULL)
    -- =========================================================================
    ELSE

        -- 1. Fetch Customer Master Profile
        SELECT
            c.customer_name,
            COALESCE(c.customer_phone, '—'),
            COALESCE(c.customer_email, '—'),
            CASE
                WHEN c.dob IS NOT NULL AND TRIM(c.dob::text) <> '' THEN
                    TO_CHAR(c.dob::date, 'DD Mon YYYY')
                ELSE 'Not Specified'
            END,
            TO_CHAR(c.created_at, 'DD Mon YYYY'),
            CASE
                WHEN c.tags::text ILIKE '%VIP%' THEN 'VIP'
                WHEN EXISTS (
                    SELECT 1 FROM public.membership_purchases mp
                    WHERE mp.customer_id = c.customer_id
                      AND mp.status = 'active'
                      AND mp.expiry_date >= CURRENT_DATE
                ) THEN 'Member'
                ELSE 'Regular'
            END,
            COALESCE(c.notes, ''),
            COALESCE(c.status, 'Active')
        INTO
            v_cust_name,
            v_cust_phone,
            v_cust_email,
            v_cust_dob,
            v_cust_joined,
            v_cust_tag,
            v_cust_notes,
            v_cust_status
        FROM public.customers c
        WHERE c.customer_id = p_customer_id
          AND c.company_id = p_company_id;

        IF v_cust_name IS NULL THEN
            RETURN jsonb_build_object('error', 'Customer not found');
        END IF;

        -- 2. Spending Totals Across the 3 Streams & Visits Count
        SELECT
            COALESCE(COUNT(b.booking_id) FILTER (WHERE LOWER(TRIM(b.status)) = 'completed'), 0),
            COALESCE(SUM(b.final_amount) FILTER (WHERE LOWER(TRIM(b.status)) = 'completed'), 0),
            COALESCE(SUM(b.discount_amount), 0)
        INTO
            v_cust_visits_count,
            v_cust_spent_bookings,
            v_cust_discounts_saved
        FROM public.bookings_for_business_transaction b
        WHERE b.customer_id = p_customer_id;

        SELECT
            COALESCE(SUM(s.final_amount), 0),
            v_cust_discounts_saved + COALESCE(SUM(s.discount_amount), 0)
        INTO
            v_cust_spent_products,
            v_cust_discounts_saved
        FROM public.sales_for_business_transactions s
        WHERE s.customer_id = p_customer_id;

        SELECT
            COALESCE(SUM(mp.final_amount), 0),
            v_cust_discounts_saved + COALESCE(SUM(mp.discount_amount), 0)
        INTO
            v_cust_spent_memberships,
            v_cust_discounts_saved
        FROM public.membership_purchases mp
        WHERE mp.customer_id = p_customer_id;

        -- Total Lifetime Spent
        v_cust_spent_total := v_cust_spent_bookings + v_cust_spent_products + v_cust_spent_memberships;

        IF v_cust_spent_total > 0 THEN
            v_cust_bookings_pct    := ROUND(((v_cust_spent_bookings / v_cust_spent_total) * 100.0), 1);
            v_cust_products_pct    := ROUND(((v_cust_spent_products / v_cust_spent_total) * 100.0), 1);
            v_cust_memberships_pct := ROUND(((v_cust_spent_memberships / v_cust_spent_total) * 100.0), 1);
        END IF;

        IF v_cust_visits_count > 0 THEN
            v_cust_avg_per_visit := ROUND(v_cust_spent_total / v_cust_visits_count);
        ELSE
            v_cust_avg_per_visit := v_cust_spent_total;
        END IF;

        -- Discounts used count from discount_usages
        SELECT COUNT(*)
        INTO v_cust_discounts_count
        FROM public.discount_usages du
        WHERE du.customer_id = p_customer_id;

        -- Fallback if discount_usages was empty but transactions recorded discounts
        IF v_cust_discounts_count = 0 AND v_cust_discounts_saved > 0 THEN
            v_cust_discounts_count := 1;
        END IF;

        -- 3. Monthly Spend Breakdown for Customer (Last 6 Months)
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
        c_bookings AS (
            SELECT
                DATE_TRUNC('month', b.booking_date)::date AS m_start,
                COALESCE(SUM(b.final_amount), 0) AS amt
            FROM public.bookings_for_business_transaction b
            WHERE b.customer_id = p_customer_id
              AND LOWER(TRIM(b.status)) = 'completed'
              AND b.booking_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        ),
        c_sales AS (
            SELECT
                DATE_TRUNC('month', s.created_at::date)::date AS m_start,
                COALESCE(SUM(s.final_amount), 0) AS amt
            FROM public.sales_for_business_transactions s
            WHERE s.customer_id = p_customer_id
              AND s.created_at >= (CURRENT_DATE - '6 months'::interval)
            GROUP BY 1
        ),
        c_memberships AS (
            SELECT
                DATE_TRUNC('month', mp.purchase_date)::date AS m_start,
                COALESCE(SUM(mp.final_amount), 0) AS amt
            FROM public.membership_purchases mp
            WHERE mp.customer_id = p_customer_id
              AND mp.purchase_date >= (CURRENT_DATE - '6 months'::interval)::date
            GROUP BY 1
        )
        SELECT
            jsonb_agg(ms.month_label ORDER BY ms.month_start),
            jsonb_agg(ROUND(COALESCE(cb.amt, 0)) ORDER BY ms.month_start),
            jsonb_agg(ROUND(COALESCE(cs.amt, 0)) ORDER BY ms.month_start),
            jsonb_agg(ROUND(COALESCE(cm.amt, 0)) ORDER BY ms.month_start)
        INTO
            v_cust_monthly_months,
            v_cust_monthly_bookings,
            v_cust_monthly_products,
            v_cust_monthly_memberships
        FROM months_series ms
        LEFT JOIN c_bookings cb ON cb.m_start = ms.month_start
        LEFT JOIN c_sales cs ON cs.m_start = ms.month_start
        LEFT JOIN c_memberships cm ON cm.m_start = ms.month_start;

        -- 4. Activity Ledger Tab 1: Bookings History
        SELECT COALESCE(jsonb_agg(br), '[]'::jsonb)
        INTO v_cust_bookings_rows
        FROM (
            SELECT
                TO_CHAR(b.booking_date, 'DD Mon YYYY') || 
                CASE 
                    WHEN b.start_time IS NOT NULL THEN ', ' || TO_CHAR(b.start_time, 'HH12:MI AM')
                    ELSE ''
                END AS col_datetime,
                b.service_name AS col_service,
                COALESCE(b.staff_name, 'Unassigned') AS col_staff,
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
            WHERE b.customer_id = p_customer_id
            ORDER BY b.booking_date DESC, b.start_time DESC NULLS LAST
            LIMIT 50
        ) br;

        -- 5. Activity Ledger Tab 2: Retail POS Purchases
        SELECT COALESCE(jsonb_agg(pr), '[]'::jsonb)
        INTO v_cust_products_rows
        FROM (
            SELECT
                TO_CHAR(s.created_at, 'DD Mon YYYY') AS col_date,
                array_to_string(s.product_names, ', ') AS col_products,
                array_to_string(s.category_names, ', ') AS col_categories,
                COALESCE(s.total_quantity, 1) AS col_qty,
                s.total_price AS col_gross,
                CASE
                    WHEN COALESCE(s.discount_amount, 0) > 0 THEN
                        '-₹' || s.discount_amount::text || ' (' || COALESCE(s.discount_name, 'Offer') || ')'
                    ELSE '—'
                END AS col_discount,
                s.final_amount AS col_final,
                COALESCE(s.payment_method, 'Cash') AS col_payment,
                COALESCE(s.staff_name, 'Desk') AS col_billed_by
            FROM public.sales_for_business_transactions s
            WHERE s.customer_id = p_customer_id
            ORDER BY s.created_at DESC
            LIMIT 50
        ) pr;

        -- 6. Activity Ledger Tab 3: Memberships Plans
        SELECT COALESCE(jsonb_agg(mr), '[]'::jsonb)
        INTO v_cust_memberships_rows
        FROM (
            SELECT
                mp.plan_name AS col_plan,
                TO_CHAR(mp.purchase_date, 'DD Mon YYYY') AS col_purchase_date,
                COALESCE(mp.duration::text, '12 Months') AS col_duration,
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
            WHERE mp.customer_id = p_customer_id
            ORDER BY mp.purchase_date DESC
            LIMIT 20
        ) mr;

        -- Construct Sub-Report 2 Output JSON
        v_result := jsonb_build_object(
            'sub_report', 'cust-insights',
            'profile', jsonb_build_object(
                'id', p_customer_id,
                'name', v_cust_name,
                'phone', v_cust_phone,
                'email', v_cust_email,
                'dob', v_cust_dob,
                'joined', v_cust_joined,
                'tag', v_cust_tag,
                'notes', v_cust_notes,
                'status', v_cust_status,
                'discounts_used_count', v_cust_discounts_count,
                'discounts_total_saved', v_cust_discounts_saved
            ),
            'spend_kpis', jsonb_build_object(
                'spent_total', v_cust_spent_total,
                'visits_total', v_cust_visits_count,
                'avg_per_visit', v_cust_avg_per_visit,
                'spent_bookings', v_cust_spent_bookings,
                'bookings_pct', v_cust_bookings_pct,
                'spent_products', v_cust_spent_products,
                'products_pct', v_cust_products_pct,
                'spent_memberships', v_cust_spent_memberships,
                'memberships_pct', v_cust_memberships_pct
            ),
            'monthly_trend', jsonb_build_object(
                'months', v_cust_monthly_months,
                'bookings', v_cust_monthly_bookings,
                'products', v_cust_monthly_products,
                'memberships', v_cust_monthly_memberships
            ),
            'wallet_share', jsonb_build_object(
                'bookings_val', v_cust_spent_bookings,
                'bookings_pct', v_cust_bookings_pct,
                'products_val', v_cust_spent_products,
                'products_pct', v_cust_products_pct,
                'memberships_val', v_cust_spent_memberships,
                'memberships_pct', v_cust_memberships_pct,
                'total_val', v_cust_spent_total
            ),
            'ledger', jsonb_build_object(
                'bookings', v_cust_bookings_rows,
                'products', v_cust_products_rows,
                'memberships', v_cust_memberships_rows
            ),
            'crm_directory', v_crm_directory
        );

        RETURN v_result;

    END IF;

END;
$function$;
