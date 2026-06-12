import { supabase } from './lib/supabase.js';

/**
 * Payments History JavaScript
 * Handles the logic for rendering the payments history table, 
 * filtering, sorting, exporting, and the slide-out payment detail drawer.
 */

// Global State
let allPayments = [];
let filteredPayments = [];
let phCurrentSort = { column: 'paid_at', order: 'desc' };
let currentFilterDateRange = { type: 'all' };

document.addEventListener('DOMContentLoaded', async () => {
    
    // Search bar listener
    const searchInput = document.getElementById('phSearchInput');
    if(searchInput) {
        searchInput.addEventListener('input', () => {
            phApplyFilter();
        });
    }

    // Initial Fetch
    await fetchPaymentHistory();

    // Global click listener for ... (existing logic)
    document.addEventListener('click', (e) => {
        // ... same click logic ...
    });
});

// --- Supabase Interaction ---
async function fetchPaymentHistory() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        const companyId = ctx.company?.id || localStorage.getItem('company_id');
        const branchId = localStorage.getItem('active_branch_id');

        if (!companyId) return;

        let query = supabase
            .from('payment_history_view')
            .select('*')
            .eq('company_id', companyId);

        if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;
        if (error) throw error;

        allPayments = data || [];
        phRenderTable(allPayments);

    } catch (err) {
        console.error('Error fetching history:', err);
    }
}

// Format Indian Rupee
function formatINR(amount) {
    if (amount === undefined || amount === null) return '₹0';
    return '₹' + Number(amount).toLocaleString('en-IN');
}

// Render Table
function phRenderTable(data) {
    const tbody = document.getElementById('phTableBody');
    if(!tbody) return;

    tbody.innerHTML = '';

    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="padding: 30px; text-align: center; color: #64748b;">No payment records found.</td></tr>`;
        return;
    }

    data.forEach(item => {
        const method = (item.payment_method || 'Cash').toLowerCase();
        const methodLabel = method === 'card' ? 'Card' : method === 'upi' ? 'UPI' : 'Cash';
        const methodBadge = `<span style="font-size:0.8rem; font-weight:500; color:#475569;">${methodLabel}</span>`;

        const status = (item.status || 'paid').toLowerCase();
        const statusLabel = status.toUpperCase();
        let statusPillClass = 'tb-payment-paid';
        if (status === 'unpaid' || status === 'pending') statusPillClass = 'tb-payment-pending';
        else if (status === 'partial') statusPillClass = 'tb-payment-partial';
        else if (status === 'refunded') statusPillClass = 'tb-payment-unpaid';

        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
            if (!e.target.closest('button') && !e.target.closest('.action-cell')) {
                window.phOpenDrawer(item.payment_id);
            }
        };

        // Date & Time
        let displayDateTime = '-';
        if (item.paid_at) {
            const d = new Date(item.paid_at);
            const datePart = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
            let hrs = d.getHours(), mins = d.getMinutes();
            const ampm = hrs >= 12 ? 'pm' : 'am';
            hrs = hrs % 12 || 12;
            const minStr = mins.toString().padStart(2,'0');
            displayDateTime = `${datePart}, ${hrs}:${minStr} ${ampm}`;
        }

        // Type badge
        const typeVal = item.type || '-';
        const typeColor = typeVal === 'Service' ? { bg:'#dbeafe', color:'#1d4ed8' }
                       : typeVal === 'Product'  ? { bg:'#fef9c3', color:'#92400e' }
                       : typeVal === 'Membership' ? { bg:'#f3e8ff', color:'#7e22ce' }
                       : { bg:'#f1f5f9', color:'#475569' };
        const typeBadge = `<span style="display:inline-block; padding:2px 10px; background:${typeColor.bg}; color:${typeColor.color}; border-radius:9999px; font-size:0.72rem; font-weight:600;">${typeVal}</span>`;

        // Item (item_name)
        const itemName = item.item_name || '-';
        const itemHtml = `<span style="display:inline-block; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;" title="${itemName}">${itemName}</span>`;

        // Original Amount
        const origAmtHtml = `<span style="color:#475569; font-size:0.85rem;">${formatINR(item.original_amount)}</span>`;

        // Discount
        let discountHtml = '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
        const discAmt = parseFloat(item.discount_amount || 0);
        if (discAmt > 0) {
            const discName = item.discount_name ? `<span style="display:block; font-size:0.7rem; color:#94a3b8;">${item.discount_name}</span>` : '';
            discountHtml = `<span style="color:#dc2626; font-weight:600; font-size:0.82rem;">-${formatINR(discAmt)}</span>${discName}`;
        }

        // Final Amount (green pill)
        const finalAmtHtml = status === 'refunded'
            ? `<del style="color:#94a3b8; font-weight:400;">${formatINR(item.final_amount)}</del><span style="color:#dc2626; font-size:0.75rem; display:block;">Refunded</span>`
            : `<span style="display:inline-block; padding:4px 12px; background:#d1fae5; color:#059669; border:1px solid #a7f3d0; border-radius:9999px; font-size:0.75rem; font-weight:700;">${formatINR(item.final_amount)}</span>`;

        // Staff
        let staffHtml = '-';
        const rawStaff = (item.staff_name || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rawStaff.length === 1) {
            staffHtml = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:500;">${rawStaff[0]}</span>`;
        } else if (rawStaff.length > 1) {
            const firstS = rawStaff[0]; const restS = rawStaff.length - 1; const fullListS = rawStaff.join(', ');
            staffHtml = `<div style="display:flex; flex-direction:column; gap:4px;"><div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="event.stopPropagation(); const e=this.nextElementSibling; e.style.display=e.style.display==='none'?'block':'none'"><span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:500;">${firstS}</span><span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:12px; font-size:0.7rem; font-weight:600; border:1px solid #cbd5e1;">+${restS}</span></div><div style="display:none; font-size:0.75rem; color:#64748b; line-height:1.4; padding-left:2px; padding-top:2px; white-space:normal;">${fullListS}</div></div>`;
        }

        tr.innerHTML = `
            <td style="padding:14px 16px 14px 24px; color:#475569; font-size:0.83rem; white-space:nowrap;">${displayDateTime}</td>
            <td style="padding:14px 16px; color:#1e293b; font-weight:500;">${item.customer_name || 'Guest'}</td>
            <td style="padding:14px 16px;">${typeBadge}</td>
            <td style="padding:14px 16px; color:#475569;">${itemHtml}</td>
            <td style="padding:14px 16px;">${origAmtHtml}</td>
            <td style="padding:14px 16px;">${discountHtml}</td>
            <td style="padding:14px 16px;">${finalAmtHtml}</td>
            <td style="padding:14px 16px;">${methodBadge}</td>
            <td style="padding:14px 16px;">${staffHtml}</td>
            <td style="padding:14px 16px;">
                <span class="tb-status-pill ${statusPillClass}" style="text-transform:uppercase; font-size:0.7rem;">${statusLabel}</span>
            </td>
            <td style="padding:14px 16px; text-align:center;" class="action-cell">
                <button onclick="event.stopPropagation(); window.phOpenDrawer('${item.payment_id}')" title="View Details" style="background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; color:#64748b; padding:6px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; margin-left:auto; margin-right:auto;" onmouseover="this.style.background='#e0e7ff'; this.style.color='#4f46e5'; this.style.borderColor='#c7d2fe';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b'; this.style.borderColor='#e2e8f0';">
                    <i data-feather="file-text" style="width:14px; height:14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.feather) feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

// Drawer Functions
window.phOpenDrawer = function(paymentId) {
    const p = allPayments.find(x => x.payment_id === paymentId);
    if(!p) return;

    const displayId = p.payment_id.substring(0,8).toUpperCase();
    const displayDate = p.paid_at ? new Date(p.paid_at).toLocaleString('en-IN') : '-';
    const pStatus = (p.status || 'paid').toLowerCase();

    // Populate data
    document.getElementById('drawerSubtitle').textContent = `${p.type || ''} — ${displayId}`;
    document.getElementById('drawerPayId').textContent = displayId;
    const bookingIdEl = document.getElementById('drawerBookingId');
    if (bookingIdEl) bookingIdEl.textContent = p.payment_id ? p.payment_id.substring(0,8).toUpperCase() : '-';
    document.getElementById('drawerDate').textContent = displayDate;
    document.getElementById('drawerStaff').textContent = p.staff_name || '-';
    document.getElementById('drawerCustomer').textContent = p.customer_name || 'Guest';
    document.getElementById('drawerService').textContent = `${p.type || ''}: ${p.item_name || '-'}`;
    
    const drawerAmountEl = document.getElementById('drawerAmount');
    if (drawerAmountEl) {
        drawerAmountEl.textContent = formatINR(p.final_amount);
        drawerAmountEl.style.color = pStatus === 'refunded' ? '#ef4444' : '#10b981';
    }
    
    const method = (p.payment_method || 'Cash').toLowerCase();
    let methodHTML = '';
    if (method === 'card') methodHTML = '<span style="color:#3730a3"><i data-feather="credit-card" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Card</span>';
    else if (method === 'upi') methodHTML = '<span style="color:#86198f"><i data-feather="smartphone" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> UPI</span>';
    else methodHTML = '<span style="color:#475569"><i data-feather="dollar-sign" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Cash</span>';
    document.getElementById('drawerMethod').innerHTML = methodHTML;
    
    const statusBg = pStatus === 'refunded' ? '#fee2e2' : '#dcfce7';
    const statusColor = pStatus === 'refunded' ? '#991b1b' : '#166534';
    document.getElementById('drawerStatus').innerHTML = `<span style="color:${statusColor}; background:${statusBg}; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${p.status || 'Paid'}</span>`;

    const drawerBookTotalEl = document.getElementById('drawerBookTotal');
    const drawerBookPaidEl = document.getElementById('drawerBookPaid');
    const drawerBookDueEl = document.getElementById('drawerBookDue');
    if (drawerBookTotalEl) drawerBookTotalEl.textContent = formatINR(p.original_amount);
    if (drawerBookPaidEl) drawerBookPaidEl.textContent = `${formatINR(p.final_amount)} (Discount: ${formatINR(p.discount_amount || 0)})`;
    if (drawerBookDueEl) drawerBookDueEl.textContent = formatINR(0);

    if (window.feather) feather.replace();

    const overlay = document.getElementById('phDrawerOverlay');
    const drawer = document.getElementById('phSideDrawer');
    overlay.style.display = 'block';
    
    setTimeout(() => {
        overlay.classList.add('active');
        drawer.classList.add('active');
    }, 10);
};

function phCloseDrawer() {
    const overlay = document.getElementById('phDrawerOverlay');
    const drawer = document.getElementById('phSideDrawer');
    
    overlay.classList.remove('active');
    drawer.classList.remove('active');

    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

// Sorting
function phSortTable(column) {
    if(phCurrentSort.column === column) {
        phCurrentSort.order = phCurrentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        phCurrentSort.column = column;
        phCurrentSort.order = 'asc';
    }

    const sortedData = [...paymentsData].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // Handle string vs numbers
        if(typeof valA === 'string') valA = valA.toLowerCase();
        if(typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return phCurrentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return phCurrentSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    phRenderTable(sortedData);
}

// Filtering
window.phApplyFilter = function() {
    const searchTerm = document.getElementById('phSearchInput').value.toLowerCase();
    
    const methods = Array.from(document.querySelectorAll('.ph-filter-method:checked')).map(cb => cb.value.toLowerCase());
    const statuses = Array.from(document.querySelectorAll('.ph-filter-status:checked')).map(cb => cb.value.toLowerCase());

    filteredPayments = allPayments.filter(p => {
        const matchesSearch = (p.payment_id || '').toLowerCase().includes(searchTerm) || 
                              (p.booking_id || '').toLowerCase().includes(searchTerm) || 
                              (p.customer_name || '').toLowerCase().includes(searchTerm);
        
        const matchesMethod = methods.length === 0 || methods.includes((p.payment_method || '').toLowerCase());
        const matchesStatus = statuses.length === 0 || statuses.includes((p.status || '').toLowerCase());

        let matchesDate = true;
        if (currentFilterDateRange && currentFilterDateRange.type !== 'all' && p.paid_at) {
            const rowDate = new Date(p.paid_at); 
            const { from, to } = currentFilterDateRange;
            if (from && rowDate < from) matchesDate = false;
            if (to && rowDate > to) matchesDate = false;
        }

        return matchesSearch && matchesMethod && matchesStatus && matchesDate;
    });

    phRenderTable(filteredPayments);
    const menu = document.getElementById('phFilterMenu');
    if (menu) menu.style.display = 'none';
};

window.phClearFilter = function() {
    Array.from(document.querySelectorAll('.ph-filter-method, .ph-filter-staff, .ph-filter-status')).forEach(cb => cb.checked = false);
    const search = document.getElementById('phSearchInput');
    if (search) search.value = '';
    phRenderTable(allPayments);
    const menu = document.getElementById('phFilterMenu');
    if (menu) menu.style.display = 'none';
};

window.phFilterByDate = function(range) {
    const label = document.getElementById('phDateLabel');
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    let from = null;
    let to = null;

    if (range === 'today') {
        from = new Date(now);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        if (label) label.textContent = 'Today';
    } else if (range === 'week') {
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        if (label) label.textContent = 'Last 7 days';
    } else if (range === 'month') {
        from = new Date(now);
        from.setDate(from.getDate() - 30);
        if (label) label.textContent = 'Last 30 days';
    } else if (range === 'custom') {
        const fromInput = document.getElementById('phCustomFrom');
        const toInput   = document.getElementById('phCustomTo');
        if (fromInput && fromInput.value) from = new Date(fromInput.value + 'T00:00:00');
        if (toInput && toInput.value) {
            to = new Date(toInput.value + 'T23:59:59');
        }
        if (label) {
            const fmtDate = (val) => {
                if (!val) return '...';
                const d = new Date(val + 'T00:00:00');
                const day = d.getDate();
                const suffix = day === 1 || day === 21 || day === 31 ? 'st'
                             : day === 2 || day === 22 ? 'nd'
                             : day === 3 || day === 23 ? 'rd' : 'th';
                return `${day}${suffix} ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
            };
            label.textContent = `${fmtDate(fromInput?.value)} → ${fmtDate(toInput?.value)}`;
        }
    } else {
        if (label) label.textContent = 'Date Range';
    }

    currentFilterDateRange = { type: range, from: from, to: to };
    phApplyFilter();
};

window.phExportData = function() {
    console.log("Exporting live payments history...");
};

window.phOpenBooking = function(bookingId) {
    console.log("Opening live booking detail: " + bookingId);
};
