-- =============================================================================
-- Migration: 20261121000003_get_staff_revenue_stats_across_three_modules.sql
-- Module   : Module 15 - Reports & Analytics (Staff Performance Master RPC)
-- Purpose  : Staff Revenue Generation Module across 3 distinct revenue streams:
--              1. Bookings (Services) - app.bookings_for_business_transaction
--              2. Retail POS (Products) - app.sales_for_business_transactions
--              3. Membership Purchases - app.membership_purchases
-- Standards: Two-Tier Architecture Standard
--              - Tier 1: app.get_staff_revenue_stats_across_three_modules (Core Engine)
--              - Tier 2: public.get_staff_revenue_stats_across_three_modules (Public Wrapper)
--              - Pre-flight security gates: company, tenant, branch, subscription
--              - Strict Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

-- Drop existing public / app signatures cleanly
DROP FUNCTION IF EXISTS public.get_staff_revenue_stats_across_three_modules(uuid, uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_staff_revenue_stats_across_three_modules(uuid, uuid, uuid, date, date);

-- =============================================================================
-- 1. Tier 1: Core Engine in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_staff_revenue_stats_across_three_modules(
    p_company_id  uuid,
    p_staff_id    uuid DEFAULT NULL::uuid,
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
    v_start_date                        date := COALESCE(p_start_date, '2000-01-01'::date);
    v_end_date                          date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date                         date;

    -- Staff Profile (if p_staff_id provided)
    v_staff_profile                     jsonb := NULL;

    -- Module 1: Bookings variables
    v_completed_bookings_count          bigint := 0;
    v_completed_bookings_revenue        numeric := 0;
    v_cancelled_bookings_count          bigint := 0;
    v_cancelled_bookings_missed_rev     numeric := 0;
    v_noshow_bookings_count             bigint := 0;
    v_noshow_bookings_missed_rev        numeric := 0;
    v_refunded_bookings_count           bigint := 0;
    v_refunded_bookings_amount          numeric := 0;
    v_discounted_bookings_count         bigint := 0;
    v_discounted_bookings_total_amount  numeric := 0;
    v_gross_total_bookings_count        bigint := 0;
    v_net_service_revenue               numeric := 0;

    -- Module 2: POS Product Sales variables
    v_gross_products_sold_quantity      bigint := 0;
    v_gross_products_sales_revenue      numeric := 0;
    v_refunded_sales_count              bigint := 0;
    v_total_refunded_sales_amount       numeric := 0;
    v_discounted_sales_count            bigint := 0;
    v_discounted_sales_total_amount     numeric := 0;
    v_net_products_sales_revenue        numeric := 0;

    -- Module 3: Membership Purchases variables
    v_memberships_sold_count            bigint := 0;
    v_memberships_sold_revenue          numeric := 0;
    v_cancelled_memberships_count       bigint := 0;
    v_cancelled_memberships_lost_rev    numeric := 0;
    v_refunded_memberships_count        bigint := 0;
    v_refunded_memberships_amount       numeric := 0;
    v_discounted_memberships_count      bigint := 0;
    v_discounted_memberships_total_amt  numeric := 0;
    v_net_membership_revenue            numeric := 0;

    -- Combined Totals
    v_gross_total_revenue               numeric := 0;
    v_total_refunds_amount              numeric := 0;
    v_total_discounts_amount            numeric := 0;
    v_net_total_revenue                 numeric := 0;
    v_total_activities_count            bigint := 0;

    -- Staff Leaderboard array
    v_staff_leaderboard                 jsonb := '[]'::jsonb;
BEGIN
    -- Normalize inverted dates
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
        SELECT 1 FROM shared.branches WHERE branch_id = p_branch_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: branch % does not belong to company %',
            p_branch_id, p_company_id USING ERRCODE = '42501';
    END IF;

    -- Gate 1.4: Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- =========================================================================
    -- STAFF PROFILE LOOKUP (if p_staff_id provided)
    -- =========================================================================
    IF p_staff_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'staff_id',   s.staff_id,
            'staff_name', s.staff_name,
            'role_name',  COALESCE(s.role_name, 'Staff'),
            'phone',      COALESCE(s.phone, '—'),
            'email',      COALESCE(s.email, '—'),
            'status',     COALESCE(s.status, 'active'),
            'joined_at',  TO_CHAR(COALESCE(s.joined_at, s.created_at), 'DD Mon YYYY')
        ) INTO v_staff_profile
        FROM app.staff s
        WHERE s.staff_id = p_staff_id
          AND s.company_id = p_company_id;
    END IF;

    -- =========================================================================
    -- 1. STAFF REVENUE FROM BOOKINGS (bookings_for_business_transaction)
    -- =========================================================================
    SELECT
        -- Case 1: Completed Bookings
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) = 'completed' AND LOWER(TRIM(payment_status)) = 'paid'),
        COALESCE(SUM(final_amount) FILTER (WHERE LOWER(TRIM(booking_status)) = 'completed' AND LOWER(TRIM(payment_status)) = 'paid'), 0),

        -- Case 2: Cancelled Bookings
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) = 'cancelled'),
        COALESCE(SUM(final_amount) FILTER (WHERE LOWER(TRIM(booking_status)) = 'cancelled'), 0),

        -- Case 3: No-Show Bookings
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'no_show', 'noshow')),
        COALESCE(SUM(final_amount) FILTER (WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'no_show', 'noshow')), 0),

        -- Case 4: Refunded Bookings
        COUNT(*) FILTER (WHERE LOWER(TRIM(payment_status)) = 'refunded'),
        COALESCE(SUM(ABS(final_amount)) FILTER (WHERE LOWER(TRIM(payment_status)) = 'refunded'), 0),

        -- Case 5: Discounts Given by Staff for Bookings
        COUNT(*) FILTER (WHERE LOWER(TRIM(booking_status)) = 'completed' AND LOWER(TRIM(payment_status)) = 'paid' AND COALESCE(discount_amount, 0) > 0),
        COALESCE(SUM(discount_amount) FILTER (WHERE LOWER(TRIM(booking_status)) = 'completed' AND LOWER(TRIM(payment_status)) = 'paid' AND COALESCE(discount_amount, 0) > 0), 0)
    INTO
        v_completed_bookings_count,
        v_completed_bookings_revenue,
        v_cancelled_bookings_count,
        v_cancelled_bookings_missed_rev,
        v_noshow_bookings_count,
        v_noshow_bookings_missed_rev,
        v_refunded_bookings_count,
        v_refunded_bookings_amount,
        v_discounted_bookings_count,
        v_discounted_bookings_total_amount
    FROM app.bookings_for_business_transaction b
    WHERE b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.booking_date BETWEEN v_start_date AND v_end_date
      AND (p_staff_id IS NULL OR p_staff_id::text = ANY(string_to_array(replace(b.staff_id, ' ', ''), ',')));

    -- Case 6: Gross Total Bookings
    v_gross_total_bookings_count := v_completed_bookings_count + v_cancelled_bookings_count + v_noshow_bookings_count;
    v_net_service_revenue        := GREATEST(0, v_completed_bookings_revenue - v_refunded_bookings_amount);

    -- =========================================================================
    -- 2. STAFF REVENUE FROM POS (sales_for_business_transactions)
    -- =========================================================================
    -- Case 1: Gross Sales
    SELECT
        COALESCE(SUM(total_quantity) FILTER (WHERE LOWER(TRIM(payment_status)) = 'paid'), 0)::bigint,
        COALESCE(SUM(final_amount) FILTER (WHERE LOWER(TRIM(payment_status)) = 'paid'), 0)
    INTO v_gross_products_sold_quantity, v_gross_products_sales_revenue
    FROM app.sales_for_business_transactions s
    WHERE s.company_id = p_company_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at::date BETWEEN v_start_date AND v_end_date
      AND (p_staff_id IS NULL OR s.staff_id = p_staff_id);

    -- Case 2: Refunded Sales
    SELECT
        COUNT(DISTINCT sale_id),
        COALESCE(SUM(ABS(final_amount)), 0)
    INTO v_refunded_sales_count, v_total_refunded_sales_amount
    FROM app.sales_for_business_transactions s
    WHERE s.company_id = p_company_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at::date BETWEEN v_start_date AND v_end_date
      AND (p_staff_id IS NULL OR s.staff_id = p_staff_id)
      AND LOWER(TRIM(payment_status)) = 'refunded';

    -- Case 3: Discounts Given for a Sale (audited via discount_usages)
    SELECT
        COUNT(DISTINCT s.sale_id),
        COALESCE(SUM(
            COALESCE(du.net_disc, s.discount_amount)
        ), 0)
    INTO v_discounted_sales_count, v_discounted_sales_total_amount
    FROM app.sales_for_business_transactions s
    LEFT JOIN (
        SELECT
            reference_id,
            GREATEST(0, SUM(discount_amount - COALESCE(reversal_amount, 0))) AS net_disc
        FROM app.discount_usages
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND status != 'reversed'
        GROUP BY reference_id
    ) du ON du.reference_id = s.sale_id
    WHERE s.company_id = p_company_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at::date BETWEEN v_start_date AND v_end_date
      AND (p_staff_id IS NULL OR s.staff_id = p_staff_id)
      AND LOWER(TRIM(s.payment_status)) = 'paid'
      AND COALESCE(s.discount_amount, 0) > 0;

    -- Case 4: Net POS Revenue
    v_net_products_sales_revenue := GREATEST(0, v_gross_products_sales_revenue - v_total_refunded_sales_amount);

    -- =========================================================================
    -- 3. STAFF REVENUE FROM MEMBERSHIP SALES (membership_purchases)
    -- =========================================================================
    SELECT
        -- Case 1: Assigned / Sold Memberships
        COUNT(*) FILTER (WHERE (p_staff_id IS NULL OR assigned_by_user_id = p_staff_id) AND LOWER(TRIM(payment_status)) = 'paid'),
        COALESCE(SUM(final_amount) FILTER (WHERE (p_staff_id IS NULL OR assigned_by_user_id = p_staff_id) AND LOWER(TRIM(payment_status)) = 'paid'), 0),

        -- Case 2: Cancelled Memberships
        COUNT(*) FILTER (WHERE (p_staff_id IS NULL OR cancelled_by_user_id = p_staff_id) AND LOWER(TRIM(status)) = 'cancelled'),
        COALESCE(SUM(final_amount) FILTER (WHERE (p_staff_id IS NULL OR cancelled_by_user_id = p_staff_id) AND LOWER(TRIM(status)) = 'cancelled'), 0),

        -- Case 3: Refunded Memberships
        COUNT(*) FILTER (WHERE (p_staff_id IS NULL OR refunded_by_user_id = p_staff_id) AND (LOWER(TRIM(payment_status)) = 'refunded' OR COALESCE(refund_amount, 0) > 0)),
        COALESCE(SUM(COALESCE(refund_amount, ABS(final_amount))) FILTER (WHERE (p_staff_id IS NULL OR refunded_by_user_id = p_staff_id) AND (LOWER(TRIM(payment_status)) = 'refunded' OR COALESCE(refund_amount, 0) > 0)), 0),

        -- Case 4: Discounts Provided for Memberships
        COUNT(*) FILTER (WHERE (p_staff_id IS NULL OR assigned_by_user_id = p_staff_id) AND LOWER(TRIM(payment_status)) = 'paid' AND COALESCE(discount_amount, 0) > 0),
        COALESCE(SUM(discount_amount) FILTER (WHERE (p_staff_id IS NULL OR assigned_by_user_id = p_staff_id) AND LOWER(TRIM(payment_status)) = 'paid' AND COALESCE(discount_amount, 0) > 0), 0)
    INTO
        v_memberships_sold_count,
        v_memberships_sold_revenue,
        v_cancelled_memberships_count,
        v_cancelled_memberships_lost_rev,
        v_refunded_memberships_count,
        v_refunded_memberships_amount,
        v_discounted_memberships_count,
        v_discounted_memberships_total_amt
    FROM app.membership_purchases mp
    WHERE mp.company_id = p_company_id
      AND (p_branch_id IS NULL OR mp.branch_id = p_branch_id)
      AND mp.purchase_date BETWEEN v_start_date AND v_end_date;

    v_net_membership_revenue := GREATEST(0, v_memberships_sold_revenue - v_refunded_memberships_amount);

    -- =========================================================================
    -- 4. TOTALS ACROSS ALL THREE REVENUE GENERATION MODULES
    -- =========================================================================
    v_gross_total_revenue    := v_completed_bookings_revenue + v_gross_products_sales_revenue + v_memberships_sold_revenue;
    v_total_refunds_amount   := v_refunded_bookings_amount + v_total_refunded_sales_amount + v_refunded_memberships_amount;
    v_total_discounts_amount := v_discounted_bookings_total_amount + v_discounted_sales_total_amount + v_discounted_memberships_total_amt;
    v_net_total_revenue      := GREATEST(0, v_gross_total_revenue - v_total_refunds_amount - v_total_discounts_amount);
    v_total_activities_count := v_completed_bookings_count + v_gross_products_sold_quantity + v_memberships_sold_count;

    -- =========================================================================
    -- 5. STAFF PERFORMANCE LEADERBOARD (FLEET-WIDE SUMMARY)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',                  st.staff_id,
            'name',                st.staff_name,
            'role',                COALESCE(st.role_name, 'Staff'),
            'phone',               COALESCE(st.phone, '—'),
            'email',               COALESCE(st.email, '—'),
            'status',              COALESCE(st.status, 'active'),
            'completed_bookings',  st.completed_bookings,
            'service_revenue',     st.service_revenue,
            'retail_sales',        st.retail_sales,
            'retail_units',        st.retail_units,
            'membership_sales',    st.membership_sales,
            'memberships_count',   st.memberships_count,
            'total_revenue',       st.total_revenue,
            'total_discounts',     st.total_discounts,
            'total_refunds',       st.total_refunds,
            'net_revenue',         st.net_revenue,
            'avg_ticket',          CASE WHEN st.completed_bookings > 0
                                        THEN ROUND(st.service_revenue / st.completed_bookings)
                                        ELSE 0 END
        )
    ORDER BY st.total_revenue DESC, st.staff_name ASC), '[]'::jsonb)
    INTO v_staff_leaderboard
    FROM (
        SELECT
            s.staff_id,
            s.staff_name,
            s.role_name,
            s.phone,
            s.email,
            s.status,

            -- Bookings
            COALESCE(bk.completed_cnt, 0)::bigint AS completed_bookings,
            COALESCE(bk.serv_rev, 0)              AS service_revenue,

            -- Retail POS
            COALESCE(ps.retail_units, 0)::bigint  AS retail_units,
            COALESCE(ps.retail_rev, 0)            AS retail_sales,

            -- Memberships
            COALESCE(ms.mem_cnt, 0)::bigint       AS memberships_count,
            COALESCE(ms.mem_rev, 0)               AS membership_sales,

            -- Combined Total
            (COALESCE(bk.serv_rev, 0) + COALESCE(ps.retail_rev, 0) + COALESCE(ms.mem_rev, 0)) AS total_revenue,

            -- Combined Discounts
            (COALESCE(bk.disc_amt, 0) + COALESCE(ps.disc_amt, 0) + COALESCE(ms.disc_amt, 0)) AS total_discounts,

            -- Combined Refunds
            (COALESCE(bk.refund_amt, 0) + COALESCE(ps.refund_amt, 0) + COALESCE(ms.refund_amt, 0)) AS total_refunds,

            -- Net Revenue
            GREATEST(0, (COALESCE(bk.serv_rev, 0) + COALESCE(ps.retail_rev, 0) + COALESCE(ms.mem_rev, 0))
                        - (COALESCE(bk.refund_amt, 0) + COALESCE(ps.refund_amt, 0) + COALESCE(ms.refund_amt, 0))
                        - (COALESCE(bk.disc_amt, 0) + COALESCE(ps.disc_amt, 0) + COALESCE(ms.disc_amt, 0))) AS net_revenue
        FROM app.staff s

        -- Bookings aggregate
        LEFT JOIN (
            SELECT
                staff_elem::uuid AS staff_id,
                COUNT(*) FILTER (WHERE LOWER(TRIM(b.booking_status)) = 'completed' AND LOWER(TRIM(b.payment_status)) = 'paid') AS completed_cnt,
                COALESCE(SUM(b.final_amount) FILTER (WHERE LOWER(TRIM(b.booking_status)) = 'completed' AND LOWER(TRIM(b.payment_status)) = 'paid'), 0) AS serv_rev,
                COALESCE(SUM(b.discount_amount) FILTER (WHERE LOWER(TRIM(b.booking_status)) = 'completed' AND LOWER(TRIM(b.payment_status)) = 'paid'), 0) AS disc_amt,
                COALESCE(SUM(ABS(b.final_amount)) FILTER (WHERE LOWER(TRIM(b.payment_status)) = 'refunded'), 0) AS refund_amt
            FROM app.bookings_for_business_transaction b,
                 LATERAL unnest(string_to_array(replace(b.staff_id, ' ', ''), ',')) AS staff_elem
            WHERE b.company_id = p_company_id
              AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
              AND b.booking_date BETWEEN v_start_date AND v_end_date
              AND staff_elem ~ '^[0-9a-fA-F-]{36}$'
            GROUP BY staff_elem::uuid
        ) bk ON bk.staff_id = s.staff_id

        -- Retail POS aggregate
        LEFT JOIN (
            SELECT
                sale.staff_id,
                COALESCE(SUM(sale.total_quantity) FILTER (WHERE LOWER(TRIM(sale.payment_status)) = 'paid'), 0) AS retail_units,
                COALESCE(SUM(sale.final_amount) FILTER (WHERE LOWER(TRIM(sale.payment_status)) = 'paid'), 0)   AS retail_rev,
                COALESCE(SUM(sale.discount_amount) FILTER (WHERE LOWER(TRIM(sale.payment_status)) = 'paid'), 0) AS disc_amt,
                COALESCE(SUM(ABS(sale.final_amount)) FILTER (WHERE LOWER(TRIM(sale.payment_status)) = 'refunded'), 0) AS refund_amt
            FROM app.sales_for_business_transactions sale
            WHERE sale.company_id = p_company_id
              AND (p_branch_id IS NULL OR sale.branch_id = p_branch_id)
              AND sale.created_at::date BETWEEN v_start_date AND v_end_date
              AND sale.staff_id IS NOT NULL
            GROUP BY sale.staff_id
        ) ps ON ps.staff_id = s.staff_id

        -- Membership aggregate
        LEFT JOIN (
            SELECT
                mp.assigned_by_user_id AS staff_id,
                COUNT(*) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'paid') AS mem_cnt,
                COALESCE(SUM(mp.final_amount) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'paid'), 0) AS mem_rev,
                COALESCE(SUM(mp.discount_amount) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'paid'), 0) AS disc_amt,
                COALESCE(SUM(COALESCE(mp.refund_amount, ABS(mp.final_amount))) FILTER (WHERE LOWER(TRIM(mp.payment_status)) = 'refunded' OR COALESCE(mp.refund_amount, 0) > 0), 0) AS refund_amt
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

    -- =========================================================================
    -- RETURN COMPLETE 3-MODULE PAYLOAD
    -- =========================================================================
    RETURN jsonb_build_object(
        'staff_profile', v_staff_profile,
        'bookings_module', jsonb_build_object(
            'case_1_completed', jsonb_build_object(
                'completed_bookings_count',   v_completed_bookings_count,
                'completed_bookings_revenue', v_completed_bookings_revenue
            ),
            'case_2_cancelled', jsonb_build_object(
                'cancelled_bookings_count',          v_cancelled_bookings_count,
                'cancelled_bookings_missed_revenue', v_cancelled_bookings_missed_rev
            ),
            'case_3_noshow', jsonb_build_object(
                'noshow_bookings_count',          v_noshow_bookings_count,
                'noshow_bookings_missed_revenue', v_noshow_bookings_missed_rev
            ),
            'case_4_refunded', jsonb_build_object(
                'refunded_bookings_count',  v_refunded_bookings_count,
                'refunded_bookings_amount', v_refunded_bookings_amount
            ),
            'case_5_discounts', jsonb_build_object(
                'discounted_bookings_count',        v_discounted_bookings_count,
                'discounted_bookings_total_amount', v_discounted_bookings_total_amount
            ),
            'case_6_gross', jsonb_build_object(
                'gross_total_bookings_count', v_gross_total_bookings_count
            ),
            'net_service_revenue', v_net_service_revenue
        ),
        'pos_module', jsonb_build_object(
            'case_1_gross_sales', jsonb_build_object(
                'gross_products_sold_quantity', v_gross_products_sold_quantity,
                'gross_products_sales_revenue', v_gross_products_sales_revenue
            ),
            'case_2_refunds', jsonb_build_object(
                'refunded_sales_count',        v_refunded_sales_count,
                'total_refunded_sales_amount', v_total_refunded_sales_amount
            ),
            'case_3_discounts', jsonb_build_object(
                'discounted_sales_count',        v_discounted_sales_count,
                'discounted_sales_total_amount', v_discounted_sales_total_amount
            ),
            'case_4_net_revenue', jsonb_build_object(
                'net_products_sales_revenue', v_net_products_sales_revenue
            )
        ),
        'memberships_module', jsonb_build_object(
            'case_1_assigned', jsonb_build_object(
                'memberships_sold_count',   v_memberships_sold_count,
                'memberships_sold_revenue', v_memberships_sold_revenue
            ),
            'case_2_cancelled', jsonb_build_object(
                'cancelled_memberships_count',        v_cancelled_memberships_count,
                'cancelled_memberships_lost_revenue', v_cancelled_memberships_lost_rev
            ),
            'case_3_refunded', jsonb_build_object(
                'refunded_memberships_count',  v_refunded_memberships_count,
                'refunded_memberships_amount', v_refunded_memberships_amount
            ),
            'case_4_discounts', jsonb_build_object(
                'discounted_memberships_count',       v_discounted_memberships_count,
                'discounted_memberships_total_amount', v_discounted_memberships_total_amt
            ),
            'net_membership_revenue', v_net_membership_revenue
        ),
        'totals_across_modules', jsonb_build_object(
            'gross_total_revenue',    v_gross_total_revenue,
            'total_refunds_amount',   v_total_refunds_amount,
            'total_discounts_amount', v_total_discounts_amount,
            'net_total_revenue',      v_net_total_revenue,
            'total_activities_count', v_total_activities_count
        ),
        'ratios', jsonb_build_object(
            'appointment_fulfillment_rate', CASE WHEN v_gross_total_bookings_count > 0
                                                 THEN ROUND((v_completed_bookings_count::numeric / v_gross_total_bookings_count) * 100, 1)::text || '%'
                                                 ELSE '0%' END,
            'retail_multiplier',            CASE WHEN v_completed_bookings_count > 0
                                                 THEN ROUND(v_gross_products_sold_quantity::numeric / v_completed_bookings_count, 2)
                                                 ELSE 0 END,
            'membership_conversion_rate',   CASE WHEN v_completed_bookings_count > 0
                                                 THEN ROUND((v_memberships_sold_count::numeric / v_completed_bookings_count) * 100, 1)::text || '%'
                                                 ELSE '0%' END,
            'avg_service_ticket',           CASE WHEN v_completed_bookings_count > 0
                                                 THEN ROUND(v_completed_bookings_revenue / v_completed_bookings_count)
                                                 ELSE 0 END,
            'discount_margin_erosion_pct',  CASE WHEN v_gross_total_revenue > 0
                                                 THEN ROUND((v_total_discounts_amount / v_gross_total_revenue) * 100, 1)::text || '%'
                                                 ELSE '0%' END
        ),
        'staff_leaderboard', v_staff_leaderboard
    );
END;
$$;

-- =============================================================================
-- 2. Tier 2: Zero-Downtime Public Schema Wrapper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_staff_revenue_stats_across_three_modules(
    p_company_id  uuid,
    p_staff_id    uuid DEFAULT NULL::uuid,
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
    RETURN app.get_staff_revenue_stats_across_three_modules(
        p_company_id,
        p_staff_id,
        p_branch_id,
        p_start_date,
        p_end_date
    );
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.get_staff_revenue_stats_across_three_modules(uuid, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_revenue_stats_across_three_modules(uuid, uuid, uuid, date, date) TO authenticated, service_role;
