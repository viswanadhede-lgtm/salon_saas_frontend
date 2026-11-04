# MODULE 02 — Bookings
> **Bharathbots Salon SaaS — Developer Interaction Map**
> Generated: 2026-11-04 | Source files analysed: `bookings.html`, `bookings.js`, `scripts/bookings/*`, `scripts/global-booking-modal.js`, `scripts/global-payment-modal/`, `scripts/rebook-refund/*`

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Page Load Sequence](#2-page-load-sequence)
3. [Global Header — New Booking Button](#3-global-header--new-booking-button)
4. [Tab Navigation](#4-tab-navigation)
5. [Search Bar](#5-search-bar)
6. [Filter Button & Dropdown](#6-filter-button--dropdown)
7. [Sort Column Headers](#7-sort-column-headers)
8. [Booking Table Rows — Interactive Elements](#8-booking-table-rows--interactive-elements)
   - 8.1 [Customer Name Link](#81-customer-name-link)
   - 8.2 [Collect Button (unpaid, non-cancelled)](#82-collect-button-unpaid-non-cancelled)
   - 8.3 [Update Button (booked/confirmed)](#83-update-button-bookedconfirmed)
   - 8.4 [View Button (completed)](#84-view-button-completed)
   - 8.5 [Info Button (cancelled/no-show + paid/partial)](#85-info-button-cancelledno-show--paidpartial)
   - 8.6 [Rebook Button (cancelled/no-show + unpaid)](#86-rebook-button-cancelledno-show--unpaid)
9. [New Booking Modal (Full Flow)](#9-new-booking-modal-full-flow)
   - 9.1 [Service/Package Picker Modal](#91-servicepackage-picker-modal)
   - 9.2 [Confirm Booking Button → create_booking_atomic](#92-confirm-booking-button--create_booking_atomic)
   - 9.3 [Staff Overlap / Double-booking Override](#93-staff-overlap--double-booking-override)
10. [Edit Booking Modal (Full Flow)](#10-edit-booking-modal-full-flow)
    - 10.1 [Save Changes → update_booking_atomic](#101-save-changes--update_booking_atomic)
    - 10.2 [Cancel Booking (from Edit modal)](#102-cancel-booking-from-edit-modal)
    - 10.3 [Payment Not Completed Warning Modal](#103-payment-not-completed-warning-modal)
11. [Manage Booking Modal (Status-only update)](#11-manage-booking-modal-status-only-update)
12. [Status Update Confirm Overlay](#12-status-update-confirm-overlay)
13. [Booking Invoice Modal (Completed bookings)](#13-booking-invoice-modal-completed-bookings)
14. [Cancelled/No-show Booking Info Modal](#14-cancelledNo-show-booking-info-modal)
15. [Refund Modal Flow](#15-refund-modal-flow)
16. [Calendar View](#16-calendar-view)
    - 16.1 [Month Navigation (Prev/Next/Today)](#161-month-navigation-prevnexttoday)
    - 16.2 [Day Cell Click → Calendar Day Modal](#162-day-cell-click--calendar-day-modal)
17. [RBAC & Plan Gates Summary](#17-rbac--plan-gates-summary)
18. [Tables & Views Touched](#18-tables--views-touched)
19. [All RPCs Called](#19-all-rpcs-called)

---

## 1. Architecture Overview

| Layer | Detail |
|---|---|
| **Page** | `bookings.html` |
| **Entry Point** | `bookings.js` → `initBookings()` |
| **State Module** | `scripts/bookings/bookings-state.js` — `getLiveBookings()`, `editState`, `getCompanyId()`, `getBranchId()` |
| **Data Module** | `scripts/bookings/bookings-data.js` — `fetchBookings()`, `loadEditDropdownData()` |
| **Table Renderer** | `scripts/bookings/bookings-table.js` — `buildRow()`, `statusBadge()`, `toggleSvcExtra()` |
| **Filter Module** | `scripts/bookings/bookings-filters.js` |
| **Calendar Module** | `scripts/bookings/bookings-calendar.js` |
| **Modal Inject** | `scripts/bookings/booking-modals-inject.js` — `setupModals()` |
| **Action Buttons** | `scripts/bookings/booking-status-actions.js` — `updateBookingStatus()` |
| **Payment Bridge** | `scripts/bookings/booking-payment-bridge.js` — `openBookingPayment()` |
| **View Modals** | `scripts/bookings/booking-view-modals.js` — `openViewBookingModal()`, `openCancelledBookingModal()`, `triggerRebook()`, `triggerRefund()` |
| **Edit Modal** | `scripts/bookings/booking-edit-modal.js` — `openEditBookingModal()`, `attachEditModalListeners()` |
| **New Booking** | `scripts/global-booking-modal.js` — `initGlobalBookingModal()`, `openGlobalBookingModal()`, `create_booking_atomic` |
| **Payment Modal** | `scripts/global-payment-modal/` — Global Payment Modal |
| **Rebook/Refund** | `scripts/rebook-refund/` — `triggerRebook()`, `openRefundModal()`, `processRefund()` |
| **Primary DB View** | `bookings_for_business_transaction` (security_invoker=true) |
| **Primary DB Table** | `bookings` (direct read for per-service rows in Edit modal) |

---

## 2. Page Load Sequence

```
bookings.html loads
  ↓
bookings.js: initBookings()
  ├── setupModals()                        — Injects all modal HTML into <body>
  ├── initGlobalBookingModal()             — Wires New Booking modal & Picker modal
  ├── attachEditModalListeners()           — Wires Edit modal form & sub-modals
  ├── initBookingStatusActions()           — Wires status confirm overlay
  ├── attachViewModalListeners()           — Wires Invoice & Cancelled booking modals
  ├── initBookingsCalendar()               — Wires calendar nav & day-click
  ├── initBookingsFilters()                — Wires search, filter dropdown, sort headers
  └── fetchBookings()                      — Initial data load
        ↓
      supabase
        .from('bookings_for_business_transaction')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        ↓
      setLiveBookings(data)
      renderBookings(getFilteredBookings())   — Renders table rows
```

**Data source:** `bookings_for_business_transaction` — a Supabase VIEW with `security_invoker=true`. It enforces RLS on the underlying `bookings` table. Returns denormalized rows including `customer_name`, `service_name`, `staff_name`, `payment_status`, `final_amount`.

**Filters applied on fetch:** `company_id` + `branch_id` from `localStorage`.

---

## 3. Global Header — New Booking Button

**Element:** `#btnNewBooking` (global header, present on all pages)
**Also:** `#btnNewBookingPage` (inline button on the Bookings page)

| Step | Detail |
|---|---|
| **Click** | `openGlobalBookingModal()` → `openModal()` |
| **On open** | `populateBookingDropdowns()` — 6 parallel Supabase reads: |
| | `services` (filtered: active, same company+branch) |
| | `staff` (filtered: not deleted, same company+branch) |
| | `customers` (all, same company+branch) |
| | `packages` (is_active=true, not deleted) |
| | `package_services` (all) |
| | `service_categories` (not deleted, same company+branch) |
| **Frontend state** | `liveServicesDB`, `liveStaffDB`, `liveCustomersDB`, `livePackagesDB`, `livePackageServicesDB`, `liveCategoriesDB` populated |
| **Modal** | `#bookingModalOverlay` slides in; header shows "New Booking" |
| **RBAC gate** | `data-sub-feature="create_booking"` on button — hidden/disabled if user lacks `create_booking` permission |

---

## 4. Tab Navigation

**Tabs:** "Today's Bookings" | "All Bookings" | "Calendar View"

| Action | Frontend Behavior | Backend Call |
|---|---|---|
| Click **Today's Bookings** | Sets active tab, filters `getLiveBookings()` to `booking_date === today`, re-renders table | None — in-memory filter |
| Click **All Bookings** | Shows all bookings from `getLiveBookings()`, re-renders table | None — in-memory filter |
| Click **Calendar View** | Hides table, shows calendar grid, calls `renderCalendar()` | `get_calendar_month_bookings_summary` RPC (see §16) |

---

## 5. Search Bar

**Element:** `#bookingSearchInput` (or similar in `bookings-filters.js`)

| Property | Detail |
|---|---|
| **Trigger** | `input` event (live, debounced or immediate) |
| **Frontend behavior** | Filters `getLiveBookings()` in-memory on `customer_name`, `service_name`, `staff_name`, `booking_id` fields |
| **Backend call** | **None** — purely client-side filter against already-fetched data |
| **Result** | `renderBookings(getFilteredBookings())` |

---

## 6. Filter Button & Dropdown

**Element:** Filter button → opens dropdown panel

### Dropdown Contents

| Filter Type | UI | Behavior |
|---|---|---|
| **Status** | Checkboxes: Booked, Confirmed, Completed, Cancelled, No-Show | Multi-select, stored in `bookings_filter_state` localStorage key |
| **Staff** | Checkboxes — one per staff member from live data | Multi-select |
| **Date Range** | Radio buttons: Today, This Week, This Month, Custom Range, All Time | Single-select; custom range shows date picker inputs |

### Buttons

| Button | Action | Backend Call |
|---|---|---|
| **Apply Filters** | Saves filter state to `localStorage.bookings_filter_state`, calls `renderBookings(getFilteredBookings())` | None |
| **Clear Filters** | Resets all filter state, removes `localStorage.bookings_filter_state`, re-renders all | None |
| **Close (X)** | Closes dropdown without applying | None |

> [!NOTE] All filtering is in-memory. The full dataset was loaded on page load via `fetchBookings()`. Filters do NOT trigger a new Supabase query.

---

## 7. Sort Column Headers

**Columns:** Date ↕ | Status ↕ | Payment Status ↕

| Action | Behavior | Backend Call |
|---|---|---|
| Click **Date** header | Toggles `asc` / `desc` sort on `booking_date`; re-renders table | None |
| Click **Status** header | Toggles sort on `status` field | None |
| Click **Payment** header | Toggles sort on `payment_status` field | None |

Sort state is tracked in module state (`toggleSort(col)` in `bookings-filters.js`). No new DB queries — sorts the in-memory `getLiveBookings()` array.

---

## 8. Booking Table Rows — Interactive Elements

Each row in the booking table is built by `buildRow()` in `bookings-table.js`. The action button shown depends on the row's **status** and **payment_status**:

| Condition | Button Shown |
|---|---|
| `status`: booked or confirmed | **Update** (purple) |
| `status`: completed | **View** (blue) |
| `status`: cancelled/no-show AND `payment_status`: paid or partial | **Info** (grey) |
| `status`: cancelled/no-show AND `payment_status`: unpaid | **Rebook** (orange) |
| Any non-cancelled AND `payment_status`: not paid | **Collect** (green) — in Payment column |

### 8.1 Customer Name Link

**Element:** Customer name text in each table row (rendered as a clickable link/button)

| Step | Detail |
|---|---|
| **Click** | Calls `window.viewCustomerProfile(customerId)` |
| **Frontend** | Opens the Global Customer Profile Modal |
| **Backend calls** | 2 parallel RPC/queries: |
| | `get_customer_profile` RPC or direct select from `customers` table |
| | Booking history query on `bookings_for_business_transaction` filtered by `customer_id` |
| **Modal displays** | Customer info, total visits, total spent, booking history |

> [!NOTE] The Customer Profile modal is a global component (`scripts/global-customer-profile-modal.js`). Full interaction map for that modal is documented in MODULE 05 — Customers.

### 8.2 Collect Button (unpaid, non-cancelled)

**Element:** "Collect" button in the Payment column of a row
**RBAC gate:** `data-sub-feature="collect_payment"`

| Step | Detail |
|---|---|
| **Click** | `openBookingPayment(bookingId)` in `booking-payment-bridge.js` |
| **Frontend** | Opens the Global Payment Modal, pre-filled with booking details and outstanding amount |
| **On payment submission** | `processBookingPaymentCallback(bookingId, paymentData)` |
| **Backend call 1** | `supabase.rpc('process_booking_payment_atomic', { p_booking_id, p_company_id, p_branch_id, p_amount_paid, p_payment_method, p_tip_amount })` |
| **Tables affected** | `bookings` (payment_status → paid/partial), `business_transactions`, `bookings_for_business_transaction` (view auto-updated) |
| **Backend call 2 (if fully paid)** | `supabase.rpc('update_booking_status_atomic', { p_booking_id, p_status: 'completed', ... })` |
| **On success** | `window.toast('Payment recorded!')`, `fetchBookings()` refreshes table |
| **On error** | `window.toast('Error: ' + err.message)` |

### 8.3 Update Button (booked/confirmed)

**Element:** "Update" button (purple) on booked/confirmed rows
**RBAC gate:** `data-sub-feature="update_booking"`

| Step | Detail |
|---|---|
| **Click** | `openBookingUpdateChoiceModal(bookingId)` in `booking-manage-modal.js` |
| **Frontend** | Opens `#bookingUpdateChoiceModal` — a 2-card picker |

**Card 1 — "Edit Booking" (Schedule & Services)**

| Step | Detail |
|---|---|
| **Click card** | `openEditBookingModal(bookingId)` → delegates to `window.openGlobalEditBookingModal(bookingId)` |
| **On open** | Parallel Supabase reads: `loadEditDropdownData()` (services, staff, packages) + `supabase.from('bookings').select('*').eq('booking_id', bookingId)` for all service rows |
| **Modal** | `#editBookingModal` — left panel (read-only details) + right panel (editable form) |
| See full flow | [§10 Edit Booking Modal](#10-edit-booking-modal-full-flow) |

**Card 2 — "Manage Booking" (Status change only)**

| Step | Detail |
|---|---|
| **Click card** | `openManageBookingModal(bookingId)` |
| **Frontend** | Opens `#manageBookingModal` — simple status dropdown |
| See full flow | [§11 Manage Booking Modal](#11-manage-booking-modal-status-only-update) |

**Choice modal — Close/X button:**

| Action | Behavior |
|---|---|
| Click X (`#btnCloseUpdateChoiceModal`) | Closes `#bookingUpdateChoiceModal`, no backend call |
| Click outside overlay | Closes modal |

### 8.4 View Button (completed)

**Element:** "View" button (blue) on completed rows

| Step | Detail |
|---|---|
| **Click** | `openViewBookingModal(bookingId)` in `booking-view-modals.js` |
| **Frontend** | Finds booking in `getLiveBookings()`, reads all service rows from `supabase.from('bookings').select('*').eq('booking_id', bookingId)` |
| **Opens** | `#viewBookingInvoiceModal` — read-only invoice layout |
| **Backend call** | `supabase.from('bookings').select('*').eq('booking_id', bookingId)` (direct table read) |
| **Tables read** | `bookings` |
| See full modal | [§13 Booking Invoice Modal](#13-booking-invoice-modal-completed-bookings) |

### 8.5 Info Button (cancelled/no-show + paid/partial)

**Element:** "Info" button (grey) on cancelled/no-show rows that have been paid

| Step | Detail |
|---|---|
| **Click** | `openCancelledBookingModal(bookingId)` in `scripts/rebook-refund/cancelled-booking-modal.js` |
| **Frontend** | Opens `#cancelledBookingModal` — shows booking info, Rebook + Refund actions |
| **Backend call** | Reads booking data from already-loaded `getLiveBookings()`, plus `supabase.from('bookings').select('*').eq('booking_id', bookingId)` for service rows |
| See full modal | [§14 Cancelled Booking Info Modal](#14-cancelledNo-show-booking-info-modal) |

### 8.6 Rebook Button (cancelled/no-show + unpaid)

**Element:** "Rebook" button (orange) on cancelled/no-show rows with no payment

| Step | Detail |
|---|---|
| **Click** | `triggerRebook(bookingId)` in `scripts/rebook-refund/rebook-workflow.js` |
| **Frontend** | Reads booking from `getLiveBookings()`, calls `window.openAndPrefillBooking({ customerId, name, phone, email, serviceIds, staffIds })` |
| **Opens** | `#bookingModalOverlay` (New Booking modal) pre-filled with the original customer + services |
| **Backend call** | None at this stage — data pre-filled from memory |
| **User then submits** | Triggers standard `create_booking_atomic` RPC (see §9.2) |

---

## 9. New Booking Modal (Full Flow)

**Modal:** `#bookingModalOverlay` / `#bookingModal`
**Source:** `scripts/global-booking-modal.js`

### Modal Layout

```
┌─────────────────────────────────────────────────────┐
│  New Booking              [Duration: 0 min | ₹0] [X] │
├───────────────────────┬─────────────────────────────┤
│  LEFT PANEL (40%)     │  RIGHT PANEL (60%)           │
│  ──────────────       │  ───────────────────          │
│  Phone Number *       │  Selected Services/Packages   │
│  [search + autocomplete] │  [empty state or items]   │
│  Customer Name *      │  [Included Services tab]      │
│  Email (optional)     │  [Included Packages tab]      │
│  ──────────────       │  [Edit Services/Packages btn] │
│  Date *   Time *      │                               │
│           [Now btn]   │                               │
│  ──────────────       │                               │
│  Booking Notes        │                               │
├───────────────────────┴─────────────────────────────┤
│  [Cancel Booking (hidden)] [Close] [Confirm Booking] │
└─────────────────────────────────────────────────────┘
```

### Interactive Elements in New Booking Modal

| Element | Action | Backend Call |
|---|---|---|
| **Phone Number input** | Live search against `liveCustomersDB` (in-memory); shows dropdown suggestions | None |
| **Phone suggestion click** | Selects customer; fills Name/Email; sets `selectedCustomerId`; shows "Existing Customer" badge | None |
| **New phone (not found)** | Shows "New Customer" badge; Name/Email fields remain editable | None |
| **"Now" button** | Sets time input to current local time | None |
| **"Add Services / Packages" button** | Opens Picker Modal (§9.1) | None |
| **"Edit Services / Packages" button** (shown when items selected) | Re-opens Picker Modal | None |
| **"Clear All" button** (in RHS header) | Clears `selectedBookingItems[]`, re-renders RHS empty state | None |
| **Included Services tab** | Shows standalone service items in RHS | None |
| **Included Packages tab** | Shows package items in RHS | None |
| **Staff dropdown (per item)** | Updates `staffId` on item in `selectedBookingItems[]` | None |
| **"Apply same staff to all" toggle** | Sets `isStaffSyncAll = true`; propagates first staff pick to all standalone services | None |
| **Per-package staff sync checkbox** | Syncs staff across all services within a specific package | None |
| **Drag handle** | Drag-and-drop reordering of service cards in RHS | None |
| **Trash icon (service card)** | Removes item from `selectedBookingItems[]` | None |
| **Package expand/collapse** | Toggles package card `expanded` flag, re-renders | None |
| **"Close" / X button** | Closes modal, resets all state | None |
| **"Confirm Booking" button** | Validates → staff overlap check → `create_booking_atomic` RPC | See §9.2 |

### 9.1 Service/Package Picker Modal

**Modal:** `#addServicesModalOverlay` / `#addServicesModal`

```
┌──────────────────────────────────────────────────────────┐
│  Add Services / Packages    [Duration | Amount] [X]       │
├──────────────────────┬───────────────────────────────────┤
│  LEFT: Catalog       │  RIGHT: Selected items             │
│  [Services] [Packages] │  [Selected Services | Packages] │
│  [Search input]      │  [Clear All] [Apply same staff]   │
│  [Category pills]    │  [Item cards with staff dropdowns] │
│  [Service/Pkg cards] │                                   │
│  [+ Add / ✓ Added btn] │                                 │
├──────────────────────┴───────────────────────────────────┤
│  [Go Back]                         [Confirm Selection]   │
└──────────────────────────────────────────────────────────┘
```

| Element | Action | Backend Call |
|---|---|---|
| **Services tab** | Shows `liveServicesDB` as catalog cards | None |
| **Packages tab** | Shows `livePackagesDB` as catalog cards | None |
| **Search input** | Filters catalog list in-memory | None |
| **Category pills** (Services tab only) | Filters by `category_id` | None |
| **"+ Add" button** on catalog card | Adds item to `pickerDraftItems[]`, button becomes "✓ Added" | None |
| **"✓ Added" button** on catalog card | Removes item from `pickerDraftItems[]`, button reverts to "+ Add" | None |
| **Staff dropdown** (RHS selected service) | Updates `staffId` on item in `pickerDraftItems[]` | None |
| **"Apply same staff to all" toggle** | Syncs staff across all services in draft | None |
| **Per-package "apply same staff to all"** | Syncs within that package only | None |
| **"Clear All" button** | Clears `pickerDraftItems[]` for current tab | None |
| **Trash icon** (selected item) | Removes from `pickerDraftItems[]` | None |
| **Package expand/collapse** | Toggles `expanded` on package draft item | None |
| **"Go Back" button** | Closes picker, discards draft, returns to main modal | None |
| **X button** | Same as "Go Back" | None |
| **"Confirm Selection" button** | Merges `pickerDraftItems` → `selectedBookingItems`; closes picker; re-renders main modal RHS | None |

### 9.2 Confirm Booking Button → create_booking_atomic

**Validation (all client-side before RPC):**
1. Phone number present (≥10 chars)
2. Customer name not empty
3. Date selected
4. Time selected
5. At least one service/package added
6. All items have a staff member assigned

**Auto-create new customer (if phone not in DB):**
```
supabase.rpc('create_customer_atomic', {
  p_company_id,
  p_branch_id,
  p_customer_name,
  p_customer_phone,
  p_customer_email
})
→ Returns { customer_id }
```
Tables affected: `customers`

**Staff overlap check (read-only, before commit):**
```
supabase
  .from('bookings')
  .select('start_time, duration, status')
  .eq('staff_id', first.staff_id)
  .eq('booking_date', first.booking_date)
```
If overlap found → shows `#staffOverrideConfirmOverlay` (see §9.3)

**Main RPC call:**
```
supabase.rpc('create_booking_atomic', {
  p_booking_id:      <UUID>,
  p_company_id:      <string>,
  p_branch_id:       <string>,
  p_customer_id:     <UUID | null>,
  p_customer_name:   <string>,
  p_customer_email:  <string | null>,
  p_customer_phone:  <string>,
  p_is_new_customer: false,
  p_services:        [
    {
      service_id, package_id, staff_id, service_name, staff_name,
      start_time, end_time, price, status: 'booked'
    },
    ...
  ],
  p_booking_date:    <YYYY-MM-DD>,
  p_notes:           <string | null>,
  p_booking_type:    'walk-in'
})
```

**Tables affected by `create_booking_atomic`:**
- `bookings` — INSERT one row per service/package-service
- `business_transactions` — INSERT pending transaction record
- `customers` — touched if `p_is_new_customer` true or stats updated
- `bookings_for_business_transaction` (view — auto-reflects)

**On success:**
1. `window.toast('Booking created successfully!')`
2. `window.notifyEvent('bookings', 'evt_booking_created', {...})`
3. `window.notifyEvent('staff', 'evt_staff_booking_assigned', {...})`
4. `window.notifyEvent('payments', 'evt_payment_pending', {...})`
5. `window.notifyCustomer('booking', 'booking_confirm', {...})` — customer notification
6. Modal closes (`closeModal()`)
7. `window.fetchBookings()` — refreshes booking table
8. `window.refreshAllData(branchId)` or `fetchAndRenderDashboardKPIs()` — refreshes dashboard KPIs

**On error:** `window.toast('Error saving booking: ' + error.message, true)`

### 9.3 Staff Overlap / Double-booking Override

**Modal:** `#staffOverrideConfirmOverlay`

| Button | Action | Backend Call |
|---|---|---|
| **"Go Back"** (`#btnCancelOverride`) | Closes overlay, reopens main booking modal | None |
| **"Yes, Confirm"** (`#btnConfirmOverride`) | Proceeds with `create_booking_atomic` despite overlap | `create_booking_atomic` RPC (§9.2) |
| Click outside overlay | Same as "Go Back" | None |

---

## 10. Edit Booking Modal (Full Flow)

**Modal:** `#editBookingModal`
**Source:** `scripts/bookings/booking-edit-modal.js`, `scripts/global-booking-modal.js` (`openEditModal`)
**Opens from:** "Edit Booking" card in `#bookingUpdateChoiceModal`

### Modal Layout

```
┌──────────────────────────────────────────────────────────┐
│  Manage Booking                                      [X]  │
├──────────────────────────┬───────────────────────────────┤
│  LEFT (310px): Read-only │  RIGHT: Editable form          │
│  Booking Details Card    │  Date * | Time *               │
│  ─────────────────────   │  Services & Assigned Staff *   │
│  #ID badge               │  [Service card 1]              │
│  Customer name + phone   │    Service ▾ | Staff ▾ | ₹     │
│  Date | Time             │  [+ Add Another Service]       │
│  Service(s)              │  Status * | Notes              │
│  Staff                   │                                │
│  Booking Type | Amount   │                                │
│  Status badge + Pay badge│                                │
│  ─────────────────────   │                                │
│  Quick Actions:          │                                │
│    [Collect Payment]     │                                │
│    [Generate Invoice]    │                                │
│    [Re-Book] [Refund]    │                                │
├──────────────────────────┴───────────────────────────────┤
│  [Cancel Booking]       [Close] [Save Changes]            │
└──────────────────────────────────────────────────────────┘
```

### On Open — Data Loading

```
Parallel:
  loadEditDropdownData()
  → reads: services, staff, packages for dropdowns

  supabase.from('bookings').select('*').eq('booking_id', bookingId)
  → reads all service rows for this booking group
```

Each service row becomes an `edit-service-row` card in `#editServiceRowsContainer`.

### Interactive Elements — Edit Modal

| Element | Action | Backend Call |
|---|---|---|
| **X button / "Close" button** | Closes modal | None |
| **Click outside modal** | Closes modal | None |
| **Date input (`#editBkDate`)** | Updates booking date; enforces `min = today` | None |
| **Time input (`#editBkTime`)** | Updates booking time; enforces min = now if today's date | None |
| **Service dropdown** (per card) | Selects service or package; auto-fills price if empty; manages `package_id` state | None |
| **Staff dropdown** (per card) | Selects staff for that service | None |
| **Price input** (per card) | Editable service price | None |
| **"✕ Remove" button** (non-first cards) | Removes service row card; re-labels remaining badge numbers | None |
| **"+ Add Another Service" button** | Appends new `edit-service-row` card | None |
| **Status dropdown (`#editBkStatus`)** | Changes status; if set to `completed` and payment is unpaid → triggers Payment Not Completed Modal | None / See §10.3 |
| **Notes input** | Edits optional notes string | None |
| **Quick Action — "Collect Payment"** | `window.openBookingPayment(bookingId)` → Global Payment Modal | `process_booking_payment_atomic` |
| **Quick Action — "Generate Invoice"** | `window.triggerInvoice(bookingId)` → opens Invoice modal | None (reads from memory) |
| **Quick Action — "Re-Book"** | `window.triggerRebook(bookingId)` → opens New Booking modal prefilled | None |
| **Quick Action — "Process Refund"** | `window.triggerRefund(bookingId)` → opens Refund modal | `process_booking_refund_atomic` |
| **"Cancel Booking" button** (footer) | Shows `confirm()` browser dialog; if confirmed: sets status dropdown to 'cancelled', auto-submits form | `update_booking_atomic` |
| **"Save Changes" button** | Validates → submits form → `update_booking_atomic` RPC | See §10.1 |

### 10.1 Save Changes → update_booking_atomic

**Validation (client-side):**
1. At least one service row present
2. Every row has a service and staff selected
3. If status = `completed` and payment not paid → aborts → shows Payment Not Completed Modal (§10.3)

**RPC call:**
```
supabase.rpc('update_booking_atomic', {
  p_booking_id:   <UUID>,
  p_company_id:   <string>,
  p_branch_id:    <string>,
  p_booking_date: <YYYY-MM-DD>,
  p_start_time:   <HH:MM>,
  p_notes:        <string | null>,
  p_status:       <string>,
  p_services:     [
    {
      service_id, package_id, service_name, staff_id, staff_name,
      price, start_time, end_time: null, status
    },
    ...
  ]
})
```

**Tables affected by `update_booking_atomic`:**
- `bookings` — UPDATE existing rows, INSERT new service rows, DELETE removed rows
- `business_transactions` — updated if payment status changes
- `bookings_for_business_transaction` (view — auto-reflects)
- Customer stats tables — if status changes to `completed`

**On success:**
1. `window.toast('Booking updated successfully!')`
2. `window.notifyEvent('bookings', 'evt_booking_modified', {...})`
3. `window.notifyCustomer('booking', 'booking_modify', {...})`
4. Modal closes
5. `fetchBookings()` — refreshes table

**On error:** `window.toast('Error updating booking: ' + err.message)`

### 10.2 Cancel Booking (from Edit modal)

**Element:** `#btnCancelThisBooking` (footer, only visible for non-terminal statuses)

| Step | Detail |
|---|---|
| Click | Browser `confirm('Are you sure you want to cancel this booking?')` |
| If confirmed | Sets `#editBkStatus` value to `'cancelled'`; calls `editBookingForm.requestSubmit()` |
| Backend | Same as §10.1 — `update_booking_atomic` with `p_status: 'cancelled'` |

### 10.3 Payment Not Completed Warning Modal

**Modal:** `#paymentNotCompletedModal`
**Trigger:** Attempting to set status to "completed" when `payment_status ≠ 'paid'`

| Button | Action | Backend Call |
|---|---|---|
| **"Close" (`#btnPncClose`)** | Reverts status dropdown to previous value, closes modal | None |
| **"Go Back" (`#btnPncGoBack`)** | Same as Close | None |
| **"Collect Payment" (`#btnPncCollectPayment`)** | Closes modal + Edit modal, opens Global Payment Modal | `process_booking_payment_atomic` |
| Click outside modal | Reverts status, closes modal | None |

**Amount displayed:** `#pncModalAmount` — sum of all service prices in the current edit form.

---

## 11. Manage Booking Modal (Status-only update)

**Modal:** `#manageBookingModal`
**Source:** `scripts/bookings/booking-manage-modal.js`
**Opens from:** "Manage Booking" card in `#bookingUpdateChoiceModal`

| Element | Action | Backend Call |
|---|---|---|
| **Status dropdown** | Selects new status (booked, confirmed, completed, cancelled, no-show) | None |
| **"Update Status" button** | Shows `#updateStatusConfirmOverlay` for confirmation | See §12 |
| **X / "Cancel" button** | Closes modal | None |

---

## 12. Status Update Confirm Overlay

**Modal:** `#updateStatusConfirmOverlay`
**Triggered by:** "Update Status" in Manage modal, or direct status quick-action buttons in the table

| Button | Action | Backend Call |
|---|---|---|
| **"Cancel" / "Keep Status" (`#btnKeepStatus`)** | Closes overlay, no change | None |
| **"Yes, Update" (`#btnConfirmUpdateStatus`)** | Shows full-screen loading spinner (`#fullScreenUpdateStatusLoader`), calls RPC | `update_booking_status_atomic` |

**RPC call:**
```
supabase.rpc('update_booking_status_atomic', {
  p_booking_id: <UUID>,
  p_company_id: <string>,
  p_branch_id:  <string>,
  p_status:     <string>
})
```

**Tables affected by `update_booking_status_atomic`:**
- `bookings` — UPDATE `status` column (all rows with this `booking_id`)
- `business_transactions` — updated if completing/cancelling
- Customer visit/spend stats — updated if completing

**On success:**
1. Hides loading spinner
2. `window.toast('Status updated!')`
3. `fetchBookings()` — refreshes table

**On error:** `window.toast('Error: ' + err.message)`, hides spinner

---

## 13. Booking Invoice Modal (Completed Bookings)

**Modal:** `#viewBookingInvoiceModal`
**Opens from:** "View" button (§8.4) or "Generate Invoice" quick action in Edit modal

### Layout

```
┌─────────────────────────────────────────────┐
│  Booking Invoice                        [X]  │
├───────────────────────────┬─────────────────┤
│  LEFT: Invoice details    │  RIGHT: Actions  │
│  Invoice/Booking ID       │  [Print icon]    │
│  Status badge             │  [Print Invoice] │
│  Payment badge            │                 │
│  Customer + Phone         │  [Go Back]       │
│  Appointment date/time    │                 │
│  Service Details table    │                 │
│  Total Amount             │                 │
└───────────────────────────┴─────────────────┘
```

| Button | Action | Backend Call |
|---|---|---|
| **X (`#btnCloseViewInvoiceModal`)** | Closes modal | None |
| **"Print Invoice" (`#btnVbiPrint`)** | Opens `window.open()` with printable invoice HTML | None |
| **"Go Back" (`#btnVbiGoBack`)** | Closes modal | None |

> [!NOTE] The invoice content is populated entirely from the already-fetched booking data (memory + direct `bookings` table read). No additional RPC calls on print.

---

## 14. Cancelled/No-show Booking Info Modal

**Modal:** `#cancelledBookingModal`
**Source:** `scripts/rebook-refund/cancelled-booking-modal.js`
**Opens from:** "Info" button (§8.5)

### Layout

```
┌──────────────────────────────────────────────────┐
│  Cancelled Booking / No-Show               [X]   │
├────────────────────────┬─────────────────────────┤
│  LEFT: Booking details │  RIGHT: Actions          │
│  Booking ID            │  [Process Refund]        │
│  Status badge          │  (shown if paid/partial) │
│  Payment badge         │                          │
│  Customer + Phone      │  [Rebook Appointment]    │
│  Original Appointment  │  (always shown)          │
│  Service Details       │                          │
│  Total Amount          │  [Close]                 │
└────────────────────────┴─────────────────────────┘
```

| Button | Action | Backend Call |
|---|---|---|
| **X / "Close" (`#btnCbmClose`)** | Closes modal | None |
| **"Rebook" (`#btnCbmRebook`)** | Calls `triggerRebook(bookingId)` → opens New Booking modal prefilled | None (data from memory) |
| **"Refund" (`#btnCbmRefund`)** | Calls `triggerRefund(bookingId)` → `openRefundModal(bookingId)` | See §15 |

> [!NOTE] The "Process Refund" section (`#cbmRefundSection`) is only rendered when `payment_status` is `'paid'` or `'partial'`. It is `display:none` for unpaid cancelled bookings.

---

## 15. Refund Modal Flow

**Modal:** `#refundBookingModal`
**Source:** `scripts/rebook-refund/refund-modal.js`, `scripts/rebook-refund/refund-workflow.js`

### Modal Contents

| Field | Detail |
|---|---|
| Booking ID display | Read-only |
| Refundable amount | Read-only — from `payment_status` and `final_amount` |
| **Refund Reason** (`#refundReasonSelect`) | Required dropdown: Customer Request, Service Dissatisfaction, Double Charge, Other |
| **Refund Method** (`#refundMethodSelect`) | Cash, Card, UPI, etc. |
| **Refund Note** (`#refundNote`) | Optional text |

| Button | Action | Backend Call |
|---|---|---|
| **X / Cancel** | Closes modal | None |
| **"Issue Refund" (`#btnConfirmRefund`)** | Validates reason selected → `process_booking_refund_atomic` RPC | Yes — see below |

**RPC call (`processRefund()`):**
```
supabase.rpc('process_booking_refund_atomic', {
  p_booking_id:    <UUID>,
  p_refund_reason: <string>,   // selected reason
  p_refund_notes:  <string>,   // "[reason] note text"
  p_refund_method: <string>    // 'cash' | 'card' | 'upi' etc.
})
```

**Tables affected by `process_booking_refund_atomic`:**
- `bookings` — UPDATE `payment_status` to `'refunded'`
- `business_transactions` — INSERT refund transaction record
- Customer spend/visit stats — REVERSED (atomic)

**On success:**
1. Closes modal
2. `window.toast('✓ Refund processed successfully', '#10b981')`
3. Dispatches `CustomEvent('payment-recorded', { bookingId, amount: -refundableAmount })`
4. `window.fetchBookings()` — refreshes table
5. `window.initPage()` or `window.fetchAndRenderAppointments()` if available

**On error:** `alert('Failed to process refund: ' + err.message)`; button re-enabled

---

## 16. Calendar View

**Source:** `scripts/bookings/bookings-calendar.js`
**Activated by:** "Calendar View" tab click

### Calendar Renders

- Current month grid (Mon–Sun headers, day cells)
- Each day cell shows a count badge if bookings exist
- Day cells with bookings are highlighted

### 16.1 Month Navigation (Prev/Next/Today)

| Button | Action | Backend Call |
|---|---|---|
| **← Prev** | Decrements current month state; `renderCalendar()` | `get_calendar_month_bookings_summary` RPC |
| **→ Next** | Increments current month state; `renderCalendar()` | `get_calendar_month_bookings_summary` RPC |
| **Today** | Resets to current month; `renderCalendar()` | `get_calendar_month_bookings_summary` RPC |

**RPC call:**
```
supabase.rpc('get_calendar_month_bookings_summary', {
  p_company_id: <string>,
  p_branch_id:  <string>,
  p_year:       <number>,
  p_month:      <number>  // 1–12
})
```
Returns: array of `{ booking_date, count, total_amount }` — one row per day that has bookings.

**Tables read by this RPC:** `bookings` (filtered by company, branch, year, month)

**Calendar renders:** Day cells coloured/badged based on returned data. Days with no bookings render as plain cells.

### 16.2 Day Cell Click → Calendar Day Modal

| Step | Detail |
|---|---|
| **Click on a day cell** | `openCalendarDayModal(date)` |
| **Frontend** | Filters `getLiveBookings()` in-memory for `booking_date === date` |
| **Backend call** | None — data already in memory from last `fetchBookings()` |
| **Modal** | Shows a mini-table of that day's bookings: Customer, Service, Staff, Time, Status |

**Within the Day Modal:**
| Element | Action | Backend Call |
|---|---|---|
| **Customer name link** | `window.viewCustomerProfile(customerId)` → Global Customer Profile modal | 2 RPCs (see §8.1) |
| **Close button** | Closes day modal | None |

> [!IMPORTANT] The Calendar Day Modal is **read-only**. No create/edit/delete actions. All booking management must be done from the Today's/All Bookings tab.

---

## 17. RBAC & Plan Gates Summary

| Sub-Feature Key | Elements Protected | Missing Permission Behavior |
|---|---|---|
| `create_booking` | "New Booking" button (header + page), "Re-Book" action | Button hidden or disabled |
| `update_booking` | "Update" button (booked/confirmed rows), "Save Changes", status change, "Process Refund" quick action | Button hidden or disabled |
| `collect_payment` | "Collect" button in Payment column, "Collect Payment" quick action in Edit modal | Button hidden or disabled |

Gates are enforced by `sub-feature-gate.js` reading `data-sub-feature` attributes. The auth guard (`global-auth-guard.js`) checks all three layers on page load:
1. **Subscription** — is the subscription active?
2. **Plan Features** — does the plan include this module?
3. **RBAC Permissions** — does this user/role have this sub-feature?

---

## 18. Tables & Views Touched

| Table/View | Operations | Triggered by |
|---|---|---|
| `bookings_for_business_transaction` | SELECT | Page load, post-action refresh |
| `bookings` | SELECT (direct, service rows) | Edit modal open, View modal open |
| `bookings` | INSERT (via RPC) | `create_booking_atomic` |
| `bookings` | UPDATE (via RPC) | `update_booking_atomic`, `update_booking_status_atomic` |
| `business_transactions` | INSERT/UPDATE (via RPC) | All atomic RPCs |
| `customers` | SELECT (via booking modal dropdowns) | New Booking modal open |
| `customers` | INSERT (via RPC) | `create_customer_atomic` (new phone) |
| `services` | SELECT | New/Edit booking modal open, Picker modal |
| `staff` | SELECT | New/Edit booking modal open, Picker modal |
| `packages` | SELECT | New/Edit booking modal open, Picker modal |
| `package_services` | SELECT | New/Edit booking modal open, Picker modal |
| `service_categories` | SELECT | New Booking modal open |

---

## 19. All RPCs Called

| RPC Name | Called From | Purpose |
|---|---|---|
| `create_booking_atomic` | New Booking modal → Confirm Booking | Create new booking + all service rows atomically |
| `create_customer_atomic` | New Booking modal → Confirm Booking (if new phone) | Create customer record on-the-fly |
| `update_booking_atomic` | Edit Booking modal → Save Changes; Edit modal via global modal | Update schedule, services, staff, status |
| `update_booking_status_atomic` | Manage Booking → Update Status; payment bridge (auto-complete after payment) | Status-only update |
| `process_booking_payment_atomic` | Collect button → Payment modal → Confirm | Record payment, update payment_status |
| `process_booking_refund_atomic` | Refund modal → Issue Refund | Process refund, reverse customer stats |
| `get_calendar_month_bookings_summary` | Calendar nav (Prev/Next/Today) | Get daily booking counts for month grid |

---

> [!TIP] All write RPCs are **SECURITY DEFINER** functions in Supabase. They enforce company/branch tenancy internally. The frontend passes `p_company_id` and `p_branch_id` from `localStorage`, but the RPC validates these against the authenticated JWT's claims before mutating any data.

