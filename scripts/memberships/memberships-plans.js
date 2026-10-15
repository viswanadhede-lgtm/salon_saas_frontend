// scripts/memberships/memberships-plans.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPlans,
    setCurrentPlans,
    getIsEditing,
    setIsEditing,
    getCurrentEditId,
    setCurrentEditId,
    getPlanToDelete,
    setPlanToDelete
} from './memberships-state.js';
import { showToast } from './memberships-utils.js';
import {
    fetchPlansAndMemberCountsApi,
    insertSinglePlanApi,
    updateSinglePlanApi,
    softDeletePlanApi
} from './memberships-api.js';
import { populateAssignPlanDropdown } from './memberships-assign-modal.js';

// ── Applicable To Visual Feedback ──────────────────────────────────────────
function updateApplicableToVisuals() {
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb    = document.getElementById(`appTo${type}`);
        const label = document.getElementById(`appTo${type}Label`);
        if (!cb || !label) return;
        if (cb.checked) {
            label.style.borderColor = '#7c3aed';
            label.style.background  = '#faf5ff';
        } else {
            label.style.borderColor = '#e2e8f0';
            label.style.background  = '#f8fafc';
        }
    });
}

// ── Load Plans ─────────────────────────────────────────────────────────────
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
        const branchId  = getBranchId();

        const [plansResult, purchasesResult] = await fetchPlansAndMemberCountsApi(companyId, branchId);
        if (plansResult.error) throw plansResult.error;

        // Build member count map from active purchases only
        const memberCountMap = {};
        (purchasesResult.data || []).forEach(row => {
            if (row.membership_id) {
                memberCountMap[row.membership_id] = (memberCountMap[row.membership_id] || 0) + 1;
            }
        });

        // 1 row = 1 plan — no grouping needed
        const currentPlans = (plansResult.data || []).map(plan => ({
            ...plan,
            member_count: memberCountMap[plan.membership_id] || 0
        }));

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

// ── Render Plans Table ─────────────────────────────────────────────────────
export function renderPlans() {
    const tbody = document.querySelector('#plansTableContent tbody');
    if (!tbody) return;

    const currentPlans = getCurrentPlans();
    if (currentPlans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b;">No membership plans yet. Click "Create Plan" to add one.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentPlans.map(plan => {
        const isFlat          = plan.discount_type === 'flat';
        const discountText    = isFlat ? `₹${plan.discount_value} OFF` : `${plan.discount_value}% OFF`;
        const discountColor   = isFlat ? 'color:#15803d;background:#dcfce7;' : 'color:#0284c7;background:#e0f2fe;';
        const discountDisplay = `<span style="font-weight:700;${discountColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountText}</span>`;

        const dur           = plan.duration_months || plan.duration;
        const durationLabel = dur ? `${dur} Month${dur > 1 ? 's' : ''}` : '-';

        const planId = plan.membership_id || plan.id;

        // Applicable To pills
        const chipBase = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:500;`;
        const pills = [];
        if (plan.all_services)    pills.push(`<span style="${chipBase}background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">Services</span>`);
        if (plan.all_products)    pills.push(`<span style="${chipBase}background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">Products</span>`);
        if (plan.all_memberships) pills.push(`<span style="${chipBase}background:#faf5ff;color:#7c3aed;border:1px solid #e9d5ff;">Memberships</span>`);
        const applicableDisplay = pills.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:3px;">${pills.join('')}</div>`
            : `<span style="color:#94a3b8;font-size:0.8rem;">—</span>`;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td>
                    <span style="font-weight:600;color:#1e3a8a;display:block;font-size:1rem;">${plan.plan_name || '-'}</span>
                </td>
                <td>${discountDisplay}</td>
                <td>${applicableDisplay}</td>
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
                        <button class="hover-lift edit-btn" data-sub-feature="update_membership"
                            onclick="window.editPlan('${planId}')" title="Edit Plan"
                            style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #e0e7ff;background:#eff6ff;cursor:pointer;color:#3b82f6;transition:all 0.2s;min-width:52px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span style="font-size:10px;font-weight:600;">Edit</span>
                        </button>
                        <button class="hover-lift delete-btn" data-sub-feature="delete_membership"
                            onclick="window.deletePlan('${planId}')" title="Delete Plan"
                            style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;border-radius:8px;border:1px solid #fee2e2;background:#fef2f2;cursor:pointer;color:#ef4444;transition:all 0.2s;min-width:52px;">
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

// ── Modal Open / Close ─────────────────────────────────────────────────────
export function openCreateModal() {
    setIsEditing(false);
    setCurrentEditId(null);
    resetPlanForm();

    document.querySelector('#planModal h2').textContent        = 'Create Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Define a new membership product and its benefits.';
    document.getElementById('btnSavePlan').textContent         = 'Create Plan';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

export function closePlanModal() {
    document.getElementById('planModalOverlay').classList.remove('active');
}

export function resetPlanForm() {
    const nameInput = document.getElementById('planNameInput');
    nameInput.value       = '';
    nameInput.readOnly    = false;
    nameInput.style.background = '';
    nameInput.style.color      = '';
    nameInput.style.cursor     = '';

    document.getElementById('planPriceInput').value    = '';
    document.getElementById('planDurationInput').value = '12';
    document.getElementById('planDiscountType').value  = 'percentage';
    document.getElementById('planDiscountValue').value = '';

    // Reset Applicable To checkboxes
    ['Services', 'Products', 'Memberships'].forEach(type => {
        const cb = document.getElementById(`appTo${type}`);
        if (cb) cb.checked = false;
    });
    updateApplicableToVisuals();
}

// ── Edit ───────────────────────────────────────────────────────────────────
export function editPlan(id) {
    const plan = getCurrentPlans().find(p => (p.membership_id || p.id) === id);
    if (!plan) return;

    setIsEditing(true);
    setCurrentEditId(id);

    // Plan name is read-only in edit mode
    const nameInput       = document.getElementById('planNameInput');
    nameInput.value       = plan.plan_name || '';
    nameInput.readOnly    = true;
    nameInput.style.background = '#f1f5f9';
    nameInput.style.color      = '#94a3b8';
    nameInput.style.cursor     = 'not-allowed';

    document.getElementById('planPriceInput').value    = plan.price || '';
    document.getElementById('planDurationInput').value = plan.duration_months || plan.duration || '12';
    document.getElementById('planDiscountType').value  = plan.discount_type || 'percentage';
    document.getElementById('planDiscountValue').value = plan.discount_value || '';

    // Populate Applicable To checkboxes from boolean columns
    const svcs = document.getElementById('appToServices');
    const prod = document.getElementById('appToProducts');
    const memb = document.getElementById('appToMemberships');
    if (svcs) svcs.checked = plan.all_services    === true;
    if (prod) prod.checked = plan.all_products    === true;
    if (memb) memb.checked = plan.all_memberships === true;
    updateApplicableToVisuals();

    document.querySelector('#planModal h2').textContent        = 'Edit Membership Plan';
    document.querySelector('#planModal .subtitle').textContent = 'Update the details for this membership plan.';
    document.getElementById('btnSavePlan').textContent         = 'Save Changes';

    document.getElementById('planModalOverlay').classList.add('active');
    if (window.feather) feather.replace();
}

// ── Delete ─────────────────────────────────────────────────────────────────
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

// ── Save (Create / Update) ─────────────────────────────────────────────────
export async function handleSavePlan() {
    const plan_name      = document.getElementById('planNameInput').value.trim();
    const price          = document.getElementById('planPriceInput').value;
    const duration       = document.getElementById('planDurationInput').value;
    const discount_type  = document.getElementById('planDiscountType').value;
    const discount_value = document.getElementById('planDiscountValue').value;

    if (!plan_name || !price || !discount_value) {
        showToast('Please fill all required fields (Name, Price, Discount Value).');
        return;
    }

    // Read Applicable To boolean values
    const all_services    = document.getElementById('appToServices')?.checked    || false;
    const all_products    = document.getElementById('appToProducts')?.checked    || false;
    const all_memberships = document.getElementById('appToMemberships')?.checked || false;

    const isEditing      = getIsEditing();
    const currentEditId  = getCurrentEditId();
    const currentPlans   = getCurrentPlans();

    // Name uniqueness check (create only — name is locked in edit mode)
    if (!isEditing) {
        const exists = currentPlans.find(p =>
            (p.plan_name || '').toLowerCase() === plan_name.toLowerCase() &&
            p.status !== 'deleted'
        );
        if (exists) {
            showToast('A membership plan with this name already exists.');
            return;
        }
    }

    const btn      = document.getElementById('btnSavePlan');
    const origText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled    = true;

    try {
        const planData = {
            company_id:     getCompanyId(),
            branch_id:      getBranchId(),
            price:          parseFloat(price),
            duration:       parseInt(duration, 10),
            discount_type,
            discount_value: parseFloat(discount_value),
            all_services,
            all_products,
            all_memberships,
            status:         'active',
            updated_at:     new Date().toISOString()
        };

        if (isEditing) {
            // Simple UPDATE — one row, fully atomic, no delete+reinsert
            const { error } = await updateSinglePlanApi(currentEditId, planData);
            if (error) throw error;
        } else {
            // INSERT — one clean row per plan
            const { error } = await insertSinglePlanApi({
                ...planData,
                plan_name,
                membership_id: crypto.randomUUID()
            });
            if (error) throw error;
        }

        showToast(isEditing ? 'Plan updated successfully.' : 'Plan created successfully.');
        if (window.notifyEvent) {
            window.notifyEvent('marketing', 'evt_marketing_membership', {
                title:   isEditing ? 'Membership Plan Updated' : 'New Membership Plan Created',
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
        btn.disabled    = false;
    }
}

// ── Wire Listeners ─────────────────────────────────────────────────────────
export function initPlanListeners() {
    const overlay = document.getElementById('planModalOverlay');

    // "Create Plan" button
    document.getElementById('btnCreatePlan')?.addEventListener('click', () => {
        const activeTab = document.querySelector('.nav-tab.active')?.getAttribute('data-tab');
        if (activeTab === 'plans') openCreateModal();
    });

    document.getElementById('closePlanModal')?.addEventListener('click', closePlanModal);
    document.getElementById('btnCancelPlan')?.addEventListener('click', closePlanModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) closePlanModal(); });

    // Applicable To — visual highlight on check/uncheck
    ['Services', 'Products', 'Memberships'].forEach(type => {
        document.getElementById(`appTo${type}`)?.addEventListener('change', updateApplicableToVisuals);
    });

    // Save button
    document.getElementById('btnSavePlan')?.addEventListener('click', handleSavePlan);

    // Delete confirm modal
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
