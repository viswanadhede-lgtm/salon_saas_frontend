// scripts/sales-history/sales-table.js

import { salesState } from './sales-state.js';

/**
 * Table rendering and row actions for Sales History.
 */

export function renderTable(onActionCallback) {
    const tableBody = document.getElementById('hsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (salesState.currentSalesData.length === 0) {
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

    salesState.currentSalesData.forEach((sale, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.style.cursor = 'pointer';
        tr.setAttribute('data-idx', idx);

        // Dynamic payment status logic
        const payStatus = sale.payment_status || 'unpaid';
        let statusPillClass = 'tb-payment-pending';
        let statusLabel = payStatus.toUpperCase();

        if (payStatus === 'paid') {
            statusPillClass = 'tb-payment-paid';
            statusLabel = 'PAID';
        } else if (payStatus === 'partial') {
            statusPillClass = 'tb-payment-partial';
            statusLabel = 'PARTIAL';
        } else if (payStatus === 'refunded') {
            statusPillClass = 'tb-payment-refunded';
            statusLabel = 'REFUNDED';
        } else {
            statusPillClass = 'tb-payment-pending';
            statusLabel = payStatus.toUpperCase();
        }

        const isRefunded = payStatus === 'refunded';
        let saleTotalDisplay = isRefunded
            ? `<del style="color:#94a3b8; font-weight:400;">${sale.total}</del> <span style="color:#dc2626; font-size: 0.8rem; display:block;">Refunded</span>`
            : sale.total;

        let productDisplayHtml = '-';
        if (sale.products_summary) {
            const parts = sale.products_summary.split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                const formatPart = (p) => {
                    const match = p.match(/^(\d+)\s*\*\s*(.+)$/);
                    if (match) return `${match[2]} - ${match[1]}`;
                    return p;
                };

                const chipStyle = `display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:500;color:#334155;margin:1px 2px 1px 0;white-space:nowrap;`;

                const formattedParts = parts.map(formatPart);
                const firstChip = `<span style="${chipStyle}">${formattedParts[0]}</span>`;

                if (formattedParts.length === 1) {
                    productDisplayHtml = firstChip;
                } else {
                    const extraCount = formattedParts.length - 1;
                    const extraId = `prod-extra-${sale.id}`;
                    const toggleId = `prod-toggle-${sale.id}`;
                    const extraChips = formattedParts.slice(1).map(s => `<span style="${chipStyle}">${s}</span>`).join('');
                    productDisplayHtml = `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;width:100%;">
                        ${firstChip}
                        <span id="${toggleId}"
                            onclick="event.stopPropagation(); window.toggleProdExtra('${extraId}', '${toggleId}', ${extraCount})"
                            style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:600;background:#e0e7ff;color:#4f46e5;cursor:pointer;white-space:nowrap;user-select:none;">+${extraCount}</span>
                        <div id="${extraId}" style="display:none;flex-wrap:wrap;gap:2px;width:100%;margin-top:3px;">
                            ${extraChips}
                        </div>
                    </div>`;
                }
            }
        }

        // Two-row Date column: Date in row 1, Time in row 2
        let datePart = sale.date_part;
        let timePart = sale.time_part;

        if (!datePart || !timePart) {
            if (sale.raw_date instanceof Date && !isNaN(sale.raw_date)) {
                datePart = sale.raw_date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
                timePart = sale.raw_date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
            } else if (typeof sale.date === 'string') {
                const parts = sale.date.trim().split(' ');
                if (parts.length >= 4) {
                    datePart = parts.slice(0, 3).join(' ');
                    timePart = parts.slice(3).join(' ');
                } else {
                    datePart = sale.date;
                    timePart = '';
                }
            } else {
                datePart = '-';
                timePart = '';
            }
        }

        tr.innerHTML = `
            <td style="padding:12px 16px 12px 24px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <div style="font-weight:500; color:#334155; font-size:0.85rem; line-height:1.25;">${datePart}</div>
                ${timePart ? `<div style="color:#64748b; font-size:0.75rem; margin-top:2px; line-height:1.2;">${timePart}</div>` : ''}
            </td>
            <td style="padding:14px 16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${sale.customer_id 
                    ? `<span class="customer-link" style="font-weight:600; cursor:pointer;" onclick="event.stopPropagation(); window.viewCustomerProfile('${sale.customer_id}', '${(sale.customer || '').replace(/'/g, "\\'")}')">${sale.customer}</span>`
                    : `<span style="color:#1e293b; font-weight:500;">${sale.customer}</span>`
                }
            </td>
            <td style="padding:14px 16px; color:#475569;">${productDisplayHtml}</td>
            <td style="padding:14px 16px; font-weight:600; color:#059669;">${saleTotalDisplay}</td>
            <td style="padding:14px 16px;">
                <span class="tb-status-pill ${statusPillClass}" style="text-transform: uppercase; font-size: 0.7rem;">${statusLabel}</span>
            </td>
            <td style="padding:14px 16px; color:#475569;">${sale.staff}</td>
            <td style="padding:14px 16px; text-align:center;" class="action-cell"></td>
        `;

        const actionCell = tr.querySelector('.action-cell');
        actionCell.style.display = 'flex';
        actionCell.style.alignItems = 'center';
        actionCell.style.justifyContent = 'center';
        actionCell.style.gap = '12px';

        // Single Info button — opens the Sale Action Picker popup
        const infoBtn = document.createElement('button');
        infoBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Info
        `;
        infoBtn.style.cssText = 'width:90px; padding:5px 8px; border-radius:6px; border:1px solid #e2e8f0; background:#ffffff; color:#1e293b; font-size:0.78rem; font-weight:600; cursor:pointer; white-space:nowrap; transition:all 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.04); display:inline-flex; align-items:center; justify-content:center; gap:6px;';
        infoBtn.title = 'Sale Actions';
        infoBtn.onmouseover = () => { infoBtn.style.background = '#f8fafc'; infoBtn.style.borderColor = '#cbd5e1'; };
        infoBtn.onmouseout  = () => { infoBtn.style.background = '#ffffff'; infoBtn.style.borderColor = '#e2e8f0'; };
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onActionCallback === 'function') {
                onActionCallback('info', idx);
            } else if (window.handleSaleAction) {
                window.handleSaleAction('info', idx);
            }
        });

        actionCell.appendChild(infoBtn);


        // Clicking anywhere on the row (except links or buttons) opens Invoice Details
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.customer-link') || e.target.closest('.action-cell') || e.target.closest('[id^="prod-toggle-"]')) return;
            if (typeof onActionCallback === 'function') {
                onActionCallback('view', idx);
            } else if (window.handleSaleAction) {
                window.handleSaleAction('view', idx);
            }
        });

        tableBody.appendChild(tr);
    });

    if (typeof feather !== 'undefined') feather.replace();
    if (window.applySubFeatureGates) window.applySubFeatureGates();
}

export function toggleProdExtra(extraId, toggleId, extraCount) {
    var el  = document.getElementById(extraId);
    var tog = document.getElementById(toggleId);
    if (!el || !tog) return;
    var isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display  = isHidden ? 'flex' : 'none';
    tog.textContent   = isHidden ? '▲ less' : '+' + extraCount;
}
