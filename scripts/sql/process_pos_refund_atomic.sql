-- ============================================================================
-- RPC FUNCTION: public.process_pos_refund_atomic
-- Purpose: Atomically validate return items, restore product inventory, append refund
--          line items, insert consolidated refund summary, calculate price-weighted
--          proportional discount reversal, and update public.discount_usages.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_pos_refund_atomic(
    p_original_sale_id uuid, 
    p_refund_sale_id uuid, 
    p_company_id uuid, 
    p_branch_id uuid, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_customer_name text DEFAULT 'Walk-in'::text, 
    p_customer_phone text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'cash'::text, 
    p_staff_id uuid DEFAULT NULL::uuid, 
    p_staff_name text DEFAULT 'System'::text, 
    p_refund_reason text DEFAULT ''::text, 
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_original_summary public.sales_for_business_transactions%ROWTYPE;
    v_original_item public.sales%ROWTYPE;

    v_item jsonb;
    v_item_id uuid;
    v_product_id uuid;
    v_product_name text;
    v_category_id uuid;
    v_category_name text;

    v_return_qty bigint;
    v_price numeric;
    v_line_total numeric;
    v_total_returned_gross numeric := 0;
    v_total_quantity bigint := 0;

    v_sold_qty bigint;
    v_previously_refunded_qty bigint;
    v_requested_product_qty bigint;

    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_product_names text[] := ARRAY[]::text[];
    v_category_ids uuid[] := ARRAY[]::uuid[];
    v_category_names text[] := ARRAY[]::text[];

    -- Variables for discount reversal
    v_orig_gross_total numeric := 0;
    v_orig_discount numeric := 0;
    v_discount_to_reverse numeric := 0;
    v_final_refund_payable numeric := 0;
    v_rec_discount numeric := 0;
    v_rec_reversed numeric := 0;
    v_remaining_discount numeric := 0;
BEGIN
    -- --------------------------------------------------------
    -- A. Validate required inputs.
    -- --------------------------------------------------------
    IF p_original_sale_id IS NULL THEN
        RAISE EXCEPTION 'Original sale ID is required';
    END IF;

    IF p_refund_sale_id IS NULL THEN
        RAISE EXCEPTION 'Refund reference ID is required';
    END IF;

    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'Company ID is required';
    END IF;

    IF p_payment_method IS NULL
       OR p_payment_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid refund payment method. Allowed values: cash, upi, card';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one refund item is required';
    END IF;

    -- --------------------------------------------------------
    -- B. Lock the original sale summary.
    -- --------------------------------------------------------
    SELECT *
    INTO v_original_summary
    FROM public.sales_for_business_transactions
    WHERE sale_id = p_original_sale_id
      AND refund_reference_id IS NULL
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original sale summary not found: %', p_original_sale_id;
    END IF;

    IF v_original_summary.company_id IS DISTINCT FROM p_company_id
       OR v_original_summary.branch_id IS DISTINCT FROM p_branch_id THEN
        RAISE EXCEPTION 'Original sale does not match the supplied company and branch';
    END IF;

    -- --------------------------------------------------------
    -- C. Prevent reuse of an existing refund reference.
    -- --------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM public.sales WHERE refund_reference_id = p_refund_sale_id
    ) OR EXISTS (
        SELECT 1 FROM public.sales_for_business_transactions WHERE refund_reference_id = p_refund_sale_id
    ) THEN
        RAISE EXCEPTION 'This refund reference has already been used: %', p_refund_sale_id;
    END IF;

    -- --------------------------------------------------------
    -- D. Validate every requested item before changing stock.
    -- --------------------------------------------------------
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF COALESCE(v_item->>'item_id', '') = '' THEN
            RAISE EXCEPTION 'Each refund item must include its original sales item_id';
        END IF;

        v_item_id := (v_item->>'item_id')::uuid;

        IF COALESCE(v_item->>'return_qty', '') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'Invalid return quantity for sales item %', v_item_id;
        END IF;

        v_return_qty := (v_item->>'return_qty')::bigint;

        IF v_return_qty <= 0 THEN
            RAISE EXCEPTION 'Return quantity must be greater than zero';
        END IF;

        SELECT *
        INTO v_original_item
        FROM public.sales
        WHERE id = v_item_id
          AND sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Original sale item % was not found', v_item_id;
        END IF;

        IF v_original_item.company_id IS DISTINCT FROM p_company_id
           OR v_original_item.branch_id IS DISTINCT FROM p_branch_id THEN
            RAISE EXCEPTION 'Sale item % does not match the supplied company and branch', v_item_id;
        END IF;

        IF v_original_item.status IN ('refunded', 'cancelled', 'pending') THEN
            RAISE EXCEPTION 'Sale item % is not eligible for a refund', v_item_id;
        END IF;

        IF v_original_item.product_id IS NULL THEN
            RAISE EXCEPTION 'Sale item % has no product ID', v_item_id;
        END IF;

        v_product_id := v_original_item.product_id;

        -- Check sold qty vs previously refunded
        SELECT COALESCE(SUM(quantity), 0) INTO v_sold_qty
        FROM public.sales
        WHERE sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
          AND product_id = v_product_id
          AND status <> 'refunded';

        SELECT COALESCE(SUM(quantity), 0) INTO v_previously_refunded_qty
        FROM public.sales
        WHERE sale_id = p_original_sale_id
          AND refund_reference_id IS NOT NULL
          AND product_id = v_product_id
          AND status = 'refunded';

        SELECT COALESCE(SUM((entry.value->>'return_qty')::bigint), 0)
        INTO v_requested_product_qty
        FROM jsonb_array_elements(p_items) AS entry(value)
        JOIN public.sales AS original_line
          ON original_line.id = (entry.value->>'item_id')::uuid
         AND original_line.sale_id = p_original_sale_id
         AND original_line.refund_reference_id IS NULL
        WHERE original_line.product_id = v_product_id;

        IF v_requested_product_qty > GREATEST(0, v_sold_qty - v_previously_refunded_qty) THEN
            RAISE EXCEPTION 'Refund quantity exceeds the remaining quantity for product %', v_product_id;
        END IF;

        PERFORM 1 FROM public.products
        WHERE product_id = v_product_id
          AND company_id = p_company_id
          AND branch_id IS NOT DISTINCT FROM p_branch_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % was not found in the specified company and branch', v_product_id;
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- E. Insert one new refunded sales row per requested item.
    -- --------------------------------------------------------
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'item_id')::uuid;
        v_return_qty := (v_item->>'return_qty')::bigint;

        SELECT * INTO v_original_item
        FROM public.sales
        WHERE id = v_item_id
          AND sale_id = p_original_sale_id
          AND refund_reference_id IS NULL
        FOR UPDATE;

        v_product_id := v_original_item.product_id;
        v_product_name := v_original_item.product_name;
        v_category_id := v_original_item.category_id;
        v_price := COALESCE(v_original_item.price, 0);
        v_line_total := v_return_qty * v_price;

        SELECT category_name INTO v_category_name
        FROM public.products WHERE product_id = v_product_id;

        -- Restore inventory
        UPDATE public.products
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_return_qty,
            updated_at = NOW()
        WHERE product_id = v_product_id
          AND company_id = p_company_id
          AND branch_id IS NOT DISTINCT FROM p_branch_id;

        -- Insert refund item
        INSERT INTO public.sales (
            sale_id, branch_id, company_id, product_id, product_name, category_id,
            customer_id, customer_name, customer_phone, quantity, price, total_amount,
            payment_method, status, staff_name, refund_reference_id, created_at, updated_at
        ) VALUES (
            p_original_sale_id, p_branch_id, p_company_id, v_product_id, v_product_name, v_category_id,
            v_original_summary.customer_id, v_original_summary.customer_name, v_original_summary.customer_phone,
            v_return_qty, v_price, v_line_total, p_payment_method, 'refunded', p_staff_name,
            p_refund_sale_id, NOW(), NOW()
        );

        v_total_returned_gross := v_total_returned_gross + v_line_total;
        v_total_quantity := v_total_quantity + v_return_qty;

        v_product_ids := array_append(v_product_ids, v_product_id);
        v_product_names := array_append(v_product_names, v_product_name);
        v_category_ids := array_append(v_category_ids, v_category_id);
        v_category_names := array_append(v_category_names, v_category_name);
    END LOOP;

    IF v_total_quantity <= 0 THEN
        RAISE EXCEPTION 'Refund quantity must be greater than zero';
    END IF;

    -- --------------------------------------------------------
    -- F. [NEW] Calculate Price-Weighted Discount Reversal
    -- --------------------------------------------------------
    v_orig_gross_total := COALESCE(v_original_summary.total_price, 0);
    v_orig_discount := COALESCE(v_original_summary.discount_amount, 0);

    IF v_orig_gross_total > 0 AND v_orig_discount > 0 THEN
        -- Check how much discount is still unreversed
        SELECT discount_amount, reversal_amount
        INTO v_rec_discount, v_rec_reversed
        FROM public.discount_usages
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos'
        LIMIT 1;

        v_remaining_discount := GREATEST(0, COALESCE(v_rec_discount, v_orig_discount) - COALESCE(v_rec_reversed, 0));

        -- Proportional discount: (returned gross / original gross) * original discount
        v_discount_to_reverse := ROUND((v_total_returned_gross / v_orig_gross_total) * v_orig_discount, 2);
        v_discount_to_reverse := LEAST(v_discount_to_reverse, v_remaining_discount);
    ELSE
        v_discount_to_reverse := 0;
    END IF;

    -- Customer gets back: Gross Value of items minus their share of the discount
    v_final_refund_payable := GREATEST(0, v_total_returned_gross - v_discount_to_reverse);

    -- --------------------------------------------------------
    -- G. Insert ONE consolidated refund summary
    -- --------------------------------------------------------
    INSERT INTO public.sales_for_business_transactions (
        company_id,
        branch_id,
        sale_id,
        refund_reference_id,
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
        created_at,
        updated_at
    )
    VALUES (
        p_company_id,
        p_branch_id,
        p_original_sale_id,
        p_refund_sale_id,
        v_product_ids,
        v_product_names,
        v_category_ids,
        v_category_names,
        v_original_summary.customer_id,
        v_original_summary.customer_name,
        v_original_summary.customer_phone,
        v_total_quantity,
        v_total_returned_gross,
        p_payment_method,
        'refunded',
        p_staff_id,
        p_staff_name,
        v_original_summary.discount_type,
        v_original_summary.discount_name,
        v_discount_to_reverse,
        v_final_refund_payable,
        NOW(),
        NOW()
    );

    -- --------------------------------------------------------
    -- H. [NEW] Update public.discount_usages reversal status
    -- --------------------------------------------------------
    IF v_orig_discount > 0 THEN
        UPDATE public.discount_usages
        SET
            reversal_amount = LEAST(discount_amount, reversal_amount + v_discount_to_reverse),
            status = CASE
                WHEN (reversal_amount + v_discount_to_reverse) >= discount_amount THEN 'reversed'
                ELSE 'partially_reversed'
            END,
            reversed_at = NOW(),
            reversal_reason = COALESCE(NULLIF(TRIM(p_refund_reason), ''), 'POS Partial/Full Return'),
            updated_at = NOW()
        WHERE reference_id = p_original_sale_id
          AND reference_type = 'pos';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'original_sale_id', p_original_sale_id,
        'refund_reference_id', p_refund_sale_id,
        'gross_returned', v_total_returned_gross,
        'discount_reversed', v_discount_to_reverse,
        'total_refunded', v_final_refund_payable,
        'total_quantity', v_total_quantity,
        'payment_status', 'refunded'
    );
END;
$function$;
