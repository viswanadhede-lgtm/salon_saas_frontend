-- =============================================================================
-- Migration: 20261127000008_harden_save_business_payment_settings_atomic.sql
-- Purpose  : Upgrade save_business_payment_settings_atomic from app -> shared schema
--            with full 2-section hardened pattern (ACLs, subscription,
--            save_payments_settings permission gate, domain validation,
--            active branch lock, and atomic upsert on app.business_payment_settings)
-- =============================================================================

-- ─── PART A: DROP OLD FUNCTIONS ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS app.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) CASCADE;

DROP FUNCTION IF EXISTS app.save_business_payment_settings_atomic(
    uuid, uuid, text[], text
) CASCADE;

DROP FUNCTION IF EXISTS public.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) CASCADE;

DROP FUNCTION IF EXISTS public.save_business_payment_settings_atomic(
    uuid, uuid, text[], text
) CASCADE;

-- ─── PART B: CREATE shared.save_business_payment_settings_atomic ─────────────

CREATE OR REPLACE FUNCTION shared.save_business_payment_settings_atomic(
    p_company_id             uuid,
    p_branch_id              uuid,
    p_cash_enabled           boolean DEFAULT true,
    p_upi_enabled            boolean DEFAULT true,
    p_cards_enabled          boolean DEFAULT true,
    p_online_payment_enabled boolean DEFAULT false,
    p_upi_id                 text    DEFAULT NULL,
    p_upi_qr_code_url        text    DEFAULT NULL,
    p_payment_note           text    DEFAULT NULL,
    p_default_payment_method text    DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shared, app, platform, public, pg_temp
AS $$
DECLARE
    v_cash           boolean := COALESCE(p_cash_enabled, true);
    v_upi            boolean := COALESCE(p_upi_enabled, true);
    v_card           boolean := COALESCE(p_cards_enabled, true);
    v_online         boolean := COALESCE(p_online_payment_enabled, false);
    v_clean_upi_id   text    := NULLIF(TRIM(p_upi_id), '');
    v_clean_qr_url   text    := NULLIF(TRIM(p_upi_qr_code_url), '');
    v_clean_note     text    := NULLIF(TRIM(p_payment_note), '');
    v_default_method text    := LOWER(TRIM(COALESCE(NULLIF(TRIM(p_default_payment_method), ''), 'cash')));
    v_saved_row      app.business_payment_settings%ROWTYPE;
BEGIN

-- =============================================================================
-- SECTION 1: SECURITY & PRECONDITIONS (Fail-Fast)
-- =============================================================================

    -- Step 1.1: NULL guards
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'company_id is required');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'branch_id is required');
    END IF;

    -- Step 1.2: Field bounds & domain validation
    IF NOT (v_cash OR v_upi OR v_card OR v_online) THEN
        RETURN jsonb_build_object('success', false, 'message', 'At least one payment method must be enabled');
    END IF;

    IF v_default_method NOT IN ('cash', 'upi', 'card', 'online') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Default payment method must be cash, upi, card, or online');
    END IF;

    IF (v_default_method = 'cash'   AND NOT v_cash)
    OR (v_default_method = 'upi'    AND NOT v_upi)
    OR (v_default_method = 'card'   AND NOT v_card)
    OR (v_default_method = 'online' AND NOT v_online) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', format('Default payment method (%s) must be enabled', v_default_method)
        );
    END IF;

    IF v_clean_upi_id IS NOT NULL AND char_length(v_clean_upi_id) > 120 THEN
        RETURN jsonb_build_object('success', false, 'message', 'UPI ID must be 120 characters or fewer');
    END IF;
    IF v_clean_qr_url IS NOT NULL AND char_length(v_clean_qr_url) > 2048 THEN
        RETURN jsonb_build_object('success', false, 'message', 'UPI QR code URL is too long');
    END IF;
    IF v_clean_note IS NOT NULL AND char_length(v_clean_note) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Payment note must be 1000 characters or fewer');
    END IF;

    -- Step 1.3: Tenant & branch security verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: invalid company or branch context');
    END IF;

    -- Step 1.4: Subscription gate
    PERFORM shared.check_subscription(p_company_id);

    -- Step 1.5: Permission gate
    PERFORM shared.check_permission(p_company_id, 'save_payments_settings');

-- =============================================================================
-- SECTION 2: SEQUENTIAL ATOMIC CORE LOGIC
-- =============================================================================

    -- Step 2.1: Verify active/non-deleted branch exists with FOR UPDATE lock
    IF NOT EXISTS (
        SELECT 1 FROM shared.branches
        WHERE branch_id  = p_branch_id
          AND company_id = p_company_id
          AND status     <> 'deleted'
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Branch not found or has been deleted');
    END IF;

    -- Step 2.2: Atomic upsert on (company_id, branch_id)
    INSERT INTO app.business_payment_settings (
        id,
        company_id,
        branch_id,
        cash_enabled,
        upi_enabled,
        cards_enabled,
        online_payment_enabled,
        upi_id,
        upi_qr_code_url,
        payment_note,
        default_payment_method,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_company_id,
        p_branch_id,
        v_cash,
        v_upi,
        v_card,
        v_online,
        v_clean_upi_id,
        v_clean_qr_url,
        v_clean_note,
        v_default_method,
        now(),
        now()
    )
    ON CONFLICT (company_id, branch_id)
    DO UPDATE SET
        cash_enabled           = EXCLUDED.cash_enabled,
        upi_enabled            = EXCLUDED.upi_enabled,
        cards_enabled          = EXCLUDED.cards_enabled,
        online_payment_enabled = EXCLUDED.online_payment_enabled,
        upi_id                 = EXCLUDED.upi_id,
        upi_qr_code_url        = EXCLUDED.upi_qr_code_url,
        payment_note           = EXCLUDED.payment_note,
        default_payment_method = EXCLUDED.default_payment_method,
        updated_at             = now()
    RETURNING * INTO v_saved_row;

    -- Step 2.3: Return saved settings + success flag
    RETURN to_jsonb(v_saved_row) || jsonb_build_object('success', true);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- ─── PART C: ACL on shared.save_business_payment_settings_atomic ─────────────

REVOKE ALL ON FUNCTION shared.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION shared.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION shared.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) TO authenticated, service_role;

-- ─── PART D: CREATE public.save_business_payment_settings_atomic ─────────────

CREATE OR REPLACE FUNCTION public.save_business_payment_settings_atomic(
    p_company_id             uuid,
    p_branch_id              uuid,
    p_cash_enabled           boolean DEFAULT true,
    p_upi_enabled            boolean DEFAULT true,
    p_cards_enabled          boolean DEFAULT true,
    p_online_payment_enabled boolean DEFAULT false,
    p_upi_id                 text    DEFAULT NULL,
    p_upi_qr_code_url        text    DEFAULT NULL,
    p_payment_note           text    DEFAULT NULL,
    p_default_payment_method text    DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
BEGIN
    RETURN shared.save_business_payment_settings_atomic(
        p_company_id,
        p_branch_id,
        p_cash_enabled,
        p_upi_enabled,
        p_cards_enabled,
        p_online_payment_enabled,
        p_upi_id,
        p_upi_qr_code_url,
        p_payment_note,
        p_default_payment_method
    );
END;
$$;

-- ─── PART E: ACL on public.save_business_payment_settings_atomic ─────────────

REVOKE ALL ON FUNCTION public.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.save_business_payment_settings_atomic(
    uuid, uuid, boolean, boolean, boolean, boolean, text, text, text, text
) TO authenticated, service_role;
