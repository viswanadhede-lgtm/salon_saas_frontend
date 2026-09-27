/**
 * scripts/app-layout/schedule.js
 * Controls schedule modal HTML injection, tab switching between
 * This Week and Next Week, and staff schedule data retrieval/rendering from Supabase.
 */

export function ensureScheduleModalHtml() {
    if (document.getElementById('scheduleModalOverlay')) return;
    if (!document.body) return;

    const modalHtml = `
    <!-- Schedule Modal (Shared App Shell Component) -->
    <div class="modal-overlay" id="scheduleModalOverlay">
        <div class="modal-container" id="scheduleModal" style="min-height: 60vh;">
            <div class="modal-header">
                <div class="header-titles">
                    <h2 id="scheduleModalTitle">Schedule</h2>
                    <p class="subtitle" id="scheduleModalSubtitle">View your upcoming work schedule.</p>
                </div>
                <button class="modal-close" id="closeScheduleModal"><i data-feather="x"></i></button>
            </div>

            <div class="modal-body" style="padding: 1.5rem; flex: 1; overflow-y: auto; flex-direction: column;">
                <!-- Tab Headers -->
                <div class="schedule-tabs" style="display: flex; gap: 8px; margin-bottom: 1.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                    <button class="schedule-tab-btn active" id="tabBtnThisWeek" style="padding: 8px 16px; border: none; background: none; font-weight: 600; font-size: 0.95rem; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; cursor: pointer; transition: all 0.2s;">This Week</button>
                    <button class="schedule-tab-btn" id="tabBtnNextWeek" style="padding: 8px 16px; border: none; background: none; font-weight: 500; font-size: 0.95rem; color: #64748b; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">Next Week</button>
                </div>

                <!-- Tab Content: This Week -->
                <div class="schedule-tab-pane" id="paneThisWeek" style="display: block;">
                    <div style="padding:40px; text-align:center; color:#64748b;">Loading your schedule...</div>
                </div>

                <!-- Tab Content: Next Week -->
                <div class="schedule-tab-pane" id="paneNextWeek" style="display: none;">
                    <div style="padding:40px; text-align:center; color:#64748b;">Loading your schedule...</div>
                </div>
            </div>

            <div class="modal-footer" style="justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btnCloseScheduleFooter">Close</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export function bindScheduleModalEvents(modalOverlay) {
    if (!modalOverlay || modalOverlay.dataset.appLayoutEventsBound) return;
    modalOverlay.dataset.appLayoutEventsBound = '1';

    const closeBtn = document.getElementById('closeScheduleModal');
    const footerCloseBtn = document.getElementById('btnCloseScheduleFooter');
    if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeScheduleModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeScheduleModal();
    });

    const tabBtnThisWeek = document.getElementById('tabBtnThisWeek');
    const tabBtnNextWeek = document.getElementById('tabBtnNextWeek');
    const paneThisWeek = document.getElementById('paneThisWeek');
    const paneNextWeek = document.getElementById('paneNextWeek');

    if (tabBtnThisWeek && tabBtnNextWeek) {
        tabBtnThisWeek.addEventListener('click', () => {
            tabBtnThisWeek.classList.add('active');
            tabBtnNextWeek.classList.remove('active');
            tabBtnThisWeek.style.color = '#1e3a8a';
            tabBtnThisWeek.style.borderBottom = '2px solid #1e3a8a';
            tabBtnThisWeek.style.fontWeight = '600';

            tabBtnNextWeek.style.color = '#64748b';
            tabBtnNextWeek.style.borderBottom = '2px solid transparent';
            tabBtnNextWeek.style.fontWeight = '500';

            if (paneThisWeek) paneThisWeek.style.display = 'block';
            if (paneNextWeek) paneNextWeek.style.display = 'none';
        });

        tabBtnNextWeek.addEventListener('click', () => {
            tabBtnNextWeek.classList.add('active');
            tabBtnThisWeek.classList.remove('active');
            tabBtnNextWeek.style.color = '#1e3a8a';
            tabBtnNextWeek.style.borderBottom = '2px solid #1e3a8a';
            tabBtnNextWeek.style.fontWeight = '600';

            tabBtnThisWeek.style.color = '#64748b';
            tabBtnThisWeek.style.borderBottom = '2px solid transparent';
            tabBtnThisWeek.style.fontWeight = '500';

            if (paneThisWeek) paneThisWeek.style.display = 'none';
            if (paneNextWeek) paneNextWeek.style.display = 'block';
        });
    }
}

export async function fetchAndRenderUserSchedule() {
    const paneThisWeek = document.getElementById('paneThisWeek');
    const paneNextWeek = document.getElementById('paneNextWeek');
    if (!paneThisWeek || !paneNextWeek) return;

    // Show loading state
    const loadingHtml = '<div style="padding:40px; text-align:center; color:#64748b;"><div class="spinner-sm" style="margin:0 auto 12px;"></div>Loading your schedule...</div>';
    paneThisWeek.innerHTML = loadingHtml;
    paneNextWeek.innerHTML = loadingHtml;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) throw new Error("App context not found.");
        const context = JSON.parse(contextStr);
        const userEmail = context.user?.email;
        const companyId = context.company?.company_id || localStorage.getItem('company_id');

        if (!userEmail) throw new Error("User email not found in session.");

        const { supabase } = await import('../../lib/supabase.js');

        // 1. Find staff_id by email
        let staffQuery = supabase
            .from('staff')
            .select('staff_id, role_name')
            .eq('email', userEmail);

        if (companyId) {
            staffQuery = staffQuery.eq('company_id', companyId);
        }

        const { data: staffDataArr, error: staffErr } = await staffQuery.limit(1);

        if (staffErr) throw staffErr;
        const staffData = staffDataArr && staffDataArr.length > 0 ? staffDataArr[0] : null;
        if (!staffData) {
            const noStaffHtml = '<div style="padding:40px; text-align:center; color:#64748b;">No staff record found for your email. Please contact your administrator.</div>';
            paneThisWeek.innerHTML = noStaffHtml;
            paneNextWeek.innerHTML = noStaffHtml;
            return;
        }

        const staffId = staffData.staff_id;

        // 2. Calculate Date Ranges
        const today = new Date();
        const getMonday = (d) => {
            const date = new Date(d);
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
            return new Date(date.setDate(diff));
        };

        const thisMon = getMonday(today);
        const nextMon = new Date(thisMon);
        nextMon.setDate(thisMon.getDate() + 7);

        const formatDateISO = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const getWeekDates = (monday) => {
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                dates.push(formatDateISO(d));
            }
            return dates;
        };

        const thisWeekDates = getWeekDates(thisMon);
        const nextWeekDates = getWeekDates(nextMon);

        // 3. Fetch Schedules
        const allDates = [...thisWeekDates, ...nextWeekDates];
        const { data: schedData, error: schedErr } = await supabase
            .from('staff_schedule')
            .select('*')
            .eq('staff_id', staffId)
            .in('schedule_date', allDates);

        if (schedErr) throw schedErr;

        // 4. Render Helper
        const renderWeek = (dates) => {
            let html = `
                <div style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 6px 16px 10px 16px; border-bottom: 1px solid #e2e8f0; margin-bottom: 10px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Date</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Day</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Time</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">Comments</div>
                </div>
                <ul class="schedule-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">
            `;

            dates.forEach(dateStr => {
                const [y, m, d] = dateStr.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const record = (schedData || []).find(s => s.schedule_date === dateStr);

                if (!record || record.is_off) {
                    html += `
                        <li class="schedule-item" style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; align-items: center;">
                            <div style="font-size: 0.88rem; color: #475569; font-weight: 500;">${shortDate}</div>
                            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">${dayName}</div>
                            <div style="color: #ef4444; font-size: 0.9rem; font-weight: 600;">Off</div>
                            <div style="color: #94a3b8; font-size: 0.85rem; text-align: right;">${record?.notes || '-'}</div>
                        </li>
                    `;
                } else {
                    const start = record.start_time ? record.start_time.substring(0, 5) : '--';
                    const end = record.end_time ? record.end_time.substring(0, 5) : '--';
                    html += `
                        <li class="schedule-item" style="display: grid; grid-template-columns: 100px 120px 1fr 1fr; padding: 12px 16px; background: #ffffff; border-radius: 8px; align-items: center; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.88rem; color: #475569; font-weight: 500;">${shortDate}</div>
                            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">${dayName}</div>
                            <div style="color: #0f172a; font-size: 0.9rem; font-weight: 500;">${start} - ${end}</div>
                            <div style="color: #64748b; font-size: 0.85rem; text-align: right;">${record.notes || '-'}</div>
                        </li>
                    `;
                }
            });

            html += `</ul>`;
            return html;
        };

        paneThisWeek.innerHTML = renderWeek(thisWeekDates);
        paneNextWeek.innerHTML = renderWeek(nextWeekDates);

    } catch (err) {
        console.error("Schedule Fetch Error:", err);
        const errHtml = `<div style="padding:40px; text-align:center; color:#ef4444;">Failed to load schedule: ${err.message}</div>`;
        paneThisWeek.innerHTML = errHtml;
        paneNextWeek.innerHTML = errHtml;
    }
}

export function openScheduleModal() {
    ensureScheduleModalHtml();
    const modalOverlay = document.getElementById('scheduleModalOverlay');
    if (!modalOverlay) return;

    bindScheduleModalEvents(modalOverlay);

    const tabBtnThisWeek = document.getElementById('tabBtnThisWeek');
    if (tabBtnThisWeek) tabBtnThisWeek.click();

    fetchAndRenderUserSchedule();

    modalOverlay.classList.add('active');

    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }
}

export function closeScheduleModal() {
    const modalOverlay = document.getElementById('scheduleModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

// Preserve global window APIs
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
