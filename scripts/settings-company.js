/**
 * Controller script for settings-company.html
 * Handles:
 * 1. Tab navigation & URL deep linking (?tab=business|contact|tax)
 * 2. Multi-GST registration dynamic add / remove (JSONB array structure)
 * 3. Subscription/Billing Contact "Same as Primary" toggle & inheritance
 * 4. Automatic synchronization of Legal Business Name to Tax tab
 * 5. Supabase Storage upload for Company Logo & Cover Banner
 * 6. Consolidated read/write with shared.company_settings via save_company_settings RPC
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
    let currentLogoUrl = null;
    let currentCoverUrl = null;
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

    // ── Company ID Resolver ──────────────────────────────────────────────
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company?.company_id) return ctx.company.company_id;
            if (ctx.company?.id) return ctx.company.id;
        } catch {}
        return localStorage.getItem('company_id') || null;
    }

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
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">GST Registration State <span class="required">*</span></label>
                    <select class="form-select gst-state-select">
                        <option value="">Select State</option>
                        ${INDIAN_STATES.map(s => `<option value="${s}" ${s.toLowerCase() === state.toLowerCase() ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
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

    // ── Image Management & Previews ──────────────────────────────────────
    window.removeLogo = function () {
        currentLogoUrl = null;
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
        currentCoverUrl = null;
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
            if (file.size > 2 * 1024 * 1024) {
                window.showToast('Logo file size exceeds 2 MB limit.', 'error');
                e.target.value = '';
                return;
            }
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
            if (file.size > 5 * 1024 * 1024) {
                window.showToast('Cover image file size exceeds 5 MB limit.', 'error');
                e.target.value = '';
                return;
            }
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

    // ── Upload Image Helper to Supabase Storage ──────────────────────────
    async function uploadStorageFile(inputElementId, bucketName, filePrefix, companyId) {
        const input = document.getElementById(inputElementId);
        const file = input?.files?.[0];
        if (!file) return null;

        const ext = file.name.split('.').pop() || 'png';
        const storagePath = `${companyId}/${filePrefix}_${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, file, { upsert: true });

        if (uploadErr) {
            console.error(`[settings-company] Storage upload error on ${bucketName}:`, uploadErr);
            throw new Error(`Failed to upload ${filePrefix}: ${uploadErr.message || 'Storage error'}`);
        }

        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
        return urlData?.publicUrl || null;
    }

    // ── Save Changes Handler (Routes through save_company_settings RPC) ───
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const companyId = getCompanyId();
            if (!companyId) {
                window.showToast('Error: No active company context found.', 'error');
                return;
            }

            saveBtn.disabled = true;
            const originalHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px;"></span>
                Saving ${activeTab.toUpperCase()}...
            `;

            try {
                let sectionPayload = {};

                // -------------------------------------------------------------
                // 1. BUSINESS TAB PAYLOAD
                // -------------------------------------------------------------
                if (activeTab === 'business') {
                    const legalName = document.getElementById('companyName')?.value.trim();
                    const dispName = document.getElementById('displayName')?.value.trim();
                    const category = document.getElementById('businessCategory')?.value;

                    if (!legalName) {
                        throw new Error('Legal Business Name is required.');
                    }
                    if (!dispName) {
                        throw new Error('Display / Brand Name is required.');
                    }

                    // Upload new logo if chosen
                    const newLogoUrl = await uploadStorageFile('logoFileInput', 'company-logos', 'logo', companyId);
                    if (newLogoUrl) currentLogoUrl = newLogoUrl;

                    // Upload new cover image if chosen
                    const newCoverUrl = await uploadStorageFile('coverFileInput', 'company-cover-images', 'cover', companyId);
                    if (newCoverUrl) currentCoverUrl = newCoverUrl;

                    sectionPayload = {
                        legal_business_name:  legalName,
                        display_name:         dispName,
                        business_category:    category || 'salon_spa',
                        business_description: document.getElementById('businessDescription')?.value.trim() || null,
                        website:              document.getElementById('companyWebsite')?.value.trim() || null,
                        instagram_url:        document.getElementById('instagramUrl')?.value.trim() || null,
                        facebook_url:         document.getElementById('facebookUrl')?.value.trim() || null,
                        logo_url:             currentLogoUrl || null,
                        cover_image_url:      currentCoverUrl || null
                    };
                }

                // -------------------------------------------------------------
                // 2. CONTACT TAB PAYLOAD
                // -------------------------------------------------------------
                else if (activeTab === 'contact') {
                    const primaryName = document.getElementById('primaryContactName')?.value.trim();
                    const primaryEmail = document.getElementById('contactEmail')?.value.trim();
                    const primaryPhone = document.getElementById('contactPhone')?.value.trim();
                    const addrLine1 = document.getElementById('addressLine1')?.value.trim();
                    const addrCity = document.getElementById('addressCity')?.value.trim();
                    const addrState = document.getElementById('addressState')?.value.trim();
                    const addrPincode = document.getElementById('addressPincode')?.value.trim();
                    const addrCountry = document.getElementById('addressCountry')?.value.trim() || 'India';

                    if (!primaryName) throw new Error('Primary Contact Person Name is required.');
                    if (!primaryEmail) throw new Error('Primary Email Address is required.');
                    if (!primaryPhone) throw new Error('Primary Phone Number is required.');
                    if (!addrLine1) throw new Error('Address Line 1 is required.');
                    if (!addrCity) throw new Error('City is required.');
                    if (!addrState) throw new Error('State is required.');
                    if (!addrPincode) throw new Error('PIN Code is required.');

                    const isSameAsPrimary = sameAsPrimaryCheckbox ? sameAsPrimaryCheckbox.checked : true;
                    let billingName = null;
                    let billingEmail = null;
                    let billingPhone = null;

                    if (!isSameAsPrimary) {
                        billingName = document.getElementById('billingContactName')?.value.trim();
                        billingEmail = document.getElementById('billingEmail')?.value.trim();
                        billingPhone = document.getElementById('billingPhone')?.value.trim();

                        if (!billingName) throw new Error('Billing Contact Name is required when separate from primary.');
                        if (!billingEmail) throw new Error('Billing Email Address is required when separate from primary.');
                        if (!billingPhone) throw new Error('Billing Phone Number is required when separate from primary.');
                    }

                    sectionPayload = {
                        primary_contact_name:    primaryName,
                        designation:             document.getElementById('contactDesignation')?.value.trim() || null,
                        primary_email:           primaryEmail,
                        primary_phone:           primaryPhone,
                        alternate_phone:         document.getElementById('contactAlternatePhone')?.value.trim() || null,
                        same_as_primary_contact: isSameAsPrimary,
                        billing_contact_name:    billingName,
                        billing_email:           billingEmail,
                        billing_phone:           billingPhone,
                        address_line_1:          addrLine1,
                        address_line_2:          document.getElementById('addressLine2')?.value.trim() || null,
                        locality_area:           document.getElementById('addressLocality')?.value.trim() || null,
                        landmark:                document.getElementById('addressLandmark')?.value.trim() || null,
                        city:                    addrCity,
                        state:                   addrState,
                        pin_code:                addrPincode,
                        country:                 addrCountry
                    };
                }

                // -------------------------------------------------------------
                // 3. TAX TAB PAYLOAD
                // -------------------------------------------------------------
                else if (activeTab === 'tax') {
                    const panValue = document.getElementById('pan')?.value.trim().toUpperCase() || null;
                    if (panValue && panValue.length !== 10) {
                        throw new Error('PAN must be exactly 10 alphanumeric characters.');
                    }

                    // Gather multiple GST registrations
                    const gstList = [];
                    const rows = gstListContainer ? gstListContainer.querySelectorAll('.gst-card-row') : [];
                    rows.forEach(r => {
                        const gstin = r.querySelector('.gst-number-input')?.value.trim().toUpperCase() || '';
                        const state = r.querySelector('.gst-state-select')?.value.trim() || '';
                        if (gstin || state) {
                            if (gstin && gstin.length !== 15) {
                                throw new Error(`GSTIN "${gstin}" must be exactly 15 characters.`);
                            }
                            gstList.push({ gstin, state });
                        }
                    });

                    sectionPayload = {
                        pan:                          panValue,
                        business_registration_number: document.getElementById('regNumber')?.value.trim() || null,
                        registration_type:            document.getElementById('registrationType')?.value || null,
                        gst_registrations:            gstList
                    };
                }

                // Execute Unified Atomic RPC
                const { data: rpcResult, error: rpcError } = await supabase.rpc('save_company_settings', {
                    p_company_id: companyId,
                    p_section:    activeTab,
                    p_data:       sectionPayload
                });

                if (rpcError) {
                    console.error('[settings-company] RPC save_company_settings error:', rpcError);
                    throw new Error(rpcError.message || 'Failed to save company settings via RPC.');
                }

                // Synchronize cached appContext in localStorage
                try {
                    const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
                    if (ctx.company) {
                        if (sectionPayload.legal_business_name) ctx.company.company_name = sectionPayload.legal_business_name;
                        if (sectionPayload.display_name) ctx.company.display_name = sectionPayload.display_name;
                        if (sectionPayload.logo_url) ctx.company.logo_url = sectionPayload.logo_url;
                        localStorage.setItem('appContext', JSON.stringify(ctx));
                    }
                } catch (e) {}

                window.clearDirty();
                const tabTitle = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
                window.showToast(`${tabTitle} settings saved successfully!`, 'success');

                // Re-sync legal name across tabs
                syncLegalNameToTax();

            } catch (err) {
                console.error('[settings-company] Save failed:', err);
                window.showToast(err.message || 'Error saving settings.', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalHtml;
                if (typeof feather !== 'undefined') feather.replace();
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            window.clearDirty();
            window.showToast('Changes discarded', 'success');
            await loadInitialData();
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

    // ── Load Company Data Exclusively from shared.company_settings ──────
    async function loadInitialData() {
        const companyId = getCompanyId();
        if (!companyId) return;

        try {
            // 1. Single read from consolidated shared.company_settings
            const { data: compSettings, error: settErr } = await supabase.schema('shared')
                .from('company_settings')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            if (settErr) {
                console.warn('[settings-company] Error reading shared.company_settings:', settErr);
            }

            // 2. Fallback to shared.companies for default tenant names if row is new
            const { data: comp } = await supabase.schema('shared')
                .from('companies')
                .select('*')
                .eq('company_id', companyId)
                .maybeSingle();

            // -----------------------------------------------------------------
            // A. Populate Business Tab
            // -----------------------------------------------------------------
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

            // Logos and Banner
            currentLogoUrl = compSettings?.logo_url || comp?.logo_url || null;
            const logoBox = document.getElementById('logoPreviewBox');
            const btnRemoveLogo = document.getElementById('btnRemoveLogo');
            if (logoBox) {
                if (currentLogoUrl) {
                    logoBox.innerHTML = `<img src="${currentLogoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
                    if (btnRemoveLogo) btnRemoveLogo.style.display = 'inline-flex';
                } else {
                    logoBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
                    if (btnRemoveLogo) btnRemoveLogo.style.display = 'none';
                }
            }

            currentCoverUrl = compSettings?.cover_image_url || comp?.cover_image_url || null;
            const coverBox = document.getElementById('coverPreviewBox');
            const btnRemoveCover = document.getElementById('btnRemoveCover');
            if (coverBox) {
                if (currentCoverUrl) {
                    coverBox.innerHTML = `<img src="${currentCoverUrl}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">`;
                    if (btnRemoveCover) btnRemoveCover.style.display = 'inline-flex';
                } else {
                    coverBox.innerHTML = `<i data-feather="image" class="logo-placeholder-icon"></i>`;
                    if (btnRemoveCover) btnRemoveCover.style.display = 'none';
                }
            }

            // -----------------------------------------------------------------
            // B. Populate Contact Tab
            // -----------------------------------------------------------------
            const contactName = compSettings?.primary_contact_name || compSettings?.contact_person_name || comp?.owner_name || '';
            const contactEmail = compSettings?.primary_email || compSettings?.email || comp?.owner_email || '';
            const contactPhone = compSettings?.primary_phone || compSettings?.phone || comp?.owner_phone || '';

            if (document.getElementById('primaryContactName')) document.getElementById('primaryContactName').value = contactName;
            if (document.getElementById('contactDesignation')) document.getElementById('contactDesignation').value = compSettings?.designation || '';
            if (document.getElementById('contactEmail')) document.getElementById('contactEmail').value = contactEmail;
            if (document.getElementById('contactPhone')) document.getElementById('contactPhone').value = contactPhone;
            if (document.getElementById('contactAlternatePhone')) document.getElementById('contactAlternatePhone').value = compSettings?.alternate_phone || '';

            // Billing Contact
            const isSameAsPrimary = compSettings?.same_as_primary_contact !== false;
            if (sameAsPrimaryCheckbox) {
                sameAsPrimaryCheckbox.checked = isSameAsPrimary;
                toggleBillingContactMode();
            }
            if (document.getElementById('billingContactName')) {
                document.getElementById('billingContactName').value = compSettings?.billing_contact_name || '';
            }
            if (document.getElementById('billingEmail')) {
                document.getElementById('billingEmail').value = compSettings?.billing_email || '';
            }
            if (document.getElementById('billingPhone')) {
                document.getElementById('billingPhone').value = compSettings?.billing_phone || '';
            }

            // Registered Business Address
            if (document.getElementById('addressLine1')) document.getElementById('addressLine1').value = compSettings?.address_line_1 || '';
            if (document.getElementById('addressLine2')) document.getElementById('addressLine2').value = compSettings?.address_line_2 || '';
            if (document.getElementById('addressLocality')) document.getElementById('addressLocality').value = compSettings?.locality_area || '';
            if (document.getElementById('addressLandmark')) document.getElementById('addressLandmark').value = compSettings?.landmark || '';
            if (document.getElementById('addressCity')) document.getElementById('addressCity').value = compSettings?.city || '';
            if (document.getElementById('addressState')) document.getElementById('addressState').value = compSettings?.state || '';
            if (document.getElementById('addressPincode')) document.getElementById('addressPincode').value = compSettings?.pin_code || '';
            if (document.getElementById('addressCountry')) document.getElementById('addressCountry').value = compSettings?.country || 'India';

            updateBillingInheritSummary();

            // -----------------------------------------------------------------
            // C. Populate Tax Tab
            // -----------------------------------------------------------------
            syncLegalNameToTax();
            if (document.getElementById('pan')) document.getElementById('pan').value = compSettings?.pan || '';
            if (document.getElementById('regNumber')) document.getElementById('regNumber').value = compSettings?.business_registration_number || '';
            if (document.getElementById('registrationType')) document.getElementById('registrationType').value = compSettings?.registration_type || '';

            // Populate Multiple GST Registrations from JSONB array
            if (gstListContainer) {
                gstListContainer.innerHTML = '';
                const gstArray = Array.isArray(compSettings?.gst_registrations) ? compSettings.gst_registrations : [];

                if (gstArray.length > 0) {
                    gstArray.forEach((gstItem, idx) => {
                        gstListContainer.appendChild(renderGstRow(gstItem.gstin || '', gstItem.state || '', idx + 1));
                    });
                } else {
                    // Default to 1 clean entry row
                    gstListContainer.appendChild(renderGstRow('', '', 1));
                }
            }

            if (typeof feather !== 'undefined') feather.replace();

            // Clean initial state (no dirty flags on initial load)
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
