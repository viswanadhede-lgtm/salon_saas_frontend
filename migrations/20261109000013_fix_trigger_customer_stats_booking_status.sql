-- Migration: 20261109000013_fix_trigger_customer_stats_booking_status.sql
-- Problem: fn_update_customer_stats_on_complete uses NEW.status / OLD.status
--          but the column was renamed to booking_status in migration 00010.
--          This caused update_booking_status_atomic to crash when updating to 'completed'.
-- Fix: Replace NEW.status / OLD.status with NEW.booking_status / OLD.booking_status.

CREATE OR REPLACE FUNCTION fn_update_customer_stats_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when booking_status transitions TO 'completed'
  IF NEW.booking_status = 'completed' AND (OLD.booking_status IS DISTINCT FROM 'completed') THEN
    UPDATE app.customers
    SET
      total_spent = COALESCE(total_spent, 0) + COALESCE(NEW.final_amount, NEW.total_price, 0),
      last_visit  = CURRENT_DATE,
      updated_at  = NOW()
    WHERE customer_id = NEW.customer_id;
  END IF;

  RETURN NEW;
END;
$$;

