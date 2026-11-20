-- =============================================================================
-- Migration: 20261120000001_get_bookings_report.sql
-- Module   : Module 15 - Reports & Analytics (Bookings Report & 5 Sub-Reports)
-- Standards: Two-Tier Architecture Standard
--            - Section 1: Pre-flight security gates (company, tenant, branch, sub)
--            - Section 2: Core single-table business logic (app.bookings_for_business_transaction)
--            - Revoke PUBLIC, Grant authenticated + service_role
-- Sub-Reports Powered:
--   1. Total Bookings (bk-total)
--   2. Completed Bookings & Revenue (bk-completed)
--   3. Cancelled Bookings (bk-cancelled)
--   4. No-Show Bookings (bk-no-shows)
--   5. Refunded Bookings (bk-refunds)
-- =============================================================================

-- Drop existing functions to allow clean signature definition
DROP FUNCTION IF EXISTS public.get_bookings_report(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS app.get_bookings_report(uuid, uuid, date, date);

-- =============================================================================
-- 1. Tier 1: Core Engine in `app` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_bookings_report(
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
    v_start_date             date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end_date               date := COALESCE(p_end_date, CURRENT_DATE);
    v_temp_date              date;

    v_total_bookings         bigint := 0;
    v_total_bookings_all     bigint := 0;
    v_completed_bookings     bigint := 0;
    v_cancelled_bookings     bigint := 0;
    v_no_show_bookings       bigint := 0;
    v_refunded_bookings      bigint := 0;

    v_completed_revenue      numeric := 0;
    v_avg_completed_revenue  numeric := 0;
    v_completion_rate        numeric := 0;

    v_cancelled_value        numeric := 0;
    v_cancellation_rate      numeric := 0;
    v_same_day_cancellations bigint := 0;

    v_no_show_value          numeric := 0;
    v_no_show_rate           numeric := 0;
    v_same_day_no_shows      bigint := 0;
    v_repeat_no_shows        bigint := 0;

    v_total_refunded         numeric := 0;
    v_avg_refund             numeric := 0;
    v_refund_rate            numeric := 0;

    v_total_rows             jsonb := '[]'::jsonb;
    v_completed_rows         jsonb := '[]'::jsonb;
    v_cancelled_rows         jsonb := '[]'::jsonb;
    v_no_show_rows           jsonb := '[]'::jsonb;
    v_refund_rows            jsonb := '[]'::jsonb;

    v_result                 jsonb;
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
    -- SECTION 2: SINGLE-TABLE BUSINESS LOGIC (app.bookings_for_business_transaction)
    -- =========================================================================

    -- Step 2.1: Master Booking Counts, Revenue, and Financial Impact
    SELECT
        -- Total bookings: all booking statuses except booking_status = 'refunded'
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(COALESCE(booking_status, ''))) != 'refunded'
        ),
        -- Total bookings all: including refunded (for global refund rate denominator)
        COUNT(DISTINCT booking_id),
        -- Completed bookings: status = 'completed' AND payment_status = 'paid'
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(booking_status)) = 'completed'
              AND LOWER(TRIM(payment_status)) = 'paid'
        ),
        -- Cancelled bookings: status = 'cancelled'
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(booking_status)) = 'cancelled'
        ),
        -- No-show bookings: status in ('no-show', 'noshow', 'no_show')
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')
        ),
        -- Refunded bookings: payment_status = 'refunded' OR booking_status = 'refunded'
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(payment_status)) = 'refunded'
               OR LOWER(TRIM(booking_status)) = 'refunded'
        ),
        -- Completed Realized revenue: sum final_amount where completed & paid
        COALESCE(SUM(COALESCE(final_amount, total_price, 0)) FILTER (
            WHERE LOWER(TRIM(booking_status)) = 'completed'
              AND LOWER(TRIM(payment_status)) = 'paid'
        ), 0),
        -- Cancelled estimated value: sum total_price where cancelled
        COALESCE(SUM(COALESCE(total_price, final_amount, 0)) FILTER (
            WHERE LOWER(TRIM(booking_status)) = 'cancelled'
        ), 0),
        -- No-show estimated missed: sum total_price where no-show
        COALESCE(SUM(COALESCE(total_price, final_amount, 0)) FILTER (
            WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')
        ), 0),
        -- Same-day cancellations: cancelled where DATE(updated_at) = booking_date
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(booking_status)) = 'cancelled'
              AND DATE(updated_at) = booking_date
        ),
        -- Same-day no-shows: no-show where DATE(updated_at) = booking_date
        COUNT(DISTINCT booking_id) FILTER (
            WHERE LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')
              AND DATE(updated_at) = booking_date
        ),
        -- Total refunded amount: sum where payment_status = 'refunded' OR booking_status = 'refunded'
        COALESCE(SUM(COALESCE(final_amount, total_price, 0)) FILTER (
            WHERE LOWER(TRIM(payment_status)) = 'refunded'
               OR LOWER(TRIM(booking_status)) = 'refunded'
        ), 0)
    INTO
        v_total_bookings,
        v_total_bookings_all,
        v_completed_bookings,
        v_cancelled_bookings,
        v_no_show_bookings,
        v_refunded_bookings,
        v_completed_revenue,
        v_cancelled_value,
        v_no_show_value,
        v_same_day_cancellations,
        v_same_day_no_shows,
        v_total_refunded
    FROM app.bookings_for_business_transaction
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND booking_date BETWEEN v_start_date AND v_end_date;

    -- Step 2.2: Rates & Averages (Guarded against division by zero)
    v_completion_rate := CASE
        WHEN v_total_bookings > 0 THEN
            ROUND((v_completed_bookings::numeric / v_total_bookings) * 100, 1)
        ELSE 0
    END;

    v_avg_completed_revenue := CASE
        WHEN v_completed_bookings > 0 THEN
            ROUND(v_completed_revenue / v_completed_bookings, 2)
        ELSE 0
    END;

    v_cancellation_rate := CASE
        WHEN v_total_bookings > 0 THEN
            ROUND((v_cancelled_bookings::numeric / v_total_bookings) * 100, 1)
        ELSE 0
    END;

    v_no_show_rate := CASE
        WHEN v_total_bookings > 0 THEN
            ROUND((v_no_show_bookings::numeric / v_total_bookings) * 100, 1)
        ELSE 0
    END;

    v_avg_refund := CASE
        WHEN v_refunded_bookings > 0 THEN
            ROUND(v_total_refunded / v_refunded_bookings, 2)
        ELSE 0
    END;

    v_refund_rate := CASE
        WHEN v_total_bookings_all > 0 THEN
            ROUND((v_refunded_bookings::numeric / v_total_bookings_all) * 100, 1)
        ELSE 0
    END;

    -- Step 2.3: Repeat No-Show Customers count (customers with >= 2 no-shows in period)
    WITH customer_no_shows AS (
        SELECT customer_id, COUNT(DISTINCT booking_id) AS ns_count
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')
          AND customer_id IS NOT NULL
        GROUP BY customer_id
    )
    SELECT COALESCE(COUNT(*), 0)
    INTO v_repeat_no_shows
    FROM customer_no_shows
    WHERE ns_count >= 2;

    -- Step 2.4: Sub-Report 1 Rowset — All Bookings Table (all statuses)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'booking_id',     LEFT(b.booking_id::text, 8) || '...',
                'full_id',        b.booking_id::text,
                'date',           TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'raw_date',       b.booking_date::text,
                'time',           COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'datetime',       TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'customer',       COALESCE(b.customer_name, 'Unknown'),
                'customer_id',    COALESCE(b.customer_id::text, ''),
                'phone',          COALESCE(b.customer_phone, '-'),
                'service',        COALESCE(b.service_name, '-'),
                'staff',          COALESCE(b.staff_name, '-'),
                'amount',         COALESCE(b.final_amount, b.total_price, 0),
                'est_value',      COALESCE(b.total_price, b.final_amount, 0),
                'missed_value',   COALESCE(b.total_price, b.final_amount, 0),
                'reason',         COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'notes',          COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'method',         INITCAP(COALESCE(b.payment_status, '-')),
                'status',         COALESCE(b.booking_status, '-'),
                'payment_status', COALESCE(b.payment_status, '')
            )
            ORDER BY b.booking_date DESC, b.start_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_total_rows
    FROM (
        SELECT DISTINCT ON (booking_id)
            booking_id, booking_date, start_time, customer_name, customer_id, customer_phone,
            service_name, staff_name, final_amount, total_price, notes, booking_status, payment_status
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
        ORDER BY booking_id, booking_date DESC, start_time DESC
        LIMIT 500
    ) b;

    -- Step 2.5: Sub-Report 2 Rowset — Completed Bookings Table (completed & paid)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'booking_id',     LEFT(b.booking_id::text, 8) || '...',
                'full_id',        b.booking_id::text,
                'date',           TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'raw_date',       b.booking_date::text,
                'time',           COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'datetime',       TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'customer',       COALESCE(b.customer_name, 'Unknown'),
                'customer_id',    COALESCE(b.customer_id::text, ''),
                'phone',          COALESCE(b.customer_phone, '-'),
                'service',        COALESCE(b.service_name, '-'),
                'staff',          COALESCE(b.staff_name, '-'),
                'amount',         COALESCE(b.final_amount, b.total_price, 0),
                'status',         COALESCE(b.booking_status, 'completed'),
                'payment_status', INITCAP(COALESCE(b.payment_status, '-'))
            )
            ORDER BY b.booking_date DESC, b.start_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_completed_rows
    FROM (
        SELECT DISTINCT ON (booking_id)
            booking_id, booking_date, start_time, customer_name, customer_id, customer_phone,
            service_name, staff_name, final_amount, total_price, booking_status, payment_status
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(booking_status)) = 'completed'
          AND LOWER(TRIM(payment_status)) = 'paid'
        ORDER BY booking_id, booking_date DESC, start_time DESC
        LIMIT 500
    ) b;

    -- Step 2.6: Sub-Report 3 Rowset — Cancelled Bookings Table (cancelled)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'booking_id',     LEFT(b.booking_id::text, 8) || '...',
                'full_id',        b.booking_id::text,
                'date',           TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'raw_date',       b.booking_date::text,
                'time',           COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'datetime',       TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'customer',       COALESCE(b.customer_name, 'Unknown'),
                'customer_id',    COALESCE(b.customer_id::text, ''),
                'phone',          COALESCE(b.customer_phone, '-'),
                'service',        COALESCE(b.service_name, '-'),
                'staff',          COALESCE(b.staff_name, '-'),
                'amount',         COALESCE(b.total_price, b.final_amount, 0),
                'est_value',      COALESCE(b.total_price, b.final_amount, 0),
                'reason',         COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'notes',          COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'status',         'cancelled',
                'payment_status', COALESCE(b.payment_status, '')
            )
            ORDER BY b.booking_date DESC, b.start_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_cancelled_rows
    FROM (
        SELECT DISTINCT ON (booking_id)
            booking_id, booking_date, start_time, customer_name, customer_id, customer_phone,
            service_name, staff_name, total_price, final_amount, notes, booking_status, payment_status
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(booking_status)) = 'cancelled'
        ORDER BY booking_id, booking_date DESC, start_time DESC
        LIMIT 500
    ) b;

    -- Step 2.7: Sub-Report 4 Rowset — No-Show Bookings Table (no-show)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'booking_id',     LEFT(b.booking_id::text, 8) || '...',
                'full_id',        b.booking_id::text,
                'date',           TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'raw_date',       b.booking_date::text,
                'time',           COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'datetime',       TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'customer',       COALESCE(b.customer_name, 'Unknown'),
                'customer_id',    COALESCE(b.customer_id::text, ''),
                'phone',          COALESCE(b.customer_phone, '-'),
                'service',        COALESCE(b.service_name, '-'),
                'staff',          COALESCE(b.staff_name, '-'),
                'amount',         COALESCE(b.total_price, b.final_amount, 0),
                'missed_value',   COALESCE(b.total_price, b.final_amount, 0),
                'reason',         COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'notes',          COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'status',         'no-show',
                'payment_status', COALESCE(b.payment_status, '')
            )
            ORDER BY b.booking_date DESC, b.start_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_no_show_rows
    FROM (
        SELECT DISTINCT ON (booking_id)
            booking_id, booking_date, start_time, customer_name, customer_id, customer_phone,
            service_name, staff_name, total_price, final_amount, notes, booking_status, payment_status
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND LOWER(TRIM(booking_status)) IN ('no-show', 'noshow', 'no_show')
        ORDER BY booking_id, booking_date DESC, start_time DESC
        LIMIT 500
    ) b;

    -- Step 2.8: Sub-Report 5 Rowset — Refunded Bookings Table (refunded)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'refund_ref',     LEFT(b.booking_id::text, 8) || '...',
                'refund_date',    TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'booking_id',     LEFT(b.booking_id::text, 8) || '...',
                'full_id',        b.booking_id::text,
                'date',           TO_CHAR(b.booking_date, 'DD Mon YYYY'),
                'raw_date',       b.booking_date::text,
                'time',           COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'datetime',       TO_CHAR(b.booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(b.start_time, 'HH12:MI AM'), '-'),
                'customer',       COALESCE(b.customer_name, 'Unknown'),
                'customer_id',    COALESCE(b.customer_id::text, ''),
                'phone',          COALESCE(b.customer_phone, '-'),
                'service',        COALESCE(b.service_name, '-'),
                'staff',          COALESCE(b.staff_name, '-'),
                'method',         INITCAP(COALESCE(b.payment_status, '-')),
                'amount',         COALESCE(b.final_amount, b.total_price, 0),
                'notes',          COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'reason',         COALESCE(NULLIF(TRIM(b.notes), ''), 'Not specified'),
                'status',         'refunded',
                'payment_status', 'refunded'
            )
            ORDER BY b.booking_date DESC, b.start_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_refund_rows
    FROM (
        SELECT DISTINCT ON (booking_id)
            booking_id, booking_date, start_time, customer_name, customer_id, customer_phone,
            service_name, staff_name, final_amount, total_price, notes, booking_status, payment_status
        FROM app.bookings_for_business_transaction
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND booking_date BETWEEN v_start_date AND v_end_date
          AND (LOWER(TRIM(payment_status)) = 'refunded' OR LOWER(TRIM(booking_status)) = 'refunded')
        ORDER BY booking_id, booking_date DESC, start_time DESC
        LIMIT 500
    ) b;

    -- Step 2.9: Compile Canonical JSON Response
    v_result := jsonb_build_object(
        'stat_cards', jsonb_build_object(
            'total_bookings',           v_total_bookings,
            'completed_bookings',       v_completed_bookings,
            'cancelled_bookings',       v_cancelled_bookings,
            'no_show_bookings',         v_no_show_bookings,
            'realized_revenue',         v_completed_revenue,
            'estimated_value_affected', v_cancelled_value,
            'estimated_value_missed',   v_no_show_value,
            'refunded_bookings',        v_refunded_bookings,
            'total_refunded_amount',    v_total_refunded
        ),

        'bk_total', jsonb_build_object(
            'kpis', jsonb_build_object(
                'total_bookings',   v_total_bookings,
                'completed',        v_completed_bookings,
                'cancelled',        v_cancelled_bookings,
                'no_shows',         v_no_show_bookings,
                'realized_revenue', v_completed_revenue,
                'estimated_value',  v_cancelled_value,
                'estimated_missed', v_no_show_value
            ),
            'rows', COALESCE(v_total_rows, '[]'::jsonb)
        ),

        'bk_completed', jsonb_build_object(
            'kpis', jsonb_build_object(
                'completed_bookings',      v_completed_bookings,
                'completion_rate',         v_completion_rate,
                'completed_revenue',       v_completed_revenue,
                'avg_revenue_per_booking', v_avg_completed_revenue,
                'total_bookings',          v_total_bookings
            ),
            'rows', COALESCE(v_completed_rows, '[]'::jsonb)
        ),

        'bk_cancelled', jsonb_build_object(
            'kpis', jsonb_build_object(
                'cancelled_bookings',       v_cancelled_bookings,
                'cancellation_rate',        v_cancellation_rate,
                'estimated_value_affected', v_cancelled_value,
                'same_day_cancellations',   v_same_day_cancellations,
                'total_bookings',           v_total_bookings
            ),
            'rows', COALESCE(v_cancelled_rows, '[]'::jsonb)
        ),

        'bk_no_shows', jsonb_build_object(
            'kpis', jsonb_build_object(
                'no_show_bookings',         v_no_show_bookings,
                'estimated_value_missed',   v_no_show_value,
                'no_show_rate',             v_no_show_rate,
                'same_day_no_shows',        v_same_day_no_shows,
                'repeat_no_show_customers', v_repeat_no_shows,
                'total_bookings',           v_total_bookings
            ),
            'rows', COALESCE(v_no_show_rows, '[]'::jsonb)
        ),

        'bk_refunds', jsonb_build_object(
            'kpis', jsonb_build_object(
                'refunded_bookings', v_refunded_bookings,
                'total_refunded',    v_total_refunded,
                'avg_refund',        v_avg_refund,
                'refund_rate',       v_refund_rate,
                'total_bookings',    v_total_bookings_all
            ),
            'rows', COALESCE(v_refund_rows, '[]'::jsonb)
        )
    );

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 2. Tier 2: Public Thin Wrapper in `public` Schema
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_bookings_report(
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_company_id  uuid DEFAULT NULL::uuid,
    p_start_date  date DEFAULT NULL::date,
    p_end_date    date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN app.get_bookings_report(
        p_company_id := p_company_id,
        p_branch_id  := p_branch_id,
        p_start_date := p_start_date,
        p_end_date   := p_end_date
    );
END;
$$;

-- =============================================================================
-- 3. ACL Lockdown
-- =============================================================================
REVOKE ALL ON FUNCTION app.get_bookings_report(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bookings_report(uuid, uuid, date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_bookings_report(uuid, uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bookings_report(uuid, uuid, date, date) TO authenticated, service_role;
