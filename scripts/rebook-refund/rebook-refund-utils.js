// scripts/rebook-refund/rebook-refund-utils.js
// Pure utility functions extracted from rebook-refund-modal.js.
// No state, no DOM, no Supabase.

export function formatTime12(timeStr) {
    if (!timeStr) return '—';
    try {
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const displayH = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh);
        return `${String(displayH).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
    } catch {
        return timeStr;
    }
}

export function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(`${dateStr}T00:00:00`);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

export function getBranchId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.branch?.branch_id || ctx.branch?.id || localStorage.getItem('branch_id') || null;
    } catch { return localStorage.getItem('branch_id') || null; }
}
