# Module 7: Marketing (Coupons & Offers) - Hardening & Migration Audit Report

## 1. Executive Summary
- **Module**: Module 7 - Marketing (Coupons & Offers)
- **Status**: **100% COMPLETE & VERIFIED**
- **Date**: November 4, 2026
- **Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First
- **Migration File**: `supabase/migrations/20261103000012_harden_marketing_module.sql`
- **Database Engine**: PostgreSQL 15+ (Supabase)

All direct client mutations (`.insert()`, `.update()`, `.delete()`) on `coupons` and `offers` have been completely eliminated. 100% of business logic, discount rules, date range assertions, code normalization, uniqueness checks, and redemption limits are now enforced within PostgreSQL `SECURITY DEFINER` stored procedures.

---

## 2. Deployed Stored Procedures

| Procedure Name | Schema | Security | Search Path | Description & Enforced Rules |
|---|---|---|---|---|
| `create_coupon_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Validates tenant context, normalizes coupon code to uppercase, asserts code uniqueness within company/branch, validates discount type & value bounds ($1-100\%$ for percentage, $>0$ for fixed), asserts `valid_from <= valid_to`, creates coupon. |
| `update_coupon_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Updates coupon details with code uniqueness collision guard against other coupons in the tenant. |
| `delete_coupon_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Soft-deletes coupon (`status = 'deleted'`) ensuring historical `discount_usages` audit records remain intact. |
| `create_offer_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Validates tenant context, asserts unique offer title within company/branch, checks discount values and date ranges, creates offer. |
| `update_offer_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Updates offer details with uniqueness collision protection. |
| `delete_offer_atomic` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Soft-deletes offer (`status = 'deleted'`). |
| `validate_discount_code` | `app` + `public` | `DEFINER` | `platform, shared, app, public, pg_temp` | Authoritatively evaluates discount code eligibility: checks active status, date validity, minimum bill requirement, catalog category applicability, total redemption quota against `discount_usages`, per-customer limit against `discount_usages`, and calculates discount amount. |

---

## 3. Frontend Refactoring & Purge Inventory

| File Path | Previous Direct Table Call | Refactored Backend RPC |
|---|---|---|
| `scripts/coupons.js:355` | Direct soft-delete `.from('coupons').update({ status: 'deleted' })` | `supabase.rpc('delete_coupon_atomic', ...)` |
| `scripts/coupons.js:435` | Direct `.from('coupons').update(payload)` | `supabase.rpc('update_coupon_atomic', ...)` |
| `scripts/coupons.js:442` | Direct `.from('coupons').insert(payload)` | `supabase.rpc('create_coupon_atomic', ...)` |
| `scripts/offers.js:355` | Direct soft-delete `.from('offers').update({ status: 'deleted' })` | `supabase.rpc('delete_offer_atomic', ...)` |
| `scripts/offers.js:435` | Direct `.from('offers').update(payload)` | `supabase.rpc('update_offer_atomic', ...)` |
| `scripts/offers.js:442` | Direct `.from('offers').insert(payload)` | `supabase.rpc('create_offer_atomic', ...)` |
| `scripts/global-payment-modal/gpm-payment.js:55` | Direct `.from('offers').update({ current_usage_count })` | Retired (tracked authoritatively via `app.discount_usages`) |

---

## 4. Verification & Automated Test Results

An automated integration test suite (`test_marketing_module.sql`) was executed directly against Supabase. All 15 tests passed:

| Test ID | Scenario | Expected Behavior | Result |
|---|---|---|---|
| **T1** | Valid coupon creation (percentage) | Coupon created with uppercase code and `status = 'active'` | **PASS** |
| **T2** | Duplicate coupon code | Rejection with conflict error | **PASS** |
| **T3** | Discount over 100% | Rejection: "Percentage discount cannot exceed 100%" | **PASS** |
| **T4** | Invalid date range (`valid_from > valid_to`) | Rejection: "Valid from date cannot be after valid to date" | **PASS** |
| **T5** | Coupon metadata update | Updated code, value, and min spend threshold | **PASS** |
| **T6** | Coupon code update collision | Rejection when updating to another coupon's code | **PASS** |
| **T7** | Delete coupon | Soft-delete success (`status = 'deleted'`) | **PASS** |
| **T8** | Valid offer creation (fixed) | Offer created with `status = 'active'` | **PASS** |
| **T9** | Duplicate offer name | Rejection with conflict error | **PASS** |
| **T10** | Offer metadata update | Updated offer name and discount value | **PASS** |
| **T11** | Delete offer | Soft-delete success (`status = 'deleted'`) | **PASS** |
| **T12** | Validate discount code valid | Authoritative calculation returns `valid: true` and 200.00 discount | **PASS** |
| **T13** | Validate discount code below min spend | Rejection: "Minimum bill amount of ₹500 required" | **PASS** |
| **T14** | Validate discount code expired | Rejection: "Coupon has expired" | **PASS** |
| **T15** | Tenant isolation check | Rejection: "Access denied: Invalid company or branch context" | **PASS** |

---

## 5. Audit Conclusion
- Direct table writes on `coupons`: **0**
- Direct table writes on `offers`: **0**
- Direct table writes on `discount_usages`: **0**
- Module 7 is certified **COMPLETE** and production-ready.

