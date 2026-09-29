// scripts/staff-schedule.js — Thin Orchestrator
// Modularized from monolithic script into scripts/staff-schedule/ modules.

import { DOM, scheduleState } from './staff-schedule/schedule-state.js';
import { parseModalMonth, showInlinePopup } from './staff-schedule/schedule-helpers.js';
import { fetchStaff, fetchSchedules, registerScheduleUpdateListener } from './staff-schedule/schedule-api.js';
import { renderTable } from './staff-schedule/schedule-table.js';
import {
    openModal,
    closeModal,
    editSchedule,
    handleFormSubmit,
    initializeMonthBuilder,
    renderDayRows,
    updatePaginationUI,
    syncFullMonthData
} from './staff-schedule/schedule-modal-edit.js';
import { closeViewModal, switchViewTab, viewSchedule } from './staff-schedule/schedule-modal-view.js';
import { injectDeleteModal, deleteSchedule } from './staff-schedule/schedule-modal-delete.js';

// ─────────────────────────────────────────────────────────────
// WINDOW APIS (Required for dynamically generated inline onclicks)
// ─────────────────────────────────────────────────────────────
window.showInlinePopup = showInlinePopup;
window.editSchedule    = editSchedule;
window.deleteSchedule  = deleteSchedule;
window.viewSchedule    = viewSchedule;

// Register renderTable as default callback when schedules update
registerScheduleUpdateListener(renderTable);

// ─────────────────────────────────────────────────────────────
// EVENT LISTENERS SETUP
// ─────────────────────────────────────────────────────────────
function setupEventListeners() {
    injectDeleteModal();
    DOM.btnCreate?.addEventListener('click', openModal);
    DOM.btnCloseModal?.addEventListener('click', closeModal);
    DOM.btnCancelModal?.addEventListener('click', closeModal);
    DOM.modal?.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });

    DOM.form?.addEventListener('submit', handleFormSubmit);
    DOM.monthFilter?.addEventListener('change', () => fetchSchedules(renderTable));

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
        if (scheduleState.currentWeekIndex < scheduleState.currentMonthWeeks.length - 1) {
            scheduleState.currentWeekIndex++;
            renderDayRows();
            updatePaginationUI();
        }
    });

    document.getElementById('btnPrevWeek')?.addEventListener('click', () => {
        if (scheduleState.currentWeekIndex > 0) {
            scheduleState.currentWeekIndex--;
            renderDayRows();
            updatePaginationUI();
        }
    });

    DOM.applyFullMonth?.addEventListener('change', () => {
        if (DOM.applyFullMonth.checked) {
            syncFullMonthData();
        }
        updatePaginationUI();
        renderDayRows();
    });
}

// ─────────────────────────────────────────────────────────────
// INITIALIZATION & STARTUP LIFECYCLE
// ─────────────────────────────────────────────────────────────
async function initStaffSchedule() {
    setupEventListeners();

    // Default filter to current month
    const now = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (DOM.monthFilter) DOM.monthFilter.value = currentMonthVal;

    if (window.feather) window.feather.replace();

    await fetchStaff();
    await fetchSchedules(renderTable);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStaffSchedule);
} else {
    initStaffSchedule();
}
