import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

// --- Live Data ---
let liveProducts = [];
let cart = [];
let currentPaymentMethod = 'cash';
let allCustomers = [];
let selectedCustomer = null;

// --- Helpers ---
function getCompanyId() {
    try {
        const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
        return appContext.company?.id || null;
    } catch (e) { return null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('pos.html')) {
        setupEventListeners();
        fetchProducts();
        fetchCustomers();
    }
});

// --- API: Fetch Products ---
async function fetchProducts() {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    // Show loading skeleton
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #94a3b8; gap: 12px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            <p style="margin: 0; font-size: 0.9rem; font-weight: 500;">Loading products...</p>
        </div>
        <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
    `;

    try {
        const response = await fetchWithAuth(API.READ_PRODUCTS, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        }, FEATURES.PRODUCT_MANAGEMENT, 'read');

        if (!response.ok) throw new Error('Failed to fetch products');

        const data = await response.json();
        let rawData = Array.isArray(data) ? data : (data.products || []);

        // Only show Active products with stock
        liveProducts = rawData.filter(p =>
            (p.status || '').toLowerCase() !== 'deleted' &&
            (p.status || '').toLowerCase() === 'active'
        );

        renderProducts(liveProducts);
    } catch (err) {
        console.error('POS: Error fetching products:', err);
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 40px;">
                <p style="margin: 0 0 8px; font-size: 0.95rem; font-weight: 500; color: #64748b;">Could not load products</p>
                <p style="margin: 0; font-size: 0.85rem;">Check your connection and try again.</p>
                <button onclick="window.posRetryFetch()" style="margin-top: 16px; padding: 8px 20px; border-radius: 8px; border: 1px solid #e0e7ff; background: #eff6ff; color: #4338ca; font-weight: 600; cursor: pointer; font-size: 0.85rem;">Retry</button>
            </div>
        `;
    }
}

window.posRetryFetch = function () { fetchProducts(); };

// --- API: Fetch Customers ---
async function fetchCustomers() {
    try {
        const response = await fetchWithAuth(API.READ_CUSTOMERS, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        }, FEATURES.CUSTOMERS_MANAGEMENT, 'read');

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0 && data[0].customers) {
                allCustomers = data[0].customers;
            } else {
                allCustomers = Array.isArray(data) ? data : (data.customers || []);
            }
        }
    } catch (err) {
        console.error('POS: Error fetching customers:', err);
    }
}

// --- Render Products Grid ---
function renderProducts(products) {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!products || products.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 40px;">
                <p style="margin: 0; font-size: 0.95rem; font-weight: 500;">No products found.</p>
            </div>
        `;
        return;
    }

    products.forEach(product => {
        const id = product.id || product.product_id;
        const name = product.product_name || product.name || 'Unnamed Product';
        const price = Number(product.price) || 0;
        const stock = Number(product.stock_quantity) || 0;
        const category = product.category_name || '';
        const isOutOfStock = stock === 0;

        const card = document.createElement('div');
        card.className = 'pos-product-card';
        card.style.cssText = `
            background: #ffffff;
            border: 1px solid ${isOutOfStock ? '#fca5a5' : '#e2e8f0'};
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: ${isOutOfStock ? '0.65' : '1'};
        `;

        // Generate a consistent color from a palette for the product avatar
        const colors = ['#e0e7ff', '#d1fae5', '#fef3c7', '#fee2e2', '#ede9fe', '#dbeafe'];
        const textColors = ['#4338ca', '#059669', '#d97706', '#dc2626', '#7c3aed', '#1d4ed8'];
        const colorIdx = name.charCodeAt(0) % colors.length;
        const avatarBg = colors[colorIdx];
        const avatarColor = textColors[colorIdx];
        const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

        card.innerHTML = `
            <div style="height: 120px; background: ${avatarBg}; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 2.5rem; font-weight: 700; color: ${avatarColor}; letter-spacing: -2px;">${initials}</span>
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.92); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.88rem; color: #0f172a; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                    ₹${price}
                </div>
                ${isOutOfStock ? `<div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">OUT OF STOCK</div>` : ''}
                ${!isOutOfStock && stock <= 5 ? `<div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: #f97316; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">LOW: ${stock} left</div>` : ''}
            </div>
            <div style="padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <h3 style="font-size: 0.9rem; font-weight: 600; color: #334155; margin: 0 0 4px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${name}</h3>
                    ${category ? `<span style="font-size: 0.74rem; background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 500;">${category}</span>` : ''}
                </div>
                <button 
                    onclick="${isOutOfStock ? '' : `window.addToCart('${id}')`}"
                    ${isOutOfStock ? 'disabled' : ''}
                    style="margin-top: auto; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid ${isOutOfStock ? '#e2e8f0' : '#e0e7ff'}; background: ${isOutOfStock ? '#f8fafc' : '#eef2ff'}; color: ${isOutOfStock ? '#94a3b8' : '#4f46e5'}; font-weight: 600; font-size: 0.85rem; cursor: ${isOutOfStock ? 'not-allowed' : 'pointer'}; transition: all 0.2s;">
                    ${isOutOfStock ? 'Out of Stock' : '+ Add to Sale'}
                </button>
            </div>
        `;

        if (!isOutOfStock) {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                card.style.borderColor = '#c7d2fe';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
                card.style.borderColor = '#e2e8f0';
            });
        }

        grid.appendChild(card);
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    // Search products
    const searchInput = document.getElementById('posSearchProduct');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                renderProducts(liveProducts);
                return;
            }
            const filtered = liveProducts.filter(p =>
                (p.product_name || p.name || '').toLowerCase().includes(term) ||
                (p.category_name || '').toLowerCase().includes(term)
            );
            renderProducts(filtered);
        });
    }

    // Customer Selection Logic (Phone-number driven, like New Booking modal)
    const custSearch = document.getElementById('posCustomerSearch');
    const custSuggestions = document.getElementById('posCustomerSuggestions');
    const custNameField = document.getElementById('posCustomerName');
    const custPhoneField = document.getElementById('posCustomerPhone');

    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            // Strip non-digit chars for clean progressive phone matching
            const raw = e.target.value.trim();
            const digits = raw.replace(/\D/g, '');

            if (!digits) {
                custSuggestions.style.display = 'none';
                return;
            }

            const filtered = allCustomers.filter(c => {
                const phoneStr = (c.customer_phone || c.phone_number || '').toString();
                return phoneStr.replace(/\D/g, '').includes(digits);
            });

            if (filtered.length === 0) {
                custSuggestions.innerHTML = `
                    <div style="padding: 14px 12px; color: #64748b; font-size: 0.85rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <span style="font-size: 1.2rem;">🔍</span>
                        <span>No customer found with this number</span>
                    </div>`;
            } else {
                custSuggestions.innerHTML = filtered.slice(0, 8).map(c => {
                    const phone = (c.customer_phone || c.phone_number || '').toString();
                    const fullName = (c.customer_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Unknown';
                    const custId = c.id || c.customer_id;

                    // Highlight matched digits in the phone number
                    const highlightedPhone = phone.replace(
                        new RegExp(digits.split('').join('\\D*'), 'g'),
                        match => `<strong style="color: #4f46e5;">${match}</strong>`
                    );

                    // Build initials avatar
                    const initials = fullName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
                    const colors = ['#e0e7ff', '#d1fae5', '#fef3c7', '#ede9fe', '#dbeafe'];
                    const textColors = ['#4338ca', '#059669', '#d97706', '#7c3aed', '#1d4ed8'];
                    const ci = (initials.charCodeAt(0) || 0) % colors.length;

                    return `
                        <div class="cust-suggestion-item" data-id="${custId}"
                            style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; transition: background 0.15s;"
                            onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background='transparent'">
                            <div style="width: 34px; height: 34px; border-radius: 50%; background: ${colors[ci]}; color: ${textColors[ci]}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0;">${initials}</div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 0.88rem; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fullName}</div>
                                <div style="font-size: 0.75rem; color: #64748b; margin-top: 1px;">${highlightedPhone}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            custSuggestions.style.display = 'block';
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
            if (custSearch && custSuggestions && !custSearch.contains(e.target) && !custSuggestions.contains(e.target)) {
                custSuggestions.style.display = 'none';
            }
        });

        // Handle suggestion selection
        if (custSuggestions) {
            custSuggestions.addEventListener('click', (e) => {
                const item = e.target.closest('.cust-suggestion-item');
                if (item) {
                    const id = item.dataset.id;
                    const customer = allCustomers.find(c => (c.id || c.customer_id) == id);
                    if (customer) {
                        selectedCustomer = customer;
                        const fullName = (customer.customer_name || `${customer.first_name || ''} ${customer.last_name || ''}`).trim() || '';
                        const phone = (customer.customer_phone || customer.phone_number || '').toString();

                        custSearch.value = phone;
                        if (custNameField) custNameField.value = fullName;
                        if (custPhoneField) custPhoneField.value = phone;
                        custSuggestions.style.display = 'none';
                    }
                }
            });
        }
    }

    // Add Customer Modal Logic
    const btnOpenAddCustomer = document.getElementById('btnOpenAddCustomer');
    const addCustOverlay = document.getElementById('addCustomerModalOverlay');
    const btnCloseAddCustomer = document.getElementById('closeAddCustomerModal');
    const btnCancelAddCustomer = document.getElementById('btnCancelAddCustomer');
    const btnSaveCustomer = document.getElementById('btnSaveNewCustomer');

    if (btnOpenAddCustomer && addCustOverlay) {
        btnOpenAddCustomer.addEventListener('click', () => {
            addCustOverlay.classList.add('active');
            if (typeof feather !== 'undefined') feather.replace();
        });

        const closeAddModal = () => {
            addCustOverlay.classList.remove('active');
            const n = document.getElementById('newCustName');
            const p = document.getElementById('newCustPhone');
            const e = document.getElementById('newCustEmail');
            const d = document.getElementById('newCustDob');
            const nt = document.getElementById('newCustNotes');
            if (n) n.value = '';
            if (p) p.value = '';
            if (e) e.value = '';
            if (d) d.value = '';
            if (nt) nt.value = '';
        };

        if (btnCloseAddCustomer) btnCloseAddCustomer.addEventListener('click', closeAddModal);
        if (btnCancelAddCustomer) btnCancelAddCustomer.addEventListener('click', closeAddModal);

        // Close on backdrop click
        addCustOverlay.addEventListener('click', (e) => {
            if (e.target === addCustOverlay) closeAddModal();
        });

        if (btnSaveCustomer) {
            btnSaveCustomer.addEventListener('click', async () => {
                const fullName = (document.getElementById('newCustName')?.value || '').trim();
                const phone = (document.getElementById('newCustPhone')?.value || '').trim();
                const email = (document.getElementById('newCustEmail')?.value || '').trim();

                if (!fullName || !phone) {
                    alert('Please fill in Full Name and Phone Number');
                    return;
                }

                btnSaveCustomer.disabled = true;
                btnSaveCustomer.textContent = 'Saving...';

                try {
                    const payload = {
                        company_id: getCompanyId(),
                        branch_id: getBranchId(),
                        full_name: fullName,
                        phone_number: phone,
                        email: email,
                        notes: 'Added from POS'
                    };

                    const res = await fetchWithAuth(API.CREATE_CUSTOMER, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    }, FEATURES.CUSTOMERS_MANAGEMENT, 'create');

                    if (!res.ok) throw new Error('Failed to create customer');

                    // Refresh customers list in background
                    await fetchCustomers();

                    // Immediately populate the POS fields
                    if (custSearch) custSearch.value = fullName;
                    if (custNameField) custNameField.value = fullName;
                    if (custPhoneField) custPhoneField.value = phone;

                    closeAddModal();
                } catch (err) {
                    console.error(err);
                    alert('Failed to save customer. Please try again.');
                } finally {
                    btnSaveCustomer.disabled = false;
                    btnSaveCustomer.textContent = 'Save Customer';
                }
            });
        }
    }

    // Payment Methods
    const payBtns = document.querySelectorAll('.pay-method-btn');
    payBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            payBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = '#ffffff';
                b.style.borderColor = '#e2e8f0';
                b.style.color = '#475569';
            });
            e.target.classList.add('active');
            e.target.style.background = '#eef2ff';
            e.target.style.borderColor = '#e0e7ff';
            e.target.style.color = '#4338ca';
            currentPaymentMethod = e.target.dataset.method;
        });
    });

    // Complete Sale Logic & Cash Confirmation
    const btnComplete = document.getElementById('btnCompleteSale');
    const cashConfirmOverlay = document.getElementById('cashConfirmOverlay');
    const btnCancelCashConfirm = document.getElementById('btnCancelCashConfirm');
    const btnProceedCashConfirm = document.getElementById('btnProceedCashConfirm');

    const finalizeSale = async () => {
        const originalBtnText = btnComplete.textContent;
        btnComplete.textContent = 'Processing...';
        btnComplete.disabled = true;

        try {
            const customerName = (selectedCustomer?.customer_name || `${selectedCustomer?.first_name || ''} ${selectedCustomer?.last_name || ''}`).trim() || '';
            const customerPhone = (selectedCustomer?.customer_phone || selectedCustomer?.phone_number || '').toString();
            const customerId = selectedCustomer?.customer_id || selectedCustomer?.id || '';

            const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                customer_id: customerId,
                customer_name: customerName,
                customer_phone: customerPhone,
                total_amount: totalAmount,
                payment_method: currentPaymentMethod.charAt(0).toUpperCase() + currentPaymentMethod.slice(1),
                items: cart.map(item => ({
                    product_id: item.id,
                    product_name: item.name,
                    category_id: item.category_id || '',
                    price: item.price,
                    quantity: item.quantity
                }))
            };

            const res = await fetchWithAuth(API.CREATE_SALE, {
                method: 'POST',
                body: JSON.stringify(payload)
            }, FEATURES.POS_SYSTEM, 'create');

            if (!res.ok) throw new Error('Failed to complete sale');

            const toast = document.createElement('div');
            toast.className = 'toast-notification show';
            toast.textContent = 'Sale completed successfully!';
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

            // Reset state
            cart = [];
            selectedCustomer = null;
            updateCartUI();

            // Clear Customer Fields
            if (custSearch) custSearch.value = '';
            if (custNameField) custNameField.value = '';
            if (custPhoneField) custPhoneField.value = '';

            // Optional: refresh products to get new stock counts
            fetchProducts();

        } catch (err) {
            console.error('POS: Error completing sale:', err);
            alert('Failed to complete sale. Please try again.');
        } finally {
            btnComplete.textContent = originalBtnText;
            btnComplete.disabled = false;
        }
    };

    if (btnComplete) {
        btnComplete.addEventListener('click', () => {
            if (cart.length === 0) return;

            if (currentPaymentMethod === 'cash' && cashConfirmOverlay) {
                // Intercept and show confirmation modal for Cash
                cashConfirmOverlay.classList.add('active');
            } else {
                // Proceed immediately for Card / UPI
                finalizeSale();
            }
        });
    }

    if (cashConfirmOverlay) {
        // Cancel Confirmation
        const closeCashModal = () => cashConfirmOverlay.classList.remove('active');
        if (btnCancelCashConfirm) btnCancelCashConfirm.addEventListener('click', closeCashModal);
        cashConfirmOverlay.addEventListener('click', (e) => {
            if (e.target === cashConfirmOverlay) closeCashModal();
        });

        // Proceed Confirmation
        if (btnProceedCashConfirm) {
            btnProceedCashConfirm.addEventListener('click', () => {
                closeCashModal();
                finalizeSale();
            });
        }
    }
}

// --- Cart Logic ---
window.addToCart = function (productId) {
    const product = liveProducts.find(p => (p.id || p.product_id) == productId);
    if (!product) return;

    const id = product.id || product.product_id;
    const existingItem = cart.find(item => item.id == id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id,
            name: product.product_name || product.name,
            price: Number(product.price) || 0,
            stock: Number(product.stock_quantity) || 0,
            quantity: 1,
            category_id: product.category_id || '',
            category_name: product.category_name || ''
        });
    }

    updateCartUI();
};

window.updateQuantity = function (productId, delta) {
    const itemIndex = cart.findIndex(item => item.id == productId);
    if (itemIndex > -1) {
        cart[itemIndex].quantity += delta;
        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1);
        }
        updateCartUI();
    }
};

window.removeFromCart = function (productId) {
    cart = cart.filter(item => item.id != productId);
    updateCartUI();
};

function updateCartUI() {
    const cartList = document.getElementById('posCartList');
    const emptyState = document.getElementById('cartEmptyState');
    const itemCount = document.getElementById('cartItemCount');
    const subtotalEl = document.getElementById('cartSubtotal');
    const taxEl = document.getElementById('cartTax');
    const totalEl = document.getElementById('cartTotal');
    const btnComplete = document.getElementById('btnCompleteSale');

    if (!cartList) return;

    // Remove all children except empty state
    Array.from(cartList.children).forEach(child => {
        if (child.id !== 'cartEmptyState') child.remove();
    });

    if (cart.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        itemCount.textContent = '0 items';
        subtotalEl.textContent = '₹0';
        taxEl.textContent = '₹0';
        totalEl.textContent = '₹0';
        btnComplete.style.opacity = '0.5';
        btnComplete.style.cursor = 'not-allowed';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    let subtotal = 0;
    let totalItems = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        totalItems += item.quantity;

        const itemEl = document.createElement('div');
        itemEl.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            gap: 12px;
        `;

        itemEl.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <p style="font-size: 0.9rem; font-weight: 600; color: #334155; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</p>
                <p style="font-size: 0.8rem; color: #64748b; margin: 0;">₹${item.price} each</p>
            </div>
            <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px;">
                <button onclick="updateQuantity('${item.id}', -1)" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: #64748b; font-size: 1rem;">−</button>
                <span style="font-size: 0.85rem; font-weight: 600; width: 24px; text-align: center; color: #1e293b;">${item.quantity}</span>
                <button onclick="updateQuantity('${item.id}', 1)" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: #64748b; font-size: 1rem;">+</button>
            </div>
            <div style="text-align: right; min-width: 64px;">
                <p style="font-size: 0.95rem; font-weight: 700; color: #1e293b; margin: 0 0 4px 0;">₹${itemTotal}</p>
                <button onclick="removeFromCart('${item.id}')" style="background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer; padding: 0; font-weight: 500;">Remove</button>
            </div>
        `;
        cartList.appendChild(itemEl);
    });

    itemCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    subtotalEl.textContent = `₹${subtotal}`;
    taxEl.textContent = `₹0`;
    totalEl.textContent = `₹${subtotal}`;

    btnComplete.style.opacity = '1';
    btnComplete.style.cursor = 'pointer';
}
