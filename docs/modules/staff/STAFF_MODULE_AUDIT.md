# Module 5: Staff & Scheduling Hardening Audit Report

**Date**: November 4, 2026  
**Module**: Staff Management, Staff Scheduling & Branch Operating Hours (`staff`, `staff_schedule`, `business_hours`)  
**Status**: **100% COMPLETE & VERIFIED**  
**Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First (PostgreSQL `SECURITY DEFINER` RPCs)  
**Database Schemas**: `app` (Storage & Logic), `public` (Interface Layer), `shared` (Tenant Verification)

---

## 1. Executive Summary

Module 5 governs the entire workforce and operational capacity of each salon branch: staff directory profiles, service capabilities, active status, daily shift schedules, and branch weekly operating hours. Previously, staff creation bypassed SaaS plan limits, schedule overwrites used dangerous separate `.delete()` + `.insert()` sequences without transaction boundaries, staff deletions relied on client-side dependency queries, and shift changes silently stranded active customer appointments.

Under the Zero-Trust architecture:
- **0 direct table mutations** remain on `staff`, `staff_schedule`, or `business_hours`.
- **6 atomic, SECURITY DEFINER stored procedures** govern all staff directory, scheduling, and operating hours mutations with mandatory tenant validation (`shared.verify_tenant_access`).
- **SaaS Plan Entitlement Quota**: `create_staff_atomic` verifies `platform.plan_limits` (`limit_key = 'max_staff'`) at the database level before creating staff records.
- **Single-Transaction Atomic Schedule Overwrite**: `save_staff_schedule_atomic` replaces future month schedules in one transaction, preserving past work history.
- **Active Booking Protection**:
  - `delete_staff_atomic` blocks deletion if upcoming active bookings exist for that staff member.
  - `save_staff_schedule_atomic` blocks marking a stylist off-duty or narrowing shift hours if an active appointment is already scheduled.
  - `delete_staff_schedule_atomic` blocks deletion if active bookings exist during that month.
- **Normalized Phone Deduplication**: Prevents duplicate staff mobile numbers in a branch, matching both exact string and 10-digit suffix.
- **Business Hours Integrity**: Strictly asserts `opening_time < closing_time` when a day is marked open.
- **12/12 automated integration tests passed** in production database `qxmgyxjwpxkdbgldpdil`.

---

## 2. Migration Overview

- **Migration File**: `supabase/migrations/20261103000010_harden_staff_module.sql`
- **Schemas**: `app` (internal implementation) and `public` (API wrapper)
- **Functions Deployed**: 6 stored procedures + 6 public wrappers + security grants to `anon, authenticated`.

### Functions Inventory

| # | Stored Procedure | Schema | Purpose & Business Rules |
|---|---|---|---|
| 1 | `create_staff_atomic` | `app` / `public` | Creates staff member; validates required fields, **enforces SaaS plan `max_staff` quota**, and performs branch phone deduplication. |
| 2 | `update_staff_atomic` | `app` / `public` | Updates staff details with tenant checks and branch phone uniqueness assertion. |
| 3 | `delete_staff_atomic` | `app` / `public` | Soft-deletes staff (`status = 'deleted'`); **blocks deletion if upcoming active bookings are assigned**; purges future shifts. |
| 4 | `save_staff_schedule_atomic` | `app` / `public` | Atomically replaces monthly schedule in one transaction; preserves past dates; **blocks off-duty/shift changes that conflict with active bookings**. |
| 5 | `delete_staff_schedule_atomic` | `app` / `public` | Deletes monthly schedule from today onwards; **blocks deletion if active bookings exist during the period**. |
| 6 | `save_business_hours_atomic` | `app` / `public` | Atomically upserts 7-day branch operating schedule; asserts `opening_time < closing_time` for open days. |

---

## 3. Server-Side Guard Logic Highlights

### 3.1. SaaS Plan Entitlement Check (`max_staff`)
```sql
SELECT l.limit_value INTO v_max_staff
FROM platform.subscriptions s
JOIN platform.plan_limits l ON l.plan_id = s.plan_id AND l.limit_key = 'max_staff'
WHERE s.company_id = p_company_id
  AND LOWER(COALESCE(s.status, '')) IN ('active', 'trialing', 'authenticated')
ORDER BY s.created_at DESC
LIMIT 1;

IF v_max_staff IS NOT NULL AND v_max_staff > 0 THEN
    SELECT COUNT(*) INTO v_current_staff_count
    FROM app.staff
    WHERE company_id = p_company_id AND status <> 'deleted';

    IF v_current_staff_count >= v_max_staff THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Maximum staff limit (' || v_max_staff || ') reached for your subscription plan. Please upgrade your plan to add more staff.'
        );
    END IF;
END IF;
```

### 3.2. Active Booking Conflict Guard on Shift Modification
```sql
IF r.s_off = true THEN
    SELECT booking_date, start_time, end_time
    INTO v_conflict_date, v_conflict_start, v_conflict_end
    FROM app.bookings
    WHERE staff_id = p_staff_id AND company_id = p_company_id AND branch_id = p_branch_id
      AND booking_date = r.s_date AND status IN ('booked', 'confirmed')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot mark stylist as off-duty on ' || to_char(v_conflict_date, 'YYYY-MM-DD') || ' because an active appointment is scheduled from ' || to_char(v_conflict_start, 'HH24:MI') || ' to ' || to_char(v_conflict_end, 'HH24:MI') || '. Please reschedule or reassign the appointment first.'
        );
    END IF;
ELSIF r.s_start IS NOT NULL AND r.s_end IS NOT NULL THEN
    SELECT booking_date, start_time, end_time
    INTO v_conflict_date, v_conflict_start, v_conflict_end
    FROM app.bookings
    WHERE staff_id = p_staff_id AND company_id = p_company_id AND branch_id = p_branch_id
      AND booking_date = r.s_date AND status IN ('booked', 'confirmed')
      AND (start_time < r.s_start OR end_time > r.s_end)
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Shift hours (' || to_char(r.s_start, 'HH24:MI') || '-' || to_char(r.s_end, 'HH24:MI') || ') on ' || to_char(v_conflict_date, 'YYYY-MM-DD') || ' conflict with an active appointment scheduled from ' || to_char(v_conflict_start, 'HH24:MI') || ' to ' || to_char(v_conflict_end, 'HH24:MI') || '. Please reschedule the appointment first.'
        );
    END IF;
END IF;
```

### 3.3. Staff Deletion Active Booking Guard
```sql
SELECT COUNT(*) INTO v_future_bookings
FROM app.bookings
WHERE staff_id = p_staff_id
  AND company_id = p_company_id
  AND branch_id = p_branch_id
  AND status IN ('booked', 'confirmed')
  AND booking_date >= CURRENT_DATE;

IF v_future_bookings > 0 THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete this staff member because there are ' || v_future_bookings || ' upcoming active booking(s) assigned to them. Please reschedule or reassign the booking(s) first.'
    );
END IF;
```

---

## 4. Automated Integration Test Suite

All 12 integration test assertions executed in PostgreSQL with 100% pass rate:

| Test ID | Assertion Description | Result |
|---|---|---|
| **T1** | Create staff member with valid parameters and active status | **PASSED** |
| **T2** | Reject duplicate phone number in same branch (10-digit normalized suffix) | **PASSED** |
| **T3** | Reject invalid short phone number (`< 7` digits) | **PASSED** |
| **T4** | Update staff member details (name, email, services offered) | **PASSED** |
| **T5** | Block staff deletion when upcoming active bookings exist | **PASSED** |
| **T6** | Soft-delete staff member when no bookings exist (`status = 'deleted'`) | **PASSED** |
| **T7** | Save monthly schedule entries atomically in one transaction | **PASSED** |
| **T8** | Block saving schedule when stylist is marked off on a date with an active booking | **PASSED** |
| **T9** | Block saving schedule when shift hours exclude an existing active appointment | **PASSED** |
| **T10** | Block schedule deletion when active bookings exist during that month | **PASSED** |
| **T11** | Delete monthly schedule when no bookings conflict | **PASSED** |
| **T12** | Save 7-day business hours and reject inverted hours (`opening >= closing`) | **PASSED** |

---

## 5. Frontend Refactoring & Zero-Mutation Audit

### 5.1. Files Refactored
1. `staff.js`:
   - `addStaffForm`: Replaced direct `.insert()` with `supabase.rpc('create_staff_atomic')`.
   - `editStaffForm`: Replaced direct `.update()` with `supabase.rpc('update_staff_atomic')`.
   - `deleteStaffConfirm`: Replaced direct `.update({ status: 'deleted' })` with `supabase.rpc('delete_staff_atomic')`.
   - `checkStaffDependencies`: Simplified to delegate authoritative checking to PostgreSQL stored procedures.
2. `scripts/staff-schedule/schedule-api.js`:
   - `deleteScheduleByMonth`: Replaced direct `.delete()` with `supabase.rpc('delete_staff_schedule_atomic')`.
   - `saveScheduleRecords`: Replaced separate `.delete()` + `.insert()` sequence with atomic `supabase.rpc('save_staff_schedule_atomic')`.
3. `scripts/settings-hours.js`:
   - `window.saveHours`: Replaced direct `.upsert()` with `supabase.rpc('save_business_hours_atomic')`.

### 5.2. Audit Verification
Codebase-wide AST regex scan across all `.js` and `.html` files:
```regex
/\.from\(['"`](staff|staff_schedule|business_hours)['"`]\)[^;]*?\.(insert|update|delete|upsert)\(/
```
**Total direct mutations found: 0**.

