import { supabase } from '../lib/supabase.js';

let currentLogoUrl = null;
let currentCoverUrl = null;

// ── Resolve Company ID ───────────────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (e) {}
    return localStorage.getItem('company_id') || null;
}

// ── Load ────────────────────────────────────────────────────────────────────
export async function loadBusinessData() {
    let companyId = getCompanyId();
    if (!companyId) {
        // Retry shortly in case auth guard is still writing appContext
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-business] No company_id found.');
        return;
    }

    try {
        // 1. Fetch from company_settings table
        const { data: settingsData, error: settingsErr } = await supabase
            .from('company_settings')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (settingsErr) {
            console.error('[settings-business] Error loading company_settings:', settingsErr);
        }

        if (settingsData) {
            // Populate from company_settings
            setVal('companyName',         settingsData.legal_business_name || '');
            setVal('displayName',         settingsData.display_name        || '');
            setVal('businessCategory',    settingsData.business_category   || 'salon_spa');
            setVal('businessType',        settingsData.business_structure  || 'single_location');
            setVal('businessDescription', settingsData.business_description || '');
            setVal('companyWebsite',      settingsData.website             || '');
            setVal('googleBusinessUrl',   settingsData.google_business_profile_url || '');
            setVal('instagramUrl',        settingsData.instagram_url       || '');
            setVal('facebookUrl',         settingsData.facebook_url        || '');

            currentLogoUrl = settingsData.logo_url || null;
            currentCoverUrl = settingsData.cover_image_url || null;
        } else {
            // Fallback: row not yet created in company_settings, prefill defaults from companies table
            const { data: comp, error: compErr } = await supabase
                .from('companies')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            if (!compErr && comp) {
                setVal('companyName',         comp.company_name || comp.name || comp.email || '');
                setVal('displayName',         comp.display_name || comp.name || '');
                setVal('businessCategory',    comp.business_category || comp.category || 'salon_spa');
                setVal('businessType',        comp.business_structure || comp.business_type || 'single_location');
                setVal('businessDescription', comp.description || comp.business_description || '');
                setVal('companyWebsite',      comp.website || '');
                setVal('googleBusinessUrl',   comp.google_business_url || comp.google_business_profile_url || comp.gmb_url || '');
                setVal('instagramUrl',        comp.instagram_url || comp.instagram || '');
                setVal('facebookUrl',         comp.facebook_url || comp.facebook || '');

                currentLogoUrl = comp.logo_url || null;
                currentCoverUrl = comp.cover_image_url || comp.cover_url || null;
            }
        }

        // Render Logo preview
        const logoBox = document.getElementById('logoPreviewBox');
        const btnRemoveLogo = document.getElementById('btnRemoveLogo');
        if (logoBox) {
            if (currentLogoUrl) {
                logoBox.innerHTML = `<img src="${currentLogoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
                if (btnRemoveLogo) btnRemoveLogo.style.display = 'inline-flex';
            } else {
                logoBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
                if (btnRemoveLogo) btnRemoveLogo.style.display = 'none';
            }
        }

        // Render Cover Image preview
        const coverBox = document.getElementById('coverPreviewBox');
        const btnRemoveCover = document.getElementById('btnRemoveCover');
        if (coverBox) {
            if (currentCoverUrl) {
                coverBox.innerHTML = `<img src="${currentCoverUrl}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">`;
                if (btnRemoveCover) btnRemoveCover.style.display = 'inline-flex';
            } else {
                coverBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
                if (btnRemoveCover) btnRemoveCover.style.display = 'none';
            }
        }

        if (typeof feather !== 'undefined') feather.replace();

        // Reset dirty indicator
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-business] unexpected load error:', err);
    }
}

// ── Save ────────────────────────────────────────────────────────────────────
window.saveBusinessSettings = async function () {
    const companyId = getCompanyId();
    if (!companyId) {
        showToast('No company session found. Please sign in.', 'error');
        return;
    }

    const companyName = getVal('companyName');
    const displayName = getVal('displayName');

    if (!companyName) {
        showToast('Please enter the Legal Business Name.', 'error');
        document.getElementById('companyName')?.focus();
        return;
    }
    if (!displayName) {
        showToast('Please enter the Display / Brand Name.', 'error');
        document.getElementById('displayName')?.focus();
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        // 1. Upload Logo if a new file was chosen
        const logoInput = document.getElementById('logoFileInput');
        let logoUrl = currentLogoUrl;
        if (logoInput?.files?.[0]) {
            const file = logoInput.files[0];
            const ext = file.name.split('.').pop() || 'png';
            const path = `logos/${companyId}/logo_${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(path, file, { upsert: true });

            if (uploadErr) {
                console.warn('[settings-business] Logo upload error:', uploadErr);
            } else {
                const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
                if (urlData?.publicUrl) {
                    logoUrl = urlData.publicUrl;
                    currentLogoUrl = logoUrl;
                }
            }
        }

        // 2. Upload Cover Image if a new file was chosen
        const coverInput = document.getElementById('coverFileInput');
        let coverUrl = currentCoverUrl;
        if (coverInput?.files?.[0]) {
            const file = coverInput.files[0];
            const ext = file.name.split('.').pop() || 'png';
            const path = `covers/${companyId}/cover_${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(path, file, { upsert: true });

            if (uploadErr) {
                console.warn('[settings-business] Cover upload error:', uploadErr);
            } else {
                const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
                if (urlData?.publicUrl) {
                    coverUrl = urlData.publicUrl;
                    currentCoverUrl = coverUrl;
                }
            }
        }

        // 3. Check if record already exists in company_settings
        const { data: existingRows, error: checkErr } = await supabase
            .from('company_settings')
            .select('company_id')
            .eq('company_id', companyId);

        if (checkErr) {
            console.warn('[settings-business] Check existing error:', checkErr);
        }

        const recordExists = Array.isArray(existingRows) && existingRows.length > 0;
        const now = new Date().toISOString();

        const commonPayload = {
            legal_business_name:         companyName,
            display_name:                displayName,
            logo_url:                    logoUrl || null,
            cover_image_url:             coverUrl || null,
            business_category:           getVal('businessCategory'),
            business_structure:          getVal('businessType'),
            business_description:       getVal('businessDescription'),
            website:                     getVal('companyWebsite'),
            google_business_profile_url: getVal('googleBusinessUrl'),
            instagram_url:               getVal('instagramUrl'),
            facebook_url:                getVal('facebookUrl'),
            updated_at:                  now
        };

        if (recordExists) {
            // Update existing record (preserve created_at)
            const { error: updateErr } = await supabase
                .from('company_settings')
                .eq('company_id', companyId)
                .update(commonPayload);

            if (updateErr) throw new Error(updateErr.message || 'Failed to update company settings');
        } else {
            // Insert new record (write created_at and updated_at)
            const insertPayload = {
                company_id: companyId,
                ...commonPayload,
                created_at: now
            };

            const { error: insertErr } = await supabase
                .from('company_settings')
                .insert(insertPayload);

            if (insertErr) throw new Error(insertErr.message || 'Failed to create company settings');
        }

        // 4. Best-effort sync with companies table for cross-app consistency
        try {
            await supabase
                .from('companies')
                .eq('company_id', companyId)
                .update({
                    company_name:  companyName,
                    display_name:  displayName,
                    logo_url:      logoUrl || null,
                    updated_at:    now
                });
        } catch (syncErr) {
            console.warn('[settings-business] companies table sync note:', syncErr);
        }

        // 5. Update cached appContext in localStorage
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (appContext.company) {
                appContext.company.company_name = companyName;
                appContext.company.display_name = displayName;
                if (logoUrl) appContext.company.logo_url = logoUrl;
                localStorage.setItem('appContext', JSON.stringify(appContext));
            }
        } catch (e) {}

        showToast('Business settings saved successfully!', 'success');
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Reload data to reflect clean saved state
        await loadBusinessData();

    } catch (err) {
        console.error('[settings-business] save error:', err);
        showToast(err.message || 'Failed to save. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

window.removeLogo = function () {
    currentLogoUrl = null;
    const fileInput = document.getElementById('logoFileInput');
    if (fileInput) fileInput.value = '';
    const logoBox = document.getElementById('logoPreviewBox');
    if (logoBox) logoBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
    const btnRemove = document.getElementById('btnRemoveLogo');
    if (btnRemove) btnRemove.style.display = 'none';
    if (typeof feather !== 'undefined') feather.replace();
    if (typeof markDirty === 'function') markDirty();
};

window.removeCover = function () {
    currentCoverUrl = null;
    const fileInput = document.getElementById('coverFileInput');
    if (fileInput) fileInput.value = '';
    const coverBox = document.getElementById('coverPreviewBox');
    if (coverBox) coverBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
    const btnRemove = document.getElementById('btnRemoveCover');
    if (btnRemove) btnRemove.style.display = 'none';
    if (typeof feather !== 'undefined') feather.replace();
    if (typeof markDirty === 'function') markDirty();
};

// Expose loadBusinessData for cancel button
window.loadBusinessData = loadBusinessData;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── Init ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadBusinessData());
} else {
    loadBusinessData();
}
