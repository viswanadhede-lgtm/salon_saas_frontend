import { supabase } from '../lib/supabase.js';

// Inject modal HTML on load
if (!document.getElementById('addCustomerModalOverlay')) {
    const modalHtml = `
    <!-- Add Customer Modal -->
    <div class="modal-overlay" id="addCustomerModalOverlay">
        <div class="modal-container" id="addCustomerModal" style="max-width: 845px;">
            <!-- Header -->
            <div class="modal-header">
                <div class="header-titles">
                    <h2>Add New Customer</h2>
                    <p class="subtitle">Enter the details to create a new client profile.</p>
                </div>
                <button class="modal-close" id="closeAddCustomerModal"><i data-feather="x"></i></button>
            </div>

            <!-- Body -->
            <div class="modal-body" style="padding: 1.5rem;">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="newCustName">Full Name <span class="text-rose">*</span></label>
                        <input type="text" id="newCustName" class="form-input">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustPhone">Phone Number <span class="text-rose">*</span></label>
                        <input type="tel" id="newCustPhone" class="form-input" maxlength="10" inputmode="numeric" pattern="[0-9]{10}">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustEmail">Email Address <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <input type="email" id="newCustEmail" class="form-input">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustDob">Birthday <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <input type="date" id="newCustDob" class="form-input">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustTag">Customer Tag</label>
                        <select id="newCustTag" class="form-select">
                            <option value="regular" selected>Regular</option>
                            <option value="vip">VIP</option>
                        </select>
                    </div>

                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label class="form-label" for="newCustNotes">Notes <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <textarea id="newCustNotes" class="form-input" style="min-height: 105px; resize: vertical;"></textarea>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="btnCancelAddCustomer">Cancel</button>
                <button type="button" class="btn btn-primary" id="btnSaveNewCustomer" style="background: #10b981; border-color: #10b981;">Save Customer</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.feather) window.feather.replace();
}

let onSuccessCallback = null;

window.openGlobalAddCustomerModal = function(callback) {
    onSuccessCallback = callback;
    
    // Clear inputs
    document.getElementById('newCustName').value = '';
    document.getElementById('newCustPhone').value = '';
    document.getElementById('newCustEmail').value = '';
    document.getElementById('newCustDob').value = '';
    document.getElementById('newCustTag').value = 'regular';
    document.getElementById('newCustNotes').value = '';
    
    document.getElementById('addCustomerModalOverlay').classList.add('active');
};

function closeGlobalAddCustomerModal() {
    document.getElementById('addCustomerModalOverlay').classList.remove('active');
}

document.getElementById('closeAddCustomerModal')?.addEventListener('click', closeGlobalAddCustomerModal);
document.getElementById('btnCancelAddCustomer')?.addEventListener('click', closeGlobalAddCustomerModal);
document.getElementById('addCustomerModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'addCustomerModalOverlay') closeGlobalAddCustomerModal();
});

document.getElementById('btnSaveNewCustomer')?.addEventListener('click', async () => {
    const inputName = document.getElementById('newCustName');
    const inputPhone = document.getElementById('newCustPhone');
    const inputEmail = document.getElementById('newCustEmail');
    const inputDob = document.getElementById('newCustDob');
    const inputTag = document.getElementById('newCustTag');
    const inputNotes = document.getElementById('newCustNotes');
    const btnSaveCustomer = document.getElementById('btnSaveNewCustomer');

    const name = inputName.value.trim();
    const phone = inputPhone.value.trim();
    const email = inputEmail.value.trim();
    const dob = inputDob.value ? inputDob.value : null;
    const tag = inputTag.value;
    const notes = inputNotes.value.trim();

    if (!name || !phone) {
        showGlobalToast('Name and Phone are required.', true);
        return;
    }

    const digitsOnly = phone.replace(/\\D/g, '');
    if (!/^[0-9]{10}$/.test(digitsOnly)) {
        showGlobalToast('Phone number must be exactly 10 digits.', true);
        return;
    }

    const companyId = localStorage.getItem('company_id');
    const branchId = localStorage.getItem('active_branch_id');

    if (!companyId || !branchId) {
        showGlobalToast('Missing company/branch ID.', true);
        return;
    }

    btnSaveCustomer.textContent = 'Saving...';
    btnSaveCustomer.disabled = true;

    try {
        // Validation check for existing phone number across the branch
        const { data: existingQuery } = await supabase
            .from('customers')
            .select('customer_id')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('customer_phone', digitsOnly)
            .eq('status', 'active');
            
        if (existingQuery && existingQuery.length > 0) {
            showGlobalToast('A customer with this phone number already exists.', true);
            throw new Error('Duplicate phone');
        }

        const payload = { 
            company_id: companyId, 
            branch_id: branchId,
            customer_name: name, 
            customer_phone: digitsOnly, 
            customer_email: email, 
            tags: tag,
            notes: notes,
            status: 'active'
        };
        if (dob) payload.dob = dob;

        const { error } = await supabase.from('customers').insert(payload);

        if (error) throw error;

        // Fetch the newly created customer by phone to pass back to callback
        const { data: newCustomerArr } = await supabase
            .from('customers')
            .select('*')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('customer_phone', digitsOnly)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);
        const newCustomer = newCustomerArr && newCustomerArr.length > 0 ? newCustomerArr[0] : null;

        closeGlobalAddCustomerModal();
        showGlobalToast('Customer created successfully!');
        if (onSuccessCallback) {
            onSuccessCallback(newCustomer);
        }
    } catch (err) {
        if (err.message !== 'Duplicate phone') {
            console.error('Error saving customer:', err);
            showGlobalToast(err.message || 'Failed to save customer. Please try again.', true);
        }
    } finally {
        btnSaveCustomer.textContent = 'Save Customer';
        btnSaveCustomer.disabled = false;
    }
});

function showGlobalToast(msg, isError = false) {
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
