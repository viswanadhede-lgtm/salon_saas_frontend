import { supabase } from '../lib/supabase.js';

let currentQrUrl = null;
let selectedQrFile = null;

// ── Resolve Company ID ───────────────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (e) {}
    return localStorage.getItem('company_id') || null;
}

// ── Helper: UI Setters & Getters ─────────────────────────────────────────────
function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

function getChecked(id, defaultVal = false) {
    const el = document.getElementById(id);
    return el ? el.checked : defaultVal;
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

export function showToast(msg, type = 'success') {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'error' ? '#dc2626' : '#1e293b';
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3500);
}

// ── QR Code Preview Display ─────────────────────────────────────────────────
export function updateQrPreview(url) {
    const qrImg = document.getElementById('qrPreviewImg');
    const qrSvg = document.getElementById('qrPlaceholderSvg');
    const btnRemQr = document.getElementById('btnRemoveQr');

    if (url) {
        if (qrImg) {
            qrImg.src = url;
            qrImg.style.display = 'block';
        }
        if (qrSvg) qrSvg.style.display = 'none';
        if (btnRemQr) btnRemQr.style.display = 'inline-flex';
    } else {
        if (qrImg) {
            qrImg.src = '';
            qrImg.style.display = 'none';
        }
        if (qrSvg) qrSvg.style.display = 'block';
        if (btnRemQr) btnRemQr.style.display = 'none';
    }
    if (typeof feather !== 'undefined') feather.replace();
}

// ── Load Payment Settings ───────────────────────────────────────────────────
export async function loadPaymentSettings() {
    let companyId = getCompanyId();
    if (!companyId) {
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-payments] No company_id found.');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('business_payment_settings')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (error) {
            console.warn('[settings-payments] Error loading business_payment_settings:', error);
        }

        if (data) {
            setChecked('pmCash', data.cash_enabled ?? true);
            setChecked('pmUpi', data.upi_enabled ?? true);
            setChecked('pmCard', data.cards_enabled ?? true);
            setChecked('pmOnline', data.online_payment_enabled ?? false);

            setVal('upiId', data.upi_id || '');
            setVal('paymentNote', data.payment_note || '');
            setVal('defaultPaymentMethod', data.default_payment_method || 'cash');

            currentQrUrl = data.upi_qr_code_url || null;
            selectedQrFile = null;
            updateQrPreview(currentQrUrl);
        } else {
            // Default fallbacks as per table schema
            setChecked('pmCash', true);
            setChecked('pmUpi', true);
            setChecked('pmCard', true);
            setChecked('pmOnline', false);
            setVal('upiId', '');
            setVal('paymentNote', '');
            setVal('defaultPaymentMethod', 'cash');
            currentQrUrl = null;
            selectedQrFile = null;
            updateQrPreview(null);
        }

        // Cache for offline/quick reads in pos / checkout modules
        const cachePayload = {
            cash_enabled: getChecked('pmCash', true),
            upi_enabled: getChecked('pmUpi', true),
            cards_enabled: getChecked('pmCard', true),
            online_payment_enabled: getChecked('pmOnline', false),
            upi_id: getVal('upiId'),
            upi_qr_code_url: currentQrUrl,
            payment_note: getVal('paymentNote'),
            default_payment_method: getVal('defaultPaymentMethod') || 'cash'
        };
        localStorage.setItem('salon_payment_settings_' + companyId, JSON.stringify(cachePayload));

    } catch (err) {
        console.error('[settings-payments] Unexpected load error:', err);
    }
}

// ── Save Payment Settings ───────────────────────────────────────────────────
export async function savePaymentSettings() {
    const companyId = getCompanyId();
    if (!companyId) {
        showToast('No company found. Please log in again.', 'error');
        return;
    }

    const btn = document.getElementById('btnSave');
    const originalHtml = btn ? btn.innerHTML : 'Save Changes';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" style="width:15px;height:15px;" class="spin"></i> Saving...';
        if (typeof feather !== 'undefined') feather.replace();
    }

    try {
        let qrUrl = currentQrUrl;

        // 1. Upload new QR file if selected
        if (selectedQrFile) {
            const ext = selectedQrFile.name.split('.').pop() || 'png';
            const filePath = `payments/${companyId}/qr_${Date.now()}.${ext}`;

            const { error: uploadErr } = await supabase.storage
                .from('company-assets')
                .upload(filePath, selectedQrFile, { upsert: true });

            if (uploadErr) {
                console.warn('[settings-payments] QR storage upload error:', uploadErr);
                showToast('Failed to upload QR code image. Saving remaining settings...', 'error');
            } else {
                const { data: urlData } = supabase.storage
                    .from('company-assets')
                    .getPublicUrl(filePath);

                if (urlData?.publicUrl) {
                    qrUrl = urlData.publicUrl;
                    currentQrUrl = qrUrl;
                }
            }
        }

        // 2. Check if row exists in business_payment_settings
        const { data: existingRows, error: checkErr } = await supabase
            .from('business_payment_settings')
            .select('company_id')
            .eq('company_id', companyId);

        if (checkErr) {
            console.warn('[settings-payments] Check existing error:', checkErr);
        }

        const recordExists = Array.isArray(existingRows) && existingRows.length > 0;
        const now = new Date().toISOString();

        const commonPayload = {
            cash_enabled: getChecked('pmCash', true),
            upi_enabled: getChecked('pmUpi', true),
            cards_enabled: getChecked('pmCard', true),
            online_payment_enabled: getChecked('pmOnline', false),
            upi_id: getVal('upiId') || null,
            upi_qr_code_url: qrUrl || null,
            payment_note: getVal('paymentNote') || null,
            default_payment_method: getVal('defaultPaymentMethod') || 'cash',
            updated_at: now
        };

        if (recordExists) {
            // Update existing record (preserve created_at)
            const { error: updateErr } = await supabase
                .from('business_payment_settings')
                .eq('company_id', companyId)
                .update(commonPayload);

            if (updateErr) throw new Error(updateErr.message || 'Failed to update payment settings');
        } else {
            // Insert new record (write created_at and updated_at)
            const insertPayload = {
                company_id: companyId,
                ...commonPayload,
                created_at: now
            };

            const { error: insertErr } = await supabase
                .from('business_payment_settings')
                .insert(insertPayload);

            if (insertErr) throw new Error(insertErr.message || 'Failed to insert payment settings');
        }

        // Update local cache for POS / checkout screens
        localStorage.setItem('salon_payment_settings_' + companyId, JSON.stringify(commonPayload));
        if (qrUrl) {
            localStorage.setItem('salon_upi_qr_' + companyId, qrUrl);
        } else {
            localStorage.removeItem('salon_upi_qr_' + companyId);
        }

        selectedQrFile = null;
        showToast('Payment settings saved successfully!', 'success');

        // Reset dirty state
        if (typeof window.isDirty !== 'undefined') {
            window.isDirty = false;
        }
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-payments] Save error:', err);
        showToast(err.message || 'Failed to save payment settings.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
}

// ── QR Code Handlers ────────────────────────────────────────────────────────
export function handleQrFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file.', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('QR code image must be under 5 MB.', 'error');
        return;
    }

    selectedQrFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        updateQrPreview(e.target.result);
        if (typeof window.markDirty === 'function') {
            window.markDirty();
        }
    };
    reader.readAsDataURL(file);
}

export function removeQrCode() {
    selectedQrFile = null;
    currentQrUrl = null;
    const qrInput = document.getElementById('qrFileInput');
    if (qrInput) qrInput.value = '';
    updateQrPreview(null);
    if (typeof window.markDirty === 'function') {
        window.markDirty();
    }
}

// ── Global Window Exports ────────────────────────────────────────────────────
window.loadPaymentSettings = loadPaymentSettings;
window.savePaymentSettings = savePaymentSettings;
window.removeQrCode = removeQrCode;
window.showToast = showToast;
window.setQrDataUrl = (url) => {
    currentQrUrl = url;
    updateQrPreview(url);
};

// ── Auto-initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const qrInput = document.getElementById('qrFileInput');
    if (qrInput) {
        qrInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleQrFileSelect(file);
        });
    }

    loadPaymentSettings();
});
