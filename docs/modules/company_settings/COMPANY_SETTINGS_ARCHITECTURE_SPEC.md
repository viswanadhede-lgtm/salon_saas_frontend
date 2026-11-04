# Module 11: Company, Branches & Settings — Architecture Specification

## 1. Design Overview

Module 11 standardizes all workspace configuration, multi-branch operations, and tenant-level settings behind authoritative PostgreSQL stored procedures.

All procedures:
- Reside in the `app` schema with `public` backward-compatibility bridges.
- Declare `SECURITY DEFINER`.
- Enforce `SET search_path = platform, shared, app, public, pg_temp;`.
- Enforce `IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN RAISE EXCEPTION 'Access denied: Invalid company or branch context.'; END IF;`.

---

## 2. Stored Procedures Specification

### 2.1 `app.create_branch_atomic`
- **Purpose**: Creates a new branch under an active tenant.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_name` (text, required)
  - `p_branch_phone` (text, required)
  - `p_branch_email` (text, optional)
  - `p_branch_code` (text, optional)
  - `p_manager_user_id` (uuid, optional)
  - `p_address_line_1` (text, optional)
  - `p_address_line_2` (text, optional)
  - `p_locality_area` (text, optional)
  - `p_landmark` (text, optional)
  - `p_city` (text, optional)
  - `p_district` (text, optional)
  - `p_state` (text, optional)
  - `p_pin_code` (text, optional)
  - `p_country` (text, optional, default `'India'`)
  - `p_branch_address` (text, optional)
  - `p_google_maps_url` (text, optional)
  - `p_latitude` (numeric, optional)
  - `p_longitude` (numeric, optional)
  - `p_status` (text, default `'active'`)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
  - `p_branch_name` cannot be empty.
  - Branch name must be unique within non-deleted branches for the company.
  - Optional `manager_user_id` must exist in `shared.users` belonging to this company.
- **Returns**: `jsonb` `{ success: true, branch_id: uuid }`

---

### 2.2 `app.update_branch_atomic`
- **Purpose**: Authoritatively updates branch metadata and address.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
  - `p_branch_name` (text, required)
  - `p_branch_phone` (text, required)
  - `p_branch_email` (text, optional)
  - `p_branch_code` (text, optional)
  - `p_manager_user_id` (uuid, optional)
  - `p_address_line_1` (text, optional)
  - `p_address_line_2` (text, optional)
  - `p_locality_area` (text, optional)
  - `p_landmark` (text, optional)
  - `p_city` (text, optional)
  - `p_district` (text, optional)
  - `p_state` (text, optional)
  - `p_pin_code` (text, optional)
  - `p_country` (text, optional)
  - `p_branch_address` (text, optional)
  - `p_google_maps_url` (text, optional)
  - `p_latitude` (numeric, optional)
  - `p_longitude` (numeric, optional)
  - `p_status` (text, optional)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
  - Branch must exist and not be `deleted`.
  - Name collision guard against other branches of the company.
- **Returns**: `jsonb` `{ success: true }`

---

### 2.3 `app.toggle_branch_status_atomic`
- **Purpose**: Flips branch between `active` and `inactive`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
  - `p_new_status` (text, required, in `'active'`, `'inactive'`)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
  - If setting to `inactive`: Check count of other `active` branches for the company. Reject if it is the only active branch.
- **Returns**: `jsonb` `{ success: true, new_status: text }`

---

### 2.4 `app.delete_branch_atomic`
- **Purpose**: Soft-deletes a branch (`status = 'deleted'`).
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
  - **Solo Active Branch Guard**: Cannot delete if this is the only non-deleted branch of the company.
  - **Active Bookings Guard**: Cannot delete if there are active bookings (`pending`, `confirmed`, `in_service`) scheduled for this branch.
  - **Assigned Staff Guard**: Cannot delete if active staff are assigned solely to this branch.
- **Returns**: `jsonb` `{ success: true }`

---

### 2.5 `app.save_billing_information_atomic`
- **Purpose**: Saves or updates legal tax & billing details in `company_billing_information`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_data` (jsonb, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
- **Returns**: `jsonb` `{ success: true, id: uuid }`

---

### 2.6 `app.save_invoice_settings_atomic`
- **Purpose**: Saves invoice/receipt customization across POS, Bookings, Memberships, and Common styling into `invoice_settings`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
  - `p_invoice_type` (text, required, e.g. `'common'`, `'booking'`, `'pos'`, `'membership'`, `'all'`)
  - `p_data` (jsonb, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
- **Returns**: `jsonb` `{ success: true }`

---

### 2.7 `app.save_notification_settings_atomic`
- **Purpose**: Saves system, customer, and marketing notification channels in `notification_settings`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
  - `p_system_notifications` (jsonb, required)
  - `p_customer_notifications` (jsonb, required)
  - `p_marketing_notifications` (jsonb, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
- **Returns**: `jsonb` `{ success: true }`

---

### 2.8 `app.save_business_payment_settings_atomic`
- **Purpose**: Configures payment methods (Cash, Card, UPI, Online), UPI QR URLs, and notes in `business_payment_settings`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_branch_id` (uuid, required)
  - `p_cash_enabled` (boolean, default true)
  - `p_upi_enabled` (boolean, default true)
  - `p_cards_enabled` (boolean, default true)
  - `p_online_payment_enabled` (boolean, default false)
  - `p_upi_id` (text, optional)
  - `p_upi_qr_code_url` (text, optional)
  - `p_payment_note` (text, optional)
  - `p_default_payment_method` (text, default `'cash'`)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, p_branch_id)`
  - At least one payment method must remain enabled.
- **Returns**: `jsonb` `{ success: true }`

---

### 2.9 `app.save_company_tax_settings_atomic`
- **Purpose**: Upserts GSTIN, PAN, tax rate, and tax breakdown options in `company_tax_settings`.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_business_registration_number` (text, optional)
  - `p_gstin` (text, optional)
  - `p_pan` (text, optional)
  - `p_gst_registration_state` (text, optional)
  - `p_default_tax_rate` (numeric, optional)
  - `p_tax_label` (text, optional, default `'GST'`)
  - `p_prices_include_tax` (boolean, default false)
  - `p_show_tax_breakdown` (boolean, default true)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
  - `p_default_tax_rate` $\ge 0$ when provided.
- **Returns**: `jsonb` `{ success: true }`

---

## 3. Migration Strategy

- **Part A**: `20261103000016a_harden_branches.sql`
  - Procedures: `create_branch_atomic`, `update_branch_atomic`, `toggle_branch_status_atomic`, `delete_branch_atomic`
- **Part B**: `20261103000016b_harden_settings.sql`
  - Procedures: `save_billing_information_atomic`, `save_invoice_settings_atomic`, `save_notification_settings_atomic`, `save_business_payment_settings_atomic`, `save_company_tax_settings_atomic`, `save_business_settings`, `save_contact_settings`

