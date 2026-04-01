import { API, fetchWithAuth } from '../config/api.js';

let currentCoupons = [];
let availableServices = [];
let isEditing = false;
let currentEditId = null;

// Global context getters
const getCompanyId = () => localStorage.getItem('company_id') || 'C1';
const getBranchId = () => localStorage.getItem('active_branch_id') || document.getElementById('branchSelect')?.value || null;

document.addEventListener('DOMContentLoaded', async () => {
    feather.replace();

    // Fetch initial data
    await fetchServices();
    await loadCoupons();

    // Event Listeners for Filters
    document.getElementById('branchSelect')?.addEventListener('change', loadCoupons);

    // Filter Panel handling
    const filterPanel = document.getElementById('cpnFilterPanel');
    const btnFilter = document.getElementById('btnFilterCoupons');
    if (btnFilter && filterPanel) {
        btnFilter.addEventListener('click', e => { 
            e.stopPropagation(); 
            filterPanel.style.display = filterPanel.style.display === 'block' ? 'none' : 'block'; 
        });
        document.getElementById('btnCloseCpnFilter')?.addEventListener('click', () => { filterPanel.style.display = 'none'; });
        document.getElementById('btnCpnFilterApply')?.addEventListener('click', () => { filterPanel.style.display = 'none'; /* TODO: Apply filter logic */ });
        document.getElementById('btnCpnFilterReset')?.addEventListener('click', () => {
            filterPanel.querySelectorAll('input').forEach(i => i.checked = false);
            // Optionally reload without filters
        });
        filterPanel.addEventListener('click', e => e.stopPropagation());
    }

    // Modal Events
    const overlay = document.getElementById('couponModalOverlay');
    document.getElementById('btnCreateCoupon')?.addEventListener('click', openCreateModal);
    document.getElementById('closeCouponModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelCoupon')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // UI Interactive helpers inside modal
    const discType = document.getElementById('cpnDiscountType');
    const discVal = document.getElementById('cpnDiscountValue');
    if(discType && discVal) {
        discType.addEventListener('change', () => { 
            discVal.placeholder = discType.value === 'percentage' ? 'e.g. 10' : 'e.g. 100'; 
        });
    }

    const toggle = document.getElementById('cpnStatusToggle');
    const statusLabel = document.getElementById('cpnStatusLabel');
    if(toggle && statusLabel) {
        toggle.addEventListener('change', () => { statusLabel.textContent = toggle.checked ? 'Active' : 'Inactive'; });
    }

    const codeInput = document.getElementById('cpnCode');
    if(codeInput) {
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); });
    }

    // Applicable Services Dropdown Interaction
    const svcBtn = document.getElementById('cpnServicesBtn');
    const svcMenu = document.getElementById('cpnServicesMenu');
    const svcText = document.getElementById('cpnServicesText');
    if(svcBtn && svcMenu) {
        svcBtn.addEventListener('click', e => { 
            e.stopPropagation(); 
            svcMenu.style.display = svcMenu.style.display === 'block' ? 'none' : 'block'; 
        });
        document.addEventListener('click', e => { 
            if (!svcBtn.contains(e.target) && !svcMenu.contains(e.target)) svcMenu.style.display = 'none'; 
        });
    }

    document.getElementById('cpnSvcApply')?.addEventListener('click', () => {
        applyServiceSelection();
        if(svcMenu) svcMenu.style.display = 'none';
    });

    document.getElementById('cpnSvcReset')?.addEventListener('click', () => {
        document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
        applyServiceSelection();
    });

    // Save Button
    document.getElementById('btnSaveCoupon')?.addEventListener('click', handleSaveCoupon);

    // Close dropdowns when clicking outside
    window.addEventListener('click', e => {
        if (!e.target.closest('.dropbtn')) {
            document.querySelectorAll('.cpn-dd').forEach(d => d.style.display = 'none');
        }
    });
});

// Helper for UI dropdown logic
function applyServiceSelection() {
    const list = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    const svcText = document.getElementById('cpnServicesText');
    if(!svcText) return;

    const selTitles = Array.from(list).filter(c => c.checked).map(c => c.nextSibling.textContent.trim());
    const selValues = Array.from(list).filter(c => c.checked).map(c => c.value);
    
    if (selValues.length === 0) { 
        svcText.textContent = 'Select services...'; 
        svcText.style.color = '#94a3b8'; 
    }
    else if (selValues.includes('all')) { 
        svcText.textContent = 'All Services'; 
        svcText.style.color = '#1e293b'; 
    }
    else if (selTitles.length === 1) { 
        svcText.textContent = selTitles[0]; 
        svcText.style.color = '#1e293b'; 
    }
    else { 
        svcText.textContent = `${selTitles[0]} +${selTitles.length - 1} more`; 
        svcText.style.color = '#1e293b'; 
    }
}

async function fetchServices() {
    try {
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId()
        };
        const res = await fetchWithAuth(API.READ_SERVICES, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            availableServices = Array.isArray(data) ? data : (data.services || []);
            populateServicesCheckboxes();
        }
    } catch (err) {
        console.error("Failed to load services", err);
    }
}

function populateServicesCheckboxes() {
    const modalContainer = document.getElementById('cpnServicesCheckboxList');
    const filterContainer = document.getElementById('filterServicesContainer');

    let dynamicHtml = '';
    availableServices.forEach(svc => {
        dynamicHtml += `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:0.88rem;color:#334155;"><input type="checkbox" value="${svc.service_id || svc._id}" style="accent-color:#6366f1;"> ${svc.service_name || svc.name}</label>`;
    });

    if (modalContainer) {
        modalContainer.innerHTML = `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:0.88rem;color:#334155;"><input type="checkbox" value="all" style="accent-color:#6366f1;"> All Services</label>
            ${dynamicHtml}
        `;
        bindAllServicesToggle(modalContainer);
    }

    if (filterContainer) {
        filterContainer.innerHTML = `
            <label class="cpn-filter-chk"><input type="checkbox" value="all"> All Services</label>
            ${availableServices.map(svc => `<label class="cpn-filter-chk"><input type="checkbox" value="${svc.service_id || svc._id}"> ${svc.service_name || svc.name}</label>`).join('')}
        `;
        bindAllServicesToggle(filterContainer);
    }
}

function bindAllServicesToggle(container) {
    const allCheckbox = container.querySelector('input[value="all"]');
    const otherCheckboxes = container.querySelectorAll('input:not([value="all"])');

    if (allCheckbox) {
        allCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            otherCheckboxes.forEach(cb => { cb.checked = isChecked; });
            // For the modal container specifically, updating UI label:
            if (container.id === 'cpnServicesCheckboxList' && typeof applyServiceSelection === 'function') {
                applyServiceSelection();
            }
        });

        otherCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                if (!cb.checked) {
                    allCheckbox.checked = false;
                } else {
                    const allChecked = Array.from(otherCheckboxes).every(c => c.checked);
                    allCheckbox.checked = allChecked;
                }
                if (container.id === 'cpnServicesCheckboxList' && typeof applyServiceSelection === 'function') {
                    applyServiceSelection();
                }
            });
        });
    }
}

async function loadCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="padding:24px 20px; text-align:center; color:#64748b;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <i data-feather="loader" class="spin" style="width:24px;height:24px;"></i>
                    <span style="font-size:0.9rem;">Loading coupons...</span>
                </div>
            </td>
        </tr>`;
    if(window.feather) feather.replace();

    try {
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId()
        };
        const res = await fetchWithAuth(API.READ_COUPONS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            currentCoupons = data.coupons || [];
            renderCoupons();
        } else {
            throw new Error("Failed to load");
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#ef4444;">Failed to load coupons.</td></tr>`;
    }
}

function renderCoupons() {
    const tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;
    
    if (currentCoupons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No coupons found. Create a new coupon to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentCoupons.map(coupon => {
        
        const isFlat = coupon.discount_type === 'flat';
        const discountDisplay = isFlat ? `₹${coupon.discount_value} OFF` : `${coupon.discount_value}% OFF`;
        const badgeColor = isFlat ? 'color:#15803d;background:#dcfce7;' : 'color:#0284c7;background:#e0f2fe;';
        
        // Services Display
        let svcDisplay = "All Services";
        if (coupon.applicable_services && !coupon.applicable_services.includes("all")) {
            svcDisplay = `${coupon.applicable_services.length} selected`;
        }

        // Validity Logic
        let validityText = "Always Active";
        if (coupon.start_date || coupon.end_date) {
            const startStr = coupon.start_date ? new Date(coupon.start_date).toLocaleDateString() : "Now";
            const endStr = coupon.end_date ? new Date(coupon.end_date).toLocaleDateString() : "No Expiry";
            validityText = `${startStr} – ${endStr}`;
        }

        // Status Logic
        const isActive = coupon.is_active !== false; // Defaults to true
        const statusBadge = isActive 
            ? `<span style="background:#dcfce7;color:#166534;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>Active</span>`
            : `<span style="background:#f1f5f9;color:#475569;font-size:0.75rem;padding:4px 10px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;"></span>Inactive</span>`;

        // Usage counts
        const usageLimit = coupon.usage_limit ? coupon.usage_limit : '∞';
        const usedCount = coupon.used_count || 0;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:16px 20px;"><span class="cpn-code-badge">${coupon.coupon_code || coupon.code || 'N/A'}</span></td>
                <td style="padding:16px 20px;"><span style="font-weight:700;${badgeColor}padding:4px 8px;border-radius:6px;font-size:0.85rem;">${discountDisplay}</span></td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;text-transform:capitalize;">${coupon.discount_type || '-'}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#334155;">${svcDisplay}</td>
                <td style="padding:16px 20px;font-size:0.9rem;color:#64748b;font-style:italic;">${validityText}</td>
                <td style="padding:16px 20px;"><span style="font-weight:600;color:#334155;">${usedCount}</span><span style="color:#64748b;font-size:0.9rem;"> / ${usageLimit}</span></td>
                <td style="padding:16px 20px;">${statusBadge}</td>
                <td style="padding:16px 20px;text-align:center;">
                    <div class="dropdown" style="position:relative;display:inline-block;">
                        <button class="icon-btn dropbtn" onclick="window.toggleActionMenu(this)" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;font-size:0.85rem;font-weight:500;color:#334155;cursor:pointer;">Actions <i data-feather="chevron-down" style="width:14px;height:14px;"></i></button>
                        <div class="cpn-dd" style="display:none;position:absolute;right:0;top:100%;min-width:150px;background:#fff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border-radius:8px;border:1px solid #e2e8f0;z-index:10;padding:4px 0;text-align:left;">
                            <a href="#" onclick="window.editCoupon('${coupon._id}'); return false;" style="display:flex;align-items:center;gap:8px;padding:8px 16px;color:#334155;text-decoration:none;font-size:0.9rem;"><i data-feather="edit-2" style="width:14px;height:14px;"></i> Edit</a>
                            <a href="#" onclick="window.toggleSoftDelete('${coupon._id}', ${isActive}); return false;" style="display:flex;align-items:center;gap:8px;padding:8px 16px;color:#334155;text-decoration:none;font-size:0.9rem;"><i data-feather="slash" style="width:14px;height:14px;"></i> ${isActive ? 'Disable' : 'Enable'}</a>
                            <div style="height:1px;background:#e2e8f0;margin:4px 0;"></div>
                            <a href="#" onclick="window.deleteCoupon('${coupon._id}'); return false;" style="display:flex;align-items:center;gap:8px;padding:8px 16px;color:#ef4444;text-decoration:none;font-size:0.9rem;"><i data-feather="trash-2" style="width:14px;height:14px;"></i> Delete</a>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    if(window.feather) feather.replace();
}

// Attach helpers to window so inline onclicks can find them
window.toggleActionMenu = function(btn) {
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.cpn-dd').forEach(d => { if (d !== menu) d.style.display = 'none'; });
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

function showToast(message) {
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else {
        alert(message);
    }
}

window.editCoupon = function(id) {
    const coupon = currentCoupons.find(c => c._id === id);
    if (!coupon) return;
    
    isEditing = true;
    currentEditId = id;
    
    // Populate form
    document.getElementById('cpnCode').value = coupon.coupon_code || coupon.code || '';
    document.getElementById('cpnDiscountType').value = coupon.discount_type || 'percentage';
    document.getElementById('cpnDiscountValue').value = coupon.discount_value || '';
    
    // Services
    const svcCheckboxes = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    const isAll = coupon.applicable_services && (coupon.applicable_services.includes('all') || coupon.applicable_services.length === availableServices.length);
    svcCheckboxes.forEach(c => {
        if (isAll) {
            c.checked = true;
        } else if (coupon.applicable_services) {
            // Support both array of strings and array of objects
            const isMatch = coupon.applicable_services.some(svc => {
                const id = typeof svc === 'object' ? (svc.service_id || svc._id) : svc;
                return id === c.value;
            });
            c.checked = isMatch;
        } else {
            c.checked = false;
        }
    });
    applyServiceSelection();

    document.getElementById('cpnMinBooking').value = coupon.min_booking_amount || '';
    document.getElementById('cpnUsageLimit').value = coupon.usage_limit || '';
    document.getElementById('cpnUsagePerCustomer').value = coupon.usage_per_customer || '';
    
    const tog = document.getElementById('cpnStatusToggle');
    tog.checked = coupon.is_active !== false;
    document.getElementById('cpnStatusLabel').textContent = tog.checked ? 'Active' : 'Inactive';

    if (coupon.start_date) {
        document.getElementById('cpnStartDate').value = new Date(coupon.start_date).toISOString().split('T')[0];
    } else {
        document.getElementById('cpnStartDate').value = '';
    }

    if (coupon.end_date) {
        document.getElementById('cpnEndDate').value = new Date(coupon.end_date).toISOString().split('T')[0];
    } else {
        document.getElementById('cpnEndDate').value = '';
    }

    // Modal UI tweaks
    document.querySelector('#couponModalOverlay h2').textContent = "Edit Coupon";
    const btnSave = document.getElementById('btnSaveCoupon');
    btnSave.textContent = "Save Changes";
    
    document.getElementById('couponModalOverlay').classList.add('active');
};

window.toggleSoftDelete = async function(id, currentlyActive) {
    try {
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            coupon_id: id,
            status: !currentlyActive
        };
        const res = await fetchWithAuth(API.UPDATE_COUPON, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast(`Coupon ${currentlyActive ? 'disabled' : 'enabled'} successfully`);
            await loadCoupons();
        } else {
            showToast("Failed to update coupon status.");
        }
    } catch (err) {
        console.error(err);
        showToast("Error updating status.");
    }
};

window.deleteCoupon = async function(id) {
    if (!confirm("Are you sure you want to permanently delete this coupon?")) return;
    try {
        const payload = {
            company_id: getCompanyId(),
            branch_id: getBranchId(),
            coupon_id: id
        };
        const res = await fetchWithAuth(API.DELETE_COUPON, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast("Coupon deleted successfully");
            await loadCoupons();
        } else {
            showToast("Failed to delete coupon.");
        }
    } catch (err) {
        console.error(err);
        showToast("Error deleting coupon.");
    }
};

function openCreateModal() {
    isEditing = false;
    currentEditId = null;

    // Reset Form
    document.getElementById('cpnCode').value = '';
    document.getElementById('cpnDiscountType').value = '';
    document.getElementById('cpnDiscountValue').value = '';
    document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]').forEach(c => c.checked = false);
    applyServiceSelection();
    document.getElementById('cpnMinBooking').value = '';
    document.getElementById('cpnUsageLimit').value = '';
    document.getElementById('cpnUsagePerCustomer').value = '';
    const tog = document.getElementById('cpnStatusToggle');
    tog.checked = true;
    document.getElementById('cpnStatusLabel').textContent = 'Active';
    document.getElementById('cpnStartDate').value = '';
    document.getElementById('cpnEndDate').value = '';

    // Modal UI tweaks
    document.querySelector('#couponModalOverlay h2').textContent = "Create Coupon";
    const btnSave = document.getElementById('btnSaveCoupon');
    btnSave.textContent = "Create Coupon";

    document.getElementById('couponModalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('couponModalOverlay').classList.remove('active');
}

async function handleSaveCoupon() {
    // Collect specific fields
    const coupon_code = document.getElementById('cpnCode').value.trim();
    const discount_type = document.getElementById('cpnDiscountType').value;
    const discount_value = document.getElementById('cpnDiscountValue').value;
    
    if (!coupon_code || !discount_type || !discount_value) {
        showToast("Please fill all required fields (Code, Type, Value).");
        return;
    }

    // Services
    const checkboxes = document.querySelectorAll('#cpnServicesCheckboxList input[type="checkbox"]');
    let applicable_services = Array.from(checkboxes)
        .filter(c => c.checked && c.value !== 'all')
        .map(c => ({
            service_id: c.value,
            service_name: c.nextSibling.textContent.trim()
        }));
    
    // Fallback if none checked but 'all' was somehow intended, or literally nothing checked
    if (applicable_services.length === 0) {
        applicable_services = availableServices.map(svc => ({
            service_id: svc.service_id || svc._id,
            service_name: svc.service_name || svc.name
        }));
    }

    const payload = {
        company_id: getCompanyId(),
        branch_id: getBranchId(),
        coupon_code,
        discount_type,
        discount_value: parseFloat(discount_value),
        applicable_services,
        status: document.getElementById('cpnStatusToggle').checked
    };

    const minAmount = document.getElementById('cpnMinBooking').value;
    if(minAmount) payload.min_booking_amount = parseFloat(minAmount);
    
    const usgLimit = document.getElementById('cpnUsageLimit').value;
    if(usgLimit) payload.usage_limit = parseInt(usgLimit, 10);
    
    const usgPerCust = document.getElementById('cpnUsagePerCustomer').value;
    if(usgPerCust) payload.usage_per_customer = parseInt(usgPerCust, 10);

    const sd = document.getElementById('cpnStartDate').value;
    if(sd) payload.start_date = sd;

    const ed = document.getElementById('cpnEndDate').value;
    if(ed) payload.end_date = ed;

    if (isEditing && currentEditId) {
        payload.coupon_id = currentEditId;
    }

    const btnSave = document.getElementById('btnSaveCoupon');
    const origText = btnSave.textContent;
    btnSave.textContent = "Saving...";
    btnSave.disabled = true;

    try {
        const url = isEditing ? API.UPDATE_COUPON : API.CREATE_COUPON;
        const res = await fetchWithAuth(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast(isEditing ? "Coupon updated successfully" : "Coupon created successfully");
            closeModal();
            await loadCoupons();
        } else {
            showToast("Failed to save coupon.");
        }
    } catch (err) {
        console.error(err);
        showToast("Error saving coupon.");
    } finally {
        btnSave.textContent = origText;
        btnSave.disabled = false;
    }
}
