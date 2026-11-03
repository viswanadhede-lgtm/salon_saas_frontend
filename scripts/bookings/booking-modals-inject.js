// scripts/bookings/booking-modals-inject.js

// ─── Inject Modals ───────────────────────────────────────────────────────────
export function setupModals() {
    document.querySelectorAll('#editBookingModal').forEach(m => m.remove());
    document.querySelectorAll('#bookingUpdateChoiceModal').forEach(m => m.remove());
    document.querySelectorAll('#manageBookingModal').forEach(m => m.remove());

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
            <div class="modal-container" style="background:#fff;border-radius:14px;padding:24px 28px;width:480px !important;max-width:92vw !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;text-align:left;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:42px;height:42px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;color:#dc2626;flex-shrink:0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <div>
                        <h3 style="font-size:1.1rem;font-weight:700;color:#0f172a;margin:0;">Payment Required</h3>
                        <p style="font-size:0.8rem;color:#64748b;margin:2px 0 0 0;">Cannot complete booking without payment</p>
                    </div>
                </div>
                <div style="margin:18px 0 24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0 0 10px 0;font-size:0.9rem;color:#334155;line-height:1.5;">
                        Please collect the payment before marking this booking as completed.
                    </p>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:0.85rem;">
                        <span style="color:#64748b;font-weight:500;">Outstanding Amount:</span>
                        <strong id="pncModalAmount" style="color:#0f172a;font-weight:700;font-size:1rem;">₹0</strong>
                    </div>
                </div>
                <div style="display:flex;gap:12px;align-items:center;justify-content:flex-end;">
                    <button type="button" id="btnPncClose" style="background:#ffffff;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:9px 20px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">Close</button>
                    <button type="button" id="btnPncCollectPayment" style="background:#4f46e5;color:#ffffff;border:none;border-radius:8px;padding:9px 20px;font-size:0.85rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(79,70,229,0.25);transition:all 0.15s;" onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        Collect Payment
                    </button>
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

    // ── Choice Modal: Update Booking (Edit Booking vs Manage Booking) ──────────
    if (!document.getElementById('bookingUpdateChoiceModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="bookingUpdateChoiceModal" style="z-index:9999;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:600px !important;max-width:94vw !important;background:#ffffff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;display:flex;flex-direction:column;">
                
                <!-- Header -->
                <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;background:#ffffff;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:38px;height:38px;border-radius:10px;background:#f5f3ff;border:1px solid #ede9fe;display:flex;align-items:center;justify-content:center;color:#7c3aed;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </div>
                        <div>
                            <h2 style="font-size:1.15rem;font-weight:700;color:#0f172a;margin:0;">Update Booking</h2>
                            <p style="font-size:0.82rem;color:#64748b;margin:2px 0 0 0;">Choose how you want to update this appointment.</p>
                        </div>
                    </div>
                    <button type="button" id="btnCloseUpdateChoiceModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:6px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2 Cards -->
                <div style="padding:22px;background:#f8fafc;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    
                    <!-- Card 1: Edit Booking -->
                    <div id="cardChoiceEditBooking" style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:12px;padding:20px;cursor:pointer;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 1px 3px rgba(0,0,0,0.03);"
                        onmouseover="this.style.borderColor='#6366f1';this.style.background='#fcfaff';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 16px -4px rgba(99,102,241,0.12)';"
                        onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#ffffff';this.style.transform='translateY(0)';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.03)';">
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                                <div style="width:42px;height:42px;border-radius:10px;background:#e0e7ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </div>
                                <span style="font-size:0.72rem;font-weight:700;color:#4338ca;background:#e0e7ff;padding:3px 9px;border-radius:20px;letter-spacing:0.02em;">Schedule & Svc</span>
                            </div>
                            <h3 style="font-size:1.02rem;font-weight:700;color:#0f172a;margin:0 0 6px 0;">Edit Booking</h3>
                            <p style="font-size:0.82rem;color:#64748b;margin:0;line-height:1.45;">Modify appointment date, time, services, assigned staff, or pricing.</p>
                        </div>
                        <div style="margin-top:18px;display:flex;align-items:center;gap:6px;font-size:0.84rem;font-weight:700;color:#4f46e5;">
                            Open Editor
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </div>
                    </div>

                    <!-- Card 2: Manage Booking -->
                    <div id="cardChoiceManageBooking" style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:12px;padding:20px;cursor:pointer;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 1px 3px rgba(0,0,0,0.03);"
                        onmouseover="this.style.borderColor='#7c3aed';this.style.background='#faf5ff';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 16px -4px rgba(124,58,237,0.12)';"
                        onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#ffffff';this.style.transform='translateY(0)';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.03)';">
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                                <div style="width:42px;height:42px;border-radius:10px;background:#f3e8ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>
                                </div>
                                <span style="font-size:0.72rem;font-weight:700;color:#6b21a8;background:#f3e8ff;padding:3px 9px;border-radius:20px;letter-spacing:0.02em;">Status & Details</span>
                            </div>
                            <h3 style="font-size:1.02rem;font-weight:700;color:#0f172a;margin:0 0 6px 0;">Manage Booking</h3>
                            <p style="font-size:0.82rem;color:#64748b;margin:0;line-height:1.45;">View appointment summary and update booking status directly.</p>
                        </div>
                        <div style="margin-top:18px;display:flex;align-items:center;gap:6px;font-size:0.84rem;font-weight:700;color:#7c3aed;">
                            Manage Status
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </div>
                    </div>

                </div>

                <!-- Footer: Close Button -->
                <div style="padding:14px 24px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;align-items:center;background:#ffffff;border-radius:0 0 16px 16px;">
                    <button type="button" id="btnCancelUpdateChoiceModal" style="padding:8px 20px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#475569;font-size:0.86rem;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                        Close
                    </button>
                </div>

            </div>
        </div>`);
    }

    // ── Manage Booking Modal (Two-Column Layout: Left Summary, Right Status & Action) ──
    if (!document.getElementById('manageBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <style id="manageBookingModalStyles">
            @media (max-width: 768px) {
                #manageBookingGrid { grid-template-columns: 1fr !important; }
            }
        </style>
        <div class="modal-overlay" id="manageBookingModal" style="z-index:9999;backdrop-filter:blur(6px);">
            <div class="modal-container" style="width:860px !important;max-width:96vw !important;background:#ffffff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;display:flex;flex-direction:column;">
                
                <!-- Header -->
                <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;background:#ffffff;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:#f5f3ff;border:1px solid #ede9fe;display:flex;align-items:center;justify-content:center;color:#7c3aed;">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>
                        </div>
                        <div>
                            <h2 style="font-size:1.18rem;font-weight:700;color:#0f172a;margin:0;">Manage Booking</h2>
                            <p style="font-size:0.83rem;color:#64748b;margin:2px 0 0 0;">Update appointment status and view booking summary.</p>
                        </div>
                    </div>
                    <button type="button" id="btnCloseManageBookingModal" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:6px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2-Column Grid (Left: Summary, Right: Status & Action) -->
                <div id="manageBookingGrid" style="padding:22px 24px;display:grid;grid-template-columns:1.08fr 1fr;gap:20px;background:#ffffff;align-items:stretch;">
                    
                    <!-- LEFT COLUMN: Booking Summary Card -->
                    <div style="background:#f8fafc;border:1px solid #eef2f6;border-radius:14px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;">
                        
                        <!-- ID & Status Pill -->
                        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">
                            <div>
                                <div style="font-size:0.72rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Booking ID</div>
                                <span id="mbSummaryBkId" style="font-family:monospace;font-size:0.84rem;font-weight:700;background:#ede9fe;color:#4f46e5;padding:3px 9px;border-radius:6px;display:inline-block;">#--------</span>
                            </div>
                            <div>
                                <span id="mbSummaryStatusBadge" style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:0.76rem;font-weight:600;background:#ede9fe;color:#4f46e5;">
                                    ● Booked
                                </span>
                            </div>
                        </div>

                        <!-- Customer Info -->
                        <div style="display:flex;flex-direction:column;gap:6px;background:#ffffff;border:1px solid #f1f5f9;border-radius:10px;padding:12px;">
                            <div style="display:flex;align-items:center;gap:8px;font-size:0.83rem;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                <span id="mbSummaryEmail" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">—</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;font-size:0.83rem;font-weight:600;color:#1e293b;">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                <span id="mbSummaryPhone">—</span>
                            </div>
                        </div>

                        <!-- Schedule & Amount Grid -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    <span>Date</span>
                                </div>
                                <div id="mbSummaryDate" style="font-size:0.86rem;font-weight:700;color:#0f172a;margin-top:2px;">—</div>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    <span>Time</span>
                                </div>
                                <div id="mbSummaryTime" style="font-size:0.86rem;font-weight:700;color:#0f172a;margin-top:2px;">—</div>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"></path><path d="M5 2h14"></path><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path></svg>
                                    <span>Duration</span>
                                </div>
                                <div id="mbSummaryDuration" style="font-size:0.86rem;font-weight:700;color:#0f172a;margin-top:2px;">—</div>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                                    <span>Amount</span>
                                </div>
                                <div id="mbSummaryAmount" style="font-size:1.1rem;font-weight:700;color:#059669;margin-top:2px;">₹0</div>
                            </div>
                        </div>

                        <!-- Services & Staff -->
                        <div style="border-top:1px solid #e2e8f0;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>
                                    <span>Services</span>
                                </div>
                                <div id="mbSummaryServices" style="font-size:0.86rem;font-weight:700;color:#0f172a;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">—</div>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#64748b;font-weight:500;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    <span>Staff</span>
                                </div>
                                <div id="mbSummaryStaff" style="font-size:0.86rem;font-weight:700;color:#0f172a;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">—</div>
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: Update Booking Status Section & Action -->
                    <div style="background:#ffffff;border:1px solid #eef2f6;border-radius:14px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;">
                        
                        <div>
                            <!-- Header with pulse/activity icon -->
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                                <div style="width:36px;height:36px;border-radius:8px;background:#ede9fe;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                </div>
                                <div>
                                    <h3 style="font-size:0.96rem;font-weight:700;color:#0f172a;margin:0;">Update Booking Status</h3>
                                    <p style="font-size:0.78rem;color:#64748b;margin:1px 0 0 0;">Change the current status of this appointment.</p>
                                </div>
                            </div>

                            <!-- Dropdown Field -->
                            <div>
                                <label style="display:block;font-size:0.8rem;font-weight:600;color:#334155;margin-bottom:6px;">Booking Status</label>
                                
                                <!-- Dropdown Trigger -->
                                <div id="mbStatusDropdownTrigger" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1.5px solid #cbd5e1;border-radius:8px;background:#ffffff;cursor:pointer;font-size:0.88rem;font-weight:600;color:#0f172a;transition:all 0.15s;"
                                    onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#cbd5e1'">
                                    <div id="mbStatusTriggerContent" style="display:flex;align-items:center;gap:8px;">
                                        <!-- Populated dynamically -->
                                    </div>
                                    <svg id="mbStatusChevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s ease;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>

                                <!-- Custom Dropdown Options Menu (Closed by default) -->
                                <div id="mbStatusDropdownMenu" style="display:none;margin-top:6px;background:#ffffff;border:1.5px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.03);padding:4px;flex-direction:column;gap:2px;">
                                    
                                    <!-- Option: Booked -->
                                    <div class="mb-status-option" data-status="booked" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:7px;cursor:pointer;transition:background 0.12s;">
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                            <span style="font-size:0.85rem;font-weight:500;color:#0f172a;">Booked</span>
                                        </div>
                                        <svg class="mb-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>

                                    <!-- Option: In Progress -->
                                    <div class="mb-status-option" data-status="in progress" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:7px;cursor:pointer;transition:background 0.12s;">
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                            <span style="font-size:0.85rem;font-weight:500;color:#0f172a;">In Progress</span>
                                        </div>
                                        <svg class="mb-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>

                                    <!-- Option: Completed -->
                                    <div class="mb-status-option" data-status="completed" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:7px;cursor:pointer;transition:background 0.12s;">
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10 15 7 12"></polyline></svg>
                                            <span style="font-size:0.85rem;font-weight:500;color:#0f172a;">Completed</span>
                                        </div>
                                        <svg class="mb-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>

                                    <!-- Option: Cancelled -->
                                    <div class="mb-status-option" data-status="cancelled" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:7px;cursor:pointer;transition:background 0.12s;">
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                            <span style="font-size:0.85rem;font-weight:500;color:#0f172a;">Cancelled</span>
                                        </div>
                                        <svg class="mb-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>

                                    <!-- Option: No-show -->
                                    <div class="mb-status-option" data-status="no-show" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:7px;cursor:pointer;transition:background 0.12s;">
                                        <div style="display:flex;align-items:center;gap:10px;">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                            <span style="font-size:0.85rem;font-weight:500;color:#0f172a;">No-show</span>
                                        </div>
                                        <svg class="mb-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <!-- Update Status Button -->
                        <div style="margin-top:10px;display:flex;justify-content:flex-end;">
                            <button type="button" id="btnMbUpdateStatus" style="width:100%;background:#7c3aed;color:#ffffff;border:none;border-radius:8px;padding:11px 20px;font-size:0.9rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 1px 3px rgba(124,58,237,0.25);transition:all 0.15s;"
                                onmouseover="this.style.background='#6d28d9'" onmouseout="this.style.background='#7c3aed'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Update Status
                            </button>
                        </div>

                    </div>

                </div>

            </div>
        </div>`);
    }

    if (window.feather) feather.replace();
}
