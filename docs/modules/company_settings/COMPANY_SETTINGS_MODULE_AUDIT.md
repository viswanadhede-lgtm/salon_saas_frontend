# Module 11: Company, Branches & Settings — Module Audit

## Status: ✅ COMPLETE (100% Migrated, Tested, Verified, Audited)

**Migrations**: 
- `20261103000016a_harden_branches.sql`
- `20261103000016b_harden_settings.sql`

**Integration Tests**: `scratch/run_test_company_settings.js` $\rightarrow$ **18/18 PASSED**  
**Zero-Mutation Audit**: `scratch/audit_company_settings_mutations.js` $\rightarrow$ **0 violations across all 10 files**

---

## 1. Stored Procedures Deployed

| # | Stored Procedure | Schemas | Description & Invariants Enforced |
|---|---|---|---|
| 1 | `create_branch_atomic` | `app`, `public` | Tenant validation, required non-empty branch name, unique branch name per company, optional manager validation. |
| 2 | `update_branch_atomic` | `app`, `public` | Tenant validation, active branch check, name collision check against other branches in company. |
| 3 | `toggle_branch_status_atomic` | `app`, `public` | Flips `active` $\leftrightarrow$ `inactive`. Rejects deactivating the only remaining active branch of a company. |
| 4 | `delete_branch_atomic` | `app`, `public` | Soft-deletes branch (`status = 'deleted'`). Guards against deleting the company's only branch, active bookings blocker, assigned active staff blocker. |
| 5 | `save_billing_information_atomic` | `app`, `public` | Saves legal invoicing details into `company_billing_information` (with `save_billing_information` compatibility alias). |
| 6 | `save_invoice_settings_atomic` | `app`, `public` | Single atomic upsert for common, booking, pos, and membership invoice styling/settings on composite key `(company_id, branch_id)`. |
| 7 | `save_notification_settings_atomic` | `app`, `public` | Single atomic upsert for system, customer, and marketing alert preferences on composite key `(company_id, branch_id)`. |
| 8 | `save_business_payment_settings_atomic` | `app`, `public` | Atomic upsert for payment methods and UPI QR URLs; enforces that at least one payment method remains enabled. |
| 9 | `save_company_tax_settings_atomic` | `app`, `public` | Atomic upsert for GSTIN, PAN, and tax rates; asserts non-negative tax rate. |

---

## 2. Integration Test Results

```text
[PASS] T1:  create_branch_atomic (valid)
[PASS] T2:  Duplicate branch name rejected
[PASS] T3:  Empty branch name rejected
[PASS] T4:  update_branch_atomic (valid)
[PASS] T5:  Branch name collision rejected
[PASS] T6:  toggle_branch_status_atomic (flip to inactive)
[PASS] T7:  Invalid status rejected
[PASS] T8:  delete_branch_atomic (valid)
[PASS] T8b: Branch verified as deleted in DB
[PASS] T9:  save_billing_information_atomic (valid)
[PASS] T9b: save_billing_information compatibility alias
[PASS] T10: save_invoice_settings_atomic (valid)
[PASS] T11: save_notification_settings_atomic (valid)
[PASS] T12: save_business_payment_settings_atomic (valid)
[PASS] T13: All payment methods disabled rejected
[PASS] T14: save_company_tax_settings_atomic (valid)
[PASS] T15: Negative tax rate rejected
[PASS] T16: Tenant isolation enforced

=========================================
MODULE 11 COMPANY SETTINGS RESULTS: 18 passed, 0 failed out of 18 tests
✅ ALL TESTS PASSED — Module 11 is production-ready.
=========================================
```

---

## 3. Frontend Refactoring & Direct Mutations Eliminated

| File | Eliminated Direct Mutations | Replacement / Action |
|---|---|---|
| `branches.js` | 4 mutations (lines 303, 388, 539, 554) | Replaced with `toggle_branch_status_atomic`, `delete_branch_atomic`, `update_branch_atomic`, and `create_branch_atomic`. |
| `scripts/billing/billing-modal-billing.js` | 2 mutations (lines 154, 162) | Removed direct table insert/update fallback; authoritative RPC `save_billing_information` handles all operations. |
| `scripts/invoice-state.js` | 1 mutation (line 511) | Replaced direct upsert with `save_invoice_settings_atomic`. |
| `scripts/settings-notifications.js` | 1 mutation (line 563) | Replaced direct upsert with `save_notification_settings_atomic`. |
| `scripts/settings-payments.js` | 1 mutation (line 302) | Replaced direct upsert with `save_business_payment_settings_atomic`. |
| `scripts/settings-tax.js` | 1 mutation (line 148) | Replaced direct upsert with `save_company_tax_settings_atomic`. |

**Total Eliminated**: 10 direct table mutations eliminated across 6 files.

---

## 4. Zero-Mutation Audit Log

```text
========== COMPANY, BRANCHES & SETTINGS MODULE MUTATION AUDIT ==========
  [CLEAN] branches.js
  [CLEAN] scripts/billing/billing-modal-billing.js
  [CLEAN] scripts/invoice-state.js
  [CLEAN] scripts/settings-notifications.js
  [CLEAN] scripts/settings-payments.js
  [CLEAN] scripts/settings-tax.js
  [CLEAN] scripts/settings-business.js
  [CLEAN] scripts/settings-contact.js
  [CLEAN] scripts/settings-hours.js
  [CLEAN] onboarding.js
========================================================================
✅ PERFECT: 0 direct company/branch/settings table mutations found.
Module 11 frontend refactoring is 100% complete.
```

