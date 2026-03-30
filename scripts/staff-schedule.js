import { API, fetchWithAuth } from '../config/api.js';

const DOM = {
    tableBody: document.getElementById('scheduleTableBody'),
    monthFilter: document.getElementById('monthFilter'),
    btnCreate: document.getElementById('btnCreateSchedule'),
    modal: document.getElementById('createScheduleModal'),
    btnCloseModal: document.getElementById('btnCloseScheduleModal'),
    btnCancelModal: document.getElementById('btnCancelSchedule'),
    form: document.getElementById('createScheduleForm'),
    staffSelect: document.getElementById('modalStaffSelect'),
    monthSelect: document.getElementById('modalMonthSelect'),
    daysContainer: document.getElementById('scheduleDaysContainer'),
    applyFullMonth: document.getElementById('applyFullMonthChk'),
    toast: document.getElementById('toastNotification')
};

// Sun=0, Mon=1, ..., Sat=6 (Native JS getDay)
const WEEK_DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES     = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let staffList    = [];
let rawSchedules = [];

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Returns up to 7 Date objects for the scheduling pattern.
 * If the selected month is the current month, starts from today.
 * Otherwise, starts from the 1st of the month.
 */
function getPatternDates(year, month) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDay = 1;
    if (year === today.getFullYear() && month === today.getMonth()) {
        startDay = today.getDate(); // Start from today
    }
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // max 7 days, bounded to the end of the month
    const maxDays = Math.min(7, daysInMonth - startDay + 1);

    return Array.from({ length: maxDays }, (_, i) => {
        return new Date(year, month, startDay + i);
    });
}

/**
 * Returns all dates in a month whose weekday matches weekdayIdx (Mon=0 … Sun=6).
 */
function getAllWeekdayDatesInMonth(year, month, jsDay) {
    // jsDay is native 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result     = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (date.getDay() === jsDay) result.push(date);
    }
    return result;
}

/** Format a Date as YYYY-MM-DD */
function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Returns a label like "15-03-2026 (Sunday)" for a given Date.
 */
function formatDayLabel(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y} (${WEEK_DAYS_FULL[date.getDay()]})`;
}

/** Parse year/month (0-indexed) from the modal's month <input> value. */
function parseModalMonth() {
    const val = DOM.monthSelect ? DOM.monthSelect.value : '';
    if (val) {
        const [y, m] = val.split('-').map(Number);
        return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
}

// ─────────────────────────────────────────────────────────────
// INITIALISE
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Default filter to current month
    const now = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (DOM.monthFilter) DOM.monthFilter.value = currentMonthVal;

    if (window.feather) window.feather.replace();

    await fetchStaff();
    await fetchSchedules();
});

function setupEventListeners() {
    DOM.btnCreate?.addEventListener('click', openModal);
    DOM.btnCloseModal?.addEventListener('click', closeModal);
    DOM.btnCancelModal?.addEventListener('click', closeModal);
    DOM.modal?.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });

    DOM.form?.addEventListener('submit', handleFormSubmit);
    DOM.monthFilter?.addEventListener('change', renderTable);

    // Re-render day rows whenever the modal month changes
    DOM.monthSelect?.addEventListener('change', () => {
        const { year, month } = parseModalMonth();
        renderDayRows(year, month);
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER DAY ROWS IN MODAL  (date-aware)
// ─────────────────────────────────────────────────────────────

function renderDayRows(year, month) {
    if (!DOM.daysContainer) return;

    let patternDates = getPatternDates(year, month);
    const today = new Date();
    
    // Dynamically update UI label 
    const labelSpan = document.getElementById('patternHeaderLabel');
    if (labelSpan) {
        labelSpan.textContent = (year === today.getFullYear() && month === today.getMonth()) 
            ? 'Showing remaining days starting from today' 
            : 'Showing first 7 days of month';
    }

    today.setHours(0, 0, 0, 0);

    DOM.daysContainer.innerHTML = patternDates.map((date, ix) => {
        const label         = formatDayLabel(date);
        const jsDay         = date.getDay();
        const isPastOrToday = date <= today;
        const isWeekday     = (jsDay !== 0 && jsDay !== 6) && !isPastOrToday;
        const dateStr       = toISODate(date);               // stored on data-attr

        return `
            <div class="day-row"
                 style="display:grid; grid-template-columns:190px 80px 110px 110px; gap:12px; align-items:center;
                        background:${isPastOrToday ? '#f8fafc' : '#fff'}; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;
                        box-shadow:0 1px 2px rgba(0,0,0,0.02); transition:border-color 0.2s; ${isPastOrToday ? 'opacity:0.6;' : ''}"
                 data-date="${dateStr}" data-idx="${ix}">

                <div style="font-weight:600; color:#334155; font-size:0.875rem;">
                    ${label}
                    ${isPastOrToday ? '<div style="font-size:0.7rem; color:#ef4444; margin-top:2px;">(Past/Today - Disabled)</div>' : ''}
                </div>

                <div>
                    <label class="toggle-switch" style="position:relative; display:inline-block; width:44px; height:24px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                        <input type="checkbox" id="chk_${ix}" class="day-active-chk" data-idx="${ix}"
                               ${isWeekday ? 'checked' : ''}
                               ${isPastOrToday ? 'disabled' : ''}
                               style="opacity:0; width:0; height:0; position:absolute;">
                        <span class="slider round"
                               style="position:absolute; cursor:${isPastOrToday ? 'not-allowed' : 'pointer'}; top:0; left:0; right:0; bottom:0;
                                      background-color:${isWeekday ? '#10b981' : '#cbd5e1'};
                                      border-radius:24px; transition:.4s;">
                            <span style="position:absolute; height:18px; width:18px;
                                         left:${isWeekday ? '22px' : '3px'}; bottom:3px;
                                         background-color:#fff; border-radius:50%; transition:.4s;
                                         box-shadow:0 1px 2px rgba(0,0,0,0.1);"></span>
                        </span>
                    </label>
                </div>

                <div>
                    <input type="time" id="start_${ix}" class="form-input day-start"
                           value="${isWeekday ? '09:00' : ''}"
                           ${(!isWeekday || isPastOrToday) ? 'disabled' : ''}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                </div>

                <div>
                    <input type="time" id="end_${ix}" class="form-input day-end"
                           value="${isWeekday ? '18:00' : ''}"
                           ${!isWeekday ? 'disabled' : ''}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px;">
                </div>
            </div>
        `;
    }).join('');

    // Wire up toggle switches
    DOM.daysContainer.querySelectorAll('.day-active-chk').forEach(chk => {
        chk.addEventListener('change', e => {
            const idx       = e.target.dataset.idx;
            const isChecked = e.target.checked;
            const slider    = e.target.nextElementSibling;
            const knob      = slider.firstElementChild;

            slider.style.backgroundColor = isChecked ? '#10b981' : '#cbd5e1';
            knob.style.left              = isChecked ? '22px'    : '3px';

            const startEl = document.getElementById(`start_${idx}`);
            const endEl   = document.getElementById(`end_${idx}`);
            startEl.disabled = !isChecked;
            endEl.disabled   = !isChecked;

            if (isChecked && !startEl.value) {
                startEl.value = '09:00';
                endEl.value   = '18:00';
            } else if (!isChecked) {
                startEl.value = '';
                endEl.value   = '';
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL OPEN / CLOSE
// ─────────────────────────────────────────────────────────────

function openModal() {
    DOM.form.reset();
    if (DOM.applyFullMonth) DOM.applyFullMonth.checked = false;

    // Default modal month to current month
    const now           = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (DOM.monthSelect) DOM.monthSelect.value = currentMonthVal;

    const { year, month } = parseModalMonth();
    renderDayRows(year, month);

    DOM.modal.classList.add('active');
}

function closeModal() {
    DOM.modal.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
    DOM.toast.textContent        = msg;
    DOM.toast.style.background   = isError ? '#ef4444' : '#10b981';
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────────────────────
// API – FETCH STAFF
// ─────────────────────────────────────────────────────────────

async function fetchStaff() {
    try {
        const response = await fetchWithAuth(API.READ_STAFF, { method: 'GET' }, 'staff_management', 'read');
        if (response.ok) {
            const data = await response.json();
            staffList = data.staff || data;
            populateStaffDropdown();
            return;
        }
    } catch (_) { /* fall through to mock */ }

    // Mock fallback
    staffList = [
        { id: 'S1', name: 'Sarah Johnson',  role: 'Senior Stylist' },
        { id: 'S2', name: 'Michael Lee',    role: 'Barber'         },
        { id: 'S3', name: 'Anjali Sharma',  role: 'Therapist'      }
    ];
    populateStaffDropdown();
}

function populateStaffDropdown() {
    if (!DOM.staffSelect) return;
    const options = staffList.map(s =>
        `<option value="${s.id}">${s.name} (${s.role || 'Staff'})</option>`
    );
    DOM.staffSelect.innerHTML =
        `<option value="" disabled selected>Select staff member</option>` + options.join('');
}

// ─────────────────────────────────────────────────────────────
// API – FETCH EXISTING SCHEDULES
// ─────────────────────────────────────────────────────────────

async function fetchSchedules() {
    try {
        const response = await fetchWithAuth(API.READ_SCHEDULE, { method: 'GET' }, 'staff_schedules', 'read');
        if (response.ok) {
            rawSchedules = await response.json();
            renderTable();
            return;
        }
    } catch (_) { /* fall through to mock */ }

    // Mock data
    rawSchedules = [
        {
            id:              'SCH_1',
            staff_id:        'S1',
            staff_name:      'Sarah Johnson',
            staff_role:      'Senior Stylist',
            target_month:    '2026-03',
            total_hours:     40,
            apply_full_month: true,
            days: [
                { day: 'Mon', active: true,  start: '09:00', end: '18:00' },
                { day: 'Tue', active: true,  start: '09:00', end: '18:00' },
                { day: 'Wed', active: true,  start: '09:00', end: '18:00' },
                { day: 'Thu', active: true,  start: '09:00', end: '18:00' },
                { day: 'Fri', active: true,  start: '09:00', end: '18:00' },
                { day: 'Sat', active: false },
                { day: 'Sun', active: false }
            ]
        }
    ];
    renderTable();
}

// ─────────────────────────────────────────────────────────────
// RENDER TABLE
// ─────────────────────────────────────────────────────────────

function renderTable() {
    if (!DOM.tableBody) return;

    const filterMonth = DOM.monthFilter?.value || null;
    let viewData      = [...rawSchedules];

    if (filterMonth) {
        viewData = viewData.filter(s => s.target_month === filterMonth);
    }

    if (viewData.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr><td colspan="5" style="padding:48px; text-align:center; color:#94a3b8; font-size:0.95rem;">
                No schedules found for this period. Click <strong>Create Schedule</strong> to assign hours.
            </td></tr>`;
        return;
    }

    DOM.tableBody.innerHTML = viewData.map(s => {
        const dayPills = s.days.map(d =>
            d.active
                ? `<div style="display:inline-block; margin:2px 4px 2px 0; background:#e0e7ff; color:#4338ca;
                              padding:2px 7px; border-radius:4px; font-size:0.7rem; font-weight:600;"
                       title="${d.start} – ${d.end}">${d.day}</div>`
                : `<div style="display:inline-block; margin:2px 4px 2px 0; background:#f1f5f9; color:#94a3b8;
                              padding:2px 7px; border-radius:4px; font-size:0.7rem; font-weight:500;"
                       title="Off">${d.day}</div>`
        ).join('');

        const [yyyy, mm]   = s.target_month.split('-');
        const dateObj      = new Date(parseInt(yyyy), parseInt(mm) - 1);
        const monthLabel   = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });

        const scopeBadge   = s.apply_full_month
            ? `<span style="display:inline-block; margin-left:6px; background:#dcfce7; color:#16a34a;
                            padding:1px 8px; border-radius:4px; font-size:0.7rem; font-weight:600;">Full Month</span>`
            : `<span style="display:inline-block; margin-left:6px; background:#fef9c3; color:#854d0e;
                            padding:1px 8px; border-radius:4px; font-size:0.7rem; font-weight:600;">1 Week</span>`;

        return `
        <tr class="tb-row" style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
            <td style="padding:14px 16px 14px 24px;">
                <div style="font-weight:600; color:#1e293b; font-size:0.9rem;">${s.staff_name}</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${s.staff_role}</div>
            </td>
            <td style="padding:14px 16px;">
                <span style="display:inline-block; background:#f8fafc; border:1px solid #e2e8f0;
                             padding:3px 8px; border-radius:6px; font-weight:500; font-size:0.8rem; color:#475569;">
                    <i data-feather="calendar" style="width:12px; height:12px; vertical-align:-2px; margin-right:4px;"></i>${monthLabel}
                </span>
                ${scopeBadge}
            </td>
            <td style="padding:14px 16px; font-weight:600; color:#0f172a;">
                ${s.total_hours} <span style="font-weight:400; color:#64748b; font-size:0.8rem;">hrs/wk</span>
            </td>
            <td style="padding:14px 16px;">
                <div style="display:flex; flex-wrap:wrap;">${dayPills}</div>
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="alert('Edit schedule')" title="Edit Schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="alert('Delete schedule')" title="Delete Schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (window.feather) window.feather.replace();
}

// ─────────────────────────────────────────────────────────────
// FORM SUBMIT  →  build date-based schedule entries
// ─────────────────────────────────────────────────────────────

async function handleFormSubmit(e) {
    e.preventDefault();

    const staffId        = DOM.staffSelect.value;
    const targetMonth    = DOM.monthSelect.value;
    const applyFullMonth = DOM.applyFullMonth?.checked || false;

    if (!staffId) {
        showToast('Please select a staff member', true);
        return;
    }
    if (!targetMonth) {
        showToast('Please select a target month', true);
        return;
    }

    const staffMember = staffList.find(s => String(s.id) === String(staffId));
    if (!staffMember) {
        showToast('Invalid staff selection', true);
        return;
    }

    const [yyyy, mm] = targetMonth.split('-').map(Number);
    const year       = yyyy;
    const month      = mm - 1; // 0-indexed

    const patternDates = getPatternDates(year, month);
    const branchId       = document.getElementById('branchSelect')?.value || null;

    // ── Read per-day inputs ──────────────────────────────────
    let calculatedHoursPerWeek = 0;
    const weekPattern = [];

    for (let i = 0; i < patternDates.length; i++) {
        const isChecked = document.getElementById(`chk_${i}`)?.checked || false;
        const date      = patternDates[i];
        const jsDay     = date.getDay();

        if (isChecked) {
            const start = document.getElementById(`start_${i}`)?.value || '';
            const end   = document.getElementById(`end_${i}`)?.value   || '';

            if (!start || !end) {
                showToast(`Please set start & end time for ${WEEK_DAYS_FULL[jsDay]}`, true);
                return;
            }

            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            let diff = (eh + em / 60) - (sh + sm / 60);
            if (diff < 0) diff += 24; // overnight shift
            calculatedHoursPerWeek += diff;

            weekPattern.push({ jsDay, date, start, end, active: true });
        } else {
            weekPattern.push({ jsDay, date, start: null, end: null, active: false });
        }
    }

    // ── Expand to date-based entries ─────────────────────────
    const scheduleEntries = [];
    const today           = new Date();
    today.setHours(0, 0, 0, 0);

    if (applyFullMonth) {
        // Repeat pattern across all matching weekdays in the month
        for (const day of weekPattern) {
            const allDates = getAllWeekdayDatesInMonth(year, month, day.jsDay);
            for (const d of allDates) {
                if (d <= today) continue; // enforce past-date bypass

                scheduleEntries.push({
                    staff_id:      staffId,
                    branch_id:     branchId,
                    schedule_date: toISODate(d),
                    start_time:    day.active ? day.start : null,
                    end_time:      day.active ? day.end   : null,
                    is_off:        !day.active
                });
            }
        }
    } else {
        // Only first week
        for (const day of weekPattern) {
            if (day.date <= today) continue; // enforce past-date bypass

            scheduleEntries.push({
                staff_id:      staffId,
                branch_id:     branchId,
                schedule_date: toISODate(day.date),
                start_time:    day.active ? day.start : null,
                end_time:      day.active ? day.end   : null,
                is_off:        !day.active
            });
        }
    }

    // Sort chronologically
    scheduleEntries.sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));

    // ── Final payload ──────────────────────────────────────────
    const payload = {
        staff_id:         staffId,
        staff_name:       staffMember.name,
        staff_role:       staffMember.role || 'Staff',
        target_month:     targetMonth,
        apply_full_month: applyFullMonth,
        total_hours:      Math.round(calculatedHoursPerWeek * 10) / 10,
        days: weekPattern.map((d) => ({
            day:    WEEK_DAYS_SHORT[d.jsDay],
            active: d.active,
            start:  d.start,
            end:    d.end
        })),
        schedule_entries: scheduleEntries   // date-based entries for backend
    };

    console.log(
        `[Staff Schedule] Submitting ${scheduleEntries.length} entries` +
        ` (${applyFullMonth ? 'full month' : 'first week only'})`,
        payload
    );

    // ── Send to backend ────────────────────────────────────────
    try {
        const response = await fetchWithAuth(API.CREATE_SCHEDULE, {
            method: 'POST',
            body:   JSON.stringify(payload)
        }, 'staff_schedules', 'create');

        if (response.ok) {
            showToast(`✓ Schedule saved — ${scheduleEntries.length} date entries created`);
        } else {
            console.warn('Backend not ready; schedule saved to UI only.');
            showToast(`✓ ${scheduleEntries.length} entries created (demo mode)`);
        }
    } catch (err) {
        console.warn('API unavailable, saving locally.', err);
        showToast(`✓ ${scheduleEntries.length} entries saved locally (demo mode)`);
    }

    // Update local state for instant UI feedback
    payload.id   = 'SCH_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    rawSchedules = rawSchedules.filter(
        s => !(String(s.staff_id) === String(payload.staff_id) && s.target_month === payload.target_month)
    );
    rawSchedules.push(payload);

    closeModal();
    renderTable();
}
