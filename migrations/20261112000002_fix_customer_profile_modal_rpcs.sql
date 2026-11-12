-- ============================================================================
-- Migration: 20261112000002_fix_customer_profile_modal_rpcs.sql
-- Description: Fix Global_customer_profile_modal and customers_page_clickable_total_spent
--              to query app schema tables and use booking_status instead of status.
-- ============================================================================

CREATE OR REPLACE FUNCTION public."Global_customer_profile_modal"(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS TABLE(
    customer_name text,
    customer_phone text,
    customer_email text,
    dob date,
    tags text,
    created_at timestamp with time zone,
    notes text,
    total_visits bigint,
    recent_bookings jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
SELECT
    c.customer_name,
    c.customer_phone,
    c.customer_email,
    c.dob,
    c.tags,
    c.created_at,
    c.notes,

    (
        SELECT COUNT(*)::bigint
        FROM app.bookings_for_business_transaction b
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
          AND b.customer_id = p_customer_id
          AND LOWER(TRIM(COALESCE(b.booking_status, ''))) = 'completed'
    ) AS total_visits,

    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'booking_id', recent.booking_id,
                    'booking_date', recent.booking_date,
                    'start_time', recent.start_time,
                    'service_name', recent.service_name,
                    'staff_name', recent.staff_name,
                    'final_amount', recent.final_amount,
                    'status', recent.booking_status
                )
                ORDER BY recent.booking_date DESC, recent.start_time DESC
            )
            FROM (
                SELECT
                    b.booking_id,
                    b.booking_date,
                    b.start_time,
                    b.service_name,
                    b.staff_name,
                    b.final_amount,
                    b.booking_status
                FROM app.bookings_for_business_transaction b
                WHERE b.company_id = p_company_id
                  AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                  AND b.customer_id = p_customer_id
                ORDER BY
                    b.booking_date DESC,
                    b.start_time DESC
                LIMIT 5
            ) recent
        ),
        '[]'::jsonb
    ) AS recent_bookings

FROM app.customers c
WHERE c.company_id = p_company_id
  AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
  AND c.customer_id = p_customer_id
LIMIT 1;
$$;

-- Case-insensitive wrapper
CREATE OR REPLACE FUNCTION public.global_customer_profile_modal(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS TABLE(
    customer_name text,
    customer_phone text,
    customer_email text,
    dob date,
    tags text,
    created_at timestamp with time zone,
    notes text,
    total_visits bigint,
    recent_bookings jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT * FROM public."Global_customer_profile_modal"(p_company_id, p_branch_id, p_customer_id);
$$;

CREATE OR REPLACE FUNCTION app.global_customer_profile_modal(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS TABLE(
    customer_name text,
    customer_phone text,
    customer_email text,
    dob date,
    tags text,
    created_at timestamp with time zone,
    notes text,
    total_visits bigint,
    recent_bookings jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT * FROM public."Global_customer_profile_modal"(p_company_id, p_branch_id, p_customer_id);
$$;

CREATE OR REPLACE FUNCTION public.customers_page_clickable_total_spent(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS TABLE(
    services_total numeric,
    products_total numeric,
    memberships_total numeric,
    grand_total numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
WITH booking_transactions AS (
    SELECT
        booking_id,
        SUM(
            CASE
                WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                    THEN -ABS(COALESCE(final_amount, 0))
                ELSE
                    ABS(COALESCE(final_amount, 0))
            END
        ) AS net_amount
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND customer_id = p_customer_id
      AND (
          LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
          OR LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
      )
    GROUP BY booking_id
),

sales_transactions AS (
    SELECT
        sale_id,
        SUM(
            CASE
                WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                    THEN -ABS(COALESCE(final_amount, 0))
                ELSE
                    ABS(COALESCE(final_amount, 0))
            END
        ) AS net_amount
    FROM app.sales_for_business_transactions
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND customer_id = p_customer_id
      AND payment_status IN ('paid', 'refunded')
    GROUP BY sale_id
),

membership_transactions AS (
    SELECT
        purchase_id,
        SUM(
            CASE
                WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                    THEN -ABS(COALESCE(final_amount, 0))
                ELSE
                    ABS(COALESCE(final_amount, 0))
            END
        ) AS net_amount
    FROM app.membership_purchases
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND customer_id = p_customer_id
      AND (
          status IN ('active', 'expired')
          OR LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
      )
    GROUP BY purchase_id
),

totals AS (
    SELECT
        COALESCE((
            SELECT SUM(net_amount)
            FROM booking_transactions
            WHERE net_amount > 0
        ), 0) AS services_total,

        COALESCE((
            SELECT SUM(net_amount)
            FROM sales_transactions
            WHERE net_amount > 0
        ), 0) AS products_total,

        COALESCE((
            SELECT SUM(net_amount)
            FROM membership_transactions
            WHERE net_amount > 0
        ), 0) AS memberships_total
)

SELECT
    services_total,
    products_total,
    memberships_total,
    services_total
        + products_total
        + memberships_total AS grand_total
FROM totals;
$$;

CREATE OR REPLACE FUNCTION app.customers_page_clickable_total_spent(
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid
)
RETURNS TABLE(
    services_total numeric,
    products_total numeric,
    memberships_total numeric,
    grand_total numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = app, shared, platform, public, pg_temp
AS $$
    SELECT * FROM public.customers_page_clickable_total_spent(p_company_id, p_branch_id, p_customer_id);
$$;

GRANT EXECUTE ON FUNCTION public."Global_customer_profile_modal"(uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.global_customer_profile_modal(uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.global_customer_profile_modal(uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customers_page_clickable_total_spent(uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.customers_page_clickable_total_spent(uuid, uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

