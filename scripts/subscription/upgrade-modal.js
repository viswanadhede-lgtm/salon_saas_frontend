/**
 * Manages the generic "Upgrade Required" modal for feature locking.
 * This file strictly handles UI and DOM manipulation for the modal.
 * It contains no subscription logic.
 */

const BILLING_PAGE = 'billing-subscription.html';

let requestedFeature = null;
let initialized = false;

/**
 * Returns the currently requested feature that triggered the modal.
 * @returns {string|null}
 */
export function getRequestedFeature() {
    return requestedFeature;
}

/**
 * Checks whether the upgrade modal is currently open.
 * @returns {boolean}
 */
export function isUpgradeModalOpen() {
    return requestedFeature !== null;
}

/**
 * Displays the upgrade modal for a specific feature.
 * 
 * @param {string} featureKey - The identifier of the feature requesting an upgrade.
 */
export function showUpgradeModal(featureKey) {
    const modal = document.getElementById('upgradeModal');
    if (!modal) {
        console.warn('Upgrade modal DOM element not found.');
        return;
    }

    requestedFeature = featureKey;

    // Optional: If there's a specific message container, update it
    const messageContainer = modal.querySelector('.upgrade-message');
    if (messageContainer) {
        messageContainer.textContent = `This feature (${featureKey}) is not available in your current plan. Upgrade to access it.`;
    }

    // Typical modal display class toggle (adjust based on your CSS framework)
    modal.classList.add('active'); // Example
    modal.style.display = 'flex';  // Example fallback
}

/**
 * Hides the upgrade modal and clears stored state.
 */
export function hideUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;

    requestedFeature = null;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

/**
 * Initialization: Attaches event listeners to the modal buttons if the modal exists.
 * We self-execute this check on script load.
 */
function initUpgradeModal() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachListeners);
    } else {
        attachListeners();
    }
}

function attachListeners() {
    if (initialized) return;
    
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;

    initialized = true;

    // Assuming close buttons exist. Adjust selectors based on your actual HTML structure.
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('#btnCancelUpgrade') || modal.querySelector('.btn-cancel');
    const upgradeBtn = modal.querySelector('#btnUpgradePlan') || modal.querySelector('.btn-upgrade');

    if (closeBtn) closeBtn.addEventListener('click', hideUpgradeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideUpgradeModal);
    
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
             // Redirect user to the billing settings page
             window.location.href = BILLING_PAGE;
        });
    }

    // Optional: Close on backdrop click (if your modal CSS uses an overlay structure)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideUpgradeModal();
        }
    });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && requestedFeature !== null) {
            hideUpgradeModal();
        }
    });
}

// Run initialization
initUpgradeModal();
