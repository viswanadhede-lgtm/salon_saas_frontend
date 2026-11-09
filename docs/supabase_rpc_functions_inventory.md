# Supabase Database RPC Functions Inventory

> **Project Reference:** `qxmgyxjwpxkdbgldpdil`  
> **Target Frontend:** `salon-saas-frontend` (Vanilla HTML5 / JavaScript)  
> **Generated Date:** November 9, 2026  
> **Audit Status:** 105 distinct RPC functions cataloged across 128 frontend invocations. 104 verified in PostgreSQL system catalogs.

---

## Architecture & Execution Overview

- **Security Definer (`SECURITY DEFINER`):** Most atomic write and aggregated analytical RPCs run as `SECURITY DEFINER` within the internal `app` or `public` schemas. They bypass direct table exposure to enforce atomic transaction logic, multi-table operations, and tenancy isolation.
- **Parameter Convention:** All tenant operations mandate `p_company_id (UUID)` and optionally `p_branch_id (UUID)` for multi-tenant branch partitioning.
- **Return Payloads:** Atomic mutations return standard `{ success: boolean, message?: text, ... }` or typed records, allowing the frontend to display notifications or gracefully rollback UI state.

---

## Executive Summary by Module

| # | Module Category | Distinct RPCs | Primary Operations |
| :- | :--- | :---: | :--- |
| 1 | Dashboard & Today Overview | **4** | Atomic transactions, analytics, and workflow orchestration |
| 2 | Bookings & Calendar Scheduling | **7** | Atomic transactions, analytics, and workflow orchestration |
| 3 | Customers & CRM | **9** | Atomic transactions, analytics, and workflow orchestration |
| 4 | Services, Categories & Packages | **9** | Atomic transactions, analytics, and workflow orchestration |
| 5 | Inventory & Products | **7** | Atomic transactions, analytics, and workflow orchestration |
| 6 | Staff & Rostering | **6** | Atomic transactions, analytics, and workflow orchestration |
| 7 | Sales & POS Checkout | **3** | Atomic transactions, analytics, and workflow orchestration |
| 8 | Expenses & Financial Outflows | **4** | Atomic transactions, analytics, and workflow orchestration |
| 9 | Memberships & Plans | **8** | Atomic transactions, analytics, and workflow orchestration |
| 10 | Marketing, Coupons & Offers | **6** | Atomic transactions, analytics, and workflow orchestration |
| 11 | Analytics & Financial Reports | **3** | Atomic transactions, analytics, and workflow orchestration |
| 12 | Settings & Business Configurations | **7** | Atomic transactions, analytics, and workflow orchestration |
| 13 | Branch Management | **4** | Atomic transactions, analytics, and workflow orchestration |
| 14 | Authentication, Users & RBAC | **15** | Atomic transactions, analytics, and workflow orchestration |
| 15 | System, Add-ons & Support | **12** | Atomic transactions, analytics, and workflow orchestration |
| 16 | Other Modules | **1** | Atomic transactions, analytics, and workflow orchestration |
| | **Total RPC Functions** | **105** | |

---

## 1. Dashboard & Today Overview

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`dashboard_statcards_four`**<br>*(Schema: `public`)* | p_branch_id uuid<br>p_company_id uuid | `TABLE(todays_bookings bigint, completed_appointments bigint, no_shows bigint, cancelled bigint, todays_revenue numeric, booking_trend numeric, revenue_trend numeric, completion_rate numeric)` | ✅ Yes | `scripts\dashboard\dashboard-kpis.js:18` |
| **`dashboard_weekly_revenue`**<br>*(Schema: `public`)* | p_branch_id uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_today date DEFAULT CURRENT_DATE | `TABLE(date text, day_label text, revenue numeric, is_today boolean)` | ✅ Yes | `scripts\dashboard\dashboard-revenue.js:17` |
| **`dashboard_top_services`**<br>*(Schema: `public`)* | p_branch_id uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_period text DEFAULT 'today'::text<br>p_today date DEFAULT CURRENT_DATE | `TABLE(service_name text, count bigint, revenue numeric)` | ✅ Yes | `scripts\dashboard\dashboard-services.js:17`<br>`scripts\dashboard\dashboard-services.js:70` |
| **`dashboard_todays_revenue_kpis`**<br>*(Schema: `public`)* | p_branch_id uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_today date DEFAULT CURRENT_DATE | `TABLE(services_revenue numeric, products_revenue numeric, memberships_revenue numeric, total_revenue numeric, total_transactions bigint, avg_transaction_value numeric, highest_sale numeric, total_refunds numeric, cash_payments numeric, digital_payments numeric, today_expenses numeric)` | ✅ Yes | `scripts\todays-revenue.js:55` |

## 2. Bookings & Calendar Scheduling

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`update_booking_atomic`**<br>*(Schema: `app`)* | p_booking_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_booking_date date<br>p_start_time time without time zone<br>p_notes text DEFAULT NULL::text<br>p_status text DEFAULT 'booked'::text<br>p_services jsonb DEFAULT '[]'::jsonb | `jsonb` | ✅ Yes | `scripts\bookings\booking-edit-modal.js:505`<br>`scripts\global-booking-modal.js:2107` |
| **`update_booking_status_atomic`**<br>*(Schema: `app`)* | p_booking_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_new_status text<br>p_notes text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\bookings\booking-manage-modal.js:351`<br>`scripts\bookings\booking-payment-bridge.js:459`<br>`scripts\bookings\booking-status-actions.js:64` |
| **`process_booking_payment_atomic`**<br>*(Schema: `app`)* | p_booking_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_payment_method text DEFAULT 'cash'::text<br>p_amount_paid numeric DEFAULT NULL::numeric<br>p_notes text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\bookings\booking-payment-bridge.js:431` |
| **`get_calendar_month_bookings_summary`**<br>*(Schema: `public`)* | p_branch_id uuid<br>p_year integer<br>p_month integer | `TABLE(booking_date date, total_bookings bigint, booked_count bigint, confirmed_count bigint, completed_count bigint, cancelled_count bigint, no_show_count bigint)` | ✅ Yes | `scripts\bookings\bookings-calendar.js:25` |
| **`create_booking_atomic`**<br>*(Schema: `app`)* | p_booking_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid<br>p_customer_name text<br>p_customer_email text<br>p_customer_phone text<br>p_is_new_customer boolean<br>p_services jsonb<br>p_booking_date date<br>p_notes text DEFAULT NULL::text<br>p_booking_type text DEFAULT 'walk-in'::text | `uuid` | ✅ Yes | `scripts\global-booking-modal.js:1956` |
| **`process_booking_refund_atomic`**<br>*(Schema: `app`)* | p_booking_id uuid<br>p_refund_reason text DEFAULT NULL::text<br>p_refund_notes text DEFAULT NULL::text<br>p_refund_method text DEFAULT 'cash'::text | `jsonb` | ✅ Yes | `scripts\rebook-refund\refund-workflow.js:36` |
| **`get_bookings_report`**<br>*(Schema: `public`)* | p_branch_id uuid DEFAULT NULL::uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date<br>p_end_date date DEFAULT CURRENT_DATE | `jsonb` | ✅ Yes | `scripts\reports\report-modules\bookings.js:130` |

## 3. Customers & CRM

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`create_customer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_customer_name text<br>p_customer_phone text DEFAULT NULL::text<br>p_customer_email text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\global-booking-modal.js:2168`<br>`scripts\global-customer-modal.js:141` |
| **`Global_customer_profile_modal`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid | `TABLE(customer_name text, customer_phone text, customer_email text, dob date, tags text, created_at timestamp with time zone, notes text, total_visits bigint, recent_bookings jsonb)` | No | `scripts\global-customer-profile-modal.js:72` |
| **`customers_page_clickable_total_spent`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid | `TABLE(services_total numeric, products_total numeric, memberships_total numeric, grand_total numeric)` | No | `scripts\global-customer-profile-modal.js:77`<br>`customers.js:801` |
| **`get_customers_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date<br>p_end_date date DEFAULT CURRENT_DATE<br>p_customer_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\reports\report-modules\customers.js:65` |
| **`submit_customer_review_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_user_id uuid DEFAULT NULL::uuid<br>p_rating integer DEFAULT NULL::integer<br>p_comments text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\review-modal.js:165` |
| **`customers_page__four_statcards`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid | `TABLE(total_customers bigint, new_this_month bigint, vip_customers bigint, inactive_customers bigint)` | No | `customers.js:189` |
| **`customers_page__four_statcard_trendelements`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid | `TABLE(total_customers_change_percent numeric, new_customers_change_percent numeric, vip_customers_percentage numeric, inactive_customers_percentage numeric)` | No | `customers.js:211` |
| **`update_customer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid<br>p_customer_name text<br>p_customer_phone text<br>p_customer_email text DEFAULT NULL::text<br>p_dob date DEFAULT NULL::date<br>p_tags text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text | `jsonb` | ✅ Yes | `customers.js:705` |
| **`delete_customer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid | `boolean` | ✅ Yes | `customers.js:751` |

## 4. Services, Categories & Packages

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`create_service_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_service_name text<br>p_category_id uuid<br>p_price numeric<br>p_duration bigint<br>p_description text DEFAULT NULL::text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\services\services-api.js:78` |
| **`update_service_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_service_id uuid<br>p_service_name text DEFAULT NULL::text<br>p_category_id uuid DEFAULT NULL::uuid<br>p_description text DEFAULT NULL::text<br>p_price numeric DEFAULT NULL::numeric<br>p_duration integer DEFAULT NULL::integer<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\services\services-api.js:108` |
| **`delete_service_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_service_id uuid | `jsonb` | ✅ Yes | `scripts\services\services-api.js:144` |
| **`create_package_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_package_name text<br>p_description text DEFAULT NULL::text<br>p_price numeric DEFAULT 0<br>p_duration integer DEFAULT 60<br>p_service_ids uuid[] DEFAULT NULL::uuid[]<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\services\services-api.js:178` |
| **`update_package_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_package_id uuid<br>p_package_name text DEFAULT NULL::text<br>p_description text DEFAULT NULL::text<br>p_price numeric DEFAULT NULL::numeric<br>p_duration integer DEFAULT NULL::integer<br>p_service_ids uuid[] DEFAULT NULL::uuid[]<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\services\services-api.js:217` |
| **`delete_package_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_package_id uuid | `jsonb` | ✅ Yes | `scripts\services\services-api.js:272` |
| **`create_service_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_name text<br>p_description text DEFAULT NULL::text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `service-categories.js:146` |
| **`update_service_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_id uuid<br>p_category_name text DEFAULT NULL::text<br>p_description text DEFAULT NULL::text<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `service-categories.js:247` |
| **`delete_service_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_id uuid | `jsonb` | ✅ Yes | `service-categories.js:360`<br>`service-categories.js:459` |

## 5. Inventory & Products

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`create_product_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_name text<br>p_description text DEFAULT NULL::text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\products\products-api.js:70` |
| **`update_product_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_id uuid<br>p_category_name text<br>p_description text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\products\products-api.js:80` |
| **`delete_product_category_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_category_id uuid | `boolean` | ✅ Yes | `scripts\products\products-api.js:91` |
| **`create_product_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_product_name text<br>p_category_id uuid DEFAULT NULL::uuid<br>p_description text DEFAULT NULL::text<br>p_price numeric DEFAULT 0<br>p_stock_quantity bigint DEFAULT 0<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\products\products-api.js:100` |
| **`update_product_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_product_id uuid<br>p_category_id uuid<br>p_product_name text<br>p_price numeric<br>p_stock_quantity bigint<br>p_status text DEFAULT 'active'::text<br>p_description text DEFAULT NULL::text<br>p_product_image_url text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\products\products-api.js:115` |
| **`delete_product_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_product_id uuid | `boolean` | ✅ Yes | `scripts\products\products-api.js:131` |
| **`get_product_sales_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT NULL::date<br>p_end_date date DEFAULT NULL::date | `jsonb` | ✅ Yes | `scripts\reports\report-modules\products-sales.js:412` |

## 6. Staff & Rostering

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`get_staff_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date<br>p_end_date date DEFAULT CURRENT_DATE<br>p_staff_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\reports\report-modules\staff.js:65` |
| **`delete_staff_schedule_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_staff_id uuid<br>p_target_month text | `jsonb` | ✅ Yes | `scripts\staff-schedule\schedule-api.js:240` |
| **`save_staff_schedule_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_staff_id uuid<br>p_year integer<br>p_month integer<br>p_schedule_entries jsonb | `jsonb` | ✅ Yes | `scripts\staff-schedule\schedule-api.js:258` |
| **`create_staff_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_staff_name text<br>p_phone text<br>p_email text DEFAULT NULL::text<br>p_role_name text DEFAULT 'Staff'::text<br>p_services_offered text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `staff.js:525` |
| **`update_staff_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_staff_id uuid<br>p_staff_name text DEFAULT NULL::text<br>p_phone text DEFAULT NULL::text<br>p_email text DEFAULT NULL::text<br>p_role_name text DEFAULT NULL::text<br>p_services_offered text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `staff.js:608` |
| **`delete_staff_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_staff_id uuid | `jsonb` | ✅ Yes | `staff.js:695` |

## 7. Sales & POS Checkout

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`record_business_transaction_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_reference_id uuid<br>p_reference_type text<br>p_amount numeric<br>p_payment_method text<br>p_status text DEFAULT 'paid'::text<br>p_notes text DEFAULT NULL::text<br>p_discount_type text DEFAULT NULL::text<br>p_discount_name text DEFAULT NULL::text<br>p_discount_amount numeric DEFAULT NULL::numeric<br>p_final_amount numeric DEFAULT NULL::numeric<br>p_created_by uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\sales-history\sales-api.js:68` |
| **`process_pos_refund_atomic`**<br>*(Schema: `app`)* | p_original_sale_id uuid<br>p_refund_sale_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_customer_id uuid DEFAULT NULL::uuid<br>p_customer_name text DEFAULT 'Walk-in'::text<br>p_customer_phone text DEFAULT NULL::text<br>p_payment_method text DEFAULT 'cash'::text<br>p_staff_id uuid DEFAULT NULL::uuid<br>p_staff_name text DEFAULT 'System'::text<br>p_refund_reason text DEFAULT ''::text<br>p_items jsonb DEFAULT '[]'::jsonb | `jsonb` | ✅ Yes | `scripts\sales-history\sales-api.js:108` |
| **`create_pos_sale_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_sale_id uuid<br>p_customer_id uuid DEFAULT NULL::uuid<br>p_customer_name text DEFAULT 'Walk-in Customer'::text<br>p_customer_phone text DEFAULT ''::text<br>p_payment_method text DEFAULT 'cash'::text<br>p_staff_id uuid DEFAULT NULL::uuid<br>p_staff_name text DEFAULT 'System'::text<br>p_items jsonb DEFAULT '[]'::jsonb<br>p_discount_type text DEFAULT NULL::text<br>p_discount_name text DEFAULT NULL::text<br>p_discount_amount numeric DEFAULT 0<br>p_final_amount numeric DEFAULT 0<br>p_discount_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `pos.js:581` |

## 8. Expenses & Financial Outflows

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`update_expense_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_expense_id uuid<br>p_category text DEFAULT NULL::text<br>p_description text DEFAULT NULL::text<br>p_amount numeric DEFAULT NULL::numeric<br>p_expense_date date DEFAULT NULL::date<br>p_payment_method text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\expenses.js:280` |
| **`create_expense_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_date date DEFAULT CURRENT_DATE<br>p_category text DEFAULT 'Other'::text<br>p_amount numeric DEFAULT 0<br>p_notes text DEFAULT NULL::text<br>p_staff_id uuid DEFAULT NULL::uuid<br>p_staff_name text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\expenses.js:296` |
| **`delete_expense_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_expense_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\expenses.js:391` |
| **`get_expenses_stat_cards`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_timezone text DEFAULT 'Asia/Kolkata'::text | `jsonb` | ✅ Yes | `scripts\expenses.js:416` |

## 9. Memberships & Plans

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`create_membership_plan`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_plan_name text<br>p_price numeric DEFAULT 0<br>p_duration integer DEFAULT 30<br>p_description text DEFAULT NULL::text<br>p_discount_type text DEFAULT NULL::text<br>p_discount_value numeric DEFAULT NULL::numeric<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:54` |
| **`update_membership_plan`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_membership_id uuid<br>p_plan_name text DEFAULT NULL::text<br>p_price numeric DEFAULT NULL::numeric<br>p_duration bigint DEFAULT NULL::bigint<br>p_discount_type text DEFAULT NULL::text<br>p_discount_value numeric DEFAULT NULL::numeric<br>p_description text DEFAULT NULL::text<br>p_all_services boolean DEFAULT NULL::boolean<br>p_all_products boolean DEFAULT NULL::boolean<br>p_all_memberships boolean DEFAULT NULL::boolean<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:58` |
| **`delete_membership_plan`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_membership_id uuid | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:62` |
| **`assign_membership_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_membership_id uuid<br>p_customer_id uuid DEFAULT NULL::uuid<br>p_customer_phone text DEFAULT NULL::text<br>p_customer_name text DEFAULT NULL::text<br>p_customer_email text DEFAULT NULL::text<br>p_payment_method text DEFAULT 'cash'::text<br>p_purchase_date date DEFAULT CURRENT_DATE<br>p_discount_type text DEFAULT NULL::text<br>p_discount_name text DEFAULT NULL::text<br>p_discount_id uuid DEFAULT NULL::uuid<br>p_discount_amount numeric DEFAULT NULL::numeric<br>p_final_amount numeric DEFAULT NULL::numeric<br>p_assigned_by_user_id uuid DEFAULT NULL::uuid<br>p_assigned_by_user_name text DEFAULT NULL::text<br>p_notes text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:108` |
| **`cancel_membership_atomic`**<br>*(Schema: `app`)* | p_purchase_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_notes text DEFAULT NULL::text<br>p_staff_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:112` |
| **`process_membership_refund_atomic`**<br>*(Schema: `app`)* | p_purchase_id uuid<br>p_company_id uuid<br>p_branch_id uuid<br>p_refund_amount numeric<br>p_payment_method text DEFAULT 'cash'::text<br>p_refund_reason text DEFAULT 'Customer Requested Refund'::text<br>p_staff_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:116` |
| **`sync_expired_memberships`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid | `jsonb` | ✅ Yes | `scripts\memberships\memberships-api.js:120` |
| **`get_memberships_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT NULL::date<br>p_end_date date DEFAULT NULL::date | `jsonb` | ✅ Yes | `scripts\reports\report-modules\memberships.js:411` |

## 10. Marketing, Coupons & Offers

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`delete_coupon_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_coupon_id uuid | `boolean` | ✅ Yes | `scripts\coupons.js:356` |
| **`update_coupon_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_coupon_id uuid<br>p_coupon_code text<br>p_discount_type text<br>p_discount_value numeric<br>p_min_bill_amount numeric DEFAULT NULL::numeric<br>p_valid_from date DEFAULT NULL::date<br>p_valid_to date DEFAULT NULL::date<br>p_status text DEFAULT 'active'::text<br>p_total_usage_limit bigint DEFAULT NULL::bigint<br>p_usage_per_customer bigint DEFAULT NULL::bigint<br>p_all_services boolean DEFAULT false<br>p_all_products boolean DEFAULT false<br>p_all_memberships boolean DEFAULT false | `jsonb` | ✅ Yes | `scripts\coupons.js:434` |
| **`create_coupon_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_code text<br>p_discount_type text<br>p_discount_value numeric<br>p_start_date date DEFAULT CURRENT_DATE<br>p_end_date date DEFAULT NULL::date<br>p_min_bill_amount numeric DEFAULT NULL::numeric<br>p_total_usage_limit integer DEFAULT NULL::integer<br>p_per_customer_limit integer DEFAULT NULL::integer<br>p_applicable_to_all_memberships boolean DEFAULT true<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `scripts\coupons.js:452` |
| **`delete_offer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_offer_id uuid | `boolean` | ✅ Yes | `scripts\offers.js:350` |
| **`update_offer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_offer_id uuid<br>p_offer_name text<br>p_discount_type text<br>p_discount_value numeric<br>p_min_bill_amount numeric DEFAULT NULL::numeric<br>p_valid_from date DEFAULT NULL::date<br>p_valid_to date DEFAULT NULL::date<br>p_status text DEFAULT 'active'::text<br>p_all_services boolean DEFAULT false<br>p_all_products boolean DEFAULT false<br>p_all_memberships boolean DEFAULT false | `jsonb` | ✅ Yes | `scripts\offers.js:427` |
| **`create_offer_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_offer_name text<br>p_discount_type text<br>p_discount_value numeric<br>p_min_bill_amount numeric DEFAULT NULL::numeric<br>p_valid_from date DEFAULT NULL::date<br>p_valid_to date DEFAULT NULL::date<br>p_all_services boolean DEFAULT false<br>p_all_products boolean DEFAULT false<br>p_all_memberships boolean DEFAULT false | `jsonb` | ✅ Yes | `scripts\offers.js:445` |

## 11. Analytics & Financial Reports

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`get_analytics_overview`**<br>*(Schema: `public`)* | p_branch_id uuid DEFAULT NULL::uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT ((CURRENT_DATE - '15 days'::interval))::date<br>p_end_date date DEFAULT CURRENT_DATE | `jsonb` | ✅ Yes | `scripts\overview.js:640` |
| **`get_discount_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT NULL::date<br>p_end_date date DEFAULT NULL::date | `jsonb` | ✅ Yes | `scripts\reports\report-modules\discounts.js:64` |
| **`get_financial_report`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_start_date date DEFAULT NULL::date<br>p_end_date date DEFAULT NULL::date | `jsonb` | ✅ Yes | `scripts\reports\report-modules\financial.js:101` |

## 12. Settings & Business Configurations

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`save_invoice_settings_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_common_invoice jsonb DEFAULT NULL::jsonb<br>p_booking_invoice jsonb DEFAULT NULL::jsonb<br>p_pos_invoice jsonb DEFAULT NULL::jsonb<br>p_membership_invoice jsonb DEFAULT NULL::jsonb | `jsonb` | ✅ Yes | `scripts\invoice-state.js:515` |
| **`save_business_settings`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_data jsonb | `jsonb` | ✅ Yes | `scripts\settings-business.js:213` |
| **`save_contact_settings`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_data jsonb | `jsonb` | ✅ Yes | `scripts\settings-contact.js:196` |
| **`save_business_hours_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_hours jsonb | `jsonb` | ✅ Yes | `scripts\settings-hours.js:243` |
| **`save_notification_settings_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_settings jsonb DEFAULT '{}'::jsonb | `jsonb` | ✅ Yes | `scripts\settings-notifications.js:553` |
| **`save_business_payment_settings_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_accepted_methods text[] DEFAULT NULL::text[]<br>p_default_method text DEFAULT 'cash'::text | `jsonb` | ✅ Yes | `scripts\settings-payments.js:301` |
| **`save_company_tax_settings_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_business_registration_number text DEFAULT NULL::text<br>p_gstin text DEFAULT NULL::text<br>p_pan text DEFAULT NULL::text<br>p_gst_registration_state text DEFAULT NULL::text<br>p_default_tax_rate numeric DEFAULT NULL::numeric<br>p_tax_label text DEFAULT 'GST'::text<br>p_prices_include_tax boolean DEFAULT false<br>p_show_tax_breakdown boolean DEFAULT true | `jsonb` | ✅ Yes | `scripts\settings-tax.js:147` |

## 13. Branch Management

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`toggle_branch_status_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_new_status text | `jsonb` | ✅ Yes | `branches.js:302` |
| **`delete_branch_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid | `jsonb` | ✅ Yes | `branches.js:385` |
| **`update_branch_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_branch_name text<br>p_branch_phone text<br>p_branch_email text DEFAULT NULL::text<br>p_branch_code text DEFAULT NULL::text<br>p_manager_user_id uuid DEFAULT NULL::uuid<br>p_address_line_1 text DEFAULT NULL::text<br>p_address_line_2 text DEFAULT NULL::text<br>p_locality_area text DEFAULT NULL::text<br>p_landmark text DEFAULT NULL::text<br>p_city text DEFAULT NULL::text<br>p_district text DEFAULT NULL::text<br>p_state text DEFAULT NULL::text<br>p_pin_code text DEFAULT NULL::text<br>p_country text DEFAULT 'India'::text<br>p_branch_address text DEFAULT NULL::text<br>p_google_maps_url text DEFAULT NULL::text<br>p_latitude numeric DEFAULT NULL::numeric<br>p_longitude numeric DEFAULT NULL::numeric<br>p_status text DEFAULT NULL::text | `jsonb` | ✅ Yes | `branches.js:534` |
| **`create_branch_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_name text<br>p_branch_phone text<br>p_branch_email text DEFAULT NULL::text<br>p_branch_code text DEFAULT NULL::text<br>p_manager_user_id uuid DEFAULT NULL::uuid<br>p_address_line_1 text DEFAULT NULL::text<br>p_address_line_2 text DEFAULT NULL::text<br>p_locality_area text DEFAULT NULL::text<br>p_landmark text DEFAULT NULL::text<br>p_city text DEFAULT NULL::text<br>p_district text DEFAULT NULL::text<br>p_state text DEFAULT NULL::text<br>p_pin_code text DEFAULT NULL::text<br>p_country text DEFAULT 'India'::text<br>p_branch_address text DEFAULT NULL::text<br>p_google_maps_url text DEFAULT NULL::text<br>p_latitude numeric DEFAULT NULL::numeric<br>p_longitude numeric DEFAULT NULL::numeric<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `branches.js:563` |

## 14. Authentication, Users & RBAC

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`update_user_profile_full_atomic`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_user_id uuid<br>p_first_name text<br>p_last_name text<br>p_phone text<br>p_email text<br>p_emergency_contact_name text DEFAULT NULL::text<br>p_emergency_contact_number text DEFAULT NULL::text<br>p_profile_photo text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\app-layout\profile.js:605` |
| **`upsert_user_preferences_atomic`**<br>*(Schema: `app`)* | p_user_id uuid<br>p_company_id uuid DEFAULT NULL::uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_language text DEFAULT NULL::text<br>p_theme text DEFAULT NULL::text<br>p_notifications boolean DEFAULT NULL::boolean | `jsonb` | ✅ Yes | `scripts\app-layout\settings.js:75`<br>`scripts\global-auth-guard.js:917`<br>`scripts\notification-manager.js:114` |
| **`get_session_context`**<br>*(Schema: `app`)* | *None* | `jsonb` | ✅ Yes | `scripts\global-auth-guard.js:230`<br>`scripts\support\platform-support.js:73`<br>`config\plan-features-manager.js:147`<br>`config\plan-limits-manager.js:56`<br>`config\rbac-manager.js:110`<br>`config\subscription-state-manager.js:216` |
| **`update_user_last_login_atomic`**<br>*(Schema: `app`)* | p_user_id uuid DEFAULT NULL::uuid<br>p_email text DEFAULT NULL::text | `jsonb` | ✅ Yes | `scripts\global-auth-guard.js:639`<br>`auth-callback.html:145`<br>`auth-callback.html:147`<br>`script.js:619`<br>`script.js:621` |
| **`onboard_company_workspace`**<br>*(Schema: `public`)* | p_data jsonb | `jsonb` | ✅ Yes | `onboarding.js:200` |
| **`backfill_oauth_phone_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_user_id uuid<br>p_phone text | `jsonb` | ✅ Yes | `payment-result.js:120` |
| **`update_role_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_role_id uuid<br>p_role_name text<br>p_description text DEFAULT NULL::text | `jsonb` | ✅ Yes | `roles-permissions.js:418` |
| **`create_role_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_role_name text<br>p_description text DEFAULT NULL::text | `jsonb` | ✅ Yes | `roles-permissions.js:428` |
| **`save_role_permissions_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_role_id uuid<br>p_role_name text<br>p_permission_keys jsonb | `jsonb` | ✅ Yes | `roles-permissions.js:494` |
| **`delete_role_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_role_id uuid | `jsonb` | ✅ Yes | `roles-permissions.js:531` |
| **`toggle_user_status_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_user_id uuid<br>p_new_status text | `jsonb` | ✅ Yes | `users.js:385` |
| **`delete_user_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_user_id uuid | `jsonb` | ✅ Yes | `users.js:401` |
| **`update_user_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_user_id uuid<br>p_name text<br>p_phone text<br>p_email text<br>p_role_id uuid<br>p_role_name text<br>p_branch_id uuid<br>p_status text | `jsonb` | ✅ Yes | `users.js:594` |
| **`create_user_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid<br>p_user_id uuid<br>p_name text<br>p_email text<br>p_phone text<br>p_role_id uuid<br>p_role_name text<br>p_status text DEFAULT 'active'::text | `jsonb` | ✅ Yes | `users.js:627` |
| **`admin_update_user_password`**<br>*(Unmatched / Frontend Only)* | *N/A (Not found in pg_proc)* | *unknown* | ⚠️ No | `users.js:580` |

## 15. System, Add-ons & Support

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`get_company_subscription_details`**<br>*(Schema: `public`)* | p_company_id uuid | `jsonb` | ✅ Yes | `scripts\billing\billing-api.js:509` |
| **`cancel_subscription_addon_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_addon_id uuid | `jsonb` | ✅ Yes | `scripts\billing\billing-modal-addons.js:541`<br>`scripts\billing\manage-addons-page.js:513` |
| **`reactivate_subscription_addon_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_addon_id uuid | `jsonb` | ✅ Yes | `scripts\billing\billing-modal-addons.js:557`<br>`scripts\billing\manage-addons-page.js:524` |
| **`submit_issue_atomic`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_user_id uuid DEFAULT NULL::uuid<br>p_category text DEFAULT 'general'::text<br>p_subject text DEFAULT ''::text<br>p_description text DEFAULT ''::text | `jsonb` | ✅ Yes | `scripts\issue-service.js:30` |
| **`add_issue_attachment_atomic`**<br>*(Schema: `public`)* | p_issue_id uuid<br>p_message_id uuid<br>p_storage_path text<br>p_file_name text<br>p_content_type text DEFAULT 'application/octet-stream'::text<br>p_size_bytes bigint DEFAULT 0 | `jsonb` | ✅ Yes | `scripts\issue-service.js:75`<br>`scripts\issue-service.js:217` |
| **`add_issue_message_atomic`**<br>*(Schema: `public`)* | p_issue_id uuid<br>p_user_id uuid<br>p_sender_name text DEFAULT 'User'::text<br>p_message text DEFAULT ''::text<br>p_sender_type text DEFAULT 'customer'::text | `jsonb` | ✅ Yes | `scripts\issue-service.js:194` |
| **`update_issue_status_atomic`**<br>*(Schema: `public`)* | p_issue_id uuid<br>p_status text | `jsonb` | ✅ Yes | `scripts\issue-service.js:258` |
| **`mark_all_notifications_read`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\notification-manager.js:824`<br>`notifications.js:482` |
| **`mark_notification_read_atomic`**<br>*(Schema: `app`)* | p_notification_id uuid<br>p_company_id uuid DEFAULT NULL::uuid | `jsonb` | ✅ Yes | `scripts\notification-manager.js:859`<br>`notifications.js:445` |
| **`create_notification_atomic`**<br>*(Schema: `app`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_user_id uuid DEFAULT NULL::uuid<br>p_category text DEFAULT 'general'::text<br>p_event_key text DEFAULT NULL::text<br>p_title text DEFAULT 'Notification'::text<br>p_message text DEFAULT ''::text<br>p_link text DEFAULT NULL::text<br>p_metadata jsonb DEFAULT '{}'::jsonb | `jsonb` | ✅ Yes | `scripts\notification-manager.js:1045` |
| **`submit_suggestion_atomic`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_branch_id uuid DEFAULT NULL::uuid<br>p_user_id uuid DEFAULT NULL::uuid<br>p_category text DEFAULT 'Feature Request'::text<br>p_title text DEFAULT ''::text<br>p_description text DEFAULT ''::text<br>p_business_benefit text DEFAULT NULL::text<br>p_attachments jsonb DEFAULT '[]'::jsonb | `jsonb` | ✅ Yes | `scripts\suggestion-modal.js:284` |
| **`sync_plan_features_atomic`**<br>*(Schema: `app`)* | p_plan_id uuid<br>p_feature_keys jsonb | `jsonb` | ✅ Yes | `config\plan-features-manager.js:55` |

## 16. Other Modules

| RPC Function Name | Database Arguments & Signature | Return Type | Sec Definer | Frontend Callers |
| :--- | :--- | :--- | :---: | :--- |
| **`save_billing_information`**<br>*(Schema: `public`)* | p_company_id uuid<br>p_data jsonb | `jsonb` | ✅ Yes | `scripts\billing\billing-modal-billing.js:118` |

