-- =============================================================================
-- Function: public.get_financial_report
-- Master RPC for Salon Financial Reports Suite
-- Serves all 7 Financial Sub-Reports in one single consolidated JSONB payload:
--   1. fin_overview     - Executive P&L, gross inflow, net profit & operating margin
--   2. fin_revenue      - Multi-stream revenue (Bookings, Retail POS, Memberships)
--   3. fin_payments     - Settlement reconciliation (Cash drawer, UPI, Cards, Digital)
--   4. fin_expenses     - Operating expenditures, category distribution & ratios
--   5. fin_discounts    - Revenue erosion (Offers, Coupons, Membership perks)
--   6. fin_refunds      - Outgoing refunds across bookings, product returns & cancellations
--   7. fin_pending_dues - Open balances, aging receivables & collection ledger
--
-- Underlying Core Tables:
--   - public.business_transactions
--   - public.bookings_for_business_transaction
--   - public.sales_for_business_transactions
--   - public.membership_purchases
--   - public.expenses
--   - public.discount_usages
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_report(
    p_company_id  uuid,
    p_branch_id   uuid  DEFAULT NULL,
    p_start_date  date  DEFAULT NULL,
    p_end_date    date  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Standardized Date Bounds
    v_start_date            date;
    v_end_date              date;

    -- Shared Global Totals
    v_total_bookings_rev    numeric := 0;
    v_total_retail_rev      numeric := 0;
    v_total_membership_rev  numeric := 0;
    v_gross_revenue         numeric := 0;

    v_total_expenses        numeric := 0;
    v_total_refunds         numeric := 0;
    v_total_outflow         numeric := 0;
    v_net_profit            numeric := 0;
    v_operating_margin_pct  numeric := 0;

    v_total_discounts_net   numeric := 0;
    v_total_collected_paid  numeric := 0;
    v_cash_in_drawer        numeric := 0;
    v_upi_collected         numeric := 0;
    v_card_collected        numeric := 0;
    v_other_collected       numeric := 0;

    -- Pending Dues Global Pre-computations
    v_total_pending_dues    numeric := 0;
    v_pending_count         integer := 0;
    v_avg_due_per_client    numeric := 0;
    v_aged_dues_over_15d    numeric := 0;

    -- Sub-Report JSON Containers
    v_overview_json         jsonb;
    v_revenue_json          jsonb;
    v_payments_json         jsonb;
    v_expenses_json         jsonb;
    v_discounts_json        jsonb;
    v_refunds_json          jsonb;
    v_dues_json             jsonb;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 0. Standardize Date Window (Default: Current Month to Date)
    -- ─────────────────────────────────────────────────────────────────────────
    v_start_date := COALESCE(p_start_date, DATE_TRUNC('month', CURRENT_DATE)::date);
    v_end_date   := COALESCE(p_end_date, CURRENT_DATE);

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Pre-calculate High-Level Inflows & Outflows
    -- ─────────────────────────────────────────────────────────────────────────
    -- A. Service Bookings Revenue (Paid)
    SELECT COALESCE(SUM(COALESCE(b.final_amount, b.total_price, 0)), 0)
    INTO v_total_bookings_rev
    FROM public.bookings_for_business_transaction b
    WHERE b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.booking_date >= v_start_date
      AND b.booking_date <= v_end_date
      AND LOWER(COALESCE(b.payment_status, '')) = 'paid';

    -- B. Retail Product Sales Revenue (Paid)
    SELECT COALESCE(SUM(COALESCE(s.final_amount, s.total_price, 0)), 0)
    INTO v_total_retail_rev
    FROM public.sales_for_business_transactions s
    WHERE s.company_id = p_company_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at::date >= v_start_date
      AND s.created_at::date <= v_end_date
      AND LOWER(COALESCE(s.payment_status, '')) = 'paid';

    -- C. Membership Purchases Revenue (Paid)
    SELECT COALESCE(SUM(COALESCE(m.final_amount, m.price, 0)), 0)
    INTO v_total_membership_rev
    FROM public.membership_purchases m
    WHERE m.company_id = p_company_id
      AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
      AND COALESCE(m.purchase_date, m.created_at::date) >= v_start_date
      AND COALESCE(m.purchase_date, m.created_at::date) <= v_end_date
      AND LOWER(COALESCE(m.payment_status, '')) = 'paid';

    v_gross_revenue := v_total_bookings_rev + v_total_retail_rev + v_total_membership_rev;

    -- D. Operating Expenses
    SELECT COALESCE(SUM(e.amount), 0)
    INTO v_total_expenses
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND e.date >= v_start_date
      AND e.date <= v_end_date
      AND LOWER(COALESCE(e.status, '')) != 'deleted';

    -- E. Refunds (from business_transactions)
    SELECT COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)), 0)
    INTO v_total_refunds
    FROM public.business_transactions bt
    WHERE bt.company_id = p_company_id
      AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
      AND COALESCE(bt.paid_at::date, bt.created_at::date) >= v_start_date
      AND COALESCE(bt.paid_at::date, bt.created_at::date) <= v_end_date
      AND LOWER(COALESCE(bt.status, '')) = 'refunded';

    -- F. Net Discounts (from discount_usages)
    SELECT COALESCE(SUM(GREATEST(COALESCE(du.discount_amount, 0) - COALESCE(du.reversal_amount, 0), 0)), 0)
    INTO v_total_discounts_net
    FROM public.discount_usages du
    WHERE du.company_id = p_company_id
      AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
      AND du.used_at::date >= v_start_date
      AND du.used_at::date <= v_end_date;

    -- G. Total Realized Outflows & Profit
    v_total_outflow := v_total_expenses + v_total_refunds;
    v_net_profit := v_gross_revenue - v_total_outflow;
    IF v_gross_revenue > 0 THEN
        v_operating_margin_pct := ROUND((v_net_profit / v_gross_revenue) * 100);
    ELSE
        v_operating_margin_pct := 0;
    END IF;

    -- H. Payment Methods Breakdown (from business_transactions where status = 'paid')
    -- Using COALESCE(bt.final_amount, bt.amount, 0) ensures POS sales with populated amount are never missed
    SELECT
        COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)), 0),
        COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(TRIM(bt.payment_method)) = 'cash'), 0),
        COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(TRIM(bt.payment_method)) ILIKE '%upi%'), 0),
        COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(TRIM(bt.payment_method)) ILIKE '%card%'), 0),
        COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(TRIM(bt.payment_method)) NOT IN ('cash') AND LOWER(TRIM(bt.payment_method)) NOT ILIKE '%upi%' AND LOWER(TRIM(bt.payment_method)) NOT ILIKE '%card%'), 0)
    INTO
        v_total_collected_paid,
        v_cash_in_drawer,
        v_upi_collected,
        v_card_collected,
        v_other_collected
    FROM public.business_transactions bt
    WHERE bt.company_id = p_company_id
      AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
      AND COALESCE(bt.paid_at::date, bt.created_at::date) >= v_start_date
      AND COALESCE(bt.paid_at::date, bt.created_at::date) <= v_end_date
      AND LOWER(COALESCE(bt.status, '')) = 'paid';

    -- I. Pending Dues (Bookings + POS Product Sales)
    SELECT
        COALESCE(SUM(amt), 0),
        COALESCE(SUM(cnt), 0),
        COALESCE(SUM(aged), 0)
    INTO
        v_total_pending_dues,
        v_pending_count,
        v_aged_dues_over_15d
    FROM (
        SELECT
            SUM(COALESCE(b.final_amount, b.total_price, 0)) AS amt,
            COUNT(*) AS cnt,
            SUM(CASE WHEN b.created_at < (CURRENT_DATE - INTERVAL '15 days') THEN COALESCE(b.final_amount, b.total_price, 0) ELSE 0 END) AS aged
        FROM public.bookings_for_business_transaction b
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND LOWER(COALESCE(b.payment_status, '')) = 'pending'
        UNION ALL
        SELECT
            SUM(COALESCE(s.final_amount, s.total_price, 0)) AS amt,
            COUNT(*) AS cnt,
            SUM(CASE WHEN s.created_at < (CURRENT_DATE - INTERVAL '15 days') THEN COALESCE(s.final_amount, s.total_price, 0) ELSE 0 END) AS aged
        FROM public.sales_for_business_transactions s
        WHERE s.company_id = p_company_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND LOWER(COALESCE(s.payment_status, '')) = 'pending'
    ) dues_calc;

    IF v_pending_count > 0 THEN
        v_avg_due_per_client := ROUND(v_total_pending_dues / v_pending_count);
    ELSE
        v_avg_due_per_client := 0;
    END IF;


    -- =========================================================================
    -- SUB-REPORT 1: FINANCIAL OVERVIEW (P&L Summary)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'gross_revenue',        v_gross_revenue,
            'total_outflow',        v_total_outflow,
            'net_profit',           v_net_profit,
            'operating_margin_pct', v_operating_margin_pct,
            'total_expenses',       v_total_expenses,
            'total_discounts',      v_total_discounts_net,
            'total_refunds',        v_total_refunds
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',        t.day_str,
                    'inflow',      t.inflow,
                    'outflow',     t.outflow
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(bt.status) = 'paid'), 0) AS inflow,
                    COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)) FILTER (WHERE LOWER(bt.status) = 'refunded'), 0) +
                    COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.company_id = p_company_id AND (p_branch_id IS NULL OR e.branch_id = p_branch_id) AND e.date = d.d::date AND LOWER(COALESCE(e.status, '')) != 'deleted'), 0) AS outflow
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
                LEFT JOIN public.business_transactions bt
                  ON bt.company_id = p_company_id
                 AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                 AND COALESCE(bt.paid_at::date, bt.created_at::date) = d.d::date
                GROUP BY d.d
            ) t
        ),
        'outflow_distribution', jsonb_build_object(
            'labels', jsonb_build_array('Operating Expenses', 'Discounts Given', 'Customer Refunds'),
            'values', jsonb_build_array(v_total_expenses, v_total_discounts_net, v_total_refunds)
        ),
        'ledger', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',           TO_CHAR(d.d, 'YYYY-MM-DD'),
                    'bookings_rev',   t.b_rev,
                    'retail_rev',     t.p_rev,
                    'membership_rev', t.m_rev,
                    'gross',          t.b_rev + t.p_rev + t.m_rev,
                    'discounts',      t.disc,
                    'expenses',       t.exp,
                    'refunds',        t.ref,
                    'net',            (t.b_rev + t.p_rev + t.m_rev) - (t.exp + t.ref),
                    'margin',         CASE WHEN (t.b_rev + t.p_rev + t.m_rev) > 0
                                           THEN ROUND((((t.b_rev + t.p_rev + t.m_rev) - (t.exp + t.ref)) / (t.b_rev + t.p_rev + t.m_rev)) * 100)
                                           ELSE 0 END
                ) ORDER BY d.d DESC
            ), '[]'::jsonb)
            FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
            CROSS JOIN LATERAL (
                SELECT
                    COALESCE((SELECT SUM(COALESCE(b.final_amount, b.total_price, 0)) FROM public.bookings_for_business_transaction b WHERE b.company_id = p_company_id AND (p_branch_id IS NULL OR b.branch_id = p_branch_id) AND b.booking_date = d.d::date AND LOWER(COALESCE(b.payment_status,'')) = 'paid'), 0) AS b_rev,
                    COALESCE((SELECT SUM(COALESCE(s.final_amount, s.total_price, 0)) FROM public.sales_for_business_transactions s WHERE s.company_id = p_company_id AND (p_branch_id IS NULL OR s.branch_id = p_branch_id) AND s.created_at::date = d.d::date AND LOWER(COALESCE(s.payment_status,'')) = 'paid'), 0) AS p_rev,
                    COALESCE((SELECT SUM(COALESCE(m.final_amount, m.price, 0)) FROM public.membership_purchases m WHERE m.company_id = p_company_id AND (p_branch_id IS NULL OR m.branch_id = p_branch_id) AND COALESCE(m.purchase_date, m.created_at::date) = d.d::date AND LOWER(COALESCE(m.payment_status,'')) = 'paid'), 0) AS m_rev,
                    COALESCE((SELECT SUM(GREATEST(COALESCE(du.discount_amount,0) - COALESCE(du.reversal_amount,0),0)) FROM public.discount_usages du WHERE du.company_id = p_company_id AND (p_branch_id IS NULL OR du.branch_id = p_branch_id) AND du.used_at::date = d.d::date), 0) AS disc,
                    COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.company_id = p_company_id AND (p_branch_id IS NULL OR e.branch_id = p_branch_id) AND e.date = d.d::date AND LOWER(COALESCE(e.status,'')) != 'deleted'), 0) AS exp,
                    COALESCE((SELECT SUM(COALESCE(bt.final_amount, bt.amount, 0)) FROM public.business_transactions bt WHERE bt.company_id = p_company_id AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id) AND COALESCE(bt.paid_at::date, bt.created_at::date) = d.d::date AND LOWER(COALESCE(bt.status,'')) = 'refunded'), 0) AS ref
            ) t
            WHERE (t.b_rev + t.p_rev + t.m_rev + t.exp + t.ref + t.disc) > 0
        )
    ) INTO v_overview_json;


    -- =========================================================================
    -- SUB-REPORT 2: REVENUE STREAMS (Multi-Channel Inflows)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_revenue',      v_gross_revenue,
            'service_revenue',    v_total_bookings_rev,
            'retail_revenue',     v_total_retail_rev,
            'membership_revenue', v_total_membership_rev,
            'service_pct',        CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_bookings_rev / v_gross_revenue) * 100) ELSE 0 END,
            'retail_pct',         CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_retail_rev / v_gross_revenue) * 100) ELSE 0 END,
            'membership_pct',     CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_membership_rev / v_gross_revenue) * 100) ELSE 0 END
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',           t.day_str,
                    'service_rev',    t.b_rev,
                    'retail_rev',     t.p_rev,
                    'membership_rev', t.m_rev,
                    'total',          t.b_rev + t.p_rev + t.m_rev
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE((SELECT SUM(COALESCE(b.final_amount, b.total_price, 0)) FROM public.bookings_for_business_transaction b WHERE b.company_id = p_company_id AND (p_branch_id IS NULL OR b.branch_id = p_branch_id) AND b.booking_date = d.d::date AND LOWER(COALESCE(b.payment_status,'')) = 'paid'), 0) AS b_rev,
                    COALESCE((SELECT SUM(COALESCE(s.final_amount, s.total_price, 0)) FROM public.sales_for_business_transactions s WHERE s.company_id = p_company_id AND (p_branch_id IS NULL OR s.branch_id = p_branch_id) AND s.created_at::date = d.d::date AND LOWER(COALESCE(s.payment_status,'')) = 'paid'), 0) AS p_rev,
                    COALESCE((SELECT SUM(COALESCE(m.final_amount, m.price, 0)) FROM public.membership_purchases m WHERE m.company_id = p_company_id AND (p_branch_id IS NULL OR m.branch_id = p_branch_id) AND COALESCE(m.purchase_date, m.created_at::date) = d.d::date AND LOWER(COALESCE(m.payment_status,'')) = 'paid'), 0) AS m_rev
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
            ) t
        ),
        'distribution', jsonb_build_object(
            'labels', jsonb_build_array('Service Bookings', 'Retail Products', 'Membership Plans'),
            'values', jsonb_build_array(v_total_bookings_rev, v_total_retail_rev, v_total_membership_rev)
        ),
        'ledgers', jsonb_build_object(
            'services', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'ref_code',       COALESCE(SUBSTRING(b.booking_id::text, 1, 8), 'BK'),
                        'ref_id',         b.booking_id,
                        'date',           TO_CHAR(COALESCE(b.created_at, b.booking_date::timestamp), 'DD Mon, HH12:MI AM'),
                        'stream_type',    'Service',
                        'customer_name',  COALESCE(b.customer_name, 'Guest Customer'),
                        'customer_phone', COALESCE(b.customer_phone, '—'),
                        'staff_name',     COALESCE(b.staff_name, 'Unassigned'),
                        'gross',          COALESCE(b.total_price, 0),
                        'discount',       COALESCE(b.discount_amount, 0),
                        'final_paid',     COALESCE(b.final_amount, b.total_price, 0),
                        'status',         COALESCE(b.payment_status, 'paid')
                    ) ORDER BY b.created_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.bookings_for_business_transaction b
                    WHERE b.company_id = p_company_id
                      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                      AND b.booking_date BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(b.payment_status, '')) = 'paid'
                    ORDER BY b.created_at DESC
                    LIMIT 200
                ) b
            ),
            'products', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'ref_code',       COALESCE(SUBSTRING(s.sale_id::text, 1, 8), 'POS'),
                        'ref_id',         s.sale_id,
                        'date',           TO_CHAR(s.created_at, 'DD Mon, HH12:MI AM'),
                        'stream_type',    'Product',
                        'customer_name',  COALESCE(s.customer_name, 'Walk-in Client'),
                        'customer_phone', COALESCE(s.customer_phone, '—'),
                        'staff_name',     COALESCE(s.staff_name, 'Store Staff'),
                        'gross',          COALESCE(s.total_price, 0),
                        'discount',       COALESCE(s.discount_amount, 0),
                        'final_paid',     COALESCE(s.final_amount, s.total_price, 0),
                        'status',         COALESCE(s.payment_status, 'paid')
                    ) ORDER BY s.created_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.sales_for_business_transactions s
                    WHERE s.company_id = p_company_id
                      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                      AND s.created_at::date BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(s.payment_status, '')) = 'paid'
                    ORDER BY s.created_at DESC
                    LIMIT 200
                ) s
            ),
            'memberships', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'ref_code',       COALESCE(SUBSTRING(m.purchase_id::text, 1, 8), 'MEM'),
                        'ref_id',         m.purchase_id,
                        'date',           TO_CHAR(COALESCE(m.created_at, m.purchase_date::timestamp), 'DD Mon, HH12:MI AM'),
                        'stream_type',    'Membership',
                        'customer_name',  COALESCE(m.customer_name, 'Member'),
                        'customer_phone', '—',
                        'staff_name',     COALESCE(m.assigned_by_user_name, 'Desk'),
                        'gross',          COALESCE(m.price, 0),
                        'discount',       COALESCE(m.discount_amount, 0),
                        'final_paid',     COALESCE(m.final_amount, m.price, 0),
                        'status',         COALESCE(m.payment_status, 'paid')
                    ) ORDER BY m.created_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.membership_purchases m
                    WHERE m.company_id = p_company_id
                      AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
                      AND COALESCE(m.purchase_date, m.created_at::date) BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(m.payment_status, '')) = 'paid'
                    ORDER BY m.created_at DESC
                    LIMIT 200
                ) m
            )
        )
    ) INTO v_revenue_json;


    -- =========================================================================
    -- SUB-REPORT 3: PAYMENTS & TENDER MODES
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_collected', v_total_collected_paid,
            'cash_in_drawer',  v_cash_in_drawer,
            'upi_amount',      v_upi_collected,
            'card_amount',     v_card_collected,
            'other_amount',    v_other_collected,
            'payment_count',   (SELECT COUNT(*) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'paid')
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',   t.day_str,
                    'amount', t.amount
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)), 0) AS amount
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
                LEFT JOIN public.business_transactions bt
                  ON bt.company_id = p_company_id
                 AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                 AND COALESCE(bt.paid_at::date, bt.created_at::date) = d.d::date
                 AND LOWER(COALESCE(bt.status, '')) = 'paid'
                GROUP BY d.d
            ) t
        ),
        'distribution', jsonb_build_object(
            'labels', jsonb_build_array('Cash in Drawer', 'UPI / QR Codes', 'Cards & POS', 'Others / Bank'),
            'values', jsonb_build_array(v_cash_in_drawer, v_upi_collected, v_card_collected, v_other_collected)
        ),
        'ledgers', jsonb_build_object(
            'all', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'payment_id', SUBSTRING(bt.payment_id::text, 1, 8),
                        'date',       TO_CHAR(COALESCE(bt.paid_at, bt.created_at), 'DD Mon, HH12:MI AM'),
                        'order_ref',  '#' || SUBSTRING(COALESCE(bt.reference_id::text, '00000000'), 1, 8),
                        'stream',     INITCAP(COALESCE(bt.reference_type, 'Service')),
                        'method',     UPPER(COALESCE(bt.payment_method, 'Cash')),
                        'gross',      COALESCE(bt.amount, 0),
                        'discount',   COALESCE(bt.discount_amount, 0),
                        'settled',    COALESCE(bt.final_amount, bt.amount, 0),
                        'notes',      COALESCE(bt.notes, 'Settled Verified')
                    ) ORDER BY bt.created_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.business_transactions bt
                    WHERE bt.company_id = p_company_id
                      AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                      AND COALESCE(bt.paid_at::date, bt.created_at::date) BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(bt.status, '')) = 'paid'
                    ORDER BY COALESCE(bt.paid_at, bt.created_at) DESC
                    LIMIT 250
                ) bt
            )
        )
    ) INTO v_payments_json;


    -- =========================================================================
    -- SUB-REPORT 4: OPERATING EXPENSES
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_expenses',     v_total_expenses,
            'expense_count',      (SELECT COUNT(*) FROM public.expenses WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND date BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) != 'deleted'),
            'avg_expense',        (SELECT COALESCE(ROUND(AVG(amount)), 0) FROM public.expenses WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND date BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) != 'deleted'),
            'expense_ratio_pct',  CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_expenses / v_gross_revenue) * 100) ELSE 0 END,
            'top_category',       COALESCE((SELECT category FROM public.expenses WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND date BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) != 'deleted' GROUP BY category ORDER BY SUM(amount) DESC LIMIT 1), 'General Supplies')
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',   t.day_str,
                    'amount', t.amount
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE(SUM(e.amount), 0) AS amount
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
                LEFT JOIN public.expenses e
                  ON e.company_id = p_company_id
                 AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
                 AND e.date = d.d::date
                 AND LOWER(COALESCE(e.status, '')) != 'deleted'
                GROUP BY d.d
            ) t
        ),
        'distribution', (
            SELECT COALESCE(jsonb_build_object(
                'labels', jsonb_agg(cat.category),
                'values', jsonb_agg(cat.total_amt)
            ), '{"labels":[], "values":[]}'::jsonb)
            FROM (
                SELECT
                    COALESCE(NULLIF(TRIM(category), ''), 'Miscellaneous') AS category,
                    SUM(amount) AS total_amt
                FROM public.expenses
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND date BETWEEN v_start_date AND v_end_date
                  AND LOWER(COALESCE(status, '')) != 'deleted'
                GROUP BY 1
                ORDER BY total_amt DESC
                LIMIT 6
            ) cat
        ),
        'ledgers', jsonb_build_object(
            'all', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'date',        TO_CHAR(e.date, 'YYYY-MM-DD'),
                        'expense_id',  SUBSTRING(e.expense_id::text, 1, 8),
                        'category',    COALESCE(e.category, 'General'),
                        'recipient',   COALESCE(e.notes, 'Vendor / Store'),
                        'amount',      COALESCE(e.amount, 0),
                        'logged_by',   COALESCE(e.staff_name, 'Staff'),
                        'notes',       COALESCE(e.notes, '—'),
                        'status',      COALESCE(e.status, 'completed')
                    ) ORDER BY e.date DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.expenses e
                    WHERE e.company_id = p_company_id
                      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
                      AND e.date BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(e.status, '')) != 'deleted'
                    ORDER BY e.date DESC
                    LIMIT 200
                ) e
            )
        )
    ) INTO v_expenses_json;


    -- =========================================================================
    -- SUB-REPORT 5: DISCOUNTS & DEDUCTIONS (Revenue Leaks)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_net_discounts',  v_total_discounts_net,
            'erosion_rate_pct',     CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_discounts_net / v_gross_revenue) * 100) ELSE 0 END,
            'offer_discounts',      COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'offer'), 0),
            'coupon_discounts',     COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'coupon'), 0),
            'membership_discounts', COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'membership'), 0)
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',   t.day_str,
                    'amount', t.amount
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE(SUM(GREATEST(du.discount_amount - du.reversal_amount, 0)), 0) AS amount
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
                LEFT JOIN public.discount_usages du
                  ON du.company_id = p_company_id
                 AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
                 AND du.used_at::date = d.d::date
                GROUP BY d.d
            ) t
        ),
        'distribution', jsonb_build_object(
            'labels', jsonb_build_array('Special Offers', 'Coupon Codes', 'Membership Perks'),
            'values', jsonb_build_array(
                COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'offer'), 0),
                COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'coupon'), 0),
                COALESCE((SELECT SUM(GREATEST(discount_amount - reversal_amount, 0)) FROM public.discount_usages WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND used_at::date BETWEEN v_start_date AND v_end_date AND LOWER(discount_type) = 'membership'), 0)
            )
        ),
        'ledgers', jsonb_build_object(
            'all', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'date',         TO_CHAR(du.used_at, 'DD Mon, HH12:MI AM'),
                        'ref_id',       '#' || SUBSTRING(COALESCE(du.reference_id::text, '00000000'), 1, 8),
                        'type',         COALESCE(du.discount_type, 'Discount'),
                        'name',         COALESCE(du.discount_name, 'Promotion'),
                        'customer',     'Customer',
                        'applied_on',   INITCAP(COALESCE(du.reference_type, 'Service')),
                        'gross',        COALESCE(du.discount_amount, 0),
                        'reversal',     COALESCE(du.reversal_amount, 0),
                        'net',          GREATEST(COALESCE(du.discount_amount, 0) - COALESCE(du.reversal_amount, 0), 0),
                        'staff',        COALESCE(du.staff_name, 'Staff'),
                        'status',       COALESCE(du.status, 'applied')
                    ) ORDER BY du.used_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.discount_usages du
                    WHERE du.company_id = p_company_id
                      AND (p_branch_id IS NULL OR du.branch_id = p_branch_id)
                      AND du.used_at::date BETWEEN v_start_date AND v_end_date
                    ORDER BY du.used_at DESC
                    LIMIT 200
                ) du
            )
        )
    ) INTO v_discounts_json;


    -- =========================================================================
    -- SUB-REPORT 6: REFUNDS & RETURNS (Outgoing Leaks)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_refunded',      v_total_refunds,
            'refund_count',        (SELECT COUNT(*) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded'),
            'refund_rate_pct',     CASE WHEN v_gross_revenue > 0 THEN ROUND((v_total_refunds / v_gross_revenue) * 100) ELSE 0 END,
            'avg_refund',          (SELECT COALESCE(ROUND(AVG(COALESCE(final_amount, amount, 0))), 0) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded'),
            'booking_refunds',     COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'booking'), 0),
            'product_refunds',     COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'product'), 0),
            'membership_refunds',  COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'membership'), 0)
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',   t.day_str,
                    'amount', t.amount
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE(SUM(COALESCE(bt.final_amount, bt.amount, 0)), 0) AS amount
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
                LEFT JOIN public.business_transactions bt
                  ON bt.company_id = p_company_id
                 AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                 AND COALESCE(bt.paid_at::date, bt.created_at::date) = d.d::date
                 AND LOWER(COALESCE(bt.status, '')) = 'refunded'
                GROUP BY d.d
            ) t
        ),
        'distribution', jsonb_build_object(
            'labels', jsonb_build_array('Booking Cancellations', 'POS Product Returns', 'Membership Cancellations'),
            'values', jsonb_build_array(
                COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'booking'), 0),
                COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'product'), 0),
                COALESCE((SELECT SUM(COALESCE(final_amount, amount, 0)) FROM public.business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND COALESCE(paid_at::date, created_at::date) BETWEEN v_start_date AND v_end_date AND LOWER(COALESCE(status,'')) = 'refunded' AND reference_type = 'membership'), 0)
            )
        ),
        'ledgers', jsonb_build_object(
            'all', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'refund_id',       SUBSTRING(bt.payment_id::text, 1, 8),
                        'date',            TO_CHAR(COALESCE(bt.paid_at, bt.created_at), 'DD Mon, YYYY'),
                        'order_ref',       '#' || SUBSTRING(COALESCE(bt.reference_id::text, '00000000'), 1, 8),
                        'stream',          INITCAP(COALESCE(bt.reference_type, 'Service')),
                        'customer',        COALESCE(
                                               (SELECT b.customer_name FROM public.bookings_for_business_transaction b WHERE b.booking_id = bt.reference_id AND bt.reference_type = 'booking' LIMIT 1),
                                               (SELECT s.customer_name FROM public.sales_for_business_transactions s WHERE s.sale_id = bt.reference_id AND bt.reference_type = 'product' LIMIT 1),
                                               'Customer'
                                           ),
                        'phone',           COALESCE(
                                               (SELECT b.customer_phone FROM public.bookings_for_business_transaction b WHERE b.booking_id = bt.reference_id AND bt.reference_type = 'booking' LIMIT 1),
                                               (SELECT s.customer_phone FROM public.sales_for_business_transactions s WHERE s.sale_id = bt.reference_id AND bt.reference_type = 'product' LIMIT 1),
                                               '—'
                                           ),
                        'original_price',  COALESCE(bt.amount, 0),
                        'refund_amount',   COALESCE(bt.final_amount, bt.amount, 0),
                        'method',          COALESCE(bt.payment_method, 'Original Mode'),
                        'reason',          COALESCE(bt.notes, 'Cancelled / Refunded')
                    ) ORDER BY bt.created_at DESC
                ), '[]'::jsonb)
                FROM (
                    SELECT * FROM public.business_transactions bt
                    WHERE bt.company_id = p_company_id
                      AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                      AND COALESCE(bt.paid_at::date, bt.created_at::date) BETWEEN v_start_date AND v_end_date
                      AND LOWER(COALESCE(bt.status, '')) = 'refunded'
                    ORDER BY COALESCE(bt.paid_at, bt.created_at) DESC
                    LIMIT 200
                ) bt
            )
        )
    ) INTO v_refunds_json;


    -- =========================================================================
    -- SUB-REPORT 7: PENDING DUES & RECEIVABLES
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_pending_dues',  v_total_pending_dues,
            'pending_count',       v_pending_count,
            'avg_due_per_client',  v_avg_due_per_client,
            'aged_dues_over_15d',  v_aged_dues_over_15d
        ),
        'timeline', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'date',   t.day_str,
                    'amount', t.amount
                ) ORDER BY t.day_date
            ), '[]'::jsonb)
            FROM (
                SELECT
                    d.d::date AS day_date,
                    TO_CHAR(d.d, 'Mon DD') AS day_str,
                    COALESCE((
                        SELECT SUM(COALESCE(b.final_amount, b.total_price, 0))
                        FROM public.bookings_for_business_transaction b
                        WHERE b.company_id = p_company_id
                          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                          AND b.booking_date = d.d::date
                          AND LOWER(COALESCE(b.payment_status, '')) = 'pending'
                    ), 0) +
                    COALESCE((
                        SELECT SUM(COALESCE(s.final_amount, s.total_price, 0))
                        FROM public.sales_for_business_transactions s
                        WHERE s.company_id = p_company_id
                          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                          AND s.created_at::date = d.d::date
                          AND LOWER(COALESCE(s.payment_status, '')) = 'pending'
                    ), 0) AS amount
                FROM generate_series(v_start_date::timestamp, v_end_date::timestamp, '1 day'::interval) d(d)
            ) t
        ),
        'distribution', jsonb_build_object(
            'labels', jsonb_build_array('Service Appointments', 'Retail POS Sales', 'Membership Dues'),
            'values', jsonb_build_array(
                COALESCE((SELECT SUM(COALESCE(final_amount, total_price, 0)) FROM public.bookings_for_business_transaction WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND LOWER(COALESCE(payment_status,'')) = 'pending'), 0),
                COALESCE((SELECT SUM(COALESCE(final_amount, total_price, 0)) FROM public.sales_for_business_transactions WHERE company_id = p_company_id AND (p_branch_id IS NULL OR branch_id = p_branch_id) AND LOWER(COALESCE(payment_status,'')) = 'pending'), 0),
                0
            )
        ),
        'ledgers', jsonb_build_object(
            'all', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'invoice_ref', due_items.invoice_ref,
                        'date',        due_items.date_str,
                        'stream',      due_items.stream,
                        'customer',    due_items.customer,
                        'phone',       due_items.phone,
                        'total',       due_items.total,
                        'paid',        0,
                        'due',         due_items.due,
                        'aging',       due_items.aging,
                        'status',      'pending'
                    )
                ), '[]'::jsonb)
                FROM (
                    -- Pending Service Bookings
                    SELECT
                        '#' || SUBSTRING(b.booking_id::text, 1, 8) AS invoice_ref,
                        TO_CHAR(COALESCE(b.booking_date::timestamp, b.created_at), 'DD Mon, YYYY') AS date_str,
                        'Service' AS stream,
                        COALESCE(b.customer_name, 'Client') AS customer,
                        COALESCE(b.customer_phone, '—') AS phone,
                        COALESCE(b.total_price, 0) AS total,
                        COALESCE(b.final_amount, b.total_price, 0) AS due,
                        (CURRENT_DATE - COALESCE(b.booking_date, b.created_at::date)) || ' Days' AS aging,
                        COALESCE(b.booking_date::timestamp, b.created_at) AS sort_date
                    FROM public.bookings_for_business_transaction b
                    WHERE b.company_id = p_company_id
                      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                      AND LOWER(COALESCE(b.payment_status, '')) = 'pending'

                    UNION ALL

                    -- Pending POS Product Sales
                    SELECT
                        '#' || SUBSTRING(s.sale_id::text, 1, 8) AS invoice_ref,
                        TO_CHAR(s.created_at, 'DD Mon, YYYY') AS date_str,
                        'Product' AS stream,
                        COALESCE(s.customer_name, 'Client') AS customer,
                        COALESCE(s.customer_phone, '—') AS phone,
                        COALESCE(s.total_price, 0) AS total,
                        COALESCE(s.final_amount, s.total_price, 0) AS due,
                        (CURRENT_DATE - s.created_at::date) || ' Days' AS aging,
                        s.created_at AS sort_date
                    FROM public.sales_for_business_transactions s
                    WHERE s.company_id = p_company_id
                      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                      AND LOWER(COALESCE(s.payment_status, '')) = 'pending'

                    ORDER BY sort_date DESC
                    LIMIT 200
                ) due_items
            )
        )
    ) INTO v_dues_json;


    -- =========================================================================
    -- RETURN CONSOLIDATED MASTER FINANCIAL REPORT
    -- =========================================================================
    RETURN jsonb_build_object(
        'overview',         v_overview_json,
        'revenue',          v_revenue_json,
        'payments',         v_payments_json,
        'expenses',         v_expenses_json,
        'discounts',        v_discounts_json,
        'refunds',          v_refunds_json,
        'dues',             v_dues_json,
        -- Dual-key naming for direct type mapping compatibility:
        'fin_overview',     v_overview_json,
        'fin_revenue',      v_revenue_json,
        'fin_payments',     v_payments_json,
        'fin_expenses',     v_expenses_json,
        'fin_discounts',    v_discounts_json,
        'fin_refunds',      v_refunds_json,
        'fin_pending_dues', v_dues_json
    );
END;
$function$;
