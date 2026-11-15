-- =============================================================================
-- Migration: 20261115000007_harden_global_customer_profile_modal.sql
-- Module: Customers Module (RPC 6 of 6 - Final RPC)
-- Target: app.global_customer_profile_modal & public API wrappers
-- Architecture: Two-Tier (Section 1: Security & Preconditions, Section 2: Core Logic)
-- =============================================================================

-- Drop legacy functions to ensure clean signature and binding
DROP FUNCTION IF EXISTS public."Global_customer_profile_modal"(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.global_customer_profile_modal(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.global_customer_profile_modal(uuid, uuid, uuid);

-- ── 1. Canonical Core Implementation in app Schema ───────────────────────────
CREATE OR REPLACE FUNCTION app.global_customer_profile_modal(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
    customer_name   text,
    customer_phone  text,
    customer_email  text,
    dob             date,
    tags            text,
    created_at      timestamp with time zone,
    notes           text,
    total_visits    bigint,
    recent_bookings jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
    -- =========================================================================

    -- Step 1.1: Mandatory identifier NULL guards
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'Company ID is required' USING ERRCODE = 'P0001';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID is required' USING ERRCODE = 'P0001';
    END IF;

    -- Step 1.2: Strict Tenant isolation check
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- Step 1.3: Active subscription check
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission check (Customers Management)
    PERFORM shared.check_permission(p_company_id, 'customers_management');

    -- Step 1.5: Customer existence & soft-delete guard within this company
    IF NOT EXISTS (
        SELECT 1 FROM app.customers
        WHERE company_id = p_company_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND customer_id = p_customer_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0001';
    END IF;

    -- =========================================================================
    -- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
    -- =========================================================================

    RETURN QUERY
    SELECT
        c.customer_name,
        c.customer_phone,
        c.customer_email,
        c.dob,
        c.tags,
        c.created_at,
        c.notes,

        -- Step 2.1: Total distinct visit days across all 3 streams (Physical Footfall - Method 1)
        (
            SELECT COUNT(DISTINCT visit_date)::bigint
            FROM (
                -- 1. Completed Bookings
                SELECT b.booking_date::date AS visit_date
                FROM app.bookings_for_business_transaction b
                WHERE b.company_id = p_company_id
                  AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                  AND b.customer_id = p_customer_id
                  AND LOWER(TRIM(COALESCE(b.booking_status, ''))) = 'completed'
                  AND b.booking_date IS NOT NULL

                UNION ALL

                -- 2. Paid POS Sales (counter walk-in visits)
                SELECT s.created_at::date AS visit_date
                FROM app.sales_for_business_transactions s
                WHERE s.company_id = p_company_id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.customer_id = p_customer_id
                  AND LOWER(TRIM(COALESCE(s.payment_status, ''))) = 'paid'
                  AND s.created_at IS NOT NULL

                UNION ALL

                -- 3. Paid Membership Purchases
                SELECT m.purchase_date::date AS visit_date
                FROM app.membership_purchases m
                WHERE m.company_id = p_company_id
                  AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
                  AND m.customer_id = p_customer_id
                  AND LOWER(TRIM(COALESCE(m.payment_status, ''))) = 'paid'
                  AND m.purchase_date IS NOT NULL
            ) all_visits
        ) AS total_visits,

        -- Step 2.2: 5 Most recent bookings JSON (with both booking_status and status keys)
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
                        'booking_status', recent.booking_status,
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
      AND c.status != 'deleted'
    LIMIT 1;
END;
$$;

-- ── 2. Public API Wrappers ───────────────────────────────────────────────────

-- Canonical lowercase wrapper
CREATE OR REPLACE FUNCTION public.global_customer_profile_modal(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
    customer_name   text,
    customer_phone  text,
    customer_email  text,
    dob             date,
    tags            text,
    created_at      timestamp with time zone,
    notes           text,
    total_visits    bigint,
    recent_bookings jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.global_customer_profile_modal(
        p_company_id  => p_company_id,
        p_branch_id   => p_branch_id,
        p_customer_id => p_customer_id
    );
END;
$$;

-- Cased wrapper matching frontend scripts/global-customer-profile-modal.js:77
CREATE OR REPLACE FUNCTION public."Global_customer_profile_modal"(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL::uuid,
    p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
    customer_name   text,
    customer_phone  text,
    customer_email  text,
    dob             date,
    tags            text,
    created_at      timestamp with time zone,
    notes           text,
    total_visits    bigint,
    recent_bookings jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.global_customer_profile_modal(
        p_company_id  => p_company_id,
        p_branch_id   => p_branch_id,
        p_customer_id => p_customer_id
    );
END;
$$;

-- ── 3. ACL Security Lockdown ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.global_customer_profile_modal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.global_customer_profile_modal(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.global_customer_profile_modal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.global_customer_profile_modal(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public."Global_customer_profile_modal"(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public."Global_customer_profile_modal"(uuid, uuid, uuid) TO authenticated, service_role;

