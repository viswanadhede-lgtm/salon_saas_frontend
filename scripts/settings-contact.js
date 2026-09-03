import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

export async function loadContactData() {
    if (!companyId) return;
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('phone, whatsapp, email, address_line1, address_line2, city, state, pincode, country, map_link')
            .eq('company_id', companyId)
            .single();

        if (error) { console.error('[settings-contact] load error:', error); return; }
        if (!data) return;

        setVal('contactPhone',    data.phone         || '');
        setVal('contactWhatsApp', data.whatsapp       || '');
        setVal('contactEmail',    data.email          || '');
        setVal('addressLine1',    data.address_line1  || '');
        setVal('addressLine2',    data.address_line2  || '');
        setVal('addressCity',     data.city           || '');
        setVal('addressState',    data.state          || '');
        setVal('addressPincode',  data.pincode        || '');
        setVal('addressCountry',  data.country        || 'India');
        setVal('mapLink',         data.map_link       || '');
    } catch (err) {
        console.error('[settings-contact] unexpected error:', err);
    }
}

window.saveContactSettings = async function () {
    if (!companyId) { showToast('No company session. Please sign in.', 'error'); return; }
    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
        const payload = {
            phone:         getVal('contactPhone'),
            whatsapp:      getVal('contactWhatsApp'),
            email:         getVal('contactEmail'),
            address_line1: getVal('addressLine1'),
            address_line2: getVal('addressLine2'),
            city:          getVal('addressCity'),
            state:         getVal('addressState'),
            pincode:       getVal('addressPincode'),
            country:       getVal('addressCountry'),
            map_link:      getVal('mapLink'),
            updated_at:    new Date().toISOString(),
        };

        const { error } = await supabase.from('companies').eq('company_id', companyId).update(payload);
        if (error) throw new Error(error.message);

        showToast('Contact settings saved!', 'success');
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

document.addEventListener('DOMContentLoaded', () => loadContactData());
