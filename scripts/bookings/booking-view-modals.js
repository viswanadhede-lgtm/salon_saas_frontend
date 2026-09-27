// scripts/bookings/booking-view-modals.js
import { supabase } from '../../lib/supabase.js';
import { formatTime12, getLiveBookings } from './bookings-state.js';
import { statusBadge } from './bookings-table.js';

// ─── Refund Bridge Logic ─────────────────────────────────────────────────────
export async function openRefundModal(bookingId, optBookingObj) {
    try {
        await import('../rebook-refund-modal.js');
        if (window.openRefundModal) {
            return window.openRefundModal(bookingId, optBookingObj);
        }
    } catch (err) {
        console.error('[Refund] Failed to load rebook-refund-modal.js:', err);
    }
}

if (typeof window !== 'undefined' && !window.openRefundModal) {
    window.openRefundModal = openRefundModal;
}

export async function triggerRefund(bookingId) {
    if (typeof window.openRefundModal === 'function') {
        const liveData = window.liveBookingsData || getLiveBookings() || [];
        const b = liveData.find(x => String(x.booking_id || x.id) === String(bookingId));
        return window.openRefundModal(bookingId, b || null);
    }
    console.error('[Refund] openRefundModal not available — rebook-refund-modal.js may not be loaded.');
}

if (typeof window !== 'undefined') {
    window.triggerRefund = triggerRefund;
}

// ─── View Customer Profile ───────────────────────────────────────────────────
export async function viewCustomerProfile(customerId, customerName) {
    if (!customerId) {
        alert('Walk-in customer — no profile record found.');
        return;
    }

    const modal   = document.getElementById('customerProfileBookingModal');
    const subTitle = document.getElementById('profModalSubtitle');
    const body    = document.getElementById('profModalBody');

    if (modal) {
        modal.classList.add('active');
        subTitle.textContent = customerName || 'Loading...';
        body.innerHTML = `<div style="text-align:center;padding:48px;color:#94a3b8;font-size:0.9rem;">⏳ Loading...</div>`;
    }

    try {
        // ── 1. Fetch customer record + 3 spend sources in parallel
        let [custRes, bookingsRes, salesRes, membershipsRes, recentBkRes] = await Promise.all([
            supabase.from('customers').select('*').eq('customer_id', customerId).limit(1),
            supabase.from('bookings_for_business_transaction')
                .select('total_price').eq('customer_id', customerId).eq('status', 'completed'),
            supabase.from('sales_for_business_transactions')
                .select('final_amount').eq('customer_id', customerId),
            supabase.from('membership_purchases')
                .select('price').eq('customer_id', customerId).eq('payment_status', 'paid'),
            supabase.from('bookings_for_business_transaction')
                .select('*')
                .eq('customer_id', customerId)
                .order('booking_date', { ascending: false })
                .limit(5)
        ]);

        const customer = custRes.data && custRes.data.length > 0 ? custRes.data[0] : null;
        if (!customer) throw new Error('Customer not found.');

        // ── 2. Compute total spent
        let totalSpent = 0;
        (bookingsRes.data || []).forEach(b => totalSpent += parseFloat(b.total_price) || 0);
        (salesRes.data   || []).forEach(s => totalSpent += parseFloat(s.final_amount) || 0);
        (membershipsRes.data || []).forEach(m => totalSpent += parseFloat(m.price) || 0);

        const name      = customer.customer_name  || 'Unknown';
        const phone     = customer.customer_phone || '—';
        const email     = customer.customer_email || '—';
        const tags      = customer.tags            || 'Regular';
        const notes     = customer.notes           || '—';
        const totalVisits = (bookingsRes.data || []).length;
        const avatarUrl = customer.profile_photo ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c7d2fe&color=3730A3&size=128`;

        let joinedDate = '—';
        if (customer.created_at) {
            const d = new Date(customer.created_at);
            joinedDate = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        }

        // ── 3. Build booking history rows
        const recentBookings = recentBkRes.data || [];
        const statusColor = { completed:'#065f46', booked:'#1e40af', confirmed:'#1e40af', cancelled:'#991b1b', 'no-show':'#92400e', 'no_show':'#92400e' };
        const statusBg    = { completed:'#d1fae5', booked:'#dbeafe', confirmed:'#dbeafe', cancelled:'#fee2e2', 'no-show':'#fef3c7', 'no_show':'#fef3c7' };
        const bkRows = recentBookings.length ? recentBookings.map(bk => {
            const bkDate = bk.booking_date ? (() => { const d=new Date(bk.booking_date+'T00:00'); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })() : '—';
            const s = (bk.status||'').toLowerCase();
            const sc = statusColor[s] || '#475569';
            const sb = statusBg[s]    || '#f1f5f9';
            return `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;white-space:nowrap;">${bkDate}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:700;color:#1e293b;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${bk.service_name||'—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;">${bk.staff_name||'—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:600;color:#059669;">₹${bk.total_price||0}</td>
                <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;color:${sc};background:${sb};">${bk.status||'—'}</span></td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8;font-size:0.85rem;">No booking history found.</td></tr>`;

        // ── 4. Render 3-column layout
        body.innerHTML = `
        <div style="display:grid; grid-template-columns:210px 1fr 1.5fr; min-height:420px;">

            <!-- LEFT: Profile Card -->
            <div style="background:linear-gradient(160deg,#eef2ff 0%,#f8fafc 100%); border-right:1px solid #e2e8f0; padding:28px 20px; display:flex; flex-direction:column; align-items:center; gap:12px;">
                <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 4px #c7d2fe;">
                    <img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <div style="text-align:center;">
                    <h3 style="margin:0;font-size:1.05rem;font-weight:700;color:#1e293b;">${name}</h3>
                    <p style="margin:4px 0 0 0;font-size:0.82rem;color:#64748b;">${phone}</p>
                </div>
                <div style="width:100%;border-top:1px solid #e2e8f0;padding-top:14px;display:flex;flex-direction:column;gap:10px;">
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Total Spent</p>
                        <p style="margin:4px 0 0;font-size:1.15rem;font-weight:700;color:#059669;">₹${totalSpent.toLocaleString('en-IN')}</p>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Total Visits</p>
                        <p style="margin:4px 0 0;font-size:1.15rem;font-weight:700;color:#4f46e5;">${totalVisits}</p>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Status</p>
                        <div style="margin-top:4px;display:inline-block;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;background:#e0e7ff;color:#3730a3;">${tags}</div>
                    </div>
                </div>
            </div>

            <!-- CENTER: Details -->
            <div style="padding:24px 20px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;gap:14px;">
                <h4 style="margin:0 0 4px;font-size:0.8rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Contact & Info</h4>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Email</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;word-break:break-all;">${email}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Phone</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;">${phone}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Member Since</p>
                    <p style="margin:4px 0 0;font-size:0.88rem;color:#334155;">${joinedDate}</p>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;flex:1;">
                    <p style="margin:0;font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Notes</p>
                    <p style="margin:4px 0 0;font-size:0.85rem;color:#334155;white-space:pre-wrap;">${notes}</p>
                </div>
            </div>

            <!-- RIGHT: Booking History -->
            <div style="padding:24px 20px;display:flex;flex-direction:column;">
                <h4 style="margin:0 0 12px;font-size:0.8rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Recent Bookings</h4>
                <div style="overflow-y:auto;flex:1;border:1px solid #e2e8f0;border-radius:8px;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                        <thead>
                            <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Date</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Service</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Staff</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Amount</th>
                                <th style="padding:8px 10px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;">Status</th>
                            </tr>
                        </thead>
                        <tbody>${bkRows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;

        subTitle.innerHTML = `<span style="color:#94a3b8;">Profile Insights</span>`;
        if (window.feather) feather.replace();

    } catch (err) {
        console.error('Error loading profile:', err);
        body.innerHTML = `<div style="text-align:center;padding:48px;color:#ef4444;font-size:0.9rem;">❌ Could not load customer profile.<br><span style="font-size:0.8rem;color:#94a3b8;">(${err.message||'No data available.'})</span></div>`;
        subTitle.textContent = 'Error';
    }
}

if (typeof window !== 'undefined') {
    window.viewCustomerProfile = viewCustomerProfile;
}

// ─── View Booking Invoice Modal ──────────────────────────────────────────────
export function openViewBookingModal(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) === bookingId);
    if (!b) {
        b = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
    }
    if (!b) return;

    // ID
    const vbiId = document.getElementById('vbiId');
    if (vbiId) vbiId.textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();

    // Customer
    const vbiCustomer = document.getElementById('vbiCustomer');
    if (vbiCustomer) vbiCustomer.textContent = b.customer_name || 'Walk-in Customer';
    const vbiPhone = document.getElementById('vbiPhone');
    if (vbiPhone) vbiPhone.textContent = b.customer_phone || '—';

    // Appointment Date & Time
    const vbiDate = document.getElementById('vbiDate');
    if (vbiDate) {
        try {
            const d = new Date(`${b.booking_date}T00:00`);
            vbiDate.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { vbiDate.textContent = b.booking_date || '—'; }
    }
    const vbiTime = document.getElementById('vbiTime');
    if (vbiTime) vbiTime.textContent = formatTime12((b.start_time || '').slice(0, 5));

    // Status badge
    const vbiStatusBadge = document.getElementById('vbiStatusBadge');
    if (vbiStatusBadge) vbiStatusBadge.innerHTML = statusBadge(b.status || 'completed');

    // Payment badge
    const vbiPaymentBadge = document.getElementById('vbiPaymentBadge');
    if (vbiPaymentBadge) {
        const pay = (b.payment_status || b.payment || '').toLowerCase();
        const payLabel = pay ? pay.charAt(0).toUpperCase() + pay.slice(1) : '—';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[pay] || { color: '#475569', bg: '#f1f5f9' };
        vbiPaymentBadge.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Services list
    const servicesListEl = document.getElementById('vbiServicesList');
    if (servicesListEl) {
        const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);
        const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()))
            .filter(Boolean);

        const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.total_price || b.price || 0];

        let html = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
                <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                    <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                    <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
                </tr>
            </thead>
            <tbody>`;

        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                const p = prices[i] !== undefined ? prices[i] : (prices[0] || 0);
                html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:10px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `
            <tr>
                <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${b.service_name || 'Salon Service'}</td>
                <td style="padding:10px 12px;color:#64748b;">${b.staff_name || '—'}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.total_price || b.price || 0).toLocaleString('en-IN')}</td>
            </tr>`;
        }

        html += `</tbody></table>`;
        servicesListEl.innerHTML = html;
    }

    // Total Amount
    const vbiTotal = document.getElementById('vbiTotalAmount');
    if (vbiTotal) {
        vbiTotal.textContent = '₹' + Number(b.total_price || b.price || 0).toLocaleString('en-IN');
    }

    // Show modal
    const modal = document.getElementById('viewBookingInvoiceModal');
    if (modal) modal.classList.add('active');
}

if (typeof window !== 'undefined') {
    window.openViewBookingModal = openViewBookingModal;
}

export function triggerInvoice(bookingId) {
    openViewBookingModal(bookingId);
}

if (typeof window !== 'undefined') {
    window.triggerInvoice = triggerInvoice;
}

// ─── Trigger Rebook ──────────────────────────────────────────────────────────
export async function triggerRebook(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) == bookingId);
    if (!b) return;

    // Try to fetch the email if missing from view payload
    let cEmail = b.customer_email || b.customer_mail || '';
    if (!cEmail && b.customer_id) {
        try {
            const { data } = await supabase.from('customers').select('customer_email').eq('customer_id', b.customer_id).limit(1).single();
            if (data && data.customer_email) cEmail = data.customer_email;
        } catch(e) { console.error('Failed to grab customer_email for prefill', e); }
    }

    let serviceIds = String(b.service_id || b.service_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    let staffIds   = String(b.staff_id   || b.staff_ids   || '').split(',').map(s => s.trim()).filter(Boolean);

    if (serviceIds.length === 0 && bookingId) {
        try {
            const { data: rows } = await supabase.from('bookings').select('service_id, package_id, staff_id').eq('booking_id', bookingId);
            if (rows && rows.length > 0) {
                serviceIds = rows.map(r => r.service_id || r.package_id).filter(Boolean);
                staffIds   = rows.map(r => r.staff_id).filter(Boolean);
            }
        } catch(e) { console.error('Failed to fetch booking items for rebook', e); }
    }

    if (window.openAndPrefillBooking) {
        // This awaits dropdown population BEFORE filling values — fixes race condition
        // Leaves date and time for the user to pick in the new booking modal
        await window.openAndPrefillBooking({
            customerId: b.customer_id,
            name:       b.customer_name,
            phone:      b.customer_phone,
            email:      cEmail,
            serviceIds,
            staffIds,
            notes:      b.notes || ''
        });
    } else {
        // Fallback: just open the modal normally
        const btnNewBooking = document.getElementById('btnNewBooking') || document.getElementById('btnNewBookingPage');
        if (btnNewBooking) btnNewBooking.click();
    }
}

if (typeof window !== 'undefined') {
    window.triggerRebook = triggerRebook;
}

// ─── Cancelled / No-show Booking Modal Handler ─────────────────────────────
export async function openCancelledBookingModal(bookingId) {
    const liveData = getLiveBookings() || [];
    let b = liveData.find(x => (x.booking_id || x.id) === bookingId);
    if (!b) {
        b = liveData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
    }
    if (!b) {
        try {
            const { data } = await supabase
                .from('bookings_for_business_transaction')
                .select('*')
                .eq('booking_id', bookingId)
                .maybeSingle();
            if (data) b = data;
        } catch (err) { console.error('Failed to fetch booking:', err); }
    }
    if (!b) return;

    const el = (id) => document.getElementById(id);

    // Dynamic Title & Status Badge based on status
    const rawStatus = (b.status || '').toLowerCase().trim();
    const isNoShow = ['no-show', 'noshow', 'no_show'].includes(rawStatus);

    if (el('cbmModalTitle')) {
        el('cbmModalTitle').textContent = isNoShow ? 'No-Show Booking' : 'Cancelled Booking';
    }
    if (el('cbmModalSubtitle')) {
        el('cbmModalSubtitle').textContent = isNoShow
            ? 'Review no-show appointment details and choose your next action.'
            : 'Review cancelled appointment details and choose your next action.';
    }

    if (el('cbmStatusBadge')) {
        if (isNoShow) {
            el('cbmStatusBadge').textContent = 'No-show';
            el('cbmStatusBadge').style.background = '#fee2e2';
            el('cbmStatusBadge').style.color = '#991b1b';
        } else {
            el('cbmStatusBadge').textContent = 'Cancelled';
            el('cbmStatusBadge').style.background = '#fef9c3';
            el('cbmStatusBadge').style.color = '#92400e';
        }
    }

    // Booking ID
    if (el('cbmId')) el('cbmId').textContent = '#' + (bookingId || '').slice(0, 8).toUpperCase();

    // Customer
    if (el('cbmCustomer')) el('cbmCustomer').textContent = b.customer_name || 'Walk-in Customer';
    if (el('cbmPhone'))    el('cbmPhone').textContent    = b.customer_phone || '—';

    // Date & Time
    if (el('cbmDate')) {
        try {
            const d = new Date(`${b.booking_date}T00:00`);
            el('cbmDate').textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { el('cbmDate').textContent = b.booking_date || '—'; }
    }
    if (el('cbmTime')) el('cbmTime').textContent = formatTime12((b.start_time || '').slice(0, 5));

    // Payment badge
    const payRaw = (b.payment_status || b.payment || '').toLowerCase();
    if (el('cbmPaymentBadge')) {
        const payLabel = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : '—';
        const payColors = {
            paid:    { color: '#059669', bg: '#d1fae5' },
            pending: { color: '#b45309', bg: '#fef3c7' },
            unpaid:  { color: '#dc2626', bg: '#fee2e2' },
            partial: { color: '#7c3aed', bg: '#ede9fe' },
        };
        const pc = payColors[payRaw] || { color: '#475569', bg: '#f1f5f9' };
        el('cbmPaymentBadge').innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${pc.bg};color:${pc.color};">${payLabel}</span>`;
    }

    // Show/hide refund section based on payment status
    let isPaid = ['paid', 'partial'].includes(payRaw);
    if (el('cbmRefundSection')) el('cbmRefundSection').style.display = isPaid ? 'block' : 'none';

    // Check transactions asynchronously to ensure accurate refund button visibility
    try {
        const { data: txs } = await supabase
            .from('business_transactions')
            .select('amount, status')
            .eq('reference_id', bookingId)
            .eq('reference_type', 'booking');
        if (txs && txs.some(t => (t.status || '').toLowerCase().trim() === 'paid')) {
            isPaid = true;
            if (el('cbmRefundSection')) el('cbmRefundSection').style.display = 'block';
        }
    } catch(e) { /* ignore */ }

    // Services list
    const svcNames = (Array.isArray(b.service_names) ? b.service_names : [b.service_name])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const staffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
        .filter(Boolean).flatMap(s => String(s).split(',').map(i => i.trim())).filter(Boolean);
    const prices = Array.isArray(b.service_prices) ? b.service_prices : [b.total_price || b.price || 0];

    if (el('cbmServicesList')) {
        let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Service</th>
                <th style="padding:8px 12px;text-align:left;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Staff</th>
                <th style="padding:8px 12px;text-align:right;font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;">Price</th>
            </tr></thead><tbody>`;
        if (svcNames.length > 0) {
            svcNames.forEach((svc, i) => {
                const staff = staffNames[i] || staffNames[0] || '—';
                const p = prices[i] !== undefined ? prices[i] : (prices[0] || 0);
                html += `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;font-weight:500;color:#1e293b;">${svc}</td>
                    <td style="padding:10px 12px;color:#64748b;">${staff}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(p).toLocaleString('en-IN')}</td>
                </tr>`;
            });
        } else {
            html += `<tr><td style="padding:10px 12px;font-weight:500;color:#1e293b;">${b.service_name || 'Salon Service'}</td>
                <td style="padding:10px 12px;color:#64748b;">${b.staff_name || '—'}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;color:#0f172a;">₹${Number(b.total_price || b.price || 0).toLocaleString('en-IN')}</td></tr>`;
        }
        html += `</tbody></table>`;
        el('cbmServicesList').innerHTML = html;
    }

    // Total
    if (el('cbmTotal')) {
        const tot = b.final_amount != null ? b.final_amount : (b.total_price || b.price || 0);
        el('cbmTotal').textContent = '₹' + Number(tot).toLocaleString('en-IN');
    }

    // Wire Rebook button — close modal then trigger rebook prefill
    const btnRebook = el('btnCbmRebook');
    if (btnRebook) {
        const newBtn = btnRebook.cloneNode(true);
        btnRebook.parentNode.replaceChild(newBtn, btnRebook);
        newBtn.addEventListener('click', async () => {
            el('cancelledBookingModal')?.classList.remove('active');
            await triggerRebook(bookingId);
        });
    }

    // Wire Refund button — close this modal, open refund modal
    const btnRefund = el('btnCbmRefund');
    if (btnRefund) {
        const newBtn = btnRefund.cloneNode(true);
        btnRefund.parentNode.replaceChild(newBtn, btnRefund);
        newBtn.addEventListener('click', () => {
            el('cancelledBookingModal')?.classList.remove('active');
            if (window.openRefundModal) window.openRefundModal(bookingId);
        });
    }

    // Show modal
    el('cancelledBookingModal')?.classList.add('active');
}

if (typeof window !== 'undefined') {
    window.openCancelledBookingModal = openCancelledBookingModal;
}

export function attachViewModalsListeners() {
    const profModal = document.getElementById('customerProfileBookingModal');
    profModal?.addEventListener('click', (e) => { if (e.target === profModal) profModal.classList.remove('active'); });

    // ── View Booking Invoice Modal Handlers ─────────────────────────────────
    const viewInvModal = document.getElementById('viewBookingInvoiceModal');
    const closeViewInv = () => viewInvModal?.classList.remove('active');

    document.getElementById('btnCloseViewInvoiceModal')?.addEventListener('click', closeViewInv);
    document.getElementById('btnVbiGoBack')?.addEventListener('click', closeViewInv);
    viewInvModal?.addEventListener('click', (e) => {
        if (e.target === viewInvModal) closeViewInv();
    });

    // ── Cancelled Booking Modal Handlers ──────────────────────────────────────
    const cancelledModal = document.getElementById('cancelledBookingModal');
    const closeCancelledModal = () => cancelledModal?.classList.remove('active');
    document.getElementById('btnCloseCancelledBookingModal')?.addEventListener('click', closeCancelledModal);
    document.getElementById('btnCbmClose')?.addEventListener('click', closeCancelledModal);
    cancelledModal?.addEventListener('click', (e) => {
        if (e.target === cancelledModal) closeCancelledModal();
    });

    // Print invoice action
    document.getElementById('btnVbiPrint')?.addEventListener('click', () => {
        const printArea = document.getElementById('viewBookingInvoicePrintArea');
        if (!printArea) return;
        const printWindow = window.open('', '_blank', 'width=800,height=650');
        if (!printWindow) {
            window.print();
            return;
        }
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Booking Invoice - ${document.getElementById('vbiId')?.textContent || ''}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
                    * { box-sizing: border-box; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                    th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; }
                </style>
            </head>
            <body>
                ${printArea.innerHTML}
                <script>
                    window.onload = function() { window.print(); window.close(); };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    });
}
