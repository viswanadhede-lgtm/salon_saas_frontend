// scripts/memberships.js - Main Memberships Application Orchestrator

import {
    fetchServices,
    loadPlans,
    initPlanListeners,
    editPlan,
    deletePlan
} from './memberships/memberships-plans.js';

import {
    fetchCustomers,
    initAssignModalListeners,
    resetAssignMembershipForm,
    renewMembershipPurchase
} from './memberships/memberships-assign-modal.js';

import { loadPurchases } from './memberships/memberships-purchases-table.js';
import { viewMembershipSummary } from './memberships/memberships-summary-modal.js';
import { cancelMembershipPurchase, viewPurchaseNotes } from './memberships/memberships-cancellation.js';
import { refundMembershipPurchase, viewRefundInfo } from './memberships/memberships-refund.js';

// ── Global Window API Contract (Required for HTML & Table Row Handlers) ──────
if (typeof window !== 'undefined') {
    window.resetAssignMembershipForm = resetAssignMembershipForm;
    window.editPlan = editPlan;
    window.deletePlan = deletePlan;
    window.viewMembershipSummary = viewMembershipSummary;
    window.cancelMembershipPurchase = cancelMembershipPurchase;
    window.refundMembershipPurchase = refundMembershipPurchase;
    window.viewPurchaseNotes = viewPurchaseNotes;
    window.viewRefundInfo = viewRefundInfo;
    window.renewMembershipPurchase = renewMembershipPurchase;
}

// ── Lifecycle & Boot Sequence ──────────────────────────────────────────────
async function initMemberships() {
    // 1. Initialize modal & control event listeners
    initPlanListeners();
    initAssignModalListeners();

    // 2. Fetch prerequisite entities
    await fetchServices();
    await fetchCustomers();

    // 3. Load core dataset
    await loadPlans();
    await loadPurchases();

    // 4. Reload when active branch changes
    document.getElementById('branchSelect')?.addEventListener('change', async () => {
        await loadPlans();
        await loadPurchases();
    });
}

// ── DOM Readiness ──────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMemberships);
} else {
    initMemberships();
}

export {
    initMemberships,
    resetAssignMembershipForm,
    editPlan,
    deletePlan,
    viewMembershipSummary,
    cancelMembershipPurchase,
    refundMembershipPurchase,
    viewPurchaseNotes,
    viewRefundInfo,
    renewMembershipPurchase
};
