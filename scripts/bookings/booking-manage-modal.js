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

// ─── Helpers: Escape HTML & Expandable +N Badges ─────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function toggleMbExtra(btn, extraCount) {
    if (!btn) return;
    const el = btn.nextElementSibling;
    if (!el) return;
    const isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display = isHidden ? 'flex' : 'none';
    btn.textContent  = isHidden ? '▲ less' : `+${extraCount}`;
}

if (typeof window !== 'undefined') {
    window.toggleMbExtra = toggleMbExtra;
}

function renderExpandableList(items) {
    if (!items || !items.length) return '—';
    const firstItem = items[0];
    if (items.length === 1) {
        return `<span style="font-size:0.86rem;font-weight:700;color:#0f172a;word-break:break-word;">${escapeHtml(firstItem)}</span>`;
    }
    const extraCount = items.length - 1;
    const extraPills = items.slice(1).map(item =>
        `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;word-break:break-word;">${escapeHtml(item)}</span>`
    ).join('');

    return `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;">
            <span style="font-size:0.86rem;font-weight:700;color:#0f172a;word-break:break-word;">${escapeHtml(firstItem)}</span>
            <span onclick="window.toggleMbExtra(this, ${extraCount})"
                style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:700;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;transition:all 0.15s;"
                onmouseover="this.style.background='#c7d2fe'"
                onmouseout="this.style.background='#e0e7ff'">+${extraCount}</span>
            <div style="display:none;flex-wrap:wrap;gap:4px;width:100%;margin-top:4px;">
                ${extraPills}
            </div>
        </div>
    `;
}

// ─── Status Configurations & SVGs ─────────────────────────────────────────────
const STATUS_CONFIGS = {
    'booked': {
        label: 'Booked',
        color: '#6d28d9',
        border: '#c4b5fd',
        bg: '#f5f3ff',
        dot: '#7c3aed',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
    },
    'pending': {
        label: 'Booked',
        color: '#6d28d9',
        border: '#c4b5fd',
        bg: '#f5f3ff',
        dot: '#7c3aed',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
    },
    'confirmed': {
        label: 'Confirmed',
        color: '#1e40af',
        border: '#93c5fd',
        bg: '#eff6ff',
        dot: '#2563eb',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
    },
    'in progress': {
        label: 'In Progress',
        color: '#1d4ed8',
        border: '#93c5fd',
        bg: '#eff6ff',
        dot: '#2563eb',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
    },
    'completed': {
        label: 'Completed',
        color: '#15803d',
        border: '#86efac',
        bg: '#f0fdf4',
        dot: '#16a34a',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10 15 7 12"></polyline></svg>`
    },
    'cancelled': {
        label: 'Cancelled',
        color: '#b91c1c',
        border: '#fca5a5',
        bg: '#fef2f2',
        dot: '#dc2626',
        iconSvg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    },
    'no-show': {
        label: 'No-show',
        color: '#c2410c',
        border: '#fdba74',
        bg: '#fff7ed',
        dot: '#ea580c',
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
        const editCard = modal.querySelector('#cardChoiceEditBooking');
        const payStatus = (b.payment_status || b.payment || '').toLowerCase();
        const isPaid = payStatus === 'paid';
        const isRefunded = payStatus === 'refunded';

        if (editCard) {
            if (isPaid || isRefunded) {
                editCard.dataset.disabled = 'true';
                editCard.style.opacity = '0.55';
                editCard.style.cursor = 'not-allowed';
                editCard.style.background = '#f8fafc';
                editCard.style.borderColor = '#e2e8f0';

                const badge = editCard.querySelector('.edit-card-badge');
                if (badge) {
                    badge.textContent = isPaid ? 'Locked (Paid)' : 'Locked (Refunded)';
                    badge.style.color = isPaid ? '#047857' : '#b91c1c';
                    badge.style.background = isPaid ? '#d1fae5' : '#fee2e2';
                }
                const note = editCard.querySelector('.edit-card-note');
                if (note) {
                    note.textContent = isPaid
                        ? 'This appointment is already paid. Services, staff, and pricing cannot be edited.'
                        : 'This appointment is refunded and cannot be edited.';
                }
                const action = editCard.querySelector('.edit-card-action');
                if (action) {
                    action.innerHTML = `
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#64748b;"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        <span style="color:#64748b;">Editing Locked</span>
                    `;
                }
            } else {
                editCard.dataset.disabled = 'false';
                editCard.style.opacity = '1';
                editCard.style.cursor = 'pointer';
                editCard.style.background = '#ffffff';
                editCard.style.borderColor = '#e2e8f0';

                const badge = editCard.querySelector('.edit-card-badge');
                if (badge) {
                    badge.textContent = 'Schedule & Svc';
                    badge.style.color = '#4338ca';
                    badge.style.background = '#e0e7ff';
                }
                const note = editCard.querySelector('.edit-card-note');
                if (note) {
                    note.textContent = 'Modify appointment date, time, services, assigned staff, or pricing.';
                }
                const action = editCard.querySelector('.edit-card-action');
                if (action) {
                    action.innerHTML = `
                        Open Editor
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    `;
                }
            }
        }

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
    const currentStatus = (b.booking_status || b.status || 'booked').toLowerCase().trim();
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
            const { data } = await supabase.schema('app')
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
        svcEl.style.whiteSpace = 'normal';
        svcEl.style.overflow = 'visible';
        const servicesList = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
            .filter(Boolean)
            .flatMap(s => s.split(',').map(item => item.trim()))
            .filter(Boolean);
        svcEl.innerHTML = renderExpandableList(servicesList);
        svcEl.title = servicesList.join(', ');
    }

    const staffEl = document.getElementById('mbSummaryStaff');
    if (staffEl) {
        staffEl.style.whiteSpace = 'normal';
        staffEl.style.overflow = 'visible';
        const staffList = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => s.split(',').map(item => item.trim()))
            .filter(Boolean);
        staffEl.innerHTML = renderExpandableList(staffList);
        staffEl.title = staffList.join(', ');
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

    // 1. Update Selected Trigger Field background, border, text, and chevron color
    const triggerEl = document.getElementById('mbStatusDropdownTrigger');
    if (triggerEl) {
        triggerEl.style.background = cfg.bg;
        triggerEl.style.borderColor = cfg.border;
        triggerEl.style.boxShadow = `0 1px 3px ${cfg.bg}`;
    }

    const triggerContent = document.getElementById('mbStatusTriggerContent');
    if (triggerContent) {
        triggerContent.innerHTML = `
            ${cfg.iconSvg}
            <span style="font-size:0.88rem;font-weight:700;color:${cfg.color};">${cfg.label}</span>
        `;
    }

    const chevronEl = document.getElementById('mbStatusChevron');
    if (chevronEl) {
        chevronEl.style.stroke = cfg.color;
    }

    // 2. Also keep the Booking Summary status badge synchronized
    const badgeEl = document.getElementById('mbSummaryStatusBadge');
    if (badgeEl) {
        badgeEl.textContent = `● ${cfg.label}`;
        badgeEl.style.background = cfg.bg;
        badgeEl.style.color = cfg.color;
    }

    // 3. Update option items in dropdown menu with their specific colors
    const options = document.querySelectorAll('#mbStatusDropdownMenu .mb-status-option');
    options.forEach(opt => {
        const optStatus = (opt.dataset.status || '').toLowerCase().trim();
        const optCfg = STATUS_CONFIGS[optStatus] || STATUS_CONFIGS['booked'];
        const textSpan = opt.querySelector('span');
        const checkIcon = opt.querySelector('.mb-check-icon');

        if (optStatus === key) {
            opt.style.background = optCfg.bg;
            if (textSpan) {
                textSpan.style.color = optCfg.color;
                textSpan.style.fontWeight = '700';
            }
            if (checkIcon) {
                checkIcon.style.display = 'block';
                checkIcon.style.stroke = optCfg.color;
            }
        } else {
            opt.style.background = 'transparent';
            if (textSpan) {
                textSpan.style.color = '#334155';
                textSpan.style.fontWeight = '500';
            }
            if (checkIcon) {
                checkIcon.style.display = 'none';
            }
        }

        // Add distinct hover tint per status option
        opt.onmouseenter = () => {
            if ((opt.dataset.status || '').toLowerCase().trim() !== manageState.selectedStatus) {
                opt.style.background = optCfg.bg;
                if (textSpan) textSpan.style.color = optCfg.color;
            }
        };
        opt.onmouseleave = () => {
            if ((opt.dataset.status || '').toLowerCase().trim() !== manageState.selectedStatus) {
                opt.style.background = 'transparent';
                if (textSpan) textSpan.style.color = '#334155';
            }
        };
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
        const companyId = manageState.activeBooking?.company_id || localStorage.getItem('company_id');
        const rawBranch = manageState.activeBooking?.branch_id || localStorage.getItem('branch_id');
        const branchId  = (rawBranch && rawBranch !== 'all' && rawBranch !== 'branch_1' && rawBranch !== 'branch_2') ? rawBranch : null;

        const { data: resData, error: dbError } = await supabase.rpc('update_booking_status_atomic', {
            p_booking_id: bookingId,
            p_company_id: companyId,
            p_branch_id: branchId,
            p_new_status: newStatus
        });

        if (dbError || resData?.success === false) {
            const errMsg = dbError?.message || resData?.error || 'Failed to update booking status';
            console.error('[ManageBooking] Supabase status update error:', errMsg);
            window.toast && window.toast('Error: ' + errMsg);
            return;
        }

        window.toast && window.toast(`Booking status updated to ${newStatus}`);

        // Dispatch cross-tab / cross-component sync event
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId, status: newStatus }
        }));
        try {
            localStorage.setItem('app_payment_sync', JSON.stringify({ bookingId, status: newStatus, time: Date.now() }));
        } catch (e) {}

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
            if (editCard.dataset.disabled === 'true') {
                const payStatus = (manageState.activeBooking?.payment_status || manageState.activeBooking?.payment || '').toLowerCase();
                const msg = payStatus === 'paid'
                    ? 'This booking is already paid. Services and pricing cannot be edited. Please issue a refund first if changes are needed.'
                    : 'Refunded bookings cannot be edited.';
                if (window.toast) {
                    window.toast(msg, '#ef4444');
                } else {
                    alert(msg);
                }
                return;
            }
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
