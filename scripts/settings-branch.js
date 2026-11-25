/**
 * Controller script for settings-branch.html
 * Handles tab navigation, query string sync (?tab=),
 * dirty-state confirmation, and unified save/cancel triggers
 * across the 5 branch settings tabs:
 * 1. branches (Branch Settings / Locations list)
 * 2. hours (Branch Opening Hours)
 * 3. invoice (Invoice Settings)
 * 4. payments (Payments Settings)
 * 5. notifications (Notification Settings)
 */

document.addEventListener('DOMContentLoaded', () => {
    const VALID_TABS = ['branches', 'hours', 'invoice', 'payments', 'notifications'];
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    const tabPanes = document.querySelectorAll('.settings-tab-pane');
    const savebar = document.getElementById('savebar');
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');

    let activeTab = 'branches';
    window.isDirty = false;

    // Global dirty state setters
    window.markDirty = function () {
        window.isDirty = true;
        if (activeTab === 'hours' || activeTab === 'payments' || activeTab === 'notifications') {
            savebar?.classList.add('visible');
        }
    };

    window.clearDirty = function () {
        window.isDirty = false;
        savebar?.classList.remove('visible');
    };

    function setActiveTab(tabId, pushState = true) {
        if (!VALID_TABS.includes(tabId)) {
            tabId = 'branches';
        }

        // Check for unsaved changes before switching
        if (window.isDirty && activeTab !== tabId) {
            const confirmLeave = confirm('You have unsaved changes on the current tab. Discard changes and switch?');
            if (!confirmLeave) return;
            window.clearDirty();
        }

        activeTab = tabId;

        // Update Tab Buttons
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update Tab Panes
        tabPanes.forEach(pane => {
            if (pane.id === `pane-${tabId}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Hide savebar when entering a clean tab or tabs without savebar (branches, invoice)
        if (!window.isDirty || tabId === 'branches' || tabId === 'invoice') {
            savebar?.classList.remove('visible');
        }

        // Re-render icons if needed
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Tab-specific trigger on load/switch
        if (tabId === 'hours' && typeof window.loadHoursData === 'function') {
            window.loadHoursData();
        } else if (tabId === 'payments' && typeof window.loadPaymentSettings === 'function') {
            window.loadPaymentSettings();
        } else if (tabId === 'notifications' && typeof window.loadNotificationSettings === 'function') {
            window.loadNotificationSettings();
        }

        // Update URL query parameter
        if (pushState) {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tabId);
            window.history.replaceState({ tab: tabId }, '', url.toString());
        }
    }

    // Attach click listener to tab navigation buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = btn.dataset.tab;
            if (targetTab && targetTab !== activeTab) {
                setActiveTab(targetTab);
            }
        });
    });

    // Unified Save Button
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (activeTab === 'hours') {
                if (typeof window.saveHours === 'function') {
                    await window.saveHours();
                }
            } else if (activeTab === 'payments') {
                if (typeof window.savePaymentSettings === 'function') {
                    await window.savePaymentSettings();
                }
            } else if (activeTab === 'notifications') {
                if (typeof window.saveNotificationSettings === 'function') {
                    await window.saveNotificationSettings();
                }
            }
        });
    }

    // Unified Cancel Button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (activeTab === 'hours') {
                if (typeof window.cancelHours === 'function') {
                    window.cancelHours();
                }
            } else if (activeTab === 'payments') {
                if (typeof window.cancelPaymentSettings === 'function') {
                    window.cancelPaymentSettings();
                }
            } else if (activeTab === 'notifications') {
                if (typeof window.cancelNotificationSettings === 'function') {
                    window.cancelNotificationSettings();
                }
            }
            window.clearDirty();
        });
    }

    // Attach dirty listeners to Payments tab inputs
    const paymentsPane = document.getElementById('pane-payments');
    if (paymentsPane) {
        paymentsPane.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.id === 'qrFileInput') return; // File input handled in settings-payments.js
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
                window.markDirty();
            });
        });
    }

    // Read initial tab from URL query params (e.g. ?tab=hours)
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab && VALID_TABS.includes(initialTab)) {
        setActiveTab(initialTab, false);
    } else {
        setActiveTab('branches', false);
    }

    // Guard on page leave if unsaved
    window.addEventListener('beforeunload', (e) => {
        if (window.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
