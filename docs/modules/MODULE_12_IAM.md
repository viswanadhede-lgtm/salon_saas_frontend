# Module 12: IAM / Users & Roles — Interaction & Backend Execution Map

## 1. Module Overview & Architecture

The **Identity and Access Management (IAM)** suite spans User Management (`users.html`, `users.js`) and Role-Based Access Control (`roles-permissions.html`, `roles-permissions.js`). It coordinates system authentication, credential provisioning, branch scoping, and granular authorization down to individual sub-features.

### Core Architectural Principles
- **Zero-Trust Frontend / Authoritative Backend**: All mutations (user creation, profile updates, account activation/deactivation, deletions, role creation, role updates, role deletions, and permissions persistence) route exclusively to PostgreSQL `SECURITY DEFINER` stored procedures.
- **Tenant Isolation**: Every RPC executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
- **Protected "Owner" Role**: The system hard-codes safeguards preventing the creation, modification, deletion, deactivation, or assignment of the `Owner` role. Both backend triggers and frontend UI disable action controls on owner profiles.
- **SaaS Resource Limit Safeguards**: User creation is gated by `checkResourceLimit('max_users')`. If tenant capacity is reached, modal creation is blocked and the plan limit upgrade modal (`showPlanLimitModal`) is displayed.
- **Two-Phase User Provisioning**:
  1. *Authentication Phase*: Real user is created via Supabase Auth (`supabase.auth.signUp()`) returning an authoritative `auth.uid()`.
  2. *Tenant Profile Phase*: User record is created in `shared.users` via `public.create_user_atomic()` linked directly to the `auth.uid()`.

---

## 2. Users Management (`users.html`, `users.js`)

### 2.1 Header & Page Actions

| Element Selector / Event | UI Label / Icon | Trigger / Action | Frontend Behavior | Backend / RPC Execution | RBAC / Sub-Feature Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#btnAddUser`<br>`click` | `<i data-feather="plus"></i> Add User` | Click | 1. Evaluates `await checkResourceLimit('max_users')`.<br>2. If limit reached: calls `showPlanLimitModal(limitCheck)`.<br>3. If allowed: resets form, sets `editingId = null`, opens modal (`#userModalOverlay.active`). | Checks subscription user capacity against `platform.company_subscriptions`. | `data-sub-feature="user_create"` |

---

### 2.2 Users Data Table & Row Actions

| Column / Element | Selector | UI Representation & Behavior | Backend Value / Source |
| :--- | :--- | :--- | :--- |
| **Name** | `td:nth-child(1)` | User's full name + dynamic avatar circle with name initials + purple badge `You` if matching current logged-in user. | `shared.users.name`, `shared.users.user_id` |
| **Email** | `td:nth-child(2)` | User's system login email address. | `shared.users.email` |
| **Role** | `td:nth-child(3)` | Color-coded role pill with status dot:<br>- Owner: `bg: #fef2f2, color: #991b1b`<br>- Admin: `bg: #eff6ff, color: #1e40af`<br>- Manager: `bg: #fffbeb, color: #92400e`<br>- Receptionist: `bg: #f1f5f9, color: #475569`<br>- Staff: `bg: #f0fdf4, color: #166534` | `shared.users.role_name` mapped against `shared.roles` |
| **Branch** | `td:nth-child(4)` | Assigned branch name or "All Branches" (if `branch_id === null` or `'all'`). | `shared.users.branch_id` mapped against `shared.branches` |
| **Status** | `td:nth-child(5)` | Status pill with dot indicator:<br>- Active: `bg: #dcfce7, color: #166534`<br>- Inactive: `bg: #f1f5f9, color: #475569` | `shared.users.status` |
| **Last Login** | `td:nth-child(6)` | Two-line display: Weekday name on line 1, `HH:mm, DD-MM-YYYY` on line 2 (or `Never` if null). | `shared.users.last_login_at` |
| **Actions (Protected Owner)** | `td:nth-child(7)` | If user role is `Owner`: renders 3 disabled buttons (Edit, Deactivate, Delete) with tooltip "Owner is a protected role" and 60% opacity. | None (Hard-blocked) |
| **Actions: Edit** | `button[data-sub-feature="user_update"]`<br>`click` | Invokes `window.userAction('edit', userId)`. Opens `#userModalOverlay` in edit mode. Pre-populates all form inputs. Password label switches to "Update Password (Leave blank to keep unchanged)". | Pure modal state setup. |
| **Actions: Deactivate / Activate** | `button[data-sub-feature="user_update"]`<br>`click` | Invokes `window.userAction('toggle', userId)`. Computes target status (`active` vs `inactive`). | Calls `public.toggle_user_status_atomic(p_company_id, p_user_id, p_new_status)`. |
| **Actions: Delete** | `button[data-sub-feature="user_delete"]`<br>`click` | Invokes `window.userAction('delete', userId)`. Opens custom glassmorphic confirmation modal (`showDeleteConfirmModal`). On confirm: executes atomic soft delete. | Calls `public.delete_user_atomic(p_company_id, p_user_id)`. Calls `refreshUsageCounter('max_users')`. |

---

### 2.3 Add / Edit User Modal (`#userModalOverlay`)

- **DOM Elements**:
  - Container / Backdrop: `#userModalOverlay`, `#userModal` (max-width 1040px, 2-column layout: Identity vs Access Control).
  - Inputs (Identity):
    - Full Name: `#uFullName` (required)
    - Email Address: `#uEmail` (required)
    - Phone Number: `#uPhone` (optional)
    - Password: `#uPassword` with eye toggle button `#togglePasswordVisibility` (switches `type="password"` vs `type="text"`).
  - Inputs (Access Control):
    - Role Select: `#uRole` (populates from `shared.roles`; disables `Owner (Protected)`).
    - Branch Select: `#uBranch` (populates from `shared.branches`, includes "All Branches / Remote").
    - Status Switch: `#uStatus` (toggle checkbox: checked = `active`, unchecked = `inactive`).
  - Buttons:
    - Cancel: `#btnCancelUser`, `#closeUserModal`
    - Submit: `#btnSaveUser`

#### Modal Submission Workflow (`btnSaveUser`):
1. **Frontend Validation**: Verifies `name`, `email`, `role_id`, and `branch_v` are provided. For new users, verifies `password` is entered.
2. **Owner Role Guard**: If selected role is `Owner`, aborts submission with error toast.
3. **Execution Routing**:
   - **Case A: Create User (`editingId === null`)**:
     1. Re-verifies plan capacity via `checkResourceLimit('max_users')`.
     2. Calls Supabase Auth API:
        ```typescript
        const authRes = await supabase.auth.signUp({
            email: payload.email,
            password: password,
            data: { full_name: payload.name, phone: payload.phone }
        });
        ```
     3. Calls Authoritative Profile Procedure with returned `authUserId`:
        ```typescript
        const { data, error } = await supabase.rpc('create_user_atomic', {
            p_company_id: payload.company_id,
            p_branch_id:  payload.branch_id,
            p_user_id:    authUserId,
            p_name:       payload.name,
            p_email:      payload.email,
            p_phone:      payload.phone,
            p_role_id:    payload.role_id,
            p_role_name:  payload.role_name,
            p_status:     payload.status
        });
        ```
     4. Refreshes plan usage counter `refreshUsageCounter('max_users')`.
   - **Case B: Edit User (`editingId !== null`)**:
     1. If new password provided: invokes `admin_update_user_password(target_user_id, new_password)`.
     2. Calls Authoritative Update Procedure:
        ```typescript
        const { data, error } = await supabase.rpc('update_user_atomic', {
            p_company_id: cid,
            p_user_id:    editingId,
            p_name:       payload.name,
            p_phone:      payload.phone,
            p_email:      payload.email,
            p_role_id:    payload.role_id,
            p_role_name:  payload.role_name,
            p_branch_id:  payload.branch_id,
            p_status:     payload.status
        });
        ```

---

## 3. Roles & Permissions Management (`roles-permissions.html`, `roles-permissions.js`)

### 3.1 2-Column Interface Layout

1. **Left Sidebar — Roles Directory (`#rolesList`)**:
   - Lists active company roles with user counts (`#roleCountBadge`).
   - Active role indicator (`.role-list-item.active`).
   - Quick action buttons (Edit `#btnEditRole`, Delete `#btnDeleteRole`) rendered on hover for non-default roles.
2. **Right Pane — Permissions Matrix (`#permissionsMatrixBody`)**:
   - Header details: Selected role name (`#selectedRoleTitle`), description (`#selectedRoleDesc`).
   - Protected Badge: `#ownerBadgeWrapper` displays `Protected Role` for Owner.
   - Header Actions: `#roleActionsWrapper` renders Save, Edit, and Delete buttons for custom roles.
   - Matrix Table: Renders all system modules from `feature-registry.js`.
     - Feature Access Checkbox (`.feature-check` with `data-feature`).
     - Granular Action Checkboxes (`.sub-feature-check` with `data-sub-feature` and `data-parent`).

---

### 3.2 Interactive Controls & Workflows

| Element Selector / Event | UI Action | Trigger / Function | Frontend Behavior | Backend / RPC Execution |
| :--- | :--- | :--- | :--- | :--- |
| `#btnAddRole`<br>`click` | Header Button | `openAddRoleModal()` | Sets `editingRoleId = null`. Resets modal inputs. Generates blank permissions matrix. Opens `#roleModalOverlay`. | None |
| `#rolesList li`<br>`click` | Role Item Click | `selectRole(roleId)` | Highlights selected role, updates header title/desc, renders permissions matrix checkboxes matching role's `permission_key`. | Local state update. |
| `.feature-check`<br>`change` | Module Access Toggle | Change event | When checked: automatically checks all child `.sub-feature-check` inputs. When unchecked: unchecks all child sub-features. Reveals `#btnSavePermsHeader`. | Prepares permissions payload. |
| `.sub-feature-check`<br>`change` | Granular Action Toggle | Change event | When checked: automatically checks parent `.feature-check`. Reveals `#btnSavePermsHeader`. | Prepares permissions payload. |
| `#btnSavePermsHeader`<br>`click` | Header Save Button | `saveInlinePerms()` | Collects all checked feature and sub-feature keys into JSON array `permission_key`. | Calls `public.save_role_permissions_atomic(p_company_id, p_branch_id, p_role_id, p_role_name, p_permission_keys)`. |
| `#btnEditRole`<br>`click` | Header Edit Button | `openEditRoleModal(activeRoleId)` | Sets `editingRoleId`. Loads role name, description, and permissions into `#roleModalOverlay`. | None |
| `#btnDeleteRole`<br>`click` | Header Delete Button | `openDeleteConfirm(activeRoleId)` | Sets `#deleteRoleNameDisplay`, reveals `#confirmDeleteOverlay`. | None |
| `#btnConfirmDelete`<br>`click` | Modal Confirm Delete | `confirmDelete()` | Initiates delete procedure. Safeguard: backend blocks deletion if active users are assigned! | Calls `public.delete_role_atomic(p_company_id, p_role_id)`. Soft-deletes role and hard-deletes `shared.role_permissions`. |

---

### 3.3 Add / Edit Role Modal (`#roleModalOverlay`)

- **DOM Elements**:
  - Modal container: 30% Role Details (Left) + 70% Permissions Matrix (Right).
  - `#roleNameInput`: Text input for role name (Owner is blocked).
  - `#roleDescInput`: Textarea for role description.
  - `#modalPermissionsBody`: Dynamic permissions matrix table for configuring privileges.
  - `#btnSaveRole`: Save button.
  - `#btnCancelRoleModal`, `#btnCloseRoleModal`: Dismiss modal.

#### Role Save Execution (`saveRole`):
1. **Validation**: Verifies `roleNameInput` is not blank.
2. **Collects Permissions**: Gathers all checked `.feature-check` and `.sub-feature-check` keys.
3. **Database Mutation**:
   - If Edit: Calls `public.update_role_atomic(p_company_id, p_role_id, p_role_name, p_description)`.
   - If Create: Calls `public.create_role_atomic(p_company_id, p_branch_id, p_role_name, p_description)` returning `v_new_role_id`.
4. **Permissions Synchronization**:
   Calls `public.save_role_permissions_atomic`:
   ```typescript
   await supabase.rpc('save_role_permissions_atomic', {
       p_company_id:      companyId,
       p_branch_id:       branchId,
       p_role_id:         roleId,
       p_role_name:       name,
       p_permission_keys: permissionKeys
   });
   ```

---

## 4. Master IAM Stored Procedures & Schemas

### 4.1 `app.create_user_atomic`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_user_id uuid, p_name text, p_email text, p_phone text, p_role_id uuid, p_role_name text, p_status text)`
- **Protections**:
  - Enforces `shared.verify_tenant_access`.
  - Blocks assignment if `LOWER(p_role_name) = 'owner'`.
  - Enforces email uniqueness across company: `LOWER(email) = LOWER(p_email) AND status <> 'deleted'`.
  - Verifies target `role_id` exists and is not deleted.
- **Table Modified**: `INSERT INTO shared.users`.

### 4.2 `app.update_user_atomic`
- **Parameters**: `(p_company_id uuid, p_user_id uuid, p_name text, p_phone text, p_email text, p_role_id uuid, p_role_name text, p_branch_id uuid, p_status text)`
- **Protections**:
  - Blocks modification if user's current role is `Owner`.
  - Blocks assigning `Owner` role.
  - Verifies new `role_id` exists.
- **Table Modified**: `UPDATE shared.users SET name, phone, email, role_id, role_name, branch_id, status, updated_at = NOW()`.

### 4.3 `app.toggle_user_status_atomic`
- **Parameters**: `(p_company_id uuid, p_user_id uuid, p_new_status text)`
- **Protections**: Validates status in `('active', 'inactive')`. Blocks modification if user is `Owner`.
- **Table Modified**: `UPDATE shared.users SET status = p_new_status, updated_at = NOW()`.

### 4.4 `app.delete_user_atomic`
- **Parameters**: `(p_company_id uuid, p_user_id uuid)`
- **Protections**: Blocks deletion if target is `Owner`.
- **Table Modified**: `UPDATE shared.users SET status = 'deleted', updated_at = NOW()`.

### 4.5 `app.create_role_atomic`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_role_name text, p_description text)`
- **Protections**: Blocks role name `owner`. Enforces role name uniqueness in company.
- **Table Modified**: `INSERT INTO shared.roles`.

### 4.6 `app.update_role_atomic`
- **Parameters**: `(p_company_id uuid, p_role_id uuid, p_role_name text, p_description text)`
- **Protections**: Blocks modifying `Owner` role. Blocks renaming any role to `owner`. Enforces name uniqueness.
- **Table Modified**: `UPDATE shared.roles SET role_name, description, updated_at = NOW()`.

### 4.7 `app.delete_role_atomic`
- **Parameters**: `(p_company_id uuid, p_role_id uuid)`
- **Protections**:
  - Blocks deleting `Owner` role.
  - **Active Users Blocker**: `SELECT COUNT(*) FROM shared.users WHERE role_id = p_role_id AND status = 'active'`. Raises exception if $>0$ active users are assigned!
- **Tables Modified**:
  - `UPDATE shared.roles SET status = 'deleted', updated_at = NOW()`
  - `DELETE FROM shared.role_permissions WHERE role_id = p_role_id`

### 4.8 `app.save_role_permissions_atomic`
- **Parameters**: `(p_company_id uuid, p_branch_id uuid, p_role_id uuid, p_role_name text, p_permission_keys jsonb)`
- **Protections**: Blocks modifying permissions of `Owner` role.
- **Tables Modified**: Upserts single consolidated row in `shared.role_permissions` storing permissions JSON array; cleans up any legacy duplicates.

