-- ==============================================================================
-- Migration: 20261103000001_migrate_platform_schema.sql
-- Description: Batch 1 - Migrate 15 Platform / SaaS Subscription tables to platform schema
-- Date: 2026-11-03
-- ==============================================================================

-- 1. Ensure platform schema exists and has proper usage permissions
CREATE SCHEMA IF NOT EXISTS platform;
GRANT USAGE ON SCHEMA platform TO anon, authenticated, service_role;

-- 2. Move 15 Platform tables from public to platform schema
ALTER TABLE IF EXISTS public.plans SET SCHEMA platform;
ALTER TABLE IF EXISTS public.plan_features SET SCHEMA platform;
ALTER TABLE IF EXISTS public.plan_sub_features SET SCHEMA platform;
ALTER TABLE IF EXISTS public.plan_limits SET SCHEMA platform;
ALTER TABLE IF EXISTS public.usage_counters SET SCHEMA platform;
ALTER TABLE IF EXISTS public.add_ons SET SCHEMA platform;
ALTER TABLE IF EXISTS public.subscription_add_ons SET SCHEMA platform;
ALTER TABLE IF EXISTS public.subscriptions SET SCHEMA platform;
ALTER TABLE IF EXISTS public.payments SET SCHEMA platform;
ALTER TABLE IF EXISTS public.payment_refunds SET SCHEMA platform;
ALTER TABLE IF EXISTS public.subscription_invoices SET SCHEMA platform;
ALTER TABLE IF EXISTS public.subscription_plan_changes SET SCHEMA platform;
ALTER TABLE IF EXISTS public.subscription_cancellation_logs SET SCHEMA platform;
ALTER TABLE IF EXISTS public.razorpay_webhook_events SET SCHEMA platform;
ALTER TABLE IF EXISTS public.platform_support_settings SET SCHEMA platform;

-- 3. Create backward-compatible views in public schema for zero downtime
CREATE OR REPLACE VIEW public.plans AS SELECT * FROM platform.plans;
CREATE OR REPLACE VIEW public.plan_features AS SELECT * FROM platform.plan_features;
CREATE OR REPLACE VIEW public.plan_sub_features AS SELECT * FROM platform.plan_sub_features;
CREATE OR REPLACE VIEW public.plan_limits AS SELECT * FROM platform.plan_limits;
CREATE OR REPLACE VIEW public.usage_counters AS SELECT * FROM platform.usage_counters;
CREATE OR REPLACE VIEW public.add_ons AS SELECT * FROM platform.add_ons;
CREATE OR REPLACE VIEW public.subscription_add_ons AS SELECT * FROM platform.subscription_add_ons;
CREATE OR REPLACE VIEW public.subscriptions AS SELECT * FROM platform.subscriptions;
CREATE OR REPLACE VIEW public.payments AS SELECT * FROM platform.payments;
CREATE OR REPLACE VIEW public.payment_refunds AS SELECT * FROM platform.payment_refunds;
CREATE OR REPLACE VIEW public.subscription_invoices AS SELECT * FROM platform.subscription_invoices;
CREATE OR REPLACE VIEW public.subscription_plan_changes AS SELECT * FROM platform.subscription_plan_changes;
CREATE OR REPLACE VIEW public.subscription_cancellation_logs AS SELECT * FROM platform.subscription_cancellation_logs;
CREATE OR REPLACE VIEW public.razorpay_webhook_events AS SELECT * FROM platform.razorpay_webhook_events;
CREATE OR REPLACE VIEW public.platform_support_settings AS SELECT * FROM platform.platform_support_settings;

-- 4. Grant table and sequence permissions in platform schema
GRANT ALL ON ALL TABLES IN SCHEMA platform TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA platform TO authenticated, service_role;

-- Public catalog read-only access for pricing/plans
GRANT SELECT ON platform.plans TO anon, authenticated;
GRANT SELECT ON platform.plan_features TO anon, authenticated;
GRANT SELECT ON platform.plan_sub_features TO anon, authenticated;
GRANT SELECT ON platform.plan_limits TO anon, authenticated;
GRANT SELECT ON platform.add_ons TO anon, authenticated;
GRANT SELECT ON platform.platform_support_settings TO anon, authenticated;

-- Public compatibility views permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT SELECT ON public.plan_sub_features TO anon, authenticated;
GRANT SELECT ON public.plan_limits TO anon, authenticated;
GRANT SELECT ON public.add_ons TO anon, authenticated;
GRANT SELECT ON public.platform_support_settings TO anon, authenticated;

-- 5. Hardening & Search Path Configuration for Subscription RPCs
ALTER FUNCTION public.activate_subscription_addon(uuid, text, uuid, text, numeric, bigint, text, text, text, text, text, text) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.deactivate_subscription_addon(uuid, uuid) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.cancel_company_subscription(uuid, text, text, text, boolean) 
    SET search_path = platform, shared, app, public, pg_temp;

ALTER FUNCTION public.get_company_subscription_details(uuid) 
    SET search_path = platform, shared, app, public, pg_temp;

-- 6. Structural Security: Lock down sensitive webhook/cancellation internal tables with RLS
ALTER TABLE platform.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS razorpay_webhook_service_role_policy ON platform.razorpay_webhook_events;
CREATE POLICY razorpay_webhook_service_role_policy ON platform.razorpay_webhook_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE platform.subscription_cancellation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cancellation_logs_service_role_policy ON platform.subscription_cancellation_logs;
CREATE POLICY cancellation_logs_service_role_policy ON platform.subscription_cancellation_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cancellation_logs_authenticated_select_policy ON platform.subscription_cancellation_logs;
CREATE POLICY cancellation_logs_authenticated_select_policy ON platform.subscription_cancellation_logs
    FOR SELECT TO authenticated USING (true);
