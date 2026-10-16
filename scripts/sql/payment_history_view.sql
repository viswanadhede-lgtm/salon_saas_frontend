-- ============================================================================
-- VIEW: public.payment_history_view
-- Purpose: Unified financial payment history ledger aggregating:
--          1. Bookings (Services)
--          2. POS Sales & Returns (Products)
--          3. Memberships
-- Filter: Settled transactions only (status IN ('paid', 'refunded'))
-- ============================================================================

CREATE OR REPLACE VIEW public.payment_history_view AS

-- 1. BOOKINGS (Services)
SELECT
    COALESCE(bt.payment_id, b.id) AS payment_id,
    b.company_id,
    b.branch_id,
    b.booking_id AS reference_id,
    b.booking_id AS booking_id,
    COALESCE(bt.paid_at, b.updated_at, b.created_at::timestamp without time zone) AS paid_at,
    COALESCE(b.customer_name, 'Guest') AS customer_name,
    b.customer_id,
    b.customer_phone,
    'Service'::text AS type,
    COALESCE(b.service_name, 'Service') AS item_name,
    COALESCE(bt.amount, b.total_price, 0)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, b.discount_amount, 0)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, b.discount_name) AS discount_name,
    COALESCE(bt.final_amount, b.final_amount, b.total_price, 0)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, 'cash')::text AS payment_method,
    COALESCE(b.staff_name, 'Unassigned') AS staff_name,
    LOWER(COALESCE(bt.status, b.payment_status))::text AS status,
    b.created_at
FROM public.bookings_for_business_transaction b
LEFT JOIN public.business_transactions bt 
    ON bt.reference_id = b.booking_id 
    AND bt.reference_type = 'booking'
    AND bt.status = b.payment_status
WHERE b.payment_status IN ('paid', 'refunded')

UNION ALL

-- 2. POS SALES & REFUNDS (Products)
SELECT
    COALESCE(bt.payment_id, s.id) AS payment_id,
    s.company_id,
    s.branch_id,
    s.sale_id AS reference_id,
    s.sale_id AS booking_id,
    COALESCE(bt.paid_at, s.created_at::timestamp without time zone) AS paid_at,
    COALESCE(s.customer_name, 'Guest') AS customer_name,
    s.customer_id,
    s.customer_phone,
    'Product'::text AS type,
    COALESCE(array_to_string(s.product_names, ', '), 'Product') AS item_name,
    COALESCE(bt.amount, s.total_price, 0)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, s.discount_amount, 0)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, s.discount_name) AS discount_name,
    COALESCE(bt.final_amount, s.final_amount, s.total_price, 0)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, s.payment_method, 'cash')::text AS payment_method,
    COALESCE(s.staff_name, 'Unassigned') AS staff_name,
    LOWER(COALESCE(bt.status, s.payment_status))::text AS status,
    s.created_at
FROM public.sales_for_business_transactions s
LEFT JOIN public.business_transactions bt 
    ON (bt.reference_id = s.sale_id OR bt.reference_id = s.id)
    AND bt.reference_type = 'product'
    AND bt.status = s.payment_status
WHERE s.payment_status IN ('paid', 'refunded')

UNION ALL

-- 3. MEMBERSHIPS
SELECT
    COALESCE(bt.payment_id, m.purchase_id) AS payment_id,
    m.company_id,
    m.branch_id,
    m.purchase_id AS reference_id,
    m.purchase_id AS booking_id,
    COALESCE(bt.paid_at, m.created_at::timestamp without time zone) AS paid_at,
    COALESCE(m.customer_name, 'Guest') AS customer_name,
    m.customer_id,
    NULL::text AS customer_phone,
    'Membership'::text AS type,
    COALESCE(m.plan_name, 'Membership') AS item_name,
    COALESCE(bt.amount, m.price, 0)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, m.discount_amount, 0)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, m.discount_name) AS discount_name,
    COALESCE(bt.final_amount, m.final_amount, m.price, 0)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, m.payment_method, 'cash')::text AS payment_method,
    COALESCE(m.assigned_by_user_name, 'Unassigned') AS staff_name,
    LOWER(COALESCE(bt.status, m.payment_status))::text AS status,
    m.created_at
FROM public.membership_purchases m
LEFT JOIN public.business_transactions bt 
    ON bt.reference_id = m.purchase_id 
    AND bt.reference_type = 'membership'
    AND bt.status = m.payment_status
WHERE m.payment_status IN ('paid', 'refunded');

-- Grant read access to Supabase client roles
GRANT SELECT ON public.payment_history_view TO anon, authenticated, service_role;
