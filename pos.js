// POS Initial Data
const posProducts = [
    { id: 'p1', name: 'Argan Oil Serum', price: 1500, category: 'product', image: 'https://images.unsplash.com/photo-1608248593802-8401a88be1f5?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'p2', name: 'Volumizing Shampoo', price: 800, category: 'product', image: 'https://images.unsplash.com/photo-1585232352861-1c5ea9a6502d?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'p3', name: 'Styling Gel (Firm Hold)', price: 500, category: 'product', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'p4', name: 'Moisturizing Conditioner', price: 900, category: 'product', image: 'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'p5', name: 'Heat Protection Spray', price: 1200, category: 'product', image: 'https://images.unsplash.com/photo-1617897903246-719242758050?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'p6', name: 'Matte Clay Pomade', price: 650, category: 'product', image: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?auto=format&fit=crop&q=80&w=200&h=200' },
];

let cart = [];
let currentPaymentMethod = 'cash';

// Initialize POS
document.addEventListener('DOMContentLoaded', () => {
    if(window.location.pathname.includes('pos.html')) {
        renderProducts(posProducts);
        setupEventListeners();
    }
});

function setupEventListeners() {
    // Search products
    const searchInput = document.getElementById('posSearchProduct');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = posProducts.filter(p => p.name.toLowerCase().includes(term));
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
            
            // Show toast
            const toast = document.createElement('div');
            toast.className = 'toast-notification show';
            toast.textContent = 'Sale completed successfully!';
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

            // Reset cart
            cart = [];
            updateCartUI();
            
            // Clear customer
            const custInput = document.getElementById('posCustomerSearch');
            if(custInput) custInput.value = '';
        });
    }
}

function renderProducts(products) {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (products.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 40px;">No products found matching your search.</div>`;
        return;
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'pos-product-card';
        card.style.cssText = `
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        
        card.innerHTML = `
            <div style="height: 140px; background: #f1f5f9; position: relative; overflow: hidden;">
                <img src="${product.image}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    ₹${product.price}
                </div>
            </div>
            <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 12px;">
                <h3 style="font-size: 0.95rem; font-weight: 600; color: #334155; margin: 0; line-height: 1.4;">${product.name}</h3>
                <button onclick="addToCart('${product.id}')" style="margin-top: auto; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #e0e7ff; background: #eef2ff; color: #4f46e5; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;">
                    + Add to Sale
                </button>
            </div>
        `;
        
        // Hover effects via JS for injection simplicity
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
            card.style.borderColor = '#cbd5e1';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
            card.style.borderColor = '#e2e8f0';
        });

        grid.appendChild(card);
    });
}

window.addToCart = function(productId) {
    const product = posProducts.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    updateCartUI();
};

window.updateQuantity = function(productId, delta) {
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex > -1) {
        cart[itemIndex].quantity += delta;
        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1);
        }
        updateCartUI();
    }
};

window.removeFromCart = function(productId) {
    cart = cart.filter(item => item.id !== productId);
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

    // Clear existing items (keep empty state hidden or shown)
    Array.from(cartList.children).forEach(child => {
        if (child.id !== 'cartEmptyState') {
            child.remove();
        }
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
                <p style="font-size: 0.8rem; color: #64748b; margin: 0;">₹${item.price}</p>
            </div>
            
            <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px;">
                <button onclick="updateQuantity('${item.id}', -1)" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: #64748b;">-</button>
                <span style="font-size: 0.85rem; font-weight: 600; width: 24px; text-align: center; color: #1e293b;">${item.quantity}</span>
                <button onclick="updateQuantity('${item.id}', 1)" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: #64748b;">+</button>
            </div>
            
            <div style="text-align: right; min-width: 60px;">
                <p style="font-size: 0.95rem; font-weight: 600; color: #1e293b; margin: 0 0 4px 0;">₹${itemTotal}</p>
                <button onclick="removeFromCart('${item.id}')" style="background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer; padding: 0;">Remove</button>
            </div>
        `;
        cartList.appendChild(itemEl);
    });

    itemCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    subtotalEl.textContent = `₹${subtotal}`;
    
    // Simple logic: Tax = 0 as requested
    const tax = 0;
    taxEl.textContent = `₹${tax}`;
    
    totalEl.textContent = `₹${subtotal + tax}`;
    
    btnComplete.style.opacity = '1';
    btnComplete.style.cursor = 'pointer';
}
