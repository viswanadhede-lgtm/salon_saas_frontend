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
            tr.setAttribute('data-idx', idx);

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
                <td style="padding:12px 24px 12px 12px;" class="action-cell"></td>
            `;

            const actionCell = tr.querySelector('.action-cell');
            const refundBtn = document.createElement('button');
            refundBtn.textContent = 'Return';
            refundBtn.title = payStatus === 'unpaid' ? 'Cannot return pending sale' : 'Return Items';
            refundBtn.style.padding = '4px 10px';
            refundBtn.style.borderRadius = '6px';
            refundBtn.style.border = `1px solid ${payStatus === 'unpaid' ? '#f1f5f9' : '#fecdd3'}`;
            refundBtn.style.background = payStatus === 'unpaid' ? '#f8fafc' : '#fff1f2';
            refundBtn.style.color = payStatus === 'unpaid' ? '#cbd5e1' : '#e11d48';
            refundBtn.style.fontSize = '0.75rem';
            refundBtn.style.fontWeight = '600';
            refundBtn.style.cursor = payStatus === 'unpaid' ? 'not-allowed' : 'pointer';
            refundBtn.style.whiteSpace = 'nowrap';
            refundBtn.style.transition = 'all 0.2s';
            
            if (payStatus === 'unpaid') {
                refundBtn.disabled = true;
            } else {
                refundBtn.onmouseover = () => refundBtn.style.background = '#ffe4e6';
                refundBtn.onmouseout = () => refundBtn.style.background = '#fff1f2';
                refundBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleSaleAction('refund', idx);
                });
            }
            actionCell.appendChild(refundBtn);
            
            tr.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    handleSaleAction('view', idx);
                }
            });

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
            if (saleDetailsModalOverlay) saleDetailsModalOverlay.classList.remove('active');
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
            if (refundSummaryOverlay) refundSummaryOverlay.classList.remove('active');
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
                if (currentActionData && currentActionData.sale) {
                    openRefundModal(currentActionData.sale);
                } else {
                    refundSummaryOverlay.classList.add('active');
                }
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

        const closeCollectModal = () => { if (collectOverlay) collectOverlay.classList.remove('active'); };
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
                    Return Items
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
            showToast('Unable to process action. See console for details.', '#ef4444');
        }
    }
    window.handleSaleAction = handleSaleAction;
    
    // Explicit global wrappers for absolute fallback guarantee
    window.runSaleView = function(idx) { handleSaleAction('view', idx); };
    window.runSalePrint = function(idx) { handleSaleAction('print', idx); };
    window.runSaleRefund = function(idx) { handleSaleAction('refund', idx); };
    
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
        
        modal.classList.add('active');
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
            document.getElementById('collectPaymentModalOverlay').classList.remove('active');
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
    // ----------------------------------------------------------------------
    // 7.2. RETURN MODAL (Itemized)
    // ----------------------------------------------------------------------
    let currentRefundItems = [];
    
    async function openRefundModal(sale) {
        if (!sale) return;
        const modal = document.getElementById('refundSummaryOverlay');
        if (!modal) return;
        
        modal.classList.add('active');

        const subtitle = document.getElementById('rfModalSubtitle');
        const productList = document.getElementById('rfProductList');
        const amountDisplay = document.getElementById('rfAmountDisplay');
        const methodDisplay = document.getElementById('rfMethodDisplay');
        const noteField = document.getElementById('rfNote');
        const confirmBtn = document.getElementById('confirmRefundBtn');

        // Clear UI config
        if (subtitle) subtitle.textContent = `${sale.customer || 'Customer'} • ${sale.products_summary || 'Sale'}`;
        if (productList) productList.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">Loading items...</div>`;
        if (amountDisplay) amountDisplay.textContent = '₹0';
        if (methodDisplay) methodDisplay.value = 'Loading...';
        if (noteField) noteField.value = '';
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Process Refund'; }

        try {
            // Fetch individual items comprising this sale group
            const { data: items, error } = await supabase
                .from('sales')
                .select('*')
                .eq('sale_id', sale.id);

            if (error) throw error;
            currentRefundItems = items || [];

            // Hint last payment method
            const { data: txs } = await supabase
                .from('business_transactions')
                .select('payment_method')
                .eq('reference_id', sale.id)
                .limit(1);

            if (methodDisplay) {
                let inferredMethod = (txs && txs.length > 0 && txs[0].payment_method) ? txs[0].payment_method.toLowerCase() : (sale.payment || 'cash').toLowerCase();
                
                // Fallback to cash if check constraint violates
                if (!['cash', 'card', 'upi'].includes(inferredMethod)) {
                    inferredMethod = 'cash';
                }
                
                methodDisplay.value = inferredMethod.charAt(0).toUpperCase() + inferredMethod.slice(1);
            }

            // Render right away
            renderRefundItems();

        } catch (err) {
            console.error('[Return Load Error]', err);
            if (productList) productList.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626; font-size: 0.85rem;">Failed to load items.</div>`;
        }
        
        if (typeof feather !== 'undefined') feather.replace();
    }
    window.openRefundModal = openRefundModal;


    function renderRefundItems() {
        const list = document.getElementById('rfProductList');
        if (!list) return;
        
        list.innerHTML = '';
        
        if (currentRefundItems.length === 0) {
            list.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">No items found.</div>`;
            return;
        }

        currentRefundItems.forEach(item => {
            const isRefunded = (item.status === 'refunded');
            const itemPrice = Number(item.price || 0);
            
            const row = document.createElement('div');
            row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; min-height: 60px; flex-shrink: 0; border-bottom: 1px solid #f1f5f9; ${isRefunded ? 'background: #f8fafc; opacity: 0.6;' : ''}`;
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                    <input type="checkbox" class="rf-item-cb" data-id="${item.id}" 
                        style="width: 18px; height: 18px; flex-shrink: 0; accent-color: #dc2626; cursor: ${isRefunded ? 'not-allowed' : 'pointer'};" 
                        ${isRefunded ? 'checked disabled' : ''}>
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <p style="margin: 0 0 2px 0; font-size: 0.9rem; font-weight: 600; line-height: 1.2; color: #1e293b; text-decoration: ${isRefunded ? 'line-through' : 'none'};">${item.product_name || 'Product'}</p>
                        ${isRefunded 
                            ? `<p style="margin: 0; font-size: 0.75rem; color: #64748b; line-height: 1;">Qty: ${item.quantity || 1}</p>`
                            : `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                 <span style="font-size: 0.75rem; color: #64748b;">Return Qty:</span>
                                 <div style="display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; height: 22px;">
                                     <button type="button" class="rf-qty-btn minus" data-id="${item.id}" style="width: 22px; height: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: none; border-right: 1px solid #cbd5e1; color: #475569; font-weight: 600; cursor: pointer;">-</button>
                                     <input type="text" class="rf-qty-input" data-id="${item.id}" value="${item.quantity || 1}" data-max="${item.quantity || 1}" readonly style="width: 28px; height: 100%; border: none; text-align: center; font-size: 0.75rem; color: #1e293b; background: white; pointer-events: none; padding: 0;">
                                     <button type="button" class="rf-qty-btn plus" data-id="${item.id}" style="width: 22px; height: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: none; border-left: 1px solid #cbd5e1; color: #475569; font-weight: 600; cursor: pointer;">+</button>
                                 </div>
                                 <span style="font-size: 0.7rem; color: #94a3b8;">/ ${item.quantity || 1}</span>
                               </div>`
                        }
                    </div>
                </div>
                <div style="font-weight: 600; color: #1e293b; white-space: nowrap; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end;">
                    ${isRefunded ? `<span style="color: #dc2626; font-size: 0.75rem; text-transform: uppercase;">Returned</span>` : ''}
                    <div class="rf-row-price" data-id="${item.id}" style="margin-top: 2px;"></div>
                </div>
            `;
            list.appendChild(row);
        });

        // Attach recalculation
        document.querySelectorAll('.rf-item-cb:not(:disabled)').forEach(cb => {
            cb.addEventListener('change', calculateRefundTotal);
        });
        
        document.querySelectorAll('.rf-qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const input = document.querySelector(`.rf-qty-input[data-id="${id}"]`);
                if (!input) return;
                
                let val = parseInt(input.value) || 1;
                const max = parseInt(input.dataset.max) || 1;
                
                if (e.currentTarget.classList.contains('plus')) {
                    if (val < max) val++;
                } else if (e.currentTarget.classList.contains('minus')) {
                    if (val > 1) val--;
                }
                
                input.value = val;
                
                // If they interact with quantity, instinctively they want to return it. Auto-check the combo.
                const cb = document.querySelector(`.rf-item-cb[data-id="${id}"]`);
                if (cb && !cb.checked) {
                    cb.checked = true;
                }
                
                calculateRefundTotal();
            });
        });
        
        calculateRefundTotal();
    }

    function calculateRefundTotal() {
        let total = 0;
        let selectedCount = 0;
        
        // Update individual row prices and calculate global total
        currentRefundItems.forEach(item => {
            const isRefunded = (item.status === 'refunded');
            const price = Number(item.price || 0);
            
            let displayVal = 0;
            
            if (isRefunded) {
                displayVal = Number(item.total_amount || 0);
            } else {
                const cb = document.querySelector(`.rf-item-cb[data-id="${item.id}"]`);
                const qtyInput = document.querySelector(`.rf-qty-input[data-id="${item.id}"]`);
                
                let qty = qtyInput ? parseInt(qtyInput.value) || 1 : (item.quantity || 1);
                
                // Bounds enforcement
                if (qty > (item.quantity || 1)) qty = item.quantity || 1;
                if (qty < 1) qty = 1;
                if (qtyInput && parseInt(qtyInput.value) !== qty) qtyInput.value = qty;
                
                displayVal = price * qty;
                
                if (cb && cb.checked) {
                    total += displayVal;
                    selectedCount++;
                }
            }
            
            const priceDisplay = document.querySelector(`.rf-row-price[data-id="${item.id}"]`);
            if (priceDisplay) {
                priceDisplay.textContent = `₹${displayVal.toLocaleString('en-IN')}`;
            }
        });
        
        const amountDisplay = document.getElementById('rfAmountDisplay');
        if (amountDisplay) amountDisplay.textContent = `₹${total.toLocaleString('en-IN')}`;
        
        const btn = document.getElementById('confirmRefundBtn');
        if (btn) btn.disabled = (selectedCount === 0);
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
        try {
            if (!sale) return;
            currentActionData = { action: 'view', idx: currentSalesData.indexOf(sale), sale };

            if (sdSubtitle && sale.id) sdSubtitle.textContent = `Transaction ID: ${String(sale.id).substring(0,8).toUpperCase()}`;
            if (sdCustomer) sdCustomer.textContent = sale.customer || '-';
            if (sdStaff) sdStaff.textContent = sale.staff || '-';
            if (sdDate) sdDate.textContent = sale.date || '-';
            if (sdPayment && sale.payment) sdPayment.textContent = String(sale.payment).toUpperCase();

            const sdItemCountEl = document.getElementById('sdItemCount');
            if (sdItemCountEl) sdItemCountEl.textContent = sale.item_count || 1;

            if (sdItemsList) {
                sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">Loading items...</td></tr>`;
            }
            
            if (saleDetailsModalOverlay) saleDetailsModalOverlay.classList.add('active');
            if (typeof feather !== 'undefined') feather.replace();

            // Fetch actual line items from 'sales' table for this sale_id
            const { data: items, error } = await supabase
                .from('sales')
                .select('*')
                .eq('sale_id', sale.id)
                .order('id', { ascending: true }); // Keep grouped items ordered predictably

            if (error) throw error;

            if (sdItemsList) {
                sdItemsList.innerHTML = '';
                let subtotal = 0;

                (items || []).forEach(item => {
                    const lineTotal = Number(item.total_amount || 0);
                    const isRefunded = item.status === 'refunded';
                    subtotal += isRefunded ? 0 : lineTotal; // Don't add refunded lines to subtotal

                    const row = document.createElement('tr');
                    row.style.borderBottom = '1px solid #f1f5f9';
                    if (isRefunded) {
                        row.style.background = '#f8fafc';
                        row.style.opacity = '0.7';
                    }
                    
                    row.innerHTML = `
                        <td style="padding:12px 16px; font-size:0.875rem; color:#334155; text-decoration: ${isRefunded ? 'line-through' : 'none'};">
                            ${item.product_name || 'Product'} ${isRefunded ? '<span style="color:#dc2626; font-size:0.7rem; font-weight:600; margin-left:8px; text-transform:uppercase;">Returned</span>' : ''}
                        </td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:center;">${item.quantity || 1}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#475569; text-align:right;">₹${Number(item.price || 0).toLocaleString('en-IN')}</td>
                        <td style="padding:12px 16px; font-size:0.875rem; color:#1e293b; font-weight:600; text-align:right; text-decoration: ${isRefunded ? 'line-through' : 'none'};">₹${lineTotal.toLocaleString('en-IN')}</td>
                    `;
                    sdItemsList.appendChild(row);
                });

                if (sdSubtotal) sdSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
                if (sdTax)      sdTax.textContent      = `₹0`; // Placeholder
                if (sdDiscount) sdDiscount.textContent = `₹0`; // Placeholder
                if (sdTotal) {
                    sdTotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
                }
            }

            if (sdRefundBtn) {
                // If every single item is refunded, hide the button
                const allRefunded = items && items.length > 0 && items.every(i => i.status === 'refunded');
                sdRefundBtn.style.display = allRefunded ? 'none' : 'inline-flex';
            }

        } catch (err) {
            console.error('Error fetching sale details:', err);
            if (sdItemsList) sdItemsList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Failed to load items.</td></tr>`;
        }
    }


    // ----------------------------------------------------------------------
    // 9. PROCESS REFUND (via Supabase array/multi-row update)
    // ----------------------------------------------------------------------
    async function processRefund() {
        if (!currentActionData || !currentActionData.sale) return;

        const checkedBoxes = Array.from(document.querySelectorAll('.rf-item-cb:not(:disabled):checked'));
        if (checkedBoxes.length === 0) return;

        const confirmBtn = document.getElementById('confirmRefundBtn');
        if (confirmBtn) {
            confirmBtn.textContent = 'Processing...';
            confirmBtn.disabled = true;
        }

        try {
            const saleId = currentActionData.sale.id; // The Parent Group ID
            const note = document.getElementById('rfNote')?.value.trim();
            const methodDisplay = document.getElementById('rfMethodDisplay');
            let method = methodDisplay ? methodDisplay.value.toLowerCase() : 'cash';
            
            // ENSURE CHECK CONSTRAINT COMPLIANCE
            if (!['cash', 'card', 'upi'].includes(method)) method = 'cash';

            const ledgerRows = [];
            const saleUpdatePromises = [];
            
            for (const cb of checkedBoxes) {
                const itemId = cb.dataset.id;
                const itemObj = currentRefundItems.find(i => String(i.id) === itemId);
                if (!itemObj) continue;

                const qtyInput = document.querySelector(`.rf-qty-input[data-id="${itemId}"]`);
                const refundQty = qtyInput ? parseInt(qtyInput.value) || 1 : (itemObj.quantity || 1);
                
                const itemPrice = Number(itemObj.price || 0);
                const refundAmount = refundQty * itemPrice;
                
                let resultingLineId = itemId;

                if (refundQty < (itemObj.quantity || 1)) {
                    // PARTIAL REFUND: We need to split the row!
                    // 1. Create duplicate row for the return
                    const newRowObj = { ...itemObj };
                    delete newRowObj.id; // Let DB generate new Primary Key
                    newRowObj.quantity = refundQty;
                    newRowObj.total_amount = refundAmount;
                    newRowObj.status = 'refunded';
                    
                    const { data: newInserted, error: insertErr } = await supabase
                        .from('sales')
                        .insert([newRowObj])
                        .select();
                        
                    if (insertErr) throw insertErr;
                    resultingLineId = newInserted && newInserted.length > 0 ? newInserted[0].id : itemId;
                    
                    // 2. Update existing row with remaining inventory
                    const remainingQty = itemObj.quantity - refundQty;
                    const remainingAmount = remainingQty * itemPrice;
                    saleUpdatePromises.push(
                        supabase.from('sales').update({ 
                            quantity: remainingQty, 
                            total_amount: remainingAmount 
                        }).eq('id', itemId)
                    );
                } else {
                    // FULL ROW REFUND
                    saleUpdatePromises.push(
                        supabase.from('sales').update({ status: 'refunded' }).eq('id', itemId)
                    );
                }

                // Add Ledger Entry linked to the effectively returned row ID
                ledgerRows.push({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    reference_id: saleId,               // Parent cart ID
                    reference_line_id: resultingLineId, // Direct specific row ID
                    reference_type: 'product',
                    amount: Math.abs(refundAmount),
                    status: 'refunded',
                    payment_method: method,
                    notes: note || `Returned: ${itemObj.product_name || 'Item'} (Qty: ${refundQty})`,
                    paid_at: new Date().toISOString()
                });
            }

            // Execute batched DB operations
            if (saleUpdatePromises.length > 0) {
                await Promise.all(saleUpdatePromises);
            }
            if (ledgerRows.length > 0) {
                const { error: txError } = await supabase.from('business_transactions').insert(ledgerRows);
                if (txError) throw txError;
            }

            // Success!
            showToast(`Successfully returned ${checkedBoxes.length} partial/full item(s).`, '#dc2626');
            document.getElementById('refundSummaryOverlay').classList.remove('active');
            
            // Re-fetch to sync table badges and metrics
            await fetchSalesHistory();
            
            // Close detail modal if open
            if (sdRefundBtn) sdRefundBtn.style.display = 'none';

        } catch (err) {
            console.error('Return error:', err);
            showToast('Failed to process return: ' + (err.message || 'Unknown error'), '#dc2626');
        } finally {
            if (confirmBtn) {
                confirmBtn.textContent = 'Process Refund';
                confirmBtn.disabled = false;
            }
        }
    }

    function closeRefundOverlayOnly() {
        if (refundSummaryOverlay) refundSummaryOverlay.classList.remove('active');
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
