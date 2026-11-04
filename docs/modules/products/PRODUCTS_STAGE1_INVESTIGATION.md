# Module 8: Products & Retail Inventory - Stage 1 Investigation & Logic Inventory

## 1. Executive Summary
This document provides the technical investigation, schema analysis, mutation inventory, and business logic mapping for the **Products & Retail Inventory** domain of Bharathbots Salon SaaS.

To achieve a complete Zero-Trust Frontend / Authoritative Backend-First posture, all client-side direct table mutations (`insert`, `update`, `delete`) on `product_categories` and `products` are identified and cataloged for replacement by PostgreSQL `SECURITY DEFINER` stored procedures.

---

## 2. Table Schemas & Relational Topology

### 2.1 Table: `app.product_categories` (Base Table, Exposed via `public.product_categories` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `category_id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `company_id` | `uuid` | YES | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Branch boundary |
| `category_name`| `text` | YES | - | Category title |
| `description` | `text` | YES | - | Optional category description |
| `status` | `text` | YES | `'active'` | `'active'`, `'inactive'`, `'deleted'` |
| `created_at` | `timestamptz` | YES | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | YES | - | Last modification timestamp |

### 2.2 Table: `app.products` (Base Table, Exposed via `public.products` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `product_id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `company_id` | `uuid` | YES | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Branch boundary |
| `category_id` | `uuid` | YES | FK -> `app.product_categories(category_id)` | Product category |
| `category_name`| `text` | YES | - | Denormalized category name for fast lookup |
| `product_name` | `text` | YES | - | Product title |
| `description` | `text` | YES | - | Product details / usage instructions |
| `price` | `numeric` | YES | - | Retail sale price |
| `stock_quantity`| `bigint`| YES | 0 | Current on-hand inventory count |
| `status` | `text` | YES | `'active'` | `'active'`, `'inactive'`, `'deleted'` |
| `product_image_url`| `text`| YES | - | Supabase Storage public asset URL |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | YES | - | Last modification timestamp |

### 2.3 Foreign Key References Pointing to `app.products`
- `app.sales(product_id)`: Historical POS sales transaction line items. Deleting a product with past sales must be a soft delete (`status = 'deleted'`) to protect sales reporting and accounting ledgers.

---

## 3. Inventory of Direct Client Mutations & Logic Vulnerabilities

### 3.1 `scripts/products/products-api.js`
1. **Line 70 (`insertCategory`)**:
   - `supabase.from('product_categories').insert(payload)`
   - **Vulnerabilities**: Direct table insert without server-side tenancy or duplicate name verification.
2. **Line 75 (`updateCategory`)**:
   - `supabase.from('product_categories').update({ category_name: name, ... }).eq('category_id', catId)`
   - **Vulnerabilities**: Direct table update.
3. **Line 85 (`deleteCategory`)**:
   - `supabase.from('product_categories').update({ status: 'deleted', ... }).eq('category_id', catId)`
   - **Vulnerabilities**: Direct soft-delete. Category product dependency blocker is enforced only in client JavaScript memory (`productsState.products.some(...)`), leaving the database exposed to orphaned products via direct API calls.
4. **Line 95 (`insertProduct`)**:
   - `supabase.from('products').insert(payload)`
   - **Vulnerabilities**: Direct table insert; price and negative stock limits are not guarded at the database level.
5. **Line 100 (`updateProduct`)**:
   - `supabase.from('products').update(payload).eq('product_id', productId)`
   - **Vulnerabilities**: Direct table update.
6. **Line 110 (`deleteProduct`)**:
   - `supabase.from('products').update({ status: 'deleted', ... }).eq('product_id', productId)`
   - **Vulnerabilities**: Direct soft-delete.
7. **Line 120 (`cascadeRenameCategoryOnProducts`)**:
   - `supabase.from('products').update({ category_name: newCategoryName, ... }).eq('category_id', catId)`
   - **Vulnerabilities**: Client executes category rename and product cascade as two separate HTTP requests. A network drop between the two leaves denormalized product data permanently out of sync.

### 3.2 `scripts/sales-history/sales-api.js`
1. **Line 111 (`buildProductStockUpdatePromise`)**:
   - Legacy deprecated stock update function. Never called in live code; will be removed.

---

## 4. Required Authoritative Backend Routines
To achieve 100% Zero-Trust for Products & Retail Inventory:
1. `app.create_product_category_atomic`: Validates tenant context, asserts unique category name, creates category.
2. `app.update_product_category_atomic`: Updates category name with uniqueness assertion, and **atomically cascades the rename** to all assigned products in `app.products(category_name)` in a single transaction.
3. `app.delete_product_category_atomic`: Enforces strict dependency blocker: **rejects deletion if active products are assigned to the category**.
4. `app.create_product_atomic`: Validates tenant context, resolves category, asserts product name uniqueness within category, asserts `price >= 0` and `stock_quantity >= 0`, creates product.
5. `app.update_product_atomic`: Updates product metadata, asserts uniqueness, guards against negative price and stock.
6. `app.delete_product_atomic`: Safely soft-deletes product (`status = 'deleted'`), preserving historical sales records.
7. `app.adjust_product_stock_atomic`: Authoritative atomic inventory adjustment with row-level locking (`FOR UPDATE`) to guard against concurrency races and negative inventory.

