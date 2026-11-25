/**
 * Controller script for settings-company.html
 * Handles:
 * 1. Tab navigation & URL deep linking (?tab=business|contact|tax)
 * 2. Multi-GST registration dynamic add / remove (Frontend-only state)
 * 3. Subscription/Billing Contact "Same as Primary" toggle & inheritance
 * 4. Automatic synchronization of Legal Business Name to Tax tab
 * 5. Safe frontend-only save & cancel interactions (No DB mutations in this phase)
 */

import { supabase } from '../lib/supabase.js';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

document.addEventListener('DOMContentLoaded', async () => {
    const VALID_TABS = ['business', 'contact', 'tax'];
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    const tabPanes = document.querySelectorAll('.settings-tab-pane');
    const savebar = document.getElementById('savebar');
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');

    let activeTab = 'business';
    window.isDirty = false;

    // ── Dirty State Helpers ──────────────────────────────────────────────
    window.markDirty = function () {
        window.isDirty = true;
        savebar?.classList.add('visible');
    };

    window.clearDirty = function () {
        window.isDirty = false;
        savebar?.classList.remove('visible');
    };

    // ── Toast Notification Helper ────────────────────────────────────────
    window.showToast = function (msg, type = 'success') {
        let t = document.getElementById('toastNotification');
        if (!t) return;
        t.textContent = msg;
        t.style.background = type === 'error' ? '#dc2626' : '#1e293b';
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), 3500);
    };

    // ── Tab Switching ────────────────────────────────────────────────────
    function setActiveTab(tabId, pushState = true) {
        if (!VALID_TABS.includes(tabId)) {
            tabId = 'business';
        }

        // Prompt if leaving dirty tab
        if (window.isDirty && activeTab !== tabId) {
            const confirmLeave = confirm('You have unsaved changes on the current tab. Discard changes and switch?');
            if (!confirmLeave) return;
            window.clearDirty();
        }

        activeTab = tabId;

        // Update Tab Buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update Tab Panes
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `pane-${tabId}`);
        });

        // Sync legal name to tax tab whenever switching to Tax
        if (tabId === 'tax') {
            syncLegalNameToTax();
        }

        // Hide savebar when entering clean tab
        if (!window.isDirty) {
            savebar?.classList.remove('visible');
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Update URL query parameter
        if (pushState) {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tabId);
            window.history.replaceState({ tab: tabId }, '', url.toString());
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = btn.dataset.tab;
            if (targetTab && targetTab !== activeTab) {
                setActiveTab(targetTab);
            }
        });
    });

    // ── Sync Legal Business Name to Tax Tab ──────────────────────────────
    function syncLegalNameToTax() {
        const legalNameInput = document.getElementById('companyName');
        const taxLegalInput = document.getElementById('taxCompanyName');
        if (taxLegalInput && legalNameInput) {
            taxLegalInput.value = legalNameInput.value.trim() || 'Not specified';
        }
    }

    document.getElementById('companyName')?.addEventListener('input', syncLegalNameToTax);

    // ── Billing Contact Interaction ("Same as Primary Contact") ──────────
    const sameAsPrimaryCheckbox = document.getElementById('sameAsPrimaryContact');
    const billingNotice = document.getElementById('billingInheritNotice');
    const billingFieldsContainer = document.getElementById('billingFieldsContainer');
    const billingSummary = document.getElementById('billingInheritSummary');

    function updateBillingInheritSummary() {
        const primaryName = document.getElementById('primaryContactName')?.value.trim() || 'Primary Contact';
        const primaryEmail = document.getElementById('contactEmail')?.value.trim() || 'contact@example.com';
        if (billingSummary) {
            billingSummary.textContent = `${primaryName} • ${primaryEmail}`;
        }
    }

    function toggleBillingContactMode() {
        const isSame = sameAsPrimaryCheckbox ? sameAsPrimaryCheckbox.checked : true;
        if (isSame) {
            if (billingNotice) billingNotice.style.display = 'flex';
            if (billingFieldsContainer) billingFieldsContainer.style.display = 'none';
            updateBillingInheritSummary();
        } else {
            if (billingNotice) billingNotice.style.display = 'none';
            if (billingFieldsContainer) billingFieldsContainer.style.display = 'block';

            // Auto-fill default values from primary contact if currently empty
            const bName = document.getElementById('billingContactName');
            const bEmail = document.getElementById('billingEmail');
            const bPhone = document.getElementById('billingPhone');

            if (bName && !bName.value) {
                bName.value = document.getElementById('primaryContactName')?.value || '';
            }
            if (bEmail && !bEmail.value) {
                bEmail.value = document.getElementById('contactEmail')?.value || '';
            }
            if (bPhone && !bPhone.value) {
                bPhone.value = document.getElementById('contactPhone')?.value || '';
            }
        }
        window.markDirty();
    }

    if (sameAsPrimaryCheckbox) {
        sameAsPrimaryCheckbox.addEventListener('change', toggleBillingContactMode);
    }

    document.getElementById('primaryContactName')?.addEventListener('input', updateBillingInheritSummary);
    document.getElementById('contactEmail')?.addEventListener('input', updateBillingInheritSummary);

    // ── Multiple GST Registrations Management ────────────────────────────
    const gstListContainer = document.getElementById('gstListContainer');
    const btnAddGst = document.getElementById('btnAddGst');

    function renderGstRow(gstin = '', state = '', index = 1) {
        const row = document.createElement('div');
        row.className = 'gst-card-row';
        row.dataset.gstRow = 'true';

        row.innerHTML = `
            <div class="gst-card-header">
                <span class="gst-card-title">
                    <span class="gst-badge-index">${index}</span>
                    GST Registration #${index}
                </span>
                <button type="button" class="btn-remove-gst" title="Remove GST Registration">
                    <i data-feather="trash-2"></i> Remove
                </button>
            </div>
            <div class="form-row" style="margin-bottom:0;">
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Goods &amp; Services Tax Identification Number (GSTIN) <span class="required">*</span></label>
                    <div class="input-prefix-wrap">
                        <span class="input-prefix"><i data-feather="hash" style="width:14px;height:14px;"></i></span>
                        <input type="text" class="form-input with-prefix gst-number-input" placeholder="e.g., 29ABCDE1234F1Z5" maxlength="15" value="${gstin}" style="text-transform:uppercase;">
                    </div>
                    <p class="form-hint">15-digit alphanumeric GSTIN</p>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">GST Registration State <span class="required">*</span></label>
                    <select class="form-select gst-state-select">
                        <option value="">Select State</option>
                        ${INDIAN_STATES.map(s => `<option value="${s}" ${s.toLowerCase() === state.toLowerCase() ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <p class="form-hint">State where this GSTIN is registered</p>
                </div>
            </div>
        `;

        // Attach Remove Click Handler
        const removeBtn = row.querySelector('.btn-remove-gst');
        removeBtn.addEventListener('click', () => {
            const allRows = gstListContainer.querySelectorAll('.gst-card-row');
            if (allRows.length > 1) {
                row.remove();
                renumberGstRows();
                window.markDirty();
            } else {
                // If only 1 row, clear the fields instead of removing completely
                row.querySelector('.gst-number-input').value = '';
                row.querySelector('.gst-state-select').value = '';
                window.markDirty();
                window.showToast('Cleared GST registration fields', 'success');
            }
        });

        // Input change dirty listeners
        row.querySelectorAll('input, select').forEach(el => {
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
                window.markDirty();
            });
        });

        return row;
    }

    function renumberGstRows() {
        if (!gstListContainer) return;
        const rows = gstListContainer.querySelectorAll('.gst-card-row');
        rows.forEach((row, i) => {
            const idx = i + 1;
            const badge = row.querySelector('.gst-badge-index');
            const title = row.querySelector('.gst-card-title');
            if (badge) badge.textContent = idx;
            if (title) {
                title.innerHTML = `<span class="gst-badge-index">${idx}</span> GST Registration #${idx}`;
            }
        });
        if (typeof feather !== 'undefined') feather.replace();
    }

    if (btnAddGst && gstListContainer) {
        btnAddGst.addEventListener('click', () => {
            const currentCount = gstListContainer.querySelectorAll('.gst-card-row').length;
            const newRow = renderGstRow('', '', currentCount + 1);
            gstListContainer.appendChild(newRow);
            if (typeof feather !== 'undefined') feather.replace();

            // Focus new GSTIN input
            const input = newRow.querySelector('.gst-number-input');
            if (input) input.focus();

            window.markDirty();
        });
    }

    // ── Safe Frontend Save and Cancel Interactions ───────────────────────
    window.removeLogo = function () {
        const fileInput = document.getElementById('logoFileInput');
        if (fileInput) fileInput.value = '';
        const logoBox = document.getElementById('logoPreviewBox');
        if (logoBox) logoBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
        const btnRemove = document.getElementById('btnRemoveLogo');
        if (btnRemove) btnRemove.style.display = 'none';
        if (typeof feather !== 'undefined') feather.replace();
        window.markDirty();
    };

    window.removeCover = function () {
        const fileInput = document.getElementById('coverFileInput');
        if (fileInput) fileInput.value = '';
        const coverBox = document.getElementById('coverPreviewBox');
        if (coverBox) coverBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
        const btnRemove = document.getElementById('btnRemoveCover');
        if (btnRemove) btnRemove.style.display = 'none';
        if (typeof feather !== 'undefined') feather.replace();
        window.markDirty();
    };

    // Client-side file preview handlers
    document.getElementById('logoFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const box = document.getElementById('logoPreviewBox');
                if (box) box.innerHTML = `<img src="${evt.target.result}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
                const btnRemove = document.getElementById('btnRemoveLogo');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
                window.markDirty();
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('coverFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const box = document.getElementById('coverPreviewBox');
                if (box) box.innerHTML = `<img src="${evt.target.result}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">`;
                const btnRemove = document.getElementById('btnRemoveCover');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
                window.markDirty();
            };
            reader.readAsDataURL(file);
        }
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            const originalHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px;"></span>
                Saving...
            `;

            // Simulate realistic save interaction in UI
            await new Promise(r => setTimeout(r, 550));

            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHtml;
            if (typeof feather !== 'undefined') feather.replace();

            window.clearDirty();
            window.showToast('Company settings updated successfully (UI Preview mode)', 'success');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            window.clearDirty();
            window.showToast('Changes discarded', 'success');
            // Re-sync legal name
            syncLegalNameToTax();
        });
    }

    // Attach dirty listeners to all standard inputs
    function setupInputDirtyListeners() {
        document.querySelectorAll('.form-input, .form-select, .form-textarea, input[type=checkbox]').forEach(el => {
            if (el.id === 'taxCompanyName') return; // Read-only
            if (el.id === 'logoFileInput' || el.id === 'coverFileInput') return;
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
                window.markDirty();
            });
        });
    }
    setupInputDirtyListeners();

    // ── Load Real Company Data into Redesigned UI (Read-Only) ────────────
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch {}
        return localStorage.getItem('company_id') || null;
    }

    async function loadInitialData() {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            // 1. Fetch Company Settings & Branding
            const { data: compSettings } = await supabase.schema('shared')
                .from('company_settings')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            // 2. Fetch Companies fallback
            const { data: comp } = await supabase.schema('shared')
                .from('companies')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            // 3. Fetch Contacts
            const { data: contacts } = await supabase.schema('shared')
                .from('company_contacts')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            // 4. Fetch Tax Settings
            const { data: taxSettings } = await supabase.schema('shared')
                .from('company_tax_settings')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            // Populate Business Tab
            const legalName = compSettings?.legal_business_name || comp?.company_name || '';
            const dispName = compSettings?.display_name || comp?.display_name || legalName;
            if (document.getElementById('companyName')) document.getElementById('companyName').value = legalName;
            if (document.getElementById('displayName')) document.getElementById('displayName').value = dispName;
            if (document.getElementById('businessCategory')) {
                document.getElementById('businessCategory').value = compSettings?.business_category || comp?.business_category || 'salon_spa';
            }
            if (document.getElementById('businessDescription')) {
                document.getElementById('businessDescription').value = compSettings?.business_description || '';
            }
            if (document.getElementById('companyWebsite')) {
                document.getElementById('companyWebsite').value = compSettings?.website || comp?.website || '';
            }
            if (document.getElementById('instagramUrl')) {
                document.getElementById('instagramUrl').value = compSettings?.instagram_url || '';
            }
            if (document.getElementById('facebookUrl')) {
                document.getElementById('facebookUrl').value = compSettings?.facebook_url || '';
            }

            // Populate Logos if available
            const logoUrl = compSettings?.logo_url || comp?.logo_url;
            if (logoUrl) {
                const box = document.getElementById('logoPreviewBox');
                if (box) box.innerHTML = `<img src="${logoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
                const btnRemove = document.getElementById('btnRemoveLogo');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
            }

            const coverUrl = compSettings?.cover_image_url || comp?.cover_image_url;
            if (coverUrl) {
                const box = document.getElementById('coverPreviewBox');
                if (box) box.innerHTML = `<img src="${coverUrl}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">`;
                const btnRemove = document.getElementById('btnRemoveCover');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
            }

            // Populate Contact Tab
            const contactName = contacts?.contact_person_name || comp?.owner_name || '';
            const contactEmail = contacts?.email || comp?.owner_email || '';
            const contactPhone = contacts?.primary_phone || comp?.owner_phone || '';

            if (document.getElementById('primaryContactName')) document.getElementById('primaryContactName').value = contactName;
            if (document.getElementById('contactEmail')) document.getElementById('contactEmail').value = contactEmail;
            if (document.getElementById('contactPhone')) document.getElementById('contactPhone').value = contactPhone;
            if (document.getElementById('contactAlternatePhone')) document.getElementById('contactAlternatePhone').value = contacts?.alternate_phone || '';

            if (document.getElementById('addressLine1')) document.getElementById('addressLine1').value = contacts?.address_line_1 || '';
            if (document.getElementById('addressLine2')) document.getElementById('addressLine2').value = contacts?.address_line_2 || '';
            if (document.getElementById('addressLocality')) document.getElementById('addressLocality').value = contacts?.locality_area || '';
            if (document.getElementById('addressLandmark')) document.getElementById('addressLandmark').value = contacts?.landmark || '';
            if (document.getElementById('addressCity')) document.getElementById('addressCity').value = contacts?.city || '';
            if (document.getElementById('addressState')) document.getElementById('addressState').value = contacts?.state || '';
            if (document.getElementById('addressPincode')) document.getElementById('addressPincode').value = contacts?.pin_code || '';
            if (document.getElementById('addressCountry')) document.getElementById('addressCountry').value = contacts?.country || 'India';

            updateBillingInheritSummary();

            // Populate Tax Tab
            syncLegalNameToTax();
            if (document.getElementById('pan')) document.getElementById('pan').value = taxSettings?.pan || '';
            if (document.getElementById('regNumber')) document.getElementById('regNumber').value = taxSettings?.business_registration_number || '';

            // Populate GST Registrations
            if (gstListContainer) {
                gstListContainer.innerHTML = '';
                const initialGstin = taxSettings?.gstin || '';
                const initialState = taxSettings?.gst_registration_state || contacts?.state || '';

                if (initialGstin || initialState) {
                    gstListContainer.appendChild(renderGstRow(initialGstin, initialState, 1));
                } else {
                    gstListContainer.appendChild(renderGstRow('', '', 1));
                }
            }

            if (typeof feather !== 'undefined') feather.replace();

            // Clean initial state (no dirty flags on load)
            window.clearDirty();
        } catch (err) {
            console.warn('[settings-company] Failed to load initial data:', err);
        }
    }

    await loadInitialData();

    // ── Select Initial Tab from URL ──────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab && VALID_TABS.includes(initialTab)) {
        setActiveTab(initialTab, false);
    } else {
        setActiveTab('business', false);
    }

    // ── Unsaved Changes Guard ────────────────────────────────────────────
    window.addEventListener('beforeunload', (e) => {
        if (window.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    if (typeof feather !== 'undefined') feather.replace();
});
