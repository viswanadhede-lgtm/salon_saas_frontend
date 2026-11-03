-- ==============================================================================
-- Migration: 20261103000002_migrate_shared_schema.sql
-- Description: Batch 2 - Migrate 17 Shared / Identity & Company tables to shared schema
-- Date: 2026-11-03
-- ==============================================================================

-- 1. Ensure shared schema exists and has proper usage permissions
CREATE SCHEMA IF NOT EXISTS shared;
GRANT USAGE ON SCHEMA shared TO anon, authenticated, service_role;

-- 2. Move 17 Shared tables from public to shared schema
ALTER TABLE IF EXISTS public.companies SET SCHEMA shared;
ALTER TABLE IF EXISTS public.branches SET SCHEMA shared;
ALTER TABLE IF EXISTS public.users SET SCHEMA shared;
ALTER TABLE IF EXISTS public.profiles SET SCHEMA shared;
ALTER TABLE IF EXISTS public.roles SET SCHEMA shared;
ALTER TABLE IF EXISTS public.role_permissions SET SCHEMA shared;
ALTER TABLE IF EXISTS public.user_preferences SET SCHEMA shared;
ALTER TABLE IF EXISTS public.company_settings SET SCHEMA shared;
ALTER TABLE IF EXISTS public.company_billing_information SET SCHEMA shared;
ALTER TABLE IF EXISTS public.company_contacts SET SCHEMA shared;
ALTER TABLE IF EXISTS public.company_tax_settings SET SCHEMA shared;
ALTER TABLE IF EXISTS public.issues SET SCHEMA shared;
ALTER TABLE IF EXISTS public.issue_messages SET SCHEMA shared;
ALTER TABLE IF EXISTS public.issue_attachments SET SCHEMA shared;
ALTER TABLE IF EXISTS public.suggestions SET SCHEMA shared;
ALTER TABLE IF EXISTS public.suggestion_attachments SET SCHEMA shared;
ALTER TABLE IF EXISTS public.reviews SET SCHEMA shared;

-- 3. Create backward-compatible views in public schema for zero downtime
CREATE OR REPLACE VIEW public.companies AS SELECT * FROM shared.companies;
CREATE OR REPLACE VIEW public.branches AS SELECT * FROM shared.branches;
CREATE OR REPLACE VIEW public.users AS SELECT * FROM shared.users;
CREATE OR REPLACE VIEW public.profiles AS SELECT * FROM shared.profiles;
CREATE OR REPLACE VIEW public.roles AS SELECT * FROM shared.roles;
CREATE OR REPLACE VIEW public.role_permissions AS SELECT * FROM shared.role_permissions;
CREATE OR REPLACE VIEW public.user_preferences AS SELECT * FROM shared.user_preferences;
CREATE OR REPLACE VIEW public.company_settings AS SELECT * FROM shared.company_settings;
CREATE OR REPLACE VIEW public.company_billing_information AS SELECT * FROM shared.company_billing_information;
CREATE OR REPLACE VIEW public.company_contacts AS SELECT * FROM shared.company_contacts;
CREATE OR REPLACE VIEW public.company_tax_settings AS SELECT * FROM shared.company_tax_settings;
CREATE OR REPLACE VIEW public.issues AS SELECT * FROM shared.issues;
CREATE OR REPLACE VIEW public.issue_messages AS SELECT * FROM shared.issue_messages;
CREATE OR REPLACE VIEW public.issue_attachments AS SELECT * FROM shared.issue_attachments;
CREATE OR REPLACE VIEW public.suggestions AS SELECT * FROM shared.suggestions;
CREATE OR REPLACE VIEW public.suggestion_attachments AS SELECT * FROM shared.suggestion_attachments;
CREATE OR REPLACE VIEW public.reviews AS SELECT * FROM shared.reviews;

-- 4. Grant table and sequence permissions in shared schema
GRANT ALL ON ALL TABLES IN SCHEMA shared TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA shared TO authenticated, service_role;

-- Public read permissions on companies/branches for client auth bootstrap
GRANT SELECT ON shared.companies TO anon, authenticated;
GRANT SELECT ON shared.branches TO anon, authenticated;

-- Public compatibility views permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.branches TO anon, authenticated;

-- 5. Hardening & Search Path Configuration for Shared RPCs
ALTER FUNCTION public.get_business_settings(uuid) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.onboard_company_workspace(jsonb) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.save_billing_information(uuid, jsonb) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.save_business_settings(uuid, jsonb) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.save_contact_settings(uuid, jsonb) 
    SET search_path = platform, shared, app, public, pg_temp;

