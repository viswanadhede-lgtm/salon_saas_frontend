import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

export async function loadContactData() {
    if (!companyId) return;
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (error) {
            console.error('[settings-contact] load error:', error);
            return;
        }
        if (!data) return;

        // Section 1: Communication Details
        setVal('contactPhone',          data.phone || data.primary_phone || '');
        setVal('contactWhatsApp',       data.whatsapp || data.whatsapp_number || '');
        setVal('contactEmail',          data.email || data.primary_email || '');
        setVal('contactAlternatePhone', data.alternate_phone || data.alt_phone || '');
        setVal('contactSupportPhone',   data.support_phone || '');
        setVal('contactSupportEmail',   data.support_email || '');

        // Section 2: Company Address
        setVal('addressLine1',          data.address_line1 || data.address || '');
        setVal('addressLine2',          data.address_line2 || '');
        setVal('addressLocality',       data.locality || data.area || '');
        setVal('addressLandmark',       data.landmark || '');
        setVal('addressCity',           data.city || '');
        setVal('addressDistrict',       data.district || '');
        setVal('addressState',          data.state || data.province || '');
        setVal('addressPincode',        data.pincode || data.postal_code || data.zipcode || '');
        setVal('addressCountry',        data.country || 'India');
        setVal('mapLink',               data.map_link || data.google_maps_url || '');
        setVal('addressLatitude',       data.latitude != null ? data.latitude : '');
        setVal('addressLongitude',      data.longitude != null ? data.longitude : '');

        // Section 3: Primary Contact Person
        setVal('primaryContactName',    data.contact_person_name || data.primary_contact_name || '');
        setVal('primaryContactPhone',   data.contact_person_phone || data.primary_contact_phone || '');
        setVal('primaryContactEmail',   data.contact_person_email || data.primary_contact_email || '');

    } catch (err) {
        console.error('[settings-contact] unexpected error:', err);
    }
}

window.saveContactSettings = async function () {
    if (!companyId) {
        showToast('No company session. Please sign in.', 'error');
        return;
    }

    // Required Field Validations
    const phone = getVal('contactPhone');
    const email = getVal('contactEmail');
    const addressLine1 = getVal('addressLine1');
    const city = getVal('addressCity');
    const state = getVal('addressState');
    const pincode = getVal('addressPincode');
    const country = getVal('addressCountry');

    if (!phone) {
        showToast('Please enter the Primary Phone Number.', 'error');
        document.getElementById('contactPhone')?.focus();
        return;
    }
    if (!email) {
        showToast('Please enter the Email Address.', 'error');
        document.getElementById('contactEmail')?.focus();
        return;
    }
    if (!addressLine1) {
        showToast('Please enter Address Line 1.', 'error');
        document.getElementById('addressLine1')?.focus();
        return;
    }
    if (!city) {
        showToast('Please enter the City.', 'error');
        document.getElementById('addressCity')?.focus();
        return;
    }
    if (!state) {
        showToast('Please enter the State / Province.', 'error');
        document.getElementById('addressState')?.focus();
        return;
    }
    if (!pincode) {
        showToast('Please enter the PIN / Postal Code.', 'error');
        document.getElementById('addressPincode')?.focus();
        return;
    }
    if (!country) {
        showToast('Please select the Country.', 'error');
        document.getElementById('addressCountry')?.focus();
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        const latVal = getVal('addressLatitude');
        const lngVal = getVal('addressLongitude');

        const payload = {
            // Communication
            phone:                 phone,
            whatsapp:              getVal('contactWhatsApp'),
            email:                 email,
            alternate_phone:       getVal('contactAlternatePhone'),
            support_phone:         getVal('contactSupportPhone'),
            support_email:         getVal('contactSupportEmail'),

            // Address
            address_line1:         addressLine1,
            address_line2:         getVal('addressLine2'),
            locality:              getVal('addressLocality'),
            landmark:              getVal('addressLandmark'),
            city:                  city,
            district:              getVal('addressDistrict'),
            state:                 state,
            pincode:               pincode,
            country:               country,
            map_link:              getVal('mapLink'),
            latitude:              latVal ? parseFloat(latVal) : null,
            longitude:             lngVal ? parseFloat(lngVal) : null,

            // Primary Contact Person
            contact_person_name:   getVal('primaryContactName'),
            contact_person_phone:  getVal('primaryContactPhone'),
            contact_person_email:  getVal('primaryContactEmail'),

            updated_at:            new Date().toISOString(),
        };

        let { error } = await supabase
            .from('companies')
            .eq('company_id', companyId)
            .update(payload);

        // Fallback: If DB schema doesn't yet have newly added extended columns, fallback to core columns
        if (error && error.message) {
            console.warn('[settings-contact] update with extended columns failed, falling back to core columns:', error.message);
            const corePayload = {
                phone:         phone,
                whatsapp:      getVal('contactWhatsApp'),
                email:         email,
                address_line1: addressLine1,
                address_line2: getVal('addressLine2'),
                city:          city,
                state:         state,
                pincode:       pincode,
                country:       country,
                map_link:      getVal('mapLink'),
                updated_at:    new Date().toISOString(),
            };
            const res = await supabase.from('companies').eq('company_id', companyId).update(corePayload);
            error = res.error;
        }

        if (error) throw new Error(error.message);

        showToast('Contact settings saved successfully!', 'success');
        if (typeof isDirty !== 'undefined') isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-contact] save error:', err);
        showToast(err.message || 'Failed to save. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

document.addEventListener('DOMContentLoaded', () => loadContactData());
