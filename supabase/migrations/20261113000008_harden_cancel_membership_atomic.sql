-- Migration: 20261113000008_harden_cancel_membership_atomic.sql
-- Description: Hardens cancel_membership_atomic and removes redundant RPC:
--   1. Drops redundant public.cancel_membership alias wrapper.
--   2. Hardens app.cancel_membership_atomic with:
--      - SECTION 1: Security Checks & Vault Door
--          * 1.1 Input Preconditions (p_purchase_id, p_company_id, p_branch_id)
--          * 1.2 Tenant Boundary Check (shared.verify_tenant_access)
--          * 1.3 Gate 1: Subscription Active Check (shared.check_subscription)
--          * 1.4 Gate 2: RBAC Permission Check ('cancel_membership')
--          * 1.5 Gate 3: Plan Feature Check ('marketing_memberships')
--          * 1.6 Authoritative Staff Resolution (auth.uid() priority + branch authorization)
--      - SECTION 2: Core Cancellation Logic (Exactly 2 Steps)
--          * Step 1: Verification & Pessimistic Row Lock (FOR UPDATE) - ensures status = 'active'
--          * Step 2: In-place state update on app.membership_purchases (status = 'cancelled')
--          * ZERO writes to app.business_transactions (operational state only)
--   3. Updates public.cancel_membership_atomic wrapper.
--   4. ACL Lockdown: Revoke PUBLIC/anon, grant strictly to authenticated and service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP REDUNDANT ALIAS WRAPPER
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_membership(uuid, uuid, uuid, text, uuid, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_membership CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HARDEN MASTER RPC: app.cancel_membership_atomic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.cancel_membership_atomic(
    p_purchase_id            uuid,
    p_company_id             uuid,
    p_branch_id              uuid,
    p_notes                  text DEFAULT NULL,
    p_staff_id               uuid DEFAULT NULL,
    p_cancellation_reason    text DEFAULT NULL,
    p_cancelled_by_user_id   uuid DEFAULT NULL,
    p_cancelled_by_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Purchase record & lock
    v_purchase_rec          record;

    -- Resolved staff audit
    v_resolved_staff_id     uuid;
    v_resolved_staff_name   text;
    v_staff_rec             record;

    -- Resolved cancellation reason
    v_resolved_reason       text;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS & VAULT DOOR
    -- =========================================================================

    -- 1.1 Input Preconditions
    IF p_purchase_id IS NULL THEN
        RAISE EXCEPTION 'purchase_id is mandatory';
    END IF;

    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'company_id is mandatory';
    END IF;

    IF p_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is mandatory';
    END IF;

    -- 1.2 Tenant Boundary Enforcement
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %', p_company_id, p_branch_id;
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'cancel_membership');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    -- 1.6 Authoritative Staff Resolution & Authorization
    IF auth.uid() IS NOT NULL THEN
        v_resolved_staff_id := auth.uid();
    ELSE
        v_resolved_staff_id := COALESCE(p_cancelled_by_user_id, p_staff_id);
    END IF;

    v_resolved_staff_name := TRIM(COALESCE(p_cancelled_by_user_name, ''));

    IF v_resolved_staff_id IS NOT NULL THEN
        SELECT user_id, name INTO v_staff_rec
        FROM shared.users
        WHERE user_id = v_resolved_staff_id AND company_id = p_company_id;

        IF FOUND THEN
            IF v_resolved_staff_name = '' OR LOWER(v_resolved_staff_name) = 'system' THEN
                v_resolved_staff_name := v_staff_rec.name;
            END IF;
        ELSE
            SELECT staff_id, staff_name, branch_id INTO v_staff_rec
            FROM app.staff
            WHERE staff_id = v_resolved_staff_id AND company_id = p_company_id;

            IF FOUND THEN
                IF v_staff_rec.branch_id IS DISTINCT FROM p_branch_id THEN
                    RAISE EXCEPTION 'Staff % is not authorized or active for branch %', v_resolved_staff_id, p_branch_id;
                END IF;
                IF v_resolved_staff_name = '' OR LOWER(v_resolved_staff_name) = 'system' THEN
                    v_resolved_staff_name := v_staff_rec.staff_name;
                END IF;
            END IF;
        END IF;
    END IF;

    IF v_resolved_staff_name = '' THEN
        v_resolved_staff_name := 'System';
    END IF;

    -- Resolve authoritative cancellation reason
    v_resolved_reason := COALESCE(
        NULLIF(TRIM(p_cancellation_reason), ''),
        NULLIF(TRIM(p_notes), ''),
        'Customer Requested Cancellation'
    );

    -- =========================================================================
    -- SECTION 2: CORE CANCELLATION LOGIC (Exactly 2 Steps)
    -- =========================================================================

    -- ── Step 1: Verification & Pessimistic Row Lock (FOR UPDATE) ─────────────
    SELECT purchase_id, customer_id, customer_name, plan_name, status, payment_status, final_amount, expiry_date
    INTO   v_purchase_rec
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership purchase not found or does not belong to authorized branch: %', p_purchase_id;
    END IF;

    -- State Machine Check: Only active memberships can be cancelled
    IF LOWER(COALESCE(v_purchase_rec.status, '')) <> 'active' THEN
        RAISE EXCEPTION 'Only active memberships can be cancelled. Current status is "%"', v_purchase_rec.status;
    END IF;

    -- ── Step 2: Atomic State Update on app.membership_purchases ──────────────
    UPDATE app.membership_purchases
    SET    status                 = 'cancelled',
           cancelled_date         = CURRENT_DATE,
           cancelled_by_user_id   = v_resolved_staff_id,
           cancelled_by_user_name = v_resolved_staff_name,
           cancellation_reason    = v_resolved_reason,
           notes                  = CASE 
                                      WHEN notes IS NOT NULL AND notes <> '' AND notes <> v_resolved_reason
                                      THEN notes || ' | Cancelled: ' || v_resolved_reason
                                      ELSE v_resolved_reason
                                    END,
           updated_at             = NOW()
    WHERE  purchase_id = p_purchase_id;

    -- Return standardized authoritative response (zero financial writes)
    RETURN jsonb_build_object(
        'success',                true,
        'purchase_id',            p_purchase_id,
        'customer_id',            v_purchase_rec.customer_id,
        'customer_name',          v_purchase_rec.customer_name,
        'plan_name',              v_purchase_rec.plan_name,
        'status',                 'cancelled',
        'cancelled_date',         CURRENT_DATE,
        'cancelled_by_user_id',   v_resolved_staff_id,
        'cancelled_by_user_name', v_resolved_staff_name,
        'cancellation_reason',    v_resolved_reason
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PUBLIC POSTGREST WRAPPER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_membership_atomic(
    p_purchase_id            uuid,
    p_company_id             uuid,
    p_branch_id              uuid,
    p_notes                  text DEFAULT NULL,
    p_staff_id               uuid DEFAULT NULL,
    p_cancellation_reason    text DEFAULT NULL,
    p_cancelled_by_user_id   uuid DEFAULT NULL,
    p_cancelled_by_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.cancel_membership_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_notes,
        p_staff_id,
        p_cancellation_reason,
        p_cancelled_by_user_id,
        p_cancelled_by_user_name
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACL LOCKDOWN
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.cancel_membership_atomic(uuid, uuid, uuid, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.cancel_membership_atomic(uuid, uuid, uuid, text, uuid, text, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_membership_atomic(uuid, uuid, uuid, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_membership_atomic(uuid, uuid, uuid, text, uuid, text, uuid, text) TO authenticated, service_role;

