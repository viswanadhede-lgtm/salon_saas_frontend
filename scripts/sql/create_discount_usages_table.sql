-- ============================================================================
-- TABLE: public.discount_usages
-- Purpose: Centralized tracking of discounts (offers, coupons, memberships, manual)
--          and their full/proportional reversals across bookings, POS sales, and memberships.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.discount_usages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NULL,
    branch_id uuid NULL,
    customer_id uuid NULL,

    -- Link to source
    reference_type text NOT NULL,       -- 'booking', 'pos', 'membership'
    reference_id uuid NOT NULL,         -- booking_id, sale_id, or purchase_id
    payment_id uuid NULL,               -- business_transactions payment_id

    -- Discount Details
    discount_type text NULL,            -- 'coupon', 'offer', 'membership', 'manual'
    discount_id uuid NULL,              -- coupon_id or offer_id (if available)
    membership_plan_id uuid NULL,       -- membership plan id (if applicable)
    discount_name text NULL,            -- e.g., 'SUMMER20', 'Gold Member 10%'
    discount_amount numeric(12, 2) NOT NULL DEFAULT 0,

    -- Status & Lifecycle
    status text NOT NULL DEFAULT 'applied', -- 'applied', 'partially_reversed', 'reversed'
    used_at timestamp with time zone NULL DEFAULT now(),
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),

    -- Reversal Tracking
    reversal_amount numeric(12, 2) NOT NULL DEFAULT 0,
    reversed_at timestamp with time zone NULL,
    reversal_reason text NULL,

    CONSTRAINT discount_usages_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_discount_usages_reference 
    ON public.discount_usages (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_discount_usages_company 
    ON public.discount_usages (company_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_discount_usages_customer 
    ON public.discount_usages (customer_id);

ALTER TABLE public.discount_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read/write on discount_usages"
    ON public.discount_usages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
