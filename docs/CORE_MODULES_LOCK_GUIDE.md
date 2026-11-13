# Core Modules Protection & Maintenance Guide

This document describes how the Database Protection System works for the 20 locked core objects (13 RPCs + 7 Tables) and provides copy-paste SQL commands for intentional modifications.

---

## 1. Quick Copy-Paste SQL Commands

### Check All Locked Objects
```sql
SELECT object_type, object_name, status, updated_at
FROM protection.protected_objects
ORDER BY object_type, object_name;
```

### Check a Specific Object Status
```sql
SELECT object_name, object_type, status, updated_at
FROM protection.protected_objects
WHERE object_name = 'assign_membership_atomic';
```

### Unlock an Object (Reason Required)
```sql
-- For an RPC:
SELECT protection.unlock_object('assign_membership_atomic', 'Upgrading logic for v2');

-- For a Table:
SELECT protection.unlock_object('membership_purchases', 'Adding index on customer_id');
```

### Re-Lock an Object
```sql
-- For an RPC:
SELECT protection.lock_object('assign_membership_atomic');

-- For a Table:
SELECT protection.lock_object('membership_purchases');
```

### View Audit Trail (Who Unlocked What & When)
```sql
SELECT id, object_name, action, reason, performed_by, created_at
FROM protection.protection_audit_log
ORDER BY id DESC;
```

---

## 2. Step-by-Step Workflow for Deliberate Changes

Whenever you need to update a locked function or alter a locked table:

```sql
BEGIN;

-- 1. Unlock the target object
SELECT protection.unlock_object('create_booking_atomic', 'Fixing timezone calculation bug');

-- 2. Execute your DDL changes
CREATE OR REPLACE FUNCTION app.create_booking_atomic(...)
...;

-- 3. Re-lock immediately
SELECT protection.lock_object('create_booking_atomic');

COMMIT;
```

---

## 3. List of Protected Objects (20 Total)

### 13 Core RPCs (`app` schema)
1. `create_booking_atomic` (Bookings)
2. `update_booking_atomic` (Bookings)
3. `process_booking_payment_atomic` (Bookings)
4. `update_booking_status_atomic` (Bookings)
5. `process_booking_refund_atomic` (Bookings)
6. `create_pos_sale_atomic` (POS)
7. `process_pos_refund_atomic` (POS)
8. `validate_pos_refund` (POS)
9. `assign_membership_atomic` (Memberships)
10. `cancel_membership_atomic` (Memberships)
11. `process_membership_refund_atomic` (Memberships)
12. `validate_assign_membership` (Memberships)
13. `validate_discount` (Shared)

### 7 Core Tables (`app` schema)
1. `bookings` (Bookings)
2. `bookings_for_business_transaction` (Bookings)
3. `business_transactions` (Shared Financial Ledger)
4. `discount_usages` (Shared Discount Audit)
5. `sales` (POS)
6. `sales_for_business_transactions` (POS)
7. `membership_purchases` (Memberships)

---

## 4. Key Rules & Guarantees

1. **Normal Operations Unaffected**:
   `INSERT`, `UPDATE`, `DELETE`, and `SELECT` queries continue to run with zero restrictions. Only structural changes (`ALTER`, `DROP`, `CREATE OR REPLACE`) are blocked.

2. **Table Triggers Unaffected**:
   All row-level and statement-level triggers (e.g. `updated_at`, audit triggers, foreign keys) continue to fire automatically as normal.

3. **Protection Boundary**:
   Accidental drops or structural edits throw error `55P03` (`ACCIDENTAL_CHANGE_GUARD` or `ACCIDENTAL_DROP_GUARD`) and immediately abort the transaction.

