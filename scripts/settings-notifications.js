import { supabase } from '../lib/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const savebar = document.getElementById('savebar');
    const btnSave = document.getElementById('btnSave');
    let currentBranchId = null;

    // ── Helper to get company ID ─────────────────────────────────────────────
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch { }
        return localStorage.getItem('company_id') || null;
    }

    // ── Helper to get branch ID ───────────────────────────────────────────────
    async function getBranchId(companyId) {
        try {
            const urlBranchId = new URLSearchParams(window.location.search).get('branch_id');
            if (urlBranchId && urlBranchId !== 'all') return urlBranchId;

            const saved = localStorage.getItem('active_branch_id');
            if (saved && saved !== 'all' && saved !== 'Downtown Branch') return saved;

            const domSelect = document.getElementById('branchSelect')?.value;
            if (domSelect && domSelect !== 'all') {
                localStorage.setItem('active_branch_id', domSelect);
                return domSelect;
            }

            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.current_branch_id) return ctx.current_branch_id;
            if (ctx.branches && ctx.branches.length > 0) {
                const first = ctx.branches[0].branch_id || ctx.branches[0].id;
                if (first) {
                    localStorage.setItem('active_branch_id', first);
                    return first;
                }
            }
        } catch {}

        if (companyId) {
            const { data: bList } = await supabase.schema('shared')
                .from('branches')
                .select('branch_id')
                .eq('company_id', companyId)
                .neq('status', 'deleted')
                .order('created_at', { ascending: true })
                .limit(1);

            if (bList && bList.length > 0 && bList[0].branch_id) {
                localStorage.setItem('active_branch_id', bList[0].branch_id);
                return bList[0].branch_id;
            }
        }
        return null;
    }

    // ── Feather icons + sidebar ──────────────────────────────────────────────
    if (typeof feather !== 'undefined') feather.replace();
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('mainWrapper').classList.toggle('sidebar-collapsed');
    });
    document.querySelectorAll('.nav-item.active').forEach(li => li.classList.add('open'));

    // System Notifications card is always open — no top-level toggle needed.

    // ── Sub-category accordion expand / collapse ─────────────────────────────
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('expanded');
        });
    });

    // ── System Notifications: Master toggles ─────────────────────────────────
    document.querySelectorAll('.master-toggle input[type="checkbox"]').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const body = e.target.closest('.accordion-item').querySelector('.accordion-body');
            body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.disabled = !isChecked;
                cb.closest('.sub-event-row').classList.toggle('disabled', !isChecked);
                if (!isChecked) cb.checked = false;
            });
            showSaveBar();
        });
    });

    // ── System Notifications: Sub-event checkboxes ───────────────────────────
    document.querySelectorAll('.sub-event-list input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => showSaveBar());
    });

    function showSaveBar() {
        window.isDirty = true;
        if (savebar) savebar.classList.add('visible');
    }
    function hideSaveBar() {
        window.isDirty = false;
        if (savebar) savebar.classList.remove('visible');
    }

    // ── Default System Notification Preferences ───────────────────────────────
    const defaultPrefs = {
        bookings: {
            master: true,
            evt_booking_created: true,
            evt_booking_confirmed: true,
            evt_booking_modified: true,
            evt_booking_cancelled: false,
            evt_booking_completed: true,
            evt_booking_noshow: false
        },
        customers: {
            master: true,
            evt_customer_added: true,
            evt_customer_updated: false,
            evt_customer_deleted: false
        },
        staff: {
            master: true,
            evt_staff_added: true,
            evt_staff_updated: true,
            evt_staff_deleted: false,
            evt_staff_booking_assigned: true
        },
        services: {
            master: true,
            evt_service_created: false,
            evt_service_updated: false,
            evt_service_deleted: false,
            evt_package_created: false,
            evt_package_updated: false,
            evt_package_deleted: false,
            evt_service_category_created: false,
            evt_service_category_updated: false,
            evt_service_category_deleted: false
        },
        pos: {
            master: true,
            evt_pos_sale_completed: true,
            evt_pos_low_stock: true,
            evt_pos_customer_added: false
        },
        payments: {
            master: true,
            evt_payment_collected: true,
            evt_payment_pending: true,
            evt_payment_refunded: false,
            evt_payment_overdue: true
        },
        marketing: {
            master: true,
            evt_marketing_offer: false,
            evt_marketing_coupon: false,
            evt_marketing_membership: false,
            evt_marketing_membership_purchased: true,
            evt_marketing_membership_expired_renewed: true
        }
    };

    // ── Collect System Prefs from UI ─────────────────────────────────────────
    function collectSystemPrefsFromUI() {
        const systemCategories = ['bookings', 'customers', 'staff', 'services', 'pos', 'payments', 'marketing'];
        const sys = {};
        systemCategories.forEach(cat => {
            const masterEl = document.getElementById(`master_${cat}`);
            sys[cat] = { master: masterEl ? masterEl.checked : true };

            const catDefault = defaultPrefs[cat] || {};
            Object.keys(catDefault).forEach(key => {
                if (key === 'master') return;
                const cb = document.getElementById(key);
                if (cb) sys[cat][key] = cb.checked;
            });
        });
        return sys;
    }

    // ── Apply System Prefs to UI ─────────────────────────────────────────────
    function applyPreferencesToUI(systemPrefs) {
        const systemCategories = ['bookings', 'customers', 'staff', 'services', 'pos', 'payments', 'marketing'];
        systemCategories.forEach(category => {
            const catData = systemPrefs[category] || defaultPrefs[category];
            if (!catData) return;

            const masterEl = document.getElementById(`master_${category}`);
            if (masterEl) {
                masterEl.checked = !!catData.master;
                const body = masterEl.closest('.accordion-item')?.querySelector('.accordion-body');
                if (body) {
                    body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.disabled = !catData.master;
                        cb.closest('.sub-event-row')?.classList.toggle('disabled', !catData.master);
                    });
                }
            }

            Object.keys(catData).forEach(key => {
                if (key === 'master') return;
                const cb = document.getElementById(key);
                if (cb) cb.checked = !!catData[key];
            });
        });

        if (typeof feather !== 'undefined') feather.replace();
    }

    // ── Load Preferences from DB ─────────────────────────────────────────────
    async function loadPreferences(branchIdOverride = null) {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            const branchId = branchIdOverride || await getBranchId(companyId);
            if (!branchId) return;

            currentBranchId = branchId;

            const branchSelect = document.getElementById('branchSelect');
            if (branchSelect && branchSelect.value !== branchId) {
                const hasOption = Array.from(branchSelect.options).some(opt => opt.value === branchId);
                if (hasOption) branchSelect.value = branchId;
            }

            const { data, error } = await supabase.schema('app')
                .from('notification_settings')
                .select('system_notifications')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .maybeSingle();

            if (error) {
                console.warn('[settings-notifications] Error loading settings:', error);
            }

            const systemPrefs = data?.system_notifications || {
                bookings:   defaultPrefs.bookings,
                customers:  defaultPrefs.customers,
                staff:      defaultPrefs.staff,
                services:   defaultPrefs.services,
                pos:        defaultPrefs.pos,
                payments:   defaultPrefs.payments,
                marketing:  defaultPrefs.marketing
            };

            applyPreferencesToUI(systemPrefs);

            // Update local cache
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(systemPrefs));
            localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(systemPrefs));

            hideSaveBar();

        } catch (err) {
            console.error('[settings-notifications] Unexpected load error:', err);
        }
    }

    // ── Save Preferences to DB ───────────────────────────────────────────────
    async function savePreferences() {
        const companyId = getCompanyId();
        if (!companyId) {
            alert('No active company found. Please sign in again.');
            return;
        }

        const branchId = currentBranchId || await getBranchId(companyId);
        if (!branchId) {
            alert('No branch selected. Please select a branch first.');
            return;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
        }

        try {
            const systemPrefs = collectSystemPrefsFromUI();

            const { data: rpcRes, error: upsertErr } = await supabase.rpc('save_notification_settings_atomic', {
                p_company_id:           companyId,
                p_branch_id:            branchId,
                p_system_notifications: systemPrefs
            });

            if (rpcRes && rpcRes.success === false) {
                throw new Error(rpcRes.message || 'Failed to save notification settings');
            }
            if (upsertErr) {
                throw new Error(upsertErr.message || 'Failed to save notification settings');
            }

            // Update local cache
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(systemPrefs));
            localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(systemPrefs));

            const toast = document.getElementById('toastNotification');
            if (toast) {
                toast.textContent = '✓ Notification settings saved!';
                toast.style.background = '#22c55e';
                toast.classList.add('visible');
                setTimeout(() => { toast.classList.remove('visible'); toast.style.background = ''; }, 3000);
            }
            hideSaveBar();

        } catch (err) {
            console.error('[settings-notifications] Error saving settings:', err);
            const toast = document.getElementById('toastNotification');
            if (toast) {
                toast.textContent = err.message ? `Failed to save: ${err.message}` : 'Failed to save. Please try again.';
                toast.style.background = '#ef4444';
                toast.classList.add('visible');
                setTimeout(() => { toast.classList.remove('visible'); toast.style.background = ''; }, 4000);
            }
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
                if (typeof feather !== 'undefined') feather.replace();
            }
        }
    }

    // Standalone page binds btnSave directly; settings-branch.js handles tabbed #btnSave
    if (btnSave && !document.getElementById('pane-branches')) {
        btnSave.addEventListener('click', () => {
            const pane = document.getElementById('pane-notifications');
            if (pane && !pane.classList.contains('active')) return;
            savePreferences();
        });
    }

    window.cancelNotificationSettings = function () {
        hideSaveBar();
        loadPreferences(currentBranchId);
    };

    window.loadNotificationSettings  = loadPreferences;
    window.saveNotificationSettings  = savePreferences;

    // ── Branch Switcher Listener ─────────────────────────────────────────────
    function initBranchSwitcher() {
        const select = document.getElementById('branchSelect');
        if (select) {
            select.addEventListener('change', (e) => {
                const bId = e.target.value;
                if (bId && bId !== 'all' && bId !== currentBranchId) {
                    localStorage.setItem('active_branch_id', bId);
                    loadPreferences(bId);
                }
            });
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'active_branch_id' && e.newValue && e.newValue !== currentBranchId) {
                loadPreferences(e.newValue);
            }
        });
    }

    initBranchSwitcher();

    // ── Unsaved Changes Guard ────────────────────────────────────────────────
    window.addEventListener('beforeunload', (e) => {
        if (savebar && savebar.classList.contains('visible')) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ── Init ─────────────────────────────────────────────────────────────────
    loadPreferences();
});
