# Module 6: Customers & CRM - Stage 1 Investigation & Logic Inventory

## 1. Executive Summary
This document provides the exhaustive inventory of all database interactions, client-side business logic, direct mutations, validation vulnerabilities, and cascade/dependency risks across the **Customers & CRM** domain of Bharathbots Salon SaaS.

As part of the Zero-Trust Architecture mandate, all direct client mutations (`.insert()`, `.update()`, `.delete()`) on `customers` and `reviews` are cataloged and slated for replacement by PostgreSQL `SECURITY DEFINER` stored procedures.

---

## 2. Table Schemas & Relational Topology

### 2.1 Table: `app.customers` (Base Table, Exposed via `public.customers` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `customer_id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `company_id` | `uuid` | YES | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Branch boundary |
| `customer_name` | `text` | YES | - | Customer full name |
| `customer_phone` | `text` | YES | - | Raw/normalized phone number |
| `customer_email` | `text` | YES | - | Optional customer email |
| `dob` | `date` | YES | - | Optional date of birth |
| `tags` | `text` | YES | - | Tags (e.g. 'vip', 'regular', 'new') |
| `total_spent` | `numeric` | YES | 0.00 | **Authoritative financial metric** (updated on booking/POS/membership completion) |
| `last_visit` | `date` | YES | - | **Authoritative activity metric** (updated on visit completion) |
| `notes` | `text` | YES | - | Freeform customer notes |
| `status` | `text` | YES | 'active' | Lifecycle status ('active', 'inactive', 'deleted') |
| `created_at` | `timestamptz` | YES | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | YES | - | Last modification timestamp |

### 2.2 Table: `shared.reviews` (Base Table, Exposed via `public.reviews` View)
| Column Name | Data Type | Nullable | Default / Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `user_id` | `uuid` | NO | FK -> `auth.users(id)` | Reviewer identity |
| `company_id` | `uuid` | NO | FK -> `platform.companies(id)` | Tenant boundary |
| `branch_id` | `uuid` | YES | FK -> `platform.branches(id)` | Optional branch target |
| `rating` | `integer` | NO | - | Star rating (1 to 5) |
| `comments` | `text` | YES | - | Freeform review comment |
| `created_at` | `timestamptz` | NO | `now()` | Submission timestamp |

### 2.3 Foreign Key References Pointing to `app.customers`
- `app.bookings(customer_id)`: Active/historical appointments.
- `app.sales(customer_id)`: POS retail & service transactions.
- `app.membership_purchases(customer_id)`: Active/historical memberships.
- `app.discount_usages(customer_id)`: Redeemed coupons/offers.

---

## 3. Inventory of Direct Client Mutations & Logic Vulnerabilities

### 3.1 Direct Client Inserts on `customers`
1. **`scripts/global-customer-modal.js` (lines 142-181)**:
   - Performs a client-side duplicate check:
     ```javascript
     supabase.from('customers').select('customer_id')
       .eq('company_id', companyId).eq('branch_id', branchId)
       .eq('customer_phone', digitsOnly).eq('status', 'active');
     ```
   - If not found, directly executes `.from('customers').insert(payload)`.
   - Then runs a secondary `.from('customers').select('*').eq(...).order('created_at', { ascending: false }).limit(1)` to fetch the inserted customer record.
   - **Vulnerabilities**:
     - Race conditions: concurrent inserts with the same phone bypass the client query check.
     - Multi-roundtrip latency (check -> insert -> select).
     - No schema-level protection against malformed or short phone strings.

2. **`scripts/global-booking-modal.js` (lines 2167-2176)**:
   - When a walk-in or new phone number is typed in the booking modal, executes:
     ```javascript
     supabase.from('customers').insert({
         company_id: getCompanyId(),
         branch_id: getBranchId(),
         customer_name: targetName || 'Unknown Customer',
         customer_phone: typedPhone,
         customer_email: customerEmail?.value.trim() || '',
         status: 'active'
     }).select();
     ```
   - **Vulnerabilities**: Bypasses centralized phone deduplication, inconsistent default tagging, and relies on direct table write permissions.

### 3.2 Direct Client Updates on `customers`
1. **`customers.js` (lines 700-756)**:
   - Edit customer profile modal:
     - Runs client-side duplicate check excluding `editingCustomerId`:
       ```javascript
       supabase.from('customers').select('customer_id')
         .eq('company_id', companyId).eq('customer_phone', digitsOnly)
         .neq('customer_id', editingCustomerId).neq('status', 'deleted');
       ```
     - Directly issues:
       ```javascript
       supabase.from('customers').update(payload)
         .eq('customer_id', editingCustomerId)
         .eq('company_id', companyId)
         .eq('branch_id', branchId);
       ```
   - **Critical Anti-Tampering Risk**: Client payload could easily tamper with `total_spent` or `last_visit` if not locked down by authoritative server routines.

### 3.3 Direct Client Soft-Deletes on `customers`
1. **`customers.js` (lines 763-797)**:
   - Executes:
     ```javascript
     supabase.from('customers').update({ status: 'deleted', updated_at: 'now' })
       .eq('customer_id', id)
       .eq('company_id', companyId)
       .eq('branch_id', branchId);
     ```
   - Catch block states: *"Ensure they have no active bookings."* but the frontend does **ZERO** validation check against upcoming bookings or active memberships!
   - **Critical Vulnerability**: Deleting a customer who has scheduled appointments tomorrow leaves orphaned upcoming appointments in the system.

### 3.4 Direct Client Inserts on `reviews`
1. **`scripts/review-modal.js` (lines 173-177)**:
   - Executes:
     ```javascript
     supabase.from('reviews').insert(payload).select();
     ```
   - **Vulnerabilities**: Rating bounds (e.g. rating > 5 or < 1) not guarded at the procedure level; direct write access required.

---

## 4. Migration Plan & Zero-Trust Mandate
To achieve 100% Zero-Trust for Module 6:
1. Deploy 4 PostgreSQL `SECURITY DEFINER` stored procedures:
   - `app.create_customer_atomic`: Normalized deduplication, branch/company scoping, returns newly created customer JSON.
   - `app.update_customer_atomic`: Phone uniqueness assertion, metadata mutation, explicit tamper protection for `total_spent` and `last_visit`.
   - `app.delete_customer_atomic`: Dependency guards blocking deletion if customer has active bookings or active memberships; performs soft-delete.
   - `app.submit_customer_review_atomic`: Validates rating (1-5), company/branch scoping, persists review.
2. Refactor `scripts/global-customer-modal.js`, `scripts/global-booking-modal.js`, `customers.js`, and `scripts/review-modal.js`.
3. Verify zero direct client-side mutations remain.

