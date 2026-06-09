import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- State ---
    let allPayments = [];
    let filteredPayments = [];
    let currentFilter = { status: [], staff: [], dateRange: 'All' };
    let activeBookingId = null; 

    // --- Helpers ---
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            const id = ctx.company?.id || localStorage.getItem('company_id');
            console.log('[PP] Detected Company ID:', id);
            return id;
        } catch (e) { 
            const id = localStorage.getItem('company_id');
            console.log('[PP] Detected Company ID (fallback):', id);
            return id; 
        }
    }

    function getBranchId() {
        const id = localStorage.getItem('active_branch_id');
        console.log('[PP] Detected Branch ID:', id);
        return id;
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

    // ─── FETCH DATA ────────────────────────────────────────────────────────
    async function fetchPayments() {
        showLoading(true);
        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            if (!companyId) {
                console.error('No company ID found');
                return;
            }

            // Parallel fetch for Bookings, Products and Memberships
            const [bookingRes, productRes, membershipRes] = await Promise.all([
                supabase
                    .from('bookings_for_business_transaction')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .eq('payment_status', 'pending'),
                supabase
                    .from('product_pending_payments_view')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId),
                // Query pending_membership_payments view
                supabase
                    .from('pending_membership_payments')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
            ]);
    
            if (bookingRes.error) throw bookingRes.error;
            if (productRes.error) throw productRes.error;
            if (membershipRes.error) {
                console.warn('[PP] pending_membership_payments fetch error:', membershipRes.error.message);
            }

            // Map Bookings directly from bookings_for_business_transaction
            const bookings = (bookingRes.data || []).map(b => {
                const total = Number(b.final_amount ?? b.total_price ?? 0);
                return {
                    ...b,
                    service_name: b.service_name || '-',
                    total,
                    paid:  0,
                    due:   total,
                    status: b.payment_status || 'pending',
                    ref_type: 'booking'
                };
            });
    
            // Map Products (standardize columns to match table)
            const products = (productRes.data || []).map(p => ({
                booking_id: p.sale_id,
                customer_name: p.customer_name,
                service_name: p.product_list || 'Product Sale',
                booking_date: p.sale_date,
                start_time: '', 
                total: p.total_amount,
                paid: p.amount_paid,
                due: p.balance,
                status: p.payment_status,
                ref_type: 'product',
                company_id: p.company_id,
                branch_id: p.branch_id
            }));

            // Map Memberships from pending_membership_payments view
            const memberships = (membershipRes.data || []).map(m => {
                const total = Number(m.total_amount || 0);
                const paid  = Number(m.amount_paid || 0);
                const due   = Number(m.balance || 0);
                return {
                    booking_id:    m.purchase_id,
                    customer_name: m.customer_name || 'Unknown Customer',
                    service_name:  m.plan_name || 'Membership',
                    booking_date:  m.purchase_date,
                    start_time:    '',
                    total,
                    paid,
                    due,
                    status:        m.payment_status || 'pending',
                    ref_type:      'membership',
                    company_id:    m.company_id,
                    branch_id:     m.branch_id
                };
            });
    
            allPayments = [...bookings, ...products, ...memberships];
            allPayments.sort((a, b) => new Date(b.booking_date) - new Date(a.booking_date));
            applyAllFilters();

        } catch (err) {
            console.error('[PP] Critical Fetch Error:', err);
            ppShowToast('Failed to load payments', true);
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
            const due = Number(row.due) || (total - paid);
            const status = (row.status || 'unpaid').toLowerCase();

            let statusBadge = '';
            if (status === 'partial') {
                statusBadge = `<span style="display:inline-flex; align-items:center; gap:4px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Partial</span>`;
            } else {
                statusBadge = `<span style="display:inline-flex; align-items:center; gap:4px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:20px; padding:3px 10px; font-size:0.73rem; font-weight:600;">Unpaid</span>`;
            }

            const tr = document.createElement('tr');
            tr.className = 'tb-row';
            tr.style.cssText = 'border-bottom:1px solid #f1f5f9; transition:background 0.12s;';
            tr.onmouseover = () => tr.style.background = '#f8fafc';
            tr.onmouseout  = () => tr.style.background = '';

            const dateStr = row.booking_date ? new Date(row.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
            const timeStr = row.start_time || '';

            let typePill = '';
            if (row.ref_type === 'membership') {
                typePill = `<span style="display:inline-block;margin-left:6px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:10px;padding:1px 7px;font-size:0.68rem;font-weight:600;vertical-align:middle;">Membership</span>`;
            } else if (row.ref_type === 'product') {
                typePill = `<span style="display:inline-block;margin-left:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:10px;padding:1px 7px;font-size:0.68rem;font-weight:600;vertical-align:middle;">Product</span>`;
            }

            tr.innerHTML = `
                <td style="padding:14px 16px 14px 24px; color:#1e293b; font-weight:500; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.customer_name || 'Guest'}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.service_name || '-'}${typePill}</td>
                <td style="padding:14px 16px; color:#475569; font-size:0.83rem;">${dateStr} <span style="opacity:0.6; margin-left:4px;">${timeStr}</span></td>
                <td style="padding:14px 16px; color:#1e293b; font-weight:600;">₹${total.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#10b981; font-weight:500;">₹${paid.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px; color:#dc2626; font-weight:600;">₹${due.toLocaleString('en-IN')}</td>
                <td style="padding:14px 16px;">${statusBadge}</td>
                <td style="padding:14px 16px;">
                    <button data-sub-feature="pending_payments_collect" onclick="ppOpenCollect('${row.booking_id}')" style="height:32px; padding:0 14px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:7px; font-size:0.8rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                        <i data-feather="credit-card" style="width:13px; height:13px;"></i> Collect
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
            // Search
            const matchesSearch = !term || 
                (r.booking_id || '').toLowerCase().includes(term) ||
                (r.customer_name || '').toLowerCase().includes(term);
            
            // Status
            const matchesStatus = currentFilter.status.length === 0 || 
                                 currentFilter.status.some(fs => (r.status || '').toLowerCase() === fs.toLowerCase());
            
            // Date Range
            let matchesDate = true;
            if (currentFilter.dateRange !== 'All' && r.booking_date) {
                const today = new Date();
                const rowDate = new Date(r.booking_date);
                const diffTime = Math.abs(today - rowDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (currentFilter.dateRange === 'Today') {
                    matchesDate = rowDate.toDateString() === today.toDateString();
                } else if (currentFilter.dateRange === 'Last 7 days') {
                    matchesDate = diffDays <= 7;
                } else if (currentFilter.dateRange === 'Last 30 days') {
                    matchesDate = diffDays <= 30;
                } else if (currentFilter.dateRange === 'This Month') {
                    matchesDate = rowDate.getMonth() === today.getMonth() && rowDate.getFullYear() === today.getFullYear();
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

    // ─── FILTER ────────────────────────────────────────────────────────────
    window.ppApplyFilter = function() {
        document.getElementById('ppFilterMenu').style.display = 'none';
        currentFilter.status = [...document.querySelectorAll('.pp-filter-status:checked')].map(cb => cb.value);
        currentFilter.staff  = [...document.querySelectorAll('.pp-filter-staff:checked')].map(cb => cb.value);
        applyAllFilters();
    };

    window.ppClearFilter = function() {
        document.querySelectorAll('.pp-filter-status, .pp-filter-staff').forEach(cb => cb.checked = false);
        currentFilter.status = [];
        currentFilter.staff = [];
        applyAllFilters();
        document.getElementById('ppFilterMenu').style.display = 'none';
    };

    // ─── DATE RANGE ────────────────────────────────────────────────────────
    window.ppSetDateRange = function(range) {
        currentFilter.dateRange = range;
        document.getElementById('ppDateLabel').textContent = range;
        document.getElementById('ppDateMenu').style.display = 'none';
        applyAllFilters();
    };

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const fm = document.getElementById('ppFilterMenu');
        const dm = document.getElementById('ppDateMenu');
        if (fm && !e.target.closest('#ppFilterMenu') && !e.target.closest('button[onclick*="ppFilterMenu"]')) fm.style.display = 'none';
        if (dm && !e.target.closest('#ppDateMenu') && !e.target.closest('button[onclick*="ppDateMenu"]')) dm.style.display = 'none';
    });

    // ─── COLLECT PAYMENT MODAL ─────────────────────────────────────────────
    window.ppOpenCollect = function(bookingId) {
        activeBookingId = bookingId;
        const row = allPayments.find(p => p.booking_id === bookingId);
        if (!row) return;

        const total = Number(row.total) || 0;
        const paid = Number(row.paid) || 0;
        const due = total - paid;

        // Extract customer ID if possible (though the view might not expose customer_id directly,
        // we can try to look it up or just pass the name)
        const customerId = row.customer_id || null; 

        if (window.openGlobalPaymentModal) {
            window.openGlobalPaymentModal({
                saleId: row.booking_id,
                customerId: customerId,
                customerName: row.customer_name || 'Guest',
                totalAmount: due, // Pending payments usually collect the remaining due
                amountDue: due,
                isMembershipPurchase: row.ref_type === 'membership',
                onComplete: async (payload) => {
                    await processPendingPayment(payload, row);
                }
            });
        } else {
            ppShowToast('Global payment modal not loaded', true);
        }
    };

    // Record Payment (Callback from Global Modal)
    async function processPendingPayment(payload, row) {
        const amount = payload.amountCollected;
        const payMethod = payload.paymentMethod;

        try {
            const companyId = getCompanyId();
            const branchId = getBranchId();

            // Read user ID from appContext (correct source — user_id is NOT stored separately)
            let userId = null;
            try {
                const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                userId = ctx.user?.user_id || ctx.user?.id || null;
            } catch (e) {}

            // Strip 'Z' suffix — business_transactions.paid_at is 'timestamp without time zone'
            const paidAt = new Date().toISOString().replace('Z', '');

            // For memberships: update membership_purchases AND record in business_transactions
            if (row.ref_type === 'membership') {
                const newPaid = (Number(row.paid) || 0) + amount;
                const newStatus = newPaid >= (Number(row.total) || 0) ? 'completed' : 'partial';

                // 1. Update membership_purchases (only status, amount is calculated from business_transactions)
                const { error: memErr } = await supabase
                    .from('membership_purchases')
                    .update({ payment_status: newStatus })
                    .eq('purchase_id', activeBookingId);
                if (memErr) throw memErr;

                // 2. Also record in business_transactions (for Sales History / Revenue reports)
                const { error: txError } = await supabase
                    .from('business_transactions')
                    .insert({
                        company_id:     companyId,
                        branch_id:      branchId,
                        reference_id:   activeBookingId,
                        reference_type: 'membership',
                        amount:         amount,
                        currency:       'INR',
                        payment_method: payMethod.toLowerCase(),
                        status:         'paid',
                        notes:          `Membership payment — ${row.service_name || 'Plan'} (${row.customer_name || ''})`,
                        created_by:     userId,
                        paid_at:        paidAt
                    });
                if (txError) {
                    console.error('[PP] business_transactions insert failed for membership:', txError);
                }
            } else {
                // 1. Insert into business_transactions (financial ledger)
                const { error: txError } = await supabase
                    .from('business_transactions')
                    .insert({
                        company_id:     companyId,
                        branch_id:      branchId,
                        reference_id:   activeBookingId,
                        reference_type: row.ref_type || 'booking',
                        amount:         amount,
                        currency:       'INR',
                        payment_method: payMethod.toLowerCase(),
                        status:         'paid',
                        notes:          `Payment for ${row.ref_type || 'booking'} ${activeBookingId.substring(0,8)}`,
                        created_by:     userId,
                        paid_at:        paidAt
                    });
                if (txError) throw txError;

                // 2. Update bookings_for_business_transaction with payment + discount details
                if (row.ref_type === 'booking') {
                    const totalOriginal = Number(row.total) || 0;
                    const totalDiscount = totalOriginal - amount;

                    // Determine primary discount source from payload
                    const d = payload.discounts || {};
                    let discountType = null;
                    let discountName = null;
                    if (d.couponCode) {
                        discountType = 'coupon';
                        discountName = d.couponCode;
                    } else if (d.offerName) {
                        discountType = 'offer';
                        discountName = d.offerName;
                    } else if (d.membershipName) {
                        discountType = 'membership';
                        discountName = d.membershipName;
                    } else if (d.manualValue > 0) {
                        discountType = 'manual';
                        discountName = d.manualType === 'percent'
                            ? `${d.manualValue}% off`
                            : `₹${d.manualValue} off`;
                    }

                    const { error: bftError } = await supabase
                        .from('bookings_for_business_transaction')
                        .update({
                            payment_status:  'paid',
                            final_amount:    amount,
                            discount_amount: totalDiscount > 0 ? totalDiscount : null,
                            discount_type:   discountType,
                            discount_name:   discountName,
                            updated_at:      new Date().toISOString()
                        })
                        .eq('booking_id', activeBookingId);
                    if (bftError) console.error('[PP] Failed to update bookings_for_business_transaction:', bftError);
                }
            }

            ppShowToast('Payment recorded successfully!');
            activeBookingId = null;
            
            // Re-fetch data to update the view
            await fetchPayments();
            
            // Dispatch custom event for other modules
            document.dispatchEvent(new CustomEvent('payment-recorded', {
                detail: { bookingId: row.booking_id, amount: amount }
            }));

            // Force refetch on Bookings if it exists in the current session
            if (typeof window.fetchBookings === 'function') {
                await window.fetchBookings();
            }

        } catch (err) {
            console.error('[PP] Error recording payment:', err);
            ppShowToast('Failed to record payment: ' + (err.message || 'Unknown error'), true);
            throw err; // Re-throw to keep modal open
        }
    }

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
    fetchPayments();
});
