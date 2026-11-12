-- Migration: 20261112000009_membership_cancellation_and_refund.sql
-- Description: 
--   1. Add cancellation and refund tracking columns to app.membership_purchases.
--   2. Update app.cancel_membership_atomic to update app.membership_purchases ONLY (no financial ledger write).
--   3. Update app.process_membership_refund_atomic to enforce full refunds and atomically record financial ledger and purchase update.
--   4. Update app.recalculate_customer_stats to accurately track paid (non-refunded) memberships.

-- ── 1. Schema Alteration: Add Tracking Columns to app.membership_purchases ───
ALTER TABLE app.membership_purchases
    ADD COLUMN IF NOT EXISTS cancelled_by_user_id   uuid,
    ADD COLUMN IF NOT EXISTS cancelled_by_user_name text,
    ADD COLUMN IF NOT EXISTS cancellation_reason    text,
    ADD COLUMN IF NOT EXISTS refunded_date          date,
    ADD COLUMN IF NOT EXISTS refunded_by_user_id    uuid,
    ADD COLUMN IF NOT EXISTS refunded_by_user_name  text,
    ADD COLUMN IF NOT EXISTS refund_reason          text,
    ADD COLUMN IF NOT EXISTS refund_amount          numeric;

-- Drop old function overloads cleanly
DROP FUNCTION IF EXISTS app.cancel_membership_atomic(uuid, uuid, uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_membership_atomic(uuid, uuid, uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.cancel_membership_atomic CASCADE;
DROP FUNCTION IF EXISTS public.cancel_membership_atomic CASCADE;

DROP FUNCTION IF EXISTS app.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.process_membership_refund_atomic CASCADE;
DROP FUNCTION IF EXISTS public.process_membership_refund_atomic CASCADE;

-- Refresh public view
CREATE OR REPLACE VIEW public.membership_purchases AS 
SELECT * FROM app.membership_purchases;

-- ── 2. Update app.recalculate_customer_stats ────────────────────────────────
CREATE OR REPLACE FUNCTION app.recalculate_customer_stats(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_services_total     numeric := 0;
    v_products_total     numeric := 0;
    v_memberships_total  numeric := 0;
    v_total_spent        numeric := 0;
    v_last_visit         date := NULL;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Services: Bookings ledger
    SELECT COALESCE(SUM(
        CASE 
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded' 
                THEN -ABS(COALESCE(final_amount, total_price, 0))
            ELSE 
                ABS(COALESCE(final_amount, total_price, 0))
        END
    ), 0)
    INTO v_services_total
    FROM app.bookings_for_business_transaction
    WHERE customer_id = p_customer_id
      AND (
          LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
          OR LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
      );

    IF v_services_total < 0 THEN
        v_services_total := 0;
    END IF;

    -- 2. Products: Sales ledger
    SELECT COALESCE(SUM(
        CASE 
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded' 
                THEN -ABS(COALESCE(final_amount, total_price, 0))
            ELSE 
                ABS(COALESCE(final_amount, total_price, 0))
        END
    ), 0)
    INTO v_products_total
    FROM app.sales_for_business_transactions
    WHERE customer_id = p_customer_id
      AND payment_status IN ('paid', 'refunded');

    IF v_products_total < 0 THEN
        v_products_total := 0;
    END IF;

    -- 3. Memberships: Only paid memberships that have not been refunded
    SELECT COALESCE(SUM(
        COALESCE(final_amount, price, 0)
    ), 0)
    INTO v_memberships_total
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid';

    IF v_memberships_total < 0 THEN
        v_memberships_total := 0;
    END IF;

    v_total_spent := v_services_total + v_products_total + v_memberships_total;

    -- 4. Last visit
    SELECT MAX(booking_date)::DATE
    INTO v_last_visit
    FROM app.bookings_for_business_transaction
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed';

    -- 5. Update app.customers
    UPDATE app.customers
    SET
        total_spent = v_total_spent,
        last_visit  = v_last_visit,
        updated_at  = NOW()
    WHERE customer_id = p_customer_id;
END;
$$;

-- ── 3. RPC: app.cancel_membership_atomic ─────────────────────────────────────
-- Pure operational state update — NO write to app.business_transactions
CREATE OR REPLACE FUNCTION app.cancel_membership_atomic(
    p_purchase_id            uuid,
    p_company_id             uuid,
    p_branch_id              uuid,
    p_notes                  text DEFAULT NULL,
    p_staff_id               uuid DEFAULT NULL,
    p_cancellation_reason    text DEFAULT NULL,
    p_cancelled_by_user_id   uuid DEFAULT NULL,
    p_cancelled_by_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_current_status    text;
    v_customer_id       uuid;
    v_customer_name     text;
    v_plan_name         text;
    v_final_amount      numeric;
    v_today             date := CURRENT_DATE;
    v_staff_id          uuid;
    v_staff_name        text;
    v_reason            text;
BEGIN
    -- 1. Tenant Access Verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- 2. Purchase Existence & Branch Ownership Check
    SELECT status, customer_id, customer_name, plan_name, final_amount
    INTO   v_current_status, v_customer_id, v_customer_name, v_plan_name, v_final_amount
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    LIMIT  1;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase not found or does not belong to this branch.');
    END IF;

    -- 3. State Machine Check: Only active memberships can be cancelled
    IF v_current_status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only active memberships can be cancelled. Current status: ' || v_current_status
        );
    END IF;

    -- 4. Authoritative Staff Resolution
    v_staff_id := COALESCE(p_cancelled_by_user_id, p_staff_id, auth.uid());
    v_staff_name := NULLIF(TRIM(COALESCE(p_cancelled_by_user_name, '')), '');
    IF v_staff_name IS NULL AND v_staff_id IS NOT NULL THEN
        SELECT TRIM(COALESCE(first_name || ' ' || COALESCE(last_name, ''), first_name, email, 'Staff'))
        INTO v_staff_name
        FROM shared.users
        WHERE id = v_staff_id
        LIMIT 1;
    END IF;

    -- 5. Cancellation Reason Resolution
    v_reason := COALESCE(NULLIF(TRIM(p_cancellation_reason), ''), NULLIF(TRIM(p_notes), ''), 'Customer Requested Cancellation');

    -- 6. Update app.membership_purchases ONLY (No financial transaction)
    UPDATE app.membership_purchases
    SET    status                 = 'cancelled',
           cancelled_date         = v_today,
           cancelled_by_user_id   = v_staff_id,
           cancelled_by_user_name = v_staff_name,
           cancellation_reason    = v_reason,
           notes                  = CASE 
                                      WHEN notes IS NOT NULL AND notes <> '' AND notes <> v_reason
                                      THEN notes || ' | Cancelled: ' || v_reason
                                      ELSE v_reason
                                    END,
           updated_at             = NOW()
    WHERE  purchase_id = p_purchase_id;

    RETURN jsonb_build_object(
        'success',                true,
        'purchase_id',            p_purchase_id,
        'customer_name',          v_customer_name,
        'plan_name',              v_plan_name,
        'status',                 'cancelled',
        'cancelled_date',         v_today,
        'cancelled_by_user_id',   v_staff_id,
        'cancelled_by_user_name', v_staff_name,
        'cancellation_reason',    v_reason
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Public PostgREST wrappers / aliases
CREATE OR REPLACE FUNCTION public.cancel_membership_atomic(
    p_purchase_id            uuid,
    p_company_id             uuid,
    p_branch_id              uuid,
    p_notes                  text DEFAULT NULL,
    p_staff_id               uuid DEFAULT NULL,
    p_cancellation_reason    text DEFAULT NULL,
    p_cancelled_by_user_id   uuid DEFAULT NULL,
    p_cancelled_by_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.cancel_membership_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_notes,
        p_staff_id,
        p_cancellation_reason,
        p_cancelled_by_user_id,
        p_cancelled_by_user_name
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_membership(
    p_purchase_id            uuid,
    p_company_id             uuid,
    p_branch_id              uuid,
    p_notes                  text DEFAULT NULL,
    p_staff_id               uuid DEFAULT NULL,
    p_cancellation_reason    text DEFAULT NULL,
    p_cancelled_by_user_id   uuid DEFAULT NULL,
    p_cancelled_by_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.cancel_membership_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_notes,
        p_staff_id,
        p_cancellation_reason,
        p_cancelled_by_user_id,
        p_cancelled_by_user_name
    );
END;
$$;

-- ── 4. RPC: app.process_membership_refund_atomic ─────────────────────────────
-- Financial Refund — Enforces full refund only, writes to business_transactions & updates membership_purchases
CREATE OR REPLACE FUNCTION app.process_membership_refund_atomic(
    p_purchase_id           uuid,
    p_company_id            uuid,
    p_branch_id             uuid,
    p_refund_amount         numeric DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_refund_reason         text    DEFAULT 'Customer Requested Refund',
    p_staff_id              uuid    DEFAULT NULL,
    p_refunded_by_user_id   uuid    DEFAULT NULL,
    p_refunded_by_user_name text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_customer_id       uuid;
    v_customer_name     text;
    v_plan_name         text;
    v_purchase_status   text;
    v_payment_status    text;
    v_final_amount      numeric;
    v_price             numeric;
    v_payment_method    text;
    v_payment_id        uuid;
    v_actual_price      numeric;
    v_refund_amount     numeric;
    v_staff_id          uuid;
    v_staff_name        text;
    v_reason            text;
BEGIN
    -- 1. Tenant Access Verification
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);

    -- 2. Purchase Existence & Verification
    SELECT customer_id, customer_name, plan_name, status, payment_status, final_amount, price
    INTO   v_customer_id, v_customer_name, v_plan_name, v_purchase_status, v_payment_status, v_final_amount, v_price
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    LIMIT  1;

    IF v_customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase not found or does not belong to this branch.');
    END IF;

    -- 3. State Machine: Must already be cancelled
    IF v_purchase_status <> 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only cancelled memberships can be refunded. Current status: ' || v_purchase_status
        );
    END IF;

    -- 4. Check already refunded
    IF v_payment_status = 'refunded' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This membership has already been refunded.');
    END IF;

    -- 5. Full Refund Only Enforcement
    v_actual_price := COALESCE(v_final_amount, v_price, 0);
    IF v_actual_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membership purchase amount must be greater than zero to refund.');
    END IF;

    IF p_refund_amount IS NOT NULL AND p_refund_amount <> v_actual_price THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only full refund of ₹' || v_actual_price || ' is allowed.'
        );
    END IF;

    v_refund_amount := v_actual_price;

    -- 6. Payment Method Normalization
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'upi', 'card') THEN
        v_payment_method := 'cash';
    END IF;

    -- 7. Authoritative Staff Resolution
    v_staff_id := COALESCE(p_refunded_by_user_id, p_staff_id, auth.uid());
    v_staff_name := NULLIF(TRIM(COALESCE(p_refunded_by_user_name, '')), '');
    IF v_staff_name IS NULL AND v_staff_id IS NOT NULL THEN
        SELECT TRIM(COALESCE(first_name || ' ' || COALESCE(last_name, ''), first_name, email, 'Staff'))
        INTO v_staff_name
        FROM shared.users
        WHERE id = v_staff_id
        LIMIT 1;
    END IF;

    v_reason := COALESCE(NULLIF(TRIM(p_refund_reason), ''), 'Customer Requested Refund');

    -- 8. Atomic Write 1: Financial Ledger (app.business_transactions)
    INSERT INTO app.business_transactions (
        company_id, branch_id,
        reference_id, reference_type,
        amount, final_amount, currency,
        payment_method, status, notes,
        created_by, created_by_user_name,
        paid_at, created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id,
        p_purchase_id, 'membership',
        v_refund_amount, v_refund_amount, 'INR',
        v_payment_method, 'refunded',
        COALESCE('Membership Refund: ' || v_plan_name || ' - ' || v_reason, 'Membership Refund'),
        v_staff_id, v_staff_name,
        NOW(), NOW(), NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- 9. Atomic Write 2: Update app.membership_purchases
    UPDATE app.membership_purchases
    SET    status                = 'refunded',
           payment_status        = 'refunded',
           refunded_date         = CURRENT_DATE,
           refund_amount         = v_refund_amount,
           refunded_by_user_id   = v_staff_id,
           refunded_by_user_name = v_staff_name,
           refund_reason         = v_reason,
           notes                 = CASE
                                       WHEN notes IS NOT NULL AND notes <> ''
                                       THEN notes || ' | Refund: ' || v_reason
                                       ELSE 'Refund: ' || v_reason
                                   END,
           updated_at            = NOW()
    WHERE  purchase_id = p_purchase_id;

    RETURN jsonb_build_object(
        'success',                true,
        'purchase_id',            p_purchase_id,
        'payment_id',             v_payment_id,
        'customer_name',          v_customer_name,
        'plan_name',              v_plan_name,
        'status',                 'refunded',
        'payment_status',         'refunded',
        'refund_amount',          v_refund_amount,
        'refunded_date',          CURRENT_DATE,
        'refunded_by_user_id',    v_staff_id,
        'refunded_by_user_name',  v_staff_name,
        'refund_reason',          v_reason
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Public PostgREST wrapper for process_membership_refund_atomic
CREATE OR REPLACE FUNCTION public.process_membership_refund_atomic(
    p_purchase_id           uuid,
    p_company_id            uuid,
    p_branch_id             uuid,
    p_refund_amount         numeric DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_refund_reason         text    DEFAULT 'Customer Requested Refund',
    p_staff_id              uuid    DEFAULT NULL,
    p_refunded_by_user_id   uuid    DEFAULT NULL,
    p_refunded_by_user_name text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_membership_refund_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_refund_amount,
        p_payment_method,
        p_refund_reason,
        p_staff_id,
        p_refunded_by_user_id,
        p_refunded_by_user_name
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_membership_purchase(
    p_purchase_id           uuid,
    p_company_id            uuid,
    p_branch_id             uuid,
    p_refund_amount         numeric DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_refund_reason         text    DEFAULT 'Customer Requested Refund',
    p_staff_id              uuid    DEFAULT NULL,
    p_refunded_by_user_id   uuid    DEFAULT NULL,
    p_refunded_by_user_name text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_membership_refund_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_refund_amount,
        p_payment_method,
        p_refund_reason,
        p_staff_id,
        p_refunded_by_user_id,
        p_refunded_by_user_name
    );
END;
$$;

-- ── 5. Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION app.cancel_membership_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.cancel_membership_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.cancel_membership TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION app.process_membership_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_membership_refund_atomic TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.refund_membership_purchase TO authenticated, service_role, anon;
