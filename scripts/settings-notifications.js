import { supabase } from '../lib/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const savebar = document.getElementById('savebar');
    const btnSave = document.getElementById('btnSave');

    // Helper to get company ID
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    }

    // ── Feather icons + sidebar ──
    if (typeof feather !== 'undefined') feather.replace();
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('mainWrapper').classList.toggle('sidebar-collapsed');
    });
    document.querySelectorAll('.nav-item.active').forEach(li => li.classList.add('open'));

    // ── Accordion expand / collapse ──
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('expanded');
        });
    });

    // ── Master toggles ──
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

    // ── Sub-event checkboxes ──
    document.querySelectorAll('.sub-event-list input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => showSaveBar());
    });

    function showSaveBar() { if (savebar) savebar.classList.add('visible'); }
    function hideSaveBar() { if (savebar) savebar.classList.remove('visible'); }

    window.cancelNotificationSettings = function () {
        hideSaveBar();
        loadPreferences();
    };

    // ── Default preferences (first-time state) ──
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

    // ── Load from DB ──
    async function loadPreferences() {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            const { data, error } = await supabase
                .from('company_settings')
                .select('notification_prefs')
                .eq('company_id', companyId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading notification prefs:', error);
            }

            const prefs = (data && data.notification_prefs) ? data.notification_prefs : defaultPrefs;

            // Also cache locally for the notification-manager to read
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(prefs));

            // Apply to UI
            Object.keys(prefs).forEach(category => {
                const catData = prefs[category];

                const masterEl = document.getElementById(`master_${category}`);
                if (masterEl) {
                    masterEl.checked = !!catData.master;
                    // Apply disabled state for sub-events
                    const body = masterEl.closest('.accordion-item').querySelector('.accordion-body');
                    body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.disabled = !catData.master;
                        cb.closest('.sub-event-row').classList.toggle('disabled', !catData.master);
                    });
                }

                Object.keys(catData).forEach(key => {
                    if (key === 'master') return;
                    const cb = document.getElementById(key);
                    if (cb) cb.checked = !!catData[key];
                });
            });

            if (typeof feather !== 'undefined') feather.replace();
        } catch (e) {
            console.error(e);
        }
    }

    // ── Save to DB ──
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const companyId = getCompanyId();
            if (!companyId) return;

            btnSave.disabled = true;
            btnSave.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';

            const newPrefs = {};
            const categories = ['bookings', 'customers', 'staff', 'services', 'pos', 'payments', 'marketing'];

            categories.forEach(cat => {
                newPrefs[cat] = {};
                const masterEl = document.getElementById(`master_${cat}`);
                newPrefs[cat].master = masterEl ? masterEl.checked : true;

                const item = document.querySelector(`.accordion-item[data-category="${cat}"]`);
                if (item) {
                    item.querySelectorAll('.sub-event-list input[type="checkbox"]').forEach(cb => {
                        newPrefs[cat][cb.id] = cb.checked;
                    });
                }
            });

            try {
                const { error } = await supabase
                    .from('company_settings')
                    .update({ notification_prefs: newPrefs })
                    .eq('company_id', companyId);

                if (error) throw error;

                localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(newPrefs));

                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = '✓ Notification settings saved!';
                    toast.classList.add('visible');
                    setTimeout(() => toast.classList.remove('visible'), 3000);
                }
                hideSaveBar();
            } catch (err) {
                console.error('Error saving notification prefs:', err);
                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Failed to save. Please try again.';
                    toast.style.background = '#ef4444';
                    toast.classList.add('visible');
                    setTimeout(() => { toast.classList.remove('visible'); toast.style.background = ''; }, 3000);
                }
            } finally {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Changes';
                if (typeof feather !== 'undefined') feather.replace();
            }
        });
    }

    // ── Init ──
    loadPreferences();
});
