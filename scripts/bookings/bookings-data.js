// scripts/bookings/bookings-data.js
import { supabase } from '../../lib/supabase.js';
import { getCompanyId, getBranchId, setLiveBookings, editState } from './bookings-state.js';

// ─── Edit Modal: Load Services + Staff into module-level arrays ───────────────
export async function loadEditDropdownData() {
    const company_id = getCompanyId();
    const branch_id  = getBranchId();
    const [svcRes, staffRes, pkgRes] = await Promise.all([
        supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
        supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
        supabase.from('packages').select('*').eq('company_id', company_id).eq('branch_id', branch_id).eq('is_active', true)
    ]);
    editState.liveServices = (svcRes.data || []).filter(s => (s.status || '').trim().toLowerCase() === 'active');
    editState.livePackages = pkgRes.data || [];
    editState.liveStaff    = (staffRes.data || []).filter(s => s.status !== 'deleted');
}

// ─── Callback subscriber for view refreshes ──────────────────────────────────
let onBookingsRefreshedCb = null;

export function setOnBookingsRefreshed(cb) {
    onBookingsRefreshedCb = cb;
}

// ─── Fetch Bookings from Supabase ─────────────────────────────────────────────
export async function fetchBookings() {
    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        let query = supabase
            .from('bookings_for_business_transaction')
            .select('*')
            .order('booking_date', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId && branchId !== 'branch_1' && branchId !== 'branch_2' && branchId !== 'all') {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Bookings] Supabase fetch error:', error);
            if (onBookingsRefreshedCb) onBookingsRefreshedCb();
            return;
        }

        setLiveBookings(data || []);
        if (onBookingsRefreshedCb) onBookingsRefreshedCb();

    } catch (err) {
        console.error('[Bookings] Unexpected error:', err);
        if (onBookingsRefreshedCb) onBookingsRefreshedCb();
    }
}

if (typeof window !== 'undefined') {
    window.fetchBookings = fetchBookings;
}
