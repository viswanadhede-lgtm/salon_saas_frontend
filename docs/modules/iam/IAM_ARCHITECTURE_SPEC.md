# Module 10: IAM, Users, Roles & Permissions — Architecture Specification

## 1. Design Principles

- All mutations go through `SECURITY DEFINER` stored procedures in the `app` schema (aliased in `public`).
- `shared.verify_tenant_access(company_id, branch_id)` is the first guard in every procedure.
- Owner-role protection is enforced at the database level — no stored procedure may modify or delete an owner-role user or the owner role.
- Supabase Auth user creation (`auth.signUp()`) remains in the client. Stored procedures only handle `shared.users` profile rows.
- `last_login_at` is a session-tracking timestamp — updated via a lightweight dedicated procedure called after every login.
- `user_preferences` uses an upsert pattern — a single procedure handles insert-or-update.
- `role_permissions` uses a full-resync (delete-then-insert) pattern in a single atomic transaction.

---

## 2. Stored Procedures

### 2.1 `create_user_atomic`

**Purpose**: Insert a new row into `shared.users` after the client has pre-created the Supabase Auth identity.

**Signature**:
```sql
app.create_user_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,     -- nullable (null = all branches)
  p_user_id     uuid,     -- pre-created Auth UID from supabase.auth.signUp()
  p_name        text,
  p_email       text,
  p_phone       text,
  p_role_id     uuid,
  p_role_name   text,
  p_status      text      -- 'active' | 'inactive'
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, p_branch_id)`
2. `p_role_name ILIKE 'owner'` → reject
3. Email uniqueness within company
4. `p_role_id` must exist in `shared.roles` for this company with status ≠ 'deleted'

**Returns**: `{ success: true, user_id: uuid }`

---

### 2.2 `update_user_atomic`

**Purpose**: Update a user's profile fields (name, phone, email, role, branch, status).

**Signature**:
```sql
app.update_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text,
  p_email       text,
  p_role_id     uuid,
  p_role_name   text,
  p_branch_id   uuid,     -- nullable
  p_status      text
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)` (branch may be null for update)
2. User must exist and belong to company
3. Target user's current `role_name ILIKE 'owner'` → reject
4. `p_role_name ILIKE 'owner'` → reject (cannot assign owner role)
5. `p_role_id` must exist in `shared.roles` for this company

**Returns**: `{ success: true }`

---

### 2.3 `toggle_user_status_atomic`

**Purpose**: Flip a user's status between `active` and `inactive`.

**Signature**:
```sql
app.toggle_user_status_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_new_status  text   -- 'active' | 'inactive'
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)`
2. User must exist and belong to company
3. Target user's `role_name ILIKE 'owner'` → reject

**Returns**: `{ success: true, new_status: text }`

---

### 2.4 `delete_user_atomic`

**Purpose**: Soft-delete a user (sets `status = 'deleted'`).

**Signature**:
```sql
app.delete_user_atomic(
  p_company_id  uuid,
  p_user_id     uuid
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)`
2. User must exist and belong to company
3. Target user's `role_name ILIKE 'owner'` → reject

**Returns**: `{ success: true }`

---

### 2.5 `update_user_last_login_atomic`

**Purpose**: Lightweight session-tracking procedure to update `last_login_at = NOW()`. Can be called by email or by user_id.

**Signature**:
```sql
app.update_user_last_login_atomic(
  p_user_id     uuid    DEFAULT NULL,
  p_email       text    DEFAULT NULL
)
RETURNS jsonb
```

**Guards**:
- Either `p_user_id` or `p_email` must be non-null.
- No tenant access check here (called at login time before full context is established).

**Logic**: Updates by `user_id` if provided, otherwise by `email`.

**Returns**: `{ success: true }`

---

### 2.6 `update_user_profile_name_phone_atomic`

**Purpose**: User self-service update of their own name and phone (called from `profile.js`).

**Signature**:
```sql
app.update_user_profile_name_phone_atomic(
  p_company_id  uuid,
  p_user_id     uuid,
  p_name        text,
  p_phone       text
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)`
2. User must exist and belong to company

**Returns**: `{ success: true }`

> **Note**: This is separate from `update_user_atomic` because profile self-service updates only change name/phone, never role or status.

---

### 2.7 `create_role_atomic`

**Purpose**: Create a new role for a company/branch.

**Signature**:
```sql
app.create_role_atomic(
  p_company_id  uuid,
  p_branch_id   uuid,
  p_role_name   text,
  p_description text
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, p_branch_id)`
2. `p_role_name ILIKE 'owner'` → reject
3. Role name must be unique (case-insensitive) within company for non-deleted roles

**Returns**: `{ success: true, role_id: uuid }`

---

### 2.8 `update_role_atomic`

**Purpose**: Update a role's name and description.

**Signature**:
```sql
app.update_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid,
  p_role_name   text,
  p_description text
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)`
2. Role must exist and belong to company (status ≠ 'deleted')
3. Current `role_name ILIKE 'owner'` → reject
4. New `p_role_name ILIKE 'owner'` → reject
5. Name uniqueness check (excluding self)

**Returns**: `{ success: true }`

---

### 2.9 `delete_role_atomic`

**Purpose**: Soft-delete a role and hard-delete all its `role_permissions` rows.

**Signature**:
```sql
app.delete_role_atomic(
  p_company_id  uuid,
  p_role_id     uuid
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, NULL)`
2. Role must exist and belong to company (status ≠ 'deleted')
3. `role_name ILIKE 'owner'` → reject
4. Active users assigned to this role → reject with count

**Actions** (atomic):
1. `UPDATE shared.roles SET status = 'deleted'`
2. `DELETE FROM shared.role_permissions WHERE role_id = p_role_id`

**Returns**: `{ success: true }`

---

### 2.10 `save_role_permissions_atomic`

**Purpose**: Full atomic resync of permissions for a role (single-row upsert design).

**Signature**:
```sql
app.save_role_permissions_atomic(
  p_company_id      uuid,
  p_branch_id       uuid,
  p_role_id         uuid,
  p_role_name       text,
  p_permission_keys jsonb   -- JSON array of permission strings
)
RETURNS jsonb
```

**Guards**:
1. `verify_tenant_access(p_company_id, p_branch_id)`
2. Role must exist and belong to company (status ≠ 'deleted')
3. `role_name ILIKE 'owner'` → reject

**Logic** (atomic, mirrors `syncRolePermissions()` from client):
1. Check if a row exists in `role_permissions` for `(role_id, company_id)`.
2. If row exists: UPDATE the primary row; DELETE extra rows if any.
3. If no row exists: INSERT one row with the JSON permissions array.

**Returns**: `{ success: true }`

---

### 2.11 `upsert_user_preferences_atomic`

**Purpose**: Create-or-update a user's preferences record.

**Signature**:
```sql
app.upsert_user_preferences_atomic(
  p_user_id       uuid,
  p_company_id    uuid,
  p_branch_id     uuid,     -- nullable
  p_language      text      DEFAULT NULL,
  p_theme         text      DEFAULT NULL,
  p_notifications boolean   DEFAULT NULL
)
RETURNS jsonb
```

**Guards**:
1. `p_user_id` must be non-null.
2. If `p_company_id` is non-null: `verify_tenant_access(p_company_id, NULL)`.

**Logic**:
1. Check if a row exists for `user_id`.
2. If exists: UPDATE only the non-null fields.
3. If not: INSERT with all provided fields.

**Returns**: `{ success: true }`

---

## 3. Procedure Count Summary

| # | Procedure | Replaces Client Mutations |
|---|-----------|--------------------------|
| 1 | `create_user_atomic` | `users.js:622` insert |
| 2 | `update_user_atomic` | `users.js:594` update |
| 3 | `toggle_user_status_atomic` | `users.js:386` update |
| 4 | `delete_user_atomic` | `users.js:401` update |
| 5 | `update_user_last_login_atomic` | `auth-callback.html:146,148`, `script.js:620,624`, `global-auth-guard.js:586` |
| 6 | `update_user_profile_name_phone_atomic` | `profile.js:618` update |
| 7 | `create_role_atomic` | `roles-permissions.js:423` insert |
| 8 | `update_role_atomic` | `roles-permissions.js:409,475` updates |
| 9 | `delete_role_atomic` | `roles-permissions.js:583,592` update+delete |
| 10 | `save_role_permissions_atomic` | `roles-permissions.js:516,532,539` update+delete+insert |
| 11 | `upsert_user_preferences_atomic` | `settings.js:82,94`, `global-auth-guard.js:866`, `notification-manager.js:101` |

**Total**: 11 stored procedures replacing 21 direct client mutations across 8 files.

---

## 4. Migration

**File**: `supabase/migrations/20261103000015_harden_iam_module.sql`

Split into two parts for Supabase Management API size limit:
- **Part A**: Procedures 1–6 (user management)
- **Part B**: Procedures 7–11 (role/permission management)

**Deploy scripts**:
- `scratch/deploy_migration_15a.js`
- `scratch/deploy_migration_15b.js`

