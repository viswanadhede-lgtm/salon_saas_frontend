import { supabase } from '../lib/supabase.js';

// ================================================================
// BOOKINGS DATA
// ================================================================
let todaysBookingsData = [];

let activeMenuEl = null;
let currentActionData = null;

// ================================================================
// INIT PAGE
// ================================================================
window.initPage = async function () {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateLabel = document.getElementById('tbDateLabel');
    if (dateLabel) dateLabel.textContent = now.toLocaleDateString('en-IN', opts);

    try {
        let branchId = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
        if (!branchId) {
            try {
                const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                branchId = ctx.branch?.branch_id || ctx.branch?.id || null;
            } catch { }
        }
        if (!branchId) throw new Error('No branch selected.');

        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('bookings_for_business_transaction')
            .select('*')
            .eq('branch_id', branchId)
            .eq('booking_date', localISOTime)
            .order('start_time', { ascending: true });

        if (error) throw error;

        const upcomingData = (data || []).filter(b => {
            const st = (b.status || '').toLowerCase().trim();
            return !['completed', 'cancelled', 'no-show', 'noshow'].includes(st);
        });

        todaysBookingsData = upcomingData.map((b) => {
            const parsedStart = b.start_time ? b.start_time.split(':') : ['09', '00'];
            let hours = parseInt(parsedStart[0]) || 9;
            const minutes = parsedStart[1] || '00';
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
                raw_date: b.booking_date,
                service: b.service_name || 'N/A',
                staff: b.staff_name || 'Unassigned',
                status: (b.status || 'booked').toLowerCase(),
                amount: '\u20b9' + (b.total_price || 0).toLocaleString('en-IN'),
                payment: (b.payment_status || 'pending').toLowerCase()
            };
        });
    } catch (err) {
        console.error('Failed to load live bookings:', err);
    }

    const countEl = document.getElementById('tbCountBadge');
    if (countEl) countEl.textContent = todaysBookingsData.length + ' bookings';

    renderBookingsTable();

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
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }, 100);
};

// ================================================================
// RENDER TABLE
// ================================================================
function renderBookingsTable() {
    const tbody = document.getElementById('tbTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (todaysBookingsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 48px 16px; text-align: center; color: #94a3b8; font-size: 0.95rem;">
                    No upcoming appointments for today.
                </td>
            </tr>
        `;
        return;
    }

    todaysBookingsData.forEach((b, idx) => {
        const statusClass = 'tb-status-' + b.status;
        const statusLabel = b.status === 'noshow'
            ? 'No-show'
            : b.status.charAt(0).toUpperCase() + b.status.slice(1);

        let serviceHtml = '-';
        const rawServices = (b.service || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rawServices.length === 1) {
            serviceHtml = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;white-space:nowrap;" title="${rawServices[0]}">${rawServices[0]}</span>`;
        } else if (rawServices.length > 1) {
            const first = rawServices[0];
            const rest = rawServices.slice(1);
            const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:#f1f5f9;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;
            const extraPills = rest.map(s => `<span style="${chipStyle}">${s}</span>`).join('');
            const uid = 'svc_' + idx;
            serviceHtml = `
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; align-items:center; gap:2px; flex-wrap:wrap;">
                        <span style="${chipStyle}">${first}</span>
                        <span id="pill_${uid}" style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;" onclick="const x=document.getElementById('extra_${uid}'); const shown=x.style.display!=='none'; x.style.display=shown?'none':'flex'; this.textContent=shown?'+${rest.length}':'\u2190 less'">+${rest.length}</span>
                    </div>
                    <div id="extra_${uid}" style="display:none; flex-wrap:wrap; gap:4px; padding-top:2px;">
                        ${extraPills}
                    </div>
                </div>
            `;
        }

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

        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.id = `row-${b.raw_id}`;
        tr.innerHTML = `
            <td style="padding:16px 16px; color:#64748b; font-weight:600; font-size:0.78rem;">${b.id}</td>
            <td style="padding:16px 16px; font-weight:600; color:#475569; font-size:0.875rem;">
                <span class="customer-link" style="cursor:pointer;" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${b.customer_id}', '${b.customer.replace(/'/g, "\\'")}')">${b.customer}</span>
            </td>
            <td style="padding:16px 16px;">
                <div style="color:#1e293b; font-weight:600; font-size:0.85rem;">${b.time}</div>
            </td>
            <td style="padding:16px 16px; color:#475569; font-size:0.85rem;">${serviceHtml}</td>
            <td style="padding:16px 16px; color:#475569; font-size:0.85rem;">${staffHtml}</td>
            <td style="padding:16px 16px;">
                <span style="display:inline-block; padding:4px 12px; background:#dcfce7; color:#166534; border-radius:9999px; font-size:0.75rem; font-weight:700;">${b.amount}</span>
            </td>
            <td style="padding:16px 16px;">
                ${b.payment !== 'paid' ? `
                <button onclick="openRowPayment('${b.raw_id}')" style="background:#4f46e5; border:none; border-radius:6px; cursor:pointer; color:#fff; padding:6px 14px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap: 6px; font-size: 0.8rem; font-weight: 600;" onmouseover="this.style.background='#4338ca';" onmouseout="this.style.background='#4f46e5';">
                    <i data-feather="credit-card" style="width:14px; height:14px;"></i> Collect
                </button>
                ` : `<span style="font-size:0.85rem; color:#059669; font-weight:700;">Paid</span>`}
            </td>
            <td style="padding:16px 16px;">
                <span class="tb-status-pill ${statusClass}">${statusLabel}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.feather) feather.replace();
}
window.renderBookingsTable = renderBookingsTable;


function closeOpenMenu() {
    if (activeMenuEl) { activeMenuEl.remove(); activeMenuEl = null; }
}
window.closeOpenMenu = closeOpenMenu;

// ================================================================
// HANDLE BOOKING ACTIONS
// ================================================================
window.handleBookingAction = function (action, idx) {
    closeOpenMenu();
    const booking = todaysBookingsData[idx];
    currentActionData = { action, idx, booking };

    const overlay = document.getElementById('actionSummaryOverlay');
    const icon = document.getElementById('actionSummaryIcon');
    const actionLabel = document.getElementById('actionSummaryActionLabel');
    const title = document.getElementById('actionSummaryTitle');
    const details = document.getElementById('actionSummaryDetails');
    const message = document.getElementById('actionSummaryMessage');
    const confirmBtn = document.getElementById('actionSummaryConfirm');

    details.innerHTML = `
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Customer</p>
            <p style="font-size:0.875rem; font-weight:600; color:#1e293b; margin:0;">${booking.customer}</p>
        </div>
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Time</p>
            <p style="font-size:0.875rem; font-weight:600; color:#1e293b; margin:0;">${booking.time}</p>
        </div>
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Service</p>
            <p style="font-size:0.875rem; font-weight:500; color:#374151; margin:0;">${booking.service}</p>
        </div>
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Staff</p>
            <p style="font-size:0.875rem; font-weight:500; color:#374151; margin:0;">${booking.staff}</p>
        </div>
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Amount</p>
            <p style="font-size:0.875rem; font-weight:700; color:#1e293b; margin:0;">${booking.amount}</p>
        </div>
        <div>
            <p style="font-size:0.72rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 3px;">Payment</p>
            <p style="font-size:0.875rem; font-weight:500; color:#374151; margin:0; text-transform:capitalize;">${booking.payment}</p>
        </div>
    `;

    const configs = {
        view: {
            label: 'View Booking', titleText: 'Booking Details',
            iconBg: '#eff6ff', iconColor: '#3b82f6',
            iconSvg: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
            msg: 'You are viewing the booking details below.',
            btnBg: '#3b82f6', btnText: 'Close', btnHover: '#2563eb'
        },
        edit: {
            label: 'Edit Booking', titleText: 'Edit This Booking',
            iconBg: '#f0fdf4', iconColor: '#16a34a',
            iconSvg: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
            msg: 'Confirm to proceed to edit this booking. Changes will be saved immediately.',
            btnBg: '#16a34a', btnText: 'Confirm Edit', btnHover: '#15803d'
        },
        complete: {
            label: 'Mark Completed', titleText: 'Mark as Completed',
            iconBg: '#f0fdf4', iconColor: '#10b981',
            iconSvg: '<polyline points="20 6 9 17 4 12"/>',
            msg: 'Are you sure you want to mark this booking as completed?',
            btnBg: '#10b981', btnText: 'Confirm', btnHover: '#059669'
        },
        cancel: {
            label: 'Cancel Booking', titleText: 'Cancel Booking',
            iconBg: '#fff1f2', iconColor: '#dc2626',
            iconSvg: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
            msg: 'Are you sure you want to cancel this booking? This action cannot be undone.',
            btnBg: '#dc2626', btnText: 'Confirm Cancel', btnHover: '#b91c1c'
        }
    };

    const cfg = configs[action];
    actionLabel.textContent = cfg.label;
    title.textContent = cfg.titleText;
    icon.style.background = cfg.iconBg;
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cfg.iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cfg.iconSvg}</svg>`;
    message.textContent = cfg.msg;
    confirmBtn.style.background = cfg.btnBg;
    confirmBtn.textContent = cfg.btnText;
    confirmBtn.onmouseover = () => confirmBtn.style.background = cfg.btnHover;
    confirmBtn.onmouseout = () => confirmBtn.style.background = cfg.btnBg;
    confirmBtn.onclick = () => confirmBookingAction();

    overlay.style.display = 'flex';
};

window.closeActionSummary = function () {
    document.getElementById('actionSummaryOverlay').style.display = 'none';
    currentActionData = null;
};

function confirmBookingAction() {
    if (!currentActionData) return;
    const { action, idx } = currentActionData;
    const booking = todaysBookingsData[idx];

    if (action === 'complete') {
        todaysBookingsData[idx].status = 'completed';
        showToast(`${booking.customer}'s booking marked as completed.`, '#10b981');
    } else if (action === 'cancel') {
        todaysBookingsData[idx].status = 'cancelled';
        showToast(`${booking.customer}'s booking has been cancelled.`, '#dc2626');
    } else if (action === 'edit') {
        showToast(`Opening edit for ${booking.customer}'s booking... (demo)`, '#16a34a');
    } else if (action === 'view') {
        window.closeActionSummary();
        return;
    }

    window.closeActionSummary();
    renderBookingsTable();
}

// ================================================================
// TOAST
// ================================================================
function showToast(msg, color) {
    const toast = document.getElementById('tbToast');
    toast.textContent = msg;
    if (color) toast.style.background = color;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.textContent = ''; }, 300);
    }, 3000);
}
window.showToast = showToast;

// ================================================================
// COLLECT PAYMENT
// ================================================================
window.openRowPayment = async function (bookingId) {
    const row = todaysBookingsData.find(p => p.raw_id === bookingId);
    const targetId = row ? row.raw_id : bookingId;
    if (!targetId || !row) return;

    const totalOriginal = parseInt(String(row.amount || '0').replace(/[^0-9]/g, ''), 10) || 0;

    if (!window.openGlobalPaymentModal) {
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'scripts/global-payment-modal.js?v=2.2.0';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    if (window.openGlobalPaymentModal) {
        window.openGlobalPaymentModal({
            type: 'booking',
            title: 'Appointment Payment',
            saleId: String(targetId).slice(0, 8).toUpperCase(),
            customerId: row.customer_id || null,
            customerName: row.customer || 'Customer',
            customerPhone: row.phone || '',
            totalAmount: totalOriginal,
            amountDue: totalOriginal,
            items: [{
                name: row.service || 'Service Appointment',
                subtitle: `${row.time || ''} - Staff: ${row.staff || 'Assigned'}`,
                quantity: 1,
                price: totalOriginal
            }],
            onComplete: async (payload) => {
                await processPaymentCallback(payload, row);
            }
        });
    } else {
        alert('Payment modal not loaded. Please refresh the page.');
    }
};

async function processPaymentCallback(payload, row) {
    const amount = payload.amountCollected;
    const payMethod = payload.paymentMethod;

    try {
        let companyId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            companyId = ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch {
            companyId = localStorage.getItem('company_id') || null;
        }

        const branchId = localStorage.getItem('branch_id');
        const paidAt = new Date().toISOString().replace('Z', '');

        const totalOriginal = parseInt(row.amount.replace(/[^0-9]/g, ''), 10) || 0;
        const totalDiscount = totalOriginal - amount;
        const d = payload.discounts || {};
        let discountType = null;
        let discountName = null;
        if (d.couponCode) { discountType = 'coupon'; discountName = d.couponCode; }
        else if (d.offerName) { discountType = 'offer'; discountName = d.offerName; }
        else if (d.membershipName) { discountType = 'membership'; discountName = d.membershipName; }
        else if (d.manualValue > 0) {
            discountType = 'manual';
            discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `Rs.${d.manualValue} off`;
        }

        const { error: txError } = await supabase
            .from('business_transactions')
            .insert({
                company_id: companyId,
                branch_id: branchId,
                reference_id: row.raw_id,
                reference_type: 'booking',
                amount: amount,
                currency: 'INR',
                payment_method: payMethod.toLowerCase(),
                status: 'paid',
                notes: `Payment for booking ${row.raw_id.substring(0, 8)}`,
                paid_at: paidAt,
                final_amount: amount,
                discount_type: discountType,
                discount_name: discountName,
                discount_amount: totalDiscount > 0 ? totalDiscount : null
            });
        if (txError) throw txError;

        const { error: bftError } = await supabase
            .from('bookings_for_business_transaction')
            .update({
                payment_status: 'paid',
                status: 'completed',
                final_amount: amount,
                discount_amount: totalDiscount > 0 ? totalDiscount : null,
                discount_type: discountType,
                discount_name: discountName,
                updated_at: new Date().toISOString()
            })
            .eq('booking_id', row.raw_id);
        if (bftError) console.error('bft update error:', bftError);

        const { error: bookingError } = await supabase
            .from('bookings')
            .update({
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .eq('id', row.raw_id);
        if (bookingError) console.error('bookings update error:', bookingError);

        showToast('Payment recorded successfully!', '#10b981');
        if (typeof window.initPage === 'function') {
            await window.initPage();
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to record payment: ' + (err.message || 'Unknown error'), '#ef4444');
        throw err;
    }
}

// ================================================================
// SIDEBAR & SUBMENU
// ================================================================
function initSidebar() {
    if (window.feather) feather.replace();

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');

    if (sidebar && localStorage.getItem('sidebar_collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    if (toggleBtn && !toggleBtn.dataset.tbInit) {
        toggleBtn.dataset.tbInit = '1';
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebar_collapsed', isCollapsed);
            toggleBtn.setAttribute('title', isCollapsed ? 'Open sidebar' : 'Close sidebar');
        });
    }

    document.querySelectorAll('.submenu-toggle').forEach(toggle => {
        if (toggle.dataset.tbInit) return;
        toggle.dataset.tbInit = '1';
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const parentItem = toggle.closest('.has-submenu');
            if (!parentItem) return;
            parentItem.classList.toggle('submenu-open');
            if (sidebar && sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                localStorage.setItem('sidebar_collapsed', 'false');
                if (toggleBtn) toggleBtn.setAttribute('title', 'Close sidebar');
            }
        });
    });
}

// ================================================================
// BOOTSTRAP
// ================================================================
function init() {
    initSidebar();

    const overlay = document.getElementById('actionSummaryOverlay');
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === this) window.closeActionSummary();
        });
    }

    document.addEventListener('click', (e) => {
        if (activeMenuEl && !activeMenuEl.contains(e.target)) closeOpenMenu();
    });

    window.initPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
