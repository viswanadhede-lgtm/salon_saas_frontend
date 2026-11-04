# MODULE 03 — Point of Sale (POS)
> **Bharathbots Salon SaaS — Developer Interaction Map**
> Generated: 2026-11-04 | Source files analysed: `pos.html`, `pos.js`, `scripts/sales-history/sales-refund.js`, `scripts/sales-history/sales-api.js`, `scripts/global-customer-modal.js`, `scripts/global-payment-modal.js`, `docs/modules/pos/POS_MODULE_AUDIT.md`

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Page Load Sequence](#2-page-load-sequence)
3. [Left Panel — Product Catalogue](#3-left-panel--product-catalogue)
   - 3.1 [Product Search Bar](#31-product-search-bar)
   - 3.2 [Product Card — "+ Add to Sale" Button](#32-product-card----add-to-sale-button)
4. [Right Panel — Current Sale (Cart)](#4-right-panel--current-sale-cart)
   - 4.1 [Customer Phone Search Input](#41-customer-phone-search-input)
   - 4.2 [Customer Suggestion Dropdown](#42-customer-suggestion-dropdown)
   - 4.3 ["Clear" (✕) Button](#43-clear--button)
   - 4.4 ["+ Add Customer" Button](#44--add-customer-button)
   - 4.5 [Cart Item — Quantity "−" Button](#45-cart-item--quantity---button)
   - 4.6 [Cart Item — Quantity "+" Button](#46-cart-item--quantity--button)
   - 4.7 [Cart Item — "Remove" Link](#47-cart-item--remove-link)
   - 4.8 ["Collect" Button (Complete Sale)](#48-collect-button-complete-sale)
5. [Global Payment Modal (POS Flow)](#5-global-payment-modal-pos-flow)
   - 5.1 [Payment Method Selection](#51-payment-method-selection)
   - 5.2 [Discount / Coupon / Offer Application](#52-discount--coupon--offer-application)
   - 5.3 ["Confirm Payment" Button → create_pos_sale_atomic](#53-confirm-payment-button--create_pos_sale_atomic)
6. [POS Refund Flow (Sales History page)](#6-pos-refund-flow-sales-history-page)
   - 6.1 [Refund Modal Open](#61-refund-modal-open)
   - 6.2 [Item Selection Checkboxes](#62-item-selection-checkboxes)
   - 6.3 [Quantity Stepper (− / +)](#63-quantity-stepper-----)
   - 6.4 [Refund Method / Reason / Note Fields](#64-refund-method--reason--note-fields)
   - 6.5 ["Issue Refund" Button → process_pos_refund_atomic](#65-issue-refund-button--process_pos_refund_atomic)
   - 6.6 [Close / Cancel Refund Modal](#66-close--cancel-refund-modal)
7. [Branch Changed Event](#7-branch-changed-event)
8. [Error / Edge-Case Handling](#8-error--edge-case-handling)
9. [RBAC & Plan Gates](#9-rbac--plan-gates)
10. [Tables & Views Touched](#10-tables--views-touched)
11. [All RPCs Called](#11-all-rpcs-called)
12. [Backend Security — Zero-Trust Architecture](#12-backend-security--zero-trust-architecture)

---

## 1. Architecture Overview

| Layer | Detail |
|---|---|
| **Page** | `pos.html` |
| **Entry Point** | `pos.js` → `initPos()` |
| **Global State** | Module-level vars in `pos.js`: `liveProducts[]`, `cart[]`, `allCustomers[]`, `selectedCustomer`, `currentPaymentMethod` |
| **Product data source** | `products` table (direct SELECT, filtered by company + branch + status = 'active') |
| **Customer data source** | `customers` table (direct SELECT, filtered by company + branch) |
| **Sale creation** | `supabase.rpc('create_pos_sale_atomic', ...)` |
| **Refund execution** | `supabase.rpc('process_pos_refund_atomic', ...)` via `scripts/sales-history/sales-refund.js` → `sales-api.js` |
| **Payment UI** | `scripts/global-payment-modal.js` — Global Payment Modal (`window.openGlobalPaymentModal`) |
| **New Customer UI** | `scripts/global-customer-modal.js` — Global Add Customer Modal (`window.openGlobalAddCustomerModal`) |
| **Cart persistence** | In-memory only — `cart[]` array. Reset on page reload (unless `localStorage.pos_cart_reset_flag = 'true'` forces a wipe) |

---

## 2. Page Load Sequence

```
pos.html loads
  ↓
pos.js: initPos()
  ├── Checks localStorage: pos_cart_reset_flag
  │     If 'true' → wipe cart[], selectedCustomer = null
  │
  ├── setupEventListeners()
  │     ├── Wire #posSearchProduct → in-memory filter
  │     ├── Wire #posCustomerSearch → phone autocomplete + suggestions
  │     ├── Wire #posClearCustomer → clear selected customer
  │     ├── Wire #btnOpenAddCustomer → openGlobalAddCustomerModal()
  │     ├── Wire .pay-method-btn clicks → set currentPaymentMethod
  │     └── Wire #btnCompleteSale → openCollectModal()
  │
  ├── fetchProducts()
  │     supabase.from('products').select('*')
  │       .eq('company_id', companyId)
  │       .eq('branch_id', branchId)
  │     → filters: status === 'active'
  │     → renderProducts(liveProducts)
  │
  └── fetchCustomers()
        supabase.from('customers').select('*')
          .eq('company_id', companyId)
          .eq('branch_id', branchId)
        → stores in allCustomers[]
```

---

## 3. Left Panel — Product Catalogue

### 3.1 Product Search Bar

**Element:** `#posSearchProduct` (text input with search icon)

| Property | Detail |
|---|---|
| **Trigger** | `input` event (live, every keystroke) |
| **Filter logic** | `liveProducts.filter(p => name.includes(term) || category_name.includes(term))` |
| **Backend call** | **None** — in-memory filter against `liveProducts[]` |
| **Result** | `renderProducts(filtered)` — re-renders product grid with matching cards |
| **Clear search** | Render all `liveProducts[]` |

### 3.2 Product Card — "+ Add to Sale" Button

**Element:** `window.addToCart(productId)` button on each product card

| Condition | Display State |
|---|---|
| `stock_quantity > 0` | Blue "+ Add to Sale" button — enabled |
| `stock_quantity === 0` | Grey "Out of Stock" button — disabled, `cursor: not-allowed` |
| `stock_quantity <= 5 && > 0` | Orange "LOW: N left" badge in card header — still clickable |

| Step | Detail |
|---|---|
| **Click** | `window.addToCart(productId)` |
| **Backend call** | **None** — purely in-memory |
| **Logic** | Finds product in `liveProducts[]` by `product_id`; if already in `cart[]`, increments `quantity`; otherwise pushes new item `{ id, name, price, stock, quantity: 1, category_id, category_name }` |
| **Result** | `updateCartUI()` — re-renders entire cart panel |

> [!IMPORTANT] The price on the product card is **display-only**. When the sale is submitted, `create_pos_sale_atomic` queries `app.products.price` authoritatively on the server and **ignores the client-submitted price**. This is the price anti-tampering guard (Logic 3 in the Zero-Trust spec).

---

## 4. Right Panel — Current Sale (Cart)

### 4.1 Customer Phone Search Input

**Element:** `#posCustomerSearch` (phone/tel input with phone icon)

| Property | Detail |
|---|---|
| **Trigger** | `input` event (live) |
| **Filter logic** | Strips non-digits from input; matches against `allCustomers[]` phone numbers (digit-only comparison); shows up to 8 suggestions |
| **Backend call** | **None** — in-memory filter against `allCustomers[]` |
| **Clear button** | `#posClearCustomer` appears when input has content |

### 4.2 Customer Suggestion Dropdown

**Element:** `#posCustomerSuggestions` — dynamically populated div

| Event | Detail | Backend Call |
|---|---|---|
| **Input (phone digits)** | Shows matching customer list items with highlighted phone, avatar initials | None |
| **Click on suggestion item** | Sets `selectedCustomer` to full customer object; fills `#posCustomerName` and `#posCustomerPhone` read-only fields; hides dropdown | None |
| **Click outside dropdown** | Hides `#posCustomerSuggestions` | None |
| **No match found** | Shows "No customer found" empty state message | None |

### 4.3 "Clear" (✕) Button

**Element:** `#posClearCustomer` button

| Step | Detail | Backend Call |
|---|---|---|
| **Click** | Clears `#posCustomerSearch`, `#posCustomerName`, `#posCustomerPhone`; sets `selectedCustomer = null`; hides dropdown; re-focuses search | None |

### 4.4 "+ Add Customer" Button

**Element:** `#btnOpenAddCustomer` (small square button with "+" icon and "Add" label)
**RBAC gate:** `data-sub-feature="pos_create_customer"`

| Step | Detail | Backend Call |
|---|---|---|
| **Click** | Calls `window.openGlobalAddCustomerModal(callback)` | Opens the Global Add Customer Modal |
| **On modal submission** | Calls `create_customer_atomic` RPC (inside global modal) | `create_customer_atomic` |
| **Callback (after creation)** | `fetchCustomers()` refresh; auto-selects new customer; fills search + name + phone fields | `customers` table SELECT |
| **notifyEvent** | `window.notifyEvent('pos', 'evt_pos_customer_added', {...})` | None |

**Global Add Customer Modal** accepts: Name (required), Phone (required), Email (optional). Creates via RPC and returns the new customer object via callback.

### 4.5 Cart Item — Quantity "−" Button

**Element:** `onclick="updateQuantity('${item.id}', -1)"` on each cart item

| Step | Detail | Backend Call |
|---|---|---|
| **Click** | `window.updateQuantity(productId, -1)` |  |
| **Logic** | Decrements `cart[item].quantity`; if quantity reaches 0, splices item out of `cart[]` | None |
| **Result** | `updateCartUI()` — re-renders cart | None |

### 4.6 Cart Item — Quantity "+" Button

**Element:** `onclick="updateQuantity('${item.id}', 1)"` on each cart item

| Step | Detail | Backend Call |
|---|---|---|
| **Click** | `window.updateQuantity(productId, +1)` | None |
| **Logic** | Increments `cart[item].quantity` | None |
| **Result** | `updateCartUI()` | None |

> [!NOTE] The UI does **not** enforce a client-side stock ceiling on the "+" button. The stock enforcement happens exclusively on the server inside `create_pos_sale_atomic` (Logic 6 — Negative Stock Prevention). If a user adds more than available stock, the checkout RPC will reject the transaction.

### 4.7 Cart Item — "Remove" Link

**Element:** `onclick="removeFromCart('${item.id}')"` text button in each cart item

| Step | Detail | Backend Call |
|---|---|---|
| **Click** | `window.removeFromCart(productId)` | None |
| **Logic** | `cart = cart.filter(item => item.id != productId)` | None |
| **Result** | `updateCartUI()` | None |

### 4.8 "Collect" Button (Complete Sale)

**Element:** `#btnCompleteSale`
**RBAC gate:** `data-sub-feature="pos_checkout"`
**Initial state:** Disabled (`opacity: 0.6`, `cursor: not-allowed`) when cart is empty

| Step | Detail |
|---|---|
| **Button enabled** | Only when `cart.length > 0` (set by `updateCartUI()`) |
| **Click** | `openCollectModal()` |
| **Validation 1** | `cart.length === 0` → `showToast('Please add items to your cart first.', true)` |
| **Validation 2** | `customerName || customerPhone` is empty → `showToast('Please select or add a customer first.', true)` + red border on `#posCustomerSearch` |
| **On pass** | Builds sale context (shortDisplayId, saleGroupUUID, staffId/staffName from `appContext`, cart items) |
| **Opens** | `window.openGlobalPaymentModal({...})` — Global Payment Modal in `'pos'` mode |

**Data passed to Global Payment Modal:**
```js
{
  type: 'pos',
  saleId: <8-char random ID>,
  customerId: <UUID | null>,
  customerName: <string>,
  customerPhone: <string>,
  totalAmount: <sum of cart prices>,
  amountDue: <same as totalAmount>,
  serviceIds: [],   // empty for POS
  staffName: <from appContext>,
  items: [
    { name, category, staff, quantity, price, total }
  ],
  onComplete: async (payload) => finalizeSale(payload, saleGroupUUID)
}
```

---

## 5. Global Payment Modal (POS Flow)

**Modal:** Global Payment Modal (`scripts/global-payment-modal.js` / `scripts/global-payment-modal/`)
**Opened from:** `window.openGlobalPaymentModal(options)` when "Collect" is clicked

### 5.1 Payment Method Selection

**Elements:** `.pay-method-btn` buttons — Cash | Card | UPI

| Event | Detail | Backend Call |
|---|---|---|
| **Click payment method** | Sets active styling on selected button; updates `currentPaymentMethod` | None |

### 5.2 Discount / Coupon / Offer Application

The Global Payment Modal includes discount fields. The POS module passes discount info back via `payload.discounts` object in `onComplete` callback. Discount types resolved from payload:

| Field in payload.discounts | Discount type sent to RPC |
|---|---|
| `couponCode` present | `discountType = 'coupon'`, `discountName = couponCode`, `discountId = couponId` |
| `offerName` present | `discountType = 'offer'`, `discountName = offerName`, `discountId = offerId` |
| `membershipName` present | `discountType = 'membership'`, `discountName = membershipName`, `discountId = membershipId` |
| `manualValue > 0` | `discountType = 'manual'`, `discountName = 'X% off' or '₹X off'` |

> [!IMPORTANT] The client-computed `discountAmount` passed to the RPC is **overridden on the server**. The `create_pos_sale_atomic` procedure re-validates the coupon/offer code, checks expiry, minimum spend, usage limits, and recomputes the discount amount authoritatively. The client value is never trusted.

### 5.3 "Confirm Payment" Button → create_pos_sale_atomic

**Trigger:** User confirms in the Global Payment Modal → `payload.onComplete()` → `finalizeSale(payload, saleGroupUUID)`

**RPC call:**
```js
supabase.rpc('create_pos_sale_atomic', {
  p_company_id:     <string>,
  p_branch_id:      <string>,
  p_sale_id:        <UUID>,               // saleGroupUUID
  p_customer_id:    <UUID | null>,
  p_customer_name:  <string>,
  p_customer_phone: <string>,
  p_payment_method: <'cash'|'card'|'upi'>,
  p_staff_id:       <UUID | null>,        // from appContext
  p_staff_name:     <string>,
  p_items: [
    {
      product_id,
      product_name,
      category_id,
      category_name,
      quantity,
      price                              // display price — IGNORED by server
    }
  ],
  p_discount_type:   <'coupon'|'offer'|'membership'|'manual' | null>,
  p_discount_name:   <string | null>,
  p_discount_id:     <UUID | null>,
  p_discount_amount: <number>,           // hint only — server recomputes authoritatively
  p_final_amount:    <number>            // hint only — server recomputes authoritatively
})
```

**What `create_pos_sale_atomic` does (backend, all atomic):**
1. `shared.verify_tenant_access(p_company_id, p_branch_id)` — multi-tenant boundary check
2. Validates cart non-empty, `p_sale_id` is valid UUID, payment method is allowed
3. **Locks all product rows** `ORDER BY product_id FOR UPDATE` — deadlock prevention
4. Looks up **authoritative price** from `app.products` per product — ignores client price
5. Validates product status = 'active', correct branch assignment
6. Checks `stock_quantity >= requested_qty` per product — rejects if insufficient
7. Decrements `app.products.stock_quantity` for each item
8. Validates coupon/offer: active, date range, min spend, usage limits, computes authoritative discount
9. Computes authoritative `final_amount = gross - authoritative_discount`
10. Inserts line items into `app.sales` (one row per product × quantity)
11. Inserts header into `app.sales_for_business_transactions` (1 consolidated row)
12. Trigger `trg_pos_sale_business_transaction` → inserts into `app.business_transactions`
13. If discount > 0: inserts audit record into `app.discount_usages`
14. If customer present: `UPDATE app.customers SET total_spent += final_amount, last_visit = CURRENT_DATE`

**Returns:** `{ success, sale_id, total_price, final_amount, discount_amount, deducted_items[] }`

**On success:**
1. Checks `rpcResult.deducted_items` for items with `remaining_stock <= 5` → fires `window.notifyEvent('pos', 'evt_pos_low_stock', {...})` for each
2. `showToast('✓ Sale completed successfully!')`
3. `window.notifyEvent('pos', 'evt_pos_sale_completed', {...})`
4. `window.notifyCustomer('purchase', 'purchase_confirm', {...})` — customer notification
5. `window.notifyCustomer('purchase', 'payment_confirm', {...})`
6. `window.notifyCustomer('purchase', 'invoice_receipt', {...})`
7. Resets `cart = []`, `selectedCustomer = null`
8. Clears `#posCustomerSearch`, `#posCustomerName`, `#posCustomerPhone`
9. `updateCartUI()` — returns cart to empty state
10. `fetchProducts()` — refreshes product grid with updated stock counts

**On error:**
- `showToast('Failed to complete sale: ' + err.message, true)`
- Error is re-thrown so the Global Payment Modal remains open (doesn't auto-close)

---

## 6. POS Refund Flow (Sales History page)

**Note:** POS Refunds are NOT initiated from `pos.html`. They are accessed from the **Sales History** page (a separate module). The refund UI and logic lives in `scripts/sales-history/sales-refund.js`.

### 6.1 Refund Modal Open

**Trigger:** "Refund" button on a sale row in the Sales History page → `openRefundModal(sale)`

**On open — data loading:**
```
Parallel async:
  fetchCustomerById(sale.customer_id)
  → supabase.from('customers').select('*').eq('customer_id', customerId)
  → Updates customer name/phone/email display

  fetchOriginalTransaction(sale.id)
  → supabase.from('business_transactions').select('*').eq('reference_id', saleId)
  → Populates #rfOrigTxnRef

  supabase.from('discount_usages')
    .select('*').eq('reference_id', sale.id).eq('reference_type', 'pos').maybeSingle()
  → Sets salesState.currentDiscountUsage (for proportional discount reversal calculation)

  fetchSaleLineItems(sale.id)
  → supabase.from('sales').select('*').eq('sale_id', saleId)
  → Separates original lines (refund_reference_id IS NULL) from already-refunded lines
  → Computes remaining_refundable_qty per product (orig_qty - already_refunded_qty)
  → Sets salesState.currentRefundItems[]
  → renderRefundItems()
```

**Tables read on open:** `customers`, `business_transactions`, `discount_usages`, `sales`

### 6.2 Item Selection Checkboxes

**Element:** `.rf-item-cb` checkboxes (one per original sale line item)

| State | Rendering |
|---|---|
| Item has remaining refundable qty | Checkbox checked by default, enabled |
| Item fully refunded (`remaining_refundable_qty = 0`) | Checkbox disabled, row styled as greyed-out with "Fully Returned" label |

| Event | Detail | Backend Call |
|---|---|---|
| **Check/Uncheck** | `calculateRefundTotal()` — recomputes gross, proportional discount reversal, net refund amount | None |

### 6.3 Quantity Stepper (− / +)

**Elements:** `.rf-qty-btn.minus` and `.rf-qty-btn.plus` per item card

| Event | Detail | Backend Call |
|---|---|---|
| **"−" click** | Decrements return qty (min: 1); auto-checks the row if unchecked | None |
| **"+" click** | Increments return qty (max: `remaining_refundable_qty`); auto-checks the row | None |
| **Any change** | `calculateRefundTotal()` — recomputes amounts | None |

**`calculateRefundTotal()` logic:**
1. Sums `price × returnQty` for all checked items → `grossTotal`
2. Fetches original discount from `salesState.currentDiscountUsage` and sale data
3. Computes proportional discount reversal: `(grossTotal / origGross) * origDiscount`
4. Caps reversal at `remainingDiscount` (can't reverse more than what's left)
5. `netRefund = grossTotal - discountToReverse`
6. Updates `#rfAmountDisplay`, `#rfMaxRefundText`, discount breakdown card (`#rfDiscountBreakdown`)
7. Sets `#rfRefundTypeBadge` to "Full Amount", "Partial Refund", or "No Items"
8. Enables/disables `#confirmRefundBtn` based on whether any items selected

### 6.4 Refund Method / Reason / Note Fields

| Element | Detail | Backend Call |
|---|---|---|
| **`#rfMethodSelect`** | Refund method dropdown: Cash, Card, UPI, Bank Transfer; pre-fills with original payment method | None |
| **`#rfReasonSelect`** | Required reason dropdown: Customer Request, Service Dissatisfaction, Double Charge, Other, etc. | None |
| **`#rfNote`** | Optional free-text note field | None |
| **`#rfCustomerViewProfileBtn`** | Visible only if `sale.customer_id` present; click → `window.viewCustomerProfile(customerId)` | 2 RPCs (see Module 05) |

### 6.5 "Issue Refund" Button → process_pos_refund_atomic

**Element:** `#confirmRefundBtn`
**Initial state:** Disabled until at least one item is selected and gross > 0

**Validation (client-side):**
1. `rfReasonSelect.value` must not be empty → red border + toast if missing
2. At least one `.rf-item-cb:not(:disabled):checked` checkbox present

**RPC call (`executePosRefundAtomic` in `sales-api.js`):**
```js
supabase.rpc('process_pos_refund_atomic', {
  p_original_sale_id: <UUID>,        // the original sale group UUID
  p_refund_sale_id:   <new UUID>,    // fresh UUID for this refund transaction
  p_company_id:       <string>,
  p_branch_id:        <string>,
  p_customer_id:      <UUID | null>,
  p_customer_name:    <string>,
  p_customer_phone:   <string | null>,
  p_payment_method:   <'cash'|'card'|'upi'>,
  p_staff_id:         <UUID | null>,  // from appContext
  p_staff_name:       <string>,
  p_refund_reason:    <string>,       // "reason - note" combined
  p_items: [
    {
      item_id,       // original sales table row id
      product_id,
      product_name,
      category_id,
      return_qty,    // quantity to return
      price          // original unit price
    }
  ]
})
```

**What `process_pos_refund_atomic` does (backend, all atomic):**
1. `shared.verify_tenant_access(p_company_id, p_branch_id)` — boundary check
2. Locks original sale header in `sales_for_business_transactions WHERE sale_id = p_original_sale_id FOR UPDATE`
3. Validates original sale is `status = 'paid'` and belongs to correct tenant
4. Validates `p_refund_sale_id` is unique (deduplication guard — blocks double-refund)
5. For each item: locks original sale row `FOR UPDATE`, computes `max_refundable = orig_qty - already_refunded`, rejects if `return_qty > max_refundable`
6. Restores `app.products.stock_quantity += return_qty` for each returned product
7. Computes proportional discount reversal: `(total_returned_gross / orig_gross_total) * orig_discount`
8. Inserts `status = 'refunded'` rows into `app.sales`
9. Inserts refund header into `app.sales_for_business_transactions` with `payment_status = 'refunded'`
10. Trigger inserts refund entry into `app.business_transactions`
11. Updates `app.discount_usages`: sets `reversal_amount`, updates status to `'reversed'` or `'partially_reversed'`
12. If customer present: `UPDATE app.customers SET total_spent = GREATEST(0, total_spent - net_refund_payable)`

**Returns:** `{ success, original_sale_id, refund_reference_id, gross_returned, discount_reversed, total_refunded }`

**On success:**
1. `showToast('Successfully returned N item(s).', '#16a34a')`
2. `window.notifyEvent('payments', 'evt_payment_refunded', {...})`
3. `window.notifyCustomer('purchase', 'refund_confirm', {...})`
4. Closes refund modal
5. Calls `onRefundCompletedCallback()` → triggers sales table re-fetch
6. Hides "Refund" button in Sales Details modal if open

**On error:**
- `showToast('Failed to process return: ' + err.message, '#dc2626')`
- Button re-enabled with original label

### 6.6 Close / Cancel Refund Modal

| Element | Action | Backend Call |
|---|---|---|
| **`#cancelRefundBtn`** | `closeRefundModal()` — removes `active` class | None |
| **`#closeRefundBtn`** | Same | None |
| **Click outside overlay** | Same | None |

---

## 7. Branch Changed Event

**Event:** `window.addEventListener('branch:changed', ...)` in `initPos()`

| Step | Detail | Backend Call |
|---|---|---|
| **Branch switches** | Resets `cart = []`, `selectedCustomer = null`; `updateCartUI()`; `fetchProducts()`; `fetchCustomers()` | 2 Supabase reads: `products`, `customers` |

This ensures the product catalogue and customer search always reflect the active branch.

---

## 8. Error / Edge-Case Handling

| Scenario | Handling |
|---|---|
| `fetchProducts()` fails | Renders error state in grid with "Retry" button → `window.posRetryFetch()` → calls `fetchProducts()` |
| Product image URL broken | `img.onerror` fallback: replaces `<img>` with initials `<span>` |
| Cart empty on "Collect" click | `showToast('Please add items to your cart first.')` |
| No customer selected on "Collect" click | `showToast('Please select or add a customer first.')` + red border on search input |
| `create_pos_sale_atomic` fails (stock, tenant, price) | `showToast('Failed to complete sale: ' + err.message)` + error re-thrown (payment modal stays open) |
| Low stock after sale (`remaining_stock <= 5`) | `window.notifyEvent('pos', 'evt_pos_low_stock', {...})` for each affected product |
| `process_pos_refund_atomic` fails | `showToast('Failed to process return: ...')` + button re-enabled |
| Duplicate refund attempt | Blocked by RPC: `'This refund reference has already been used'` → surfaces as toast |

---

## 9. RBAC & Plan Gates

| Sub-Feature Key | Elements Protected | Missing Permission Behavior |
|---|---|---|
| `pos_checkout` | `#btnCompleteSale` "Collect" button | Hidden or disabled |
| `pos_create_customer` | `#btnOpenAddCustomer` "Add Customer" button | Hidden or disabled |

Gates enforced by `sub-feature-gate.js` via `data-sub-feature` attributes. Auth guard (`global-auth-guard.js`) checks subscription → plan → RBAC on page load.

---

## 10. Tables & Views Touched

| Table/View | Schema | Operations | Triggered by |
|---|---|---|---|
| `products` | `app` / `public` | SELECT (page load, post-sale refresh) | `fetchProducts()` |
| `products` | `app` | UPDATE stock_quantity (via RPC) | `create_pos_sale_atomic`, `process_pos_refund_atomic` |
| `customers` | `app` / `public` | SELECT (page load, post-customer-add) | `fetchCustomers()`, refund modal |
| `customers` | `app` | INSERT (via RPC) | `create_customer_atomic` (Add Customer flow) |
| `customers` | `app` | UPDATE total_spent, last_visit (via RPC) | `create_pos_sale_atomic`, `process_pos_refund_atomic` |
| `sales` | `app` | INSERT (via RPC) | `create_pos_sale_atomic` |
| `sales` | `app` | SELECT | Refund modal — `fetchSaleLineItems()` |
| `sales` | `app` | INSERT refunded rows (via RPC) | `process_pos_refund_atomic` |
| `sales_for_business_transactions` | `app` | INSERT (via RPC) | `create_pos_sale_atomic` |
| `sales_for_business_transactions` | `app` | INSERT refund row (via RPC) | `process_pos_refund_atomic` |
| `business_transactions` | `app` | INSERT (via trigger `trg_pos_sale_business_transaction`) | `create_pos_sale_atomic`, `process_pos_refund_atomic` |
| `discount_usages` | `app` | INSERT (if discount applied, via RPC) | `create_pos_sale_atomic` |
| `discount_usages` | `app` | SELECT | Refund modal — discount reversal calculation |
| `discount_usages` | `app` | UPDATE reversal_amount/status (via RPC) | `process_pos_refund_atomic` |
| `coupons` | `app` | SELECT (server-side validation, via RPC) | `create_pos_sale_atomic` |
| `offers` | `app` | SELECT (server-side validation, via RPC) | `create_pos_sale_atomic` |

---

## 11. All RPCs Called

| RPC Name | Called From | Purpose |
|---|---|---|
| `create_pos_sale_atomic` | `pos.js` → `finalizeSale()` | Complete POS sale — locks stock, validates pricing, records all tables atomically |
| `process_pos_refund_atomic` | `scripts/sales-history/sales-refund.js` → `processRefund()` | Process partial/full item return — restores stock, records refund, updates customer LTV |
| `create_customer_atomic` | `pos.js` → via `window.openGlobalAddCustomerModal()` callback | Create new customer inline from POS |

---

## 12. Backend Security — Zero-Trust Architecture

> [!IMPORTANT] The POS module has been fully hardened to Zero-Trust / backend-authoritative architecture. All 18 security/business logics are verified as passing.

| Logic | Description | Status |
|---|---|---|
| L1 | Multi-tenant boundary verification | ✅ `shared.verify_tenant_access()` |
| L2 | Cart non-empty + input sanitisation | ✅ Server-side `jsonb_array_length > 0` |
| L3 | Authoritative catalog price lookup | ✅ Client price completely ignored |
| L4 | Product active status + branch assignment | ✅ Server-side `status = 'active'` check |
| L5 | Deterministic row-level `FOR UPDATE` locking | ✅ `ORDER BY product_id FOR UPDATE` |
| L6 | Negative stock prevention | ✅ `v_current_stock >= v_required_qty` guard |
| L7 | Line item insertion (`app.sales`) | ✅ Atomic insert per line |
| L8 | Consolidated header insertion (`app.sales_for_business_transactions`) | ✅ |
| L9 | Financial ledger sync (`app.business_transactions`) | ✅ Via hardened trigger |
| L10 | Server-side coupon & offer validation | ✅ Expiry, min spend, usage limits re-validated |
| L11 | Discount usage audit log | ✅ `app.discount_usages` insert |
| L12 | Refund tenant boundary + original sale lock | ✅ `FOR UPDATE` on header |
| L13 | Refund reference deduplication | ✅ Blocks duplicate `p_refund_sale_id` |
| L14 | Per-item returnable quantity guard | ✅ `orig_qty - already_refunded >= return_qty` |
| L15 | Concurrency-safe stock re-increment | ✅ `FOR UPDATE` per product on return |
| L16 | Proportional discount reversal math | ✅ `(gross_return / total_gross) * orig_discount` |
| L17 | Refund ledger + discount usage state reversal | ✅ |
| L18 | Customer LTV sync on sale & refund | ✅ `total_spent` incremented/decremented |

**Security model:** Both `create_pos_sale_atomic` and `process_pos_refund_atomic` are `SECURITY DEFINER` functions in the `app` schema, with `search_path = platform, shared, app, public, pg_temp`. Public PostgREST wrappers delegate to the app-schema functions. Zero direct client `.insert()`, `.update()`, or `.delete()` calls on POS tables.

