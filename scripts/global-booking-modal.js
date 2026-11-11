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
let activePickerTab       = 'services'; // 'services' | 'packages' (LHS catalog)
let activePickerRhsTab    = 'services'; // 'services' | 'packages' (RHS selected items)
let activeMainRhsTab      = 'services'; // 'services' | 'packages' (Main Modal RHS selected items)
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
        linkEl.href = 'styles/global-booking-modal.css?v=2.2.2';
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
                        <span id="editBookingIdBadge" style="display:none;font-family:monospace;font-size:0.72rem;font-weight:700;background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:6px;margin-left:8px;vertical-align:middle;"></span>
                        <p class="subtitle">Create a new appointment for a customer.</p>
                    </div>
                    <div class="booking-header-right">
                        <!-- Summary Capsule Banner -->
                        <div class="booking-summary-banner">
                            <div class="booking-banner-metric">
                                <i data-feather="clock" style="width:13px;height:13px;"></i>
                                <span class="booking-banner-label">TOTAL DURATION</span>
                                <strong id="mainTotalDurationVal">0 min</strong>
                            </div>
                            <div class="booking-banner-sep"></div>
                            <div class="booking-banner-metric price">
                                <i data-feather="dollar-sign" style="width:13px;height:13px;color:#10b981;"></i>
                                <span class="booking-banner-label">TOTAL AMOUNT</span>
                                <strong id="mainTotalAmountVal">₹0</strong>
                            </div>
                        </div>
                        <button type="button" class="modal-close" id="closeBookingModal"><i data-feather="x"></i></button>
                    </div>
                </div>

                <!-- Body: Side-by-side LHS (40%) + RHS (60%) -->
                <div class="modal-body">

                    <!-- LEFT PANEL: Customer & Schedule -->
                    <div class="booking-left-panel">
                        <!-- ── CUSTOMER SECTION ── -->
                        <div class="lhs-section-group">
                            <div class="lhs-sub-label">
                                <i data-feather="user" style="width:11px;height:11px;"></i>
                                Customer
                            </div>

                            <div class="form-group relative">
                                <div class="form-label-row">
                                    <label class="form-label" for="phoneSearch">Phone Number <span class="text-rose">*</span></label>
                                    <div class="customer-badge-inline" id="customerBadgeContainer" style="display:none;">
                                        <span class="badge-pill existing-badge" id="customerBadge">Existing Customer</span>
                                    </div>
                                    <div class="customer-badge-inline" id="newCustomerBadgeContainer" style="display:none;">
                                        <span class="badge-pill new-badge" id="newCustomerBadge">New Customer</span>
                                    </div>
                                </div>
                                <input type="tel" id="phoneSearch" class="form-input" placeholder="Enter phone number" autocomplete="off">
                                <div class="search-suggestions" id="searchSuggestions"></div>
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

                        <!-- ── SCHEDULE SECTION ── -->
                        <div class="lhs-section-group">
                            <div class="lhs-sub-label">
                                <i data-feather="calendar" style="width:11px;height:11px;"></i>
                                Schedule
                            </div>

                            <div class="booking-datetime-row">
                                <div class="form-group" style="flex: 1;">
                                    <label class="form-label" for="bookingDate">Date <span class="text-rose">*</span></label>
                                    <input type="date" id="bookingDate" class="form-input">
                                </div>
                                <div class="form-group" style="flex: 1.2;">
                                    <label class="form-label" for="bookingTime">Time <span class="text-rose">*</span></label>
                                    <div style="display: flex; gap: 6px;">
                                        <input type="time" id="bookingTime" class="form-input" style="flex: 1;">
                                        <button type="button" class="btn btn-secondary" id="btnTimeNow" style="padding: 0 12px; height: 40px; font-size: 12px; font-weight: 600; white-space: nowrap;">Now</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ── BOOKING NOTES SECTION ── -->
                        <div class="lhs-section-group lhs-notes-section">
                            <div class="lhs-sub-label">
                                <i data-feather="file-text" style="width:11px;height:11px;"></i>
                                Booking Notes
                            </div>
                            <textarea id="bookingNotes" class="form-input form-textarea" placeholder="Add optional notes for this booking..." style="height: 90px; min-height: 80px; resize: vertical;"></textarea>
                        </div>
                    </div>

                    <!-- RIGHT PANEL: Selected Services / Packages -->
                    <div class="booking-right-panel is-empty">
                        <div class="booking-rhs-header">
                            <span class="booking-section-badge">
                                <i data-feather="star" style="width:12px;height:12px;"></i>
                                Selected Services / Packages
                            </span>
                            <button type="button" class="btn-clear-all-main" id="btnMainClearAll" style="display:none;">
                                🗑 Clear All
                            </button>
                        </div>

                        <!-- RHS Tabs: Included Services / Included Packages + Edit Services Button (hidden when empty) -->
                        <div class="main-rhs-tabs" id="mainRhsTabs" style="display:none;">
                            <div class="main-rhs-tabs-left">
                                <button type="button" class="main-rhs-tab-btn active" id="mainRhsTabServices">
                                    <span>Included Services</span>
                                    <span class="main-tab-count-badge" id="mainServicesTabCount">0</span>
                                </button>
                                <button type="button" class="main-rhs-tab-btn" id="mainRhsTabPackages">
                                    <span>Included Packages</span>
                                    <span class="main-tab-count-badge" id="mainPackagesTabCount">0</span>
                                </button>
                            </div>
                            <button type="button" class="btn-edit-services-top" id="btnOpenAddServicesTop">
                                <i data-feather="edit-2"></i>
                                <span>Edit Services / Packages</span>
                            </button>
                        </div>

                        <!-- Selected Items Container (hidden when empty) -->
                        <div class="selected-services-list" id="mainSelectedServicesList">
                            <!-- Rendered dynamically -->
                        </div>

                        <!-- Empty State Helper Text & Add button (visible only when empty) -->
                        <div class="rhs-empty-container" id="mainRhsEmptyContainer">
                            <p class="rhs-empty-text">No Services or Packages selected. Click below to select</p>
                            <button type="button" class="btn-add-services-modal" id="btnOpenAddServicesModal">
                                <i data-feather="plus"></i>
                                <span>Add Services / Packages</span>
                            </button>
                        </div>
                    </div>

                </div>

                <!-- Footer -->
                <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <button type="button" id="btnCancelThisBooking" style="display:none;padding:8px 16px;border-radius:8px;border:1px solid #fca5a5;background:#fff5f5;color:#dc2626;font-size:0.85rem;font-weight:600;cursor:pointer;align-items:center;gap:6px;transition:all 0.2s;">
                            <i data-feather="x-circle" style="width:14px;height:14px;"></i>
                            <span>Cancel Booking</span>
                        </button>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <button type="button" class="btn btn-secondary" id="btnCancelBooking">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btnConfirmBooking" disabled>Confirm Booking</button>
                    </div>
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
                        <!-- Header: RHS Pill Tabs (Services / Packages) -->
                        <div class="picker-selected-header">
                            <div class="picker-rhs-tabs" id="pickerRhsTabs">
                                <button type="button" class="picker-rhs-tab-btn active" id="pickerRhsTabServices">
                                    <span>Selected Services</span>
                                    <span class="picker-count-badge" id="pickerServicesCountBadge">0</span>
                                </button>
                                <button type="button" class="picker-rhs-tab-btn" id="pickerRhsTabPackages">
                                    <span>Selected Packages</span>
                                    <span class="picker-count-badge" id="pickerPackagesCountBadge">0</span>
                                </button>
                            </div>
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
                    <button type="button" class="btn btn-secondary" id="btnCancelPickerModal">Go Back</button>
                    <button type="button" class="btn-add-to-booking" id="btnAddPickerToBooking">
                        <i data-feather="check-circle"></i>
                        <span>Confirm Selection</span>
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
    const btnOpenAddServicesTop  = document.getElementById('btnOpenAddServicesTop');
    const mainSelectedList       = document.getElementById('mainSelectedServicesList');
    const mainStaffSyncToggle    = document.getElementById('mainStaffSyncToggle');  // kept for picker sync, no UI in main modal
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
    const pickerCountBadge       = document.getElementById('pickerSelectedCountBadge');
    const pickerRhsTabServices   = document.getElementById('pickerRhsTabServices');
    const pickerRhsTabPackages   = document.getElementById('pickerRhsTabPackages');
    const pickerServicesCountBadge = document.getElementById('pickerServicesCountBadge');
    const pickerPackagesCountBadge = document.getElementById('pickerPackagesCountBadge');
    const btnClearAllSelected    = document.getElementById('btnClearAllSelected');
    const btnMainClearAll        = document.getElementById('btnMainClearAll');
    const mainRhsTabs            = document.getElementById('mainRhsTabs');
    const mainRhsTabServices     = document.getElementById('mainRhsTabServices');
    const mainRhsTabPackages     = document.getElementById('mainRhsTabPackages');
    const mainServicesTabCount   = document.getElementById('mainServicesTabCount');
    const mainPackagesTabCount   = document.getElementById('mainPackagesTabCount');
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
                supabase.schema('app').from('services').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.schema('app').from('staff').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.schema('app').from('customers').select('*').eq('company_id', company_id).eq('branch_id', branch_id),
                supabase.schema('app').from('packages').select('*').eq('company_id', company_id).eq('branch_id', branch_id).eq('is_active', true).neq('status', 'deleted'),
                supabase.schema('app').from('package_services').select('*'),
                supabase.schema('app').from('service_categories').select('category_id, category_name').eq('company_id', company_id).eq('branch_id', branch_id).neq('status', 'deleted')
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
    // Helper: Collect all staff-assignable entries across services & packages
    // ----------------------------------------------------------------
    function getAllAssignableEntries(itemsArray) {
        const list = [];
        (itemsArray || []).forEach(it => {
            if (it.type === 'service') {
                list.push({
                    uid: it.uid,
                    get: () => it.staffId,
                    set: (id, name) => { it.staffId = id; it.staffName = name; }
                });
            } else if (it.type === 'package' && Array.isArray(it.services)) {
                it.services.forEach(s => {
                    list.push({
                        uid: s.uid,
                        get: () => s.staffId,
                        set: (id, name) => { s.staffId = id; s.staffName = name; }
                    });
                });
            }
        });
        return list;
    }

    // Returns only standalone service entries (excludes package nested services).
    // Used by the Services-tab "Apply same staff to all" toggle so it never
    // bleeds into package staff assignments.
    function getServiceOnlyEntries(itemsArray) {
        return (itemsArray || [])
            .filter(it => it.type === 'service')
            .map(it => ({
                uid: it.uid,
                get: () => it.staffId,
                set: (id, name) => { it.staffId = id; it.staffName = name; }
            }));
    }

    // ----------------------------------------------------------------
    // RENDER: Selected Items List (Shared by Main Modal & Picker Modal)
    // ----------------------------------------------------------------
    function renderSelectedList(containerEl, itemsArray, isPicker) {
        if (!containerEl) return;

        if (isPicker) {
            const toggleRow = document.getElementById('pickerSelectedToggleRow');
            if (toggleRow) {
                // On Packages tab: hide the top bar entirely (each package card has its own staff control)
                // On Services tab: show only when individual services exist
                if (activePickerRhsTab === 'packages') {
                    toggleRow.style.display = 'none';
                } else {
                    toggleRow.style.display = itemsArray.some(it => it.type === 'service') ? 'flex' : 'none';
                }
            }
            const btnClearAll = document.getElementById('btnClearAllSelected');
            if (btnClearAll) {
                const hasServices = itemsArray.some(it => it.type === 'service');
                btnClearAll.style.visibility = (activePickerRhsTab === 'services' && hasServices) ? 'visible' : 'hidden';
            }

            // Sync active state of RHS tab buttons
            const tabServicesBtn = document.getElementById('pickerRhsTabServices');
            const tabPackagesBtn = document.getElementById('pickerRhsTabPackages');
            if (tabServicesBtn) tabServicesBtn.classList.toggle('active', activePickerRhsTab === 'services');
            if (tabPackagesBtn) tabPackagesBtn.classList.toggle('active', activePickerRhsTab === 'packages');
        } else {
            // Main Modal: Sync active state of RHS tab buttons and controls
            const mainTabServicesBtn = document.getElementById('mainRhsTabServices');
            const mainTabPackagesBtn = document.getElementById('mainRhsTabPackages');
            if (mainTabServicesBtn) mainTabServicesBtn.classList.toggle('active', activeMainRhsTab === 'services');
            if (mainTabPackagesBtn) mainTabPackagesBtn.classList.toggle('active', activeMainRhsTab === 'packages');

            const btnMainClear = document.getElementById('btnMainClearAll');
            if (btnMainClear) {
                const hasTabItems = activeMainRhsTab === 'services'
                    ? itemsArray.some(it => it.type === 'service')
                    : itemsArray.some(it => it.type === 'package');
                btnMainClear.style.display = hasTabItems ? 'inline-flex' : 'none';
            }
        }

        const staffOptionsHtml = (selectedStaffId) => {
            return `<option value="" disabled ${!selectedStaffId ? 'selected' : ''}>Select staff</option>` +
                liveStaffDB.map(st => `
                    <option value="${st.staff_id}" ${st.staff_id === selectedStaffId ? 'selected' : ''}>${st.staff_name || st.name}</option>
                `).join('');
        };

        const renderServiceCardHtml = (item, index) => {
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
                            <span class="item-price">${priceDisplay}</span>
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
        };

        const renderPackageCardHtml = (pkg, index) => {
            const incServices = Array.isArray(pkg.services) ? pkg.services : [];
            const isExpanded = pkg.expanded !== false; // default true
            const priceDisplay = fmtPrice(pkg.price);

            return `
            <div class="selected-package-card ${isExpanded ? 'expanded' : 'collapsed'}" data-uid="${pkg.uid}" data-index="${index}">
                <div class="package-card-header" data-uid="${pkg.uid}">
                    <div class="package-header-left">
                        <div class="package-title-row">
                            <span class="package-title">${pkg.packageName || pkg.name}</span>
                            <span class="package-badge">Package</span>
                        </div>
                        <div class="package-meta">
                            <span>${incServices.length} included services</span>
                            <span class="meta-dot">·</span>
                            <span class="package-price">${priceDisplay}</span>
                        </div>
                    </div>
                    <div class="package-header-right">
                        ${incServices.length > 1 ? `
                        <label class="pkg-staff-sync-toggle" title="Apply same staff to all services in this package" onclick="event.stopPropagation();">
                            <span>apply same staff to all</span>
                            <input type="checkbox" class="pkg-staff-sync-checkbox" data-uid="${pkg.uid}" ${pkg.syncStaff ? 'checked' : ''}>
                        </label>
                        ` : ''}
                        <button type="button" class="btn-package-toggle" data-uid="${pkg.uid}" title="${isExpanded ? 'Collapse package' : 'Expand to view services'}">
                            <i data-feather="${isExpanded ? 'chevron-up' : 'chevron-down'}"></i>
                        </button>
                        <button type="button" class="btn-package-delete" data-uid="${pkg.uid}" title="Remove package">
                            <i data-feather="trash-2"></i>
                        </button>
                    </div>
                </div>

                ${isExpanded ? `
                    <div class="package-nested-services">
                        ${incServices.map(svc => `
                            <div class="package-nested-service-row" data-pkg-uid="${pkg.uid}" data-svc-uid="${svc.uid}">
                                <div class="nested-service-info">
                                    <span class="nested-service-name">${svc.serviceName}</span>
                                    <span class="nested-service-duration">${svc.duration ? `${svc.duration} min` : '—'}</span>
                                </div>
                                <div class="nested-service-staff">
                                    <select class="package-nested-staff-select" data-pkg-uid="${pkg.uid}" data-svc-uid="${svc.uid}">
                                        ${staffOptionsHtml(svc.staffId)}
                                    </select>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="package-collapsed-note" data-uid="${pkg.uid}">
                        <span>Expand to view included services and assign staff.</span>
                    </div>
                `}
            </div>
            `;
        };

        if (isPicker) {
            // Picker Modal: filtered by activePickerRhsTab
            if (activePickerRhsTab === 'services') {
                const servicesList = itemsArray.filter(it => it.type === 'service');
                if (servicesList.length === 0) {
                    containerEl.innerHTML = `
                        <div class="selected-services-empty">
                            <p style="margin:0;font-weight:600;color:#64748b;">No individual services selected.</p>
                            <p style="margin:4px 0 0 0;font-size:0.82rem;color:#94a3b8;">Click "+ Add" on any service on the left to add it here.</p>
                        </div>
                    `;
                } else {
                    containerEl.innerHTML = servicesList.map((item, idx) => renderServiceCardHtml(item, idx)).join('');
                }
            } else {
                // 'packages' tab
                const packagesList = itemsArray.filter(it => it.type === 'package');
                if (packagesList.length === 0) {
                    containerEl.innerHTML = `
                        <div class="selected-services-empty">
                            <p style="margin:0;font-weight:600;color:#64748b;">No packages selected.</p>
                            <p style="margin:4px 0 0 0;font-size:0.82rem;color:#94a3b8;">Switch to the Packages tab on the left to add a package.</p>
                        </div>
                    `;
                } else {
                    containerEl.innerHTML = packagesList.map((pkg, idx) => renderPackageCardHtml(pkg, idx)).join('');
                }
            }
        } else {
            // Main Booking Modal: Filtered by activeMainRhsTab ('services' | 'packages')
            const servicesList = itemsArray.filter(it => it.type === 'service');
            const packagesList = itemsArray.filter(it => it.type === 'package');

            if (itemsArray.length === 0) {
                containerEl.innerHTML = '';
            } else if (activeMainRhsTab === 'services') {
                if (servicesList.length === 0) {
                    containerEl.innerHTML = `
                        <div class="selected-services-empty" style="padding:28px 16px;text-align:center;">
                            <p style="margin:0;font-weight:600;color:#64748b;">No individual services included.</p>
                            <p style="margin:4px 0 0 0;font-size:0.82rem;color:#94a3b8;">Click "+ Add Services / Packages" below to select services.</p>
                        </div>
                    `;
                } else {
                    containerEl.innerHTML = servicesList.map((item, idx) => renderServiceCardHtml(item, idx)).join('');
                }
            } else {
                // 'packages' tab
                if (packagesList.length === 0) {
                    containerEl.innerHTML = `
                        <div class="selected-services-empty" style="padding:28px 16px;text-align:center;">
                            <p style="margin:0;font-weight:600;color:#64748b;">No packages included.</p>
                            <p style="margin:4px 0 0 0;font-size:0.82rem;color:#94a3b8;">Click "+ Add Services / Packages" below to select a package.</p>
                        </div>
                    `;
                } else {
                    containerEl.innerHTML = packagesList.map((pkg, idx) => renderPackageCardHtml(pkg, idx)).join('');
                }
            }
        }

        if (window.feather && feather.replace) {
            feather.replace();
        }

        // Attach Expand/Collapse Package Listeners
        containerEl.querySelectorAll('.package-card-header, .package-collapsed-note').forEach(headerEl => {
            headerEl.addEventListener('click', (e) => {
                if (e.target.closest('.btn-package-delete') || e.target.closest('select')) return;
                const uid = headerEl.dataset.uid;
                const pkgItem = itemsArray.find(it => it.uid === uid);
                if (pkgItem) {
                    pkgItem.expanded = !pkgItem.expanded;
                    renderSelectedList(containerEl, itemsArray, isPicker);
                }
            });
        });

        // Attach Package Delete Listeners
        containerEl.querySelectorAll('.btn-package-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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

        // Attach Standalone Service Staff Select Listeners
        containerEl.querySelectorAll('.item-staff-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const uid = sel.dataset.uid;
                const newStaffId = sel.value;
                const opt = sel.options[sel.selectedIndex];
                const newStaffName = opt ? opt.textContent : '';

                if (isStaffSyncAll) {
                    // Only sync across standalone services — never touch package staff assignments
                    getServiceOnlyEntries(itemsArray).forEach(entry => entry.set(newStaffId, newStaffName));
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

        // Attach Per-Package Staff Sync Toggle Listeners
        containerEl.querySelectorAll('.pkg-staff-sync-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const pkgUid = cb.dataset.uid;
                const pkgItem = itemsArray.find(it => it.uid === pkgUid);
                if (!pkgItem || !Array.isArray(pkgItem.services)) return;

                pkgItem.syncStaff = cb.checked;

                if (pkgItem.syncStaff) {
                    const firstWithStaff = pkgItem.services.find(s => s.staffId);
                    if (firstWithStaff) {
                        pkgItem.services.forEach(s => {
                            s.staffId = firstWithStaff.staffId;
                            s.staffName = firstWithStaff.staffName;
                        });
                    }
                }
                renderSelectedList(containerEl, itemsArray, isPicker);
                validateForm();
            });
        });

        // Attach Nested Package Service Staff Select Listeners
        containerEl.querySelectorAll('.package-nested-staff-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const pkgUid = sel.dataset.pkgUid;
                const svcUid = sel.dataset.svcUid;
                const newStaffId = sel.value;
                const opt = sel.options[sel.selectedIndex];
                const newStaffName = opt ? opt.textContent : '';

                // Always scope to this specific package — never bleed across packages or to standalone services.
                // isStaffSyncAll (Services tab global toggle) must NOT affect nested package staff selects.
                const pkgItem = itemsArray.find(it => it.uid === pkgUid);
                if (pkgItem && Array.isArray(pkgItem.services)) {
                    if (pkgItem.syncStaff) {
                        // Per-package "apply same staff to all" — sync only within this package
                        pkgItem.services.forEach(s => {
                            s.staffId = newStaffId;
                            s.staffName = newStaffName;
                        });
                        renderSelectedList(containerEl, itemsArray, isPicker);
                    } else {
                        // No sync — update only the individual service within this package
                        const svcItem = pkgItem.services.find(s => s.uid === svcUid);
                        if (svcItem) {
                            svcItem.staffId = newStaffId;
                            svcItem.staffName = newStaffName;
                        }
                    }
                }
                validateForm();
            });
        });

        // Attach Standalone Service Delete Listeners
        containerEl.querySelectorAll('.btn-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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

                const srcItem = itemsArray.find(it => it.uid === draggedItemUid);
                const tgtItem = itemsArray.find(it => it.uid === targetUid);

                if (srcItem && tgtItem && srcItem.type === tgtItem.type) {
                    const srcIndex = itemsArray.indexOf(srcItem);
                    const tgtIndex = itemsArray.indexOf(tgtItem);
                    if (srcIndex !== -1 && tgtIndex !== -1) {
                        const [movedItem] = itemsArray.splice(srcIndex, 1);
                        itemsArray.splice(tgtIndex, 0, movedItem);
                        renderSelectedList(containerEl, itemsArray, isPicker);
                    }
                }
            });
        });
    }

    // ----------------------------------------------------------------
    // TOTALS & METRICS RECALCULATION
    // ----------------------------------------------------------------
    function updateTotals() {
        const calculateMetrics = (arr) => {
            let duration = 0;
            let amount   = 0;
            let svcCount = 0;
            let pkgCount = 0;

            (arr || []).forEach(item => {
                if (item.type === 'service') {
                    svcCount++;
                    duration += (parseInt(item.duration) || 0);
                    amount   += (parseFloat(item.price) || 0);
                } else if (item.type === 'package') {
                    pkgCount++;
                    amount += (parseFloat(item.price) || 0);
                    if (Array.isArray(item.services)) {
                        item.services.forEach(s => {
                            duration += (parseInt(s.duration) || 0);
                        });
                    } else {
                        duration += (parseInt(item.duration) || 0);
                    }
                }
            });

            return { duration, amount, svcCount, pkgCount };
        };

        // 1. Main Modal Metrics
        const main = calculateMetrics(selectedBookingItems);
        const hasMainItems = (main.svcCount + main.pkgCount) > 0;

        const mainRhsPanel = document.querySelector('.booking-right-panel');
        const mainRhsEmptyContainer = document.getElementById('mainRhsEmptyContainer');
        const mainRhsTabs = document.getElementById('mainRhsTabs');
        const mainServicesTabCount = document.getElementById('mainServicesTabCount');
        const mainPackagesTabCount = document.getElementById('mainPackagesTabCount');

        if (mainRhsPanel) {
            mainRhsPanel.classList.toggle('is-empty', !hasMainItems);
            mainRhsPanel.classList.toggle('has-items', hasMainItems);
        }
        if (mainRhsTabs) {
            mainRhsTabs.style.display = hasMainItems ? 'flex' : 'none';
        }
        if (mainServicesTabCount) mainServicesTabCount.textContent = main.svcCount;
        if (mainPackagesTabCount) mainPackagesTabCount.textContent = main.pkgCount;

        if (mainRhsEmptyContainer) {
            mainRhsEmptyContainer.style.display = hasMainItems ? 'none' : 'flex';
        }

        if (mainTotalDurationVal) mainTotalDurationVal.textContent = `${main.duration} min`;
        if (mainTotalAmountVal) mainTotalAmountVal.textContent = fmtPrice(main.amount);

        // Show/hide main modal Clear All button in header
        if (btnMainClearAll) {
            btnMainClearAll.style.display = hasMainItems ? 'inline-flex' : 'none';
        }

        // 2. Picker Modal Metrics
        const picker = calculateMetrics(pickerDraftItems);
        const pickerSvcBadge = document.getElementById('pickerServicesCountBadge');
        const pickerPkgBadge = document.getElementById('pickerPackagesCountBadge');
        if (pickerSvcBadge) pickerSvcBadge.textContent = picker.svcCount;
        if (pickerPkgBadge) pickerPkgBadge.textContent = picker.pkgCount;

        // Fallback for legacy badge if present
        if (pickerCountBadge) pickerCountBadge.textContent = picker.svcCount + picker.pkgCount;

        if (pickerTotalDurationVal) pickerTotalDurationVal.textContent = `${picker.duration} min`;
        if (pickerTotalAmountVal) pickerTotalAmountVal.textContent = fmtPrice(picker.amount);
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
                const isAdded = pickerDraftItems.some(it => it.type === 'package' && (it.packageId === pkg.package_id || it.id === pkg.package_id));
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
                        let defaultStaff = '';
                        let defaultStaffName = '';
                        if (isStaffSyncAll) {
                            // Only inherit from other standalone services, not packages
                            const firstAssigned = getServiceOnlyEntries(pickerDraftItems).find(e => e.get() && e.get().trim().length > 0);
                            if (firstAssigned) {
                                defaultStaff = firstAssigned.get();
                                const stObj = liveStaffDB.find(st => st.staff_id === defaultStaff);
                                defaultStaffName = stObj ? (stObj.staff_name || stObj.name) : '';
                            }
                        }

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

                        // Auto-switch to Selected Services tab
                        activePickerRhsTab = 'services';
                    }
                } else if (type === 'package') {
                    const pkg = livePackagesDB.find(p => p.package_id === id);
                    if (!pkg) return;

                    const isCurrentlyAdded = pickerDraftItems.some(it => it.type === 'package' && (it.packageId === id || it.id === id));
                    if (isCurrentlyAdded) {
                        // Remove package and all included services in 1 click
                        pickerDraftItems = pickerDraftItems.filter(it => !(it.type === 'package' && (it.packageId === id || it.id === id)));
                    } else {
                        // Add package as an expandable group per Decision 1 & 2
                        const incServices = livePackageServicesDB.filter(ps => ps.package_id === id);
                        let defaultStaff = '';
                        let defaultStaffName = '';
                        // Packages are staff-synced independently via their own per-package toggle.
                        // isStaffSyncAll (Services tab) must NOT auto-assign staff to package services.
                        // defaultStaff intentionally stays '' so each package service starts unassigned.

                        const pkgPrice = parseFloat(pkg.final_price) || 0;
                        const numSvc = incServices.length;
                        const perItemPrice = numSvc > 0 ? Math.round(pkgPrice / numSvc) : pkgPrice;
                        let totalDuration = 0;

                        const nestedServices = incServices.map((ps, idx) => {
                            const matchedSvc = liveServicesDB.find(s => s.service_id === ps.service_id);
                            const dur = matchedSvc ? (parseInt(matchedSvc.duration) || 0) : 30;
                            totalDuration += dur;
                            const allocPrice = (idx === numSvc - 1)
                                ? (pkgPrice - perItemPrice * (numSvc - 1))
                                : perItemPrice;

                            return {
                                uid: 'pkgsvc_' + generateUUID(),
                                packageId: pkg.package_id,
                                serviceId: ps.service_id,
                                serviceName: ps.service_name,
                                duration: dur,
                                price: allocPrice,
                                staffId: defaultStaff,
                                staffName: defaultStaffName,
                                categoryName: matchedSvc?.category_name || 'Package'
                            };
                        });

                        pickerDraftItems.push({
                            uid: 'pkg_' + generateUUID(),
                            type: 'package',
                            packageId: pkg.package_id,
                            id: pkg.package_id,
                            packageName: pkg.package_name,
                            name: pkg.package_name,
                            price: pkgPrice,
                            duration: totalDuration || 60,
                            expanded: true, // Auto-expanded by default per Decision 1 & 2
                            services: nestedServices
                        });

                        // Auto-switch to Selected Packages tab per Decision 1
                        activePickerRhsTab = 'packages';
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
    let editModeBookingId   = null; // null = create mode, string = edit mode
    let editModeBookingData = null; // first row of the booking (for payment status etc.)

    async function openModal() {
        // Reset edit mode
        editModeBookingId   = null;
        editModeBookingData = null;

        // Reset header to create mode
        const h2El = bookingModal.querySelector('.header-titles h2');
        if (h2El) h2El.textContent = 'New Booking';
        const subtitleEl = bookingModal.querySelector('.header-titles .subtitle');
        if (subtitleEl) subtitleEl.textContent = 'Create a new appointment for a customer.';
        const idBadge = document.getElementById('editBookingIdBadge');
        if (idBadge) idBadge.style.display = 'none';
        const confirmBtn = document.getElementById('btnConfirmBooking');
        if (confirmBtn) confirmBtn.textContent = 'Confirm Booking';

        // Hide cancel booking danger button
        const btnCancelThis = document.getElementById('btnCancelThisBooking');
        if (btnCancelThis) btnCancelThis.style.display = 'none';

        // Re-enable customer fields
        ['phoneSearch', 'customerName', 'customerEmail'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.removeAttribute('readonly');
                el.removeAttribute('disabled');
                el.style.background = '';
                el.style.cursor     = '';
                el.style.color      = '';
            }
        });

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
        activePickerRhsTab   = 'services';
        activeMainRhsTab     = 'services';

        if (pickerStaffSyncToggle) pickerStaffSyncToggle.checked = false;

        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        validateForm();

        bookingModalOverlay.classList.add('active');
        setTimeout(() => {
            if (!editModeBookingId && phoneSearch) phoneSearch.focus();
        }, 100);

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

    // ── Open Edit Modal ──────────────────────────────────────────────
    async function openEditModal(bookingId) {
        // 1. Reset everything via openModal()
        await openModal();

        // 2. Set edit mode
        editModeBookingId = bookingId;

        // 3. Update header title / badge / subtitle
        const h2El = bookingModal.querySelector('.header-titles h2');
        if (h2El) h2El.textContent = 'Edit Booking';

        const idBadge = document.getElementById('editBookingIdBadge');
        if (idBadge) {
            idBadge.textContent = '#' + String(bookingId).slice(0, 8).toUpperCase();
            idBadge.style.display = 'inline';
        }

        const subtitleEl = bookingModal.querySelector('.header-titles .subtitle');
        if (subtitleEl) subtitleEl.textContent = 'Update schedule, services, or assigned staff.';

        // 4. Update footer button text
        const confirmBtn = document.getElementById('btnConfirmBooking');
        if (confirmBtn) confirmBtn.textContent = 'Update Booking';

        // 5. Make customer fields read-only
        ['phoneSearch', 'customerName', 'customerEmail'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.setAttribute('readonly', 'true');
                el.removeAttribute('disabled');
                el.style.background = '#f8fafc';
                el.style.cursor     = 'not-allowed';
                el.style.color      = '#334155';
            }
        });

        // 7. Reset scroll on left panel so Customer is visible at top
        const leftPanel = bookingModal.querySelector('.booking-left-panel');
        if (leftPanel) leftPanel.scrollTop = 0;

        // 8. Fetch all booking rows
        let allRows = [];
        try {
            const { data, error } = await supabase.schema('app')
                .from('bookings')
                .select('*')
                .eq('booking_id', bookingId);
            if (error) throw error;
            allRows = data || [];
        } catch (err) {
            console.error('[openEditModal] fetch error:', err);
            if (window.toast) window.toast('Failed to load booking: ' + err.message, 'error');
            return;
        }

        if (!allRows.length) {
            console.warn('[openEditModal] No rows found for booking_id:', bookingId);
            return;
        }

        const firstRow = allRows[0];
        editModeBookingData = firstRow;

        // 9. Pre-fill customer info (read-only)
        selectedCustomerId = firstRow.customer_id || null;
        const phoneEl = document.getElementById('phoneSearch');
        if (phoneEl) { phoneEl.value = firstRow.customer_phone || ''; }

        const nameEl = document.getElementById('customerName');
        if (nameEl) { nameEl.value = firstRow.customer_name || ''; }

        const emailEl = document.getElementById('customerEmail');
        if (emailEl) { emailEl.value = firstRow.customer_email || firstRow.customer_mail || ''; }

        // Show existing customer badge
        if (newCustomerBadgeContainer) newCustomerBadgeContainer.style.display = 'none';
        if (customerBadgeContainer) {
            customerBadgeContainer.style.display = 'block';
            if (customerBadge) customerBadge.textContent = 'Existing Customer (Locked)';
        }

        // 10. Pre-fill date / time / notes (relax date min in edit mode)
        if (bookingDate) {
            bookingDate.removeAttribute('min');
            if (firstRow.booking_date) bookingDate.value = firstRow.booking_date;
        }
        if (bookingTime && firstRow.start_time)   bookingTime.value = firstRow.start_time.slice(0, 5);
        if (bookingNotes && firstRow.notes)        bookingNotes.value = firstRow.notes;

        // 11. Convert DB rows → selectedBookingItems
        const packageMap     = new Map();
        const standaloneRows = [];

        for (const row of allRows) {
            if (row.package_id) {
                if (!packageMap.has(row.package_id)) {
                    packageMap.set(row.package_id, {
                        uid:         'pkg_' + generateUUID(),
                        type:        'package',
                        id:          row.package_id,
                        packageId:   row.package_id,
                        name:        '',
                        packageName: '',
                        price:       0,
                        duration:    0,
                        syncStaff:   false,
                        services:    []
                    });
                }
                const pkg = packageMap.get(row.package_id);
                if (!pkg.packageName) {
                    const match = (row.service_name || '').match(/\(([^)]+)\)$/);
                    pkg.packageName = match ? match[1] : (row.service_name || '');
                }
                if (!pkg.name) pkg.name = pkg.packageName;

                const matchedSvc = liveServicesDB.find(s => s.service_id === row.service_id);
                const dur = matchedSvc ? (parseInt(matchedSvc.duration) || 0) : 0;
                pkg.duration += dur;
                pkg.price    += Number(row.price) || 0;

                pkg.services.push({
                    uid:         'svc_' + generateUUID(),
                    serviceId:   row.service_id,
                    packageId:   row.package_id,
                    serviceName: matchedSvc
                        ? matchedSvc.service_name
                        : (row.service_name || '').replace(/\s*\([^)]*\)$/, ''),
                    duration:    dur,
                    price:       Number(row.price) || 0,
                    staffId:     row.staff_id   || '',
                    staffName:   row.staff_name || ''
                });
            } else {
                standaloneRows.push(row);
            }
        }

        selectedBookingItems = [];
        for (const row of standaloneRows) {
            const matchedSvc = liveServicesDB.find(s => s.service_id === row.service_id);
            selectedBookingItems.push({
                uid:          'item_' + generateUUID(),
                type:         'service',
                id:           row.service_id,
                name:         row.service_name || (matchedSvc ? matchedSvc.service_name : ''),
                categoryName: matchedSvc ? matchedSvc.category_name : '',
                duration:     matchedSvc ? (parseInt(matchedSvc.duration) || 0) : 0,
                price:        Number(row.price) || 0,
                staffId:      row.staff_id   || '',
                staffName:    row.staff_name || '',
                packageId:    null,
                packageName:  null
            });
        }
        for (const [, pkg] of packageMap) {
            selectedBookingItems.push(pkg);
        }

        // 13. Render lists, totals, validation
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        validateForm();

        if (window.feather) window.feather.replace();
    }

    // ── Picker Modal Lifecycle ──────────────────────────────────────────
    function openPickerModal() {
        // Clone current confirmed items into picker working draft
        pickerDraftItems = JSON.parse(JSON.stringify(selectedBookingItems));

        activePickerTab      = 'services';
        activePickerRhsTab   = pickerDraftItems.some(it => it.type === 'service')
            ? 'services'
            : (pickerDraftItems.some(it => it.type === 'package') ? 'packages' : 'services');
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

        pickerSelectedList?.removeAttribute('style');
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

    // ── Picker RHS Tabs (Selected Services / Selected Packages) ────
    pickerRhsTabServices?.addEventListener('click', () => {
        activePickerRhsTab = 'services';
        renderSelectedList(pickerSelectedList, pickerDraftItems, true);
    });

    pickerRhsTabPackages?.addEventListener('click', () => {
        activePickerRhsTab = 'packages';
        renderSelectedList(pickerSelectedList, pickerDraftItems, true);
    });

    // ── Picker Actions ──────────────────────────────────────────────
    btnClearAllSelected?.addEventListener('click', () => {
        if (activePickerRhsTab === 'services') {
            pickerDraftItems = pickerDraftItems.filter(it => it.type !== 'service');
        } else if (activePickerRhsTab === 'packages') {
            pickerDraftItems = pickerDraftItems.filter(it => it.type !== 'package');
        } else {
            pickerDraftItems = [];
        }
        renderSelectedList(pickerSelectedList, pickerDraftItems, true);
        renderCatalogItems();
        updateTotals();
    });

    pickerStaffSyncToggle?.addEventListener('change', (e) => {
        isStaffSyncAll = e.target.checked;

        if (isStaffSyncAll && pickerDraftItems.length > 0) {
            // Only sync standalone services — packages are managed independently via their own per-package toggle
            const entries = getServiceOnlyEntries(pickerDraftItems);
            const firstAssigned = entries.find(entry => entry.get() && entry.get().trim().length > 0);
            if (firstAssigned) {
                const firstStaff = firstAssigned.get();
                const stObj = liveStaffDB.find(st => st.staff_id === firstStaff);
                const firstStaffName = stObj ? (stObj.staff_name || stObj.name) : '';
                entries.forEach(entry => entry.set(firstStaff, firstStaffName));
                renderSelectedList(pickerSelectedList, pickerDraftItems, true);
            }
        }
    });

    // ── Main RHS Tabs (Included Services / Included Packages) ───────
    mainRhsTabServices?.addEventListener('click', () => {
        activeMainRhsTab = 'services';
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
    });

    mainRhsTabPackages?.addEventListener('click', () => {
        activeMainRhsTab = 'packages';
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
    });

    // ── Commit Picker Selection to Main Booking Modal ───────────────
    btnAddPickerToBooking?.addEventListener('click', () => {
        // Commit draft to single source of truth
        selectedBookingItems = JSON.parse(JSON.stringify(pickerDraftItems));
        const servicesCount = selectedBookingItems.filter(it => it.type === 'service').length;
        const packagesCount = selectedBookingItems.filter(it => it.type === 'package').length;
        if (activeMainRhsTab === 'services' && servicesCount === 0 && packagesCount > 0) {
            activeMainRhsTab = 'packages';
        } else if (activeMainRhsTab === 'packages' && packagesCount === 0 && servicesCount > 0) {
            activeMainRhsTab = 'services';
        }
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        closePickerModal();
        validateForm();
    });

    btnOpenAddServices?.addEventListener('click', openPickerModal);
    btnOpenAddServicesTop?.addEventListener('click', openPickerModal);
    btnClosePicker?.addEventListener('click', closePickerModal);
    btnCancelPicker?.addEventListener('click', closePickerModal);

    // ── Main Modal Clear All ─────────────────────────────────────
    btnMainClearAll?.addEventListener('click', () => {
        if (activeMainRhsTab === 'services') {
            selectedBookingItems = selectedBookingItems.filter(it => it.type !== 'service');
        } else if (activeMainRhsTab === 'packages') {
            selectedBookingItems = selectedBookingItems.filter(it => it.type !== 'package');
        } else {
            selectedBookingItems = [];
        }
        renderSelectedList(mainSelectedList, selectedBookingItems, false);
        updateTotals();
        validateForm();
    });
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

        const assignableEntries = getAllAssignableEntries(selectedBookingItems);
        const hasItems          = assignableEntries.length > 0;
        const allStaffSet       = hasItems && assignableEntries.every(entry => entry.get() && entry.get().trim().length > 0);

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
        const payloads = [];

        selectedBookingItems.forEach((item) => {
            if (item.type === 'service') {
                const itemDuration = parseInt(item.duration) || 0;
                const startTimeStr = minsToTime24(currentStartMins);
                const endTimeStr   = minsToTime24(currentStartMins + itemDuration);
                currentStartMins += itemDuration;

                payloads.push({
                    company_id:      getCompanyId(),
                    branch_id:       getBranchId(),
                    booking_id:      groupBookingId,
                    customer_id:     targetId || null,
                    customer_name:   targetName,
                    customer_mail:   customerEmail?.value.trim() || null,
                    customer_phone:  phoneSearch.value.trim(),
                    service_id:      item.id,
                    package_id:      null,
                    service_name:    item.name,
                    staff_id:        item.staffId,
                    staff_name:      item.staffName,
                    booking_date:    bookingDate.value,
                    start_time:      startTimeStr,
                    end_time:        endTimeStr,
                    duration:        itemDuration,
                    notes:           bookingNotes?.value.trim() || '',
                    price:           Number(item.price) || 0,
                    status:          'booked',
                    booking_type:    'walk-in'
                });
            } else if (item.type === 'package') {
                const incServices = Array.isArray(item.services) ? item.services : [];
                incServices.forEach((svc) => {
                    const svcDuration = parseInt(svc.duration) || 0;
                    const startTimeStr = minsToTime24(currentStartMins);
                    const endTimeStr   = minsToTime24(currentStartMins + svcDuration);
                    currentStartMins += svcDuration;

                    payloads.push({
                        company_id:      getCompanyId(),
                        branch_id:       getBranchId(),
                        booking_id:      groupBookingId,
                        customer_id:     targetId || null,
                        customer_name:   targetName,
                        customer_mail:   customerEmail?.value.trim() || null,
                        customer_phone:  phoneSearch.value.trim(),
                        service_id:      svc.serviceId,
                        package_id:      svc.packageId || item.packageId || null,
                        service_name:    `${svc.serviceName} (${item.packageName || item.name})`,
                        staff_id:        svc.staffId,
                        staff_name:      svc.staffName,
                        booking_date:    bookingDate.value,
                        start_time:      startTimeStr,
                        end_time:        endTimeStr,
                        duration:        svcDuration,
                        notes:           bookingNotes?.value.trim() || '',
                        price:           Number(svc.price) || 0,
                        status:          'booked',
                        booking_type:    'walk-in'
                    });
                });
            }
        });

        return payloads;
    }

    // ── Create bookings via atomic RPC ──────────────────────────────
    async function createBookings(payloads) {
        try {
            console.log('[createBookings] payloads:', payloads);
            const totalPrice = payloads.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

            // Build services array for RPC
            const services = payloads.map(p => ({
                service_id:   p.service_id,
                package_id:   p.package_id || null,
                staff_id:     p.staff_id,
                service_name: p.service_name,
                staff_name:   p.staff_name,
                start_time:   p.start_time,
                end_time:     p.end_time || null,
                price:        Number(p.price) || 0,
                booking_status: p.booking_status || 'booked'
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
        const originalText = btnConfirmBooking.textContent;
        btnConfirmBooking.textContent = 'Saving...';
        btnConfirmBooking.disabled    = true;

        // ── EDIT MODE ──────────────────────────────────────────────
        if (editModeBookingId) {
            try {
                // Build services array from selectedBookingItems
                let currentMins = bookingTime?.value
                    ? timeToMins(bookingTime.value)
                    : 0;

                const services = [];
                const currentStatus = editModeBookingData?.booking_status || 'booked';

                for (const item of selectedBookingItems) {
                    if (item.type === 'service') {
                        const dur          = parseInt(item.duration) || 0;
                        const startTimeStr = minsToTime24(currentMins);
                        const endTimeStr   = minsToTime24(currentMins + dur);
                        currentMins       += dur;
                        services.push({
                            service_id:   item.id,
                            package_id:   null,
                            staff_id:     item.staffId   || '',
                            service_name: item.name      || '',
                            staff_name:   item.staffName || '',
                            start_time:   startTimeStr,
                            end_time:     endTimeStr,
                            price:        Number(item.price) || 0,
                            status:       currentStatus
                        });
                    } else if (item.type === 'package') {
                        const incServices = Array.isArray(item.services) ? item.services : [];
                        for (const svc of incServices) {
                            const dur          = parseInt(svc.duration) || 0;
                            const startTimeStr = minsToTime24(currentMins);
                            const endTimeStr   = minsToTime24(currentMins + dur);
                            currentMins       += dur;
                            services.push({
                                service_id:   svc.serviceId,
                                package_id:   svc.packageId || item.packageId || null,
                                staff_id:     svc.staffId   || '',
                                service_name: `${svc.serviceName} (${item.packageName || item.name})`,
                                staff_name:   svc.staffName || '',
                                start_time:   startTimeStr,
                                end_time:     endTimeStr,
                                price:        Number(svc.price) || 0,
                                status:       currentStatus
                            });
                        }
                    }
                }

                const { error: updateErr } = await supabase.rpc('update_booking_atomic', {
                    p_booking_id:   editModeBookingId,
                    p_company_id:   getCompanyId(),
                    p_branch_id:    getBranchId(),
                    p_booking_date: bookingDate?.value || '',
                    p_start_time:   bookingTime?.value || '',
                    p_notes:        bookingNotes?.value?.trim() || null,
                    p_status:       currentStatus,
                    p_services:     services
                });

                if (updateErr) throw updateErr;

                if (window.toast) window.toast('Booking updated successfully!');
                try {
                    if (typeof window.fetchBookings === 'function') await window.fetchBookings();
                } catch (refreshErr) {
                    console.warn('[EditModal] fetchBookings refresh error:', refreshErr);
                }
                try {
                    if (typeof window.refreshAllData === 'function') {
                        window.refreshAllData(getBranchId());
                    }
                } catch (dashErr) {
                    console.warn('[EditModal] Dashboard refresh error:', dashErr);
                }
                closeModal();
            } catch (err) {
                console.error('[updateBooking] exception:', err);
                if (window.toast) window.toast('Error updating booking: ' + err.message, 'error');
                else showMsg('Error updating booking: ' + err.message, true);
            } finally {
                btnConfirmBooking.textContent = originalText;
                btnConfirmBooking.disabled    = false;
            }
            return;
        }

        // ── CREATE MODE (existing flow) ────────────────────────────
        let targetName = customerName?.value.trim();
        let targetId   = selectedCustomerId;
        const groupBookingId = generateUUID();

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
                const { data: createdCust, error: custErr } = await supabase.rpc('create_customer_atomic', {
                    p_company_id:     getCompanyId(),
                    p_branch_id:      getBranchId(),
                    p_customer_name:  targetName || 'Unknown Customer',
                    p_customer_phone: typedPhone,
                    p_customer_email: customerEmail?.value.trim() || null
                });

                if (custErr) throw custErr;
                if (createdCust && createdCust.customer_id) {
                    targetId = createdCust.customer_id;
                    if (window.liveCustomersDB) window.liveCustomersDB.push(createdCust);
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
            const { data: existing, error: bErr } = await supabase.schema('app')
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
    window.openGlobalBookingModal     = openModal;
    window.openGlobalEditBookingModal = openEditModal;

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

