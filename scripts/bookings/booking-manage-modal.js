// scripts/bookings/booking-manage-modal.js
import { supabase } from '../../lib/supabase.js';
import { getLiveBookings, formatTime12 } from './bookings-state.js';
import { fetchBookings } from './bookings-data.js';
import { openEditBookingModal } from './booking-edit-modal.js';

// Module state for Manage Booking
const manageState = {
    activeBookingId: null,
    selectedStatus: 'booked',
    activeBooking: null
};

// ─── Status Configurations & SVGs ─────────────────────────────────────────────
const STATUS_CONFIGS = {
    'booked': {
        label: 'Booked',
        color: '#7c3aed',
        bg: '#ede9fe',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
    },
    'in progress': {
        label: 'In Progress',
        color: '#2563eb',
        bg: '#dbeafe',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
    },
    'completed': {
        label: 'Completed',
        color: '#16a34a',
        bg: '#dcfce7',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10 15 7 12"></polyline></svg>`
    },
    'cancelled': {
        label: 'Cancelled',
        color: '#dc2626',
        bg: '#fee2e2',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    },
    'no-show': {
        label: 'No-show',
        color: '#ea580c',
        bg: '#ffedd5',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`
    }
};

// ─── Open Choice Modal (Intermediate 2-Card Picker) ───────────────────────────
export function openBookingUpdateChoiceModal(bookingId) {
    if (!bookingId) return;
    const b = (getLiveBookings() || []).find(x => String(x.booking_id || x.id) === String(bookingId));
    if (!b) {
        console.warn('[ManageBooking] Booking not found for id:', bookingId);
        return;
    }

    manageState.activeBookingId = bookingId;
    manageState.activeBooking = b;

    const modal = document.getElementById('bookingUpdateChoiceModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// ─── Close Choice Modal ───────────────────────────────────────────────────────
export function closeBookingUpdateChoiceModal() {
    const modal = document.getElementById('bookingUpdateChoiceModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ─── Open Manage Booking Modal ────────────────────────────────────────────────
export async function openManageBookingModal(bookingId) {
    closeBookingUpdateChoiceModal();

    const id = bookingId || manageState.activeBookingId;
    if (!id) return;

    let b = (getLiveBookings() || []).find(x => String(x.booking_id || x.id) === String(id));
    if (!b) {
        console.warn('[ManageBooking] Booking not found for id:', id);
        return;
    }

    manageState.activeBookingId = id;
    manageState.activeBooking = b;

    // 1. Populate Booking ID badge
    const bkIdEl = document.getElementById('mbSummaryBkId');
    if (bkIdEl) {
        bkIdEl.textContent = '#' + (id || '').slice(0, 8).toUpperCase();
    }

    // 2. Format Date
    const dateEl = document.getElementById('mbSummaryDate');
    if (dateEl) {
        let dateText = '—';
        if (b.booking_date) {
            try {
                const d = new Date(`${b.booking_date}T00:00`);
                dateText = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            } catch { dateText = b.booking_date; }
        }
        dateEl.textContent = dateText;
    }

    // 3. Format Time
    const timeEl = document.getElementById('mbSummaryTime');
    if (timeEl) {
        timeEl.textContent = b.start_time ? formatTime12((b.start_time || '').slice(0, 5)) : '—';
    }

    // 4. Format Duration
    const durEl = document.getElementById('mbSummaryDuration');
    if (durEl) {
        let dur = '40 Min';
        if (b.duration || b.duration_minutes) {
            dur = `${b.duration || b.duration_minutes} Min`;
        } else if (b.start_time && b.end_time) {
            try {
                const [sh, sm] = b.start_time.split(':').map(Number);
                const [eh, em] = b.end_time.split(':').map(Number);
                const diff = (eh * 60 + em) - (sh * 60 + sm);
                if (diff > 0) dur = `${diff} Min`;
            } catch { dur = '40 Min'; }
        }
        durEl.textContent = dur;
    }

    // 5. Current Status Badge in Summary Card
    const currentStatus = (b.status || 'booked').toLowerCase().trim();
    const cfg = STATUS_CONFIGS[currentStatus] || STATUS_CONFIGS['booked'];
    const badgeEl = document.getElementById('mbSummaryStatusBadge');
    if (badgeEl) {
        badgeEl.textContent = `● ${cfg.label}`;
        badgeEl.style.background = cfg.bg;
        badgeEl.style.color = cfg.color;
    }

    // 6. Customer Email & Phone
    let cEmail = b.customer_email || b.customer_mail || b.email || '';
    if (!cEmail && b.customer_id) {
        try {
            const { data } = await supabase
                .from('customers')
                .select('customer_email')
                .eq('customer_id', b.customer_id)
                .limit(1)
                .single();
            if (data && data.customer_email) cEmail = data.customer_email;
        } catch { /* ignore fallback */ }
    }
    const emailEl = document.getElementById('mbSummaryEmail');
    if (emailEl) {
        emailEl.textContent = cEmail || b.customer_name || 'Walk-in Customer';
        emailEl.title = emailEl.textContent;
    }

    const phoneEl = document.getElementById('mbSummaryPhone');
    if (phoneEl) {
        phoneEl.textContent = b.customer_phone || b.phone || '—';
    }

    // 7. Services & Staff
    const svcEl = document.getElementById('mbSummaryServices');
    if (svcEl) {
        const servicesList = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
            .filter(Boolean)
            .flatMap(s => s.split(',').map(item => item.trim()))
            .filter(Boolean);
        svcEl.textContent = servicesList.length ? servicesList.join(', ') : '—';
        svcEl.title = svcEl.textContent;
    }

    const staffEl = document.getElementById('mbSummaryStaff');
    if (staffEl) {
        const staffList = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => s.split(',').map(item => item.trim()))
            .filter(Boolean);
        staffEl.textContent = staffList.length ? staffList.join(', ') : '—';
        staffEl.title = staffEl.textContent;
    }

    // 8. Amount
    const amtEl = document.getElementById('mbSummaryAmount');
    if (amtEl) {
        const amt = b.final_amount != null ? b.final_amount : (b.total_price != null ? b.total_price : (b.price || 0));
        amtEl.textContent = `₹${Number(amt).toLocaleString('en-IN')}`;
    }

    // 9. Initialize Dropdown with Current Status (Closed by default)
    selectDropdownStatus(currentStatus);
    const menuEl = document.getElementById('mbStatusDropdownMenu');
    if (menuEl) menuEl.style.display = 'none';
    const chevronEl = document.getElementById('mbStatusChevron');
    if (chevronEl) chevronEl.style.transform = 'rotate(0deg)';

    // Open Modal
    const modal = document.getElementById('manageBookingModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// ─── Close Manage Booking Modal ───────────────────────────────────────────────
export function closeManageBookingModal() {
    const modal = document.getElementById('manageBookingModal');
    if (modal) {
        modal.classList.remove('active');
    }
    const menuEl = document.getElementById('mbStatusDropdownMenu');
    if (menuEl) menuEl.style.display = 'none';
    const chevronEl = document.getElementById('mbStatusChevron');
    if (chevronEl) chevronEl.style.transform = 'rotate(0deg)';
    manageState.activeBookingId = null;
    manageState.activeBooking = null;
}

// ─── Set Selected Dropdown Option & Update Visual State ───────────────────────
function selectDropdownStatus(statusKey) {
    const key = (statusKey || 'booked').toLowerCase().trim();
    const cfg = STATUS_CONFIGS[key] || STATUS_CONFIGS['booked'];
    manageState.selectedStatus = key;

    // Update Trigger display
    const triggerContent = document.getElementById('mbStatusTriggerContent');
    if (triggerContent) {
        triggerContent.innerHTML = `
            ${cfg.iconSvg}
            <span style="font-size:0.88rem;font-weight:600;color:#0f172a;">${cfg.label}</span>
        `;
    }

    // Update option highlights in dropdown menu
    const options = document.querySelectorAll('#mbStatusDropdownMenu .mb-status-option');
    options.forEach(opt => {
        const optStatus = (opt.dataset.status || '').toLowerCase().trim();
        const checkIcon = opt.querySelector('.mb-check-icon');
        if (optStatus === key) {
            opt.style.background = '#f5f3ff';
            opt.querySelector('span').style.color = '#6d28d9';
            opt.querySelector('span').style.fontWeight = '600';
            if (checkIcon) checkIcon.style.display = 'block';
        } else {
            opt.style.background = 'transparent';
            opt.querySelector('span').style.color = '#0f172a';
            opt.querySelector('span').style.fontWeight = '500';
            if (checkIcon) checkIcon.style.display = 'none';
        }
    });
}

// ─── Save / Update Status to Database ─────────────────────────────────────────
export async function saveManageBookingStatus() {
    const bookingId = manageState.activeBookingId;
    const newStatus = manageState.selectedStatus;
    const booking = manageState.activeBooking;

    if (!bookingId || !newStatus) return;

    // Check payment rule if status is set to completed
    if (newStatus.toLowerCase() === 'completed') {
        const liveData = getLiveBookings() || [];
        const b = liveData.find(x => String(x.booking_id || x.id) === String(bookingId)) || booking;
        const payment = (b?.payment_status || b?.payment || '').toLowerCase().trim();
        if (payment !== 'paid') {
            closeManageBookingModal();
            if (window.showPaymentNotCompletedModal) {
                window.showPaymentNotCompletedModal(bookingId);
            } else if (window.openBookingPayment) {
                window.openBookingPayment(bookingId);
            }
            return;
        }
    }

    const btn = document.getElementById('btnMbUpdateStatus');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin" style="animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path></svg>
            Updating...
        `;
    }

    try {
        const { error: dbError } = await supabase
            .from('bookings')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('booking_id', bookingId);

        if (dbError) {
            console.error('[ManageBooking] Supabase status update error:', dbError);
            window.toast && window.toast('Error: ' + dbError.message);
            return;
        }

        const { error: summaryErr } = await supabase
            .from('bookings_for_business_transaction')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('booking_id', bookingId);
        if (summaryErr) console.warn('[ManageBooking] summary update error:', summaryErr);

        window.toast && window.toast(`Booking status updated to ${newStatus}`);

        // Fire notification events
        if (window.notifyEvent) {
            const statusEventMap = {
                'confirmed': 'evt_booking_confirmed',
                'cancelled': 'evt_booking_cancelled',
                'completed': 'evt_booking_completed',
                'no-show': 'evt_booking_noshow'
            };
            const evtKey = statusEventMap[newStatus.toLowerCase()];
            if (evtKey) {
                window.notifyEvent('bookings', evtKey, {
                    title: `Booking ${newStatus}`,
                    message: `Booking status changed to ${newStatus}.`
                });
            }
        }

        if (window.notifyCustomer) {
            const customerEvtMap = {
                'confirmed': 'booking_confirm',
                'cancelled': 'booking_cancel',
                'completed': 'booking_complete',
                'no-show': 'booking_noshow'
            };
            const custEvtKey = customerEvtMap[newStatus.toLowerCase()];
            if (custEvtKey) {
                const liveData = getLiveBookings() || [];
                const b = liveData.find(x => String(x.booking_id || x.id) === String(bookingId)) || booking;
                window.notifyCustomer('booking', custEvtKey, {
                    name: b?.customer_name,
                    phone: b?.customer_phone || b?.phone,
                    email: b?.customer_email || b?.email
                }, {
                    bookingId: bookingId,
                    status: newStatus,
                    service: b?.service_name,
                    date: b?.booking_date,
                    time: b?.booking_time
                });
            }
        }

        closeManageBookingModal();
        await fetchBookings();
    } catch (err) {
        console.error('[ManageBooking] Network error updating booking status:', err);
        window.toast && window.toast('Network error updating booking status.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = originalText;
        }
    }
}

// ─── Attach Listeners ─────────────────────────────────────────────────────────
export function attachManageModalListeners() {
    document.addEventListener('click', (e) => {
        // 1. Choice Modal Close
        if (e.target.closest('#btnCloseUpdateChoiceModal') || e.target.closest('#btnCancelUpdateChoiceModal') || e.target.id === 'bookingUpdateChoiceModal') {
            closeBookingUpdateChoiceModal();
            return;
        }

        // 2. Choice Modal: Click "Edit Booking" card
        const editCard = e.target.closest('#cardChoiceEditBooking');
        if (editCard) {
            const bId = manageState.activeBookingId;
            closeBookingUpdateChoiceModal();
            if (bId) {
                openEditBookingModal(bId);
            }
            return;
        }

        // 3. Choice Modal: Click "Manage Booking" card
        const manageCard = e.target.closest('#cardChoiceManageBooking');
        if (manageCard) {
            const bId = manageState.activeBookingId;
            if (bId) {
                openManageBookingModal(bId);
            }
            return;
        }

        // 4. Manage Modal Close (Header '✕' or Backdrop click)
        if (e.target.closest('#btnCloseManageBookingModal') || e.target.id === 'manageBookingModal') {
            closeManageBookingModal();
            return;
        }

        // 5. Dropdown Trigger Click (Toggle dropdown menu open/close)
        const trigger = e.target.closest('#mbStatusDropdownTrigger');
        if (trigger) {
            const menu = document.getElementById('mbStatusDropdownMenu');
            const chevron = document.getElementById('mbStatusChevron');
            if (menu) {
                const isClosed = menu.style.display === 'none' || !menu.style.display;
                menu.style.display = isClosed ? 'flex' : 'none';
                if (chevron) {
                    chevron.style.transform = isClosed ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            }
            return;
        }

        // 6. Dropdown Option Click (Select & Close Dropdown)
        const option = e.target.closest('.mb-status-option');
        if (option && option.closest('#mbStatusDropdownMenu')) {
            const statusKey = option.dataset.status;
            if (statusKey) {
                selectDropdownStatus(statusKey);
            }
            const menu = document.getElementById('mbStatusDropdownMenu');
            if (menu) menu.style.display = 'none';
            const chevron = document.getElementById('mbStatusChevron');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
            return;
        }

        // 6b. Click Outside Dropdown to Close
        if (!e.target.closest('#mbStatusDropdownTrigger') && !e.target.closest('#mbStatusDropdownMenu')) {
            const menu = document.getElementById('mbStatusDropdownMenu');
            if (menu && menu.style.display !== 'none') {
                menu.style.display = 'none';
                const chevron = document.getElementById('mbStatusChevron');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }
        }

        // 7. Click "Update Status" button in footer
        if (e.target.closest('#btnMbUpdateStatus')) {
            saveManageBookingStatus();
            return;
        }
    });
}

// ─── Global Contract ──────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openBookingUpdateChoiceModal = openBookingUpdateChoiceModal;
    window.closeBookingUpdateChoiceModal = closeBookingUpdateChoiceModal;
    window.openManageBookingModal = openManageBookingModal;
    window.closeManageBookingModal = closeManageBookingModal;
    window.saveManageBookingStatus = saveManageBookingStatus;
}
