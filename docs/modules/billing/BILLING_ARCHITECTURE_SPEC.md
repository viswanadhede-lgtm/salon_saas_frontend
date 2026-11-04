# Module 12: SaaS Billing & Subscriptions — Architecture Specification

## 1. Overview & Principles

All subscription and quota operations are executed through authoritative `SECURITY DEFINER` routines in PostgreSQL (`app` schema with `public` bridges).

Every procedure:
- Declares `SECURITY DEFINER`.
- Enforces `SET search_path = platform, shared, app, public, pg_temp;`.
- Enforces `shared.verify_tenant_access(p_company_id, NULL)`.

---

## 2. Stored Procedures Specification

### 2.1 `app.cancel_subscription_addon_atomic`
- **Purpose**: Marks an active add-on as `cancelling` (active until paid period expires, no auto-renewal).
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_addon_id` (uuid, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
  - Target add-on must exist with status `'active'`.
- **Returns**: `jsonb` `{ success: true, addon_id: uuid, status: 'cancelling' }`

---

### 2.2 `app.reactivate_subscription_addon_atomic`
- **Purpose**: Reverts a `cancelling` add-on back to `active` before it expires.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_addon_id` (uuid, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
  - Target add-on must have status `'cancelling'` and `ended_at > NOW()`.
- **Returns**: `jsonb` `{ success: true, addon_id: uuid, status: 'active' }`

---

### 2.3 `app.sync_plan_features_atomic`
- **Purpose**: Atomic single-row synchronization of all feature keys for a plan.
- **Parameters**:
  - `p_plan_id` (uuid, required)
  - `p_feature_keys` (jsonb, required, array of feature keys)
- **Logic**:
  - Checks if a row already exists in `platform.plan_features` for `p_plan_id`.
  - If exists: updates the primary row with `feature_key = p_feature_keys::text`; deletes any duplicate extra rows.
  - If not exists: inserts a new row.
- **Returns**: `jsonb` `{ success: true, plan_id: uuid }`

---

### 2.4 `app.sync_usage_counter_atomic`
- **Purpose**: Atomic upsert of a quota usage counter for a tenant.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_limit_key` (text, required)
  - `p_current_count` (integer, optional)
  - `p_max_limit` (integer, optional)
  - `p_plan_id` (uuid, optional)
  - `p_branch_id` (uuid, optional)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
- **Logic**:
  - Upserts into `platform.usage_counters` based on `(company_id, limit_key)`.
  - Preserves existing values when arguments are NULL via `COALESCE`.
- **Returns**: `jsonb` `{ success: true, current_count: int, max_limit: int }`

---

### 2.5 `app.backfill_oauth_phone_atomic`
- **Purpose**: Backfills phone into `shared.users` and `shared.profiles` after subscription creation.
- **Parameters**:
  - `p_company_id` (uuid, required)
  - `p_user_id` (uuid, required)
  - `p_phone` (text, required)
- **Guards**:
  - `shared.verify_tenant_access(p_company_id, NULL)`
  - User must exist in `shared.users` for this company.
- **Returns**: `jsonb` `{ success: true }`

---

## 3. Migration Strategy

- Migration file: `supabase/migrations/20261103000017_harden_billing_module.sql`
- Deployment script: `scratch/deploy_migration_17.js`
- Test suite: `scratch/run_test_billing.js`

