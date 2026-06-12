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
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 30px; text-align: center; color: #64748b;">No payment records found.</td></tr>`;
        return;
    }

    data.forEach(item => {
        const method = (item.payment_method || 'Cash').toLowerCase();
        
        const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);
        const methodBadge = `<span style="font-size: 0.8rem; font-weight: 500; color: #475569;">${methodLabel}</span>`;

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
        
        const displayDate = item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
        const displayPaymentId = item.payment_id ? item.payment_id.substring(0,8).toUpperCase() : '-';
        const displayBookingId = item.booking_id ? item.booking_id.substring(0,8).toUpperCase() : '-';

        let saleTotalDisplay = status === 'refunded'
            ? `<del style="color:#94a3b8; font-weight:400;">${formatINR(item.amount)}</del> <span style="color:#dc2626; font-size: 0.8rem; display:block;">Refunded</span>`
            : formatINR(item.amount);

        let serviceHtml = '-';
        const rawServices = (item.service_name || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rawServices.length === 1) {
            serviceHtml = `<span style="display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;" title="${rawServices[0]}">${rawServices[0]}</span>`;
        } else if (rawServices.length > 1) {
            const first = rawServices[0];
            const rest = rawServices.length - 1;
            const fullList = rawServices.join(', ');
            serviceHtml = `
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="event.stopPropagation(); const e=this.nextElementSibling; e.style.display=e.style.display==='none'?'block':'none'">
                        <span style="display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;" title="${first}">${first}</span>
                        <span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600; transition:background 0.2s;" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'">+${rest}</span>
                    </div>
                    <div style="display:none; font-size:0.8rem; color:#64748b; line-height:1.4; padding-left:2px; padding-top:2px; white-space:normal;">
                        ${fullList}
                    </div>
                </div>
            `;
        }

        tr.innerHTML = `
            <td style="padding:14px 16px 14px 24px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayPaymentId}</td>
            <td style="padding:14px 16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><span style="font-weight:600; cursor:pointer;" onclick="event.stopPropagation(); window.phOpenBooking('${item.booking_id}')">${displayBookingId}</span></td>
            <td style="padding:14px 16px; color:#1e293b; font-weight:500;">${item.customer_name || 'Guest'}</td>
            <td style="padding:14px 16px; color:#475569;">${serviceHtml}</td>
            <td style="padding:14px 16px; color:#475569;">${displayDate}</td>
            <td style="padding:14px 16px; font-weight:600; color:#059669;">${saleTotalDisplay}</td>
            <td style="padding:14px 16px;">${methodBadge}</td>
            <td style="padding:14px 16px;">
                 <span class="tb-status-pill ${statusPillClass}" style="text-transform: uppercase; font-size: 0.7rem;">${statusLabel}</span>
            </td>
            <td style="padding:14px 16px; color:#475569;">${item.staff_name || '-'}</td>
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
    const bookingId = p.booking_id ? p.booking_id.substring(0,8).toUpperCase() : '-';
    const displayDate = p.paid_at ? new Date(p.paid_at).toLocaleString('en-IN') : '-';

    // Populate data
    document.getElementById('drawerSubtitle').textContent = displayId;
    document.getElementById('drawerPayId').textContent = displayId;
    document.getElementById('drawerBookingId').textContent = bookingId;
    document.getElementById('drawerDate').textContent = displayDate;
    document.getElementById('drawerStaff').textContent = p.staff_name || '-';
    document.getElementById('drawerCustomer').textContent = p.customer_name || 'Guest';
    document.getElementById('drawerService').textContent = p.service_name || '-';
    
    const drawerAmountEl = document.getElementById('drawerAmount');
    if (drawerAmountEl) {
        drawerAmountEl.textContent = formatINR(p.amount);
        drawerAmountEl.style.color = status === 'refunded' ? '#ef4444' : '#10b981';
    }
    
    const method = (p.payment_method || 'Cash').toLowerCase();
    let methodHTML = '';
    if (method === 'card') methodHTML = '<span style="color:#3730a3"><i data-feather="credit-card" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Card</span>';
    else if (method === 'upi') methodHTML = '<span style="color:#86198f"><i data-feather="smartphone" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> UPI</span>';
    else methodHTML = '<span style="color:#475569"><i data-feather="dollar-sign" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Cash</span>';
    
    document.getElementById('drawerMethod').innerHTML = methodHTML;
    
    const statusBg = status === 'refunded' ? '#fee2e2' : '#dcfce7';
    const statusColor = status === 'refunded' ? '#991b1b' : '#166534';
    document.getElementById('drawerStatus').innerHTML = `<span style="color:${statusColor}; background:${statusBg}; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${p.status || 'Paid'}</span>`;

    // Simple display for totals (can be enhanced if view has these)
    document.getElementById('drawerBookTotal').textContent = formatINR(p.booking_total);
    document.getElementById('drawerBookPaid').textContent = formatINR(p.amount); // Simplification
    document.getElementById('drawerBookDue').textContent = formatINR(0);

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

        return matchesSearch && matchesMethod && matchesStatus;
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

window.phSetDateRange = function(label) {
    document.getElementById('phDateLabel').textContent = label;
    document.getElementById('phDateMenu').style.display = 'none';
    
    // Logic for actual date filtering can be added here
    const today = new Date();
    if (label === 'Today') {
        filteredPayments = allPayments.filter(p => new Date(p.paid_at).toDateString() === today.toDateString());
    } else if (label === 'This Month') {
        filteredPayments = allPayments.filter(p => new Date(p.paid_at).getMonth() === today.getMonth());
    } else {
        filteredPayments = allPayments;
    }
    phRenderTable(filteredPayments);
};

window.phExportData = function() {
    console.log("Exporting live payments history...");
};

window.phOpenBooking = function(bookingId) {
    console.log("Opening live booking detail: " + bookingId);
};
