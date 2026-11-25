// scripts/settings-company.js
// Master controller for the 3-tab Company Settings page: Business, Contact, Tax

import { supabase } from './lib/supabase.js';
import { loadBusinessData, saveBusinessData, cancelBusinessData } from './settings-business.js';
import { loadContactData, saveContactData, cancelContactData } from './settings-contact.js';
import { loadTaxData, saveTaxSettings, cancelTax } from './settings-tax.js';

let activeTab = 'business';
let dirtyTabs = {
    business: false,
    contact: false,
    tax: false
};

// ── Tab Switching ────────────────────────────────────────────────────────────
export function switchTab(tabKey) {
    if (!['business', 'contact', 'tax'].includes(tabKey)) {
        tabKey = 'business';
    }
    activeTab = tabKey;

    // Update Tab Buttons
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
    });

    // Update Tab Panes
    document.querySelectorAll('.settings-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `pane-${tabKey}`);
    });

    // Update URL query parameter without full reload
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('tab') !== tabKey) {
            url.searchParams.set('tab', tabKey);
            window.history.replaceState({}, '', url);
        }
    } catch (e) {}

    // Update Save Bar visibility for the active tab
    updateSaveBarState();

    // Re-sync tax company name display if switching to tax
    if (tabKey === 'tax') {
        const legalName = document.getElementById('companyName')?.value || '';
        const taxLegalInput = document.getElementById('taxCompanyName');
        if (taxLegalInput) taxLegalInput.value = legalName;
    }

    if (typeof feather !== 'undefined') feather.replace();
}

// ── Dirty State & Save Bar ───────────────────────────────────────────────────
export function markActiveTabDirty() {
    dirtyTabs[activeTab] = true;
    updateSaveBarState();
}

function updateSaveBarState() {
    const savebar = document.getElementById('savebar');
    if (!savebar) return;
    if (dirtyTabs[activeTab]) {
        savebar.classList.add('visible');
    } else {
        savebar.classList.remove('visible');
    }
}

// ── Save Handler ─────────────────────────────────────────────────────────────
export async function handleSave() {
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" style="width:14px;height:14px;margin-right:6px;display:inline-block;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></span> Saving...';
    }

    try {
        if (activeTab === 'business') {
            await saveBusinessData();
        } else if (activeTab === 'contact') {
            await saveContactData();
        } else if (activeTab === 'tax') {
            await saveTaxSettings();
        }
        dirtyTabs[activeTab] = false;
        updateSaveBarState();
    } catch (err) {
        console.error('[settings-company] Save error on tab:', activeTab, err);
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
}

// ── Cancel Handler ───────────────────────────────────────────────────────────
export async function handleCancel() {
    dirtyTabs[activeTab] = false;
    updateSaveBarState();

    if (activeTab === 'business') {
        await cancelBusinessData();
    } else if (activeTab === 'contact') {
        await cancelContactData();
    } else if (activeTab === 'tax') {
        await cancelTax();
    }
}

// ── Toast Notification Helper ────────────────────────────────────────────────
export function showToast(msg, type = 'success') {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'error' ? '#dc2626' : '#1e293b';
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3500);
}
window.showToast = showToast;
window.markDirty = markActiveTabDirty;
window.saveCompanySettings = handleSave;
window.cancelCompanySettings = handleCancel;

// ── Initialize on DOMContentLoaded ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup Tab Click Events
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabKey = btn.getAttribute('data-tab');
            switchTab(tabKey);
        });
    });

    // 2. Wire Save & Cancel Buttons
    document.getElementById('btnSave')?.addEventListener('click', handleSave);
    document.getElementById('btnCancel')?.addEventListener('click', handleCancel);

    // 3. Track dirty state on form inputs
    const trackInputs = () => {
        document.querySelectorAll('.form-input, .form-select, .form-textarea, input[type=checkbox]').forEach(el => {
            if (el.id === 'taxCompanyName') return; // read-only
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', markActiveTabDirty);
        });
    };
    trackInputs();

    // 4. Initial Load of all 3 data modules in parallel
    try {
        await Promise.allSettled([
            loadBusinessData(),
            loadContactData(),
            loadTaxData()
        ]);

        // Sync legal name to tax tab after loading
        const legalName = document.getElementById('companyName')?.value || '';
        const taxLegalInput = document.getElementById('taxCompanyName');
        if (taxLegalInput && legalName) taxLegalInput.value = legalName;
    } catch (e) {
        console.warn('[settings-company] Initial load warning:', e);
    }

    // 5. Select active tab from URL param or default to business
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || 'business';
    switchTab(initialTab);

    // Prompt user on unsaved changes
    window.addEventListener('beforeunload', e => {
        if (Object.values(dirtyTabs).some(Boolean)) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    if (typeof feather !== 'undefined') feather.replace();
});
