-- RPC: dashboard_todays_revenue_kpis
-- Single round-trip aggregation for Today's Revenue Dashboard

CREATE OR REPLACE FUNCTION dashboard_todays_revenue_kpis(
    p_branch_id  uuid,
    p_company_id uuid DEFAULT NULL,
    p_today      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    services_revenue       numeric,
    products_revenue       numeric,
    memberships_revenue    numeric,
    total_revenue          numeric,
    total_transactions     bigint,
    avg_transaction_value  numeric,
    highest_sale           numeric,
    total_refunds          numeric,
    cash_payments          numeric,
    digital_payments       numeric,
    today_expenses         numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Paid amounts per type
    v_svc_paid     numeric;
    v_svc_ref      numeric;
    v_prod_paid    numeric;
    v_prod_ref     numeric;
    v_memb_paid    numeric;
    v_memb_ref     numeric;

    -- Snapshot metrics
    v_total_txn    bigint;
    v_highest      numeric;
    v_refunds      numeric;
    v_cash         numeric;
    v_digital      numeric;

    -- Derived
    v_svc_net      numeric;
    v_prod_net     numeric;
    v_memb_net     numeric;
    v_total_rev    numeric;
    v_avg_value    numeric;

    -- Expenses
    v_expenses     numeric;
BEGIN

    -- ── 1. SINGLE SCAN over business_transactions for all metrics ────────────
    SELECT
        -- Services: paid
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid'
              AND reference_type = 'booking'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Services: refunded
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'refunded'
              AND reference_type = 'booking'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Products: paid
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid'
              AND reference_type = 'product'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Products: refunded
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'refunded'
              AND reference_type = 'product'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Memberships: paid
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid'
              AND reference_type = 'membership'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Memberships: refunded
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'refunded'
              AND reference_type = 'membership'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Total paid transactions count
        COUNT(*) FILTER (
            WHERE status = 'paid' AND DATE(COALESCE(paid_at, created_at)) = p_today
        ),

        -- Highest single sale today
        COALESCE(MAX(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid' AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Total refunds today (shown as standalone metric)
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'refunded'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Cash payments
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid'
              AND payment_method = 'cash'
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0),

        -- Digital payments (upi + card)
        COALESCE(SUM(COALESCE(final_amount, amount, 0)) FILTER (
            WHERE status = 'paid'
              AND payment_method IN ('upi', 'card')
              AND DATE(COALESCE(paid_at, created_at)) = p_today
        ), 0)

    INTO
        v_svc_paid,  v_svc_ref,
        v_prod_paid, v_prod_ref,
        v_memb_paid, v_memb_ref,
        v_total_txn,
        v_highest,
        v_refunds,
        v_cash,
        v_digital

    FROM business_transactions
    WHERE branch_id = p_branch_id
      AND (p_company_id IS NULL OR company_id = p_company_id OR company_id IS NULL);

    -- ── 2. NET REVENUE PER TYPE (paid − refunded, floor at 0) ───────────────
    v_svc_net   := GREATEST(0, v_svc_paid   - v_svc_ref);
    v_prod_net  := GREATEST(0, v_prod_paid  - v_prod_ref);
    v_memb_net  := GREATEST(0, v_memb_paid  - v_memb_ref);
    v_total_rev := v_svc_net + v_prod_net + v_memb_net;

    -- ── 3. AVG TRANSACTION VALUE ─────────────────────────────────────────────
    v_avg_value := CASE
        WHEN COALESCE(v_total_txn, 0) = 0 THEN 0
        ELSE ROUND(v_total_rev / v_total_txn, 0)
    END;

    -- ── 4. TODAY'S EXPENSES (excludes deleted entries) ───────────────────────
    SELECT COALESCE(SUM(amount), 0)
    INTO   v_expenses
    FROM   expenses
    WHERE  branch_id  = p_branch_id
      AND  (p_company_id IS NULL OR company_id = p_company_id OR company_id IS NULL)
      AND  date       = p_today
      AND  (status IS NULL OR status <> 'deleted');

    -- ── 5. RETURN ─────────────────────────────────────────────────────────────
    RETURN QUERY SELECT
        COALESCE(v_svc_net,    0),
        COALESCE(v_prod_net,   0),
        COALESCE(v_memb_net,   0),
        COALESCE(v_total_rev,  0),
        COALESCE(v_total_txn,  0),
        COALESCE(v_avg_value,  0),
        COALESCE(v_highest,    0),
        COALESCE(v_refunds,    0),
        COALESCE(v_cash,       0),
        COALESCE(v_digital,    0),
        COALESCE(v_expenses,   0);
END;
$$;
