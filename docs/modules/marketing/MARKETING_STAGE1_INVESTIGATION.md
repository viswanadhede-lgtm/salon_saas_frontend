# Module 7: Marketing (Coupons & Offers) - Stage 1 Investigation & Logic Inventory

## 1. Executive Summary
This document catalogs all database schemas, table structures, frontend scripts, business logic rules, and direct client mutations across the **Marketing (Coupons & Offers)** domain of Bharathbots Salon SaaS.

Under our Zero-Trust Backend-First standard, all direct `.from('coupons')` and `.from('offers')` mutations (`insert`, `update`, `delete`) must be eliminated and replaced with authoritative PostgreSQL `SECURITY DEFINER` stored procedures.

---

## 2. Table Schemas & Relational Topology

### 2.1 Table: `app.coupons` (Base Table, Exposed via `public.coupons` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `coupon_id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `id` | `uuid` | NO | `gen_random_uuid()` | Alternate UUID identifier |
| `company_id` | `uuid` | YES | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Branch boundary |
| `coupon_code` | `text` | YES | - | Uppercase coupon code |
| `discount_type` | `text` | YES | - | `'percentage'` or `'fixed'` |
| `discount_value` | `numeric` | YES | - | Rate (1-100) or flat amount |
| `min_bill_amount` | `numeric` | YES | - | Minimum spend threshold |
| `valid_from` | `date` | YES | - | Activation start date |
| `valid_to` | `date` | YES | - | Expiration end date |
| `status` | `text` | YES | `'active'` | `'active'`, `'inactive'`, `'deleted'` |
| `total_usage_limit` | `bigint` | YES | - | Maximum total redemptions |
| `usage_per_customer`| `bigint` | YES | - | Max redemptions per customer |
| `all_services` | `boolean` | NO | `false` | Applicable to service catalog |
| `all_products` | `boolean` | NO | `false` | Applicable to retail catalog |
| `all_memberships` | `boolean` | NO | `false` | Applicable to membership plans |
| `created_at` | `timestamptz` | YES | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | YES | - | Last modification timestamp |

### 2.2 Table: `app.offers` (Base Table, Exposed via `public.offers` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `offer_id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `id` | `uuid` | NO | `gen_random_uuid()` | Alternate UUID identifier |
| `company_id` | `uuid` | YES | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Branch boundary |
| `offer_name` | `text` | YES | - | Promotional offer title |
| `discount_type` | `text` | YES | - | `'percentage'` or `'fixed'` |
| `discount_value` | `numeric` | YES | - | Rate or flat value |
| `min_bill_amount` | `numeric` | YES | - | Minimum bill requirement |
| `valid_from` | `date` | YES | - | Start date |
| `valid_to` | `date` | YES | - | End date |
| `status` | `text` | YES | `'active'` | Status flag |
| `all_services` | `boolean` | NO | `false` | Services applicability |
| `all_products` | `boolean` | NO | `false` | Products applicability |
| `all_memberships` | `boolean` | NO | `false` | Memberships applicability |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | YES | - | Last update timestamp |

### 2.3 Table: `app.discount_usages` (Base Table, Exposed via `public.discount_usages` View)
Maintains audit trail of all coupon/offer redemptions:
- `reference_type`: `'booking'`, `'pos_sale'`, `'membership_purchase'`
- `reference_id`: Target order ID
- `discount_id`: Coupon or Offer UUID
- `discount_amount`: Authoritative deducted amount
- `status`: `'applied'`, `'reversed'`

---

## 3. Inventory of Direct Client Mutations & Logic Vulnerabilities

A full workspace scan revealed **7 direct mutations** across 3 client files:

### 3.1 `scripts/coupons.js`
1. **Line 357 (`executeDeleteCoupon`)**:
   - `supabase.from('coupons').update({ status: 'deleted', ... }).eq('coupon_id', id)`
   - **Vulnerabilities**: Direct table mutation; lacks server-side tenancy verification.
2. **Line 398-405 (`handleSaveCoupon` Duplicate Check)**:
   - Client queries local memory `currentCoupons.some(...)` to detect duplicates.
   - **Vulnerabilities**: Fails to detect duplicates created in other browser sessions or branches; bypassable via curl/PostgREST.
3. **Line 436 (`handleSaveCoupon` Update)**:
   - `supabase.from('coupons').update(payload).eq('coupon_id', currentEditId)`
   - **Vulnerabilities**: Direct table mutation; missing validation on date ranges (`valid_from <= valid_to`) and discount bounds.
4. **Line 444 (`handleSaveCoupon` Insert)**:
   - `supabase.from('coupons').insert({ ...payload, created_at: ... })`
   - **Vulnerabilities**: Direct table insert; uppercase normalization of code not enforced on database level.

### 3.2 `scripts/offers.js`
1. **Line 355 (`executeDeleteOffer`)**:
   - `supabase.from('offers').update({ status: 'deleted', ... }).eq(...)`
   - **Vulnerabilities**: Direct mutation; dual-column ambiguity (`id` vs `offer_id`).
2. **Line 394-402 (`handleSaveOffer` Duplicate Check)**:
   - Client checks local array for duplicate offer names.
3. **Line 435 (`handleSaveOffer` Update)**:
   - `supabase.from('offers').update(payload).eq(...)`
   - **Vulnerabilities**: Missing server-side date and value constraints.
4. **Line 442 (`handleSaveOffer` Insert)**:
   - `supabase.from('offers').insert([{ ...payload, created_at: ... }])`
   - **Vulnerabilities**: Direct table insert without backend validation.

### 3.3 `scripts/global-payment-modal/gpm-payment.js`
1. **Line 55**:
   - `supabase.from('offers').update({ current_usage_count: ... }).eq('id', r.id)`
   - **Vulnerabilities**: Direct client mutation attempting to increment a column that does not authoritatively exist in `app.offers`. Usage tracking must be derived from `app.discount_usages`.

---

## 4. Required Authoritative Backend Routines
To achieve 100% Zero-Trust for Marketing:
1. `app.create_coupon_atomic`: Validates tenant access, normalizes code to uppercase, asserts uniqueness within branch/company, checks discount bounds (1-100% for percentage, >0 for fixed), asserts `valid_from <= valid_to`, creates coupon.
2. `app.update_coupon_atomic`: Updates coupon attributes with uniqueness assertions against other coupons.
3. `app.delete_coupon_atomic`: Safely soft-deletes coupon (`status = 'deleted'`).
4. `app.create_offer_atomic`: Validates tenant access, offer name uniqueness, discount bounds, date ranges, creates offer.
5. `app.update_offer_atomic`: Updates offer details with name uniqueness assertion.
6. `app.delete_offer_atomic`: Safely soft-deletes offer (`status = 'deleted'`).
7. `app.validate_discount_code`: Server-side authoritative discount validator for checkout and booking modal.
