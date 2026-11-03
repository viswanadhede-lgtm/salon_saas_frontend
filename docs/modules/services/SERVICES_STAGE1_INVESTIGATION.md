# Module 4: Services & Packages — Stage 1 Investigation Report

**Date**: 2026-11-03  
**Status**: ✅ Investigation Complete  
**Next Stage**: Stage 2 — Architecture Specification (pending approval)

---

## 1. Module Overview & Scope

The Services & Packages module is the core catalog engine of the salon SaaS. It governs:
1. **Service Categories**: Organizational taxonomy grouping individual treatments/services.
2. **Services**: Primary billable units with duration, pricing, category linkage, and buffer time.
3. **Packages & Bundles**: Multi-service promotional bundles with discounted package pricing and service relationship tracking.

### Tables Governed
| Table | Schema | Description |
|---|---|---|
| `service_categories` | `app` | Service classification categories per branch |
| `services` | `app` | Individual service catalog entries, durations, base prices |
| `packages` | `app` | Bundled promotional service packages with discounted pricing |
| `package_services` | `app` | Junction table mapping services assigned to a package |

---

## 2. Frontend Files Inventory

| File | Purpose | Audit Status / Violations |
|---|---|---|
| `service-categories.js` | Categories manager UI + data operations | ❌ **CRITICAL**: Direct `.from('service_categories').insert`, `.update`, `.update({status:'deleted'})`. Multi-table split-brain category rename cascade on line 361 (`.from('services').update`). Client-side dependency checks for delete on line 489. |
| `scripts/services/services-api.js` | Supabase data-access layer for services & packages | ❌ **CRITICAL**: Direct mutations: `.from('services').insert` (line 79), `.from('services').update` (line 92), `.from('services').update({status:'deleted'})` (line 188), `.from('packages').update({status:'deleted'})` (line 491). Client-side booking and package dependency checks (lines 110-172 & 399-474). Unused legacy package fallback mutations (lines 283, 330, 349, 394). |
| `scripts/services/services-crud.js` | Service creation/edit modal handlers | ⚠️ Calls `insertService`, `updateService`, `softDeleteService` from `services-api.js`. |
| `scripts/services/services-packages.js` | Package creation/edit/delete modal handlers | ⚠️ Calls `createPackageAtomic`, `updatePackageAtomic`, and `deletePackage` (which is a direct update). |
| `scripts/services/services-modals.js` | Modal management for services UI | Presentation only. |
| `scripts/services/services-renders.js` | Table and card render logic | Presentation only. |
| `scripts/services/services-state.js` | Memory state management | State cache only. |

---

## 3. Deep Audit of Existing Backend Routines

### 3.1 `create_package_atomic` & `update_package_atomic` — Partially Implemented
* **Current Location**: Deployed only in `public` schema (not in `app` with public wrapper).
* **Positives**:
  - Enforces `p_final_price <= p_original_price`
  - Validates duplicate package names
  - Atomically replaces child assignments in `package_services`
* **Architectural Gaps**:
  - ❌ Does not use centralized `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  - ❌ Relies on raw `auth.uid()` checks against `public.users` table instead of standard session context.
  - ❌ Has no matching `delete_package_atomic` stored procedure — deletion is executed client-side via direct `.update({ status: 'deleted', is_active: false })`.

### 3.2 Services & Categories CRUD — Completely Missing Backend Logic
* **No stored procedures exist** for:
  - `create_service_atomic`
  - `update_service_atomic`
  - `delete_service_atomic`
  - `create_service_category_atomic`
  - `update_service_category_atomic`
  - `delete_service_category_atomic`
* **All operations run via raw PostgREST table mutations from JavaScript.**

---

## 4. Critical Vulnerabilities & Architectural Risks Discovered

| # | Vulnerability / Flaw | Severity | Impact |
|---|---|---|---|
| **V1** | **Client-Side Delete Dependency Checks** | 🔴 CRITICAL | In `services-api.js` (line 110 & line 399), service and package deletion safety checks ("are there upcoming bookings or active package inclusions?") run purely in browser JS. Any direct API call or script modification allows deleting services with active customer bookings. |
| **V2** | **Split-Brain Category Rename** | 🔴 HIGH | In `service-categories.js` (line 355), renaming a category updates `service_categories` then separately updates `services.category_name`. If network fails or user navigates away, the data enters a desynchronized split-brain state. |
| **V3** | **Unvalidated Price & Duration Injections** | 🔴 HIGH | Creating or updating services via direct `.insert()` / `.update()` accepts negative prices, zero durations, or non-existent category IDs without database-level schema constraints. |
| **V4** | **Direct Mutation Exposure (12 calls)** | 🔴 HIGH | 12 direct mutation calls exist across `services-api.js` and `service-categories.js` on transactional catalog tables. |
| **V5** | **Missing Delete Package Stored Procedure** | 🔴 HIGH | Packages deletion bypasses stored procedures and directly mutates the `packages` table, ignoring active booking dependencies. |

---

## 5. Logic Inventory for Backend Migration (18 Rules)

### Workflow A: Service Categories (A1 – A5)
1. **A1 (Tenant Isolation)**: Call `shared.verify_tenant_access(p_company_id, p_branch_id)`.
2. **A2 (Category Name Validation & Dedup)**: Trimmed name, max 100 chars, case-insensitive duplicate check within active branch.
3. **A3 (Category Atomic Creation)**: Insert into `app.service_categories` with active status.
4. **A4 (Atomic Rename & Cascade Sync)**: When category is updated, atomically update `app.service_categories` AND cascade update `app.services.category_name` in the **same transaction**.
5. **A5 (Active Service Dependency Guard on Delete)**: Block deletion if any active (`status <> 'deleted'`) services belong to this category.

### Workflow B: Services CRUD (B1 – B7)
6. **B1 (Tenant Isolation)**: Call `shared.verify_tenant_access(p_company_id, p_branch_id)`.
7. **B2 (Category Verification)**: Ensure `category_id` exists, belongs to tenant, and is active.
8. **B3 (Price & Duration Integrity)**: `price >= 0`, `duration >= 1 minute`.
9. **B4 (Duplicate Service Name Guard)**: Block duplicate service names within the same branch.
10. **B5 (Atomic Service Insert/Update)**: Perform write to `app.services` and return structured JSON.
11. **B6 (Active Package Dependency Guard on Delete)**: Block service deletion if referenced in any active package in `app.package_services` where package is not deleted.
12. **B7 (Upcoming Booking Dependency Guard on Delete)**: Block service deletion if upcoming active bookings (`status IN ('booked','confirmed')` and `booking_date >= CURRENT_DATE`) exist.

### Workflow C: Packages CRUD (C1 – C6)
13. **C1 (Tenant Isolation)**: Call `shared.verify_tenant_access(p_company_id, p_branch_id)`.
14. **C2 (Pricing Rules)**: `final_price <= original_price` and prices non-negative.
15. **C3 (Service Assignment Validation)**: Validate all `service_ids` belong to branch and are active.
16. **C4 (Atomic Package + Services Replacement)**: Update `app.packages` and rewrite `app.package_services` atomically.
17. **C5 (Upcoming Booking Dependency Guard on Delete)**: Block package deletion if referenced in upcoming active bookings or booking transaction bridge rows.
18. **C6 (Soft-Delete Package)**: Set `status = 'deleted'`, `is_active = false`.

---

## 6. Proposed RPC Set for Stage 2

| RPC Name | Target Schema | Status | Replaces |
|---|---|---|---|
| `create_service_category_atomic` | `app` + `public` | **New** | Direct `.insert` in `service-categories.js` |
| `update_service_category_atomic` | `app` + `public` | **New** | Direct `.update` + cascade in `service-categories.js` |
| `delete_service_category_atomic` | `app` + `public` | **New** | Direct `.update` in `service-categories.js` |
| `create_service_atomic` | `app` + `public` | **New** | Direct `.insert` in `services-api.js` |
| `update_service_atomic` | `app` + `public` | **New** | Direct `.update` in `services-api.js` |
| `delete_service_atomic` | `app` + `public` | **New** | Direct `.update` + JS checks in `services-api.js` |
| `create_package_atomic` | `app` + `public` | **Hardened** | Moves to `app` + uses `shared.verify_tenant_access` |
| `update_package_atomic` | `app` + `public` | **Hardened** | Moves to `app` + uses `shared.verify_tenant_access` |
| `delete_package_atomic` | `app` + `public` | **New** | Direct `.update` + JS checks in `services-api.js` |

