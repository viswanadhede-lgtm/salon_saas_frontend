# Module 08 — Products & Retail Inventory: End-to-End Interaction & Architecture Specification

> **Module Identity**: Products Catalog, Retail Inventory & Category Hierarchy  
> **Route / Files**: `products.html`, `products.js`, `scripts/products/*` (`products-api.js`, `products-crud.js`, `products-modals.js`, `products-state.js`, `products-table.js`)  
> **Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First Standard  
> **Database Schemas**: `app` (Storage & Logic), `public` (API Interface Layer), `shared` (Tenant Context & Row-Level Security), `platform` (SaaS Entitlements)

---

## 1. Module Overview & Architectural Principles

Module 08 manages the salon's retail commerce and physical inventory operations:
1. **Product Catalog (`app.products`)**: Retail products, pricing, stock levels, product descriptions, status (`active`/`inactive`), and storage-backed image assets.
2. **Product Categories (`app.product_categories`)**: Hierarchical grouping for products, facilitating catalog navigation, POS browsing, and retail sales tracking.
3. **Retail Inventory Tracking**: Real-time stock counts (`stock_quantity`), out-of-stock and low-stock threshold detection, and transactional decrements during POS checkout.

### Hardening Standards & Zero-Trust Backend Enforcement
* **Zero Client Direct Table Mutations**: All client-side direct table `.insert()`, `.update()`, and `.delete()` queries are replaced with `SECURITY DEFINER` stored procedures.
* **Single-Transaction Category Renaming Cascade**: Category name changes automatically and atomically cascade to `app.products.category_name` in PostgreSQL, preventing orphaned or mismatched category denormalizations.
* **Database-Level Dependency Integrity Guards**: Deleting a category that has active products assigned is blocked directly at the database engine level (`Cannot delete category "X": N active product(s) are assigned to it`).
* **Non-Negative Price & Inventory Constraints**: Authoritative backend assertions enforce `price >= 0` and `stock_quantity >= 0`.
* **Soft Deletions for POS Historical Integrity**: Deletions perform soft updates (`status = 'deleted'`), ensuring historical sales in `app.sales` and POS checkout receipts retain complete audit integrity.
* **Storage SDK Image Lifecycle**: Product images are uploaded to the Supabase Storage bucket `product-images`; old images are purged from storage only after the database record update succeeds.

---

## 2. Global Tenant Context & Security Pre-Flight

Every stored procedure in Module 08 verifies tenant isolation before executing any logic:
```sql
IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
END IF;
```

Client runtime context resolution:
* `p_company_id`: `getCompanyId()` resolves from `appContext.company.id` or `localStorage.getItem('company_id')`.
* `p_branch_id`: `getBranchId()` resolves from `appContext.current_branch_id` or `localStorage.getItem('active_branch_id')`.

Direct write operations to `app.products` and `app.product_categories` are revoked for client roles (`anon`, `authenticated`), routing all mutations through `public.*_atomic` wrappers.

---

## 3. Dual-Tab Interface & Contextual Header

The Products module features a dynamic dual-tab design with intelligent contextual action switching:

```
+-------------------------------------------------------------------------------------------------------------+
| Products                                                                                                    |
| Manage retail products                                                                                      |
|                                                                                                             |
| [ Search product...         ]   [ Filter v ]   [ + Add Product / Add Category ]                             |
+-------------------------------------------------------------------------------------------------------------+
| [ Products (24) ]   [ Product Categories (6) ]                                                              |
+-------------------------------------------------------------------------------------------------------------+
```

### 3.1 Tab Switching Architecture

| Tab Element | `data-target` | Visible Table | Filter Button | Primary Action Button Text & Gate |
|---|---|---|---|---|
| `<button class="tab-btn prod-tab active">` | `products` | `#tabProducts` | Visible (`display: flex`) | `"Add Product"` (`data-sub-feature="create_product"`) |
| `<button class="tab-btn prod-tab">` | `categories` | `#tabCategories` | Hidden (`display: none`) | `"Add Category"` (`data-sub-feature="create_product_category"`) |

* **Tab Click Workflow (`initTabs`)**:
  1. Updates active button styling (indigo underline `#4338ca` and pill badge background `#e0e7ff`).
  2. Toggles table display between `#tabProducts` and `#tabCategories`.
  3. Updates search placeholder (`"Search products..."` vs `"Search category..."`).
  4. Dynamically re-configures `#primaryActionBtn`:
     * For Products: sets `data-sub-feature="create_product"`, label to `"Add Product"`, handler to `window.openAddProductModal`.
     * For Categories: sets `data-sub-feature="create_product_category"`, label to `"Add Category"`, handler to `window.openAddCategoryModal`.
  5. Re-evaluates RBAC gates via `window.applySubFeatureGates()`.
  6. Loads fresh data in parallel (`Promise.all([fetchProducts(), fetchProductCategories()])`).

---

### 3.2 Header Search & Multi-Criteria Filter

#### 3.2.1 Search Input
* **Element Identity**: `<input type="text" id="searchInput" placeholder="Search product">`
* **Event**: `input`
* **Behavior**:
  * In Products tab: filters products by substring matching on `product_name` or `category_name`.
  * In Categories tab: filters categories by substring matching on `category_name`.

#### 3.2.2 Filter Dropdown Menu
* **Trigger Button**: `<button id="filterBtn" class="btn btn-secondary">`
* **Dropdown Container**: `<div class="filter-menu" id="filterMenu" style="width: 360px;">`
* **Filter Layout (2 Columns)**:
  1. **Column 1 — Category Radio Group** (`#categoryFilterOptions`):
     * Option 1: `All Categories` (`value="all"`, checked by default).
     * Options 2..N: Dynamic radio items populated from `productsState.categories`, matched using exact UUID `value="${cat.category_id}"` (rename-safe).
  2. **Column 2 — Stock Status Radio Group**:
     * `All`: No stock restrictions.
     * `In Stock`: `stock_quantity > 5`.
     * `Low Stock`: `stock_quantity >= 1 AND stock_quantity <= 5`.
     * `Out of Stock`: `stock_quantity == 0`.
* **Filter Actions**:
  * **Reset Button** (`#resetFilters`): Resets both category and stock radios to `all`, invokes `renderProductsTable()`, and closes dropdown.
  * **Apply Button** (`#applyFilters`): Invokes `renderProductsTable()` with selected criteria and closes dropdown.

---

## 4. Products Tab (`#tabProducts`)

### 4.1 Products Table (`#productsTable`)

Columns: `Product`, `Category`, `Price`, `Stock`, `Picture`, `Status`, `Actions`.

```
+---------------------------------------------------------------------------------------------------------------------+
| Product          | Category   | Price (v) | Stock (v) | Picture | Status   | Actions                                |
+------------------+------------+-----------+-----------+---------+----------+----------------------------------------+
| Argan Oil Serum  | Hair Care  | ₹850      | In Stock  | [Thumb] | Active   | [ Edit ] [ Delete ]                    |
| Keratin Shampoo  | Hair Care  | ₹1,200    | Low (3)   | [Thumb] | Active   | [ Edit ] [ Delete ]                    |
| Styling Gel      | Styling    | ₹450      | Out       | [Icon]  | Inactive | [ Edit ] [ Delete ]                    |
+---------------------------------------------------------------------------------------------------------------------+
```

#### 4.1.1 Column Sorting (`#sortPrice`, `#sortStock`)
* Clicking `#sortPrice` or `#sortStock` toggles sorting between `asc` and `desc`.
* Active sort column and direction are indicated by directional SVG arrows (`#sortPriceUp` / `#sortPriceDown` turning `#3b82f6`).

#### 4.1.2 Status & Stock Badges
* **Stock Badge (`stockBadge`)**:
  * `0`: Out of Stock (`#fee2e2`, text `#ef4444`)
  * `1..5`: Low (N) (`#ffedd5`, text `#f97316`)
  * `> 5`: In Stock (N) (`#d1fae5`, text `#10b981`)
* **Status Badge (`statusBadge`)**:
  * `active`: Green pill (`#d1fae5`, text `#065f46`)
  * `inactive`: Gray pill (`#f1f5f9`, text `#64748b`)

#### 4.1.3 Image Thumbnail & Full-Screen Viewer
* If product has an image URL, displays a 40x40 rounded thumbnail.
* Clicking thumbnail triggers `window.openImageViewer(url)`, mounting high-resolution preview modal `#imageViewerModalOverlay`.
* If no image exists, displays an SVG image icon placeholder in a dashed box.

#### 4.1.4 Product Row Action Buttons
1. **Edit Product Button**:
   * Selector: `<button class="hover-lift" data-sub-feature="update_product" onclick="window.openEditProductModal('${p.product_id}')">`
   * Opens `#editProductModalOverlay` pre-populated with product details.
2. **Delete Product Button**:
   * Selector: `<button class="hover-lift" data-sub-feature="delete_product" onclick="window.triggerDeleteProduct('${p.product_id}', '${p.product_name}')">`
   * Opens `#deleteConfirmOverlay` with product delete prompt.

---

## 5. Product Categories Tab (`#tabCategories`)

### 5.1 Categories Table (`#categoriesTable`)

Columns: `Category`, `Products Count`, `Actions`.

```
+-------------------------------------------------------------------------------------------------------------+
| Category                     | Products               | Actions                                             |
+------------------------------+------------------------+-----------------------------------------------------+
| [H] Hair Care                | 12 products            | [ Edit ] [ Delete ]                                 |
| [S] Skin & Facial            | 8 products             | [ Edit ] [ Delete ]                                 |
| [N] Nail Care                | 0 products             | [ Edit ] [ Delete ] (Active)                        |
+-------------------------------------------------------------------------------------------------------------+
```

#### 5.1.1 Products Count Link & Drill-Down Modal
* Displays the live count of products under each category (`pCount`).
* Clicking the count triggers `window.openCatProductsModal(catId, catName)`:
  * Opens `#catProductsModal` displaying a modal table of all products in that category with stock counts and prices.
  * Contains a footer shortcut button: `"View All Products"` which closes the modal and switches directly to the Products tab filtered to that category.

#### 5.1.2 Category Row Action Buttons
1. **Edit Category Button**:
   * Selector: `<button class="hover-lift" data-sub-feature="update_product_category" onclick="window.openEditCategoryModal('${c.category_id}')">`
   * Opens `#editCategoryModalOverlay` with current category name pre-populated.
2. **Delete Category Button**:
   * Selector: `<button class="hover-lift" data-sub-feature="delete_product_category">`
   * **Client Dependency Guard**: If `pCount > 0`, the button is visually disabled (`opacity: 0.45`, `cursor: not-allowed`, title: `"Cannot delete: products exist under this category"`).
   * If `pCount === 0`, clicking invokes `window.triggerDeleteCategory(id, name)`, opening `#deleteConfirmOverlay`.

---

## 6. Modals & Authoritative Database Mutations

### 6.1 Add Product Modal (`#addProductModalOverlay`)

```
+-------------------------------------------------------------------------------------------------------------+
| Add Product                                                                                             [X] |
| Create a new retail product                                                                                 |
+-------------------------------------------------------------------------------------------------------------+
| [ Photo Upload Area ]        | Product Name *        [ e.g. Argan Oil Serum                               ] |
|                              | Category *            [ Select a category v                         ] |
|   [ + Upload Photo ]         | Price (₹) *           [ 850          ]   Stock * [ 25                  ] |
|   [ - Remove Photo ]         | Description           [ Optional description...                    ] |
|                              | Status                [ (o) Active ]   [ ( ) Inactive ]                      |
+-------------------------------------------------------------------------------------------------------------+
|                                                                        [ Cancel ] [ Save Product ]          |
+-------------------------------------------------------------------------------------------------------------+
```

#### 6.1.1 Image Upload & Preview Lifecycle
* File input `#productPhotoInput` triggers image preview in `.product-photo-wrap` via `URL.createObjectURL(file)`.
* `#removeAddProductPhotoBtn` resets input and restores placeholder icon.
* Upon form submission, uploads file to Supabase Storage:
  ```javascript
  const photoFile = document.getElementById('productPhotoInput').files[0];
  if (photoFile) {
      finalImageUrl = await window.uploadProductImage(photoFile);
  }
  ```
  Generates collision-free filename: `${timestamp}-${randomString}-${safeName}` in bucket `product-images`.

#### 6.1.2 Form Submission & Authoritative Procedure Call
* **Button**: `<button id="saveProductBtn">`
* **Client Validation**:
  * Requires Product Name, Category UUID, Price, and Stock Quantity.
  * Duplicate check: rejects if another product with identical name exists under the same category (`isDuplicate`).
* **Database RPC**: Calls `public.create_product_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('create_product_atomic', {
      p_company_id:        companyId,
      p_branch_id:         branchId,
      p_category_id:       catId,
      p_product_name:      name,
      p_price:             Number(price),
      p_stock_quantity:    Number(stock),
      p_status:            statusVal,
      p_description:       descriptionVal || null,
      p_product_image_url: finalImageUrl || null
  });
  ```
* **Backend Execution Logic (`app.create_product_atomic`)**:
  1. Enforces tenant verification (`shared.verify_tenant_access`).
  2. Verifies `category_id` exists in `app.product_categories` and retrieves canonical `category_name`.
  3. Validates non-empty product name.
  4. Checks uniqueness against active products in same category:
     `'A product named "%" already exists in this category.'`
  5. Asserts non-negative price (`p_price >= 0`) and stock (`p_stock_quantity >= 0`).
  6. Inserts into `app.products`.
  7. Returns created product JSON.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Product created"`.
  * Triggers customer marketing event via `window.notifyCustomer('business', 'new_product_added', ...)`.
  * Closes modal, resets form fields, and invokes `fetchProducts()`.

---

### 6.2 Edit Product Modal (`#editProductModalOverlay`)

* **Modal Selector**: `<div id="editProductModalOverlay">`
* **Button**: `<button id="updateProductBtn">`
* **Image Management**:
  * Detects if new image was uploaded.
  * Captures previous image URL (`oldImageUrl`).
  * Executes database update FIRST.
  * **Safe Storage Cleanup**: Purges `oldImageUrl` from Supabase Storage only AFTER database update succeeds.
* **Database RPC**: Calls `public.update_product_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('update_product_atomic', {
      p_company_id:        companyId,
      p_branch_id:         branchId,
      p_product_id:        productId,
      p_category_id:       catId,
      p_product_name:      name,
      p_price:             Number(price),
      p_stock_quantity:    Number(stock),
      p_status:            statusVal,
      p_description:       descriptionVal || null,
      p_product_image_url: finalImageUrl || null
  });
  ```
* **Backend Execution Logic (`app.update_product_atomic`)**:
  1. Verifies tenant access and verifies product exists (`status != 'deleted'`).
  2. Verifies category exists.
  3. Collision guard: asserts no other product in category has the same name (`product_id != p_product_id`).
  4. Asserts non-negative price and stock.
  5. Updates `app.products` and updates `updated_at = NOW()`.
  6. Returns updated product JSON.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Product updated"`.
  * Closes modal and calls `fetchProducts()`.

---

### 6.3 Add Product Category Modal (`#addCategoryModalOverlay`)

```
+-------------------------------------------------------------------------------------------------------------+
| Add Product Category                                                                                    [X] |
| Create a new product category                                                                               |
+-------------------------------------------------------------------------------------------------------------+
| Category Name * [ e.g. Hair Care                                                                          ] |
+-------------------------------------------------------------------------------------------------------------+
|                                                                       [ Cancel ] [ Save Category ]          |
+-------------------------------------------------------------------------------------------------------------+
```

* **Button**: `<button id="saveCategoryBtn">`
* **Client Validation**: Rejects empty name or duplicate category name in `productsState.categories`.
* **Database RPC**: Calls `public.create_product_category_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('create_product_category_atomic', {
      p_company_id:    companyId,
      p_branch_id:     branchId,
      p_category_name: name,
      p_description:   null
  });
  ```
* **Backend Execution Logic (`app.create_product_category_atomic`)**:
  1. Verifies tenant access.
  2. Asserts trimmed category name is non-empty.
  3. Enforces branch/company category name uniqueness:
     `'A category named "%" already exists.'`
  4. Inserts into `app.product_categories` with `status = 'active'`.
  5. Returns created category JSON.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Category created successfully"`.
  * Closes modal, resets input, and calls `fetchProductCategories()`.

---

### 6.4 Edit Product Category Modal (`#editCategoryModalOverlay`)

* **Button**: `<button id="updateCategoryBtn">`
* **Database RPC**: Calls `public.update_product_category_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('update_product_category_atomic', {
      p_company_id:    companyId,
      p_branch_id:     branchId,
      p_category_id:   catId,
      p_category_name: name,
      p_description:   null
  });
  ```
* **Backend Execution Logic (`app.update_product_category_atomic`)**:
  1. Verifies tenant access and verifies category exists.
  2. Asserts non-empty name and uniqueness against all other categories (`category_id != p_category_id`).
  3. Updates category record in `app.product_categories`.
  4. **Single-Transaction Atomic Cascade**:
     ```sql
     UPDATE app.products
     SET category_name = v_clean_name,
         updated_at    = NOW()
     WHERE category_id = p_category_id
       AND company_id = p_company_id;
     ```
  5. Returns updated category JSON.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Category updated"`.
  * Closes modal and refreshes both `fetchProducts()` and `fetchProductCategories()` to guarantee synchronized state.

---

### 6.5 Delete Confirmation Modal (`#deleteConfirmOverlay`)

```
+-------------------------------------------------------------------------------------------------------------+
|                                             [ Trash Icon ]                                                  |
|                                       Delete Product / Category?                                            |
|                  Are you sure you want to delete this? This action cannot be undone.                        |
|                                                                                                             |
|                                         [ Cancel ]  [ Yes, Delete ]                                         |
+-------------------------------------------------------------------------------------------------------------+
```

* **Modal Selector**: `<div id="deleteConfirmOverlay" class="modal-overlay custom-logout-overlay">`
* **Shared Handler**: Managed via closure `deleteTarget = { type: 'product' | 'category', id, name }`.
* **Execution for Products**:
  * Invokes `public.delete_product_atomic(p_company_id, p_branch_id, p_product_id)`.
  * Soft-deletes `app.products` record (`status = 'deleted'`).
  * Product images are NOT deleted from storage to preserve receipts and POS historical audit trails.
  * Shows toast: `"Product deleted successfully"`.
  * Re-fetches products via `fetchProducts()`.
* **Execution for Categories**:
  * **Database-Level Dependency Blocker**:
    ```sql
    SELECT COUNT(*) INTO v_product_count
    FROM app.products
    WHERE category_id = p_category_id
      AND company_id = p_company_id
      AND status != 'deleted';

    IF v_product_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete category "%": % active product(s) are assigned to it.', v_cat_name, v_product_count;
    END IF;
    ```
  * If products are assigned, execution aborts with error toast.
  * If clean, soft-deletes category (`status = 'deleted'`).
  * Shows toast: `"Category deleted successfully"`.
  * Re-fetches categories via `fetchProductCategories()`.

---

## 7. Inventory Stock Adjustment RPC (`app.adjust_product_stock_atomic`)

Used during manual adjustments and integrated with checkout workflows:
* **Function Signature**:
  ```sql
  FUNCTION app.adjust_product_stock_atomic(
      p_company_id      uuid,
      p_branch_id       uuid,
      p_product_id      uuid,
      p_delta_quantity  bigint,
      p_reason          text DEFAULT 'manual_adjustment'
  ) RETURNS jsonb
  ```
* **Security & Concurrency Protections**:
  1. Enforces tenant verification.
  2. Acquires row-level lock (`FOR UPDATE`) on `app.products` to prevent race conditions during rapid POS checkout.
  3. Asserts non-negative resultant inventory:
     ```sql
     IF v_curr_stock + p_delta_quantity < 0 THEN
         RAISE EXCEPTION 'Insufficient stock: current stock is %, requested change is %.', v_curr_stock, p_delta_quantity;
     END IF;
     ```
  4. Atomically updates `app.products SET stock_quantity = stock_quantity + p_delta_quantity, updated_at = NOW()`.
  5. Returns `{ product_id: uuid, previous_stock: bigint, delta: bigint, new_stock: bigint }`.

---

## 8. Complete End-to-End Element & Interaction Catalog

| Element Selector / Event | UI Location | User Action | Frontend Handler | Target RPC / Storage | Affected Tables | Guards & Validation |
|---|---|---|---|---|---|---|
| `.tab-btn[data-target="products"]` (click) | Tab Bar | Switches to Products | Tab click handler | `fetchProducts()` | `app.products` | Renders products table, restores filter button |
| `.tab-btn[data-target="categories"]` (click) | Tab Bar | Switches to Categories | Tab click handler | `fetchProductCategories()` | `app.product_categories` | Renders categories table, hides filter button |
| `#searchInput` (input) | Header | Searches products/categories | Input listener | None (client filter) | None | Substring match on name & category |
| `#filterBtn` (click) | Header | Opens filter dropdown | Click listener | None | None | Toggles `.active` on `#filterMenu` |
| `input[name="filterCategory"]` (change) | Filter Menu | Filters by category | Radio change listener | None | None | Filters products by exact category UUID |
| `input[name="filterStock"]` (change) | Filter Menu | Filters by stock status | Radio change listener | None | None | Filters by `in_stock`, `low_stock`, or `out_of_stock` |
| `#resetFilters` (click) | Filter Menu | Resets all filters | Click listener | `renderProductsTable()` | None | Resets radios to `all`; re-renders table |
| `#applyFilters` (click) | Filter Menu | Applies selected filters | Click listener | `renderProductsTable()` | None | Filters table; closes `#filterMenu` |
| `#primaryActionBtn` (click) | Header | Adds Product or Category | Contextual click handler | None | None | Opens `#addProductModalOverlay` or `#addCategoryModalOverlay` |
| `#sortPrice` (click) | Products Header | Sorts by price | Click listener | `renderProductsTable()` | None | Toggles `asc` / `desc` price sorting |
| `#sortStock` (click) | Products Header | Sorts by stock quantity | Click listener | `renderProductsTable()` | None | Toggles `asc` / `desc` stock sorting |
| `.product-photo-wrap img` (click) | Products Table | Clicks product picture | `window.openImageViewer(url)` | None | None | Opens `#imageViewerModalOverlay` |
| `button[data-sub-feature="update_product"]` (click) | Products Table | Clicks "Edit" | `window.openEditProductModal(id)` | None | None | Populates and opens `#editProductModalOverlay` |
| `button[data-sub-feature="delete_product"]` (click) | Products Table | Clicks "Delete" | `window.triggerDeleteProduct(id, name)` | None | None | Opens `#deleteConfirmOverlay` |
| `.customer-link` (click) | Categories Table | Clicks product count | `window.openCatProductsModal(id, name)` | None | None | Opens `#catProductsModal` with products list |
| `button[data-sub-feature="update_product_category"]` (click) | Categories Table | Clicks "Edit" | `window.openEditCategoryModal(id)` | None | None | Populates and opens `#editCategoryModalOverlay` |
| `button[data-sub-feature="delete_product_category"]` (click) | Categories Table | Clicks "Delete" | `window.triggerDeleteCategory(id, name)` | None | None | Disabled if `pCount > 0`; opens `#deleteConfirmOverlay` |
| `#productPhotoInput` (change) | Add Product Modal | Chooses photo file | Change listener | None | None | Displays preview in `.product-photo-wrap` |
| `#removeAddProductPhotoBtn` (click) | Add Product Modal | Removes chosen photo | Click listener | None | None | Clears file input and resets preview |
| `#statusActiveBtn` / `#statusInactiveBtn` (click) | Add Product Modal | Toggles status | `window.selectStatus(val)` | None | None | Toggles radio input `#statusActive` / `#statusInactive` |
| `#saveProductBtn` (click) | Add Product Modal | Submits new product | Click listener | Storage upload + `public.create_product_atomic` | `app.products`, `storage.objects` | Asserts non-negative price/stock, category existence, name uniqueness |
| `#updateProductBtn` (click) | Edit Product Modal | Updates product | Click listener | Storage upload + `public.update_product_atomic` + Storage delete | `app.products`, `storage.objects` | Safe storage cleanup: purges old image only after DB update |
| `#saveCategoryBtn` (click) | Add Category Modal | Submits category | Click listener | `public.create_product_category_atomic` | `app.product_categories` | Name uniqueness within tenant |
| `#updateCategoryBtn` (click) | Edit Category Modal | Updates category | Click listener | `public.update_product_category_atomic` | `app.product_categories`, `app.products` | **Atomic cascade rename** to `app.products.category_name` |
| `#btnConfirmDelete` (click) | Delete Modal | Confirms deletion | Click listener | `public.delete_product_atomic` OR `public.delete_product_category_atomic` | `app.products` OR `app.product_categories` | **Active products blocker** on category delete; soft-deletions |
| `#closeImageViewerBtn` (click) | Image Viewer | Closes preview | Click listener | None | None | Hides `#imageViewerModalOverlay` |

---

## 9. Security, RLS & Verification Checklist

- [x] **Zero Direct Mutations**: Direct table updates retired; all mutating actions execute via `public.*_atomic` procedures.
- [x] **Strict Tenant Isolation**: `shared.verify_tenant_access(p_company_id, p_branch_id)` enforced across all procedures.
- [x] **Atomic Category Cascades**: Renaming a category atomically updates `app.products.category_name` in a single PostgreSQL transaction.
- [x] **Category Dependency Blocker**: Categories with active products cannot be deleted; enforced at both client and database level.
- [x] **Inventory & Price Sanity**: `price >= 0` and `stock_quantity >= 0` enforced by database validation.
- [x] **Safe Image Storage Protocol**: New images uploaded via SDK; old images purged only after successful database commits.
- [x] **Audit Preservation**: Product and category deletions are soft deletions (`status = 'deleted'`), guaranteeing past POS receipts and transaction histories remain intact.

