# Module 11: Company, Branches & Settings — Stage 1 Investigation

## 1. Overview & Scope

Module 11 governs workspace onboarding, branch management, company branding, contact details, branch-specific invoice settings, notification configurations, payment gateway/acceptance configurations, and tax/billing information.

**Tables Involved:**
| Table | Schema | Description |
|---|---|---|
| `companies` | `shared` | Root tenant company entity and subscription linkage |
| `branches` | `shared` | Multi-branch locations under a tenant |
| `company_settings` | `shared` | Branding, business category/structure, logo, social profiles |
| `company_contacts` | `shared` | Support & primary contact details, address coordinates |
| `company_billing_information` | `shared` | Legal invoicing details, tax registration addresses |
| `company_tax_settings` | `shared` | GSTIN, PAN, tax rate, pricing inclusive/exclusive flags |
| `invoice_settings` | `app` | Customizable layout & field templates for Pos, Booking, and Membership receipts |
| `notification_settings` | `app` | Channel & trigger toggles for system, customer, and marketing alerts |
| `business_payment_settings` | `app` | Accepted payment methods (Cash, Card, UPI, Online), QR code, notes |
| `billing_settings` | `app` | Legacy tax settings table (deprecated in favor of `company_tax_settings`) |

---

## 2. Pre-Existing Backend Procedures

The following procedures were previously defined in the `public` schema:
1. `onboard_company_workspace(p_data jsonb)` — Performs atomic workspace provisioning (company, branch, owner user, profile, roles, permissions, usage counters).
2. `save_business_settings(p_company_id uuid, p_data jsonb)` — Saves branding into `company_settings` and syncs with `companies`.
3. `save_contact_settings(p_company_id uuid, p_data jsonb)` — Saves contact information into `company_contacts` and syncs with `companies`.
4. `get_business_settings(p_company_id uuid)` — Read-only helper for business profile.

---

## 3. Direct Mutation Inventory (Frontend Codebase)

A comprehensive scan across `.js` and `.html` files identified **10 direct client mutations** across 6 files:

| # | File | Line | Table | Operation | Logic / Context |
|---|---|---|---|---|---|
| 1 | `branches.js` | 303 | `branches` | `update` | Toggle branch status (`active` $\leftrightarrow$ `inactive`) |
| 2 | `branches.js` | 388 | `branches` | `update` | Soft-delete branch (`status = 'deleted'`) |
| 3 | `branches.js` | 539 | `branches` | `update` | Update branch name, phone, address, coordinates |
| 4 | `branches.js` | 554 | `branches` | `insert` | Create new branch under company |
| 5 | `scripts/billing/billing-modal-billing.js` | 154 | `company_billing_information` | `update` | Direct table update fallback when RPC `save_billing_information` is missing |
| 6 | `scripts/billing/billing-modal-billing.js` | 162 | `company_billing_information` | `insert` | Direct table insert fallback when RPC `save_billing_information` is missing |
| 7 | `scripts/invoice-state.js` | 511 | `invoice_settings` | `upsert` | Save receipts/invoice layout on conflict `(company_id, branch_id)` |
| 8 | `scripts/settings-notifications.js` | 563 | `notification_settings` | `upsert` | Save notification preferences on conflict `(company_id, branch_id)` |
| 9 | `scripts/settings-payments.js` | 302 | `business_payment_settings` | `upsert` | Save payment methods & UPI details on conflict `(company_id, branch_id)` |
| 10 | `scripts/settings-tax.js` | 148 | `company_tax_settings` | `upsert` | Save GSTIN/PAN and tax rates on conflict `company_id` |

---

## 4. Key Architectural & Security Rules

1. **Multi-Tenant Authorization**:
   - Every procedure must invoke `shared.verify_tenant_access(p_company_id, p_branch_id)`.
   - Operations that are company-wide (tax settings, billing info, business branding) pass `p_branch_id = NULL`.
2. **Branch Invariant Protections**:
   - A tenant cannot delete their **only active branch** (every salon must have at least 1 functional branch).
   - A branch cannot be deleted if active or upcoming bookings are scheduled for it.
   - A branch cannot be deleted if staff members are actively and exclusively assigned to it.
   - Deactivating the last active branch is prohibited.
3. **Receipt & Configuration Isolation**:
   - `invoice_settings`, `notification_settings`, and `business_payment_settings` are keyed by composite `(company_id, branch_id)`.
   - Stored procedures must handle atomic upsert (insert-or-update) to guarantee idempotency and eliminate concurrency race conditions.
4. **Authoritative Backend Migration**:
   - Replace the fallback in `billing-modal-billing.js` by officially deploying `save_billing_information_atomic`.
   - Expose all procedures in `app.*` and bridge via `public.*` with `SECURITY DEFINER` and hardened `SET search_path = platform, shared, app, public, pg_temp;`.

