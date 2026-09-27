// scripts/bookings/bookings-filters.js
import { getLiveBookings, filterState } from './bookings-state.js';
import { renderBookings } from './bookings-table.js';

const FILTER_KEY = 'bookings_filter_state';
const FILTER_VER_KEY = 'bookings_filter_version';
const CURRENT_FILTER_VER = '2';

// Clear stale filter state if version mismatch (fixes old broken default)
if (typeof localStorage !== 'undefined' && localStorage.getItem(FILTER_VER_KEY) !== CURRENT_FILTER_VER) {
    localStorage.removeItem(FILTER_KEY);
    localStorage.setItem(FILTER_VER_KEY, CURRENT_FILTER_VER);
}

export function toggleSort(col) {
    if (filterState.sortCol === col) {
        filterState.sortDesc = !filterState.sortDesc;
    } else {
        filterState.sortCol = col;
        filterState.sortDesc = false;
    }
    
    // Update visual arrows
    document.querySelectorAll('.sort-icon').forEach(icon => {
        if (icon.dataset.col === col) {
            icon.textContent = filterState.sortDesc ? '↓' : '↑';
            icon.style.opacity = '1';
            icon.style.color = '#4f46e5';
        } else {
            icon.textContent = '↕';
            icon.style.opacity = '0.3';
            icon.style.color = 'inherit';
        }
    });

    renderBookings(getFilteredBookings());
}

if (typeof window !== 'undefined') {
    window.toggleSort = toggleSort;
}

export function getFilteredBookings() {
    let results = getLiveBookings() || [];

    // Apply Search
    if (filterState.searchQuery) {
        const q = filterState.searchQuery.toLowerCase();
        results = results.filter(b => {
            const name = String(b.customer_name || '').toLowerCase();
            const phone = String(b.customer_phone || '').toLowerCase();
            return name.includes(q) || phone.includes(q);
        });
    }

    // Apply Status Filter
    const statusAllChecked = document.querySelector('input[name="filterStatus"][value="all"]')?.checked;
    const activeStatuses = Array.from(document.querySelectorAll('input[name="filterStatus"]:not([value="all"]):checked')).map(c => c.value);
    
    // Apply Staff Filter
    const staffAllChecked = document.querySelector('input[name="filterStaff"][value="all"]')?.checked;
    const activeStaff = Array.from(document.querySelectorAll('input[name="filterStaff"]:not([value="all"]):checked')).map(c => c.value);
    
    // Apply Date Filter
    const dateFilter = document.querySelector('input[name="filterDateRange"]:checked')?.value || 'all';

    const now = new Date();
    let cutoff = null;
    if (dateFilter === '7days') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (dateFilter === '30days') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let filtered = results.filter(b => {
        // Status Check — skip if "All" is checked OR no individual statuses are checked
        if (!statusAllChecked && activeStatuses.length > 0 && !activeStatuses.includes(String(b.status).toLowerCase())) {
            return false;
        }

        // Staff Check
        if (!staffAllChecked && activeStaff.length > 0) {
            const rowStaffNames = (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
                .filter(Boolean)
                .flatMap(s => String(s).split(',').map(item => item.trim()))
                .filter(Boolean);
            
            const matchedStaff = rowStaffNames.some(name => activeStaff.includes(name));
            if (!matchedStaff) return false;
        }

        // Date Check
        if (cutoff && b.booking_date) {
            const bDate = new Date(b.booking_date + 'T00:00');
            if (bDate < cutoff) return false;
        }

        return true;
    });

    if (filterState.sortCol) {
        filtered.sort((a, b) => {
            let valA = String(a[filterState.sortCol] || '').toLowerCase();
            let valB = String(b[filterState.sortCol] || '').toLowerCase();
            if (valA < valB) return filterState.sortDesc ? 1 : -1;
            if (valA > valB) return filterState.sortDesc ? -1 : 1;
            return 0;
        });
    }

    return filtered;
}

export function populateStaffFilter() {
    const list = document.getElementById('filterStaffList');
    if (!list) return;

    const wasAllChecked = list.querySelector('input[value="all"]')?.checked ?? true;
    const selectedStaff = Array.from(list.querySelectorAll('input[name="filterStaff"]:not([value="all"]):checked')).map(c => c.value);

    const allStaffRaw = (getLiveBookings() || []).flatMap(b => {
        return (Array.isArray(b.staff_names) ? b.staff_names : [b.staff_name])
            .filter(Boolean)
            .flatMap(s => String(s).split(',').map(item => item.trim()));
    });
    const uniqueStaff = [...new Set(allStaffRaw)].filter(s => s && s.toLowerCase() !== 'undefined');

    let html = '<label class="filter-option" style="display: flex; align-items: center; gap: 6px;">'
        + '<input type="checkbox" name="filterStaff" value="all"' + (wasAllChecked ? ' checked' : '') + '> All Staff'
        + '</label>';

    uniqueStaff.sort().forEach(staff => {
        const checked = selectedStaff.includes(staff) ? ' checked' : '';
        html += '<label class="filter-option" style="display: flex; align-items: center; gap: 6px;">'
            + '<input type="checkbox" name="filterStaff" value="' + staff + '"' + checked + '> ' + staff
            + '</label>';
    });

    list.innerHTML = html;

    // Restore any saved staff filter state (set by restoreFilterState on load)
    if (window._applyPendingStaffFilter) window._applyPendingStaffFilter();

    list.querySelectorAll('input[name="filterStaff"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'all' && e.target.checked) {
                list.querySelectorAll('input[name="filterStaff"]:not([value="all"])').forEach(c => c.checked = false);
            } else if (val !== 'all' && e.target.checked) {
                const allCb = list.querySelector('input[value="all"]');
                if (allCb) allCb.checked = false;
            }
        });
    });
}

export function saveFilterState() {
    const statuses = Array.from(document.querySelectorAll('input[name="filterStatus"]'))
        .map(c => ({ value: c.value, checked: c.checked }));
    const staffAll = document.querySelector('input[name="filterStaff"][value="all"]')?.checked ?? true;
    const staff = Array.from(document.querySelectorAll('input[name="filterStaff"]:not([value="all"])'))
        .map(c => ({ value: c.value, checked: c.checked }));
    const dateRange = document.querySelector('input[name="filterDateRange"]:checked')?.value || 'all';
    const search = filterState.searchQuery || '';
    localStorage.setItem(FILTER_KEY, JSON.stringify({ statuses, staffAll, staff, dateRange, search }));
}

export function restoreFilterState() {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        // Status
        if (s.statuses) {
            const hasAllChecked = s.statuses.find(x => x.value === 'all')?.checked;
            const hasAnyIndividualChecked = s.statuses.some(x => x.value !== 'all' && x.checked);
            // If saved state has no valid selection, default to "All"
            if (!hasAllChecked && !hasAnyIndividualChecked) {
                const allEl = document.querySelector('input[name="filterStatus"][value="all"]');
                if (allEl) allEl.checked = true;
            } else {
                s.statuses.forEach(({ value, checked }) => {
                    const el = document.querySelector(`input[name="filterStatus"][value="${value}"]`);
                    if (el) el.checked = checked;
                });
            }
        }
        // Date
        if (s.dateRange) {
            const el = document.querySelector(`input[name="filterDateRange"][value="${s.dateRange}"]`);
            if (el) el.checked = true;
        }
        // Search
        if (s.search) {
            filterState.searchQuery = s.search;
            const searchInput = document.getElementById('bookingsPageSearch');
            if (searchInput) searchInput.value = s.search;
        }
        // Staff is restored after populateStaffFilter runs — store for later
        window._pendingStaffFilter = s;
    } catch (e) { /* ignore bad JSON */ }
}

export function _applyPendingStaffFilter() {
    const s = window._pendingStaffFilter;
    if (!s) return;
    const staffAllEl = document.querySelector('input[name="filterStaff"][value="all"]');
    if (staffAllEl) staffAllEl.checked = s.staffAll ?? true;
    if (s.staff) {
        s.staff.forEach(({ value, checked }) => {
            const el = document.querySelector(`input[name="filterStaff"][value="${value}"]`);
            if (el) el.checked = checked;
        });
    }
    window._pendingStaffFilter = null;
}

if (typeof window !== 'undefined') {
    window._applyPendingStaffFilter = _applyPendingStaffFilter;
}

export function attachFilterListeners() {
    const searchInput = document.getElementById('bookingsPageSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterState.searchQuery = e.target.value.trim();
            renderBookings(getFilteredBookings());
        });
    }

    // Status filter mutual-exclusion: All <-> individual statuses
    document.addEventListener('change', (e) => {
        if (e.target.name !== 'filterStatus') return;
        if (e.target.value === 'all' && e.target.checked) {
            document.querySelectorAll('input[name="filterStatus"]:not([value="all"])').forEach(c => c.checked = false);
        } else if (e.target.value !== 'all' && e.target.checked) {
            const allCb = document.querySelector('input[name="filterStatus"][value="all"]');
            if (allCb) allCb.checked = false;
        }
    });

    const btnFilter = document.getElementById('btnFilterBookings');
    const filterMenu = document.getElementById('filterDropdownMenu');

    // Dropdown toggle
    btnFilter?.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMenu?.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        const container = document.getElementById('bookingsFilterContainer');
        if (filterMenu && filterMenu.classList.contains('active') && container && !container.contains(e.target)) {
            filterMenu.classList.remove('active');
        }
    });

    // Apply
    document.getElementById('btnFilterApply')?.addEventListener('click', () => {
        saveFilterState();
        renderBookings(getFilteredBookings());
        filterMenu?.classList.remove('active');
    });

    // Clear
    document.getElementById('btnFilterClear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Reset status to "All" (show everything)
        document.querySelectorAll('input[name="filterStatus"]').forEach(c => c.checked = false);
        const statusAllCb = document.querySelector('input[name="filterStatus"][value="all"]');
        if (statusAllCb) statusAllCb.checked = true;
        // Reset staff to All Staff
        const staffAll = document.querySelector('input[name="filterStaff"][value="all"]');
        if (staffAll) staffAll.checked = true;
        document.querySelectorAll('input[name="filterStaff"]:not([value="all"])').forEach(c => c.checked = false);
        // Reset date to View All Time
        const dateAll = document.querySelector('input[name="filterDateRange"][value="all"]');
        if (dateAll) dateAll.checked = true;
        // Clear search
        filterState.searchQuery = '';
        const searchInput = document.getElementById('bookingsPageSearch');
        if (searchInput) searchInput.value = '';

        saveFilterState();
        renderBookings(getFilteredBookings());
        filterMenu?.classList.remove('active');
    });

    // Restore state on load (staff part deferred — applied after populateStaffFilter)
    restoreFilterState();
}
