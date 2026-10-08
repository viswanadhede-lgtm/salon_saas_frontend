// sales-history.js

/**
 * Sales History Orchestrator
 * Coordinates state, data fetching, table rendering, filters, modals, payment collection, and refunds.
 */

import { salesState, getCompanyId, getBranchId } from './scripts/sales-history/sales-state.js';
import { fetchSalesHistoryFromDb } from './scripts/sales-history/sales-api.js';
import { renderTable, toggleProdExtra } from './scripts/sales-history/sales-table.js';
import { 
    setupSearchFilter, 
    filterByDate, 
    exportData 
} from './scripts/sales-history/sales-filters.js';
import { 
    registerActionHandlers, 
    handleSaleAction, 
    toggleSaleMenu, 
    closeOpenActionMenu, 
    runSaleView, 
    runSalePrint, 
    runSaleRefund, 
    triggerShare 
} from './scripts/sales-history/sales-actions.js';
import { 
    openSaleDetails, 
    setupSaleDetailsEventListeners, 
    setDetailsRefundHandler 
} from './scripts/sales-history/sales-details-modal.js';
import { openCollectPaymentModal } from './scripts/sales-history/sales-payment.js';
import { 
    openRefundModal, 
    setupRefundEventListeners, 
    registerRefundCompleteCallback 
} from './scripts/sales-history/sales-refund.js';
import { showToast } from './scripts/sales-history/sales-utils.js';

// ─────────────────────────────────────────────────────────────
// EXPOSE WINDOW APIS (Required for inline HTML onclick contracts)
// ─────────────────────────────────────────────────────────────

window.hsFilterByDate = function(range) {
    filterByDate(range, () => renderTable(handleSaleAction));
};

window.hsExportData = function(format) {
    exportData(format);
};

window.toggleSaleMenu = function(e, idx) {
    toggleSaleMenu(e, idx);
};

window.handleSaleAction = handleSaleAction;
window.runSaleView = runSaleView;
window.runSalePrint = runSalePrint;
window.runSaleRefund = runSaleRefund;

window.openRefundModal = openRefundModal;


window.triggerShare = triggerShare;
window.toggleProdExtra = toggleProdExtra;

// ─────────────────────────────────────────────────────────────
// DATA FETCHING & STATE MAPPING
// ─────────────────────────────────────────────────────────────

async function fetchSalesHistory() {
    const tableBody = document.getElementById('hsTableBody');
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

        // Fetch pre-grouped data directly from the consolidated table
        const { data: salesList, error: salesError } = await fetchSalesHistoryFromDb(companyId, branchId);

        if (salesError) throw salesError;

        // Map the table rows directly to state
        salesState.initialSalesData = (salesList || []).map(row => {
            const d = new Date(row.created_at);
            const formattedDate = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                + ' ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

            const productsSummary = Array.isArray(row.product_names)
                ? row.product_names.join(', ')
                : (row.product_names || '');

            const subtotal = Number(row.total_price ?? 0);
            const finalAmount = Number(row.final_amount ?? subtotal);
            const discountAmt = Number(row.discount_amount ?? 0);

            return {
                id: row.sale_id,
                customer: row.customer_name || 'Walk-in',
                customer_id: row.customer_id || null,
                customer_phone: row.customer_phone || '',
                date: formattedDate,
                raw_date: d,
                payment: (row.payment_method || 'other').toLowerCase(),
                staff: row.staff_name || 'System',
                status: (row.payment_status || 'paid').toLowerCase(),
                amount_paid: finalAmount,
                payment_status: (row.payment_status || 'paid').toLowerCase(),
                totalAmountNum: finalAmount,
                total: `₹${finalAmount.toLocaleString('en-IN')}`,
                item_count: row.total_quantity != null ? Number(row.total_quantity) : 1,
                products_summary: productsSummary,
                subtotal_price: subtotal,
                discount_amount: discountAmt,
                discount_type: row.discount_type || null,
                discount_name: row.discount_name || null,
                is_view_grouped: true
            };
        });

        salesState.currentSalesData = [...salesState.initialSalesData];
        renderTable(handleSaleAction);

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

// ─────────────────────────────────────────────────────────────
// LIFECYCLE & EVENT INITIALIZATION
// ─────────────────────────────────────────────────────────────

function setupEventListeners() {
    setupSearchFilter(() => renderTable(handleSaleAction));
    setupSaleDetailsEventListeners();
    setupRefundEventListeners();

    const filterBtn = document.getElementById('hsFilterBtn');
    const filterMenu = document.getElementById('hsFilterMenu');
    const applyFiltersBtn = document.getElementById('hsApplyFilters');
    const dateBtn = document.getElementById('hsDateBtn');
    const dateMenu = document.getElementById('hsDateMenu');
    const exportBtn = document.getElementById('hsExportBtn');
    const exportMenu = document.getElementById('hsExportMenu');

    document.addEventListener('click', (e) => {
        if (salesState.activeMenuEl && !salesState.activeMenuEl.contains(e.target)) {
            closeOpenActionMenu();
        }
        
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
            if (filterMenu) filterMenu.style.display = 'none';
        });
    }
    
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => { exportData('csv'); });
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => { exportData('excel'); });
}

async function initPage() {
    if (typeof feather !== 'undefined') feather.replace();
    setupEventListeners();
    await fetchSalesHistory();
}

// Wire cross-module action handlers
registerActionHandlers({
    openSaleDetails: (sale) => openSaleDetails(sale),
    openCollectPaymentModal: (sale) => openCollectPaymentModal(sale, fetchSalesHistory),
    openRefundModal: (sale) => openRefundModal(sale)
});

setDetailsRefundHandler((sale) => openRefundModal(sale));
registerRefundCompleteCallback(fetchSalesHistory);

document.addEventListener('DOMContentLoaded', () => {
    initPage();
});
