# Module 13: Company & Settings — Interaction & Backend Execution Map

## 1. Module Overview & Architecture

The **Company & Settings** suite (`company.html`) acts as the central administrative hub configuring corporate identity, physical locations, compliance, financial infrastructure, communications, and operating parameters.

### Structural Topology
1. **Settings Hub (`company.html`)**: Consolidated 2-card SaaS dashboard providing direct access to:
   - **Company Settings Card**: Business Identity, Primary Contact, Tax & Compliance (`settings-company.html?tab=business|contact|tax`).
   - **Branch Settings Card**: Physical Branches, Operating Hours, Invoice Designer, Payment Gateways, Notifications (`settings-branch.html?tab=branches|hours|invoice|payments|notifications`).
2. **Consolidated Company Settings (`settings-company.html`, `scripts/settings-company.js`)**:
   - **Single Unified Table**: All company-level identity, contacts, and tax configurations are consolidated into `shared.company_settings`.
   - **Unified Stored Procedure**: All tab saves route through `shared.save_company_settings(p_company_id, p_section, p_data)` with `public.save_company_settings` wrapper.
   - **Business Tab**: Legal business entity, brand display name, business category, description, website, social links, logo, and cover banner.
   - **Contact Tab**: Primary administrative contact person, designation, phone, email, alternate phone, subscription/billing contact toggle, and registered business legal address.
   - **Tax Tab**: PAN, business registration number, entity registration type, and multi-state GST registrations (`gst_registrations` JSONB array).
3. **Branch Settings (`settings-branch.html`, `scripts/settings-branch.js`)**:
   - Operating Hours, Invoicing, Payment Methods, Notifications, and Multi-Branch Management.

---

## 2. Interactive Navigation Hub (`company.html`)

| Module Card | Target Tabs | Destination Page | Domain | Sub-Feature Gate / Feature Gate |
| :--- | :--- | :--- | :--- | :--- |
| **Company Settings** | Business, Contact, Tax | `settings-company.html?tab=...` | Corporate identity, primary contacts, compliance | `data-feature="company_settings"` |
| **Branch Settings** | Branches, Hours, Invoice, Payments, Notifications | `settings-branch.html?tab=...` | Multi-branch locations, hours, receipts, payment gateways | `data-feature="branch_management"` |

---

## 3. Branches Management (`branches.html`, `branches.js`)

### 3.1 Header & Page Actions

| Element Selector / Event | UI Label / Icon | Trigger / Action | Frontend Behavior | Backend / RPC Execution | RBAC / Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#btnAddBranch`<br>`click` | `<i data-feather="plus"></i> Add Branch` | Click | 1. Evaluates `checkResourceLimit('max_branches')`.<br>2. If limit reached: displays `showPlanLimitModal(limitCheck)`.<br>3. If allowed: resets form, opens modal (`#branchPanelOverlay.active`). | Checks active branch count against `platform.company_subscriptions`. | `data-sub-feature="branch_create"` |

---

### 3.2 Branches Data Table & Row Actions

| Column / Element | Selector | UI Representation & Behavior | Backend Source / Procedural Action |
| :--- | :--- | :--- | :--- |
| **Branch Name** | `td:nth-child(1)` | Primary branch name with optional branch code subtitle (`Code: BLR-01`). | `shared.branches.branch_name`, `branch_code` |
| **Address** | `td:nth-child(2)` | Consolidated address string with external link `View Map →` if Google Maps URL present. | `shared.branches.branch_address`, `google_maps_url` |
| **Manager** | `td:nth-child(3)` | Assigned manager user name or "Unassigned". | `shared.branches.manager_user_id` resolved via `shared.users` |
| **Phone & Email** | `td:nth-child(4)` | Contact phone number and branch email address. | `shared.branches.branch_phone`, `branch_email` |
| **Status** | `td:nth-child(5)` | Status pill with dot: Active (`#dcfce7`) vs Inactive (`#f1f5f9`). | `shared.branches.status` |
| **Actions: Edit** | `button[data-sub-feature="branch_update"]`<br>`click` | Invokes `openPanel('edit', branchId)`. Pre-populates all 3 sections in modal. Button text: "Update Branch". | Pure modal setup. |
| **Actions: Activate / Deactivate** | `button[data-sub-feature="branch_update"]`<br>`click` | Invokes `toggleStatus(branchId)`. Computes target status. | Calls `public.toggle_branch_status_atomic(p_company_id, p_branch_id, p_new_status)`. |
| **Actions: Delete** | `button[data-sub-feature="branch_delete"]`<br>`click` | Invokes `deleteBranch(branchId)`. Injects confirmation modal (`#deleteBranchBackdrop`). On confirm: executes atomic deletion. | Calls `public.delete_branch_atomic(p_company_id, p_branch_id)`. Calls `refreshUsageCounter('max_branches')`. |

---

### 3.3 Add / Edit Branch Modal Workflow (`#branchPanelOverlay`)

- **DOM Elements**:
  - `#branchName`, `#branchCode`, `#branchManager` (dropdown populated from `shared.users`), `#branchPhone`, `#branchEmail`.
  - Address: `#branchAddressLine1`, `#branchAddressLine2`, `#branchLocality`, `#branchLandmark`, `#branchCity`, `#branchDistrict`, `#branchState`, `#branchPincode`, `#branchCountry` (`readonly` "India"), `#branchMapLink`, `#branchLatitude`, `#branchLongitude`.
  - Operational Status: `#branchStatusToggle` (checked = `active`, unchecked = `inactive`).
  - Buttons: `#btnCancelBranch`, `#btnSaveBranch`.

#### Procedural Mutations:
1. **Create Branch (`currentEditId === null`)**:
   - Re-checks plan limit `checkResourceLimit('max_branches')`.
   - Compiles formatted address `branch_address`.
   - Calls `public.create_branch_atomic`:
     ```typescript
     const { data, error } = await supabase.rpc('create_branch_atomic', {
         p_company_id:      companyId,
         p_branch_name:     name,
         p_branch_phone:    phone,
         p_branch_email:    email || null,
         p_branch_code:     code || null,
         p_manager_user_id: managerId || null,
         p_address_line_1:  addressLine1,
         p_address_line_2:  addressLine2 || null,
         p_locality_area:   localityArea || null,
         p_landmark:        landmark || null,
         p_city:            city,
         p_district:        district || null,
         p_state:           state,
         p_pin_code:        pinCode,
         p_country:         country || 'India',
         p_branch_address:  branchAddress,
         p_google_maps_url: mapsUrl || null,
         p_latitude:        latNum,
         p_longitude:       lngNum,
         p_status:          isActive ? 'active' : 'inactive'
     });
     ```
   - Invokes `refreshUsageCounter('max_branches')`.
2. **Update Branch (`currentEditId !== null`)**:
   - Calls `public.update_branch_atomic` with same parameters plus `p_branch_id`.
3. **Toggle Status**:
   - Calls `public.toggle_branch_status_atomic(p_company_id, p_branch_id, p_new_status)`.
   - **Backend Guard**: Blocks deactivation if the branch is the only remaining active branch in the company!
4. **Delete Branch**:
   - Calls `public.delete_branch_atomic(p_company_id, p_branch_id)`.
   - **Backend Safeguards**:
     - Cannot delete if it is the only non-deleted operational branch.
     - Cannot delete if active upcoming bookings exist (`pending`, `confirmed`, `in_service`).
     - Cannot delete if active staff members are assigned exclusively to this branch.

---

## 4. Settings Sub-Modules & Stored Procedures

### 4.1 Consolidated Company Settings (`settings-company.html`, `scripts/settings-company.js`)
All company settings are consolidated into the single authoritative table `shared.company_settings` and written via the unified stored procedure:
```typescript
supabase.rpc('save_company_settings', {
    p_company_id: companyId,
    p_section:    'business' | 'contact' | 'tax',
    p_data:       sectionPayload
});
```

#### A. Business Settings (`p_section = 'business'`)
- **Inputs**: Legal Business Name (`#companyName`), Brand Display Name (`#displayName`), Business Category (`#businessCategory`), Description (`#businessDescription`), Website (`#companyWebsite`), Instagram (`#instagramUrl`), Facebook (`#facebookUrl`).
- **File Uploads**:
  - Logo (`#logoFileInput`) uploaded to Supabase Storage bucket `company-logos` with 2 MB limit (`${companyId}/logo_${Date.now()}.${ext}`).
  - Cover Banner (`#coverFileInput`) uploaded to `company-cover-images` with 5 MB limit.
- **Tables Synchronized**: Updates `shared.company_settings` and synchronizes legal/brand name, category, logo, and cover with `shared.companies`.

#### B. Contact Settings (`p_section = 'contact'`)
- **Inputs**: Primary Contact Person Name (`#primaryContactName`), Designation (`#contactDesignation`), Email (`#contactEmail`), Phone (`#contactPhone`), Alternate Phone (`#contactAlternatePhone`), Billing Same-as-Primary Toggle (`#sameAsPrimaryContact`), Billing Contact Name (`#billingContactName`), Billing Email (`#billingEmail`), Billing Phone (`#billingPhone`), Registered Business Address Lines 1 & 2 (`#addressLine1`, `#addressLine2`), Locality (`#addressLocality`), Landmark (`#addressLandmark`), City (`#addressCity`), State (`#addressState`), PIN Code (`#addressPincode`), Country (`#addressCountry`).
- **Tables Synchronized**: Updates `shared.company_settings` and synchronizes owner contact info with `shared.companies`.

#### C. Tax & Compliance Settings (`p_section = 'tax'`)
- **Inputs**: PAN (`#pan`), Business Registration Number (`#regNumber`), Registration Type (`#registrationType`), Multiple GST Registrations (`#gstListContainer`).
- **GST Structure**: Dynamic array of `{ gstin: string, state: string }` persisted in the `gst_registrations` JSONB column.
- **Table Modified**: `shared.company_settings`.

---

### 4.4 Invoice Settings (`settings-invoice.html`, `scripts/invoice-state.js`)
- **Domains Configured**: Common Invoices, Booking Invoices, POS Retail Invoices, and Membership Invoices.
- **Configurable Attributes**: Numbering prefixes (`INV-`, `BK-`, `POS-`, `MEM-`), starting sequential numbers, show/hide toggles for branding header (logo, legal name, GSTIN, PAN), customer information, transaction metadata, itemized pricing & taxes, balance due, terms & conditions, and payment instructions.
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_invoice_settings_atomic', {
      p_company_id:         companyId,
      p_branch_id:          branchId,
      p_common_invoice:     payload.common_invoice,
      p_booking_invoice:    payload.booking_invoice,
      p_pos_invoice:        payload.pos_invoice,
      p_membership_invoice: payload.membership_invoice
  });
  ```
- **Table Modified**: `app.invoice_settings` (atomic single-row composite upsert on `company_id, branch_id`).

---

### 4.5 Business Payments Settings (`settings-payments.html`, `scripts/settings-payments.js`)
- **Payment Toggles**: Cash (`#pmCash`), UPI (`#pmUpi`), Cards (`#pmCard`), Online Gateway (`#pmOnline`).
- **UPI Configuration**: Static UPI ID (`#upiId`), Default Payment Method dropdown (`#defaultPaymentMethod`), Checkout payment notes (`#paymentNote`).
- **QR Code Storage**: Uploads custom QR image to Supabase Storage bucket `upi-qr-codes` (`${companyId}/${branchId}/qr_${Date.now()}.${ext}`). Automatically cleans up deprecated old QR images upon replacement or removal.
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_business_payment_settings_atomic', {
      p_company_id:             companyId,
      p_branch_id:              branchId,
      p_cash_enabled:           payload.cash_enabled,
      p_upi_enabled:            payload.upi_enabled,
      p_cards_enabled:          payload.cards_enabled,
      p_online_payment_enabled: payload.online_payment_enabled,
      p_upi_id:                 payload.upi_id,
      p_upi_qr_code_url:        payload.upi_qr_code_url,
      p_payment_note:           payload.payment_note,
      p_default_payment_method: payload.default_payment_method
  });
  ```
- **Safeguard**: Enforces that at least one payment method remains enabled at all times!
- **Table Modified**: `app.business_payment_settings`.

---

### 4.6 Notification Preferences (`settings-notifications.html`, `scripts/settings-notifications.js`)
- **Accordion Architecture**: 3 Top-level collapsible panels (System Notifications, Customer Notifications, Marketing Notifications).
- **Matrix Configurator**: Master toggle controls for each department (Bookings, Customers, Staff, POS, Payments, Marketing) cascading to granular event checkboxes across In-App, WhatsApp, SMS, and Email channels.
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_notification_settings_atomic', {
      p_company_id:              companyId,
      p_branch_id:               branchId,
      p_system_notifications:    systemPrefs,
      p_customer_notifications:  customerPrefs,
      p_marketing_notifications: marketingPrefs
  });
  ```
- **Table Modified**: `app.notification_settings` (persists granular JSON configurations).
- **Client Synchronization**: Caches preferences to `localStorage.notification_prefs_${companyId}_${branchId}` which powers real-time bell badges and toast notifications via `notification-manager.js`.

