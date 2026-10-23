-- ============================================================================
-- TABLE: public.notifications
-- Purpose: Centralized cross-device notification center for salon staff & owners.
--          Stores in-app alerts, activity feeds, and unread badge counters.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    branch_id uuid NULL,                         -- NULL = company-wide alert, or specific branch
    user_id uuid NULL,                           -- NULL = broadcast to all staff, or specific user
    
    -- Notification Content
    category text NOT NULL DEFAULT 'system',    -- 'bookings', 'customers', 'sales', 'pos', 'staff', 'marketing', 'system'
    event_key text NULL,                        -- e.g., 'evt_booking_created', 'evt_sale_completed'
    title text NOT NULL,                        -- e.g., 'New Appointment Booked'
    message text NOT NULL,                      -- e.g., 'Pooja booked a Hair Spa for 4:00 PM with Priya'
    link text NULL,                             -- e.g., 'bookings.html', 'customers.html'
    metadata jsonb NULL DEFAULT '{}'::jsonb,    -- Flexible extra details (e.g. { "booking_id": "...", "amount": 1200 })

    -- Read / Delivery State
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- INDEXES: Ultra-fast pagination, category filters, and unread counts
-- ============================================================================

-- 1. Main query index (Company feed ordered by newest first)
CREATE INDEX IF NOT EXISTS idx_notifications_company_created
    ON public.notifications (company_id, created_at DESC);

-- 2. Fast unread badge counter index
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON public.notifications (company_id, is_read)
    WHERE is_read = false;

-- 3. Branch-scoped notifications
CREATE INDEX IF NOT EXISTS idx_notifications_branch
    ON public.notifications (branch_id)
    WHERE branch_id IS NOT NULL;

-- 4. User-targeted notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON public.notifications (user_id)
    WHERE user_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and update notifications for their company
CREATE POLICY "Allow authenticated read/write on notifications"
    ON public.notifications
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow public read/insert for edge functions / webhooks (service role bypasses RLS automatically)
CREATE POLICY "Allow anon insert on notifications"
    ON public.notifications
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTION: Atomic Mark All As Read
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count integer;
BEGIN
    UPDATE public.notifications
    SET 
        is_read = true,
        read_at = now()
    WHERE company_id = p_company_id
      AND is_read = false
      AND (p_branch_id IS NULL OR branch_id IS NULL OR branch_id = p_branch_id);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'marked_read', v_updated_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;
