import { supabase } from './lib/supabase.js';

// --- Live Data ---
let liveProducts = [];
let cart = [];
let currentPaymentMethod = 'cash';
let allCustomers = [];
let selectedCustomer = null;

// --- Helpers ---
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || null;
}

function showToast(msg, isError = false) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? '#dc2626' : '#10b981';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove && toast.parentNode && toast.remove(), 300);
    }, 3000);
}

// --- Boot ---
function initPos() {
    // Standardize initialization - if POS grid exists, we are on POS page
    if (document.getElementById('posProductGrid')) {
        if (localStorage.getItem('pos_cart_reset_flag') === 'true') {
            localStorage.removeItem('pos_cart_reset_flag');
            cart = [];
            selectedCustomer = null;
        }
        setupEventListeners();
        fetchProducts();
        fetchCustomers();
        if (typeof updateCartUI === 'function') updateCartUI();

        // Listen for global branch switch
        window.addEventListener('branch:changed', async (e) => {
            console.log('[POS] Branch changed to:', e.detail?.branchName, e.detail?.branchId);
            cart = [];
            selectedCustomer = null;
            if (typeof updateCartUI === 'function') updateCartUI();
            await fetchProducts();
            await fetchCustomers();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPos);
} else {
    initPos();
}

// --- Supabase: Fetch Products ---
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
        const companyId = getCompanyId();
        const branchId = getBranchId();

        let query = supabase
            .from('products')
            .select('*');

        if (companyId) {
            query = query.eq('company_id', companyId);
        }
        if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Only show Active products
        liveProducts = (data || []).filter(p => {
            const status = (p.status || 'active').toLowerCase();
            return status === 'active';
        });

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

// --- Supabase: Fetch Customers ---
async function fetchCustomers() {
    try {
        const companyId = getCompanyId();
        const branchId = getBranchId();

        let query = supabase
            .from('customers')
            .select('*');

        if (companyId) query = query.eq('company_id', companyId);
        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;

        if (error) throw error;
        allCustomers = data || [];
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
        const id = product.product_id || product.id;
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

        const colors = ['#e0e7ff', '#d1fae5', '#fef3c7', '#fee2e2', '#ede9fe', '#dbeafe'];
        const textColors = ['#4338ca', '#059669', '#d97706', '#dc2626', '#7c3aed', '#1d4ed8'];
        const colorIdx = name.charCodeAt(0) % colors.length;
        const avatarBg = colors[colorIdx];
        const avatarColor = textColors[colorIdx];
        const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const imgUrl = product.product_image_url || product.image_url || product.photo_url;

        card.innerHTML = `
            <div style="height: 120px; background: ${avatarBg}; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                ${imgUrl 
                    ? `<img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="${name}" data-initials="${initials}" data-color="${avatarColor}">`
                    : `<span style="font-size: 2.5rem; font-weight: 700; color: ${avatarColor}; letter-spacing: -2px;">${initials}</span>`
                }
                ${isOutOfStock ? `<div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">OUT OF STOCK</div>` : ''}
                ${!isOutOfStock && stock <= 5 ? `<div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: #f97316; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">LOW: ${stock} left</div>` : ''}
            </div>
            <div style="padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="min-width: 0; flex: 1;">
                        <h3 style="font-size: 0.9rem; font-weight: 600; color: #334155; margin: 0 0 4px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${name}</h3>
                        ${category ? `<span style="font-size: 0.74rem; background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 500;">${category}</span>` : ''}
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #0f172a; white-space: nowrap;">
                        ₹${price}
                    </div>
                </div>
                <button 
                    onclick="${isOutOfStock ? '' : `window.addToCart('${id}')`}"
                    ${isOutOfStock ? 'disabled' : ''}
                    style="margin-top: auto; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid ${isOutOfStock ? '#e2e8f0' : '#e0e7ff'}; background: ${isOutOfStock ? '#f8fafc' : '#eef2ff'}; color: ${isOutOfStock ? '#94a3b8' : '#4f46e5'}; font-weight: 600; font-size: 0.85rem; cursor: ${isOutOfStock ? 'not-allowed' : 'pointer'}; transition: all 0.2s;">
                    ${isOutOfStock ? 'Out of Stock' : '+ Add to Sale'}
                </button>
            </div>
        `;

        // Attach onerror fallback AFTER innerHTML is set (can't use inline onerror with template literals safely)
        if (imgUrl) {
            const imgEl = card.querySelector('img');
            if (imgEl) {
                imgEl.onerror = function () {
                    const fallbackInitials = this.dataset.initials || '?';
                    const fallbackColor = this.dataset.color || '#4338ca';
                    const span = document.createElement('span');
                    span.style.cssText = `font-size: 2.5rem; font-weight: 700; color: ${fallbackColor}; letter-spacing: -2px;`;
                    span.textContent = fallbackInitials;
                    this.replaceWith(span);
                };
            }
        }


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

    // Customer Selection Logic (Phone-number driven)
    const custSearch = document.getElementById('posCustomerSearch');
    const custSuggestions = document.getElementById('posCustomerSuggestions');
    const custNameField = document.getElementById('posCustomerName');
    const custPhoneField = document.getElementById('posCustomerPhone');
    const clearBtn = document.getElementById('posClearCustomer');

    // Show/hide clear button based on input content
    function updateClearBtn() {
        if (clearBtn) clearBtn.style.display = custSearch && custSearch.value.length > 0 ? 'inline-block' : 'none';
    }

    // Clear button resets everything
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (custSearch) custSearch.value = '';
            if (custNameField) custNameField.value = '';
            if (custPhoneField) custPhoneField.value = '';
            if (custSuggestions) custSuggestions.style.display = 'none';
            selectedCustomer = null;
            updateClearBtn();
            if (custSearch) custSearch.focus();
        });
    }

    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            updateClearBtn();
            const raw = e.target.value.trim();
            const digits = raw.replace(/\D/g, '');

            if (!digits) {
                custSuggestions.style.display = 'none';
                return;
            }

            const filtered = allCustomers.filter(c => {
                const phoneStr = (c.customer_phone || c.phone || '').toString();
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
                    const phone = (c.customer_phone || c.phone || '').toString();
                    const fullName = (c.customer_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Unknown';
                    const custId = c.customer_id || c.id;

                    const highlightedPhone = phone.replace(
                        new RegExp(digits.split('').join('\\D*'), 'g'),
                        match => `<strong style="color: #4f46e5;">${match}</strong>`
                    );

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

        document.addEventListener('click', (e) => {
            if (custSearch && custSuggestions && !custSearch.contains(e.target) && !custSuggestions.contains(e.target)) {
                custSuggestions.style.display = 'none';
            }
        });

        if (custSuggestions) {
            custSuggestions.addEventListener('click', (e) => {
                const item = e.target.closest('.cust-suggestion-item');
                if (item) {
                    const id = item.dataset.id;
                    const customer = allCustomers.find(c => (c.customer_id || c.id) == id);
                    if (customer) {
                        selectedCustomer = customer;
                        const fullName = (customer.customer_name || `${customer.first_name || ''} ${customer.last_name || ''}`).trim() || '';
                        const phone = (customer.customer_phone || customer.phone || '').toString();

                        custSearch.value = phone;
                        if (custNameField) custNameField.value = fullName;
                        if (custPhoneField) custPhoneField.value = phone;
                        custSuggestions.style.display = 'none';
                    }
                }
            });
        }
    }

    // Add Customer Button — delegates to global modal
    const btnOpenAddCustomer = document.getElementById('btnOpenAddCustomer');
    if (btnOpenAddCustomer) {
        btnOpenAddCustomer.addEventListener('click', () => {
            if (typeof window.openGlobalAddCustomerModal === 'function') {
                window.openGlobalAddCustomerModal(async (newCustomer) => {
                    // Refresh local customers list
                    await fetchCustomers();

                    // Auto-select the newly created customer
                    if (newCustomer) {
                        selectedCustomer = newCustomer;
                        if (window.notifyEvent) {
                            window.notifyEvent('pos', 'evt_pos_customer_added', {
                                title: 'New Customer Added via POS',
                                message: `${newCustomer.customer_name || 'Customer'} was added via POS.`
                            });
                        }
                        const fullName = newCustomer.customer_name || '';
                        const phone = newCustomer.customer_phone || '';

                        const custSearch = document.getElementById('posCustomerSearch');
                        const custNameField = document.getElementById('posCustomerName');
                        const custPhoneField = document.getElementById('posCustomerPhone');

                        if (custSearch) custSearch.value = phone;
                        if (custNameField) custNameField.value = fullName;
                        if (custPhoneField) custPhoneField.value = phone;
                    }
                });
            }
        });
    }

    // Payment Methods Selection (Inside Modal)
    function setupPaymentMethodListeners() {
        const payBtns = document.querySelectorAll('.pay-method-btn');
        payBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                payBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#ffffff';
                    b.style.borderColor = '#f1f5f9';
                    b.style.color = '#64748b';
                });
                target.classList.add('active');
                target.style.background = '#eef2ff';
                target.style.borderColor = '#e0e7ff';
                target.style.color = '#4338ca';
                currentPaymentMethod = target.dataset.method;
            });
        });
    }
    setupPaymentMethodListeners();

    // Complete Sale Logic (Modal Driven)
    const btnCollect = document.getElementById('btnCompleteSale');

    const openCollectModal = () => {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        console.log('POS: Open Collect Modal - Items:', cart.length, 'Total:', total);
        
        if (cart.length === 0) {
            showToast('Please add items to your cart first.', true);
            return;
        }

        // Validate Customer selection
        const customerName = (selectedCustomer?.customer_name || document.getElementById('posCustomerName')?.value || '').trim();
        const customerPhone = (selectedCustomer?.customer_phone || document.getElementById('posCustomerPhone')?.value || '').trim();

        if (!customerName || !customerPhone) {
            showToast('Please select or add a customer first.', true);
            const searchField = document.getElementById('posCustomerSearch');
            if (searchField) {
                searchField.style.borderColor = '#ef4444';
                searchField.focus();
                setTimeout(() => { searchField.style.borderColor = ''; }, 2000);
            }
            return;
        }

        const customerId = selectedCustomer?.customer_id || selectedCustomer?.id || null;
        const shortDisplayId = Math.random().toString(36).substring(2, 10).toUpperCase();
        const saleGroupUUID = crypto.randomUUID();

        let staffName = 'Staff';
        let staffId = null;
        try {
            const contextStr = localStorage.getItem('appContext');
            if (contextStr) {
                const ctx = JSON.parse(contextStr);
                staffId = ctx?.user?.user_id || ctx?.user?.id || localStorage.getItem('user_id') || null;
                if (ctx?.user?.first_name) {
                    staffName = ctx.user.first_name;
                } else if (ctx?.user?.name) {
                    staffName = ctx.user.name.split(' ')[0];
                }
            }
        } catch (e) {
            console.warn('Could not parse appContext for staff details:', e);
        }

        const serviceIds = cart
            .filter(item => item.type === 'service' || item.service_id)
            .map(item => item.service_id || item.id)
            .filter(Boolean);

        if (window.openGlobalPaymentModal) {
            window.openGlobalPaymentModal({
                type: 'pos',
                saleId: shortDisplayId,
                customerId: customerId,
                customerName: customerName,
                customerPhone: customerPhone,
                totalAmount: total,
                amountDue: total,
                serviceIds: serviceIds,
                staffName: staffName,
                items: cart.map(item => ({
                    name: item.name,
                    category: item.category_name,
                    staff: staffName,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity
                })),
                onComplete: async (payload) => {
                    await finalizeSale(payload, saleGroupUUID);
                }
            });
        } else {
            showToast('Payment modal not loaded', true);
        }
    };

    if (btnCollect) btnCollect.addEventListener('click', openCollectModal);

    const finalizeSale = async (payload, saleGroupId) => {
        try {
            const customerName = (selectedCustomer?.customer_name || `${selectedCustomer?.first_name || ''} ${selectedCustomer?.last_name || ''}`).trim() || '';
            const customerPhone = (selectedCustomer?.customer_phone || selectedCustomer?.phone || '').toString();
            const customerId = selectedCustomer?.customer_id || selectedCustomer?.id || null;

            const amountCollected = payload.amountCollected;
            const paymentMethod = payload.paymentMethod;

            let staffName = 'System';
            let staffId = null;
            try {
                const contextStr = localStorage.getItem('appContext');
                if (contextStr) {
                    const ctx = JSON.parse(contextStr);
                    staffId = ctx?.user?.user_id || ctx?.user?.id || localStorage.getItem('user_id') || null;
                    if (ctx?.user?.first_name) {
                        staffName = ctx.user.first_name;
                    } else if (ctx?.user?.name) {
                        staffName = ctx.user.name.split(' ')[0];
                    }
                }
            } catch (e) {
                console.warn('Could not parse appContext for staff details:', e);
            }
            
            // 1. Calculate totals and discounts
            const totalOriginal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const totalDiscount = Math.max(0, totalOriginal - amountCollected);
            const d = payload.discounts || {};
            let discountType = null;
            let discountName = null;
            let discountId = null;
            if (d.couponCode) {
                discountType = 'coupon';
                discountName = d.couponCode;
                discountId = d.couponId || null;
            } else if (d.offerName) {
                discountType = 'offer';
                discountName = d.offerName;
                discountId = d.offerId || null;
            } else if (d.membershipName) {
                discountType = 'membership';
                discountName = d.membershipName;
                discountId = d.membershipId || null;
            } else if (d.manualValue > 0) {
                discountType = 'manual';
                discountName = d.manualType === 'percent' ? `${d.manualValue}% off` : `₹${d.manualValue} off`;
            }

            // 2. Atomic RPC Call:
            // - Deducts & validates product stock in products table
            // - Inserts all product line items into sales table
            // - Inserts consolidated summary row into sales_for_business_transactions
            // - Automatically triggers trg_create_pos_business_transaction into business_transactions
            const { data: rpcResult, error: rpcError } = await supabase.rpc('create_pos_sale_atomic', {
                p_company_id: getCompanyId(),
                p_branch_id: getBranchId(),
                p_sale_id: saleGroupId,
                p_customer_id: customerId,
                p_customer_name: customerName,
                p_customer_phone: customerPhone,
                p_payment_method: (paymentMethod || 'cash').toLowerCase(),
                p_staff_id: staffId,
                p_staff_name: staffName,
                p_items: cart.map(item => ({
                    product_id: item.id,
                    product_name: item.name,
                    category_id: item.category_id || null,
                    category_name: item.category_name || '',
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0
                })),
                p_discount_type: discountType,
                p_discount_name: discountName,
                p_discount_id: discountId,
                p_discount_amount: totalDiscount > 0 ? totalDiscount : 0,
                p_final_amount: Number(amountCollected) || 0
            });

            if (rpcError) {
                console.error('POS: Atomic sale creation failed:', rpcError);
                throw new Error(rpcError.message || rpcError.details || 'Failed to complete POS sale.');
            }

            // 3. Trigger low-stock alerts from RPC result
            if (rpcResult?.deducted_items && window.notifyEvent) {
                const deductedList = Array.isArray(rpcResult.deducted_items)
                    ? rpcResult.deducted_items.flat()
                    : [];
                for (const dItem of deductedList) {
                    if (Number(dItem.remaining_stock) <= 5) {
                        window.notifyEvent('pos', 'evt_pos_low_stock', {
                            title: 'Low Stock Alert',
                            message: `${dItem.product_name} stock dropped to ${dItem.remaining_stock} (threshold: 5).`
                        });
                    }
                }
            }

            showToast('✓ Sale completed successfully!');
            if (window.notifyEvent) {
                window.notifyEvent('pos', 'evt_pos_sale_completed', {
                    title: 'Sale Completed',
                    message: `Sale of ₹${amountCollected} completed for ${customerName || 'Walk-in'}.`
                });
            }
            if (window.notifyCustomer && customerName) {
                const custInfo = {
                    id: selectedCustomer?.customer_id || selectedCustomer?.id,
                    name: customerName,
                    phone: customerPhone,
                    email: selectedCustomer?.email || ''
                };
                window.notifyCustomer('purchase', 'purchase_confirm', custInfo, {
                    amount: amountCollected,
                    itemsCount: cart.length,
                    paymentMethod: paymentMethod
                });
                window.notifyCustomer('purchase', 'payment_confirm', custInfo, {
                    amount: amountCollected,
                    paymentMethod: paymentMethod
                });
                window.notifyCustomer('purchase', 'invoice_receipt', custInfo, {
                    amount: amountCollected,
                    paymentMethod: paymentMethod
                });
            }

            // Reset state
            cart = [];
            selectedCustomer = null;
            updateCartUI();

            // Clear customer fields
            const custSearch = document.getElementById('posCustomerSearch');
            const custNameField = document.getElementById('posCustomerName');
            const custPhoneField = document.getElementById('posCustomerPhone');
            if (custSearch) custSearch.value = '';
            if (custNameField) custNameField.value = '';
            if (custPhoneField) custPhoneField.value = '';

            // Refresh products to get updated stock counts
            fetchProducts();

        } catch (err) {
            console.error('POS: Error completing sale:', err);
            showToast('Failed to complete sale: ' + (err.message || 'Unknown error'), true);
            throw err; // throw so the modal stays open if it fails
        }
    };
}

// --- Cart Logic ---
window.addToCart = function (productId) {
    const product = liveProducts.find(p => (p.product_id || p.id) == productId);
    if (!product) return;

    const id = product.product_id || product.id;
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
            category_id: product.category_id || null,
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

    Array.from(cartList.children).forEach(child => {
        if (child.id !== 'cartEmptyState') child.remove();
    });

    if (cart.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (itemCount) itemCount.textContent = '0 items';
        if (subtotalEl) subtotalEl.textContent = '₹0';
        if (taxEl) taxEl.textContent = '₹0';
        if (totalEl) totalEl.textContent = '₹0';
        if (btnComplete) { btnComplete.style.opacity = '0.5'; btnComplete.style.cursor = 'not-allowed'; }
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

    if (itemCount) itemCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal}`;
    if (taxEl) taxEl.textContent = `₹0`;
    if (totalEl) totalEl.textContent = `₹${subtotal}`;

    if (btnComplete) { 
        btnComplete.style.opacity = '1'; 
        btnComplete.style.cursor = 'pointer'; 
        btnComplete.style.pointerEvents = 'auto';
        btnComplete.disabled = false;
    }
}
