-- Migration: 20261112000011_restore_public_create_booking_atomic.sql
-- Description: Restore missing public.create_booking_atomic PostgREST wrapper function.

CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_booking_id      uuid    DEFAULT NULL::uuid,
    p_company_id      uuid    DEFAULT NULL::uuid,
    p_branch_id       uuid    DEFAULT NULL::uuid,
    p_customer_id     uuid    DEFAULT NULL::uuid,
    p_customer_name   text    DEFAULT NULL::text,
    p_customer_email  text    DEFAULT NULL::text,
    p_customer_phone  text    DEFAULT NULL::text,
    p_is_new_customer boolean DEFAULT false,
    p_services        jsonb   DEFAULT '[]'::jsonb,
    p_booking_date    date    DEFAULT NULL::date,
    p_notes           text    DEFAULT NULL::text,
    p_booking_type    text    DEFAULT 'walk-in'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_booking_atomic(
        p_booking_id,
        p_company_id,
        p_branch_id,
        p_customer_id,
        p_customer_name,
        p_customer_email,
        p_customer_phone,
        p_is_new_customer,
        p_services,
        p_booking_date,
        p_notes,
        p_booking_type
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_atomic(uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, date, text, text) TO authenticated, anon, service_role;
