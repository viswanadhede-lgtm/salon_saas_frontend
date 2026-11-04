# Module 01 — Dashboard Interaction Map
**Page:** `dashboard.html`  
**Purpose:** Central command centre showing today's KPIs, upcoming/completed/no-show appointments, weekly revenue chart, top services, and product sales.

> [!NOTE]  
> The Dashboard is a **read-only module**. No button on this page mutates data directly. All writes happen in other modules that the dashboard navigates to, or via the global header/sidebar shell that is shared across all pages.

---

## Table of Contents
1. [Page Load Sequence](#1-page-load-sequence)
2. [Global Header — always present](#2-global-header--always-present)
3. [Global Sidebar — always present](#3-global-sidebar--always-present)
4. [KPI Stat Cards](#4-kpi-stat-cards)
5. [Appointments Tab Card](#5-appointments-tab-card)
6. [Weekly Revenue Chart](#6-weekly-revenue-chart)
7. [Top Services Cards](#7-top-services-cards)
8. [Product Sales Card](#8-product-sales-card)
9. [Global Customer Profile Modal](#9-global-customer-profile-modal)
10. [Error Handling Summary](#10-error-handling-summary)

---

## 1. Page Load Sequence

```
browser requests dashboard.html
  ├─ scripts/auth-loader.js          (synchronous, pre-head)
  ├─ scripts/app-shell.js            (ES module, type=module)
  │   ├─ fetches components/global-sidebar.html
  │   ├─ fetches components/global-header.html
  │   └─ calls initLayout()          → sidebar, submenus, profile menu, quick-actions, date chip
  ├─ dashboard.js                    (plain script tag, no type=module)
  │   ├─ dynamic import: scripts/dashboard/dashboard-state.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-kpis.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-sales.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-appointments.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-services.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-revenue.js
  │   ├─ dynamic import: scripts/dashboard/dashboard-navigation.js
  │   └─ runDashboardInit()
  │       ├─ initAppointmentTabs()
  │       └─ fires 6 parallel Supabase fetches (one per widget)
  ├─ scripts/global-auth-guard.js    (ES module)
  │   └─ validates JWT, populates header, injects notification-manager.js
  ├─ scripts/sub-features/sub-feature-gate.js
  └─ scripts/global-customer-profile-modal.js
```

**localStorage keys read on load:**
| Key | Used for |
|-----|----------|
| `token` | Auth check |
| `company_id` | Supabase query filter |
| `branch_id` / `active_branch_id` | Supabase query filter |
| `appContext` | Full user/branch context JSON |
| `selected_plan` | Plan badge in header |
| `sidebar_collapsed` | Sidebar width preference |

---

## 2. Global Header — always present

The header is injected from `components/global-header.html` on every authenticated page. All interactions here are global — not dashboard-specific.

---

### 2.1 Sidebar Toggle Button (`#sidebarToggle`)
| Field | Detail |
|-------|--------|
| **Element** | `<button id="sidebarToggle">` — icon-only button, top of sidebar |
| **Trigger** | Single click |
| **Frontend** | Toggles `.collapsed` class on `#sidebar`. Writes `localStorage.sidebar_collapsed = true/false`. Rotates toggle icon title between "Open sidebar" / "Close sidebar". |
| **Backend** | ❌ None — purely client-side preference. |
| **RBAC** | None |

---

### 2.2 Mobile Sidebar Toggle (`#mobileSidebarToggle`)
| Field | Detail |
|-------|--------|
| **Element** | `<button id="mobileSidebarToggle">` — hamburger icon, header left (visible on mobile only) |
| **Trigger** | Single click |
| **Frontend** | Toggles `.open` class on `#sidebar` (draws it in from left as overlay). Toggles `.active` on `#sidebarBackdrop`. Clicking the backdrop closes the drawer. `Escape` key also closes. |
| **Backend** | ❌ None |
| **RBAC** | None |

---

### 2.3 Branch Switcher (`#branchSelect`)
| Field | Detail |
|-------|--------|
| **Element** | `<select id="branchSelect">` — dropdown in header left |
| **Trigger** | `change` event when user picks a different branch |
| **Frontend** | Populated by `global-auth-guard.js` from `appContext.branches[]`. On change: updates `localStorage.active_branch_id`, then fires `window.refreshAllData(newBranchId)` which re-fetches all 6 dashboard widgets for the new branch. |
| **Backend** | Triggers read-only RPCs for the new branch (see §4–8). No mutations. |
| **RBAC** | Owners / managers with multi-branch access see all branches. Staff with assigned branch only see their branch (locked — badge `#branchLockBadge` shown instead of select). |
| **Notes** | If user has only one branch, the select is hidden and the lock badge is shown. |

---

### 2.4 New Booking Button (`#btnNewBooking`)
| Field | Detail |
|-------|--------|
| **Element** | `<button id="btnNewBooking" data-sub-feature="dashboard_create_booking">` — primary CTA in header right |
| **Trigger** | Single click |
| **Frontend** | Calls `window.openGlobalBookingModal()`. If the global booking modal module isn't loaded yet, it dynamically imports `scripts/global-booking-modal.js`, initializes it, then opens the modal. Opens a large booking creation modal overlay. |
| **Backend** | Modal itself calls `create_booking_atomic(...)` on form submission — documented in **Module 02 (Bookings)**. |
| **RBAC/Plan Gate** | `data-sub-feature="dashboard_create_booking"` — sub-feature gate applied by `sub-feature-gate.js`. If the user lacks this permission, the button is hidden or disabled. |

---

### 2.5 Plan Badge (`#headerPlanBadge`)
| Field | Detail |
|-------|--------|
| **Element** | `<div id="headerPlanBadge">` — non-clickable display chip showing plan name (e.g. "Growth") |
| **Trigger** | Rendered on page load. No click handler. |
| **Frontend** | Set by `updateHeaderBadges()` in `dashboard-state.js`, reads `localStorage.selected_plan`. |
| **Backend** | ❌ None — display-only. |

---

### 2.6 Notification Bell (`#headerNotificationBell`)
| Field | Detail |
|-------|--------|
| **Element** | `<button id="headerNotificationBell">` with red dot `.notification-dot` |
| **Trigger** | Single click |
| **Frontend** | Opens the notification panel/dropdown (managed by `notification-manager.js`, injected by `global-auth-guard.js`). The red dot is shown when there are unread notifications. |
| **Backend** | On open: reads `app.notifications` table (via RLS view) for the current user. On "Mark read": calls RPC `mark_notification_read_atomic(p_notification_id)`. On "Mark all read": calls `mark_all_notifications_read(p_user_id, p_company_id)`. |
| **Tables affected** | `app.notifications` — `is_read` column updated |
| **RBAC** | Notifications are user-scoped. Each user sees only their own. |

---

### 2.7 User Avatar / Profile Dropdown (`#avatarBtn`)
| Field | Detail |
|-------|--------|
| **Element** | `<div id="avatarBtn" role="button">` — user avatar circle, top-right of header |
| **Trigger** | Click or `Enter`/`Space` keypress |
| **Frontend** | Toggles `.show` on `#profileMenu` dropdown. Toggles `.active` on `#profileBackdrop`. Clicking outside or on backdrop closes it. `Escape` also closes. |
| **Backend** | ❌ None on open. |

The dropdown contains 5 items:

#### 2.7.1 Profile (`#menuItemProfile`)
| Field | Detail |
|-------|--------|
| **Trigger** | Click |
| **Frontend** | Closes dropdown → opens `#genericModalOverlay` with `#profileContent` shown, `#settingsContent` hidden. Modal title = "Profile". `hydrateProfileFromContext()` pre-fills all fields from `localStorage.appContext`. |
| **Fields shown** | First Name, Last Name, Phone (editable) · Email (read-only) · Emergency Contact Name/Phone · Role, Assigned Branch, Joined On, Last Login (all read-only) |
| **Backend on Save** | `update_user_profile_full_atomic(p_company_id, p_user_id, p_first_name, p_last_name, p_phone, p_email, p_emergency_contact_name, p_emergency_contact_number, p_profile_photo)` |
| **Tables affected** | `shared.users` — `first_name`, `last_name`, `phone_number`, `emergency_contact_name`, `emergency_contact_number`, `profile_photo_url` |
| **Post-save** | Updates `localStorage.appContext.user`, calls `window.populateGlobalHeader()` to refresh the header avatar/name, shows toast "Profile updated successfully!", closes modal. |
| **Validation** | First name is required. Photo must be JPEG/PNG/WebP ≤ 2 MB. |
| **RBAC** | Any logged-in user can edit their own profile. Email and role are read-only (cannot be self-changed). |

#### 2.7.1a Change Photo (`label[for="profilePhotoInput"]`)
| Field | Detail |
|-------|--------|
| **Element** | `<label class="change-photo-btn">` inside Profile modal — acts as file input trigger |
| **Trigger** | Click on label |
| **Frontend** | Opens native OS file picker (hidden `<input type="file" id="profilePhotoInput">`). On file selected: validates type (JPEG/PNG/WebP) and size (≤2 MB). Shows preview instantly in modal avatar and header avatar via `FileReader`. Stores file in `pendingProfilePhoto`. |
| **Backend** | Photo is uploaded on "Save Changes" click (not on file pick). `window.uploadProfilePhoto(file, user_id)` is called — uploads to Supabase Storage → returns public URL → passed to `update_user_profile_full_atomic`. |

#### 2.7.2 Schedule (`#menuItemSchedule`)
| Field | Detail |
|-------|--------|
| **Trigger** | Click |
| **Frontend** | Closes dropdown → opens `#scheduleModalOverlay`. Fetches the logged-in user's staff schedule. |
| **Backend** | Reads `app.staff_schedules` for the current user's staff profile (`shared.users.staff_id`). No write operations. |
| **Sub-tabs** | "This Week" / "Next Week" buttons toggle between `#paneThisWeek` and `#paneNextWeek`. Pure JS show/hide — no backend call. |
| **Close** | `#btnCloseScheduleFooter` or `#closeScheduleModal` or `Escape` |

#### 2.7.3 Settings (`#menuItemSettings`)
| Field | Detail |
|-------|--------|
| **Trigger** | Click |
| **Frontend** | Opens `#genericModalOverlay` with `#settingsContent` shown (profile content hidden). Title = "Settings". Fetches current preferences via `fetchAndPopulateSettings()`. |
| **Backend on load** | Reads `app.user_preferences` for `p_user_id` |
| **Backend on Save** | `upsert_user_preferences_atomic(p_user_id, p_company_id, p_language, p_theme, p_notifications_enabled, p_time_zone, p_datetime_format)` |
| **Tables affected** | `app.user_preferences` — upserted |
| **Fields** | Language (en/hi/te/ta), Theme (light/dark/system), Notifications (enabled/disabled), Time Zone (Asia/Kolkata/UTC), Date & Time Format |
| **RBAC** | User-scoped — each user manages their own preferences only |

#### 2.7.4 Support (`#menuItemSupport`)
| Field | Detail |
|-------|--------|
| **Trigger** | Click (direct `<a href="support.html">`) |
| **Frontend** | Navigates to `support.html` |
| **Backend** | ❌ None on click. Support page loads its own data. |

#### 2.7.5 Logout (`#menuItemLogout`)
| Field | Detail |
|-------|--------|
| **Trigger** | Click |
| **Frontend** | Closes dropdown → calls `window.openLogoutModal()` (opens a confirmation modal). On confirm: calls `window.handleLogout()` which clears localStorage (`token`, `appContext`, `company_id`, `branch_id`, etc.) → redirects to `signin.html`. |
| **Backend** | Supabase Auth `signOut()` called to invalidate the session JWT server-side. |
| **Tables affected** | `shared.users` — `last_logout_at` updated (if `update_user_last_login_atomic` is called) |

---

## 3. Global Sidebar — always present

Injected from `components/global-sidebar.html`. All items below are navigation links with RBAC/plan gating via `data-feature` attributes processed by `sub-feature-gate.js`.

| Nav Item | `data-feature` | Destination | Submenu? |
|----------|---------------|-------------|----------|
| Dashboard | `dashboard_access` | `dashboard.html` | No |
| Bookings | `bookings_management` | `bookings.html` | No |
| Customers | `customers_management` | `customers.html` | No |
| Staff | — | — | Yes (accordion) |
| ↳ Staff | `staff_management` | `staff.html` | — |
| ↳ Staff Schedules | `staff_schedules` | `staff-schedule.html` | — |
| Services | `services_management` | `services.html` | No |
| Sales | — | — | Yes |
| ↳ Point of Sale | `pos_system` | `pos.html` | — |
| ↳ Products | `product_management` | `products.html` | — |
| ↳ Sales History | `sales_history` | `sales-history.html` | — |
| Payments | — | — | Yes |
| ↳ Pending Payments | `pending_payments` | `pending-payments.html` | — |
| ↳ Payments History | `payments_history` | `payments-history.html` | — |
| Marketing | — | — | Yes |
| ↳ Offers | `marketing_offers` | `offers.html` | — |
| ↳ Coupons | `marketing_coupons` | `coupons.html` | — |
| ↳ Memberships | `marketing_memberships` | `memberships.html` | — |
| Analytics | — | — | Yes |
| ↳ Overview | `analytics_overview` | `overview.html` | — |
| ↳ Reports | `reports_access` | `reports.html` | — |
| ↳ Expenses | `analytics_expenses` | `expenses.html` | — |
| Settings | — | — | Yes |
| ↳ Company | `company_settings` | `company.html` | — |
| ↳ Users | `user_management` | `users.html` | — |
| ↳ Roles & Permissions | `roles_permissions` | `roles-permissions.html` | — |
| ↳ Billing & Subscription | `billing_subscription_management` | `billing-subscription.html` | — |

**Submenu accordion behavior:**
- Clicking a `.submenu-toggle` (Staff, Sales, Payments, Marketing, Analytics, Settings) calls `initSubmenus()` handler → toggles `.submenu-open` on the parent `<li>`.
- If sidebar is collapsed when user opens a submenu, the sidebar auto-expands.
- Current page is highlighted via `updateActiveNav()` using `ROUTE_NAV_MAP`.

**All sidebar links:** pure `<a href>` navigation — no backend calls on click.

---

## 4. KPI Stat Cards

Located in `.summary-cards` row at top of `#dashboardHome`.

### 4.1 On Page Load — All 4 KPI Cards populate together

| Field | Detail |
|-------|--------|
| **RPC** | `dashboard_statcards_four(p_branch_id, p_company_id)` |
| **Called by** | `fetchAndRenderDashboardKPIs()` in `scripts/dashboard/dashboard-kpis.js` |
| **Returns** | Single row: `todays_bookings`, `booking_trend`, `completed_appointments`, `completion_rate`, `no_shows`, `cancelled`, `todays_revenue`, `revenue_trend` |
| **Tables read (inside RPC)** | `app.bookings` |
| **Render** | Updates `#kpiTodayBookings`, `#kpiTodayBookingsTrend`, `#kpiCompletedAppts`, `#kpiCompletedApptsTrend`, `#kpiNoShows`, `#kpiCancelled`, `#kpiTodayRevenue`, `#kpiTodayRevenueTrend` |
| **RBAC** | Tenant-isolated by `company_id` + `branch_id`. RLS enforced inside RPC. |

---

### 4.2 KPI Card 1 — "Today's Bookings" (double-click)
| Field | Detail |
|-------|--------|
| **Element** | First `.stat-card` — `cursor:pointer` |
| **Trigger** | **Double-click** (`ondblclick` wired via inline `onStatCardDblClick()`) |
| **Frontend** | `window.location.href = 'todays-bookings.html'` |
| **Backend** | ❌ None on this action. |

---

### 4.3 KPI Card 2 — "Completed Appointments Today" (double-click)
| Field | Detail |
|-------|--------|
| **Trigger** | **Double-click** |
| **Frontend** | `window.location.href = 'completed-appointments.html'` |
| **Backend** | ❌ None on this action. |

---

### 4.4 KPI Card 3 — "No-shows & Cancellations" (double-click)
| Field | Detail |
|-------|--------|
| **Trigger** | **Double-click** |
| **Frontend** | `window.location.href = 'no-shows-cancellations.html'` |
| **Backend** | ❌ None on this action. |

---

### 4.5 KPI Card 4 — "Today's Revenue" — "View Details" link
| Field | Detail |
|-------|--------|
| **Element** | `<a href="todays-revenue.html" class="btn-text">View Details</a>` — top-right of card |
| **Trigger** | Single click |
| **Frontend** | Navigates to `todays-revenue.html` |
| **Backend** | ❌ None on click. |

> [!NOTE]
> The double-click on "Today's Revenue" card also goes to `todays-revenue.html` via the same `onStatCardDblClick()` handler.

---

## 5. Appointments Tab Card

Card: `#appointmentsTabCard` — 2/3 width, left-center of dashboard grid.

### 5.1 On Page Load — Appointments Fetch

| Field | Detail |
|-------|--------|
| **Data source** | Direct table query (not RPC): `supabase.from('bookings_for_business_transaction').select('*')` |
| **Filter** | `.eq('branch_id', currentBranchId).eq('booking_date', today).eq('company_id', companyId).order('start_time', ascending)` |
| **Called by** | `fetchAndRenderAppointments()` in `scripts/dashboard/dashboard-appointments.js` |
| **What it reads** | `booking_id`, `customer_id`, `customer_name`, `service_name`, `staff_name`, `status`, `start_time`, `end_time`, `booking_date` |
| **View name** | `bookings_for_business_transaction` (a Supabase view with `security_invoker = true`) |
| **Split into** | Upcoming (not completed/cancelled/no-show), Completed, No-show/Cancelled |
| **Show limit** | 3 items per tab (`.slice(0, 3)`) |
| **Badge update** | `#badgeUpcoming`, `#badgeCompleted`, `#badgeNoshow` — count of all records (not just 3 shown) |
| **RBAC** | Tenant-isolated. RLS on underlying `app.bookings`. |

---

### 5.2 Tab Buttons — Upcoming / Completed / No-shows

| Element | `data-tab` | Action |
|---------|-----------|--------|
| `<button class="tab-btn active">` | `upcoming` | Shows `#tabUpcoming`, updates "View All" link to `upcoming-appointments.html` |
| `<button class="tab-btn">` | `completed` | Shows `#tabCompleted`, updates link to `completed-appointments.html` |
| `<button class="tab-btn">` | `noshow` | Shows `#tabNoshow`, updates link to `no-shows-cancellations.html` |

**Behavior:** `initAppointmentTabs()` adds `click` listeners. Clicking a tab:
1. Removes `.active` from all tab buttons, adds to clicked button.
2. Removes `.active` from all `.tab-pane`, adds to matching pane.
3. Updates `href` on `#viewAllAppointmentsBtn`.
4. **No backend call.** Data is already fetched — just re-renders from memory.

---

### 5.3 "View All" Link (`#viewAllAppointmentsBtn`)
| Field | Detail |
|-------|--------|
| **Element** | `<a id="viewAllAppointmentsBtn" class="btn-text">View All</a>` — top-right of card header |
| **Trigger** | Single click |
| **Frontend** | Navigates to whichever page corresponds to the currently active tab (upcoming/completed/no-shows). `href` is dynamically updated when tabs are switched. |
| **Backend** | ❌ None on click. |

---

### 5.4 Appointment Row — Customer Name Link
| Field | Detail |
|-------|--------|
| **Element** | `<span class="customer-link">` inside each rendered appointment row |
| **Trigger** | Single click via `onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${escapedCustName}')"` |
| **Frontend** | Opens `#customerProfileBookingModal` (injected by `global-customer-profile-modal.js`). Shows loading state, then renders full customer profile. |
| **Backend** | Calls 2 RPCs in parallel (see §9) |

---

### 5.5 Appointment Row — Double-click (navigate to detail)
| Field | Detail |
|-------|--------|
| **Element** | Each `.appointment-item` div |
| **Trigger** | **Double-click** via `ondblclick="navigateToBooking('${b.status}', '${b.booking_id}')"` |
| **Frontend** | `window.navigateToBooking(status, bookingId)` → navigates based on status: `completed` → `completed-appointments.html?highlight=${bookingId}`, `cancelled`/`no-show` → `no-shows-cancellations.html?highlight=${bookingId}`, anything else → `upcoming-appointments.html?highlight=${bookingId}` |
| **Backend** | ❌ None. The destination page uses `?highlight=` query param to scroll to and highlight that booking. |

---

## 6. Weekly Revenue Chart

Card: `.revenue-card` — lower left area.

| Field | Detail |
|-------|--------|
| **On load** | `fetchAndRenderWeeklyRevenue(branchId)` → `scripts/dashboard/dashboard-revenue.js` |
| **RPC** | `dashboard_weekly_revenue(p_branch_id, p_company_id, p_today)` |
| **Returns** | Array of 7 rows: `{ day_label, revenue, is_today }` |
| **Tables read** | `app.bookings` (revenue aggregated by date, last 7 days) |
| **Render** | Renders `.bar-group` elements in `#weeklyRevenueChart`. Today's bar has `.active` class. Bar height = `(revenue / maxRevenue) * 100%`. Tooltip on hover shows `₹amount`. |
| **Interactions** | Chart bars are **not clickable**. Display-only visual. |
| **RBAC** | Tenant-isolated. |

---

## 7. Top Services Cards

### 7.1 "Top Services This Week" Card
| Field | Detail |
|-------|--------|
| **On load** | `fetchAndRenderTopServicesWeekly(branchId)` → `scripts/dashboard/dashboard-services.js` |
| **RPC** | `dashboard_top_services(p_branch_id, p_company_id, p_period='week', p_today)` |
| **Returns** | Array: `{ service_name, count }` — top services by booking count this week |
| **Tables read** | `app.bookings` + `app.services` (joined inside RPC) |
| **Render** | `#topServicesWeeklyList` — bar chart list with colored dots and progress bars |
| **Interactions** | List items are **not clickable**. Display-only. |

### 7.2 "Top Services Today" Card
| Field | Detail |
|-------|--------|
| **On load** | `fetchAndRenderTopServicesToday(branchId)` |
| **RPC** | `dashboard_top_services(p_branch_id, p_company_id, p_period='today', p_today)` |
| **Returns** | Same shape as above but filtered to today |
| **Render** | `#topServicesTodayList` |
| **Interactions** | Not clickable. Display-only. |

---

## 8. Product Sales Card

Card: `.product-sales-card` — 1/3 width, right-side.

| Field | Detail |
|-------|--------|
| **On load** | `fetchAndRenderProductSales(branchId)` → `scripts/dashboard/dashboard-sales.js` |
| **Data source** | Direct table query: `supabase.from('sales').select('product_name, quantity, total_amount, price, status')` |
| **Filter** | `.eq('branch_id', branchId).in('status', ['paid','completed','Paid','Completed']).gte('created_at', today 00:00).lte('created_at', today 23:59).eq('company_id', companyId)` |
| **Table read** | `app.sales` (direct read via RLS policy) |
| **Aggregation** | Client-side: groups by `product_name`, sums `quantity` and `total_amount`. Sorts by count desc, then revenue desc. Shows top 5. |
| **Render** | `#productSalesList` — shows product name, quantity sold (colored pill), horizontal progress bar, revenue. |
| **Interactions** | List items are **not clickable**. Display-only. |
| **RBAC** | RLS on `app.sales` enforces tenant isolation. |

---

## 9. Global Customer Profile Modal

Injected on **every authenticated page** by `scripts/global-customer-profile-modal.js`.  
Triggered from appointment row customer-name click (§5.4) and anywhere else `window.viewCustomerProfile(customerId, customerName)` is called.

### 9.1 Open Customer Profile Modal
| Field | Detail |
|-------|--------|
| **Function** | `window.viewCustomerProfile(customerId, customerName)` |
| **Frontend** | Opens `#customerProfileBookingModal`. Shows loading spinner. |
| **If `customerId` is null/undefined** | Attempts fallback: `supabase.from('customers').select('customer_id').eq('customer_name', name).limit(1)` to find the ID. If still not found → shows `alert('Walk-in customer — no profile record found.')`. |
| **RPCs called** (parallel) | 1. `Global_customer_profile_modal(p_company_id, p_branch_id, p_customer_id)` — returns full customer profile, booking history, membership info. 2. `customers_page_clickable_total_spent(p_company_id, p_branch_id, p_customer_id)` — returns lifetime spend total |
| **Tables read (inside RPCs)** | `app.customers`, `app.bookings`, `app.memberships`, `app.customer_memberships`, `app.payments` |
| **Render** | `#profModalBody` — rich HTML layout with customer details, stats, booking history |
| **Interactions inside modal** | Customer name edit, booking history rows — these are view-only in this context |
| **RBAC** | Tenant-isolated by `company_id` + `branch_id` |

### 9.2 Close Customer Profile Modal
| Field | Detail |
|-------|--------|
| **Element** | `<button id="btnCloseProfModal">` × button in modal header |
| **Trigger** | Click, or clicking the overlay backdrop |
| **Frontend** | Removes `.active` from `#customerProfileBookingModal` |
| **Backend** | ❌ None |

---

## 10. Error Handling Summary

| Scenario | UI Behavior |
|----------|-------------|
| `dashboard_statcards_four` fails | Console error logged. KPI values remain `--` (placeholder). |
| `bookings_for_business_transaction` query fails | Shows red error message in each tab pane: "Error loading bookings." |
| `dashboard_weekly_revenue` fails | Chart area shows red: "Error loading revenue." |
| `dashboard_top_services` fails | List shows red: "Error loading services." |
| Product sales query fails | List shows red: "Error loading sales." |
| `Global_customer_profile_modal` fails | Modal body shows error state. |
| Walk-in customer click | `alert('Walk-in customer — no profile record found.')` |
| Profile save validation fails | `alert('First name is required.')` or relevant message |
| Auth token missing on load | `console.warn('No token found, redirecting to sign in')` — auth guard handles actual redirect |

---

## Appendix: RPC & Query Reference for Dashboard Module

| Widget | Supabase Call | Type | Params |
|--------|--------------|------|--------|
| KPI Cards | `dashboard_statcards_four` | RPC | `p_branch_id`, `p_company_id` |
| Appointment Tabs | `bookings_for_business_transaction` | Table/View | `branch_id`, `booking_date`, `company_id` |
| Weekly Revenue | `dashboard_weekly_revenue` | RPC | `p_branch_id`, `p_company_id`, `p_today` |
| Top Services (Weekly) | `dashboard_top_services` | RPC | `p_branch_id`, `p_company_id`, `p_period='week'`, `p_today` |
| Top Services (Today) | `dashboard_top_services` | RPC | `p_branch_id`, `p_company_id`, `p_period='today'`, `p_today` |
| Product Sales | `sales` (direct) | Table | `branch_id`, `company_id`, `created_at`, `status` |
| Customer Profile | `Global_customer_profile_modal` | RPC | `p_company_id`, `p_branch_id`, `p_customer_id` |
| Customer Total Spent | `customers_page_clickable_total_spent` | RPC | `p_company_id`, `p_branch_id`, `p_customer_id` |
| Notification mark read | `mark_notification_read_atomic` | RPC | `p_notification_id` |
| Notification mark all | `mark_all_notifications_read` | RPC | `p_user_id`, `p_company_id` |
| Profile Save | `update_user_profile_full_atomic` | RPC | `p_company_id`, `p_user_id`, `p_first_name`, `p_last_name`, `p_phone`, `p_email`, `p_emergency_contact_name`, `p_emergency_contact_number`, `p_profile_photo` |
| Settings Save | `upsert_user_preferences_atomic` | RPC | `p_user_id`, `p_company_id`, `p_language`, `p_theme`, `p_notifications_enabled`, `p_time_zone`, `p_datetime_format` |
| Customer fallback | `customers` (direct) | Table | `company_id`, `customer_name` |
