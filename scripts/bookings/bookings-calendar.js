// scripts/bookings/bookings-calendar.js
import { supabase } from '../../lib/supabase.js';
import { getLiveBookings, getBranchId, calendarState } from './bookings-state.js';
import { statusBadge, toggleSvcExtra } from './bookings-table.js?v=2.4.0';

if (typeof window !== 'undefined' && !window.toggleSvcExtra) {
    window.toggleSvcExtra = toggleSvcExtra;
}

// ─── Calendar Summary Cache ──────────────────────────────────────────────────
let calendarSummaryCache = [];  // rows from RPC: { booking_date, total_bookings, booked_count, ... }

/**
 * Fetch calendar month summary via RPC 4 (get_calendar_month_bookings_summary).
 * Returns lightweight per-day counts instead of pulling full booking records.
 */
async function fetchCalendarSummary(year, month) {
    const branchId = getBranchId();
    if (!branchId) {
        calendarSummaryCache = [];
        return;
    }

    try {
        const { data, error } = await supabase.rpc('get_calendar_month_bookings_summary', {
            p_branch_id: branchId,
            p_year:      year,
            p_month:     month + 1  // JS month is 0-indexed, SQL expects 1-indexed
        });

        if (error) {
            console.error('[Calendar] RPC error, falling back to client-side:', error);
            calendarSummaryCache = [];
            return;
        }

        calendarSummaryCache = data || [];
    } catch (err) {
        console.error('[Calendar] fetch summary error:', err);
        calendarSummaryCache = [];
    }
}

/**
 * Fallback: build summary from liveBookingsData when RPC data is unavailable.
 */
function buildClientSideSummary(year, month) {
    const allData = window.liveBookingsData || getLiveBookings() || [];
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    const dayCounts = {};
    allData.forEach(b => {
        const dateStr = (b.booking_date || '').slice(0, 10);
        if (!dateStr.startsWith(monthStr)) return;

        if (!dayCounts[dateStr]) {
            dayCounts[dateStr] = {
                booking_date:    dateStr,
                total_bookings:  0,
                booked_count:    0,
                confirmed_count: 0,
                completed_count: 0,
                cancelled_count: 0,
                no_show_count:   0
            };
        }
        const dc = dayCounts[dateStr];
        dc.total_bookings++;

        const s = (b.status || '').toLowerCase().trim();
        if (s === 'booked')        dc.booked_count++;
        else if (s === 'confirmed')  dc.confirmed_count++;
        else if (s === 'completed')  dc.completed_count++;
        else if (s === 'cancelled')  dc.cancelled_count++;
        else if (s === 'no-show' || s === 'no_show') dc.no_show_count++;
    });

    return Object.values(dayCounts);
}

export async function renderCalendar() {
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

    // Fetch summary via RPC (or fallback to client-side)
    await fetchCalendarSummary(year, month);
    const summaryData = calendarSummaryCache.length > 0
        ? calendarSummaryCache
        : buildClientSideSummary(year, month);

    // Build a map of date → summary for O(1) lookup
    const summaryMap = {};
    summaryData.forEach(row => {
        const dateKey = (row.booking_date || '').slice(0, 10);
        summaryMap[dateKey] = row;
    });

    // Padding empty cells before 1st of month
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty-day';
        grid.appendChild(emptyCell);
    }

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

        // Use summary data for this day
        const daySummary = summaryMap[dateStr];

        if (daySummary && Number(daySummary.total_bookings) > 0) {
            const statusConfig = {
                booked:    { label: 'Booked',     color: '#1e40af', bg: '#dbeafe', key: 'booked_count' },
                confirmed: { label: 'Confirmed',  color: '#1e40af', bg: '#dbeafe', key: 'confirmed_count' },
                completed: { label: 'Completed',  color: '#065f46', bg: '#d1fae5', key: 'completed_count' },
                cancelled: { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2', key: 'cancelled_count' },
                'no-show': { label: 'No-Show',    color: '#92400e', bg: '#fef3c7', key: 'no_show_count' },
            };

            const badgesWrap = document.createElement('div');
            badgesWrap.style.display = 'flex';
            badgesWrap.style.flexDirection = 'column';
            badgesWrap.style.gap = '4px';
            badgesWrap.style.marginTop = '8px';

            // ── Total bookings header ──────────────────────────────────────
            const total = Number(daySummary.total_bookings);
            const totalEl = document.createElement('div');
            totalEl.className = 'calendar-badge';
            totalEl.textContent = `${total} Booking${total > 1 ? 's' : ''}`;
            totalEl.style.cursor = 'pointer';
            totalEl.addEventListener('click', () => openCalendarDayModal(dateStr));
            badgesWrap.appendChild(totalEl);

            // ── Per-status breakdown ───────────────────────────────────────
            Object.entries(statusConfig).forEach(([statusKey, cfg]) => {
                let count = Number(daySummary[cfg.key] || 0);
                if (statusKey === 'no-show' && count === 0) {
                    count = Number(daySummary.no_show || daySummary.no_shows || daySummary.noshow || 0);
                }
                if (count <= 0) return;

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
                pill.addEventListener('click', () => openCalendarDayModal(dateStr));
                badgesWrap.appendChild(pill);
            });

            cell.appendChild(badgesWrap);
        }

        grid.appendChild(cell);
    }
}

export function openCalendarDayModal(dateStr) {
    const modal = document.getElementById('calDayModalOverlay');
    const subtitle = document.getElementById('calDayModalSubtitle');
    const tbody = document.getElementById('calDayModalBody');

    if (!modal || !tbody) return;

    // format beautiful string like "29-05-2026, Thursday"
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    const dayName = dateObj.toLocaleDateString('default', { weekday: 'long' });
    subtitle.textContent = `${d}-${m}-${y}, ${dayName}`;

    // For the detail modal, use full booking records from liveBookingsData
    const allData = window.liveBookingsData || getLiveBookings() || [];
    const dayBookings = allData.filter(b => (b.booking_date || '').slice(0, 10) === dateStr);

    tbody.innerHTML = '';
    
    // Sort bookings by time ascending
    const sorted = [...dayBookings].sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''));

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

        const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;

        const serviceNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);
        const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);

        let serviceCell = '—';
        if (serviceNames.length) {
            const firstChip = `<span style="${chipStyle}">${serviceNames[0]}</span>`;
            if (serviceNames.length === 1) {
                serviceCell = firstChip;
            } else {
                const extraCount = serviceNames.length - 1;
                const extraChips = serviceNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
                serviceCell = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;width:100%;">
                        ${firstChip}
                        <span onclick="window.toggleSvcExtra(this, ${extraCount})"
                            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                        <div style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                            ${extraChips}
                        </div>
                    </div>`;
            }
        }

        let staffCell = '—';
        if (staffNames.length) {
            const firstChip = `<span style="${chipStyle}">${staffNames[0]}</span>`;
            if (staffNames.length === 1) {
                staffCell = firstChip;
            } else {
                const extraCount = staffNames.length - 1;
                const extraChips = staffNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
                staffCell = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;width:100%;">
                        ${firstChip}
                        <span onclick="window.toggleSvcExtra(this, ${extraCount})"
                            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                        <div style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                            ${extraChips}
                        </div>
                    </div>`;
            }
        }

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        // Zebra striping for readability
        if (index % 2 !== 0) {
            tr.style.backgroundColor = '#f8fafc';
        }
        tr.innerHTML = `
            <td style="padding:12px 14px; font-weight:600; font-size:0.88rem; color:#334155; white-space:nowrap;">${ptime || '—'}</td>
            <td style="padding:12px 8px; font-weight:600; font-size:0.92rem; color:#1e293b;">
                ${b.customer_name ? `<a href="#" style="color:#2563eb; text-decoration:none;" onclick="event.preventDefault(); if(window.viewCustomerProfile) { window.viewCustomerProfile('${b.customer_id || ''}', '${b.customer_name}'); document.getElementById('calDayModalOverlay').classList.remove('active'); }">${b.customer_name}</a>` : '—'}
            </td>
            <td style="padding:12px 8px; max-width:220px;">${serviceCell}</td>
            <td style="padding:12px 8px; max-width:180px;">${staffCell}</td>
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
