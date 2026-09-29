// scripts/staff-schedule/schedule-modal-view.js

import { DOM, scheduleState } from './schedule-state.js';
import { generateMonthWeeks, toISODate, showToast } from './schedule-helpers.js';

export function closeViewModal() {
    DOM.viewModal?.classList.remove('active');
}

export function switchViewTab(tab) {
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

export function viewSchedule(scheduleId) {
    const s = scheduleState.rawSchedules.find(x => x.id === scheduleId);
    if (!s) return;

    // Dynamically rename the first tab
    const now = new Date();
    const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const tabThisWeekBtn = document.getElementById('tabThisWeekBtn');
    if (tabThisWeekBtn) {
        if (s.target_month === currentMonthVal) {
            tabThisWeekBtn.textContent = "This Week's Timings";
        } else {
            tabThisWeekBtn.textContent = "First Week's Timings";
        }
    }

    document.getElementById('viewStaffName').textContent = s.staff_name;
    const [yyyy, mm] = s.target_month.split('-');
    const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1);
    document.getElementById('viewTargetMonth').textContent = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

    const scopeBdg = document.getElementById('viewMonthScopeBdg');
    if (s.apply_full_month) {
        scopeBdg.textContent = "Full Month's Schedule";
        scopeBdg.style.background = '#dcfce7'; scopeBdg.style.color = '#16a34a';
    } else {
        scopeBdg.textContent = 'Partial / Custom';
        scopeBdg.style.background = '#fef9c3'; scopeBdg.style.color = '#854d0e';
    }

    // Wire up Share Button
    const btnShare = document.getElementById('btnShareSchedule');
    if (btnShare) {
        btnShare.onclick = () => {
            let bodyText = `Hi ${s.staff_name},\n\nHere is your schedule for ${dateObj.toLocaleString('default', { month: 'long', year: 'numeric' })}:\n\n`;
            bodyText += `--- Weekly Pattern ---\n`;
            const fullDayMap = { 'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday' };
            s.days.forEach(d => {
                if (d.active) {
                    function fmt(t) {
                        if (!t) return '';
                        const [h, m] = t.split(':').map(Number);
                        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                    }
                    bodyText += `${fullDayMap[d.day] || d.day}: ${fmt(d.start)} - ${fmt(d.end)}\n`;
                } else {
                    bodyText += `${fullDayMap[d.day] || d.day}: Off\n`;
                }
            });

            if (s.schedule_entries && s.schedule_entries.length > 0) {
                bodyText += `\n--- Specific Overrides ---\n`;
                s.schedule_entries.forEach(e => {
                    if (e.is_off) {
                        bodyText += `${e.schedule_date}: Off\n`;
                    } else {
                        function fmt(t) {
                            if (!t) return '';
                            const [h, m] = t.split(':').map(Number);
                            return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                        }
                        bodyText += `${e.schedule_date}: ${fmt(e.start_time)} - ${fmt(e.end_time)}\n`;
                    }
                });
            }
            
            bodyText += `\nTotal Hours: ${s.total_hours} hrs/week\n`;
            bodyText += `\nPlease let us know if you have any questions.\n`;

            const subject = encodeURIComponent(`Your Schedule: ${dateObj.toLocaleString('default', { month: 'long', year: 'numeric' })}`);
            const body = encodeURIComponent(bodyText);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        };
    }

    // Wire up Download Button (PDF)
    const btnDownload = document.getElementById('btnDownloadSchedule');
    if (btnDownload) {
        btnDownload.onclick = () => {
            if (!window.html2pdf) {
                showToast('Unable to load PDF generator.', true);
                return;
            }

            // Force switch to the monthly view so the DOM is rendered correctly for html2canvas
            switchViewTab('month');
            
            const element = document.getElementById('tabMonthContent');
            
            // Inject temporary header for the PDF
            const tempHeader = document.createElement('div');
            tempHeader.id = 'pdfTempHeader';
            tempHeader.style.marginBottom = '20px';
            tempHeader.style.padding = '8px 16px 0 16px';
            tempHeader.innerHTML = `
                <h2 style="font-size: 1.25rem; font-weight: 700; color: #1e293b; margin: 0 0 4px 0; font-family: Inter, sans-serif;">Schedule: <span style="color:#6366f1;">${s.staff_name}</span></h2>
                <p style="font-size: 0.875rem; color: #64748b; margin: 0; font-family: Inter, sans-serif; font-weight:500;">Target Month: <span style="color:#475569; font-weight:600;">${dateObj.toLocaleString('default', { month: 'long', year: 'numeric' })}</span></p>
            `;
            element.insertBefore(tempHeader, element.firstChild);

            const opt = {
                margin:       0.3, 
                filename:     `${s.staff_name.replace(/\W+/g, '_')}_Monthly_Schedule_${s.target_month}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            
            const originalHTML = btnDownload.innerHTML;
            btnDownload.innerHTML = `
                <svg style="animation:spin 0.8s linear infinite; width:14px; height:14px; margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg> Generated`;
            btnDownload.disabled = true;

            html2pdf().set(opt).from(element).save().then(() => {
                btnDownload.innerHTML = originalHTML;
                btnDownload.disabled = false;
                const h = document.getElementById('pdfTempHeader');
                if (h) h.remove();
            }).catch(err => {
                console.error(err);
                btnDownload.innerHTML = originalHTML;
                btnDownload.disabled = false;
                const h = document.getElementById('pdfTempHeader');
                if (h) h.remove();
                if (window.showToast) showToast('Failed to download PDF', true);
            });
        };
    }

    // Helpers for Date & Time Mapping
    function fmt12(t) {
        if (!t || typeof t !== 'string') return '';
        const [h, m] = t.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    let targetWeekDateObjBtn;
    if (s.target_month === currentMonthVal) {
        targetWeekDateObjBtn = now;
    } else {
        const [fYear, fMonth] = s.target_month.split('-').map(Number);
        targetWeekDateObjBtn = new Date(fYear, fMonth - 1, 1);
    }
    const isoTargetIdxBtn = (targetWeekDateObjBtn.getDay() + 6) % 7; 
    const mondayBtn = new Date(targetWeekDateObjBtn);
    mondayBtn.setDate(targetWeekDateObjBtn.getDate() - isoTargetIdxBtn);
    mondayBtn.setHours(0, 0, 0, 0);

    const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    // Populate This Week
    const fullDayMap = { 'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday' };
    
    const weekHtml = s.days.map((d, index) => {
        // Calculate exact date string e.g. "01-06-2026"
        const dayOffset = DAY_ORDER.indexOf(d.day);
        const exactDate = new Date(mondayBtn);
        exactDate.setDate(mondayBtn.getDate() + dayOffset);
        
        const dd = String(exactDate.getDate()).padStart(2, '0');
        const mmStr = String(exactDate.getMonth() + 1).padStart(2, '0');
        const yyyyStr = exactDate.getFullYear();
        const dateFormatted = `${dd}-${mmStr}-${yyyyStr}`;
        
        const fullDayName = fullDayMap[d.day] || d.day;

        if (d.active) {
            return `
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; align-items:center; background:#fff; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="font-size:0.875rem; color:#475569; font-weight:600;">${dateFormatted}</div>
                    <div style="font-weight:600; color:#334155; font-size:0.875rem;">${fullDayName}</div>
                    <div style="font-size:0.85rem; color:#475569; font-weight:600;">${fmt12(d.start)} - ${fmt12(d.end)}</div>
                    <div style="font-size:0.85rem; color:#64748b; font-style:italic;">${d.notes || '-'}</div>
                </div>`;
        } else {
            return `
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:8px; border:1px dashed #cbd5e1; opacity:0.8;">
                    <div style="font-size:0.875rem; color:#94a3b8; font-weight:600;">${dateFormatted}</div>
                    <div style="font-weight:600; color:#94a3b8; font-size:0.875rem;">${fullDayName}</div>
                    <div style="font-size:0.85rem; color:#94a3b8; font-weight:600;">Off</div>
                    <div style="font-size:0.85rem; color:#cbd5e1;">-</div>
                </div>`;
        }
    }).join('');
    document.getElementById('viewWeekContainer').innerHTML = weekHtml;

    // Populate Month View (mini timeline/summary of repeating pattern)
    const monthHtmlArray = [];
    const targetWeeks = generateMonthWeeks(parseInt(yyyy), parseInt(mm) - 1);
    
    const jsDayMap = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 0 };

    for(let w = 0; w < targetWeeks.length; w++) {
        const weekDates = targetWeeks[w];
        
        const miniPills = DAY_ORDER.map(dayCode => {
            const jsDay = jsDayMap[dayCode];
            const dateObj = weekDates.find(d => d.getDay() === jsDay);
            
            if (!dateObj) {
                return `<div style="display:flex; flex-direction:column; background:#f8fafc; padding:10px 6px; border-radius:6px; flex:1; text-align:center; border:1px dashed #e2e8f0; opacity:0.4;">
                 <span style="font-size:0.75rem; font-weight:600; color:#cbd5e1; text-transform:uppercase;">${dayCode}</span>
                 <span style="font-size:0.8rem; font-weight:500; color:#cbd5e1; margin-top:4px;">-</span>
               </div>`;
            }

            const dateStr = toISODate(dateObj);
            const entry = s.schedule_entries.find(e => e.schedule_date === dateStr);
            const isActive = entry && !entry.is_off;
            
            const dateNumStr = String(dateObj.getDate()).padStart(2, '0');
            const topStr = `${dayCode} ${dateNumStr}`;

            if (isActive) {
                const shiftTimings = `${fmt12(entry.start_time)} - ${fmt12(entry.end_time)}`;
                
                return `<div style="display:flex; flex-direction:column; background:#e0e7ff; padding:10px 6px; border-radius:6px; flex:1; text-align:center; border:1px solid #c7d2fe;">
                 <span style="font-size:0.75rem; font-weight:700; color:#4338ca; text-transform:uppercase;">${topStr}</span>
                 <span style="font-size:0.72rem; font-weight:600; color:#312e81; margin-top:4px; line-height:1.3;">${shiftTimings}</span>
               </div>`;
            } else {
                return `<div style="display:flex; flex-direction:column; background:#f1f5f9; padding:10px 6px; border-radius:6px; flex:1; text-align:center; border:1px dashed #cbd5e1; opacity:0.6;">
                 <span style="font-size:0.75rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">${topStr}</span>
                 <span style="font-size:0.8rem; font-weight:500; color:#cbd5e1; margin-top:4px;">Off</span>
               </div>`;
            }
        }).join('');

        monthHtmlArray.push(`
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">
                <h4 style="margin:0 0 12px 0; font-size:0.85rem; font-weight:600; color:#475569;">Week ${w + 1}</h4>
                <div style="display:flex; gap:8px;">${miniPills}</div>
            </div>
        `);
    }
    
    document.getElementById('viewMonthContainer').innerHTML = monthHtmlArray.join('');

    switchViewTab('week');
    DOM.viewModal?.classList.add('active');
    if(window.feather) window.feather.replace();
}

// Expose on window for inline onclick handlers
window.viewSchedule = viewSchedule;
