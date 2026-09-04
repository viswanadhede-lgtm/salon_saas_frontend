import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

let currentLogoUrl = null;
let currentFaviconUrl = null;

// ── Load ────────────────────────────────────────────────────────────────────
export async function loadBusinessData() {
    if (!companyId) return;
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (error) {
            console.error('[settings-business] load error:', error);
            return;
        }
        if (!data) return;

        // Populate fields
        setVal('companyName',         data.company_name        || '');
        setVal('displayName',         data.display_name        || '');
        setVal('businessCategory',    data.business_category   || data.category || 'salon_spa');
        setVal('businessType',        data.business_type       || 'single_location');
        setVal('businessDescription', data.description         || '');
        setVal('companyWebsite',      data.website             || '');
        setVal('facebookUrl',         data.facebook_url        || data.facebook || '');
        setVal('instagramUrl',        data.instagram_url       || data.instagram || '');
        setVal('googleBusinessUrl',   data.google_business_url || data.google_business || data.gmb_url || '');

        // Logo
        currentLogoUrl = data.logo_url || null;
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

        // Favicon / Brand Icon
        currentFaviconUrl = data.favicon_url || data.icon_url || null;
        const faviconBox = document.getElementById('faviconPreviewBox');
        const btnRemoveFavicon = document.getElementById('btnRemoveFavicon');
        if (faviconBox) {
            if (currentFaviconUrl) {
                faviconBox.innerHTML = `<img src="${currentFaviconUrl}" alt="Favicon" style="width:100%;height:100%;object-fit:cover;">`;
                if (btnRemoveFavicon) btnRemoveFavicon.style.display = 'inline-flex';
            } else {
                faviconBox.innerHTML = `<i data-feather="star" class="logo-placeholder-icon"></i>`;
                if (btnRemoveFavicon) btnRemoveFavicon.style.display = 'none';
            }
        }

        if (typeof feather !== 'undefined') feather.replace();

    } catch (err) {
        console.error('[settings-business] unexpected error:', err);
    }
}

// ── Save ────────────────────────────────────────────────────────────────────
window.saveBusinessSettings = async function () {
    if (!companyId) {
        showToast('No company session. Please sign in.', 'error');
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
        // 1. Upload Logo if changed
        const logoInput = document.getElementById('logoFileInput');
        let logoUrl = currentLogoUrl;
        if (logoInput?.files?.[0]) {
            const file = logoInput.files[0];
            const ext = file.name.split('.').pop();
            const path = `logos/${companyId}/logo_${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(path, file, { upsert: true });
            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
                logoUrl = urlData?.publicUrl || logoUrl;
                currentLogoUrl = logoUrl;
            }
        }

        // 2. Upload Favicon if changed
        const faviconInput = document.getElementById('faviconFileInput');
        let faviconUrl = currentFaviconUrl;
        if (faviconInput?.files?.[0]) {
            const file = faviconInput.files[0];
            const ext = file.name.split('.').pop();
            const path = `icons/${companyId}/favicon_${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(path, file, { upsert: true });
            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
                faviconUrl = urlData?.publicUrl || faviconUrl;
                currentFaviconUrl = faviconUrl;
            }
        }

        // 3. Build payload
        const payload = {
            company_name:        companyName,
            display_name:        displayName,
            business_category:   getVal('businessCategory'),
            business_type:       getVal('businessType'),
            website:             getVal('companyWebsite'),
            description:         getVal('businessDescription'),
            facebook_url:        getVal('facebookUrl'),
            instagram_url:       getVal('instagramUrl'),
            google_business_url: getVal('googleBusinessUrl'),
            updated_at:          new Date().toISOString(),
        };
        if (logoUrl !== undefined) payload.logo_url = logoUrl;
        if (faviconUrl !== undefined) payload.favicon_url = faviconUrl;

        let { error } = await supabase
            .from('companies')
            .eq('company_id', companyId)
            .update(payload);

        // Fallback: If DB schema doesn't have extended columns yet, fallback gracefully to core columns
        if (error && error.message) {
            console.warn('[settings-business] update with extended columns failed, falling back to core columns:', error.message);
            const corePayload = {
                company_name:  companyName,
                display_name:  displayName,
                business_type: getVal('businessType'),
                website:       getVal('companyWebsite'),
                description:   getVal('businessDescription'),
                updated_at:    new Date().toISOString(),
            };
            if (logoUrl !== undefined) corePayload.logo_url = logoUrl;
            const res = await supabase.from('companies').eq('company_id', companyId).update(corePayload);
            error = res.error;
        }

        if (error) throw new Error(error.message);

        showToast('Business settings saved successfully!', 'success');
        if (typeof isDirty !== 'undefined') isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Update local session context if present
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (appContext.company) {
                appContext.company.company_name = companyName;
                appContext.company.display_name = displayName;
                if (logoUrl) appContext.company.logo_url = logoUrl;
                localStorage.setItem('appContext', JSON.stringify(appContext));
            }
        } catch (e) {}

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

window.removeFavicon = function () {
    currentFaviconUrl = null;
    const fileInput = document.getElementById('faviconFileInput');
    if (fileInput) fileInput.value = '';
    const faviconBox = document.getElementById('faviconPreviewBox');
    if (faviconBox) faviconBox.innerHTML = `<i data-feather="star" class="logo-placeholder-icon"></i>`;
    const btnRemove = document.getElementById('btnRemoveFavicon');
    if (btnRemove) btnRemove.style.display = 'none';
    if (typeof feather !== 'undefined') feather.replace();
    if (typeof markDirty === 'function') markDirty();
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadBusinessData());
