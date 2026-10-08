/**
 * BharathBots Salon SaaS - Customers Page UI Interactions
 * Extracted from customers.html
 */

export function initCustomersUI() {
    // Init Feather Icons
    if (window.feather) {
        feather.replace();
    }

    // Filter Dropdown
    const filterBtn = document.getElementById('customerFilterBtn');
    const filterDropdown = document.getElementById('customerFilterDropdown');
    const filterLabel = document.getElementById('customerFilterLabel');
    const filterOptions = document.querySelectorAll('.filter-option');

    function openDropdown() {
        if (!filterBtn || !filterDropdown) return;
        filterBtn.classList.add('open');
        filterDropdown.classList.add('open');
        if (window.feather) feather.replace(); // re-init any icons inside dropdown
    }

    function closeDropdown() {
        if (!filterBtn || !filterDropdown) return;
        filterBtn.classList.remove('open');
        filterDropdown.classList.remove('open');
    }

    if (filterBtn && filterDropdown) {
        filterBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            filterDropdown.classList.contains('open') ? closeDropdown() : openDropdown();
        });
    }

    filterOptions.forEach(function (option) {
        option.addEventListener('click', function () {
            // Remove active from all
            filterOptions.forEach(o => o.classList.remove('active'));
            // Set active on clicked
            option.classList.add('active');
            // Update button label
            const tag = option.dataset.tag;
            if (filterLabel) {
                filterLabel.textContent = tag === 'all' ? 'Filter' : option.textContent.trim();
            }
            closeDropdown();
            if (typeof window.applyCustomerFilter === 'function') {
                window.applyCustomerFilter(tag);
            } else if (typeof applyCustomerFilter === 'function') {
                applyCustomerFilter(tag);
            }
        });
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
        const wrap = document.getElementById('customerFilterWrap');
        if (wrap && !wrap.contains(e.target)) {
            closeDropdown();
        }
    });

    // Add Customer Button - wired to global modal
    const btnAddCustomer = document.getElementById('btnAddCustomer');
    if (btnAddCustomer) {
        btnAddCustomer.addEventListener('click', function () {
            if (typeof window.openGlobalAddCustomerModal === 'function') {
                window.openGlobalAddCustomerModal(function () {
                    // Refresh the customer table after creation
                    if (typeof window.fetchCustomers === 'function') {
                        window.fetchCustomers();
                    } else if (typeof fetchCustomers === 'function') {
                        fetchCustomers();
                    }
                });
            }
        });
    }
}

// Safe readyState initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomersUI);
} else {
    initCustomersUI();
}
