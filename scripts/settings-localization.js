import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

export async function loadLocalizationData() {
    if (!companyId) return;
    try {
        const { data, error } = await supabase
            .from('company_settings')
            .select('currency, timezone, language, date_format, time_format, country')
            .eq('company_id', companyId)
            .single();

        if (error && error.code !== 'PGRST116') { console.error('[settings-localization] load error:', error); return; }
        if (!data) return;

        setVal('country',    data.country    || 'India');
        setVal('currency',   data.currency   || 'INR');
        setVal('timezone',   data.timezone   || 'Asia/Kolkata');
        setVal('language',   data.language   || 'en');
        setVal('dateFormat', data.date_format || 'DD-MM-YYYY');
        setVal('timeFormat', data.time_format || '12h');
    } catch (err) {
        console.error('[settings-localization] unexpected error:', err);
    }
}

window.saveLocalizationSettings = async function () {
    if (!companyId) { showToast('No company session. Please sign in.', 'error'); return; }
    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
        const payload = {
            country:     getVal('country'),
            currency:    getVal('currency'),
            timezone:    getVal('timezone'),
            language:    getVal('language'),
            date_format: getVal('dateFormat'),
            time_format: getVal('timeFormat'),
        };

        const { data: existing } = await supabase.from('company_settings').select('company_id').eq('company_id', companyId);
        let error;
        if (existing?.length > 0) {
            ({ error } = await supabase.from('company_settings').eq('company_id', companyId).update(payload));
        } else {
            ({ error } = await supabase.from('company_settings').insert({ company_id: companyId, ...payload }));
        }

        if (error) throw new Error(error.message);
        showToast('Localization settings saved!', 'success');
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

document.addEventListener('DOMContentLoaded', () => loadLocalizationData());
