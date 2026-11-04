# Module 11: Reports & Analytics — Interaction & Backend Execution Map

## 1. Module Overview & Architecture

The **Reports & Analytics** module delivers enterprise business intelligence, revenue tracking, audit logs, and performance metrics across the salon business.

### 3-Tier Navigation Hierarchy
1. **Report Library Hub** (`reports.html`): High-level categorization into 7 operational domains with plan-tier lock indicators.
2. **Category Directory** (`report-category.html?cat=...`): Sub-reports listing with card descriptions and deep links.
3. **Report Detail Engine** (`report-detail.html?type=...&cat=...`): Full interactive analytics view featuring real-time branch switching, custom date-range popover, live KPI stat cards, dual Chart.js visualizations (bar/line trend + interactive doughnut with center statistics), search-filtered paginated data tables, and CSV export.

### Core Architectural Principles
- **Zero-Trust Frontend / Authoritative Backend**: All analytical aggregations, margin computations, cancellation rates, and financial metrics are executed on PostgreSQL using 7 specialized Master RPCs (`SECURITY DEFINER`). The frontend never aggregates raw financial records itself; it displays authoritative backend data.
- **Master Stored Procedures**:
  1. `public.get_financial_report(p_company_id, p_branch_id, p_start_date, p_end_date)`
  2. `public.get_bookings_report(p_branch_id, p_company_id, p_start_date, p_end_date)`
  3. `public.get_customers_report(p_company_id, p_branch_id, p_start_date, p_end_date, p_customer_id)`
  4. `public.get_staff_report(p_company_id, p_branch_id, p_start_date, p_end_date, p_staff_id)`
  5. `public.get_product_sales_report(p_company_id, p_branch_id, p_start_date, p_end_date)`
  6. `public.get_memberships_report(p_company_id, p_branch_id, p_start_date, p_end_date)`
  7. `public.get_discount_report(p_company_id, p_branch_id, p_start_date, p_end_date)`
- **Plan Tier Gating**: Reports are guarded by `data-plan-feature` attributes (`report_financial`, `report_memberships`, `report_bookings`, `report_customers`, `report_staff_performance`, `report_product_sales`, `report_discount_usages`). If a tenant's subscription does not include a feature, UI cards display a lock badge and clicking displays the plan upgrade modal.
- **Tenant Isolation**: Every RPC accepts `p_company_id` and optional `p_branch_id`, validating company access and multi-branch permissions.

---

## 2. Report Library Hub (`reports.html`)

### Category Inventory & Feature Gates

| Category Card | URL Target | Report Count | Plan Feature Gate | Sub-Feature Gate | In-App Sub-Reports |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Financial** | `report-category.html?cat=financial` | 7 reports | `data-plan-feature="report_financial"` | `data-sub-feature="report_financial_view"` | Overview, Revenue, Payments, Expenses, Discounts, Refunds, Pending Dues |
| **Memberships** | `report-category.html?cat=memberships` | 5 reports | `data-plan-feature="report_memberships"` | `data-sub-feature="report_memberships_view"` | Overview, Sales & Revenue, Members & Renewals, Benefits & Usage, Cancellations |
| **Bookings** | `report-category.html?cat=bookings` | 5 reports | `data-plan-feature="report_bookings"` | `data-sub-feature="report_bookings_view"` | Total Bookings, Completed, Cancelled, No-Shows, Refunded |
| **Customers** | `report-category.html?cat=customers` | 2 reports | `data-plan-feature="report_customers"` | `data-sub-feature="report_customers_view"` | Customer Overview, Customer 360° Insights |
| **Staff Performance** | `report-category.html?cat=staff` | 2 reports | `data-plan-feature="report_staff_performance"` | `data-sub-feature="report_staff_performance_view"` | Staff Overview, Staff 360° Insights |
| **Product Sales** | `report-category.html?cat=products` | 7 reports | `data-plan-feature="report_product_sales"` | `data-sub-feature="report_product_sales_view"` | Overview, Product-wise, Categories, Transactions, Discounts, Returns & Refunds, Payments |
| **Discount Usages** | `report-category.html?cat=discounts` | 1 report | `data-plan-feature="report_discount_usages"` | `data-sub-feature="report_discount_usages_view"` | Discount Usages Report (Coupons, Offers, Memberships) |

### Gate Verification Flow
1. On `DOMContentLoaded`, `applyReportPlanGates()` calls `resolvePlanFeatures()`.
2. For each `.category-card[data-plan-feature]`, checks `isFeatureUnlocked(planKey, planProfile)`.
3. If locked:
   - Injects `.plan-lock-pill` (`🔒 Advance Plan`) into card header.
   - Intercepts clicks (`e.preventDefault()`, `e.stopPropagation()`) and opens `showPlanUpgradeModal(planKey)`.

---

## 3. Category Directory (`report-category.html`)

| Element Selector / Event | UI Label / Icon | Trigger / Action | Frontend Behavior |
| :--- | :--- | :--- | :--- |
| `#backLink`<br>`click` | `← Back to Report Library` | Link navigation | Navigates back to `reports.html`. |
| `#categoryBanner` | Dynamic Title & Subtitle | Loaded via `?cat=` query | Injects domain title, subtitle, and feather icon. |
| `.sub-report-card`<br>`click` | Sub-Report Title & Description | Link navigation | Navigates to `report-detail.html?type=${sr.type}&cat=${cat}`. |

---

## 4. Report Detail View (`report-detail.html`)

### 4.1 Header Controls & Filter Ribbon

| Element Selector / Event | Control Type | Trigger / Action | Frontend Behavior | Backend / RPC Execution |
| :--- | :--- | :--- | :--- | :--- |
| `#reportBackLink`<br>`click` | Link | Click | Navigates back to `report-category.html?cat=${backCat}` or `reports.html`. | None |
| `#filterBranch`<br>`change` | Select Dropdown | Branch Selection | Reads selected `branch_id` (or `all`). Triggers active module `render()`. | Passes `p_branch_id` into Master RPC. |
| `#btnDateFilterModal`<br>`click` | Button Pill | Click | Toggles `#reportDateFilterMenu` popover modal (`.show`). | Pure UI toggle. Closes on click outside. |
| `input[name="reportPresetDate"]`<br>`change` | Radio Buttons | Preset Selection | Computes start and end date strings. Options: `today`, `last_7_days`, `last_30_days` (default), `last_3_months`, `last_6_months`, `last_12_months`, `all_time`. | Updates `#filterStartDate` and `#filterEndDate`. Triggers `#btnApplyFilters`. |
| `#labelCustomDates`<br>`click` | Radio Option | Click | Switches popover view from `#datePresetsView` to `#dateCustomView`. | Reveals custom calendar inputs. |
| `#btnBackToPresets`<br>`click` | Button | Click | Returns view from custom inputs back to `#datePresetsView`. | Pure UI view switch. |
| `#filterStartDate`<br>`#filterEndDate` | Date Inputs | Date picking | Sets date boundaries for custom reporting. | Used on Apply. |
| `#btnFilterReset`<br>`click` | Button | Click | Resets dates to "Last 30 Days", updates radio, closes popover, triggers `#btnApplyFilters`. | Re-runs RPC for default 30-day window. |
| `#btnApplyFilters`<br>`click` | Button | Click | Closes popover, updates `#dateFilterLabel`, and invokes category module renderer. | Executes Master RPC with `p_start_date` and `p_end_date`. |
| `#btnExportCSV`<br>`click` | Action Button | `exportBtn.onclick` | Reads active `filteredRows`, strips HTML tags, escapes strings, formats RFC-4180 CSV, creates Blob, and triggers browser file download. | Client-side export of authoritative server data. |

---

### 4.2 KPI Stat Cards & Snapshot Panels

#### A. Generic KPI Row (`#kpiRow`)
Used across Financial, Customer, Staff, Product Sales, and Discount reports.
- Supports 3, 4, or 5 cards dynamically (`updateKPIs(k1, k2, k3, k4, k5)`).
- Cards display Label, Main Value, and Sub-label / Sub-HTML comparison metrics.

#### B. Bookings Snapshot Panels (Specialized 4-Card Dashboards)
Used when `isSnapshotReport` is true (`bk-total`, `bk-completed`, `bk-cancelled`, `bk-no-shows`, `bk-refunds`):
1. **Total Bookings Snapshot** (`#bkSnapshotPanel`):
   - Total Bookings (`#bkSnapTotal`) + mini activity bars (`#bkBarsTotal`).
   - Completed Bookings (`#bkSnapCompleted`) + Realized revenue (`#bkSnapRevenue`).
   - Cancelled Bookings (`#bkSnapCancelled`) + Estimated value loss (`#bkSnapCancelVal`).
   - No-Shows (`#bkSnapNoShows`) + Estimated missed revenue (`#bkSnapNoShowVal`).
2. **Completed Bookings Snapshot** (`#bkCompletedSnapshotPanel`):
   - Completed Count (`#bkCompSnapCount`), Completion Rate (`#bkCompSnapRate`), Realized Revenue (`#bkCompSnapRevenue`), Average Spend per Booking (`#bkCompSnapAvg`).
3. **Cancelled Bookings Snapshot** (`#bkCancelledSnapshotPanel`):
   - Cancelled Count (`#bkCancSnapCount`), Cancellation Rate (`#bkCancSnapRate`), Estimated Revenue Affected (`#bkCancSnapValue`), Same-Day Slot Cancellations (`#bkCancSnapSameDay`).
4. **No-Show Bookings Snapshot** (`#bkNoShowSnapshotPanel`):
   - No-Show Count (`#bkNoShowSnapCount`), Missed Value (`#bkNoShowSnapValue`), No-Show Rate (`#bkNoShowSnapRate`), Repeat No-Show Clients count (`#bkNoShowSnapRepeat`).
5. **Refunded Bookings Snapshot** (`#bkRefundSnapshotPanel`):
   - Refunded Bookings (`#bkRefundSnapCount`), Total Refund Payouts (`#bkRefundSnapTotal`), Average Refund (`#bkRefundSnapAvg`), Refund Rate (`#bkRefundSnapRate`).

---

### 4.3 Dual Visualization Engines (Chart.js)

1. **Left Chart — Performance Trend** (`#trendChart`):
   - Canvas context: `renderTrendChart(labels, values)`.
   - Renders chronological bar/line trends (Daily / Monthly Inflows, Outflows, Bookings volume, or POS sales).
   - Highlights the most recent period in distinct color (`#d946ef`).
2. **Right Chart — Distribution Doughnut** (`#distributionChart`):
   - Canvas context: `renderDistributionChart(labels, values)`.
   - 75% cutout modern doughnut chart with center metric statistics (`#donutCenterValue`, `#donutCenterLabel`).
   - Interactive glassmorphic tooltip formatting INR currency.
   - Dynamic HTML legend (`#donutLegend`) with percentage share and total amounts.

---

### 4.4 Data Table & Pagination Controls

| Element Selector / Event | Description / Behavior |
| :--- | :--- |
| `#tableTitleText` | Dynamic title displaying table identity (e.g. "All Bookings", "Financial Performance & Reconciliation Ledger"). |
| `#tableRecordCountBadge` | Formatted count badge displaying total records matching active criteria (e.g. "2,410 records"). |
| `#tableSearchInput`<br>`input` | Real-time text search. Filters loaded rows across all visible columns (customer name, phone, staff, service, category, reference #). Resets pagination to page 1. |
| `#reportTable thead tr` | Dynamic column headers injected by active report module. |
| `#reportTable tbody` | Row data rows. Supports formatted amounts, status pills, and interactive links. |
| `.customer-link`<br>`click` | Customer name anchor. Invokes `window.openCustomerProfileModal(customerId)` to open the Global Customer 360° Profile Modal. |
| `#paginationInfo` | Record range text: e.g. "Showing 1 to 10 of 42 records". |
| `#paginationControls` | Dynamic page number buttons, ellipses (`...`), and Previous / Next controls. |

---

## 5. Master RPC Stored Procedures & Schemas

### 5.1 Financial Reports: `public.get_financial_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date)`
- **Tables Queried**: `app.business_transactions`, `app.bookings`, `app.sales`, `app.membership_purchases`, `app.expenses`, `app.refunds`.
- **Payload Returned (`jsonb`)**:
  - `pnl`: `{ gross_revenue, total_outflow, net_profit, operating_margin_pct }`
  - `streams`: `{ bookings_rev, retail_rev, membership_rev }`
  - `collections`: `{ cash, upi, card, digital }`
  - `expenses`: `{ total, top_category, list: [...] }`
  - `discounts`: `{ total_discounts, coupon_discounts, offer_discounts, member_discounts }`
  - `refunds`: `{ total_refunded, refund_count, list: [...] }`
  - `pending_dues`: `{ total_due, count, list: [...] }`

### 5.2 Bookings Reports: `public.get_bookings_report`
- **Parameters**: `(p_branch_id uuid, p_company_id uuid, p_start_date date, p_end_date date)`
- **Tables Queried**: `app.bookings`, `app.customers`, `app.services`, `app.staff`, `app.business_transactions`, `app.refunds`.
- **Payload Returned (`jsonb`)**:
  - `kpis`: `{ total_bookings, completed_count, cancelled_count, noshow_count, refunded_count, realized_revenue, cancellation_rate, noshow_rate, refund_rate, avg_revenue }`
  - `trends`: `{ dates: [...], counts: [...], revenue: [...] }`
  - `status_distribution`: `{ completed, confirmed, cancelled, noshow, refunded }`
  - `records`: Array of individual appointment rows with staff, service, customer, payments, and statuses.

### 5.3 Customers Reports: `public.get_customers_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date, p_customer_id uuid)`
- **Tables Queried**: `app.customers`, `app.bookings`, `app.sales`, `app.membership_purchases`.
- **Payload Returned (`jsonb`)**: Customer retention rates, tier distribution (VIP, Loyal, Regular, New), lifetime spend across all three channels, and customer dossier activity ledger.

### 5.4 Staff Reports: `public.get_staff_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date, p_staff_id uuid)`
- **Tables Queried**: `app.staff`, `app.bookings`, `app.sales`, `app.membership_purchases`.
- **Payload Returned (`jsonb`)**: Team performance leaderboard, bookings executed, service revenue, retail product sales attributed, memberships sold, average ticket size, and staff 360° individual profile.

### 5.5 Product Sales Reports: `public.get_product_sales_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date)`
- **Tables Queried**: `app.sales`, `app.sale_items`, `app.products`, `app.product_categories`, `app.pos_refunds`.
- **Payload Returned (`jsonb`)**: SKU-level units sold, returns, category distribution, daily POS transaction records, discount erosion, and tender reconciliation.

### 5.6 Memberships Reports: `public.get_memberships_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date)`
- **Tables Queried**: `app.memberships`, `app.membership_purchases`, `app.customers`, `app.business_transactions`.
- **Payload Returned (`jsonb`)**: Active subscribers base, MRR, renewal pipeline, expiration horizon within 30 days, benefits redeemed on visits, churn rate, and cancellations audit log.

### 5.7 Discounts Report: `public.get_discount_report`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_start_date date, p_end_date date)`
- **Tables Queried**: `app.discount_usages`, `app.coupons`, `app.offers`, `app.membership_purchases`.
- **Payload Returned (`jsonb`)**: Complete audit trail of coupon redemptions, promotional offers, and member perks with margin impact.

