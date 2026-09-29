// scripts/global-payment-modal/gpm-discounts.js
import { gpmState, setLiveOffersDB } from './gpm-state.js';
import { gpmFormatCurrency, calculateFinalDue } from './gpm-ui.js';

export async function fetchCustomerMembership(customerId) {
    const { paymentState } = gpmState;
    const resultEl = document.getElementById('gpmMembershipResult');
    const subtitleEl = document.getElementById('gpmMembershipSubtitle');
    if (!resultEl) return false;

    resultEl.className = 'gpm-membership-result';
    resultEl.textContent = 'Checking active membership...';
    resultEl.style.display = 'block';

    try {
        const { supabase } = await import('../../lib/supabase.js');
        const today = new Date().toISOString().split('T')[0];

        const { data: purchases, error: pErr } = await supabase
            .from('membership_purchases')
            .select('membership_id, plan_name, expiry_date')
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .gte('expiry_date', today)
            .limit(1);

        if (pErr || !purchases || purchases.length === 0) {
            paymentState.appliedMembership = null;
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = 'No active membership found.';
            if (subtitleEl) subtitleEl.textContent = 'No active membership';
            calculateFinalDue();
            return false;
        }

        const purchase = purchases[0];

        const { data: membership, error: mErr } = await supabase
            .from('memberships')
            .select('plan_name, discount_type, discount_value')
            .eq('membership_id', purchase.membership_id)
            .single();

        if (mErr || !membership || !membership.discount_value) {
            paymentState.appliedMembership = null;
            document.getElementById('gpmMembershipSection')?.classList.remove('applied');
            resultEl.className = 'gpm-membership-result not-found';
            resultEl.textContent = 'Active membership has no discount.';
            calculateFinalDue();
            return false;
        }

        paymentState.appliedMembership = {
            name: membership.plan_name || purchase.plan_name,
            type: membership.discount_type,
            value: Number(membership.discount_value)
        };

        const valStr = membership.discount_type === 'percentage'
            ? `${membership.discount_value}% OFF`
            : gpmFormatCurrency(membership.discount_value) + ' OFF';

        resultEl.className = 'gpm-membership-result found';
        resultEl.textContent = `✓ ${paymentState.appliedMembership.name} (${valStr}) applied!`;
        if (subtitleEl) subtitleEl.textContent = `${paymentState.appliedMembership.name} active`;
        document.getElementById('gpmMembershipSection')?.classList.add('applied');

        calculateFinalDue();
        return true;
    } catch (err) {
        console.error('Error checking customer membership:', err);
        paymentState.appliedMembership = null;
        document.getElementById('gpmMembershipSection')?.classList.remove('applied');
        resultEl.className = 'gpm-membership-result not-found';
        resultEl.textContent = 'Error checking membership.';
        calculateFinalDue();
        return false;
    }
}

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
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
        codeInput.value = '';
        codeInput.disabled = false;
        btnApply.textContent = 'Apply';
        btnApply.style.background = '#1e293b';
        msgEl.style.display = 'none';
        calculateFinalDue();
        return;
    }

    if (!code) return;

    try {
        btnApply.textContent = '...';
        btnApply.disabled = true;

        const { supabase } = await import('../../lib/supabase.js');

        let companyId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch {
            companyId = localStorage.getItem('company_id') || null;
        }

        const branchId = localStorage.getItem('active_branch_id')
            || document.getElementById('branchSelect')?.value
            || null;

        let query = supabase
            .from('coupons')
            .select('*')
            .eq('coupon_code', code)
            .eq('status', 'active');

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data: rows, error } = await query;

        if (error || !rows || rows.length === 0) {
            throw new Error('Invalid or inactive coupon code.');
        }

        const serviceIds = globalPaymentConfig?.serviceIds || [];
        let couponData = null;

        if (serviceIds.length > 0) {
            couponData = rows.find(r => r.service_id && serviceIds.includes(r.service_id)) || null;
            if (!couponData) couponData = rows.find(r => !r.service_id) || null;
            if (!couponData) throw new Error('Coupon is not applicable to the selected service(s).');
        } else {
            couponData = rows.find(r => !r.service_id) || rows[0];
        }

        const now = new Date();
        if (couponData.valid_from && new Date(couponData.valid_from) > now) throw new Error('Coupon not active yet.');
        if (couponData.valid_to && new Date(couponData.valid_to) < now) throw new Error('Coupon expired.');

        paymentState.appliedCoupon = {
            id: couponData.coupon_id,
            code: couponData.coupon_code,
            type: couponData.discount_type,
            value: Number(couponData.discount_value)
        };

        const valStr = couponData.discount_type === 'percentage'
            ? `${couponData.discount_value}% OFF`
            : gpmFormatCurrency(couponData.discount_value) + ' OFF';

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
        console.error('Coupon validation error:', err);
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
        msgEl.textContent = err.message || 'Failed to apply coupon.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        btnApply.disabled = false;
        btnApply.textContent = 'Apply';
    }
}

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
        let companyId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch {
            companyId = localStorage.getItem('company_id') || null;
        }

        const branchId = localStorage.getItem('active_branch_id')
            || document.getElementById('branchSelect')?.value
            || null;

        const { supabase } = await import('../../lib/supabase.js');

        let query = supabase
            .from('offers')
            .select('offer_id, offer_name, discount_type, discount_value, min_bill_amount, valid_from, valid_to, service_id, service_name, total_usage_limit, current_usage_count')
            .eq('status', 'active');

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;
        if (error) throw error;

        const seen = new Map();
        const todayStr = new Date().toISOString().split('T')[0];

        (data || []).forEach(o => {
            // Check validity period
            if (o.valid_from && o.valid_from > todayStr) return;
            if (o.valid_to && o.valid_to < todayStr) return;

            // Check overall usage limit
            if (o.total_usage_limit && Number(o.current_usage_count || 0) >= Number(o.total_usage_limit)) return;

            if (!seen.has(o.offer_id)) {
                seen.set(o.offer_id, {
                    offer_id: o.offer_id,
                    offer_name: o.offer_name,
                    discount_type: (o.discount_type || 'percentage').toLowerCase(),
                    discount_value: Number(o.discount_value || 0),
                    min_bill_amount: Number(o.min_bill_amount || 0),
                    applicable_services: []
                });
            }

            if (o.service_id) {
                seen.get(o.offer_id).applicable_services.push({
                    service_id: o.service_id,
                    service_name: o.service_name || ''
                });
            }
        });

        // Filter offers based on service applicability if current checkout has services
        const currentServiceIds = [
            ...(globalPaymentConfig?.serviceIds || []),
            ...(globalPaymentConfig?.items || []).map(it => it.service_id || it.serviceId || it.id).filter(Boolean)
        ];

        const validOffers = Array.from(seen.values()).filter(o => {
            if (!o.applicable_services || o.applicable_services.length === 0) return true;
            if (currentServiceIds.length > 0) {
                return o.applicable_services.some(s => currentServiceIds.includes(s.service_id));
            }
            return true;
        });

        gpmState.liveOffersDB = validOffers;
        const liveOffersDB = validOffers;

        if (liveOffersDB.length === 0) {
            offerSelect.innerHTML = '<option value="">No active offers available</option>';
            offerSelect.disabled = true;
        } else {
            offerSelect.disabled = false;
            let optionsHtml = '<option value="">Select an offer...</option>';
            liveOffersDB.forEach(o => {
                const badge = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`;
                const minStr = o.min_bill_amount > 0 ? ` (Min ₹${o.min_bill_amount})` : '';
                optionsHtml += `<option value="${o.offer_id}">${o.offer_name} — ${badge}${minStr}</option>`;
            });
            offerSelect.innerHTML = optionsHtml;
        }
    } catch (err) {
        console.warn('Failed to fetch offers in payment modal:', err);
        offerSelect.innerHTML = '<option value="">No offers available</option>';
        offerSelect.disabled = true;
    }
}

export function applySelectedOffer(offerId) {
    const { globalPaymentConfig, paymentState, liveOffersDB } = gpmState;
    const offerSelect = document.getElementById('gpmOfferSelect');
    const btnClear = document.getElementById('gpmBtnClearOffer');
    const msgEl = document.getElementById('gpmOfferMsg');

    if (!offerId) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (msgEl) msgEl.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        calculateFinalDue();
        return;
    }

    const found = liveOffersDB.find(x => x.offer_id === offerId);
    if (!found) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (msgEl) msgEl.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        calculateFinalDue();
        return;
    }

    const baseAmount = Number(globalPaymentConfig?.totalAmount || 0);
    if (found.min_bill_amount && baseAmount < found.min_bill_amount) {
        paymentState.appliedOffer = null;
        document.getElementById('gpmOffersSection')?.classList.remove('applied');
        if (offerSelect) offerSelect.value = '';
        if (btnClear) btnClear.style.display = 'none';
        if (msgEl) {
            msgEl.textContent = `Offer requires a minimum bill of ₹${found.min_bill_amount}.`;
            msgEl.style.color = '#ef4444';
            msgEl.style.display = 'block';
        }
        calculateFinalDue();
        return;
    }

    paymentState.appliedOffer = {
        id: found.offer_id,
        name: found.offer_name,
        type: found.discount_type,
        value: found.discount_value
    };

    if (btnClear) btnClear.style.display = 'inline-flex';
    if (msgEl) {
        const valStr = found.discount_type === 'percentage' ? `${found.discount_value}% OFF` : `₹${found.discount_value} OFF`;
        msgEl.textContent = `✓ Offer applied: ${found.offer_name} (${valStr})`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';
    }
    document.getElementById('gpmOffersSection')?.classList.add('applied');

    calculateFinalDue();
}
