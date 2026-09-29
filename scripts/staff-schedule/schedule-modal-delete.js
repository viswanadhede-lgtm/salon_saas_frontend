// scripts/staff-schedule/schedule-modal-delete.js

import { DOM, scheduleState } from './schedule-state.js';
import { showToast } from './schedule-helpers.js';
import { deleteScheduleByMonth } from './schedule-api.js';
import { renderTable } from './schedule-table.js';

export function deleteSchedule(scheduleId) {
    scheduleState.currentDeletingScheduleId = scheduleId;
    const backdrop = document.getElementById('deleteScheduleModalBackdrop');
    if (backdrop) backdrop.classList.add('active');
}

// Expose on window for inline onclick handlers
window.deleteSchedule = deleteSchedule;

export function injectDeleteModal() {
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
        if (scheduleState.currentDeletingScheduleId) {
            performDelete(scheduleState.currentDeletingScheduleId);
            closeDeleteScheduleModal();
        }
    });
}

export function closeDeleteScheduleModal() {
    const backdrop = document.getElementById('deleteScheduleModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    scheduleState.currentDeletingScheduleId = null;
}

export async function performDelete(scheduleId) {
    const scheduleToDelete = scheduleState.rawSchedules.find(s => s.id === scheduleId);
    const targetMonth = scheduleToDelete ? scheduleToDelete.target_month : null;
    const staffId = scheduleToDelete ? scheduleToDelete.staff_id : null;

    if (!staffId || !targetMonth) {
        showToast('Unable to determine schedule details', true);
        return;
    }

    try {
        await deleteScheduleByMonth(staffId, targetMonth);
        scheduleState.rawSchedules = scheduleState.rawSchedules.filter(s => s.id !== scheduleId);
        renderTable();

        if (DOM.toast) {
            DOM.toast.textContent = 'Schedule deleted successfully';
            DOM.toast.classList.add('show');
            setTimeout(() => DOM.toast.classList.remove('show'), 3000);
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        showToast('Failed to delete schedule', true);
    }
}
