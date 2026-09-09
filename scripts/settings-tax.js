import { supabase } from '../lib/supabase.js';

// ── Resolve Company ID ───────────────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (e) {}
    return localStorage.getItem('company_id') || null;
}

// ── Load Tax Data ───────────────────────────────────────────────────────────
export async function loadTaxData() {
    let companyId = getCompanyId();
    if (!companyId) {
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-tax] No company_id found.');
        return;
    }

    try {
        // 1. Fetch Legal Business Name from company_settings (read-only)
        const { data: compSettings, error: settErr } = await supabase
            .from('company_settings')
            .select('legal_business_name, display_name')
            .eq('company_id', companyId)
            .maybeSingle();

        if (settErr) {
            console.warn('[settings-tax] error loading company_settings:', settErr);
        }

        let legalBusinessName = compSettings?.legal_business_name || '';

        // Fallback to companies table if company_settings doesn't have legal_business_name yet
        if (!legalBusinessName) {
            const { data: comp } = await supabase
                .from('companies')
                .select('company_name, display_name')
                .eq('company_id', companyId)
                .maybeSingle();

            legalBusinessName = comp?.company_name || comp?.display_name || '';
        }

        setVal('companyName', legalBusinessName);

        // 2. Fetch from company_tax_settings table
        const { data: taxData, error: taxErr } = await supabase
            .from('company_tax_settings')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (taxErr) {
            console.error('[settings-tax] error loading company_tax_settings:', taxErr);
        }

        if (taxData) {
            setVal('regNumber',      taxData.business_registration_number || '');
            setVal('gstin',          taxData.gstin || '');
            setVal('pan',            taxData.pan || '');
            setVal('taxState',       taxData.gst_registration_state || '');
            setVal('defaultTaxRate', taxData.default_tax_rate != null ? taxData.default_tax_rate : '');
            setVal('taxLabel',       taxData.tax_label || 'GST');
            setChecked('taxInclusive',     taxData.prices_include_tax ?? false);
            setChecked('showTaxBreakdown', taxData.show_tax_breakdown ?? true);
        } else {
            // Row not yet created in company_tax_settings: prefill defaults
            // Prefill state from company_contacts if available
            const { data: contact } = await supabase
                .from('company_contacts')
                .select('state')
                .eq('company_id', companyId)
                .maybeSingle();

            setVal('regNumber', '');
            setVal('gstin', '');
            setVal('pan', '');
            setVal('taxState', contact?.state || '');
            setVal('defaultTaxRate', '');
            setVal('taxLabel', 'GST');
            setChecked('taxInclusive', false);
            setChecked('showTaxBreakdown', true);
        }

        // Reset dirty indicator
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-tax] unexpected error:', err);
    }
}

// ── Save Tax Settings ───────────────────────────────────────────────────────
window.saveTaxSettings = async function () {
    const companyId = getCompanyId();
    if (!companyId) {
        showToast('No company session found. Please sign in.', 'error');
        return;
    }

    const taxState       = getVal('taxState');
    const regNumber      = getVal('regNumber');
    const gstin          = getVal('gstin').toUpperCase();
    const pan            = getVal('pan').toUpperCase();
    const defaultTaxRate = getVal('defaultTaxRate');
    const taxLabel       = getVal('taxLabel') || 'GST';
    const taxInclusive   = document.getElementById('taxInclusive')?.checked ?? false;
    const showTaxBreakdown = document.getElementById('showTaxBreakdown')?.checked ?? true;

    // Required Field Validations
    if (!taxState) {
        showToast('Please enter the State of GST Registration.', 'error');
        document.getElementById('taxState')?.focus();
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        const now = new Date().toISOString();
        const rateNum = defaultTaxRate !== '' && !isNaN(Number(defaultTaxRate)) ? Number(defaultTaxRate) : null;

        const commonPayload = {
            business_registration_number: regNumber || null,
            gstin:                        gstin || null,
            pan:                          pan || null,
            gst_registration_state:       taxState,
            default_tax_rate:             rateNum,
            tax_label:                    taxLabel,
            prices_include_tax:           taxInclusive,
            show_tax_breakdown:           showTaxBreakdown,
            updated_at:                   now
        };

        // Check if record exists in company_tax_settings
        const { data: existingRows, error: checkErr } = await supabase
            .from('company_tax_settings')
            .select('id')
            .eq('company_id', companyId);

        if (checkErr) {
            console.warn('[settings-tax] check existing error:', checkErr);
        }

        const recordExists = Array.isArray(existingRows) && existingRows.length > 0;

        if (recordExists) {
            // Update existing record (preserve created_at)
            const { error: updateErr } = await supabase
                .from('company_tax_settings')
                .eq('company_id', companyId)
                .update(commonPayload);

            if (updateErr) throw new Error(updateErr.message || 'Failed to update tax settings');
        } else {
            // Insert new record (write created_at & updated_at)
            const insertPayload = {
                company_id: companyId,
                ...commonPayload,
                created_at: now
            };

            const { error: insertErr } = await supabase
                .from('company_tax_settings')
                .insert(insertPayload);

            if (insertErr) throw new Error(insertErr.message || 'Failed to create tax settings');
        }

        // Best-effort sync to companies table for backwards compatibility
        try {
            await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update({
                    business_registration_number: regNumber || null,
                    tax_id:                       gstin || null,
                    pan:                          pan || null,
                    updated_at:                   now
                });
        } catch (syncErr) {
            console.warn('[settings-tax] companies sync note:', syncErr);
        }

        showToast('Tax settings saved successfully!', 'success');
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Reload data to reflect clean state
        await loadTaxData();

    } catch (err) {
        console.error('[settings-tax] save error:', err);
        showToast(err.message || 'Failed to save tax settings.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

window.loadTaxData = loadTaxData;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

// ── Init ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadTaxData());
} else {
    loadTaxData();
}
