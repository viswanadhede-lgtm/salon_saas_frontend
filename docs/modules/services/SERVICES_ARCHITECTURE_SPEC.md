# Module 4: Services & Packages — Stage 2 Architecture Specification

**Date**: 2026-11-03  
**Status**: ⏳ Awaiting User Approval  
**Author**: Backend Hardening Sprint  
**Depends on**: `shared.verify_tenant_access`, Migration `20261103000008`

---

> [!IMPORTANT]
> This document specifies all 9 stored procedures and 18 business rules for Services, Service Categories, and Packages.
> Please review and approve before Migration `20261103000009` is deployed.

---

## 1. Architectural Scope

This specification completely eliminates all 12 direct table mutations across `services-api.js` and `service-categories.js`, replacing them with 9 authoritative, `SECURITY DEFINER` stored procedures in the `app` schema with `public` PostgREST compatibility wrappers.

| RPC Name | Target Schema | Purpose | Replaces |
|---|---|---|---|
| `create_service_category_atomic` | `app` + `public` | Creates service category with duplicate validation | Direct `.insert` |
| `update_service_category_atomic` | `app` + `public` | Updates category and cascades name to services | Direct `.update` + JS loop |
| `delete_service_category_atomic` | `app` + `public` | Soft-deletes category with active service guard | Direct `.update` + JS check |
| `create_service_atomic` | `app` + `public` | Creates service with category and pricing checks | Direct `.insert` |
| `update_service_atomic` | `app` + `public` | Updates service fields and cascades name to packages | Direct `.update` |
| `delete_service_atomic` | `app` + `public` | Soft-deletes service with package & booking guards | Direct `.update` + JS checks |
| `create_package_atomic` | `app` + `public` | Creates package bundle and child assignments | Old `public.create_package_atomic` |
| `update_package_atomic` | `app` + `public` | Atomically updates package and child services | Old `public.update_package_atomic` |
| `delete_package_atomic` | `app` + `public` | Soft-deletes package with upcoming booking guard | Direct `.update` + JS check |

All routines enforce:
- `SECURITY DEFINER`
- Locked search path: `SET search_path = platform, shared, app, public, pg_temp;`
- Centralized tenant isolation: `shared.verify_tenant_access(p_company_id, p_branch_id)`
- Uniform JSON response: `{ "success": boolean, ... }`

---

## 2. Workflow A: Service Categories

### 2.1 `app.create_service_category_atomic`
```sql
app.create_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_name text,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
) RETURNS jsonb
```
* **Logics Enforced**:
  - **A1 (Tenant Isolation)**: `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - **A2 (Input Validation)**: `p_category_name` required, non-empty, max 100 characters. `p_status` must be `'active'` or `'inactive'`.
  - **A3 (Duplicate Name Guard)**: Case-insensitive unique constraint per branch among active (`status <> 'deleted'`) categories.
  - **A4 (Atomic Insert)**: Generates `category_id`, inserts into `app.service_categories`, and returns `{ success: true, category_id, category_name }`.

### 2.2 `app.update_service_category_atomic`
```sql
app.update_service_category_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_category_id   uuid,
    p_category_name text    DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
) RETURNS jsonb
```
* **Logics Enforced**:
  - **A5 (Tenant Ownership)**: Category must exist in `app.service_categories` for this `company_id` and `branch_id` and not be deleted.
  - **A6 (Duplicate Name Guard)**: If name is updated, checks uniqueness against other categories in the branch.
  - **A7 (Atomic Cascading Rename)**: If `category_name` changed, atomically updates `category_name` on all matching rows in `app.services` where `category_id = p_category_id` in the **same transaction**. Eliminates client-side split-brain failure.
  - **A8 (Return Payload)**: Returns `{ success: true, category_id, category_name, services_updated_count }`.

### 2.3 `app.delete_service_category_atomic`
```sql
app.delete_service_category_atomic(
    p_company_id  uuid,
    p_branch_id   uuid,
    p_category_id uuid
) RETURNS jsonb
```
* **Logics Enforced**:
  - **A9 (Tenant Ownership)**: Verify category existence and tenant ownership.
  - **A10 (Active Service Dependency Guard)**: Counts `app.services` WHERE `category_id = p_category_id AND status <> 'deleted'`. If count > 0, aborts: `"Cannot delete category: N active service(s) are still assigned to it. Please reassign or delete the services first."`
  - **A11 (Soft-Delete)**: Sets `status = 'deleted'`, `updated_at = NOW()`.
  - **A12 (Return Payload)**: Returns `{ success: true, category_id, active_services_count: 0 }`.

---

## 3. Workflow B: Services

### 3.1 `app.create_service_atomic`
```sql
app.create_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_name  text,
    p_category_id   uuid,
    p_price         numeric,
    p_duration      bigint,     -- minutes
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT 'active'
) RETURNS jsonb
```
* **Logics Enforced**:
  - **B1 (Tenant Isolation)**: `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - **B2 (Category Verification)**: Validates that `p_category_id` exists, belongs to this branch, and is not deleted. Automatically pulls `category_name` from `app.service_categories`.
  - **B3 (Price & Duration Validation)**: `p_price >= 0` (negative prices rejected) and `p_duration >= 1` (zero or negative durations rejected).
  - **B4 (Duplicate Name Guard)**: Case-insensitive unique service name per branch among non-deleted services.
  - **B5 (Atomic Insert)**: Generates `service_id`, inserts into `app.services`, and returns `{ success: true, service_id, service_name, price, duration, category_name }`.

### 3.2 `app.update_service_atomic`
```sql
app.update_service_atomic(
    p_company_id    uuid,
    p_branch_id     uuid,
    p_service_id    uuid,
    p_service_name  text    DEFAULT NULL,
    p_category_id   uuid    DEFAULT NULL,
    p_price         numeric DEFAULT NULL,
    p_duration      bigint  DEFAULT NULL,
    p_description   text    DEFAULT NULL,
    p_status        text    DEFAULT NULL
) RETURNS jsonb
```
* **Logics Enforced**:
  - **B6 (Tenant Ownership)**: Verify service exists and belongs to branch.
  - **B7 (Category Re-validation)**: If `p_category_id` changed, re-validates category and updates both `category_id` and `category_name`.
  - **B8 (Price & Duration Rules)**: If provided, validates `price >= 0` and `duration >= 1`.
  - **B9 (Atomic Package Cascade)**: If `service_name` changed, atomically updates `service_name` in `app.package_services` junction table.
  - **B10 (Return Payload)**: Returns `{ success: true, service_id, service_name, price, duration }`.

### 3.3 `app.delete_service_atomic`
```sql
app.delete_service_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_service_id uuid
) RETURNS jsonb
```
* **Logics Enforced**:
  - **B11 (Tenant Ownership)**: Verify service exists and belongs to branch.
  - **B12 (Package Inclusion Guard)**: Server inspects `app.package_services ps JOIN app.packages p ON ps.package_id = p.package_id WHERE ps.service_id = p_service_id AND p.is_active = true AND p.status <> 'deleted'`. If active packages exist, aborts: `"Cannot delete this service because it is currently included in active package(s): {names}. Remove it from the package(s) or deactivate them first."`
  - **B13 (Upcoming Booking Guard)**: Server inspects `app.bookings WHERE service_id = p_service_id AND status IN ('booked', 'confirmed') AND booking_date >= CURRENT_DATE`. If upcoming active bookings exist, aborts: `"Cannot delete this service because there are N upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first."`
  - **B14 (Soft-Delete)**: Sets `status = 'deleted'`, `updated_at = NOW()`.
  - **B15 (Return Payload)**: Returns `{ success: true, service_id, status: 'deleted' }`.

---

## 4. Workflow C: Packages & Bundles

### 4.1 `app.create_package_atomic`
```sql
app.create_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_name   text,
    p_description    text        DEFAULT NULL,
    p_original_price numeric,
    p_final_price    numeric,
    p_is_active      boolean     DEFAULT true,
    p_service_ids    uuid[]
) RETURNS jsonb
```
* **Logics Enforced**:
  - **C1 (Tenant Isolation)**: Migrated from raw `auth.uid()` checks to authoritative `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - **C2 (Price Math Integrity)**: `original_price >= 0`, `final_price >= 0`, and `final_price <= original_price`.
  - **C3 (Service Array Validation)**: `p_service_ids` must not be null/empty; no duplicates; all `service_ids` must belong to this branch and be active.
  - **C4 (Duplicate Name Guard)**: Case-insensitive unique package name per branch among non-deleted packages.
  - **C5 (Atomic 2-Table Write)**: Inserts `app.packages` (setting `services_count = cardinality(p_service_ids)`) and inserts junction rows into `app.package_services` in one transaction.

### 4.2 `app.update_package_atomic`
```sql
app.update_package_atomic(
    p_company_id     uuid,
    p_branch_id      uuid,
    p_package_id     uuid,
    p_package_name   text        DEFAULT NULL,
    p_description    text        DEFAULT NULL,
    p_original_price numeric     DEFAULT NULL,
    p_final_price    numeric     DEFAULT NULL,
    p_is_active      boolean     DEFAULT NULL,
    p_service_ids    uuid[]      DEFAULT NULL
) RETURNS jsonb
```
* **Logics Enforced**:
  - **C6 (Tenant Ownership)**: Verify package exists and belongs to branch.
  - **C7 (Price Rules)**: Validates `final_price <= original_price`.
  - **C8 (Atomic Services Re-assignment)**: If `p_service_ids` provided, validates all service IDs, deletes old junction rows in `app.package_services`, and inserts new junction rows atomically.

### 4.3 `app.delete_package_atomic`
```sql
app.delete_package_atomic(
    p_company_id uuid,
    p_branch_id  uuid,
    p_package_id uuid
) RETURNS jsonb
```
* **Logics Enforced**:
  - **C9 (Tenant Ownership)**: Verify package exists and belongs to branch.
  - **C10 (Upcoming Active Booking Guard)**: Checks `app.bookings WHERE service_id = p_package_id AND status IN ('booked', 'confirmed') AND booking_date >= CURRENT_DATE`. Also checks summary bridge rows `app.bookings_for_business_transaction`. If upcoming bookings exist, aborts: `"Cannot delete this package because there are N upcoming active booking(s) scheduled for it. Please reschedule or cancel the booking(s) first."`
  - **C11 (Soft-Delete)**: Sets `status = 'deleted'`, `is_active = false`, `updated_at = NOW()`.
  - **C12 (Return Payload)**: Returns `{ success: true, package_id, status: 'deleted' }`.

---

## 5. Integration Test Plan (Stage 4 Preview)

| Test ID | Test Scenario | Expected Outcome |
|---|---|---|
| **T1** | Create Service Category via RPC | Category created with `active` status |
| **T2** | Duplicate Category Name in Same Branch | Blocked with duplicate name error |
| **T3** | Update Category & Cascading Services Rename | Category renamed; `services.category_name` synced atomically |
| **T4** | Create Service with Valid Category & Price | Service created; catalog attributes recorded |
| **T5** | Create Service with Negative Price (-100) | Blocked: price must be non-negative |
| **T6** | Create Service with Zero Duration (0 min) | Blocked: duration must be at least 1 min |
| **T7** | Create Package Bundle with 2 Services | Package created; `package_services` junction rows inserted |
| **T8** | Create Package where Final Price > Original Price | Blocked: final price cannot exceed original price |
| **T9** | Delete Service Assigned to Active Package | Blocked: service is included in active package(s) |
| **T10**| Delete Category with Active Services | Blocked: active services still assigned to category |
| **T11**| Delete Package with Upcoming Booking | Blocked: upcoming active bookings scheduled for package |
| **T12**| Delete Package without Bookings | Package soft-deleted (`status = 'deleted'`) |
| **T13**| Delete Service without Package/Booking Links | Service soft-deleted (`status = 'deleted'`) |
| **T14**| Delete Empty Category | Category soft-deleted (`status = 'deleted'`) |

---

## 6. Frontend Cleanup Plan (Stage 5 Preview)

- **`scripts/services/services-api.js`**:
  - Replace `insertService`, `updateService`, `softDeleteService` with calls to `create_service_atomic`, `update_service_atomic`, `delete_service_atomic`.
  - Replace `deletePackage` with call to `delete_package_atomic`.
  - Remove all client-side dependency check functions (`checkServiceDependencies`, `checkPackageDependencies`).
  - Purge dead legacy mutation fallbacks (`insertPackage`, `insertPackageServices`, `updatePackage`, `deletePackageServices`).
- **`service-categories.js`**:
  - Replace direct `.insert()` with `create_service_category_atomic`.
  - Replace direct `.update()` + client cascade with `update_service_category_atomic`.
  - Replace direct `.update({status:'deleted'})` + client check with `delete_service_category_atomic`.
- **Resulting active direct mutations on `services`, `service_categories`, `packages`, `package_services`**: **0**.

