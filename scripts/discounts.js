// scripts/discounts.js
// ── Unified Discounts Manager (Frontend UX Orchestrator) ─────────────────────────
// Authoritative rules enforced on PostgreSQL via app.validate_discount & app.get_available_discounts.
// Supports: Coupons, Offers, and Membership perks with:
//   1. 1-time usage per customer enforcement
//   2. Optional minimum bill threshold
//   3. Scope booleans: all_services (Bookings), all_products (POS), all_memberships (Plans)
//   4. Active membership verification (non-expired, non-cancelled, non-refunded)
//   5. Mutual exclusivity: 1 discount per transaction

import { supabase } from '../lib/supabase.js';

function getActiveTenantContext(overrideCompanyId, overrideBranchId) {
    let companyId = overrideCompanyId;
    let branchId = overrideBranchId;

    if (!companyId) {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch (e) {
            companyId = localStorage.getItem('company_id') || null;
        }
    }

    if (!branchId) {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            branchId = ctx.branch?.id || localStorage.getItem('active_branch_id') || null;
        } catch (e) {
            branchId = localStorage.getItem('active_branch_id') || null;
        }
    }

    if (!branchId) {
        branchId = document.getElementById('branchSelect')?.value || null;
    }

    return { companyId, branchId };
}

export const DiscountsManager = {
    /**
     * Authoritative Discount Validation
     * @param {Object} params
     * @param {string} params.discountType - 'coupon' | 'offer' | 'membership'
     * @param {string} params.codeOrId - Coupon code string or UUID of offer/membership
     * @param {number} [params.billAmount=0] - Subtotal before discount
     * @param {string} [params.customerId=null] - Customer UUID (needed for 1-time check & membership)
     * @param {string} [params.applicableType='service'] - 'service' | 'product' | 'membership'
     * @param {string} [params.companyId] - Optional override
     * @param {string} [params.branchId] - Optional override
     */
    async validateDiscount({
        discountType,
        codeOrId,
        billAmount = 0,
        customerId = null,
        applicableType = 'service',
        companyId = null,
        branchId = null
    }) {
        const tenant = getActiveTenantContext(companyId, branchId);
        if (!tenant.companyId) {
            return { valid: false, reason: 'Company context missing.' };
        }

        try {
            const { data, error } = await supabase.rpc('validate_discount', {
                p_company_id: tenant.companyId,
                p_branch_id: tenant.branchId,
                p_discount_type: discountType,
                p_code_or_id: String(codeOrId || '').trim(),
                p_bill_amount: Number(billAmount || 0),
                p_customer_id: customerId || null,
                p_applicable_type: applicableType
            });

            if (error) throw error;
            return data || { valid: false, reason: 'Unknown validation error.' };
        } catch (err) {
            console.error('[DiscountsManager] validateDiscount error:', err);
            return { valid: false, reason: err.message || 'Failed to validate discount.' };
        }
    },

    /**
     * Shorthand: Validate Coupon Code
     */
    async validateCoupon(code, options = {}) {
        return await this.validateDiscount({
            discountType: 'coupon',
            codeOrId: code,
            ...options
        });
    },

    /**
     * Shorthand: Validate Offer
     */
    async validateOffer(offerId, options = {}) {
        return await this.validateDiscount({
            discountType: 'offer',
            codeOrId: offerId,
            ...options
        });
    },

    /**
     * Shorthand: Validate Membership Perk
     */
    async validateMembership(membershipId, options = {}) {
        return await this.validateDiscount({
            discountType: 'membership',
            codeOrId: membershipId || '',
            ...options
        });
    },

    /**
     * Fetch All Available Discounts for Customer & Cart
     * Returns active offers (1-time check applied) and active membership perk (if applicable).
     */
    async getAvailableDiscounts({
        customerId = null,
        billAmount = 0,
        applicableType = 'service',
        companyId = null,
        branchId = null
    } = {}) {
        const tenant = getActiveTenantContext(companyId, branchId);
        if (!tenant.companyId) {
            return { success: false, error: 'Company context missing.', membership: null, offers: [] };
        }

        try {
            const { data, error } = await supabase.rpc('get_available_discounts', {
                p_company_id: tenant.companyId,
                p_branch_id: tenant.branchId,
                p_customer_id: customerId || null,
                p_bill_amount: Number(billAmount || 0),
                p_applicable_type: applicableType
            });

            if (error) throw error;
            return data || { success: true, membership: null, offers: [] };
        } catch (err) {
            console.error('[DiscountsManager] getAvailableDiscounts error:', err);
            return { success: false, error: err.message, membership: null, offers: [] };
        }
    },

    /**
     * Enforce Mutual Exclusivity Helper
     * Ensures only 1 discount (Coupon OR Offer OR Membership) is applied.
     */
    selectSingleDiscount(currentSelection, newDiscountType, discountPayload) {
        const nextState = {
            appliedCoupon: null,
            appliedOffer: null,
            appliedMembership: null,
            activeDiscount: null
        };

        if (newDiscountType === 'coupon' && discountPayload) {
            nextState.appliedCoupon = discountPayload;
            nextState.activeDiscount = { type: 'coupon', ...discountPayload };
        } else if (newDiscountType === 'offer' && discountPayload) {
            nextState.appliedOffer = discountPayload;
            nextState.activeDiscount = { type: 'offer', ...discountPayload };
        } else if (newDiscountType === 'membership' && discountPayload) {
            nextState.appliedMembership = discountPayload;
            nextState.activeDiscount = { type: 'membership', ...discountPayload };
        }

        return nextState;
    }
};

if (typeof window !== 'undefined') {
    window.DiscountsManager = DiscountsManager;
}

