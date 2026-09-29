// scripts/staff-schedule/schedule-api.js

import { supabase } from '../../lib/supabase.js';
import { DOM, scheduleState, setStaffList, setRawSchedules } from './schedule-state.js';
import { toISODate } from './schedule-helpers.js';

let onSchedulesUpdated = null;

export function registerScheduleUpdateListener(fn) {
    onSchedulesUpdated = fn;
}

// ─────────────────────────────────────────────────────────────
// API – FETCH STAFF
// ─────────────────────────────────────────────────────────────

export async function fetchStaff() {
    try {
        let companyId = null;
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = appContext.company?.id || localStorage.getItem('company_id') || null;
        } catch (e) { companyId = localStorage.getItem('company_id') || null; }
        const branchId = localStorage.getItem('active_branch_id') || null;

        if (companyId && branchId) {
            const { data, error } = await supabase
                .from('staff')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted');

            if (!error && data) {
                const list = data.map(staff => ({
                    id: staff.staff_id || staff.id,
                    name: staff.staff_name || staff.name || 'Unknown Staff',
                    role: staff.role_name || staff.role || 'Unassigned'
                }));
                setStaffList(list);
                populateStaffDropdown();
                return;
            }
        }
    } catch (error) {
        console.warn('API sync failed for fetchStaff.', error);
    }

    setStaffList([]);
    populateStaffDropdown();
}

export function populateStaffDropdown() {
    if (!DOM.staffSelect) return;
    const options = scheduleState.staffList.map(s =>
        `<option value="${s.id}">${s.name} (${s.role || 'Staff'})</option>`
    );
    DOM.staffSelect.innerHTML =
        `<option value="" disabled selected>Select staff member</option>` + options.join('');
}

// ─────────────────────────────────────────────────────────────
// API – FETCH EXISTING SCHEDULES
// ─────────────────────────────────────────────────────────────

export async function fetchSchedules(renderCallback) {
    try {
        let companyId = null;
        try {
            const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = appContext.company?.id || localStorage.getItem('company_id') || null;
        } catch (e) { companyId = localStorage.getItem('company_id') || null; }
        const branchId = localStorage.getItem('active_branch_id') || null;

        if (!companyId || !branchId) return;

        const filterMonth = DOM.monthFilter?.value; // 'YYYY-MM'
        let query = supabase.from('staff_schedule').select('*').eq('company_id', companyId).eq('branch_id', branchId);
        
        if (filterMonth) {
            const [yyyy, mm] = filterMonth.split('-').map(Number);
            const lastDay = new Date(yyyy, mm, 0).getDate();
            query = query.gte('schedule_date', `${filterMonth}-01`).lte('schedule_date', `${filterMonth}-${String(lastDay).padStart(2, '0')}`);
        }

        const { data, error } = await query;
        
        if (!error && data) {
            setRawSchedules(transformScheduleResponse(data));
            if (typeof renderCallback === 'function') {
                renderCallback();
            } else if (typeof onSchedulesUpdated === 'function') {
                onSchedulesUpdated();
            }
            return;
        }
    } catch (error) {
        console.warn('API sync failed for fetchSchedules.', error);
    }

    setRawSchedules([]);
    if (typeof renderCallback === 'function') {
        renderCallback();
    } else if (typeof onSchedulesUpdated === 'function') {
        onSchedulesUpdated();
    }
}

// ─────────────────────────────────────────────────────────────
// TRANSFORM: backend date-map → UI row objects
// ─────────────────────────────────────────────────────────────

export function transformScheduleResponse(flatData) {
    if (!Array.isArray(flatData)) return [];

    const grouped = {}; // key: `${staffId}_${targetMonth}`
    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (const entry of flatData) {
        const staffId = entry.staff_id;
        const dateStr = entry.schedule_date; // '2026-04-01'
        const jsDate = new Date(dateStr + 'T00:00:00'); 
        const dayName = DAY_NAMES[jsDate.getDay()];
        const targetMonth = dateStr.slice(0, 7); // 'YYYY-MM'
        
        const key = `${staffId}_${targetMonth}`;

        if (!grouped[key]) {
            const staffMember = scheduleState.staffList.find(s => String(s.id) === String(staffId));
            grouped[key] = {
                id:               key, // Using logical grouping as our UI pseudo-id
                staff_id:         staffId,
                staff_name:       staffMember?.name  || 'Unknown Staff',
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

    const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return Object.values(grouped).map(row => ({
        ...row,
        total_hours: Math.round(row.total_hours * 10) / 10,
        days: DAY_ORDER.map(d => row.days[d] || { day: d, active: false, start: null, end: null })
    }));
}

// ─────────────────────────────────────────────────────────────
// FETCH TODAY'S BOOKINGS PER STAFF
// ─────────────────────────────────────────────────────────────

export async function fetchTodayBookings(staffIds) {
    const countMap = new Map();
    if (!staffIds || staffIds.length === 0) return countMap;

    try {
        const branchId = localStorage.getItem('active_branch_id') || null;
        const today = new Date();
        const todayStr = toISODate(today); // 'YYYY-MM-DD'

        const { data, error } = await supabase
            .from('bookings_for_business_transaction')
            .select('staff_id')
            .eq('branch_id', branchId)
            .eq('booking_date', todayStr)
            .in('staff_id', staffIds);

        if (error) throw error;

        if (data) {
            for (const row of data) {
                const sid = String(row.staff_id);
                countMap.set(sid, (countMap.get(sid) || 0) + 1);
            }
        }
    } catch (err) {
        console.warn('fetchTodayBookings failed:', err);
    }

    return countMap;
}

// ─────────────────────────────────────────────────────────────
// DATABASE MUTATIONS: DELETE & SAVE
// ─────────────────────────────────────────────────────────────

export async function deleteScheduleByMonth(staffId, targetMonth) {
    const [yyyy, mm] = targetMonth.split('-').map(Number);
    const lastDay = new Date(yyyy, mm, 0).getDate();

    const { error } = await supabase
        .from('staff_schedule')
        .eq('staff_id', staffId)
        .gte('schedule_date', `${targetMonth}-01`)
        .lte('schedule_date', `${targetMonth}-${String(lastDay).padStart(2, '0')}`)
        .delete();
    
    if (error) throw error;
}

export async function saveScheduleRecords(insertPayload, staffId, year, month) {
    // ALWAYS Purge existing data for this staff_id and month, and overwrite directly
    const lastDay = new Date(year, month + 1, 0).getDate();
    const { error: delError } = await supabase
        .from('staff_schedule')
        .eq('staff_id', staffId)
        .gte('schedule_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
        .lte('schedule_date', `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
        .delete();

    if (delError) {
        throw new Error('Failed to overwrite existing schedule');
    }

    // Insert new schedules
    if (insertPayload.length > 0) {
        const { error: insError } = await supabase.from('staff_schedule').insert(insertPayload);
        if (insError) throw insError;
    }
}
