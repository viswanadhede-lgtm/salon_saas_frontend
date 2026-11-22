-- =============================================================================
-- Migration: 20261122000002_get_staff_reports_section_b.sql
-- Module   : Module 15 - Reports & Analytics (Staff 360° Insights RPC)
-- Purpose  : Extend get_staff_reports with Section B — Staff 360° Insights
--              Conditional branch:
--                p_staff_id IS NULL     → Section A (Staff Overview — unchanged)
--                p_staff_id IS NOT NULL → Section B (Staff 360° Profile)
--              Section B returns:
--                profile, spend_kpis, breakdown, net_revenue_trend,
--                revenue_mix, ledger (bookings + products + memberships),
--                staff_directory
-- Standards: Two-Tier Architecture Standard
--              - Tier 1: app.get_staff_reports (Core Engine)
--              - Tier 2: public.get_staff_reports (Public Wrapper)
--              - Section 1: Security pre-flight gates (unchanged)
--              - Section 2: Core logic with p_staff_id conditional branching
--              - Strict Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

-- Drop old signatures (4-param) cleanly before adding new 5-param signature
DROP FUNCTION IF EXISTS public.get_staff_reports(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_staff_reports(uuid, uuid, date, date);

-- =============================================================================
-- TIER 1: Core Engine in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_staff_reports(
    p_company_id  uuid,
    p_branch_id   uuid    DEFAULT NULL::uuid,
    p_start_date  date    DEFAULT NULL::date,
    p_end_date    date    DEFAULT NULL::date,
    p_staff_id    uuid    DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, shared, public, pg_temp
AS $$
DECLARE
    v_start_date              date := COALESCE(p_start_date, '2000-01-01'::date);
    v_end_date                date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date               date;

    -- Fixed 30-day activity window (for active/inactive headcount — always today-based)
    v_activity_start          date := CURRENT_DATE - INTERVAL '30 days';
    v_activity_end            date := CURRENT_DATE;

    -- ── Section A variables ───────────────────────────────────────────────────
    v_total_staff             bigint  := 0;
    v_active_staff            bigint  := 0;
    v_inactive_staff          bigint  := 0;
    v_total_completed_bookings bigint := 0;
    v_avg_bookings_per_staff  numeric := 0;
    v_gross_total_revenue     numeric := 0;
    v_avg_revenue_per_staff   numeric := 0;
    v_top_performer_name      text    := '—';
    v_top_performer_revenue   numeric := 0;
    v_top_performer_pct       numeric := 0;
    v_staff_leaderboard       jsonb   := '[]'::jsonb;

    -- ── Section B variables ───────────────────────────────────────────────────
    -- profile
    v_profile                 jsonb   := '{}'::jsonb;

    -- spend kpis (salon-wide totals for % calculations)
    v_salon_total_bk_rev      numeric := 0;
    v_salon_total_ps_rev      numeric := 0;
    v_salon_total_ms_rev      numeric := 0;

    -- staff personal revenue aggregates
    v_staff_bk_gross          numeric := 0;
    v_staff_bk_refunds        numeric := 0;
    v_staff_bk_discounts      numeric := 0;
    v_staff_bk_completed_cnt  bigint  := 0;
    v_staff_bk_cancelled_cnt  bigint  := 0;
    v_staff_bk_noshow_cnt     bigint  := 0;
    v_staff_bk_refunded_cnt   bigint  := 0;
    v_staff_bk_discounted_cnt bigint  := 0;

    v_staff_ps_gross          numeric := 0;
    v_staff_ps_refunds        numeric := 0;
    v_staff_ps_discounts      numeric := 0;
    v_staff_ps_sold_units     bigint  := 0;
    v_staff_ps_refunded_units bigint  := 0;
    v_staff_ps_discounted_cnt bigint  := 0;

    v_staff_ms_gross          numeric := 0;
    v_staff_ms_refunds        numeric := 0;
    v_staff_ms_discounts      numeric := 0;
    v_staff_ms_sold_cnt       bigint  := 0;
    v_staff_ms_refunded_cnt   bigint  := 0;
    v_staff_ms_discounted_cnt bigint  := 0;

    -- ledger arrays
    v_ledger_bookings         jsonb   := '[]'::jsonb;
    v_ledger_products         jsonb   := '[]'::jsonb;
    v_ledger_memberships      jsonb   := '[]'::jsonb;

    -- net revenue trend
    v_net_revenue_trend       jsonb   := '[]'::jsonb;

    -- staff directory for search
    v_staff_directory         jsonb   := '[]'::jsonb;

    -- derived
    v_bk_net                  numeric := 0;
    v_ps_net                  numeric := 0;
    v_ms_net                  numeric := 0;
    v_total_revenue           numeric := 0;
    v_total_net               numeric := 0;
    v_salon_total_rev         numeric := 0;
BEGIN
    -- Normalize inverted date range
    IF v_start_date > v_end_date THEN
        v_temp_date  := v_start_date;
        v_start_date := v_end_date;
        v_end_date   := v_temp_date;
    END IF;

    -- =========================================================================
    -- SECTION 1: SECURITY GATES (identical for both Section A and B)
    -- =========================================================================

    -- Gate 1.1: Mandatory company identification
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory' USING ERRCODE = 'P0001';
    END IF;

    -- Gate 1.2: Tenant access verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %',
            p_company_id, p_branch_id USING ERRCODE = '42501';
    END IF;

    -- Gate 1.3: Branch ownership check (if branch_id provided)
    IF p_branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id = p_branch_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: branch % does not belong to company %',
            p_branch_id, p_company_id USING ERRCODE = '42501';
    END IF;

    -- Gate 1.4: Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Gate 1.5 (Section B only): staff_id ownership verification
    IF p_staff_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app.staff
        WHERE staff_id = p_staff_id
          AND company_id = p_company_id
          AND LOWER(TRIM(COALESCE(status, ''))) != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: staff % does not belong to company %',
            p_staff_id, p_company_id USING ERRCODE = '42501';
    END IF;

    -- =========================================================================
    -- SECTION 2: CORE LOGIC — CONDITIONAL BRANCH
    -- =========================================================================

    IF p_staff_id IS NULL THEN

        -- ======================================================================
        -- SECTION A: STAFF OVERVIEW (original logic — unchanged)
        -- ======================================================================

        -- 2.1  TOTAL STAFF HEADCOUNT
        SELECT COUNT(*)
        INTO v_total_staff
        FROM app.staff s
        WHERE s.company_id = p_company_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted';

        -- 2.2  ACTIVE / INACTIVE (fixed 30-day window)
        WITH active_ids AS (
            SELECT DISTINCT staff_elem::uuid AS staff_id
            FROM app.bookings_for_business_transaction b,
                 LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND b.booking_date BETWEEN v_activity_start AND v_activity_end
              AND LOWER(TRIM(b.booking_status)) = 'completed'
              AND LOWER(TRIM(b.payment_status)) = 'paid'
              AND staff_elem ~ '^[0-9a-fA-F-]{36}$'
              AND EXISTS (
                  SELECT 1 FROM app.staff s2
                  WHERE s2.staff_id = staff_elem::uuid
                    AND s2.company_id = p_company_id
                    AND LOWER(TRIM(COALESCE(s2.status, ''))) != 'deleted'
              )
        )
        SELECT COUNT(*) INTO v_active_staff FROM active_ids;

        v_inactive_staff := GREATEST(0, v_total_staff - v_active_staff);

        -- 2.3  TOTAL COMPLETED BOOKINGS
        SELECT COUNT(*)
        INTO v_total_completed_bookings
        FROM app.bookings_for_business_transaction b
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(b.booking_status)) = 'completed'
          AND LOWER(TRIM(b.payment_status)) = 'paid';

        v_avg_bookings_per_staff := CASE
            WHEN v_total_staff > 0
            THEN ROUND(v_total_completed_bookings::numeric / v_total_staff, 1)
            ELSE 0
        END;

        -- 2.4  STAFF PERFORMANCE LEADERBOARD
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',                 st.staff_id,
                'name',               st.staff_name,
                'role',               COALESCE(st.role_name, 'Staff'),
                'phone',              COALESCE(st.phone, '—'),
                'email',              COALESCE(st.email, '—'),
                'status',             COALESCE(st.status, 'active'),
                'completed_bookings', COALESCE(st.completed_bookings, 0),
                'service_revenue',    COALESCE(st.service_revenue, 0),
                'retail_units',       COALESCE(st.retail_units, 0),
                'retail_sales',       COALESCE(st.retail_sales, 0),
                'memberships_count',  COALESCE(st.memberships_count, 0),
                'membership_sales',   COALESCE(st.membership_sales, 0),
                'total_revenue',      COALESCE(st.total_revenue, 0),
                'total_refunds',      COALESCE(st.total_refunds, 0),
                'total_discounts',    COALESCE(st.total_discounts, 0),
                'net_revenue',        GREATEST(0, COALESCE(st.total_revenue, 0)
                                                  - COALESCE(st.total_refunds, 0)
                                                  - COALESCE(st.total_discounts, 0)),
                'avg_ticket',         CASE
                                        WHEN COALESCE(st.completed_bookings, 0) > 0
                                        THEN ROUND(st.service_revenue / st.completed_bookings)
                                        ELSE 0
                                      END
            )
        ORDER BY COALESCE(st.total_revenue, 0) DESC, st.staff_name ASC), '[]'::jsonb)
        INTO v_staff_leaderboard
        FROM (
            SELECT
                s.staff_id,
                s.staff_name,
                s.role_name,
                s.phone,
                s.email,
                LOWER(TRIM(COALESCE(s.status, 'active'))) AS status,
                COALESCE(bk.completed_cnt, 0)::bigint  AS completed_bookings,
                COALESCE(bk.serv_rev, 0)               AS service_revenue,
                COALESCE(bk.bk_refunds, 0)             AS bk_refunds,
                COALESCE(bk.bk_discounts, 0)           AS bk_discounts,
                COALESCE(ps.retail_units, 0)::bigint   AS retail_units,
                COALESCE(ps.retail_rev, 0)             AS retail_sales,
                COALESCE(ps.ps_refunds, 0)             AS ps_refunds,
                COALESCE(ps.ps_discounts, 0)           AS ps_discounts,
                COALESCE(ms.mem_cnt, 0)::bigint        AS memberships_count,
                COALESCE(ms.mem_rev, 0)                AS membership_sales,
                COALESCE(ms.mem_refunds, 0)            AS mem_refunds,
                COALESCE(ms.mem_discounts, 0)          AS mem_discounts,
                (COALESCE(bk.serv_rev, 0) + COALESCE(ps.retail_rev, 0) + COALESCE(ms.mem_rev, 0)) AS total_revenue,
                (COALESCE(bk.bk_refunds, 0) + COALESCE(ps.ps_refunds, 0) + COALESCE(ms.mem_refunds, 0)) AS total_refunds,
                (COALESCE(bk.bk_discounts, 0) + COALESCE(ps.ps_discounts, 0) + COALESCE(ms.mem_discounts, 0)) AS total_discounts
            FROM app.staff s
            LEFT JOIN (
                SELECT
                    staff_elem::uuid AS staff_id,
                    COUNT(*) FILTER (
                        WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                          AND LOWER(TRIM(b.payment_status)) = 'paid'
                    ) AS completed_cnt,
                    COALESCE(SUM(b.final_amount) FILTER (
                        WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                          AND LOWER(TRIM(b.payment_status)) = 'paid'
                    ), 0) AS serv_rev,
                    COALESCE(SUM(ABS(b.final_amount)) FILTER (
                        WHERE LOWER(TRIM(b.payment_status)) = 'refunded'
                    ), 0) AS bk_refunds,
                    COALESCE(SUM(b.discount_amount) FILTER (
                        WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                          AND LOWER(TRIM(b.payment_status)) = 'paid'
                          AND COALESCE(b.discount_amount, 0) > 0
                    ), 0) AS bk_discounts
                FROM app.bookings_for_business_transaction b,
                     LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
                WHERE b.company_id = p_company_id
                  AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                  AND b.booking_date BETWEEN v_start_date AND v_end_date
                  AND staff_elem ~ '^[0-9a-fA-F-]{36}$'
                GROUP BY staff_elem::uuid
            ) bk ON bk.staff_id = s.staff_id
            LEFT JOIN (
                SELECT
                    sale.staff_id,
                    COALESCE(SUM(sale.total_quantity) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                    ), 0)::bigint AS retail_units,
                    COALESCE(SUM(sale.final_amount) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                    ), 0) AS retail_rev,
                    COALESCE(SUM(ABS(sale.final_amount)) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'refunded'
                    ), 0) AS ps_refunds,
                    COALESCE(SUM(sale.discount_amount) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                          AND COALESCE(sale.discount_amount, 0) > 0
                    ), 0) AS ps_discounts
                FROM app.sales_for_business_transactions sale
                WHERE sale.company_id = p_company_id
                  AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
                  AND sale.created_at::date BETWEEN v_start_date AND v_end_date
                  AND sale.staff_id IS NOT NULL
                GROUP BY sale.staff_id
            ) ps ON ps.staff_id = s.staff_id
            LEFT JOIN (
                SELECT
                    mp.assigned_by_user_id AS staff_id,
                    COUNT(*) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'paid') AS mem_cnt,
                    COALESCE(SUM(mp.final_amount) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                    ), 0) AS mem_rev,
                    COALESCE(SUM(COALESCE(mp.refund_amount, ABS(mp.final_amount))) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'refunded'
                           OR COALESCE(mp.refund_amount, 0) > 0
                    ), 0) AS mem_refunds,
                    COALESCE(SUM(mp.discount_amount) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                          AND COALESCE(mp.discount_amount, 0) > 0
                    ), 0) AS mem_discounts
                FROM app.membership_purchases mp
                WHERE mp.company_id = p_company_id
                  AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
                  AND mp.purchase_date BETWEEN v_start_date AND v_end_date
                  AND mp.assigned_by_user_id IS NOT NULL
                GROUP BY mp.assigned_by_user_id
            ) ms ON ms.staff_id = s.staff_id
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted'
        ) st;

        -- 2.5  GRAND TOTALS
        SELECT
            COALESCE(SUM((entry->>'total_revenue')::numeric), 0),
            CASE
                WHEN v_total_staff > 0
                THEN ROUND(COALESCE(SUM((entry->>'total_revenue')::numeric), 0) / v_total_staff)
                ELSE 0
            END
        INTO v_gross_total_revenue, v_avg_revenue_per_staff
        FROM jsonb_array_elements(v_staff_leaderboard) AS entry;

        -- 2.6  TOP PERFORMER
        SELECT
            COALESCE(entry->>'name', '—'),
            COALESCE((entry->>'total_revenue')::numeric, 0),
            CASE
                WHEN v_gross_total_revenue > 0
                THEN ROUND(((entry->>'total_revenue')::numeric / v_gross_total_revenue) * 100, 1)
                ELSE 0
            END
        INTO v_top_performer_name, v_top_performer_revenue, v_top_performer_pct
        FROM jsonb_array_elements(v_staff_leaderboard) AS entry
        LIMIT 1;

        -- 2.7  RETURN SECTION A PAYLOAD
        RETURN jsonb_build_object(
            'section',         'staff_overview',
            'overview_kpis', jsonb_build_object(
                'total_staff',                v_total_staff,
                'active_staff',               v_active_staff,
                'inactive_staff',             v_inactive_staff,
                'activity_window_days',       30,
                'total_completed_bookings',   v_total_completed_bookings,
                'avg_bookings_per_staff',     v_avg_bookings_per_staff,
                'gross_total_revenue',        v_gross_total_revenue,
                'avg_revenue_per_staff',      v_avg_revenue_per_staff,
                'top_performer_name',         v_top_performer_name,
                'top_performer_revenue',      v_top_performer_revenue,
                'top_performer_pct',          v_top_performer_pct
            ),
            'staff_leaderboard', v_staff_leaderboard
        );

    ELSE

        -- ======================================================================
        -- SECTION B: STAFF 360° INSIGHTS
        -- ======================================================================

        -- ── B.1  PROFILE ──────────────────────────────────────────────────────
        SELECT jsonb_build_object(
            'staff_id',         s.staff_id,
            'name',             COALESCE(s.staff_name, '—'),
            'role',             COALESCE(s.role_name, 'Staff'),
            'phone',            COALESCE(s.phone, '—'),
            'email',            COALESCE(s.email, '—'),
            'joined',           TO_CHAR(s.joined_at, 'DD Mon YYYY'),
            'status',           LOWER(TRIM(COALESCE(s.status, 'active'))),
            'services_offered', COALESCE(s.services_offered, '—')
        )
        INTO v_profile
        FROM app.staff s
        WHERE s.staff_id    = p_staff_id
          AND s.company_id  = p_company_id;

        -- ── B.2  SALON-WIDE TOTALS (for % share calculations) ─────────────────
        -- Bookings: total paid revenue across all staff
        SELECT COALESCE(SUM(b.final_amount), 0)
        INTO v_salon_total_bk_rev
        FROM app.bookings_for_business_transaction b
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(b.booking_status)) = 'completed'
          AND LOWER(TRIM(b.payment_status)) = 'paid';

        -- Product sales: total paid revenue across all staff
        SELECT COALESCE(SUM(sale.final_amount), 0)
        INTO v_salon_total_ps_rev
        FROM app.sales_for_business_transactions sale
        WHERE sale.company_id = p_company_id
          AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
          AND sale.created_at::date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(sale.payment_status)) = 'paid';

        -- Memberships: total paid revenue across all staff
        SELECT COALESCE(SUM(mp.final_amount), 0)
        INTO v_salon_total_ms_rev
        FROM app.membership_purchases mp
        WHERE mp.company_id = p_company_id
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND mp.purchase_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(mp.payment_status)) = 'paid';

        v_salon_total_rev := v_salon_total_bk_rev + v_salon_total_ps_rev + v_salon_total_ms_rev;

        -- ── B.3  STAFF PERSONAL BOOKING AGGREGATES ───────────────────────────
        SELECT
            COALESCE(SUM(b.final_amount) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                  AND LOWER(TRIM(b.payment_status)) = 'paid'
            ), 0),
            COALESCE(SUM(ABS(b.final_amount)) FILTER (
                WHERE LOWER(TRIM(b.payment_status)) = 'refunded'
            ), 0),
            COALESCE(SUM(b.discount_amount) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                  AND LOWER(TRIM(b.payment_status)) = 'paid'
                  AND COALESCE(b.discount_amount, 0) > 0
            ), 0),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                  AND LOWER(TRIM(b.payment_status)) = 'paid'
            ),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) IN ('cancelled', 'cancel')
            ),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) IN ('no-show', 'noshow', 'no_show')
            ),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(b.payment_status)) = 'refunded'
            ),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                  AND LOWER(TRIM(b.payment_status)) = 'paid'
                  AND COALESCE(b.discount_amount, 0) > 0
            )
        INTO
            v_staff_bk_gross,
            v_staff_bk_refunds,
            v_staff_bk_discounts,
            v_staff_bk_completed_cnt,
            v_staff_bk_cancelled_cnt,
            v_staff_bk_noshow_cnt,
            v_staff_bk_refunded_cnt,
            v_staff_bk_discounted_cnt
        FROM app.bookings_for_business_transaction b,
             LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN v_start_date AND v_end_date
          AND staff_elem::uuid = p_staff_id;

        -- ── B.4  STAFF PERSONAL PRODUCT SALES AGGREGATES ─────────────────────
        SELECT
            COALESCE(SUM(sale.final_amount) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
            ), 0),
            COALESCE(SUM(ABS(sale.final_amount)) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'refunded'
            ), 0),
            COALESCE(SUM(sale.discount_amount) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                  AND COALESCE(sale.discount_amount, 0) > 0
            ), 0),
            COALESCE(SUM(sale.total_quantity) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
            ), 0)::bigint,
            COALESCE(SUM(sale.total_quantity) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'refunded'
            ), 0)::bigint,
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                  AND COALESCE(sale.discount_amount, 0) > 0
            )
        INTO
            v_staff_ps_gross,
            v_staff_ps_refunds,
            v_staff_ps_discounts,
            v_staff_ps_sold_units,
            v_staff_ps_refunded_units,
            v_staff_ps_discounted_cnt
        FROM app.sales_for_business_transactions sale
        WHERE sale.company_id = p_company_id
          AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
          AND sale.created_at::date BETWEEN v_start_date AND v_end_date
          AND sale.staff_id = p_staff_id;

        -- ── B.5  STAFF PERSONAL MEMBERSHIP AGGREGATES ────────────────────────
        SELECT
            COALESCE(SUM(mp.final_amount) FILTER (
                WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
            ), 0),
            COALESCE(SUM(COALESCE(mp.refund_amount, ABS(mp.final_amount))) FILTER (
                WHERE LOWER(TRIM(mp.payment_status)) = 'refunded'
            ), 0),
            COALESCE(SUM(mp.discount_amount) FILTER (
                WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                  AND COALESCE(mp.discount_amount, 0) > 0
            ), 0),
            COUNT(*) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'paid'),
            COUNT(*) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'refunded'),
            COUNT(*) FILTER (
                WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                  AND COALESCE(mp.discount_amount, 0) > 0
            )
        INTO
            v_staff_ms_gross,
            v_staff_ms_refunds,
            v_staff_ms_discounts,
            v_staff_ms_sold_cnt,
            v_staff_ms_refunded_cnt,
            v_staff_ms_discounted_cnt
        FROM app.membership_purchases mp
        WHERE mp.company_id = p_company_id
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND mp.purchase_date BETWEEN v_start_date AND v_end_date
          AND mp.assigned_by_user_id = p_staff_id;

        -- ── B.6  DERIVED NET REVENUE VALUES ───────────────────────────────────
        v_bk_net       := GREATEST(0, v_staff_bk_gross - v_staff_bk_refunds - v_staff_bk_discounts);
        v_ps_net       := GREATEST(0, v_staff_ps_gross - v_staff_ps_refunds - v_staff_ps_discounts);
        v_ms_net       := GREATEST(0, v_staff_ms_gross - v_staff_ms_refunds - v_staff_ms_discounts);
        v_total_revenue := v_staff_bk_gross + v_staff_ps_gross + v_staff_ms_gross;
        v_total_net    := v_bk_net + v_ps_net + v_ms_net;

        -- ── B.7  LEDGER: BOOKING SALES (ALL statuses) ─────────────────────────
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'col_datetime',   TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' ||
                                  TO_CHAR(b.start_time::interval, 'HH12:MI AM'),
                'col_service',    COALESCE(b.service_name, '—'),
                'col_customer',   COALESCE(b.customer_name, '—'),
                'col_gross',      COALESCE(b.total_price, b.final_amount, 0),
                'col_discount',   CASE
                                    WHEN COALESCE(b.discount_amount, 0) > 0
                                    THEN '-₹' || ROUND(b.discount_amount)::text ||
                                         CASE WHEN b.discount_name IS NOT NULL
                                              THEN ' (' || b.discount_name || ')'
                                              ELSE '' END
                                    ELSE '—'
                                  END,
                'col_final',      COALESCE(b.final_amount, 0),
                'col_payment',    INITCAP(COALESCE(b.payment_method, 'Cash')),
                'col_status',     INITCAP(COALESCE(b.booking_status, 'Completed'))
            )
        ORDER BY b.booking_date DESC, b.start_time DESC), '[]'::jsonb)
        INTO v_ledger_bookings
        FROM app.bookings_for_business_transaction b,
             LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.booking_date BETWEEN v_start_date AND v_end_date
          AND staff_elem::uuid = p_staff_id;

        -- ── B.8  LEDGER: PRODUCT SALES (ALL statuses) ─────────────────────────
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'col_date',       TO_CHAR(sale.created_at::date, 'DD Mon YYYY'),
                'col_customer',   COALESCE(sale.customer_name, '—'),
                'col_products',   COALESCE(array_to_string(sale.product_names, ', '), '—'),
                'col_qty',        COALESCE(sale.total_quantity, 0),
                'col_gross',      COALESCE(sale.total_price, sale.final_amount, 0),
                'col_discount',   CASE
                                    WHEN COALESCE(sale.discount_amount, 0) > 0
                                    THEN '-₹' || ROUND(sale.discount_amount)::text ||
                                         CASE WHEN sale.discount_name IS NOT NULL
                                              THEN ' (' || sale.discount_name || ')'
                                              ELSE '' END
                                    ELSE '—'
                                  END,
                'col_final',      COALESCE(sale.final_amount, 0),
                'col_payment',    INITCAP(COALESCE(sale.payment_method, 'Cash')),
                'col_status',     CASE
                                    WHEN LOWER(TRIM(sale.payment_status)) = 'refunded' THEN 'Refunded'
                                    ELSE 'Paid'
                                  END
            )
        ORDER BY sale.created_at DESC), '[]'::jsonb)
        INTO v_ledger_products
        FROM app.sales_for_business_transactions sale
        WHERE sale.company_id = p_company_id
          AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
          AND sale.created_at::date BETWEEN v_start_date AND v_end_date
          AND sale.staff_id = p_staff_id;

        -- ── B.9  LEDGER: MEMBERSHIP SALES (ALL statuses) ──────────────────────
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'col_purchase_date', TO_CHAR(mp.purchase_date, 'DD Mon YYYY'),
                'col_plan',          COALESCE(mp.plan_name, '—'),
                'col_customer',      COALESCE(mp.customer_name, '—'),
                'col_duration',      CASE
                                       WHEN COALESCE(mp.duration, 0) > 0
                                       THEN mp.duration::text || ' Months'
                                       ELSE '12 Months'
                                     END,
                'col_expiry_date',   COALESCE(TO_CHAR(mp.expiry_date, 'DD Mon YYYY'), '—'),
                'col_plan_price',    COALESCE(mp.price, mp.final_amount, 0),
                'col_discount',      CASE
                                       WHEN COALESCE(mp.discount_amount, 0) > 0
                                       THEN '-₹' || ROUND(mp.discount_amount)::text ||
                                            CASE WHEN mp.discount_name IS NOT NULL
                                                 THEN ' (' || mp.discount_name || ')'
                                                 ELSE '' END
                                       ELSE '—'
                                     END,
                'col_final',         COALESCE(mp.final_amount, 0),
                'col_payment',       INITCAP(COALESCE(mp.payment_method, 'Cash')),
                'col_status',        CASE
                                       WHEN LOWER(TRIM(mp.payment_status)) = 'refunded' THEN 'Refunded'
                                       WHEN LOWER(TRIM(mp.status)) = 'active'           THEN 'Active'
                                       WHEN LOWER(TRIM(mp.status)) IN ('expired', 'cancelled', 'canceled') THEN INITCAP(mp.status)
                                       ELSE INITCAP(COALESCE(mp.status, 'Active'))
                                     END
            )
        ORDER BY mp.purchase_date DESC, mp.created_at DESC), '[]'::jsonb)
        INTO v_ledger_memberships
        FROM app.membership_purchases mp
        WHERE mp.company_id = p_company_id
          AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
          AND mp.purchase_date BETWEEN v_start_date AND v_end_date
          AND mp.assigned_by_user_id = p_staff_id;

        -- ── B.10  NET REVENUE TREND (daily rows for chart) ───────────────────
        --  One row per day in the date range that has at least one transaction.
        --  Client-side will group into weeks/months based on date filter.
        WITH date_series AS (
            SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS d
        ),
        bk_daily AS (
            SELECT
                b.booking_date AS d,
                GREATEST(0,
                    COALESCE(SUM(b.final_amount) FILTER (
                        WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                          AND LOWER(TRIM(b.payment_status)) = 'paid'
                    ), 0)
                    - COALESCE(SUM(ABS(b.final_amount)) FILTER (
                        WHERE LOWER(TRIM(b.payment_status)) = 'refunded'
                    ), 0)
                    - COALESCE(SUM(b.discount_amount) FILTER (
                        WHERE LOWER(TRIM(b.booking_status)) = 'completed'
                          AND LOWER(TRIM(b.payment_status)) = 'paid'
                          AND COALESCE(b.discount_amount, 0) > 0
                    ), 0)
                ) AS bk_net
            FROM app.bookings_for_business_transaction b,
                 LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND b.booking_date BETWEEN v_start_date AND v_end_date
              AND staff_elem::uuid = p_staff_id
            GROUP BY b.booking_date
        ),
        ps_daily AS (
            SELECT
                sale.created_at::date AS d,
                GREATEST(0,
                    COALESCE(SUM(sale.final_amount) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                    ), 0)
                    - COALESCE(SUM(ABS(sale.final_amount)) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'refunded'
                    ), 0)
                    - COALESCE(SUM(sale.discount_amount) FILTER (
                        WHERE LOWER(TRIM(sale.payment_status)) = 'paid'
                          AND COALESCE(sale.discount_amount, 0) > 0
                    ), 0)
                ) AS ps_net
            FROM app.sales_for_business_transactions sale
            WHERE sale.company_id = p_company_id
              AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
              AND sale.created_at::date BETWEEN v_start_date AND v_end_date
              AND sale.staff_id = p_staff_id
            GROUP BY sale.created_at::date
        ),
        ms_daily AS (
            SELECT
                mp.purchase_date AS d,
                GREATEST(0,
                    COALESCE(SUM(mp.final_amount) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                    ), 0)
                    - COALESCE(SUM(COALESCE(mp.refund_amount, ABS(mp.final_amount))) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'refunded'
                    ), 0)
                    - COALESCE(SUM(mp.discount_amount) FILTER (
                        WHERE LOWER(TRIM(mp.payment_status)) = 'paid'
                          AND COALESCE(mp.discount_amount, 0) > 0
                    ), 0)
                ) AS ms_net
            FROM app.membership_purchases mp
            WHERE mp.company_id = p_company_id
              AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
              AND mp.purchase_date BETWEEN v_start_date AND v_end_date
              AND mp.assigned_by_user_id = p_staff_id
            GROUP BY mp.purchase_date
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'date',           TO_CHAR(ds.d, 'YYYY-MM-DD'),
                'bookings_net',   COALESCE(bk.bk_net, 0),
                'products_net',   COALESCE(ps.ps_net, 0),
                'memberships_net',COALESCE(ms.ms_net, 0)
            )
        ORDER BY ds.d ASC), '[]'::jsonb)
        INTO v_net_revenue_trend
        FROM date_series ds
        LEFT JOIN bk_daily bk ON bk.d = ds.d
        LEFT JOIN ps_daily ps ON ps.d = ds.d
        LEFT JOIN ms_daily ms ON ms.d = ds.d
        -- Only include days that have at least one transaction (prune empty days)
        WHERE COALESCE(bk.bk_net, 0) > 0
           OR COALESCE(ps.ps_net, 0) > 0
           OR COALESCE(ms.ms_net, 0) > 0;

        -- ── B.11  STAFF DIRECTORY (for search dropdown) ───────────────────────
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'staff_id',   s.staff_id,
                'name',       s.staff_name,
                'role',       COALESCE(s.role_name, 'Staff')
            )
        ORDER BY s.staff_name ASC), '[]'::jsonb)
        INTO v_staff_directory
        FROM app.staff s
        WHERE s.company_id = p_company_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted';

        -- ── B.12  RETURN SECTION B PAYLOAD ────────────────────────────────────
        RETURN jsonb_build_object(
            'section',    'staff_360',

            -- Profile card
            'profile',    v_profile,

            -- 4 stat cards
            'spend_kpis', jsonb_build_object(
                'total_revenue',           v_total_revenue,
                'total_revenue_share_pct', CASE
                                             WHEN v_salon_total_rev > 0
                                             THEN ROUND((v_total_revenue / v_salon_total_rev) * 100, 1)
                                             ELSE 0
                                           END,
                'bookings_revenue',        v_staff_bk_gross,
                'bookings_staff_pct',      CASE
                                             WHEN v_salon_total_bk_rev > 0
                                             THEN ROUND((v_staff_bk_gross / v_salon_total_bk_rev) * 100, 1)
                                             ELSE 0
                                           END,
                'products_revenue',        v_staff_ps_gross,
                'products_staff_pct',      CASE
                                             WHEN v_salon_total_ps_rev > 0
                                             THEN ROUND((v_staff_ps_gross / v_salon_total_ps_rev) * 100, 1)
                                             ELSE 0
                                           END,
                'memberships_revenue',     v_staff_ms_gross,
                'memberships_staff_pct',   CASE
                                             WHEN v_salon_total_ms_rev > 0
                                             THEN ROUND((v_staff_ms_gross / v_salon_total_ms_rev) * 100, 1)
                                             ELSE 0
                                           END
            ),

            -- 3 breakdown cards (gross = completed_rev + refund_amt + discount_amt)
            'breakdown',  jsonb_build_object(
                'bookings', jsonb_build_object(
                    'completed_count',         v_staff_bk_completed_cnt,
                    'completed_revenue',       v_staff_bk_gross,
                    'cancelled_count',         v_staff_bk_cancelled_cnt,
                    'cancelled_missed_revenue',0,
                    'noshow_count',            v_staff_bk_noshow_cnt,
                    'noshow_missed_revenue',   0,
                    'refunded_count',          v_staff_bk_refunded_cnt,
                    'refunded_amount',         v_staff_bk_refunds,
                    'discounted_count',        v_staff_bk_discounted_cnt,
                    'discounted_amount',       v_staff_bk_discounts,
                    'gross',                   v_staff_bk_gross + v_staff_bk_refunds + v_staff_bk_discounts,
                    'net',                     v_bk_net
                ),
                'products', jsonb_build_object(
                    'sold_units',         v_staff_ps_sold_units,
                    'sold_revenue',       v_staff_ps_gross,
                    'refunded_units',     v_staff_ps_refunded_units,
                    'refunded_amount',    v_staff_ps_refunds,
                    'discounted_sales',   v_staff_ps_discounted_cnt,
                    'discounted_amount',  v_staff_ps_discounts,
                    'gross',              v_staff_ps_gross + v_staff_ps_refunds + v_staff_ps_discounts,
                    'net',                v_ps_net
                ),
                'memberships', jsonb_build_object(
                    'sold_count',         v_staff_ms_sold_cnt,
                    'sold_revenue',       v_staff_ms_gross,
                    'refunded_count',     v_staff_ms_refunded_cnt,
                    'refunded_amount',    v_staff_ms_refunds,
                    'discounted_count',   v_staff_ms_discounted_cnt,
                    'discounted_amount',  v_staff_ms_discounts,
                    'gross',              v_staff_ms_gross + v_staff_ms_refunds + v_staff_ms_discounts,
                    'net',                v_ms_net
                )
            ),

            -- Net revenue trend (daily rows; client groups by period)
            'net_revenue_trend', v_net_revenue_trend,

            -- Revenue mix donut
            'revenue_mix',  jsonb_build_object(
                'total',          v_total_net,
                'bookings_val',   v_bk_net,
                'bookings_pct',   CASE WHEN v_total_net > 0 THEN ROUND((v_bk_net / v_total_net) * 100, 1) ELSE 0 END,
                'products_val',   v_ps_net,
                'products_pct',   CASE WHEN v_total_net > 0 THEN ROUND((v_ps_net / v_total_net) * 100, 1) ELSE 0 END,
                'memberships_val',v_ms_net,
                'memberships_pct',CASE WHEN v_total_net > 0 THEN ROUND((v_ms_net / v_total_net) * 100, 1) ELSE 0 END
            ),

            -- Transaction ledger (3 tabs)
            'ledger', jsonb_build_object(
                'bookings',    v_ledger_bookings,
                'products',    v_ledger_products,
                'memberships', v_ledger_memberships
            ),

            -- Staff directory (search dropdown)
            'staff_directory', v_staff_directory
        );

    END IF; -- END conditional branch

END;
$$;

-- =============================================================================
-- TIER 2: Zero-Downtime Public Schema Wrapper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_staff_reports(
    p_company_id  uuid,
    p_branch_id   uuid    DEFAULT NULL::uuid,
    p_start_date  date    DEFAULT NULL::date,
    p_end_date    date    DEFAULT NULL::date,
    p_staff_id    uuid    DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, shared, public, pg_temp
AS $$
BEGIN
    RETURN app.get_staff_reports(
        p_company_id,
        p_branch_id,
        p_start_date,
        p_end_date,
        p_staff_id
    );
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.get_staff_reports(uuid, uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_reports(uuid, uuid, date, date, uuid) TO authenticated, service_role;
