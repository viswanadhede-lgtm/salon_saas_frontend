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

### 4.5 General Business RPCs

| Routine Name | Schema | Security Type | Return Type | Fixed search_path? | Purpose / Business Scope |
|---|---|---|---|---|---|
| `create_package_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Bundles services into a new package definition. |
| `update_package_atomic` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Modifies existing package services and pricing. |
| `onboard_company_workspace` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Initializes default roles, branches, and settings for a new company. |
| `cancel_company_subscription` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Logs and cancels tenant SaaS subscription. |
| `activate_subscription_addon` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Activates add-on entitlement for tenant. |
| `deactivate_subscription_addon` | `platform` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Deactivates add-on entitlement. |
| `save_business_settings` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates company operational parameters. |
| `save_billing_information` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates company legal billing info. |
| `save_contact_settings` | `shared` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates branch contact details. |
| `mark_all_notifications_read` | `app` & `public` | **DEFINER** | `jsonb` | ✅ `platform, shared, app, public, pg_temp` | Updates notification read flags for user. |

### 4.6 Analytical & Reporting Routines

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

### 6.1 Critical Vulnerability: RLS Status
* **55 of 58 application tables currently have Row Level Security DISABLED (`rowsecurity = False`).**
* **Implication**: Any client with an authenticated JWT (or in some configurations, an anonymous client) could directly query, insert, update, or delete records from `bookings`, `payments`, `customers`, `companies`, or `sales` across any tenant by invoking Supabase PostgREST endpoints directly (`/rest/v1/bookings`).
* **Existing RLS Policies are Inadequate**:
  * `discount_usages`: Policy allows `{authenticated}` role `ALL` actions without filtering on `company_id`.
  * `notifications`: Policy allows `{anon}` role `INSERT`, allowing unauthenticated spamming of the notification system.

### 6.2 SECURITY DEFINER Search Path Lockdown (RESOLVED)
* **Status: RESOLVED & HARDENED across 100% of routines (all 45 functions).**
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
- [ ] **Module 4: SERVICES & PACKAGES (Catalog Authority, Custom Pricing, Bundling)**:
  - Stage 1: Investigation & Logic Inventory
  - Stage 2: Architecture & Specification
  - Stage 3: Backend Implementation
  - Stage 4: Testing & Validation
  - Stage 5: Frontend Integration

