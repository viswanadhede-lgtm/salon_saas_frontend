# MODULE 06 — SERVICES & PACKAGES

**Page**: `services.html`  
**Entry Scripts**: `services.js`, `service-categories.js`, `scripts/services/services-api.js`, `scripts/services/services-crud.js`, `scripts/services/services-modals.js`, `scripts/services/services-packages.js`, `scripts/services/services-renders.js`, `scripts/services/services-state.js`  
**Architecture**: Zero-Trust Frontend / Authoritative Backend  
**Migration**: `supabase/migrations/20261103000009_harden_services_module.sql` ✅ DEPLOYED  
**Audit Status**: 100% Complete — 14/14 integration tests PASSED  
**Last Updated**: 2026-11-04

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Page Load Sequence](#2-page-load-sequence)
3. [Global State & Context](#3-global-state--context)
4. [Tab Navigation & Contextual Headers](#4-tab-navigation--contextual-headers)
5. [Tab 1: Services](#5-tab-1-services)
   - [5.1 Search Services Input](#51-search-services-input)
   - [5.2 Category Filter Dropdown](#52-category-filter-dropdown)
   - [5.3 Add Service Button](#53-add-service-button)
   - [5.4 Services Table Render](#54-services-table-render)
   - [5.5 Service Row — Edit Button](#55-service-row--edit-button)
   - [5.6 Service Row — Delete Button](#56-service-row--delete-button)
   - [5.7 Add Service Modal & Submission](#57-add-service-modal--submission)
   - [5.8 Edit Service Modal & Submission](#58-edit-service-modal--submission)
   - [5.9 Delete Service Confirmation Modal](#59-delete-service-confirmation-modal)
6. [Tab 2: Service Categories](#6-tab-2-service-categories)
   - [6.1 Search Categories Input](#61-search-categories-input)
   - [6.2 Add Category Button](#62-add-category-button)
   - [6.3 Categories Table Render](#63-categories-table-render)
   - [6.4 Category Services Count Link](#64-category-services-count-link)
   - [6.5 Category Row — Edit Button](#65-category-row--edit-button)
   - [6.6 Category Row — Delete Button](#66-category-row--delete-button)
   - [6.7 Add Category Modal & Submission](#67-add-category-modal--submission)
   - [6.8 Edit Category Modal & Submission (Atomic Cascade)](#68-edit-category-modal--submission-atomic-cascade)
   - [6.9 Delete Category Confirmation Modal](#69-delete-category-confirmation-modal)
   - [6.10 Category Services View Modal](#610-category-services-view-modal)
7. [Tab 3: Packages](#7-tab-3-packages)
   - [7.1 Search Packages Input](#71-search-packages-input)
   - [7.2 Add Package Button](#72-add-package-button)
   - [7.3 Packages Table Render](#73-packages-table-render)
   - [7.4 Package Services Count Link](#74-package-services-count-link)
   - [7.5 Package Row — Edit Button](#75-package-row--edit-button)
   - [7.6 Package Row — Delete Button](#76-package-row--delete-button)
   - [7.7 Add Package Modal, Multi-Select & Submission](#77-add-package-modal-multi-select--submission)
   - [7.8 Edit Package Modal & Submission](#78-edit-package-modal--submission)
   - [7.9 Delete Package Confirmation Modal](#79-delete-package-confirmation-modal)
   - [7.10 Package Services View Modal](#710-package-services-view-modal)
8. [RPCs Reference](#8-rpcs-reference)
9. [Tables Affected](#9-tables-affected)
10. [Sub-Feature Gate Map](#10-sub-feature-gate-map)
11. [Error Handling Summary](#11-error-handling-summary)
12. [Security Architecture](#12-security-architecture)

---

## 1. Module Overview

Module 06 encapsulates the catalog definition of the salon business across three interrelated entities:
1. **Service Categories**: Groupings (e.g., Hair, Skin, Nails, Spa).
2. **Individual Services**: Service offerings with pricing, duration in minutes, and category association.
3. **Packages & Bundles**: Multi-service packages bundled at a promotional final price (`final_price <= original_price`).

**Zero-Trust Hardening completed 2026-11-03.** All 12 previously-direct table writes have been eliminated and replaced with 9 authoritative, `SECURITY DEFINER` stored procedures in the `app` schema with `public` PostgREST synonym wrappers.

### Key Architectural Protections
- **0 direct table writes** on `services`, `service_categories`, `packages`, or `package_services`.
- **Atomic Category Rename Cascade**: Renaming a category automatically cascades the new `category_name` to all member services in `app.services` inside the **same transaction**.
- **Referential Integrity Blocker Guards**:
  - Deleting a category is blocked if active services reference it.
  - Deleting a service is blocked if included in active packages or upcoming bookings.
  - Deleting a package is blocked if upcoming bookings reference it.
- **Price & Duration Ceilings**: Prices must be non-negative; durations must be $\ge 1$ min; bundle `final_price` must never exceed `original_price`.

---

## 2. Page Load Sequence

```
services.html
│
├── scripts/auth-loader.js                   → 3-gate auth guard (session → subscription → RBAC)
├── scripts/sub-features/sub-feature-gate.js → Processes data-sub-feature attributes
├── scripts/app-shell.js                     → Injects global sidebar and header shell
├── scripts/services/services-renders.js     → Page glue, tabs, renderers, search & filter
├── Inline module in services.html
│   ├── initCategories() (service-categories.js)
│   │   ├── setupModals()                   → Injects edit & delete confirmation modals
│   │   ├── attachEventListeners()          → Binds category form submissions
│   │   └── fetchCategories()               → SELECT app.service_categories (status != 'deleted')
│   │
│   └── initServices() (services.js)
│       ├── setupModals()                   → Injects service/package edit & delete modals
│       ├── initPackageDropdowns()          → Initializes multi-select service dropdowns
│       ├── attachEventListeners()          → Binds service & package form submissions
│       ├── fetchServices()                 → SELECT app.services (status != 'deleted')
│       └── fetchPackages()                 → SELECT app.packages + package_services junction
```

---

## 3. Global State & Context

| Variable / State Property | Location | Definition & Purpose |
|---|---|---|
| `company_id` | Storage | `localStorage.getItem('company_id')` |
| `active_branch_id` | Storage | `localStorage.getItem('active_branch_id')` |
| `servicesState.liveServicesData` | `services-state.js` | Array of non-deleted services in active branch |
| `liveCategoriesData` | `service-categories.js` | Array of non-deleted categories in active branch |
| `servicesState.livePackagesData` | `services-state.js` | Array of non-deleted packages in active branch |
| `servicesState.selectedPackageServices` | `services-state.js` | `Set<UUID>` of service IDs selected in Add Package modal |
| `servicesState.editSelectedPackageServices` | `services-state.js` | `Set<UUID>` of service IDs selected in Edit Package modal |
| `servicesState.serviceToDelete` | `services-state.js` | `{ id, name }` for service deletion |
| `servicesState.packageToDelete` | `services-state.js` | `{ id, name }` for package deletion |
| `categoryToDelete` | `service-categories.js` | `{ category_id, name }` for category deletion |

---

## 4. Tab Navigation & Contextual Headers

The tab bar (`#tabBtnServices`, `#tabBtnCategories`, `#tabBtnPackages`) calls `switchTab(tab)` which updates visual styles, shows the target table panel, and switches the header controls dynamically:

| Active Tab | Visible Table Panel | Header Search Bar | Category Filter | Primary Add Button |
|---|---|---|---|---|
| **Services** (`services`) | `#panelServices` | `#servicesSearchWrap` (`#servicesSearchInput`) | `#servicesCategoryFilter` | `#btnAddService` ("Add Service") |
| **Service Categories** (`categories`) | `#panelCategories` | `#categoriesSearchWrap` (`#categoriesSearchInput`) | *Hidden* | `#btnAddCategory` ("Add Category") |
| **Packages** (`packages`) | `#panelPackages` | `#packagesSearchWrap` (`#packagesSearchInput`) | *Hidden* | `#btnAddPackage` ("Add Package") |

Tab counter badges (`#countServices`, `#countCategories`, `#countPackages`) display the current record count in each catalog tier.

---

## 5. Tab 1: Services

### 5.1 Search Services Input

**Element**: `#servicesSearchInput`  
**Event**: `input` -> `applyServiceFilters()`

**Frontend Behavior**:
- Reads search text and active category selection from `#servicesCategoryFilter`.
- Performs client-side case-insensitive filter over `servicesState.liveServicesData`.
- Calls `window.renderSvc(filtered)`.

---

### 5.2 Category Filter Dropdown

**Element**: `#servicesCategoryFilter`  
**Populated by**: `populateServicesCategoryFilter()`  
**Event**: `change` -> `applyServiceFilters()`

**Frontend Behavior**:
- Lists all active categories from `liveCategoriesData`.
- Filters services by `service.category_id === selectedCatId`.
- Updates table rendering immediately.

---

### 5.3 Add Service Button

**Element**: `#btnAddService`  
**Sub-Feature Gate**: `data-sub-feature="create_service"`  
**Event**: `click`

**Frontend Behavior**:
1. Opens `#addServiceModal` by adding `.active`.
2. Resets form fields in `#addServiceForm`.
3. Populates `#sfCategory` dropdown with active categories from `liveCategoriesData`.
4. Calls `fetchCategories()` in the background to ensure fresh category options.

---

### 5.4 Services Table Render

**Element**: `#servicesTableBody`  
**Renderer**: `renderSvc(data)` in `scripts/services/services-renders.js`

**Rendered Columns**:
- **Service**: Service name (`service_name`).
- **Category**: Category name in blue pill badge (`category_name`).
- **Duration**: Duration in minutes (`{duration} min`).
- **Price**: Currency formatted price (`₹{price}`).
- **Status**: Status badge (Active in green, Inactive in gray).
- **Actions**: Edit & Delete action buttons.

---

### 5.5 Service Row — Edit Button

**Element**: `.action-buttons button[data-sub-feature="update_service"]`  
**Click Handler**: `window.openEditServiceModal(serviceId)`

**Frontend Behavior**:
1. Finds target service in `servicesState.liveServicesData`.
2. Populates `#editServiceModal`:
   - `#editServiceId` = `service_id`
   - `#editSfSvcName` = `service_name`
   - Populates `#editSfCategory` dropdown via `populateCategoryDropdownExForEdit()` and selects matching `category_id`.
   - `#editSfDuration` = `duration`
   - `#editSfPrice` = `price`
   - `#editSfDescription` = `description`
   - Status radio button checked according to `status`.
3. Opens `#editServiceModal`.

---

### 5.6 Service Row — Delete Button

**Element**: `.action-buttons button[data-sub-feature="delete_service"]`  
**Click Handler**: `window.triggerDeleteService(serviceId, serviceName)`

**Frontend Behavior**:
1. Sets `servicesState.serviceToDelete = { id: svcId, name: svcName }`.
2. Opens `#deleteServiceConfirmOverlay` by adding `.active`.

---

### 5.7 Add Service Modal & Submission

**Modal Container**: `#addServiceModal`  
**Form**: `#addServiceForm`  
**Inputs**:
- `#sfSvcName`: Service Name (Required)
- `#sfCategory`: Category ID (Required select)
- `#sfDuration`: Duration in minutes (Required, min 5, step 5)
- `#sfPrice`: Price in ₹ (Required, min 0)
- `input[name="sfStatus"]`: Active / Inactive radio
- `#sfDescription`: Optional description notes

**Frontend Validation**:
- Name must not be blank.
- Valid category must be selected.
- Duration must be $\ge 5$ and a multiple of 5.
- Price must be $\ge 0$.
- Duplicate check: Name cannot already exist in the same category in `liveServicesData`.

**RPC Call (`create_service_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('create_service_atomic', {
    p_company_id:   companyId,
    p_branch_id:    branchId,
    p_service_name: serviceName,
    p_category_id:  categoryId,
    p_price:        Number(price),
    p_duration:     Number(duration),
    p_description:  description || null,
    p_status:       status || 'active'
});
```

**Backend Execution (`create_service_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts `p_category_id` exists, belongs to branch, and `status <> 'deleted'`.
3. Reads authoritative `category_name` from `app.service_categories`.
4. Asserts `p_price >= 0` and `p_duration >= 1`.
5. Duplicate check: verifies case-insensitive `service_name` uniqueness in the branch among non-deleted services.
6. Inserts into `app.services` with generated `service_id`, `created_at = NOW()`, `updated_at = NOW()`.
7. Returns `{ success: true, service_id, service_name, price, duration, category_name }`.

**Post-Success**:
- Toast: `"Service added successfully!"`.
- Event notification: `evt_service_created`.
- Closes modal, resets form, and calls `fetchServices()`.

---

### 5.8 Edit Service Modal & Submission

**Modal Container**: `#editServiceModal`  
**Form**: `#editServiceForm`

**RPC Call (`update_service_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('update_service_atomic', {
    p_company_id:   companyId,
    p_branch_id:    branchId,
    p_service_id:   serviceId,
    p_service_name: newServiceName,
    p_category_id:  categoryId,
    p_price:        Number(price),
    p_duration:     Number(duration),
    p_description:  description || null,
    p_status:       status
});
```

**Backend Execution (`update_service_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts service exists and belongs to branch.
3. If category changed: verifies new category and extracts `category_name`.
4. Asserts `price >= 0` and `duration >= 1`.
5. Updates `app.services`.
6. **Package Cascade Guard**: If `service_name` changed, updates `service_name` in junction table `app.package_services` where `service_id = p_service_id`.
7. Returns `{ success: true, service_id, service_name, price, duration }`.

---

### 5.9 Delete Service Confirmation Modal

**Modal Container**: `#deleteServiceConfirmOverlay`  
**Full Screen Loader**: `#fullScreenDeleteServiceLoader`  
**Confirm Button**: `#btnConfirmDeleteService`  
**Cancel Button**: `#btnCancelDeleteService`

**RPC Call (`delete_service_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('delete_service_atomic', {
    p_company_id: companyId,
    p_branch_id:  branchId,
    p_service_id: serviceId
});
```

**Backend Execution & Blocker Guards (`delete_service_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts service exists and belongs to branch.
3. **Active Package Blocker**:
   Checks `app.package_services ps JOIN app.packages p ON ps.package_id = p.package_id WHERE ps.service_id = p_service_id AND p.is_active = true AND p.status <> 'deleted'`.
   If count > 0, aborts: `"Cannot delete this service because it is currently included in active package(s): {names}. Remove it from the package(s) or deactivate them first."`
4. **Upcoming Booking Blocker**:
   Checks `app.bookings WHERE service_id = p_service_id AND status IN ('booked', 'confirmed') AND booking_date >= CURRENT_DATE`.
   If count > 0, aborts: `"Cannot delete this service because there are upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first."`
5. Soft-deletes: sets `status = 'deleted'`, `updated_at = NOW()`.
6. Returns `{ success: true, service_id, status: 'deleted' }`.

---

## 6. Tab 2: Service Categories

### 6.1 Search Categories Input

**Element**: `#categoriesSearchInput`  
**Event**: `input` -> `applyCategoryFilters()`

**Frontend Behavior**:
- Live filters `window.liveCategoriesData` by matching search query against `category_name` or `description`.
- Calls `window.renderCat(filtered)`.

---

### 6.2 Add Category Button

**Element**: `#btnAddCategory`  
**Sub-Feature Gate**: `data-sub-feature="create_service_category"`  
**Event**: `click` -> Opens `#addCategoryModal`.

---

### 6.3 Categories Table Render

**Element**: `#categoriesTableBody`  
**Renderer**: `renderCat(data)` in `scripts/services/services-renders.js`

**Rendered Columns**:
- **Category**: Category name + description.
- **Services Count**: Interactive link showing `{N} services`.
- **Status**: Status badge.
- **Actions**: Edit and Delete action buttons.
  - Delete button is visually disabled (`opacity: 0.45; cursor: not-allowed;`) with tooltip if `{N} > 0`.

---

### 6.4 Category Services Count Link

**Element**: `.cat-service-count-link[data-cat-id]`  
**Click Handler**: `openCatServicesModal(catId, catName)`

**Frontend Behavior**:
- Reads `data-cat-id` and opens `#catServicesModal`.
- Filters `window.liveServicesData` where `service.category_id === catId`.
- Displays modal showing all services under this category with name, duration, and price.

---

### 6.5 Category Row — Edit Button

**Element**: `.btn-edit-cat[data-sub-feature="update_service_category"]`  
**Click Handler**: `window.openEditCategoryModal(catId, catName)`

**Frontend Behavior**:
1. Finds category in `liveCategoriesData`.
2. Populates `#editCategoryModal`:
   - `#editCategoryId` = `category_id`
   - `#editCfName` = `category_name`
   - `#editCfDescription` = `description`
   - Status radio button checked ('active' or 'inactive').
3. Opens `#editCategoryModal`.

---

### 6.6 Category Row — Delete Button

**Element**: `.btn-delete-cat[data-sub-feature="delete_service_category"]`  
**Condition**: Active when `service_count === 0`.  
**Click Handler**: `window.triggerDeleteCategory(catId, catName)`

**Frontend Behavior**:
1. Sets `categoryToDelete = { category_id: resolvedId, name: resolvedName }`.
2. Opens `#deleteConfirmOverlay`.

---

### 6.7 Add Category Modal & Submission

**Modal Container**: `#addCategoryModal`  
**Form**: `#addCategoryForm`  
**Inputs**:
- `#cfName`: Category Name (Required, max 100 chars)
- `#cfDescription`: Optional description
- `input[name="cfStatus"]`: Active / Inactive radio

**RPC Call (`create_service_category_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('create_service_category_atomic', {
    p_company_id:    companyId,
    p_branch_id:     branchId,
    p_category_name: categoryName,
    p_description:   description || null,
    p_status:        status
});
```

**Backend Execution (`create_service_category_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Validates non-empty name ($\le 100$ chars) and valid status.
3. Duplicate check: Case-insensitive unique check per branch among non-deleted categories.
4. Inserts into `app.service_categories`.
5. Returns `{ success: true, category_id, category_name }`.

---

### 6.8 Edit Category Modal & Submission (Atomic Cascade)

**Modal Container**: `#editCategoryModal`  
**Form**: `#editCategoryForm`

**RPC Call (`update_service_category_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('update_service_category_atomic', {
    p_company_id:    companyId,
    p_branch_id:     branchId,
    p_category_id:   categoryId,
    p_category_name: newCategoryName,
    p_description:   description || null,
    p_status:        status
});
```

**Backend Execution & Atomic Cascading Rename (`update_service_category_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts category exists and belongs to branch.
3. Checks duplicate name collision against other categories in branch.
4. Updates `app.service_categories`.
5. **Atomic Cascading Rename**:
   ```sql
   IF v_clean_name IS NOT NULL AND lower(v_clean_name) <> lower(v_old_name) THEN
       UPDATE app.services
       SET category_name = v_clean_name, updated_at = NOW()
       WHERE category_id = p_category_id
         AND company_id = p_company_id
         AND branch_id = p_branch_id;
   END IF;
   ```
   Synchronizes `app.services.category_name` in the **exact same transaction**.
6. Returns `{ success: true, category_id, category_name, services_updated_count }`.

---

### 6.9 Delete Category Confirmation Modal

**Modal Container**: `#deleteConfirmOverlay`  
**Full Screen Loader**: `#fullScreenDeleteLoader`  
**Confirm Button**: `#btnConfirmDelete`

**RPC Call (`delete_service_category_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('delete_service_category_atomic', {
    p_company_id:  companyId,
    p_branch_id:   branchId,
    p_category_id: catId
});
```

**Backend Execution & Blocker Guard (`delete_service_category_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts category exists and belongs to branch.
3. **Active Service Guard**:
   Counts `app.services WHERE category_id = p_category_id AND status <> 'deleted'`.
   If count > 0, aborts: `"Cannot delete category: N active service(s) are still assigned to it. Please reassign or delete the services first."`
4. Soft-deletes: sets `status = 'deleted'`, `updated_at = NOW()`.
5. Returns `{ success: true, category_id, active_services_count: 0 }`.

---

### 6.10 Category Services View Modal

**Modal Container**: `#catServicesModal`  
**Header Title**: `#catServicesModalTitle`  
**Table Body**: `#catServicesModalBody`  
**Footer Actions**:
- Close button.
- "View All Services" button: closes modal and executes `switchTab('services')`.

---

## 7. Tab 3: Packages

### 7.1 Search Packages Input

**Element**: `#packagesSearchInput`  
**Event**: `input` -> Filters `window.livePackagesData` by `package_name` and calls `renderPackages()`.

---

### 7.2 Add Package Button

**Element**: `#btnAddPackage`  
**Sub-Feature Gate**: `data-sub-feature="create_package"`  
**Event**: `click` -> Opens `#addPackageModal` and initializes multi-select service dropdown via `populatePackageServicesDropdown()`.

---

### 7.3 Packages Table Render

**Element**: `#packagesTableBody`  
**Renderer**: `renderPackages(data)` in `scripts/services/services-renders.js`

**Rendered Columns**:
- **Package Name**: Name + description.
- **Services**: Clickable link showing `{N} services`.
- **Original Price**: Sum of regular service prices (`₹{original_price}`).
- **Final Price**: Promotional package price in green (`₹{final_price}`).
- **Status**: Status badge (Active / Inactive).
- **Actions**: Edit & Delete action buttons.

---

### 7.4 Package Services Count Link

**Element**: `.customer-link` inside Services column  
**Click Handler**: `openPkgServicesModal(pkgId, pkgName)`

**Frontend Behavior**:
- Reads package services from in-memory cache (`cachedPkg.package_services`) for instant render.
- If not cached: fetches from `package_services` table.
- Opens `#pkgServicesModal` showing table of included services (Service Name, Category, Price).

---

### 7.5 Package Row — Edit Button

**Element**: `button[data-sub-feature="update_package"]`  
**Click Handler**: `openEditPackageModal(pkgId)`

**Frontend Behavior**:
1. Finds package in `livePackagesData`.
2. Fetches linked service IDs via `fetchPackageServicesForEdit(pkgId)`.
3. Populates `#editPackageModal`:
   - `#editPkgId` = `package_id`
   - `#editPkgName` = `package_name`
   - `#editPkgFinalPrice` = `final_price`
   - `#editPkgDescription` = `description`
   - Status radio button checked.
4. Initializes multi-select service dropdown via `populateEditPackageServicesDropdown()`.
5. Renders selected service chips and recalculates original price.
6. Opens `#editPackageModal`.

---

### 7.6 Package Row — Delete Button

**Element**: `button[data-sub-feature="delete_package"]`  
**Click Handler**: `triggerDeletePackage(pkgId, pkgName)`

**Frontend Behavior**:
1. Sets `servicesState.packageToDelete = { id: pkgId, name: pkgName }`.
2. Opens `#deletePackageConfirmOverlay`.

---

### 7.7 Add Package Modal, Multi-Select & Submission

**Modal Container**: `#addPackageModal`  
**Form**: `#addPackageForm`

**Multi-Select Service Dropdown**:
- Toggle: `#pkgServicesDropdownToggle`
- Dropdown Menu: `#pkgServicesDropdownMenu`
- Table of active services with checkboxes (`#pkgServicesDropdownBody`).
- Clicking row toggles service in `servicesState.selectedPackageServices` (`Set<UUID>`).
- Renders removable chips in `#pkgServicesSelectedChips`.
- **Auto-Calculated Original Price**: `#pkgOriginalPrice` auto-sums the regular prices of all selected services. Set to `readonly`.

**Price Ceilings & Validation**:
- `selectedPackageServices.size > 0` (at least 1 service required).
- `packageName` must not be empty.
- `originalPrice >= 0` and `finalPrice >= 0`.
- **Ceiling Rule**: `finalPrice <= originalPrice`.
- Duplicate check: Name cannot already exist in `livePackagesData`.

**RPC Call (`create_package_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('create_package_atomic', {
    p_company_id:     companyId,
    p_branch_id:      branchId,
    p_package_name:   packageName,
    p_description:    description || null,
    p_original_price: Number(originalPrice),
    p_final_price:    Number(finalPrice),
    p_is_active:      isActive !== false,
    p_service_ids:    Array.from(servicesState.selectedPackageServices)
});
```

**Backend Execution (`create_package_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts `p_service_ids` is non-empty; validates that all services belong to branch and are active.
3. Asserts `p_final_price <= p_original_price`.
4. Asserts package name uniqueness per branch.
5. **Atomic 2-Table Write**:
   - Inserts into `app.packages` with `services_count = cardinality(p_service_ids)`.
   - Inserts rows into junction table `app.package_services (package_id, service_id, service_name)` in the same transaction.
6. Returns created package JSON.

---

### 7.8 Edit Package Modal & Submission

**Modal Container**: `#editPackageModal`  
**Form**: `#editPackageForm`

**RPC Call (`update_package_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('update_package_atomic', {
    p_company_id:     companyId,
    p_branch_id:      branchId,
    p_package_id:     pkgId,
    p_package_name:   packageName,
    p_description:    description || null,
    p_original_price: Number(originalPrice),
    p_final_price:    Number(finalPrice),
    p_is_active:      isActive,
    p_service_ids:    Array.from(servicesState.editSelectedPackageServices)
});
```

**Backend Execution (`update_package_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts package exists and belongs to branch.
3. Asserts `p_final_price <= p_original_price`.
4. Updates `app.packages`.
5. **Atomic Service Re-assignment**:
   - Deletes old rows in `app.package_services WHERE package_id = p_package_id`.
   - Inserts new rows for `p_service_ids`.
   - Updates `services_count = cardinality(p_service_ids)`.
6. Returns updated package JSON.

---

### 7.9 Delete Package Confirmation Modal

**Modal Container**: `#deletePackageConfirmOverlay`  
**Confirm Button**: `#btnConfirmDeletePackage`

**RPC Call (`delete_package_atomic`)**:
```javascript
const { data, error } = await supabase.rpc('delete_package_atomic', {
    p_company_id: companyId,
    p_branch_id:  branchId,
    p_package_id: pkgId
});
```

**Backend Execution & Blocker Guard (`delete_package_atomic`)**:
1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. Asserts package exists and belongs to branch.
3. **Upcoming Booking Guard**:
   Checks `app.bookings WHERE service_id = p_package_id AND status IN ('booked', 'confirmed') AND booking_date >= CURRENT_DATE`.
   Also checks summary bridge `app.bookings_for_business_transaction`.
   If count > 0, aborts: `"Cannot delete this package because there are N upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first."`
4. Soft-deletes: sets `status = 'deleted'`, `is_active = false`, `updated_at = NOW()`.
5. Returns `{ success: true, package_id, status: 'deleted' }`.

---

### 7.10 Package Services View Modal

**Modal Container**: `#pkgServicesModal`  
**Header Title**: `#pkgServicesModalTitle`  
**Table Body**: `#pkgServicesModalBody`  
**Close Button**: Modal header X and footer Close button.

---

## 8. RPCs Reference

| Function Name | Schema | Security | Key Parameters | Return Type | Description |
|---|---|---|---|---|---|
| `create_service_category_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_category_name`, `p_description`, `p_status` | `jsonb` | Creates category with branch-level case-insensitive name uniqueness. |
| `update_service_category_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_category_id`, `p_category_name`, `p_description`, `p_status` | `jsonb` | Updates category and **atomically cascades new name to `app.services.category_name`**. |
| `delete_service_category_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_category_id` | `jsonb` | Soft-deletes category; **blocks if active services are assigned**. |
| `create_service_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_service_name`, `p_category_id`, `p_price`, `p_duration`, `p_description`, `p_status` | `jsonb` | Creates service; enforces `price >= 0`, `duration >= 1`, category validation, and unique name. |
| `update_service_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_service_id`, `p_service_name`, `p_category_id`, `p_price`, `p_duration`, `p_description`, `p_status` | `jsonb` | Updates service; **cascades name changes to `app.package_services`**. |
| `delete_service_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_service_id` | `jsonb` | Soft-deletes service; **blocks if in active packages or upcoming bookings**. |
| `create_package_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_package_name`, `p_description`, `p_original_price`, `p_final_price`, `p_is_active`, `p_service_ids` | `jsonb` | Creates package and inserts child junction rows in `app.package_services` in 1 transaction. |
| `update_package_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_package_id`, `p_package_name`, `p_description`, `p_original_price`, `p_final_price`, `p_is_active`, `p_service_ids` | `jsonb` | Updates package and synchronizes `app.package_services` junction rows atomically. |
| `delete_package_atomic` | `app` + `public` | `SECURITY DEFINER` | `p_company_id`, `p_branch_id`, `p_package_id` | `jsonb` | Soft-deletes package; **blocks if upcoming bookings exist**. |

---

## 9. Tables Affected

| Table | Operation | Triggering Action / Flow |
|---|---|---|
| `app.services` | `SELECT` | Directory browsing, search, dropdown population |
| `app.services` | `INSERT` | New service creation (`create_service_atomic`) |
| `app.services` | `UPDATE` | Service edit (`update_service_atomic`), soft deletion (`delete_service_atomic`), cascading category rename (`update_service_category_atomic`) |
| `app.service_categories` | `SELECT` | Category browsing, category dropdowns |
| `app.service_categories` | `INSERT` | New category creation (`create_service_category_atomic`) |
| `app.service_categories` | `UPDATE` | Category edit (`update_service_category_atomic`), soft deletion (`delete_service_category_atomic`) |
| `app.packages` | `SELECT` | Package browsing, bundle details |
| `app.packages` | `INSERT` | New package creation (`create_package_atomic`) |
| `app.packages` | `UPDATE` | Package edit (`update_package_atomic`), soft deletion (`delete_package_atomic`) |
| `app.package_services` | `SELECT` | Package services breakdown modal, edit modal initialization |
| `app.package_services` | `INSERT` / `DELETE` / `UPDATE` | Atomic creation, re-assignment, and cascading service rename |
| `app.bookings` | `SELECT` | Verified inside `delete_service_atomic` and `delete_package_atomic` dependency guards |

---

## 10. Sub-Feature Gate Map

| UI Element | Selector | Sub-Feature Code | Action Gated |
|---|---|---|---|
| Add Service Button | `#btnAddService` | `create_service` | Creates new service |
| Edit Service Button | `button[data-sub-feature="update_service"]` | `update_service` | Edits service details |
| Delete Service Button | `button[data-sub-feature="delete_service"]` | `delete_service` | Soft-deletes service |
| Add Category Button | `#btnAddCategory` | `create_service_category` | Creates new category |
| Edit Category Button | `.btn-edit-cat` | `update_service_category` | Edits category details |
| Delete Category Button | `.btn-delete-cat` | `delete_service_category` | Soft-deletes category |
| Add Package Button | `#btnAddPackage` | `create_package` | Creates new package |
| Edit Package Button | `button[data-sub-feature="update_package"]` | `update_package` | Edits package details |
| Delete Package Button | `button[data-sub-feature="delete_package"]` | `delete_package` | Soft-deletes package |

---

## 11. Error Handling Summary

| Condition | Frontend Message / Action | Backend Cause |
|---|---|---|
| Empty Service Name | Toast: `"Please enter a service name."` | Client validation check |
| Invalid Service Duration | Toast: `"Duration must be at least 5 minutes and in increments of 5."` | Client step validation |
| Negative Service Price | Toast: `"Price must be a valid non-negative number."` | Client validation + RPC check |
| Duplicate Service Name | Toast: `"A service with this name already exists in this category."` | Duplicate check in `create_service_atomic` |
| Delete Service in Package | Alert / Toast: `"Cannot delete this service because it is currently included in active package(s)..."` | Relational blocker in `delete_service_atomic` |
| Delete Service with Booking | Alert / Toast: `"Cannot delete this service because there are upcoming active booking(s)..."` | Relational blocker in `delete_service_atomic` |
| Duplicate Category Name | Toast: `"Error adding category: ... already exists"` | Duplicate check in `create_service_category_atomic` |
| Delete Category with Services | Alert / Toast: `"Cannot delete category: N active service(s) are still assigned to it."` | Relational blocker in `delete_service_category_atomic` |
| Final Price > Original Price | Toast: `"Final price cannot exceed the original price."` | Validation in `create_package_atomic` |
| Delete Package with Booking | Alert / Toast: `"Cannot delete this package because there are N upcoming active booking(s)..."` | Relational blocker in `delete_package_atomic` |

---

## 12. Security Architecture

### Zero-Trust Controls Implemented

1. **Zero Client Direct Writes**: No direct `.insert()`, `.update()`, or `.delete()` calls on `services`, `service_categories`, `packages`, or `package_services`.
2. **Transaction-Level Integrity**:
   - Multi-table writes (such as creating a package and writing junction rows, or updating a category name and cascading to services) are executed in a single atomic transaction inside PostgreSQL.
3. **Price Math Ceiling**: Bundle final prices are validated server-side to guarantee `final_price <= original_price`.
4. **Relational Dependency Guarding**: Critical entities are protected from deletion when active dependencies (packages, appointments) exist.
5. **Strict Tenant Isolation**: `shared.verify_tenant_access(p_company_id, p_branch_id)` is invoked at the start of every RPC.
6. **Definer Security**: All procedures run with `SECURITY DEFINER` and locked `search_path = platform, shared, app, public, pg_temp` to prevent injection attacks.

---

*Document generated: 2026-11-04 | Source files: `services.html`, `services.js`, `service-categories.js`, `scripts/services/*.js` | Total interactions documented: 28*

