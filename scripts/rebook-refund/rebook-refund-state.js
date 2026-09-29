// scripts/rebook-refund/rebook-refund-state.js
// Shared transactional session state between openRefundModal and processRefund.
// Must not be placed on window — these are module-scope values shared via exports.

let activeRefundBookingId = null;
let activeRefundableAmount = 0;

export function getActiveRefundBookingId() {
    return activeRefundBookingId;
}

export function setActiveRefundBookingId(value) {
    activeRefundBookingId = value;
}

export function getActiveRefundableAmount() {
    return activeRefundableAmount;
}

export function setActiveRefundableAmount(value) {
    activeRefundableAmount = value;
}
