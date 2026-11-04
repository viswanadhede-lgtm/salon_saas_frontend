# BHARATHBOTS – SALON SAAS
# Supabase Developer Architecture & Technical Reference Guide

> **Document Status**: Active / Single Source of Truth  
> **Last Verified Database Baseline**: 2026-11-03  
> **Target Environment**: Production / Staging (Supabase Hosted)  
> **Database Engine**: PostgreSQL 17.6.1 (Supabase ap-south-1 Mumbai)  
> **Project Reference**: `qxmgyxjwpxkdbgldpdil`

---

## 1. Project Overview & Architectural Principles

### 1.1 Project Overview
* **Project Name**: BHARATHBOTS – SALON SAAS
* **Platform Type**: Multi-Tenant SaaS for salon and wellness businesses.
* **Core Technology Stack**:
  * **Frontend**: Vanilla JavaScript (ES modules, legacy frontend transitioning towards React), HTML5, CSS3.
  * **Backend & Database**: Supabase PostgreSQL 17, Row Level Security (RLS), Atomic RPC Functions, Triggers, and Supabase Edge Functions (Deno/TypeScript).
  * **Third-Party Gateways**: Razorpay (Subscriptions, Webhooks, Payments).

### 1.2 Core Architectural Principle: Backend-First & Zero Trust Frontend
* **Frontend Responsibility**: Strictly Presentation and UX.
  * Rendering UI views, calendars, modals, input forms, tables, dashboards.
  * Managing optimistic loading states, toasts, and localized error messages.
  * Submitting user input to backend RPCs and displaying the authoritative responses.
  * Client-side permission checks are used solely for UI/UX rendering (e.g., hiding a button); they are **never** treated as security controls.
* **Backend Responsibility**: Authoritative Source of Truth.
  * Multi-tenant data isolation (`company_id`, `branch_id`).
  * Authentication, authorization, and Role-Based Access Control (RBAC).
  * Business rules, booking availability, and scheduling conflict prevention.
  * Financial math (taxes, discounts, coupons, memberships, tips, refunds).
  * Data integrity, foreign key constraints, atomic transactions, and stock tracking.
  * Audit trails, triggers, and notification side effects.

---

## 2. Database Schema Architecture

### 2.1 Target Schema Organization
To achieve clean separation of concerns, the database architecture is designed around three distinct schemas:

1. **`platform`** (SaaS Core & Platform Administration):
   * Manages tenant accounts, companies, branches, SaaS subscription plans, features, limits, add-ons, platform support tickets, and platform-level billing/webhooks.
2. **`shared`** (Cross-Cutting Metadata & Shared Entities):
   * Manages user profiles, global roles, permissions, user preferences, notification templates, and company-level business settings.
3. **`app`** (Tenant-Specific Salon Business Operations):
   * Manages daily operational workflows: Bookings, appointments, customers, services, packages, products, staff, schedules, sales/POS, payments, expenses, memberships, and loyalty.

### 2.2 Current Deployed Baseline vs. Target Architecture
* **Current Deployed Reality**:
  * **Schema Migration Completed (All 3 Batches Deployed & Verified)**:
    * **`platform`**: Hosts all **15 platform / SaaS subscription tables**.
    * **`shared`**: Hosts all **17 multi-tenant root, IAM, and communication tables**.
    * **`app`**: Hosts all **26 operational salon business tables**.
    * **`public`**: Contains **0 base tables** and **59 zero-downtime compatibility views** ensuring full backward compatibility with the frontend and Edge Functions.
  * **Search Path Hardening**: 100% of routines (all 45 functions) now have explicit `search_path = platform, shared, app, public, pg_temp;`.
  * **Internal Table Lockdown**: Webhook and cancellation logs have RLS active. Tenant-level business RLS will be systematically applied per module.
* **Migration Strategy**:
  * Tables will be systematically organized into their designated schemas (`app`, `platform`, `shared`) as each module is migrated, accompanied by updated foreign keys, RPC search paths, and backward-compatible views where necessary.

---

## 3. Complete Table Inventory (Public Schema Baseline)

Below is the verified inventory of all 58 tables deployed in the database, categorized by their target domain.

### 3.1 Domain: Platform & Multi-Tenancy (Target: `platform`)

| Table Name | Primary Key | Key Columns / FK References | RLS Status | Intended Domain |
|---|---|---|---|---|
| `companies` | `company_id` (uuid) | `name`, `status`, `owner_id` | **DISABLED** | Tenant Root Entity |
| `branches` | `branch_id` (uuid) | `company_id` (FK), `name`, `status` | **DISABLED** | Tenant Branch Entity |
| `plans` | `plan_id` (text) | `name`, `price_inr`, `billing_cycle`, `status` | **DISABLED** | Platform SaaS Plans |
| `plan_features` | `id` (uuid) | `plan_id` (FK), `feature_key`, `is_enabled` | **DISABLED** | Plan Feature Flags |
| `plan_sub_features` | `id` (uuid) | `plan_feature_id` (FK), `sub_feature_key` | **DISABLED** | Granular Feature Entitlements |
| `plan_limits` | `id` (uuid) | `plan_id` (FK), `limit_key`, `limit_value` | **DISABLED** | Plan Usage Quotas |
| `subscriptions` | `id` (uuid) | `company_id` (FK), `plan_id`, `status`, `razorpay_subscription_id` | **DISABLED** | Active Tenant Subscriptions |
| `subscription_invoices` | `id` (uuid) | `company_id` (FK), `subscription_id`, `amount`, `status` | **DISABLED** | Platform Invoices |
| `subscription_plan_changes` | `id` (uuid) | `company_id` (FK), `from_plan_id`, `to_plan_id` | **DISABLED** | Plan Change Audit Log |
| `subscription_cancellation_logs` | `id` (uuid) | `company_id` (FK), `reason`, `cancelled_by` | **ENABLED** | Cancellation Auditing |
| `add_ons` | `addon_id` (text) | `name`, `price_inr`, `status` | **DISABLED** | Platform Add-On Catalog |
| `subscription_add_ons` | `id` (uuid) | `company_id` (FK), `addon_id`, `quantity`, `status` | **DISABLED** | Tenant Add-On Subscriptions |
| `usage_counters` | `id` (uuid) | `company_id` (FK), `metric_key`, `current_count` | **DISABLED** | Tenant Quota Enforcement |
| `platform_support_settings` | `id` (uuid) | `support_email`, `support_phone` | **DISABLED** | Platform Global Support Config |
| `issues` | `id` (uuid) | `company_id` (FK), `user_id`, `title`, `status` | **DISABLED** | Tenant Support Tickets |
| `issue_messages` | `id` (uuid) | `issue_id` (FK), `sender_id`, `message` | **DISABLED** | Support Ticket Thread |
| `issue_attachments` | `id` (uuid) | `issue_id` (FK), `file_url`, `file_type` | **DISABLED** | Support Ticket Attachments |
| `suggestions` | `id` (uuid) | `company_id` (FK), `user_id`, `suggestion_text` | **DISABLED** | Feature Requests / Feedback |
| `suggestion_attachments` | `id` (uuid) | `suggestion_id` (FK), `file_url` | **DISABLED** | Feedback Attachments |
| `razorpay_webhook_events` | `id` (uuid) | `event_id`, `event_type`, `payload`, `processed` | **DISABLED** | Webhook Idempotency Log |

---

### 3.2 Domain: Shared, Identity & RBAC (Target: `shared`)

| Table Name | Primary Key | Key Columns / FK References | RLS Status | Intended Domain |
|---|---|---|---|---|
| `users` | `user_id` (uuid) | `email`, `full_name`, `company_id`, `role_id` | **DISABLED** | Platform Application Users |
| `profiles` | `id` (uuid) | `user_id` (FK), `first_name`, `last_name`, `avatar_url` | **DISABLED** | User Profile Metadata |
| `roles` | `role_id` (uuid) | `role_name`, `company_id`, `is_system` | **DISABLED** | Tenant RBAC Roles |
| `role_permissions` | `id` (uuid) | `role_id` (FK), `permission_key`, `allowed` | **DISABLED** | Granular RBAC Permissions |
| `user_preferences` | `id` (uuid) | `user_id` (FK), `theme`, `preferences_json` | **DISABLED** | User UI Preferences |
| `notifications` | `id` (uuid) | `company_id`, `user_id`, `title`, `is_read` | **ENABLED** | System & User Notifications |
| `notification_settings` | `id` (uuid) | `company_id`, `sms_enabled`, `email_enabled` | **DISABLED** | Notification Delivery Rules |
| `company_settings` | `company_id` (uuid) | `currency`, `timezone`, `date_format` | **DISABLED** | Tenant Business Rules |
| `company_billing_information` | `id` (uuid) | `company_id` (FK), `gstin`, `legal_name` | **DISABLED** | Legal & Tax Entities |
| `company_contacts` | `id` (uuid) | `company_id` (FK), `email`, `phone`, `address` | **DISABLED** | Tenant Contact Info |
| `company_tax_settings` | `id` (uuid) | `company_id` (FK), `tax_name`, `tax_rate` | **DISABLED** | Tenant Tax Rules |
| `billing_settings` | `id` (uuid) | `company_id` (FK), `billing_email`, `auto_renew` | **DISABLED** | Tenant Subscription Billing |
| `business_hours` | `id` (uuid) | `company_id`, `branch_id`, `day_of_week`, `open_time`, `close_time` | **DISABLED** | Branch Operating Hours |
| `business_payment_settings` | `id` (uuid) | `company_id`, `upi_id`, `merchant_id` | **DISABLED** | Tenant Payment Credentials |
| `invoice_settings` | `id` (uuid) | `company_id`, `prefix`, `next_number` | **DISABLED** | POS/Invoice Sequences |

---

### 3.3 Domain: Salon Business Operations (Target: `app`)

| Table Name | Primary Key | Key Columns / FK References | RLS Status | Intended Domain |
|---|---|---|---|---|
| `bookings` | `id` (uuid) | `company_id`, `branch_id`, `customer_id`, `booking_date`, `status`, `total_price` | **DISABLED** | Salon Appointments & Bookings |
| `bookings_for_business_transaction` | `id` (uuid) | `booking_id`, `company_id`, `amount` | **DISABLED** | Financial Transaction Bridge |
| `customers` | `customer_id` (uuid) | `company_id`, `name`, `phone`, `email`, `total_spent` | **DISABLED** | Salon Customer Registry |
| `reviews` | `id` (uuid) | `company_id`, `branch_id`, `customer_id`, `rating` | **DISABLED** | Customer Reviews & Feedback |
| `service_categories` | `category_id` (uuid) | `company_id`, `name`, `status` | **DISABLED** | Catalog Service Categories |
| `services` | `service_id` (uuid) | `category_id` (FK), `company_id`, `name`, `price`, `duration` | **DISABLED** | Individual Salon Services |
| `packages` | `package_id` (uuid) | `company_id`, `name`, `price`, `validity_days` | **DISABLED** | Bundled Service Packages |
| `package_services` | `id` (uuid) | `package_id` (FK), `service_id` (FK), `quantity` | **DISABLED** | Package Service Items |
| `product_categories` | `category_id` (uuid) | `company_id`, `name` | **DISABLED** | Retail Product Categories |
| `products` | `product_id` (uuid) | `category_id` (FK), `company_id`, `name`, `retail_price`, `stock_quantity` | **DISABLED** | Retail Products & Inventory |
| `staff` | `staff_id` (uuid) | `company_id`, `branch_id`, `name`, `phone`, `role` | **DISABLED** | Salon Staff Registry |
| `staff_schedule` | `id` (uuid) | `staff_id` (FK), `day_of_week`, `shift_start`, `shift_end` | **DISABLED** | Staff Working Hours |
| `sales` | `id` (uuid) | `company_id`, `branch_id`, `customer_id`, `total_amount`, `status` | **DISABLED** | POS Sales Invoices |
| `sales_for_business_transactions` | `id` (uuid) | `sale_id`, `company_id`, `amount` | **DISABLED** | POS Transaction Ledger Bridge |
| `payments` | `id` (uuid) | `company_id`, `reference_id`, `payment_method`, `amount`, `status` | **DISABLED** | Payment Receipts |
| `payment_refunds` | `id` (uuid) | `payment_id` (FK), `company_id`, `refund_amount`, `reason` | **DISABLED** | Payment Refund Logs |
| `business_transactions` | `payment_id` (uuid) | `company_id`, `branch_id`, `transaction_type`, `amount` | **DISABLED** | Central Financial Ledger |
| `expenses` | `expense_id` (uuid) | `company_id`, `branch_id`, `category`, `amount`, `expense_date` | **DISABLED** | Operating Expenses |
| `coupons` | `id` (uuid) | `company_id`, `code`, `discount_percent`, `valid_until` | **DISABLED** | Promotional Discount Codes |
| `offers` | `id` (uuid) | `company_id`, `title`, `discount_type`, `value` | **DISABLED** | Campaign Marketing Offers |
| `discount_usages` | `id` (uuid) | `company_id`, `coupon_id`, `customer_id`, `used_at` | **ENABLED** | Coupon Redemption Limits |
| `memberships` | `id` (uuid) | `company_id`, `name`, `price`, `discount_percent`, `duration_days` | **DISABLED** | Membership Plan Catalog |
| `membership_purchases` | `purchase_id` (uuid) | `company_id`, `membership_id` (FK), `customer_id` (FK), `expiry_date`, `status` | **DISABLED** | Active Customer Memberships |

---

## 4. PostgreSQL Functions & RPC Inventory

All database routines are organized with explicit `search_path = platform, shared, app, public, pg_temp;`. Authoritative business operations reside in their designated schema (`app` or `shared`) with zero-downtime PostgREST-accessible routing wrappers in `public`.

### 4.1 Multi-Tenant Authorization & Security Helpers

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `verify_tenant_access` | `shared` | **DEFINER** | `boolean` | ✅ `platform, shared, app, public, pg_temp` | Validates caller session against `shared.companies` and `shared.branches`, preventing cross-tenant leakage. |

### 4.2 Module 1: Bookings Operations & Business RPCs (100% Migrated & Hardened)

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `create_booking_atomic` | `app` & `public` | **DEFINER** | `uuid` | ✅ `platform, shared, app, public, pg_temp` | Atomic appointment creation enforcing 13 business rules: multi-tenant verification, SaaS plan limits, customer deduplication, catalog price anti-tampering, operating hours, staff schedules, and concurrency-safe overlap prevention. |
| `update_booking_status_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Strict state machine transitions (`booked`, `confirmed`, `in-progress`, `completed`, `cancelled`, `no-show`). Precondition: blocks `completed` status if payment is unpaid. Updates line items & summary atomically. |
| `update_booking_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic rescheduling and service edits with stylist collision detection and customer visit stat syncing. |
| `process_booking_payment_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Full payment settlement enforcing authoritative server-side coupon/offer validation, final amount integrity, and 3-table ledger synchronization (`business_transactions`, `bookings_for_business_transaction`, `bookings`). |
| `process_booking_refund_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Authoritative refund processing enforcing RBAC authorization, duplicate refund guards, 100% full refund policy, ledger reversal, and customer lifetime spend subtraction. |

### 4.3 Module 2: POS Operations & Business RPCs (100% Migrated & Hardened)

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `create_pos_sale_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic POS counter checkout enforcing 11 rules: tenant authorization, catalog price lookup (anti-tampering), deterministic inventory row-locking (`FOR UPDATE`), negative stock prevention, server-side coupon/offer re-validation, discount usage tracking, and customer LTV spend update. |
| `process_pos_refund_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic POS returns enforcing 6 rules: tenant verification, refund reference deduplication, per-item returnable quantity guards, stock re-increment, price-weighted proportional discount reversal, and customer lifetime spend decrement. |
| `deduct_product_stock` | `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | *(Deprecated / Superseded)* Legacy standalone inventory decrement function; superseded by `create_pos_sale_atomic`. |

### 4.4 Module 3: Memberships & Plan Management RPCs (100% Migrated & Hardened)

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `assign_membership_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic membership assignment enforcing 12 rules: multi-tenant authorization, catalog price authority (anti-tampering), server-side 6-step coupon validation, coupon usage count increment, customer phone deduplication/creation, duplicate active membership guard, duration/expiry calculation, customer LTV update, and transaction ledger synchronization. |
| `cancel_membership_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic cancellation enforcing 5 rules: strict tenant verification, active-status precondition, state machine transition, and mandatory atomic cancellation ledger recording in `business_transactions`. |
| `process_membership_refund_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomic membership refund enforcing 9 rules: tenant verification, cancelled-state precondition, duplicate refund guard, max refundable limit calculation (`paid - already_refunded`), customer spend reversal, discount usage reversal, and refund ledger recording. |
| `create_membership_plan` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Creates a new active plan with tenant check, positive price and duration validation, and discount type check. |
| `update_membership_plan` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomically updates plan parameters (price, duration, discount perks, status) with tenant validation. |
| `delete_membership_plan` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Soft-deletes a plan with active member guard (blocks deletion if active subscribers exist). |
| `sync_expired_memberships` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Batch syncs expired active memberships to status `'expired'` based on `CURRENT_DATE`. |

### 4.5 Module 4: Services & Packages Operations & Catalog RPCs (100% Migrated & Hardened)

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `create_service_category_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Creates catalog category with tenant access check, case-insensitive duplicate guard, and description trimming. |
| `update_service_category_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates category details and **atomically cascades new name to `app.services.category_name`** in the same transaction. |
| `delete_service_category_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Soft-deletes category (`status = 'deleted'`); **blocks deletion if active services remain assigned**. |
| `create_service_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Creates service with `price >= 0`, `duration >= 1`, verified category ownership, and duplicate name prevention. |
| `update_service_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates service attributes; validates price/duration; **atomically cascades service name changes to `package_services`**. |
| `delete_service_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Soft-deletes service; **blocks if service is in active package or scheduled in future active bookings**. |
| `create_package_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Bundles services into package atomically; validates `final_price <= original_price` and service tenant ownership. |
| `update_package_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates package details and synchronizes `package_services` mapping atomically in one transaction. |
| `delete_package_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Soft-deletes package (`status = 'deleted'`, `is_active = false`); **blocks if upcoming active bookings reference package**. |

### 4.6 Module 5: Staff & Scheduling Operations RPCs (100% Migrated & Hardened)

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `create_staff_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Creates staff member; validates required fields, **enforces SaaS plan `max_staff` quota**, and performs branch phone deduplication (10-digit normalized suffix). |
| `update_staff_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates staff details with tenant validation and branch phone uniqueness assertion. |
| `delete_staff_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Soft-deletes staff (`status = 'deleted'`); **blocks deletion if upcoming active bookings exist**; cleans future scheduled shifts. |
| `save_staff_schedule_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomically replaces monthly schedule in one transaction; preserves past dates; **blocks off-duty/shift changes that conflict with active bookings**. |
| `delete_staff_schedule_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Deletes monthly schedule from today onwards; **blocks deletion if active bookings exist during the period**. |
| `save_business_hours_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Atomically upserts 7-day branch operating schedule; asserts `opening_time < closing_time` for open days. |

### 4.7 General Business RPCs

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `onboard_company_workspace` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Initializes default roles, branches, and settings for a new company. |
| `cancel_company_subscription` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Logs and cancels tenant SaaS subscription. |
| `activate_subscription_addon` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Activates add-on entitlement for tenant. |
| `deactivate_subscription_addon` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Deactivates add-on entitlement. |
| `save_business_settings` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates company operational parameters. |
| `save_billing_information` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates company legal billing info. |
| `save_contact_settings` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates branch contact details. |
| `mark_all_notifications_read` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates notification read flags for user. |

### 4.8 Analytical & Reporting Routines

| Routine Name | Security Type | Return Type | Fixed search_path? | Scope |
|---|---|---|---|---|
| `get_calendar_month_bookings_summary`| **DEFINER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Aggregates daily booking counts/revenue for calendar view. |
| `get_bookings_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Exports filtered booking metrics. |
| `get_customers_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Aggregates customer acquisition and spend. |
| `get_financial_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Comprehensive revenue, tax, and refund summaries. |
| `get_memberships_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Membership sales and utilization reports. |
| `get_product_sales_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Retail item sales and margin breakdown. |
| `get_staff_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Staff hours, service count, and commissions. |
| `get_discount_report` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Coupon and promotional discount impact. |
| `get_expenses_stat_cards` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Summary cards for operational expenses. |
| `get_analytics_overview` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | High-level executive KPI rollups. |
| `overview_analytics` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Secondary analytical dashboard feed. |
| `dashboard_statcards_four` | **DEFINER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Today's appointments, sales, new clients, staff on duty. |
| `dashboard_todays_revenue_kpis` | **DEFINER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Today's gross vs net revenue metrics. |
| `dashboard_top_services` | **DEFINER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Ranked list of popular services. |
| `dashboard_weekly_revenue` | **DEFINER** | `record` | ✅ `platform, shared, app, public, pg_temp` | 7-day revenue trend. |
| `Global_customer_profile_modal` | **INVOKER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Customer profile modal aggregation. |
| `customers_page__four_statcards` | **INVOKER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Top-level cards on Customers page. |
| `customers_page__four_statcard_trendelements` | **INVOKER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Trend indicators for Customers page. |
| `customers_page_clickable_total_spent` | **INVOKER** | `record` | ✅ `platform, shared, app, public, pg_temp` | Drill-down on customer lifetime value. |
| `get_company_subscription_details` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Active plan and entitlement details. |
| `get_business_settings` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Settings payload for active session. |

---

## 5. Triggers & Database Automation

| Table Name | Trigger Name | Timing & Event | Action Statement | Purpose / Side Effect |
|---|---|---|---|---|
| `bookings_for_business_transaction` | `trg_create_initial_business_transaction` | **AFTER INSERT** | `EXECUTE FUNCTION fn_create_initial_business_transaction()` | Records initial transaction ledger entry when booking transaction bridge row is inserted. |
| `bookings_for_business_transaction` | `trg_update_customer_stats_on_complete` | **AFTER UPDATE** | `EXECUTE FUNCTION fn_update_customer_stats_on_complete()` | Updates customer's `total_spent` and visit counters when booking status becomes complete. |
| `sales_for_business_transactions` | `trg_create_pos_business_transaction` | **AFTER INSERT** | `EXECUTE FUNCTION trg_pos_sale_business_transaction()` | Logs ledger entry for POS sales. |
| `payments` | `trg_payments_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |
| `payment_refunds` | `trg_payment_refunds_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |
| `subscriptions` | `trg_subscriptions_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |
| `subscription_invoices` | `trg_subscription_invoices_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |
| `subscription_plan_changes` | `trg_subscription_plan_changes_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |
| `razorpay_webhook_events` | `trg_razorpay_webhook_events_updated_at` | **BEFORE UPDATE** | `EXECUTE FUNCTION set_updated_at()` | Automatically maintains `updated_at` timestamp. |

---

## 6. Security Architecture & Threat Analysis

### 6.1 Row Level Security (RLS) Status: 100% HARDENED & ENFORCED
* **Status**: **RESOLVED & GLOBALLY LOCKED DOWN across 100% of tables (all 58 base tables).**
* **Enforcement Highlights**:
  * **All 58 base tables** across `app` (26), `platform` (15), and `shared` (17) have `rowsecurity = true`.
  * **All 59 compatibility views** in `public` have `security_invoker = true`, ensuring all frontend PostgREST queries evaluate RLS under the caller's identity.
  * **0 direct write mutations permitted**: No `INSERT`, `UPDATE`, or `DELETE` policies exist for `anon` or `authenticated` roles. All state mutations MUST be routed through authoritative PostgreSQL `SECURITY DEFINER` stored procedures.
  * **Tenant isolation**: All SELECT policies enforce multi-tenant boundary checks via `shared.verify_tenant_access(company_id, NULL)`.
  * Commercial catalog tables (`plans`, `plan_features`, `plan_limits`, `plan_sub_features`, `add_ons`) have global read-only policies (`USING (true)`).

### 6.2 SECURITY DEFINER Search Path Lockdown (RESOLVED)
* **Status: RESOLVED & HARDENED across 100% of routines (all 82 atomic procedures / 205 routines).**
* Every `SECURITY DEFINER` routine has been explicitly locked with `SET search_path = platform, shared, app, public, pg_temp;`. This eliminates search path hijacking vectors and enforces strict execution isolation across schemas.

### 6.3 Target Security Standards
1. **Mandatory RLS**: Enable RLS on every table without exception.
2. **Strict Tenant Policies**: All policies must verify `company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid` or check user membership in the tenant.
3. **Hardened RPCs**:
   * Explicit parameter verification (validate all UUIDs and amounts > 0).
   * Fixed `search_path = public, pg_temp`.
   * Explicit authorization check inside the RPC before performing mutations.
   * Restrict `EXECUTE` privileges: revoke from `public` and `anon`, grant exclusively to `authenticated` or `service_role`.

---

## 7. Supabase Edge Functions

All active Edge Functions deployed on Supabase:

| Function Name | Status | Auth / Role Requirement | Responsibilities |
|---|---|---|---|
| `create-razorpay-subscription` | **ACTIVE** | Authenticated User | Interacts with Razorpay API to generate recurring subscription orders for salon tenants. |
| `razorpay-webhook` | **ACTIVE** | Service Role / Webhook Secret | Validates HMAC signature, idempotently logs webhook to `razorpay_webhook_events`, updates `subscriptions` status. |
| `cancel-subscription` | **ACTIVE** | Authenticated (Company Owner) | Calls Razorpay API to cancel active subscription; logs cancellation to `subscription_cancellation_logs`. |
| `purchase-addon` | **ACTIVE** | Authenticated (Company Owner) | Creates an addon charge and updates `subscription_add_ons`. |
| `change-subscription-plan` | **ACTIVE** | Authenticated (Company Owner) | Coordinates plan upgrades/downgrades with Razorpay and writes audit rows. |

---

## 8. Database Views

| View Name | Schema | Purpose |
|---|---|---|
| `payment_history_view` | `public` | Joins `payments`, `payment_refunds`, and customer metadata for unified financial transaction display. |

---

## 9. Migration History & Version Control Log

| Migration ID | Date | Description | Objects Affected | Status |
|---|---|---|---|---|
| `00000000000000_initial_baseline` | 2026-11-03 | Live baseline inspection and technical documentation initialization. | All 58 tables, 45 routines, 9 triggers, 5 Edge Functions. | **Documented** |
| `20261103000001_migrate_platform_schema` | 2026-11-03 | Batch 1: Migrated 15 Platform tables to `platform` schema, created public compatibility views, configured RPC search paths, and applied RLS on webhooks. | 15 tables, 15 views, 4 RPC search paths, 2 RLS policies. | **Deployed & Verified** |
| `20261103000002_migrate_shared_schema` | 2026-11-03 | Batch 2: Migrated 17 Shared/IAM tables to `shared` schema, created public compatibility views, configured RPC search paths, and granted bootstrap access. | 17 tables, 17 views, 5 RPC search paths. | **Deployed & Verified** |
| `20261103000003_migrate_app_schema` | 2026-11-03 | Batch 3: Migrated 26 Salon Business tables and recreated `payment_history_view` in `app` schema, created public compatibility views, locked search paths on all 45 database routines. | 26 tables, 27 views, 36 RPC search paths. | **Deployed & Verified** |
| `20261103000004_harden_create_booking_atomic` | 2026-11-03 | Unit 1 (Bookings): Hardened `create_booking_atomic` with 13 business rules: multi-tenant check, plan limits, customer deduplication, catalog price authority, operating hours, staff schedule, and concurrency-safe overlap prevention. | `shared.verify_tenant_access`, `app.create_booking_atomic`, `public.create_booking_atomic` | **Deployed & Verified** |
| `20261103000005_harden_booking_status_and_edit` | 2026-11-03 | Unit 2 (Bookings): Deployed `app.update_booking_status_atomic` (enforces prepayment before completion, atomic state machine) and hardened `app.update_booking_atomic` (anti-tampering, stylist collision check). Integrated into frontend `booking-status-actions.js`. | `app.update_booking_status_atomic`, `app.update_booking_atomic`, `booking-status-actions.js` | **Deployed & Verified** |
| `20261103000006_harden_booking_payments_and_refunds` | 2026-11-03 | Unit 3 (Bookings): Deployed hardened `app.process_booking_payment_atomic` (multi-tenant check, server-side coupon validation, authoritative final amount, discount usage tracking) and `app.process_booking_refund_atomic` (RBAC authorization, duplicate refund guard, 100% full refund policy, customer spend reversal). | `app.process_booking_payment_atomic`, `app.process_booking_refund_atomic` | **Deployed & Verified** |
| `20261103000007_harden_pos_module` | 2026-11-03 | Module 2 (POS): Hardened `app.create_pos_sale_atomic` (catalog price lookup, deterministic row-locking, negative stock prevention, server coupon validation, discount usage tracking, customer LTV spend update) and `app.process_pos_refund_atomic` (tenant verification, returnable quantity guard, stock re-increment, price-weighted proportional discount reversal, customer spend decrement) with PostgREST public wrappers and financial ledger trigger hardening. | `app.create_pos_sale_atomic`, `public.create_pos_sale_atomic`, `app.process_pos_refund_atomic`, `public.process_pos_refund_atomic`, `public.trg_pos_sale_business_transaction` | **Deployed & Verified** |
| `20261103000008_harden_memberships_module` | 2026-11-03 | Module 3 (Memberships): Hardened `app.assign_membership_atomic` (catalog price authority, 6-step coupon validation, coupon usage count increment, customer phone deduplication, duplicate active membership guard, customer LTV update), `app.cancel_membership_atomic` (tenant verification, active-status precondition, atomic cancellation ledger entry), `app.process_membership_refund_atomic` (max refundable limit, spend reversal, discount reversal), plan CRUD RPCs (`create_membership_plan`, `update_membership_plan`, `delete_membership_plan` with active subscriber guard), and batch expiration sync (`sync_expired_memberships`). | `app.assign_membership_atomic`, `app.cancel_membership_atomic`, `app.process_membership_refund_atomic`, `app.create_membership_plan`, `app.update_membership_plan`, `app.delete_membership_plan`, `app.sync_expired_memberships` (with public wrappers) | **Deployed & Verified** |
| `20261103000009_harden_services_module` | 2026-11-03 | Module 4 (Services & Packages): Hardened `create_service_category_atomic`, `update_service_category_atomic` (atomic cascade to `services.category_name`), `delete_service_category_atomic` (active service dependency guard), `create_service_atomic`, `update_service_atomic` (cascade to `package_services`), `delete_service_atomic` (active package and future booking guards), `create_package_atomic` (`final_price <= original_price` and service tenant validation), `update_package_atomic` (atomic `package_services` resync), and `delete_package_atomic` (future booking guard). | `app` & `public` categories, services, and packages stored procedures (9 functions) | **Deployed & Verified** |
| `20261103000010_harden_staff_module` | 2026-11-04 | Module 5 (Staff & Scheduling): Hardened `create_staff_atomic` (SaaS `max_staff` plan quota check, normalized phone deduplication), `update_staff_atomic`, `delete_staff_atomic` (upcoming booking blocker), `save_staff_schedule_atomic` (atomic single-transaction overwrite, past-date preservation, active booking conflict check), `delete_staff_schedule_atomic` (active booking blocker), and `save_business_hours_atomic` (`opening_time < closing_time` assertion). | `app` & `public` staff, staff schedule, and operating hours stored procedures (6 functions) | **Deployed & Verified** |
| `20261103000011_harden_customers_module` | 2026-11-04 | Module 6 (Customers & CRM): Hardened `create_customer_atomic` (tenant verification, phone normalization $\ge 7$ digits, normalized 10-digit suffix deduplication in company, sets `total_spent = 0.00`, returns created JSON in single roundtrip), `update_customer_atomic` (phone deduplication against other company customers, strictly protects `total_spent` and `last_visit` against client tampering), `delete_customer_atomic` (soft-delete with dependency blockers for active/upcoming bookings and active memberships), and `submit_customer_review_atomic` (rating 1-5 validation, user and tenant verification). | `app` & `public` customer and review stored procedures (4 functions / 8 routines) | **Deployed & Verified** |
| `20261103000012_harden_marketing_module` | 2026-11-04 | Module 7 (Marketing: Coupons & Offers): Hardened `create_coupon_atomic` (tenant verification, code uppercase normalization, unique code within tenant branch check, discount percentage 1-100% and fixed bounds, date range assertions), `update_coupon_atomic`, `delete_coupon_atomic` (soft-delete preserving `discount_usages` audit history), `create_offer_atomic` (unique offer title, discount bounds, date assertions), `update_offer_atomic`, `delete_offer_atomic`, and `validate_discount_code` (server-side authoritative validation checking min spend, date bounds, applicability flags, total and per-customer limits). | `app` & `public` coupon and offer stored procedures (7 functions / 14 routines) | **Deployed & Verified** |
| `20261103000013_harden_products_module` | 2026-11-04 | Module 8 (Products & Retail Inventory): Hardened `create_product_category_atomic` (unique name in tenant), `update_product_category_atomic` (name collision guard, atomic cascade to `products.category_name`), `delete_product_category_atomic` (active product blocker), `create_product_atomic` (category resolution, non-negative price/stock), `update_product_atomic` (non-negative price/stock guards), `delete_product_atomic` (soft-delete status = 'deleted'), and `adjust_product_stock_atomic` (row-level lock `FOR UPDATE`, negative stock prevention, stock movement logging). | `app` & `public` product, category, and inventory stored procedures (7 functions / 14 routines) | **Deployed & Verified** |
| `20261103000014_harden_expenses_module` | 2026-11-04 | Module 9 (Expenses & Financials): Hardened `create_expense_atomic` (tenant verification, required date, non-empty category, strictly positive amount $>0$), `update_expense_atomic` (active expense existence check, positive amount), `delete_expense_atomic` (soft-delete status = 'deleted' preserving financial analytics), and `record_business_transaction_atomic` (reference type check, payment method check, status check, negative amount guard, polymorphic tenant reference verification). | `app` & `public` expense and transaction stored procedures (4 functions / 8 routines) | **Deployed & Verified** |
| `20261103000015a_harden_iam_users` | 2026-11-04 | Module 10 Part A (IAM – User procedures): Hardened `create_user_atomic` (accepts pre-created Supabase Auth UID, email uniqueness in company, Owner role assignment guard, role existence check), `update_user_atomic` (Owner user protection, Owner role assignment guard, role existence check), `toggle_user_status_atomic` (Owner user protection, valid status values), `delete_user_atomic` (soft-delete with Owner user protection), `update_user_last_login_atomic` (lightweight session-tracking by user_id or email, no tenant guard required at login time), and `update_user_profile_name_phone_atomic` (self-service name/phone update). | `app` & `public` user stored procedures (6 functions / 12 routines) | **Deployed & Verified** |
| `20261103000015b_harden_iam_roles` | 2026-11-04 | Module 10 Part B (IAM – Role/Permission/Preference procedures): Hardened `create_role_atomic` (Owner name guard, case-insensitive uniqueness per company), `update_role_atomic` (Owner role protection, name uniqueness excluding self), `delete_role_atomic` (Owner role protection, active-users blocker, cascade-delete `role_permissions`), `save_role_permissions_atomic` (atomic single-row upsert matching the client's single-row design; Owner role protection), and `upsert_user_preferences_atomic` (create-or-update with partial-field COALESCE pattern). | `app` & `public` role, permission, and preference stored procedures (5 functions / 10 routines) | **Deployed & Verified** |
| `20261103000016a_harden_branches` | 2026-11-04 | Module 11 Part A (Company & Branches): Hardened `create_branch_atomic` (tenant validation, non-empty branch name, unique branch name per company, optional manager validation), `update_branch_atomic` (tenant check, active branch check, name collision check), `toggle_branch_status_atomic` (flips active $\leftrightarrow$ inactive, guards against deactivating the company's only active branch), and `delete_branch_atomic` (soft-delete with blockers for solo branch, active upcoming bookings, and assigned active staff). | `app` & `public` branch stored procedures (4 functions / 8 routines) | **Deployed & Verified** |
| `20261103000016b_harden_settings` | 2026-11-04 | Module 11 Part B (Tenant Settings & Configurations): Hardened `save_billing_information_atomic` (upserts legal billing details), `save_invoice_settings_atomic` (atomic upsert for common/booking/pos/membership receipt customization on composite `(company_id, branch_id)`), `save_notification_settings_atomic` (atomic upsert for system/customer/marketing alert toggles), `save_business_payment_settings_atomic` (atomic upsert with at-least-one-method-enabled assertion), and `save_company_tax_settings_atomic` (atomic upsert for GSTIN/PAN and tax rates with non-negative rate assertion). | `app` & `public` settings stored procedures (5 functions / 11 routines) | **Deployed & Verified** |
| `20261103000017_harden_billing_module` | 2026-11-04 | Module 12 (SaaS Billing & Subscriptions): Hardened `cancel_subscription_addon_atomic` (cycle-end cancellation with active verification), `reactivate_subscription_addon_atomic` (unexpired cancelling add-on reactivation), `sync_plan_features_atomic` (atomic single-row plan feature resync), `sync_usage_counter_atomic` (atomic quota counter upsert with COALESCE metrics preservation), and `backfill_oauth_phone_atomic` (authoritative synchronization of phone into users & profiles upon subscription activation). | `app` & `public` subscription, quota, and billing stored procedures (5 functions / 10 routines) | **Deployed & Verified** |
| `20261103000018_final_audit_hardening` | 2026-11-04 | Pre-Phase 13 Comprehensive Hardening: Full codebase audit across 229 files eliminated remaining 22 direct mutations. Deployed `shared.update_user_profile_full_atomic`, `app.mark_notification_read_atomic`, `app.create_notification_atomic`, `shared.submit_issue_atomic`, `shared.add_issue_attachment_atomic`, `shared.add_issue_message_atomic`, `shared.update_issue_status_atomic`, `shared.submit_suggestion_atomic`, `shared.delete_suggestion_atomic`, and patched booking modals & bridge to use `update_booking_status_atomic`. Global mutation audit reports 0 direct writes across all 58 tables. | 9 stored procedures / 18 routines across `shared`, `app`, and `public` | **Deployed & Verified** |
| `20261103000019a_rls_lockdown_app_schema` | 2026-11-04 | Phase 13 (Part A): Enabled Row Level Security across all 26 base tables in `app` schema. Applied tenant-isolated `SELECT` policies using `shared.verify_tenant_access(company_id, NULL)`. Dropped legacy loose policies on `discount_usages` and `notifications`. Permitted 0 direct client mutations (`INSERT`, `UPDATE`, `DELETE` blocked). | 26 tables, 26 RLS policies | **Deployed & Verified** |
| `20261103000019b_rls_lockdown_platform_schema` | 2026-11-04 | Phase 13 (Part B): Enabled Row Level Security across all 15 base tables in `platform` schema. Applied public read policies for commercial catalogs (`plans`, `plan_features`, `plan_limits`, `plan_sub_features`, `add_ons`, `platform_support_settings`) and tenant-isolated `SELECT` policies for subscriptions & financial logs (`subscriptions`, `subscription_add_ons`, `subscription_invoices`, `subscription_plan_changes`, `usage_counters`, `payments`, `payment_refunds`). Permitted 0 direct client mutations. | 15 tables, 14 RLS policies | **Deployed & Verified** |
| `20261103000019c_rls_lockdown_shared_schema` | 2026-11-04 | Phase 13 (Part C): Enabled Row Level Security across all 17 base tables in `shared` schema. Applied tenant-isolated & self-scoped `SELECT` policies for `branches`, `companies`, `users`, `profiles`, `roles`, `role_permissions`, `user_preferences`, settings, reviews, issues, and suggestions. Permitted 0 direct client mutations. | 17 tables, 17 RLS policies | **Deployed & Verified** |
| `20261103000019d_rls_security_invoker_views` | 2026-11-04 | Phase 13 (Part D): Configured `security_invoker = true` across all 59 public compatibility views in `public` schema. Forces all frontend PostgREST queries hitting public views to execute under the caller's credentials and strictly enforce the underlying base table RLS policies. | 59 public views | **Deployed & Verified** |

---

## 10. Pending Work & Known Issues (Sprint Plan)

### High Priority (Security & Architecture Core)
- [x] **Schema Organization Architecture**: All 58 tables organized into `platform` (15), `shared` (17), and `app` (26) with zero-downtime public compatibility views.
- [x] **Fix Search Path on all database functions**: 100% of routines (all 45 functions) now have explicit `search_path = platform, shared, app, public, pg_temp;`.
- [x] **Establish Centralized Backend Authorization Helpers**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)` (Deployed & Verified)
- [x] **Module 1: BOOKINGS (100% Complete & Verified)**:
  - [x] **Unit 1 (Create Booking Workflow)**: 13 business rules migrated to PostgreSQL, price anti-tampering active, customer deduplication active, concurrency double-booking prevention active. (Deployed & Verified)
  - [x] **Unit 2 (Booking Status & Edit Workflows)**: Eliminated raw client mutations, deployed atomic status state machine (`app.update_booking_status_atomic`), enforced completion prepayment requirement, and hardened reschedule collision checks. (Deployed & Verified)
  - [x] **Unit 3 (Payment Settlement & Refund Workflows)**: Deployed hardened payment settlement (`app.process_booking_payment_atomic`) with server-side coupon validation & authoritative final amounts, and hardened refund routine (`app.process_booking_refund_atomic`) with RBAC authorization & duplicate refund guards. (Deployed & Verified)
- [x] **Module 2: POS (Sales, Counter Checkouts & Retail Inventory) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (18 logics mapped)
  - [x] Stage 2: Architecture & Specification (`docs/modules/pos/POS_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`app.create_pos_sale_atomic`, `app.process_pos_refund_atomic`, `trg_pos_sale_business_transaction`)
  - [x] Stage 4: Automated Testing & Validation (8 comprehensive integration tests passed)
  - [x] Stage 5: Frontend Integration & Cleanup (Retired orphaned `scripts/payment-pos.js`, verified zero direct writes)
- [x] **Module 3: MEMBERSHIPS (Purchases, Renewals & Redemptions) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/memberships/MEMBERSHIPS_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/memberships/MEMBERSHIPS_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`app.assign_membership_atomic`, `app.cancel_membership_atomic`, `app.process_membership_refund_atomic`, Plan CRUD RPCs, `sync_expired_memberships`)
  - [x] Stage 4: Testing & Validation (13 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Cleanup (Retired `scripts/payment-membership.js`, purged 10 direct mutations, audit complete in `docs/modules/memberships/MEMBERSHIPS_MODULE_AUDIT.md`)
- [x] **Module 4: SERVICES & PACKAGES (Catalog Authority, Custom Pricing, Bundling) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/services/SERVICES_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/services/SERVICES_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_service_category_atomic`, `update_service_category_atomic`, `delete_service_category_atomic`, `create_service_atomic`, `update_service_atomic`, `delete_service_atomic`, `create_package_atomic`, `update_package_atomic`, `delete_package_atomic`)
  - [x] Stage 4: Testing & Validation (14 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`scripts/services/services-api.js`, `service-categories.js`, audit complete in `docs/modules/services/SERVICES_MODULE_AUDIT.md`)
- [x] **Module 5: STAFF & SCHEDULING (Workforce, Shifts, Branch Hours) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/staff/STAFF_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/staff/STAFF_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_staff_atomic`, `update_staff_atomic`, `delete_staff_atomic`, `save_staff_schedule_atomic`, `delete_staff_schedule_atomic`, `save_business_hours_atomic`)
  - [x] Stage 4: Testing & Validation (12 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`staff.js`, `scripts/staff-schedule/schedule-api.js`, `scripts/settings-hours.js`, audit complete in `docs/modules/staff/STAFF_MODULE_AUDIT.md`)
- [x] **Module 6: CUSTOMERS & CRM (Customer Profiles, Deduplication, Spend Aggregations, Reviews) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/customers/CUSTOMERS_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/customers/CUSTOMERS_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_customer_atomic`, `update_customer_atomic`, `delete_customer_atomic`, `submit_customer_review_atomic`)
  - [x] Stage 4: Testing & Validation (13 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`scripts/global-customer-modal.js`, `scripts/global-booking-modal.js`, `customers.js`, `scripts/review-modal.js`, audit complete in `docs/modules/customers/CUSTOMERS_MODULE_AUDIT.md`)
- [x] **Module 7: MARKETING (Coupons, Campaign Offers, Redemption Quotas) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/marketing/MARKETING_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/marketing/MARKETING_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_coupon_atomic`, `update_coupon_atomic`, `delete_coupon_atomic`, `create_offer_atomic`, `update_offer_atomic`, `delete_offer_atomic`, `validate_discount_code`)
  - [x] Stage 4: Testing & Validation (15 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`scripts/coupons.js`, `scripts/offers.js`, `scripts/global-payment-modal/gpm-payment.js`, audit complete in `docs/modules/marketing/MARKETING_MODULE_AUDIT.md`)
- [x] **Module 8: PRODUCTS & RETAIL INVENTORY (Stock Tracking, Low Stock Alerts, Adjustments) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/products/PRODUCTS_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/products/PRODUCTS_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_product_category_atomic`, `update_product_category_atomic`, `delete_product_category_atomic`, `create_product_atomic`, `update_product_atomic`, `delete_product_atomic`, `adjust_product_stock_atomic`)
  - [x] Stage 4: Testing & Validation (16 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`scripts/products/products-api.js`, `scripts/sales-history/sales-api.js`, audit complete in `docs/modules/products/PRODUCTS_MODULE_AUDIT.md`)
- [x] **Module 9: EXPENSES & FINANCIALS (Expense Logging, Category Verification, Ledger Reconciliation) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/expenses/EXPENSES_STAGE1_INVESTIGATION.md`)
  - [x] Stage 2: Architecture & Specification (`docs/modules/expenses/EXPENSES_ARCHITECTURE_SPEC.md`)
  - [x] Stage 3: Backend Implementation (`create_expense_atomic`, `update_expense_atomic`, `delete_expense_atomic`, `record_business_transaction_atomic`)
  - [x] Stage 4: Testing & Validation (16 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`scripts/expenses.js`, `scripts/sales-history/sales-api.js`, `scripts/payment-booking.js`, audit complete in `docs/modules/expenses/EXPENSES_MODULE_AUDIT.md`)
- [x] **Module 10: IAM, USERS, ROLES & PERMISSIONS (User Invites, Role Assignments, Permission Checks) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/iam/IAM_STAGE1_INVESTIGATION.md`) — 21 mutations across 8 files catalogued
  - [x] Stage 2: Architecture & Specification (`docs/modules/iam/IAM_ARCHITECTURE_SPEC.md`) — 11 stored procedures designed
  - [x] Stage 3: Backend Implementation (`create_user_atomic`, `update_user_atomic`, `toggle_user_status_atomic`, `delete_user_atomic`, `update_user_last_login_atomic`, `update_user_profile_name_phone_atomic`, `create_role_atomic`, `update_role_atomic`, `delete_role_atomic`, `save_role_permissions_atomic`, `upsert_user_preferences_atomic`)
  - [x] Stage 4: Testing & Validation (23/23 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`users.js`, `roles-permissions.js`, `auth-callback.html`, `script.js`, `scripts/app-layout/profile.js`, `scripts/app-layout/settings.js`, `scripts/global-auth-guard.js`, `scripts/notification-manager.js` — 0 violations, audit complete in `docs/modules/iam/IAM_MODULE_AUDIT.md`)
- [x] **Module 11: COMPANY, BRANCHES & SETTINGS (Workspace Onboarding, Branch Configuration, Invoicing Settings) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/company_settings/COMPANY_SETTINGS_STAGE1_INVESTIGATION.md`) — 10 direct client mutations across 6 files catalogued
  - [x] Stage 2: Architecture & Specification (`docs/modules/company_settings/COMPANY_SETTINGS_ARCHITECTURE_SPEC.md`) — 9 stored procedures designed
  - [x] Stage 3: Backend Implementation (`create_branch_atomic`, `update_branch_atomic`, `toggle_branch_status_atomic`, `delete_branch_atomic`, `save_billing_information_atomic`, `save_invoice_settings_atomic`, `save_notification_settings_atomic`, `save_business_payment_settings_atomic`, `save_company_tax_settings_atomic`)
  - [x] Stage 4: Testing & Validation (18/18 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`branches.js`, `scripts/billing/billing-modal-billing.js`, `scripts/invoice-state.js`, `scripts/settings-notifications.js`, `scripts/settings-payments.js`, `scripts/settings-tax.js` — 0 violations, audit complete in `docs/modules/company_settings/COMPANY_SETTINGS_MODULE_AUDIT.md`)
- [x] **Module 12: SAAS BILLING & SUBSCRIPTIONS (Plan Changes, Addon Management, Razorpay Synchronization) (100% Complete & Verified)**:
  - [x] Stage 1: Investigation & Logic Inventory (`docs/modules/billing/BILLING_STAGE1_INVESTIGATION.md`) — 11 direct client mutations across 5 files catalogued
  - [x] Stage 2: Architecture & Specification (`docs/modules/billing/BILLING_ARCHITECTURE_SPEC.md`) — 5 stored procedures designed
  - [x] Stage 3: Backend Implementation (`cancel_subscription_addon_atomic`, `reactivate_subscription_addon_atomic`, `sync_plan_features_atomic`, `sync_usage_counter_atomic`, `backfill_oauth_phone_atomic`)
  - [x] Stage 4: Testing & Validation (13/13 automated integration tests passed)
  - [x] Stage 5: Frontend Integration & Zero-Mutation Audit (`config/plan-features-manager.js`, `config/plan-limits-manager.js`, `scripts/billing/billing-modal-addons.js`, `scripts/billing/manage-addons-page.js`, `payment-result.js` — 0 violations, audit complete in `docs/modules/billing/BILLING_MODULE_AUDIT.md`)
- [x] **Pre-Phase 13 Full Codebase Audit & Final Zero-Trust Hardening**:
  - [x] Scanned all 229 files across repository for all 58 tables: 22 remaining direct mutations identified and completely eliminated.
  - [x] Deployed Migration `20261103000018_final_audit_hardening` (9 atomic procedures / 18 routines).
  - [x] Patched `booking-manage-modal.js`, `booking-payment-bridge.js`, `profile.js`, `notifications.js`, `notification-manager.js`, `issue-service.js`, `suggestion-modal.js`, `sales-api.js`.
  - [x] Re-ran global scanner: **0 violations detected across all 229 files and 58 tables**.
  - [x] Validated 100% SECURITY DEFINER and search_path enforcement across all 82 atomic procedures.
- [x] **Phase 13: GLOBAL ROW LEVEL SECURITY (RLS) DATABASE-WIDE LOCKDOWN (100% Complete & Verified)**:
  - [x] **Part A (`20261103000019a`)**: Enabled RLS on all 26 base tables in `app` schema. Deployed tenant-isolated `SELECT` policies, dropped legacy loose policies, 0 direct write mutations permitted.
  - [x] **Part B (`20261103000019b`)**: Enabled RLS on all 15 base tables in `platform` schema. Deployed public catalog read policies and tenant-isolated subscription & financial policies.
  - [x] **Part C (`20261103000019c`)**: Enabled RLS on all 17 base tables in `shared` schema. Deployed tenant-isolated and self-scoped identity policies for users, profiles, roles, and settings.
  - [x] **Part D (`20261103000019d`)**: Enforced `security_invoker = true` across all 59 compatibility views in `public` schema.
  - [x] **Automated Verification**: Verified `rowsecurity = true` across all 58 base tables, `security_invoker = true` across all 59 views, direct mutation blocks confirmed, and 100% green test execution across all module test suites.

