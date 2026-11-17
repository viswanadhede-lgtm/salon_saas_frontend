// scripts/memberships/memberships-state.js

// ── Shared Mutable State ───────────────────────────────────────────────────
let currentPlans = [];
let isEditing = false;
let currentEditId = null;
let planToDelete = null;
let allCustomers = [];
let selectedCustomer = null;
let currentPurchases = [];
let purchaseToCancel = null;
let refundableMembershipAmount = 0;
let purchaseToRefundObj = null;

// ── Context Helpers ────────────────────────────────────────────────────────
export const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        // appContext stores company as { company_id: '...' } not { id: '...' }
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};

export const getBranchId = () => {
    const raw = localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;
    if (!raw || raw === 'all' || raw === 'undefined' || raw === 'null') return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(raw) ? raw : null;
};

export const getUserId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.user?.id || ctx.user?.user_id || localStorage.getItem('user_id') || null;
    } catch {
        return localStorage.getItem('user_id') || null;
    }
};

export const getUserName = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.user?.name || (ctx.user?.first_name ? `${ctx.user.first_name} ${ctx.user.last_name || ''}`.trim() : null) || localStorage.getItem('user_name') || null;
    } catch {
        return localStorage.getItem('user_name') || null;
    }
};

// ── State Getters & Setters ────────────────────────────────────────────────
export const getCurrentPlans = () => currentPlans;
export const setCurrentPlans = (val) => {
    currentPlans = val || [];
    if (typeof window !== 'undefined') window.currentPlans = currentPlans;
    return currentPlans;
};


export const getIsEditing = () => isEditing;
export const setIsEditing = (val) => {
    isEditing = Boolean(val);
    return isEditing;
};

export const getCurrentEditId = () => currentEditId;
export const setCurrentEditId = (val) => {
    currentEditId = val;
    return currentEditId;
};

export const getPlanToDelete = () => planToDelete;
export const setPlanToDelete = (val) => {
    planToDelete = val;
    return planToDelete;
};

export const getAllCustomers = () => allCustomers;
export const setAllCustomers = (val) => {
    allCustomers = val || [];
    if (typeof window !== 'undefined') window.allCustomers = allCustomers;
    return allCustomers;
};

export const getSelectedCustomer = () => selectedCustomer;
export const setSelectedCustomer = (val) => {
    selectedCustomer = val;
    if (typeof window !== 'undefined') window.selectedCustomer = selectedCustomer;
    return selectedCustomer;
};

export const getCurrentPurchases = () => currentPurchases;
export const setCurrentPurchases = (val) => {
    currentPurchases = val || [];
    if (typeof window !== 'undefined') window.currentPurchases = currentPurchases;
    return currentPurchases;
};

export const getPurchaseToCancel = () => purchaseToCancel;
export const setPurchaseToCancel = (val) => {
    purchaseToCancel = val;
    return purchaseToCancel;
};

export const getRefundableMembershipAmount = () => refundableMembershipAmount;
export const setRefundableMembershipAmount = (val) => {
    refundableMembershipAmount = Number(val) || 0;
    return refundableMembershipAmount;
};

export const getPurchaseToRefundObj = () => purchaseToRefundObj;
export const setPurchaseToRefundObj = (val) => {
    purchaseToRefundObj = val;
    return purchaseToRefundObj;
};
