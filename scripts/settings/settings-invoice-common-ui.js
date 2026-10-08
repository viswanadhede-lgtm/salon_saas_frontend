// scripts/settings/settings-invoice-common-ui.js - Common invoice settings UI bindings

        import { 
            getInvoiceConfig, 
            loadInvoiceSettingsFromDB, 
            saveInvoiceSettingsToDB, 
            renderLiveInvoicePreview, 
            loadBusinessPreviewData 
        } from '../invoice-state.js';

        let config = getInvoiceConfig();

        function syncUIFromConfig() {
            // Numbering
            setVal('cfgPrefix', config.prefix || 'INV-');
            setVal('cfgStartingNumber', config.startingNumber || '1001');

            // Header
            setChecked('hdrLogo', config.header.showLogo);
            setChecked('hdrDisplayName', config.header.showDisplayName);
            setChecked('hdrLegalName', config.header.showLegalName);
            setChecked('hdrBranchName', config.header.showBranchName);
            setChecked('hdrAddress', config.header.showAddress);
            setChecked('hdrPhone', config.header.showPhone);
            setChecked('hdrEmail', config.header.showEmail);
            setChecked('hdrWebsite', config.header.showWebsite);
            setChecked('hdrGstin', config.header.showGstin);
            setChecked('hdrPan', config.header.showPan);

            // Customer
            setChecked('custName', config.customer.showName);
            setChecked('custPhone', config.customer.showPhone);
            setChecked('custEmail', config.customer.showEmail);
            setChecked('custAddress', config.customer.showAddress);

            // Transaction
            setChecked('txnInvNum', config.transaction.showInvoiceNumber);
            setChecked('txnInvDate', config.transaction.showInvoiceDate);
            setChecked('txnPayDate', config.transaction.showPaymentDate);
            setChecked('txnStaff', config.transaction.showStaffName);
            setChecked('txnPayMethod', config.transaction.showPaymentMethod);

            // Items
            setChecked('itmQty', config.items.showQuantity);
            setChecked('itmUnitPrice', config.items.showUnitPrice);
            setChecked('itmTax', config.items.showTax);
            setChecked('itmTaxRate', config.items.showTaxRate);
            setChecked('itmLineTotal', config.items.showLineTotal);

            // Totals
            setChecked('totSubtotal', config.totals.showSubtotal);
            setChecked('totTax', config.totals.showTax);
            setChecked('totRoundoff', config.totals.showRoundoff);
            setChecked('totAmtPaid', config.totals.showAmountPaid);
            setChecked('totBalanceDue', config.totals.showBalanceDue);

            // Footer
            setChecked('ftrThankYou', config.footer.showThankYou);
            setVal('ftrThankYouText', config.footer.thankYouMessage || '');
            setChecked('ftrTerms', config.footer.showTerms);
            setVal('ftrTermsText', config.footer.termsText || '');
            setChecked('ftrPayInstr', config.footer.showPaymentInstructions);
            setVal('ftrPayInstrText', config.footer.paymentInstructionsText || '');
            setVal('ftrCustomNote', config.footer.customFooterMessage || '');

            updateFooterVisibility();
            updateNumberingPreview();
            renderPreview();
        }

        function syncConfigFromUI() {
            config.prefix = getVal('cfgPrefix') || 'INV-';
            config.startingNumber = getVal('cfgStartingNumber') || '1001';

            config.header.showLogo = isChecked('hdrLogo');
            config.header.showDisplayName = isChecked('hdrDisplayName');
            config.header.showLegalName = isChecked('hdrLegalName');
            config.header.showBranchName = isChecked('hdrBranchName');
            config.header.showAddress = isChecked('hdrAddress');
            config.header.showPhone = isChecked('hdrPhone');
            config.header.showEmail = isChecked('hdrEmail');
            config.header.showWebsite = isChecked('hdrWebsite');
            config.header.showGstin = isChecked('hdrGstin');
            config.header.showPan = isChecked('hdrPan');

            config.customer.showName = isChecked('custName');
            config.customer.showPhone = isChecked('custPhone');
            config.customer.showEmail = isChecked('custEmail');
            config.customer.showAddress = isChecked('custAddress');

            config.transaction.showInvoiceNumber = isChecked('txnInvNum');
            config.transaction.showInvoiceDate = isChecked('txnInvDate');
            config.transaction.showPaymentDate = isChecked('txnPayDate');
            config.transaction.showStaffName = isChecked('txnStaff');
            config.transaction.showPaymentMethod = isChecked('txnPayMethod');

            config.items.showQuantity = isChecked('itmQty');
            config.items.showUnitPrice = isChecked('itmUnitPrice');
            config.items.showTax = isChecked('itmTax');
            config.items.showTaxRate = isChecked('itmTaxRate');
            config.items.showLineTotal = isChecked('itmLineTotal');

            config.totals.showSubtotal = isChecked('totSubtotal');
            config.totals.showTax = isChecked('totTax');
            config.totals.showRoundoff = isChecked('totRoundoff');
            config.totals.showAmountPaid = isChecked('totAmtPaid');
            config.totals.showBalanceDue = isChecked('totBalanceDue');

            config.footer.showThankYou = isChecked('ftrThankYou');
            config.footer.thankYouMessage = getVal('ftrThankYouText');
            config.footer.showTerms = isChecked('ftrTerms');
            config.footer.termsText = getVal('ftrTermsText');
            config.footer.showPaymentInstructions = isChecked('ftrPayInstr');
            config.footer.paymentInstructionsText = getVal('ftrPayInstrText');
            config.footer.customFooterMessage = getVal('ftrCustomNote');

            updateNumberingPreview();
            updateFooterVisibility();
            renderPreview();
            markDirty();
        }

        function updateFooterVisibility() {
            const termsBox = document.getElementById('ftrTermsGroup');
            if (termsBox) termsBox.style.display = isChecked('ftrTerms') ? 'block' : 'none';
            const payBox = document.getElementById('ftrPayInstrGroup');
            if (payBox) payBox.style.display = isChecked('ftrPayInstr') ? 'block' : 'none';
        }

        function updateNumberingPreview() {
            const pfx = getVal('cfgPrefix') || 'INV-';
            const start = parseInt(getVal('cfgStartingNumber'), 10) || 1001;
            const previewEl = document.getElementById('numberingPreviewText');
            if (previewEl) {
                previewEl.textContent = `${pfx}00${start} � ${pfx}00${start+1} � ${pfx}00${start+2}`;
            }
        }

        function renderPreview() {
            renderLiveInvoicePreview('common', 'invoicePreviewContainer', config);
        }

        window.saveCommonConfig = async function() {
            const btn = document.getElementById('btnSave');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
            }

            try {
                await saveInvoiceSettingsToDB('common', config);
                showToast('? Common invoice settings saved!', 'success');
                document.getElementById('savebar')?.classList.remove('visible');
            } catch (err) {
                console.error('Error saving common invoice settings:', err);
                showToast(err.message || 'Failed to save. Please try again.', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Common Invoice';
                    if (typeof feather !== 'undefined') feather.replace();
                }
            }
        };

        window.cancelCommonConfig = async function() {
            config = await loadInvoiceSettingsFromDB('common');
            syncUIFromConfig();
            document.getElementById('savebar')?.classList.remove('visible');
        };

        function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
        function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
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
window.saveCommonConfig = saveCommonConfig;
window.cancelCommonConfig = cancelCommonConfig;

export async function initInvoiceCommon() {
            if (typeof feather !== 'undefined') feather.replace();
            
            // Load live company info for preview and settings from Supabase
            await loadBusinessPreviewData();
            config = await loadInvoiceSettingsFromDB('common');
            syncUIFromConfig();

            document.querySelectorAll('.form-input, .form-textarea, input[type=checkbox]').forEach(el => {
                el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', syncConfigFromUI);
            });
}

// Safe initialization guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvoiceCommon);
} else {
    initInvoiceCommon();
}