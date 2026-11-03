# Module 3: Memberships — Stage 2 Architecture Specification

**Date**: 2026-11-03  
**Status**: ⏳ Awaiting Approval  
**Author**: Backend Hardening Sprint  
**Depends on**: Migration 20261103000007 (POS), `shared.verify_tenant_access`

---

> [!IMPORTANT]
> This document requires explicit approval before any SQL is deployed.
> Review all 6 RPCs and 16 business logics below, then approve to proceed to Stage 3.

---

## 1. Scope

This spec replaces 3 existing weak RPCs and adds 3 new plan-management RPCs:

| RPC | Schema | Action | Replaces |
|---|---|---|---|
| `assign_membership_atomic` | `app` + `public` | Purchase/assign a membership plan | `public.assign_membership` |
| `cancel_membership_atomic` | `app` + `public` | Cancel an active membership | `public.cancel_membership` |
| `process_membership_refund_atomic` | `app` + `public` | Refund a cancelled membership | `public.process_membership_refund` |
| `create_membership_plan` | `app` + `public` | Create a new membership plan | Client-side `.insert()` |
| `update_membership_plan` | `app` + `public` | Edit an existing plan | Client-side `.update()` |
| `delete_membership_plan` | `app` + `public` | Soft-delete a plan with member guard | Client-side `.update({status:'deleted'})` |

All RPCs follow the standing architecture rules:
- Deployed in `app` schema first, thin `public` wrapper calls the `app` version
- `SECURITY DEFINER` + `SET search_path = platform, shared, app, public, pg_temp`
- First call: `shared.verify_tenant_access(p_company_id, p_branch_id)`
- Return `jsonb` with `success: true/false` + relevant fields

---

## 2. Workflow A — `app.assign_membership_atomic`

### 2.1 Signature

```sql
app.assign_membership_atomic(
    p_company_id            uuid,
    p_branch_id             uuid,
    p_membership_id         uuid,
    p_customer_id           uuid        DEFAULT NULL,
    p_customer_phone        text        DEFAULT NULL,
    p_customer_name         text        DEFAULT NULL,
    p_customer_email        text        DEFAULT NULL,
    p_payment_method        text        DEFAULT 'cash',
    p_purchase_date         date        DEFAULT CURRENT_DATE,
    p_discount_type         text        DEFAULT NULL,   -- 'coupon'|'offer'|'manual'|NULL
    p_discount_name         text        DEFAULT NULL,   -- coupon_code or offer_name
    p_discount_id           uuid        DEFAULT NULL,   -- coupon_id or offer_id
    p_discount_amount       numeric     DEFAULT NULL,   -- client hint; server re-validates
    p_final_amount          numeric     DEFAULT NULL,   -- client hint; server overrides with server-computed value
    p_assigned_by_user_id   uuid        DEFAULT NULL,
    p_assigned_by_user_name text        DEFAULT NULL,
    p_notes                 text        DEFAULT NULL
) RETURNS jsonb
```

### 2.2 Business Logics (12)

| # | Logic | Rule |
|---|---|---|
| **A1** | **Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` — raises exception if invalid |
| **A2** | **Plan existence check** | Read `app.memberships` WHERE `membership_id = p_membership_id AND company_id = p_company_id AND branch_id = p_branch_id`. Exact match only — no `OR company_id IS NULL` fallback. Fail if not found. |
| **A3** | **Plan active status check** | Plan `status` must be `'active'`. Fail with clear message if `inactive` or `deleted`. |
| **A4** | **Catalog price authority** | Server reads `v_plan_price` from `app.memberships`. The `p_final_amount` from client is a **hint only**. Server computes: `v_server_final = v_plan_price - v_server_discount`. Client-supplied `p_final_amount` is **ignored** — only used as a sanity log. |
| **A5** | **Coupon re-validation** | If `p_discount_type = 'coupon'` AND `p_discount_name IS NOT NULL`: <br>① Look up coupon in `app.coupons` by `coupon_code = p_discount_name AND company_id = p_company_id`. <br>② Check `status = 'active'`, `valid_from <= today`, `valid_to >= today`. <br>③ Check `all_memberships = true` (coupon applies to memberships). <br>④ Check `min_bill_amount` ≤ `v_plan_price`. <br>⑤ Check total usage: `usage_count < total_usage_limit` (if limit set). <br>⑥ Check per-customer: count prior usages for this customer. <br>If any check fails → proceed with **zero discount** (not an error — just fall through with full price). Increment `coupons.usage_count`. |
| **A6** | **Offer re-validation** | If `p_discount_type = 'offer'`: look up `app.offers` by offer_id, verify active + in date range + `all_memberships = true`. If invalid → zero discount. |
| **A7** | **Server discount computation** | `v_server_discount = 0`. If coupon/offer valid: compute from `discount_type`/`discount_value`. `v_server_final = GREATEST(0, v_plan_price - v_server_discount)`. |
| **A8** | **Customer dedup + create** | If `p_customer_id` provided: verify customer exists in `app.customers` for this `company_id`. If no `p_customer_id`: look up by `customer_phone + company_id`. If still not found: create new customer row (with `total_visits=1, total_spent=0`). |
| **A9** | **Duplicate active membership guard** | Check `app.membership_purchases` for existing row with same `customer_id + membership_id + status='active' + expiry_date >= today`. If found → fail with `'Customer already has an active membership for this plan.'` |
| **A10** | **Expiry date calculation** | `v_expiry_date = (p_purchase_date + (v_plan_duration \|\| ' months')::interval)::date`. Fallback: 12 months if duration not set. |
| **A11** | **Multi-table atomic writes** | In a single transaction: <br>① INSERT `app.membership_purchases` (final_amount = `v_server_final`) <br>② INSERT `app.business_transactions` (amount = `v_server_final`, status = `'paid'`) <br>③ UPDATE `app.customers` (`total_spent += v_server_final`, `last_visit = purchase_date`) <br>④ INSERT `app.discount_usages` if `v_server_discount > 0` <br>⑤ UPDATE `app.coupons SET usage_count = usage_count + 1` if coupon used |
| **A12** | **Return response** | `{ success, purchase_id, payment_id, customer_id, customer_name, plan_name, purchase_date, expiry_date, final_amount, payment_method }` |

### 2.3 Return Example
```json
{
  "success": true,
  "purchase_id": "uuid",
  "payment_id": "uuid",
  "customer_id": "uuid",
  "customer_name": "Priya Sharma",
  "plan_name": "Gold Plan",
  "purchase_date": "2026-11-03",
  "expiry_date": "2027-11-03",
  "final_amount": 1500.00,
  "payment_method": "upi"
}
```

---

## 3. Workflow B — `app.cancel_membership_atomic`

### 3.1 Signature

```sql
app.cancel_membership_atomic(
    p_purchase_id   uuid,
    p_company_id    uuid,
    p_branch_id     uuid,
    p_notes         text    DEFAULT NULL,
    p_staff_id      uuid    DEFAULT NULL
) RETURNS jsonb
```

> **Note**: `p_company_id` and `p_branch_id` are now **required** (not nullable). The old weak `OR company_id IS NULL` bypass is removed.

### 3.2 Business Logics (5)

| # | Logic | Rule |
|---|---|---|
| **B1** | **Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| **B2** | **Purchase existence + tenant ownership** | Read `app.membership_purchases` WHERE `purchase_id = p_purchase_id AND company_id = p_company_id AND branch_id = p_branch_id`. Fail if not found. Strict — no NULL bypass. |
| **B3** | **State machine** | Only `status = 'active'` can be cancelled. Any other status → fail with current status in error message. |
| **B4** | **Cancellation ledger** | INSERT `app.business_transactions` with `status = 'cancelled'`, `amount = 0`, `reference_type = 'membership'`, `reference_id = p_purchase_id`. This ensures the cancellation event is **always** recorded atomically. |
| **B5** | **Update purchase record** | UPDATE `app.membership_purchases` → `status = 'cancelled'`, `cancelled_date = CURRENT_DATE`, `notes = ...`, `updated_at = NOW()`. |

### 3.3 Return Example
```json
{
  "success": true,
  "purchase_id": "uuid",
  "customer_name": "Priya Sharma",
  "plan_name": "Gold Plan",
  "status": "cancelled",
  "cancelled_date": "2026-11-03"
}
```

---

## 4. Workflow C — `app.process_membership_refund_atomic`

### 4.1 Signature

```sql
app.process_membership_refund_atomic(
    p_purchase_id       uuid,
    p_company_id        uuid,
    p_branch_id         uuid,
    p_refund_amount     numeric,
    p_payment_method    text    DEFAULT 'cash',
    p_refund_reason     text    DEFAULT 'Customer Requested Refund',
    p_staff_id          uuid    DEFAULT NULL
) RETURNS jsonb
```

### 4.2 Business Logics (9)

| # | Logic | Rule |
|---|---|---|
| **C1** | **Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| **C2** | **Purchase existence + tenant ownership** | Read `app.membership_purchases` WHERE `purchase_id = p_purchase_id AND company_id = p_company_id AND branch_id = p_branch_id`. Fail if not found. |
| **C3** | **State machine** | Only `status = 'cancelled'` can be refunded. Guard against double-refund: check `payment_status <> 'refunded'`. |
| **C4** | **Max refundable calculation** | Sum all prior `app.business_transactions` with `reference_id = p_purchase_id AND reference_type = 'membership' AND status = 'refunded'`. `v_max_refundable = GREATEST(0, v_final_amount - v_already_refunded)`. If `p_refund_amount > v_max_refundable` → fail. If `p_refund_amount <= 0` → fail. |
| **C5** | **Payment method normalisation** | `v_payment_method = LOWER(TRIM(p_payment_method))`. Must be in `('cash','upi','card')`. Default to `'cash'` if not. |
| **C6** | **Write refund ledger** | INSERT `app.business_transactions` (`status = 'refunded'`, `amount = p_refund_amount`). |
| **C7** | **Update purchase record** | UPDATE `app.membership_purchases` → `status = 'refunded'`, `payment_status = 'refunded'`, append notes. |
| **C8** | **Reverse customer LTV** | UPDATE `app.customers SET total_spent = GREATEST(0, total_spent - p_refund_amount)` WHERE `customer_id = v_customer_id`. |
| **C9** | **Reverse discount usage** | UPDATE `app.discount_usages SET status='reversed', reversal_amount=discount_amount, reversed_at=NOW()` WHERE `reference_id = p_purchase_id AND reference_type = 'membership' AND status = 'applied'`. |

### 4.3 Return Example
```json
{
  "success": true,
  "purchase_id": "uuid",
  "refund_payment_id": "uuid",
  "customer_name": "Priya Sharma",
  "plan_name": "Gold Plan",
  "refund_amount": 1500.00,
  "payment_method": "cash",
  "status": "refunded"
}
```

---

## 5. Workflow D — Plan CRUD RPCs (3 New)

### 5.1 `app.create_membership_plan`

```sql
app.create_membership_plan(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_plan_name         text,
    p_price             numeric,
    p_duration          bigint,         -- months
    p_discount_type     text    DEFAULT NULL,
    p_discount_value    numeric DEFAULT NULL,
    p_description       text    DEFAULT NULL,
    p_all_services      boolean DEFAULT true,
    p_all_products      boolean DEFAULT false,
    p_all_memberships   boolean DEFAULT false,
    p_valid_from        date    DEFAULT CURRENT_DATE
) RETURNS jsonb
```

**Logics (D1)**:
- Tenant check via `shared.verify_tenant_access`
- `p_plan_name` must not be blank
- `p_price` must be >= 0
- `p_duration` must be >= 1
- `p_discount_type` must be NULL, `'percentage'`, or `'flat'` if provided
- INSERT `app.memberships` with `status = 'active'`
- Return `{ success, membership_id, plan_name }`

### 5.2 `app.update_membership_plan`

```sql
app.update_membership_plan(
    p_company_id        uuid,
    p_branch_id         uuid,
    p_membership_id     uuid,
    p_plan_name         text    DEFAULT NULL,
    p_price             numeric DEFAULT NULL,
    p_duration          bigint  DEFAULT NULL,
    p_discount_type     text    DEFAULT NULL,
    p_discount_value    numeric DEFAULT NULL,
    p_description       text    DEFAULT NULL,
    p_all_services      boolean DEFAULT NULL,
    p_all_products      boolean DEFAULT NULL,
    p_all_memberships   boolean DEFAULT NULL,
    p_status            text    DEFAULT NULL
) RETURNS jsonb
```

**Logics (D2)**:
- Tenant check via `shared.verify_tenant_access`
- Verify plan exists with `company_id = p_company_id AND branch_id = p_branch_id` and is not `deleted`
- Only update fields that are non-NULL (partial update pattern)
- `p_price` if provided must be >= 0
- `p_status` if provided must be in `('active','inactive')`
- UPDATE `app.memberships` SET only changed fields + `updated_at = NOW()`
- Return `{ success, membership_id, plan_name }`

### 5.3 `app.delete_membership_plan`

```sql
app.delete_membership_plan(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_membership_id uuid
) RETURNS jsonb
```

**Logics (D3)**:
- Tenant check via `shared.verify_tenant_access`
- Verify plan exists with tenant ownership
- **Active member guard**: COUNT `app.membership_purchases` WHERE `membership_id = p_membership_id AND status = 'active'`. If count > 0 → fail with `'Cannot delete — this plan has {N} active member(s). Cancel their memberships first.'`
- Soft delete: UPDATE `app.memberships SET status = 'deleted', updated_at = NOW()`
- Return `{ success, membership_id, active_member_count: 0 }`

---

## 6. Frontend Changes Required (Stage 5)

| File | Change |
|---|---|
| `scripts/payment-membership.js` | **RETIRE** entire file — replace with deprecation notice (same pattern as `payment-pos.js`) |
| `scripts/memberships/memberships-api.js` | **KEEP**: all `.select()` reads, `assignMembershipRpcApi`, `cancelMembershipRpcApi`, `processMembershipRefundRpcApi` <br>**REMOVE**: `insertMembershipPurchaseApi`, `insertSinglePlanApi`, `updateSinglePlanApi`, `softDeletePlanApi`, `cancelMembershipPurchaseApi`, `updatePurchaseRefundStatusApi`, `markMembershipsExpiredApi`, `insertCancellationLedgerApi`, `insertRefundTransactionApi`, `createCustomerApi` (10 mutations) <br>**ADD**: `createMembershipPlanRpcApi`, `updateMembershipPlanRpcApi`, `deleteMembershipPlanRpcApi` |
| `scripts/memberships/memberships-plans.js` | Update `insertSinglePlanApi` → `createMembershipPlanRpcApi`, `updateSinglePlanApi` → `updateMembershipPlanRpcApi`, `softDeletePlanApi` → `deleteMembershipPlanRpcApi` |
| `scripts/memberships/memberships-assign-modal.js` | Remove unused import of `insertMembershipPurchaseApi` |

---

## 7. Migration File Plan

**File**: `supabase/migrations/20261103000008_harden_memberships_module.sql`

Due to payload size limits, will be deployed in **5 API calls** in sequence:

| Call | Contents |
|---|---|
| Call 1 | Drop old public RPCs + Create `app.assign_membership_atomic` |
| Call 2 | Create `public.assign_membership_atomic` wrapper |
| Call 3 | Create `app.cancel_membership_atomic` + `public` wrapper |
| Call 4 | Create `app.process_membership_refund_atomic` + `public` wrapper |
| Call 5 | Create 3 plan CRUD RPCs (`app` + `public`) + GRANT statements |

---

## 8. Test Plan (Stage 4)

| # | Test Case | Expected |
|---|---|---|
| T1 | Assign membership with tampered `p_final_amount=1` | Server overrides to catalog price |
| T2 | Assign membership for non-existent plan | `success: false, 'plan not found'` |
| T3 | Assign duplicate membership to same customer | `success: false, 'already has active'` |
| T4 | Assign with valid coupon code | Coupon discount applied; `coupons.usage_count` incremented |
| T5 | Assign with expired coupon | Coupon silently ignored; full price charged |
| T6 | Cancel an active membership | `status = 'cancelled'`; ledger entry in `business_transactions` |
| T7 | Cancel already-cancelled membership | `success: false, 'current status: cancelled'` |
| T8 | Refund a cancelled membership | `status = 'refunded'`; `total_spent` reversed |
| T9 | Refund with amount > paid | `success: false, 'exceeds refundable limit'` |
| T10 | Double refund attempt | `success: false, 'already refunded'` |
| T11 | Delete plan with active members | `success: false, 'has N active members'` |
| T12 | Delete plan with no active members | `status = 'deleted'` |

---

## 9. Approval Checklist

- [ ] All 6 RPCs use `SECURITY DEFINER` + locked `search_path`
- [ ] All 6 RPCs call `shared.verify_tenant_access` first
- [ ] Catalog price authority enforced in `assign_membership_atomic`
- [ ] Cancellation ledger written server-side atomically
- [ ] Coupon usage_count incremented on membership purchase
- [ ] Active member guard blocks plan deletion
- [ ] `payment-membership.js` retired post-Stage-3
- [ ] 10 direct mutation functions removed from `memberships-api.js`

**→ Approved by**: _________________ **Date**: _________________

