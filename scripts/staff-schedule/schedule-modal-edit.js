// scripts/staff-schedule/schedule-modal-edit.js

import { DOM, scheduleState, WEEK_DAYS_FULL, WEEK_DAYS_SHORT } from './schedule-state.js';
import { generateMonthWeeks, getAllWeekdayDatesInMonth, toISODate, formatDateOnly, formatDayOnly, parseModalMonth, showToast } from './schedule-helpers.js';
import { fetchSchedules, saveScheduleRecords, getCompanyId, getBranchId } from './schedule-api.js';
import { renderTable } from './schedule-table.js';

export function initializeMonthBuilder(year, month) {
    scheduleState.currentMonthWeeks = generateMonthWeeks(year, month);
    initMonthScheduleData();
    scheduleState.currentWeekIndex = 0;

    // Fast-forward to the week containing today if viewing the current month
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
        const todayStr = toISODate(today);
        let foundWeek = 0;
        for (let i = 0; i < scheduleState.currentMonthWeeks.length; i++) {
            if (scheduleState.currentMonthWeeks[i].some(d => toISODate(d) === todayStr)) {
                foundWeek = i;
                break;
            }
        }
        scheduleState.currentWeekIndex = foundWeek;
    }
    
    renderDayRows();
    updatePaginationUI();
}

export function initMonthScheduleData() {
    scheduleState.monthScheduleData = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const week of scheduleState.currentMonthWeeks) {
        for (const date of week) {
            const dateStr       = toISODate(date);
            const jsDay         = date.getDay();
            const isPastOrToday = date < today;
            const isWeekday     = (jsDay !== 0 && jsDay !== 6) && !isPastOrToday;
            
            scheduleState.monthScheduleData[dateStr] = {
                active: false,
                start: '',
                end: '',
                notes: ''
            };
        }
    }
}

/**
 * Synchronizes full month data across weeks based on the week 1 pattern.
 */
export function syncFullMonthData() {
    if (!scheduleState.currentMonthWeeks.length) return;
    const baseWeeks = scheduleState.currentMonthWeeks[0];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Grab pattern from week 1
    const weekPattern = {};
    for (const d of baseWeeks) {
        weekPattern[d.getDay()] = scheduleState.monthScheduleData[toISODate(d)] || { active:false, start:'', end:'', notes:'' };
    }
    
    // Apply to weeks 2+
    for (let i = 1; i < scheduleState.currentMonthWeeks.length; i++) {
        for (const date of scheduleState.currentMonthWeeks[i]) {
            if (date < today) continue; // Skip strictly past dates
            const jsDay = date.getDay();
            const source = weekPattern[jsDay];
            scheduleState.monthScheduleData[toISODate(date)] = {
                active: source.active,
                start: source.start,
                end: source.end,
                notes: source.notes
            };
        }
    }
}

export function updatePaginationUI() {
    const btnNext = document.getElementById('btnNextWeek');
    const btnPrev = document.getElementById('btnPrevWeek');
    const label   = document.getElementById('patternHeaderLabel');
    
    if (label && scheduleState.currentMonthWeeks.length > 0) {
        label.textContent = `Week ${scheduleState.currentWeekIndex + 1} of ${scheduleState.currentMonthWeeks.length}`;
    }
    
    if (btnPrev) {
        btnPrev.disabled = scheduleState.currentWeekIndex === 0;
        btnPrev.style.opacity = scheduleState.currentWeekIndex === 0 ? '0.3' : '1';
        btnPrev.style.cursor  = scheduleState.currentWeekIndex === 0 ? 'not-allowed' : 'pointer';
    }
    
    if (btnNext) {
        const reachedEnd = scheduleState.currentWeekIndex >= scheduleState.currentMonthWeeks.length - 1;
        
        btnNext.disabled = reachedEnd;
        btnNext.style.opacity = reachedEnd ? '0.3' : '1';
        btnNext.style.cursor  = reachedEnd ? 'not-allowed' : 'pointer';
    }
}

export function renderDayRows() {
    if (!DOM.daysContainer) return;

    const patternDates = scheduleState.currentMonthWeeks[scheduleState.currentWeekIndex] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const htmlRows = patternDates.map((date, ix) => {
        const isPastOrToday = date < today;
        if (isPastOrToday) return ''; // Hide past dates completely

        const jsDay         = date.getDay();
        const dateStr       = toISODate(date);
        const dateLabel     = formatDateOnly(date);
        const dayLabel      = formatDayOnly(date);
        let state           = scheduleState.monthScheduleData[dateStr] || { active:false, start:'', end:'', notes:'' };

        const isApplyAllChecked = DOM.applyFullMonth?.checked;
        let isForcedByFullMonth = false;

        if (isApplyAllChecked && scheduleState.currentWeekIndex > 0) {
            const baseWeekDates = scheduleState.currentMonthWeeks[0] || [];
            const week1Date = baseWeekDates.find(d => d.getDay() === jsDay);
            if (week1Date) {
                const w1Str = toISODate(week1Date);
                state = scheduleState.monthScheduleData[w1Str] || { active:false, start:'', end:'', notes:'' };
                isForcedByFullMonth = true;
            }
        }


        // Check if this row is today — apply min time restriction
        const now = new Date();
        const isToday = toISODate(date) === toISODate(now);
        const currentTimeStr = isToday
            ? `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
            : '';
        const minAttr = isToday ? `min="${currentTimeStr}"` : '';

    return `
            <div class="day-row"
                 style="position:relative; display:grid; grid-template-columns:1.2fr 1.2fr 80px 1fr 1fr 2.5fr; gap:12px; align-items:center;
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
                <div style="position:relative;">
                    ${isForcedByFullMonth ? `<div style="position:absolute; inset:-4px; z-index:10; cursor:pointer;" onclick="showInlinePopup(event, 'Please uncheck the apply to entire month box to make changes')"></div>` : ''}
                    <label class="toggle-switch" style="position:relative; display:inline-block; width:44px; height:24px; ${isPastOrToday ? 'cursor:not-allowed;' : ''}">
                        <input type="checkbox" id="chk_${ix}" class="day-active-chk" data-idx="${ix}" data-date="${dateStr}"
                               ${state.active && !isPastOrToday ? 'checked' : ''}
                               ${isPastOrToday || isForcedByFullMonth ? 'disabled' : ''}
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
                <div style="position:relative;">
                    ${isForcedByFullMonth ? `<div style="position:absolute; inset:0; z-index:10; cursor:pointer;" onclick="showInlinePopup(event, 'Please uncheck the apply to entire month box to make changes')"></div>` : ''}
                    <input type="time" id="start_${ix}" class="form-input day-start" data-date="${dateStr}"
                           value="${state.start}"
                           ${(!state.active || isPastOrToday || isForcedByFullMonth) ? 'disabled' : ''}
                           ${minAttr}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px; ${(isPastOrToday) ? 'cursor:not-allowed;' : ''} ${(isForcedByFullMonth) ? 'opacity:0.7;' : ''}">
                </div>

                <!-- End Time -->
                <div style="position:relative;">
                    ${isForcedByFullMonth ? `<div style="position:absolute; inset:0; z-index:10; cursor:pointer;" onclick="showInlinePopup(event, 'Please uncheck the apply to entire month box to make changes')"></div>` : ''}
                    <input type="time" id="end_${ix}" class="form-input day-end" data-date="${dateStr}"
                           value="${state.end}"
                           ${(!state.active || isPastOrToday || isForcedByFullMonth) ? 'disabled' : ''}
                           ${minAttr}
                           style="width:100%; height:36px; padding:0 8px; font-size:0.85rem;
                                  border:1px solid #e2e8f0; border-radius:6px; ${(isPastOrToday) ? 'cursor:not-allowed;' : ''} ${(isForcedByFullMonth) ? 'opacity:0.7;' : ''}">
                </div>

                <!-- Notes -->
                <div style="position:relative;">
                    ${isForcedByFullMonth ? `<div style="position:absolute; inset:0; z-index:10; cursor:pointer;" onclick="showInlinePopup(event, 'Please uncheck the apply to entire month box to make changes')"></div>` : ''}
                    <textarea id="notes_${ix}" class="form-input day-notes" data-date="${dateStr}"
                              placeholder="${isForcedByFullMonth ? 'Synced with Week 1' : 'Notes...'}"
                              ${(!state.active || isPastOrToday || isForcedByFullMonth) ? 'disabled' : ''}
                              style="width:100%; height:36px; padding:6px 8px; font-size:0.82rem;
                                     border:1px solid #e2e8f0; border-radius:6px; resize:none;
                                     font-family:inherit; box-sizing:border-box;
                                     ${(isPastOrToday) ? 'cursor:not-allowed; background:#f1f5f9;' : ''} ${(isForcedByFullMonth) ? 'opacity:0.7; background:#f1f5f9;' : ''}">${state.notes}</textarea>
                </div>
            </div>
        `;
    }).join('');

    if (htmlRows === '') {
        DOM.daysContainer.innerHTML = `
            <div style="padding:24px; text-align:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b; font-size:0.9rem;">
                Please select a future week or month.
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

            scheduleState.monthScheduleData[dateStr].active = isChecked;

            if (isChecked && !startEl.value) {
                startEl.value = '09:00';
                endEl.value   = '18:00';
                scheduleState.monthScheduleData[dateStr].start = '09:00';
                scheduleState.monthScheduleData[dateStr].end = '18:00';
            } else if (!isChecked) {
                startEl.value = '';
                endEl.value   = '';
                scheduleState.monthScheduleData[dateStr].start = '';
                scheduleState.monthScheduleData[dateStr].end = '';
            }
            if (DOM.applyFullMonth?.checked && scheduleState.currentWeekIndex === 0) {
                syncFullMonthData();
            }
        });
    });

    // Wire up inputs to save into state immediately
    ['start', 'end', 'notes'].forEach(cat => {
        DOM.daysContainer.querySelectorAll(`.day-${cat}`).forEach(input => {
            input.addEventListener('input', e => {
                const dateStr = e.target.dataset.date;
                scheduleState.monthScheduleData[dateStr][cat] = e.target.value;
                if (DOM.applyFullMonth?.checked && scheduleState.currentWeekIndex === 0) {
                    syncFullMonthData();
                }
            });
        });
    });
}

export function openModal() {
    scheduleState.currentEditingScheduleId = null;
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

export function closeModal() {
    DOM.modal.classList.remove('active');
}

export function editSchedule(scheduleId) {
    const s = scheduleState.rawSchedules.find(x => x.id === scheduleId);
    if (!s) return;

    scheduleState.currentEditingScheduleId = scheduleId;
    const titleEl = document.getElementById('createModalTitle');
    if (titleEl) titleEl.textContent = 'Edit Staff Schedule';
    
    // reset form
    DOM.form.reset();
    if (DOM.applyFullMonth) DOM.applyFullMonth.checked = false; // Default unchecked when editing to prevent accidental overwrite

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
    for (const [dateStr, data] of Object.entries(scheduleState.monthScheduleData)) {
        const dDate = new Date(dateStr);
        if (dDate < today) continue;

        const jsDay = dDate.getDay();
        const shortDay = WEEK_DAYS_SHORT[jsDay];
        const dayMatch = s.days.find(d => d.day === shortDay);

        if (dayMatch && dayMatch.active) {
            scheduleState.monthScheduleData[dateStr].active = true;
            scheduleState.monthScheduleData[dateStr].start = dayMatch.start;
            scheduleState.monthScheduleData[dateStr].end = dayMatch.end;
            scheduleState.monthScheduleData[dateStr].notes = dayMatch.notes || '';
        } else {
            scheduleState.monthScheduleData[dateStr].active = false;
            scheduleState.monthScheduleData[dateStr].start = '';
            scheduleState.monthScheduleData[dateStr].end = '';
            scheduleState.monthScheduleData[dateStr].notes = '';
        }
    }
    
    const todayStr = toISODate(today);
    let targetWeek = 0;
    for (let i = 0; i < scheduleState.currentMonthWeeks.length; i++) {
        if (scheduleState.currentMonthWeeks[i].some(d => d >= today)) {
            targetWeek = i;
            break;
        }
    }
    scheduleState.currentWeekIndex = targetWeek;

    renderDayRows();
    updatePaginationUI();

    DOM.modal.classList.add('active');
}

// Expose on window for inline onclick handlers
window.editSchedule = editSchedule;

export async function handleFormSubmit(e) {
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

    const staffMember = scheduleState.staffList.find(s => String(s.id) === String(staffId));
    if (!staffMember) {
        showToast('Invalid staff selection', true);
        return;
    }

    // ── Duplicate guard (create mode only) ───────────────────
    if (!scheduleState.currentEditingScheduleId) {
        const alreadyExists = scheduleState.rawSchedules.some(
            s => String(s.staff_id) === String(staffId) && s.target_month === targetMonth
        );
        if (alreadyExists) {
            const [dy, dm] = targetMonth.split('-').map(Number);
            const monthLabel = new Date(dy, dm - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            showToast(`Schedule is already assigned to this staff for ${monthLabel}`, true);
            return;
        }
    }

    const [yyyy, mm] = targetMonth.split('-').map(Number);
    const year       = yyyy;
    const month      = mm - 1; // 0-indexed

    const baseWeekDates = scheduleState.currentMonthWeeks[0] || [];
    const branchId      = getBranchId();

    // ── Read per-day inputs ──────────────────────────────────
    let calculatedHoursPerWeek = 0;
    const weekPattern = [];

    // Analyze Week 1 only to generate UI `payload.days` display pills and calculate base hours
    for (const date of baseWeekDates) {
        const dateStr = toISODate(date);
        const data    = scheduleState.monthScheduleData[dateStr] || { active: false, start: '', end: '', notes: '' };
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
                if (d < today) continue; // enforce past-date bypass

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
        for (const [dateStr, data] of Object.entries(scheduleState.monthScheduleData)) {
            const dDate = new Date(dateStr);
            if (dDate < today) continue; // enforce past-date bypass
            
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
    const btnSubmit = document.getElementById('btnSaveSchedule');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `
            <svg style="animation:spin 0.8s linear infinite; width:16px; height:16px; vertical-align:middle; margin-right:6px;"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>Saving...`;
    }

    const companyId = getCompanyId();

    // Add company_id and branch_id to local schedule Entries for direct DB insert
    const insertPayload = scheduleEntries.map(entry => ({
        ...entry,
        company_id: companyId,
        branch_id: branchId
    }));

    try {
        // ALWAYS Purge existing data for this staff_id and month, and overwrite directly
        await saveScheduleRecords(insertPayload, payload.staff_id, year, month);
        await fetchSchedules();

        if (DOM.toast) {
            showToast('Schedule saved successfully');
        }
    } catch (err) {
        console.error('API sync failed:', err);
        showToast(err.message || 'Error saving the schedule', true);
    } finally {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = 'Save Schedule'; }
        closeModal();
        renderTable();
    }
}
