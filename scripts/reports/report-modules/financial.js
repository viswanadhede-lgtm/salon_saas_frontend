// scripts/reports/report-modules/financial.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderFinRevenue(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR REVENUE REPORT ---
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        // Set Default Dates
        if (filterStart && filterEnd) {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        // Fetch Branches
        try {
            const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
            if (bList && filterBranch) {
                const existing = filterBranch.value;
                filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                filterBranch.value = existing || 'all';
            }
        } catch(e) { console.warn('Could not fetch branches', e); }

        const loadRevenueData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_revenue_summary', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (sumError) console.warn('KPI fetch error:', sumError);
                
                let rev = 0, coll = 0, pend = 0, ref = 0;
                if (sumData) {
                    const rows = Array.isArray(sumData) ? sumData : [sumData];
                    rows.forEach(row => {
                        if(row) {
                            rev += Number(row.total_revenue || row.total || 0);
                            coll += Number(row.collected_amount || row.paid_amount || 0);
                            pend += Number(row.pending_amount || row.due_amount || 0);
                            ref += Number(row.refunded_amount || 0);
                        }
                    });
                }
                data.kpi1.value = formatCurrency(rev);
                data.kpi2.value = formatCurrency(coll);
                data.kpi3.value = formatCurrency(pend);
                data.kpi4.value = formatCurrency(ref);
                data.kpi1.label = 'Total Revenue';
                data.kpi2.label = 'Collected';
                data.kpi3.label = 'Pending';
                data.kpi4.label = 'Refunded';
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Line Chart
                const { data: trendData, error: trendError } = await supabase.rpc('get_revenue_trend', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (trendError) console.warn('Trend fetch error:', trendError);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.revenue)));
                    } else {
                        renderTrendChart([], []);
                    }
                }

                // 3. Donut Chart
                const { data: splitData, error: splitError } = await supabase.rpc('get_revenue_split', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (splitError) console.warn('Split fetch error:', splitError);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.category || 'Other'), splitData.map(s => Number(s.revenue || 0)));
                } else {
                    renderDistributionChart([], []);
                }

                // 4. Data Table (Level 1 Master View)
                data.headers = ['Transaction ID', 'Type', 'Total Amount', 'Collected', 'Due', 'Refunded'];
                
                const { data: tData, error: tError } = await supabase.rpc('get_revenue_table', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });

                if (tError) console.warn('Table fetch error:', tError);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const refId = r.reference_id || 'Unknown';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const total = formatCurrency(r.total_amount);
                        const paid = formatCurrency(r.paid_amount);
                        
                        let dueText = 'â€”';
                        if (r.due_amount > 0) dueText = `<span style="color: #ef4444; font-weight: 600;">${formatCurrency(r.due_amount)}</span>`;
                        
                        let refText = 'â€”';
                        if (r.refunded_amount > 0) refText = `<span style="color: #f59e0b; font-weight: 600;">${formatCurrency(r.refunded_amount)}</span>`;
                        
                        const rawHtml = `<tr style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" data-action="drilldown" data-ref="${refId}">
                            <td style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</td>
                            <td><span class="status-pill active">${sType}</span></td>
                            <td>${total}</td>
                            <td style="color: #10b981; font-weight:500;">${paid}</td>
                            <td>${dueText}</td>
                            <td>${refText}</td>
                        </tr>`;

                        return { rawHtml };
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }
            } catch (err) {
                console.error('Critical exception in loadRevenueData:', err);
                renderTrendChart([], []);
                renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        if (btnApply) btnApply.addEventListener('click', loadRevenueData);
        loadRevenueData();

        // Level 2 Drilldown Handler
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            tableBody.addEventListener('click', async (e) => {
                const tr = e.target.closest('tr[data-action="drilldown"]');
                if (!tr) return;
                const refId = tr.getAttribute('data-ref');
                if (!refId || refId === 'Unknown') return;
                
                // Show modal logic
                let modalOverlay = document.getElementById('drilldownModalOverlay');
                if (!modalOverlay) {
                    modalOverlay = document.createElement('div');
                    modalOverlay.id = 'drilldownModalOverlay';
                    modalOverlay.className = 'modal-overlay active';
                    modalOverlay.style.zIndex = '9999';
                    modalOverlay.innerHTML = `
                        <div class="modal-container" style="max-width: 800px; width: 90%;">
                            <div class="modal-header">
                                <div class="header-titles">
                                    <h2>Transaction Drill-down</h2>
                                    <p class="subtitle" id="drilldownSubtitle">Ledger entries for transaction</p>
                                </div>
                                <button class="modal-close" onclick="document.getElementById('drilldownModalOverlay').classList.remove('active')"><i data-feather="x"></i></button>
                            </div>
                            <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; max-height: 60vh;">
                                <table class="custom-table" style="width: 100%;">
                                    <thead>
                                        <tr>
                                            <th>Date Executed</th>
                                            <th>Payment Method</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody id="drilldownTbody">
                                        <tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modalOverlay);
                    if (window.feather) feather.replace();
                } else {
                    modalOverlay.classList.add('active');
                    document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
                }

                document.getElementById('drilldownSubtitle').textContent = `Ledger history for Ref: #${refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId}`;

                try {
                    const { data: logs, error } = await supabase
                        .from('business_transactions')
                        .select('*')
                        .eq('reference_id', refId)
                        .order('created_at', { ascending: false });

                    if (error || !logs || logs.length === 0) {
                        document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No logs found.</td></tr>';
                        return;
                    }

                    document.getElementById('drilldownTbody').innerHTML = logs.map(log => {
                        const date = new Date(log.created_at).toLocaleString();
                        const method = log.payment_method ? log.payment_method.toUpperCase() : 'â€”';
                        const amount = formatCurrency(log.amount);
                        let statusHtml = '';
                        if (log.status === 'paid') statusHtml = '<span class="status-pill completed">Paid</span>';
                        else if (log.status === 'refunded') statusHtml = '<span class="status-pill cancelled" style="background:#fef3c7; color:#d97706;">Refunded</span>';
                        else statusHtml = '<span class="status-pill pending" style="text-transform: capitalize;">' + (log.status || 'Pending') + '</span>';
                        const notes = log.notes || 'â€”';

                        return `<tr>
                            <td>${date}</td>
                            <td style="font-weight: 600;">${method}</td>
                            <td>${amount}</td>
                            <td>${statusHtml}</td>
                            <td style="color: #64748b; font-size: 0.8rem;">${notes}</td>
                        </tr>`;
                    }).join('');
                } catch (err) {
                    document.getElementById('drilldownTbody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color:red;">Failed to fetch logs.</td></tr>';
                }
            });
        }

}

async function renderFinPayments(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadPaymentsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_payments_summary', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_collected || 0);
                        data.kpi2.value = Number(row.total_payments || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.cash_amount || 0);
                        data.kpi4.value = formatCurrency(row.upi_amount || 0);
                        data.kpi5.value = formatCurrency(row.card_amount || 0);
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = 'â‚¹0';
                    data.kpi4.value = 'â‚¹0';
                    data.kpi5.value = 'â‚¹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4, data.kpi5);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_payments_trend', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_payments_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_payments_split', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_payments_split Error:', e3);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.method ? s.method.toUpperCase() : 'Other'), splitData.map(s => Number(s.amount || 0)));
                } else renderDistributionChart([], []);

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_payments_table', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_payments_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const paidAt = r.paid_at ? new Date(r.paid_at).toLocaleString() : 'â€”';
                        const refId = r.reference_id || 'â€”';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const method = (r.payment_method || 'Unknown').toUpperCase();
                        const amount = formatCurrency(r.amount);
                        
                        return [
                            paidAt, 
                            `<span style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</span>`, 
                            `<span class="status-pill active" style="background:#e0e7ff; color:#4338ca;">${sType}</span>`, 
                            `<strong style="color:#334155;">${method}</strong>`, 
                            `<strong style="color:#10b981;">${amount}</strong>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                renderTrendChart([], []); renderDistributionChart([], []); updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadPaymentsData);
            loadPaymentsData();
        });

}

async function renderFinRefunds(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadRefundsData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_refunds_summary', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        const tRefunded = Number(row.total_refunded || 0);
                        const tRefunds = Number(row.total_refunds || 0);
                        const avgRefund = tRefunds > 0 ? (tRefunded / tRefunds) : 0;
                        
                        data.kpi1.value = formatCurrency(tRefunded);
                        data.kpi2.value = tRefunds.toLocaleString();
                        data.kpi3.value = formatCurrency(avgRefund);
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = 'â‚¹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_refunds_trend', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_refunds_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_refunds_split', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_refunds_split Error:', e3);
                if (typeof renderDistributionChart === 'function') {
                    if (splitData && splitData.length > 0) {
                        renderDistributionChart(splitData.map(s => s.category ? s.category.toUpperCase() : 'OTHER'), splitData.map(s => Number(s.amount || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_refunds_table', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_refunds_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const createdDate = r.created_at ? new Date(r.created_at).toLocaleString() : 'â€”';
                        const refId = r.reference_id || 'â€”';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        const method = (r.payment_method || 'Unknown').toUpperCase();
                        const amount = formatCurrency(r.amount);
                        const notes = r.notes || 'â€”';
                        
                        return [
                            createdDate, 
                            `<span style="font-family: monospace; font-weight: 600; color: #6366f1;">#${shortRef}</span>`, 
                            `<span class="status-pill active" style="background:#fef3c7; color:#d97706;">${sType}</span>`, 
                            `<strong style="color:#475569;">${method}</strong>`, 
                            `<strong style="color:#ef4444;">${amount}</strong>`,
                            `<span style="color:#94a3b8; font-size:0.875rem;">${notes}</span>`
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadRefundsData);
            loadRefundsData();
        });

}

async function renderFinPendingDues(data, supabase) {
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);

        if (filterStart && filterEnd) {
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        const initializeBranchDropdown = async () => {
            try {
                const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
                if (bList && filterBranch) {
                    const existing = filterBranch.value;
                    filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                    filterBranch.value = existing || 'all';
                }
            } catch(e) { }
        };

        const loadDuesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_dues_summary', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                
                if (sumData) {
                    const row = Array.isArray(sumData) ? sumData[0] : sumData;
                    if (row) {
                        data.kpi1.value = formatCurrency(row.total_due || 0);
                        data.kpi2.value = Number(row.pending_transactions || 0).toLocaleString();
                        data.kpi3.value = formatCurrency(row.avg_due || 0);
                    }
                } else {
                    data.kpi1.value = 'â‚¹0';
                    data.kpi2.value = '0';
                    data.kpi3.value = 'â‚¹0';
                }
                updateKPIs(data.kpi1, data.kpi2, data.kpi3);

                // 2. Trend Chart
                const { data: trendData, error: e2 } = await supabase.rpc('get_dues_trend', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e2) console.warn('get_dues_trend Error:', e2);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.due_amount || 0)));
                    } else renderTrendChart([], []);
                }

                // 3. Distribution Donut Chart
                const { data: splitData, error: e3 } = await supabase.rpc('get_dues_split', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e3) console.warn('get_dues_split Error:', e3);
                if (typeof renderDistributionChart === 'function') {
                    if (splitData && splitData.length > 0) {
                        renderDistributionChart(splitData.map(s => s.category ? s.category.toUpperCase() : 'OTHER'), splitData.map(s => Number(s.due_amount || 0)));
                    } else renderDistributionChart([], []);
                }

                // 4. Data Table
                const { data: tData, error: e4 } = await supabase.rpc('get_dues_table', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (e4) console.warn('get_dues_table Error:', e4);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const refId = r.reference_id || 'Unknown';
                        const shortRef = refId.includes('-') ? refId.split('-')[0].toUpperCase() : refId; 
                        const sType = (r.reference_type || 'Unknown').toUpperCase();
                        
                        const total = formatCurrency(r.total_amount || 0);
                        const paid = formatCurrency(r.paid_amount || 0);
                        const due = formatCurrency(r.due_amount || 0);
                        
                        // Enforce Due styling
                        const dueHtml = `<span style="color: #ef4444; font-weight: 600;">${due}</span>`;
                        // Action button embedding the ID for quick collections
                        const actionHtml = `<button class="btn-primary" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 6px; background: #6366f1;" onclick="alert('Collect action clicked for Ref: ${refId}')">Collect</button>`;

                        return [
                            `<span style="font-family: monospace; font-weight: 600; color: #475569;">#${shortRef}</span>`, 
                            `<span class="status-pill pending" style="text-transform:uppercase;">${sType}</span>`, 
                            total, 
                            `<strong style="color:#10b981;">${paid}</strong>`, 
                            dueHtml,
                            actionHtml
                        ];
                    });
                    updateTable(data.headers, tRows);
                } else updateTable(data.headers, []);

            } catch (err) {
                console.error('Data fetch fault:', err);
                if(typeof renderTrendChart==='function') renderTrendChart([], []); 
                if(typeof renderDistributionChart==='function') renderDistributionChart([], []); 
                updateTable(data.headers, []);
            }
        };

        initializeBranchDropdown().then(() => {
            if (btnApply) btnApply.addEventListener('click', loadDuesData);
            loadDuesData();
        });

}

async function renderExpenses(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR EXPENSES ---
        const companyId = localStorage.getItem('company_id');
        const filterStart = document.getElementById('filterStartDate');
        const filterEnd = document.getElementById('filterEndDate');
        const filterBranch = document.getElementById('filterBranch');
        const btnApply = document.getElementById('btnApplyFilters');

        if (!companyId) {
            updateTable(data.headers, []);
            return;
        }

        // Set Default Dates
        if (filterStart && filterEnd) {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            if (!filterStart.value) filterStart.value = firstDay.toISOString().split('T')[0];
            if (!filterEnd.value) filterEnd.value = today.toISOString().split('T')[0];
        }

        // Fetch Branches
        try {
            const { data: bList } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', companyId);
            if (bList && filterBranch) {
                const existing = filterBranch.value;
                filterBranch.innerHTML = '<option value="all">All Branches</option>' + bList.map(b => `<option value="${b.branch_id}">${b.branch_name}</option>`).join('');
                filterBranch.value = existing || 'all';
            }
        } catch(e) { console.warn('Could not fetch branches', e); }

        const loadExpensesData = async () => {
            const start = filterStart ? filterStart.value : '2000-01-01';
            const end = filterEnd ? filterEnd.value : '2099-12-31';
            const bid = (filterBranch && filterBranch.value !== 'all') ? filterBranch.value : null;

            try {
                // 1. KPI Summary
                const { data: sumData, error: sumError } = await supabase.rpc('get_expenses_summary', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (sumError) console.warn('KPI fetch error:', sumError);
                
                let totalExp = 0, totalEntries = 0, avgExp = 0;
                if (sumData && sumData.length > 0) {
                    const row = sumData[0];
                    totalExp = Number(row.total_expenses || 0);
                    totalEntries = Number(row.total_entries || 0);
                    avgExp = Number(row.avg_expense || 0);
                }
                
                data.kpi1.label = 'Total Expenses';
                data.kpi1.value = formatCurrency(totalExp);
                data.kpi2.label = 'Number of Entries';
                data.kpi2.value = totalEntries.toString();
                data.kpi3.label = 'Avg Expense';
                data.kpi3.value = formatCurrency(Math.round(avgExp));
                data.kpi4 = null;
                
                updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);

                // 2. Trend Line Chart
                const { data: trendData, error: trendError } = await supabase.rpc('get_expenses_trend', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (trendError) console.warn('Trend fetch error:', trendError);
                if (typeof renderTrendChart === 'function') {
                    if (trendData && trendData.length > 0) {
                        renderTrendChart(trendData.map(t => new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})), trendData.map(t => Number(t.amount)));
                    } else {
                        renderTrendChart([], []);
                    }
                }

                // 3. Donut Chart
                const { data: splitData, error: splitError } = await supabase.rpc('get_expenses_split', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });
                if (splitError) console.warn('Split fetch error:', splitError);
                if (splitData && splitData.length > 0) {
                    renderDistributionChart(splitData.map(s => s.category || 'Other'), splitData.map(s => Number(s.amount || 0)));
                } else {
                    renderDistributionChart([], []);
                }

                // 4. Data Table
                data.headers = ['Date', 'Category', 'Amount', 'Notes', 'Status'];
                
                const { data: tData, error: tError } = await supabase.rpc('get_expenses_table', {
                    p_company_id: companyId, p_branch_id: bid, p_start_date: start, p_end_date: end
                });

                if (tError) console.warn('Table fetch error:', tError);
                if (tData && tData.length > 0) {
                    const tRows = tData.map(r => {
                        const date = r.date ? new Date(r.date).toLocaleDateString() : 'â€”';
                        const cat = r.category || 'Other';
                        const amt = formatCurrency(Number(r.amount || 0));
                        const notes = r.notes || 'â€”';
                        
                        let sType = (r.status || 'completed').toLowerCase();
                        let statusHtml = '<span class="status-pill active">Active</span>';
                        if (sType === 'deleted' || sType === 'cancelled') {
                           statusHtml = '<span class="status-pill cancelled">Deleted</span>';
                        } else if (sType === 'pending') {
                           statusHtml = '<span class="status-pill pending">Pending</span>';
                        } else {
                           statusHtml = `<span class="status-pill completed">${r.status || 'Completed'}</span>`;
                        }

                        return [date, cat, amt, notes, statusHtml];
                    });
                    updateTable(data.headers, tRows);
                } else {
                    updateTable(data.headers, []);
                }
            } catch (err) {
                console.error('Critical exception in loadExpensesData:', err);
                renderTrendChart([], []);
                renderDistributionChart([], []);
                updateTable(data.headers, []);
            }
        };

        if (btnApply) btnApply.addEventListener('click', loadExpensesData);
        loadExpensesData();

}

const handlers = {
    'fin-revenue': renderFinRevenue,
    'fin-payments': renderFinPayments,
    'fin-refunds': renderFinRefunds,
    'fin-pending-dues': renderFinPendingDues,
    'expenses': renderExpenses,
    'fin-expenses': renderExpenses,
    'financial': async (data) => { updateTable(data.headers, data.rows || []); },
    'fin-discounts': async (data) => { updateTable(data.headers, data.rows || []); }
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
