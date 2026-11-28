/**
 * settings-invoice.js
 * Invoice Settings tab — print format picker + live preview.
 * LHS: 3 format cards (A4 / Thermal 80mm / Thermal 58mm)
 * RHS: preview box with revenue source tabs (Bookings / Products Sale / Memberships Sale)
 */

(function () {
    'use strict';

    const FORMATS = {
        a4:         { label: 'A4 Invoice',    desc: 'Full-page professional invoice (210 × 297 mm)', badgeLabel: 'A4 Invoice' },
        thermal_80: { label: 'Thermal 80mm',  desc: 'Standard thermal receipt printer (80mm roll)',  badgeLabel: 'Thermal 80mm' },
        thermal_58: { label: 'Thermal 58mm',  desc: 'Compact thermal receipt printer (58mm roll)',   badgeLabel: 'Thermal 58mm' },
    };

    const BIZ_INFO = {
        bizName: 'Lumina Grand Spa',
        branch:  'Main Branch',
        address: '12, MG Road, Bengaluru - 560001',
        phone:   '+91 98765 43210',
        gstin:   '29AABCT1332L1Z5',
    };

    const SAMPLES = {
        bookings: {
            sourceLabel:  'Bookings',
            docType:      'Invoice',
            receiptTitle: 'BOOKING RECEIPT',
            invNo:        'INV-1001',
            invDate:      '27 Nov 2026',
            refNote:      'Booking #BKG-4821',
            customer:     'Priya Sharma',
            custPhone:    '+91 90001 23456',
            itemColLabel: 'Service',
            items: [
                { name: 'Deep Tissue Massage', qty: 1, price: 1200 },
                { name: 'Hair Spa Treatment',  qty: 1, price:  800 },
                { name: 'Manicure + Pedicure', qty: 1, price:  600 },
            ],
            discount:  200,
            taxRate:   18,
            payMethod: 'UPI',
            footer:    'Thank you for visiting us! We look forward to seeing you again.',
        },
        products: {
            sourceLabel:  'Products Sale',
            docType:      'Retail Invoice',
            receiptTitle: 'POS RETAIL RECEIPT',
            invNo:        'INV-2048',
            invDate:      '27 Nov 2026',
            refNote:      'POS Order #POS-2048',
            customer:     'Rohan Verma',
            custPhone:    '+91 98450 11223',
            itemColLabel: 'Product',
            items: [
                { name: 'Argan Oil Hair Serum (100ml)', qty: 2, price: 650 },
                { name: 'Keratin Shampoo (250ml)',      qty: 1, price: 850 },
                { name: 'Hydrating Face Mist',          qty: 1, price: 450 },
            ],
            discount:  150,
            taxRate:   18,
            payMethod: 'Card',
            footer:    'Unopened retail products may be exchanged within 7 days with original receipt.',
        },
        memberships: {
            sourceLabel:  'Memberships Sale',
            docType:      'Membership Invoice',
            receiptTitle: 'MEMBERSHIP RECEIPT',
            invNo:        'INV-3012',
            invDate:      '27 Nov 2026',
            refNote:      'Valid 27 Nov 2026 – 26 Nov 2027',
            customer:     'Ananya Iyer',
            custPhone:    '+91 98802 77889',
            itemColLabel: 'Membership Plan',
            items: [
                { name: 'Lumina Gold Annual Plan (12 Mo)', qty: 1, price: 4999 },
                { name: 'Welcome Grooming Voucher Pack',   qty: 1, price:  500 },
            ],
            discount:  500,
            taxRate:   18,
            payMethod: 'UPI',
            footer:    'Welcome to Lumina Gold! Enjoy 20% off all services & priority booking for 1 year.',
        },
    };

    const MIN_ZOOM = 0.7;
    const MAX_ZOOM = 1.8;
    const ZOOM_STEP = 0.1;

    let currentFormat = 'a4';
    let savedFormat   = 'a4';
    let currentSource = 'bookings';
    let currentZoom   = 1;
    let companyId     = null;
    let branchId      = null;

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
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;">${i.name}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.qty}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">₹${i.price.toLocaleString('en-IN')}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">₹${(i.qty * i.price).toLocaleString('en-IN')}</td>
            </tr>`).join('');

        return `
        <div style="width:100%;max-width:540px;background:#fff;border-radius:8px;box-shadow:0 2px 14px rgba(15,23,42,0.09);border:1px solid #e2e8f0;font-family:'Inter',sans-serif;font-size:11px;color:#1e293b;overflow:hidden;">
            <!-- Header -->
            <div style="background:#1e3a8a;padding:13px 18px 12px;color:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                    <div>
                        <div style="font-size:15px;font-weight:700;letter-spacing:-0.3px;">${BIZ_INFO.bizName}</div>
                        <div style="font-size:9.5px;opacity:0.85;margin-top:1px;">${BIZ_INFO.branch} · ${BIZ_INFO.address}</div>
                        <div style="font-size:9px;opacity:0.75;margin-top:3px;">${BIZ_INFO.phone} · GSTIN: ${BIZ_INFO.gstin}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:9px;opacity:0.75;text-transform:uppercase;letter-spacing:0.8px;">${s.docType}</div>
                        <div style="font-size:14px;font-weight:700;margin-top:1px;">${s.invNo}</div>
                        <div style="font-size:9.5px;opacity:0.8;margin-top:2px;">${s.invDate}</div>
                    </div>
                </div>
            </div>
            <!-- Bill To -->
            <div style="padding:10px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div>
                    <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Bill To</div>
                    <div style="font-weight:600;margin-top:2px;">${s.customer} <span style="font-weight:400;color:#64748b;font-size:10px;">· ${s.custPhone}</span></div>
                    <div style="font-size:9.5px;color:#3b82f6;font-weight:500;margin-top:1px;">${s.refNote}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Payment</div>
                    <div style="font-weight:600;margin-top:2px;">${s.payMethod}</div>
                    <div style="color:#16a34a;margin-top:1px;font-size:10px;font-weight:600;">● Paid</div>
                </div>
            </div>
            <!-- Items table -->
            <div style="padding:0 18px;">
                <table style="width:100%;border-collapse:collapse;margin-top:10px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th scope="col" style="padding:5px 8px;text-align:left;font-size:9.5px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${s.itemColLabel}</th>
                            <th scope="col" style="padding:5px 8px;text-align:center;font-size:9.5px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
                            <th scope="col" style="padding:5px 8px;text-align:right;font-size:9.5px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
                            <th scope="col" style="padding:5px 8px;text-align:right;font-size:9.5px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <!-- Totals -->
            <div style="padding:8px 18px 0;">
                <div style="display:flex;justify-content:flex-end;">
                    <div style="width:205px;font-size:10.5px;">
                        <div style="display:flex;justify-content:space-between;padding:2px 0;color:#64748b;"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;color:#64748b;"><span>Discount</span><span>− ₹${s.discount.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;color:#64748b;"><span>GST ${s.taxRate}%</span><span>₹${tax.toLocaleString('en-IN')}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:5px 0 2px;border-top:2px solid #1e3a8a;margin-top:3px;font-weight:700;font-size:12px;color:#1e3a8a;"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
                    </div>
                </div>
            </div>
            <!-- Footer -->
            <div style="margin:10px 18px 14px;padding:8px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #3b82f6;font-size:10px;color:#475569;line-height:1.4;">${s.footer}</div>
        </div>`;
    }

    function renderThermal(s, width) {
        const { subtotal, tax, total } = calcTotals(s);
        const isNarrow = (width === 58);
        const px = isNarrow ? 225 : 290;
        const rows = s.items.map(i => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #d1d5db;gap:6px;">
                <span style="max-width:${isNarrow ? '132px' : '185px'};word-break:break-word;">${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}</span>
                <span style="white-space:nowrap;">₹${(i.qty * i.price).toLocaleString('en-IN')}</span>
            </div>`).join('');

        return `
        <div style="width:${px}px;background:#fff;border-radius:4px;box-shadow:0 2px 12px rgba(15,23,42,0.10);border:1px solid #e2e8f0;font-family:'Courier New',monospace;font-size:${isNarrow ? '10' : '11'}px;color:#111;padding:14px 13px;position:relative;">
            <!-- Perforation top -->
            <div style="border-top:2px dashed #d1d5db;margin-bottom:10px;"></div>
            <!-- Header -->
            <div style="text-align:center;margin-bottom:8px;">
                <div style="font-size:${isNarrow ? '11.5' : '12.5'}px;font-weight:700;letter-spacing:0.8px;">${BIZ_INFO.bizName.toUpperCase()}</div>
                <div style="font-size:8.5px;color:#555;margin-top:2px;">${BIZ_INFO.address}</div>
                <div style="font-size:8.5px;color:#555;">${BIZ_INFO.phone}</div>
                <div style="font-size:8.5px;color:#555;">GSTIN: ${BIZ_INFO.gstin}</div>
            </div>
            <div style="border-top:1px solid #111;border-bottom:1px solid #111;padding:4px 0;margin-bottom:7px;text-align:center;font-weight:700;font-size:8.5px;letter-spacing:0.5px;">${s.receiptTitle}</div>
            <!-- Invoice meta -->
            <div style="display:flex;justify-content:space-between;font-size:8.5px;margin-bottom:4px;">
                <span>${s.invNo}</span><span>${s.invDate}</span>
            </div>
            <div style="font-size:8.5px;margin-bottom:2px;">Customer: <strong>${s.customer}</strong></div>
            <div style="font-size:8.5px;color:#555;margin-bottom:7px;">${s.refNote}</div>
            <!-- Items -->
            <div style="border-top:1px dashed #d1d5db;padding-top:5px;margin-bottom:5px;">${rows}</div>
            <!-- Totals -->
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>Discount</span><span>-₹${s.discount.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:9px;"><span>GST ${s.taxRate}%</span><span>₹${tax.toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:2px solid #111;margin-top:3px;font-weight:700;font-size:${isNarrow ? '11' : '12'}px;"><span>TOTAL</span><span>₹${total.toLocaleString('en-IN')}</span></div>
            <!-- Payment -->
            <div style="text-align:center;margin:7px 0;font-size:9px;">Paid via ${s.payMethod} ✓</div>
            <div style="border-top:1px dashed #d1d5db;margin:7px 0;"></div>
            <!-- Footer -->
            <div style="text-align:center;font-size:8.5px;color:#555;line-height:1.45;">${s.footer}</div>
            <!-- Perforation bottom -->
            <div style="border-bottom:2px dashed #d1d5db;margin-top:10px;"></div>
        </div>`;
    }

    function applyZoom() {
        const frame  = document.getElementById('invZoomFrame');
        const scaler = document.getElementById('invZoomScaler');
        const paper  = scaler?.firstElementChild;

        updateZoomToolbarUI();

        if (!frame || !scaler || !paper) return;

        // Reset to unscaled 1x so intrinsic paper dimensions can be measured cleanly
        scaler.style.transform    = '';
        scaler.style.width        = '';
        frame.style.width         = '';
        frame.style.height        = '';
        frame.style.justifyContent = '';

        if (currentZoom !== 1) {
            const baseW = paper.offsetWidth;
            const baseH = paper.offsetHeight;
            if (baseW > 0 && baseH > 0) {
                frame.style.justifyContent = 'flex-start';
                scaler.style.width         = `${baseW}px`;
                scaler.style.transform     = `scale(${currentZoom})`;
                frame.style.width          = `${Math.round(baseW * currentZoom)}px`;
                frame.style.height         = `${Math.round(baseH * currentZoom)}px`;
            }
        }
    }

    function updateZoomToolbarUI() {
        const outBtn   = document.getElementById('invZoomOut');
        const resetBtn = document.getElementById('invZoomReset');
        const inBtn    = document.getElementById('invZoomIn');
        const pct      = Math.round(currentZoom * 100);

        if (resetBtn) {
            resetBtn.textContent = `${pct}%`;
            resetBtn.setAttribute('aria-label', pct === 100 ? 'Zoom level 100%' : `Zoom level ${pct}%, activate to reset to 100%`);
        }
        if (outBtn) {
            outBtn.setAttribute('aria-disabled', currentZoom <= MIN_ZOOM ? 'true' : 'false');
        }
        if (inBtn) {
            inBtn.setAttribute('aria-disabled', currentZoom >= MAX_ZOOM ? 'true' : 'false');
        }
    }

    function setZoom(nextZoom) {
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 10) / 10));
        if (clamped === currentZoom) return;
        currentZoom = clamped;
        applyZoom();
    }

    function initZoomToolbar() {
        const toolbar = document.getElementById('invZoomToolbar');
        if (!toolbar) return;

        const outBtn   = document.getElementById('invZoomOut');
        const resetBtn = document.getElementById('invZoomReset');
        const inBtn    = document.getElementById('invZoomIn');

        outBtn?.addEventListener('click', () => {
            if (outBtn.getAttribute('aria-disabled') === 'true') return;
            setZoom(currentZoom - ZOOM_STEP);
        });
        resetBtn?.addEventListener('click', () => setZoom(1));
        inBtn?.addEventListener('click', () => {
            if (inBtn.getAttribute('aria-disabled') === 'true') return;
            setZoom(currentZoom + ZOOM_STEP);
        });

        // Roving tabindex fallback only when native focusgroup is unsupported
        if (!('focusGroup' in HTMLElement.prototype)) {
            const items = Array.from(toolbar.querySelectorAll('button'));
            items.forEach((btn, idx) => { btn.tabIndex = idx === 0 ? 0 : -1; });

            toolbar.addEventListener('focusin', ({ target }) => {
                if (items.includes(target)) {
                    items.forEach((btn) => { btn.tabIndex = btn === target ? 0 : -1; });
                }
            });

            toolbar.addEventListener('keydown', (e) => {
                const currentIdx = items.indexOf(document.activeElement);
                if (currentIdx === -1) return;

                const rtl = getComputedStyle(toolbar).direction === 'rtl';
                const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1)
                           : e.key === 'ArrowLeft'  ? (rtl ? 1 : -1)
                           : 0;

                let nextIdx = null;
                if (step !== 0) nextIdx = (currentIdx + step + items.length) % items.length;
                else if (e.key === 'Home') nextIdx = 0;
                else if (e.key === 'End')  nextIdx = items.length - 1;

                if (nextIdx !== null) {
                    e.preventDefault();
                    items[nextIdx].focus();
                }
            });
        }

        document.getElementById('tab-invoice')?.addEventListener('click', () => {
            requestAnimationFrame(applyZoom);
        });

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (currentZoom === 1) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(applyZoom, 120);
        });

        updateZoomToolbarUI();
    }

    function renderPreview(format, source) {
        const scaler = document.getElementById('invZoomScaler') || document.getElementById('invoiceLivePreview');
        if (!scaler) return;

        const fmt    = format || currentFormat;
        const srcKey = SAMPLES[source] ? source : currentSource;
        const sample = SAMPLES[srcKey] || SAMPLES.bookings;

        let html = '';
        if (fmt === 'a4')              html = renderA4(sample);
        else if (fmt === 'thermal_80') html = renderThermal(sample, 80);
        else if (fmt === 'thermal_58') html = renderThermal(sample, 58);

        scaler.innerHTML = html;
        applyZoom();

        const badge = document.getElementById('invPreviewFormatBadge');
        if (badge && FORMATS[fmt]) {
            badge.textContent = FORMATS[fmt].badgeLabel;
        }
    }

    // ── Revenue Source Tabs (Bookings / Products Sale / Memberships Sale) ─

    function selectSourceTab(srcKey, moveFocus = false) {
        if (!SAMPLES[srcKey]) return;
        currentSource = srcKey;

        const tablist = document.getElementById('invSourceTabs');
        const panel   = document.getElementById('invoiceLivePreview');
        if (tablist) {
            const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
            let activeTabEl = null;
            tabs.forEach(tab => {
                const isSelected = tab.dataset.source === srcKey;
                tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                tab.tabIndex = isSelected ? 0 : -1;
                if (isSelected) {
                    activeTabEl = tab;
                    if (panel && tab.id) panel.setAttribute('aria-labelledby', tab.id);
                }
            });
            if (activeTabEl) {
                if (moveFocus) activeTabEl.focus();
                if (activeTabEl.offsetParent) {
                    activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }
            }
        }

        renderPreview(currentFormat, currentSource);
    }

    function initSourceTabs() {
        const tablist = document.getElementById('invSourceTabs');
        if (!tablist) return;

        const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
        tabs.forEach((tab, idx) => {
            tab.addEventListener('click', () => selectSourceTab(tab.dataset.source, false));
            tab.addEventListener('keydown', (e) => {
                let nextIdx = null;
                if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') nextIdx = 0;
                else if (e.key === 'End') nextIdx = tabs.length - 1;

                if (nextIdx !== null) {
                    e.preventDefault();
                    selectSourceTab(tabs[nextIdx].dataset.source, true);
                }
            });
        });

        selectSourceTab(currentSource, false);
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
                <input type="radio" class="inv-visually-hidden" name="invoicePrintFormat" value="${key}" ${key === currentFormat ? 'checked' : ''}>
                <div class="inv-format-icon" aria-hidden="true">
                    ${key === 'a4'
                        ? `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>`
                        : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`
                    }
                </div>
                <div class="inv-format-body">
                    <div class="inv-format-label">${label}</div>
                    <div class="inv-format-desc">${desc}</div>
                </div>
                ${key === currentFormat ? '<div class="inv-format-check" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>' : ''}
            </label>
        `).join('');

        wrap.querySelectorAll('input[name="invoicePrintFormat"]').forEach(input => {
            input.addEventListener('change', () => {
                currentFormat = input.value;
                renderFormatCards();
                renderPreview(currentFormat, currentSource);
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

            if (!error && data?.print_format) {
                // Sanitize: guard against stale jsonb-string values like '{"layout":"thermal_80"}'
                const raw = data.print_format;
                const valid = Object.keys(FORMATS); // ['a4', 'thermal_80', 'thermal_58']
                currentFormat = valid.includes(raw) ? raw : 'a4';
                savedFormat   = currentFormat;
            }
        } catch { /* fall back to default */ }
        renderFormatCards();
        renderPreview(currentFormat, currentSource);
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
                p_print_format: currentFormat
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
        renderPreview(currentFormat, currentSource);
        updateSaveBar();
    }

    // ── Init ──────────────────────────────────────────────────

    async function initInvoiceSettings() {
        getContext();
        initSourceTabs();
        initZoomToolbar();
        renderFormatCards();
        renderPreview(currentFormat, currentSource);
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
