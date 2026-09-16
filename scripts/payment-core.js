// scripts/payment-core.js

/**
 * Shared Core Payment Engine
 * Encapsulates:
 * - State management
 * - Discount waterfall calculation (Membership -> Coupon -> Offer -> Manual)
 * - Supabase lookups for Memberships, Offers, and Coupons
 * - Result payload construction & Currency formatting
 */

export function getCompanyAndBranchIds() {
    let companyId = null;
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        companyId = localStorage.getItem('company_id') || null;
    }
    const branchId = localStorage.getItem('active_branch_id')
        || document.getElementById('branchSelect')?.value
        || null;
    return { companyId, branchId };
}

export function createPaymentState() {
    return {
        method: 'cash',
        discountType: 'flat', // 'flat' or 'percent'
        discountValue: 0,
        appliedCoupon: null,     // { id, code, type, value }
        appliedMembership: null, // { name, type, value }
        appliedOffer: null,      // { id, name, type, value }
        finalDue: 0,
        finalPayable: 0,
        breakdown: []
    };
}

export function formatCurrency(amount) {
    const num = Number(amount || 0);
    return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export function calculateFinalDue(config, state) {
    if (!config) return { finalDue: 0, finalPayable: 0, breakdown: [] };

    const baseAmount = Number(config.totalAmount || 0);
    let runningAmount = baseAmount;
    let totalDiscount = 0;
    const breakdown = [];

    breakdown.push({
        label: 'Subtotal',
        amount: baseAmount,
        type: 'subtotal',
        formatted: formatCurrency(baseAmount)
    });

    // 1. Membership Discount
    let memDiscount = 0;
    if (state.appliedMembership && state.appliedMembership.value > 0) {
        if (state.appliedMembership.type === 'percentage') {
            memDiscount = runningAmount * (state.appliedMembership.value / 100);
        } else {
            memDiscount = Number(state.appliedMembership.value);
        }
        if (memDiscount > runningAmount) memDiscount = runningAmount;
        totalDiscount += memDiscount;
        runningAmount -= memDiscount;

        const valLabel = state.appliedMembership.type === 'percentage'
            ? `${state.appliedMembership.value}%`
            : `₹${state.appliedMembership.value}`;

        breakdown.push({
            label: `Membership (${state.appliedMembership.name} — ${valLabel})`,
            amount: -memDiscount,
            type: 'discount',
            formatted: `-${formatCurrency(memDiscount)}`
        });
    }

    // 2. Coupon Discount
    let coupDiscount = 0;
    if (state.appliedCoupon && state.appliedCoupon.value > 0) {
        if (state.appliedCoupon.type === 'percentage') {
            coupDiscount = runningAmount * (state.appliedCoupon.value / 100);
        } else {
            coupDiscount = Number(state.appliedCoupon.value);
        }
        if (coupDiscount > runningAmount) coupDiscount = runningAmount;
        totalDiscount += coupDiscount;
        runningAmount -= coupDiscount;

        const valLabel = state.appliedCoupon.type === 'percentage'
            ? `${state.appliedCoupon.value}%`
            : `₹${state.appliedCoupon.value}`;

        breakdown.push({
            label: `Coupon (${state.appliedCoupon.code} — ${valLabel})`,
            amount: -coupDiscount,
            type: 'discount',
            formatted: `-${formatCurrency(coupDiscount)}`
        });
    }

    // 3. Offer Discount
    let offerDiscount = 0;
    if (state.appliedOffer && state.appliedOffer.value > 0) {
        if (state.appliedOffer.type === 'percentage') {
            offerDiscount = runningAmount * (state.appliedOffer.value / 100);
        } else {
            offerDiscount = Number(state.appliedOffer.value);
        }
        if (offerDiscount > runningAmount) offerDiscount = runningAmount;
        totalDiscount += offerDiscount;
        runningAmount -= offerDiscount;

        const valLabel = state.appliedOffer.type === 'percentage'
            ? `${state.appliedOffer.value}%`
            : `₹${state.appliedOffer.value}`;

        breakdown.push({
            label: `Offer (${state.appliedOffer.name} — ${valLabel})`,
            amount: -offerDiscount,
            type: 'discount',
            formatted: `-${formatCurrency(offerDiscount)}`
        });
    }

    // 4. Manual Discount
    let manDiscount = 0;
    if (state.discountValue > 0) {
        if (state.discountType === 'percent') {
            manDiscount = runningAmount * (state.discountValue / 100);
        } else {
            manDiscount = Number(state.discountValue);
        }
        if (manDiscount > runningAmount) manDiscount = runningAmount;
        totalDiscount += manDiscount;
        runningAmount -= manDiscount;

        const valLabel = state.discountType === 'percent'
            ? `${state.discountValue}%`
            : `₹${state.discountValue}`;

        breakdown.push({
            label: `Manual Discount (${valLabel})`,
            amount: -manDiscount,
            type: 'discount',
            formatted: `-${formatCurrency(manDiscount)}`
        });
    }

    let finalPayable = Math.max(0, baseAmount - totalDiscount);
    const alreadyPaid = Number(config.amountPaid || 0);

    if (alreadyPaid > 0) {
        breakdown.push({
            label: 'Already Paid',
            amount: -alreadyPaid,
            type: 'paid',
            formatted: `-${formatCurrency(alreadyPaid)}`
        });
    }

    let finalDue = Math.max(0, finalPayable - alreadyPaid);

    breakdown.push({
        label: 'Final Due',
        amount: finalDue,
        type: 'total',
        formatted: formatCurrency(finalDue)
    });

    state.finalPayable = finalPayable;
    state.finalDue = finalDue;
    state.breakdown = breakdown;

    return {
        baseAmount,
        totalDiscount,
        finalPayable: Math.round(finalPayable),
        finalDue: Math.round(finalDue),
        breakdown
    };
}

export async function fetchCustomerMembership(customerId, supabaseClient) {
    if (!customerId) return null;
    try {
        let supabase = supabaseClient;
        if (!supabase) {
            const mod = await import('../lib/supabase.js');
            supabase = mod.supabase;
        }

        const today = new Date().toISOString().split('T')[0];

        // Step 1: Active membership purchase for customer
        const { data: purchases, error: pErr } = await supabase
            .from('membership_purchases')
            .select('membership_id, plan_name, expiry_date')
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .gte('expiry_date', today)
            .limit(1);

        if (pErr || !purchases || purchases.length === 0) {
            return null;
        }

        const purchase = purchases[0];

        // Step 2: Fetch discount values from memberships
        const { data: membership, error: mErr } = await supabase
            .from('memberships')
            .select('plan_name, discount_type, discount_value')
            .eq('membership_id', purchase.membership_id)
            .single();

        if (mErr || !membership || !membership.discount_value) {
            return null;
        }

        return {
            name: membership.plan_name || purchase.plan_name,
            type: membership.discount_type, // 'percentage' or 'flat'
            value: Number(membership.discount_value)
        };
    } catch (err) {
        console.error('[PaymentCore] Error fetching membership:', err);
        return null;
    }
}

export async function fetchActiveOffers(companyId, branchId, supabaseClient) {
    try {
        let supabase = supabaseClient;
        if (!supabase) {
            const mod = await import('../lib/supabase.js');
            supabase = mod.supabase;
        }

        if (!companyId || !branchId) {
            const ids = getCompanyAndBranchIds();
            companyId = companyId || ids.companyId;
            branchId = branchId || ids.branchId;
        }

        if (!companyId || !branchId) {
            console.warn('[PaymentCore] Missing companyId or branchId for offers');
            return [];
        }

        const { data, error } = await supabase
            .from('offers')
            .select('offer_id, offer_name, discount_type, discount_value')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('status', 'active');

        if (error) throw error;

        // Dedup — group by offer_id
        const seen = new Map();
        (data || []).forEach(o => {
            if (!seen.has(o.offer_id)) {
                seen.set(o.offer_id, {
                    offer_id: o.offer_id,
                    offer_name: o.offer_name,
                    discount_type: o.discount_type,
                    discount_value: Number(o.discount_value)
                });
            }
        });
        return Array.from(seen.values());
    } catch (err) {
        console.error('[PaymentCore] Error fetching offers:', err);
        return [];
    }
}

export async function validateCouponCode(code, companyId, branchId, serviceIds = [], supabaseClient) {
    let supabase = supabaseClient;
    if (!supabase) {
        const mod = await import('../lib/supabase.js');
        supabase = mod.supabase;
    }

    if (!companyId || !branchId) {
        const ids = getCompanyAndBranchIds();
        companyId = companyId || ids.companyId;
        branchId = branchId || ids.branchId;
    }

    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) throw new Error('Please enter a coupon code.');

    const { data: rows, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .eq('coupon_code', cleanCode)
        .eq('status', 'active');

    if (error || !rows || rows.length === 0) {
        throw new Error('Invalid or inactive coupon code.');
    }

    let match = null;
    if (serviceIds && serviceIds.length > 0) {
        match = rows.find(r => r.service_id && serviceIds.includes(r.service_id)) || null;
        if (!match) match = rows.find(r => !r.service_id) || null;
        if (!match) throw new Error('This coupon is not applicable to the selected service(s).');
    } else {
        match = rows.find(r => !r.service_id) || rows[0];
    }

    const now = new Date();
    if (match.valid_from && new Date(match.valid_from) > now) {
        throw new Error('Coupon is not active yet.');
    }
    if (match.valid_to && new Date(match.valid_to) < now) {
        throw new Error('Coupon has expired.');
    }
    if (match.total_usage_limit && match.current_usage_count >= match.total_usage_limit) {
        throw new Error('Coupon usage limit reached.');
    }

    return {
        id: match.coupon_id,
        code: match.coupon_code,
        type: match.discount_type,
        value: Number(match.discount_value)
    };
}

export function buildResultPayload(config, state) {
    return {
        paymentMethod: state.method,
        amountCollected: Math.round(state.finalDue),
        finalTotal: Math.round(state.finalPayable || state.finalDue),
        discounts: {
            manualType: state.discountValue > 0 ? state.discountType : null,
            manualValue: state.discountValue > 0 ? state.discountValue : 0,
            couponId: state.appliedCoupon ? state.appliedCoupon.id : null,
            couponCode: state.appliedCoupon ? state.appliedCoupon.code : null,
            offerId: state.appliedOffer ? state.appliedOffer.id : null,
            offerName: state.appliedOffer ? state.appliedOffer.name : null,
            membershipName: state.appliedMembership ? state.appliedMembership.name : null,
            membershipDiscountPct: (state.appliedMembership && state.appliedMembership.type === 'percentage') ? state.appliedMembership.value : 0
        }
    };
}

// Window global fallback
if (typeof window !== 'undefined') {
    window.PaymentCore = {
        getCompanyAndBranchIds,
        createPaymentState,
        formatCurrency,
        calculateFinalDue,
        fetchCustomerMembership,
        fetchActiveOffers,
        validateCouponCode,
        buildResultPayload
    };
}
