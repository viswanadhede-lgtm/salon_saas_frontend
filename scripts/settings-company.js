/**
 * Controller script for settings-company.html
 * Handles tab navigation, query string sync (?tab=),
 * dirty-state confirmation, and unified save/cancel triggers
 * across the 3 company settings tabs:
 * 1. business (Business Details & Branding)
 * 2. contact (Contact Channels & Addresses)
 * 3. tax (Tax Identification & Settings)
 */

document.addEventListener('DOMContentLoaded', () => {
    const VALID_TABS = ['business', 'contact', 'tax'];
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    const tabPanes = document.querySelectorAll('.settings-tab-pane');
    const savebar = document.getElementById('savebar');
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');

    let activeTab = 'business';
    window.isDirty = false;

    // Global dirty state setters
    window.markDirty = function () {
        window.isDirty = true;
        savebar?.classList.add('visible');
    };

    window.clearDirty = function () {
        window.isDirty = false;
        savebar?.classList.remove('visible');
    };

    // Toast Notification Helper
    window.showToast = function (msg, type = 'success') {
        const t = document.getElementById('toastNotification');
        if (!t) return;
        t.textContent = msg;
        t.style.background = type === 'error' ? '#dc2626' : '#1e293b';
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), 3500);
    };

    function setActiveTab(tabId, pushState = true) {
        if (!VALID_TABS.includes(tabId)) {
            tabId = 'business';
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

        // Hide savebar when entering a clean tab
        if (!window.isDirty) {
            savebar?.classList.remove('visible');
        }

        // Sync legal name display if switching to tax tab
        if (tabId === 'tax') {
            const legalName = document.getElementById('companyName')?.value || '';
            const taxLegalInput = document.getElementById('taxCompanyName');
            if (taxLegalInput && legalName) {
                taxLegalInput.value = legalName;
            }
        }

        // Re-render icons if needed
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Tab-specific trigger on switch
        if (tabId === 'business' && typeof window.loadBusinessData === 'function') {
            window.loadBusinessData();
        } else if (tabId === 'contact' && typeof window.loadContactData === 'function') {
            window.loadContactData();
        } else if (tabId === 'tax' && typeof window.loadTaxData === 'function') {
            window.loadTaxData();
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
            if (activeTab === 'business') {
                if (typeof window.saveBusinessSettings === 'function') {
                    await window.saveBusinessSettings();
                }
            } else if (activeTab === 'contact') {
                if (typeof window.saveContactSettings === 'function') {
                    await window.saveContactSettings();
                }
            } else if (activeTab === 'tax') {
                if (typeof window.saveTaxSettings === 'function') {
                    await window.saveTaxSettings();
                }
            }
        });
    }

    // Unified Cancel Button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (activeTab === 'business') {
                if (typeof window.loadBusinessData === 'function') {
                    window.loadBusinessData();
                }
            } else if (activeTab === 'contact') {
                if (typeof window.loadContactData === 'function') {
                    window.loadContactData();
                }
            } else if (activeTab === 'tax') {
                if (typeof window.loadTaxData === 'function') {
                    window.loadTaxData();
                }
            }
            window.clearDirty();
        });
    }

    // Attach dirty listeners to form inputs across all tabs
    document.querySelectorAll('.form-input, .form-select, .form-textarea, input[type=checkbox]').forEach(el => {
        if (el.id === 'taxCompanyName') return; // Read-only synced field
        if (el.id === 'logoFileInput' || el.id === 'coverFileInput') return; // Handled in settings-business.js
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            window.markDirty();
        });
    });

    // Read initial tab from URL query params (e.g. ?tab=contact)
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab && VALID_TABS.includes(initialTab)) {
        setActiveTab(initialTab, false);
    } else {
        setActiveTab('business', false);
    }

    // Guard on page leave if unsaved
    window.addEventListener('beforeunload', (e) => {
        if (window.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
