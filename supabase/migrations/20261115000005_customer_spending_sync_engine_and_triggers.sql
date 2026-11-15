-- =============================================================================
-- Migration: 20261115000005_customer_spending_sync_engine_and_triggers.sql
-- Function A: customers_table_update_total_spent_and_last_visit
-- 6 Dedicated Triggers:
--   1. trigger_update_total_spent_bookings_paid
--   2. trigger_update_total_spent_bookings_refund
--   3. trigger_update_total_spent_pos_paid
--   4. trigger_update_total_spent_pos_refund
--   5. trigger_update_total_spent_memberships_paid
--   6. trigger_update_total_spent_memberships_refund
-- =============================================================================

-- ── 1. Function A: Customer Stats Recalculation Engine ────────────────────────
CREATE OR REPLACE FUNCTION app.customers_table_update_total_spent_and_last_visit(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
DECLARE
    v_customer_rec       app.customers%ROWTYPE;
    v_services_total     numeric := 0;
    v_products_total     numeric := 0;
    v_memberships_total  numeric := 0;
    v_total_spent        numeric := 0;
    v_last_visit         date := NULL;
    v_latest_booking     date := NULL;
    v_latest_pos         date := NULL;
    v_latest_memb        date := NULL;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY & PRECONDITIONS (Integrity & Concurrency Lock)
    -- =========================================================================

    -- Step 1.1: Mandatory parameter validation
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    -- Step 1.2 & 1.3: Customer existence verification + Pessimistic Row Lock
    SELECT * INTO v_customer_rec
    FROM app.customers
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN; -- Customer record does not exist or was purged
    END IF;

    -- =========================================================================
    -- SECTION 2: CORE LOGIC IMPLEMENTATION (Sequential Atomic Ledgers)
    -- =========================================================================

    -- Step 2.1: Services Spending (Bookings Ledger)
    SELECT COALESCE(SUM(
        CASE 
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded' 
                THEN -ABS(COALESCE(final_amount, total_price, 0))
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                 OR LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
                THEN ABS(COALESCE(final_amount, total_price, 0))
            ELSE 0
        END
    ), 0)
    INTO v_services_total
    FROM app.bookings_for_business_transaction
    WHERE customer_id = p_customer_id
      AND (
          LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded')
          OR LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed'
      );

    IF v_services_total < 0 THEN
        v_services_total := 0;
    END IF;

    -- Step 2.2: Products Spending (POS Ledger)
    SELECT COALESCE(SUM(
        CASE 
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded' 
                THEN -ABS(COALESCE(final_amount, total_price, 0))
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                THEN ABS(COALESCE(final_amount, total_price, 0))
            ELSE 0
        END
    ), 0)
    INTO v_products_total
    FROM app.sales_for_business_transactions
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded');

    IF v_products_total < 0 THEN
        v_products_total := 0;
    END IF;

    -- Step 2.3: Memberships Spending
    SELECT COALESCE(SUM(
        CASE 
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded' 
                THEN -ABS(COALESCE(final_amount, price, 0))
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid'
                 OR status IN ('active', 'expired')
                THEN ABS(COALESCE(final_amount, price, 0))
            ELSE 0
        END
    ), 0)
    INTO v_memberships_total
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND (
          LOWER(TRIM(COALESCE(payment_status, ''))) IN ('paid', 'refunded')
          OR status IN ('active', 'expired')
      );

    IF v_memberships_total < 0 THEN
        v_memberships_total := 0;
    END IF;

    v_total_spent := v_services_total + v_products_total + v_memberships_total;

    -- Step 2.4: True In-Salon Visit Calculation (Across all 3 streams)
    SELECT MAX(booking_date)::DATE
    INTO v_latest_booking
    FROM app.bookings_for_business_transaction
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(booking_status, ''))) = 'completed';

    SELECT MAX(created_at::DATE)
    INTO v_latest_pos
    FROM app.sales_for_business_transactions
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid';

    SELECT MAX(purchase_date)::DATE
    INTO v_latest_memb
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND LOWER(TRIM(COALESCE(payment_status, ''))) = 'paid';

    SELECT MAX(d) INTO v_last_visit
    FROM (
        SELECT v_latest_booking AS d
        UNION ALL
        SELECT v_latest_pos AS d
        UNION ALL
        SELECT v_latest_memb AS d
    ) s
    WHERE d IS NOT NULL;

    -- Step 2.5: Atomic Update to app.customers
    UPDATE app.customers
    SET
        total_spent = v_total_spent,
        last_visit  = v_last_visit,
        updated_at  = NOW()
    WHERE customer_id = p_customer_id;
END;
$$;

-- Backward-compatibility forwarder for app.recalculate_customer_stats
CREATE OR REPLACE FUNCTION app.recalculate_customer_stats(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM app.customers_table_update_total_spent_and_last_visit(p_customer_id);
END;
$$;

-- ── 2. Unified Trigger Handler Function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_trigger_customer_spending_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'shared', 'platform', 'public', 'pg_temp'
AS $$
DECLARE
    v_target_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_target_id := OLD.customer_id;
    ELSE
        v_target_id := NEW.customer_id;
    END IF;

    IF v_target_id IS NOT NULL THEN
        PERFORM app.customers_table_update_total_spent_and_last_visit(v_target_id);
    END IF;

    -- If customer_id changed during an UPDATE, re-sync both old and new customer
    IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
        PERFORM app.customers_table_update_total_spent_and_last_visit(OLD.customer_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- ── 3. Drop any legacy/conflicting triggers ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_customer_stats_bookings ON app.bookings_for_business_transaction;
DROP TRIGGER IF EXISTS trg_sync_customer_stats_sales ON app.sales_for_business_transactions;
DROP TRIGGER IF EXISTS trg_sync_customer_stats_memberships ON app.membership_purchases;
DROP TRIGGER IF EXISTS trg_update_customer_stats_on_complete ON app.bookings_for_business_transaction;

-- ── 4. Create the 6 Named Triggers ──────────────────────────────────────────

-- Trigger 1: Bookings Paid (UPDATE)
DROP TRIGGER IF EXISTS trigger_update_total_spent_bookings_paid ON app.bookings_for_business_transaction;
CREATE TRIGGER trigger_update_total_spent_bookings_paid
AFTER INSERT OR UPDATE OF payment_status ON app.bookings_for_business_transaction
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- Trigger 2: Bookings Refund (UPDATE)
DROP TRIGGER IF EXISTS trigger_update_total_spent_bookings_refund ON app.bookings_for_business_transaction;
CREATE TRIGGER trigger_update_total_spent_bookings_refund
AFTER UPDATE OF payment_status ON app.bookings_for_business_transaction
FOR EACH ROW
WHEN (NEW.payment_status = 'refunded')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- Trigger 3: POS Paid (INSERT)
DROP TRIGGER IF EXISTS trigger_update_total_spent_pos_paid ON app.sales_for_business_transactions;
CREATE TRIGGER trigger_update_total_spent_pos_paid
AFTER INSERT ON app.sales_for_business_transactions
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- Trigger 4: POS Refund (INSERT)
DROP TRIGGER IF EXISTS trigger_update_total_spent_pos_refund ON app.sales_for_business_transactions;
CREATE TRIGGER trigger_update_total_spent_pos_refund
AFTER INSERT ON app.sales_for_business_transactions
FOR EACH ROW
WHEN (NEW.payment_status = 'refunded')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- Trigger 5: Memberships Paid (INSERT)
DROP TRIGGER IF EXISTS trigger_update_total_spent_memberships_paid ON app.membership_purchases;
CREATE TRIGGER trigger_update_total_spent_memberships_paid
AFTER INSERT ON app.membership_purchases
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- Trigger 6: Memberships Refund (UPDATE)
DROP TRIGGER IF EXISTS trigger_update_total_spent_memberships_refund ON app.membership_purchases;
CREATE TRIGGER trigger_update_total_spent_memberships_refund
AFTER UPDATE OF payment_status ON app.membership_purchases
FOR EACH ROW
WHEN (NEW.payment_status = 'refunded')
EXECUTE FUNCTION app.fn_trigger_customer_spending_sync();

-- ── 5. ACL Security Lockdown ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.customers_table_update_total_spent_and_last_visit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.customers_table_update_total_spent_and_last_visit(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.recalculate_customer_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.recalculate_customer_stats(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.fn_trigger_customer_spending_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.fn_trigger_customer_spending_sync() TO authenticated, service_role;

