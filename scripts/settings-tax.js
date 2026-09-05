import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

// ── Load Tax Data ───────────────────────────────────────────────────────────
export async function loadTaxData() {
    if (!companyId) return;
    try {
        // 1. Fetch company record
        const { data: companyData, error: compErr } = await supabase
            .from('companies')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (compErr && compErr.code !== 'PGRST116') {
            console.error('[settings-tax] load company error:', compErr);
        }

        // 2. Fetch company_settings record
        const { data: settingsData, error: settErr } = await supabase
            .from('company_settings')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (settErr && settErr.code !== 'PGRST116') {
            console.error('[settings-tax] load settings error:', settErr);
        }

        // Populate Section 1: Tax Registration
        setVal('companyName', companyData?.company_name || companyData?.legal_name || '');
        setVal('regNumber',   companyData?.business_registration_number || companyData?.reg_number || settingsData?.business_registration_number || '');
        setVal('gstin',       companyData?.tax_id || companyData?.gstin || settingsData?.tax_id || '');
        setVal('pan',         companyData?.pan || settingsData?.pan || '');
        setVal('taxState',    companyData?.state || companyData?.province || '');

        // Populate Section 2: Tax Configuration
        setVal('defaultTaxRate',  settingsData?.default_tax_rate ?? '');
        setVal('taxLabel',        settingsData?.tax_label || 'GST');
        setChecked('taxInclusive',     settingsData?.tax_inclusive ?? false);
        setChecked('showTaxBreakdown', settingsData?.show_tax_breakdown ?? true);

    } catch (err) {
        console.error('[settings-tax] unexpected error:', err);
    }
}

// ── Save Tax Settings ───────────────────────────────────────────────────────
window.saveTaxSettings = async function () {
    if (!companyId) {
        showToast('No company session. Please sign in.', 'error');
        return;
    }

    const companyName = getVal('companyName');
    const taxState    = getVal('taxState');
    const regNumber   = getVal('regNumber');
    const gstin       = getVal('gstin');
    const pan         = getVal('pan');
    const defaultTaxRate = getVal('defaultTaxRate');
    const taxLabel    = getVal('taxLabel') || 'GST';
    const taxInclusive = document.getElementById('taxInclusive')?.checked ?? false;
    const showTaxBreakdown = document.getElementById('showTaxBreakdown')?.checked ?? true;

    // Required Field Validations
    if (!companyName) {
        showToast('Please enter the Legal Company Name.', 'error');
        document.getElementById('companyName')?.focus();
        return;
    }
    if (!taxState) {
        showToast('Please enter the State.', 'error');
        document.getElementById('taxState')?.focus();
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        // 1. Update companies table
        const companyPayload = {
            company_name:                 companyName,
            business_registration_number: regNumber,
            tax_id:                       gstin,
            pan:                          pan,
            state:                        taxState,
            updated_at:                   new Date().toISOString(),
        };

        let { error: compError } = await supabase
            .from('companies')
            .eq('company_id', companyId)
            .update(companyPayload);

        // Graceful fallback if any columns are absent in companies table
        if (compError && compError.message) {
            console.warn('[settings-tax] companies update fallback:', compError.message);
            const fallbackCompanyPayload = {
                company_name: companyName,
                tax_id:       gstin,
                state:        taxState,
                updated_at:   new Date().toISOString(),
            };
            const fallbackRes = await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update(fallbackCompanyPayload);
            compError = fallbackRes.error;
        }

        if (compError) throw new Error(compError.message);

        // 2. Upsert company_settings table
        const settingsPayload = {
            tax_id:                        gstin,
            pan:                           pan,
            business_registration_number:  regNumber,
            default_tax_rate:              defaultTaxRate ? parseFloat(defaultTaxRate) : null,
            tax_label:                     taxLabel,
            tax_inclusive:                 taxInclusive,
            show_tax_breakdown:            showTaxBreakdown,
        };

        const { data: existing } = await supabase
            .from('company_settings')
            .select('company_id')
            .eq('company_id', companyId);

        let settError;
        if (existing && existing.length > 0) {
            const res = await supabase
                .from('company_settings')
                .eq('company_id', companyId)
                .update(settingsPayload);
            settError = res.error;
        } else {
            const res = await supabase
                .from('company_settings')
                .insert({ company_id: companyId, ...settingsPayload });
            settError = res.error;
        }

        if (settError) {
            console.warn('[settings-tax] company_settings upsert error:', settError.message);
        }

        showToast('Tax settings saved successfully!', 'success');
        if (typeof isDirty !== 'undefined') isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Update local session cache if present
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (appContext.company) {
                appContext.company.company_name = companyName;
                localStorage.setItem('appContext', JSON.stringify(appContext));
            }
        } catch (e) {}

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
    if (el) el.checked = val;
}

document.addEventListener('DOMContentLoaded', () => loadTaxData());
