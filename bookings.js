import { supabase } from './lib/supabase.js';
import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

// ─── In-Memory Store ─────────────────────────────────────────────────────────
let liveBookingsData = [];

// ─── Edit Modal State ─────────────────────────────────────────────────────────
let editLiveServices      = [];
let editLivePackages      = [];
let editLiveStaff         = [];
let editRowCounter        = 0;
let editActiveBooking     = null;   // the grouped booking record from liveBookingsData
let originalServiceRowIds = new Set(); // tracks DB row ids fetched when modal opened

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// ─── Status Badge HTML ────────────────────────────────────────────────────────
function statusBadge(status) {
    const map = {
        booked:    { color: '#1e40af', bg: '#dbeafe', label: 'Booked' },
        confirmed: { color: '#1e40af', bg: '#dbeafe', label: 'Confirmed' },
        completed: { color: '#065f46', bg: '#d1fae5', label: 'Completed' },
        cancelled: { color: '#991b1b', bg: '#fee2e2', label: 'Cancelled' },
        'no-show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
        'no_show': { color: '#92400e', bg: '#fef3c7', label: 'No-Show' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Payment Badge HTML ───────────────────────────────────────────────────────
function paymentBadge(status) {
    const map = {
        paid:     { color: '#065f46', bg: '#d1fae5', label: 'Paid' },
        unpaid:   { color: '#991b1b', bg: '#fee2e2', label: 'Unpaid' },
        pending:  { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
        partial:  { color: '#86198f', bg: '#f5d0fe', label: 'Partial' },
        refunded: { color: '#b45309', bg: '#fef3c7', label: 'Refunded' },
    };
    const s = (status || '').toLowerCase().trim();
    const cfg = map[s] || { color: '#475569', bg: '#f1f5f9', label: status || '—' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${cfg.color};background:${cfg.bg};">${cfg.label}</span>`;
}

// ─── Row Renderer ─────────────────────────────────────────────────────────────
// Toggle extra services in the bookings table
window.toggleSvcExtra = function(extraId, toggleId, extraCount) {
    var el  = document.getElementById(extraId);
    var tog = document.getElementById(toggleId);
    if (!el || !tog) return;
    var isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display  = isHidden ? 'flex' : 'none';
    tog.textContent   = isHidden ? '▲ less' : '+' + extraCount;
};

function buildRow(b, includeDate = false) {
    const bookingId    = b.booking_id || b.id || '';
    const customerName = b.customer_name || '—';
    const phone        = String(b.customer_phone || '');
    const bookingType  = b.booking_type || '—';
    const dateOnly     = b.booking_date || '';
    const timeOnly     = b.start_time   || '';
    const amount       = b.price != null ? `₹${Number(b.price).toLocaleString('en-IN')}` : '—';
    const status       = b.status || '';
    const payment      = b.payment_status || '';

    // Multi-service support: flatMap splits each element by comma, handles both
    // ["Hair Trimming, Nail Trimming"] and ["Hair Trimming", "Nail Trimming"]
    const serviceNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
        .filter(Boolean)
        .flatMap(s => s.split(',').map(item => item.trim()))
        .filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
        .filter(Boolean)
        .flatMap(s => s.split(',').map(item => item.trim()))
        .filter(Boolean);

    const isCancellable = !['cancelled', 'completed', 'no-show', 'no_show'].includes(status.toLowerCase());
    const isEditable    = !['cancelled', 'completed'].includes(status.toLowerCase());

    let dateDisplay = '—';
    let timeDisplay = '—';
    if (dateOnly) {
        try {
            const d = new Date(`${dateOnly}T00:00`);
            dateDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { dateDisplay = dateOnly; }
    }
    if (timeOnly) {
        try {
            const [hh, mm] = timeOnly.split(':').map(Number);
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
            timeDisplay = `${String(displayH).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
        } catch { timeDisplay = timeOnly; }
    }

    // Render service names: show first chip + collapsible +N toggle
    const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;
    let serviceCell = '—';
    if (serviceNames.length) {
        const firstChip = `<span style="${chipStyle}">${serviceNames[0]}</span>`;
        if (serviceNames.length === 1) {
            serviceCell = firstChip;
        } else {
            const extraCount = serviceNames.length - 1;
            const extraId = `svc-extra-${bookingId}`;
            const toggleId = `svc-toggle-${bookingId}`;
            const extraChips = serviceNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            serviceCell = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                    ${firstChip}
                    <span id="${toggleId}"
                        onclick="window.toggleSvcExtra('${extraId}', '${toggleId}', ${extraCount})"
                        style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                    <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                        ${extraChips}
                    </div>
                </div>`;
        } // end else
    } // end if serviceNames.length

    // Render staff names: show first chip + collapsible +N toggle
    let staffCell = '—';
    if (staffNames.length) {
        const firstChip = `<span style="${chipStyle}">${staffNames[0]}</span>`;
        if (staffNames.length === 1) {
            staffCell = firstChip;
        } else {
            const extraCount = staffNames.length - 1;
            const extraId = `staff-extra-${bookingId}`;
            const toggleId = `staff-toggle-${bookingId}`;
            const extraChips = staffNames.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            staffCell = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                    ${firstChip}
                    <span id="${toggleId}"
                        onclick="window.toggleSvcExtra('${extraId}', '${toggleId}', ${extraCount})"
                        style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                    <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                        ${extraChips}
                    </div>
                </div>`;
        }
    }

    const cellStyle = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    return `
    <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;">
        <td style="padding:10px 8px 10px 14px;font-size:0.8rem;color:#64748b;font-family:monospace;${cellStyle}">${(bookingId||'').slice(0, 8).toUpperCase()}</td>
        <td style="padding:10px 8px;${cellStyle}">
            <span class="customer-link" style="font-weight:600;font-size:0.87rem;${cellStyle}" onclick="window.viewCustomerProfile('${b.customer_id || ''}', '${customerName}')">${customerName}</span>
        </td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${dateDisplay}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${timeDisplay}</td>
        <td style="padding:10px 8px; max-width:200px;">${serviceCell}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${staffCell}</td>
        <td style="padding:10px 8px;font-size:0.85rem;color:#334155;${cellStyle}">${bookingType}</td>
        <td style="padding:10px 8px;">${statusBadge(status)}</td>
        <td style="padding:10px 8px;font-size:0.85rem;font-weight:600;color:#059669;${cellStyle}">${amount}</td>
        <td style="padding:10px 8px;">${paymentBadge(payment)}</td>
        <td style="padding:10px 8px;">
            <div style="display:flex;gap:6px;flex-wrap:nowrap;">
                ${['booked', 'confirmed'].includes(status.toLowerCase()) ? `
                <button onclick="window.openEditBookingModal('${bookingId}')"
                    data-sub-feature="update_booking"
                    style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
                    onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
                    Edit
                </button>
                <div style="position:relative; display:inline-block;" data-sub-feature="update_booking">
                    <select onchange="window.updateBookingStatus('${bookingId}', this.value); this.value='';" 
                        style="appearance:none; padding:4px 24px 4px 10px; border-radius:6px; border:1px solid #e2e8f0; background:#fff url(&quot;data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e&quot;) no-repeat right 6px center / 12px; color:#475569; font-size:0.75rem; font-weight:600; cursor:pointer; min-width:130px; outline:none; transition:all 0.2s;"
                        onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
                        <option value="" disabled selected>Update Status</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no-show">No-Show</option>
                    </select>
                </div>` : ''}
                ${status.toLowerCase() === 'completed' ? `
                <button onclick="window.triggerInvoice('${bookingId}')"
                    style="padding:4px 10px;border-radius:6px;border:1px solid #e0e7ff;background:#eef2ff;color:#4f46e5;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
                    onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                    Invoice
                </button>` : ''}
                ${['cancelled', 'no-show', 'no_show'].includes(status.toLowerCase()) ? `
                <button onclick="window.triggerRebook('${bookingId}')"
                    data-sub-feature="create_booking"
                    style="padding:4px 10px;border-radius:6px;border:1px solid #ffedd5;background:#fff7ed;color:#ea580c;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;margin-right:6px;"
                    onmouseover="this.style.background='#ffedd5'" onmouseout="this.style.background='#fff7ed'">
                    Re-Book
                </button>` : ''}
                
                ${['cancelled', 'no-show', 'no_show'].includes(status.toLowerCase()) && ['paid', 'partial'].includes(payment.toLowerCase()) ? `
                <button onclick="window.triggerRefund('${bookingId}')"
                    data-sub-feature="update_booking" 
                    style="padding:4px 10px;border-radius:6px;border:1px solid #fecdd3;background:#fff1f2;color:#dc2626;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;"
                    onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
                    Refund
                </button>
                ` : ''}
            </div>
        </td>
    </tr>`;
}

function emptyRow(colspan, msg) {
    return `<tr><td colspan="10" style="padding:48px 24px;text-align:center;color:#94a3b8;font-size:0.9rem;">${msg}</td></tr>`;
}

// ─── Render Tables ────────────────────────────────────────────────────────────
let currentSearchQuery = '';
let currentSortCol = null;
let currentSortDesc = false;

window.toggleSort = function(col) {
    if (currentSortCol === col) {
        currentSortDesc = !currentSortDesc;
    } else {
        currentSortCol = col;
        currentSortDesc = false;
    }
    
    // Update visual arrows
    document.querySelectorAll('.sort-icon').forEach(icon => {
        if (icon.dataset.col === col) {
            icon.textContent = currentSortDesc ? '↓' : '↑';
            icon.style.opacity = '1';
            icon.style.color = '#4f46e5';
        } else {
            icon.textContent = '↕';
            icon.style.opacity = '0.3';
            icon.style.color = 'inherit';
        }
    });

    renderBookings(getFilteredBookings());
};

function getFilteredBookings() {
    let results = liveBookingsData || [];

    // Apply Search
    if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        results = results.filter(b => {
            const name = String(b.customer_name || '').toLowerCase();
            const phone = String(b.customer_phone || '').toLowerCase();
            return name.includes(q) || phone.includes(q);
        });
    }

    // Apply Status Filter
    const statusAllChecked = document.querySelector('input[name="filterStatus"][value="all"]')?.checked;
    const activeStatuses = Array.from(document.querySelectorAll('input[name="filterStatus"]:not([value="all"]):checked')).map(c => c.value);
    
    // Apply Staff Filter
    const staffAllChecked = document.querySelector('input[name="filterStaff"][value="all"]')?.checked;
    const activeStaff = Array.from(document.querySelectorAll('input[name="filterStaff"]:not([value="all"]):checked')).map(c => c.value);
    
    // Apply Date Filter
    const dateFilter = document.querySelector('input[name="filterDateRange"]:checked')?.value || 'all';

    const now = new Date();
    let cutoff = null;
    if (dateFilter === '7days') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (dateFilter === '30days') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let filtered = results.filter(b => {
        // Status Check — skip if "All" is checked
        if (!statusAllChecked && activeStatuses.length && !activeStatuses.includes(String(b.status).toLowerCase())) {
            return false;
        }

        // Staff Check
        if (!staffAllChecked && activeStaff.length > 0) {
            const rowStaffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
                .filter(Boolean)
                .flatMap(s => String(s).split(',').map(item => item.trim()))
                .filter(Boolean);
            
            const matchedStaff = rowStaffNames.some(name => activeStaff.includes(name));
            if (!matchedStaff) return false;
        }

        // Date Check
        if (cutoff && b.booking_date) {
            const bDate = new Date(b.booking_date + 'T00:00');
            if (bDate < cutoff) return false;
        }

        return true;
    });

    if (currentSortCol) {
        filtered.sort((a, b) => {
            let valA = String(a[currentSortCol] || '').toLowerCase();
            let valB = String(b[currentSortCol] || '').toLowerCase();
            if (valA < valB) return currentSortDesc ? 1 : -1;
            if (valA > valB) return currentSortDesc ? -1 : 1;
            return 0;
        });
    }

    return filtered;
}

function populateStaffFilter() {
    const list = document.getElementById('filterStaffList');
    if (!list) return;

    const wasAllChecked = list.querySelector('input[value="all"]')?.checked ?? true;
    const selectedStaff = Array.from(list.querySelectorAll('input[name="filterStaff"]:not([value="all"]):checked')).map(c => c.value);

    const allStaffRaw = (liveBookingsData || []).flatMap(b => {
        return (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()));
    });
    const uniqueStaff = [...new Set(allStaffRaw)].filter(s => s && s.toLowerCase() !== 'undefined');

    let html = '<label class="filter-option" style="display: flex; align-items: center; gap: 6px;">'
        + '<input type="checkbox" name="filterStaff" value="all"' + (wasAllChecked ? ' checked' : '') + '> All Staff'
        + '</label>';

    uniqueStaff.sort().forEach(staff => {
        const checked = selectedStaff.includes(staff) ? ' checked' : '';
        html += '<label class="filter-option" style="display: flex; align-items: center; gap: 6px;">'
            + '<input type="checkbox" name="filterStaff" value="' + staff + '"' + checked + '> ' + staff
            + '</label>';
    });

    list.innerHTML = html;

    // Restore any saved staff filter state (set by restoreFilterState on load)
    if (window._applyPendingStaffFilter) window._applyPendingStaffFilter();

    list.querySelectorAll('input[name="filterStaff"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'all' && e.target.checked) {
                list.querySelectorAll('input[name="filterStaff"]:not([value="all"])').forEach(c => c.checked = false);
            } else if (val !== 'all' && e.target.checked) {
                const allCb = list.querySelector('input[value="all"]');
                if (allCb) allCb.checked = false;
            }
        });
    });
}

function renderBookings(data) {
    const today    = data.filter(b => (b.booking_date || '').slice(0, 10) === todayISO());
    const allBooks = data;

    const bodyToday = document.getElementById('tbTableBodyToday');
    const bodyAll   = document.getElementById('tbTableBodyAll');

    if (bodyToday) {
        bodyToday.innerHTML = today.length
            ? today.map(b => buildRow(b, false)).join('')
            : emptyRow(8, 'No bookings for today.');
    }
    if (bodyAll) {
        bodyAll.innerHTML = allBooks.length
            ? allBooks.map(b => buildRow(b, true)).join('')
            : emptyRow(8, 'No bookings found.');
    }
}

// ─── Inject Modals ───────────────────────────────────────────────────────────
function setupModals() {
    document.querySelectorAll('#editBookingModal').forEach(m => m.remove());

    if (!document.getElementById('editBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="editBookingModal">
            <div class="modal-container" style="width:984px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>Edit Booking</h2>
                        <p class="subtitle">Update booking details.</p>
                    </div>
                    <button class="modal-close" id="btnCloseEditBookingModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;overflow-y:auto;max-height:70vh;">
                    <form id="editBookingForm">
                        <input type="hidden" id="editBookingId">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin-bottom:16px;">
                            <div class="form-group" style="margin:0;">
                                <label class="form-label" for="editBkDate">Date <span class="text-rose">*</span></label>
                                <input type="date" id="editBkDate" class="form-input" required>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label" for="editBkTime">Time <span class="text-rose">*</span></label>
                                <input type="time" id="editBkTime" class="form-input" required>
                            </div>
                        </div>

                        <div id="editServiceRowsContainer" style="display:flex;flex-direction:column;gap:16px;margin-bottom:16px;"></div>
                        
                        <div style="text-align:right; margin-bottom:16px;">
                            <button type="button" id="btnEditAddService" style="font-size:0.8rem;padding:6px 16px;border-radius:6px;border:1.5px solid var(--accent,#d946ef);background:var(--accent,#d946ef);color:#fff;font-weight:600;cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 
                                Add Another Service
                            </button>
                        </div>

                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="editBkNotes">Notes <span style="font-weight:400;color:#94a3b8;">(Optional)</span></label>
                            <textarea id="editBkNotes" class="form-input form-textarea" style="min-height:70px;"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelEditBooking">Cancel</button>
                    <button type="submit" class="btn btn-primary" form="editBookingForm">Update Booking</button>
                </div>
            </div>
        </div>`);
    }

    if (!document.getElementById('updateStatusConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="updateStatusConfirmOverlay" style="z-index:9999;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:400px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);">
                <div style="width:64px;height:64px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;" id="updateStatusIconBg">
                    <i data-feather="alert-circle" style="color:#4f46e5;width:32px;height:32px;" id="updateStatusIcon"></i>
                </div>
                <h2 style="font-size:1.5rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Update Status?</h2>
                <p style="color:#64748b;font-size:0.95rem;margin-bottom:24px;line-height:1.5;" id="updateStatusConfirmText">Are you sure you want to change this booking's status?</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="btnKeepStatus" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-weight:600;cursor:pointer;">Cancel</button>
                    <button id="btnConfirmUpdateStatus" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer;">Yes, Update</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay custom-logout-overlay" id="fullScreenUpdateStatusLoader" style="z-index:10000;backdrop-filter:blur(8px);">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
                <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin 1s ease-in-out infinite;margin-bottom:16px;"></div>
                <h2 style="color:#fff;font-size:1.5rem;font-weight:600;">Updating status...</h2>
            </div>
        </div>`);
    }

    if (!document.getElementById('refundBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="refundBookingModal" style="z-index:9999;">
            <div class="modal-container" style="width:400px;max-width:95vw;">
                <div class="modal-header">
                    <div class="header-titles">
                        <h2 style="color:#e11d48;">Process Refund</h2>
                        <p class="subtitle" id="refundModalSubtitle">Loading booking details...</p>
                    </div>
                    <button class="modal-close" id="btnCloseRefundModal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:12px; padding:16px; margin-bottom:20px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; color:#9f1239; font-weight:600; text-transform:uppercase; letter-spacing:0.02em;">Refundable Amount</span>
                            <span style="font-size:1.25rem; color:#e11d48; font-weight:700;" id="refundAmountDisplay">₹0</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Payment Method Used</label>
                        <input type="text" id="refundMethodDisplay" class="form-input" readonly style="background:#f8fafc; cursor:not-allowed;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Refund Note</label>
                        <textarea id="refundNote" class="form-input" placeholder="Optional notes about the refund..." style="min-height:80px;"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelRefund">Cancel</button>
                    <button type="button" class="btn btn-primary" id="btnConfirmRefund" style="background:#e11d48; border-color:#e11d48;">Issue Refund</button>
                </div>
            </div>
        </div>`);
        wireRefundModal();
    }

    if (!document.getElementById('customerProfileBookingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="customerProfileBookingModal" style="z-index:9999;">
            <div class="modal-container" style="width:90vw;max-width:1100px;">
                <div class="modal-header" style="border-bottom:1px solid #f1f5f9;">
                    <div class="header-titles">
                        <h2>Customer Profile</h2>
                        <p class="subtitle" id="profModalSubtitle">Loading details...</p>
                    </div>
                    <button class="modal-close" id="btnCloseProfModal" onclick="document.getElementById('customerProfileBookingModal').classList.remove('active')"><i data-feather="x"></i></button>
                </div>
                <div class="modal-body" style="padding:0; overflow:hidden;" id="profModalBody">
                    <div style="text-align:center;padding:48px;color:#94a3b8;font-size:0.9rem;">⏳ Loading customer information...</div>
                </div>
            </div>
        </div>`);
    }

    if (window.feather) feather.replace();
}

// ─── Edit Modal: Load Services + Staff into module-level arrays ───────────────
async function loadEditDropdownData() {
    const company_id = getCompanyId();
    const branch_id  = getBranchId();
    const [svcRes, staffRes, pkgRes] = await Promise.all([
        supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
        supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
        supabase.from('packages').select('*').eq('company_id', company_id).eq('branch_id', branch_id).eq('is_active', true)
    ]);
    editLiveServices = (svcRes.data || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
    editLivePackages = pkgRes.data || [];
    editLiveStaff    = (staffRes.data || []).filter(s => s.status !== 'deleted');
}

// ─── Edit Modal: Build a single service + staff + price row ───────────────────
function buildEditServiceRow(rowId, isFirst, prefillSvcId = '', prefillStaffId = '', prefillPrice = '', dbId = null) {
    const svcOptions = editLiveServices.map(s =>
        `<option value="${s.service_id}" data-type="service" data-price="${s.price || 0}" ${
            prefillSvcId === s.service_id ? 'selected' : ''}>${s.service_name}</option>`
    ).join('');

    const pkgOptions = editLivePackages.map(p =>
        `<option value="${p.package_id}" data-type="package" data-price="${p.final_price || 0}" ${
            prefillSvcId === p.package_id ? 'selected' : ''}>${p.package_name}</option>`
    ).join('');

    const combinedOptions = `
        <optgroup label="Services" style="color: #1d4ed8; font-weight: 600;">
            ${svcOptions}
        </optgroup>
        ${pkgOptions ? `
        <optgroup label="Packages" style="color: #1d4ed8; font-weight: 600;">
            ${pkgOptions}
        </optgroup>` : ''}
    `;

    const staffOptions = editLiveStaff.map(m =>
        `<option value="${m.staff_id}" ${
            prefillStaffId === m.staff_id ? 'selected' : ''}>${m.staff_name || m.name}</option>`
    ).join('');

    const div = document.createElement('div');
    div.className    = 'edit-service-row';
    div.dataset.rowId = rowId;
    if (dbId) div.dataset.dbId = dbId; // Supabase row PK — used for targeted UPDATE/DELETE

    const colors = ['#f8fafc', '#fdf4ff', '#f0fdf4', '#fffbeb', '#fef2f2', '#f0f9ff'];
    const cardBg = colors[rowId % colors.length];

    div.innerHTML = `
        <div style="padding:16px;background:${cardBg};border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.05);position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span class="edit-row-badge" style="font-size:0.7rem;font-weight:700;color:#4f46e5;background:#e0e7ff;border:1px solid #c7d2fe;border-radius:6px;padding:2px 9px;letter-spacing:0.03em;">#${rowId + 1}</span>
                ${!isFirst
                    ? `<button type="button" class="btn-edit-remove-row" style="font-size:0.75rem;padding:4px 8px;border-radius:6px;border:1px solid #fca5a5;background:#fff5f5;color:#ef4444;font-weight:600;cursor:pointer;">✕ Remove</button>`
                    : '<span></span>'
                }
            </div>
            <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:16px;margin-bottom:0;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Service <span class="text-rose">*</span></label>
                    <select class="form-select edit-svc-select" required>
                        <option value="" disabled ${!prefillSvcId ? 'selected' : ''}>Select a service or package</option>
                        ${combinedOptions}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Staff <span class="text-rose">*</span></label>
                    <select class="form-select edit-staff-select" required>
                        <option value="" disabled ${!prefillStaffId ? 'selected' : ''}>Select staff</option>
                        ${staffOptions}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Price <span style="font-weight:400;color:#94a3b8;">(₹)</span></label>
                    <input type="number" class="form-input edit-svc-price" placeholder="e.g. 500" min="0" step="0.01" value="${prefillPrice !== '' && prefillPrice != null ? prefillPrice : ''}" required>
                </div>
            </div>
        </div>
    `;

    // Auto-fill price when service changes
    const svcSel     = div.querySelector('.edit-svc-select');
    const priceInput = div.querySelector('.edit-svc-price');
    svcSel.addEventListener('change', () => {
        const opt = svcSel.options[svcSel.selectedIndex];
        if (opt?.value) {
            const p = parseFloat(opt.dataset.price || 0);
            if (p && !priceInput.value) priceInput.value = p;
        }
        syncEditServiceDropdowns();
    });

    // Remove button (non-first rows only) — re-labels all badges after removal
    if (!isFirst) {
        div.querySelector('.btn-edit-remove-row').addEventListener('click', () => {
            div.remove();
            document.querySelectorAll('#editServiceRowsContainer .edit-service-row').forEach((row, i) => {
                row.dataset.rowId = i;
                const badge = row.querySelector('.edit-row-badge');
                if (badge) badge.textContent = `#${i + 1}`;
            });
            syncEditServiceDropdowns();
        });
    }

    return div;
}

// ─── Edit Modal: Prevent duplicate service selection across cards ───────────────
function syncEditServiceDropdowns() {
    const container = document.getElementById('editServiceRowsContainer');
    if (!container) return;
    const allSelects = Array.from(container.querySelectorAll('.edit-svc-select'));
    const selectedValues = allSelects.map(sel => sel.value).filter(Boolean);
    allSelects.forEach(sel => {
        const myValue = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return; // skip placeholder
            if (opt.value === myValue) {
                opt.disabled = false;
                opt.hidden   = false;
            } else if (selectedValues.includes(opt.value)) {
                opt.disabled = true;
                opt.hidden   = true;
            } else {
                opt.disabled = false;
                opt.hidden   = false;
            }
        });
    });
}

// ─── Refund Logic ────────────────────────────────────────────────────────────
let activeRefundBookingId = null;
let refundableAmount = 0;

window.openRefundModal = async function(bookingId) {
    activeRefundBookingId = bookingId;
    const b = (window.liveBookingsData || []).find(x => (x.booking_id || x.id) == bookingId);
    if (!b) return;

    const modal = document.getElementById('refundBookingModal');
    const subtitle = document.getElementById('refundModalSubtitle');
    const amountDisp = document.getElementById('refundAmountDisplay');
    const methodDisp = document.getElementById('refundMethodDisplay');
    const noteField = document.getElementById('refundNote');

    subtitle.textContent = `${b.customer_name || 'Customer'} • ${b.service_name || 'Service'}`;
    amountDisp.textContent = 'Calculating...';
    methodDisp.value = 'Loading...';
    noteField.value = '';

    modal.classList.add('active');

    try {
        // Fetch transactions for this booking
        const { data, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');

        if (error) throw error;

        // Sum up only actual payments and subtract refunds
        refundableAmount = (data || []).reduce((sum, tx) => {
            const val = Number(tx.amount || 0);
            const status = (tx.status || '').toLowerCase().trim();
            
            if (status === 'paid') return sum + val;
            if (status === 'refunded') return sum - val;
            return sum; // Ignore 'pending' or other statuses
        }, 0);
        
        if (refundableAmount < 0) refundableAmount = 0; // Safeguard

        amountDisp.textContent = `₹${refundableAmount.toLocaleString('en-IN')}`;
        
        // Use the last payment method as a hint
        const lastMethod = data && data.length > 0 ? data[data.length - 1].payment_method : 'Multiple';
        methodDisp.value = lastMethod || 'N/A';

        const confirmBtn = document.getElementById('btnConfirmRefund');
        if (refundableAmount <= 0) {
            amountDisp.style.color = '#94a3b8';
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Nothing to Refund';
            }
        } else {
            amountDisp.style.color = '#e11d48';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Issue Refund';
            }
        }
    } catch (err) {
        console.error('[Refund] Error fetching transaction total:', err);
        amountDisp.textContent = 'Error';
        amountDisp.style.color = '#ef4444';
    }
};

window.processRefund = async function() {
    if (!activeRefundBookingId || refundableAmount <= 0) return;

    const btn = document.getElementById('btnConfirmRefund');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();
        const note = document.getElementById('refundNote').value.trim();

        // Record a negative transaction
        const { error } = await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: activeRefundBookingId,
                reference_type: 'booking',
                amount: Math.abs(refundableAmount), // Positive amount for refund as requested by user
                currency: 'INR',
                payment_method: (document.getElementById('refundMethodDisplay')?.value || 'cash').toLowerCase(),
                status: 'refunded',
                notes: note || 'Refund processed for cancelled booking',
                paid_at: new Date().toISOString()
            });

        if (error) throw error;

        // Success!
        document.getElementById('refundBookingModal').classList.remove('active');
        if (window.toast) {
            window.toast('✓ Refund processed successfully');
        } else {
            alert('Refund processed successfully');
        }

        // Trigger refresh
        document.dispatchEvent(new CustomEvent('payment-recorded', {
            detail: { bookingId: activeRefundBookingId, amount: -refundableAmount }
        }));

    } catch (err) {
        console.error('[Refund] Failed to process refund:', err);
        alert('Failed to process refund: ' + (err.message || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

// ─── Attach Event Listeners ───────────────────────────────────────────────────

window.viewCustomerProfile = async function(customerId, customerName) {
    if (!customerId) {
        alert('Walk-in customer — no profile record found.');
        return;
    }

    const modal   = document.getElementById('customerProfileBookingModal');
    const subTitle = document.getElementById('profModalSubtitle');
    const body    = document.getElementById('profModalBody');

    if (modal) {
        modal.classList.add('active');
        subTitle.textContent = customerName || 'Loading...';
        body.innerHTML = `<div style="text-align:center;padding:48px;color:#94a3b8;font-size:0.9rem;">⏳ Loading...</div>`;
    }

    try {
        // ── 1. Fetch customer record + 3 spend sources in parallel
        let [custRes, bookingsRes, salesRes, membershipsRes, recentBkRes] = await Promise.all([
            supabase.from('customers').select('*').eq('customer_id', customerId).limit(1),
            supabase.from('bookings_for_business_transaction')
                .select('total_price').eq('customer_id', customerId).eq('status', 'completed'),
            supabase.from('sales_with_payment_status')
                .select('amount_paid').eq('customer_id', customerId),
            supabase.from('membership_purchases')
                .select('price').eq('customer_id', customerId).eq('payment_status', 'paid'),
            supabase.from('bookings_for_business_transaction')
                .select('*')
                .eq('customer_id', customerId)
                .order('booking_date', { ascending: false })
                .limit(5)
        ]);

        const customer = custRes.data && custRes.data.length > 0 ? custRes.data[0] : null;
        if (!customer) throw new Error('Customer not found.');

        // ── 2. Compute total spent
        let totalSpent = 0;
        (bookingsRes.data || []).forEach(b => totalSpent += parseFloat(b.total_price) || 0);
        (salesRes.data   || []).forEach(s => totalSpent += parseFloat(s.amount_paid) || 0);
        (membershipsRes.data || []).forEach(m => totalSpent += parseFloat(m.price) || 0);

        const name      = customer.customer_name  || 'Unknown';
        const phone     = customer.customer_phone || '—';
        const email     = customer.customer_email || '—';
        const tags      = customer.tags            || 'Regular';
        const notes     = customer.notes           || '—';
        const totalVisits = (bookingsRes.data || []).length;
        const avatarUrl = customer.profile_photo ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c7d2fe&color=3730A3&size=128`;

        let joinedDate = '—';
        if (customer.created_at) {
            const d = new Date(customer.created_at);
            joinedDate = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        }

        // ── 3. Build booking history rows
        const recentBookings = recentBkRes.data || [];
        const statusColor = { completed:'#065f46', booked:'#1e40af', confirmed:'#1e40af', cancelled:'#991b1b', 'no-show':'#92400e', 'no_show':'#92400e' };
        const statusBg    = { completed:'#d1fae5', booked:'#dbeafe', confirmed:'#dbeafe', cancelled:'#fee2e2', 'no-show':'#fef3c7', 'no_show':'#fef3c7' };
        const bkRows = recentBookings.length ? recentBookings.map(bk => {
            const bkDate = bk.booking_date ? (() => { const d=new Date(bk.booking_date+'T00:00'); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })() : '—';
            const s = (bk.status||'').toLowerCase();
            const sc = statusColor[s] || '#475569';
            const sb = statusBg[s]    || '#f1f5f9';
            return `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;white-space:nowrap;">${bkDate}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:700;color:#1e293b;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${bk.service_name||'—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;">${bk.staff_name||'—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:600;color:#059669;">₹${bk.total_price||0}</td>
                <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;color:${sc};background:${sb};">${bk.status||'—'}</span></td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8;font-size:0.85rem;">No booking history found.</td></tr>`;

        // ── 4. Render 3-column layout
        body.innerHTML = `
        <div style="display:grid; grid-template-columns:210px 1fr 1.5fr; min-height:420px;">

            <!-- LEFT: Profile Card -->
            <div style="background:linear-gradient(160deg,#eef2ff 0%,#f8fafc 100%); border-right:1px solid #e2e8f0; padding:28px 20px; display:flex; flex-direction:column; align-items:center; gap:12px;">
                <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 4px #c7d2fe;">
                    <img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <div style="text-align:center;">
                    <h3 style="margin:0;font-size:1.05rem;font-weight:700;color:#1e293b;">${name}</h3>
                    <p style="margin:4px 0 0 0;font-size:0.82rem;color:#64748b;">${phone}</p>
                </div>
                <div style="width:100%;border-top:1px solid #e2e8f0;padding-top:14px;display:flex;flex-direction:column;gap:10px;">
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Total Spent</p>
                        <p style="margin:4px 0 0;font-size:1.15rem;font-weight:700;color:#059669;">₹${totalSpent.toLocaleString('en-IN')}</p>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Total Visits</p>
                        <p style="margin:4px 0 0;font-size:1.15rem;font-weight:700;color:#4f46e5;">${totalVisits}</p>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Status</p>
                        <div style="margin-top:4px;display:inline-block;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#e0e7ff;color:#3730a3;">${tags}</div>
                    </div>
                </div>
            </div>

            <!-- CENTER: Details -->
            <div style="padding:24px 20px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;gap:14px;">
                <h4 style="margin:0 0 4px;font-size:0.8rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Contact & Info</h4>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Email</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;word-break:break-all;">${email}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Phone</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;">${phone}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Member Since</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;">${joinedDate}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;flex:1;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Notes</p>
                    <p style="margin:4px 0 0;font-size:0.85rem;color:#334155;white-space:pre-wrap;">${notes}</p>
                </div>
            </div>

            <!-- RIGHT: Booking History -->
            <div style="padding:24px 20px;display:flex;flex-direction:column;">
                <h4 style="margin:0 0 12px;font-size:0.8rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Recent Bookings</h4>
                <div style="overflow-y:auto;flex:1;border:1px solid #e2e8f0;border-radius:8px;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                        <thead>
                            <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Date</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Service</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Staff</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Amount</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Status</th>
                            </tr>
                        </thead>
                        <tbody>${bkRows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;

        subTitle.innerHTML = `<span style="color:#94a3b8;">Profile Insights</span>`;
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('Error loading profile:', err);
        body.innerHTML = `<div style="text-align:center;padding:48px;color:#ef4444;font-size:0.9rem;">❌ Could not load customer profile.<br><span style="font-size:0.8rem;color:#94a3b8;">(${err.message||'No data available.'})</span></div>`;
        subTitle.textContent = 'Error';
    }
};

function attachEventListeners() {

    const searchInput = document.getElementById('bookingsPageSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value.trim();
            renderBookings(getFilteredBookings());
        });
    }

    // Status filter mutual-exclusion: All <-> individual statuses
    document.addEventListener('change', (e) => {
        if (e.target.name !== 'filterStatus') return;
        if (e.target.value === 'all' && e.target.checked) {
            document.querySelectorAll('input[name="filterStatus"]:not([value="all"])').forEach(c => c.checked = false);
        } else if (e.target.value !== 'all' && e.target.checked) {
            const allCb = document.querySelector('input[name="filterStatus"][value="all"]');
            if (allCb) allCb.checked = false;
        }
    });

    // Refund Modal Listeners
    const refundModal = document.getElementById('refundBookingModal');
    const btnCancelRefund = document.getElementById('btnCancelRefund');
    const btnCloseRefund = document.getElementById('btnCloseRefundModal');
    const btnConfirmRefund = document.getElementById('btnConfirmRefund');

    const closeRefund = () => refundModal?.classList.remove('active');
    
    btnCancelRefund?.addEventListener('click', closeRefund);
    btnCloseRefund?.addEventListener('click', closeRefund);
    btnConfirmRefund?.addEventListener('click', window.processRefund);
    refundModal?.addEventListener('click', (e) => {
        if (e.target === refundModal) closeRefund();
    });

    const editModal = document.getElementById('editBookingModal');
    const editForm  = document.getElementById('editBookingForm');

    document.getElementById('btnCloseEditBookingModal')?.addEventListener('click', () => editModal?.classList.remove('active'));
    document.getElementById('btnCancelEditBooking')?.addEventListener('click',     () => editModal?.classList.remove('active'));
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    const profModal = document.getElementById('customerProfileBookingModal');
    profModal?.addEventListener('click', (e) => { if (e.target === profModal) profModal.classList.remove('active'); });

    // ── Update Booking → Supabase PATCH ──────────────────────────────────────
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookingId = document.getElementById('editBookingId').value;
        const date      = document.getElementById('editBkDate').value;
        const time      = document.getElementById('editBkTime').value;
        const status    = editActiveBooking?.status || 'booked';
        const notes     = document.getElementById('editBkNotes').value.trim();

        const container = document.getElementById('editServiceRowsContainer');
        const svcRowEls = container?.querySelectorAll('.edit-service-row');

        if (!svcRowEls || svcRowEls.length === 0) {
            window.toast && window.toast('Please add at least one service.');
            return;
        }

        // Validate all rows
        let valid = true;
        svcRowEls.forEach(row => {
            if (!row.querySelector('.edit-svc-select')?.value ||
                !row.querySelector('.edit-staff-select')?.value) valid = false;
        });
        if (!valid) {
            window.toast && window.toast('Please select a service and staff for every row.');
            return;
        }

        const btn  = document.querySelector('button[form="editBookingForm"]');
        const orig = btn?.textContent;
        if (btn) { btn.textContent = 'Updating...'; btn.disabled = true; }

        try {
            const b = editActiveBooking;
            const currentDbIds = new Set();
            const updates = [];
            const inserts = [];

            Array.from(svcRowEls).forEach(row => {
                const svcSel     = row.querySelector('.edit-svc-select');
                const staffSel   = row.querySelector('.edit-staff-select');
                const priceInput = row.querySelector('.edit-svc-price');
                const opt        = svcSel?.options[svcSel.selectedIndex];
                const dbId       = row.dataset.dbId || null;

                const payload = {
                    company_id:     getCompanyId(),
                    branch_id:      getBranchId(),
                    booking_id:     bookingId,
                    customer_id:    b?.customer_id    || null,
                    customer_name:  b?.customer_name  || '',
                    customer_mail:  b?.customer_mail  || b?.customer_email || null,
                    customer_phone: b?.customer_phone || '',
                    service_id:     svcSel?.value     || '',
                    service_name:   opt?.textContent?.trim() || '',
                    staff_id:       staffSel?.value   || '',
                    staff_name:     staffSel?.options[staffSel.selectedIndex]?.text || '',
                    booking_date:   date,
                    start_time:     time,
                    end_time:       null,
                    notes:          notes,
                    price:          Number(priceInput?.value || 0),
                    status:         status,
                    payment:        b?.payment        || 'pending',
                    booking_type:   b?.booking_type   || 'walk-in'
                };

                if (dbId) {
                    currentDbIds.add(dbId);
                    updates.push({ id: dbId, payload });
                } else {
                    inserts.push(payload);
                }
            });

            // Rows removed from UI that existed in DB → DELETE
            const toDelete = [...originalServiceRowIds].filter(id => !currentDbIds.has(id));

            const ops = [];
            for (const { id, payload } of updates) {
                ops.push(supabase.from('bookings').update(payload).eq('id', id));
            }
            if (inserts.length > 0) {
                ops.push(supabase.from('bookings').insert(inserts));
            }
            for (const id of toDelete) {
                ops.push(supabase.from('bookings').delete().eq('id', id));
            }

            const results = await Promise.all(ops);
            const failedOp = results.find(r => r.error);
            if (failedOp) throw failedOp.error;

            // ── Update summary row in bookings_for_business_transaction ──
            const allCurrentRows = Array.from(svcRowEls);
            const summaryUpdate = {
                service_id:   allCurrentRows.map(row => row.querySelector('.edit-svc-select')?.value || '').filter(Boolean).join(', '),
                staff_id:     [...new Set(allCurrentRows.map(row => row.querySelector('.edit-staff-select')?.value || '').filter(Boolean))].join(', '),
                service_name: allCurrentRows.map(row => {
                    const sel = row.querySelector('.edit-svc-select');
                    return sel?.options[sel.selectedIndex]?.textContent?.trim() || '';
                }).filter(Boolean).join(', '),
                staff_name: [...new Set(allCurrentRows.map(row => {
                    const sel = row.querySelector('.edit-staff-select');
                    return sel?.options[sel.selectedIndex]?.text?.trim() || '';
                }).filter(Boolean))].join(', '),
                total_price:  allCurrentRows.reduce((sum, row) => {
                    return sum + (Number(row.querySelector('.edit-svc-price')?.value) || 0);
                }, 0),
                booking_date: date,
                start_time:   time,
                notes:        notes,
                status:       status,
                updated_at:   new Date().toISOString()
            };
            const { error: summaryErr } = await supabase
                .from('bookings_for_business_transaction')
                .update(summaryUpdate)
                .eq('booking_id', bookingId);
            if (summaryErr) console.error('[EditBooking] summary update error:', summaryErr);

            window.toast && window.toast('Booking updated successfully!');
            editModal.classList.remove('active');
            await fetchBookings();

        } catch (err) {
            console.error('[EditBooking] Update error:', err);
            window.toast && window.toast('Error updating booking: ' + (err.message || 'Unknown error'));
        } finally {
            if (btn) { btn.textContent = orig; btn.disabled = false; }
        }
    });

    // ── Update Booking Status & Helpers ─────────────────────────────────────────
    let statusUpdateBookingId = null;
    let statusUpdateNewStatus = null;

    window.updateBookingStatus = (bookingId, newStatus) => {
        if (!bookingId || !newStatus) return;
        statusUpdateBookingId = bookingId;
        statusUpdateNewStatus = newStatus;
        
        const textEl = document.getElementById('updateStatusConfirmText');
        if (textEl) {
            textEl.innerHTML = `Change this booking's status to <strong>${newStatus}</strong>?`;
        }

        // Dynamic button label + colour based on status
        const btnConfirm = document.getElementById('btnConfirmUpdateStatus');
        if (btnConfirm) {
            const statusConfig = {
                'completed': { label: 'Mark Completed', bg: '#22c55e', hover: '#16a34a' },
                'cancelled':  { label: 'Mark Cancelled',  bg: '#dc2626', hover: '#b91c1c' },
                'no-show':    { label: 'Mark No-show',    bg: '#ea580c', hover: '#c2410c' },
            };
            const cfg = statusConfig[newStatus.toLowerCase()] || { label: 'Yes, Update', bg: '#2563eb', hover: '#1d4ed8' };
            btnConfirm.textContent = cfg.label;
            btnConfirm.style.background = cfg.bg;
            btnConfirm.onmouseover = () => btnConfirm.style.background = cfg.hover;
            btnConfirm.onmouseout  = () => btnConfirm.style.background = cfg.bg;
        }

        const overlay = document.getElementById('updateStatusConfirmOverlay');
        if (overlay) overlay.classList.add('active');
        if (window.feather) feather.replace();
    };

    // Close button logic securely wrapped
    document.addEventListener('click', (e) => {
        if (e.target.id === 'btnKeepStatus') {
            document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
            statusUpdateBookingId = null;
            statusUpdateNewStatus = null;
        }
        if (e.target.id === 'updateStatusConfirmOverlay') {
            document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
            statusUpdateBookingId = null;
            statusUpdateNewStatus = null;
        }
        
        if (e.target.id === 'btnConfirmUpdateStatus') {
            window.confirmUpdateBookingStatus();
        }
    });

    window.confirmUpdateBookingStatus = async () => {
        if (!statusUpdateBookingId || !statusUpdateNewStatus) return;
        const bookingId = statusUpdateBookingId;
        const newStatus = statusUpdateNewStatus;
        
        document.getElementById('updateStatusConfirmOverlay')?.classList.remove('active');
        document.getElementById('fullScreenUpdateStatusLoader')?.classList.add('active');
        
        try {
            const { error: dbError } = await supabase
                .from('bookings')
                .update({ status: newStatus })
                .eq('booking_id', bookingId);

            if (dbError) {
                console.error('Supabase status update error:', dbError);
                window.toast && window.toast('Error: ' + dbError.message);
                return;
            }
            
            const { error: summaryErr } = await supabase
                .from('bookings_for_business_transaction')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('booking_id', bookingId);
            if (summaryErr) console.error('[Status Update] summary update error:', summaryErr);

            if (newStatus.toLowerCase() === 'cancelled') {
                const { error: ledgerErr } = await supabase
                    .from('business_transactions')
                    .insert([{
                        company_id: getCompanyId() || null,
                        branch_id: getBranchId() || null,
                        reference_id: bookingId,
                        reference_type: 'booking',
                        status: 'cancelled',
                        amount: 0,
                        created_at: new Date().toISOString()
                    }]);
                if (ledgerErr) console.error('[Status Update] ledger insert error:', ledgerErr);
            }

            window.toast && window.toast(`Booking status updated to ${newStatus}`);
            await fetchBookings();
        } catch (err) {
            console.error(err);
            window.toast && window.toast('Network error updating booking status.');
        } finally {
            document.getElementById('fullScreenUpdateStatusLoader')?.classList.remove('active');
            statusUpdateBookingId = null;
            statusUpdateNewStatus = null;
        }
    };

    window.triggerInvoice = (bookingId) => {
        alert('Invoice generation placeholder for Booking ' + bookingId);
    };

    window.triggerRebook = async (bookingId) => {
        const b = liveBookingsData.find(x => (x.booking_id || x.id) == bookingId);
        if (!b) return;

        // Try to fetch the email if missing from view payload
        let cEmail = b.customer_email || b.customer_mail || '';
        if (!cEmail && b.customer_id) {
            try {
                const { data } = await supabase.from('customers').select('customer_email').eq('customer_id', b.customer_id).limit(1).single();
                if (data && data.customer_email) cEmail = data.customer_email;
            } catch(e) { console.error('Failed to grab customer_email for prefill', e); }
        }

        const serviceIds = String(b.service_id || '').split(',').map(s => s.trim()).filter(Boolean);
        const staffIds   = String(b.staff_id   || '').split(',').map(s => s.trim()).filter(Boolean);

        if (window.openAndPrefillBooking) {
            // This awaits dropdown population BEFORE filling values — fixes race condition
            await window.openAndPrefillBooking({
                customerId: b.customer_id,
                name:       b.customer_name,
                phone:      b.customer_phone,
                email:      cEmail,
                serviceIds,
                staffIds
            });
        } else {
            // Fallback: just open the modal normally
            const btnNewBooking = document.getElementById('btnNewBooking') || document.getElementById('btnNewBookingPage');
            if (btnNewBooking) btnNewBooking.click();
        }
    };

    // ── Global window helpers (called from row buttons) ────────────────────────
    window.openEditBookingModal = async (bookingId) => {
        const b = liveBookingsData.find(x => (x.booking_id || x.id) === bookingId);
        if (!b) return;

        editActiveBooking     = b;
        originalServiceRowIds = new Set();

        // Prefill shared fields
        document.getElementById('editBookingId').value = bookingId;
        const dateInput = document.getElementById('editBkDate');
        const timeInput = document.getElementById('editBkTime');

        dateInput.value = b.booking_date || '';
        timeInput.value = (b.start_time || '').slice(0, 5);
        document.getElementById('editBkNotes').value = b.notes || '';

        // Restrict Date & Time to Future
        const todayStr = todayISO();
        dateInput.min = todayStr;
        
        const restrictTime = () => {
            if (dateInput.value === todayStr) {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                timeInput.min = `${hh}:${mm}`;
            } else {
                timeInput.removeAttribute('min');
            }
        };
        dateInput.addEventListener('change', restrictTime);
        restrictTime();

        // Open modal & show loading state
        const editModal = document.getElementById('editBookingModal');
        editModal?.classList.add('active');
        if (window.feather) feather.replace();

        const container = document.getElementById('editServiceRowsContainer');
        if (container) container.innerHTML = `
            <div style="text-align:center;padding:24px;color:#94a3b8;font-size:0.9rem;">
                ⏳ Loading services...
            </div>`;

        try {
            // Parallel: load dropdown data + fetch all service rows for this booking group
            const [, { data: allRows, error }] = await Promise.all([
                loadEditDropdownData(),
                supabase.from('bookings').select('*').eq('booking_id', bookingId)
            ]);

            if (error) throw error;

            container.innerHTML = '';
            editRowCounter = 0;
            const rows = (allRows && allRows.length > 0) ? allRows : [b];

            rows.forEach((row, i) => {
                // Track original DB row ids so we can DELETE removed ones on save
                if (row.id) originalServiceRowIds.add(row.id);
                container.appendChild(buildEditServiceRow(
                    editRowCounter++, i === 0,
                    row.service_id || '', row.staff_id || '', row.price ?? '',
                    row.id || null
                ));
            });
            syncEditServiceDropdowns();

            // Wire the "+ Add" button safely using onclick to prevent duplicate listeners
            const addBtn = document.getElementById('btnEditAddService');
            if (addBtn) {
                addBtn.onclick = () => {
                    const firstStaff = container.querySelector('.edit-staff-select')?.value || '';
                    const nextId = container.querySelectorAll('.edit-service-row').length;
                    container.appendChild(buildEditServiceRow(nextId, false, '', firstStaff, '', null));
                    syncEditServiceDropdowns();
                };
            }

        } catch (err) {
            console.error('[EditModal] Error loading booking rows:', err);
            if (container) container.innerHTML =
                `<div style="color:#ef4444;padding:12px;text-align:center;">Error loading booking details.</div>`;
        }
    };
    const btnFilter = document.getElementById('btnFilterBookings');
    const filterMenu = document.getElementById('filterDropdownMenu');
    const FILTER_KEY = 'bookings_filter_state';

    // ── Save current DOM filter state to localStorage ────────────────────────
    function saveFilterState() {
        const statuses = Array.from(document.querySelectorAll('input[name="filterStatus"]'))
            .map(c => ({ value: c.value, checked: c.checked }));
        const staffAll = document.querySelector('input[name="filterStaff"][value="all"]')?.checked ?? true;
        const staff = Array.from(document.querySelectorAll('input[name="filterStaff"]:not([value="all"])'))
            .map(c => ({ value: c.value, checked: c.checked }));
        const dateRange = document.querySelector('input[name="filterDateRange"]:checked')?.value || 'all';
        const search = currentSearchQuery || '';
        localStorage.setItem(FILTER_KEY, JSON.stringify({ statuses, staffAll, staff, dateRange, search }));
    }

    // ── Restore filter state from localStorage into DOM ──────────────────────
    function restoreFilterState() {
        const raw = localStorage.getItem(FILTER_KEY);
        if (!raw) return;
        try {
            const s = JSON.parse(raw);
            // Status
            if (s.statuses) {
                s.statuses.forEach(({ value, checked }) => {
                    const el = document.querySelector(`input[name="filterStatus"][value="${value}"]`);
                    if (el) el.checked = checked;
                });
            }
            // Date
            if (s.dateRange) {
                const el = document.querySelector(`input[name="filterDateRange"][value="${s.dateRange}"]`);
                if (el) el.checked = true;
            }
            // Search
            if (s.search) {
                currentSearchQuery = s.search;
                const searchInput = document.getElementById('bookingsPageSearch');
                if (searchInput) searchInput.value = s.search;
            }
            // Staff is restored after populateStaffFilter runs — store for later
            window._pendingStaffFilter = s;
        } catch (e) { /* ignore bad JSON */ }
    }

    // Apply pending staff filter after populateStaffFilter has re-rendered staff checkboxes
    window._applyPendingStaffFilter = function() {
        const s = window._pendingStaffFilter;
        if (!s) return;
        const staffAllEl = document.querySelector('input[name="filterStaff"][value="all"]');
        if (staffAllEl) staffAllEl.checked = s.staffAll ?? true;
        if (s.staff) {
            s.staff.forEach(({ value, checked }) => {
                const el = document.querySelector(`input[name="filterStaff"][value="${value}"]`);
                if (el) el.checked = checked;
            });
        }
        window._pendingStaffFilter = null;
    };

    // ── Dropdown toggle ──────────────────────────────────────────────────────
    btnFilter?.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMenu?.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        const container = document.getElementById('bookingsFilterContainer');
        if (filterMenu && filterMenu.classList.contains('active') && container && !container.contains(e.target)) {
            filterMenu.classList.remove('active');
        }
    });

    // ── Apply ────────────────────────────────────────────────────────────────
    document.getElementById('btnFilterApply')?.addEventListener('click', () => {
        saveFilterState();
        renderBookings(getFilteredBookings());
        filterMenu?.classList.remove('active');
    });

    // ── Clear ────────────────────────────────────────────────────────────────
    document.getElementById('btnFilterClear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Uncheck all status filters (no filter = show all)
        document.querySelectorAll('input[name="filterStatus"]').forEach(c => c.checked = false);
        // Reset staff to All Staff
        const staffAll = document.querySelector('input[name="filterStaff"][value="all"]');
        if (staffAll) staffAll.checked = true;
        document.querySelectorAll('input[name="filterStaff"]:not([value="all"])').forEach(c => c.checked = false);
        // Reset date to View All Time
        const dateAll = document.querySelector('input[name="filterDateRange"][value="all"]');
        if (dateAll) dateAll.checked = true;
        // Clear search
        currentSearchQuery = '';
        const searchInput = document.getElementById('bookingsPageSearch');
        if (searchInput) searchInput.value = '';

        saveFilterState();
        renderBookings(getFilteredBookings());
        filterMenu?.classList.remove('active');
    });

    // Restore state on load (staff part deferred — applied after populateStaffFilter)
    restoreFilterState();
}

// ─── Fetch Bookings from Supabase ─────────────────────────────────────────────
export async function fetchBookings() {
    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        let query = supabase
            .from('bookings_with_payment_status')
            .select('*')
            .order('booking_date', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId)  query = query.eq('branch_id', branchId);

        const { data, error } = await query;

        if (error) {
            console.error('[Bookings] Supabase fetch error:', error);
            renderBookings(liveBookingsData || []);
            return;
        }

        liveBookingsData = data || [];
        window.liveBookingsData = liveBookingsData;
        populateStaffFilter(); 
        renderBookings(getFilteredBookings());
        if (typeof renderCalendar === 'function') renderCalendar();

    } catch (err) {
        console.error('[Bookings] Unexpected error:', err);
        renderBookings(liveBookingsData || []);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initBookings() {
    window.fetchBookings = fetchBookings;
    setupModals();
    attachEventListeners();
    
    // Listen for global payment recording event
    document.addEventListener('payment-recorded', async () => {
        console.log('[Bookings] Payment recorded event detected, refreshing...');
        await fetchBookings();
    });

    await fetchBookings();
}

// ─── Refund Logic ─────────────────────────────────────────────────────────────
let currentRefundBookingId = null;
let currentRefundAmount = 0;

window.triggerRefund = async function(bookingId) {
    const b = liveBookingsData.find(x => String(x.booking_id) === String(bookingId));
    if (!b) {
        console.error("No booking found for", bookingId, liveBookingsData.slice(0,2));
        return;
    }

    currentRefundBookingId = bookingId;
    currentRefundAmount = 0;

    const modal = document.getElementById('refundBookingModal');
    if (modal) modal.classList.add('active');

    const btn = document.getElementById('btnConfirmRefund');
    if (btn) { btn.textContent = 'Issue Refund'; btn.disabled = true; }

    const amountDisplay = document.getElementById('refundAmountDisplay');
    if (amountDisplay) amountDisplay.textContent = 'Calculating...';

    const methodDisplay = document.getElementById('refundMethodDisplay');
    if (methodDisplay) methodDisplay.value = 'Loading...';

    try {
        const { data: txs, error } = await supabase
            .from('business_transactions')
            .select('amount, payment_method')
            .eq('reference_id', bookingId)
            .in('status', ['paid', 'completed']);

        if (error) throw error;

        let totalPaid = 0;
        let lastMethod = 'cash';
        if (txs && txs.length > 0) {
            txs.forEach(t => { totalPaid += Number(t.amount || 0); });
            lastMethod = txs[0].payment_method || 'cash';
        }

        currentRefundAmount = totalPaid;
        
        if (amountDisplay) {
            amountDisplay.textContent = `₹${currentRefundAmount.toLocaleString('en-IN')}`;
        }

        if (methodDisplay) {
            let inferred = lastMethod.toLowerCase();
            if (!['cash', 'card', 'upi'].includes(inferred)) inferred = 'cash';
            methodDisplay.value = inferred.charAt(0).toUpperCase() + inferred.slice(1);
        }

        if (btn) btn.disabled = (currentRefundAmount <= 0);

    } catch (err) {
        console.error('Error fetching refund amount:', err);
        if (amountDisplay) amountDisplay.textContent = 'Error';
    }
};

const closeRefundModal = () => {
    const modal = document.getElementById('refundBookingModal');
    if (modal) modal.classList.remove('active');
    currentRefundBookingId = null;
};

function wireRefundModal() {
    const btnCancelRefund = document.getElementById('btnCancelRefund');
    if (btnCancelRefund) btnCancelRefund.addEventListener('click', closeRefundModal);

    const btnCloseRefundModal = document.getElementById('btnCloseRefundModal');
    if (btnCloseRefundModal) btnCloseRefundModal.addEventListener('click', closeRefundModal);

    const btnConfirmRefund = document.getElementById('btnConfirmRefund');
    if (btnConfirmRefund) {
        btnConfirmRefund.addEventListener('click', async () => {
            if (!currentRefundBookingId) return;

            const btn = document.getElementById('btnConfirmRefund');
            if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }

            const noteEl = document.getElementById('refundNote');
            const note = noteEl ? noteEl.value.trim() : '';

            const methodEl = document.getElementById('refundMethodDisplay');
            let method = methodEl ? methodEl.value.toLowerCase() : 'cash';
            if (!['cash', 'card', 'upi'].includes(method)) method = 'cash';

            try {
                const { error: txError } = await supabase.from('business_transactions').insert([{
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    reference_id: currentRefundBookingId,
                    reference_type: 'booking',
                    amount: Math.abs(currentRefundAmount),
                    status: 'refunded',
                    payment_method: method,
                    notes: note || 'Refund for cancelled/no-show booking',
                    paid_at: new Date().toISOString()
                }]);

                if (txError) throw txError;
                // payment_status is computed from the view — no separate update needed

                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Refund processed successfully!';
                    toast.style.background = '#10b981';
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }

                closeRefundModal();
                await fetchBookings();

            } catch (err) {
                console.error('Refund Error:', err);
                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Failed to process refund.';
                    toast.style.background = '#ef4444';
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }
            } finally {
                if (btn) { btn.textContent = 'Issue Refund'; btn.disabled = false; }
            }
        });
    }
}

// ─── Calendar Logic ───────────────────────────────────────────────────────────
let currentCalDate = new Date(); // tracks the viewed month/year in the calendar tab

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarMonthTitle');
    if (!grid || !title) return;

    // Remove existing day cells (keep the 7 headers)
    const existingDays = grid.querySelectorAll('.calendar-day');
    existingDays.forEach(cell => cell.remove());

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth(); // 0-11

    title.textContent = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Today's exact yyyy-mm-dd for highlighting
    const todayStr = new Date().toISOString().split('T')[0];

    // Padding empty cells before 1st of month
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day';
        emptyCell.style.background = '#f8fafc'; // light gray for empty
        grid.appendChild(emptyCell);
    }

    // Populate actual days
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.style.position = 'relative';

        const rawDate = new Date(year, month, d);
        // format local yyyy-mm-dd safely (without UTC shift offset issues)
        const dateStr = [
            rawDate.getFullYear(),
            String(rawDate.getMonth() + 1).padStart(2, '0'),
            String(rawDate.getDate()).padStart(2, '0')
        ].join('-');

        // Highlight today
        if (dateStr === todayStr) {
            cell.style.background = '#eff6ff'; // light blue tint
            cell.style.border = '1.5px solid #3b82f6'; // distinct border
        }

        const numEl = document.createElement('div');
        numEl.textContent = d;
        numEl.style.fontWeight = '600';
        numEl.style.color = '#1e293b';
        cell.appendChild(numEl);

        // Find how many bookings fall on this day
        // ensure we check against liveBookingsData safely
        const dayBookings = window.liveBookingsData.filter(b => b.booking_date === dateStr);

        if (dayBookings.length > 0) {
            const badge = document.createElement('div');
            badge.textContent = dayBookings.length + ' Booking' + (dayBookings.length > 1 ? 's' : '');
            badge.style.marginTop = '8px';
            badge.style.padding = '4px 6px';
            badge.style.background = '#3b82f6';
            badge.style.color = '#fff';
            badge.style.borderRadius = '4px';
            badge.style.fontSize = '0.7rem';
            badge.style.fontWeight = '600';
            badge.style.textAlign = 'center';
            badge.style.cursor = 'pointer';
            
            // Interaction
            badge.addEventListener('mouseenter', () => badge.style.background = '#2563eb');
            badge.addEventListener('mouseleave', () => badge.style.background = '#3b82f6');
            badge.addEventListener('click', () => openCalendarDayModal(dateStr, dayBookings));

            cell.appendChild(badge);
        }

        grid.appendChild(cell);
    }
}

function openCalendarDayModal(dateStr, bookings) {
    const modal = document.getElementById('calDayModalOverlay');
    const subtitle = document.getElementById('calDayModalSubtitle');
    const tbody = document.getElementById('calDayModalBody');

    if (!modal || !tbody) return;

    // format beautiful string like "29-05-2026, Thursday"
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    const dayName = dateObj.toLocaleDateString('default', { weekday: 'long' });
    subtitle.textContent = `${d}-${m}-${y}, ${dayName}`;

    tbody.innerHTML = '';
    
    // Sort bookings by time ascending
    const sorted = [...bookings].sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''));

    sorted.forEach(b => {
        const timeVal = (b.start_time || '').slice(0,5);
        
        let ptime = '';
        if (timeVal) {
            let [hh, mm] = timeVal.split(':');
            let hr = parseInt(hh, 10);
            let ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12;
            if (hr === 0) hr = 12;
            ptime = `${String(hr).padStart(2,'0')}:${mm} ${ampm}`;
        }

        const svcs = (b.service_name || '').split(',').map(s=> `<span style="display:inline-block;padding:2px 6px;margin:2px;background:#f1f5f9;border-radius:4px;font-size:0.7rem;">${s.trim()}</span>`).join('');

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="padding:10px 14px; font-weight:600; color:#334155;">${ptime || '—'}</td>
            <td style="padding:10px 8px; font-weight:600; color:#1e293b;">${b.customer_name || '—'}</td>
            <td style="padding:10px 8px;">${svcs}</td>
            <td style="padding:10px 8px; color:#475569; font-size:0.8rem;">${b.staff_name || '—'}</td>
            <td style="padding:10px 8px;">${window.bookingStatusBadge ? window.bookingStatusBadge(b.status) : b.status}</td>
        `;
        tbody.appendChild(tr);
    });

    modal.classList.add('active');
}

// Wire Calendar Navigation Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Needs feather icons again mostly managed elsewhere
    const prev = document.getElementById('calPrevBtn');
    const next = document.getElementById('calNextBtn');
    const todayBtn = document.getElementById('calTodayBtn');

    if (prev) {
        prev.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() - 1);
            renderCalendar();
        });
    }
    if (next) {
        next.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() + 1);
            renderCalendar();
        });
    }
    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            currentCalDate = new Date();
            renderCalendar();
        });
    }

    // Modal close handlers
    const overlay = document.getElementById('calDayModalOverlay');
    const closeBtn1 = document.getElementById('calDayModalClose');
    const closeBtn2 = document.getElementById('calDayModalCloseBtn');

    const handleClose = () => overlay.classList.remove('active');
    if (closeBtn1) closeBtn1.addEventListener('click', handleClose);
    if (closeBtn2) closeBtn2.addEventListener('click', handleClose);
});

