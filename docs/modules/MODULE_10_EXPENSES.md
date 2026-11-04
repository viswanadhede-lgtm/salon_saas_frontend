# Module 10: Expenses & Financials — Interaction & Backend Execution Map

## 1. Module Overview & Architecture

The **Expenses & Financials** module (`expenses.html`, `scripts/expenses.js`) tracks all salon expenditures across operational categories (Rent, Salary, Products, Utilities, Maintenance, Marketing, and Other).

### Core Architectural Principles
- **Zero-Trust Frontend / Authoritative Backend**: All inserts, updates, and soft-deletions run through authoritative PostgreSQL `SECURITY DEFINER` stored procedures (`app.create_expense_atomic`, `app.update_expense_atomic`, `app.delete_expense_atomic`). No direct Supabase table mutations (`.insert()`, `.update()`, `.delete()`) exist.
- **Tenant Isolation**: Every RPC enforces `shared.verify_tenant_access(p_company_id, p_branch_id)`. Expenses are isolated by `company_id` and optionally scoped to specific branches (`branch_id.eq.{id},branch_id.is.null`).
- **Audit Trails**: Updates update `updated_at = NOW()`. Soft deletion sets `status = 'deleted'`.
- **Stat Cards with Automated Fallback**: KPI metrics are fetched in a single roundtrip via `public.get_expenses_stat_cards(p_company_id, p_branch_id)`. If the RPC encounters any network or database exception, an automated client-side computation parses loaded records to guarantee zero UI interruption.
- **Client-Side Paginated Table**: Configured with a 25 items/page threshold. The pagination controls dynamically hide when the dataset fits on a single page ($\le 25$ rows) and activate automatically on the 26th record.

---

## 2. Interactive Controls & Action Inventory

### 2.1 Header & Page Actions

| Element Selector / Event | UI Label / Icon | Trigger / Action | Frontend Behavior | Exact Backend RPC / Query & Params | Tables Affected | RBAC / Sub-Feature Gate | Security & Error Handling |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `button.btn.btn-primary`<br>`[data-sub-feature="expenses_create"]` | `<i data-feather="plus"></i> Add Expense` | `click`<br>`window.openAddExpenseModal()` | Clears `editingExpenseId = null`. Resets `#addExpenseForm`. Sets `#expenseDate` default to today's date (`YYYY-MM-DD`). Changes modal header text to "Add New Expense" and submit button to "Save Expense". Opens `#addExpenseModal` (display `flex`). | None | None | `data-sub-feature="expenses_create"` | Hidden if user role lacks expense creation privileges. |

---

### 2.2 KPI Summary Cards

The summary cards render across 4 grid columns on desktop, 2 on tablet, and 1 on mobile:

| Element Selector | Metric Name | Value Source | Comparison / Sub-label | Backend Computation / Fields |
| :--- | :--- | :--- | :--- | :--- |
| `#cardTodayExpenses`<br>`#cardTodayTrend` | **Today's Expenses** | `data.today_expenses` | `data.today_trend_pct` & `data.today_trend_direction`<br>Shows red trending-up if expenses rose, green trending-down if dropped vs yesterday. | Derived from `app.expenses` filtered by `date = CURRENT_DATE` vs `date = CURRENT_DATE - 1`. |
| `#cardThisMonthExpenses`<br>`#cardThisMonthTrend` | **This Month's Expenses** | `data.this_month_expenses` | `data.this_month_trend_pct` & `data.this_month_trend_direction`<br>Vs previous calendar month. | Aggregates all active expenses in current month vs previous month. |
| `#cardTotalExpenses` | **Total Expenses** | `data.total_expenses` | "Lifetime expenses" | Lifetime sum of all active (`status <> 'deleted'`) expenses for tenant company/branch. |
| `#cardTopCategoryName`<br>`#cardTopCategoryDetails` | **Top Expense Category** | `data.top_category_name` | `data.top_category_amount` & `data.top_category_pct` | Computes `SUM(amount) GROUP BY category ORDER BY 1 DESC LIMIT 1` and expresses as percentage of lifetime total. |

- **Primary Backend Fetch**:
  ```typescript
  supabase.rpc('get_expenses_stat_cards', {
      p_company_id: companyId,
      p_branch_id: branchId // null if 'all' selected
  })
  ```
- **Fallback Client Computation**: If RPC fails, `computeAndRenderStatCardsClientSide()` iterates over cached `allExpenses` array, aggregating day-level and month-level date ranges.

---

### 2.3 Filter Bar & Search Controls

| Element Selector / Event | Control Type | User Action | Frontend Behavior | Backend / Filter Effect |
| :--- | :--- | :--- | :--- | :--- |
| `#expenseSearch`<br>`input` | Text Input | Typing query | Sets `searchQuery = value.toLowerCase().trim()`. Shows `#expenseSearchClear` button if text entered. Resets `currentPage = 1` and triggers `renderExpensesTable()`. | Filters locally across `category`, `notes`, `staff_name`, `amount`, and formatted date (`DD-MM-YYYY`). |
| `#expenseSearchClear`<br>`click` | Icon Button (`x`) | Click | Clears search input value, hides clear icon, resets `searchQuery = ''`, re-renders table at page 1. | Local client-side filter reset. |
| `#exDateBtn`<br>`click` | Dropdown Trigger | `window.toggleExpensesDateMenu(event)` | Toggles display of `#exDateMenu` (`block` vs `none`). Replaces chevron icon. Stops event propagation. | Pure UI toggle. Outside clicks close menu. |
| `#exDateMenu button:nth-child(1)` | Option "This Month" | `window.setExpensesDateFilter('this_month')` | Sets `#exDateLabel` to formatted current month (e.g. "November 2026"), updates hidden `#expensesDateRange.value = 'this_month'`, hides menu, resets page to 1, calls `renderExpensesTable()`. | Filters records matching current calendar year & month. |
| `#exDateMenu button:nth-child(2)` | Option "Last Month" | `window.setExpensesDateFilter('last_month')` | Sets `#exDateLabel` to previous month name/year, updates hidden range, re-renders table. | Filters records matching previous calendar month. |
| `#exDateMenu button:nth-child(3)` | Option "Last 3 Months" | `window.setExpensesDateFilter('3months')` | Updates label to "Last 3 Months", filters table to records where `dateObj >= 3 months ago`. | Date comparison against $T - 90\text{ days}$. |
| `#exDateMenu button:nth-child(4)` | Option "Last 6 Months" | `window.setExpensesDateFilter('6months')` | Updates label to "Last 6 Months", filters table to records where `dateObj >= 6 months ago`. | Date comparison against $T - 180\text{ days}$. |
| `#exDateMenu button:nth-child(5)` | Option "Last 12 Months" | `window.setExpensesDateFilter('12months')` | Updates label to "Last 12 Months", filters table to records where `dateObj >= 12 months ago`. | Date comparison against $T - 365\text{ days}$. |
| `#exDateMenu button:nth-child(6)` | Option "All Time" | `window.setExpensesDateFilter('all')` | Updates label to "All Time", renders all active expenses without date restriction. | No date filtering applied. |
| `#exDateMenu button:nth-child(7)` | Option "Custom Range..." | Toggle custom picker | Toggles visibility of `#exCustomRange` container within dropdown. | UI accordion toggle. |
| `#exCustomRange #expensesCustomStart`<br>`#expensesCustomEnd` | Date Pickers | Date change | Sets start and end boundaries for custom date filtering. | Used by "Apply" button. |
| `#exCustomRange button:contains("Reset")` | Button | Click | Clears date inputs and invokes `window.setExpensesDateFilter('all')`. | Clears range filter. |
| `#exCustomRange button:contains("Apply")` | Button | `window.setExpensesDateFilter('custom')` | Reads `#expensesCustomStart` and `#expensesCustomEnd`. Updates button label to `DD/MM/YYYY - DD/MM/YYYY`. Hides menu. Re-renders table. | Matches records where `start <= date <= end`. |
| `#filterCategory`<br>`change` | Select Dropdown | Category selection | Updates `categoryFilter = value`. Options: "All", "Rent", "Salary", "Products", "Utilities", "Maintenance", "Marketing", "Other". Resets page to 1, re-renders table. | Filters client list where `expense.category === selectedValue`. |

---

### 2.4 Expenses Data Table & Row Actions

| Element / Column | Selector | Description / Behavior | Invocation & Params | Sub-Feature Gate |
| :--- | :--- | :--- | :--- | :--- |
| **Date** | `td:nth-child(1)` | Displays date formatted as `DD-MM-YYYY`. | Formatted via `parseDateParts(exp.date)`. | None |
| **Category** | `td:nth-child(2)` | Color-coded status badge:<br>- Rent: `bg-indigo-light text-indigo`<br>- Salary: `bg-emerald-light text-emerald`<br>- Products: `bg-blue-light text-blue`<br>- Utilities: `bg-amber-light text-amber`<br>- Maintenance: `bg-rose-light text-rose`<br>- Marketing: `bg-purple-light text-purple`<br>- Other: `bg-gray-100 text-gray-800` | Rendered dynamically based on category string. | None |
| **Amount** | `td:nth-child(3)` | Currency formatted amount: `₹XX,XXX.XX` with semi-bold font weight. | `parseFloat(exp.amount).toLocaleString('en-IN')` | None |
| **Notes** | `td:nth-child(4)` | If notes exist: renders file icon button (`onclick="window.viewExpenseNotes('${safeExpId}')"`). If empty: renders `N/A`. | Opens `#viewExpenseNotesModal` and injects `escapeHtml(exp.notes)`. | None |
| **Added By** | `td:nth-child(5)` | Displays staff first name, with full name in hover tooltip: `<span title="${safeFullName}">${safeFirstName}</span>`. Default: "Admin". | `exp.staff_name || 'Admin'` | None |
| **Edit Button** | `button[data-sub-feature="expenses_update"]` | Opens Add Expense modal in Edit mode.<br>`onclick="window.editExpense('${safeExpId}')"` | Finds expense in `allExpenses`. Sets `editingExpenseId = id`. Populates `#expenseDate`, `#expenseAmount`, `#expenseCategory`, and `#expenseNotes`. Sets modal title to "Edit Expense" and button to "Update Expense". | `expenses_update` |
| **Delete Button** | `button[data-sub-feature="expenses_delete"]` | Soft-deletes expense record.<br>`onclick="window.deleteExpense('${safeExpId}')"` | Prompts native confirmation: `confirm("Are you sure you want to delete this expense?")`. On confirm: invokes atomic delete RPC (see below). | `expenses_delete` |

---

### 2.5 Table Pagination Controls

| Element Selector | Type | Behavior | State Management |
| :--- | :--- | :--- | :--- |
| `#expensesPaginationFooter` | Container | Displays pagination controls. | Hidden (`display: none`) if total records $\le 25$. Visible (`display: flex`) when records $> 25$. |
| `#expPageShowing` | Text Label | Displays record boundary. | e.g. "Showing 1-25 of 68 expenses". |
| `#expPageInfo` | Text Label | Displays active page count. | e.g. "Page 1 of 3". |
| `#expBtnPrev` | Button | `currentPage--`; calls `renderExpensesTable()`. | `disabled = (currentPage <= 1)`. |
| `#expBtnNext` | Button | `currentPage++`; calls `renderExpensesTable()`. | `disabled = (currentPage >= totalPages)`. |

---

## 3. Modal Workflows & Atomic RPC Details

### 3.1 "Add / Edit Expense" Modal Workflow

- **DOM Elements**:
  - Backdrop / Container: `#addExpenseModal` (clicks outside modal content trigger `window.closeAddExpenseModal()`).
  - Close button: `button.icon-btn` with Feather `x` icon.
  - Form: `#addExpenseForm` (form `submit` event intercepted via `e.preventDefault()`).
  - Inputs:
    - `#expenseDate`: `<input type="date" required>`
    - `#expenseAmount`: `<input type="number" min="0" step="0.01" required>`
    - `#expenseCategory`: `<select required>` ("Rent", "Salary", "Products", "Utilities", "Maintenance", "Marketing", "Other")
    - `#expenseNotes`: `<textarea>` (optional notes)
  - Footer buttons:
    - Cancel: `window.closeAddExpenseModal()`
    - Save/Update: `window.submitExpense()`

#### Execution Logic (`submitExpense`):
1. **Frontend Validation**:
   - `expenseDate` must not be blank.
   - `expenseAmount` must be a valid float $> 0$.
   - `expenseCategory` must be selected.
2. **Context Resolution**: Retrieves `company_id` and active `branch_id` from `window.appContext` or `localStorage`. If `branch_id === 'all'`, passes `null`.
3. **Branching between Create and Update**:

#### A. Create Expense (`editingExpenseId === null`):
```typescript
const { data, error } = await supabase.rpc('create_expense_atomic', {
    p_company_id: companyId,
    p_branch_id:  branchId,
    p_date:       date,
    p_category:   category,
    p_amount:     amount,
    p_notes:      notes || null,
    p_staff_id:   user?.id || null,
    p_staff_name: userName || 'Admin'
});
```

- **Backend Routine**: `app.create_expense_atomic` (`SECURITY DEFINER`)
- **Tables Modified**:
  - `INSERT INTO app.expenses (company_id, branch_id, date, category, amount, notes, staff_id, staff_name, status, created_at, updated_at)`
  - Status set to `'active'`.
- **Returned Data**: Full `app.expenses` record as `jsonb`.
- **UI Resolution**: Closes modal, displays toast "Expense added successfully", refreshes stats & table via `loadAllExpenseData()`.

#### B. Update Expense (`editingExpenseId !== null`):
```typescript
const { data, error } = await supabase.rpc('update_expense_atomic', {
    p_company_id: companyId,
    p_expense_id: editingExpenseId,
    p_branch_id:  branchId,
    p_date:       date,
    p_category:   category,
    p_amount:     amount,
    p_notes:      notes || null
});
```

- **Backend Routine**: `app.update_expense_atomic` (`SECURITY DEFINER`)
- **Tables Modified**:
  - `UPDATE app.expenses SET branch_id = COALESCE(p_branch_id, branch_id), date = p_date, category = v_clean_cat, amount = p_amount, notes = NULLIF(TRIM(p_notes), ''), updated_at = NOW() WHERE expense_id = p_expense_id AND company_id = p_company_id`
- **Returned Data**: Updated `app.expenses` record.
- **UI Resolution**: Closes modal, displays toast "Expense updated successfully", refreshes stats & table via `loadAllExpenseData()`.

---

### 3.2 "Delete Expense" Workflow

```typescript
const { data, error } = await supabase.rpc('delete_expense_atomic', {
    p_company_id: companyId,
    p_expense_id: expenseId,
    p_branch_id:  branchId
});
```

- **Backend Routine**: `app.delete_expense_atomic` (`SECURITY DEFINER`)
- **Execution Safeguards**:
  - Verifies tenant access via `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - Confirms expense exists and is not already deleted.
- **Tables Modified**:
  - `UPDATE app.expenses SET status = 'deleted', updated_at = NOW() WHERE expense_id = p_expense_id AND company_id = p_company_id`
- **UI Resolution**: Displays toast "Expense deleted successfully", invokes `loadAllExpenseData()`.

---

### 3.3 "View Expense Notes" Modal Workflow

- **DOM Elements**:
  - `#viewExpenseNotesModal`: Modal container.
  - `#expenseNotesContent`: Displays plain-text notes with `white-space: pre-wrap`.
  - Close button: `onclick="window.closeExpenseNotesModal()"`.
- **Trigger**: Click on row note icon `window.viewExpenseNotes(expenseId)`.
- **Behavior**: Retrieves note content from cached `allExpenses` record, escapes HTML entities, populates `#expenseNotesContent`, and displays modal.

---

## 4. Multi-Branch & App Shell Integration

1. **Branch Switching**:
   - Listens to global select change `#branchSelect`, custom event `branch:changed`, and `storage` event for `active_branch_id`.
   - On change: updates `active_branch_id` in storage, resets `currentPage = 1`, and invokes `loadAllExpenseData()`.
2. **Sub-Feature Permissions**:
   - Post-render hook `window.applySubFeatureGates()` scans `data-sub-feature` attributes (`expenses_create`, `expenses_update`, `expenses_delete`) and disables or hides buttons according to the current user's role capabilities.

