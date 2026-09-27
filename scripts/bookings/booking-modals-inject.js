// scripts/bookings/booking-modals-inject.js

// ─── Inject Modals ───────────────────────────────────────────────────────────
export function setupModals() {
    document.querySelectorAll('#editBookingModal').forEach(m => m.remove());

    if (!document.getElementById('editBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <style id="editBookingModalStyles">
            @media (max-width: 820px) {
                #editBookingModalGrid { grid-template-columns: 1fr !important; }
            }
        </style>
        <div class="modal-overlay" id="editBookingModal" style="z-index:9999;">
            <div class="modal-container" style="width:1040px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                <div class="modal-header" style="padding:18px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <div class="header-titles">
                        <h2 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin:0;">Manage Booking</h2>
                        <p class="subtitle" style="font-size:0.85rem;color:#64748b;margin:2px 0 0 0;">View booking details and update schedule, services, or status.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditBookingModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:4px;display:flex;align-items:center;justify-content:center;">
                        <i data-feather="x"></i>
                    </button>
                </div>
                
                <div class="modal-body" style="padding:22px 24px;overflow-y:auto;flex:1;">
                    <form id="editBookingForm">
                        <input type="hidden" id="editBookingId">
                        
                        <div id="editBookingModalGrid" style="display:grid;grid-template-columns:310px 1fr;gap:24px;align-items:start;">
                            
                            <!-- LEFT COLUMN: Read-only Booking Details Card -->
                            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:14px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:10px;">
                                    <span style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Booking Details</span>
                                    <span id="viewBkIdBadge" style="font-family:monospace;font-size:0.75rem;font-weight:700;background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:6px;">#ID</span>
                                </div>
                                
                                <div>
                                    <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Customer</div>
                                    <div id="viewBkCustomer" style="font-weight:600;color:#0f172a;font-size:0.92rem;">—</div>
                                    <div id="viewBkPhone" style="font-size:0.8rem;color:#64748b;margin-top:2px;">—</div>
                                </div>

                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                    <div>
                                        <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Date</div>
                                        <div id="viewBkDate" style="font-size:0.86rem;font-weight:600;color:#334155;">—</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Time</div>
                                        <div id="viewBkTime" style="font-size:0.86rem;font-weight:600;color:#334155;">—</div>
                                    </div>
                                </div>

                                <div>
                                    <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Service</div>
                                    <div id="viewBkService" style="font-size:0.86rem;font-weight:500;color:#334155;word-break:break-word;">—</div>
                                </div>

                                <div>
                                    <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Staff</div>
                                    <div id="viewBkStaff" style="font-size:0.86rem;font-weight:500;color:#334155;word-break:break-word;">—</div>
                                </div>

                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                    <div>
                                        <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Booking Type</div>
                                        <div id="viewBkType" style="font-size:0.85rem;font-weight:600;color:#475569;text-transform:capitalize;">—</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Amount</div>
                                        <div id="viewBkAmount" style="font-size:0.92rem;font-weight:700;color:#059669;">—</div>
                                    </div>
                                </div>

                                <div>
                                    <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Status & Payment</div>
                                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                                        <span id="viewBkStatusBadge"></span>
                                        <span id="viewBkPaymentBadge"></span>
                                    </div>
                                </div>

                                <!-- Contextual Quick Actions (Invoice, Re-Book, Refund) -->
                                <div id="viewBkQuickActions" style="margin-top:4px;padding-top:12px;border-top:1px dashed #cbd5e1;display:flex;flex-direction:column;gap:8px;"></div>
                            </div>

                            <!-- RIGHT COLUMN: Update Booking Form -->
                            <div style="display:flex;flex-direction:column;gap:16px;">
                                <div style="font-size:0.78rem;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;padding-bottom:10px;">
                                    Update Booking
                                </div>

                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" for="editBkDate">Date <span class="text-rose">*</span></label>
                                        <input type="date" id="editBkDate" class="form-input" required>
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" for="editBkTime">Time <span class="text-rose">*</span></label>
                                        <input type="time" id="editBkTime" class="form-input" required>
                                    </div>
                                </div>

                                <div>
                                    <label class="form-label" style="display:block;margin-bottom:8px;">Services & Assigned Staff <span class="text-rose">*</span></label>
                                    <div id="editServiceRowsContainer" style="display:flex;flex-direction:column;gap:12px;margin-bottom:10px;"></div>
                                    <div style="text-align:right;">
                                        <button type="button" id="btnEditAddService" style="font-size:0.8rem;padding:6px 14px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 
                                            Add Another Service
                                        </button>
                                    </div>
                                </div>

                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" for="editBkStatus">Status <span class="text-rose">*</span></label>
                                        <select id="editBkStatus" class="form-select" style="font-weight:600;">
                                            <option value="booked">Booked</option>
                                            <option value="confirmed">Confirmed</option>
                                            <option value="completed">Completed</option>
                                            <option value="cancelled">Cancelled</option>
                                            <option value="no-show">No-Show</option>
                                        </select>
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" for="editBkNotes">Notes <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                                        <input type="text" id="editBkNotes" class="form-input" placeholder="Add note or instruction...">
                                    </div>
                                </div>
                            </div>

                        </div>
                    </form>
                </div>

                <div class="modal-footer" style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-radius:0 0 14px 14px;">
                    <div>
                        <button type="button" id="btnCancelThisBooking" style="padding:8px 16px;border-radius:6px;border:1px solid #fca5a5;background:#fff5f5;color:#dc2626;font-size:0.85rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                            Cancel Booking
                        </button>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <button type="button" class="btn btn-secondary" id="btnCancelEditBooking" style="padding:8px 18px;">Close</button>
                        <button type="submit" class="btn btn-primary" form="editBookingForm" id="btnSaveBookingChanges" style="padding:8px 22px;background:#4f46e5;border-color:#4f46e5;color:#fff;font-weight:600;">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>`);
    }

    if (!document.getElementById('updateStatusConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="updateStatusConfirmOverlay" style="z-index:9999;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:400px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);">
                <div style="width:64px;height:64px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;" id="updateStatusIconBg">
                    <i data-feather="alert-circle" style="color:#4f46e5;width:32px;height:32px;" id="updateStatusIcon"></i>
                </div>
                <h2 style="font-size:1.5rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Update Status?</h2>
                <p style="color:#64748b;font-size:0.95rem;margin-bottom:24px;line-height:1.5;" id="updateStatusConfirmText">Are you sure you want to change this booking's status?</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="btnKeepStatus" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-weight:600;cursor:pointer;">Cancel</button>
                    <button id="btnConfirmUpdateStatus" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer;">Yes, Update</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay custom-logout-overlay" id="fullScreenUpdateStatusLoader" style="z-index:10000;backdrop-filter:blur(8px);">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
                <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin 1s ease-in-out infinite;margin-bottom:16px;"></div>
                <h2 style="color:#fff;font-size:1.5rem;font-weight:600;">Updating status...</h2>
            </div>
        </div>`);
    }

    if (!document.getElementById('paymentNotCompletedModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="paymentNotCompletedModal" style="z-index:10005;backdrop-filter:blur(6px);">
            <div class="modal-container" style="background:#fff;border-radius:14px;padding:24px 28px;width:580px !important;max-width:92vw !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;text-align:left;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 style="font-size:1.1rem;font-weight:700;color:#0f172a;margin:0;">Payment not completed</h3>
                </div>
                <p style="margin:14px 0 22px 0;font-size:0.92rem;color:#334155;line-height:1.55;">
                    This booking has an outstanding payment of <strong id="pncModalAmount" style="color:#0f172a;font-weight:700;">₹0</strong>. You can collect the payment now or mark the service as completed and collect it later.
                </p>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button type="button" id="btnPncCollectPayment" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;border-radius:20px;padding:7px 18px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">Collect Payment</button>
                    <button type="button" id="btnPncCompleteWithoutPayment" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:20px;padding:7px 18px;font-size:0.85rem;font-weight:500;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">Complete Without Payment</button>
                    <button type="button" id="btnPncGoBack" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:20px;padding:7px 18px;font-size:0.85rem;font-weight:500;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">Go Back</button>
                </div>
            </div>
        </div>`);
    }

    if (!document.getElementById('viewBookingInvoiceModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="viewBookingInvoiceModal" style="z-index:10002;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:820px !important;max-width:94vw !important;background:#ffffff;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
                <!-- Header -->
                <div style="padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div>
                        <h2 style="font-size:1.15rem;font-weight:700;color:#0f172a;margin:0;">Booking Invoice</h2>
                        <p style="font-size:0.82rem;color:#64748b;margin:2px 0 0 0;">View completed appointment invoice details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseViewInvoiceModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:4px;display:flex;align-items:center;justify-content:center;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2-Column Grid matching Wireframe -->
                <div style="display:grid;grid-template-columns:1fr 240px;gap:20px;padding:24px;flex:1;overflow-y:auto;background:#f8fafc;" id="viewBookingInvoiceGrid">
                    <!-- LEFT BOX: Booking Details / Invoice -->
                    <div id="viewBookingInvoicePrintArea" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:14px;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px dashed #e2e8f0;padding-bottom:12px;">
                            <div>
                                <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Invoice / Booking ID</div>
                                <div id="vbiId" style="font-family:monospace;font-size:1rem;font-weight:700;color:#1e293b;margin-top:2px;">#00000000</div>
                            </div>
                            <div style="text-align:right;">
                                <span id="vbiStatusBadge" style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#dcfce7;color:#15803d;">Completed</span>
                                <div id="vbiPaymentBadge" style="margin-top:4px;"></div>
                            </div>
                        </div>

                        <!-- Customer & Schedule Info -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #f1f5f9;">
                            <div>
                                <div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Customer</div>
                                <div id="vbiCustomer" style="font-size:0.88rem;font-weight:600;color:#0f172a;margin-top:2px;">—</div>
                                <div id="vbiPhone" style="font-size:0.78rem;color:#64748b;">—</div>
                            </div>
                            <div>
                                <div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Appointment</div>
                                <div id="vbiDate" style="font-size:0.86rem;font-weight:600;color:#334155;margin-top:2px;">—</div>
                                <div id="vbiTime" style="font-size:0.78rem;color:#64748b;">—</div>
                            </div>
                        </div>

                        <!-- Services List -->
                        <div>
                            <div style="font-size:0.72rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Service Details</div>
                            <div id="vbiServicesList" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"></div>
                        </div>

                        <!-- Total Amount -->
                        <div style="margin-top:auto;padding-top:12px;border-top:1px dashed #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:0.85rem;font-weight:600;color:#64748b;">Total Amount</span>
                            <span id="vbiTotalAmount" style="font-size:1.2rem;font-weight:700;color:#059669;">₹0</span>
                        </div>
                    </div>

                    <!-- RIGHT BOX: Actions Sidebar Matching Wireframe -->
                    <div style="display:flex;flex-direction:column;justify-content:space-between;gap:16px;">
                        <!-- TOP BOX: Print Invoice -->
                        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;">
                            <div style="width:46px;height:46px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;color:#4f46e5;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                            </div>
                            <div>
                                <div style="font-weight:600;color:#0f172a;font-size:0.9rem;">Print Invoice</div>
                                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Generate receipt</div>
                            </div>
                            <button type="button" id="btnVbiPrint" style="width:100%;padding:9px 14px;background:#4f46e5;color:#ffffff;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;box-shadow:0 1px 2px rgba(79,70,229,0.2);" onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                Print Invoice
                            </button>
                        </div>

                        <!-- BOTTOM BOX: Go Back -->
                        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                            <button type="button" id="btnVbiGoBack" style="width:100%;padding:9px 14px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                Go Back
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`);
    }

    // Note: #refundBookingModal is injected and managed by scripts/rebook-refund-modal.js

    // ── Cancelled Booking Modal ───────────────────────────────────────────────
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
                    <button id="btnCloseCancelledBookingModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2-Column Layout -->
                <div style="display:grid;grid-template-columns:1fr 260px;gap:20px;padding:24px;flex:1;overflow-y:auto;background:#f8fafc;">

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

                    <!-- RIGHT: Action Buttons -->
                    <div style="display:flex;flex-direction:column;gap:14px;">

                        <!-- Refund button — only shown when payment was made -->
                        <div id="cbmRefundSection" style="display:none;">
                            <div style="background:#ffffff;border:1px solid #fecdd3;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;">
                                <div style="width:42px;height:42px;border-radius:50%;background:#fff1f2;display:flex;align-items:center;justify-content:center;color:#e11d48;">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>
                                </div>
                                <div>
                                    <div style="font-weight:600;color:#0f172a;font-size:0.9rem;">Process Refund</div>
                                    <div style="font-size:0.74rem;color:#64748b;margin-top:2px;">Return the payment to customer</div>
                                </div>
                                <button type="button" id="btnCbmRefund"
                                    style="width:100%;padding:10px 14px;background:#e11d48;color:#ffffff;border:none;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;box-shadow:0 1px 2px rgba(225,29,72,0.2);"
                                    onmouseover="this.style.background='#be123c'" onmouseout="this.style.background='#e11d48'">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>
                                    Refund
                                </button>
                            </div>
                        </div>

                        <!-- Rebook (big, always shown) -->
                        <div style="background:#ffffff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;flex:1;">
                            <div style="width:42px;height:42px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;color:#4f46e5;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                            </div>
                            <div>
                                <div style="font-weight:600;color:#0f172a;font-size:0.9rem;">Rebook Appointment</div>
                                <div style="font-size:0.74rem;color:#64748b;margin-top:2px;">Create a new booking for this customer</div>
                            </div>
                            <button type="button" id="btnCbmRebook"
                                style="width:100%;padding:12px 14px;background:#4f46e5;color:#ffffff;border:none;border-radius:8px;font-size:0.88rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s;box-shadow:0 2px 4px rgba(79,70,229,0.25);"
                                onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                Rebook
                            </button>
                        </div>

                        <!-- Close button (bottom, always shown) -->
                        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
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
    }

    if (!document.getElementById('customerProfileBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="customerProfileBookingModal" style="z-index:9999;">
            <div class="modal-container" style="width:90vw;max-width:1100px;">
                <div class="modal-header" style="border-bottom:1px solid #f1f5f9;">
                    <div class="header-titles">
                        <h2>Customer Profile</h2>
                        <p class="subtitle" id="profModalSubtitle">Loading details...</p>
                    </div>
                    <button class="modal-close" id="btnCloseProfModal" onclick="document.getElementById('customerProfileBookingModal').classList.remove('active')"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding:0; overflow:hidden;" id="profModalBody">
                    <div style="text-align:center;padding:48px;color:#94a3b8;font-size:0.9rem;">⏳ Loading customer information...</div>
                </div>
            </div>
        </div>`);
    }

    if (window.feather) feather.replace();
}
