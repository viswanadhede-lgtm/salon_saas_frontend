// scripts/global-booking-modal.js — Unified, High-Performance Global Booking Modal
// Aligned with the two-modal workflow: Main Booking Modal + Add Services / Packages Picker.

import { supabase } from '../lib/supabase.js';

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ----------------------------------------------------------------
// Category / Service Visual Meta Mapper
// ----------------------------------------------------------------
function getCategoryMeta(categoryName, serviceName) {
    const text = `${categoryName || ''} ${serviceName || ''}`.toLowerCase();
    if (text.includes('hair') || text.includes('cut') || text.includes('trim') || text.includes('shave') || text.includes('beard')) {
        return { icon: 'scissors', theme: 'theme-purple' };
    }
    if (text.includes('color') || text.includes('colour') || text.includes('highlight') || text.includes('dye')) {
        return { icon: 'feather', theme: 'theme-rose' };
    }
    if (text.includes('spa') || text.includes('massage') || text.includes('relax') || text.includes('therapy')) {
        return { icon: 'droplet', theme: 'theme-teal' };
    }
    if (text.includes('facial') || text.includes('skin') || text.includes('glow') || text.includes('clean')) {
        return { icon: 'star', theme: 'theme-amber' };
    }
    if (text.includes('nail') || text.includes('manicure') || text.includes('pedicure')) {
        return { icon: 'disc', theme: 'theme-blue' };
    }
    if (text.includes('makeup') || text.includes('bridal') || text.includes('groom')) {
        return { icon: 'eye', theme: 'theme-rose' };
    }
    if (text.includes('package')) {
        return { icon: 'package', theme: 'theme-indigo' };
    }
    return { icon: 'tag', theme: 'theme-indigo' };
}

// ----------------------------------------------------------------
// GLOBAL STATE & DATA REGISTRIES
// ----------------------------------------------------------------
let liveCustomersDB       = [];
let liveServicesDB        = [];
let liveCategoriesDB      = [];
let liveStaffDB           = [];
let livePackagesDB        = [];
let livePackageServicesDB = [];

// Single Source of Truth for current booking items
let selectedBookingItems  = [];
// Working copy while Picker Modal is open
let pickerDraftItems      = [];

// Picker UI State
let activePickerTab       = 'services'; // 'services' | 'packages'
let activeCategoryFilter  = 'all';      // 'all' | category_id
let pickerSearchQuery     = '';
let isStaffSyncAll        = false;

let selectedCustomerId    = null;
let isGlobalBookingModalInitialized = false;

// Expose liveCustomersDB for external lookups
Object.defineProperty(window, 'liveCustomersDB', {
    get() { return liveCustomersDB; },
    configurable: true
});

// ----------------------------------------------------------------
// DOM INJECTION: Stylesheet + Main Modal + Picker Modal
// ----------------------------------------------------------------
export function ensureBookingModalHtml() {
    // 1. Inject Stylesheet if not already present
    if (!document.getElementById('globalBookingModalStyles')) {
        const linkEl = document.createElement('link');
        linkEl.id = 'globalBookingModalStyles';
        linkEl.rel = 'stylesheet';
        linkEl.href = 'styles/global-booking-modal.css';
        document.head.appendChild(linkEl);
    }

    // 2. Inject Main Modal (#bookingModalOverlay) if missing
    if (!document.getElementById('bookingModalOverlay')) {
        const modalHtml = `
        <div class="modal-overlay" id="bookingModalOverlay">
            <div class="modal-container" id="bookingModal">
                <!-- Header -->
                <div class="modal-header">
                    <div class="header-titles">
                        <h2>New Booking</h2>
                        <p class="subtitle">Create a new appointment for a customer.</p>
                    </div>
                    <button type="button" class="modal-close" id="closeBookingModal"><i data-feather="x"></i></button>
                </div>

                <!-- Body -->
                <div class="modal-body">
                    <!-- Top Grid: Customer Info (Left) + Date/Time (Right) -->
                    <div class="booking-top-grid">
                        <!-- Left Column: Customer details -->
                        <div class="booking-col">
                            <div class="form-group relative">
                                <label class="form-label" for="phoneSearch">Phone Number <span class="text-rose">*</span></label>
                                <input type="tel" id="phoneSearch" class="form-input" placeholder="Enter phone number" autocomplete="off">
                                <div class="search-suggestions" id="searchSuggestions"></div>
                            </div>

                            <div class="customer-badge-container" id="customerBadgeContainer" style="display:none; margin-bottom: 4px;">
                                <span class="badge-pill existing-badge" id="customerBadge">Existing Customer</span>
                            </div>

                            <div class="form-group span-full" id="newCustomerBadgeContainer" style="display:none; margin-bottom: 4px;">
                                <span class="badge-pill new-badge" id="newCustomerBadge">New Customer</span>
                            </div>

                            <div class="form-group" id="customerNameGroup">
                                <label class="form-label" for="customerName">Customer Name <span class="text-rose">*</span></label>
                                <input type="text" id="customerName" class="form-input" placeholder="Enter customer name">
                            </div>

                            <div class="form-group" id="customerEmailGroup">
                                <label class="form-label" for="customerEmail">Email <span id="emailOptionalLabel" class="text-muted">(Optional)</span></label>
                                <input type="email" id="customerEmail" class="form-input" placeholder="Enter email address">
                            </div>
                        </div>

                        <!-- Right Column: Description on top, Date/Time/Now on 3rd row -->
                        <div class="booking-col">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label class="form-label" for="bookingNotes">Booking Notes <span class="text-muted">(Optional)</span></label>
                                <textarea id="bookingNotes" class="form-input form-textarea" placeholder="Add optional notes for this booking..." style="height: 114px; min-height: 114px; resize: vertical;"></textarea>
                            </div>

                            <div class="booking-datetime-row">
                                <div class="form-group" style="flex: 1;">
                                    <label class="form-label" for="bookingDate">Date <span class="text-rose">*</span></label>
                                    <input type="date" id="bookingDate" class="form-input">
                                </div>
                                <div class="form-group" style="flex: 1.15;">
                                    <label class="form-label" for="bookingTime">Time <span class="text-rose">*</span></label>
                                    <div class="relative" style="display: flex; gap: 6px;">
                                        <input type="time" id="bookingTime" class="form-input" style="flex: 1;">
                                        <button type="button" class="btn btn-secondary" id="btnTimeNow" style="padding: 0 12px; height: 40px; font-size: 12px; font-weight: 600;">Now</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Services & Packages Section -->
                    <div class="booking-services-section">
                        <div class="booking-services-header">
                            <div class="services-header-left">
                                <span class="services-header-title">
                                    <i data-feather="scissors"></i>
                                    <span>Services &amp; Packages</span>
                                </span>
                                <span class="services-count-pill" id="mainServicesCountPill">0 Selected</span>
                            </div>
                            <label class="staff-sync-toggle">
                                <span>Apply same staff to all</span>
                                <input type="checkbox" id="mainStaffSyncToggle">
                            </label>
                        </div>

                        <!-- Selected Items Container -->
                        <div class="selected-services-list" id="mainSelectedServicesList">
                            <!-- Rendered dynamically -->
                        </div>

                        <!-- Bottom action bar: Total Duration/Amount chips on Left + Add button on Right -->
                        <div class="booking-services-bottom-bar">
                            <div class="services-summary-chips">
                                <div class="summary-chip-item">
                                    <i data-feather="clock" style="width:16px;height:16px;color:#64748b;"></i>
                                    <div>
                                        <div class="summary-chip-label">Total Duration</div>
                                        <div class="summary-chip-val" id="mainTotalDurationVal">0 min</div>
                                    </div>
                                </div>
                                <div class="summary-chip-divider"></div>
                                <div class="summary-chip-item">
                                    <i data-feather="dollar-sign" style="width:16px;height:16px;color:#16a34a;"></i>
                                    <div>
                                        <div class="summary-chip-label">Total Amount</div>
                                        <div class="summary-chip-val price" id="mainTotalAmountVal">₹0</div>
                                    </div>
                                </div>
                            </div>
                            <button type="button" class="btn-add-services-modal" id="btnOpenAddServicesModal">
                                <i data-feather="plus"></i>
                                <span>Add Services / Packages</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelBooking">Cancel</button>
                    <button type="button" class="btn btn-primary" id="btnConfirmBooking" disabled>Confirm Booking</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // 3. Inject Picker Modal (#addServicesModalOverlay) if missing
    if (!document.getElementById('addServicesModalOverlay')) {
        const pickerHtml = `
        <div class="modal-overlay" id="addServicesModalOverlay">
            <div class="modal-container" id="addServicesModal">
                <!-- Header -->
                <div class="picker-header">
                    <div class="picker-header-left">
                        <h3>Add Services / Packages</h3>
                        <p>Select one or more services or packages and assign staff.</p>
                    </div>
                    <div class="picker-header-right">
                        <div class="picker-modal-summary-card" id="pickerModalSummaryCard">
                            <div class="summary-chip-pill">
                                <div class="chip-icon-circle duration">
                                    <i data-feather="clock"></i>
                                </div>
                                <div class="chip-content">
                                    <span class="chip-title">Total Duration</span>
                                    <span class="chip-value" id="pickerTotalDurationVal">0 min</span>
                                </div>
                            </div>
                            <div class="summary-chip-sep"></div>
                            <div class="summary-chip-pill">
                                <div class="chip-icon-circle amount">
                                    <i data-feather="dollar-sign"></i>
                                </div>
                                <div class="chip-content">
                                    <span class="chip-title">Total Amount</span>
                                    <span class="chip-value price" id="pickerTotalAmountVal">₹0</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="modal-close" id="btnClosePickerModal"><i data-feather="x"></i></button>
                    </div>
                </div>

                <!-- Body (2 Columns) -->
                <div class="picker-body">
                    <!-- Left: Catalog Browser -->
                    <div class="picker-catalog-col">
                        <!-- Switcher Tabs -->
                        <div class="picker-tabs">
                            <button type="button" class="picker-tab-btn active" id="pickerTabServices">
                                <i data-feather="scissors"></i>
                                <span>Services</span>
                            </button>
                            <button type="button" class="picker-tab-btn" id="pickerTabPackages">
                                <i data-feather="package"></i>
                                <span>Packages</span>
                            </button>
                        </div>

                        <!-- Search -->
                        <div class="picker-search-wrapper">
                            <i data-feather="search"></i>
                            <input type="text" class="picker-search-input" id="pickerSearchInput" placeholder="Search services...">
                        </div>

                        <!-- Category Pills (shown only on Services tab) -->
                        <div class="picker-categories-pills" id="pickerCategoryPills">
                            <!-- Populated dynamically -->
                        </div>

                        <!-- Catalog Items List -->
                        <div class="picker-catalog-list" id="pickerCatalogList">
                            <!-- Populated dynamically -->
                        </div>
                    </div>

                    <!-- Right: Selected Items Review -->
                    <div class="picker-selected-col">
                        <!-- Header: Title -->
                        <div class="picker-selected-header">
                            <span class="picker-selected-title" id="pickerSelectedCountTitle">Selected Services (0)</span>
                        </div>

                        <!-- Sub-row: Clear All on LHS + Apply same staff to all on RHS -->
                        <div class="picker-selected-toggle-row" id="pickerSelectedToggleRow">
                            <button type="button" class="btn-clear-all" id="btnClearAllSelected">
                                <i data-feather="trash-2"></i>
                                <span>Clear All</span>
                            </button>
                            <label class="staff-sync-toggle">
                                <span>Apply same staff to all</span>
                                <input type="checkbox" id="pickerStaffSyncToggle">
                            </label>
                        </div>

                        <!-- Selected list -->
                        <div class="picker-selected-list" id="pickerSelectedList">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="picker-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelPickerModal">Cancel</button>
                    <button type="button" class="btn-add-to-booking" id="btnAddPickerToBooking">
                        <i data-feather="check"></i>
                        <span>Add to Booking</span>
                    </button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', pickerHtml);
    }

    // 4. Inject Double-booking Confirmation Overlay if missing
    if (!document.getElementById('staffOverrideConfirmOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay custom-logout-overlay" id="staffOverrideConfirmOverlay" style="z-index:10010;backdrop-filter:blur(8px);">
            <div class="logout-modal" style="background:#fff;border-radius:16px;padding:32px;width:420px;max-width:90vw;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);">
                <div style="width:64px;height:64px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                    <i data-feather="alert-triangle" style="color:#f59e0b;width:32px;height:32px;"></i>
                </div>
                <h2 style="font-size:1.35rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Override Booking?</h2>
                <p id="staffOverrideReason" style="color:#64748b;font-size:0.95rem;margin-bottom:24px;line-height:1.6;"></p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="btnCancelOverride" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-weight:600;cursor:pointer;font-size:0.95rem;">Go Back</button>
                    <button id="btnConfirmOverride" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-weight:600;cursor:pointer;font-size:0.95rem;">Yes, Confirm</button>
                </div>
            </div>
        </div>`);
    }

    if (window.feather && feather.replace) {
        feather.replace();
    }
}

// ----------------------------------------------------------------
// INITIALIZE GLOBAL BOOKING MODAL
// ----------------------------------------------------------------
export function initGlobalBookingModal() {
    if (isGlobalBookingModalInitialized && document.getElementById('bookingModalOverlay')) return;

    ensureBookingModalHtml();

    const bookingModalOverlay    = document.getElementById('bookingModalOverlay');
    const phoneSearch            = document.getElementById('phoneSearch');
    if (!bookingModalOverlay || !phoneSearch) return;

    isGlobalBookingModalInitialized = true;

    // Elements — Main Modal
    const btnNewBooking          = document.getElementById('btnNewBooking');
    const btnNewBookingPage      = document.getElementById('btnNewBookingPage');
    const closeBookingModal      = document.getElementById('closeBookingModal');
    const btnCancelBooking       = document.getElementById('btnCancelBooking');
    const btnConfirmBooking      = document.getElementById('btnConfirmBooking');
    const btnOpenAddServices     = document.getElementById('btnOpenAddServicesModal');
    const mainSelectedList       = document.getElementById('mainSelectedServicesList');
    const mainCountPill          = document.getElementById('mainServicesCountPill');
    const mainStaffSyncToggle    = document.getElementById('mainStaffSyncToggle');
    const mainTotalDurationVal   = document.getElementById('mainTotalDurationVal');
    const mainTotalAmountVal     = document.getElementById('mainTotalAmountVal');

    // Elements — Customer form
    const searchSuggestions         = document.getElementById('searchSuggestions');
    const newCustomerBadgeContainer = document.getElementById('newCustomerBadgeContainer');
    const customerBadgeContainer    = document.getElementById('customerBadgeContainer');
    const customerBadge             = document.getElementById('customerBadge');
    const customerName              = document.getElementById('customerName');
    const customerEmail             = document.getElementById('customerEmail');
    const emailOptionalLabel        = document.getElementById('emailOptionalLabel');
    const bookingDate               = document.getElementById('bookingDate');
    const bookingTime               = document.getElementById('bookingTime');
    const bookingNotes              = document.getElementById('bookingNotes');
    const btnTimeNow                = document.getElementById('btnTimeNow');

    // Elements — Picker Modal
    const pickerOverlay          = document.getElementById('addServicesModalOverlay');
    const btnClosePicker         = document.getElementById('btnClosePickerModal');
    const btnCancelPicker        = document.getElementById('btnCancelPickerModal');
    const btnAddPickerToBooking  = document.getElementById('btnAddPickerToBooking');
    const pickerTabServices      = document.getElementById('pickerTabServices');
    const pickerTabPackages      = document.getElementById('pickerTabPackages');
    const pickerSearchInput      = document.getElementById('pickerSearchInput');
    const pickerCategoryPills    = document.getElementById('pickerCategoryPills');
    const pickerCatalogList      = document.getElementById('pickerCatalogList');
    const pickerSelectedList     = document.getElementById('pickerSelectedList');
    const pickerCountTitle       = document.getElementById('pickerSelectedCountTitle');
    const btnClearAllSelected    = document.getElementById('btnClearAllSelected');
    const pickerStaffSyncToggle  = document.getElementById('pickerStaffSyncToggle');
    const pickerTotalDurationVal = document.getElementById('pickerTotalDurationVal');
    const pickerTotalAmountVal   = document.getElementById('pickerTotalAmountVal');

    // Elements — Override Modal
    const overrideOverlay        = document.getElementById('staffOverrideConfirmOverlay');
    const overrideReasonEl       = document.getElementById('staffOverrideReason');
    const btnCancelOverride      = document.getElementById('btnCancelOverride');

    // ── Helper: Customer State ──────────────────────────────────────────
    function setNewCustomerState() {
        if (!customerName || !customerEmail) return;
        customerName.value = '';
        customerEmail.value = '';
        customerName.readOnly = false;
        customerEmail.readOnly = false;
        customerName.placeholder = 'Enter customer name';
        customerEmail.placeholder = 'Enter email address';
        if (emailOptionalLabel) emailOptionalLabel.textContent = '(Optional)';
    }

    function setExistingCustomerState(name, email) {
        if (!customerName || !customerEmail) return;
        customerName.value = name;
        customerEmail.value = email || '';
        customerName.readOnly = false;
        customerEmail.readOnly = false;
        customerName.placeholder = 'Existing customer name';
        customerEmail.placeholder = 'Existing customer email';
        if (emailOptionalLabel) emailOptionalLabel.textContent = '';
    }

    // ── Helper: Duration & Currency Formatting ──────────────────────────
    function fmtPrice(amount) {
        const n = Number(amount) || 0;
        return `₹${n.toLocaleString('en-IN')}`;
    }

    function timeToMins(tStr) {
        if (!tStr) return 0;
        const [h, m] = tStr.split(':').map(Number);
        return (h * 60) + m;
    }

    function minsToTime24(mins) {
        let total = mins % (24 * 60);
        let h = Math.floor(total / 60);
        let m = total % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function minsToDisplay(mins) {
        const ampm = Math.floor(mins / 60) >= 12 ? 'PM' : 'AM';
        let h = Math.floor(mins / 60) % 12;
        if (h === 0) h = 12;
        return `${String(h).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
    }

    function showMsg(msg, isError = false) {
        if (typeof window.toast === 'function') {
            window.toast(msg);
        } else {
            console[isError ? 'error' : 'log']('[Booking Modal]', msg);
            if (isError) alert(msg);
        }
    }

    // ── Database Data Loader ────────────────────────────────────────────
    async function populateBookingDropdowns() {
        try {
            const company_id = getCompanyId();
            const branch_id  = getBranchId();

            const [svcRes, staffRes, custRes, pkgRes, pkgSvcRes, catRes] = await Promise.all([
                supabase.from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('customers').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.from('packages').select('*').eq('company_id', company_id).eq('branch_id', branch_id).eq('is_active', true).neq('status', 'deleted'),
                supabase.from('package_services').select('*'),
                supabase.from('service_categories').select('category_id, category_name').eq('company_id', company_id).eq('branch_id', branch_id).neq('status', 'deleted')
            ]);

            liveCategoriesDB      = catRes.data || [];
            liveStaffDB           = (staffRes.data || []).filter(s => s.status !== 'deleted');
            liveCustomersDB       = custRes.data || [];
            livePackagesDB        = pkgRes.data || [];
            livePackageServicesDB = pkgSvcRes.data || [];

            // Map category_name into services for filtering and badges
            const catMap = new Map(liveCategoriesDB.map(c => [c.category_id, c.category_name]));
            liveServicesDB = (svcRes.data || [])
                .filter(s => { const st = (s.status || '').trim().toLowerCase(); return st === 'active' || st === ''; })
                .map(s => ({
                    ...s,
                    category_name: catMap.get(s.category_id) || s.category_name || 'General'
                }));
            console.log('[Booking Modal] Loaded: ' + liveServicesDB.length + ' services, ' + liveStaffDB.length + ' staff, ' + liveCategoriesDB.length + ' categories');

        } catch (err) {
            console.error('[Booking Modal] Error loading dropdown data:', err);
        }
    }

    // ----------------------------------------------------------------
    // RENDER: Selected Items List (Shared by Main Modal & Picker Modal)
    // ----------------------------------------------------------------
    function renderSelectedList(containerEl, itemsArray, isPicker) {
        if (!containerEl) return;

        if (isPicker) {
            const toggleRow = document.getElementById('pickerSelectedToggleRow');
            if (toggleRow) toggleRow.style.display = itemsArray.length > 0 ? 'flex' : 'none';
        }

        if (itemsArray.length === 0) {
            containerEl.innerHTML = `
                <div class="selected-services-empty">
                    <p style="margin:0;font-weight:500;">No services selected yet.</p>
                    <p style="margin:4px 0 0 0;font-size:0.8rem;color:#94a3b8;">Click below to add services or packages to this appointment.</p>
                </div>
            `;
            return;
        }

        const staffOptionsHtml = (selectedStaffId) => {
            return `<option value="" disabled ${!selectedStaffId ? 'selected' : ''}>Select staff</option>` +
                liveStaffDB.map(st => `
                    <option value="${st.staff_id}" ${st.staff_id === selectedStaffId ? 'selected' : ''}>${st.staff_name || st.name}</option>
                `).join('');
        };

        const itemsCardsHtml = itemsArray.map((item, index) => {
            const visual = getCategoryMeta(item.categoryName, item.name);
            const durationDisplay = item.duration ? `${item.duration} min` : '—';
            const priceDisplay = fmtPrice(item.price);

            return `
            <div class="selected-item-card" data-uid="${item.uid}" data-index="${index}" draggable="true">
                <div class="item-card-left">
                    <span class="drag-handle" title="Drag to reorder">:::</span>
                    <div class="service-icon-tile ${visual.theme}">
                        <i data-feather="${visual.icon}"></i>
                    </div>
                    <div class="item-info">
                        <h4 class="item-name">${item.name}</h4>
                        <p class="item-meta">
                            <span>${durationDisplay}</span>
                            <span>|</span>
                            <span>${priceDisplay}</span>
                        </p>
                    </div>
                </div>

                <div class="item-card-right">
                    <div class="item-staff-group">
                        <span class="item-staff-label">Staff <span class="text-rose">*</span></span>
                        <select class="item-staff-select" data-uid="${item.uid}">
                            ${staffOptionsHtml(item.staffId)}
                        </select>
                    </div>
                    <button type="button" class="btn-item-delete" data-uid="${item.uid}" title="Remove item">
                        <i data-feather="trash-2"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');

        containerEl.innerHTML = itemsCardsHtml;

        if (window.feather && feather.replace) {
            feather.replace();
        }

        // Attach Staff Select Listeners
        containerEl.querySelectorAll('.item-staff-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const uid = sel.dataset.uid;
                const newStaffId = sel.value;
                const opt = sel.options[sel.selectedIndex];
                const newStaffName = opt ? opt.textContent : '';

                if (isStaffSyncAll) {
                    // Update all items in this collection
                    itemsArray.forEach(it => {
                        it.staffId = newStaffId;
                        it.staffName = newStaffName;
                    });
                    // Re-render so all dropdowns reflect the selected staff
                    renderSelectedList(containerEl, itemsArray, isPicker);
                } else {
                    const found = itemsArray.find(it => it.uid === uid);
                    if (found) {
                        found.staffId = newStaffId;
                        found.staffName = newStaffName;
                    }
                }
                validateForm();
            });
        });

        // Attach Delete Item Listeners
        containerEl.querySelectorAll('.btn-item-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                const idx = itemsArray.findIndex(it => it.uid === uid);
                if (idx !== -1) {
                    itemsArray.splice(idx, 1);
                    renderSelectedList(containerEl, itemsArray, isPicker);
                    updateTotals();
                    if (isPicker) {
                        renderCatalogItems();
                    }
                    validateForm();
                }
            });
        });

        // Attach Drag & Drop Reordering Listeners
        setupDragAndDrop(containerEl, itemsArray, isPicker);
    }

    // ── Drag & Drop Implementation ──────────────────────────────────────
    function setupDragAndDrop(containerEl, itemsArray, isPicker) {
        let draggedItemUid = null;

        containerEl.querySelectorAll('.selected-item-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                draggedItemUid = card.dataset.uid;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedItemUid);
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                containerEl.querySelectorAll('.selected-item-card').forEach(c => c.classList.remove('dragging'));
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetUid = card.dataset.uid;
                if (!draggedItemUid || draggedItemUid === targetUid) return;

                const srcIndex = itemsArray.findIndex(it => it.uid === draggedItemUid);
                const tgtIndex = itemsArray.findIndex(it => it.uid === targetUid);

                if (srcIndex !== -1 && tgtIndex !== -1) {
                    const [movedItem] = itemsArray.splice(srcIndex, 1);
                    itemsArray.splice(tgtIndex, 0, movedItem);
                    renderSelectedList(containerEl, itemsArray, isPicker);
                }
            });
        });
    }

    // ----------------------------------------------------------------
    // TOTALS & METRICS RECALCULATION
    // ----------------------------------------------------------------
    function updateTotals() {
        // 1. Main Modal Metrics
        const mainCount = selectedBookingItems.length;
        const mainDuration = selectedBookingItems.reduce((acc, it) => acc + (parseInt(it.duration) || 0), 0);
        const mainAmount = selectedBookingItems.reduce((acc, it) => acc + (parseFloat(it.price) || 0), 0);

        if (mainCountPill) mainCountPill.textContent = `${mainCount} Selected`;
        if (mainTotalDurationVal) mainTotalDurationVal.textContent = `${mainDuration} min`;
        if (mainTotalAmountVal) mainTotalAmountVal.textContent = fmtPrice(mainAmount);

        // 2. Picker Modal Metrics
        const pickerCount = pickerDraftItems.length;
        const pickerDuration = pickerDraftItems.reduce((acc, it) => acc + (parseInt(it.duration) || 0), 0);
        const pickerAmount = pickerDraftItems.reduce((acc, it) => acc + (parseFloat(it.price) || 0), 0);

        if (pickerCountTitle) pickerCountTitle.textContent = `Selected Services (${pickerCount})`;
        if (pickerTotalDurationVal) pickerTotalDurationVal.textContent = `${pickerDuration} min`;
        if (pickerTotalAmountVal) pickerTotalAmountVal.textContent = fmtPrice(pickerAmount);
    }

    // ----------------------------------------------------------------
    // RENDER: Catalog Items (Left Column of Picker)
    // ----------------------------------------------------------------
    function renderCatalogItems() {
        if (!pickerCatalogList) return;

        const isServicesTab = activePickerTab === 'services';
        const query = (pickerSearchQuery || '').toLowerCase().trim();

        if (isServicesTab) {
            // Filter services by category and search query
            const filteredServices = liveServicesDB.filter(svc => {
                const matchesCat = (activeCategoryFilter === 'all') || (svc.category_id === activeCategoryFilter);
                const matchesSearch = !query ||
                    (svc.service_name && svc.service_name.toLowerCase().includes(query)) ||
                    (svc.category_name && svc.category_name.toLowerCase().includes(query));
                return matchesCat && matchesSearch;
            });

            if (filteredServices.length === 0) {
                pickerCatalogList.innerHTML = `
                    <div style="padding: 2rem 1rem; text-align: center; color: #94a3b8; font-size: 0.9rem;">
                        No services found matching your criteria.
                    </div>
                `;
                return;
            }

            pickerCatalogList.innerHTML = filteredServices.map(svc => {
                const isAdded = pickerDraftItems.some(it => it.id === svc.service_id && it.type === 'service');
                const visual = getCategoryMeta(svc.category_name, svc.service_name);

                return `
                <div class="catalog-item-card">
                    <div class="catalog-item-left">
                        <div class="service-icon-tile ${visual.theme}">
                            <i data-feather="${visual.icon}"></i>
                        </div>
                        <div class="catalog-item-info">
                            <h4 class="catalog-item-name">${svc.service_name}</h4>
                            <p class="catalog-item-meta">${svc.duration ? `${svc.duration} min` : '0 min'} | ${fmtPrice(svc.price)}</p>
                        </div>
                    </div>
                    <div>
                        ${isAdded
                            ? `<button type="button" class="btn-catalog-action action-added" data-id="${svc.service_id}" data-type="service">
                                   <i data-feather="check"></i> <span>Added</span>
                               </button>`
                            : `<button type="button" class="btn-catalog-action action-add" data-id="${svc.service_id}" data-type="service">
                                   <i data-feather="plus"></i> <span>Add</span>
                               </button>`
                        }
                    </div>
                </div>
                `;
            }).join('');

        } else {
            // Packages Tab
            const filteredPackages = livePackagesDB.filter(pkg => {
                return !query || (pkg.package_name && pkg.package_name.toLowerCase().includes(query));
            });

            if (filteredPackages.length === 0) {
                pickerCatalogList.innerHTML = `
                    <div style="padding: 2rem 1rem; text-align: center; color: #94a3b8; font-size: 0.9rem;">
                        No packages available.
                    </div>
                `;
                return;
            }

            pickerCatalogList.innerHTML = filteredPackages.map(pkg => {
                const isAdded = pickerDraftItems.some(it => it.packageId === pkg.package_id || it.id === pkg.package_id);
                const incServices = livePackageServicesDB.filter(ps => ps.package_id === pkg.package_id);
                const incNames = incServices.map(ps => ps.service_name).join(', ') || 'Custom package services';

                return `
                <div class="catalog-item-card">
                    <div class="catalog-item-left">
                        <div class="service-icon-tile theme-indigo">
                            <i data-feather="package"></i>
                        </div>
                        <div class="catalog-item-info">
                            <h4 class="catalog-item-name">${pkg.package_name}</h4>
                            <p class="catalog-item-meta" title="${incNames}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">
                                ${incServices.length} Services | ${fmtPrice(pkg.final_price)}
                            </p>
                        </div>
                    </div>
                    <div>
                        ${isAdded
                            ? `<button type="button" class="btn-catalog-action action-added" data-id="${pkg.package_id}" data-type="package">
                                   <i data-feather="check"></i> <span>Added</span>
                               </button>`
                            : `<button type="button" class="btn-catalog-action action-add" data-id="${pkg.package_id}" data-type="package">
                                   <i data-feather="plus"></i> <span>Add</span>
                               </button>`
                        }
                    </div>
                </div>
                `;
            }).join('');
        }

        if (window.feather && feather.replace) {
            feather.replace();
        }

        // Attach Click Listeners to + Add / ✓ Added buttons
        pickerCatalogList.querySelectorAll('.btn-catalog-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const id   = btn.dataset.id;
                const type = btn.dataset.type;

                if (type === 'service') {
                    const svc = liveServicesDB.find(s => s.service_id === id);
                    if (!svc) return;

                    const isCurrentlyAdded = pickerDraftItems.some(it => it.id === id && it.type === 'service');
                    if (isCurrentlyAdded) {
                        // Remove from picker draft
                        pickerDraftItems = pickerDraftItems.filter(it => !(it.id === id && it.type === 'service'));
                    } else {
                        // Add to picker draft
                        const defaultStaff = isStaffSyncAll && pickerDraftItems.length > 0 && pickerDraftItems[0].staffId
                            ? pickerDraftItems[0].staffId
                            : '';
                        const defaultStaffName = isStaffSyncAll && pickerDraftItems.length > 0 && pickerDraftItems[0].staffName
                            ? pickerDraftItems[0].staffName
                            : '';

                        pickerDraftItems.push({
                            uid: 'item_' + generateUUID(),
                            type: 'service',
                            id: svc.service_id,
                            name: svc.service_name,
                            categoryName: svc.category_name,
                            duration: parseInt(svc.duration) || 0,
                            price: parseFloat(svc.price) || 0,
                            staffId: defaultStaff,
                            staffName: defaultStaffName,
                            packageId: null,
                            packageName: null
                        });
                    }
                } else if (type === 'package') {
                    const pkg = livePackagesDB.find(p => p.package_id === id);
                    if (!pkg) return;

                    const isCurrentlyAdded = pickerDraftItems.some(it => it.packageId === id || it.id === id);
                    if (isCurrentlyAdded) {
                        // Remove all package services
                        pickerDraftItems = pickerDraftItems.filter(it => it.packageId !== id && it.id !== id);
                    } else {
                        // Expand individual package services per Decision 1
                        const incServices = livePackageServicesDB.filter(ps => ps.package_id === id);
                        const defaultStaff = isStaffSyncAll && pickerDraftItems.length > 0 && pickerDraftItems[0].staffId
                            ? pickerDraftItems[0].staffId
                            : '';
                        const defaultStaffName = isStaffSyncAll && pickerDraftItems.length > 0 && pickerDraftItems[0].staffName
                            ? pickerDraftItems[0].staffName
                            : '';

                        if (incServices.length > 0) {
                            const perItemPrice = Math.round((Number(pkg.final_price) || 0) / incServices.length);
                            incServices.forEach((ps, idx) => {
                                const matchedSvc = liveServicesDB.find(s => s.service_id === ps.service_id);
                                pickerDraftItems.push({
                                    uid: 'item_' + generateUUID(),
                                    type: 'package_service',
                                    id: ps.service_id,
                                    name: `${ps.service_name} (${pkg.package_name})`,
                                    categoryName: matchedSvc?.category_name || 'Package',
                                    duration: matchedSvc ? (parseInt(matchedSvc.duration) || 0) : 30,
                                    // Allocate price so total equals pkg.final_price
                                    price: idx === incServices.length - 1
                                        ? ((Number(pkg.final_price) || 0) - perItemPrice * (incServices.length - 1))
                                        : perItemPrice,
                                    staffId: defaultStaff,
                                    staffName: defaultStaffName,
                                    packageId: pkg.package_id,
                                    packageName: pkg.package_name
                                });
                            });
                        } else {
                            pickerDraftItems.push({
                                uid: 'item_' + generateUUID(),
                                type: 'package',
                                id: pkg.package_id,
                                name: pkg.package_name,
                                categoryName: 'Package',
                                duration: 60,
                                price: parseFloat(pkg.final_price) || 0,
                                staffId: defaultStaff,
                                staffName: defaultStaffName,
                                packageId: pkg.package_id,
                                packageName: pkg.package_name
                            });
                        }
                    }
                }

                renderCatalogItems();
                renderSelectedList(pickerSelectedList, pickerDraftItems, true);
                updateTotals();
            });
        });
    }

    // ----------------------------------------------------------------
    // RENDER: Category Pills (Left Column of Picker)
    // ----------------------------------------------------------------
    function renderCategoryPills() {
        if (!pickerCategoryPills) return;

        if (activePickerTab === 'packages') {
            // Decision 1: Hide category filters in the Packages tab
            pickerCategoryPills.style.display = 'none';
            return;
        }

        pickerCategoryPills.style.display = 'flex';

        let html = `
            <button type="button" class="category-pill ${activeCategoryFilter === 'all' ? 'active' : ''}" data-cat-id="all">
                All
            </button>
        `;

        liveCategoriesDB.forEach(cat => {
            html += `
                <button type="button" class="category-pill ${activeCategoryFilter === cat.category_id ? 'active' : ''}" data-cat-id="${cat.category_id}">
                    ${cat.category_name}
                </button>
            `;
        });

        pickerCategoryPills.innerHTML = html;

        pickerCategoryPills.querySelectorAll('.category-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                activeCategoryFilter = pill.dataset.catId;
                renderCategoryPills();
                renderCatalogItems();
            });
        });
    }

    // ----------------------------------------------------------------
    // MODAL OPEN / CLOSE LIFECYCLE
    // ----------------------------------------------------------------
    async function openModal() {
        phoneSearch.value = '';
        setNewCustomerState();
        if (bookingDate) bookingDate.value = '';
        if (bookingTime) bookingTime.value = '';
        if (bookingNotes) bookingNotes.value = '';

        // Default date to today
        const today = new Date();
        const yyyy  = today.getFullYear();
        const mm    = String(today.getMonth() + 1).padStart(2, '0');
        const dd    = String(today.getDate()).padStart(2, '0');
        if (bookingDate) {
            bookingDate.setAttribute('min', `${yyyy}-${mm}-${dd}`);
            bookingDate.value = `${yyyy}-${mm}-${dd}`;
        }

        if (searchSuggestions) searchSuggestions.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        if (customerBadgeContainer)    customerBadgeContainer.style.display    = 'none';

        selectedCustomerId = null;
        selectedBookingItems = [];
        pickerDraftItems     = [];
        isStaffSyncAll       = false;

        if (mainStaffSyncToggle) mainStaffSyncToggle.checked = false;
        if (pickerStaffSyncToggle) pickerStaffSyncToggle.checked = false;

        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        validateForm();

        bookingModalOverlay.classList.add('active');
        setTimeout(() => phoneSearch.focus(), 100);

        await populateBookingDropdowns();

        // Refresh the main modal UI now that data has loaded
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        validateForm();
    }

    function closeModal() {
        bookingModalOverlay.classList.remove('active');
        pickerOverlay.classList.remove('active');
    }

    // ── Picker Modal Lifecycle ──────────────────────────────────────────
    function openPickerModal() {
        // Clone current confirmed items into picker working draft
        pickerDraftItems = JSON.parse(JSON.stringify(selectedBookingItems));

        activePickerTab      = 'services';
        activeCategoryFilter = 'all';
        pickerSearchQuery    = '';

        if (pickerSearchInput) {
            pickerSearchInput.value = '';
            pickerSearchInput.placeholder = 'Search services...';
        }

        if (pickerTabServices) pickerTabServices.classList.add('active');
        if (pickerTabPackages) pickerTabPackages.classList.remove('active');

        if (pickerStaffSyncToggle) {
            pickerStaffSyncToggle.checked = isStaffSyncAll;
        }

        renderCategoryPills();
        renderCatalogItems();
        renderSelectedList(pickerSelectedList, pickerDraftItems, true);
        updateTotals();

        pickerOverlay.classList.add('active');
    }

    function closePickerModal() {
        pickerOverlay.classList.remove('active');
    }

    // ----------------------------------------------------------------
    // EVENT BINDINGS
    // ----------------------------------------------------------------

    // ── Picker Tabs ─────────────────────────────────────────────────
    pickerTabServices?.addEventListener('click', () => {
        activePickerTab = 'services';
        pickerTabServices.classList.add('active');
        pickerTabPackages.classList.remove('active');
        if (pickerSearchInput) pickerSearchInput.placeholder = 'Search services...';
        renderCategoryPills();
        renderCatalogItems();
    });

    pickerTabPackages?.addEventListener('click', () => {
        activePickerTab = 'packages';
        pickerTabPackages.classList.add('active');
        pickerTabServices.classList.remove('active');
        if (pickerSearchInput) pickerSearchInput.placeholder = 'Search packages...';
        renderCategoryPills();
        renderCatalogItems();
    });

    pickerSearchInput?.addEventListener('input', (e) => {
        pickerSearchQuery = e.target.value;
        renderCatalogItems();
    });

    // ── Picker Actions ──────────────────────────────────────────────
    btnClearAllSelected?.addEventListener('click', () => {
        pickerDraftItems = [];
        renderSelectedList(pickerSelectedList, pickerDraftItems, true);
        renderCatalogItems();
        updateTotals();
    });

    pickerStaffSyncToggle?.addEventListener('change', (e) => {
        isStaffSyncAll = e.target.checked;
        if (mainStaffSyncToggle) mainStaffSyncToggle.checked = isStaffSyncAll;

        if (isStaffSyncAll && pickerDraftItems.length > 0) {
            const firstStaff = pickerDraftItems[0].staffId;
            const firstStaffName = pickerDraftItems[0].staffName;
            if (firstStaff) {
                pickerDraftItems.forEach(it => {
                    it.staffId = firstStaff;
                    it.staffName = firstStaffName;
                });
                renderSelectedList(pickerSelectedList, pickerDraftItems, true);
            }
        }
    });

    mainStaffSyncToggle?.addEventListener('change', (e) => {
        isStaffSyncAll = e.target.checked;
        if (pickerStaffSyncToggle) pickerStaffSyncToggle.checked = isStaffSyncAll;

        if (isStaffSyncAll && selectedBookingItems.length > 0) {
            const firstStaff = selectedBookingItems[0].staffId;
            const firstStaffName = selectedBookingItems[0].staffName;
            if (firstStaff) {
                selectedBookingItems.forEach(it => {
                    it.staffId = firstStaff;
                    it.staffName = firstStaffName;
                });
                renderSelectedList(mainSelectedList, selectedBookingItems, false);
                validateForm();
            }
        }
    });

    // ── Commit Picker Selection to Main Booking Modal ───────────────
    btnAddPickerToBooking?.addEventListener('click', () => {
        // Commit draft to single source of truth
        selectedBookingItems = JSON.parse(JSON.stringify(pickerDraftItems));
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        closePickerModal();
        validateForm();
    });

    btnOpenAddServices?.addEventListener('click', openPickerModal);
    btnClosePicker?.addEventListener('click', closePickerModal);
    btnCancelPicker?.addEventListener('click', closePickerModal);
    pickerOverlay?.addEventListener('click', (e) => {
        if (e.target === pickerOverlay) closePickerModal();
    });

    // ── Phone Search & Autocomplete ─────────────────────────────────
    phoneSearch.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (customerBadgeContainer)    customerBadgeContainer.style.display    = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        selectedCustomerId = null;

        if (val.length === 0) {
            searchSuggestions.style.display = 'none';
            setNewCustomerState();
            validateForm();
            return;
        }

        const matches = liveCustomersDB.filter(c =>
            String(c.phone || c.customer_phone || '').includes(val)
        );

        if (matches.length > 0) {
            searchSuggestions.innerHTML = '';
            matches.forEach(m => {
                const phoneStr = String(m.phone || m.customer_phone || '');
                const nameStr  = m.name || m.customer_name || '';
                const emailStr = m.email || m.customer_email || '';
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<span class="sugg-name">${nameStr}</span><span class="sugg-phone">${phoneStr}</span>`;
                div.addEventListener('click', () => {
                    phoneSearch.value  = phoneStr;
                    selectedCustomerId = m.id || m.customer_id;
                    setExistingCustomerState(nameStr, emailStr);
                    searchSuggestions.style.display = 'none';
                    if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
                    if (customerBadgeContainer) customerBadgeContainer.style.display = 'block';
                    if (customerBadge) customerBadge.textContent = 'Existing Customer';
                    validateForm();
                });
                searchSuggestions.appendChild(div);
            });
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.style.display = 'none';
            if (val.length >= 10) {
                if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'block';
                setNewCustomerState();
                selectedCustomerId = null;
            }
        }
        validateForm();
    });

    document.addEventListener('click', (e) => {
        if (phoneSearch && searchSuggestions &&
            !phoneSearch.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });

    // Date/Time input validation listeners
    [customerName, bookingDate, bookingTime].forEach(el => {
        if (el) {
            el.addEventListener('change', validateForm);
            el.addEventListener('input',  validateForm);
        }
    });

    // Time Now Button
    btnTimeNow?.addEventListener('click', () => {
        if (!bookingDate.value) {
            const t = new Date();
            bookingDate.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        }
        const now = new Date();
        bookingTime.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        validateForm();
    });

    // ── Form Validation ─────────────────────────────────────────────
    function validateForm() {
        const hasPhone      = phoneSearch.value.trim().length >= 10;
        const hasName       = selectedCustomerId || (customerName && customerName.value.trim().length > 0);
        const validCustomer = hasPhone && hasName;

        const hasItems      = selectedBookingItems.length > 0;
        const allStaffSet   = hasItems && selectedBookingItems.every(it => it.staffId && it.staffId.trim().length > 0);

        const hasDate       = bookingDate?.value !== '';
        const hasTime       = bookingTime?.value !== '';

        if (validCustomer && hasItems && allStaffSet && hasDate && hasTime) {
            btnConfirmBooking.disabled = false;
        } else {
            btnConfirmBooking.disabled = true;
        }

        // Block past times for today
        if (bookingDate?.value) {
            const t = new Date();
            const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
            if (bookingDate.value === todayStr) {
                const currentTime = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
                bookingTime.setAttribute('min', currentTime);
                if (bookingTime.value && bookingTime.value < currentTime) {
                    bookingTime.value = '';
                    btnConfirmBooking.disabled = true;
                }
            } else {
                bookingTime.removeAttribute('min');
            }
        }
    }

    // ----------------------------------------------------------------
    // PAYLOAD BUILDER & SUBMISSION
    // ----------------------------------------------------------------
    function buildPayloads(targetId, targetName, groupBookingId) {
        let currentStartMins = timeToMins(bookingTime.value);

        return selectedBookingItems.map((item) => {
            const itemDuration = parseInt(item.duration) || 0;
            const startTimeStr = minsToTime24(currentStartMins);
            const endTimeStr   = minsToTime24(currentStartMins + itemDuration);

            // Sequential service timing
            currentStartMins += itemDuration;

            return {
                company_id:      getCompanyId(),
                branch_id:       getBranchId(),
                booking_id:      groupBookingId,
                customer_id:     targetId || null,
                customer_name:   targetName,
                customer_mail:   customerEmail?.value.trim() || null,
                customer_phone:  phoneSearch.value.trim(),
                service_id:      item.id,
                service_name:    item.name,
                staff_id:        item.staffId,
                staff_name:      item.staffName,
                booking_date:    bookingDate.value,
                start_time:      startTimeStr,
                end_time:        endTimeStr,
                notes:           bookingNotes?.value.trim() || '',
                price:           Number(item.price) || 0,
                status:          'booked',
                booking_type:    'walk-in'
            };
        });
    }

    // ── Create bookings via atomic RPC ──────────────────────────────
    async function createBookings(payloads) {
        try {
            console.log('[createBookings] payloads:', payloads);
            const totalPrice = payloads.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

            // Build services array for RPC
            const services = payloads.map(p => ({
                service_id:   p.service_id,
                staff_id:     p.staff_id,
                service_name: p.service_name,
                staff_name:   p.staff_name,
                start_time:   p.start_time,
                end_time:     p.end_time || null,
                price:        Number(p.price) || 0,
                status:       p.status || 'booked'
            }));

            // Atomic RPC
            const { data, error } = await supabase.rpc('create_booking_atomic', {
                p_booking_id:      payloads[0].booking_id,
                p_company_id:      payloads[0].company_id,
                p_branch_id:       payloads[0].branch_id,
                p_customer_id:     payloads[0].customer_id || null,
                p_customer_name:   payloads[0].customer_name || 'Walk-in Customer',
                p_customer_email:  payloads[0].customer_mail || null,
                p_customer_phone:  payloads[0].customer_phone || '',
                p_is_new_customer: false,
                p_services:        services,
                p_booking_date:    payloads[0].booking_date,
                p_notes:           payloads[0].notes || null,
                p_booking_type:    payloads[0].booking_type || 'walk-in'
            });

            console.log('[createBookings] RPC result:', { data, error });

            if (!error) {
                const label = payloads.length > 1 ? `${payloads.length} bookings` : 'Booking';
                showMsg(`${label} created successfully!`);

                if (window.notifyEvent) {
                    try {
                        window.notifyEvent('bookings', 'evt_booking_created', {
                            title: 'New Booking Created',
                            message: `${payloads[0]?.customer_name || 'Customer'} booked ${payloads.map(p => p.service_name).filter(Boolean).join(', ') || 'service'}.`
                        });
                        const staffNames = [...new Set(payloads.map(p => p.staff_name).filter(Boolean))].join(', ');
                        if (staffNames) {
                            window.notifyEvent('staff', 'evt_staff_booking_assigned', {
                                title: 'Booking Assigned to Staff',
                                message: `Assigned to ${staffNames}.`
                            });
                        }
                        window.notifyEvent('payments', 'evt_payment_pending', {
                            title: 'Payment Pending',
                            message: `Pending payment of ₹${totalPrice} for ${payloads[0]?.customer_name || 'Customer'}.`
                        });
                    } catch (eventErr) {
                        console.error('[createBookings] notifyEvent error:', eventErr);
                    }
                }

                if (window.notifyCustomer) {
                    try {
                        window.notifyCustomer('booking', 'booking_confirm', {
                            name: payloads[0]?.customer_name || customerName?.value?.trim() || '',
                            phone: payloads[0]?.customer_phone || phoneSearch?.value?.trim() || '',
                            email: payloads[0]?.customer_mail || customerEmail?.value?.trim() || ''
                        }, {
                            bookingId: payloads[0]?.booking_id,
                            date: payloads[0]?.booking_date,
                            time: payloads[0]?.booking_time,
                            services: payloads.map(p => p.service_name).filter(Boolean),
                            totalPrice
                        });
                    } catch (custNotifyErr) {
                        console.error('[createBookings] notifyCustomer error:', custNotifyErr);
                    }
                }

                overrideOverlay?.classList.remove('active');
                closeModal();

                // Refresh bookings table if available
                try {
                    if (typeof window.fetchBookings === 'function') await window.fetchBookings();
                } catch (refreshErr) {
                    console.warn('[Booking Modal] fetchBookings refresh error:', refreshErr);
                }

                // Refresh dashboard if available
                try {
                    if (typeof window.refreshAllData === 'function') {
                        window.refreshAllData(getBranchId());
                    } else {
                        if (typeof window.fetchAndRenderDashboardKPIs === 'function') {
                            window.fetchAndRenderDashboardKPIs(getBranchId());
                        }
                        if (typeof window.fetchAndRenderAppointments === 'function') {
                            window.fetchAndRenderAppointments(getBranchId());
                        }
                    }
                } catch (dashErr) {
                    console.warn('[Booking Modal] Dashboard refresh error:', dashErr);
                }
            } else {
                showMsg('Error saving booking: ' + error.message, true);
            }
        } catch (err) {
            console.error('[createBookings] exception:', err);
            showMsg('Network error creating booking: ' + err.message, true);
        }
    }

    // ── Confirm Booking Button Handler ──────────────────────────────
    btnConfirmBooking.addEventListener('click', async () => {
        let targetName = customerName?.value.trim();
        let targetId   = selectedCustomerId;
        const groupBookingId = generateUUID();

        const originalText = btnConfirmBooking.textContent;
        btnConfirmBooking.textContent = 'Saving...';
        btnConfirmBooking.disabled    = true;

        // Auto-create new customer if needed
        if (!targetId && phoneSearch.value.trim().length >= 10) {
            const typedPhone = phoneSearch.value.trim();
            const digitsOnly = typedPhone.replace(/\D/g, '');

            const existingCust = liveCustomersDB.find(c => {
                const cPhone = String(c.customer_phone || c.phone || '').replace(/\D/g, '');
                return cPhone === digitsOnly || cPhone === typedPhone;
            });

            if (existingCust) {
                showMsg('Customer with this phone number already exists! Please select them from the suggestions.', true);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }

            try {
                const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                    company_id:     getCompanyId(),
                    branch_id:      getBranchId(),
                    customer_name:  targetName || 'Unknown Customer',
                    customer_phone: typedPhone,
                    customer_email: customerEmail?.value.trim() || '',
                    status:         'active'
                }).select();

                if (custErr) throw custErr;
                if (newCust && newCust.length > 0) {
                    targetId = newCust[0].customer_id;
                    if (window.liveCustomersDB) window.liveCustomersDB.push(newCust[0]);
                    if (window.notifyEvent) {
                        window.notifyEvent('customers', 'evt_customer_added', {
                            title: 'New Customer Added',
                            message: `${targetName || typedPhone} was added.`
                        });
                    }
                }
            } catch (err) {
                console.error('[Booking] Error creating customer:', err);
                showMsg('Failed to create customer record: ' + err.message, true);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }
        }

        const payloads = buildPayloads(targetId, targetName, groupBookingId);

        try {
            // Staff overlap check against first service row
            const first = payloads[0];
            const { data: existing, error: bErr } = await supabase
                .from('bookings')
                .select('start_time, duration, status')
                .eq('staff_id', first.staff_id)
                .eq('booking_date', first.booking_date);

            let isAvailable   = true;
            let overlapReason = '';

            if (!bErr && existing && existing.length > 0) {
                const newStart = timeToMins(first.start_time);
                const newEnd   = newStart + (parseInt(first.duration) || 0);
                for (const eb of existing) {
                    const ebStart = timeToMins(eb.start_time);
                    const ebEnd   = ebStart + (eb.duration || 0);
                    if (newStart < ebEnd && newEnd > ebStart) {
                        isAvailable   = false;
                        overlapReason = `Staff is already booked from ${minsToDisplay(ebStart)} to ${minsToDisplay(ebEnd)}.`;
                        break;
                    }
                }
            }

            if (isAvailable) {
                await createBookings(payloads);
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
                return;
            }

            // Show override modal
            bookingModalOverlay.classList.remove('active');
            if (overrideReasonEl) {
                overrideReasonEl.textContent = overlapReason + ' Do you want to override and double-book?';
            }
            overrideOverlay?.classList.add('active');
            if (window.feather) feather.replace();

            const oldBtn       = document.getElementById('btnConfirmOverride');
            const freshConfirm = oldBtn?.cloneNode(true);
            oldBtn?.parentNode.replaceChild(freshConfirm, oldBtn);

            freshConfirm?.addEventListener('click', async () => {
                overrideOverlay.classList.remove('active');
                freshConfirm.textContent = 'Saving...';
                freshConfirm.disabled    = true;
                await createBookings(payloads);
                freshConfirm.textContent   = 'Yes, Confirm';
                freshConfirm.disabled      = false;
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
            });

        } catch (err) {
            console.error('[Booking] Submit error:', err);
            showMsg('Booking failed: ' + (err.message || 'Unknown error'), true);
            btnConfirmBooking.textContent = originalText;
            btnConfirmBooking.disabled    = false;
        }
    });

    // ── External API Hook for Pre-filling (Rebook feature) ──────────
    window.openAndPrefillBooking = async function({ customerId, name, phone, email, serviceIds = [], staffIds = [] }) {
        await openModal();

        if (customerId) {
            window.setGlobalBookingCustomer(customerId, name, phone, email);
        }

        if (serviceIds.length > 0) {
            selectedBookingItems = [];
            serviceIds.forEach((sId, idx) => {
                const svc = liveServicesDB.find(s => s.service_id === sId);
                if (svc) {
                    const stfId = staffIds[idx] || staffIds[0] || '';
                    const matchedStaff = liveStaffDB.find(st => st.staff_id === stfId);
                    selectedBookingItems.push({
                        uid: 'item_' + generateUUID(),
                        type: 'service',
                        id: svc.service_id,
                        name: svc.service_name,
                        categoryName: svc.category_name,
                        duration: parseInt(svc.duration) || 0,
                        price: parseFloat(svc.price) || 0,
                        staffId: stfId,
                        staffName: matchedStaff ? (matchedStaff.staff_name || matchedStaff.name) : '',
                        packageId: null,
                        packageName: null
                    });
                }
            });
            renderSelectedList(mainSelectedList, selectedBookingItems, false);
            updateTotals();
        }
        validateForm();
    };

    window.setGlobalBookingCustomer = function(customerId, name, phone, email) {
        if (!customerId) return;
        selectedCustomerId = customerId;
        phoneSearch.value = phone || '';
        setExistingCustomerState(name || '', email || '');

        if (searchSuggestions) searchSuggestions.style.display = 'none';
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        if (customerBadgeContainer) {
            customerBadgeContainer.style.display = 'block';
            if (customerBadge) customerBadge.textContent = 'Existing Customer';
        }
        validateForm();
    };

    // ── Triggers ────────────────────────────────────────────────────
    window.openGlobalBookingModal = openModal;

    btnNewBooking?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    btnNewBookingPage?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    closeBookingModal?.addEventListener('click', closeModal);
    btnCancelBooking?.addEventListener('click', closeModal);
    bookingModalOverlay.addEventListener('click', (e) => {
        if (e.target === bookingModalOverlay) closeModal();
    });

    btnCancelOverride?.addEventListener('click', () => {
        overrideOverlay.classList.remove('active');
        bookingModalOverlay.classList.add('active');
    });
    overrideOverlay?.addEventListener('click', (e) => {
        if (e.target === overrideOverlay) {
            overrideOverlay.classList.remove('active');
            bookingModalOverlay.classList.add('active');
        }
    });

    // App shell header binding
    document.addEventListener('app-shell:ready', () => {
        const headerBtn = document.getElementById('btnNewBooking');
        if (headerBtn && !headerBtn.dataset.bookingModalBound) {
            headerBtn.dataset.bookingModalBound = '1';
            headerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal();
            });
        }
    });

    // Branch changed event
    window.addEventListener('branch:changed', async () => {
        if (bookingModalOverlay.classList.contains('active')) {
            await populateBookingDropdowns();
        } else {
            liveCustomersDB       = [];
            liveServicesDB        = [];
            liveCategoriesDB      = [];
            liveStaffDB           = [];
            livePackagesDB        = [];
            livePackageServicesDB = [];
        }
    });

    // Handle auto-open query param (?action=new)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'new') {
            openModal();
            const url = new URL(window.location.href);
            url.searchParams.delete('action');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
        }
    } catch { /* ignore */ }
}
