# Module 07 — Staff & Scheduling: End-to-End Interaction & Architecture Specification

> **Module Identity**: Staff Management, Staff Scheduling & Branch Operating Hours  
> **Route / Files**: `staff.html`, `staff.js`, `staff-schedule.html`, `scripts/staff-schedule.js`, `scripts/staff-schedule/*`, `settings-hours.html`, `scripts/settings-hours.js`  
> **Architecture Standard**: Zero-Trust Frontend / Authoritative Backend-First Standard  
> **Database Schemas**: `app` (Storage & Logic), `public` (API Interface Layer), `shared` (Tenant Context & Row-Level Security), `platform` (Subscriptions & Plan Quotas)

---

## 1. Module Overview & Architectural Principles

Module 07 provides the complete human capital and workforce operations engine for the salon SaaS:
1. **Staff Directory (`app.staff`)**: Profiles, skill specializations, contact information, role assignments, active/leave statuses, and soft deletion.
2. **Staff Scheduling (`app.staff_schedule`)**: Shift calendars, multi-week pattern builder, day-level working hours, off-duty assignments, and monthly schedule overhauls.
3. **Branch Operating Hours (`app.business_hours`)**: 7-day branch weekly opening/closing hours, providing the foundational operational boundary for all appointment bookings and staff availability.

### Hardening Standards & Zero-Trust Backend Enforcement
* **Plan Quota Guard**: Staff creation checks `platform.plan_limits` (`limit_key = 'max_staff'`) on the authoritative backend before accepting inserts.
* **Phone Collision Guard**: Enforces branch-level phone deduplication normalized to digits (`regexp_replace(phone, '[^0-9]', '', 'g')`).
* **Active Booking Dependency Guard**: Soft-deleting staff or assigning off-duty shifts / deleting schedules is strictly blocked if active appointments (`status IN ('booked', 'confirmed')`) exist within the target timeframe.
* **Single-Transaction Atomic Overwrites**: Staff monthly schedules replace future entries in a single ACID transaction (`save_staff_schedule_atomic`), eliminating data loss from detached delete/insert operations.
* **Operating Hours Time-Sanity Check**: Branch hours require `opening_time < closing_time` for any day marked open.

---

## 2. Global Tenant Context & Security Pre-Flight

Every interaction and stored procedure in Module 07 enforces strict tenant isolation:
```sql
PERFORM shared.verify_tenant_access(p_company_id, p_branch_id);
```
Tenant identifiers are resolved on the frontend via:
* `p_company_id`: `localStorage.getItem('company_id')` or `appContext.company.id`
* `p_branch_id`: `localStorage.getItem('active_branch_id')` or `document.getElementById('branchSelect')?.value`

All mutating RPCs execute as `SECURITY DEFINER` with fixed `search_path = platform, shared, app, public, pg_temp`. Direct `INSERT`, `UPDATE`, and `DELETE` access to `app.staff`, `app.staff_schedule`, and `app.business_hours` is completely disabled for client roles (`anon`, `authenticated`).

---

## 3. Staff Directory (`staff.html` & `staff.js`)

### 3.1 Page Header & Navigation Controls

```
+-------------------------------------------------------------------------------------------------------------+
| Staff                                                                                                       |
| Manage your salon team                                                                                      |
|                                                                                                             |
| [ Search by name or phone... ]  [ Filter v ]  [ + Add Staff ]                                                |
+-------------------------------------------------------------------------------------------------------------+
```

#### 3.1.1 Search Bar Input
* **Element Identity**: `<input type="text" id="staffSearchInput" placeholder="Search by name or phone...">`
* **Event**: `input`
* **Frontend Behavior**:
  * Captures query string `q = this.value.toLowerCase()`.
  * Performs instant client-side substring matching on `liveStaffData`:
    ```javascript
    const filtered = liveStaffData.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.phone.includes(q) || 
        (s.email && s.email.toLowerCase().includes(q))
    );
    renderStaffTable(filtered);
    ```
* **Backend Invocations**: None (operates on cached memory dataset).
* **Security & Sanitization**: Substring search, no raw HTML injection; table cells sanitized via text interpolation.

---

#### 3.1.2 Filter Dropdown Menu
* **Trigger Button**: `<button class="btn btn-secondary" id="btnStaffFilter">`
* **Dropdown Menu Container**: `<div class="filter-menu" id="staffFilterMenu">`
* **Interactive Elements Inside Filter Menu**:
  1. **All Staff Master Checkbox** (`#filterStaffAll`):
     * When toggled, sets all `.filter-staff-status` checkboxes (`active`, `on-leave`, `inactive`) to match its checked state.
  2. **Individual Status Checkboxes** (`.filter-staff-status`):
     * Checkboxes for `value="active"`, `value="on-leave"`, `value="inactive"`.
     * Toggling any checkbox automatically re-evaluates `#filterStaffAll` state.
  3. **Reset Button** (`#btnStaffFilterReset`):
     * Re-checks all checkboxes (`active`, `on-leave`, `inactive`, `all`).
     * Invokes `renderStaffTable(liveStaffData)`.
     * Closes dropdown menu.
  4. **Apply Button** (`#btnStaffFilterApply`):
     * Gathers checked status values:
       ```javascript
       const checkedStatuses = Array.from(statusCheckboxes)
           .filter(cb => cb.checked)
           .map(cb => cb.value);
       const filtered = liveStaffData.filter(s => checkedStatuses.includes(s.status));
       renderStaffTable(filtered);
       ```
     * Closes dropdown menu.

---

#### 3.1.3 "Add Staff" Action Button
* **Element Identity**: `<button class="qa-btn qa-primary" id="btnAddStaff" data-sub-feature="create_staff">`
* **RBAC Gate**: `data-sub-feature="create_staff"` (evaluated via `sub-feature-gate.js` against user permissions).
* **Event**: `click`
* **Frontend Workflow**:
  1. Calls `checkResourceLimit('max_staff')`.
  2. If the current staff count reaches or exceeds the subscription limit, triggers `showPlanLimitModal(limitCheck)` and halts execution.
  3. If allowed, opens `#addStaffModal` by adding class `.active`.
* **Backend Invocations**: Reads `platform.plan_limits` and counts non-deleted staff.

---

### 3.2 Dynamic KPI Stat Cards

Four metric cards populate directly below the header:

| Stat Card DOM Element | Label | Computation / Source |
|---|---|---|
| `<div id="statTotalStaff">` | Total Staff | `statsObj.total_staff` or `staffArray.length` |
| `<div id="statActiveStaff">` | Active Staff | `statsObj.active_staff` or count where `status == 'active'` |
| `<div id="statOnLeave">` | On Leave Today | `statsObj.on_leave_today` or count where `status == 'on-leave'` |
| `<div id="statOnDuty">` | On Duty Today | `statsObj.on_duty_today` or count where `status == 'active'` |

* **Data Fetching RPC/Query**:
  ```javascript
  const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('company_id', company_id)
      .eq('branch_id', branch_id)
      .neq('status', 'deleted')
      .order('staff_name', { ascending: true });
  ```

---

### 3.3 Staff Table & Row Actions (`#staffTable`)

Table columns: `Staff (Name, Joined Date)`, `Contact (Phone, Email)`, `Specialization`, `Status Badge`, `Actions`.

#### 3.3.1 Staff Name Profile Link
* **Element**: `<span class="customer-link" onclick="window.viewStaffProfile('${s.id}')">`
* **Frontend Action**: Triggers `window.viewStaffProfile(id)`, presenting overview modal stub (`Coming soon — tabs: Overview, Services, Schedule, Bookings, Revenue`).

#### 3.3.2 Status Badge Styles
* `active`: Green pill (`#d1fae5`, text `#065f46`)
* `on-leave`: Amber pill (`#fef9c3`, text `#92400e`)
* `inactive`: Gray pill (`#f1f5f9`, text `#64748b`)

#### 3.3.3 Edit Staff Row Button
* **Element**:
  ```html
  <button class="hover-lift" onclick="window.editStaff('${s.id}')" data-sub-feature="update_staff" title="Edit Staff">
      <svg>...</svg>
      <span>Edit</span>
  </button>
  ```
* **RBAC Gate**: `data-sub-feature="update_staff"`.
* **Frontend Workflow**:
  1. Finds target staff object from `liveStaffData`.
  2. Pre-populates `#editStaffModal` form fields (`#editStaffId`, `#editSfName`, `#editSfPhone`, `#editSfEmail`, `#editSfServices`, `#editSfNotes`, status radio buttons).
  3. Displays modal (`#editStaffModal.classList.add('active')`).

#### 3.3.4 Delete Staff Row Button
* **Element**:
  ```html
  <button class="hover-lift" onclick="window.deleteStaff('${s.id}')" data-sub-feature="delete_staff" title="Delete Staff">
      <svg>...</svg>
      <span>Delete</span>
  </button>
  ```
* **RBAC Gate**: `data-sub-feature="delete_staff"`.
* **Frontend Workflow**:
  1. Sets global pointer `staffToDelete = staff`.
  2. Displays confirmation modal (`#deleteStaffConfirmOverlay.classList.add('active')`).

---

### 3.4 Staff Modals & Database Mutations

#### 3.4.1 Add Staff Modal (`#addStaffModal`)

```
+-------------------------------------------------------------------------------------------------------------+
| Add Staff Member                                                                                        [X] |
| Fill in the details to add a new team member.                                                               |
+-------------------------------------------------------------------------------------------------------------+
| Full Name *                 [ e.g. Sarah Johnson               ]                                            |
| Phone *                     [ 9876543210 (10 digits)           ]                                            |
| Email                       [ staff@salon.com                  ]                                            |
| Role                        [ Staff (Read-only)                ]                                            |
| Specialized in              [ e.g. Haircut, Color, Styling     ]                                            |
| Notes                       [ Any additional notes...          ]                                            |
| Status                      (o) Active   ( ) On Leave   ( ) Inactive                                        |
+-------------------------------------------------------------------------------------------------------------+
|                                                          [ Cancel ] [ Save Staff ]                          |
+-------------------------------------------------------------------------------------------------------------+
```

* **Form Selector**: `<form id="addStaffForm">`
* **Close Triggers**: `#btnCloseAddStaffModal`, `#btnCancelAddStaff`, outside backdrop click.
* **Validation Guards**:
  * Phone regex check: exactly 10 digits required (`pattern="[0-9]{10}"`).
  * Client phone duplicate check against `liveStaffData`.
* **Submit Action**: Calls authoritative procedure `public.create_staff_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('create_staff_atomic', {
      p_company_id: company_id,
      p_branch_id: branch_id,
      p_staff_name: staffNameVal,
      p_phone: phoneVal,
      p_email: document.getElementById('sfEmail').value.trim() || null,
      p_role_name: 'Staff',
      p_services_offered: document.getElementById('sfServices').value.trim() || null,
      p_notes: document.getElementById('sfNotes').value.trim() || null,
      p_status: document.querySelector('input[name="sfStatus"]:checked')?.value || 'active'
  });
  ```
* **Backend Execution Logic (`app.create_staff_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Validates non-empty name and phone (minimum 7 digits normalized).
  3. Validates status (`'active'` or `'inactive'`).
  4. Checks `platform.subscriptions` + `platform.plan_limits` for `limit_key = 'max_staff'`. Rejects if count >= limit:
     `'Maximum staff limit (X) reached for your subscription plan. Please upgrade your plan to add more staff.'`
  5. Enforces normalized phone deduplication in branch:
     `'Another staff member already uses this phone number.'`
  6. Inserts into `app.staff` with `status`, `joined_at = CURRENT_DATE`.
  7. Returns `{ success: true, staff_id: uuid, staff_name: text, status: text }`.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Staff member added successfully"`.
  * Calls `refreshUsageCounter('max_staff')`.
  * Emits event notification `evt_staff_added`: `"New Staff Added: [Name] has been added to the team."`
  * Closes modal, resets form, and calls `window.fetchStaff()`.

---

#### 3.4.2 Edit Staff Modal (`#editStaffModal`)
* **Form Selector**: `<form id="editStaffForm">`
* **Close Triggers**: `#btnCloseEditStaffModal`, `#btnCancelEditStaff`, outside backdrop click.
* **Submit Action**: Calls authoritative procedure `public.update_staff_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('update_staff_atomic', {
      p_company_id: company_id,
      p_branch_id: branch_id,
      p_staff_id: staffId,
      p_staff_name: editNameVal,
      p_phone: phoneVal,
      p_email: document.getElementById('editSfEmail').value.trim() || null,
      p_role_name: 'Staff',
      p_services_offered: document.getElementById('editSfServices').value.trim() || null,
      p_notes: document.getElementById('editSfNotes').value.trim() || null,
      p_status: document.querySelector('input[name="editSfStatus"]:checked')?.value || 'active'
  });
  ```
* **Backend Execution Logic (`app.update_staff_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Confirms staff exists in branch and `status <> 'deleted'`.
  3. If phone is updated, checks uniqueness against all other staff in the branch (`staff_id <> p_staff_id`).
  4. Updates `app.staff` record and updates `updated_at = NOW()`.
  5. Returns `{ success: true, staff_id: uuid, staff_name: text, status: text }`.
* **Post-Submit UI Lifecycle**:
  * Shows toast: `"Staff member updated successfully"`.
  * Emits notification `evt_staff_updated`: `"Staff Details Updated: [Name]'s details were updated."`
  * Closes modal and calls `window.fetchStaff()`.

---

#### 3.4.3 Delete Staff Confirmation Modal (`#deleteStaffConfirmOverlay`)
* **Modal Selector**: `<div id="deleteStaffConfirmOverlay" class="modal-overlay custom-logout-overlay">`
* **Buttons**:
  * Cancel: `#btnCancelDeleteStaff` (removes `.active` class, clears `staffToDelete`).
  * Confirm Delete: `#btnConfirmDeleteStaff`.
* **Execution Flow**:
  1. Hides `#deleteStaffConfirmOverlay` and displays `#fullScreenDeleteStaffLoader`.
  2. Invokes authoritative procedure `public.delete_staff_atomic`:
     ```javascript
     const { data, error: deleteError } = await supabase.rpc('delete_staff_atomic', {
         p_company_id: company_id,
         p_branch_id: branch_id,
         p_staff_id: staffId
     });
     ```
* **Backend Execution Logic (`app.delete_staff_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Confirms staff exists in branch and is not already deleted.
  3. **Dependency Blocker Check**:
     ```sql
     SELECT COUNT(*) INTO v_future_bookings
     FROM app.bookings
     WHERE staff_id = p_staff_id
       AND company_id = p_company_id
       AND branch_id = p_branch_id
       AND status IN ('booked', 'confirmed')
       AND booking_date >= CURRENT_DATE;
     ```
     If `v_future_bookings > 0`, execution is aborted:
     `'Cannot delete this staff member because there are X upcoming active booking(s) assigned to them. Please reschedule or reassign the booking(s) first.'`
  4. Soft-deletes staff record:
     ```sql
     UPDATE app.staff SET status = 'deleted', updated_at = NOW() WHERE staff_id = p_staff_id;
     ```
  5. Purges future schedule records (`schedule_date >= CURRENT_DATE`) to prevent ghost calendar slots.
  6. Returns `{ success: true, staff_id: uuid, status: 'deleted' }`.
* **Post-Delete UI Lifecycle**:
  * Hides `#fullScreenDeleteStaffLoader`.
  * Shows toast: `"Staff member deleted successfully"`.
  * Refreshes usage counter: `refreshUsageCounter('max_staff')`.
  * Emits event notification `evt_staff_deleted`.
  * Calls `window.fetchStaff()`.

---

## 4. Staff Scheduling (`staff-schedule.html` & `scripts/staff-schedule/`)

### 4.1 Page Header Controls

```
+-------------------------------------------------------------------------------------------------------------+
| Staff Schedules                                                                                             |
| Manage working hours and shifts                                                                             |
|                                                                                                             |
| [ YYYY-MM (Month Filter) ]  [ + Create Schedule ]                                                           |
+-------------------------------------------------------------------------------------------------------------+
```

#### 4.1.1 Target Month Filter
* **Element Identity**: `<input type="month" id="monthFilter" class="search-input">`
* **Default Value**: Current month in `YYYY-MM` format.
* **Event**: `change`
* **Frontend Workflow**: Triggers `fetchSchedules(renderTable)` for the chosen target month.

#### 4.1.2 "Create Schedule" Button
* **Element Identity**: `<button class="qa-btn qa-primary" id="btnCreateSchedule" data-sub-feature="create_staff_schedule">`
* **RBAC Gate**: `data-sub-feature="create_staff_schedule"`.
* **Event**: `click`
* **Frontend Workflow**: Calls `openModal()` in `schedule-modal-edit.js`:
  1. Sets `scheduleState.currentEditingScheduleId = null`.
  2. Resets form `#createScheduleForm`.
  3. Initializes month builder with target month weeks (`initializeMonthBuilder(year, month)`).
  4. Displays modal (`#createScheduleModal.classList.add('active')`).

---

### 4.2 Schedule Grid Table (`#scheduleTable`)

Table columns: `Staff Member`, `This Week's Schedule / First Week's Schedule`, `Today Shift`, `Today Bookings`, `Actions`.

```
+-------------------------------------------------------------------------------------------------------------+
| Staff Member     | This Week's Schedule          | Today Shift          | Today Bookings | Actions          |
+------------------+-------------------------------+----------------------+----------------+------------------+
| Sarah Johnson    | [Mon 3] [Tue 4] [Wed 5] ...   | Wednesday, 5th       | [ 2 Bookings ] | [View][Edit][Del]|
| Stylist          | [9am-6] [9am-6] [ Off ] ...   | 09:00 AM - 06:00 PM  |                |                  |
+-------------------------------------------------------------------------------------------------------------+
```

#### 4.2.1 Weekday Schedule Timings (Column 2)
* Dynamically displays 7 vertical mini-cards representing Monday through Sunday:
  * **Top Box**: Weekday code + Date number (`Mon 3`, `Tue 4`).
  * **Bottom Box**: Scheduled hours (`9:00 AM - 6:00 PM`) or `Off`.
  * **Color Styles**:
    * Today's Date: Indigo accent (`#4f46e5` header, `#6366f1` body).
    * Active Working Day: Sky blue (`#e0f2fe` header, `#f0f9ff` body).
    * Day Off: Muted gray (`#f1f5f9` header, dashed border `#f8fafc` body).

#### 4.2.2 Today Shift Summary (Column 3)
* Displays today's formatted weekday and ordinal day (e.g., `Wednesday, 5th`).
* Displays timing string (`09:00 AM – 06:00 PM`) or red `Day Off` notice (`#ef4444`).

#### 4.2.3 Today Bookings Counter (Column 4)
* Queries active appointments assigned to the stylist for the current day:
  ```javascript
  const { data, error } = await supabase
      .from('bookings_for_business_transaction')
      .select('staff_id')
      .eq('branch_id', branchId)
      .eq('booking_date', todayStr)
      .in('staff_id', staffIds);
  ```
* Displays blue pill: `<span class="badge">[N] Bookings</span>` or gray text `No Bookings`.

#### 4.2.4 Schedule Row Action Buttons (Column 5)
1. **View Schedule (`viewSchedule(scheduleId)`)**:
   * Opens `#viewScheduleModal`.
2. **Edit Schedule (`editSchedule(scheduleId)`)**:
   * Gated by `data-sub-feature="edit_staff_schedule"`.
   * Pre-populates schedule builder and opens `#createScheduleModal`.
3. **Delete Schedule (`deleteSchedule(scheduleId)`)**:
   * Gated by `data-sub-feature="delete_staff_schedule"`.
   * Sets `scheduleState.currentDeletingScheduleId = scheduleId`.
   * Opens `#deleteScheduleModalBackdrop`.

---

### 4.3 Schedule Editor Modal (`#createScheduleModal`)

```
+-------------------------------------------------------------------------------------------------------------+
| Create Staff Schedule                                                                                   [X] |
| Set the weekly recurring schedule for a specific month.                                                     |
+-------------------------------------------------------------------------------------------------------------+
| Staff Member * [ Select staff member v ]     Target Month * [ YYYY-MM ]                                     |
+-------------------------------------------------------------------------------------------------------------+
| Weekly Schedule Pattern                                                    [ < ] Week 1 of 4 [ > ]          |
| This will create schedules for selected days of the week.                                                   |
|                                                                                                             |
| Date         Day       Working   Start Time   End Time     Notes                                            |
| ----------------------------------------------------------------------------------------------------------- |
| Nov 02, 2026 Monday    [ (o) ]   [ 09:00 ]    [ 18:00 ]    [ Notes...                                     ] |
| Nov 03, 2026 Tuesday   [ (o) ]   [ 09:00 ]    [ 18:00 ]    [ Notes...                                     ] |
| Nov 04, 2026 Wednesday [ ( ) ]   [       ]    [       ]    [ Off duty                                     ] |
+-------------------------------------------------------------------------------------------------------------+
|                                                          [ Cancel ] [ Save Schedule ]                       |
+-------------------------------------------------------------------------------------------------------------+
```

#### 4.3.1 Dynamic Inputs & State Management
* **Staff Member Selector** (`#modalStaffSelect`): Dropdown populated from `app.staff`. Disabled when editing an existing schedule.
* **Target Month Selector** (`#modalMonthSelect`): Year-Month input. Disabled when editing an existing schedule.
* **Week Pagination Controls**:
  * `#btnPrevWeek`: Navigates to previous week of the target month.
  * `#btnNextWeek`: Navigates to next week of the target month.
  * `#patternHeaderLabel`: Displays current week indicator (e.g., `Week 1 of 5`).
* **Day-Level Form Rows** (generated in `scheduleDaysContainer`):
  * **Date & Day Labels**: E.g., `Nov 02, 2026` & `Monday`. Past dates are disabled and grayed out.
  * **Working Toggle** (`.day-active-chk`): Enables or disables shift for that specific calendar date. Default hours populate as `09:00` to `18:00`.
  * **Start Time Input** (`.day-start`): Time picker. Has `min` constraint for the current day to prevent scheduling shifts in the past.
  * **End Time Input** (`.day-end`): Time picker.
  * **Notes Input** (`.day-notes`): Free-text notes for that day's shift.

#### 4.3.2 Form Submission & Authoritative Backend Mutation
* **Form**: `<form id="createScheduleForm">`
* **Button**: `<button type="submit" id="btnSaveSchedule">`
* **Frontend Validation**:
  * Verifies staff member and target month are selected.
  * Checks for duplicate schedule in create mode:
    ```javascript
    const alreadyExists = scheduleState.rawSchedules.some(
        s => String(s.staff_id) === String(staffId) && s.target_month === targetMonth
    );
    ```
  * Validates start and end time completion for all active days.
* **Database RPC Call**: Invokes authoritative procedure `public.save_staff_schedule_atomic`:
  ```javascript
  const { data, error } = await supabase.rpc('save_staff_schedule_atomic', {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_staff_id: staffId,
      p_year: Number(year),
      p_month: rpcMonth, // 1-indexed (1 to 12)
      p_schedule_entries: insertPayload
  });
  ```
* **Backend Execution Logic (`app.save_staff_schedule_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Verifies staff exists and is active.
  3. Computes `v_month_start`, `v_month_end`, and `v_delete_from := GREATEST(CURRENT_DATE, v_month_start)`.
  4. If `v_delete_from > v_month_end`, rejects: `'Cannot modify schedules for a past month.'`
  5. **Booking Conflict Verification Loop**:
     * For each entry in `p_schedule_entries` where `schedule_date >= CURRENT_DATE`:
       * If `is_off = true`: Checks if any active bookings (`status IN ('booked', 'confirmed')`) exist on that date. If found, aborts:
         `'Cannot mark stylist as off-duty on [Date] because an active appointment is scheduled from [Start] to [End]. Please reschedule or reassign the appointment first.'`
       * If `is_off = false`: Checks if any active bookings fall outside the new shift window (`start_time < r.s_start OR end_time > r.s_end`). If found, aborts:
         `'Shift hours ([Start]-[End]) on [Date] conflict with an active appointment scheduled from [Start] to [End]. Please reschedule the appointment first.'`
  6. Atomically deletes existing schedule entries in `[v_delete_from, v_month_end]`.
  7. Inserts new schedule records into `app.staff_schedule`.
  8. Returns `{ success: true, staff_id: uuid, month: text, saved_entries_count: int }`.
* **Post-Submit UI Lifecycle**:
  * Displays toast: `"Schedule saved successfully"`.
  * Closes modal, re-fetches schedules via `fetchSchedules()`, and calls `renderTable()`.

---

### 4.4 View Schedule Modal (`#viewScheduleModal`)

```
+-------------------------------------------------------------------------------------------------------------+
| View Schedule: Sarah Johnson                                                                            [X] |
| Target Month: November 2026                                                                                 |
+-------------------------------------------------------------------------------------------------------------+
| [ This Week's Timings ] [ Monthly Timings ]                             [ Download PDF ] [ Share Email ]    |
|                                                                                                             |
| Full Month's Schedule                                                                                       |
|                                                                                                             |
| Date            Day              Shift                         Notes                                        |
| ----------------------------------------------------------------------------------------------------------- |
| 02-11-2026      Monday           09:00 AM - 06:00 PM           -                                            |
| 03-11-2026      Tuesday          09:00 AM - 06:00 PM           -                                            |
| 04-11-2026      Wednesday        Off                           -                                            |
+-------------------------------------------------------------------------------------------------------------+
|                                                                                                 [ Close ]   |
+-------------------------------------------------------------------------------------------------------------+
```

#### 4.4.1 Tab Switching Controls
* **This Week's Timings** (`#tabThisWeekBtn`): Displays 7-day breakdown for the current week.
* **Monthly Timings** (`#tabMonthBtn`): Displays complete month breakdown grouped by calendar weeks.

#### 4.4.2 Export & Sharing Actions
1. **Download PDF (`#btnDownloadSchedule`)**:
   * Uses `html2pdf.bundle.min.js`.
   * Automatically switches view to Monthly Timings tab so all DOM nodes are mounted.
   * Injects temporary header with stylist name and month.
   * Generates formatted PDF: `${staff_name}_Monthly_Schedule_${target_month}.pdf`.
   * Cleans up temporary header upon completion.
2. **Share via Email (`#btnShareSchedule`)**:
   * Formats full weekly pattern and specific overrides into plain text.
   * Opens user email client via `mailto:?subject=...&body=...`.

---

### 4.5 Delete Schedule Confirmation Modal (`#deleteScheduleModalBackdrop`)
* **Modal Trigger**: `window.deleteSchedule(scheduleId)`
* **Cancel Button**: `#deleteScheduleCancelBtn` (closes modal).
* **Confirm Button**: `#deleteScheduleConfirmBtn`.
* **Execution Flow**:
  1. Invokes authoritative procedure `public.delete_staff_schedule_atomic`:
     ```javascript
     const { data, error } = await supabase.rpc('delete_staff_schedule_atomic', {
         p_company_id: companyId,
         p_branch_id: branchId,
         p_staff_id: staffId,
         p_target_month: targetMonth
     });
     ```
* **Backend Execution Logic (`app.delete_staff_schedule_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Validates format of `p_target_month` (`YYYY-MM`).
  3. Computes `v_delete_from := GREATEST(CURRENT_DATE, v_month_start)`.
  4. If `v_delete_from > v_month_end`, rejects: `'Cannot delete past schedules.'`
  5. **Booking Check**:
     ```sql
     SELECT COUNT(*) INTO v_active_bookings
     FROM app.bookings
     WHERE staff_id = p_staff_id
       AND company_id = p_company_id
       AND branch_id = p_branch_id
       AND status IN ('booked', 'confirmed')
       AND booking_date >= v_delete_from
       AND booking_date <= v_month_end;
     ```
     If `v_active_bookings > 0`, blocks deletion:
     `'Cannot delete schedule for [Month] because there are X active booking(s) scheduled for this staff member during this period. Please reschedule them first.'`
  6. Deletes entries from `app.staff_schedule`.
  7. Returns `{ success: true, staff_id: uuid, target_month: text, deleted_count: int }`.
* **Post-Delete UI Lifecycle**:
  * Removes deleted schedule from client state `scheduleState.rawSchedules`.
  * Calls `renderTable()`.
  * Shows toast: `"Schedule deleted successfully"`.

---

## 5. Branch Operating Hours (`settings-hours.html` & `scripts/settings-hours.js`)

Operating hours define the branch-wide availability envelope.

```
+-------------------------------------------------------------------------------------------------------------+
| Operating Hours                                                                                             |
| Set your salon opening and closing times for each day of the week.                                          |
+-------------------------------------------------------------------------------------------------------------+
| Monday        From [ 09:00 AM v ]   To [ 06:00 PM v ]   [ (o) ] Open                                        |
| Tuesday       From [ 09:00 AM v ]   To [ 06:00 PM v ]   [ (o) ] Open                                        |
| Wednesday     From [ 09:00 AM v ]   To [ 06:00 PM v ]   [ (o) ] Open                                        |
| Thursday      From [ 09:00 AM v ]   To [ 06:00 PM v ]   [ (o) ] Open                                        |
| Friday        From [ 09:00 AM v ]   To [ 06:00 PM v ]   [ (o) ] Open                                        |
| Saturday      From [ 09:00 AM v ]   To [ 05:00 PM v ]   [ (o) ] Open                                        |
| Sunday        From [ 09:00 AM v ]   To [ 05:00 PM v ]   [ ( ) ] Closed                                      |
+-------------------------------------------------------------------------------------------------------------+
| [Sticky Save Bar]:  Unsaved changes detected                       [ Discard ] [ Save Changes ]             |
+-------------------------------------------------------------------------------------------------------------+
```

### 5.1 Day Row Inputs (Monday through Sunday)
For each day of the week (`DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']`):
* **Opening Time Select** (`#from_${day}`): 30-minute intervals from `00:00` to `23:30`.
* **Closing Time Select** (`#to_${day}`): 30-minute intervals from `00:00` to `23:30`.
* **Day Open Toggle** (`#open_${day}`): Checkbox toggle switch.
  * Toggling unchecks/disables opening & closing selects and updates label `#status_${day}` to `Closed`.
  * Triggers `window.markDirty()`, displaying sticky footer bar `#savebar`.

### 5.2 Sticky Save Bar Actions
* **Cancel Button** (`#btnCancelHours` / `window.cancelHours()`):
  * Resets `window.isDirty = false`.
  * Hides save bar (`#savebar.classList.remove('visible')`).
  * Reloads existing hours from Supabase via `loadHoursData(currentBranchId)`.
* **Save Changes Button** (`#btnSaveHours` / `window.saveHours()`):
  * Reads all 7 day rows and formats into payload array:
    ```javascript
    const rows = DAYS.map(day => ({
        day_of_week:  day,
        is_open:      document.getElementById('open_' + day)?.checked ?? true,
        opening_time: (document.getElementById('from_' + day)?.value || '09:00') + ':00',
        closing_time: (document.getElementById('to_' + day)?.value  || '18:00') + ':00'
    }));
    ```
  * Calls authoritative procedure `public.save_business_hours_atomic`:
    ```javascript
    const { data, error: upsertErr } = await supabase.rpc('save_business_hours_atomic', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_hours: rows
    });
    ```
* **Backend Execution Logic (`app.save_business_hours_atomic`)**:
  1. Executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
  2. Iterates across day records and validates day names (`Monday` through `Sunday`).
  3. **Time Ordering Guard**:
     ```sql
     IF v_open = true THEN
         IF v_start >= v_end THEN
             RETURN jsonb_build_object(
                 'success', false,
                 'error', 'Opening time (' || to_char(v_start, 'HH24:MI') || ') must be earlier than closing time (' || to_char(v_end, 'HH24:MI') || ') for ' || v_day || '.'
             );
         END IF;
     END IF;
     ```
  4. Upserts all 7 rows into `app.business_hours` on conflict `(company_id, branch_id, day_of_week)`.
  5. Returns `{ success: true, updated_count: int }`.
* **Post-Save UI Lifecycle**:
  * Shows toast: `"Business hours saved successfully!"`.
  * Resets dirty state and hides save bar.
  * Re-renders hours with freshly loaded data.

---

## 6. Complete End-to-End Element & Interaction Catalog

| Element Selector / Event | UI Location | User Action | Frontend Handler | Target RPC / Query | Affected Tables | Guards & Validation |
|---|---|---|---|---|---|---|
| `#staffSearchInput` (input) | Staff Header | Types query string | Inline input listener | None (client filter) | None | Substring match on name, phone, email |
| `#btnStaffFilter` (click) | Staff Header | Opens filter dropdown | Inline click listener | None | None | Toggles `.active` / `.show` |
| `#filterStaffAll` (change) | Filter Menu | Toggles all statuses | Checkbox change handler | None | None | Synchronizes all status checkboxes |
| `.filter-staff-status` (change) | Filter Menu | Toggles status | Checkbox change handler | None | None | Re-evaluates `#filterStaffAll` state |
| `#btnStaffFilterReset` (click) | Filter Menu | Resets filters | Reset button handler | None | None | Resets all checkboxes to checked; re-renders table |
| `#btnStaffFilterApply` (click) | Filter Menu | Applies status filters | Apply button handler | None | None | Filters `liveStaffData` by checked statuses |
| `#btnAddStaff` (click) | Staff Header | Clicks "Add Staff" | Click listener | `checkResourceLimit('max_staff')` | `platform.plan_limits` | Plan limit check; opens `#addStaffModal` |
| `#addStaffForm` (submit) | Add Staff Modal | Submits new staff | Form submit handler | `public.create_staff_atomic` | `app.staff` | Phone regex (`[0-9]{10}`), quota guard, phone uniqueness |
| `#btnCloseAddStaffModal` / `#btnCancelAddStaff` (click) | Add Staff Modal | Closes modal | Click listener | None | None | Removes `.active` class |
| `.customer-link` (click) | Staff Row | Clicks staff name | `window.viewStaffProfile(id)` | None (alert placeholder) | None | Staged profile view |
| `button[data-sub-feature="update_staff"]` (click) | Staff Row | Clicks "Edit" | `window.editStaff(id)` | None | None | Populates `#editStaffModal` with record |
| `#editStaffForm` (submit) | Edit Staff Modal | Submits staff updates | Form submit handler | `public.update_staff_atomic` | `app.staff` | Phone collision guard excluding self; updates record |
| `#btnCloseEditStaffModal` / `#btnCancelEditStaff` (click) | Edit Staff Modal | Closes modal | Click listener | None | None | Removes `.active` class |
| `button[data-sub-feature="delete_staff"]` (click) | Staff Row | Clicks "Delete" | `window.deleteStaff(id)` | None | None | Displays `#deleteStaffConfirmOverlay` |
| `#btnConfirmDeleteStaff` (click) | Delete Staff Modal | Confirms deletion | Confirm click listener | `public.delete_staff_atomic` | `app.staff`, `app.staff_schedule` | **Active booking blocker guard** (`app.bookings`); purges future schedules |
| `#monthFilter` (change) | Schedule Header | Changes month filter | Change listener | `fetchSchedules(renderTable)` | `app.staff_schedule` | Loads schedules for `YYYY-MM` |
| `#btnCreateSchedule` (click) | Schedule Header | Clicks "Create Schedule" | `openModal()` | None | None | Initializes month builder, opens `#createScheduleModal` |
| `#modalMonthSelect` (change) | Schedule Modal | Selects target month | Change listener | `initializeMonthBuilder()` | None | Re-renders day rows for selected month |
| `#btnPrevWeek` / `#btnNextWeek` (click) | Schedule Modal | Changes week page | Click listener | `renderDayRows()` | None | Updates `currentWeekIndex` and re-renders |
| `.day-active-chk` (change) | Schedule Modal | Toggles shift day | Checkbox listener | None | None | Toggles start/end inputs; default `09:00-18:00` |
| `#createScheduleForm` (submit) | Schedule Modal | Saves schedule | `handleFormSubmit()` | `public.save_staff_schedule_atomic` | `app.staff_schedule` | **Booking conflict verification**; atomic replacement of future dates |
| `button[title="View Schedule"]` (click) | Schedule Row | Clicks "View" | `window.viewSchedule(id)` | None | None | Opens `#viewScheduleModal` |
| `#tabThisWeekBtn` / `#tabMonthBtn` (click) | View Modal | Switches tabs | `switchViewTab()` | None | None | Toggles weekly vs monthly tab views |
| `#btnDownloadSchedule` (click) | View Modal | Downloads PDF | Click listener | `html2pdf()` | None | Client PDF render via `html2pdf.bundle.min.js` |
| `#btnShareSchedule` (click) | View Modal | Shares schedule | Click listener | `mailto:` URI | None | Formats schedule pattern into user email draft |
| `button[data-sub-feature="edit_staff_schedule"]` (click) | Schedule Row | Clicks "Edit" | `window.editSchedule(id)` | None | None | Populates `#createScheduleModal` in edit mode |
| `button[data-sub-feature="delete_staff_schedule"]` (click) | Schedule Row | Clicks "Delete" | `window.deleteSchedule(id)` | None | None | Opens `#deleteScheduleModalBackdrop` |
| `#deleteScheduleConfirmBtn` (click) | Delete Sched Modal | Confirms deletion | `performDelete(id)` | `public.delete_staff_schedule_atomic` | `app.staff_schedule` | **Active booking blocker guard**; deletes future entries |
| `#open_${day}` (change) | Business Hours | Toggles day open/close | `window.toggleDay()` | None | None | Toggles time inputs; marks dirty |
| `#from_${day}` / `#to_${day}` (change) | Business Hours | Changes open/close time | `window.markDirty()` | None | None | Displays sticky save bar `#savebar` |
| `#btnCancelHours` (click) | Business Hours | Discards changes | `window.cancelHours()` | None | None | Re-fetches hours from `app.business_hours` |
| `#btnSaveHours` (click) | Business Hours | Saves branch hours | `window.saveHours()` | `public.save_business_hours_atomic` | `app.business_hours` | Validates `opening_time < closing_time`; upserts 7 days |

---

## 7. Security, RLS & Verification Checklist

- [x] **Zero Client Mutations**: No `.insert()`, `.update()`, or `.delete()` calls against `app.staff`, `app.staff_schedule`, or `app.business_hours`.
- [x] **Strict Tenant Verification**: Every RPC executes `shared.verify_tenant_access(p_company_id, p_branch_id)`.
- [x] **SaaS Quota Verification**: `create_staff_atomic` verifies `platform.plan_limits.max_staff` before creating staff records.
- [x] **Phone Collision Protection**: Normalized phone deduplication prevents accidental duplicate profiles across the branch.
- [x] **Dependency Integrity Protection**: Deleting a staff member or updating a schedule to off-duty strictly blocks if active customer bookings exist.
- [x] **Operating Hours Integrity**: Saves fail if closing time is earlier than or equal to opening time.

