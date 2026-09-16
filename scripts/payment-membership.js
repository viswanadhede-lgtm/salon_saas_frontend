// scripts/payment-membership.js

import { supabase } from '../lib/supabase.js';
import {
    getCompanyAndBranchIds,
    formatCurrency
} from './payment-core.js';

let checkoutData = null;
let paymentMethod = 'cash';

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadMembershipCheckoutData();
});

function getCompanyId() {
    return getCompanyAndBranchIds().companyId;
}

function getBranchId() {
    return getCompanyAndBranchIds().branchId;
}

function loadMembershipCheckoutData() {
    const raw = sessionStorage.getItem('membership_checkout_data');
    if (!raw) {
        alert('No active membership checkout session found. Returning to memberships...');
        window.location.href = 'memberships.html';
        return;
    }

    try {
        checkoutData = JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse membership_checkout_data:', e);
        window.location.href = 'memberships.html';
        return;
    }

    const {
        selectedPlan = {},
        selectedCustomer = null,
        assignDate,
        expiryDate,
        newPurchaseId,
        custSearchValue = '',
        custNameValue = '',
        custEmailValue = ''
    } = checkoutData;

    const planPrice = Number(selectedPlan.price || 0);
    const planName = selectedPlan.plan_name || selectedPlan.name || 'Membership Plan';
    const durationMonths = selectedPlan.duration_months || selectedPlan.duration || 12;

    // Set Purchase Badge
    document.getElementById('badgePurchaseId').textContent = `PLAN #${(newPurchaseId || 'SUB').slice(0, 8).toUpperCase()}`;

    // Set Plan Details
    document.getElementById('planNameDisplay').textContent = planName;
    document.getElementById('planDurationDisplay').textContent = `Valid for ${durationMonths} Months`;
    document.getElementById('planPriceDisplay').textContent = formatCurrency(planPrice);

    // Set Perks Description
    const discountVal = selectedPlan.discount_value;
    const discountType = selectedPlan.discount_type;
    let discountStr = 'Exclusive perks included';
    if (discountVal) {
        discountStr = discountType === 'percentage'
            ? `${discountVal}% discount on all salon services`
            : `₹${discountVal} flat discount on all salon services`;
    }
    document.getElementById('perkDiscountDisplay').textContent = discountStr;

    // Set Customer Info
    const custName = selectedCustomer
        ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim()
        : custNameValue || 'Customer';
    const custPhone = selectedCustomer
        ? (selectedCustomer.customer_phone || selectedCustomer.phone || '').toString()
        : custSearchValue || 'N/A';

    document.getElementById('custNameDisplay').textContent = custName;
    document.getElementById('custPhoneDisplay').textContent = custPhone;
    document.getElementById('custAvatar').textContent = (custName[0] || 'C').toUpperCase();

    // Dates
    document.getElementById('startDateDisplay').textContent = assignDate || new Date().toISOString().split('T')[0];
    document.getElementById('expiryDateDisplay').textContent = expiryDate || '--';

    // Summary Box
    document.getElementById('summaryPlanFee').textContent = formatCurrency(planPrice);
    document.getElementById('summaryTotalDue').textContent = formatCurrency(planPrice);
    document.getElementById('btnActivateText').textContent = `Activate & Collect (${formatCurrency(planPrice)})`;
}

function initEvents() {
    // Payment Method Selection
    document.querySelectorAll('.method-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.method-card').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            paymentMethod = target.dataset.method;
        });
    });

    // Activate Membership Click
    document.getElementById('btnActivateMembership').addEventListener('click', finalizeMembershipAssignment);

    // Print Receipt
    document.getElementById('btnPrintReceipt')?.addEventListener('click', () => {
        window.print();
    });
}

async function finalizeMembershipAssignment() {
    if (!checkoutData) return;

    const btn = document.getElementById('btnActivateMembership');
    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader"></i> Activating Membership...`;
    if (window.feather) feather.replace();

    try {
        const {
            selectedPlan = {},
            selectedCustomer = null,
            assignDate,
            expiryDate,
            newPurchaseId,
            custSearchValue = '',
            custNameValue = '',
            custEmailValue = ''
        } = checkoutData;

        const companyId = getCompanyId();
        const branchId = getBranchId();
        const planPrice = Number(selectedPlan.price || 0);
        const refNote = document.getElementById('paymentRefInput').value.trim();

        // 1. Resolve Customer ID
        let finalCustomerId = selectedCustomer ? (selectedCustomer.id || selectedCustomer.customer_id) : null;
        let finalCustomerName = selectedCustomer ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() : custNameValue;

        if (!finalCustomerId) {
            // Check if customer already exists by phone
            const { data: existingCust } = await supabase
                .from('customers')
                .select('*')
                .eq('company_id', companyId)
                .eq('customer_phone', custSearchValue)
                .maybeSingle();

            if (existingCust) {
                finalCustomerId = existingCust.customer_id || existingCust.id;
                finalCustomerName = existingCust.customer_name || finalCustomerName;
            } else {
                // Create new customer
                const { data: newCust, error: custErr } = await supabase
                    .from('customers')
                    .insert({
                        company_id: companyId,
                        branch_id: branchId,
                        customer_name: finalCustomerName || 'Walk-in Customer',
                        customer_phone: custSearchValue,
                        customer_email: custEmailValue || null,
                        status: 'active'
                    })
                    .select();

                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    finalCustomerId = newCust[0].customer_id || newCust[0].id;
                }
            }
        }

        // 2. Extract staff/user info
        let userId = null;
        let userName = null;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            userId = ctx.user?.id || ctx.user?.user_id;
            userName = ctx.user?.name || (ctx.user?.first_name ? `${ctx.user.first_name} ${ctx.user.last_name || ''}`.trim() : null);
        } catch {}

        // 3. Insert into membership_purchases
        const duration = selectedPlan.duration_months || selectedPlan.duration;
        const purchaseDate = assignDate || new Date().toISOString().split('T')[0];

        const membershipPayload = {
            purchase_id: newPurchaseId,
            company_id: companyId,
            branch_id: branchId,
            assigned_by_user_id: userId,
            assigned_by_user_name: userName,
            customer_id: finalCustomerId,
            customer_name: finalCustomerName,
            membership_id: selectedPlan.membership_id || selectedPlan.id,
            plan_name: selectedPlan.plan_name || selectedPlan.name,
            price: planPrice,
            duration: duration,
            payment_method: (paymentMethod || 'cash').toLowerCase(),
            payment_status: 'paid',
            purchase_date: purchaseDate,
            expiry_date: expiryDate,
            status: 'active',
            discount_type: null,
            discount_name: null,
            discount_amount: null,
            final_amount: planPrice
        };

        const { error: purchaseError } = await supabase
            .from('membership_purchases')
            .insert(membershipPayload);

        if (purchaseError) throw purchaseError;

        // 4. Insert into business_transactions
        const paidAt = new Date().toISOString().replace('Z', '');
        await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: newPurchaseId,
                reference_type: 'membership',
                amount: planPrice,
                currency: 'INR',
                payment_method: (paymentMethod || 'cash').toLowerCase(),
                status: 'paid',
                notes: refNote ? `Membership: ${membershipPayload.plan_name}. Ref: ${refNote}` : `Membership Enrollment: ${membershipPayload.plan_name}`,
                paid_at: paidAt,
                final_amount: planPrice,
                discount_type: null,
                discount_name: null,
                discount_amount: null
            });

        // 5. Notify events
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_membership_purchased', {
                title: 'Membership Purchased',
                message: `${finalCustomerName} purchased ${membershipPayload.plan_name}.`
            });
        }

        // Clear session data
        sessionStorage.removeItem('membership_checkout_data');

        // Show Success Overlay
        document.getElementById('successSummaryText').textContent = `${formatCurrency(planPrice)} collected via ${paymentMethod.toUpperCase()} for ${membershipPayload.plan_name}.`;
        document.getElementById('successOverlay').classList.add('active');

    } catch (err) {
        console.error('Membership assignment error:', err);
        alert(err.message || 'An error occurred during membership activation.');
        btn.disabled = false;
        btn.innerHTML = `<i data-feather="check-circle"></i> Activate & Collect (${formatCurrency(checkoutData?.selectedPlan?.price || 0)})`;
        if (window.feather) feather.replace();
    }
}
