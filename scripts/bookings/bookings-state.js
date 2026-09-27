// scripts/bookings/bookings-state.js

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

export function getBranchId() {
    const fromDom = document.getElementById('branchSelect')?.value;
    const fromStorage = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
    const bId = (fromDom && fromDom !== 'branch_1' && fromDom !== 'branch_2' && fromDom !== 'all')
        ? fromDom
        : (fromStorage && fromStorage !== 'branch_1' && fromStorage !== 'branch_2' && fromStorage !== 'all' ? fromStorage : null);
    return bId || null;
}

export function todayISO() {
    const now = new Date();
    return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
}

export function formatTime12(timeStr) {
    if (!timeStr) return '—';
    try {
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
        return `${String(displayH).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
    } catch { return timeStr; }
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────
let liveBookingsData = [];

export function getLiveBookings() {
    return liveBookingsData;
}

export function setLiveBookings(data) {
    liveBookingsData = data || [];
    window.liveBookingsData = liveBookingsData;
    return liveBookingsData;
}

// Initialize window global immediately
if (typeof window !== 'undefined') {
    window.liveBookingsData = liveBookingsData;
}

// ─── Edit Modal State ─────────────────────────────────────────────────────────
export const editState = {
    liveServices: [],
    livePackages: [],
    liveStaff: [],
    rowCounter: 0,
    activeBooking: null,       // grouped booking record from liveBookingsData
    originalServiceRowIds: new Set(), // tracks DB row ids fetched when modal opened
    allowCompleteWithoutPayment: false,
    previousEditBkStatus: 'booked'
};

// ─── Filter & Search State ───────────────────────────────────────────────────
export const filterState = {
    searchQuery: '',
    sortCol: null,
    sortDesc: false
};

// ─── Status Update State ─────────────────────────────────────────────────────
export const statusUpdateState = {
    bookingId: null,
    newStatus: null
};

// ─── Calendar State ───────────────────────────────────────────────────────────
export const calendarState = {
    currentDate: new Date()
};
