-- Migration: Add created_by_user_id and created_by_user_name columns
-- app.bookings                          → created_by_user_id (uuid), created_by_user_name (text)
-- app.bookings_for_business_transaction → created_by_user_id (uuid), created_by_user_name (text)
-- app.business_transactions             → created_by_user_name (text) only (already has created_by for uuid)

ALTER TABLE app.bookings
  ADD COLUMN IF NOT EXISTS created_by_user_id   uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_name text;

ALTER TABLE app.bookings_for_business_transaction
  ADD COLUMN IF NOT EXISTS created_by_user_id   uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_name text;

ALTER TABLE app.business_transactions
  ADD COLUMN IF NOT EXISTS created_by_user_name text;

