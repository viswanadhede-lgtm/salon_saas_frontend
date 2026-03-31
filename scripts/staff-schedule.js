import { API, fetchWithAuth } from '../config/api.js';
import { FEATURES } from '../config/feature-registry.js';
import { SUB_FEATURES } from '../config/sub-feature-registry.js';

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
    toast: document.getElementById('toastNotification'),
    viewModal: document.getElementById('viewScheduleModal'),
    btnCloseView: document.getElementById('btnCloseViewModal'),
    btnOverlayCloseView: document.getElementById('btnOverlayCloseView'),
    tabThisWeekBtn: document.getElementById('tabThisWeekBtn'),
    tabMonthBtn: document.getElementById('tabMonthBtn'),
    tabThisWeekContent: document.getElementById('tabThisWeekContent'),
    tabMonthContent: document.getElementById('tabMonthContent')
};

// Sun=0, Mon=1, ..., Sat=6 (Native JS getDay)
const WEEK_DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES     = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let staffList    = [];
let rawSchedules = [];
let currentEditingScheduleId = null;

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Splits the selected month into arrays of up to 7 Date objects.
 * If current month, starts from today. Else starts from 1st.
 */
let currentMonthWeeks = [];
let currentWeekIndex  = 0;
let monthScheduleData = {}; // 'YYYY-MM-DD' -> { active, start, end, notes }

function generateMonthWeeks(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];
    for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
    }
    
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) {
        weeks.push(dates.slice(i, i + 7));
    }
    return weeks;
}

function initializeMonthBuilder(year, month) {
    currentMonthWeeks = generateMonthWeeks(year, month);
    initMonthScheduleData();
    currentWeekIndex = 0;

    // Fast-forward to the week containing today if viewing the current month
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
        const todayStr = toISODate(today);
        let foundWeek = 0;
        for (let i = 0; i < currentMonthWeeks.length; i++) {
            if (currentMonthWeeks[i].some(d => toISODate(d) === todayStr)) {
                foundWeek = i;
                break;
            }
        }
        currentWeekIndex = foundWeek;
    }
    
    renderDayRows();
    updatePaginationUI();
}

function initMonthScheduleData() {
    monthScheduleData = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const week of currentMonthWeeks) {
        for (const date of week) {
            const dateStr       = toISODate(date);
            const jsDay         = date.getDay();
            const isPastOrToday = date <= today;
            const isWeekday     = (jsDay !== 0 && jsDay !== 6) && !isPastOrToday;
            
            monthScheduleData[dateStr] = {
                active: isWeekday,
                start: isWeekday ? '09:00' : '',
                end: isWeekday ? '18:00' : '',
                notes: ''
            };
        }
    }
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
 * Returns date string like "30-03-2026" for a given Date.
 */
function formatDateOnly(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
}

/**
 * Returns full day name like "Sunday" for a given Date.
 */
function formatDayOnly(date) {
    return WEEK_DAYS_FULL[date.getDay()];
}

/**
 * Returns a label like "30-03-2026 (Sunday)" for a given Date (kept for compatibility).
 */
function formatDayLabel(date) {
    return `${formatDateOnly(date)} (${formatDayOnly(date)})`;
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
    injectDeleteModal();
    DOM.btnCreate?.addEventListener('click', openModal);
    DOM.btnCloseModal?.addEventListener('click', closeModal);
    DOM.btnCancelModal?.addEventListener('click', closeModal);
    DOM.modal?.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });

    DOM.form?.addEventListener('submit', handleFormSubmit);
    DOM.monthFilter?.addEventListener('change', fetchSchedules);

    DOM.btnCloseView?.addEventListener('click', closeViewModal);
    DOM.btnOverlayCloseView?.addEventListener('click', closeViewModal);
    DOM.viewModal?.addEventListener('click', e => { if (e.target === DOM.viewModal) closeViewModal(); });
    DOM.tabThisWeekBtn?.addEventListener('click', () => switchViewTab('week'));
    DOM.tabMonthBtn?.addEventListener('click', () => switchViewTab('month'));

    // Re-render day rows whenever the modal month changes
    DOM.monthSelect?.addEventListener('change', () => {
        const { year, month } = parseModalMonth();
        initializeMonthBuilder(year, month);
    });

    document.getElementById('btnNextWeek')?.addEventListener('click', () => {
        if (currentWeekIndex < currentMonthWeeks.length - 1) {
            currentWeekIndex++;
            renderDayRows();
            updatePaginationUI();
        }
    });

    document.getElementById('btnPrevWeek')?.addEventListener('click', () => {
        if (currentWeekIndex > 0) {
            currentWeekIndex--;
            renderDayRows();
            updatePaginationUI();
        }
    });

    DOM.applyFullMonth?.addEventListener('change', () => {
        if (DOM.applyFullMonth.checked) {
            currentWeekIndex = 0;
            renderDayRows();
        }
        updatePaginationUI();
    });
}

function updatePaginationUI() {
    const btnNext = document.getElementById('btnNextWeek');
    const btnPrev = document.getElementById('btnPrevWeek');
    const label   = document.getElementById('patternHeaderLabel');
    
    if (label && currentMonthWeeks.length > 0) {
        label.textContent = `Week ${currentWeekIndex + 1} of ${currentMonthWeeks.length}`;
    }
    
    if (btnPrev) {
        btnPrev.disabled = currentWeekIndex === 0;
        btnPrev.style.opacity = currentWeekIndex === 0 ? '0.3' : '1';
        btnPrev.style.cursor  = currentWeekIndex === 0 ? 'not-allowed' : 'pointer';
    }
    
    if (btnNext) {
        const isApplyAllChecked = DOM.applyFullMonth?.checked;
        const reachedEnd = currentWeekIndex >= currentMonthWeeks.length - 1;
        
        btnNext.disabled = reachedEnd || isApplyAllChecked;
        btnNext.style.opacity = (reachedEnd || isApplyAllChecked) ? '0.3' : '1';
        btnNext.style.cursor  = (reachedEnd || isApplyAllChecked) ? 'not-allowed' : 'pointer';
    }
}

// ─────────────────────────────────────────────────────────────
// RENDER DAY ROWS IN MODAL  (date-aware)
// ─────────────────────────────────────────────────────────────

function renderDayRows() {
    if (!DOM.daysContainer) return;

    const patternDates = currentMonthWeeks[currentWeekIndex] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const htmlRows = patternDates.map((date, ix) => {
        const isPastOrToday = date <= today;
        if (isPastOrToday) return ''; // Hide past dates completely

        const jsDay         = date.getDay();
        const dateStr       = toISODate(date);
        const dateLabel     = formatDateOnly(date);
        const dayLabel      = formatDayOnly(date);
        const state         = monthScheduleData[dateStr] || { active:false, start:'', end:'', notes:'' };

        return `
            <div class="day-row"
                 style="display:grid; grid-template-columns:1.2fr 1.2fr 80px 1fr 1fr 2.5fr; gap:12px; align-items:center;
                        background:${isPastOrToday ? '#f8fafc' : '#fff'}; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;
                        box-shadow:0 1px 2px rgba(0,0,0,0.02); transition:border-color 0.2s; ${isPastOrToday ? 'opacity:0.6;' : ''}"
                 data-date="${dateStr}" data-idx="${ix}">

                <!-- Date column -->
                <div style="font-weight:600; color:#334155; font-size:0.82rem;">
                    ${dateLabel}
                    ${isPastOrToday ? '<div style="font-size:0.68rem; color:#ef4444; margin-top:2px;">(Disabled)</div>' : ''}
                </div>

                <!-- Day name column -->
                <div style="font-weight:500; color:#475569; font-size:0.875rem;">${dayLabel}</div>

                <!-- Active toggle -->
                <div>
                    <label class="toggle-switch" style="position:relative; display:inline-block; width:44px; height:24px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                        <input type="checkbox" id="chk_${ix}" class="day-active-chk" data-idx="${ix}" data-date="${dateStr}"
                               ${state.active && !isPastOrToday ? 'checked' : ''}
                               ${isPastOrToday ? 'disabled' : ''}
                               style="opacity:0; width:0; height:0; position:absolute;">
                        <span class="slider round"
                               style="position:absolute; cursor:${isPastOrToday ? 'not-allowed' : 'pointer'}; top:0; left:0; right:0; bottom:0;
                                      background-color:${(state.active && !isPastOrToday) ? '#10b981' : '#cbd5e1'};
                                      border-radius:24px; transition:.4s;">
                            <span style="position:absolute; height:18px; width:18px;
                                         left:${(state.active && !isPastOrToday) ? '22px' : '3px'}; bottom:3px;
                                         background-color:#fff; border-radius:50%; transition:.4s;
                                         box-shadow:0 1px 2px rgba(0,0,0,0.1);"></span>
                        </span>
                    </label>
                </div>

                <!-- Start Time -->
                <div>
                    <input type="time" id="start_${ix}" class="form-input day-start" data-date="${dateStr}"
                           value="${state.start}"
                           ${(!state.active || isPastOrToday) ? 'disabled' : ''}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                </div>

                <!-- End Time -->
                <div>
                    <input type="time" id="end_${ix}" class="form-input day-end" data-date="${dateStr}"
                           value="${state.end}"
                           ${(!state.active || isPastOrToday) ? 'disabled' : ''}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                </div>

                <!-- Notes -->
                <div>
                    <textarea id="notes_${ix}" class="form-input day-notes" data-date="${dateStr}"
                              placeholder="Notes..."
                              ${(!state.active || isPastOrToday) ? 'disabled' : ''}
                              style="width:100%; height:36px; padding:6px 8px; font-size:0.82rem;
                                     border:1px solid #e2e8f0; border-radius:6px; resize:none;
                                     font-family:inherit; box-sizing:border-box;
                                     ${isPastOrToday ? 'cursor:not-allowed; background:#f1f5f9;' : ''}">${state.notes}</textarea>
                </div>
            </div>
        `;
    }).join('');

    if (htmlRows === '') {
        DOM.daysContainer.innerHTML = `
            <div style="padding:24px; text-align:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b; font-size:0.9rem;">
                All dates in this week are in the past and cannot be edited. Please select a future week or month.
            </div>
        `;
    } else {
        DOM.daysContainer.innerHTML = htmlRows;
    }

    // Wire up toggle switches
    DOM.daysContainer.querySelectorAll('.day-active-chk').forEach(chk => {
        chk.addEventListener('change', e => {
            const idx       = e.target.dataset.idx;
            const dateStr   = e.target.dataset.date;
            const isChecked = e.target.checked;
            const slider    = e.target.nextElementSibling;
            const knob      = slider.firstElementChild;

            slider.style.backgroundColor = isChecked ? '#10b981' : '#cbd5e1';
            knob.style.left              = isChecked ? '22px'    : '3px';

            const startEl = document.getElementById(`start_${idx}`);
            const endEl   = document.getElementById(`end_${idx}`);
            const notesEl = document.getElementById(`notes_${idx}`);
            
            startEl.disabled = !isChecked;
            endEl.disabled   = !isChecked;
            if (notesEl) notesEl.disabled = !isChecked;

            monthScheduleData[dateStr].active = isChecked;

            if (isChecked && !startEl.value) {
                startEl.value = '09:00';
                endEl.value   = '18:00';
                monthScheduleData[dateStr].start = '09:00';
                monthScheduleData[dateStr].end = '18:00';
            } else if (!isChecked) {
                startEl.value = '';
                endEl.value   = '';
                monthScheduleData[dateStr].start = '';
                monthScheduleData[dateStr].end = '';
            }
        });
    });

    // Wire up inputs to save into state immediately
    ['start', 'end', 'notes'].forEach(cat => {
        DOM.daysContainer.querySelectorAll(`.day-${cat}`).forEach(input => {
            input.addEventListener('input', e => {
                const dateStr = e.target.dataset.date;
                monthScheduleData[dateStr][cat] = e.target.value;
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL OPEN / CLOSE
// ─────────────────────────────────────────────────────────────

function openModal() {
    currentEditingScheduleId = null;
    const titleEl = document.getElementById('createModalTitle');
    if (titleEl) titleEl.textContent = 'Create Staff Schedule';

    DOM.form.reset();
    if (DOM.applyFullMonth) DOM.applyFullMonth.checked = false;

    // Default modal month to current month
    const now           = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (DOM.monthSelect) {
        DOM.monthSelect.value = currentMonthVal;
        DOM.monthSelect.disabled = false;
    }
    if (DOM.staffSelect) {
        DOM.staffSelect.disabled = false;
    }

    const { year, month } = parseModalMonth();
    initializeMonthBuilder(year, month);

    DOM.modal.classList.add('active');
}

function closeModal() {
    DOM.modal.classList.remove('active');
}

window.editSchedule = function(scheduleId) {
    const s = rawSchedules.find(x => x.id === scheduleId);
    if (!s) return;

    currentEditingScheduleId = scheduleId;
    const titleEl = document.getElementById('createModalTitle');
    if (titleEl) titleEl.textContent = 'Edit Staff Schedule';
    
    // reset form
    DOM.form.reset();
    if (DOM.applyFullMonth) DOM.applyFullMonth.checked = !!s.apply_full_month;

    if (DOM.staffSelect) {
        DOM.staffSelect.value = s.staff_id;
        DOM.staffSelect.disabled = true;
    }
    if (DOM.monthSelect) {
        DOM.monthSelect.value = s.target_month;
        DOM.monthSelect.disabled = true;
    }

    const [yyyy, mm] = s.target_month.split('-').map(Number);
    initializeMonthBuilder(yyyy, mm - 1);

    const today = new Date();
    today.setHours(0,0,0,0);
    for (const [dateStr, data] of Object.entries(monthScheduleData)) {
        const dDate = new Date(dateStr);
        if (dDate <= today) continue;

        const jsDay = dDate.getDay();
        const shortDay = WEEK_DAYS_SHORT[jsDay];
        const dayMatch = s.days.find(d => d.day === shortDay);

        if (dayMatch && dayMatch.active) {
            monthScheduleData[dateStr].active = true;
            monthScheduleData[dateStr].start = dayMatch.start;
            monthScheduleData[dateStr].end = dayMatch.end;
            monthScheduleData[dateStr].notes = dayMatch.notes || '';
        } else {
            monthScheduleData[dateStr].active = false;
            monthScheduleData[dateStr].start = '';
            monthScheduleData[dateStr].end = '';
            monthScheduleData[dateStr].notes = '';
        }
    }
    
    const todayStr = toISODate(today);
    let targetWeek = 0;
    for (let i = 0; i < currentMonthWeeks.length; i++) {
        if (currentMonthWeeks[i].some(d => d > today)) {
            targetWeek = i;
            break;
        }
    }
    currentWeekIndex = targetWeek;

    renderDayRows();
    updatePaginationUI();

    DOM.modal.classList.add('active');
};

let currentDeletingScheduleId = null;

window.deleteSchedule = function(scheduleId) {
    currentDeletingScheduleId = scheduleId;
    const backdrop = document.getElementById('deleteScheduleModalBackdrop');
    if (backdrop) backdrop.classList.add('active');
};

function injectDeleteModal() {
    if (document.getElementById('deleteScheduleModalBackdrop')) return; // Prevent double injection

    const style = document.createElement('style');
    style.textContent = `
        #deleteScheduleModalBackdrop {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(4px);
            z-index: 99999;
            align-items: center;
            justify-content: center;
        }
        #deleteScheduleModalBackdrop.active {
            display: flex;
        }
        #deleteScheduleModalBox {
            background: #fff;
            border-radius: 16px;
            padding: 2rem 2rem 1.5rem;
            width: 100%;
            max-width: 380px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            text-align: center;
            animation: logoutFadeIn 0.2s ease;
        }
        @keyframes logoutFadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        #deleteScheduleModalBox .delete-icon {
            width: 52px;
            height: 52px;
            background: #fef2f2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
        }
        #deleteScheduleModalBox .delete-icon svg {
            color: #ef4444;
            width: 24px;
            height: 24px;
        }
        #deleteScheduleModalBox h3 {
            font-size: 1.1rem;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 0.4rem;
        }
        #deleteScheduleModalBox p {
            font-size: 0.875rem;
            color: #64748b;
            margin: 0 0 1.5rem;
        }
        #deleteScheduleModalBox .delete-actions {
            display: flex;
            gap: 0.75rem;
        }
        #deleteScheduleModalBox .btn-cancel-delete {
            flex: 1;
            padding: 0.65rem 1rem;
            border-radius: 8px;
            border: 1.5px solid #e2e8f0;
            background: #fff;
            font-size: 0.875rem;
            font-weight: 600;
            color: #475569;
            cursor: pointer;
            transition: background 0.15s;
        }
        #deleteScheduleModalBox .btn-cancel-delete:hover {
            background: #f8fafc;
        }
        #deleteScheduleModalBox .btn-confirm-delete {
            flex: 1;
            padding: 0.65rem 1rem;
            border-radius: 8px;
            border: none;
            background: #ef4444;
            font-size: 0.875rem;
            font-weight: 600;
            color: #fff;
            cursor: pointer;
            transition: background 0.15s;
        }
        #deleteScheduleModalBox .btn-confirm-delete:hover {
            background: #dc2626;
        }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'deleteScheduleModalBackdrop';
    backdrop.innerHTML = `
        <div id="deleteScheduleModalBox">
            <div class="delete-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </div>
            <h3>Delete Schedule</h3>
            <p>Are you sure you want to delete this schedule?</p>
            <div class="delete-actions">
                <button class="btn-cancel-delete" id="deleteScheduleCancelBtn">Cancel</button>
                <button class="btn-confirm-delete" id="deleteScheduleConfirmBtn">Yes, Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    // Cancel
    document.getElementById('deleteScheduleCancelBtn').addEventListener('click', closeDeleteScheduleModal);

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeDeleteScheduleModal();
    });

    // Confirm delete
    document.getElementById('deleteScheduleConfirmBtn').addEventListener('click', () => {
        if (currentDeletingScheduleId) {
            performDelete(currentDeletingScheduleId);
            closeDeleteScheduleModal();
        }
    });
}

function closeDeleteScheduleModal() {
    const backdrop = document.getElementById('deleteScheduleModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    currentDeletingScheduleId = null;
}

async function performDelete(scheduleId) {
    let companyId = null;
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        companyId = appContext.company?.id || null;
    } catch (e) {}
    const branchId = localStorage.getItem('active_branch_id') || null;

    try {
        const payload = { company_id: companyId, branch_id: branchId, schedule_id: scheduleId };
        const response = await fetchWithAuth(API.DELETE_STAFF_SCHEDULE, {
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.STAFF_SCHEDULES, 'delete');
        
        if (!response.ok) throw new Error('Failed to delete schedule');
        
        rawSchedules = rawSchedules.filter(s => s.id !== scheduleId);
        renderTable();

        if (DOM.toast) {
            DOM.toast.textContent = 'Schedule deleted successfully';
            DOM.toast.classList.add('show');
            setTimeout(() => DOM.toast.classList.remove('show'), 3000);
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        // Fallback for mock/local testing
        rawSchedules = rawSchedules.filter(s => s.id !== scheduleId);
        renderTable();
    }
}

// ─────────────────────────────────────────────────────────────
// VIEW SCHEDULE MODAL
// ─────────────────────────────────────────────────────────────

function closeViewModal() {
    DOM.viewModal?.classList.remove('active');
}

function switchViewTab(tab) {
    if (tab === 'week') {
        DOM.tabThisWeekBtn.classList.add('active');
        DOM.tabThisWeekBtn.style.borderBottomColor = '#6366f1';
        DOM.tabThisWeekBtn.style.color = '#1e293b';
        
        DOM.tabMonthBtn.classList.remove('active');
        DOM.tabMonthBtn.style.borderBottomColor = 'transparent';
        DOM.tabMonthBtn.style.color = '#64748b';

        DOM.tabThisWeekContent.style.display = 'block';
        DOM.tabMonthContent.style.display = 'none';
    } else {
        DOM.tabMonthBtn.classList.add('active');
        DOM.tabMonthBtn.style.borderBottomColor = '#6366f1';
        DOM.tabMonthBtn.style.color = '#1e293b';
        
        DOM.tabThisWeekBtn.classList.remove('active');
        DOM.tabThisWeekBtn.style.borderBottomColor = 'transparent';
        DOM.tabThisWeekBtn.style.color = '#64748b';

        DOM.tabMonthContent.style.display = 'block';
        DOM.tabThisWeekContent.style.display = 'none';
    }
}

window.viewSchedule = function(scheduleId) {
    const s = rawSchedules.find(x => x.id === scheduleId);
    if (!s) return;

    document.getElementById('viewStaffName').textContent = s.staff_name;
    const [yyyy, mm] = s.target_month.split('-');
    const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1);
    document.getElementById('viewTargetMonth').textContent = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

    document.getElementById('viewHoursBdg').textContent = s.total_hours;
    
    const scopeBdg = document.getElementById('viewMonthScopeBdg');
    if (s.apply_full_month) {
        scopeBdg.textContent = 'Full Month';
        scopeBdg.style.background = '#dcfce7'; scopeBdg.style.color = '#16a34a';
    } else {
        scopeBdg.textContent = 'Partial / Custom';
        scopeBdg.style.background = '#fef9c3'; scopeBdg.style.color = '#854d0e';
    }

    // Populate This Week
    const weekHtml = s.days.map(d => {
        if (d.active) {
            return `
                <div style="display:grid; grid-template-columns:100px 100px 150px 1fr; gap:12px; align-items:center; background:#fff; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="font-weight:600; color:#334155; font-size:0.875rem;">${d.day}</div>
                    <div><span style="background:#dcfce7; color:#16a34a; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">Active</span></div>
                    <div style="font-size:0.85rem; color:#475569;">${d.start} - ${d.end}</div>
                    <div style="font-size:0.85rem; color:#64748b; font-style:italic;">${d.notes || '-'}</div>
                </div>`;
        } else {
            return `
                <div style="display:grid; grid-template-columns:100px 100px 150px 1fr; gap:12px; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:8px; border:1px dashed #cbd5e1; opacity:0.8;">
                    <div style="font-weight:600; color:#64748b; font-size:0.875rem;">${d.day}</div>
                    <div><span style="background:#f1f5f9; color:#94a3b8; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">Inactive</span></div>
                    <div style="font-size:0.85rem; color:#94a3b8;">Off</div>
                    <div style="font-size:0.85rem; color:#cbd5e1;">-</div>
                </div>`;
        }
    }).join('');
    document.getElementById('viewWeekContainer').innerHTML = weekHtml;

    // Populate Month View (mini timeline/summary of repeating pattern)
    const monthHtmlArray = [];
    for(let w=1; w<=4; w++) {
        const miniPills = s.days.map(d => 
            d.active 
            ? `<div style="display:flex; flex-direction:column; background:#e0e7ff; padding:6px; border-radius:6px; flex:1; text-align:center; border:1px solid #c7d2fe;">
                 <span style="font-size:0.7rem; font-weight:700; color:#4338ca; text-transform:uppercase;">${d.day}</span>
                 <span style="font-size:0.75rem; font-weight:600; color:#312e81; margin-top:2px;">${d.start}</span>
               </div>`
            : `<div style="display:flex; flex-direction:column; background:#f1f5f9; padding:6px; border-radius:6px; flex:1; text-align:center; border:1px dashed #cbd5e1; opacity:0.6;">
                 <span style="font-size:0.7rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">${d.day}</span>
                 <span style="font-size:0.75rem; font-weight:500; color:#cbd5e1; margin-top:2px;">Off</span>
               </div>`
        ).join('');

        monthHtmlArray.push(`
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">
                <h4 style="margin:0 0 12px 0; font-size:0.85rem; font-weight:600; color:#475569;">Week ${w}</h4>
                <div style="display:flex; gap:8px;">${miniPills}</div>
            </div>
        `);
    }
    
    document.getElementById('viewMonthContainer').innerHTML = monthHtmlArray.join('');

    switchViewTab('week');
    DOM.viewModal?.classList.add('active');
    if(window.feather) window.feather.replace();
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
        let companyId = null;
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = appContext.company?.id || null;
        } catch (e) {}
        const branchId = localStorage.getItem('active_branch_id') || null;

        if (companyId && branchId) {
            const response = await fetchWithAuth(API.READ_STAFF, { 
                method: 'POST',
                body: JSON.stringify({ company_id: companyId, branch_id: branchId })
            }, FEATURES.STAFF_MANAGEMENT, 'read');

            if (response.ok) {
                const data = await response.json();
                
                let staffArray = data;
                if (Array.isArray(data)) {
                    staffArray = Array.isArray(data[0]?.staff) ? data[0].staff : data;
                } else if (data && typeof data === 'object') {
                    staffArray = data.staff || [];
                }

                if (Array.isArray(staffArray)) {
                    staffList = staffArray.map(staff => ({
                        id: staff.staff_id || staff.id,
                        name: staff.staff_name || staff.name || 'Unknown Staff',
                        role: staff.role_name || staff.role || 'Unassigned'
                    }));
                    populateStaffDropdown();
                    return;
                }
            }
        }
    } catch (error) {
        console.warn('API sync failed for fetchStaff. No local simulation available.', error);
    }

    // If API failed, leave the array empty to ensure we don't show phantom staff
    staffList = [];
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
        let companyId = null;
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = appContext.company?.id || null;
        } catch (e) {}
        const branchId = localStorage.getItem('active_branch_id') || null;

        const payload = { company_id: companyId, branch_id: branchId };
        const filterMonth = DOM.monthFilter?.value;
        if (filterMonth) {
            payload.target_month = filterMonth;
        }

        const response = await fetchWithAuth(API.READ_STAFF_SCHEDULE, { 
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.STAFF_SCHEDULES, 'read');
        if (response.ok) {
            const data = await response.json();
            rawSchedules = transformScheduleResponse(data);
            renderTable();
            return;
        }
    } catch (error) {
        console.warn('API sync failed for fetchSchedules. No local simulation available.', error);
    }

    // Explicitly empty out the table if the API request failed so we don't display dummy data
    rawSchedules = [];
    renderTable();
}

// ─────────────────────────────────────────────────────────────
// TRANSFORM: backend date-map → UI row objects
// ─────────────────────────────────────────────────────────────

/**
 * Backend response format:
 * [{ success: true, schedule: { '2026-04-01': [{ staff_id, start_time, end_time, is_off, notes, schedule_id }] }, today_schedule }]
 *
 * We group entries by staff_id → target_month, picking up the 7-day
 * recurring pattern from the first occurrence of each weekday.
 */
function transformScheduleResponse(data) {
    if (!Array.isArray(data) || !data[0]?.schedule) return [];

    const scheduleMap  = data[0].schedule;  // { '2026-04-01': [...], ... }
    const grouped      = {};                 // key: `${staffId}_${targetMonth}`

    const DAY_NAMES    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (const [dateStr, entries] of Object.entries(scheduleMap)) {
        const jsDate      = new Date(dateStr + 'T00:00:00');  // local midnight
        const dayName     = DAY_NAMES[jsDate.getDay()];
        const targetMonth = dateStr.slice(0, 7);              // '2026-04'

        for (const entry of entries) {
            const staffId  = entry.staff_id;
            const key      = `${staffId}_${targetMonth}`;

            if (!grouped[key]) {
                const staffMember = staffList.find(s => String(s.id) === String(staffId));
                grouped[key] = {
                    id:               entry.schedule_id || key,
                    staff_id:         staffId,
                    staff_name:       staffMember?.name  || staffId,
                    staff_role:       staffMember?.role  || 'Staff',
                    target_month:     targetMonth,
                    apply_full_month: true,
                    total_hours:      0,
                    days:             { Sun: null, Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null },
                    schedule_entries: []
                };
            }

            const row = grouped[key];

            // Keep first occurrence of each weekday as the representative pattern
            if (row.days[dayName] === null) {
                row.days[dayName] = {
                    day:    dayName,
                    active: !entry.is_off,
                    start:  entry.start_time || null,
                    end:    entry.end_time   || null
                };

                // Accumulate weekly hours from first-week entries
                if (!entry.is_off && entry.start_time && entry.end_time) {
                    const [sh, sm] = entry.start_time.split(':').map(Number);
                    const [eh, em] = entry.end_time.split(':').map(Number);
                    let diff = (eh + em / 60) - (sh + sm / 60);
                    if (diff < 0) diff += 24;
                    row.total_hours += diff;
                }
            }

            row.schedule_entries.push({
                schedule_date: dateStr,
                ...entry
            });
        }
    }

    // Flatten days map → ordered array (Mon→Sun order used in UI)
    const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return Object.values(grouped).map(row => ({
        ...row,
        total_hours: Math.round(row.total_hours * 10) / 10,
        days: DAY_ORDER.map(d => row.days[d] || { day: d, active: false, start: null, end: null })
    }));
}

// ─────────────────────────────────────────────────────────────
// RENDER TABLE
// ─────────────────────────────────────────────────────────────

function renderTable() {
    if (!DOM.tableBody) return;

    // rawSchedules is already filtered by month from the API
    const viewData = [...rawSchedules];

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

        const todayDayIndex = new Date().getDay();
        const todayDayStr = WEEK_DAYS_SHORT[todayDayIndex];
        const todaySchedule = s.days.find(d => d.day === todayDayStr);

        let todayTimingsStr = 'Off';
        let statusBadge = `<span style="background:#f1f5f9; color:#94a3b8; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">Inactive</span>`;

        if (todaySchedule && todaySchedule.active) {
            todayTimingsStr = `${todaySchedule.start} - ${todaySchedule.end}`;
            statusBadge = `<span style="background:#dcfce7; color:#16a34a; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">Active</span>`;
        }

        return `
        <tr class="tb-row" style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
            <td style="padding:14px 16px 14px 24px;">
                <div style="font-weight:600; color:#1e293b; font-size:0.9rem;">${s.staff_name}</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${s.staff_role}</div>
            </td>
            <td style="padding:14px 16px;">
                <div style="display:flex; flex-wrap:wrap;">${dayPills}</div>
            </td>
            <td style="padding:14px 16px; font-weight:600; color:#0f172a; font-size:0.85rem;">
                ${todayTimingsStr}
            </td>
            <td style="padding:14px 16px;">
                ${statusBadge}
            </td>
            <td style="padding:14px 16px; vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="hover-lift" onclick="viewSchedule('${s.id}')" title="View Schedule" data-sub-feature="read_staff_schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #f3e8ff; background:#faf5ff; cursor:pointer; color:#a855f7; transition:all 0.2s; min-width: 52px;">
                        <i data-feather="eye" style="width:16px; height:16px; margin-bottom:2px;"></i>
                        <span style="font-size:10px; font-weight:600;">View</span>
                    </button>
                    <button class="hover-lift" onclick="editSchedule('${s.id}')" title="Edit Schedule" data-sub-feature="edit_staff_schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="hover-lift" onclick="deleteSchedule('${s.id}')" title="Delete Schedule" data-sub-feature="delete_staff_schedule" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
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

    const baseWeekDates = currentMonthWeeks[0] || [];
    const branchId      = document.getElementById('branchSelect')?.value || null;

    // ── Read per-day inputs ──────────────────────────────────
    let calculatedHoursPerWeek = 0;
    const weekPattern = [];

    // Analyze Week 1 only to generate UI `payload.days` display pills and calculate base hours
    for (const date of baseWeekDates) {
        const dateStr = toISODate(date);
        const data    = monthScheduleData[dateStr] || { active: false, start: '', end: '', notes: '' };
        const jsDay   = date.getDay();

        if (data.active) {
            if (!data.start || !data.end) {
                showToast(`Please set start & end time for ${WEEK_DAYS_FULL[jsDay]} in Week 1`, true);
                return;
            }

            const [sh, sm] = data.start.split(':').map(Number);
            const [eh, em] = data.end.split(':').map(Number);
            let diff = (eh + em / 60) - (sh + sm / 60);
            if (diff < 0) diff += 24;
            calculatedHoursPerWeek += diff;

            weekPattern.push({ jsDay, date, start: data.start, end: data.end, notes: data.notes, active: true });
        } else {
            weekPattern.push({ jsDay, date, start: null, end: null, notes: null, active: false });
        }
    }

    // ── Expand to date-based entries ─────────────────────────
    const scheduleEntries = [];
    const today           = new Date();
    today.setHours(0, 0, 0, 0);

    if (applyFullMonth) {
        // Repeat Week 1's pattern across all matching weekdays in the month
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
                    notes:         day.notes  || null,
                    is_off:        !day.active
                });
            }
        }
    } else {
        // Serialize explicitly typed month Schedule Data accurately
        for (const [dateStr, data] of Object.entries(monthScheduleData)) {
            const dDate = new Date(dateStr);
            if (dDate <= today) continue; // enforce past-date bypass
            
            // Validate any active blocks typed out into future weeks
            if (data.active && (!data.start || !data.end)) {
                showToast(`Please set start & end time for ${dateStr}`, true);
                return;
            }

            scheduleEntries.push({
                staff_id:      staffId,
                branch_id:     branchId,
                schedule_date: dateStr,
                start_time:    data.active ? data.start : null,
                end_time:      data.active ? data.end   : null,
                notes:         data.notes || null,
                is_off:        !data.active
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
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Saving...'; }

    let companyId = null;
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        companyId = appContext.company?.id || null;
    } catch (e) {}

    try {
        // Build Base Payload
        const apiPayload = {
            company_id: companyId,
            branch_id: branchId,
            staff_id: payload.staff_id,
            staff_name: payload.staff_name,
            staff_role: payload.staff_role,
            target_month: payload.target_month,
            total_hours: payload.total_hours,
            apply_full_month: payload.apply_full_month,
            days: payload.days,
            schedule_entries: payload.schedule_entries
        };

        if (currentEditingScheduleId) {
            apiPayload.schedule_id = currentEditingScheduleId;
            const res = await fetchWithAuth(API.EDIT_STAFF_SCHEDULE, {
                method: 'POST',
                body: JSON.stringify(apiPayload)
            }, FEATURES.STAFF_SCHEDULES, 'update');
            if (res.ok) {
                payload.id = currentEditingScheduleId;
                const index = rawSchedules.findIndex(x => x.id === currentEditingScheduleId);
                if (index > -1) rawSchedules[index] = payload;
            } else {
                throw new Error('Update failed');
            }
        } else {
            const res = await fetchWithAuth(API.CREATE_STAFF_SCHEDULE, {
                method: 'POST',
                body: JSON.stringify(apiPayload)
            }, FEATURES.STAFF_SCHEDULES, 'create');
            if (res.ok) {
                const respData = await res.json().catch(()=>({}));
                payload.id = respData.id || 'SCH_' + Math.random().toString(36).substr(2, 5).toUpperCase();
                rawSchedules = rawSchedules.filter(s => !(String(s.staff_id) === String(payload.staff_id) && s.target_month === payload.target_month));
                rawSchedules.push(payload);
            } else {
                throw new Error('Create failed');
            }
        }

        if (DOM.toast) {
            DOM.toast.textContent = 'Schedule saved successfully';
            DOM.toast.classList.add('show');
            setTimeout(() => DOM.toast.classList.remove('show'), 3000);
        }
    } catch (err) {
        console.warn('API sync failed, falling back to local simulation:', err);
        // Fallback for local mock environment execution
        if (currentEditingScheduleId) {
            payload.id = currentEditingScheduleId;
            const index = rawSchedules.findIndex(x => x.id === currentEditingScheduleId);
            if (index > -1) rawSchedules[index] = payload;
        } else {
            payload.id = 'SCH_' + Math.random().toString(36).substr(2, 5).toUpperCase();
            rawSchedules = rawSchedules.filter(s => !(String(s.staff_id) === String(payload.staff_id) && s.target_month === payload.target_month));
            rawSchedules.push(payload);
        }
    } finally {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Save Schedule'; }
        closeModal();
        renderTable();
    }
}
