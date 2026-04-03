import { API, fetchWithAuth } from '../config/api.js';

// ── State ──────────────────────────────────────────────────────────────────
let currentPlans = [];
let availableServices = [];
let isEditing = false;
let currentEditId = null;
let planToDelete = null;

// ── Context helpers ────────────────────────────────────────────────────────
const getCompanyId = () => localStorage.getItem('company_id') || '';
const getBranchId  = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await fetchServices();
    await loadPlans();

    // Reload when branch changes
    document.getElementById('branchSelect')?.addEventListener('change', loadPlans);

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
});

// ── Helpers ────────────────────────────────────────────────────────────────
function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
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
