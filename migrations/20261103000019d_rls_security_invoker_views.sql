-- ==============================================================================
-- Migration: 20261103000019d_rls_security_invoker_views.sql
-- Description: Phase 13 Database-Wide RLS Lockdown (Part D - public views)
--   Enforces security_invoker = true on all 59 compatibility views in public schema.
--   Forces all frontend PostgREST queries hitting public views to execute under
--   the caller's credentials (anon / authenticated) and enforce underlying RLS.
-- ==============================================================================

ALTER VIEW public.add_ons SET (security_invoker = true);
ALTER VIEW public.billing_settings SET (security_invoker = true);
ALTER VIEW public.bookings SET (security_invoker = true);
ALTER VIEW public.bookings_for_business_transaction SET (security_invoker = true);
ALTER VIEW public.branches SET (security_invoker = true);
ALTER VIEW public.business_hours SET (security_invoker = true);
ALTER VIEW public.business_payment_settings SET (security_invoker = true);
ALTER VIEW public.business_transactions SET (security_invoker = true);
ALTER VIEW public.companies SET (security_invoker = true);
ALTER VIEW public.company_billing_information SET (security_invoker = true);
ALTER VIEW public.company_contacts SET (security_invoker = true);
ALTER VIEW public.company_settings SET (security_invoker = true);
ALTER VIEW public.company_tax_settings SET (security_invoker = true);
ALTER VIEW public.coupons SET (security_invoker = true);
ALTER VIEW public.customers SET (security_invoker = true);
ALTER VIEW public.discount_usages SET (security_invoker = true);
ALTER VIEW public.expenses SET (security_invoker = true);
ALTER VIEW public.invoice_settings SET (security_invoker = true);
ALTER VIEW public.issue_attachments SET (security_invoker = true);
ALTER VIEW public.issue_messages SET (security_invoker = true);
ALTER VIEW public.issues SET (security_invoker = true);
ALTER VIEW public.membership_purchases SET (security_invoker = true);
ALTER VIEW public.memberships SET (security_invoker = true);
ALTER VIEW public.notification_settings SET (security_invoker = true);
ALTER VIEW public.notifications SET (security_invoker = true);
ALTER VIEW public.offers SET (security_invoker = true);
ALTER VIEW public.package_services SET (security_invoker = true);
ALTER VIEW public.packages SET (security_invoker = true);
ALTER VIEW public.payment_history_view SET (security_invoker = true);
ALTER VIEW public.payment_refunds SET (security_invoker = true);
ALTER VIEW public.payments SET (security_invoker = true);
ALTER VIEW public.plan_features SET (security_invoker = true);
ALTER VIEW public.plan_limits SET (security_invoker = true);
ALTER VIEW public.plan_sub_features SET (security_invoker = true);
ALTER VIEW public.plans SET (security_invoker = true);
ALTER VIEW public.platform_support_settings SET (security_invoker = true);
ALTER VIEW public.product_categories SET (security_invoker = true);
ALTER VIEW public.products SET (security_invoker = true);
ALTER VIEW public.profiles SET (security_invoker = true);
ALTER VIEW public.razorpay_webhook_events SET (security_invoker = true);
ALTER VIEW public.reviews SET (security_invoker = true);
ALTER VIEW public.role_permissions SET (security_invoker = true);
ALTER VIEW public.roles SET (security_invoker = true);
ALTER VIEW public.sales SET (security_invoker = true);
ALTER VIEW public.sales_for_business_transactions SET (security_invoker = true);
ALTER VIEW public.service_categories SET (security_invoker = true);
ALTER VIEW public.services SET (security_invoker = true);
ALTER VIEW public.staff SET (security_invoker = true);
ALTER VIEW public.staff_schedule SET (security_invoker = true);
ALTER VIEW public.subscription_add_ons SET (security_invoker = true);
ALTER VIEW public.subscription_cancellation_logs SET (security_invoker = true);
ALTER VIEW public.subscription_invoices SET (security_invoker = true);
ALTER VIEW public.subscription_plan_changes SET (security_invoker = true);
ALTER VIEW public.subscriptions SET (security_invoker = true);
ALTER VIEW public.suggestion_attachments SET (security_invoker = true);
ALTER VIEW public.suggestions SET (security_invoker = true);
ALTER VIEW public.usage_counters SET (security_invoker = true);
ALTER VIEW public.user_preferences SET (security_invoker = true);
ALTER VIEW public.users SET (security_invoker = true);
