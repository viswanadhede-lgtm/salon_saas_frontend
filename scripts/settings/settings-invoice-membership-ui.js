// scripts/settings/settings-invoice-membership-ui.js - Membership invoice settings UI bindings

        import { 
            getInvoiceConfig, 
            saveInvoiceConfig, 
            renderLiveInvoicePreview,
            loadInvoiceSettingsFromDB,
            saveInvoiceSettingsToDB,
            loadBusinessPreviewData
        } from '../invoice-state.js';

        let config = getInvoiceConfig();

        function syncUIFromConfig() {
            setChecked('mbrPlan', config.membership.showPlan);
            setChecked('mbrDuration', config.membership.showDuration);
            setChecked('mbrStartDate', config.membership.showStartDate);
            setChecked('mbrExpiryDate', config.membership.showExpiryDate);
            setChecked('mbrRefNum', config.membership.showMembershipRef);
            renderPreview();
        }

        function syncConfigFromUI() {
            config.membership.showPlan = isChecked('mbrPlan');
            config.membership.showDuration = isChecked('mbrDuration');
            config.membership.showStartDate = isChecked('mbrStartDate');
            config.membership.showExpiryDate = isChecked('mbrExpiryDate');
            config.membership.showMembershipRef = isChecked('mbrRefNum');
            renderPreview();
            markDirty();
        }

        function renderPreview() {
            renderLiveInvoicePreview('membership', 'membershipInvoicePreview', config);
        }

        window.saveMembershipConfig = async function() {
            const btn = document.getElementById('btnSave');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
            }

            try {
                await saveInvoiceSettingsToDB('membership', config);
                showToast('? Membership invoice settings saved!', 'success');
                document.getElementById('savebar')?.classList.remove('visible');
            } catch (err) {
                console.error('Error saving membership invoice settings:', err);
                showToast(err.message || 'Failed to save. Please try again.', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Membership Invoice';
                    if (typeof feather !== 'undefined') feather.replace();
                }
            }
        };

        window.cancelMembershipConfig = async function() {
            config = await loadInvoiceSettingsFromDB('membership');
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


// Expose window APIs for inline HTML handlers
window.saveMembershipConfig = saveMembershipConfig;
window.cancelMembershipConfig = cancelMembershipConfig;

export async function initInvoiceMembership() {
            if (typeof feather !== 'undefined') feather.replace();
            
            await loadBusinessPreviewData();
            config = await loadInvoiceSettingsFromDB('membership');
            syncUIFromConfig();

            document.querySelectorAll('input[type=checkbox]').forEach(el => {
                el.addEventListener('change', syncConfigFromUI);
            });
}

// Safe initialization guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvoiceMembership);
} else {
    initInvoiceMembership();
}