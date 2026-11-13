-- Migration: 20261113000009_harden_process_membership_refund_atomic.sql
-- Description: Hardens process_membership_refund_atomic and deletes redundant alias:
--   1. Drops redundant public.refund_membership_purchase alias wrapper.
--   2. Hardens app.process_membership_refund_atomic:
--      - SECTION 1: Security Checks & Vault Door
--          * 1.1 Input Preconditions (p_purchase_id, p_company_id, p_branch_id)
--          * 1.2 Tenant Boundary Check (shared.verify_tenant_access)
--          * 1.3 Gate 1: Subscription Active Check (shared.check_subscription)
--          * 1.4 Gate 2: RBAC Permission Check ('refund_membership')
--          * 1.5 Gate 3: Plan Feature Check ('marketing_memberships')
--      - SECTION 2: Core Refund Settlement (3 Steps Done Locally)
--          * Step 1: Local Verification & Pessimistic Row Lock (FOR UPDATE)
--                    - Verifies purchase exists for company & branch
--                    - State Guard 1: Must already be 'cancelled'
--                    - State Guard 2: payment_status cannot already be 'refunded'
--                    - Full refund calculation: enforces full refund of paid amount
--          * Step 2: Atomic State UPDATE on app.membership_purchases
--                    - status = 'refunded', payment_status = 'refunded', audit fields
--          * Step 3: Atomic INSERT into app.business_transactions
--                    - New immutable financial ledger row (reference_type = 'membership', status = 'refunded')
--   3. Updates public.process_membership_refund_atomic wrapper.
--   4. ACL Lockdown: Revoke PUBLIC/anon, grant strictly to authenticated and service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP REDUNDANT ALIAS WRAPPER
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.refund_membership_purchase(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.refund_membership_purchase CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HARDEN MASTER RPC: app.process_membership_refund_atomic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.process_membership_refund_atomic(
    p_purchase_id           uuid,
    p_company_id            uuid,
    p_branch_id             uuid,
    p_refund_amount         numeric DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_refund_reason         text    DEFAULT 'Customer Requested Refund',
    p_staff_id              uuid    DEFAULT NULL,
    p_refunded_by_user_id   uuid    DEFAULT NULL,
    p_refunded_by_user_name text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    -- Locked purchase record
    v_purchase_rec          record;

    -- Operational calculations & IDs
    v_actual_price          numeric;
    v_refund_amount         numeric;
    v_payment_id            uuid;

    -- Metadata
    v_staff_id              uuid;
    v_staff_name            text;
    v_payment_method        text;
    v_reason                text;
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
    PERFORM shared.check_permission(p_company_id, 'refund_membership');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    -- =========================================================================
    -- SECTION 2: CORE REFUND SETTLEMENT (The 3 Steps Locally)
    -- =========================================================================

    -- Resolve metadata
    v_staff_id       := COALESCE(auth.uid(), p_refunded_by_user_id, p_staff_id);
    v_staff_name     := COALESCE(NULLIF(TRIM(p_refunded_by_user_name), ''), 'Staff');
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    v_reason         := COALESCE(NULLIF(TRIM(p_refund_reason), ''), 'Customer Requested Refund');

    -- ── Step 1: Local Verification & Pessimistic Row Lock (FOR UPDATE) ───────
    SELECT purchase_id, customer_id, customer_name, plan_name, status, payment_status, final_amount, price
    INTO   v_purchase_rec
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership purchase not found or does not belong to authorized branch: %', p_purchase_id;
    END IF;

    -- State Guard 1: Must not already be refunded
    IF LOWER(COALESCE(v_purchase_rec.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'This membership has already been refunded.';
    END IF;

    -- State Guard 2: Must already be cancelled
    IF LOWER(COALESCE(v_purchase_rec.status, '')) <> 'cancelled' THEN
        RAISE EXCEPTION 'Only cancelled memberships can be refunded. Current status is "%"', v_purchase_rec.status;
    END IF;

    -- Full refund price enforcement
    v_actual_price := COALESCE(v_purchase_rec.final_amount, v_purchase_rec.price, 0);
    IF v_actual_price <= 0 THEN
        RAISE EXCEPTION 'Membership purchase amount must be greater than zero to refund.';
    END IF;

    IF p_refund_amount IS NOT NULL AND p_refund_amount <> v_actual_price THEN
        RAISE EXCEPTION 'Only full refund of ₹% is allowed.', v_actual_price;
    END IF;

    v_refund_amount := v_actual_price;

    -- ── Step 2: Atomic State UPDATE on app.membership_purchases ──────────────
    UPDATE app.membership_purchases
    SET    status                = 'refunded',
           payment_status        = 'refunded',
           refunded_date         = CURRENT_DATE,
           refund_amount         = v_refund_amount,
           refunded_by_user_id   = v_staff_id,
           refunded_by_user_name = v_staff_name,
           refund_reason         = v_reason,
           notes                 = CASE
                                       WHEN notes IS NOT NULL AND notes <> ''
                                       THEN notes || ' | Refund: ' || v_reason
                                       ELSE 'Refund: ' || v_reason
                                   END,
           updated_at            = NOW()
    WHERE  purchase_id = p_purchase_id;

    -- ── Step 3: Atomic INSERT into app.business_transactions (Ledger Row) ─────
    INSERT INTO app.business_transactions (
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        final_amount,
        currency,
        payment_method,
        status,
        notes,
        created_by,
        created_by_user_name,
        paid_at,
        created_at,
        updated_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_purchase_id,
        'membership',
        v_refund_amount,
        v_refund_amount,
        'INR',
        v_payment_method,
        'refunded',
        'Membership Refund: ' || v_purchase_rec.plan_name || ' - ' || v_reason,
        v_staff_id,
        v_staff_name,
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING payment_id INTO v_payment_id;

    -- Return standardized authoritative response
    RETURN jsonb_build_object(
        'success',                true,
        'purchase_id',            p_purchase_id,
        'payment_id',             v_payment_id,
        'customer_id',            v_purchase_rec.customer_id,
        'customer_name',          v_purchase_rec.customer_name,
        'plan_name',              v_purchase_rec.plan_name,
        'status',                 'refunded',
        'payment_status',         'refunded',
        'refund_amount',          v_refund_amount,
        'refunded_date',          CURRENT_DATE,
        'refunded_by_user_id',    v_staff_id,
        'refunded_by_user_name',  v_staff_name,
        'refund_reason',          v_reason
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PUBLIC POSTGREST WRAPPER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_membership_refund_atomic(
    p_purchase_id           uuid,
    p_company_id            uuid,
    p_branch_id             uuid,
    p_refund_amount         numeric DEFAULT NULL,
    p_payment_method        text    DEFAULT 'cash',
    p_refund_reason         text    DEFAULT 'Customer Requested Refund',
    p_staff_id              uuid    DEFAULT NULL,
    p_refunded_by_user_id   uuid    DEFAULT NULL,
    p_refunded_by_user_name text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.process_membership_refund_atomic(
        p_purchase_id,
        p_company_id,
        p_branch_id,
        p_refund_amount,
        p_payment_method,
        p_refund_reason,
        p_staff_id,
        p_refunded_by_user_id,
        p_refunded_by_user_name
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACL LOCKDOWN
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) TO authenticated, service_role;

