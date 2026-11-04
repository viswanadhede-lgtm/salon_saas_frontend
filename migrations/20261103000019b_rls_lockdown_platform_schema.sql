-- ==============================================================================
-- Migration: 20261103000019b_rls_lockdown_platform_schema.sql
-- Description: Phase 13 Database-Wide RLS Lockdown (Part B - platform schema)
--   Enables Row Level Security across all 15 SaaS platform tables in `platform`.
--   Applies public read policies for commercial catalogs (plans, features, add-ons).
--   Applies tenant-isolated SELECT policies for subscriptions & financial logs.
--   Enforces 0 direct client mutations (no INSERT/UPDATE/DELETE policies for clients).
-- ==============================================================================

-- 1. Enable RLS on all 15 platform base tables
ALTER TABLE platform.add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_sub_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.platform_support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_cancellation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.usage_counters ENABLE ROW LEVEL SECURITY;

-- 2. Drop any legacy/duplicate policies on platform tables
DROP POLICY IF EXISTS "Company owners can view cancellation logs" ON platform.subscription_cancellation_logs;
DROP POLICY IF EXISTS "cancellation_logs_authenticated_select_policy" ON platform.subscription_cancellation_logs;
DROP POLICY IF EXISTS "cancellation_logs_service_role_policy" ON platform.subscription_cancellation_logs;
DROP POLICY IF EXISTS "Service role manages cancellation logs" ON platform.subscription_cancellation_logs;

-- 3. Public Commercial Catalogs (Global Read-Only for all users, including anonymous prospects)
DROP POLICY IF EXISTS "public_select_plans" ON platform.plans;
CREATE POLICY "public_select_plans" ON platform.plans
FOR SELECT TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "public_select_plan_features" ON platform.plan_features;
CREATE POLICY "public_select_plan_features" ON platform.plan_features
FOR SELECT TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "public_select_plan_limits" ON platform.plan_limits;
CREATE POLICY "public_select_plan_limits" ON platform.plan_limits
FOR SELECT TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "public_select_plan_sub_features" ON platform.plan_sub_features;
CREATE POLICY "public_select_plan_sub_features" ON platform.plan_sub_features
FOR SELECT TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "public_select_add_ons" ON platform.add_ons;
CREATE POLICY "public_select_add_ons" ON platform.add_ons
FOR SELECT TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "public_select_platform_support_settings" ON platform.platform_support_settings;
CREATE POLICY "public_select_platform_support_settings" ON platform.platform_support_settings
FOR SELECT TO authenticated, anon
USING (true);

-- 4. Tenant-Isolated Subscription, Usage, and Financial Tables
DROP POLICY IF EXISTS "tenant_select_subscriptions" ON platform.subscriptions;
CREATE POLICY "tenant_select_subscriptions" ON platform.subscriptions
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_subscription_add_ons" ON platform.subscription_add_ons;
CREATE POLICY "tenant_select_subscription_add_ons" ON platform.subscription_add_ons
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_subscription_invoices" ON platform.subscription_invoices;
CREATE POLICY "tenant_select_subscription_invoices" ON platform.subscription_invoices
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_subscription_plan_changes" ON platform.subscription_plan_changes;
CREATE POLICY "tenant_select_subscription_plan_changes" ON platform.subscription_plan_changes
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_cancellation_logs" ON platform.subscription_cancellation_logs;
CREATE POLICY "tenant_select_cancellation_logs" ON platform.subscription_cancellation_logs
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_usage_counters" ON platform.usage_counters;
CREATE POLICY "tenant_select_usage_counters" ON platform.usage_counters
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_payments" ON platform.payments;
CREATE POLICY "tenant_select_payments" ON platform.payments
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_payment_refunds" ON platform.payment_refunds;
CREATE POLICY "tenant_select_payment_refunds" ON platform.payment_refunds
FOR SELECT TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM platform.payments p 
        WHERE p.id = payment_refunds.payment_id 
          AND shared.verify_tenant_access(p.company_id, NULL)
    )
);

-- 5. Webhook Events (Strict internal idempotency log - No direct client select)
DROP POLICY IF EXISTS "razorpay_webhook_service_role_policy" ON platform.razorpay_webhook_events;
CREATE POLICY "razorpay_webhook_service_role_policy" ON platform.razorpay_webhook_events
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

