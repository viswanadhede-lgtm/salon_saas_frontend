-- ============================================================
-- RPC: get_product_sales_report  (v2 — fixed 42803 aggregate error)
-- Returns all 7 product sales sub-reports in one JSONB call.
--
-- Fix applied: All ORDER BY + LIMIT inside scalar subqueries
--   that use jsonb_agg are now wrapped in an inner derived
--   table so PostgreSQL does not see a bare ORDER BY inside
--   an aggregate context.
--
-- Tables:
--   S    = public.sales                            (1 row / product / txn)
--   SFBT = public.sales_for_business_transactions  (1 row / txn, consolidated)
--   BT   = public.business_transactions            (financial ledger)
--
-- Paid  rows: payment_status IN ('paid','partial') AND refund_reference_id IS NULL
-- Refund rows: payment_status = 'refunded'
-- Net: Gross − Discounts − Refunds = Net
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_product_sales_report(
    p_company_id  uuid,
    p_branch_id   uuid  DEFAULT NULL,
    p_start_date  date  DEFAULT NULL,
    p_end_date    date  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date            date;
    v_end_date              date;

    -- Shared aggregates (computed once, reused across all 7 sub-reports)
    v_gross_billed          numeric := 0;
    v_total_discounts       numeric := 0;
    v_total_refunds         numeric := 0;
    v_net_revenue           numeric := 0;
    v_gross_qty             bigint  := 0;
    v_returned_qty          bigint  := 0;
    v_net_qty               bigint  := 0;
    v_total_invoices        bigint  := 0;
    v_paid_invoices         bigint  := 0;
    v_refunded_invoices     bigint  := 0;

    -- Sub-report JSONB containers
    v_prod_overview         jsonb;
    v_prod_wise             jsonb;
    v_prod_category         jsonb;
    v_prod_transactions     jsonb;
    v_prod_discounts        jsonb;
    v_prod_returns          jsonb;
    v_prod_payments         jsonb;
BEGIN
    -- ── Date defaults ────────────────────────────────────────────────────
    v_start_date := COALESCE(p_start_date, DATE_TRUNC('month', CURRENT_DATE)::date);
    v_end_date   := COALESCE(p_end_date,   CURRENT_DATE);

    -- ================================================================
    -- SHARED AGGREGATES — SFBT
    -- ================================================================
    SELECT
        COALESCE(SUM(CASE WHEN payment_status IN ('paid','partial') AND refund_reference_id IS NULL THEN total_price     ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_status IN ('paid','partial') AND refund_reference_id IS NULL THEN discount_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_status = 'refunded'                                         THEN final_amount    ELSE 0 END), 0),
        COUNT(DISTINCT CASE WHEN payment_status IN ('paid','partial') AND refund_reference_id IS NULL THEN sale_id END),
        COUNT(DISTINCT CASE WHEN payment_status = 'paid'             AND refund_reference_id IS NULL THEN sale_id END),
        COUNT(DISTINCT CASE WHEN payment_status = 'refunded'                                          THEN sale_id END)
    INTO
        v_gross_billed, v_total_discounts, v_total_refunds,
        v_total_invoices, v_paid_invoices, v_refunded_invoices
    FROM public.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    v_net_revenue := GREATEST(0, v_gross_billed - v_total_discounts - v_total_refunds);

    -- SHARED AGGREGATES — sales (unit quantities)
    SELECT
        COALESCE(SUM(CASE WHEN status = 'paid'     THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN quantity ELSE 0 END), 0)
    INTO v_gross_qty, v_returned_qty
    FROM public.sales
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    v_net_qty := GREATEST(0, v_gross_qty - v_returned_qty);

    -- ================================================================
    -- 1. PROD OVERVIEW
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_sales',       v_gross_billed,
            'net_sales',         v_net_revenue,
            'total_discounts',   v_total_discounts,
            'total_refunds',     v_total_refunds,
            'gross_quantity',    v_gross_qty,
            'quantity_sold',     v_net_qty,
            'quantity_returned', v_returned_qty,
            'unique_products', (
                SELECT COUNT(DISTINCT product_id)
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label     ORDER BY t.sale_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_revenue ORDER BY t.sale_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS sale_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    ROUND(SUM(final_amount), 2) AS daily_revenue
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                GROUP BY created_at::date
            ) t
        ),
        'categories', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(c.cat_name ORDER BY c.net_rev DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(c.net_rev  ORDER BY c.net_rev DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(category_name, 'Uncategorised') AS cat_name,
                    GREATEST(0,
                        SUM(CASE WHEN status = 'paid'     THEN total_amount ELSE 0 END) -
                        SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END)
                    ) AS net_rev
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status IN ('paid','refunded')
                GROUP BY COALESCE(category_name, 'Uncategorised')
            ) c
        ),
        -- ✅ FIX: pre-sort + LIMIT inside inner subquery, aggregate on top
        'sales_transactions', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'sale_id',         t.sale_id,
                    'created_at',      TO_CHAR(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer_name',   COALESCE(t.customer_name, 'Walk-in'),
                    'customer_phone',  COALESCE(t.customer_phone, ''),
                    'staff_name',      COALESCE(t.staff_name, '—'),
                    'product_names',   t.product_names,
                    'category_names',  t.category_names,
                    'total_quantity',  t.total_quantity,
                    'total_price',     t.total_price,
                    'discount_amount', COALESCE(t.discount_amount, 0),
                    'discount_name',   t.discount_name,
                    'final_amount',    t.final_amount,
                    'payment_method',  t.payment_method,
                    'payment_status',  t.payment_status
                )
            ORDER BY t.created_at DESC), '[]'::jsonb)
            FROM (
                SELECT *
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                ORDER BY created_at DESC
                LIMIT 500
            ) t
        )
    ) INTO v_prod_overview;

    -- ================================================================
    -- 2. PROD WISE
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH top_sku AS (
                SELECT product_name, SUM(quantity) AS sold
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
                GROUP BY product_name
                ORDER BY sold DESC
                LIMIT 1
            ),
            refund_total AS (
                SELECT COALESCE(SUM(total_amount), 0) AS val
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'refunded'
            )
            SELECT jsonb_build_object(
                'total_units',     v_net_qty,
                'gross_units',     v_gross_qty,
                'net_revenue',     v_net_revenue,
                'top_sku_name',    COALESCE((SELECT product_name FROM top_sku), '—'),
                'top_sku_units',   COALESCE((SELECT sold FROM top_sku), 0),
                'top_sku_pct',     CASE WHEN v_gross_qty > 0 AND (SELECT sold FROM top_sku) IS NOT NULL
                                      THEN ROUND(((SELECT sold FROM top_sku)::numeric / v_gross_qty) * 100, 1)::text || '%'
                                      ELSE '0%' END,
                'returned_units',  v_returned_qty,
                'refunded_amount', (SELECT val FROM refund_total)
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label   ORDER BY t.sale_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_units ORDER BY t.sale_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS sale_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    SUM(quantity)::bigint AS daily_units
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
                GROUP BY created_at::date
            ) t
        ),
        'distribution', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(d.product_name ORDER BY d.sold DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(d.sold         ORDER BY d.sold DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(product_name, 'Unknown') AS product_name,
                    SUM(quantity) AS sold
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
                GROUP BY COALESCE(product_name, 'Unknown')
                ORDER BY sold DESC
                LIMIT 6
            ) d
        ),
        'rows', (
            WITH paid_items AS (
                SELECT
                    s.product_id,
                    s.product_name,
                    COALESCE(s.category_name, 'Uncategorised') AS category,
                    SUM(s.quantity)     AS sold,
                    SUM(s.total_amount) AS gross,
                    COUNT(*)            AS txns
                FROM public.sales s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'paid'
                GROUP BY s.product_id, s.product_name, COALESCE(s.category_name, 'Uncategorised')
            ),
            refund_items AS (
                SELECT
                    s.product_id,
                    SUM(s.quantity)     AS returned,
                    SUM(s.total_amount) AS refund_amount
                FROM public.sales s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'refunded'
                GROUP BY s.product_id
            ),
            prorated_disc AS (
                SELECT
                    s.product_id,
                    SUM(
                        CASE WHEN sf.total_price > 0
                        THEN ROUND((s.total_amount / sf.total_price) * COALESCE(sf.discount_amount, 0), 2)
                        ELSE 0 END
                    ) AS disc
                FROM public.sales s
                JOIN public.sales_for_business_transactions sf
                  ON sf.sale_id = s.sale_id
                 AND sf.refund_reference_id IS NULL
                 AND sf.payment_status IN ('paid','partial')
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'paid'
                GROUP BY s.product_id
            ),
            combined AS (
                SELECT
                    p.product_id, p.product_name, p.category,
                    p.sold, p.gross, p.txns,
                    COALESCE(r.returned,      0) AS returned,
                    COALESCE(r.refund_amount,  0) AS refund_amount,
                    COALESCE(d.disc,           0) AS disc,
                    GREATEST(0, p.gross - COALESCE(d.disc, 0) - COALESCE(r.refund_amount, 0)) AS net
                FROM paid_items p
                LEFT JOIN refund_items r  ON r.product_id = p.product_id
                LEFT JOIN prorated_disc d ON d.product_id = p.product_id
            ),
            total_net AS (SELECT COALESCE(SUM(net), 0) AS total FROM combined)
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'rank',          ROW_NUMBER() OVER (ORDER BY c.sold DESC),
                    'name',          c.product_name,
                    'category',      c.category,
                    'sold',          c.sold,
                    'returned',      c.returned,
                    'gross',         c.gross,
                    'disc',          c.disc,
                    'refund_amount', c.refund_amount,
                    'net',           c.net,
                    'pct',           CASE WHEN tn.total > 0
                                       THEN ROUND((c.net / tn.total) * 100, 1)::text || '%'
                                       ELSE '0%' END,
                    'txns',          c.txns
                )
            ORDER BY c.sold DESC), '[]'::jsonb)
            FROM combined c, total_net tn
        )
    ) INTO v_prod_wise;

    -- ================================================================
    -- 3. PROD CATEGORY
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH cat_base AS (
                SELECT
                    COALESCE(s.category_name, 'Uncategorised') AS cat_name,
                    SUM(CASE WHEN s.status = 'paid'     THEN s.quantity     ELSE 0 END) AS sold,
                    SUM(CASE WHEN s.status = 'refunded' THEN s.quantity     ELSE 0 END) AS returned,
                    SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END) AS gross,
                    SUM(CASE WHEN s.status = 'refunded' THEN s.total_amount ELSE 0 END) AS refund_val
                FROM public.sales s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status IN ('paid','refunded')
                GROUP BY COALESCE(s.category_name, 'Uncategorised')
            ),
            cat_disc AS (
                SELECT
                    COALESCE(s.category_name, 'Uncategorised') AS cat_name,
                    SUM(
                        CASE WHEN sf.total_price > 0
                        THEN ROUND((s.total_amount / sf.total_price) * COALESCE(sf.discount_amount, 0), 2)
                        ELSE 0 END
                    ) AS disc
                FROM public.sales s
                JOIN public.sales_for_business_transactions sf
                  ON sf.sale_id = s.sale_id
                 AND sf.refund_reference_id IS NULL
                 AND sf.payment_status IN ('paid','partial')
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'paid'
                GROUP BY COALESCE(s.category_name, 'Uncategorised')
            ),
            cat_final AS (
                SELECT
                    b.cat_name, b.sold, b.returned, b.gross, b.refund_val,
                    COALESCE(d.disc, 0) AS disc,
                    GREATEST(0, b.gross - COALESCE(d.disc, 0) - b.refund_val) AS net
                FROM cat_base b
                LEFT JOIN cat_disc d ON d.cat_name = b.cat_name
            ),
            top_cat AS (SELECT cat_name, net FROM cat_final ORDER BY net DESC LIMIT 1),
            totals  AS (SELECT COUNT(*) AS cnt, COALESCE(SUM(net), 0) AS total_net FROM cat_final)
            SELECT jsonb_build_object(
                'total_categories',  (SELECT cnt FROM totals),
                'catalog_pct',       '100% catalog active',
                'top_category',      COALESCE((SELECT cat_name FROM top_cat), '—'),
                'top_category_rev',  COALESCE((SELECT net    FROM top_cat), 0),
                'top_category_pct',  CASE WHEN (SELECT total_net FROM totals) > 0
                                       THEN ROUND(((SELECT net FROM top_cat) / (SELECT total_net FROM totals)) * 100, 1)::text || '%'
                                       ELSE '0%' END,
                'items_sold',        v_net_qty,
                'avg_items_per_cat', CASE WHEN (SELECT cnt FROM totals) > 0
                                       THEN ROUND(v_net_qty::numeric / (SELECT cnt FROM totals), 0)
                                       ELSE 0 END,
                'avg_rev_per_cat',   CASE WHEN (SELECT cnt FROM totals) > 0
                                       THEN ROUND((SELECT total_net FROM totals) / (SELECT cnt FROM totals), 0)
                                       ELSE 0 END
            )
        ),
        'comparison', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(c.cat_name ORDER BY c.net_rev DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(c.net_rev  ORDER BY c.net_rev DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(category_name, 'Uncategorised') AS cat_name,
                    GREATEST(0,
                        SUM(CASE WHEN status = 'paid'     THEN total_amount ELSE 0 END) -
                        SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END)
                    ) AS net_rev
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status IN ('paid','refunded')
                GROUP BY COALESCE(category_name, 'Uncategorised')
            ) c
        ),
        'rows', (
            WITH cat_base AS (
                SELECT
                    COALESCE(s.category_name, 'Uncategorised') AS cat_name,
                    SUM(CASE WHEN s.status = 'paid'     THEN s.quantity     ELSE 0 END) AS units,
                    SUM(CASE WHEN s.status = 'refunded' THEN s.quantity     ELSE 0 END) AS returned,
                    SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END) AS gross,
                    SUM(CASE WHEN s.status = 'refunded' THEN s.total_amount ELSE 0 END) AS refund_val,
                    COUNT(DISTINCT CASE WHEN s.status = 'paid' THEN s.product_id END)   AS skus
                FROM public.sales s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status IN ('paid','refunded')
                GROUP BY COALESCE(s.category_name, 'Uncategorised')
            ),
            cat_disc AS (
                SELECT
                    COALESCE(s.category_name, 'Uncategorised') AS cat_name,
                    SUM(
                        CASE WHEN sf.total_price > 0
                        THEN ROUND((s.total_amount / sf.total_price) * COALESCE(sf.discount_amount, 0), 2)
                        ELSE 0 END
                    ) AS disc
                FROM public.sales s
                JOIN public.sales_for_business_transactions sf
                  ON sf.sale_id = s.sale_id
                 AND sf.refund_reference_id IS NULL
                 AND sf.payment_status IN ('paid','partial')
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'paid'
                GROUP BY COALESCE(s.category_name, 'Uncategorised')
            ),
            top_prod AS (
                SELECT cat_name, product_name FROM (
                    SELECT
                        COALESCE(category_name, 'Uncategorised') AS cat_name,
                        product_name,
                        ROW_NUMBER() OVER (
                            PARTITION BY COALESCE(category_name, 'Uncategorised')
                            ORDER BY SUM(quantity) DESC
                        ) AS rn
                    FROM public.sales
                    WHERE company_id = p_company_id
                      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                      AND created_at::date BETWEEN v_start_date AND v_end_date
                      AND status = 'paid'
                    GROUP BY COALESCE(category_name, 'Uncategorised'), product_name
                ) x WHERE rn = 1
            ),
            total_net AS (
                SELECT COALESCE(SUM(GREATEST(0, b.gross - COALESCE(d.disc, 0) - b.refund_val)), 0) AS total
                FROM cat_base b
                LEFT JOIN cat_disc d ON d.cat_name = b.cat_name
            )
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'name',     b.cat_name,
                    'skus',     b.skus,
                    'units',    b.units,
                    'returned', b.returned,
                    'gross',    b.gross,
                    'disc',     COALESCE(d.disc, 0),
                    'refund',   b.refund_val,
                    'net',      GREATEST(0, b.gross - COALESCE(d.disc, 0) - b.refund_val),
                    'pct',      CASE WHEN tn.total > 0
                                  THEN ROUND((GREATEST(0, b.gross - COALESCE(d.disc, 0) - b.refund_val) / tn.total) * 100, 1)::text || '%'
                                  ELSE '0%' END,
                    'top',      COALESCE(tp.product_name, '—')
                )
            ORDER BY GREATEST(0, b.gross - COALESCE(d.disc, 0) - b.refund_val) DESC), '[]'::jsonb)
            FROM cat_base b
            LEFT JOIN cat_disc d  ON d.cat_name  = b.cat_name
            LEFT JOIN top_prod tp ON tp.cat_name = b.cat_name
            CROSS JOIN total_net tn
        )
    ) INTO v_prod_category;

    -- ================================================================
    -- 4. PROD TRANSACTIONS
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH pay_split AS (
                SELECT
                    COALESCE(SUM(CASE WHEN payment_method = 'upi'  THEN final_amount ELSE 0 END), 0) AS upi,
                    COALESCE(SUM(CASE WHEN payment_method = 'card' THEN final_amount ELSE 0 END), 0) AS card,
                    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN final_amount ELSE 0 END), 0) AS cash,
                    ROUND(AVG(total_quantity), 1) AS avg_items
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
            )
            SELECT jsonb_build_object(
                'total_invoices',     v_total_invoices,
                'paid_invoices',      v_paid_invoices,
                'refunded_invoices',  v_refunded_invoices,
                'gross_billed',       v_gross_billed,
                'discounts_given',    v_total_discounts,
                'refunds_given',      v_total_refunds,
                'net_collected',      v_net_revenue,
                'upi_collected',      (SELECT upi  FROM pay_split),
                'card_collected',     (SELECT card FROM pay_split),
                'cash_collected',     (SELECT cash FROM pay_split),
                'aov',                CASE WHEN v_total_invoices > 0
                                        THEN ROUND(v_net_revenue / v_total_invoices, 0)
                                        ELSE 0 END,
                'avg_items_per_bill', COALESCE((SELECT avg_items FROM pay_split), 0)
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label   ORDER BY t.sale_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_count ORDER BY t.sale_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS sale_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    COUNT(DISTINCT sale_id) AS daily_count
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                GROUP BY created_at::date
            ) t
        ),
        'tender_split', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.method ORDER BY t.total DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.total  ORDER BY t.total DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    UPPER(payment_method) AS method,
                    ROUND(SUM(final_amount), 2) AS total
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                  AND payment_method IS NOT NULL
                GROUP BY payment_method
            ) t
        ),
        -- ✅ FIX: pre-join + pre-sort in inner subquery, aggregate on top
        'rows', (
            WITH refund_per_sale AS (
                SELECT sale_id, SUM(final_amount) AS refund_total
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND payment_status = 'refunded'
                GROUP BY sale_id
            ),
            limited AS (
                SELECT
                    t.sale_id, t.created_at, t.customer_name, t.staff_name,
                    t.product_names, t.total_quantity, t.total_price,
                    t.discount_amount, t.final_amount, t.payment_method, t.payment_status,
                    COALESCE(r.refund_total, 0) AS refund_total
                FROM public.sales_for_business_transactions t
                LEFT JOIN refund_per_sale r ON r.sale_id = t.sale_id
                WHERE t.company_id = p_company_id
                  AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
                  AND t.created_at::date BETWEEN v_start_date AND v_end_date
                  AND t.payment_status IN ('paid','partial')
                  AND t.refund_reference_id IS NULL
                ORDER BY t.created_at DESC
                LIMIT 500
            )
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'ref',      l.sale_id,
                    'datetime', TO_CHAR(l.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer', COALESCE(l.customer_name, 'Walk-in'),
                    'staff',    COALESCE(l.staff_name, '—'),
                    'items',    COALESCE(ARRAY_TO_STRING(l.product_names, ', '), '—') || ' (' || COALESCE(l.total_quantity, 0) || ')',
                    'gross',    l.total_price,
                    'disc',     COALESCE(l.discount_amount, 0),
                    'refund',   l.refund_total,
                    'net',      l.final_amount,
                    'method',   UPPER(COALESCE(l.payment_method, 'N/A')),
                    'status',   INITCAP(l.payment_status)
                )
            ORDER BY l.created_at DESC), '[]'::jsonb)
            FROM limited l
        )
    ) INTO v_prod_transactions;

    -- ================================================================
    -- 5. PROD DISCOUNTS
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH disc_counts AS (
                SELECT
                    COUNT(*) FILTER (WHERE discount_amount > 0)              AS discounted,
                    COUNT(*) FILTER (WHERE COALESCE(discount_amount, 0) = 0) AS full_price,
                    COUNT(*)                                                  AS total
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
            ),
            top_driver AS (
                SELECT COALESCE(discount_type, 'Manual') AS dtype, SUM(discount_amount) AS dam
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                  AND discount_amount > 0
                GROUP BY COALESCE(discount_type, 'Manual')
                ORDER BY dam DESC
                LIMIT 1
            )
            SELECT jsonb_build_object(
                'total_discounts',    v_total_discounts,
                'discount_rate',      CASE WHEN v_gross_billed > 0
                                        THEN ROUND((v_total_discounts / v_gross_billed) * 100, 1)::text || '%'
                                        ELSE '0%' END,
                'gross_sales',        v_gross_billed,
                'discounted_sales',   (SELECT discounted  FROM disc_counts),
                'discounted_pct',     CASE WHEN (SELECT total FROM disc_counts) > 0
                                        THEN ROUND(((SELECT discounted FROM disc_counts)::numeric / (SELECT total FROM disc_counts)) * 100, 1)::text || '%'
                                        ELSE '0%' END,
                'full_price_sales',   (SELECT full_price FROM disc_counts),
                'avg_discount_sale',  CASE WHEN (SELECT discounted FROM disc_counts) > 0
                                        THEN ROUND(v_total_discounts / (SELECT discounted FROM disc_counts), 0)
                                        ELSE 0 END,
                'top_discount_driver',(SELECT dtype FROM top_driver),
                'top_driver_amount',  COALESCE((SELECT dam FROM top_driver), 0),
                'top_driver_pct',     CASE WHEN v_total_discounts > 0 AND (SELECT dam FROM top_driver) IS NOT NULL
                                        THEN ROUND(((SELECT dam FROM top_driver) / v_total_discounts) * 100, 1)::text || '%'
                                        ELSE '0%' END
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label  ORDER BY t.sale_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_disc ORDER BY t.sale_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS sale_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(discount_amount), 0) AS daily_disc
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                GROUP BY created_at::date
            ) t
        ),
        'discount_types', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(dt.dtype ORDER BY dt.total DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(dt.total ORDER BY dt.total DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(discount_type, 'Manual') AS dtype,
                    SUM(discount_amount) AS total
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                  AND discount_amount > 0
                GROUP BY COALESCE(discount_type, 'Manual')
            ) dt
        ),
        -- ✅ FIX: pre-sort + LIMIT in inner subquery
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'ref',      t.sale_id,
                    'date',     TO_CHAR(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer', COALESCE(t.customer_name, 'Walk-in'),
                    'product',  COALESCE(t.product_names[1],  '—'),
                    'category', COALESCE(t.category_names[1], '—'),
                    'type',     COALESCE(t.discount_type, 'Manual'),
                    'code',     COALESCE(t.discount_name, '—'),
                    'before',   t.total_price,
                    'discount', t.discount_amount,
                    'after',    t.final_amount,
                    'pct',      CASE WHEN t.total_price > 0
                                  THEN ROUND((t.discount_amount / t.total_price) * 100, 1)::text || '%'
                                  ELSE '0%' END
                )
            ORDER BY t.created_at DESC), '[]'::jsonb)
            FROM (
                SELECT *
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status IN ('paid','partial')
                  AND refund_reference_id IS NULL
                  AND discount_amount > 0
                ORDER BY created_at DESC
                LIMIT 500
            ) t
        )
    ) INTO v_prod_discounts;

    -- ================================================================
    -- 6. PROD RETURNS
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'return_count', (
                SELECT COUNT(DISTINCT refund_reference_id)
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status = 'refunded'
            ),
            'processed_returns', (
                SELECT COUNT(DISTINCT refund_reference_id)
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status = 'refunded'
            ),
            'pending_returns',   0,
            'units_returned',    v_returned_qty,
            'gross_units_sold',  v_gross_qty,
            'total_refunded',    v_total_refunds,
            'refund_pct',        CASE WHEN v_net_revenue > 0
                                   THEN ROUND((v_total_refunds / v_net_revenue) * 100, 1)::text || '%'
                                   ELSE '0%' END,
            'return_rate',       CASE WHEN v_gross_qty > 0
                                   THEN ROUND((v_returned_qty::numeric / v_gross_qty) * 100, 1)::text || '%'
                                   ELSE '0%' END
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label    ORDER BY t.sale_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_refund ORDER BY t.sale_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS sale_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(final_amount), 0) AS daily_refund
                FROM public.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_status = 'refunded'
                GROUP BY created_at::date
            ) t
        ),
        'reasons', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(r.reason ORDER BY r.total DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(r.total  ORDER BY r.total DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(return_reason, 'Not Specified') AS reason,
                    SUM(total_amount) AS total
                FROM public.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'refunded'
                GROUP BY COALESCE(return_reason, 'Not Specified')
            ) r
        ),
        -- ✅ FIX: pre-join + pre-sort in inner subquery
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'ref',         t.id,
                    'originalRef', t.refund_reference_id,
                    'date',        TO_CHAR(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
                    'product',     COALESCE(t.product_name, '—'),
                    'category',    COALESCE(t.category_name, 'Uncategorised'),
                    'qty',         t.quantity,
                    'val',         t.total_amount,
                    'refund',      t.total_amount,
                    'method',      UPPER(COALESCE(t.sf_payment_method, t.payment_method, 'N/A')),
                    'reason',      COALESCE(t.return_reason, 'Not Specified'),
                    'status',      'Refunded'
                )
            ORDER BY t.created_at DESC), '[]'::jsonb)
            FROM (
                SELECT
                    s.id, s.refund_reference_id, s.created_at,
                    s.product_name, s.category_name, s.quantity,
                    s.total_amount, s.payment_method, s.return_reason,
                    s.sale_id,
                    sf.payment_method AS sf_payment_method
                FROM public.sales s
                LEFT JOIN public.sales_for_business_transactions sf
                  ON sf.sale_id              = s.sale_id
                 AND sf.payment_status       = 'refunded'
                 AND sf.refund_reference_id  = s.refund_reference_id
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                  AND s.status = 'refunded'
                ORDER BY s.created_at DESC
                LIMIT 500
            ) t
        )
    ) INTO v_prod_returns;

    -- ================================================================
    -- 7. PROD PAYMENTS
    -- ================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH bt_stats AS (
                SELECT
                    COALESCE(SUM(CASE WHEN status = 'paid'     THEN COALESCE(final_amount, amount) ELSE 0 END), 0) AS collected,
                    COALESCE(SUM(CASE WHEN status = 'pending'  THEN COALESCE(amount, 0)            ELSE 0 END), 0) AS pending_dues,
                    COALESCE(SUM(CASE WHEN status = 'refunded' THEN COALESCE(final_amount, amount) ELSE 0 END), 0) AS refunded_amt,
                    COUNT(*) FILTER (WHERE status = 'paid')     AS paid_count,
                    COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
                    COUNT(*) FILTER (WHERE status = 'refunded') AS refund_count
                FROM public.business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND reference_type = 'product'
                  AND created_at::date BETWEEN v_start_date AND v_end_date
            )
            SELECT jsonb_build_object(
                'total_collected',    (SELECT collected     FROM bt_stats),
                'reconciled_pct',     CASE WHEN (SELECT pending_dues FROM bt_stats) = 0
                                        THEN '100% Reconciled'
                                        ELSE ROUND(
                                            ((SELECT collected FROM bt_stats) /
                                             NULLIF((SELECT collected + pending_dues FROM bt_stats), 0)
                                            ) * 100, 1)::text || '% Reconciled'
                                        END,
                'total_transactions', (SELECT paid_count    FROM bt_stats),
                'pending_dues',       (SELECT pending_dues  FROM bt_stats),
                'pending_tickets',    (SELECT pending_count FROM bt_stats),
                'refunded_amount',    (SELECT refunded_amt  FROM bt_stats),
                'refunds_count',      (SELECT refund_count  FROM bt_stats),
                'net_reconciled',     GREATEST(0, (SELECT collected FROM bt_stats) - (SELECT refunded_amt FROM bt_stats))
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label       ORDER BY t.pay_date), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.daily_collected ORDER BY t.pay_date), '[]'::jsonb)
            )
            FROM (
                SELECT
                    created_at::date AS pay_date,
                    TO_CHAR(created_at::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(COALESCE(final_amount, amount)), 0) AS daily_collected
                FROM public.business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND reference_type = 'product'
                  AND status = 'paid'
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY created_at::date
            ) t
        ),
        'methods', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(m.method ORDER BY m.total DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(m.total  ORDER BY m.total DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    UPPER(payment_method) AS method,
                    ROUND(SUM(COALESCE(final_amount, amount)), 2) AS total
                FROM public.business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND reference_type = 'product'
                  AND status = 'paid'
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND payment_method IS NOT NULL
                GROUP BY payment_method
            ) m
        ),
        -- ✅ FIX: pre-join + pre-sort in inner subquery
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'payRef',    t.payment_id,
                    'saleRef',   t.reference_id,
                    'datetime',  TO_CHAR(COALESCE(t.paid_at, t.created_at), 'YYYY-MM-DD, HH12:MI AM'),
                    'customer',  COALESCE(t.customer_name, 'Walk-in'),
                    'product',   COALESCE(t.product_names_1, '—'),
                    'category',  COALESCE(t.category_names_1, '—'),
                    'bill',      COALESCE(t.amount, 0),
                    'collected', COALESCE(t.final_amount, t.amount, 0),
                    'mode',      UPPER(COALESCE(t.payment_method, 'N/A')),
                    'status',    INITCAP(t.status)
                )
            ORDER BY COALESCE(t.paid_at, t.created_at) DESC), '[]'::jsonb)
            FROM (
                SELECT
                    bt.payment_id, bt.reference_id, bt.paid_at, bt.created_at,
                    bt.amount, bt.final_amount, bt.payment_method, bt.status,
                    sf.customer_name,
                    sf.product_names[1]  AS product_names_1,
                    sf.category_names[1] AS category_names_1
                FROM public.business_transactions bt
                LEFT JOIN public.sales_for_business_transactions sf
                  ON sf.sale_id = bt.reference_id
                 AND sf.refund_reference_id IS NULL
                 AND sf.payment_status IN ('paid','partial')
                WHERE bt.company_id = p_company_id
                  AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
                  AND bt.reference_type = 'product'
                  AND bt.created_at::date BETWEEN v_start_date AND v_end_date
                ORDER BY COALESCE(bt.paid_at, bt.created_at) DESC
                LIMIT 500
            ) t
        )
    ) INTO v_prod_payments;

    -- ================================================================
    -- RETURN ALL 7 SUB-REPORTS
    -- ================================================================
    RETURN jsonb_build_object(
        'prod_overview',     v_prod_overview,
        'prod_wise',         v_prod_wise,
        'prod_category',     v_prod_category,
        'prod_transactions', v_prod_transactions,
        'prod_discounts',    v_prod_discounts,
        'prod_returns',      v_prod_returns,
        'prod_payments',     v_prod_payments
    );
END;
$$;

-- GRANT EXECUTE ON FUNCTION public.get_product_sales_report(uuid, uuid, date, date) TO authenticated;
