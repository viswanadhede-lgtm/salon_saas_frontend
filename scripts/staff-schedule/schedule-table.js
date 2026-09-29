// scripts/staff-schedule/schedule-table.js

import { DOM, scheduleState } from './schedule-state.js';
import { toISODate } from './schedule-helpers.js';
import { fetchTodayBookings } from './schedule-api.js';
import { SUB_FEATURES } from '../../config/sub-feature-registry.js';
import { applySubFeatureGates } from '../sub-features/sub-feature-gate.js';

export async function renderTable() {
    if (!DOM.tableBody) return;

    // rawSchedules is already filtered by month from the API
    const viewData = [...scheduleState.rawSchedules];

    if (viewData.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr><td colspan="5" style="padding:48px; text-align:center; color:#94a3b8; font-size:0.95rem;">
                No schedules found for this period. Click <strong>Create Schedule</strong> to assign hours.
            </td></tr>`;
        return;
    }

    // ── Fetch today's booking counts per staff ────────────────
    const allStaffIds = viewData.map(s => String(s.staff_id));
    const todayBookingsMap = await fetchTodayBookings(allStaffIds);

    // ── Date helpers for Schedule column ──────────
    const now = new Date();
    const filterMonthVal = DOM.monthFilter ? DOM.monthFilter.value : ''; // 'YYYY-MM'
    
    // Check if the selected filter month is the actual current month
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = !filterMonthVal || filterMonthVal === currentMonthVal;
    
    let targetWeekDateObj;
    let tableHeaderEl = document.getElementById('weekScheduleHeader');
    
    if (isCurrentMonth) {
        // Current Month selected: show the week containing Today
        if (tableHeaderEl) tableHeaderEl.textContent = "This Week's Schedule";
        targetWeekDateObj = now;
    } else {
        // Past or Future Month selected: show the first week of that month
        if (tableHeaderEl) tableHeaderEl.textContent = "First Week's Schedule";
        const [fYear, fMonth] = filterMonthVal.split('-').map(Number);
        targetWeekDateObj = new Date(fYear, fMonth - 1, 1); // 1st of the selected month
    }
    
    // ISO weekday of the target date: 0=Mon … 6=Sun
    const isoTargetIdx = (targetWeekDateObj.getDay() + 6) % 7; 

    // Get Mon of the target week
    const monday = new Date(targetWeekDateObj);
    monday.setDate(targetWeekDateObj.getDate() - isoTargetIdx);
    monday.setHours(0, 0, 0, 0);

    // Build array of 7 Date objects: Mon → Sun
    const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });

    // Short day labels Mon=0 … Sun=6 (matching s.days order which is Mon-Sun)
    const DAY_SHORT_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Ordinal suffix helper
    function ordinal(n) {
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // Format 24h time string (HH:MM) to 12h (h:MM AM/PM)
    function fmt12(t) {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    DOM.tableBody.innerHTML = viewData.map(s => {

        // ── Column 2: This Week's Schedule ───────────────────────
        const weekPills = weekDates.map((date, idx) => {
            const dayCode = DAY_SHORT_MON_FIRST[idx]; // Mon, Tue … Sun
            const dateNum = date.getDate();
            const isToday = (date.getDate() === now.getDate() &&
                             date.getMonth() === now.getMonth() &&
                             date.getFullYear() === now.getFullYear());

            // Look up schedule for this weekday
            const dayEntry = s.days.find(d => d.day === dayCode);
            const isActive = dayEntry && dayEntry.active;

            // Try to get exact timing from schedule_entries for that date
            const dateStr = toISODate(date);
            const exactEntry = s.schedule_entries?.find(e => e.schedule_date === dateStr);
            let shiftLabel;
            if (exactEntry) {
                shiftLabel = exactEntry.is_off ? 'Off' : `${fmt12(exactEntry.start_time)}–${fmt12(exactEntry.end_time)}`;
            } else if (isActive) {
                shiftLabel = `${fmt12(dayEntry.start)}–${fmt12(dayEntry.end)}`;
            } else {
                shiftLabel = 'Off';
            }

            const isOff = shiftLabel === 'Off';

            // Determine styling based on state
            let boxBg, headerColor, headerBg, headerBorder, bodyBg, bodyColor, bodyBorder;

            if (isToday) {
                // Today highlighted: Both boxes indigo
                boxBg = 'transparent';
                headerBg = '#4f46e5';
                headerColor = '#ffffff';
                headerBorder = '1px solid #4338ca';

                bodyBg = '#6366f1';
                bodyColor = '#ffffff';
                bodyBorder = '1px solid #4f46e5';
            } else if (isOff) {
                // Day off: Both boxes muted grey
                boxBg = 'transparent';
                headerBg = '#f1f5f9';
                headerColor = '#94a3b8';
                headerBorder = '1px solid #e2e8f0';

                bodyBg = '#f8fafc';
                bodyColor = '#cbd5e1';
                bodyBorder = '1px dashed #e2e8f0';
            } else {
                // Regular active day: Light blue
                boxBg = 'transparent';
                headerBg = '#e0f2fe';
                headerColor = '#0369a1';
                headerBorder = '1px solid #bae6fd';

                bodyBg = '#f0f9ff';
                bodyColor = '#0284c7';
                bodyBorder = '1px solid #e0f2fe';
            }

            // Generate HTML for bottom timings box
            let timingHtml;
            if (isOff) {
                timingHtml = `<span style="font-size:0.65rem; font-weight:600; line-height:1;">Off</span>`;
            } else {
                // Split "9:00 AM-6:00 PM" into three segments
                const times = shiftLabel.split('–');
                const start = times[0] ? times[0].trim() : '';
                const end = times[1] ? times[1].trim() : '';

                timingHtml = `
                    <span style="font-size:0.6rem; font-weight:700; line-height:1.2;">${start}</span>
                    <span style="font-size:0.5rem; font-weight:500; line-height:0.8; opacity:0.8;">-</span>
                    <span style="font-size:0.6rem; font-weight:700; line-height:1.2;">${end}</span>
                `;
            }

            return `<div style="display:flex; flex-direction:column; align-items:center; min-width:48px; flex:1; gap:2px;">
                        <!-- Top Box: Day + Date -->
                        <div style="width:100%; text-align:center; background:${headerBg}; border:${headerBorder}; border-radius:6px; padding:4px 2px; box-sizing:border-box;">
                            <span style="font-size:0.65rem; font-weight:700; color:${headerColor}; letter-spacing:0.02em; white-space:nowrap;">${dayCode} ${dateNum}</span>
                        </div>
                        <!-- Bottom Box: Timings -->
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; flex:1; background:${bodyBg}; border:${bodyBorder}; border-radius:6px; padding:3px 2px; box-sizing:border-box; color:${bodyColor};">
                            ${timingHtml}
                        </div>
                    </div>`;
        }).join('');

        // ── Column 3: Today Shift ────────────────────────────────
        const isoTodayDayIdx = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
        const todayDayCode = DAY_SHORT_MON_FIRST[isoTodayDayIdx];
        // Full day name (Sun=0 so map via native getDay)
        const fullDayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayFullDay = fullDayNames[now.getDay()];
        const todayOrdinal = ordinal(now.getDate());

        const todayDayEntry = s.days.find(d => d.day === todayDayCode);
        const todayDateStr = toISODate(now);
        const todayExactEntry = s.schedule_entries?.find(e => e.schedule_date === todayDateStr);

        let todayShiftLine2, shiftIsOff;
        if (todayExactEntry) {
            shiftIsOff = todayExactEntry.is_off;
            todayShiftLine2 = shiftIsOff ? 'Day Off' : `${fmt12(todayExactEntry.start_time)} – ${fmt12(todayExactEntry.end_time)}`;
        } else if (todayDayEntry && todayDayEntry.active) {
            shiftIsOff = false;
            todayShiftLine2 = `${fmt12(todayDayEntry.start)} – ${fmt12(todayDayEntry.end)}`;
        } else {
            shiftIsOff = true;
            todayShiftLine2 = 'Day Off';
        }

        const shiftLine2Color = shiftIsOff ? '#ef4444' : '#475569';

        // ── Column 4: Today Bookings ─────────────────────────────
        const bookingCount = todayBookingsMap.get(String(s.staff_id)) || 0;
        let bookingsCell;
        if (bookingCount > 0) {
            bookingsCell = `<span style="display:inline-flex; align-items:center; gap:5px;
                                         background:#eff6ff; color:#2563eb;
                                         padding:4px 10px; border-radius:20px;
                                         font-size:0.78rem; font-weight:700; border:1px solid #bfdbfe;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                ${bookingCount} Booking${bookingCount !== 1 ? 's' : ''}
                            </span>`;
        } else {
            bookingsCell = `<span style="font-size:0.8rem; color:#94a3b8; font-weight:500;">No Bookings</span>`;
        }

        return `
        <tr class="tb-row" style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
            <td style="padding:14px 16px 14px 24px; vertical-align:middle;">
                <div style="font-weight:600; color:#4f46e5; font-size:1rem;">${s.staff_name}</div>
                <div style="font-size:0.85rem; color:#64748b; margin-top:2px;">${s.staff_role}</div>
            </td>
            <td style="padding:10px 16px; vertical-align:middle;">
                <div style="display:flex; gap:5px; align-items:stretch;">${weekPills}</div>
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div style="font-weight:600; color:#334155; font-size:0.85rem;">${todayFullDay}, ${todayOrdinal}</div>
                <div style="font-size:0.8rem; color:${shiftLine2Color}; margin-top:3px; font-weight:${shiftIsOff ? '500' : '600'}">${todayShiftLine2}</div>
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                ${bookingsCell}
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="viewSchedule('${s.id}')" title="View Schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #f3e8ff; background:#faf5ff; cursor:pointer; color:#a855f7; transition:all 0.2s; min-width: 52px;">
                        <i data-feather="eye" style="width:16px; height:16px; margin-bottom:2px;"></i>
                        <span style="font-size:10px; font-weight:600;">View</span>
                    </button>
                    <button class="hover-lift" onclick="editSchedule('${s.id}')" title="Edit Schedule" data-sub-feature="${SUB_FEATURES.EDIT_STAFF_SCHEDULE}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="deleteSchedule('${s.id}')" title="Delete Schedule" data-sub-feature="${SUB_FEATURES.DELETE_STAFF_SCHEDULE}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (window.feather) window.feather.replace();

    // Apply sub-feature gating to dynamically generated action buttons
    try {
        if (typeof applySubFeatureGates === 'function') {
            applySubFeatureGates();
        }
    } catch(e) {
        console.warn('Failed to apply sub-feature gates inside staff schedules', e);
    }
}
