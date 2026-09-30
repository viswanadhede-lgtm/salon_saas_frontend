import { supabase } from '../lib/supabase.js';

let todaysBookingsData = [];
let activeTab = 'no-show';

export async function initPage() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateLabel = document.getElementById('noscDateLabel');
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
            
        query = query.in('status', ['no-show', 'cancelled']);

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
                status: (b.status || 'no-show').toLowerCase(),
                amount: '₹' + (b.total_price || 0).toLocaleString('en-IN'),
                payment: (b.payment_status || 'pending').toLowerCase()
            };
        });
        window.todaysBookingsData = todaysBookingsData;
    } catch (err) {
        console.error("Failed to load live bookings:", err);
    }

    const noShows = todaysBookingsData.filter(b => b.status === 'no-show');
    const cancelled = todaysBookingsData.filter(b => b.status === 'cancelled');
    const noShowBadge = document.getElementById('noscNoShowBadge');
    if (noShowBadge) {
        noShowBadge.textContent = noShows.length + ' no-show' + (noShows.length !== 1 ? 's' : '');
    }
    const cancelledBadge = document.getElementById('noscCancelledBadge');
    if (cancelledBadge) {
        cancelledBadge.textContent = cancelled.length + ' cancelled';
    }
    
    const tabNS = document.getElementById('tabNoShowCountBadge');
    if (tabNS) tabNS.textContent = noShows.length;
    const tabC = document.getElementById('tabCancelledCountBadge');
    if (tabC) tabC.textContent = cancelled.length;
    
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

export function switchTab(tab) {
    activeTab = tab;
    const tabNS = document.getElementById('noscTabNoShow');
    if (tabNS) tabNS.classList.toggle('active', tab === 'no-show');
    const tabC = document.getElementById('noscTabCancelled');
    if (tabC) tabC.classList.toggle('active', tab === 'cancelled');
    renderTable();
}

export function renderTable() {
    const tbody = document.getElementById('noscTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtered = todaysBookingsData.filter(b => b.status === activeTab);
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="nosc-empty">No ${activeTab === 'no-show' ? 'no-show' : 'cancelled'} appointments today.</td></tr>`;
        return;
    }
    filtered.forEach((b, idx) => {
        const statusClass = 'tb-status-' + b.status.replace('-', '');
        const statusLabel = b.status === 'no-show' ? 'No-show' : 'Cancelled';

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
            const uid = 'nosc_svc_' + idx;
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

        // Payment
        let payStyle = 'color:#dc2626; opacity:0.75; font-weight:700;';
        let payLabel = 'Not Paid';
        if (b.payment === 'paid') { payStyle = 'color:#059669; font-weight:700;'; payLabel = 'Paid'; }
        else if (b.payment === 'partial') { payStyle = 'color:#9f1239; font-weight:600;'; payLabel = 'Partial'; }

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
            <td style="padding:14px 16px;"><span class="tb-status-pill ${statusClass}">${statusLabel}</span></td>
            <td style="padding:14px 16px; text-align:center;">
                <button onclick="window.openCancelledBookingModal('${b.raw_id}')"
                    style="width:90px;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#ffffff;color:#1e293b;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.04);display:inline-flex;align-items:center;justify-content:center;gap:6px;"
                    onmouseover="this.style.background='#f8fafc';this.style.borderColor='#cbd5e1'" 
                    onmouseout="this.style.background='#ffffff';this.style.borderColor='#e2e8f0'">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    Rebook
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// Preserve required globals for inline event handlers and external script compatibility
window.initPage = initPage;
window.switchTab = switchTab;
window.renderTable = renderTable;
window.todaysBookingsData = todaysBookingsData;

// Self-initialization
function init() {
    if (window.feather) window.feather.replace();
    initPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
