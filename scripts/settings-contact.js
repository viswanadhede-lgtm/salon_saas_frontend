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

// ── Load Contact Data ────────────────────────────────────────────────────────
export async function loadContactData() {
    let companyId = getCompanyId();
    if (!companyId) {
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-contact] No company_id found.');
        return;
    }

    try {
        // 1. Fetch from company_contacts table
        const { data: contactData, error: contactErr } = await supabase
            .from('company_contacts')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (contactErr) {
            console.error('[settings-contact] Error loading company_contacts:', contactErr);
        }

        if (contactData) {
            // Section 1: Communication Details
            setVal('contactPhone',          contactData.primary_phone || '');
            setVal('contactWhatsApp',       contactData.whatsapp_number || '');
            setVal('contactEmail',          contactData.email || '');
            setVal('contactAlternatePhone', contactData.alternate_phone || '');
            setVal('contactSupportPhone',   contactData.support_phone || '');
            setVal('contactSupportEmail',   contactData.support_email || '');

            // Section 2: Business Address
            setVal('addressLine1',          contactData.address_line_1 || '');
            setVal('addressLine2',          contactData.address_line_2 || '');
            setVal('addressLocality',       contactData.locality_area || '');
            setVal('addressLandmark',       contactData.landmark || '');
            setVal('addressCity',           contactData.city || '');
            setVal('addressDistrict',       contactData.district || '');
            setVal('addressState',          contactData.state || '');
            setVal('addressPincode',        contactData.pin_code || '');
            setVal('addressCountry',        contactData.country || 'India');
            setVal('mapLink',               contactData.google_maps_url || '');
            setVal('addressLatitude',       contactData.latitude != null ? contactData.latitude : '');
            setVal('addressLongitude',      contactData.longitude != null ? contactData.longitude : '');

            // Section 3: Primary Contact Person
            setVal('primaryContactName',    contactData.contact_person_name || '');
            setVal('primaryContactPhone',   contactData.contact_person_phone || '');
            setVal('primaryContactEmail',   contactData.contact_person_email || '');
        } else {
            // Fallback: row not yet created in company_contacts, prefill defaults from companies table
            const { data: comp, error: compErr } = await supabase
                .from('companies')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            if (!compErr && comp) {
                setVal('contactPhone',          comp.phone || comp.primary_phone || '');
                setVal('contactWhatsApp',       comp.whatsapp || comp.whatsapp_number || '');
                setVal('contactEmail',          comp.email || comp.primary_email || '');
                setVal('contactAlternatePhone', comp.alternate_phone || comp.alt_phone || '');
                setVal('contactSupportPhone',   comp.support_phone || '');
                setVal('contactSupportEmail',   comp.support_email || '');

                setVal('addressLine1',          comp.address_line1 || comp.address || '');
                setVal('addressLine2',          comp.address_line2 || '');
                setVal('addressLocality',       comp.locality || comp.area || '');
                setVal('addressLandmark',       comp.landmark || '');
                setVal('addressCity',           comp.city || '');
                setVal('addressDistrict',       comp.district || '');
                setVal('addressState',          comp.state || comp.province || '');
                setVal('addressPincode',        comp.pincode || comp.postal_code || comp.zipcode || '');
                setVal('addressCountry',        comp.country || 'India');
                setVal('mapLink',               comp.map_link || comp.google_maps_url || '');
                setVal('addressLatitude',       comp.latitude != null ? comp.latitude : '');
                setVal('addressLongitude',      comp.longitude != null ? comp.longitude : '');

                setVal('primaryContactName',    comp.contact_person_name || comp.primary_contact_name || '');
                setVal('primaryContactPhone',   comp.contact_person_phone || comp.primary_contact_phone || '');
                setVal('primaryContactEmail',   comp.contact_person_email || comp.primary_contact_email || '');
            }
        }

        // Reset dirty indicator
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-contact] unexpected error:', err);
    }
}

// ── Save Contact Settings ────────────────────────────────────────────────────
window.saveContactSettings = async function () {
    const companyId = getCompanyId();
    if (!companyId) {
        showToast('No company session found. Please sign in.', 'error');
        return;
    }

    // Required Field Validations
    const phone = getVal('contactPhone');
    const email = getVal('contactEmail');
    const addressLine1 = getVal('addressLine1');
    const city = getVal('addressCity');
    const state = getVal('addressState');
    const pincode = getVal('addressPincode');
    const country = getVal('addressCountry') || 'India';

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

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        const latVal = getVal('addressLatitude');
        const lngVal = getVal('addressLongitude');
        const latNum = latVal !== '' && !isNaN(Number(latVal)) ? Number(latVal) : null;
        const lngNum = lngVal !== '' && !isNaN(Number(lngVal)) ? Number(lngVal) : null;

        const now = new Date().toISOString();

        const commonPayload = {
            primary_phone:         phone,
            whatsapp_number:       getVal('contactWhatsApp') || null,
            email:                 email,
            alternate_phone:       getVal('contactAlternatePhone') || null,
            support_phone:         getVal('contactSupportPhone') || null,
            support_email:         getVal('contactSupportEmail') || null,

            address_line_1:        addressLine1,
            address_line_2:        getVal('addressLine2') || null,
            locality_area:         getVal('addressLocality') || null,
            landmark:              getVal('addressLandmark') || null,
            city:                  city,
            district:              getVal('addressDistrict') || null,
            state:                 state,
            pin_code:              pincode,
            country:               country,
            google_maps_url:       getVal('mapLink') || null,
            latitude:              latNum,
            longitude:             lngNum,

            contact_person_name:   getVal('primaryContactName') || null,
            contact_person_phone:  getVal('primaryContactPhone') || null,
            contact_person_email:  getVal('primaryContactEmail') || null,

            updated_at:            now
        };

        // Check if record already exists in company_contacts
        const { data: existingRows, error: checkErr } = await supabase
            .from('company_contacts')
            .select('id')
            .eq('company_id', companyId);

        if (checkErr) {
            console.warn('[settings-contact] Check existing error:', checkErr);
        }

        const recordExists = Array.isArray(existingRows) && existingRows.length > 0;

        if (recordExists) {
            // Update existing record (preserve created_at)
            const { error: updateErr } = await supabase
                .from('company_contacts')
                .eq('company_id', companyId)
                .update(commonPayload);

            if (updateErr) throw new Error(updateErr.message || 'Failed to update contact settings');
        } else {
            // Insert new record (write created_at and updated_at)
            const insertPayload = {
                company_id: companyId,
                ...commonPayload,
                created_at: now
            };

            const { error: insertErr } = await supabase
                .from('company_contacts')
                .insert(insertPayload);

            if (insertErr) throw new Error(insertErr.message || 'Failed to create contact settings');
        }

        // Best-effort sync with companies table for cross-app consistency
        try {
            const compositeAddress = [
                addressLine1,
                getVal('addressLine2'),
                getVal('addressLocality'),
                getVal('addressLandmark') ? `Near ${getVal('addressLandmark')}` : '',
                city,
                state,
                pincode
            ].filter(Boolean).join(', ');

            await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update({
                    phone:                 phone,
                    email:                 email,
                    address:               compositeAddress || addressLine1,
                    city:                  city,
                    state:                 state,
                    pincode:               pincode,
                    country:               country,
                    google_maps_url:       getVal('mapLink') || null,
                    updated_at:            now
                });
        } catch (syncErr) {
            console.warn('[settings-contact] companies table sync note:', syncErr);
        }

        // Update cached appContext in localStorage
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (appContext.company) {
                appContext.company.phone = phone;
                appContext.company.email = email;
                localStorage.setItem('appContext', JSON.stringify(appContext));
            }
        } catch (e) {}

        showToast('Contact settings saved successfully!', 'success');
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Reload data to reflect clean saved state
        await loadContactData();

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

window.loadContactData = loadContactData;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── Init ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadContactData());
} else {
    loadContactData();
}
