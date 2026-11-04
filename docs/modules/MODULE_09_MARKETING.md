# Module 09 — Marketing (Coupons & Offers): End-to-End Interaction & Architecture Specification

> **Module Identity**: Marketing Promotions, Coupon Codes, Auto-Applied Offers & Discount Governance  
> **Route / Files**: `coupons.html`, `scripts/coupons.js`, `offers.html`, `scripts/offers.js`  
> **Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First Standard  
> **Database Schemas**: `app` (Storage & Logic), `public` (API Interface Layer), `shared` (Tenant Context & Row-Level Security), `platform` (SaaS Subscriptions)

---

## 1. Module Overview & Architectural Principles

Module 09 manages the promotional discount engine of the salon SaaS:
1. **Coupons (`app.coupons`)**: Code-based promotional discounts (`WELCOME10`, `SUMMER20`) entered manually by customers or cashiers during booking or POS checkout.
2. **Offers (`app.offers`)**: Promotional discounts available to customers with defined validity windows, scope restrictions, and minimum spend requirements.
3. **Discount Governance & Audit (`app.discount_usages`)**: Transactional tracking of all redeemed discounts across bookings and POS receipts, preventing coupon abuse and enforcing redemption limits.

### Hardening Standards & Zero-Trust Backend Enforcement
* **Zero Client Direct Table Mutations**: Direct `.insert()`, `.update()`, and `.delete()` queries against `app.coupons` and `app.offers` are completely eliminated.
* **Authoritative Discount Validation**: Calculation of discount deductions, minimum spend assertions, date validity, and usage limits are verified in PostgreSQL (`app.validate_discount_code`), eliminating client-side price manipulation.
* **Code Normalization & Collision Prevention**: Coupon codes are automatically trimmed, converted to uppercase, and checked for uniqueness within the branch/company tenant partition.
* **Audit Trail Preservation via Soft Deletion**: Deleting a coupon or offer sets `status = 'deleted'` and `updated_at = NOW()`. Past financial receipts and POS sales rows in `app.sales` retain referential integrity.
* **Granular Scope Enforcement**: Boolean flags (`all_services`, `all_products`, `all_memberships`) restrict discounts to eligible cart line items.

---

## 2. Global Tenant Context & Security Pre-Flight

Every procedure in Module 09 enforces tenant isolation as its first instruction:
```sql
IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
END IF;
```

Client runtime context resolution:
* `p_company_id`: `getCompanyId()` resolves from `appContext.company.id` or `localStorage.getItem('company_id')`.
* `p_branch_id`: `getBranchId()` resolves from `localStorage.getItem('active_branch_id')` or `document.getElementById('branchSelect')?.value`.

Direct client mutations on `app.coupons`, `app.offers`, and `app.discount_usages` are revoked. All write operations execute as `SECURITY DEFINER` through `public.*_atomic` stored procedures.

---

## 3. Coupons Management (`coupons.html` & `scripts/coupons.js`)

```
+-------------------------------------------------------------------------------------------------------------+
| Coupons                                                                                                     |
| Manage coupon codes customers can apply during booking                                                      |
|                                                                                                             |
| [ Search coupon...          ]   [ Filter v ]   [ + Create Coupon ]                                          |
+-------------------------------------------------------------------------------------------------------------+
```

### 3.1 Header Controls & Search

#### 3.1.1 Coupon Search Input
* **Element Identity**: `<input type="text" id="couponsSearchInput" placeholder="Search coupon...">`
* **Event**: `input`
* **Behavior**: Real-time client-side substring filter on `currentCoupons` by `coupon_code`:
  ```javascript
  const q = (document.getElementById('couponsSearchInput')?.value || '').toLowerCase().trim();
  if (q) list = list.filter(c => (c.coupon_code || '').toLowerCase().includes(q));
  renderCoupons();
  ```

#### 3.1.2 Coupon Filter Panel
* **Trigger Button**: `<button id="btnFilterCoupons" class="btn btn-secondary">`
* **Filter Panel Container**: `<div id="cpnFilterPanel">`
* **Interactive Elements**:
  * Checkboxes: `<input type="checkbox" name="filterDiscountType" value="percentage">` and `value="flat"`.
  * **Reset Button** (`#btnCpnFilterReset`): Unchecks all filter inputs and calls `renderCoupons()`.
  * **Apply Button** (`#btnCpnFilterApply`): Hides panel and renders filtered table.
  * **Close Button** (`#btnCloseCpnFilter`): Hides panel.
* **Auto-Filter on Change**: Toggling checkboxes immediately calls `renderCoupons()`.

#### 3.1.3 "Create Coupon" Button
* **Element Identity**: `<button class="qa-btn qa-primary" id="btnCreateCoupon" data-sub-feature="create_coupon">`
* **RBAC Gate**: `data-sub-feature="create_coupon"`.
* **Behavior**: Calls `openCreateModal()`:
  * Resets modal form fields.
  * Enables code input (`#cpnCode.readOnly = false`).
  * Updates modal title to `"Create Coupon"` and button to `"Create Coupon"`.
  * Displays modal (`#couponModalOverlay.classList.add('active')`).

---

### 3.2 Coupons Table (`#couponsTableBody`)

Columns: `Coupon Code`, `Discount`, `Discount Type`, `Applicable To`, `Validity`, `Actions`.

```
+-------------------------------------------------------------------------------------------------------------+
| Coupon Code | Discount   | Discount Type | Applicable To                   | Validity           | Actions   |
+-------------+------------+---------------+---------------------------------+--------------------+-----------+
| WELCOME10   | 10% OFF    | Percentage    | [Services] [Products]           | Always Active      | [Edit][Del|
| FLAT200     | ₹200 OFF   | Flat          | [Services]                      | 01/11/26 – 30/11/26| [Edit][Del|
+-------------------------------------------------------------------------------------------------------------+
```

#### 3.2.1 Data Elements & Badges
* **Coupon Code**: Formatted in a monospace code pill: `<span class="cpn-code-badge">WELCOME10</span>`.
* **Discount Display**:
  * Flat: Green pill (`#dcfce7`, text `#15803d`): `₹[Value] OFF`.
  * Percentage: Blue pill (`#e0f2fe`, text `#0284c7`): `[Value]% OFF`.
* **Applicable To Chips (`buildApplicableToDisplay`)**:
  * `all_services = true`: Sky blue chip `Services` (`#e0f2fe`, text `#0284c7`).
  * `all_products = true`: Green chip `Products` (`#dcfce7`, text `#15803d`).
  * `all_memberships = true`: Purple chip `Memberships` (`#faf5ff`, text `#7c3aed`).
  * If none selected: Gray chip `None`.
* **Validity Display**:
  * If dates configured: `[Start Date] – [End Date]` formatted locally.
  * If open-ended: `Always Active`.

#### 3.2.2 Row Action Buttons
1. **Edit Coupon Button**:
   * Selector: `<button class="hover-lift edit-btn" data-sub-feature="update_coupon" onclick="window.editCoupon('${couponId}')">`
   * Opens `#couponModalOverlay` pre-populated with coupon details.
   * Locks `#cpnCode` as read-only (`cursor: not-allowed`, background `#f1f5f9`).
2. **Delete Coupon Button**:
   * Selector: `<button class="hover-lift delete-btn" data-sub-feature="delete_coupon" onclick="window.deleteCoupon('${couponId}')">`
   * Sets `couponToDelete = id` and opens `#deleteCouponConfirmOverlay`.

---

### 3.3 Coupon Modals & Database Mutations

#### 3.3.1 Create / Edit Coupon Modal (`#couponModalOverlay`)

```
+-------------------------------------------------------------------------------------------------------------+
| Create Coupon                                                                                           [X] |
| Set up a new coupon code for your customers                                                                 |
+-------------------------------------------------------------------------------------------------------------+
| LEFT COLUMN                                  | RIGHT COLUMN                                                 |
| Coupon Code * [ WELCOME10                  ] | Start Date [ YYYY-MM-DD ]  End Date [ YYYY-MM-DD ]           |
| Customers enter this at checkout             |                                                              |
|                                              | Minimum Bill Amount (optional) [ 500                       ] |
| Discount Type *        Discount Value *      |                                                              |
| [ Percentage (%)   v ] [ 10                ] |                                                              |
|                                              |                                                              |
| Applicable To                                |                                                              |
| [ [x] Services ] [ [x] Products ] [ [ ] Memb ] |                                                            |
+-------------------------------------------------------------------------------------------------------------+
|                                                                       [ Cancel ] [ Create Coupon ]          |
+-------------------------------------------------------------------------------------------------------------+
```

#### Form Controls & Interaction Logic:
* **Coupon Code Input (`#cpnCode`)**: Automatically converts typed characters to uppercase:
  ```javascript
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); });
  ```
* **Discount Type (`#cpnDiscountType`) & Value (`#cpnDiscountValue`)**:
  * Types: `percentage` (placeholder `e.g. 10`) or `flat` (placeholder `e.g. 100`).
* **Applicable To Checkboxes**:
  * `#cpnAppToServices`, `#cpnAppToProducts`, `#cpnAppToMemberships`.
  * Toggling dynamically updates visual background (`#eef2ff` with indigo border when checked).
* **Validity Dates (`#cpnStartDate`, `#cpnEndDate`)**: Date pickers.
* **Minimum Bill Amount (`#cpnMinBooking`)**: Minimum order spend before coupon applies.

#### Form Submission & Procedure Execution:
* **Trigger Button**: `<button id="btnSaveCoupon">`
* **Validation Guards**:
  * Asserts Code, Discount Type, and Discount Value are filled.
  * In create mode, checks for duplicate code in `currentCoupons`.
* **Database RPCs**:
  * **Create Mode**: Calls `public.create_coupon_atomic`:
    ```javascript
    const { error } = await supabase.rpc('create_coupon_atomic', {
        p_company_id:      getCompanyId(),
        p_branch_id:       getBranchId(),
        p_coupon_code:     coupon_code,
        p_discount_type:   discount_type,
        p_discount_value:  parseFloat(discount_value),
        p_min_bill_amount: minBillAmount,
        p_valid_from:      startDate,
        p_valid_to:        endDate,
        p_all_services:    all_services,
        p_all_products:    all_products,
        p_all_memberships: all_memberships
    });
    ```
  * **Edit Mode**: Calls `public.update_coupon_atomic`:
    ```javascript
    const { error } = await supabase.rpc('update_coupon_atomic', {
        p_company_id:      getCompanyId(),
        p_branch_id:       getBranchId(),
        p_coupon_id:       currentEditId,
        p_coupon_code:     coupon_code,
        p_discount_type:   discount_type,
        p_discount_value:  parseFloat(discount_value),
        p_min_bill_amount: minBillAmount,
        p_valid_from:      startDate,
        p_valid_to:        endDate,
        p_status:          'active',
        p_all_services:    all_services,
        p_all_products:    all_products,
        p_all_memberships: all_memberships
    });
    ```
* **Backend Validation Logic (`app.create_coupon_atomic`)**:
  1. Enforces tenant check (`shared.verify_tenant_access`).
  2. Normalizes `coupon_code` (`UPPER(TRIM(p_coupon_code))`) and validates non-empty.
  3. Rejects code duplicate within branch/company (`A coupon with code "%" already exists.`).
  4. Validates discount type (`percentage` or `fixed`).
  5. Asserts discount value $> 0$; if percentage, asserts $\le 100$.
  6. Asserts date bounds: `valid_from <= valid_to`.
  7. Inserts into `app.coupons` with twin UUIDs (`coupon_id` and `id`).
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Coupon created successfully"` or `"Coupon updated successfully"`.
  * Emits notification `evt_marketing_coupon`: `"Coupon [Code] was created/updated."`
  * Closes modal and calls `loadCoupons()`.

---

#### 3.3.2 Delete Coupon Confirmation Modal (`#deleteCouponConfirmOverlay`)
* **Modal Trigger**: `window.deleteCoupon(id)`
* **Cancel Button**: `#btnCancelDeleteCoupon` (closes modal).
* **Confirm Button**: `#btnConfirmDeleteCoupon`.
* **Execution Flow**:
  1. Displays full-screen loading spinner `#deletingCouponOverlay`.
  2. Invokes authoritative procedure `public.delete_coupon_atomic`:
     ```javascript
     const { error } = await supabase.rpc('delete_coupon_atomic', {
         p_company_id: getCompanyId(),
         p_branch_id:  getBranchId(),
         p_coupon_id:  id
     });
     ```
* **Backend Execution Logic (`app.delete_coupon_atomic`)**:
  1. Enforces tenant verification.
  2. Confirms coupon exists and is not already deleted.
  3. Soft-deletes: `UPDATE app.coupons SET status = 'deleted', updated_at = NOW()`.
  4. Preserves past transaction history in `app.discount_usages` and `app.sales`.
* **Post-Delete UI Lifecycle**:
  * Hides `#deletingCouponOverlay`.
  * Shows toast: `"Coupon deleted successfully"`.
  * Emits event notification `evt_marketing_coupon`.
  * Reloads table via `loadCoupons()`.

---

## 4. Offers Management (`offers.html` & `scripts/offers.js`)

```
+-------------------------------------------------------------------------------------------------------------+
| Offers                                                                                                      |
| Manage promotional discounts for your customers                                                             |
|                                                                                                             |
| [ Search offer...           ]   [ Filter v ]   [ + Create Offer ]                                           |
+-------------------------------------------------------------------------------------------------------------+
```

### 4.1 Header Controls & Search

#### 4.1.1 Offer Search Input
* **Element Identity**: `<input type="text" id="offersSearchInput" placeholder="Search offer...">`
* **Event**: `input`
* **Behavior**: Substring search on `currentOffers` by `offer_name`.

#### 4.1.2 Offer Filter Panel
* **Trigger Button**: `<button id="btnFilterOffers" class="btn btn-secondary">`
* **Filter Panel**: `<div id="offersFilterPanel">`
* **Checkboxes**: `percentage` and `flat`.
* **Actions**: Reset (`#btnOffersFilterReset`), Apply (`#btnOffersFilterApply`), Close (`#btnCloseOffersFilter`).

#### 4.1.3 "Create Offer" Button
* **Element Identity**: `<button class="qa-btn qa-primary" id="btnCreateOffer" data-sub-feature="create_offer">`
* **RBAC Gate**: `data-sub-feature="create_offer"`.
* **Behavior**: Calls `openCreateModal()`:
  * Resets modal form fields.
  * Sets modal title to `"Create Offer"` and button to `"Create Offer"`.
  * Displays modal (`#offerModalOverlay.classList.add('active')`).

---

### 4.2 Offers Table (`#offersTableBody`)

Columns: `Offer Name`, `Discount`, `Discount Type`, `Applicable To`, `Validity`, `Actions`.

```
+-------------------------------------------------------------------------------------------------------------+
| Offer Name       | Discount   | Discount Type | Applicable To                   | Validity         | Actions|
+------------------+------------+---------------+---------------------------------+------------------+--------+
| Summer Glow Sale | 20% OFF    | Percentage    | [Services] [Products]           | 01/06/26–30/06/26| [Edit] |
| Diwali Special   | ₹500 OFF   | Flat          | [Services]                      | 10/11/26–15/11/26| [Del]  |
+-------------------------------------------------------------------------------------------------------------+
```

#### 4.2.1 Row Action Buttons
1. **Edit Offer Button**:
   * Selector: `<button class="hover-lift edit-btn" data-sub-feature="update_offer" onclick="window.editOffer('${offerId}')">`
   * Opens `#offerModalOverlay` pre-populated with offer attributes.
2. **Delete Offer Button**:
   * Selector: `<button class="hover-lift delete-btn" data-sub-feature="delete_offer" onclick="window.deleteOffer('${offerId}')">`
   * Sets `offerToDelete = id` and opens `#deleteOfferConfirmOverlay`.

---

### 4.3 Offer Modals & Database Mutations

#### 4.3.1 Create / Edit Offer Modal (`#offerModalOverlay`)

```
+-------------------------------------------------------------------------------------------------------------+
| Create Offer                                                                                            [X] |
| Set up a new promotional discount.                                                                          |
+-------------------------------------------------------------------------------------------------------------+
| LEFT COLUMN                                  | RIGHT COLUMN                                                 |
| Offer Name * [ Summer Glow Offer           ] | Start Date * [ YYYY-MM-DD ]  End Date [ YYYY-MM-DD ]        |
|                                              |                                                              |
| Discount Type *        Discount Value *      | Minimum Bill Amount (Optional) [ 1000                      ] |
| [ Percentage (%)   v ] [ 20                ] |                                                              |
|                                              |                                                              |
| Applicable To                                |                                                              |
| [ [x] Services ] [ [x] Products ] [ [ ] Memb ] |                                                            |
+-------------------------------------------------------------------------------------------------------------+
|                                                                        [ Cancel ] [ Create Offer ]          |
+-------------------------------------------------------------------------------------------------------------+
```

#### Form Controls:
* **Offer Name Input (`#offerName`)**: E.g., `"Summer Glow Offer"`.
* **Discount Type (`#offerDiscountType`) & Value (`#offerDiscountValue`)**: Percentage or Flat Amount.
* **Applicable To Checkboxes**: `#offerAppToServices`, `#offerAppToProducts`, `#offerAppToMemberships`.
* **Validity Dates**: `#offerStartDate` (required), `#offerEndDate` (optional).
* **Minimum Bill Amount (`#offerMinBillAmount`)**: Optional minimum spend threshold.

#### Form Submission & Procedure Execution:
* **Trigger Button**: `<button id="btnSaveOffer">`
* **Client Validation**: Rejects empty name, type, or value; duplicate check on create.
* **Database RPCs**:
  * **Create Mode**: Calls `public.create_offer_atomic`:
    ```javascript
    const { error } = await supabase.rpc('create_offer_atomic', {
        p_company_id:      getCompanyId(),
        p_branch_id:       getBranchId(),
        p_offer_name:      offer_name,
        p_discount_type:   discount_type,
        p_discount_value:  parseFloat(discount_value),
        p_min_bill_amount: minBillAmount,
        p_valid_from:      startDate,
        p_valid_to:        endDate,
        p_all_services:    all_services,
        p_all_products:    all_products,
        p_all_memberships: all_memberships
    });
    ```
  * **Edit Mode**: Calls `public.update_offer_atomic`:
    ```javascript
    const { error } = await supabase.rpc('update_offer_atomic', {
        p_company_id:      getCompanyId(),
        p_branch_id:       getBranchId(),
        p_offer_id:        currentEditId,
        p_offer_name:      offer_name,
        p_discount_type:   discount_type,
        p_discount_value:  parseFloat(discount_value),
        p_min_bill_amount: minBillAmount,
        p_valid_from:      startDate,
        p_valid_to:        endDate,
        p_status:          'active',
        p_all_services:    all_services,
        p_all_products:    all_products,
        p_all_memberships: all_memberships
    });
    ```
* **Backend Execution Logic (`app.create_offer_atomic`)**:
  1. Enforces tenant check (`shared.verify_tenant_access`).
  2. Asserts non-empty offer name.
  3. Rejects duplicate offer name within tenant (`An offer with name "%" already exists.`).
  4. Validates discount magnitude ($> 0$; percentage $\le 100$).
  5. Asserts date bounds: `p_valid_from <= p_valid_to`.
  6. Inserts into `app.offers` with twin UUIDs (`offer_id` and `id`).
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Offer created successfully"` or `"Offer updated successfully"`.
  * Emits staff event notification `evt_marketing_offer`.
  * On create, emits customer marketing notifications:
    * `new_offer`: `"Check out our new offer: [Name]"`
    * `new_discount`: `"Save more with our latest discount: [Name]"`
  * Closes modal and calls `loadOffers()`.

---

#### 4.3.2 Delete Offer Confirmation Modal (`#deleteOfferConfirmOverlay`)
* **Modal Trigger**: `window.deleteOffer(id)`
* **Cancel Button**: `#btnCancelDeleteOffer` (closes modal).
* **Confirm Button**: `#btnConfirmDeleteOffer`.
* **Execution Flow**:
  1. Displays full-screen loading spinner `#deletingOfferOverlay`.
  2. Invokes authoritative procedure `public.delete_offer_atomic`:
     ```javascript
     const { error } = await supabase.rpc('delete_offer_atomic', {
         p_company_id: getCompanyId(),
         p_branch_id:  getBranchId(),
         p_offer_id:   id
     });
     ```
* **Backend Execution Logic (`app.delete_offer_atomic`)**:
  1. Enforces tenant verification.
  2. Soft-deletes: `UPDATE app.offers SET status = 'deleted', updated_at = NOW()`.
  3. Preserves past receipt references in `app.sales`.
* **Post-Delete UI Lifecycle**:
  * Hides `#deletingOfferOverlay`.
  * Shows toast: `"Offer deleted successfully"`.
  * Emits event notification `evt_marketing_offer`.
  * Reloads table via `loadOffers()`.

---

## 5. Authoritative Discount Validation Routine (`app.validate_discount_code`)

When a customer or cashier enters a coupon code at POS checkout or online booking, the client invokes `public.validate_discount_code`:

```sql
FUNCTION app.validate_discount_code(
    p_company_id       uuid,
    p_branch_id        uuid,
    p_code             text,
    p_bill_amount      numeric DEFAULT 0,
    p_customer_id      uuid DEFAULT NULL,
    p_applicable_type  text DEFAULT 'service'
) RETURNS jsonb
```

### Validation Engine Checklist:
1. **Tenant Isolation**: Verifies caller access to `p_company_id` and `p_branch_id`.
2. **Code Normalization**: Normalizes input to `UPPER(TRIM(p_code))`.
3. **Active Status Lookup**: Looks up active record in `app.coupons`. Returns `valid: false, reason: 'Invalid or inactive coupon code.'` if not found.
4. **Activation Window Check**:
   * If `valid_from > CURRENT_DATE`: returns `'Coupon is not yet active.'`.
   * If `valid_to < CURRENT_DATE`: returns `'Coupon has expired.'`.
5. **Minimum Spend Assertion**:
   * If `p_bill_amount < min_bill_amount`: returns `'Minimum bill amount of ₹X required.'`.
6. **Cart Scope / Line Item Eligibility**:
   * Checks `p_applicable_type` (`service`, `product`, `membership`) against `all_services`, `all_products`, and `all_memberships`.
7. **Redemption Limits**:
   * Total Usage Limit: Counts records in `app.discount_usages` (`status = 'applied'`). If count $\ge$ `total_usage_limit`, returns `'Coupon total usage limit reached.'`.
   * Customer Limit: Counts records for `p_customer_id`. If count $\ge$ `usage_per_customer`, returns `'You have already reached the maximum usage limit for this coupon.'`.
8. **Mathematical Deduction Computation**:
   * If percentage: `discount_amount := ROUND((p_bill_amount * discount_value / 100.0), 2)`.
   * If fixed: `discount_amount := LEAST(discount_value, p_bill_amount)`.
9. **Return Payload**:
   ```json
   {
       "valid": true,
       "discount_id": "uuid",
       "discount_name": "WELCOME10",
       "discount_type": "percentage",
       "discount_value": 10,
       "discount_amount": 150.00
   }
   ```

---

## 6. Complete End-to-End Element & Interaction Catalog

| Element Selector / Event | UI Location | User Action | Frontend Handler | Target RPC / Query | Affected Tables | Guards & Validation |
|---|---|---|---|---|---|---|
| `#couponsSearchInput` (input) | Coupons Header | Searches coupons | Substring filter | None (client filter) | None | Matches `coupon_code` substring |
| `#btnFilterCoupons` (click) | Coupons Header | Toggles filter panel | Click listener | None | None | Toggles `#cpnFilterPanel` display |
| `input[name="filterDiscountType"]` (change) | Coupons Filter | Filters discount type | Change listener | `renderCoupons()` | None | Filters by `percentage` or `flat` |
| `#btnCpnFilterReset` (click) | Coupons Filter | Resets filter | Click listener | `renderCoupons()` | None | Clears checkboxes, re-renders table |
| `#btnCpnFilterApply` (click) | Coupons Filter | Applies filter | Click listener | `renderCoupons()` | None | Hides panel, re-renders table |
| `#btnCreateCoupon` (click) | Coupons Header | Clicks "Create Coupon" | `openCreateModal()` | None | None | Resets form, enables code input, opens modal |
| `#cpnCode` (input) | Coupon Modal | Types code | Auto-uppercase listener | None | None | Automatically converts code to uppercase |
| `#cpnDiscountType` (change) | Coupon Modal | Changes discount type | Change listener | None | None | Updates `#cpnDiscountValue` placeholder |
| `#cpnAppToServices` / `Products` / `Memberships` (change) | Coupon Modal | Toggles applicability | Change listener | `updateApplicableToVisuals()` | None | Updates background and border styling |
| `#btnSaveCoupon` (click) | Coupon Modal | Submits coupon | `handleSaveCoupon()` | `public.create_coupon_atomic` OR `public.update_coupon_atomic` | `app.coupons` | Normalizes uppercase code, unique check, validates percentage $\le 100$ |
| `#closeCouponModal` / `#btnCancelCoupon` (click) | Coupon Modal | Closes modal | `closeModal()` | None | None | Hides `#couponModalOverlay` |
| `button[data-sub-feature="update_coupon"]` (click) | Coupons Table | Clicks "Edit" | `window.editCoupon(id)` | None | None | Populates form, locks `#cpnCode` read-only, opens modal |
| `button[data-sub-feature="delete_coupon"]` (click) | Coupons Table | Clicks "Delete" | `window.deleteCoupon(id)` | None | None | Sets `couponToDelete`, opens confirm overlay |
| `#btnConfirmDeleteCoupon` (click) | Delete Coupon Modal | Confirms deletion | `executeDeleteCoupon(id)` | `public.delete_coupon_atomic` | `app.coupons` | Soft-deletes record (`status = 'deleted'`) |
| `#offersSearchInput` (input) | Offers Header | Searches offers | Substring filter | None (client filter) | None | Matches `offer_name` substring |
| `#btnFilterOffers` (click) | Offers Header | Toggles filter panel | Click listener | None | None | Toggles `#offersFilterPanel` display |
| `#btnCreateOffer` (click) | Offers Header | Clicks "Create Offer" | `openCreateModal()` | None | None | Resets form, opens `#offerModalOverlay` |
| `#btnSaveOffer` (click) | Offer Modal | Submits offer | `handleSaveOffer()` | `public.create_offer_atomic` OR `public.update_offer_atomic` | `app.offers` | Validates name uniqueness, date bounds, percentage $\le 100$ |
| `button[data-sub-feature="update_offer"]` (click) | Offers Table | Clicks "Edit" | `window.editOffer(id)` | None | None | Populates form, opens modal in edit mode |
| `button[data-sub-feature="delete_offer"]` (click) | Offers Table | Clicks "Delete" | `window.deleteOffer(id)` | None | None | Sets `offerToDelete`, opens confirm overlay |
| `#btnConfirmDeleteOffer` (click) | Delete Offer Modal | Confirms deletion | `executeDeleteOffer(id)` | `public.delete_offer_atomic` | `app.offers` | Soft-deletes record (`status = 'deleted'`) |

---

## 7. Security, RLS & Verification Checklist

- [x] **Zero Direct Table Mutations**: No client `.insert()`, `.update()`, or `.delete()` queries against `app.coupons` or `app.offers`.
- [x] **Strict Tenant Context**: `shared.verify_tenant_access(p_company_id, p_branch_id)` enforced across all procedures.
- [x] **Authoritative Discount Validation**: Calculation of deductions and usage eligibility enforced via `app.validate_discount_code`.
- [x] **Uppercase Code Normalization**: Coupon codes automatically converted to uppercase and deduplicated within the tenant.
- [x] **Percentage Sanity**: Percentage discounts strictly bounded between $0.01\%$ and $100\%$.
- [x] **Audit Trail Preservation**: Deletions are soft-deletes (`status = 'deleted'`), preserving historical sales records and financial reports.

