// scripts/rebook-refund-modal.js
// Thin orchestrator for the rebook/refund modal system.
// Imports all sub-modules, exposes the global API contract, then injects modals.
//
// IMPORTANT — initialization order:
//   1. All sub-modules are imported (ES module static imports, synchronous)
//   2. window.processRefund is assigned FIRST (before ensureModalsInjected)
//      because the confirm-button listener inside ensureModalsInjected binds
//      to window.processRefund at injection time.
//   3. All other window APIs are assigned.
//   4. ensureModalsInjected() is called (or deferred to DOMContentLoaded).

import { ensureModalsInjected } from './rebook-refund/rebook-refund-modals-inject.js';
import { openCancelledBookingModal } from './rebook-refund/cancelled-booking-modal.js';
import { triggerRebook } from './rebook-refund/rebook-workflow.js';
import { openRefundModal } from './rebook-refund/refund-modal.js';
import { processRefund } from './rebook-refund/refund-workflow.js';

// ── Global API Contract ───────────────────────────────────────────────────────
// window.processRefund MUST be assigned before ensureModalsInjected() is called
// because the #btnConfirmRefund listener binds to window.processRefund by reference.
window.processRefund               = processRefund;
window.openCancelledBookingModal   = openCancelledBookingModal;
window.triggerRebook               = triggerRebook;
window.openRefundModal             = openRefundModal;

// ── Modal Auto-Injection ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalsInjected);
} else {
    ensureModalsInjected();
}
