# Module 15: Notifications & Notification Center — Developer Interaction & Technical Map

## 1. Module Overview & Principles

The **Notifications** module provides an end-to-end, multi-channel alert and activity tracking system for the BharathBots Salon SaaS platform. It consists of two complementary presentation layers:
1. **Dedicated Notification Center** ([`notifications.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/notifications.html)): A full-page management dashboard providing server-side pagination, 10 category filters, date range filters, debounced text search, item navigation, and bulk read operations.
2. **Global Interactive Bell Dropdown & In-App Toast Engine** ([`scripts/notification-manager.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/notification-manager.js)): Embedded into the application shell header across every page in the SaaS platform, providing live unread counters, an interactive flyout tray, user toast snoozing, and Web Audio API chime notifications.

### Core Architectural Principles
1. **Zero-Trust Authoritative Notifications**:
   - The frontend never performs direct `INSERT`, `UPDATE`, or `DELETE` on notification tables.
   - Every mutation is routed through PostgreSQL `SECURITY DEFINER` routines in the `app` schema with `public` bridges:
     - Notification creation: `app.create_notification_atomic`
     - Single notification mark-as-read: `app.mark_notification_read_atomic`
     - Bulk mark-all-read: `public.mark_all_notifications_read`
     - User toast muting / preference persistence: `app.upsert_user_preferences_atomic`
2. **Tenant & Branch Context Isolation**:
   - Every notification record is stamped with `company_id` and optional `branch_id`.
   - Data access is strictly partitioned by `p_company_id` and active branch filters.
3. **Preference-Driven Multi-Tier Notification Matrix**:
   - In-app toasts, sound chimes, and external dispatches (WhatsApp, SMS, Email) are evaluated against the tenant's configuration in `platform.company_settings` (as configured in `settings-notifications.html`) before emitting alerts.
4. **Resilient Dual-Tier Storage**:
   - Notifications are authoritative in PostgreSQL (`app.notifications`).
   - A fast local cache (`notification_history_${companyId}_${branchId}`) maintains offline responsiveness and prevents UI flickering during network latency.

---

## 2. File & Script Architecture

### Pages (Views)
- [`notifications.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/notifications.html): The dedicated Notification Center view.
- [`settings-notifications.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/settings-notifications.html): Multi-channel notification settings matrix (In-App, WhatsApp, SMS, Email).

### JavaScript Modules
- [`notifications.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/notifications.js): Controller for `notifications.html`. Manages live Supabase query composition, category counts, filter tabs, date ranges, debounced search, DOM rendering, item clicks, and pagination controls.
- [`scripts/notification-manager.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/notification-manager.js): Global singleton running across all app pages. Injects header bell wrapper, manages unread count badge, renders dropdown flyout, executes audio chimes, dispatches floating toasts, and exposes `window.notifyEvent`.
- [`scripts/settings-notifications.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/settings-notifications.js): Manages company-wide notification rules and dispatches `save_notification_settings_atomic`.

---

## 3. Database Schema & Stored Procedures

### 3.1 Tables Involved

| Table | Schema | Description |
|---|---|---|
| `notifications` | `app` (viewed via `public`) | Master notification records containing `id`, `company_id`, `branch_id`, `user_id`, `category`, `event_key`, `title`, `message`, `link`, `metadata`, `is_read`, `read_at`, `created_at`. |
| `user_preferences` | `shared` | User-level UI preferences including `notifications` boolean (governing whether in-app popup toasts are snoozed/muted). |
| `company_settings` | `platform` / `app` | Company-level notification preference matrix across channels and event keys. |

### 3.2 PostgreSQL Stored Procedures

| Stored Procedure | Schema | Parameters | Invariants & Business Logic Enforced |
|---|---|---|---|
| `create_notification_atomic` | `app`, `public` | `p_company_id uuid, p_branch_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_category text DEFAULT 'general', p_event_key text DEFAULT NULL, p_title text DEFAULT 'Notification', p_message text DEFAULT '', p_link text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'` | Verifies that `p_company_id` is provided. Inserts a new record into `app.notifications` with `is_read = false` and `created_at = NOW()`. Returns JSON `{ success: true, id: uuid, created_at: timestamptz }`. |
| `mark_notification_read_atomic` | `app`, `public` | `p_notification_id uuid, p_company_id uuid DEFAULT NULL` | Verifies `p_notification_id`. Updates `app.notifications` setting `is_read = true` and `read_at = NOW()` where `id = p_notification_id` and tenant matches `p_company_id`. Returns JSON `{ success: true, notification_id: uuid }`. |
| `mark_all_notifications_read` | `public` | `p_company_id uuid, p_branch_id uuid DEFAULT NULL` | Bulk updates all unread notifications for the company (and optionally matching branch) setting `is_read = true, read_at = NOW()`. Returns JSON `{ success: true, marked_read: integer }`. |
| `upsert_user_preferences_atomic` | `app`, `public` | `p_user_id uuid, p_company_id uuid DEFAULT NULL, p_branch_id uuid DEFAULT NULL, p_language text DEFAULT NULL, p_theme text DEFAULT NULL, p_notifications boolean DEFAULT NULL` | Validates tenant access if `p_company_id` is supplied. Performs atomic upsert into `shared.user_preferences`. When `p_notifications` is updated, toggles toast snooze status. |

---

## 4. End-to-End Interaction Map

### 4.1 Dedicated Notification Center: `notifications.html`

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ NOTIFICATION CENTER (notifications.html)                                                    │
├──────────────────────────────────────────────────────┬──────────────────────────────────────┤
│ Page Header: Title & Subtitle                        │ Actions:                             │
│                                                      │ - [Mark all read] (#ncBtnMarkAllRead)│
│                                                      │ - [Settings] (settings-notifications)│
├──────────────────────────────────────────────────────┴──────────────────────────────────────┤
│ Category Filter Bar:                                                                        │
│ [All] [Bookings] [Customers] [Staff] [Sales] [POS] [Payments] [Marketing] [System] [Unread]│
│ (Each tab exhibits dynamic live unread / total count badge pills)                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Toolbar:                                                                                    │
│ - Search Box (#ncSearch with debounced input)        │ - Results counter (#ncResultsInfo)   │
│ - Date Range Dropdown (#ncDateRange)                 │ - Per Page Select (#ncPerPage)       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Notification List Container (#ncListWrap):                                                  │
│ - Shimmer Skeleton Loader (#ncSkeleton)              │ - Spinner Overlay (#ncSpinner)       │
│ - Empty State Display (#ncEmpty)                     │ - Interactive List Rows (#ncList)    │
│   Each Item: Category Icon | Title | Relative Time | Message | Chip | "View details →" link │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Pagination Footer (#ncPagination):                                                          │
│ - Summary: "Showing 1 to 25 of 142 notifications"    │ - Controls: [‹] [1] [2] […] [10] [›]  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Interaction Registry

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | RBAC / Feature Gate | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|---|
| 1 | **Mark All Read Button** | `#ncBtnMarkAllRead` | `click` | `handleMarkAllRead()` in `notifications.js` | Invokes `supabase.rpc('mark_all_notifications_read', { p_company_id, p_branch_id })`. Updates local cache. Refreshes category counts and notification list. | Mutates `app.notifications` | `admin`, `manager`, `staff` | Shows button spinner (`Marking…`). Reverts button on error and displays updated view. |
| 2 | **Settings Navigation Link** | `a.nc-btn[href="settings-notifications.html"]` | `click` | Native link href | Redirects user to notification channel settings. | Read-only | `admin`, `owner` | Instant page navigation. |
| 3 | **Category Filter Tab: All** | `.nc-tab[data-category="all"]` | `click` | Tab click handler in `notifications.js` | Sets `activeCategory = 'all'`, resets `currentPage = 1`, and triggers `fetchNotifications()`. | Read `app.notifications` | All authenticated roles | Sets `.active` class; updates list and pagination. |
| 4 | **Category Filter Tab: Bookings** | `.nc-tab[data-category="bookings"]` | `click` | Tab click handler | Sets `activeCategory = 'bookings'`, filters query by `category = 'bookings'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays booking-specific alerts (created, rescheduled, cancelled). |
| 5 | **Category Filter Tab: Customers** | `.nc-tab[data-category="customers"]` | `click` | Tab click handler | Sets `activeCategory = 'customers'`, filters query by `category = 'customers'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays customer creation & profile update alerts. |
| 6 | **Category Filter Tab: Staff** | `.nc-tab[data-category="staff"]` | `click` | Tab click handler | Sets `activeCategory = 'staff'`, filters query by `category = 'staff'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays staff shift & commission updates. |
| 7 | **Category Filter Tab: Sales** | `.nc-tab[data-category="sales"]` | `click` | Tab click handler | Sets `activeCategory = 'sales'`, filters query by `category = 'sales'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays product inventory sale alerts. |
| 8 | **Category Filter Tab: POS** | `.nc-tab[data-category="pos"]` | `click` | Tab click handler | Sets `activeCategory = 'pos'`, filters query by `category = 'pos'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays POS checkout & refund alerts. |
| 9 | **Category Filter Tab: Payments** | `.nc-tab[data-category="payments"]` | `click` | Tab click handler | Sets `activeCategory = 'payments'`, filters query by `category = 'payments'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays transaction payment records. |
| 10 | **Category Filter Tab: Marketing** | `.nc-tab[data-category="marketing"]` | `click` | Tab click handler | Sets `activeCategory = 'marketing'`, filters query by `category = 'marketing'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays coupon redemptions & membership activations. |
| 11 | **Category Filter Tab: System** | `.nc-tab[data-category="system"]` | `click` | Tab click handler | Sets `activeCategory = 'system'`, filters query by `category = 'system'`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Displays system maintenance and role updates. |
| 12 | **Category Filter Tab: Unread Only** | `#ncTabUnread` | `click` | Tab click handler | Sets `activeCategory = 'unread'`, filters query by `is_read = false`, resets page to 1, fetches notifications. | Read `app.notifications` | All authenticated roles | Filters list strictly to unread alerts. |
| 13 | **Search Notifications Input** | `#ncSearch` | `input` | Debounced search handler (280ms) in `notifications.js` | Composes SQL `OR` filter: `title.ilike.*term*,message.ilike.*term*`. Resets `currentPage = 1` and fetches notifications. | Read `app.notifications` | All authenticated roles | Debounces rapid typing. Clears results if no matches found. |
| 14 | **Date Range Dropdown** | `#ncDateRange` | `change` | Change handler in `notifications.js` | Sets `dateRange` to `all`, `today`, `7`, `30`, or `90` days. Composes `gte('created_at', dateIso)` filter. Resets to page 1. | Read `app.notifications` | All authenticated roles | Filters notifications by creation timeframe. |
| 15 | **Per-Page Selector** | `#ncPerPage` | `change` | Change handler in `notifications.js` | Updates `perPage` to 25, 50, or 100 rows. Re-calculates pagination range and fetches notifications. | Read `app.notifications` | All authenticated roles | Adjusts page boundary size. |
| 16 | **Notification Row Click** | `.nc-item[data-id]` | `click` / `keydown (Enter/Space)` | `handleItemClick(item, rowEl)` in `notifications.js` | If `is_read === false`: optimistically removes `.unread` class and `.nc-unread-dot`; dispatches `supabase.rpc('mark_notification_read_atomic', { p_notification_id, p_company_id })`; refreshes unread count badge. If `item.link` exists, navigates to target link. | Mutates `app.notifications` | All authenticated roles | Instant visual feedback. Background asynchronous RPC update. Smooth route redirection. |
| 17 | **Pagination Previous Page** | `.nc-page-btn (Prev)` | `click` | Click handler | Decrements `currentPage`, fetches notifications, scrolls smoothly to top of page. | Read `app.notifications` | All authenticated roles | Disabled on page 1. |
| 18 | **Pagination Numbered Button** | `.nc-page-btn (Page N)` | `click` | Click handler | Sets `currentPage = N`, fetches notifications, scrolls smoothly to top. | Read `app.notifications` | All authenticated roles | Highlights active page in blue. |
| 19 | **Pagination Next Page** | `.nc-page-btn (Next)` | `click` | Click handler | Increments `currentPage`, fetches notifications, scrolls smoothly to top. | Read `app.notifications` | All authenticated roles | Disabled on last page. |
| 20 | **Branch Switcher Sync** | `#branchSelect` / `branch:changed` | `change` / custom event | Event listener in `notifications.js` | Scopes notification queries to the selected branch (`branch_id.is.null,branch_id.eq.${branchId}`), resets page to 1, and refetches records. | Read `app.notifications` | All authenticated roles | Seamless branch switching. |

---

### 4.2 Application Shell Bell & Interactive Dropdown: `scripts/notification-manager.js`

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION HEADER BELL & DROPDOWN (scripts/notification-manager.js)                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Header Bell Button: [🔔] + Red Counter Badge Pill (.notif-badge)                             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Notification Dropdown Flyout (#notificationDropdown):                                       │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Header: Notifications | [3 Unread Pill] | Actions: [🔕 Snooze] [⚙️ Settings]             │ │
│ ├─────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Scrollable List (.notif-list - max 20 items):                                           │ │
│ │ - Row 1: [Calendar Icon] New Booking: John Doe - Haircut (2m ago) [Blue Dot]             │ │
│ │ - Row 2: [Cart Icon] POS Sale Completed: ₹1,250 (15m ago)                               │ │
│ │ - Row 3: [Tag Icon] Coupon REDEEM20 Used (1h ago)                                      │ │
│ ├─────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Footer: [Mark all as read] | [Clear all] | [View all notifications →]                   │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Interaction Registry

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | RBAC / Feature Gate | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|---|
| 1 | **Header Bell Button** | `button.icon-btn` (with bell icon) | `click` | `toggleDropdown()` in `scripts/notification-manager.js` | Closes any open profile menu. Toggles `.show` on `#notificationDropdown`. If opening, triggers `fetchNotificationsFromSupabase(20)`. | Read `app.notifications` | All authenticated roles | Animated fade & slide down transition. |
| 2 | **Bell Badge Counter** | `.notif-badge` | Computed / Automatic | `updateBellBadge()` in `scripts/notification-manager.js` | Evaluates total unread notifications in active cache. If unread count > 0, renders red badge with count (or `99+`); otherwise removes badge. | In-memory | All authenticated roles | Real-time DOM badge synchronization. |
| 3 | **Snooze / Mute Toasts Button** | `#notifBtnSnooze` | `click` | `toggleSnooze()` in `scripts/notification-manager.js` | Toggles local snooze state. Dispatches `client.rpc('upsert_user_preferences_atomic', { p_user_id, p_company_id, p_branch_id, p_notifications: !newMuted })`. | Mutates `shared.user_preferences` | All authenticated roles | Changes button styling to amber `.snoozed` state; silences floating popups. |
| 4 | **Dropdown Settings Link** | `#notifBtnSettings` | `click` | Native href `settings-notifications.html` | Closes dropdown and navigates user to notification preferences settings. | Read-only | `admin`, `owner` | Instant page navigation. |
| 5 | **Dropdown Item Click** | `.notif-item[data-index]` | `click` | Click handler in `scripts/notification-manager.js` | Marks notification as read in local cache. Calls `supabase.rpc('mark_notification_read_atomic', { p_notification_id, p_company_id })`. Updates bell badge. If `item.link` is defined, navigates to target URL. | Mutates `app.notifications` | All authenticated roles | Instant mark-as-read feedback; seamless navigation. |
| 6 | **Dropdown Mark All As Read** | `#notifBtnMarkAllRead` | `click` | Click handler in `scripts/notification-manager.js` | Sets `read = true` for all cached items. Updates bell badge. Invokes `supabase.rpc('mark_all_notifications_read', { p_company_id, p_branch_id })`. | Mutates `app.notifications` | All authenticated roles | Re-renders dropdown with unread indicators removed. |
| 7 | **Dropdown Clear All History** | `#notifBtnClearAll` | `click` | Click handler in `scripts/notification-manager.js` | Empties the local storage notification cache for the tenant. Updates bell badge. Renders empty state. | In-memory | All authenticated roles | Clears cached items immediately. |
| 8 | **Dropdown View All Link** | `#notifBtnViewAll` | `click` | Native href `notifications.html` | Closes dropdown and navigates user to the dedicated Notification Center. | Read-only | All authenticated roles | Instant page navigation. |
| 9 | **Global Click Outside** | `document` | `click` | Document click listener | If click target is outside `#notificationDropdown` and not on the bell button, closes the dropdown flyout. | In-memory | None | Clean dismiss on outside click. |

---

### 4.3 Global In-App Toast & Web Audio Chime Engine

When any module across the application fires an event:
```javascript
window.notifyEvent('bookings', 'evt_booking_created', {
    title: 'New Booking Confirmed',
    message: 'Priya Sharma booked Deluxe Facial at 4:00 PM',
    link: 'bookings.html?id=...'
});
```

The Notification Manager executes the following pipeline:
1. **Preference Check**: Verifies if `company_settings` allows in-app notifications for `category` and `eventKey`.
2. **Snooze Check**: If user has snoozed alerts (`isToastsMuted() === true`), suppresses toast and audio chime.
3. **Web Audio Chime**: Synthesizes a soft, pleasant notification sound using Web Audio API oscillators (two-tone melodic chime: 587.33 Hz $\rightarrow$ 880 Hz) without requiring external audio asset downloads.
4. **Toast Dispatcher**: Renders a floating, card-styled notification toast in the top-right viewport:
   - Displays category icon and custom badge color.
   - Title, message, and timestamp.
   - Dismiss button (`×`).
   - If `link` provided, entire card is clickable to navigate to the target entity.
   - Auto-dismisses after 5.5 seconds with slide-out transition.
5. **Authoritative Persistence**: Calls `client.rpc('create_notification_atomic', { ... })` in the background to persist the notification record into `app.notifications`.

---

## 5. Security & Zero-Trust Verification

1. **Zero Direct Client Writes**:
   - `notifications.html`, `notifications.js`, and `scripts/notification-manager.js` contain **zero** direct `INSERT`, `UPDATE`, or `DELETE` SQL calls against `notifications` or `user_preferences`.
   - All write operations execute through `app.*_atomic` procedures declared with `SECURITY DEFINER`.
2. **Tenant Scoping Invariants**:
   - Every procedure validates that `p_company_id` is non-null and corresponds to the authenticated tenant.
   - Cross-tenant data leakage is strictly blocked at the database engine level.
3. **Graceful Offline Degradation**:
   - When the user is offline or during intermittent database connectivity, `notifications.js` falls back to `localStorage` caches without breaking user workflow.

---

## 6. Developer Reference Summary

| Property | Details |
|---|---|
| **Dedicated Center** | `notifications.html` + `notifications.js` |
| **Global Manager** | `scripts/notification-manager.js` (embedded in `global-header`) |
| **Settings Module** | `settings-notifications.html` + `scripts/settings-notifications.js` |
| **PostgreSQL Stored Procedures** | `app.create_notification_atomic`, `app.mark_notification_read_atomic`, `public.mark_all_notifications_read`, `app.upsert_user_preferences_atomic` |
| **Database Tables** | `app.notifications`, `shared.user_preferences`, `platform.company_settings` |
| **Event Dispatcher API** | `window.notifyEvent(category, eventKey, payload)` |
| **Channel Integrations** | In-App Toasts, Header Bell Dropdown, WhatsApp, SMS, Email |
| **Audit Status** | ✅ 100% Migrated, Verified, Zero Direct Client Mutations |

