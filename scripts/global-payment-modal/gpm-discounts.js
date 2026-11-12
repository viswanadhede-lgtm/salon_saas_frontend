// scripts/global-payment-modal/gpm-discounts.js
import { gpmState, setLiveOffersDB } from './gpm-state.js';
import { gpmFormatCurrency, calculateFinalDue } from './gpm-ui.js';
import { DiscountsManager } from '../discounts.js';

function resolveApplicableType(config) {
    const rawType = (config?.type || '').toLowerCase();
    if (rawType === 'pos') return 'product';
    if (rawType.includes('membership')) return 'membership';
    return 'service'; // default bookings/appointments
}

// ── 1. Fetch & Apply Customer Membership Perk ──────────────────────────────
export async function fetchCustomerMembership(customerId) {
    const { globalPaymentConfig, paymentState } = gpmState;
    const resultEl = document.getElementById('gpmMembershipResult');
    const subtitleEl = document.getElementById('gpmMembershipSubtitle');
    if (!resultEl) return false;

    if (!customerId) {
        paymentState.appliedMembership = null;
        document.getElementById('gpmMembershipSection')?.classList.remove('applied');
        resultEl.style.display = 'none';
        calculateFinalDue();
        return false;
    }

    resultEl.className = 'gpm-membership-result';
    resultEl.textContent = 'Checking active membership...';
    resultEl.style.display = 'block';

    try {
        const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
        const applicableType = resolveApplicableType(globalPaymentConfig);

        const res = await DiscountsManager.validateMembership('', {
            customerId,
            billAmount: baseAmount,
            applicableType
        });

        if (!res.valid) {
            paymentState.appliedMembership = null;
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = res.reason || 'No active membership discount.';
            if (subtitleEl) subtitleEl.textContent = 'No active membership';
            calculateFinalDue();
            return false;
        }

        // Mutual Exclusivity: Clear coupon and offer when membership is applied
        paymentState.appliedCoupon = null;
        paymentState.appliedOffer = null;
        resetCouponUi();
        resetOfferUi();

        paymentState.appliedMembership = {
            id: res.discount_id,
            name: res.discount_name,
            type: res.discount_calc_type,
            value: Number(res.discount_value),
            amount: Number(res.discount_amount)
        };

        const valStr = res.discount_calc_type === 'percentage'
            ? `${res.discount_value}% OFF`
            : gpmFormatCurrency(res.discount_value) + ' OFF';

        resultEl.className = 'gpm-membership-result found';
        resultEl.textContent = `✓ ${res.discount_name} (${valStr}) applied!`;
        if (subtitleEl) subtitleEl.textContent = `${res.discount_name} active`;
        document.getElementById('gpmMembershipSection')?.classList.add('applied');

        calculateFinalDue();
        return true;
    } catch (err) {
        console.error('[PaymentModal] Error checking customer membership:', err);
        paymentState.appliedMembership = null;
        document.getElementById('gpmMembershipSection')?.classList.remove('applied');
        resultEl.className = 'gpm-membership-result not-found';
        resultEl.textContent = 'Error checking membership.';
        calculateFinalDue();
        return false;
    }
}

// ── 2. Apply Coupon Code ───────────────────────────────────────────────────
export async function applyCouponCode() {
    const { globalPaymentConfig, paymentState } = gpmState;
    const codeInput = document.getElementById('gpmCouponInput');
    const msgEl = document.getElementById('gpmCouponMsg');
    const btnApply = document.getElementById('gpmBtnApplyCoupon');
    if (!codeInput || !btnApply || !msgEl) return;

    const code = codeInput.value.trim().toUpperCase();

    if (paymentState.appliedCoupon) {
        // Toggle to Remove
        paymentState.appliedCoupon = null;
        resetCouponUi();
        calculateFinalDue();
        return;
    }

    if (!code) return;

    try {
        btnApply.textContent = '...';
        btnApply.disabled = true;

        const customerId = globalPaymentConfig?.customerId || gpmState.selectedCustomer?.id || null;
        const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
        const applicableType = resolveApplicableType(globalPaymentConfig);

        const res = await DiscountsManager.validateCoupon(code, {
            customerId,
            billAmount: baseAmount,
            applicableType
        });

        if (!res.valid) {
            throw new Error(res.reason || 'Invalid coupon code.');
        }

        // Mutual Exclusivity: Clear offer and membership when coupon is applied
        paymentState.appliedOffer = null;
        paymentState.appliedMembership = null;
        resetOfferUi();
        resetMembershipUi();

        paymentState.appliedCoupon = {
            id: res.discount_id,
            code: res.discount_name,
            name: res.discount_name,
            type: res.discount_calc_type,
            value: Number(res.discount_value),
            amount: Number(res.discount_amount)
        };

        const valStr = res.discount_calc_type === 'percentage'
            ? `${res.discount_value}% OFF`
            : gpmFormatCurrency(res.discount_value) + ' OFF';

        msgEl.textContent = `✓ ${valStr} applied!`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';

        codeInput.disabled = true;
        btnApply.textContent = 'Remove';
        btnApply.style.background = '#ef4444';
        btnApply.disabled = false;
        document.getElementById('gpmCouponSection')?.classList.add('applied');

        calculateFinalDue();
    } catch (err) {
        console.error('[PaymentModal] Coupon validation error:', err);
        paymentState.appliedCoupon = null;
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
        msgEl.textContent = err.message || 'Failed to apply coupon.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        btnApply.disabled = false;
        btnApply.textContent = 'Apply';
        btnApply.style.background = '#1e293b';
        calculateFinalDue();
    }
}

// ── 3. Load Available Promotional Offers ───────────────────────────────────
export async function loadAvailableOffers() {
    const { globalPaymentConfig } = gpmState;
    const offerSelect = document.getElementById('gpmOfferSelect');
    const offerMsg = document.getElementById('gpmOfferMsg');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    if (!offerSelect) return;

    offerSelect.innerHTML = '<option value="">Loading offers...</option>';
    offerSelect.disabled = true;
    if (offerMsg) offerMsg.style.display = 'none';
    if (btnClear) btnClear.style.display = 'none';

    try {
        const customerId = globalPaymentConfig?.customerId || gpmState.selectedCustomer?.id || null;
        const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
        const applicableType = resolveApplicableType(globalPaymentConfig);

        const res = await DiscountsManager.getAvailableDiscounts({
            customerId,
            billAmount: baseAmount,
            applicableType
        });

        const liveOffers = res?.offers || [];
        gpmState.liveOffersDB = liveOffers;

        if (liveOffers.length === 0) {
            offerSelect.innerHTML = '<option value="">No active offers available</option>';
            offerSelect.disabled = true;
        } else {
            offerSelect.disabled = false;
            let optionsHtml = '<option value="">Select an offer...</option>';
            liveOffers.forEach(o => {
                const badge = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
                const minStr = o.min_bill_amount > 0 ? ` (Min ₹${o.min_bill_amount})` : '';
                optionsHtml += `<option value="${o.offer_id}">${o.offer_name} — ${badge}${minStr}</option>`;
            });
            offerSelect.innerHTML = optionsHtml;
        }
    } catch (err) {
        console.warn('[PaymentModal] Failed to fetch offers:', err);
        offerSelect.innerHTML = '<option value="">No offers available</option>';
        offerSelect.disabled = true;
    }
}

// ── 4. Apply Selected Promotional Offer ────────────────────────────────────
export async function applySelectedOffer(offerId) {
    const { globalPaymentConfig, paymentState, liveOffersDB } = gpmState;
    const offerSelect = document.getElementById('gpmOfferSelect');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    const msgEl = document.getElementById('gpmOfferMsg');

    if (!offerId) {
        paymentState.appliedOffer = null;
        resetOfferUi();
        calculateFinalDue();
        return;
    }

    try {
        const customerId = globalPaymentConfig?.customerId || gpmState.selectedCustomer?.id || null;
        const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
        const applicableType = resolveApplicableType(globalPaymentConfig);

        const res = await DiscountsManager.validateOffer(offerId, {
            customerId,
            billAmount: baseAmount,
            applicableType
        });

        if (!res.valid) {
            paymentState.appliedOffer = null;
            resetOfferUi();
            if (msgEl) {
                msgEl.textContent = res.reason || 'Offer not valid for this transaction.';
                msgEl.style.color = '#ef4444';
                msgEl.style.display = 'block';
            }
            calculateFinalDue();
            return;
        }

        // Mutual Exclusivity: Clear coupon and membership when offer is applied
        paymentState.appliedCoupon = null;
        paymentState.appliedMembership = null;
        resetCouponUi();
        resetMembershipUi();

        paymentState.appliedOffer = {
            id: res.discount_id,
            name: res.discount_name,
            type: res.discount_calc_type,
            value: Number(res.discount_value),
            amount: Number(res.discount_amount)
        };

        if (btnClear) btnClear.style.display = 'inline-flex';
        if (msgEl) {
            const valStr = res.discount_calc_type === 'percentage'
                ? `${res.discount_value}% OFF`
                : `₹${res.discount_value} OFF`;
            msgEl.textContent = `✓ Offer applied: ${res.discount_name} (${valStr})`;
            msgEl.style.color = '#10b981';
            msgEl.style.display = 'block';
        }
        document.getElementById('gpmOffersSection')?.classList.add('applied');

        calculateFinalDue();
    } catch (err) {
        console.error('[PaymentModal] Error applying offer:', err);
        paymentState.appliedOffer = null;
        resetOfferUi();
        if (msgEl) {
            msgEl.textContent = err.message || 'Failed to apply offer.';
            msgEl.style.color = '#ef4444';
            msgEl.style.display = 'block';
        }
        calculateFinalDue();
    }
}

// ── UI Reset Helpers for Mutual Exclusivity ────────────────────────────────
function resetCouponUi() {
    const codeInput = document.getElementById('gpmCouponInput');
    const msgEl = document.getElementById('gpmCouponMsg');
    const btnApply = document.getElementById('gpmBtnApplyCoupon');
    if (codeInput) {
        codeInput.value = '';
        codeInput.disabled = false;
    }
    if (btnApply) {
        btnApply.textContent = 'Apply';
        btnApply.style.background = '#1e293b';
        btnApply.disabled = false;
    }
    if (msgEl) msgEl.style.display = 'none';
    document.getElementById('gpmCouponSection')?.classList.remove('applied');
}

function resetOfferUi() {
    const offerSelect = document.getElementById('gpmOfferSelect');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    const msgEl = document.getElementById('gpmOfferMsg');
    if (offerSelect) offerSelect.value = '';
    if (btnClear) btnClear.style.display = 'none';
    if (msgEl) msgEl.style.display = 'none';
    document.getElementById('gpmOffersSection')?.classList.remove('applied');
}

function resetMembershipUi() {
    document.getElementById('gpmMembershipSection')?.classList.remove('applied');
    const resultEl = document.getElementById('gpmMembershipResult');
    if (resultEl) resultEl.style.display = 'none';
    const subtitleEl = document.getElementById('gpmMembershipSubtitle');
    if (subtitleEl) subtitleEl.textContent = 'Membership Perks';
}
