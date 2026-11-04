# MODULE 04 — MEMBERSHIPS

**Page**: `memberships.html`  
**Entry Script**: `scripts/memberships/memberships-ui.js` (UI glue) + `scripts/memberships.js` (orchestrator, referenced via `app-shell`)  
**Architecture**: Zero-Trust Frontend / Authoritative Backend  
**Migration**: `supabase/migrations/20261103000008_harden_memberships_module.sql` ✅ DEPLOYED  
**Audit Status**: 100% Complete — 13/13 integration tests PASSED  
**Last Updated**: 2026-11-04

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Page Load Sequence](#2-page-load-sequence)
3. [Global State & Context](#3-global-state--context)
4. [Tab: Membership Plans](#4-tab-membership-plans)
   - [4.1 Search Plans](#41-search-plans-input)
   - [4.2 Create Membership Plan Button](#42-create-membership-plan-button)
   - [4.3 Plan Table Row — Edit Button](#43-plan-table-row--edit-button)
   - [4.4 Plan Table Row — Delete Button](#44-plan-table-row--delete-button)
   - [4.5 Create/Edit Plan Modal — Save/Create Button](#45-createedit-plan-modal--savecreate-button)
   - [4.6 Delete Plan Confirm Modal — Yes Delete Button](#46-delete-plan-confirm-modal--yes-delete-button)
5. [Tab: Active Memberships](#5-tab-active-memberships)
   - [5.1 Assign Membership Button](#51-assign-membership-button)
   - [5.2 Customer Phone Search (Assign Modal)](#52-customer-phone-search-assign-modal)
   - [5.3 Plan Selector Dropdown (Assign Modal)](#53-plan-selector-dropdown-assign-modal)
   - [5.4 Collect Button (Assign Modal)](#54-collect-button-assign-modal)
   - [5.5 Global Payment Modal — Pay Button (Membership)](#55-global-payment-modal--pay-button-membership)
   - [5.6 Purchase Row — View Button](#56-purchase-row--view-button)
   - [5.7 Purchase Row — Cancel Button (State 1: Active)](#57-purchase-row--cancel-button-state-1-active)
   - [5.8 Cancel Modal — Cancel Membership Button](#58-cancel-modal--cancel-membership-button)
   - [5.9 Purchase Row — Renew Button (State 2: Expired)](#59-purchase-row--renew-button-state-2-expired)
   - [5.10 Purchase Row — Refund Button (State 3: Cancelled)](#510-purchase-row--refund-button-state-3-cancelled)
   - [5.11 Refund Modal — Issue Refund Button](#511-refund-modal--issue-refund-button)
   - [5.12 Purchase Row — Info Button (State 4: Refunded)](#512-purchase-row--info-button-state-4-refunded)
   - [5.13 Membership Summary Modal — Close Button](#513-membership-summary-modal--close-button)
   - [5.14 Refund Modal — View Profile Button](#514-refund-modal--view-profile-button)
6. [Background Automation](#6-background-automation)
7. [RPCs Reference](#7-rpcs-reference)
8. [Tables Affected](#8-tables-affected)
9. [Sub-Feature Gate Map](#9-sub-feature-gate-map)
10. [Error Handling Summary](#10-error-handling-summary)
11. [Security Architecture](#11-security-architecture)

---

## 1. Module Overview

The Memberships module has two primary tabs:

| Tab | Purpose |
|---|---|
| **Membership Plans** | CRUD for plan definitions (name, price, duration, discount, applicable-to) |
| **Active Memberships** | Assign, view, cancel, renew, and refund customer membership purchases |

**Zero-Trust Hardening completed 2026-11-03.** All 10 previously-direct table mutations were removed and replaced with 7 authoritative atomic RPCs deployed to the `app` schema with `SECURITY DEFINER` and `shared.verify_tenant_access` guards.

---

## 2. Page Load Sequence

```
memberships.html
│
├── scripts/auth-loader.js          → 3-gate auth check (session → subscription → RBAC)
├── scripts/sub-features/sub-feature-gate.js  → data-sub-feature attribute gating
├── scripts/app-shell.js            → Injects sidebar + header; loads memberships.js
└── scripts/memberships/memberships-ui.js   → Tab/search/modal controls
    └── scripts/memberships.js (via app-shell)
        ├── initPlanListeners()         → Plan modal & delete confirm wiring
        ├── initAssignModalListeners()  → Customer search, plan picker, collect btn
        ├── fetchCustomers()            → READ customers table (branch-scoped)
        ├── loadPlans()                 → READ memberships + membership_purchases (member count)
        └── loadPurchases()             → READ membership_purchases (all, ordered by date desc)
```

**On load, two parallel Supabase reads fire:**
1. `memberships` table — plan definitions for current `company_id + branch_id`, excluding `status = 'deleted'`
2. `membership_purchases` table — to build member count per plan (active only)

---

## 3. Global State & Context

| Variable | Source | Used For |
|---|---|---|
| `company_id` | `localStorage.appContext.company.company_id` | All DB queries |
| `branch_id` | `localStorage.active_branch_id` or `#branchSelect.value` | All DB queries |
| `currentPlans[]` | In-memory, populated by `loadPlans()` | Plan table render, assign dropdown |
| `currentPurchases[]` | In-memory, populated by `loadPurchases()` | Purchases table render |
| `allCustomers[]` | In-memory, loaded at boot via `fetchCustomersApi()` | Customer phone autocomplete |
| `selectedCustomer` | Set when user picks from phone dropdown | Assign modal customer binding |
| `purchaseToCancel` | Set when Cancel row button clicked | Cancel confirmation modal |
| `purchaseToRefundObj` | Set when Refund row button clicked | Refund modal data population |
| `refundableMembershipAmount` | Computed from `business_transactions` ledger | Refund max validation |

**Branch change** (`#branchSelect` change event) → reloads both `loadPlans()` + `loadPurchases()`.

---

## 4. Tab: Membership Plans

### 4.1 Search Plans Input

**Element**: `#membershipSearch` (text input, header)  
**Sub-feature gate**: None

**Frontend**:
- `input` event → `applySearch()` in `memberships-ui.js`
- Filters rows of the **currently active tab's tbody** by `.innerText.toLowerCase().includes(query)`
- Client-side only — no Supabase call
- Placeholder changes on tab switch: `"Search plans..."` on Plans tab, `"Search customers..."` on Purchases tab

**Backend**: None — purely client-side row visibility filter.

---

### 4.2 Create Membership Plan Button

**Element**: `#btnCreatePlan` (header, visible only on Plans tab)  
**Sub-feature gate**: `data-sub-feature="create_membership"`  
**Label**: "Create Membership Plan"

**Frontend**:
1. Only active if current tab = `'plans'`
2. Calls `openCreateModal()` in `memberships-plans.js`
3. Resets form via `resetPlanForm()`: clears all inputs, sets duration default to 12 months, unchecks all "Applicable To" checkboxes
4. Sets modal title to "Create Membership Plan", button text to "Create Plan"
5. `setIsEditing(false)`, `setCurrentEditId(null)`
6. Opens `#planModalOverlay` by adding `.active` class

**Backend**: None on click (Supabase call happens on Save — see 4.5).

---

### 4.3 Plan Table Row — Edit Button

**Element**: Rendered `<button onclick="window.editPlan('${planId}')">` in plans table  
**Sub-feature gate**: `data-sub-feature="update_membership"`  
**Icon**: Pencil/edit SVG

**Frontend**:
1. `editPlan(id)` looks up plan in `currentPlans[]` by `membership_id || id`
2. Populates modal fields:
   - `#planNameInput` = `plan.plan_name` (set to `readOnly=true`, grayed out — plan name cannot be changed in edit mode)
   - `#planPriceInput` = `plan.price`
   - `#planDurationInput` = `plan.duration_months || plan.duration`
   - `#planDiscountType` = `plan.discount_type`
   - `#planDiscountValue` = `plan.discount_value`
   - `#appToServices`, `#appToProducts`, `#appToMemberships` checkboxes = boolean columns
3. `setIsEditing(true)`, `setCurrentEditId(id)`
4. Modal title → "Edit Membership Plan", save button → "Save Changes"
5. Opens `#planModalOverlay`

**Backend**: None on open.

---

### 4.4 Plan Table Row — Delete Button

**Element**: Rendered `<button onclick="window.deletePlan('${planId}')">` in plans table  
**Sub-feature gate**: `data-sub-feature="delete_membership"`  
**Icon**: Trash SVG, red styling

**Frontend**:
1. `deletePlan(id)` → `setPlanToDelete(id)`
2. Opens `#deletePlanConfirmOverlay` (adds `.active` class)
3. Modal shows static warning: "Delete Membership Plan — This action cannot be undone"

**Backend**: None on open (Supabase call happens on confirm — see 4.6).

---

### 4.5 Create/Edit Plan Modal — Save/Create Button

**Element**: `#btnSavePlan`  
**Label**: "Create Plan" (create mode) / "Save Changes" (edit mode)

**Frontend validation** (before RPC):
- Plan name must not be empty
- Price must not be empty
- Discount value must not be empty
- In **create mode only**: checks if `plan_name` already exists in `currentPlans[]` (case-insensitive) — shows toast "A membership plan with this name already exists." if duplicate
- Reads `#appToServices`, `#appToProducts`, `#appToMemberships` checkbox states → `all_services`, `all_products`, `all_memberships` booleans

**On Save — Create Mode:**

```javascript
supabase.rpc('create_membership_plan', {
    p_company_id:      company_id,       // from localStorage.appContext
    p_branch_id:       branch_id,        // from localStorage.active_branch_id
    p_plan_name:       "Gold Membership",
    p_price:           2999,
    p_duration:        12,               // months (1 | 3 | 6 | 12)
    p_discount_type:   "percentage",     // "percentage" | "flat"
    p_discount_value:  20,
    p_all_services:    true,
    p_all_products:    false,
    p_all_memberships: false
})
```

**On Save — Edit Mode:**

```javascript
supabase.rpc('update_membership_plan', {
    p_company_id:      company_id,
    p_branch_id:       branch_id,
    p_membership_id:   "<uuid>",         // current edit ID
    p_plan_name:       null,             // always null in edit — plan name locked
    p_price:           2999,
    p_duration:        12,
    p_discount_type:   "percentage",
    p_discount_value:  20,
    p_all_services:    true,
    p_all_products:    false,
    p_all_memberships: false,
    p_status:          "active"
})
```

**Backend (create_membership_plan) — Business Logics**:
| Step | Action |
|---|---|
| D1-a | `shared.verify_tenant_access(p_company_id, p_branch_id)` — raises exception if invalid |
| D1-b | `p_plan_name` must not be blank — returns error |
| D1-c | `p_price` must be >= 0 |
| D1-d | `p_duration` must be >= 1 |
| D1-e | `p_discount_type` must be NULL, `'percentage'`, or `'flat'` |
| D1-f | INSERT into `app.memberships` with `status = 'active'` |
| Return | `{ success: true, membership_id: "uuid", plan_name: "Gold Membership" }` |

**Backend (update_membership_plan) — Business Logics**:
| Step | Action |
|---|---|
| D2-a | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| D2-b | Verify plan exists with tenant ownership + not `deleted` |
| D2-c | Only update non-NULL fields (partial update) |
| D2-d | `p_price` >= 0 if provided |
| D2-e | `p_status` must be in `('active','inactive')` if provided |
| D2-f | UPDATE `app.memberships` SET changed fields + `updated_at = NOW()` |
| Return | `{ success: true, membership_id: "uuid", plan_name: "..." }` |

**Tables Written**: `app.memberships` (via `public` wrapper)

**On success**:
- `showToast('Plan created/updated successfully.')`
- `window.notifyEvent('marketing', 'evt_marketing_membership', { title, message })`
- `closePlanModal()` → removes `.active` from `#planModalOverlay`
- `loadPlans()` → refreshes table

**On error**: `showToast('Error saving plan: ' + err.message)`

---

### 4.6 Delete Plan Confirm Modal — Yes Delete Button

**Element**: `#btnConfirmDeletePlan` (red "Yes, Delete" button)  
**Cancel button**: `#btnCancelDeletePlan` ("Cancel" — dismisses modal, clears `planToDelete`)

**On confirm click**:

```javascript
supabase.rpc('delete_membership_plan', {
    p_company_id:    company_id,
    p_branch_id:     branch_id,
    p_membership_id: "<uuid>"           // from setPlanToDelete()
})
```

**Backend (delete_membership_plan) — Business Logics**:
| Step | Action |
|---|---|
| D3-a | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| D3-b | Verify plan exists with tenant ownership |
| D3-c | **Active member guard**: COUNT `app.membership_purchases` WHERE `membership_id = p_membership_id AND status = 'active'`. If count > 0 → FAIL: `"Cannot delete — this plan has {N} active member(s). Cancel their memberships first."` |
| D3-d | Soft delete: UPDATE `app.memberships SET status = 'deleted', updated_at = NOW()` |
| Return | `{ success: true, membership_id: "uuid", active_member_count: 0 }` |

**Tables Written**: `app.memberships`

**On success**:
- `showToast('Membership plan deleted successfully.')`
- `window.notifyEvent('marketing', 'evt_marketing_membership', { title: 'Membership Plan Deleted', ... })`
- Modal closed, `setPlanToDelete(null)`
- `loadPlans()` refreshes table

**On error**: `showToast('Error deleting plan: ' + err.message)`

---

## 5. Tab: Active Memberships

The Purchases tab displays all `membership_purchases` for the current branch, ordered by `purchase_date DESC`. Each row has 4 possible states:

| State | Status | Payment | Second Action Button |
|---|---|---|---|
| 1 | Active | Paid (green) | **Cancel** (red) |
| 2 | Expired | Paid (green) | **Renew** (green) |
| 3 | Cancelled | Paid (green) | **Refund** (amber) |
| 4 | Refunded | Refunded (amber badge) | **Info** (gray) |

All rows also show a **View** button (blue eye icon).

---

### 5.1 Assign Membership Button

**Element**: `#btnAssignPlan` (header, visible only on Purchases tab)  
**Sub-feature gate**: `data-sub-feature="assign_membership"`  
**Label**: "Assign Membership"

**Frontend**:
1. Only active if current tab = `'purchases'`
2. `window.resetAssignMembershipForm()` → clears all assign modal fields
3. Opens `#assignModalOverlay` by adding `.active` class
4. Feather icons refreshed

**Backend**: None on click.

---

### 5.2 Customer Phone Search (Assign Modal)

**Element**: `#custSearchInput` (`tel` input, label "Phone Number *")  
**Autocomplete container**: `#membershipCustomerSuggestions`

**Frontend**:
- `input` event → filters `allCustomers[]` (cached at boot) by `customer_phone.includes(inputValue)`
- Renders up to 8 matching customers as dropdown suggestions showing Name + Phone
- On suggestion click:
  - `custSearch.value` = customer phone
  - `setSelectedCustomer(customer)` → stores in state
  - `setCustFormState(false, name, email)` → populates `#assignCustomerName` as read-only
  - Hides suggestions, shows existing customer badge
- If no match found AND phone length >= 10:
  - Shows "new customer" badge
  - `setCustFormState(true)` → `#assignCustomerName` becomes editable (new customer flow)
  - `setSelectedCustomer(null)`

**Backend**: None — purely against in-memory `allCustomers[]` cache.

> [!NOTE]
> `allCustomers[]` is loaded once at page boot via `fetchCustomersApi(companyId, branchId)` which reads `customers` table with `company_id + branch_id` filters. It is NOT refreshed on subsequent searches. If a new customer was just created elsewhere, they won't appear until page reload.

---

### 5.3 Plan Selector Dropdown (Assign Modal)

**Element**: `#assignPlanInput` (`<select>`)  
**Populated by**: `populateAssignPlanDropdown()` called after `loadPlans()`

**Frontend**:
- Lists only plans with `status = 'active'` from `currentPlans[]`
- `change` event → `updateAssignModalSummary()`:
  - Populates plan summary card with Plan Name, Price, Duration, Benefits, Applicable To
  - Updates subtotal/tax/total footer amounts
  - Shows `#assignDatesContainer` with auto-calculated dates:
    - Purchase date: defaults to today
    - Expiry date: auto-computed as `purchaseDate + plan.duration months` (live-updates on purchase date change)

**Backend**: None — reads from `currentPlans[]` cache.

---

### 5.4 Collect Button (Assign Modal)

**Element**: `#btnConfirmAssign` (large indigo "Collect" button, bottom-right of assign modal)

**Frontend validations**:
1. Phone number must be >= 10 digits
2. If no existing customer selected: `#assignCustomerName` must not be empty
3. Plan must be selected (`#assignPlanInput` must have a value)

**Duplicate active membership check** (before showing payment modal):
```javascript
supabase
    .from('membership_purchases')
    .select('*')
    .eq('customer_id', finalCustomerId)
    .eq('membership_id', planValue)
    .eq('status', 'active')
    .eq('company_id', company_id)
    .eq('branch_id', branch_id)
```
- If result has rows → `showToast('Membership is already assigned to this customer')` — aborts

**On pass** (no duplicate):
1. Hides assign modal (`#assignModalOverlay` removes `.active`)
2. Generates `newPurchaseId = crypto.randomUUID()` (client-side, used as reference)
3. Calls `window.openGlobalPaymentModal({...})` with:
   ```javascript
   {
       type: 'membership',
       title: 'Membership Payment',
       saleId: newPurchaseId.slice(0,8).toUpperCase(),
       customerId: finalCustomerId,
       customerName: "...",
       customerPhone: custSearchValue,
       totalAmount: plan.price,
       amountDue: plan.price,
       isMembershipPurchase: true,
       items: [{ name: planName, subtitle: "12 Months Validity", quantity: 1, price: plan.price, ... }],
       onComplete: async (payload) => executeMembershipAssignment(payload, newPurchaseId)
   }
   ```

**Backend**: `membership_purchases` read-check only at this stage.

---

### 5.5 Global Payment Modal — Pay Button (Membership)

**Shared module**: `scripts/global-payment-modal.js` (loaded via `<script>` tag in `memberships.html`)

The global payment modal handles:
- Payment method selection (Cash / UPI / Card)
- Discount application (coupons, offers, manual)
- Amount display

**When user clicks Pay in the payment modal**, `onComplete(payload)` fires → `executeMembershipAssignment(payload, newPurchaseId)`.

**`executeMembershipAssignment` builds RPC payload**:
```javascript
supabase.rpc('assign_membership_atomic', {
    p_company_id:            company_id,
    p_branch_id:             branch_id,
    p_membership_id:         planValue,           // selected plan UUID
    p_customer_id:           finalCustomerId,      // null if new customer
    p_customer_phone:        custSearchValue,      // 10-digit phone
    p_customer_name:         finalCustomerName,
    p_customer_email:        custEmailValue || null,
    p_payment_method:        "cash"|"upi"|"card",
    p_purchase_date:         "2026-11-04",         // from #assignDateInput
    p_discount_type:         "coupon"|"offer"|"manual"|null,
    p_discount_name:         "SAVE20"|null,
    p_discount_id:           "<uuid>"|null,
    p_discount_amount:       discountAmount|null,
    p_final_amount:          amountCollected,      // hint; server overrides
    p_assigned_by_user_id:   userId,               // from appContext.user.id
    p_assigned_by_user_name: userName,
    p_notes:                 notesValue|null
})
```

**Backend (assign_membership_atomic) — All 12 Business Logics**:

| Logic | Rule |
|---|---|
| **A1 Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` — raises exception |
| **A2 Plan existence** | Reads `app.memberships` WHERE `membership_id = p_membership_id AND company_id AND branch_id`. Exact match only. Fail if not found. |
| **A3 Plan active status** | Plan `status` must be `'active'`. Fails if `'inactive'` or `'deleted'`. |
| **A4 Catalog price authority** | Server reads price from `app.memberships`. Client's `p_final_amount` is a **hint only** — server ignores it, computes `v_server_final = plan_price - server_discount`. |
| **A5 Coupon re-validation** | If discount_type='coupon': 6-step server check (active, in-date, all_memberships=true, min_bill_amount, usage_count limit, per-customer limit). Failed check → zero discount (not error). Increments `coupons.usage_count`. |
| **A6 Offer re-validation** | If discount_type='offer': checks active + in date range + `all_memberships=true`. Invalid → zero discount. |
| **A7 Discount computation** | `v_server_final = GREATEST(0, plan_price - v_server_discount)` |
| **A8 Customer dedup + create** | If `p_customer_id`: verify in `app.customers`. Else look up by phone + company. If not found: creates new customer row (`total_visits=1, total_spent=0`). |
| **A9 Duplicate active guard** | Checks `app.membership_purchases` for `customer_id + membership_id + status='active' + expiry_date >= today`. If found → `"Customer already has an active membership for this plan."` |
| **A10 Expiry calculation** | `expiry_date = purchase_date + (plan.duration months)`. Fallback: 12 months. |
| **A11 Atomic writes (5-step)** | ① INSERT `app.membership_purchases` (final_amount = server-computed) ② INSERT `app.business_transactions` (amount = server_final, status='paid') ③ UPDATE `app.customers` (total_spent += server_final, last_visit = purchase_date) ④ INSERT `app.discount_usages` if discount > 0 ⑤ UPDATE `app.coupons SET usage_count + 1` if coupon |
| **A12 Return** | `{ success, purchase_id, payment_id, customer_id, customer_name, plan_name, purchase_date, expiry_date, final_amount, payment_method }` |

**Tables Written (atomic)**:
- `app.membership_purchases` — new row
- `app.business_transactions` — payment ledger entry
- `app.customers` — total_spent + last_visit update (or new row if new customer)
- `app.discount_usages` — if discount applied
- `app.coupons` — usage_count++ if coupon used

**On success**:
- `showToast('Membership assigned successfully!')`
- `window.notifyEvent('marketing', 'evt_marketing_membership_purchased', { title: 'Membership Purchased', message: ... })`
- If new customer created: pushed into `allCustomers[]` in-memory cache
- `resetAssignMembershipForm()` → clears all assign modal fields
- `loadPurchases()` → refreshes Active Memberships table

**On error**: `showToast('An error occurred during assignment: ' + err.message)`

---

### 5.6 Purchase Row — View Button

**Element**: `<button onclick="window.viewMembershipSummary('${purchaseId}')">` (blue eye icon, present on ALL rows regardless of state)

**Frontend**:
1. `viewMembershipSummary(purchaseId)` in `memberships-summary-modal.js`
2. Finds purchase in `currentPurchases[]` by `purchase_id || id`
3. Finds matching plan in `currentPlans[]` to get discount text and applicable-to pills
4. Populates `#membershipSummaryOverlay` modal DOM elements:
   - Customer avatar initials, name, phone, status badge + payment badge
   - Plan name, price, duration, discount text
   - Purchase date, expiry date
   - Applicable-to pills (Services / Products / Memberships)
   - Notes / Cancellation Details / Refund Details section (shown conditionally based on status)
5. Shows overlay via `overlay.style.display = 'flex'`

**Backend**: None — reads from `currentPurchases[]` and `currentPlans[]` cache only.

---

### 5.7 Purchase Row — Cancel Button (State 1: Active)

**Element**: `<button onclick="window.cancelMembershipPurchase('${purchaseId}')">` (red circle-X icon)  
**Visible only when**: `purchase.status === 'active'` AND expiry date is in the future

**Frontend**:
1. `cancelMembershipPurchase(purchaseId)` in `memberships-cancellation.js`
2. `setupCancelPurchaseModal()` — dynamically creates and injects `#cancelPurchaseConfirmOverlay` into DOM (removes old one first to avoid duplicates)
3. `setPurchaseToCancel(purchaseId)`
4. Populates confirmation modal with:
   - Customer name (`#cancelMemCustomerName`)
   - Plan name (`#cancelMemPlanName`)
   - Plan start date (`#cancelMemStartDate`)
   - Duration used (`#cancelMemDurationDisplay`) — computed via `calculateDurationBetweenDates(start, now)`
5. Clears reason textarea `#cnlMemNote`
6. Opens `#cancelPurchaseConfirmOverlay`

**Backend**: None on open.

---

### 5.8 Cancel Modal — Cancel Membership Button

**Element**: `#btnConfirmCancelPurchase` ("Cancel Membership" — red button)  
**Cancel/Keep button**: `#btnCancelCancelPurchase` ("Keep Membership" — dismisses modal)

**On confirm**:
```javascript
supabase.rpc('cancel_membership_atomic', {
    p_purchase_id: purchaseId,
    p_company_id:  company_id,
    p_branch_id:   branch_id,
    p_notes:       noteFieldValue || null   // reason from #cnlMemNote textarea
})
```

**Backend (cancel_membership_atomic) — 5 Business Logics**:

| Logic | Rule |
|---|---|
| **B1 Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| **B2 Purchase existence + ownership** | SELECT from `app.membership_purchases` WHERE `purchase_id = p_purchase_id AND company_id = p_company_id AND branch_id = p_branch_id`. Strict — no NULL bypass. Fail if not found. |
| **B3 State machine guard** | Only `status = 'active'` can be cancelled. Any other status → fail with: `"Only active memberships can be cancelled. Current status: {status}"` |
| **B4 Cancellation ledger** | INSERT `app.business_transactions` with `status='cancelled', amount=0, reference_type='membership', reference_id=p_purchase_id` — written atomically |
| **B5 Purchase record update** | UPDATE `app.membership_purchases` → `status='cancelled', cancelled_date=CURRENT_DATE, notes=p_notes, updated_at=NOW()` |

**Tables Written**:
- `app.membership_purchases` — status → 'cancelled', cancelled_date, notes
- `app.business_transactions` — cancellation event ledger entry

**Return**: `{ success: true, purchase_id, customer_name, plan_name, status: "cancelled", cancelled_date }`

**On success**:
- Modal closed, `setPurchaseToCancel(null)`
- `showToast('Membership has been cancelled.')`
- `loadPurchases()` → table refreshes (row now shows State 3: Cancelled + Refund button)

**On error**: `showToast('Error cancelling membership: ' + err.message)`

---

### 5.9 Purchase Row — Renew Button (State 2: Expired)

**Element**: `<button onclick="window.renewMembershipPurchase('${purchaseId}')">` (green refresh icon)  
**Visible only when**: `purchase.status === 'expired'` (or `status==='active'` with `expiry_date < today`)

**Frontend**:
1. `renewMembershipPurchase(purchaseId)` in `memberships-assign-modal.js`
2. Fires `window.notifyEvent('marketing', 'evt_marketing_membership_expired_renewed', { title: 'Membership Renewed', ... })`
3. `resetAssignMembershipForm()` → clears assign modal
4. **Pre-fills** assign modal with expired membership's data:
   - `#custSearchInput` = customer's phone (looked up from `allCustomers[]` by `customer_id`)
   - `setSelectedCustomer(cust)` → customer locked in read-only mode
   - `#assignCustomerName` = customer name (read-only)
   - `#assignPlanInput` = same plan UUID as expired membership → fires `change` event → `updateAssignModalSummary()`
5. Opens `#assignModalOverlay`

**Result**: User sees the assign modal pre-populated with the customer and their previous plan — they just adjust dates if needed and click Collect.

**Backend**: None on renew button click. Actual new purchase goes through the same `assign_membership_atomic` RPC as a fresh assignment (see 5.4 / 5.5).

> [!NOTE]
> Renewal is NOT a backend operation by itself. It is a fresh membership assignment pre-filled with the expired customer's details. The expired purchase record remains in the DB as `status='expired'`.

---

### 5.10 Purchase Row — Refund Button (State 3: Cancelled)

**Element**: `<button onclick="window.refundMembershipPurchase('${purchaseId}')">` (amber circular-arrow icon)  
**Visible only when**: `purchase.status === 'cancelled'`

**Frontend**:
1. `refundMembershipPurchase(purchaseId)` in `memberships-refund.js`
2. `setupRefundPurchaseModal()` — creates `#refundMembershipAdvancedOverlay` if not already in DOM
3. `setPurchaseToRefundObj(purchase)` → stores purchase object in state
4. Opens overlay
5. Populates LEFT column (3 cards):
   - **Card 1 — Member Details**: Customer name, phone, email, avatar initials, View Profile button
   - **Card 2 — Membership Details**: Plan name, membership ID badge (#MEM-XXXXXX), start date, cancelled-on date, status badge
   - **Card 3 — Original Payment**: Payment method (from `business_transactions`), payment date, paid amount
6. Populates RIGHT column:
   - `#rfMemAmountInput` = initial fallback paid amount (from `final_amount || price || amount` on purchase object)
   - `#rfMemMaxRefundText` = max refundable amount
   - `#rfMemReasonSelect` = reset to empty
   - `#rfMemMethodDisplay` = preset to original payment method
7. **Async background fetch** (non-blocking, runs after modal opens):
   ```javascript
   // Fetch precise ledger from business_transactions
   supabase
     .from('business_transactions')
     .select('*')
     .eq('reference_id', purchaseId)
     .eq('reference_type', 'membership')
   ```
   - Computes `ledgerPaid - ledgerRefunded` = `v_max_refundable`
   - Updates `#rfMemAmountInput`, `#rfMemOrigPaidAmount`, `#rfMemOrigMethod`, `#rfMemOrigDate` with accurate values from ledger
   - Also fires `fetchCustomerByIdApi(customer_id)` to refresh customer details from DB

**Backend reads** (async, non-blocking):
- `business_transactions` SELECT (for ledger accuracy)
- `customers` SELECT by `customer_id` (for fresh customer details)

---

### 5.11 Refund Modal — Issue Refund Button

**Element**: `#confirmMemRefundBtn` (red "Issue Refund" button, modal footer)  
**Cancel buttons**: `#cancelMemRefundBtn` (header X) + `#closeMemRefundBtn` (footer "Cancel")

**Frontend validations**:
1. `rfMemAmountInput.value` must be a positive number > 0
2. Refund amount must not exceed `refundableMembershipAmount` (from ledger)
3. `#rfMemReasonSelect` must have a selection (not empty) — highlights red border if empty
4. Sanitizes payment method: must be in `['cash', 'upi', 'card']`, defaults to `'cash'`
5. Combines reason + optional note: `fullNotes = reason + (note ? " - " + note : "")`

**On confirm**:
```javascript
supabase.rpc('process_membership_refund_atomic', {
    p_purchase_id:    purchaseId,
    p_company_id:     company_id,
    p_branch_id:      branch_id,
    p_refund_amount:  enteredRefundAmount,       // e.g. 1500
    p_payment_method: "cash"|"upi"|"card",
    p_refund_reason:  "Customer Request - Additional note",
    p_staff_id:       userId                     // from appContext.user.id
})
```

**Backend (process_membership_refund_atomic) — 9 Business Logics**:

| Logic | Rule |
|---|---|
| **C1 Tenant isolation** | `shared.verify_tenant_access(p_company_id, p_branch_id)` |
| **C2 Purchase existence** | SELECT from `app.membership_purchases` WHERE `purchase_id = p_purchase_id AND company_id = p_company_id AND branch_id = p_branch_id`. Fail if not found. |
| **C3 State machine guard** | Only `status = 'cancelled'` can be refunded. Guards against double-refund: checks `payment_status <> 'refunded'`. |
| **C4 Max refundable calculation** | SUM prior `business_transactions` with `reference_id = p_purchase_id AND status = 'refunded'`. `v_max_refundable = GREATEST(0, final_amount - already_refunded)`. If `p_refund_amount > v_max_refundable` → fail. If `<= 0` → fail. |
| **C5 Payment method normalisation** | `v_method = LOWER(TRIM(p_payment_method))`. Must be in `('cash','upi','card')`. Default to `'cash'` if not. |
| **C6 Refund ledger** | INSERT `app.business_transactions` (`status='refunded', amount=p_refund_amount`) |
| **C7 Purchase record update** | UPDATE `app.membership_purchases` → `status='refunded', payment_status='refunded'`, append notes |
| **C8 Customer LTV reversal** | UPDATE `app.customers SET total_spent = GREATEST(0, total_spent - p_refund_amount)` |
| **C9 Discount reversal** | UPDATE `app.discount_usages SET status='reversed', reversal_amount=discount_amount, reversed_at=NOW()` WHERE `reference_id=p_purchase_id AND status='applied'` |

**Tables Written (atomic)**:
- `app.business_transactions` — refund ledger entry
- `app.membership_purchases` — status → 'refunded', payment_status → 'refunded'
- `app.customers` — total_spent decreased
- `app.discount_usages` — discount reversed (if applicable)

**Return**: `{ success: true, purchase_id, refund_payment_id, customer_name, plan_name, refund_amount, payment_method, status: "refunded" }`

**On success**:
- `showToast('Membership has been refunded.')`
- `window.notifyEvent('payments', 'evt_payment_refunded', { title: 'Membership Refunded', ... })`
- Overlay closed
- `loadPurchases()` → table refreshes (row now shows State 4: Refunded + Info button)

**Reason options** (dropdown `#rfMemReasonSelect`):
- Customer Request
- Membership Cancelled
- Service Dissatisfaction
- Relocation / Moving
- Duplicate Payment
- Other

---

### 5.12 Purchase Row — Info Button (State 4: Refunded)

**Element**: `<button onclick="window.viewRefundInfo('${purchaseId}')">` (gray info circle icon)  
**Visible only when**: `purchase.status === 'refunded'`

**Frontend**:
1. `viewRefundInfo(purchaseId)` in `memberships-refund.js`
2. Creates `#refundInfoModalOverlay` if not already in DOM
3. Opens modal with loading spinner
4. Fetches refund transaction summary:
   ```javascript
   supabase
     .from('business_transactions')
     .select('amount, status, created_at, paid_at, notes')
     .eq('reference_id', purchaseId)
     .eq('reference_type', 'membership')
     .order('created_at', { ascending: false })
   ```
5. Renders:
   - Customer name, plan name
   - Purchase date, refund date
   - Paid amount, refunded amount
   - Remaining balance = `max(0, paidAmount - refundedAmount)`
   - Refund reason/notes
   - Timeline of transaction entries

**Backend reads**:
- `business_transactions` SELECT (filtered by `reference_id + reference_type='membership'`)

---

### 5.13 Membership Summary Modal — Close Button

**Element**: `<button onclick="document.getElementById('membershipSummaryOverlay').style.display='none'">` (modal header X button)  
Also: footer "Close" button with same inline onclick.  
Also: backdrop click on `membershipSummaryOverlay` → `overlay.style.display='none'`

**Backend**: None — UI only.

---

### 5.14 Refund Modal — View Profile Button

**Element**: `#rfMemCustomerViewProfileBtn` ("View Profile" link in refund modal Member Details card)  
**Visible only when**: `purchaseToRefundObj.customer_id` is set

**Frontend**:
1. Dynamically imports `scripts/global-customer-profile-modal.js` (lazy import) if not already loaded
2. Calls `window.viewCustomerProfile(customerId, customerName)`
3. Opens the global customer profile modal showing customer history

**Backend**: Handled by `global-customer-profile-modal.js` (Module 05 scope).

---

## 6. Background Automation

### 6.1 Expired Memberships Sync (Auto on Load)

Runs in `memberships-purchases-table.js` → `loadPurchases()`:

```javascript
// 1. Find memberships that are active but past expiry_date
const expiredPurchases = purchases.filter(p =>
    p.expiry_date < todayStr && p.status === 'active'
);

// 2. Optimistically update in-memory status
expiredPurchases.forEach(p => { p.status = 'expired'; });

// 3. Authoritative DB sync (async, non-blocking)
supabase.rpc('sync_expired_memberships', {
    p_company_id: company_id,
    p_branch_id:  branch_id
})
```

**Backend (sync_expired_memberships)**:
- Batch UPDATE `app.membership_purchases SET status='expired'` WHERE `status='active' AND expiry_date < CURRENT_DATE AND company_id = p_company_id AND branch_id = p_branch_id`
- Table written: `app.membership_purchases`

### 6.2 Background Refresh (every 30 minutes)

```javascript
setInterval(() => loadPurchases(true), 30 * 60 * 1000);
```
- Silently refreshes purchases in background (no loading spinner shown)
- Triggered in `initMemberships()` on page boot

### 6.3 Visibility Change Refresh

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadPurchases(true);
});
```
- Fires when user returns to the browser tab after switching away

---

## 7. RPCs Reference

| RPC | Schema | Description | Params (key) |
|---|---|---|---|
| `create_membership_plan` | `app` + `public` | Create a new plan | `p_company_id, p_branch_id, p_plan_name, p_price, p_duration, p_discount_type, p_discount_value, p_all_services, p_all_products, p_all_memberships` |
| `update_membership_plan` | `app` + `public` | Edit existing plan (name locked) | `p_company_id, p_branch_id, p_membership_id, p_plan_name(null), p_price, p_duration, p_discount_type, p_discount_value, p_all_services, p_all_products, p_all_memberships, p_status` |
| `delete_membership_plan` | `app` + `public` | Soft-delete with active member guard | `p_company_id, p_branch_id, p_membership_id` |
| `assign_membership_atomic` | `app` + `public` | Full membership purchase — 12 logics | `p_company_id, p_branch_id, p_membership_id, p_customer_id, p_customer_phone, p_customer_name, p_customer_email, p_payment_method, p_purchase_date, p_discount_type, p_discount_name, p_discount_id, p_discount_amount, p_final_amount, p_assigned_by_user_id, p_assigned_by_user_name, p_notes` |
| `cancel_membership_atomic` | `app` + `public` | Cancel active membership — 5 logics | `p_purchase_id, p_company_id, p_branch_id, p_notes` |
| `process_membership_refund_atomic` | `app` + `public` | Refund cancelled membership — 9 logics | `p_purchase_id, p_company_id, p_branch_id, p_refund_amount, p_payment_method, p_refund_reason, p_staff_id` |
| `sync_expired_memberships` | `app` + `public` | Batch expire overdue active memberships | `p_company_id, p_branch_id` |

**All RPCs**:
- `SECURITY DEFINER`
- `SET search_path = platform, shared, app, public, pg_temp`
- First action: `shared.verify_tenant_access(p_company_id, p_branch_id)`
- Return: `jsonb { success: boolean, ... }`

---

## 8. Tables Affected

| Table | Operations | Trigger |
|---|---|---|
| `app.memberships` | SELECT (load plans), INSERT (create plan), UPDATE (edit / soft-delete) | Plan CRUD RPCs |
| `app.membership_purchases` | SELECT (load purchases / duplicate check), INSERT (assign), UPDATE (cancel / expire / refund) | assign, cancel, refund, sync RPCs |
| `app.business_transactions` | SELECT (refund ledger info), INSERT (payment / cancel / refund events) | assign, cancel, refund RPCs |
| `app.customers` | SELECT (search), INSERT (new customer via assign), UPDATE (total_spent / last_visit) | assign, refund RPCs |
| `app.discount_usages` | INSERT (discount applied), UPDATE (reversal on refund) | assign, refund RPCs |
| `app.coupons` | UPDATE (`usage_count++`) | assign RPC (if coupon used) |

**Read-only tables** (no mutations from this module):
- `app.services` — read at boot by `fetchServicesApi` (not currently used in UI but available)

---

## 9. Sub-Feature Gate Map

| `data-sub-feature` value | Element | Action Gated |
|---|---|---|
| `create_membership` | `#btnCreatePlan` | Create new membership plan |
| `update_membership` | Edit button (per plan row) | Edit existing plan |
| `delete_membership` | Delete button (per plan row) | Delete plan |
| `assign_membership` | `#btnAssignPlan` | Assign membership to customer |
| `export_membership_usage` | `#btnExportUsage` (hidden by default) | Export membership data |

Sub-feature gating is processed by `scripts/sub-features/sub-feature-gate.js` and `scripts/sub-features/sub-feature-manager.js`. Elements with `data-sub-feature` attributes are hidden or disabled if the logged-in user's role does not have that sub-feature enabled.

`window.applySubFeatureGates()` is called after every table re-render to re-apply gates on dynamically generated rows.

---

## 10. Error Handling Summary

| Scenario | Handling |
|---|---|
| `loadPlans()` fails | Table shows red error row: "Failed to load membership plans: {msg}" |
| `loadPurchases()` fails | Table shows red error row: "Failed to load membership purchases: {msg}" |
| Duplicate plan name (create) | Client-side: `showToast('A membership plan with this name already exists.')` — no RPC called |
| `create_membership_plan` fails | `showToast('Error saving plan: ' + err.message)` — modal stays open |
| `update_membership_plan` fails | `showToast('Error saving plan: ' + err.message)` — modal stays open |
| `delete_membership_plan` — has active members | `showToast('Error deleting plan: Cannot delete — this plan has {N} active members...')` |
| Assign — phone < 10 digits | `showToast('Please enter a valid 10-digit phone number.')` |
| Assign — no plan selected | `showToast('Please select a membership plan.')` |
| Assign — duplicate active membership | `showToast('Membership is already assigned to this customer')` — checked client-side AND server-side (A9) |
| `assign_membership_atomic` fails | `showToast('An error occurred during assignment: ' + err.message)` |
| Cancel — wrong state | Backend error returned: "Only active memberships can be cancelled. Current status: {status}" |
| `cancel_membership_atomic` fails | `showToast('Error cancelling membership: ' + err.message)` |
| Refund — no reason selected | Client: highlights `#rfMemReasonSelect` border red + `showToast('Please select a refund reason.')` |
| Refund — amount > paid | Client: resets to max + `showToast('Refund amount cannot exceed paid limit of ₹{N}')` |
| `process_membership_refund_atomic` fails | `showToast('Failed to process refund: ' + err.message)` |
| Payment modal not available | `showToast('Payment modal not loaded', true)` |
| `sync_expired_memberships` fails | `console.warn(...)` only — silent, non-blocking |
| Ledger fetch fails in refund modal | `console.warn('Ledger query error (fallback used)')` — falls back to purchase record amounts |

---

## 11. Security Architecture

### Zero-Trust Principles Applied

| Principle | Implementation |
|---|---|
| **No client-side price authority** | `assign_membership_atomic` reads price from `app.memberships` and ignores `p_final_amount` from client |
| **No direct table mutations** | 0 direct `.insert()/.update()/.delete()` on transactional tables (`membership_purchases`, `business_transactions`, `customers`) from frontend |
| **Tenant isolation on every RPC** | `shared.verify_tenant_access(p_company_id, p_branch_id)` is the first statement in every mutation RPC |
| **State machine enforcement** | Cancel: only `active→cancelled`. Refund: only `cancelled→refunded`. Double-refund blocked server-side. |
| **Active member guard** | `delete_membership_plan` blocks if any active purchases exist for that plan |
| **Coupon server-side re-validation** | Coupon validity, usage limits, applicable-to checks all done server-side even if frontend sends a valid-looking payload |
| **SECURITY DEFINER** | All RPCs run as the function owner, not the calling user — prevents privilege escalation |
| **Locked search_path** | `SET search_path = platform, shared, app, public, pg_temp` — prevents schema injection attacks |
| **Sub-feature RBAC** | `data-sub-feature` attributes hide/disable UI elements for roles without the specific permission |
| **Auth guard on page load** | `scripts/auth-loader.js` enforces 3-gate model: session validity → subscription plan → RBAC role before page renders |

### Vulnerabilities Eliminated (from pre-hardening state)

| # | Vulnerability | Old State | Hardened State |
|---|---|---|---|
| 1 | Price tampering | Client could pass `p_final_amount=1.00` and get a membership for ₹1 | Server overrides with catalog price |
| 2 | Direct mutation file | `scripts/payment-membership.js` did direct `.insert()` on membership_purchases | File retired with deprecation notice |
| 3 | Tenant bypass | `(p_company_id IS NULL OR company_id = p_company_id)` allowed cross-tenant reads | Strict `shared.verify_tenant_access` |
| 4 | Client-side cancel ledger | Cancellation ledger was optional (JS could fail and skip it) | Mandatory atomic ledger entry in RPC |
| 5 | No coupon server-validation | Coupons were applied client-side only — usage limits not enforced | 6-step server validation on every assignment |
| 6 | Direct plan management | Plan CRUD was raw `.from('memberships').insert/update()` | Sealed behind 3 dedicated plan management RPCs |
| 7 | Delete with active members | Active members check was UI-only | Server-side guard blocks deletion if members exist |
| 8 | Direct expiration updates | Expired records updated via direct `.update()` from JS | `sync_expired_memberships` RPC runs authoritatively |

---

*Document generated: 2026-11-04 | Source files: `memberships.html`, `scripts/memberships/*.js` | Total interactions documented: 22*

