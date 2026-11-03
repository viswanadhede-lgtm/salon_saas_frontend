# BHARATHBOTS – SALON SAAS
# Unit 3: "Payment Settlement & Refund Workflows" – Detailed Logic Specification & Architecture Plan

> **Document Status**: Proposed / Ready for Review  
> **Module**: 1. BOOKINGS  
> **Unit**: 3 (Financial Settlement, Server-Side Discounts & Refunds)  
> **Target Schema**: `app` & `shared`  
> **Database**: PostgreSQL 17.6 (Supabase `qxmgyxjwpxkdbgldpdil`)

---

## 1. Overview & Current Gaps

Unit 3 covers the financial closure of the booking lifecycle:
1. **Payment Collection**: Settling an appointment bill with cash, card, or UPI, and applying discounts.
2. **Refund Processing**: Issuing a 100% full refund on cancelled appointments, reversing financial ledgers, customer lifetime spend, and applied discounts.

### Current Gaps Identified in Audit:
1. **Client-Controlled Discount Amounts**: The payment RPC currently trusts whatever `p_discount_amount` is sent by the frontend without verifying that the coupon code is valid, active, non-expired, or within customer redemption limits.
2. **Overrideable Final Bill Amount**: `p_final_amount` is accepted from client input rather than authoritatively derived as `total_price - discount_amount`.
3. **Missing Multi-Tenant Guard**: Neither `process_booking_payment_atomic` nor `process_booking_refund_atomic` verifies tenant access (`company_id`).
4. **Missing Refund RBAC Authorization**: Any user who can invoke the refund RPC can issue refunds without role verification.

---

## 2. Granular Specification for All 7 Logics in Unit 3

### Logic 18: Full Payment Only Policy (No Partial Payments)
* **Current State**: System design does not support split/partial installment payments for salon bookings (full settlement upon checkout).
* **Proposed Backend Logic**:
  * Verify that `amount_paid` matches `v_final_amount` (`total_price - verified_discount`).
  * If booking status is already `'cancelled'`, reject payment.
  * If transaction is already `'paid'`, reject duplicate payment attempt (`ERROR: Booking is already paid`).
* **Backend Mechanism**: Transactional validation guard in `app.process_booking_payment_atomic`.

---

### Logic 19: Authoritative Server-Side Discount & Coupon Validation
* **Current State**: Frontend JavaScript calculates discount (percent/fixed) and passes the final number into the database.
* **Security Threat**: Critical financial risk. A client can forge a coupon code or pass a ₹1,000 discount for a 10% coupon on a ₹200 service.
* **Proposed Backend Logic**:
  * If a discount is applied (`p_discount_type` IN `'coupon'`, `'offer'`, `'membership'`, `'manual'`):
    * **Coupon**:
      * Look up `app.coupons WHERE company_id = v_company_id AND (coupon_id = p_discount_id OR LOWER(coupon_code) = LOWER(p_discount_name)) AND status = 'active'`.
      * Validate date: `CURRENT_DATE BETWEEN valid_from AND valid_to`.
      * Validate minimum bill: `v_total_price >= COALESCE(min_bill_amount, 0)`.
      * Check usage limits: Count previous uses in `app.discount_usages`. Reject if exceeded.
      * Compute authoritative discount:
        * If percentage: `v_calc_discount := ROUND((v_total_price * discount_value / 100.0), 2)`.
        * If fixed: `v_calc_discount := LEAST(v_total_price, discount_value)`.
    * **Manual Discount**:
      * Allowed only if authorized role (Manager/Owner) or capped at salon default max manual discount threshold.
    * Final bill is authoritatively computed: `v_final_amount := GREATEST(0, v_total_price - v_calc_discount)`.
* **Backend Mechanism**: Server-side coupon verification engine in `app.process_booking_payment_atomic`.

---

### Logic 20: Three-Table Financial Ledger Inflow Synchronization
* **Current State**: Updates `business_transactions`, `bookings_for_business_transaction`, and `bookings`.
* **Proposed Backend Logic**:
  * In a single atomic PostgreSQL transaction:
    1. Update open row in `app.business_transactions`:
       `status = 'paid'`, `paid_at = NOW()`, `payment_method = p_payment_method`, `discount_amount = v_calc_discount`, `final_amount = v_final_amount`.
    2. Update summary in `app.bookings_for_business_transaction`:
       `payment_status = 'paid'`, `discount_amount = v_calc_discount`, `final_amount = v_final_amount`.
    3. Update line items in `app.bookings`:
       `payment = 'paid'`.
    4. Log discount usage in `app.discount_usages`:
       Records customer ID, discount ID, amount, and timestamp for auditing and quota enforcement.
* **Backend Mechanism**: Atomic transaction in `app.process_booking_payment_atomic`.

---

### Logic 21: Customer Visit Tracking
* **Current State**: Database trigger updates `customers.last_visit` on booking completion.
* **Proposed Backend Logic**:
  * Maintained via PostgreSQL Trigger `trg_update_customer_stats_on_complete`.

---

### Logic 22: Full Refund Enforcement (100% Policy)
* **Current State**: Refunds are always 100% of the collected amount.
* **Proposed Backend Logic**:
  * Server looks up the original `app.business_transactions` row where `reference_id = p_booking_id AND status = 'paid'`.
  * If no paid transaction is found: Reject (`ERROR: No paid transaction exists for this booking`).
  * If already refunded: Reject (`ERROR: Booking has already been refunded`).
  * Determine refund amount = original `final_amount`.
  * Insert a new immutable refund ledger entry in `app.business_transactions`:
    `reference_type = 'booking'`, `reference_id = p_booking_id`, `amount = v_refund_amount`, `status = 'refunded'`, `paid_at = NOW()`.
* **Backend Mechanism**: Immutable ledger insertion in `app.process_booking_refund_atomic`.

---

### Logic 23: Customer Lifetime Spend Reversal Automation
* **Current State**: Deducts from `customers.total_spent` if booking was previously marked completed.
* **Proposed Backend Logic**:
  * If the booking was previously `'completed'`:
    `UPDATE app.customers SET total_spent = GREATEST(0, total_spent - v_refund_amount) WHERE customer_id = v_customer_id;`
  * Also reverses discount usage in `app.discount_usages`:
    `status = 'reversed'`, `reversal_amount = discount_amount`, `reversed_at = NOW()`.
* **Backend Mechanism**: Atomic reversal queries inside `app.process_booking_refund_atomic`.

---

### Logic 24: Refund Authorization (RBAC)
* **Current State**: None. Any client can call `process_booking_refund_atomic`.
* **Security Threat**: High financial vulnerability. A front-desk receptionist or unauthenticated client could trigger false refunds.
* **Proposed Backend Logic**:
  * Verify caller’s role via `shared.users`:
    ```sql
    SELECT role_name INTO v_user_role
    FROM shared.users
    WHERE user_id = auth.uid() AND company_id = v_company_id;
    ```
  * Only `owner`, `super_admin`, or `manager` roles are authorized to execute refunds.
* **Backend Mechanism**: RBAC check at start of `app.process_booking_refund_atomic`.

---

## 3. Database Implementation Plan

1. **Step 1: Deploy Hardened `app.process_booking_payment_atomic`**
   * Verifies tenant access.
   * Validates coupons & discounts server-side.
   * Computes authoritative `final_amount`.
   * Atomically synchronizes all 3 tables and logs discount usage.
2. **Step 2: Deploy Hardened `app.process_booking_refund_atomic`**
   * Enforces tenant verification and RBAC permissions.
   * Enforces 100% full refund policy.
   * Reverses customer spend and discount usage.
3. **Step 3: Public Compatibility Wrappers**
   * Keep `public.process_booking_payment_atomic` and `public.process_booking_refund_atomic` pointing to the hardened `app` routines.
4. **Step 4: Integration Testing & Verification**
   * Test payment settlement with valid coupon.
   * Test payment discount tampering (client submits ₹500 discount for ₹100 coupon; DB enforces ₹100).
   * Test full refund execution and customer spend reversal.
   * Test unauthorized refund rejection.

---

## 4. Approval Checkpoint

Please review this specification for **Unit 3 (Payment Settlement & Refunds)**. 
Let me know if you approve so I can proceed with the implementation!

