import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';
import { SUB_FEATURES } from './config/sub-feature-registry.js';
import { applySubFeatureGates } from './scripts/sub-features/sub-feature-gate.js';

// DOM Elements
const customersTableBody = document.getElementById('customersTableBody');
const btnAddCustomer = document.getElementById('btnAddCustomer');
const btnCancelAddCustomer = document.getElementById('btnCancelAddCustomer');
const btnSaveCustomer = document.getElementById('btnSaveNewCustomer');
const modalOverlay = document.getElementById('addCustomerModalOverlay');
const addCustomerModalWrapper = document.getElementById('addCustomerModal');
const modalTitle = addCustomerModalWrapper?.querySelector('.header-titles h2');
const modalSubtitle = addCustomerModalWrapper?.querySelector('.header-titles .subtitle');
const paginationText = document.querySelector('.table-pagination .text-muted');

// Form inputs
const inputName = document.getElementById('newCustName');
const inputPhone = document.getElementById('newCustPhone');
const inputEmail = document.getElementById('newCustEmail');
const inputDob = document.getElementById('newCustDob');
const inputTag = document.getElementById('newCustTag');

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

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchCustomers);
} else {
    fetchCustomers();
}

// -- READ --
async function fetchCustomers() {
    try {
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">Loading customers...</td></tr>';
        }
        
        const payload = { company_id: getCompanyId() };
        
        const response = await fetchWithAuth(API.READ_CUSTOMERS, { 
            method: 'POST',
            body: JSON.stringify(payload)
        }, FEATURES.CUSTOMERS_MANAGEMENT, 'read');

        if (!response.ok) throw new Error('Failed to fetch customers');

        const data = await response.json();
        customersList = Array.isArray(data) ? data : (data.customers || []);
        renderCustomers();
    } catch (error) {
        console.error('Error fetching customers:', error);
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-rose" style="text-align:center; color: #e11d48;">Failed to load customers.</td></tr>';
        }
    }
}

function renderCustomers() {
    if (!customersTableBody) return;
    customersTableBody.innerHTML = '';
    
    if (customersList.length === 0) {
        customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">No customers found.</td></tr>';
        if (paginationText) paginationText.innerHTML = `Showing <span class="fw-600 text-main">0</span> to <span class="fw-600 text-main">0</span> of <span class="fw-600 text-main">0</span> customers`;
        return;
    }

    if (paginationText) {
        paginationText.innerHTML = `Showing <span class="fw-600 text-main">1</span> to <span class="fw-600 text-main">${customersList.length}</span> of <span class="fw-600 text-main">${customersList.length}</span> customers`;
    }

    customersList.forEach(customer => {
        const tr = document.createElement('tr');
        
        // Avatar generation
        const avatarUrl = customer.profile_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name || 'Unknown')}&background=c7d2fe&color=3730A3`;
        
        // Setup Tag HTML
        let tagHtml = '';
        const tag = (customer.tag || 'regular').toLowerCase();
        if (tag === 'vip') {
            tagHtml = `<span class="status-badge bg-amber-light text-amber" style="padding: 4px 8px;"><i data-feather="star" style="width:12px; height:12px; margin-right:4px;"></i>VIP</span>`;
        } else if (tag === 'new') {
            tagHtml = `<span class="status-badge bg-emerald-light text-emerald" style="padding: 4px 8px;">New</span>`;
        } else if (tag === 'regular') {
            tagHtml = `<span class="status-badge bg-blue-light text-blue" style="padding: 4px 8px;">Regular</span>`;
        } else {
            tagHtml = `<span class="status-badge" style="background-color: #f1f5f9; color: #64748b; padding: 4px 8px;">${customer.tag}</span>`;
        }

        const joinedDate = customer.joined_date || customer.created_at || 'Recently';
        const phone = customer.phone || 'N/A';
        const email = customer.email || '-';
        const totalSpent = customer.total_spent != null ? customer.total_spent : 0;
        const totalBookings = customer.total_bookings != null ? customer.total_bookings : 0;
        const lastVisit = customer.last_visit || '-';

        tr.innerHTML = `
            <td>
                <div class="customer-info" style="display:flex; align-items:center; gap:1rem;">
                    <div class="avatar-sm" style="width:40px; height:40px; border-radius:50%; overflow:hidden;">
                        <img src="${avatarUrl}" alt="${customer.name}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div>
                        <a href="#" class="text-main fw-600 customer-name-link" style="color:#0f172a; font-weight:600; text-decoration:none;">${customer.name || 'Unknown'}</a>
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
            <td class="text-right" style="text-align:right;">
                <div class="action-buttons" style="display:flex; justify-content:flex-end; gap:0.5rem;">
                    <button class="icon-btn btn-view-profile" title="View Profile" style="background:none; border:none; cursor:pointer; color:#64748b;"><i data-feather="eye"></i></button>
                    <button class="icon-btn btn-edit" data-id="${customer.id}" data-sub-feature="${SUB_FEATURES.CUSTOMER_EDIT}" title="Edit Customer" style="background:none; border:none; cursor:pointer; color:#3b82f6;"><i data-feather="edit-2"></i></button>
                    <button class="icon-btn btn-delete flex-shrink-0" data-id="${customer.id}" data-sub-feature="${SUB_FEATURES.CUSTOMER_DELETE}" title="Delete Customer" style="background:none; border:none; cursor:pointer; color:#ef4444;"><i data-feather="trash-2"></i></button>
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
    const customer = customersList.find(c => String(c.id) === String(id));
    if (!customer) return;

    editingCustomerId = customer.id;
    if (modalTitle) modalTitle.textContent = 'Edit Customer';
    if (modalSubtitle) modalSubtitle.textContent = 'Update the client profile details.';
    if (btnSaveCustomer) btnSaveCustomer.textContent = 'Update Customer';

    // Populate inputs
    if (inputName) inputName.value = customer.name || '';
    if (inputPhone) inputPhone.value = customer.phone || '';
    if (inputEmail) inputEmail.value = customer.email || '';
    if (inputDob) inputDob.value = customer.dob || '';
    if (inputTag) inputTag.value = (customer.tag || 'regular').toLowerCase();

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
            name, 
            phone, 
            email, 
            dob, 
            tag 
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

            if (!response.ok) throw new Error('API Request Failed');

            const result = await response.json();

            // Check for business-logic errors (e.g. duplicate phone)
            if (result.success === false) {
                showToast(result.error || 'Failed to save customer.', true);
                return; // Keep modal open
            }

            closeModal();
            showToast(isEditing ? 'Customer updated successfully!' : 'Customer created successfully!');
            await fetchCustomers(); // Refresh the list
        } catch (error) {
            console.error('Error saving customer:', error);
            showToast('Failed to save customer. Please try again.', true);
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
