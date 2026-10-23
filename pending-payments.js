import { supabase } from './lib/supabase.js';
import { openBookingPayment } from './scripts/bookings/booking-payment-bridge.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- State ---
    let allPayments = [];
    let filteredPayments = [];
    let currentFilter = { status: [], staff: [], dateRange: { type: 'all' } };

    // --- Helpers ---
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch (e) {
            return localStorage.getItem('company_id') || null;
        }
    }

    function getBranchId() {
        const fromDom = document.getElementById('branchSelect')?.value;
        const fromStorage = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
        const bId = (fromDom && fromDom !== 'branch_1' && fromDom !== 'branch_2' && fromDom !== 'all')
            ? fromDom
            : (fromStorage && fromStorage !== 'branch_1' && fromStorage !== 'branch_2' && fromStorage !== 'all' ? fromStorage : null);
        return bId || null;
    }

    function showLoading(isLoading) {
        const tbody = document.getElementById('ppTableBody');
        if (!tbody) return;
        if (isLoading) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:60px;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                            <i data-feather="loader" style="width:32px; height:32px; color:#6366f1; animation: spin 1s linear infinite;"></i>
                            <p style="color:#64748b; font-weight:500;">Fetching pending payments...</p>
                        </div>
                    </td>
                </tr>`;
            if (window.feather) feather.replace();
        }
    }

    // ─── FETCH DATA (Bookings with Pending Payments Only) ────────────────────────
    async function fetchPayments() {
        showLoading(true);
        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId) {
                console.warn('[PP] No company ID found, cannot fetch pending payments.');
                showLoading(false);
                return;
            }

            let query = supabase
                .from('bookings_for_business_transaction')
                .select('*')
                .eq('payment_status', 'pending')
                .in('status', ['booked', 'confirmed'])
                .order('booking_date', { ascending: false });

            if (companyId) {
                query = query.eq('company_id', companyId);
            }
            if (branchId && branchId !== 'branch_1' && branchId !== 'branch_2' && branchId !== 'all') {
                query = query.eq('branch_id', branchId);
            }

            const { data, error } = await query;
            if (error) throw error;

            allPayments = (data || []).map(b => {
                const total = Number(b.final_amount ?? b.total_price ?? 0);
                return {
                    ...b,
                    service_name: b.service_name || '-',
                    staff_name: b.staff_name || '-',
                    total,
                    paid: 0,
                    due: total,
                    payment_status: b.payment_status || 'pending',
                    status: b.status || 'booked',
                    ref_type: 'booking'
                };
            });

            applyAllFilters();

            // Check for overdue payments
            const todayStr = new Date().toISOString().split('T')[0];
            const overdueCount = allPayments.filter(p => p.booking_date && p.booking_date < todayStr).length;
            if (overdueCount > 0 && window.notifyEvent) {
                window.notifyEvent('payments', 'evt_payment_overdue', {
                    title: 'Overdue Payment Alert',
                    message: `You have ${overdueCount} overdue pending payment(s).`
                });
            }

        } catch (err) {
            console.error('[PP] Critical Fetch Error:', err);
            ppShowToast('Failed to load payments', true);
            const tbody = document.getElementById('ppTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center; padding:48px 24px; color:#ef4444;">
                            <p style="font-weight:600; margin:0;">Failed to load pending payments</p>
                            <p style="font-size:0.8rem; color:#64748b; margin-top:4px;">${err.message || 'Please check your connection and try again.'}</p>
                        </td>
                    </tr>`;
            }
        }
    }

    // ─── RENDER TABLE ──────────────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('ppTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (filteredPayments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:52px 24px; color:#94a3b8;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                            <i data-feather="check-circle" style="width:36px; height:36px; color:#c7d2fe;"></i>
                            <p style="font-weight:600; color:#64748b; margin:0;">No pending payments</p>
                            <p style="font-size:0.82rem; margin:0;">Everything is up to date!</p>
                        </div>
                    </td>
                </tr>`;
            if (window.feather) feather.replace();
            return;
        }

        filteredPayments.forEach((row) => {
            const total = Number(row.total) || 0;
            const paid = Number(row.paid) || 0;
            const status = (row.status || 'unpaid').toLowerCase();

            let statusPillClass = 'tb-payment-pending';
            let statusLabel = 'UNPAID';
            if (status === 'partial') {
                statusPillClass = 'tb-payment-partial';
                statusLabel = 'PARTIAL';
            }

            const tr = document.createElement('tr');
            tr.className = 'tb-row';

            const dateStr = row.booking_date ? new Date(row.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

            let timeStr = '-';
            if (row.start_time) {
                const parts = row.start_time.split(':');
                if (parts.length >= 2) {
                    let h = parseInt(parts[0], 10);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    h = h % 12 || 12;
                    timeStr = `${h}:${parts[1]} ${ampm}`;
                } else {
                    timeStr = row.start_time;
                }
            }

            let serviceHtml = '-';
            const rawServices = (row.service_name || '').split(',').map(s => s.trim()).filter(Boolean);
            if (rawServices.length === 1) {
                serviceHtml = `<span style="display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;" title="${rawServices[0]}">${rawServices[0]}</span>`;
            } else if (rawServices.length > 1) {
                const first = rawServices[0];
                const rest = rawServices.length - 1;
                const fullList = rawServices.join(', ');
                serviceHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="const e=this.nextElementSibling; e.style.display=e.style.display==='none'?'block':'none'">
                            <span style="display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;" title="${first}">${first}</span>
                            <span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600; transition:background 0.2s;" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'">+${rest}</span>
                        </div>
                        <div style="display:none; font-size:0.8rem; color:#64748b; line-height:1.4; padding-left:2px; padding-top:2px; white-space:normal;">
                            ${fullList}
                        </div>
                    </div>
                `;
            }

            let staffHtml = '-';
            const rawStaff = (row.staff_name || '').split(',').map(s => s.trim()).filter(Boolean);
            if (rawStaff.length === 1) {
                staffHtml = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:500;">${rawStaff[0]}</span>`;
            } else if (rawStaff.length > 1) {
                const firstS = rawStaff[0];
                const restS = rawStaff.length - 1;
                const fullListS = rawStaff.join(', ');
                staffHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="event.stopPropagation(); const e=this.nextElementSibling; e.style.display=e.style.display==='none'?'block':'none'">
                            <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:500;">${firstS}</span>
                            <span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:12px; font-size:0.7rem; font-weight:600; border:1px solid #cbd5e1;">+${restS}</span>
                        </div>
                        <div style="display:none; font-size:0.75rem; color:#64748b; line-height:1.4; padding-left:2px; padding-top:2px; white-space:normal;">
                            ${fullListS}
                        </div>
                    </div>
                `;
            }

            const bookingIdAttr = row.booking_id || row.id;

            tr.innerHTML = `
                <td style="padding:14px 16px 14px 24px; color:#475569; font-weight:600; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.customer_name || 'Guest'}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.875rem;">${serviceHtml}</td>
                <td style="padding:14px 16px; color:#475569;">${staffHtml}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.83rem;">${dateStr}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.83rem; font-weight:500;">${timeStr || '-'}</td>
                <td style="padding:14px 16px;">
                    <span style="display:inline-block; padding:4px 12px; background:#d1fae5; color:#059669; border:1px solid #a7f3d0; border-radius:9999px; font-size:0.75rem; font-weight:700;">₹${total.toLocaleString('en-IN')}</span>
                </td>
                <td style="padding:14px 16px;">
                    <span class="tb-status-pill ${statusPillClass}" style="text-transform: uppercase; font-size: 0.7rem;">${statusLabel}</span>
                </td>
                <td style="padding:14px 16px;">
                    <button data-sub-feature="pending_payments_collect" onclick="ppOpenCollect('${bookingIdAttr}')" title="Collect Payment"
                        style="background:#4f46e5; border:none; border-radius:6px; cursor:pointer; color:#ffffff; padding:5px 12px; transition:all 0.2s; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:0.78rem; font-weight:600; white-space:nowrap; box-shadow:0 1px 2px rgba(79,70,229,0.25);"
                        onmouseover="this.style.background='#4338ca';" onmouseout="this.style.background='#4f46e5';">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        Collect
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });

        if (window.feather) feather.replace();
        if (window.applySubFeatureGates) window.applySubFeatureGates();
    }

    // ─── APPLY ALL FILTERS ──────────────────────────────────────────────────
    function applyAllFilters() {
        const term = (searchInput?.value || '').trim().toLowerCase();

        filteredPayments = allPayments.filter(r => {
            // Strictly exclude cancelled and no-show bookings
            const s = (r.status || '').toLowerCase().trim();
            if (['cancelled', 'no-show', 'noshow', 'no_show'].includes(s)) {
                return false;
            }

            // Search
            const matchesSearch = !term ||
                (r.booking_id || '').toLowerCase().includes(term) ||
                (r.customer_name || '').toLowerCase().includes(term) ||
                (r.service_name || '').toLowerCase().includes(term) ||
                (r.staff_name || '').toLowerCase().includes(term);

            // Status
            const matchesStatus = currentFilter.status.length === 0 ||
                                 currentFilter.status.some(fs => (r.status || '').toLowerCase() === fs.toLowerCase());

            // Date Range
            let matchesDate = true;
            if (currentFilter.dateRange && currentFilter.dateRange.type) {
                if (currentFilter.dateRange.type !== 'all' && r.booking_date) {
                    const rowDate = new Date(r.booking_date + 'T00:00:00'); // ensuring local midnight boundary
                    const { from, to } = currentFilter.dateRange;
                    if (from && rowDate < from) matchesDate = false;
                    if (to && rowDate > to) matchesDate = false;
                }
            }

            return matchesSearch && matchesStatus && matchesDate;
        });

        renderTable();
    }

    // ─── SEARCH ────────────────────────────────────────────────────────────
    const searchInput = document.getElementById('ppSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyAllFilters);
    }

    // ─── DATE RANGE ────────────────────────────────────────────────────────
    window.ppFilterByDate = function(range) {
        const label = document.getElementById('ppDateLabel');
        const now = new Date();
        now.setHours(0, 0, 0, 0); // normalized local today
        let from = null;
        let to = null;

        if (range === 'today') {
            from = new Date(now);
            to = new Date(now);
            to.setHours(23, 59, 59, 999);
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
            const fromInput = document.getElementById('ppCustomFrom');
            const toInput   = document.getElementById('ppCustomTo');
            if (fromInput && fromInput.value) from = new Date(fromInput.value + 'T00:00:00');
            if (toInput && toInput.value) {
                to = new Date(toInput.value + 'T23:59:59');
            }
            if (label) {
                const fmtDate = (val) => {
                    if (!val) return '...';
                    const d = new Date(val + 'T00:00:00');
                    const day = d.getDate();
                    const suffix = day === 1 || day === 21 || day === 31 ? 'st'
                                 : day === 2 || day === 22 ? 'nd'
                                 : day === 3 || day === 23 ? 'rd' : 'th';
                    return `${day}${suffix} ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
                };
                label.textContent = `${fmtDate(fromInput?.value)} → ${fmtDate(toInput?.value)}`;
            }
        } else {
            if (label) label.textContent = 'Date Range';
        }

        currentFilter.dateRange = { type: range, from: from, to: to };
        applyAllFilters();
    };

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const dm = document.getElementById('ppDateMenu');
        if (dm && !e.target.closest('#ppDateMenu') && !e.target.closest('button[onclick*="ppDateMenu"]')) dm.style.display = 'none';
    });

    // ─── COLLECT PAYMENT (Invokes Shared Hardened Booking Payment Bridge) ────
    window.ppOpenCollect = function(bookingId) {
        const row = allPayments.find(p => (p.booking_id || p.id) === bookingId);
        if (!row) {
            console.error('[PP] Booking row not found for ID:', bookingId);
            ppShowToast('Booking details not found', true);
            return;
        }

        openBookingPayment(row, {
            onSuccess: async () => {
                await fetchPayments();
            }
        });
    };

    // ─── REAL-TIME SYNCHRONIZATION LISTENERS ─────────────────────────────────
    // 1. Refreshes immediately when a payment is collected anywhere in the app
    document.addEventListener('payment-recorded', async () => {
        console.log('[PP] Payment recorded event detected, refreshing...');
        await fetchPayments();
    });

    // 2. Refreshes across browser tabs when payment is completed in another tab
    window.addEventListener('storage', async (e) => {
        if (e.key === 'app_payment_sync') {
            console.log('[PP] Cross-tab payment event detected, refreshing...');
            await fetchPayments();
        }
    });

    // 3. Refreshes when branch changes
    window.addEventListener('branch-changed', async () => {
        await fetchPayments();
    });

    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect) {
        branchSelect.addEventListener('change', async () => {
            await fetchPayments();
        });
    }
    window.addEventListener('branch:changed', async () => {
        await fetchPayments();
    });
    document.addEventListener('branch:changed', async () => {
        await fetchPayments();
    });

    // ─── TOAST ─────────────────────────────────────────────────────────────
    function ppShowToast(msg, isError = false) {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = isError ? '#ef4444' : '#10b981';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ─── INIT ──────────────────────────────────────────────────────────────
    await fetchPayments();

    // Catch any delayed branch or auth context population (matching bookings.js)
    setTimeout(async () => {
        if (!allPayments || allPayments.length === 0) {
            await fetchPayments();
        }
    }, 600);
});
