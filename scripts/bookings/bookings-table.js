// scripts/bookings/bookings-table.js
import { formatTime12, todayISO } from './bookings-state.js';

// ─── Status Badge HTML ────────────────────────────────────────────────────────
export function statusBadge(status) {
    const map = {
        booked:    { color: '#1e40af', bg: '#dbeafe', label: 'Booked' },
        confirmed: { color: '#1e40af', bg: '#dbeafe', label: 'Confirmed' },
        completed: { color: '#065f46', bg: '#d1fae5', label: 'Completed' },
        cancelled: { color: '#991b1b', bg: '#fee2e2', label: 'Cancelled' },
        'no-show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
        'no_show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Payment Badge HTML ───────────────────────────────────────────────────────
export function paymentBadge(status) {
    const map = {
        paid:     { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        unpaid:   { color: '#991b1b', bg: '#fee2e2', label: 'Unpaid' },
        pending:  { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        partial:  { color: '#86198f', bg: '#f5d0fe', label: 'Partial' },
        refunded: { color: '#b45309', bg: '#fef3c7', label: 'Refunded' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Row Renderer ─────────────────────────────────────────────────────────────
// Toggle extra services in the bookings table
export function toggleSvcExtra(extraId, toggleId, extraCount) {
    var el  = document.getElementById(extraId);
    var tog = document.getElementById(toggleId);
    if (!el || !tog) return;
    var isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display  = isHidden ? 'flex' : 'none';
    tog.textContent   = isHidden ? '▲ less' : '+' + extraCount;
}

if (typeof window !== 'undefined') {
    window.toggleSvcExtra = toggleSvcExtra;
}

export function buildRow(b, includeDate = false) {
    const bookingId    = b.booking_id || b.id || '';
    const customerName = b.customer_name || '—';
    const phone        = String(b.customer_phone || '');
    const bookingType  = b.booking_type || '—';
    const dateOnly     = b.booking_date || '';
    const timeOnly     = b.start_time   || '';
    const amount       = b.final_amount != null ? `₹${Number(b.final_amount).toLocaleString('en-IN')}` : (b.total_price != null ? `₹${Number(b.total_price).toLocaleString('en-IN')}` : '—');
    const status       = b.status || '';
    const payment      = b.payment_status || b.payment || '';

    // Multi-service support: flatMap splits each element by comma, handles both
    // ["Hair Trimming, Nail Trimming"] and ["Hair Trimming", "Nail Trimming"]
    const serviceNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
        .filter(Boolean)
        .flatMap(s => s.split(',').map(item => item.trim()))
        .filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
        .filter(Boolean)
        .flatMap(s => s.split(',').map(item => item.trim()))
        .filter(Boolean);

    const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes(status.toLowerCase());
    const isEditable    = !['cancelled', 'completed'].includes(status.toLowerCase());

    let dateDisplay = '—';
    let timeDisplay = '—';
    if (dateOnly) {
        try {
            const d = new Date(`${dateOnly}T00:00`);
            dateDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { dateDisplay = dateOnly; }
    }
    if (timeOnly) {
        try {
            const [hh, mm] = timeOnly.split(':').map(Number);
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
            timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
        } catch { timeDisplay = timeOnly; }
    }

    // Render service names: show first chip + collapsible +N toggle
    const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;
    let serviceCell = '—';
    if (serviceNames.length) {
        const firstChip = `<span style="${chipStyle}">${serviceNames[0]}</span>`;
        if (serviceNames.length === 1) {
            serviceCell = firstChip;
        } else {
            const extraCount = serviceNames.length - 1;
            const extraId = `svc-extra-${bookingId}`;
            const toggleId = `svc-toggle-${bookingId}`;
            const extraChips = serviceNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            serviceCell = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                    ${firstChip}
                    <span id="${toggleId}"
                        onclick="window.toggleSvcExtra('${extraId}', '${toggleId}', ${extraCount})"
                        style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                    <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                        ${extraChips}
                    </div>
                </div>`;
        }
    }

    // Render staff names: show first chip + collapsible +N toggle
    let staffCell = '—';
    if (staffNames.length) {
        const firstChip = `<span style="${chipStyle}">${staffNames[0]}</span>`;
        if (staffNames.length === 1) {
            staffCell = firstChip;
        } else {
            const extraCount = staffNames.length - 1;
            const extraId = `staff-extra-${bookingId}`;
            const toggleId = `staff-toggle-${bookingId}`;
            const extraChips = staffNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            staffCell = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                    ${firstChip}
                    <span id="${toggleId}"
                        onclick="window.toggleSvcExtra('${extraId}', '${toggleId}', ${extraCount})"
                        style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                    <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                        ${extraChips}
                    </div>
                </div>`;
        }
    }

    const cellStyle = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    return `
    <tr class="tb-row" style="border-bottom:1px solid #f8fafc;transition:background 0.15s;">
        <td style="padding:14px 8px 14px 24px;${cellStyle}">
            <span class="customer-link" style="font-weight:600;font-size:0.87rem;${cellStyle}" onclick="window.viewCustomerProfile('${b.customer_id || ''}', '${customerName}')">${customerName}</span>
        </td>
        <td style="padding:14px 8px;font-size:0.8rem;color:#64748b;font-family:monospace;${cellStyle}">${(bookingId||'').slice(0, 8).toUpperCase()}</td>
        <td style="padding:14px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${dateDisplay}</td>
        <td style="padding:14px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${timeDisplay}</td>
        <td style="padding:14px 8px; max-width:200px;">${serviceCell}</td>
        <td style="padding:14px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${staffCell}</td>
        <td style="padding:14px 8px;">${statusBadge(status)}</td>
        <td style="padding:14px 8px;font-size:0.85rem;font-weight:600;color:#059669;${cellStyle}">${amount}</td>
        <td style="padding:14px 8px;font-size:0.85rem;${cellStyle}">
            ${(() => {
                const p = (payment || '').toLowerCase();
                if (p === 'paid') {
                    return `<span style="color:#059669;font-weight:700;font-size:0.85rem;">Paid</span>`;
                }
                return `
                <button onclick="window.openBookingPayment('${bookingId}')"
                    data-sub-feature="collect_payment"
                    style="background:#4f46e5;border:none;border-radius:6px;cursor:pointer;color:#fff;padding:5px 12px;transition:all 0.2s;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:0.78rem;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(79,70,229,0.2);"
                    onmouseover="this.style.background='#4338ca';" onmouseout="this.style.background='#4f46e5';">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                    Collect
                </button>`;
            })()}
        </td>
        <td style="padding:14px 8px 14px 24px;">
            ${(status || '').toLowerCase() === 'completed' ? `
            <button onclick="window.openViewBookingModal('${bookingId}')"
                style="width:90px;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#ffffff;color:#1e293b;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.04);display:inline-flex;align-items:center;justify-content:center;gap:6px;"
                onmouseover="this.style.background='#f8fafc';this.style.borderColor='#cbd5e1'" 
                onmouseout="this.style.background='#ffffff';this.style.borderColor='#e2e8f0'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                View
            </button>
            ` : ['cancelled', 'no-show', 'noshow', 'no_show'].includes((status || '').toLowerCase().trim()) ? `
            <button onclick="window.openCancelledBookingModal('${bookingId}')"
                style="width:90px;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#ffffff;color:#1e293b;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.04);display:inline-flex;align-items:center;justify-content:center;gap:6px;"
                onmouseover="this.style.background='#f8fafc';this.style.borderColor='#cbd5e1'" 
                onmouseout="this.style.background='#ffffff';this.style.borderColor='#e2e8f0'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                Rebook
            </button>
            ` : `
            <button onclick="window.openEditBookingModal('${bookingId}')"
                data-sub-feature="update_booking"
                style="width:90px;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#ffffff;color:#1e293b;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.04);display:inline-flex;align-items:center;justify-content:center;gap:6px;"
                onmouseover="this.style.background='#f8fafc';this.style.borderColor='#cbd5e1'" 
                onmouseout="this.style.background='#ffffff';this.style.borderColor='#e2e8f0'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Update
            </button>
            `}
        </td>
    </tr>`;
}

export function emptyRow(colspan, msg) {
    return `<tr><td colspan="10" style="padding:48px 24px;text-align:center;color:#94a3b8;font-size:0.9rem;">${msg}</td></tr>`;
}

export function renderBookings(data) {
    const today    = data.filter(b => (b.booking_date || '').slice(0, 10) === todayISO());
    const allBooks = data;

    const bodyToday = document.getElementById('tbTableBodyToday');
    const bodyAll   = document.getElementById('tbTableBodyAll');

    if (bodyToday) {
        bodyToday.innerHTML = today.length
            ? today.map(b => buildRow(b, false)).join('')
            : emptyRow(8, 'No bookings for today.');
    }
    if (bodyAll) {
        bodyAll.innerHTML = allBooks.length
            ? allBooks.map(b => buildRow(b, true)).join('')
            : emptyRow(8, 'No bookings found.');
    }
}
