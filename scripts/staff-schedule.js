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
    toast: document.getElementById('toastNotification')
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let staffList = [];
let rawSchedules = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    renderDayRows();
    
    // Set default month to current month
    const now = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (DOM.monthFilter) DOM.monthFilter.value = currentMonthVal;
    
    await fetchStaff();
    await fetchSchedules();
});

function setupEventListeners() {
    DOM.btnCreate?.addEventListener('click', () => openModal());
    DOM.btnCloseModal?.addEventListener('click', closeModal);
    DOM.btnCancelModal?.addEventListener('click', closeModal);
    DOM.modal?.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });
    
    DOM.form?.addEventListener('submit', handleFormSubmit);
    DOM.monthFilter?.addEventListener('change', renderTable);
}

function renderDayRows() {
    if (!DOM.daysContainer) return;
    
    DOM.daysContainer.innerHTML = WEEK_DAYS.map((day, ix) => `
        <div class="day-row" style="display: grid; grid-template-columns: 100px 80px 100px 100px 1fr; gap: 12px; align-items: center; background: #fff; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: border-color 0.2s;">
            <div style="font-weight: 600; color: #334155;">${day}</div>
            <div>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="chk_${ix}" class="day-active-chk" data-idx="${ix}" ${ix < 5 ? 'checked' : ''} style="opacity: 0; width: 0; height: 0; position: absolute;">
                    <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${ix < 5 ? '#10b981' : '#cbd5e1'}; border-radius: 24px; transition: .4s;">
                        <span style="position: absolute; height: 18px; width: 18px; left: ${ix < 5 ? '22px' : '3px'}; bottom: 3px; background-color: white; border-radius: 50%; transition: .4s; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"></span>
                    </span>
                </label>
            </div>
            <div>
                <input type="time" id="start_${ix}" class="form-input day-start" value="${ix < 5 ? '09:00' : ''}" ${ix >= 5 ? 'disabled' : ''} style="width: 100%; height: 36px; padding: 0 8px; font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 6px;">
            </div>
            <div>
                <input type="time" id="end_${ix}" class="form-input day-end" value="${ix < 5 ? '18:00' : ''}" ${ix >= 5 ? 'disabled' : ''} style="width: 100%; height: 36px; padding: 0 8px; font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 6px;">
            </div>
            <div>
                <input type="text" id="notes_${ix}" class="form-input day-notes" placeholder="e.g. Lunch 1-2pm" ${ix >= 5 ? 'disabled' : ''} style="width: 100%; height: 36px; padding: 0 12px; font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 6px;">
            </div>
        </div>
    `).join('');

    // Attach logic to toggle inputs
    DOM.daysContainer.querySelectorAll('.day-active-chk').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = e.target.dataset.idx;
            const isChecked = e.target.checked;
            
            // UI Toggle Animation manually
            const slider = e.target.nextElementSibling;
            const knob = slider.firstElementChild;
            if (isChecked) {
                slider.style.backgroundColor = '#10b981';
                knob.style.left = '22px';
            } else {
                slider.style.backgroundColor = '#cbd5e1';
                knob.style.left = '3px';
            }

            const start = document.getElementById(`start_${idx}`);
            const end = document.getElementById(`end_${idx}`);
            const notes = document.getElementById(`notes_${idx}`);
            
            start.disabled = !isChecked;
            end.disabled = !isChecked;
            notes.disabled = !isChecked;
            
            if (isChecked && !start.value) {
                start.value = '09:00';
                end.value = '18:00';
            } else if (!isChecked) {
                start.value = '';
                end.value = '';
                notes.value = '';
            }
        });
    });
}

function openModal() {
    DOM.form.reset();
    renderDayRows(); // Reset the days to default state
    DOM.modal.classList.add('active');
    
    // Default to current month if applicable
    const now = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    DOM.monthSelect.value = currentMonthVal;
}

function closeModal() {
    DOM.modal.classList.remove('active');
}

function showToast(msg, isError = false) {
    DOM.toast.textContent = msg;
    DOM.toast.style.background = isError ? '#ef4444' : '#10b981';
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

// ================= API CALLS =================

async function fetchStaff() {
    try {
        const response = await fetchWithAuth(API.READ_STAFF, { method: 'GET' }, 'staff_management', 'read');
        if (response.ok) {
            const data = await response.json();
            staffList = data.staff || data; // handle payload structure 
            populateStaffDropdown();
        } else {
            console.error('Failed to load staff');
            // Mock fallback
            staffList = [
                { id: 'S1', name: 'Sarah Johnson', role: 'Senior Stylist' },
                { id: 'S2', name: 'Michael Lee', role: 'Barber' },
                { id: 'S3', name: 'Anjali Sharma', role: 'Therapist' }
            ];
            populateStaffDropdown();
        }
    } catch (error) {
        console.error('Error loading staff', error);
    }
}

function populateStaffDropdown() {
    if (!DOM.staffSelect) return;
    const options = staffList.map(s => `<option value="${s.id}">${s.name} (${s.role || 'Staff'})</option>`);
    DOM.staffSelect.innerHTML = `<option value="" disabled selected>Select staff member</option>` + options.join('');
}

async function fetchSchedules() {
    try {
        // Trying to read schedule. Will likely mock if endpoint doesn't exist yet.
        const response = await fetchWithAuth(API.READ_SCHEDULE, { method: 'GET' }, 'staff_schedules', 'read');
        if (response.ok) {
            rawSchedules = await response.json();
        } else {
            throw new Error('API not available, using mocks');
        }
    } catch (e) {
        // Mock DB
        rawSchedules = [
            {
                id: 'SCH_1',
                staff_id: 'S1',
                staff_name: 'Sarah Johnson',
                staff_role: 'Senior Stylist',
                target_month: '2026-04',
                total_hours: 40,
                days: [
                    { day: 'Mon', active: true, start: '09:00', end: '18:00' },
                    { day: 'Tue', active: true, start: '09:00', end: '18:00' },
                    { day: 'Wed', active: true, start: '09:00', end: '18:00' },
                    { day: 'Thu', active: true, start: '09:00', end: '18:00' },
                    { day: 'Fri', active: true, start: '09:00', end: '18:00' },
                    { day: 'Sat', active: false },
                    { day: 'Sun', active: false }
                ]
            }
        ];
    }
    renderTable();
}

function renderTable() {
    if (!DOM.tableBody) return;
    
    // Filter by selected month
    const filterMonth = DOM.monthFilter ? DOM.monthFilter.value : null;
    let viewData = [...rawSchedules];
    
    if (filterMonth) {
        viewData = viewData.filter(s => s.target_month === filterMonth);
    }

    if (viewData.length === 0) {
        DOM.tableBody.innerHTML = `<tr><td colspan="5" style="padding:40px; text-align:center; color:#94a3b8; font-size: 0.95rem;">No schedules found for this period. Click 'Create Schedule' to assign hours.</td></tr>`;
        return;
    }

    DOM.tableBody.innerHTML = viewData.map(s => {
        // Build beautiful mini day blocks
        const dayPills = s.days.map(d => {
            if (d.active) {
                return `<div style="display:inline-block; margin: 2px 4px 2px 0; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;" title="${d.start} - ${d.end}">${d.day}</div>`;
            } else {
                return `<div style="display:inline-block; margin: 2px 4px 2px 0; background: #f1f5f9; color: #94a3b8; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 500;" title="Off">${d.day}</div>`;
            }
        }).join('');
        
        // Format month
        const [yyyy, mm] = s.target_month.split('-');
        const dateObj = new Date(yyyy, parseInt(mm) - 1);
        const monthLabel = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });

        return `
        <tr class="tb-row" style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
            <td style="padding:14px 16px 14px 24px;">
                <div style="font-weight: 600; color: #1e293b; font-size: 0.9rem;">${s.staff_name}</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">${s.staff_role}</div>
            </td>
            <td style="padding:14px 16px;">
                <span style="display:inline-block; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 500; font-size: 0.8rem; color: #475569;">
                    <i data-feather="calendar" style="width: 12px; height: 12px; vertical-align: -2px; margin-right: 4px;"></i>${monthLabel}
                </span>
            </td>
            <td style="padding:14px 16px; font-weight: 600; color: #0f172a;">${s.total_hours} <span style="font-weight:400; color:#64748b; font-size:0.8rem;">hrs</span></td>
            <td style="padding:14px 16px;">
                <div style="display:flex; flex-wrap: wrap;">${dayPills}</div>
            </td>
            <td style="padding:14px 16px;">
                <button class="icon-btn" style="color: #6366f1; background: #e0e7ff; margin-right: 8px;" title="Edit" onclick="alert('Edit schedule (concept)')">
                    <i data-feather="edit-2" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="icon-btn" style="color: #ef4444; background: #fee2e2;" title="Delete" onclick="alert('Delete schedule')">
                    <i data-feather="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>
    `}).join('');
    
    // Need to re-init feather icons for dynamically added ones
    if (window.feather) window.feather.replace();
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const staffId = DOM.staffSelect.value;
    const targetMonth = DOM.monthSelect.value;
    
    // Find staff details from selected id
    const staffMember = staffList.find(s => String(s.id) === String(staffId));
    if (!staffMember) {
        showToast("Invalid staff selection", true);
        return;
    }

    const payload = {
        staff_id: staffId,
        staff_name: staffMember.name,
        staff_role: staffMember.role || 'Staff',
        target_month: targetMonth,
        days: []
    };

    let calculatedHours = 0;

    for (let i = 0; i < 7; i++) {
        const isChecked = document.getElementById(`chk_${i}`).checked;
        const dayLabel = WEEK_DAYS[i].substring(0, 3); // Mon, Tue...
        
        let start = null;
        let end = null;
        let notes = null;

        if (isChecked) {
            start = document.getElementById(`start_${i}`).value;
            end = document.getElementById(`end_${i}`).value;
            notes = document.getElementById(`notes_${i}`).value;
            
            if (!start || !end) {
                showToast(`Please provide start/end times for ${WEEK_DAYS[i]}`, true);
                return;
            }

            // Calc hours roughly
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            let diff = (eh + em/60) - (sh + sm/60);
            if (diff < 0) diff += 24; // overnight shift?
            calculatedHours += diff;
        }

        payload.days.push({
            day: dayLabel,
            active: isChecked,
            start: start,
            end: end,
            notes: notes
        });
    }

    payload.total_hours = Math.round(calculatedHours * 10) / 10;

    // Optional: Send to backend!
    try {
        const response = await fetchWithAuth(API.CREATE_SCHEDULE, {
            method: 'POST',
            body: JSON.stringify(payload)
        }, 'staff_schedules', 'create');

        if (response.ok) {
            showToast("Schedule created successfully");
        } else {
            console.warn("Backend rejected or isn't there yet. Creating mock locally in UI.");
            showToast("Created mock schedule");
        }
    } catch (err) {
        console.warn("API Call Failed, saving to UI Mock array fallback", err);
        showToast("Saved locally (Demo mode)");
    }

    // Push into our mock array so the UI visually updates
    payload.id = 'SCH_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    
    // Filter out old schedule for this staff+month if it exists
    rawSchedules = rawSchedules.filter(s => !(s.staff_id === payload.staff_id && s.target_month === payload.target_month));
    rawSchedules.push(payload);
    
    closeModal();
    renderTable();
}
