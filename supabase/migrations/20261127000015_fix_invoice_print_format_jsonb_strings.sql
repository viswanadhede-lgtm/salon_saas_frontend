-- ============================================================
-- Migration: fix print_format rows still holding JSON strings
-- e.g. '{"layout":"thermal_58"}' stored as text → 'thermal_58'
-- Root cause: page loaded old jsonb-string value and re-saved it
-- ============================================================

UPDATE app.invoice_settings
SET print_format = (print_format::jsonb->>'layout')
WHERE print_format LIKE '{%}';
