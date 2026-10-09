import { supabase } from './lib/supabase.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';
import { applySubFeatureGates } from './scripts/sub-features/sub-feature-gate.js';
import './scripts/global-customer-profile-modal.js';

// DOM Elements
const customersTableBody = document.getElementById('customersTableBody');
const customerSearchInput = document.getElementById('customerSearch');
// Note: btnAddCustomer open/close is handled by global-customer-modal.js
const btnSaveCustomer = document.getElementById('btnSaveNewCustomer');
const modalOverlay = document.getElementById('addCustomerModalOverlay');
const addCustomerModalWrapper = document.getElementById('addCustomerModal');
const modalTitle = addCustomerModalWrapper?.querySelector('.header-titles h2');
const modalSubtitle = addCustomerModalWrapper?.querySelector('.header-titles .subtitle');

// Form inputs
const inputName = document.getElementById('newCustName');
const inputPhone = document.getElementById('newCustPhone');
const inputEmail = document.getElementById('newCustEmail');
const inputDob = document.getElementById('newCustDob');
const inputTag = document.getElementById('newCustTag');
const inputNotes = document.getElementById('newCustNotes');

// -- PAGINATION & QUERY STATE --
let customersList    = [];   // current page's 25 rows only
let editingCustomerId = null;
let activeFilter  = 'all';
let searchQuery   = '';
let currentPage   = 1;
const PAGE_SIZE   = 25;
let totalRecords  = 0;

function getCompanyId() { return localStorage.getItem('company_id') || null; }
function getBranchId()  { return localStorage.getItem('active_branch_id') || null; }

// -- DEBOUNCE UTILITY --
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// -- INITIALIZE --
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchCustomers);
} else {
    fetchCustomers();
}

// -- SEARCH LISTENER (debounced 300ms, server-side) --
if (customerSearchInput) {
    customerSearchInput.addEventListener('input', debounce((e) => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        fetchCustomers();
    }, 300));
}

// -- FILTER HANDLER (server-side, exposed to HTML) --
function applyCustomerFilter(tag) {
    activeFilter = tag;
    searchQuery  = '';
    currentPage  = 1;
    // Clear the search box to match previous UX behaviour
    if (customerSearchInput) customerSearchInput.value = '';
    fetchCustomers();
}
window.applyCustomerFilter = applyCustomerFilter;
window.fetchCustomers = fetchCustomers;
window.refreshCustomerStatCards = refreshCustomerStatCards;

// Automatically refresh customer table and 4 stat cards when a customer is added anywhere
document.addEventListener('customer-added', () => {
    fetchCustomers();
});

// -- READ: server-side search + filter + pagination --
async function fetchCustomers() {
    try {
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">Loading customers...</td></tr>';
        }

        const companyId = getCompanyId();
        const branchId  = getBranchId();
        if (!companyId || !branchId) return;

        const start = (currentPage - 1) * PAGE_SIZE;
        const end   = start + PAGE_SIZE - 1;

        // Required fields only (no profile_photo — not in schema)
        const FIELDS = 'customer_id,company_id,branch_id,customer_name,customer_phone,customer_email,dob,tags,total_spent,last_visit,notes,status,created_at,updated_at';

        // Build base query
        let query = supabase
            .from('customers')
            .select(FIELDS, { count: 'exact' })
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted');

        // Server-side search (applied BEFORE filter and pagination)
        if (searchQuery) {
            // Strip parenthesis and commas which delimit PostgREST or=(...) expressions
            const cleanQ = searchQuery.replace(/[\(\),]/g, ' ').trim();
            if (cleanQ) {
                const encoded = encodeURIComponent(cleanQ);
                query = query.or(`customer_name.ilike.*${encoded}*,customer_phone.ilike.*${encoded}*`);
            }
        }

        // Server-side filter (applied BEFORE pagination)
        const now = new Date();
        if (activeFilter === 'vip') {
            query = query.ilike('tags', 'vip');
        } else if (activeFilter === 'regular') {
            query = query.ilike('tags', 'regular');
        } else if (activeFilter === 'new') {
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);
            query = query.gte('created_at', d30.toISOString());
        } else if (activeFilter === 'inactive') {
            const d90date = new Date(now);
            d90date.setDate(d90date.getDate() - 90);
            const d90iso  = d90date.toISOString();
            const d90date_only = d90date.toISOString().split('T')[0]; // YYYY-MM-DD for last_visit (date column)
            // last_visit exists and is older than 90 days, OR last_visit is null and created_at is older than 90 days
            query = query.or(`last_visit.lt.${d90date_only},and(last_visit.is.null,created_at.lt.${d90iso})`);
        }

        // Deterministic ordering + server-side window
        const { data, count, error } = await query
            .order('customer_name', { ascending: true })
            .order('customer_id',   { ascending: true })
            .range(start, end);

        if (error) throw error;

        totalRecords  = count ?? 0;
        customersList = (data || []).map(c => ({
            ...c,
            customer_name:  c.customer_name  || c.name,
            customer_phone: c.customer_phone || c.phone,
            customer_email: c.customer_email || c.email,
            last_visit:     c.last_visit     || null,
            total_spent:    c.total_spent    != null ? c.total_spent : 0
        }));

        // Guard: if current page is now beyond total pages (e.g. after deletion), go to last valid page
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE) || 1;
        if (currentPage > totalPages) {
            currentPage = totalPages;
            await fetchCustomers();
            return;
        }

        renderCustomers();
        renderPagination();

        // Refresh 4 stat cards from RPC
        await refreshCustomerStatCards();

    } catch (err) {
        console.error('Error fetching customers:', err);
        if (customersTableBody) {
            customersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-rose" style="text-align:center; color: #e11d48;"><b>Failed to load customers:</b><br>${err.message}</td></tr>`;
        }
        renderPagination(); // hide pagination on error
    }
}

// -- STAT CARDS (RPC: customers_page__four_statcards) --
async function refreshCustomerStatCards() {
    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();
        if (!companyId || !branchId) return;

        const { data: statsData, error: statsError } = await supabase.rpc('customers_page__four_statcards', {
            p_company_id: companyId,
            p_branch_id:  branchId
        });
        if (statsError) {
            console.error('Stat cards error:', statsError);
            return;
        }
        const stats = Array.isArray(statsData) ? statsData[0] : statsData;
        const { total_customers, new_this_month, vip_customers, inactive_customers } = stats || {};

        const elTotal    = document.getElementById('statTotalCustomers');
        const elNew      = document.getElementById('statNewThisMonth');
        const elVip      = document.getElementById('statVipCustomers');
        const elInactive = document.getElementById('statInactiveDays');
        if (elTotal)    elTotal.textContent    = total_customers    ?? 0;
        if (elNew)      elNew.textContent      = new_this_month     ?? 0;
        if (elVip)      elVip.textContent      = vip_customers      ?? 0;
        if (elInactive) elInactive.textContent = inactive_customers ?? 0;

        // Hide trends (rely on advanced analytics not yet implemented)
        updateTrend('trendTotalCustomers', null);
        updateTrend('trendNewThisMonth',   null);
        updateTrend('trendVipCustomers',   null);
        updateTrend('trendInactiveDays',   null);
    } catch (err) {
        console.error('Error refreshing stat cards:', err);
    }
}

// -- PAGINATION UI --
function renderPagination() {
    const footer = document.getElementById('customersPaginationFooter');
    if (!footer) return;

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE) || 1;

    // Hide completely when all results fit on one page
    if (totalRecords <= PAGE_SIZE) {
        footer.style.display = 'none';
        return;
    }

    footer.style.display = 'flex';

    const rangeStart = Math.min((currentPage - 1) * PAGE_SIZE + 1, totalRecords);
    const rangeEnd   = Math.min(currentPage * PAGE_SIZE, totalRecords);

    const showingEl  = document.getElementById('custPageShowing');
    const pageInfoEl = document.getElementById('custPageInfo');
    const btnPrev    = document.getElementById('custBtnPrev');
    const btnNext    = document.getElementById('custBtnNext');

    if (showingEl)  showingEl.textContent  = `Showing ${rangeStart}–${rangeEnd} of ${totalRecords} customers`;
    if (pageInfoEl) pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;

    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;
}

function updateTrend(elementId, changeValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (changeValue === null || changeValue === undefined) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'none';
}

// -- TABLE RENDERING --
function renderCustomers() {
    if (!customersTableBody) return;
    customersTableBody.innerHTML = '';

    if (customersList.length === 0) {
        customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">No customers found.</td></tr>';
        return;
    }

    customersList.forEach(customer => {
        const tr = document.createElement('tr');

        const name  = customer.customer_name  || 'Unknown';
        const phone = customer.customer_phone || 'N/A';
        const email = customer.customer_email || '-';
        const tag   = (customer.tags || 'regular').toLowerCase();

        let joinedDate = 'Recently';
        if (customer.created_at) {
            const dateObj = new Date(customer.created_at);
            const d = String(dateObj.getDate()).padStart(2, '0');
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const y = dateObj.getFullYear();
            joinedDate = `${d}-${m}-${y}`;
        }

        const totalSpent = customer.total_spent != null ? customer.total_spent : 0;
        let lastVisit = '-';
        let lastVisitDay = '';
        if (customer.last_visit) {
            const dateObj = new Date(customer.last_visit);
            const d = String(dateObj.getDate()).padStart(2, '0');
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const y = dateObj.getFullYear();
            lastVisit = `${d}-${m}-${y}`;
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            lastVisitDay = days[dateObj.getDay()];
        }

        // Avatar: ui-avatars fallback (profile_photo column does not exist in schema)
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c7d2fe&color=3730A3`;
        const hasNotes = Boolean(customer.notes && customer.notes.trim());

        let tagHtml = '';
        if (tag === 'vip') {
            tagHtml = `<span class="status-badge bg-amber-light text-amber" style="padding: 4px 8px;"><i data-feather="star" style="width:12px; height:12px; margin-right:4px;"></i>VIP</span>`;
        } else if (tag === 'new') {
            tagHtml = `<span class="status-badge bg-emerald-light text-emerald" style="padding: 4px 8px;">New</span>`;
        } else if (tag === 'regular') {
            tagHtml = `<span class="status-badge bg-blue-light text-blue" style="padding: 4px 8px;">Regular</span>`;
        } else {
            tagHtml = `<span class="status-badge" style="background-color: #f1f5f9; color: #64748b; padding: 4px 8px;">${tag}</span>`;
        }

        tr.innerHTML = `
            <td>
                <div class="customer-info" style="display:flex; align-items:center; gap:0.9rem;">
                    <div class="avatar-sm" style="width:40px; height:40px; border-radius:50%; overflow:hidden; flex-shrink:0;">
                        <img src="${avatarUrl}" alt="${name}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div>
                        <span class="customer-link" data-customer-id="${customer.customer_id || customer.id}" data-customer-name="${name.replace(/"/g, '&quot;')}" style="font-weight:600; cursor:pointer;">${name}</span>
                        <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">Joined ${joinedDate}</p>
                    </div>
                    ${hasNotes ? `
                        <button type="button" class="btn-customer-notes" data-customer-id="${customer.customer_id || customer.id}" title="View Note" aria-label="View note for ${name}">
                            <i data-feather="file-text"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
            <td>
                <p class="text-sm" style="margin:0; font-size:0.875rem;">${phone}</p>
                <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">${email}</p>
            </td>
            <td>
                <button class="total-spent-btn" data-customer-id="${customer.customer_id || customer.id}" title="View spending breakdown">
                    ₹${totalSpent}
                </button>
            </td>
            <td>
                <p class="text-sm" style="margin:0; font-weight:500; font-size:0.875rem; color:#0f172a;">${lastVisit}</p>
                ${lastVisitDay ? `<p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">${lastVisitDay}</p>` : ''}
            </td>
            <td>${tagHtml}</td>
            <td style="vertical-align:middle;">
                <div class="action-buttons" style="display:flex; justify-content:flex-start; gap:0.5rem;">
                    <button class="btn-edit hover-lift" data-id="${customer.customer_id}" data-sub-feature="${SUB_FEATURES.CUSTOMER_EDIT}" title="Edit Customer" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #e0e7ff; background:#eff6ff; cursor:pointer; color:#3b82f6; transition:all 0.2s; min-width: 52px;">
                        <i data-feather="edit-2" style="width:16px; height:16px; margin-bottom:2px;"></i>
                        <span style="font-size:10px; font-weight:600;">Edit</span>
                    </button>
                    <button class="btn-delete flex-shrink-0 hover-lift" data-id="${customer.customer_id}" data-sub-feature="${SUB_FEATURES.CUSTOMER_DELETE}" title="Delete Customer" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4px 8px; border-radius:8px; border:1px solid #fee2e2; background:#fef2f2; cursor:pointer; color:#ef4444; transition:all 0.2s; min-width: 52px;">
                        <i data-feather="trash-2" style="width:16px; height:16px; margin-bottom:2px;"></i>
                        <span style="font-size:10px; font-weight:600;">Delete</span>
                    </button>
                </div>
            </td>
        `;
        customersTableBody.appendChild(tr);
    });

    if (window.feather) {
        feather.replace();
    }

    // Attach event listeners for edit and delete
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const customerId = e.currentTarget.getAttribute('data-id');
            openEditModal(customerId);
        });
    });

    const deleteOverlay    = document.getElementById('deleteConfirmOverlay');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete  = document.getElementById('btnCancelDelete');
    let pendingDeleteId = null;

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            pendingDeleteId = e.currentTarget.getAttribute('data-id');
            if (deleteOverlay) {
                deleteOverlay.classList.add('active');
                if (window.feather) feather.replace();
            }
        });
    });

    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            pendingDeleteId = null;
            if (deleteOverlay) deleteOverlay.classList.remove('active');
        });
    }

    const deletingOverlay = document.getElementById('deletingCustomerOverlay');

    if (btnConfirmDelete) {
        // Remove existing listeners by cloning
        const newConfirmBtn = btnConfirmDelete.cloneNode(true);
        btnConfirmDelete.parentNode.replaceChild(newConfirmBtn, btnConfirmDelete);

        newConfirmBtn.addEventListener('click', async () => {
            if (pendingDeleteId) {
                if (deleteOverlay) deleteOverlay.classList.remove('active');
                if (deletingOverlay) deletingOverlay.classList.add('active');
                await deleteCustomer(pendingDeleteId);
                pendingDeleteId = null;
                if (deletingOverlay) deletingOverlay.classList.remove('active');
            }
        });
    }

    if (deleteOverlay) {
        deleteOverlay.addEventListener('click', (e) => {
            if (e.target === deleteOverlay) {
                pendingDeleteId = null;
                deleteOverlay.classList.remove('active');
            }
        });
    }

    // Attach spending breakdown listeners
    document.querySelectorAll('.total-spent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const customerId = e.currentTarget.getAttribute('data-customer-id');
            openSpendingModal(customerId);
        });
    });

    // Attach customer notes modal listeners
    document.querySelectorAll('.btn-customer-notes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const customerId = e.currentTarget.getAttribute('data-customer-id');
            openCustomerNoteModal(customerId);
        });
    });

    // Attach customer profile modal listeners (identical to bookings page)
    document.querySelectorAll('.customer-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const customerId = e.currentTarget.getAttribute('data-customer-id');
            const customerName = e.currentTarget.getAttribute('data-customer-name') || e.currentTarget.textContent.trim();
            if (typeof window.viewCustomerProfile === 'function') {
                window.viewCustomerProfile(customerId, customerName);
            }
        });
    });

    try {
        if (typeof applySubFeatureGates === 'function') {
            applySubFeatureGates();
        }
    } catch(e) {}
}

// -- CUSTOMER NOTE MODAL (VIEW ONLY) --
function openCustomerNoteModal(customerId) {
    const customer = customersList.find(c => String(c.customer_id || c.id) === String(customerId));
    if (!customer) return;

    const overlay = document.getElementById('customerNoteModalOverlay');
    const nameEl  = document.getElementById('noteModalCustomerName');
    const textEl  = document.getElementById('noteModalTextContent');

    if (nameEl) nameEl.textContent = customer.customer_name ? `${customer.customer_name}'s Note` : 'Customer Note';
    if (textEl) textEl.textContent = customer.notes || '';

    if (overlay) {
        overlay.classList.add('active');
        if (window.feather) feather.replace();
    }
}

function closeCustomerNoteModal() {
    const overlay = document.getElementById('customerNoteModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

// Wire customer note modal close handlers
document.getElementById('btnCloseNoteModalX')?.addEventListener('click', closeCustomerNoteModal);
document.getElementById('btnCloseNoteModalBtn')?.addEventListener('click', closeCustomerNoteModal);
document.getElementById('customerNoteModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'customerNoteModalOverlay') closeCustomerNoteModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCustomerNoteModal();
});

// -- PAGINATION EVENT LISTENERS (attached once on load) --
document.addEventListener('DOMContentLoaded', () => {
    const btnPrev = document.getElementById('custBtnPrev');
    const btnNext = document.getElementById('custBtnNext');

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                fetchCustomers();
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const totalPages = Math.ceil(totalRecords / PAGE_SIZE) || 1;
            if (currentPage < totalPages) {
                currentPage++;
                fetchCustomers();
            }
        });
    }
});

// -- MODAL HANDLING --
function openModalForCreate() {
    editingCustomerId = null;
    if (modalTitle)    modalTitle.textContent    = 'Add New Customer';
    if (modalSubtitle) modalSubtitle.textContent = 'Enter the details to create a new client profile.';
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Save Customer';

    if (inputName)  inputName.value  = '';
    if (inputPhone) inputPhone.value = '';
    if (inputEmail) inputEmail.value = '';
    if (inputDob)   inputDob.value   = '';
    if (inputTag)   inputTag.value   = 'new';
    if (inputNotes) inputNotes.value = '';

    if (modalOverlay) modalOverlay.classList.add('active');
}

function openEditModal(id) {
    const customer = customersList.find(c => String(c.customer_id) === String(id));
    if (!customer) return;

    editingCustomerId = customer.customer_id;
    if (modalTitle)    modalTitle.textContent    = 'Edit Customer';
    if (modalSubtitle) modalSubtitle.textContent = 'Update the client profile details.';
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Update Customer';

    if (inputName)  inputName.value  = customer.customer_name  || '';
    if (inputPhone) inputPhone.value = customer.customer_phone || '';
    if (inputEmail) inputEmail.value = customer.customer_email || '';
    if (inputDob)   inputDob.value   = customer.dob            || '';
    if (inputTag)   inputTag.value   = (customer.tags || 'regular').toLowerCase();
    if (inputNotes) inputNotes.value = customer.notes || '';

    if (modalOverlay) modalOverlay.classList.add('active');
}

function closeModal() {
    editingCustomerId = null;
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Save Customer';
    if (modalOverlay) modalOverlay.classList.remove('active');
}

document.getElementById('closeAddCustomerModal')?.addEventListener('click', closeModal);
document.getElementById('btnCancelAddCustomer')?.addEventListener('click', closeModal);

const btnAddCustomerEl = document.getElementById('btnAddCustomer');
if (btnAddCustomerEl) {
    btnAddCustomerEl.addEventListener('click', () => {
        editingCustomerId = null;
        if (modalTitle)    modalTitle.textContent    = 'Add New Customer';
        if (modalSubtitle) modalSubtitle.textContent = 'Enter the details to create a new client profile.';
        if (btnSaveCustomer) btnSaveCustomer.textContent = 'Save Customer';
    });
}

// Note: btnAddCustomer click is handled by global-customer-modal.js (via customers.html inline script)

// -- UPDATE ONLY (Create is owned exclusively by global-customer-modal.js) --
if (btnSaveCustomer) {
    btnSaveCustomer.addEventListener('click', async () => {
        // If not in edit mode, customers.js must NOT create or insert a customer.
        if (!editingCustomerId) {
            return;
        }

        const name  = inputName  ? inputName.value.trim()  : '';
        const phone = inputPhone ? inputPhone.value.trim() : '';
        const email = inputEmail ? inputEmail.value.trim() : '';
        const dob   = inputDob && inputDob.value ? inputDob.value : null;
        const tag   = inputTag ? inputTag.value : '';

        if (!name || !phone) {
            showToast('Name and Phone are required.', true);
            return;
        }

        const digitsOnly = phone.replace(/\D/g, '');
        if (!/^[0-9]{10}$/.test(digitsOnly)) {
            showToast('Phone number must be exactly 10 digits.', true);
            return;
        }

        const companyId = getCompanyId();
        const branchId  = getBranchId();

        if (!companyId || !branchId) {
            showToast('Missing company or branch context.', true);
            return;
        }

        const { data: dupeData, error: dupeErr } = await supabase
            .from('customers')
            .select('customer_id')
            .eq('company_id', companyId)
            .eq('customer_phone', digitsOnly)
            .neq('customer_id', editingCustomerId)
            .neq('status', 'deleted');

        if (dupeErr) {
            console.error('Duplicate check error:', dupeErr);
        } else if (dupeData && dupeData.length > 0) {
            showToast('A customer with this phone number already exists.', true);
            return;
        }

        const payload = {
            customer_name:   name,
            customer_phone:  digitsOnly,
            customer_email:  email,
            tags:            tag,
            notes:           inputNotes ? inputNotes.value.trim() : '',
            updated_at:      'now'
        };
        if (dob) {
            payload.dob = dob;
        }

        const originalText = btnSaveCustomer.textContent;
        btnSaveCustomer.textContent = 'Updating...';
        btnSaveCustomer.disabled    = true;

        try {
            const { error: updateErr } = await supabase
                .from('customers')
                .update(payload)
                .eq('customer_id', editingCustomerId)
                .eq('company_id', companyId)
                .eq('branch_id', branchId);

            if (updateErr) throw updateErr;

            closeModal();
            showToast('Customer updated successfully!');
            if (window.notifyEvent) {
                window.notifyEvent('customers', 'evt_customer_updated', {
                    title:   'Customer Profile Updated',
                    message: `${name}'s profile was updated.`
                });
            }
            await fetchCustomers(); // Refresh current page
        } catch (err) {
            console.error('Error saving customer:', err);
            showToast(err.message || 'Failed to save customer. Please try again.', true);
        } finally {
            btnSaveCustomer.textContent = originalText;
            btnSaveCustomer.disabled    = false;
        }
    });
}

// Note: Cancel and close are handled by global-customer-modal.js

// -- DELETE --
async function deleteCustomer(id) {
    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        if (!companyId || !branchId) {
            showToast('Missing company or branch context.', true);
            return false;
        }

        const { error } = await supabase
            .from('customers')
            .update({ status: 'deleted', updated_at: 'now' })
            .eq('customer_id', id)
            .eq('company_id', companyId)
            .eq('branch_id', branchId);

        if (error) throw error;

        showToast('Customer deleted successfully.');
        if (window.notifyEvent) {
            window.notifyEvent('customers', 'evt_customer_deleted', {
                title:   'Customer Deleted',
                message: 'A customer profile was deleted.'
            });
        }
        // fetchCustomers handles page-guard: if current page becomes empty it backs to last valid page
        await fetchCustomers();
        return true;
    } catch (err) {
        console.error('Error deleting customer:', err);
        showToast('Failed to delete customer. Ensure they have no active bookings.', true);
        return false;
    }
}

// -- SPENDING BREAKDOWN MODAL (unchanged — uses customers_page_clickable_total_spent RPC) --
async function openSpendingModal(customerId) {
    const overlay  = document.getElementById('spendingBreakdownOverlay');
    const loading  = document.getElementById('sbdLoading');
    const content  = document.getElementById('sbdContent');
    const closeBtn = document.getElementById('closeSpendingModal');

    if (!overlay) return;

    loading.innerHTML = `
        <div class="sbd-spinner"></div>
        <span class="sbd-loading-text">Fetching breakdown...</span>
    `;
    loading.style.display = 'flex';
    content.style.display = 'none';
    overlay.classList.add('active');

    const closeModal = () => overlay.classList.remove('active');
    closeBtn.onclick = closeModal;
    overlay.onclick  = (e) => { if (e.target === overlay) closeModal(); };

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        const { data, error } = await supabase.rpc(
            'customers_page_clickable_total_spent',
            {
                p_company_id: companyId,
                p_branch_id:  branchId,
                p_customer_id: customerId
            }
        );

        if (error) throw error;

        const breakdown       = data?.[0];
        const servicesTotal   = Number(breakdown?.services_total   ?? 0);
        const productsTotal   = Number(breakdown?.products_total   ?? 0);
        const membershipsTotal = Number(breakdown?.memberships_total ?? 0);
        const grandTotal      = Number(breakdown?.grand_total      ?? 0);

        document.getElementById('sbdServices').textContent    = `₹${servicesTotal.toLocaleString('en-IN')}`;
        document.getElementById('sbdProducts').textContent    = `₹${productsTotal.toLocaleString('en-IN')}`;
        document.getElementById('sbdMemberships').textContent = `₹${membershipsTotal.toLocaleString('en-IN')}`;
        document.getElementById('sbdTotal').textContent       = `₹${grandTotal.toLocaleString('en-IN')}`;

        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (err) {
        console.error('Spending breakdown error:', err);
        loading.innerHTML = `<span style="color:#ef4444; font-size:0.85rem;">Failed to load breakdown.</span>`;
    }
}

// -- TOAST --
function showToast(msg, isError = false) {
    let t = document.getElementById('toastNotification');
    if (!t) {
        document.body.insertAdjacentHTML('beforeend', '<div id="toastNotification" class="toast-notification"></div>');
        t = document.getElementById('toastNotification');
    }
    t.textContent = msg;
    t.className   = 'toast-notification show';
    t.style.background = isError ? '#ef4444' : '#10b981';
    setTimeout(() => {
        t.className        = 'toast-notification';
        t.style.background = '';
    }, 3500);
}

// =====================================================================
// DOWNLOAD CUSTOMERS AS EXCEL (.xlsx)
// =====================================================================
(function initDownloadButton() {
    const btn = document.getElementById('btnDownloadCustomers');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        // Guard: SheetJS must be loaded
        if (typeof XLSX === 'undefined') {
            showToast('Excel library not loaded. Please refresh and try again.', true);
            return;
        }

        const companyId = getCompanyId();
        const branchId  = getBranchId();
        if (!companyId || !branchId) {
            showToast('Company/branch not found. Please re-login.', true);
            return;
        }

        // Disable button while fetching
        btn.disabled = true;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
            <svg class="download-btn-icon" style="animation: sbd-spin 0.65s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span>Downloading…</span>
        `;

        try {
            // Fetch ALL active customers (no pagination limit)
            const FIELDS = 'customer_name,created_at,customer_phone,customer_email,total_spent,last_visit,tags,status';
            const { data, error } = await supabase
                .from('customers')
                .select(FIELDS)
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .neq('status', 'deleted')
                .order('customer_name', { ascending: true });

            if (error) throw error;

            if (!data || data.length === 0) {
                showToast('No customers to download.', true);
                return;
            }

            // Format helper
            const fmtDate = (val) => {
                if (!val) return '-';
                const d = new Date(val);
                if (isNaN(d.getTime())) return '-';
                return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            };

            const fmtCurrency = (val) => {
                const n = Number(val ?? 0);
                return `₹${n.toLocaleString('en-IN')}`;
            };

            // Build rows
            const rows = data.map(c => ({
                'Customer Name':  c.customer_name || '-',
                'Joined Date':    fmtDate(c.created_at),
                'Phone Number':   c.customer_phone || '-',
                'Email':          c.customer_email || '-',
                'Total Spent':    fmtCurrency(c.total_spent),
                'Last Visit':     fmtDate(c.last_visit),
                'Tags / Status':  c.tags || c.status || '-'
            }));

            // Create workbook + sheet
            const ws = XLSX.utils.json_to_sheet(rows);

            // Auto-fit column widths
            const colKeys = Object.keys(rows[0]);
            ws['!cols'] = colKeys.map((key) => {
                let maxLen = key.length;
                rows.forEach(row => {
                    const cellLen = String(row[key] || '').length;
                    if (cellLen > maxLen) maxLen = cellLen;
                });
                return { wch: Math.min(maxLen + 4, 40) };
            });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Customers');

            // Generate filename with today's date
            const today = new Date().toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            }).replace(/ /g, '-');
            const filename = `Customers_${today}.xlsx`;

            // Trigger download
            XLSX.writeFile(wb, filename);

            showToast(`Downloaded ${data.length} customers ✓`);

        } catch (err) {
            console.error('Customer download error:', err);
            showToast('Failed to download customers. Try again.', true);
        } finally {
            btn.disabled  = false;
            btn.innerHTML = originalHTML;
            // Re-render feather icons inside the restored button
            if (typeof feather !== 'undefined') feather.replace({ 'stroke-width': 2 });
        }
    });
})();
