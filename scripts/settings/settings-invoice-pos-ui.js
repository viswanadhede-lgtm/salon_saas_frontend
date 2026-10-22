// scripts/settings/settings-invoice-pos-ui.js - POS invoice settings UI bindings

import { 
    getInvoiceConfig, 
    saveInvoiceConfig, 
    renderLiveInvoicePreview,
    loadInvoiceSettingsFromDB,
    saveInvoiceSettingsToDB,
    loadBusinessPreviewData
} from '../invoice-state.js';

let config = getInvoiceConfig();
let currentBranchId = null;

function syncUIFromConfig() {
    setChecked('posSku', config.pos.showSku);
    setChecked('posCashier', config.pos.showCashierStaff);
    setChecked('posTxnNum', config.pos.showPosTransactionNo);
    setChecked('posPayRef', config.pos.showPaymentRef);
    renderPreview();
}

function syncConfigFromUI() {
    config.pos.showSku = isChecked('posSku');
    config.pos.showCashierStaff = isChecked('posCashier');
    config.pos.showPosTransactionNo = isChecked('posTxnNum');
    config.pos.showPaymentRef = isChecked('posPayRef');
    renderPreview();
    markDirty();
}

function renderPreview() {
    renderLiveInvoicePreview('pos', 'posInvoicePreview', config);
}

async function reloadForBranch(branchId) {
    currentBranchId = branchId;
    await loadBusinessPreviewData();
    config = await loadInvoiceSettingsFromDB('pos', branchId);
    syncUIFromConfig();
    document.getElementById('savebar')?.classList.remove('visible');
}

window.savePosConfig = async function() {
    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
    }

    try {
        await saveInvoiceSettingsToDB('pos', config, currentBranchId);
        showToast('✓ POS invoice settings saved!', 'success');
        document.getElementById('savebar')?.classList.remove('visible');
    } catch (err) {
        console.error('Error saving POS invoice settings:', err);
        showToast(err.message || 'Failed to save. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save POS Invoice';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

window.cancelPosConfig = async function() {
    config = await loadInvoiceSettingsFromDB('pos', currentBranchId);
    syncUIFromConfig();
    document.getElementById('savebar')?.classList.remove('visible');
};

function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }
function isChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }

function markDirty() {
    document.getElementById('savebar')?.classList.add('visible');
    if (typeof feather !== 'undefined') feather.replace();
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'error' ? '#ef4444' : '#22c55e';
    t.classList.add('visible');
    setTimeout(() => { t.classList.remove('visible'); t.style.background = ''; }, 3500);
}

function initBranchSwitcher() {
    const select = document.getElementById('branchSelect');
    if (select) {
        select.addEventListener('change', async (e) => {
            const bId = e.target.value;
            if (bId && bId !== 'all' && bId !== currentBranchId) {
                localStorage.setItem('active_branch_id', bId);
                await reloadForBranch(bId);
            }
        });
    }

    window.addEventListener('storage', async (e) => {
        if (e.key === 'active_branch_id' && e.newValue && e.newValue !== currentBranchId) {
            await reloadForBranch(e.newValue);
        }
    });
}

// Expose window APIs for inline HTML handlers
window.savePosConfig = savePosConfig;
window.cancelPosConfig = cancelPosConfig;

export async function initInvoicePos() {
    if (typeof feather !== 'undefined') feather.replace();
    
    await loadBusinessPreviewData();
    config = await loadInvoiceSettingsFromDB('pos');
    syncUIFromConfig();

    document.querySelectorAll('input[type=checkbox]').forEach(el => {
        el.addEventListener('change', syncConfigFromUI);
    });

    initBranchSwitcher();

    // Guard against navigating away with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        const savebar = document.getElementById('savebar');
        if (savebar && savebar.classList.contains('visible')) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// Safe initialization guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvoicePos);
} else {
    initInvoicePos();
}