// scripts/dashboard/dashboard-appointments.js
// Handles fetching and rendering dashboard appointments and tab switching logic.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

// Global toggle helper for expandable service/staff chips
if (typeof window !== 'undefined') {
    window.toggleDashboardExtra = function(btn, extraCount) {
        if (!btn) return;
        const extraDiv = btn.nextElementSibling;
        if (!extraDiv) return;
        const isHidden = extraDiv.style.display === 'none' || extraDiv.style.display === '';
        extraDiv.style.display = isHidden ? 'flex' : 'none';
        btn.textContent = isHidden ? '▲ less' : `+${extraCount}`;
    };
    if (!window.toggleSvcExtra) {
        window.toggleSvcExtra = window.toggleDashboardExtra;
    }
}

export async function fetchAndRenderAppointments(currentBranchId) {
    const upcomingList = document.getElementById('tabUpcomingList');
    const completedList = document.getElementById('tabCompletedList');
    const noshowList = document.getElementById('tabNoshowList');
    if (!upcomingList || !completedList || !currentBranchId) return;

    try {
        const companyId = getCompanyId();
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        let query = supabase.schema('app')
            .from('bookings_for_business_transaction')
            .select('*')
            .eq('branch_id', currentBranchId)
            .eq('booking_date', today)
            .order('start_time', { ascending: true });

        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data: bookings, error } = await query;

        if (error) throw error;

        const normalized = (bookings || []).map(b => {
            const rawSt = (b.booking_status || b.status || 'booked').toLowerCase().trim();
            const normSt = (rawSt === 'noshow' || rawSt === 'no_show') ? 'no-show' : rawSt;
            return {
                ...b,
                status: normSt
            };
        });

        const upcomingFull = normalized.filter(b => !['completed', 'cancelled', 'no-show'].includes(b.status));
        const completedFull = normalized.filter(b => b.status === 'completed');
        const noshowFull = normalized.filter(b => ['cancelled', 'no-show'].includes(b.status));

        const uBadge = document.getElementById('badgeUpcoming');
        const cBadge = document.getElementById('badgeCompleted');
        const nBadge = document.getElementById('badgeNoshow');
        if (uBadge) uBadge.innerText = upcomingFull.length;
        if (cBadge) cBadge.innerText = completedFull.length;
        if (nBadge) nBadge.innerText = noshowFull.length;

        const upcomingData = upcomingFull.slice(0, 3);
        const completedData = completedFull.slice(0, 3);
        const noshowData = noshowFull.slice(0, 3);

        const renderList = (container, list, emptyMsg) => {
            if (list.length === 0) {
                container.innerHTML = `<div class="centered-placeholder">${emptyMsg}</div>`;
                return;
            }

            container.innerHTML = list.map(b => {
                // Time formatting with null safety
                const timeParts = (b.start_time || '00:00').split(':');
                const h = parseInt(timeParts[0] || '0', 10);
                const m = timeParts[1] || '00';
                const ampm = h >= 12 ? 'PM' : 'AM';
                const formattedTime = `${h % 12 || 12}:${m} ${ampm}`;

                // Duration calculation with null safety
                let durationStr = '—';
                if (b.start_time && b.end_time) {
                    const startArr = b.start_time.split(':');
                    const endArr = b.end_time.split(':');
                    const diff = (parseInt(endArr[0], 10) * 60 + parseInt(endArr[1] || '0', 10)) - (parseInt(startArr[0], 10) * 60 + parseInt(startArr[1] || '0', 10));
                    if (!isNaN(diff) && diff > 0) {
                        durationStr = diff >= 60 ? `${Math.floor(diff/60)}h${diff%60 > 0 ? ' '+(diff%60)+'m' : ''}` : `${diff}m`;
                    }
                }

                const custName = b.customer_name || 'Walk-in Customer';
                const custId = b.customer_id || '';
                const escapedCustName = custName.replace(/'/g, "\\'");
                const statusClass = b.status ? b.status.toLowerCase() : 'booked';

                // Multi-service formatting: first chip + expandable +N
                const serviceNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name || b.service])
                    .filter(Boolean)
                    .flatMap(s => typeof s === 'string' ? s.split(',').map(item => item.trim()) : [String(s).trim()])
                    .filter(Boolean);

                let serviceHtml = '<span style="font-size:0.85rem; color:var(--text-muted);">N/A</span>';
                if (serviceNames.length === 1) {
                    serviceHtml = `<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:500;">${serviceNames[0]}</span>`;
                } else if (serviceNames.length > 1) {
                    const svcExtraCount = serviceNames.length - 1;
                    const extraSvcChips = serviceNames.slice(1).map(s => `<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:500;">${s}</span>`).join('');
                    serviceHtml = `
                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
                            <span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:500;">${serviceNames[0]}</span>
                            <span onclick="event.stopPropagation(); window.toggleDashboardExtra(this, ${svcExtraCount})"
                                style="display:inline-block; padding:2px 7px; border-radius:20px; font-size:0.7rem; font-weight:600; background:#e0e7ff; color:#4f46e5; cursor:pointer; user-select:none;">+${svcExtraCount}</span>
                            <div style="display:none; flex-wrap:wrap; gap:4px; width:100%; margin-top:4px;">
                                ${extraSvcChips}
                            </div>
                        </div>
                    `;
                }

                // Multi-staff formatting: first badge + expandable +N
                const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name || b.staff])
                    .filter(Boolean)
                    .flatMap(s => typeof s === 'string' ? s.split(',').map(item => item.trim()) : [String(s).trim()])
                    .filter(Boolean);

                let staffHtml = '<span class="badge">Unassigned</span>';
                if (staffNames.length === 1) {
                    staffHtml = `<span class="badge">${staffNames[0]}</span>`;
                } else if (staffNames.length > 1) {
                    const staffExtraCount = staffNames.length - 1;
                    const extraStaffChips = staffNames.slice(1).map(s => `<span class="badge">${s}</span>`).join('');
                    staffHtml = `
                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
                            <span class="badge">${staffNames[0]}</span>
                            <span onclick="event.stopPropagation(); window.toggleDashboardExtra(this, ${staffExtraCount})"
                                style="display:inline-block; padding:2px 7px; border-radius:20px; font-size:0.7rem; font-weight:600; background:#e0e7ff; color:#4f46e5; cursor:pointer; user-select:none;">+${staffExtraCount}</span>
                            <div style="display:none; flex-wrap:wrap; gap:4px; width:100%; margin-top:4px;">
                                ${extraStaffChips}
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="appointment-item" style="cursor: pointer;" ondblclick="navigateToBooking('${b.status || ''}', '${b.booking_id || ''}')">
                        <div class="time-block">
                            <span class="time">${formattedTime}</span>
                            <span class="duration">${durationStr}</span>
                        </div>
                        <div class="details-block">
                            <div class="client-info">
                                <div class="avatar small">
                                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(custName)}&background=random" alt="${custName}">
                                </div>
                                <div class="name-service">
                                    <h4><span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${custId}', '${escapedCustName}')">${custName}</span></h4>
                                    <div style="margin-top:2px;">${serviceHtml}</div>
                                </div>
                            </div>
                        </div>
                        <div class="staff-block" style="min-width:110px; width:auto;">${staffHtml}</div>
                        <div class="status-block">
                            <span class="status-pill ${statusClass}">${(b.status || 'booked').charAt(0).toUpperCase() + (b.status || 'booked').slice(1)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        };

        renderList(upcomingList, upcomingData, "No upcoming appointments for today.");
        renderList(completedList, completedData, "No completed bookings yet today.");
        if (noshowList) renderList(noshowList, noshowData, "No no-shows or cancellations recorded today.");

        if (window.feather) feather.replace();

    } catch (err) {
        console.error("Error fetching appointments:", err);
        if (upcomingList) upcomingList.innerHTML = '<div class="centered-placeholder" style="color:#ef4444;">Error loading bookings.</div>';
        if (completedList) completedList.innerHTML = '<div class="centered-placeholder" style="color:#ef4444;">Error loading bookings.</div>';
        if (noshowList) noshowList.innerHTML = '<div class="centered-placeholder" style="color:#ef4444;">Error loading bookings.</div>';
    }
}

export function initAppointmentTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                // Update buttons
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                
                // Update panes
                tabPanes.forEach(pane => {
                    const isTarget = pane.id === `tab${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
                    pane.classList.toggle('active', isTarget);
                });
                
                // Update View All Link dynamically
                const viewAllBtn = document.getElementById('viewAllAppointmentsBtn');
                if (viewAllBtn) {
                    if (targetTab === 'upcoming') viewAllBtn.href = 'upcoming-appointments.html';
                    else if (targetTab === 'completed') viewAllBtn.href = 'completed-appointments.html';
                    else if (targetTab === 'noshow') viewAllBtn.href = 'no-shows-cancellations.html';
                }
            });
        });
    }
}
