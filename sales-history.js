import { supabase } from './lib/supabase.js';

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. DATA STATE
    // ----------------------------------------------------------------------
    let initialSalesData = [];
    let currentSalesData = [];
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

    async function initPage() {
        if (typeof feather !== 'undefined') feather.replace();
        setupEventListeners();
        await fetchSalesHistory();
    }

    // ----------------------------------------------------------------------
    // SUPABASE: Fetch Sales History
    // ----------------------------------------------------------------------
    async function fetchSalesHistory() {
        if (!tableBody) return;
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding: 40px; color: #64748b;">
                    <i data-feather="loader" style="width: 32px; height: 32px; margin-bottom: 12px; animation: spin 1s linear infinite;"></i>
                    <p>Loading sales history...</p>
                </td>
            </tr>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
        `;
        if (typeof feather !== 'undefined') feather.replace();

        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId) return;

            // Fetch pre-grouped data from the optimized view
            const { data: salesList, error: salesError } = await supabase
                .from('sales_with_payment_status')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .order('sale_date', { ascending: false });

            if (salesError) throw salesError;

            // Map the view rows directly to our state
            initialSalesData = (salesList || []).map(row => {
                const d = new Date(row.sale_date);
                const formattedDate = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                    + ' ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

                return {
                    id: row.sale_id,
                    customer: row.customer_name || 'Walk-in',
                    customer_id: row.customer_id || null,
                    customer_phone: row.customer_phone || '',
                    date: formattedDate,
                    raw_date: d,
                    payment: (row.payment_method || 'other').toLowerCase(),
                    staff: row.staff_name || 'System',
                    status: (row.status || 'completed').toLowerCase(),
                    amount_paid: Number(row.amount_paid || 0),
                    payment_status: (row.payment_status || 'unpaid').toLowerCase(),
                    totalAmountNum: Number(row.total_amount || 0),
                    total: `₹${Number(row.total_amount || 0).toLocaleString('en-IN')}`,
                    item_count: Number(row.item_count || 1),
                    products_summary: row.product_list || '',
                    is_view_grouped: true 
                };
            });

            currentSalesData = [...initialSalesData];
            renderTable();

        } catch (err) {
            console.error('Error fetching sales history:', err);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding: 40px; color: #64748b;">
                        <i data-feather="alert-circle" style="width: 32px; height: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                        <p>Could not load sales history. Please try again.</p>
                        <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">${err.message || ''}</p>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 6px 16px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer;">Retry</button>
                    </td>
                </tr>
            `;
            if (typeof feather !== 'undefined') feather.replace();
        }
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
                    <td colspan="7" style="text-align:center; padding: 40px; color: #64748b;">
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

            // Dynamic payment status logic
            const payStatus = sale.payment_status || 'unpaid';
            let statusPillClass = 'tb-payment-pending'; // default for unpaid
            let statusLabel = payStatus.toUpperCase();

            if (payStatus === 'paid') statusPillClass = 'tb-payment-paid';
            else if (payStatus === 'partial') statusPillClass = 'tb-payment-partial';
            else if (payStatus === 'refunded') {
                statusPillClass = 'tb-payment-unpaid'; // use red for refund
                statusLabel = 'REFUNDED';
            }

            const isRefunded = payStatus === 'refunded';
            let saleTotalDisplay = isRefunded
                ? `<del style="color:#94a3b8; font-weight:400;">${sale.total}</del> <span style="color:#dc2626; font-size: 0.8rem; display:block;">Refunded</span>`
                : sale.total;

            const itemCount = sale.item_count || 1;
            const productDisplay = sale.products_summary || 'Product';

            tr.onclick = (e) => {
                if (!e.target.closest('button')) {
                    openSaleDetails(sale);
                }
            };

            tr.innerHTML = `
                <td style="padding:12px 12px 12px 24px; color:#1e293b; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sale.customer}</td>
                <td style="padding:12px 12px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sale.date}</td>
                <td style="padding:12px 12px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${productDisplay}</td>
                <td style="padding:12px 12px; color:#475569;">${itemCount}</td>
                <td style="padding:12px 12px; font-weight:600; color:#1e293b;">${saleTotalDisplay}</td>
                <td style="padding:12px 12px;">
                    <span class="tb-status-pill ${statusPillClass}" style="text-transform: uppercase; font-size: 0.7rem;">${statusLabel}</span>
                </td>
                <td style="padding:12px 12px; color:#475569;">${sale.staff}</td>
                <td style="padding:12px 24px 12px 12px;">
                    <div style="display:flex; gap:8px;">
                        <button class="act-view" style="width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; color:#64748b; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="View Sale Details" onmouseover="this.style.background='#f8fafc'; this.style.color='#3b82f6'" onmouseout="this.style.background='#fff'; this.style.color='#64748b'">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>

                        <button class="act-print" style="width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; color:#64748b; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Print Receipt" onmouseover="this.style.background='#f8fafc'; this.style.color='#10b981'" onmouseout="this.style.background='#fff'; this.style.color='#64748b'">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                        
                        <button class="act-refund" 
                            style="width:32px; height:32px; border-radius:8px; border:1px solid ${payStatus === 'unpaid' ? '#f1f5f9' : '#fecdd3'}; background:${payStatus === 'unpaid' ? '#f8fafc' : '#fff1f2'}; color:${payStatus === 'unpaid' ? '#cbd5e1' : '#ef4444'}; display:flex; align-items:center; justify-content:center; cursor:${payStatus === 'unpaid' ? 'not-allowed' : 'pointer'};" 
                            title="${payStatus === 'unpaid' ? 'Cannot refund pending sale' : 'Refund Sale'}" 
                            ${payStatus === 'unpaid' ? 'disabled' : ''}
                            onmouseover="${payStatus !== 'unpaid' ? "this.style.background='#fecdd3'" : ""}" 
                            onmouseout="${payStatus !== 'unpaid' ? "this.style.background='#fff1f2'" : ""}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                        </button>
                    </div>
                </td>
            `;

            // Setup listeners programmatically (safest approach for module scopes)
            tr.querySelector('.act-view')?.addEventListener('click', (e) => { e.stopPropagation(); handleSaleAction('view', idx); });
            tr.querySelector('.act-print')?.addEventListener('click', (e) => { e.stopPropagation(); handleSaleAction('print', idx); });
            tr.querySelector('.act-refund')?.addEventListener('click', (e) => { e.stopPropagation(); handleSaleAction('refund', idx); });

            tableBody.appendChild(tr);
        });

        if (typeof feather !== 'undefined') feather.replace();
    }


    // ----------------------------------------------------------------------
    // 5. EVENT LISTENERS & FILTERING
    // ----------------------------------------------------------------------
    function setupEventListeners() {
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                currentSalesData = initialSalesData.filter(s => 
                    String(s.id).toLowerCase().includes(term) || 
                    s.customer.toLowerCase().includes(term) ||
                    s.staff.toLowerCase().includes(term) ||
                    (s.products_summary || '').toLowerCase().includes(term)
                );
                renderTable();
            });
        }

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

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                showToast('Filters applied.', '#3b82f6');
                filterMenu.style.display = 'none';
            });
        }
        
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => { hsExportData('csv'); });
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => { hsExportData('excel'); });

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

        function closeRefundModal() {
            if (refundSummaryOverlay) refundSummaryOverlay.style.display = 'none';
        }
        
        const closeRefundBtnFooter = document.getElementById('closeRefundBtn');
        if (cancelRefundBtn) cancelRefundBtn.addEventListener('click', closeRefundModal);
        if (closeRefundBtnFooter) closeRefundBtnFooter.addEventListener('click', closeRefundModal);
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

        // --- Collect Payment Modal Listeners ---
        const closeCollectBtn = document.getElementById('closeCollectPaymentModal');
        const cancelCollectBtn = document.getElementById('cancelCollectBtn');
        const confirmCollectBtn = document.getElementById('confirmCollectBtn');
        const collectOverlay = document.getElementById('collectPaymentModalOverlay');

        const closeCollectModal = () => { if (collectOverlay) collectOverlay.style.display = 'none'; };
        if (closeCollectBtn) closeCollectBtn.addEventListener('click', closeCollectModal);
        if (cancelCollectBtn) cancelCollectBtn.addEventListener('click', closeCollectModal);
        if (collectOverlay) {
            collectOverlay.addEventListener('click', (e) => {
                if (e.target === collectOverlay) closeCollectModal();
            });
        }
        if (confirmCollectBtn) confirmCollectBtn.addEventListener('click', processProductPayment);

        // Payment Method selection for Collect Modal
        const cpPayBtns = document.querySelectorAll('#collectPaymentModalOverlay .pay-method-btn');
        cpPayBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                cpPayBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#fff';
                    b.style.borderColor = '#e2e8f0';
                });
                const target = e.currentTarget;
                target.classList.add('active');
                target.style.background = '#f0fdf4';
                target.style.borderColor = '#bbf7d0';
            });
        });

        // --- Refund Modal Listeners (updated) ---
        const closeRefundBtn = document.getElementById('closeRefundBtn');
        if (closeRefundBtn) closeRefundBtn.addEventListener('click', closeRefundModal);
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
    function handleSaleAction(action, idx) {
        try {
            closeOpenActionMenu();
            const sale = currentSalesData[idx];
            if (!sale) return;
            currentActionData = { action, idx, sale };

            if (action === 'view') {
                openSaleDetails(sale);
            } else if (action === 'collect') {
                openCollectPaymentModal(sale);
            } else if (action === 'refund') {
                openRefundModal(sale);
            } else if (action === 'print') {
                showToast('Preparing receipt printer...', '#10b981');
                window.print();
            }
        } catch (err) {
            console.error('[Action Error]', err);
            showToast('Unable to process action.', '#ef4444');
        }
    }
    window.handleSaleAction = handleSaleAction;
    
    // ----------------------------------------------------------------------
    // 7.1. COLLECT PAYMENT MODAL
    // ----------------------------------------------------------------------
    async function openCollectPaymentModal(sale) {
        if (!sale) return;
        
        const modal = document.getElementById('collectPaymentModalOverlay');
        const cpTotal = document.getElementById('cpTotal');
        const cpPaid = document.getElementById('cpPaid');
        const cpBalance = document.getElementById('cpBalance');
        const cpInput = document.getElementById('cpAmountInput');
        
        if (!modal) return;
        
        const total = sale.totalAmountNum || 0;
        const paid = sale.amount_paid || 0;
        const balance = Math.max(0, total - paid);
        
        if (cpTotal) cpTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
        if (cpPaid) cpPaid.textContent = `₹${paid.toLocaleString('en-IN')}`;
        if (cpBalance) cpBalance.textContent = `₹${balance.toLocaleString('en-IN')}`;
        if (cpInput) cpInput.value = balance;
        
        modal.style.display = 'flex';
        if (typeof feather !== 'undefined') feather.replace();
    }

    async function processProductPayment() {
        if (!currentActionData || !currentActionData.sale) return;
        const sale = currentActionData.sale;
        const amount = Number(document.getElementById('cpAmountInput')?.value || 0);
        const methodEl = document.querySelector('#collectPaymentModalOverlay .pay-method-btn.active');
        const method = methodEl ? methodEl.dataset.method : 'cash';
        
        if (amount <= 0) {
            showToast('Please enter a valid amount.', '#ef4444');
            return;
        }

        const btn = document.getElementById('confirmCollectBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Recording...'; }

        try {
            const { error } = await supabase
                .from('business_transactions')
                .insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    reference_id: sale.id,
                    reference_type: 'product',
                    amount: amount,
                    status: 'paid',
                    payment_method: method.toLowerCase(),
                    notes: `Partial payment for sale ${sale.id}`,
                    paid_at: new Date().toISOString()
                });

            if (error) throw error;

            showToast('Payment recorded successfully!', '#10b981');
            document.getElementById('collectPaymentModalOverlay').style.display = 'none';
            await fetchSalesHistory(); // Refresh to update badges
        } catch (err) {
            console.error('Error recording payment:', err);
            showToast('Failed to record payment.', '#ef4444');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Record Payment'; }
        }
    }

    // ----------------------------------------------------------------------
    // 7.2. REFUND MODAL
    // ----------------------------------------------------------------------
    let refundableAmount = 0;
    async function openRefundModal(sale) {
        if (!sale) return;
        const modal = document.getElementById('refundSummaryOverlay');
        const subtitle = document.getElementById('rfModalSubtitle');
        const amountDisplay = document.getElementById('rfAmountDisplay');
        const methodDisplay = document.getElementById('rfMethodDisplay');
        const noteField = document.getElementById('rfNote');
        const confirmBtn = document.getElementById('confirmRefundBtn');

        if (!modal) return;

        subtitle.textContent = `${sale.customer || 'Customer'} • ${sale.products_summary || 'Sale'}`;
        amountDisplay.textContent = 'Calculating...';
        methodDisplay.value = 'Loading...';
        noteField.value = '';

        modal.style.display = 'flex';

        try {
            // Fetch transactions for this sale from ledger
            const { data, error } = await supabase
                .from('business_transactions')
                .select('amount, payment_method, status')
                .eq('reference_id', sale.id)
                .eq('reference_type', 'product');

            if (error) throw error;

            // Sum up only actual payments and subtract refunds
            refundableAmount = (data || []).reduce((sum, tx) => {
                const val = Number(tx.amount || 0);
                const status = (tx.status || '').toLowerCase().trim();
                
                if (status === 'paid') return sum + val;
                if (status === 'refunded') return sum - val;
                return sum;
            }, 0);
            
            if (refundableAmount < 0) refundableAmount = 0;

            amountDisplay.textContent = `₹${refundableAmount.toLocaleString('en-IN')}`;
            
            // Use the last payment method as a hint
            const lastMethod = data && data.length > 0 ? data[data.length - 1].payment_method : 'Multiple';
            methodDisplay.value = lastMethod ? (lastMethod.charAt(0).toUpperCase() + lastMethod.slice(1)) : 'N/A';

            if (refundableAmount <= 0) {
                amountDisplay.style.color = '#94a3b8';
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = 'Nothing to Refund';
                }
            } else {
                amountDisplay.style.color = '#dc2626';
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Issue Refund';
                }
            }
        } catch (err) {
            console.error('[PP Refund] Error calculating balance:', err);
            amountDisplay.textContent = 'Error';
            amountDisplay.style.color = '#ef4444';
        }
        
        if (typeof feather !== 'undefined') feather.replace();
    }

    // ----------------------------------------------------------------------
    // FILTER: Apply & Clear (called from HTML onclick)
    // ----------------------------------------------------------------------
    window.hsApplyFilter = function() {
        document.getElementById('hsFilterMenu').style.display = 'none';

        const allCbs = document.querySelectorAll('.hs-filter-cb');
        const payments = [], staff = [], categories = [];
        allCbs.forEach(cb => {
            if (!cb.checked) return;
            const val = cb.value;
            if (['cash','card','upi'].includes(val))                     payments.push(val);
            if (['Sarah','Michael','Anjali'].includes(val))              staff.push(val);
            if (['Hair care','Skin care','Style products'].includes(val)) categories.push(val);
        });

        currentSalesData = initialSalesData.filter(sale => {
            const paymentOk  = payments.length === 0   || payments.includes(sale.payment);
            const staffOk    = staff.length === 0      || staff.includes(sale.staff);
            // Category filter can only be applied to line items.
            // Since the main list is grouped, category filtering is disabled here.
            return paymentOk && staffOk;
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
    async function openSaleDetails(sale) {
        if (!sale) return;
        currentActionData = { action: 'view', idx: currentSalesData.indexOf(sale), sale };

        if (sdSubtitle && sale.id) sdSubtitle.textContent = `Transaction ID: ${String(sale.id).substring(0,8).toUpperCase()}`;
        if (sdCustomer) sdCustomer.textContent = sale.customer;
        if (sdStaff) sdStaff.textContent = sale.staff;
        if (sdDate) sdDate.textContent = sale.date;
        if (sdPayment) sdPayment.textContent = sale.payment.toUpperCase();

        const sdItemCountEl = document.getElementById('sdItemCount');
        if (sdItemCountEl) sdItemCountEl.textContent = sale.item_count || 1;

        if (sdItemsList) {
            sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">Loading items...</td></tr>`;
        }
        
        if (saleDetailsModalOverlay) saleDetailsModalOverlay.style.display = 'flex';
        if (typeof feather !== 'undefined') feather.replace();

        try {
            // Fetch actual line items from 'sales' table for this sale_id
            const { data: items, error } = await supabase
                .from('sales')
                .select('*')
                .eq('sale_id', sale.id);

            if (error) throw error;

            if (sdItemsList) {
                sdItemsList.innerHTML = '';
                let subtotal = 0;

                (items || []).forEach(item => {
                    const lineTotal = Number(item.total_amount || 0);
                    subtotal += lineTotal;

                    const row = document.createElement('tr');
                    row.style.borderBottom = '1px solid #f1f5f9';
                    row.innerHTML = `
                        <td style="padding:12px 16px; font-size:0.875rem; color:#334155;">${item.product_name || 'Product'}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:center;">${item.quantity || 1}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:right;">₹${Number(item.price || 0).toLocaleString('en-IN')}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#1e293b; font-weight:600; text-align:right;">₹${lineTotal.toLocaleString('en-IN')}</td>
                    `;
                    sdItemsList.appendChild(row);
                });

                if (sdSubtotal) sdSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
                if (sdTax)      sdTax.textContent      = `₹0`; // Placeholder
                if (sdDiscount) sdDiscount.textContent = `₹0`; // Placeholder
                if (sdTotal) {
                    const isRefunded = sale.status === 'refunded';
                    if (isRefunded) {
                        sdTotal.innerHTML = `<del style="color:#94a3b8; font-weight:400; margin-right: 8px;">₹${subtotal.toLocaleString('en-IN')}</del> <span style="color:#dc2626;">Refunded</span>`;
                    } else {
                        sdTotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
                    }
                }
            }

            if (sdRefundBtn) {
                const isRefunded = sale.status === 'refunded';
                sdRefundBtn.style.display = isRefunded ? 'none' : 'inline-flex';
            }

        } catch (err) {
            console.error('Error fetching sale details:', err);
            if (sdItemsList) sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Failed to load items.</td></tr>`;
        }
    }


    // ----------------------------------------------------------------------
    // 9. PROCESS REFUND (via Supabase update)
    // ----------------------------------------------------------------------
    async function processRefund() {
        if (!currentActionData || !currentActionData.sale || refundableAmount <= 0) return;
        
        const { sale } = currentActionData;
        const saleId = sale.id;
        const confirmBtn = document.getElementById('confirmRefundBtn');
        const note = document.getElementById('rfNote')?.value.trim();

        if (confirmBtn) {
            confirmBtn.textContent = 'Processing...';
            confirmBtn.disabled = true;
        }

        try {
            // Determine primary key column
            const { data: existing } = await supabase
                .from('sales')
                .select('sale_id, id')
                .eq('company_id', getCompanyId())
                .limit(1);

            const pkCol = existing && existing.length > 0 && existing[0].sale_id ? 'sale_id' : 'id';

            // 1. Record the Refund in the Ledger
            const { error: txError } = await supabase
                .from('business_transactions')
                .insert({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    reference_id: saleId,
                    reference_type: 'product',
                    amount: Math.abs(refundableAmount),
                    status: 'refunded',
                    payment_method: (document.getElementById('rfMethodDisplay')?.value || 'cash').toLowerCase(),
                    notes: note || `Refund processed for sale ${saleId}`,
                    paid_at: new Date().toISOString()
                });

            if (txError) throw txError;

            // 2. Update the sale status in the sales table
            const { error } = await supabase
                .from('sales')
                .eq(pkCol, saleId)
                .update({ status: 'refunded' });

            if (error) throw error;

            // Success!
            showToast(`${sale.customer}'s purchase has been refunded.`, '#dc2626');
            document.getElementById('refundSummaryOverlay').style.display = 'none';
            
            // Re-fetch to sync everything
            await fetchSalesHistory();
            
            // Update local Detail view if open
            if (sdTotal) sdTotal.innerHTML = `<del style="color:#94a3b8; font-weight:400; margin-right: 8px;">${sale.total}</del> <span style="color:#dc2626;">Refunded</span>`;
            if (sdRefundBtn) sdRefundBtn.style.display = 'none';

        } catch (err) {
            console.error('Refund error:', err);
            showToast('Failed to process refund: ' + (err.message || 'Unknown error'), '#dc2626');
            if (confirmBtn) {
                confirmBtn.textContent = 'Issue Refund';
                confirmBtn.disabled = false;
            }
        }
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

window.hsExportData = hsExportData;
