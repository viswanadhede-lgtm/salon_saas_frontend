-- ============================================================================
-- RPC FUNCTION: public.get_bookings_report
-- Purpose:  Single round-trip master RPC for the Bookings parent report.
--           Returns hub stat cards + KPIs + table rows for all 5 sub-reports:
--           bk-total, bk-completed, bk-cancelled, bk-no-shows, bk-refunds.
-- Tables:   public.bookings
--           public.bookings_for_business_transaction  (view)
--           public.business_transactions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_bookings_report(
    p_branch_id  uuid DEFAULT NULL::uuid,
    p_company_id uuid DEFAULT NULL::uuid,
    p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_end_date   date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    -- Aggregate counts
    v_total_bookings         bigint  := 0;
    v_completed_bookings     bigint  := 0;
    v_cancelled_bookings     bigint  := 0;
    v_no_show_bookings       bigint  := 0;

    -- Completed sub-report
    v_completed_revenue      numeric := 0;
    v_avg_completed_revenue  numeric := 0;
    v_completion_rate        numeric := 0;

    -- Cancelled sub-report
    v_cancelled_value        numeric := 0;
    v_cancellation_rate      numeric := 0;
    v_same_day_cancellations bigint  := 0;

    -- No-show sub-report
    v_no_show_value          numeric := 0;
    v_no_show_rate           numeric := 0;
    v_repeat_no_shows        bigint  := 0;

    -- Refunds sub-report
    v_refunded_bookings      bigint  := 0;
    v_total_refunded         numeric := 0;
    v_avg_refund             numeric := 0;
    v_refund_rate            numeric := 0;

    -- Table row arrays
    v_total_rows             jsonb   := '[]'::jsonb;
    v_completed_rows         jsonb   := '[]'::jsonb;
    v_cancelled_rows         jsonb   := '[]'::jsonb;
    v_no_show_rows           jsonb   := '[]'::jsonb;
    v_refund_rows            jsonb   := '[]'::jsonb;

    v_result                 jsonb;
BEGIN

    -- =========================================================================
    -- 1. MASTER COUNTS (single scan of bookings table)
    -- =========================================================================
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'completed'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'cancelled'),
        COUNT(*) FILTER (WHERE LOWER(TRIM(status)) IN ('no-show', 'noshow', 'no_show'))
    INTO v_total_bookings, v_completed_bookings, v_cancelled_bookings, v_no_show_bookings
    FROM public.bookings
    WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date;

    -- =========================================================================
    -- 2. COMPLETED REVENUE (use view which carries post-discount final_amount)
    -- =========================================================================
    SELECT
        COALESCE(SUM(COALESCE(final_amount, total_price, 0)), 0),
        COALESCE(AVG(COALESCE(final_amount, total_price, 0)), 0)
    INTO v_completed_revenue, v_avg_completed_revenue
    FROM public.bookings_for_business_transaction
    WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date
      AND LOWER(TRIM(status)) = 'completed';

    v_completion_rate := CASE WHEN v_total_bookings > 0
        THEN ROUND((v_completed_bookings::numeric / v_total_bookings::numeric) * 100, 1)
        ELSE 0 END;

    -- =========================================================================
    -- 3. CANCELLED VALUE + SAME-DAY CANCELLATIONS
    --    Same-day proxy: updated_at date = booking_date
    -- =========================================================================
    SELECT
        COALESCE(SUM(COALESCE(price, 0)), 0),
        COUNT(*) FILTER (WHERE booking_date = updated_at::date)
    INTO v_cancelled_value, v_same_day_cancellations
    FROM public.bookings
    WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date
      AND LOWER(TRIM(status)) = 'cancelled';

    v_cancellation_rate := CASE WHEN v_total_bookings > 0
        THEN ROUND((v_cancelled_bookings::numeric / v_total_bookings::numeric) * 100, 1)
        ELSE 0 END;

    -- =========================================================================
    -- 4. NO-SHOW VALUE + REPEAT NO-SHOW CUSTOMERS (2+ no-shows in period)
    -- =========================================================================
    SELECT COALESCE(SUM(COALESCE(price, 0)), 0)
    INTO v_no_show_value
    FROM public.bookings
    WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND booking_date BETWEEN p_start_date AND p_end_date
      AND LOWER(TRIM(status)) IN ('no-show', 'noshow', 'no_show');

    v_no_show_rate := CASE WHEN v_total_bookings > 0
        THEN ROUND((v_no_show_bookings::numeric / v_total_bookings::numeric) * 100, 1)
        ELSE 0 END;

    SELECT COUNT(*) INTO v_repeat_no_shows
    FROM (
        SELECT customer_id
        FROM public.bookings
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(status)) IN ('no-show', 'noshow', 'no_show')
          AND customer_id IS NOT NULL
        GROUP BY customer_id
        HAVING COUNT(*) >= 2
    ) sub;

    -- =========================================================================
    -- 5. REFUNDS (from business_transactions, reference_type booking/service)
    -- =========================================================================
    SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(final_amount, amount, 0)), 0),
        COALESCE(AVG(COALESCE(final_amount, amount, 0)), 0)
    INTO v_refunded_bookings, v_total_refunded, v_avg_refund
    FROM public.business_transactions
    WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
      AND LOWER(TRIM(status)) = 'refunded'
      AND LOWER(TRIM(reference_type)) IN ('booking', 'service');

    v_refund_rate := CASE WHEN v_total_bookings > 0
        THEN ROUND((v_refunded_bookings::numeric / v_total_bookings::numeric) * 100, 1)
        ELSE 0 END;

    -- =========================================================================
    -- 6. TABLE ROWS: bk-total (all statuses, latest 200)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'date',           TO_CHAR(booking_date, 'DD Mon YYYY'),
            'time',           COALESCE(TO_CHAR(start_time, 'HH12:MI AM'), '-'),
            'customer',       COALESCE(customer_name, 'Unknown'),
            'customer_id',    COALESCE(customer_id::text, ''),
            'service',        COALESCE(service_name, '-'),
            'staff',          COALESCE(staff_name, '-'),
            'amount',         COALESCE(price, 0),
            'status',         COALESCE(status, '-'),
            'payment_status', COALESCE(payment_status, '')
        ) ORDER BY booking_date DESC, start_time DESC
    ), '[]'::jsonb)
    INTO v_total_rows
    FROM (
        SELECT booking_date, start_time, customer_name, customer_id, service_name, staff_name, price, status, payment_status
        FROM public.bookings
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
        ORDER BY booking_date DESC, start_time DESC
        LIMIT 200
    ) sub;

    -- =========================================================================
    -- 7. TABLE ROWS: bk-completed (view for post-discount final_amount)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'booking_id',     LEFT(COALESCE(booking_id::text, '-'), 8) || '...',
            'datetime',       TO_CHAR(booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(start_time, 'HH12:MI AM'), '-'),
            'customer',       COALESCE(customer_name, 'Unknown'),
            'service',        COALESCE(service_name, '-'),
            'staff',          COALESCE(staff_name, '-'),
            'amount',         COALESCE(final_amount, total_price, 0),
            'payment_status', INITCAP(COALESCE(payment_status, '-'))
        ) ORDER BY booking_date DESC, start_time DESC
    ), '[]'::jsonb)
    INTO v_completed_rows
    FROM (
        SELECT booking_id, booking_date, start_time, customer_name, service_name,
               staff_name, final_amount, total_price, payment_status
        FROM public.bookings_for_business_transaction
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(status)) = 'completed'
        ORDER BY booking_date DESC, start_time DESC
        LIMIT 200
    ) sub;

    -- =========================================================================
    -- 8. TABLE ROWS: bk-cancelled (notes as cancellation reason)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'booking_id', LEFT(COALESCE(booking_id::text, '-'), 8) || '...',
            'datetime',   TO_CHAR(booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(start_time, 'HH12:MI AM'), '-'),
            'customer',   COALESCE(customer_name, 'Unknown'),
            'service',    COALESCE(service_name, '-'),
            'staff',      COALESCE(staff_name, '-'),
            'est_value',  COALESCE(price, 0),
            'reason',     COALESCE(NULLIF(TRIM(notes), ''), 'Not specified')
        ) ORDER BY booking_date DESC
    ), '[]'::jsonb)
    INTO v_cancelled_rows
    FROM (
        SELECT booking_id, booking_date, start_time, customer_name, service_name, staff_name, price, notes
        FROM public.bookings
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(status)) = 'cancelled'
        ORDER BY booking_date DESC
        LIMIT 200
    ) sub;

    -- =========================================================================
    -- 9. TABLE ROWS: bk-no-shows
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'booking_id',   LEFT(COALESCE(booking_id::text, '-'), 8) || '...',
            'datetime',     TO_CHAR(booking_date, 'DD Mon YYYY') || ', ' || COALESCE(TO_CHAR(start_time, 'HH12:MI AM'), '-'),
            'customer',     COALESCE(customer_name, 'Unknown'),
            'phone',        COALESCE(customer_phone, '-'),
            'service',      COALESCE(service_name, '-'),
            'staff',        COALESCE(staff_name, '-'),
            'missed_value', COALESCE(price, 0)
        ) ORDER BY booking_date DESC
    ), '[]'::jsonb)
    INTO v_no_show_rows
    FROM (
        SELECT booking_id, booking_date, start_time, customer_name, customer_phone,
               service_name, staff_name, price
        FROM public.bookings
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND booking_date BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(status)) IN ('no-show', 'noshow', 'no_show')
        ORDER BY booking_date DESC
        LIMIT 200
    ) sub;

    -- =========================================================================
    -- 10. TABLE ROWS: bk-refunds (transactions joined to view for customer name)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'refund_ref',  LEFT(COALESCE(bt.payment_id::text, '-'), 8) || '...',
            'refund_date', TO_CHAR(DATE(COALESCE(bt.paid_at, bt.created_at)), 'DD Mon YYYY'),
            'booking_id',  LEFT(COALESCE(bt.reference_id::text, '-'), 8) || '...',
            'customer',    COALESCE(bv.customer_name, 'Unknown'),
            'method',      INITCAP(COALESCE(bt.payment_method, '-')),
            'amount',      COALESCE(bt.final_amount, bt.amount, 0),
            'notes',       COALESCE(NULLIF(TRIM(bt.notes), ''), 'Not specified')
        ) ORDER BY DATE(COALESCE(bt.paid_at, bt.created_at)) DESC
    ), '[]'::jsonb)
    INTO v_refund_rows
    FROM (
        SELECT payment_id, paid_at, created_at, reference_id, payment_method, final_amount, amount, notes
        FROM public.business_transactions
        WHERE (p_branch_id  IS NULL OR branch_id  = p_branch_id)
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND DATE(COALESCE(paid_at, created_at)) BETWEEN p_start_date AND p_end_date
          AND LOWER(TRIM(status)) = 'refunded'
          AND LOWER(TRIM(reference_type)) IN ('booking', 'service')
        ORDER BY DATE(COALESCE(paid_at, created_at)) DESC
        LIMIT 200
    ) bt
    LEFT JOIN public.bookings_for_business_transaction bv
           ON bv.booking_id = bt.reference_id
          AND (p_company_id IS NULL OR bv.company_id = p_company_id);

    -- =========================================================================
    -- 11. ASSEMBLE & RETURN
    -- =========================================================================
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
                'total_bookings', v_total_bookings,
                'completed',      v_completed_bookings,
                'cancelled',      v_cancelled_bookings,
                'no_shows',       v_no_show_bookings
            ),
            'rows', COALESCE(v_total_rows, '[]'::jsonb)
        ),

        'bk_completed', jsonb_build_object(
            'kpis', jsonb_build_object(
                'completed_bookings',      v_completed_bookings,
                'completion_rate',         v_completion_rate,
                'completed_revenue',       v_completed_revenue,
                'avg_revenue_per_booking', v_avg_completed_revenue
            ),
            'rows', COALESCE(v_completed_rows, '[]'::jsonb)
        ),

        'bk_cancelled', jsonb_build_object(
            'kpis', jsonb_build_object(
                'cancelled_bookings',       v_cancelled_bookings,
                'cancellation_rate',        v_cancellation_rate,
                'estimated_value_affected', v_cancelled_value,
                'same_day_cancellations',   v_same_day_cancellations
            ),
            'rows', COALESCE(v_cancelled_rows, '[]'::jsonb)
        ),

        'bk_no_shows', jsonb_build_object(
            'kpis', jsonb_build_object(
                'no_show_bookings',         v_no_show_bookings,
                'estimated_value_missed',   v_no_show_value,
                'no_show_rate',             v_no_show_rate,
                'repeat_no_show_customers', v_repeat_no_shows
            ),
            'rows', COALESCE(v_no_show_rows, '[]'::jsonb)
        ),

        'bk_refunds', jsonb_build_object(
            'kpis', jsonb_build_object(
                'refunded_bookings', v_refunded_bookings,
                'total_refunded',    v_total_refunded,
                'avg_refund',        v_avg_refund,
                'refund_rate',       v_refund_rate
            ),
            'rows', COALESCE(v_refund_rows, '[]'::jsonb)
        )
    );

    RETURN v_result;
END;
$function$;
