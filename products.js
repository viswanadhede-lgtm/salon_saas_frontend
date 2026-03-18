// ── Mock Data ──────────────────────────────────────────────────────────────
const mockProducts = [
    { id: '1', name: 'Argan Oil Serum',         category: 'Hair Care', price: 1500, stock: 12, status: 'Active' },
    { id: '2', name: 'Volumizing Shampoo',       category: 'Hair Care', price: 800,  stock: 20, status: 'Active' },
    { id: '3', name: 'Styling Gel',              category: 'Styling',   price: 500,  stock: 15, status: 'Active' },
    { id: '4', name: 'Color Protect Conditioner',category: 'Hair Care', price: 950,  stock: 4,  status: 'Active' },
    { id: '5', name: 'Hydrating Face Mist',      category: 'Skin Care', price: 650,  stock: 8,  status: 'Inactive' },
    { id: '6', name: 'Matte Clay Pomade',        category: 'Styling',   price: 700,  stock: 0,  status: 'Active' }
];

const mockCategories = [
    { id: 'c1', name: 'Hair Care',         productCount: 6, status: 'Active' },
    { id: 'c2', name: 'Skin Care',         productCount: 4, status: 'Active' },
    { id: 'c3', name: 'Styling Products',  productCount: 3, status: 'Active' },
    { id: 'c4', name: 'Accessories',       productCount: 0, status: 'Inactive' }
];

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    initTables();
    initModals();
});

// ── Tabs ───────────────────────────────────────────────────────────────────
function initTabs() {
    document.getElementById('productsCountBadge').textContent  = mockProducts.length;
    document.getElementById('categoriesCountBadge').textContent = mockCategories.length;

    var tabBtns = document.querySelectorAll('.tab-btn');
    var primaryActionBtn  = document.getElementById('primaryActionBtn');
    var primaryActionText = document.getElementById('primaryActionText');
    var filterBtn    = document.getElementById('filterBtn');
    var searchInput  = document.getElementById('searchInput');

    tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            // Reset all
            tabBtns.forEach(function (b) {
                b.style.color = '#64748b';
                b.style.borderBottomColor = 'transparent';
                b.style.fontWeight = '500';
                var badge = b.querySelector('span');
                if (badge) { badge.style.background = '#f1f5f9'; badge.style.color = '#64748b'; }
                b.classList.remove('active');
            });
            document.getElementById('tabProducts').style.display   = 'none';
            document.getElementById('tabCategories').style.display = 'none';

            // Activate clicked tab
            btn.style.color = '#4338ca';
            btn.style.borderBottomColor = '#4338ca';
            btn.style.fontWeight = '600';
            var activeBadge = btn.querySelector('span');
            if (activeBadge) { activeBadge.style.background = '#e0e7ff'; activeBadge.style.color = '#4338ca'; }
            btn.classList.add('active');

            var target = btn.getAttribute('data-target');
            if (target === 'products') {
                document.getElementById('tabProducts').style.display = 'block';
                searchInput.placeholder  = 'Search products...';
                filterBtn.style.display  = 'flex';
                primaryActionText.textContent = 'Add Product';
                primaryActionBtn.onclick = openAddProductModal;
            } else {
                document.getElementById('tabCategories').style.display = 'block';
                searchInput.placeholder  = 'Search categories...';
                filterBtn.style.display  = 'none';
                primaryActionText.textContent = 'Add Category';
                primaryActionBtn.onclick = openAddCategoryModal;
            }
        });
    });

    // Default action for primary button
    if (primaryActionBtn) { primaryActionBtn.onclick = openAddProductModal; }
}

// ── Tables ─────────────────────────────────────────────────────────────────
function initTables() {
    renderFilterOptions();
    renderProductsTable();
    renderCategoriesTable();
}

function stockBadge(stock) {
    if (stock === 0)   return '<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#fee2e2;color:#ef4444;">Out of Stock</span>';
    if (stock <= 5)    return '<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#ffedd5;color:#f97316;">Low (' + stock + ')</span>';
    return '<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:600;background:#d1fae5;color:#10b981;">In Stock (' + stock + ')</span>';
}

function statusBadge(status) {
    var active = status === 'Active';
    var bg    = active ? '#f0fdf4' : '#f1f5f9';
    var color = active ? '#16a34a' : '#64748b';
    var border = active ? '#bbf7d0' : '#e2e8f0';
    return '<span style="padding:3px 9px;border-radius:12px;font-size:0.72rem;font-weight:500;background:' + bg + ';color:' + color + ';border:1px solid ' + border + ';">' +
           '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right:5px;vertical-align:middle;"></span>' +
           status + '</span>';
}

function renderProductsTable() {
    var tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    // If simple filtering is applied
    var filteredProducts = mockProducts;
    var selectedCategory = document.querySelector('input[name="filterCategory"]:checked');
    if (selectedCategory && selectedCategory.value !== 'all') {
        filteredProducts = mockProducts.filter(function(p) { return p.category === selectedCategory.value; });
    }

    filteredProducts.forEach(function (p) {
        var tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.innerHTML =
            '<td style="padding:16px 16px 16px 32px;"><p style="font-weight:600;color:#1e293b;margin:0;font-size:0.9rem;">' + p.name + '</p></td>' +
            '<td style="padding:16px;"><span style="background:#f1f5f9;padding:3px 8px;border-radius:6px;font-size:0.8rem;color:#475569;">' + p.category + '</span></td>' +
            '<td style="padding:16px;color:#334155;font-weight:600;font-size:0.9rem;">&#8377;' + p.price + '</td>' +
            '<td style="padding:16px;">' + stockBadge(p.stock) + '</td>' +
            '<td style="padding:16px;">' + statusBadge(p.status) + '</td>' +
            '<td style="padding:16px;position:relative;">' +
                '<button class="tb-action-btn action-menu-btn" onclick="toggleDropdown(this)" title="Actions">' +
                    'Actions <i data-feather="chevron-down" style="width:14px;height:14px;margin-left:4px;"></i>' +
                '</button>' +
                '<div class="action-dropdown" style="display:none;position:absolute;right:20px;top:40px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);width:165px;z-index:100;padding:4px 0;">' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#334155;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">Edit Product</button>' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#334155;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">Adjust Stock</button>' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#334155;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">Deactivate</button>' +
                    '<hr style="margin:4px 0;border:none;border-top:1px solid #f1f5f9;">' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#ef4444;cursor:pointer;" onmouseover="this.style.background=\'#fff5f5\'" onmouseout="this.style.background=\'none\'" onclick="deleteProduct(\'' + p.id + '\')">Delete Product</button>' +
                '</div>' +
            '</td>';
        tbody.appendChild(tr);
    });
    feather.replace();
}

function renderFilterOptions() {
    var filterContainer = document.getElementById('categoryFilterOptions');
    if (!filterContainer) return;

    // Get unique categories
    var categories = [...new Set(mockProducts.map(p => p.category))];

    var html = '<label class="filter-option">' +
               '<input type="radio" name="filterCategory" value="all" checked>' +
               '<span>All Categories</span>' +
               '</label>';

    categories.forEach(function(cat) {
        html += '<label class="filter-option">' +
                '<input type="radio" name="filterCategory" value="' + cat + '">' +
                '<span>' + cat + '</span>' +
                '</label>';
    });

    filterContainer.innerHTML = html;
}

function renderCategoriesTable() {
    var tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    mockCategories.forEach(function (c) {
        var tr = document.createElement('tr');
        tr.className = 'tb-row';
        tr.innerHTML =
            '<td style="padding:16px 16px 16px 32px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<div style="width:36px;height:36px;border-radius:8px;background:#e0e7ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">' + c.name.charAt(0) + '</div>' +
                    '<div><p style="font-weight:600;color:#1e293b;margin:0;font-size:0.9rem;">' + c.name + '</p></div>' +
                '</div>' +
            '</td>' +
            '<td style="padding:16px;"><span style="font-size:0.9rem;font-weight:700;color:#334155;">' + c.productCount + '</span><span style="font-size:0.8rem;color:#94a3b8;margin-left:5px;">items</span></td>' +
            '<td style="padding:16px;">' + statusBadge(c.status) + '</td>' +
            '<td style="padding:16px;position:relative;">' +
                '<button class="tb-action-btn action-menu-btn" onclick="toggleDropdown(this)" title="Actions">' +
                    'Actions <i data-feather="chevron-down" style="width:14px;height:14px;margin-left:4px;"></i>' +
                '</button>' +
                '<div class="action-dropdown" style="display:none;position:absolute;right:20px;top:40px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);width:150px;z-index:100;padding:4px 0;">' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#334155;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">Edit Category</button>' +
                    '<hr style="margin:4px 0;border:none;border-top:1px solid #f1f5f9;">' +
                    '<button style="width:100%;text-align:left;padding:9px 16px;background:none;border:none;font-size:0.84rem;color:#ef4444;cursor:pointer;" onmouseover="this.style.background=\'#fff5f5\'" onmouseout="this.style.background=\'none\'" onclick="deleteCategory(\'' + c.id + '\',' + c.productCount + ')">Delete Category</button>' +
                '</div>' +
            '</td>';
        tbody.appendChild(tr);
    });
    feather.replace();
}

// ── Dropdown ───────────────────────────────────────────────────────────────
window.toggleDropdown = function (btn) {
    var dropdown = btn.nextElementSibling;
    var isVisible = dropdown.style.display === 'block';
    // Close all
    document.querySelectorAll('.action-dropdown').forEach(function (d) { d.style.display = 'none'; });
    if (!isVisible) dropdown.style.display = 'block';
};

document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-menu-btn') && !e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.action-dropdown').forEach(function (d) { d.style.display = 'none'; });
    }

    // Filter dropdown toggle
    var filterMenu = document.getElementById('filterMenu');
    var filterBtn = document.getElementById('filterBtn');
    if (filterMenu && filterBtn) {
        if (filterBtn.contains(e.target)) {
            filterMenu.classList.toggle('show');
        } else if (!filterMenu.contains(e.target)) {
            filterMenu.classList.remove('show');
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    var applyFilters = document.getElementById('applyFilters');
    if (applyFilters) {
        applyFilters.addEventListener('click', function() {
            renderProductsTable();
            document.getElementById('filterMenu').classList.remove('show');
        });
    }

    var resetFilters = document.getElementById('resetFilters');
    if (resetFilters) {
        resetFilters.addEventListener('click', function() {
            var allCatRadio = document.querySelector('input[name="filterCategory"][value="all"]');
            if (allCatRadio) allCatRadio.checked = true;
            renderProductsTable();
            document.getElementById('filterMenu').classList.remove('show');
        });
    }
});

window.deleteProduct = function (id) {
    showToast('Delete product (demo only)');
};

window.deleteCategory = function (id, count) {
    if (count > 0) {
        showToast('Cannot delete — category has products. Reassign them first.', true);
    } else {
        showToast('Category deleted (demo only)');
    }
};

// ── Modals ─────────────────────────────────────────────────────────────────
function initModals() {
    ['addProductModalOverlay', 'addCategoryModalOverlay'].forEach(function (oid) {
        var overlay = document.getElementById(oid);
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeAllModals();
            });
        }
    });

    ['closeAddProductModal','cancelAddProduct','closeAddCategoryModal','cancelAddCategory'].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', closeAllModals);
    });

    var saveP = document.getElementById('saveProductBtn');
    if (saveP) saveP.addEventListener('click', function () { showToast('Product saved!'); closeAllModals(); });

    var saveC = document.getElementById('saveCategoryBtn');
    if (saveC) saveC.addEventListener('click', function () { showToast('Category saved!'); closeAllModals(); });
}

function openAddProductModal() {
    document.getElementById('addProductModalOverlay').classList.add('active');
    feather.replace();
}

function openAddCategoryModal() {
    document.getElementById('addCategoryModalOverlay').classList.add('active');
    feather.replace();
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(function (el) { el.classList.remove('active'); });
}

// ── Status Toggles ─────────────────────────────────────────────────────────
window.selectStatus = function (val) {
    var activeBtn   = document.getElementById('statusActiveBtn');
    var inactiveBtn = document.getElementById('statusInactiveBtn');
    if (!activeBtn) return;
    if (val === 'Active') {
        activeBtn.style.borderColor   = '#1e3a8a'; activeBtn.style.background   = '#eff6ff'; activeBtn.style.color   = '#1e3a8a';
        inactiveBtn.style.borderColor = '#e2e8f0'; inactiveBtn.style.background = '#f8fafc'; inactiveBtn.style.color = '#64748b';
    } else {
        inactiveBtn.style.borderColor = '#1e3a8a'; inactiveBtn.style.background = '#eff6ff'; inactiveBtn.style.color = '#1e3a8a';
        activeBtn.style.borderColor   = '#e2e8f0'; activeBtn.style.background   = '#f8fafc'; activeBtn.style.color   = '#64748b';
    }
    document.getElementById('statusActive').checked   = (val === 'Active');
    document.getElementById('statusInactive').checked = (val === 'Inactive');
};

window.selectCatStatus = function (val) {
    var activeBtn   = document.getElementById('catStatusActiveBtn');
    var inactiveBtn = document.getElementById('catStatusInactiveBtn');
    if (!activeBtn) return;
    if (val === 'Active') {
        activeBtn.style.borderColor   = '#1e3a8a'; activeBtn.style.background   = '#eff6ff'; activeBtn.style.color   = '#1e3a8a';
        inactiveBtn.style.borderColor = '#e2e8f0'; inactiveBtn.style.background = '#f8fafc'; inactiveBtn.style.color = '#64748b';
    } else {
        inactiveBtn.style.borderColor = '#1e3a8a'; inactiveBtn.style.background = '#eff6ff'; inactiveBtn.style.color = '#1e3a8a';
        activeBtn.style.borderColor   = '#e2e8f0'; activeBtn.style.background   = '#f8fafc'; activeBtn.style.color   = '#64748b';
    }
};

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, isError) {
    var existing = document.getElementById('productsToast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'productsToast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:28px;right:28px;padding:12px 20px;border-radius:10px;font-size:0.9rem;font-weight:500;z-index:9999;color:#fff;' +
        'background:' + (isError ? '#ef4444' : '#10b981') + ';box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;opacity:1;';
    document.body.appendChild(toast);

    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 350);
    }, 3000);
}
