// scripts/bookings/bookings-calendar.js
import { getLiveBookings, calendarState } from './bookings-state.js';
import { statusBadge } from './bookings-table.js';

export function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarMonthTitle');
    if (!grid || !title) return;

    // Remove existing day cells (keep the 7 headers)
    const existingDays = grid.querySelectorAll('.calendar-day');
    existingDays.forEach(cell => cell.remove());

    const year = calendarState.currentDate.getFullYear();
    const month = calendarState.currentDate.getMonth(); // 0-11

    title.textContent = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Today's exact yyyy-mm-dd for highlighting
    const todayStr = new Date().toISOString().split('T')[0];

    // Padding empty cells before 1st of month
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty-day';
        grid.appendChild(emptyCell);
    }

    const allData = window.liveBookingsData || getLiveBookings() || [];

    // Populate actual days
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        
        const rawDate = new Date(year, month, d);
        // format local yyyy-mm-dd safely (without UTC shift offset issues)
        const dateStr = [
            rawDate.getFullYear(),
            String(rawDate.getMonth() + 1).padStart(2, '0'),
            String(rawDate.getDate()).padStart(2, '0')
        ].join('-');

        // Highlight today
        if (dateStr === todayStr) {
            cell.classList.add('today');
        }

        const numEl = document.createElement('div');
        numEl.textContent = d;
        numEl.style.fontWeight = '700';
        numEl.style.color = '#334155';
        if (dateStr === todayStr) numEl.style.color = '#4f46e5';
        cell.appendChild(numEl);

        // Find bookings for this day
        const dayBookings = allData.filter(b => (b.booking_date || '').slice(0, 10) === dateStr);

        if (dayBookings.length > 0) {
            // Group by normalised status
            const statusConfig = {
                completed: { label: 'Completed', color: '#065f46', bg: '#d1fae5' },
                cancelled:  { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2' },
                'no-show':  { label: 'No-Show',    color: '#92400e', bg: '#fef3c7' },
                'no_show':  { label: 'No-Show',    color: '#92400e', bg: '#fef3c7' },
                booked:     { label: 'Booked',     color: '#1e40af', bg: '#dbeafe' },
                confirmed:  { label: 'Confirmed',  color: '#1e40af', bg: '#dbeafe' },
            };

            // Tally counts per status
            const counts = {};
            dayBookings.forEach(bk => {
                const s = (bk.status || '').toLowerCase().trim();
                counts[s] = (counts[s] || 0) + 1;
            });

            const badgesWrap = document.createElement('div');
            badgesWrap.style.display = 'flex';
            badgesWrap.style.flexDirection = 'column';
            badgesWrap.style.gap = '4px';
            badgesWrap.style.marginTop = '8px';

            // ── Total bookings header ──────────────────────────────────────
            const totalEl = document.createElement('div');
            totalEl.className = 'calendar-badge';
            totalEl.textContent = `${dayBookings.length} Booking${dayBookings.length > 1 ? 's' : ''}`;
            totalEl.style.cursor = 'pointer';
            totalEl.addEventListener('click', () => openCalendarDayModal(dateStr, dayBookings));
            badgesWrap.appendChild(totalEl);

            // ── Per-status breakdown ───────────────────────────────────────
            Object.entries(counts).forEach(([s, count]) => {
                const cfg = statusConfig[s] || { label: s, color: '#475569', bg: '#f1f5f9' };
                const pill = document.createElement('div');
                pill.style.cssText = `
                    display:flex; align-items:center; justify-content:space-between;
                    padding:3px 7px; border-radius:6px; cursor:pointer;
                    background:${cfg.bg}; font-size:0.68rem; font-weight:600; color:${cfg.color};
                    transition:opacity 0.15s ease;
                `;
                pill.innerHTML = `<span>${cfg.label}</span><span style="font-size:0.75rem;font-weight:700;">${count}</span>`;
                pill.addEventListener('mouseenter', () => pill.style.opacity = '0.8');
                pill.addEventListener('mouseleave', () => pill.style.opacity = '1');
                pill.addEventListener('click', () => openCalendarDayModal(dateStr, dayBookings));
                badgesWrap.appendChild(pill);
            });

            cell.appendChild(badgesWrap);
        }

        grid.appendChild(cell);
    }
}

export function openCalendarDayModal(dateStr, bookings) {
    const modal = document.getElementById('calDayModalOverlay');
    const subtitle = document.getElementById('calDayModalSubtitle');
    const tbody = document.getElementById('calDayModalBody');

    if (!modal || !tbody) return;

    // format beautiful string like "29-05-2026, Thursday"
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    const dayName = dateObj.toLocaleDateString('default', { weekday: 'long' });
    subtitle.textContent = `${d}-${m}-${y}, ${dayName}`;

    tbody.innerHTML = '';
    
    // Sort bookings by time ascending
    const sorted = [...bookings].sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''));

    sorted.forEach((b, index) => {
        const timeVal = (b.start_time || '').slice(0,5);
        
        let ptime = '';
        if (timeVal) {
            let [hh, mm] = timeVal.split(':');
            let hr = parseInt(hh, 10);
            let ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12;
            if (hr === 0) hr = 12;
            ptime = `${String(hr).padStart(2,'0')}:${mm} ${ampm}`;
        }

        const svcs = (b.service_name || '').split(',').map(s=> `<span style="display:inline-block;padding:2px 6px;margin:2px;background:#f1f5f9;border-radius:4px;font-size:0.85rem;">${s.trim()}</span>`).join('');

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        // Zebra striping for readability
        if (index % 2 !== 0) {
            tr.style.backgroundColor = '#f8fafc';
        }
        tr.innerHTML = `
            <td style="padding:12px 14px; font-weight:600; font-size:0.95rem; color:#334155; white-space:nowrap;">${ptime || '—'}</td>
            <td style="padding:12px 8px; font-weight:600; font-size:1rem; color:#1e293b;">
                ${b.customer_name ? `<a href="#" style="color:#2563eb; text-decoration:none;" onclick="event.preventDefault(); if(window.viewCustomerProfile) { window.viewCustomerProfile('${b.customer_id || ''}', '${b.customer_name}'); document.getElementById('calDayModalOverlay').classList.remove('active'); }">${b.customer_name}</a>` : '—'}
            </td>
            <td style="padding:12px 8px;">${svcs}</td>
            <td style="padding:12px 8px; color:#475569; font-size:0.9rem;">${b.staff_name || '—'}</td>
            <td style="padding:12px 8px;">${statusBadge(b.status)}</td>
        `;
        tbody.appendChild(tr);
    });

    modal.classList.add('active');
}

// Wire Calendar Navigation Listeners
export function initCalendarListeners() {
    const prev = document.getElementById('calPrevBtn');
    const next = document.getElementById('calNextBtn');
    const todayBtn = document.getElementById('calTodayBtn');

    if (prev && !prev.dataset.calInit) {
        prev.dataset.calInit = '1';
        prev.addEventListener('click', () => {
            calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
            renderCalendar();
        });
    }
    if (next && !next.dataset.calInit) {
        next.dataset.calInit = '1';
        next.addEventListener('click', () => {
            calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
            renderCalendar();
        });
    }
    if (todayBtn && !todayBtn.dataset.calInit) {
        todayBtn.dataset.calInit = '1';
        todayBtn.addEventListener('click', () => {
            calendarState.currentDate = new Date();
            renderCalendar();
        });
    }

    // Modal close handlers
    const overlay = document.getElementById('calDayModalOverlay');
    const closeBtn1 = document.getElementById('calDayModalClose');
    const closeBtn2 = document.getElementById('calDayModalCloseBtn');

    const handleClose = () => { if (overlay) overlay.classList.remove('active'); };
    if (closeBtn1 && !closeBtn1.dataset.calInit) {
        closeBtn1.dataset.calInit = '1';
        closeBtn1.addEventListener('click', handleClose);
    }
    if (closeBtn2 && !closeBtn2.dataset.calInit) {
        closeBtn2.dataset.calInit = '1';
        closeBtn2.addEventListener('click', handleClose);
    }
    
    // Close on outside click
    if (overlay && !overlay.dataset.calInit) {
        overlay.dataset.calInit = '1';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleClose();
        });
    }
}
