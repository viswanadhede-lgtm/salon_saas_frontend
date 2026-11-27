/**
 * Controller script for settings-branch.html
 * - Enforces branch selection via ?branch_id= (redirects to branch-selector.html if absent)
 * - Coordinates all 5 branch settings tabs (branches, hours, invoice, payments, notifications)
 * - Implements Tab 1: Edit & Delete for the selected branch
 * - Scopes Invoice card links & header branch switching to the selected branch
 */

import { supabase } from '../lib/supabase.js';
import { populateGlobalHeader } from './global-auth-guard.js';
import { hasSubFeature } from './sub-features/sub-feature-manager.js';
import { refreshUsageCounter } from '../config/plan-limits-manager.js';

const initUrlParams = new URLSearchParams(window.location.search);
let currentBranchId = initUrlParams.get('branch_id');

// Enforce intermediate branch selector step when landing without ?branch_id=
if (!currentBranchId) {
    const redirectParams = new URLSearchParams();
    const reqTab = initUrlParams.get('tab');
    if (reqTab) redirectParams.set('tab', reqTab);
    const qs = redirectParams.toString();
    window.location.replace(qs ? `branch-selector.html?${qs}` : 'branch-selector.html');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!currentBranchId) return;

    const VALID_TABS = ['branches', 'hours', 'invoice', 'payments', 'notifications'];
    const SAVEABLE_TABS = ['branches', 'hours', 'payments', 'notifications'];

    const tabListEl = document.querySelector('.settings-tabs-nav[role="tablist"]');
    const tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn'));
    const tabPanes = Array.from(document.querySelectorAll('.settings-tab-pane'));
    const savebar = document.getElementById('savebar');
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');

    const deleteDialog = document.getElementById('deleteBranchDialog');
    const btnDeleteBranch = document.getElementById('btnDeleteBranch');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBranchBtn');

    let activeTab = 'branches';
    let loadedBranch = null;
    let companyUsers = [];
    window.isDirty = false;

    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch (_) {}
        return localStorage.getItem('company_id') || null;
    }

    async function waitForCompanyId(maxWaitMs = 4000) {
        const deadline = Date.now() + maxWaitMs;
        let id = getCompanyId();
        while (!id && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 100));
            id = getCompanyId();
        }
        return id;
    }

    const companyId = await waitForCompanyId();

    function showToast(msg, type = 'success') {
        let toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = type === 'error' ? '#dc2626' : '#1e293b';
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3500);
    }
    window.showToast = showToast;

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
    }

    // ── Global Dirty State Helpers ──────────────────────────────────────────
    window.markDirty = function () {
        window.isDirty = true;
        if (SAVEABLE_TABS.includes(activeTab)) {
            savebar?.classList.add('visible');
        }
    };

    window.clearDirty = function () {
        window.isDirty = false;
        savebar?.classList.remove('visible');
    };

    function syncHeaderBranchSelect(branchId) {
        const select = document.getElementById('branchSelect');
        if (!select || !branchId) return;
        const hasOption = Array.from(select.options).some(opt => opt.value === branchId);
        if (hasOption && select.value !== branchId) {
            select.value = branchId;
        }
    }

    // ── Company Users (for Branch Manager dropdown) ─────────────────────────
    async function loadCompanyUsers() {
        if (!companyId) return;
        try {
            const { data, error } = await supabase.schema('shared')
                .from('users')
                .select('user_id, name, role_name')
                .eq('company_id', companyId)
                .neq('status', 'deleted');

            if (!error && data) {
                companyUsers = data;
                populateManagerDropdown(loadedBranch?.manager_id || '');
            }
        } catch (err) {
            console.warn('[settings-branch] Error loading company users:', err);
        }
    }

    function populateManagerDropdown(selectedManagerId = '') {
        const select = document.getElementById('branchManager');
        if (!select) return;
        select.innerHTML = '<option value="">Unassigned / None</option>';
        companyUsers.forEach(u => {
            const uid = u.user_id || u.id;
            const opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = u.name || 'User';
            if (selectedManagerId && String(selectedManagerId) === String(uid)) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }

    // ── Apply Read-Only State if User Lacks branch_update ───────────────────
    function applyBranchEditPermission() {
        const pane = document.getElementById('pane-branches');
        if (!pane) return;
        const canUpdate = hasSubFeature('branch_update');
        const notice = document.getElementById('branchReadOnlyNotice');

        notice?.classList.toggle('visible', !canUpdate);
        pane.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.id === 'branchCountry') return;
            el.disabled = !canUpdate;
        });
    }

    // ── Load & Render Selected Branch into Tab 1 Form ───────────────────────
    function populateBranchForm(branch) {
        if (!branch) return;
        setVal('branchName', branch.branch_name || '');
        setVal('branchCode', branch.branch_code || '');
        setVal('branchPhone', branch.branch_phone || '');
        setVal('branchEmail', branch.branch_email || '');
        setVal('branchAddressLine1', branch.address_line_1 || '');
        setVal('branchAddressLine2', branch.address_line_2 || '');
        setVal('branchLocality', branch.locality_area || '');
        setVal('branchLandmark', branch.landmark || '');
        setVal('branchCity', branch.city || '');
        setVal('branchDistrict', branch.district || '');
        setVal('branchState', branch.state || '');
        setVal('branchPincode', branch.pin_code || '');
        setVal('branchCountry', branch.country || 'India');
        setVal('branchMapLink', branch.google_maps_url || '');
        setVal('branchLatitude', branch.latitude != null ? branch.latitude : '');
        setVal('branchLongitude', branch.longitude != null ? branch.longitude : '');

        populateManagerDropdown(branch.manager_id || '');

        const statusToggle = document.getElementById('branchStatusToggle');
        if (statusToggle) {
            statusToggle.checked = branch.status === 'active';
        }

        const breadcrumbEl = document.getElementById('breadcrumbBranchName');
        if (breadcrumbEl) {
            breadcrumbEl.textContent = branch.branch_name || 'Branch Settings';
        }
        document.title = `${branch.branch_name || 'Branch'} Settings - BharathBots`;

        const deleteDesc = document.getElementById('deleteDialogDesc');
        if (deleteDesc) {
            deleteDesc.textContent = `Are you sure you want to delete "${branch.branch_name || 'this branch'}"? This action cannot be undone.`;
        }
    }

    async function loadBranchDetails(branchId) {
        if (!companyId || !branchId) return;
        try {
            const { data, error } = await supabase.schema('shared')
                .from('branches')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                showToast('Branch not found or was deleted.', 'error');
                setTimeout(() => {
                    window.location.replace('branch-selector.html');
                }, 1200);
                return;
            }

            loadedBranch = data;
            populateBranchForm(data);
            syncHeaderBranchSelect(branchId);
            applyBranchEditPermission();

            if (activeTab === 'branches') {
                window.clearDirty();
            }
        } catch (err) {
            console.error('[settings-branch] Error loading branch details:', err);
            showToast('Failed to load branch details.', 'error');
        }
    }
    window.loadBranchDetails = loadBranchDetails;

    async function syncActiveBranchesToContext() {
        try {
            const { data: branches, error } = await supabase.schema('shared')
                .from('branches')
                .select('branch_id, branch_name')
                .eq('company_id', companyId)
                .eq('status', 'active')
                .order('created_at', { ascending: true });

            if (error) return;

            const activeBranches = (branches || []).map(b => ({
                id: b.branch_id,
                branch_id: b.branch_id,
                branch_name: b.branch_name
            }));

            const contextStr = localStorage.getItem('appContext');
            if (!contextStr) return;
            const context = JSON.parse(contextStr);
            context.branches = activeBranches;

            const currentActiveId = localStorage.getItem('active_branch_id');
            const isStillActive = activeBranches.some(b => String(b.branch_id) === String(currentActiveId));
            if (!isStillActive && activeBranches.length > 0) {
                localStorage.setItem('active_branch_id', activeBranches[0].branch_id);
                localStorage.setItem('branch_id', activeBranches[0].branch_id);
                context.current_branch_id = activeBranches[0].branch_id;
            }

            localStorage.setItem('appContext', JSON.stringify(context));
            if (typeof populateGlobalHeader === 'function') {
                populateGlobalHeader();
            }
            syncHeaderBranchSelect(currentBranchId);
        } catch (err) {
            console.warn('[settings-branch] Failed to sync global context:', err);
        }
    }

    // ── Save & Cancel Handlers for Tab 1 (Branch Details) ───────────────────
    async function saveBranchDetails() {
        if (!hasSubFeature('branch_update')) {
            showToast('Your role does not have permission to update branch details.', 'error');
            return;
        }
        if (!companyId || !currentBranchId) {
            showToast('Missing company or branch context.', 'error');
            return;
        }

        const name = getVal('branchName');
        const code = getVal('branchCode');
        const managerId = getVal('branchManager');
        const phone = getVal('branchPhone');
        const email = getVal('branchEmail');
        const addressLine1 = getVal('branchAddressLine1');
        const addressLine2 = getVal('branchAddressLine2');
        const localityArea = getVal('branchLocality');
        const landmark = getVal('branchLandmark');
        const city = getVal('branchCity');
        const district = getVal('branchDistrict');
        const state = getVal('branchState');
        const pinCode = getVal('branchPincode');
        const country = getVal('branchCountry') || 'India';
        const mapsUrl = getVal('branchMapLink');
        const latStr = getVal('branchLatitude');
        const lngStr = getVal('branchLongitude');
        const isActive = document.getElementById('branchStatusToggle')?.checked ?? true;
        const newStatus = isActive ? 'active' : 'inactive';

        if (!name) {
            showToast('Branch name is required', 'error');
            document.getElementById('branchName')?.focus();
            return;
        }
        if (!phone) {
            showToast('Phone number is required', 'error');
            document.getElementById('branchPhone')?.focus();
            return;
        }
        if (!addressLine1) {
            showToast('Address Line 1 is required', 'error');
            document.getElementById('branchAddressLine1')?.focus();
            return;
        }
        if (!city) {
            showToast('City is required', 'error');
            document.getElementById('branchCity')?.focus();
            return;
        }
        if (!state) {
            showToast('State is required', 'error');
            document.getElementById('branchState')?.focus();
            return;
        }
        if (!pinCode) {
            showToast('PIN Code is required', 'error');
            document.getElementById('branchPincode')?.focus();
            return;
        }

        const origHtml = saveBtn ? saveBtn.innerHTML : 'Save Changes';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-feather="loader" style="width:15px;height:15px;" aria-hidden="true"></i> Saving...';
            if (typeof feather !== 'undefined') feather.replace();
        }

        try {
            const addressParts = [
                addressLine1,
                addressLine2,
                localityArea,
                landmark ? `Near ${landmark}` : '',
                city,
                district && district !== city ? district : '',
                state,
                pinCode,
                country !== 'India' ? country : ''
            ].filter(Boolean);
            const branchAddress = addressParts.join(', ');

            const latNum = latStr !== '' && !isNaN(Number(latStr)) ? Number(latStr) : null;
            const lngNum = lngStr !== '' && !isNaN(Number(lngStr)) ? Number(lngStr) : null;

            const { data: rpcRes, error } = await supabase.rpc('update_branch_atomic', {
                p_company_id:      companyId,
                p_branch_id:       currentBranchId,
                p_branch_name:     name,
                p_branch_phone:    phone,
                p_branch_email:    email || null,
                p_branch_code:     code || null,
                p_manager_user_id: managerId || null,
                p_address_line_1:  addressLine1,
                p_address_line_2:  addressLine2 || null,
                p_locality_area:   localityArea || null,
                p_landmark:        landmark || null,
                p_city:            city,
                p_district:        district || null,
                p_state:           state,
                p_pin_code:        pinCode,
                p_country:         country || 'India',
                p_branch_address:  branchAddress,
                p_google_maps_url: mapsUrl || null,
                p_latitude:        latNum,
                p_longitude:       lngNum,
                p_status:          newStatus
            });

            if (error) throw error;
            if (rpcRes && rpcRes.success === false) {
                throw new Error(rpcRes.message || 'Failed to update branch');
            }

            await loadBranchDetails(currentBranchId);
            await syncActiveBranchesToContext();
            window.clearDirty();
            showToast('Branch details updated successfully!', 'success');
        } catch (err) {
            console.error('[settings-branch] Error saving branch details:', err);
            showToast(err.message || 'Failed to update branch details.', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origHtml;
                if (typeof feather !== 'undefined') feather.replace();
            }
        }
    }

    function cancelBranchDetails() {
        if (loadedBranch) {
            populateBranchForm(loadedBranch);
        }
        window.clearDirty();
    }

    window.saveBranchDetails = saveBranchDetails;
    window.cancelBranchDetails = cancelBranchDetails;

    // ── Delete Branch Dialog ────────────────────────────────────────────────
    if (deleteDialog && !('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (e) => {
            const rect = deleteDialog.getBoundingClientRect();
            return (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            );
        };
        let pressedOutside = false;
        deleteDialog.addEventListener('pointerdown', (e) => {
            pressedOutside = isOutside(e);
        });
        deleteDialog.addEventListener('pointerup', (e) => {
            if (pressedOutside && isOutside(e)) {
                deleteDialog.close();
            }
            pressedOutside = false;
        });
    }

    btnDeleteBranch?.addEventListener('click', () => {
        if (!hasSubFeature('branch_delete')) {
            showToast('Your role does not have permission to delete branches.', 'error');
            return;
        }
        deleteDialog?.showModal();
    });

    confirmDeleteBtn?.addEventListener('click', async () => {
        if (!companyId || !currentBranchId) return;
        const origText = confirmDeleteBtn.textContent;
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = 'Deleting...';

        try {
            const { data: rpcRes, error } = await supabase.rpc('delete_branch_atomic', {
                p_company_id: companyId,
                p_branch_id:  currentBranchId
            });

            if (error) throw error;
            if (rpcRes && rpcRes.success === false) {
                throw new Error(rpcRes.message || 'Failed to delete branch');
            }

            if (deleteDialog?.open) deleteDialog.close();
            refreshUsageCounter('max_branches');
            await syncActiveBranchesToContext();
            window.clearDirty();
            showToast('Branch deleted successfully.', 'success');

            setTimeout(() => {
                window.location.replace('branch-selector.html');
            }, 600);
        } catch (err) {
            console.error('[settings-branch] Error deleting branch:', err);
            if (deleteDialog?.open) deleteDialog.close();
            showToast(err.message || 'Failed to delete branch.', 'error');
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = origText;
        }
    });

    // ── Tab Switching & Keyboard Navigation ─────────────────────────────────
    function setActiveTab(tabId, pushState = true) {
        if (!VALID_TABS.includes(tabId)) {
            tabId = 'branches';
        }

        if (window.isDirty && activeTab !== tabId) {
            const confirmLeave = confirm('You have unsaved changes on the current tab. Discard changes and switch?');
            if (!confirmLeave) return;
            if (activeTab === 'branches') cancelBranchDetails();
            else if (activeTab === 'hours' && typeof window.cancelHours === 'function') window.cancelHours();
            else if (activeTab === 'payments' && typeof window.cancelPaymentSettings === 'function') window.cancelPaymentSettings();
            else if (activeTab === 'notifications' && typeof window.cancelNotificationSettings === 'function') window.cancelNotificationSettings();
            window.clearDirty();
        }

        activeTab = tabId;

        tabButtons.forEach(btn => {
            const isSelected = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isSelected);
            btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            btn.tabIndex = isSelected ? 0 : -1;
            if (isSelected && pushState) {
                btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        });

        tabPanes.forEach(pane => {
            const isSelected = pane.id === `pane-${tabId}`;
            pane.classList.toggle('active', isSelected);
            pane.hidden = !isSelected;
        });

        if (!window.isDirty) {
            savebar?.classList.remove('visible');
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        if (tabId === 'branches') {
            applyBranchEditPermission();
        } else if (tabId === 'hours' && typeof window.loadHoursData === 'function') {
            window.loadHoursData(currentBranchId);
        } else if (tabId === 'payments' && typeof window.loadPaymentSettings === 'function') {
            window.loadPaymentSettings(currentBranchId);
        } else if (tabId === 'notifications' && typeof window.loadNotificationSettings === 'function') {
            window.loadNotificationSettings(currentBranchId);
        }

        if (pushState) {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tabId);
            window.history.replaceState({ tab: tabId, branch_id: currentBranchId }, '', url.toString());
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = btn.dataset.tab;
            if (targetTab && targetTab !== activeTab) {
                setActiveTab(targetTab);
            }
        });
    });

    // Arrow-key roving focus across tabs (selection-by-activation model)
    tabListEl?.addEventListener('keydown', (e) => {
        const currentIndex = tabButtons.indexOf(document.activeElement);
        if (currentIndex === -1) return;

        let nextIndex = -1;
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tabButtons.length - 1;

        if (nextIndex !== -1) {
            e.preventDefault();
            tabButtons.forEach((btn, i) => {
                btn.tabIndex = i === nextIndex ? 0 : -1;
            });
            tabButtons[nextIndex].focus();
        }
    });

    // ── Unified Save & Cancel Buttons ───────────────────────────────────────
    saveBtn?.addEventListener('click', async () => {
        if (activeTab === 'branches') {
            await saveBranchDetails();
        } else if (activeTab === 'hours' && typeof window.saveHours === 'function') {
            await window.saveHours();
        } else if (activeTab === 'payments' && typeof window.savePaymentSettings === 'function') {
            await window.savePaymentSettings();
        } else if (activeTab === 'notifications' && typeof window.saveNotificationSettings === 'function') {
            await window.saveNotificationSettings();
        }
    });

    cancelBtn?.addEventListener('click', () => {
        if (activeTab === 'branches') {
            cancelBranchDetails();
        } else if (activeTab === 'hours' && typeof window.cancelHours === 'function') {
            window.cancelHours();
        } else if (activeTab === 'payments' && typeof window.cancelPaymentSettings === 'function') {
            window.cancelPaymentSettings();
        } else if (activeTab === 'notifications' && typeof window.cancelNotificationSettings === 'function') {
            window.cancelNotificationSettings();
        }
        window.clearDirty();
    });

    // ── Attach Dirty Listeners ──────────────────────────────────────────────
    const branchesPane = document.getElementById('pane-branches');
    branchesPane?.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.id === 'branchCountry') return;
        el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
            window.markDirty();
        });
    });

    const paymentsPane = document.getElementById('pane-payments');
    paymentsPane?.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.id === 'qrFileInput') return;
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            window.markDirty();
        });
    });

    // ── Handle Global Header Branch Switcher ────────────────────────────────
    async function switchToBranch(newBranchId) {
        if (!newBranchId || newBranchId === 'all' || newBranchId === currentBranchId) return;
        if (window.isDirty) {
            const confirmSwitch = confirm('You have unsaved changes. Discard changes and switch branch?');
            if (!confirmSwitch) {
                syncHeaderBranchSelect(currentBranchId);
                return;
            }
            window.clearDirty();
        }

        currentBranchId = newBranchId;
        const url = new URL(window.location.href);
        url.searchParams.set('branch_id', newBranchId);
        window.history.replaceState({ tab: activeTab, branch_id: newBranchId }, '', url.toString());

        await loadBranchDetails(newBranchId);
        if (activeTab === 'hours' && typeof window.loadHoursData === 'function') {
            await window.loadHoursData(newBranchId);
        } else if (activeTab === 'payments' && typeof window.loadPaymentSettings === 'function') {
            await window.loadPaymentSettings(newBranchId);
        } else if (activeTab === 'notifications' && typeof window.loadNotificationSettings === 'function') {
            await window.loadNotificationSettings(newBranchId);
        }
    }

    window.addEventListener('branch:changed', (e) => {
        const newId = e.detail?.branchId;
        if (newId) switchToBranch(newId);
    });

    document.addEventListener('app-shell:ready', () => {
        syncHeaderBranchSelect(currentBranchId);
    });

    // ── Initialize Data & Active Tab ────────────────────────────────────────
    await Promise.all([loadCompanyUsers(), loadBranchDetails(currentBranchId)]);

    const initialTab = initUrlParams.get('tab');
    setActiveTab(initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'branches', false);

    window.addEventListener('beforeunload', (e) => {
        if (window.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
