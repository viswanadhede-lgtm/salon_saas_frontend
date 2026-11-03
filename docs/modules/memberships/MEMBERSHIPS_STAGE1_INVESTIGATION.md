# Module 3: Memberships — Stage 1 Investigation Report

**Date**: 2026-11-03  
**Status**: ✅ Investigation Complete  
**Next Stage**: Stage 2 — Architecture Specification (pending approval)

---

## 1. Module Overview

The Memberships module handles three distinct workflows:

| Workflow | Description | Entry Point |
|---|---|---|
| **Purchase / Assign** | Customer buys a plan; ledger record + LTV update | `memberships.html` → Assign Modal → Payment Modal |
| **Cancel** | Staff cancels an active membership (no refund) | `memberships.html` → Cancel button |
| **Refund** | Staff processes refund for a cancelled membership | `memberships.html` → Refund button |

There is also a **4th sub-workflow**:
| **Plan CRUD** | Staff creates, edits, or soft-deletes membership plans (`app.memberships` table) | `memberships.html` → Plans tab |

---

## 2. Frontend Files Inventory

| File | Purpose | Violations |
|---|---|---|
| `scripts/payment-membership.js` | Legacy checkout page (separate page flow) | ❌ **CRITICAL**: Direct `.from('membership_purchases').insert()` + `.from('business_transactions').insert()` |
| `scripts/memberships/memberships-api.js` | API layer for memberships module | ❌ **CRITICAL**: `insertMembershipPurchaseApi`, `insertSinglePlanApi`, `updateSinglePlanApi`, `softDeletePlanApi`, `cancelMembershipPurchaseApi`, `updatePurchaseRefundStatusApi`, `markMembershipsExpiredApi`, `insertCancellationLedgerApi`, `insertRefundTransactionApi` — all direct mutations |
| `scripts/memberships/memberships-assign-modal.js` | Assign modal UI + logic | ⚠️ PARTIAL: Calls `assignMembershipRpcApi` (good) but imports `insertMembershipPurchaseApi` (unused but still present) |
| `scripts/memberships/memberships-refund.js` | Refund modal UI + logic | ✅ Calls `processMembershipRefundRpcApi` correctly |
| `scripts/memberships/memberships-plans.js` | Plan CRUD UI | ❌ Calls `insertSinglePlanApi`, `updateSinglePlanApi`, `softDeletePlanApi` (direct mutations) |
| `scripts/memberships/memberships-purchases-table.js` | Purchases table render | ✅ Read-only `.select()` only |
| `scripts/memberships/memberships-state.js` | Module state management | ✅ No mutations |
| `scripts/memberships/memberships-utils.js` | Utility helpers | ✅ No mutations |
| `scripts/global-payment-modal/gpm-discounts.js` | Discount fetch in payment modal | ✅ Read-only `.select()` only |
| `scripts/payment-core.js` (lines 203–235) | Membership discount fetch | ✅ Read-only `.select()` only |
| `scripts/reports/report-modules/misc.js` | Report queries | ✅ Read-only `.select()` only |

---

## 3. Existing RPCs — Deep Audit

### 3.1 `public.assign_membership` — DEPLOYED

**Security posture**: SECURITY DEFINER ✅ | search_path locked ✅

**What it does** (9 steps):
1. Read & validate plan from `public.memberships` (price, duration, status)
2. Resolve or create customer (dedup by phone)
3. Check duplicate active membership guard
4. Calculate expiry date (`purchase_date + duration months`)
5. Finalise amounts (client `p_final_amount` accepted as-is — **GAP #1**)
6. Insert into `public.membership_purchases`
7. Insert ledger into `public.business_transactions` (posts plan price `v_plan_price`, not `v_final_amount` — **GAP #2**)
8. Update `customers.total_spent` + `last_visit`
9. Track discount in `public.discount_usages` if discount_amount > 0

**Critical Gaps**:
- ❌ **GAP #1 — Price Anti-Tampering**: `p_final_amount` from client is accepted without re-validation against `v_plan_price`. A malicious client can pass `final_amount = 1` and get a membership for ₹1.
- ❌ **GAP #2 — Ledger Amount Bug**: `business_transactions.amount` is set to `v_plan_price` (catalog price), not `v_final_amount` (what was actually collected). This means ledger is inaccurate when discounts are applied.
- ❌ **GAP #3 — No `shared.verify_tenant_access` call**: No cross-tenant isolation check.
- ❌ **GAP #4 — Coupon re-validation missing**: Coupon validity (expiry, usage limits, per-customer limits) is not re-checked server-side.
- ❌ **GAP #5 — Plan tenant isolation**: Plan lookup uses `(company_id = p_company_id OR company_id IS NULL)` — the `IS NULL` fallback could allow cross-tenant plan access.
- ❌ **GAP #6 — Lives in `public` schema**: No `app.assign_membership` version; should be in `app` with a thin `public` wrapper per our architecture.

### 3.2 `public.cancel_membership` — DEPLOYED

**Security posture**: SECURITY DEFINER ✅ | search_path locked ✅

**What it does** (3 steps):
1. Read & validate purchase (must exist, must be `active`)
2. Update `membership_purchases` → `status = 'cancelled'`, `cancelled_date = today`
3. Return success

**Critical Gaps**:
- ❌ **GAP #7 — No tenant check**: `p_company_id` is accepted but only used as `(p_company_id IS NULL OR company_id = p_company_id)` — NULL bypasses isolation completely.
- ❌ **GAP #8 — No RBAC check**: Any authenticated user can cancel any membership if they guess/know the `purchase_id`.
- ❌ **GAP #9 — Missing cancellation ledger entry**: No entry is written to `business_transactions` when a membership is cancelled. The `insertCancellationLedgerApi` direct mutation in the frontend fills this gap — meaning the ledger is only written if client JS runs it, making it optional/bypassable.
- ❌ **GAP #10 — Lives in `public` schema**: No `app.cancel_membership`.

### 3.3 `public.process_membership_refund` — DEPLOYED

**Security posture**: SECURITY DEFINER ✅ | search_path locked ✅

**What it does** (7 steps):
1. Read & validate purchase (must be `cancelled`, not already `refunded`)
2. Calculate refundable amount (subtracts already-refunded from final_amount)
3. Write refund ledger to `business_transactions`
4. Update `membership_purchases` → `status = 'refunded'`
5. Reverse `customers.total_spent`
6. Reverse `discount_usages` → `status = 'reversed'`
7. Return success

**Status**: This RPC is the **best of the three** — most logics are correct. Minor gaps:
- ❌ **GAP #11 — No `shared.verify_tenant_access` call**: Tenant check is present (`AND company_id = p_company_id`) in the WHERE clause, but it's not the authoritative `shared.verify_tenant_access` pattern.
- ❌ **GAP #12 — Lives in `public` schema**: No `app.process_membership_refund`.
- ⚠️ **GAP #13 — Partial refund edge case**: Allows partial refunds (frontend allows partial too). This is intentional per design but should be documented.

---

## 4. Direct Mutation Violations Summary

| Location | Table | Operation | Severity |
|---|---|---|---|
| `payment-membership.js:215-217` | `membership_purchases` | `.insert()` | 🔴 CRITICAL |
| `payment-membership.js:223-240` | `business_transactions` | `.insert()` | 🔴 CRITICAL |
| `payment-membership.js:160-176` | `customers` | `.insert()` | 🔴 CRITICAL |
| `memberships-api.js:103-107` | `membership_purchases` | `.insert()` | 🔴 CRITICAL |
| `memberships-api.js:57-61` | `memberships` | `.insert()` | 🔴 CRITICAL |
| `memberships-api.js:64-68` | `memberships` | `.update()` | 🔴 CRITICAL |
| `memberships-api.js:72-76` | `memberships` | `.update({status:'deleted'})` | 🔴 CRITICAL |
| `memberships-api.js:121-135` | `membership_purchases` | `.update({status:'cancelled'})` | 🔴 HIGH |
| `memberships-api.js:137-150` | `membership_purchases` | `.update()` | 🔴 HIGH |
| `memberships-api.js:152-166` | `membership_purchases` | `.update({status:'expired'})` | 🔴 HIGH |
| `memberships-api.js:186-190` | `business_transactions` | `.insert()` | 🔴 CRITICAL |
| `memberships-api.js:200-204` | `business_transactions` | `.insert()` | 🔴 CRITICAL |

**Total violations: 12 direct mutation calls across 2 files**

---

## 5. Logic Inventory for Backend Migration

The following 16 business logics must be enforced server-side:

### Workflow A: `app.assign_membership_atomic`
| # | Logic | Current State |
|---|---|---|
| A1 | Tenant isolation via `shared.verify_tenant_access` | ❌ Missing |
| A2 | Plan existence + active status check | ✅ Exists (needs tightening) |
| A3 | Plan tenant isolation (company_id + branch_id match, no NULL fallback) | ❌ Missing |
| A4 | Catalog price authority — server re-reads price, ignores `p_final_amount` | ❌ Missing |
| A5 | Coupon re-validation (expiry, usage limit, per-customer limit, min bill amount) | ❌ Missing |
| A6 | Duplicate active membership guard (same plan + same customer) | ✅ Exists |
| A7 | Customer dedup by phone + create if not found | ✅ Exists |
| A8 | Expiry date calculation (server-side `purchase_date + duration months`) | ✅ Exists |
| A9 | Insert `membership_purchases` with correct `final_amount` | ⚠️ Partial (amount bug) |
| A10 | Insert `business_transactions` with `final_amount` (not catalog price) | ❌ Bug exists |
| A11 | Update `customers.total_spent` + `last_visit` | ✅ Exists |
| A12 | Track coupon usage in `discount_usages` + increment `coupons.usage_count` | ⚠️ Partial (no usage_count increment) |

### Workflow B: `app.cancel_membership_atomic`
| # | Logic | Current State |
|---|---|---|
| B1 | Tenant isolation via `shared.verify_tenant_access` | ❌ Missing |
| B2 | Purchase existence + tenant ownership check | ⚠️ Weak (NULL bypass) |
| B3 | State machine: only `active` → `cancelled` | ✅ Exists |
| B4 | Write cancellation ledger to `business_transactions` (`status = 'cancelled'`, `amount = 0`) | ❌ Missing (done client-side) |
| B5 | Update `membership_purchases` → `cancelled` + `cancelled_date` | ✅ Exists |

### Workflow C: `app.process_membership_refund_atomic`
| # | Logic | Current State |
|---|---|---|
| C1 | Tenant isolation via `shared.verify_tenant_access` | ❌ Missing (weak WHERE) |
| C2 | Purchase existence + tenant check | ⚠️ Partial |
| C3 | State machine: only `cancelled` → `refunded` | ✅ Exists |
| C4 | Duplicate refund guard | ✅ Exists |
| C5 | Max refundable amount calculation (paid - already_refunded) | ✅ Exists |
| C6 | Write refund ledger to `business_transactions` | ✅ Exists |
| C7 | Update `membership_purchases` → `refunded` | ✅ Exists |
| C8 | Reverse `customers.total_spent` | ✅ Exists |
| C9 | Reverse `discount_usages` | ✅ Exists |

### Workflow D: Plan CRUD (NEW — no RPC exists yet)
| # | Logic | Current State |
|---|---|---|
| D1 | `app.create_membership_plan_atomic` — tenant check + insert | ❌ Not in RPC (direct mutation) |
| D2 | `app.update_membership_plan_atomic` — tenant check + update | ❌ Not in RPC (direct mutation) |
| D3 | `app.delete_membership_plan_atomic` — active member guard + soft delete | ❌ Not in RPC (direct mutation) |

> **Note**: The delete guard (cannot delete if active members exist) currently runs client-side in `memberships-plans.js`. This MUST move to the server.

---

## 6. Database Schema Reference

### `app.memberships`
| Column | Type | Notes |
|---|---|---|
| membership_id | uuid (PK) | |
| company_id | uuid | Tenant isolation |
| branch_id | uuid | Branch isolation |
| plan_name | text | |
| description | text | |
| price | numeric | Authoritative price |
| valid_from | date | |
| duration | bigint | Duration in months |
| discount_type | text | `percentage` or `flat` |
| discount_value | numeric | |
| status | text | `active`, `inactive`, `deleted` |
| all_services | boolean | Discount applicable to services |
| all_products | boolean | Discount applicable to products |
| all_memberships | boolean | Discount applicable to memberships |

### `app.membership_purchases`
| Column | Type | Notes |
|---|---|---|
| purchase_id | uuid (PK) | |
| company_id, branch_id | uuid | Tenant isolation |
| customer_id, customer_name | uuid, text | |
| membership_id, plan_name | uuid, text | |
| price | numeric | Catalog price at time of purchase |
| duration | bigint | Duration months |
| purchase_date, expiry_date | date | |
| status | text | `active`, `cancelled`, `expired`, `refunded` |
| payment_method | text | `cash`, `upi`, `card` |
| payment_status | text | `paid`, `refunded` |
| assigned_by_user_id, assigned_by_user_name | uuid, text | Audit trail |
| discount_type, discount_name, discount_amount | text, text, numeric | |
| final_amount | numeric | What customer actually paid |
| cancelled_date | date | Set on cancel |
| notes | text | |

---

## 7. Key Risk Findings

| Risk | Severity | Impact |
|---|---|---|
| Client can pass `final_amount = 1` to get membership at ₹1 | 🔴 CRITICAL | Revenue fraud |
| `cancel_membership` has NULL tenant bypass | 🔴 CRITICAL | Cross-tenant data manipulation |
| Cancellation ledger written client-side | 🔴 HIGH | Bypassable; books may not balance |
| Plan CRUD has zero server-side validation | 🔴 HIGH | Tenant can corrupt another tenant's plans |
| `payment-membership.js` duplicates the assign flow | 🟡 MEDIUM | Dead code path risks divergence |
| `coupons.usage_count` not incremented on membership purchase | 🟡 MEDIUM | Coupon usage limits unenforced |

---

## 8. Files to Retire / Replace

| File | Action |
|---|---|
| `scripts/payment-membership.js` | **RETIRE** — entire flow duplicated by `assign_membership` RPC. Replace with deprecation notice. |
| `scripts/memberships/memberships-api.js` | **PURGE 10 mutation functions** — keep only read functions and the 3 `*RpcApi` wrappers; add 3 new plan CRUD RPC wrappers |

---

## 9. 5-Stage Plan

| Stage | Action | Migration |
|---|---|---|
| ✅ Stage 1 | Investigation (this document) | — |
| Stage 2 | Architecture spec (15 logics, 6 RPCs documented) | Pending approval |
| Stage 3 | Deploy hardened RPCs | `20261103000008_harden_memberships_module.sql` |
| Stage 4 | Automated integration tests (12 test cases) | — |
| Stage 5 | Retire `payment-membership.js`, purge direct mutations, update docs | — |

---

## 10. Proposed RPC Set (Stage 2 Preview)

| RPC | Description | New or Replace |
|---|---|---|
| `app.assign_membership_atomic` + public wrapper | Full hardened purchase: price authority, coupon re-validation, dedup, LTV | **Replace** `assign_membership` |
| `app.cancel_membership_atomic` + public wrapper | Atomic cancel: tenant check, state machine, ledger write | **Replace** `cancel_membership` |
| `app.process_membership_refund_atomic` + public wrapper | Full refund: tenant check, max guard, LTV reversal | **Replace** `process_membership_refund` |
| `app.create_membership_plan` + public wrapper | Create plan with tenant check | **New** |
| `app.update_membership_plan` + public wrapper | Update plan with tenant check | **New** |
| `app.delete_membership_plan` + public wrapper | Soft delete with active-member guard | **New** |

