import { supabase } from './lib/supabase.js';

const companyId = localStorage.getItem('company_id');

// ── Load Payment Settings ───────────────────────────────────────────────────
export async function loadPaymentSettings() {
    if (!companyId) return;

    // Load from local storage cache first if available for fast UI populate
    try {
        const cached = localStorage.getItem('salon_payment_settings_' + companyId);
        if (cached) {
            const parsed = JSON.parse(cached);
            setChecked('pmCash',   parsed.accept_cash ?? true);
            setChecked('pmUpi',    parsed.accept_upi ?? true);
            setChecked('pmCard',   parsed.accept_cards ?? true);
            setChecked('pmOnline', parsed.accept_online ?? false);
            setVal('upiId',        parsed.upi_id || '');
            setVal('paymentNote',  parsed.payment_instructions || parsed.payment_note || '');
            setVal('defaultPaymentMethod', parsed.default_payment_method || 'cash');
        }
    } catch (e) {
        console.warn('[settings-payments] cache read warning:', e);
    }

    try {
        const { data, error } = await supabase
            .from('company_settings')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.warn('[settings-payments] load error from DB:', error);
        }

        if (data) {
            if (data.accept_cash !== undefined) setChecked('pmCash', data.accept_cash);
            if (data.accept_upi !== undefined) setChecked('pmUpi', data.accept_upi);
            if (data.accept_cards !== undefined) setChecked('pmCard', data.accept_cards);
            if (data.accept_online !== undefined) setChecked('pmOnline', data.accept_online);

            if (data.upi_id !== undefined) setVal('upiId', data.upi_id || '');
            const note = data.payment_instructions || data.payment_note;
            if (note !== undefined) setVal('paymentNote', note || '');

            if (data.default_payment_method) setVal('defaultPaymentMethod', data.default_payment_method);
        }

    } catch (err) {
        console.error('[settings-payments] unexpected load error:', err);
    }
}

// ── Save Payment Settings ───────────────────────────────────────────────────
window.savePaymentSettings = async function () {
    if (!companyId) {
        showToast('No company session. Please sign in.', 'error');
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        const payload = {
            accept_cash:            document.getElementById('pmCash')?.checked ?? true,
            accept_upi:             document.getElementById('pmUpi')?.checked ?? true,
            accept_cards:           document.getElementById('pmCard')?.checked ?? true,
            accept_online:          document.getElementById('pmOnline')?.checked ?? false,
            upi_id:                 getVal('upiId'),
            payment_instructions:   getVal('paymentNote'),
            default_payment_method: getVal('defaultPaymentMethod') || 'cash',
        };

        const { data: existing } = await supabase
            .from('company_settings')
            .select('company_id')
            .eq('company_id', companyId);

        let error;
        if (existing && existing.length > 0) {
            const res = await supabase.from('company_settings').eq('company_id', companyId).update(payload);
            error = res.error;
        } else {
            const res = await supabase.from('company_settings').insert({ company_id: companyId, ...payload });
            error = res.error;
        }

        if (error) {
            console.warn('[settings-payments] DB schema fallback, saving locally:', error.message);
        }

        // Save in localStorage cache as well
        localStorage.setItem('salon_payment_settings_' + companyId, JSON.stringify(payload));

        showToast('Payment settings saved successfully!', 'success');
        if (typeof isDirty !== 'undefined') isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-payments] save error:', err);
        showToast(err.message || 'Failed to save payment settings.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

document.addEventListener('DOMContentLoaded', () => loadPaymentSettings());
