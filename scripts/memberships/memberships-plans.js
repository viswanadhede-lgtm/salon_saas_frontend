// scripts/memberships/memberships-plans.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPlans,
    setCurrentPlans,
    getAvailableServices,
    setAvailableServices,
    getIsEditing,
    setIsEditing,
    getCurrentEditId,
    setCurrentEditId,
    getPlanToDelete,
    setPlanToDelete
} from './memberships-state.js';
import { showToast } from './memberships-utils.js';
import {
    fetchServicesApi,
    fetchPlansAndMemberCountsApi,
    deletePlanRowsApi,
    insertPlanRowsApi,
    softDeletePlanApi
} from './memberships-api.js';
import { populateAssignPlanDropdown } from './memberships-assign-modal.js';

// ── Services Fetch ──────────────────────────────────────────────────────────
export async function fetchServices() {
    try {
        const { data, error } = await fetchServicesApi(getCompanyId(), getBranchId());
        if (error) throw error;
        const activeServices = (data || []).filter(s => (s.status || '').toLowerCase() === 'active');
        setAvailableServices(activeServices);
        populatePlanSvcCheckboxes();
    } catch (err) {
        console.error('Failed to load services (Supabase):', err);
    }
}

export function populatePlanSvcCheckboxes() {
    const container = document.getElementById('planSvcCheckboxList');
    if (!container) return;

    const availableServices = getAvailableServices();
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

export function applyPlanSvcSelection() {
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

// ── Read Plans ─────────────────────────────────────────────────────────────
export async function loadPlans() {
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
        const [plansResult, purchasesResult] = await fetchPlansAndMemberCountsApi(companyId, branchId);

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

        let currentPlans = Object.values(groupedPlans);
        // Attach member counts
        currentPlans.forEach(plan => {
            plan.member_count = memberCountMap[plan.membership_id] || 0;
        });
        currentPlans.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setCurrentPlans(currentPlans);

        renderPlans();
        if (typeof populateAssignPlanDropdown === 'function') {
            populateAssignPlanDropdown();
        }
    } catch (err) {
        console.error('loadPlans:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">Failed to load membership plans: ${err.message || ''}</td></tr>`;
    }
}

export function renderPlans() {
    const tbody = document.querySelector('#plansTableContent tbody');
    if (!tbody) return;

    const currentPlans = getCurrentPlans();
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

// ── Modal open / close ─────────────────────────────────────────────────────
export function openCreateModal() {
    setIsEditing(false);
    setCurrentEditId(null);
    resetPlanForm();

    document.querySelector('#planModal h2').textContent = 'Create Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Define a new membership product and its benefits.';
    document.getElementById('btnSavePlan').textContent = 'Create Plan';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

export function closePlanModal() {
    document.getElementById('planModalOverlay').classList.remove('active');
}

export function resetPlanForm() {
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
export function editPlan(id) {
    const currentPlans = getCurrentPlans();
    const availableServices = getAvailableServices();
    const plan = currentPlans.find(p => (p.membership_id || p.id) === id);
    if (!plan) return;

    setIsEditing(true);
    setCurrentEditId(id);

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
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export function deletePlan(id) {
    setPlanToDelete(id);
    const overlay = document.getElementById('deletePlanConfirmOverlay');
    if (overlay) {
        overlay.classList.add('active');
    } else {
        if (confirm('Are you sure you want to delete this membership plan?')) {
            executeDeletePlan(id);
        }
    }
}

export async function executeDeletePlan(id) {
    try {
        const { error } = await softDeletePlanApi(id);
        if (error) throw error;
        showToast('Membership plan deleted successfully.');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_membership', {
                title: 'Membership Plan Deleted',
                message: 'A membership plan was deleted.'
            });
        }
        await loadPlans();
    } catch (err) {
        console.error('executeDeletePlan:', err);
        showToast('Error deleting plan: ' + (err.message || ''));
    }
}

// ── SAVE (Create / Update) ─────────────────────────────────────────────────
export async function handleSavePlan() {
    const plan_name = document.getElementById('planNameInput').value.trim();
    const price = document.getElementById('planPriceInput').value;
    const duration = document.getElementById('planDurationInput').value;
    const discount_type = document.getElementById('planDiscountType').value;
    const discount_value = document.getElementById('planDiscountValue').value;

    if (!plan_name || !price || !discount_value) {
        showToast('Please fill all required fields (Name, Price, Discount Value).');
        return;
    }

    const currentPlans = getCurrentPlans();
    const currentEditId = getCurrentEditId();
    const isEditing = getIsEditing();
    const availableServices = getAvailableServices();

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
            const { error: delErr } = await deletePlanRowsApi(planId);
            if (delErr) throw delErr;
        }

        // INSERT all mapped rows safely
        if (rowsToInsert.length > 0) {
            const { error: insErr } = await insertPlanRowsApi(rowsToInsert);
            if (insErr) throw insErr;
        }

        showToast(isEditing ? 'Plan updated successfully.' : 'Plan created successfully.');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_membership', {
                title: isEditing ? 'Membership Plan Updated' : 'New Membership Plan Created',
                message: `Plan "${plan_name}" was ${isEditing ? 'updated' : 'created'}.`
            });
        }
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

// ── Wire Listeners ─────────────────────────────────────────────────────────
export function initPlanListeners() {
    const overlay = document.getElementById('planModalOverlay');

    // Open "Create Plan" via dedicated Create button
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

    // Delete Confirm Modal wiring
    document.getElementById('btnCancelDeletePlan')?.addEventListener('click', () => {
        document.getElementById('deletePlanConfirmOverlay')?.classList.remove('active');
        setPlanToDelete(null);
    });
    document.getElementById('btnConfirmDeletePlan')?.addEventListener('click', async () => {
        const planToDelete = getPlanToDelete();
        if (!planToDelete) return;
        document.getElementById('deletePlanConfirmOverlay')?.classList.remove('active');
        await executeDeletePlan(planToDelete);
        setPlanToDelete(null);
    });
}
