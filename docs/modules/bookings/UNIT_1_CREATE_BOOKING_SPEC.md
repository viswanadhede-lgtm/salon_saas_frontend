# BHARATHBOTS – SALON SAAS
# Unit 1: "Create Booking" Workflow – Detailed Logic Specification & Architecture Plan

> **Document Status**: Proposed / Ready for Review  
> **Module**: 1. BOOKINGS  
> **Unit**: 1 (Create Booking Workflow)  
> **Target Schema**: `app` (operational tables) & `shared` (tenant authorization)  
> **Database**: PostgreSQL 17.6 (Supabase `qxmgyxjwpxkdbgldpdil`)

---

## 1. Overview & Objectives

In BHARATHBOTS, **Create Booking** is the foundational revenue transaction. 
Currently, the frontend modal (`scripts/global-booking-modal.js`) performs client-side calculations, customer resolution, and duration math, while the database routine `create_booking_atomic` blindly accepts untrusted prices, client-provided tenant IDs, and performs zero availability, operating hour, or double-booking checks.

**Target Objective**: Migrate all 13 business rules of the Create Booking workflow into authoritative, concurrency-safe, multi-tenant backend logic inside PostgreSQL.

---

## 2. Granular Specification for All 13 Logics in Unit 1

### Logic 1: Multi-Tenant Authorization & Boundary Verification
* **Current State**: Frontend passes `company_id` and `branch_id` from browser `localStorage`. Backend trusts whatever UUIDs are sent.
* **Security Threat**: Critical vulnerability. Any authenticated user can forge a request with another salon’s `company_id` to insert unauthorized appointments into a competitor's database.
* **Proposed Backend Logic**:
  * The backend extracts the authenticated user’s ID from the JWT session (`auth.uid()`).
  * Validates that `auth.uid()` has an active membership record in `shared.users` matching `p_company_id`.
  * Validates that the user has assigned access to `p_branch_id` (or has company-wide owner privileges).
  * If unauthorized, immediately rejects the transaction with: `ERROR 403: Unauthorized access to tenant or branch`.
* **Backend Mechanism**: PostgreSQL Security Helper Function `shared.verify_tenant_access(p_company_id, p_branch_id)`.

---

### Logic 2: SaaS Plan Entitlement & Booking Quota Enforcement
* **Current State**: None. Any tenant on any subscription tier (even a free trial or Starter tier with a 100 booking/mo cap) can generate infinite appointments.
* **Business Risk**: Uncontrolled platform resource consumption; inability to monetize higher tiers.
* **Proposed Backend Logic**:
  * Check `platform.subscriptions` for `p_company_id`. Status must be `'active'` or `'trialing'`.
  * Check `platform.plan_limits` for `limit_key = 'max_bookings_monthly'`.
  * Compare against `platform.usage_counters` for current billing period.
  * If the quota is exceeded, reject with: `ERROR 402: Monthly booking limit reached for your plan. Please upgrade to create more bookings.`
  * On successful booking creation, atomically increment the tenant's monthly booking counter.
* **Backend Mechanism**: Reusable helper `platform.enforce_plan_limit(p_company_id, 'bookings_monthly')`.

---

### Logic 3: Customer Identification, Deduplication & Auto-Creation
* **Current State**: Frontend sends `p_is_new_customer` (boolean) and a client-generated UUID for `customer_id`.
* **Integrity Threat**: If a customer already exists with that phone number, client generates a new UUID, creating duplicate customer records, fragmented visit histories, and inaccurate lifetime spend metrics.
* **Proposed Backend Logic**:
  * Normalize customer phone number (strip whitespace, dashes, non-numeric characters).
  * If `p_customer_id` is supplied: Verify it belongs to `p_company_id` in `app.customers`.
  * If `p_customer_id` is null or new: Query `app.customers WHERE company_id = p_company_id AND customer_phone = v_normalized_phone`.
  * If found: Automatically link to existing `customer_id` (prevent duplicates). Update name/email if newer info is provided.
  * If not found: Generate server-side UUID via `gen_random_uuid()` and insert new customer record with `status = 'active'`, `total_spent = 0`, `last_visit = p_booking_date`.
* **Backend Mechanism**: Atomic customer upsert routine inside `app.create_booking_atomic`.

---

### Logic 4: Authoritative Catalog Price Lookup (Anti-Tampering)
* **Current State**: Frontend iterates selected services, extracts `item.price`, and puts it in the payload. The database adds whatever number the frontend sent.
* **Security Threat**: Severe financial vulnerability. A client can edit the JavaScript variable or intercept the network call to send `price: 1` for a ₹5,000 service.
* **Proposed Backend Logic**:
  * The frontend sends only `service_id` (and optional `package_id`), **NOT the price**.
  * For each service line in `p_services`:
    * Query `app.services WHERE service_id = v_service_id AND company_id = p_company_id AND status = 'active'`.
    * If service does not exist or belongs to another tenant: Throw `ERROR: Invalid or inactive service`.
    * Fetch authoritative `price` and `duration` directly from `app.services`.
    * If `package_id` is present, fetch discounted package line item price from `app.packages`.
    * Accumulate authoritative `v_total_price := v_total_price + v_db_price`.
* **Backend Mechanism**: Server-side price resolution loop inside `app.create_booking_atomic`.

---

### Logic 5: Authoritative Duration & Sequential Time Slot Computation
* **Current State**: Frontend JavaScript runs `timeToMins()`, adds `itemDuration`, and computes consecutive `start_time` / `end_time` strings.
* **Integrity Threat**: Client-side timezone mismatches, invalid string formats, or altered durations can corrupt appointment grids and calendar timelines.
* **Proposed Backend Logic**:
  * Input parameter: Only the overall appointment start time (`p_start_time`, e.g., `'14:30:00'`).
  * The backend uses `app.services.duration` (in minutes) for each selected service:
    * Service 1: `start_time = p_start_time`, `end_time = p_start_time + duration_1 * interval '1 min'`.
    * Service 2: `start_time = Service 1 end_time`, `end_time = Service 2 start_time + duration_2 * interval '1 min'`.
  * Booking summary `start_time` = earliest service start; `end_time` = final service end.
* **Backend Mechanism**: Interval arithmetic in PostgreSQL inside `app.create_booking_atomic`.

---

### Logic 6: Salon Operating Hours Validation
* **Current State**: Purely visual on the frontend. If a user bypasses the UI or modifies time, appointments can be booked when the salon is closed.
* **Business Risk**: Bookings scheduled outside operating hours (e.g. 11:30 PM or on an off-day).
* **Proposed Backend Logic**:
  * Extract day name from `p_booking_date` (e.g. `'Monday'`, `'Tuesday'`).
  * Query `app.business_hours WHERE company_id = p_company_id AND branch_id = p_branch_id AND LOWER(day_of_week) = LOWER(v_day_name)`.
  * Check:
    1. `is_open` must be `true`. (If false, throw: `ERROR: Salon is closed on this day`).
    2. `v_min_start_time >= opening_time` AND `v_max_end_time <= closing_time`. (If violated, throw: `ERROR: Booking window falls outside branch operating hours (Open: HH:MM - Close: HH:MM)`).
* **Backend Mechanism**: Query constraint check against `app.business_hours`.

---

### Logic 7: Staff Assignment, Schedule & Shift Hours Validation
* **Current State**: Frontend dropdown shows staff list; backend accepts any `staff_id` without verifying if the stylist works on that date.
* **Business Risk**: Appointments assigned to staff members on their weekly day off, sick leave, or outside their shift schedule.
* **Proposed Backend Logic**:
  * If `staff_id` is provided (non-null):
    1. Verify `staff_id` belongs to `p_company_id` and `p_branch_id` in `app.staff` with `status = 'active'`.
    2. Check `app.staff_schedule WHERE staff_id = v_staff_id AND schedule_date = p_booking_date`:
       * If schedule record exists and `is_off = true`: Throw `ERROR: Staff member [Name] is off duty on this date`.
       * If schedule record exists and `is_off = false`: Verify `v_cur_start >= start_time` AND `v_cur_end <= end_time`.
* **Backend Mechanism**: Validation query against `app.staff` and `app.staff_schedule`.

---

### Logic 8: Concurrency-Safe Double-Booking & Overlap Prevention
* **Current State**: **Zero collision detection**. If two receptionists book the same stylist at 4:00 PM simultaneously, both bookings are saved.
* **Business Risk**: Stylist double-booking, customer dissatisfaction, and front-desk confusion.
* **Proposed Backend Logic**:
  * For each service requiring a specific `staff_id`:
    * Acquire a transactional advisory lock or execute a collision check within the atomic transaction:
      ```sql
      PERFORM 1 FROM app.bookings
      WHERE company_id = p_company_id
        AND branch_id = p_branch_id
        AND staff_id = v_staff_id
        AND booking_date = p_booking_date
        AND status NOT IN ('cancelled', 'no-show')
        AND (start_time, end_time) OVERLAPS (v_cur_start, v_cur_end);
      ```
    * If any row matches: Raise exception: `ERROR: Staff member [Name] is already booked between HH:MM and HH:MM on this date`.
* **Backend Mechanism**: `OVERLAPS` operator with row-level transaction isolation.

---

### Logic 9: Multi-Service Line Item Insertion (`app.bookings`)
* **Current State**: Individual rows inserted into `app.bookings`.
* **Proposed Backend Logic**:
  * Share the master `p_booking_id` across all line items for this appointment.
  * Populate: `booking_id`, `company_id`, `branch_id`, `customer_id`, `customer_name`, `customer_phone`, `service_id`, `service_name`, `staff_id`, `staff_name`, `booking_date`, `start_time`, `end_time`, `price` (authoritative), `status = 'booked'`, `payment = 'pending'`, `created_at = NOW()`.
* **Backend Mechanism**: `INSERT INTO app.bookings`.

---

### Logic 10: Consolidated Summary Row Insertion (`app.bookings_for_business_transaction`)
* **Current State**: Inserts 1 summary row.
* **Proposed Backend Logic**:
  * Concatenate service names, staff names, service IDs, and staff IDs for high-performance single-row querying on table/calendar views.
  * Store calculated `total_price`, initial `final_amount = total_price`, `payment_status = 'pending'`, `status = 'booked'`.
* **Backend Mechanism**: `INSERT INTO app.bookings_for_business_transaction`.

---

### Logic 11: Transaction Ledger Initialization (`app.business_transactions`)
* **Current State**: PostgreSQL trigger `trg_create_initial_business_transaction` fires AFTER INSERT on `bookings_for_business_transaction`.
* **Proposed Backend Logic**:
  * Maintain this trigger: It inserts into `app.business_transactions` with `reference_id = booking_id`, `reference_type = 'booking'`, `amount = total_price`, `status = 'created'`.
  * Ensure trigger function has `search_path = platform, shared, app, public, pg_temp;`.
* **Backend Mechanism**: Existing Database Trigger (verified and operational).

---

### Logic 12: Notification & Audit Trail Event
* **Current State**: Frontend handles client-side event dispatching.
* **Proposed Backend Logic**:
  * Return structured JSON response containing:
    * `success: true`
    * `booking_id`: UUID
    * `total_price`: calculated amount
    * `services_count`: number of lines
    * `customer_id`: resolved UUID
    * `customer_name`: string
    * `booking_date`: date
    * `start_time`: time
    * `end_time`: time
  * Frontend uses this authoritative response to trigger notification side effects (SMS/WhatsApp/Dashboard alerts).

---

### Logic 13: Input Sanitization & Defensive Boundary Checks
* **Current State**: Basic HTML required attributes.
* **Proposed Backend Logic**:
  * Validate mandatory parameters:
    * `p_company_id`, `p_branch_id` cannot be null.
    * `p_booking_date` cannot be null; must not be older than 30 days in the past (prevents invalid historical pollution).
    * `p_services` must be a valid JSON array with length >= 1.
    * `customer_name` and `customer_phone` must not be blank strings.
* **Backend Mechanism**: Server-side guard clauses at the beginning of `app.create_booking_atomic`.

---

## 3. Architecture Comparison: Current vs. Proposed

```
CURRENT ARCHITECTURE (FRAGILE):
[Frontend Browser]
  ├── Calculates Prices ❌ (Manipulable)
  ├── Computes Durations ❌ (Manipulable)
  ├── Generates Customer UUIDs ❌ (Creates duplicates)
  ├── Passes Company/Branch ID ❌ (No authorization check)
  └── Calls create_booking_atomic
        ├── Accepts prices as passed ❌
        ├── Does not check branch operating hours ❌
        ├── Does not check staff shift hours ❌
        ├── Does not check staff double-booking ❌
        └── Writes to DB

PROPOSED ARCHITECTURE (BACKEND-FIRST & PRODUCTION-GRADE):
[Frontend Browser]
  ├── Selects Services, Staff, Date, Start Time, Customer Info
  └── Calls app.create_booking_atomic(payload)
        ▼
[PostgreSQL Database]
  ├── 1. Authorize: Verify auth.uid() has access to company_id & branch_id
  ├── 2. Entitlement: Check monthly booking quota in platform.plan_limits
  ├── 3. Customer: Lookup by phone in app.customers or create atomically
  ├── 4. Business Hours: Verify branch is open and time is within operating hours
  ├── 5. Staff Schedule: Verify staff is on duty and scheduled to work
  ├── 6. Concurrency: Check for overlapping bookings for the staff member
  ├── 7. Pricing: Fetch authoritative prices & durations from app.services
  ├── 8. Stacking: Compute consecutive start/end times server-side
  ├── 9. Insert: Atomically insert line items into app.bookings
  ├── 10. Summary: Insert consolidated summary into app.bookings_for_business_transaction
  ├── 11. Trigger: Auto-generate financial ledger row in app.business_transactions
  └── 12. Return: Return verified booking record + totals
```

---

## 4. Proposed Database Implementation Plan

### Step A: Reusable Tenant Verification Function
Create `shared.verify_tenant_access(p_company_id uuid, p_branch_id uuid)`:
* Security Definer, runs in `shared, app, platform, pg_temp`.
* Validates `auth.uid()` against `shared.users` or `shared.profiles`.

### Step B: Hardened `app.create_booking_atomic` Function
Replace existing `public.create_booking_atomic` with a fully hardened, multi-tenant version in `app.create_booking_atomic`:
* Comprehensive input validation.
* Authoritative pricing and duration computation.
* Availability & double-booking enforcement.
* Backward-compatible wrapper in `public.create_booking_atomic` so existing code does not break while frontend is updated.

---

## 5. Review & Approval Checkpoint

This specification covers all **13 business rules** of Unit 1 with full technical notes. 

Before I write or deploy any SQL or modify frontend files:
**Please review this specification and let me know if you approve or if you would like any adjustments to these 13 rules.**

