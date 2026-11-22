-- =============================================================================
-- Migration: 20261122000001_get_staff_reports.sql
-- Module   : Module 15 - Reports & Analytics (Staff Overview Master RPC)
-- Purpose  : Staff Overview Report — 4 Stat Cards, Graph, Donut, Table
--              Covers:
--                1. Total / Active / Inactive staff headcount
--                2. Total completed bookings + avg per staff (selected period)
--                3. 3-stream revenue leaderboard for all staff (selected period)
--                4. Top performer identification
-- Standards: Two-Tier Architecture Standard
--              - Tier 1: app.get_staff_reports (Core Engine)
--              - Tier 2: public.get_staff_reports (Public Wrapper)
--              - Section 1: Security pre-flight gates
--              - Section 2: Core logic implementation (5 steps)
--              - Strict Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

-- Drop existing signatures cleanly
DROP FUNCTION IF EXISTS public.get_staff_reports(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_staff_reports(uuid, uuid, date, date);

-- =============================================================================
-- TIER 1: Core Engine in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_staff_reports(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT NULL::date,
    p_end_date    date DEFAULT NULL::date
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

    -- 2.1 Total Staff
    v_total_staff             bigint := 0;

    -- 2.2 Active / Inactive (fixed 30-day window)
    v_active_staff            bigint := 0;
    v_inactive_staff          bigint := 0;

    -- 2.3 Completed Bookings (selected period)
    v_total_completed_bookings bigint := 0;
    v_avg_bookings_per_staff  numeric := 0;

    -- 2.5 Grand totals (derived from leaderboard)
    v_gross_total_revenue     numeric := 0;
    v_avg_revenue_per_staff   numeric := 0;

    -- 2.6 Top performer
    v_top_performer_name      text := '—';
    v_top_performer_revenue   numeric := 0;
    v_top_performer_pct       numeric := 0;

    -- Leaderboard JSON array
    v_staff_leaderboard       jsonb := '[]'::jsonb;
BEGIN
    -- Normalize inverted date range
    IF v_start_date > v_end_date THEN
        v_temp_date  := v_start_date;
        v_start_date := v_end_date;
        v_end_date   := v_temp_date;
    END IF;

    -- =========================================================================
    -- SECTION 1: SECURITY GATES
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

    -- =========================================================================
    -- SECTION 2: CORE LOGIC IMPLEMENTATION
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- 2.1  TOTAL STAFF HEADCOUNT
    --      Source: app.staff
    --      Rule: all staff where status != 'deleted'
    -- -------------------------------------------------------------------------
    SELECT COUNT(*)
    INTO v_total_staff
    FROM app.staff s
    WHERE s.company_id = p_company_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND LOWER(TRIM(COALESCE(s.status, ''))) != 'deleted';

    -- -------------------------------------------------------------------------
    -- 2.2  ACTIVE / INACTIVE STAFF HEADCOUNT
    --      Source: app.bookings_for_business_transaction
    --      Rule:
    --        Active   = ≥1 completed+paid booking in LAST 30 DAYS (fixed window)
    --        Inactive = Total Staff - Active
    --      NOTE: This is ALWAYS based on the fixed 30-day window from today,
    --            NOT the user's selected report date range.
    -- -------------------------------------------------------------------------
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
          -- Only count staff who actually belong to this company
          AND EXISTS (
              SELECT 1 FROM app.staff s2
              WHERE s2.staff_id = staff_elem::uuid
                AND s2.company_id = p_company_id
                AND LOWER(TRIM(COALESCE(s2.status, ''))) != 'deleted'
          )
    )
    SELECT COUNT(*) INTO v_active_staff FROM active_ids;

    v_inactive_staff := GREATEST(0, v_total_staff - v_active_staff);

    -- -------------------------------------------------------------------------
    -- 2.3  TOTAL COMPLETED BOOKINGS FOR SELECTED PERIOD
    --      Source: app.bookings_for_business_transaction
    --      Rule: booking_status = 'completed' AND payment_status = 'paid'
    --            within the selected date range
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 2.4  STAFF PERFORMANCE LEADERBOARD
    --      Sources: app.bookings_for_business_transaction
    --               app.sales_for_business_transactions
    --               app.membership_purchases
    --      Aggregates all 3 revenue streams per staff for the SELECTED PERIOD.
    --      Sorted: total_revenue DESC, staff_name ASC
    -- -------------------------------------------------------------------------
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            -- Identity
            'id',                 st.staff_id,
            'name',               st.staff_name,
            'role',               COALESCE(st.role_name, 'Staff'),
            'phone',              COALESCE(st.phone, '—'),
            'email',              COALESCE(st.email, '—'),
            'status',             COALESCE(st.status, 'active'),
            -- Bookings stream
            'completed_bookings', COALESCE(st.completed_bookings, 0),
            'service_revenue',    COALESCE(st.service_revenue, 0),
            -- Retail POS stream
            'retail_units',       COALESCE(st.retail_units, 0),
            'retail_sales',       COALESCE(st.retail_sales, 0),
            -- Membership stream
            'memberships_count',  COALESCE(st.memberships_count, 0),
            'membership_sales',   COALESCE(st.membership_sales, 0),
            -- Aggregated totals
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

            -- Bookings aggregate (selected period)
            COALESCE(bk.completed_cnt, 0)::bigint  AS completed_bookings,
            COALESCE(bk.serv_rev, 0)               AS service_revenue,
            COALESCE(bk.bk_refunds, 0)             AS bk_refunds,
            COALESCE(bk.bk_discounts, 0)           AS bk_discounts,

            -- Retail POS aggregate (selected period)
            COALESCE(ps.retail_units, 0)::bigint   AS retail_units,
            COALESCE(ps.retail_rev, 0)             AS retail_sales,
            COALESCE(ps.ps_refunds, 0)             AS ps_refunds,
            COALESCE(ps.ps_discounts, 0)           AS ps_discounts,

            -- Membership aggregate (selected period)
            COALESCE(ms.mem_cnt, 0)::bigint        AS memberships_count,
            COALESCE(ms.mem_rev, 0)                AS membership_sales,
            COALESCE(ms.mem_refunds, 0)            AS mem_refunds,
            COALESCE(ms.mem_discounts, 0)          AS mem_discounts,

            -- Combined totals
            (COALESCE(bk.serv_rev, 0) + COALESCE(ps.retail_rev, 0) + COALESCE(ms.mem_rev, 0)) AS total_revenue,
            (COALESCE(bk.bk_refunds, 0) + COALESCE(ps.ps_refunds, 0) + COALESCE(ms.mem_refunds, 0)) AS total_refunds,
            (COALESCE(bk.bk_discounts, 0) + COALESCE(ps.ps_discounts, 0) + COALESCE(ms.mem_discounts, 0)) AS total_discounts

        FROM app.staff s

        -- ── Bookings aggregate ──────────────────────────────────────────────
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

        -- ── Retail POS aggregate ────────────────────────────────────────────
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

        -- ── Membership aggregate ────────────────────────────────────────────
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

    -- -------------------------------------------------------------------------
    -- 2.5  GRAND TOTALS (derived from leaderboard)
    -- -------------------------------------------------------------------------
    SELECT
        COALESCE(SUM((entry->>'total_revenue')::numeric), 0),
        CASE
            WHEN v_total_staff > 0
            THEN ROUND(COALESCE(SUM((entry->>'total_revenue')::numeric), 0) / v_total_staff)
            ELSE 0
        END
    INTO v_gross_total_revenue, v_avg_revenue_per_staff
    FROM jsonb_array_elements(v_staff_leaderboard) AS entry;

    -- -------------------------------------------------------------------------
    -- 2.6  TOP PERFORMER (leaderboard is already sorted DESC — position 0)
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 2.7  RETURN COMPLETE PAYLOAD
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(

        -- Stat Card data
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

        -- Full staff leaderboard (for graph + donut + table)
        -- Sorted: total_revenue DESC
        'staff_leaderboard', v_staff_leaderboard
    );
END;
$$;

-- =============================================================================
-- TIER 2: Zero-Downtime Public Schema Wrapper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_staff_reports(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT NULL::date,
    p_end_date    date DEFAULT NULL::date
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
        p_end_date
    );
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.get_staff_reports(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_reports(uuid, uuid, date, date) TO authenticated, service_role;
