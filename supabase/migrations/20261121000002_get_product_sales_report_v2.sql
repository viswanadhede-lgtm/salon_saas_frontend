-- =============================================================================
-- Migration: 20261121000002_get_product_sales_report_v2.sql
-- Module   : Module 15 - Reports & Analytics (Product Sales Master RPC)
-- Standards: Two-Tier Architecture Standard
--            - Section 1: Pre-flight security gates (company, tenant, branch, sub)
--            - Section 2: Core Reporting Engine Grouped into Sub-Reports:
--                * GROUP 1: Product Sales Overview (prod_overview)
--                * GROUP 2: Product-wise Sales Report (prod_wise)
--                * GROUP 3: Sales by Category Report (prod_category)
--                * GROUP 4: Discounts Report (prod_discounts)
--                * GROUP 5: Product Returns & Refunds Report (prod_returns)
--            - Zero-Downtime Public Wrapper
--            - Revoke PUBLIC, Grant authenticated + service_role
-- =============================================================================

-- Drop existing public / app signatures cleanly
DROP FUNCTION IF EXISTS public.get_product_sales_report(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_product_sales_report(uuid, uuid, date, date);

-- =============================================================================
-- 1. Tier 1: Core Engine in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_product_sales_report(
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
    -- Date Range Normalization
    v_start_date                date := COALESCE(p_start_date, (DATE_TRUNC('month', CURRENT_DATE))::date);
    v_end_date                  date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date                 date;

    -- Group 1 Overview Variables
    v_total_sales               numeric := 0;
    v_total_discounts           numeric := 0;
    v_total_refunds             numeric := 0;
    v_net_sales                 numeric := 0;
    v_gross_quantity            bigint  := 0;
    v_returned_quantity         bigint  := 0;
    v_quantity_sold             bigint  := 0;
    v_unique_products_sold      bigint  := 0;
    v_active_categories_count   bigint  := 0;

    -- Sub-Report Payload JSONBs
    v_prod_overview             jsonb;
    v_prod_wise                 jsonb;
    v_prod_category             jsonb;
    v_prod_transactions         jsonb;
    v_prod_discounts            jsonb;
    v_prod_returns              jsonb;
    v_prod_payments             jsonb;
BEGIN
    -- Normalize inverted date bounds
    IF v_start_date > v_end_date THEN
        v_temp_date  := v_start_date;
        v_start_date := v_end_date;
        v_end_date   := v_temp_date;
    END IF;

    -- =========================================================================
    -- SECTION 1: SECURITY & TENANT ISOLATION GATES
    -- =========================================================================

    -- Gate 1.1: Mandatory company identification
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory'
            USING ERRCODE = 'P0001';
    END IF;

    -- Gate 1.2: Tenant access verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %',
            p_company_id, p_branch_id
            USING ERRCODE = '42501';
    END IF;

    -- Gate 1.3: Branch-company ownership check (if branch_id provided)
    IF p_branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id = p_branch_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: branch % does not belong to company %',
            p_branch_id, p_company_id
            USING ERRCODE = '42501';
    END IF;

    -- Gate 1.4: Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- =========================================================================
    -- SECTION 2: CORE REPORTING ENGINE
    -- =========================================================================

    -- =========================================================================
    -- GROUP 1: PRODUCT SALES OVERVIEW (prod_overview)
    -- =========================================================================

    -- Step 1: Stat Card 1 - Total Sales (Gross Billed Sales)
    -- Paid gross total_price minus Refunded gross total_price
    SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_price ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN ABS(total_price) ELSE 0 END), 0)
    INTO v_total_sales
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    -- Step 2 & 3: Stat Card 2 - Net Sales, Discounts & Refunds
    -- Total Product Discounts Given (from app.discount_usages where reference_type = 'pos_sale')
    SELECT
        COALESCE(SUM(discount_amount - COALESCE(reversal_amount, 0)), 0)
    INTO v_total_discounts
    FROM app.discount_usages
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND reference_type = 'pos_sale'
      AND used_at::date BETWEEN v_start_date AND v_end_date;

    -- Total Refunds Given (from app.sales_for_business_transactions where payment_status = 'refunded')
    SELECT
        COALESCE(SUM(ABS(final_amount)), 0)
    INTO v_total_refunds
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND payment_status = 'refunded'
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    -- Net Sales = Total Sales - Discounts - Refunds
    v_net_sales := GREATEST(0, v_total_sales - v_total_discounts - v_total_refunds);

    -- Step 4: Stat Card 3 - Quantity Sold (Net Retail Units)
    SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN ABS(total_quantity) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN ABS(total_quantity) ELSE 0 END), 0)
    INTO v_gross_quantity, v_returned_quantity
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND created_at::date BETWEEN v_start_date AND v_end_date;

    v_quantity_sold := GREATEST(0, v_gross_quantity - v_returned_quantity);

    -- Step 5: Stat Card 4 - Unique Products Sold & Active Categories (Approach 1)
    SELECT
        COALESCE((
            SELECT COUNT(DISTINCT p)
            FROM app.sales_for_business_transactions s,
                 LATERAL unnest(s.product_ids) AS p
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.created_at::date BETWEEN v_start_date AND v_end_date
              AND s.payment_status = 'paid'
        ), 0),
        COALESCE((
            SELECT COUNT(DISTINCT c)
            FROM app.sales_for_business_transactions s,
                 LATERAL unnest(s.category_names) AS c
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.created_at::date BETWEEN v_start_date AND v_end_date
              AND s.payment_status = 'paid'
              AND c IS NOT NULL AND TRIM(c) <> ''
        ), 0)
    INTO v_unique_products_sold, v_active_categories_count;

    -- Build GROUP 1 JSON Payload
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_sales',             v_total_sales,
            'net_sales',               v_net_sales,
            'total_discounts',         v_total_discounts,
            'total_refunds',           v_total_refunds,
            'gross_quantity',          v_gross_quantity,
            'quantity_sold',           v_quantity_sold,
            'quantity_returned',       v_returned_quantity,
            'unique_products',         v_unique_products_sold,
            'active_categories_count', v_active_categories_count
        ),
        -- Dual-Axis Trend: Left Y-Axis (Revenue), Right Y-Axis (Quantity Units)
        'trend', (
            SELECT jsonb_build_object(
                'labels',          COALESCE(jsonb_agg(t.day_label   ORDER BY t.d), '[]'::jsonb),
                'revenue_values',  COALESCE(jsonb_agg(t.revenue     ORDER BY t.d), '[]'::jsonb),
                'quantity_values', COALESCE(jsonb_agg(t.units       ORDER BY t.d), '[]'::jsonb),
                'values',          COALESCE(jsonb_agg(t.revenue     ORDER BY t.d), '[]'::jsonb)
            )
            FROM (
                SELECT
                    d::date AS d,
                    TO_CHAR(d::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(
                        CASE 
                            WHEN s.payment_status = 'paid' THEN s.final_amount
                            WHEN s.payment_status = 'refunded' THEN -ABS(s.final_amount)
                            ELSE 0
                        END
                    ), 0) AS revenue,
                    COALESCE(SUM(
                        CASE
                            WHEN s.payment_status = 'paid' THEN s.total_quantity
                            WHEN s.payment_status = 'refunded' THEN -ABS(s.total_quantity)
                            ELSE 0
                        END
                    ), 0) AS units
                FROM generate_series(v_start_date, v_end_date, '1 day'::interval) d
                LEFT JOIN app.sales_for_business_transactions s
                  ON s.created_at::date = d::date
                 AND s.company_id = p_company_id
                 AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                GROUP BY d::date
                ORDER BY d::date
            ) t
        ),
        -- Donut Chart: Net Sales by Category
        'categories', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(c.cat_name ORDER BY c.net_rev DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(c.net_rev  ORDER BY c.net_rev DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(NULLIF(TRIM(category_name), ''), 'Uncategorised') AS cat_name,
                    ROUND(GREATEST(0,
                        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) -
                        SUM(CASE WHEN status = 'refunded' THEN ABS(total_amount) ELSE 0 END)
                    ), 2) AS net_rev
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY COALESCE(NULLIF(TRIM(category_name), ''), 'Uncategorised')
                ORDER BY net_rev DESC
            ) c
        ),
        -- Transactions Table: both 'paid' and 'refunded' transactions
        'sales_transactions', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'sale_id',         t.sale_id,
                    'created_at',      TO_CHAR(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer_name',   COALESCE(t.customer_name, 'Walk-in Customer'),
                    'customer_phone',  COALESCE(t.customer_phone, '—'),
                    'staff_name',      COALESCE(t.staff_name, '—'),
                    'product_names',   t.product_names,
                    'category_names',  t.category_names,
                    'total_quantity',  ABS(t.total_quantity),
                    'total_price',     ABS(t.total_price),
                    'discount_amount', ABS(COALESCE(t.discount_amount, 0)),
                    'discount_name',   t.discount_name,
                    'final_amount',    ABS(t.final_amount),
                    'payment_method',  t.payment_method,
                    'payment_status',  t.payment_status
                )
            ORDER BY t.created_at DESC), '[]'::jsonb)
            FROM (
                SELECT *
                FROM app.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                ORDER BY created_at DESC
                LIMIT 500
            ) t
        )
    ) INTO v_prod_overview;

    -- =========================================================================
    -- GROUP 2: PRODUCT-WISE SALES REPORT (prod_wise)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH top_sku AS (
                SELECT product_name, SUM(quantity) AS sold
                FROM app.sales
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
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'refunded'
            )
            SELECT jsonb_build_object(
                'total_units',     v_quantity_sold,
                'gross_units',     v_gross_quantity,
                'net_revenue',     v_net_sales,
                'top_sku_name',    COALESCE((SELECT product_name FROM top_sku), '—'),
                'top_sku_units',   COALESCE((SELECT sold FROM top_sku), 0),
                'top_sku_pct',     CASE WHEN v_gross_quantity > 0 AND (SELECT sold FROM top_sku) IS NOT NULL
                                      THEN ROUND(((SELECT sold FROM top_sku)::numeric / v_gross_quantity) * 100, 1)::text || '%'
                                      ELSE '0%' END,
                'returned_units',  v_returned_quantity,
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
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
                GROUP BY created_at::date
            ) t
        ),
        'distribution', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(d.label ORDER BY d.units DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(d.units ORDER BY d.units DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(product_name, 'Unknown') AS label,
                    SUM(quantity)::bigint AS units
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                  AND status = 'paid'
                GROUP BY product_name
                ORDER BY units DESC
                LIMIT 5
            ) d
        ),
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'rank',      s.rn,
                    'name',      s.product_name,
                    'sku',       COALESCE(s.sku, '—'),
                    'category',  COALESCE(s.category_name, 'General'),
                    'sold',      s.units_sold,
                    'returned',  s.units_returned,
                    'gross',     s.gross_sales,
                    'disc',      s.discounts,
                    'net',       s.net_sales,
                    'pct',       CASE WHEN v_total_sales > 0
                                      THEN ROUND((s.gross_sales / v_total_sales) * 100, 1)::text || '%'
                                      ELSE '0%' END,
                    'txns',      s.txns
                )
            ORDER BY s.gross_sales DESC), '[]'::jsonb)
            FROM (
                SELECT
                    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(CASE WHEN s.status = 'paid' THEN s.total_amount ELSE 0 END), 0) DESC) AS rn,
                    p.product_id,
                    p.product_name,
                    'SKU-' || UPPER(SUBSTRING(p.product_id::text, 1, 6)) AS sku,
                    p.category_name,
                    COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.quantity     ELSE 0 END), 0)::bigint AS units_sold,
                    COALESCE(SUM(CASE WHEN s.status = 'refunded' THEN s.quantity     ELSE 0 END), 0)::bigint AS units_returned,
                    COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END), 0)         AS gross_sales,
                    0::numeric                                                                              AS discounts,
                    GREATEST(0,
                        COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN s.status = 'refunded' THEN s.total_amount ELSE 0 END), 0)
                    ) AS net_sales,
                    COUNT(DISTINCT CASE WHEN s.status = 'paid' THEN s.sale_id END)::bigint AS txns
                FROM app.sales s
                JOIN app.products p ON p.product_id = s.product_id
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY p.product_id, p.product_name, p.category_name
                HAVING COUNT(s.id) > 0
            ) s
        )
    ) INTO v_prod_wise;

    -- =========================================================================
    -- GROUP 3: SALES BY CATEGORY REPORT (prod_category)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', (
            WITH cat_summary AS (
                SELECT
                    category_name,
                    GREATEST(0,
                        SUM(CASE WHEN status = 'paid'     THEN total_amount ELSE 0 END) -
                        SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END)
                    ) AS net_rev
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY category_name
            ),
            top_cat AS (
                SELECT category_name, net_rev
                FROM cat_summary
                ORDER BY net_rev DESC
                LIMIT 1
            )
            SELECT jsonb_build_object(
                'total_categories', (SELECT COUNT(DISTINCT category_id) FROM app.product_categories WHERE company_id = p_company_id),
                'catalog_pct',      '100% catalog active',
                'top_category',     COALESCE((SELECT category_name FROM top_cat), '—'),
                'top_category_rev', COALESCE((SELECT net_rev FROM top_cat), 0),
                'top_category_pct', CASE WHEN v_net_sales > 0 AND (SELECT net_rev FROM top_cat) IS NOT NULL
                                         THEN ROUND(((SELECT net_rev FROM top_cat) / v_net_sales) * 100, 1)::text || '%'
                                         ELSE '0%' END,
                'items_sold',       v_quantity_sold,
                'avg_items_per_cat',CASE WHEN (SELECT COUNT(*) FROM cat_summary) > 0
                                         THEN ROUND(v_quantity_sold::numeric / (SELECT COUNT(*) FROM cat_summary), 0)
                                         ELSE 0 END,
                'avg_rev_per_cat',  CASE WHEN (SELECT COUNT(*) FROM cat_summary) > 0
                                         THEN ROUND(v_net_sales / (SELECT COUNT(*) FROM cat_summary), 0)
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
                    ROUND(GREATEST(0,
                        SUM(CASE WHEN status = 'paid'     THEN total_amount ELSE 0 END) -
                        SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END)
                    ), 2) AS net_rev
                FROM app.sales
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY category_name
            ) c
        ),
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'name',     c.cat_name,
                    'skus',     c.skus,
                    'units',    c.units_sold,
                    'returned', c.units_returned,
                    'gross',    c.gross_rev,
                    'disc',     c.discounts,
                    'refund',   c.refunded,
                    'net',      c.net_rev,
                    'pct',      CASE WHEN v_net_sales > 0
                                     THEN ROUND((c.net_rev / v_net_sales) * 100, 1)::text || '%'
                                     ELSE '0%' END,
                    'top',      COALESCE(c.top_product, '—')
                )
            ORDER BY c.net_rev DESC), '[]'::jsonb)
            FROM (
                SELECT
                    COALESCE(s.category_name, 'Uncategorised') AS cat_name,
                    COUNT(DISTINCT s.product_id)::bigint       AS skus,
                    COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.quantity     ELSE 0 END), 0)::bigint AS units_sold,
                    COALESCE(SUM(CASE WHEN s.status = 'refunded' THEN s.quantity     ELSE 0 END), 0)::bigint AS units_returned,
                    COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END), 0)         AS gross_rev,
                    0::numeric                                                                               AS discounts,
                    COALESCE(SUM(CASE WHEN s.status = 'refunded' THEN s.total_amount ELSE 0 END), 0)         AS refunded,
                    GREATEST(0,
                        COALESCE(SUM(CASE WHEN s.status = 'paid'     THEN s.total_amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN s.status = 'refunded' THEN s.total_amount ELSE 0 END), 0)
                    ) AS net_rev,
                    (
                        SELECT s2.product_name
                        FROM app.sales s2
                        WHERE s2.company_id = p_company_id
                          AND (p_branch_id IS NULL OR s2.branch_id = p_branch_id)
                          AND s2.created_at::date BETWEEN v_start_date AND v_end_date
                          AND s2.category_name IS NOT DISTINCT FROM s.category_name
                          AND s2.status = 'paid'
                        GROUP BY s2.product_name
                        ORDER BY SUM(s2.quantity) DESC
                        LIMIT 1
                    ) AS top_product
                FROM app.sales s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY s.category_name
            ) c
        )
    ) INTO v_prod_category;

    -- =========================================================================
    -- GROUP 4: DISCOUNTS REPORT (prod_discounts)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', (
            SELECT jsonb_build_object(
                'total_discounts',     v_total_discounts,
                'discount_rate',       CASE WHEN v_total_sales > 0
                                            THEN ROUND((v_total_discounts / v_total_sales) * 100, 1)::text || '%'
                                            ELSE '0%' END,
                'gross_sales',         v_total_sales,
                'discounted_sales',    COUNT(DISTINCT reference_id),
                'discounted_pct',      '—',
                'full_price_sales',    0,
                'avg_discount_sale',   CASE WHEN COUNT(DISTINCT reference_id) > 0
                                            THEN ROUND(v_total_discounts / COUNT(DISTINCT reference_id), 0)
                                            ELSE 0 END,
                'top_discount_driver', 'Coupons & Promos',
                'top_driver_amount',   v_total_discounts,
                'top_driver_pct',      '100%'
            )
            FROM app.discount_usages
            WHERE company_id = p_company_id
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
              AND reference_type = 'pos_sale'
              AND used_at::date BETWEEN v_start_date AND v_end_date
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label ORDER BY t.d), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.disc      ORDER BY t.d), '[]'::jsonb)
            )
            FROM (
                SELECT
                    d::date AS d,
                    TO_CHAR(d::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(u.discount_amount - COALESCE(u.reversal_amount, 0)), 0) AS disc
                FROM generate_series(v_start_date, v_end_date, '1 day'::interval) d
                LEFT JOIN app.discount_usages u
                  ON u.used_at::date = d::date
                 AND u.company_id = p_company_id
                 AND (p_branch_id IS NULL OR u.branch_id = p_branch_id)
                 AND u.reference_type = 'pos_sale'
                GROUP BY d::date
                ORDER BY d::date
            ) t
        ),
        'discount_types', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.label ORDER BY t.val DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.val   ORDER BY t.val DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    INITCAP(COALESCE(discount_type, 'General')) AS label,
                    ROUND(SUM(discount_amount - COALESCE(reversal_amount, 0)), 2) AS val
                FROM app.discount_usages
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND reference_type = 'pos_sale'
                  AND used_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY discount_type
            ) t
        ),
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'ref',      u.reference_id,
                    'date',     TO_CHAR(u.used_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer', COALESCE(c.customer_name, 'Walk-in'),
                    'product',  COALESCE(s.product_names[1], 'Retail Sale'),
                    'category', COALESCE(s.category_names[1], 'General'),
                    'type',     INITCAP(COALESCE(u.discount_type, 'Promo')),
                    'code',     COALESCE(u.discount_name, '—'),
                    'before',   COALESCE(s.total_price, 0),
                    'discount', u.discount_amount - COALESCE(u.reversal_amount, 0),
                    'after',    COALESCE(s.final_amount, 0),
                    'pct',      CASE WHEN COALESCE(s.total_price, 0) > 0
                                     THEN ROUND(((u.discount_amount - COALESCE(u.reversal_amount, 0)) / s.total_price) * 100, 1)::text || '%'
                                     ELSE '0%' END
                )
            ORDER BY u.used_at DESC), '[]'::jsonb)
            FROM app.discount_usages u
            LEFT JOIN app.sales_for_business_transactions s ON s.sale_id = u.reference_id
            LEFT JOIN app.customers c ON c.customer_id = u.customer_id
            WHERE u.company_id = p_company_id
              AND (p_branch_id IS NULL OR u.branch_id = p_branch_id)
              AND u.reference_type = 'pos_sale'
              AND u.used_at::date BETWEEN v_start_date AND v_end_date
            LIMIT 500
        )
    ) INTO v_prod_discounts;

    -- =========================================================================
    -- GROUP 5: PRODUCT RETURNS & REFUNDS REPORT (prod_returns)
    -- =========================================================================
    SELECT jsonb_build_object(
        'kpis', (
            SELECT jsonb_build_object(
                'returned_units',   v_returned_quantity,
                'units_sold',       v_quantity_sold,
                'return_rate',      CASE WHEN v_gross_quantity > 0
                                         THEN ROUND((v_returned_quantity::numeric / v_gross_quantity) * 100, 1)::text || '%'
                                         ELSE '0%' END,
                'refunded_amount',  v_total_refunds,
                'avg_refund_per_return', CASE WHEN v_returned_quantity > 0
                                              THEN ROUND(v_total_refunds / v_returned_quantity, 0)
                                              ELSE 0 END,
                'repeat_returns',   0,
                'repeat_customers', 0
            )
        ),
        'trend', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(t.day_label ORDER BY t.d), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(t.refunds   ORDER BY t.d), '[]'::jsonb)
            )
            FROM (
                SELECT
                    d::date AS d,
                    TO_CHAR(d::date, 'DD Mon') AS day_label,
                    COALESCE(SUM(ABS(s.final_amount)), 0) AS refunds
                FROM generate_series(v_start_date, v_end_date, '1 day'::interval) d
                LEFT JOIN app.sales_for_business_transactions s
                  ON s.created_at::date = d::date
                 AND s.company_id = p_company_id
                 AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                 AND s.payment_status = 'refunded'
                GROUP BY d::date
                ORDER BY d::date
            ) t
        ),
        'reasons', (
            SELECT jsonb_build_object(
                'labels', COALESCE(jsonb_agg(r.reason ORDER BY r.cnt DESC), '[]'::jsonb),
                'values', COALESCE(jsonb_agg(r.cnt    ORDER BY r.cnt DESC), '[]'::jsonb)
            )
            FROM (
                SELECT
                    COALESCE(NULLIF(TRIM(refund_reason), ''), 'Customer Request') AS reason,
                    COUNT(*)::bigint AS cnt
                FROM app.sales_for_business_transactions
                WHERE company_id = p_company_id
                  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                  AND payment_status = 'refunded'
                  AND created_at::date BETWEEN v_start_date AND v_end_date
                GROUP BY COALESCE(NULLIF(TRIM(refund_reason), ''), 'Customer Request')
            ) r
        ),
        'rows', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'ref',       s.sale_id,
                    'datetime',  TO_CHAR(s.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD, HH12:MI AM'),
                    'customer',  COALESCE(s.customer_name, 'Walk-in'),
                    'product',   COALESCE(s.product_names[1], '—'),
                    'qty',       ABS(s.total_quantity),
                    'refund',    ABS(s.final_amount),
                    'method',    UPPER(s.payment_method),
                    'reason',    COALESCE(s.refund_reason, 'Customer Return'),
                    'status',    'Refunded'
                )
            ORDER BY s.created_at DESC), '[]'::jsonb)
            FROM app.sales_for_business_transactions s
            WHERE s.company_id = p_company_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.payment_status = 'refunded'
              AND s.created_at::date BETWEEN v_start_date AND v_end_date
            LIMIT 500
        )
    ) INTO v_prod_returns;

    -- =========================================================================
    -- RETURN REPORT PAYLOAD
    -- =========================================================================
    RETURN jsonb_build_object(
        'prod_overview',     v_prod_overview,
        'prod_wise',         v_prod_wise,
        'prod_category',     v_prod_category,
        'prod_discounts',    v_prod_discounts,
        'prod_returns',      v_prod_returns
    );
END;
$$;

-- =============================================================================
-- 2. Tier 2: Zero-Downtime Public Schema Wrapper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_product_sales_report(
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
    RETURN app.get_product_sales_report(
        p_company_id,
        p_branch_id,
        p_start_date,
        p_end_date
    );
END;
$$;

-- =============================================================================
-- 3. Grants
-- =============================================================================
REVOKE ALL ON FUNCTION app.get_product_sales_report(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_product_sales_report(uuid, uuid, date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_product_sales_report(uuid, uuid, date, date) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_product_sales_report(uuid, uuid, date, date) TO authenticated, service_role, anon;
