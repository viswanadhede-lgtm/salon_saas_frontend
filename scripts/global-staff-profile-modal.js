import { supabase } from '../lib/supabase.js';

// =============================================================================
// Global Staff Profile Modal (Workforce 360° Intelligence View)
// Follows modern-web-guidance for modal dialogs with light dismiss and Esc key
// =============================================================================

function injectModalShell() {
    if (document.getElementById('staffProfileModalOverlay')) return;

    const modalHtml = `
    <div class="modal-overlay" id="staffProfileModalOverlay" style="z-index: 10100; backdrop-filter: blur(6px); display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); align-items: center; justify-content: center; padding: 20px;">
        <div class="modal-container" id="staffProfileModalContainer" style="width: 94vw; max-width: 1140px; max-height: 90vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; background: #ffffff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; animation: staffModalFadeIn 0.2s ease-out;">
            <!-- Modal Header -->
            <div style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #ffffff;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #3b82f6;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                    <div>
                        <h2 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 0;" id="staffProfileHeaderName">Staff Profile</h2>
                        <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0 0;" id="staffProfileHeaderSub">Workforce Performance & Activity Snapshot</p>
                    </div>
                </div>
                <button type="button" id="btnCloseStaffProfileModal" title="Close" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <!-- Modal Content Body -->
            <div id="staffProfileModalBody" style="flex: 1; overflow-y: auto; background: #f8fafc; padding: 0;">
                <div style="text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 0.95rem;">
                    <div class="spinner" style="width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
                    Loading staff profile...
                </div>
            </div>
        </div>
    </div>
    <style>
        @keyframes staffModalFadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
        }
        .staff-prof-tab-btn {
            padding: 8px 16px;
            font-size: 0.85rem;
            font-weight: 600;
            color: #64748b;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .staff-prof-tab-btn:hover {
            color: #1e293b;
        }
        .staff-prof-tab-btn.active {
            color: #2563eb;
            border-bottom-color: #2563eb;
        }
        .staff-chip {
            display: inline-block;
            padding: 3px 9px;
            border-radius: 20px;
            font-size: 0.74rem;
            font-weight: 500;
            background: #e0e7ff;
            color: #3730a3;
            margin: 2px;
        }
    </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const overlay = document.getElementById('staffProfileModalOverlay');
    const container = document.getElementById('staffProfileModalContainer');
    const btnClose = document.getElementById('btnCloseStaffProfileModal');

    function closeModal() {
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('active');
        }
    }

    if (btnClose) btnClose.addEventListener('click', closeModal);

    // Light dismiss: click outside container closes modal
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    // Esc key dismiss
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
            closeModal();
        }
    });
}

// ── Status Helper ─────────────────────────────────────────────────────────────
function getStatusBadge(status) {
    const s = String(status || 'active').toLowerCase().trim();
    if (s.includes('active')) {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#dcfce7;color:#15803d;"><span style="width:6px;height:6px;border-radius:50%;background:#16a34a;"></span>Active</span>`;
    }
    if (s.includes('leave')) {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#fef3c7;color:#b45309;"><span style="width:6px;height:6px;border-radius:50%;background:#d97706;"></span>On Leave</span>`;
    }
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:#f1f5f9;color:#64748b;"><span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;"></span>Inactive</span>`;
}

// ── Main View Function ────────────────────────────────────────────────────────
window.viewStaffProfile = async function(staffId) {
    injectModalShell();

    const overlay = document.getElementById('staffProfileModalOverlay');
    const body = document.getElementById('staffProfileModalBody');
    const headerName = document.getElementById('staffProfileHeaderName');
    const headerSub = document.getElementById('staffProfileHeaderSub');

    if (!overlay || !body) return;

    overlay.style.display = 'flex';
    overlay.classList.add('active');
    body.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 0.95rem;">
            <div class="spinner" style="width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
            Loading staff details...
        </div>
    `;

    try {
        const companyId = localStorage.getItem('company_id') || null;
        const branchId = localStorage.getItem('active_branch_id') || localStorage.getItem('branch_id') || null;

        if (!companyId) throw new Error('Company context missing. Please log in again.');

        // Attempt RPC invocation first (when RPC is deployed)
        let profileResult = null;
        try {
            const { data, error } = await supabase.rpc('global_staff_profile_modal', {
                p_company_id: companyId,
                p_branch_id: branchId,
                p_staff_id: staffId
            });
            if (!error && data) {
                profileResult = Array.isArray(data) ? data[0] : data;
            }
        } catch (rpcErr) {
            // RPC not deployed yet; proceed to client-side data synthesis fallback
        }

        // Fallback: Synthesize data directly from tables so user can preview immediately!
        if (!profileResult || !profileResult.staff_name) {
            const [staffRes, bookingsRes, schedRes, todaySchedRes] = await Promise.all([
                supabase.schema('app').from('staff').select('*').eq('staff_id', staffId).single(),
                supabase.schema('app').from('bookings').select('*').eq('staff_id', staffId).order('booking_date', { ascending: false }).limit(20),
                supabase.schema('app').from('staff_schedule').select('*').eq('staff_id', staffId).gte('schedule_date', new Date().toISOString().split('T')[0]).order('schedule_date', { ascending: true }).limit(7),
                supabase.schema('app').from('staff_schedule').select('*').eq('staff_id', staffId).eq('schedule_date', new Date().toISOString().split('T')[0]).limit(1)
            ]);

            if (staffRes.error || !staffRes.data) {
                throw new Error(staffRes.error?.message || 'Staff member not found.');
            }

            const s = staffRes.data;
            const bks = bookingsRes.data || [];
            const scheds = schedRes.data || [];
            const todayRow = todaySchedRes.data?.[0] || null;

            const completedBks = bks.filter(b => b.booking_status === 'completed');
            const upcomingBks = bks.filter(b => ['booked', 'confirmed'].includes(b.booking_status) && b.booking_date >= new Date().toISOString().split('T')[0]);
            const totalRev = completedBks.reduce((acc, curr) => acc + Number(curr.final_amount || curr.price || 0), 0);

            profileResult = {
                staff_id: s.staff_id,
                staff_name: s.staff_name,
                phone: s.phone || '—',
                email: s.email || '—',
                role_name: s.role_name || 'Staff',
                services_offered: s.services_offered || 'General Services',
                notes: s.notes || 'No notes provided',
                status: s.status || 'active',
                joined_at: s.joined_at || s.created_at,
                total_completed: completedBks.length,
                upcoming_count: upcomingBks.length,
                total_revenue: totalRev,
                today_is_off: todayRow ? !!todayRow.is_off : false,
                today_start_time: todayRow?.start_time || '09:00:00',
                today_end_time: todayRow?.end_time || '18:00:00',
                recent_bookings: bks.slice(0, 8),
                upcoming_schedule: scheds
            };
        }

        renderProfileModal(profileResult);
    } catch (err) {
        console.error('Error viewing staff profile:', err);
        body.innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: #ef4444;">
                <p style="font-weight: 600; font-size: 1rem; margin-bottom: 8px;">Failed to load staff profile</p>
                <p style="font-size: 0.85rem; color: #64748b;">${err.message || 'An unexpected error occurred.'}</p>
            </div>
        `;
    }
};

function renderProfileModal(data) {
    const body = document.getElementById('staffProfileModalBody');
    const headerName = document.getElementById('staffProfileHeaderName');
    const headerSub = document.getElementById('staffProfileHeaderSub');

    if (headerName) headerName.textContent = data.staff_name || 'Staff Profile';
    if (headerSub) headerSub.textContent = `${data.role_name || 'Staff'} • ${data.status ? data.status.toUpperCase() : 'ACTIVE'}`;

    // Initials avatar
    const name = data.staff_name || 'Staff';
    const initialsMatches = name.match(/\b\w/g) || [];
    const initials = ((initialsMatches[0] || 'S') + (initialsMatches[1] || '')).toUpperCase();
    const avatarColors = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed'];
    const color = avatarColors[Math.abs(name.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % avatarColors.length];

    // Formatted Joined Date
    let joinedFormatted = 'Recently';
    if (data.joined_at) {
        const d = new Date(data.joined_at);
        if (!isNaN(d.getTime())) {
            joinedFormatted = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        }
    }

    // Specialization chips
    const skills = String(data.services_offered || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const skillsHtml = skills.length 
        ? skills.map(sk => `<span class="staff-chip">${sk}</span>`).join('') 
        : '<span style="font-size:0.8rem;color:#94a3b8;">General Services</span>';

    // Today shift calculation
    let shiftBadge = '';
    if (String(data.status).toLowerCase().includes('leave') || data.today_is_off) {
        shiftBadge = `<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#b45309;background:#fef3c7;padding:4px 10px;border-radius:20px;"><span style="width:7px;height:7px;border-radius:50%;background:#d97706;"></span>Off Duty Today</span>`;
    } else {
        const start = (data.today_start_time || '09:00').slice(0, 5);
        const end = (data.today_end_time || '18:00').slice(0, 5);
        shiftBadge = `<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#15803d;background:#dcfce7;padding:4px 10px;border-radius:20px;"><span style="width:7px;height:7px;border-radius:50%;background:#16a34a;"></span>On Duty: ${start} - ${end}</span>`;
    }

    // Recent Bookings HTML
    const bks = data.recent_bookings || [];
    const bkRows = bks.length ? bks.map(b => {
        let bDate = b.booking_date || '—';
        if (b.booking_date) {
            const d = new Date(b.booking_date + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                bDate = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
            }
        }
        const timeStr = b.start_time ? String(b.start_time).slice(0, 5) : '';
        const st = (b.booking_status || 'booked').toLowerCase();
        let badgeColor = '#1e40af';
        let badgeBg = '#dbeafe';
        if (st === 'completed') { badgeColor = '#065f46'; badgeBg = '#d1fae5'; }
        else if (st === 'cancelled') { badgeColor = '#991b1b'; badgeBg = '#fee2e2'; }

        const amount = Number(b.final_amount || b.price || 0);

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;">
                <td style="padding: 10px 12px; color: #1e293b; font-weight: 500;">
                    ${bDate} <span style="font-size:0.75rem; color:#64748b; margin-left:4px;">${timeStr}</span>
                </td>
                <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${b.customer_name || 'Walk-in Customer'}</td>
                <td style="padding: 10px 12px; color: #475569;">${b.service_name || 'Service'}</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #059669;">₹${amount.toLocaleString('en-IN')}</td>
                <td style="padding: 10px 12px;">
                    <span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; color:${badgeColor}; background:${badgeBg}; text-transform:capitalize;">${st}</span>
                </td>
            </tr>
        `;
    }).join('') : `<tr><td colspan="5" style="text-align:center; padding:32px; color:#94a3b8; font-size:0.85rem;">No appointments found for this staff member.</td></tr>`;

    // Schedule Rows HTML
    const scheds = data.upcoming_schedule || [];
    const schedRows = scheds.length ? scheds.map(sc => {
        let scDate = sc.schedule_date || '—';
        let dayName = '';
        if (sc.schedule_date) {
            const d = new Date(sc.schedule_date + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                scDate = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
                dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            }
        }
        const isOff = !!sc.is_off;
        const timing = isOff ? 'Day Off / Leave' : `${String(sc.start_time || '09:00').slice(0,5)} — ${String(sc.end_time || '18:00').slice(0,5)}`;
        const statusBadge = isOff 
            ? `<span style="padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; background:#fef3c7; color:#b45309;">Day Off</span>`
            : `<span style="padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; background:#dcfce7; color:#15803d;">Working</span>`;

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;">
                <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${scDate} <span style="font-weight:400; color:#64748b;">(${dayName})</span></td>
                <td style="padding: 10px 12px; color: #475569;">${timing}</td>
                <td style="padding: 10px 12px;">${statusBadge}</td>
            </tr>
        `;
    }).join('') : `<tr><td colspan="3" style="text-align:center; padding:32px; color:#94a3b8; font-size:0.85rem;">No upcoming shift roster entries found for the next 7 days.</td></tr>`;

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 290px 1fr; min-height: 540px; background: #ffffff;">
            
            <!-- LEFT COLUMN: Identity & Bio Card -->
            <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border-right: 1px solid #e2e8f0; padding: 28px 24px; display: flex; flex-direction: column; gap: 20px;">
                <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: ${color}; color: #ffffff; font-size: 1.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin-bottom: 12px;">
                        ${initials}
                    </div>
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">${name}</h3>
                    <p style="margin: 2px 0 8px 0; font-size: 0.85rem; color: #64748b; font-weight: 500;">${data.role_name || 'Staff'}</p>
                    ${getStatusBadge(data.status)}
                </div>

                <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">
                    <div>
                        <div style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 3px;">Phone</div>
                        <a href="tel:${data.phone}" style="color: #1e293b; font-weight: 500; text-decoration: none;">${data.phone}</a>
                    </div>
                    <div>
                        <div style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 3px;">Email</div>
                        <a href="mailto:${data.email}" style="color: #1e293b; font-weight: 500; text-decoration: none;">${data.email}</a>
                    </div>
                    <div>
                        <div style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 3px;">Joined Since</div>
                        <div style="color: #1e293b; font-weight: 500;">${joinedFormatted}</div>
                    </div>
                </div>

                <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <div style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 8px;">Specialized Skills</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${skillsHtml}
                    </div>
                </div>

                <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <div style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 4px;">Manager Notes</div>
                    <div style="font-size: 0.82rem; color: #475569; background: #ffffff; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
                        ${data.notes || 'No notes added.'}
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: Metrics & Activity Streams -->
            <div style="padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
                
                <!-- 4 Performance Metric Cards -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;">
                    <!-- Card 1: Completed Appointments -->
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">Completed</span>
                            <div style="width: 24px; height: 24px; border-radius: 6px; background: #f0fdf4; display: flex; align-items: center; justify-content: center; color: #16a34a;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                        </div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #0f172a;">${data.total_completed ?? 0}</div>
                        <div style="font-size: 0.72rem; color: #94a3b8;">Lifetime Services</div>
                    </div>

                    <!-- Card 2: Upcoming Appointments -->
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">Upcoming</span>
                            <div style="width: 24px; height: 24px; border-radius: 6px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                        </div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #0f172a;">${data.upcoming_count ?? 0}</div>
                        <div style="font-size: 0.72rem; color: #94a3b8;">Booked / Confirmed</div>
                    </div>

                    <!-- Card 3: Service Revenue Generated -->
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">Service Revenue</span>
                            <div style="width: 24px; height: 24px; border-radius: 6px; background: #fdf4ff; display: flex; align-items: center; justify-content: center; color: #a855f7;">
                                <span style="font-size: 0.8rem; font-weight: 700;">₹</span>
                            </div>
                        </div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #059669;">₹${Number(data.total_revenue ?? 0).toLocaleString('en-IN')}</div>
                        <div style="font-size: 0.72rem; color: #94a3b8;">Completed Value</div>
                    </div>

                    <!-- Card 4: Today's Shift Status -->
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
                        <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">Today's Schedule</span>
                        <div style="margin-top: 4px;">
                            ${shiftBadge}
                        </div>
                        <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">Active Roster Status</div>
                    </div>
                </div>

                <!-- Navigation Tabs -->
                <div style="border-bottom: 1px solid #e2e8f0; display: flex; gap: 12px;">
                    <button type="button" class="staff-prof-tab-btn active" id="tabBtnAppointments" onclick="window.switchStaffProfTab('appointments')">
                        Appointments & Bookings (${bks.length})
                    </button>
                    <button type="button" class="staff-prof-tab-btn" id="tabBtnSchedule" onclick="window.switchStaffProfTab('schedule')">
                        Work Schedule (${scheds.length} Days)
                    </button>
                </div>

                <!-- Tab Content: Appointments -->
                <div id="tabContentAppointments" style="display: block;">
                    <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.75rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">
                                <tr>
                                    <th style="padding: 10px 12px;">Date & Time</th>
                                    <th style="padding: 10px 12px;">Customer</th>
                                    <th style="padding: 10px 12px;">Service</th>
                                    <th style="padding: 10px 12px;">Amount</th>
                                    <th style="padding: 10px 12px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bkRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab Content: Schedule -->
                <div id="tabContentSchedule" style="display: none;">
                    <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.75rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">
                                <tr>
                                    <th style="padding: 10px 12px;">Schedule Date</th>
                                    <th style="padding: 10px 12px;">Shift Hours</th>
                                    <th style="padding: 10px 12px;">Duty Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${schedRows}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    `;

    // Wire Tab Switcher
    window.switchStaffProfTab = function(tabName) {
        const tabApp = document.getElementById('tabContentAppointments');
        const tabSch = document.getElementById('tabContentSchedule');
        const btnApp = document.getElementById('tabBtnAppointments');
        const btnSch = document.getElementById('tabBtnSchedule');

        if (tabName === 'appointments') {
            if (tabApp) tabApp.style.display = 'block';
            if (tabSch) tabSch.style.display = 'none';
            btnApp?.classList.add('active');
            btnSch?.classList.remove('active');
        } else {
            if (tabApp) tabApp.style.display = 'none';
            if (tabSch) tabSch.style.display = 'block';
            btnApp?.classList.remove('active');
            btnSch?.classList.add('active');
        }
    };
}

