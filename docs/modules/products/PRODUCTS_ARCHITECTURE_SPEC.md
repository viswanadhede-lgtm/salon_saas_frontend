# Module 8: Products & Retail Inventory - Architecture Specification & Migration Blueprint

## 1. Context & Objectives
This document specifies the PostgreSQL architecture, security boundaries, parameter contracts, and validation constraints required to enforce a **100% Zero-Trust Frontend / Authoritative Backend-First** posture for **Module 8: Products & Retail Inventory**.

### Key Objectives:
1. **Zero Client Direct Writes**: Eliminate all client-side direct table mutations (`insert`, `update`, `delete`) on `product_categories` and `products`.
2. **Atomic Category Cascade**: Replace multi-step client cascade renames with a single-transaction database cascade updating `app.products.category_name` when a category is modified.
3. **Database-Level Dependency Guards**: Prevent deleting categories that still have active products assigned.
4. **Authoritative Stock Integrity**: Assert non-negative price and inventory values (`stock_quantity >= 0`, `price >= 0`), with row-level concurrency protection (`FOR UPDATE`) for inventory adjustments.
5. **Auditing & Historical Integrity**: Perform soft deletions (`status = 'deleted'`) so that historical POS transactions in `app.sales` remain valid.

---

## 2. Stored Procedure Specifications

### 2.1 `app.create_product_category_atomic`
- **Schema**: `app` (wrapped by `public.create_product_category_atomic`)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Target branch ID |
  | `p_category_name` | `text` | YES | - | Category title |
  | `p_description` | `text` | NO | `NULL` | Optional description |
- **Returns**: `jsonb` (Created category record)
- **Logic & Validations**:
  1. Enforces tenant check: `IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN RAISE EXCEPTION ...`.
  2. Asserts trimmed category name is non-empty.
  3. Checks category name uniqueness within branch/company (`status != 'deleted'`).
  4. Inserts into `app.product_categories`. Returns `to_jsonb(category.*)`.

---

### 2.2 `app.update_product_category_atomic`
- **Schema**: `app` (wrapped by `public.update_product_category_atomic`)
- **Parameters**:
  - `p_company_id uuid`
  - `p_branch_id uuid`
  - `p_category_id uuid`
  - `p_category_name text`
  - `p_description text DEFAULT NULL`
- **Returns**: `jsonb` (Updated category record)
- **Logic & Validations**:
  1. Tenant access check and existence verification.
  2. Asserts non-empty name and uniqueness against other categories (`category_id != p_category_id`).
  3. Updates `app.product_categories`.
  4. **Atomic Cascade**: Atomically executes `UPDATE app.products SET category_name = v_clean_name, updated_at = NOW() WHERE category_id = p_category_id AND company_id = p_company_id`.
  5. Returns `to_jsonb(category.*)`.

---

### 2.3 `app.delete_product_category_atomic`
- **Schema**: `app` (wrapped by `public.delete_product_category_atomic`)
- **Parameters**: `p_company_id uuid`, `p_branch_id uuid`, `p_category_id uuid`
- **Returns**: `boolean` (`true` on success)
- **Logic & Validations**:
  1. Tenant access check and existence verification.
  2. **Active Product Blocker**:
     `SELECT COUNT(*) INTO v_count FROM app.products WHERE category_id = p_category_id AND company_id = p_company_id AND status != 'deleted';`
     If `v_count > 0`, raises: `'Cannot delete category "%": % active product(s) are assigned to it.'`.
  3. Soft-deletes: sets `status = 'deleted'`, `updated_at = NOW()`.
  4. Returns `true`.

---

### 2.4 `app.create_product_atomic`
- **Schema**: `app` (wrapped by `public.create_product_atomic`)
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Target branch ID |
  | `p_category_id` | `uuid` | YES | - | Category UUID |
  | `p_product_name` | `text` | YES | - | Product title |
  | `p_price` | `numeric` | YES | - | Retail unit price ($\ge 0$) |
  | `p_stock_quantity` | `bigint` | NO | `0` | On-hand quantity ($\ge 0$) |
  | `p_status` | `text` | NO | `'active'` | Status (`'active'` or `'inactive'`) |
  | `p_description` | `text` | NO | `NULL` | Product description |
  | `p_product_image_url` | `text` | NO | `NULL` | Storage public URL |
- **Returns**: `jsonb` (Created product record)
- **Logic & Validations**:
  1. Tenant access check.
  2. Category lookup: verifies `category_id` exists in `app.product_categories` and retrieves canonical `category_name`.
  3. Product title non-empty assertion.
  4. Duplicate check: verifies no active product exists with the same name under this category in the branch/company.
  5. Price assertion: `p_price >= 0`.
  6. Stock assertion: `p_stock_quantity >= 0`.
  7. Inserts into `app.products`. Returns `to_jsonb(product.*)`.

---

### 2.5 `app.update_product_atomic`
- **Schema**: `app` (wrapped by `public.update_product_atomic`)
- **Parameters**: Same as create, with `p_product_id uuid`.
- **Returns**: `jsonb` (Updated product record)
- **Logic & Validations**:
  1. Tenant access check and existence verification.
  2. Category lookup & resolution.
  3. Uniqueness collision guard against other products in the category (`product_id != p_product_id`).
  4. Price & stock non-negative assertions.
  5. Updates `app.products`. Returns `to_jsonb(product.*)`.

---

### 2.6 `app.delete_product_atomic`
- **Schema**: `app` (wrapped by `public.delete_product_atomic`)
- **Parameters**: `p_company_id uuid`, `p_branch_id uuid`, `p_product_id uuid`
- **Returns**: `boolean`
- **Logic**: Tenant check, existence check, soft-deletes (`status = 'deleted'`).

---

### 2.7 `app.adjust_product_stock_atomic`
- **Schema**: `app` (wrapped by `public.adjust_product_stock_atomic`)
- **Parameters**:
  - `p_company_id uuid`
  - `p_branch_id uuid`
  - `p_product_id uuid`
  - `p_delta_quantity bigint` (positive for restock, negative for shrinkage/sale)
  - `p_reason text DEFAULT 'manual_adjustment'`
- **Returns**: `jsonb` (`{"product_id": uuid, "previous_stock": bigint, "delta": bigint, "new_stock": bigint}`)
- **Logic**:
  1. Tenant access check.
  2. Row-level lock (`FOR UPDATE`) on `app.products`.
  3. Negative stock guard: `IF v_curr_stock + p_delta_quantity < 0 THEN RAISE EXCEPTION ...`.
  4. Updates `app.products SET stock_quantity = stock_quantity + p_delta_quantity, updated_at = NOW()`.
  5. Returns calculation result JSON.

---

## 3. Frontend Refactoring Matrix
| Component | Targeted Mutation | Refactored Backend RPC |
|---|---|---|
| `scripts/products/products-api.js:70` | Direct `.from('product_categories').insert(payload)` | `supabase.rpc('create_product_category_atomic', ...)` |
| `scripts/products/products-api.js:75` | Direct `.from('product_categories').update(...)` | `supabase.rpc('update_product_category_atomic', ...)` |
| `scripts/products/products-api.js:85` | Direct `.from('product_categories').update({ status: 'deleted' })` | `supabase.rpc('delete_product_category_atomic', ...)` |
| `scripts/products/products-api.js:95` | Direct `.from('products').insert(payload)` | `supabase.rpc('create_product_atomic', ...)` |
| `scripts/products/products-api.js:100` | Direct `.from('products').update(payload)` | `supabase.rpc('update_product_atomic', ...)` |
| `scripts/products/products-api.js:110` | Direct `.from('products').update({ status: 'deleted' })` | `supabase.rpc('delete_product_atomic', ...)` |
| `scripts/products/products-api.js:120` | Direct `.from('products').update({ category_name })` | Handled automatically inside `update_product_category_atomic` |
| `scripts/sales-history/sales-api.js:111` | Legacy `buildProductStockUpdatePromise` | Removed |

---

## 4. Test Matrix
- **T1**: Create valid product category -> Success.
- **T2**: Create category with duplicate name -> Rejection.
- **T3**: Update category with rename -> Success, verifies atomic cascade to `products.category_name`.
- **T4**: Update category with name collision -> Rejection.
- **T5**: Delete category with active assigned products -> Rejection with dependency blocker message.
- **T6**: Delete category with no active products -> Soft-delete success.
- **T7**: Create valid product -> Success.
- **T8**: Create product with negative price -> Rejection.
- **T9**: Create product with negative stock -> Rejection.
- **T10**: Create product with duplicate name in same category -> Rejection.
- **T11**: Update product metadata -> Success.
- **T12**: Update product with name collision -> Rejection.
- **T13**: Delete product -> Soft-delete success (`status = 'deleted'`).
- **T14**: Adjust product stock (restock +10) -> Success, new stock reflected.
- **T15**: Adjust product stock beyond on-hand inventory -> Rejection (negative stock guard).
- **T16**: Tenant isolation -> Rejection on mismatched company/branch.

