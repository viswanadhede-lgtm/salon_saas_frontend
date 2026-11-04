# Module 6: Customers & CRM - Architecture Specification & Migration Blueprint

## 1. Context & Objectives
This document specifies the PostgreSQL architecture, security controls, parameter signatures, and verification contracts required to achieve a **100% Zero-Trust Frontend / Authoritative Backend-First** posture for **Module 6: Customers & CRM**.

### Key Objectives:
1. **Zero Client Direct Writes**: Eliminate all `.from('customers').insert()`, `.update()`, `.delete()` and `.from('reviews').insert()`.
2. **Authoritative Financial & Activity Protection**: Prevent tampering with `total_spent` and `last_visit`. Client updates cannot mutate these columns.
3. **Automated Deduplication & Phone Normalization**: Centralize phone cleaning and multi-branch / company-level deduplication on normalized 10-digit suffixes.
4. **Referential Integrity & Dependency Guards**: Block customer deletion if active/upcoming appointments (`bookings`) or active memberships (`membership_purchases`) exist.
5. **Atomic Customer Creation**: Return created customer entity in a single database roundtrip, eliminating multi-query race conditions.

---

## 2. Stored Procedure Specifications

### 2.1 `app.create_customer_atomic`
- **Schema**: `app` (callable via `public` synonym wrapper)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Current active branch ID |
  | `p_customer_name` | `text` | YES | - | Customer full name |
  | `p_customer_phone` | `text` | YES | - | Raw or formatted phone number |
  | `p_customer_email` | `text` | NO | `NULL` | Customer email address |
  | `p_dob` | `date` | NO | `NULL` | Customer date of birth |
  | `p_tags` | `text` | NO | `'new'` | Customer segmentation tag |
  | `p_notes` | `text` | NO | `NULL` | Initial customer notes |
- **Returns**: `jsonb` (Full created customer record)
- **Logic & Validations**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Asserts `p_customer_name` is non-empty.
  3. Strips non-digits from `p_customer_phone` -> `v_norm_phone`. Asserts `length(v_norm_phone) >= 7`.
  4. Checks for existing active customer in the company matching `RIGHT(customer_phone, 10) = RIGHT(v_norm_phone, 10)` and `status != 'deleted'`. If found, raises `409 Conflict: A customer with this phone number already exists in this company.`
  5. Inserts into `app.customers` with `status = 'active'`, `total_spent = 0.00`, `created_at = NOW()`, `updated_at = NOW()`.
  6. Returns `to_jsonb(customer.*)`.

---

### 2.2 `app.update_customer_atomic`
- **Schema**: `app` (callable via `public` synonym wrapper)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Current branch ID |
  | `p_customer_id` | `uuid` | YES | - | Target customer ID |
  | `p_customer_name` | `text` | YES | - | Updated customer full name |
  | `p_customer_phone` | `text` | YES | - | Updated phone number |
  | `p_customer_email` | `text` | NO | `NULL` | Updated email address |
  | `p_dob` | `date` | NO | `NULL` | Updated date of birth |
  | `p_tags` | `text` | NO | `NULL` | Updated tags |
  | `p_notes` | `text` | NO | `NULL` | Updated notes |
- **Returns**: `jsonb` (Updated customer record)
- **Logic & Validations**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Asserts target customer exists and belongs to `p_company_id`.
  3. Strips non-digits from `p_customer_phone` -> `v_norm_phone`. Asserts `length(v_norm_phone) >= 7`.
  4. Deduplication: Ensures no *other* customer in the company (`customer_id != p_customer_id` and `status != 'deleted'`) shares `RIGHT(customer_phone, 10)`.
  5. Updates metadata: `customer_name`, `customer_phone`, `customer_email`, `dob`, `tags`, `notes`, `updated_at = NOW()`.
  6. **Anti-Tampering Guard**: `total_spent` and `last_visit` are explicitly protected and unaltered.
  7. Returns `to_jsonb(customer.*)`.

---

### 2.3 `app.delete_customer_atomic`
- **Schema**: `app` (callable via `public` synonym wrapper)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | YES | - | Current branch ID |
  | `p_customer_id` | `uuid` | YES | - | Customer to soft-delete |
- **Returns**: `boolean` (`true` on success)
- **Logic & Dependency Guards**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Asserts target customer exists and `status != 'deleted'`.
  3. **Active/Upcoming Booking Blocker**:
     Checks `app.bookings` for `customer_id = p_customer_id` AND `status IN ('booked', 'confirmed')` AND `booking_date >= CURRENT_DATE`.
     If count > 0, raises: `'Cannot delete customer "%". They have % active or upcoming booking(s).'`.
  4. **Active Membership Blocker**:
     Checks `app.membership_purchases` for `customer_id = p_customer_id` AND `status = 'active'` AND `(end_date IS NULL OR end_date >= CURRENT_DATE)`.
     If count > 0, raises: `'Cannot delete customer "%". They hold % active membership(s).'`.
  5. Sets `status = 'deleted'`, `updated_at = NOW()`.
  6. Returns `true`.

---

### 2.4 `app.submit_customer_review_atomic`
- **Schema**: `app` (callable via `public` synonym wrapper)
- **Security**: `SECURITY DEFINER`, `SET search_path = platform, shared, app, public, pg_temp;`
- **Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `p_company_id` | `uuid` | YES | - | Tenant company ID |
  | `p_branch_id` | `uuid` | NO | `NULL` | Target branch ID |
  | `p_user_id` | `uuid` | YES | - | Reviewer user ID |
  | `p_rating` | `integer` | YES | - | Rating (1 to 5) |
  | `p_comments` | `text` | NO | `NULL` | Review comments |
- **Returns**: `jsonb` (Created review record)
- **Logic & Validations**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Validates rating: `IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Review rating must be an integer between 1 and 5.'; END IF;`.
  3. Inserts into `shared.reviews (user_id, company_id, branch_id, rating, comments, created_at)`.
  4. Returns `to_jsonb(review.*)`.

---

## 3. Frontend Refactoring Plan
1. **`scripts/global-customer-modal.js`**:
   - Replace lines 142-181 (manual phone query + `.insert()` + refetch) with single `supabase.rpc('create_customer_atomic', { ... })`.
2. **`scripts/global-booking-modal.js`**:
   - Replace line 2168 (`.from('customers').insert(...)`) with `supabase.rpc('create_customer_atomic', { ... })`.
3. **`customers.js`**:
   - Replace lines 700-756 (edit customer duplicate check + `.update()`) with `supabase.rpc('update_customer_atomic', { ... })`.
   - Replace lines 773-780 (soft-delete `.update()`) with `supabase.rpc('delete_customer_atomic', { ... })`.
4. **`scripts/review-modal.js`**:
   - Replace line 174 (`.from('reviews').insert(...)`) with `supabase.rpc('submit_customer_review_atomic', { ... })`.

---

## 4. Verification & Testing Matrix
- **T1**: Create customer with valid data -> Success, returns JSON with `status = 'active'`, `total_spent = 0.00`.
- **T2**: Create customer with duplicate phone -> Rejection (`409 Conflict`).
- **T3**: Create customer with invalid/short phone (< 7 digits) -> Rejection.
- **T4**: Update customer name, email, tags, notes -> Success.
- **T5**: Update customer phone to an existing other customer's phone -> Rejection.
- **T6**: Update customer anti-tamper check -> Verify `total_spent` and `last_visit` are unaffected.
- **T7**: Delete customer with active upcoming booking -> Rejection with descriptive blocker error.
- **T8**: Delete customer with active membership -> Rejection with descriptive blocker error.
- **T9**: Delete customer with no active dependencies -> Soft-delete success (`status = 'deleted'`).
- **T10**: Submit customer review with valid rating (1-5) -> Success.
- **T11**: Submit customer review with invalid rating (e.g. 0 or 6) -> Rejection.
- **T12**: Tenant isolation -> Attempt operations with mismatched tenant credentials -> Access denied.

