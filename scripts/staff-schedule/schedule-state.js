// scripts/staff-schedule/schedule-state.js

/**
 * Staff Schedule State & Constants
 */

export const WEEK_DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES     = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DOM = {
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

export const scheduleState = {
    staffList: [],
    rawSchedules: [],
    currentEditingScheduleId: null,
    currentDeletingScheduleId: null,
    currentMonthWeeks: [],
    currentWeekIndex: 0,
    monthScheduleData: {} // 'YYYY-MM-DD' -> { active, start, end, notes }
};

export function setStaffList(list) {
    scheduleState.staffList = list;
}

export function setRawSchedules(schedules) {
    scheduleState.rawSchedules = schedules;
}

export function setCurrentEditingScheduleId(id) {
    scheduleState.currentEditingScheduleId = id;
}

export function setCurrentDeletingScheduleId(id) {
    scheduleState.currentDeletingScheduleId = id;
}

export function setCurrentMonthWeeks(weeks) {
    scheduleState.currentMonthWeeks = weeks;
}

export function setCurrentWeekIndex(idx) {
    scheduleState.currentWeekIndex = idx;
}

export function setMonthScheduleData(data) {
    scheduleState.monthScheduleData = data;
}
