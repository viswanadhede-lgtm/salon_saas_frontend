import { API, fetchWithAuth } from './config/api.js';
import { FEATURES } from './config/feature-registry.js';

// --- Live Data ---
let liveProducts = [];
let liveCustomers = [];
let selectedPosCustomer = null;
let cart = [];
let currentPaymentMethod = 'cash';

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

// --- API: Fetch Customers (for POS customer search) ---
async function fetchCustomers() {
    try {
        const response = await fetchWithAuth(API.READ_CUSTOMERS, {
            method: 'POST',
            body: JSON.stringify({ company_id: getCompanyId(), branch_id: getBranchId() })
        }, FEATURES.CUSTOMERS_MANAGEMENT, 'read');

        if (!response.ok) return;
        const data = await response.json();
        const root = Array.isArray(data) ? data[0] : data;
        liveCustomers = root.customers || (Array.isArray(data) ? data : []);
    } catch (err) {
        console.error('POS: Error fetching customers:', err);
    }
}

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
    // --- Customer Search ---
    const customerSearchInput = document.getElementById('posCustomerSearch');
    const customerSuggestions = document.getElementById('posCustomerSuggestions');
    const customerSearchBox   = document.getElementById('posCustomerSearchBox');
    const selectedCustomerDiv = document.getElementById('posSelectedCustomer');
    const selectedNameInput   = document.getElementById('posSelectedCustomerName');
    const selectedPhoneInput  = document.getElementById('posSelectedCustomerPhone');
    const clearCustomerBtn    = document.getElementById('posClearCustomer');

    function showCustomerSelected(customer) {
        selectedPosCustomer = customer;
        const name  = customer.customer_name || customer.name || '';
        const phone = customer.customer_phone || customer.phone || '';
        if (selectedNameInput)  selectedNameInput.value  = name;
        if (selectedPhoneInput) selectedPhoneInput.value = phone;
        // Hide search, show selected card
        if (customerSearchBox)   customerSearchBox.style.display   = 'none';
        if (customerSuggestions) customerSuggestions.style.display = 'none';
        if (selectedCustomerDiv) selectedCustomerDiv.style.display = 'flex';
        if (window.feather) feather.replace();
    }

    function clearCustomerSelection() {
        selectedPosCustomer = null;
        if (customerSearchInput)  customerSearchInput.value = '';
        if (selectedNameInput)    selectedNameInput.value   = '';
        if (selectedPhoneInput)   selectedPhoneInput.value  = '';
        if (customerSearchBox)    customerSearchBox.style.display   = 'flex';
        if (selectedCustomerDiv)  selectedCustomerDiv.style.display = 'none';
        if (customerSuggestions)  customerSuggestions.style.display = 'none';
        if (customerSearchInput)  customerSearchInput.focus();
    }

    if (customerSearchInput) {
        customerSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (!val) {
                customerSuggestions.style.display = 'none';
                return;
            }
            const matches = liveCustomers.filter(c => {
                const phone = String(c.customer_phone || c.phone || '');
                const name  = String(c.customer_name  || c.name  || '').toLowerCase();
                return phone.includes(val) || name.includes(val.toLowerCase());
            }).slice(0, 8);

            customerSuggestions.innerHTML = '';
            if (matches.length === 0) {
                customerSuggestions.innerHTML = `<div style="padding:12px 16px; font-size:0.875rem; color:#94a3b8;">No customers found</div>`;
            } else {
                matches.forEach(m => {
                    const name  = m.customer_name || m.name || 'Unknown';
                    const phone = m.customer_phone || m.phone || '';
                    const item = document.createElement('div');
                    item.style.cssText = `padding:10px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; font-size:0.875rem; transition:background 0.15s;`;
                    item.innerHTML = `
                        <span style="font-weight:600; color:#334155;">${name}</span>
                        <span style="color:#64748b; font-size:0.8rem;">${phone}</span>
                    `;
                    item.addEventListener('mouseenter', () => item.style.background = '#f8fafc');
                    item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault(); // prevent blur before click fires
                        showCustomerSelected(m);
                    });
                    customerSuggestions.appendChild(item);
                });
            }
            customerSuggestions.style.display = 'block';
        });

        customerSearchInput.addEventListener('blur', () => {
            setTimeout(() => { if (customerSuggestions) customerSuggestions.style.display = 'none'; }, 150);
        });
    }

    if (clearCustomerBtn) {
        clearCustomerBtn.addEventListener('click', clearCustomerSelection);
    }

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
        if (customerSuggestions && customerSearchInput &&
            !customerSearchInput.contains(e.target) &&
            !customerSuggestions.contains(e.target)) {
            customerSuggestions.style.display = 'none';
        }
    });

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

    // Complete Sale
    const btnComplete = document.getElementById('btnCompleteSale');
    if (btnComplete) {
        btnComplete.addEventListener('click', () => {
            if (cart.length === 0) return;

            const toast = document.createElement('div');
            toast.className = 'toast-notification show';
            toast.textContent = 'Sale completed successfully!';
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

            cart = [];
            updateCartUI();

            const custInput = document.getElementById('posCustomerSearch');
            if (custInput) custInput.value = '';
        });
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
            quantity: 1
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
