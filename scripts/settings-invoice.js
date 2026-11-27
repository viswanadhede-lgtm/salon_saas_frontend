/**
 * settings-invoice.js
 * Invoice Settings tab — print format picker + live preview.
 * LHS: 3 format cards (A4 / Thermal 80mm / Thermal 58mm)
 * RHS: live paper preview that updates on selection
 */

(function () {
    'use strict';

    const FORMATS = {
        a4:         { label: 'A4 Invoice',    desc: 'Full-page professional invoice (210 × 297 mm)', previewLabel: 'A4 Invoice Sample' },
        thermal_80: { label: 'Thermal 80mm',  desc: 'Standard thermal receipt printer (80mm roll)',  previewLabel: 'Thermal 80mm Sample' },
        thermal_58: { label: 'Thermal 58mm',  desc: 'Compact thermal receipt printer (58mm roll)',   previewLabel: 'Thermal 58mm Sample' },
    };

    let currentFormat = 'a4';
    let savedFormat   = 'a4';
    let companyId     = null;
    let branchId      = null;

    // ── Sample data shown in preview ──────────────────────────
    const SAMPLE = {
        bizName:   'Lumina Grand Spa',
        branch:    'Main Branch',
        address:   '12, MG Road, Bengaluru - 560001',
        phone:     '+91 98765 43210',
        gstin:     '29AABCT1332L1Z5',
        invNo:     'INV-1001',
        invDate:   '27 Nov 2026',
        customer:  'Priya Sharma',
        custPhone: '+91 90001 23456',
        items: [
            { name: 'Deep Tissue Massage',  qty: 1, price: 1200 },
            { name: 'Hair Spa Treatment',   qty: 1, price:  800 },
            { name: 'Manicure + Pedicure',  qty: 1, price:  600 },
        ],
        discount:  200,
        taxRate:   18,
        payMethod: 'UPI',
        footer:    'Thank you for visiting us! We look forward to seeing you again.',
    };

    function calcTotals(sample) {
        const subtotal = sample.items.reduce((s, i) => s + i.price * i.qty, 0);
        const discounted = subtotal - sample.discount;
        const tax = Math.round(discounted * sample.taxRate / 100);
        const total = discounted + tax;
        return { subtotal, tax, total };
    }

    // ── Preview Renderers ──────────────────────────────────────

    function renderA4(s) {
        const { subtotal, tax, total } = calcTotals(s);
        const rows = s.items.map(i => `
            <tr>
                <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;">${i.name}</td>
                <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.qty}</td>
                <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">₹${i.price.toLocaleString('en-IN')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">₹${(i.qty * i.price).toLocaleString('en-IN')}</td>
            </tr>`).join('');

        return `
        <div style="width:100%;background:#fff;border-radius:8px;box-shadow:0 2px 16px rgba(0,0,0,0.10);font-family:'Inter',sans-serif;font-size:12px;color:#1e293b;overflow:hidden;">
            <!-- Header -->
            <div style="background:#1e3a8a;padding:20px 24px 16px;color:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-size:17px;font-weight:700;letter-spacing:-0.3px;">${s.bizName}</div>
                        <div style="font-size:10px;opacity:0.8;margin-top:2px;">${s.branch}</div>
                        <div style="font-size:10px;opacity:0.75;margin-top:6px;line-height:1.5;">${s.address}<br>${s.phone}</div>
                        <div style="font-size:9.5px;opacity:0.65;margin-top:4px;">GSTIN: ${s.gstin}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:10px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;">Invoice</div>
                        <div style="font-size:16px;font-weight:700;margin-top:2px;">${s.invNo}</div>
                        <div style="font-size:10px;opacity:0.75;margin-top:4px;">${s.invDate}</div>
                    </div>
                </div>
            </div>
            <!-- Bill To -->
            <div style="padding:14px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;">
                <div>
                    <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Bill To</div>
                    <div style="font-weight:600;margin-top:3px;">${s.customer}</div>
                    <div style="color:#64748b;margin-top:1px;">${s.custPhone}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Payment</div>
                    <div style="font-weight:600;margin-top:3px;">${s.payMethod}</div>
                    <div style="color:#16a34a;margin-top:1px;font-size:11px;font-weight:600;">● Paid</div>
                </div>
            </div>
            <!-- Items table -->
            <div style="padding:0 24px;">
                <table style="width:100%;border-collapse:collapse;margin-top:14px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service</th>
                            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
                            <th style="padding:7px 8px;text-align:right;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
                            <th style="padding:7px 8px;text-align:right;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <!-- Totals -->
            <div style="padding:12px 24px 0;">
                <div style="display:flex;justify-content:flex-end;">
                    <div style="width:220px;">
                        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#64748b;"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#64748b;"><span>Discount</span><span>− ₹${s.discount.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#64748b;"><span>GST ${s.taxRate}%</span><span>₹${tax.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1e3a8a;margin-top:4px;font-weight:700;font-size:13px;color:#1e3a8a;"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
                    </div>
                </div>
            </div>
            <!-- Footer -->
            <div style="margin:14px 24px 20px;padding:12px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #3b82f6;font-size:10.5px;color:#475569;line-height:1.5;">${s.footer}</div>
        </div>`;
    }

    function renderThermal(s, width) {
        const { subtotal, tax, total } = calcTotals(s);
        const isNarrow = (width === 58);
        const px = isNarrow ? 220 : 280;
        const rows = s.items.map(i => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #d1d5db;">
                <span style="max-width:${isNarrow?'130px':'175px'};word-break:break-word;">${i.name}</span>
                <span style="white-space:nowrap;">₹${(i.qty * i.price).toLocaleString('en-IN')}</span>
            </div>`).join('');

        return `
        <div style="width:${px}px;background:#fff;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.12);font-family:'Courier New',monospace;font-size:${isNarrow?'10':'11'}px;color:#111;padding:16px 14px;position:relative;">
            <!-- Perforation top -->
            <div style="border-top:2px dashed #d1d5db;margin-bottom:12px;"></div>
            <!-- Header -->
            <div style="text-align:center;margin-bottom:10px;">
                <div style="font-size:${isNarrow?'12':'13'}px;font-weight:700;letter-spacing:1px;">${s.bizName.toUpperCase()}</div>
                <div style="font-size:9px;color:#555;margin-top:2px;">${s.address}</div>
                <div style="font-size:9px;color:#555;">${s.phone}</div>
                <div style="font-size:9px;color:#555;">GSTIN: ${s.gstin}</div>
            </div>
            <div style="border-top:1px solid #111;border-bottom:1px solid #111;padding:5px 0;margin-bottom:8px;text-align:center;font-weight:700;font-size:9px;letter-spacing:0.5px;">RECEIPT</div>
            <!-- Invoice meta -->
            <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:8px;">
                <span>${s.invNo}</span><span>${s.invDate}</span>
            </div>
            <div style="font-size:9px;margin-bottom:8px;">Customer: <strong>${s.customer}</strong></div>
            <!-- Items -->
            <div style="border-top:1px dashed #d1d5db;padding-top:6px;margin-bottom:6px;">${rows}</div>
            <!-- Totals -->
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>Discount</span><span>-₹${s.discount.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>GST ${s.taxRate}%</span><span>₹${tax.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:2px solid #111;margin-top:3px;font-weight:700;font-size:${isNarrow?'11':'12'}px;"><span>TOTAL</span><span>₹${total.toLocaleString('en-IN')}</span></div>
            <!-- Payment -->
            <div style="text-align:center;margin:8px 0;font-size:9px;">Paid via ${s.payMethod} ✓</div>
            <div style="border-top:1px dashed #d1d5db;margin:8px 0;"></div>
            <!-- Footer -->
            <div style="text-align:center;font-size:9px;color:#555;line-height:1.5;">${s.footer}</div>
            <!-- Perforation bottom -->
            <div style="border-bottom:2px dashed #d1d5db;margin-top:12px;"></div>
        </div>`;
    }

    function renderPreview(format) {
        const container = document.getElementById('invoiceLivePreview');
        if (!container) return;

        let html = '';
        if (format === 'a4')              html = renderA4(SAMPLE);
        else if (format === 'thermal_80') html = renderThermal(SAMPLE, 80);
        else if (format === 'thermal_58') html = renderThermal(SAMPLE, 58);

        container.innerHTML = html;
    }

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
        const t = document.getElementById('toastNotification');
        if (!t) return;
        t.textContent = msg;
        t.style.background = type === 'error' ? '#ef4444' : '#22c55e';
        t.classList.add('visible');
        setTimeout(() => { t.classList.remove('visible'); t.style.background = ''; }, 3200);
    }

    // ── Format Cards UI ───────────────────────────────────────

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
                renderPreview(currentFormat);
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
        renderPreview(currentFormat);
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
        renderPreview(currentFormat);
        updateSaveBar();
    }

    // ── Init ──────────────────────────────────────────────────

    async function initInvoiceSettings() {
        getContext();
        renderFormatCards();
        renderPreview(currentFormat);
        await loadInvoiceFormat();

        document.getElementById('btnSaveInvoice')?.addEventListener('click', saveInvoiceFormat);
        document.getElementById('btnCancelInvoice')?.addEventListener('click', cancelInvoiceFormat);

        window.addEventListener('branch:changed', async (e) => {
            branchId = e.detail?.branchId || branchId;
            currentFormat = 'a4';
            savedFormat   = 'a4';
            await loadInvoiceFormat();
            updateSaveBar();
        });
    }

    window.loadInvoiceSettings   = loadInvoiceFormat;
    window.saveInvoiceSettings   = saveInvoiceFormat;
    window.cancelInvoiceSettings = cancelInvoiceFormat;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInvoiceSettings);
    } else {
        initInvoiceSettings();
    }
})();
