# BHARATHBOTS — SALON SAAS
# Module 2: POS (Point of Sale) — Stage 1: Investigation & Logic Inventory

**Date**: November 3, 2026  
**Status**: Stage 1 COMPLETE — Awaiting Stage 2 Architecture Approval  
**Standard**: Zero-Trust Frontend / Authoritative Backend-First Execution  

---

## 1. Module Scope

The POS module handles **retail counter sales** of salon products (shampoo, oil, accessories, etc.) for walk-in or registered customers. It is distinct from the Bookings module: there are no appointments, no stylists assigned to services, and no scheduling. The core flows are:

1. **Walk-in Checkout** — Staff selects products → adds to cart → selects customer → collects payment.
2. **Stock Deduction** — For each product sold, `stock_quantity` in `app.products` is atomically decremented.
3. **POS Refund / Return** — Staff selects items from a previous paid sale to refund (partial or full); stock is re-incremented.
4. **Multi-Item Cart Pricing & Discount** — Coupon codes, offers, membership discounts, or manual discounts applied at checkout.

---

## 2. Database Tables & Schema

| Table | Schema | Purpose | RLS Enabled? |
|---|---|---|---|
| `sales` | `app` | One row per product line item per sale (status: `paid` or `refunded`) | ❌ Disabled |
| `sales_for_business_transactions` | `app` | Consolidated 1 header row per sale transaction (payment_status: `paid`/`refunded`) | ❌ Disabled |
| `business_transactions` | `app` | Central financial ledger — one row per settlement (reference_type: `product`) | ❌ Disabled |
| `products` | `app` | Product catalog with `stock_quantity` for inventory management | ❌ Disabled |
| `product_categories` | `app` | Product category labels | ❌ Disabled |
| `discount_usages` | `app` | Coupon/offer/membership redemption audit log | ✅ Enabled (weak policy) |
| `coupons` | `app` | Discount coupon codes, validity, discount type/value | ❌ Disabled |
| `offers` | `app` | Marketing promotional campaigns | ❌ Disabled |
| `memberships` | `app` | Membership plans with discount_percent | ❌ Disabled |
| `membership_purchases` | `app` | Customer active memberships (expiry, status) | ❌ Disabled |

---

## 3. Deployed PostgreSQL Routines

| Routine | Schema | Security Definer | Locked search_path | Status |
|---|---|:---:|:---:|---|
| `create_pos_sale_atomic` | `public` only | ✅ YES | ✅ YES | **Deployed — Needs Hardening** |
| `process_pos_refund_atomic` | `public` only | ✅ YES | ✅ YES | **Deployed — Needs Hardening** |
| `deduct_product_stock` | `public` only | ✅ YES | ✅ YES | **Deployed — Standalone (Legacy path)** |
| `trg_pos_sale_business_transaction` | `public` (trigger fn) | N/A (trigger) | ✅ YES | **Active Trigger Function** |

> **Note**: All three RPCs exist only in `public` schema. The `app` schema counterparts (`app.create_pos_sale_atomic`, etc.) have NOT been deployed yet — unlike the Bookings module. This will be addressed in Stage 3.

---

## 4. Active Trigger

| Table | Trigger Name | Timing & Event | Function Called | Purpose |
|---|---|---|---|---|
| `app.sales_for_business_transactions` | `trg_create_pos_business_transaction` | **AFTER INSERT** | `trg_pos_sale_business_transaction()` | Automatically writes a row into `app.business_transactions` (status `paid` or `refunded`) whenever a summary row is inserted. Branches on `NEW.payment_status = 'refunded'` to distinguish sale from refund entries. |

---

## 5. Frontend Code Paths (Audit)

### Path A: `pos.js` → `create_pos_sale_atomic` (ACTIVE & PRIMARY)

The POS page (`pos.html`) loads **`pos.js`** as a module. The checkout flow is:

1. Staff selects products from the product grid (fetched from `app.products` via `supabase.from('products').select(*)`)
2. Staff selects/adds customer (fetched from `app.customers`)
3. "Collect" button opens the **Global Payment Modal** (`scripts/global-payment-modal.js`)
4. Coupon, offer, and membership discounts are applied **client-side** in the payment modal
5. On confirmation, `finalizeSale()` in `pos.js` calls `supabase.rpc('create_pos_sale_atomic', {...})`
6. After success, low-stock alerts are derived from `rpcResult.deducted_items`

**Direct mutations via PostgREST in `pos.js`**: ❌ NONE (read-only `from()` only — products and customers)

---

### Path B: `scripts/payment-pos.js` — ORPHANED LEGACY FILE (NOT ACTIVE)

`payment-pos.js` is an older, separate checkout script that:
- Reads cart from `sessionStorage` (`pos_checkout_data`)
- Calls `deduct_product_stock` RPC
- Then does **3 separate direct client-side writes**:
  1. `supabase.from('sales').insert(salesBatch)` — line items
  2. `supabase.from('sales_for_business_transactions').insert(summaryRow)` — header
  3. `supabase.from('business_transactions').insert({...})` — ledger entry

**⚠️ Critical Finding**: This file has **3 direct client-side `.insert()` calls** on `sales`, `sales_for_business_transactions`, and `business_transactions`. However, after confirming that **no HTML page loads this file** and **no JS module imports it**, this file is effectively **dead code** that is no longer part of the active POS execution path. It should be deprecated/removed in Stage 5.

---

### Path C: `scripts/sales-history/sales-refund.js` → `process_pos_refund_atomic` (ACTIVE)

The sales history page initiates refunds via:
1. Staff clicks "Refund" on a paid sale row
2. Modal lists refundable items with quantity selectors
3. Staff selects items and quantity to return, chooses reason + payment method
4. `processRefund()` calls `executePosRefundAtomic()` in `scripts/sales-history/sales-api.js`
5. `executePosRefundAtomic()` calls `supabase.rpc('process_pos_refund_atomic', params)`

**Direct mutations in the active refund path**: ❌ NONE

---

## 6. Logic Inventory — 18 Business Logics Identified

After a full audit of the POS module, **18 discrete business logics** have been identified across 3 workflows:

---

### Workflow A: POS Checkout (Create Sale) — 11 Logics

| # | Logic Name | Where Currently? | Hardening Needed? |
|---|---|---|---|
| **1** | Multi-Tenant Authorization & Boundary Check | ❌ **Missing** — no `verify_tenant_access` call in `create_pos_sale_atomic` | ✅ YES |
| **2** | Input Validation & Cart Non-Empty Guard | ✅ Partial — exists in RPC (checks `jsonb_array_length`) | ⚠️ Harden UUID validation |
| **3** | Authoritative Product Catalog Price Lookup (Anti-Tampering) | ❌ **CRITICAL GAP** — client submits `item.price` directly; backend trusts it blindly | ✅ YES (highest priority) |
| **4** | Product Active Status Validation | ⚠️ Partial — checked in `deduct_product_stock` but NOT in `create_pos_sale_atomic` | ✅ YES |
| **5** | Concurrency-Safe Stock Deduction with Row Locking | ✅ EXISTS — `SELECT ... FOR UPDATE` per product in `create_pos_sale_atomic` | ⚠️ Verify correct schema reference |
| **6** | Negative Stock Prevention Guard | ✅ EXISTS — checks `v_current_stock < v_item_qty` | ✅ Verify |
| **7** | Multi-Item Line Item Insertion (`app.sales`) | ✅ EXISTS — inserts per product in loop | ⚠️ Schema hardening |
| **8** | Consolidated Summary Row Insertion (`app.sales_for_business_transactions`) | ✅ EXISTS — single summary row inserted | ⚠️ Schema hardening |
| **9** | Trigger-Driven Financial Ledger Entry (`app.business_transactions`) | ✅ EXISTS — via `trg_create_pos_business_transaction` | ✅ Verify schema references |
| **10** | Server-Side Coupon & Offer Validation (Anti-Tampering) | ❌ **CRITICAL GAP** — Coupon validation done **client-side only** in `gpm-discounts.js`; backend accepts `p_discount_amount` as-is | ✅ YES (highest priority) |
| **11** | Discount Usage Logging (`app.discount_usages`) | ⚠️ Partial — exists in RPC but only auto-resolves by name lookup, no expiry re-check | ✅ YES |

---

### Workflow B: POS Refund / Return — 6 Logics

| # | Logic Name | Where Currently? | Hardening Needed? |
|---|---|---|---|
| **12** | Original Sale Verification & Tenant Boundary Check | ⚠️ Partial — validates `company_id`/`branch_id` match on summary row, but no `verify_tenant_access` call | ✅ YES |
| **13** | Refund Reference Deduplication Guard | ✅ EXISTS — checks for existing `refund_reference_id` in `sales` and `sales_for_business_transactions` | ✅ Verify |
| **14** | Per-Item Refundable Quantity Validation | ✅ EXISTS — calculates `sold_qty - previously_refunded_qty` and checks requested qty | ✅ Verify |
| **15** | Stock Re-Increment on Return | ✅ EXISTS — increments `app.products.stock_quantity` per returned item | ✅ Verify schema |
| **16** | Proportional Discount Reversal Calculation | ✅ EXISTS — price-weighted partial discount reversal via `discount_usages` | ⚠️ Review logic accuracy |
| **17** | Trigger-Driven Refund Ledger Entry (`app.business_transactions`) | ✅ EXISTS — trigger fires on `payment_status = 'refunded'` insert to `sales_for_business_transactions` | ✅ Verify schema |

---

### Workflow C: Product Catalog Management (Read-Only, POS-Side) — 1 Logic

| # | Logic Name | Where Currently? | Hardening Needed? |
|---|---|---|---|
| **18** | Active Product Filtering for POS Grid | ✅ CLIENT-SIDE — `pos.js` fetches all products and filters `status === 'active'` in JS | ⚠️ No PostgREST RLS; filtered via JS only |

---

## 7. Critical Gaps & Security Vulnerabilities

### 🔴 CRITICAL: Price Anti-Tampering Not Enforced (Logic 3)

**Current behaviour**: `pos.js` submits `item.price` directly from the JavaScript `cart` array. The `create_pos_sale_atomic` function accepts `p_items[].price` and inserts it **without any catalog lookup**.

```javascript
// pos.js — client controls the price:
p_items: cart.map(item => ({
    product_id: item.id,
    price: Number(item.price) || 0   // ← client price, trusted by backend
}))
```

**Attack surface**: A malicious actor with a browser console can modify `item.price = 1` before the RPC call and purchase ₹500 products for ₹1 each. The backend will record `price = 1` in `app.sales` with no rejection.

**Fix required**: The hardened function must query `app.products.price` for each `product_id` and use the catalog price, ignoring the client-submitted price entirely.

---

### 🔴 CRITICAL: Coupon Validation is Entirely Client-Side (Logic 10)

**Current behaviour**: Coupon code validation, expiry check, and discount amount calculation happen in `scripts/global-payment-modal/gpm-discounts.js` via a direct `supabase.from('coupons').select(*)` read. The computed `discount_amount` is passed to `create_pos_sale_atomic` as `p_discount_amount`. The backend stores this amount with **no server-side re-validation**.

**Attack surface**: Attackers can:
- Submit any arbitrary `p_discount_amount` bypassing the modal validation entirely
- Apply expired coupons by bypassing the JS expiry check
- Apply the same coupon multiple times (no usage limit enforcement on the server)
- Apply a coupon intended for a different company/branch

**Fix required**: The hardened function must re-query `app.coupons`/`app.offers` for validity, expiry, usage limits, and compute the discount authoritatively — identical to the pattern implemented in `app.process_booking_payment_atomic`.

---

### 🔴 HIGH: No Multi-Tenant Authorization in POS RPCs (Logic 1 & 12)

**Current behaviour**: `create_pos_sale_atomic` accepts `p_company_id` and `p_branch_id` from the client and inserts them directly without calling `shared.verify_tenant_access`. A tampered request with a different `company_id` would insert sale records for another tenant.

**Fix required**: Add `shared.verify_tenant_access(p_company_id, p_branch_id)` as the first operation in both `create_pos_sale_atomic` and `process_pos_refund_atomic`.

---

### 🟡 MEDIUM: `deduct_product_stock` is a Redundant Standalone RPC (Orphaned)

`deduct_product_stock` was the original stock deduction primitive used by the now-orphaned `payment-pos.js`. The current active path (`pos.js` → `create_pos_sale_atomic`) does NOT call `deduct_product_stock` separately — stock deduction is handled internally within `create_pos_sale_atomic`. This standalone RPC is now unused in the active path and may cause confusion. It should be formally deprecated.

---

### 🟡 MEDIUM: RPCs Only in `public` Schema (Not `app`)

Unlike the Bookings module where routines were properly deployed in `app` schema with PostgREST wrappers in `public`, all POS RPCs (`create_pos_sale_atomic`, `process_pos_refund_atomic`, `deduct_product_stock`) exist **only in `public`**. They should be migrated to `app` with `public` wrappers, consistent with the project's schema architecture.

---

### 🟡 MEDIUM: `payment-pos.js` is Orphaned Dead Code with 3 Client-Side Direct Inserts

`scripts/payment-pos.js` is not loaded by any HTML page, is not imported by any module, but still exists with direct `supabase.from('sales').insert()`, `supabase.from('sales_for_business_transactions').insert()`, and `supabase.from('business_transactions').insert()` calls. It is not an active security risk but is a maintenance hazard and should be removed in Stage 5.

---

## 8. Data Flow Diagram

```
POS CHECKOUT FLOW (Active Path)
──────────────────────────────────────────────────────────────────────
pos.html → pos.js
  │
  ├─ fetchProducts() ────────────────→ supabase.from('products').select('*')
  ├─ fetchCustomers() ───────────────→ supabase.from('customers').select('*')
  │
  ├─ btnCollect click → openGlobalPaymentModal()
  │     │
  │     └─ gpm-discounts.js ────────→ supabase.from('coupons').select('*')  ⚠️ CLIENT VALIDATION
  │
  └─ finalizeSale(payload)
        │
        └─ supabase.rpc('create_pos_sale_atomic', {
               p_company_id,        ← from localStorage      ⚠️ NO SERVER TENANT CHECK
               p_branch_id,         ← from localStorage
               p_items[].price,     ← from JavaScript cart   🔴 PRICE ANTI-TAMPERING MISSING
               p_discount_amount,   ← computed client-side   🔴 NO SERVER COUPON VALIDATION
               p_final_amount       ← from payment modal
           })
               │
               ├─ ❌ verify_tenant_access()  ← MISSING
               ├─ ❌ catalog price lookup    ← MISSING
               ├─ ✅ FOR UPDATE stock lock
               ├─ ✅ stock deduction
               ├─ ✅ INSERT → app.sales (per item)
               └─ ✅ INSERT → app.sales_for_business_transactions
                         │
                         └─ TRIGGER: trg_create_pos_business_transaction
                                  │
                                  └─ ✅ INSERT → app.business_transactions


POS REFUND FLOW (Active Path)
──────────────────────────────────────────────────────────────────────
sales-history.html → sales-refund.js
  │
  └─ processRefund()
        │
        └─ executePosRefundAtomic() → supabase.rpc('process_pos_refund_atomic', {
               p_original_sale_id,
               p_company_id,        ← from localStorage      ⚠️ NO verify_tenant_access
               ...p_items
           })
               │
               ├─ ❌ verify_tenant_access()  ← MISSING
               ├─ ✅ Lock original summary row (FOR UPDATE)
               ├─ ✅ Prevent duplicate refund_reference_id
               ├─ ✅ Validate per-item refundable qty
               ├─ ✅ Stock re-increment (UPDATE app.products)
               ├─ ✅ INSERT → app.sales (refunded rows)
               ├─ ✅ INSERT → app.sales_for_business_transactions (refunded summary)
               │         │
               │         └─ TRIGGER: trg_create_pos_business_transaction
               │                  │
               │                  └─ ✅ INSERT → app.business_transactions (refunded)
               └─ ✅ UPDATE app.discount_usages (reversal)
```

---

## 9. Migration Readiness Assessment

| Component | Current State | Migration Work Required |
|---|---|---|
| `app.sales` table | In `app` schema ✅ | None — schema already correct |
| `app.sales_for_business_transactions` | In `app` schema ✅ | None |
| `app.business_transactions` | In `app` schema ✅ | None |
| `app.products` | In `app` schema ✅ | None |
| `create_pos_sale_atomic` | In `public` only | Harden + deploy to `app` + create `public` wrapper |
| `process_pos_refund_atomic` | In `public` only | Harden + deploy to `app` + create `public` wrapper |
| `deduct_product_stock` | In `public` only (orphaned) | Formally deprecate — mark as unused |
| `trg_pos_sale_business_transaction` | In `public` | Verify schema references, move trigger to `app` |
| `scripts/payment-pos.js` | Dead code | Remove in Stage 5 |

---

## 10. Stage 2 Architecture Plan Preview

The following will be proposed in the Stage 2 specification:

### Migration File: `supabase/migrations/20261103000007_harden_pos_module.sql`

**A. `app.create_pos_sale_atomic` (Hardened)**  
Add the following security controls:
1. `shared.verify_tenant_access(p_company_id, p_branch_id)` call at line 1
2. For each cart item: query `app.products.price` and `app.products.status`; ignore `p_items[].price` (authoritative price from catalog)
3. Server-side coupon validation: re-query `app.coupons`/`app.offers` for expiry, active status, and usage limits; compute `v_discount_amount` authoritatively
4. Usage limit enforcement: count existing rows in `app.discount_usages` before inserting
5. Schema-qualified table references: `app.sales`, `app.sales_for_business_transactions`, `app.products`, `app.discount_usages`
6. `public.create_pos_sale_atomic` wrapper pointing to `app.create_pos_sale_atomic`

**B. `app.process_pos_refund_atomic` (Hardened)**  
1. `shared.verify_tenant_access(p_company_id, p_branch_id)` call at line 1
2. Schema-qualified table references throughout
3. `public.process_pos_refund_atomic` wrapper pointing to `app.process_pos_refund_atomic`

**C. Frontend Integration (Stage 5)**  
- `pos.js`: No structural changes needed — already calls `create_pos_sale_atomic`. Price parameters will continue to be passed but will be silently overridden by the backend catalog lookup.
- `scripts/payment-pos.js`: Mark as deprecated and remove.

---

## 11. Summary: 18 Logics at a Glance

| # | Logic | Priority | Status |
|---|---|---|---|
| 1 | Multi-Tenant Authorization | 🔴 CRITICAL | Missing |
| 2 | Cart Non-Empty & Input Validation | 🟡 MEDIUM | Partial |
| 3 | Authoritative Catalog Price Lookup | 🔴 CRITICAL | **Missing** |
| 4 | Product Active Status Validation | 🟡 MEDIUM | Partial |
| 5 | Concurrency-Safe Row Locking | 🟢 LOW | Exists |
| 6 | Negative Stock Prevention | 🟢 LOW | Exists |
| 7 | Sales Line Item Insertion | 🟡 MEDIUM | Exists (needs schema hardening) |
| 8 | Summary Row Insertion | 🟡 MEDIUM | Exists (needs schema hardening) |
| 9 | Trigger-Driven Ledger Entry | 🟢 LOW | Exists |
| 10 | Server-Side Coupon/Offer Validation | 🔴 CRITICAL | **Missing** |
| 11 | Discount Usage Logging | 🟡 MEDIUM | Partial |
| 12 | Refund Tenant Boundary Check | 🔴 CRITICAL | Missing |
| 13 | Refund Reference Deduplication | 🟢 LOW | Exists |
| 14 | Per-Item Refundable Quantity Guard | 🟢 LOW | Exists |
| 15 | Stock Re-Increment on Return | 🟢 LOW | Exists |
| 16 | Proportional Discount Reversal | 🟡 MEDIUM | Exists (review) |
| 17 | Refund Trigger-Driven Ledger Entry | 🟢 LOW | Exists |
| 18 | Active Product Filter for POS Grid | 🟡 MEDIUM | Client-side only |

**Stage 1 Status: COMPLETE** ✅  
**Ready for Stage 2: POS Architecture Specification** ✅

