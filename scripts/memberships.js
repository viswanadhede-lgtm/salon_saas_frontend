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

    // Open "Create Plan" via the primary action button (only when on "plans" tab)
    document.getElementById('primaryActionBtn')?.addEventListener('click', () => {
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

    const btnCancelCashConfirm2 = document.getElementById('btnCancelCashConfirm2');
    const btnCancelCashConfirm = document.getElementById('btnCancelCashConfirm');
    const cashConfirmOverlay = document.getElementById('cashConfirmOverlay');

    if (btnCancelCashConfirm2) {
        btnCancelCashConfirm2.addEventListener('click', () => {
            cashConfirmOverlay?.classList.remove('active');
            document.getElementById('assignModalOverlay')?.classList.add('active');
        });
    }
    if (btnCancelCashConfirm) {
        btnCancelCashConfirm.addEventListener('click', () => {
            cashConfirmOverlay?.classList.remove('active');
            document.getElementById('assignModalOverlay')?.classList.add('active');
        });
    }

    const btnProceedCashConfirm = document.getElementById('btnProceedCashConfirm');
    if (btnProceedCashConfirm) {
        btnProceedCashConfirm.addEventListener('click', async () => {
            await executeMembershipAssignment();
        });
    }

    const posPaymentMethods = document.getElementById('posPaymentMethods');
    if (posPaymentMethods) {
        const methods = posPaymentMethods.querySelectorAll('.pay-method-btn');
        methods.forEach(btn => {
            btn.addEventListener('click', () => {
                methods.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
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

        // Fetch plans directly
        const { data: plansData, error: plansErr } = await supabase
            .from('memberships')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });

        if (plansErr) throw plansErr;

        // Group flattened rows by membership_id
        const groupedPlans = {};
        (plansData || []).forEach(row => {
            const mId = row.membership_id;
            if (!groupedPlans[mId]) {
                // Initialize the top-level aggregate object
                groupedPlans[mId] = { ...row, applicable_services: [] };
            }
            
            // Push distinct services
            if (row.service_id) {
                groupedPlans[mId].applicable_services.push({
                    service_id: row.service_id,
                    service_name: row.service_name || '',
                    rowId: row.id
                });
            }
        });

        currentPlans = Object.values(groupedPlans);
        // Re-sort based on created_at 
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
        const isActive = plan.status === 'active';
        const statusBadge = isActive
            ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#ecfdf5;color:#059669;">
                   <span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>Active
               </span>`
            : `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#f1f5f9;color:#64748b;">
                   <span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;"></span>Inactive
               </span>`;

        const discountDisplay = plan.discount_type === 'flat'
            ? `₹${plan.discount_value} OFF`
            : `${plan.discount_value}% OFF`;

        const durationLabel = plan.duration_months
            ? `${plan.duration_months} Month${plan.duration_months > 1 ? 's' : ''}`
            : (plan.duration || '-');

        const planId = plan.membership_id || plan.id;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td>
                    <span style="font-weight:600;color:#1e293b;display:block;">${plan.plan_name || plan.name || '-'}</span>
                    ${plan.description ? `<span style="font-size:0.8rem;color:#94a3b8;">${plan.description}</span>` : ''}
                </td>
                <td>
                    <span style="font-weight:600;color:#059669;">₹${Number(plan.price || 0).toLocaleString('en-IN')}</span>
                </td>
                <td style="color:#64748b;">${durationLabel}</td>
                <td style="color:#64748b;">${discountDisplay}</td>
                <td>
                    <button onclick="window.viewMembersByPlan('${plan.plan_name || plan.name}')"
                        style="padding:4px 10px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;font-size:0.85rem;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                        ${plan.member_count || 0} members
                        <i data-feather="external-link" style="width:12px;height:12px;"></i>
                    </button>
                </td>
                <td>${statusBadge}</td>
                <td style="text-align:right;">
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button onclick="window.editPlan('${planId}')" class="action-btn edit-btn"
                            style="padding:6px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#3b82f6;" title="Edit">
                            <i data-feather="edit-2" style="width:16px;height:16px;"></i>
                        </button>
                        <button onclick="window.deletePlan('${planId}')" class="action-btn delete-btn"
                            style="padding:6px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#ef4444;" title="Delete">
                            <i data-feather="trash-2" style="width:16px;height:16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
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
    document.getElementById('planValidFromInput').value = '';
    document.getElementById('planDescInput').value = '';
    document.getElementById('planDiscountType').value = 'percentage';
    document.getElementById('planDiscountValue').value = '';

    const tog = document.getElementById('planStatusToggle');
    tog.checked = true;
    document.getElementById('planStatusLabel').textContent = 'Active';

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
    document.getElementById('planDescInput').value = plan.description || '';
    document.getElementById('planDiscountType').value = plan.discount_type || 'percentage';
    document.getElementById('planDiscountValue').value = plan.discount_value || '';

    if (plan.valid_from) {
        document.getElementById('planValidFromInput').value = plan.valid_from.split('T')[0];
    } else {
        document.getElementById('planValidFromInput').value = '';
    }

    const tog = document.getElementById('planStatusToggle');
    tog.checked = plan.status === 'active';
    document.getElementById('planStatusLabel').textContent = tog.checked ? 'Active' : 'Inactive';

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
    const valid_from = document.getElementById('planValidFromInput').value;
    const discount_type = document.getElementById('planDiscountType').value;
    const discount_value = document.getElementById('planDiscountValue').value;
    const description = document.getElementById('planDescInput').value.trim();

    if (!plan_name || !price || !valid_from || !discount_value) {
        showToast('Please fill all required fields (Name, Price, Valid From, Discount Value).');
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
        valid_from: valid_from || null,
        discount_type,
        discount_value: parseFloat(discount_value),
        status: document.getElementById('planStatusToggle').checked ? 'active' : 'inactive',
        description: description || null
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
            valid_from: valid_from || null,
            discount_type,
            discount_value: parseFloat(discount_value),
            status: document.getElementById('planStatusToggle').checked ? 'active' : 'inactive',
            description: description || null,
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
        
        const purchaseDateStr = purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : '-';
        const validUntilStr = purchase.expiry_date ? new Date(purchase.expiry_date).toLocaleDateString() : '-';
        
        const purchaseId = purchase.purchase_id || purchase.id;
        
        let priceDisplay = `₹${Number(purchase.price || 0).toLocaleString('en-IN')}`;
        if (isRefunded) {
             priceDisplay = `<del style="color:#94a3b8; font-weight:400; margin-right: 4px;">${priceDisplay}</del><br><span style="color:#dc2626; font-size:0.75rem; font-weight:600;">Refunded</span>`;
        } else {
             priceDisplay = `<span style="background-color: #ecfdf5; color: #059669; border: 1px solid #d1fae5; padding: 0.25rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">${priceDisplay}</span>`;
        }

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
                <td style="text-align: right;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="action-btn" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #3b82f6;" title="View">
                            <i data-feather="eye" style="width: 16px; height: 16px;"></i>
                        </button>
                        ${isActive ? `
                        <button onclick="window.cancelMembershipPurchase('${purchaseId}')" style="padding: 4px 12px; border-radius: 6px; border: 1px solid #fecdd3; background: #fff1f2; cursor: pointer; color: #e11d48; font-size: 0.75rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'" title="Cancel">Cancel</button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
}

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

    document.getElementById('assignModalOverlay')?.classList.remove('active');

    const price = selectedPlan ? Number(selectedPlan.price || 0) : 0;

    const cashConfirmOverlay = document.getElementById('cashConfirmOverlay');
    if (cashConfirmOverlay) {
        document.getElementById('cardTotal').textContent = `₹${price.toLocaleString('en-IN')}`;
        document.getElementById('cardDue').textContent = `₹${price.toLocaleString('en-IN')}`;
        document.getElementById('confirmAmountInput').value = price;
        cashConfirmOverlay.classList.add('active');
    }
}

async function executeMembershipAssignment() {
    const planValue = document.getElementById('assignPlanInput').value;
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.id) === planValue);

    const custSearchValue = document.getElementById('custSearchInput').value.trim();
    const custNameValue = document.getElementById('assignCustomerName')?.value.trim();
    const custEmailValue = document.getElementById('assignCustomerEmail')?.value.trim();
    const assignDate = document.getElementById('assignDateInput').value;
    
    // Get active payment method from the Collect modal
    let payMethod = 'cash';
    const activeMethodBtn = document.querySelector('#posPaymentMethods .pay-method-btn.active');
    if (activeMethodBtn) {
        payMethod = activeMethodBtn.dataset.method;
    }
    
    // Get final collected amount
    const finalPrice = Number(document.getElementById('confirmAmountInput').value || 0);

    const btn = document.getElementById('btnProceedCashConfirm');
    const origText = btn ? btn.textContent : 'Record Payment';
    if (btn) {
        btn.textContent = 'Processing...';
        btn.disabled = true;
    }

    // Create new customer if not selected
    let finalCustomerId = selectedCustomer ? (selectedCustomer.id || selectedCustomer.customer_id) : null;
    let finalCustomerName = selectedCustomer ? (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim() : custNameValue;
    
    if (!finalCustomerId) {
        const existingCust = allCustomers.find(c => String(c.customer_phone || c.phone_number || '') === custSearchValue);
        if (existingCust) {
            finalCustomerId = existingCust.id || existingCust.customer_id;
            finalCustomerName = existingCust.customer_name || `${existingCust.first_name || ''} ${existingCust.last_name || ''}`.trim() || 'Unknown Customer';
        } else {
            try {
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    customer_name: finalCustomerName || 'Unknown Customer',
                    customer_phone: custSearchValue,
                    customer_mail: custEmailValue || null,
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
                if (btn) {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
                return;
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

    // Pre-generate purchase_id so we can use it for business_transactions
    // without needing .select() after .insert() (not supported in Supabase v1)
    const newPurchaseId = crypto.randomUUID();

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

    const payload = {
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
            .insert(payload);

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
        document.getElementById('cashConfirmOverlay')?.classList.remove('active');
        
        // Reset form
        if (window.resetAssignMembershipForm) window.resetAssignMembershipForm();
        
        await loadPurchases();
    } catch (err) {
        console.error('executeMembershipAssignment error:', err);
        showToast('An error occurred during assignment: ' + (err.message || ''));
    } finally {
        if (btn) {
            btn.textContent = origText;
            btn.disabled = false;
        }
    }
}

function setupCancelPurchaseModal() {
    if (!document.getElementById('cancelPurchaseConfirmOverlay')) {
        const modalHtml = `
        <div class="modal-overlay custom-logout-overlay" id="cancelPurchaseConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(8px);">
            <div class="logout-modal" style="background: white; border-radius: 16px; padding: 32px; width: 400px; max-width: 90vw; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="logout-icon-container" style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i data-feather="x-circle" style="color: #ef4444; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Cancel Membership?</h2>
                <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">Are you sure you want to cancel this membership? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="btnCancelCancelPurchase" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Keep It</button>
                    <button id="btnConfirmCancelPurchase" style="flex: 1; padding: 12px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Cancel</button>
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
            overlay.classList.remove('active');
            await executeCancelMembershipPurchase(purchaseToCancel);
            purchaseToCancel = null;
        });
    }
}

window.cancelMembershipPurchase = function(purchaseId) {
    setupCancelPurchaseModal();
    purchaseToCancel = purchaseId;
    document.getElementById('cancelPurchaseConfirmOverlay').classList.add('active');
};

async function executeCancelMembershipPurchase(purchaseId) {
    try {
        const { error } = await supabase
            .from('membership_purchases')
            .eq('purchase_id', purchaseId)
            .update({ status: 'cancelled' });

        if (error) {
            // fallback if pk is id
            const { error: err2 } = await supabase.from('membership_purchases').eq('id', purchaseId).update({ status: 'cancelled' });
            if (err2) throw err2;
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
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
                        <p style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Refundable Amount</p>
                        <p style="font-size: 2.25rem; font-weight: 800; color: #dc2626; margin: 0;" id="rfMemAmountDisplay">₹0</p>
                    </div>

                    <div class="form-group" style="margin-bottom: 20px;">
                        <label class="form-label" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Refund Method</label>
                        <input type="text" id="rfMemMethodDisplay" class="form-input read-only-input" style="background: #f1f5f9; color: #64748b;" readonly value="Loading...">
                    </div>

                    <div class="form-group" style="margin-bottom: 24px;">
                        <label class="form-label" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Reason for Refund <span style="color: #94a3b8; font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <textarea id="rfMemNote" class="form-input" style="height: 100px; padding: 12px; resize: none;" placeholder="Enter details about this refund..."></textarea>
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
    amountDisplay.textContent = 'Calculating...';
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

        const ledgerNet = ledgerPaid - ledgerRefunded;
        
        if (ledgerNet > 0) {
            refundableMembershipAmount = ledgerNet;
        } else if (data && data.length === 0) {
             // Fallback for legacy items without ledger
            refundableMembershipAmount = Number(purchaseToRefundObj.price || 0) - ledgerRefunded;
        } else {
            refundableMembershipAmount = Math.max(0, ledgerNet);
        }

        if (refundableMembershipAmount < 0) refundableMembershipAmount = 0;

        amountDisplay.textContent = `₹${refundableMembershipAmount.toLocaleString('en-IN')}`;
        amountDisplay.style.color = (refundableMembershipAmount <= 0) ? '#94a3b8' : '#dc2626';

        const lastMethod = data && data.length > 0 ? data[data.length - 1].payment_method : 'cash';
        methodDisplay.value = lastMethod ? (lastMethod.charAt(0).toUpperCase() + lastMethod.slice(1)) : 'Cash';

        if (refundableMembershipAmount <= 0) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Nothing to Refund';
        } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Issue Refund';
        }

    } catch (err) {
        console.error('Error fetching ledger for refund:', err);
        amountDisplay.textContent = 'Error';
    }
};

async function processMembershipRefund() {
    if (!purchaseToRefundObj || refundableMembershipAmount <= 0) return;
    
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
                amount: Math.abs(refundableMembershipAmount),
                status: 'refunded',
                payment_method: (document.getElementById('rfMemMethodDisplay')?.value || 'cash').toLowerCase(),
                notes: note || `Refund processed for membership ${purchaseId}`,
                paid_at: new Date().toISOString()
            });

        if (txError) {
             console.warn('business_transactions insert failed, but updating membership record anyway:', txError);
        }

        // 2. Update membership_purchases status
        const { error: memError } = await supabase
            .from('membership_purchases')
            .update({ status: 'refunded', payment_status: 'refunded' })
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
