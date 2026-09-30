import { supabase } from '../lib/supabase.js';

let todaysBookingsData = [];
let currentActionData = null;

export async function initPage() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateLabel = document.getElementById('caDateLabel');
    if (dateLabel) {
        dateLabel.textContent = now.toLocaleDateString('en-IN', opts);
    }
    
    try {
        const branchId = localStorage.getItem('branch_id');
        if (!branchId) throw new Error("No branch selected.");

        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        let query = supabase
            .from('bookings_for_business_transaction')
            .select('*')
            .eq('branch_id', branchId)
            .eq('booking_date', localISOTime)
            .order('start_time', { ascending: true });
            
        query = query.eq('status', 'completed');

        const { data, error } = await query;
        if (error) throw error;

        todaysBookingsData = (data || []).map((b, i) => {
            const parsedStart = b.start_time ? b.start_time.split(':') : ['09', '00'];
            let hours = parseInt(parsedStart[0]);
            const minutes = parsedStart[1];
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const formattedTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
            const displayId = (b.booking_id || '').slice(0, 8).toUpperCase();

            return {
                id: displayId,
                raw_id: b.booking_id,
                customer: b.customer_name || 'Walk-in Customer',
                customer_id: b.customer_id || '',
                time: formattedTime,
                service: b.service_name || 'N/A',
                staff: b.staff_name || 'Unassigned',
                status: (b.status || 'completed').toLowerCase(),
                amount: '₹' + (b.total_price || 0).toLocaleString('en-IN'),
                payment: (b.payment_status || 'pending').toLowerCase()
            };
        });
        window.todaysBookingsData = todaysBookingsData;
    } catch (err) {
        console.error("Failed to load live bookings:", err);
    }

    const completed = todaysBookingsData.filter(b => b.status === 'completed');
    const countBadge = document.getElementById('caCountBadge');
    if (countBadge) {
        countBadge.textContent = completed.length + ' completed';
    }
    
    renderTable();

    // Highlight particular booking if specified in URL
    setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const highlightId = urlParams.get('highlight');
        if (highlightId) {
            let targetRow = document.getElementById(`row-${highlightId}`);
            if (!targetRow) {
                const rows = document.querySelectorAll('.tb-row');
                for (const row of rows) {
                    if (row.innerHTML.includes(highlightId)) {
                        targetRow = row;
                        break;
                    }
                }
            }

            if (targetRow) {
                targetRow.parentNode.prepend(targetRow);
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetRow.classList.add('highlight-row');
                
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }
        }
    }, 100);
}

export function renderTable() {
    const tbody = document.getElementById('caTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    todaysBookingsData.forEach((b, idx) => {
        if (b.status !== 'completed') return;

        // Service pills
        let serviceHtml = '-';
        const rawServices = (b.service || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rawServices.length === 1) {
            serviceHtml = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;white-space:nowrap;" title="${rawServices[0]}">${rawServices[0]}</span>`;
        } else if (rawServices.length > 1) {
            const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;
            const first = rawServices[0];
            const rest = rawServices.slice(1);
            const extraPills = rest.map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            const uid = 'ca_svc_' + idx;
            serviceHtml = `<div style="display:flex;flex-direction:column;gap:4px;"><div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;"><span style="${chipStyle}">${first}</span><span id="pill_${uid}" style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;" onclick="const x=document.getElementById('extra_${uid}'); const shown=x.style.display!=='none'; x.style.display=shown?'none':'flex'; this.textContent=shown?'+${rest.length}':'– less'">+${rest.length}</span></div><div id="extra_${uid}" style="display:none;flex-wrap:wrap;gap:4px;padding-top:2px;">${extraPills}</div></div>`;
        }

        // Staff rendering
        let staffHtml = '-';
        const rawStaff = (b.staff || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rawStaff.length === 1) {
            staffHtml = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">${rawStaff[0]}</span>`;
        } else if (rawStaff.length > 1) {
            const firstS = rawStaff[0];
            const restS = rawStaff.length - 1;
            const fullListS = rawStaff.join(', ');
            staffHtml = `
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="const e=this.nextElementSibling; e.style.display=e.style.display==='none'?'block':'none'">
                        <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">${firstS}</span>
                        <span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:12px; font-size:0.7rem; font-weight:600; border:1px solid #cbd5e1; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">+${restS}</span>
                    </div>
                    <div style="display:none; font-size:0.75rem; color:#64748b; line-height:1.4; padding-left:2px; padding-top:2px; white-space:normal;">
                        ${fullListS}
                    </div>
                </div>
            `;
        }

        // Payment label/style
        let payStyle = 'color:#b45309; font-weight:600;';
        let payLabel = 'Pending';
        if (b.payment === 'paid') { payStyle = 'color:#059669; font-weight:700;'; payLabel = 'Paid'; }
        else if (b.payment === 'partial') { payStyle = 'color:#9f1239; font-weight:600;'; payLabel = 'Partial'; }

        // Status label
        const statusLabel = b.status === 'completed' ? 'Completed' : b.status.charAt(0).toUpperCase() + b.status.slice(1);
        const statusClass = 'tb-status-' + b.status;

        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.id = `row-${b.raw_id}`;
        tr.innerHTML = `
            <td style="padding:14px 16px; color:#64748b; font-weight:600; font-size:0.78rem; font-family:monospace;">${b.id}</td>
            <td style="padding:14px 16px;"><span class="customer-link" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${b.customer_id}', '${b.customer.replace(/'/g, "\\'")}')"> ${b.customer}</span></td>
            <td style="padding:14px 16px; color:#1e293b; font-weight:600; font-size:0.85rem;">${b.time}</td>
            <td style="padding:14px 16px; color:#475569; font-size:0.85rem;">${serviceHtml}</td>
            <td style="padding:14px 16px; color:#475569; font-size:0.85rem;">${staffHtml}</td>
            <td style="padding:14px 16px;"><span style="display:inline-block;padding:4px 12px;background:#dcfce7;color:#166534;border-radius:9999px;font-size:0.75rem;font-weight:700;">${b.amount}</span></td>
            <td style="padding:14px 16px;"><span style="font-size:0.85rem; ${payStyle}">${payLabel}</span></td>
            <td style="padding:14px 16px;"><span class="tb-status-pill ${statusClass}">${statusLabel}</span></td>`;
        tbody.appendChild(tr);
    });
}

export function showViewModal(idx) {
    const b = todaysBookingsData[idx];
    if (!b) return;
    currentActionData = { action: 'view', idx, booking: b };
    const actionLabel = document.getElementById('actionSummaryActionLabel');
    if (actionLabel) actionLabel.textContent = 'View Booking';
    const titleEl = document.getElementById('actionSummaryTitle');
    if (titleEl) titleEl.textContent = 'Booking Details';
    const iconEl = document.getElementById('actionSummaryIcon');
    if (iconEl) {
        iconEl.style.background = '#eff6ff';
        iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
    const messageEl = document.getElementById('actionSummaryMessage');
    if (messageEl) messageEl.textContent = 'Completed booking details are shown below.';
    const detailsEl = document.getElementById('actionSummaryDetails');
    if (detailsEl) {
        detailsEl.innerHTML = `
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Customer</p><p style="font-size:0.875rem;font-weight:600;color:#1e293b;margin:0;">${b.customer}</p></div>
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Time</p><p style="font-size:0.875rem;font-weight:600;color:#1e293b;margin:0;">${b.time}</p></div>
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Service</p><p style="font-size:0.875rem;font-weight:500;color:#374151;margin:0;">${b.service}</p></div>
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Staff</p><p style="font-size:0.875rem;font-weight:500;color:#374151;margin:0;">${b.staff}</p></div>
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Amount</p><p style="font-size:0.875rem;font-weight:700;color:#1e293b;margin:0;">${b.amount}</p></div>
            <div><p style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 3px;">Payment</p><p style="font-size:0.875rem;font-weight:500;color:#374151;margin:0;text-transform:capitalize;">${b.payment}</p></div>`;
    }
    const confirmBtn = document.getElementById('actionSummaryConfirm');
    if (confirmBtn) {
        confirmBtn.textContent = 'Close';
        confirmBtn.style.background = '#3b82f6';
        confirmBtn.onclick = closeActionSummary;
    }
    const overlay = document.getElementById('actionSummaryOverlay');
    if (overlay) overlay.style.display = 'flex';
}

export function closeActionSummary() {
    const overlay = document.getElementById('actionSummaryOverlay');
    if (overlay) overlay.style.display = 'none';
    currentActionData = null;
}

// Preserve required globals for inline event handlers and external script compatibility
window.initPage = initPage;
window.renderTable = renderTable;
window.showViewModal = showViewModal;
window.closeActionSummary = closeActionSummary;
window.todaysBookingsData = todaysBookingsData;

// Self-initialization
function init() {
    if (window.feather) window.feather.replace();

    const overlay = document.getElementById('actionSummaryOverlay');
    if (overlay && !overlay.dataset.overlayBound) {
        overlay.dataset.overlayBound = '1';
        overlay.addEventListener('click', function(e) {
            if (e.target === this) closeActionSummary();
        });
    }

    initPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
