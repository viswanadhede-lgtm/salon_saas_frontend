/**
 * rebook-refund-modal.js
 * Shared modal component for Cancelled and No-Show bookings.
 * 
 * Works across all pages (bookings.html, no-shows-cancellations.html, etc.).
 * Exposes:
 *   window.openCancelledBookingModal(bookingIdOrObj)
 *   window.triggerRebook(bookingId, optBookingObj)
 *   window.openRefundModal(bookingId, optBookingObj)
 */

import { supabase } from '../lib/supabase.js';

let activeRefundBookingId = null;
let activeRefundableAmount = 0;

function formatTime12(timeStr) {
    if (!timeStr) return '—';
    try {
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
        return `${String(displayH).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
    } catch {
        return timeStr;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(`${dateStr}T00:00:00`);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.branch?.branch_id || ctx.branch?.id || localStorage.getItem('branch_id') || null;
    } catch { return localStorage.getItem('branch_id') || null; }
}

// ── Inject Modals if not present ─────────────────────────────────────────────
function ensureModalsInjected() {
    // 1. Cancelled / No-show Booking Modal
    if (!document.getElementById('cancelledBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="cancelledBookingModal" style="z-index:10003;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:860px !important;max-width:94vw !important;background:#ffffff;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
                <!-- Header -->
                <div style="padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div>
                        <h2 id="cbmModalTitle" style="font-size:1.15rem;font-weight:700;color:#0f172a;margin:0;">Cancelled Booking</h2>
                        <p id="cbmModalSubtitle" style="font-size:0.82rem;color:#64748b;margin:2px 0 0 0;">Review details and choose your next action.</p>
                    </div>
                    <button id="btnCloseCancelledBookingModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2-Column Layout -->
                <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;padding:24px;flex:1;overflow-y:auto;background:#f8fafc;" id="cbmBodyGrid">

                    <!-- LEFT: Booking Details -->
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:14px;">
                        <!-- ID + Badges -->
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px dashed #e2e8f0;padding-bottom:12px;">
                            <div>
                                <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Booking ID</div>
                                <div id="cbmId" style="font-family:monospace;font-size:1rem;font-weight:700;color:#1e293b;margin-top:2px;">#--------</div>
                            </div>
                            <div style="text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                                <span id="cbmStatusBadge" style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:#991b1b;background:#fee2e2;">Cancelled</span>
                                <div id="cbmPaymentBadge"></div>
                            </div>
                        </div>

                        <!-- Customer & Appointment -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #f1f5f9;">
                            <div>
                                <div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Customer</div>
                                <div id="cbmCustomer" style="font-size:0.88rem;font-weight:600;color:#0f172a;margin-top:2px;">—</div>
                                <div id="cbmPhone" style="font-size:0.78rem;color:#64748b;">—</div>
                            </div>
                            <div>
                                <div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Original Appointment</div>
                                <div id="cbmDate" style="font-size:0.86rem;font-weight:600;color:#334155;margin-top:2px;">—</div>
                                <div id="cbmTime" style="font-size:0.78rem;color:#64748b;">—</div>
                            </div>
                        </div>

                        <!-- Services List -->
                        <div>
                            <div style="font-size:0.72rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Service Details</div>
                            <div id="cbmServicesList" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"></div>
                        </div>

                        <!-- Total -->
                        <div style="margin-top:auto;padding-top:12px;border-top:1px dashed #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:0.85rem;font-weight:600;color:#64748b;">Total Amount</span>
                            <span id="cbmTotal" style="font-size:1.2rem;font-weight:700;color:#0f172a;">₹0</span>
                        </div>
                    </div>

                    <!-- RIGHT: Action Buttons (Matches Screenshot 1 & 2 Wireframe) -->
                    <div style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">

                        <div style="display:flex;flex-direction:column;gap:14px;flex:1;">
                            <!-- Refund Box — only shown when payment was made (Screenshot 2) -->
                            <div id="cbmRefundSection" style="display:none;">
                                <div style="background:#ffffff;border:1px solid #fecdd3;border-radius:12px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;">
                                    <div style="width:40px;height:40px;border-radius:50%;background:#fff1f2;display:flex;align-items:center;justify-content:center;color:#e11d48;">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;color:#0f172a;font-size:0.88rem;">Process Refund</div>
                                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">Return payment to customer</div>
                                    </div>
                                    <button type="button" id="btnCbmRefund"
                                        style="width:100%;padding:9px 14px;background:#e11d48;color:#ffffff;border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;box-shadow:0 1px 2px rgba(225,29,72,0.2);"
                                        onmouseover="this.style.background='#be123c'" onmouseout="this.style.background='#e11d48'">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>
                                        Refund
                                    </button>
                                </div>
                            </div>

                            <!-- Rebook Box — Big Button (Always shown) -->
                            <div id="cbmRebookSection" style="background:#ffffff;border:1px solid #c7d2fe;border-radius:12px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;flex:1;justify-content:center;">
                                <div style="width:44px;height:44px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;color:#4f46e5;">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                </div>
                                <div>
                                    <div style="font-weight:600;color:#0f172a;font-size:0.92rem;">Rebook Appointment</div>
                                    <div style="font-size:0.74rem;color:#64748b;margin-top:2px;">Create a new appointment with prefilled details</div>
                                </div>
                                <button type="button" id="btnCbmRebook"
                                    style="width:100%;padding:11px 14px;background:#4f46e5;color:#ffffff;border:none;border-radius:8px;font-size:0.88rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s;box-shadow:0 2px 4px rgba(79,70,229,0.25);"
                                    onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                    Rebook
                                </button>
                            </div>
                        </div>

                        <!-- Close Button Box (Bottom right) -->
                        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                            <button type="button" id="btnCbmClose"
                                style="width:100%;padding:9px 14px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;"
                                onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                                Close
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>`);

        const modal = document.getElementById('cancelledBookingModal');
        const closeModal = () => modal?.classList.remove('active');
        document.getElementById('btnCloseCancelledBookingModal')?.addEventListener('click', closeModal);
        document.getElementById('btnCbmClose')?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 2. Refund Modal
    if (!document.getElementById('refundBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundBookingModal" style="z-index:10005;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:420px;max-width:95vw;background:#fff;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;">
                <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h2 style="font-size:1.15rem;font-weight:700;color:#e11d48;margin:0;">Process Refund</h2>
                        <p class="subtitle" id="refundModalSubtitle" style="font-size:0.8rem;color:#64748b;margin:2px 0 0 0;">Loading details...</p>
                    </div>
                    <button class="modal-close" id="btnCloseRefundModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:4px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:12px; padding:16px; margin-bottom:18px; display:flex; flex-direction:column; gap:6px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.82rem; color:#9f1239; font-weight:600; text-transform:uppercase; letter-spacing:0.03em;">Refundable Amount</span>
                            <span style="font-size:1.3rem; color:#e11d48; font-weight:700;" id="refundAmountDisplay">₹0</span>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:14px;">
                        <label class="form-label" style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Payment Method Used</label>
                        <input type="text" id="refundMethodDisplay" class="form-input" readonly style="background:#f8fafc; cursor:not-allowed;font-size:0.88rem;">
                    </div>
                    <div class="form-group" style="margin-bottom:6px;">
                        <label class="form-label" style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:4px;">Refund Note (Optional)</label>
                        <textarea id="refundNote" class="form-input" placeholder="e.g. Cancelled booking refund issued to customer..." style="min-height:75px;font-size:0.85rem;resize:vertical;"></textarea>
                    </div>
                </div>
                <div class="modal-footer" style="padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;background:#f8fafc;">
                    <button type="button" class="btn btn-secondary" id="btnCancelRefund" style="padding:8px 16px;font-size:0.85rem;font-weight:600;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;">Cancel</button>
                    <button type="button" class="btn btn-primary" id="btnConfirmRefund" style="padding:8px 18px;font-size:0.85rem;font-weight:600;border-radius:6px;background:#e11d48; border-color:#e11d48;color:#fff;cursor:pointer;">Issue Refund</button>
                </div>
            </div>
        </div>`);

        const refModal = document.getElementById('refundBookingModal');
        const closeRefModal = () => refModal?.classList.remove('active');
        document.getElementById('btnCloseRefundModal')?.addEventListener('click', closeRefModal);
        document.getElementById('btnCancelRefund')?.addEventListener('click', closeRefModal);
        document.getElementById('btnConfirmRefund')?.addEventListener('click', window.processRefund);
        refModal?.addEventListener('click', (e) => {
            if (e.target === refModal) closeRefModal();
        });
    }
}

// ── Open Cancelled / No-show Modal ───────────────────────────────────────────
window.openCancelledBookingModal = async function(bookingIdOrObj) {
    ensureModalsInjected();

    let b = null;
    let bookingId = '';

    if (typeof bookingIdOrObj === 'object' && bookingIdOrObj !== null) {
        b = bookingIdOrObj;
        bookingId = b.booking_id || b.raw_id || b.id || '';
    } else {
        bookingId = String(bookingIdOrObj || '');
        // Check window.liveBookingsData or todaysBookingsData
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === bookingId.toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === bookingId.toLowerCase());
        }
        // If not found in memory, fetch from Supabase
        if (!b) {
            try {
                const { data } = await supabase
                    .from('bookings_for_business_transaction')
                    .select('*')
                    .eq('booking_id', bookingId)
                    .maybeSingle();
                if (data) b = data;
            } catch (err) {
                console.error('[RebookRefundModal] Failed to fetch booking:', err);
            }
        }
    }

    if (!b) {
        console.warn('[RebookRefundModal] Booking not found for ID:', bookingId);
        return;
    }

    const el = (id) => document.getElementById(id);

    // Dynamic Title & Status Badge based on status (No-show vs Cancelled)
    const rawStatus = (b.status || '').toLowerCase().trim();
    const isNoShow = ['no-show', 'noshow', 'no_show'].includes(rawStatus);

    if (el('cbmModalTitle')) {
        el('cbmModalTitle').textContent = isNoShow ? 'No-Show Booking' : 'Cancelled Booking';
    }
    if (el('cbmModalSubtitle')) {
        el('cbmModalSubtitle').textContent = isNoShow 
            ? 'Review no-show appointment details and choose your next action.' 
            : 'Review cancelled appointment details and choose your next action.';
    }

    if (el('cbmStatusBadge')) {
        if (isNoShow) {
            el('cbmStatusBadge').textContent = 'No-show';
            el('cbmStatusBadge').style.background = '#fee2e2';
            el('cbmStatusBadge').style.color = '#991b1b';
        } else {
            el('cbmStatusBadge').textContent = 'Cancelled';
            el('cbmStatusBadge').style.background = '#fef9c3';
            el('cbmStatusBadge').style.color = '#92400e';
        }
    }

    // Booking ID
    if (el('cbmId')) {
        el('cbmId').textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();
    }

    // Customer
    const custName = b.customer_name || b.customer || 'Walk-in Customer';
    const custPhone = b.customer_phone || b.phone || '—';
    if (el('cbmCustomer')) el('cbmCustomer').textContent = custName;
    if (el('cbmPhone'))    el('cbmPhone').textContent    = custPhone;

    // Date & Time
    const dateVal = b.booking_date || '';
    const timeVal = b.start_time || b.time || '';
    if (el('cbmDate')) el('cbmDate').textContent = formatDate(dateVal);
    if (el('cbmTime')) el('cbmTime').textContent = formatTime12(timeVal.slice(0, 5));

    // Payment Status Badge
    let payRaw = (b.payment_status || b.payment || '').toLowerCase();
    if (el('cbmPaymentBadge')) {
        const payLabel = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : 'Pending';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[payRaw] || { color: '#475569', bg: '#f1f5f9' };
        el('cbmPaymentBadge').innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Services list
    const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name || b.service])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name || b.staff])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.final_amount ?? b.total_price ?? b.price ?? 0];

    if (el('cbmServicesList')) {
        let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
            </tr></thead><tbody>`;
        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                const p = prices[i] !== undefined ? prices[i] : (prices[0] || 0);
                html += `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:9px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:9px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:9px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `<tr><td style="padding:9px 12px;font-weight:500;color:#1e293b;">${b.service_name || b.service || 'Salon Service'}</td>
                <td style="padding:9px 12px;color:#64748b;">${b.staff_name || b.staff || '—'}</td>
                <td style="padding:9px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.final_amount ?? b.total_price ?? b.price ?? 0).toLocaleString('en-IN')}</td></tr>`;
        }
        html += `</tbody></table>`;
        el('cbmServicesList').innerHTML = html;
    }

    // Total Amount
    if (el('cbmTotal')) {
        const rawTot = b.final_amount ?? b.total_price ?? b.price ?? (typeof b.amount === 'string' ? b.amount.replace(/[^0-9]/g, '') : b.amount) ?? 0;
        el('cbmTotal').textContent = '₹' + Number(rawTot).toLocaleString('en-IN');
    }

    // Check payment status from both booking object and transactions
    let isPaid = ['paid', 'partial'].includes(payRaw);
    if (el('cbmRefundSection')) el('cbmRefundSection').style.display = isPaid ? 'block' : 'none';

    // Check transactions table asynchronously to guarantee accuracy
    try {
        const { data: txs } = await supabase
            .from('business_transactions')
            .select('amount, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');
        if (txs && txs.some(t => (t.status || '').toLowerCase().trim() === 'paid')) {
            isPaid = true;
            if (el('cbmRefundSection')) el('cbmRefundSection').style.display = 'block';
        }
    } catch(e) { /* ignore */ }

    // Wire Rebook button
    const btnRebook = el('btnCbmRebook');
    if (btnRebook) {
        const newBtn = btnRebook.cloneNode(true);
        btnRebook.parentNode.replaceChild(newBtn, btnRebook);
        newBtn.addEventListener('click', async () => {
            el('cancelledBookingModal')?.classList.remove('active');
            await window.triggerRebook(bookingId, b);
        });
    }

    // Wire Refund button
    const btnRefund = el('btnCbmRefund');
    if (btnRefund) {
        const newBtn = btnRefund.cloneNode(true);
        btnRefund.parentNode.replaceChild(newBtn, btnRefund);
        newBtn.addEventListener('click', () => {
            el('cancelledBookingModal')?.classList.remove('active');
            window.openRefundModal(bookingId, b);
        });
    }

    // Show modal
    el('cancelledBookingModal')?.classList.add('active');
};

// ── Trigger Rebook Prefill ───────────────────────────────────────────────────
window.triggerRebook = async function(bookingId, optBookingObj) {
    let b = optBookingObj;
    if (!b) {
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
    }

    // Fetch customer email if missing
    let cEmail = (b && (b.customer_email || b.customer_mail)) || '';
    const custId = (b && b.customer_id) || '';
    if (!cEmail && custId) {
        try {
            const { data } = await supabase.from('customers').select('customer_email').eq('customer_id', custId).limit(1).single();
            if (data && data.customer_email) cEmail = data.customer_email;
        } catch(e) { console.error('Failed to fetch customer email', e); }
    }

    let serviceIds = String((b && (b.service_id || b.service_ids)) || '').split(',').map(s => s.trim()).filter(Boolean);
    let staffIds   = String((b && (b.staff_id || b.staff_ids)) || '').split(',').map(s => s.trim()).filter(Boolean);

    // If serviceIds empty, fetch from bookings table
    if (serviceIds.length === 0 && bookingId) {
        try {
            const { data: rows } = await supabase.from('bookings').select('service_id, package_id, staff_id').eq('booking_id', bookingId);
            if (rows && rows.length > 0) {
                serviceIds = rows.map(r => r.service_id || r.package_id).filter(Boolean);
                staffIds   = rows.map(r => r.staff_id).filter(Boolean);
            }
        } catch(e) { console.error('Failed to fetch booking items for rebook', e); }
    }

    if (window.openAndPrefillBooking) {
        // Prefill customer & services, leaving date and time for user to pick!
        await window.openAndPrefillBooking({
            customerId: custId,
            name:       (b && (b.customer_name || b.customer)) || '',
            phone:      (b && (b.customer_phone || b.phone)) || '',
            email:      cEmail,
            serviceIds,
            staffIds,
            notes:      (b && b.notes) || ''
        });
    } else {
        const btnNewBooking = document.getElementById('btnNewBooking') || document.getElementById('btnNewBookingPage');
        if (btnNewBooking) btnNewBooking.click();
    }
};

// ── Open Refund Modal ────────────────────────────────────────────────────────
window.openRefundModal = async function(bookingId, optBookingObj) {
    ensureModalsInjected();

    activeRefundBookingId = bookingId;
    let b = optBookingObj;
    if (!b) {
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
    }

    const modal = document.getElementById('refundBookingModal');
    const subtitle = document.getElementById('refundModalSubtitle');
    const amountDisp = document.getElementById('refundAmountDisplay');
    const methodDisp = document.getElementById('refundMethodDisplay');
    const noteField = document.getElementById('refundNote');

    if (subtitle) {
        subtitle.textContent = `${(b && (b.customer_name || b.customer)) || 'Customer'} • ${(b && (b.service_name || b.service)) || 'Service'}`;
    }
    if (amountDisp) amountDisp.textContent = 'Calculating...';
    if (methodDisp) methodDisp.value = 'Loading...';
    if (noteField) noteField.value = '';

    modal?.classList.add('active');

    try {
        // Fetch transactions for this booking
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');

        if (error) throw error;

        // Sum up paid transactions and subtract refunded
        activeRefundableAmount = (data || []).reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            if (status === 'paid') return sum + val;
            if (status === 'refunded') return sum - val;
            return sum;
        }, 0);

        // Fallback if no transactions recorded yet but booking was marked paid
        if (activeRefundableAmount <= 0 && b && ['paid', 'partial'].includes((b.payment_status || b.payment || '').toLowerCase())) {
            const rawTot = b.final_amount ?? b.total_price ?? b.price ?? 0;
            activeRefundableAmount = Number(rawTot);
        }

        if (activeRefundableAmount < 0) activeRefundableAmount = 0;

        if (amountDisp) amountDisp.textContent = `₹${activeRefundableAmount.toLocaleString('en-IN')}`;

        const lastMethod = data && data.length > 0 ? data[data.length - 1].payment_method : 'Cash';
        if (methodDisp) methodDisp.value = (lastMethod || 'Cash').toUpperCase();

        const confirmBtn = document.getElementById('btnConfirmRefund');
        if (activeRefundableAmount <= 0) {
            if (amountDisp) amountDisp.style.color = '#94a3b8';
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Nothing to Refund';
            }
        } else {
            if (amountDisp) amountDisp.style.color = '#e11d48';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Issue Refund';
            }
        }
    } catch (err) {
        console.error('[Refund] Error calculating refund amount:', err);
        if (amountDisp) {
            amountDisp.textContent = 'Error';
            amountDisp.style.color = '#ef4444';
        }
    }
};

// ── Process Refund Submission ────────────────────────────────────────────────
window.processRefund = async function() {
    if (!activeRefundBookingId || activeRefundableAmount <= 0) return;

    const btn = document.getElementById('btnConfirmRefund');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();
        const note = document.getElementById('refundNote')?.value.trim() || '';

        const { error } = await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: activeRefundBookingId,
                reference_type: 'booking',
                amount: Math.abs(activeRefundableAmount),
                currency: 'INR',
                payment_method: (document.getElementById('refundMethodDisplay')?.value || 'cash').toLowerCase(),
                status: 'refunded',
                notes: note || 'Refund processed for cancelled / no-show booking',
                paid_at: new Date().toISOString()
            });

        if (error) throw error;

        document.getElementById('refundBookingModal')?.classList.remove('active');
        if (window.toast) {
            window.toast('✓ Refund processed successfully');
        } else {
            alert('Refund processed successfully');
        }

        // Trigger refresh if pages have listeners
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId: activeRefundBookingId, amount: -activeRefundableAmount }
        }));

        if (typeof window.fetchBookings === 'function') window.fetchBookings();
        if (typeof window.initPage === 'function') window.initPage();

    } catch (err) {
        console.error('[Refund] Failed to process refund:', err);
        alert('Failed to process refund: ' + (err.message || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = 'Issue Refund';
    }
};

// Auto-inject modals on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalsInjected);
} else {
    ensureModalsInjected();
}
