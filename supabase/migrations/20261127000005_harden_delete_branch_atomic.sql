-- =============================================================================
-- Migration: 20261127000005_harden_delete_branch_atomic.sql
-- Purpose  : Upgrade delete_branch_atomic from app schema → shared schema
--            with full 2-section hardened pattern (ACLs, subscription,
--            permission gate, business guards, usage counter decrement)
-- =============================================================================

-- ─── PART A: DROP OLD FUNCTIONS ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS app.delete_branch_atomic(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_branch_atomic(uuid, uuid) CASCADE;

-- ─── PART B: CREATE shared.delete_branch_atomic ───────────────────────────────

CREATE OR REPLACE FUNCTION shared.delete_branch_atomic(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, app, platform, public
AS $$
DECLARE
    v_non_deleted_count integer;
    v_booking_count     integer;
    v_staff_count       integer;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 1.1: NULL guards
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id is required');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'branch_id is required');
    END IF;

    -- Step 1.2: Tenant security
    PERFORM shared.verify_tenant_access(p_company_id);

    -- Step 1.3: Subscription gate
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.4: Permission gate
    PERFORM shared.check_permission(p_company_id, 'branch_delete');

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
-- ══════════════════════════════════════════════════════════════════════════════

    -- Step 2.1: Guard — must have at least 1 other non-deleted branch
    SELECT COUNT(*) INTO v_non_deleted_count
    FROM shared.branches
    WHERE company_id = p_company_id
      AND branch_id  <> p_branch_id
      AND status     <> 'deleted';

    IF v_non_deleted_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Cannot delete branch: a company must have at least one operational branch.'
        );
    END IF;

    -- Step 2.2: Guard — no active upcoming bookings on this branch
    SELECT COUNT(*) INTO v_booking_count
    FROM app.bookings
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND booking_status IN ('pending', 'confirmed', 'in_service'); -- app.bookings uses booking_status (not status)

    IF v_booking_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', format(
                'Cannot delete branch: %s active booking(s) are scheduled here. Complete or cancel them first.',
                v_booking_count
            )
        );
    END IF;

    -- Step 2.3: Guard — no active staff assigned exclusively to this branch
    SELECT COUNT(*) INTO v_staff_count
    FROM app.staff
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status     = 'active';

    IF v_staff_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', format(
                'Cannot delete branch: %s active staff member(s) are assigned here. Reassign them first.',
                v_staff_count
            )
        );
    END IF;

    -- Step 2.4: Soft-delete — set status = 'deleted'
    UPDATE shared.branches SET
        status     = 'deleted',
        updated_at = now()
    WHERE branch_id  = p_branch_id
      AND company_id = p_company_id
      AND status    <> 'deleted';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch not found or already deleted.');
    END IF;

    -- Step 2.5: Decrement platform.usage_counters (max_branches)
    UPDATE platform.usage_counters
    SET current_count = GREATEST(COALESCE(current_count, 1) - 1, 0),
        updated_at    = now()
    WHERE company_id = p_company_id
      AND limit_key  = 'max_branches';

    -- Step 2.6: Return success
    RETURN jsonb_build_object('success', true);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', SQLERRM
        );
END;
$$;

-- ─── PART C: ACL on shared.delete_branch_atomic ───────────────────────────────

REVOKE ALL ON FUNCTION shared.delete_branch_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION shared.delete_branch_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION shared.delete_branch_atomic(uuid, uuid) TO authenticated, service_role;

-- ─── PART D: CREATE public.delete_branch_atomic (thin wrapper) ────────────────

CREATE OR REPLACE FUNCTION public.delete_branch_atomic(
    p_company_id uuid,
    p_branch_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.delete_branch_atomic(p_company_id, p_branch_id);
END;
$$;

-- ─── PART E: ACL on public.delete_branch_atomic ───────────────────────────────

REVOKE ALL ON FUNCTION public.delete_branch_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_branch_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_branch_atomic(uuid, uuid) TO authenticated, service_role;
