import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

// ── Load ────────────────────────────────────────────────────────────────────
export async function loadBusinessData() {
    if (!companyId) return;
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('company_name, display_name, business_type, website, description, logo_url')
            .eq('company_id', companyId)
            .single();

        if (error) { console.error('[settings-business] load error:', error); return; }
        if (!data) return;

        setVal('companyName',          data.company_name   || '');
        setVal('displayName',          data.display_name   || '');
        setVal('businessType',         data.business_type  || 'salon');
        setVal('companyWebsite',       data.website        || '');
        setVal('businessDescription',  data.description    || '');

        if (data.logo_url) {
            document.getElementById('logoPreviewBox').innerHTML =
                `<img src="${data.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
        }
    } catch (err) {
        console.error('[settings-business] unexpected error:', err);
    }
}

// ── Save ────────────────────────────────────────────────────────────────────
window.saveBusinessSettings = async function () {
    if (!companyId) { showToast('No company session. Please sign in.', 'error'); return; }

    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        // Handle logo upload first if a new file was chosen
        const fileInput = document.getElementById('logoFileInput');
        let logoUrl = null;
        if (fileInput?.files?.[0]) {
            const file = fileInput.files[0];
            const ext  = file.name.split('.').pop();
            const path = `logos/${companyId}/logo.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(path, file, { upsert: true });
            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
                logoUrl = urlData?.publicUrl || null;
            }
        }

        const payload = {
            company_name: getVal('companyName'),
            display_name: getVal('displayName'),
            business_type: getVal('businessType'),
            website:       getVal('companyWebsite'),
            description:   getVal('businessDescription'),
            updated_at:    new Date().toISOString(),
        };
        if (logoUrl) payload.logo_url = logoUrl;

        const { error } = await supabase
            .from('companies')
            .eq('company_id', companyId)
            .update(payload);

        if (error) throw new Error(error.message);

        showToast('Business settings saved!', 'success');
        isDirty = false;
        document.getElementById('savebar').classList.remove('visible');
    } catch (err) {
        console.error('[settings-business] save error:', err);
        showToast(err.message || 'Failed to save. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes'; if (typeof feather !== 'undefined') feather.replace(); }
    }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadBusinessData());
