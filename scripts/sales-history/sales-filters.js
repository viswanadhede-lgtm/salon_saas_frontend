// scripts/sales-history/sales-filters.js

import { salesState } from './sales-state.js';
import { formatCustomDateLabel, showToast } from './sales-utils.js';

/**
 * Filter, search, and export logic for Sales History.
 */

export function setupSearchFilter(onRender) {
    const searchInput = document.getElementById('hsSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        salesState.currentSalesData = salesState.initialSalesData.filter(s => 
            String(s.id).toLowerCase().includes(term) || 
            s.customer.toLowerCase().includes(term) ||
            (s.customer_phone || '').toLowerCase().includes(term) ||
            s.staff.toLowerCase().includes(term) ||
            (s.products_summary || '').toLowerCase().includes(term)
        );
        if (typeof onRender === 'function') onRender();
    });
}

export function filterByDate(range, onRender) {
    const label = document.getElementById('hsDateLabel');
    const now = new Date();
    let from = null;
    let to = null;

    if (range === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
        const fromInput = document.getElementById('hsCustomFrom');
        const toInput   = document.getElementById('hsCustomTo');
        if (fromInput && fromInput.value) from = new Date(fromInput.value);
        if (toInput && toInput.value) {
            to = new Date(toInput.value);
            to.setHours(23, 59, 59, 999);
        }
        if (label) {
            label.textContent = `${formatCustomDateLabel(fromInput?.value)} → ${formatCustomDateLabel(toInput?.value)}`;
        }
    } else {
        if (label) label.textContent = 'All Time';
    }

    salesState.currentSalesData = salesState.initialSalesData.filter(s => {
        if (!s.raw_date) return false;
        if (from && s.raw_date < from) return false;
        if (to   && s.raw_date > to)   return false;
        return true;
    });

    if (typeof onRender === 'function') onRender();
}

export function applyFilter(onRender) {
    const filterMenu = document.getElementById('hsFilterMenu');
    if (filterMenu) filterMenu.style.display = 'none';

    const allCbs = document.querySelectorAll('.hs-filter-cb');
    const payments = [], staff = [], categories = [];
    allCbs.forEach(cb => {
        if (!cb.checked) return;
        const val = cb.value;
        if (['cash','card','upi'].includes(val))                     payments.push(val);
        if (['Sarah','Michael','Anjali'].includes(val))              staff.push(val);
        if (['Hair care','Skin care','Style products'].includes(val)) categories.push(val);
    });

    salesState.currentSalesData = salesState.initialSalesData.filter(sale => {
        const paymentOk  = payments.length === 0   || payments.includes(sale.payment);
        const staffOk    = staff.length === 0      || staff.includes(sale.staff);
        return paymentOk && staffOk;
    });

    if (typeof onRender === 'function') onRender();
}

export function clearFilter(onRender) {
    document.querySelectorAll('.hs-filter-cb').forEach(cb => cb.checked = false);
    salesState.currentSalesData = [...salesState.initialSalesData];
    if (typeof onRender === 'function') onRender();
    const filterMenu = document.getElementById('hsFilterMenu');
    if (filterMenu) filterMenu.style.display = 'none';
}

export function exportData(format) {
    const headers = ['Date', 'Customer', 'Products', 'Total', 'Payment', 'Staff'];
    const rows = [headers];

    salesState.currentSalesData.forEach(s => {
        const products = (s.products_summary || '')
            .split(',')
            .map(p => {
                const m = p.trim().match(/^(\d+)\s*\*\s*(.+)$/);
                return m ? `${m[2].trim()} - ${m[1]}` : p.trim();
            })
            .join('; ');

        rows.push([
            s.date || '',
            s.customer || '',
            products,
            s.totalAmountNum || 0,
            (s.payment_status || 'UNPAID').toUpperCase(),
            s.staff || ''
        ]);
    });

    let xls = '<table border="1">';
    rows.forEach((r, i) => {
        xls += '<tr>';
        r.forEach(v => {
            xls += i === 0 ? `<th>${v}</th>` : `<td>${v}</td>`;
        });
        xls += '</tr>';
    });
    xls += '</table>';

    const blob = new Blob(['\ufeff', xls], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-history.xls';
    a.click();
    URL.revokeObjectURL(url);
}
