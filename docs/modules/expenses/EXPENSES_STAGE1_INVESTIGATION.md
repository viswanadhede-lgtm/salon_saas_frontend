# Module 9: Expenses & Financials - Stage 1 Investigation & Logic Inventory

## 1. Overview
The Expenses & Financials module handles recording, updating, auditing, and soft-deleting business operating expenses (`app.expenses`), reporting financial summary cards (`get_expenses_stat_cards`), and tracking financial payments and settlement ledgers (`app.business_transactions`).

Under the **Zero-Trust Frontend / Authoritative Backend-First** architecture, all direct table mutations (`.insert()`, `.update()`, `.delete()`) on `expenses` and `business_transactions` must be permanently eliminated and replaced by PostgreSQL `SECURITY DEFINER` stored procedures.

---

## 2. Database Schema & Object Inspection

### 2.1 Table: `app.expenses`
| Column Name | Data Type | Nullable | Default | Description |
|---|---|---|---|---|
| `expense_id` | `uuid` | **NO** | `gen_random_uuid()` | Primary key |
| `company_id` | `uuid` | **NO** | `NULL` | Tenant company identifier |
| `branch_id` | `uuid` | YES | `NULL` | Tenant branch identifier (NULL indicates company-wide / headquarters expense) |
| `date` | `date` | YES | `NULL` | Expense date |
| `category` | `text` | YES | `NULL` | Expense category (e.g., Rent, Salary, Products, Utilities, Maintenance, Marketing, Other) |
| `amount` | `numeric` | YES | `NULL` | Monetary expense amount |
| `notes` | `text` | YES | `NULL` | Optional memo / notes |
| `staff_id` | `uuid` | YES | `NULL` | ID of staff / user who recorded the expense |
| `staff_name` | `text` | YES | `NULL` | Name of staff / user who recorded the expense |
| `status` | `text` | YES | `NULL` | Status (`active` or `deleted`) |
| `created_at` | `timestamptz` | YES | `now()` | Audit creation timestamp |
| `updated_at` | `timestamptz` | YES | `now()` | Audit update timestamp |

Constraints:
- `expenses_pkey`: PRIMARY KEY (`expense_id`)

### 2.2 Table: `app.business_transactions`
| Column Name | Data Type | Nullable | Default | Description |
|---|---|---|---|---|
| `payment_id` | `uuid` | **NO** | `gen_random_uuid()` | Primary key |
| `company_id` | `uuid` | YES | `NULL` | Tenant company identifier |
| `branch_id` | `uuid` | YES | `NULL` | Tenant branch identifier |
| `reference_id` | `uuid` | YES | `NULL` | Polymorphic reference to booking, product sale, or membership purchase |
| `reference_type` | `text` | YES | `NULL` | Domain entity type (`booking`, `product`, `membership`) |
| `amount` | `numeric` | YES | `NULL` | Monetary transaction amount |
| `currency` | `text` | YES | `'INR'::text` | Transaction currency |
| `payment_method` | `text` | YES | `NULL` | Method (`cash`, `upi`, `card`) |
| `status` | `text` | YES | `'created'::text` | Transaction status (`created`, `pending`, `paid`, `refunded`, `cancelled`) |
| `notes` | `text` | YES | `NULL` | Transaction memo |
| `created_by` | `uuid` | YES | `NULL` | User who created transaction |
| `paid_at` | `timestamp` | YES | `NULL` | Timestamp of payment receipt |
| `created_at` | `timestamp` | YES | `now()` | Timestamp of record creation |
| `updated_at` | `timestamp` | YES | `NULL` | Timestamp of record update |
| `discount_type` | `text` | YES | `NULL` | Type of discount applied (`coupon`, `offer`, `membership`, `manual`) |
| `discount_name` | `text` | YES | `NULL` | Name or code of discount applied |
| `discount_amount` | `numeric` | YES | `NULL` | Value of discount applied |
| `final_amount` | `numeric` | YES | `NULL` | Net amount collected after discounts |

Constraints:
- `business_transactions_pkey`: PRIMARY KEY (`payment_id`)
- `business_transactions_status_check`: CHECK (`status = ANY (ARRAY['created', 'pending', 'paid', 'refunded', 'cancelled'])`)
- `business_transactions_reference_type_check`: CHECK (`reference_type = ANY (ARRAY['booking', 'product', 'membership'])`)
- `business_transactions_payment_method_check`: CHECK (`payment_method = ANY (ARRAY['cash', 'upi', 'card'])`)

---

## 3. Existing Client-Side Direct Mutations Inventory

| File Path | Line Range | Operation | Vulnerability & Architectural Flaw |
|---|---|---|---|
| `scripts/expenses.js` | Lines 286-301 | `.from('expenses').update(...)` | Direct client-side update without tenant access validation, non-negative amount constraint, or non-empty category validation. |
| `scripts/expenses.js` | Lines 309-324 | `.from('expenses').insert(...)` | Direct client-side insertion without database-enforced multi-tenant isolation, date verification, or positive amount check. |
| `scripts/expenses.js` | Lines 406-425 | `.from('expenses').update({ status: 'deleted' })` | Direct client-side soft-delete without authorization checks or tenant ownership verification. |
| `scripts/sales-history/sales-api.js` | Lines 67-71 | `.from('business_transactions').insert(txnData)` | Direct client insertion into financial ledger bypassing server-side validation. |
| `scripts/sales-history/sales-api.js` | Lines 116-120 | `.from('business_transactions').insert(ledgerRows)` | Deprecated legacy refund ledger insert. |
| `scripts/payment-booking.js` | Lines 440-458 | `.from('business_transactions').insert(...)` | Orphaned legacy payment script bypassed by atomic booking RPCs. |

---

## 4. Key Business Logic & Validation Rules to Enforce

1. **Multi-Tenant Isolation**:
   - Every procedure must verify `shared.verify_tenant_access(p_company_id, p_branch_id)`.
   - When `p_branch_id` is NULL (headquarters / company-wide expenses), tenant authorization must verify `p_company_id` membership.
2. **Authoritative Amount Validation**:
   - `amount` must be strictly positive (`amount > 0`). Zero or negative amounts must be rejected with `"Expense amount must be greater than zero"`.
3. **Category Validation & Normalization**:
   - `category` cannot be null or empty string. Leading/trailing whitespace must be trimmed.
4. **Date Validation**:
   - `date` must not be null and must represent a valid calendar date.
5. **Soft-Delete Lifecycle**:
   - Deleting an expense sets `status = 'deleted'`, updates `updated_at = NOW()`, preserving historical financial reporting integrity.
6. **Financial Ledger Integrity (`business_transactions`)**:
   - Validates `payment_method` (`cash`, `upi`, `card`), `status` (`created`, `pending`, `paid`, `refunded`, `cancelled`), and `reference_type` (`booking`, `product`, `membership`).
   - Ensures `reference_id` points to a valid booking, sale, or membership purchase within the caller's tenant.

---

## 5. Required PostgreSQL Stored Procedures
1. `app.create_expense_atomic` / `public.create_expense_atomic`
2. `app.update_expense_atomic` / `public.update_expense_atomic`
3. `app.delete_expense_atomic` / `public.delete_expense_atomic`
4. `app.record_business_transaction_atomic` / `public.record_business_transaction_atomic`

