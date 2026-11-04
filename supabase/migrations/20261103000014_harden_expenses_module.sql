-- ============================================================================
-- Migration: 20261103000014_harden_expenses_module.sql
-- Description: Module 9 (Expenses & Financials) Stored Procedures
-- Domain: app.expenses, app.business_transactions
-- Architecture: Zero-Trust Frontend / Authoritative Backend-First
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. app.create_expense_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_expense_atomic(
    p_company_id   uuid,
    p_branch_id    uuid DEFAULT NULL,
    p_date         date DEFAULT CURRENT_DATE,
    p_category     text DEFAULT 'Other',
    p_amount       numeric DEFAULT 0,
    p_notes        text DEFAULT NULL,
    p_staff_id     uuid DEFAULT NULL,
    p_staff_name   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_expense record;
    v_clean_cat text;
BEGIN
    -- 1. Verify tenant access
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Validate date
    IF p_date IS NULL THEN
        RAISE EXCEPTION 'Expense date is required.';
    END IF;

    -- 3. Validate category
    v_clean_cat := TRIM(COALESCE(p_category, ''));
    IF v_clean_cat = '' THEN
        RAISE EXCEPTION 'Expense category is required.';
    END IF;

    -- 4. Validate amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    -- 5. Insert expense record
    INSERT INTO app.expenses (
        company_id,
        branch_id,
        date,
        category,
        amount,
        notes,
        staff_id,
        staff_name,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_date,
        v_clean_cat,
        p_amount,
        NULLIF(TRIM(p_notes), ''),
        p_staff_id,
        COALESCE(NULLIF(TRIM(p_staff_name), ''), 'Admin'),
        'active',
        NOW(),
        NOW()
    )
    RETURNING * INTO v_expense;

    RETURN to_jsonb(v_expense);
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.create_expense_atomic(
    p_company_id   uuid,
    p_branch_id    uuid DEFAULT NULL,
    p_date         date DEFAULT CURRENT_DATE,
    p_category     text DEFAULT 'Other',
    p_amount       numeric DEFAULT 0,
    p_notes        text DEFAULT NULL,
    p_staff_id     uuid DEFAULT NULL,
    p_staff_name   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_expense_atomic(
        p_company_id,
        p_branch_id,
        p_date,
        p_category,
        p_amount,
        p_notes,
        p_staff_id,
        p_staff_name
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. app.update_expense_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_expense_atomic(
    p_company_id   uuid,
    p_expense_id   uuid,
    p_branch_id    uuid DEFAULT NULL,
    p_date         date DEFAULT CURRENT_DATE,
    p_category     text DEFAULT 'Other',
    p_amount       numeric DEFAULT 0,
    p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_expense record;
    v_clean_cat text;
BEGIN
    -- 1. Verify tenant access
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Check existence of active expense
    SELECT * INTO v_expense
    FROM app.expenses
    WHERE expense_id = p_expense_id
      AND company_id = p_company_id
      AND COALESCE(status, 'active') <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found or access denied.';
    END IF;

    -- 3. Validate date
    IF p_date IS NULL THEN
        RAISE EXCEPTION 'Expense date is required.';
    END IF;

    -- 4. Validate category
    v_clean_cat := TRIM(COALESCE(p_category, ''));
    IF v_clean_cat = '' THEN
        RAISE EXCEPTION 'Expense category is required.';
    END IF;

    -- 5. Validate amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    -- 6. Perform authoritative update
    UPDATE app.expenses
    SET
        branch_id  = COALESCE(p_branch_id, branch_id),
        date       = p_date,
        category   = v_clean_cat,
        amount     = p_amount,
        notes      = NULLIF(TRIM(p_notes), ''),
        updated_at = NOW()
    WHERE expense_id = p_expense_id
      AND company_id = p_company_id
    RETURNING * INTO v_expense;

    RETURN to_jsonb(v_expense);
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.update_expense_atomic(
    p_company_id   uuid,
    p_expense_id   uuid,
    p_branch_id    uuid DEFAULT NULL,
    p_date         date DEFAULT CURRENT_DATE,
    p_category     text DEFAULT 'Other',
    p_amount       numeric DEFAULT 0,
    p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_expense_atomic(
        p_company_id,
        p_expense_id,
        p_branch_id,
        p_date,
        p_category,
        p_amount,
        p_notes
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. app.delete_expense_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_expense_atomic(
    p_company_id   uuid,
    p_expense_id   uuid,
    p_branch_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_exists boolean;
BEGIN
    -- 1. Verify tenant access
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Check existence of active expense
    SELECT EXISTS (
        SELECT 1 FROM app.expenses
        WHERE expense_id = p_expense_id
          AND company_id = p_company_id
          AND COALESCE(status, 'active') <> 'deleted'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Expense not found or access denied.';
    END IF;

    -- 3. Perform authoritative soft-delete
    UPDATE app.expenses
    SET status = 'deleted',
        updated_at = NOW()
    WHERE expense_id = p_expense_id
      AND company_id = p_company_id;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', p_expense_id
    );
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.delete_expense_atomic(
    p_company_id   uuid,
    p_expense_id   uuid,
    p_branch_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_expense_atomic(
        p_company_id,
        p_expense_id,
        p_branch_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. app.record_business_transaction_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.record_business_transaction_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_reference_id    uuid,
    p_reference_type  text,
    p_amount          numeric,
    p_payment_method  text,
    p_status          text DEFAULT 'paid',
    p_notes           text DEFAULT NULL,
    p_discount_type   text DEFAULT NULL,
    p_discount_name   text DEFAULT NULL,
    p_discount_amount numeric DEFAULT NULL,
    p_final_amount    numeric DEFAULT NULL,
    p_created_by      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_txn record;
    v_ref_type text;
    v_method text;
    v_st text;
    v_exists boolean;
BEGIN
    -- 1. Verify tenant access
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Validate reference type
    v_ref_type := LOWER(TRIM(COALESCE(p_reference_type, '')));
    IF v_ref_type NOT IN ('booking', 'product', 'membership') THEN
        RAISE EXCEPTION 'Invalid reference type: %. Must be booking, product, or membership.', p_reference_type;
    END IF;

    -- 3. Validate payment method
    v_method := LOWER(TRIM(COALESCE(p_payment_method, '')));
    IF v_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Must be cash, upi, or card.', p_payment_method;
    END IF;

    -- 4. Validate transaction status
    v_st := LOWER(TRIM(COALESCE(p_status, 'paid')));
    IF v_st NOT IN ('created', 'pending', 'paid', 'refunded', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transaction status: %.', p_status;
    END IF;

    -- 5. Validate amount
    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Transaction amount cannot be negative.';
    END IF;

    -- 6. Verify existence of reference in tenant domain
    IF v_ref_type = 'booking' THEN
        SELECT EXISTS (
            SELECT 1 FROM app.bookings
            WHERE (booking_id = p_reference_id OR id = p_reference_id)
              AND company_id = p_company_id
        ) INTO v_exists;
        IF NOT v_exists THEN
            -- Check bookings_for_business_transaction view / table
            SELECT EXISTS (
                SELECT 1 FROM app.bookings_for_business_transaction
                WHERE booking_id = p_reference_id
                  AND company_id = p_company_id
            ) INTO v_exists;
        END IF;
    ELSIF v_ref_type = 'product' THEN
        SELECT EXISTS (
            SELECT 1 FROM app.sales
            WHERE sale_id = p_reference_id
              AND company_id = p_company_id
        ) INTO v_exists;
        IF NOT v_exists THEN
            SELECT EXISTS (
                SELECT 1 FROM app.sales_for_business_transactions
                WHERE sale_id = p_reference_id
                  AND company_id = p_company_id
            ) INTO v_exists;
        END IF;
    ELSIF v_ref_type = 'membership' THEN
        SELECT EXISTS (
            SELECT 1 FROM app.membership_purchases
            WHERE purchase_id = p_reference_id
              AND company_id = p_company_id
        ) INTO v_exists;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Reference entity (%) with id % not found in tenant company.', v_ref_type, p_reference_id;
    END IF;

    -- 7. Insert business transaction
    INSERT INTO app.business_transactions (
        company_id,
        branch_id,
        reference_id,
        reference_type,
        amount,
        currency,
        payment_method,
        status,
        notes,
        created_by,
        paid_at,
        created_at,
        updated_at,
        discount_type,
        discount_name,
        discount_amount,
        final_amount
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_reference_id,
        v_ref_type,
        p_amount,
        'INR',
        v_method,
        v_st,
        NULLIF(TRIM(p_notes), ''),
        COALESCE(p_created_by, auth.uid()),
        CASE WHEN v_st = 'paid' THEN NOW() ELSE NULL END,
        NOW(),
        NOW(),
        NULLIF(TRIM(p_discount_type), ''),
        NULLIF(TRIM(p_discount_name), ''),
        p_discount_amount,
        COALESCE(p_final_amount, p_amount)
    )
    RETURNING * INTO v_txn;

    RETURN to_jsonb(v_txn);
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.record_business_transaction_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_reference_id    uuid,
    p_reference_type  text,
    p_amount          numeric,
    p_payment_method  text,
    p_status          text DEFAULT 'paid',
    p_notes           text DEFAULT NULL,
    p_discount_type   text DEFAULT NULL,
    p_discount_name   text DEFAULT NULL,
    p_discount_amount numeric DEFAULT NULL,
    p_final_amount    numeric DEFAULT NULL,
    p_created_by      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.record_business_transaction_atomic(
        p_company_id,
        p_branch_id,
        p_reference_id,
        p_reference_type,
        p_amount,
        p_payment_method,
        p_status,
        p_notes,
        p_discount_type,
        p_discount_name,
        p_discount_amount,
        p_final_amount,
        p_created_by
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Permissions & Grants
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app.create_expense_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_expense_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.update_expense_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_expense_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.delete_expense_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.record_business_transaction_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_business_transaction_atomic TO authenticated, anon, service_role;

