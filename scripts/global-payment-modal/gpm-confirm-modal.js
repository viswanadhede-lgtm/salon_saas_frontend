// scripts/global-payment-modal/gpm-confirm-modal.js
import { gpmFormatCurrency } from './gpm-ui.js';

export function injectBookingConfirmModalHTML() {
    if (document.getElementById('gpmConfirmOverlay')) return;

    const el = document.createElement('div');
    el.id = 'gpmConfirmOverlay';
    el.innerHTML = `
        <div id="gpmConfirmBox">
            <!-- Payment received banner -->
            <div class="gpm-confirm-banner">
                <div class="gpm-confirm-banner-icon">
                    <i data-feather="check-circle" style="width:26px;height:26px;"></i>
                </div>
                <div class="gpm-confirm-banner-text">
                    <div class="gpm-confirm-amount" id="gpmConfirmAmount">&#8377;0 received</div>
                    <div class="gpm-confirm-from" id="gpmConfirmFrom">from Customer</div>
                </div>
            </div>

            <!-- Action Cards -->
            <div class="gpm-confirm-actions">
                <button class="gpm-confirm-card print" id="gpmConfirmPrintBtn" disabled title="Coming soon">
                    <div class="gpm-confirm-card-icon">
                        <i data-feather="printer" style="width:24px;height:24px;"></i>
                    </div>
                    <div class="gpm-confirm-card-label">Print Invoice</div>
                    <div class="gpm-confirm-card-sub">Coming soon</div>
                </button>
                <button class="gpm-confirm-card complete" id="gpmConfirmCompleteBtn">
                    <div class="gpm-confirm-card-icon">
                        <i data-feather="check-circle" style="width:24px;height:24px;"></i>
                    </div>
                    <div class="gpm-confirm-card-label" id="gpmConfirmCompleteLbl">Mark Booking<br>as Completed</div>
                    <div class="gpm-confirm-card-sub" id="gpmConfirmCompleteSub">Update booking status</div>
                </button>
            </div>

            <!-- Footer -->
            <div class="gpm-confirm-footer">
                <button class="gpm-confirm-exit-btn" id="gpmConfirmExitBtn">Exit</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);
}

export function openBookingConfirmModal(opts) {
    const overlay = document.getElementById('gpmConfirmOverlay');
    if (!overlay) return;

    // Populate banner
    const amountEl = document.getElementById('gpmConfirmAmount');
    const fromEl   = document.getElementById('gpmConfirmFrom');
    if (amountEl) amountEl.textContent = gpmFormatCurrency(opts.amountCollected || 0) + ' received';
    if (fromEl)   fromEl.textContent   = 'from ' + (opts.customerName || 'Customer');

    // Reset "Mark as Completed" button state
    const lbl = document.getElementById('gpmConfirmCompleteLbl');
    const sub = document.getElementById('gpmConfirmCompleteSub');
    const completeBtn = document.getElementById('gpmConfirmCompleteBtn');
    if (lbl) lbl.innerHTML = 'Mark Booking<br>as Completed';
    if (sub) sub.textContent = 'Update booking status';
    if (completeBtn) completeBtn.disabled = false;

    // Clone buttons to clear stale listeners
    function rebind(id) {
        const old = document.getElementById(id);
        if (!old) return null;
        const clone = old.cloneNode(true);
        old.parentNode.replaceChild(clone, old);
        return clone;
    }

    const newCompleteBtn = rebind('gpmConfirmCompleteBtn');
    const newExitBtn     = rebind('gpmConfirmExitBtn');

    // "Mark as Completed" handler
    newCompleteBtn?.addEventListener('click', async () => {
        if (newCompleteBtn.disabled) return;
        newCompleteBtn.disabled = true;
        const lbl2 = document.getElementById('gpmConfirmCompleteLbl');
        const sub2 = document.getElementById('gpmConfirmCompleteSub');
        if (lbl2) lbl2.innerHTML = 'Updating...';
        if (sub2) sub2.textContent = 'Please wait';

        try {
            if (typeof opts.onMarkComplete === 'function') {
                await opts.onMarkComplete();
            }
            overlay.classList.remove('active');
        } catch (err) {
            console.error('[BookingConfirm] Mark complete error:', err);
            if (lbl2) lbl2.innerHTML = 'Mark Booking<br>as Completed';
            if (sub2) sub2.textContent = 'Failed — try again';
            newCompleteBtn.disabled = false;
        }
    });

    // "Exit" handler — payment already saved, just close and refresh
    newExitBtn?.addEventListener('click', () => {
        overlay.classList.remove('active');
        if (typeof opts.onExit === 'function') opts.onExit();
    });

    overlay.classList.add('active');
    if (window.feather) feather.replace();
}
