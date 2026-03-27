import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';
import { applySubFeatureGates } from './scripts/sub-features/sub-feature-gate.js';

// DOM Elements
const customersTableBody = document.getElementById('customersTableBody');
const customerSearchInput = document.getElementById('customerSearch');
const btnAddCustomer = document.getElementById('btnAddCustomer');
const btnCancelAddCustomer = document.getElementById('btnCancelAddCustomer');
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

let customersList = [];
let editingCustomerId = null;

// Extractor helper
function getCompanyId() {
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        return appContext.company?.id || null;
    } catch (e) {
        return null;
    }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchCustomers);
} else {
    fetchCustomers();
}

if (customerSearchInput) {
    customerSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderCustomers(customersList);
            return;
        }

        const filtered = customersList.filter(c => {
            const name = (c.customer_name || '').toLowerCase();
            const phone = String(c.customer_phone || '').toLowerCase();
            return name.includes(query) || phone.includes(query);
        });

        renderCustomers(filtered);
    });
}

// -- READ --
async function fetchCustomers() {
    try {
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">Loading customers...</td></tr>';
        }
        
        const payload = { 
            company_id: getCompanyId(), 
            branch_id: getBranchId() 
        };
        
        const response = await fetchWithAuth(API.READ_CUSTOMERS, { 
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.CUSTOMERS_MANAGEMENT, 'read');

        if (!response.ok) throw new Error('Failed to fetch customers');

        const data = await response.json();
        // API returns [{total_customers, new_this_month, vip_customers, inactive_90_days, customers:[...]}]
        const root = Array.isArray(data) ? data[0] : data;
        customersList = root.customers || [];

        // Hydrate stat cards
        const elTotal    = document.getElementById('statTotalCustomers');
        const elNew      = document.getElementById('statNewThisMonth');
        const elVip      = document.getElementById('statVipCustomers');
        const elInactive = document.getElementById('statInactiveDays');
        if (elTotal)    elTotal.textContent    = root.total_customers    ?? '0';
        if (elNew)      elNew.textContent      = root.new_this_month     ?? '0';
        if (elVip)      elVip.textContent      = root.vip_customers      ?? '0';
        if (elInactive) elInactive.textContent = root.inactive_90_days   ?? '0';

        // Hydrate stat trends
        updateTrend('trendTotalCustomers', root.total_customers_change);
        updateTrend('trendNewThisMonth', root.new_this_month_change);
        updateTrend('trendVipCustomers', root.vip_customers_change);
        updateTrend('trendInactiveDays', root.inactive_90_days_change);

        renderCustomers();
    } catch (error) {
        console.error('Error fetching customers:', error);
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-rose" style="text-align:center; color: #e11d48;">Failed to load customers.</td></tr>';
        }
    }
}

function updateTrend(elementId, changeValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const val = parseFloat(changeValue);
    if (isNaN(val)) {
        el.style.display = 'none';
        return;
    }
    
    el.style.display = '';
    
    let icon = 'minus';
    let text = '0% from last month';
    let cn = 'stat-trend neutral';
    
    if (val > 0) {
        icon = 'trending-up';
        text = `+${val}% from last month`;
        cn = 'stat-trend positive';
    } else if (val < 0) {
        icon = 'trending-down';
        text = `${val}% from last month`;
        cn = 'stat-trend negative';
    }
    
    el.className = cn;
    el.innerHTML = `<i data-feather="${icon}"></i><span>${text}</span>`;
    
    if (window.feather) {
        feather.replace();
    }
}

function renderCustomers(listToRender = customersList) {
    if (!customersTableBody) return;
    customersTableBody.innerHTML = '';
    
    if (listToRender.length === 0) {
        customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">No customers found.</td></tr>';
        return;
    }

    listToRender.forEach(customer => {
        const tr = document.createElement('tr');
        
        // Map API field names → local variables
        const name  = customer.customer_name  || 'Unknown';
        const phone = customer.customer_phone || 'N/A';
        const email = customer.customer_email || '-';
        const tag   = (customer.tags || 'regular').toLowerCase();
        const joinedDate = customer.created_at || 'Recently';
        const totalSpent    = customer.total_spent    != null ? customer.total_spent    : 0;
        const totalBookings = customer.total_bookings != null ? customer.total_bookings : 0;
        const lastVisit = customer.last_visit || '-';

        // Avatar generation
        const avatarUrl = customer.profile_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c7d2fe&color=3730A3`;
        
        // Setup Tag HTML
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
                <div class="customer-info" style="display:flex; align-items:center; gap:1rem;">
                    <div class="avatar-sm" style="width:40px; height:40px; border-radius:50%; overflow:hidden;">
                        <img src="${avatarUrl}" alt="${name}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div>
                        <a href="#" class="text-main fw-600 customer-name-link" style="color:#0f172a; font-weight:600; text-decoration:none;">${name}</a>
                        <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">Joined ${joinedDate}</p>
                    </div>
                </div>
            </td>
            <td>
                <p class="text-sm" style="margin:0; font-size:0.875rem;">${phone}</p>
                <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">${email}</p>
            </td>
            <td>
                <p class="text-main fw-600" style="margin:0; font-weight:600; color:#0f172a;">₹${totalSpent}</p>
                <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">${totalBookings} Bookings</p>
            </td>
            <td>
                <p class="text-sm" style="margin:0; font-size:0.875rem;">${lastVisit}</p>
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

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const customerId = e.currentTarget.getAttribute('data-id');
            deleteCustomer(customerId);
        });
    });

    try {
        if (typeof applySubFeatureGates === 'function') {
            applySubFeatureGates();
        }
    } catch(e) {}
}

// -- MODAL HANDLING --
function openModalForCreate() {
    editingCustomerId = null;
    if (modalTitle) modalTitle.textContent = 'Add New Customer';
    if (modalSubtitle) modalSubtitle.textContent = 'Enter the details to create a new client profile.';
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Save Customer';
    
    // Clear inputs
    if (inputName) inputName.value = '';
    if (inputPhone) inputPhone.value = '';
    if (inputEmail) inputEmail.value = '';
    if (inputDob) inputDob.value = '';
    if (inputTag) inputTag.value = 'new';
    
    if (modalOverlay) modalOverlay.classList.add('active');
}

function openEditModal(id) {
    const customer = customersList.find(c => String(c.customer_id) === String(id));
    if (!customer) return;

    editingCustomerId = customer.customer_id;
    if (modalTitle) modalTitle.textContent = 'Edit Customer';
    if (modalSubtitle) modalSubtitle.textContent = 'Update the client profile details.';
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Update Customer';

    // Populate inputs (map API field names)
    if (inputName) inputName.value = customer.customer_name || '';
    if (inputPhone) inputPhone.value = customer.customer_phone || '';
    if (inputEmail) inputEmail.value = customer.customer_email || '';
    if (inputDob) inputDob.value = customer.dob || '';
    if (inputTag) inputTag.value = (customer.tags || 'regular').toLowerCase();
    if (inputNotes) inputNotes.value = customer.notes || '';

    if (modalOverlay) modalOverlay.classList.add('active');
}

function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
}

// Prevent the inline inline script from running cleanly without state
if (btnAddCustomer) {
    btnAddCustomer.addEventListener('click', () => {
        openModalForCreate();
    });
}

// -- CREATE / UPDATE --
if (btnSaveCustomer) {
    btnSaveCustomer.addEventListener('click', async () => {
        const name = inputName ? inputName.value.trim() : '';
        const phone = inputPhone ? inputPhone.value.trim() : '';
        const email = inputEmail ? inputEmail.value.trim() : '';
        const dob = inputDob ? inputDob.value : '';
        const tag = inputTag ? inputTag.value : '';

        if (!name || !phone) {
            showToast('Name and Phone are required.', true);
            return;
        }

        const payload = { 
            company_id: getCompanyId(), 
            branch_id: getBranchId(),
            name, 
            phone, 
            email, 
            dob, 
            tag,
            notes: inputNotes ? inputNotes.value.trim() : ''
        };
        const isEditing = !!editingCustomerId;
        
        const apiEndpoint = isEditing ? API.UPDATE_CUSTOMER : API.CREATE_CUSTOMER;
        const actionType = isEditing ? 'update' : 'create';
        
        if (isEditing) {
            payload.id = editingCustomerId;
        }

        const originalText = btnSaveCustomer.textContent;
        btnSaveCustomer.textContent = isEditing ? 'Updating...' : 'Saving...';
        btnSaveCustomer.disabled = true;

        try {
            const response = await fetchWithAuth(apiEndpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            }, FEATURES.CUSTOMERS_MANAGEMENT, actionType);

            // Always parse the JSON body — even on non-2xx responses
            let raw = {};
            try { raw = await response.json(); } catch(e) { /* non-JSON response */ }

            // Unwrap array responses: backend may return [{...}] instead of {...}
            const result = Array.isArray(raw) ? raw[0] : raw;

            // Check for any error — from HTTP status OR business logic
            if (!response.ok || result.error || result.success === false) {
                showToast(result.error || 'Failed to save customer. Please try again.', true);
                return; // Keep modal open
            }

            closeModal();
            showToast(isEditing ? 'Customer updated successfully!' : 'Customer created successfully!');
            await fetchCustomers(); // Refresh the list
        } catch (error) {
            console.error('Error saving customer:', error);
            showToast('A network error occurred. Please try again.', true);
        } finally {
            btnSaveCustomer.textContent = originalText;
            btnSaveCustomer.disabled = false;
        }
    });
}

// -- DELETE --
async function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
        return;
    }

    try {
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            id: parseInt(id, 10)
        };
        const response = await fetchWithAuth(API.DELETE_CUSTOMER, {
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.CUSTOMERS_MANAGEMENT, 'delete');

        if (!response.ok) throw new Error('Failed to delete customer');

        showToast('Customer deleted successfully.');
        // Refresh the list
        await fetchCustomers();
    } catch (error) {
        console.error('Error deleting customer:', error);
        showToast('Failed to delete customer.', true);
    }
}

// -- TOAST --
function showToast(msg, isError = false) {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast-notification show';
    t.style.background = isError ? '#ef4444' : '';
    setTimeout(() => {
        t.className = 'toast-notification';
        t.style.background = '';
    }, 3500);
}
