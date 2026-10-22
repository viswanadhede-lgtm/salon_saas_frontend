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

    // ── Helper to get branch ID (with fallback to context and branches table) ──
    async function getBranchId(companyId) {
        try {
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
            const { data: bList } = await supabase
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

    // ── Top-level 3-card Single-Open Accordion ────────────────────────────────
    const topPanels = document.querySelectorAll('.notif-top-panel');
    document.querySelectorAll('.notif-top-header').forEach(header => {
        header.addEventListener('click', () => {
            const currentPanel = header.closest('.notif-top-panel');
            if (!currentPanel) return;

            const isOpen = currentPanel.classList.contains('open');

            // Single-open behavior: collapse all top panels first
            topPanels.forEach(p => p.classList.remove('open'));

            // If the clicked card was previously closed, expand it
            if (!isOpen) {
                currentPanel.querySelectorAll('.accordion-item').forEach(item => {
                    item.classList.remove('expanded');
                });
                currentPanel.classList.add('open');
                if (typeof feather !== 'undefined') feather.replace();
            }
        });
    });

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

    // ── Customer Notifications: Master toggles ───────────────────────────────
    document.querySelectorAll('.cust-master-toggle input[type="checkbox"]').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const table = e.target.closest('.accordion-item').querySelector('.cn-table');
            if (table) {
                table.classList.toggle('disabled-matrix', !isChecked);
                table.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.disabled = !isChecked;
                });
            }
            showSaveBar();
        });
    });

    // ── Customer & Marketing Notifications: Row "Select All" Sync ────────────
    function syncRowSelectAll(row) {
        const channelCheckboxes = row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk');
        const selectAllChk = row.querySelector('.select-all-chk');
        if (!selectAllChk || channelCheckboxes.length === 0) return;
        const allChecked = Array.from(channelCheckboxes).every(cb => cb.checked);
        selectAllChk.checked = allChecked;
    }

    function initCustomerMatrixEvents() {
        document.querySelectorAll('.cn-table[data-section] tbody tr').forEach(row => {
            syncRowSelectAll(row);

            const selectAllChk = row.querySelector('.select-all-chk');
            selectAllChk?.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                    cb.checked = isChecked;
                });
                showSaveBar();
            });

            row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                cb.addEventListener('change', () => {
                    syncRowSelectAll(row);
                    showSaveBar();
                });
            });
        });
    }

    function initMarketingMatrixEvents() {
        document.querySelectorAll('.cn-table[data-mkt-section] tbody tr').forEach(row => {
            syncRowSelectAll(row);

            const selectAllChk = row.querySelector('.select-all-chk');
            selectAllChk?.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                    cb.checked = isChecked;
                });
                showSaveBar();
            });

            row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                cb.addEventListener('change', () => {
                    syncRowSelectAll(row);
                    showSaveBar();
                });
            });
        });
    }

    initCustomerMatrixEvents();
    initMarketingMatrixEvents();

    function showSaveBar() { if (savebar) savebar.classList.add('visible'); }
    function hideSaveBar() { if (savebar) savebar.classList.remove('visible'); }

    // ── Default Preferences (Clean Initial State) ────────────────────────────
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
        },
        customer_notifications: {
            booking: {
                master: true,
                events: {
                    booking_confirm:  { whatsapp: true,  sms: true,  email: true },
                    booking_modify:   { whatsapp: true,  sms: true,  email: false },
                    booking_cancel:   { whatsapp: true,  sms: true,  email: true },
                    booking_reminder: { whatsapp: true,  sms: true,  email: false },
                    booking_complete: { whatsapp: true,  sms: false, email: false },
                    booking_noshow:   { whatsapp: false, sms: true,  email: false }
                }
            },
            purchase: {
                master: true,
                events: {
                    purchase_confirm: { whatsapp: true, sms: true,  email: false },
                    payment_confirm:  { whatsapp: true, sms: true,  email: true },
                    invoice_receipt:  { whatsapp: true, sms: false, email: true },
                    refund_confirm:   { whatsapp: true, sms: true,  email: true }
                }
            },
            membership: {
                master: true,
                events: {
                    member_purchase:  { whatsapp: true, sms: true,  email: true },
                    member_activate:  { whatsapp: true, sms: false, email: false },
                    member_expiring:  { whatsapp: true, sms: true,  email: true },
                    member_expired:   { whatsapp: true, sms: true,  email: true },
                    member_renewed:   { whatsapp: true, sms: true,  email: true }
                }
            }
        },
        marketing_notifications: {
            offers: {
                master: true,
                events: {
                    new_offer:    { whatsapp: true, sms: true,  email: true },
                    new_discount: { whatsapp: true, sms: true,  email: false }
                }
            },
            business: {
                master: true,
                events: {
                    new_service_added: { whatsapp: true, sms: false, email: true },
                    new_product_added: { whatsapp: true, sms: true,  email: false }
                }
            }
        }
    };

    // ── Collect UI Form State into Clean Objects ─────────────────────────────
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

    function collectCustomerPrefsFromUI() {
        const cust = {};
        ['booking', 'purchase', 'membership'].forEach(sec => {
            const masterEl = document.getElementById(`cust_master_${sec}`);
            cust[sec] = {
                master: masterEl ? masterEl.checked : true,
                events: {}
            };

            const table = document.querySelector(`.cn-table[data-section="${sec}"]`);
            if (table) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    const wa = row.querySelector('.whatsapp-chk')?.checked || false;
                    const sms = row.querySelector('.sms-chk')?.checked || false;
                    const em = row.querySelector('.email-chk')?.checked || false;
                    cust[sec].events[evKey] = { whatsapp: wa, sms: sms, email: em };
                });
            }
        });
        return cust;
    }

    function collectMarketingPrefsFromUI() {
        const mkt = {};
        ['offers', 'business'].forEach(sec => {
            const masterEl = document.getElementById(`mkt_master_${sec}`);
            mkt[sec] = {
                master: masterEl ? masterEl.checked : true,
                events: {}
            };

            const table = document.querySelector(`.cn-table[data-mkt-section="${sec}"]`);
            if (table) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    const wa = row.querySelector('.whatsapp-chk')?.checked || false;
                    const sms = row.querySelector('.sms-chk')?.checked || false;
                    const em = row.querySelector('.email-chk')?.checked || false;
                    mkt[sec].events[evKey] = { whatsapp: wa, sms: sms, email: em };
                });
            }
        });
        return mkt;
    }

    // ── Apply Preferences to the UI Form Elements ────────────────────────────
    function applyPreferencesToUI(systemPrefs, customerPrefs, marketingPrefs) {
        // 1. System Notifications
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

        // 2. Customer Notifications
        const cust = customerPrefs || defaultPrefs.customer_notifications;
        ['booking', 'purchase', 'membership'].forEach(sec => {
            const secData = cust[sec] || defaultPrefs.customer_notifications[sec];
            if (!secData) return;

            const masterEl = document.getElementById(`cust_master_${sec}`);
            const table = document.querySelector(`.cn-table[data-section="${sec}"]`);
            if (masterEl) {
                masterEl.checked = !!secData.master;
                if (table) {
                    table.classList.toggle('disabled-matrix', !secData.master);
                    table.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.disabled = !secData.master;
                    });
                }
            }

            if (table && secData.events) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    const evData = secData.events[evKey];
                    if (evData) {
                        const wa = row.querySelector('.whatsapp-chk');
                        const sms = row.querySelector('.sms-chk');
                        const em = row.querySelector('.email-chk');
                        if (wa && typeof evData.whatsapp !== 'undefined') wa.checked = !!evData.whatsapp;
                        if (sms && typeof evData.sms !== 'undefined') sms.checked = !!evData.sms;
                        if (em && typeof evData.email !== 'undefined') em.checked = !!evData.email;
                    }
                    syncRowSelectAll(row);
                });
            }
        });

        // 3. Marketing Notifications
        const mkt = marketingPrefs || defaultPrefs.marketing_notifications;
        ['offers', 'business'].forEach(sec => {
            const secData = mkt[sec] || defaultPrefs.marketing_notifications[sec];
            if (!secData) return;

            const masterEl = document.getElementById(`mkt_master_${sec}`);
            const table = document.querySelector(`.cn-table[data-mkt-section="${sec}"]`);
            if (masterEl) {
                masterEl.checked = !!secData.master;
                if (table) {
                    table.classList.toggle('disabled-matrix', !secData.master);
                    table.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.disabled = !secData.master;
                    });
                }
            }

            if (table && secData.events) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    const evData = secData.events[evKey];
                    if (evData) {
                        const wa = row.querySelector('.whatsapp-chk');
                        const sms = row.querySelector('.sms-chk');
                        const em = row.querySelector('.email-chk');
                        if (wa && typeof evData.whatsapp !== 'undefined') wa.checked = !!evData.whatsapp;
                        if (sms && typeof evData.sms !== 'undefined') sms.checked = !!evData.sms;
                        if (em && typeof evData.email !== 'undefined') em.checked = !!evData.email;
                    }
                    syncRowSelectAll(row);
                });
            }
        });

        if (typeof feather !== 'undefined') feather.replace();
    }

    // ── Load Notification Preferences from DB ────────────────────────────────
    async function loadPreferences(branchIdOverride = null) {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            const branchId = branchIdOverride || await getBranchId(companyId);
            if (!branchId) return;

            currentBranchId = branchId;

            // Sync header branch dropdown if present
            const branchSelect = document.getElementById('branchSelect');
            if (branchSelect && branchSelect.value !== branchId) {
                branchSelect.value = branchId;
            }

            // Fetch single row for this company and branch
            const { data, error } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .maybeSingle();

            if (error) {
                console.warn('[settings-notifications] Error loading settings:', error);
            }

            let systemPrefs, customerPrefs, marketingPrefs;

            if (data) {
                systemPrefs = data.system_notifications || {};
                customerPrefs = data.customer_notifications || {};
                marketingPrefs = data.marketing_notifications || {};
            } else {
                systemPrefs = {
                    bookings: defaultPrefs.bookings,
                    customers: defaultPrefs.customers,
                    staff: defaultPrefs.staff,
                    services: defaultPrefs.services,
                    pos: defaultPrefs.pos,
                    payments: defaultPrefs.payments,
                    marketing: defaultPrefs.marketing
                };
                customerPrefs = defaultPrefs.customer_notifications;
                marketingPrefs = defaultPrefs.marketing_notifications;
            }

            applyPreferencesToUI(systemPrefs, customerPrefs, marketingPrefs);

            // Update local cache for notification-manager (powers bell icon & toasts)
            const cachePayload = {
                ...systemPrefs,
                customer_notifications: customerPrefs,
                marketing_notifications: marketingPrefs
            };
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(cachePayload));
            localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(cachePayload));

            hideSaveBar();

        } catch (err) {
            console.error('[settings-notifications] Unexpected load error:', err);
        }
    }

    // ── Save Preferences to DB (Atomic Upsert) ────────────────────────────────
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
            const customerPrefs = collectCustomerPrefsFromUI();
            const marketingPrefs = collectMarketingPrefsFromUI();
            const now = new Date().toISOString();

            // 1 single atomic upsert using composite unique constraint (company_id, branch_id)
            const payload = {
                company_id: companyId,
                branch_id: branchId,
                system_notifications: systemPrefs,
                customer_notifications: customerPrefs,
                marketing_notifications: marketingPrefs,
                updated_at: now
            };

            const { error: upsertErr } = await supabase
                .from('notification_settings')
                .upsert(payload, { onConflict: 'company_id,branch_id' });

            if (upsertErr) {
                throw new Error(upsertErr.message || 'Failed to save notification settings');
            }

            // Update local cache for immediate feedback in bell & toasts
            const cachePayload = {
                ...systemPrefs,
                customer_notifications: customerPrefs,
                marketing_notifications: marketingPrefs
            };
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(cachePayload));
            localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(cachePayload));

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

    if (btnSave) {
        btnSave.addEventListener('click', savePreferences);
    }

    window.cancelNotificationSettings = function () {
        hideSaveBar();
        loadPreferences(currentBranchId);
    };

    window.loadNotificationSettings = loadPreferences;
    window.saveNotificationSettings = savePreferences;

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

    // ── Init ─────────────────────────────────────────────────────────────────
    loadPreferences();
});
