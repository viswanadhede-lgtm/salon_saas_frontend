-- ============================================================================
-- MIGRATION: Align public.companies table schema
-- Purpose: Adds display branding, owner profile, and category to companies.
--          Removes obsolete subscription date tracking now held in subscriptions.
-- ============================================================================

-- 1. Add core branding, owner, and business category fields
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS logo_url text,
    ADD COLUMN IF NOT EXISTS owner_name text,
    ADD COLUMN IF NOT EXISTS owner_email text,
    ADD COLUMN IF NOT EXISTS owner_phone text,
    ADD COLUMN IF NOT EXISTS business_category text;

-- 2. Ensure default status
ALTER TABLE public.companies
    ALTER COLUMN status SET DEFAULT 'active';

-- 3. Backfill display_name and logo_url from existing company_settings (if present)
UPDATE public.companies c
SET
    display_name      = COALESCE(c.display_name, cs.display_name, c.company_name),
    logo_url          = COALESCE(c.logo_url, cs.logo_url),
    business_category = COALESCE(c.business_category, cs.business_category)
FROM public.company_settings cs
WHERE cs.company_id = c.company_id;

-- 4. Clean up redundant subscription period timestamps (managed in subscriptions table)
ALTER TABLE public.companies
    DROP COLUMN IF EXISTS subscription_start_date,
    DROP COLUMN IF EXISTS subscription_end_date;
