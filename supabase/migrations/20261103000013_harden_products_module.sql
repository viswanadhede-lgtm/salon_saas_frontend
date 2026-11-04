-- ============================================================================
-- Migration: 20261103000013_harden_products_module.sql
-- Module 8: Products & Retail Inventory - Zero-Trust Backend-First Hardening
--
-- Procedures Defined:
--   1. app.create_product_category_atomic (wrapped by public.create_product_category_atomic)
--   2. app.update_product_category_atomic (wrapped by public.update_product_category_atomic)
--   3. app.delete_product_category_atomic (wrapped by public.delete_product_category_atomic)
--   4. app.create_product_atomic (wrapped by public.create_product_atomic)
--   5. app.update_product_atomic (wrapped by public.update_product_atomic)
--   6. app.delete_product_atomic (wrapped by public.delete_product_atomic)
--   7. app.adjust_product_stock_atomic (wrapped by public.adjust_product_stock_atomic)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING SIGNATURES FOR CLEAN RE-CREATION
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_product_category_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_product_category_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_product_category_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_product_category_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_product_category_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_product_category_atomic CASCADE;

DROP FUNCTION IF EXISTS public.create_product_atomic CASCADE;
DROP FUNCTION IF EXISTS app.create_product_atomic CASCADE;
DROP FUNCTION IF EXISTS public.update_product_atomic CASCADE;
DROP FUNCTION IF EXISTS app.update_product_atomic CASCADE;
DROP FUNCTION IF EXISTS public.delete_product_atomic CASCADE;
DROP FUNCTION IF EXISTS app.delete_product_atomic CASCADE;

DROP FUNCTION IF EXISTS public.adjust_product_stock_atomic CASCADE;
DROP FUNCTION IF EXISTS app.adjust_product_stock_atomic CASCADE;

-- ----------------------------------------------------------------------------
-- 2. CREATE PRODUCT CATEGORY ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_name text,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_new_id uuid := gen_random_uuid();
    v_category app.product_categories%ROWTYPE;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Clean Name & Validation
    v_clean_name := TRIM(COALESCE(p_category_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Category name is required.';
    END IF;

    -- 3. Duplicate Category Name Check
    IF EXISTS (
        SELECT 1 FROM app.product_categories
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND LOWER(TRIM(category_name)) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'A category named "%" already exists.', v_clean_name;
    END IF;

    -- 4. Insert
    INSERT INTO app.product_categories (
        category_id,
        company_id,
        branch_id,
        category_name,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        p_company_id,
        p_branch_id,
        v_clean_name,
        NULLIF(TRIM(p_description), ''),
        'active',
        NOW(),
        NOW()
    )
    RETURNING * INTO v_category;

    RETURN to_jsonb(v_category);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_name text,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_product_category_atomic(
        p_company_id,
        p_branch_id,
        p_category_name,
        p_description
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. UPDATE PRODUCT CATEGORY ATOMIC (WITH AUTOMATIC PRODUCT CASCADE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid,
    p_category_name text,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_category app.product_categories%ROWTYPE;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.product_categories
        WHERE category_id = p_category_id
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Category not found or access denied.';
    END IF;

    -- 3. Clean Name & Validation
    v_clean_name := TRIM(COALESCE(p_category_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Category name is required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.product_categories
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND category_id != p_category_id
          AND LOWER(TRIM(category_name)) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Another category named "%" already exists.', v_clean_name;
    END IF;

    -- 4. Update Category
    UPDATE app.product_categories
    SET
        category_name = v_clean_name,
        description   = NULLIF(TRIM(p_description), ''),
        updated_at    = NOW()
    WHERE category_id = p_category_id
      AND company_id = p_company_id
    RETURNING * INTO v_category;

    -- 5. Atomic Cascade Rename to Products
    UPDATE app.products
    SET
        category_name = v_clean_name,
        updated_at    = NOW()
    WHERE category_id = p_category_id
      AND company_id = p_company_id;

    RETURN to_jsonb(v_category);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid,
    p_category_name text,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_product_category_atomic(
        p_company_id,
        p_branch_id,
        p_category_id,
        p_category_name,
        p_description
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. DELETE PRODUCT CATEGORY ATOMIC (WITH DEPENDENCY BLOCKER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_cat_name text;
    v_product_count integer;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Existence Check
    SELECT category_name INTO v_cat_name
    FROM app.product_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Category not found or already deleted.';
    END IF;

    -- 3. Dependency Blocker: Active Products Assigned
    SELECT COUNT(*) INTO v_product_count
    FROM app.products
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF v_product_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete category "%": % active product(s) are assigned to it.', v_cat_name, v_product_count;
    END IF;

    -- 4. Soft Delete
    UPDATE app.product_categories
    SET status = 'deleted',
        updated_at = NOW()
    WHERE category_id = p_category_id
      AND company_id = p_company_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_product_category_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_product_category_atomic(
        p_company_id,
        p_branch_id,
        p_category_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. CREATE PRODUCT ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid,
    p_product_name text,
    p_price numeric,
    p_stock_quantity bigint DEFAULT 0,
    p_status text DEFAULT 'active',
    p_description text DEFAULT NULL,
    p_product_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_cat_name text;
    v_new_id uuid := gen_random_uuid();
    v_product app.products%ROWTYPE;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Category Lookup & Verification
    SELECT category_name INTO v_cat_name
    FROM app.product_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product category not found or has been deleted.';
    END IF;

    -- 3. Clean Name & Validation
    v_clean_name := TRIM(COALESCE(p_product_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Product name is required.';
    END IF;

    -- 4. Duplicate Check within Category & Tenant
    IF EXISTS (
        SELECT 1 FROM app.products
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND category_id = p_category_id
          AND LOWER(TRIM(product_name)) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'A product named "%" already exists in this category.', v_clean_name;
    END IF;

    -- 5. Price & Stock Validations
    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'Product price must be non-negative.';
    END IF;

    IF p_stock_quantity IS NOT NULL AND p_stock_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity must be non-negative.';
    END IF;

    -- 6. Insert
    INSERT INTO app.products (
        product_id,
        company_id,
        branch_id,
        category_id,
        category_name,
        product_name,
        description,
        price,
        stock_quantity,
        status,
        product_image_url,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        p_company_id,
        p_branch_id,
        p_category_id,
        v_cat_name,
        v_clean_name,
        NULLIF(TRIM(p_description), ''),
        p_price,
        COALESCE(p_stock_quantity, 0),
        COALESCE(NULLIF(TRIM(p_status), ''), 'active'),
        NULLIF(TRIM(p_product_image_url), ''),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_product;

    RETURN to_jsonb(v_product);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_category_id uuid,
    p_product_name text,
    p_price numeric,
    p_stock_quantity bigint DEFAULT 0,
    p_status text DEFAULT 'active',
    p_description text DEFAULT NULL,
    p_product_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_product_atomic(
        p_company_id,
        p_branch_id,
        p_category_id,
        p_product_name,
        p_price,
        p_stock_quantity,
        p_status,
        p_description,
        p_product_image_url
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. UPDATE PRODUCT ATOMIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.update_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid,
    p_category_id uuid,
    p_product_name text,
    p_price numeric,
    p_stock_quantity bigint,
    p_status text DEFAULT 'active',
    p_description text DEFAULT NULL,
    p_product_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_clean_name text;
    v_cat_name text;
    v_product app.products%ROWTYPE;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.products
        WHERE product_id = p_product_id
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Product not found or access denied.';
    END IF;

    -- 3. Category Lookup & Verification
    SELECT category_name INTO v_cat_name
    FROM app.product_categories
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product category not found or has been deleted.';
    END IF;

    -- 4. Clean Name & Duplicate Check
    v_clean_name := TRIM(COALESCE(p_product_name, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Product name is required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM app.products
        WHERE company_id = p_company_id
          AND (branch_id = p_branch_id OR branch_id IS NULL OR p_branch_id IS NULL)
          AND category_id = p_category_id
          AND product_id != p_product_id
          AND LOWER(TRIM(product_name)) = LOWER(v_clean_name)
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Another product named "%" already exists in this category.', v_clean_name;
    END IF;

    -- 5. Price & Stock Validations
    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'Product price must be non-negative.';
    END IF;

    IF p_stock_quantity IS NOT NULL AND p_stock_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity must be non-negative.';
    END IF;

    -- 6. Update
    UPDATE app.products
    SET
        category_id       = p_category_id,
        category_name     = v_cat_name,
        product_name      = v_clean_name,
        price             = p_price,
        stock_quantity    = COALESCE(p_stock_quantity, stock_quantity),
        status            = COALESCE(NULLIF(TRIM(p_status), ''), 'active'),
        description       = NULLIF(TRIM(p_description), ''),
        product_image_url = COALESCE(NULLIF(TRIM(p_product_image_url), ''), product_image_url),
        updated_at        = NOW()
    WHERE product_id = p_product_id
      AND company_id = p_company_id
    RETURNING * INTO v_product;

    RETURN to_jsonb(v_product);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid,
    p_category_id uuid,
    p_product_name text,
    p_price numeric,
    p_stock_quantity bigint,
    p_status text DEFAULT 'active',
    p_description text DEFAULT NULL,
    p_product_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.update_product_atomic(
        p_company_id,
        p_branch_id,
        p_product_id,
        p_category_id,
        p_product_name,
        p_price,
        p_stock_quantity,
        p_status,
        p_description,
        p_product_image_url
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. DELETE PRODUCT ATOMIC (SOFT DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Existence Check
    IF NOT EXISTS (
        SELECT 1 FROM app.products
        WHERE product_id = p_product_id
          AND company_id = p_company_id
          AND status != 'deleted'
    ) THEN
        RAISE EXCEPTION 'Product not found or already deleted.';
    END IF;

    -- 3. Soft Delete (Preserves historical app.sales references)
    UPDATE app.products
    SET status = 'deleted',
        updated_at = NOW()
    WHERE product_id = p_product_id
      AND company_id = p_company_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_product_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.delete_product_atomic(
        p_company_id,
        p_branch_id,
        p_product_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. ADJUST PRODUCT STOCK ATOMIC (ROW-LOCKED CONCURRENCY SAFE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.adjust_product_stock_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid,
    p_delta_quantity bigint,
    p_reason text DEFAULT 'manual_adjustment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_curr_stock bigint;
    v_prod_name text;
    v_new_stock bigint;
BEGIN
    -- 1. Tenant Verification
    IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
    END IF;

    -- 2. Existence Check and Row Lock
    SELECT stock_quantity, product_name INTO v_curr_stock, v_prod_name
    FROM app.products
    WHERE product_id = p_product_id
      AND company_id = p_company_id
      AND status != 'deleted'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found or has been deleted.';
    END IF;

    -- 3. Negative Stock Guard
    v_new_stock := COALESCE(v_curr_stock, 0) + p_delta_quantity;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product "%". Current stock: %, requested change: %.',
            v_prod_name, v_curr_stock, p_delta_quantity;
    END IF;

    -- 4. Update Stock
    UPDATE app.products
    SET stock_quantity = v_new_stock,
        updated_at = NOW()
    WHERE product_id = p_product_id
      AND company_id = p_company_id;

    RETURN jsonb_build_object(
        'product_id',     p_product_id,
        'product_name',   v_prod_name,
        'previous_stock', v_curr_stock,
        'delta',          p_delta_quantity,
        'new_stock',      v_new_stock,
        'reason',         COALESCE(p_reason, 'manual_adjustment')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock_atomic(
    p_company_id uuid,
    p_branch_id uuid,
    p_product_id uuid,
    p_delta_quantity bigint,
    p_reason text DEFAULT 'manual_adjustment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.adjust_product_stock_atomic(
        p_company_id,
        p_branch_id,
        p_product_id,
        p_delta_quantity,
        p_reason
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. GRANT EXECUTE PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app.create_product_category_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_product_category_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.update_product_category_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_category_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.delete_product_category_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_product_category_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.create_product_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_product_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.update_product_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.delete_product_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_product_atomic TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION app.adjust_product_stock_atomic TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock_atomic TO authenticated, anon, service_role;

