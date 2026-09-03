import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

export async function loadTaxData() {
    if (!companyId) return;
    try {
        // Tax data lives in company_settings table
        const { data, error } = await supabase
            .from('company_settings')
            .select('tax_id, pan, business_registration_number, default_tax_rate, tax_label, tax_inclusive, show_tax_breakdown')
            .eq('company_id', companyId)
            .single();

        if (error && error.code !== 'PGRST116') { console.error('[settings-tax] load error:', error); return; }
        if (!data) return;

        setVal('gstin',            data.tax_id || '');
        setVal('pan',              data.pan || '');
        setVal('regNumber',        data.business_registration_number || '');
        setVal('defaultTaxRate',   data.default_tax_rate ?? '');
        setVal('taxLabel',         data.tax_label || 'GST');
        setChecked('taxInclusive',      data.tax_inclusive ?? false);
        setChecked('showTaxBreakdown',  data.show_tax_breakdown ?? true);
    } catch (err) {
        console.error('[settings-tax] unexpected error:', err);
    }
}

window.saveTaxSettings = async function () {
    if (!companyId) { showToast('No company session. Please sign in.', 'error'); return; }
    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
        const payload = {
            tax_id:                        getVal('gstin'),
            pan:                           getVal('pan'),
            business_registration_number:  getVal('regNumber'),
            default_tax_rate:              parseFloat(getVal('defaultTaxRate')) || null,
            tax_label:                     getVal('taxLabel') || 'GST',
            tax_inclusive:                 document.getElementById('taxInclusive')?.checked ?? false,
            show_tax_breakdown:            document.getElementById('showTaxBreakdown')?.checked ?? true,
        };

        const { data: existing } = await supabase.from('company_settings').select('company_id').eq('company_id', companyId);
        let error;
        if (existing?.length > 0) {
            ({ error } = await supabase.from('company_settings').eq('company_id', companyId).update(payload));
        } else {
            ({ error } = await supabase.from('company_settings').insert({ company_id: companyId, ...payload }));
        }

        if (error) throw new Error(error.message);
        showToast('Tax settings saved!', 'success');
        isDirty = false;
        document.getElementById('savebar').classList.remove('visible');
    } catch (err) {
        showToast(err.message || 'Failed to save.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes'; if (typeof feather !== 'undefined') feather.replace(); }
    }
};

function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }

document.addEventListener('DOMContentLoaded', () => loadTaxData());
