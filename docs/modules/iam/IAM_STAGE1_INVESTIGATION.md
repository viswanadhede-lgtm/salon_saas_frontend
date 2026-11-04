# Module 10: IAM, Users, Roles & Permissions — Stage 1 Investigation

## 1. Overview

The IAM module governs user identity, role definitions, permission assignments, and user preferences. It is the most cross-cutting module in the system — mutations are scattered across authentication flows, settings pages, profile editors, notification managers, and admin UIs.

**Tables involved:**
| Table | Schema | Description |
|-------|--------|-------------|
| `users` | `shared` | Core user identity profiles (not Supabase Auth — that is managed separately) |
| `roles` | `shared` | Role definitions per company/branch |
| `role_permissions` | `shared` | Permission key sets per role (JSON array stored in `permission_key` column) |
| `user_preferences` | `shared` | Per-user UI/notification preferences |

---

## 2. Schema Snapshot

### `shared.users`
| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid PK | Matches Supabase `auth.users.id` |
| `company_id` | uuid | Tenant isolation key |
| `branch_id` | uuid | Nullable — null means "all branches" |
| `name` | text | Display name |
| `email` | text | Login email |
| `phone` | text | Contact phone |
| `password_hash` | text | Not used directly (Supabase Auth handles passwords) |
| `role_id` | uuid FK → `roles` | Current role assignment |
| `role_name` | text | Cached from `roles.role_name` |
| `status` | text | `active`, `inactive`, `deleted` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_login_at` | timestamptz | Updated on every auth event |

### `shared.roles`
| Column | Type | Notes |
|--------|------|-------|
| `role_id` | uuid PK | |
| `company_id` | uuid | Tenant key |
| `branch_id` | uuid | Nullable |
| `role_name` | text | Unique per company |
| `is_default` | boolean | |
| `description` | text | |
| `status` | text | `active`, `deleted` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `shared.role_permissions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `company_id` | uuid | Tenant key |
| `branch_id` | uuid | Nullable |
| `role_id` | uuid FK → `roles` | |
| `role_name` | text | Cached role name |
| `permission_key` | text/jsonb | JSON-encoded array of permission strings |
| `status` | text | `active` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Key pattern**: Exactly ONE `role_permissions` row per role (single-row design). `permission_key` stores a JSON array `["feature_a", "feature_b", ...]`.

### `shared.user_preferences`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → `users` | |
| `company_id` | uuid | |
| `branch_id` | uuid | Nullable |
| `language` | text | |
| `theme` | text | |
| `notifications` | boolean | Whether notifications are enabled |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## 3. Pre-Existing Stored Procedures

**Zero IAM-specific procedures exist** in `app` or `public` schemas at the time of this investigation.

The only related routine is:
- `admin_update_user_password(target_user_id, new_password)` — calls Supabase's internal password management API. This procedure is **not** an IAM profile procedure and is called correctly via RPC already. It stays as-is.

---

## 4. Complete Mutation Inventory

### Grouped by File

#### `auth-callback.html` (Lines 141–157, 143–155)
- `supabase.from('users').update({ last_login_at })` — called twice (by email fallback or by user_id) on every login via OAuth callback.

#### `script.js` (Lines 614–626)
- `supabase.from('users').update({ last_login_at })` — same last_login_at tracking on direct login flow. Same two-path pattern (email or user_id).

#### `scripts/global-auth-guard.js` (Lines 584–588, 866–876)
- Line 586: `supabase.from('users').update({ last_login_at })` — after app context loads.
- Line 866–876: `supabase.from('user_preferences').upsert({ user_id, company_id, branch_id })` — when user switches branch.

#### `scripts/app-layout/profile.js` (Lines 618–621)
- `supabase.from('users').update({ name, phone })` — user editing their own profile name/phone.

#### `scripts/app-layout/settings.js` (Lines 82–105)
- If record exists: `supabase.from('user_preferences').update({ language, theme, notifications })`.
- Else: `supabase.from('user_preferences').insert([{ user_id, company_id, branch_id, language, theme, notifications }])`.

#### `scripts/notification-manager.js` (Lines 113–122)
- `supabase.from('user_preferences').upsert({ user_id, company_id, branch_id, notifications })` — toggling notification snooze.

#### `users.js` (Lines 386–413, 592–650)
| Line | Action | Table | Details |
|------|--------|-------|---------|
| 386 | toggle | `users` | `status = active/inactive` |
| 401 | soft-delete | `users` | `status = deleted` |
| 594 | update | `users` | Full profile update on edit modal save |
| 622 | insert | `users` | New user row after `supabase.auth.signUp()` |

#### `roles-permissions.js` (Lines 409–610)
| Line range | Action | Table | Details |
|------------|--------|-------|---------|
| 409 | update | `roles` | Update role metadata (name, description) |
| 423 | insert | `roles` | Create new role |
| 475 | update | `roles` | Bump `updated_at` on inline permission save |
| 516 | update | `role_permissions` | Update primary permission row |
| 532 | delete | `role_permissions` | Clean up extra duplicate rows |
| 539 | insert | `role_permissions` | Insert first permission row for new role |
| 583 | update | `roles` | Soft-delete role (`status = deleted`) |
| 592 | delete | `role_permissions` | Remove all permission rows for deleted role |

#### `payment-result.js` (Line 122)
- `supabase.from('users').update({ phone })` — **Subscription onboarding**: backfills phone into `users` and `profiles` after Google OAuth subscription flow. Classified as **Module 12 (SaaS Billing)**, not Module 10.

---

## 5. Business Rules Extracted

| Rule | Source |
|------|--------|
| Owner role is immutable — cannot be modified, deleted, or assigned to other users | `users.js`, `roles-permissions.js` |
| User creation always requires a Supabase Auth user to be pre-created by the client | `users.js` |
| Password management uses `admin_update_user_password` RPC — not direct column write | `users.js` |
| `role_permissions` stores exactly ONE row per role with a JSON array | `syncRolePermissions()` in `roles-permissions.js` |
| `last_login_at` is set by both `auth-callback.html` and `global-auth-guard.js` using email OR user_id lookup | Both files |
| User preferences are upserted (create-or-update) with `user_id` as the conflict key | `settings.js`, `global-auth-guard.js`, `notification-manager.js` |
| Soft-delete pattern: `status = 'deleted'` for both `users` and `roles` | `users.js`, `roles-permissions.js` |

---

## 6. Total Mutation Count

**21 direct client-side mutations** must be eliminated across 8 files (excluding `payment-result.js` which defers to Module 12).

**Files requiring refactoring:**
1. `auth-callback.html` — 2 mutations
2. `script.js` — 2 mutations
3. `scripts/global-auth-guard.js` — 2 mutations
4. `scripts/app-layout/profile.js` — 1 mutation
5. `scripts/app-layout/settings.js` — 2 mutations
6. `scripts/notification-manager.js` — 1 mutation
7. `users.js` — 4 mutations
8. `roles-permissions.js` — 8 mutations

