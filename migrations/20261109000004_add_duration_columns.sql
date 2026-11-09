-- Migration: Add duration columns to bookings and bookings_for_business_transaction
-- app.bookings: individual service duration in minutes
-- app.bookings_for_business_transaction: total (summed) duration in minutes

ALTER TABLE app.bookings
  ADD COLUMN IF NOT EXISTS duration integer;

ALTER TABLE app.bookings_for_business_transaction
  ADD COLUMN IF NOT EXISTS total_duration integer;
