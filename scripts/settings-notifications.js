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

    // Helper to get branch ID (with fallback to context and branches query)
    async function getBranchId(companyId) {
        let bId = localStorage.getItem('active_branch_id');
        if (bId && bId !== 'Downtown Branch' && bId !== 'all') return bId;
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.current_branch_id) return ctx.current_branch_id;
            if (ctx.branches && ctx.branches.length > 0 && (ctx.branches[0].id || ctx.branches[0].branch_id)) {
                return ctx.branches[0].id || ctx.branches[0].branch_id;
            }
        } catch {}
        if (companyId) {
            const { data: bList } = await supabase
                .from('branches')
                .select('branch_id')
                .eq('company_id', companyId)
                .limit(1);
            if (bList && bList.length > 0 && bList[0].branch_id) {
                localStorage.setItem('active_branch_id', bList[0].branch_id);
                return bList[0].branch_id;
            }
        }
        return null;
    }

    // ── Feather icons + sidebar ──
    if (typeof feather !== 'undefined') feather.replace();
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('mainWrapper').classList.toggle('sidebar-collapsed');
    });
    document.querySelectorAll('.nav-item.active').forEach(li => li.classList.add('open'));

    // ── Top-level 3-card Single-Open Accordion ──
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
                // Ensure all sub-level accordion items inside start collapsed
                currentPanel.querySelectorAll('.accordion-item').forEach(item => {
                    item.classList.remove('expanded');
                });
                currentPanel.classList.add('open');
                if (typeof feather !== 'undefined') feather.replace();
            }
        });
    });

    // ── Sub-category accordion expand / collapse ──
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('expanded');
        });
    });

    // ── System Notifications: Master toggles ──
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

    // ── System Notifications: Sub-event checkboxes ──
    document.querySelectorAll('.sub-event-list input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => showSaveBar());
    });

    // ── Customer Notifications: Master toggles ──
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

    // ── Customer Notifications: 5-Column Matrix & Row "Select All" ──
    function syncRowSelectAll(row) {
        const channelCheckboxes = row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk');
        const selectAllChk = row.querySelector('.select-all-chk');
        if (!selectAllChk || channelCheckboxes.length === 0) return;
        const allChecked = Array.from(channelCheckboxes).every(cb => cb.checked);
        selectAllChk.checked = allChecked;
    }

    function initCustomerMatrixEvents() {
        document.querySelectorAll('.cn-table tbody tr').forEach(row => {
            syncRowSelectAll(row);

            // Row-level Select All checkbox
            const selectAllChk = row.querySelector('.select-all-chk');
            selectAllChk?.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                    cb.checked = isChecked;
                });
                showSaveBar();
            });

            // Individual delivery channel checkboxes
            row.querySelectorAll('.whatsapp-chk, .sms-chk, .email-chk').forEach(cb => {
                cb.addEventListener('change', () => {
                    syncRowSelectAll(row);
                    showSaveBar();
                });
            });
        });
    }

    initCustomerMatrixEvents();

    // ── Marketing Notifications: Section toggles ──
    document.querySelectorAll('.mkt-master-toggle input[type="checkbox"]').forEach(toggle => {
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

    // ── Marketing Notifications: 5-Column Matrix & Row "Select All" ──
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

    initMarketingMatrixEvents();

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
        },
        marketing_notifications: {
            offers: {
                master: true,
                events: {
                    new_offer:    { whatsapp: true,  sms: true,  email: true },
                    new_discount: { whatsapp: true,  sms: true,  email: false }
                }
            },
            business: {
                master: true,
                events: {
                    new_service_added: { whatsapp: true,  sms: false, email: true },
                    new_product_added: { whatsapp: true,  sms: true,  email: false }
                }
            }
        },
        customer_notifications: {
            booking: {
                master: true,
                events: {
                    booking_confirm: { whatsapp: true, sms: true, email: true },
                    booking_modify: { whatsapp: true, sms: true, email: false },
                    booking_cancel: { whatsapp: true, sms: true, email: true },
                    booking_reminder: { whatsapp: true, sms: true, email: false },
                    booking_complete: { whatsapp: true, sms: false, email: false },
                    booking_noshow: { whatsapp: false, sms: true, email: false }
                }
            },
            purchase: {
                master: true,
                events: {
                    purchase_confirm: { whatsapp: true, sms: true, email: false },
                    payment_confirm: { whatsapp: true, sms: true, email: true },
                    invoice_receipt: { whatsapp: true, sms: false, email: true },
                    refund_confirm: { whatsapp: true, sms: true, email: true }
                }
            },
            membership: {
                master: true,
                events: {
                    member_purchase: { whatsapp: true, sms: true, email: true },
                    member_activate: { whatsapp: true, sms: false, email: false },
                    member_expiring: { whatsapp: true, sms: true, email: true },
                    member_expired: { whatsapp: true, sms: true, email: true },
                    member_renewed: { whatsapp: true, sms: true, email: true }
                }
            }
        }
    };

    // ── Load from DB ──
    async function loadPreferences() {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            const branchId = await getBranchId(companyId);
            // Fetch all notification rows for this company/branch
            let query = supabase
                .from('notification_settings')
                .select('*')
                .eq('company_id', companyId);

            if (branchId) {
                query = query.eq('branch_id', branchId);
            }

            const { data: rows, error } = await query;

            if (error) {
                console.error('Error loading notification settings:', error);
            }

            // Transform rows into the nested prefs structure expected by the UI
            const prefs = mapRowsToPrefs(rows) || defaultPrefs;

            // Also cache locally for the notification-manager to read
            localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(prefs));
            if (branchId) {
                localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(prefs));
            }

            // Apply System Notifications to UI
            const systemCategories = ['bookings', 'customers', 'staff', 'services', 'pos', 'payments', 'marketing'];
            systemCategories.forEach(category => {
                const catData = prefs[category] || defaultPrefs[category];
                if (!catData) return;

                const masterEl = document.getElementById(`master_${category}`);
                if (masterEl) {
                    masterEl.checked = !!catData.master;
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

            // Apply Customer Notifications to UI
            const custPrefs = prefs.customer_notifications || defaultPrefs.customer_notifications;
            ['booking', 'purchase', 'membership'].forEach(sec => {
                const secData = custPrefs[sec] || defaultPrefs.customer_notifications[sec];
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

            // Apply Marketing Notifications to UI
            const mktPrefs = prefs.marketing_notifications || defaultPrefs.marketing_notifications;
            ['offers', 'business'].forEach(sec => {
                const secData = mktPrefs[sec] || defaultPrefs.marketing_notifications[sec];
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
                            const wa  = row.querySelector('.whatsapp-chk');
                            const sms = row.querySelector('.sms-chk');
                            const em  = row.querySelector('.email-chk');
                            if (wa  && typeof evData.whatsapp !== 'undefined') wa.checked  = !!evData.whatsapp;
                            if (sms && typeof evData.sms     !== 'undefined') sms.checked = !!evData.sms;
                            if (em  && typeof evData.email   !== 'undefined') em.checked  = !!evData.email;
                        }
                        syncRowSelectAll(row);
                    });
                }
            });

            if (typeof feather !== 'undefined') feather.replace();
        } catch (e) {
            console.error(e);
        }
    }

    // ── Helper Functions ──
    function mapRowsToPrefs(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return JSON.parse(JSON.stringify(defaultPrefs));
        const prefs = JSON.parse(JSON.stringify(defaultPrefs));
        rows.forEach(r => {
            const { category, group_key, event_key, channel, enabled } = r;
            if (category === 'marketing') {
                if (!prefs.marketing_notifications) prefs.marketing_notifications = {};
                const sec = group_key;
                if (!prefs.marketing_notifications[sec]) prefs.marketing_notifications[sec] = { master: true, events: {} };
                if (event_key) {
                    if (!prefs.marketing_notifications[sec].events[event_key]) prefs.marketing_notifications[sec].events[event_key] = {};
                    prefs.marketing_notifications[sec].events[event_key][channel] = enabled;
                } else {
                    prefs.marketing_notifications[sec].master = enabled;
                }
            } else if (category === 'customer') {
                if (!prefs.customer_notifications) prefs.customer_notifications = {};
                const sec = group_key;
                if (!prefs.customer_notifications[sec]) prefs.customer_notifications[sec] = { master: true, events: {} };
                if (event_key) {
                    if (!prefs.customer_notifications[sec].events[event_key]) prefs.customer_notifications[sec].events[event_key] = {};
                    prefs.customer_notifications[sec].events[event_key][channel] = enabled;
                } else {
                    prefs.customer_notifications[sec].master = enabled;
                }
            } else {
                // System categories: category === 'system' with group_key (e.g. 'bookings', 'customers', etc.)
                const sec = group_key || category;
                if (prefs[sec]) {
                    if (event_key) {
                        prefs[sec][event_key] = enabled;
                    } else {
                        prefs[sec].master = enabled;
                    }
                }
            }
        });
        return prefs;
    }

    function buildRowsFromUI(companyId, branchId) {
        const rows = [];
        const systemCategories = ['bookings','customers','staff','services','pos','payments','marketing'];
        systemCategories.forEach(cat => {
            const masterEl = document.getElementById(`master_${cat}`);
            if (masterEl) {
                rows.push({
                    company_id: companyId,
                    branch_id: branchId,
                    category: 'system',
                    group_key: cat,
                    event_key: null,
                    channel: 'in_app',
                    enabled: masterEl.checked
                });
            }
            const catPrefs = defaultPrefs[cat] || {};
            Object.keys(catPrefs).forEach(key => {
                if (key === 'master') return;
                const cb = document.getElementById(key);
                if (cb) {
                    rows.push({
                        company_id: companyId,
                        branch_id: branchId,
                        category: 'system',
                        group_key: cat,
                        event_key: key,
                        channel: 'in_app',
                        enabled: cb.checked
                    });
                }
            });
        });

        ['booking','purchase','membership'].forEach(sec => {
            const masterEl = document.getElementById(`cust_master_${sec}`);
            if (masterEl) {
                rows.push({
                    company_id: companyId,
                    branch_id: branchId,
                    category: 'customer',
                    group_key: sec,
                    event_key: null,
                    channel: null,
                    enabled: masterEl.checked
                });
            }
            const table = document.querySelector(`.cn-table[data-section="${sec}"]`);
            if (table) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    row.querySelectorAll('.whatsapp-chk,.sms-chk,.email-chk').forEach(cb => {
                        const channel = cb.classList.contains('whatsapp-chk') ? 'whatsapp' : cb.classList.contains('sms-chk') ? 'sms' : 'email';
                        rows.push({
                            company_id: companyId,
                            branch_id: branchId,
                            category: 'customer',
                            group_key: sec,
                            event_key: evKey,
                            channel: channel,
                            enabled: cb.checked
                        });
                    });
                });
            }
        });

        ['offers','business'].forEach(sec => {
            const masterEl = document.getElementById(`mkt_master_${sec}`);
            if (masterEl) {
                rows.push({
                    company_id: companyId,
                    branch_id: branchId,
                    category: 'marketing',
                    group_key: sec,
                    event_key: null,
                    channel: null,
                    enabled: masterEl.checked
                });
            }
            const table = document.querySelector(`.cn-table[data-mkt-section="${sec}"]`);
            if (table) {
                table.querySelectorAll('tbody tr[data-event-key]').forEach(row => {
                    const evKey = row.getAttribute('data-event-key');
                    row.querySelectorAll('.whatsapp-chk,.sms-chk,.email-chk').forEach(cb => {
                        const channel = cb.classList.contains('whatsapp-chk') ? 'whatsapp' : cb.classList.contains('sms-chk') ? 'sms' : 'email';
                        rows.push({
                            company_id: companyId,
                            branch_id: branchId,
                            category: 'marketing',
                            group_key: sec,
                            event_key: evKey,
                            channel: channel,
                            enabled: cb.checked
                        });
                    });
                });
            }
        });
        return rows;
    }

    // ── Save to DB ──
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const companyId = getCompanyId();
            if (!companyId) {
                alert('No active company found. Please sign in again.');
                return;
            }

            btnSave.disabled = true;
            btnSave.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';

            try {
                const branchId = await getBranchId(companyId);
                if (!branchId) {
                    throw new Error('No branch ID found. Please make sure a branch is configured.');
                }

                // Build rows for insertion
                const rows = buildRowsFromUI(companyId, branchId);
                console.log(`Saving ${rows.length} notification settings rows for branch:`, branchId);

                // 1. Delete previous settings for this company & branch
                const { error: delErr } = await supabase
                    .from('notification_settings')
                    .delete()
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId);

                if (delErr) {
                    console.error('Error clearing old settings:', delErr);
                    throw delErr;
                }

                // 2. Insert new settings rows
                const { error: insErr } = await supabase
                    .from('notification_settings')
                    .insert(rows);

                if (insErr) {
                    console.error('Error inserting settings:', insErr);
                    throw insErr;
                }

                // Update local cache for notification-manager
                const prefs = mapRowsToPrefs(rows);
                localStorage.setItem(`notification_prefs_${companyId}`, JSON.stringify(prefs));
                localStorage.setItem(`notification_prefs_${companyId}_${branchId}`, JSON.stringify(prefs));

                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = '✓ Notification settings saved!';
                    toast.style.background = '#22c55e';
                    toast.classList.add('visible');
                    setTimeout(() => { toast.classList.remove('visible'); toast.style.background = ''; }, 3000);
                }
                hideSaveBar();
            } catch (err) {
                console.error('Error saving notification settings:', err);
                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = err.message ? `Failed to save: ${err.message}` : 'Failed to save. Please try again.';
                    toast.style.background = '#ef4444';
                    toast.classList.add('visible');
                    setTimeout(() => { toast.classList.remove('visible'); toast.style.background = ''; }, 4000);
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
