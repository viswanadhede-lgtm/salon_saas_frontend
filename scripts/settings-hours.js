import { supabase } from '../lib/supabase.js';

// ── Constants & Day Mappings ────────────────────────────────────────────────
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DAY_TO_NUM = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6
};

export const NUM_TO_DAY = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday'
};

export const DEFAULT_HOURS = {
    Monday:    { open: true,  from: '09:00', to: '18:00' },
    Tuesday:   { open: true,  from: '09:00', to: '18:00' },
    Wednesday: { open: true,  from: '09:00', to: '18:00' },
    Thursday:  { open: true,  from: '09:00', to: '18:00' },
    Friday:    { open: true,  from: '09:00', to: '18:00' },
    Saturday:  { open: true,  from: '09:00', to: '17:00' },
    Sunday:    { open: false, from: '09:00', to: '17:00' }
};

let currentBranchId = null;

// ── Resolve Company & Branch IDs ────────────────────────────────────────────
export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.company?.company_id) return ctx.company.company_id;
        if (ctx.company?.id) return ctx.company.id;
    } catch (e) {}
    return localStorage.getItem('company_id') || null;
}

export async function getBranchId() {
    const saved = localStorage.getItem('active_branch_id');
    const select = document.getElementById('branchSelect');
    if (saved && saved !== 'all') return saved;
    if (select?.value && select.value !== 'all') return select.value;

    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.branches && ctx.branches.length > 0) {
            const first = ctx.branches[0].branch_id || ctx.branches[0].id;
            if (first) {
                localStorage.setItem('active_branch_id', first);
                return first;
            }
        }
    } catch (e) {}

    const companyId = getCompanyId();
    if (companyId) {
        const { data } = await supabase
            .from('branches')
            .select('branch_id, branch_name')
            .eq('company_id', companyId)
            .neq('status', 'deleted')
            .order('created_at', { ascending: true })
            .limit(1);

        if (data && data.length > 0) {
            const bId = data[0].branch_id;
            localStorage.setItem('active_branch_id', bId);
            return bId;
        }
    }
    return null;
}

// ── Render Form Rows ────────────────────────────────────────────────────────
export function renderHours(hoursData = DEFAULT_HOURS) {
    const container = document.getElementById('hoursContainer');
    if (!container) return;

    container.innerHTML = DAYS.map(day => {
        const d = hoursData[day] || DEFAULT_HOURS[day];
        const isClosedClass = d.open ? '' : 'is-closed';
        const statusLabel   = d.open ? 'Open' : 'Closed';
        const statusClass   = d.open ? 'status-open' : 'status-closed';

        return `<div class="hours-row ${isClosedClass}" id="row_${day}">
            <div class="hours-day">
                <span>${day}</span>
            </div>
            <select class="form-select" id="from_${day}" ${d.open ? '' : 'disabled'} onchange="window.markDirty()">${timeOptions(d.from)}</select>
            <select class="form-select" id="to_${day}" ${d.open ? '' : 'disabled'} onchange="window.markDirty()">${timeOptions(d.to)}</select>
            <div class="hours-toggle-wrap">
                <label class="toggle-switch">
                    <input type="checkbox" id="open_${day}" ${d.open ? 'checked' : ''} onchange="window.toggleDay('${day}', this.checked); window.markDirty();">
                    <span class="toggle-track"></span>
                </label>
                <span class="hours-status-text ${statusClass}" id="status_${day}">${statusLabel}</span>
            </div>
        </div>`;
    }).join('');

    if (typeof feather !== 'undefined') feather.replace();
}

// ── Toggle Single Day ───────────────────────────────────────────────────────
window.toggleDay = function (day, open) {
    const fromEl   = document.getElementById('from_' + day);
    const toEl     = document.getElementById('to_' + day);
    const statusEl = document.getElementById('status_' + day);
    const rowEl    = document.getElementById('row_' + day);

    if (fromEl) fromEl.disabled = !open;
    if (toEl) toEl.disabled = !open;

    if (statusEl) {
        statusEl.textContent = open ? 'Open' : 'Closed';
        statusEl.className = `hours-status-text ${open ? 'status-open' : 'status-closed'}`;
    }

    if (rowEl) {
        if (open) rowEl.classList.remove('is-closed');
        else rowEl.classList.add('is-closed');
    }
};

// ── Time Formatting Helpers ─────────────────────────────────────────────────
function timeOptions(selected) {
    const cleanSelected = (selected || '09:00').slice(0, 5);
    let opts = '';
    for (let h = 0; h < 24; h++) {
        for (let m of ['00', '30']) {
            const val = `${String(h).padStart(2, '0')}:${m}`;
            const label = formatTime(val);
            opts += `<option value="${val}" ${val === cleanSelected ? 'selected' : ''}>${label}</option>`;
        }
    }
    return opts;
}

function formatTime(t) {
    const [h, m] = t.split(':').map(Number);
    const suffix = h < 12 ? 'AM' : 'PM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ── Load Hours Data from Supabase ───────────────────────────────────────────
export async function loadHoursData(overrideBranchId = null) {
    let companyId = getCompanyId();
    if (!companyId) {
        await new Promise(r => setTimeout(r, 150));
        companyId = getCompanyId();
    }

    if (!companyId) {
        console.warn('[settings-hours] No company_id found.');
        return;
    }

    const branchId = overrideBranchId || await getBranchId();
    currentBranchId = branchId;

    if (!branchId) {
        console.warn('[settings-hours] No branch_id found.');
        renderHours(DEFAULT_HOURS);
        return;
    }

    // Sync header branchSelect value if present
    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect && branchSelect.value !== branchId) {
        branchSelect.value = branchId;
    }

    try {
        const { data: rows, error } = await supabase
            .from('business_hours')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId);

        if (error) {
            console.error('[settings-hours] Error loading business_hours:', error);
            renderHours(DEFAULT_HOURS);
            return;
        }

        if (Array.isArray(rows) && rows.length > 0) {
            const merged = { ...DEFAULT_HOURS };
            rows.forEach(r => {
                const dayName = NUM_TO_DAY[r.day_of_week];
                if (dayName) {
                    merged[dayName] = {
                        open: Boolean(r.is_open),
                        from: r.opening_time ? r.opening_time.slice(0, 5) : '09:00',
                        to:   r.closing_time ? r.closing_time.slice(0, 5) : '18:00'
                    };
                }
            });
            renderHours(merged);
        } else {
            // No custom hours configured yet: render standard defaults
            renderHours(DEFAULT_HOURS);
        }

        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

    } catch (err) {
        console.error('[settings-hours] Unexpected error loading hours:', err);
        renderHours(DEFAULT_HOURS);
    }
}

// ── Save Hours to Supabase ──────────────────────────────────────────────────
window.saveHours = async function () {
    const companyId = getCompanyId();
    if (!companyId) {
        showToast('No company session found. Please sign in.', 'error');
        return;
    }

    const branchId = currentBranchId || await getBranchId();
    if (!branchId) {
        showToast('Please select or create a branch first.', 'error');
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
    }

    try {
        const now = new Date().toISOString();

        // 1. Fetch existing rows for this company & branch to distinguish updates from inserts
        const { data: existingRows, error: fetchErr } = await supabase
            .from('business_hours')
            .select('id, day_of_week')
            .eq('company_id', companyId)
            .eq('branch_id', branchId);

        if (fetchErr) {
            console.warn('[settings-hours] Error checking existing rows:', fetchErr);
        }

        const existingMap = {};
        if (Array.isArray(existingRows)) {
            existingRows.forEach(r => {
                existingMap[r.day_of_week] = r.id;
            });
        }

        // 2. Process all 7 days
        for (const day of DAYS) {
            const dayNum  = DAY_TO_NUM[day];
            const isOpen  = document.getElementById('open_' + day)?.checked ?? true;
            const fromVal = document.getElementById('from_' + day)?.value || '09:00';
            const toVal   = document.getElementById('to_' + day)?.value || '18:00';

            const openingTime = `${fromVal}:00`;
            const closingTime = `${toVal}:00`;

            const existingId = existingMap[dayNum];

            if (existingId) {
                // Update existing day record (preserve created_at)
                const { error: updErr } = await supabase
                    .from('business_hours')
                    .eq('id', existingId)
                    .update({
                        opening_time: openingTime,
                        closing_time: closingTime,
                        is_open:      isOpen,
                        updated_at:   now
                    });

                if (updErr) throw new Error(updErr.message || `Failed to update ${day}`);
            } else {
                // Insert new day record
                const { error: insErr } = await supabase
                    .from('business_hours')
                    .insert({
                        company_id:   companyId,
                        branch_id:    branchId,
                        day_of_week:  dayNum,
                        opening_time: openingTime,
                        closing_time: closingTime,
                        is_open:      isOpen,
                        created_at:   now,
                        updated_at:   now
                    });

                if (insErr) throw new Error(insErr.message || `Failed to insert ${day}`);
            }
        }

        showToast('Business hours saved successfully!', 'success');
        window.isDirty = false;
        document.getElementById('savebar')?.classList.remove('visible');

        // Reload to sync state
        await loadHoursData(branchId);

    } catch (err) {
        console.error('[settings-hours] Error saving hours:', err);
        showToast(err.message || 'Failed to save business hours.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
};

window.cancelHours = function () {
    window.isDirty = false;
    document.getElementById('savebar')?.classList.remove('visible');
    loadHoursData(currentBranchId);
};

window.loadHoursData = loadHoursData;

// ── Branch Switcher Listener ────────────────────────────────────────────────
function initBranchSwitcher() {
    const select = document.getElementById('branchSelect');
    if (!select) return;

    select.addEventListener('change', (e) => {
        const selectedBranch = e.target.value;
        if (selectedBranch && selectedBranch !== 'all' && selectedBranch !== currentBranchId) {
            localStorage.setItem('active_branch_id', selectedBranch);
            loadHoursData(selectedBranch);
        }
    });
}

// ── Init ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        initBranchSwitcher();
        await loadHoursData();
    });
} else {
    initBranchSwitcher();
    loadHoursData();
}
