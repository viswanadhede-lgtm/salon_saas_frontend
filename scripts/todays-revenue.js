import { supabase } from '../lib/supabase.js';

let todaysBookingsData = [];

export async function calculateAndRenderRevenue() {
    let realized = 0, booked = 0, lost = 0;
    let servicesRev = 0, productsRev = 0, membershipsRev = 0, totalRev = 0;
    const staffRevenue = {};
    const tableBody = document.getElementById('revTableBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:#94a3b8;">Loading live data...</td></tr>';
    }

    try {
        const branchId = localStorage.getItem('branch_id');
        if (!branchId) throw new Error("No branch selected.");

        const now = new Date();
        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // --- 1. NEW KPI LOGIC (business_transactions) ---
        const { data: trxData, error: trxError } = await supabase
            .from('business_transactions')
            .select('*')
            .eq('branch_id', branchId)
            .gte('created_at', `${localISOTime}T00:00:00`)
            .lte('created_at', `${localISOTime}T23:59:59`);

        if (trxError) throw trxError;

        const trxMap = {};
        
        (trxData || []).forEach(trx => {
            const refId = trx.reference_id;
            if (!refId) return;
            if (!trxMap[refId]) {
                trxMap[refId] = { type: trx.reference_type, paid: 0, refunded: 0 };
            }
            const amt = Number(trx.final_amount) || Number(trx.amount) || 0;
            if (trx.status === 'paid') {
                trxMap[refId].paid += amt;
            } else if (trx.status === 'refunded') {
                trxMap[refId].refunded += amt;
            }
        });

        Object.values(trxMap).forEach(group => {
            const net = group.paid - group.refunded;
            if (net > 0) {
                if (group.type === 'booking') servicesRev += net;
                else if (group.type === 'product') productsRev += net;
                else if (group.type === 'membership') membershipsRev += net;
            }
        });

        totalRev = servicesRev + productsRev + membershipsRev;

        const kpiServicesEl = document.getElementById('kpiServicesRev');
        if (kpiServicesEl) kpiServicesEl.textContent = '₹' + servicesRev.toLocaleString('en-IN');
        const kpiProductsEl = document.getElementById('kpiProductsRev');
        if (kpiProductsEl) kpiProductsEl.textContent = '₹' + productsRev.toLocaleString('en-IN');
        const kpiMembershipsEl = document.getElementById('kpiMembershipsRev');
        if (kpiMembershipsEl) kpiMembershipsEl.textContent = '₹' + membershipsRev.toLocaleString('en-IN');
        const kpiTotalEl = document.getElementById('kpiTotalRev');
        if (kpiTotalEl) kpiTotalEl.textContent = '₹' + totalRev.toLocaleString('en-IN');

        // --- SNAPSHOT TILES ---
        const paidRows = (trxData || []).filter(t => t.status === 'paid');
        const refundedRows = (trxData || []).filter(t => t.status === 'refunded');

        const totalTxn = paidRows.length;
        const highestSale = paidRows.reduce((max, t) => Math.max(max, Number(t.final_amount) || Number(t.amount) || 0), 0);
        const totalRefunds = refundedRows.reduce((sum, t) => sum + (Number(t.final_amount) || Number(t.amount) || 0), 0);
        const cashTotal = paidRows.filter(t => t.payment_method === 'cash').reduce((sum, t) => sum + (Number(t.final_amount) || Number(t.amount) || 0), 0);
        const digitalTotal = paidRows.filter(t => t.payment_method === 'upi' || t.payment_method === 'card').reduce((sum, t) => sum + (Number(t.final_amount) || Number(t.amount) || 0), 0);
        const avgValue = totalTxn > 0 ? Math.round(totalRev / totalTxn) : 0;

        const snapTxnEl = document.getElementById('snapTotalTxn');
        if (snapTxnEl) snapTxnEl.textContent = totalTxn;
        const snapAvgEl = document.getElementById('snapAvgValue');
        if (snapAvgEl) snapAvgEl.textContent = '₹' + avgValue.toLocaleString('en-IN');
        const snapHighestEl = document.getElementById('snapHighest');
        if (snapHighestEl) snapHighestEl.textContent = '₹' + highestSale.toLocaleString('en-IN');
        const snapRefundsEl = document.getElementById('snapRefunds');
        if (snapRefundsEl) snapRefundsEl.textContent = '₹' + totalRefunds.toLocaleString('en-IN');
        const snapCashEl = document.getElementById('snapCash');
        if (snapCashEl) snapCashEl.textContent = '₹' + cashTotal.toLocaleString('en-IN');
        const snapDigitalEl = document.getElementById('snapDigital');
        if (snapDigitalEl) snapDigitalEl.textContent = '₹' + digitalTotal.toLocaleString('en-IN');

        // --- 2. UNIFIED TABLE: Services + Products + Memberships ---
        const unifiedRows = [];

        // 2a. SERVICES (completed bookings)
        const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings_for_business_transaction')
            .select('*')
            .eq('branch_id', branchId)
            .eq('booking_date', localISOTime)
            .eq('status', 'completed');

        if (bookingsError) throw bookingsError;
        todaysBookingsData = bookingsData || [];
        window.todaysBookingsData = todaysBookingsData;
        todaysBookingsData.forEach(b => {
            unifiedRows.push({
                type: 'Service',
                customer_id: b.customer_id,
                customer: b.customer_name || 'Walk-in Customer',
                items: Array.isArray(b.service_names) && b.service_names.length > 0
                    ? b.service_names
                    : (b.service_name ? b.service_name.split(',').map(s => s.trim()) : ['N/A']),
                staff: b.staff_name || 'Unassigned',
                amount: b.total_price || 0
            });
        });

        // 2b. PRODUCTS (paid POS sales)
        const { data: salesData, error: salesError } = await supabase
            .from('sales_for_business_transactions')
            .select('*')
            .eq('branch_id', branchId)
            .eq('payment_status', 'paid')
            .gte('created_at', `${localISOTime}T00:00:00`)
            .lte('created_at', `${localISOTime}T23:59:59`);

        if (salesError) throw salesError;
        (salesData || []).forEach(s => {
            unifiedRows.push({
                type: 'Product',
                customer_id: s.customer_id,
                customer: s.customer_name || 'Walk-in Customer',
                items: s.product_names || [],
                staff: s.staff_name || 'Unassigned',
                amount: s.final_amount || s.total_price || 0
            });
        });

        // 2c. MEMBERSHIPS (paid today)
        const { data: memberData, error: memberError } = await supabase
            .from('membership_purchases')
            .select('*')
            .eq('branch_id', branchId)
            .eq('payment_status', 'paid')
            .eq('purchase_date', localISOTime);

        if (memberError) throw memberError;
        (memberData || []).forEach(m => {
            unifiedRows.push({
                type: 'Membership',
                customer_id: m.customer_id,
                customer: m.customer_name || 'Walk-in Customer',
                items: [m.plan_name || 'Membership Plan'],
                staff: m.assigned_by_user_name || 'Unassigned',
                amount: m.final_amount || m.price || 0
            });
        });

        // Render unified rows
        if (tableBody) {
            tableBody.innerHTML = '';
            if (unifiedRows.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:32px; color:#94a3b8;">No completed transactions found for today.</td></tr>';
            } else {
                const typeStyles = {
                    'Service':    { color: '#059669', bg: '#d1fae5' },
                    'Product':    { color: '#0284c7', bg: '#e0f2fe' },
                    'Membership': { color: '#7c3aed', bg: '#ede9fe' }
                };
                unifiedRows.forEach((row, rowIdx) => {
                    const s = typeStyles[row.type] || { color: '#64748b', bg: '#f1f5f9' };
                    const cellId = `rev-items-${rowIdx}`;
                    const extraCount = row.items.length - 1;

                    const pillStyle = `display:inline-block; background:#f1f5f9; color:#334155; border-radius:20px; padding:2px 10px; font-size:0.78rem; font-weight:500; margin-right:4px;`;
                    const firstPill = `<span style="${pillStyle}">${row.items[0]}</span>`;
                    const plusBadge = extraCount > 0
                        ? `<span class="rev-plus-badge" onclick="revToggleItems('${cellId}')" style="display:inline-block; background:#e0e7ff; color:#4f46e5; border-radius:20px; padding:2px 10px; font-size:0.78rem; font-weight:600; cursor:pointer; user-select:none;">+${extraCount}</span>`
                        : '';

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #f1f5f9';
                    tr.innerHTML = `
                        <td style="padding:14px 20px;">
                            <span style="display:inline-block; background:${s.bg}; color:${s.color}; border-radius:20px; padding:3px 12px; font-size:0.78rem; font-weight:600;">${row.type}</span>
                        </td>
                        <td style="padding:14px 20px;">
                            <a href="#" onclick="if(window.viewCustomerProfile) window.viewCustomerProfile('${row.customer_id || ''}', '${(row.customer||'').replace(/'/g, "\\'")}'); return false;" style="color:#4f46e5; text-decoration:none; font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${row.customer}</a>
                        </td>
                        <td style="padding:14px 20px;" id="${cellId}"><div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${firstPill + plusBadge}</div></td>
                        <td style="padding:14px 20px; color:#475569;">${row.staff}</td>
                        <td style="padding:14px 20px; text-align:center; font-weight:700; color:#10b981;">₹${Number(row.amount).toLocaleString('en-IN')}</td>
                    `;
                    // Store items safely as data attribute AFTER appending innerHTML
                    tableBody.appendChild(tr);
                    const cellEl = document.getElementById(cellId);
                    if (cellEl) {
                        cellEl.dataset.items = JSON.stringify(row.items);
                        cellEl.dataset.expanded = 'false';
                    }
                });
            }
        }

    } catch (err) {
        console.error("Failed to load revenue data:", err);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:#ef4444;">Failed to load live data. Please refresh.</td></tr>';
        }
    }

    const totalForecast = realized + booked;
    const captureRate = totalForecast > 0 ? Math.round((realized / totalForecast) * 100) : 0;

    const formattedTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const badgeEl = document.getElementById('revRealizedBadge');
    if (badgeEl) badgeEl.textContent = 'Updated - ' + formattedTime;
    
    const labelSvc = document.getElementById('revLabelServices');
    if (labelSvc) labelSvc.textContent = '₹' + servicesRev.toLocaleString('en-IN');
    const labelProd = document.getElementById('revLabelProducts');
    if (labelProd) labelProd.textContent = '₹' + productsRev.toLocaleString('en-IN');
    const labelMemb = document.getElementById('revLabelMemberships');
    if (labelMemb) labelMemb.textContent = '₹' + membershipsRev.toLocaleString('en-IN');
    const donutCenter = document.getElementById('revDonutCenter');
    if (donutCenter) donutCenter.textContent = '₹' + totalRev.toLocaleString('en-IN');

    const chartDonut = document.getElementById('revChartDonut');
    if (chartDonut) {
        if (totalRev > 0) {
            const p1 = Math.round((servicesRev / totalRev) * 100);
            const p2 = Math.round((productsRev / totalRev) * 100);
            chartDonut.style.background = `conic-gradient(#10b981 0% ${p1}%, #3b82f6 ${p1}% ${p1+p2}%, #a855f7 ${p1+p2}% 100%)`;
        } else {
            chartDonut.style.background = `conic-gradient(#e2e8f0 0% 100%)`;
        }
    }

    const staffContainer = document.getElementById('revStaffBars');
    if (staffContainer) {
        staffContainer.innerHTML = '';
        const sorted = Object.entries(staffRevenue).sort((a,b) => b[1]-a[1]);
        const maxRev = sorted.length > 0 ? sorted[0][1] : 0;
        sorted.forEach(([name, rev]) => {
            const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
            const div = document.createElement('div');
            div.innerHTML = `<div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:flex-end;"><span style="font-size:0.9rem; font-weight:600; color:#1e293b;">${name}</span><span style="font-size:0.9rem; font-weight:700; color:#1e293b;">₹${rev.toLocaleString('en-IN')}</span></div><div style="height:8px; background:#f1f5f9; border-radius:10px; overflow:hidden;"><div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#6366f1,#a855f7); border-radius:10px; transition:width 1s ease;"></div></div>`;
            staffContainer.appendChild(div);
        });
        if (sorted.length === 0) staffContainer.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">No completed revenue data yet.</p>';
    }
}

export function revToggleItems(cellId) {
    const cell = document.getElementById(cellId);
    if (!cell) return;
    const items = JSON.parse(cell.dataset.items || '[]');
    const isExpanded = cell.dataset.expanded === 'true';
    const pillStyle = 'display:inline-block; background:#f1f5f9; color:#334155; border-radius:20px; padding:2px 10px; font-size:0.78rem; font-weight:500;';
    const wrapStyle = 'display:flex; flex-wrap:wrap; gap:4px; align-items:center;';

    if (isExpanded) {
        // Collapse back to first item + +N
        const extraCount = items.length - 1;
        const firstPill = `<span style="${pillStyle}">${items[0]}</span>`;
        const plusBadge = `<span onclick="revToggleItems('${cellId}')" style="display:inline-block; background:#e0e7ff; color:#4f46e5; border-radius:20px; padding:2px 10px; font-size:0.78rem; font-weight:600; cursor:pointer; user-select:none;">+${extraCount}</span>`;
        cell.innerHTML = `<div style="${wrapStyle}">${firstPill + plusBadge}</div>`;
    } else {
        // Expand: wrap all items + ‹ collapse arrow
        const allPills = items.map(name => `<span style="${pillStyle}">${name}</span>`).join('');
        const collapseBtn = `<span onclick="revToggleItems('${cellId}')" style="display:inline-flex; align-items:center; background:#e0e7ff; color:#4f46e5; border-radius:20px; padding:2px 10px; font-size:0.78rem; font-weight:700; cursor:pointer; user-select:none;">&#8249;</span>`;
        cell.innerHTML = `<div style="${wrapStyle}">${allPills + collapseBtn}</div>`;
    }
    cell.dataset.expanded = isExpanded ? 'false' : 'true';
}

// Preserve required globals for external scripts and inline handlers
window.calculateAndRenderRevenue = calculateAndRenderRevenue;
window.revToggleItems = revToggleItems;
window.todaysBookingsData = todaysBookingsData;

// Self-initialization
function init() {
    if (window.feather) window.feather.replace();

    const dateLabel = document.getElementById('revDateLabel');
    if (dateLabel) {
        dateLabel.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    calculateAndRenderRevenue();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
