-- =============================================================================
-- Migration: 20261115000006_harden_clickable_total_spent.sql
-- Module: Customers Module (RPC 5 of 6)
-- Target: app.customers_page_clickable_total_spent & public API wrapper
-- Architecture: Two-Tier (Section 1: Security & Preconditions, Section 2: Pure Core Logic)
-- =============================================================================

-- Drop legacy functions to ensure clean signature binding
DROP FUNCTION IF EXISTS public.customers_page_clickable_total_spent(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.customers_page_clickable_total_spent(uuid, uuid, uuid);

-- ── 1. App Schema Core Implementation ────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.customers_page_clickable_total_spent(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
    services_total    numeric,
    products_total    numeric,
    memberships_total numeric,
    grand_total       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    -- ── SECTION 1: Security & Preconditions (Fail-Fast) ────────────────────────
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'Company ID is required' USING ERRCODE = 'P0001';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID is required' USING ERRCODE = 'P0001';
    END IF;

    -- Tenant isolation check
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Permission check
    PERFORM shared.check_permission(p_company_id, 'customers_management');

    -- Customer existence check within company
    IF NOT EXISTS (
        SELECT 1 FROM app.customers
        WHERE company_id = p_company_id
          AND customer_id = p_customer_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0001';
    END IF;

    -- ── SECTION 2: Pure Core Logic (Identical Sync to Function A) ──────────────
    RETURN QUERY
    WITH booking_tx AS (
        SELECT
            booking_id,
            SUM(
                CASE
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                        THEN -ABS(COALESCE(final_amount, total_price, 0))
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                         OR LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
                        THEN ABS(COALESCE(final_amount, total_price, 0))
                    ELSE 0
                END
            ) AS net_amount
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND customer_id = p_customer_id
          AND (
              LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded')
              OR LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
          )
        GROUP BY booking_id
    ),
    sales_tx AS (
        SELECT
            sale_id,
            SUM(
                CASE
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                        THEN -ABS(COALESCE(final_amount, total_price, 0))
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                        THEN ABS(COALESCE(final_amount, total_price, 0))
                    ELSE 0
                END
            ) AS net_amount
        FROM app.sales_for_business_transactions
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND customer_id = p_customer_id
          AND LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded')
        GROUP BY sale_id
    ),
    membership_tx AS (
        SELECT
            purchase_id,
            SUM(
                CASE
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                        THEN -ABS(COALESCE(final_amount, price, 0))
                    WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                         OR status IN ('active', 'expired')
                        THEN ABS(COALESCE(final_amount, price, 0))
                    ELSE 0
                END
            ) AS net_amount
        FROM app.membership_purchases
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND customer_id = p_customer_id
          AND (
              LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded')
              OR status IN ('active', 'expired')
          )
        GROUP BY purchase_id
    ),
    totals AS (
        SELECT
            GREATEST(0, COALESCE((SELECT SUM(net_amount) FROM booking_tx), 0))::numeric AS s_total,
            GREATEST(0, COALESCE((SELECT SUM(net_amount) FROM sales_tx), 0))::numeric AS p_total,
            GREATEST(0, COALESCE((SELECT SUM(net_amount) FROM membership_tx), 0))::numeric AS m_total
    )
    SELECT
        t.s_total AS services_total,
        t.p_total AS products_total,
        t.m_total AS memberships_total,
        (t.s_total + t.p_total + t.m_total)::numeric AS grand_total
    FROM totals t;
END;
$$;

-- ── 2. Public API Wrapper ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customers_page_clickable_total_spent(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
    services_total    numeric,
    products_total    numeric,
    memberships_total numeric,
    grand_total       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.customers_page_clickable_total_spent(
        p_company_id  => p_company_id,
        p_branch_id   => p_branch_id,
        p_customer_id => p_customer_id
    );
END;
$$;

-- ── 3. ACL Security Lockdown ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.customers_page_clickable_total_spent(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.customers_page_clickable_total_spent(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.customers_page_clickable_total_spent(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customers_page_clickable_total_spent(uuid, uuid, uuid) TO authenticated, service_role;
