// billing-modal-invoice.js — Modal 6: View Invoice + Payment History Export
// Part of scripts/billing/ modularization of billing-subscription.js

'use strict';

import { state, CATALOG_ADDONS } from './billing-state.js';
import { fmtCurrency, formatBillingAddress, showToast } from './billing-helpers.js';
import { openModal, closeModal } from './billing-renders.js';

// DOM references — injected via initModalInvoice()
let dom = {};

export function initModalInvoice(domRefs) {
    dom = domRefs;
}

// ── Invoice Modal ──────────────────────────────────────────────

export function openInvoiceModal(invoiceId) {
    const item = state.paymentHistory.find(h => h.id === invoiceId) || state.paymentHistory[0];
    if (!item) return;
    dom.invoiceModalTitle.textContent = `Invoice #${item.id}`;

    let statusBadgeClass = 'is-paid';
    if (item.status === 'Pending') statusBadgeClass = 'is-pending';
    else if (item.status === 'Failed') statusBadgeClass = 'is-failed';
    else if (item.status === 'Refunded') statusBadgeClass = 'is-refunded';

    const statusBadge = document.getElementById('invoiceModalStatusBadge');
    if (statusBadge) {
        statusBadge.className = `invoice-status-badge ${statusBadgeClass}`;
        statusBadge.textContent = item.status.toUpperCase();
    }

    // Calculate Subtotal & GST from itemized list or fallback
    let items = item.items;
    let subtotal = 0;
    if (items && items.length > 0) {
        subtotal = items.reduce((acc, cur) => acc + cur.amount, 0);
    } else {
        subtotal = Math.round(item.amount / 1.18);
        items = [{
            name: `${item.description} — Monthly Subscription`,
            subtitle: 'Core salon management & features',
            amount: subtotal
        }];
    }
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    const itemsRowsHtml = items.map(line => `
        <tr>
            <td class="invoice-item-desc">
                <div class="invoice-item-header-row">
                    <span class="invoice-item-name">${line.name}</span>
                    ${line.isAddon ? '<span class="invoice-addon-tag">Add-on</span>' : ''}
                </div>
                ${line.subtitle ? `<div class="invoice-item-sub">${line.subtitle}</div>` : ''}
            </td>
            <td class="invoice-item-amount">${fmtCurrency(line.amount)}</td>
        </tr>
    `).join('');

    dom.invoiceModalBody.innerHTML = `
        <!-- Top Section: Issuer Details (Left) & Transaction Meta (Right) -->
        <div class="invoice-header-grid">
            <div class="invoice-issuer-block">
                <p class="invoice-company-name">BharathBots Technologies</p>
                <p class="invoice-meta-text">GSTIN: <span class="invoice-text-bold">37AAAAA0000A1Z5</span></p>
                <p class="invoice-meta-text">Machilipatnam, Andhra Pradesh, India</p>
                <p class="invoice-meta-text">support@bharathbots.com</p>
            </div>
            <div class="invoice-meta-block">
                <div class="invoice-meta-row">
                    <span class="invoice-meta-label">Date:</span>
                    <span class="invoice-meta-value">${item.date}</span>
                </div>
                <div class="invoice-meta-row">
                    <span class="invoice-meta-label">Payment Method:</span>
                    <span class="invoice-meta-value">${item.method}</span>
                </div>
                <div class="invoice-meta-row">
                    <span class="invoice-meta-label">Payment Ref:</span>
                    <span class="invoice-meta-value invoice-meta-value--mono">${item.paymentRef || '—'}</span>
                </div>
                <div class="invoice-meta-row">
                    <span class="invoice-meta-label">Status:</span>
                    <span class="invoice-status-pill ${statusBadgeClass}">${item.status.toUpperCase()}</span>
                </div>
            </div>
        </div>

        <div class="invoice-divider"></div>

        <!-- Middle Section: BILL TO Customer Block -->
        <div class="invoice-bill-to-card">
            <div class="invoice-bill-to-header">
                <span class="invoice-bill-to-label">BILL TO</span>
            </div>
            <p class="invoice-customer-name">${state.billingInfo.legalName || 'Salon ABC'}</p>
            <p class="invoice-customer-detail">${formatBillingAddress(state.billingInfo)}</p>
            <div class="invoice-customer-meta-row">
                <span>GSTIN: <strong>${state.billingInfo.gstin || '37ABCDE1234F1Z5'}</strong></span>
                ${state.billingInfo.email ? `<span style="margin-left: 14px;">Email: <strong>${state.billingInfo.email}</strong></span>` : ''}
            </div>
        </div>

        <div class="invoice-divider"></div>

        <!-- Items Table -->
        <div class="invoice-table-wrap">
            <table class="invoice-preview-table">
                <thead>
                    <tr>
                        <th class="col-desc">DESCRIPTION</th>
                        <th class="col-amt">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRowsHtml}
                </tbody>
            </table>
        </div>

        <!-- Financial Summary Breakdown -->
        <div class="invoice-summary-section">
            <div class="invoice-summary-spacer"></div>
            <div class="invoice-summary-box">
                <div class="invoice-summary-row">
                    <span class="summary-label">Subtotal</span>
                    <span class="summary-val">${fmtCurrency(subtotal)}</span>
                </div>
                <div class="invoice-summary-row">
                    <span class="summary-label">GST (18%)</span>
                    <span class="summary-val">${fmtCurrency(gst)}</span>
                </div>
                <div class="invoice-summary-divider"></div>
                <div class="invoice-summary-row invoice-summary-row--total">
                    <span class="summary-label-total">TOTAL PAID</span>
                    <span class="summary-val-total">${fmtCurrency(total)}</span>
                </div>
            </div>
        </div>

        <!-- Footer Reference Note -->
        <div class="invoice-reference-footer">
            <i data-feather="check-circle" style="width: 14px; height: 14px; stroke: #10b981; flex-shrink: 0;"></i>
            <span>Payment received via <strong>${item.method}</strong> &bull; Ref: <code class="invoice-code">${item.paymentRef || 'TXN-8492019482'}</code></span>
        </div>
    `;

    if (window.feather) feather.replace();
    openModal(dom.modalViewInvoice);
}

// ── Event Binding ──────────────────────────────────────────────

export function bindInvoiceModalEvents() {
    if (dom.btnDownloadInvoicePdf) {
        dom.btnDownloadInvoicePdf.addEventListener('click', function () {
            closeModal(dom.modalViewInvoice);
            showToast('Downloading invoice PDF...');
        });
    }

    // Export All History Button
    const btnExportAllHistory = document.getElementById('btnExportAllHistory');
    if (btnExportAllHistory) {
        btnExportAllHistory.addEventListener('click', function () {
            if (!state.paymentHistory || state.paymentHistory.length === 0) {
                showToast('No payment history to export.');
                return;
            }
            const rows = [
                ['Invoice ID', 'Date', 'Description', 'Amount', 'Payment Method', 'Status'],
                ...state.paymentHistory.map(h => [h.id, h.date, h.description, h.amount, h.method, h.status])
            ];
            const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `bharathbots_billing_history.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Payment history exported.');
        });
    }
}
