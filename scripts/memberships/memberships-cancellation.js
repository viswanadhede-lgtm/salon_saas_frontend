// scripts/memberships/memberships-cancellation.js
import {
    getCompanyId,
    getBranchId,
    getCurrentPurchases,
    getPurchaseToCancel,
    setPurchaseToCancel
} from './memberships-state.js';
import { showToast, calculateDurationBetweenDates } from './memberships-utils.js';
import {
    cancelMembershipPurchaseApi,
    insertCancellationLedgerApi,
    fetchPurchaseByIdApi
} from './memberships-api.js';
import { loadPurchases } from './memberships-purchases-table.js';

// ── Setup Cancellation Confirmation Modal ──────────────────────────────────
export function setupCancelPurchaseModal() {
    const existingOverlay = document.getElementById('cancelPurchaseConfirmOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const modalHtml = `
    <div class="modal-overlay" id="cancelPurchaseConfirmOverlay" style="z-index: 9999; backdrop-filter: blur(4px);">
        <div style="background: #fff; border-radius: 12px; width: 950px; max-width: 95vw; padding: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                <h2 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: #0f172a;">Cancel Membership</h2>
                <p style="margin: 6px 0 0; font-size: 0.95rem; color: #64748b;">Are you sure you want to cancel this membership?</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 24px; margin-bottom: 24px; font-size: 0.95rem; color: #1e293b;">
                <div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #64748b; margin-right: 4px;">Customer:</span>
                        <span id="cancelMemCustomerName" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #64748b; margin-right: 4px;">Plan:</span>
                        <span id="cancelMemPlanName" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                    <div>
                        <span style="color: #64748b; margin-right: 4px;">Plan Start Date:</span>
                        <span id="cancelMemStartDate" style="font-weight: 600; color: #4f46e5;">—</span>
                    </div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 120px;">
                    <span style="color: #64748b; display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">Duration</span>
                    <span id="cancelMemDurationDisplay" style="font-weight: 600; color: #4f46e5; font-size: 0.95rem;">—</span>
                </div>
            </div>

            <div style="margin-bottom: 32px;">
                <label style="display: block; font-size: 0.85rem; color: #475569; margin-bottom: 8px;">Reason (Optional)</label>
                <textarea id="cnlMemNote" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 0.95rem; outline: none; background: #fafafa; color: #1e293b; height: 100px; resize: none;" placeholder=""></textarea>
            </div>

            <div style="display: flex; gap: 12px;">
                <button id="btnCancelCancelPurchase" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Keep Membership</button>
                <button id="btnConfirmCancelPurchase" style="flex: 1; padding: 10px; border-radius: 6px; border: none; background: #ef4444; color: #fff; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">Cancel Membership</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.feather) feather.replace();

    const overlay = document.getElementById('cancelPurchaseConfirmOverlay');

    document.getElementById('btnCancelCancelPurchase').addEventListener('click', () => {
        overlay.classList.remove('active');
        setPurchaseToCancel(null);
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            setPurchaseToCancel(null);
        }
    });

    document.getElementById('btnConfirmCancelPurchase').addEventListener('click', async () => {
        const purchaseToCancel = getPurchaseToCancel();
        if (!purchaseToCancel) return;
        const noteFieldValue = document.getElementById('cnlMemNote')?.value.trim() || null;
        overlay.classList.remove('active');
        await executeCancelMembershipPurchase(purchaseToCancel, noteFieldValue);
        setPurchaseToCancel(null);
    });
}

// ── Open Cancellation Modal ────────────────────────────────────────────────
export function cancelMembershipPurchase(purchaseId) {
    try {
        setupCancelPurchaseModal();
        setPurchaseToCancel(purchaseId);
        
        const currentPurchases = getCurrentPurchases();
        const purchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId);
        if (purchase) {
            const fullName = purchase.customer_name || `${purchase.first_name||''} ${purchase.last_name||''}`.trim() || 'Unknown';
            const planName = purchase.plan_name || purchase.membership_name || purchase.name || 'Unknown Plan';
            
            document.getElementById('cancelMemCustomerName').textContent = fullName;
            document.getElementById('cancelMemPlanName').textContent = planName;
            
            const rawStart = purchase.purchase_date || purchase.start_date || purchase.created_at;
            document.getElementById('cancelMemStartDate').textContent = rawStart ? new Date(rawStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';
            
            const durationText = calculateDurationBetweenDates(rawStart, new Date());
            document.getElementById('cancelMemDurationDisplay').textContent = durationText;
        }

        const noteEl = document.getElementById('cnlMemNote');
        if (noteEl) noteEl.value = '';
        
        document.getElementById('cancelPurchaseConfirmOverlay').classList.add('active');
    } catch (err) {
        console.error("Error opening cancel modal: ", err);
        showToast("Error opening cancel modal");
    }
}

// ── Execute Cancellation in DB ─────────────────────────────────────────────
export async function executeCancelMembershipPurchase(purchaseId, notes = null) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { error } = await cancelMembershipPurchaseApi(purchaseId, notes, today);
        if (error) throw error;

        // Audit Trail: Insert Cancelled Ledger Row
        const { error: txError } = await insertCancellationLedgerApi({
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            reference_id: purchaseId,
            reference_type: 'membership',
            amount: 0,
            currency: 'INR',
            payment_method: 'cash',
            status: 'cancelled',
            notes: 'Membership Cancelled (No Refund Processed)',
            paid_at: new Date().toISOString().replace('Z', '')
        });
            
        if (txError) {
            console.error('Ledger recording failed for cancellation:', txError);
        }

        showToast('Membership has been cancelled.');
        await loadPurchases();
    } catch (err) {
        console.error('cancelMembershipPurchase error:', err);
        showToast('Error cancelling membership: ' + (err.message || ''));
    }
}

// ── View Purchase Notes (Cancellation Details) ─────────────────────────────
export async function viewPurchaseNotes(purchaseId) {
    let modal = document.getElementById('refundNotesModalOverlay');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundNotesModalOverlay" style="z-index:9999;">
            <div class="modal-container" style="width: 950px; max-width: 95vw; padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div class="modal-header" style="background:#f8fafc; padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem; color:#1e293b;"><i data-feather="info" style="width:16px; height:16px; margin-right:8px; color:#3b82f6; vertical-align:text-bottom;"></i>Details</h2>
                    <button class="modal-close" onclick="document.getElementById('refundNotesModalOverlay').classList.remove('active')" style="background:none; border:none; cursor:pointer;"><i data-feather="x" style="color:#64748b;"></i></button>
                </div>
                <div class="modal-body" style="padding:24px; min-height:80px; color:#334155; font-size:0.95rem; line-height:1.5;" id="refundNotesContent">
                    Loading note...
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #fff;">
                    <button onclick="document.getElementById('refundNotesModalOverlay').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 500; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Close</button>
                </div>
            </div>
        </div>
        `);
        if (window.feather) feather.replace();
        modal = document.getElementById('refundNotesModalOverlay');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }

    const content = document.getElementById('refundNotesContent');
    content.innerHTML = '<div style="display:flex;justify-content:center;color:#94a3b8;"><i data-feather="loader" class="spin"></i></div>';
    if (window.feather) feather.replace();
    modal.classList.add('active');

    const currentPurchases = getCurrentPurchases();
    const basePurchase = currentPurchases.find(p => (p.purchase_id || p.id) === purchaseId) || {};
    try {
        const { data, error } = await fetchPurchaseByIdApi(purchaseId);

        if (error) throw error;
        if (data && data.length > 0) {
            renderCancelNoteLayout({ ...basePurchase, ...data[0] }, content);
            return;
        }
        content.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No reason provided.</span>';
    } catch (err) {
        console.error('viewPurchaseNotes error:', err);
        content.innerHTML = '<span style="color:#ef4444;">Failed to load note.</span>';
    }
}

export function renderCancelNoteLayout(record, contentElem) {
    const custName = record.customer_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown';
    const planName = record.plan_name || record.membership_name || record.name || 'Unknown Plan';
    
    const rawStart = record.purchase_date || record.start_date || record.created_at;
    const startObj = rawStart ? new Date(rawStart) : null;
    const startStr = startObj && !isNaN(startObj) ? startObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

    const rawCancel = record.cancelled_date || record.updated_at || null;
    const cancelObj = rawCancel ? new Date(rawCancel) : null;
    const cancelStr = cancelObj && !isNaN(cancelObj) ? cancelObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown';

    const durationText = calculateDurationBetweenDates(startObj, cancelObj);
    const notesStr = record.notes || 'No reason specified.';

    contentElem.innerHTML = `
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
                <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${startStr}</div>
            </div>
            <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Cancelled On</div>
                <div style="font-size: 0.95rem; font-weight: 500; color: #0f172a;">${cancelStr}</div>
            </div>
            <div style="padding: 16px; border-right: 1px solid #e2e8f0; background: #fff;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Duration</div>
                <div style="font-size: 0.95rem; font-weight: 600; color: #4f46e5;">${durationText}</div>
            </div>
            <div style="padding: 16px; background: #fff;">
                <!-- Empty cell to cleanly finish the grid row -->
            </div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Reason for Cancellation</div>
            <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${notesStr}</div>
        </div>
    `;
}
