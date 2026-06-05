import { supabase } from '../lib/supabase.js';

// ── State ──────────────────────────────────────────────────────────────────
let currentPlans = [];
let availableServices = [];
let isEditing = false;
let currentEditId = null;
let planToDelete = null;
let allCustomers = [];
let selectedCustomer = null;
let currentPurchases = [];
let purchaseToCancel = null;

// ── Context helpers ────────────────────────────────────────────────────────
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        // appContext stores company as { company_id: '...' } not { id: '...' }
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};
const getBranchId = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await fetchServices();
    await fetchCustomers();
    await loadPlans();
    await loadPurchases();

    // Reload when branch changes
    document.getElementById('branchSelect')?.addEventListener('change', async () => {
        await loadPlans();
        await loadPurchases();
    });

    // ── Plan Modal wiring ──
    const overlay = document.getElementById('planModalOverlay');

    // Open "Create Plan" via the dedicated Create button
    document.getElementById('btnCreatePlan')?.addEventListener('click', () => {
        const activeTab = document.querySelector('.nav-tab.active')?.getAttribute('data-tab');
        if (activeTab === 'plans') openCreateModal();
    });

    document.getElementById('closePlanModal')?.addEventListener('click', closePlanModal);
    document.getElementById('btnCancelPlan')?.addEventListener('click', closePlanModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) closePlanModal(); });

    // Status toggle label
    const statusToggle = document.getElementById('planStatusToggle');
    const statusLabel = document.getElementById('planStatusLabel');
    statusToggle?.addEventListener('change', () => {
        statusLabel.textContent = statusToggle.checked ? 'Active' : 'Inactive';
    });

    // Services dropdown
    const svcBtn = document.getElementById('planSvcBtn');
    const svcMenu = document.getElementById('planSvcMenu');
    svcBtn?.addEventListener('click', e => {
        e.stopPropagation();
        svcMenu.style.display = svcMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', e => {
        if (svcBtn && !svcBtn.contains(e.target) && svcMenu && !svcMenu.contains(e.target)) {
            svcMenu.style.display = 'none';
        }
    });

    document.getElementById('planSvcApply')?.addEventListener('click', () => {
        applyPlanSvcSelection();
        if (svcMenu) svcMenu.style.display = 'none';
    });
    document.getElementById('planSvcReset')?.addEventListener('click', () => {
        document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
        applyPlanSvcSelection();
    });

    // Save button
    document.getElementById('btnSavePlan')?.addEventListener('click', handleSavePlan);

    // ── Delete Confirm Modal wiring ──
    document.getElementById('btnCancelDeletePlan')?.addEventListener('click', () => {
        document.getElementById('deletePlanConfirmOverlay')?.classList.remove('active');
        planToDelete = null;
    });
    document.getElementById('btnConfirmDeletePlan')?.addEventListener('click', async () => {
        if (!planToDelete) return;
        document.getElementById('deletePlanConfirmOverlay')?.classList.remove('active');
        await executeDeletePlan(planToDelete);
        planToDelete = null;
    });

    // ── Progressive Customer Search wiring ──
    const custSearch = document.getElementById('custSearchInput');
    const custSuggestions = document.getElementById('membershipCustomerSuggestions');
    const custName = document.getElementById('assignCustomerName');
    const custEmail = document.getElementById('assignCustomerEmail');
    const custBadgeContainer = document.getElementById('assignCustomerBadgeContainer');
    const newCustBadgeContainer = document.getElementById('assignNewCustomerBadgeContainer');

    function setCustFormState(isNew, name = '', email = '') {
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

    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            selectedCustomer = null; 
            if(custBadgeContainer) custBadgeContainer.style.display = 'none';
            if(newCustBadgeContainer) newCustBadgeContainer.style.display = 'none';
            
            const val = e.target.value.trim();

            if (val.length === 0) {
                if(custSuggestions) custSuggestions.style.display = 'none';
                setCustFormState(true);
                return;
            }

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
                        selectedCustomer = m;
                        
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
                    selectedCustomer = null;
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
    
    function updateAssignModalSummary() {
        const planValue = assignPlanInput?.value;
        const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);
        const price = selectedPlan ? Number(selectedPlan.price || 0) : 0;
        
        const subElem = document.getElementById('assignSubtotal');
        const taxElem = document.getElementById('assignTax');
        const totElem = document.getElementById('assignTotal');
        
        if (subElem) subElem.textContent = `₹${price.toLocaleString('en-IN')}`;
        if (taxElem) taxElem.textContent = `₹0`;
        if (totElem) totElem.textContent = `₹${price.toLocaleString('en-IN')}`;
    }

    if (assignPlanInput) {
        assignPlanInput.addEventListener('change', updateAssignModalSummary);
    }

    const confirmAssignBtn = document.getElementById('btnConfirmAssign');
    if (confirmAssignBtn) {
        confirmAssignBtn.addEventListener('click', async () => {
            await preValidateAndShowCollect();
        });
    }
});

// ── Helpers ────────────────────────────────────────────────────────────────

window.resetAssignMembershipForm = function() {
    selectedCustomer = null;
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

    const subtotal = document.getElementById('assignSubtotal');
    const tax = document.getElementById('assignTax');
    const total = document.getElementById('assignTotal');
    if (subtotal) subtotal.textContent = '₹0';
    if (tax) tax.textContent = '₹0';
    if (total) total.textContent = '₹0';
};
function showToast(msg) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #1e293b; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 9999; font-size: 0.9rem; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: translateY(20px); pointer-events: none;';
        document.body.appendChild(toast);
        
        // Add minimal CSS for the 'show' class if it wasn't there
        const style = document.createElement('style');
        style.innerHTML = `
            #toastNotification.show {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function applyPlanSvcSelection() {
    const checkboxes = document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]');
    const svcText = document.getElementById('planSvcText');
    if (!svcText) return;

    const selected = Array.from(checkboxes).filter(c => c.checked);
    if (selected.length === 0) {
        svcText.textContent = 'Select services...';
        svcText.style.color = '#94a3b8';
    } else if (selected.some(c => c.value === 'all')) {
        svcText.textContent = 'All Services';
        svcText.style.color = '#1e293b';
    } else if (selected.length === 1) {
        svcText.textContent = selected[0].parentElement.textContent.trim();
        svcText.style.color = '#1e293b';
    } else {
        svcText.textContent = `${selected[0].parentElement.textContent.trim()} +${selected.length - 1} more`;
        svcText.style.color = '#1e293b';
    }
}

// ── Customers Fetch (SUPABASE) ──────────────────────────────────────────
async function fetchCustomers() {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;
        allCustomers = data || [];
    } catch (err) {
        console.error('Failed to load customers (Supabase):', err);
    }
}

// ── Services Fetch (SUPABASE) ───────────────────────────────────────────
async function fetchServices() {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('service_id, service_name, status')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;
        availableServices = (data || []).filter(s => (s.status || '').toLowerCase() === 'active');
        populatePlanSvcCheckboxes();
    } catch (err) {
        console.error('Failed to load services (Supabase):', err);
    }
}

function populatePlanSvcCheckboxes() {
    const container = document.getElementById('planSvcCheckboxList');
    if (!container) return;

    const allLabel = `<label class="svc-dropdown-label"><input type="checkbox" value="all" style="accent-color:#7c3aed;"> All Services</label>`;
    const serviceLabels = availableServices.map(svc =>
        `<label class="svc-dropdown-label"><input type="checkbox" value="${svc.service_id || svc._id}" style="accent-color:#7c3aed;"> ${svc.service_name || svc.name}</label>`
    ).join('');

    container.innerHTML = allLabel + serviceLabels;

    // Bind "All Services" toggle
    const allCb = container.querySelector('input[value="all"]');
    const otherCbs = () => container.querySelectorAll('input:not([value="all"])');
    allCb?.addEventListener('change', () => {
        otherCbs().forEach(c => c.checked = allCb.checked);
        applyPlanSvcSelection();
    });
    container.addEventListener('change', e => {
        if (e.target.value !== 'all') {
            const all = Array.from(otherCbs()).every(c => c.checked);
            if (allCb) allCb.checked = all;
        }
        applyPlanSvcSelection();
    });
}

// ── READ PLANS (SUPABASE) ───────────────────────────────────────────────
async function loadPlans() {
    const tbody = document.querySelector('#plansTableContent tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="padding:32px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                    <span style="font-size:0.9rem;">Loading membership plans...</span>
                </div>
            </td>
        </tr>`;
    if (window.feather) feather.replace();

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        // Fetch plans and member counts in parallel
        const [plansResult, purchasesResult] = await Promise.all([
            supabase
                .from('memberships')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: false }),
            supabase
                .from('membership_purchases')
                .select('membership_id')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
        ]);

        if (plansResult.error) throw plansResult.error;

        // Build a count map: membership_id -> count
        const memberCountMap = {};
        (purchasesResult.data || []).forEach(row => {
            if (row.membership_id) {
                memberCountMap[row.membership_id] = (memberCountMap[row.membership_id] || 0) + 1;
            }
        });

        // Group flattened rows by membership_id
        const groupedPlans = {};
        (plansResult.data || []).forEach(row => {
            const mId = row.membership_id;
            if (!groupedPlans[mId]) {
                groupedPlans[mId] = { ...row, applicable_services: [] };
            }
            if (row.service_id) {
                groupedPlans[mId].applicable_services.push({
                    service_id: row.service_id,
                    service_name: row.service_name || '',
                    rowId: row.id
                });
            }
        });

        currentPlans = Object.values(groupedPlans);
        // Attach member counts
        currentPlans.forEach(plan => {
            plan.member_count = memberCountMap[plan.membership_id] || 0;
        });
        currentPlans.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        renderPlans();
        populateAssignPlanDropdown();
    } catch (err) {
        console.error('loadPlans:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership plans: ${err.message || ''}</td></tr>`;
    }
}

function renderPlans() {
    const tbody = document.querySelector('#plansTableContent tbody');
    if (!tbody) return;

    if (currentPlans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b;">No membership plans yet. Click "Create Plan" to add one.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentPlans.map(plan => {
        const isFlat = plan.discount_type === 'flat';
        const discountText = isFlat ? `₹${plan.discount_value} OFF` : `${plan.discount_value}% OFF`;
        const discountBadgeColor = isFlat ? 'color:#15803d;background:#dcfce7;' : 'color:#0284c7;background:#e0f2fe;';
        const discountDisplay = `<span style="font-weight:700;${discountBadgeColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountText}</span>`;

        const durationLabel = plan.duration_months
            ? `${plan.duration_months} Month${plan.duration_months > 1 ? 's' : ''}`
            : plan.duration
                ? `${plan.duration} Month${plan.duration > 1 ? 's' : ''}`
                : '-';

        const planId = plan.membership_id || plan.id;

        // Applicable services pills — expandable pattern matching coupons table
        const services = plan.applicable_services || [];
        const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:500;background:#f1f5f9;color:#475569;margin-right:4px;`;
        let servicesDisplay;
        if (services.length === 0) {
            servicesDisplay = `<span style="color:#94a3b8;font-size:0.8rem;">—</span>`;
        } else if (services.length === 1) {
            servicesDisplay = `<span style="${chipStyle}">${services[0].service_name}</span>`;
        } else {
            const extraCount = services.length - 1;
            const extraId = `mem-svc-extra-${planId}`;
            const toggleId = `mem-svc-toggle-${planId}`;
            const firstChip = `<span style="${chipStyle}">${services[0].service_name}</span>`;
            const extraChips = services.slice(1).map(s => `<span style="${chipStyle}">${s.service_name}</span>`).join('');
            servicesDisplay = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                    ${firstChip}
                    <span id="${toggleId}"
                        onclick="var el=document.getElementById('${extraId}');var tog=document.getElementById('${toggleId}');var h=el.style.display==='none'||el.style.display==='';el.style.display=h?'flex':'none';tog.textContent=h?'▲ less':'+${extraCount}';"
                        style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                    <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                        ${extraChips}
                    </div>
                </div>`;
        }

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td>
                    <span style="font-weight:600;color:#1e3a8a;display:block;font-size:1rem;">${plan.plan_name || plan.name || '-'}</span>
                </td>
                <td>${discountDisplay}</td>
                <td>${servicesDisplay}</td>
                <td style="color:#64748b;">${durationLabel}</td>
                <td>
                    <span style="color:#475569;font-size:0.875rem;font-weight:500;">
                        ${plan.member_count} ${plan.member_count === 1 ? 'Member' : 'Members'}
                    </span>
                </td>
                <td>
                    <span style="font-weight:600;color:#059669;">₹${Number(plan.price || 0).toLocaleString('en-IN')}</span>
                </td>
                <td>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="hover-lift edit-btn" data-sub-feature="update_membership" onclick="window.editPlan('${planId}')" title="Edit Plan" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #e0e7ff;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Edit</span>
                        </button>
                        <button class="hover-lift delete-btn" data-sub-feature="delete_membership" onclick="window.deletePlan('${planId}')" title="Delete Plan" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #fee2e2;background:#fef2f2;cursor:pointer;color:#ef4444;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            <span style="font-size:10px;font-weight:600;">Delete</span>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

function populateAssignPlanDropdown() {
    const planSelect = document.getElementById('assignPlanInput');
    if (!planSelect) return;

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

// ── Modal open / close ─────────────────────────────────────────────────────
function openCreateModal() {
    isEditing = false;
    currentEditId = null;
    resetPlanForm();

    document.querySelector('#planModal h2').textContent = 'Create Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Define a new membership product and its benefits.';
    document.getElementById('btnSavePlan').textContent = 'Create Plan';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

function closePlanModal() {
    document.getElementById('planModalOverlay').classList.remove('active');
}

function resetPlanForm() {
    const nameInput = document.getElementById('planNameInput');
    nameInput.value = '';
    nameInput.readOnly = false;
    nameInput.style.background = '';
    nameInput.style.color = '';
    nameInput.style.cursor = '';

    document.getElementById('planPriceInput').value = '';
    document.getElementById('planDurationInput').value = '12';
    document.getElementById('planDiscountType').value = 'percentage';
    document.getElementById('planDiscountValue').value = '';

    // Reset services
    document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
    applyPlanSvcSelection();
}

// ── EDIT ───────────────────────────────────────────────────────────────────
window.editPlan = function(id) {
    const plan = currentPlans.find(p => (p.membership_id || p.id) === id);
    if (!plan) return;

    isEditing = true;
    currentEditId = id;

    // Plan Name — read-only in edit mode
    const nameInput = document.getElementById('planNameInput');
    nameInput.value = plan.plan_name || plan.name || '';
    nameInput.readOnly = true;
    nameInput.style.background = '#f1f5f9';
    nameInput.style.color = '#94a3b8';
    nameInput.style.cursor = 'not-allowed';

    document.getElementById('planPriceInput').value = plan.price || '';
    document.getElementById('planDurationInput').value = plan.duration_months || plan.duration || '12';
    document.getElementById('planDiscountType').value = plan.discount_type || 'percentage';
    document.getElementById('planDiscountValue').value = plan.discount_value || '';

    // Services matches
    const checkboxes = document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]');
    const svcIds = (plan.applicable_services || []).map(s => s.service_id);
    const allMatch = svcIds.length > 0 && svcIds.length >= availableServices.length;

    checkboxes.forEach(c => {
        if (c.value === 'all') c.checked = allMatch;
        else c.checked = svcIds.includes(c.value);
    });
    applyPlanSvcSelection();

    document.querySelector('#planModal h2').textContent = 'Edit Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Update the details for this membership plan.';
    document.getElementById('btnSavePlan').textContent = 'Save Changes';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
};

// ── DELETE (SUPABASE) ───────────────────────────────────────────────────
window.deletePlan = function(id) {
    planToDelete = id;
    const overlay = document.getElementById('deletePlanConfirmOverlay');
    if (overlay) {
        overlay.classList.add('active');
    } else {
        if (confirm('Are you sure you want to delete this membership plan?')) {
            executeDeletePlan(id);
        }
    }
};

async function executeDeletePlan(id) {
    try {
        const { error } = await supabase
            .from('memberships')
            .eq('membership_id', id)
            .update({ status: 'deleted' });

        if (error) throw error;
        showToast('Membership plan deleted successfully.');
        await loadPlans();
    } catch (err) {
        console.error('executeDeletePlan:', err);
        showToast('Error deleting plan: ' + (err.message || ''));
    }
}

// ── SAVE (Create / Update) ─────────────────────────────────────────────────
async function handleSavePlan() {
    const plan_name = document.getElementById('planNameInput').value.trim();
    const price = document.getElementById('planPriceInput').value;
    const duration = document.getElementById('planDurationInput').value;
    const discount_type = document.getElementById('planDiscountType').value;
    const discount_value = document.getElementById('planDiscountValue').value;

    if (!plan_name || !price || !discount_value) {
        showToast('Please fill all required fields (Name, Price, Discount Value).');
        return;
    }

    // Name uniqueness validation
    const exists = currentPlans.find(p => 
        (p.plan_name || p.name || '').toLowerCase() === plan_name.toLowerCase() &&
        (p.membership_id || p.id) !== currentEditId &&
        p.status !== 'deleted'
    );

    if (exists) {
        showToast('A membership plan with this name already exists.');
        return;
    }

    // Collect checked services
    const checkboxes = document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]');
    const hasAllSelected = Array.from(checkboxes).some(c => c.value === 'all' && c.checked);

    let applyServices = [];
    if (hasAllSelected) {
        applyServices = availableServices.map(svc => ({ service_id: svc.service_id, service_name: svc.service_name }));
    } else {
        Array.from(checkboxes)
            .filter(c => c.checked && c.value !== 'all')
            .forEach(c => {
                applyServices.push({ service_id: c.value, service_name: c.parentElement.textContent.trim() });
            });
    }

    const payload = {
        company_id: getCompanyId(),
        branch_id: getBranchId(),
        plan_name,
        price: parseFloat(price),
        duration_months: parseInt(duration, 10),
        valid_from: null,
        discount_type,
        discount_value: parseFloat(discount_value),
        status: 'active',
        description: null
    };

    const btn = document.getElementById('btnSavePlan');
    const origText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        let planId = isEditing ? currentEditId : crypto.randomUUID();

        const rowsToInsert = applyServices.map(svc => ({
            membership_id: planId,
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            plan_name,
            price: parseFloat(price),
            duration: parseInt(duration, 10),
            valid_from: null,
            discount_type,
            discount_value: parseFloat(discount_value),
            status: 'active',
            description: null,
            service_id: svc.service_id,
            service_name: svc.service_name
        }));

        if (isEditing) {
            // DELETE old rows
            const { error: delErr } = await supabase
                .from('memberships')
                .eq('membership_id', planId)
                .delete();
            if (delErr) throw delErr;
        }

        // INSERT all mapped rows safely
        if (rowsToInsert.length > 0) {
            const { error: insErr } = await supabase
                .from('memberships')
                .insert(rowsToInsert);
            if (insErr) throw insErr;
        }

        showToast(isEditing ? 'Plan updated successfully.' : 'Plan created successfully.');
        closePlanModal();
        await loadPlans();
    } catch (err) {
        console.error('handleSavePlan:', err);
        showToast('Error saving plan: ' + (err.message || 'Unknown error'));
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ── Purchases Workflow (SUPABASE) ──────────────────────────────────────────

async function loadPurchases() {
    const tbody = document.querySelector('#purchasesTableContent tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="padding:32px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                    <span style="font-size:0.9rem;">Loading membership purchases...</span>
                </div>
            </td>
        </tr>`;
    if (window.feather) feather.replace();

    try {
        const { data, error } = await supabase
            .from('membership_purchases')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId())
            .order('purchase_date', { ascending: false });

        if (error) throw error;
        currentPurchases = data || [];
        renderPurchases();
    } catch (err) {
        console.error('loadPurchases:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership purchases: ${err.message || ''}</td></tr>`;
    }
}

function renderPurchases() {
    const tbody = document.querySelector('#purchasesTableContent tbody');
    if (!tbody) return;

    if (currentPurchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#64748b;">No memberships assigned yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentPurchases.map(purchase => {
        const isActive = purchase.status === 'active';
        const isCancelled = purchase.status === 'cancelled';
        const isRefunded = purchase.status === 'refunded';
        
        let statusBadge = '';
        if (isActive) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#ecfdf5;color:#059669;">Active</span>`;
        } else if (isCancelled) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#ef4444;">Cancelled</span>`;
        } else if (isRefunded) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fffbeb;color:#d97706;">Refunded</span>`;
        } else {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#f1f5f9;color:#64748b;">Expired</span>`;
        }

        const fullName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown Customer';
        const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
        
        const formatDate = (d) => {
            if (!d) return '-';
            const dt = new Date(d);
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const year = dt.getFullYear();
            return `${day}-${month}-${year}`;
        };
        const purchaseDateStr = formatDate(purchase.purchase_date);
        const validUntilStr = formatDate(purchase.expiry_date);
        
        const purchaseId = purchase.purchase_id || purchase.id;
        
        let priceDisplay = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
        priceDisplay = `<span style="background-color: #ecfdf5; color: #059669; border: 1px solid #d1fae5; padding: 0.25rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">${priceDisplay}</span>`;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #1e3a8a; font-weight: 700; font-size: 0.75rem; border: 1px solid #e2e8f0;">${initials}</div>
                        <div>
                            <span style="font-weight: 600; color: #1e3a8a; display: block;">${fullName}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-weight: 600; color: #475569;">${purchase.plan_name || purchase.membership_name || purchase.name || '-'}</span>
                </td>
                <td>
                    ${priceDisplay}
                </td>
                <td style="color: #64748b; font-size: 0.9rem;">${purchase.duration ? purchase.duration + ' Months' : '-'}</td>
                <td style="color: #64748b;">${purchaseDateStr}</td>
                <td style="color: #64748b;">${validUntilStr}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: stretch;">
                        ${!isCancelled ? `
                        <button class="action-btn" title="View" onclick="window.viewMembershipSummary('${purchaseId}')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span style="font-size:10px;font-weight:600;">View</span>
                        </button>
                        ` : ''}
                        ${isActive ? `
                        <button onclick="window.cancelMembershipPurchase('${purchaseId}')" title="Cancel" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #fecdd3;background:#fff1f2;cursor:pointer;color:#e11d48;transition:all 0.2s;" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                            <span style="font-size:10px;font-weight:600;">Cancel</span>
                        </button>
                        ` : ''}
                        ${isRefunded ? `
                        <button onclick="window.viewRefundInfo('${purchaseId}')" title="Info" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#64748b;transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            <span style="font-size:10px;font-weight:600;">Info</span>
                        </button>
                        ` : ''}
                        ${isCancelled ? `
                        <button onclick="window.viewPurchaseNotes('${purchaseId}')" title="View Details" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#64748b;transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            <span style="font-size:10px;font-weight:600;">Details</span>
                        </button>
                        <button onclick="window.refundMembershipPurchase('${purchaseId}')" title="Refund" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #fef08a;background:#fefce8;cursor:pointer;color:#b45309;transition:all 0.2s;" onmouseover="this.style.background='#fef9c3'" onmouseout="this.style.background='#fefce8'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.91"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Refund</span>
                        </button>
                        ` : ''}
                        ${(!isActive && !isCancelled && !isRefunded) ? `
                        <button onclick="window.renewMembershipPurchase('${purchaseId}')" title="Renew" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;min-width:52px;height:40px;border-radius:8px;border:1px solid #bbf7d0;background:#f0fdf4;cursor:pointer;color:#166534;transition:all 0.2s;" onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;flex-shrink:0;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Renew</span>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

// ── View Membership Summary Modal ─────────────────────────────────────────
window.viewMembershipSummary = function(purchaseId) {
    const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) return;

    const formatDate = (d) => {
        if (!d) return '—';
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
    };

    const fullName = purchase.customer_name || `${purchase.first_name||''} ${purchase.last_name||''}`.trim() || 'Unknown Customer';
    const initials = fullName.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase();
    const phone = purchase.customer_phone || purchase.phone_number || '';

    // Status badge
    const statusMap = {
        active:    { label:'Active',    bg:'#ecfdf5', color:'#059669' },
        cancelled: { label:'Cancelled', bg:'#fef2f2', color:'#ef4444' },
        refunded:  { label:'Refunded',  bg:'#fffbeb', color:'#d97706' },
    };
    const st = statusMap[purchase.status] || { label:'Expired', bg:'#f1f5f9', color:'#64748b' };
    const statusBadgeHtml = `<span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${st.bg};color:${st.color};">${st.label}</span>`;

    // Discount from matching plan
    const planRecord = currentPlans.find(p => (p.membership_id || p.id) === purchase.membership_id);
    let discountText = '—';
    if (planRecord) {
        const val = planRecord.discount_value || 0;
        discountText = planRecord.discount_type === 'flat' ? `₹${val} OFF` : `${val}% OFF`;
    }

    // Applicable services
    const services = planRecord?.applicable_services || [];
    const chipStyle = 'display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:500;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;';
    const servicesHtml = services.length === 0
        ? `<span style="color:#94a3b8;font-size:0.85rem;">All services included</span>`
        : services.map(s => `<span style="${chipStyle}">${s.service_name}</span>`).join('');

    // Duration
    const dur = purchase.duration || planRecord?.duration_months || planRecord?.duration || 0;
    const durationText = dur ? `${dur} Month${dur > 1 ? 's' : ''}` : '—';

    // Populate DOM
    document.getElementById('msmInitialsCircle').textContent = initials;
    document.getElementById('msmCustomerName').textContent = fullName;
    document.getElementById('msmCustomerPhone').textContent = phone ? `📞 ${phone}` : '';
    document.getElementById('msmStatusBadge').innerHTML = statusBadgeHtml;
    document.getElementById('msmPlanName').textContent = purchase.plan_name || purchase.membership_name || purchase.name || '—';
    document.getElementById('msmPrice').textContent = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
    document.getElementById('msmDuration').textContent = durationText;
    document.getElementById('msmDiscount').textContent = discountText;
    document.getElementById('msmPurchaseDate').textContent = formatDate(purchase.purchase_date);
    document.getElementById('msmExpiryDate').textContent = formatDate(purchase.expiry_date);
    document.getElementById('msmServices').innerHTML = servicesHtml;

    // Notes
    const notes = purchase.notes || purchase.note || '';
    const notesSection = document.getElementById('msmNotesSection');
    if (notes) {
        document.getElementById('msmNotes').textContent = notes;
        notesSection.style.display = 'block';
    } else {
        notesSection.style.display = 'none';
    }

    // Show overlay
    const overlay = document.getElementById('membershipSummaryOverlay');
    overlay.style.display = 'flex';
    // Close on backdrop click
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
};

async function preValidateAndShowCollect() {
    const planValue = document.getElementById('assignPlanInput').value;
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);

    const custSearchValue = document.getElementById('custSearchInput').value.trim();
    const custNameValue = document.getElementById('assignCustomerName')?.value.trim();

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

    // ── Duplicate Check BEFORE creating DB records ──
    const finalCustomerId = selectedCustomer ? (selectedCustomer.id || selectedCustomer.customer_id) : null;
    try {
        if (finalCustomerId && planValue) {
            const { data: existing, error: checkErr } = await supabase
                .from('membership_purchases')
                .select('*')
                .eq('company_id', getCompanyId())
                .eq('branch_id', getBranchId())
                .eq('customer_id', finalCustomerId)
                .eq('membership_id', planValue)
                .eq('status', 'active');

            if (checkErr) throw checkErr;

            if (existing && existing.length > 0) {
                showToast('membership is already assigned to this customer');
                if (btn) {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                    if (window.feather) feather.replace();
                }
                return;
            }
        }
    } catch (err) {
        console.error('Duplicate check error:', err);
        showToast('DB Error: ' + (err.message || 'Verification failed. Assignment aborted.'));
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.feather) feather.replace();
        }
        return;
    }

    // If validations pass, show Collect Payment Modal
    if (btn) {
        btn.innerHTML = origText;
        btn.disabled = false;
        if (window.feather) feather.replace();
    }

    const price = selectedPlan ? Number(selectedPlan.price || 0) : 0;
    
    // Hide the assign modal
    document.getElementById('assignModalOverlay')?.classList.remove('active');

    // Generate purchase ID ahead of time so we have a reference
    const newPurchaseId = crypto.randomUUID();

    if (window.openGlobalPaymentModal) {
        window.openGlobalPaymentModal({
            saleId: newPurchaseId,
            customerId: finalCustomerId,
            customerName: selectedCustomer ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() : custNameValue,
            totalAmount: price,
            amountDue: price,
            isMembershipPurchase: true, // Show membership perks in the modal if applicable
            onComplete: async (payload) => {
                await executeMembershipAssignment(payload, newPurchaseId);
            }
        });
    } else {
        showToast('Global payment modal not loaded', '#ef4444');
    }
}

async function executeMembershipAssignment(payload, newPurchaseId) {
    const planValue = document.getElementById('assignPlanInput').value;
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);

    const custSearchValue = document.getElementById('custSearchInput').value.trim();
    const custNameValue = document.getElementById('assignCustomerName')?.value.trim();
    const custEmailValue = document.getElementById('assignCustomerEmail')?.value.trim();
    const assignDate = document.getElementById('assignDateInput').value;
    
    // Get active payment method and collected amount from the payload
    let payMethod = payload.paymentMethod || 'cash';
    const finalPrice = payload.amountCollected || 0;

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
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    customer_name: finalCustomerName || 'Unknown Customer',
                    customer_phone: custSearchValue,
                    customer_email: custEmailValue || null,
                    status: 'active'
                }).select();
                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    finalCustomerId = newCust[0].id || newCust[0].customer_id;
                    allCustomers.push(newCust[0]);
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
    
    // Javascript calculated Expiry Date
    let expiryDate = null;
    if (purchaseDate && duration) {
        const d = new Date(purchaseDate);
        d.setMonth(d.getMonth() + parseInt(duration, 10));
        expiryDate = d.toISOString().split('T')[0];
    }

    // Determine the actual total price of the plan
    const planPrice = selectedPlan ? Number(selectedPlan.price || 0) : 0;

    // Calculate payment status based on how much was collected today
    let paymentStatus = 'pending';
    if (finalPrice >= planPrice && planPrice > 0) {
        paymentStatus = 'paid';
    } else if (finalPrice >= planPrice && planPrice === 0) {
        paymentStatus = 'paid'; // Free plans
    } else if (finalPrice > 0) {
        paymentStatus = 'partial';
    }

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
        payment_status: paymentStatus,  // Dynamically set based on amount
        purchase_date: purchaseDate,
        expiry_date: expiryDate,
        status: 'active'
    };

    try {
        // 1. Insert into membership_purchases
        const { error } = await supabase
            .from('membership_purchases')
            .insert(membershipPayload);

        if (error) throw error;

        // 2. Record in business_transactions (for Sales History / Revenue reports)
        if (finalPrice > 0) {
            const purchaseId = newPurchaseId;
            const companyId  = getCompanyId();
            const branchId   = getBranchId();
            // Strip 'Z' suffix — business_transactions.paid_at is 'timestamp without time zone'
            const paidAt = new Date().toISOString().replace('Z', '');

            console.log('[Memberships] Inserting business_transaction:', {
                company_id: companyId, branch_id: branchId,
                reference_id: purchaseId, payment_method: payMethod,
                amount: finalPrice, created_by: userId
            });

            const { error: txError } = await supabase
                .from('business_transactions')
                .insert({
                    company_id:     companyId,
                    branch_id:      branchId,
                    reference_id:   purchaseId,
                    reference_type: 'membership',
                    amount:         finalPrice,
                    currency:       'INR',
                    payment_method: payMethod,   // 'cash' | 'upi' | 'card'
                    status:         'paid',
                    notes:          `Membership — ${selectedPlan ? (selectedPlan.plan_name || selectedPlan.name) : 'Plan'} (${finalCustomerName})`,
                    created_by:     userId,
                    paid_at:        paidAt
                });
            if (txError) {
                // Log full error object so we can diagnose DB constraint issues
                console.error('[Memberships] business_transactions insert failed:', txError);
            } else {
                console.log('[Memberships] business_transactions row inserted ✓');
            }
        }

        showToast('Membership assigned successfully!');
        
        // Reset form
        if (window.resetAssignMembershipForm) window.resetAssignMembershipForm();
        
        await loadPurchases();
    } catch (err) {
        console.error('executeMembershipAssignment error:', err);
        showToast('An error occurred during assignment: ' + (err.message || ''));
        throw err;
    }
}

function setupCancelPurchaseModal() {
    const existingOverlay = document.getElementById('cancelPurchaseConfirmOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const modalHtml = `
    <div class="modal-overlay" id="cancelPurchaseConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(4px);">
        <div style="background: #fff; border-radius: 12px; width: 950px; max-width: 95vw; padding: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                <h2 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: #0f172a;">Cancel Membership</h2>
                <p style="margin: 6px 0 0; font-size: 0.95rem; color: #64748b;">Are you sure you want to cancel this membership?</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 24px; margin-bottom: 24px; font-size: 0.95rem; color: #1e293b;">
                <div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #64748b; margin-right: 4px;">Customer:</span>
                        <span id="cancelMemCustomerName" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #64748b; margin-right: 4px;">Plan:</span>
                        <span id="cancelMemPlanName" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                    <div>
                        <span style="color: #64748b; margin-right: 4px;">Plan Start Date:</span>
                        <span id="cancelMemStartDate" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 120px;">
                    <span style="color: #64748b; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">Duration</span>
                    <span id="cancelMemDurationDisplay" style="font-weight: 600; color: #4f46e5; font-size: 0.95rem;">—</span>
                </div>
            </div>

            <div style="margin-bottom: 32px;">
                <label style="display: block; font-size: 0.85rem; color: #475569; margin-bottom: 8px;">Reason (Optional)</label>
                <textarea id="cnlMemNote" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 0.95rem; outline: none; background: #fafafa; color: #1e293b; height: 100px; resize: none;" placeholder=""></textarea>
            </div>

            <div style="display: flex; gap: 12px;">
                <button id="btnCancelCancelPurchase" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Keep Membership</button>
                <button id="btnConfirmCancelPurchase" style="flex: 1; padding: 10px; border-radius: 6px; border: none; background: #ef4444; color: #fff; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">Cancel Membership</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.feather) feather.replace();

    const overlay = document.getElementById('cancelPurchaseConfirmOverlay');

    document.getElementById('btnCancelCancelPurchase').addEventListener('click', () => {
        overlay.classList.remove('active');
        purchaseToCancel = null;
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            purchaseToCancel = null;
        }
    });

    document.getElementById('btnConfirmCancelPurchase').addEventListener('click', async () => {
        if (!purchaseToCancel) return;
        const noteFieldValue = document.getElementById('cnlMemNote')?.value.trim() || null;
        overlay.classList.remove('active');
        await executeCancelMembershipPurchase(purchaseToCancel, noteFieldValue);
        purchaseToCancel = null;
    });
}

window.cancelMembershipPurchase = function(purchaseId) {
    try {
        setupCancelPurchaseModal();
        purchaseToCancel = purchaseId;
        
        const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
        if (purchase) {
            const fullName = purchase.customer_name || `${purchase.first_name||''} ${purchase.last_name||''}`.trim() || 'Unknown';
            const planName = purchase.plan_name || purchase.membership_name || purchase.name || 'Unknown Plan';
            
            document.getElementById('cancelMemCustomerName').textContent = fullName;
            document.getElementById('cancelMemPlanName').textContent = planName;
            
            const rawStart = purchase.purchase_date || purchase.start_date || purchase.created_at;
            document.getElementById('cancelMemStartDate').textContent = rawStart ? new Date(rawStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';
            
            let durationText = 'Unknown';
            if (rawStart) {
                const s = new Date(rawStart);
                const e = new Date(); // today
                if (!isNaN(s)) {
                    let years = e.getFullYear() - s.getFullYear();
                    let months = e.getMonth() - s.getMonth();
                    let days = e.getDate() - s.getDate();
                    if (days < 0) {
                        months -= 1;
                        days += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
                    }
                    if (months < 0) {
                        years -= 1;
                        months += 12;
                    }
                    let arr = [];
                    if (years > 0) arr.push(`${years} year${years>1?'s':''}`);
                    if (months > 0) arr.push(`${months} month${months>1?'s':''}`);
                    if (days > 0) arr.push(`${days} day${days>1?'s':''}`);
                    durationText = arr.join(' ') || '0 days';
                }
            }
            document.getElementById('cancelMemDurationDisplay').textContent = durationText;
        }

        const noteEl = document.getElementById('cnlMemNote');
        if (noteEl) noteEl.value = '';
        
        document.getElementById('cancelPurchaseConfirmOverlay').classList.add('active');
    } catch (err) {
        console.error("Error opening cancer modal: ", err);
        showToast("Error opening cancel modal");
    }
};

async function executeCancelMembershipPurchase(purchaseId, notes = null) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { error } = await supabase
            .from('membership_purchases')
            .eq('purchase_id', purchaseId)
            .update({ status: 'cancelled', notes: notes, cancelled_date: today });

        if (error) {
            // fallback if pk is id
            const { error: err2 } = await supabase.from('membership_purchases').eq('id', purchaseId).update({ status: 'cancelled', notes: notes, cancelled_date: today });
            if (err2) throw err2;
        }

        // Audit Trail: Insert Cancelled Ledger Row
        const { error: txError } = await supabase
            .from('business_transactions')
            .insert([{
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                reference_id: purchaseId,
                reference_type: 'membership',
                amount: 0,
                currency: 'INR',
                payment_method: 'cash',
                status: 'cancelled',
                notes: 'Membership Cancelled (No Refund Processed)',
                paid_at: new Date().toISOString().replace('Z', '')
            }]);
            
        if (txError) {
            console.error('Ledger recording failed for cancellation:', txError);
        }

        showToast('Membership has been cancelled.');
        await loadPurchases();
    } catch (err) {
        console.error('cancelMembershipPurchase error:', err);
        showToast('Error cancelling membership: ' + (err.message || ''));
    }
}

let refundableMembershipAmount = 0;
let purchaseToRefundObj = null;

function setupRefundPurchaseModal() {
    if (!document.getElementById('refundMembershipAdvancedOverlay')) {
        const modalHtml = `
        <div class="modal-overlay" id="refundMembershipAdvancedOverlay" style="z-index:9999;">
            <div class="modal-container" style="width: 480px; border-radius: 16px; padding: 0; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div class="modal-header" style="border-bottom: 1px solid #fee2e2; background: #fff1f2; padding: 20px 24px;">
                    <div class="header-titles">
                        <h2 style="color: #991b1b; font-size: 1.25rem; margin:0;">Process Refund</h2>
                        <p class="subtitle" id="rfMemModalSubtitle" style="color: #b91c1c; font-size: 0.85rem; margin:4px 0 0 0;">Customer Name • Plan Name</p>
                    </div>
                    <button class="modal-close" id="cancelMemRefundBtn"><i data-feather="x" style="color: #991b1b;"></i></button>
                </div>
                <div class="modal-body" style="padding: 24px; background: #fff;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                        <p style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Refundable Amount (₹)</p>
                        <input type="number" id="rfMemAmountDisplay" style="font-size: 2.25rem; font-weight: 800; color: #dc2626; margin: 0; text-align: center; border: 1px solid #fca5a5; border-radius: 8px; width: 100%; max-width: 250px; background: white; padding: 8px; outline: none;" value="0" min="0">
                    </div>

                    <div class="form-group" style="margin-bottom: 24px;">
                        <label class="form-label" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Refund Method</label>
                        <select id="rfMemMethodDisplay" class="form-input" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; background: #fff; color: #1e293b; cursor: pointer;">
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                        </select>
                    </div>
                    
                    <p style="font-size: 0.825rem; color: #64748b; line-height: 1.5; margin-bottom: 24px;">
                        This will record a <strong style="color: #dc2626;">Refund</strong> transaction in the financial ledger and update the membership status.
                    </p>

                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary" id="closeMemRefundBtn" style="flex: 1; height: 48px; font-weight: 600; border-radius: 10px;">Cancel</button>
                        <button class="btn" id="confirmMemRefundBtn" style="flex: 1.5; height: 48px; background: #dc2626; color: white; border: none; font-weight: 700; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);">Issue Refund</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.feather) feather.replace();

        const overlay = document.getElementById('refundMembershipAdvancedOverlay');
        const close = () => { overlay.classList.remove('active'); purchaseToRefundObj = null; };

        document.getElementById('cancelMemRefundBtn').addEventListener('click', close);
        document.getElementById('closeMemRefundBtn').addEventListener('click', close);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        document.getElementById('confirmMemRefundBtn').addEventListener('click', processMembershipRefund);
    }
}

window.refundMembershipPurchase = async function(purchaseId) {
    setupRefundPurchaseModal();
    
    // Find the purchase object
    purchaseToRefundObj = (typeof currentPurchases !== 'undefined' ? currentPurchases : [])
                          .find(p => (p.purchase_id || p.id) === purchaseId);
                          
    if (!purchaseToRefundObj) {
        showToast('Could not find purchase details.', '#ef4444');
        return;
    }

    const overlay = document.getElementById('refundMembershipAdvancedOverlay');
    overlay.classList.add('active');

    const subtitle = document.getElementById('rfMemModalSubtitle');
    const amountDisplay = document.getElementById('rfMemAmountDisplay');
    const methodDisplay = document.getElementById('rfMemMethodDisplay');
    const noteField = document.getElementById('rfMemNote');
    const confirmBtn = document.getElementById('confirmMemRefundBtn');

    // Reset UI
    const custName = purchaseToRefundObj.customer_name || `${purchaseToRefundObj.first_name || ''} ${purchaseToRefundObj.last_name || ''}`.trim() || 'Customer';
    const planName = purchaseToRefundObj.plan_name || purchaseToRefundObj.membership_name || purchaseToRefundObj.name || 'Plan';
    subtitle.textContent = `${custName} • ${planName}`;
    amountDisplay.value = 'Loading...';
    methodDisplay.value = 'Loading...';
    if (noteField) noteField.value = '';
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Issue Refund'; }

    // Fetch ledger data from business_transactions
    try {
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method, status')
            .eq('reference_id', purchaseId)
            .eq('reference_type', 'membership');

        if (error) throw error;

        let ledgerPaid = 0;
        let ledgerRefunded = 0;

        (data || []).forEach(tx => {
            const val = Math.abs(Number(tx.amount || 0));
            const stat = (tx.status || '').toLowerCase().trim();
            if (stat === 'paid') ledgerPaid += val;
            if (stat === 'refunded') ledgerRefunded += val;
        });

        // Fallback for legacy items without an explicit 'paid' ledger record
        if (ledgerPaid === 0) {
            ledgerPaid = Number(purchaseToRefundObj.price || 0);
        }

        const ledgerNet = ledgerPaid - ledgerRefunded;
        refundableMembershipAmount = Math.max(0, ledgerNet);

        console.log('calculated refund limit:', refundableMembershipAmount, 'from paid:', ledgerPaid);
        if (refundableMembershipAmount === 0 && Number(purchaseToRefundObj.price) > 0) {
            refundableMembershipAmount = Number(purchaseToRefundObj.price);
        }

        amountDisplay.value = refundableMembershipAmount || 0;
        amountDisplay.style.color = (refundableMembershipAmount <= 0) ? '#94a3b8' : '#dc2626';

        const lastMethod = data && data.length > 0 ? (data[data.length - 1].payment_method || 'cash').toLowerCase() : 'cash';
        methodDisplay.value = ['cash', 'upi', 'card'].includes(lastMethod) ? lastMethod : 'cash';

        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Issue Refund';

    } catch (err) {
        console.error('Error fetching ledger for refund:', err);
        amountDisplay.textContent = 'Error';
    }
};

async function processMembershipRefund() {
    const amountDisplay = document.getElementById('rfMemAmountDisplay');
    const finalRefundAmount = Math.abs(parseFloat(amountDisplay?.value || '0'));

    if (!purchaseToRefundObj || finalRefundAmount <= 0) {
        showToast('Please enter a valid refund amount higher than 0.');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmMemRefundBtn');
    const note = document.getElementById('rfMemNote')?.value.trim();
    const purchaseId = purchaseToRefundObj.purchase_id || purchaseToRefundObj.id;

    if (confirmBtn) {
        confirmBtn.textContent = 'Processing...';
        confirmBtn.disabled = true;
    }

    try {
        // 1. Insert Refund into Ledger
        const { error: txError } = await supabase
            .from('business_transactions')
            .insert({
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                reference_id: purchaseId,
                reference_type: 'membership',
                amount: finalRefundAmount,
                status: 'refunded',
                payment_method: (document.getElementById('rfMemMethodDisplay')?.value || 'cash').toLowerCase(),
                notes: note || `Refund processed for membership ${purchaseId}`,
                paid_at: new Date().toISOString()
            });

        if (txError) {
             console.warn('business_transactions insert failed, but updating membership record anyway:', txError);
        }

        // 2. Update membership_purchases status AND notes column
        const refundDate = new Date().toISOString().split('T')[0];
        const { error: memError } = await supabase
            .from('membership_purchases')
            .update({ status: 'refunded', payment_status: 'refunded', notes: note || null, cancelled_date: refundDate })
            .eq('purchase_id', purchaseId);

        if (memError) throw memError;

        showToast('Membership has been refunded.', '#dc2626');
        document.getElementById('refundMembershipAdvancedOverlay').classList.remove('active');
        
        await loadPurchases();

    } catch (err) {
        console.error('Membership Refund error:', err);
        showToast('Failed to process refund: ' + (err.message || 'Unknown error'), '#dc2626');
        if (confirmBtn) {
            confirmBtn.textContent = 'Issue Refund';
            confirmBtn.disabled = false;
        }
    }
}

// ── NEW UTILITIES (Notes & Renew) ───────────────────────────────────────
window.viewPurchaseNotes = async function(purchaseId) {
    let modal = document.getElementById('refundNotesModalOverlay');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundNotesModalOverlay" style="z-index:9999;">
            <div class="modal-container" style="width: 950px; max-width: 95vw; padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div class="modal-header" style="background:#f8fafc; padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem; color:#1e293b;"><i data-feather="info" style="width:16px; height:16px; margin-right:8px; color:#3b82f6; vertical-align:text-bottom;"></i>Details</h2>
                    <button class="modal-close" onclick="document.getElementById('refundNotesModalOverlay').classList.remove('active')" style="background:none; border:none; cursor:pointer;"><i data-feather="x" style="color:#64748b;"></i></button>
                </div>
                <div class="modal-body" style="padding:24px; min-height:80px; color:#334155; font-size:0.95rem; line-height:1.5;" id="refundNotesContent">
                    Loading note...
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #fff;">
                    <button onclick="document.getElementById('refundNotesModalOverlay').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Close</button>
                </div>
            </div>
        </div>
        `);
        if (window.feather) feather.replace();
        modal = document.getElementById('refundNotesModalOverlay');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }

    const content = document.getElementById('refundNotesContent');
    content.innerHTML = '<div style="display:flex;justify-content:center;color:#94a3b8;"><i data-feather="loader" class="spin"></i></div>';
    if (window.feather) feather.replace();
    modal.classList.add('active');

    const basePurchase = (typeof currentPurchases !== 'undefined' ? currentPurchases : []).find(p => (p.purchase_id || p.id) === purchaseId) || {};
    try {
        const { data, error } = await supabase
            .from('membership_purchases')
            .select('*')
            .eq('purchase_id', purchaseId)
            .limit(1);

        // Fallback for PK name differences
        if (error) {
           const { data: d2, error: e2 } = await supabase.from('membership_purchases').select('*').eq('id', purchaseId).limit(1);
           if (e2) throw e2;
           if (d2 && d2.length > 0) {
               renderCancelNoteLayout({...basePurchase, ...d2[0]}, content);
               return;
           }
        } else {
             if (data && data.length > 0) {
                renderCancelNoteLayout({...basePurchase, ...data[0]}, content);
                return;
             }
        }
        content.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No reason provided.</span>';
    } catch (err) {
        console.error('viewPurchaseNotes error:', err);
        content.innerHTML = '<span style="color:#ef4444;">Failed to load note.</span>';
    }
};

function renderCancelNoteLayout(record, contentElem) {
    const custName = record.customer_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown';
    const planName = record.plan_name || record.membership_name || record.name || 'Unknown Plan';
    
    const rawStart = record.purchase_date || record.start_date || record.created_at;
    const startObj = rawStart ? new Date(rawStart) : null;
    const startStr = startObj && !isNaN(startObj) ? startObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

    const rawCancel = record.cancelled_date || record.updated_at || null;
    const cancelObj = rawCancel ? new Date(rawCancel) : null;
    const cancelStr = cancelObj && !isNaN(cancelObj) ? cancelObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

    let durationText = 'Unknown';
    if (startObj && !isNaN(startObj) && cancelObj && !isNaN(cancelObj)) {
        let y = cancelObj.getFullYear() - startObj.getFullYear();
        let m = cancelObj.getMonth() - startObj.getMonth();
        let d = cancelObj.getDate() - startObj.getDate();
        if (d < 0) { m -= 1; d += new Date(cancelObj.getFullYear(), cancelObj.getMonth(), 0).getDate(); }
        if (m < 0) { y -= 1; m += 12; }
        
        let arr = [];
        if (y > 0) arr.push(`${y} year${y>1?'s':''}`);
        if (m > 0) arr.push(`${m} month${m>1?'s':''}`);
        if (d > 0) arr.push(`${d} day${d>1?'s':''}`);
        durationText = arr.join(' ') || '0 days';
    }

    const notesStr = record.notes || 'No reason specified.';

    contentElem.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
            <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Name</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${custName}</div>
            </div>
            <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Plan</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${planName}</div>
            </div>
            <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Start Date</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${startStr}</div>
            </div>
            <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Cancelled On</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${cancelStr}</div>
            </div>
            <div style="padding: 16px; border-right: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Duration</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${durationText}</div>
            </div>
            <div style="padding: 16px; background: #fff;">
                <!-- Empty cell to cleanly finish the grid row -->
            </div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Reason for Cancellation</div>
            <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${notesStr}</div>
        </div>
    `;
}

window.viewRefundInfo = async function(purchaseId) {
    let modal = document.getElementById('refundInfoModalOverlay');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundInfoModalOverlay" style="z-index:9999;">
            <div class="modal-container" style="width: 950px; max-width: 95vw; padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div class="modal-header" style="background:#f8fafc; padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.15rem; color:#1e293b; font-weight: 600;"><i data-feather="info" style="width:18px; height:18px; margin-right:8px; color:#3b82f6; vertical-align:text-bottom;"></i>Refund Information</h2>
                    <button class="modal-close" onclick="document.getElementById('refundInfoModalOverlay').classList.remove('active')" style="background:none; border:none; cursor:pointer;"><i data-feather="x" style="color:#64748b;"></i></button>
                </div>
                <div class="modal-body" style="padding:24px; background: #fff;" id="refundInfoContent">
                    <div style="display:flex;justify-content:center;color:#94a3b8;padding: 40px 0;"><i data-feather="loader" class="spin"></i></div>
                </div>
                <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #fafafa;">
                    <button onclick="document.getElementById('refundInfoModalOverlay').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">Close</button>
                </div>
            </div>
        </div>
        `);
        if (window.feather) feather.replace();
        modal = document.getElementById('refundInfoModalOverlay');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }

    const content = document.getElementById('refundInfoContent');
    content.innerHTML = '<div style="display:flex;justify-content:center;color:#94a3b8;padding: 40px 0;"><i data-feather="loader" class="spin"></i></div>';
    if (window.feather) feather.replace();
    modal.classList.add('active');

    const purchase = (typeof currentPurchases !== 'undefined' ? currentPurchases : []).find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) {
        content.innerHTML = '<span style="color:#ef4444;">Purchase not found.</span>';
        return;
    }

    try {
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, status, created_at, paid_at, notes')
            .eq('reference_id', purchaseId)
            .eq('reference_type', 'membership')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let paidAmount = 0;
        let refundedAmount = 0;
        let cancelledDate = purchase.updated_at || null;
        let cancelledReason = purchase.notes || 'None provided';

        (data || []).forEach(tx => {
            const val = Math.abs(Number(tx.amount || 0));
            const stat = (tx.status || '').toLowerCase().trim();
            if (stat === 'paid') paidAmount += val;
            if (stat === 'refunded') {
                refundedAmount += val;
                if (!cancelledDate && tx.created_at) cancelledDate = tx.created_at;
                if (tx.notes && cancelledReason === 'None provided') cancelledReason = tx.notes;
            }
        });
        
        if (paidAmount === 0 && Number(purchase.price) > 0) paidAmount = Number(purchase.price);

        const custName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown';
        const planName = purchase.plan_name || purchase.membership_name || purchase.name || 'Unknown Plan';
        const startDate = purchase.purchase_date || purchase.start_date || 'N/A';
        const cDateObj = cancelledDate ? new Date(cancelledDate) : null;
        const cDateStr = cDateObj ? cDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';
        const sDateObj = new Date(startDate);
        const sDateStr = isNaN(sDateObj) ? startDate : sDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const rawCancelDate = purchase.cancelled_date || purchase.updated_at || null;
        const cancelDateObj = rawCancelDate ? new Date(rawCancelDate) : null;
        const cancelDateStr = cancelDateObj && !isNaN(cancelDateObj) ? cancelDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Name</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${custName}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Plan</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${planName}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Start Date</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${sDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Refunded Date</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${cDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Cancellation Date</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${cancelDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Paid Amount</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #10b981;">₹${paidAmount.toLocaleString('en-IN')}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Refunded Amount</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #dc2626;">₹${refundedAmount.toLocaleString('en-IN')}</div>
                </div>
            </div>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Reason for Cancellation</div>
                <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${purchase.notes || 'No reason specified.'}</div>
            </div>
        `;
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('viewRefundInfo error:', err);
        content.innerHTML = '<span style="color:#ef4444;">Failed to load refund summary.</span>';
    }
};

window.renewMembershipPurchase = function(purchaseId) {
    const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) {
        showToast('Purchase details not found.');
        return;
    }

    const assignModal = document.getElementById('assignModalOverlay');
    if (!assignModal) return;

    if (window.resetAssignMembershipForm) window.resetAssignMembershipForm();

    // Fill customer fields
    const custSearch = document.getElementById('custSearchInput');
    const custName = document.getElementById('assignCustomerName');
    const planInput = document.getElementById('assignPlanInput');

    if (custSearch) {
        // Find existing customer by id
        const custId = purchase.customer_id;
        const cust = allCustomers.find(c => (c.customer_id || c.id) === custId);
        if (cust) {
            const phoneStr = String(cust.customer_phone || cust.phone_number || '');
            custSearch.value = phoneStr;
            selectedCustomer = cust;
            
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
};
