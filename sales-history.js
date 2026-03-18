document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. MOCK DATA
    // ----------------------------------------------------------------------
    const initialSalesData = [
        { 
            id: 'SAL-1023', 
            customer: 'Emma Watson', 
            date: '2023-10-25 10:30 AM', 
            products: [
                { name: 'Argan Oil Serum', qty: 1, price: 1200, category: 'Hair care' },
                { name: 'Color Protect Shampoo', qty: 1, price: 850, category: 'Hair care' }
            ], 
            total: '₹2,050', 
            payment: 'card', 
            staff: 'Sarah',
            status: 'completed' 
        },
        { 
            id: 'SAL-1024', 
            customer: 'David Rodriguez', 
            date: '2023-10-25 11:45 AM', 
            products: [
                { name: 'Matte Clay Pomade', qty: 2, price: 550, category: 'Style products' }
            ], 
            total: '₹1,100', 
            payment: 'cash', 
            staff: 'Michael',
            status: 'completed' 
        },
        { 
            id: 'SAL-1025', 
            customer: 'Meera Patel', 
            date: '2023-10-25 12:30 PM', 
            products: [
                { name: 'Keratin Hair Mask', qty: 1, price: 1500, category: 'Hair care' }
            ], 
            total: '₹1,500', 
            payment: 'upi', 
            staff: 'Sarah',
            status: 'completed'  
        },
        { 
            id: 'SAL-1026', 
            customer: 'Amit Singh', 
            date: '2023-10-26 01:00 PM', 
            products: [
                { name: 'Tea Tree Face Wash', qty: 1, price: 350, category: 'Skin care' },
                { name: 'Vitamin C Serum', qty: 1, price: 900, category: 'Skin care' }
            ], 
            total: '₹1,250', 
            payment: 'card', 
            staff: 'Anjali',
            status: 'refunded'
        },
        { 
            id: 'SAL-1027', 
            customer: 'Priya Kapoor', 
            date: '2023-10-26 02:20 PM', 
            products: [
                { name: 'Heat Protection Spray', qty: 1, price: 650, category: 'Style products' }
            ], 
            total: '₹650', 
            payment: 'upi', 
            staff: 'Anjali',
            status: 'completed' 
        },
        { 
            id: 'SAL-1028', 
            customer: 'Rahul Mehta', 
            date: '2023-10-27 09:15 AM', 
            products: [
                { name: 'Beard Trimming Oil', qty: 1, price: 450, category: 'Style products' }
            ], 
            total: '₹450', 
            payment: 'cash', 
            staff: 'Michael',
            status: 'completed' 
        },
        { 
            id: 'SAL-1029', 
            customer: 'Nisha Reddy', 
            date: '2023-10-27 04:30 PM', 
            products: [
                { name: 'Bridal Glow Kit', qty: 1, price: 4500, category: 'Skin care' }
            ], 
            total: '₹4,500', 
            payment: 'card', 
            staff: 'Sarah',
            status: 'completed' 
        }
    ];

    let currentSalesData = [...initialSalesData];
    let activeMenuEl = null;
    let currentActionData = null; // { action, idx, sale }


    // ----------------------------------------------------------------------
    // 2. DOM ELEMENTS
    // ----------------------------------------------------------------------
    const tableBody = document.getElementById('hsTableBody');
    const searchInput = document.getElementById('hsSearchInput');
    
    // Filter Dropdown
    const filterBtn = document.getElementById('hsFilterBtn');
    const filterMenu = document.getElementById('hsFilterMenu');
    const applyFiltersBtn = document.getElementById('hsApplyFilters');
    
    // Date Dropdown
    const dateBtn = document.getElementById('hsDateBtn');
    const dateMenu = document.getElementById('hsDateMenu');
    
    // Export Dropdown
    const exportBtn = document.getElementById('hsExportBtn');
    const exportMenu = document.getElementById('hsExportMenu');

    // Modals & Overlays
    const saleDetailsModalOverlay = document.getElementById('saleDetailsModalOverlay');
    const closeSaleDetailsModal = document.getElementById('closeSaleDetailsModal');
    const closeSaleDetailsBtn = document.getElementById('closeSaleDetailsBtn');
    
    const refundSummaryOverlay = document.getElementById('refundSummaryOverlay');
    const cancelRefundBtn = document.getElementById('cancelRefundBtn');
    const confirmRefundBtn = document.getElementById('confirmRefundBtn');

    // Sale Details Content Fields
    const sdSubtitle = document.getElementById('sdSubtitle');
    const sdCustomer = document.getElementById('sdCustomer');
    const sdStaff = document.getElementById('sdStaff');
    const sdDate = document.getElementById('sdDate');
    const sdPayment = document.getElementById('sdPayment');
    const sdItemsList = document.getElementById('sdItemsList');
    const sdSubtotal = document.getElementById('sdSubtotal');
    const sdTax = document.getElementById('sdTax');
    const sdDiscount = document.getElementById('sdDiscount');
    const sdTotal = document.getElementById('sdTotal');
    const sdPrintBtn = document.getElementById('sdPrintBtn');
    const sdRefundBtn = document.getElementById('sdRefundBtn');


    // ----------------------------------------------------------------------
    // 3. INITIALIZATION
    // ----------------------------------------------------------------------
    initPage();

    function initPage() {
        if (typeof feather !== 'undefined') feather.replace();
        renderTable();
        setupEventListeners();
    }

    // ----------------------------------------------------------------------
    // 4. RENDER TABLE
    // ----------------------------------------------------------------------
    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (currentSalesData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding: 40px; color: #64748b;">
                        <i data-feather="inbox" style="width: 32px; height: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                        <p>No sales records found matching your filters.</p>
                    </td>
                </tr>
            `;
            if (typeof feather !== 'undefined') feather.replace();
            return;
        }

        currentSalesData.forEach((sale, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'tb-row';
            tr.style.cursor = 'pointer';

            // Payment styling
            let paymentClass = 'tb-payment-pending';
            if (sale.payment === 'card') paymentClass = 'tb-payment-paid';
            if (sale.payment === 'upi') paymentClass = 'tb-payment-paid';
            if (sale.payment === 'cash') paymentClass = 'tb-payment-paid';

            // Handle refunded UI
            let isRefunded = sale.status === 'refunded';
            let saleTotalDisplay = isRefunded ? `<del style="color:#94a3b8; font-weight:400;">${sale.total}</del> <span style="color:#dc2626; font-size: 0.8rem; display:block;">Refunded</span>` : sale.total;

            const prodCountStr = sale.products.length === 1 ? '1 item' : `${sale.products.length} items`;
            
            // Allow row click to open details
            tr.onclick = (e) => {
                if (!e.target.closest('.tb-action-btn') && !e.target.closest('.tb-actions-menu')) {
                    openSaleDetails(sale);
                }
            };

            tr.innerHTML = `
                <td style="padding:12px 12px 12px 24px; color:#3b82f6; font-weight:500;">${sale.id}</td>
                <td style="padding:12px 12px; color:#1e293b; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sale.customer}</td>
                <td style="padding:12px 12px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sale.date}</td>
                <td style="padding:12px 12px; color:#475569;">${prodCountStr}</td>
                <td style="padding:12px 12px; font-weight:600; color:#1e293b;">${saleTotalDisplay}</td>
                <td style="padding:12px 12px;">
                    <span class="tb-status-pill ${paymentClass}" style="text-transform: uppercase; font-size: 0.7rem;">${sale.payment}</span>
                </td>
                <td style="padding:12px 12px; color:#475569;">${sale.staff}</td>
                <td style="padding:12px 24px 12px 12px;">
                    <button class="tb-action-btn" onclick="toggleSaleMenu(event, ${idx})">
                        Actions
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
        
        if (typeof feather !== 'undefined') feather.replace();
    }


    // ----------------------------------------------------------------------
    // 5. EVENT LISTENERS & FILTERING
    // ----------------------------------------------------------------------
    function setupEventListeners() {
        // --- Search ---
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                currentSalesData = initialSalesData.filter(s => 
                    s.id.toLowerCase().includes(term) || 
                    s.customer.toLowerCase().includes(term) ||
                    s.products.some(p => p.name.toLowerCase().includes(term))
                );
                renderTable();
            });
        }

        // Dropdown toggles are handled by inline onclick="hsToggleMenu(...)" on the buttons.
        // This document listener only handles closing menus on outside-click.
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (activeMenuEl && !activeMenuEl.contains(e.target)) closeOpenActionMenu();
            
            if (filterMenu && filterMenu.style.display === 'block' && !filterMenu.contains(e.target) && e.target !== filterBtn) {
                filterMenu.style.display = 'none';
            }
            if (dateMenu && dateMenu.style.display === 'block' && !dateMenu.contains(e.target) && e.target !== dateBtn) {
                dateMenu.style.display = 'none';
            }
            if (exportMenu && exportMenu.style.display === 'block' && !exportMenu.contains(e.target) && e.target !== exportBtn) {
                exportMenu.style.display = 'none';
            }
        });

        function closeAllDropdowns() {
            if (filterMenu) filterMenu.style.display = 'none';
            if (dateMenu) dateMenu.style.display = 'none';
            if (exportMenu) exportMenu.style.display = 'none';
            closeOpenActionMenu();
        }

        // --- Filter Apply logic (demo) ---
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                showToast('Filters applied. (Demo)', '#3b82f6');
                filterMenu.style.display = 'none';
                // In a real app we would read checkboxes here
            });
        }
        
        // --- Export logic ---
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => { showToast('Exporting as CSV...', '#10b981'); });
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => { showToast('Exporting as Excel...', '#10b981'); });

        // --- Modal Close Listeners ---
        function closeSaleModal() {
            if (saleDetailsModalOverlay) saleDetailsModalOverlay.style.display = 'none';
            currentActionData = null;
        }

        if (closeSaleDetailsModal) closeSaleDetailsModal.addEventListener('click', closeSaleModal);
        if (closeSaleDetailsBtn) closeSaleDetailsBtn.addEventListener('click', closeSaleModal);
        if (saleDetailsModalOverlay) {
            saleDetailsModalOverlay.addEventListener('click', (e) => {
                if (e.target === saleDetailsModalOverlay) closeSaleModal();
            });
        }

        // --- Refund Overlay Listeners ---
        function closeRefundModal() {
            if (refundSummaryOverlay) refundSummaryOverlay.style.display = 'none';
        }
        
        if (cancelRefundBtn) cancelRefundBtn.addEventListener('click', closeRefundModal);
        if (refundSummaryOverlay) {
            refundSummaryOverlay.addEventListener('click', (e) => {
                if (e.target === refundSummaryOverlay) closeRefundModal();
            });
        }

        if (sdRefundBtn) {
            sdRefundBtn.addEventListener('click', () => {
                refundSummaryOverlay.style.display = 'flex';
            });
        }

        if (confirmRefundBtn) {
            confirmRefundBtn.addEventListener('click', processRefund);
        }

        if (sdPrintBtn) {
            sdPrintBtn.addEventListener('click', () => {
                window.print();
            });
        }
    }


    // ----------------------------------------------------------------------
    // 6. ACTIONS MENU LOGIC
    // ----------------------------------------------------------------------
    window.toggleSaleMenu = function(e, idx) {
        e.stopPropagation();
        closeOpenActionMenu();

        const sale = currentSalesData[idx];
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();

        const menu = document.createElement('div');
        menu.className = 'tb-actions-menu';
        menu.id = 'tbActiveMenu';

        const isRefunded = sale.status === 'refunded';

        if (isRefunded) {
             menu.innerHTML = `
                <button class="tb-menu-item" onclick="handleSaleAction('view', ${idx})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View Details
                </button>
            `;
        } else {
             menu.innerHTML = `
                <button class="tb-menu-item" onclick="handleSaleAction('view', ${idx})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View Details
                </button>
                <button class="tb-menu-item" onclick="handleSaleAction('print', ${idx})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print Receipt
                </button>
                <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
                <button class="tb-menu-item danger" onclick="handleSaleAction('refund', ${idx})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                    Refund Sale
                </button>
            `;
        }

        document.body.appendChild(menu);
        activeMenuEl = menu;

        const menuH = isRefunded ? 46 : 130; 
        let top = rect.bottom + 6;
        if (top + menuH > window.innerHeight - 8) top = window.innerHeight - menuH - 8;
        let left = rect.right - 192;
        if (left < 8) left = rect.left;

        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
    };

    function closeOpenActionMenu() {
        if (activeMenuEl) { activeMenuEl.remove(); activeMenuEl = null; }
    }

    // ----------------------------------------------------------------------
    // 7. HANDLE SALE ACTIONS
    // ----------------------------------------------------------------------
    window.handleSaleAction = function(action, idx) {
        closeOpenActionMenu();
        const sale = currentSalesData[idx];
        currentActionData = { action, idx, sale };

        if (action === 'view') {
            openSaleDetails(sale);
        } else if (action === 'print') {
            openSaleDetails(sale);
            setTimeout(() => window.print(), 300); // Demo open modal then trigger print
        } else if (action === 'refund') {
            openSaleDetails(sale);
            refundSummaryOverlay.style.display = 'flex';
        }
    };

    // ----------------------------------------------------------------------
    // FILTER: Apply & Clear (called from HTML onclick)
    // ----------------------------------------------------------------------
    window.hsApplyFilter = function() {
        document.getElementById('hsFilterMenu').style.display = 'none';

        // Read checked values per group
        const allCbs = document.querySelectorAll('.hs-filter-cb');
        const payments  = [], staff = [], categories = [];
        allCbs.forEach(cb => {
            if (!cb.checked) return;
            const val = cb.value;
            if (['cash','card','upi'].includes(val))                     payments.push(val);
            if (['Sarah','Michael','Anjali'].includes(val))              staff.push(val);
            if (['Hair care','Skin care','Style products'].includes(val)) categories.push(val);
        });

        // If a group has nothing checked, treat it as "show all" for that group
        currentSalesData = initialSalesData.filter(sale => {
            const paymentOk  = payments.length === 0   || payments.includes(sale.payment);
            const staffOk    = staff.length === 0      || staff.includes(sale.staff);
            const categoryOk = categories.length === 0 || sale.products.some(p => categories.includes(p.category));
            return paymentOk && staffOk && categoryOk;
        });

        renderTable();
    };

    window.hsClearFilter = function() {
        document.querySelectorAll('.hs-filter-cb').forEach(cb => cb.checked = false);
        currentSalesData = [...initialSalesData];
        renderTable();
        document.getElementById('hsFilterMenu').style.display = 'none';
    };


    // ----------------------------------------------------------------------
    // 8. POPULATE SALE DETAILS MODAL
    // ----------------------------------------------------------------------
    function openSaleDetails(sale) {
        if (!sale) return;
        currentActionData = { action: 'view', idx: currentSalesData.indexOf(sale), sale };

        sdSubtitle.textContent = `Transaction ID: ${sale.id}`;
        sdCustomer.textContent = sale.customer;
        sdStaff.textContent = sale.staff;
        sdDate.textContent = sale.date;
        sdPayment.textContent = sale.payment.charAt(0).toUpperCase() + sale.payment.slice(1);

        // Populate items
        sdItemsList.innerHTML = '';
        let calcSubtotal = 0;

        sale.products.forEach(item => {
            const itemRowTotal = item.qty * item.price;
            calcSubtotal += itemRowTotal;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color: #1e293b;">${item.name}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569; text-align: center;">${item.qty}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569; text-align: right;">₹${item.price.toLocaleString()}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; font-weight: 600; color: #1e293b; text-align: right;">₹${itemRowTotal.toLocaleString()}</td>
            `;
            sdItemsList.appendChild(tr);
        });

        // Calculate Totals (Mocking tax & discount logic simple)
        let tax = calcSubtotal * 0.18; // Example 18% GST mock
        let discount = 0; 
        let finalTotal = calcSubtotal + tax - discount;

        // Note: For simplicity, checking if the hardcoded display matches rough math, 
        // in a real app these strings come from the DB. We'll reuse the exact sale.total string.
        sdSubtotal.textContent = `₹${calcSubtotal.toLocaleString()}`;
        sdTax.textContent = `~ ₹${Math.round(tax).toLocaleString()} std tax inc.`;
        sdDiscount.textContent = '₹0';
        
        let isRefunded = sale.status === 'refunded';
        
        if (isRefunded) {
            sdTotal.innerHTML = `<del style="color:#94a3b8; font-weight:400; margin-right: 8px;">${sale.total}</del> <span style="color:#dc2626;">Refunded</span>`;
            sdRefundBtn.style.display = 'none'; // hide refund button if already refunded
        } else {
            sdTotal.textContent = sale.total;
            sdRefundBtn.style.display = 'inline-flex';
        }

        saleDetailsModalOverlay.style.display = 'flex';
    }


    // ----------------------------------------------------------------------
    // 9. PROCESS REFUND
    // ----------------------------------------------------------------------
    function processRefund() {
        if (!currentActionData || !currentActionData.sale) return;
        
        const { idx, sale } = currentActionData;
        
        // Update data
        initialSalesData.find(s => s.id === sale.id).status = 'refunded';

        // Re-render
        renderTable();
        closeRefundOverlayOnly();
        
        // Update modal logic UI immediately
        sdTotal.innerHTML = `<del style="color:#94a3b8; font-weight:400; margin-right: 8px;">${sale.total}</del> <span style="color:#dc2626;">Refunded</span>`;
        sdRefundBtn.style.display = 'none';

        showToast(`${sale.customer}'s purchase (${sale.id}) has been refunded.`, '#dc2626');
    }

    function closeRefundOverlayOnly() {
        if (refundSummaryOverlay) refundSummaryOverlay.style.display = 'none';
    }


    // ----------------------------------------------------------------------
    // 10. TOAST NOTIFICATION
    // ----------------------------------------------------------------------
    function showToast(msg, color) {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        if (color) toast.style.background = color;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});

// ─── EXPORT FUNCTION (global so onclick can call it) ────────────────────────
function hsExportData(format) {
    // Gather rows from the table body
    const rows = [];
    const headers = ['Sale ID', 'Customer', 'Date', 'Products', 'Total', 'Payment', 'Staff'];
    rows.push(headers);

    const tbody = document.getElementById('hsTableBody');
    if (tbody) {
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length >= 7) {
                rows.push([
                    cells[0].innerText.trim(),
                    cells[1].innerText.trim(),
                    cells[2].innerText.trim(),
                    cells[3].innerText.trim(),
                    cells[4].innerText.trim(),
                    cells[5].innerText.trim(),
                    cells[6].innerText.trim()
                ]);
            }
        });
    }

    if (format === 'csv') {
        const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sales-history.csv';
        a.click();
        URL.revokeObjectURL(url);
    } else {
        // Excel-compatible HTML table export
        let xls = '<table border="1">';
        rows.forEach((r, i) => {
            xls += '<tr>';
            r.forEach(v => {
                xls += i === 0 ? `<th>${v}</th>` : `<td>${v}</td>`;
            });
            xls += '</tr>';
        });
        xls += '</table>';
        const blob = new Blob([xls], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sales-history.xls';
        a.click();
        URL.revokeObjectURL(url);
    }
}
