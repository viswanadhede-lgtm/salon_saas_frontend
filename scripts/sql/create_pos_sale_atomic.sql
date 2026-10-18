-- ============================================================================
-- RPC FUNCTION: public.create_pos_sale_atomic
-- Purpose: Atomically validate & deduct stock, insert line items in sales,
--          insert consolidated receipt in sales_for_business_transactions,
--          and record discount in public.discount_usages (including discount_id).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_pos_sale_atomic(
    p_company_id uuid, 
    p_branch_id uuid, 
    p_sale_id uuid, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_customer_name text DEFAULT 'Walk-in Customer'::text, 
    p_customer_phone text DEFAULT ''::text, 
    p_payment_method text DEFAULT 'cash'::text, 
    p_staff_id uuid DEFAULT NULL::uuid, 
    p_staff_name text DEFAULT 'System'::text, 
    p_items jsonb DEFAULT '[]'::jsonb, 
    p_discount_type text DEFAULT NULL::text, 
    p_discount_name text DEFAULT NULL::text, 
    p_discount_amount numeric DEFAULT 0, 
    p_final_amount numeric DEFAULT 0,
    p_discount_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item record;
    v_total_price numeric := 0;
    v_total_quantity bigint := 0;
    v_product_ids uuid[] := '{}';
    v_product_names text[] := '{}';
    v_category_ids uuid[] := '{}';
    v_category_names text[] := '{}';
    v_deducted_items jsonb := '[]'::jsonb;
    v_current_stock numeric;
    v_current_name text;
    v_remaining_stock numeric;
    v_item_qty bigint;
    v_item_price numeric;
    v_item_total numeric;
    v_item_prod_id uuid;
    v_item_cat_id uuid;
    v_discount_id uuid := p_discount_id;
BEGIN
    -- 1. Basic validation
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart cannot be empty for POS sale';
    END IF;

    -- Standardize payment method
    p_payment_method := LOWER(COALESCE(p_payment_method, 'cash'));
    IF p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        p_payment_method := 'cash';
    END IF;

    -- 2. Process each item: Stock deduction + Insert into sales
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id uuid,
        product_name text,
        category_id uuid,
        category_name text,
        quantity bigint,
        price numeric
    )
    LOOP
        v_item_prod_id := v_item.product_id;
        v_item_cat_id := v_item.category_id;
        v_item_qty := COALESCE(v_item.quantity, 1);
        v_item_price := COALESCE(v_item.price, 0);
        v_item_total := v_item_qty * v_item_price;

        -- Lock row and check current stock using product_id
        SELECT stock_quantity, product_name
        INTO v_current_stock, v_current_name
        FROM products
        WHERE product_id = v_item_prod_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product not found with ID: %', v_item_prod_id;
        END IF;

        IF v_current_stock < v_item_qty THEN
            RAISE EXCEPTION 'Insufficient stock for "%": requested %, available %', 
                COALESCE(v_current_name, v_item.product_name), v_item_qty, v_current_stock;
        END IF;

        v_remaining_stock := v_current_stock - v_item_qty;

        -- Deduct inventory using product_id
        UPDATE products
        SET stock_quantity = v_remaining_stock,
            updated_at = NOW()
        WHERE product_id = v_item_prod_id;

        -- Record deduction info for alert return
        v_deducted_items := v_deducted_items || jsonb_build_object(
            'product_id', v_item_prod_id,
            'product_name', COALESCE(v_current_name, v_item.product_name),
            'remaining_stock', v_remaining_stock
        );

        -- Insert line item into 'sales' with status = 'paid'
        INSERT INTO sales (
            sale_id,
            company_id,
            branch_id,
            product_id,
            product_name,
            category_id,
            customer_id,
            customer_name,
            customer_phone,
            quantity,
            price,
            total_amount,
            payment_method,
            status,
            staff_name,
            created_at
        ) VALUES (
            p_sale_id,
            p_company_id,
            p_branch_id,
            v_item_prod_id,
            COALESCE(v_item.product_name, v_current_name),
            v_item_cat_id,
            p_customer_id,
            p_customer_name,
            p_customer_phone,
            v_item_qty,
            v_item_price,
            v_item_total,
            p_payment_method,
            'paid',
            p_staff_name,
            NOW()
        );

        -- Accumulate totals and arrays for summary row
        v_total_price := v_total_price + v_item_total;
        v_total_quantity := v_total_quantity + v_item_qty;

        IF v_item_prod_id IS NOT NULL THEN
            v_product_ids := array_append(v_product_ids, v_item_prod_id);
        END IF;
        IF v_item.product_name IS NOT NULL THEN
            v_product_names := array_append(v_product_names, v_item.product_name);
        END IF;
        IF v_item_cat_id IS NOT NULL THEN
            v_category_ids := array_append(v_category_ids, v_item_cat_id);
        END IF;
        IF v_item.category_name IS NOT NULL THEN
            v_category_names := array_append(v_category_names, v_item.category_name);
        END IF;
    END LOOP;

    -- Compute final_amount fallback if not passed
    IF p_final_amount IS NULL OR p_final_amount = 0 THEN
        p_final_amount := GREATEST(0, v_total_price - COALESCE(p_discount_amount, 0));
    END IF;

    -- 3. Insert consolidated summary row into 'sales_for_business_transactions'
    INSERT INTO sales_for_business_transactions (
        company_id,
        branch_id,
        sale_id,
        product_ids,
        product_names,
        category_ids,
        category_names,
        customer_id,
        customer_name,
        customer_phone,
        total_quantity,
        total_price,
        payment_method,
        payment_status,
        staff_id,
        staff_name,
        discount_type,
        discount_name,
        discount_amount,
        final_amount,
        created_at
    ) VALUES (
        p_company_id,
        p_branch_id,
        p_sale_id,
        v_product_ids,
        v_product_names,
        v_category_ids,
        v_category_names,
        p_customer_id,
        p_customer_name,
        p_customer_phone,
        v_total_quantity,
        v_total_price,
        p_payment_method,
        'paid',
        p_staff_id,
        p_staff_name,
        p_discount_type,
        p_discount_name,
        COALESCE(p_discount_amount, 0),
        p_final_amount,
        NOW()
    );

    -- 4. [NEW] Track discount in public.discount_usages
    IF COALESCE(p_discount_amount, 0) > 0 THEN
        -- Resolve discount_id from table if not directly provided
        IF v_discount_id IS NULL AND p_discount_type = 'coupon' AND p_discount_name IS NOT NULL THEN
            SELECT coupon_id INTO v_discount_id FROM public.coupons WHERE coupon_code = p_discount_name LIMIT 1;
        ELSIF v_discount_id IS NULL AND p_discount_type = 'offer' AND p_discount_name IS NOT NULL THEN
            SELECT offer_id INTO v_discount_id FROM public.offers WHERE offer_name = p_discount_name LIMIT 1;
        END IF;

        INSERT INTO public.discount_usages (
            company_id,
            branch_id,
            customer_id,
            reference_type,
            reference_id,
            discount_type,
            discount_id,
            discount_name,
            discount_amount,
            status,
            used_at,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            p_branch_id,
            p_customer_id,
            'pos',
            p_sale_id,
            p_discount_type,
            v_discount_id,
            p_discount_name,
            p_discount_amount,
            'applied',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- 5. Return result
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'total_quantity', v_total_quantity,
        'total_price', v_total_price,
        'final_amount', p_final_amount,
        'deducted_items', v_deducted_items
    );
END;
$function$;
