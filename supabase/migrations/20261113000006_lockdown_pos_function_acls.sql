-- ==============================================================================
-- Migration: 20261113000006_lockdown_pos_function_acls.sql
-- Description: Security hardening of Access Control Lists (ACLs) for POS RPCs:
--              - Revokes EXECUTE from PUBLIC (pseudo-role) on all POS routines
--              - Revokes EXECUTE from anon (unauthenticated visitors)
--              - Grants EXECUTE strictly to authenticated (staff session) and service_role
--              - Eliminates anonymous invocation attack vectors over PostgREST
-- ==============================================================================

-- 1. POS Refund Internal & Public Functions
REVOKE ALL ON FUNCTION app.validate_pos_refund(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_pos_refund(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION app.process_pos_refund_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_pos_refund_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app.validate_pos_refund(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_pos_refund(uuid, uuid, uuid, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION app.process_pos_refund_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) TO authenticated, service_role;

-- 2. POS Sale Functions
REVOKE ALL ON FUNCTION app.create_pos_sale_atomic(uuid, uuid, uuid, uuid, text, text, text, uuid, text, jsonb, text, text, numeric, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pos_sale_atomic(uuid, uuid, uuid, uuid, text, text, text, uuid, text, jsonb, text, text, numeric, numeric, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app.create_pos_sale_atomic(uuid, uuid, uuid, uuid, text, text, text, uuid, text, jsonb, text, text, numeric, numeric, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic(uuid, uuid, uuid, uuid, text, text, text, uuid, text, jsonb, text, text, numeric, numeric, uuid) TO authenticated, service_role;

