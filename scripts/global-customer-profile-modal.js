import { supabase } from '../lib/supabase.js';

// Automatically inject the customer profile modal into the document
if (!document.getElementById('customerProfileBookingModal')) {
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="customerProfileBookingModal" style="z-index:9999;">
        <div class="modal-container" style="width:90vw;max-width:1100px;">
            <div class="modal-header" style="border-bottom:1px solid #f1f5f9;">
                <div class="header-titles">
                    <h2>Customer Profile</h2>
                    <p class="subtitle" id="profModalSubtitle">Loading details...</p>
                </div>
                <button class="modal-close" id="btnCloseProfModal" onclick="document.getElementById('customerProfileBookingModal').classList.remove('active')"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body" style="padding:0; overflow:hidden;" id="profModalBody">
                <div style="text-align:center;padding:48px;color:#94a3b8;font-size:0.9rem;">⏳ Loading customer information...</div>
            </div>
        </div>
    </div>`);
}

// Close the modal when clicking outside of it
const profModal = document.getElementById('customerProfileBookingModal');
if (profModal) {
    profModal.addEventListener('click', (e) => { 
        if (e.target === profModal) profModal.classList.remove('active'); 
    });
}

// Global function to open the customer profile
window.viewCustomerProfile = async function(customerId, customerName) {
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
        const companyId = localStorage.getItem('company_id') || null;
        const branchId  = localStorage.getItem('active_branch_id') || null;

        if (!companyId || !branchId) {
            throw new Error('Active company or branch not found. Please log in again.');
        }

        // ── 1. Execute BOTH RPCs in parallel (exactly 2 network requests)
        const [profileRes, spentRes] = await Promise.all([
            supabase.rpc('Global_customer_profile_modal', {
                p_company_id:  companyId,
                p_branch_id:   branchId,
                p_customer_id: customerId
            }),
            supabase.rpc('customers_page_clickable_total_spent', {
                p_company_id:  companyId,
                p_branch_id:   branchId,
                p_customer_id: customerId
            })
        ]);

        if (profileRes.error) throw profileRes.error;
        if (spentRes.error)   throw spentRes.error;

        // Extract single rows safely
        const profileData = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
        const spentData   = Array.isArray(spentRes.data)   ? spentRes.data[0]   : spentRes.data;

        if (!profileData) {
            throw new Error('Customer profile not found.');
        }

        // ── 2. Map Profile and Financial values directly from RPC responses
        const name        = profileData.customer_name  || customerName || 'Unknown';
        const phone       = profileData.customer_phone || '—';
        const email       = profileData.customer_email || profileData.email || '—';
        const tags        = profileData.tags           || 'Regular';
        const notes       = profileData.notes          || '—';
        const totalVisits = Number(profileData.total_visits ?? 0);
        const totalSpent  = Number(spentData?.grand_total ?? 0);

        const avatarUrl = profileData.profile_photo ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c7d2fe&color=3730A3&size=128`;

        let joinedDate = '—';
        if (profileData.created_at) {
            const d = new Date(profileData.created_at);
            if (!isNaN(d.getTime())) {
                joinedDate = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            }
        }

        // ── 3. Build booking history rows (using final_amount)
        const recentBookings = Array.isArray(profileData.recent_bookings) ? profileData.recent_bookings.slice(0, 5) : [];
        const statusColor = { completed: '#065f46', booked: '#1e40af', confirmed: '#1e40af', cancelled: '#991b1b', 'no-show': '#92400e', 'no_show': '#92400e' };
        const statusBg    = { completed: '#d1fae5', booked: '#dbeafe', confirmed: '#dbeafe', cancelled: '#fee2e2', 'no-show': '#fef3c7', 'no_show': '#fef3c7' };

        const bkRows = recentBookings.length ? recentBookings.map(bk => {
            let bkDate = '—';
            if (bk.booking_date) {
                const d = new Date(bk.booking_date + 'T00:00');
                if (!isNaN(d.getTime())) {
                    bkDate = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                } else {
                    bkDate = bk.booking_date;
                }
            }
            const s = (bk.status || '').toLowerCase();
            const sc = statusColor[s] || '#475569';
            const sb = statusBg[s]    || '#f1f5f9';
            const finalAmount = Number(bk.final_amount ?? 0);

            return `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;white-space:nowrap;">${bkDate}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:700;color:#1e293b;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${bk.service_name || '—'}">${bk.service_name || '—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;color:#475569;">${bk.staff_name || '—'}</td>
                <td style="padding:8px 10px;font-size:0.8rem;font-weight:600;color:#059669;">₹${finalAmount.toLocaleString('en-IN')}</td>
                <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;color:${sc};background:${sb};">${bk.status || '—'}</span></td>
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
};
