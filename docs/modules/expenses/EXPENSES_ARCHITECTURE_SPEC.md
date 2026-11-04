# Module 9: Expenses & Financials - Stage 2 Architecture Specification

## 1. Overview & Architecture Goals
The Expenses & Financials module transitions all expense logging, metadata modifications, soft deletions, and financial business transaction ledger recordings to authoritative PostgreSQL `SECURITY DEFINER` stored procedures.

Key Objectives:
1. **Zero Direct Client Mutations**: Eliminate all raw `.insert()`, `.update()`, and `.delete()` calls on `expenses` and `business_transactions`.
2. **Authoritative Financial Validation**:
   - Enforce strictly positive expense amounts ($>0$).
   - Require valid calendar dates and non-empty categories.
   - Ensure soft-delete pattern (`status = 'deleted'`) so historical financial audits and lifetime calculations in `get_expenses_stat_cards` remain fully reproducible.
3. **Ledger Integrity**:
   - Validate payment method constraints (`cash`, `upi`, `card`), status transitions, and polymorphic references (`booking`, `product`, `membership`) against tenant data.
4. **Multi-Tenant Isolation**:
   - Verify caller tenant credentials using `shared.verify_tenant_access(p_company_id, p_branch_id)`.

---

## 2. Stored Procedures Specification

### 2.1 `app.create_expense_atomic` (Public Wrapper: `public.create_expense_atomic`)
- **Signature**:
  ```sql
  FUNCTION app.create_expense_atomic(
      p_company_id   uuid,
      p_branch_id    uuid DEFAULT NULL,
      p_date         date DEFAULT CURRENT_DATE,
      p_category     text DEFAULT 'Other',
      p_amount       numeric DEFAULT 0,
      p_notes        text DEFAULT NULL,
      p_staff_id     uuid DEFAULT NULL,
      p_staff_name   text DEFAULT NULL
  ) RETURNS jsonb
  ```
- **Security**: `SECURITY DEFINER`
- **Search Path**: `platform, shared, app, public, pg_temp`
- **Business Logic**:
  1. `IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN RAISE EXCEPTION 'Access denied: Invalid company or branch context.'; END IF;`
  2. `IF p_date IS NULL THEN RAISE EXCEPTION 'Expense date is required.'; END IF;`
  3. `IF p_category IS NULL OR TRIM(p_category) = '' THEN RAISE EXCEPTION 'Expense category is required.'; END IF;`
  4. `IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Expense amount must be greater than zero.'; END IF;`
  5. Inserts into `app.expenses` with `status = 'active'`, `created_at = NOW()`, `updated_at = NOW()`.
  6. Returns `to_jsonb(v_expense)`.

---

### 2.2 `app.update_expense_atomic` (Public Wrapper: `public.update_expense_atomic`)
- **Signature**:
  ```sql
  FUNCTION app.update_expense_atomic(
      p_company_id   uuid,
      p_expense_id   uuid,
      p_branch_id    uuid DEFAULT NULL,
      p_date         date DEFAULT CURRENT_DATE,
      p_category     text DEFAULT 'Other',
      p_amount       numeric DEFAULT 0,
      p_notes        text DEFAULT NULL
  ) RETURNS jsonb
  ```
- **Security**: `SECURITY DEFINER`
- **Search Path**: `platform, shared, app, public, pg_temp`
- **Business Logic**:
  1. Tenant access check via `shared.verify_tenant_access`.
  2. Verifies existing expense exists with `company_id = p_company_id`, `expense_id = p_expense_id`, and `COALESCE(status, 'active') <> 'deleted'`.
  3. Validates `p_date IS NOT NULL`, `TRIM(p_category) <> ''`, and `p_amount > 0`.
  4. Updates `app.expenses` row:
     - `branch_id = COALESCE(p_branch_id, branch_id)`
     - `date = p_date`
     - `category = TRIM(p_category)`
     - `amount = p_amount`
     - `notes = NULLIF(TRIM(p_notes), '')`
     - `updated_at = NOW()`
  5. Returns `to_jsonb(v_expense)`.

---

### 2.3 `app.delete_expense_atomic` (Public Wrapper: `public.delete_expense_atomic`)
- **Signature**:
  ```sql
  FUNCTION app.delete_expense_atomic(
      p_company_id   uuid,
      p_expense_id   uuid,
      p_branch_id    uuid DEFAULT NULL
  ) RETURNS jsonb
  ```
- **Security**: `SECURITY DEFINER`
- **Search Path**: `platform, shared, app, public, pg_temp`
- **Business Logic**:
  1. Tenant access check via `shared.verify_tenant_access`.
  2. Verifies expense exists for company and is active.
  3. Soft-deletes:
     ```sql
     UPDATE app.expenses
     SET status = 'deleted', updated_at = NOW()
     WHERE expense_id = p_expense_id AND company_id = p_company_id;
     ```
  4. Returns `jsonb_build_object('success', true, 'expense_id', p_expense_id)`.

---

### 2.4 `app.record_business_transaction_atomic` (Public Wrapper: `public.record_business_transaction_atomic`)
- **Signature**:
  ```sql
  FUNCTION app.record_business_transaction_atomic(
      p_company_id      uuid,
      p_branch_id       uuid,
      p_reference_id    uuid,
      p_reference_type  text,
      p_amount          numeric,
      p_payment_method  text,
      p_status          text DEFAULT 'paid',
      p_notes           text DEFAULT NULL,
      p_discount_type   text DEFAULT NULL,
      p_discount_name   text DEFAULT NULL,
      p_discount_amount numeric DEFAULT NULL,
      p_final_amount    numeric DEFAULT NULL,
      p_created_by      uuid DEFAULT NULL
  ) RETURNS jsonb
  ```
- **Security**: `SECURITY DEFINER`
- **Search Path**: `platform, shared, app, public, pg_temp`
- **Business Logic**:
  1. Tenant access check via `shared.verify_tenant_access`.
  2. Reference type validation:
     `IF LOWER(p_reference_type) NOT IN ('booking', 'product', 'membership') THEN RAISE EXCEPTION 'Invalid reference type: %', p_reference_type; END IF;`
  3. Payment method validation:
     `IF LOWER(p_payment_method) NOT IN ('cash', 'upi', 'card') THEN RAISE EXCEPTION 'Invalid payment method: %', p_payment_method; END IF;`
  4. Status validation:
     `IF LOWER(p_status) NOT IN ('created', 'pending', 'paid', 'refunded', 'cancelled') THEN RAISE EXCEPTION 'Invalid status: %', p_status; END IF;`
  5. Amount validation:
     `IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Transaction amount cannot be negative.'; END IF;`
  6. Reference existence validation:
     - For `booking`: asserts row exists in `app.bookings` or `app.bookings_for_business_transaction`.
     - For `product`: asserts row exists in `app.sales` or `app.sales_for_business_transactions`.
     - For `membership`: asserts row exists in `app.membership_purchases`.
  7. Inserts into `app.business_transactions`.
  8. Returns `to_jsonb(v_txn)`.

---

## 3. Backward Compatibility & Public Views
- `public.expenses` and `public.business_transactions` are already zero-downtime views forwarding to `app.expenses` and `app.business_transactions`.
- Public wrapper functions in the `public` schema delegate directly to the `app` schema routines with identical signatures.
- `public.get_expenses_stat_cards` remains active and operates across `expenses` with soft-deleted filtering (`COALESCE(e.status, 'active') <> 'deleted'`).

