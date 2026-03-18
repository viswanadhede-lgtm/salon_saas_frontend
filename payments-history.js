/**
 * Payments History JavaScript
 * Handles the logic for rendering the payments history table, 
 * filtering, sorting, exporting, and the slide-out payment detail drawer.
 */

// Dummy Data matching user's exact specification
const paymentsData = [
    { paymentId: 'PAY-3012', bookingId: 'BK-2041', customer: 'Emma Watson', service: 'Hair Color & Styling', date: 'Mar 13, 10:45 AM', amount: 1500, method: 'Card', status: 'Completed', staff: 'Sarah', bookingTotal: 3200, bookingPaid: 1500, bookingDue: 1700 },
    { paymentId: 'PAY-3013', bookingId: 'BK-2041', customer: 'Emma Watson', service: 'Hair Color & Styling', date: 'Mar 13, 11:05 AM', amount: 1700, method: 'UPI', status: 'Completed', staff: 'Sarah', bookingTotal: 3200, bookingPaid: 3200, bookingDue: 0 },
    { paymentId: 'PAY-3014', bookingId: 'BK-2042', customer: 'Rahul Sharma', service: 'Men\'s Haircut', date: 'Mar 13, 11:50 AM', amount: 500, method: 'Cash', status: 'Completed', staff: 'Michael', bookingTotal: 500, bookingPaid: 500, bookingDue: 0 },
    { paymentId: 'PAY-3015', bookingId: 'BK-2043', customer: 'Priya Kapoor', service: 'Hair Spa Treatment', date: 'Mar 13, 02:10 PM', amount: 500, method: 'UPI', status: 'Completed', staff: 'Sarah', bookingTotal: 1500, bookingPaid: 500, bookingDue: 1000 },
    { paymentId: 'PAY-3016', bookingId: 'BK-2044', customer: 'Arjun Das', service: 'Beard Trim & Styling', date: 'Mar 13, 03:30 PM', amount: 300, method: 'Cash', status: 'Completed', staff: 'Michael', bookingTotal: 300, bookingPaid: 300, bookingDue: 0 },
    { paymentId: 'PAY-3017', bookingId: 'BK-2045', customer: 'Sophia Lee', service: 'Bridal Makeup', date: 'Mar 13, 04:15 PM', amount: 5000, method: 'Card', status: 'Completed', staff: 'Anjali', bookingTotal: 12000, bookingPaid: 5000, bookingDue: 7000 },
    { paymentId: 'PAY-3018', bookingId: 'BK-2046', customer: 'Vivaan Singh', service: 'Hair Relaxation', date: 'Mar 13, 05:00 PM', amount: 2500, method: 'UPI', status: 'Completed', staff: 'Anjali', bookingTotal: 2500, bookingPaid: 2500, bookingDue: 0 },
    { paymentId: 'PAY-3019', bookingId: 'BK-2047', customer: 'Kavya Reddy', service: 'Pedicure & Manicure', date: 'Mar 13, 06:20 PM', amount: 1200, method: 'Card', status: 'Completed', staff: 'Sarah', bookingTotal: 1200, bookingPaid: 1200, bookingDue: 0 },
    { paymentId: 'PAY-3020', bookingId: 'BK-2045', customer: 'Sophia Lee', service: 'Bridal Makeup', date: 'Mar 14, 09:30 AM', amount: 3000, method: 'UPI', status: 'Refunded', staff: 'Anjali', bookingTotal: 12000, bookingPaid: 8000, bookingDue: 4000 },
    { paymentId: 'PAY-3021', bookingId: 'BK-2048', customer: 'Rohan Gupta', service: 'Haircut & Wash', date: 'Mar 14, 11:00 AM', amount: 650, method: 'Cash', status: 'Completed', staff: 'Michael', bookingTotal: 650, bookingPaid: 650, bookingDue: 0 },
    { paymentId: 'PAY-3022', bookingId: 'BK-2049', customer: 'Neha Jain', service: 'Facial Treatment', date: 'Mar 14, 12:45 PM', amount: 1800, method: 'Card', status: 'Completed', staff: 'Sarah', bookingTotal: 1800, bookingPaid: 1800, bookingDue: 0 },
    { paymentId: 'PAY-3023', bookingId: 'BK-2050', customer: 'Vikram Singh', service: 'Tattoo Refill', date: 'Mar 15, 02:30 PM', amount: 2500, method: 'UPI', status: 'Refunded', staff: 'Michael', bookingTotal: 5000, bookingPaid: 2500, bookingDue: 2500 }
];

let phCurrentSort = { column: 'date', order: 'desc' };

document.addEventListener('DOMContentLoaded', () => {
    phRenderTable(paymentsData);

    // Search bar listener
    const searchInput = document.getElementById('phSearchInput');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            phApplyFilter();
        });
    }

    // Global click listener for closing dropdowns & drawer
    document.addEventListener('click', (e) => {
        // Close Filter Menu
        const filterMenu = document.getElementById('phFilterMenu');
        const filterBtn = filterMenu ? filterMenu.previousElementSibling : null;
        if (filterMenu && filterMenu.style.display === 'block') {
            if (!filterMenu.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
                filterMenu.style.display = 'none';
            }
        }

        // Close Date Menu
        const dateMenu = document.getElementById('phDateMenu');
        const dateBtn = dateMenu ? dateMenu.previousElementSibling : null;
        if (dateMenu && dateMenu.style.display === 'block') {
            if (!dateMenu.contains(e.target) && (!dateBtn || !dateBtn.contains(e.target))) {
                dateMenu.style.display = 'none';
            }
        }

        // Close Slide-out Drawer (if clicking on overlay but NOT inside the drawer)
        const drawerOverlay = document.getElementById('phDrawerOverlay');
        const sideDrawer = document.getElementById('phSideDrawer');
        if (drawerOverlay && drawerOverlay.classList.contains('active')) {
            // If the click is on the overlay itself (not children)
            if (e.target === drawerOverlay) {
                phCloseDrawer();
            }
        }
    });
});

// Format Indian Rupee
function formatINR(amount) {
    return '₹' + amount.toLocaleString('en-IN');
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
        // Method Badge
        let methodIcon = '';
        if(item.method === 'Card') methodIcon = '<i data-feather="credit-card" style="width:12px;height:12px"></i>';
        else if(item.method === 'UPI') methodIcon = '<i data-feather="smartphone" style="width:12px;height:12px"></i>';
        else methodIcon = '<i data-feather="dollar-sign" style="width:12px;height:12px"></i>';
        
        const methodBadge = `<span class="ph-badge-method ${item.method.toLowerCase()}">${methodIcon} ${item.method}</span>`;

        // Status Badge
        const statusBadge = `<span class="ph-badge-status ${item.status.toLowerCase()}">${item.status}</span>`;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="padding:16px 16px 16px 24px; font-weight:600; color:#1e293b;">${item.paymentId}</td>
            <td style="padding:16px; font-weight:500; color:#3b82f6; cursor:pointer;" onclick="phOpenBooking('${item.bookingId}')">${item.bookingId}</td>
            <td style="padding:16px; font-weight:500; color:#334155;">${item.customer}</td>
            <td style="padding:16px; color:#64748b;">${item.service}</td>
            <td style="padding:16px; font-weight:500; color:#334155;">${item.date}</td>
            <td style="padding:16px; font-weight:600; color:#10b981;">${formatINR(item.amount)}</td>
            <td style="padding:16px;">${methodBadge}</td>
            <td style="padding:16px;">${statusBadge}</td>
            <td style="padding:16px; font-weight:500; color:#475569;">${item.staff}</td>
            <td style="padding:16px 24px 16px 16px; text-align:right;">
                <button class="ph-btn-view" onclick="phOpenDrawer('${item.paymentId}')">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    feather.replace();
}

// Drawer Functions
function phOpenDrawer(paymentId) {
    const p = paymentsData.find(x => x.paymentId === paymentId);
    if(!p) return;

    // Populate data
    document.getElementById('drawerSubtitle').textContent = p.paymentId;
    document.getElementById('drawerPayId').textContent = p.paymentId;
    document.getElementById('drawerBookingId').textContent = p.bookingId;
    document.getElementById('drawerDate').textContent = p.date;
    document.getElementById('drawerStaff').textContent = p.staff;
    document.getElementById('drawerCustomer').textContent = p.customer;
    document.getElementById('drawerService').textContent = p.service;
    
    document.getElementById('drawerAmount').textContent = formatINR(p.amount);
    document.getElementById('drawerMethod').innerHTML = p.method === 'Card' ? '<span style="color:#3730a3"><i data-feather="credit-card" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Card</span>' : (p.method === 'UPI' ? '<span style="color:#86198f"><i data-feather="smartphone" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> UPI</span>' : '<span style="color:#475569"><i data-feather="dollar-sign" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Cash</span>');
    document.getElementById('drawerStatus').innerHTML = p.status === 'Completed' ? '<span style="color:#166534; background:#dcfce7; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Completed</span>' : p.status;

    document.getElementById('drawerBookTotal').textContent = formatINR(p.bookingTotal);
    document.getElementById('drawerBookPaid').textContent = formatINR(p.bookingPaid);
    document.getElementById('drawerBookDue').textContent = formatINR(p.bookingDue);

    feather.replace();

    const overlay = document.getElementById('phDrawerOverlay');
    const drawer = document.getElementById('phSideDrawer');
    overlay.style.display = 'block';
    
    // tiny delay for transition
    setTimeout(() => {
        overlay.classList.add('active');
        drawer.classList.add('active');
    }, 10);
}

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
function phApplyFilter() {
    const searchTerm = document.getElementById('phSearchInput').value.toLowerCase();
    
    const methods = Array.from(document.querySelectorAll('.ph-filter-method:checked')).map(cb => cb.value);
    const staffs = Array.from(document.querySelectorAll('.ph-filter-staff:checked')).map(cb => cb.value);
    const statuses = Array.from(document.querySelectorAll('.ph-filter-status:checked')).map(cb => cb.value);

    const filtered = paymentsData.filter(p => {
        const matchesSearch = p.paymentId.toLowerCase().includes(searchTerm) || 
                              p.bookingId.toLowerCase().includes(searchTerm) || 
                              p.customer.toLowerCase().includes(searchTerm);
        
        const matchesMethod = methods.length === 0 || methods.includes(p.method);
        const matchesStaff = staffs.length === 0 || staffs.includes(p.staff);
        const matchesStatus = statuses.length === 0 || statuses.includes(p.status);

        return matchesSearch && matchesMethod && matchesStaff && matchesStatus;
    });

    phRenderTable(filtered);
    document.getElementById('phFilterMenu').style.display = 'none';
}

function phClearFilter() {
    Array.from(document.querySelectorAll('.ph-filter-method, .ph-filter-staff, .ph-filter-status')).forEach(cb => cb.checked = false);
    document.getElementById('phSearchInput').value = '';
    phRenderTable(paymentsData);
    document.getElementById('phFilterMenu').style.display = 'none';
}

function phSetDateRange(label) {
    document.getElementById('phDateLabel').textContent = label;
    document.getElementById('phDateMenu').style.display = 'none';
    // Dummy UI update
}

function phExportData() {
    alert("Exporting payments history to CSV...");
}

function phPrintReceipt() {
    alert("Opening receipt printer...");
}

function phOpenBooking(bookingId) {
    // Navigate or open booking modal
    console.log("Opening booking: " + bookingId);
}
