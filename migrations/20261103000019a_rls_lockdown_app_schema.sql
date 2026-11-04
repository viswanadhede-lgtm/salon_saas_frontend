-- ==============================================================================
-- Migration: 20261103000019a_rls_lockdown_app_schema.sql
-- Description: Phase 13 Database-Wide RLS Lockdown (Part A - app schema)
--   Enables Row Level Security across all 26 operational business tables in `app`.
--   Applies tenant-isolated SELECT policies.
--   Enforces 0 direct client mutations (no INSERT/UPDATE/DELETE policies for clients).
-- ==============================================================================

-- 1. Enable RLS on all 26 app base tables
ALTER TABLE app.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bookings_for_business_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.business_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.discount_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.membership_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sales_for_business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff_schedule ENABLE ROW LEVEL SECURITY;

-- 2. Clean up old/insecure policies
DROP POLICY IF EXISTS "Allow authenticated read/write on discount_usages" ON app.discount_usages;
DROP POLICY IF EXISTS "Allow anon insert on notifications" ON app.notifications;
DROP POLICY IF EXISTS "Allow authenticated read/write on notifications" ON app.notifications;

-- 3. Create tenant-isolated SELECT policies (25 tables with direct company_id)
DROP POLICY IF EXISTS "tenant_select_billing_settings" ON app.billing_settings;
CREATE POLICY "tenant_select_billing_settings" ON app.billing_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_bookings" ON app.bookings;
CREATE POLICY "tenant_select_bookings" ON app.bookings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_bookings_summary" ON app.bookings_for_business_transaction;
CREATE POLICY "tenant_select_bookings_summary" ON app.bookings_for_business_transaction
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_business_hours" ON app.business_hours;
CREATE POLICY "tenant_select_business_hours" ON app.business_hours
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_business_payment_settings" ON app.business_payment_settings;
CREATE POLICY "tenant_select_business_payment_settings" ON app.business_payment_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_business_transactions" ON app.business_transactions;
CREATE POLICY "tenant_select_business_transactions" ON app.business_transactions
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_coupons" ON app.coupons;
CREATE POLICY "tenant_select_coupons" ON app.coupons
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_customers" ON app.customers;
CREATE POLICY "tenant_select_customers" ON app.customers
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_discount_usages" ON app.discount_usages;
CREATE POLICY "tenant_select_discount_usages" ON app.discount_usages
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_expenses" ON app.expenses;
CREATE POLICY "tenant_select_expenses" ON app.expenses
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_invoice_settings" ON app.invoice_settings;
CREATE POLICY "tenant_select_invoice_settings" ON app.invoice_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_membership_purchases" ON app.membership_purchases;
CREATE POLICY "tenant_select_membership_purchases" ON app.membership_purchases
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_memberships" ON app.memberships;
CREATE POLICY "tenant_select_memberships" ON app.memberships
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_notification_settings" ON app.notification_settings;
CREATE POLICY "tenant_select_notification_settings" ON app.notification_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_notifications" ON app.notifications;
CREATE POLICY "tenant_select_notifications" ON app.notifications
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_offers" ON app.offers;
CREATE POLICY "tenant_select_offers" ON app.offers
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_packages" ON app.packages;
CREATE POLICY "tenant_select_packages" ON app.packages
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_product_categories" ON app.product_categories;
CREATE POLICY "tenant_select_product_categories" ON app.product_categories
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_products" ON app.products;
CREATE POLICY "tenant_select_products" ON app.products
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_sales" ON app.sales;
CREATE POLICY "tenant_select_sales" ON app.sales
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_sales_summary" ON app.sales_for_business_transactions;
CREATE POLICY "tenant_select_sales_summary" ON app.sales_for_business_transactions
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_service_categories" ON app.service_categories;
CREATE POLICY "tenant_select_service_categories" ON app.service_categories
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_services" ON app.services;
CREATE POLICY "tenant_select_services" ON app.services
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_staff" ON app.staff;
CREATE POLICY "tenant_select_staff" ON app.staff
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_staff_schedule" ON app.staff_schedule;
CREATE POLICY "tenant_select_staff_schedule" ON app.staff_schedule
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

-- 4. Package services (linked through package_id)
DROP POLICY IF EXISTS "tenant_select_package_services" ON app.package_services;
CREATE POLICY "tenant_select_package_services" ON app.package_services
FOR SELECT TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM app.packages p 
        WHERE p.package_id = package_services.package_id 
          AND shared.verify_tenant_access(p.company_id, NULL)
    )
);

