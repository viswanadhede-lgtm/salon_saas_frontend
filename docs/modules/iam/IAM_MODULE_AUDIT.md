# Module 10: IAM, Users, Roles & Permissions — Module Audit

## Status: ✅ COMPLETE

**Migration**: `20261103000015a_harden_iam_users.sql` + `20261103000015b_harden_iam_roles.sql`  
**Tests**: `scratch/run_test_iam_v2.js` → **23/23 PASSED**  
**Audit**: `scratch/audit_iam_mutations.js` → **0 violations**

---

## Stored Procedures Deployed

| # | Procedure | Schema | Purpose |
|---|-----------|--------|---------|
| 1 | `create_user_atomic` | `app` + `public` | Create user profile after Supabase Auth signUp |
| 2 | `update_user_atomic` | `app` + `public` | Update user metadata (name, email, phone, role, status) |
| 3 | `toggle_user_status_atomic` | `app` + `public` | Flip user active/inactive status |
| 4 | `delete_user_atomic` | `app` + `public` | Soft-delete user (status = 'deleted') |
| 5 | `update_user_last_login_atomic` | `app` + `public` | Update `last_login_at` by user_id or email |
| 6 | `update_user_profile_name_phone_atomic` | `app` + `public` | Self-service profile name/phone update |
| 7 | `create_role_atomic` | `app` + `public` | Create new role |
| 8 | `update_role_atomic` | `app` + `public` | Update role name/description |
| 9 | `delete_role_atomic` | `app` + `public` | Soft-delete role + cascade-delete permissions |
| 10 | `save_role_permissions_atomic` | `app` + `public` | Full atomic resync of role permissions (single-row design) |
| 11 | `upsert_user_preferences_atomic` | `app` + `public` | Create-or-update user preferences |

**Total**: 11 procedures × 2 schemas = 22 functions deployed

---

## Test Results

```
[PASS] T1:  create_role_atomic (valid)
[PASS] T2:  Duplicate role name rejected
[PASS] T3:  Owner role name rejected
[PASS] T4:  update_role_atomic
[PASS] T5:  save_role_permissions_atomic (insert path)
[PASS] T6:  save_role_permissions_atomic (update path)
[PASS] T7:  create_user_atomic (valid)
[PASS] T8:  Duplicate email rejected
[PASS] T9:  Owner role assignment rejected
[PASS] T10: update_user_atomic
[PASS] T11: toggle_user_status_atomic
[PASS] T12: Owner user modification rejected
[PASS] T13: update_user_last_login_atomic by user_id
[PASS] T14: update_user_profile_name_phone_atomic
[PASS] T15: upsert_user_preferences_atomic (upsert-create path)
[PASS] T16: upsert_user_preferences_atomic (update path)
[PASS] T16b: Preferences verified in DB (theme=dark, notifications=false)
[PASS] T17: delete_role with active users rejected
[PASS] T18: delete_user_atomic
[PASS] T18b: User status verified as deleted in DB
[PASS] T19: delete_role_atomic succeeded
[PASS] T19b: role_permissions cascade-deleted
[PASS] T20: Tenant isolation enforced

MODULE 10 IAM RESULTS: 23 passed, 0 failed out of 23 tests
✅ ALL TESTS PASSED
```

---

## Frontend Refactoring

| File | Mutations Eliminated | Action |
|------|---------------------|--------|
| `users.js` | 4 | `toggle/delete` → RPCs; `update/insert` → RPCs |
| `roles-permissions.js` | 8 | All `roles`/`role_permissions` mutations → RPCs; `syncRolePermissions()` rewritten |
| `auth-callback.html` | 2 | `users.update(last_login_at)` → `update_user_last_login_atomic` |
| `script.js` | 2 | `users.update(last_login_at)` → `update_user_last_login_atomic` |
| `scripts/app-layout/profile.js` | 1 | `users.update(name, phone)` → `update_user_profile_name_phone_atomic` |
| `scripts/app-layout/settings.js` | 2 | `user_preferences.update/insert` → `upsert_user_preferences_atomic` |
| `scripts/global-auth-guard.js` | 2 | `users.update(last_login)` → RPC; `user_preferences.upsert` → RPC |
| `scripts/notification-manager.js` | 1 | `user_preferences.upsert` → `upsert_user_preferences_atomic` |

**Total eliminated**: 22 direct table mutations across 8 files  
**Deferred to Module 12**: `payment-result.js:122` (phone backfill — subscription onboarding flow)

---

## Zero-Mutation Audit

```
[CLEAN] users.js
[CLEAN] roles-permissions.js
[CLEAN] script.js
[CLEAN] auth-callback.html
[CLEAN] scripts/app-layout/profile.js
[CLEAN] scripts/app-layout/settings.js
[CLEAN] scripts/global-auth-guard.js
[CLEAN] scripts/notification-manager.js
[DEFERRED-M12] payment-result.js:122 — Module 12 scope

✅ PERFECT: 0 direct IAM table mutations found (non-M12 scope).
```

---

## Business Rules Enforced at Database Level

| Rule | Enforced In |
|------|------------|
| Owner role cannot be created, assigned, or modified | All user/role procedures |
| Owner users cannot be toggled, updated, or deleted | `toggle_user_status_atomic`, `update_user_atomic`, `delete_user_atomic` |
| Cannot delete role with active users | `delete_role_atomic` |
| Duplicate email per company rejected | `create_user_atomic` |
| Duplicate role name (case-insensitive) per company rejected | `create_role_atomic`, `update_role_atomic` |
| All procedures validate tenant context first | `shared.verify_tenant_access()` guard |
| `role_permissions` cascade-deleted when role is deleted | `delete_role_atomic` |
| User preferences upsert is idempotent (insert-or-update) | `upsert_user_preferences_atomic` |

