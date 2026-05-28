import { supabase } from './lib/supabase.js';
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
let activeFilter = 'all'; // tracks the current filter tag

function getCompanyId() { return localStorage.getItem('company_id') || null; }

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
        const base = getFilteredList(activeFilter);
        if (!query) {
            renderCustomers(base);
            return;
        }
        const filtered = base.filter(c => {
            const name = (c.customer_name || '').toLowerCase();
            const phone = String(c.customer_phone || '').toLowerCase();
            return name.includes(query) || phone.includes(query);
        });
        renderCustomers(filtered);
    });
}

// Returns a filtered subset of customersList based on a filter tag
function getFilteredList(tag) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(now.getDate() - 90);

    switch (tag) {
        case 'vip':
            return customersList.filter(c => (c.tags || '').toLowerCase() === 'vip');
        case 'regular':
            return customersList.filter(c => (c.tags || '').toLowerCase() === 'regular');
        case 'new':
            return customersList.filter(c => c.created_at && new Date(c.created_at) >= thirtyDaysAgo);
        case 'inactive':
            return customersList.filter(c => {
                if (c.last_visit) {
                    return new Date(c.last_visit) < ninetyDaysAgo;
                }
                // Never visited but account is older than 90 days
                return c.created_at && new Date(c.created_at) < ninetyDaysAgo;
            });
        default:
            return customersList;
    }
}

// Called by the filter dropdown in customers.html
// Exposed on window because customers.js is an ES module (not global by default)
function applyCustomerFilter(tag) {
    activeFilter = tag;
    // Reset search input so results aren't stale
    if (customerSearchInput) customerSearchInput.value = '';
    renderCustomers(getFilteredList(tag));
}
window.applyCustomerFilter = applyCustomerFilter;

// -- READ --
async function fetchCustomers() {
    try {
        if (customersTableBody) {
            customersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="text-align:center;">Loading customers...</td></tr>';
        }
        
        const companyId = getCompanyId();
        const branchId = getBranchId();

        if (!companyId || !branchId) return;

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .neq('status', 'deleted')
            .order('customer_name', { ascending: true });

        if (error) throw error;

        // 1. Fetch completed bookings for last_visit AND total spent
        const { data: completedBookings, error: err1 } = await supabase
            .from('bookings_for_business_transaction')
            .select('customer_id, booking_date, total_price')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('status', 'completed');
        
        if (err1) throw new Error("Bookings table error: " + err1.message);

        // 2. Fetch completed POS sales
        const { data: posSales, error: err2 } = await supabase
            .from('sales_with_payment_status')
            .select('customer_id, amount_paid')
            .eq('company_id', companyId)
            .eq('branch_id', branchId);
            
        if (err2) throw new Error("POS Sales view error: " + err2.message);

        // 3. Fetch membership purchases
        const { data: memberships, error: err3 } = await supabase
            .from('membership_purchases')
            .select('customer_id, price')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('payment_status', 'paid');
            
        if (err3) throw new Error("Membership purchases error: " + err3.message);

        // Build maps: customer_id -> last_visit date & customer_id -> total_spent
        const lastVisitMap = {};
        const totalSpentMap = {};

        // Process Bookings
        (completedBookings || []).forEach(b => {
            if (!b.customer_id) return;
            const cid = String(b.customer_id).trim();
            
            // Last Visit
            if (b.booking_date) {
                if (!lastVisitMap[cid] || b.booking_date > lastVisitMap[cid]) {
                    lastVisitMap[cid] = b.booking_date;
                }
            }
            
            // Spend
            const amount = parseFloat(b.total_price) || 0;
            totalSpentMap[cid] = (totalSpentMap[cid] || 0) + amount;
        });

        // Process POS Sales
        (posSales || []).forEach(s => {
            if (!s.customer_id) return;
            const cid = String(s.customer_id).trim();
            const amount = parseFloat(s.amount_paid) || 0;
            totalSpentMap[cid] = (totalSpentMap[cid] || 0) + amount;
        });

        // Process Memberships
        (memberships || []).forEach(m => {
            if (!m.customer_id) return;
            const cid = String(m.customer_id).trim();
            const amount = parseFloat(m.price) || 0;
            totalSpentMap[cid] = (totalSpentMap[cid] || 0) + amount;
        });

        customersList = (data || []).map(c => {
            const customerId = String(c.customer_id || c.id || '').trim();
            return {
                ...c,
                customer_name: c.customer_name || c.name,
                customer_phone: c.customer_phone || c.phone,
                customer_email: c.customer_email || c.email,
                last_visit: lastVisitMap[customerId] || null,
                total_spent: totalSpentMap[customerId] || 0
            };
        });

        // Calculate simple stats
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        
        const total = customersList.length;
        const newThisMonth = customersList.filter(c => c.created_at && new Date(c.created_at) >= thirtyDaysAgo).length;
        const vip = customersList.filter(c => (c.tags || '').toLowerCase() === 'vip').length;

        // Hydrate stat cards
        const elTotal    = document.getElementById('statTotalCustomers');
        const elNew      = document.getElementById('statNewThisMonth');
        const elVip      = document.getElementById('statVipCustomers');
        const elInactive = document.getElementById('statInactiveDays');
        
        if (elTotal)    elTotal.textContent    = total;
        if (elNew)      elNew.textContent      = newThisMonth;
        if (elVip)      elVip.textContent      = vip;
        if (elInactive) elInactive.textContent = '0';

        // Hide trends temporarily as they rely on advanced analytics
        updateTrend('trendTotalCustomers', null);
        updateTrend('trendNewThisMonth', null);
        updateTrend('trendVipCustomers', null);
        updateTrend('trendInactiveDays', null);

        renderCustomers();
    } catch (error) {
        console.error('Error fetching customers:', error);
        if (customersTableBody) {
            customersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-rose" style="text-align:center; color: #e11d48;"><b>Failed to load customers:</b><br>${error.message}</td></tr>`;
        }
    }
}

function updateTrend(elementId, changeValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    // Hide if no change value is passed
    if (changeValue === null || changeValue === undefined) {
        el.style.display = 'none';
        return;
    }
    
    // Fallback logic
    el.style.display = 'none';
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
        
        const totalSpent    = customer.total_spent    != null ? customer.total_spent    : 0;
        const totalBookings = customer.total_bookings != null ? customer.total_bookings : 0;
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
                        <a href="javascript:void(0)" class="text-main fw-600 customer-name-link customer-link" style="font-weight:600; text-decoration:none;" onclick="viewCustomerProfile('${customer.customer_id || customer.id}')">${name}</a>
                        <p class="text-sm text-muted" style="margin:0; font-size:0.875rem; color:#64748b;">Joined ${joinedDate}</p>
                    </div>
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

    const deleteOverlay = document.getElementById('deleteConfirmOverlay');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete = document.getElementById('btnCancelDelete');
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
                // Instantly hide the small confirmation modal
                if (deleteOverlay) deleteOverlay.classList.remove('active');
                
                // Show the full-screen blurred "Deleting..." overlay
                if (deletingOverlay) deletingOverlay.classList.add('active');

                // Wait for the delete to finish
                await deleteCustomer(pendingDeleteId);
                
                // Cleanup and close overlay
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
    if (inputNotes) inputNotes.value = '';
    
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
        const dob = inputDob && inputDob.value ? inputDob.value : null;
        const tag = inputTag ? inputTag.value : '';

        if (!name || !phone) {
            showToast('Name and Phone are required.', true);
            return;
        }

        const digitsOnly = phone.replace(/\D/g, '');
        if (!/^[0-9]{10}$/.test(digitsOnly)) {
            showToast('Phone number must be exactly 10 digits.', true);
            return;
        }

        const isEditing = !!editingCustomerId;
        
        let existingDupe = false;
        if (isEditing) {
            existingDupe = customersList.find(c => c.customer_phone === digitsOnly && String(c.customer_id) !== String(editingCustomerId));
        } else {
            existingDupe = customersList.find(c => c.customer_phone === digitsOnly);
        }

        if (existingDupe) {
            showToast('A customer with this phone number already exists.', true);
            return;
        }

        const payload = { 
            company_id: getCompanyId(), 
            branch_id: getBranchId(),
            customer_name: name, 
            customer_phone: digitsOnly, 
            customer_email: email, 
            tags: tag,
            notes: inputNotes ? inputNotes.value.trim() : ''
        };
        if (dob) {
            payload.dob = dob;
        }
        if (!isEditing) {
            payload.status = 'active';
        }

        const originalText = btnSaveCustomer.textContent;
        btnSaveCustomer.textContent = isEditing ? 'Updating...' : 'Saving...';
        btnSaveCustomer.disabled = true;

        try {
            let error;
            if (isEditing) {
                const { error: updateErr } = await supabase.from('customers').eq('customer_id', editingCustomerId).update(payload);
                error = updateErr;
            } else {
                const { error: insertErr } = await supabase.from('customers').insert(payload);
                error = insertErr;
            }

            if (error) {
                throw error;
            }

            closeModal();
            showToast(isEditing ? 'Customer updated successfully!' : 'Customer created successfully!');
            await fetchCustomers(); // Refresh the list
        } catch (err) {
            console.error('Error saving customer:', err);
            showToast(err.message || 'Failed to save customer. Please try again.', true);
        } finally {
            btnSaveCustomer.textContent = originalText;
            btnSaveCustomer.disabled = false;
        }
    });
}

if (btnCancelAddCustomer) {
    btnCancelAddCustomer.addEventListener('click', closeModal);
}
if (addCustomerModalWrapper) {
    addCustomerModalWrapper.querySelector('.modal-close')?.addEventListener('click', closeModal);
}
if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}

// -- DELETE --
async function deleteCustomer(id) {
    try {
        const { error } = await supabase.from('customers').eq('customer_id', id).update({ status: 'deleted' });

        if (error) throw error;

        showToast('Customer deleted successfully.');
        await fetchCustomers();
        return true;
    } catch (err) {
        console.error('Error deleting customer:', err);
        showToast('Failed to delete customer. Ensure they have no active bookings.', true);
        return false;
    }
}

// -- SPENDING BREAKDOWN MODAL --
async function openSpendingModal(customerId) {
    const overlay  = document.getElementById('spendingBreakdownOverlay');
    const loading  = document.getElementById('sbdLoading');
    const content  = document.getElementById('sbdContent');
    const closeBtn = document.getElementById('closeSpendingModal');

    if (!overlay) return;

    // Show overlay + loading state
    loading.style.display  = 'flex';
    content.style.display  = 'none';
    overlay.classList.add('active');

    // Close handlers
    const closeModal = () => overlay.classList.remove('active');
    closeBtn.onclick = closeModal;
    overlay.onclick  = (e) => { if (e.target === overlay) closeModal(); };

    try {
        const companyId = getCompanyId();
        const branchId  = getBranchId();

        // Fire 3 queries in parallel
        const [bookingsRes, salesRes, membershipsRes] = await Promise.all([
            supabase
                .from('bookings_for_business_transaction')
                .select('total_price')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .eq('customer_id', customerId)
                .eq('status', 'completed'),

            supabase
                .from('sales_with_payment_status')
                .select('amount_paid')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .eq('customer_id', customerId),

            supabase
                .from('membership_purchases')
                .select('price')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .eq('customer_id', customerId)
                .eq('payment_status', 'paid')
        ]);

        const services    = (bookingsRes.data    || []).reduce((s, r) => s + (parseFloat(r.total_price)  || 0), 0);
        const products    = (salesRes.data        || []).reduce((s, r) => s + (parseFloat(r.amount_paid)  || 0), 0);
        const memberships = (membershipsRes.data  || []).reduce((s, r) => s + (parseFloat(r.price)        || 0), 0);
        const total       = services + products + memberships;

        document.getElementById('sbdServices').textContent    = `₹${services}`;
        document.getElementById('sbdProducts').textContent    = `₹${products}`;
        document.getElementById('sbdMemberships').textContent = `₹${memberships}`;
        document.getElementById('sbdTotal').textContent       = `₹${total}`;

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
    t.className = 'toast-notification show';
    t.style.background = isError ? '#ef4444' : '#10b981';
    setTimeout(() => {
        t.className = 'toast-notification';
        t.style.background = '';
    }, 3500);
}
