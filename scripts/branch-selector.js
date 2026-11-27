import { supabase } from '../lib/supabase.js';
import { populateGlobalHeader } from './global-auth-guard.js';
import { checkResourceLimit, showPlanLimitModal, refreshUsageCounter } from '../config/plan-limits-manager.js';

document.addEventListener('DOMContentLoaded', async () => {
    const VALID_TARGET_TABS = ['branches', 'hours', 'invoice', 'payments', 'notifications'];
    const TAB_LABELS = {
        hours: 'Opening Hours',
        invoice: 'Invoice Settings',
        payments: 'Payments Settings',
        notifications: 'Notification Settings'
    };

    const urlParams = new URLSearchParams(window.location.search);
    const requestedTab = urlParams.get('tab');
    const targetTab = VALID_TARGET_TABS.includes(requestedTab) ? requestedTab : null;

    const subtitleEl = document.getElementById('branchSelectorSubtitle');
    if (subtitleEl && targetTab && TAB_LABELS[targetTab]) {
        subtitleEl.textContent = `Click on the branch you want to update (${TAB_LABELS[targetTab]}).`;
    }

    const listEl = document.getElementById('branchSelectorList');
    const dialog = document.getElementById('branchDialog');
    const form = document.getElementById('branchCreateForm');
    const btnAdd = document.getElementById('btnAddBranch');
    const btnClose = document.getElementById('btnClosePanel');
    const btnCancel = document.getElementById('btnCancelBranch');
    const btnSave = document.getElementById('btnSaveBranch');

    let branchesData = [];
    let companyUsers = [];

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

    if (!companyId) {
        console.warn('[branch-selector] No company_id found.');
        renderEmptyState('Please sign in to view your branches.');
        showToast('Please sign in to view branches', 'error');
        return;
    }

    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = type === 'error' ? '#dc2626' : '#1e293b';
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3500);
    }

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function buildBranchSettingsUrl(branchId) {
        const params = new URLSearchParams();
        params.set('branch_id', branchId);
        if (targetTab && targetTab !== 'branches') {
            params.set('tab', targetTab);
        }
        return `settings-branch.html?${params.toString()}`;
    }

    function renderEmptyState(message) {
        if (!listEl) return;
        listEl.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'branch-empty-state';
        li.textContent = message;
        listEl.appendChild(li);
    }

    function renderBranches() {
        if (!listEl) return;
        listEl.innerHTML = '';

        if (branchesData.length === 0) {
            renderEmptyState("No branches found. Click 'Add Branch' to create your first location.");
            return;
        }

        const fragment = document.createDocumentFragment();
        branchesData.forEach((branch, idx) => {
            const li = document.createElement('li');
            li.className = 'branch-list-item';

            const link = document.createElement('a');
            link.href = buildBranchSettingsUrl(branch.branch_id);
            link.className = 'branch-row-link';

            const mainSpan = document.createElement('span');
            mainSpan.className = 'branch-row-main';

            // Number badge
            const numBadge = document.createElement('span');
            numBadge.className = 'branch-num-badge';
            numBadge.textContent = `#${idx + 1}`;
            numBadge.setAttribute('aria-hidden', 'true');

            // Name + address stacked
            const textGroup = document.createElement('span');
            textGroup.className = 'branch-text-group';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'branch-row-name';
            nameSpan.textContent = branch.branch_name || 'Unnamed Branch';
            textGroup.appendChild(nameSpan);

            // Grey address line: address_line_1 · locality_area · city
            const addressParts = [branch.address_line_1, branch.locality_area, branch.city].filter(Boolean);
            const addressText = addressParts.join(' · ');
            if (addressText) {
                const addrSpan = document.createElement('span');
                addrSpan.className = 'branch-row-address';
                addrSpan.textContent = addressText;
                textGroup.appendChild(addrSpan);
            }

            mainSpan.appendChild(numBadge);
            mainSpan.appendChild(textGroup);

            if (branch.status && branch.status !== 'active') {
                const badge = document.createElement('span');
                badge.className = 'branch-status-badge';
                const dot = document.createElement('span');
                dot.className = 'status-dot';
                dot.setAttribute('aria-hidden', 'true');
                badge.appendChild(dot);
                badge.appendChild(document.createTextNode('Inactive'));
                mainSpan.appendChild(badge);
            }

            const chevronIcon = document.createElement('i');
            chevronIcon.setAttribute('data-feather', 'chevron-right');
            chevronIcon.className = 'branch-row-chevron';
            chevronIcon.setAttribute('aria-hidden', 'true');

            link.appendChild(mainSpan);
            link.appendChild(chevronIcon);
            li.appendChild(link);
            fragment.appendChild(li);
        });

        listEl.appendChild(fragment);
        if (typeof feather !== 'undefined') feather.replace();
    }

    function updateGlobalContext() {
        try {
            const contextStr = localStorage.getItem('appContext');
            if (!contextStr) return;
            const context = JSON.parse(contextStr);

            const activeBranches = branchesData.filter(b => b.status === 'active');
            context.branches = activeBranches.map(b => ({
                id: b.branch_id,
                branch_id: b.branch_id,
                branch_name: b.branch_name
            }));

            const currentActiveId = localStorage.getItem('active_branch_id');
            const isStillActive = activeBranches.some(b => String(b.branch_id) === String(currentActiveId));
            if (!isStillActive && activeBranches.length > 0) {
                const fallbackId = activeBranches[0].branch_id;
                localStorage.setItem('active_branch_id', fallbackId);
                context.current_branch_id = fallbackId;
            }

            localStorage.setItem('appContext', JSON.stringify(context));
            if (typeof populateGlobalHeader === 'function') {
                populateGlobalHeader();
            }
        } catch (err) {
            console.error('[branch-selector] Failed to sync global context:', err);
        }
    }

    async function loadCompanyUsers() {
        try {
            const { data, error } = await supabase.schema('shared')
                .from('users')
                .select('user_id, name, role_name')
                .eq('company_id', companyId)
                .neq('status', 'deleted');

            if (!error && data) {
                companyUsers = data;
                populateManagerDropdown();
            }
        } catch (err) {
            console.warn('[branch-selector] Error loading company users:', err);
        }
    }

    function populateManagerDropdown() {
        const select = document.getElementById('branchManager');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select --</option>';
        companyUsers.forEach(u => {
            const uid = u.user_id || u.id;
            const opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = u.name || 'User';
            select.appendChild(opt);
        });
    }

    async function loadBranches() {
        try {
            const { data, error } = await supabase.schema('shared')
                .from('branches')
                .select('branch_id, branch_name, status, created_at, address_line_1, locality_area, city')
                .eq('company_id', companyId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: true });

            if (error) throw error;
            branchesData = data || [];
            renderBranches();
            updateGlobalContext();
        } catch (err) {
            console.error('[branch-selector] Error loading branches:', err);
            renderEmptyState('Unable to load branches. Please refresh and try again.');
            showToast('Failed to load branches.', 'error');
        }
    }

    // ── Light-dismiss fallback when closedby="any" is unsupported (e.g. Safari) ──
    if (dialog && !('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (e) => {
            const rect = dialog.getBoundingClientRect();
            return (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            );
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
            pressedOutside = isOutside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
            if (pressedOutside && isOutside(e)) {
                dialog.close();
            }
            pressedOutside = false;
        });
    }

    function openAddBranchModal() {
        if (!dialog || !form) return;
        form.reset();
        const countryInput = document.getElementById('branchCountry');
        if (countryInput) countryInput.value = 'India';
        const statusToggle = document.getElementById('branchStatusToggle');
        if (statusToggle) statusToggle.checked = true;
        populateManagerDropdown();

        dialog.showModal();
        if (typeof feather !== 'undefined') feather.replace();
    }

    function closeAddBranchModal() {
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    btnAdd?.addEventListener('click', async () => {
        const limitCheck = await checkResourceLimit('max_branches');
        if (!limitCheck.allowed) {
            showPlanLimitModal(limitCheck);
            return;
        }
        openAddBranchModal();
    });

    btnClose?.addEventListener('click', closeAddBranchModal);
    btnCancel?.addEventListener('click', closeAddBranchModal);

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

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

        const limitCheck = await checkResourceLimit('max_branches');
        if (!limitCheck.allowed) {
            showPlanLimitModal(limitCheck);
            return;
        }

        const origText = btnSave ? btnSave.textContent : 'Save Branch';
        if (btnSave) {
            btnSave.textContent = 'Saving...';
            btnSave.disabled = true;
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

            const { data: rpcRes, error } = await supabase.rpc('create_branch_atomic', {
                p_company_id:      companyId,
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
                p_status:          isActive ? 'active' : 'inactive'
            });

            if (error) throw error;
            if (rpcRes && rpcRes.success === false) {
                throw new Error(rpcRes.message || 'Failed to create branch');
            }

            showToast('Branch added successfully!', 'success');
            refreshUsageCounter('max_branches');
            closeAddBranchModal();
            await loadBranches();
        } catch (err) {
            console.error('[branch-selector] Create branch error:', err);
            showToast(err.message || 'Failed to save branch.', 'error');
        } finally {
            if (btnSave) {
                btnSave.textContent = origText;
                btnSave.disabled = false;
            }
        }
    });

    await Promise.all([loadCompanyUsers(), loadBranches()]);

    if (typeof feather !== 'undefined') feather.replace();
    if (window.applySubFeatureGates) {
        window.applySubFeatureGates();
    }
});
