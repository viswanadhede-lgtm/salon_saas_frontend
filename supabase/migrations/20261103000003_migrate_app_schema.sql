-- ==============================================================================
-- Migration: 20261103000003_migrate_app_schema.sql
-- Description: Batch 3 - Migrate 26 Salon Business tables & View to app schema
-- Date: 2026-11-03
-- ==============================================================================

-- 1. Ensure app schema exists and has proper usage permissions
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

-- 2. Drop dependent view before moving underlying tables
DROP VIEW IF EXISTS public.payment_history_view;

-- 3. Move 26 App tables from public to app schema
ALTER TABLE IF EXISTS public.bookings SET SCHEMA app;
ALTER TABLE IF EXISTS public.bookings_for_business_transaction SET SCHEMA app;
ALTER TABLE IF EXISTS public.business_payment_settings SET SCHEMA app;
ALTER TABLE IF EXISTS public.business_transactions SET SCHEMA app;
ALTER TABLE IF EXISTS public.billing_settings SET SCHEMA app;
ALTER TABLE IF EXISTS public.business_hours SET SCHEMA app;
ALTER TABLE IF EXISTS public.invoice_settings SET SCHEMA app;
ALTER TABLE IF EXISTS public.customers SET SCHEMA app;
ALTER TABLE IF EXISTS public.staff SET SCHEMA app;
ALTER TABLE IF EXISTS public.staff_schedule SET SCHEMA app;
ALTER TABLE IF EXISTS public.service_categories SET SCHEMA app;
ALTER TABLE IF EXISTS public.services SET SCHEMA app;
ALTER TABLE IF EXISTS public.packages SET SCHEMA app;
ALTER TABLE IF EXISTS public.package_services SET SCHEMA app;
ALTER TABLE IF EXISTS public.product_categories SET SCHEMA app;
ALTER TABLE IF EXISTS public.products SET SCHEMA app;
ALTER TABLE IF EXISTS public.sales SET SCHEMA app;
ALTER TABLE IF EXISTS public.sales_for_business_transactions SET SCHEMA app;
ALTER TABLE IF EXISTS public.expenses SET SCHEMA app;
ALTER TABLE IF EXISTS public.coupons SET SCHEMA app;
ALTER TABLE IF EXISTS public.offers SET SCHEMA app;
ALTER TABLE IF EXISTS public.discount_usages SET SCHEMA app;
ALTER TABLE IF EXISTS public.memberships SET SCHEMA app;
ALTER TABLE IF EXISTS public.membership_purchases SET SCHEMA app;
ALTER TABLE IF EXISTS public.notifications SET SCHEMA app;
ALTER TABLE IF EXISTS public.notification_settings SET SCHEMA app;

-- 4. Create backward-compatible views in public schema for zero downtime
CREATE OR REPLACE VIEW public.bookings AS SELECT * FROM app.bookings;
CREATE OR REPLACE VIEW public.bookings_for_business_transaction AS SELECT * FROM app.bookings_for_business_transaction;
CREATE OR REPLACE VIEW public.business_payment_settings AS SELECT * FROM app.business_payment_settings;
CREATE OR REPLACE VIEW public.business_transactions AS SELECT * FROM app.business_transactions;
CREATE OR REPLACE VIEW public.billing_settings AS SELECT * FROM app.billing_settings;
CREATE OR REPLACE VIEW public.business_hours AS SELECT * FROM app.business_hours;
CREATE OR REPLACE VIEW public.invoice_settings AS SELECT * FROM app.invoice_settings;
CREATE OR REPLACE VIEW public.customers AS SELECT * FROM app.customers;
CREATE OR REPLACE VIEW public.staff AS SELECT * FROM app.staff;
CREATE OR REPLACE VIEW public.staff_schedule AS SELECT * FROM app.staff_schedule;
CREATE OR REPLACE VIEW public.service_categories AS SELECT * FROM app.service_categories;
CREATE OR REPLACE VIEW public.services AS SELECT * FROM app.services;
CREATE OR REPLACE VIEW public.packages AS SELECT * FROM app.packages;
CREATE OR REPLACE VIEW public.package_services AS SELECT * FROM app.package_services;
CREATE OR REPLACE VIEW public.product_categories AS SELECT * FROM app.product_categories;
CREATE OR REPLACE VIEW public.products AS SELECT * FROM app.products;
CREATE OR REPLACE VIEW public.sales AS SELECT * FROM app.sales;
CREATE OR REPLACE VIEW public.sales_for_business_transactions AS SELECT * FROM app.sales_for_business_transactions;
CREATE OR REPLACE VIEW public.expenses AS SELECT * FROM app.expenses;
CREATE OR REPLACE VIEW public.coupons AS SELECT * FROM app.coupons;
CREATE OR REPLACE VIEW public.offers AS SELECT * FROM app.offers;
CREATE OR REPLACE VIEW public.discount_usages AS SELECT * FROM app.discount_usages;
CREATE OR REPLACE VIEW public.memberships AS SELECT * FROM app.memberships;
CREATE OR REPLACE VIEW public.membership_purchases AS SELECT * FROM app.membership_purchases;
CREATE OR REPLACE VIEW public.notifications AS SELECT * FROM app.notifications;
CREATE OR REPLACE VIEW public.notification_settings AS SELECT * FROM app.notification_settings;

-- 5. Recreate payment_history_view in app schema and create public compatibility view
CREATE OR REPLACE VIEW app.payment_history_view AS
 SELECT COALESCE(bt.payment_id, b.id) AS payment_id,
    b.company_id,
    b.branch_id,
    b.booking_id AS reference_id,
    b.booking_id,
    COALESCE(bt.paid_at::timestamp with time zone, b.updated_at, b.created_at::timestamp without time zone::timestamp with time zone) AS paid_at,
    COALESCE(b.customer_name, 'Guest'::text) AS customer_name,
    b.customer_id,
    b.customer_phone,
    'Service'::text AS type,
    COALESCE(b.service_name, 'Service'::text) AS item_name,
    COALESCE(bt.amount, b.total_price, 0::numeric)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, b.discount_amount, 0::numeric)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, b.discount_name) AS discount_name,
    COALESCE(bt.final_amount, b.final_amount, b.total_price, 0::numeric)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, 'cash'::text) AS payment_method,
    COALESCE(b.staff_name, 'Unassigned'::text) AS staff_name,
    lower(COALESCE(bt.status, b.payment_status)) AS status,
    b.created_at
   FROM app.bookings_for_business_transaction b
     LEFT JOIN app.business_transactions bt ON bt.reference_id = b.booking_id AND bt.reference_type = 'booking'::text AND bt.status = b.payment_status
  WHERE b.payment_status = ANY (ARRAY['paid'::text, 'refunded'::text])
UNION ALL
 SELECT COALESCE(bt.payment_id, s.id) AS payment_id,
    s.company_id,
    s.branch_id,
    s.sale_id AS reference_id,
    s.sale_id AS booking_id,
    COALESCE(bt.paid_at, s.created_at::timestamp without time zone) AS paid_at,
    COALESCE(s.customer_name, 'Guest'::text) AS customer_name,
    s.customer_id,
    s.customer_phone,
    'Product'::text AS type,
    COALESCE(array_to_string(s.product_names, ', '::text), 'Product'::text) AS item_name,
    COALESCE(bt.amount, s.total_price, 0::numeric)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, s.discount_amount, 0::numeric)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, s.discount_name) AS discount_name,
    COALESCE(bt.final_amount, s.final_amount, s.total_price, 0::numeric)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, s.payment_method, 'cash'::text) AS payment_method,
    COALESCE(s.staff_name, 'Unassigned'::text) AS staff_name,
    lower(COALESCE(bt.status, s.payment_status)) AS status,
    s.created_at
   FROM app.sales_for_business_transactions s
     LEFT JOIN app.business_transactions bt ON (bt.reference_id = s.sale_id OR bt.reference_id = s.id) AND bt.reference_type = 'product'::text AND bt.status = s.payment_status
  WHERE s.payment_status = ANY (ARRAY['paid'::text, 'refunded'::text])
UNION ALL
 SELECT COALESCE(bt.payment_id, m.purchase_id) AS payment_id,
    m.company_id,
    m.branch_id,
    m.purchase_id AS reference_id,
    m.purchase_id AS booking_id,
    COALESCE(bt.paid_at, m.created_at::timestamp without time zone) AS paid_at,
    COALESCE(m.customer_name, 'Guest'::text) AS customer_name,
    m.customer_id,
    NULL::text AS customer_phone,
    'Membership'::text AS type,
    COALESCE(m.plan_name, 'Membership'::text) AS item_name,
    COALESCE(bt.amount, m.price, 0::numeric)::numeric(10,2) AS original_amount,
    COALESCE(bt.discount_amount, m.discount_amount, 0::numeric)::numeric(10,2) AS discount_amount,
    COALESCE(bt.discount_name, m.discount_name) AS discount_name,
    COALESCE(bt.final_amount, m.final_amount, m.price, 0::numeric)::numeric(10,2) AS final_amount,
    COALESCE(bt.payment_method, m.payment_method, 'cash'::text) AS payment_method,
    COALESCE(m.assigned_by_user_name, 'Unassigned'::text) AS staff_name,
    lower(COALESCE(bt.status, m.payment_status)) AS status,
    m.created_at
   FROM app.membership_purchases m
     LEFT JOIN app.business_transactions bt ON bt.reference_id = m.purchase_id AND bt.reference_type = 'membership'::text AND bt.status = m.payment_status
  WHERE m.payment_status = ANY (ARRAY['paid'::text, 'refunded'::text]);

CREATE OR REPLACE VIEW public.payment_history_view AS SELECT * FROM app.payment_history_view;

-- 6. Grant table and sequence permissions in app schema
GRANT ALL ON ALL TABLES IN SCHEMA app TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO authenticated, service_role;

-- Public compatibility views permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- 7. System-Wide Search Path Lockdown for all operational and reporting routines
ALTER FUNCTION public."Global_customer_profile_modal"(p_company_id uuid, p_branch_id uuid, p_customer_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.assign_membership(p_company_id uuid, p_branch_id uuid, p_membership_id uuid, p_customer_id uuid, p_customer_phone text, p_customer_name text, p_customer_email text, p_payment_method text, p_purchase_date date, p_discount_type text, p_discount_name text, p_discount_amount numeric, p_final_amount numeric, p_assigned_by_user_id uuid, p_assigned_by_user_name text, p_notes text, p_discount_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.cancel_membership(p_purchase_id uuid, p_company_id uuid, p_branch_id uuid, p_notes text) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.create_booking_atomic(p_booking_id uuid, p_company_id uuid, p_branch_id uuid, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_is_new_customer boolean, p_services jsonb, p_booking_date date, p_notes text, p_booking_type text) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.create_package_atomic(p_company_id uuid, p_branch_id uuid, p_package_name text, p_description text, p_original_price numeric, p_final_price numeric, p_is_active boolean, p_service_ids uuid[]) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.create_pos_sale_atomic(p_company_id uuid, p_branch_id uuid, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_payment_method text, p_staff_id uuid, p_staff_name text, p_items jsonb, p_discount_type text, p_discount_name text, p_discount_amount numeric, p_final_amount numeric, p_discount_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.customers_page__four_statcard_trendelements(p_company_id uuid, p_branch_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.customers_page__four_statcards(p_company_id uuid, p_branch_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.customers_page_clickable_total_spent(p_company_id uuid, p_branch_id uuid, p_customer_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.dashboard_statcards_four(p_branch_id uuid, p_company_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.dashboard_todays_revenue_kpis(p_branch_id uuid, p_company_id uuid, p_today date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.dashboard_top_services(p_branch_id uuid, p_company_id uuid, p_period text, p_today date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.dashboard_weekly_revenue(p_branch_id uuid, p_company_id uuid, p_today date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.deduct_product_stock(p_company_id uuid, p_branch_id uuid, p_items jsonb) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.fn_create_initial_business_transaction() SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.fn_update_customer_stats_on_complete() SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_analytics_overview(p_branch_id uuid, p_company_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_bookings_report(p_branch_id uuid, p_company_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_calendar_month_bookings_summary(p_branch_id uuid, p_year integer, p_month integer) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_customers_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date, p_customer_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_discount_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_expenses_stat_cards(p_company_id uuid, p_branch_id uuid, p_timezone text) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_financial_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_memberships_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_product_sales_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.get_staff_report(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date, p_staff_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.mark_all_notifications_read(p_company_id uuid, p_branch_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.overview_analytics(p_branch_id uuid, p_company_id uuid, p_start_date date, p_end_date date) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.process_booking_payment_atomic(p_booking_id uuid, p_payment_method text, p_discount_type text, p_discount_name text, p_discount_amount numeric, p_final_amount numeric, p_notes text, p_discount_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.process_booking_refund_atomic(p_booking_id uuid, p_refund_reason text, p_refund_notes text, p_refund_method text) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.process_membership_refund(p_purchase_id uuid, p_company_id uuid, p_branch_id uuid, p_refund_amount numeric, p_payment_method text, p_refund_reason text, p_staff_id uuid) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.process_pos_refund_atomic(p_original_sale_id uuid, p_refund_sale_id uuid, p_company_id uuid, p_branch_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_payment_method text, p_staff_id uuid, p_staff_name text, p_refund_reason text, p_items jsonb) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.trg_pos_sale_business_transaction() SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.update_booking_atomic(p_booking_id uuid, p_company_id uuid, p_branch_id uuid, p_booking_date date, p_start_time time without time zone, p_notes text, p_status text, p_services jsonb) SET search_path = platform, shared, app, public, pg_temp;
ALTER FUNCTION public.update_package_atomic(p_package_id uuid, p_company_id uuid, p_branch_id uuid, p_package_name text, p_description text, p_original_price numeric, p_final_price numeric, p_is_active boolean, p_service_ids uuid[]) SET search_path = platform, shared, app, public, pg_temp;

