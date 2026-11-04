# MODULE 05 — CUSTOMERS & CRM

**Page**: `customers.html`  
**Entry Scripts**: `customers.js`, `scripts/customers/customers-ui.js`, `scripts/global-customer-modal.js`, `scripts/global-customer-profile-modal.js`, `scripts/review-modal.js`  
**Architecture**: Zero-Trust Frontend / Authoritative Backend  
**Migration**: `supabase/migrations/20261103000011_harden_customers_module.sql` ✅ DEPLOYED  
**Audit Status**: 100% Complete — 13/13 integration tests PASSED  
**Last Updated**: 2026-11-04

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Page Load Sequence](#2-page-load-sequence)
3. [Global State & Context](#3-global-state--context)
4. [Header Controls & Actions](#4-header-controls--actions)
   - [4.1 Customer Search Input](#41-customer-search-input)
   - [4.2 Filter Dropdown](#42-filter-dropdown)
   - [4.3 Download Customers Button (Excel Export)](#43-download-customers-button-excel-export)
   - [4.4 Add Customer Button](#44-add-customer-button)
5. [Summary KPI Stat Cards & Trends](#5-summary-kpi-stat-cards--trends)
   - [5.1 Stat Card 1 — Total Customers](#51-stat-card-1--total-customers)
   - [5.2 Stat Card 2 — New This Month](#52-stat-card-2--new-this-month)
   - [5.3 Stat Card 3 — VIP Customers](#53-stat-card-3--vip-customers)
   - [5.4 Stat Card 4 — Inactive (90+ Days)](#54-stat-card-4--inactive-90-days)
6. [Customers Data Table](#6-customers-data-table)
   - [6.1 Customer Name Link](#61-customer-name-link)
   - [6.2 View Customer Note Button](#62-view-customer-note-button)
   - [6.3 Total Spent Button (Spending Breakdown Modal)](#63-total-spent-button-spending-breakdown-modal)
   - [6.4 Row Action — Edit Button](#64-row-action--edit-button)
   - [6.5 Row Action — Delete Button](#65-row-action--delete-button)
7. [Modals & Sub-Flows](#7-modals--sub-flows)
   - [7.1 Add New Customer Modal (Create Mode)](#71-add-new-customer-modal-create-mode)
   - [7.2 Edit Customer Modal (Update Mode)](#72-edit-customer-modal-update-mode)
   - [7.3 Delete Customer Confirmation Modal](#73-delete-customer-confirmation-modal)
   - [7.4 Customer Spending Breakdown Modal](#74-customer-spending-breakdown-modal)
   - [7.5 Customer Note View Modal](#75-customer-note-view-modal)
   - [7.6 Global Customer Profile Modal](#76-global-customer-profile-modal)
   - [7.7 Rate Your Experience Review Modal](#77-rate-your-experience-review-modal)
8. [Pagination Controls](#8-pagination-controls)
9. [RPCs Reference](#9-rpcs-reference)
10. [Tables Affected](#10-tables-affected)
11. [Sub-Feature Gate Map](#11-sub-feature-gate-map)
12. [Error Handling Summary](#12-error-handling-summary)
13. [Security Architecture](#13-security-architecture)

---

## 1. Module Overview

The Customers module manages the salon's CRM database, client contact records, segmentation tags, appointment histories, lifetime spend records, notes, and customer reviews.

**Zero-Trust Hardening completed 2026-11-04.** All client direct database mutations (`.from('customers').insert()`, `.update()`, `.delete()`, `.from('reviews').insert()`) have been eliminated and replaced with authoritative `SECURITY DEFINER` stored procedures in the `app` schema with public RPC synonyms.

### Key Functional Areas
- **Paginated Customer Directory**: Deterministic 25-rows-per-page directory with server-side ILIKE search and segmentation filters.
- **KPI Metrics & Trends**: Authoritative stat cards and trend percentages computed entirely inside PostgreSQL routines.
- **Atomic Customer Creation**: Clean phone deduplication, validation, and profile generation.
- **Anti-Tampering Protected Editing**: Edit customer details without exposing financial metrics (`total_spent`) or activity logs (`last_visit`) to client tampering.
- **Guarded Soft Deletion**: Blocks deleting any customer with active/upcoming bookings or active memberships.
- **Deep Financial Breakdown**: Interactive popover analyzing revenue across services, products, and memberships.
- **Global Customer Profile**: 3-column drawer displaying demographic stats, notes, and expandable multi-service booking histories.
- **Customer Reviews**: Rate your experience rating & feedback submission stored in `shared.reviews`.

---

## 2. Page Load Sequence

```
customers.html
│
├── scripts/auth-loader.js                   → 3-gate auth guard (session → subscription → RBAC)
├── scripts/sub-features/sub-feature-gate.js → Checks data-sub-feature permissions
├── scripts/app-shell.js                     → Injects global sidebar and header shell
├── scripts/customers/customers-ui.js        → Filter dropdown menu & icon glue
├── scripts/global-customer-modal.js         → Injects & binds #addCustomerModalOverlay
├── scripts/global-customer-profile-modal.js → Injects & binds #customerProfileBookingModal
├── customers.js                             → Core controller & data orchestrator
│   ├── fetchCustomers()                     → Server-side filtered & paginated query
│   │   ├── Query app.customers (page size: 25)
│   │   ├── renderCustomers()
│   │   ├── renderPagination()
│   │   └── refreshCustomerStatCards()
│   │       ├── RPC: customers_page__four_statcards
│   │       └── RPC: customers_page__four_statcard_trendelements
└── SheetJS (xlsx.full.min.js)               → CDN script for client-side Excel generation
```

---

## 3. Global State & Context

| Variable | Scope | Source / Definition | Used For |
|---|---|---|---|
| `company_id` | Global | `localStorage.getItem('company_id')` | Multitenant database filtering |
| `active_branch_id` | Global | `localStorage.getItem('active_branch_id')` | Branch-specific data isolation |
| `customersList[]` | Module | Array of 25 customer objects for current page | Table row rendering |
| `editingCustomerId`| Module | `UUID` of customer currently being edited (or null) | Distinguishes Edit vs Create mode |
| `activeFilter` | Module | `'all'` \| `'vip'` \| `'regular'` \| `'new'` \| `'inactive'` | Current segmentation filter |
| `searchQuery` | Module | String from `#customerSearch` | Search term filter |
| `currentPage` | Module | Integer (1-based index) | Pagination offset calculation |
| `PAGE_SIZE` | Constant | `25` records | Records requested per page |
| `totalRecords` | Module | Integer from `{ count: 'exact' }` | Pagination footer range & boundary |
| `pendingDeleteId` | Module | `UUID` of customer pending delete confirmation | Soft-delete target parameter |

**Branch Switch Reaction**: Window listens for `'branch:changed'`. When fired, `currentPage = 1` and `fetchCustomers()` re-runs for the newly active branch.

---

## 4. Header Controls & Actions

### 4.1 Customer Search Input

**Element**: `#customerSearch`  
**Type**: Text Input  
**Debounce**: 300ms  
**Event**: `input` -> `debounce(...)`

**Frontend Behavior**:
1. User types query (name or phone number).
2. Sanitizes input: strips parentheses and commas to prevent PostgREST `or=(...)` syntax breakage.
3. Encodes query and resets `currentPage = 1`.
4. Executes server-side query with ILIKE conditions:
   ```javascript
   query.or(`customer_name.ilike.*${encoded}*,customer_phone.ilike.*${encoded}*`);
   ```
5. Updates table rows and pagination controls.

**Backend Query**:
- Table: `customers`
- Filters: `company_id = p_company_id`, `branch_id = p_branch_id`, `status != 'deleted'`
- Applied filter: `.or(customer_name.ilike.*query*,customer_phone.ilike.*query*)`

---

### 4.2 Filter Dropdown

**Trigger Button**: `#customerFilterBtn`  
**Dropdown Container**: `#customerFilterDropdown`  
**Options**: `.filter-option[data-tag]`

**Available Filters**:
| Tag (`data-tag`) | Label | Query Logic Applied |
|---|---|---|
| `all` | All Customers | No tag filter applied. Clears search query. |
| `vip` | VIP | `query.ilike('tags', 'vip')` |
| `regular` | Regular | `query.ilike('tags', 'regular')` |
| `new` | New | `query.gte('created_at', now - 30 days)` |
| `inactive` | Inactive | `query.or('last_visit.lt.d90date_only,and(last_visit.is.null,created_at.lt.d90iso))'` |

**Frontend Behavior**:
1. Clicking `#customerFilterBtn` toggles `.open` on button and dropdown menu.
2. Clicking any filter option:
   - Removes `.active` from siblings and marks clicked item active.
   - Updates `#customerFilterLabel` text.
   - Calls `applyCustomerFilter(tag)`.
   - Clears search input (`#customerSearch.value = ''`).
   - Resets `currentPage = 1` and runs `fetchCustomers()`.
   - Closes dropdown.
3. Clicking anywhere outside `#customerFilterWrap` closes the dropdown automatically.

---

### 4.3 Download Customers Button (Excel Export)

**Element**: `#btnDownloadCustomers`  
**Type**: Button (`.customers-download-btn`)  
**Icon**: Feather `download`

**Frontend Behavior**:
1. Verifies `typeof XLSX !== 'undefined'` (SheetJS library).
2. Disables button and displays inline SVG spinner with label `"Downloading…"`.
3. Fetches **all active customers** without pagination limits:
   ```javascript
   supabase
     .from('customers')
     .select('customer_name,created_at,customer_phone,customer_email,total_spent,last_visit,tags,status')
     .eq('company_id', companyId)
     .eq('branch_id', branchId)
     .neq('status', 'deleted')
     .order('customer_name', { ascending: true });
   ```
4. Formats rows:
   - Formats dates as `DD-MM-YYYY` in Indian locale (`en-IN`).
   - Formats `total_spent` with currency sign (`₹X,XXX`).
5. Generates XLSX worksheet via `XLSX.utils.json_to_sheet(rows)`.
6. Computes dynamic column widths based on maximum string lengths (capped at 40 chars).
7. Triggers file save via `XLSX.writeFile(wb, 'Customers_DD-MM-YYYY.xlsx')`.
8. Restores button state and displays toast: `"Downloaded X customers ✓"`.

**Backend**:
- Read-only `.select()` query on `customers` table filtered by `company_id` and `branch_id`.

---

### 4.4 Add Customer Button

**Element**: `#btnAddCustomer`  
**Sub-Feature Gate**: `data-sub-feature="customer_create"`  
**Type**: Button (`.customers-add-btn`)  
**Icon**: Feather `user-plus`

**Frontend Behavior**:
1. Click handler calls `window.openGlobalAddCustomerModal(callback)`.
2. Sets `editingCustomerId = null`.
3. Resets form inputs (`#newCustName`, `#newCustPhone`, `#newCustEmail`, `#newCustDob`, `#newCustTag` = 'regular', `#newCustNotes`).
4. Updates modal title to `"Add New Customer"` and button to `"Save Customer"`.
5. Opens `#addCustomerModalOverlay` by adding `.active`.
6. After creation callback: re-executes `fetchCustomers()` and `refreshCustomerStatCards()`.

---

## 5. Summary KPI Stat Cards & Trends

The four KPI stat cards reflect real-time tenant numbers and are populated via two atomic database functions called during `fetchCustomers()`.

```
                  ┌──────────────────────────────────────────────┐
                  │          refreshCustomerStatCards()          │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
  customers_page__four_statcards            customers_page__four_statcard_trendelements
  - total_customers                         - total_customers_change_percent
  - new_this_month                          - vip_customers_percentage
  - vip_customers                           - inactive_customers_percentage
  - inactive_customers
```

### 5.1 Stat Card 1 — Total Customers
- **Counter Element**: `#statTotalCustomers`
- **Trend Element**: `#trendTotalCustomers`
- **Metric**: Total active customers in branch (`status != 'deleted'`).
- **Trend**: Month-over-month percentage change (`total_customers_change_percent`). Shows `+X%` / `-X% from last month` with `trending-up` or `trending-down` icon.

### 5.2 Stat Card 2 — New This Month
- **Counter Element**: `#statNewThisMonth`
- **Trend Element**: `#trendNewThisMonth`
- **Metric**: Customers created between 1st of current month and now.
- **Trend**: Fixed caption: `"Customers added this month"`.

### 5.3 Stat Card 3 — VIP Customers
- **Counter Element**: `#statVipCustomers`
- **Trend Element**: `#trendVipCustomers`
- **Metric**: Customers tagged as `'vip'` in branch.
- **Trend**: Ratio percentage (`vip_customers_percentage`), e.g., `"14.2% of customers"`.

### 5.4 Stat Card 4 — Inactive (90+ Days)
- **Counter Element**: `#statInactiveDays`
- **Trend Element**: `#trendInactiveDays`
- **Metric**: Customers whose `last_visit` was > 90 days ago (or who have never visited and joined > 90 days ago).
- **Trend**: Ratio percentage (`inactive_customers_percentage`), e.g., `"8.5% of customers"`.

---

## 6. Customers Data Table

The table renders 25 records per page with the following column structure:

| Column | Content | Interactive Elements |
|---|---|---|
| **Customer** | Avatar + Full Name + Joined Date | Clickable Customer Name, View Note icon |
| **Contact** | Phone Number + Email Address | Static text |
| **Total Spent** | Total revenue generated across all modules | Clickable green badge opening Spending Breakdown Modal |
| **Last Visit** | Date of last appointment + Day of week | Static text |
| **Tags/Status** | Segment badge (`VIP`, `Regular`, `New`) | Visual pill |
| **Actions** | Edit & Delete action buttons | `.btn-edit` and `.btn-delete` |

### 6.1 Customer Name Link

**Element**: `.customer-link[data-customer-id]`  
**Event**: `click`

**Frontend Behavior**:
1. Reads `data-customer-id` and `data-customer-name`.
2. Calls `window.viewCustomerProfile(customerId, customerName)`.
3. Opens the **Global Customer Profile Modal** (see section 7.6).

---

### 6.2 View Customer Note Button

**Element**: `.btn-customer-notes[data-customer-id]`  
**Condition**: Rendered **only** if `customer.notes` exists and is non-empty.  
**Event**: `click`

**Frontend Behavior**:
1. Reads customer object from current page's `customersList[]`.
2. Populates `#noteModalCustomerName` with `"{Name}'s Note"`.
3. Sets `#noteModalTextContent` with raw note text.
4. Opens `#customerNoteModalOverlay` by adding `.active`.

---

### 6.3 Total Spent Button (Spending Breakdown Modal)

**Element**: `.total-spent-btn[data-customer-id]`  
**Badge Style**: Rounded green badge (`background: #d1fae5; color: #059669; font-weight: 700;`)  
**Event**: `click`

**Frontend Behavior**:
1. Stops event propagation.
2. Calls `openSpendingModal(customerId)`.
3. Opens `#spendingBreakdownOverlay` showing spinner (`#sbdLoading`).
4. Dispatches RPC:
   ```javascript
   supabase.rpc('customers_page_clickable_total_spent', {
       p_company_id:  companyId,
       p_branch_id:   branchId,
       p_customer_id: customerId
   });
   ```
5. Maps results into `#sbdServices`, `#sbdProducts`, `#sbdMemberships`, and `#sbdTotal`.
6. Hides loader and displays `#sbdContent`.

---

### 6.4 Row Action — Edit Button

**Element**: `.btn-edit[data-id]`  
**Sub-Feature Gate**: `data-sub-feature="customer_edit"`  
**Event**: `click`

**Frontend Behavior**:
1. Finds target customer record in `customersList[]`.
2. Sets `editingCustomerId = customer.customer_id`.
3. Populates form fields in `#addCustomerModalOverlay`:
   - `#newCustName` = `customer_name`
   - `#newCustPhone` = `customer_phone`
   - `#newCustEmail` = `customer_email`
   - `#newCustDob` = `dob`
   - `#newCustTag` = `tags` ('regular' or 'vip')
   - `#newCustNotes` = `notes`
4. Changes modal title to `"Edit Customer"` and primary button to `"Update Customer"`.
5. Opens `#addCustomerModalOverlay`.

---

### 6.5 Row Action — Delete Button

**Element**: `.btn-delete[data-id]`  
**Sub-Feature Gate**: `data-sub-feature="customer_delete"`  
**Event**: `click`

**Frontend Behavior**:
1. Captures `data-id` into `pendingDeleteId`.
2. Opens `#deleteConfirmOverlay` (modal asking for confirmation).
3. If confirmed (clicking `#btnConfirmDelete`):
   - Hides confirm overlay.
   - Shows full-screen `#deletingCustomerOverlay` with spinner.
   - Calls `deleteCustomer(pendingDeleteId)`.
   - On completion: hides deleting overlay and re-fetches current page.

---

## 7. Modals & Sub-Flows

### 7.1 Add New Customer Modal (Create Mode)

**Host File**: `scripts/global-customer-modal.js`  
**Modal Container**: `#addCustomerModalOverlay`  
**Save Button**: `#btnSaveNewCustomer`

```
  User clicks "Save Customer"
              │
              ▼
   Validate inputs:
   - Full Name != empty
   - Phone == exactly 10 digits
              │
              ▼
   Call RPC: app.create_customer_atomic
              │
      ┌───────┴───────┐
      ▼               ▼
   [Success]       [Error / Duplicate]
   - Close modal   - Display toast error
   - Show toast    - Keep modal open
   - Event dispatch: 'customer-added'
   - Refresh table & stat cards
```

**RPC Call**:
```javascript
const { data: newCustomer, error } = await supabase.rpc('create_customer_atomic', {
    p_company_id:     companyId,
    p_branch_id:      branchId,
    p_customer_name:  name,
    p_customer_phone: digitsOnly, // 10-digit normalized string
    p_customer_email: email || null,
    p_dob:            dob || null,
    p_tags:           tag || 'regular',
    p_notes:          notes || null
});
```

**Backend Execution (`create_customer_atomic`)**:
1. Calls `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts `p_customer_name` is non-empty.
3. Cleans non-digits from `p_customer_phone` -> `v_norm_phone`. Asserts `length >= 7`.
4. Deduplication: Searches for existing active customer in the company matching `RIGHT(customer_phone, 10) = RIGHT(v_norm_phone, 10)` and `status != 'deleted'`. If found, throws `409 Conflict: A customer with this phone number already exists in this company.`
5. Inserts into `app.customers`:
   - `status = 'active'`
   - `total_spent = 0.00`
   - `total_visits = 0`
   - `created_at = NOW()`, `updated_at = NOW()`
6. Returns `to_jsonb(customer.*)`.

---

### 7.2 Edit Customer Modal (Update Mode)

**Host File**: `customers.js`  
**Save Button**: `#btnSaveNewCustomer` (when button text starts with `"Update"`)

**Frontend Validation**:
- Name and Phone must not be empty.
- Phone must contain exactly 10 digits.
- Company and branch IDs must exist in storage.

**RPC Call**:
```javascript
const { error: updateErr } = await supabase.rpc('update_customer_atomic', {
    p_company_id:     companyId,
    p_branch_id:      branchId,
    p_customer_id:    editingCustomerId,
    p_customer_name:  name,
    p_customer_phone: digitsOnly,
    p_customer_email: email || null,
    p_dob:            dob || null,
    p_tags:           tag || null,
    p_notes:          notes || null
});
```

**Backend Execution (`update_customer_atomic`)**:
1. Calls `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts target customer exists and belongs to `p_company_id`.
3. Cleans `p_customer_phone` -> `v_norm_phone`. Asserts `length >= 7`.
4. Deduplication check: Ensures no *other* customer in the company (`customer_id != p_customer_id` and `status != 'deleted'`) shares `RIGHT(customer_phone, 10)`.
5. Updates metadata: `customer_name`, `customer_phone`, `customer_email`, `dob`, `tags`, `notes`, `updated_at = NOW()`.
6. **Anti-Tampering Enforcement**: Explicitly preserves `total_spent` and `last_visit`.
7. Returns `to_jsonb(customer.*)`.

---

### 7.3 Delete Customer Confirmation Modal

**Modal Container**: `#deleteConfirmOverlay`  
**Confirm Button**: `#btnConfirmDelete`  
**Cancel Button**: `#btnCancelDelete`

**RPC Call**:
```javascript
const { error } = await supabase.rpc('delete_customer_atomic', {
    p_company_id:  companyId,
    p_branch_id:   branchId,
    p_customer_id: id
});
```

**Backend Execution & Dependency Guards (`delete_customer_atomic`)**:
1. Calls `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts target customer exists and `status != 'deleted'`.
3. **Active/Upcoming Booking Blocker**:
   Checks `app.bookings` for `customer_id = p_customer_id` AND `status IN ('booked', 'confirmed')` AND `booking_date >= CURRENT_DATE`.
   If count > 0, throws: `'Cannot delete customer "%". They have % active or upcoming booking(s).'`.
4. **Active Membership Blocker**:
   Checks `app.membership_purchases` for `customer_id = p_customer_id` AND `status = 'active'` AND `(expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`.
   If count > 0, throws: `'Cannot delete customer "%". They hold % active membership(s).'`.
5. Updates customer: `status = 'deleted'`, `updated_at = NOW()`.
6. Returns `true`.

---

### 7.4 Customer Spending Breakdown Modal

**Overlay**: `#spendingBreakdownOverlay`  
**Modal Container**: `#spendingBreakdownModal`  
**Close Trigger**: `#closeSpendingModal` or clicking backdrop

**Displays**:
- **Services Total**: Revenue from completed appointments (`bookings`).
- **Products Total**: Revenue from retail POS sales (`orders` / `sales_items`).
- **Memberships Total**: Revenue from purchased membership plans (`membership_purchases`).
- **Grand Total**: Sum of all spending across all revenue streams.

**RPC**: `customers_page_clickable_total_spent`

---

### 7.5 Customer Note View Modal

**Overlay**: `#customerNoteModalOverlay`  
**Modal Container**: `#customerNoteModal`  
**Close Triggers**: `#btnCloseNoteModalX`, `#btnCloseNoteModalBtn`, overlay backdrop click, `Escape` key

**Displays**:
- Customer Name header (`#noteModalCustomerName`)
- Client preferences, color formulas, notes, allergy remarks (`#noteModalTextContent`)
- View-only mode with scrolling for long notes.

---

### 7.6 Global Customer Profile Modal

**Overlay**: `#customerProfileBookingModal`  
**Host File**: `scripts/global-customer-profile-modal.js`  
**Invoked By**: `window.viewCustomerProfile(customerId, customerName)`

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Customer Profile Modal                          │
├───────────────────┬──────────────────────────┬─────────────────────────┤
│    LEFT COLUMN    │      CENTER COLUMN       │      RIGHT COLUMN       │
│  (Profile Card)   │     (Contact & Info)     │    (Recent Bookings)    │
│                   │                          │                         │
│ • Avatar Image    │ • Email                  │ Table of last 5 visits: │
│ • Customer Name   │ • Phone                  │ • Date                  │
│ • Customer Phone  │ • Date of Birth (D.O.B)  │ • Service Chips (+N)    │
│ • Total Spent (₹) │ • Member Since Date      │ • Staff Chips (+N)      │
│ • Total Visits    │ • Client Notes           │ • Final Amount (₹)      │
│ • Status Tag Pill │                          │ • Status Badge          │
└───────────────────┴──────────────────────────┴─────────────────────────┘
```

**Data Fetch**:
Executes two RPCs in parallel:
```javascript
const [profileRes, spentRes] = await Promise.all([
    supabase.rpc('Global_customer_profile_modal', {
        p_company_id:  companyId,
        p_branch_id:   branchId,
        p_customer_id: customerId
    }),
    supabase.rpc('customers_page_clickable_total_spent', {
        p_company_id:  companyId,
        p_branch_id:   branchId,
        p_customer_id: customerId
    })
]);
```

**Expandable Chips**: Multi-service and multi-staff bookings render a primary badge with a `+N` toggle pill. Clicking calls `window.toggleProfExtra` to expand or collapse secondary badges inline.

---

### 7.7 Rate Your Experience Review Modal

**Overlay**: `#reviewOverlay`  
**Host File**: `scripts/review-modal.js`  
**Invoked By**: `window.openReviewModal()`

**Interactive Elements**:
- Star Buttons (`.rv-star-btn[data-rating="1..5"]`):
  - `mouseover` -> `rvStarHover(rating)`: highlights stars 1..N and displays rating text hint (`"5 stars ⭐⭐⭐⭐⭐ Excellent!"`).
  - `mouseout` -> `rvResetStarHover()`: restores rating hint to current selected value.
  - `click` -> `rvStarSelect(rating)`: locks selected rating into state.
- Comments Area (`#rvComments`): Textarea for optional review text.
- Submit Button (`#rvSubmitBtn`):
  - Validates that rating is selected between 1 and 5.
  - Dispatches RPC:
    ```javascript
    supabase.rpc('submit_customer_review_atomic', {
        p_company_id: companyId,
        p_branch_id:  branchId || null,
        p_user_id:    userId,
        p_rating:     _selectedReviewRating,
        p_comments:   commentsVal || null
    });
    ```
  - On success: switches modal to `#rvSuccess` confirmation screen.

---

## 8. Pagination Controls

**Container**: `#customersPaginationFooter`  
**Configuration**: `PAGE_SIZE = 25` rows per page

**Elements**:
- `#custPageShowing`: Shows record range, e.g., `"Showing 1–25 of 142 customers"`.
- `#custBtnPrev`: Previous page button (disabled on `currentPage <= 1`).
- `#custPageInfo`: Current position indicator, e.g., `"Page 1 of 6"`.
- `#custBtnNext`: Next page button (disabled on `currentPage >= totalPages`).

**Automatic Visibility**:
If `totalRecords <= PAGE_SIZE`, the pagination footer is hidden automatically (`footer.style.display = 'none'`).

**Safety Guard**:
If a deletion reduces total pages below `currentPage`, `fetchCustomers()` automatically falls back to `currentPage = totalPages`.

---

## 9. RPCs Reference

| Function Name | Schema | Security | Key Parameters | Return Type | Description |
|---|---|---|---|---|---|
| `create_customer_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_customer_name`, `p_customer_phone`, `p_customer_email`, `p_dob`, `p_tags`, `p_notes` | `jsonb` | Validates tenant access, normalizes phone, checks company-wide duplicate 10-digit suffix, creates record with `total_spent = 0.00`. |
| `update_customer_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_customer_id`, `p_customer_name`, `p_customer_phone`, `p_customer_email`, `p_dob`, `p_tags`, `p_notes` | `jsonb` | Updates customer demographic details while strictly protecting `total_spent` and `last_visit` from client tampering. |
| `delete_customer_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_customer_id` | `boolean` | Checks for active/upcoming bookings or active memberships. If clear, sets `status = 'deleted'`. |
| `submit_customer_review_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_user_id`, `p_rating`, `p_comments` | `jsonb` | Validates rating (1-5) and tenant context, inserts record into `shared.reviews`. |
| `customers_page__four_statcards` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id` | `TABLE(...)` | Computes Total Customers, New This Month, VIPs, and Inactive (90+ Days) counts. |
| `customers_page__four_statcard_trendelements` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id` | `TABLE(...)` | Computes month-over-month customer change %, VIP %, and Inactive %. |
| `customers_page_clickable_total_spent` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_customer_id` | `TABLE(...)` | Computes revenue breakdown across services, products, and memberships for a customer. |
| `Global_customer_profile_modal` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_customer_id` | `jsonb` / `TABLE` | Fetches demographic info, total visits, and last 5 booking records with services & staff. |

---

## 10. Tables Affected

| Table | Operation | Triggering Action / Flow |
|---|---|---|
| `app.customers` | `SELECT` | Directory browsing, search, filter, Excel download |
| `app.customers` | `INSERT` | New customer creation (`create_customer_atomic`) |
| `app.customers` | `UPDATE` | Profile edit (`update_customer_atomic`), soft deletion (`delete_customer_atomic`) |
| `shared.reviews` | `INSERT` | Rating & review submission (`submit_customer_review_atomic`) |
| `app.bookings` | `SELECT` | Verified inside `delete_customer_atomic` blocker, recent bookings in profile drawer |
| `app.membership_purchases` | `SELECT` | Verified inside `delete_customer_atomic` blocker, spending breakdown query |
| `app.orders` / `sales_items` | `SELECT` | Product retail spend aggregation inside `customers_page_clickable_total_spent` |

---

## 11. Sub-Feature Gate Map

| UI Element | Selector | Sub-Feature Code | Action Gated |
|---|---|---|---|
| Add Customer Button | `#btnAddCustomer` | `customer_create` | Creates new customer record |
| Edit Row Button | `.btn-edit` | `customer_edit` | Edits customer profile |
| Delete Row Button | `.btn-delete` | `customer_delete` | Soft-deletes customer profile |

All gated elements carry the `data-sub-feature` attribute and are evaluated automatically by `scripts/sub-features/sub-feature-gate.js`. If the user's role lacks the capability, the button is hidden or disabled.

---

## 12. Error Handling Summary

| Condition | Frontend Message / Action | Backend Cause |
|---|---|---|
| Empty Name or Phone | Toast: `"Name and Phone are required."` | Client validation check |
| Invalid Phone (< 10 digits) | Toast: `"Phone number must be exactly 10 digits."` | Client regex check |
| Short Phone (< 7 digits) | Toast: Server error message | `create_customer_atomic` validation |
| Duplicate Phone on Create | Toast: `"A customer with this phone number already exists in this company."` | `409 Conflict` in `create_customer_atomic` |
| Duplicate Phone on Edit | Toast: `"A customer with this phone number already exists in this company."` | `409 Conflict` in `update_customer_atomic` |
| Delete with Active Bookings | Toast: `"Cannot delete customer '...'. They have X active or upcoming booking(s)."` | Dependency blocker in `delete_customer_atomic` |
| Delete with Active Memberships | Toast: `"Cannot delete customer '...'. They hold X active membership(s)."` | Dependency blocker in `delete_customer_atomic` |
| Review Rating Missing | Text alert: `"Please select a rating before submitting."` + stars shake animation | Client rating check |
| Excel Library Missing | Toast: `"Excel library not loaded. Please refresh and try again."` | `typeof XLSX === 'undefined'` guard |
| No Customers to Export | Toast: `"No customers to download."` | Query returned empty set |

---

## 13. Security Architecture

### Zero-Trust Controls Implemented

1. **Zero Client Direct Writes**: No direct `.insert()`, `.update()`, or `.delete()` queries on `customers` or `reviews`. All writes route through stored procedures.
2. **Authoritative Financial Protection**:
   - `total_spent` is initialized to `0.00` by the server upon customer creation.
   - Updates via `update_customer_atomic` explicitly omit `total_spent` and `last_visit`, preventing tampering with financial LTV or visit dates.
3. **Automated Deduplication**: Phone numbers are cleaned of non-digits and deduplicated on the last 10 digits company-wide.
4. **Referential Integrity Enforcement**: Customer deletion is guarded against orphaned upcoming bookings and active memberships.
5. **Strict Tenant Isolation**: Every procedure begins with `shared.verify_tenant_access(p_company_id, p_branch_id)`.
6. **Definer Isolation**: All procedures run with `SECURITY DEFINER` and locked `search_path = platform, shared, app, public, pg_temp` to prevent search path injection attacks.

---

*Document generated: 2026-11-04 | Source files: `customers.html`, `customers.js`, `scripts/customers/customers-ui.js`, `scripts/global-customer-modal.js`, `scripts/global-customer-profile-modal.js`, `scripts/review-modal.js` | Total interactions documented: 24*

