-- =============================================================================
-- Migration: 20261104000003_harden_remaining_rpcs_phase_c.sql
-- Phase C: Inject Auth Gates into All Remaining Mutation RPCs
--
-- For every function below, we add ONLY the gate calls immediately after the
-- existing shared.verify_tenant_access() call. All other logic is UNCHANGED.
-- This is a pure security hardening patch — no business logic is modified.
--
-- Pattern applied to each function:
--   PERFORM shared.verify_tenant_access(...);       ← already existed
--   PERFORM shared.check_subscription(p_company_id); ← NEW Gate 1
--   PERFORM shared.check_permission(p_company_id, 'key'); ← NEW Gate 2
--   [PERFORM shared.check_plan_feature(...);]        ← NEW Gate 3 (where applicable)
--
-- Functions hardened (28 total):
--   SERVICES MODULE (9):
--     C01. create_service_category_atomic  (Gate1 + Gate2:create_service)
--     C02. update_service_category_atomic  (Gate1 + Gate2:update_service)
--     C03. delete_service_category_atomic  (Gate1 + Gate2:delete_service)
--     C04. create_service_atomic           (Gate1 + Gate2:create_service + Gate3:services_management)
--     C05. update_service_atomic           (Gate1 + Gate2:update_service)
--     C06. delete_service_atomic           (Gate1 + Gate2:delete_service)
--     C07. create_package_atomic           (Gate1 + Gate2:create_service)
--     C08. update_package_atomic           (Gate1 + Gate2:update_service)
--     C09. delete_package_atomic           (Gate1 + Gate2:delete_service)
--   CUSTOMERS MODULE (3):
--     C10. create_customer_atomic          (Gate1 + Gate2:customer_create)
--     C11. update_customer_atomic          (Gate1 + Gate2:customer_edit)
--     C12. delete_customer_atomic          (Gate1 + Gate2:customer_delete)
--   MARKETING MODULE (7):
--     C13. create_coupon_atomic            (Gate1 + Gate2:create_coupon   + Gate3:marketing_coupons)
--     C14. update_coupon_atomic            (Gate1 + Gate2:update_coupon)
--     C15. delete_coupon_atomic            (Gate1 + Gate2:delete_coupon)
--     C16. create_offer_atomic             (Gate1 + Gate2:create_offer    + Gate3:marketing_offers)
--     C17. update_offer_atomic             (Gate1 + Gate2:update_offer)
--     C18. delete_offer_atomic             (Gate1 + Gate2:delete_offer)
--     C19. create_membership_plan          (Gate1 + Gate2:create_membership + Gate3:marketing_memberships)
--   PRODUCTS MODULE (4):
--     C20. create_product_atomic           (Gate1 + Gate2:create_product  + Gate3:product_management)
--     C21. create_product_category_atomic  (Gate1 + Gate2:create_product)
--     C22. update_product_atomic           (Gate1 + Gate2:update_product)
--     C23. delete_product_atomic           (Gate1 + Gate2:delete_product)
--   EXPENSES MODULE (2):
--     C24. create_expense_atomic           (Gate1 + Gate2:expenses_create + Gate3:analytics_expenses)
--     C25. update_expense_atomic           (Gate1 + Gate2:expenses_update)
--   STAFF MODULE (3):
--     C26. update_staff_atomic             (Gate1 + Gate2:update_staff)
--     C27. save_staff_schedule_atomic      (Gate1 + Gate2:create_staff_schedule)
--     C28. save_business_hours_atomic      (Gate1 + Gate2:settings_edit)
--   SETTINGS MODULE (5):
--     C29. save_company_tax_settings_atomic    (Gate1 + Gate2:settings_edit)
--     C30. save_business_payment_settings_atomic (Gate1 + Gate2:settings_edit)
--     C31. save_invoice_settings_atomic    (Gate1 + Gate2:settings_edit)
--     C32. save_notification_settings_atomic (Gate1 + Gate2:settings_edit)
--     C33. save_role_permissions_atomic    (Gate1 + Gate2:role_edit)
-- =============================================================================


-- =============================================================================
-- C01-C03: Service Categories
-- =============================================================================

-- C01. create_service_category_atomic
CREATE OR REPLACE FUNCTION app.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text DEFAULT NULL,
    p_color         text DEFAULT NULL,
    p_icon          text DEFAULT NULL,
    p_status        text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_category_id uuid    := gen_random_uuid();
    v_exists      boolean;
    v_name        text    := NULLIF(TRIM(p_category_name), '');
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_service');

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Category name is required.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.service_categories
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(category_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A service category named "%" already exists.', v_name;
    END IF;

    INSERT INTO app.service_categories (
        category_id, company_id, branch_id,
        category_name, description, color, icon, status,
        created_at, updated_at
    ) VALUES (
        v_category_id, p_company_id, p_branch_id,
        v_name, p_description, p_color, p_icon,
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'category_id', v_category_id);
END;
$$;

-- C02. update_service_category_atomic
CREATE OR REPLACE FUNCTION app.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_color         text    DEFAULT NULL,
    p_icon          text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_service');

    UPDATE app.service_categories
    SET category_name = COALESCE(NULLIF(TRIM(p_category_name), ''), category_name),
        description   = COALESCE(p_description, description),
        color         = COALESCE(p_color, color),
        icon          = COALESCE(p_icon, icon),
        status        = COALESCE(p_status, status),
        updated_at    = NOW()
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service category not found.';
    END IF;

    RETURN jsonb_build_object('success', true, 'category_id', p_category_id);
END;
$$;

-- C03. delete_service_category_atomic
CREATE OR REPLACE FUNCTION app.delete_service_category_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_service');

    UPDATE app.service_categories
    SET status = 'deleted', updated_at = NOW()
    WHERE category_id = p_category_id
      AND company_id  = p_company_id
      AND branch_id   = p_branch_id
      AND status <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service category not found.';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C04-C06: Services
-- =============================================================================

-- C04. create_service_atomic  — Gate1 + Gate2 + Gate3(services_management)
CREATE OR REPLACE FUNCTION app.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_price         numeric DEFAULT 0,
    p_duration      integer DEFAULT 30,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_service_id uuid    := gen_random_uuid();
    v_exists     boolean;
    v_name       text    := NULLIF(TRIM(p_service_name), '');
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_service');
    PERFORM shared.check_plan_feature(p_company_id, 'services_management');

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Service name is required.';
    END IF;

    IF p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative.';
    END IF;

    IF p_duration <= 0 THEN
        RAISE EXCEPTION 'Duration must be greater than 0 minutes.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.services
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(service_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A service named "%" already exists in this branch.', v_name;
    END IF;

    INSERT INTO app.services (
        service_id, company_id, branch_id, category_id,
        service_name, description, price, duration, status,
        created_at, updated_at
    ) VALUES (
        v_service_id, p_company_id, p_branch_id, p_category_id,
        v_name, p_description, p_price, p_duration,
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'service_id', v_service_id);
END;
$$;

-- C05. update_service_atomic
CREATE OR REPLACE FUNCTION app.update_service_atomic(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_service_id   uuid,
    p_service_name text    DEFAULT NULL,
    p_category_id  uuid    DEFAULT NULL,
    p_description  text    DEFAULT NULL,
    p_price        numeric DEFAULT NULL,
    p_duration     integer DEFAULT NULL,
    p_status       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_service');

    UPDATE app.services
    SET service_name = COALESCE(NULLIF(TRIM(p_service_name), ''), service_name),
        category_id  = COALESCE(p_category_id, category_id),
        description  = COALESCE(p_description, description),
        price        = COALESCE(p_price, price),
        duration     = COALESCE(p_duration, duration),
        status       = COALESCE(p_status, status),
        updated_at   = NOW()
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found.';
    END IF;

    RETURN jsonb_build_object('success', true, 'service_id', p_service_id);
END;
$$;

-- C06. delete_service_atomic
CREATE OR REPLACE FUNCTION app.delete_service_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_service');

    UPDATE app.services
    SET status = 'deleted', updated_at = NOW()
    WHERE service_id = p_service_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found.';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C07-C09: Packages
-- =============================================================================

-- C07. create_package_atomic
CREATE OR REPLACE FUNCTION app.create_package_atomic(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_package_name text,
    p_description  text    DEFAULT NULL,
    p_price        numeric DEFAULT 0,
    p_duration     integer DEFAULT 60,
    p_service_ids  uuid[]  DEFAULT NULL,
    p_status       text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_package_id uuid := gen_random_uuid();
    v_name       text := NULLIF(TRIM(p_package_name), '');
    v_exists     boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_service');

    IF v_name IS NULL THEN RAISE EXCEPTION 'Package name is required.'; END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.packages
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(package_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A package named "%" already exists in this branch.', v_name;
    END IF;

    INSERT INTO app.packages (
        package_id, company_id, branch_id,
        package_name, description, price, duration, service_ids, status,
        created_at, updated_at
    ) VALUES (
        v_package_id, p_company_id, p_branch_id,
        v_name, p_description, p_price, p_duration,
        COALESCE(p_service_ids, ARRAY[]::uuid[]),
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'package_id', v_package_id);
END;
$$;

-- C08. update_package_atomic
CREATE OR REPLACE FUNCTION app.update_package_atomic(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_package_id   uuid,
    p_package_name text    DEFAULT NULL,
    p_description  text    DEFAULT NULL,
    p_price        numeric DEFAULT NULL,
    p_duration     integer DEFAULT NULL,
    p_service_ids  uuid[]  DEFAULT NULL,
    p_status       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_service');

    UPDATE app.packages
    SET package_name = COALESCE(NULLIF(TRIM(p_package_name), ''), package_name),
        description  = COALESCE(p_description, description),
        price        = COALESCE(p_price, price),
        duration     = COALESCE(p_duration, duration),
        service_ids  = COALESCE(p_service_ids, service_ids),
        status       = COALESCE(p_status, status),
        updated_at   = NOW()
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Package not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'package_id', p_package_id);
END;
$$;

-- C09. delete_package_atomic
CREATE OR REPLACE FUNCTION app.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_service');

    UPDATE app.packages
    SET status = 'deleted', updated_at = NOW()
    WHERE package_id = p_package_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id
      AND status <> 'deleted';

    IF NOT FOUND THEN RAISE EXCEPTION 'Package not found.'; END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C10-C12: Customers Module
-- =============================================================================

-- C10. create_customer_atomic
CREATE OR REPLACE FUNCTION app.create_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_customer_name  text,
    p_customer_phone text    DEFAULT NULL,
    p_customer_email text    DEFAULT NULL,
    p_notes          text    DEFAULT NULL,
    p_status         text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_customer_id  uuid := gen_random_uuid();
    v_clean_phone  text := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    v_name         text := NULLIF(TRIM(p_customer_name), '');
    v_existing_id  uuid;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'customer_create');

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;

    IF v_clean_phone <> '' THEN
        SELECT customer_id INTO v_existing_id
        FROM app.customers
        WHERE company_id = p_company_id
          AND regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = v_clean_phone
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'customer_id', v_existing_id, 'existing', true);
        END IF;
    END IF;

    INSERT INTO app.customers (
        customer_id, company_id, branch_id,
        customer_name, customer_phone, customer_email,
        notes, status, created_at, updated_at
    ) VALUES (
        v_customer_id, p_company_id, p_branch_id,
        v_name, p_customer_phone, p_customer_email,
        p_notes, COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'customer_id', v_customer_id, 'existing', false);
END;
$$;

-- C11. update_customer_atomic
CREATE OR REPLACE FUNCTION app.update_customer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_customer_id    uuid,
    p_customer_name  text    DEFAULT NULL,
    p_customer_phone text    DEFAULT NULL,
    p_customer_email text    DEFAULT NULL,
    p_notes          text    DEFAULT NULL,
    p_status         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'customer_edit');

    UPDATE app.customers
    SET customer_name  = COALESCE(NULLIF(TRIM(p_customer_name),''), customer_name),
        customer_phone = COALESCE(p_customer_phone, customer_phone),
        customer_email = COALESCE(p_customer_email, customer_email),
        notes          = COALESCE(p_notes, notes),
        status         = COALESCE(p_status, status),
        updated_at     = NOW()
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'customer_id', p_customer_id);
END;
$$;

-- C12. delete_customer_atomic
CREATE OR REPLACE FUNCTION app.delete_customer_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'customer_delete');

    UPDATE app.customers
    SET status = 'deleted', updated_at = NOW()
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND status <> 'deleted';

    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found.'; END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C13-C19: Marketing Module (Coupons, Offers, Membership Plans)
-- =============================================================================

-- C13. create_coupon_atomic  — Gate1 + Gate2 + Gate3(marketing_coupons)
CREATE OR REPLACE FUNCTION app.create_coupon_atomic(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_code              text,
    p_discount_type     text,
    p_discount_value    numeric,
    p_start_date        date        DEFAULT CURRENT_DATE,
    p_end_date          date        DEFAULT NULL,
    p_min_bill_amount   numeric     DEFAULT NULL,
    p_total_usage_limit integer     DEFAULT NULL,
    p_per_customer_limit integer    DEFAULT NULL,
    p_applicable_to_all_memberships boolean DEFAULT true,
    p_status            text        DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_coupon_id uuid := gen_random_uuid();
    v_code      text := UPPER(TRIM(p_code));
    v_exists    boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_coupon');
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_coupons');

    IF v_code IS NULL OR v_code = '' THEN
        RAISE EXCEPTION 'Coupon code is required.';
    END IF;

    IF p_discount_type NOT IN ('percentage', 'flat') THEN
        RAISE EXCEPTION 'Discount type must be percentage or flat.';
    END IF;

    IF p_discount_value <= 0 THEN
        RAISE EXCEPTION 'Discount value must be greater than zero.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.coupons
        WHERE company_id = p_company_id AND UPPER(code) = v_code AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'Coupon code "%" already exists.', v_code;
    END IF;

    INSERT INTO app.coupons (
        id, company_id, branch_id, code,
        discount_type, discount_value, start_date, end_date,
        min_bill_amount, total_usage_limit, per_customer_limit,
        applicable_to_all_memberships, status,
        created_at, updated_at
    ) VALUES (
        v_coupon_id, p_company_id, p_branch_id, v_code,
        p_discount_type, p_discount_value,
        COALESCE(p_start_date, CURRENT_DATE),
        COALESCE(p_end_date, CURRENT_DATE + 365),
        p_min_bill_amount, p_total_usage_limit, p_per_customer_limit,
        COALESCE(p_applicable_to_all_memberships, true),
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'coupon_id', v_coupon_id, 'code', v_code);
END;
$$;

-- C14. update_coupon_atomic
CREATE OR REPLACE FUNCTION app.update_coupon_atomic(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_coupon_id         uuid,
    p_discount_type     text    DEFAULT NULL,
    p_discount_value    numeric DEFAULT NULL,
    p_start_date        date    DEFAULT NULL,
    p_end_date          date    DEFAULT NULL,
    p_min_bill_amount   numeric DEFAULT NULL,
    p_total_usage_limit integer DEFAULT NULL,
    p_per_customer_limit integer DEFAULT NULL,
    p_status            text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_coupon');

    UPDATE app.coupons
    SET discount_type      = COALESCE(p_discount_type, discount_type),
        discount_value     = COALESCE(p_discount_value, discount_value),
        start_date         = COALESCE(p_start_date, start_date),
        end_date           = COALESCE(p_end_date, end_date),
        min_bill_amount    = COALESCE(p_min_bill_amount, min_bill_amount),
        total_usage_limit  = COALESCE(p_total_usage_limit, total_usage_limit),
        per_customer_limit = COALESCE(p_per_customer_limit, per_customer_limit),
        status             = COALESCE(p_status, status),
        updated_at         = NOW()
    WHERE id         = p_coupon_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'coupon_id', p_coupon_id);
END;
$$;

-- C15. delete_coupon_atomic
CREATE OR REPLACE FUNCTION app.delete_coupon_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_coupon_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_coupon');

    UPDATE app.coupons
    SET status = 'deleted', updated_at = NOW()
    WHERE id = p_coupon_id AND company_id = p_company_id AND status <> 'deleted';

    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found.'; END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C16. create_offer_atomic  — Gate1 + Gate2 + Gate3(marketing_offers)
CREATE OR REPLACE FUNCTION app.create_offer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_title          text,
    p_description    text    DEFAULT NULL,
    p_discount_type  text    DEFAULT 'percentage',
    p_discount_value numeric DEFAULT 0,
    p_start_date     date    DEFAULT CURRENT_DATE,
    p_end_date       date    DEFAULT NULL,
    p_applicable_to_all_memberships boolean DEFAULT true,
    p_status         text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_offer_id uuid := gen_random_uuid();
    v_title    text := NULLIF(TRIM(p_title), '');
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_offer');
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_offers');

    IF v_title IS NULL THEN RAISE EXCEPTION 'Offer title is required.'; END IF;

    INSERT INTO app.offers (
        id, company_id, branch_id, title, description,
        discount_type, discount_value, start_date, end_date,
        applicable_to_all_memberships, status,
        created_at, updated_at
    ) VALUES (
        v_offer_id, p_company_id, p_branch_id, v_title, p_description,
        COALESCE(p_discount_type, 'percentage'),
        COALESCE(p_discount_value, 0),
        COALESCE(p_start_date, CURRENT_DATE),
        COALESCE(p_end_date, CURRENT_DATE + 30),
        COALESCE(p_applicable_to_all_memberships, true),
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id);
END;
$$;

-- C17. update_offer_atomic
CREATE OR REPLACE FUNCTION app.update_offer_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_offer_id       uuid,
    p_title          text    DEFAULT NULL,
    p_description    text    DEFAULT NULL,
    p_discount_type  text    DEFAULT NULL,
    p_discount_value numeric DEFAULT NULL,
    p_start_date     date    DEFAULT NULL,
    p_end_date       date    DEFAULT NULL,
    p_status         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_offer');

    UPDATE app.offers
    SET title          = COALESCE(NULLIF(TRIM(p_title),''), title),
        description    = COALESCE(p_description, description),
        discount_type  = COALESCE(p_discount_type, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        start_date     = COALESCE(p_start_date, start_date),
        end_date       = COALESCE(p_end_date, end_date),
        status         = COALESCE(p_status, status),
        updated_at     = NOW()
    WHERE id = p_offer_id AND company_id = p_company_id AND branch_id = p_branch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'offer_id', p_offer_id);
END;
$$;

-- C18. delete_offer_atomic
CREATE OR REPLACE FUNCTION app.delete_offer_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_offer_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_offer');

    UPDATE app.offers
    SET status = 'deleted', updated_at = NOW()
    WHERE id = p_offer_id AND company_id = p_company_id AND status <> 'deleted';

    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found.'; END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C19. create_membership_plan  — Gate1 + Gate2 + Gate3(marketing_memberships)
CREATE OR REPLACE FUNCTION app.create_membership_plan(
    p_company_id uuid,
    p_branch_id  uuid,
    p_plan_name  text,
    p_price      numeric DEFAULT 0,
    p_duration   integer DEFAULT 30,
    p_description text   DEFAULT NULL,
    p_discount_type  text DEFAULT NULL,
    p_discount_value numeric DEFAULT NULL,
    p_status     text   DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_membership_id uuid := gen_random_uuid();
    v_name          text := NULLIF(TRIM(p_plan_name), '');
    v_exists        boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_membership');
    PERFORM shared.check_plan_feature(p_company_id, 'marketing_memberships');

    IF v_name IS NULL THEN RAISE EXCEPTION 'Membership plan name is required.'; END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.memberships
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(plan_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A membership plan named "%" already exists in this branch.', v_name;
    END IF;

    INSERT INTO app.memberships (
        membership_id, company_id, branch_id,
        plan_name, price, duration, description,
        discount_type, discount_value, status,
        created_at, updated_at
    ) VALUES (
        v_membership_id, p_company_id, p_branch_id,
        v_name, p_price, p_duration, p_description,
        p_discount_type, p_discount_value,
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'membership_id', v_membership_id);
END;
$$;


-- =============================================================================
-- C20-C23: Products Module
-- =============================================================================

-- C20. create_product_atomic  — Gate1 + Gate2 + Gate3(product_management)
CREATE OR REPLACE FUNCTION app.create_product_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_product_name  text,
    p_category_id   uuid    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_price         numeric DEFAULT 0,
    p_stock_quantity bigint DEFAULT 0,
    p_status        text    DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_product_id uuid := gen_random_uuid();
    v_name       text := NULLIF(TRIM(p_product_name), '');
    v_exists     boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_product');
    PERFORM shared.check_plan_feature(p_company_id, 'product_management');

    IF v_name IS NULL THEN RAISE EXCEPTION 'Product name is required.'; END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.products
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(product_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'A product named "%" already exists in this branch.', v_name;
    END IF;

    INSERT INTO app.products (
        product_id, company_id, branch_id, category_id,
        product_name, description, price, stock_quantity, status,
        created_at, updated_at
    ) VALUES (
        v_product_id, p_company_id, p_branch_id, p_category_id,
        v_name, p_description,
        COALESCE(p_price, 0), COALESCE(p_stock_quantity, 0),
        COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id);
END;
$$;

-- C21. create_product_category_atomic
CREATE OR REPLACE FUNCTION app.create_product_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text DEFAULT NULL,
    p_status        text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_category_id uuid := gen_random_uuid();
    v_name        text := NULLIF(TRIM(p_category_name), '');
    v_exists      boolean;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_product');

    IF v_name IS NULL THEN RAISE EXCEPTION 'Category name is required.'; END IF;

    SELECT EXISTS(
        SELECT 1 FROM app.product_categories
        WHERE company_id = p_company_id AND LOWER(category_name) = LOWER(v_name) AND status <> 'deleted'
    ) INTO v_exists;
    IF v_exists THEN RAISE EXCEPTION 'Product category "%" already exists.', v_name; END IF;

    INSERT INTO app.product_categories (
        category_id, company_id, branch_id,
        category_name, description, status,
        created_at, updated_at
    ) VALUES (
        v_category_id, p_company_id, p_branch_id,
        v_name, p_description, COALESCE(p_status, 'active'), NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'category_id', v_category_id);
END;
$$;

-- C22. update_product_atomic
CREATE OR REPLACE FUNCTION app.update_product_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_product_id    uuid,
    p_product_name  text    DEFAULT NULL,
    p_category_id   uuid    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_price         numeric DEFAULT NULL,
    p_stock_quantity bigint  DEFAULT NULL,
    p_status        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_product');

    UPDATE app.products
    SET product_name   = COALESCE(NULLIF(TRIM(p_product_name),''), product_name),
        category_id    = COALESCE(p_category_id, category_id),
        description    = COALESCE(p_description, description),
        price          = COALESCE(p_price, price),
        stock_quantity = COALESCE(p_stock_quantity, stock_quantity),
        status         = COALESCE(p_status, status),
        updated_at     = NOW()
    WHERE product_id = p_product_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

-- C23. delete_product_atomic
CREATE OR REPLACE FUNCTION app.delete_product_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'delete_product');

    UPDATE app.products
    SET status = 'deleted', updated_at = NOW()
    WHERE product_id = p_product_id
      AND company_id = p_company_id
      AND status <> 'deleted';

    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C24-C25: Expenses Module
-- =============================================================================

-- C24. create_expense_atomic  — Gate1 + Gate2 + Gate3(analytics_expenses)
CREATE OR REPLACE FUNCTION app.create_expense_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category      text,
    p_description   text    DEFAULT NULL,
    p_amount        numeric DEFAULT 0,
    p_expense_date  date    DEFAULT CURRENT_DATE,
    p_payment_method text   DEFAULT 'cash',
    p_staff_id      uuid    DEFAULT NULL,
    p_notes         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_expense_id uuid := gen_random_uuid();
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'expenses_create');
    PERFORM shared.check_plan_feature(p_company_id, 'analytics_expenses');

    IF NULLIF(TRIM(p_category), '') IS NULL THEN
        RAISE EXCEPTION 'Expense category is required.';
    END IF;

    IF p_amount < 0 THEN
        RAISE EXCEPTION 'Expense amount cannot be negative.';
    END IF;

    INSERT INTO app.expenses (
        expense_id, company_id, branch_id,
        category, description, amount, expense_date,
        payment_method, staff_id, notes,
        created_at, updated_at
    ) VALUES (
        v_expense_id, p_company_id, p_branch_id,
        TRIM(p_category), p_description, p_amount,
        COALESCE(p_expense_date, CURRENT_DATE),
        COALESCE(p_payment_method, 'cash'),
        p_staff_id, p_notes,
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'expense_id', v_expense_id);
END;
$$;

-- C25. update_expense_atomic
CREATE OR REPLACE FUNCTION app.update_expense_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_expense_id    uuid,
    p_category      text    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_amount        numeric DEFAULT NULL,
    p_expense_date  date    DEFAULT NULL,
    p_payment_method text   DEFAULT NULL,
    p_notes         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'expenses_update');

    UPDATE app.expenses
    SET category       = COALESCE(NULLIF(TRIM(p_category),''), category),
        description    = COALESCE(p_description, description),
        amount         = COALESCE(p_amount, amount),
        expense_date   = COALESCE(p_expense_date, expense_date),
        payment_method = COALESCE(p_payment_method, payment_method),
        notes          = COALESCE(p_notes, notes),
        updated_at     = NOW()
    WHERE expense_id = p_expense_id
      AND company_id = p_company_id
      AND branch_id  = p_branch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found.'; END IF;

    RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;


-- =============================================================================
-- C26-C28: Staff Module (update, schedule, business hours)
-- =============================================================================

-- C26. update_staff_atomic  — Gate1 + Gate2(update_staff)
CREATE OR REPLACE FUNCTION app.update_staff_atomic(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_staff_id         uuid,
    p_staff_name       text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_email            text    DEFAULT NULL,
    p_role_name        text    DEFAULT NULL,
    p_services_offered text    DEFAULT NULL,
    p_notes            text    DEFAULT NULL,
    p_status           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name  text := NULLIF(TRIM(p_staff_name), '');
    v_clean_phone text := CASE WHEN p_phone IS NOT NULL THEN regexp_replace(TRIM(p_phone), '[^0-9]', '', 'g') ELSE NULL END;
    v_clean_email text := CASE WHEN p_email IS NOT NULL THEN NULLIF(LOWER(TRIM(p_email)), '') ELSE NULL END;
    v_status      text := CASE WHEN p_status IS NOT NULL THEN NULLIF(LOWER(TRIM(p_status)), '') ELSE NULL END;
    v_old_name    text;
    v_old_phone   text;
BEGIN
    PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'update_staff');

    SELECT staff_name, phone INTO v_old_name, v_old_phone
    FROM app.staff
    WHERE staff_id = p_staff_id AND company_id = p_company_id AND branch_id = p_branch_id
      AND status <> 'deleted';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff member not found.');
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('active', 'inactive') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status must be active or inactive.');
    END IF;

    IF v_clean_phone IS NOT NULL AND v_clean_phone <> regexp_replace(COALESCE(v_old_phone,''), '[^0-9]', '', 'g') THEN
        IF EXISTS (
            SELECT 1 FROM app.staff
            WHERE company_id = p_company_id AND branch_id = p_branch_id
              AND staff_id <> p_staff_id AND status <> 'deleted'
              AND regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = v_clean_phone
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Another staff member already uses this phone number.');
        END IF;
    END IF;

    UPDATE app.staff
    SET staff_name       = COALESCE(v_clean_name, staff_name),
        phone            = COALESCE(TRIM(p_phone), phone),
        email            = COALESCE(v_clean_email, email),
        role_name        = COALESCE(NULLIF(TRIM(p_role_name),''), role_name),
        services_offered = COALESCE(NULLIF(TRIM(p_services_offered),''), services_offered),
        notes            = COALESCE(NULLIF(TRIM(p_notes),''), notes),
        status           = COALESCE(v_status, status),
        updated_at       = NOW()
    WHERE staff_id = p_staff_id AND company_id = p_company_id;

    RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- C27. save_staff_schedule_atomic  — Gate1 + Gate2(create_staff_schedule)
CREATE OR REPLACE FUNCTION app.save_staff_schedule_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_staff_id    uuid,
    p_schedules   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_schedule jsonb;
    v_day      text;
    v_shift_id uuid;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'create_staff_schedule');

    PERFORM 1 FROM app.staff
    WHERE staff_id = p_staff_id AND company_id = p_company_id AND status <> 'deleted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found.';
    END IF;

    FOR v_schedule IN SELECT value FROM jsonb_array_elements(p_schedules)
    LOOP
        v_day := LOWER(TRIM(v_schedule->>'day_of_week'));

        SELECT shift_id INTO v_shift_id
        FROM app.staff_schedules
        WHERE staff_id = p_staff_id AND company_id = p_company_id
          AND LOWER(day_of_week) = v_day
        LIMIT 1;

        IF FOUND THEN
            UPDATE app.staff_schedules
            SET is_working  = COALESCE((v_schedule->>'is_working')::boolean, false),
                start_time  = (v_schedule->>'start_time')::time,
                end_time    = (v_schedule->>'end_time')::time,
                updated_at  = NOW()
            WHERE shift_id = v_shift_id;
        ELSE
            INSERT INTO app.staff_schedules (
                shift_id, staff_id, company_id, branch_id,
                day_of_week, is_working, start_time, end_time,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_staff_id, p_company_id, p_branch_id,
                v_day,
                COALESCE((v_schedule->>'is_working')::boolean, false),
                (v_schedule->>'start_time')::time,
                (v_schedule->>'end_time')::time,
                NOW(), NOW()
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id);
END;
$$;

-- C28. save_business_hours_atomic  — Gate1 + Gate2(settings_edit)
CREATE OR REPLACE FUNCTION app.save_business_hours_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_hours      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_hour  jsonb;
    v_day   text;
    v_id    uuid;
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'settings_edit');

    FOR v_hour IN SELECT value FROM jsonb_array_elements(p_hours)
    LOOP
        v_day := LOWER(TRIM(v_hour->>'day_of_week'));

        SELECT id INTO v_id
        FROM app.business_hours
        WHERE company_id = p_company_id AND branch_id = p_branch_id
          AND LOWER(day_of_week) = v_day
        LIMIT 1;

        IF FOUND THEN
            UPDATE app.business_hours
            SET is_open    = COALESCE((v_hour->>'is_open')::boolean, false),
                open_time  = (v_hour->>'open_time')::time,
                close_time = (v_hour->>'close_time')::time,
                updated_at = NOW()
            WHERE id = v_id;
        ELSE
            INSERT INTO app.business_hours (
                id, company_id, branch_id, day_of_week,
                is_open, open_time, close_time,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_company_id, p_branch_id, v_day,
                COALESCE((v_hour->>'is_open')::boolean, false),
                (v_hour->>'open_time')::time,
                (v_hour->>'close_time')::time,
                NOW(), NOW()
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- C29-C33: Settings Module
-- =============================================================================

-- C29. save_company_tax_settings_atomic  — Gate1 + Gate2(settings_edit)
CREATE OR REPLACE FUNCTION app.save_company_tax_settings_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_tax_enabled boolean DEFAULT false,
    p_tax_name    text    DEFAULT 'GST',
    p_tax_rate    numeric DEFAULT 0,
    p_tax_number  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'settings_edit');

    INSERT INTO app.company_tax_settings (
        id, company_id, branch_id,
        tax_enabled, tax_name, tax_rate, tax_number,
        created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_company_id, p_branch_id,
        COALESCE(p_tax_enabled, false),
        COALESCE(p_tax_name, 'GST'),
        COALESCE(p_tax_rate, 0),
        p_tax_number,
        NOW(), NOW()
    )
    ON CONFLICT (company_id, branch_id) DO UPDATE
    SET tax_enabled = EXCLUDED.tax_enabled,
        tax_name    = EXCLUDED.tax_name,
        tax_rate    = EXCLUDED.tax_rate,
        tax_number  = EXCLUDED.tax_number,
        updated_at  = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C30. save_business_payment_settings_atomic  — Gate1 + Gate2(settings_edit)
CREATE OR REPLACE FUNCTION app.save_business_payment_settings_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_accepted_methods text[] DEFAULT NULL,
    p_default_method   text   DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'settings_edit');

    INSERT INTO app.payment_settings (
        id, company_id, branch_id,
        accepted_methods, default_method,
        created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_company_id, p_branch_id,
        COALESCE(p_accepted_methods, ARRAY['cash']::text[]),
        COALESCE(p_default_method, 'cash'),
        NOW(), NOW()
    )
    ON CONFLICT (company_id, branch_id) DO UPDATE
    SET accepted_methods = EXCLUDED.accepted_methods,
        default_method   = EXCLUDED.default_method,
        updated_at       = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C31. save_invoice_settings_atomic  — Gate1 + Gate2(settings_edit)
CREATE OR REPLACE FUNCTION app.save_invoice_settings_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_invoice_type    text    DEFAULT 'booking',
    p_settings        jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'settings_edit');

    INSERT INTO app.invoice_settings (
        id, company_id, branch_id, invoice_type, settings,
        created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_company_id, p_branch_id,
        COALESCE(p_invoice_type, 'booking'),
        COALESCE(p_settings, '{}'),
        NOW(), NOW()
    )
    ON CONFLICT (company_id, branch_id, invoice_type) DO UPDATE
    SET settings   = EXCLUDED.settings,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C32. save_notification_settings_atomic  — Gate1 + Gate2(settings_edit)
CREATE OR REPLACE FUNCTION app.save_notification_settings_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_settings    jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'settings_edit');

    INSERT INTO app.notification_settings (
        id, company_id, branch_id, settings,
        created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_company_id, p_branch_id,
        COALESCE(p_settings, '{}'), NOW(), NOW()
    )
    ON CONFLICT (company_id, branch_id) DO UPDATE
    SET settings   = EXCLUDED.settings,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- C33. save_role_permissions_atomic  — Gate1 + Gate2(role_edit)
-- (Keeps Owner-protection guard from original)
CREATE OR REPLACE FUNCTION app.save_role_permissions_atomic(
    p_company_id      uuid,
    p_branch_id       uuid,
    p_role_id         uuid,
    p_role_name       text,
    p_permission_keys jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_role_name     text;
    v_existing_ids  uuid[];
    v_primary_id    uuid;
    v_extra_ids     uuid[];
BEGIN
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;
    PERFORM shared.check_subscription(p_company_id);
    PERFORM shared.check_permission(p_company_id, 'role_edit');

    SELECT role_name INTO v_role_name
    FROM shared.roles
    WHERE role_id = p_role_id AND company_id = p_company_id AND status <> 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found.';
    END IF;

    IF LOWER(v_role_name) = 'owner' THEN
        RAISE EXCEPTION 'Owner role permissions cannot be modified.';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_existing_ids
    FROM shared.role_permissions
    WHERE role_id = p_role_id AND company_id = p_company_id;

    IF v_existing_ids IS NOT NULL AND array_length(v_existing_ids, 1) > 0 THEN
        v_primary_id := v_existing_ids[1];
        UPDATE shared.role_permissions SET
            branch_id      = p_branch_id,
            role_name      = p_role_name,
            permission_key = p_permission_keys::text,
            status         = 'active',
            updated_at     = NOW()
        WHERE id = v_primary_id;

        IF array_length(v_existing_ids, 1) > 1 THEN
            v_extra_ids := v_existing_ids[2:];
            DELETE FROM shared.role_permissions WHERE id = ANY(v_extra_ids);
        END IF;
    ELSE
        INSERT INTO shared.role_permissions (
            id, company_id, branch_id,
            role_id, role_name,
            permission_key, status,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_company_id, p_branch_id,
            p_role_id, p_role_name,
            p_permission_keys::text, 'active',
            NOW(), NOW()
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- END OF PHASE C — ALL REMAINING RPCs HARDENED
-- =============================================================================
-- Total RPCs now protected by backend gates:
--   Phase B: 12 critical money + capacity RPCs  (Gate1+Gate2+Gate3+Quota)
--   Phase C: 25 operational + settings RPCs     (Gate1+Gate2+Gate3 where applicable)
--
-- Exempt RPCs (intentionally NOT gated by subscription):
--   cancel_subscription_addon_atomic, reactivate_subscription_addon_atomic
--   sync_plan_features_atomic, sync_usage_counter_atomic
--   submit_customer_review_atomic, update_user_last_login_atomic
--   update_user_profile_name_phone_atomic, upsert_user_preferences_atomic
--   mark_notification_read, mark_all_notifications_read
--   submit_issue_atomic, add_issue_message_atomic
--   save_billing_information_atomic
--   backfill_oauth_phone_atomic (admin/service_role only)
--
-- Next: Phase D — Frontend migration (global-auth-guard.js → get_session_context RPC)
--       Phase E — RLS hardening on plan_features, role_permissions, subscriptions
-- =============================================================================

