// scripts/dashboard/dashboard-appointments.js
// Handles fetching and rendering dashboard appointments and tab switching logic.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderAppointments(currentBranchId) {
    const upcomingList = document.getElementById('tabUpcomingList');
    const completedList = document.getElementById('tabCompletedList');
    const noshowList = document.getElementById('tabNoshowList');
    if (!upcomingList || !completedList || !currentBranchId) return;

    try {
        const companyId = getCompanyId();
        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        let query = supabase
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

        const upcomingFull = (bookings || []).filter(b => !['completed', 'cancelled', 'no-show'].includes(b.status));
        const completedFull = (bookings || []).filter(b => b.status === 'completed');
        const noshowFull = (bookings || []).filter(b => ['cancelled', 'no-show'].includes(b.status));

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
                                    <p>${b.service_name || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                        <div class="staff-block"><span class="badge">${b.staff_name || 'Unassigned'}</span></div>
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
