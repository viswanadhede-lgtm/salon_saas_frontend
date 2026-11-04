# Module 5: Staff & Scheduling — Stage 2 Architecture Specification

**Date**: November 4, 2026  
**Module**: Staff Management, Staff Scheduling & Branch Business Hours  
**Target Architecture**: Zero-Trust Frontend / Authoritative Backend-First  
**Database Schemas**: `app` (Storage & Logic), `public` (API Interface Layer), `shared` (Tenant Security)

---

## 1. Overview & Objectives

Module 5 provides the workforce management spine of the salon SaaS:
1. **Staff Directory (`app.staff`)**: Manage staff profiles, service capabilities, roles, contact details, active status, and soft deletion.
2. **Staff Schedules (`app.staff_schedule`)**: Manage daily shift timings, working hours, and off-duty statuses on a monthly calendar.
3. **Branch Business Hours (`app.business_hours`)**: Define branch-wide weekly operating schedules across all 7 weekdays.

### Hardening Goals
- **Zero Direct Table Mutations**: Retire all client `.insert()`, `.update()`, `.delete()`, and `.upsert()` operations.
- **Authoritative Plan Quota Enforcement**: Server-side verification of `platform.plan_limits.max_staff` before creating any new staff record.
- **Single-Transaction Atomic Schedule Overwrites**: Replace dangerous separate `.delete()` + `.insert()` sequences with atomic stored procedures.
- **Active Booking Protection**: Prevent staff deletion or schedule modifications (marking off-duty or narrowing shift hours) that would orphan active customer appointments.
- **Normalized Phone Uniqueness**: Branch-level phone deduplication enforced at the database layer.
- **Operating Hours Integrity**: Strict time ordering validation (`opening_time < closing_time`) for open branch days.

---

## 2. Stored Procedures Specification (6 RPCs)

### 2.1 `app.create_staff_atomic` / `public.create_staff_atomic`
- **Purpose**: Creates a new staff member with tenant validation, plan entitlement checks, and phone deduplication.
- **Signature**:
  ```sql
  FUNCTION create_staff_atomic(
      p_company_id       uuid,
      p_branch_id        uuid,
      p_staff_name       text,
      p_phone            text,
      p_email            text    DEFAULT NULL,
      p_role_name        text    DEFAULT 'Staff',
      p_services_offered text    DEFAULT NULL,
      p_notes            text    DEFAULT NULL,
      p_status           text    DEFAULT 'active'
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Validate required fields: `p_staff_name` (non-empty), `p_phone` (minimum 7 digits).
  3. Validate status: `'active'` or `'inactive'` (defaults to `'active'`).
  4. **SaaS Plan Quota Guard**:
     - Check `platform.subscriptions` + `platform.plan_limits` for `limit_key = 'max_staff'`.
     - Count current non-deleted staff for `p_company_id`.
     - If count >= quota, reject: `'Maximum staff limit (X) reached for your subscription plan. Please upgrade your plan to add more staff.'`
  5. **Phone Deduplication Guard**:
     - Normalize phone digits: `v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g')`.
     - If non-deleted staff with same phone exists in branch, reject: `'A staff member with this phone number already exists.'`
  6. Insert into `app.staff`.
  7. Return `{ "success": true, "staff_id": uuid, "staff_name": text, "status": text }`.

---

### 2.2 `app.update_staff_atomic` / `public.update_staff_atomic`
- **Purpose**: Updates staff details with tenant checks and phone collision prevention.
- **Signature**:
  ```sql
  FUNCTION update_staff_atomic(
      p_company_id       uuid,
      p_branch_id        uuid,
      p_staff_id         uuid,
      p_staff_name       text    DEFAULT NULL,
      p_phone            text    DEFAULT NULL,
      p_email            text    DEFAULT NULL,
      p_role_name        text    DEFAULT NULL,
      p_services_offered text    DEFAULT NULL,
      p_notes            text    DEFAULT NULL,
      p_status           text    DEFAULT NULL
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Verify staff exists in branch and `status <> 'deleted'`.
  3. If `p_phone` is updated, normalize and assert uniqueness excluding `p_staff_id`.
  4. If status updated, validate allowed values (`'active'`, `'inactive'`).
  5. Execute atomic `UPDATE app.staff`.
  6. Return `{ "success": true, "staff_id": uuid, "staff_name": text }`.

---

### 2.3 `app.delete_staff_atomic` / `public.delete_staff_atomic`
- **Purpose**: Soft-deletes a staff member, guarded by active upcoming booking checks.
- **Signature**:
  ```sql
  FUNCTION delete_staff_atomic(
      p_company_id uuid,
      p_branch_id  uuid,
      p_staff_id   uuid
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Verify staff exists in branch and `status <> 'deleted'`.
  3. **Active Booking Dependency Guard**:
     ```sql
     SELECT COUNT(*) INTO v_future_bookings
     FROM app.bookings
     WHERE staff_id = p_staff_id
       AND company_id = p_company_id
       AND branch_id = p_branch_id
       AND status IN ('booked', 'confirmed')
       AND booking_date >= CURRENT_DATE;
     ```
     If `v_future_bookings > 0`, reject:
     `'Cannot delete this staff member because there are X upcoming active booking(s) assigned to them. Please reschedule or reassign the booking(s) first.'`
  4. Soft-delete staff: `status = 'deleted'`, `updated_at = NOW()`.
  5. Purge future schedules (`schedule_date >= CURRENT_DATE`) for this staff member to prevent stale calendar slot generation.
  6. Return `{ "success": true, "staff_id": uuid, "status": "deleted" }`.

---

### 2.4 `app.save_staff_schedule_atomic` / `public.save_staff_schedule_atomic`
- **Purpose**: Atomically replaces future shift schedules for a staff member in a single transaction, preserving past history and blocking conflicts with active bookings.
- **Signature**:
  ```sql
  FUNCTION save_staff_schedule_atomic(
      p_company_id       uuid,
      p_branch_id        uuid,
      p_staff_id         uuid,
      p_year             int,
      p_month            int,
      p_schedule_entries jsonb
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Verify staff exists and is active.
  3. Compute date range: `v_month_start`, `v_month_end`, and `v_delete_from := GREATEST(CURRENT_DATE, v_month_start)`.
  4. If `v_delete_from > v_month_end`, reject (cannot overwrite completely past months).
  5. **Booking Conflict Verification**:
     - Check each entry where `(entry->>'schedule_date')::date >= CURRENT_DATE`.
     - If `is_off = true`: verify no active bookings (`booked`, `confirmed`) exist on that date for this staff member.
     - If `is_off = false`: verify no active bookings fall outside `[start_time, end_time]` (e.g. appointment before shift starts or after shift ends).
     - If conflict detected, reject with exact booking details.
  6. Delete existing schedule entries in `[v_delete_from, v_month_end]`.
  7. Bulk insert new entries in same transaction.
  8. Return `{ "success": true, "staff_id": uuid, "saved_entries_count": int, "month": text }`.

---

### 2.5 `app.delete_staff_schedule_atomic` / `public.delete_staff_schedule_atomic`
- **Purpose**: Deletes future schedule entries for a staff member in a target month with booking protection.
- **Signature**:
  ```sql
  FUNCTION delete_staff_schedule_atomic(
      p_company_id   uuid,
      p_branch_id    uuid,
      p_staff_id     uuid,
      p_target_month text
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Verify staff exists.
  3. Parse `p_target_month` ('YYYY-MM'), compute `v_delete_from := GREATEST(CURRENT_DATE, v_month_start)`.
  4. Check if active bookings exist for `p_staff_id` during `[v_delete_from, v_month_end]`. If found, block deletion.
  5. Delete entries in range.
  6. Return `{ "success": true, "staff_id": uuid, "target_month": text, "deleted_count": int }`.

---

### 2.6 `app.save_business_hours_atomic` / `public.save_business_hours_atomic`
- **Purpose**: Atomically saves the branch's 7-day operating schedule with time ordering checks.
- **Signature**:
  ```sql
  FUNCTION save_business_hours_atomic(
      p_company_id uuid,
      p_branch_id  uuid,
      p_hours      jsonb
  ) RETURNS jsonb
  ```
- **Business Rules**:
  1. `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Validate input array of day objects (`Monday` through `Sunday`).
  3. Validate: when `is_open = true`, `opening_time < closing_time`.
  4. Upsert into `app.business_hours` on conflict `(company_id, branch_id, day_of_week)`.
  5. Return `{ "success": true, "updated_count": int }`.

---

## 3. Frontend Integration Mapping

| Current Client Logic | Target RPC Stored Procedure | Frontend File |
|---|---|---|
| `supabase.from('staff').insert(payload)` | `public.create_staff_atomic(...)` | `staff.js` |
| `supabase.from('staff').update(payload)` | `public.update_staff_atomic(...)` | `staff.js` |
| `supabase.from('staff').update({status:'deleted'})` | `public.delete_staff_atomic(...)` | `staff.js` |
| `saveScheduleRecords` (delete + insert) | `public.save_staff_schedule_atomic(...)` | `scripts/staff-schedule/schedule-api.js` |
| `deleteScheduleByMonth` (delete) | `public.delete_staff_schedule_atomic(...)` | `scripts/staff-schedule/schedule-api.js` |
| `supabase.from('business_hours').upsert(rows)` | `public.save_business_hours_atomic(...)` | `scripts/settings-hours.js` |

---

## 4. Test Matrix (12 Automated Tests Planned)

- **T1**: Create staff member with valid parameters
- **T2**: Reject duplicate phone number in same branch
- **T3**: Enforce SaaS plan limit on `max_staff` (mock limit test)
- **T4**: Update staff details (name, email, services offered)
- **T5**: Block staff deletion if upcoming active booking exists
- **T6**: Successfully soft-delete staff member without bookings
- **T7**: Save monthly schedule entries atomically
- **T8**: Block saving schedule when stylist is marked off on a date with an active booking
- **T9**: Block saving schedule when shift hours exclude an existing active appointment
- **T10**: Block schedule deletion when active bookings exist in the month
- **T11**: Delete monthly schedule when no bookings conflict
- **T12**: Save 7-day business hours with valid time ranges and reject inverted times (`open >= close`)

