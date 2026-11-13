-- ============================================================================
-- Migration: 20261114000001_create_protection_schema.sql
-- Description: Dedicated protection schema with DDL event triggers to lock
--              13 core RPCs and 7 core tables against accidental modification.
-- ============================================================================

-- 1. Create dedicated schema
CREATE SCHEMA IF NOT EXISTS protection;

-- 2. Registry table: records all locked objects
CREATE TABLE IF NOT EXISTS protection.protected_objects (
    id SERIAL PRIMARY KEY,
    schema_name TEXT NOT NULL DEFAULT 'app',
    object_name TEXT NOT NULL,
    object_type TEXT NOT NULL, -- 'function' or 'table'
    status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'UNLOCKED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_protected_object UNIQUE (schema_name, object_name)
);

-- 3. Audit log table: records every lock and unlock action
CREATE TABLE IF NOT EXISTS protection.protection_audit_log (
    id SERIAL PRIMARY KEY,
    object_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('LOCK', 'UNLOCK')),
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL DEFAULT current_user,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Helper function: unlock an object deliberately
CREATE OR REPLACE FUNCTION protection.unlock_object(p_object_name TEXT, p_reason TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A non-empty reason is required to unlock a protected object.';
    END IF;

    UPDATE protection.protected_objects
    SET status = 'UNLOCKED',
        updated_at = clock_timestamp()
    WHERE object_name = p_object_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Object "%" not found in protection.protected_objects registry.', p_object_name;
    END IF;

    INSERT INTO protection.protection_audit_log (object_name, action, reason, performed_by)
    VALUES (p_object_name, 'UNLOCK', p_reason, current_user);

    RETURN 'UNLOCKED: ' || p_object_name || '. Remember to lock it back with protection.lock_object(''' || p_object_name || ''') after your changes.';
END;
$$;

-- 5. Helper function: lock an object back
CREATE OR REPLACE FUNCTION protection.lock_object(p_object_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE protection.protected_objects
    SET status = 'LOCKED',
        updated_at = clock_timestamp()
    WHERE object_name = p_object_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Object "%" not found in protection.protected_objects registry.', p_object_name;
    END IF;

    INSERT INTO protection.protection_audit_log (object_name, action, reason, performed_by)
    VALUES (p_object_name, 'LOCK', 'Object re-locked to protected state', current_user);

    RETURN 'LOCKED: ' || p_object_name || ' is now protected against accidental changes.';
END;
$$;

-- 6. Insert the 20 Core Objects (13 RPCs + 7 Tables)
INSERT INTO protection.protected_objects (schema_name, object_name, object_type, notes)
VALUES
    -- 13 Core RPCs
    ('app', 'create_booking_atomic', 'function', 'Bookings Module Core RPC'),
    ('app', 'update_booking_atomic', 'function', 'Bookings Module Core RPC'),
    ('app', 'process_booking_payment_atomic', 'function', 'Bookings Module Core RPC'),
    ('app', 'update_booking_status_atomic', 'function', 'Bookings Module Internal Status RPC'),
    ('app', 'process_booking_refund_atomic', 'function', 'Bookings Module Core RPC'),
    ('app', 'create_pos_sale_atomic', 'function', 'POS Module Core RPC'),
    ('app', 'process_pos_refund_atomic', 'function', 'POS Module Core RPC'),
    ('app', 'validate_pos_refund', 'function', 'POS Module Internal Validator RPC'),
    ('app', 'assign_membership_atomic', 'function', 'Memberships Module Core RPC'),
    ('app', 'cancel_membership_atomic', 'function', 'Memberships Module Core RPC'),
    ('app', 'process_membership_refund_atomic', 'function', 'Memberships Module Core RPC'),
    ('app', 'validate_assign_membership', 'function', 'Memberships Module Internal Validator RPC'),
    ('app', 'validate_discount', 'function', 'Shared Discount Validation Core RPC'),
    -- 7 Core Tables
    ('app', 'bookings', 'table', 'Bookings Core Storage Table'),
    ('app', 'bookings_for_business_transaction', 'table', 'Bookings Business Transactions Bridge Table'),
    ('app', 'business_transactions', 'table', 'Core Financial Ledger Table (Shared)'),
    ('app', 'discount_usages', 'table', 'Discount Usage & Reversal Audit Table (Shared)'),
    ('app', 'sales', 'table', 'POS Core Sales Table'),
    ('app', 'sales_for_business_transactions', 'table', 'POS Business Transactions Bridge Table'),
    ('app', 'membership_purchases', 'table', 'Memberships Purchase State Table')
ON CONFLICT (schema_name, object_name) 
DO UPDATE SET status = 'LOCKED', updated_at = clock_timestamp();

-- 7. Trigger Function: intercepts CREATE OR REPLACE and ALTER
CREATE OR REPLACE FUNCTION protection.trg_fn_guard_ddl_end()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
    v_obj_name TEXT;
    v_is_locked BOOLEAN;
BEGIN
    FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        IF r.schema_name = 'app' THEN
            IF r.object_type = 'table' THEN
                v_obj_name := split_part(r.object_identity, '.', 2);
            ELSIF r.object_type IN ('function', 'procedure') THEN
                -- Format is typically "app.func_name(param1, ...)"
                v_obj_name := split_part(split_part(r.object_identity, '(', 1), '.', 2);
            ELSE
                v_obj_name := NULL;
            END IF;

            IF v_obj_name IS NOT NULL THEN
                SELECT EXISTS (
                    SELECT 1 FROM protection.protected_objects
                    WHERE schema_name = 'app'
                      AND object_name = v_obj_name
                      AND status = 'LOCKED'
                ) INTO v_is_locked;

                IF v_is_locked THEN
                    RAISE EXCEPTION 'ACCIDENTAL_CHANGE_GUARD: Object "app.%" (%) is LOCKED. Deliberate modification requires: SELECT protection.unlock_object(''%'', ''<reason>'');',
                        v_obj_name, r.object_type, v_obj_name
                        USING ERRCODE = '55P03';
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 8. Trigger Function: intercepts DROP commands
CREATE OR REPLACE FUNCTION protection.trg_fn_guard_sql_drop()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
    v_obj_name TEXT;
    v_is_locked BOOLEAN;
BEGIN
    FOR r IN SELECT * FROM pg_event_trigger_dropped_objects()
    LOOP
        IF r.schema_name = 'app' THEN
            IF r.object_type IN ('function', 'procedure') THEN
                v_obj_name := r.address_names[2];
                IF v_obj_name IS NULL THEN
                    v_obj_name := split_part(split_part(r.object_identity, '(', 1), '.', 2);
                END IF;
            ELSE
                v_obj_name := COALESCE(NULLIF(r.object_name, ''), r.address_names[2], split_part(r.object_identity, '.', 2));
            END IF;

            IF v_obj_name IS NOT NULL THEN
                SELECT EXISTS (
                    SELECT 1 FROM protection.protected_objects
                    WHERE schema_name = 'app'
                      AND object_name = v_obj_name
                      AND status = 'LOCKED'
                ) INTO v_is_locked;

                IF v_is_locked THEN
                    RAISE EXCEPTION 'ACCIDENTAL_DROP_GUARD: Dropping "app.%" (%) is BLOCKED. Deliberate deletion requires: SELECT protection.unlock_object(''%'', ''<reason>'');',
                        v_obj_name, r.object_type, v_obj_name
                        USING ERRCODE = '55P03';
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 9. Drop and Re-create Event Triggers
DROP EVENT TRIGGER IF EXISTS trg_guard_core_ddl_end;
CREATE EVENT TRIGGER trg_guard_core_ddl_end
ON ddl_command_end
EXECUTE FUNCTION protection.trg_fn_guard_ddl_end();

DROP EVENT TRIGGER IF EXISTS trg_guard_core_sql_drop;
CREATE EVENT TRIGGER trg_guard_core_sql_drop
ON sql_drop
EXECUTE FUNCTION protection.trg_fn_guard_sql_drop();
