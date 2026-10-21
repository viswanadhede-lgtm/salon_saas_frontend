-- =============================================================================
-- Function: public.get_discount_report
-- Master RPC for Discount Usages Reports
-- Category: Discount Usages (Coupons, Offers, Memberships)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_discount_report(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_end_date   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Standardized Date Bounds
    v_start_date date;
    v_end_date   date;

    -- KPI Aggregates
    v_total_amount      numeric := 0;
    v_total_count       bigint  := 0;
    v_coupon_amount     numeric := 0;
    v_coupon_count      bigint  := 0;
    v_coupon_pct        numeric := 0;
    v_offer_amount      numeric := 0;
    v_offer_count       bigint  := 0;
    v_offer_pct         numeric := 0;
    v_membership_amount numeric := 0;
    v_membership_count  bigint  := 0;
    v_membership_pct    numeric := 0;

    -- Donut Share Percentages (by count)
    v_donut_coupon_pct     numeric := 0;
    v_donut_offer_pct      numeric := 0;
    v_donut_membership_pct numeric := 0;

    -- JSON Outputs
    v_timeline jsonb := '{}'::jsonb;
    v_ledger   jsonb := '[]'::jsonb;
    v_result   jsonb;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 0. Standardize Date Window (Default to trailing 30 days if not supplied)
    -- ─────────────────────────────────────────────────────────────────────────
    v_start_date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '30 days')::date);
    v_end_date   := COALESCE(p_end_date, CURRENT_DATE);

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Calculate KPI Metrics & Distribution Aggregates
    -- (Net Discount Amount = discount_amount - reversal_amount)
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT
        COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)), 0),
        COUNT(*),
        COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'coupon'), 0),
        COUNT(*) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'coupon'),
        COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'offer'), 0),
        COUNT(*) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'offer'),
        COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'membership'), 0),
        COUNT(*) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'membership')
    INTO
        v_total_amount,
        v_total_count,
        v_coupon_amount,
        v_coupon_count,
        v_offer_amount,
        v_offer_count,
        v_membership_amount,
        v_membership_count
    FROM public.discount_usages du
    WHERE du.company_id = p_company_id
      AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
      AND du.used_at::date >= v_start_date
      AND du.used_at::date <= v_end_date;

    -- Calculate % of Total Discount Value
    IF v_total_amount > 0 THEN
        v_coupon_pct     := ROUND((v_coupon_amount / v_total_amount) * 100);
        v_offer_pct      := ROUND((v_offer_amount / v_total_amount) * 100);
        v_membership_pct := ROUND((v_membership_amount / v_total_amount) * 100);
    ELSE
        v_coupon_pct     := 0;
        v_offer_pct      := 0;
        v_membership_pct := 0;
    END IF;

    -- Calculate % of Total Redemption Count (for Donut slices)
    IF v_total_count > 0 THEN
        v_donut_coupon_pct     := ROUND((v_coupon_count::numeric / v_total_count::numeric) * 100);
        v_donut_offer_pct      := ROUND((v_offer_count::numeric / v_total_count::numeric) * 100);
        v_donut_membership_pct := ROUND((v_membership_count::numeric / v_total_count::numeric) * 100);
    ELSE
        v_donut_coupon_pct     := 0;
        v_donut_offer_pct      := 0;
        v_donut_membership_pct := 0;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Build Timeline (Line Chart: 6-Month Trend for Coupons, Offers, Memberships)
    -- ─────────────────────────────────────────────────────────────────────────
    WITH months_series AS (
        SELECT
            DATE_TRUNC('month', m)::date AS month_start,
            TO_CHAR(m, 'Mon') AS month_label
        FROM GENERATE_SERIES(
            DATE_TRUNC('month', v_end_date - INTERVAL '5 months')::date,
            DATE_TRUNC('month', v_end_date)::date,
            '1 month'::interval
        ) m
    ),
    monthly_discounts AS (
        SELECT
            DATE_TRUNC('month', du.used_at::date)::date AS m_start,
            COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'coupon'), 0) AS coupon_net,
            COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'offer'), 0) AS offer_net,
            COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)) FILTER (WHERE LOWER(TRIM(du.discount_type)) = 'membership'), 0) AS mem_net
        FROM public.discount_usages du
        WHERE du.company_id = p_company_id
          AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
          AND du.used_at::date >= (DATE_TRUNC('month', v_end_date - INTERVAL '5 months')::date)
          AND du.used_at::date <= v_end_date
        GROUP BY 1
    )
    SELECT
        jsonb_build_object(
            'labels',      COALESCE(jsonb_agg(ms.month_label ORDER BY ms.month_start), '[]'::jsonb),
            'coupons',     COALESCE(jsonb_agg(ROUND(COALESCE(md.coupon_net, 0)) ORDER BY ms.month_start), '[]'::jsonb),
            'offers',      COALESCE(jsonb_agg(ROUND(COALESCE(md.offer_net, 0)) ORDER BY ms.month_start), '[]'::jsonb),
            'memberships', COALESCE(jsonb_agg(ROUND(COALESCE(md.mem_net, 0)) ORDER BY ms.month_start), '[]'::jsonb)
        )
    INTO v_timeline
    FROM months_series ms
    LEFT JOIN monthly_discounts md ON md.m_start = ms.month_start;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Build Detailed Records Ledger (4 Tabs in Frontend Table)
    -- Joins with public.customers to fetch customer name and phone
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(d_row), '[]'::jsonb)
    INTO v_ledger
    FROM (
        SELECT
            du.id,
            TO_CHAR(du.used_at, 'YYYY-MM-DD HH24:MI') AS used_at,
            COALESCE(c.customer_name, 'Walk-in Customer') AS customer_name,
            COALESCE(c.customer_phone, '') AS customer_phone,
            COALESCE(du.staff_name, 'Staff') AS staff_name,
            LOWER(TRIM(COALESCE(du.discount_type, 'discount'))) AS discount_type,
            COALESCE(du.discount_name, 'Standard Discount') AS discount_name,
            INITCAP(COALESCE(du.reference_type, 'Booking')) AS reference_type,
            UPPER(SUBSTRING(COALESCE(du.reference_type, 'BK') FROM 1 FOR 3)) || '-' || SUBSTRING(du.reference_id::text FROM 1 FOR 6) AS reference_code,
            COALESCE(du.discount_amount, 0) AS discount_amount,
            COALESCE(du.reversal_amount, 0) AS reversal_amount,
            GREATEST(COALESCE(du.discount_amount, 0) - COALESCE(du.reversal_amount, 0), 0) AS net_amount,
            COALESCE(du.status, 'applied') AS status,
            du.reversal_reason
        FROM public.discount_usages du
        LEFT JOIN public.customers c ON c.customer_id = du.customer_id
        WHERE du.company_id = p_company_id
          AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
          AND du.used_at::date >= v_start_date
          AND du.used_at::date <= v_end_date
        ORDER BY du.used_at DESC
        LIMIT 500
    ) d_row;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Package Master Output Payload
    -- ─────────────────────────────────────────────────────────────────────────
    v_result := jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_discounts_amount', ROUND(v_total_amount, 2),
            'total_discounts_count',  v_total_count,
            'coupon_amount',          ROUND(v_coupon_amount, 2),
            'coupon_count',           v_coupon_count,
            'coupon_pct',             v_coupon_pct,
            'offer_amount',           ROUND(v_offer_amount, 2),
            'offer_count',            v_offer_count,
            'offer_pct',              v_offer_pct,
            'membership_amount',      ROUND(v_membership_amount, 2),
            'membership_count',       v_membership_count,
            'membership_pct',         v_membership_pct
        ),
        'timeline', v_timeline,
        'distribution', jsonb_build_object(
            'total_amount', ROUND(v_total_amount, 2),
            'total_count',  v_total_count,
            'coupons', jsonb_build_object(
                'amount', ROUND(v_coupon_amount, 2),
                'count',  v_coupon_count,
                'pct',    v_donut_coupon_pct
            ),
            'offers', jsonb_build_object(
                'amount', ROUND(v_offer_amount, 2),
                'count',  v_offer_count,
                'pct',    v_donut_offer_pct
            ),
            'memberships', jsonb_build_object(
                'amount', ROUND(v_membership_amount, 2),
                'count',  v_membership_count,
                'pct',    v_donut_membership_pct
            )
        ),
        'ledger', v_ledger
    );

    RETURN v_result;

END;
$function$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_discount_report(uuid, uuid, date, date) TO authenticated, service_role, anon;
