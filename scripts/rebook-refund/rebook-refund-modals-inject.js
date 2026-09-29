// scripts/rebook-refund/rebook-refund-modals-inject.js
// Injects both modal HTML structures into the DOM if not already present.
// Idempotent: guarded by getElementById checks.
// NOTE: The #btnConfirmRefund listener is bound to window.processRefund at injection time.
// The orchestrator MUST assign window.processRefund before calling ensureModalsInjected().

export function ensureModalsInjected() {
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
    if (existingRefModal && !existingRefModal.querySelector('.rf-col-divided')) {
        existingRefModal.remove();
    }

    if (!document.getElementById('refundBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundBookingModal" style="z-index:10005;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:1160px;max-width:98vw;max-height:96vh;background:#fff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden;">
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

                <!-- Body: 2 Columns with independent scrolling and subtle divider line -->
                <div class="modal-body" style="padding:0;overflow:hidden;display:grid;grid-template-columns:1.15fr 1fr;background:#fff;flex:1;min-height:0;">
                    
                    <!-- LEFT COLUMN: 4 CARDS -->
                    <div class="rf-col-divided" style="display:flex;flex-direction:column;gap:14px;padding:24px;overflow-y:auto;min-height:0;height:100%;box-sizing:border-box;border-right:1px solid #e2e8f0;">
                        
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
                    <div style="display:flex;flex-direction:column;gap:16px;padding:24px;overflow-y:auto;min-height:0;height:100%;box-sizing:border-box;">
                        
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

                    </div>

                </div>

            <!-- Sticky Footer -->
            <div style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#fff;display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-shrink:0;">
                <button type="button" class="btn btn-secondary" id="btnCancelRefund" style="height:44px;padding:0 24px;font-size:0.88rem;font-weight:600;border-radius:10px;background:#fff;border:1px solid #cbd5e1;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Cancel</button>
                <button type="button" class="btn btn-primary" id="btnConfirmRefund" style="height:44px;padding:0 24px;font-size:0.88rem;font-weight:700;border-radius:10px;background:#e11d48;border:none;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 6px -1px rgba(225,29,72,0.25);transition:all 0.15s;" onmouseover="this.style.background='#be123c'" onmouseout="this.style.background='#e11d48'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Issue Refund</span>
                </button>
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
