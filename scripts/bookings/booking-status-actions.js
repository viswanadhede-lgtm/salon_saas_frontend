// scripts/bookings/booking-status-actions.js
import { supabase } from '../../lib/supabase.js';
import { getCompanyId, getBranchId, getLiveBookings, statusUpdateState } from './bookings-state.js';
import { fetchBookings } from './bookings-data.js';

export function updateBookingStatus(bookingId, newStatus) {
    if (!bookingId || !newStatus) return;
    statusUpdateState.bookingId = bookingId;
    statusUpdateState.newStatus = newStatus;
    
    const textEl = document.getElementById('updateStatusConfirmText');
    if (textEl) {
        textEl.innerHTML = `Change this booking's status to <strong>${newStatus}</strong>?`;
    }

    // Dynamic button label + colour based on status
    const btnConfirm = document.getElementById('btnConfirmUpdateStatus');
    if (btnConfirm) {
        const statusConfig = {
            'completed': { label: 'Mark Completed', bg: '#22c55e', hover: '#16a34a' },
            'cancelled':  { label: 'Mark Cancelled',  bg: '#dc2626', hover: '#b91c1c' },
            'no-show':    { label: 'Mark No-show',    bg: '#ea580c', hover: '#c2410c' },
        };
        const cfg = statusConfig[newStatus.toLowerCase()] || { label: 'Yes, Update', bg: '#2563eb', hover: '#1d4ed8' };
        btnConfirm.textContent = cfg.label;
        btnConfirm.style.background = cfg.bg;
        btnConfirm.onmouseover = () => btnConfirm.style.background = cfg.hover;
        btnConfirm.onmouseout  = () => btnConfirm.style.background = cfg.bg;
    }

    const overlay = document.getElementById('updateStatusConfirmOverlay');
    if (overlay) overlay.classList.add('active');
    if (window.feather) feather.replace();
}

if (typeof window !== 'undefined') {
    window.updateBookingStatus = updateBookingStatus;
}

export async function confirmUpdateBookingStatus() {
    if (!statusUpdateState.bookingId || !statusUpdateState.newStatus) return;
    const bookingId = statusUpdateState.bookingId;
    const newStatus = statusUpdateState.newStatus;
    
    document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
    document.getElementById('fullScreenUpdateStatusLoader')?.classList.add('active');
    
    try {
        const { error: dbError } = await supabase
            .from('bookings')
            .update({ status: newStatus })
            .eq('booking_id', bookingId);

        if (dbError) {
            console.error('Supabase status update error:', dbError);
            window.toast && window.toast('Error: ' + dbError.message);
            return;
        }
        
        const { error: summaryErr } = await supabase
            .from('bookings_for_business_transaction')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('booking_id', bookingId);
        if (summaryErr) console.error('[Status Update] summary update error:', summaryErr);

        if (newStatus.toLowerCase() === 'cancelled') {
            const { error: ledgerErr } = await supabase
                .from('business_transactions')
                .insert([{
                    company_id: getCompanyId() || null,
                    branch_id: getBranchId() || null,
                    reference_id: bookingId,
                    reference_type: 'booking',
                    status: 'cancelled',
                    amount: 0,
                    created_at: new Date().toISOString()
                }]);
            if (ledgerErr) console.error('[Status Update] ledger insert error:', ledgerErr);
        }

        window.toast && window.toast(`Booking status updated to ${newStatus}`);
        // Fire notification based on the new status
        if (window.notifyEvent) {
            const statusEventMap = { 'confirmed': 'evt_booking_confirmed', 'cancelled': 'evt_booking_cancelled', 'completed': 'evt_booking_completed', 'no-show': 'evt_booking_noshow' };
            const evtKey = statusEventMap[newStatus.toLowerCase()];
            if (evtKey) window.notifyEvent('bookings', evtKey, { title: `Booking ${newStatus}`, message: `Booking status changed to ${newStatus}.` });
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
                const b = liveData.find(x => (x.booking_id || x.id) == bookingId);
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
        await fetchBookings();
    } catch (err) {
        console.error(err);
        window.toast && window.toast('Network error updating booking status.');
    } finally {
        document.getElementById('fullScreenUpdateStatusLoader')?.classList.remove('active');
        statusUpdateState.bookingId = null;
        statusUpdateState.newStatus = null;
    }
}

if (typeof window !== 'undefined') {
    window.confirmUpdateBookingStatus = confirmUpdateBookingStatus;
}

export function attachStatusActionsListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.id === 'btnKeepStatus') {
            document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
            statusUpdateState.bookingId = null;
            statusUpdateState.newStatus = null;
        }
        if (e.target.id === 'updateStatusConfirmOverlay') {
            document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
            statusUpdateState.bookingId = null;
            statusUpdateState.newStatus = null;
        }
        
        if (e.target.id === 'btnConfirmUpdateStatus') {
            confirmUpdateBookingStatus();
        }
    });
}
