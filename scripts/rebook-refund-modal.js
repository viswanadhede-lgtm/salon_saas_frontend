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

    // 2. Refund Modal (2-Column Premium Layout)
    const existingRefModal = document.getElementById('refundBookingModal');
    if (existingRefModal && !existingRefModal.querySelector('#rfBookingBadge')) {
        existingRefModal.remove();
    }

    if (!document.getElementById('refundBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundBookingModal" style="z-index:10005;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:920px;max-width:96vw;max-height:92vh;background:#fff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden;">
                <!-- Header -->
                <div class="modal-header" style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:42px;height:42px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;color:#e11d48;flex-shrink:0;">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                        </div>
                        <div>
                            <h2 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin:0;line-height:1.2;">Process Refund</h2>
                            <p class="subtitle" style="font-size:0.82rem;color:#64748b;margin:3px 0 0 0;">Review booking details and process the refund.</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btnCloseRefundModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2 Columns -->
                <div class="modal-body" style="padding:24px;overflow-y:auto;display:grid;grid-template-columns:1.15fr 1fr;gap:24px;background:#fff;flex:1;">
                    
                    <!-- LEFT COLUMN: 4 CARDS -->
                    <div style="display:flex;flex-direction:column;gap:14px;">
                        
                        <!-- CARD 1: Customer Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.88rem;font-weight:700;color:#0f172a;">Customer Details</span>
                                <button type="button" id="rfCustomerViewProfileBtn" style="background:none;border:none;color:#2563eb;font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">
                                    View Profile
                                </button>
                            </div>
                            <div style="display:flex;align-items:center;gap:14px;">
                                <div id="rfCustomerAvatar" style="width:44px;height:44px;border-radius:50%;background:#dbeafe;color:#1e40af;font-weight:700;font-size:0.95rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;">
                                    --
                                </div>
                                <div style="display:flex;flex-direction:column;gap:4px;overflow:hidden;flex:1;">
                                    <div id="rfCustomerName" style="font-weight:700;color:#0f172a;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Loading customer...</div>
                                    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                                        <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;color:#475569;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                            <span id="rfCustomerPhone">—</span>
                                        </span>
                                        <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;color:#475569;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                            <span id="rfCustomerEmail">—</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 2: Booking Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.88rem;font-weight:700;color:#0f172a;">Booking Details</span>
                                <span id="rfBookingBadge" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:20px;">Booking #—</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                                <!-- Date -->
                                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    </div>
                                    <div style="overflow:hidden;">
                                        <div style="font-size:0.72rem;color:#64748b;font-weight:500;">Date</div>
                                        <div id="rfBookingDate" style="font-size:0.84rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
                                    </div>
                                </div>
                                <!-- Time -->
                                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    </div>
                                    <div style="overflow:hidden;">
                                        <div style="font-size:0.72rem;color:#64748b;font-weight:500;">Time</div>
                                        <div id="rfBookingTime" style="font-size:0.84rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
                                    </div>
                                </div>
                                <!-- Booking Type -->
                                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    </div>
                                    <div style="overflow:hidden;">
                                        <div style="font-size:0.72rem;color:#64748b;font-weight:500;">Booking Type</div>
                                        <div id="rfBookingType" style="font-size:0.84rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Walk-In</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 3: Services in this Booking -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;">
                            <div style="font-size:0.88rem;font-weight:700;color:#0f172a;">Services in this Booking</div>
                            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;table-layout:fixed;">
                                    <thead>
                                        <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                                            <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;width:45%;">Service</th>
                                            <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;width:30%;">Staff</th>
                                            <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;width:25%;">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody id="rfServicesTableBody">
                                        <tr><td colspan="3" style="padding:14px;text-align:center;color:#94a3b8;">Loading services...</td></tr>
                                    </tbody>
                                    <tfoot>
                                        <tr style="border-top:1px solid #e2e8f0;background:#faf5ff;">
                                            <td colspan="2" style="padding:10px 12px;font-weight:700;color:#0f172a;">Total Paid</td>
                                            <td id="rfServicesTotal" style="padding:10px 12px;text-align:right;font-weight:800;color:#0f172a;font-size:0.9rem;">₹0</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <!-- CARD 4: Original Payment Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;">
                            <div style="font-size:0.88rem;font-weight:700;color:#0f172a;">Original Payment Details</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                <!-- Payment Method -->
                                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                                    </div>
                                    <div style="overflow:hidden;">
                                        <div style="font-size:0.72rem;color:#64748b;font-weight:500;">Payment Method</div>
                                        <div id="rfOrigMethod" style="font-size:0.84rem;font-weight:700;color:#0f172a;">—</div>
                                    </div>
                                </div>
                                <!-- Payment Date -->
                                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    </div>
                                    <div style="overflow:hidden;">
                                        <div style="font-size:0.72rem;color:#64748b;font-weight:500;">Payment Date</div>
                                        <div id="rfOrigDate" style="font-size:0.84rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
                                    </div>
                                </div>
                            </div>
                            <!-- Transaction ID row -->
                            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:10px;">
                                <div style="width:30px;height:30px;border-radius:6px;background:#f1f5f9;color:#64748b;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1;">
                                    <span style="font-size:0.75rem;color:#64748b;font-weight:600;">Transaction ID:</span>
                                    <span id="rfOrigTxnId" style="font-size:0.78rem;color:#0f172a;font-family:monospace;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: REFUND FORM CONTROLS -->
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        
                        <!-- Refund Amount Card -->
                        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:4px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.72rem;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.05em;">REFUND AMOUNT</span>
                                <span style="background:#ffe4e6;color:#e11d48;font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:20px;">Full Amount</span>
                            </div>
                            <div id="refundAmountDisplay" style="font-size:2rem;font-weight:800;color:#e11d48;margin:2px 0;">₹0</div>
                            <div style="font-size:0.78rem;color:#64748b;">Maximum refundable amount: <span id="rfMaxRefundText" style="font-weight:600;color:#475569;">₹0</span></div>
                        </div>

                        <!-- Refund Payment Method Select -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Refund Payment Method <span style="color:#ef4444;">*</span></label>
                            <select id="refundMethodSelect" class="form-input" style="height:44px;border-radius:10px;border:1px solid #cbd5e1;font-weight:500;font-size:0.88rem;width:100%;background:#fff;padding:0 12px;cursor:pointer;">
                                <option value="cash" selected>Cash</option>
                                <option value="card">Card</option>
                                <option value="upi">UPI</option>
                                <option value="bank_transfer">Bank Transfer</option>
                            </select>
                        </div>

                        <!-- Refund Reason Select -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Refund Reason <span style="color:#ef4444;">*</span></label>
                            <select id="refundReasonSelect" class="form-input" style="height:44px;border-radius:10px;border:1px solid #cbd5e1;font-weight:500;font-size:0.88rem;width:100%;background:#fff;padding:0 12px;cursor:pointer;">
                                <option value="" disabled selected>Select a reason</option>
                                <option value="Customer Request">Customer Request</option>
                                <option value="Booking Cancelled">Booking Cancelled</option>
                                <option value="Service Dissatisfaction">Service Dissatisfaction</option>
                                <option value="Staff Unavailable">Staff Unavailable</option>
                                <option value="Duplicate Payment">Duplicate Payment</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <!-- Additional Note -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Additional Note <span style="font-weight:400;color:#64748b;">(Optional)</span></label>
                            <textarea id="refundNote" placeholder="Enter any additional details about this refund..." style="min-height:85px;width:100%;border-radius:10px;border:1px solid #cbd5e1;font-size:0.85rem;padding:10px 12px;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>
                        </div>

                        <!-- Please Confirm Box -->
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;">
                            <div style="color:#2563eb;margin-top:1px;flex-shrink:0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </div>
                            <div>
                                <div style="font-size:0.82rem;font-weight:700;color:#1e3a8a;">Please confirm</div>
                                <div style="font-size:0.78rem;color:#3b82f6;margin-top:2px;line-height:1.4;">This will create a refund transaction and update the booking payment status to <strong>Refunded</strong>.</div>
                            </div>
                        </div>

                        <!-- Footer Buttons -->
                        <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:auto;padding-top:10px;">
                            <button type="button" class="btn btn-secondary" id="btnCancelRefund" style="height:44px;padding:0 22px;font-size:0.88rem;font-weight:600;border-radius:10px;background:#fff;border:1px solid #cbd5e1;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Cancel</button>
                            <button type="button" class="btn btn-primary" id="btnConfirmRefund" style="height:44px;padding:0 22px;font-size:0.88rem;font-weight:700;border-radius:10px;background:#e11d48;border:none;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 6px -1px rgba(225,29,72,0.25);transition:all 0.15s;" onmouseover="this.style.background='#be123c'" onmouseout="this.style.background='#e11d48'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                                <span>Issue Refund</span>
                            </button>
                        </div>

                    </div>
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
    modal?.classList.add('active');

    // UI Reset / Skeletons
    const shortId = String(bookingId || '').slice(0, 8).toUpperCase();
    const badgeEl = document.getElementById('rfBookingBadge');
    if (badgeEl) badgeEl.textContent = `Booking #${shortId}`;

    const custNameEl = document.getElementById('rfCustomerName');
    const custPhoneEl = document.getElementById('rfCustomerPhone');
    const custEmailEl = document.getElementById('rfCustomerEmail');
    const custAvatarEl = document.getElementById('rfCustomerAvatar');
    const viewProfBtn = document.getElementById('rfCustomerViewProfileBtn');

    if (custNameEl) custNameEl.textContent = 'Loading customer...';
    if (custPhoneEl) custPhoneEl.textContent = '—';
    if (custEmailEl) custEmailEl.textContent = '—';
    if (custAvatarEl) custAvatarEl.textContent = '--';

    const bDateEl = document.getElementById('rfBookingDate');
    const bTimeEl = document.getElementById('rfBookingTime');
    const bTypeEl = document.getElementById('rfBookingType');
    if (bDateEl) bDateEl.textContent = '—';
    if (bTimeEl) bTimeEl.textContent = '—';
    if (bTypeEl) bTypeEl.textContent = 'Walk-In';

    const servicesTbody = document.getElementById('rfServicesTableBody');
    const servicesTotalEl = document.getElementById('rfServicesTotal');
    if (servicesTbody) servicesTbody.innerHTML = '<tr><td colspan="3" style="padding:14px;text-align:center;color:#94a3b8;">Loading services...</td></tr>';
    if (servicesTotalEl) servicesTotalEl.textContent = '₹0';

    const origMethodEl = document.getElementById('rfOrigMethod');
    const origDateEl = document.getElementById('rfOrigDate');
    const origTxnEl = document.getElementById('rfOrigTxnId');
    if (origMethodEl) origMethodEl.textContent = '—';
    if (origDateEl) origDateEl.textContent = '—';
    if (origTxnEl) origTxnEl.textContent = '—';

    const amountDisp = document.getElementById('refundAmountDisplay');
    const maxRefundEl = document.getElementById('rfMaxRefundText');
    const methodSelect = document.getElementById('refundMethodSelect');
    const reasonSelect = document.getElementById('refundReasonSelect');
    const noteField = document.getElementById('refundNote');
    const confirmBtn = document.getElementById('btnConfirmRefund');

    if (amountDisp) amountDisp.textContent = 'Calculating...';
    if (maxRefundEl) maxRefundEl.textContent = '...';
    if (reasonSelect) reasonSelect.value = '';
    if (noteField) noteField.value = '';

    try {
        // Query DB for complete booking, service items, and payment transactions
        const [bftRes, bkRes, txRes] = await Promise.all([
            supabase.from('bookings_for_business_transaction').select('*').eq('booking_id', bookingId).maybeSingle(),
            supabase.from('bookings').select('*').eq('booking_id', bookingId),
            supabase.from('business_transactions').select('*').eq('reference_id', bookingId).eq('reference_type', 'booking').order('paid_at', { ascending: true })
        ]);

        const bft = bftRes?.data || {};
        const individualBookings = bkRes?.data || [];
        const transactions = txRes?.data || [];

        // 1. POPULATE CARD 1: Customer Details
        const custId = bft.customer_id || (b && b.customer_id) || '';
        let custName = bft.customer_name || (b && (b.customer_name || b.customer)) || 'Customer';
        let custPhone = bft.customer_phone || (b && (b.customer_phone || b.phone)) || '—';
        let custEmail = bft.customer_mail || (b && (b.customer_mail || b.customer_email || b.email)) || '—';

        // Attempt fresh lookup from customers table if details missing
        if (custId) {
            try {
                const { data: custRecord } = await supabase.from('customers').select('*').eq('customer_id', custId).maybeSingle();
                if (custRecord) {
                    if (!custName || custName === 'Customer') custName = custRecord.customer_name || custName;
                    if (!custPhone || custPhone === '—') custPhone = custRecord.customer_phone || custRecord.phone || '—';
                    if (!custEmail || custEmail === '—') custEmail = custRecord.customer_email || custRecord.email || '—';
                }
            } catch (cErr) {
                console.warn('[Refund] Customer lookup warning:', cErr);
            }
        }

        if (custNameEl) custNameEl.textContent = custName;
        if (custPhoneEl) custPhoneEl.textContent = custPhone;
        if (custEmailEl) custEmailEl.textContent = custEmail;

        const initials = custName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
        if (custAvatarEl) custAvatarEl.textContent = initials;

        if (viewProfBtn) {
            if (custId) {
                viewProfBtn.style.display = 'inline-flex';
                viewProfBtn.onclick = async (e) => {
                    e.preventDefault();
                    if (!window.viewCustomerProfile) {
                        try {
                            await import('./global-customer-profile-modal.js');
                        } catch {}
                    }
                    if (window.viewCustomerProfile) {
                        window.viewCustomerProfile(custId, custName);
                    }
                };
            } else {
                viewProfBtn.style.display = 'none';
            }
        }

        // 2. POPULATE CARD 2: Booking Details
        const rawDate = bft.booking_date || (b && (b.booking_date || b.raw_date)) || '';
        let formattedDate = '—';
        if (rawDate) {
            const dObj = new Date(rawDate + 'T00:00:00');
            formattedDate = dObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (bDateEl) bDateEl.textContent = formattedDate;

        const rawTime = bft.start_time || (b && (b.start_time || b.time)) || '';
        let formattedTime = '—';
        if (rawTime) {
            if (rawTime.includes('AM') || rawTime.includes('PM')) {
                formattedTime = rawTime;
            } else {
                const [hh, mm] = rawTime.split(':').map(Number);
                const ampm = hh >= 12 ? 'PM' : 'AM';
                const h12 = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
                formattedTime = `${String(h12).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')} ${ampm}`;
            }
        }
        if (bTimeEl) bTimeEl.textContent = formattedTime;

        const bookingType = bft.booking_type || (b && (b.booking_type || b.type)) || (individualBookings[0] && individualBookings[0].booking_type) || 'Walk-In';
        const prettyType = bookingType.charAt(0).toUpperCase() + bookingType.slice(1).toLowerCase();
        if (bTypeEl) bTypeEl.textContent = prettyType;

        // 3. POPULATE CARD 3: Services in this Booking
        let serviceItems = [];
        if (individualBookings.length > 0) {
            serviceItems = individualBookings.map(item => ({
                service: item.service_name || 'Service',
                staff: item.staff_name || 'Assigned',
                price: Number(item.price || 0)
            }));
        } else {
            const svcNames = (bft.service_name || (b && (b.service_name || b.service)) || 'Service').split(',').map(s => s.trim()).filter(Boolean);
            const staffNames = (bft.staff_name || (b && (b.staff_name || b.staff)) || 'Assigned').split(',').map(s => s.trim()).filter(Boolean);
            const rawTotalPrice = Number(bft.total_price || (b && (b.total_price || b.amount)) || 0);

            if (svcNames.length <= 1) {
                serviceItems = [{
                    service: svcNames[0] || 'Service',
                    staff: staffNames[0] || 'Assigned',
                    price: rawTotalPrice
                }];
            } else {
                const perItemPrice = Math.round(rawTotalPrice / svcNames.length);
                serviceItems = svcNames.map((svc, idx) => ({
                    service: svc,
                    staff: staffNames[idx] || staffNames[0] || 'Assigned',
                    price: idx === svcNames.length - 1 ? (rawTotalPrice - (perItemPrice * (svcNames.length - 1))) : perItemPrice
                }));
            }
        }

        const totalBookingPrice = serviceItems.reduce((acc, curr) => acc + curr.price, 0);

        if (servicesTbody) {
            servicesTbody.innerHTML = serviceItems.map(item => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:600;color:#0f172a;">${item.service}</td>
                    <td style="padding:10px 12px;color:#475569;">${item.staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${item.price.toLocaleString('en-IN')}</td>
                </tr>
            `).join('');
        }
        if (servicesTotalEl) servicesTotalEl.textContent = `₹${totalBookingPrice.toLocaleString('en-IN')}`;

        // 4. POPULATE CARD 4: Original Payment Details
        const paidTxs = transactions.filter(t => (t.status || '').toLowerCase().trim() === 'paid');
        const latestPaidTx = paidTxs[paidTxs.length - 1] || transactions[0] || null;

        let origMethod = latestPaidTx?.payment_method || (b && (b.payment_method || b.payment)) || 'Cash';
        origMethod = origMethod.charAt(0).toUpperCase() + origMethod.slice(1).toLowerCase();
        if (origMethodEl) origMethodEl.textContent = origMethod;

        let origDateDisplay = '—';
        if (latestPaidTx && latestPaidTx.paid_at) {
            const pDateObj = new Date(latestPaidTx.paid_at);
            const pDatePart = pDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const pHour = pDateObj.getHours();
            const pMin = String(pDateObj.getMinutes()).padStart(2, '0');
            const pAmpm = pHour >= 12 ? 'PM' : 'AM';
            const pH12 = pHour > 12 ? pHour - 12 : (pHour === 0 ? 12 : pHour);
            origDateDisplay = `${pDatePart}, ${String(pH12).padStart(2, '0')}:${pMin} ${pAmpm}`;
        } else if (formattedDate !== '—') {
            origDateDisplay = `${formattedDate}, ${formattedTime}`;
        }
        if (origDateEl) origDateEl.textContent = origDateDisplay;

        const origTxnId = latestPaidTx?.id ? String(latestPaidTx.id).slice(0, 8).toUpperCase() : '—';
        if (origTxnEl) origTxnEl.textContent = origTxnId !== '—' ? `#${origTxnId}` : '—';

        // 5. COMPUTE REFUNDABLE AMOUNT & RIGHT COLUMN
        activeRefundableAmount = transactions.reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            if (status === 'paid') return sum + val;
            if (status === 'refunded') return sum - val;
            return sum;
        }, 0);

        // Fallback to booking price if payments not logged in business_transactions
        if (activeRefundableAmount <= 0) {
            const rawTot = bft.final_amount ?? bft.total_price ?? (b && (b.final_amount ?? b.total_price ?? b.price)) ?? totalBookingPrice;
            if (Number(rawTot) > 0 && ['paid', 'partial'].includes((bft.payment_status || (b && (b.payment_status || b.payment)) || '').toLowerCase())) {
                activeRefundableAmount = Number(rawTot);
            }
        }

        if (activeRefundableAmount < 0) activeRefundableAmount = 0;

        const refundFormatted = `₹${activeRefundableAmount.toLocaleString('en-IN')}`;
        if (amountDisp) amountDisp.textContent = refundFormatted;
        if (maxRefundEl) maxRefundEl.textContent = refundFormatted;

        // Pre-select payment method dropdown
        if (methodSelect) {
            const lowerMethod = origMethod.toLowerCase();
            if (['cash', 'card', 'upi', 'bank_transfer'].includes(lowerMethod)) {
                methodSelect.value = lowerMethod;
            } else {
                methodSelect.value = 'cash';
            }
        }

        if (confirmBtn) {
            if (activeRefundableAmount <= 0) {
                if (amountDisp) amountDisp.style.color = '#94a3b8';
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Nothing to Refund';
            } else {
                if (amountDisp) amountDisp.style.color = '#e11d48';
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span>Issue Refund</span>
                `;
            }
        }

    } catch (err) {
        console.error('[Refund] Error populating refund modal:', err);
        if (amountDisp) {
            amountDisp.textContent = 'Error';
            amountDisp.style.color = '#ef4444';
        }
    }
};

// ── Process Refund Submission ────────────────────────────────────────────────
window.processRefund = async function() {
    if (!activeRefundBookingId || activeRefundableAmount <= 0) return;

    const reasonSelect = document.getElementById('refundReasonSelect');
    const reason = reasonSelect ? reasonSelect.value.trim() : '';
    if (!reason) {
        if (window.toast) {
            window.toast('Please select a refund reason', '#ef4444');
        } else {
            alert('Please select a refund reason before issuing the refund.');
        }
        reasonSelect?.focus();
        return;
    }

    const btn = document.getElementById('btnConfirmRefund');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Processing Refund...';

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();
        const note = document.getElementById('refundNote')?.value.trim() || '';
        const method = (document.getElementById('refundMethodSelect')?.value || 'cash').toLowerCase();

        const fullNotes = reason ? `[${reason}] ${note || 'Refund processed'}` : (note || 'Refund processed for booking');

        // 1. Insert refund record into business_transactions
        const { error: txErr } = await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: activeRefundBookingId,
                reference_type: 'booking',
                amount: Math.abs(activeRefundableAmount),
                final_amount: Math.abs(activeRefundableAmount),
                currency: 'INR',
                payment_method: method,
                status: 'refunded',
                notes: fullNotes,
                paid_at: new Date().toISOString()
            });

        if (txErr) console.warn('[Refund] business_transactions insert note:', txErr);

        // 2. Update summary table bookings_for_business_transaction
        const { error: bftErr } = await supabase
            .from('bookings_for_business_transaction')
            .update({
                payment_status: 'refunded',
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('booking_id', activeRefundBookingId);

        if (bftErr) console.warn('[Refund] bft update note:', bftErr);

        // 3. Update main bookings table
        const { error: bkErr } = await supabase
            .from('bookings')
            .update({
                status: 'cancelled',
                payment: 'refunded',
                updated_at: new Date().toISOString()
            })
            .eq('booking_id', activeRefundBookingId);

        if (bkErr) console.warn('[Refund] bookings table update note:', bkErr);

        document.getElementById('refundBookingModal')?.classList.remove('active');

        if (window.toast) {
            window.toast('✓ Refund processed successfully', '#10b981');
        } else {
            alert('Refund processed successfully!');
        }

        // Dispatch payment / refund event for reactive updates
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId: activeRefundBookingId, amount: -activeRefundableAmount }
        }));

        // Refresh whichever table is currently visible
        if (typeof window.fetchBookings === 'function') window.fetchBookings();
        if (typeof window.initPage === 'function') window.initPage();
        if (typeof window.fetchAndRenderAppointments === 'function') {
            const currentBranch = localStorage.getItem('branch_id');
            if (currentBranch) window.fetchAndRenderAppointments(currentBranch);
        }

    } catch (err) {
        console.error('[Refund] Failed to process refund:', err);
        alert('Failed to process refund: ' + (err.message || 'Unknown error'));
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Issue Refund</span>
        `;
    }
};

// Auto-inject modals on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalsInjected);
} else {
    ensureModalsInjected();
}

