// scripts/global-payment-modal/gpm-state.js

/**
 * Shared Mutable State for Global Payment Modal
 */

export const gpmState = {
    globalPaymentConfig: null,
    paymentState: {
        method: 'cash',
        discountType: 'flat', // 'flat' or 'percent'
        discountValue: 0,
        appliedCoupon: null,     // { id, code, type, value }
        appliedMembership: null, // { name, type, value }
        appliedOffer: null,      // { id, name, type, value }
        offerDiscount: 0,
        finalDue: 0,
        cashReceived: 0,
        changeReturned: 0
    },
    liveOffersDB: []
};

/**
 * Reset payment state fields to defaults.
 * Called at the start of openGlobalPaymentModal().
 */
export function resetPaymentState(totalAmount = 0) {
    Object.assign(gpmState.paymentState, {
        method: 'cash',
        discountType: 'flat',
        discountValue: 0,
        appliedCoupon: null,
        appliedMembership: null,
        appliedOffer: null,
        offerDiscount: 0,
        finalDue: Number(totalAmount || 0),
        cashReceived: 0,
        changeReturned: 0
    });
    return gpmState.paymentState;
}

/**
 * Set the active global payment configuration.
 */
export function setGlobalPaymentConfig(config) {
    gpmState.globalPaymentConfig = config;
}

/**
 * Set live offers cache.
 */
export function setLiveOffersDB(offers) {
    gpmState.liveOffersDB = offers;
}
