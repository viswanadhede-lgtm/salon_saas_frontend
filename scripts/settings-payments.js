import { supabase } from '../lib/supabase.js';

let currentQrUrl = null;
let initialQrUrl = null;
let selectedQrFile = null;
let currentBranchId = null;

// ── Resolve Company ID ───────────────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (e) {}
    return localStorage.getItem('company_id') || null;
}

// ── Resolve Branch ID ────────────────────────────────────────────────────────
export async function getBranchId() {
    try {
        const saved = localStorage.getItem('active_branch_id');
        if (saved && saved !== 'all') return saved;

        const domSelect = document.getElementById('branchSelect')?.value;
        if (domSelect && domSelect !== 'all') {
            localStorage.setItem('active_branch_id', domSelect);
            return domSelect;
        }

        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.branches && ctx.branches.length > 0) {
            const first = ctx.branches[0].branch_id || ctx.branches[0].id;
            if (first) {
                localStorage.setItem('active_branch_id', first);
                return first;
            }
        }
    } catch (e) {}

    const companyId = getCompanyId();
    if (companyId) {
        const { data } = await supabase
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId)
            .neq('status', 'deleted')
            .order('created_at', { ascending: true })
            .limit(1);

        if (data && data.length > 0) {
            const bId = data[0].branch_id;
            localStorage.setItem('active_branch_id', bId);
            return bId;
        }
    }
    return null;
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

// ── Helper: Extract storage path from public URL ─────────────────────────────
function extractStoragePath(url, bucketName = 'upi-qr-codes') {
    if (!url || typeof url !== 'string') return null;
    const marker = `/${bucketName}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) {
        return url.substring(idx + marker.length).split('?')[0];
    }
    return null;
}

// ── Load Payment Settings ───────────────────────────────────────────────────
export async function loadPaymentSettings(branchIdOverride = null) {
    let companyId = getCompanyId();
    if (!companyId) {
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-payments] No company_id found.');
        return;
    }

    const branchId = branchIdOverride || await getBranchId();
    if (!branchId) {
        console.warn('[settings-payments] No active branch_id found.');
        return;
    }

    currentBranchId = branchId;

    // Sync header branchSelect if present and different
    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect && branchSelect.value !== branchId) {
        branchSelect.value = branchId;
    }

    try {
        const { data, error } = await supabase
            .from('business_payment_settings')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
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
            initialQrUrl = currentQrUrl;
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
            initialQrUrl = null;
            selectedQrFile = null;
            updateQrPreview(null);
        }

        // Cache for POS / checkout screens
        const cachePayload = {
            company_id: companyId,
            branch_id: branchId,
            cash_enabled: getChecked('pmCash', true),
            upi_enabled: getChecked('pmUpi', true),
            cards_enabled: getChecked('pmCard', true),
            online_payment_enabled: getChecked('pmOnline', false),
            upi_id: getVal('upiId'),
            upi_qr_code_url: currentQrUrl,
            payment_note: getVal('paymentNote'),
            default_payment_method: getVal('defaultPaymentMethod') || 'cash'
        };
        localStorage.setItem(`salon_payment_settings_${companyId}_${branchId}`, JSON.stringify(cachePayload));
        localStorage.setItem(`salon_payment_settings_${companyId}`, JSON.stringify(cachePayload));

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

    const branchId = currentBranchId || await getBranchId();
    if (!branchId) {
        showToast('No active branch selected. Please select a branch first.', 'error');
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

        // 1. Upload new QR file to 'upi-qr-codes' bucket if selected
        if (selectedQrFile) {
            const ext = selectedQrFile.name.split('.').pop()?.toLowerCase() || 'png';
            const filePath = `${companyId}/${branchId}/qr_${Date.now()}.${ext}`;

            const { error: uploadErr } = await supabase.storage
                .from('upi-qr-codes')
                .upload(filePath, selectedQrFile, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadErr) {
                console.error('[settings-payments] QR storage upload error:', uploadErr);
                throw new Error('Failed to upload QR code image: ' + (uploadErr.message || 'Storage error'));
            }

            const { data: urlData } = supabase.storage
                .from('upi-qr-codes')
                .getPublicUrl(filePath);

            if (!urlData?.publicUrl) {
                throw new Error('Failed to get public URL for uploaded QR code.');
            }

            qrUrl = urlData.publicUrl;
            currentQrUrl = qrUrl;

            // Delete old QR image from storage if replaced
            if (initialQrUrl && initialQrUrl !== qrUrl) {
                const oldPath = extractStoragePath(initialQrUrl, 'upi-qr-codes');
                if (oldPath && oldPath !== filePath) {
                    supabase.storage.from('upi-qr-codes').remove([oldPath]).catch(err => {
                        console.warn('[settings-payments] Could not delete old QR code file:', err);
                    });
                }
            }
        } else if (initialQrUrl && !currentQrUrl) {
            // QR was explicitly removed by the user
            const oldPath = extractStoragePath(initialQrUrl, 'upi-qr-codes');
            if (oldPath) {
                supabase.storage.from('upi-qr-codes').remove([oldPath]).catch(err => {
                    console.warn('[settings-payments] Could not delete removed QR code file:', err);
                });
            }
        }

        // 2. Single Atomic Upsert using composite unique constraint (company_id, branch_id)
        const now = new Date().toISOString();
        const payload = {
            company_id: companyId,
            branch_id: branchId,
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

        const { error: upsertErr } = await supabase
            .from('business_payment_settings')
            .upsert(payload, { onConflict: 'company_id,branch_id' });

        if (upsertErr) {
            throw new Error(upsertErr.message || 'Failed to save payment settings');
        }

        // 3. Update local caches for POS & billing checkout screens
        localStorage.setItem(`salon_payment_settings_${companyId}_${branchId}`, JSON.stringify(payload));
        localStorage.setItem(`salon_payment_settings_${companyId}`, JSON.stringify(payload));
        if (qrUrl) {
            localStorage.setItem(`salon_upi_qr_${companyId}_${branchId}`, qrUrl);
        } else {
            localStorage.removeItem(`salon_upi_qr_${companyId}_${branchId}`);
        }

        selectedQrFile = null;
        initialQrUrl = currentQrUrl;
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
        showToast('Please select a valid image file (PNG, JPG, WEBP).', 'error');
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

export function cancelPaymentSettings() {
    if (typeof window.isDirty !== 'undefined') {
        window.isDirty = false;
    }
    document.getElementById('savebar')?.classList.remove('visible');
    loadPaymentSettings(currentBranchId);
}

// ── Branch Switcher Listener ────────────────────────────────────────────────
function initBranchSwitcher() {
    const select = document.getElementById('branchSelect');
    if (!select) return;

    select.addEventListener('change', (e) => {
        const selectedBranch = e.target.value;
        if (selectedBranch && selectedBranch !== 'all' && selectedBranch !== currentBranchId) {
            localStorage.setItem('active_branch_id', selectedBranch);
            loadPaymentSettings(selectedBranch);
        }
    });

    // Also listen to storage events if branch changed in another tab
    window.addEventListener('storage', (e) => {
        if (e.key === 'active_branch_id' && e.newValue && e.newValue !== currentBranchId) {
            loadPaymentSettings(e.newValue);
        }
    });
}

// ── Global Window Exports ────────────────────────────────────────────────────
window.loadPaymentSettings = loadPaymentSettings;
window.savePaymentSettings = savePaymentSettings;
window.cancelPaymentSettings = cancelPaymentSettings;
window.removeQrCode = removeQrCode;
window.showToast = showToast;

// ── Auto-initialize ─────────────────────────────────────────────────────────
function setupEventListeners() {
    const qrInput = document.getElementById('qrFileInput');
    if (qrInput) {
        qrInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleQrFileSelect(file);
        });
    }
    initBranchSwitcher();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        setupEventListeners();
        await loadPaymentSettings();
    });
} else {
    setupEventListeners();
    loadPaymentSettings();
}
