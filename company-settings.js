import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    const formInputs = document.querySelectorAll(
        '.settings-form .form-input, .settings-form .form-select, .settings-form .form-textarea'
    );
    const stickyFooter = document.querySelector('.sticky-footer');
    let hasChanges = false;

    // ── Show sticky footer on any change ────────────────────────────────────
    formInputs.forEach(input => {
        input.addEventListener('input', markDirty);
        if (input.tagName === 'SELECT') input.addEventListener('change', markDirty);
    });

    function markDirty() {
        if (!hasChanges) {
            hasChanges = true;
            stickyFooter.classList.add('show');
        }
    }

    // ── Logo upload preview ──────────────────────────────────────────────────
    const logoInput   = document.getElementById('companyLogo');
    const logoPreview = document.getElementById('logoPreview');

    if (logoInput) {
        logoInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    logoPreview.innerHTML = `<img src="${e.target.result}" alt="Company Logo" style="width:100%;height:100%;object-fit:cover;">`;
                    markDirty();
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    // ── Load data from Supabase ──────────────────────────────────────────────
    const companyId = localStorage.getItem('company_id');
    if (!companyId) {
        console.warn('[company-settings] No company_id in localStorage.');
        return;
    }

    await loadCompanyData(companyId);

    async function loadCompanyData(companyId) {
        try {
            // 1. Fetch from companies table
            const { data: company, error: compErr } = await supabase
                .from('companies')
                .select('company_name, display_name, business_type, website, tax_id, business_registration_number, logo_url')
                .eq('company_id', companyId)
                .single();

            if (compErr) {
                console.error('[company-settings] Error loading companies:', compErr);
            } else if (company) {
                setVal('companyName',   company.company_name   || '');
                setVal('displayName',   company.display_name   || '');
                setVal('businessType',  company.business_type  || 'salon');
                setVal('companyWebsite',company.website        || '');
                setVal('taxId',         company.tax_id         || '');
                setVal('regNumber',     company.business_registration_number || '');

                if (company.logo_url) {
                    logoPreview.innerHTML = `<img src="${company.logo_url}" alt="Company Logo" style="width:100%;height:100%;object-fit:cover;">`;
                }
            }

            // 2. Fetch from company_settings table
            const { data: settings, error: setErr } = await supabase
                .from('company_settings')
                .select('currency, timezone, language, date_format, time_format, invoice_footer_note')
                .eq('company_id', companyId)
                .single();

            if (setErr && setErr.code !== 'PGRST116') {
                // PGRST116 = no rows found (table is empty) — not an error
                console.error('[company-settings] Error loading company_settings:', setErr);
            } else if (settings) {
                setVal('currency',     settings.currency              || 'INR');
                setVal('timezone',     settings.timezone              || 'Asia/Kolkata');
                setVal('language',     settings.language              || 'en');
                setVal('dateFormat',   settings.date_format           || 'DD-MM-YYYY');
                setVal('timeFormat',   settings.time_format           || '12h');
                setVal('invoiceFooter',settings.invoice_footer_note   || '');
            }

            // Reset dirty state after load
            hasChanges = false;
            stickyFooter.classList.remove('show');

        } catch (err) {
            console.error('[company-settings] Unexpected error loading data:', err);
        }
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value;
    }
});

// ── Save Settings ─────────────────────────────────────────────────────────────
window.saveSettings = async function () {
    const btn     = document.getElementById('btnSaveCompanySettings');
    const toast   = document.getElementById('toastNotification');
    const companyId = localStorage.getItem('company_id');

    if (!companyId) {
        showToast('No company session found. Please sign in again.', 'error');
        return;
    }

    // Disable button while saving
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        // ── 1. Update companies table ────────────────────────────────────────
        const { error: compErr } = await supabase
            .from('companies')
            .update({
                company_name:                  getVal('companyName'),
                display_name:                  getVal('displayName'),
                business_type:                 getVal('businessType'),
                website:                       getVal('companyWebsite'),
                tax_id:                        getVal('taxId'),
                business_registration_number:  getVal('regNumber'),
                updated_at:                    new Date().toISOString(),
            })
            .eq('company_id', companyId);

        if (compErr) throw new Error('Failed to save company info: ' + compErr.message);

        // ── 2. Upsert company_settings table (creates row if not exists) ─────
        const { error: setErr } = await supabase
            .from('company_settings')
            .upsert({
                company_id:          companyId,
                currency:            getVal('currency'),
                timezone:            getVal('timezone'),
                language:            getVal('language'),
                date_format:         getVal('dateFormat'),
                time_format:         getVal('timeFormat'),
                invoice_footer_note: getVal('invoiceFooter'),
            }, { onConflict: 'company_id' });

        if (setErr) throw new Error('Failed to save settings: ' + setErr.message);

        // ── Success ──────────────────────────────────────────────────────────
        showToast('Company settings saved successfully!', 'success');
        document.querySelector('.sticky-footer').classList.remove('show');

    } catch (err) {
        console.error('[company-settings] Save error:', err);
        showToast(err.message || 'Failed to save. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
};

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast-notification show${type === 'error' ? ' toast-error' : ''}`;
    setTimeout(() => { toast.className = toast.className.replace(' show', '').replace(' toast-error', ''); }, 3500);
}
