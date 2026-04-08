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
        let methodIcon = '<i data-feather="dollar-sign" style="width:12px;height:12px"></i>';
        if(method === 'card') methodIcon = '<i data-feather="credit-card" style="width:12px;height:12px"></i>';
        else if(method === 'upi') methodIcon = '<i data-feather="smartphone" style="width:12px;height:12px"></i>';
        
        const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);
        const methodBadge = `<span class="ph-badge-method ${method}">${methodIcon} ${methodLabel}</span>`;

        const status = (item.status || 'paid').toLowerCase();
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        const statusBadge = `<span class="ph-badge-status ${status}">${statusLabel}</span>`;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        
        const displayDate = item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
        const displayPaymentId = item.payment_id ? item.payment_id.substring(0,8).toUpperCase() : '-';
        const displayBookingId = item.booking_id ? item.booking_id.substring(0,8).toUpperCase() : '-';

        tr.innerHTML = `
            <td style="padding:16px 16px 16px 24px; font-weight:600; color:#1e293b;">${displayPaymentId}</td>
            <td style="padding:16px; font-weight:500; color:#3b82f6; cursor:pointer;" onclick="window.phOpenBooking('${item.booking_id}')">${displayBookingId}</td>
            <td style="padding:16px; font-weight:500; color:#334155;">${item.customer_name || 'Guest'}</td>
            <td style="padding:16px; color:#64748b;">${item.service_name || '-'}</td>
            <td style="padding:16px; font-weight:500; color:#334155;">${displayDate}</td>
            <td style="padding:16px; font-weight:600; color:#10b981;">${formatINR(item.amount)}</td>
            <td style="padding:16px;">${methodBadge}</td>
            <td style="padding:16px;">${statusBadge}</td>
            <td style="padding:16px; font-weight:500; color:#475569;">${item.staff_name || '-'}</td>
            <td style="padding:16px 24px 16px 16px; text-align:right;">
                <button class="ph-btn-view" onclick="window.phOpenDrawer('${item.payment_id}')">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.feather) feather.replace();
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
    
    document.getElementById('drawerAmount').textContent = formatINR(p.amount);
    
    const method = (p.payment_method || 'Cash').toLowerCase();
    let methodHTML = '';
    if (method === 'card') methodHTML = '<span style="color:#3730a3"><i data-feather="credit-card" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Card</span>';
    else if (method === 'upi') methodHTML = '<span style="color:#86198f"><i data-feather="smartphone" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> UPI</span>';
    else methodHTML = '<span style="color:#475569"><i data-feather="dollar-sign" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Cash</span>';
    
    document.getElementById('drawerMethod').innerHTML = methodHTML;
    document.getElementById('drawerStatus').innerHTML = `<span style="color:#166534; background:#dcfce7; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${p.status || 'Paid'}</span>`;

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
