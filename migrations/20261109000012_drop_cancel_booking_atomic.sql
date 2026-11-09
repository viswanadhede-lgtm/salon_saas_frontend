-- Migration: 20261109000012_drop_cancel_booking_atomic.sql
-- Purpose: Drop cancel_booking_atomic — cancellation is handled by
--          update_booking_status_atomic(p_new_status = 'cancelled').
--          No JS code calls cancel_booking_atomic; it is dead DB code.

DROP FUNCTION IF EXISTS app.cancel_booking_atomic(
    uuid,   -- p_booking_id
    uuid,   -- p_company_id
    uuid,   -- p_branch_id
    text    -- p_cancel_reason
);
