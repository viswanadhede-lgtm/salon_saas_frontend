// scripts/staff-schedule/schedule-helpers.js

import { DOM, WEEK_DAYS_FULL, MONTH_NAMES } from './schedule-state.js';

/**
 * Splits the selected month into arrays of up to 7 Date objects.
 */
export function generateMonthWeeks(year, month) {
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

/**
 * Returns all dates in a month that match a specific day of week (0=Sun, 1=Mon, ..., 6=Sat).
 */
export function getAllWeekdayDatesInMonth(year, month, jsDay) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const matching = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        if (d.getDay() === jsDay) {
            matching.push(d);
        }
    }
    return matching;
}

/** Format a Date object to YYYY-MM-DD using local time */
export function toISODate(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Format date as "1 Apr" */
export function formatDateOnly(date) {
    if (!date) return '';
    if (typeof date === 'string') {
        date = new Date(date + 'T00:00:00');
    }
    const day = date.getDate();
    const mon = MONTH_NAMES[date.getMonth()];
    return `${day} ${mon}`;
}

/** Format day name e.g. "Wednesday" */
export function formatDayOnly(date) {
    if (typeof date === 'string') {
        date = new Date(date + 'T00:00:00');
    }
    return WEEK_DAYS_FULL[date.getDay()];
}

export function formatDayLabel(date) {
    return `${formatDateOnly(date)} (${formatDayOnly(date)})`;
}

/** Parse year/month (0-indexed) from the modal's month <input> value. */
export function parseModalMonth() {
    const val = DOM.monthSelect ? DOM.monthSelect.value : '';
    if (val) {
        const [y, m] = val.split('-').map(Number);
        return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
}

export function showToast(msg, isError = false) {
    if (!DOM.toast) return;
    DOM.toast.textContent        = msg;
    DOM.toast.style.background   = isError ? '#ef4444' : '#10b981';
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 3500);
}

export function showInlinePopup(e, msg) {
    const popup = document.createElement('div');
    popup.textContent = msg;
    popup.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY - 35}px;
        background: #1e293b;
        color: #fff;
        padding: 6px 12px;
        font-size: 0.75rem;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        pointer-events: none;
        white-space: nowrap;
        opacity: 1;
        transition: opacity 0.3s;
    `;
    document.body.appendChild(popup);
    setTimeout(() => { popup.style.opacity = '0'; }, 1500);
    setTimeout(() => { popup.remove(); }, 1800);
}

// Preserve window global for dynamically injected onclick handlers
window.showInlinePopup = showInlinePopup;
