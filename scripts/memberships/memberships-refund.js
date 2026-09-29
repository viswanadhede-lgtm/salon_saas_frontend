// scripts/memberships/memberships-refund.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPurchases,
    getCurrentPlans,
    getRefundableMembershipAmount,
    setRefundableMembershipAmount,
    getPurchaseToRefundObj,
    setPurchaseToRefundObj
} from './memberships-state.js';
import { showToast } from './memberships-utils.js';
import {
    fetchCustomerByIdApi,
    fetchTransactionsForPurchaseApi,
    insertRefundTransactionApi,
    updatePurchaseRefundStatusApi,
    fetchTransactionsSummaryForPurchaseApi
} from './memberships-api.js';
import { loadPurchases } from './memberships-purchases-table.js';

// ── Refund Amount Change Handler ───────────────────────────────────────────
export function handleMemRefundAmountChange(val) {
    const input = document.getElementById('rfMemAmountInput');
    const badge = document.getElementById('rfMemRefundTypeBadge');
    const confirmBtn = document.getElementById('confirmMemRefundBtn');
    let num = parseFloat(val);
    const refundableMembershipAmount = getRefundableMembershipAmount();

    if (isNaN(num) || num <= 0) {
        if (badge) {
            badge.textContent = 'Enter Amount';
            badge.style.background = '#f1f5f9';
            badge.style.color = '#64748b';
        }
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
        }
        return;
    }

    if (refundableMembershipAmount > 0 && num > refundableMembershipAmount) {
        num = refundableMembershipAmount;
        if (input) input.value = num;
        showToast(`Refund amount cannot exceed paid limit of ₹${refundableMembershipAmount.toLocaleString('en-IN')}`, '#f59e0b');
    }

    if (refundableMembershipAmount > 0) {
        if (num >= refundableMembershipAmount) {
            if (badge) {
                badge.textContent = 'Full Refund';
                badge.style.background = '#ffe4e6';
                badge.style.color = '#e11d48';
            }
        } else {
            if (badge) {
                badge.textContent = 'Partial Refund';
                badge.style.background = '#fef3c7';
                badge.style.color = '#d97706';
            }
        }
    } else {
        if (badge) {
            badge.textContent = 'Custom Refund';
            badge.style.background = '#eff6ff';
            badge.style.color = '#2563eb';
        }
    }

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    }
}

// ── Setup Advanced Refund Modal ────────────────────────────────────────────
export function setupRefundPurchaseModal() {
    const existingModal = document.getElementById('refundMembershipAdvancedOverlay');
    if (existingModal && (!existingModal.querySelector('.rf-mem-divided') || !existingModal.querySelector('#rfMemOrigPaidAmount') || !existingModal.querySelector('#rfMemAmountInput'))) {
        existingModal.remove();
    }

    if (!document.getElementById('refundMembershipAdvancedOverlay')) {
        const modalHtml = `
        <div class="modal-overlay" id="refundMembershipAdvancedOverlay" style="z-index:10005;backdrop-filter:blur(6px);">
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
                            <h2 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin:0;line-height:1.2;">Process Membership Refund</h2>
                            <p class="subtitle" style="font-size:0.82rem;color:#64748b;margin:3px 0 0 0;">Review membership details and process the refund.</p>
                        </div>
                    </div>
                    <button class="modal-close" id="cancelMemRefundBtn" style="border:none;background:transparent;cursor:pointer;color:#64748b;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Body: 2 Columns with independent scrolling and subtle divider line -->
                <div class="modal-body" style="padding:0;overflow:hidden;display:grid;grid-template-columns:1.15fr 1fr;background:#fff;flex:1;min-height:0;">
                    
                    <!-- LEFT COLUMN: 3 CARDS -->
                    <div class="rf-mem-divided" style="display:flex;flex-direction:column;gap:14px;padding:24px;overflow-y:auto;min-height:0;height:100%;box-sizing:border-box;border-right:1px solid #e2e8f0;">
                        
                        <!-- CARD 1: Member Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.88rem;font-weight:700;color:#0f172a;">Member Details</span>
                                <button type="button" id="rfMemCustomerViewProfileBtn" style="background:none;border:none;color:#2563eb;font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">
                                    View Profile
                                </button>
                            </div>
                            <div style="display:flex;align-items:center;gap:14px;">
                                <div id="rfMemCustomerAvatar" style="width:44px;height:44px;border-radius:50%;background:#dbeafe;color:#1e40af;font-weight:700;font-size:0.95rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;">
                                    --
                                </div>
                                <div style="display:flex;flex-direction:column;gap:4px;overflow:hidden;flex:1;">
                                    <div id="rfMemCustomerName" style="font-weight:700;color:#0f172a;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Member Name</div>
                                    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                                        <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;color:#475569;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                            <span id="rfMemCustomerPhone">—</span>
                                        </span>
                                        <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;color:#475569;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                            <span id="rfMemCustomerEmail">—</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 2: Membership Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.88rem;font-weight:700;color:#0f172a;">Membership Details</span>
                                <span id="rfMemBadge" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:20px;font-family:monospace;">#MEM-001</span>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Plan</span>
                                    <span id="rfMemPlanName" style="font-weight:700;color:#0f172a;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Membership ID</span>
                                    <span id="rfMemIdText" style="font-weight:600;color:#0f172a;font-family:monospace;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Start Date</span>
                                    <span id="rfMemStartDate" style="font-weight:600;color:#0f172a;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Cancelled On</span>
                                    <span id="rfMemCancelledDate" style="font-weight:700;color:#dc2626;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;">
                                    <span style="color:#64748b;">Status</span>
                                    <span id="rfMemStatusBadge" style="background:#fee2e2;color:#991b1b;border:1px solid #fecdd3;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:20px;">Cancelled</span>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 3: Original Payment Details -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                            <span style="font-size:0.88rem;font-weight:700;color:#0f172a;">Original Payment Details</span>
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Payment Method</span>
                                    <span id="rfMemOrigMethod" style="font-weight:700;color:#0f172a;text-transform:uppercase;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                                    <span style="color:#64748b;">Payment Date</span>
                                    <span id="rfMemOrigDate" style="font-weight:600;color:#0f172a;">—</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;padding:6px 0;">
                                    <span style="color:#64748b;">Paid Amount</span>
                                    <span id="rfMemOrigPaidAmount" style="font-weight:700;color:#0f172a;">₹0</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: REFUND FORM CONTROLS -->
                    <div style="display:flex;flex-direction:column;gap:16px;padding:24px;overflow-y:auto;min-height:0;height:100%;box-sizing:border-box;">
                        
                        <!-- Refund Amount Card (Editable) -->
                        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:8px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:0.72rem;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.05em;">REFUND AMOUNT</span>
                                <span id="rfMemRefundTypeBadge" style="background:#ffe4e6;color:#e11d48;font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:20px;transition:all 0.2s;">Full Refund</span>
                            </div>
                            <div id="rfMemAmountInputWrapper" style="display:flex;align-items:center;background:#fff;border:1.5px solid #fecdd3;border-radius:10px;padding:4px 12px;transition:all 0.15s;">
                                <span style="font-size:1.6rem;font-weight:800;color:#e11d48;line-height:1;margin-right:6px;user-select:none;">₹</span>
                                <input type="number" id="rfMemAmountInput" min="1" step="any" placeholder="0" 
                                       style="width:100%;font-size:1.6rem;font-weight:800;color:#e11d48;border:none;background:transparent;outline:none;padding:4px 0;line-height:1;font-family:inherit;" />
                            </div>
                            <div style="font-size:0.78rem;color:#64748b;display:flex;justify-content:space-between;align-items:center;">
                                <span>Maximum refundable: <strong id="rfMemMaxRefundText" style="font-weight:700;color:#475569;">₹0</strong></span>
                                <button type="button" id="rfMemSetFullRefundBtn" style="background:none;border:none;color:#e11d48;font-size:0.75rem;font-weight:700;cursor:pointer;padding:0;text-decoration:underline;">Reset Full</button>
                            </div>
                        </div>

                        <!-- Refund Payment Method Select -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Refund Payment Method <span style="color:#ef4444;">*</span></label>
                            <select id="rfMemMethodDisplay" class="form-input" style="height:44px;border-radius:10px;border:1px solid #cbd5e1;font-weight:500;font-size:0.88rem;width:100%;background:#fff;padding:0 12px;cursor:pointer;">
                                <option value="cash" selected>Cash</option>
                                <option value="card">Card</option>
                                <option value="upi">UPI</option>
                                <option value="bank_transfer">Bank Transfer</option>
                            </select>
                        </div>

                        <!-- Refund Reason Select -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Refund Reason <span style="color:#ef4444;">*</span></label>
                            <select id="rfMemReasonSelect" class="form-input" style="height:44px;border-radius:10px;border:1px solid #cbd5e1;font-weight:500;font-size:0.88rem;width:100%;background:#fff;padding:0 12px;cursor:pointer;">
                                <option value="" disabled selected>Select a reason</option>
                                <option value="Customer Request">Customer Request</option>
                                <option value="Membership Cancelled">Membership Cancelled</option>
                                <option value="Service Dissatisfaction">Service Dissatisfaction</option>
                                <option value="Relocation / Moving">Relocation / Moving</option>
                                <option value="Duplicate Payment">Duplicate Payment</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <!-- Additional Note -->
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;color:#334155;margin-bottom:6px;display:block;">Additional Note <span style="font-weight:400;color:#64748b;">(Optional)</span></label>
                            <textarea id="rfMemNote" placeholder="Enter additional details..." style="min-height:95px;width:100%;border-radius:10px;border:1px solid #cbd5e1;font-size:0.85rem;padding:10px 12px;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>
                        </div>

                        <!-- Please Confirm Box -->
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;">
                            <div style="color:#2563eb;margin-top:2px;flex-shrink:0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </div>
                            <div>
                                <div style="font-size:0.82rem;font-weight:700;color:#1e3a8a;">Please confirm</div>
                                <div style="font-size:0.78rem;color:#2563eb;margin-top:2px;line-height:1.4;">This will record a refund transaction and update the membership according to your refund policy.</div>
                            </div>
                        </div>

                    </div>

                </div>

                <!-- Sticky Footer -->
                <div style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#fff;display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-shrink:0;">
                    <button type="button" class="btn btn-secondary" id="closeMemRefundBtn" style="height:44px;padding:0 24px;font-size:0.88rem;font-weight:600;border-radius:10px;background:#fff;border:1px solid #cbd5e1;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Cancel</button>
                    <button type="button" class="btn btn-primary" id="confirmMemRefundBtn" style="height:44px;padding:0 28px;font-size:0.88rem;font-weight:700;border-radius:10px;background:#dc2626;border:none;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 6px -1px rgba(220,38,38,0.25);transition:all 0.15s;" onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        <span>Issue Refund</span>
                    </button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const overlay = document.getElementById('refundMembershipAdvancedOverlay');
        const close = () => { overlay.classList.remove('active'); setPurchaseToRefundObj(null); };

        document.getElementById('cancelMemRefundBtn').addEventListener('click', close);
        document.getElementById('closeMemRefundBtn').addEventListener('click', close);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const amountInput = document.getElementById('rfMemAmountInput');
        const inputWrapper = document.getElementById('rfMemAmountInputWrapper');
        if (amountInput && inputWrapper) {
            amountInput.addEventListener('focus', () => {
                inputWrapper.style.borderColor = '#e11d48';
                inputWrapper.style.boxShadow = '0 0 0 3px rgba(225,29,72,0.12)';
            });
            amountInput.addEventListener('blur', () => {
                inputWrapper.style.borderColor = '#fecdd3';
                inputWrapper.style.boxShadow = 'none';
            });
            amountInput.addEventListener('input', (e) => {
                handleMemRefundAmountChange(e.target.value);
            });
        }

        const resetBtn = document.getElementById('rfMemSetFullRefundBtn');
        if (resetBtn && amountInput) {
            resetBtn.addEventListener('click', () => {
                const refundableMembershipAmount = getRefundableMembershipAmount();
                amountInput.value = refundableMembershipAmount;
                handleMemRefundAmountChange(refundableMembershipAmount);
            });
        }

        document.getElementById('confirmMemRefundBtn').addEventListener('click', processMembershipRefund);
    }
}

// ── Open Refund Modal ──────────────────────────────────────────────────────
export async function refundMembershipPurchase(purchaseId) {
    setupRefundPurchaseModal();
    
    // Find the purchase object
    const currentPurchases = getCurrentPurchases();
    const purchaseToRefundObj = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    setPurchaseToRefundObj(purchaseToRefundObj);
                          
    if (!purchaseToRefundObj) {
        showToast('Could not find purchase details.', '#ef4444');
        return;
    }

    const overlay = document.getElementById('refundMembershipAdvancedOverlay');
    overlay.classList.add('active');

    // Reset / Populate UI Elements
    const custNameEl = document.getElementById('rfMemCustomerName');
    const custPhoneEl = document.getElementById('rfMemCustomerPhone');
    const custEmailEl = document.getElementById('rfMemCustomerEmail');
    const custAvatarEl = document.getElementById('rfMemCustomerAvatar');
    const viewProfBtn = document.getElementById('rfMemCustomerViewProfileBtn');

    const memBadgeEl = document.getElementById('rfMemBadge');
    const planNameEl = document.getElementById('rfMemPlanName');
    const memIdTextEl = document.getElementById('rfMemIdText');
    const startDateEl = document.getElementById('rfMemStartDate');
    const cancelledDateEl = document.getElementById('rfMemCancelledDate');
    const statusBadgeEl = document.getElementById('rfMemStatusBadge');

    const origMethodEl = document.getElementById('rfMemOrigMethod');
    const origDateEl = document.getElementById('rfMemOrigDate');
    const origPaidAmountEl = document.getElementById('rfMemOrigPaidAmount');

    const amountInput = document.getElementById('rfMemAmountInput');
    const maxRefundEl = document.getElementById('rfMemMaxRefundText');
    const methodSelect = document.getElementById('rfMemMethodDisplay');
    const reasonSelect = document.getElementById('rfMemReasonSelect');
    const noteField = document.getElementById('rfMemNote');
    const confirmBtn = document.getElementById('confirmMemRefundBtn');

    // 1. Member Details
    const custName = purchaseToRefundObj.customer_name || `${purchaseToRefundObj.first_name || ''} ${purchaseToRefundObj.last_name || ''}`.trim() || 'Customer';
    const custPhone = purchaseToRefundObj.customer_phone || purchaseToRefundObj.phone || '—';
    const custEmail = purchaseToRefundObj.customer_email || purchaseToRefundObj.email || '—';

    if (custNameEl) custNameEl.textContent = custName;
    if (custPhoneEl) custPhoneEl.textContent = custPhone;
    if (custEmailEl) custEmailEl.textContent = custEmail;

    const initials = custName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
    if (custAvatarEl) custAvatarEl.textContent = initials;

    if (viewProfBtn) {
        if (purchaseToRefundObj.customer_id) {
            viewProfBtn.style.display = 'inline-flex';
            viewProfBtn.onclick = async (e) => {
                e.preventDefault();
                if (!window.viewCustomerProfile) {
                    try { await import('../global-customer-profile-modal.js'); } catch(e) {}
                }
                if (window.viewCustomerProfile) {
                    window.viewCustomerProfile(purchaseToRefundObj.customer_id, custName);
                }
            };
        } else {
            viewProfBtn.style.display = 'none';
        }
    }

    // 2. Membership Details
    const planName = purchaseToRefundObj.plan_name || purchaseToRefundObj.membership_name || purchaseToRefundObj.name || 'Plan';
    const shortMemId = purchaseToRefundObj.membership_number 
        ? `#MEM-${purchaseToRefundObj.membership_number}` 
        : `#MEM-${String(purchaseToRefundObj.purchase_id || purchaseToRefundObj.id || '').slice(0, 6).toUpperCase()}`;

    if (memBadgeEl) memBadgeEl.textContent = shortMemId;
    if (memIdTextEl) memIdTextEl.textContent = shortMemId;
    if (planNameEl) planNameEl.textContent = planName;

    const rawStart = purchaseToRefundObj.purchase_date || purchaseToRefundObj.start_date || purchaseToRefundObj.created_at;
    const formattedStartDate = rawStart ? new Date(rawStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    if (startDateEl) startDateEl.textContent = formattedStartDate;

    const rawCancelled = purchaseToRefundObj.cancelled_date || purchaseToRefundObj.updated_at || new Date().toISOString().split('T')[0];
    const formattedCancelledDate = rawCancelled ? new Date(rawCancelled).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    if (cancelledDateEl) cancelledDateEl.textContent = formattedCancelledDate;

    if (statusBadgeEl) {
        statusBadgeEl.textContent = 'Cancelled';
        statusBadgeEl.style.background = '#fee2e2';
        statusBadgeEl.style.color = '#991b1b';
    }

    // 3. Calculate reliable initial paid amount from purchase fields or matching plan
    let planPrice = 0;
    const currentPlans = getCurrentPlans();
    if (Array.isArray(currentPlans)) {
        const planRecord = currentPlans.find(p => 
            (p.membership_id && p.membership_id === purchaseToRefundObj.membership_id) || 
            (p.id && p.id === purchaseToRefundObj.membership_id) ||
            (p.plan_name && purchaseToRefundObj.plan_name && p.plan_name.toLowerCase() === purchaseToRefundObj.plan_name.toLowerCase()) ||
            (p.name && purchaseToRefundObj.name && p.name.toLowerCase() === purchaseToRefundObj.name.toLowerCase())
        );
        if (planRecord) {
            planPrice = Number(planRecord.price || planRecord.final_amount || 0);
        }
    }

    const fallbackPaid = Number(
        purchaseToRefundObj.final_amount != null && Number(purchaseToRefundObj.final_amount) > 0 ? purchaseToRefundObj.final_amount :
        (purchaseToRefundObj.price != null && Number(purchaseToRefundObj.price) > 0 ? purchaseToRefundObj.price :
        (purchaseToRefundObj.amount != null && Number(purchaseToRefundObj.amount) > 0 ? purchaseToRefundObj.amount :
        (purchaseToRefundObj.amount_paid != null && Number(purchaseToRefundObj.amount_paid) > 0 ? purchaseToRefundObj.amount_paid :
        planPrice)))
    ) || 0;

    let refundableMembershipAmount = fallbackPaid;
    setRefundableMembershipAmount(refundableMembershipAmount);

    if (origMethodEl) origMethodEl.textContent = (purchaseToRefundObj.payment_method || 'UPI').toUpperCase();
    if (origDateEl) origDateEl.textContent = formattedStartDate;
    if (origPaidAmountEl) origPaidAmountEl.textContent = `₹${fallbackPaid.toLocaleString('en-IN')}`;

    // 4. Right Column Form - Always keep amountInput editable!
    if (amountInput) {
        amountInput.disabled = false;
        amountInput.value = fallbackPaid > 0 ? fallbackPaid : '';
        amountInput.placeholder = 'Enter amount';
        if (fallbackPaid > 0) amountInput.max = fallbackPaid;
    }
    if (maxRefundEl) maxRefundEl.textContent = `₹${fallbackPaid.toLocaleString('en-IN')}`;
    handleMemRefundAmountChange(fallbackPaid > 0 ? fallbackPaid : 0);

    if (reasonSelect) {
        reasonSelect.value = '';
        reasonSelect.style.borderColor = '#cbd5e1';
    }
    if (noteField) noteField.value = '';
    if (confirmBtn) { 
        confirmBtn.disabled = (fallbackPaid <= 0);
        confirmBtn.style.opacity = (fallbackPaid <= 0) ? '0.5' : '1';
        confirmBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            <span>Issue Refund</span>
        `;
    }

    // Fetch customer details and ledger asynchronously without blocking or crashing the modal
    (async () => {
        try {
            if (purchaseToRefundObj.customer_id) {
                fetchCustomerByIdApi(purchaseToRefundObj.customer_id)
                    .then(({ data: c }) => {
                        if (c) {
                            if (c.customer_name && custNameEl) custNameEl.textContent = c.customer_name;
                            if ((c.customer_phone || c.phone) && custPhoneEl) custPhoneEl.textContent = c.customer_phone || c.phone;
                            if ((c.customer_email || c.email) && custEmailEl) custEmailEl.textContent = c.customer_email || c.email;
                            const newInitials = ((c.customer_name || custName) || 'CU').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CU';
                            if (custAvatarEl) custAvatarEl.textContent = newInitials;
                        }
                    }).catch(() => {});
            }

            const { data, error } = await fetchTransactionsForPurchaseApi(purchaseId);

            if (!error && Array.isArray(data) && data.length > 0) {
                let ledgerPaid = 0;
                let ledgerRefunded = 0;
                let originalTx = null;

                data.forEach(tx => {
                    const val = Math.abs(Number(tx.amount || 0));
                    const stat = (tx.status || '').toLowerCase().trim();
                    if (stat === 'paid') {
                        ledgerPaid += val;
                        if (!originalTx) originalTx = tx;
                    }
                    if (stat === 'refunded') ledgerRefunded += val;
                });

                if (ledgerPaid === 0) ledgerPaid = fallbackPaid;
                const ledgerNet = Math.max(0, ledgerPaid - ledgerRefunded);
                refundableMembershipAmount = ledgerNet > 0 ? ledgerNet : fallbackPaid;
                setRefundableMembershipAmount(refundableMembershipAmount);

                const finalOrigPaid = originalTx && Number(originalTx.amount) > 0 ? Number(originalTx.amount) : ledgerPaid;
                if (origPaidAmountEl) origPaidAmountEl.textContent = `₹${finalOrigPaid.toLocaleString('en-IN')}`;

                if (amountInput) {
                    amountInput.disabled = false;
                    amountInput.value = refundableMembershipAmount > 0 ? refundableMembershipAmount : '';
                    if (refundableMembershipAmount > 0) amountInput.max = refundableMembershipAmount;
                }
                if (maxRefundEl) maxRefundEl.textContent = `₹${refundableMembershipAmount.toLocaleString('en-IN')}`;
                handleMemRefundAmountChange(refundableMembershipAmount > 0 ? refundableMembershipAmount : 0);

                if (originalTx) {
                    if (origMethodEl && originalTx.payment_method) origMethodEl.textContent = originalTx.payment_method.toUpperCase();
                    if (origDateEl && (originalTx.paid_at || originalTx.created_at)) {
                        origDateEl.textContent = new Date(originalTx.paid_at || originalTx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    }
                }

                const lastMethod = (originalTx?.payment_method || purchaseToRefundObj.payment_method || 'cash').toLowerCase();
                if (methodSelect) {
                    methodSelect.value = ['cash', 'upi', 'card', 'bank_transfer'].includes(lastMethod) ? lastMethod : 'cash';
                }
            }
        } catch (err) {
            console.warn('Ledger query error (fallback used):', err);
        }
    })();
}

// ── Execute Refund in DB ───────────────────────────────────────────────────
export async function processMembershipRefund() {
    const amountInput = document.getElementById('rfMemAmountInput');
    const enteredRefundAmount = Math.abs(parseFloat(amountInput?.value || '0'));
    const purchaseToRefundObj = getPurchaseToRefundObj();
    const refundableMembershipAmount = getRefundableMembershipAmount();

    if (!purchaseToRefundObj || isNaN(enteredRefundAmount) || enteredRefundAmount <= 0) {
        showToast('Please enter a valid refund amount higher than 0.', '#dc2626');
        if (amountInput) amountInput.focus();
        return;
    }

    if (enteredRefundAmount > refundableMembershipAmount) {
        showToast(`Refund amount cannot exceed paid limit of ₹${refundableMembershipAmount.toLocaleString('en-IN')}`, '#dc2626');
        if (amountInput) {
            amountInput.value = refundableMembershipAmount;
            handleMemRefundAmountChange(refundableMembershipAmount);
            amountInput.focus();
        }
        return;
    }

    const reasonSelect = document.getElementById('rfMemReasonSelect');
    const reason = reasonSelect ? reasonSelect.value.trim() : '';
    if (!reason) {
        showToast('Please select a refund reason.', '#dc2626');
        if (reasonSelect) {
            reasonSelect.focus();
            reasonSelect.style.borderColor = '#ef4444';
            setTimeout(() => { if (reasonSelect) reasonSelect.style.borderColor = '#cbd5e1'; }, 2500);
        }
        return;
    }
    
    const confirmBtn = document.getElementById('confirmMemRefundBtn');
    const note = document.getElementById('rfMemNote')?.value.trim();
    const purchaseId = purchaseToRefundObj.purchase_id || purchaseToRefundObj.id;
    const method = (document.getElementById('rfMemMethodDisplay')?.value || 'cash').toLowerCase();
    const fullNotes = reason + (note ? ` - ${note}` : '');

    if (confirmBtn) {
        confirmBtn.innerHTML = '<span>Processing...</span>';
        confirmBtn.disabled = true;
    }

    try {
        // 1. Insert Refund into Ledger
        const { error: txError } = await insertRefundTransactionApi({
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            reference_id: purchaseId,
            reference_type: 'membership',
            amount: enteredRefundAmount,
            status: 'refunded',
            payment_method: method,
            notes: fullNotes || `Refund processed for membership ${purchaseId}`,
            paid_at: new Date().toISOString()
        });

        if (txError) {
             console.warn('business_transactions insert failed, but updating membership record anyway:', txError);
        }

        // 2. Update membership_purchases status AND notes column
        const refundDate = new Date().toISOString().split('T')[0];
        const { error: memError } = await updatePurchaseRefundStatusApi(purchaseId, {
            status: 'refunded',
            payment_status: 'refunded',
            notes: fullNotes || null,
            cancelled_date: refundDate
        });

        if (memError) throw memError;

        showToast('Membership has been refunded.', '#dc2626');
        if (window.notifyEvent) {
            window.notifyEvent('payments', 'evt_payment_refunded', {
                title: 'Membership Refunded',
                message: `Refund of ₹${enteredRefundAmount.toLocaleString('en-IN')} processed.`
            });
        }

        document.getElementById('refundMembershipAdvancedOverlay')?.classList.remove('active');
        
        await loadPurchases();

    } catch (err) {
        console.error('Membership Refund error:', err);
        showToast('Failed to process refund: ' + (err.message || 'Unknown error'), '#dc2626');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                <span>Issue Refund</span>
            `;
        }
    }
}

// ── View Refund Information Modal ──────────────────────────────────────────
export async function viewRefundInfo(purchaseId) {
    let modal = document.getElementById('refundInfoModalOverlay');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundInfoModalOverlay" style="z-index:9999;">
            <div class="modal-container" style="width: 950px; max-width: 95vw; padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div class="modal-header" style="background:#f8fafc; padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.15rem; color:#1e293b; font-weight: 600;"><i data-feather="info" style="width:18px; height:18px; margin-right:8px; color:#3b82f6; vertical-align:text-bottom;"></i>Refund Information</h2>
                    <button class="modal-close" onclick="document.getElementById('refundInfoModalOverlay').classList.remove('active')" style="background:none; border:none; cursor:pointer;"><i data-feather="x" style="color:#64748b;"></i></button>
                </div>
                <div class="modal-body" style="padding:24px; background: #fff;" id="refundInfoContent">
                    <div style="display:flex;justify-content:center;color:#94a3b8;padding: 40px 0;"><i data-feather="loader" class="spin"></i></div>
                </div>
                <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #fafafa;">
                    <button onclick="document.getElementById('refundInfoModalOverlay').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">Close</button>
                </div>
            </div>
        </div>
        `);
        if (window.feather) feather.replace();
        modal = document.getElementById('refundInfoModalOverlay');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }

    const content = document.getElementById('refundInfoContent');
    content.innerHTML = '<div style="display:flex;justify-content:center;color:#94a3b8;padding: 40px 0;"><i data-feather="loader" class="spin"></i></div>';
    if (window.feather) feather.replace();
    modal.classList.add('active');

    const currentPurchases = getCurrentPurchases();
    const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
    if (!purchase) {
        content.innerHTML = '<span style="color:#ef4444;">Purchase not found.</span>';
        return;
    }

    try {
        const { data, error } = await fetchTransactionsSummaryForPurchaseApi(purchaseId);

        if (error) throw error;

        let paidAmount = 0;
        let refundedAmount = 0;
        let cancelledDate = purchase.updated_at || null;
        let cancelledReason = purchase.notes || 'None provided';

        (data || []).forEach(tx => {
            const val = Math.abs(Number(tx.amount || 0));
            const stat = (tx.status || '').toLowerCase().trim();
            if (stat === 'paid') paidAmount += val;
            if (stat === 'refunded') {
                refundedAmount += val;
                if (!cancelledDate && tx.created_at) cancelledDate = tx.created_at;
                if (tx.notes && cancelledReason === 'None provided') cancelledReason = tx.notes;
            }
        });
        
        if (paidAmount === 0 && Number(purchase.price) > 0) paidAmount = Number(purchase.price);

        const custName = purchase.customer_name || `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'Unknown';
        const planName = purchase.plan_name || purchase.membership_name || purchase.name || 'Unknown Plan';
        const startDate = purchase.purchase_date || purchase.start_date || 'N/A';
        const cDateObj = cancelledDate ? new Date(cancelledDate) : null;
        const cDateStr = cDateObj ? cDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';
        const sDateObj = new Date(startDate);
        const sDateStr = isNaN(sDateObj) ? startDate : sDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const rawCancelDate = purchase.cancelled_date || purchase.updated_at || null;
        const cancelDateObj = rawCancelDate ? new Date(rawCancelDate) : null;
        const cancelDateStr = cancelDateObj && !isNaN(cancelDateObj) ? cancelDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Name</div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${custName}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Customer Plan</div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${planName}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Start Date</div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${sDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Refunded Date</div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${cDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Cancellation Date</div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${cancelDateStr}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Paid Amount</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #10b981;">₹${paidAmount.toLocaleString('en-IN')}</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Refunded Amount</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #dc2626;">₹${refundedAmount.toLocaleString('en-IN')}</div>
                </div>
            </div>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Reason for Cancellation</div>
                <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${purchase.notes || 'No reason specified.'}</div>
            </div>
        `;
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('viewRefundInfo error:', err);
        content.innerHTML = '<span style="color:#ef4444;">Failed to load refund summary.</span>';
    }
}
