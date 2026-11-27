/**
 * settings-invoice.js
 * Invoice Settings tab — print format preference only.
 * User picks A4, Thermal 80mm, or Thermal 58mm.
 * The invoice content/design is fixed and auto-filled from
 * branch profile + transaction data at print time.
 */

(function () {
    'use strict';

    const FORMATS = {
        a4:          { label: 'A4 Invoice',      desc: 'Full-page professional invoice (210 × 297 mm)' },
        thermal_80:  { label: 'Thermal 80mm',    desc: 'Standard thermal receipt printer (80mm roll)' },
        thermal_58:  { label: 'Thermal 58mm',    desc: 'Compact thermal receipt printer (58mm roll)' },
    };

    let currentFormat = 'a4';
    let savedFormat   = 'a4';
    let companyId     = null;
    let branchId      = null;

    // ── Helpers ───────────────────────────────────────────────

    function getContext() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id');
            branchId  = new URLSearchParams(window.location.search).get('branch_id')
                        || localStorage.getItem('active_branch_id')
                        || ctx.current_branch_id;
        } catch { /* silent */ }
    }

    function showInvoiceToast(msg, type = 'success') {
        // Re-use the global savebar toast if present, else noop
        const t = document.getElementById('toastNotification');
        if (!t) return;
        t.textContent = msg;
        t.style.background = type === 'error' ? '#ef4444' : '#22c55e';
        t.classList.add('visible');
        setTimeout(() => { t.classList.remove('visible'); t.style.background = ''; }, 3200);
    }

    // ── UI ────────────────────────────────────────────────────

    function renderFormatCards() {
        const wrap = document.getElementById('invoiceFormatCards');
        if (!wrap) return;

        wrap.innerHTML = Object.entries(FORMATS).map(([key, { label, desc }]) => `
            <label class="inv-format-card ${key === currentFormat ? 'selected' : ''}" data-format="${key}">
                <input type="radio" name="invoicePrintFormat" value="${key}" ${key === currentFormat ? 'checked' : ''} style="display:none;">
                <div class="inv-format-icon">
                    ${key === 'a4'
                        ? `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>`
                        : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`
                    }
                </div>
                <div class="inv-format-body">
                    <div class="inv-format-label">${label}</div>
                    <div class="inv-format-desc">${desc}</div>
                </div>
                ${key === currentFormat ? '<div class="inv-format-check"><svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>' : ''}
            </label>
        `).join('');

        wrap.querySelectorAll('.inv-format-card').forEach(card => {
            card.addEventListener('click', () => {
                currentFormat = card.dataset.format;
                renderFormatCards();
                updateSaveBar();
            });
        });
    }

    function updateSaveBar() {
        const bar = document.getElementById('invoiceSavebar');
        if (!bar) return;
        bar.classList.toggle('visible', currentFormat !== savedFormat);
        if (typeof feather !== 'undefined') feather.replace();
    }

    // ── Load ──────────────────────────────────────────────────

    async function loadInvoiceFormat() {
        if (!companyId || !branchId) return;
        try {
            const { data, error } = await supabase
                .schema('app')
                .from('invoice_settings')
                .select('print_format')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .maybeSingle();

            if (!error && data?.print_format?.layout) {
                currentFormat = data.print_format.layout;
                savedFormat   = data.print_format.layout;
            }
        } catch { /* fall back to default */ }
        renderFormatCards();
    }

    // ── Save ──────────────────────────────────────────────────

    async function saveInvoiceFormat() {
        if (!companyId || !branchId) {
            showInvoiceToast('No branch context found. Please reload.', 'error');
            return;
        }

        const btn = document.getElementById('btnSaveInvoice');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
        }

        try {
            const { data: rpcRes, error } = await supabase.rpc('save_invoice_settings_atomic', {
                p_company_id:   companyId,
                p_branch_id:    branchId,
                p_print_format: { layout: currentFormat }
            });

            if (error) throw new Error(error.message || 'Failed to save invoice settings');
            if (rpcRes?.success === false) throw new Error(rpcRes.message || 'Failed to save invoice settings');

            savedFormat = currentFormat;
            renderFormatCards();
            updateSaveBar();
            showInvoiceToast('✔ Invoice format saved!');
        } catch (err) {
            console.error('[settings-invoice] Save error:', err);
            showInvoiceToast(err.message || 'Failed to save. Please try again.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save';
                if (typeof feather !== 'undefined') feather.replace();
            }
        }
    }

    async function cancelInvoiceFormat() {
        currentFormat = savedFormat;
        renderFormatCards();
        updateSaveBar();
    }

    // ── Init ──────────────────────────────────────────────────

    async function initInvoiceSettings() {
        getContext();
        renderFormatCards();
        await loadInvoiceFormat();

        // Wire save/cancel buttons
        document.getElementById('btnSaveInvoice')?.addEventListener('click', saveInvoiceFormat);
        document.getElementById('btnCancelInvoice')?.addEventListener('click', cancelInvoiceFormat);

        // Reload when branch changes
        window.addEventListener('branch:changed', async (e) => {
            branchId = e.detail?.branchId || branchId;
            currentFormat = 'a4';
            savedFormat   = 'a4';
            await loadInvoiceFormat();
            updateSaveBar();
        });
    }

    // Expose for settings-branch.js to call on tab switch
    window.loadInvoiceSettings   = loadInvoiceFormat;
    window.saveInvoiceSettings   = saveInvoiceFormat;
    window.cancelInvoiceSettings = cancelInvoiceFormat;

    // Auto-init if already on the invoice pane
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInvoiceSettings);
    } else {
        initInvoiceSettings();
    }
})();
