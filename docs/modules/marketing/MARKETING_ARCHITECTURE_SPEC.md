# Module 7: Marketing (Coupons & Offers) - Architecture Specification & Migration Blueprint

## 1. Context & Objectives
This document specifies the PostgreSQL architecture, security boundaries, parameter contracts, and validation constraints required to enforce a **100% Zero-Trust Frontend / Authoritative Backend-First** posture for **Module 7: Marketing (Coupons & Offers)**.

### Key Objectives:
1. **Zero Client Direct Writes**: Eliminate all direct client `.insert()`, `.update()`, `.delete()` operations on `coupons` and `offers`.
2. **Authoritative Discount Validation**: Centralize all coupon/offer discount calculations, date checks, minimum bill checks, and usage limit enforcement inside PostgreSQL `SECURITY DEFINER` routines.
3. **Idempotent Code Normalization & Uniqueness**: Ensure all coupon codes are automatically trimmed, converted to uppercase, and checked for uniqueness across branch/company boundaries.
4. **Audit Trail Preservation**: Ensure deletions are soft-deletes (`status = 'deleted'`) so that historical financial ledger and `discount_usages` audit rows remain referentially intact.

---

## 2. Stored Procedure Specifications

### 2.1 `app.create_coupon_atomic`
- **Schema**: `app` (wrapped by `public.create_coupon_atomic`)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Target branch ID |
  | `p_coupon_code` | `text` | YES | - | Raw coupon code string |
  | `p_discount_type` | `text` | YES | - | `'percentage'` or `'fixed'` |
  | `p_discount_value`| `numeric` | YES | - | Discount magnitude |
  | `p_min_bill_amount` | `numeric` | NO | `NULL` | Minimum spend requirement |
  | `p_valid_from` | `date` | NO | `NULL` | Activation date |
  | `p_valid_to` | `date` | NO | `NULL` | Expiry date |
  | `p_total_usage_limit` | `bigint` | NO | `NULL` | Global maximum redemptions |
  | `p_usage_per_customer`| `bigint` | NO | `NULL` | Max redemptions per customer |
  | `p_all_services` | `boolean` | NO | `false` | Applicable to all services |
  | `p_all_products` | `boolean` | NO | `false` | Applicable to all products |
  | `p_all_memberships` | `boolean`| NO | `false` | Applicable to all memberships |
- **Returns**: `jsonb` (Full created coupon entity)
- **Logic & Validations**:
  1. Enforces tenant check: `IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN RAISE EXCEPTION ...`.
  2. Normalizes `coupon_code` to `UPPER(TRIM(p_coupon_code))`. Asserts non-empty.
  3. Checks code uniqueness within company and branch (`status != 'deleted'`).
  4. Validates discount type (`'percentage'` or `'fixed'`).
  5. Validates discount value ($> 0$; if percentage, $\le 100$).
  6. Validates date bounds: `p_valid_from <= p_valid_to`.
  7. Validates minimum spend: `p_min_bill_amount >= 0`.
  8. Generates twin UUIDs (`coupon_id` and `id`) and inserts into `app.coupons`.
  9. Returns `to_jsonb(coupon.*)`.

---

### 2.2 `app.update_coupon_atomic`
- **Schema**: `app` (wrapped by `public.update_coupon_atomic`)
- **Security**: `SECURITY DEFINER`, search path.
- **Parameters**: Same as create, with `p_coupon_id uuid` and optional `p_status text DEFAULT 'active'`.
- **Returns**: `jsonb` (Updated coupon entity)
- **Logic & Validations**:
  1. Tenant access check.
  2. Existence assertion (`status != 'deleted'`).
  3. Code normalization & uniqueness guard against other coupons (`coupon_id != p_coupon_id`).
  4. Value and date bounds validations.
  5. Updates `app.coupons` (`updated_at = NOW()`).
  6. Returns `to_jsonb(coupon.*)`.

---

### 2.3 `app.delete_coupon_atomic`
- **Schema**: `app` (wrapped by `public.delete_coupon_atomic`)
- **Security**: `SECURITY DEFINER`, search path.
- **Parameters**: `p_company_id uuid`, `p_branch_id uuid`, `p_coupon_id uuid`
- **Returns**: `boolean` (`true` on success)
- **Logic**:
  1. Tenant access check.
  2. Existence assertion.
  3. Sets `status = 'deleted'`, `updated_at = NOW()`.
  4. Returns `true`.

---

### 2.4 `app.create_offer_atomic`
- **Schema**: `app` (wrapped by `public.create_offer_atomic`)
- **Security**: `SECURITY DEFINER`, search path.
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Target branch ID |
  | `p_offer_name` | `text` | YES | - | Offer title |
  | `p_discount_type` | `text` | YES | - | `'percentage'` or `'fixed'` |
  | `p_discount_value`| `numeric` | YES | - | Discount magnitude |
  | `p_min_bill_amount` | `numeric` | NO | `NULL` | Minimum spend |
  | `p_valid_from` | `date` | NO | `NULL` | Activation date |
  | `p_valid_to` | `date` | NO | `NULL` | Expiry date |
  | `p_all_services` | `boolean` | NO | `false` | Services flag |
  | `p_all_products` | `boolean` | NO | `false` | Products flag |
  | `p_all_memberships` | `boolean`| NO | `false` | Memberships flag |
- **Returns**: `jsonb` (Created offer entity)
- **Logic & Validations**:
  1. Tenant access check.
  2. Offer name non-empty assertion.
  3. Offer name uniqueness within company and branch (`status != 'deleted'`).
  4. Discount type and value validation ($> 0$; percentage $\le 100$).
  5. Date range validation: `p_valid_from <= p_valid_to`.
  6. Inserts into `app.offers` with twin UUIDs (`offer_id` and `id`).
  7. Returns `to_jsonb(offer.*)`.

---

### 2.5 `app.update_offer_atomic`
- **Schema**: `app` (wrapped by `public.update_offer_atomic`)
- **Parameters**: Same as create, with `p_offer_id uuid` and optional `p_status text`.
- **Returns**: `jsonb` (Updated offer entity)
- **Logic**: Tenant check, existence check, uniqueness against other offers, bounds validation, updates `app.offers`.

---

### 2.6 `app.delete_offer_atomic`
- **Schema**: `app` (wrapped by `public.delete_offer_atomic`)
- **Parameters**: `p_company_id uuid`, `p_branch_id uuid`, `p_offer_id uuid`
- **Returns**: `boolean`
- **Logic**: Tenant check, existence check, soft-deletes (`status = 'deleted'`).

---

### 2.7 `app.validate_discount_code`
- **Schema**: `app` (wrapped by `public.validate_discount_code`)
- **Parameters**:
  - `p_company_id uuid`
  - `p_branch_id uuid`
  - `p_code text`
  - `p_bill_amount numeric DEFAULT 0`
  - `p_customer_id uuid DEFAULT NULL`
  - `p_applicable_type text DEFAULT 'service'`
- **Returns**: `jsonb`
  - On Success: `{"valid": true, "discount_id": uuid, "discount_name": text, "discount_type": text, "discount_value": numeric, "discount_amount": numeric}`
  - On Ineligible: `{"valid": false, "reason": text}`

---

## 3. Frontend Refactoring Matrix
| Component | Targeted Mutation | Refactored Backend RPC |
|---|---|---|
| `scripts/coupons.js:357` | Soft-delete `.from('coupons').update({ status: 'deleted' })` | `supabase.rpc('delete_coupon_atomic', ...)` |
| `scripts/coupons.js:436` | Direct `.from('coupons').update(payload)` | `supabase.rpc('update_coupon_atomic', ...)` |
| `scripts/coupons.js:444` | Direct `.from('coupons').insert(payload)` | `supabase.rpc('create_coupon_atomic', ...)` |
| `scripts/offers.js:355` | Soft-delete `.from('offers').update({ status: 'deleted' })` | `supabase.rpc('delete_offer_atomic', ...)` |
| `scripts/offers.js:435` | Direct `.from('offers').update(payload)` | `supabase.rpc('update_offer_atomic', ...)` |
| `scripts/offers.js:442` | Direct `.from('offers').insert(payload)` | `supabase.rpc('create_offer_atomic', ...)` |
| `scripts/global-payment-modal/gpm-payment.js:55` | Direct `.from('offers').update({ current_usage_count })` | Removed (handled authoritatively via `app.discount_usages`) |

---

## 4. Test Matrix
- **T1**: Create valid coupon (percentage) -> Success, returned JSON has `status = 'active'`.
- **T2**: Create coupon with duplicate code -> Rejection (`already exists`).
- **T3**: Create coupon with invalid percentage (> 100%) -> Rejection.
- **T4**: Create coupon with invalid date range (`valid_from > valid_to`) -> Rejection.
- **T5**: Update coupon -> Success.
- **T6**: Update coupon with code collision -> Rejection.
- **T7**: Delete coupon -> Soft-delete (`status = 'deleted'`).
- **T8**: Create valid offer (fixed) -> Success.
- **T9**: Create offer with duplicate name -> Rejection.
- **T10**: Update offer -> Success.
- **T11**: Delete offer -> Soft-delete (`status = 'deleted'`).
- **T12**: Validate discount code valid -> Returns `valid: true` and calculated discount amount.
- **T13**: Validate discount code below minimum spend -> Returns `valid: false, reason: 'Minimum bill amount...'`.
- **T14**: Validate discount code expired -> Returns `valid: false, reason: 'Coupon has expired.'`.
- **T15**: Tenant isolation -> Mismatched tenant -> Rejection.
