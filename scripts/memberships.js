import { API, fetchWithAuth } from '../config/api.js';

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
const getCompanyId = () => localStorage.getItem('company_id') || '';
const getBranchId  = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await fetchServices();
    await loadPlans();
    await fetchCustomers();
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

    document.getElementById('closePlanModal')?.addEventListener('click',  closePlanModal);
    document.getElementById('btnCancelPlan')?.addEventListener('click',   closePlanModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) closePlanModal(); });

    // Status toggle label
    const statusToggle = document.getElementById('planStatusToggle');
    const statusLabel  = document.getElementById('planStatusLabel');
    statusToggle?.addEventListener('change', () => {
        statusLabel.textContent = statusToggle.checked ? 'Active' : 'Inactive';
    });

    // Services dropdown
    const svcBtn  = document.getElementById('planSvcBtn');
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

    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            selectedCustomer = null; // reset on type
            const raw = e.target.value.trim();
            const digits = raw.replace(/\\D/g, '');

            if (!digits) {
                if(custSuggestions) custSuggestions.style.display = 'none';
                return;
            }

            const filtered = allCustomers.filter(c => {
                const phoneStr = (c.customer_phone || c.phone_number || '').toString();
                return phoneStr.replace(/\\D/g, '').includes(digits);
            });

            if (filtered.length === 0) {
                custSuggestions.innerHTML = `<div style="padding: 14px 12px; color: #64748b; font-size: 0.85rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px;"><span style="font-size: 1.2rem;">🔍</span><span>No customer found with this number</span></div>`;
            } else {
                custSuggestions.innerHTML = filtered.slice(0, 8).map(c => {
                    const phone = (c.customer_phone || c.phone_number || '').toString();
                    const fullName = (c.customer_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Unknown';
                    const custId = c.id || c.customer_id;

                    const highlightedPhone = phone.replace(
                        new RegExp(digits.split('').join('\\\\D*'), 'g'),
                        match => `<strong style="color: #4f46e5;">${match}</strong>`
                    );

                    const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
                    const colors = ['#e0e7ff', '#d1fae5', '#fef3c7', '#ede9fe', '#dbeafe'];
                    const textColors = ['#4338ca', '#059669', '#d97706', '#7c3aed', '#1d4ed8'];
                    const ci = (initials.charCodeAt(0) || 0) % colors.length;

                    return `<div class="cust-suggestion-item" data-id="${custId}" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; transition: background 0.15s;" onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background='transparent'"><div style="width: 34px; height: 34px; border-radius: 50%; background: ${colors[ci]}; color: ${textColors[ci]}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0;">${initials}</div><div style="flex: 1; min-width: 0;"><div style="font-size: 0.88rem; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fullName}</div><div style="font-size: 0.75rem; color: #64748b; margin-top: 1px;">${highlightedPhone}</div></div></div>`;
                }).join('');
            }
            custSuggestions.style.display = 'block';
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
             if (custSearch && custSuggestions && !custSearch.contains(e.target) && !custSuggestions.contains(e.target)) {
                 custSuggestions.style.display = 'none';
             }
        });

        if (custSuggestions) {
            custSuggestions.addEventListener('click', (e) => {
                const item = e.target.closest('.cust-suggestion-item');
                if (item) {
                     const id = item.dataset.id;
                     const customer = allCustomers.find(c => (c.id || c.customer_id) == id);
                     if (customer) {
                         selectedCustomer = customer;
                         const fullName = (customer.customer_name || `${customer.first_name || ''} ${customer.last_name || ''}`).trim() || '';
                         custSearch.value = fullName + ' (' + (customer.customer_phone || customer.phone_number || '') + ')';
                         custSuggestions.style.display = 'none';
                     }
                }
            });
        }
    }

    const confirmAssignBtn = document.getElementById('btnConfirmAssign');
    if (confirmAssignBtn) {
        confirmAssignBtn.addEventListener('click', () => {
            const planValue = document.getElementById('assignPlanInput').value;
            const custSearchValue = document.getElementById('custSearchInput').value;
            
            if (!selectedCustomer || !custSearchValue) {
                showToast('Please search and select a valid customer.');
                return;
            }
            if (!planValue) {
                showToast('Please select a membership plan.');
                return;
            }
            
            // Hide the assign modal and show the confirm modal
            document.getElementById('assignModalOverlay')?.classList.remove('active');
            document.getElementById('confirmPaymentOverlay')?.classList.add('active');
        });
    }

    const btnCancelPaymentConfirm = document.getElementById('btnCancelPaymentConfirm');
    if (btnCancelPaymentConfirm) {
        btnCancelPaymentConfirm.addEventListener('click', () => {
            // Close confirm modal and restore the assign modal
            document.getElementById('confirmPaymentOverlay')?.classList.remove('active');
            document.getElementById('assignModalOverlay')?.classList.add('active');
        });
    }

    const btnProceedPayment = document.getElementById('btnProceedPayment');
    if (btnProceedPayment) {
        btnProceedPayment.addEventListener('click', async () => {
            document.getElementById('confirmPaymentOverlay')?.classList.remove('active');
            await handleAssignMembership();
        });
    }
});

// ── Helpers ────────────────────────────────────────────────────────────────
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
    const svcText    = document.getElementById('planSvcText');
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

// ── Customers Fetch ───────────────────────────────────────────────────────
async function fetchCustomers() {
    try {
        const response = await fetchWithAuth(API.READ_CUSTOMERS, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0 && data[0].customers) {
                allCustomers = data[0].customers;
            } else {
                allCustomers = Array.isArray(data) ? data : (data.customers || []);
            }
        }
    } catch (err) {
        console.error('fetchCustomers (memberships):', err);
    }
}

// ── Services Fetch ────────────────────────────────────────────────────────
async function fetchServices() {
    try {
        const res = await fetchWithAuth(API.READ_SERVICES, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id:  getBranchId()
            })
        });
        if (res.ok) {
            const data = await res.json();
            availableServices = Array.isArray(data) ? data : (data.services || []);
            populatePlanSvcCheckboxes();
        }
    } catch (err) {
        console.error('fetchServices (memberships):', err);
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

// ── READ ───────────────────────────────────────────────────────────────────
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
        const res = await fetchWithAuth(API.READ_MEMBERSHIP_PLANS, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id:  getBranchId()
            })
        });

        if (res.ok) {
            const rawData = await res.json();
            const rows = Array.isArray(rawData) ? rawData : (rawData.plans || rawData.membership_plans || []);

            // Group flat rows by membership_id, aggregating applicable_services
            const planMap = {};
            rows.forEach(row => {
                const id = row.membership_id || row.plan_id || row.membership_plan_id || row._id;
                if (!planMap[id]) {
                    planMap[id] = { ...row, applicable_services: [] };
                }
                if (row.service_id) {
                    planMap[id].applicable_services.push({
                        service_id:   row.service_id,
                        service_name: row.service_name
                    });
                }
            });

            currentPlans = Object.values(planMap);
            renderPlans();
            populateAssignPlanDropdown();
        } else {

            throw new Error('API error');
        }
    } catch (err) {
        console.error('loadPlans:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership plans.</td></tr>`;
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
        const isActive   = plan.status === 'active';
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

        const planId = plan.membership_id || plan.plan_id || plan.membership_plan_id || plan._id;

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
        const planId = plan.membership_id || plan.plan_id || plan.membership_plan_id || plan._id;
        option.value = planId;
        const price = Number(plan.price || 0).toLocaleString('en-IN');
        option.textContent = `${plan.plan_name || plan.name} (₹${price})`;
        planSelect.appendChild(option);
    });
}

// ── Modal open / close ─────────────────────────────────────────────────────
function openCreateModal() {
    isEditing     = false;
    currentEditId = null;
    resetPlanForm();

    document.querySelector('#planModal h2').textContent         = 'Create Membership Plan';
    document.querySelector('#planModal .subtitle').textContent  = 'Define a new membership product and its benefits.';
    document.getElementById('btnSavePlan').textContent          = 'Create Plan';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

function closePlanModal() {
    document.getElementById('planModalOverlay').classList.remove('active');
}

function resetPlanForm() {
    const nameInput = document.getElementById('planNameInput');
    nameInput.value       = '';
    nameInput.readOnly    = false;
    nameInput.style.background = '';
    nameInput.style.color      = '';
    nameInput.style.cursor     = '';

    document.getElementById('planPriceInput').value         = '';
    document.getElementById('planDurationInput').value      = '12';
    document.getElementById('planValidFromInput').value     = '';
    document.getElementById('planDescInput').value          = '';
    document.getElementById('planDiscountType').value       = 'percentage';
    document.getElementById('planDiscountValue').value      = '';

    const tog = document.getElementById('planStatusToggle');
    tog.checked = true;
    document.getElementById('planStatusLabel').textContent = 'Active';

    // Reset services
    document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
    applyPlanSvcSelection();
}

// ── EDIT ───────────────────────────────────────────────────────────────────
window.editPlan = function(id) {
    const plan = currentPlans.find(p => (p.membership_id || p.plan_id || p.membership_plan_id || p._id) === id);
    if (!plan) {
        console.warn('editPlan: plan not found for id', id, currentPlans);
        return;
    }

    isEditing     = true;
    currentEditId = id;

    // Plan Name — read-only in edit mode
    const nameInput = document.getElementById('planNameInput');
    nameInput.value          = plan.plan_name || plan.name || '';
    nameInput.readOnly       = true;
    nameInput.style.background = '#f1f5f9';
    nameInput.style.color      = '#94a3b8';
    nameInput.style.cursor     = 'not-allowed';

    document.getElementById('planPriceInput').value         = plan.price || '';
    document.getElementById('planDurationInput').value      = plan.duration_months || plan.duration || '12';
    document.getElementById('planDescInput').value          = plan.description || '';
    document.getElementById('planDiscountType').value       = plan.discount_type || 'percentage';
    document.getElementById('planDiscountValue').value      = plan.discount_value || '';

    if (plan.valid_from) {
        document.getElementById('planValidFromInput').value = new Date(plan.valid_from).toISOString().split('T')[0];
    } else {
        document.getElementById('planValidFromInput').value = '';
    }

    const tog = document.getElementById('planStatusToggle');
    tog.checked = plan.status === 'active';
    document.getElementById('planStatusLabel').textContent = tog.checked ? 'Active' : 'Inactive';

    // Services — pre-check matching (fix: don't auto-check 'all')
    const checkboxes = document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]');
    const svcIds = (plan.applicable_services || []).map(s =>
        typeof s === 'object' ? (s.service_id || s._id) : s
    );
    const allMatch = svcIds.length > 0 && svcIds.length >= availableServices.length;

    checkboxes.forEach(c => {
        if (c.value === 'all') {
            c.checked = allMatch;
        } else {
            c.checked = svcIds.includes(c.value);
        }
    });
    applyPlanSvcSelection();

    document.querySelector('#planModal h2').textContent        = 'Edit Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Update the details for this membership plan.';
    document.getElementById('btnSavePlan').textContent         = 'Save Changes';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
};

// ── DELETE ─────────────────────────────────────────────────────────────────
window.deletePlan = function(id) {
    planToDelete = id;
    const overlay = document.getElementById('deletePlanConfirmOverlay');
    if (overlay) {
        overlay.classList.add('active');
    } else {
        // Fallback if confirm modal doesn't exist yet — use native confirm
        if (confirm('Are you sure you want to delete this membership plan?')) {
            executeDeletePlan(id);
        }
    }
};

async function executeDeletePlan(id) {
    try {
        const res = await fetchWithAuth(API.DELETE_MEMBERSHIP_PLAN, {
            method: 'POST',
            body: JSON.stringify({
                company_id:    getCompanyId(),
                branch_id:     getBranchId(),
                membership_id: id
            })
        });

        if (res.ok) {
            showToast('Membership plan deleted successfully.');
            await loadPlans();
        } else {
            showToast('Failed to delete plan.');
        }
    } catch (err) {
        console.error('executeDeletePlan:', err);
        showToast('Error deleting plan.');
    }
}

// ── SAVE (Create / Update) ─────────────────────────────────────────────────
async function handleSavePlan() {
    const plan_name      = document.getElementById('planNameInput').value.trim();
    const price          = document.getElementById('planPriceInput').value;
    const duration       = document.getElementById('planDurationInput').value;
    const valid_from     = document.getElementById('planValidFromInput').value;
    const discount_type  = document.getElementById('planDiscountType').value;
    const discount_value = document.getElementById('planDiscountValue').value;

    if (!plan_name || !price || !valid_from || !discount_value) {
        showToast('Please fill all required fields (Name, Price, Valid From, Discount Value).');
        return;
    }

    // Collect selected services
    const checkboxes = document.querySelectorAll('#planSvcCheckboxList input[type="checkbox"]');
    let applicable_services = Array.from(checkboxes)
        .filter(c => c.checked && c.value !== 'all')
        .map(c => ({
            service_id:   c.value,
            service_name: c.parentElement.textContent.trim()
        }));

    const payload = {
        company_id:        getCompanyId(),
        branch_id:         getBranchId(),
        plan_name,
        price:             parseFloat(price),
        duration_months:   parseInt(duration, 10),
        valid_from,
        discount_type,
        discount_value:    parseFloat(discount_value),
        status:            document.getElementById('planStatusToggle').checked ? 'active' : 'inactive',
    };

    const description = document.getElementById('planDescInput').value.trim();
    if (description) payload.description = description;
    if (applicable_services.length > 0) payload.applicable_services = applicable_services;

    if (isEditing && currentEditId) {
        payload.membership_id = currentEditId;
    }

    const btn = document.getElementById('btnSavePlan');
    const origText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = isEditing ? API.UPDATE_MEMBERSHIP_PLAN : API.CREATE_MEMBERSHIP_PLAN;
        const res = await fetchWithAuth(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast(isEditing ? 'Plan updated successfully.' : 'Plan created successfully.');
            closePlanModal();
            await loadPlans();
        } else {
            showToast('Failed to save plan.');
        }
    } catch (err) {
        console.error('handleSavePlan:', err);
        showToast('Error saving plan.');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ── Purchases Workflow ──────────────────────────────────────────────────────

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
        const res = await fetchWithAuth(API.READ_MEMBERSHIP_PURCHASES, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id:  getBranchId()
            })
        });

        if (res.ok) {
            const data = await res.json();
            currentPurchases = Array.isArray(data) ? data : (data.purchases || data.membership_purchases || []);
            renderPurchases();
        } else {
            throw new Error('API error');
        }
    } catch (err) {
        console.error('loadPurchases:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership purchases.</td></tr>`;
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
        
        let statusBadge = '';
        if (isActive) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#ecfdf5;color:#059669;">Active</span>`;
        } else if (isCancelled) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#ef4444;">Cancelled</span>`;
        } else {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#f1f5f9;color:#64748b;">Expired</span>`;
        }

        const fullName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown Customer';
        const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
        
        const purchaseDateStr = purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : '-';
        const validUntilStr = purchase.expiry_date ? new Date(purchase.expiry_date).toLocaleDateString() : '-';
        
        const purchaseId = purchase.purchase_id || purchase.id;

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
                    <span style="background-color: #ecfdf5; color: #059669; border: 1px solid #d1fae5; padding: 0.25rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">₹${Number(purchase.price || 0).toLocaleString('en-IN')}</span>
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
                        <button class="action-btn" onclick="window.cancelMembershipPurchase('${purchaseId}')" style="padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #ef4444;" title="Cancel">
                            <i data-feather="x-circle" style="width: 16px; height: 16px;"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.feather) feather.replace();
}

async function handleAssignMembership() {
    const planValue = document.getElementById('assignPlanInput').value;
    const custSearchValue = document.getElementById('custSearchInput').value;
    const assignDate = document.getElementById('assignDateInput').value;
    
    let payMethod = 'cash';
    const activePayMethod = document.querySelector('input[name="payMethod"]:checked');
    if (activePayMethod) payMethod = activePayMethod.value;

    const discountValue = document.getElementById('assignDiscount').value;
    const notesValue = document.getElementById('assignNotes').value;

    if (!selectedCustomer || !custSearchValue) {
        showToast('Please search and select a valid customer.');
        return;
    }
    
    if (!planValue) {
        showToast('Please select a membership plan.');
        return;
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

    const customerName = (selectedCustomer.customer_name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`).trim();
    const selectedPlan = currentPlans.find(p => (p.membership_id || p.plan_id || p.membership_plan_id || p._id) === planValue);

    const payload = {
        company_id: getCompanyId(),
        branch_id: getBranchId(),
        sold_by_user_id: userId,
        user_name: userName,
        customer_id: selectedCustomer.id || selectedCustomer.customer_id,
        customer_name: customerName,
        membership_id: planValue,
        plan_name: selectedPlan ? (selectedPlan.plan_name || selectedPlan.name) : null,
        price: selectedPlan ? Number(selectedPlan.price || 0) : null,
        duration: selectedPlan ? (selectedPlan.duration_months || selectedPlan.duration) : null,
        pay_method: payMethod,
        purchase_date: assignDate || new Date().toISOString().split('T')[0],
        status: 'active'
    };

    if (discountValue) payload.discount_applied = parseFloat(discountValue);
    if (notesValue) payload.notes = notesValue;

    const btn = document.getElementById('btnConfirmAssign');
    const origText = btn.textContent;
    btn.textContent = 'Processing...';
    btn.disabled = true;

    try {
        const res = await fetchWithAuth(API.CREATE_MEMBERSHIP_PURCHASE, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Membership assigned successfully!');
            document.getElementById('assignModalOverlay')?.classList.remove('active');
            
            // Reset form
            document.getElementById('custSearchInput').value = '';
            document.getElementById('assignPlanInput').value = '';
            document.getElementById('assignDiscount').value = '';
            document.getElementById('assignNotes').value = '';
            selectedCustomer = null;
            
            // Reload purchases list
            await loadPurchases();
        } else {
            showToast('Failed to assign membership.');
        }
    } catch (err) {
        console.error('handleAssignMembership error:', err);
        showToast('An error occurred during assignment.');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
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
        const res = await fetchWithAuth(API.CANCEL_MEMBERSHIP_PURCHASE, {
            method: 'POST',
            body: JSON.stringify({
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                purchase_id: purchaseId
            })
        });

        if (res.ok) {
            showToast('Membership has been cancelled.');
            await loadPurchases();
        } else {
            showToast('Failed to cancel membership.');
        }
    } catch (err) {
        console.error('cancelMembershipPurchase error:', err);
        showToast('Error cancelling membership.');
    }
}

