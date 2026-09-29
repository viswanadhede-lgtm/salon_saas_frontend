// scripts/memberships/memberships-assign-modal.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPlans,
    getAllCustomers,
    setAllCustomers,
    getSelectedCustomer,
    setSelectedCustomer,
    getCurrentPurchases
} from './memberships-state.js';
import { showToast } from './memberships-utils.js';
import {
    fetchCustomersApi,
    checkDuplicateActivePurchaseApi,
    createCustomerApi,
    insertMembershipPurchaseApi
} from './memberships-api.js';
import { loadPurchases } from './memberships-purchases-table.js';

// ── Customers Fetch ────────────────────────────────────────────────────────
export async function fetchCustomers() {
    try {
        const { data, error } = await fetchCustomersApi(getCompanyId(), getBranchId());
        if (error) throw error;
        setAllCustomers(data || []);
    } catch (err) {
        console.error('Failed to load customers (Supabase):', err);
    }
}

// ── Populate Plan Dropdown in Assign Modal ─────────────────────────────────
export function populateAssignPlanDropdown() {
    const planSelect = document.getElementById('assignPlanInput');
    if (!planSelect) return;

    const currentPlans = getCurrentPlans();

    // Reset options
    planSelect.innerHTML = '<option value="" disabled selected>Choose a plan</option>';

    // Filter only active plans
    const activePlans = currentPlans.filter(p => p.status === 'active');
    
    activePlans.forEach(plan => {
        const option = document.createElement('option');
        const planId = plan.membership_id || plan.id;
        option.value = planId;
        const price = Number(plan.price || 0).toLocaleString('en-IN');
        option.textContent = `${plan.plan_name || plan.name} (₹${price})`;
        planSelect.appendChild(option);
    });
}

// ── Customer Form State Helper ─────────────────────────────────────────────
export function setCustFormState(isNew, name = '', email = '') {
    const custName = document.getElementById('assignCustomerName');
    const custEmail = document.getElementById('assignCustomerEmail');
    if (custName) {
        custName.value = name;
        custName.readOnly = !isNew;
        custName.classList.toggle('read-only-input', !isNew);
    }
    if (custEmail) {
        custEmail.value = email;
        custEmail.readOnly = !isNew;
        custEmail.classList.toggle('read-only-input', !isNew);
    }
}

// ── Update Assign Modal Summary & Dates ────────────────────────────────────
export function updateAssignModalSummary() {
    const assignPlanInput = document.getElementById('assignPlanInput');
    const currentPlans = getCurrentPlans();
    const planValue = assignPlanInput?.value;
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);
    const price = selectedPlan ? Number(selectedPlan.price || 0) : 0;
    
    const subElem = document.getElementById('assignSubtotal');
    const taxElem = document.getElementById('assignTax');
    const totElem = document.getElementById('assignTotal');
    
    if (subElem) subElem.textContent = `₹${price.toLocaleString('en-IN')}`;
    if (taxElem) taxElem.textContent = `₹0`;
    if (totElem) totElem.textContent = `₹${price.toLocaleString('en-IN')}`;

    // Populate plan summary card
    const summaryBody = document.getElementById('assignPlanSummaryBody');
    if (summaryBody) {
        if (selectedPlan) {
            const planName = selectedPlan.plan_name || selectedPlan.name || 'Unknown Plan';

            const dur = selectedPlan.duration_months || selectedPlan.duration || 0;
            const duration = dur ? `${dur} Month${dur > 1 ? 's' : ''}` : 'N/A';

            const isFlat = selectedPlan.discount_type === 'flat';
            const discountVal = selectedPlan.discount_value;
            const discountText = discountVal
                ? (isFlat ? `₹${discountVal} Off` : `${discountVal}% Off`)
                : null;

            const svcArr = Array.isArray(selectedPlan.applicable_services) ? selectedPlan.applicable_services : [];
            let servicesLine = '';
            if (svcArr.length > 0) {
                const firstName = svcArr[0].service_name || '';
                const extra = svcArr.length - 1;
                servicesLine = extra > 0 ? `${firstName} + ${extra} more service${extra > 1 ? 's' : ''}` : firstName;
            }

            summaryBody.innerHTML = `
                <div style="display: grid; grid-template-columns: 100px 1fr; gap: 6px; width: 100%;">
                    <span style="font-weight:600; color:#475569;">Plan Name</span>
                    <span style="font-weight:700; color:#1e293b;">: ${planName}</span>
                    
                    <span style="font-weight:600; color:#475569;">Plan Price</span>
                    <span style="color:#4f46e5; font-weight:600;">: ₹${price.toLocaleString('en-IN')}</span>
                    
                    <span style="font-weight:600; color:#475569;">Plan Duration</span>
                    <span style="color:#64748b;">: ${duration}</span>
                    
                    ${discountText ? `
                    <span style="font-weight:600; color:#475569;">Benefits</span>
                    <span style="color:#059669; font-weight:600;">: ${discountText}</span>
                    ` : ''}
                    
                    ${servicesLine ? `
                    <span style="font-weight:600; color:#475569;">Incl. Services</span>
                    <span style="color:#6366f1;">: ${servicesLine}</span>
                    ` : ''}
                </div>
            `;
        } else {
            summaryBody.innerHTML = `<span style="font-size:0.82rem; color:#94a3b8; font-style:italic;">Select a plan to see details</span>`;
        }
    }

    // Handle Purchase and Expiry Dates
    const datesContainer = document.getElementById('assignDatesContainer');
    const purchaseDateInput = document.getElementById('assignDateInput');
    const expiryDateInput = document.getElementById('assignExpiryInput');

    if (datesContainer && purchaseDateInput && expiryDateInput) {
        if (selectedPlan) {
            datesContainer.style.display = 'grid'; // Show container

            // Default purchase date to today if empty
            if (!purchaseDateInput.value) {
                purchaseDateInput.value = new Date().toISOString().split('T')[0];
            }

            // Function to calculate and set expiry date
            const updateExpiryDate = () => {
                const dur = selectedPlan.duration_months || selectedPlan.duration || 0;
                if (dur && purchaseDateInput.value) {
                    const pDate = new Date(purchaseDateInput.value);
                    pDate.setMonth(pDate.getMonth() + dur);
                    expiryDateInput.value = pDate.toISOString().split('T')[0];
                } else {
                    expiryDateInput.value = '';
                }
            };

            updateExpiryDate();

            // Listen for changes on purchase date to recalculate expiry
            purchaseDateInput.removeEventListener('change', updateExpiryDate);
            purchaseDateInput.addEventListener('change', updateExpiryDate);
        } else {
            datesContainer.style.display = 'none'; // Hide if no plan selected
        }
    }
}

// ── Reset Form ─────────────────────────────────────────────────────────────
export function resetAssignMembershipForm() {
    setSelectedCustomer(null);
    const searchInput = document.getElementById('custSearchInput');
    const nameInput = document.getElementById('assignCustomerName');
    const emailInput = document.getElementById('assignCustomerEmail');
    const planInput = document.getElementById('assignPlanInput');
    const notesInput = document.getElementById('assignNotes');
    
    if (searchInput) searchInput.value = '';
    if (nameInput) {
        nameInput.value = '';
        nameInput.readOnly = false;
        nameInput.classList.remove('read-only-input');
    }
    if (emailInput) {
        emailInput.value = '';
        emailInput.readOnly = false;
        emailInput.classList.remove('read-only-input');
    }
    if (planInput) planInput.value = '';
    if (notesInput) notesInput.value = '';

    const custBadge = document.getElementById('assignCustomerBadgeContainer');
    const newCustBadge = document.getElementById('assignNewCustomerBadgeContainer');
    if (custBadge) custBadge.style.display = 'none';
    if (newCustBadge) newCustBadge.style.display = 'none';

    // Clear and Hide Dates
    const purchaseDateInput = document.getElementById('assignDateInput');
    const expiryDateInput = document.getElementById('assignExpiryInput');
    const datesContainer = document.getElementById('assignDatesContainer');
    if (purchaseDateInput) purchaseDateInput.value = '';
    if (expiryDateInput) expiryDateInput.value = '';
    if (datesContainer) datesContainer.style.display = 'none';

    // Reset Plan Summary Card
    const summaryBody = document.getElementById('assignPlanSummaryBody');
    if (summaryBody) {
        summaryBody.innerHTML = `<span style="font-size:0.82rem; color:#94a3b8; font-style:italic;">Select a plan to see details</span>`;
    }

    const subtotal = document.getElementById('assignSubtotal');
    const tax = document.getElementById('assignTax');
    const total = document.getElementById('assignTotal');
    if (subtotal) subtotal.textContent = '₹0';
    if (tax) tax.textContent = '₹0';
    if (total) total.textContent = '₹0';
}

// ── Pre-Validate & Show Payment Modal ──────────────────────────────────────
export async function preValidateAndShowCollect() {
    const planValue = document.getElementById('assignPlanInput')?.value;
    const currentPlans = getCurrentPlans();
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);

    const selectedCustomer = getSelectedCustomer();
    const custSearchValue = document.getElementById('custSearchInput')?.value?.trim() || '';
    const custNameValue = document.getElementById('assignCustomerName')?.value?.trim() || '';

    if (!custSearchValue || custSearchValue.length < 10) {
        showToast('Please enter a valid 10-digit phone number.');
        return;
    }
    if (!selectedCustomer && !custNameValue) {
        showToast('Please enter the customer name.');
        return;
    }
    if (!planValue) {
        showToast('Please select a membership plan.');
        return;
    }

    const btn = document.getElementById('btnConfirmAssign');
    const origText = btn ? btn.innerHTML : 'Collect';
    if (btn) {
        btn.innerHTML = '<i data-feather="loader" class="spin" style="width: 18px; height: 18px;"></i> Processing...';
        btn.disabled = true;
        if (window.feather) feather.replace();
    }

    try {
        // Duplicate Check BEFORE creating DB records
        const finalCustomerId = selectedCustomer ? (selectedCustomer.id || selectedCustomer.customer_id) : null;
        if (finalCustomerId && planValue) {
            const { data: existing, error: checkErr } = await checkDuplicateActivePurchaseApi(
                finalCustomerId,
                planValue,
                getCompanyId(),
                getBranchId()
            );

            if (checkErr) throw checkErr;

            if (existing && existing.length > 0) {
                showToast('Membership is already assigned to this customer');
                if (btn) {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                    if (window.feather) feather.replace();
                }
                return;
            }
        }

        // If validations pass, show Collect Payment Modal
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.feather) feather.replace();
        }

        // Hide the assign modal
        document.getElementById('assignModalOverlay')?.classList.remove('active');

        // Generate purchase ID ahead of time so we have a reference
        const newPurchaseId = crypto.randomUUID();
        const price = selectedPlan ? Number(selectedPlan.price || 0) : 0;
        const planName = selectedPlan ? (selectedPlan.plan_name || selectedPlan.name) : 'Membership';
        const duration = selectedPlan?.duration_months || selectedPlan?.duration || 12;

        if (window.openGlobalPaymentModal) {
            window.openGlobalPaymentModal({
                type: 'membership',
                title: 'Membership Payment',
                saleId: newPurchaseId.slice(0, 8).toUpperCase(),
                customerId: finalCustomerId,
                customerName: selectedCustomer ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() : custNameValue,
                customerPhone: custSearchValue,
                totalAmount: price,
                amountDue: price,
                isMembershipPurchase: true,
                items: [{
                    name: planName,
                    subtitle: `${duration} Months Validity`,
                    quantity: 1,
                    price: price
                }],
                onComplete: async (payload) => {
                    await executeMembershipAssignment(payload, newPurchaseId);
                }
            });
        } else {
            showToast('Payment modal not loaded', true);
        }
    } catch (err) {
        console.error('preValidateAndShowCollect error:', err);
        showToast('Error: ' + (err.message || 'Verification failed. Assignment aborted.'));
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.feather) feather.replace();
        }
    }
}

// ── Execute Assignment on Payment Complete ─────────────────────────────────
export async function executeMembershipAssignment(payload, newPurchaseId) {
    const planValue = document.getElementById('assignPlanInput').value;
    const currentPlans = getCurrentPlans();
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);

    const custSearchValue = document.getElementById('custSearchInput').value.trim();
    const custNameValue = document.getElementById('assignCustomerName')?.value.trim();
    const custEmailValue = document.getElementById('assignCustomerEmail')?.value.trim();
    const assignDate = document.getElementById('assignDateInput')?.value || new Date().toISOString().split('T')[0];
    
    // Get active payment method and collected amount from payload
    let payMethod = payload.paymentMethod || 'cash';
    const finalPrice = payload.amountCollected || 0;

    const selectedCustomer = getSelectedCustomer();
    const allCustomers = getAllCustomers();

    // Create new customer if not selected
    let finalCustomerId = selectedCustomer ? (selectedCustomer.id || selectedCustomer.customer_id) : null;
    let finalCustomerName = selectedCustomer ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() : custNameValue;
    
    if (!finalCustomerId) {
        const inputDigits = custSearchValue.replace(/\D/g, '');
        const existingCust = allCustomers.find(c => {
            const p = String(c.customer_phone || c.phone_number || '').replace(/\D/g, '');
            return p === inputDigits || p === custSearchValue;
        });

        if (existingCust) {
            showToast('Customer already exists! Please select them from the dropdown list.', true);
            return;
        } else {
            try {
                const { data: newCust, error: custErr } = await createCustomerApi({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    customer_name: finalCustomerName || 'Unknown Customer',
                    customer_phone: custSearchValue,
                    customer_email: custEmailValue || null,
                    status: 'active'
                });
                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    finalCustomerId = newCust[0].id || newCust[0].customer_id;
                    allCustomers.push(newCust[0]);
                    setAllCustomers(allCustomers);
                }
            } catch (err) {
                console.error('Failed to create new customer:', err);
                showToast('Failed to create customer: ' + (err.message || ''));
                throw err;
            }
        }
    }
    
    // Extract user details
    const contextStr = localStorage.getItem('appContext');
    let userId = null;
    let userName = null;
    if (contextStr) {
        try {
            const context = JSON.parse(contextStr);
            userId = context.user?.id || context.user?.user_id;
            userName = context.user?.name || (context.user?.first_name ? `${context.user.first_name} ${context.user.last_name || ''}`.trim() : null);
        } catch (e) {}
    }

    const duration = selectedPlan ? (selectedPlan.duration_months || selectedPlan.duration) : null;
    const purchaseDate = assignDate || new Date().toISOString().split('T')[0];
    
    const domExpiry = document.getElementById('assignExpiryInput')?.value;
    
    // Javascript calculated Expiry Date (fallback)
    let expiryDate = domExpiry || null;
    if (!expiryDate && purchaseDate && duration) {
        const d = new Date(purchaseDate);
        d.setMonth(d.getMonth() + parseInt(duration, 10));
        expiryDate = d.toISOString().split('T')[0];
    }

    // Determine actual total price of plan
    const planPrice = selectedPlan ? Number(selectedPlan.price || 0) : 0;

    // Calculate final amount and discounts
    const d = payload.discounts || {};
    let discountType = null;
    let discountName = null;
    
    if (d.couponCode) { discountType = 'coupon'; discountName = d.couponCode; }
    else if (d.offerName) { discountType = 'offer'; discountName = d.offerName; }
    else if (d.membershipName) { discountType = 'membership'; discountName = d.membershipName; }
    else if (d.manualValue > 0) {
        discountType = 'manual';
        discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`;
    }
    
    // finalPrice mapped from payload
    const finalAmount = finalPrice; 
    let discountAmount = planPrice > finalAmount ? (planPrice - finalAmount) : null;
    if (discountAmount <= 0) discountAmount = null;

    // Calculate payment status based on how much was collected today
    let paymentStatus = 'paid';

    const membershipPayload = {
        purchase_id: newPurchaseId,
        company_id: getCompanyId(),
        branch_id: getBranchId(),
        assigned_by_user_id: userId,
        assigned_by_user_name: userName,
        customer_id: finalCustomerId,
        customer_name: finalCustomerName,
        membership_id: planValue,
        plan_name: selectedPlan ? (selectedPlan.plan_name || selectedPlan.name) : null,
        price: planPrice,               // The true total price of the membership
        duration: duration,
        payment_method: payMethod,
        payment_status: paymentStatus,  // 'paid' for full payments
        purchase_date: purchaseDate,
        expiry_date: expiryDate,
        status: 'active',
        discount_type: discountType,
        discount_name: discountName,
        discount_amount: discountAmount,
        final_amount: finalAmount
    };

    try {
        // 1. Insert into membership_purchases
        const { error } = await insertMembershipPurchaseApi(membershipPayload);

        if (error) throw error;

        // 2. The database trigger 'trg_membership_transaction' handles logging to business_transactions natively.

        showToast('Membership assigned successfully!');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_membership_purchased', {
                title: 'Membership Purchased',
                message: `${finalCustomerName} purchased ${selectedPlan ? (selectedPlan.plan_name || selectedPlan.name) : 'membership'}.`
            });
        }
        
        // Reset form
        if (window.resetAssignMembershipForm) {
            window.resetAssignMembershipForm();
        } else {
            resetAssignMembershipForm();
        }
        
        await loadPurchases();
    } catch (err) {
        console.error('executeMembershipAssignment error:', err);
        showToast('An error occurred during assignment: ' + (err.message || ''));
        throw err;
    }
}

// ── Renewal Workflow ───────────────────────────────────────────────────────
export function renewMembershipPurchase(purchaseId) {
    const currentPurchases = getCurrentPurchases();
    const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) {
        showToast('Purchase details not found.');
        return;
    }

    if (window.notifyEvent) {
        window.notifyEvent('marketing', 'evt_marketing_membership_expired_renewed', {
            title: 'Membership Renewed',
            message: `Renewal initiated for ${purchase.customer_name || 'Customer'}.`
        });
    }

    const assignModal = document.getElementById('assignModalOverlay');
    if (!assignModal) return;

    if (window.resetAssignMembershipForm) {
        window.resetAssignMembershipForm();
    } else {
        resetAssignMembershipForm();
    }

    // Fill customer fields
    const custSearch = document.getElementById('custSearchInput');
    const custName = document.getElementById('assignCustomerName');
    const planInput = document.getElementById('assignPlanInput');

    if (custSearch) {
        // Find existing customer by id
        const custId = purchase.customer_id;
        const allCustomers = getAllCustomers();
        const cust = allCustomers.find(c => (c.customer_id || c.id) === custId);
        if (cust) {
            const phoneStr = String(cust.customer_phone || cust.phone_number || '');
            custSearch.value = phoneStr;
            setSelectedCustomer(cust);
            
            const custBadge = document.getElementById('assignCustomerBadgeContainer');
            if (custBadge) custBadge.style.display = 'block';
            
            if (custName) {
                custName.value = purchase.customer_name || cust.customer_name || '';
                custName.readOnly = true;
                custName.classList.add('read-only-input');
            }
        } else {
            // fallback if customer not found in allCustomers list
            custSearch.value = '';
            if (custName) {
                custName.value = purchase.customer_name || '';
                custName.readOnly = false;
                custName.classList.remove('read-only-input');
            }
        }
    }

    if (planInput) {
        planInput.value = purchase.membership_id || '';
        // trigger change event to update summary
        const event = new Event('change');
        planInput.dispatchEvent(event);
    }

    assignModal.classList.add('active');
}

// ── Wire Progressive Search & Modal Listeners ──────────────────────────────
export function initAssignModalListeners() {
    const custSearch = document.getElementById('custSearchInput');
    const custSuggestions = document.getElementById('membershipCustomerSuggestions');
    const custBadgeContainer = document.getElementById('assignCustomerBadgeContainer');
    const newCustBadgeContainer = document.getElementById('assignNewCustomerBadgeContainer');

    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            setSelectedCustomer(null); 
            if (custBadgeContainer) custBadgeContainer.style.display = 'none';
            if (newCustBadgeContainer) newCustBadgeContainer.style.display = 'none';
            
            const val = e.target.value.trim();

            if (val.length === 0) {
                if (custSuggestions) custSuggestions.style.display = 'none';
                setCustFormState(true);
                return;
            }

            const allCustomers = getAllCustomers();
            const matches = allCustomers.filter(c => {
                const p = String(c.customer_phone || c.phone_number || '');
                return p.includes(val);
            });

            if (matches.length > 0) {
                custSuggestions.innerHTML = '';
                matches.slice(0, 8).forEach(m => {
                    const phoneStr = String(m.customer_phone || m.phone_number || '');
                    const nameStr = m.customer_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Unknown';
                    const emailStr = m.customer_mail || m.email || '';
                    const custId = m.id || m.customer_id;

                    const div = document.createElement('div');
                    div.className = 'cust-suggestion-item';
                    div.setAttribute('data-id', custId);
                    div.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;';
                    div.onmouseenter = () => div.style.background = '#f8fafc';
                    div.onmouseleave = () => div.style.background = 'transparent';
                    
                    div.innerHTML = `<span style="font-weight:600;color:#1e293b;font-size:0.88rem;">${nameStr}</span><span style="font-size:0.75rem;color:#64748b;">${phoneStr}</span>`;
                    
                    div.addEventListener('click', () => {
                        custSearch.value = phoneStr;
                        setSelectedCustomer(m);
                        
                        setCustFormState(false, nameStr, emailStr);

                        custSuggestions.style.display = 'none';
                        if (newCustBadgeContainer) newCustBadgeContainer.style.display = 'none';
                        if (custBadgeContainer) custBadgeContainer.style.display = 'block';
                    });
                    custSuggestions.appendChild(div);
                });
                custSuggestions.style.display = 'block';
            } else {
                custSuggestions.style.display = 'none';
                if (val.length >= 10) {
                    if (newCustBadgeContainer) newCustBadgeContainer.style.display = 'block';
                    setCustFormState(true);
                    setSelectedCustomer(null);
                }
            }
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
             if (custSearch && custSuggestions && !custSearch.contains(e.target) && !custSuggestions.contains(e.target)) {
                 custSuggestions.style.display = 'none';
             }
        });
    }

    const assignPlanInput = document.getElementById('assignPlanInput');
    if (assignPlanInput) {
        assignPlanInput.addEventListener('change', updateAssignModalSummary);
    }

    const confirmAssignBtn = document.getElementById('btnConfirmAssign');
    if (confirmAssignBtn) {
        confirmAssignBtn.addEventListener('click', async () => {
            await preValidateAndShowCollect();
        });
    }
}
