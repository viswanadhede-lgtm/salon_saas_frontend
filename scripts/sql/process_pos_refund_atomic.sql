-- ============================================================================
-- RPC FUNCTION: process_pos_refund_atomic
-- ============================================================================
-- Atomic POS product refund and return handler.
--
-- Actions executed in a single atomic transaction:
--   1. Restocks inventory in `products` (stock_quantity = stock_quantity + return_qty).
--   2. Updates returned line items in `sales` to status = 'refunded' (or splits on partial qty).
--   3. Checks if all items in the original sale are refunded:
--        - If all refunded: updates `sales_for_business_transactions.payment_status` = 'refunded'.
--        - If partial: updates `sales_for_business_transactions.payment_status` = 'partial'.
--   4. Inserts a refund ledger record into `business_transactions` (reference_type = 'product', status = 'refunded').
--   5. Reverses customer lifetime spend in `customers` (total_spent = total_spent - total_refund).
-- ============================================================================

-- 1. Drop all previous overloaded versions cleanly
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'process_pos_refund_atomic'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_sig || ' CASCADE';
    END LOOP;
END $$;

-- 2. Create unified atomic refund function
CREATE OR REPLACE FUNCTION public.process_pos_refund_atomic(
    p_original_sale_id uuid,
    p_refund_sale_id uuid,
    p_company_id uuid,
    p_branch_id uuid,
    p_customer_id uuid DEFAULT NULL,
    p_customer_name text DEFAULT 'Walk-in',
    p_customer_phone text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_staff_id uuid DEFAULT NULL,
    p_staff_name text DEFAULT 'System',
    p_refund_reason text DEFAULT '',
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    v_item_id uuid;
    v_product_id uuid;
    v_product_name text;
    v_category_id uuid;
    v_return_qty int;
    v_price numeric;
    v_line_total numeric;
    v_total_refund numeric := 0;
    v_existing_item RECORD;
    v_remaining_unrefunded int;
    v_new_status text;
BEGIN
    IF p_original_sale_id IS NULL THEN
        RAISE EXCEPTION 'Original sale ID is required';
    END IF;

    -- 1. Restock products & update item lines in sales table
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id    := NULL;
        IF item ? 'item_id' AND item->>'item_id' IS NOT NULL AND item->>'item_id' <> '' THEN
            v_item_id := (item->>'item_id')::uuid;
        END IF;

        v_product_id := NULL;
        IF item ? 'product_id' AND item->>'product_id' IS NOT NULL AND item->>'product_id' <> '' THEN
            v_product_id := (item->>'product_id')::uuid;
        END IF;

        v_product_name := COALESCE(item->>'product_name', 'Product');
        v_return_qty   := GREATEST(1, COALESCE((item->>'return_qty')::int, 1));
        v_price        := COALESCE((item->>'price')::numeric, 0);
        v_line_total   := v_return_qty * v_price;
        v_total_refund := v_total_refund + v_line_total;

        -- 1a. Restock product inventory
        IF v_product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = COALESCE(stock_quantity, 0) + v_return_qty,
                updated_at = NOW()
            WHERE product_id = v_product_id;
        END IF;

        -- 1b. Update sales line item
        IF v_item_id IS NOT NULL THEN
            SELECT * INTO v_existing_item FROM public.sales WHERE id = v_item_id FOR UPDATE;
        ELSE
            SELECT * INTO v_existing_item FROM public.sales 
            WHERE sale_id = p_original_sale_id 
              AND (product_id = v_product_id OR product_name = v_product_name)
              AND status <> 'refunded'
            LIMIT 1 FOR UPDATE;
        END IF;

        IF FOUND THEN
            IF v_return_qty >= v_existing_item.quantity THEN
                UPDATE public.sales SET status = 'refunded', updated_at = NOW() WHERE id = v_existing_item.id;
            ELSE
                UPDATE public.sales 
                SET quantity = v_existing_item.quantity - v_return_qty,
                    total_amount = (v_existing_item.quantity - v_return_qty) * v_existing_item.price,
                    updated_at = NOW()
                WHERE id = v_existing_item.id;

                INSERT INTO public.sales (
                    sale_id, branch_id, company_id, product_id, product_name, category_id,
                    customer_id, customer_name, customer_phone, quantity, price, total_amount,
                    payment_method, status, staff_name, created_at, updated_at
                ) VALUES (
                    p_original_sale_id, p_branch_id, p_company_id, v_product_id, v_product_name,
                    v_existing_item.category_id, p_customer_id, p_customer_name, p_customer_phone,
                    v_return_qty, v_price, v_line_total, p_payment_method, 'refunded', p_staff_name, NOW(), NOW()
                );
            END IF;
        END IF;
    END LOOP;

    -- 2. Check if all items in original sale are now refunded
    SELECT COUNT(*) INTO v_remaining_unrefunded
    FROM public.sales
    WHERE sale_id = p_original_sale_id AND status <> 'refunded';

    IF v_remaining_unrefunded = 0 THEN
        v_new_status := 'refunded';
    ELSE
        v_new_status := 'partial';
    END IF;

    -- 3. Update the original sale row so the table badge flips to REFUNDED immediately
    UPDATE public.sales_for_business_transactions
    SET payment_status = v_new_status,
        updated_at = NOW()
    WHERE sale_id = p_original_sale_id;

    -- 4. Record the refund in financial ledger
    INSERT INTO public.business_transactions (
        company_id, branch_id, reference_id, reference_type, amount, final_amount,
        currency, payment_method, status, notes, created_by, paid_at, created_at, updated_at
    ) VALUES (
        p_company_id, p_branch_id, p_original_sale_id, 'product', v_total_refund, v_total_refund,
        'INR', p_payment_method, 'refunded', COALESCE(NULLIF(p_refund_reason, ''), 'POS Sale Refund'),
        p_staff_id, NOW(), NOW(), NOW()
    );

    -- 5. Reverse customer total spent
    IF p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_total_refund)
        WHERE customer_id = p_customer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'original_sale_id', p_original_sale_id,
        'payment_status', v_new_status,
        'total_refunded', v_total_refund
    );
END;
$$;

-- 3. Grant execution permissions
GRANT EXECUTE ON FUNCTION public.process_pos_refund_atomic TO anon, authenticated, service_role;
