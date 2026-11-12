-- Migration: 20261112000003_sync_customer_total_spent_trigger.sql
-- Description: Establishes transactional single source of truth for customer total_spent and last_visit.
-- Ensures app.customers.total_spent and last_visit are strictly derived and synchronized with:
--   1. app.bookings_for_business_transaction (services)
--   2. app.sales_for_business_transactions (products)
--   3. app.membership_purchases (memberships)
-- Automatically triggers on INSERT, UPDATE, DELETE to keep customers in sync at all times.

-- 1. Create the central recalculation function
CREATE OR REPLACE FUNCTION app.recalculate_customer_stats(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
    v_services_total NUMERIC(12,2) := 0;
    v_products_total NUMERIC(12,2) := 0;
    v_memberships_total NUMERIC(12,2) := 0;
    v_total_spent NUMERIC(12,2) := 0;
    v_last_visit DATE := NULL;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Services: Completed bookings (net of refunds)
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

    -- 2. Products: Sales for business transactions
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

    -- 3. Memberships: Membership purchases
    SELECT COALESCE(SUM(
        CASE
            WHEN LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
                THEN -ABS(COALESCE(final_amount, price, 0))
            ELSE
                ABS(COALESCE(final_amount, price, 0))
        END
    ), 0)
    INTO v_memberships_total
    FROM app.membership_purchases
    WHERE customer_id = p_customer_id
      AND (
          status IN ('active', 'expired')
          OR LOWER(TRIM(COALESCE(payment_status, ''))) = 'refunded'
      );

    IF v_memberships_total < 0 THEN
        v_memberships_total := 0;
    END IF;

    v_total_spent := v_services_total + v_products_total + v_memberships_total;

    -- 4. Last visit: MAX booking_date of completed bookings
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION app.recalculate_customer_stats(UUID) TO authenticated, service_role, anon;

-- 2. Create the unified trigger function
CREATE OR REPLACE FUNCTION app.fn_sync_customer_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.customer_id IS NOT NULL THEN
            PERFORM app.recalculate_customer_stats(OLD.customer_id);
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If customer_id changed, recalculate both old and new
        IF OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.customer_id IS NOT NULL THEN
            PERFORM app.recalculate_customer_stats(OLD.customer_id);
        END IF;
        IF NEW.customer_id IS NOT NULL THEN
            PERFORM app.recalculate_customer_stats(NEW.customer_id);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.customer_id IS NOT NULL THEN
            PERFORM app.recalculate_customer_stats(NEW.customer_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION app.fn_sync_customer_stats_trigger() TO authenticated, service_role, anon;

-- 3. Drop legacy trigger that only added without subtracting/handling deletes
DROP TRIGGER IF EXISTS trg_update_customer_stats_on_complete ON app.bookings_for_business_transaction;
DROP TRIGGER IF EXISTS trg_sync_customer_stats_bookings ON app.bookings_for_business_transaction;

-- 4. Create trigger on bookings_for_business_transaction
CREATE TRIGGER trg_sync_customer_stats_bookings
AFTER INSERT OR UPDATE OR DELETE ON app.bookings_for_business_transaction
FOR EACH ROW EXECUTE FUNCTION app.fn_sync_customer_stats_trigger();

-- 5. Create trigger on sales_for_business_transactions
DROP TRIGGER IF EXISTS trg_sync_customer_stats_sales ON app.sales_for_business_transactions;
CREATE TRIGGER trg_sync_customer_stats_sales
AFTER INSERT OR UPDATE OR DELETE ON app.sales_for_business_transactions
FOR EACH ROW EXECUTE FUNCTION app.fn_sync_customer_stats_trigger();

-- 6. Create trigger on membership_purchases
DROP TRIGGER IF EXISTS trg_sync_customer_stats_memberships ON app.membership_purchases;
CREATE TRIGGER trg_sync_customer_stats_memberships
AFTER INSERT OR UPDATE OR DELETE ON app.membership_purchases
FOR EACH ROW EXECUTE FUNCTION app.fn_sync_customer_stats_trigger();

-- 7. Run initial sync for all existing customers
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT customer_id FROM app.customers LOOP
        PERFORM app.recalculate_customer_stats(r.customer_id);
    END LOOP;
END $$;

