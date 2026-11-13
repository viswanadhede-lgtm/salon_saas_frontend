-- Migration: 20261113000011_refund_membership_add_discount_reversal.sql
-- Description: Expands process_membership_refund_atomic Section 2 from 3 steps to 5 steps:
--   Step 1: Local Verification & Pessimistic Row Lock (FOR UPDATE) — unchanged
--   Step 2: Local SELECT on app.discount_usages — finds existing discount usage row for this
--           purchase (if any discount was applied at assign time). Pure read, no mutation.
--   Step 3: Atomic UPDATE on app.membership_purchases — unchanged (shifted from Step 2)
--   Step 4: Atomic INSERT into app.business_transactions — unchanged (shifted from Step 3)
--   Step 5: Atomic UPDATE on app.discount_usages — reversal audit only if Step 2 found a row.
--           Sets status='reversed', reversal_amount, reversed_at, reversal_reason.
--
-- Signature: UNCHANGED (9 params) — zero breaking changes for callers.

-- ─────────────────────────────────────────────────────────────────────────────
-- REBUILD MASTER RPC: app.process_membership_refund_atomic
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
    -- Step 1: Locked purchase record
    v_purchase_rec      record;

    -- Step 2: Existing discount usage row (if any)
    v_disc_usage_rec    record;
    v_has_discount      boolean := false;

    -- Operational calculations & IDs
    v_actual_price      numeric;
    v_refund_amount     numeric;
    v_payment_id        uuid;

    -- Resolved metadata
    v_staff_id          uuid;
    v_staff_name        text;
    v_payment_method    text;
    v_reason            text;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS & VAULT DOOR (unchanged)
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
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to access company % or branch %',
            p_company_id, p_branch_id;
    END IF;

    -- 1.3 Gate 1: Subscription Active Check
    PERFORM shared.check_subscription(p_company_id);

    -- 1.4 Gate 2: RBAC Permission Check
    PERFORM shared.check_permission(p_company_id, 'refund_membership');

    -- 1.5 Gate 3: Plan Feature Check
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');


    -- =========================================================================
    -- SECTION 2: CORE REFUND SETTLEMENT (5 Steps)
    -- =========================================================================

    -- Resolve metadata
    v_staff_id       := COALESCE(auth.uid(), p_refunded_by_user_id, p_staff_id);
    v_staff_name     := COALESCE(NULLIF(TRIM(COALESCE(p_refunded_by_user_name, '')), ''), 'Staff');
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    v_reason         := COALESCE(NULLIF(TRIM(COALESCE(p_refund_reason, '')), ''), 'Customer Requested Refund');

    -- ── Step 1: Local Verification & Pessimistic Row Lock (FOR UPDATE) ────────
    -- Verifies purchase exists for this tenant & branch.
    -- State Guard 1: payment_status must not already be 'refunded' (double-refund prevention).
    -- State Guard 2: status must be 'cancelled' (lifecycle prerequisite).
    -- Calculates authoritative refund amount = COALESCE(final_amount, price, 0).
    SELECT purchase_id, customer_id, customer_name, plan_name,
           status, payment_status, final_amount, price
    INTO   v_purchase_rec
    FROM   app.membership_purchases
    WHERE  purchase_id = p_purchase_id
      AND  company_id  = p_company_id
      AND  branch_id   = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership purchase not found or does not belong to authorized branch: %',
            p_purchase_id;
    END IF;

    -- State Guard 1: Double-refund prevention (checked first for clear error message)
    IF LOWER(COALESCE(v_purchase_rec.payment_status, '')) = 'refunded' THEN
        RAISE EXCEPTION 'This membership has already been refunded.';
    END IF;

    -- State Guard 2: Lifecycle prerequisite
    IF LOWER(COALESCE(v_purchase_rec.status, '')) <> 'cancelled' THEN
        RAISE EXCEPTION 'Only cancelled memberships can be refunded. Current status is "%"',
            v_purchase_rec.status;
    END IF;

    -- Full refund amount calculation & enforcement
    v_actual_price := COALESCE(v_purchase_rec.final_amount, v_purchase_rec.price, 0);
    IF v_actual_price <= 0 THEN
        RAISE EXCEPTION 'Membership purchase amount must be greater than zero to refund.';
    END IF;

    IF p_refund_amount IS NOT NULL AND p_refund_amount <> v_actual_price THEN
        RAISE EXCEPTION 'Only full refund of ₹% is allowed.', v_actual_price;
    END IF;

    v_refund_amount := v_actual_price;

    -- ── Step 2: Locate Existing Discount Usage Row (local read — no mutation) ─
    -- Looks up app.discount_usages for the usage row recorded at assign time.
    -- If a discount was applied and an 'applied' usage row exists, flag it for
    -- reversal in Step 5. If none found, Step 5 is a no-op.
    SELECT id, discount_id, discount_type, discount_name, discount_amount
    INTO   v_disc_usage_rec
    FROM   app.discount_usages
    WHERE  reference_id    = p_purchase_id
      AND  reference_type  = 'membership'
      AND  status          = 'applied'
    LIMIT  1;

    v_has_discount := FOUND;

    -- ── Step 3: Atomic UPDATE — app.membership_purchases ─────────────────────
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

    -- ── Step 4: Atomic INSERT — app.business_transactions (Ledger Row) ───────
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

    -- ── Step 5: Atomic UPDATE — app.discount_usages (Reversal Audit) ─────────
    -- Fires ONLY when Step 2 found an 'applied' discount usage row.
    -- Marks the usage as 'reversed', records the reversal amount, timestamp,
    -- and reason. This closes the discount ledger for this membership purchase.
    IF v_has_discount THEN
        UPDATE app.discount_usages
        SET    status          = 'reversed',
               reversal_amount = v_disc_usage_rec.discount_amount,
               reversed_at     = NOW(),
               reversal_reason = 'Membership refunded: ' || v_reason,
               updated_at      = NOW()
        WHERE  id = v_disc_usage_rec.id;
    END IF;

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
        'refund_reason',          v_reason,
        'discount_reversed',      v_has_discount
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC POSTGREST WRAPPER (signature unchanged)
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
-- ACL LOCKDOWN (signature unchanged — same 9-param fingerprint)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_membership_refund_atomic(uuid, uuid, uuid, numeric, text, text, uuid, uuid, text) TO authenticated, service_role, postgres;

