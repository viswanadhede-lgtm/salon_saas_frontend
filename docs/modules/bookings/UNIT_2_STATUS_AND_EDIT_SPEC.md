# BHARATHBOTS – SALON SAAS
# Unit 2: "Booking Status Actions & Edit/Reschedule Workflows" – Detailed Logic Specification & Architecture Plan

> **Document Status**: Proposed / Ready for Review  
> **Module**: 1. BOOKINGS  
> **Unit**: 2 (Status State Machine & Edit/Reschedule Workflows)  
> **Target Schema**: `app` & `shared`  
> **Database**: PostgreSQL 17.6 (Supabase `qxmgyxjwpxkdbgldpdil`)

---

## 1. Overview & Current Gaps

In Unit 2, we tackle two major booking lifecycle operations:
1. **Status State Machine**: Transitioning bookings between `booked`, `confirmed`, `in_progress`, `completed`, `cancelled`, and `no-show`.
2. **Booking Rescheduling & Line Item Edits**: Modifying appointment times, dates, notes, and service/staff assignments.

### Current Architectural Flaws Identified in Audit:
1. **Raw Client-Side Mutations**: `scripts/bookings/booking-status-actions.js` makes two independent direct HTTP calls (`supabase.from('bookings').update(...)` and `supabase.from('bookings_for_business_transaction').update(...)`). If one fails, data is corrupted.
2. **Client-Side Completion Security Hole**: The rule that an appointment must be `paid` before marking it `completed` exists only in client JavaScript (`if (payment !== 'paid')`). Any raw API call can bypass this, prematurely marking unpaid bookings as `completed` and triggering customer spend increments.
3. **Price Tampering on Edits**: `update_booking_atomic` accepts client-provided prices in `p_services` without verifying catalog rates in `app.services`.
4. **Reschedule Collision Vulnerability**: When changing dates or times in the edit modal, no double-booking collision check is performed.

---

## 2. Granular Specification for All 4 Logics in Unit 2

### Logic 14: Atomic Booking Status State Machine
* **Current State**: Handled via direct client-side updates in `booking-status-actions.js`.
* **Security & Integrity Threat**:
  * Non-transactional updates leave tables out of sync.
  * No server-side enforcement of allowed state transitions. For example, a `cancelled` appointment could be maliciously flipped back to `completed`.
* **Proposed Backend Logic**:
  * New Master Routine: `app.update_booking_status_atomic(p_booking_id uuid, p_company_id uuid, p_branch_id uuid, p_new_status text, p_notes text DEFAULT NULL)`.
  * Validate allowed status enum: `'booked'`, `'confirmed'`, `'in_progress'`, `'completed'`, `'cancelled'`, `'no-show'`.
  * Transition State Rules:
    * If current status is `'completed'`, it cannot be changed to `'booked'` or `'in_progress'` (must be cancelled/refunded).
    * If current status is `'cancelled'`, it cannot transition to `'completed'`.
    * If transitioning to `'completed'`, Prepayment Precondition (Logic 15) is enforced.
  * In a single atomic PostgreSQL transaction:
    * Updates all line items in `app.bookings WHERE booking_id = p_booking_id`.
    * Updates summary row in `app.bookings_for_business_transaction WHERE booking_id = p_booking_id`.
    * If new status is `'cancelled'`, sets open business transaction to `'cancelled'`.
* **Backend Mechanism**: `app.update_booking_status_atomic` (SECURITY DEFINER).

---

### Logic 15: Completion Prepayment Precondition Enforcement
* **Current State**: Frontend checks `payment !== 'paid'` and opens a modal.
* **Security Threat**: Disabling a button or showing a modal is UX, not security. A direct network request can mark an unpaid booking as `completed`, distorting financial and analytics reports.
* **Proposed Backend Logic**:
  * Server-side guard clause inside `app.update_booking_status_atomic`:
    ```sql
    IF LOWER(p_new_status) = 'completed' THEN
        SELECT payment_status INTO v_payment_status
        FROM app.bookings_for_business_transaction
        WHERE booking_id = p_booking_id;

        IF LOWER(COALESCE(v_payment_status, 'pending')) <> 'paid' THEN
            RAISE EXCEPTION 'Cannot mark booking as completed: Payment status is % (must be paid before completion)', v_payment_status;
        END IF;
    END IF;
    ```
* **Backend Mechanism**: Mandatory guard clause in `app.update_booking_status_atomic`.

---

### Logic 16: Customer Lifetime Value (LTV) and Visit Automation
* **Current State**: Trigger `trg_update_customer_stats_on_complete` fires AFTER UPDATE on `bookings_for_business_transaction`.
* **Proposed Backend Logic**:
  * Keep this automated database trigger.
  * When `status` transitions to `'completed'` and `payment_status = 'paid'`:
    * Updates `app.customers.total_spent = total_spent + final_amount`.
    * Updates `app.customers.last_visit = booking_date`.
  * Because Logic 14 and 15 ensure atomic updates and payment verification, this trigger is guaranteed to receive 100% verified data.
* **Backend Mechanism**: Existing Database Trigger (verified and operational).

---

### Logic 17: Hardened Booking Rescheduling & Service Line Edits
* **Current State**: `update_booking_atomic` deletes previous lines and inserts new lines, but trusts client prices and does not check for double-booking or salon operating hours.
* **Vulnerability**:
  * Client can reduce price during edit.
  * Rescheduling a stylist to an overlapping time window succeeds without collision detection.
* **Proposed Backend Logic**:
  * Update `app.update_booking_atomic`:
    1. **Tenant Verification**: Call `shared.verify_tenant_access(p_company_id, p_branch_id)`.
    2. **Immutability Check**: If booking is already `'completed'` or `'cancelled'`, reject structural line edits.
    3. **Operating Hours**: If `p_booking_date` or `p_start_time` is updated, verify branch operating hours in `app.business_hours`.
    4. **Authoritative Pricing**: For each service in `p_services`, fetch price and duration directly from `app.services`.
    5. **Stylist Double-Booking Check**:
       For each assigned staff member:
       ```sql
       SELECT b.booking_id, b.start_time, b.end_time
       INTO v_conflict_booking, v_conflict_start, v_conflict_end
       FROM app.bookings b
       WHERE b.company_id = p_company_id
         AND b.branch_id = p_branch_id
         AND b.staff_id = v_staff_id
         AND b.booking_date = p_booking_date
         AND b.booking_id <> p_booking_id -- Exclude self
         AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'no-show')
         AND (b.start_time, b.end_time) OVERLAPS (v_item_start, v_item_end)
       LIMIT 1;

       IF FOUND THEN
           RAISE EXCEPTION 'Stylist % already has an active appointment from % to % on this date',
               v_staff_name, v_conflict_start, v_conflict_end;
       END IF;
       ```
    6. **Atomic Update Across 3 Tables**:
       * Delete existing service lines from `app.bookings` and re-insert verified lines.
       * Update `app.bookings_for_business_transaction` with recalculated totals, start, and end times.
       * Update `app.business_transactions` (only if still unpaid `status = 'created'`).
* **Backend Mechanism**: Hardened `app.update_booking_atomic` routine.

---

## 3. Database Implementation Plan

### Step 1: Deploy New RPC `app.update_booking_status_atomic`
* Arguments:
  * `p_booking_id uuid`
  * `p_company_id uuid`
  * `p_branch_id uuid`
  * `p_new_status text`
  * `p_notes text DEFAULT NULL`
* Returns: `jsonb` (`{ success: true, booking_id: ..., new_status: ... }`)
* Also creates public wrapper `public.update_booking_status_atomic`.

### Step 2: Deploy Hardened `app.update_booking_atomic`
* Enforces tenant verification, price anti-tampering, operating hours, and stylist overlap checks.
* Also updates public wrapper `public.update_booking_atomic`.

### Step 3: Test Suite Verification
* Test A: Status transition (`booked` ➔ `confirmed`).
* Test B: Status transition to `completed` without payment (Expect rejection).
* Test C: Reschedule stylist into an overlapping slot (Expect collision rejection).
* Test D: Edit services with manipulated price (Expect authoritative catalog price).

### Step 4: Frontend Integration
* Update `scripts/bookings/booking-status-actions.js` to replace raw updates with `supabase.rpc('update_booking_status_atomic', ...)`.

---

## 4. Approval Checkpoint

Please review this specification for **Unit 2 (Booking Status & Edit Workflows)**. 
Let me know if you approve so I can proceed with the implementation!

