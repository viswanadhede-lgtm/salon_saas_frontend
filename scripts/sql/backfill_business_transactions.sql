-- ============================================================================
-- SQL SCRIPT: Backfill historical POS sales and Memberships into business_transactions
-- Idempotent: safe to run multiple times (checks NOT EXISTS)
-- ============================================================================

-- 1. Backfill historical POS sales & refunds
INSERT INTO public.business_transactions (
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
    paid_at,
    created_at,
    updated_at,
    discount_type,
    discount_name,
    discount_amount
)
SELECT 
    s.company_id,
    s.branch_id,
    s.sale_id,
    'product',
    s.total_price,
    s.final_amount,
    'INR',
    COALESCE(s.payment_method, 'cash'),
    s.payment_status,
    'POS ' || INITCAP(s.payment_status) || ' ' || SUBSTRING(s.sale_id::text, 1, 8),
    COALESCE(s.created_at::timestamp without time zone, NOW()),
    COALESCE(s.created_at::timestamp without time zone, NOW()),
    COALESCE(s.updated_at::timestamp without time zone, s.created_at::timestamp without time zone, NOW()),
    s.discount_type,
    s.discount_name,
    COALESCE(s.discount_amount, 0)
FROM public.sales_for_business_transactions s
WHERE s.payment_status IN ('paid', 'refunded')
  AND NOT EXISTS (
      SELECT 1 FROM public.business_transactions bt 
      WHERE bt.reference_id = s.sale_id 
        AND bt.reference_type = 'product'
        AND bt.status = s.payment_status
  );

-- 2. Backfill historical Membership purchases & refunds
INSERT INTO public.business_transactions (
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
    paid_at,
    created_at,
    updated_at,
    discount_type,
    discount_name,
    discount_amount
)
SELECT 
    m.company_id,
    m.branch_id,
    m.purchase_id,
    'membership',
    m.price,
    m.final_amount,
    'INR',
    COALESCE(m.payment_method, 'cash'),
    m.payment_status,
    'Membership ' || INITCAP(m.payment_status) || ': ' || COALESCE(m.plan_name, ''),
    COALESCE(m.created_at::timestamp without time zone, NOW()),
    COALESCE(m.created_at::timestamp without time zone, NOW()),
    COALESCE(m.updated_at::timestamp without time zone, m.created_at::timestamp without time zone, NOW()),
    m.discount_type,
    m.discount_name,
    COALESCE(m.discount_amount, 0)
FROM public.membership_purchases m
WHERE m.payment_status IN ('paid', 'refunded')
  AND NOT EXISTS (
      SELECT 1 FROM public.business_transactions bt 
      WHERE bt.reference_id = m.purchase_id 
        AND bt.reference_type = 'membership'
        AND bt.status = m.payment_status
  );
