/**
 * BharathBots Salon SaaS - Offers Page UI Interactions
 * Extracted from offers.html
 */

// Toggle dropdown for table action buttons
export function toggleDropdown(button) {
    if (!button) return;
    const dropdownContent = button.nextElementSibling;
    const allDropdowns = document.querySelectorAll('.dropdown-content');
    allDropdowns.forEach(dd => {
        if (dd !== dropdownContent) dd.style.display = 'none';
    });
    if (dropdownContent) {
        dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
    }
}

// Ensure toggleDropdown is globally available for inline or dynamic callers
window.toggleDropdown = toggleDropdown;

// Close all dropdowns when clicking outside
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropbtn')) {
        document.querySelectorAll('.dropdown-content').forEach(dd => {
            dd.style.display = 'none';
        });
    }

    // Also close filter panel if click is outside the container
    const filterContainer = document.getElementById('offersFilterContainer');
    const filterPanel = document.getElementById('offersFilterPanel');
    if (filterPanel && filterContainer && !filterContainer.contains(e.target)) {
        filterPanel.style.display = 'none';
    }
});

function initOffersUI() {
    // Init Feather Icons
    if (window.feather) {
        feather.replace();
    }

    // Offers modal helper bindings
    const btnCreateOffer = document.getElementById('btnCreateOffer');
    const overlayCreateOffer = document.getElementById('offerModalOverlay');
    const btnCloseCreateOffer = document.getElementById('closeOfferModal');
    const btnCancelCreateOffer = document.getElementById('btnCancelOffer');

    if (btnCreateOffer && overlayCreateOffer) {
        btnCreateOffer.addEventListener('click', () => {
            overlayCreateOffer.classList.add('active');
        });
    }

    const closeOfferModal = () => {
        if (overlayCreateOffer) {
            overlayCreateOffer.classList.remove('active');
        }
    };

    if (btnCloseCreateOffer) btnCloseCreateOffer.addEventListener('click', closeOfferModal);
    if (btnCancelCreateOffer) btnCancelCreateOffer.addEventListener('click', closeOfferModal);

    // Close when clicking outside modal box
    if (overlayCreateOffer) {
        overlayCreateOffer.addEventListener('click', (e) => {
            if (e.target === overlayCreateOffer) {
                closeOfferModal();
            }
        });
    }

    // Toggle Flat vs Percentage
    const discountTypeSelect = document.getElementById('offerDiscountType');
    const discountValueInput = document.getElementById('offerDiscountValue');

    if (discountTypeSelect && discountValueInput) {
        discountTypeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'percentage') {
                discountValueInput.placeholder = "e.g., 20";
            } else {
                discountValueInput.placeholder = "e.g., 200";
            }
        });
    }

    // Filter panel logic
    const btnFilterOffers = document.getElementById('btnFilterOffers');
    const offersFilterPanel = document.getElementById('offersFilterPanel');
    const btnCloseOffersFilter = document.getElementById('btnCloseOffersFilter');
    const btnOffersFilterReset = document.getElementById('btnOffersFilterReset');
    const btnOffersFilterApply = document.getElementById('btnOffersFilterApply');

    if (btnFilterOffers && offersFilterPanel) {
        btnFilterOffers.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = offersFilterPanel.style.display === 'block';
            offersFilterPanel.style.display = isOpen ? 'none' : 'block';
            if (window.feather) feather.replace();
        });
    }

    if (btnCloseOffersFilter && offersFilterPanel) {
        btnCloseOffersFilter.addEventListener('click', () => {
            offersFilterPanel.style.display = 'none';
        });
    }

    if (btnOffersFilterReset && offersFilterPanel) {
        btnOffersFilterReset.addEventListener('click', () => {
            offersFilterPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            offersFilterPanel.querySelectorAll('input[type="radio"]').forEach(rb => rb.checked = false);
        });
    }

    if (btnOffersFilterApply && offersFilterPanel) {
        btnOffersFilterApply.addEventListener('click', () => {
            offersFilterPanel.style.display = 'none';
            // Placeholder: collect filter values and apply to table here
        });
    }

    // Prevent clicks inside the panel from closing it
    if (offersFilterPanel) {
        offersFilterPanel.addEventListener('click', (e) => e.stopPropagation());
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOffersUI);
} else {
    initOffersUI();
}
