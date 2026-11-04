# Module 13: Company & Settings — Interaction & Backend Execution Map

## 1. Module Overview & Architecture

The **Company & Settings** suite (`company.html`) acts as the central administrative hub configuring corporate identity, physical locations, compliance, financial infrastructure, communications, and operating parameters.

### Structural Topology
1. **Settings Hub** (`company.html`): 8 high-level navigation cards providing direct access to configuration domains.
2. **Business Details** (`settings-business.html`, `scripts/settings-business.js`): Legal business entity, brand display name, business category & structure, description, website, and social links.
3. **Contact Details** (`settings-contact.html`, `scripts/settings-contact.js`): Communication channels (phone, WhatsApp, email), registered office address with geolocation coordinates, and designated primary contact person.
4. **Tax & Legal Compliance** (`settings-tax.html`, `scripts/settings-tax.js`): GSTIN, PAN, business registration number, state of GST registration, default tax rate, price tax-inclusivity flag, and tax breakdown display toggle.
5. **Invoice Designer & Templates** (`settings-invoice.html`, `settings-invoice-*.html`, `scripts/settings/settings-invoice-*-ui.js`): Customization of prefix, starting numbers, header blocks, customer blocks, line-item columns, totals breakdowns, payment instructions, and terms for Common, Booking, POS, and Membership invoices.
6. **Business Operating Hours** (`settings-hours.html`, `scripts/settings-hours.js`): Weekly operating schedules, opening/closing times, break intervals, and special operating hours per branch.
7. **Payment Methods & Gateway** (`settings-payments.html`, `scripts/settings-payments.js`): Cash, UPI, Cards, and Online payment toggles, static UPI ID, dynamic UPI QR code uploads, checkout notes, and default payment method selection.
8. **Notification Preferences** (`settings-notifications.html`, `scripts/settings-notifications.js`): Matrix of system alerts, customer reminders, and marketing campaigns across In-App, WhatsApp, SMS, and Email channels.
9. **Multi-Branch Operations** (`branches.html`, `branches.js`): Branch creation, physical location details, manager assignment, operating status, plan limits, and deactivation/deletion safeguards.

---

## 2. Interactive Navigation Hub (`company.html`)

| Card Selector | Destination Page | Domain | Sub-Feature Gate / Feature Gate |
| :--- | :--- | :--- | :--- |
| `#card-business` | `settings-business.html` | Business branding & company profile | `data-sub-feature="settings_business"` |
| `#card-contact` | `settings-contact.html` | Communication channels & address | `data-sub-feature="settings_contact"` |
| `#card-tax` | `settings-tax.html` | GST, PAN & tax settings | `data-sub-feature="settings_tax"` |
| `#card-invoice` | `settings-invoice.html` | Invoices & receipt templates | `data-sub-feature="settings_billing"` |
| `#card-hours` | `settings-hours.html` | Operating hours & weekly schedule | `data-sub-feature="settings_hours"` |
| `#card-payments` | `settings-payments.html` | Payment modes & UPI QR setup | `data-sub-feature="settings_payments"` |
| `#card-notifications` | `settings-notifications.html` | System, customer & marketing alerts | `data-sub-feature="settings_notifications"` |
| `#card-branches` | `branches.html` | Multi-branch locations & managers | `data-feature="branch_management"` |

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

### 4.1 Business Settings (`settings-business.html`, `scripts/settings-business.js`)
- **Inputs**: Legal Business Name (`#companyName`), Brand Display Name (`#displayName`), Business Category (`#businessCategory`), Business Structure (`#businessType`), Description (`#businessDescription`), Website (`#companyWebsite`), Google Business URL (`#googleBusinessUrl`), Instagram (`#instagramUrl`), Facebook (`#facebookUrl`).
- **File Uploads**:
  - Logo (`#logoFileInput`) uploaded to Supabase Storage bucket `company-logos` with 2 MB limit (`${companyId}/logo_${Date.now()}.${ext}`).
  - Cover Image (`#coverFileInput`) uploaded to `company-cover-images` with 5 MB limit.
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_business_settings', {
      p_company_id: companyId,
      p_data: payload
  });
  ```
- **Tables Synchronized**: Updates `shared.company_settings` and synchronizes legal name/brand name with `shared.companies`.

---

### 4.2 Contact Settings (`settings-contact.html`, `scripts/settings-contact.js`)
- **Inputs**: Primary Phone (`#contactPhone`), WhatsApp (`#contactWhatsApp`), Email (`#contactEmail`), Alternate Phone (`#contactAlternatePhone`), Support Phone (`#contactSupportPhone`), Support Email (`#contactSupportEmail`), Address Lines 1 & 2, Locality, Landmark, City, District, State, Pincode, Country, Google Maps Link (`#mapLink`), Geolocation Latitude/Longitude, Contact Person Name, Phone, and Email.
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_contact_settings', {
      p_company_id: companyId,
      p_data: payload
  });
  ```
- **Tables Synchronized**: Updates `shared.company_contacts` and updates primary contact phone/email on `shared.companies`.

---

### 4.3 Tax & Compliance Settings (`settings-tax.html`, `scripts/settings-tax.js`)
- **Inputs**: Business Registration Number (`#regNumber`), GSTIN (`#gstin`), PAN (`#pan`), GST Registration State (`#taxState`), Default Tax Rate (`#defaultTaxRate`), Tax Label (`#taxLabel` default "GST"), Tax Inclusive Pricing switch (`#taxInclusive`), Tax Breakdown Toggle (`#showTaxBreakdown`).
- **Backend Procedure**:
  ```typescript
  supabase.rpc('save_company_tax_settings_atomic', {
      p_company_id:                   companyId,
      p_business_registration_number: payload.business_registration_number,
      p_gstin:                        payload.gstin,
      p_pan:                          payload.pan,
      p_gst_registration_state:       payload.gst_registration_state,
      p_default_tax_rate:             payload.default_tax_rate,
      p_tax_label:                    payload.tax_label,
      p_prices_include_tax:           payload.prices_include_tax,
      p_show_tax_breakdown:           payload.show_tax_breakdown
  });
  ```
- **Validation**: Enforces non-negative tax rate.
- **Table Modified**: `shared.company_tax_settings`.

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

