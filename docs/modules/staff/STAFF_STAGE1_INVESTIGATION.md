# Module 5: Staff & Scheduling — Stage 1 Investigation & Logic Inventory

**Date**: November 4, 2026  
**Module**: Staff, Staff Scheduling & Branch Operating Hours  
**Target Tables**:
- `app.staff` (Primary staff directory, contact, role, status)
- `app.staff_schedule` (Daily shifts, working hours, day-off flags)
- `app.business_hours` (Branch-level weekly operating schedule)

---

## 1. Subsystem Architecture & Surface Area

The Staff & Scheduling subsystem governs the workforce operations of each salon branch: who works at the salon, what services they perform, when the branch is open, and when each stylist is on duty.

### Core Files
1. **`staff.html` & `staff.js`**:
   - Staff directory table, active status toggle, role management.
   - "Add Staff" modal: Name, phone, email, services offered, notes, status (`active`/`inactive`).
   - "Edit Staff" modal: In-memory phone duplicate check, direct `.update()` call.
   - "Delete Staff" confirmation modal: Client-side upcoming booking check via `checkStaffDependencies`, then direct `.update({ status: 'deleted' })`.
2. **`staff-schedule.html` & `scripts/staff-schedule/`**:
   - `schedule-api.js`: Data-access layer fetching staff, fetching monthly schedules, and executing schedule mutations (`deleteScheduleByMonth`, `saveScheduleRecords`).
   - `schedule-modal-edit.js`: Schedule creation/editing modal (supports both "apply full month" repetitive weekly template and individual date adjustments).
   - `schedule-modal-delete.js`: Deletes entire future schedule for a staff member for a target month.
   - `schedule-table.js`: Renders staff schedule matrix, calculate weekly total hours.
3. **`scripts/settings-hours.js`**:
   - Branch operating hours configuration (7 days: Monday through Sunday).
   - Handles `is_open`, `opening_time`, `closing_time`.
   - Executes raw client-side `.upsert()` into `business_hours` on conflict `(company_id, branch_id, day_of_week)`.

---

## 2. Inventory of Current Direct Mutations

| File | Line | Target Table | Operation | Current Client Logic |
|---|---|---|---|---|
| `staff.js` | 535 | `staff` | `.insert(payload)` | Direct insert; checks required fields in DOM; relies on client `refreshUsageCounter('max_staff')`. |
| `staff.js` | 616 | `staff` | `.update(payload)` | Direct update; performs in-memory duplicate check on `liveStaffData`. |
| `staff.js` | 693 | `staff` | `.update({ status: 'deleted' })` | Direct soft-delete; calls client-side `checkStaffDependencies(staffId)`. |
| `scripts/staff-schedule/schedule-api.js` | 253 | `staff_schedule` | `.delete()` | Direct delete of month schedules from today onwards. |
| `scripts/staff-schedule/schedule-api.js` | 276 | `staff_schedule` | `.delete()` | First step of schedule save: purges existing future records. |
| `scripts/staff-schedule/schedule-api.js` | 291 | `staff_schedule` | `.insert(insertPayload)` | Second step of schedule save: bulk inserts new shift records without a transaction! |
| `scripts/settings-hours.js` | 248 | `business_hours` | `.upsert(rows, ...)` | Direct upsert of 7 weekday records from client DOM inputs. |

---

## 3. Vulnerability & Risk Analysis

### Risk 1: Client-Side SaaS Plan Entitlement Bypass (`max_staff`)
- The SaaS platform has tiered limits defined in `platform.plan_limits` (`GROWTH` = 10 staff, `ADVANCE` = 20 staff).
- Currently, `staff.js` simply calls `refreshUsageCounter('max_staff')` after insertion. A client can bypass the UI and execute direct REST calls to insert unlimited staff members across branches.
- **Backend Fix**: `create_staff_atomic` must query `platform.subscriptions` and `platform.plan_limits` to enforce `max_staff` before inserting.

### Risk 2: Non-Atomic Delete-Then-Insert Schedule Corruption
- In `schedule-api.js`, updating a stylist's schedule executes `.delete()` on `staff_schedule`, followed by `.insert(insertPayload)` in separate network requests.
- If the network drops, the browser crashes, or the second request encounters an error, the existing shift schedule is permanently erased, corrupting stylist availability.
- **Backend Fix**: `save_staff_schedule_atomic` must perform the purge and bulk replacement inside a single atomic PostgreSQL transaction.

### Risk 3: Silent Booking Stranding on Off-Days & Shift Changes
- When a schedule is saved or deleted, the frontend does **not** check whether existing bookings are already confirmed for that stylist during the affected dates/times.
- A stylist can be marked `is_off = true` or their shift reduced from `09:00-18:00` to `09:00-12:00` while having active customer appointments at `15:00`.
- **Backend Fix**: `save_staff_schedule_atomic` and `delete_staff_schedule_atomic` must verify that changing working hours or setting `is_off = true` does not orphan active future bookings (`status IN ('booked', 'confirmed')`).

### Risk 4: Client-Side Deletion Dependency Check
- `checkStaffDependencies` in `staff.js` queries `bookings` from the browser before issuing a soft-delete on `staff`.
- A direct PostgREST API request completely bypasses this check and deletes staff members with active appointments.
- **Backend Fix**: `delete_staff_atomic` must enforce the active booking guard server-side.

### Risk 5: Phone Number Collisions & Normalization
- Phone validation only checks against client in-memory cache `liveStaffData.find(...)`. Multiple tabs or concurrent users can create duplicate staff records with the same phone.
- **Backend Fix**: Database-level normalized phone comparison (`regexp_replace(phone, '[^0-9]', '', 'g')`) scoped to `company_id` and `branch_id`.

### Risk 6: Malformed Business Hours (Inverted Shifts)
- Client-side DOM inputs allow setting `opening_time >= closing_time`.
- **Backend Fix**: `save_business_hours_atomic` validates that `opening_time < closing_time` whenever `is_open = true`.

---

## 4. Next Step
Proceed to **Stage 2: Architecture Specification & Stored Procedures Design** (`docs/modules/staff/STAFF_ARCHITECTURE_SPEC.md`).

